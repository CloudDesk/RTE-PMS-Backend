import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITermReviewValue extends Document {
  termReviewId: Types.ObjectId;
  termAssignmentId: Types.ObjectId;
  annualAssignmentId: Types.ObjectId;
  cycleId?: Types.ObjectId;
  employeeId: Types.ObjectId;
  templateFieldId?: string;
  fieldKey: string;
  sectionKey: string;
  roleCode: string;
  actorUserId: Types.ObjectId;
  workflowStage: string;
  valueJson?: unknown;
  valueText?: string;
  valueNumber?: number;
  valueDate?: Date;
  valueStatus: string;
  submittedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const termReviewValueSchema = new Schema<ITermReviewValue>(
  {
    termReviewId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'TermReview',
      index: true,
    },
    termAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'TermAssignment',
      index: true,
    },
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
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
    templateFieldId: String,
    fieldKey: { type: String, required: true, trim: true },
    sectionKey: { type: String, required: true, trim: true },
    roleCode: { type: String, required: true, trim: true },
    actorUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    workflowStage: { type: String, required: true, trim: true },
    valueJson: Schema.Types.Mixed,
    valueText: String,
    valueNumber: Number,
    valueDate: Date,
    valueStatus: { type: String, default: 'ACTIVE', trim: true },
    submittedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'term_review_values',
    timestamps: true,
  },
);

termReviewValueSchema.index({
  termReviewId: 1,
  fieldKey: 1,
  roleCode: 1,
  actorUserId: 1,
});
termReviewValueSchema.index({ termAssignmentId: 1, sectionKey: 1 });
termReviewValueSchema.index({ cycleId: 1, employeeId: 1 });
termReviewValueSchema.index({ fieldKey: 1, roleCode: 1 });

export const TermReviewValue = mongoose.model<ITermReviewValue>(
  'TermReviewValue',
  termReviewValueSchema,
);
