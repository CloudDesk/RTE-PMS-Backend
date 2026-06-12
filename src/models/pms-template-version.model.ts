import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  PmsTemplateFieldType,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  PmsTemplateStatus,
  FieldCategory,
  SemanticRole,
  AssessmentTermCode,
} from '../constants/pms.enums';
import type {
  PmsTemplateFieldType as PmsTemplateFieldTypeType,
  PmsTemplateSectionLevel as PmsTemplateSectionLevelType,
  PmsTemplateSectionType as PmsTemplateSectionTypeType,
  PmsTemplateStatus as PmsTemplateStatusType,
  FieldCategory as FieldCategoryType,
  SemanticRole as SemanticRoleType,
  AssessmentTermCode as AssessmentTermCodeType,
} from '../constants/pms.enums';

export interface ITemplateOption {
  label: string;
  value: string;
  score?: number;
  weight?: number;
}

export interface ITemplatePredefinedObjective {
  objectiveKey: string;
  title: string;
  description?: string;
  kpi?: string;
  targetValue?: string;
  weightage?: number;
  successCriteria?: string;
  quarterScope?: AssessmentTermCodeType[];
  applicableQuarters?: AssessmentTermCodeType[];
  repeatFor?: AssessmentTermCodeType[];
}

export interface ITemplateObjectiveConfig {
  mode: 'PREDEFINED' | 'DYNAMIC' | 'HYBRID';
  allowEmployeeCreated?: boolean;
  allowManagerCreated?: boolean;
  predefinedObjectives?: ITemplatePredefinedObjective[];
}

export interface IObjectiveBucket {
  bucketKey: string;
  label: string;
  source: 'TEMPLATE_PREDEFINED' | 'EMPLOYEE_DYNAMIC' | 'MANAGER_DYNAMIC';
  owner: 'SYSTEM' | 'EMPLOYEE' | 'MANAGER';
  bucketWeightage: number;
  rowWeightMode: 'FIXED_BY_TEMPLATE' | 'OWNER_ENTERED' | 'EQUAL_DISTRIBUTION';
  editableBy: string[];
  requiresManagerApproval: boolean;
  autoApprove: boolean;
}

export interface ITemplateBehaviorRule {
  workflowState: string;
  role: string;
  visibility: 'VISIBLE' | 'HIDDEN';
  editability: 'EDITABLE' | 'READ_ONLY';
  mandatory?: boolean;
}

export interface ITemplateConditionalRendering {
  dependsOn: string;
  operator:
    | 'EQUALS'
    | 'NOT_EQUALS'
    | 'IN'
    | 'NOT_IN'
    | 'GREATER_THAN'
    | 'LESS_THAN'
    | 'IS_EMPTY'
    | 'IS_NOT_EMPTY';
  value?: unknown;
  action: 'SHOW' | 'HIDE';
}

export interface ITemplateField {
  fieldKey: string;
  fieldLabel: string;
  fieldType: PmsTemplateFieldTypeType;
  fieldCategory?: FieldCategoryType;
  semanticRole?: SemanticRoleType;
  isRequired?: boolean;
  displayOrder?: number;
  placeholder?: string;
  helpText?: string;
  hideLabel?: boolean;
  validationRules?: Record<string, unknown>;
  visibilityRules?: Record<string, unknown>;
  editabilityRules?: Record<string, unknown>;
  optionConfig?: Record<string, unknown>;
  scoringConfig?: Record<string, unknown>;
  defaultValue?: unknown;
  colSpan?: 1 | 2 | 3 | 4;
  options?: ITemplateOption[];
  behaviors?: ITemplateBehaviorRule[];
  conditionalRendering?: ITemplateConditionalRendering;
  matrixConfig?: {
    rows: Array<{ key: string; label: string; weightage?: number; options?: ITemplateOption[] }>;
    columns: Array<{ key: string; label: string; weightage?: number }>;
    allowComments?: boolean;
    selectionControl?: 'radio' | 'checkbox';
    multiSelectScoring?: 'MAX' | 'AVERAGE' | 'SUM_CAPPED';
    borderStyle?: 'standard' | 'paper';
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
  weightage?: number;
  options?: ITemplateOption[];
}

interface IGridColumn {
  key: string;
  label: string;
  type: string;
  weightage?: number;
  required?: boolean;
}

const matrixItemSchema = new Schema<IMatrixItem>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    weightage: { type: Number },
    options: {
      type: [
        {
          label: { type: String, required: true },
          value: { type: String, required: true },
          score: { type: Number },
          weight: { type: Number },
          _id: false,
        },
      ],
      default: undefined,
    },
  },
  { _id: false },
);

const gridColumnSchema = new Schema<IGridColumn>(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    weightage: { type: Number },
    type: { type: String, required: true, trim: true },
    required: { type: Boolean, default: false },
  },
  { _id: false },
);

const predefinedObjectiveSchema = new Schema<ITemplatePredefinedObjective>(
  {
    objectiveKey: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    kpi: { type: String, trim: true },
    targetValue: { type: String, trim: true },
    weightage: { type: Number, min: 0, max: 100 },
    successCriteria: { type: String, trim: true },
    quarterScope: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
    applicableQuarters: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
    repeatFor: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
  },
  { _id: false },
);

const objectiveConfigSchema = new Schema<ITemplateObjectiveConfig>(
  {
    mode: {
      type: String,
      enum: ['PREDEFINED', 'DYNAMIC', 'HYBRID'],
      default: 'DYNAMIC',
    },
    allowEmployeeCreated: { type: Boolean, default: true },
    allowManagerCreated: { type: Boolean, default: true },
    predefinedObjectives: { type: [predefinedObjectiveSchema], default: [] },
  },
  { _id: false },
);

export interface ITemplateSection {
  sectionKey: string;
  sectionLabel: string;
  sectionType: PmsTemplateSectionTypeType;
  level: PmsTemplateSectionLevelType;
  repeatFor?: AssessmentTermCodeType[];
  repeatable?: boolean;
  displayOrder?: number;
  layout?: 'vertical' | 'grid' | 'table' | 'bordered_grid';
  renderingScope?: 'QUARTER_ONLY' | 'ANNUAL_ONLY' | 'BOTH';
  quarterScope?: AssessmentTermCodeType[];
  sectionScoringConfig?: {
    participatesInScoring?: boolean;
    weightage?: number;
    aggregationMethod?: 'WEIGHTED_AVERAGE' | 'SIMPLE_AVERAGE' | 'SUM' | 'MAX_FIELD';
    maxSectionScore?: number;
  };
  visibilityRules?: Record<string, unknown>;
  editabilityRules?: Record<string, unknown>;
  objectiveConfig?: ITemplateObjectiveConfig;
  objectiveBuckets?: IObjectiveBucket[];
  metadata?: Record<string, unknown>;
  fields: ITemplateField[];
}

export interface IPmsTemplateVersion extends Document {
  templateId: Types.ObjectId;
  versionNo: number;
  status: PmsTemplateStatusType;
  sections: ITemplateSection[];
  metadata?: Record<string, unknown>;
  themeConfig?: Record<string, unknown>;
  scoringConfig?: Record<string, unknown>;
  annualScoringConfig?: Record<string, unknown>;
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
    fieldCategory: {
      type: String,
      enum: Object.values(FieldCategory),
      default: 'NORMAL',
    },
    semanticRole: {
      type: String,
      enum: Object.values(SemanticRole),
    },
    isRequired: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    placeholder: String,
    helpText: String,
    hideLabel: { type: Boolean, default: false },
    validationRules: Schema.Types.Mixed,
    visibilityRules: Schema.Types.Mixed,
    editabilityRules: Schema.Types.Mixed,
    optionConfig: Schema.Types.Mixed,
    scoringConfig: Schema.Types.Mixed,
    defaultValue: Schema.Types.Mixed,
    colSpan: { type: Number, enum: [1, 2, 3, 4], default: 4 },
    behaviors: {
      type: [
        {
          workflowState: { type: String, required: true },
          role: { type: String, required: true },
          visibility: { type: String, enum: ['VISIBLE', 'HIDDEN'], default: 'VISIBLE' },
          editability: { type: String, enum: ['EDITABLE', 'READ_ONLY'], default: 'READ_ONLY' },
          mandatory: { type: Boolean, default: false },
          _id: false,
        },
      ],
      default: [],
    },
    conditionalRendering: {
      type: new Schema<ITemplateConditionalRendering>(
        {
          dependsOn: { type: String, required: true, trim: true },
          operator: {
            type: String,
            enum: [
              'EQUALS',
              'NOT_EQUALS',
              'IN',
              'NOT_IN',
              'GREATER_THAN',
              'LESS_THAN',
              'IS_EMPTY',
              'IS_NOT_EMPTY',
            ],
            required: true,
          },
          value: Schema.Types.Mixed,
          action: { type: String, enum: ['SHOW', 'HIDE'], required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
    options: {
      type: [
        {
          label: { type: String, required: true },
          value: { type: String, required: true },
          score: { type: Number },
          weight: { type: Number },
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
        selectionControl?: 'radio' | 'checkbox';
        multiSelectScoring?: 'MAX' | 'AVERAGE' | 'SUM_CAPPED';
        borderStyle?: 'standard' | 'paper';
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
          selectionControl: { type: String, enum: ['radio', 'checkbox'], default: 'radio' },
          multiSelectScoring: { type: String, enum: ['MAX', 'AVERAGE', 'SUM_CAPPED'], default: 'MAX' },
          borderStyle: { type: String, enum: ['standard', 'paper'], default: 'standard' },
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

const objectiveBucketSchema = new Schema<IObjectiveBucket>(
  {
    bucketKey: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    source: {
      type: String,
      required: true,
      enum: ['TEMPLATE_PREDEFINED', 'EMPLOYEE_DYNAMIC', 'MANAGER_DYNAMIC'],
    },
    owner: {
      type: String,
      required: true,
      enum: ['SYSTEM', 'EMPLOYEE', 'MANAGER'],
    },
    bucketWeightage: { type: Number, required: true, min: 0, max: 100 },
    rowWeightMode: {
      type: String,
      required: true,
      enum: ['FIXED_BY_TEMPLATE', 'OWNER_ENTERED', 'EQUAL_DISTRIBUTION'],
    },
    editableBy: [{ type: String }],
    requiresManagerApproval: { type: Boolean, default: false },
    autoApprove: { type: Boolean, default: false },
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
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
    repeatable: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    layout: { type: String, enum: ['vertical', 'grid', 'table', 'bordered_grid'], default: 'vertical' },
    renderingScope: {
      type: String,
      enum: ['QUARTER_ONLY', 'ANNUAL_ONLY', 'BOTH'],
      default: 'ANNUAL_ONLY',
    },
    quarterScope: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
    sectionScoringConfig: {
      type: new Schema(
        {
          participatesInScoring: { type: Boolean, default: false },
          weightage: { type: Number, default: 0 },
          aggregationMethod: {
            type: String,
            enum: ['WEIGHTED_AVERAGE', 'SIMPLE_AVERAGE', 'SUM', 'MAX_FIELD'],
            default: 'WEIGHTED_AVERAGE',
          },
          maxSectionScore: { type: Number, default: 100 },
        },
        { _id: false },
      ),
      default: undefined,
    },
    visibilityRules: Schema.Types.Mixed,
    editabilityRules: Schema.Types.Mixed,
    objectiveConfig: {
      type: objectiveConfigSchema,
      default: undefined,
    },
    objectiveBuckets: {
      type: [objectiveBucketSchema],
      default: undefined,
    },
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
    metadata: { type: Schema.Types.Mixed, default: {} },
    themeConfig: { type: Schema.Types.Mixed, default: {} },
    scoringConfig: { type: Schema.Types.Mixed, default: {} },
    annualScoringConfig: { type: Schema.Types.Mixed, default: {} },
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
