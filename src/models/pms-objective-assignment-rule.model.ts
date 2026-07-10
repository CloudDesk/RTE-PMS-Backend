import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  AssessmentTermCode,
  AssessmentTermType,
  ObjectiveAssignmentRuleStatus,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
  ObjectiveAssignmentRuleStatus as ObjectiveAssignmentRuleStatusType,
} from '../constants/pms.enums';

export interface IObjectiveAssignmentCriteria {
  company?: string;
  businessUnit?: string;
  location?: string;
  department?: string;
  team?: string;
  role?: string;
  designation?: string;
  grade?: string;
  employeeGroup?: string;
  reportingManagerId?: Types.ObjectId;
  employeeIds?: Types.ObjectId[];
}

export interface IObjectiveAssignmentRule extends Document {
  objectiveMasterId: Types.ObjectId;
  objectiveVersionId: Types.ObjectId;
  cycleId?: Types.ObjectId;
  assessmentTermType?: AssessmentTermTypeType;
  termLabels: AssessmentTermCodeType[];
  criteria: IObjectiveAssignmentCriteria;
  status: ObjectiveAssignmentRuleStatusType;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  note?: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const objectiveAssignmentCriteriaSchema = new Schema<IObjectiveAssignmentCriteria>(
  {
    company: { type: String, trim: true, index: true },
    businessUnit: { type: String, trim: true, index: true },
    location: { type: String, trim: true, index: true },
    department: { type: String, trim: true, index: true },
    team: { type: String, trim: true, index: true },
    role: { type: String, trim: true, index: true },
    designation: { type: String, trim: true, index: true },
    grade: { type: String, trim: true, index: true },
    employeeGroup: { type: String, trim: true, index: true },
    reportingManagerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    employeeIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      index: true,
    },
  },
  { _id: false },
);

const objectiveAssignmentRuleSchema = new Schema<IObjectiveAssignmentRule>(
  {
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
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    assessmentTermType: {
      type: String,
      enum: Object.values(AssessmentTermType),
      index: true,
    },
    termLabels: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
      index: true,
    },
    criteria: {
      type: objectiveAssignmentCriteriaSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveAssignmentRuleStatus),
      default: ObjectiveAssignmentRuleStatus.DRAFT,
      index: true,
    },
    effectiveFrom: { type: Date, index: true },
    effectiveTo: { type: Date, index: true },
    note: { type: String, trim: true, maxlength: 1000 },
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
    collection: 'pms_objective_assignment_rules',
    timestamps: true,
  },
);

objectiveAssignmentRuleSchema.index({ objectiveVersionId: 1, status: 1, isDeleted: 1 });
objectiveAssignmentRuleSchema.index({ cycleId: 1, assessmentTermType: 1, status: 1 });
objectiveAssignmentRuleSchema.index({ termLabels: 1, status: 1, isDeleted: 1 });
objectiveAssignmentRuleSchema.index({ effectiveFrom: 1, effectiveTo: 1, status: 1 });

export const ObjectiveAssignmentRule = mongoose.model<IObjectiveAssignmentRule>(
  'ObjectiveAssignmentRule',
  objectiveAssignmentRuleSchema,
);
