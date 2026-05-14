import mongoose, { Document, Schema, Types } from 'mongoose';
import { AnnualWorkflowState } from '../constants/pms.enums';
import type { AnnualWorkflowState as AnnualWorkflowStateType } from '../constants/pms.enums';

export interface IAnnualAssignment extends Document {
  employeeId: Types.ObjectId;
  managerId: Types.ObjectId;
  annualCycleId: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  quarterAssignmentIds: Types.ObjectId[];
  workflowState: AnnualWorkflowStateType;
  finalDecisionStatus?: AnnualWorkflowStateType;
  employeeGradeVisible: boolean;
  employeeMeritVisible: boolean;
  employeeReviewVisible: boolean;
  managerGradeVisible: boolean;
  managerMeritVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const annualAssignmentSchema = new Schema<IAnnualAssignment>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    annualCycleId: {
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
    workflowState: {
      type: String,
      required: true,
      enum: Object.values(AnnualWorkflowState),
      default: AnnualWorkflowState.DRAFT,
      index: true,
    },
    finalDecisionStatus: {
      type: String,
      enum: Object.values(AnnualWorkflowState),
      default: AnnualWorkflowState.DRAFT,
    },
    employeeGradeVisible: { type: Boolean, default: false },
    employeeMeritVisible: { type: Boolean, default: false },
    employeeReviewVisible: { type: Boolean, default: false },
    managerGradeVisible: { type: Boolean, default: false },
    managerMeritVisible: { type: Boolean, default: false },
  },
  {
    collection: 'annualAssignments',
    timestamps: true,
  },
);

annualAssignmentSchema.index(
  { employeeId: 1, annualCycleId: 1 },
  { unique: true, name: 'idx_employee_annual_cycle' },
);

export const AnnualAssignment = mongoose.model<IAnnualAssignment>(
  'AnnualAssignment',
  annualAssignmentSchema,
);
