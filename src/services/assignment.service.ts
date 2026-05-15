import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualDecisionStatus,
  AnnualWorkflowState,
  PmsTemplateStatus,
  QuarterWorkflowState,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { User } from '../models/user.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';

type QuarterCode = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface AssignEmployeeInput {
  employeeId: string;
  managerId: string;
  applicableQuarters?: QuarterCode[];
  assignmentReason?: string;
}

export interface AssignEmployeeResult {
  annualAssignment: IAnnualAssignment;
  quarterAssignments: IQuarterAssignment[];
}

export class AssignmentService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async assignEmployee(
    cycleId: string,
    input: AssignEmployeeInput,
  ): Promise<AssignEmployeeResult> {
    this.assertAdmin('assignment.create');
    this.validateAssignmentInput(input);

    const annualCycle = await AnnualCycle.findById(cycleId);
    if (!annualCycle) {
      throw new Error('Annual cycle not found');
    }

    const employeeObjectId = this.toObjectId(input.employeeId, 'employeeId');
    const managerObjectId = this.toObjectId(input.managerId, 'managerId');
    const applicableQuarters = this.normalizeApplicableQuarters(input.applicableQuarters);
    const { employeeSnapshot, managerSnapshot, orgSnapshot } = await this.buildAssignmentSnapshots(
      employeeObjectId,
      managerObjectId,
    );

    const existingAssignment = await AnnualAssignment.findOne({
      employeeId: employeeObjectId,
      cycleId: annualCycle._id,
    });

    if (existingAssignment) {
      throw new Error('Annual assignment already exists for this employee and cycle');
    }

    const annualAssignment = await AnnualAssignment.create({
      employeeId: employeeObjectId,
      assignedManagerId: managerObjectId,
      cycleId: annualCycle._id,
      templateVersionId: annualCycle.templateVersionId,
      annualState: AnnualWorkflowState.DRAFT,
      finalDecisionStatus: AnnualDecisionStatus.DRAFT,
      applicableQuarters,
      assignmentReason: input.assignmentReason ?? 'FULL_YEAR',
      employeeSnapshot,
      managerSnapshot,
      orgSnapshot,
      createdBy: this.actorIdObject(),
    });

    const quarterCycles = await QuarterCycle.find({
      cycleId: annualCycle._id,
      quarterCode: { $in: applicableQuarters },
    }).lean();
    const quarterCycleByCode = new Map(
      quarterCycles.map((quarterCycle) => [quarterCycle.quarterCode, quarterCycle._id as Types.ObjectId]),
    );

    const quarterAssignments = await QuarterAssignment.insertMany(
      this.buildQuarterAssignments(
        annualAssignment._id,
        annualCycle._id,
        employeeObjectId,
        managerObjectId,
        applicableQuarters,
        quarterCycleByCode,
      ),
    );

    annualAssignment.quarterAssignmentIds = quarterAssignments.map(
      (quarterAssignment) => quarterAssignment._id,
    );
    await annualAssignment.save();

    if (annualCycle.templateVersionId) {
      await this.lockTemplateVersion(annualCycle.templateVersionId);
    }

    await this.audit(
      'PMS_EMPLOYEE_ASSIGNED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      undefined,
      {
        annualAssignment,
        quarterAssignmentIds: annualAssignment.quarterAssignmentIds,
      },
    );

    return { annualAssignment, quarterAssignments };
  }

  private buildQuarterAssignments(
    annualAssignmentId: Types.ObjectId,
    cycleId: Types.ObjectId,
    employeeId: Types.ObjectId,
    managerId: Types.ObjectId,
    applicableQuarters: QuarterCode[],
    quarterCycleByCode: Map<QuarterCode, Types.ObjectId>,
  ): Array<{
    annualAssignmentId: Types.ObjectId;
    cycleId: Types.ObjectId;
    employeeId: Types.ObjectId;
    assignedManagerId: Types.ObjectId;
    cycleQuarterId: Types.ObjectId;
    quarterCode: QuarterCode;
    quarterState: QuarterWorkflowState;
    createdBy?: Types.ObjectId;
  }> {
    return applicableQuarters.map((quarterCode) => {
      const cycleQuarterId = quarterCycleByCode.get(quarterCode);
      if (!cycleQuarterId) {
        throw new Error(`Quarter cycle not found for ${quarterCode}`);
      }

      return {
        annualAssignmentId,
        cycleId,
        cycleQuarterId,
        employeeId,
        assignedManagerId: managerId,
        quarterCode,
        quarterState: QuarterWorkflowState.NOT_STARTED,
        createdBy: this.actorIdObject(),
      };
    });
  }

  private async lockTemplateVersion(templateVersionId: Types.ObjectId): Promise<void> {
    const templateVersion = await PmsTemplateVersion.findById(templateVersionId);
    if (!templateVersion) {
      throw new Error('Cycle template version not found');
    }

    if (templateVersion.status !== PmsTemplateStatus.ACTIVE) {
      throw new Error('Only active template versions can be assigned');
    }

    if (!templateVersion.isLocked) {
      templateVersion.isLocked = true;
      templateVersion.lockedAt = new Date();
      templateVersion.updatedBy = this.actorIdObject();
      await templateVersion.save();
    }
  }

  private validateAssignmentInput(input: AssignEmployeeInput): void {
    if (!input.employeeId) {
      throw new Error('employeeId is required');
    }

    if (!input.managerId) {
      throw new Error('managerId is required');
    }

    if (input.employeeId === input.managerId) {
      throw new Error('employeeId and managerId cannot be the same');
    }
  }

  private normalizeApplicableQuarters(quarters?: QuarterCode[]): QuarterCode[] {
    const allowedQuarters: QuarterCode[] = ['Q1', 'Q2', 'Q3', 'Q4'];
    const normalized = quarters?.length ? quarters : allowedQuarters;
    const seen = new Set<QuarterCode>();

    for (const quarter of normalized) {
      if (!allowedQuarters.includes(quarter)) {
        throw new Error(`Invalid applicable quarter: ${quarter}`);
      }
      if (seen.has(quarter)) {
        throw new Error(`Duplicate applicable quarter: ${quarter}`);
      }
      seen.add(quarter);
    }

    return allowedQuarters.filter((quarter) => seen.has(quarter));
  }

  private async buildAssignmentSnapshots(
    employeeId: Types.ObjectId,
    managerId: Types.ObjectId,
  ): Promise<{
    employeeSnapshot: Record<string, unknown>;
    managerSnapshot: Record<string, unknown>;
    orgSnapshot: Record<string, unknown>;
  }> {
    const [employee, manager] = await Promise.all([
      User.findById(employeeId)
        .select('employeeCode name email role specificRole departmentId location joiningDate separationDate employmentStatus managerId managerName')
        .lean(),
      User.findById(managerId)
        .select('employeeCode name email role specificRole departmentId location')
        .lean(),
    ]);

    if (!employee) {
      throw new Error('Employee not found');
    }

    if (!manager) {
      throw new Error('Manager not found');
    }

    return {
      employeeSnapshot: {
        employeeCode: employee.employeeCode,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        specificRole: employee.specificRole,
        departmentId: employee.departmentId,
        location: employee.location,
        joiningDate: employee.joiningDate,
        separationDate: employee.separationDate,
        employmentStatus: employee.employmentStatus,
      },
      managerSnapshot: {
        managerId: manager._id,
        employeeCode: manager.employeeCode,
        name: manager.name,
        email: manager.email,
        role: manager.role,
        specificRole: manager.specificRole,
      },
      orgSnapshot: {
        departmentId: employee.departmentId,
        location: employee.location,
        reportingManagerId: manager._id,
      },
    };
  }

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Invalid ${fieldName}`);
    }

    return new Types.ObjectId(value);
  }

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
  }

  private assertAdmin(action: string): void {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const access = accessService.canPerform({
      actor: {
        actorId: user._id.toString(),
        actorRole: user.role,
      },
      action,
      requiresAdmin: true,
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
  ): Promise<void> {
    const user = this.context.user;
    if (!user) return;

    await auditService.createAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action,
      entityType,
      entityId,
      previousValue,
      newValue,
    });
  }
}
