import mongoose, { Document, Schema, Types } from 'mongoose';
import { AnnualDecisionStatus, AppraisalOutcomeType } from '../constants/pms.enums';
import type {
  AnnualDecisionStatus as AnnualDecisionStatusType,
  AppraisalOutcomeType as AppraisalOutcomeTypeType,
} from '../constants/pms.enums';

export interface IAnnualDecision extends Document {
  annualAssignmentId: Types.ObjectId;
  cycleId: Types.ObjectId;
  employeeId: Types.ObjectId;
  isGradeApplied?: boolean;
  isMeritApplied?: boolean;
  appraisalOutcomeType?: AppraisalOutcomeTypeType;
  gradeDetails?: Record<string, unknown>;
  meritDetails?: Record<string, unknown>;
  nilReason?: string;
  managementRemarks?: string;
  finalScore?: number;
  finalRating?: string;
  decisionStatus: AnnualDecisionStatusType;
  decidedBy?: Types.ObjectId;
  submittedBy?: Types.ObjectId;
  submittedAt?: Date;
  frozenAt?: Date;
  frozenBy?: Types.ObjectId;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
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
    cycleId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualCycle',
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
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
    managementRemarks: String,
    finalScore: { type: Number, min: 0, max: 100 },
    finalRating: String,
    decisionStatus: {
      type: String,
      required: true,
      enum: Object.values(AnnualDecisionStatus),
      default: AnnualDecisionStatus.DRAFT,
      index: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: Date,
    frozenAt: Date,
    frozenBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'annual_decisions',
    timestamps: true,
  },
);

annualDecisionSchema.index(
  { annualAssignmentId: 1 },
  { unique: true, name: 'idx_annual_decision_assignment' },
);
annualDecisionSchema.index({ employeeId: 1, cycleId: 1 });
annualDecisionSchema.index({ cycleId: 1, appraisalOutcomeType: 1 });
annualDecisionSchema.index({ decisionStatus: 1 });

export const AnnualDecision = mongoose.model<IAnnualDecision>(
  'AnnualDecision',
  annualDecisionSchema,
);
