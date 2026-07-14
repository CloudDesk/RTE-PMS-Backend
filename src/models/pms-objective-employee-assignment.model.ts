import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  AssessmentTermCode,
  ObjectiveEmployeeAssignmentStatus,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  ObjectiveEmployeeAssignmentStatus as ObjectiveEmployeeAssignmentStatusType,
} from '../constants/pms.enums';
import {
  objectiveFrozenSnapshotSchema,
  type IObjectiveBusinessSnapshot,
} from './pms-objective-master-version.model';

export interface IObjectiveEmployeeAssignment extends Document {
  objectiveAssignmentPeriodId: Types.ObjectId;
  objectiveMasterId: Types.ObjectId;
  objectiveVersionId: Types.ObjectId;
  employeeId: Types.ObjectId;
  managerId?: Types.ObjectId;
  selectedTerms: AssessmentTermCodeType[];
  termStates?: Array<{
    term: AssessmentTermCodeType;
    status: ObjectiveEmployeeAssignmentStatusType | 'LOCKED' | 'OPEN' | 'RETURNED';
    fillStartDate: Date;
    fillEndDate: Date;
    submittedAt?: Date;
    submittedBy?: Types.ObjectId;
    closedAt?: Date;
    closedBy?: Types.ObjectId;
    readOnlyReason?: string;
  }>;
  frozenObjectiveSnapshot: IObjectiveBusinessSnapshot;
  values?: Record<string, unknown>;
  status: ObjectiveEmployeeAssignmentStatusType;
  submittedAt?: Date;
  submittedBy?: Types.ObjectId;
  closedAt?: Date;
  closedBy?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const objectiveEmployeeAssignmentSchema = new Schema<IObjectiveEmployeeAssignment>(
  {
    objectiveAssignmentPeriodId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'ObjectiveAssignmentPeriod',
      index: true,
    },
    objectiveMasterId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'ObjectiveMaster',
      index: true,
    },
    objectiveVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'ObjectiveMasterVersion',
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    selectedTerms: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      required: true,
      default: [],
      index: true,
    },
    termStates: {
      type: [
        {
          term: {
            type: String,
            required: true,
            enum: Object.values(AssessmentTermCode),
          },
          status: {
            type: String,
            required: true,
            enum: [...Object.values(ObjectiveEmployeeAssignmentStatus), 'LOCKED', 'OPEN', 'RETURNED'],
            default: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
            index: true,
          },
          fillStartDate: {
            type: Date,
            required: true,
          },
          fillEndDate: {
            type: Date,
            required: true,
          },
          submittedAt: Date,
          submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          closedAt: Date,
          closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          readOnlyReason: { type: String, trim: true },
        },
      ],
      default: [],
    },
    frozenObjectiveSnapshot: {
      type: objectiveFrozenSnapshotSchema,
      required: true,
    },
    values: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveEmployeeAssignmentStatus),
      default: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      index: true,
    },
    submittedAt: Date,
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedAt: Date,
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'pms_objective_employee_assignments',
    timestamps: true,
  },
);

objectiveEmployeeAssignmentSchema.index({
  objectiveAssignmentPeriodId: 1,
  employeeId: 1,
  status: 1,
  isDeleted: 1,
});
objectiveEmployeeAssignmentSchema.index({
  objectiveMasterId: 1,
  objectiveVersionId: 1,
  employeeId: 1,
  isDeleted: 1,
});
objectiveEmployeeAssignmentSchema.index({ managerId: 1, status: 1, isDeleted: 1 });
objectiveEmployeeAssignmentSchema.index({ selectedTerms: 1, status: 1, isDeleted: 1 });
objectiveEmployeeAssignmentSchema.index({ 'termStates.term': 1, 'termStates.status': 1, isDeleted: 1 });
objectiveEmployeeAssignmentSchema.index(
  {
    objectiveAssignmentPeriodId: 1,
    objectiveVersionId: 1,
    employeeId: 1,
  },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
    name: 'idx_unique_objective_employee_assignment',
  },
);

export const ObjectiveEmployeeAssignment = mongoose.model<IObjectiveEmployeeAssignment>(
  'ObjectiveEmployeeAssignment',
  objectiveEmployeeAssignmentSchema,
);
