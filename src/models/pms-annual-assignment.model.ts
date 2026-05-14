import mongoose, { Document, Schema, Types } from 'mongoose';
import { AnnualDecisionStatus, AnnualWorkflowState } from '../constants/pms.enums';
import type {
  AnnualDecisionStatus as AnnualDecisionStatusType,
  AnnualWorkflowState as AnnualWorkflowStateType,
} from '../constants/pms.enums';

type QuarterCode = 'Q1' | 'Q2' | 'Q3' | 'Q4';

interface IVisibilityCache {
  cacheSource?: string;
  employeeReviewVisible: boolean;
  employeeGradeVisible: boolean;
  employeeMeritVisible: boolean;
  managerGradeVisible: boolean;
  managerMeritVisible: boolean;
}

export interface IAnnualAssignment extends Document {
  employeeId: Types.ObjectId;
  assignedManagerId: Types.ObjectId;
  cycleId: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  quarterAssignmentIds: Types.ObjectId[];
  annualState: AnnualWorkflowStateType;
  finalDecisionStatus?: AnnualDecisionStatusType;
  isGradeApplied?: boolean;
  isMeritApplied?: boolean;
  appraisalOutcomeType?: string;
  applicableQuarters: QuarterCode[];
  assignmentReason: string;
  visibility: IVisibilityCache;
  employeeSnapshot?: Record<string, unknown>;
  managerSnapshot?: Record<string, unknown>;
  orgSnapshot?: Record<string, unknown>;
  communicationStatus?: string;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const visibilityCacheSchema = new Schema<IVisibilityCache>(
  {
    cacheSource: { type: String, default: 'visibility_configurations' },
    employeeReviewVisible: { type: Boolean, default: false },
    employeeGradeVisible: { type: Boolean, default: false },
    employeeMeritVisible: { type: Boolean, default: false },
    managerGradeVisible: { type: Boolean, default: false },
    managerMeritVisible: { type: Boolean, default: false },
  },
  { _id: false },
);

const annualAssignmentSchema = new Schema<IAnnualAssignment>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    assignedManagerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualCycle',
      index: true,
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      required: false,
      ref: 'PmsTemplateVersion',
      index: true,
    },
    quarterAssignmentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'QuarterAssignment' }],
      default: [],
    },
    annualState: {
      type: String,
      required: true,
      enum: Object.values(AnnualWorkflowState),
      default: AnnualWorkflowState.DRAFT,
      index: true,
    },
    finalDecisionStatus: {
      type: String,
      enum: Object.values(AnnualDecisionStatus),
      default: AnnualDecisionStatus.DRAFT,
    },
    isGradeApplied: Boolean,
    isMeritApplied: Boolean,
    appraisalOutcomeType: String,
    applicableQuarters: {
      type: [{ type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'] }],
      default: ['Q1', 'Q2', 'Q3', 'Q4'],
    },
    assignmentReason: { type: String, default: 'FULL_YEAR' },
    visibility: { type: visibilityCacheSchema, default: () => ({}) },
    employeeSnapshot: { type: Schema.Types.Mixed, default: {} },
    managerSnapshot: { type: Schema.Types.Mixed, default: {} },
    orgSnapshot: { type: Schema.Types.Mixed, default: {} },
    communicationStatus: { type: String, default: 'NOT_REQUIRED' },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'annualAssignments',
    timestamps: true,
  },
);

annualAssignmentSchema.index(
  { employeeId: 1, cycleId: 1 },
  { unique: true, name: 'idx_employee_annual_cycle' },
);
annualAssignmentSchema.index({ assignedManagerId: 1, annualState: 1 });
annualAssignmentSchema.index({ cycleId: 1, assignedManagerId: 1, annualState: 1 });
annualAssignmentSchema.index({ cycleId: 1, appraisalOutcomeType: 1 });
annualAssignmentSchema.index({ cycleId: 1, 'employeeSnapshot.department': 1 });
annualAssignmentSchema.index({ cycleId: 1, 'orgSnapshot.businessUnit': 1 });

export const AnnualAssignment = mongoose.model<IAnnualAssignment>(
  'AnnualAssignment',
  annualAssignmentSchema,
);
