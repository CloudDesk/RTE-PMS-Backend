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
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
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
        availableActions: readiness.availableActions,
        lockedReason: readiness.lockedReason,
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
    const objectiveMatrix = await this.loadObjectiveMatrixIfEnabled(annualAssignment);
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
    const actorMatrixMode = this.objectiveMatrixModeForActor();

    return {
      annualAssignment: {
        ...annualAssignment.toObject(),
        annualState: effectiveAnnualState,
        finalDecisionStatus,
        isAppraisalWindowOpen: readiness.isAppraisalWindowOpen,
        termProgress: readiness.termProgress,
        availableActions: readiness.availableActions,
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
      annualDecisionValues: annualDecisionValues.map((value) => ({
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
    };
  }

  async saveDecisionDraft(
    annualAssignmentId: string,
    input: SaveDecisionDraftInput,
  ): Promise<IAnnualDecision> {
    this.assertDecisionAdmin('annualDecision.draft');
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    const existingDecision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
    });
    if (existingDecision?.frozenAt || existingDecision?.decisionStatus === AnnualDecisionStatus.FROZEN) {
      throw new Error('Frozen annual decision cannot be edited');
    }

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

    annualAssignment.annualState = AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.DRAFT;
    annualAssignment.version += 1;
    await annualAssignment.save();

    await this.audit(
      'PMS_ANNUAL_DECISION_DRAFT_SAVED',
      'ANNUAL_DECISION',
      decision._id.toString(),
      existingDecision?.toObject(),
      decision.toObject(),
    );

    return decision;
  }

  async submitDecision(annualAssignmentId: string): Promise<IAnnualDecision> {
    this.assertDecisionAdmin('annualDecision.submit');
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
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
    this.assertDecisionAdmin('annualDecision.freeze');
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);

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
    await this.assertAnnualDecisionGate(
      annualAssignment,
      'FREEZE',
      decision.decisionStatus,
    );
    if (!annualAssignment.templateVersionId) {
      throw new Error('Locked template version is required before freezing annual decision');
    }
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
    this.assertDecisionAdmin('annualDecision.reopen');
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Reopen reason is required');
    }

    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
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
    this.assertDecisionAdmin('annualDecision.finalScore.override');
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Final score override reason is required');
    }

    const overrideScore = Number(input.overrideScore);
    if (!Number.isFinite(overrideScore) || overrideScore < 0 || overrideScore > 100) {
      throw new Error('Final score override must be a number from 0 to 100');
    }

    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
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
    this.assertDecisionAdmin('annualDecision.finalRating.override');
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Final rating override reason is required');
    }
    const overrideRating = await this.validateManagerOverallRating(
      input.overrideRating,
      true,
    );

    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
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
    this.assertDecisionAdmin('annualDecision.visibility');
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
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
    annualAssignment: Pick<IAnnualAssignment, '_id' | 'cycleId' | 'applicableTerms' | 'annualState'>,
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
      lockedReason: this.resolveAnnualDecisionLockedReason({
        annualState,
        finalDecisionStatus,
        allTermsFinalized,
        isAppraisalWindowOpen: appraisalWindowStatus.isOpen,
        availableActions,
      }),
    };
  }

  private resolveAvailableActions(input: {
    annualState: string;
    finalDecisionStatus: string;
    allTermsFinalized: boolean;
    isAppraisalWindowOpen: boolean;
  }): AnnualDecisionAction[] {
    const {
      annualState,
      finalDecisionStatus,
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
      return ['FREEZE'];
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

    return ['SAVE_DRAFT', 'SUBMIT'];
  }

  private resolveAnnualDecisionLockedReason(input: {
    annualState: string;
    finalDecisionStatus: string;
    allTermsFinalized: boolean;
    isAppraisalWindowOpen: boolean;
    availableActions: AnnualDecisionAction[];
  }): string | undefined {
    const {
      annualState,
      finalDecisionStatus,
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

    const role = normalizePmsRole(this.context.reqRole) ?? PmsRole.ADMIN;
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
    const role = normalizePmsRole(this.context.reqRole) ?? PmsRole.ADMIN;
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
        fieldMap.has(decisionValue.fieldKey) ||
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
    const role = normalizePmsRole(this.context.reqRole) ?? PmsRole.ADMIN;
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
      if (!field || !this.isRawAnnualDecisionFieldEditable(field, section, role, fieldWorkflowState)) {
        return null;
      }

      return this.mapRawAnnualDecisionField(field);
    }

    return null;
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
    if (
      annualAssignment.finalDecisionStatus === AnnualDecisionStatus.DRAFT &&
      (
        annualAssignment.annualState === AnnualWorkflowState.ALL_TERMS_FINALIZED ||
        annualAssignment.annualState === AnnualWorkflowState.APPRAISAL_WINDOW_OPEN
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
      decisionValues: annualDecisionValues.map((value) => ({
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
