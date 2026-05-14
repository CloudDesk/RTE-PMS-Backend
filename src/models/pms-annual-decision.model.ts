import mongoose, { Document, Schema, Types } from 'mongoose';
import { AnnualWorkflowState, AppraisalOutcomeType } from '../constants/pms.enums';
import type {
  AnnualWorkflowState as AnnualWorkflowStateType,
  AppraisalOutcomeType as AppraisalOutcomeTypeType,
} from '../constants/pms.enums';

export interface IAnnualDecision extends Document {
  annualAssignmentId: Types.ObjectId;
  isGradeApplied?: boolean;
  isMeritApplied?: boolean;
  appraisalOutcomeType?: AppraisalOutcomeTypeType;
  gradeDetails?: Record<string, unknown>;
  meritDetails?: Record<string, unknown>;
  nilReason?: string;
  status: AnnualWorkflowStateType;
  frozenAt?: Date;
  frozenBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const annualDecisionSchema = new Schema<IAnnualDecision>(
  {
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualAssignment',
    },
    isGradeApplied: Boolean,
    isMeritApplied: Boolean,
    appraisalOutcomeType: {
      type: String,
      enum: Object.values(AppraisalOutcomeType),
    },
    gradeDetails: Schema.Types.Mixed,
    meritDetails: Schema.Types.Mixed,
    nilReason: String,
    status: {
      type: String,
      required: true,
      enum: Object.values(AnnualWorkflowState),
      default: AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT,
      index: true,
    },
    frozenAt: Date,
    frozenBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    collection: 'annualDecisions',
    timestamps: true,
  },
);

annualDecisionSchema.index(
  { annualAssignmentId: 1 },
  { unique: true, name: 'idx_annual_decision_assignment' },
);

export const AnnualDecision = mongoose.model<IAnnualDecision>(
  'AnnualDecision',
  annualDecisionSchema,
);
