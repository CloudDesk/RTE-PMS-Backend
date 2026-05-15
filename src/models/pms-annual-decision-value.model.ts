import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAnnualDecisionValue extends Document {
  annualDecisionId: Types.ObjectId;
  annualAssignmentId: Types.ObjectId;
  templateFieldId?: string;
  fieldKey: string;
  sectionKey: string;
  roleCode: string;
  actorUserId: Types.ObjectId;
  valueJson?: unknown;
  valueText?: string;
  valueNumber?: number;
  valueDate?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const annualDecisionValueSchema = new Schema<IAnnualDecisionValue>(
  {
    annualDecisionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualDecision',
      index: true,
    },
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualAssignment',
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
    valueJson: Schema.Types.Mixed,
    valueText: String,
    valueNumber: Number,
    valueDate: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'annual_decision_values',
    timestamps: true,
  },
);

annualDecisionValueSchema.index({ annualDecisionId: 1 });
annualDecisionValueSchema.index({ annualAssignmentId: 1, fieldKey: 1, roleCode: 1 });

export const AnnualDecisionValue = mongoose.model<IAnnualDecisionValue>(
  'AnnualDecisionValue',
  annualDecisionValueSchema,
);
