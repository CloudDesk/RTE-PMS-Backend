import mongoose, { Document, Schema, Types } from 'mongoose';
import { QuarterWorkflowState } from '../constants/pms.enums';
import type { QuarterWorkflowState as QuarterWorkflowStateType } from '../constants/pms.enums';

interface IDateWindow {
  startDate?: Date;
  endDate?: Date;
}

export interface IQuarterCycle extends Document {
  cycleId: Types.ObjectId;
  quarterCode: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  startDate: Date;
  endDate: Date;
  objectiveSettingWindow?: IDateWindow;
  objectiveApprovalWindow?: IDateWindow;
  managerReviewWindow?: IDateWindow;
  status: QuarterWorkflowStateType;
  slaConfig?: Record<string, unknown>;
  closureRules?: Record<string, unknown>;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const dateWindowSchema = new Schema<IDateWindow>(
  {
    startDate: Date,
    endDate: Date,
  },
  { _id: false },
);

const quarterCycleSchema = new Schema<IQuarterCycle>(
  {
    cycleId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualCycle',
      index: true,
    },
    quarterCode: {
      type: String,
      required: true,
      enum: ['Q1', 'Q2', 'Q3', 'Q4'],
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    objectiveSettingWindow: dateWindowSchema,
    objectiveApprovalWindow: dateWindowSchema,
    managerReviewWindow: dateWindowSchema,
    slaConfig: { type: Schema.Types.Mixed, default: {} },
    closureRules: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      required: true,
      enum: Object.values(QuarterWorkflowState),
      default: QuarterWorkflowState.NOT_STARTED,
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'quarter_cycles',
    timestamps: true,
  },
);

quarterCycleSchema.index(
  { cycleId: 1, quarterCode: 1 },
  { unique: true, name: 'idx_annual_cycle_quarter' },
);
quarterCycleSchema.index({ startDate: 1, endDate: 1 });

export const QuarterCycle = mongoose.model<IQuarterCycle>(
  'QuarterCycle',
  quarterCycleSchema,
);
