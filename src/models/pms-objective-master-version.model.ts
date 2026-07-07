import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  AssessmentTermCode,
  ObjectiveAttachmentPolicy,
  ObjectiveMasterVersionStatus,
  ObjectiveTargetDirection,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  ObjectiveAttachmentPolicy as ObjectiveAttachmentPolicyType,
  ObjectiveMasterVersionStatus as ObjectiveMasterVersionStatusType,
  ObjectiveTargetDirection as ObjectiveTargetDirectionType,
} from '../constants/pms.enums';
import type { IObjectiveOwnerMetadata } from './pms-objective-master.model';

export interface IObjectiveAssignerMetadata {
  assignerUserId?: Types.ObjectId;
  assignerRole?: string;
  assignerDepartment?: string;
  assignerScope?: Record<string, unknown>;
}

export interface IObjectiveReviewerMetadata {
  reviewerUserId?: Types.ObjectId;
  reviewerRole?: string;
  reviewerDepartment?: string;
  reviewerScope?: Record<string, unknown>;
}

export interface IObjectiveBusinessSnapshot {
  title: string;
  description?: string;
  measurementGuidance?: string;
  targetValue?: string;
  targetDescription?: string;
  targetDirection?: ObjectiveTargetDirectionType;
  priority?: string;
  attachmentPolicy?: ObjectiveAttachmentPolicyType;
  scoreable?: boolean;
  defaultScoringEligibilityRef?: string;
  approvedWeightage?: number;
  applicableTermLabels?: AssessmentTermCodeType[];
}

export interface IObjectiveMasterVersion
  extends Document,
    IObjectiveBusinessSnapshot,
    IObjectiveOwnerMetadata,
    IObjectiveAssignerMetadata,
    IObjectiveReviewerMetadata {
  objectiveMasterId: Types.ObjectId;
  versionNo: number;
  status: ObjectiveMasterVersionStatusType;
  activatedAt?: Date;
  activatedBy?: Types.ObjectId;
  deactivatedAt?: Date;
  deactivatedBy?: Types.ObjectId;
  archivedAt?: Date;
  archivedBy?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const objectiveBusinessSnapshotSchema = new Schema<IObjectiveBusinessSnapshot>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true },
    measurementGuidance: { type: String, trim: true },
    targetValue: { type: String, trim: true },
    targetDescription: { type: String, trim: true },
    targetDirection: {
      type: String,
      enum: Object.values(ObjectiveTargetDirection),
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
      default: ObjectiveAttachmentPolicy.OPTIONAL,
    },
    scoreable: { type: Boolean, default: true },
    defaultScoringEligibilityRef: { type: String, trim: true },
    approvedWeightage: { type: Number, min: 0, max: 100 },
    applicableTermLabels: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
  },
  { _id: false },
);

export const objectiveAssignerMetadataSchema = new Schema<IObjectiveAssignerMetadata>(
  {
    assignerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    assignerRole: { type: String, trim: true, index: true },
    assignerDepartment: { type: String, trim: true, index: true },
    assignerScope: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

export const objectiveReviewerMetadataSchema = new Schema<IObjectiveReviewerMetadata>(
  {
    reviewerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    reviewerRole: { type: String, trim: true, index: true },
    reviewerDepartment: { type: String, trim: true, index: true },
    reviewerScope: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

export const objectiveFrozenSnapshotSchema = objectiveBusinessSnapshotSchema.clone();

const objectiveMasterVersionSchema = new Schema<IObjectiveMasterVersion>(
  {
    objectiveMasterId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'ObjectiveMaster',
      index: true,
    },
    versionNo: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveMasterVersionStatus),
      default: ObjectiveMasterVersionStatus.DRAFT,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true },
    measurementGuidance: { type: String, trim: true },
    targetValue: { type: String, trim: true },
    targetDescription: { type: String, trim: true },
    targetDirection: {
      type: String,
      enum: Object.values(ObjectiveTargetDirection),
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
      default: ObjectiveAttachmentPolicy.OPTIONAL,
    },
    scoreable: { type: Boolean, default: true },
    defaultScoringEligibilityRef: { type: String, trim: true },
    approvedWeightage: { type: Number, min: 0, max: 100 },
    applicableTermLabels: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    ownerRole: { type: String, trim: true, index: true },
    ownerDepartment: { type: String, trim: true, index: true },
    ownerScope: { type: Schema.Types.Mixed, default: {} },
    assignerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    assignerRole: { type: String, trim: true, index: true },
    assignerDepartment: { type: String, trim: true, index: true },
    assignerScope: { type: Schema.Types.Mixed, default: {} },
    reviewerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    reviewerRole: { type: String, trim: true, index: true },
    reviewerDepartment: { type: String, trim: true, index: true },
    reviewerScope: { type: Schema.Types.Mixed, default: {} },
    activatedAt: Date,
    activatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deactivatedAt: Date,
    deactivatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    archivedAt: Date,
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'pms_objective_master_versions',
    timestamps: true,
  },
);

objectiveMasterVersionSchema.index(
  { objectiveMasterId: 1, versionNo: 1 },
  { unique: true, name: 'idx_objective_master_version_no' },
);
objectiveMasterVersionSchema.index({ objectiveMasterId: 1, status: 1, isDeleted: 1 });
objectiveMasterVersionSchema.index({ status: 1, isDeleted: 1 });
objectiveMasterVersionSchema.index({ ownerDepartment: 1, status: 1, isDeleted: 1 });
objectiveMasterVersionSchema.index({ assignerDepartment: 1, status: 1, isDeleted: 1 });
objectiveMasterVersionSchema.index({ reviewerDepartment: 1, status: 1, isDeleted: 1 });

export const ObjectiveMasterVersion = mongoose.model<IObjectiveMasterVersion>(
  'ObjectiveMasterVersion',
  objectiveMasterVersionSchema,
);
