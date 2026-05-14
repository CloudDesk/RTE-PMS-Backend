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

export const PmsTemplate = mongoose.model<IPmsTemplate>(
  'PmsTemplate',
  pmsTemplateSchema,
);
