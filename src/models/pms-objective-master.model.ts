import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  FlexibleObjectiveSourceType,
  ObjectiveMasterStatus,
} from '../constants/pms.enums';
import type {
  FlexibleObjectiveSourceType as FlexibleObjectiveSourceTypeType,
  ObjectiveMasterStatus as ObjectiveMasterStatusType,
} from '../constants/pms.enums';

export interface IObjectiveOwnerMetadata {
  ownerUserId?: Types.ObjectId;
  ownerRole?: string;
  ownerDepartment?: string;
  ownerScope?: Record<string, unknown>;
}

export interface IObjectiveMaster extends Document, IObjectiveOwnerMetadata {
  code?: string;
  sourceType: FlexibleObjectiveSourceTypeType;
  status: ObjectiveMasterStatusType;
  currentVersionId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const objectiveOwnerMetadataSchema = new Schema<IObjectiveOwnerMetadata>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    ownerRole: { type: String, trim: true, index: true },
    ownerDepartment: { type: String, trim: true, index: true },
    ownerScope: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const objectiveMasterSchema = new Schema<IObjectiveMaster>(
  {
    code: { type: String, trim: true, index: true },
    sourceType: {
      type: String,
      required: true,
      enum: Object.values(FlexibleObjectiveSourceType),
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveMasterStatus),
      default: ObjectiveMasterStatus.ACTIVE,
      index: true,
    },
    currentVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'ObjectiveMasterVersion',
      index: true,
    },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    ownerRole: { type: String, trim: true, index: true },
    ownerDepartment: { type: String, trim: true, index: true },
    ownerScope: { type: Schema.Types.Mixed, default: {} },
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
    collection: 'pms_objective_masters',
    timestamps: true,
  },
);

objectiveMasterSchema.index({ sourceType: 1, status: 1, isDeleted: 1 });
objectiveMasterSchema.index({ code: 1, status: 1, isDeleted: 1 });
objectiveMasterSchema.index({ ownerDepartment: 1, status: 1, isDeleted: 1 });
objectiveMasterSchema.index({ ownerUserId: 1, status: 1, isDeleted: 1 });

export const ObjectiveMaster = mongoose.model<IObjectiveMaster>(
  'ObjectiveMaster',
  objectiveMasterSchema,
);
