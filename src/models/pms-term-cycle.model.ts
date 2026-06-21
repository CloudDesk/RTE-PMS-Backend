import mongoose, { Document, Schema, Types } from 'mongoose';
import { AssessmentTermCode, AssessmentTermType, TermWorkflowState } from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
  TermWorkflowState as TermWorkflowStateType,
} from '../constants/pms.enums';

interface IDateWindow {
  startDate?: Date;
  endDate?: Date;
}

interface IAchievementSubmissionWindow extends IDateWindow {
  enabled?: boolean;
  dueDate?: Date;
  graceDays?: number;
  reminderDaysBefore?: number[];
  escalationDaysAfterDue?: number;
}

export interface ITermCycle extends Document {
  cycleId: Types.ObjectId;
  assessmentTermCode: AssessmentTermCodeType;
  assessmentTermType?: AssessmentTermTypeType;
  termCode?: AssessmentTermCodeType;
  termLabel?: string;
  startDate: Date;
  endDate: Date;
  objectiveSettingWindow?: IDateWindow;
  objectiveApprovalWindow?: IDateWindow;
  achievementSubmissionWindow?: IAchievementSubmissionWindow;
  managerReviewWindow?: IDateWindow;
  termFinalizationWindow?: IDateWindow;
  status: TermWorkflowStateType;
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

const achievementSubmissionWindowSchema = new Schema<IAchievementSubmissionWindow>(
  {
    enabled: Boolean,
    startDate: Date,
    endDate: Date,
    dueDate: Date,
    graceDays: { type: Number, min: 0 },
    reminderDaysBefore: { type: [Number], default: undefined },
    escalationDaysAfterDue: { type: Number, min: 0 },
  },
  { _id: false },
);

const termCycleSchema = new Schema<ITermCycle>(
  {
    cycleId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualCycle',
      index: true,
    },
    assessmentTermCode: {
      type: String,
      required: true,
      enum: Object.values(AssessmentTermCode),
    },
    assessmentTermType: {
      type: String,
      enum: Object.values(AssessmentTermType),
    },
    termCode: {
      type: String,
      enum: Object.values(AssessmentTermCode),
    },
    termLabel: { type: String, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    objectiveSettingWindow: dateWindowSchema,
    objectiveApprovalWindow: dateWindowSchema,
    achievementSubmissionWindow: achievementSubmissionWindowSchema,
    managerReviewWindow: dateWindowSchema,
    termFinalizationWindow: dateWindowSchema,
    slaConfig: { type: Schema.Types.Mixed, default: {} },
    closureRules: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      required: true,
      enum: Object.values(TermWorkflowState),
      default: TermWorkflowState.NOT_STARTED,
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'term_cycles',
    timestamps: true,
  },
);

termCycleSchema.index(
  { cycleId: 1, assessmentTermCode: 1 },
  { unique: true, name: 'idx_annual_cycle_term' },
);
termCycleSchema.index({ startDate: 1, endDate: 1 });

export const TermCycle = mongoose.model<ITermCycle>(
  'TermCycle',
  termCycleSchema,
);
