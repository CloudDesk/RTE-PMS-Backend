import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  normalizePmsRole,
  ObjectiveStatus,
  PmsRole,
  PmsTemplateFieldType,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  QuarterReviewStatus,
  QuarterWorkflowState,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { Objective } from '../models/pms-objective.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import { QuarterReview } from '../models/pms-quarter-review.model';
import { QuarterReviewValue } from '../models/pms-quarter-review-value.model';
import { Delegation } from '../models/pms-delegation.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { PerformanceHistorySnapshot } from '../models/pms-performance-history-snapshot.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { transitionQuarterAssignmentState } from './quarter-assignment-workflow.service';
import { getSubordinateUserIds } from '../utilis/userHierarchy';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
import type { IQuarterReview } from '../models/pms-quarter-review.model';
import type { ITemplateField, ITemplateSection } from '../models/pms-template-version.model';

interface QuarterReviewRatingInput {
  objectiveId?: string;
  rating?: number;
  comments?: string;
}

interface QuarterReviewAttachmentInput {
  fileName?: string;
  fileUrl?: string;
  documentId?: string;
  uploadedBy?: string;
  uploadedAt?: Date | string;
}

interface QuarterReviewValueInput {
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

interface QuarterReviewBaseInput {
  ratings?: QuarterReviewRatingInput[];
  comments?: string;
  score?: number;
  overallRating?: string;
  recommendation?: string;
  achievements?: string;
  developmentObservations?: string;
  attachments?: QuarterReviewAttachmentInput[];
  reviewValues?: QuarterReviewValueInput[];
}

export interface SaveQuarterReviewDraftInput extends QuarterReviewBaseInput {}

export interface SubmitQuarterReviewInput extends QuarterReviewBaseInput {
  ratings: QuarterReviewRatingInput[];
  comments: string;
  score: number;
}

export interface SubmitQuarterReviewResult {
  quarterReview: IQuarterReview;
  quarterAssignment: IQuarterAssignment;
}

export interface FinalizeQuarterAssignmentResult {
  quarterAssignment: IQuarterAssignment;
}

export interface ReopenQuarterAssignmentInput {
  reason: string;
}

export type QuarterReviewWorkspaceMode = 'manager' | 'employee';

type ApprovedObjectiveRecord = {
  id: string;
  title: string;
  description: string;
  targetMetric: string;
  targetValue: string;
  successCriteria: string;
  weightage?: number;
};

type QuarterReviewRecord = {
  id: string;
  quarterAssignmentId: string;
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

export type QuarterReviewAssignmentRecord = {
  id: string;
  annualAssignmentId: string;
  quarterAssignmentId: string;
  cycleId: string;
  cycleName: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  quarterState: string;
  employeeId: string;
  employeeName: string;
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
  quarterReview: QuarterReviewRecord | null;
  backendConnected: boolean;
};

type ReviewScoringRule = {
  scoreType: string;
  minScore: number;
  maxScore: number;
  allowedScores?: number[];
};

type QuarterReviewScoringFieldConfig = {
  fieldKey: string;
  sectionKey: string;
  fieldType: string;
  scoreType: string;
  weightage: number;
  formula?: string;
  fixedScore?: number;
  maxScore?: number;
};

type QuarterReviewSectionConfig = {
  sectionKey: string;
  weightage: number;
  aggregationMethod: 'WEIGHTED_AVERAGE' | 'SIMPLE_AVERAGE' | 'SUM' | 'MAX_FIELD';
  maxSectionScore: number | null;
  scoringFields: QuarterReviewScoringFieldConfig[];
};

type QuarterReviewConfig = {
  objectiveRatingRule: ReviewScoringRule | null;
  overallScoreMax: number | null;
  sections: QuarterReviewSectionConfig[];
};

export class QuarterReviewService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async listAssignments(mode: QuarterReviewWorkspaceMode): Promise<QuarterReviewAssignmentRecord[]> {
    const actor = this.requireActor();
    const filter: Record<string, unknown> = { isDeleted: false };

    if (mode === 'employee') {
      filter.employeeId = this.toObjectId(actor.actorId, 'actorId');
    } else {
      filter.assignedManagerId = this.toObjectId(actor.actorId, 'actorId');
    }

    const quarterAssignments = await QuarterAssignment.find(filter)
      .sort({ updatedAt: -1, quarterCode: 1 })
      .lean();

    if (quarterAssignments.length === 0) {
      return [];
    }

    const annualAssignmentIds = quarterAssignments.map((item) => item.annualAssignmentId);
    const cycleIds = quarterAssignments
      .map((item) => item.cycleId)
      .filter((value): value is Types.ObjectId => Boolean(value));

    const [annualAssignments, cycles, approvedObjectives, quarterReviews, quarterReviewValues] = await Promise.all([
      AnnualAssignment.find({
        _id: { $in: annualAssignmentIds },
        isDeleted: false,
      }).lean(),
      AnnualCycle.find({
        _id: { $in: cycleIds },
        isDeleted: false,
      }).lean(),
      Objective.find({
        quarterAssignmentId: { $in: quarterAssignments.map((item) => item._id) },
        isDeleted: false,
        status: ObjectiveStatus.OBJECTIVE_APPROVED,
      })
        .sort({ objectiveNo: 1, createdAt: 1 })
        .lean(),
      QuarterReview.find({
        quarterAssignmentId: { $in: quarterAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
      QuarterReviewValue.find({
        quarterAssignmentId: { $in: quarterAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
    ]);

    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );
    const cycleMap = new Map(cycles.map((item) => [item._id.toString(), item]));
    const objectivesByQuarterAssignmentId = new Map<string, typeof approvedObjectives>();
    const quarterReviewByQuarterAssignmentId = new Map(
      quarterReviews.map((item) => [item.quarterAssignmentId.toString(), item]),
    );
    const reviewValuesByReviewId = new Map<string, typeof quarterReviewValues>();
    for (const val of quarterReviewValues) {
      if (val.quarterReviewId) {
        const key = val.quarterReviewId.toString();
        const bucket = reviewValuesByReviewId.get(key) ?? [];
        bucket.push(val);
        reviewValuesByReviewId.set(key, bucket);
      }
    }

    for (const objective of approvedObjectives) {
      const key = objective.quarterAssignmentId.toString();
      const bucket = objectivesByQuarterAssignmentId.get(key) ?? [];
      bucket.push(objective);
      objectivesByQuarterAssignmentId.set(key, bucket);
    }

    return await Promise.all(quarterAssignments.map(async (quarterAssignment) => {
      const annualAssignment = annualAssignmentMap.get(quarterAssignment.annualAssignmentId.toString());
      const cycle = quarterAssignment.cycleId
        ? cycleMap.get(quarterAssignment.cycleId.toString())
        : undefined;
      const review = quarterReviewByQuarterAssignmentId.get(quarterAssignment._id.toString()) ?? null;
      const objectives = objectivesByQuarterAssignmentId.get(quarterAssignment._id.toString()) ?? [];
      const reviewConfig = annualAssignment
        ? await this.getQuarterReviewConfig(annualAssignment, quarterAssignment.quarterCode)
        : this.defaultQuarterReviewConfig();

      const actorRole = normalizePmsRole(this.requireActor().actorRole);
      let isReviewVisible = true;
      if (actorRole === PmsRole.EMPLOYEE) {
        isReviewVisible = annualAssignment?.visibility?.employeeReviewVisible === true;
      }

      return {
        id: quarterAssignment._id.toString(),
        annualAssignmentId: quarterAssignment.annualAssignmentId.toString(),
        quarterAssignmentId: quarterAssignment._id.toString(),
        cycleId: quarterAssignment.cycleId?.toString() ?? '',
        cycleName: String(
          cycle?.name ??
          annualAssignment?.orgSnapshot?.cycleName ??
          'Performance Cycle',
        ),
        quarter: quarterAssignment.quarterCode,
        quarterState: quarterAssignment.quarterState,
        employeeId: quarterAssignment.employeeId.toString(),
        employeeName: String(annualAssignment?.employeeSnapshot?.name ?? 'Employee'),
        managerId: quarterAssignment.assignedManagerId.toString(),
        managerName: String(annualAssignment?.managerSnapshot?.name ?? 'Manager'),
        templateVersionId: annualAssignment?.templateVersionId?.toString() ?? '',
        reviewConfig: {
          objectiveRating: reviewConfig.objectiveRatingRule,
          overallScoreMax: reviewConfig.overallScoreMax,
        },
        approvedObjectives: objectives.map((objective) => ({
          id: objective._id.toString(),
          title: objective.title,
          description: objective.description ?? '',
          targetMetric: objective.targetMetric ?? '',
          targetValue: objective.targetValue ?? '',
          successCriteria: objective.successCriteria ?? '',
          weightage: objective.weightage,
        })),
        quarterReview: review
          ? this.mapQuarterReviewRecord(
              review,
              isReviewVisible,
              reviewValuesByReviewId.get(review._id.toString()) ?? [],
            )
          : null,
        backendConnected: true,
      };
    }));
  }

  async getAssignment(quarterAssignmentId: string): Promise<QuarterReviewAssignmentRecord> {
    const [record] = await this.listAssignmentsForQuarterIds([quarterAssignmentId]);
    if (!record) {
      throw new Error('Quarter assignment not found');
    }
    return record;
  }

  async saveQuarterReviewDraft(
    quarterAssignmentId: string,
    input: SaveQuarterReviewDraftInput,
  ): Promise<SubmitQuarterReviewResult> {
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    await this.assertManagerAccess('quarterReview.draft', quarterAssignment);
    await this.assertReviewWindow(quarterAssignment);

    if (quarterAssignment.quarterState !== QuarterWorkflowState.MANAGER_REVIEW_OPEN) {
      throw new Error('Quarter review draft can be saved only when manager review is open');
    }

    const approvedObjectives = await this.getApprovedObjectives(quarterAssignment._id);
    if (approvedObjectives.length === 0) {
      throw new Error('Quarter review requires approved objectives before manager review can start');
    }
    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const reviewConfig = await this.getQuarterReviewConfig(annualAssignment, quarterAssignment.quarterCode);
    const scoringResolution = this.resolveQuarterReviewScoring(input, reviewConfig);

    this.validateDraftInput(input, approvedObjectives, reviewConfig, scoringResolution.overallScore);

    const existingReview = await QuarterReview.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    });

    if (existingReview?.submittedAt) {
      throw new Error('Submitted quarter review cannot be edited as draft');
    }

    const actor = this.requireActor();
    const actorObjectId = new Types.ObjectId(actor.actorId);
    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== quarterAssignment.assignedManagerId.toString()) {
      const delegation = await Delegation.findOne({
        delegateUserId: actorObjectId,
        delegatorUserId: quarterAssignment.assignedManagerId,
        status: 'ACTIVE',
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() },
        isDeleted: false,
      }).lean();

      if (delegation && (delegation.scopeType === 'ALL' || delegation.scopeType === 'PMS_REVIEWS')) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = quarterAssignment.assignedManagerId;
      }
    }

    const reviewPayload = {
      quarterAssignmentId: quarterAssignment._id,
      annualAssignmentId: quarterAssignment.annualAssignmentId,
      cycleId: quarterAssignment.cycleId,
      employeeId: quarterAssignment.employeeId,
      managerId: quarterAssignment.assignedManagerId,
      reviewStatus: QuarterReviewStatus.MANAGER_REVIEW_OPEN,
      ratings: this.normalizeRatings(input.ratings ?? []),
      comments: input.comments?.trim(),
      score: scoringResolution.overallScore,
      overallScore: scoringResolution.overallScore,
      overallRating: input.overallRating?.trim(),
      finalQuarterRemarks: input.comments?.trim(),
      recommendation: input.recommendation?.trim(),
      achievements: input.achievements?.trim(),
      developmentObservations: input.developmentObservations?.trim(),
      attachments: this.normalizeAttachments(input.attachments ?? []),
      actingDelegateUserId,
      originalOwnerUserId,
      updatedBy: this.actorIdObject(),
      createdBy: existingReview?.createdBy ?? this.actorIdObject(),
    };

    const quarterReview = existingReview
      ? await QuarterReview.findByIdAndUpdate(
        existingReview._id,
        {
          $set: reviewPayload,
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      : await QuarterReview.create(reviewPayload);

    if (!quarterReview) {
      throw new Error('Unable to save quarter review draft');
    }

    await this.persistQuarterReviewValues(
      quarterReview,
      quarterAssignment,
      {
        ...input,
        score: scoringResolution.overallScore,
        reviewValues: scoringResolution.reviewValues,
      },
      false,
    );
    await this.syncQuarterAssignmentReviewSummary(quarterAssignment, quarterReview);

    await this.audit(
      'PMS_QUARTER_REVIEW_DRAFT_SAVED',
      'QUARTER_REVIEW',
      quarterReview._id.toString(),
      existingReview?.toObject(),
      quarterReview.toObject(),
    );

    return {
      quarterReview,
      quarterAssignment: await this.getQuarterAssignment(quarterAssignmentId),
    };
  }

  async submitQuarterReview(
    quarterAssignmentId: string,
    input: SubmitQuarterReviewInput,
  ): Promise<SubmitQuarterReviewResult> {
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    await this.assertManagerAccess('quarterReview.submit', quarterAssignment);
    await this.assertReviewWindow(quarterAssignment);

    if (quarterAssignment.quarterState !== QuarterWorkflowState.MANAGER_REVIEW_OPEN) {
      throw new Error('Quarter review can be submitted only when manager review is open');
    }

    const approvedObjectives = await this.getApprovedObjectives(quarterAssignment._id);
    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const reviewConfig = await this.getQuarterReviewConfig(annualAssignment, quarterAssignment.quarterCode);
    const scoringResolution = this.resolveQuarterReviewScoring(input, reviewConfig);
    this.validateReviewInput(input, approvedObjectives, reviewConfig, scoringResolution.overallScore);

    const existingReview = await QuarterReview.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    });

    if (existingReview?.submittedAt) {
      throw new Error('Quarter review already submitted');
    }

    const actor = this.requireActor();
    const actorObjectId = new Types.ObjectId(actor.actorId);
    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== quarterAssignment.assignedManagerId.toString()) {
      const delegation = await Delegation.findOne({
        delegateUserId: actorObjectId,
        delegatorUserId: quarterAssignment.assignedManagerId,
        status: 'ACTIVE',
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() },
        isDeleted: false,
      }).lean();

      if (delegation && (delegation.scopeType === 'ALL' || delegation.scopeType === 'PMS_REVIEWS')) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = quarterAssignment.assignedManagerId;
      }
    }

    const reviewPayload = {
      quarterAssignmentId: quarterAssignment._id,
      annualAssignmentId: quarterAssignment.annualAssignmentId,
      cycleId: quarterAssignment.cycleId,
      employeeId: quarterAssignment.employeeId,
      managerId: quarterAssignment.assignedManagerId,
      reviewStatus: QuarterReviewStatus.MANAGER_REVIEW_SUBMITTED,
      ratings: this.normalizeRatings(input.ratings),
      comments: input.comments.trim(),
      score: scoringResolution.overallScore,
      overallScore: scoringResolution.overallScore,
      overallRating: input.overallRating?.trim(),
      finalQuarterRemarks: input.comments.trim(),
      recommendation: input.recommendation?.trim(),
      achievements: input.achievements?.trim(),
      developmentObservations: input.developmentObservations?.trim(),
      attachments: this.normalizeAttachments(input.attachments ?? []),
      actingDelegateUserId,
      originalOwnerUserId,
      submittedAt: new Date(),
      updatedBy: this.actorIdObject(),
      createdBy: existingReview?.createdBy ?? this.actorIdObject(),
    };

    const quarterReview = existingReview
      ? await QuarterReview.findByIdAndUpdate(
        existingReview._id,
        {
          $set: reviewPayload,
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      : await QuarterReview.create(reviewPayload);

    if (!quarterReview) {
      throw new Error('Unable to submit quarter review');
    }

    await this.persistQuarterReviewValues(
      quarterReview,
      quarterAssignment,
      {
        ...input,
        score: scoringResolution.overallScore,
        reviewValues: scoringResolution.reviewValues,
      },
      true,
    );
    await this.syncQuarterAssignmentReviewSummary(quarterAssignment, quarterReview);

    const updatedQuarterAssignment = await transitionQuarterAssignmentState(
      quarterAssignment._id.toString(),
      QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED,
      this.requireActor(),
    );

    await this.audit(
      'PMS_QUARTER_REVIEW_SUBMITTED',
      'QUARTER_REVIEW',
      quarterReview._id.toString(),
      existingReview?.toObject(),
      quarterReview.toObject(),
    );

    return {
      quarterReview,
      quarterAssignment: updatedQuarterAssignment,
    };
  }

  async finalizeQuarterAssignment(
    quarterAssignmentId: string,
  ): Promise<FinalizeQuarterAssignmentResult> {
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    this.assertAdmin('quarterAssignment.finalize');

    if (
      quarterAssignment.quarterState !== QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED &&
      quarterAssignment.quarterState !== QuarterWorkflowState.REOPENED_BY_ADMIN
    ) {
      throw new Error('Quarter can be finalized only after manager review submission or admin reopen');
    }

    const quarterReview = await QuarterReview.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    });

    if (!quarterReview?.submittedAt) {
      throw new Error('Submitted quarter review is required before quarter finalization');
    }

    const updatedQuarterAssignment = await transitionQuarterAssignmentState(
      quarterAssignment._id.toString(),
      QuarterWorkflowState.QUARTER_FINALIZED,
      this.requireActor(),
    );

    const finalizedReview = await QuarterReview.findOneAndUpdate(
      { quarterAssignmentId: quarterAssignment._id, isDeleted: false },
      {
        $set: {
          finalizedAt: new Date(),
          reviewStatus: QuarterReviewStatus.FINALIZED,
          updatedBy: this.actorIdObject(),
        },
        $inc: { version: 1 },
      },
      { new: true },
    );

    if (finalizedReview) {
      await this.syncQuarterAssignmentReviewSummary(updatedQuarterAssignment, finalizedReview);
      await this.createQuarterFinalizationSnapshot(updatedQuarterAssignment, finalizedReview);
    }

    await this.audit(
      'PMS_QUARTER_ASSIGNMENT_FINALIZED',
      'QUARTER_ASSIGNMENT',
      updatedQuarterAssignment._id.toString(),
      { quarterState: quarterAssignment.quarterState },
      { quarterState: updatedQuarterAssignment.quarterState },
    );

    return { quarterAssignment: updatedQuarterAssignment };
  }

  async reopenQuarterAssignment(
    quarterAssignmentId: string,
    input: ReopenQuarterAssignmentInput,
  ): Promise<FinalizeQuarterAssignmentResult> {
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    this.assertAdmin('quarterAssignment.reopen');

    if (!input.reason?.trim()) {
      throw new Error('Reopen reason is required');
    }

    if (quarterAssignment.quarterState !== QuarterWorkflowState.QUARTER_FINALIZED) {
      throw new Error('Only finalized quarters can be reopened');
    }

    const finalizedReviewBeforeReopen = await QuarterReview.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    }).lean();

    const updatedQuarterAssignment = await transitionQuarterAssignmentState(
      quarterAssignment._id.toString(),
      QuarterWorkflowState.REOPENED_BY_ADMIN,
      this.requireActor(),
      input.reason,
    );

    await QuarterReview.findOneAndUpdate(
      { quarterAssignmentId: quarterAssignment._id, isDeleted: false },
      {
        $set: {
          finalizedAt: undefined,
          reviewStatus: QuarterReviewStatus.MANAGER_REVIEW_SUBMITTED,
          updatedBy: this.actorIdObject(),
        },
        $inc: { version: 1 },
      },
      { new: true },
    );

    await this.createQuarterReopenCorrectionLayer(
      quarterAssignment,
      finalizedReviewBeforeReopen,
      input.reason,
    );

    await this.audit(
      'PMS_QUARTER_ASSIGNMENT_REOPENED',
      'QUARTER_ASSIGNMENT',
      updatedQuarterAssignment._id.toString(),
      { quarterState: quarterAssignment.quarterState },
      { quarterState: updatedQuarterAssignment.quarterState },
      input.reason,
    );

    return { quarterAssignment: updatedQuarterAssignment };
  }

  private async listAssignmentsForQuarterIds(
    quarterAssignmentIds: string[],
  ): Promise<QuarterReviewAssignmentRecord[]> {
    const normalizedIds = quarterAssignmentIds
      .filter((value) => Types.ObjectId.isValid(value))
      .map((value) => new Types.ObjectId(value));

    if (normalizedIds.length === 0) {
      return [];
    }

    const quarterAssignments = await QuarterAssignment.find({
      _id: { $in: normalizedIds },
      isDeleted: false,
    }).lean();

    if (quarterAssignments.length === 0) {
      return [];
    }

    const actor = this.requireActor();
    for (const quarterAssignment of quarterAssignments) {
      await this.assertQuarterAssignmentViewAccess(actor.actorRole, quarterAssignment);
    }

    const annualAssignmentIds = quarterAssignments.map((item) => item.annualAssignmentId);
    const cycleIds = quarterAssignments
      .map((item) => item.cycleId)
      .filter((value): value is Types.ObjectId => Boolean(value));

    const [annualAssignments, cycles, approvedObjectives, quarterReviews, quarterReviewValues] = await Promise.all([
      AnnualAssignment.find({
        _id: { $in: annualAssignmentIds },
        isDeleted: false,
      }).lean(),
      AnnualCycle.find({
        _id: { $in: cycleIds },
        isDeleted: false,
      }).lean(),
      Objective.find({
        quarterAssignmentId: { $in: quarterAssignments.map((item) => item._id) },
        isDeleted: false,
        status: ObjectiveStatus.OBJECTIVE_APPROVED,
      })
        .sort({ objectiveNo: 1, createdAt: 1 })
        .lean(),
      QuarterReview.find({
        quarterAssignmentId: { $in: quarterAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
      QuarterReviewValue.find({
        quarterAssignmentId: { $in: quarterAssignments.map((item) => item._id) },
        isDeleted: false,
      }).lean(),
    ]);

    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );
    const cycleMap = new Map(cycles.map((item) => [item._id.toString(), item]));
    const objectivesByQuarterAssignmentId = new Map<string, typeof approvedObjectives>();
    const quarterReviewByQuarterAssignmentId = new Map(
      quarterReviews.map((item) => [item.quarterAssignmentId.toString(), item]),
    );
    const reviewValuesByReviewId = new Map<string, typeof quarterReviewValues>();
    for (const val of quarterReviewValues) {
      if (val.quarterReviewId) {
        const key = val.quarterReviewId.toString();
        const bucket = reviewValuesByReviewId.get(key) ?? [];
        bucket.push(val);
        reviewValuesByReviewId.set(key, bucket);
      }
    }

    for (const objective of approvedObjectives) {
      const key = objective.quarterAssignmentId.toString();
      const bucket = objectivesByQuarterAssignmentId.get(key) ?? [];
      bucket.push(objective);
      objectivesByQuarterAssignmentId.set(key, bucket);
    }

    return await Promise.all(quarterAssignments.map(async (quarterAssignment) => {
      const annualAssignment = annualAssignmentMap.get(quarterAssignment.annualAssignmentId.toString());
      const cycle = quarterAssignment.cycleId
        ? cycleMap.get(quarterAssignment.cycleId.toString())
        : undefined;
      const review = quarterReviewByQuarterAssignmentId.get(quarterAssignment._id.toString()) ?? null;
      const objectives = objectivesByQuarterAssignmentId.get(quarterAssignment._id.toString()) ?? [];
      const reviewConfig = annualAssignment
        ? await this.getQuarterReviewConfig(annualAssignment, quarterAssignment.quarterCode)
        : this.defaultQuarterReviewConfig();

      const actorRole = normalizePmsRole(this.requireActor().actorRole);
      let isReviewVisible = true;
      if (actorRole === PmsRole.EMPLOYEE) {
        isReviewVisible = annualAssignment?.visibility?.employeeReviewVisible === true;
      }

      return {
        id: quarterAssignment._id.toString(),
        annualAssignmentId: quarterAssignment.annualAssignmentId.toString(),
        quarterAssignmentId: quarterAssignment._id.toString(),
        cycleId: quarterAssignment.cycleId?.toString() ?? '',
        cycleName: String(
          cycle?.name ??
          annualAssignment?.orgSnapshot?.cycleName ??
          'Performance Cycle',
        ),
        quarter: quarterAssignment.quarterCode,
        quarterState: quarterAssignment.quarterState,
        employeeId: quarterAssignment.employeeId.toString(),
        employeeName: String(annualAssignment?.employeeSnapshot?.name ?? 'Employee'),
        managerId: quarterAssignment.assignedManagerId.toString(),
        managerName: String(annualAssignment?.managerSnapshot?.name ?? 'Manager'),
        templateVersionId: annualAssignment?.templateVersionId?.toString() ?? '',
        reviewConfig: {
          objectiveRating: reviewConfig.objectiveRatingRule,
          overallScoreMax: reviewConfig.overallScoreMax,
        },
        approvedObjectives: objectives.map((objective) => ({
          id: objective._id.toString(),
          title: objective.title,
          description: objective.description ?? '',
          targetMetric: objective.targetMetric ?? '',
          targetValue: objective.targetValue ?? '',
          successCriteria: objective.successCriteria ?? '',
          weightage: objective.weightage,
        })),
        quarterReview: review
          ? this.mapQuarterReviewRecord(
              review,
              isReviewVisible,
              reviewValuesByReviewId.get(review._id.toString()) ?? [],
            )
          : null,
        backendConnected: true,
      };
    }));
  }

  private mapQuarterReviewRecord(review: Record<string, any>, isReviewVisible = true, reviewValues: any[] = []): QuarterReviewRecord {
    if (!isReviewVisible) {
      return {
        id: review._id.toString(),
        quarterAssignmentId: review.quarterAssignmentId.toString(),
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
      quarterAssignmentId: review.quarterAssignmentId.toString(),
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

  private validateDraftInput(
    input: SaveQuarterReviewDraftInput,
    approvedObjectives: Array<Record<string, any>>,
    reviewConfig: QuarterReviewConfig,
    resolvedScore?: number,
  ): void {
    if (input.score !== undefined && Number.isNaN(Number(input.score))) {
      throw new Error('Review score must be a valid number');
    }

    if (resolvedScore !== undefined && resolvedScore < 0) {
      throw new Error('Review score cannot be negative');
    }

    this.validateRatingsAgainstObjectives(
      input.ratings ?? [],
      approvedObjectives,
      false,
      reviewConfig,
    );
    this.validateOverallScoreAgainstTemplate(resolvedScore, reviewConfig);
  }

  private validateReviewInput(
    input: SubmitQuarterReviewInput,
    approvedObjectives: Array<Record<string, any>>,
    reviewConfig: QuarterReviewConfig,
    resolvedScore?: number,
  ): void {
    if (!Array.isArray(input.ratings) || input.ratings.length === 0) {
      throw new Error('At least one review rating is required');
    }

    if (!input.comments?.trim()) {
      throw new Error('Review comments are required');
    }

    if (!input.achievements?.trim()) {
      throw new Error('Achievements are required on submit');
    }

    if (!input.developmentObservations?.trim()) {
      throw new Error('Development observations are required on submit');
    }

    if (resolvedScore === undefined || resolvedScore === null || Number.isNaN(Number(resolvedScore))) {
      throw new Error('Review score is required');
    }

    if (resolvedScore < 0) {
      throw new Error('Review score cannot be negative');
    }

    this.validateRatingsAgainstObjectives(
      input.ratings,
      approvedObjectives,
      true,
      reviewConfig,
    );
    this.validateOverallScoreAgainstTemplate(resolvedScore, reviewConfig);
  }

  private resolveQuarterReviewScoring(
    input: QuarterReviewBaseInput,
    reviewConfig: QuarterReviewConfig,
  ): { overallScore: number | undefined; reviewValues: QuarterReviewValueInput[] } {
    const mergedReviewValues = this.mergeComputedReviewValues(
      input.reviewValues ?? [],
      this.buildComputedReviewValues(input, reviewConfig),
    );
    const sectionScores = this.calculateSectionScores(mergedReviewValues, reviewConfig);
    const computedOverallScore = this.calculateOverallScore(sectionScores, reviewConfig);
    const manualScore = input.score === undefined || input.score === null
      ? undefined
      : Number(input.score);

    return {
      overallScore: computedOverallScore ?? manualScore,
      reviewValues: mergedReviewValues,
    };
  }

  private validateRatingsAgainstObjectives(
    ratings: QuarterReviewRatingInput[],
    approvedObjectives: Array<Record<string, any>>,
    requireAllObjectives: boolean,
    reviewConfig: QuarterReviewConfig,
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
      throw new Error('All approved objectives must be rated before quarter review submission');
    }
  }

  private validateObjectiveRatingAgainstTemplate(
    rating: number,
    reviewConfig: QuarterReviewConfig,
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
    reviewConfig: QuarterReviewConfig,
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

  private normalizeRatings(ratings: QuarterReviewRatingInput[]) {
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

  private normalizeAttachments(attachments: QuarterReviewAttachmentInput[]) {
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

  private async persistQuarterReviewValues(
    quarterReview: IQuarterReview,
    quarterAssignment: IQuarterAssignment,
    input: QuarterReviewBaseInput,
    isSubmitted: boolean,
  ): Promise<void> {
    const actor = this.requireActor();
    const actorUserId = new Types.ObjectId(actor.actorId);
    const effectiveAt = isSubmitted
      ? (quarterReview.submittedAt ?? new Date())
      : new Date();
    const baseValue = {
      quarterReviewId: quarterReview._id,
      quarterAssignmentId: quarterAssignment._id,
      annualAssignmentId: quarterAssignment.annualAssignmentId,
      cycleId: quarterAssignment.cycleId,
      employeeId: quarterAssignment.employeeId,
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
    ];

    await QuarterReviewValue.deleteMany({ quarterReviewId: quarterReview._id });
    if (valuesToCreate.length > 0) {
      await QuarterReviewValue.insertMany(valuesToCreate);
    }
  }

  private normalizeRatingValues(
    ratings: QuarterReviewRatingInput[],
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
    reviewValues: QuarterReviewValueInput[],
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

  private buildComputedReviewValues(
    input: QuarterReviewBaseInput,
    reviewConfig: QuarterReviewConfig,
  ): QuarterReviewValueInput[] {
    if (reviewConfig.sections.length === 0) {
      return [];
    }

    const numericValueContext = this.buildReviewNumericContext(input);
    const computedValues: QuarterReviewValueInput[] = [];

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
          const formulaValue = this.evaluateFormulaExpression(field.formula, numericValueContext);
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

  private buildReviewNumericContext(input: QuarterReviewBaseInput): Record<string, number> {
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

  private evaluateFormulaExpression(
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
    reviewValues: QuarterReviewValueInput[],
    computedReviewValues: QuarterReviewValueInput[],
  ): QuarterReviewValueInput[] {
    const merged = new Map<string, QuarterReviewValueInput>();

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

  private calculateSectionScores(
    reviewValues: QuarterReviewValueInput[],
    reviewConfig: QuarterReviewConfig,
  ): Array<{ sectionKey: string; score: number; weightage: number }> {
    const valueMap = new Map(
      reviewValues
        .filter((value) => value.fieldKey?.trim() && value.sectionKey?.trim())
        .map((value) => [`${value.sectionKey}::${value.fieldKey}`, value]),
    );

    return reviewConfig.sections
      .map((section) => {
        const fieldScores = section.scoringFields
          .map((field) => {
            const matchedValue = valueMap.get(`${field.sectionKey}::${field.fieldKey}`);
            const numericScore = matchedValue?.valueNumber;
            return numericScore !== undefined && numericScore !== null && Number.isFinite(Number(numericScore))
              ? { score: Number(numericScore), weightage: field.weightage }
              : null;
          })
          .filter((value): value is { score: number; weightage: number } => Boolean(value));

        if (fieldScores.length === 0) {
          return null;
        }

        let score: number;
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

        const normalizedScore = section.maxSectionScore !== null && score > section.maxSectionScore
          ? section.maxSectionScore
          : score;

        return {
          sectionKey: section.sectionKey,
          score: normalizedScore,
          weightage: section.weightage,
        };
      })
      .filter((value): value is { sectionKey: string; score: number; weightage: number } => Boolean(value));
  }

  private calculateOverallScore(
    sectionScores: Array<{ sectionKey: string; score: number; weightage: number }>,
    reviewConfig: QuarterReviewConfig,
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

  private async syncQuarterAssignmentReviewSummary(
    quarterAssignment: IQuarterAssignment,
    quarterReview: IQuarterReview,
  ): Promise<void> {
    quarterAssignment.quarterScore = quarterReview.score;
    quarterAssignment.quarterRating = quarterReview.overallRating;
    quarterAssignment.quarterSummary = {
      comments: quarterReview.comments,
      achievements: quarterReview.achievements,
      developmentObservations: quarterReview.developmentObservations,
      recommendation: quarterReview.recommendation,
      submittedAt: quarterReview.submittedAt,
      finalizedAt: quarterReview.finalizedAt,
      reviewStatus: quarterReview.reviewStatus,
      quarterReviewId: quarterReview._id,
    };
    quarterAssignment.updatedBy = this.actorIdObject();
    quarterAssignment.version += 1;
    await quarterAssignment.save();
  }

  private async createQuarterFinalizationSnapshot(
    quarterAssignment: IQuarterAssignment,
    quarterReview: IQuarterReview,
  ): Promise<void> {
    const annualAssignment = await AnnualAssignment.findById(quarterAssignment.annualAssignmentId).lean();
    if (!annualAssignment?.templateVersionId || !quarterAssignment.cycleId) {
      return;
    }

    const [approvedObjectives, reviewValues] = await Promise.all([
      Objective.find({
        quarterAssignmentId: quarterAssignment._id,
        isDeleted: false,
        status: ObjectiveStatus.OBJECTIVE_APPROVED,
      })
        .sort({ objectiveNo: 1, createdAt: 1 })
        .lean(),
      QuarterReviewValue.find({
        quarterReviewId: quarterReview._id,
        isDeleted: false,
      })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const snapshotPayload = {
      annualAssignmentId: annualAssignment._id.toString(),
      cycleId: annualAssignment.cycleId?.toString?.() ?? quarterAssignment.cycleId.toString(),
      employeeId: annualAssignment.employeeId.toString(),
      templateVersionId: annualAssignment.templateVersionId.toString(),
      quarterSnapshots: {
        [quarterAssignment.quarterCode]: {
          quarterAssignment: quarterAssignment.toObject(),
          quarterReview: quarterReview.toObject(),
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
      quarterSnapshots: snapshotPayload.quarterSnapshots,
      snapshotHash,
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });
  }

  private async createQuarterReopenCorrectionLayer(
    quarterAssignment: IQuarterAssignment,
    quarterReview: Record<string, any> | null,
    reason: string,
  ): Promise<void> {
    await CorrectionLayer.create({
      entityType: 'QUARTER_ASSIGNMENT',
      entityId: quarterAssignment._id,
      fieldKey: 'REOPEN_QUARTER',
      originalValue: {
        quarterState: quarterAssignment.quarterState,
        quarterScore: quarterAssignment.quarterScore,
        quarterRating: quarterAssignment.quarterRating,
        quarterSummary: quarterAssignment.quarterSummary,
        reviewStatus: quarterReview?.reviewStatus,
        finalizedAt: quarterReview?.finalizedAt,
      },
      correctedValue: {
        quarterState: QuarterWorkflowState.REOPENED_BY_ADMIN,
        reviewStatus: QuarterReviewStatus.MANAGER_REVIEW_SUBMITTED,
      },
      correctionReason: reason,
      correctedBy: this.actorIdObject(),
      correctedAt: new Date(),
      createdBy: this.actorIdObject(),
      updatedBy: this.actorIdObject(),
    });
  }

  private async getApprovedObjectives(quarterAssignmentId: Types.ObjectId) {
    return Objective.find({
      quarterAssignmentId,
      isDeleted: false,
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
    })
      .sort({ objectiveNo: 1, createdAt: 1 })
      .lean();
  }

  private async getQuarterReviewConfig(
    annualAssignment: IAnnualAssignment | Record<string, any>,
    quarterCode: 'Q1' | 'Q2' | 'Q3' | 'Q4',
  ): Promise<QuarterReviewConfig> {
    const templateVersionId = annualAssignment.templateVersionId?.toString?.();
    if (!templateVersionId) {
      return this.defaultQuarterReviewConfig();
    }

    const templateVersion = await PmsTemplateVersion.findById(templateVersionId)
      .select('sections')
      .lean();

    if (!templateVersion) {
      return this.defaultQuarterReviewConfig();
    }

    const applicableSections = (templateVersion.sections ?? []).filter((section) =>
      this.isQuarterReviewSectionInScope(section, quarterCode),
    );

    if (applicableSections.length === 0) {
      return this.defaultQuarterReviewConfig();
    }

    const scoringFields = applicableSections
      .flatMap((section) =>
        (section.fields ?? []).filter((field) => this.isManagerEditableReviewField(field)),
      );

    const objectiveRatingField =
      scoringFields.find((field) => field.scoringConfig?.participatesInScoring === true) ??
      scoringFields.find((field) =>
        [
          PmsTemplateFieldType.RATING_SCALE,
          PmsTemplateFieldType.WEIGHTED_SCORE,
          PmsTemplateFieldType.NUMERIC_INPUT,
          PmsTemplateFieldType.PERCENTAGE,
        ].includes(field.fieldType as never),
      ) ??
      null;

    const objectiveRatingRule = objectiveRatingField
      ? this.buildRatingRuleFromTemplateField(objectiveRatingField)
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
        weightage: Number(section.sectionScoringConfig?.weightage ?? 0),
        aggregationMethod: (
          section.sectionScoringConfig?.aggregationMethod as QuarterReviewSectionConfig['aggregationMethod']
        ) ?? 'WEIGHTED_AVERAGE',
        maxSectionScore: Number.isFinite(Number(section.sectionScoringConfig?.maxSectionScore))
          ? Number(section.sectionScoringConfig?.maxSectionScore)
          : null,
        scoringFields: (section.fields ?? [])
          .filter(
            (field) =>
              this.isManagerEditableReviewField(field) &&
              field.scoringConfig?.participatesInScoring === true,
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
          })),
      }))
      .filter((section) => section.scoringFields.length > 0);

    return {
      objectiveRatingRule,
      overallScoreMax,
      sections,
    };
  }

  private defaultQuarterReviewConfig(): QuarterReviewConfig {
    return {
      objectiveRatingRule: null,
      overallScoreMax: null,
      sections: [],
    };
  }

  private isQuarterReviewSectionInScope(
    section: ITemplateSection,
    quarterCode: 'Q1' | 'Q2' | 'Q3' | 'Q4',
  ): boolean {
    if (section.sectionType !== PmsTemplateSectionType.QUARTER_REVIEW) {
      return false;
    }

    if (section.level !== PmsTemplateSectionLevel.QUARTER) {
      return false;
    }

    const allowedQuarters = [
      ...(section.quarterScope ?? []),
      ...(section.repeatFor ?? []),
    ];

    return allowedQuarters.length === 0 || allowedQuarters.includes(quarterCode);
  }

  private isManagerEditableReviewField(field: ITemplateField): boolean {
    const behavior = (field.behaviors ?? []).find(
      (item) =>
        item.workflowState === QuarterWorkflowState.MANAGER_REVIEW_OPEN &&
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

  private async assertManagerAccess(action: string, quarterAssignment: IQuarterAssignment): Promise<void> {
    const actor = this.requireActor();
    const access = accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: quarterAssignment.employeeId.toString(),
        managerId: quarterAssignment.assignedManagerId.toString(),
      },
    });

    if (access.allowed && access.mappedRole === PmsRole.MANAGER) {
      return;
    }

    // Check delegation
    const delegation = await Delegation.findOne({
      delegateUserId: new Types.ObjectId(actor.actorId),
      delegatorUserId: quarterAssignment.assignedManagerId,
      status: 'ACTIVE',
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
      isDeleted: false,
    }).lean();

    if (delegation && (delegation.scopeType === 'ALL' || delegation.scopeType === 'PMS_REVIEWS')) {
      return;
    }

    throw new Error(access.message ?? 'Only the assigned manager can manage quarter review');
  }

  private async assertQuarterAssignmentViewAccess(
    actorRole: string,
    quarterAssignment: Pick<IQuarterAssignment, 'employeeId' | 'assignedManagerId'>,
  ): Promise<void> {
    const mappedRole = normalizePmsRole(actorRole);
    if (mappedRole === PmsRole.ADMIN) {
      return;
    }

    if (mappedRole === PmsRole.DIRECTOR || mappedRole === PmsRole.MANAGEMENT) {
      const actor = this.requireActor();
      const subordinateIds = await getSubordinateUserIds(actor.actorId);
      const isSubordinate = subordinateIds.some(subId => subId.toString() === quarterAssignment.employeeId.toString());
      if (isSubordinate) {
        return;
      }
      throw new Error('Access denied. Employee is not in your reporting hierarchy.');
    }

    const actor = this.requireActor();
    const access = accessService.canPerform({
      actor,
      action: 'quarterReview.view',
      resource: {
        employeeId: quarterAssignment.employeeId.toString(),
        managerId: quarterAssignment.assignedManagerId.toString(),
      },
    });

    if (access.allowed) {
      return;
    }

    // Check delegation
    const delegation = await Delegation.findOne({
      delegateUserId: new Types.ObjectId(actor.actorId),
      delegatorUserId: quarterAssignment.assignedManagerId,
      status: 'ACTIVE',
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
      isDeleted: false,
    }).lean();

    if (delegation && (delegation.scopeType === 'ALL' || delegation.scopeType === 'PMS_REVIEWS')) {
      return;
    }

    throw new Error(access.message ?? 'Access denied');
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

  private async getQuarterAssignment(quarterAssignmentId: string): Promise<IQuarterAssignment> {
    if (!Types.ObjectId.isValid(quarterAssignmentId)) {
      throw new Error('Invalid quarter assignment id');
    }

    const quarterAssignment = await QuarterAssignment.findById(quarterAssignmentId);
    if (!quarterAssignment || quarterAssignment.isDeleted) {
      throw new Error('Quarter assignment not found');
    }

    return quarterAssignment;
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

  private async assertReviewWindow(quarterAssignment: IQuarterAssignment): Promise<void> {
    if (!quarterAssignment.cycleQuarterId) {
      return;
    }

    const quarterCycle = await QuarterCycle.findById(quarterAssignment.cycleQuarterId)
      .select('managerReviewWindow')
      .lean();

    if (!quarterCycle?.managerReviewWindow?.startDate || !quarterCycle.managerReviewWindow?.endDate) {
      return;
    }

    const now = new Date();
    const start = new Date(quarterCycle.managerReviewWindow.startDate);
    const end = new Date(quarterCycle.managerReviewWindow.endDate);

    if (now < start || now > end) {
      throw new Error('Manager review window is closed for this quarter');
    }
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

    await auditService.createAuditLog({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action,
      entityType,
      entityId,
      previousValue,
      newValue,
      reason,
    });
  }
}
