import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  PmsTemplateFieldType,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  PmsTemplateStatus,
} from '../constants/pms.enums';
import type {
  PmsTemplateFieldType as PmsTemplateFieldTypeType,
  PmsTemplateSectionLevel as PmsTemplateSectionLevelType,
  PmsTemplateSectionType as PmsTemplateSectionTypeType,
  PmsTemplateStatus as PmsTemplateStatusType,
} from '../constants/pms.enums';

export interface ITemplateOption {
  label: string;
  value: string;
}

export interface ITemplateField {
  fieldKey: string;
  fieldLabel: string;
  fieldType: PmsTemplateFieldTypeType;
  isRequired?: boolean;
  displayOrder?: number;
  placeholder?: string;
  helpText?: string;
  validationRules?: Record<string, unknown>;
  visibilityRules?: Record<string, unknown>;
  editabilityRules?: Record<string, unknown>;
  optionConfig?: Record<string, unknown>;
  scoringConfig?: Record<string, unknown>;
  defaultValue?: unknown;
  options?: ITemplateOption[];
  matrixConfig?: {
    rows: Array<{ key: string; label: string }>;
    columns: Array<{ key: string; label: string }>;
    allowComments?: boolean;
  };
  gridConfig?: {
    columns: Array<{ key: string; label: string; type: string; required?: boolean }>;
    minRows?: number;
    maxRows?: number;
  };
}

interface IMatrixItem {
  key: string;
  label: string;
}

interface IGridColumn {
  key: string;
  label: string;
  type: string;
  required?: boolean;
}

const matrixItemSchema = new Schema<IMatrixItem>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const gridColumnSchema = new Schema<IGridColumn>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    required: { type: Boolean, default: false },
  },
  { _id: false },
);

export interface ITemplateSection {
  sectionKey: string;
  sectionLabel: string;
  sectionType: PmsTemplateSectionTypeType;
  level: PmsTemplateSectionLevelType;
  repeatFor?: Array<'Q1' | 'Q2' | 'Q3' | 'Q4'>;
  repeatable?: boolean;
  displayOrder?: number;
  visibilityRules?: Record<string, unknown>;
  editabilityRules?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  fields: ITemplateField[];
}

export interface IPmsTemplateVersion extends Document {
  templateId: Types.ObjectId;
  versionNo: number;
  status: PmsTemplateStatusType;
  sections: ITemplateSection[];
  themeConfig?: Record<string, unknown>;
  scoringConfig?: Record<string, unknown>;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  isLocked: boolean;
  lockedAt?: Date;
  activatedAt?: Date;
  deactivatedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const templateFieldSchema = new Schema<ITemplateField>(
  {
    fieldKey: { type: String, required: true, trim: true },
    fieldLabel: { type: String, required: true, trim: true },
    fieldType: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateFieldType),
    },
    isRequired: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    placeholder: String,
    helpText: String,
    validationRules: Schema.Types.Mixed,
    visibilityRules: Schema.Types.Mixed,
    editabilityRules: Schema.Types.Mixed,
    optionConfig: Schema.Types.Mixed,
    scoringConfig: Schema.Types.Mixed,
    defaultValue: Schema.Types.Mixed,
    options: {
      type: [
        {
          label: { type: String, required: true },
          value: { type: String, required: true },
          _id: false,
        },
      ],
      default: [],
    },
    matrixConfig: {
      type: new Schema<{
        rows: IMatrixItem[];
        columns: IMatrixItem[];
        allowComments?: boolean;
      }>(
        {
          rows: {
            type: [matrixItemSchema],
            default: [],
          },
          columns: {
            type: [matrixItemSchema],
            default: [],
          },
          allowComments: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: undefined,
    },
    gridConfig: {
      type: new Schema<{
        columns: IGridColumn[];
        minRows?: number;
        maxRows?: number;
      }>(
        {
          columns: {
            type: [gridColumnSchema],
            default: [],
          },
          minRows: { type: Number, min: 0 },
          maxRows: { type: Number, min: 0 },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { _id: false },
);

const templateSectionSchema = new Schema<ITemplateSection>(
  {
    sectionKey: { type: String, required: true, trim: true },
    sectionLabel: { type: String, required: true, trim: true },
    sectionType: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateSectionType),
    },
    level: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateSectionLevel),
    },
    repeatFor: {
      type: [{ type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'] }],
      default: [],
    },
    repeatable: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    visibilityRules: Schema.Types.Mixed,
    editabilityRules: Schema.Types.Mixed,
    metadata: Schema.Types.Mixed,
    fields: { type: [templateFieldSchema], default: [] },
  },
  { _id: false },
);

const pmsTemplateVersionSchema = new Schema<IPmsTemplateVersion>(
  {
    templateId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsTemplate',
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
    sections: { type: [templateSectionSchema], default: [] },
    themeConfig: { type: Schema.Types.Mixed, default: {} },
    scoringConfig: { type: Schema.Types.Mixed, default: {} },
    effectiveFrom: Date,
    effectiveTo: Date,
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
    collection: 'pms_template_versions',
    timestamps: true,
  },
);

pmsTemplateVersionSchema.index(
  { templateId: 1, versionNo: 1 },
  { unique: true, name: 'idx_pms_template_version' },
);

export const PmsTemplateVersion = mongoose.model<IPmsTemplateVersion>(
  'PmsTemplateVersion',
  pmsTemplateVersionSchema,
);
