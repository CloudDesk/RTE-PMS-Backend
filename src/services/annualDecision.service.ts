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
  normalizePmsRole,
  PmsRole,
  QuarterWorkflowState,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { AnnualDecisionValue } from '../models/pms-annual-decision-value.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { PerformanceHistorySnapshot } from '../models/pms-performance-history-snapshot.model';
import { VisibilityConfiguration } from '../models/pms-visibility-configuration.model';
import { Objective } from '../models/pms-objective.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import { QuarterReview } from '../models/pms-quarter-review.model';
import { auditService } from './audit.service';
import { visibilityMaskService } from './visibilityMask.service';
import {
  PmsTemplateService,
  type ResolvedTemplateVersion,
} from './pms-template.service';
import { PmsScoringService } from './pms-scoring.service';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IAnnualCycle } from '../models/pms-annual-cycle.model';
import type { IAnnualDecision } from '../models/pms-annual-decision.model';
import type { IObjective } from '../models/pms-objective.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
import type { IQuarterReview } from '../models/pms-quarter-review.model';
import type { AppraisalOutcomeType as AppraisalOutcomeTypeType } from '../constants/pms.enums';
import type { IAnnualDecisionValue } from '../models/pms-annual-decision-value.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';

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

export interface AnnualSummaryResult {
  annualAssignment: Record<string, unknown> & { isAppraisalWindowOpen: boolean };
  quarterAssignments: IQuarterAssignment[];
  objectives: IObjective[];
  quarterReviews: IQuarterReview[];
  annualDecisionValues: Array<Record<string, unknown>>;
  calculatedFinalScore?: number;
  finalScoreOverride: Record<string, unknown> | null;
  visibilityConfiguration: Record<string, unknown> | null;
  annualDecision: Record<string, unknown> | null;
  correctionHistory: Array<Record<string, unknown>>;
  preReopenSnapshots: Array<Record<string, unknown>>;
}

export interface AnnualDecisionListQuery {
  cycleId?: string;
  search?: string;
  finalDecisionStatus?: string;
  annualState?: string;
}

export interface AnnualDecisionListItem {
  annualAssignmentId: string;
  cycleId: string;
  cycleName: string;
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
  quarterProgress: {
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
  availableActions: Array<'SAVE_DRAFT' | 'SUBMIT' | 'FREEZE' | 'UPDATE_VISIBILITY' | 'REOPEN'>;
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

    const [quarterAssignments, annualDecisions, cycles] = await Promise.all([
      QuarterAssignment.find({
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

    const quarterAssignmentsByAnnualAssignmentId = new Map<string, typeof quarterAssignments>();
    for (const quarterAssignment of quarterAssignments) {
      const key = quarterAssignment.annualAssignmentId.toString();
      const bucket = quarterAssignmentsByAnnualAssignmentId.get(key) ?? [];
      bucket.push(quarterAssignment);
      quarterAssignmentsByAnnualAssignmentId.set(key, bucket);
    }

    const decisionByAnnualAssignmentId = new Map(
      annualDecisions.map((item) => [item.annualAssignmentId.toString(), item]),
    );
    const cycleMap = new Map(cycles.map((item) => [item._id.toString(), item]));

    const listItems = await Promise.all(annualAssignments.map(async (annualAssignment) => {
      const relatedQuarters = quarterAssignmentsByAnnualAssignmentId.get(annualAssignment._id.toString()) ?? [];
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
      const completedQuarters = relatedQuarters.filter(
        (quarter) =>
          quarter.quarterState === QuarterWorkflowState.QUARTER_FINALIZED ||
          quarter.quarterState === QuarterWorkflowState.CLOSED_BY_ADMIN,
      ).length;
      const appraisalWindowStatus = await this.getAppraisalWindowStatus(annualAssignment, cycle);

      return {
        annualAssignmentId: annualAssignment._id.toString(),
        cycleId: annualAssignment.cycleId.toString(),
        cycleName: cycle?.name ?? 'Performance Cycle',
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
        finalDecisionStatus: decision?.decisionStatus ?? annualAssignment.finalDecisionStatus ?? AnnualDecisionStatus.DRAFT,
        quarterProgress: {
          total: annualAssignment.applicableQuarters.length,
          completed: completedQuarters,
        },
        visibility: {
          employeeReviewVisible: annualAssignment.visibility.employeeReviewVisible,
          employeeGradeVisible: annualAssignment.visibility.employeeGradeVisible,
          employeeMeritVisible: annualAssignment.visibility.employeeMeritVisible,
          managerGradeVisible: annualAssignment.visibility.managerGradeVisible,
          managerMeritVisible: annualAssignment.visibility.managerMeritVisible,
        },
        isAppraisalWindowOpen: appraisalWindowStatus.isOpen,
        availableActions: this.resolveAvailableActions(
          annualAssignment.finalDecisionStatus ?? decision?.decisionStatus ?? AnnualDecisionStatus.DRAFT,
          completedQuarters === annualAssignment.applicableQuarters.length,
        ),
      };
    }));

    return listItems;
  }

  async getSummary(annualAssignmentId: string): Promise<AnnualSummaryResult> {
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    await this.assertDecisionReadAccess('annualDecision.summary', annualAssignment);

    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId: annualAssignment._id,
      quarterCode: { $in: annualAssignment.applicableQuarters },
    }).sort({ quarterCode: 1 });

    const quarterAssignmentIds = quarterAssignments.map((quarterAssignment) => quarterAssignment._id);

    const [objectives, quarterReviews, annualDecision, visibilityConfiguration, cycle] = await Promise.all([
      Objective.find({ quarterAssignmentId: { $in: quarterAssignmentIds } }),
      QuarterReview.find({ quarterAssignmentId: { $in: quarterAssignmentIds } }),
      AnnualDecision.findOne({ annualAssignmentId: annualAssignment._id }),
      VisibilityConfiguration.findOne({ annualAssignmentId: annualAssignment._id }),
      AnnualCycle.findById(annualAssignment.cycleId).lean(),
    ]);
    const appraisalWindowStatus = await this.getAppraisalWindowStatus(annualAssignment, cycle ?? undefined);
    const calculatedFinalScore = await this.tryCalculateAnnualFinalScore(annualAssignment);

    const annualDecisionValues = annualDecision
      ? await AnnualDecisionValue.find({
          annualDecisionId: annualDecision._id,
          isDeleted: false,
        }).lean()
      : [];

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
    const maskedCorrectionHistory = this.maskCorrectionHistory(
      correctionHistory,
      visibilityConfiguration ?? annualAssignment.visibility,
    );
    const maskedPreReopenSnapshots = this.maskPreReopenSnapshots(
      preReopenSnapshots,
      visibilityConfiguration ?? annualAssignment.visibility,
    );
    const finalScoreOverride = latestFinalScoreOverride
      ? this.buildFinalScoreOverrideSummary(
          latestFinalScoreOverride,
          visibilityConfiguration ?? annualAssignment.visibility,
        )
      : null;

    return {
      annualAssignment: {
        ...annualAssignment.toObject(),
        isAppraisalWindowOpen: appraisalWindowStatus.isOpen,
      },
      quarterAssignments,
      objectives,
      quarterReviews,
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
      finalScoreOverride,
      visibilityConfiguration: visibilityConfiguration?.toObject() ?? null,
      annualDecision: annualDecision
        ? this.maskDecision(
            annualDecision,
            visibilityConfiguration ?? annualAssignment.visibility,
          )
        : null,
      correctionHistory: maskedCorrectionHistory,
      preReopenSnapshots: maskedPreReopenSnapshots,
    };
  }

  async saveDecisionDraft(
    annualAssignmentId: string,
    input: SaveDecisionDraftInput,
  ): Promise<IAnnualDecision> {
    this.assertDecisionAdmin('annualDecision.draft');
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    await this.assertAllQuartersComplete(annualAssignment._id);
    await this.assertAppraisalWindowOpen(annualAssignment);
    const existingDecision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
    });

    if (existingDecision?.frozenAt || existingDecision?.decisionStatus === AnnualDecisionStatus.FROZEN) {
      throw new Error('Frozen annual decision cannot be edited');
    }

    const appraisalOutcomeType = this.deriveOutcome(
      input.isGradeApplied,
      input.isMeritApplied,
    );
    const calculatedFinalScore = await this.calculateAnnualFinalScore(annualAssignment);
    const effectiveFinalScore = await this.resolveEffectiveAnnualFinalScore(
      existingDecision?._id,
      calculatedFinalScore,
    );
    const decisionInput: SaveDecisionDraftInput = {
      ...input,
      finalScore: effectiveFinalScore,
    };
    this.validateDecisionInput(decisionInput, appraisalOutcomeType);
    await this.validateAnnualTemplateInput(annualAssignment, decisionInput);

    const payload = {
      annualAssignmentId: annualAssignment._id,
      cycleId: annualAssignment.cycleId,
      employeeId: annualAssignment.employeeId,
      isGradeApplied: input.isGradeApplied,
      isMeritApplied: input.isMeritApplied,
      appraisalOutcomeType,
      gradeDetails: input.gradeDetails,
      meritDetails: input.meritDetails,
      nilReason: appraisalOutcomeType === AppraisalOutcomeType.NIL ? input.nilReason : undefined,
      managementRemarks: input.managementRemarks,
      finalScore: effectiveFinalScore,
      finalRating: input.finalRating,
      decisionStatus: AnnualDecisionStatus.DRAFT,
      decidedBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
      createdBy: existingDecision ? existingDecision.createdBy : this.actorIdObject(),
    };

    const decision = existingDecision
      ? await AnnualDecision.findByIdAndUpdate(existingDecision._id, {
        $set: payload,
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
    await this.assertAllQuartersComplete(annualAssignment._id);
    await this.assertAppraisalWindowOpen(annualAssignment);
    const decision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
    });

    if (!decision) {
      throw new Error('Annual decision draft must exist before submit');
    }

    if (decision.decisionStatus !== AnnualDecisionStatus.DRAFT) {
      throw new Error('Only draft annual decisions can be submitted');
    }

    const annualDecisionValues = await AnnualDecisionValue.find({
      annualDecisionId: decision._id,
      isDeleted: false,
    }).lean();
    const calculatedFinalScore = await this.calculateAnnualFinalScore(annualAssignment);
    const effectiveFinalScore = await this.resolveEffectiveAnnualFinalScore(
      decision._id,
      calculatedFinalScore,
    );
    const decisionInput = {
      ...this.buildDecisionInputFromRecord(decision, annualDecisionValues),
      finalScore: effectiveFinalScore,
    };
    const appraisalOutcomeType = this.deriveOutcome(
      Boolean(decision.isGradeApplied),
      Boolean(decision.isMeritApplied),
    );
    this.validateDecisionInput(decisionInput, appraisalOutcomeType);
    await this.validateAnnualTemplateInput(annualAssignment, decisionInput);

    const previousValue = decision.toObject();
    decision.finalScore = effectiveFinalScore;
    decision.decisionStatus = AnnualDecisionStatus.SUBMITTED;
    decision.submittedBy = this.actorIdObject();
    decision.submittedAt = new Date();
    decision.updatedBy = this.actorIdObject();
    decision.version += 1;
    await decision.save();
    await this.syncAnnualFinalScoreValue(decision, annualAssignment, effectiveFinalScore);

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
    await this.assertAllQuartersComplete(annualAssignment._id);
    await this.assertAppraisalWindowOpen(annualAssignment);

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
    annualAssignment.appraisalOutcomeType = decision.appraisalOutcomeType;
    annualAssignment.version += 1;
    await annualAssignment.save();

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

    const [quarterAssignments, quarterReviews, visibilityConfiguration] = await Promise.all([
      QuarterAssignment.find({
        annualAssignmentId: annualAssignment._id,
        quarterCode: { $in: annualAssignment.applicableQuarters },
        isDeleted: false,
      })
        .sort({ quarterCode: 1 })
        .lean(),
      QuarterReview.find({
        quarterAssignmentId: { $in: annualAssignment.quarterAssignmentIds },
        isDeleted: false,
      }).lean(),
      VisibilityConfiguration.findOne({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }),
    ]);

    const quarterReviewMap = new Map(
      quarterReviews.map((item) => [item.quarterAssignmentId.toString(), item]),
    );

    const snapshotPayload = {
      annualSnapshot: annualAssignment.toObject(),
      quarterSnapshots: Object.fromEntries(
        quarterAssignments.map((quarterAssignment) => [
          quarterAssignment.quarterCode,
          {
            quarterAssignment,
            quarterReview: quarterReviewMap.get(quarterAssignment._id.toString()) ?? null,
          },
        ]),
      ),
      finalDecisionSnapshot: {
        reopenReason: reason,
        decision: decision.toObject(),
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
      quarterSnapshots: snapshotPayload.quarterSnapshots,
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
    if (!Number.isFinite(overrideScore) || overrideScore < 0) {
      throw new Error('Valid final score override value is required');
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
    decision.updatedBy = this.actorIdObject();
    decision.version += 1;
    await decision.save();
    await this.syncAnnualFinalScoreValue(decision, annualAssignment, roundedOverrideScore);

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
    visibilityConfig.visibleFrom = input.visibleFrom ? new Date(input.visibleFrom) : visibilityConfig.visibleFrom;
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

  private deriveOutcome(
    isGradeApplied: boolean,
    isMeritApplied: boolean,
  ): AppraisalOutcomeTypeType {
    if (isGradeApplied && isMeritApplied) return AppraisalOutcomeType.BOTH;
    if (isGradeApplied && !isMeritApplied) return AppraisalOutcomeType.GRADE_ONLY;
    if (!isGradeApplied && isMeritApplied) return AppraisalOutcomeType.MERIT_ONLY;
    return AppraisalOutcomeType.NIL;
  }

  private resolveAvailableActions(
    finalDecisionStatus: string,
    allQuartersComplete: boolean,
  ): Array<'SAVE_DRAFT' | 'SUBMIT' | 'FREEZE' | 'UPDATE_VISIBILITY' | 'REOPEN'> {
    if (!allQuartersComplete) {
      return [];
    }

    if (finalDecisionStatus === AnnualDecisionStatus.VISIBILITY_ENABLED) {
      return ['UPDATE_VISIBILITY', 'REOPEN'];
    }

    if (finalDecisionStatus === AnnualDecisionStatus.FROZEN) {
      return ['UPDATE_VISIBILITY', 'REOPEN'];
    }

    if (finalDecisionStatus === AnnualDecisionStatus.SUBMITTED) {
      return ['FREEZE'];
    }

    return ['SAVE_DRAFT', 'SUBMIT'];
  }

  private validateDecisionInput(
    input: SaveDecisionDraftInput,
    outcomeType: AppraisalOutcomeTypeType,
  ): void {
    if (typeof input.isGradeApplied !== 'boolean') {
      throw new Error('isGradeApplied is required');
    }

    if (typeof input.isMeritApplied !== 'boolean') {
      throw new Error('isMeritApplied is required');
    }

    if (
      (outcomeType === AppraisalOutcomeType.BOTH || outcomeType === AppraisalOutcomeType.GRADE_ONLY) &&
      !this.hasMeaningfulDecisionDetails(input.gradeDetails)
    ) {
      throw new Error('gradeDetails is required when grade is applied');
    }

    if (
      (outcomeType === AppraisalOutcomeType.BOTH || outcomeType === AppraisalOutcomeType.MERIT_ONLY) &&
      !this.hasMeaningfulDecisionDetails(input.meritDetails)
    ) {
      throw new Error('meritDetails is required when merit is applied');
    }

    if (outcomeType === AppraisalOutcomeType.NIL && !input.nilReason?.trim()) {
      throw new Error('nilReason is required when grade and merit are not applied');
    }
  }

  private async validateAnnualTemplateInput(
    annualAssignment: IAnnualAssignment,
    input: SaveDecisionDraftInput,
  ): Promise<void> {
    const resolvedTemplate = await this.resolveAnnualDecisionTemplate(annualAssignment, input);
    if (!resolvedTemplate) {
      return;
    }

    const values = this.buildAnnualTemplateResolveValues(input);
    const missingFields: string[] = [];

    for (const section of resolvedTemplate.sections) {
      for (const field of section.fields) {
        if (!field.required) {
          continue;
        }

        if (!this.hasMeaningfulAnnualTemplateFieldValue(field.key, field.type, values)) {
          missingFields.push(field.label || field.key);
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
    const completedStates = new Set<QuarterWorkflowState>([
      QuarterWorkflowState.QUARTER_FINALIZED,
      QuarterWorkflowState.CLOSED_BY_ADMIN,
    ]);

    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId: annualAssignment._id,
      quarterCode: { $in: annualAssignment.applicableQuarters },
      isDeleted: false,
    });

    const quarterScores: Record<string, number> = {};
    for (const quarter of quarterAssignments) {
      if (!completedStates.has(quarter.quarterState as QuarterWorkflowState)) {
        throw new Error('Annual final score is blocked until all applicable quarters are finalized or closed');
      }

      if (!Number.isFinite(Number(quarter.quarterScore))) {
        throw new Error(`Annual final score requires a score for ${quarter.quarterCode}`);
      }

      quarterScores[quarter.quarterCode] = Number(quarter.quarterScore);
    }

    const missingQuarter = annualAssignment.applicableQuarters.find(
      (quarterCode) => !Number.isFinite(quarterScores[quarterCode]),
    );
    if (missingQuarter) {
      throw new Error(`Annual final score requires a score for ${missingQuarter}`);
    }

    const annualScoringConfig = await this.resolveAnnualScoringConfig(annualAssignment);
    const score = this.scoringService.calculateAnnualRollup(
      quarterScores,
      annualScoringConfig,
    );

    if (!Number.isFinite(Number(score))) {
      throw new Error('Unable to calculate annual final score from quarter scores');
    }

    return this.roundAnnualScore(Number(score));
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
    const config = templateVersion?.annualScoringConfig;
    if (!config || typeof config !== 'object') {
      return undefined;
    }

    return config as Parameters<PmsScoringService['calculateAnnualRollup']>[1];
  }

  private roundAnnualScore(score: number): number {
    return Math.round((score + Number.EPSILON) * 1_000_000) / 1_000_000;
  }

  private async resolveAnnualDecisionTemplate(
    annualAssignment: IAnnualAssignment,
    input: SaveDecisionDraftInput,
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
        workflowState: annualAssignment.annualState,
        hierarchyScope: 'direct-report',
        values: this.buildAnnualTemplateResolveValues(input),
      },
    );
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
      meritDetails.amount ?? '',
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

  private isFinalScoreFieldKey(fieldKey: string): boolean {
    return ['finalscore', 'score'].includes(
      String(fieldKey || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
    );
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

    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId,
      quarterCode: { $in: annualAssignment.applicableQuarters },
    });
    if (quarterAssignments.length === 0) {
      throw new Error('No quarter assignments found for annual assignment');
    }

    const incompleteQuarter = quarterAssignments.find(
      (quarterAssignment) =>
        quarterAssignment.quarterState !== QuarterWorkflowState.QUARTER_FINALIZED &&
        quarterAssignment.quarterState !== QuarterWorkflowState.CLOSED_BY_ADMIN,
    );

    if (incompleteQuarter) {
      throw new Error('Annual decision is blocked until all applicable quarters are finalized or closed');
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
      throw new Error('Annual appraisal window is blocked until all applicable quarters are finalized or closed');
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
    const completedStates = new Set<QuarterWorkflowState>([
      QuarterWorkflowState.QUARTER_FINALIZED,
      QuarterWorkflowState.CLOSED_BY_ADMIN,
    ]);

    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId: annualAssignment._id,
      quarterCode: { $in: annualAssignment.applicableQuarters },
      isDeleted: false,
    });

    if (quarterAssignments.length === 0) {
      return null;
    }

    let completedAt = new Date(0);
    for (const quarterAssignment of quarterAssignments) {
      if (!completedStates.has(quarterAssignment.quarterState as QuarterWorkflowState)) {
        return null;
      }

      const transitionDate =
        (quarterAssignment as IQuarterAssignment & { lastTransitionAt?: Date }).lastTransitionAt ??
        quarterAssignment.updatedAt;
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
    const quarterCycle = await QuarterCycle.findOne({
      cycleId: cycle._id,
      quarterCode: finalTermCode,
      isDeleted: false,
    })
      .select('quarterFinalizationWindow closureRules')
      .lean();

    if (!quarterCycle) {
      return null;
    }

    const closureRules = quarterCycle.closureRules as Record<string, unknown> | undefined;

    return (
      this.getWindowEndDate(quarterCycle.quarterFinalizationWindow) ??
      this.getWindowEndDate(closureRules?.quarterFinalizationWindow) ??
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

    return snapshots.map((snapshot) => ({
      ...snapshot,
      annualSnapshot: this.maskHistoryValue(snapshot.annualSnapshot, permissions),
      quarterSnapshots: this.maskHistoryValue(snapshot.quarterSnapshots, permissions),
      finalDecisionSnapshot: this.maskHistoryValue(snapshot.finalDecisionSnapshot, permissions),
      visibilitySnapshot: this.maskHistoryValue(snapshot.visibilitySnapshot, permissions),
      communicationSnapshot: this.maskHistoryValue(snapshot.communicationSnapshot, permissions),
    }));
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
    if (visibleFrom && !Number.isNaN(visibleFrom.getTime()) && this.getCurrentDate() < visibleFrom) {
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
      filter.assignedManagerId = this.toObjectId(actor.actorId, 'actorId');
      return;
    }

    if (mappedRole === PmsRole.DIRECTOR || mappedRole === PmsRole.MANAGEMENT || actor.actorScope === 'EXECUTIVE' || actor.actorScope === 'ALL') {
      return;
    }

    throw new Error('PMS access denied');
  }

  private async assertDecisionReadAccess(
    action: string,
    _annualAssignment: IAnnualAssignment,
  ): Promise<void> {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);

    if (mappedRole === PmsRole.ADMIN) {
      return;
    }

    if (mappedRole === PmsRole.DIRECTOR || mappedRole === PmsRole.MANAGEMENT || actor.actorScope === 'EXECUTIVE' || actor.actorScope === 'ALL') {
      return;
    }

    throw new Error(`Access denied for ${action}`);
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
