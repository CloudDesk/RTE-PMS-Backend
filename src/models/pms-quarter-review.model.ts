import mongoose, { Document, Schema, Types } from 'mongoose';

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
  employeeId: Types.ObjectId;
  managerId: Types.ObjectId;
  ratings: IQuarterReviewRating[];
  comments?: string;
  score?: number;
  recommendation?: string;
  attachments: IPmsAttachment[];
  submittedAt?: Date;
  finalizedAt?: Date;
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
    ratings: {
      type: [ratingSchema],
      default: [],
    },
    comments: String,
    score: { type: Number, min: 0 },
    recommendation: String,
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    submittedAt: Date,
    finalizedAt: Date,
  },
  {
    collection: 'quarterReviews',
    timestamps: true,
  },
);

quarterReviewSchema.index(
  { quarterAssignmentId: 1 },
  { name: 'idx_quarter_review_quarter_assignment' },
);

export const QuarterReview = mongoose.model<IQuarterReview>(
  'QuarterReview',
  quarterReviewSchema,
);
