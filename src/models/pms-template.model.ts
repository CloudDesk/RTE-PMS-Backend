import mongoose, { Document, Schema, Types } from 'mongoose';
import { PmsTemplateStatus } from '../constants/pms.enums';
import type { PmsTemplateStatus as PmsTemplateStatusType } from '../constants/pms.enums';

export interface IPmsTemplate extends Document {
  name: string;
  code: string;
  description?: string;
  status: PmsTemplateStatusType;
  effectiveDate?: Date;
  currentVersionId?: Types.ObjectId;
  createdByRole?: 'ADMIN' | 'MANAGER';
  ownerManagerId?: Types.ObjectId;
  visibilityScope?: 'GLOBAL' | 'MANAGER_TEAM';
  templateLabel?: 'Company Template' | 'Manager Template';
  approvalStatus?: 'DRAFT' | 'ACTIVE' | 'ADMIN_APPROVED';
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const pmsTemplateSchema = new Schema<IPmsTemplate>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    description: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateStatus),
      default: PmsTemplateStatus.DRAFT,
      index: true,
    },
    effectiveDate: Date,
    currentVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'PmsTemplateVersion',
    },
    createdByRole: {
      type: String,
      enum: ['ADMIN', 'MANAGER'],
      default: 'ADMIN',
      index: true,
    },
    ownerManagerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    visibilityScope: {
      type: String,
      enum: ['GLOBAL', 'MANAGER_TEAM'],
      default: 'GLOBAL',
      index: true,
    },
    templateLabel: {
      type: String,
      enum: ['Company Template', 'Manager Template'],
      default: 'Company Template',
    },
    approvalStatus: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'ADMIN_APPROVED'],
      default: 'ACTIVE',
    },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'pms_templates',
    timestamps: true,
  },
);

pmsTemplateSchema.index({ code: 1 }, { unique: true, name: 'idx_pms_template_code' });
pmsTemplateSchema.index({ ownerManagerId: 1, visibilityScope: 1, isDeleted: 1 });

export const PmsTemplate = mongoose.model<IPmsTemplate>(
  'PmsTemplate',
  pmsTemplateSchema,
);
