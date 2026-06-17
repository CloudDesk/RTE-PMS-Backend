import mongoose, { Document, Schema, Types } from 'mongoose';
import { AssessmentTermCode, AssessmentTermType, QuarterWorkflowState } from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
  QuarterWorkflowState as QuarterWorkflowStateType,
} from '../constants/pms.enums';

export interface IQuarterAssignment extends Document {
  annualAssignmentId: Types.ObjectId;
  cycleId?: Types.ObjectId;
  cycleQuarterId?: Types.ObjectId;
  employeeId: Types.ObjectId;
  assignedManagerId: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  quarterCode: AssessmentTermCodeType;
  assessmentTermType?: AssessmentTermTypeType;
  termCode?: AssessmentTermCodeType;
  termLabel?: string;
  quarterState: QuarterWorkflowStateType;
  previousQuarterState?: QuarterWorkflowStateType;
  lastTransitionAt?: Date;
  lastTransitionBy?: Types.ObjectId;
  lastTransitionRole?: string;
  lastTransitionReason?: string;
  objectiveSettingClosedBy?: Types.ObjectId;
  objectiveSettingClosedAt?: Date;
  objectiveSettingCloseReason?: string;
  objectiveSettingCloseSource?: string;
  quarterScore?: number;
  quarterRating?: string;
  quarterSummary?: Record<string, unknown>;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const quarterAssignmentSchema = new Schema<IQuarterAssignment>(
  {
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'AnnualAssignment',
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    cycleQuarterId: {
      type: Schema.Types.ObjectId,
      ref: 'QuarterCycle',
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'User',
    },
    assignedManagerId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'User',
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      required: false,
      index: true,
      ref: 'PmsTemplateVersion',
    },
    quarterCode: {
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
    quarterState: {
      type: String,
      required: true,
      enum: Object.values(QuarterWorkflowState),
      default: QuarterWorkflowState.NOT_STARTED,
    },
    previousQuarterState: {
      type: String,
      enum: Object.values(QuarterWorkflowState),
    },
    lastTransitionAt: Date,
    lastTransitionBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    lastTransitionRole: String,
    lastTransitionReason: String,
    objectiveSettingClosedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    objectiveSettingClosedAt: Date,
    objectiveSettingCloseReason: String,
    objectiveSettingCloseSource: { type: String, trim: true },
    quarterScore: { type: Number, min: 0 },
    quarterRating: String,
    quarterSummary: { type: Schema.Types.Mixed, default: {} },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'quarter_assignments',
    timestamps: true,
  },
);

quarterAssignmentSchema.index(
  { annualAssignmentId: 1, quarterCode: 1 },
  { unique: true, name: 'idx_annual_assignment_quarter' },
);
quarterAssignmentSchema.index({ cycleQuarterId: 1, quarterState: 1 });
quarterAssignmentSchema.index({ assignedManagerId: 1, quarterState: 1 });
quarterAssignmentSchema.index({ employeeId: 1, cycleId: 1, quarterCode: 1 });

export const QuarterAssignment = mongoose.model<IQuarterAssignment>(
  'QuarterAssignment',
  quarterAssignmentSchema,
);
