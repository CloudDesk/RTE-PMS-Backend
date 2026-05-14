import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  LetterTemplateChannel,
  LetterTemplateType,
  PmsTemplateStatus,
} from '../constants/pms.enums';
import type {
  LetterTemplateChannel as LetterTemplateChannelType,
  LetterTemplateType as LetterTemplateTypeType,
  PmsTemplateStatus as PmsTemplateStatusType,
} from '../constants/pms.enums';

export interface IPmsLetterTemplate extends Document {
  name: string;
  code: string;
  type: LetterTemplateTypeType;
  channel: LetterTemplateChannelType;
  versionNumber: number;
  status: PmsTemplateStatusType;
  subject?: string;
  body: string;
  placeholders: string[];
  conditionalBlocks: string[];
  isLocked: boolean;
  activatedAt?: Date;
  deactivatedAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const pmsLetterTemplateSchema = new Schema<IPmsLetterTemplate>(
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
    type: {
      type: String,
      required: true,
      enum: Object.values(LetterTemplateType),
      index: true,
    },
    channel: {
      type: String,
      required: true,
      enum: Object.values(LetterTemplateChannel),
    },
    versionNumber: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateStatus),
      default: PmsTemplateStatus.DRAFT,
      index: true,
    },
    subject: String,
    body: { type: String, required: true },
    placeholders: { type: [String], default: [] },
    conditionalBlocks: { type: [String], default: [] },
    isLocked: { type: Boolean, default: false, index: true },
    activatedAt: Date,
    deactivatedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    collection: 'pmsLetterTemplates',
    timestamps: true,
  },
);

pmsLetterTemplateSchema.index(
  { code: 1, versionNumber: 1 },
  { unique: true, name: 'idx_pms_letter_template_version' },
);

export const PmsLetterTemplate = mongoose.model<IPmsLetterTemplate>(
  'PmsLetterTemplate',
  pmsLetterTemplateSchema,
);
