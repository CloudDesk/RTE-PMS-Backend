import mongoose, { Document, Schema, Types } from 'mongoose';
import { QuarterWorkflowState } from '../constants/pms.enums';
import type { QuarterWorkflowState as QuarterWorkflowStateType } from '../constants/pms.enums';

export interface IQuarterAssignment extends Document {
  annualAssignmentId: Types.ObjectId;
  employeeId: Types.ObjectId;
  managerId: Types.ObjectId;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  workflowState: QuarterWorkflowStateType;
  previousWorkflowState?: QuarterWorkflowStateType;
  lastTransitionAt?: Date;
  lastTransitionBy?: Types.ObjectId;
  lastTransitionRole?: string;
  lastTransitionReason?: string;
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
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'User',
    },
    managerId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: 'User',
    },
    quarter: {
      type: String,
      required: true,
      enum: ['Q1', 'Q2', 'Q3', 'Q4'],
    },
    workflowState: {
      type: String,
      required: true,
      enum: Object.values(QuarterWorkflowState),
      default: QuarterWorkflowState.NOT_STARTED,
    },
    previousWorkflowState: {
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
  },
  {
    collection: 'quarterAssignments',
    timestamps: true,
  },
);

quarterAssignmentSchema.index(
  { annualAssignmentId: 1, quarter: 1 },
  { unique: true, name: 'idx_annual_assignment_quarter' },
);

export const QuarterAssignment = mongoose.model<IQuarterAssignment>(
  'QuarterAssignment',
  quarterAssignmentSchema,
);
