import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  AppraisalOutcomeType,
  LetterTemplateChannel,
  LetterTemplateType,
  PmsTemplateStatus,
} from '../constants/pms.enums';
import type {
  AppraisalOutcomeType as AppraisalOutcomeTypeType,
  LetterTemplateChannel as LetterTemplateChannelType,
  LetterTemplateType as LetterTemplateTypeType,
  PmsTemplateStatus as PmsTemplateStatusType,
} from '../constants/pms.enums';

interface IConditionalBlock {
  blockKey: string;
  condition: string;
}

export interface IPmsLetterTemplate extends Document {
  code: string;
  name: string;
  outcomeType: AppraisalOutcomeTypeType | LetterTemplateTypeType;
  channel: LetterTemplateChannelType;
  templateId: Types.ObjectId;
  templateVersionId: Types.ObjectId;
  status: PmsTemplateStatusType;
  currentVersionId?: Types.ObjectId;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface IPmsLetterTemplateVersion extends Document {
  letterTemplateId: Types.ObjectId;
  templateVersionId: Types.ObjectId;
  versionNo: number;
  status: PmsTemplateStatusType;
  subjectTemplate: string;
  bodyTemplate: string;
  placeholderRules: {
    required?: string[];
    conditional?: string[];
  };
  conditionalBlocks: IConditionalBlock[];
  isLocked: boolean;
  lockedAt?: Date;
  activatedAt?: Date;
  deactivatedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const pmsLetterTemplateSchema = new Schema<IPmsLetterTemplate>(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    outcomeType: {
      type: String,
      required: true,
      enum: [...Object.values(AppraisalOutcomeType), ...Object.values(LetterTemplateType)],
      index: true,
    },
    channel: {
      type: String,
      required: true,
      enum: Object.values(LetterTemplateChannel),
      default: LetterTemplateChannel.EMAIL,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsTemplate',
      index: true,
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsTemplateVersion',
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateStatus),
      default: PmsTemplateStatus.DRAFT,
      index: true,
    },
    currentVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'PmsLetterTemplateVersion',
    },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'letter_templates',
    timestamps: true,
  },
);

const conditionalBlockSchema = new Schema<IConditionalBlock>(
  {
    blockKey: { type: String, required: true, trim: true },
    condition: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const pmsLetterTemplateVersionSchema = new Schema<IPmsLetterTemplateVersion>(
  {
    letterTemplateId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsLetterTemplate',
      index: true,
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsTemplateVersion',
      index: true,
    },
    versionNo: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateStatus),
      default: PmsTemplateStatus.DRAFT,
      index: true,
    },
    subjectTemplate: { type: String, required: true },
    bodyTemplate: { type: String, required: true },
    placeholderRules: {
      required: { type: [String], default: [] },
      conditional: { type: [String], default: [] },
    },
    conditionalBlocks: { type: [conditionalBlockSchema], default: [] },
    isLocked: { type: Boolean, default: false, index: true },
    lockedAt: Date,
    activatedAt: Date,
    deactivatedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'letter_template_versions',
    timestamps: true,
  },
);

pmsLetterTemplateSchema.index(
  { code: 1 },
  { unique: true, name: 'idx_letter_template_code' },
);
pmsLetterTemplateSchema.index({ outcomeType: 1, channel: 1, status: 1 });
pmsLetterTemplateSchema.index({ templateId: 1, templateVersionId: 1, isDeleted: 1 });

pmsLetterTemplateVersionSchema.index(
  { letterTemplateId: 1, versionNo: 1 },
  { unique: true, name: 'idx_letter_template_version' },
);
pmsLetterTemplateVersionSchema.index({ templateVersionId: 1, status: 1, isDeleted: 1 });

export const PmsLetterTemplate = mongoose.model<IPmsLetterTemplate>(
  'PmsLetterTemplate',
  pmsLetterTemplateSchema,
);

export const PmsLetterTemplateVersion = mongoose.model<IPmsLetterTemplateVersion>(
  'PmsLetterTemplateVersion',
  pmsLetterTemplateVersionSchema,
);
