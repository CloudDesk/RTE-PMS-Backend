import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  AssessmentTermCode,
  AssessmentTermType,
  ObjectiveAssignmentPeriodStatus,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
  ObjectiveAssignmentPeriodStatus as ObjectiveAssignmentPeriodStatusType,
} from '../constants/pms.enums';

export interface IObjectiveAssignmentPeriod extends Document {
  name: string;
  objectiveMasterId: Types.ObjectId;
  objectiveVersionId: Types.ObjectId;
  linkedPmsCycleId?: Types.ObjectId;
  periodStartDate: Date;
  periodEndDate: Date;
  termType: AssessmentTermTypeType;
  terms: AssessmentTermCodeType[];
  fillStartDate: Date;
  fillEndDate: Date;
  termFillWindows?: Array<{
    term: AssessmentTermCodeType;
    fillStartDate: Date;
    fillEndDate: Date;
  }>;
  pastTermEntryWindows?: Array<{
    term: AssessmentTermCodeType;
    closesAt: Date;
  }>;
  status: ObjectiveAssignmentPeriodStatusType;
  note?: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  closedAt?: Date;
  closedBy?: Types.ObjectId;
  isDeleted: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const objectiveAssignmentPeriodSchema = new Schema<IObjectiveAssignmentPeriod>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
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
    linkedPmsCycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    periodStartDate: {
      type: Date,
      required: true,
      index: true,
    },
    periodEndDate: {
      type: Date,
      required: true,
      index: true,
    },
    termType: {
      type: String,
      required: true,
      enum: Object.values(AssessmentTermType),
      index: true,
    },
    terms: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      required: true,
      default: [],
      index: true,
    },
    fillStartDate: {
      type: Date,
      required: true,
      index: true,
    },
    fillEndDate: {
      type: Date,
      required: true,
      index: true,
    },
    termFillWindows: {
      type: [
        {
          term: {
            type: String,
            required: true,
            enum: Object.values(AssessmentTermCode),
          },
          fillStartDate: {
            type: Date,
            required: true,
          },
          fillEndDate: {
            type: Date,
            required: true,
          },
        },
      ],
      default: [],
    },
    pastTermEntryWindows: {
      type: [
        {
          term: {
            type: String,
            required: true,
            enum: Object.values(AssessmentTermCode),
          },
          closesAt: {
            type: Date,
            required: true,
          },
        },
      ],
      default: [],
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveAssignmentPeriodStatus),
      default: ObjectiveAssignmentPeriodStatus.DRAFT,
      index: true,
    },
    note: { type: String, trim: true, maxlength: 1000 },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedAt: Date,
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'pms_objective_assignment_periods',
    timestamps: true,
  },
);

objectiveAssignmentPeriodSchema.index({ objectiveMasterId: 1, status: 1, isDeleted: 1 });
objectiveAssignmentPeriodSchema.index({ objectiveVersionId: 1, status: 1, isDeleted: 1 });
objectiveAssignmentPeriodSchema.index({ linkedPmsCycleId: 1, status: 1, isDeleted: 1 });
objectiveAssignmentPeriodSchema.index({ fillStartDate: 1, fillEndDate: 1, status: 1 });

export const ObjectiveAssignmentPeriod = mongoose.model<IObjectiveAssignmentPeriod>(
  'ObjectiveAssignmentPeriod',
  objectiveAssignmentPeriodSchema,
);
