import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualDecisionStatus,
  AnnualWorkflowState,
  normalizePmsRole,
  ObjectiveSource,
  ObjectiveStatus,
  PmsRole,
  PmsTemplateSectionType,
  PmsTemplateStatus,
  QuarterWorkflowState,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { AssignmentExceptionQueue } from '../models/pms-assignment-exception-queue.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import { Reassignment } from '../models/pms-reassignment.model';
import { Objective } from '../models/pms-objective.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { User } from '../models/user.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
import type {
  ITemplatePredefinedObjective,
  ITemplateSection,
} from '../models/pms-template-version.model';

type QuarterCode = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface AssignEmployeeInput {
  employeeId: string;
  managerId?: string;
  applicableQuarters?: QuarterCode[];
  assignmentReason?: string;
}

export interface AssignEmployeeResult {
  annualAssignment: IAnnualAssignment;
  quarterAssignments: IQuarterAssignment[];
}

export interface AssignmentListQuery {
  page?: number | string;
  limit?: number | string;
  search?: string;
  annualState?: string;
  managerId?: string;
  employeeId?: string;
}

export interface BulkAssignInput {
  assignments: AssignEmployeeInput[];
  continueOnError?: boolean;
}

export interface BulkAssignmentRecordResult {
  employeeId?: string;
  managerId?: string;
  status: 'CREATED' | 'SKIPPED' | 'FAILED' | 'EXCEPTION';
  message: string;
  annualAssignmentId?: string;
  quarterAssignmentIds?: string[];
  exceptionId?: string;
}

export interface BulkAssignResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  exceptions: number;
  results: BulkAssignmentRecordResult[];
}

export interface ReassignManagerInput {
  managerId: string;
  reason: string;
  applicableQuarters?: QuarterCode[];
}

export interface AssignmentStateInput {
  reason: string;
}

export interface ResolveExceptionInput {
  resolution: string;
}

export class AssignmentService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async listAssignments(cycleId: string, query: AssignmentListQuery = {}): Promise<{
    items: unknown[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const annualCycleId = this.toObjectId(cycleId, 'cycleId');
    await this.assertCycleExists(annualCycleId);

    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const filter: Record<string, unknown> = {
      cycleId: annualCycleId,
      isDeleted: false,
    };

    this.applyScopedAssignmentFilter(filter);

    if (query.annualState && query.annualState !== 'ALL') {
      filter.annualState = query.annualState;
    }

    if (query.managerId) {
      filter.assignedManagerId = this.toObjectId(query.managerId, 'managerId');
    }

    if (query.employeeId) {
      filter.employeeId = this.toObjectId(query.employeeId, 'employeeId');
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$or = [
        { 'employeeSnapshot.name': { $regex: search, $options: 'i' } },
        { 'employeeSnapshot.email': { $regex: search, $options: 'i' } },
        { 'employeeSnapshot.employeeCode': { $regex: search, $options: 'i' } },
        { 'managerSnapshot.name': { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      AnnualAssignment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AnnualAssignment.countDocuments(filter),
    ]);

    const assignmentIds = items.map((item) => item._id);
    const [quarterAssignments, reassignments] = await Promise.all([
      QuarterAssignment.find({
        annualAssignmentId: { $in: assignmentIds },
        isDeleted: false,
      }).sort({ quarterCode: 1 }).lean(),
      Reassignment.find({
        annualAssignmentId: { $in: assignmentIds },
        isDeleted: false,
      }).sort({ effectiveFrom: -1 }).lean(),
    ]);

    const quartersByAssignment = new Map<string, unknown[]>();
    for (const quarterAssignment of quarterAssignments) {
      const key = quarterAssignment.annualAssignmentId.toString();
      quartersByAssignment.set(key, [
        ...(quartersByAssignment.get(key) ?? []),
        quarterAssignment,
      ]);
    }

    const historyByAssignment = new Map<string, unknown[]>();
    for (const reassignment of reassignments) {
      const key = reassignment.annualAssignmentId.toString();
      historyByAssignment.set(key, [
        ...(historyByAssignment.get(key) ?? []),
        reassignment,
      ]);
    }

    return {
      items: items.map((item) => ({
        ...item,
        quarterAssignments: quartersByAssignment.get(item._id.toString()) ?? [],
        assignmentHistory: historyByAssignment.get(item._id.toString()) ?? [],
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
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
    const managerObjectId = this.toObjectId(input.managerId ?? '', 'managerId');
    const applicableQuarters = this.normalizeApplicableQuarters(input.applicableQuarters);
    const { employeeSnapshot, managerSnapshot, orgSnapshot } = await this.buildAssignmentSnapshots(
      employeeObjectId,
      managerObjectId,
    );
    this.validateEmployeeEligibility(employeeSnapshot);

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
    await this.seedPredefinedObjectives(annualAssignment, quarterAssignments);

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

  async bulkAssign(cycleId: string, input: BulkAssignInput): Promise<BulkAssignResult> {
    this.assertAdmin('assignment.bulkCreate');
    if (!Array.isArray(input.assignments) || input.assignments.length === 0) {
      throw new Error('assignments are required');
    }

    const results: BulkAssignmentRecordResult[] = [];
    const seenEmployees = new Set<string>();

    for (const assignment of input.assignments) {
      const employeeId = assignment.employeeId;
      const managerId = assignment.managerId;

      if (!employeeId) {
        results.push({
          status: 'FAILED',
          message: 'employeeId is required',
        });
        continue;
      }

      if (seenEmployees.has(employeeId)) {
        results.push({
          employeeId,
          managerId,
          status: 'SKIPPED',
          message: 'Duplicate employee in bulk request',
        });
        continue;
      }
      seenEmployees.add(employeeId);

      if (!managerId) {
        const exception = await this.createAssignmentException(
          cycleId,
          employeeId,
          'MISSING_MANAGER',
          'Manager is required before assignment can be created',
          assignment,
        );
        results.push({
          employeeId,
          status: 'EXCEPTION',
          message: 'Missing manager exception queued',
          exceptionId: exception._id.toString(),
        });
        continue;
      }

      try {
        const result = await this.assignEmployee(cycleId, assignment);
        results.push({
          employeeId,
          managerId,
          status: 'CREATED',
          message: 'Assignment created',
          annualAssignmentId: result.annualAssignment._id.toString(),
          quarterAssignmentIds: result.quarterAssignments.map((quarter) => quarter._id.toString()),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Assignment failed';
        results.push({
          employeeId,
          managerId,
          status: message.includes('already exists') ? 'SKIPPED' : 'FAILED',
          message,
        });

        if (input.continueOnError === false) {
          break;
        }
      }
    }

    return {
      total: results.length,
      created: results.filter((result) => result.status === 'CREATED').length,
      skipped: results.filter((result) => result.status === 'SKIPPED').length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      exceptions: results.filter((result) => result.status === 'EXCEPTION').length,
      results,
    };
  }

  async getAssignment(assignmentId: string): Promise<{
    annualAssignment: IAnnualAssignment;
    quarterAssignments: IQuarterAssignment[];
    assignmentHistory: unknown[];
  }> {
    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    this.assertAssignmentAccess('assignment.detail', annualAssignment);

    const [quarterAssignments, assignmentHistory] = await Promise.all([
      QuarterAssignment.find({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }).sort({ quarterCode: 1 }),
      Reassignment.find({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }).sort({ effectiveFrom: -1 }),
    ]);

    return { annualAssignment, quarterAssignments, assignmentHistory };
  }

  async reassignManager(
    assignmentId: string,
    input: ReassignManagerInput,
  ): Promise<{
    annualAssignment: IAnnualAssignment;
    reassignment: unknown;
    updatedQuarterAssignments: IQuarterAssignment[];
    preservedQuarterAssignments: IQuarterAssignment[];
  }> {
    this.assertAdmin('assignment.reassignManager');
    if (!input.reason?.trim()) {
      throw new Error('Reassignment reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    const newManagerId = this.toObjectId(input.managerId, 'managerId');
    if (annualAssignment.assignedManagerId.toString() === newManagerId.toString()) {
      throw new Error('New manager must be different from current manager');
    }

    const [, manager] = await Promise.all([
      User.findById(annualAssignment.employeeId).lean(),
      User.findById(newManagerId)
        .select('employeeCode name email role specificRole departmentId location')
        .lean(),
    ]);

    if (!manager) {
      throw new Error('Manager not found');
    }

    const previousAssignment = annualAssignment.toObject();
    const applicableQuarters = input.applicableQuarters?.length
      ? this.normalizeApplicableQuarters(input.applicableQuarters)
      : annualAssignment.applicableQuarters;
    const quarters = await QuarterAssignment.find({
      annualAssignmentId: annualAssignment._id,
      quarterCode: { $in: applicableQuarters },
      isDeleted: false,
    });
    const mutableQuarters = quarters.filter(
      (quarter) =>
        quarter.quarterState !== QuarterWorkflowState.QUARTER_FINALIZED &&
        quarter.quarterState !== QuarterWorkflowState.CLOSED_BY_ADMIN,
    );

    const reassignment = await Reassignment.create({
      annualAssignmentId: annualAssignment._id,
      employeeId: annualAssignment.employeeId,
      fromManagerId: annualAssignment.assignedManagerId,
      toManagerId: newManagerId,
      effectiveFrom: new Date(),
      appliesTo: 'FUTURE_ACTIONS_ONLY',
      reason: input.reason.trim(),
      approvedBy: this.actorIdObject(),
      approvedAt: new Date(),
      createdBy: this.actorIdObject(),
    });

    for (const quarter of mutableQuarters) {
      quarter.assignedManagerId = newManagerId;
      quarter.updatedBy = this.actorIdObject();
      quarter.version += 1;
      await quarter.save();
    }

    annualAssignment.assignedManagerId = newManagerId;
    annualAssignment.managerSnapshot = {
      managerId: manager._id,
      employeeCode: manager.employeeCode,
      name: manager.name,
      email: manager.email,
      role: manager.role,
      specificRole: manager.specificRole,
    };
    annualAssignment.updatedBy = this.actorIdObject();
    annualAssignment.version += 1;
    await annualAssignment.save();

    await this.audit(
      'PMS_ASSIGNMENT_MANAGER_REASSIGNED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      previousAssignment,
      {
        annualAssignment,
        reassignment,
        updatedQuarterAssignmentIds: mutableQuarters.map((quarter) => quarter._id),
        preservedQuarterAssignmentIds: quarters
          .filter((quarter) => !mutableQuarters.some((mutable) => mutable._id.equals(quarter._id)))
          .map((quarter) => quarter._id),
      },
    );

    return {
      annualAssignment,
      reassignment,
      updatedQuarterAssignments: mutableQuarters,
      preservedQuarterAssignments: quarters.filter(
        (quarter) => !mutableQuarters.some((mutable) => mutable._id.equals(quarter._id)),
      ),
    };
  }

  async closeAssignment(assignmentId: string, input: AssignmentStateInput): Promise<{
    annualAssignment: IAnnualAssignment;
    quarterAssignments: IQuarterAssignment[];
  }> {
    this.assertAdmin('assignment.close');
    if (!input.reason?.trim()) {
      throw new Error('Close reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    const previousValue = annualAssignment.toObject();
    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
      quarterState: { $ne: QuarterWorkflowState.QUARTER_FINALIZED },
    });

    for (const quarterAssignment of quarterAssignments) {
      quarterAssignment.previousQuarterState = quarterAssignment.quarterState;
      quarterAssignment.quarterState = QuarterWorkflowState.CLOSED_BY_ADMIN;
      quarterAssignment.lastTransitionAt = new Date();
      quarterAssignment.lastTransitionBy = this.actorIdObject();
      quarterAssignment.lastTransitionRole = this.context.user?.role;
      quarterAssignment.lastTransitionReason = input.reason.trim();
      quarterAssignment.updatedBy = this.actorIdObject();
      quarterAssignment.version += 1;
      await quarterAssignment.save();
    }

    annualAssignment.annualState = AnnualWorkflowState.CLOSED;
    annualAssignment.updatedBy = this.actorIdObject();
    annualAssignment.version += 1;
    await annualAssignment.save();

    await this.audit(
      'PMS_ASSIGNMENT_CLOSED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      previousValue,
      { annualAssignment, reason: input.reason.trim() },
    );

    return { annualAssignment, quarterAssignments };
  }

  async reopenAssignment(assignmentId: string, input: AssignmentStateInput): Promise<{
    annualAssignment: IAnnualAssignment;
    quarterAssignments: IQuarterAssignment[];
  }> {
    this.assertAdmin('assignment.reopen');
    if (!input.reason?.trim()) {
      throw new Error('Reopen reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    if (annualAssignment.annualState !== AnnualWorkflowState.CLOSED) {
      throw new Error('Only closed assignments can be reopened');
    }

    const previousValue = annualAssignment.toObject();
    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
      quarterState: QuarterWorkflowState.CLOSED_BY_ADMIN,
    });

    for (const quarterAssignment of quarterAssignments) {
      quarterAssignment.quarterState =
        quarterAssignment.previousQuarterState ?? QuarterWorkflowState.REOPENED_BY_ADMIN;
      quarterAssignment.previousQuarterState = QuarterWorkflowState.CLOSED_BY_ADMIN;
      quarterAssignment.lastTransitionAt = new Date();
      quarterAssignment.lastTransitionBy = this.actorIdObject();
      quarterAssignment.lastTransitionRole = this.context.user?.role;
      quarterAssignment.lastTransitionReason = input.reason.trim();
      quarterAssignment.updatedBy = this.actorIdObject();
      quarterAssignment.version += 1;
      await quarterAssignment.save();
    }

    annualAssignment.annualState = AnnualWorkflowState.IN_PROGRESS;
    annualAssignment.updatedBy = this.actorIdObject();
    annualAssignment.version += 1;
    await annualAssignment.save();

    await this.audit(
      'PMS_ASSIGNMENT_REOPENED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      previousValue,
      { annualAssignment, reason: input.reason.trim() },
    );

    return { annualAssignment, quarterAssignments };
  }

  async listExceptions(cycleId: string, status = 'OPEN'): Promise<unknown[]> {
    this.assertAdmin('assignment.exceptions.list');
    const filter: Record<string, unknown> = {
      cycleId: this.toObjectId(cycleId, 'cycleId'),
      isDeleted: false,
    };
    if (status !== 'ALL') {
      filter.status = status;
    }

    return AssignmentExceptionQueue.find(filter)
      .sort({ createdAt: -1 })
      .lean();
  }

  async resolveException(exceptionId: string, input: ResolveExceptionInput): Promise<unknown> {
    this.assertAdmin('assignment.exceptions.resolve');
    if (!input.resolution?.trim()) {
      throw new Error('resolution is required');
    }

    const exception = await AssignmentExceptionQueue.findById(
      this.toObjectId(exceptionId, 'exceptionId'),
    );
    if (!exception) {
      throw new Error('Assignment exception not found');
    }

    exception.status = 'RESOLVED';
    exception.resolution = input.resolution.trim();
    exception.resolvedBy = this.actorIdObject();
    exception.resolvedAt = new Date();
    exception.updatedBy = this.actorIdObject();
    exception.version += 1;
    await exception.save();

    return exception;
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

  private async seedPredefinedObjectives(
    annualAssignment: IAnnualAssignment,
    quarterAssignments: IQuarterAssignment[],
  ): Promise<void> {
    const templateVersionId = annualAssignment.templateVersionId?.toString();
    if (!templateVersionId) {
      return;
    }

    const templateVersion = await PmsTemplateVersion.findById(templateVersionId).lean();
    if (!templateVersion) {
      return;
    }

    const actorId = this.actorIdObject();
    const objectivePayloads: Array<Record<string, unknown>> = [];

    for (const quarterAssignment of quarterAssignments) {
      const config = this.resolveTemplateObjectiveConfig(
        templateVersion.sections ?? [],
        quarterAssignment.quarterCode,
      );

      if (!config || config.predefinedObjectives.length === 0) {
        continue;
      }

      for (const [index, predefinedObjective] of config.predefinedObjectives.entries()) {
        if (!predefinedObjective.key) {
          continue;
        }

        objectivePayloads.push({
          quarterAssignmentId: quarterAssignment._id,
          annualAssignmentId: quarterAssignment.annualAssignmentId,
          cycleId: quarterAssignment.cycleId,
          quarterCode: quarterAssignment.quarterCode,
          employeeId: quarterAssignment.employeeId,
          assignedManagerId: quarterAssignment.assignedManagerId,
          objectiveNo: index + 1,
          source: ObjectiveSource.PREDEFINED,
          templateObjectiveKey: predefinedObjective.key,
          title: predefinedObjective.title,
          description: predefinedObjective.description,
          targetMetric: predefinedObjective.kpi,
          targetValue: predefinedObjective.targetValue,
          weightage: predefinedObjective.weightage,
          successCriteria: predefinedObjective.successCriteria,
          status: ObjectiveStatus.OBJECTIVE_DRAFT,
          attachments: [],
          createdByRole: 'SYSTEM',
          createdByUserId: actorId,
          createdBy: actorId,
        });
      }
    }

    if (objectivePayloads.length > 0) {
      await Objective.insertMany(objectivePayloads);
    }
  }

  private resolveTemplateObjectiveConfig(
    sections: ITemplateSection[],
    quarterCode: QuarterCode,
  ) {
    const objectiveSection = sections.find((section) => {
      if (section.sectionType !== PmsTemplateSectionType.OBJECTIVES) return false;
      if (section.level !== 'QUARTER') return false;

      const allowedQuarters = [
        ...(section.quarterScope ?? []),
        ...(section.repeatFor ?? []),
      ];

      return allowedQuarters.length === 0 || allowedQuarters.includes(quarterCode);
    });

    if (!objectiveSection?.objectiveConfig) {
      return undefined;
    }

    return {
      predefinedObjectives: (objectiveSection.objectiveConfig.predefinedObjectives ?? []).map(
        (objective: ITemplatePredefinedObjective) => ({
          key: objective.objectiveKey,
          title: objective.title,
          description: objective.description,
          kpi: objective.kpi,
          targetValue: objective.targetValue,
          weightage: objective.weightage,
          successCriteria: objective.successCriteria,
        }),
      ),
    };
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
        .select('employeeCode name email role specificRole departmentId location joiningDate separationDate employmentStatus managerId managerName active')
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
        active: employee.active,
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

  private validateEmployeeEligibility(employeeSnapshot: Record<string, unknown>): void {
    if (employeeSnapshot.active === false) {
      throw new Error('Employee is not eligible for PMS assignment because employee is inactive');
    }

    if (employeeSnapshot.separationDate) {
      const separationDate = new Date(employeeSnapshot.separationDate as string | Date);
      if (!Number.isNaN(separationDate.getTime()) && separationDate <= new Date()) {
        throw new Error('Employee is not eligible for PMS assignment because separation date has passed');
      }
    }
  }

  private async createAssignmentException(
    cycleId: string,
    employeeId: string,
    exceptionType: string,
    message: string,
    metadata?: unknown,
  ) {
    return AssignmentExceptionQueue.create({
      cycleId: this.toObjectId(cycleId, 'cycleId'),
      employeeId: this.toObjectId(employeeId, 'employeeId'),
      exceptionType,
      status: 'OPEN',
      message,
      metadata,
      createdBy: this.actorIdObject(),
    });
  }

  private async assertCycleExists(cycleId: Types.ObjectId): Promise<void> {
    const cycle = await AnnualCycle.findById(cycleId).select('_id').lean();
    if (!cycle) {
      throw new Error('Annual cycle not found');
    }
  }

  private async getAnnualAssignment(assignmentId: string): Promise<IAnnualAssignment> {
    const annualAssignment = await AnnualAssignment.findById(
      this.toObjectId(assignmentId, 'annualAssignmentId'),
    );
    if (!annualAssignment || annualAssignment.isDeleted) {
      throw new Error('Annual assignment not found');
    }
    return annualAssignment;
  }

  private applyScopedAssignmentFilter(filter: Record<string, unknown>): void {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);

    if (mappedRole === PmsRole.ADMIN || mappedRole === PmsRole.SUPER_ADMIN || mappedRole === PmsRole.MANAGEMENT) {
      return;
    }

    if (mappedRole === PmsRole.EMPLOYEE) {
      filter.employeeId = this.toObjectId(actor.actorId, 'actorId');
      return;
    }

    if (mappedRole === PmsRole.MANAGER) {
      filter.assignedManagerId = this.toObjectId(actor.actorId, 'actorId');
      return;
    }

    throw new Error('PMS access denied');
  }

  private assertAssignmentAccess(action: string, annualAssignment: IAnnualAssignment): void {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);
    if (mappedRole === PmsRole.MANAGEMENT) {
      return;
    }

    const access = accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: annualAssignment.employeeId.toString(),
        managerId: annualAssignment.assignedManagerId.toString(),
      },
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
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
    const access = accessService.canPerform({
      actor: this.requireActor(),
      action,
      requiresAdmin: true,
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private requireActor() {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    return {
      actorId: user._id.toString(),
      actorRole: user.role,
    };
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
