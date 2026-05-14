import mongoose, { Document, Schema, Types } from 'mongoose';
import { AnnualWorkflowState } from '../constants/pms.enums';
import type { AnnualWorkflowState as AnnualWorkflowStateType } from '../constants/pms.enums';

export interface IAnnualCycle extends Document {
  name: string;
  code: string;
  appraisalYear: number;
  startDate: Date;
  endDate: Date;
  status: AnnualWorkflowStateType;
  templateVersionId?: Types.ObjectId;
  quarterCycleIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const annualCycleSchema = new Schema<IAnnualCycle>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    appraisalYear: {
      type: Number,
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(AnnualWorkflowState),
      default: AnnualWorkflowState.DRAFT,
      index: true,
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      required: false,
      ref: 'PmsTemplateVersion',
    },
    quarterCycleIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'QuarterCycle' }],
      default: [],
    },
  },
  {
    collection: 'annualCycles',
    timestamps: true,
  },
);

export const AnnualCycle = mongoose.model<IAnnualCycle>(
  'AnnualCycle',
  annualCycleSchema,
);
