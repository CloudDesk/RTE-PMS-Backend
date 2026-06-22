import mongoose, { Document, Schema, Types } from 'mongoose';
import { AssessmentTermCode, AssessmentTermType, TermWorkflowState } from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
  TermWorkflowState as TermWorkflowStateType,
} from '../constants/pms.enums';

export interface ITermAssignment extends Document {
  annualAssignmentId: Types.ObjectId;
  cycleId?: Types.ObjectId;
  cycleTermId?: Types.ObjectId;
  employeeId: Types.ObjectId;
  assignedManagerId: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  assessmentTermCode: AssessmentTermCodeType;
  assessmentTermType?: AssessmentTermTypeType;
  termCode?: AssessmentTermCodeType;
  termLabel?: string;
  termState: TermWorkflowStateType;
  previousTermState?: TermWorkflowStateType;
  lastTransitionAt?: Date;
  lastTransitionBy?: Types.ObjectId;
  lastTransitionRole?: string;
  lastTransitionReason?: string;
  objectiveSettingClosedBy?: Types.ObjectId;
  objectiveSettingClosedAt?: Date;
  objectiveSettingCloseReason?: string;
  objectiveSettingCloseSource?: string;
  termScore?: number;
  termRating?: string;
  termSummary?: Record<string, unknown>;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const termAssignmentSchema = new Schema<ITermAssignment>(
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
    cycleTermId: {
      type: Schema.Types.ObjectId,
      ref: 'TermCycle',
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
    termState: {
      type: String,
      required: true,
      enum: Object.values(TermWorkflowState),
      default: TermWorkflowState.NOT_STARTED,
    },
    previousTermState: {
      type: String,
      enum: Object.values(TermWorkflowState),
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
    termScore: { type: Number, min: 0 },
    termRating: String,
    termSummary: { type: Schema.Types.Mixed, default: {} },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'term_assignments',
    timestamps: true,
  },
);

termAssignmentSchema.index(
  { annualAssignmentId: 1, assessmentTermCode: 1 },
  { unique: true, name: 'idx_annual_assignment_term' },
);
termAssignmentSchema.index({ cycleTermId: 1, termState: 1 });
termAssignmentSchema.index({ assignedManagerId: 1, termState: 1 });
termAssignmentSchema.index({ employeeId: 1, cycleId: 1, assessmentTermCode: 1 });

export const TermAssignment = mongoose.model<ITermAssignment>(
  'TermAssignment',
  termAssignmentSchema,
);
