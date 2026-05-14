import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { AnnualWorkflowState, PmsTemplateStatus, QuarterWorkflowState } from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';

type QuarterCode = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface AssignEmployeeInput {
  employeeId: string;
  managerId: string;
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
    annualCycleId: string,
    input: AssignEmployeeInput,
  ): Promise<AssignEmployeeResult> {
    this.assertAdmin('assignment.create');
    this.validateAssignmentInput(input);

    const annualCycle = await AnnualCycle.findById(annualCycleId);
    if (!annualCycle) {
      throw new Error('Annual cycle not found');
    }

    const employeeObjectId = this.toObjectId(input.employeeId, 'employeeId');
    const managerObjectId = this.toObjectId(input.managerId, 'managerId');

    const existingAssignment = await AnnualAssignment.findOne({
      employeeId: employeeObjectId,
      annualCycleId: annualCycle._id,
    });

    if (existingAssignment) {
      throw new Error('Annual assignment already exists for this employee and cycle');
    }

    const annualAssignment = await AnnualAssignment.create({
      employeeId: employeeObjectId,
      managerId: managerObjectId,
      annualCycleId: annualCycle._id,
      templateVersionId: annualCycle.templateVersionId,
      workflowState: AnnualWorkflowState.DRAFT,
      finalDecisionStatus: AnnualWorkflowState.DRAFT,
    });

    const quarterAssignments = await QuarterAssignment.insertMany(
      this.buildQuarterAssignments(annualAssignment._id, employeeObjectId, managerObjectId),
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
    employeeId: Types.ObjectId,
    managerId: Types.ObjectId,
  ): Array<{
    annualAssignmentId: Types.ObjectId;
    employeeId: Types.ObjectId;
    managerId: Types.ObjectId;
    quarter: QuarterCode;
    workflowState: QuarterWorkflowState;
  }> {
    return (['Q1', 'Q2', 'Q3', 'Q4'] as QuarterCode[]).map((quarter) => ({
      annualAssignmentId,
      employeeId,
      managerId,
      quarter,
      workflowState: QuarterWorkflowState.NOT_STARTED,
    }));
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
