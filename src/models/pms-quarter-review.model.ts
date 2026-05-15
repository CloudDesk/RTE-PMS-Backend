import mongoose, { Document, Schema, Types } from 'mongoose';
import { QuarterReviewStatus } from '../constants/pms.enums';
import type { QuarterReviewStatus as QuarterReviewStatusType } from '../constants/pms.enums';

interface IPmsAttachment {
  fileName?: string;
  fileUrl?: string;
  documentId?: string;
  uploadedBy?: Types.ObjectId;
  uploadedAt?: Date;
}

interface IQuarterReviewRating {
  objectiveId?: Types.ObjectId;
  rating?: number;
  comments?: string;
}

export interface IQuarterReview extends Document {
  quarterAssignmentId: Types.ObjectId;
  annualAssignmentId?: Types.ObjectId;
  cycleId?: Types.ObjectId;
  employeeId: Types.ObjectId;
  managerId: Types.ObjectId;
  reviewStatus: QuarterReviewStatusType;
  ratings: IQuarterReviewRating[];
  comments?: string;
  score?: number;
  overallScore?: number;
  overallRating?: string;
  finalQuarterRemarks?: string;
  recommendation?: string;
  attachments: IPmsAttachment[];
  submittedAt?: Date;
  finalizedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<IPmsAttachment>(
  {
    fileName: String,
    fileUrl: String,
    documentId: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: Date,
  },
  { _id: false },
);

const ratingSchema = new Schema<IQuarterReviewRating>(
  {
    objectiveId: { type: Schema.Types.ObjectId, ref: 'Objective' },
    rating: { type: Number, min: 0 },
    comments: String,
  },
  { _id: false },
);

const quarterReviewSchema = new Schema<IQuarterReview>(
  {
    quarterAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'QuarterAssignment',
    },
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualAssignment',
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    reviewStatus: {
      type: String,
      required: true,
      enum: Object.values(QuarterReviewStatus),
      default: QuarterReviewStatus.MANAGER_REVIEW_OPEN,
      index: true,
    },
    ratings: {
      type: [ratingSchema],
      default: [],
    },
    comments: String,
    score: { type: Number, min: 0 },
    overallScore: { type: Number, min: 0 },
    overallRating: String,
    finalQuarterRemarks: String,
    recommendation: String,
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    submittedAt: Date,
    finalizedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'quarter_reviews',
    timestamps: true,
  },
);

quarterReviewSchema.index(
  { quarterAssignmentId: 1 },
  { unique: true, name: 'idx_quarter_review_quarter_assignment' },
);
quarterReviewSchema.index({ managerId: 1, reviewStatus: 1 });
quarterReviewSchema.index({ cycleId: 1, reviewStatus: 1 });

export const QuarterReview = mongoose.model<IQuarterReview>(
  'QuarterReview',
  quarterReviewSchema,
);
