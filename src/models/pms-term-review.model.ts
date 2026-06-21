import mongoose, { Document, Schema, Types } from 'mongoose';
import { TermReviewStatus } from '../constants/pms.enums';
import type { TermReviewStatus as TermReviewStatusType } from '../constants/pms.enums';

interface IPmsAttachment {
  fileName?: string;
  fileUrl?: string;
  documentId?: string;
  uploadedBy?: Types.ObjectId;
  uploadedAt?: Date;
}

interface ITermReviewRating {
  objectiveId?: Types.ObjectId;
  rating?: number;
  comments?: string;
}

export interface ITermReview extends Document {
  termAssignmentId: Types.ObjectId;
  annualAssignmentId?: Types.ObjectId;
  cycleId?: Types.ObjectId;
  employeeId: Types.ObjectId;
  managerId: Types.ObjectId;
  reviewStatus: TermReviewStatusType;
  ratings: ITermReviewRating[];
  comments?: string;
  score?: number;
  overallScore?: number;
  overallRating?: string;
  finalTermRemarks?: string;
  recommendation?: string;
  achievements?: string;
  developmentObservations?: string;
  attachments: IPmsAttachment[];
  scoreSnapshot?: any;
  submittedAt?: Date;
  finalizedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  actingDelegateUserId?: Types.ObjectId;
  originalOwnerUserId?: Types.ObjectId;
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

const ratingSchema = new Schema<ITermReviewRating>(
  {
    objectiveId: { type: Schema.Types.ObjectId, ref: 'Objective' },
    rating: { type: Number, min: 0 },
    comments: String,
  },
  { _id: false },
);

const termReviewSchema = new Schema<ITermReview>(
  {
    termAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'TermAssignment',
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
      enum: Object.values(TermReviewStatus),
      default: TermReviewStatus.MANAGER_REVIEW_OPEN,
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
    finalTermRemarks: String,
    recommendation: String,
    achievements: String,
    developmentObservations: String,
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    scoreSnapshot: { type: Schema.Types.Mixed },
    submittedAt: Date,
    finalizedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    actingDelegateUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    originalOwnerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'term_reviews',
    timestamps: true,
  },
);

termReviewSchema.index(
  { termAssignmentId: 1 },
  { unique: true, name: 'idx_term_review_term_assignment' },
);
termReviewSchema.index({ managerId: 1, reviewStatus: 1 });
termReviewSchema.index({ cycleId: 1, reviewStatus: 1 });

export const TermReview = mongoose.model<ITermReview>(
  'TermReview',
  termReviewSchema,
);
