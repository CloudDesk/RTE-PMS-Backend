import mongoose, { Document, Schema, Types } from 'mongoose';
import { AnnualWorkflowState } from '../constants/pms.enums';
import type { AnnualWorkflowState as AnnualWorkflowStateType } from '../constants/pms.enums';

export interface ICommunicationRuleConfig {
  skipNilOutcome?: boolean;
  [key: string]: unknown;
}

export interface IAnnualCycle extends Document {
  name: string;
  code: string;
  appraisalYear: number;
  startDate: Date;
  endDate: Date;
  status: AnnualWorkflowStateType;
  templateVersionId?: Types.ObjectId;
  quarterCycleIds: Types.ObjectId[];
  appraisalWindowConfig?: Record<string, unknown>;
  communicationRuleConfig?: ICommunicationRuleConfig;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  launchedAt?: Date;
  closedAt?: Date;
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
    appraisalWindowConfig: { type: Schema.Types.Mixed, default: {} },
    communicationRuleConfig: { type: Schema.Types.Mixed, default: {} },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
    launchedAt: Date,
    closedAt: Date,
  },
  {
    collection: 'annual_cycles',
    timestamps: true,
  },
);

annualCycleSchema.index({ code: 1 }, { unique: true, name: 'idx_annual_cycle_code' });
annualCycleSchema.index({ appraisalYear: 1 });
annualCycleSchema.index({ status: 1 });
annualCycleSchema.index({ templateVersionId: 1 });

export const AnnualCycle = mongoose.model<IAnnualCycle>(
  'AnnualCycle',
  annualCycleSchema,
);
