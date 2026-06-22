import { createHash } from 'crypto';
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
  getAssessmentTerms,
  getAssessmentTermLabel,
  getDefaultAssessmentTermType,
  TermWorkflowState,
  WorkflowEntityType,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { AssignmentExceptionQueue } from '../models/pms-assignment-exception-queue.model';
import { AuditLog } from '../models/audit-log.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import { PerformanceHistorySnapshot } from '../models/pms-performance-history-snapshot.model';
import { Reassignment } from '../models/pms-reassignment.model';
import { Objective } from '../models/pms-objective.model';
import { PmsTemplate } from '../models/pms-template.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { VisibilityConfiguration } from '../models/pms-visibility-configuration.model';
import { User } from '../models/user.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { DelegationService } from './delegation.service';
import { emailService } from './email.service';
import { transitionTermAssignmentState } from './term-assignment-workflow.service';
import { workflowService } from './workflow.service';
import { visibilityMaskService } from './visibilityMask.service';
import { getSubordinateUserIds } from '../utilis/userHierarchy';
import { AssessmentTermCode } from '../constants/pms.enums';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IAnnualCycle } from '../models/pms-annual-cycle.model';
import type { ITermAssignment } from '../models/pms-term-assignment.model';
import type {
  ITemplatePredefinedObjective,
  ITemplateSection,
} from '../models/pms-template-version.model';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
} from '../constants/pms.enums';

type QuarterCode = AssessmentTermCodeType;

export interface AssignEmployeeInput {
  employeeId: string;
  managerId?: string;
  templateVersionId?: string;
  applicableTerms?: QuarterCode[];
  assignmentReason?: string;
}

export interface AssignEmployeeResult {
  annualAssignment: IAnnualAssignment;
  termAssignments: ITermAssignment[];
}

export interface AssignmentListQuery {
  page?: number | string;
  limit?: number | string;
  search?: string;
  annualState?: string;
  managerId?: string;
  employeeId?: string;
  department?: string;
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
  termAssignmentIds?: string[];
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
  applicableTerms?: QuarterCode[];
}

export interface CancelReassignmentInput {
  reason: string;
}

export interface AssignmentStateInput {
  reason: string;
}

export interface ResolveExceptionInput {
  resolution: string;
}

const ANNUAL_DECISION_PROCESSING_STATES = new Set<AnnualWorkflowState>([
  AnnualWorkflowState.ALL_TERMS_FINALIZED,
  AnnualWorkflowState.APPRAISAL_WINDOW_OPEN,
  AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT,
  AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED,
  AnnualWorkflowState.ANNUAL_FINALIZED,
  AnnualWorkflowState.VISIBILITY_ENABLED,
  AnnualWorkflowState.COMMUNICATION_READY,
  AnnualWorkflowState.COMMUNICATION_SENT,
  AnnualWorkflowState.CLOSED,
  AnnualWorkflowState.ARCHIVED,
]);

const ANNUAL_DECISION_PROCESSING_STATUSES = new Set<AnnualDecisionStatus>([
  AnnualDecisionStatus.SUBMITTED,
  AnnualDecisionStatus.FROZEN,
  AnnualDecisionStatus.VISIBILITY_ENABLED,
  AnnualDecisionStatus.CLOSED,
]);

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

    await this.applyScopedAssignmentFilter(filter);

    if (query.annualState && query.annualState !== 'ALL') {
      filter.annualState = query.annualState;
    }

    if (query.managerId) {
      filter.assignedManagerId = this.toObjectId(query.managerId, 'managerId');
    }

    if (query.employeeId) {
      filter.employeeId = this.toObjectId(query.employeeId, 'employeeId');
    }

    if (query.department?.trim() && query.department !== 'ALL') {
      const department = query.department.trim();
      filter.$or = [
        { 'employeeSnapshot.department': department },
        { 'employeeSnapshot.departmentName': department },
        { 'employeeSnapshot.departmentId': department },
      ];
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      const searchFilter = [
        { 'employeeSnapshot.name': { $regex: search, $options: 'i' } },
        { 'employeeSnapshot.email': { $regex: search, $options: 'i' } },
        { 'employeeSnapshot.employeeCode': { $regex: search, $options: 'i' } },
        { 'managerSnapshot.name': { $regex: search, $options: 'i' } },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
        delete filter.$or;
      } else {
        filter.$or = searchFilter;
      }
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
    const [termAssignments, reassignments] = await Promise.all([
      TermAssignment.find({
        annualAssignmentId: { $in: assignmentIds },
        isDeleted: false,
      }).sort({ assessmentTermCode: 1 }).lean(),
      Reassignment.find({
        annualAssignmentId: { $in: assignmentIds },
        isDeleted: false,
      }).sort({ effectiveFrom: -1 }).lean(),
    ]);

    const quartersByAssignment = new Map<string, unknown[]>();
    for (const termAssignment of termAssignments) {
      const key = termAssignment.annualAssignmentId.toString();
      quartersByAssignment.set(key, [
        ...(quartersByAssignment.get(key) ?? []),
        termAssignment,
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

    const visConfigs = await VisibilityConfiguration.find({
      annualAssignmentId: { $in: assignmentIds },
      isDeleted: false,
    }).lean();

    const visConfigMap = new Map(
      visConfigs.map((cfg) => [cfg.annualAssignmentId.toString(), cfg])
    );

    const actorRole = this.context.user?.role ?? 'employee';
    const hasVisibilityOverride = this.context.user ? (await accessService.canPerform({
      actor: { actorId: this.context.user._id.toString(), actorRole: this.context.user.role },
      action: 'assignment.visibility.override',
      requiresAdmin: true
    })).allowed : false;

    const maskedItems = items.map((item) => {
      const visConfig = visConfigMap.get(item._id.toString());
      const maskContext = {
        actorRole,
        employeeReviewVisible: item.visibility?.employeeReviewVisible ?? false,
        employeeGradeVisible: item.visibility?.employeeGradeVisible ?? false,
        employeeMeritVisible: item.visibility?.employeeMeritVisible ?? false,
        managerGradeVisible: item.visibility?.managerGradeVisible ?? false,
        managerMeritVisible: item.visibility?.managerMeritVisible ?? false,
        visibleFrom: visConfig?.visibleFrom,
        hasVisibilityOverride,
      };

      const mappedItem = {
        ...item,
        termAssignments: quartersByAssignment.get(item._id.toString()) ?? [],
        assignmentHistory: historyByAssignment.get(item._id.toString()) ?? [],
      };

      return visibilityMaskService.mask(mappedItem, maskContext);
    });

    return {
      items: maskedItems,
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
    await this.assertAdmin('assignment.create');
    this.validateAssignmentInput(input);

    const annualCycle = await AnnualCycle.findById(cycleId);
    if (!annualCycle) {
      throw new Error('Annual cycle not found');
    }

    const employeeObjectId = this.toObjectId(input.employeeId, 'employeeId');
    const managerObjectId = this.toObjectId(input.managerId ?? '', 'managerId');
    const selectedTemplateVersionId = await this.resolveSelectedTemplateVersionId(
      input.templateVersionId,
      annualCycle,
    );
    const assessmentTermType = annualCycle.assessmentTermType ?? getDefaultAssessmentTermType();
    const allowedQuarters = getAssessmentTerms(assessmentTermType);
    const applicableTerms = this.normalizeApplicableTerms(input.applicableTerms, allowedQuarters);
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
      templateVersionId: selectedTemplateVersionId,
      annualState: AnnualWorkflowState.DRAFT,
      finalDecisionStatus: AnnualDecisionStatus.DRAFT,
      applicableTerms,
      assignmentReason: input.assignmentReason ?? 'FULL_YEAR',
      employeeSnapshot,
      managerSnapshot,
      orgSnapshot,
      createdBy: this.actorIdObject(),
    });

    const termCycles = await TermCycle.find({
      cycleId: annualCycle._id,
      assessmentTermCode: { $in: applicableTerms },
    }).lean();
    const termCycleByCode = new Map(
      termCycles.map((termCycle) => [termCycle.assessmentTermCode, termCycle._id as Types.ObjectId]),
    );
    const termCycleById = new Map(
      termCycles.map((termCycle) => [termCycle._id.toString(), termCycle]),
    );

    const termAssignments = await TermAssignment.insertMany(
      this.buildTermAssignments(
        annualAssignment._id,
        annualCycle._id,
        employeeObjectId,
        managerObjectId,
        selectedTemplateVersionId,
        assessmentTermType,
        applicableTerms,
        termCycleByCode,
      ),
    );

    annualAssignment.termAssignmentIds = termAssignments.map(
      (termAssignment) => termAssignment._id,
    );
    await annualAssignment.save();
    const seededTermAssignmentIds = await this.seedPredefinedObjectives(
      annualAssignment,
      termAssignments,
      termCycleById,
    );
    await this.openSeededTermAssignmentsForObjectiveSetting(
      termAssignments,
      seededTermAssignmentIds,
    );

    await this.lockTemplateVersion(selectedTemplateVersionId);

    await this.audit(
      'PMS_EMPLOYEE_ASSIGNED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      undefined,
      {
        annualAssignment,
        termAssignmentIds: annualAssignment.termAssignmentIds,
      },
    );

    return { annualAssignment, termAssignments };
  }

  async bulkAssign(cycleId: string, input: BulkAssignInput): Promise<BulkAssignResult> {
    await this.assertAdmin('assignment.bulkCreate');
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
          termAssignmentIds: result.termAssignments.map((quarter) => quarter._id.toString()),
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
    termAssignments: ITermAssignment[];
    assignmentHistory: unknown[];
  }> {
    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    await this.assertAssignmentAccess('assignment.detail', annualAssignment);

    const [termAssignments, assignmentHistory] = await Promise.all([
      TermAssignment.find({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }).sort({ assessmentTermCode: 1 }),
      Reassignment.find({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }).sort({ effectiveFrom: -1 }),
    ]);

    return { annualAssignment, termAssignments, assignmentHistory };
  }

  async listReassignments(
    cycleId: string,
    query: {
      employeeId?: string;
      managerId?: string;
      assignmentId?: string;
    },
  ): Promise<unknown[]> {
    await this.assertAdmin('assignment.reassignManager');

    const filter: Record<string, unknown> = {
      isDeleted: false,
    };

    if (query.assignmentId) {
      filter.annualAssignmentId = this.toObjectId(query.assignmentId, 'assignmentId');
    } else {
      const annualAssignments = await AnnualAssignment.find({
        cycleId: this.toObjectId(cycleId, 'cycleId'),
        isDeleted: false,
      })
        .select('_id')
        .lean();
      filter.annualAssignmentId = { $in: annualAssignments.map((item) => item._id) };
    }

    if (query.employeeId) {
      filter.employeeId = this.toObjectId(query.employeeId, 'employeeId');
    }

    if (query.managerId) {
      const managerObjectId = this.toObjectId(query.managerId, 'managerId');
      filter.$or = [
        { fromManagerId: managerObjectId },
        { toManagerId: managerObjectId },
      ];
    }

    return Reassignment.find(filter)
      .populate('employeeId', 'name email employeeCode')
      .populate('fromManagerId', 'name email employeeCode')
      .populate('toManagerId', 'name email employeeCode')
      .populate('approvedBy', 'name email employeeCode')
      .populate('cancelledBy', 'name email employeeCode')
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .lean();
  }

  async reassignManager(
    assignmentId: string,
    input: ReassignManagerInput,
  ): Promise<{
    annualAssignment: IAnnualAssignment;
    reassignment: unknown;
    updatedTermAssignments: ITermAssignment[];
    preservedTermAssignments: ITermAssignment[];
  }> {
    await this.assertAdmin('assignment.reassignManager');
    if (!input.reason?.trim()) {
      throw new Error('Reassignment reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    const newManagerId = this.toObjectId(input.managerId, 'managerId');
    if (annualAssignment.assignedManagerId.toString() === newManagerId.toString()) {
      throw new Error('New manager must be different from current manager');
    }

    const [employee, manager, previousManager] = await Promise.all([
      User.findById(annualAssignment.employeeId).lean(),
      User.findById(newManagerId)
        .select('employeeCode name email role specificRole departmentId location')
        .lean(),
      User.findById(annualAssignment.assignedManagerId)
        .select('employeeCode name email role specificRole departmentId location')
        .lean(),
    ]);

    if (!manager) {
      throw new Error('Manager not found');
    }

    const previousAssignment = annualAssignment.toObject();
    const applicableTerms = input.applicableTerms?.length
      ? this.normalizeApplicableTerms(input.applicableTerms, annualAssignment.applicableTerms)
      : annualAssignment.applicableTerms;
    const quarters = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      assessmentTermCode: { $in: applicableTerms },
      isDeleted: false,
    });
    const mutableQuarters = quarters.filter(
      (quarter) =>
        quarter.termState !== TermWorkflowState.TERM_FINALIZED &&
        quarter.termState !== TermWorkflowState.CLOSED_BY_ADMIN,
    );
    const annualDecisionProcessing =
      ANNUAL_DECISION_PROCESSING_STATES.has(annualAssignment.annualState) ||
      ANNUAL_DECISION_PROCESSING_STATUSES.has(
        annualAssignment.finalDecisionStatus as AnnualDecisionStatus,
      );

    if (mutableQuarters.length === 0 && annualDecisionProcessing) {
      throw new Error(
        'Reassignment is not allowed because all assessment terms are finalized and the assignment has moved to annual decision processing.',
      );
    }

    if (mutableQuarters.length === 0) {
      throw new Error(
        'Reassignment is not allowed because all selected assessment terms are finalized or closed.',
      );
    }

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
        updatedTermAssignmentIds: mutableQuarters.map((quarter) => quarter._id),
        preservedTermAssignmentIds: quarters
          .filter((quarter) => !mutableQuarters.some((mutable) => mutable._id.equals(quarter._id)))
          .map((quarter) => quarter._id),
      },
    );

    void this.sendReassignmentEmails({
      employee,
      previousManager,
      newManager: manager,
      reason: input.reason.trim(),
      reassignedAt: reassignment.effectiveFrom,
    });

    return {
      annualAssignment,
      reassignment,
      updatedTermAssignments: mutableQuarters,
      preservedTermAssignments: quarters.filter(
        (quarter) => !mutableQuarters.some((mutable) => mutable._id.equals(quarter._id)),
      ),
    };
  }

  async cancelReassignment(
    assignmentId: string,
    reassignmentId: string,
    input: CancelReassignmentInput,
  ): Promise<{
    annualAssignment: IAnnualAssignment;
    reassignment: unknown;
    updatedTermAssignments: ITermAssignment[];
  }> {
    await this.assertAdmin('assignment.reassignManager');
    if (!input.reason?.trim()) {
      throw new Error('Cancellation reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    const reassignment = await Reassignment.findOne({
      _id: this.toObjectId(reassignmentId, 'reassignmentId'),
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
      $or: [{ status: 'ACTIVE' }, { status: { $exists: false } }],
    });

    if (!reassignment) {
      throw new Error('Active reassignment record not found');
    }

    if (annualAssignment.assignedManagerId.toString() !== reassignment.toManagerId.toString()) {
      throw new Error('Only the current active reassignment can be cancelled');
    }

    const newerActiveReassignment = await Reassignment.findOne({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
      _id: { $ne: reassignment._id },
      effectiveFrom: { $gt: reassignment.effectiveFrom },
      $or: [{ status: 'ACTIVE' }, { status: { $exists: false } }],
    }).lean();

    if (newerActiveReassignment) {
      throw new Error('This reassignment is not the latest active manager change');
    }

    const newManagerActivity = await AuditLog.findOne({
      assignmentId: annualAssignment._id,
      actorId: reassignment.toManagerId,
      timestamp: { $gte: reassignment.effectiveFrom },
      action: {
        $nin: [
          'PMS_ASSIGNMENT_MANAGER_REASSIGNED',
          'PMS_ASSIGNMENT_REASSIGNMENT_CANCELLED',
        ],
      },
    }).lean();

    if (newManagerActivity) {
      throw new Error(
        'Reassignment cannot be cancelled because the new manager has already performed PMS actions. Please reassign back to the previous manager instead.',
      );
    }

    const previousAssignment = annualAssignment.toObject();
    const previousReassignment = reassignment.toObject();
    const [employee, previousManager, removedManager] = await Promise.all([
      User.findById(annualAssignment.employeeId).lean(),
      User.findById(reassignment.fromManagerId)
        .select('employeeCode name email role specificRole departmentId location')
        .lean(),
      User.findById(reassignment.toManagerId)
        .select('employeeCode name email role specificRole departmentId location')
        .lean(),
    ]);

    if (!previousManager) {
      throw new Error('Previous manager not found');
    }

    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      assignedManagerId: reassignment.toManagerId,
      isDeleted: false,
      termState: {
        $nin: [
          TermWorkflowState.TERM_FINALIZED,
          TermWorkflowState.CLOSED_BY_ADMIN,
        ],
      },
    });

    for (const quarter of termAssignments) {
      quarter.assignedManagerId = reassignment.fromManagerId;
      quarter.updatedBy = this.actorIdObject();
      quarter.version += 1;
      await quarter.save();
    }

    annualAssignment.assignedManagerId = reassignment.fromManagerId;
    annualAssignment.managerSnapshot = {
      managerId: previousManager._id,
      employeeCode: previousManager.employeeCode,
      name: previousManager.name,
      email: previousManager.email,
      role: previousManager.role,
      specificRole: previousManager.specificRole,
    };
    annualAssignment.updatedBy = this.actorIdObject();
    annualAssignment.version += 1;
    await annualAssignment.save();

    reassignment.status = 'CANCELLED';
    reassignment.cancelReason = input.reason.trim();
    reassignment.cancelledBy = this.actorIdObject();
    reassignment.cancelledAt = new Date();
    reassignment.updatedBy = this.actorIdObject();
    reassignment.version += 1;
    await reassignment.save();

    await this.audit(
      'PMS_ASSIGNMENT_REASSIGNMENT_CANCELLED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      {
        annualAssignment: previousAssignment,
        reassignment: previousReassignment,
      },
      {
        annualAssignment,
        reassignment,
        restoredTermAssignmentIds: termAssignments.map((quarter) => quarter._id),
      },
      input.reason.trim(),
    );

    void this.sendReassignmentCancelledEmails({
      employee,
      restoredManager: previousManager,
      removedManager,
      reason: input.reason.trim(),
      cancelledAt: reassignment.cancelledAt || new Date(),
    });

    return {
      annualAssignment,
      reassignment,
      updatedTermAssignments: termAssignments,
    };
  }

  async closeAssignment(assignmentId: string, input: AssignmentStateInput): Promise<{
    annualAssignment: IAnnualAssignment;
    termAssignments: ITermAssignment[];
  }> {
    await this.assertAdmin('assignment.close');
    if (!input.reason?.trim()) {
      throw new Error('Close reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    const previousValue = annualAssignment.toObject();
    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
      termState: { $ne: TermWorkflowState.TERM_FINALIZED },
    });

    for (const termAssignment of termAssignments) {
      termAssignment.previousTermState = termAssignment.termState;
      termAssignment.termState = TermWorkflowState.CLOSED_BY_ADMIN;
      termAssignment.lastTransitionAt = new Date();
      termAssignment.lastTransitionBy = this.actorIdObject();
      termAssignment.lastTransitionRole = this.context.user?.role;
      termAssignment.lastTransitionReason = input.reason.trim();
      termAssignment.updatedBy = this.actorIdObject();
      termAssignment.version += 1;
      await termAssignment.save();
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

    return { annualAssignment, termAssignments };
  }

  async reopenAssignment(assignmentId: string, input: AssignmentStateInput): Promise<{
    annualAssignment: IAnnualAssignment;
    termAssignments: ITermAssignment[];
  }> {
    await this.assertAdmin('assignment.reopen');
    if (!input.reason?.trim()) {
      throw new Error('Reopen reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    if (annualAssignment.annualState !== AnnualWorkflowState.CLOSED) {
      throw new Error('Only closed assignments can be reopened');
    }

    const previousValue = annualAssignment.toObject();
    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
      termState: TermWorkflowState.CLOSED_BY_ADMIN,
    });

    for (const termAssignment of termAssignments) {
      termAssignment.termState =
        termAssignment.previousTermState ?? TermWorkflowState.REOPENED_BY_ADMIN;
      termAssignment.previousTermState = TermWorkflowState.CLOSED_BY_ADMIN;
      termAssignment.lastTransitionAt = new Date();
      termAssignment.lastTransitionBy = this.actorIdObject();
      termAssignment.lastTransitionRole = this.context.user?.role;
      termAssignment.lastTransitionReason = input.reason.trim();
      termAssignment.updatedBy = this.actorIdObject();
      termAssignment.version += 1;
      await termAssignment.save();
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

    return { annualAssignment, termAssignments };
  }

  async adminReopenAnnual(assignmentId: string, input: AssignmentStateInput): Promise<{
    annualAssignment: IAnnualAssignment;
  }> {
    await this.assertAdmin('assignment.reopenAnnual');
    if (!input.reason?.trim()) {
      throw new Error('Reopen reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(assignmentId);
    const reopenableStates = new Set<AnnualWorkflowState>([
      AnnualWorkflowState.ANNUAL_FINALIZED,
      AnnualWorkflowState.VISIBILITY_ENABLED,
      AnnualWorkflowState.COMMUNICATION_READY,
      AnnualWorkflowState.COMMUNICATION_SENT,
    ]);
    if (!reopenableStates.has(annualAssignment.annualState)) {
      throw new Error('Only finalized, visibility-enabled, or communication-stage assignments can be reopened');
    }

    const [annualDecision, visibilityConfiguration] = await Promise.all([
      AnnualDecision.findOne({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }),
      VisibilityConfiguration.findOne({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }),
    ]);

    const transition = workflowService.transition({
      entityType: WorkflowEntityType.ANNUAL_ASSIGNMENT,
      entityId: annualAssignment._id.toString(),
      currentState: annualAssignment.annualState,
      nextState: AnnualWorkflowState.APPRAISAL_WINDOW_OPEN,
      actorId: this.context.user?._id.toString() ?? '',
      actorRole: this.context.user?.role ?? '',
      reason: input.reason.trim(),
    });

    const previousValue = annualAssignment.toObject();
    const actorId = this.actorIdObject();
    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    }).lean();

    const snapshotPayload = {
      annualSnapshot: annualAssignment.toObject(),
      termSnapshots: Object.fromEntries(
        termAssignments.map((termAssignment) => [
          termAssignment.assessmentTermCode,
          termAssignment,
        ]),
      ),
      finalDecisionSnapshot: {
        reopenReason: input.reason.trim(),
        decision: annualDecision?.toObject() ?? null,
      },
      visibilitySnapshot: {
        visibilityConfiguration: visibilityConfiguration?.toObject() ?? null,
        annualAssignmentVisibility: annualAssignment.visibility,
      },
      communicationSnapshot: {
        communicationStatus: annualAssignment.communicationStatus,
      },
    };

    const snapshotHash = createHash('sha256')
      .update(JSON.stringify(snapshotPayload))
      .digest('hex');

    await PerformanceHistorySnapshot.create({
      annualAssignmentId: annualAssignment._id,
      cycleId: annualAssignment.cycleId,
      employeeId: annualAssignment.employeeId,
      templateVersionId: annualAssignment.templateVersionId,
      annualSnapshot: snapshotPayload.annualSnapshot,
      termSnapshots: snapshotPayload.termSnapshots,
      finalDecisionSnapshot: snapshotPayload.finalDecisionSnapshot,
      visibilitySnapshot: snapshotPayload.visibilitySnapshot,
      communicationSnapshot: snapshotPayload.communicationSnapshot,
      snapshotHash,
      createdBy: actorId,
      updatedBy: actorId,
    });

    await CorrectionLayer.create({
      entityType: 'ANNUAL_ASSIGNMENT',
      entityId: annualAssignment._id,
      fieldKey: 'REOPEN_APPRAISAL',
      originalValue: {
        annualState: annualAssignment.annualState,
        finalDecisionStatus: annualAssignment.finalDecisionStatus,
        communicationStatus: annualAssignment.communicationStatus,
        visibility: annualAssignment.visibility,
        decisionStatus: annualDecision?.decisionStatus,
      },
      correctedValue: {
        annualState: AnnualWorkflowState.APPRAISAL_WINDOW_OPEN,
        finalDecisionStatus: AnnualDecisionStatus.DRAFT,
        communicationStatus: 'NOT_REQUIRED',
        visibility: {
          employeeReviewVisible: false,
          employeeGradeVisible: false,
          employeeMeritVisible: false,
          managerGradeVisible: false,
          managerMeritVisible: false,
        },
        decisionStatus: AnnualDecisionStatus.DRAFT,
      },
      correctionReason: input.reason.trim(),
      correctedBy: actorId,
      correctedAt: new Date(),
      createdBy: actorId,
      updatedBy: actorId,
    });

    if (annualDecision) {
      const previousDecisionValue = annualDecision.toObject();
      annualDecision.decisionStatus = AnnualDecisionStatus.DRAFT;
      annualDecision.submittedAt = undefined;
      annualDecision.submittedBy = undefined;
      annualDecision.frozenAt = undefined;
      annualDecision.frozenBy = undefined;
      annualDecision.updatedBy = actorId;
      annualDecision.version += 1;
      await annualDecision.save();

      await this.audit(
        'PMS_ASSIGNMENT_APPRAISAL_REOPENED_DECISION_RESET',
        'ANNUAL_DECISION',
        annualDecision._id.toString(),
        previousDecisionValue,
        annualDecision.toObject(),
        input.reason.trim(),
      );
    }

    if (visibilityConfiguration) {
      const previousVisibilityValue = visibilityConfiguration.toObject();
      visibilityConfiguration.employeeReviewVisible = false;
      visibilityConfiguration.employeeGradeVisible = false;
      visibilityConfiguration.employeeMeritVisible = false;
      visibilityConfiguration.managerGradeVisible = false;
      visibilityConfiguration.managerMeritVisible = false;
      visibilityConfiguration.disabledBy = actorId;
      visibilityConfiguration.disabledAt = new Date();
      visibilityConfiguration.updatedBy = actorId;
      visibilityConfiguration.version += 1;
      await visibilityConfiguration.save();

      await this.audit(
        'PMS_ASSIGNMENT_APPRAISAL_REOPENED_VISIBILITY_RESET',
        'VISIBILITY_CONFIGURATION',
        visibilityConfiguration._id.toString(),
        previousVisibilityValue,
        visibilityConfiguration.toObject(),
        input.reason.trim(),
      );
    }

    annualAssignment.annualState = transition.currentState as AnnualWorkflowState;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.DRAFT;
    annualAssignment.communicationStatus = 'NOT_REQUIRED';
    annualAssignment.visibility.employeeReviewVisible = false;
    annualAssignment.visibility.employeeGradeVisible = false;
    annualAssignment.visibility.employeeMeritVisible = false;
    annualAssignment.visibility.managerGradeVisible = false;
    annualAssignment.visibility.managerMeritVisible = false;
    annualAssignment.updatedBy = this.actorIdObject();
    annualAssignment.version += 1;
    await annualAssignment.save();

    await this.audit(
      'PMS_ASSIGNMENT_APPRAISAL_REOPENED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      previousValue,
      { annualAssignment, reason: input.reason.trim() },
    );

    return { annualAssignment };
  }

  async listExceptions(cycleId: string, status = 'OPEN'): Promise<unknown[]> {
    await this.assertAdmin('assignment.exceptions.list');
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
    await this.assertAdmin('assignment.exceptions.resolve');
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

  private buildTermAssignments(
    annualAssignmentId: Types.ObjectId,
    cycleId: Types.ObjectId,
    employeeId: Types.ObjectId,
    managerId: Types.ObjectId,
    templateVersionId: Types.ObjectId,
    assessmentTermType: AssessmentTermTypeType,
    applicableTerms: QuarterCode[],
    termCycleByCode: Map<QuarterCode, Types.ObjectId>,
  ): Array<{
    annualAssignmentId: Types.ObjectId;
    cycleId: Types.ObjectId;
    employeeId: Types.ObjectId;
    assignedManagerId: Types.ObjectId;
    templateVersionId: Types.ObjectId;
    cycleTermId: Types.ObjectId;
    assessmentTermCode: QuarterCode;
    assessmentTermType: AssessmentTermTypeType;
    termCode: QuarterCode;
    termLabel: string;
    termState: TermWorkflowState;
    createdBy?: Types.ObjectId;
  }> {
    return applicableTerms.map((assessmentTermCode) => {
      const cycleTermId = termCycleByCode.get(assessmentTermCode);
      if (!cycleTermId) {
        throw new Error(`Assessment term cycle not found for ${assessmentTermCode}`);
      }

      return {
        annualAssignmentId,
        cycleId,
        cycleTermId,
        employeeId,
        assignedManagerId: managerId,
        templateVersionId,
        assessmentTermType,
        assessmentTermCode,
        termCode: assessmentTermCode,
        termLabel: getAssessmentTermLabel(assessmentTermCode),
        termState: TermWorkflowState.NOT_STARTED,
        createdBy: this.actorIdObject(),
      };
    });
  }

  private async seedPredefinedObjectives(
    annualAssignment: IAnnualAssignment,
    termAssignments: ITermAssignment[],
    termCycleById: Map<
      string,
      {
        achievementSubmissionWindow?: { endDate?: Date; dueDate?: Date };
        objectiveApprovalWindow?: { endDate?: Date };
        objectiveSettingWindow?: { endDate?: Date };
        termFinalizationWindow?: { endDate?: Date };
      }
    >,
  ): Promise<Set<string>> {
    const templateVersionId = annualAssignment.templateVersionId?.toString();
    if (!templateVersionId) {
      return new Set<string>();
    }

    const templateVersion = await PmsTemplateVersion.findById(templateVersionId).lean();
    if (!templateVersion) {
      return new Set<string>();
    }

    const actorId = this.actorIdObject();
    const objectivePayloads: Array<Record<string, unknown>> = [];
    const seededTermAssignmentIds = new Set<string>();
    const existingObjectives = await Objective.find({
      termAssignmentId: { $in: termAssignments.map((termAssignment) => termAssignment._id) },
      isDeleted: false,
    })
      .select('termAssignmentId templateObjectiveKey objectiveNo')
      .lean();
    const existingKeysByTermAssignment = new Map<string, Set<string>>();
    const nextObjectiveNoByTermAssignment = new Map<string, number>();

    for (const objective of existingObjectives) {
      const termAssignmentId = objective.termAssignmentId.toString();
      const existingKeys = existingKeysByTermAssignment.get(termAssignmentId) ?? new Set<string>();
      if (typeof objective.templateObjectiveKey === 'string' && objective.templateObjectiveKey.trim()) {
        existingKeys.add(objective.templateObjectiveKey.trim());
      }
      existingKeysByTermAssignment.set(termAssignmentId, existingKeys);

      const currentMax = nextObjectiveNoByTermAssignment.get(termAssignmentId) ?? 1;
      const nextObjectiveNo = Math.max(currentMax, (objective.objectiveNo ?? 0) + 1);
      nextObjectiveNoByTermAssignment.set(termAssignmentId, nextObjectiveNo);
    }

    for (const termAssignment of termAssignments) {
      const termCycle = termAssignment.cycleTermId
        ? termCycleById.get(termAssignment.cycleTermId.toString())
        : undefined;
      const defaultDueDate =
        termCycle?.achievementSubmissionWindow?.endDate ||
        termCycle?.achievementSubmissionWindow?.dueDate ||
        termCycle?.termFinalizationWindow?.endDate ||
        undefined;
      const config = this.resolveTemplateObjectiveConfig(
        templateVersion.sections ?? [],
        termAssignment.assessmentTermCode,
      );

      if (!config || config.predefinedObjectives.length === 0) {
        continue;
      }

      const termAssignmentId = termAssignment._id.toString();
      const existingKeys = existingKeysByTermAssignment.get(termAssignmentId) ?? new Set<string>();
      let nextObjectiveNo = nextObjectiveNoByTermAssignment.get(termAssignmentId) ?? 1;

      for (const predefinedObjective of config.predefinedObjectives) {
        if (predefinedObjective.isActive === false) {
          continue;
        }
        if (!this.matchesPredefinedObjectiveTerm(termAssignment.assessmentTermCode, predefinedObjective.applicableTerms)) {
          continue;
        }

        const templateObjectiveKey = predefinedObjective.key.trim();
        if (!templateObjectiveKey || !predefinedObjective.title?.trim()) {
          continue;
        }
        if (existingKeys.has(templateObjectiveKey)) {
          continue;
        }
        const predefinedDueDate = predefinedObjective.dueDate
          ? new Date(predefinedObjective.dueDate)
          : undefined;
        const targetDate =
          predefinedDueDate && !Number.isNaN(predefinedDueDate.getTime())
            ? predefinedDueDate
            : defaultDueDate;

        objectivePayloads.push({
          termAssignmentId: termAssignment._id,
          annualAssignmentId: termAssignment.annualAssignmentId,
          cycleId: termAssignment.cycleId,
          templateVersionId: annualAssignment.templateVersionId,
          assessmentTermCode: termAssignment.assessmentTermCode,
          employeeId: termAssignment.employeeId,
          assignedManagerId: termAssignment.assignedManagerId,
          objectiveNo: nextObjectiveNo,
          source: ObjectiveSource.PREDEFINED,
          templateObjectiveKey,
          isPredefined: true,
          title: predefinedObjective.title.trim(),
          description: predefinedObjective.description,
          targetMetric: predefinedObjective.kpi,
          targetValue: predefinedObjective.targetValue,
          targetDate,
          weightage: predefinedObjective.weightage,
          successCriteria: predefinedObjective.successCriteria,
          status: ObjectiveStatus.OBJECTIVE_APPROVED,
          attachments: [],
          createdByRole: 'SYSTEM',
          createdByUserId: actorId,
          createdBy: actorId,
          approvedAt: defaultDueDate ?? new Date(),
          approvedBy: actorId,
        });

        existingKeys.add(templateObjectiveKey);
        nextObjectiveNo += 1;
        seededTermAssignmentIds.add(termAssignmentId);
      }

      existingKeysByTermAssignment.set(termAssignmentId, existingKeys);
      nextObjectiveNoByTermAssignment.set(termAssignmentId, nextObjectiveNo);
    }

    if (objectivePayloads.length > 0) {
      await Objective.insertMany(objectivePayloads);
    }

    return seededTermAssignmentIds;
  }

  private async openSeededTermAssignmentsForObjectiveSetting(
    termAssignments: ITermAssignment[],
    seededTermAssignmentIds: Set<string>,
  ): Promise<void> {
    if (seededTermAssignmentIds.size === 0) {
      return;
    }

    for (const termAssignment of termAssignments) {
      const termAssignmentId = termAssignment._id.toString();
      if (!seededTermAssignmentIds.has(termAssignmentId)) {
        continue;
      }

      const targetState = TermWorkflowState.OBJECTIVE_SETTING_OPEN;

      if (termAssignment.termState === targetState) {
        continue;
      }

      const previousState = termAssignment.termState;
      const updatedTermAssignment = await transitionTermAssignmentState(
        termAssignmentId,
        targetState,
        this.requireActor(),
        'Seeded predefined objectives are approved; objective setting remains open for additional objectives',
      );

      await this.audit(
        'PMS_TERM_ASSIGNMENT_SEEDED_OBJECTIVE_SETTING_OPEN',
        'TERM_ASSIGNMENT',
        termAssignment._id.toString(),
        {
          termState: previousState,
        },
        {
          termState: updatedTermAssignment.termState,
        },
        'Seeded predefined objectives opened the objective-setting workflow at assignment launch',
      );
    }
  }

  private resolveTemplateObjectiveConfig(
    sections: ITemplateSection[],
    assessmentTermCode: QuarterCode,
  ) {
    const objectiveSection = sections.find((section) => {
      if (section.sectionType !== PmsTemplateSectionType.OBJECTIVES) return false;
      if (!this.isTermLevelTemplateSection(section.level)) return false;

      const allowedQuarters = [
        ...(section.termScope ?? []),
        ...(section.repeatFor ?? []),
      ];

      return this.assessmentTermScopeMatches(allowedQuarters, assessmentTermCode);
    });

    if (!objectiveSection?.objectiveConfig) {
      return undefined;
    }

    return {
      predefinedObjectives: (objectiveSection.objectiveConfig.predefinedObjectives ?? []).map(
        (objective: ITemplatePredefinedObjective, index: number) => ({
          key: this.buildDeterministicTemplateObjectiveKey(objectiveSection.sectionKey, objective, index),
          title: objective.title?.trim(),
          description: objective.description,
          kpi: objective.kpi,
          targetValue: objective.targetValue,
          dueDate: objective.dueDate,
          weightage: objective.weightage,
          successCriteria: objective.successCriteria,
          attachmentAllowed: objective.attachmentAllowed === true,
          applyToAllQuarters: objective.applyToAllQuarters !== false,
          editable: objective.editable !== false,
          isActive: objective.isActive !== false,
          applicableTerms: this.normalizeScopedTerms(
            objective.termScope ?? objective.applicableTerms ?? objective.repeatFor,
          ),
        }),
      ),
    };
  }

  private buildDeterministicTemplateObjectiveKey(
    sectionKey: string,
    objective: ITemplatePredefinedObjective,
    index: number,
  ): string {
    const explicitKey = objective.objectiveKey?.trim();
    if (explicitKey) {
      return explicitKey;
    }

    const titleSlug = String(objective.title ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!titleSlug) {
      return '';
    }

    return `${sectionKey}__${titleSlug}__${index + 1}`;
  }

  private normalizeScopedTerms(
    quarters?: QuarterCode[],
  ): QuarterCode[] | undefined {
    if (!quarters?.length) {
      return undefined;
    }

    const validQuarters = Object.values(AssessmentTermCode) as QuarterCode[];
    const normalized = quarters.filter((quarter): quarter is QuarterCode =>
      validQuarters.includes(quarter as QuarterCode),
    );

    return Array.from(new Set(normalized));
  }

  private matchesPredefinedObjectiveTerm(
    assessmentTermCode: QuarterCode,
    applicableTerms?: QuarterCode[],
  ): boolean {
    if (typeof applicableTerms === 'undefined') {
      return true;
    }

    if (applicableTerms.length === 0) {
      return false;
    }

    return this.assessmentTermScopeMatches(applicableTerms, assessmentTermCode);
  }

  private isTermLevelTemplateSection(level?: unknown): boolean {
    const normalized = String(level ?? '').trim().toUpperCase();
    return normalized === 'TERM';
  }

  private assessmentTermScopeMatches(
    scopedTerms: QuarterCode[],
    termCode: QuarterCode,
  ): boolean {
    if (scopedTerms.length === 0) {
      return true;
    }

    return scopedTerms.includes(termCode);
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

  private async resolveSelectedTemplateVersionId(
    requestedTemplateVersionId: string | undefined,
    annualCycle: IAnnualCycle,
  ): Promise<Types.ObjectId> {
    const templateVersionId = requestedTemplateVersionId ?? annualCycle.templateVersionId?.toString();
    if (!templateVersionId) {
      throw new Error('Template version is required for assignment creation');
    }

    if (!Types.ObjectId.isValid(templateVersionId)) {
      throw new Error('Invalid templateVersionId');
    }

    const templateVersion = await PmsTemplateVersion.findById(templateVersionId);
    if (!templateVersion) {
      throw new Error('Template version not found');
    }

    if (templateVersion.status !== PmsTemplateStatus.ACTIVE) {
      throw new Error('Only active template versions can be assigned');
    }

    const parentTemplate = await PmsTemplate.findById(templateVersion.templateId).lean();
    const effectiveFromDate = templateVersion.effectiveFrom ?? parentTemplate?.effectiveDate;

    if (effectiveFromDate) {
      const cycleStart = new Date(annualCycle.startDate);
      const effectiveFrom = new Date(effectiveFromDate);
      if (cycleStart < effectiveFrom) {
        throw new Error(
          `Cycle start date (${cycleStart.toDateString()}) cannot be before the template's effective date (${effectiveFrom.toDateString()})`,
        );
      }
    }

    if (templateVersion.effectiveTo) {
      const cycleEnd = new Date(annualCycle.endDate);
      const effectiveTo = new Date(templateVersion.effectiveTo);
      if (cycleEnd > effectiveTo) {
        throw new Error(
          `Cycle end date (${cycleEnd.toDateString()}) cannot be after the template's effective expiration date (${effectiveTo.toDateString()})`,
        );
      }
    }

    return templateVersion._id as Types.ObjectId;
  }

  private normalizeApplicableTerms(
    quarters?: QuarterCode[],
    allowedQuarters: QuarterCode[] = Object.values(AssessmentTermCode) as QuarterCode[],
  ): QuarterCode[] {
    const normalized = quarters?.length ? quarters : allowedQuarters;
    const seen = new Set<QuarterCode>();

    for (const quarter of normalized) {
      if (!allowedQuarters.includes(quarter)) {
        throw new Error(`Invalid applicable assessment term: ${quarter}`);
      }
      if (seen.has(quarter)) {
        throw new Error(`Duplicate applicable assessment term: ${quarter}`);
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

  public async applyScopedAssignmentFilter(filter: Record<string, unknown>): Promise<void> {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);

    if (mappedRole === PmsRole.ADMIN) {
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

    if (mappedRole === PmsRole.DIRECTOR || mappedRole === PmsRole.MANAGEMENT) {
      const subordinateIds = await getSubordinateUserIds(actor.actorId);
      filter.employeeId = { $in: subordinateIds };
      return;
    }

    throw new Error('PMS access denied');
  }

  private async assertAssignmentAccess(action: string, annualAssignment: IAnnualAssignment): Promise<void> {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);

    if (mappedRole === PmsRole.DIRECTOR || mappedRole === PmsRole.MANAGEMENT) {
      const subordinateIds = await getSubordinateUserIds(actor.actorId);
      const isSubordinate = subordinateIds.some(subId => subId.toString() === annualAssignment.employeeId.toString());
      if (isSubordinate) {
        return;
      }
      throw new Error('Access denied. Employee is not in your reporting hierarchy.');
    }

    const access = await accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: annualAssignment.employeeId.toString(),
        managerId: annualAssignment.assignedManagerId.toString(),
      },
    });

    if (access.allowed) {
      return;
    }

    // Check delegation
    const delegation = await new DelegationService(this.context).getActiveDelegation(
      actor.actorId,
      annualAssignment.assignedManagerId.toString(),
      'ALL',
      annualAssignment.cycleId.toString(),
    );

    if (delegation) {
      return;
    }

    throw new Error(access.message ?? 'Access denied');
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

  private async assertAdmin(action: string): Promise<void> {
    const access = await accessService.canPerform({
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

  private async sendReassignmentEmails(input: {
    employee: any;
    previousManager: any;
    newManager: any;
    reason: string;
    reassignedAt: Date;
  }): Promise<void> {
    const employeeName = this.userName(input.employee, 'Employee');
    const previousManagerName = this.userName(input.previousManager, 'Previous manager');
    const newManagerName = this.userName(input.newManager, 'New manager');
    const date = this.formatNotificationDate(input.reassignedAt);

    await this.sendBestEffortEmail(
      input.newManager?.email,
      'PMS Assignment Reassigned To You',
      `Hello ${newManagerName},\n\nThe PMS assignment for ${employeeName} has been reassigned to you from ${previousManagerName} on ${date}.\n\nReason: ${input.reason}`,
      `<p>Hello ${this.escapeHtml(newManagerName)},</p><p>The PMS assignment for <strong>${this.escapeHtml(employeeName)}</strong> has been reassigned to you from <strong>${this.escapeHtml(previousManagerName)}</strong> on <strong>${date}</strong>.</p><p><strong>Reason:</strong> ${this.escapeHtml(input.reason)}</p>`,
    );

    await this.sendBestEffortEmail(
      input.previousManager?.email,
      'PMS Assignment Reassigned',
      `Hello ${previousManagerName},\n\nThe PMS assignment for ${employeeName} has been reassigned to ${newManagerName} on ${date}.\n\nReason: ${input.reason}`,
      `<p>Hello ${this.escapeHtml(previousManagerName)},</p><p>The PMS assignment for <strong>${this.escapeHtml(employeeName)}</strong> has been reassigned to <strong>${this.escapeHtml(newManagerName)}</strong> on <strong>${date}</strong>.</p><p><strong>Reason:</strong> ${this.escapeHtml(input.reason)}</p>`,
    );
  }

  private async sendReassignmentCancelledEmails(input: {
    employee: any;
    restoredManager: any;
    removedManager: any;
    reason: string;
    cancelledAt: Date;
  }): Promise<void> {
    const employeeName = this.userName(input.employee, 'Employee');
    const restoredManagerName = this.userName(input.restoredManager, 'Restored manager');
    const removedManagerName = this.userName(input.removedManager, 'Removed manager');
    const date = this.formatNotificationDate(input.cancelledAt);

    await this.sendBestEffortEmail(
      input.restoredManager?.email,
      'PMS Reassignment Cancelled',
      `Hello ${restoredManagerName},\n\nThe PMS reassignment for ${employeeName} has been cancelled on ${date}. The assignment is now back with you.\n\nReason: ${input.reason}`,
      `<p>Hello ${this.escapeHtml(restoredManagerName)},</p><p>The PMS reassignment for <strong>${this.escapeHtml(employeeName)}</strong> has been cancelled on <strong>${date}</strong>. The assignment is now back with you.</p><p><strong>Reason:</strong> ${this.escapeHtml(input.reason)}</p>`,
    );

    await this.sendBestEffortEmail(
      input.removedManager?.email,
      'PMS Reassignment Cancelled',
      `Hello ${removedManagerName},\n\nThe PMS reassignment for ${employeeName} has been cancelled on ${date}. The assignment has returned to ${restoredManagerName}.\n\nReason: ${input.reason}`,
      `<p>Hello ${this.escapeHtml(removedManagerName)},</p><p>The PMS reassignment for <strong>${this.escapeHtml(employeeName)}</strong> has been cancelled on <strong>${date}</strong>. The assignment has returned to <strong>${this.escapeHtml(restoredManagerName)}</strong>.</p><p><strong>Reason:</strong> ${this.escapeHtml(input.reason)}</p>`,
    );
  }

  private async sendBestEffortEmail(
    to: string | undefined,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    if (!to) return;
    try {
      await emailService.sendEmail({ body: { to, subject, text, html } });
    } catch (error) {
      console.warn('PMS assignment email notification failed:', error);
    }
  }

  private userName(user: any, fallback: string): string {
    return user?.name || user?.employeeCode || user?.email || fallback;
  }

  private formatNotificationDate(value: Date): string {
    return value.toLocaleDateString('en-GB');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
    reason?: string,
  ): Promise<void> {
    const user = this.context.user;
    if (!user) return;

    await auditService.createAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action,
      entityType,
      entityId,
      assignmentId: entityType === 'ANNUAL_ASSIGNMENT' ? entityId : undefined,
      previousValue,
      newValue,
      reason,
    });
  }
}
