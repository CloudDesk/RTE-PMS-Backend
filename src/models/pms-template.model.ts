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
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
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
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    collection: 'pmsTemplates',
    timestamps: true,
  },
);

pmsTemplateSchema.index({ code: 1 }, { unique: true, name: 'idx_pms_template_code' });

export const PmsTemplate = mongoose.model<IPmsTemplate>(
  'PmsTemplate',
  pmsTemplateSchema,
);
