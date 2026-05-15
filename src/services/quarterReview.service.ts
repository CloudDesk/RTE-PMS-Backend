import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { QuarterReviewStatus, QuarterWorkflowState } from '../constants/pms.enums';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterReview } from '../models/pms-quarter-review.model';
import { QuarterReviewValue } from '../models/pms-quarter-review-value.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { transitionQuarterAssignmentState } from './quarter-assignment-workflow.service';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
import type { IQuarterReview } from '../models/pms-quarter-review.model';

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

export interface SubmitQuarterReviewInput {
  ratings: QuarterReviewRatingInput[];
  comments: string;
  score: number;
  overallRating?: string;
  recommendation?: string;
  attachments?: QuarterReviewAttachmentInput[];
  reviewValues?: QuarterReviewValueInput[];
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

export class QuarterReviewService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async submitQuarterReview(
    quarterAssignmentId: string,
    input: SubmitQuarterReviewInput,
  ): Promise<SubmitQuarterReviewResult> {
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    this.assertManagerAccess('quarterReview.submit', quarterAssignment);
    this.validateReviewInput(input);

    if (quarterAssignment.quarterState !== QuarterWorkflowState.MANAGER_REVIEW_OPEN) {
      throw new Error('Quarter review can be submitted only when manager review is open');
    }

    const existingReview = await QuarterReview.findOne({
      quarterAssignmentId: quarterAssignment._id,
    });

    if (existingReview?.submittedAt) {
      throw new Error('Quarter review already submitted');
    }

    const reviewPayload = {
      quarterAssignmentId: quarterAssignment._id,
      annualAssignmentId: quarterAssignment.annualAssignmentId,
      cycleId: quarterAssignment.cycleId,
      employeeId: quarterAssignment.employeeId,
      managerId: quarterAssignment.assignedManagerId,
      reviewStatus: QuarterReviewStatus.MANAGER_REVIEW_SUBMITTED,
      ratings: this.normalizeRatings(input.ratings),
      comments: input.comments,
      score: input.score,
      overallScore: input.score,
      overallRating: input.overallRating,
      finalQuarterRemarks: input.comments,
      recommendation: input.recommendation,
      attachments: this.normalizeAttachments(input.attachments ?? []),
      submittedAt: new Date(),
    };

    const quarterReview = existingReview
      ? await QuarterReview.findByIdAndUpdate(existingReview._id, reviewPayload, {
        new: true,
        runValidators: true,
      })
      : await QuarterReview.create(reviewPayload);

    if (!quarterReview) {
      throw new Error('Unable to submit quarter review');
    }

    await this.persistQuarterReviewValues(quarterReview, quarterAssignment, input);

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

    const updatedQuarterAssignment = await transitionQuarterAssignmentState(
      quarterAssignment._id.toString(),
      QuarterWorkflowState.QUARTER_FINALIZED,
      this.requireActor(),
    );

    await QuarterReview.findOneAndUpdate(
      { quarterAssignmentId: quarterAssignment._id },
      {
        $set: {
          finalizedAt: new Date(),
          reviewStatus: QuarterReviewStatus.FINALIZED,
        },
      },
      { new: true },
    );

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

    const updatedQuarterAssignment = await transitionQuarterAssignmentState(
      quarterAssignment._id.toString(),
      QuarterWorkflowState.REOPENED_BY_ADMIN,
      this.requireActor(),
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

  private validateReviewInput(input: SubmitQuarterReviewInput): void {
    if (!Array.isArray(input.ratings) || input.ratings.length === 0) {
      throw new Error('At least one review rating is required');
    }

    if (!input.comments?.trim()) {
      throw new Error('Review comments are required');
    }

    if (input.score === undefined || input.score === null || Number.isNaN(Number(input.score))) {
      throw new Error('Review score is required');
    }
  }

  private normalizeRatings(ratings: QuarterReviewRatingInput[]) {
    return ratings.map((rating) => ({
      objectiveId: rating.objectiveId && Types.ObjectId.isValid(rating.objectiveId)
        ? new Types.ObjectId(rating.objectiveId)
        : undefined,
      rating: rating.rating,
      comments: rating.comments,
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
    input: SubmitQuarterReviewInput,
  ): Promise<void> {
    const actor = this.requireActor();
    const actorUserId = new Types.ObjectId(actor.actorId);
    const submittedAt = quarterReview.submittedAt ?? new Date();
    const baseValue = {
      quarterReviewId: quarterReview._id,
      quarterAssignmentId: quarterAssignment._id,
      annualAssignmentId: quarterAssignment.annualAssignmentId,
      cycleId: quarterAssignment.cycleId,
      employeeId: quarterAssignment.employeeId,
      roleCode: 'MANAGER',
      actorUserId,
      workflowStage: 'MANAGER_REVIEW',
      valueStatus: 'ACTIVE',
      submittedAt,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };

    const valuesToCreate = [
      {
        ...baseValue,
        fieldKey: 'manager_comments',
        sectionKey: 'manager_quarter_review',
        valueText: input.comments,
      },
      {
        ...baseValue,
        fieldKey: 'manager_score',
        sectionKey: 'manager_quarter_review',
        valueNumber: input.score,
      },
      ...(input.overallRating
        ? [{
          ...baseValue,
          fieldKey: 'manager_rating',
          sectionKey: 'manager_quarter_review',
          valueText: input.overallRating,
        }]
        : []),
      ...(input.recommendation
        ? [{
          ...baseValue,
          fieldKey: 'manager_recommendation',
          sectionKey: 'manager_quarter_review',
          valueText: input.recommendation,
        }]
        : []),
      ...this.normalizeRatingValues(input.ratings, baseValue),
      ...this.normalizeExplicitReviewValues(input.reviewValues ?? [], actorUserId, submittedAt, baseValue),
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
      valueNumber: rating.rating,
      valueText: rating.comments,
      valueJson: {
        objectiveId: rating.objectiveId,
        rating: rating.rating,
        comments: rating.comments,
        displayOrder: index + 1,
      },
    }));
  }

  private normalizeExplicitReviewValues(
    reviewValues: QuarterReviewValueInput[],
    defaultActorUserId: Types.ObjectId,
    submittedAt: Date,
    baseValue: Record<string, unknown>,
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
      valueStatus: reviewValue.valueStatus ?? 'ACTIVE',
      submittedAt,
    }));
  }

  private assertManagerAccess(action: string, quarterAssignment: IQuarterAssignment): void {
    const access = accessService.canPerform({
      actor: this.requireActor(),
      action,
      resource: {
        employeeId: quarterAssignment.employeeId.toString(),
        managerId: quarterAssignment.assignedManagerId.toString(),
      },
    });

    if (!access.allowed || access.mappedRole !== 'Manager') {
      throw new Error(access.message ?? 'Only the assigned manager can submit quarter review');
    }
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
    if (!quarterAssignment) {
      throw new Error('Quarter assignment not found');
    }

    return quarterAssignment;
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
