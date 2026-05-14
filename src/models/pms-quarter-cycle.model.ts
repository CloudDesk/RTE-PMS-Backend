import mongoose, { Document, Schema, Types } from 'mongoose';
import { QuarterWorkflowState } from '../constants/pms.enums';
import type { QuarterWorkflowState as QuarterWorkflowStateType } from '../constants/pms.enums';

interface IDateWindow {
  startDate?: Date;
  endDate?: Date;
}

export interface IQuarterCycle extends Document {
  annualCycleId: Types.ObjectId;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  startDate: Date;
  endDate: Date;
  objectiveWindow?: IDateWindow;
  reviewWindow?: IDateWindow;
  status: QuarterWorkflowStateType;
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
    annualCycleId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualCycle',
      index: true,
    },
    quarter: {
      type: String,
      required: true,
      enum: ['Q1', 'Q2', 'Q3', 'Q4'],
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    objectiveWindow: dateWindowSchema,
    reviewWindow: dateWindowSchema,
    status: {
      type: String,
      required: true,
      enum: Object.values(QuarterWorkflowState),
      default: QuarterWorkflowState.NOT_STARTED,
      index: true,
    },
  },
  {
    collection: 'quarterCycles',
    timestamps: true,
  },
);

quarterCycleSchema.index(
  { annualCycleId: 1, quarter: 1 },
  { unique: true, name: 'idx_annual_cycle_quarter' },
);

export const QuarterCycle = mongoose.model<IQuarterCycle>(
  'QuarterCycle',
  quarterCycleSchema,
);
