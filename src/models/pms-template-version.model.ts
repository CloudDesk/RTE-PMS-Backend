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
  QuarterWorkflowState,
} from '../constants/pms.enums';

interface ITemplatePermissionRule {
  roleCode: string;
  visible?: boolean;
  editable?: boolean;
  required?: boolean;
  workflowStates?: QuarterWorkflowState[];
  hierarchyScope?: string;
  publishFlagRequired?: boolean;
}

interface ITemplateField {
  key: string;
  label: string;
  type: PmsTemplateFieldTypeType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  validationRules?: Record<string, unknown>;
  defaultValue?: unknown;
  weightage?: number;
  options?: Array<{ label: string; value: string }>;
  scoringParticipation?: boolean;
  formula?: string;
  permissions?: ITemplatePermissionRule[];
  order?: number;
}

interface ITemplateSection {
  key: string;
  label: string;
  type: PmsTemplateSectionTypeType;
  level: PmsTemplateSectionLevelType;
  applicableQuarters?: Array<'Q1' | 'Q2' | 'Q3' | 'Q4'>;
  repeatable?: boolean;
  order?: number;
  fields: ITemplateField[];
  permissions?: ITemplatePermissionRule[];
}

export interface IPmsTemplateVersion extends Document {
  templateId: Types.ObjectId;
  versionNumber: number;
  status: PmsTemplateStatusType;
  sections: ITemplateSection[];
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

const permissionRuleSchema = new Schema<ITemplatePermissionRule>(
  {
    roleCode: { type: String, required: true, trim: true },
    visible: Boolean,
    editable: Boolean,
    required: Boolean,
    workflowStates: [{ type: String }],
    hierarchyScope: String,
    publishFlagRequired: Boolean,
  },
  { _id: false },
);

const templateFieldSchema = new Schema<ITemplateField>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateFieldType),
    },
    required: Boolean,
    placeholder: String,
    helpText: String,
    validationRules: Schema.Types.Mixed,
    defaultValue: Schema.Types.Mixed,
    weightage: { type: Number, min: 0, max: 100 },
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
    scoringParticipation: { type: Boolean, default: false },
    formula: String,
    permissions: { type: [permissionRuleSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const templateSectionSchema = new Schema<ITemplateSection>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateSectionType),
    },
    level: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateSectionLevel),
    },
    applicableQuarters: {
      type: [{ type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'] }],
      default: [],
    },
    repeatable: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    fields: { type: [templateFieldSchema], default: [] },
    permissions: { type: [permissionRuleSchema], default: [] },
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
    versionNumber: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(PmsTemplateStatus),
      default: PmsTemplateStatus.DRAFT,
      index: true,
    },
    sections: { type: [templateSectionSchema], default: [] },
    placeholders: { type: [String], default: [] },
    conditionalBlocks: { type: [String], default: [] },
    isLocked: { type: Boolean, default: false, index: true },
    activatedAt: Date,
    deactivatedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    collection: 'pmsTemplateVersions',
    timestamps: true,
  },
);

pmsTemplateVersionSchema.index(
  { templateId: 1, versionNumber: 1 },
  { unique: true, name: 'idx_pms_template_version' },
);

export const PmsTemplateVersion = mongoose.model<IPmsTemplateVersion>(
  'PmsTemplateVersion',
  pmsTemplateVersionSchema,
);
