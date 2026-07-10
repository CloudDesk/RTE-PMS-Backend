import mongoose, { Document, Schema, Types } from 'mongoose';
import { IProbationReviewReviewerConfiguration } from './pms-probation-review-assignment.model';

export interface IProbationReviewDraftAssignmentRow {
  rowId?: string;
  employeeId: Types.ObjectId;
  joiningDate?: Date;
  probationStartDate?: Date;
  probationEndDate: Date;
  reviewOpenOffsetDays?: number;
  manager1Id: Types.ObjectId;
  manager2Id: Types.ObjectId;
  reviewerConfiguration?: IProbationReviewReviewerConfiguration;
}

export interface IPmsProbationReviewDraft extends Document {
  templateId: Types.ObjectId;
  templateVersionId: Types.ObjectId;
  assignments: IProbationReviewDraftAssignmentRow[];
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const probationReviewDraftRowSchema = new Schema<IProbationReviewDraftAssignmentRow>(
  {
    rowId: { type: String, trim: true },
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    joiningDate: Date,
    probationStartDate: Date,
    probationEndDate: { type: Date, required: true },
    reviewOpenOffsetDays: { type: Number, min: 0, default: 30 },
    manager1Id: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    manager2Id: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    reviewerConfiguration: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false },
);

const probationReviewDraftSchema = new Schema<IPmsProbationReviewDraft>(
  {
    templateId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsTemplate',
      index: true,
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsTemplateVersion',
      index: true,
    },
    assignments: {
      type: [probationReviewDraftRowSchema],
      default: [],
      validate: {
        validator: (rows: IProbationReviewDraftAssignmentRow[]) => rows.length > 0,
        message: 'Draft must contain at least one assignment row.',
      },
    },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'pms_probation_review_drafts',
  },
);

probationReviewDraftSchema.index({ createdBy: 1, updatedAt: -1 });

export const PmsProbationReviewDraft =
  mongoose.models.PmsProbationReviewDraft ||
  mongoose.model<IPmsProbationReviewDraft>(
    'PmsProbationReviewDraft',
    probationReviewDraftSchema,
  );
