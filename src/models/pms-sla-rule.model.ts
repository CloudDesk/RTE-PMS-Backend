import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISlaRule extends Document {
  name: string;
  eventType: string;
  entityType: string;
  targetRole: string;
  baseDatePointer: 'CYCLE_START' | 'QUARTER_START' | 'PREVIOUS_TRANSITION' | 'FIXED_DATE';
  offsetDays: number;
  fixedDate?: Date;
  isActive: boolean;
  cycleId?: Types.ObjectId;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const slaRuleSchema = new Schema<ISlaRule>(
  {
    name: { type: String, required: true, trim: true },
    eventType: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    targetRole: { type: String, required: true, trim: true },
    baseDatePointer: {
      type: String,
      enum: ['CYCLE_START', 'QUARTER_START', 'PREVIOUS_TRANSITION', 'FIXED_DATE'],
      required: true,
    },
    offsetDays: { type: Number, required: true, default: 0 },
    fixedDate: Date,
    isActive: { type: Boolean, default: true, index: true },
    cycleId: { type: Schema.Types.ObjectId, ref: 'AnnualCycle', index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'sla_rules',
    timestamps: true,
  },
);

export const SlaRule = mongoose.model<ISlaRule>('SlaRule', slaRuleSchema);
