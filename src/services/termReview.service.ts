import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualWorkflowState,
  normalizePmsRole,
  ObjectiveStatus,
  ObjectiveSource,
  PmsRole,
  PmsTemplateFieldType,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  TermReviewStatus,
  TermWorkflowState,
} from '../constants/pms.enums';
import type { AssessmentTermCode as AssessmentTermCodeType } from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { Objective } from '../models/pms-objective.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import { TermReview } from '../models/pms-term-review.model';
import { TermReviewValue } from '../models/pms-term-review-value.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { PerformanceHistorySnapshot } from '../models/pms-performance-history-snapshot.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { DelegationService } from './delegation.service';
import { PmsScoringService } from './pms-scoring.service';
import { PmsTemplateService, type ResolvedTemplateField } from './pms-template.service';
import { transitionTermAssignmentState } from './term-assignment-workflow.service';
import { getSubordinateUserIds } from '../utilis/userHierarchy';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { ITermAssignment } from '../models/pms-term-assignment.model';
import type { ITermReview } from '../models/pms-term-review.model';
import type { ITemplateField, ITemplateSection } from '../models/pms-template-version.model';

interface TermReviewRatingInput {
  objectiveId?: string;
  rating?: number;
  comments?: string;
}

interface TermReviewAttachmentInput {
  fileName?: string;
  fileUrl?: string;
  documentId?: string;
  uploadedBy?: string;
  uploadedAt?: Date | string;
}

interface TermReviewValueInput {
  templateFieldId?: string;
  fieldKey: string;
  sectionKey: string;
  roleCode?: string;
  actorUserId?: string;
  workflowStage?: string;
  valueJson?: unknown;
  valueText?: string;
  valueNumber?: number;
  valueDate?: Date | string;
  valueStatus?: string;
}

interface TermReviewBaseInput {
  ratings?: TermReviewRatingInput[];
  comments?: string;
  score?: number;
  overallRating?: string;
  recommendation?: string;
  achievements?: string;
  developmentObservations?: string;
  attachments?: TermReviewAttachmentInput[];
  reviewValues?: TermReviewValueInput[];
}

export interface SaveTermReviewDraftInput extends TermReviewBaseInput {}

export interface SubmitTermReviewInput extends TermReviewBaseInput {
  ratings: TermReviewRatingInput[];
  comments: string;
  score: number;
}

export interface SubmitTermReviewResult {
  termReview: ITermReview;
  termAssignment: ITermAssignment;
}

export interface FinalizeTermAssignmentResult {
  termAssignment: ITermAssignment;
}

export interface ReopenTermAssignmentInput {
  reason: string;
}

export type TermReviewWorkspaceMode = 'manager' | 'employee' | 'admin';

type ApprovedObjectiveRecord = {
  id: string;
  title: string;
  description: string;
  targetMetric: string;
  targetValue: string;
  successCriteria: string;
  weightage?: number;
};

type TermReviewRecord = {
  id: string;
  termAssignmentId: string;
  annualAssignmentId: string;
  cycleId: string;
  employeeId: string;
  managerId: string;
  reviewStatus: string;
  ratings: Array<{
    objectiveId?: string;
    rating?: number;
    comments?: string;
  }>;
  comments: string;
  score?: number;
  overallRating?: string;
  recommendation?: string;
  achievements?: string;
  developmentObservations?: string;
  attachments: Array<{
    fileName: string;
    fileUrl?: string;
    documentId?: string;
    uploadedAt?: string;
  }>;
  reviewValues: Array<{
    templateFieldId?: string;
    fieldKey: string;
    sectionKey: string;
    roleCode: string;
    actorUserId?: string;
    workflowStage: string;
    valueJson?: unknown;
    valueText?: string;
    valueNumber?: number;
    valueDate?: string;
  }>;
  submittedAt?: string;
  finalizedAt?: string;
  isDraft: boolean;
};

type QuarterWindowRecord = {
  startDate: string;
  endDate: string;
};

type AchievementSubmissionWindowRecord = Partial<QuarterWindowRecord> & {
  enabled?: boolean;
  dueDate?: string;
  graceDays?: number;
  reminderDaysBefore?: number[];
  escalationDaysAfterDue?: number;
};

export type TermReviewAssignmentRecord = {
  id: string;
  annualAssignmentId: string;
  termAssignmentId: string;
  cycleId: string;
  cycleName: string;
  cycleCode?: string;
  quarter: AssessmentTermCodeType;
  assessmentTermType?: string;
  termCode?: AssessmentTermCodeType;
  termLabel?: string;
  termState: string;
  termWindows?: {
    objectiveSetting?: QuarterWindowRecord;
    objectiveApproval?: QuarterWindowRecord;
    achievementSubmission?: AchievementSubmissionWindowRecord;
    managerReview?: QuarterWindowRecord;
    quarterFinalization?: QuarterWindowRecord;
  };
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
  templateVersionId?: string;
  reviewConfig: {
    objectiveRating: {
      scoreType: string;
      minScore: number;
      maxScore: number;
      allowedScores?: number[];
    } | null;
    overallScoreMax: number | null;
  };
  approvedObjectives: ApprovedObjectiveRecord[];
  termReview: TermReviewRecord | null;
  backendConnected: boolean;
};

type ReviewScoringRule = {
  scoreType: string;
  minScore: number;
  maxScore: number;
  allowedScores?: number[];
};

type TermReviewScoringFieldConfig = {
  fieldKey: string;
  sectionKey: string;
  fieldType: string;
  scoreType: string;
  weightage: number;
  formula?: string;
  fixedScore?: number;
  maxScore?: number;
  options?: any[];
  matrixConfig?: any;
  fieldCategory?: string;
  semanticRole?: string;
  scoringConfig?: any;
};

type TermReviewSectionConfig = {
  sectionKey: string;
  sectionType?: string;
  weightage: number;
  aggregationMethod: 'WEIGHTED_AVERAGE' | 'SIMPLE_AVERAGE' | 'SUM' | 'MAX_FIELD';
  maxSectionScore: number | null;
  scoringFields: TermReviewScoringFieldConfig[];
  objectiveBuckets?: any[];
};

type TermReviewConfig = {
  objectiveRatingRule: ReviewScoringRule | null;
  overallScoreMax: number | null;
  scoringPolicy?: any;
  sections: TermReviewSectionConfig[];
};

export class TermReviewService extends BaseService {
  private readonly scoringService = new PmsScoringService();

  constructor(context: RequestContext) {
    super(context);
  }

  async listAssignments(mode: TermReviewWorkspaceMode): Promise<TermReviewAssignmentRecord[]> {
    const actor = this.requireActor();
    const actorRole = normalizePmsRole(actor.actorRole);
    const filter: Record<string, unknown> = { isDeleted: false };

    if (mode === 'employee') {
      filter.employeeId = this.toObjectId(actor.actorId, 'actorId');
    } else if (mode === 'admin' && actorRole === PmsRole.ADMIN) {
      // Admin review workspace must be able to reach quarter reviews across managers
      // so submitted reviews can be finalized and finalized reviews can be reopened.
    } else {
      const managerId = this.toObjectId(actor.actorId, 'actorId');
      const delegations = await new DelegationService(this.context).getActiveDelegationsForDelegate(
        actor.actorId,
        'PMS_REVIEWS',
      );
      const managerClauses: Record<string, unknown>[] = [{ assignedManagerId: managerId }];

      for (const delegation of delegations) {
        const clause: Record<string, unknown> = {
          assignedManagerId: delegation.delegatorUserId,
        };
        if (delegation.cycleId) {
          clause.cycleId = delegation.cycleId;
        }
        managerClauses.push(clause);
      }

      filter.$or = managerClauses;
    }

    const termAssignments = await TermAssignment.find(filter)
      .sort({ updatedAt: -1, assessmentTermCode: 1 });

    if (termAssignments.length === 0) {
      return [];
    }

    await this.advanceTermAssignmentsToManagerReviewIfEligible(termAssignments);

    const annualAssignmentIds = termAssignments.map((item) => item.annualAssignmentId);
    const cycleIds = termAssignments
      .map((item) => item.cycleId)
      .filter((value): value is Types.ObjectId => Boolean(value));
    const termCycleIds = termAssignments
      .map((item) => item.cycleTermId)
      .filter((value): value is Types.ObjectId => Boolean(value));

    const [annualAssignments, cycles, termCycles, approvedObjectives, termReviews, termReviewValues] = await Promise.all([
      AnnualAssignment.find({
        _id: { $in: annualAssignmentIds },
        isDeleted: false,
      }).lean(),
      AnnualCycle.find({
        _id: { $in: cycleIds },
        isDeleted: false,
      }).lean(),
      TermCycle.find({
        _id: { $in: termCycleIds },
        isDeleted: false,
      }).lean(),
      Objective.find({
        termAssignmentId: { $in: termAssignments.map((item) => item._id) },
        isDeleted: false,
        status: ObjectiveStatus.OBJECTIVE_APPROVED,
      })
        .sort({ objectiveNo: 1, createdAt: 1 })
        .lean(),
      TermReview.find({
        termAssignmentId: { $in: termAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
      TermReviewValue.find({
        termAssignmentId: { $in: termAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
    ]);

    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );
    const cycleMap = new Map(cycles.map((item) => [item._id.toString(), item]));
    const termCycleMap = new Map(termCycles.map((item) => [item._id.toString(), item]));
    const objectivesByTermAssignmentId = new Map<string, typeof approvedObjectives>();
    const termReviewByTermAssignmentId = new Map(
      termReviews.map((item) => [item.termAssignmentId.toString(), item]),
    );
    const reviewValuesByReviewId = new Map<string, typeof termReviewValues>();
    for (const val of termReviewValues) {
      if (val.termReviewId) {
        const key = val.termReviewId.toString();
        const bucket = reviewValuesByReviewId.get(key) ?? [];
        bucket.push(val);
        reviewValuesByReviewId.set(key, bucket);
      }
    }

    for (const objective of approvedObjectives) {
      const key = objective.termAssignmentId.toString();
      const bucket = objectivesByTermAssignmentId.get(key) ?? [];
      bucket.push(objective);
      objectivesByTermAssignmentId.set(key, bucket);
    }

    return await Promise.all(termAssignments.map(async (termAssignment) => {
      const annualAssignment = annualAssignmentMap.get(termAssignment.annualAssignmentId.toString());
      const cycle = termAssignment.cycleId
        ? cycleMap.get(termAssignment.cycleId.toString())
        : undefined;
      const termCycle = termAssignment.cycleTermId
        ? termCycleMap.get(termAssignment.cycleTermId.toString())
        : undefined;
      const review = termReviewByTermAssignmentId.get(termAssignment._id.toString()) ?? null;
      const objectives = objectivesByTermAssignmentId.get(termAssignment._id.toString()) ?? [];
      const reviewConfig = annualAssignment
        ? await this.getTermReviewConfig(annualAssignment, termAssignment.assessmentTermCode)
        : this.defaultTermReviewConfig();

      const actorRole = normalizePmsRole(this.requireActor().actorRole);
      let isReviewVisible = true;
      if (actorRole === PmsRole.EMPLOYEE) {
        isReviewVisible = annualAssignment?.visibility?.employeeReviewVisible === true;
      }

      const employeeSnapshot = annualAssignment?.employeeSnapshot ?? {};
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
      const effectiveTermState =
        annualAssignment?.annualState === AnnualWorkflowState.CANCELLED ||
        cycle?.status === AnnualWorkflowState.CANCELLED
          ? termAssignment.termState === TermWorkflowState.TERM_FINALIZED
            ? termAssignment.termState
            : TermWorkflowState.CLOSED_BY_ADMIN
          : termAssignment.termState;

      return {
        id: termAssignment._id.toString(),
        annualAssignmentId: termAssignment.annualAssignmentId.toString(),
        termAssignmentId: termAssignment._id.toString(),
        cycleId: termAssignment.cycleId?.toString() ?? '',
        cycleName: String(
          cycle?.name ??
          cycle?.code ??
          annualAssignment?.orgSnapshot?.cycleCode ??
          annualAssignment?.orgSnapshot?.cycleName ??
          termAssignment.cycleId?.toString() ??
          'Cycle',
        ),
        cycleCode: cycle?.code,
        quarter: termAssignment.assessmentTermCode,
        assessmentTermType: termAssignment.assessmentTermType,
        termCode: termAssignment.termCode ?? termAssignment.assessmentTermCode,
        termLabel: termAssignment.termLabel ?? termAssignment.termCode ?? termAssignment.assessmentTermCode,
        termState: effectiveTermState,
        termWindows: this.mapTermWindows(termCycle),
        employeeId: termAssignment.employeeId.toString(),
        employeeName: String(employeeSnapshot.name ?? 'Employee'),
        employeeCode,
        employeeNo: employeeCode,
        designation: employeeDesignation,
        employeeDesignation,
        department: employeeDepartment,
        departmentId: String(employeeSnapshot.departmentId ?? employeeDepartment),
        managerId: termAssignment.assignedManagerId.toString(),
        managerName: String(annualAssignment?.managerSnapshot?.name ?? 'Manager'),
        templateVersionId: annualAssignment?.templateVersionId?.toString() ?? '',
        reviewConfig: {
          objectiveRating: reviewConfig.objectiveRatingRule,
          overallScoreMax: reviewConfig.overallScoreMax,
        },
        approvedObjectives: objectives.map((objective) => ({
          id: objective._id.toString(),
          source: objective.source,
          title: objective.title,
          description: objective.description ?? '',
          priority: objective.priority,
          expectedOutcome: objective.expectedOutcome ?? '',
          targetMetric: objective.targetMetric ?? '',
          targetValue: objective.targetValue ?? '',
          successCriteria: objective.successCriteria ?? '',
          weightage: objective.weightage,
        })),
        termReview: review
          ? this.mapTermReviewRecord(
              review,
              isReviewVisible,
              reviewValuesByReviewId.get(review._id.toString()) ?? [],
            )
          : null,
        backendConnected: true,
      };
    }));
  }

  async getAssignment(termAssignmentId: string): Promise<TermReviewAssignmentRecord> {
    const [record] = await this.listAssignmentsForQuarterIds([termAssignmentId]);
    if (!record) {
      throw new Error('Quarter assignment not found');
    }
    return record;
  }

  async saveTermReviewDraft(
    termAssignmentId: string,
    input: SaveTermReviewDraftInput,
  ): Promise<SubmitTermReviewResult> {
    const termAssignment = await this.getTermAssignment(termAssignmentId);
    await this.assertManagerAccess('termReview.draft', termAssignment);
    await this.assertReviewWindow(termAssignment);

    if (termAssignment.termState !== TermWorkflowState.MANAGER_REVIEW_OPEN) {
      throw new Error('Quarter review draft can be saved only when manager review is open');
    }

    const approvedObjectives = await this.getApprovedObjectives(termAssignment._id);
    if (approvedObjectives.length === 0) {
      throw new Error('Quarter review requires approved objectives before manager review can start');
    }
    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const reviewConfig = await this.getTermReviewConfig(annualAssignment, termAssignment.assessmentTermCode);
    const scoringResolution = this.resolveTermReviewScoring(input, reviewConfig, approvedObjectives);

    this.validateDraftInput(input, approvedObjectives, reviewConfig, scoringResolution.overallScore);
    
    await this.validateReviewValuesAgainstTemplate(
      input.reviewValues ?? [],
      annualAssignment,
      termAssignment,
      false,
    );

    const existingReview = await TermReview.findOne({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
    });

    if (existingReview?.submittedAt) {
      throw new Error('Submitted quarter review cannot be edited as draft');
    }
    const resolvedReviewFields = await this.resolveManagerReviewFields(
      annualAssignment,
      termAssignment,
      scoringResolution.reviewValues,
    );
    const preservedReviewValues = existingReview
      ? await this.getPreservedReadOnlyTermReviewValues(
          existingReview._id,
          scoringResolution.reviewValues,
          resolvedReviewFields,
        )
      : [];

    const actor = this.requireActor();
    const actorObjectId = new Types.ObjectId(actor.actorId);
    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== termAssignment.assignedManagerId.toString()) {
      const delegation = await this.getReviewDelegation(
        actor.actorId,
        termAssignment.assignedManagerId.toString(),
        termAssignment.cycleId?.toString(),
      );

      if (delegation) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = termAssignment.assignedManagerId;
      }
    }

    const reviewPayload = {
      termAssignmentId: termAssignment._id,
      annualAssignmentId: termAssignment.annualAssignmentId,
      cycleId: termAssignment.cycleId,
      employeeId: termAssignment.employeeId,
      managerId: termAssignment.assignedManagerId,
      reviewStatus: TermReviewStatus.MANAGER_REVIEW_OPEN,
      ratings: this.normalizeRatings(input.ratings ?? []),
      comments: input.comments?.trim(),
      score: scoringResolution.overallScore,
      overallScore: scoringResolution.overallScore,
      overallRating: input.overallRating?.trim(),
      finalTermRemarks: input.comments?.trim(),
      recommendation: input.recommendation?.trim(),
      achievements: input.achievements?.trim(),
      developmentObservations: input.developmentObservations?.trim(),
      attachments: this.normalizeAttachments(input.attachments ?? []),
      scoreSnapshot: scoringResolution.scoreSnapshot,
      actingDelegateUserId,
      originalOwnerUserId,
      updatedBy: this.actorIdObject(),
      createdBy: existingReview?.createdBy ?? this.actorIdObject(),
    };

    const termReview = existingReview
      ? await TermReview.findByIdAndUpdate(
        existingReview._id,
        {
          $set: reviewPayload,
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      : await TermReview.create(reviewPayload);

    if (!termReview) {
      throw new Error('Unable to save quarter review draft');
    }

    await this.persistTermReviewValues(
      termReview,
      termAssignment,
      {
        ...input,
        score: scoringResolution.overallScore,
        reviewValues: scoringResolution.reviewValues,
      },
      false,
      preservedReviewValues,
    );
    await this.syncTermAssignmentReviewSummary(termAssignment, termReview);

    await this.audit(
      'PMS_QUARTER_REVIEW_DRAFT_SAVED',
      'QUARTER_REVIEW',
      termReview._id.toString(),
      existingReview?.toObject(),
      termReview.toObject(),
    );

    return {
      termReview,
      termAssignment: await this.getTermAssignment(termAssignmentId),
    };
  }

  async submitTermReview(
    termAssignmentId: string,
    input: SubmitTermReviewInput,
  ): Promise<SubmitTermReviewResult> {
    const termAssignment = await this.getTermAssignment(termAssignmentId);
    await this.assertManagerAccess('termReview.submit', termAssignment);
    await this.assertReviewWindow(termAssignment);

    if (termAssignment.termState === TermWorkflowState.MANAGER_REVIEW_SUBMITTED) {
      const submittedReview = await TermReview.findOne({
        termAssignmentId: termAssignment._id,
        isDeleted: false,
      });

      if (!submittedReview?.submittedAt) {
        throw new Error('Submitted quarter review is required before quarter finalization');
      }

      const finalizedTermAssignment = await this.finalizeSubmittedTermReview(
        termAssignment,
        submittedReview,
        'PMS_TERM_AUTO_FINALIZED_AFTER_MANAGER_REVIEW_SUBMISSION',
      );

      return {
        termReview: submittedReview,
        termAssignment: finalizedTermAssignment,
      };
    }

    if (termAssignment.termState !== TermWorkflowState.MANAGER_REVIEW_OPEN) {
      throw new Error('Quarter review can be submitted only when manager review is open');
    }

    const approvedObjectives = await this.getApprovedObjectives(termAssignment._id);
    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const reviewConfig = await this.getTermReviewConfig(annualAssignment, termAssignment.assessmentTermCode);
    const scoringResolution = this.resolveTermReviewScoring(input, reviewConfig, approvedObjectives);
    this.validateReviewInput(input, approvedObjectives, reviewConfig, scoringResolution.overallScore);

    await this.validateReviewValuesAgainstTemplate(
      input.reviewValues ?? [],
      annualAssignment,
      termAssignment,
      true,
    );

    const existingReview = await TermReview.findOne({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
    });

    if (existingReview?.submittedAt) {
      throw new Error('Quarter review already submitted');
    }
    const resolvedReviewFields = await this.resolveManagerReviewFields(
      annualAssignment,
      termAssignment,
      scoringResolution.reviewValues,
    );
    const preservedReviewValues = existingReview
      ? await this.getPreservedReadOnlyTermReviewValues(
          existingReview._id,
          scoringResolution.reviewValues,
          resolvedReviewFields,
        )
      : [];

    const actor = this.requireActor();
    const actorObjectId = new Types.ObjectId(actor.actorId);
    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== termAssignment.assignedManagerId.toString()) {
      const delegation = await this.getReviewDelegation(
        actor.actorId,
        termAssignment.assignedManagerId.toString(),
        termAssignment.cycleId?.toString(),
      );

      if (delegation) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = termAssignment.assignedManagerId;
      }
    }

    const submissionTimestamp = new Date();
    const reviewPayload = {
      termAssignmentId: termAssignment._id,
      annualAssignmentId: termAssignment.annualAssignmentId,
      cycleId: termAssignment.cycleId,
      employeeId: termAssignment.employeeId,
      managerId: termAssignment.assignedManagerId,
      reviewStatus: TermReviewStatus.MANAGER_REVIEW_SUBMITTED,
      ratings: this.normalizeRatings(input.ratings),
      comments: input.comments.trim(),
      score: scoringResolution.overallScore,
      overallScore: scoringResolution.overallScore,
      overallRating: input.overallRating?.trim(),
      finalTermRemarks: input.comments.trim(),
      recommendation: input.recommendation?.trim(),
      achievements: input.achievements?.trim(),
      developmentObservations: input.developmentObservations?.trim(),
      attachments: this.normalizeAttachments(input.attachments ?? []),
      scoreSnapshot: scoringResolution.scoreSnapshot,
      actingDelegateUserId,
      originalOwnerUserId,
      submittedAt: submissionTimestamp,
      finalizedAt: undefined,
      updatedBy: this.actorIdObject(),
      createdBy: existingReview?.createdBy ?? this.actorIdObject(),
    };

    const termReview = existingReview
      ? await TermReview.findByIdAndUpdate(
        existingReview._id,
        {
          $set: reviewPayload,
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      : await TermReview.create(reviewPayload);

    if (!termReview) {
      throw new Error('Unable to submit quarter review');
    }

    await this.persistTermReviewValues(
      termReview,
      termAssignment,
      {
        ...input,
        score: scoringResolution.overallScore,
        reviewValues: scoringResolution.reviewValues,
      },
      true,
      preservedReviewValues,
    );

    const submittedTermAssignment = await transitionTermAssignmentState(
      termAssignment._id.toString(),
      TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
      this.requireActor(),
    );

    await this.audit(
      'PMS_TERM_REVIEW_SUBMITTED',
      'QUARTER_REVIEW',
      termReview._id.toString(),
      existingReview?.toObject(),
      termReview.toObject(),
    );

    const finalizedTermAssignment = await this.finalizeSubmittedTermReview(
      submittedTermAssignment,
      termReview,
      'PMS_TERM_AUTO_FINALIZED_AFTER_MANAGER_REVIEW_SUBMISSION',
    );

    return {
      termReview,
      termAssignment: finalizedTermAssignment,
    };
  }

  async finalizeTermAssignment(
    termAssignmentId: string,
  ): Promise<FinalizeTermAssignmentResult> {
    const termAssignment = await this.getTermAssignment(termAssignmentId);
    await this.assertAdmin('termAssignment.finalize');

    if (
      termAssignment.termState !== TermWorkflowState.MANAGER_REVIEW_SUBMITTED &&
      termAssignment.termState !== TermWorkflowState.REOPENED_BY_ADMIN
    ) {
      throw new Error('Term can be finalized only after manager review submission or admin reopen');
    }

    const termReview = await TermReview.findOne({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
    });

    if (!termReview?.submittedAt) {
      throw new Error('Submitted quarter review is required before quarter finalization');
    }

    const updatedTermAssignment = await this.finalizeSubmittedTermReview(
      termAssignment,
      termReview,
      'PMS_TERM_FINALIZED',
    );

    return { termAssignment: updatedTermAssignment };
  }

  async reopenTermAssignment(
    termAssignmentId: string,
    input: ReopenTermAssignmentInput,
  ): Promise<FinalizeTermAssignmentResult> {
    const termAssignment = await this.getTermAssignment(termAssignmentId);
    await this.assertAdmin('termAssignment.reopen');

    if (!input.reason?.trim()) {
      throw new Error('Reopen reason is required');
    }

    if (termAssignment.termState !== TermWorkflowState.TERM_FINALIZED) {
      throw new Error('Only finalized terms can be reopened');
    }

    const finalizedReviewBeforeReopen = await TermReview.findOne({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
    }).lean();

    const updatedTermAssignment = await transitionTermAssignmentState(
      termAssignment._id.toString(),
      TermWorkflowState.REOPENED_BY_ADMIN,
      this.requireActor(),
      input.reason,
    );

    await TermReview.findOneAndUpdate(
      { termAssignmentId: termAssignment._id, isDeleted: false },
      {
        $set: {
          finalizedAt: undefined,
          reviewStatus: TermReviewStatus.MANAGER_REVIEW_SUBMITTED,
          updatedBy: this.actorIdObject(),
        },
        $inc: { version: 1 },
      },
      { new: true },
    );

    await this.createQuarterReopenCorrectionLayer(
      termAssignment,
      finalizedReviewBeforeReopen,
      input.reason,
    );

    await this.audit(
      'PMS_TERM_REOPENED',
      'TERM_ASSIGNMENT',
      updatedTermAssignment._id.toString(),
      { termState: termAssignment.termState },
      { termState: updatedTermAssignment.termState },
      input.reason,
    );

    return { termAssignment: updatedTermAssignment };
  }

  private async listAssignmentsForQuarterIds(
    termAssignmentIds: string[],
  ): Promise<TermReviewAssignmentRecord[]> {
    const normalizedIds = termAssignmentIds
      .filter((value) => Types.ObjectId.isValid(value))
      .map((value) => new Types.ObjectId(value));

    if (normalizedIds.length === 0) {
      return [];
    }

    const termAssignments = await TermAssignment.find({
      _id: { $in: normalizedIds },
      isDeleted: false,
    });

    if (termAssignments.length === 0) {
      return [];
    }

    await this.advanceTermAssignmentsToManagerReviewIfEligible(termAssignments);

    const actor = this.requireActor();
    for (const termAssignment of termAssignments) {
      await this.assertTermAssignmentViewAccess(actor.actorRole, termAssignment);
    }

    const annualAssignmentIds = termAssignments.map((item) => item.annualAssignmentId);
    const cycleIds = termAssignments
      .map((item) => item.cycleId)
      .filter((value): value is Types.ObjectId => Boolean(value));
    const termCycleIds = termAssignments
      .map((item) => item.cycleTermId)
      .filter((value): value is Types.ObjectId => Boolean(value));

    const [annualAssignments, cycles, termCycles, approvedObjectives, termReviews, termReviewValues] = await Promise.all([
      AnnualAssignment.find({
        _id: { $in: annualAssignmentIds },
        isDeleted: false,
      }).lean(),
      AnnualCycle.find({
        _id: { $in: cycleIds },
        isDeleted: false,
      }).lean(),
      TermCycle.find({
        _id: { $in: termCycleIds },
        isDeleted: false,
      }).lean(),
      Objective.find({
        termAssignmentId: { $in: termAssignments.map((item) => item._id) },
        isDeleted: false,
        status: ObjectiveStatus.OBJECTIVE_APPROVED,
      })
        .sort({ objectiveNo: 1, createdAt: 1 })
        .lean(),
      TermReview.find({
        termAssignmentId: { $in: termAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
      TermReviewValue.find({
        termAssignmentId: { $in: termAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
    ]);

    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );
    const cycleMap = new Map(cycles.map((item) => [item._id.toString(), item]));
    const termCycleMap = new Map(termCycles.map((item) => [item._id.toString(), item]));
    const objectivesByTermAssignmentId = new Map<string, typeof approvedObjectives>();
    const termReviewByTermAssignmentId = new Map(
      termReviews.map((item) => [item.termAssignmentId.toString(), item]),
    );

    const templateVersionIds = annualAssignments
      .map((item) => item.templateVersionId)
      .filter((value): value is Types.ObjectId => Boolean(value));

    const templateVersions = await PmsTemplateVersion.find({
      _id: { $in: templateVersionIds },
      isDeleted: false,
    }).lean();

    const confidentialFieldsByTemplateId = new Map<string, Set<string>>();
    for (const tv of templateVersions) {
      const confidentialSet = new Set<string>();
      for (const section of tv.sections ?? []) {
        for (const field of section.fields ?? []) {
          if (field.fieldCategory === 'CONFIDENTIAL') {
            confidentialSet.add(field.fieldKey);
          }
        }
      }
      confidentialFieldsByTemplateId.set(tv._id.toString(), confidentialSet);
    }
    const reviewValuesByReviewId = new Map<string, typeof termReviewValues>();
    for (const val of termReviewValues) {
      if (val.termReviewId) {
        const key = val.termReviewId.toString();
        const bucket = reviewValuesByReviewId.get(key) ?? [];
        bucket.push(val);
        reviewValuesByReviewId.set(key, bucket);
      }
    }

    for (const objective of approvedObjectives) {
      const key = objective.termAssignmentId.toString();
      const bucket = objectivesByTermAssignmentId.get(key) ?? [];
      bucket.push(objective);
      objectivesByTermAssignmentId.set(key, bucket);
    }

    return await Promise.all(termAssignments.map(async (termAssignment) => {
      const annualAssignment = annualAssignmentMap.get(termAssignment.annualAssignmentId.toString());
      const cycle = termAssignment.cycleId
        ? cycleMap.get(termAssignment.cycleId.toString())
        : undefined;
      const termCycle = termAssignment.cycleTermId
        ? termCycleMap.get(termAssignment.cycleTermId.toString())
        : undefined;
      const review = termReviewByTermAssignmentId.get(termAssignment._id.toString()) ?? null;
      const objectives = objectivesByTermAssignmentId.get(termAssignment._id.toString()) ?? [];
      const reviewConfig = annualAssignment
        ? await this.getTermReviewConfig(annualAssignment, termAssignment.assessmentTermCode)
        : this.defaultTermReviewConfig();

      const actorRole = normalizePmsRole(this.requireActor().actorRole);
      let isReviewVisible = true;
      if (actorRole === PmsRole.EMPLOYEE) {
        isReviewVisible = annualAssignment?.visibility?.employeeReviewVisible === true;
      }

      let filteredReviewValues = reviewValuesByReviewId.get(review?._id.toString()) ?? [];
      if (actorRole === PmsRole.EMPLOYEE && annualAssignment?.templateVersionId) {
        const confidentialSet = confidentialFieldsByTemplateId.get(annualAssignment.templateVersionId.toString());
        if (confidentialSet) {
          filteredReviewValues = filteredReviewValues.filter(val => !confidentialSet.has(val.fieldKey));
        }
      }

      const employeeSnapshot = annualAssignment?.employeeSnapshot ?? {};
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

      return {
        id: termAssignment._id.toString(),
        annualAssignmentId: termAssignment.annualAssignmentId.toString(),
        termAssignmentId: termAssignment._id.toString(),
        cycleId: termAssignment.cycleId?.toString() ?? '',
        cycleName: String(
          cycle?.name ??
          cycle?.code ??
          annualAssignment?.orgSnapshot?.cycleCode ??
          annualAssignment?.orgSnapshot?.cycleName ??
          termAssignment.cycleId?.toString() ??
          'Cycle',
        ),
        cycleCode: cycle?.code,
        quarter: termAssignment.assessmentTermCode,
        assessmentTermType: termAssignment.assessmentTermType,
        termCode: termAssignment.termCode ?? termAssignment.assessmentTermCode,
        termLabel: termAssignment.termLabel ?? termAssignment.termCode ?? termAssignment.assessmentTermCode,
        termState: termAssignment.termState,
        termWindows: this.mapTermWindows(termCycle),
        employeeId: termAssignment.employeeId.toString(),
        employeeName: String(employeeSnapshot.name ?? 'Employee'),
        employeeCode,
        employeeNo: employeeCode,
        designation: employeeDesignation,
        employeeDesignation,
        department: employeeDepartment,
        departmentId: String(employeeSnapshot.departmentId ?? employeeDepartment),
        managerId: termAssignment.assignedManagerId.toString(),
        managerName: String(annualAssignment?.managerSnapshot?.name ?? 'Manager'),
        templateVersionId: annualAssignment?.templateVersionId?.toString() ?? '',
        reviewConfig: {
          objectiveRating: reviewConfig.objectiveRatingRule,
          overallScoreMax: reviewConfig.overallScoreMax,
        },
        approvedObjectives: objectives.map((objective) => ({
          id: objective._id.toString(),
          source: objective.source,
          title: objective.title,
          description: objective.description ?? '',
          priority: objective.priority,
          expectedOutcome: objective.expectedOutcome ?? '',
          targetMetric: objective.targetMetric ?? '',
          targetValue: objective.targetValue ?? '',
          successCriteria: objective.successCriteria ?? '',
          weightage: objective.weightage,
        })),
        termReview: review
          ? this.mapTermReviewRecord(
              review,
              isReviewVisible,
              filteredReviewValues,
            )
          : null,
        backendConnected: true,
      };
    }));
  }

  private mapTermReviewRecord(review: Record<string, any>, isReviewVisible = true, reviewValues: any[] = []): TermReviewRecord {
    if (!isReviewVisible) {
      return {
        id: review._id.toString(),
        termAssignmentId: review.termAssignmentId.toString(),
        annualAssignmentId: review.annualAssignmentId?.toString?.() ?? '',
        cycleId: review.cycleId?.toString?.() ?? '',
        employeeId: review.employeeId.toString(),
        managerId: review.managerId.toString(),
        reviewStatus: review.reviewStatus,
        ratings: [],
        comments: '',
        score: undefined,
        overallRating: '',
        recommendation: '',
        achievements: '',
        developmentObservations: '',
        attachments: [],
        reviewValues: [],
        submittedAt: review.submittedAt ? new Date(review.submittedAt).toISOString() : undefined,
        finalizedAt: review.finalizedAt ? new Date(review.finalizedAt).toISOString() : undefined,
        isDraft: !review.submittedAt,
      };
    }

    return {
      id: review._id.toString(),
      termAssignmentId: review.termAssignmentId.toString(),
      annualAssignmentId: review.annualAssignmentId?.toString?.() ?? '',
      cycleId: review.cycleId?.toString?.() ?? '',
      employeeId: review.employeeId.toString(),
      managerId: review.managerId.toString(),
      reviewStatus: review.reviewStatus,
      ratings: (review.ratings ?? []).map((rating: Record<string, any>) => ({
        objectiveId: rating.objectiveId?.toString?.(),
        rating: rating.rating,
        comments: rating.comments ?? '',
      })),
      comments: review.comments ?? '',
      score: review.score,
      overallRating: review.overallRating ?? '',
      recommendation: review.recommendation ?? '',
      achievements: review.achievements ?? '',
      developmentObservations: review.developmentObservations ?? '',
      attachments: (review.attachments ?? []).map((attachment: Record<string, any>) => ({
        fileName: attachment.fileName ?? '',
        fileUrl: attachment.fileUrl,
        documentId: attachment.documentId,
        uploadedAt: attachment.uploadedAt
          ? new Date(attachment.uploadedAt).toISOString()
          : undefined,
      })),
      reviewValues: reviewValues.map((val) => ({
        templateFieldId: val.templateFieldId,
        fieldKey: val.fieldKey,
        sectionKey: val.sectionKey,
        roleCode: val.roleCode,
        actorUserId: val.actorUserId?.toString?.(),
        workflowStage: val.workflowStage,
        valueJson: val.valueJson,
        valueText: val.valueText,
        valueNumber: val.valueNumber,
        valueDate: val.valueDate ? new Date(val.valueDate).toISOString() : undefined,
      })),
      submittedAt: review.submittedAt ? new Date(review.submittedAt).toISOString() : undefined,
      finalizedAt: review.finalizedAt ? new Date(review.finalizedAt).toISOString() : undefined,
      isDraft: !review.submittedAt,
    };
  }

  private mapTermWindows(termCycle?: Record<string, any>) {
    if (!termCycle) return undefined;

    const mapWindow = (window?: { startDate?: Date; endDate?: Date }) => {
      if (!window?.startDate || !window?.endDate) return undefined;
      return {
        startDate: new Date(window.startDate).toISOString(),
        endDate: new Date(window.endDate).toISOString(),
      };
    };

    const achievementSubmissionWindow = termCycle.achievementSubmissionWindow
      ? {
          enabled: termCycle.achievementSubmissionWindow.enabled === true,
          startDate: termCycle.achievementSubmissionWindow.startDate
            ? new Date(termCycle.achievementSubmissionWindow.startDate).toISOString()
            : undefined,
          endDate: termCycle.achievementSubmissionWindow.endDate
            ? new Date(termCycle.achievementSubmissionWindow.endDate).toISOString()
            : undefined,
          dueDate: termCycle.achievementSubmissionWindow.dueDate
            ? new Date(termCycle.achievementSubmissionWindow.dueDate).toISOString()
            : undefined,
          graceDays: termCycle.achievementSubmissionWindow.graceDays,
          reminderDaysBefore: termCycle.achievementSubmissionWindow.reminderDaysBefore,
          escalationDaysAfterDue: termCycle.achievementSubmissionWindow.escalationDaysAfterDue,
        }
      : undefined;

    return {
      objectiveSetting: mapWindow(termCycle.objectiveSettingWindow),
      objectiveApproval: mapWindow(termCycle.objectiveApprovalWindow),
      achievementSubmission: achievementSubmissionWindow,
      managerReview: mapWindow(termCycle.managerReviewWindow),
      quarterFinalization: mapWindow(termCycle.termFinalizationWindow),
    };
  }

  private async validateReviewValuesAgainstTemplate(
    reviewValues: TermReviewValueInput[],
    annualAssignment: IAnnualAssignment,
    termAssignment: ITermAssignment,
    isSubmit = false
  ): Promise<void> {
    if (!annualAssignment.templateVersionId) return;

    const resolvedFields = await this.resolveManagerReviewFields(
      annualAssignment,
      termAssignment,
      reviewValues,
    );
    const fieldsMap = new Map<string, ResolvedTemplateField>(
      resolvedFields.map((field) => [field.key, field]),
    );

    for (const val of reviewValues) {
      const fieldDef = fieldsMap.get(val.fieldKey);
      if (!fieldDef) {
        throw new Error(`Field "${val.fieldKey}" is not visible for Manager Review`);
      }

      if (fieldDef.editable !== true) {
        throw new Error(`Field "${fieldDef.label || val.fieldKey}" is read-only for Manager Review`);
      }

      if (isSubmit && fieldDef.required && val.valueText === undefined && val.valueNumber === undefined && val.valueDate === undefined && val.valueJson === undefined) {
        throw new Error(`Field ${fieldDef.label || val.fieldKey} is required`);
      }

      if (val.valueText) {
        const minLength = fieldDef.validationRules?.minLength as number | undefined;
        const maxLength = fieldDef.validationRules?.maxLength as number | undefined;
        if (minLength && val.valueText.length < minLength) {
          throw new Error(`Field ${fieldDef.label || val.fieldKey} must be at least ${minLength} characters`);
        }
        if (maxLength && val.valueText.length > maxLength) {
          throw new Error(`Field ${fieldDef.label || val.fieldKey} must be at most ${maxLength} characters`);
        }
      }

      if (fieldDef.type === 'select' || fieldDef.type === 'radio') {
        if (val.valueText && fieldDef.options) {
          const allowedValues = fieldDef.options.map((opt: any) => String(opt.value));
          if (!allowedValues.includes(String(val.valueText))) {
            throw new Error(`Invalid option for field ${fieldDef.label || val.fieldKey}: ${val.valueText}`);
          }
        }
      }
    }

    if (isSubmit) {
      const valueMap = new Map(reviewValues.map((value) => [value.fieldKey, value]));
      for (const fieldDef of resolvedFields) {
        if (!fieldDef.required || fieldDef.editable !== true) {
          continue;
        }
        if (fieldDef.type === 'section_divider' || fieldDef.type === 'static_text') {
          continue;
        }
        if (!this.hasMeaningfulReviewValue(valueMap.get(fieldDef.key))) {
          throw new Error(`Field ${fieldDef.label || fieldDef.key} is required`);
        }
      }
    }
  }

  private hasMeaningfulReviewValue(value?: TermReviewValueInput): boolean {
    if (!value) return false;
    if (value.valueJson !== undefined && value.valueJson !== null) {
      if (Array.isArray(value.valueJson)) return value.valueJson.length > 0;
      if (typeof value.valueJson === 'object') return Object.keys(value.valueJson).length > 0;
      return String(value.valueJson).trim().length > 0;
    }
    if (value.valueNumber !== undefined && value.valueNumber !== null) {
      return Number.isFinite(Number(value.valueNumber));
    }
    if (value.valueDate) {
      return !Number.isNaN(new Date(value.valueDate).getTime());
    }
    return String(value.valueText ?? '').trim().length > 0;
  }

  private async resolveManagerReviewFields(
    annualAssignment: IAnnualAssignment,
    termAssignment: ITermAssignment,
    reviewValues: TermReviewValueInput[],
  ): Promise<ResolvedTemplateField[]> {
    if (!annualAssignment.templateVersionId) {
      return [];
    }

    const templateService = new PmsTemplateService(this.context);
    const resolved = await templateService.resolveTemplateVersion(
      annualAssignment.templateVersionId.toString(),
      {
        role: PmsRole.MANAGER,
        workflowState: termAssignment.termState,
        hierarchyScope: 'direct-report',
        quarter: termAssignment.assessmentTermCode,
        annualAssignmentId: termAssignment.annualAssignmentId.toString(),
        termAssignmentId: termAssignment._id.toString(),
        values: this.buildReviewResolveValues(reviewValues),
      },
    );

    return resolved.sections.flatMap((section) => section.fields);
  }

  private buildReviewResolveValues(reviewValues: TermReviewValueInput[]): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const value of reviewValues) {
      if (!value.fieldKey) continue;
      if (value.valueJson !== undefined) values[value.fieldKey] = value.valueJson;
      else if (value.valueNumber !== undefined) values[value.fieldKey] = value.valueNumber;
      else if (value.valueDate !== undefined) values[value.fieldKey] = value.valueDate;
      else if (value.valueText !== undefined) values[value.fieldKey] = value.valueText;
    }
    return values;
  }

  private validateDraftInput(
    input: SaveTermReviewDraftInput,
    approvedObjectives: Array<Record<string, any>>,
    reviewConfig: TermReviewConfig,
    resolvedScore?: number,
  ): void {
    if (input.score !== undefined && Number.isNaN(Number(input.score))) {
      throw new Error('Review score must be a valid number');
    }

    if (resolvedScore !== undefined && resolvedScore < 0) {
      throw new Error('Review score cannot be negative');
    }

    const rateableObjectives = this.getRateableObjectives(approvedObjectives);

    if (this.requiresObjectiveRatings(reviewConfig) && rateableObjectives.length > 0) {
      this.validateRatingsAgainstObjectives(
        input.ratings ?? [],
        rateableObjectives,
        false,
        reviewConfig,
      );
    }
    this.validateOverallScoreAgainstTemplate(resolvedScore, reviewConfig);
  }

  private validateReviewInput(
    input: SubmitTermReviewInput,
    approvedObjectives: Array<Record<string, any>>,
    reviewConfig: TermReviewConfig,
    resolvedScore?: number,
  ): void {
    const rateableObjectives = this.getRateableObjectives(approvedObjectives);

    if (this.requiresObjectiveRatings(reviewConfig) && rateableObjectives.length > 0 && (!Array.isArray(input.ratings) || input.ratings.length === 0)) {
      throw new Error('At least one review rating is required');
    }

    if (!input.comments?.trim()) {
      throw new Error('Review comments are required');
    }

    if (resolvedScore === undefined || resolvedScore === null || Number.isNaN(Number(resolvedScore))) {
      throw new Error('Review score is required');
    }

    if (resolvedScore < 0) {
      throw new Error('Review score cannot be negative');
    }

    if (this.requiresObjectiveRatings(reviewConfig) && rateableObjectives.length > 0) {
      this.validateRatingsAgainstObjectives(
        input.ratings,
        rateableObjectives,
        true,
        reviewConfig,
      );
    }
    this.validateOverallScoreAgainstTemplate(resolvedScore, reviewConfig);
  }

  private requiresObjectiveRatings(reviewConfig: TermReviewConfig): boolean {
    return reviewConfig.objectiveRatingRule !== null;
  }

  private resolveTermReviewScoring(
    input: TermReviewBaseInput,
    reviewConfig: TermReviewConfig,
    approvedObjectives: any[],
  ): {
    overallScore: number | undefined;
    reviewValues: TermReviewValueInput[];
    scoreSnapshot: any;
  } {
    const mergedReviewValues = this.mergeComputedReviewValues(
      input.reviewValues ?? [],
      this.buildComputedReviewValues(input, reviewConfig),
    );
    const { sectionScores, sectionsSnapshot } = this.scoringService.calculateSectionScores(
      mergedReviewValues,
      reviewConfig,
      this.getRateableObjectives(approvedObjectives),
      input.ratings ?? [],
    );
    const computedOverallScore = this.scoringService.calculateOverallScore(sectionScores, reviewConfig);
    const manualScore = input.score === undefined || input.score === null
      ? undefined
      : Number(input.score);

    const overallScore = computedOverallScore ?? manualScore;
    const scoreSnapshot = {
      overallScore,
      calculatedScore: computedOverallScore,
      manualScore,
      sections: sectionsSnapshot,
      calculatedAt: new Date(),
    };

    return {
      overallScore,
      reviewValues: mergedReviewValues,
      scoreSnapshot,
    };
  }

  private validateRatingsAgainstObjectives(
    ratings: TermReviewRatingInput[],
    approvedObjectives: Array<Record<string, any>>,
    requireAllObjectives: boolean,
    reviewConfig: TermReviewConfig,
  ): void {
    const approvedObjectiveIds = new Set(
      approvedObjectives.map((objective) => objective._id.toString()),
    );
    const ratedObjectiveIds = new Set<string>();

    for (const rating of ratings) {
      if (!rating.objectiveId || !Types.ObjectId.isValid(rating.objectiveId)) {
        throw new Error('Each review rating must reference a valid approved objective');
      }

      if (!approvedObjectiveIds.has(rating.objectiveId)) {
        throw new Error('Quarter review can include ratings only for approved objectives');
      }

      if (ratedObjectiveIds.has(rating.objectiveId)) {
        throw new Error('Duplicate objective rating is not allowed');
      }

      if (rating.rating === undefined || rating.rating === null || Number.isNaN(Number(rating.rating))) {
        throw new Error('Each review rating must have a valid numeric rating');
      }

      if (Number(rating.rating) < 0) {
        throw new Error('Objective rating cannot be negative');
      }

      this.validateObjectiveRatingAgainstTemplate(Number(rating.rating), reviewConfig);

      ratedObjectiveIds.add(rating.objectiveId);
    }

    if (requireAllObjectives && ratedObjectiveIds.size !== approvedObjectiveIds.size) {
      throw new Error('All predefined scoring objectives must be rated before quarter review submission');
    }
  }

  private getRateableObjectives<T extends Record<string, any>>(approvedObjectives: T[]): T[] {
    return approvedObjectives.filter((objective) => objective.source === ObjectiveSource.PREDEFINED);
  }

  private validateObjectiveRatingAgainstTemplate(
    rating: number,
    reviewConfig: TermReviewConfig,
  ): void {
    const rule = reviewConfig.objectiveRatingRule;
    if (!rule) return;

    if (rating < rule.minScore || rating > rule.maxScore) {
      throw new Error(
        `Objective rating must be between ${rule.minScore} and ${rule.maxScore} as configured in the PMS template`,
      );
    }

    if (rule.allowedScores && rule.allowedScores.length > 0 && !rule.allowedScores.includes(rating)) {
      throw new Error(
        `Objective rating must match one of the template-configured scores: ${rule.allowedScores.join(', ')}`,
      );
    }
  }

  private validateOverallScoreAgainstTemplate(
    score: number | undefined,
    reviewConfig: TermReviewConfig,
  ): void {
    if (score === undefined || score === null) {
      return;
    }

    if (reviewConfig.overallScoreMax !== null && score > reviewConfig.overallScoreMax) {
      throw new Error(
        `Quarter score cannot exceed ${reviewConfig.overallScoreMax} as configured in the PMS template`,
      );
    }
  }

  private normalizeRatings(ratings: TermReviewRatingInput[]) {
    return ratings.map((rating) => ({
      objectiveId: rating.objectiveId && Types.ObjectId.isValid(rating.objectiveId)
        ? new Types.ObjectId(rating.objectiveId)
        : undefined,
      rating: rating.rating === undefined || rating.rating === null
        ? undefined
        : Number(rating.rating),
      comments: rating.comments?.trim(),
    }));
  }

  private normalizeAttachments(attachments: TermReviewAttachmentInput[]) {
    return attachments.map((attachment) => ({
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      documentId: attachment.documentId,
      uploadedBy: attachment.uploadedBy && Types.ObjectId.isValid(attachment.uploadedBy)
        ? new Types.ObjectId(attachment.uploadedBy)
        : undefined,
      uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : undefined,
    }));
  }

  private async persistTermReviewValues(
    termReview: ITermReview,
    termAssignment: ITermAssignment,
    input: TermReviewBaseInput,
    isSubmitted: boolean,
    preservedValues: Array<Record<string, unknown>> = [],
  ): Promise<void> {
    const actor = this.requireActor();
    const actorUserId = new Types.ObjectId(actor.actorId);
    const effectiveAt = isSubmitted
      ? (termReview.submittedAt ?? new Date())
      : new Date();
    const baseValue = {
      termReviewId: termReview._id,
      termAssignmentId: termAssignment._id,
      annualAssignmentId: termAssignment.annualAssignmentId,
      cycleId: termAssignment.cycleId,
      employeeId: termAssignment.employeeId,
      roleCode: 'MANAGER',
      actorUserId,
      workflowStage: 'MANAGER_REVIEW',
      valueStatus: isSubmitted ? 'ACTIVE' : 'DRAFT',
      submittedAt: isSubmitted ? effectiveAt : undefined,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };

    const valuesToCreate = [
      ...(input.comments?.trim()
        ? [{
          ...baseValue,
          fieldKey: 'manager_comments',
          sectionKey: 'manager_quarter_review',
          valueText: input.comments.trim(),
        }]
        : []),
      ...(input.score !== undefined && input.score !== null
        ? [{
          ...baseValue,
          fieldKey: 'manager_score',
          sectionKey: 'manager_quarter_review',
          valueNumber: Number(input.score),
        }]
        : []),
      ...(input.overallRating?.trim()
        ? [{
          ...baseValue,
          fieldKey: 'manager_rating',
          sectionKey: 'manager_quarter_review',
          valueText: input.overallRating.trim(),
        }]
        : []),
      ...(input.recommendation?.trim()
        ? [{
          ...baseValue,
          fieldKey: 'manager_recommendation',
          sectionKey: 'manager_quarter_review',
          valueText: input.recommendation.trim(),
        }]
        : []),
      ...(input.achievements?.trim()
        ? [{
          ...baseValue,
          fieldKey: 'manager_achievements',
          sectionKey: 'manager_quarter_review',
          valueText: input.achievements.trim(),
        }]
        : []),
      ...(input.developmentObservations?.trim()
        ? [{
          ...baseValue,
          fieldKey: 'manager_development_observations',
          sectionKey: 'manager_quarter_review',
          valueText: input.developmentObservations.trim(),
        }]
        : []),
      ...this.normalizeRatingValues(input.ratings ?? [], baseValue),
      ...this.normalizeExplicitReviewValues(
        input.reviewValues ?? [],
        actorUserId,
        effectiveAt,
        baseValue,
        isSubmitted,
      ),
      ...preservedValues,
    ];

    await TermReviewValue.deleteMany({ termReviewId: termReview._id });
    if (valuesToCreate.length > 0) {
      await TermReviewValue.insertMany(valuesToCreate);
    }
  }

  private normalizeRatingValues(
    ratings: TermReviewRatingInput[],
    baseValue: Record<string, unknown>,
  ) {
    return ratings.map((rating, index) => ({
      ...baseValue,
      fieldKey: 'objective_rating',
      sectionKey: 'manager_quarter_review',
      valueNumber: rating.rating === undefined || rating.rating === null
        ? undefined
        : Number(rating.rating),
      valueText: rating.comments?.trim(),
      valueJson: {
        objectiveId: rating.objectiveId,
        rating: rating.rating,
        comments: rating.comments?.trim(),
        displayOrder: index + 1,
      },
    }));
  }

  private normalizeExplicitReviewValues(
    reviewValues: TermReviewValueInput[],
    defaultActorUserId: Types.ObjectId,
    effectiveAt: Date,
    baseValue: Record<string, unknown>,
    isSubmitted: boolean,
  ) {
    return reviewValues.map((reviewValue) => ({
      ...baseValue,
      templateFieldId: reviewValue.templateFieldId,
      fieldKey: reviewValue.fieldKey,
      sectionKey: reviewValue.sectionKey,
      roleCode: reviewValue.roleCode ?? 'MANAGER',
      actorUserId: reviewValue.actorUserId && Types.ObjectId.isValid(reviewValue.actorUserId)
        ? new Types.ObjectId(reviewValue.actorUserId)
        : defaultActorUserId,
      workflowStage: reviewValue.workflowStage ?? 'MANAGER_REVIEW',
      valueJson: reviewValue.valueJson,
      valueText: reviewValue.valueText,
      valueNumber: reviewValue.valueNumber,
      valueDate: reviewValue.valueDate ? new Date(reviewValue.valueDate) : undefined,
      valueStatus: reviewValue.valueStatus ?? (isSubmitted ? 'ACTIVE' : 'DRAFT'),
      submittedAt: isSubmitted ? effectiveAt : undefined,
    }));
  }

  private async getPreservedReadOnlyTermReviewValues(
    termReviewId: Types.ObjectId,
    nextValues: TermReviewValueInput[],
    resolvedFields: ResolvedTemplateField[],
  ): Promise<Array<Record<string, unknown>>> {
    const resolvedFieldMap = new Map(resolvedFields.map((field) => [field.key, field]));
    const nextKeys = new Set(nextValues.map((value) => `${value.sectionKey}::${value.fieldKey}`));
    const existingValues = await TermReviewValue.find({
      termReviewId,
      isDeleted: false,
    }).lean();

    return existingValues
      .filter((value) => {
        if (!value.fieldKey || !value.sectionKey) return false;
        const resolvedField = resolvedFieldMap.get(value.fieldKey);
        if (resolvedField?.editable === true) return false;
        return !nextKeys.has(`${value.sectionKey}::${value.fieldKey}`);
      })
      .map((value) => {
        const { _id, createdAt, updatedAt, __v, ...preservedValue } = value as Record<string, unknown>;
        return preservedValue;
      });
  }

  private buildComputedReviewValues(
    input: TermReviewBaseInput,
    reviewConfig: TermReviewConfig,
  ): TermReviewValueInput[] {
    if (reviewConfig.sections.length === 0) {
      return [];
    }

    const numericValueContext = this.buildReviewNumericContext(input);
    const computedValues: TermReviewValueInput[] = [];

    for (const section of reviewConfig.sections) {
      for (const field of section.scoringFields) {
        if (field.scoreType === 'FIXED' && Number.isFinite(field.fixedScore)) {
          numericValueContext[field.fieldKey] = Number(field.fixedScore);
          computedValues.push({
            fieldKey: field.fieldKey,
            sectionKey: field.sectionKey,
            valueNumber: Number(field.fixedScore),
            workflowStage: 'MANAGER_REVIEW',
            roleCode: 'MANAGER',
          });
          continue;
        }

        if (
          (field.scoreType === 'FORMULA' || field.fieldType === PmsTemplateFieldType.FORMULA) &&
          field.formula?.trim()
        ) {
          const formulaValue = this.scoringService.evaluateFormulaExpression(field.formula, numericValueContext);
          if (formulaValue !== undefined) {
            const normalizedValue = field.maxScore && formulaValue > field.maxScore
              ? field.maxScore
              : formulaValue;
            numericValueContext[field.fieldKey] = normalizedValue;
            computedValues.push({
              fieldKey: field.fieldKey,
              sectionKey: field.sectionKey,
              valueNumber: normalizedValue,
              workflowStage: 'MANAGER_REVIEW',
              roleCode: 'MANAGER',
            });
          }
        }
      }
    }

    return computedValues;
  }

  private buildReviewNumericContext(input: TermReviewBaseInput): Record<string, number> {
    const context: Record<string, number> = {};

    for (const value of input.reviewValues ?? []) {
      if (
        value.fieldKey?.trim() &&
        value.valueNumber !== undefined &&
        value.valueNumber !== null &&
        Number.isFinite(Number(value.valueNumber))
      ) {
        context[value.fieldKey] = Number(value.valueNumber);
      }
    }

    const ratingNumbers = (input.ratings ?? [])
      .map((rating) => Number(rating.rating))
      .filter((value) => Number.isFinite(value));

    if (ratingNumbers.length > 0) {
      const sum = ratingNumbers.reduce((total, value) => total + value, 0);
      context.OBJECTIVE_RATING_SUM = sum;
      context.OBJECTIVE_RATING_AVG = sum / ratingNumbers.length;
      context.OBJECTIVE_RATING_MAX = Math.max(...ratingNumbers);
      context.OBJECTIVE_RATING_MIN = Math.min(...ratingNumbers);
      context.OBJECTIVE_COUNT = ratingNumbers.length;
    }

    return context;
  }

  evaluateFormulaExpression(
    formula: string,
    context: Record<string, number>,
  ): number | undefined {
    const substituted = formula.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => {
      const value = context[key];
      return Number.isFinite(value) ? String(value) : '0';
    });

    if (/[A-Za-z_]/.test(substituted)) {
      return undefined;
    }

    if (!/^[0-9+\-*/().\s]+$/.test(substituted)) {
      return undefined;
    }

    try {
      const result = Function(`"use strict"; return (${substituted});`)();
      return Number.isFinite(Number(result)) ? Number(result) : undefined;
    } catch {
      return undefined;
    }
  }

  private mergeComputedReviewValues(
    reviewValues: TermReviewValueInput[],
    computedReviewValues: TermReviewValueInput[],
  ): TermReviewValueInput[] {
    const merged = new Map<string, TermReviewValueInput>();

    for (const value of reviewValues) {
      merged.set(`${value.sectionKey}::${value.fieldKey}`, value);
    }

    for (const value of computedReviewValues) {
      const key = `${value.sectionKey}::${value.fieldKey}`;
      merged.set(key, {
        ...merged.get(key),
        ...value,
      });
    }

    return Array.from(merged.values());
  }

  private getOptionScore(
    selectedValue: string,
    field: any,
    row?: any,
  ): number | undefined {
    if (!selectedValue) return undefined;

    // 1. row options override
    if (row && Array.isArray(row.options)) {
      const match = row.options.find((opt: any) => opt.value === selectedValue);
      if (match && match.score !== undefined && match.score !== null) {
        return Number(match.score);
      }
    }

    // 2. field.matrixConfig.options
    if (field.matrixConfig && Array.isArray(field.matrixConfig.options)) {
      const match = field.matrixConfig.options.find((opt: any) => opt.value === selectedValue);
      if (match && match.score !== undefined && match.score !== null) {
        return Number(match.score);
      }
    }

    // 3. field.options
    if (Array.isArray(field.options)) {
      const match = field.options.find((opt: any) => opt.value === selectedValue);
      if (match && match.score !== undefined && match.score !== null) {
        return Number(match.score);
      }
    }

    // 4. legacy scoringConfig.optionScores
    if (field.scoringConfig && Array.isArray(field.scoringConfig.optionScores)) {
      const rowKey = row?.key ?? row?.id;
      const match = field.scoringConfig.optionScores.find(
        (opt: any) =>
          opt.optionValue === selectedValue ||
          opt.value === selectedValue ||
          (rowKey && opt.optionValue === `${rowKey}:${selectedValue}`),
      );
      if (match && match.score !== undefined && match.score !== null) {
        return Number(match.score);
      }
    }

    return undefined;
  }

  private getMatrixSelectionScore(
    selectedValue: string | string[],
    field: any,
    row: any,
    rowMaxScore: number,
  ): number {
    const selectedValues = Array.isArray(selectedValue)
      ? (field.matrixConfig?.selectionControl === 'checkbox' ? selectedValue : selectedValue.slice(0, 1)).filter(Boolean)
      : [selectedValue].filter(Boolean);
    const scores = selectedValues
      .map((value) => this.getOptionScore(value, field, row) ?? 0)
      .filter((score) => Number.isFinite(score));

    if (scores.length === 0) return 0;
    if (!Array.isArray(selectedValue) || field.matrixConfig?.selectionControl !== 'checkbox') return scores[0];

    switch (field.matrixConfig?.multiSelectScoring ?? 'MAX') {
      case 'AVERAGE':
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
      case 'SUM_CAPPED':
        return Math.min(scores.reduce((sum, score) => sum + score, 0), rowMaxScore);
      case 'MAX':
      default:
        return Math.max(...scores);
    }
  }

  calculateSectionScores(
    reviewValues: TermReviewValueInput[],
    reviewConfig: TermReviewConfig,
    approvedObjectives: any[],
    ratings: TermReviewRatingInput[],
  ): {
    sectionScores: Array<{ sectionKey: string; score: number; weightage: number }>;
    sectionsSnapshot: any[];
  } {
    const valueMap = new Map(
      reviewValues
        .filter((value) => value.fieldKey?.trim() && value.sectionKey?.trim())
        .map((value) => [`${value.sectionKey}::${value.fieldKey}`, value]),
    );

    const sectionScores: Array<{ sectionKey: string; score: number; weightage: number }> = [];
    const sectionsSnapshot: any[] = [];

    for (const section of reviewConfig.sections) {
      let sectionScore = 0;
      let sectionDetails: any = {};

      if (section.sectionType === PmsTemplateSectionType.OBJECTIVES) {
        const buckets = section.objectiveBuckets ?? [];
        const objectivesByBucket = new Map<string, any[]>();

        for (const obj of this.getRateableObjectives(approvedObjectives)) {
          let bucketKey = 'employee_dynamic';
          if (obj.source === ObjectiveSource.PREDEFINED) bucketKey = 'template_predefined';

          const matchedBucket = buckets.find(
            (b) =>
              b.bucketKey === bucketKey ||
              (obj.source === ObjectiveSource.PREDEFINED && b.source === 'TEMPLATE_PREDEFINED'),
          );
          const actualBucketKey = matchedBucket ? matchedBucket.bucketKey : bucketKey;

          if (!objectivesByBucket.has(actualBucketKey)) {
            objectivesByBucket.set(actualBucketKey, []);
          }
          objectivesByBucket.get(actualBucketKey)!.push(obj);
        }

        const activeBuckets = buckets.filter((b) => {
          const list = objectivesByBucket.get(b.bucketKey) ?? [];
          return list.length > 0;
        });

        const sumOfActiveBucketWeightages = activeBuckets.reduce(
          (sum, b) => sum + Number(b.bucketWeightage ?? 0),
          0,
        );

        const bucketSnapshots: any[] = [];
        let runningSectionScore = 0;

        for (const bucket of activeBuckets) {
          const adjustedBucketWeight = sumOfActiveBucketWeightages > 0
            ? (Number(bucket.bucketWeightage ?? 0) / sumOfActiveBucketWeightages) * 100
            : 0;

          const bucketObjs = objectivesByBucket.get(bucket.bucketKey) ?? [];
          let objWeights: number[] = [];

          if (bucket.rowWeightMode === 'EQUAL_DISTRIBUTION') {
            objWeights = bucketObjs.map(() => 100 / bucketObjs.length);
          } else {
            const hasAllWeights = bucketObjs.every(
              (o) => o.weightage !== undefined && o.weightage !== null && Number(o.weightage) > 0,
            );
            if (hasAllWeights) {
              objWeights = bucketObjs.map((o) => Number(o.weightage));
            } else {
              objWeights = bucketObjs.map(() => 100 / bucketObjs.length);
            }
          }

          const totalWeightSum = objWeights.reduce((sum, w) => sum + w, 0);
          const normalizedWeights = objWeights.map((w) =>
            totalWeightSum > 0 ? (w / totalWeightSum) * 100 : 0,
          );

          let bucketScoreSum = 0;
          const objsSnapshot: any[] = [];

          bucketObjs.forEach((obj, idx) => {
            const rowWeight = normalizedWeights[idx];
            const ratingMatch = ratings.find(
              (r) => r.objectiveId?.toString() === obj._id.toString(),
            );
            const ratingValue = ratingMatch && ratingMatch.rating !== undefined && ratingMatch.rating !== null
              ? Number(ratingMatch.rating)
              : 0;

            const maxRatingScore = reviewConfig.objectiveRatingRule?.maxScore ?? 10;
            const normalizedRatingScore = maxRatingScore > 0
              ? (ratingValue / maxRatingScore) * 100
              : 0;

            const objContribution = (rowWeight / 100) * normalizedRatingScore;
            bucketScoreSum += objContribution;

            objsSnapshot.push({
              objectiveId: obj._id.toString(),
              title: obj.title,
              weightage: obj.weightage,
              rowWeight,
              rating: ratingValue,
              normalizedRatingScore,
              contribution: objContribution,
            });
          });

          const bucketContribution = (adjustedBucketWeight / 100) * bucketScoreSum;
          runningSectionScore += bucketContribution;

          bucketSnapshots.push({
            bucketKey: bucket.bucketKey,
            label: bucket.label,
            bucketWeightage: bucket.bucketWeightage,
            adjustedBucketWeight,
            rowWeightMode: bucket.rowWeightMode,
            score: bucketScoreSum,
            objectives: objsSnapshot,
          });
        }

        sectionScore = runningSectionScore;
        sectionDetails = { activeBuckets: bucketSnapshots };
      } else {
        const fieldScores: Array<{ score: number; weightage: number }> = [];
        const fieldsSnapshot: any[] = [];

        for (const field of section.scoringFields) {
          const matchedValue = valueMap.get(`${field.sectionKey}::${field.fieldKey}`);
          let resolvedRawScore: number | undefined;
          let maxScore = field.maxScore ?? 100;
          let extraDetails: any = {};

          if (field.fieldType === 'MATRIX') {
            const matrixConfig = field.matrixConfig;
            const rows = matrixConfig?.rows ?? [];
            let matrixScoreSum = 0;
            const rowsSnapshot: any[] = [];

            let rowWeights: number[] = [];
            const hasAllWeights = rows.every(
              (r: any) => r.weightage !== undefined && r.weightage !== null && Number(r.weightage) > 0,
            );
            if (hasAllWeights) {
              rowWeights = rows.map((r: any) => Number(r.weightage));
            } else {
              rowWeights = rows.map(() => 100 / rows.length);
            }

            const totalRowWeightSum = rowWeights.reduce((sum, w) => sum + w, 0);
            const normalizedRowWeights = rowWeights.map((w) =>
              totalRowWeightSum > 0 ? (w / totalRowWeightSum) * 100 : 0,
            );

            let valueJsonMap: Record<string, any> = {};
            if (matchedValue?.valueJson) {
              if (typeof matchedValue.valueJson === 'string') {
                try {
                  valueJsonMap = JSON.parse(matchedValue.valueJson);
                } catch {
                  valueJsonMap = {};
                }
              } else if (typeof matchedValue.valueJson === 'object') {
                valueJsonMap = matchedValue.valueJson as Record<string, any>;
              }
            }

            rows.forEach((row: any, idx: number) => {
              const rowWeight = normalizedRowWeights[idx];
              const selectedValue = valueJsonMap[row.key] || valueJsonMap.values?.[row.key];
              let rowMaxScore = maxScore;

              let optMax = 0;
              const allRowOpts = row.options || field.matrixConfig?.options || field.options || [];
              allRowOpts.forEach((o: any) => {
                const s = Number(o.score);
                if (Number.isFinite(s) && s > optMax) optMax = s;
              });
              if (optMax > 0) {
                rowMaxScore = optMax;
              }
              const rowScore = selectedValue
                ? this.getMatrixSelectionScore(selectedValue, field, row, rowMaxScore)
                : 0;

              const normalizedRowScore = rowMaxScore > 0
                ? (rowScore / rowMaxScore) * 100
                : 0;

              const rowContribution = (rowWeight / 100) * normalizedRowScore;
              matrixScoreSum += rowContribution;

              rowsSnapshot.push({
                key: row.key,
                label: row.label,
                weightage: row.weightage,
                rowWeight,
                selectedValue,
                score: rowScore,
                maxScore: rowMaxScore,
                normalizedRowScore,
                contribution: rowContribution,
              });
            });

            resolvedRawScore = matrixScoreSum;
            maxScore = 100;
            extraDetails = { rows: rowsSnapshot };
          } else if (
            ['DROPDOWN', 'RADIO', 'CHECKBOX_GROUP', 'MULTISELECT'].includes(field.fieldType) ||
            field.scoreType === 'OPTION_BASED'
          ) {
            const selectedValue =
              matchedValue?.valueText ||
              (typeof matchedValue?.valueJson === 'string' ? matchedValue.valueJson : undefined);
            if (selectedValue) {
              resolvedRawScore = this.getOptionScore(selectedValue, field);
            }
          } else if (field.scoreType === 'BOOLEAN' || field.fieldType === 'CHECKBOX') {
            const isChecked =
              matchedValue?.valueJson === true ||
              matchedValue?.valueJson === 'true' ||
              matchedValue?.valueText === 'true';
            const checkedScore =
              field.scoringConfig?.checkedScore !== undefined
                ? Number(field.scoringConfig.checkedScore)
                : undefined;
            const uncheckedScore =
              field.scoringConfig?.uncheckedScore !== undefined
                ? Number(field.scoringConfig.uncheckedScore)
                : undefined;

            if (isChecked) {
              resolvedRawScore = checkedScore !== undefined ? checkedScore : maxScore;
            } else {
              resolvedRawScore = uncheckedScore !== undefined ? uncheckedScore : 0;
            }
          } else {
            if (matchedValue?.valueNumber !== undefined && matchedValue?.valueNumber !== null) {
              resolvedRawScore = Number(matchedValue.valueNumber);
            }
          }

          if (resolvedRawScore !== undefined && Number.isFinite(resolvedRawScore)) {
            const normalizedFieldScore = maxScore > 0 ? (resolvedRawScore / maxScore) * 100 : 0;
            fieldScores.push({ score: normalizedFieldScore, weightage: field.weightage });

            fieldsSnapshot.push({
              fieldKey: field.fieldKey,
              fieldType: field.fieldType,
              fieldCategory: field.fieldCategory,
              rawScore: resolvedRawScore,
              maxScore,
              normalizedScore: normalizedFieldScore,
              weightage: field.weightage,
              value: matchedValue?.valueNumber ?? matchedValue?.valueText ?? matchedValue?.valueJson,
              ...extraDetails,
            });
          }
        }

        if (fieldScores.length > 0) {
          let score = 0;
          switch (section.aggregationMethod) {
            case 'SUM':
              score = fieldScores.reduce((total, item) => total + item.score, 0);
              break;
            case 'MAX_FIELD':
              score = Math.max(...fieldScores.map((item) => item.score));
              break;
            case 'SIMPLE_AVERAGE':
              score = fieldScores.reduce((total, item) => total + item.score, 0) / fieldScores.length;
              break;
            case 'WEIGHTED_AVERAGE':
            default: {
              const totalWeight = fieldScores.reduce((total, item) => total + item.weightage, 0);
              score = totalWeight > 0
                ? fieldScores.reduce((total, item) => total + (item.score * item.weightage), 0) / totalWeight
                : fieldScores.reduce((total, item) => total + item.score, 0) / fieldScores.length;
              break;
            }
          }

          sectionScore = score;
          sectionDetails = { fields: fieldsSnapshot };
        }
      }

      const normalizedScore =
        section.maxSectionScore !== null && sectionScore > section.maxSectionScore
          ? section.maxSectionScore
          : sectionScore;

      sectionScores.push({
        sectionKey: section.sectionKey,
        score: normalizedScore,
        weightage: section.weightage,
      });

      sectionsSnapshot.push({
        sectionKey: section.sectionKey,
        sectionType: section.sectionType,
        score: normalizedScore,
        weightage: section.weightage,
        maxSectionScore: section.maxSectionScore,
        aggregationMethod: section.aggregationMethod,
        ...sectionDetails,
      });
    }

    return { sectionScores, sectionsSnapshot };
  }

  calculateOverallScore(
    sectionScores: Array<{ sectionKey: string; score: number; weightage: number }>,
    reviewConfig: TermReviewConfig,
  ): number | undefined {
    if (sectionScores.length === 0) {
      return undefined;
    }

    const totalWeight = sectionScores.reduce((total, item) => total + item.weightage, 0);
    const rawScore = totalWeight > 0
      ? sectionScores.reduce((total, item) => total + (item.score * item.weightage), 0) / totalWeight
      : sectionScores.reduce((total, item) => total + item.score, 0) / sectionScores.length;

    if (reviewConfig.overallScoreMax !== null && rawScore > reviewConfig.overallScoreMax) {
      return reviewConfig.overallScoreMax;
    }

    return rawScore;
  }

  private async syncTermAssignmentReviewSummary(
    termAssignment: ITermAssignment,
    termReview: ITermReview,
  ): Promise<void> {
    termAssignment.termScore = termReview.score;
    termAssignment.termRating = termReview.overallRating;
    termAssignment.termSummary = {
      comments: termReview.comments,
      achievements: termReview.achievements,
      developmentObservations: termReview.developmentObservations,
      recommendation: termReview.recommendation,
      submittedAt: termReview.submittedAt,
      finalizedAt: termReview.finalizedAt,
      reviewStatus: termReview.reviewStatus,
      termReviewId: termReview._id,
    };
    termAssignment.updatedBy = this.actorIdObject();
    termAssignment.version += 1;
    await termAssignment.save();
  }

  private async finalizeSubmittedTermReview(
    termAssignment: ITermAssignment,
    termReview: ITermReview,
    auditAction: string,
  ): Promise<ITermAssignment> {
    const updatedTermAssignment = await transitionTermAssignmentState(
      termAssignment._id.toString(),
      TermWorkflowState.TERM_FINALIZED,
      this.requireActor(),
    );

    const finalizedReview = await TermReview.findOneAndUpdate(
      { termAssignmentId: termAssignment._id, isDeleted: false },
      {
        $set: {
          finalizedAt: new Date(),
          reviewStatus: TermReviewStatus.FINALIZED,
          updatedBy: this.actorIdObject(),
        },
        $inc: { version: 1 },
      },
      { new: true },
    );

    if (finalizedReview) {
      await this.syncTermAssignmentReviewSummary(updatedTermAssignment, finalizedReview);
      await this.createQuarterFinalizationSnapshot(updatedTermAssignment, finalizedReview);
    } else {
      await this.syncTermAssignmentReviewSummary(updatedTermAssignment, termReview);
      await this.createQuarterFinalizationSnapshot(updatedTermAssignment, termReview);
    }

    await this.audit(
      auditAction,
      'TERM_ASSIGNMENT',
      updatedTermAssignment._id.toString(),
      { termState: termAssignment.termState },
      { termState: updatedTermAssignment.termState },
    );

    return updatedTermAssignment;
  }

  private async createQuarterFinalizationSnapshot(
    termAssignment: ITermAssignment,
    termReview: ITermReview,
  ): Promise<void> {
    const annualAssignment = await AnnualAssignment.findById(termAssignment.annualAssignmentId).lean();
    if (!annualAssignment?.templateVersionId || !termAssignment.cycleId) {
      return;
    }

    const [approvedObjectives, reviewValues] = await Promise.all([
      Objective.find({
        termAssignmentId: termAssignment._id,
        isDeleted: false,
        status: ObjectiveStatus.OBJECTIVE_APPROVED,
      })
        .sort({ objectiveNo: 1, createdAt: 1 })
        .lean(),
      TermReviewValue.find({
        termReviewId: termReview._id,
        isDeleted: false,
      })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const snapshotPayload = {
      annualAssignmentId: annualAssignment._id.toString(),
      cycleId: annualAssignment.cycleId?.toString?.() ?? termAssignment.cycleId.toString(),
      employeeId: annualAssignment.employeeId.toString(),
      templateVersionId: annualAssignment.templateVersionId.toString(),
      termSnapshots: {
        [termAssignment.assessmentTermCode]: {
          termAssignment: termAssignment.toObject(),
          termReview: termReview.toObject(),
          approvedObjectives,
          reviewValues,
        },
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
      termSnapshots: snapshotPayload.termSnapshots,
      snapshotHash,
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });
  }

  private async createQuarterReopenCorrectionLayer(
    termAssignment: ITermAssignment,
    termReview: Record<string, any> | null,
    reason: string,
  ): Promise<void> {
    await CorrectionLayer.create({
      entityType: 'TERM_ASSIGNMENT',
      entityId: termAssignment._id,
      fieldKey: 'REOPEN_QUARTER',
      originalValue: {
        termState: termAssignment.termState,
        termScore: termAssignment.termScore,
        termRating: termAssignment.termRating,
        termSummary: termAssignment.termSummary,
        reviewStatus: termReview?.reviewStatus,
        finalizedAt: termReview?.finalizedAt,
      },
      correctedValue: {
        termState: TermWorkflowState.REOPENED_BY_ADMIN,
        reviewStatus: TermReviewStatus.MANAGER_REVIEW_SUBMITTED,
      },
      correctionReason: reason,
      correctedBy: this.actorIdObject(),
      correctedAt: new Date(),
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });
  }

  private async getApprovedObjectives(termAssignmentId: Types.ObjectId) {
    return Objective.find({
      termAssignmentId,
      isDeleted: false,
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
    })
      .sort({ objectiveNo: 1, createdAt: 1 })
      .lean();
  }

  private async getTermReviewConfig(
    annualAssignment: IAnnualAssignment | Record<string, any>,
    assessmentTermCode: AssessmentTermCodeType,
  ): Promise<TermReviewConfig> {
    const templateVersionId = annualAssignment.templateVersionId?.toString?.();
    if (!templateVersionId) {
      return this.defaultTermReviewConfig();
    }

    const templateVersion = await PmsTemplateVersion.findById(templateVersionId)
      .select('sections scoringConfig')
      .lean();

    if (!templateVersion) {
      return this.defaultTermReviewConfig();
    }

    const applicableSections = (templateVersion.sections ?? []).filter((section) =>
      this.isTermReviewSectionInScope(section, assessmentTermCode),
    );

    if (applicableSections.length === 0) {
      return this.defaultTermReviewConfig();
    }

    const objectiveScoringSections = applicableSections.filter(
      (section) =>
        section.sectionType === PmsTemplateSectionType.OBJECTIVES &&
        section.sectionScoringConfig?.participatesInScoring === true,
    );

    const objectiveScoringFields = objectiveScoringSections
      .filter(
        (section) =>
          section.sectionType === PmsTemplateSectionType.OBJECTIVES &&
          section.sectionScoringConfig?.participatesInScoring === true,
      )
      .flatMap((section) =>
        (section.fields ?? []).filter((field) => this.isManagerEditableReviewField(field)),
      );

    const objectiveRatingField =
      objectiveScoringFields.find(
        (field) =>
          field.scoringConfig?.participatesInScoring === true &&
          [
            PmsTemplateFieldType.RATING_SCALE,
            PmsTemplateFieldType.WEIGHTED_SCORE,
            PmsTemplateFieldType.NUMERIC_INPUT,
            PmsTemplateFieldType.PERCENTAGE,
          ].includes(field.fieldType as never),
      ) ??
      objectiveScoringFields.find((field) =>
        [
          PmsTemplateFieldType.RATING_SCALE,
          PmsTemplateFieldType.WEIGHTED_SCORE,
          PmsTemplateFieldType.NUMERIC_INPUT,
          PmsTemplateFieldType.PERCENTAGE,
        ].includes(field.fieldType as never),
      ) ??
      null;

    const inferredObjectiveMaxScore =
      objectiveScoringSections
        .map((section) => Number(section.sectionScoringConfig?.maxSectionScore))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => right - left)[0] ?? 100;

    const objectiveRatingRule = objectiveRatingField
      ? this.buildRatingRuleFromTemplateField(objectiveRatingField)
      : objectiveScoringSections.length > 0
        ? {
            scoreType: 'MANUAL',
            minScore: 0,
            maxScore: inferredObjectiveMaxScore,
            allowedScores: [0, 0.25, 0.5, 0.75, 1].map(
              (ratio) => Math.round(inferredObjectiveMaxScore * ratio * 100) / 100,
            ),
          }
        : null;

    const overallScoreMax =
      applicableSections
        .map((section) => Number(section.sectionScoringConfig?.maxSectionScore))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => right - left)[0] ??
      objectiveRatingRule?.maxScore ??
      null;

    const sections = applicableSections
      .map((section) => ({
        sectionKey: section.sectionKey,
        sectionType: section.sectionType,
        weightage: Number(section.sectionScoringConfig?.weightage ?? 0),
        aggregationMethod: (
          section.sectionScoringConfig?.aggregationMethod as TermReviewSectionConfig['aggregationMethod']
        ) ?? 'WEIGHTED_AVERAGE',
        maxSectionScore: Number.isFinite(Number(section.sectionScoringConfig?.maxSectionScore))
          ? Number(section.sectionScoringConfig?.maxSectionScore)
          : null,
        scoringPolicy: (section.sectionScoringConfig as Record<string, unknown> | undefined)?.scoringPolicy,
        objectiveBuckets: section.objectiveBuckets,
        scoringFields: (section.fields ?? [])
          .filter(
            (field) =>
              this.isManagerEditableReviewField(field) &&
              (field.scoringConfig?.participatesInScoring === true || field.fieldCategory === 'SCORING'),
          )
          .map((field) => ({
            fieldKey: field.fieldKey,
            sectionKey: section.sectionKey,
            fieldType: String(field.fieldType),
            scoreType: String(field.scoringConfig?.scoreType ?? 'MANUAL'),
            weightage: Number(field.scoringConfig?.weight ?? field.scoringConfig?.weightage ?? 0),
            formula: typeof field.scoringConfig?.formula === 'string' ? field.scoringConfig.formula : undefined,
            fixedScore: Number.isFinite(Number(field.scoringConfig?.fixedScore))
              ? Number(field.scoringConfig?.fixedScore)
              : undefined,
            maxScore: Number.isFinite(Number(field.scoringConfig?.maxScore))
              ? Number(field.scoringConfig?.maxScore)
              : undefined,
            options: field.options,
            matrixConfig: field.matrixConfig,
            fieldCategory: field.fieldCategory,
            semanticRole: field.semanticRole,
            scoringConfig: field.scoringConfig,
            scoringPolicy: (field.scoringConfig as Record<string, unknown> | undefined)?.scoringPolicy,
            conditionalScoring: (field.scoringConfig as Record<string, unknown> | undefined)?.conditionalScoring,
          })),
      }))
      .filter((section) => section.scoringFields.length > 0 || section.sectionType === PmsTemplateSectionType.OBJECTIVES);

    return {
      objectiveRatingRule,
      overallScoreMax,
      scoringPolicy: (templateVersion.scoringConfig as Record<string, unknown> | undefined)?.scoringPolicy as any,
      sections,
    };
  }

  private defaultTermReviewConfig(): TermReviewConfig {
    return {
      objectiveRatingRule: null,
      overallScoreMax: null,
      scoringPolicy: undefined,
      sections: [],
    };
  }

  private isTermReviewSectionInScope(
    section: ITemplateSection,
    assessmentTermCode: AssessmentTermCodeType,
  ): boolean {
    const allowedTypes: string[] = [
      PmsTemplateSectionType.QUARTER_REVIEW,
      PmsTemplateSectionType.OBJECTIVES,
      PmsTemplateSectionType.COMPETENCIES,
    ];
    if (!allowedTypes.includes(section.sectionType)) {
      return false;
    }

    if (!this.isTermLevelTemplateSection(section.level)) {
      return false;
    }

    const allowedQuarters = [
      ...(section.termScope ?? []),
      ...(section.repeatFor ?? []),
    ];

    return allowedQuarters.length === 0 || allowedQuarters.includes(assessmentTermCode);
  }

  private isTermLevelTemplateSection(level?: unknown): boolean {
    const normalized = String(level ?? '').trim().toUpperCase();
    return normalized === PmsTemplateSectionLevel.TERM;
  }

  private isManagerEditableReviewField(field: ITemplateField): boolean {
    const behavior = (field.behaviors ?? []).find(
      (item) =>
        item.workflowState === TermWorkflowState.MANAGER_REVIEW_OPEN &&
        item.role === PmsRole.MANAGER &&
        item.visibility === 'VISIBLE' &&
        item.editability === 'EDITABLE',
    );

    return Boolean(behavior);
  }

  private buildRatingRuleFromTemplateField(field: ITemplateField): ReviewScoringRule {
    const scoreType = String(field.scoringConfig?.scoreType ?? 'MANUAL');
    const optionConfigMin = Number((field.optionConfig as Record<string, unknown> | undefined)?.min);
    const optionConfigMax = Number((field.optionConfig as Record<string, unknown> | undefined)?.max);
    const scoringMax = Number(field.scoringConfig?.maxScore ?? 0);
    const maxScore = Number.isFinite(optionConfigMax) && optionConfigMax > 0
      ? optionConfigMax
      : Number.isFinite(scoringMax) && scoringMax > 0
        ? scoringMax
        : 100;
    const minScore = Number.isFinite(optionConfigMin) ? optionConfigMin : 0;
    const allowedScores = Array.isArray(field.scoringConfig?.optionScores)
      ? field.scoringConfig?.optionScores
        ?.map((item: any) => Number(item.score))
        .filter((value: number) => Number.isFinite(value))
      : undefined;

    if (scoreType === 'FIXED') {
      const fixedScore = Number(field.scoringConfig?.fixedScore ?? maxScore);
      return {
        scoreType,
        minScore: fixedScore,
        maxScore: fixedScore,
        allowedScores: [fixedScore],
      };
    }

    return {
      scoreType,
      minScore,
      maxScore,
      allowedScores: allowedScores?.length ? Array.from(new Set(allowedScores)) : undefined,
    };
  }

  private async assertManagerAccess(action: string, termAssignment: ITermAssignment): Promise<void> {
    const actor = this.requireActor();
    const access = await accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: termAssignment.employeeId.toString(),
        managerId: termAssignment.assignedManagerId.toString(),
      },
    });

    if (access.allowed && access.mappedRole === PmsRole.MANAGER) {
      return;
    }

    // Check delegation
    const delegation = await this.getReviewDelegation(
      actor.actorId,
      termAssignment.assignedManagerId.toString(),
      termAssignment.cycleId?.toString(),
    );

    if (delegation) {
      return;
    }

    throw new Error(access.message ?? 'Only the assigned manager can manage quarter review');
  }

  private async assertTermAssignmentViewAccess(
    actorRole: string,
    termAssignment: Pick<ITermAssignment, 'employeeId' | 'assignedManagerId' | 'cycleId'>,
  ): Promise<void> {
    const mappedRole = normalizePmsRole(actorRole);
    if (mappedRole === PmsRole.ADMIN) {
      return;
    }

    if (mappedRole === PmsRole.DIRECTOR || mappedRole === PmsRole.MANAGEMENT) {
      const actor = this.requireActor();
      const subordinateIds = await getSubordinateUserIds(actor.actorId);
      const isSubordinate = subordinateIds.some(subId => subId.toString() === termAssignment.employeeId.toString());
      if (isSubordinate) {
        return;
      }
      throw new Error('Access denied. Employee is not in your reporting hierarchy.');
    }

    const actor = this.requireActor();
    const access = await accessService.canPerform({
      actor,
      action: 'termReview.view',
      resource: {
        employeeId: termAssignment.employeeId.toString(),
        managerId: termAssignment.assignedManagerId.toString(),
      },
    });

    if (access.allowed) {
      return;
    }

    // Check delegation
    const delegation = await this.getReviewDelegation(
      actor.actorId,
      termAssignment.assignedManagerId.toString(),
      termAssignment.cycleId?.toString(),
    );

    if (delegation) {
      return;
    }

    throw new Error(access.message ?? 'Access denied');
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

  private async getTermAssignment(termAssignmentId: string): Promise<ITermAssignment> {
    if (!Types.ObjectId.isValid(termAssignmentId)) {
      throw new Error('Invalid quarter assignment id');
    }

    const termAssignment = await TermAssignment.findById(termAssignmentId);
    if (!termAssignment || termAssignment.isDeleted) {
      throw new Error('Quarter assignment not found');
    }

    return this.advanceTermAssignmentToManagerReviewIfEligible(termAssignment);
  }

  private async getAnnualAssignment(annualAssignmentId: string): Promise<IAnnualAssignment> {
    if (!Types.ObjectId.isValid(annualAssignmentId)) {
      throw new Error('Invalid annual assignment id');
    }

    const annualAssignment = await AnnualAssignment.findById(annualAssignmentId);
    if (!annualAssignment || annualAssignment.isDeleted) {
      throw new Error('Annual assignment not found');
    }

    return annualAssignment;
  }

  private async assertReviewWindow(termAssignment: ITermAssignment): Promise<void> {
    if (!termAssignment.cycleTermId) {
      return;
    }

    const termCycle = await TermCycle.findById(termAssignment.cycleTermId)
      .select('managerReviewWindow')
      .lean();

    if (!termCycle?.managerReviewWindow?.startDate || !termCycle.managerReviewWindow?.endDate) {
      return;
    }

    const now = this.getCurrentDate();
    const start = new Date(termCycle.managerReviewWindow.startDate);
    const end = new Date(termCycle.managerReviewWindow.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (now < start || now > end) {
      throw new Error('Manager review window is closed for this quarter');
    }
  }

  private async getReviewDelegation(
    delegateUserId: string,
    delegatorUserId: string,
    cycleId?: string,
  ): Promise<any | null> {
    return new DelegationService(this.context).getActiveDelegation(
      delegateUserId,
      delegatorUserId,
      'PMS_REVIEWS',
      cycleId,
    );
  }

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private async advanceTermAssignmentsToManagerReviewIfEligible(
    termAssignments: ITermAssignment[],
  ): Promise<void> {
    for (const termAssignment of termAssignments) {
      await this.advanceTermAssignmentToManagerReviewIfEligible(termAssignment);
    }
  }

  private async advanceTermAssignmentToManagerReviewIfEligible(
    termAssignment: ITermAssignment,
  ): Promise<ITermAssignment> {
    return termAssignment;
  }

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
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
    };
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
    let metadata: Record<string, unknown> | undefined = undefined;

    if (entityType === 'QUARTER_REVIEW') {
      const review = await TermReview.findById(entityId).select('termAssignmentId').lean();
      if (review) {
        const assignment = await TermAssignment.findById(review.termAssignmentId).select('assignedManagerId').lean();
        if (assignment && actor.actorId !== assignment.assignedManagerId?.toString()) {
          const delegation = await this.getReviewDelegation(
            actor.actorId,
            assignment.assignedManagerId.toString()
          );
          if (delegation) {
            metadata = { actedAsDelegateFor: assignment.assignedManagerId.toString() };
          }
        }
      }
    }

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
      metadata,
    });
  }

  private async resolveAuditAssignmentId(entityType: string, entityId: string): Promise<string | undefined> {
    if (entityType === 'ANNUAL_ASSIGNMENT') {
      return entityId;
    }

    if (entityType === 'TERM_ASSIGNMENT') {
      const termAssignment = await TermAssignment.findById(entityId)
        .select('annualAssignmentId')
        .lean();
      return termAssignment?.annualAssignmentId?.toString();
    }

    if (entityType === 'QUARTER_REVIEW') {
      const termReview = await TermReview.findById(entityId)
        .select('annualAssignmentId termAssignmentId')
        .lean();

      if (termReview?.annualAssignmentId) {
        return termReview.annualAssignmentId.toString();
      }

      if (termReview?.termAssignmentId) {
        const termAssignment = await TermAssignment.findById(termReview.termAssignmentId)
          .select('annualAssignmentId')
          .lean();
        return termAssignment?.annualAssignmentId?.toString();
      }
    }

    return undefined;
  }
}
