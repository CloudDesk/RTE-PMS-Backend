import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { QuarterWorkflowState } from '../constants/pms.enums';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterReview } from '../models/pms-quarter-review.model';
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

export interface SubmitQuarterReviewInput {
  ratings: QuarterReviewRatingInput[];
  comments: string;
  score: number;
  recommendation?: string;
  attachments?: QuarterReviewAttachmentInput[];
}

export interface SubmitQuarterReviewResult {
  quarterReview: IQuarterReview;
  quarterAssignment: IQuarterAssignment;
}

export interface FinalizeQuarterAssignmentResult {
  quarterAssignment: IQuarterAssignment;
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

    if (quarterAssignment.workflowState !== QuarterWorkflowState.MANAGER_REVIEW_OPEN) {
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
      employeeId: quarterAssignment.employeeId,
      managerId: quarterAssignment.managerId,
      ratings: this.normalizeRatings(input.ratings),
      comments: input.comments,
      score: input.score,
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

    if (quarterAssignment.workflowState !== QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED) {
      throw new Error('Quarter can be finalized only after manager review submission');
    }

    const updatedQuarterAssignment = await transitionQuarterAssignmentState(
      quarterAssignment._id.toString(),
      QuarterWorkflowState.QUARTER_FINALIZED,
      this.requireActor(),
    );

    await QuarterReview.findOneAndUpdate(
      { quarterAssignmentId: quarterAssignment._id },
      { $set: { finalizedAt: new Date() } },
      { new: true },
    );

    await this.audit(
      'PMS_QUARTER_ASSIGNMENT_FINALIZED',
      'QUARTER_ASSIGNMENT',
      updatedQuarterAssignment._id.toString(),
      { workflowState: quarterAssignment.workflowState },
      { workflowState: updatedQuarterAssignment.workflowState },
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

  private assertManagerAccess(action: string, quarterAssignment: IQuarterAssignment): void {
    const access = accessService.canPerform({
      actor: this.requireActor(),
      action,
      resource: {
        employeeId: quarterAssignment.employeeId.toString(),
        managerId: quarterAssignment.managerId.toString(),
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
