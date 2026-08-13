import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualDecisionStatus,
  AnnualWorkflowState,
  AppraisalOutcomeType,
  getAssessmentTerms,
  getDefaultAssessmentTermType,
  isTermFinalized,
  normalizePmsRole,
  PmsRole,
  PmsTemplateSectionType,
  TermWorkflowState,
} from '../constants/pms.enums';
import {
  AnnualAssignment,
  EmployeeCareerProfileSnapshotTrigger,
} from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { AnnualDecisionValue } from '../models/pms-annual-decision-value.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { PerformanceHistorySnapshot } from '../models/pms-performance-history-snapshot.model';
import { VisibilityConfiguration } from '../models/pms-visibility-configuration.model';
import { Objective } from '../models/pms-objective.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import { TermReview } from '../models/pms-term-review.model';
import { TermReviewValue } from '../models/pms-term-review-value.model';
import { ManagerReviewPeriodAssignment } from '../models/pms-manager-review-period-assignment.model';
import { EmployeeAchievementSubmission } from '../models/pms-employee-achievement-submission.model';
import { AuditLog } from '../models/audit-log.model';
import { auditService } from './audit.service';
import { DelegationService } from './delegation.service';
import { visibilityMaskService } from './visibilityMask.service';
import {
  PmsTemplateService,
  type ResolvedTemplateField,
  type ResolvedTemplateVersion,
} from './pms-template.service';
import { PmsScoringService } from './pms-scoring.service';
import { PmsEmployeeCareerProfileSnapshotService } from './pmsEmployeeCareerProfileSnapshot.service';
import { ObjectiveMatrixService } from './objective-matrix.service';
import type {
  AnnualObjectiveMatrixResponse,
  ObjectiveMatrixMode,
} from '../types/pms-objective-matrix';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IAnnualCycle } from '../models/pms-annual-cycle.model';
import type { IAnnualDecision } from '../models/pms-annual-decision.model';
import type { IObjective } from '../models/pms-objective.model';
import type { ITermAssignment } from '../models/pms-term-assignment.model';
import type { AppraisalOutcomeType as AppraisalOutcomeTypeType } from '../constants/pms.enums';
import type { IAnnualDecisionValue } from '../models/pms-annual-decision-value.model';
import { PmsTemplateVersion, type ITemplateField, type ITemplateSection } from '../models/pms-template-version.model';
import { PmsTemplate } from '../models/pms-template.model';
import { LOV } from '../models/lov.model';
import { User } from '../models/user.model';
import { FinalReviewStatus, FinalReviewerSource, resolveFinalReviewer } from '../utilis/finalReviewer';

type AppraisalWindowType = 'FIXED_DATE' | 'FIXED_RANGE' | 'RELATIVE_OFFSET';
type AppraisalWindowBase =
  | 'Q4_FINALIZATION'
  | 'ALL_APPLICABLE_QUARTERS_FINALIZED'
  | 'ANNUAL_CYCLE_END';

type AppraisalWindowConfigInput = {
  type?: AppraisalWindowType;
  mode?: string;
  date?: Date | string;
  startDate?: Date | string;
  endDate?: Date | string;
  base?: AppraisalWindowBase;
  offsetDays?: number;
  durationDays?: number;
};

type AnnualDecisionAction = 'SAVE_DRAFT' | 'SUBMIT' | 'FREEZE' | 'UPDATE_VISIBILITY' | 'REOPEN';
type AnnualDecisionGateAction = 'SAVE_DRAFT' | 'SUBMIT' | 'FREEZE';
type FinalReviewStage = 'L2' | 'DIRECTOR';

const FINAL_REVIEW_QUEUE_STATES: AnnualWorkflowState[] = [
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
];

const FINAL_REVIEW_ROLLUP_CANDIDATE_STATES: AnnualWorkflowState[] = [
  AnnualWorkflowState.DRAFT,
  AnnualWorkflowState.SCHEDULED,
  AnnualWorkflowState.ACTIVE,
  AnnualWorkflowState.IN_PROGRESS,
];

const FINAL_REVIEW_VISIBLE_STATUSES = [
  FinalReviewStatus.PENDING,
  FinalReviewStatus.IN_PROGRESS,
  FinalReviewStatus.COMPLETED,
];

export function assertFinalReviewFreezeAllowed(
  l2Status: string,
  directorStatus: string = FinalReviewStatus.NOT_REQUIRED,
): void {
  const completed = (status: string) =>
    status === FinalReviewStatus.NOT_REQUIRED || status === FinalReviewStatus.COMPLETED;
  if (!completed(l2Status) || !completed(directorStatus)) {
    throw new Error('L2 and L3 assessments must be completed before finalisation');
  }
}

export function isFinalReviewerFieldEditable(field: Record<string, any>): boolean {
  return (field.behaviors ?? []).some(
    (behavior: Record<string, unknown>) =>
      behavior.role === 'DIRECTOR' &&
      behavior.visibility === 'VISIBLE' &&
      behavior.editability === 'EDITABLE',
  );
}

export function validateSubmittedDecisionOverrideReason(
  decisionStatus: string | undefined,
  reason: string | undefined,
): string | undefined {
  const normalizedReason = reason?.trim();
  if (
    decisionStatus === AnnualDecisionStatus.SUBMITTED &&
    !normalizedReason
  ) {
    throw new Error('Override reason is required to correct a submitted annual decision');
  }
  return normalizedReason;
}

export function isFinalReviewerOwnedDecisionValue(
  value: { roleCode?: string | null },
): boolean {
  return String(value.roleCode ?? '').toUpperCase() === 'DIRECTOR';
}

// Current client flow carries a mandatory manager rating into the annual
// decision and intentionally leaves numeric scoring inactive.
const RATING_ONLY_MANAGER_REVIEW = true;

interface AnnualDecisionReadiness {
  isAppraisalWindowOpen: boolean;
  termProgress: {
    total: number;
    completed: number;
  };
  allTermsFinalized: boolean;
  availableActions: AnnualDecisionAction[];
  lockedReason?: string;
}

export interface AnnualSummaryResult {
  annualAssignment: Record<string, unknown> & {
    isAppraisalWindowOpen: boolean;
    termProgress: {
      total: number;
      completed: number;
    };
    availableActions: AnnualDecisionAction[];
    lockedReason?: string;
  };
  termAssignments: Array<Record<string, unknown>>;
  objectives: IObjective[];
  termReviews: Array<Record<string, unknown>>;
  managerReviewPeriods: Array<Record<string, unknown>>;
  annualDecisionValues: Array<Record<string, unknown>>;
  calculatedFinalScore?: number;
  proposedFinalRating?: string;
  finalScoreOverride: Record<string, unknown> | null;
  finalRatingOverride: Record<string, unknown> | null;
  visibilityConfiguration: Record<string, unknown> | null;
  annualDecision: Record<string, unknown> | null;
  correctionHistory: Array<Record<string, unknown>>;
  preReopenSnapshots: Array<Record<string, unknown>>;
  objectiveMatrix: AnnualObjectiveMatrixResponse | null;
  objectiveMatrixIntegrity: {
    source: 'LIVE_ROLE_MASKED';
    liveContentHash?: string;
    frozenContentHash?: string;
    matchesFrozen?: boolean;
  };
  finalReview?: {
    status: string;
    stage?: FinalReviewStage;
    stageLabel?: string;
    reviewer?: Record<string, unknown>;
    l2Status?: string;
    directorStatus?: string;
    previousStage?: {
      stage: 'L2';
      label: string;
      status: string;
      enteredBy?: Record<string, unknown>;
      completedAt?: string;
      fields: Array<Record<string, unknown>>;
      values: Array<Record<string, unknown>>;
    };
    fields: Array<Record<string, unknown>>;
    values: Array<Record<string, unknown>>;
    availableActions: Array<'SAVE' | 'COMPLETE'>;
  };
  reviewContext: {
    fieldCatalog: Array<Record<string, unknown>>;
    employeeSubmission: Record<string, unknown> | null;
    employeeSubmissions: Array<Record<string, unknown>>;
  };
}

export function assertObjectiveMatrixFreezeIntegrity(
  matrix: AnnualObjectiveMatrixResponse | null,
): void {
  if (!matrix) return;
  if (!/^[a-f0-9]{64}$/.test(matrix.contentHash || '')) {
    throw new Error('Objective matrix content hash is invalid; reload before freezing');
  }
  if (!Number.isInteger(matrix.layoutVersion) || matrix.layoutVersion < 1) {
    throw new Error('Objective matrix layout version is invalid; reload before freezing');
  }
  if (!Number.isInteger(matrix.contentVersion) || matrix.contentVersion < 1) {
    throw new Error('Objective matrix content version is invalid; reload before freezing');
  }
}

export function buildObjectiveEvidenceSnapshotManifest(
  matrix: AnnualObjectiveMatrixResponse | null,
): Array<{
  objectiveRowKey: string;
  termCode: string;
  evidenceId?: string;
  evidenceVersion: number;
  attachmentId: string;
  documentId: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  uploadedAt: string;
}> {
  if (!matrix) return [];
  return matrix.rows.flatMap((row) =>
    matrix.termOrder.flatMap((termCode) => {
      const evidence = row.evidenceByTerm?.[termCode];
      const attachment = evidence?.attachment;
      if (!evidence || !attachment) return [];
      return [{
        objectiveRowKey: row.objectiveRowKey,
        termCode,
        evidenceId: evidence.evidenceId,
        evidenceVersion: evidence.version,
        attachmentId: attachment.id,
        documentId: attachment.documentId,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        uploadedAt: attachment.uploadedAt,
      }];
    }),
  );
}

export function maskStoredObjectiveMatrixSnapshot(
  value: unknown,
  canSeeStoredAdminObjectiveMatrix: boolean,
): unknown {
  if (
    canSeeStoredAdminObjectiveMatrix ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return value;
  }

  const masked = { ...(value as Record<string, unknown>) };
  delete masked.objectiveMatrix;
  delete masked.objectiveMatricesByView;
  delete masked.objectiveEvidenceManifest;
  return masked;
}

export interface AnnualDecisionListQuery {
  cycleId?: string;
  employeeId?: string;
  search?: string;
  finalDecisionStatus?: string;
  annualState?: string;
}

export interface AnnualDecisionListItem {
  annualAssignmentId: string;
  cycleId: string;
  cycleName: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  employeeNo?: string;
  designation?: string;
  employeeDesignation?: string;
  department?: string;
  departmentId?: string;
  managerId: string;
  managerName: string;
  annualState: string;
  finalDecisionStatus: string;
  termProgress: {
    total: number;
    completed: number;
  };
  visibility: {
    employeeReviewVisible: boolean;
    employeeGradeVisible: boolean;
    employeeMeritVisible: boolean;
    managerGradeVisible: boolean;
    managerMeritVisible: boolean;
  };
  isAppraisalWindowOpen: boolean;
  availableActions: AnnualDecisionAction[];
  lockedReason?: string;
  finalReviewStatus: string;
  finalReviewerId?: string;
  finalReviewerName?: string;
  directorReviewStatus?: string;
  directorReviewerId?: string;
  directorReviewerName?: string;
}

export interface SaveDecisionDraftInput {
  isGradeApplied: boolean;
  isMeritApplied: boolean;
  gradeDetails?: Record<string, unknown>;
  meritDetails?: Record<string, unknown>;
  nilReason?: string;
  managementRemarks?: string;
  finalScore?: number;
  finalRating?: string;
  decisionValues?: AnnualDecisionValueInput[];
  overrideReason?: string;
}

interface AnnualDecisionValueInput {
  templateFieldId?: string;
  fieldKey: string;
  sectionKey: string;
  roleCode?: string;
  actorUserId?: string;
  valueJson?: unknown;
  valueText?: string;
  valueNumber?: number;
  valueDate?: string;
}

export interface ReopenDecisionInput {
  reason: string;
}
export interface SaveFinalReviewInput {
  decisionValues: AnnualDecisionValueInput[];
}
export interface ReassignFinalReviewerInput {
  reviewerId: string;
  reason: string;
  reviewStage?: FinalReviewStage;
}

export interface OverrideFinalScoreInput {
  overrideScore: number;
  reason: string;
}

export interface OverrideFinalRatingInput {
  overrideRating: string;
  reason: string;
}

export interface UpdateVisibilityInput {
  employeeReviewVisible?: boolean;
  employeeGradeVisible?: boolean;
  employeeMeritVisible?: boolean;
  managerGradeVisible?: boolean;
  managerMeritVisible?: boolean;
  visibleFrom?: Date | string;
  reason?: string;
}

export class AnnualDecisionService extends BaseService {
  private readonly scoringService = new PmsScoringService();

  constructor(context: RequestContext) {
    super(context);
  }

  async listAssignments(query: AnnualDecisionListQuery = {}): Promise<AnnualDecisionListItem[]> {
    const filter: Record<string, unknown> = { isDeleted: false };
    await this.applyScopedAssignmentFilter(filter);
    const actor = this.requireActor();
    const actorId = actor.actorId;
    const actorRole = normalizePmsRole(actor.actorRole);
    const isAdminActor = actorRole === PmsRole.ADMIN;

    if (query.cycleId?.trim()) {
      filter.cycleId = this.toObjectId(query.cycleId, 'cycleId');
    }

    if (query.employeeId?.trim()) {
      filter.employeeId = this.toObjectId(query.employeeId, 'employeeId');
    }

    if (query.finalDecisionStatus && query.finalDecisionStatus !== 'ALL') {
      filter.finalDecisionStatus = query.finalDecisionStatus;
    }

    if (query.annualState && query.annualState !== 'ALL') {
      filter.annualState = query.annualState;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$or = [
        { 'employeeSnapshot.name': { $regex: search, $options: 'i' } },
        { 'employeeSnapshot.employeeCode': { $regex: search, $options: 'i' } },
        { 'managerSnapshot.name': { $regex: search, $options: 'i' } },
      ];
    }

    const annualAssignments = await AnnualAssignment.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    if (annualAssignments.length === 0) {
      return [];
    }

    const [termAssignments, annualDecisions, cycles] = await Promise.all([
      TermAssignment.find({
        annualAssignmentId: { $in: annualAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
      AnnualDecision.find({
        annualAssignmentId: { $in: annualAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
      AnnualCycle.find({
        _id: { $in: annualAssignments.map((item) => item.cycleId) },
        isDeleted: false,
      }).lean(),
    ]);

    const termAssignmentsByAnnualAssignmentId = new Map<string, typeof termAssignments>();
    for (const termAssignment of termAssignments) {
      const key = termAssignment.annualAssignmentId.toString();
      const bucket = termAssignmentsByAnnualAssignmentId.get(key) ?? [];
      bucket.push(termAssignment);
      termAssignmentsByAnnualAssignmentId.set(key, bucket);
    }

    const decisionByAnnualAssignmentId = new Map(
      annualDecisions.map((item) => [item.annualAssignmentId.toString(), item]),
    );
    const cycleMap = new Map(cycles.map((item) => [item._id.toString(), item]));

    const listItems = await Promise.all(annualAssignments.map(async (annualAssignment) => {
      const relatedQuarters = termAssignmentsByAnnualAssignmentId.get(annualAssignment._id.toString()) ?? [];
      const decision = decisionByAnnualAssignmentId.get(annualAssignment._id.toString());
      const cycle = cycleMap.get(annualAssignment.cycleId.toString());
      const employeeSnapshot = annualAssignment.employeeSnapshot ?? {};
      const employeeCode = String(employeeSnapshot.employeeCode ?? '');
      const employeeDesignation = String(
        employeeSnapshot.specificRole ??
        employeeSnapshot.designation ??
        employeeSnapshot.role ??
        '',
      );
      const employeeDepartment = String(
        employeeSnapshot.department ??
        employeeSnapshot.departmentName ??
        employeeSnapshot.departmentId ??
        '',
      );
      const finalDecisionStatus =
        decision?.decisionStatus ??
        annualAssignment.finalDecisionStatus ??
        AnnualDecisionStatus.DRAFT;
      const readiness = await this.resolveAnnualDecisionReadiness(
        annualAssignment,
        relatedQuarters,
        finalDecisionStatus,
        cycle,
      );

      return {
        annualAssignmentId: annualAssignment._id.toString(),
        cycleId: annualAssignment.cycleId.toString(),
        cycleName: cycle?.name ?? 'Performance Cycle',
        cycleStartDate: cycle?.startDate?.toISOString(),
        cycleEndDate: cycle?.endDate?.toISOString(),
        employeeId: annualAssignment.employeeId.toString(),
        employeeName: String(employeeSnapshot.name ?? 'Employee'),
        employeeCode,
        employeeNo: employeeCode,
        designation: employeeDesignation,
        employeeDesignation,
        department: employeeDepartment,
        departmentId: String(employeeSnapshot.departmentId ?? employeeDepartment),
        managerId: annualAssignment.assignedManagerId.toString(),
        managerName: String(annualAssignment.managerSnapshot?.name ?? 'Manager'),
        annualState: annualAssignment.annualState,
        finalDecisionStatus,
        termProgress: readiness.termProgress,
        visibility: {
          employeeReviewVisible: annualAssignment.visibility.employeeReviewVisible,
          employeeGradeVisible: annualAssignment.visibility.employeeGradeVisible,
          employeeMeritVisible: annualAssignment.visibility.employeeMeritVisible,
          managerGradeVisible: annualAssignment.visibility.managerGradeVisible,
          managerMeritVisible: annualAssignment.visibility.managerMeritVisible,
        },
        isAppraisalWindowOpen: readiness.isAppraisalWindowOpen,
        availableActions:
          !isAdminActor &&
          annualAssignment.directorReviewerId?.toString() === actorId
            ? readiness.availableActions
            : [],
        lockedReason: readiness.lockedReason,
        finalReviewStatus: annualAssignment.finalReviewStatus,
        finalReviewerId: annualAssignment.finalReviewerId?.toString(),
        finalReviewerName: annualAssignment.finalReviewerSnapshot?.name,
        directorReviewStatus: annualAssignment.directorReviewStatus,
        directorReviewerId: annualAssignment.directorReviewerId?.toString(),
        directorReviewerName: annualAssignment.directorReviewerSnapshot?.name,
      };
    }));

    return listItems;
  }

  async getSummary(annualAssignmentId: string): Promise<AnnualSummaryResult> {
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    await this.assertDecisionReadAccess('annualDecision.summary', annualAssignment);

    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      assessmentTermCode: { $in: annualAssignment.applicableTerms },
      isDeleted: false,
    }).sort({ assessmentTermCode: 1 });

    const termAssignmentIds = termAssignments.map((termAssignment) => termAssignment._id);

    const [
      objectives,
      termReviews,
      managerReviewPeriods,
      annualDecision,
      visibilityConfiguration,
      cycle,
      employeeSubmission,
      employeeSubmissions,
      contextTemplateVersion,
    ] = await Promise.all([
      Objective.find({ termAssignmentId: { $in: termAssignmentIds } }),
      TermReview.find({ termAssignmentId: { $in: termAssignmentIds }, isDeleted: false }),
      ManagerReviewPeriodAssignment.find({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }).sort({ reviewCode: 1 }),
      AnnualDecision.findOne({ annualAssignmentId: annualAssignment._id }),
      VisibilityConfiguration.findOne({ annualAssignmentId: annualAssignment._id }),
      AnnualCycle.findById(annualAssignment.cycleId).lean(),
      EmployeeAchievementSubmission.findOne({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }).lean(),
      EmployeeAchievementSubmission.find({
        termAssignmentId: { $in: termAssignmentIds },
        isDeleted: false,
      })
        .sort({ assessmentTermCode: 1, createdAt: 1 })
        .lean(),
      annualAssignment.templateVersionId
        ? PmsTemplateVersion.findById(annualAssignment.templateVersionId).select('sections').lean()
        : null,
    ]);
    const termReviewIds = termReviews.map((review) => review._id);
    const termReviewValues = termReviewIds.length
      ? await TermReviewValue.find({
          termReviewId: { $in: termReviewIds },
          isDeleted: false,
        })
          .sort({ createdAt: 1 })
          .lean()
      : [];
    const termReviewValuesByReviewId = new Map<string, typeof termReviewValues>();

    for (const value of termReviewValues) {
      const key = value.termReviewId?.toString?.() ?? '';
      if (!key) continue;
      const bucket = termReviewValuesByReviewId.get(key) ?? [];
      bucket.push(value);
      termReviewValuesByReviewId.set(key, bucket);
    }
    const calculatedFinalScore = RATING_ONLY_MANAGER_REVIEW
      ? undefined
      : await this.tryCalculateAnnualFinalScore(annualAssignment);
    const proposedFinalRating = this.resolveProposedFinalRating(
      annualAssignment,
      termAssignments,
    );
    const finalDecisionStatus =
      annualDecision?.decisionStatus ??
      annualAssignment.finalDecisionStatus ??
      AnnualDecisionStatus.DRAFT;
    const effectiveAnnualState =
      cycle?.status === AnnualWorkflowState.CANCELLED
        ? AnnualWorkflowState.CANCELLED
        : annualAssignment.annualState;
    const effectiveTermAssignments =
      cycle?.status === AnnualWorkflowState.CANCELLED
        ? termAssignments.map((termAssignment) => {
            if (termAssignment.termState === TermWorkflowState.TERM_FINALIZED) {
              return termAssignment;
            }

            termAssignment.termState = TermWorkflowState.CLOSED_BY_ADMIN;
            return termAssignment;
          })
        : termAssignments;
    const readiness = await this.resolveAnnualDecisionReadiness(
      {
        ...annualAssignment.toObject(),
        annualState: effectiveAnnualState,
      } as IAnnualAssignment,
      effectiveTermAssignments,
      finalDecisionStatus,
      cycle ?? undefined,
    );

    const annualDecisionValues = annualDecision
      ? await AnnualDecisionValue.find({
          annualDecisionId: annualDecision._id,
          isDeleted: false,
        }).lean()
      : [];
    const termAssignmentIdsNeedingTemplateValueFallback = effectiveTermAssignments
      .filter((termAssignment) => {
        const termAssignmentObject =
          typeof termAssignment.toObject === 'function'
            ? termAssignment.toObject()
            : termAssignment;
        const termSummary =
          (termAssignmentObject.termSummary as Record<string, unknown> | undefined) ?? {};
        const values = termSummary.objectiveTemplateValues;
        return !Array.isArray(values) || values.length === 0;
      })
      .map((termAssignment) => termAssignment._id.toString());
    const objectiveTemplateValueAuditFallbackByTermId = new Map<string, Array<Record<string, any>>>();

    if (termAssignmentIdsNeedingTemplateValueFallback.length > 0) {
      const termAssignmentAuditEntityIds = [
        ...termAssignmentIdsNeedingTemplateValueFallback,
        ...termAssignmentIdsNeedingTemplateValueFallback
          .filter((termAssignmentId) => Types.ObjectId.isValid(termAssignmentId))
          .map((termAssignmentId) => new Types.ObjectId(termAssignmentId)),
      ];
      const latestTemplateValueAudits = await AuditLog.find({
        entityType: 'TERM_ASSIGNMENT',
        action: 'PMS_OBJECTIVE_TEMPLATE_VALUES_UPDATED',
        entityId: { $in: termAssignmentAuditEntityIds },
      })
        .sort({ timestamp: -1, createdAt: -1 })
        .lean();
      const seenTermIds = new Set<string>();

      for (const audit of latestTemplateValueAudits) {
        const termAssignmentId = String(audit.entityId ?? '');
        if (!termAssignmentId || seenTermIds.has(termAssignmentId)) continue;
        seenTermIds.add(termAssignmentId);

        const newValue =
          audit.newValue && typeof audit.newValue === 'object'
            ? (audit.newValue as Record<string, unknown>)
            : {};
        const values = newValue.objectiveTemplateValues;
        objectiveTemplateValueAuditFallbackByTermId.set(
          termAssignmentId,
          Array.isArray(values) ? (values as Array<Record<string, any>>) : [],
        );
      }
    }

    const [correctionHistory, preReopenSnapshots] = annualDecision
      ? await Promise.all([
        CorrectionLayer.find({
          entityType: 'ANNUAL_DECISION',
          entityId: annualDecision._id,
          isDeleted: false,
        })
          .sort({ correctedAt: -1, createdAt: -1 })
          .lean(),
        PerformanceHistorySnapshot.find({
          annualAssignmentId: annualAssignment._id,
          finalDecisionSnapshot: { $exists: true, $ne: null },
          isDeleted: false,
        })
          .sort({ createdAt: -1 })
          .lean(),
      ])
      : [[], []];

    const latestFinalScoreOverride = correctionHistory.find(
      (entry) => entry.fieldKey === 'FINAL_SCORE_OVERRIDE',
    );
    const latestFinalRatingOverride = correctionHistory.find(
      (entry) => entry.fieldKey === 'FINAL_RATING_OVERRIDE',
    );
    const maskedCorrectionHistory = this.maskCorrectionHistory(
      correctionHistory,
      visibilityConfiguration ?? annualAssignment.visibility,
    );
    const maskedPreReopenSnapshots = this.maskPreReopenSnapshots(
      preReopenSnapshots,
      visibilityConfiguration ?? annualAssignment.visibility,
    );
    const finalScoreOverride = !RATING_ONLY_MANAGER_REVIEW && latestFinalScoreOverride
      ? this.buildFinalScoreOverrideSummary(
          latestFinalScoreOverride,
          visibilityConfiguration ?? annualAssignment.visibility,
        )
      : null;
    const finalRatingOverride = latestFinalRatingOverride
      ? (
          this.maskCorrectionHistory(
            [latestFinalRatingOverride],
            visibilityConfiguration ?? annualAssignment.visibility,
          )[0] ?? null
        )
      : null;
    const actor = this.requireActor();
    const actorId = actor.actorId;
    const isAssignedL3DecisionOwner =
      annualAssignment.directorReviewerId?.toString() === actorId;
    const isAssignedFinalReviewer =
      annualAssignment.finalReviewerId?.toString() === actorId ||
      annualAssignment.directorReviewerId?.toString() === actorId;
    const actorMatrixMode: ObjectiveMatrixMode = isAssignedFinalReviewer
      ? 'reviewer'
      : this.objectiveMatrixModeForActor();
    const objectiveMatrix = await this.loadObjectiveMatrixIfEnabled(
      annualAssignment,
      actorMatrixMode,
    );
    const frozenMatrixSnapshot = preReopenSnapshots.find((snapshot) => {
      const finalSnapshot = snapshot.finalDecisionSnapshot as Record<string, unknown> | undefined;
      return finalSnapshot?.snapshotKind === 'ANNUAL_DECISION_FREEZE';
    });
    const frozenFinalSnapshot = frozenMatrixSnapshot?.finalDecisionSnapshot as
      | Record<string, unknown>
      | undefined;
    const activeOfficialFreeze = [
      AnnualDecisionStatus.FROZEN,
      AnnualDecisionStatus.VISIBILITY_ENABLED,
    ].includes(finalDecisionStatus as any);
    const frozenContentHash = activeOfficialFreeze && typeof frozenFinalSnapshot?.objectiveMatrixContentHash === 'string'
      ? frozenFinalSnapshot.objectiveMatrixContentHash
      : undefined;
    const allFinalReviewFields =
      annualAssignment.finalReviewStatus !== FinalReviewStatus.NOT_REQUIRED
        ? await this.finalReviewTemplateFields(annualAssignment)
        : [];
    const activeFinalReviewStage = this.resolveActorFinalReviewStage(annualAssignment, false);
    const finalReviewFields = activeFinalReviewStage
      ? allFinalReviewFields.filter((field) => field.reviewStage === activeFinalReviewStage)
      : allFinalReviewFields;
    const finalReviewValues = annualDecisionValues.filter(
      (value) =>
        value.roleCode === 'DIRECTOR' &&
        finalReviewFields.some((field) => String(field.key) === value.fieldKey),
    );
    const activeFinalReviewStatus = activeFinalReviewStage === 'DIRECTOR'
      ? annualAssignment.directorReviewStatus
      : annualAssignment.finalReviewStatus;
    const activeFinalReviewer = activeFinalReviewStage === 'DIRECTOR'
      ? annualAssignment.directorReviewerSnapshot
      : annualAssignment.finalReviewerSnapshot;
    const activeFinalReviewStageReady =
      activeFinalReviewStage === 'L2' ||
      (
        activeFinalReviewStage === 'DIRECTOR' &&
        annualAssignment.finalReviewStatus === FinalReviewStatus.COMPLETED
      );
    const l2Fields = allFinalReviewFields.filter((field) => field.reviewStage === 'L2');
    const l2FieldKeys = new Set(l2Fields.map((field) => String(field.key)));
    const l2Values = annualDecisionValues.filter(
      (value) => value.roleCode === 'DIRECTOR' && l2FieldKeys.has(value.fieldKey),
    );
    const directorFieldKeys = new Set(
      allFinalReviewFields
        .filter((field) => field.reviewStage === 'DIRECTOR')
        .map((field) => String(field.key)),
    );
    const hideDirectorStageValuesFromL2 =
      activeFinalReviewStage === 'L2' &&
      annualAssignment.directorReviewerId?.toString() !== actorId;
    const visibleAnnualDecisionValues = hideDirectorStageValuesFromL2
      ? annualDecisionValues.filter(
          (value) =>
            !(
              value.roleCode === 'DIRECTOR' &&
              directorFieldKeys.has(value.fieldKey)
            ),
        )
      : annualDecisionValues;
    const l2EnteredById =
      annualAssignment.finalReviewCompletedBy?.toString() ??
      l2Values.find((value) => value.actorUserId)?.actorUserId?.toString();
    const l2EnteredBy =
      activeFinalReviewStage === 'DIRECTOR' && l2EnteredById
        ? await User.findById(l2EnteredById)
            .select('_id name employeeCode role specificRole')
            .lean()
        : null;
    const l2PreviousStage =
      activeFinalReviewStage === 'DIRECTOR'
        ? {
            stage: 'L2' as const,
            label: 'L2 · ED / SVP Assessment',
            status: annualAssignment.finalReviewStatus,
            enteredBy: l2EnteredBy
              ? {
                  _id: l2EnteredBy._id.toString(),
                  name: l2EnteredBy.name,
                  employeeCode: l2EnteredBy.employeeCode,
                  role: l2EnteredBy.role,
                  specificRole: l2EnteredBy.specificRole,
                }
              : annualAssignment.finalReviewerSnapshot,
            completedAt: annualAssignment.finalReviewCompletedAt?.toISOString(),
            fields: l2Fields,
            values: l2Values.map((value) => ({
              templateFieldId: value.templateFieldId,
              fieldKey: value.fieldKey,
              sectionKey: value.sectionKey,
              roleCode: value.roleCode,
              actorUserId: value.actorUserId?.toString(),
              valueJson: value.valueJson,
              valueText: value.valueText,
              valueNumber: value.valueNumber,
              valueDate: value.valueDate ? value.valueDate.toISOString() : undefined,
            })),
          }
        : undefined;

    return {
      annualAssignment: {
        ...annualAssignment.toObject(),
        annualState: effectiveAnnualState,
        finalDecisionStatus,
        isAppraisalWindowOpen: readiness.isAppraisalWindowOpen,
        termProgress: readiness.termProgress,
        availableActions: isAssignedL3DecisionOwner ? readiness.availableActions : [],
        availableAdminActions: [],
        lockedReason: readiness.lockedReason,
      },
      termAssignments: effectiveTermAssignments.map((termAssignment) => {
        const termAssignmentObject =
          typeof termAssignment.toObject === 'function'
            ? termAssignment.toObject()
            : termAssignment;
        const termSummary =
          (termAssignmentObject.termSummary as Record<string, unknown> | undefined) ?? {};
        const summaryTemplateValues = Array.isArray(termSummary.objectiveTemplateValues)
          ? (termSummary.objectiveTemplateValues as Array<Record<string, any>>)
          : [];
        const objectiveTemplateSourceValues =
          summaryTemplateValues.length > 0
            ? summaryTemplateValues
            : objectiveTemplateValueAuditFallbackByTermId.get(termAssignmentObject._id.toString()) ?? [];
        const objectiveTemplateValues = this.mapTemplateObjectiveValues(
          objectiveTemplateSourceValues,
        );

        return {
          ...termAssignmentObject,
          objectiveTemplateValues,
          termSummary: {
            ...termSummary,
            objectiveTemplateValues,
          },
        };
      }),
      objectives,
      termReviews: termReviews.map((review) => {
        const reviewObject =
          typeof review.toObject === 'function'
            ? review.toObject()
            : review;
        const reviewValues = termReviewValuesByReviewId.get(reviewObject._id.toString()) ?? [];

        return {
          ...reviewObject,
          reviewValues: reviewValues.map((value) => ({
            templateFieldId: value.templateFieldId,
            fieldKey: value.fieldKey,
            sectionKey: value.sectionKey,
            roleCode: value.roleCode,
            actorUserId: value.actorUserId?.toString?.(),
            workflowStage: value.workflowStage,
            valueJson: value.valueJson,
            valueText: value.valueText,
            valueNumber: value.valueNumber,
            valueDate: value.valueDate ? new Date(value.valueDate).toISOString() : undefined,
            valueStatus: value.valueStatus,
          })),
        };
      }),
      managerReviewPeriods: managerReviewPeriods.map((review) => {
        const reviewObject =
          typeof review.toObject === 'function'
            ? review.toObject()
            : review;

        return {
          ...reviewObject,
          _id: reviewObject._id?.toString?.() ?? reviewObject._id,
          annualAssignmentId: reviewObject.annualAssignmentId?.toString?.(),
          cycleId: reviewObject.cycleId?.toString?.(),
          employeeId: reviewObject.employeeId?.toString?.(),
          managerId: reviewObject.managerId?.toString?.(),
          templateVersionId: reviewObject.templateVersionId?.toString?.(),
          includedTermAssignmentIds: (reviewObject.includedTermAssignmentIds ?? []).map(
            (id: unknown) => id && typeof id === 'object' && 'toString' in id
              ? (id as { toString: () => string }).toString()
              : String(id),
          ),
          anchorTermAssignmentId: reviewObject.anchorTermAssignmentId?.toString?.(),
          reviewValues: (reviewObject.reviewValues ?? []).map((value: Record<string, any>) => ({
            templateFieldId: value.templateFieldId,
            fieldKey: value.fieldKey,
            sectionKey: value.sectionKey,
            roleCode: value.roleCode,
            actorUserId: value.actorUserId?.toString?.(),
            workflowStage: value.workflowStage,
            valueJson: value.valueJson,
            valueText: value.valueText,
            valueNumber: value.valueNumber,
            valueDate: value.valueDate ? new Date(value.valueDate).toISOString() : undefined,
          })),
        };
      }),
      annualDecisionValues: visibleAnnualDecisionValues.map((value) => ({
        templateFieldId: value.templateFieldId,
        fieldKey: value.fieldKey,
        sectionKey: value.sectionKey,
        roleCode: value.roleCode,
        actorUserId: value.actorUserId?.toString(),
        valueJson: value.valueJson,
        valueText: value.valueText,
        valueNumber: value.valueNumber,
        valueDate: value.valueDate ? value.valueDate.toISOString() : undefined,
      })),
      calculatedFinalScore,
      proposedFinalRating,
      finalScoreOverride,
      finalRatingOverride,
      visibilityConfiguration: visibilityConfiguration?.toObject() ?? null,
      annualDecision: annualDecision
        ? this.maskDecision(
            annualDecision,
            visibilityConfiguration ?? annualAssignment.visibility,
          )
        : null,
      correctionHistory: maskedCorrectionHistory,
      preReopenSnapshots: maskedPreReopenSnapshots,
      objectiveMatrix,
      objectiveMatrixIntegrity: {
        source: 'LIVE_ROLE_MASKED',
        liveContentHash: objectiveMatrix?.contentHash,
        frozenContentHash,
        ...(frozenContentHash && objectiveMatrix && actorMatrixMode === 'admin'
          ? { matchesFrozen: frozenContentHash === objectiveMatrix.contentHash }
          : {}),
      },
      finalReview: {
        status: activeFinalReviewStatus,
        stage: activeFinalReviewStage,
        stageLabel: activeFinalReviewStage === 'DIRECTOR'
          ? 'L3 · Final Reviewer Assessment'
          : 'L2 · ED / SVP Assessment',
        reviewer: activeFinalReviewer,
        l2Status: annualAssignment.finalReviewStatus,
        directorStatus: annualAssignment.directorReviewStatus,
        previousStage: l2PreviousStage,
        fields: finalReviewFields,
        values: finalReviewValues,
        availableActions:
          Boolean(activeFinalReviewStage) &&
          activeFinalReviewStageReady &&
          readiness.allTermsFinalized &&
          [FinalReviewStatus.PENDING, FinalReviewStatus.IN_PROGRESS].includes(activeFinalReviewStatus as any)
            ? ['SAVE', 'COMPLETE']
            : [],
      },
      reviewContext: {
        fieldCatalog: (contextTemplateVersion?.sections ?? []).flatMap((section: any) =>
          (section.fields ?? []).map((field: any) => ({
            fieldKey: field.fieldKey,
            fieldLabel: field.fieldLabel,
            fieldType: field.fieldType,
            sectionKey: section.sectionKey,
            sectionLabel: section.sectionLabel,
            displayOrder: field.displayOrder,
            options: field.options,
            matrixConfig: field.matrixConfig,
            gridConfig: field.gridConfig,
          })),
        ),
        employeeSubmission: employeeSubmission
          ? {
              termAssignmentId: employeeSubmission.termAssignmentId?.toString(),
              status: employeeSubmission.status,
              assessmentTermCode: employeeSubmission.assessmentTermCode,
              submittedAt: employeeSubmission.submittedAt
                ? new Date(employeeSubmission.submittedAt).toISOString()
                : undefined,
              lockedAt: employeeSubmission.lockedAt
                ? new Date(employeeSubmission.lockedAt).toISOString()
                : undefined,
              achievementItems: (employeeSubmission.achievementItems ?? []).map((item: any) => ({
                itemId: item.itemId,
                type: item.type,
                subject: item.subject,
                description: item.description,
                employeeSelfRating: item.employeeSelfRating,
                employeeSelfRatingComments: item.employeeSelfRatingComments,
                outcome: item.outcome,
                objectiveSnapshot: item.objectiveSnapshot,
                relatedObjectiveSnapshot: item.relatedObjectiveSnapshot,
                itemStatus: item.itemStatus,
                submittedAt: item.submittedAt
                  ? new Date(item.submittedAt).toISOString()
                  : undefined,
                attachments: (item.attachments ?? []).map((attachment: any) => ({
                  fileName: attachment.fileName,
                  fileType: attachment.fileType,
                  fileSize: attachment.fileSize,
                  documentId: attachment.documentId,
                  uploadedAt: attachment.uploadedAt
                    ? new Date(attachment.uploadedAt).toISOString()
                    : undefined,
                })),
              })),
              achievementValues: (employeeSubmission.achievementValues ?? []).map((value: any) => ({
                templateFieldId: value.templateFieldId,
                fieldKey: value.fieldKey,
                sectionKey: value.sectionKey,
                roleCode: value.roleCode,
                workflowStage: value.workflowStage,
                valueJson: value.valueJson,
                valueText: value.valueText,
                valueNumber: value.valueNumber,
                valueDate: value.valueDate
                  ? new Date(value.valueDate).toISOString()
                  : undefined,
              })),
            }
          : null,
        employeeSubmissions: employeeSubmissions.map((submission) => ({
          termAssignmentId: submission.termAssignmentId?.toString(),
          assessmentTermCode: submission.assessmentTermCode,
          achievementValues: (submission.achievementValues ?? []).map((value: any) => ({
            templateFieldId: value.templateFieldId,
            fieldKey: value.fieldKey,
            sectionKey: value.sectionKey,
            roleCode: value.roleCode,
            workflowStage: value.workflowStage,
            valueJson: value.valueJson,
            valueText: value.valueText,
            valueNumber: value.valueNumber,
            valueDate: value.valueDate
              ? new Date(value.valueDate).toISOString()
              : undefined,
          })),
        })),
      },
    };
  }

  private async ensureFinalReviewRouting(
    annualAssignment: IAnnualAssignment,
  ): Promise<IAnnualAssignment> {
    const previousValue = annualAssignment.toObject();
    const declaredApplicableTerms = annualAssignment.applicableTerms ?? [];
    const termAssignmentQuery: Record<string, unknown> = {
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    };
    if (declaredApplicableTerms.length > 0) {
      termAssignmentQuery.assessmentTermCode = { $in: declaredApplicableTerms };
    }

    const termAssignments = await TermAssignment.find(termAssignmentQuery).select(
      'assessmentTermCode termState',
    );
    const termByCode = new Map(
      termAssignments.map((termAssignment) => [
        termAssignment.assessmentTermCode,
        termAssignment,
      ]),
    );
    const applicableTerms =
      declaredApplicableTerms.length > 0
        ? declaredApplicableTerms
        : termAssignments.map((termAssignment) => termAssignment.assessmentTermCode);
    const allTermsFinalized =
      applicableTerms.length > 0 &&
      applicableTerms.every((termCode) => {
        const termAssignment = termByCode.get(termCode);
        return termAssignment ? isTermFinalized(termAssignment.termState) : false;
      });

    if (
      allTermsFinalized &&
      FINAL_REVIEW_ROLLUP_CANDIDATE_STATES.includes(annualAssignment.annualState)
    ) {
      annualAssignment.annualState = AnnualWorkflowState.ALL_TERMS_FINALIZED;
    }

    if (
      !allTermsFinalized &&
      !FINAL_REVIEW_QUEUE_STATES.includes(annualAssignment.annualState)
    ) {
      return annualAssignment;
    }

    const cycle = await AnnualCycle.findById(annualAssignment.cycleId)
      .select('finalReviewRequired defaultFinalReviewerId')
      .lean();

    const employeeHierarchy = await User.findById(annualAssignment.employeeId)
      .select('l2ManagerId l3ManagerId')
      .lean();

    let finalReviewRequired = cycle?.finalReviewRequired === true;
    if (!finalReviewRequired && allTermsFinalized) {
      finalReviewRequired = Boolean(
        employeeHierarchy?.l2ManagerId || employeeHierarchy?.l3ManagerId,
      );
    }

    if (!finalReviewRequired) {
      if (annualAssignment.isModified()) {
        annualAssignment.updatedBy = this.actorIdObject();
        annualAssignment.version += 1;
        await annualAssignment.save();
      }
      return annualAssignment;
    }

    const resolution = await resolveFinalReviewer({
      employeeId: annualAssignment.employeeId,
      assignedManagerId: annualAssignment.assignedManagerId,
      defaultFinalReviewerId: cycle?.defaultFinalReviewerId,
      finalReviewRequired: true,
    });

    const explicitReviewerProjection =
      '_id employeeCode name email role specificRole active portalAccess';
    const employeeIdString = annualAssignment.employeeId.toString();
    const assignedManagerIdString = annualAssignment.assignedManagerId.toString();

    if (employeeHierarchy?.l2ManagerId) {
      const explicitL2 = await User.findById(employeeHierarchy.l2ManagerId)
        .select(explicitReviewerProjection)
        .lean();
      const explicitL2Id = explicitL2?._id?.toString();
      if (
        explicitL2 &&
        explicitL2Id &&
        explicitL2.active !== false &&
        explicitL2.portalAccess !== false &&
        explicitL2Id !== employeeIdString &&
        explicitL2Id !== assignedManagerIdString
      ) {
        resolution.finalReviewerId = explicitL2._id as Types.ObjectId;
        resolution.finalReviewerSource = FinalReviewerSource.EMPLOYEE_L2_MAPPING;
        resolution.finalReviewerSnapshot = {
          employeeCode: explicitL2.employeeCode,
          name: explicitL2.name,
          email: explicitL2.email,
          role: explicitL2.role,
          specificRole: explicitL2.specificRole,
        };
      }
    }

    if (employeeHierarchy?.l3ManagerId) {
      const explicitL3 = await User.findById(employeeHierarchy.l3ManagerId)
        .select(explicitReviewerProjection)
        .lean();
      const explicitL3Id = explicitL3?._id?.toString();
      if (
        explicitL3 &&
        explicitL3Id &&
        explicitL3.active !== false &&
        explicitL3.portalAccess !== false &&
        explicitL3Id !== employeeIdString
      ) {
        resolution.directorReviewerId = explicitL3._id as Types.ObjectId;
        resolution.directorReviewerSource = FinalReviewerSource.EMPLOYEE_L3_MAPPING;
        resolution.directorReviewerSnapshot = {
          employeeCode: explicitL3.employeeCode,
          name: explicitL3.name,
          email: explicitL3.email,
          role: explicitL3.role,
          specificRole: explicitL3.specificRole,
        };
      }
    }

    const canRealignL2 =
      !annualAssignment.finalReviewCompletedBy &&
      !annualAssignment.finalReviewCompletedAt &&
      [
        undefined,
        FinalReviewStatus.NOT_REQUIRED,
        FinalReviewStatus.PENDING,
      ].includes(annualAssignment.finalReviewStatus as any);
    const canRealignL3 =
      !annualAssignment.directorReviewCompletedBy &&
      !annualAssignment.directorReviewCompletedAt &&
      [
        undefined,
        FinalReviewStatus.NOT_REQUIRED,
        FinalReviewStatus.PENDING,
      ].includes(annualAssignment.directorReviewStatus as any);

    const needsRouting =
      !annualAssignment.finalReviewerId ||
      !annualAssignment.directorReviewerId ||
      !annualAssignment.finalReviewStatus ||
      !annualAssignment.directorReviewStatus ||
      annualAssignment.finalReviewStatus === FinalReviewStatus.NOT_REQUIRED ||
      annualAssignment.directorReviewStatus === FinalReviewStatus.NOT_REQUIRED ||
      (
        canRealignL2 &&
        resolution.finalReviewerId &&
        annualAssignment.finalReviewerId?.toString() !== resolution.finalReviewerId.toString()
      ) ||
      (
        canRealignL3 &&
        resolution.directorReviewerId &&
        annualAssignment.directorReviewerId?.toString() !== resolution.directorReviewerId.toString()
      ) ||
      annualAssignment.isModified();

    if (!needsRouting) {
      return annualAssignment;
    }

    let changed = annualAssignment.isModified();
    if (
      !annualAssignment.finalReviewerId ||
      annualAssignment.finalReviewStatus === FinalReviewStatus.NOT_REQUIRED ||
      (
        canRealignL2 &&
        resolution.finalReviewerId &&
        annualAssignment.finalReviewerId?.toString() !== resolution.finalReviewerId.toString()
      )
    ) {
      annualAssignment.finalReviewerId = resolution.finalReviewerId;
      annualAssignment.finalReviewerSource = resolution.finalReviewerSource;
      annualAssignment.finalReviewerSnapshot = resolution.finalReviewerSnapshot;
      changed = true;
    } else if (!annualAssignment.finalReviewerSnapshot && resolution.finalReviewerSnapshot) {
      annualAssignment.finalReviewerSnapshot = resolution.finalReviewerSnapshot;
      changed = true;
    }

    if (
      !annualAssignment.directorReviewerId ||
      annualAssignment.directorReviewStatus === FinalReviewStatus.NOT_REQUIRED ||
      (
        canRealignL3 &&
        resolution.directorReviewerId &&
        annualAssignment.directorReviewerId?.toString() !== resolution.directorReviewerId.toString()
      )
    ) {
      annualAssignment.directorReviewerId = resolution.directorReviewerId;
      annualAssignment.directorReviewerSource = resolution.directorReviewerSource;
      annualAssignment.directorReviewerSnapshot = resolution.directorReviewerSnapshot;
      changed = true;
    } else if (!annualAssignment.directorReviewerSnapshot && resolution.directorReviewerSnapshot) {
      annualAssignment.directorReviewerSnapshot = resolution.directorReviewerSnapshot;
      changed = true;
    }

    if (
      !annualAssignment.finalReviewStatus ||
      annualAssignment.finalReviewStatus === FinalReviewStatus.NOT_REQUIRED
    ) {
      annualAssignment.finalReviewStatus = FinalReviewStatus.PENDING;
      changed = true;
    }
    if (
      !annualAssignment.directorReviewStatus ||
      annualAssignment.directorReviewStatus === FinalReviewStatus.NOT_REQUIRED
    ) {
      annualAssignment.directorReviewStatus = FinalReviewStatus.PENDING;
      changed = true;
    }

    if (!changed) {
      return annualAssignment;
    }

    annualAssignment.updatedBy = this.actorIdObject();
    annualAssignment.version += 1;
    await annualAssignment.save();
    await this.audit(
      'PMS_FINAL_REVIEW_ROUTING_RESOLVED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      {
        finalReviewerId: previousValue.finalReviewerId,
        finalReviewerSource: previousValue.finalReviewerSource,
        finalReviewStatus: previousValue.finalReviewStatus,
        directorReviewerId: previousValue.directorReviewerId,
        directorReviewerSource: previousValue.directorReviewerSource,
        directorReviewStatus: previousValue.directorReviewStatus,
      },
      {
        finalReviewerId: annualAssignment.finalReviewerId,
        finalReviewerSource: annualAssignment.finalReviewerSource,
        finalReviewStatus: annualAssignment.finalReviewStatus,
        directorReviewerId: annualAssignment.directorReviewerId,
        directorReviewerSource: annualAssignment.directorReviewerSource,
        directorReviewStatus: annualAssignment.directorReviewStatus,
      },
    );

    return annualAssignment;
  }

  private async ensureFinalReviewRoutingForActor(actorId: Types.ObjectId): Promise<void> {
    const hierarchyEmployeeIds = await User.distinct('_id', {
      isDeleted: { $ne: true },
      $or: [
        { l2ManagerId: actorId },
        { l3ManagerId: actorId },
      ],
    });

    const routingClauses: Record<string, unknown>[] = [
      { finalReviewerId: actorId },
      { directorReviewerId: actorId },
      { finalReviewerId: { $exists: false } },
      { finalReviewerId: null },
      { directorReviewerId: { $exists: false } },
      { directorReviewerId: null },
      { finalReviewStatus: FinalReviewStatus.NOT_REQUIRED },
      { directorReviewStatus: FinalReviewStatus.NOT_REQUIRED },
    ];

    const candidateStates = [
      ...FINAL_REVIEW_QUEUE_STATES,
      ...FINAL_REVIEW_ROLLUP_CANDIDATE_STATES,
    ];

    const candidateOrClauses: Record<string, unknown>[] = [
      {
        annualState: { $in: candidateStates },
        $or: routingClauses,
      },
    ];

    if (hierarchyEmployeeIds.length > 0) {
      candidateOrClauses.push({
        employeeId: { $in: hierarchyEmployeeIds },
        annualState: { $ne: AnnualWorkflowState.CANCELLED },
      });
    }

    const candidates = await AnnualAssignment.find({
      isDeleted: false,
      $or: candidateOrClauses,
    });

    for (const assignment of candidates) {
      try {
        await this.ensureFinalReviewRouting(assignment);
      } catch (error) {
        console.warn(
          '[PMS] Final review routing repair skipped',
          assignment._id.toString(),
          error instanceof Error ? error.message : String(error),
        );
        // Keep one legacy routing issue from hiding other final reviews in the queue.
      }
    }
  }

  async listMyFinalReviews(): Promise<Array<Record<string, unknown>>> {
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');
    await this.ensureFinalReviewRoutingForActor(actorId);

    const assignments = await AnnualAssignment.find({
      $or: [
        {
          finalReviewerId: actorId,
          finalReviewStatus: { $in: FINAL_REVIEW_VISIBLE_STATUSES },
        },
        {
          directorReviewerId: actorId,
          directorReviewStatus: { $in: FINAL_REVIEW_VISIBLE_STATUSES },
        },
      ],
      annualState: { $in: FINAL_REVIEW_QUEUE_STATES },
      isDeleted: false,
    }).sort({ updatedAt: -1 }).lean();
    const cycles = await AnnualCycle.find({
      _id: { $in: assignments.map((item) => item.cycleId) },
      isDeleted: false,
    }).lean();
    const cycleMap = new Map(cycles.map((item) => [item._id.toString(), item]));
    return assignments.map((item) => {
      const reviewStage = item.finalReviewerId?.toString() === actor.actorId
        ? 'L2'
        : 'DIRECTOR';
      const isWaitingForL2 =
        reviewStage === 'DIRECTOR' &&
        item.finalReviewStatus !== FinalReviewStatus.COMPLETED;
      return {
        annualAssignmentId: item._id.toString(),
        employeeId: item.employeeId.toString(),
        employeeName: String(item.employeeSnapshot?.name ?? 'Employee'),
        employeeCode: String(item.employeeSnapshot?.employeeCode ?? ''),
        designation: String(item.employeeSnapshot?.specificRole ?? item.employeeSnapshot?.role ?? ''),
        cycleName: cycleMap.get(item.cycleId.toString())?.name ?? 'Performance Cycle',
        annualState: item.annualState,
        reviewStage,
        reviewStageLabel: reviewStage === 'L2' ? 'L2 - ED / SVP' : 'L3 - Final Reviewer',
        finalReviewStatus: reviewStage === 'L2'
          ? item.finalReviewStatus
          : item.directorReviewStatus,
        isWaitingForL2,
      };
    });
  }

  async saveFinalReview(
    annualAssignmentId: string,
    input: SaveFinalReviewInput,
  ): Promise<IAnnualAssignment> {
    const { annualAssignment, reviewStage } =
      await this.assertFinalReviewerAccess(annualAssignmentId);
    const decision = await this.getOrCreateFinalReviewDecisionShell(annualAssignment);
    const fields = (await this.finalReviewTemplateFields(annualAssignment))
      .filter((field) => field.reviewStage === reviewStage);
    const allowed = new Map(fields.map((field) => [String(field.key), field]));
    const actorId = this.actorIdObject()!;
    for (const value of input.decisionValues ?? []) {
      const field = allowed.get(value.fieldKey);
      if (!field || value.sectionKey !== field.sectionKey) {
        throw new Error(`Field ${value.fieldKey} does not belong to the Final Reviewer section`);
      }
      if (!isFinalReviewerFieldEditable(field)) {
        throw new Error(`Field ${value.fieldKey} is not editable by the Final Reviewer`);
      }
      await AnnualDecisionValue.findOneAndUpdate(
        {
          annualDecisionId: decision._id,
          fieldKey: value.fieldKey,
          sectionKey: value.sectionKey,
          roleCode: 'DIRECTOR',
          isDeleted: false,
        },
        {
          $set: {
            annualAssignmentId: annualAssignment._id,
            templateFieldId: value.templateFieldId,
            actorUserId: actorId,
            valueJson: value.valueJson,
            valueText: value.valueText,
            valueNumber: value.valueNumber,
            valueDate: value.valueDate ? new Date(value.valueDate) : undefined,
            updatedBy: actorId,
          },
          $setOnInsert: { createdBy: actorId },
          $inc: { version: 1 },
        },
        { upsert: true, new: true, runValidators: true },
      );
    }
    const currentStatus = reviewStage === 'L2'
      ? annualAssignment.finalReviewStatus
      : annualAssignment.directorReviewStatus;
    if (currentStatus === FinalReviewStatus.PENDING) {
      if (reviewStage === 'L2') {
        annualAssignment.finalReviewStatus = FinalReviewStatus.IN_PROGRESS;
      } else {
        annualAssignment.directorReviewStatus = FinalReviewStatus.IN_PROGRESS;
      }
      annualAssignment.version += 1;
      await annualAssignment.save();
    }
    await this.audit('PMS_FINAL_REVIEW_SAVED', 'ANNUAL_ASSIGNMENT', annualAssignmentId, undefined, {
      reviewStage,
      fieldKeys: (input.decisionValues ?? []).map((value) => value.fieldKey),
    });
    return annualAssignment;
  }

  async completeFinalReview(annualAssignmentId: string): Promise<IAnnualAssignment> {
    const { annualAssignment, reviewStage } =
      await this.assertFinalReviewerAccess(annualAssignmentId);
    const decision = await this.getOrCreateFinalReviewDecisionShell(annualAssignment);
    const fields = (await this.finalReviewTemplateFields(annualAssignment))
      .filter((field) => field.reviewStage === reviewStage);
    const values = await AnnualDecisionValue.find({
      annualDecisionId: decision._id,
      roleCode: 'DIRECTOR',
      isDeleted: false,
    }).lean();
    const byKey = new Map(values.map((value) => [value.fieldKey, value]));
    for (const field of fields.filter((item) => item.required === true)) {
      const value = byKey.get(String(field.key));
      const meaningful = value && [value.valueJson, value.valueText, value.valueNumber, value.valueDate]
        .some((entry) => entry !== undefined && entry !== null && String(entry).trim() !== '');
      if (!meaningful) throw new Error(`${field.label ?? field.key} is required`);
    }
    const previous = annualAssignment.toObject();
    if (reviewStage === 'L2') {
      annualAssignment.finalReviewStatus = FinalReviewStatus.COMPLETED;
      annualAssignment.finalReviewCompletedBy = this.actorIdObject();
      annualAssignment.finalReviewCompletedAt = new Date();
    } else {
      annualAssignment.directorReviewStatus = FinalReviewStatus.COMPLETED;
      annualAssignment.directorReviewCompletedBy = this.actorIdObject();
      annualAssignment.directorReviewCompletedAt = new Date();
    }
    annualAssignment.version += 1;
    await annualAssignment.save();
    await this.audit(
      reviewStage === 'L2' ? 'PMS_L2_FINAL_REVIEW_COMPLETED' : 'PMS_DIRECTOR_REVIEW_COMPLETED',
      'ANNUAL_ASSIGNMENT',
      annualAssignmentId,
      previous,
      annualAssignment.toObject(),
    );
    return annualAssignment;
  }

  async reassignFinalReviewer(
    annualAssignmentId: string,
    input: ReassignFinalReviewerInput,
  ): Promise<IAnnualAssignment> {
    this.assertDecisionAdmin('annualDecision.finalReviewer.reassign');
    if (!input.reason?.trim()) throw new Error('Reviewer reassignment reason is required');
    const reviewStage: FinalReviewStage =
      String(input.reviewStage ?? 'L2').toUpperCase() === 'DIRECTOR' ? 'DIRECTOR' : 'L2';
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    if (annualAssignment.annualState === AnnualWorkflowState.ANNUAL_FINALIZED) {
      throw new Error('Reopen the annual decision before reassigning the Final Reviewer');
    }
    const reviewerId = this.toObjectId(input.reviewerId, 'reviewerId');
    const reviewer = await User.findById(reviewerId).select('name email employeeCode role specificRole active portalAccess').lean();
    if (!reviewer || reviewer.active === false || reviewer.portalAccess === false) {
      throw new Error('Final Reviewer must be an active portal-enabled user');
    }
    const reviewerRole = normalizePmsRole(String(reviewer.role ?? ''));
    if (
      reviewStage === 'DIRECTOR' &&
      reviewerRole !== PmsRole.MANAGER &&
      reviewerRole !== PmsRole.DIRECTOR
    ) {
      throw new Error('L3 reviewer must be a Manager or Director');
    }
    if (
      reviewStage === 'L2' &&
      [annualAssignment.employeeId, annualAssignment.assignedManagerId]
        .some((id) => id.toString() === reviewerId.toString())
    ) {
      throw new Error('Employee or L1 Manager cannot be assigned as Final Reviewer');
    }
    const previous = annualAssignment.toObject();
    const decision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    }).lean();
    if (decision) {
      const resetFields = (await this.finalReviewTemplateFields(annualAssignment))
        .filter((field) => reviewStage === 'L2' || field.reviewStage === 'DIRECTOR')
        .map((field) => String(field.key));
      await AnnualDecisionValue.updateMany(
        {
          annualDecisionId: decision._id,
          roleCode: 'DIRECTOR',
          fieldKey: { $in: resetFields },
          isDeleted: false,
        },
        { $set: { isDeleted: true, updatedBy: this.actorIdObject() }, $inc: { version: 1 } },
      );
    }
    const reviewerSnapshot = {
      employeeCode: reviewer.employeeCode,
      name: reviewer.name,
      email: reviewer.email,
      role: reviewer.role,
      specificRole: reviewer.specificRole,
    };
    if (reviewStage === 'L2') {
      annualAssignment.finalReviewerId = reviewerId;
      annualAssignment.finalReviewerSource = FinalReviewerSource.CYCLE_DEFAULT;
      annualAssignment.finalReviewerSnapshot = reviewerSnapshot;
      annualAssignment.finalReviewStatus = FinalReviewStatus.PENDING;
      annualAssignment.finalReviewCompletedBy = undefined;
      annualAssignment.finalReviewCompletedAt = undefined;
      annualAssignment.directorReviewStatus = FinalReviewStatus.PENDING;
      annualAssignment.directorReviewCompletedBy = undefined;
      annualAssignment.directorReviewCompletedAt = undefined;
    } else {
      annualAssignment.directorReviewerId = reviewerId;
      annualAssignment.directorReviewerSource = FinalReviewerSource.CYCLE_DEFAULT;
      annualAssignment.directorReviewerSnapshot = reviewerSnapshot;
      annualAssignment.directorReviewStatus = FinalReviewStatus.PENDING;
      annualAssignment.directorReviewCompletedBy = undefined;
      annualAssignment.directorReviewCompletedAt = undefined;
    }
    annualAssignment.version += 1;
    await annualAssignment.save();
    await this.audit(
      reviewStage === 'L2'
        ? 'PMS_L2_FINAL_REVIEWER_REASSIGNED'
        : 'PMS_DIRECTOR_REVIEWER_REASSIGNED',
      'ANNUAL_ASSIGNMENT',
      annualAssignmentId,
      previous,
      annualAssignment.toObject(),
      input.reason.trim(),
    );
    return annualAssignment;
  }

  async saveDecisionDraft(
    annualAssignmentId: string,
    input: SaveDecisionDraftInput,
  ): Promise<IAnnualDecision> {
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    this.assertAssignedL3DecisionOwner(annualAssignment, 'annualDecision.draft');
    const existingDecision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
    });
    if (existingDecision?.frozenAt || existingDecision?.decisionStatus === AnnualDecisionStatus.FROZEN) {
      throw new Error('Frozen annual decision cannot be edited');
    }

    const isSubmittedOverride =
      existingDecision?.decisionStatus === AnnualDecisionStatus.SUBMITTED;
    const overrideReason = validateSubmittedDecisionOverrideReason(
      existingDecision?.decisionStatus,
      input.overrideReason,
    );
    const previousDecisionValues = isSubmittedOverride
      ? await AnnualDecisionValue.find({
          annualDecisionId: existingDecision!._id,
          isDeleted: false,
        }).lean()
      : [];
    let originalOverrideSnapshot: Record<string, unknown> | undefined;
    let correctedOverrideSnapshot: Record<string, unknown> | undefined;

    await this.assertAnnualDecisionGate(
      annualAssignment,
      'SAVE_DRAFT',
      existingDecision?.decisionStatus ?? annualAssignment.finalDecisionStatus ?? AnnualDecisionStatus.DRAFT,
    );

    const effectiveFinalScore = RATING_ONLY_MANAGER_REVIEW
      ? undefined
      : await this.resolveEffectiveAnnualFinalScore(
          existingDecision?._id,
          await this.calculateAnnualFinalScore(annualAssignment),
        );
    const proposedFinalRating = await this.resolveProposedFinalRatingForAssignment(
      annualAssignment,
    );
    const rawDecisionInput: SaveDecisionDraftInput = {
      ...input,
      // Final-review values belong to L2/L3 and must never be rewritten by
      // the L3 annual-decision payload during a submitted-decision correction.
      decisionValues: input.decisionValues?.filter(
        (value) => !isFinalReviewerOwnedDecisionValue(value),
      ),
      finalScore: effectiveFinalScore,
      finalRating: RATING_ONLY_MANAGER_REVIEW
        ? existingDecision?.finalRating?.trim() || proposedFinalRating
        : input.finalRating?.trim() ||
          existingDecision?.finalRating?.trim() ||
          proposedFinalRating,
    };
    const sanitizedDecisionInput = await this.sanitizeAnnualDecisionInputForTemplate(
      annualAssignment,
      rawDecisionInput,
      existingDecision,
    );
    const normalizedDecisionInput =
      this.normalizeMeritRecommendationForDecision(sanitizedDecisionInput);
    const decisionInput = {
      ...normalizedDecisionInput,
      finalRating: await this.validateManagerOverallRating(
        normalizedDecisionInput.finalRating,
        false,
      ),
    };
    const appraisalOutcomeType = this.deriveOutcome(
      decisionInput.isGradeApplied,
      decisionInput.isMeritApplied,
    );
    this.validateDecisionInput(decisionInput, appraisalOutcomeType, false);
    await this.validateAnnualTemplateInput(annualAssignment, decisionInput, false);

    await new PmsEmployeeCareerProfileSnapshotService(
      this.context,
    ).freezeForAnnualAssignment(
      annualAssignment._id,
      EmployeeCareerProfileSnapshotTrigger.ANNUAL_DECISION_DRAFT,
    );

    const payload = {
      annualAssignmentId: annualAssignment._id,
      cycleId: annualAssignment.cycleId,
      employeeId: annualAssignment.employeeId,
      isGradeApplied: decisionInput.isGradeApplied,
      isMeritApplied: decisionInput.isMeritApplied,
      appraisalOutcomeType,
      gradeDetails: decisionInput.gradeDetails,
      meritDetails: decisionInput.meritDetails,
      nilReason: appraisalOutcomeType === AppraisalOutcomeType.NIL ? decisionInput.nilReason : undefined,
      managementRemarks: decisionInput.managementRemarks,
      ...(RATING_ONLY_MANAGER_REVIEW ? {} : { finalScore: effectiveFinalScore }),
      finalRating: decisionInput.finalRating,
      decisionStatus: AnnualDecisionStatus.DRAFT,
      decidedBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
      createdBy: existingDecision ? existingDecision.createdBy : this.actorIdObject(),
    };

    const decision = existingDecision
      ? await AnnualDecision.findByIdAndUpdate(existingDecision._id, {
        $set: payload,
        ...(RATING_ONLY_MANAGER_REVIEW ? { $unset: { finalScore: 1 } } : {}),
        $inc: { version: 1 },
      }, {
        new: true,
        runValidators: true,
      })
      : await AnnualDecision.create(payload);

    if (!decision) {
      throw new Error('Unable to save annual decision draft');
    }

    await this.persistAnnualDecisionValues(decision, annualAssignment, decisionInput);

    if (isSubmittedOverride) {
      const correctedDecisionValues = await AnnualDecisionValue.find({
        annualDecisionId: decision._id,
        isDeleted: false,
      }).lean();
      originalOverrideSnapshot = {
        decision: existingDecision?.toObject(),
        decisionValues: previousDecisionValues,
      };
      correctedOverrideSnapshot = {
        decision: decision.toObject(),
        decisionValues: correctedDecisionValues,
      };

      await CorrectionLayer.create({
        entityType: 'ANNUAL_DECISION',
        entityId: decision._id,
        fieldKey: 'SUBMITTED_DECISION_OVERRIDE',
        originalValue: originalOverrideSnapshot,
        correctedValue: correctedOverrideSnapshot,
        correctionReason: overrideReason!,
        correctedBy: this.actorIdObject(),
        correctedAt: new Date(),
        createdBy: this.actorIdObject(),
        updatedBy: this.actorIdObject(),
      });
    }

    annualAssignment.annualState = AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.DRAFT;
    annualAssignment.version += 1;
    await annualAssignment.save();

    await this.audit(
      isSubmittedOverride
        ? 'PMS_ANNUAL_DECISION_SUBMITTED_OVERRIDE_SAVED'
        : 'PMS_ANNUAL_DECISION_DRAFT_SAVED',
      'ANNUAL_DECISION',
      decision._id.toString(),
      isSubmittedOverride
        ? originalOverrideSnapshot
        : existingDecision?.toObject(),
      isSubmittedOverride
        ? correctedOverrideSnapshot
        : decision.toObject(),
      isSubmittedOverride ? overrideReason : undefined,
    );

    return decision;
  }

  async submitDecision(annualAssignmentId: string): Promise<IAnnualDecision> {
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    this.assertAssignedL3DecisionOwner(annualAssignment, 'annualDecision.submit');
    const decision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
    });

    if (!decision) {
      throw new Error('Annual decision draft must exist before submit');
    }

    if (decision.decisionStatus !== AnnualDecisionStatus.DRAFT) {
      throw new Error('Only draft annual decisions can be submitted');
    }
    await this.assertAnnualDecisionGate(
      annualAssignment,
      'SUBMIT',
      decision.decisionStatus,
    );

    const annualDecisionValues = await AnnualDecisionValue.find({
      annualDecisionId: decision._id,
      isDeleted: false,
    }).lean();
    const effectiveFinalScore = RATING_ONLY_MANAGER_REVIEW
      ? undefined
      : await this.resolveEffectiveAnnualFinalScore(
          decision._id,
          await this.calculateAnnualFinalScore(annualAssignment),
        );
    const proposedFinalRating = await this.resolveProposedFinalRatingForAssignment(
      annualAssignment,
    );
    const finalRating = await this.validateManagerOverallRating(
      decision.finalRating?.trim() || proposedFinalRating,
      true,
    );
    const decisionInput = {
      ...this.buildDecisionInputFromRecord(decision, annualDecisionValues),
      finalScore: effectiveFinalScore,
      finalRating,
    };
    const appraisalOutcomeType = this.deriveOutcome(
      Boolean(decision.isGradeApplied),
      Boolean(decision.isMeritApplied),
    );
    this.validateDecisionInput(decisionInput, appraisalOutcomeType);
    await this.validateAnnualTemplateInput(annualAssignment, decisionInput);

    const previousValue = decision.toObject();
    decision.finalScore = effectiveFinalScore;
    decision.finalRating = finalRating;
    decision.decisionStatus = AnnualDecisionStatus.SUBMITTED;
    decision.submittedBy = this.actorIdObject();
    decision.submittedAt = new Date();
    decision.updatedBy = this.actorIdObject();
    decision.version += 1;
    await decision.save();
    if (!RATING_ONLY_MANAGER_REVIEW && effectiveFinalScore !== undefined) {
      await this.syncAnnualFinalScoreValue(decision, annualAssignment, effectiveFinalScore);
    }
    if (finalRating) {
      await this.syncAnnualFinalRatingValue(decision, annualAssignment, finalRating);
    }

    annualAssignment.annualState = AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.SUBMITTED;
    annualAssignment.version += 1;
    await annualAssignment.save();

    await this.audit(
      'PMS_ANNUAL_DECISION_SUBMITTED',
      'ANNUAL_DECISION',
      decision._id.toString(),
      previousValue,
      decision.toObject(),
    );

    return decision;
  }

  async freezeDecision(annualAssignmentId: string): Promise<IAnnualDecision> {
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    this.assertAssignedL3DecisionOwner(annualAssignment, 'annualDecision.freeze');

    const decision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
    });

    if (!decision) {
      throw new Error('Annual decision draft must exist before freeze');
    }

    if (decision.frozenAt || decision.decisionStatus === AnnualDecisionStatus.FROZEN) {
      throw new Error('Annual decision is already frozen');
    }

    if (decision.decisionStatus !== AnnualDecisionStatus.SUBMITTED) {
      throw new Error('Annual decision must be submitted before freeze');
    }
    assertFinalReviewFreezeAllowed(
      annualAssignment.finalReviewStatus,
      annualAssignment.directorReviewStatus,
    );
    await this.assertAnnualDecisionGate(
      annualAssignment,
      'FREEZE',
      decision.decisionStatus,
    );
    if (!annualAssignment.templateVersionId) {
      throw new Error('Locked template version is required before freezing annual decision');
    }
    await new PmsEmployeeCareerProfileSnapshotService(
      this.context,
    ).freezeForAnnualAssignment(
      annualAssignment._id,
      EmployeeCareerProfileSnapshotTrigger.ANNUAL_FINALIZATION,
    );
    const objectiveMatrix = await this.loadObjectiveMatrixIfEnabled(annualAssignment, 'admin');
    assertObjectiveMatrixFreezeIntegrity(objectiveMatrix);
    const matrixService = new ObjectiveMatrixService(this.context);
    const [employeeMatrix, managerMatrix, reviewerMatrix, termAssignments, cycle, templateVersion] =
      await Promise.all([
        objectiveMatrix
          ? matrixService.getAnnualMatrix(annualAssignmentId, { mode: 'employee' })
          : Promise.resolve(null),
        objectiveMatrix
          ? matrixService.getAnnualMatrix(annualAssignmentId, { mode: 'manager' })
          : Promise.resolve(null),
        objectiveMatrix
          ? matrixService.getAnnualMatrix(annualAssignmentId, { mode: 'reviewer' })
          : Promise.resolve(null),
        TermAssignment.find({
          annualAssignmentId: annualAssignment._id,
          assessmentTermCode: { $in: annualAssignment.applicableTerms },
          isDeleted: false,
        }).sort({ assessmentTermCode: 1 }).lean(),
        AnnualCycle.findById(annualAssignment.cycleId).lean(),
        PmsTemplateVersion.findById(annualAssignment.templateVersionId).lean(),
      ]);
    [employeeMatrix, managerMatrix, reviewerMatrix].forEach((matrix) =>
      assertObjectiveMatrixFreezeIntegrity(matrix),
    );
    const template = templateVersion?.templateId
      ? await PmsTemplate.findById(templateVersion.templateId).lean()
      : null;

    const previousValue = decision.toObject();
    decision.decisionStatus = AnnualDecisionStatus.FROZEN;
    decision.frozenAt = new Date();
    decision.frozenBy = this.actorIdObject();
    decision.updatedBy = this.actorIdObject();
    decision.version += 1;
    await decision.save();

    annualAssignment.annualState = AnnualWorkflowState.ANNUAL_FINALIZED;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.FROZEN;
    annualAssignment.isGradeApplied = decision.isGradeApplied;
    annualAssignment.isMeritApplied = decision.isMeritApplied;
    annualAssignment.gradeDetails = decision.gradeDetails;
    annualAssignment.meritDetails = decision.meritDetails;
    annualAssignment.nilReason = decision.nilReason;
    annualAssignment.appraisalOutcomeType = decision.appraisalOutcomeType;
    annualAssignment.version += 1;
    await annualAssignment.save();

    const annualDecisionValues = await AnnualDecisionValue.find({
      annualDecisionId: decision._id,
      isDeleted: false,
    }).lean();
    const freezeSnapshotPayload = {
      annualSnapshot: annualAssignment.toObject(),
      termSnapshots: Object.fromEntries(
        termAssignments.map((termAssignment) => [
          termAssignment.assessmentTermCode,
          { termAssignment },
        ]),
      ),
      finalDecisionSnapshot: {
        snapshotKind: 'ANNUAL_DECISION_FREEZE',
        decision: decision.toObject(),
        annualDecisionValues,
        objectiveMatrix,
        objectiveMatricesByView: {
          employee: employeeMatrix,
          manager: managerMatrix,
          reviewer: reviewerMatrix,
          admin: objectiveMatrix,
        },
        objectiveMatrixContentHash: objectiveMatrix?.contentHash,
        objectiveMatrixLayoutVersion: objectiveMatrix?.layoutVersion,
        objectiveMatrixContentVersion: objectiveMatrix?.contentVersion,
        objectiveEvidenceManifest: buildObjectiveEvidenceSnapshotManifest(objectiveMatrix),
        reportMetadata: {
          cycle: cycle ? {
            _id: cycle._id,
            name: cycle.name,
            code: cycle.code,
            appraisalYear: cycle.appraisalYear,
            assessmentTermType: cycle.assessmentTermType,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
          } : null,
          template: template ? {
            _id: template._id,
            name: template.name,
            code: template.code,
          } : null,
          templateVersion: templateVersion ? {
            _id: templateVersion._id,
            versionNo: templateVersion.versionNo,
            version: templateVersion.version,
          } : null,
        },
      },
      visibilitySnapshot: {
        annualAssignmentVisibility: annualAssignment.visibility,
      },
    };
    await PerformanceHistorySnapshot.create({
      annualAssignmentId: annualAssignment._id,
      cycleId: annualAssignment.cycleId,
      employeeId: annualAssignment.employeeId,
      templateVersionId: annualAssignment.templateVersionId,
      ...freezeSnapshotPayload,
      snapshotHash: createHash('sha256')
        .update(JSON.stringify(freezeSnapshotPayload))
        .digest('hex'),
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });

    await this.audit(
      'PMS_ANNUAL_DECISION_FROZEN',
      'ANNUAL_DECISION',
      decision._id.toString(),
      previousValue,
      decision.toObject(),
    );

    return decision;
  }

  async reopenDecision(
    annualAssignmentId: string,
    input: ReopenDecisionInput,
  ): Promise<IAnnualDecision> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Reopen reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    this.assertAssignedL3DecisionOwner(annualAssignment, 'annualDecision.reopen');
    const decision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    });

    if (!decision) {
      throw new Error('Annual decision not found');
    }

    if (
      decision.decisionStatus !== AnnualDecisionStatus.FROZEN &&
      decision.decisionStatus !== AnnualDecisionStatus.VISIBILITY_ENABLED
    ) {
      throw new Error('Only frozen annual decisions can be reopened');
    }

    if (!annualAssignment.templateVersionId) {
      throw new Error('Locked template version is required before reopening annual decision');
    }

    const [termAssignments, termReviews, visibilityConfiguration, objectiveMatrix] = await Promise.all([
      TermAssignment.find({
        annualAssignmentId: annualAssignment._id,
        assessmentTermCode: { $in: annualAssignment.applicableTerms },
        isDeleted: false,
      })
        .sort({ assessmentTermCode: 1 })
        .lean(),
      TermReview.find({
        termAssignmentId: { $in: annualAssignment.termAssignmentIds },
        isDeleted: false,
      }).lean(),
      VisibilityConfiguration.findOne({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }),
      this.loadObjectiveMatrixIfEnabled(annualAssignment, 'admin'),
    ]);

    const termReviewMap = new Map(
      termReviews.map((item) => [item.termAssignmentId.toString(), item]),
    );

    const annualDecisionValues = await AnnualDecisionValue.find({
      annualDecisionId: decision._id,
      isDeleted: false,
    }).lean();
    const snapshotPayload = {
      annualSnapshot: annualAssignment.toObject(),
      termSnapshots: Object.fromEntries(
        termAssignments.map((termAssignment) => [
          termAssignment.assessmentTermCode,
          {
            termAssignment,
            termReview: termReviewMap.get(termAssignment._id.toString()) ?? null,
          },
        ]),
      ),
      finalDecisionSnapshot: {
        snapshotKind: 'PRE_REOPEN',
        reopenReason: reason,
        decision: decision.toObject(),
        annualDecisionValues,
        objectiveMatrix,
        objectiveMatrixContentHash: objectiveMatrix?.contentHash,
        objectiveMatrixLayoutVersion: objectiveMatrix?.layoutVersion,
        objectiveMatrixContentVersion: objectiveMatrix?.contentVersion,
      },
      visibilitySnapshot: {
        visibilityConfiguration: visibilityConfiguration?.toObject() ?? null,
        annualAssignmentVisibility: annualAssignment.visibility,
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
      snapshotHash,
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });

    await CorrectionLayer.create({
      entityType: 'ANNUAL_DECISION',
      entityId: decision._id,
      fieldKey: 'REOPEN_DECISION',
      originalValue: {
        annualState: annualAssignment.annualState,
        finalDecisionStatus: annualAssignment.finalDecisionStatus,
        decisionStatus: decision.decisionStatus,
        frozenAt: decision.frozenAt,
      },
      correctedValue: {
        annualState: AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT,
        finalDecisionStatus: AnnualDecisionStatus.DRAFT,
        decisionStatus: AnnualDecisionStatus.DRAFT,
      },
      correctionReason: reason,
      correctedBy: this.actorIdObject(),
      correctedAt: new Date(),
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });

    const previousDecisionValue = decision.toObject();
    decision.decisionStatus = AnnualDecisionStatus.DRAFT;
    decision.submittedAt = undefined;
    decision.submittedBy = undefined;
    decision.frozenAt = undefined;
    decision.frozenBy = undefined;
    decision.updatedBy = this.actorIdObject();
    decision.version += 1;
    await decision.save();

    // Reopening corrects only the annual management decision. The completed L2
    // and L3 assessments are immutable decision inputs and must remain completed
    // and visible; resetting them would incorrectly force the review chain to run
    // again before the reopened draft could be edited.

    if (visibilityConfiguration) {
      const previousVisibilityValue = visibilityConfiguration.toObject();
      visibilityConfiguration.employeeReviewVisible = false;
      visibilityConfiguration.employeeGradeVisible = false;
      visibilityConfiguration.employeeMeritVisible = false;
      visibilityConfiguration.managerGradeVisible = false;
      visibilityConfiguration.managerMeritVisible = false;
      visibilityConfiguration.disabledBy = this.actorIdObject();
      visibilityConfiguration.disabledAt = new Date();
      visibilityConfiguration.updatedBy = this.actorIdObject();
      visibilityConfiguration.version += 1;
      await visibilityConfiguration.save();

      await this.audit(
        'PMS_ANNUAL_VISIBILITY_RESET_ON_REOPEN',
        'VISIBILITY_CONFIGURATION',
        visibilityConfiguration._id.toString(),
        previousVisibilityValue,
        visibilityConfiguration.toObject(),
        reason,
      );
    }

    const previousAssignmentValue = annualAssignment.toObject();
    annualAssignment.annualState = AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.DRAFT;
    annualAssignment.visibility.employeeReviewVisible = false;
    annualAssignment.visibility.employeeGradeVisible = false;
    annualAssignment.visibility.employeeMeritVisible = false;
    annualAssignment.visibility.managerGradeVisible = false;
    annualAssignment.visibility.managerMeritVisible = false;
    annualAssignment.version += 1;
    await annualAssignment.save();

    await this.audit(
      'PMS_ANNUAL_DECISION_REOPENED',
      'ANNUAL_DECISION',
      decision._id.toString(),
      previousDecisionValue,
      decision.toObject(),
      reason,
    );

    await this.audit(
      'PMS_ANNUAL_ASSIGNMENT_REOPENED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      previousAssignmentValue,
      annualAssignment.toObject(),
      reason,
    );

    return decision;
  }

  async overrideFinalScore(
    annualAssignmentId: string,
    input: OverrideFinalScoreInput,
  ): Promise<IAnnualDecision> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Final score override reason is required');
    }

    const overrideScore = Number(input.overrideScore);
    if (!Number.isFinite(overrideScore) || overrideScore < 0 || overrideScore > 100) {
      throw new Error('Final score override must be a number from 0 to 100');
    }

    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    this.assertAssignedL3DecisionOwner(annualAssignment, 'annualDecision.finalScore.override');
    await this.assertAllQuartersComplete(annualAssignment._id);
    await this.assertAppraisalWindowOpen(annualAssignment);

    const decision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    });
    if (!decision) {
      throw new Error('Annual decision draft must exist before final score override');
    }

    if (
      decision.frozenAt ||
      decision.decisionStatus === AnnualDecisionStatus.FROZEN ||
      decision.decisionStatus === AnnualDecisionStatus.VISIBILITY_ENABLED
    ) {
      throw new Error('Frozen annual decisions must be reopened before final score override');
    }

    const systemFinalScore = await this.calculateAnnualFinalScore(annualAssignment);
    const previousEffectiveFinalScore = Number.isFinite(Number(decision.finalScore))
      ? Number(decision.finalScore)
      : systemFinalScore;
    const roundedOverrideScore = this.roundAnnualScore(overrideScore);
    const resolvedFinalRating =
      await this.resolveFinalRatingFromScore(annualAssignment, roundedOverrideScore);
    const previousValue = decision.toObject();

    await CorrectionLayer.create({
      entityType: 'ANNUAL_DECISION',
      entityId: decision._id,
      fieldKey: 'FINAL_SCORE_OVERRIDE',
      originalValue: {
        systemFinalScore,
        previousEffectiveFinalScore,
        decisionStatus: decision.decisionStatus,
      },
      correctedValue: {
        overriddenFinalScore: roundedOverrideScore,
        effectiveFinalScore: roundedOverrideScore,
      },
      correctionReason: reason,
      correctedBy: this.actorIdObject(),
      correctedAt: new Date(),
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });

    decision.finalScore = roundedOverrideScore;
    if (resolvedFinalRating) {
      decision.finalRating = resolvedFinalRating;
    }
    decision.updatedBy = this.actorIdObject();
    decision.version += 1;
    await decision.save();
    await this.syncAnnualFinalScoreValue(decision, annualAssignment, roundedOverrideScore);
    if (resolvedFinalRating) {
      await this.syncAnnualFinalRatingValue(decision, annualAssignment, resolvedFinalRating);
    }

    await this.audit(
      'PMS_ANNUAL_FINAL_SCORE_OVERRIDDEN',
      'ANNUAL_DECISION',
      decision._id.toString(),
      previousValue,
      decision.toObject(),
      reason,
    );

    return decision;
  }

  async overrideFinalRating(
    annualAssignmentId: string,
    input: OverrideFinalRatingInput,
  ): Promise<IAnnualDecision> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Final rating override reason is required');
    }
    const overrideRating = await this.validateManagerOverallRating(
      input.overrideRating,
      true,
    );

    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    this.assertAssignedL3DecisionOwner(annualAssignment, 'annualDecision.finalRating.override');
    await this.assertAllQuartersComplete(annualAssignment._id);
    await this.assertAppraisalWindowOpen(annualAssignment);

    const decision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    });
    if (!decision) {
      throw new Error('Annual decision draft must exist before final rating override');
    }

    if (
      decision.frozenAt ||
      decision.decisionStatus === AnnualDecisionStatus.FROZEN ||
      decision.decisionStatus === AnnualDecisionStatus.VISIBILITY_ENABLED
    ) {
      throw new Error('Frozen annual decisions must be reopened before final rating override');
    }

    const proposedFinalRating = await this.resolveProposedFinalRatingForAssignment(
      annualAssignment,
    );
    const previousValue = decision.toObject();

    await CorrectionLayer.create({
      entityType: 'ANNUAL_DECISION',
      entityId: decision._id,
      fieldKey: 'FINAL_RATING_OVERRIDE',
      originalValue: {
        proposedFinalRating,
        previousEffectiveFinalRating: decision.finalRating,
        decisionStatus: decision.decisionStatus,
      },
      correctedValue: {
        overriddenFinalRating: overrideRating,
        effectiveFinalRating: overrideRating,
      },
      correctionReason: reason,
      correctedBy: this.actorIdObject(),
      correctedAt: new Date(),
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });

    decision.finalRating = overrideRating;
    decision.updatedBy = this.actorIdObject();
    decision.version += 1;
    await decision.save();
    await this.syncAnnualFinalRatingValue(decision, annualAssignment, overrideRating!);

    await this.audit(
      'PMS_ANNUAL_FINAL_RATING_OVERRIDDEN',
      'ANNUAL_DECISION',
      decision._id.toString(),
      previousValue,
      decision.toObject(),
      reason,
    );

    return decision;
  }

  async updateVisibility(
    annualAssignmentId: string,
    input: UpdateVisibilityInput,
  ): Promise<IAnnualAssignment> {
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    this.assertAssignedL3DecisionOwner(annualAssignment, 'annualDecision.visibility');
    const decision = await AnnualDecision.findOne({ annualAssignmentId: annualAssignment._id });
    if (
      !decision ||
      (
        decision.decisionStatus !== AnnualDecisionStatus.FROZEN &&
        decision.decisionStatus !== AnnualDecisionStatus.VISIBILITY_ENABLED
      )
    ) {
      throw new Error('Visibility can be updated only after annual decision is frozen');
    }

    const visibleFrom = String(input.visibleFrom ?? '').trim();
    if (!visibleFrom) {
      throw new Error('Please select a visibility start date.');
    }
    const visibleFromDate = new Date(visibleFrom);
    if (Number.isNaN(visibleFromDate.getTime())) {
      throw new Error('Please select a valid visibility start date.');
    }

    const previousAssignmentValue = annualAssignment.toObject();
    const visibilityConfig = await this.ensureVisibilityConfiguration(annualAssignment);
    const previousVisibilityValue = visibilityConfig.toObject();
    const previousDecisionValue = decision.toObject();

    visibilityConfig.employeeReviewVisible =
      input.employeeReviewVisible ?? visibilityConfig.employeeReviewVisible;
    visibilityConfig.employeeGradeVisible =
      input.employeeGradeVisible ?? visibilityConfig.employeeGradeVisible;
    visibilityConfig.employeeMeritVisible =
      input.employeeMeritVisible ?? visibilityConfig.employeeMeritVisible;
    visibilityConfig.managerGradeVisible =
      input.managerGradeVisible ?? visibilityConfig.managerGradeVisible;
    visibilityConfig.managerMeritVisible =
      input.managerMeritVisible ?? visibilityConfig.managerMeritVisible;
    visibilityConfig.visibleFrom = visibleFromDate;
    visibilityConfig.reason = input.reason ?? visibilityConfig.reason;
    visibilityConfig.updatedBy = this.actorIdObject();
    visibilityConfig.version += 1;

    const anyVisible = [
      visibilityConfig.employeeReviewVisible,
      visibilityConfig.employeeGradeVisible,
      visibilityConfig.employeeMeritVisible,
      visibilityConfig.managerGradeVisible,
      visibilityConfig.managerMeritVisible,
    ].some(Boolean);

    if (anyVisible) {
      visibilityConfig.enabledBy = this.actorIdObject();
      visibilityConfig.enabledAt = new Date();
      visibilityConfig.disabledBy = undefined;
      visibilityConfig.disabledAt = undefined;
    } else {
      visibilityConfig.disabledBy = this.actorIdObject();
      visibilityConfig.disabledAt = new Date();
    }

    await visibilityConfig.save();

    annualAssignment.visibility.employeeReviewVisible =
      visibilityConfig.employeeReviewVisible;
    annualAssignment.visibility.employeeGradeVisible =
      visibilityConfig.employeeGradeVisible;
    annualAssignment.visibility.employeeMeritVisible =
      visibilityConfig.employeeMeritVisible;
    annualAssignment.visibility.managerGradeVisible =
      visibilityConfig.managerGradeVisible;
    annualAssignment.visibility.managerMeritVisible =
      visibilityConfig.managerMeritVisible;
    annualAssignment.annualState = AnnualWorkflowState.VISIBILITY_ENABLED;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.VISIBILITY_ENABLED;
    annualAssignment.isGradeApplied = decision.isGradeApplied;
    annualAssignment.isMeritApplied = decision.isMeritApplied;
    annualAssignment.gradeDetails = decision.gradeDetails;
    annualAssignment.meritDetails = decision.meritDetails;
    annualAssignment.nilReason = decision.nilReason;
    annualAssignment.appraisalOutcomeType = decision.appraisalOutcomeType;
    annualAssignment.version += 1;
    await annualAssignment.save();

    decision.decisionStatus = AnnualDecisionStatus.VISIBILITY_ENABLED;
    decision.updatedBy = this.actorIdObject();
    decision.version += 1;
    await decision.save();

    await this.audit(
      'PMS_ANNUAL_DECISION_VISIBILITY_ENABLED',
      'ANNUAL_DECISION',
      decision._id.toString(),
      previousDecisionValue,
      decision.toObject(),
      input.reason,
    );

    await this.audit(
      'PMS_ANNUAL_VISIBILITY_UPDATED',
      'VISIBILITY_CONFIGURATION',
      visibilityConfig._id.toString(),
      previousVisibilityValue,
      visibilityConfig.toObject(),
      input.reason,
    );

    await this.audit(
      'PMS_ANNUAL_ASSIGNMENT_VISIBILITY_CACHE_UPDATED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      previousAssignmentValue,
      annualAssignment.toObject(),
      input.reason,
    );

    return annualAssignment;
  }

  private objectiveMatrixModeForActor(): ObjectiveMatrixMode {
    const actorRole = normalizePmsRole(this.requireActor().actorRole);
    if (actorRole === PmsRole.ADMIN) return 'admin';
    if (actorRole === PmsRole.MANAGER) return 'manager';
    if (actorRole === PmsRole.EMPLOYEE) return 'employee';
    return 'reviewer';
  }

  private async loadObjectiveMatrixIfEnabled(
    annualAssignment: IAnnualAssignment,
    mode: ObjectiveMatrixMode = this.objectiveMatrixModeForActor(),
  ): Promise<AnnualObjectiveMatrixResponse | null> {
    if (!annualAssignment.templateVersionId) return null;
    const templateVersion = await PmsTemplateVersion.findById(annualAssignment.templateVersionId)
      .select('sections')
      .lean();
    const enabled = templateVersion?.sections?.some((section) =>
      section.sectionType === PmsTemplateSectionType.OBJECTIVES &&
      section.objectiveConfig?.tableLayout?.enabled === true,
    );
    if (!enabled) return null;
    return new ObjectiveMatrixService(this.context).getAnnualMatrix(
      annualAssignment._id.toString(),
      {
        mode,
        employeeId: annualAssignment.employeeId.toString(),
      },
    );
  }

  private deriveOutcome(
    isGradeApplied: boolean,
    isMeritApplied: boolean,
  ): AppraisalOutcomeTypeType {
    if (isGradeApplied && isMeritApplied) return AppraisalOutcomeType.BOTH;
    if (isGradeApplied && !isMeritApplied) return AppraisalOutcomeType.GRADE_ONLY;
    if (!isGradeApplied && isMeritApplied) return AppraisalOutcomeType.MERIT_ONLY;
    return AppraisalOutcomeType.NIL;
  }

  private async assertAnnualDecisionGate(
    annualAssignment: IAnnualAssignment,
    action: AnnualDecisionGateAction,
    finalDecisionStatus: string,
  ): Promise<void> {
    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      assessmentTermCode: { $in: annualAssignment.applicableTerms },
      isDeleted: false,
    }).select('assessmentTermCode termState');
    const readiness = await this.resolveAnnualDecisionReadiness(
      annualAssignment,
      termAssignments,
      finalDecisionStatus,
    );

    if (!readiness.availableActions.includes(action)) {
      throw new Error(
        readiness.lockedReason ??
        `Annual decision action ${action} is not available in the current state`,
      );
    }
  }

  private async resolveAnnualDecisionReadiness(
    annualAssignment: Pick<
      IAnnualAssignment,
      '_id' | 'cycleId' | 'applicableTerms' | 'annualState' | 'finalReviewStatus' | 'directorReviewStatus'
    >,
    termAssignments: Array<Pick<ITermAssignment, 'assessmentTermCode' | 'termState'>>,
    finalDecisionStatus: string,
    cycleOverride?: IAnnualCycle | null,
  ): Promise<AnnualDecisionReadiness> {
    const applicableTerms = annualAssignment.applicableTerms ?? [];
    const termByCode = new Map(
      termAssignments.map((termAssignment) => [
        termAssignment.assessmentTermCode,
        termAssignment,
      ]),
    );
    const completedTerms = applicableTerms.filter((termCode) => {
      const termAssignment = termByCode.get(termCode);
      return termAssignment ? isTermFinalized(termAssignment.termState) : false;
    }).length;
    const allTermsFinalized =
      applicableTerms.length > 0 &&
      completedTerms === applicableTerms.length;
    const appraisalWindowStatus = await this.getAppraisalWindowStatus(
      annualAssignment as IAnnualAssignment,
      cycleOverride,
    );
    const annualState = String(annualAssignment.annualState ?? '');
    const availableActions = this.resolveAvailableActions({
      annualState,
      finalDecisionStatus,
      finalReviewStatus: annualAssignment.finalReviewStatus,
      directorReviewStatus: annualAssignment.directorReviewStatus,
      allTermsFinalized,
      isAppraisalWindowOpen: appraisalWindowStatus.isOpen,
    });

    return {
      isAppraisalWindowOpen: appraisalWindowStatus.isOpen,
      termProgress: {
        total: applicableTerms.length,
        completed: completedTerms,
      },
      allTermsFinalized,
      availableActions,
      lockedReason:
        finalDecisionStatus === AnnualDecisionStatus.SUBMITTED &&
        !this.areFinalReviewStagesComplete(
          annualAssignment.finalReviewStatus,
          annualAssignment.directorReviewStatus,
        )
          ? 'L2 and L3 assessments must be completed before finalisation'
          : this.resolveAnnualDecisionLockedReason({
              annualState,
              finalDecisionStatus,
              finalReviewStatus: annualAssignment.finalReviewStatus,
              directorReviewStatus: annualAssignment.directorReviewStatus,
              allTermsFinalized,
              isAppraisalWindowOpen: appraisalWindowStatus.isOpen,
              availableActions,
            }),
    };
  }

  private resolveAvailableActions(input: {
    annualState: string;
    finalDecisionStatus: string;
    finalReviewStatus?: string;
    directorReviewStatus?: string;
    allTermsFinalized: boolean;
    isAppraisalWindowOpen: boolean;
  }): AnnualDecisionAction[] {
    const {
      annualState,
      finalDecisionStatus,
      finalReviewStatus,
      directorReviewStatus,
      allTermsFinalized,
      isAppraisalWindowOpen,
    } = input;

    if (finalDecisionStatus === AnnualDecisionStatus.VISIBILITY_ENABLED) {
      return ['UPDATE_VISIBILITY', 'REOPEN'];
    }

    if (finalDecisionStatus === AnnualDecisionStatus.FROZEN) {
      return ['UPDATE_VISIBILITY', 'REOPEN'];
    }

    if (!allTermsFinalized) {
      return [];
    }

    if (!isAppraisalWindowOpen) {
      return [];
    }

    if (finalDecisionStatus === AnnualDecisionStatus.SUBMITTED) {
      if (
        annualState !== AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED &&
        annualState !== AnnualWorkflowState.COMMUNICATION_SENT
      ) {
        return [];
      }
      return this.areFinalReviewStagesComplete(finalReviewStatus, directorReviewStatus)
        ? ['SAVE_DRAFT', 'SUBMIT', 'FREEZE']
        : [];
    }

    if (
      finalDecisionStatus !== AnnualDecisionStatus.DRAFT ||
      (
        annualState !== AnnualWorkflowState.ALL_TERMS_FINALIZED &&
        annualState !== AnnualWorkflowState.APPRAISAL_WINDOW_OPEN &&
        annualState !== AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT
      )
    ) {
      return [];
    }

    return this.areFinalReviewStagesComplete(finalReviewStatus, directorReviewStatus)
      ? ['SAVE_DRAFT', 'SUBMIT']
      : [];
  }

  private areFinalReviewStagesComplete(
    l2Status?: string,
    directorStatus?: string,
  ): boolean {
    if (l2Status === FinalReviewStatus.NOT_REQUIRED) return true;
    return (
      l2Status === FinalReviewStatus.COMPLETED &&
      directorStatus === FinalReviewStatus.COMPLETED
    );
  }

  private resolveAnnualDecisionLockedReason(input: {
    annualState: string;
    finalDecisionStatus: string;
    finalReviewStatus?: string;
    directorReviewStatus?: string;
    allTermsFinalized: boolean;
    isAppraisalWindowOpen: boolean;
    availableActions: AnnualDecisionAction[];
  }): string | undefined {
    const {
      annualState,
      finalDecisionStatus,
      finalReviewStatus,
      directorReviewStatus,
      allTermsFinalized,
      isAppraisalWindowOpen,
      availableActions,
    } = input;

    if (availableActions.length > 0) {
      return undefined;
    }

    if (!allTermsFinalized) {
      return 'Waiting for all terms to be finalized.';
    }

    if (!isAppraisalWindowOpen && finalDecisionStatus !== AnnualDecisionStatus.FROZEN) {
      return 'All terms are finalized. Appraisal window is not open.';
    }

    if (
      !this.areFinalReviewStagesComplete(
        finalReviewStatus,
        directorReviewStatus,
      )
    ) {
      return 'L2 and L3 assessments must be completed before the annual decision.';
    }

    if (finalDecisionStatus === AnnualDecisionStatus.SUBMITTED) {
      return 'Annual decision is submitted, but annual assignment state is not ready for freeze.';
    }

    if (
      finalDecisionStatus === AnnualDecisionStatus.FROZEN ||
      finalDecisionStatus === AnnualDecisionStatus.VISIBILITY_ENABLED
    ) {
      return undefined;
    }

    if (
      finalDecisionStatus === AnnualDecisionStatus.DRAFT &&
      annualState !== AnnualWorkflowState.ALL_TERMS_FINALIZED &&
      annualState !== AnnualWorkflowState.APPRAISAL_WINDOW_OPEN &&
      annualState !== AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT
    ) {
      return 'Annual assignment is not ready for decision draft.';
    }

    return 'Annual decision is not available in the current state.';
  }

  private validateDecisionInput(
    input: SaveDecisionDraftInput,
    outcomeType: AppraisalOutcomeTypeType,
    requireComplete = true,
  ): void {
    if (input.finalScore !== undefined && input.finalScore !== null) {
      const finalScore = Number(input.finalScore);
      if (!Number.isFinite(finalScore) || finalScore < 0 || finalScore > 100) {
        throw new Error('Final Score must be a number from 0 to 100');
      }
    }

    if (typeof input.isGradeApplied !== 'boolean') {
      throw new Error('isGradeApplied is required');
    }

    if (typeof input.isMeritApplied !== 'boolean') {
      throw new Error('isMeritApplied is required');
    }

    if (
      requireComplete &&
      input.isGradeApplied &&
      !this.hasMeaningfulDecisionDetails(input.gradeDetails)
    ) {
      throw new Error('gradeDetails is required when grade is applied');
    }

    if (
      requireComplete &&
      input.isMeritApplied &&
      !this.hasMeaningfulDecisionDetails(input.meritDetails)
    ) {
      throw new Error('meritDetails is required when merit is applied');
    }

    if (input.isMeritApplied && input.meritDetails) {
      const meritPercentage =
        input.meritDetails.percentage ??
        input.meritDetails.meritPercentage ??
        input.meritDetails.amount ??
        input.meritDetails.meritAmount;
      if (meritPercentage !== undefined && meritPercentage !== null && String(meritPercentage).trim()) {
        const normalizedMeritPercentage = String(meritPercentage).trim();
        const numericMeritPercentage = Number(normalizedMeritPercentage);
        if (
          !/^\d*(?:\.\d*)?$/.test(normalizedMeritPercentage) ||
          !Number.isFinite(numericMeritPercentage) ||
          numericMeritPercentage < 0 ||
          numericMeritPercentage > 100
        ) {
          throw new Error('Merit Percentage must be a number from 0 to 100');
        }
      }
    }

    if (
      requireComplete &&
      outcomeType === AppraisalOutcomeType.NIL &&
      !input.nilReason?.trim()
    ) {
      throw new Error('Please provide a reason when neither grade nor merit is applied.');
    }
  }

  private normalizeMeritRecommendationForDecision(
    input: SaveDecisionDraftInput,
  ): SaveDecisionDraftInput {
    if (!input.isMeritApplied) {
      return input;
    }

    const normalizedInput: SaveDecisionDraftInput = {
      ...input,
      meritDetails: {
        ...(input.meritDetails ?? {}),
      },
      decisionValues: input.decisionValues?.map((decisionValue) => ({ ...decisionValue })),
    };

    const meritDetails = normalizedInput.meritDetails as Record<string, unknown>;
    const currentRecommendation =
      typeof meritDetails.recommendation === 'string'
        ? meritDetails.recommendation.trim()
        : '';
    if (!currentRecommendation || currentRecommendation.toLowerCase() === 'no_change') {
      meritDetails.recommendation = 'merit_applied';
    }

    normalizedInput.decisionValues = this.normalizeMeritRecommendationDecisionValues(
      normalizedInput.decisionValues ?? [],
    );

    return normalizedInput;
  }

  private normalizeMeritRecommendationDecisionValues(
    decisionValues: AnnualDecisionValueInput[],
  ): AnnualDecisionValueInput[] {
    return decisionValues.map((decisionValue) => {
      if (!this.isMeritRecommendationFieldKey(decisionValue.fieldKey)) {
        return decisionValue;
      }

      const textValue = decisionValue.valueText?.trim();
      if (textValue && textValue.toLowerCase() !== 'no_change') {
        return decisionValue;
      }

      return {
        ...decisionValue,
        valueText: 'merit_applied',
        valueJson: undefined,
        valueNumber: undefined,
        valueDate: undefined,
      };
    });
  }

  private async validateAnnualTemplateInput(
    annualAssignment: IAnnualAssignment,
    input: SaveDecisionDraftInput,
    requireComplete = true,
  ): Promise<void> {
    const resolvedTemplate = await this.resolveAnnualDecisionTemplate(annualAssignment, input);
    if (!resolvedTemplate) {
      return;
    }

    const values = this.buildAnnualTemplateResolveValues(input);
    const missingFields: string[] = [];
    const resolvedFieldMap = await this.resolveAnnualDecisionEditableFieldMap(
      annualAssignment,
      input,
      resolvedTemplate,
    );

    for (const decisionValue of input.decisionValues ?? []) {
      if (!decisionValue.fieldKey?.trim() || this.isFinalScoreFieldKey(decisionValue.fieldKey)) {
        continue;
      }

      const field = resolvedFieldMap.get(decisionValue.fieldKey);
      if (!field) {
        if (this.isStandardAnnualDecisionFieldKey(decisionValue.fieldKey)) {
          continue;
        }
        throw new Error(`Field "${decisionValue.fieldKey}" is not visible for Annual Decision`);
      }
      if (field.editable !== true) {
        throw new Error(`Field "${field.label || decisionValue.fieldKey}" is read-only for Annual Decision`);
      }
    }

    if (requireComplete) {
      for (const section of resolvedTemplate.sections) {
        for (const field of section.fields) {
          if (!field.required || field.editable !== true) {
            continue;
          }
          if (
            RATING_ONLY_MANAGER_REVIEW &&
            this.isFinalScoreFieldKey(field.key)
          ) {
            continue;
          }

          if (!this.hasMeaningfulAnnualTemplateFieldValue(field.key, field.type, values)) {
            missingFields.push(field.label || field.key);
          }
        }
      }
    }

    if (missingFields.length > 0) {
      throw new Error(`Annual decision requires values for: ${missingFields.join(', ')}`);
    }
  }

  private async calculateAnnualFinalScore(
    annualAssignment: IAnnualAssignment,
  ): Promise<number> {
    const annualScoringConfig = await this.resolveAnnualScoringConfig(annualAssignment);
    const includedAssessmentTerms = this.resolveIncludedAnnualScoringTerms(
      annualAssignment,
      annualScoringConfig,
    );
    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      assessmentTermCode: { $in: includedAssessmentTerms },
      isDeleted: false,
    });

    const termScores: Record<string, number> = {};
    for (const quarter of termAssignments) {
      if (!isTermFinalized(quarter.termState)) {
        throw new Error('Annual final score is blocked until all applicable terms are finalized or closed');
      }

      if (!Number.isFinite(Number(quarter.termScore))) {
        throw new Error(`Annual final score requires a score for ${quarter.assessmentTermCode}`);
      }

      termScores[quarter.assessmentTermCode] = Number(quarter.termScore);
    }

    const missingQuarter = includedAssessmentTerms.find(
      (assessmentTermCode) => !Number.isFinite(termScores[assessmentTermCode]),
    );
    if (missingQuarter) {
      throw new Error(`Annual final score requires a score for ${missingQuarter}`);
    }

    const score = this.scoringService.calculateAnnualRollup(
      termScores,
      annualScoringConfig,
    );

    if (!Number.isFinite(Number(score))) {
      throw new Error('Unable to calculate annual final score from quarter scores');
    }

    return this.roundAnnualScore(Number(score));
  }

  private resolveProposedFinalRating(
    annualAssignment: IAnnualAssignment,
    termAssignments: Array<Record<string, any> | ITermAssignment>,
  ): string | undefined {
    const ratingByTerm = new Map(
      termAssignments
        .map((termAssignment) => [
          String(termAssignment.assessmentTermCode),
          String(termAssignment.termRating ?? '').trim(),
        ] as const)
        .filter(([, rating]) => Boolean(rating)),
    );

    // Use the latest applicable assessment term rating as the annual proposal.
    // The explicit annual rating override remains available for management.
    const applicableTerms = [...(annualAssignment.applicableTerms ?? [])].reverse();
    for (const termCode of applicableTerms) {
      const rating = ratingByTerm.get(String(termCode));
      if (rating) {
        return rating;
      }
    }

    return undefined;
  }

  private async resolveProposedFinalRatingForAssignment(
    annualAssignment: IAnnualAssignment,
  ): Promise<string | undefined> {
    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      assessmentTermCode: { $in: annualAssignment.applicableTerms },
      isDeleted: false,
    }).lean();
    return this.resolveProposedFinalRating(annualAssignment, termAssignments);
  }

  private async validateManagerOverallRating(
    rating: string | undefined,
    required: boolean,
  ): Promise<string | undefined> {
    const normalizedRating = rating?.trim();
    if (!normalizedRating) {
      if (required) {
        throw new Error('Final Rating is required');
      }
      return undefined;
    }

    const managerRatingLov = await LOV.findOne({ type: 'managerrating' })
      .select('values')
      .lean();
    const activeOptions = managerRatingLov?.values?.filter(
      (option) => option.isActive !== false,
    ) ?? [];
    const matchedOption = activeOptions.find(
      (option) =>
        option.value.trim().toLowerCase() === normalizedRating.toLowerCase() ||
        option.label.trim().toLowerCase() === normalizedRating.toLowerCase(),
    );

    if (!matchedOption) {
      throw new Error('Final Rating must be an active Manager Rating option');
    }

    return matchedOption.value.trim();
  }

  private async tryCalculateAnnualFinalScore(
    annualAssignment: IAnnualAssignment,
  ): Promise<number | undefined> {
    try {
      return await this.calculateAnnualFinalScore(annualAssignment);
    } catch {
      return undefined;
    }
  }

  private async resolveEffectiveAnnualFinalScore(
    decisionId: Types.ObjectId | undefined,
    systemFinalScore: number,
  ): Promise<number> {
    if (!decisionId) {
      return systemFinalScore;
    }

    const latestOverride = await this.findLatestFinalScoreOverride(decisionId);
    const effectiveFinalScore = this.extractEffectiveOverrideScore(latestOverride);
    return effectiveFinalScore ?? systemFinalScore;
  }

  private async findLatestFinalScoreOverride(
    decisionId: Types.ObjectId,
  ): Promise<Record<string, unknown> | null> {
    return CorrectionLayer.findOne({
      entityType: 'ANNUAL_DECISION',
      entityId: decisionId,
      fieldKey: 'FINAL_SCORE_OVERRIDE',
      isDeleted: false,
    })
      .sort({ correctedAt: -1, createdAt: -1 })
      .lean();
  }

  private extractEffectiveOverrideScore(
    overrideEntry: Record<string, unknown> | null,
  ): number | undefined {
    if (!overrideEntry) {
      return undefined;
    }

    const correctedValue = overrideEntry.correctedValue as Record<string, unknown> | undefined;
    const score = correctedValue?.effectiveFinalScore ?? correctedValue?.overriddenFinalScore;
    return Number.isFinite(Number(score)) ? this.roundAnnualScore(Number(score)) : undefined;
  }

  private async resolveAnnualScoringConfig(
    annualAssignment: IAnnualAssignment,
  ): Promise<Parameters<PmsScoringService['calculateAnnualRollup']>[1]> {
    if (!annualAssignment.templateVersionId) {
      return undefined;
    }

    const templateVersion = await PmsTemplateVersion.findById(
      annualAssignment.templateVersionId,
    ).lean();
    const annualConfig =
      templateVersion?.annualScoringConfig && typeof templateVersion.annualScoringConfig === 'object'
        ? templateVersion.annualScoringConfig as Record<string, unknown>
        : {};
    const objectiveScoringPolicy = this.resolveObjectiveScoringPolicy(templateVersion?.sections ?? []);
    const reviewTimingPolicy =
      this.asRecord(objectiveScoringPolicy?.reviewTimingPolicy) ??
      this.asRecord(templateVersion?.flowPolicy);
    const groupingPolicy = this.asRecord(objectiveScoringPolicy?.includedAssessmentTermGroupingPolicy);
    const aggregationPolicy = this.asRecord(objectiveScoringPolicy?.termAggregationPolicy);

    const resolvedConfig: Parameters<PmsScoringService['calculateAnnualRollup']>[1] = {
      ...annualConfig,
      ...(aggregationPolicy ?? {}),
    };

    const aggregationMethod = this.resolveTermAggregationMethod(aggregationPolicy, annualConfig);
    if (aggregationMethod) {
      resolvedConfig.aggregationMethod = aggregationMethod;
    }

    const termWeights =
      this.asNumberRecord(aggregationPolicy?.termWeights) ??
      this.asNumberRecord(aggregationPolicy?.weights) ??
      this.asNumberRecord(annualConfig.termWeights) ??
      this.asNumberRecord(annualConfig.quarterWeights);
    if (termWeights) {
      resolvedConfig.termWeights = termWeights;
    }

    const includedTerms = this.resolvePolicyIncludedTerms(
      annualAssignment,
      reviewTimingPolicy,
      groupingPolicy,
    );
    if (includedTerms.length > 0) {
      resolvedConfig.includedTerms = includedTerms;
    }

    return Object.keys(resolvedConfig).length > 0 ? resolvedConfig : undefined;
  }

  private resolveIncludedAnnualScoringTerms(
    annualAssignment: IAnnualAssignment,
    annualScoringConfig: Parameters<PmsScoringService['calculateAnnualRollup']>[1],
  ): string[] {
    const configuredTerms = annualScoringConfig?.includedTerms ?? [];
    const applicableTerms = new Set((annualAssignment.applicableTerms ?? []).map(String));
    const includedTerms = configuredTerms
      .map(String)
      .filter((term) => applicableTerms.has(term));
    return includedTerms.length > 0 ? includedTerms : (annualAssignment.applicableTerms ?? []).map(String);
  }

  private resolveObjectiveScoringPolicy(sections: any[]): Record<string, unknown> | undefined {
    return sections
      .filter((section) => section.sectionType === 'OBJECTIVES')
      .map((section) => section.objectiveConfig?.objectiveScoringPolicy)
      .find((policy) => policy && typeof policy === 'object');
  }

  private resolvePolicyIncludedTerms(
    annualAssignment: IAnnualAssignment,
    reviewTimingPolicy?: Record<string, unknown>,
    groupingPolicy?: Record<string, unknown>,
  ): string[] {
    const applicableTerms = (annualAssignment.applicableTerms ?? []).map(String);
    const applicableSet = new Set(applicableTerms);
    const explicitTerms = this.readTermList(
      groupingPolicy?.includedTerms ??
      groupingPolicy?.assessmentTerms ??
      groupingPolicy?.terms ??
      reviewTimingPolicy?.includedTerms,
    );
    if (explicitTerms.length > 0) {
      return explicitTerms.filter((term) => applicableSet.has(term));
    }

    const timing = String(
      reviewTimingPolicy?.reviewTiming ??
      reviewTimingPolicy?.managerReviewTiming ??
      reviewTimingPolicy?.timing ??
      '',
    ).toUpperCase();
    if (timing === 'ANNUAL') {
      return applicableTerms;
    }

    const groupKey = String(
      groupingPolicy?.reviewGroupKey ??
      groupingPolicy?.groupKey ??
      reviewTimingPolicy?.reviewGroupKey ??
      '',
    );
    const groupedTerms = this.resolveReviewGroupTerms(
      groupingPolicy?.reviewGroups ?? reviewTimingPolicy?.managerReviewGroups,
      groupKey,
    );
    if (groupedTerms.length > 0) {
      return groupedTerms.filter((term) => applicableSet.has(term));
    }

    return [];
  }

  private resolveReviewGroupTerms(groups: unknown, groupKey: string): string[] {
    if (!Array.isArray(groups)) {
      return [];
    }

    const group = groups.find((item) => {
      const record = this.asRecord(item);
      if (!record) return false;
      if (!groupKey) return true;
      return [record.reviewGroupKey, record.groupKey, record.key].map(String).includes(groupKey);
    });
    const record = this.asRecord(group);
    return this.readTermList(record?.inputTerms ?? record?.includedTerms ?? record?.terms);
  }

  private resolveTermAggregationMethod(
    aggregationPolicy?: Record<string, unknown>,
    annualConfig?: Record<string, unknown>,
  ): NonNullable<Parameters<PmsScoringService['calculateAnnualRollup']>[1]>['aggregationMethod'] | undefined {
    const value = String(
      aggregationPolicy?.aggregationMethod ??
      aggregationPolicy?.method ??
      annualConfig?.aggregationMethod ??
      '',
    ).toUpperCase();
    if (
      value === 'EQUAL_TERM_AVERAGE' ||
      value === 'TERM_WEIGHTED_AVERAGE' ||
      value === 'MANUAL_GROUP_OVERALL_SCORE' ||
      value === 'WEIGHTED_AVERAGE' ||
      value === 'SIMPLE_AVERAGE'
    ) {
      return value;
    }
    return aggregationPolicy ? 'EQUAL_TERM_AVERAGE' : undefined;
  }

  private readTermList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((term) => term.trim())
        .filter(Boolean);
    }
    return [];
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private asNumberRecord(value: unknown): Record<string, number> | undefined {
    const record = this.asRecord(value);
    if (!record) return undefined;
    const numberRecord = Object.entries(record).reduce<Record<string, number>>((acc, [key, rawValue]) => {
      const numericValue = Number(rawValue);
      if (Number.isFinite(numericValue)) {
        acc[key] = numericValue;
      }
      return acc;
    }, {});
    return Object.keys(numberRecord).length > 0 ? numberRecord : undefined;
  }

  private roundAnnualScore(score: number): number {
    return Math.round((score + Number.EPSILON) * 1_000_000) / 1_000_000;
  }

  private async resolveFinalRatingFromScore(
    annualAssignment: IAnnualAssignment,
    finalScore: number,
  ): Promise<string | undefined> {
    if (!annualAssignment.templateVersionId || !Number.isFinite(finalScore)) {
      return undefined;
    }

    const templateVersion = await PmsTemplateVersion.findById(
      annualAssignment.templateVersionId,
    ).lean();
    const fields = (templateVersion?.sections ?? []).flatMap((section: any) => section.fields ?? []);
    const ratingField = fields.find((field: any) =>
      ['annualoverallrating', 'finalrating', 'rating'].includes(
        this.normalizeAnnualFieldKey(field.fieldKey ?? field.key ?? ''),
      ),
    );
    const options = Array.isArray(ratingField?.options) ? ratingField.options : [];
    const scoredOptions: Array<{ value: string; score: number }> = options
      .map((option: any) => ({
        value: String(option.value ?? ''),
        score: Number(option.score ?? option.weight),
      }))
      .filter((option: { value: string; score: number }) => option.value && Number.isFinite(option.score))
      .sort((a: { score: number }, b: { score: number }) => a.score - b.score);

    if (scoredOptions.length === 0) {
      return undefined;
    }

    const selected =
      [...scoredOptions].reverse().find((option) => finalScore >= option.score) ??
      scoredOptions[0];
    return selected.value;
  }

  private async resolveAnnualDecisionTemplate(
    annualAssignment: IAnnualAssignment,
    input: SaveDecisionDraftInput,
    hierarchyScope?: string,
  ): Promise<ResolvedTemplateVersion | null> {
    if (!annualAssignment.templateVersionId) {
      return null;
    }

    const role = this.resolveAnnualDecisionTemplateRole(annualAssignment);
    const templateService = new PmsTemplateService(this.context);

    return templateService.resolveTemplateVersion(
      annualAssignment.templateVersionId.toString(),
      {
        role,
        workflowState: this.resolveAnnualDecisionTemplateWorkflowState(annualAssignment),
        ...(hierarchyScope ? { hierarchyScope } : {}),
        annualAssignmentId: annualAssignment._id.toString(),
        values: this.buildAnnualTemplateResolveValues(input),
      },
    );
  }

  private async resolveAnnualDecisionEditableFieldMap(
    annualAssignment: IAnnualAssignment,
    input: SaveDecisionDraftInput,
    primaryTemplate: ResolvedTemplateVersion,
  ): Promise<Map<string, ResolvedTemplateField>> {
    const fieldMap = new Map(
      primaryTemplate.sections.flatMap((section) => section.fields).map((field) => [field.key, field]),
    );
    const role = this.resolveAnnualDecisionTemplateRole(annualAssignment);
    if (role !== PmsRole.ADMIN) {
      return fieldMap;
    }

    for (const hierarchyScope of ['global', 'direct-report', 'department']) {
      const scopedTemplate = await this.resolveAnnualDecisionTemplate(
        annualAssignment,
        input,
        hierarchyScope,
      );
      for (const field of scopedTemplate?.sections.flatMap((section) => section.fields) ?? []) {
        if (!fieldMap.has(field.key) || field.editable === true) {
          fieldMap.set(field.key, field);
        }
      }
    }

    for (const decisionValue of input.decisionValues ?? []) {
      if (
        !decisionValue.fieldKey?.trim() ||
        fieldMap.get(decisionValue.fieldKey)?.editable === true ||
        this.isStandardAnnualDecisionFieldKey(decisionValue.fieldKey)
      ) {
        continue;
      }

      const rawTemplateField = await this.resolveEditableRawAnnualDecisionField(
        annualAssignment,
        decisionValue,
      );
      if (rawTemplateField) {
        fieldMap.set(decisionValue.fieldKey, rawTemplateField);
        fieldMap.set(rawTemplateField.key, rawTemplateField);
      }
    }

    return fieldMap;
  }

  private async resolveEditableRawAnnualDecisionField(
    annualAssignment: IAnnualAssignment,
    decisionValue: AnnualDecisionValueInput,
  ): Promise<ResolvedTemplateField | null> {
    if (!annualAssignment.templateVersionId || !decisionValue.fieldKey?.trim() || !decisionValue.sectionKey?.trim()) {
      return null;
    }

    const templateVersion = await PmsTemplateVersion.findOne({
      _id: annualAssignment.templateVersionId,
      isDeleted: false,
    }).lean();
    if (!templateVersion) {
      return null;
    }

    const requestedSectionKey = this.normalizeAnnualFieldKey(decisionValue.sectionKey);
    const requestedFieldKeys = [
      decisionValue.fieldKey,
      decisionValue.templateFieldId,
    ]
      .map((value) => this.normalizeAnnualFieldKey(value ?? ''))
      .filter(Boolean);
    const role = this.resolveAnnualDecisionTemplateRole(annualAssignment);
    const workflowState = this.resolveAnnualDecisionTemplateWorkflowState(annualAssignment);

    for (const section of templateVersion.sections ?? []) {
      if (this.normalizeAnnualFieldKey(section.sectionKey) !== requestedSectionKey) {
        continue;
      }
      if (!this.isAnnualDecisionTemplateSection(section) && !this.isAnnualDecisionCommunicationSection(section)) {
        continue;
      }

      const field = (section.fields ?? []).find((item) =>
        requestedFieldKeys.includes(this.normalizeAnnualFieldKey(item.fieldKey)),
      );
      const fieldWorkflowState = this.isAnnualDecisionCommunicationSection(section)
        ? AnnualWorkflowState.COMMUNICATION_READY
        : workflowState;
      if (!field) {
        return null;
      }

      const assignedL3OwnsCommunicationField =
        this.isAnnualDecisionCommunicationSection(section) &&
        annualAssignment.directorReviewerId?.toString() === this.context.user?._id?.toString();
      if (
        !assignedL3OwnsCommunicationField &&
        !this.isRawAnnualDecisionFieldEditable(field, section, role, fieldWorkflowState)
      ) {
        return null;
      }

      return this.mapRawAnnualDecisionField(field);
    }

    return null;
  }

  private resolveAnnualDecisionTemplateRole(
    annualAssignment: Pick<IAnnualAssignment, 'directorReviewerId'>,
  ): string {
    const actorId = this.context.user?._id?.toString();
    if (actorId && annualAssignment.directorReviewerId?.toString() === actorId) {
      // The selected L3 owns the same Annual Decision form and governed fields
      // that Admin configures, while write authorization remains ID-scoped.
      return PmsRole.ADMIN;
    }
    return normalizePmsRole(this.context.reqRole) ?? PmsRole.ADMIN;
  }

  private isAnnualDecisionTemplateSection(section: ITemplateSection): boolean {
    const sectionRecord = section as ITemplateSection & Record<string, unknown>;
    const metadata = this.asRecord(section.metadata);
    const module = String(sectionRecord.module ?? metadata?.module ?? '').trim();
    const sectionType = String(section.sectionType ?? '').trim();

    const annualDecisionSectionTypes = new Set<string>([
      PmsTemplateSectionType.ANNUAL_SUMMARY,
      PmsTemplateSectionType.FINAL_GRADE,
      PmsTemplateSectionType.MERIT,
      PmsTemplateSectionType.APPRAISAL_COMMUNICATION,
      PmsTemplateSectionType.OVERALL_FEEDBACK,
    ]);

    return module === 'Annual Appraisal Decision Management' || annualDecisionSectionTypes.has(sectionType);
  }

  private isAnnualDecisionCommunicationSection(section: ITemplateSection): boolean {
    const sectionRecord = section as ITemplateSection & Record<string, unknown>;
    const metadata = this.asRecord(section.metadata);
    const module = String(sectionRecord.module ?? metadata?.module ?? '').trim();
    const sectionType = String(section.sectionType ?? '').trim();
    const purpose = String(metadata?.permissionPurpose ?? metadata?.customSectionPurpose ?? '').trim();

    return (
      module === 'Visibility Governance' ||
      sectionType === PmsTemplateSectionType.VISIBILITY_GOVERNANCE ||
      purpose === 'VISIBILITY_COMMUNICATION'
    );
  }

  private resolveAnnualDecisionTemplateWorkflowState(
    annualAssignment: IAnnualAssignment,
  ): string {
    const submittedDecisionCanBeCorrected =
      annualAssignment.finalDecisionStatus === AnnualDecisionStatus.SUBMITTED &&
      annualAssignment.annualState === AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED &&
      this.areFinalReviewStagesComplete(
        annualAssignment.finalReviewStatus,
        annualAssignment.directorReviewStatus,
      );

    if (
      (
        annualAssignment.finalDecisionStatus === AnnualDecisionStatus.DRAFT ||
        submittedDecisionCanBeCorrected
      ) &&
      (
        annualAssignment.annualState === AnnualWorkflowState.ALL_TERMS_FINALIZED ||
        annualAssignment.annualState === AnnualWorkflowState.APPRAISAL_WINDOW_OPEN ||
        annualAssignment.annualState === AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED
      )
    ) {
      return AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT;
    }

    return annualAssignment.annualState;
  }

  private isRawAnnualDecisionFieldEditable(
    field: ITemplateField,
    section: ITemplateSection,
    role: string,
    workflowState: string,
  ): boolean {
    const behavior = (field.behaviors ?? []).find((item) =>
      normalizePmsRole(item.role) === role &&
      item.workflowState === workflowState,
    );
    if (behavior) {
      return behavior.visibility === 'VISIBLE' && behavior.editability === 'EDITABLE';
    }

    const fieldEditableBy = this.readAnnualDecisionRuleList(field.editabilityRules, 'editableBy')
      .map((item: string) => normalizePmsRole(item))
      .filter(Boolean);
    const sectionEditableBy = this.readAnnualDecisionRuleList(section.editabilityRules, 'editableBy')
      .map((item: string) => normalizePmsRole(item))
      .filter(Boolean);
    if (![...fieldEditableBy, ...sectionEditableBy].includes(role as PmsRole)) {
      return false;
    }

    const editableStates = [
      ...this.readAnnualDecisionRuleList(field.editabilityRules, 'editableStates'),
      ...this.readAnnualDecisionRuleList(section.editabilityRules, 'editableStates'),
    ];
    return editableStates.length === 0 || editableStates.includes(workflowState);
  }

  private mapRawAnnualDecisionField(field: ITemplateField): ResolvedTemplateField {
    const requiredFor = this.readAnnualDecisionRuleList(field.validationRules, 'requiredFor');
    const role = normalizePmsRole(this.context.reqRole) ?? PmsRole.ADMIN;
    const behavior = (field.behaviors ?? []).find((item) =>
      normalizePmsRole(item.role) === role,
    );

    return {
      id: field.fieldKey,
      key: field.fieldKey,
      label: field.fieldLabel,
      type: String(field.fieldType).toLowerCase(),
      required: behavior?.mandatory ?? field.isRequired ?? requiredFor.includes(role),
      visible: true,
      editable: true,
      placeholder: field.placeholder,
      helpText: field.helpText,
      hideLabel: field.hideLabel,
      colSpan: field.colSpan,
      options: field.options ?? [],
      matrixConfig: field.matrixConfig,
      gridConfig: field.gridConfig,
      scoringIncluded: field.scoringConfig?.participatesInScoring === true || field.fieldCategory === 'SCORING',
      fieldCategory: field.fieldCategory,
      semanticRole: field.semanticRole,
      scoringConfig: field.scoringConfig,
      validationRules: field.validationRules,
      conditionalRendering: field.conditionalRendering,
    };
  }

  private readAnnualDecisionRuleList(
    rules: Record<string, unknown> | undefined,
    key: string,
  ): string[] {
    const rawValue = rules?.[key];
    if (Array.isArray(rawValue)) {
      return rawValue.map(String).filter(Boolean);
    }
    if (typeof rawValue === 'string') {
      return rawValue
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  private async sanitizeAnnualDecisionInputForTemplate(
    annualAssignment: IAnnualAssignment,
    input: SaveDecisionDraftInput,
    existingDecision?: IAnnualDecision | null,
  ): Promise<SaveDecisionDraftInput> {
    if (!existingDecision) {
      return input;
    }

    const resolvedTemplate = await this.resolveAnnualDecisionTemplate(annualAssignment, input);
    if (!resolvedTemplate) {
      return input;
    }

    const fieldMap = new Map(
      resolvedTemplate.sections
        .flatMap((section) => section.fields)
        .map((field) => [this.normalizeAnnualFieldKey(field.key), field]),
    );
    const isReadOnly = (aliases: string[]) =>
      aliases.some((alias) => fieldMap.get(this.normalizeAnnualFieldKey(alias))?.editable === false);

    const nextInput: SaveDecisionDraftInput = { ...input };

    if (isReadOnly(['final_rating', 'finalrating', 'rating', 'annual_overall_rating', 'annualoverallrating'])) {
      nextInput.finalRating = existingDecision.finalRating;
    }

    const existingGradeDetails = existingDecision.gradeDetails as Record<string, unknown> | undefined;
    if (isReadOnly(['grade_details', 'gradedetails'])) {
      nextInput.gradeDetails = existingGradeDetails;
    } else if (nextInput.gradeDetails) {
      nextInput.gradeDetails = {
        ...nextInput.gradeDetails,
        ...(isReadOnly(['grade', 'final_grade', 'finalgrade', 'grade_code', 'gradecode'])
          ? { grade: existingGradeDetails?.grade }
          : {}),
        ...(isReadOnly(['grade_notes', 'gradenotes', 'grade_note', 'gradenote'])
          ? { notes: existingGradeDetails?.notes }
          : {}),
      };
    }

    const existingMeritDetails = existingDecision.meritDetails as Record<string, unknown> | undefined;
    if (isReadOnly(['merit_details', 'meritdetails'])) {
      nextInput.meritDetails = existingMeritDetails;
    } else if (nextInput.meritDetails) {
      const preservedMeritPercentage =
        existingMeritDetails?.percentage ??
        existingMeritDetails?.meritPercentage ??
        existingMeritDetails?.amount;
      nextInput.meritDetails = {
        ...nextInput.meritDetails,
        ...(isReadOnly(['merit_amount', 'meritamount', 'merit_percentage', 'meritpercentage'])
          ? {
              percentage: preservedMeritPercentage,
              meritPercentage: preservedMeritPercentage,
            }
          : {}),
        ...(isReadOnly(['merit_notes', 'meritnotes', 'merit_note', 'meritnote'])
          ? { notes: existingMeritDetails?.notes }
          : {}),
      };
    }

    if (isReadOnly(['nil_reason', 'nilreason'])) {
      nextInput.nilReason = existingDecision.nilReason;
    }

    if (isReadOnly(['management_remarks', 'managementremarks', 'remarks', 'comments'])) {
      nextInput.managementRemarks = existingDecision.managementRemarks;
    }

    return nextInput;
  }

  private buildDecisionInputFromRecord(
    decision: IAnnualDecision,
    annualDecisionValues: IAnnualDecisionValue[],
  ): SaveDecisionDraftInput {
    return {
      isGradeApplied: Boolean(decision.isGradeApplied),
      isMeritApplied: Boolean(decision.isMeritApplied),
      gradeDetails:
        decision.gradeDetails && Object.keys(decision.gradeDetails).length > 0
          ? decision.gradeDetails
          : undefined,
      meritDetails:
        decision.meritDetails && Object.keys(decision.meritDetails).length > 0
          ? decision.meritDetails
          : undefined,
      nilReason: decision.nilReason,
      managementRemarks: decision.managementRemarks,
      finalScore: decision.finalScore,
      finalRating: decision.finalRating,
      decisionValues: annualDecisionValues
        .filter((value) => !isFinalReviewerOwnedDecisionValue(value))
        .map((value) => ({
          templateFieldId: value.templateFieldId,
          fieldKey: value.fieldKey,
          sectionKey: value.sectionKey,
          roleCode: value.roleCode,
          actorUserId: value.actorUserId?.toString(),
          valueJson: value.valueJson,
          valueText: value.valueText,
          valueNumber: value.valueNumber,
          valueDate: value.valueDate ? value.valueDate.toISOString() : undefined,
        })),
    };
  }

  private buildAnnualTemplateResolveValues(
    input: SaveDecisionDraftInput,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    const setAliases = (aliases: string[], value: unknown) => {
      for (const alias of aliases) {
        values[alias] = value;
      }
    };

    setAliases(
      ['final_score', 'finalscore', 'score'],
      input.finalScore === undefined || input.finalScore === null ? undefined : Number(input.finalScore),
    );
    setAliases(['final_rating', 'finalrating', 'rating'], input.finalRating?.trim() || '');
    setAliases(
      ['is_grade_applied', 'isgradeapplied', 'apply_grade_decision', 'applygradedecision'],
      Boolean(input.isGradeApplied),
    );
    setAliases(
      ['is_merit_applied', 'ismeritapplied', 'apply_merit_decision', 'applymeritdecision'],
      Boolean(input.isMeritApplied),
    );

    const gradeDetails = input.gradeDetails ?? {};
    setAliases(
      ['grade_details'],
      gradeDetails,
    );
    setAliases(
      ['grade', 'final_grade', 'finalgrade', 'grade_code', 'gradecode'],
      typeof gradeDetails.grade === 'string' ? gradeDetails.grade.trim() : '',
    );
    setAliases(
      ['grade_notes', 'gradenotes', 'grade_note'],
      typeof gradeDetails.notes === 'string' ? gradeDetails.notes.trim() : '',
    );

    const meritDetails = input.meritDetails ?? {};
    setAliases(
      ['merit_details'],
      meritDetails,
    );
    setAliases(
      ['merit_amount', 'meritamount', 'merit_percentage', 'meritpercentage'],
      meritDetails.percentage ??
        meritDetails.meritPercentage ??
        meritDetails.amount ??
        meritDetails.meritAmount ??
        '',
    );
    setAliases(
      ['merit_notes', 'meritnotes', 'merit_note'],
      typeof meritDetails.notes === 'string' ? meritDetails.notes.trim() : '',
    );

    setAliases(['nil_reason', 'nilreason'], input.nilReason?.trim() || '');
    setAliases(
      ['management_remarks', 'managementremarks', 'remarks', 'comments'],
      input.managementRemarks?.trim() || '',
    );

    for (const decisionValue of input.decisionValues ?? []) {
      if (!decisionValue.fieldKey?.trim()) {
        continue;
      }
      if (this.isFinalScoreFieldKey(decisionValue.fieldKey)) {
        continue;
      }

      values[decisionValue.fieldKey] = this.extractAnnualDecisionValue(decisionValue);
    }

    return values;
  }

  private mapTemplateObjectiveValues(values?: Array<Record<string, any>>) {
    return (values ?? []).map((value) => ({
      templateFieldId: value.templateFieldId,
      fieldKey: value.fieldKey,
      sectionKey: value.sectionKey,
      roleCode: value.roleCode,
      actorUserId: value.actorUserId?.toString?.() ?? value.actorUserId,
      workflowStage: value.workflowStage,
      valueJson: value.valueJson,
      valueText: value.valueText,
      valueNumber: value.valueNumber,
      valueDate: value.valueDate ? new Date(value.valueDate).toISOString() : undefined,
      valueStatus: value.valueStatus,
    }));
  }

  private extractAnnualDecisionValue(decisionValue: AnnualDecisionValueInput): unknown {
    if (decisionValue.valueJson !== undefined) return decisionValue.valueJson;
    if (decisionValue.valueNumber !== undefined && decisionValue.valueNumber !== null) {
      return Number(decisionValue.valueNumber);
    }
    if (decisionValue.valueDate) return decisionValue.valueDate;
    if (decisionValue.valueText !== undefined) return decisionValue.valueText;
    return undefined;
  }

  private hasMeaningfulAnnualTemplateFieldValue(
    fieldKey: string,
    fieldType: string,
    values: Record<string, unknown>,
  ): boolean {
    const value = values[fieldKey];
    if (fieldType === 'static_text' || fieldType === 'section_divider' || fieldType === 'formula') {
      return true;
    }

    if (fieldType === 'checkbox') {
      return value === true || value === false;
    }

    if (fieldType === 'checkbox_group' || fieldType === 'multiselect') {
      return Array.isArray(value) && value.length > 0;
    }

    if (fieldType === 'matrix' || fieldType === 'data_grid' || fieldType === 'date_range') {
      return Array.isArray(value)
        ? value.length > 0
        : typeof value === 'object' && value !== null && Object.keys(value as Record<string, unknown>).length > 0;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value);
    }

    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    return value !== undefined && value !== null;
  }

  private async persistAnnualDecisionValues(
    decision: IAnnualDecision,
    annualAssignment: IAnnualAssignment,
    input: SaveDecisionDraftInput,
  ): Promise<void> {
    const actor = this.requireActor();
    const actorUserId = new Types.ObjectId(actor.actorId);
    const baseValue = {
      annualDecisionId: decision._id,
      annualAssignmentId: annualAssignment._id,
      roleCode: 'ADMIN',
      actorUserId,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };

    const valuesToCreate = [
      ...(input.finalScore !== undefined && input.finalScore !== null
        ? [{
            ...baseValue,
            fieldKey: 'final_score',
            sectionKey: 'annual_decision',
            valueNumber: Number(input.finalScore),
          }]
        : []),
      ...(input.finalRating?.trim()
        ? [{
            ...baseValue,
            fieldKey: 'final_rating',
            sectionKey: 'annual_decision',
            valueText: input.finalRating.trim(),
          }]
        : []),
      {
        ...baseValue,
        fieldKey: 'is_grade_applied',
        sectionKey: 'annual_decision',
        valueJson: Boolean(input.isGradeApplied),
      },
      {
        ...baseValue,
        fieldKey: 'is_merit_applied',
        sectionKey: 'annual_decision',
        valueJson: Boolean(input.isMeritApplied),
      },
      ...(input.gradeDetails && Object.keys(input.gradeDetails).length > 0
        ? [{
            ...baseValue,
            fieldKey: 'grade_details',
            sectionKey: 'annual_decision',
            valueJson: input.gradeDetails,
          }]
        : []),
      ...(input.meritDetails && Object.keys(input.meritDetails).length > 0
        ? [{
            ...baseValue,
            fieldKey: 'merit_details',
            sectionKey: 'annual_decision',
            valueJson: input.meritDetails,
          }]
        : []),
      ...(input.nilReason?.trim()
        ? [{
            ...baseValue,
            fieldKey: 'nil_reason',
            sectionKey: 'annual_decision',
            valueText: input.nilReason.trim(),
          }]
        : []),
      ...(input.managementRemarks?.trim()
        ? [{
            ...baseValue,
            fieldKey: 'management_remarks',
            sectionKey: 'annual_decision',
            valueText: input.managementRemarks.trim(),
          }]
        : []),
      ...this.normalizeExplicitDecisionValues(input.decisionValues ?? [], actorUserId, baseValue),
      ...await this.getPreservedReadOnlyAnnualDecisionValues(decision, annualAssignment, input),
    ];

    await AnnualDecisionValue.deleteMany({ annualDecisionId: decision._id });
    if (valuesToCreate.length > 0) {
      await AnnualDecisionValue.insertMany(valuesToCreate);
    }
  }

  private normalizeExplicitDecisionValues(
    decisionValues: AnnualDecisionValueInput[],
    defaultActorUserId: Types.ObjectId,
    baseValue: Record<string, unknown>,
  ) {
    return decisionValues
      .filter((decisionValue) => decisionValue.fieldKey?.trim() && decisionValue.sectionKey?.trim())
      .filter((decisionValue) => !this.isFinalScoreFieldKey(decisionValue.fieldKey))
      .filter((decisionValue) => !isFinalReviewerOwnedDecisionValue(decisionValue))
      .map((decisionValue) => ({
        ...baseValue,
        templateFieldId: decisionValue.templateFieldId,
        fieldKey: decisionValue.fieldKey,
        sectionKey: decisionValue.sectionKey,
        roleCode: decisionValue.roleCode ?? 'ADMIN',
        actorUserId:
          decisionValue.actorUserId && Types.ObjectId.isValid(decisionValue.actorUserId)
            ? new Types.ObjectId(decisionValue.actorUserId)
            : defaultActorUserId,
        valueJson: decisionValue.valueJson,
        valueText: decisionValue.valueText,
        valueNumber: decisionValue.valueNumber,
        valueDate: decisionValue.valueDate ? new Date(decisionValue.valueDate) : undefined,
      }));
  }

  private async getPreservedReadOnlyAnnualDecisionValues(
    decision: IAnnualDecision,
    annualAssignment: IAnnualAssignment,
    input: SaveDecisionDraftInput,
  ): Promise<Array<Record<string, unknown>>> {
    const resolvedTemplate = await this.resolveAnnualDecisionTemplate(annualAssignment, input);
    if (!resolvedTemplate) {
      return [];
    }

    const resolvedFieldMap = new Map(
      resolvedTemplate.sections.flatMap((section) => section.fields).map((field) => [field.key, field]),
    );
    const nextKeys = new Set(
      (input.decisionValues ?? []).map((value) => `${value.sectionKey}::${value.fieldKey}`),
    );
    const existingValues = await AnnualDecisionValue.find({
      annualDecisionId: decision._id,
      isDeleted: false,
    }).lean();

    return existingValues
      .filter((value) => {
        if (!value.fieldKey || !value.sectionKey || this.isFinalScoreFieldKey(value.fieldKey)) return false;
        // L2/L3 reviewer values are a separate ownership boundary. Preserve
        // them exactly even when the Admin form posts the same field keys.
        if (isFinalReviewerOwnedDecisionValue(value)) return true;
        const resolvedField = resolvedFieldMap.get(value.fieldKey);
        if (resolvedField?.editable === true) return false;
        return !nextKeys.has(`${value.sectionKey}::${value.fieldKey}`);
      })
      .map((value) => {
        const { _id, createdAt, updatedAt, __v, ...preservedValue } = value as Record<string, unknown>;
        return preservedValue;
      });
  }

  private async syncAnnualFinalScoreValue(
    decision: IAnnualDecision,
    annualAssignment: IAnnualAssignment,
    finalScore: number,
  ): Promise<void> {
    const actor = this.requireActor();
    const actorUserId = new Types.ObjectId(actor.actorId);
    await AnnualDecisionValue.deleteMany({
      annualDecisionId: decision._id,
      fieldKey: { $in: ['final_score', 'finalscore', 'score'] },
    });
    await AnnualDecisionValue.create({
      annualDecisionId: decision._id,
      annualAssignmentId: annualAssignment._id,
      fieldKey: 'final_score',
      sectionKey: 'annual_decision',
      roleCode: 'ADMIN',
      actorUserId,
      valueNumber: finalScore,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
  }

  private async syncAnnualFinalRatingValue(
    decision: IAnnualDecision,
    annualAssignment: IAnnualAssignment,
    finalRating: string,
  ): Promise<void> {
    const actor = this.requireActor();
    const actorUserId = new Types.ObjectId(actor.actorId);
    await AnnualDecisionValue.deleteMany({
      annualDecisionId: decision._id,
      fieldKey: { $in: ['final_rating', 'finalrating', 'annual_overall_rating', 'annualoverallrating', 'rating'] },
    });
    await AnnualDecisionValue.create({
      annualDecisionId: decision._id,
      annualAssignmentId: annualAssignment._id,
      fieldKey: 'final_rating',
      sectionKey: 'annual_decision',
      roleCode: 'ADMIN',
      actorUserId,
      valueText: finalRating,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
  }

  private isFinalScoreFieldKey(fieldKey: string): boolean {
    return ['finalscore', 'score'].includes(this.normalizeAnnualFieldKey(fieldKey));
  }

  private isMeritRecommendationFieldKey(fieldKey: string): boolean {
    return ['meritrecommendation', 'recommendation'].includes(this.normalizeAnnualFieldKey(fieldKey));
  }

  private isStandardAnnualDecisionFieldKey(fieldKey: string): boolean {
    return new Set([
      'finalrating',
      'annualoverallrating',
      'rating',
      'isgradeapplied',
      'applygradedecision',
      'ismeritapplied',
      'applymeritdecision',
      'gradedetails',
      'grade',
      'finalgrade',
      'gradecode',
      'gradenotes',
      'gradenote',
      'meritdetails',
      'meritamount',
      'meritpercentage',
      'meritnotes',
      'meritnote',
      'meritrecommendation',
      'recommendation',
      'nilreason',
      'managementremarks',
      'remarks',
      'comments',
    ]).has(this.normalizeAnnualFieldKey(fieldKey));
  }

  private normalizeAnnualFieldKey(fieldKey: string): string {
    return String(fieldKey || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private hasMeaningfulDecisionDetails(value?: Record<string, unknown>): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }

    return Object.values(value).some((entry) => {
      if (typeof entry === 'string') {
        return entry.trim().length > 0;
      }

      return entry !== undefined && entry !== null;
    });
  }

  private async assertAllQuartersComplete(annualAssignmentId: Types.ObjectId): Promise<void> {
    const annualAssignment = await AnnualAssignment.findById(annualAssignmentId);
    if (!annualAssignment) {
      throw new Error('Annual assignment not found');
    }

    const termAssignments = await TermAssignment.find({
      annualAssignmentId,
      assessmentTermCode: { $in: annualAssignment.applicableTerms },
    });
    if (termAssignments.length === 0) {
      throw new Error('No term assignments found for annual assignment');
    }

    const incompleteTerm = termAssignments.find(
      (termAssignment) => !isTermFinalized(termAssignment.termState),
    );

    if (incompleteTerm) {
      throw new Error('Annual decision is blocked until all applicable terms are finalized or closed');
    }
  }

  private async assertAppraisalWindowOpen(annualAssignment: IAnnualAssignment): Promise<void> {
    const cycle = await AnnualCycle.findById(annualAssignment.cycleId);
    if (!cycle || cycle.isDeleted) {
      throw new Error('Annual cycle not found for annual decision');
    }

    const config = this.normalizeAppraisalWindowConfig(cycle.appraisalWindowConfig);
    if (!config || Object.keys(config).length === 0) {
      if (
        cycle.status === AnnualWorkflowState.APPRAISAL_WINDOW_OPEN ||
        cycle.status === AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT ||
        cycle.status === AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED ||
        cycle.status === AnnualWorkflowState.ANNUAL_FINALIZED ||
        cycle.status === AnnualWorkflowState.VISIBILITY_ENABLED ||
        cycle.status === AnnualWorkflowState.COMMUNICATION_READY ||
        cycle.status === AnnualWorkflowState.COMMUNICATION_SENT
      ) {
        return;
      }

      throw new Error('Annual appraisal window is not open for this cycle');
    }

    const allQuartersCompletedAt = await this.getAllQuartersCompletedAt(annualAssignment);
    if (!allQuartersCompletedAt) {
      throw new Error('Annual appraisal window is blocked until all applicable terms are finalized or closed');
    }

    const relativeBaseDate = await this.resolveRelativeAppraisalBaseDate(
      cycle,
      config,
      allQuartersCompletedAt,
    );
    const now = this.getCurrentDate();
    if (!this.isWithinAppraisalWindow(config, relativeBaseDate, now)) {
      throw new Error('Annual appraisal window is closed for this cycle');
    }
  }

  private async getAppraisalWindowStatus(
    annualAssignment: IAnnualAssignment,
    cycleOverride?: IAnnualCycle | null,
  ): Promise<{ isOpen: boolean }> {
    const cycle =
      cycleOverride ??
      await AnnualCycle.findById(annualAssignment.cycleId).lean();

    if (!cycle || cycle.isDeleted) {
      return { isOpen: false };
    }

    const config = this.normalizeAppraisalWindowConfig(cycle.appraisalWindowConfig);
    if (!config || Object.keys(config).length === 0) {
      return {
        isOpen:
          cycle.status === AnnualWorkflowState.APPRAISAL_WINDOW_OPEN ||
          cycle.status === AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT ||
          cycle.status === AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED ||
          cycle.status === AnnualWorkflowState.ANNUAL_FINALIZED ||
          cycle.status === AnnualWorkflowState.VISIBILITY_ENABLED ||
          cycle.status === AnnualWorkflowState.COMMUNICATION_READY ||
          cycle.status === AnnualWorkflowState.COMMUNICATION_SENT,
      };
    }

    const allQuartersCompletedAt = await this.getAllQuartersCompletedAt(annualAssignment);
    if (!allQuartersCompletedAt) {
      return { isOpen: false };
    }

    const relativeBaseDate = await this.resolveRelativeAppraisalBaseDate(
      cycle,
      config,
      allQuartersCompletedAt,
    );

    return {
      isOpen: this.isWithinAppraisalWindow(config, relativeBaseDate, this.getCurrentDate()),
    };
  }

  private normalizeAppraisalWindowConfig(
    config: Record<string, unknown> | undefined,
  ): AppraisalWindowConfigInput {
    if (!config || Object.keys(config).length === 0) {
      return {};
    }

    const appraisalWindowConfig = config as AppraisalWindowConfigInput;

    if (appraisalWindowConfig.type === 'FIXED_DATE' && !appraisalWindowConfig.startDate) {
      return {
        ...appraisalWindowConfig,
        startDate: appraisalWindowConfig.date,
        endDate: appraisalWindowConfig.date,
      };
    }

    return appraisalWindowConfig;
  }

  private async getAllQuartersCompletedAt(
    annualAssignment: IAnnualAssignment,
  ): Promise<Date | null> {
    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      assessmentTermCode: { $in: annualAssignment.applicableTerms },
      isDeleted: false,
    });

    if (termAssignments.length === 0) {
      return null;
    }

    let completedAt = new Date(0);
    for (const termAssignment of termAssignments) {
      if (!isTermFinalized(termAssignment.termState)) {
        return null;
      }

      const transitionDate =
        (termAssignment as ITermAssignment & { lastTransitionAt?: Date }).lastTransitionAt ??
        termAssignment.updatedAt;
      if (transitionDate && transitionDate > completedAt) {
        completedAt = transitionDate;
      }
    }

    return completedAt.getTime() > 0 ? completedAt : new Date();
  }

  private async resolveRelativeAppraisalBaseDate(
    cycle: IAnnualCycle,
    config: AppraisalWindowConfigInput,
    allQuartersCompletedAt: Date,
  ): Promise<Date | string> {
    if (config.type !== 'RELATIVE_OFFSET') {
      return allQuartersCompletedAt;
    }

    if (config.base === 'ANNUAL_CYCLE_END') {
      return cycle.endDate;
    }

    if (config.base === 'Q4_FINALIZATION') {
      return await this.getFinalizationWindowEndDate(cycle) ?? allQuartersCompletedAt;
    }

    return allQuartersCompletedAt;
  }

  private async getFinalizationWindowEndDate(
    cycle: IAnnualCycle,
  ): Promise<Date | string | null> {
    const finalTermCode = this.getFinalizationTermCode(cycle);
    const termCycle = await TermCycle.findOne({
      cycleId: cycle._id,
      assessmentTermCode: finalTermCode,
      isDeleted: false,
    })
      .select('termFinalizationWindow closureRules')
      .lean();

    if (!termCycle) {
      return null;
    }

    const closureRules = termCycle.closureRules as Record<string, unknown> | undefined;

    return (
      this.getWindowEndDate(termCycle.termFinalizationWindow) ??
      this.getWindowEndDate(closureRules?.termFinalizationWindow) ??
      this.getWindowEndDate(closureRules?.finalizationWindow) ??
      null
    );
  }

  private getFinalizationTermCode(cycle: IAnnualCycle): string {
    const terms = getAssessmentTerms(cycle.assessmentTermType ?? getDefaultAssessmentTermType());
    return terms[terms.length - 1] ?? 'Q4';
  }

  private getWindowEndDate(window: unknown): Date | string | undefined {
    if (!window || typeof window !== 'object') {
      return undefined;
    }

    return (window as { endDate?: Date | string }).endDate;
  }

  private isWithinAppraisalWindow(
    config: AppraisalWindowConfigInput,
    relativeBaseDate: Date | string,
    now: Date,
  ): boolean {
    if (config.type === 'FIXED_DATE') {
      const start = this.normalizeStartDate(config.startDate ?? config.date);
      const end = this.normalizeEndDate(config.endDate ?? config.date);
      return Boolean(start && end && now >= start && now <= end);
    }

    if (config.type === 'FIXED_RANGE') {
      const start = this.normalizeStartDate(config.startDate);
      const end = this.normalizeEndDate(config.endDate);
      return Boolean(start && end && now >= start && now <= end);
    }

    if (config.type !== 'RELATIVE_OFFSET') {
      return false;
    }

    const start = this.normalizeStartDate(relativeBaseDate);
    if (!start) {
      return false;
    }

    start.setDate(start.getDate() + (config.offsetDays ?? 0));
    const durationDays = config.durationDays ?? 1;
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(durationDays - 1, 0));
    end.setHours(23, 59, 59, 999);

    return now >= start && now <= end;
  }

  private normalizeStartDate(value?: Date | string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private normalizeEndDate(value?: Date | string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private maskDecision(
    decision: IAnnualDecision,
    visibility: {
      employeeGradeVisible: boolean;
      employeeMeritVisible: boolean;
      managerGradeVisible: boolean;
      managerMeritVisible: boolean;
      visibleFrom?: Date | string;
    },
  ): Record<string, unknown> {
    const effectiveVisibility = this.getEffectiveVisibilityFlags(visibility);
    return visibilityMaskService.maskGradeMeritFields(
      decision.toObject() as Record<string, unknown>,
      {
        actorRole: this.requireActor().actorRole,
        employeeGradeVisible: effectiveVisibility.employeeGradeVisible,
        employeeMeritVisible: effectiveVisibility.employeeMeritVisible,
        managerGradeVisible: effectiveVisibility.managerGradeVisible,
        managerMeritVisible: effectiveVisibility.managerMeritVisible,
      },
    );
  }

  private maskCorrectionHistory(
    correctionHistory: Array<Record<string, unknown>>,
    visibility: {
      employeeReviewVisible: boolean;
      employeeGradeVisible: boolean;
      employeeMeritVisible: boolean;
      managerGradeVisible: boolean;
      managerMeritVisible: boolean;
      visibleFrom?: Date | string;
    },
  ): Array<Record<string, unknown>> {
    const permissions = this.getHistoryVisibilityPermissions(visibility);

    return correctionHistory.map((entry) => ({
      ...entry,
      originalValue: this.maskHistoryValue(entry.originalValue, permissions),
      correctedValue: this.maskHistoryValue(entry.correctedValue, permissions),
    }));
  }

  private buildFinalScoreOverrideSummary(
    correctionEntry: Record<string, unknown>,
    visibility: {
      employeeReviewVisible: boolean;
      employeeGradeVisible: boolean;
      employeeMeritVisible: boolean;
      managerGradeVisible: boolean;
      managerMeritVisible: boolean;
      visibleFrom?: Date | string;
    },
  ): Record<string, unknown> | null {
    const permissions = this.getHistoryVisibilityPermissions(visibility);
    const originalValue = this.maskHistoryValue(correctionEntry.originalValue, permissions);
    const correctedValue = this.maskHistoryValue(correctionEntry.correctedValue, permissions);
    if (!originalValue && !correctedValue) {
      return null;
    }

    return {
      _id: correctionEntry._id,
      fieldKey: correctionEntry.fieldKey,
      originalValue,
      correctedValue,
      correctionReason: correctionEntry.correctionReason,
      correctedBy: correctionEntry.correctedBy,
      correctedAt: correctionEntry.correctedAt,
    };
  }

  private maskPreReopenSnapshots(
    snapshots: Array<Record<string, unknown>>,
    visibility: {
      employeeReviewVisible: boolean;
      employeeGradeVisible: boolean;
      employeeMeritVisible: boolean;
      managerGradeVisible: boolean;
      managerMeritVisible: boolean;
      visibleFrom?: Date | string;
    },
  ): Array<Record<string, unknown>> {
    const permissions = this.getHistoryVisibilityPermissions(visibility);
    const actorRole = normalizePmsRole(this.requireActor().actorRole);
    const canSeeStoredAdminObjectiveMatrix = actorRole === PmsRole.ADMIN;

    return snapshots.map((snapshot) => {
      const maskedFinalDecisionSnapshot = this.maskHistoryValue(
        snapshot.finalDecisionSnapshot,
        permissions,
      );
      const maskedByRole =
        maskedFinalDecisionSnapshot && typeof maskedFinalDecisionSnapshot === 'object'
          ? { ...(maskedFinalDecisionSnapshot as Record<string, unknown>) }
          : maskedFinalDecisionSnapshot;

      // Freeze history intentionally stores the complete admin matrix. Never return that
      // embedded copy to a non-admin actor; their separately loaded objectiveMatrix is
      // server-masked for the current role and remains the only matrix they can inspect.
      const finalDecisionSnapshot = maskStoredObjectiveMatrixSnapshot(
        maskedByRole,
        canSeeStoredAdminObjectiveMatrix,
      );

      return {
        ...snapshot,
        annualSnapshot: this.maskHistoryValue(snapshot.annualSnapshot, permissions),
        termSnapshots: this.maskHistoryValue(snapshot.termSnapshots, permissions),
        finalDecisionSnapshot,
        visibilitySnapshot: this.maskHistoryValue(snapshot.visibilitySnapshot, permissions),
        communicationSnapshot: this.maskHistoryValue(snapshot.communicationSnapshot, permissions),
      };
    });
  }

  private getHistoryVisibilityPermissions(visibility: {
    employeeReviewVisible: boolean;
    employeeGradeVisible: boolean;
    employeeMeritVisible: boolean;
    managerGradeVisible: boolean;
    managerMeritVisible: boolean;
    visibleFrom?: Date | string;
  }) {
    const actor = this.requireActor();
    const actorRole = normalizePmsRole(actor.actorRole);
    const effectiveVisibility = this.getEffectiveVisibilityFlags(visibility);

    if (
      actorRole === PmsRole.ADMIN ||
      actorRole === PmsRole.DIRECTOR ||
      actorRole === PmsRole.MANAGEMENT ||
      actor.actorScope === 'EXECUTIVE' ||
      actor.actorScope === 'ALL'
    ) {
      return {
        canSeeGrade: true,
        canSeeMerit: true,
        canSeeReview: true,
      };
    }

    if (actorRole === PmsRole.MANAGER) {
      return {
        canSeeGrade: effectiveVisibility.managerGradeVisible,
        canSeeMerit: effectiveVisibility.managerMeritVisible,
        canSeeReview: true,
      };
    }

    return {
      canSeeGrade: effectiveVisibility.employeeGradeVisible,
      canSeeMerit: effectiveVisibility.employeeMeritVisible,
      canSeeReview: effectiveVisibility.employeeReviewVisible === true,
    };
  }

  private maskHistoryValue(
    value: unknown,
    permissions: {
      canSeeGrade: boolean;
      canSeeMerit: boolean;
      canSeeReview: boolean;
    },
  ): unknown {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.maskHistoryValue(item, permissions))
        .filter((item) => item !== undefined);
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const gradeKeys = new Set([
      'grade',
      'gradedetails',
      'finalrating',
      'finalscore',
      'systemfinalscore',
      'previouseffectivefinalscore',
      'overriddenfinalscore',
      'effectivefinalscore',
      'appraisaloutcometype',
      'isgradeapplied',
      'finalgrade',
      'gradevalue',
      'gradescale',
      'gradeeffectivedate',
      'graderemarks',
      'gradeapprovedby',
      'gradeapproveddate',
    ]);
    const meritKeys = new Set([
      'merit',
      'meritdetails',
      'ismeritapplied',
      'merittype',
      'meritamount',
      'meritpercentage',
      'meriteffectivedate',
      'payrolleffectivedate',
      'meritremarks',
      'meritapprovedby',
      'meritapproveddate',
      'nilreason',
    ]);
    const reviewKeys = new Set([
      'comments',
      'ratings',
      'score',
      'overallscore',
      'overallrating',
      'achievements',
      'developmentobservations',
      'recommendation',
      'finalquarterremarks',
      'quarterscore',
      'quarterrating',
      'quartersummary',
      'reviewstatus',
    ]);

    const redacted: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.replace(/[_\s-]/g, '').toLowerCase();

      if (!permissions.canSeeGrade && gradeKeys.has(normalizedKey)) {
        continue;
      }

      if (!permissions.canSeeMerit && meritKeys.has(normalizedKey)) {
        continue;
      }

      if (!permissions.canSeeReview && reviewKeys.has(normalizedKey)) {
        continue;
      }

      const nextValue = this.maskHistoryValue(nestedValue, permissions);
      if (nextValue !== undefined) {
        redacted[key] = nextValue;
      }
    }

    return Object.keys(redacted).length > 0 ? redacted : undefined;
  }

  private getEffectiveVisibilityFlags(visibility: {
    employeeReviewVisible?: boolean;
    employeeGradeVisible: boolean;
    employeeMeritVisible: boolean;
    managerGradeVisible: boolean;
    managerMeritVisible: boolean;
    visibleFrom?: Date | string;
  }) {
    const actorRole = normalizePmsRole(this.requireActor().actorRole);
    if (
      actorRole === PmsRole.ADMIN ||
      actorRole === PmsRole.DIRECTOR ||
      actorRole === PmsRole.MANAGEMENT
    ) {
      return visibility;
    }

    const visibleFrom = visibility.visibleFrom ? new Date(visibility.visibleFrom) : null;
    if (!visibleFrom || Number.isNaN(visibleFrom.getTime()) || this.getCurrentDate() < visibleFrom) {
      return {
        ...visibility,
        employeeReviewVisible: false,
        employeeGradeVisible: false,
        employeeMeritVisible: false,
        managerGradeVisible: false,
        managerMeritVisible: false,
      };
    }

    return visibility;
  }

  private async ensureVisibilityConfiguration(
    annualAssignment: IAnnualAssignment,
  ) {
    const existing = await VisibilityConfiguration.findOne({
      annualAssignmentId: annualAssignment._id,
    });

    if (existing) {
      return existing;
    }

    return VisibilityConfiguration.create({
      annualAssignmentId: annualAssignment._id,
      cycleId: annualAssignment.cycleId,
      employeeId: annualAssignment.employeeId,
      employeeReviewVisible: annualAssignment.visibility.employeeReviewVisible,
      employeeGradeVisible: annualAssignment.visibility.employeeGradeVisible,
      employeeMeritVisible: annualAssignment.visibility.employeeMeritVisible,
      managerGradeVisible: annualAssignment.visibility.managerGradeVisible,
      managerMeritVisible: annualAssignment.visibility.managerMeritVisible,
      createdBy: this.actorIdObject(),
    });
  }

  private async applyScopedAssignmentFilter(filter: Record<string, unknown>): Promise<void> {
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

    if (mappedRole === PmsRole.DIRECTOR || mappedRole === PmsRole.MANAGEMENT || actor.actorScope === 'EXECUTIVE' || actor.actorScope === 'ALL') {
      return;
    }

    throw new Error('PMS access denied');
  }

  private async assertDecisionReadAccess(
    action: string,
    annualAssignment: IAnnualAssignment,
  ): Promise<void> {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);

    if (mappedRole === PmsRole.ADMIN) {
      return;
    }

    if (
      annualAssignment.finalReviewerId?.toString() === actor.actorId ||
      annualAssignment.directorReviewerId?.toString() === actor.actorId
    ) {
      return;
    }

    if (mappedRole === PmsRole.DIRECTOR || mappedRole === PmsRole.MANAGEMENT || actor.actorScope === 'EXECUTIVE' || actor.actorScope === 'ALL') {
      return;
    }

    if (
      mappedRole === PmsRole.MANAGER &&
      annualAssignment.assignedManagerId?.toString() === actor.actorId
    ) {
      return;
    }

    if (await this.hasActivePmsWorkDelegationForAssignment(actor.actorId, annualAssignment)) {
      return;
    }

    throw new Error(`Access denied for ${action}`);
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

  private assertDecisionAdmin(action: string): void {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);

    if (mappedRole === PmsRole.ADMIN) {
      return;
    }

    throw new Error(`Access denied for ${action}`);
  }

  private assertAssignedL3DecisionOwner(
    annualAssignment: IAnnualAssignment,
    action: string,
  ): void {
    const actor = this.requireActor();
    if (annualAssignment.directorReviewerId?.toString() === actor.actorId) {
      return;
    }

    throw new Error(`Access denied for ${action}: only the assigned L3 reviewer can perform this action`);
  }

  private async getOrCreateFinalReviewDecisionShell(
    annualAssignment: IAnnualAssignment,
  ): Promise<IAnnualDecision> {
    const existing = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    });
    if (existing) return existing;

    return AnnualDecision.create({
      annualAssignmentId: annualAssignment._id,
      cycleId: annualAssignment.cycleId,
      employeeId: annualAssignment.employeeId,
      decisionStatus: AnnualDecisionStatus.DRAFT,
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });
  }

  private resolveActorFinalReviewStage(
    annualAssignment: IAnnualAssignment,
    requireEditable = true,
  ): FinalReviewStage | undefined {
    const actor = this.requireActor();
    const editable = [FinalReviewStatus.PENDING, FinalReviewStatus.IN_PROGRESS];
    const isL2 = annualAssignment.finalReviewerId?.toString() === actor.actorId;
    const isDirector = annualAssignment.directorReviewerId?.toString() === actor.actorId;

    if (isL2 && editable.includes(annualAssignment.finalReviewStatus as any)) {
      return 'L2';
    }
    if (
      isDirector &&
      (!requireEditable || annualAssignment.finalReviewStatus === FinalReviewStatus.COMPLETED) &&
      (!requireEditable || editable.includes(annualAssignment.directorReviewStatus as any))
    ) {
      return 'DIRECTOR';
    }
    if (!requireEditable && isL2) return 'L2';
    return undefined;
  }

  private async assertFinalReviewerAccess(
    annualAssignmentId: string,
  ): Promise<{ annualAssignment: IAnnualAssignment; reviewStage: FinalReviewStage }> {
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    await this.assertAllQuartersComplete(annualAssignment._id);
    const reviewStage = this.resolveActorFinalReviewStage(annualAssignment);
    if (!reviewStage) {
      const actor = this.requireActor();
      const waitingForL2 =
        annualAssignment.directorReviewerId?.toString() === actor.actorId &&
        annualAssignment.finalReviewStatus !== FinalReviewStatus.COMPLETED;
      throw new Error(
        waitingForL2
          ? 'L3 Assessment is available only after the L2 Assessment is completed'
          : 'Access denied: this Final Review stage is not assigned to you or is not editable',
      );
    }
    return { annualAssignment, reviewStage };
  }

  private async finalReviewTemplateFields(
    annualAssignment: IAnnualAssignment,
  ): Promise<Array<Record<string, any>>> {
    if (!annualAssignment.templateVersionId) throw new Error('Locked template version is required');
    const template = await PmsTemplateVersion.findById(annualAssignment.templateVersionId)
      .select('sections')
      .lean();
    const sections = (template?.sections ?? []).filter(
      (section: any) => section.metadata?.finalReviewSection === true,
    );
    if (sections.length !== 1) throw new Error('Exactly one Final Reviewer Assessment section is required');
    const section: any = sections[0];
    return (section.fields ?? []).map((field: any) => ({
      ...field,
      key: field.key ?? field.fieldKey,
      label: field.label ?? field.fieldLabel,
      type: field.type ?? field.fieldType,
      required:
        field.required === true ||
        field.isRequired === true ||
        field.mandatory === true,
      sectionKey: section.key ?? section.sectionKey,
      reviewStage:
        String(field.metadata?.finalReviewStage ?? '').toUpperCase() === 'L2' ||
        String(field.key ?? field.fieldKey).toLowerCase() === 'ed_svp_assessment'
          ? 'L2'
          : 'DIRECTOR',
    }));
  }

  private async getAnnualAssignment(annualAssignmentId: string): Promise<IAnnualAssignment> {
    if (!Types.ObjectId.isValid(annualAssignmentId)) {
      throw new Error('Invalid annual assignment id');
    }

    const annualAssignment = await AnnualAssignment.findById(annualAssignmentId);
    if (!annualAssignment) {
      throw new Error('Annual assignment not found');
    }

    return annualAssignment;
  }

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Invalid ${fieldName}`);
    }

    return new Types.ObjectId(value);
  }

  private requireActor() {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    return {
      actorId: user._id.toString(),
      actorRole: user.role,
      actorScope: user.scope,
    };
  }

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
    reason?: string,
  ): Promise<void> {
    const actor = this.requireActor();
    const assignmentId = await this.resolveAuditAssignmentId(entityType, entityId);

    await auditService.createAuditLog({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action,
      entityType,
      entityId,
      assignmentId,
      previousValue,
      newValue,
      reason,
    });
  }

  private async resolveAuditAssignmentId(entityType: string, entityId: string): Promise<string | undefined> {
    if (entityType === 'ANNUAL_ASSIGNMENT') {
      return entityId;
    }

    if (entityType === 'ANNUAL_DECISION') {
      const decision = await AnnualDecision.findById(entityId)
        .select('annualAssignmentId')
        .lean();
      return decision?.annualAssignmentId?.toString();
    }

    if (entityType === 'VISIBILITY_CONFIGURATION') {
      const visibilityConfig = await VisibilityConfiguration.findById(entityId)
        .select('annualAssignmentId')
        .lean();
      return visibilityConfig?.annualAssignmentId?.toString();
    }

    return undefined;
  }
}
