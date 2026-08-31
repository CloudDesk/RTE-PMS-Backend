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
import {
  AnnualAssignment,
  EmployeeCareerProfileSnapshotTrigger,
} from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { AssignmentExceptionQueue } from '../models/pms-assignment-exception-queue.model';
import { AuditLog } from '../models/audit-log.model';
import { LOV } from '../models/lov.model';
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
import { ManagerReviewPeriodService } from './managerReviewPeriod.service';
import { PmsEmployeeCareerProfileSnapshotService } from './pmsEmployeeCareerProfileSnapshot.service';
import { transitionTermAssignmentState } from './term-assignment-workflow.service';
import { workflowService } from './workflow.service';
import { visibilityMaskService } from './visibilityMask.service';
import {
  predefinedObjectiveSeedEntry,
  upsertObjectiveRowSeedEntries,
  type ObjectiveRowSeedEntry,
} from './objective-assignment-seeding.service';
import { getSubordinateUserIds } from '../utilis/userHierarchy';
import { resolveFinalReviewer } from '../utilis/finalReviewer';
import { AssessmentTermCode } from '../constants/pms.enums';
import type {
  PmsAchievementWindowSnapshot,
  PmsAssignmentTermWindowSnapshot,
  PmsAssignmentWindowSnapshot,
  PmsDateWindowSnapshot,
} from '../utilis/pmsAssignmentWindows';
import { resolveEffectiveTermWindows } from '../utilis/pmsAssignmentWindows';
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
  specialWindowOverride?: boolean;
  specialWindowReason?: string;
  assignmentWindowSnapshot?: PmsAssignmentWindowSnapshot;
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
    const annualCycle = await this.assertCycleExists(annualCycleId);

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
      const managerIdFilter = this.toObjectId(query.managerId, 'managerId');
      if (filter.assignedManagerId) {
        filter.$and = [
          ...((filter.$and as Record<string, unknown>[] | undefined) ?? []),
          { assignedManagerId: filter.assignedManagerId },
          { assignedManagerId: managerIdFilter },
        ];
        delete filter.assignedManagerId;
      } else {
        filter.assignedManagerId = managerIdFilter;
      }
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
        filter.$and = [
          ...((filter.$and as Record<string, unknown>[] | undefined) ?? []),
          { $or: filter.$or },
          { $or: searchFilter },
        ];
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
    const [termAssignments, reassignments, termCycles] = await Promise.all([
      TermAssignment.find({
        annualAssignmentId: { $in: assignmentIds },
        isDeleted: false,
      }).sort({ assessmentTermCode: 1 }).lean(),
      Reassignment.find({
        annualAssignmentId: { $in: assignmentIds },
        isDeleted: false,
      }).sort({ effectiveFrom: -1 }).lean(),
      TermCycle.find({
        cycleId: annualCycleId,
        isDeleted: false,
      }).lean(),
    ]);

    const termCycleMap = new Map(
      termCycles.map((termCycle) => [termCycle._id.toString(), termCycle]),
    );

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
    const hasVisibilityOverride = this.context.user
      ? String(this.context.user.role || '').trim().toUpperCase() === 'HR' ||
        (await accessService.canPerform({
          actor: { actorId: this.context.user._id.toString(), actorRole: this.context.user.role },
          action: 'assignment.visibility.override',
          requiresAdmin: true
        })).allowed
      : false;

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

      const assignmentTerms = quartersByAssignment.get(item._id.toString()) ?? [];
      const mappedItem = {
        ...item,
        annualState:
          annualCycle.status === AnnualWorkflowState.CANCELLED
            ? AnnualWorkflowState.CANCELLED
            : item.annualState,
        termAssignments: assignmentTerms.map((termAssignment: any) => ({
          ...termAssignment,
          termState: this.getEffectiveAssignmentTermState(
            termAssignment,
            assignmentTerms as any[],
            termCycleMap,
            item,
          ),
        })),
        assignmentHistory: historyByAssignment.get(item._id.toString()) ?? [],
      };

      if (annualCycle.status === AnnualWorkflowState.CANCELLED) {
        mappedItem.termAssignments = mappedItem.termAssignments.map((quarter: any) => ({
          ...quarter,
          termState:
            quarter.termState === TermWorkflowState.TERM_FINALIZED
              ? quarter.termState
              : TermWorkflowState.CLOSED_BY_ADMIN,
        }));
      }

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
    const assignmentWindowSnapshot = this.buildAssignmentWindowSnapshot(input, applicableTerms);
    const { employeeSnapshot, managerSnapshot, orgSnapshot } = await this.buildAssignmentSnapshots(
      employeeObjectId,
      managerObjectId,
    );
    this.validateEmployeeEligibility(employeeSnapshot);
    const finalReviewerResolution = await resolveFinalReviewer({
      employeeId: employeeObjectId,
      assignedManagerId: managerObjectId,
      finalReviewRequired: annualCycle.finalReviewRequired === true,
      defaultFinalReviewerId: annualCycle.defaultFinalReviewerId,
    });

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
      assignmentWindowSnapshot,
      employeeSnapshot,
      managerSnapshot,
      orgSnapshot,
      ...finalReviewerResolution,
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
    await this.syncInitialTermAssignmentStates(
      annualAssignment,
      termAssignments,
      seededTermAssignmentIds,
      termCycleById,
    );
    await new ManagerReviewPeriodService(this.context).createPeriodsForAnnualAssignment(
      annualAssignment,
      termAssignments,
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
        assignmentWindowSnapshot,
      },
      input.specialWindowReason,
    );

    const refreshedTermAssignments = await TermAssignment.find({
      _id: { $in: termAssignments.map((termAssignment) => termAssignment._id) },
      isDeleted: false,
    }).sort({ assessmentTermCode: 1 });

    return { annualAssignment, termAssignments: refreshedTermAssignments };
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

    const cycle = await AnnualCycle.findById(annualAssignment.cycleId)
      .select('status isDeleted')
      .lean();

    if (cycle?.status === AnnualWorkflowState.CANCELLED) {
      annualAssignment.annualState = AnnualWorkflowState.CANCELLED;
      for (const termAssignment of termAssignments) {
        if (termAssignment.termState !== TermWorkflowState.TERM_FINALIZED) {
          termAssignment.termState = TermWorkflowState.CLOSED_BY_ADMIN;
        }
      }
    }

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

    if (annualAssignment.annualState === AnnualWorkflowState.CANCELLED) {
      throw new Error(
        'Reassignment is not allowed because this assignment was cancelled when the parent cycle was cancelled.',
      );
    }

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

    await new ManagerReviewPeriodService(this.context).updateManagerForMutablePeriods(
      annualAssignment._id,
      mutableQuarters.map((quarter) => quarter._id),
      newManagerId,
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

    await new ManagerReviewPeriodService(this.context).updateManagerForMutablePeriods(
      annualAssignment._id,
      termAssignments.map((termAssignment) => termAssignment._id),
      reassignment.fromManagerId,
    );

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
    await new PmsEmployeeCareerProfileSnapshotService(
      this.context,
    ).freezeForAnnualAssignment(
      annualAssignment._id,
      EmployeeCareerProfileSnapshotTrigger.ASSIGNMENT_CLOSED,
    );
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

    await new ManagerReviewPeriodService(this.context).closePeriodsForAnnualAssignment(
      annualAssignment._id,
      input.reason.trim(),
    );

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
    if (!actorId) {
      throw new Error('Actor is required to seed predefined objective rows');
    }
    const objectivePayloads: ObjectiveRowSeedEntry[] = [];
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

    const matrixLov = await LOV.findOne({ type: 'matrix' }).lean();
    const matrixLabelByCode = new Map(
      (matrixLov?.values ?? []).map((entry) => [entry.value?.trim().toLowerCase(), entry.label?.trim()]),
    );

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
        const alreadyExists = existingKeys.has(templateObjectiveKey);
        const predefinedDueDate = predefinedObjective.dueDate
          ? new Date(predefinedObjective.dueDate)
          : undefined;
        const targetDate =
          predefinedDueDate && !Number.isNaN(predefinedDueDate.getTime())
            ? predefinedDueDate
            : defaultDueDate;

        const coverage = termAssignments
          .filter((candidate) => {
            const candidateConfig = this.resolveTemplateObjectiveConfig(
              templateVersion.sections ?? [],
              candidate.assessmentTermCode,
            );
            return candidateConfig?.predefinedObjectives.some(
              (candidateObjective) =>
                candidateObjective.key === templateObjectiveKey &&
                candidateObjective.isActive !== false &&
                this.matchesPredefinedObjectiveTerm(
                  candidate.assessmentTermCode,
                  candidateObjective.applicableTerms,
                ),
            ) === true;
          })
          .map((candidate) => candidate.assessmentTermCode);
        const rawMatrixCode = predefinedObjective.matrixCode?.trim();
        const matrixCode = rawMatrixCode || undefined;
        const matrixLabel = (matrixCode ? matrixLabelByCode.get(matrixCode.toLowerCase()) : undefined) ||
          predefinedObjective.matrixLabel?.trim();

        objectivePayloads.push(predefinedObjectiveSeedEntry({
          sectionKey: config.sectionKey,
          objectiveKey: templateObjectiveKey,
          annualAssignmentId: termAssignment.annualAssignmentId,
          termAssignmentId: termAssignment._id,
          assessmentTermCode: termAssignment.assessmentTermCode,
          coverage,
          rowGroupKey: predefinedObjective.rowGroupKey,
          rowOrder: predefinedObjective.rowOrder,
          matrixCode,
          matrixLabel,
          columnValues: predefinedObjective.columnValues,
          columnBindingKeyById: config.columnBindingKeyById,
          columnTypeById: config.columnTypeById,
          payload: {
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
          matrixCode,
          matrixLabel,
          status: ObjectiveStatus.OBJECTIVE_APPROVED,
          attachments: [],
          createdByRole: 'SYSTEM',
          createdByUserId: actorId,
          createdBy: actorId,
          approvedAt: defaultDueDate ?? new Date(),
          approvedBy: actorId,
          },
        }));

        existingKeys.add(templateObjectiveKey);
        if (!alreadyExists) nextObjectiveNo += 1;
        seededTermAssignmentIds.add(termAssignmentId);
      }

      existingKeysByTermAssignment.set(termAssignmentId, existingKeys);
      nextObjectiveNoByTermAssignment.set(termAssignmentId, nextObjectiveNo);
    }

    if (objectivePayloads.length > 0) {
      await upsertObjectiveRowSeedEntries(objectivePayloads, actorId);
    }

    return seededTermAssignmentIds;
  }

  private async syncInitialTermAssignmentStates(
    annualAssignment: IAnnualAssignment,
    termAssignments: ITermAssignment[],
    seededTermAssignmentIds: Set<string>,
    termCycleById: Map<
      string,
      {
        assessmentTermCode?: QuarterCode;
        assessmentTermType?: AssessmentTermTypeType;
        objectiveSettingWindow?: { startDate?: Date; endDate?: Date };
        objectiveApprovalWindow?: { startDate?: Date; endDate?: Date };
        achievementSubmissionWindow?: PmsAchievementWindowSnapshot;
        managerReviewWindow?: { startDate?: Date; endDate?: Date };
        termFinalizationWindow?: { startDate?: Date; endDate?: Date };
      }
    >,
  ): Promise<void> {
    for (const termAssignment of termAssignments) {
      if (termAssignment.termState !== TermWorkflowState.NOT_STARTED) {
        continue;
      }

      const termCode = termAssignment.assessmentTermCode;
      const termCycle = termAssignment.cycleTermId
        ? termCycleById.get(termAssignment.cycleTermId.toString())
        : undefined;
      const effectiveWindows = resolveEffectiveTermWindows(
        termAssignment,
        termCycle,
        annualAssignment,
      );
      const customTermWindow = annualAssignment.assignmentWindowSnapshot?.terms?.[termCode];
      let transitionPlan: TermWorkflowState[];

      if (customTermWindow?.customFlowMode === 'CONTINUE_FROM_ACHIEVEMENT') {
        transitionPlan = this.initialTransitionPlanForWindows(
          effectiveWindows,
          customTermWindow.customFlowMode,
        );
      } else {
        const effectiveState = this.getEffectiveAssignmentTermState(
          termAssignment,
          termAssignments,
          termCycleById,
          annualAssignment,
        );
        transitionPlan = effectiveState === TermWorkflowState.OBJECTIVE_SETTING_OPEN
          ? [TermWorkflowState.OBJECTIVE_SETTING_OPEN]
          : [];
      }

      if (transitionPlan.length === 0) {
        continue;
      }

      const hasCustomFlowMode = Boolean(customTermWindow?.customFlowMode);
      const action =
        hasCustomFlowMode && customTermWindow?.customFlowMode !== 'REOPEN_OBJECTIVE_SETUP'
          ? `PMS_CUSTOM_ASSIGNMENT_${customTermWindow?.customFlowMode}`
          : seededTermAssignmentIds.has(termAssignment._id.toString())
          ? 'PMS_TERM_ASSIGNMENT_SEEDED_OBJECTIVE_SETTING_OPEN'
          : 'PMS_TERM_ASSIGNMENT_INITIAL_OBJECTIVE_SETTING_OPEN';
      const reason =
        hasCustomFlowMode && customTermWindow?.customFlowMode !== 'REOPEN_OBJECTIVE_SETUP'
          ? 'Admin selected a custom employee start stage and that custom window is active for this employee.'
          : effectiveWindows.windowSource === 'ASSIGNMENT_CUSTOM'
          ? 'Custom objective-setting window is active for this employee at assignment launch.'
          : 'Current objective-setting window is active at assignment launch.';

      for (const targetState of transitionPlan) {
        const updatedTermAssignment = await transitionTermAssignmentState(
          termAssignment._id.toString(),
          targetState,
          this.requireActor(),
          reason,
          action,
          {
            annualAssignmentId: annualAssignment._id.toString(),
            customFlowMode: customTermWindow?.customFlowMode,
            assessmentTermCode: termCode,
            windowSource: effectiveWindows.windowSource,
          },
        );
        termAssignment.termState = updatedTermAssignment.termState;
        termAssignment.previousTermState = updatedTermAssignment.previousTermState;
        termAssignment.lastTransitionAt = updatedTermAssignment.lastTransitionAt;
      }
    }
  }

  private initialTransitionPlanForWindows(
    windows: ReturnType<typeof resolveEffectiveTermWindows>,
    customFlowMode?: PmsAssignmentTermWindowSnapshot['customFlowMode'],
  ): TermWorkflowState[] {
    if (customFlowMode === 'CONTINUE_FROM_ACHIEVEMENT') {
      if (this.isWindowActive(windows.managerReviewWindow)) {
        return [
          TermWorkflowState.OBJECTIVE_SETTING_OPEN,
          TermWorkflowState.OBJECTIVE_APPROVED,
          TermWorkflowState.MANAGER_REVIEW_OPEN,
        ];
      }

      if (this.isWindowActive(windows.termFinalizationWindow)) {
        return [
          TermWorkflowState.OBJECTIVE_SETTING_OPEN,
          TermWorkflowState.OBJECTIVE_APPROVED,
          TermWorkflowState.MANAGER_REVIEW_OPEN,
          TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
        ];
      }

      return [];
    }

    if (this.isWindowActive(windows.objectiveSettingWindow)) {
      return [TermWorkflowState.OBJECTIVE_SETTING_OPEN];
    }

    return [];
  }

  private isWindowActive(
    window?: { startDate?: Date; endDate?: Date },
  ): boolean {
    if (!window?.startDate || !window?.endDate) {
      return false;
    }

    const now = new Date(this.getCurrentDate());
    const start = new Date(window.startDate);
    const end = new Date(window.endDate);
    now.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return now >= start && now <= end;
  }

  private getEffectiveAssignmentTermState(
    termAssignment: Pick<ITermAssignment, '_id' | 'assessmentTermCode' | 'assessmentTermType' | 'termState' | 'cycleTermId'>,
    assignmentTerms: Array<Pick<ITermAssignment, '_id' | 'assessmentTermCode' | 'assessmentTermType' | 'termState' | 'cycleTermId'>>,
    termCycleMap: Map<string, any>,
    annualAssignment: unknown,
  ): TermWorkflowState {
    if (termAssignment.termState !== TermWorkflowState.NOT_STARTED) {
      return termAssignment.termState;
    }

    const orderedTerms = [...assignmentTerms].sort((left, right) => {
      const orderedCodes = getAssessmentTerms(
        left.assessmentTermType ?? getDefaultAssessmentTermType(),
      );
      const leftRank = orderedCodes.indexOf(left.assessmentTermCode);
      const rightRank = orderedCodes.indexOf(right.assessmentTermCode);
      if (leftRank !== rightRank) return leftRank - rightRank;

      const leftCycle = left.cycleTermId
        ? termCycleMap.get(left.cycleTermId.toString())
        : undefined;
      const rightCycle = right.cycleTermId
        ? termCycleMap.get(right.cycleTermId.toString())
        : undefined;
      return (
        new Date(leftCycle?.startDate ?? 0).getTime() -
        new Date(rightCycle?.startDate ?? 0).getTime()
      );
    });

    for (const currentTerm of orderedTerms) {
      if (this.isTermPastObjectiveSetting(currentTerm.termState)) {
        continue;
      }

      if (
        currentTerm._id.toString() !== termAssignment._id.toString() ||
        currentTerm.termState !== TermWorkflowState.NOT_STARTED
      ) {
        return termAssignment.termState;
      }

      const termCycle = currentTerm.cycleTermId
        ? termCycleMap.get(currentTerm.cycleTermId.toString())
        : undefined;
      const windows = resolveEffectiveTermWindows(
        currentTerm as ITermAssignment,
        termCycle,
        annualAssignment as IAnnualAssignment,
      );

      return this.isWindowActive(windows.objectiveSettingWindow)
        ? TermWorkflowState.OBJECTIVE_SETTING_OPEN
        : termAssignment.termState;
    }

    return termAssignment.termState;
  }

  private isTermPastObjectiveSetting(termState: TermWorkflowState): boolean {
    const pastStates = new Set<TermWorkflowState>([
      TermWorkflowState.OBJECTIVE_APPROVED,
      TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
      TermWorkflowState.MANAGER_REVIEW_OPEN,
      TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
      TermWorkflowState.TERM_FINALIZED,
      TermWorkflowState.CLOSED_BY_ADMIN,
    ]);
    return pastStates.has(termState);
  }

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
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
      sectionKey: objectiveSection.sectionKey,
      columnBindingKeyById: Object.fromEntries(
        (objectiveSection.objectiveConfig.tableLayout?.columns ?? []).map((column) => [
          column.columnId,
          column.bindingKey,
        ]),
      ),
      columnTypeById: Object.fromEntries(
        (objectiveSection.objectiveConfig.tableLayout?.columns ?? []).map((column) => [
          column.columnId,
          column.type,
        ]),
      ),
      predefinedObjectives: (objectiveSection.objectiveConfig.predefinedObjectives ?? []).map(
        (objective: ITemplatePredefinedObjective, index: number) => {
          const key = this.buildDeterministicTemplateObjectiveKey(objectiveSection.sectionKey, objective, index);
          const rowAssignment = objectiveSection.objectiveConfig?.tableLayout?.rowAssignments?.find(
            (assignment) => assignment.objectiveKey === key,
          );
          return ({
          key,
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
          columnValues: objective.columnValues,
          rowGroupKey: objective.rowGroupKey ?? rowAssignment?.rowGroupKey,
          rowOrder: objective.rowOrder ?? rowAssignment?.displayOrder ?? index,
          matrixCode: objective.matrixCode,
          matrixLabel: objective.matrixLabel,
        });
        },
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
    if (Array.isArray(quarters) && quarters.length === 0) {
      throw new Error('Select at least one assessment term to assign this employee.');
    }

    const normalized = quarters ? quarters : allowedQuarters;
    const seen = new Set<QuarterCode>();

    for (const quarter of normalized) {
      if (!allowedQuarters.includes(quarter)) {
        throw new Error('Selected terms do not match this cycle type. Please choose valid terms for this cycle.');
      }
      if (seen.has(quarter)) {
        throw new Error(`Duplicate applicable assessment term: ${quarter}`);
      }
      seen.add(quarter);
    }

    return allowedQuarters.filter((quarter) => seen.has(quarter));
  }

  private buildAssignmentWindowSnapshot(
    input: AssignEmployeeInput,
    applicableTerms: QuarterCode[],
  ): PmsAssignmentWindowSnapshot | undefined {
    const incomingSnapshot = input.assignmentWindowSnapshot;
    const hasIncomingTerms = Boolean(
      incomingSnapshot?.terms && Object.keys(incomingSnapshot.terms).length > 0,
    );

    if (!input.specialWindowOverride && !hasIncomingTerms) {
      return undefined;
    }

    if (input.specialWindowOverride !== true) {
      throw new Error('Custom assignment window permission is required to reopen objective setup dates for this employee.');
    }

    const reason = String(input.specialWindowReason || incomingSnapshot?.reason || '').trim();
    if (!reason) {
      throw new Error('Enter a reason for the custom assignment window.');
    }

    if (!hasIncomingTerms) {
      throw new Error('Add at least one custom assessment-term window.');
    }

    const applicableTermSet = new Set(applicableTerms);
    const terms: Partial<Record<QuarterCode, PmsAssignmentTermWindowSnapshot>> = {};

    for (const [rawTermCode, rawTermWindow] of Object.entries(incomingSnapshot?.terms ?? {})) {
      const termCode = rawTermCode as QuarterCode;
      if (!applicableTermSet.has(termCode)) {
        throw new Error(`Custom window term ${termCode} must be selected as an applicable term.`);
      }

      const normalizedTermWindow = this.normalizeAssignmentTermWindow(
        termCode,
        rawTermWindow as PmsAssignmentTermWindowSnapshot,
      );

      if (normalizedTermWindow) {
        terms[termCode] = normalizedTermWindow;
      }
    }

    if (Object.keys(terms).length === 0) {
      throw new Error('Add at least one valid custom assessment-term window.');
    }

    return {
      mode: incomingSnapshot?.mode || 'CUSTOM_ADMIN_OVERRIDE',
      specialWindowOverride: true,
      reason,
      createdBy: this.actorIdObject(),
      createdAt: this.getCurrentDate(),
      terms,
    };
  }

  private normalizeAssignmentTermWindow(
    termCode: QuarterCode,
    termWindow: PmsAssignmentTermWindowSnapshot,
  ): PmsAssignmentTermWindowSnapshot | undefined {
    const rawCustomFlowMode = String(termWindow.customFlowMode || 'REOPEN_OBJECTIVE_SETUP').trim();
    if (
      rawCustomFlowMode !== 'REOPEN_OBJECTIVE_SETUP' &&
      rawCustomFlowMode !== 'CONTINUE_FROM_ACHIEVEMENT'
    ) {
      throw new Error(`${termCode} custom flow mode is invalid.`);
    }
    const customFlowMode = rawCustomFlowMode as NonNullable<
      PmsAssignmentTermWindowSnapshot['customFlowMode']
    >;

    const normalized: PmsAssignmentTermWindowSnapshot = {
      windowSource: 'ASSIGNMENT_CUSTOM',
      customFlowMode,
    };

    normalized.objectiveSettingWindow = this.normalizeDateWindow(
      termWindow.objectiveSettingWindow,
      `${termCode} objective setting`,
    );
    normalized.objectiveApprovalWindow = this.normalizeDateWindow(
      termWindow.objectiveApprovalWindow,
      `${termCode} objective approval`,
    );
    normalized.achievementSubmissionWindow = this.normalizeAchievementWindow(
      termWindow.achievementSubmissionWindow,
      `${termCode} achievement submission`,
    );
    normalized.managerReviewWindow = this.normalizeDateWindow(
      termWindow.managerReviewWindow,
      `${termCode} manager review`,
    );
    normalized.termFinalizationWindow = this.normalizeDateWindow(
      termWindow.termFinalizationWindow,
      `${termCode} finalization`,
    );

    this.assertSkippedCustomWindowsAreEmpty(termCode, normalized);

    const hasAnyWindow = Boolean(
      normalized.objectiveSettingWindow ||
      normalized.objectiveApprovalWindow ||
      normalized.achievementSubmissionWindow ||
      normalized.managerReviewWindow ||
      normalized.termFinalizationWindow,
    );

    if (!hasAnyWindow) {
      return undefined;
    }

    this.assertWindowSequence(termCode, normalized);
    return normalized;
  }

  private normalizeDateWindow(
    window: PmsDateWindowSnapshot | undefined,
    label: string,
  ): PmsDateWindowSnapshot | undefined {
    if (!window?.startDate && !window?.endDate) {
      return undefined;
    }

    if (!window.startDate || !window.endDate) {
      throw new Error(`${label} window requires both start and end dates.`);
    }

    const startDate = this.parseWindowDate(window.startDate, `${label} start date`);
    const endDate = this.parseWindowDate(window.endDate, `${label} end date`);
    if (startDate > endDate) {
      throw new Error(`${label} end date cannot be before start date.`);
    }

    return { startDate, endDate };
  }

  private normalizeAchievementWindow(
    window: PmsAchievementWindowSnapshot | undefined,
    label: string,
  ): PmsAchievementWindowSnapshot | undefined {
    const dateWindow = this.normalizeDateWindow(window, label);
    const dueDate = window?.dueDate
      ? this.parseWindowDate(window.dueDate, `${label} due date`)
      : undefined;

    if (!dateWindow && !dueDate && window?.enabled !== true) {
      return undefined;
    }

    if (!dateWindow) {
      throw new Error(`${label} window requires both start and end dates.`);
    }

    if (dueDate && dateWindow.startDate && dueDate < dateWindow.startDate) {
      throw new Error(`${label} due date cannot be before start date.`);
    }

    return {
      ...dateWindow,
      enabled: window?.enabled !== false,
      dueDate,
      graceDays: Number.isFinite(window?.graceDays) ? Number(window?.graceDays) : undefined,
      reminderDaysBefore: Array.isArray(window?.reminderDaysBefore)
        ? window.reminderDaysBefore.map(Number).filter(Number.isFinite)
        : undefined,
      escalationDaysAfterDue: Number.isFinite(window?.escalationDaysAfterDue)
        ? Number(window?.escalationDaysAfterDue)
        : undefined,
    };
  }

  private parseWindowDate(value: unknown, label: string): Date {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid ${label}.`);
    }
    return date;
  }

  private assertSkippedCustomWindowsAreEmpty(
    termCode: QuarterCode,
    termWindow: PmsAssignmentTermWindowSnapshot,
  ): void {
    const mode = termWindow.customFlowMode || 'REOPEN_OBJECTIVE_SETUP';
    const stageOrder = [
      'objectiveSetting',
      'objectiveApproval',
      'achievement',
      'managerReview',
      'finalization',
    ] as const;
    const modeStartStage: Record<
      NonNullable<PmsAssignmentTermWindowSnapshot['customFlowMode']>,
      (typeof stageOrder)[number]
    > = {
      REOPEN_OBJECTIVE_SETUP: 'objectiveSetting',
      CONTINUE_FROM_ACHIEVEMENT: 'achievement',
    };
    const startIndex = stageOrder.indexOf(modeStartStage[mode]);
    const stageWindows = {
      objectiveSetting: termWindow.objectiveSettingWindow,
      objectiveApproval: termWindow.objectiveApprovalWindow,
      achievement: termWindow.achievementSubmissionWindow,
      managerReview: termWindow.managerReviewWindow,
      finalization: termWindow.termFinalizationWindow,
    };

    for (const [index, stage] of stageOrder.entries()) {
      if (index >= startIndex || !stageWindows[stage]) continue;
      const label = stage
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase();
      throw new Error(`${termCode} ${label} window must be empty because it is skipped by this custom flow.`);
    }
  }

  private assertWindowSequence(
    termCode: QuarterCode,
    termWindow: PmsAssignmentTermWindowSnapshot,
  ): void {
    const orderedWindows = [
      ['objective setting', termWindow.objectiveSettingWindow],
      ['objective approval', termWindow.objectiveApprovalWindow],
      ['achievement submission', termWindow.achievementSubmissionWindow],
      ['manager review', termWindow.managerReviewWindow],
      ['finalization', termWindow.termFinalizationWindow],
    ] as const;

    const allowContinueSameDayException =
      this.isContinueFromAchievementSameDayException(termWindow);

    let previousLabel = '';
    let previousEndDate: Date | undefined;
    for (const [label, window] of orderedWindows) {
      if (!window?.startDate || !window?.endDate) {
        continue;
      }

      if (
        previousEndDate &&
        window.startDate <= previousEndDate &&
        !allowContinueSameDayException
      ) {
        throw new Error(`${termCode} ${label} window must start after ${previousLabel} ends.`);
      }

      previousLabel = label;
      previousEndDate = window.endDate;
    }
  }

  private isContinueFromAchievementSameDayException(
    termWindow: PmsAssignmentTermWindowSnapshot,
  ): boolean {
    if (termWindow.customFlowMode !== 'CONTINUE_FROM_ACHIEVEMENT') {
      return false;
    }
    if (termWindow.objectiveSettingWindow || termWindow.objectiveApprovalWindow) {
      return false;
    }

    const windows = [
      termWindow.achievementSubmissionWindow,
      termWindow.managerReviewWindow,
      termWindow.termFinalizationWindow,
    ];
    if (windows.some((window) => !window?.startDate || !window?.endDate)) {
      return false;
    }

    const normalizedWindows = windows as Array<{ startDate: Date; endDate: Date }>;
    const dateKey = this.toWindowDateKey(normalizedWindows[0].startDate);
    return normalizedWindows.every(
      (window) =>
        this.toWindowDateKey(window.startDate) === dateKey &&
        this.toWindowDateKey(window.endDate) === dateKey,
    );
  }

  private toWindowDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
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

  private async assertCycleExists(cycleId: Types.ObjectId): Promise<{ _id: Types.ObjectId; status?: AnnualWorkflowState }>{
    const cycle = await AnnualCycle.findById(cycleId).select('_id status').lean();
    if (!cycle) {
      throw new Error('Annual cycle not found');
    }
    return cycle as { _id: Types.ObjectId; status?: AnnualWorkflowState };
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

    if (
      mappedRole === PmsRole.ADMIN ||
      String(actor.actorRole || '').trim().toUpperCase() === 'HR'
    ) {
      return;
    }

    if (mappedRole === PmsRole.EMPLOYEE) {
      filter.employeeId = this.toObjectId(actor.actorId, 'actorId');
      return;
    }

    if (mappedRole === PmsRole.MANAGER) {
      const managerId = this.toObjectId(actor.actorId, 'actorId');
      const delegatedClauses = await this.delegatedAssignmentClausesForActor(actor.actorId);
      if (delegatedClauses.length > 0) {
        filter.$and = [
          ...((filter.$and as Record<string, unknown>[] | undefined) ?? []),
          { $or: [{ assignedManagerId: managerId }, ...delegatedClauses] },
        ];
      } else {
        filter.assignedManagerId = managerId;
      }
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

    if (await this.hasActivePmsWorkDelegationForAssignment(actor.actorId, annualAssignment)) {
      return;
    }

    throw new Error(access.message ?? 'Access denied');
  }

  private async delegatedAssignmentClausesForActor(actorId: string): Promise<Record<string, unknown>[]> {
    const delegations = await new DelegationService(this.context).getActivePmsWorkDelegationsForDelegate(actorId);

    return delegations.map((delegation) => {
      if (delegation.annualAssignmentId) {
        return {
          _id: delegation.annualAssignmentId,
          assignedManagerId: delegation.delegatorUserId,
        };
      }

      const clause: Record<string, unknown> = {
        assignedManagerId: delegation.delegatorUserId,
      };
      if (delegation.cycleId) {
        clause.cycleId = delegation.cycleId;
      }
      return clause;
    });
  }

  private async hasActivePmsWorkDelegationForAssignment(
    actorId: string,
    annualAssignment: IAnnualAssignment,
  ): Promise<boolean> {
    const delegations = await new DelegationService(this.context).getActivePmsWorkDelegationsForDelegate(actorId);
    const assignmentId = annualAssignment._id.toString();
    const managerId = annualAssignment.assignedManagerId.toString();
    const cycleId = annualAssignment.cycleId.toString();

    return delegations.some((delegation) => {
      if (delegation.delegatorUserId?.toString() !== managerId) return false;
      if (delegation.cycleId && delegation.cycleId.toString() !== cycleId) return false;
      if (delegation.annualAssignmentId && delegation.annualAssignmentId.toString() !== assignmentId) return false;
      return true;
    });
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
    const actor = this.requireActor();
    if (String(actor.actorRole || '').trim().toUpperCase() === 'HR') {
      return;
    }
    const access = await accessService.canPerform({
      actor,
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
