import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  AssessmentTermCode,
  ObjectiveApplicabilityStatus,
  ObjectiveAttachmentPolicy,
  ObjectiveActualAggregationMode,
  ObjectiveSource,
  ObjectiveStatus,
  ObjectiveTargetDirection,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  FlexibleObjectiveSourceType as FlexibleObjectiveSourceTypeType,
  ObjectiveApplicabilityStatus as ObjectiveApplicabilityStatusType,
  ObjectiveAttachmentPolicy as ObjectiveAttachmentPolicyType,
  ObjectiveActualAggregationMode as ObjectiveActualAggregationModeType,
  ObjectiveSource as ObjectiveSourceType,
  ObjectiveStatus as ObjectiveStatusType,
  ObjectiveTargetDirection as ObjectiveTargetDirectionType,
} from '../constants/pms.enums';

interface IPmsAttachment {
  fileName?: string;
  fileUrl?: string;
  documentId?: string;
  uploadedBy?: Types.ObjectId;
  uploadedAt?: Date;
}

export interface IAssignedObjectiveSnapshot {
  title: string;
  description?: string;
  source?: string;
  measurementGuidance?: string;
  targetValue?: string;
  targetDescription?: string;
  targetDirection?: ObjectiveTargetDirectionType;
  actualAggregationMode?: ObjectiveActualAggregationModeType;
  priority?: string;
  attachmentPolicy?: ObjectiveAttachmentPolicyType;
  scoreable?: boolean;
  approvedWeightage?: number;
  applicableTerm?: AssessmentTermCodeType;
  ownerUserId?: Types.ObjectId;
  ownerRole?: string;
  ownerDepartment?: string;
  ownerScope?: Record<string, unknown>;
  assignerUserId?: Types.ObjectId;
  assignerRole?: string;
  assignerDepartment?: string;
  assignerScope?: Record<string, unknown>;
  frozenAt?: Date;
}

export interface IObjective extends Document {
  termAssignmentId: Types.ObjectId;
  annualAssignmentId?: Types.ObjectId;
  cycleId?: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  assessmentTermCode?: AssessmentTermCodeType;
  assessmentTerm?: AssessmentTermCodeType;
  employeeId: Types.ObjectId;
  assignedManagerId: Types.ObjectId;
  objectiveMasterId?: Types.ObjectId;
  objectiveVersionId?: Types.ObjectId;
  assignmentRuleRefs?: Types.ObjectId[];
  sourceType?: FlexibleObjectiveSourceTypeType;
  parentObjectiveId?: Types.ObjectId;
  objectiveSnapshot?: IAssignedObjectiveSnapshot;
  applicabilityStatus?: ObjectiveApplicabilityStatusType;
  amendmentReason?: string;
  amendmentAction?: string;
  amendmentAt?: Date;
  amendmentBy?: Types.ObjectId;
  replacementObjectiveId?: Types.ObjectId;
  objectiveNo?: number;
  source: ObjectiveSourceType;
  templateObjectiveKey?: string;
  isPredefined?: boolean;
  title: string;
  description?: string;
  priority?: string;
  expectedOutcome?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDate?: Date;
  weightage?: number;
  successCriteria?: string;
  status: ObjectiveStatusType;
  attachments: IPmsAttachment[];
  createdByRole: string;
  createdByUserId: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  actingDelegateUserId?: Types.ObjectId;
  originalOwnerUserId?: Types.ObjectId;
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  returnedReason?: string;
  returnedAt?: Date;
  isDeleted: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<IPmsAttachment>(
  {
    fileName: String,
    fileUrl: String,
    documentId: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: Date,
  },
  { _id: false },
);

const assignedObjectiveSnapshotSchema = new Schema<IAssignedObjectiveSnapshot>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true },
    source: { type: String, trim: true },
    measurementGuidance: { type: String, trim: true },
    targetValue: { type: String, trim: true },
    targetDescription: { type: String, trim: true },
    targetDirection: {
      type: String,
      enum: Object.values(ObjectiveTargetDirection),
    },
    actualAggregationMode: {
      type: String,
      enum: Object.values(ObjectiveActualAggregationMode),
      default: ObjectiveActualAggregationMode.LATEST_VALUE,
    },
    priority: {
      type: String,
      trim: true,
      uppercase: true,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
    },
    attachmentPolicy: {
      type: String,
      enum: Object.values(ObjectiveAttachmentPolicy),
    },
    scoreable: Boolean,
    approvedWeightage: { type: Number, min: 0, max: 100 },
    applicableTerm: {
      type: String,
      enum: Object.values(AssessmentTermCode),
    },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    ownerRole: { type: String, trim: true },
    ownerDepartment: { type: String, trim: true },
    ownerScope: { type: Schema.Types.Mixed, default: {} },
    assignerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    assignerRole: { type: String, trim: true },
    assignerDepartment: { type: String, trim: true },
    assignerScope: { type: Schema.Types.Mixed, default: {} },
    frozenAt: Date,
  },
  { _id: false },
);

const objectiveSchema = new Schema<IObjective>(
  {
    termAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'TermAssignment',
    },
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualAssignment',
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'PmsTemplateVersion',
      index: true,
    },
    assessmentTermCode: {
      type: String,
      enum: Object.values(AssessmentTermCode),
      index: true,
    },
    assessmentTerm: {
      type: String,
      enum: Object.values(AssessmentTermCode),
      index: true,
    },
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
    objectiveMasterId: {
      type: Schema.Types.ObjectId,
      ref: 'ObjectiveMaster',
      index: true,
    },
    objectiveVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'ObjectiveMasterVersion',
      index: true,
    },
    assignmentRuleRefs: {
      type: [{ type: Schema.Types.ObjectId, ref: 'ObjectiveAssignmentRule' }],
      default: [],
    },
    sourceType: {
      type: String,
      index: true,
    },
    parentObjectiveId: {
      type: Schema.Types.ObjectId,
      ref: 'Objective',
      index: true,
    },
    objectiveSnapshot: {
      type: assignedObjectiveSnapshotSchema,
      default: undefined,
    },
    applicabilityStatus: {
      type: String,
      enum: Object.values(ObjectiveApplicabilityStatus),
      default: ObjectiveApplicabilityStatus.ACTIVE,
      index: true,
    },
    amendmentReason: { type: String, trim: true },
    amendmentAction: { type: String, trim: true, index: true },
    amendmentAt: Date,
    amendmentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    replacementObjectiveId: {
      type: Schema.Types.ObjectId,
      ref: 'Objective',
      index: true,
    },
    objectiveNo: Number,
    source: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveSource),
    },
    templateObjectiveKey: {
      type: String,
      trim: true,
      index: true,
    },
    isPredefined: {
      type: Boolean,
      default: false,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: { type: String, trim: true },
    priority: {
      type: String,
      trim: true,
      uppercase: true,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
    },
    expectedOutcome: { type: String, trim: true },
    targetMetric: { type: String, trim: true },
    targetValue: { type: String, trim: true },
    targetDate: Date,
    weightage: { type: Number, min: 0, max: 100 },
    successCriteria: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveStatus),
      default: ObjectiveStatus.OBJECTIVE_DRAFT,
      index: true,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    createdByRole: {
      type: String,
      required: true,
      trim: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    actingDelegateUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    originalOwnerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: Date,
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    returnedReason: String,
    returnedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'objectives',
    timestamps: true,
  },
);

objectiveSchema.index(
  { termAssignmentId: 1 },
  { name: 'idx_objective_term_assignment' },
);
objectiveSchema.index({ annualAssignmentId: 1, assessmentTermCode: 1 });
objectiveSchema.index({ employeeId: 1, cycleId: 1 });
objectiveSchema.index({ assignedManagerId: 1, status: 1 });
objectiveSchema.index({ status: 1 });
objectiveSchema.index({ termAssignmentId: 1, templateObjectiveKey: 1 });
objectiveSchema.index({ termAssignmentId: 1, templateObjectiveKey: 1, isDeleted: 1 });
objectiveSchema.index({ objectiveMasterId: 1, employeeId: 1, assessmentTerm: 1, isDeleted: 1 });
objectiveSchema.index({ objectiveVersionId: 1, isDeleted: 1 });
objectiveSchema.index({ assignmentRuleRefs: 1 });
objectiveSchema.index({ applicabilityStatus: 1, isDeleted: 1 });

export const Objective = mongoose.model<IObjective>('Objective', objectiveSchema);
