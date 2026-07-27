import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  PmsTemplateFieldType,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  PmsTemplateStatus,
  FieldCategory,
  SemanticRole,
  AssessmentTermCode,
  NoObjectiveScoringPolicy,
  ObjectiveActualAggregationMode,
  ObjectiveScoringMode,
} from '../constants/pms.enums';
import type {
  PmsTemplateFieldType as PmsTemplateFieldTypeType,
  PmsTemplateSectionLevel as PmsTemplateSectionLevelType,
  PmsTemplateSectionType as PmsTemplateSectionTypeType,
  PmsTemplateStatus as PmsTemplateStatusType,
  FieldCategory as FieldCategoryType,
  SemanticRole as SemanticRoleType,
  AssessmentTermCode as AssessmentTermCodeType,
  NoObjectiveScoringPolicy as NoObjectiveScoringPolicyType,
  ObjectiveActualAggregationMode as ObjectiveActualAggregationModeType,
  ObjectiveScoringMode as ObjectiveScoringModeType,
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
  dueDate?: string;
  weightage?: number;
  successCriteria?: string;
  attachmentAllowed?: boolean;
  applyToAllQuarters?: boolean;
  editable?: boolean;
  isActive?: boolean;
  termScope?: AssessmentTermCodeType[];
  applicableTerms?: AssessmentTermCodeType[];
  repeatFor?: AssessmentTermCodeType[];
  columnValues?: Record<string, unknown>;
  rowGroupKey?: string;
  rowOrder?: number;
}

export type TemplateObjectiveColumnType =
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'NUMERIC_INPUT'
  | 'PERCENTAGE'
  | 'CURRENCY'
  | 'DATE'
  | 'DROPDOWN'
  | 'BOOLEAN'
  | 'RATING_SCALE'
  | 'ATTACHMENT'
  | 'OBJECTIVE_EVIDENCE'
  | 'FORMULA'
  | 'SYSTEM_DISPLAY';
export type TemplateObjectiveColumnTermMode =
  | 'EVERY_REVIEW_PERIOD'
  | 'CURRENT_PERIOD'
  | 'SELECTED_PERIODS'
  | 'SHARED_ANNUAL';
export type TemplateObjectiveFormulaScope =
  | 'ROW'
  | 'ROW_ACROSS_TERMS'
  | 'GROUP'
  | 'TABLE';

export interface ITemplateObjectiveTableColumnAccess {
  role: string;
  visible: boolean;
  editable: boolean;
  required?: boolean;
}

export type ObjectiveEvidenceDisplayMode = 'ANNUAL_AGGREGATED';
export type ObjectiveEvidenceScope = 'PER_EMPLOYEE_TERM';
export type ObjectiveEvidenceReplacementPolicy = 'REPLACE_ACTIVE_TERM_DOCUMENT';

export interface IObjectiveEvidenceColumnConfig {
  scope: ObjectiveEvidenceScope;
  displayMode: ObjectiveEvidenceDisplayMode;
  maxActiveFilesPerTerm: 1;
  replacementPolicy: ObjectiveEvidenceReplacementPolicy;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  showTermLabel: boolean;
  allowPreview: boolean;
  allowDownload: boolean;
  allowEmployeeRemove: boolean;
  retainReplacementHistory: boolean;
}

export interface ITemplateObjectiveTableColumn {
  columnId: string;
  bindingKey: string;
  label: string;
  type: TemplateObjectiveColumnType;
  displayOrder: number;
  width?: number;
  helpText?: string;
  required?: boolean;
  fillOwner: 'ROW_CREATOR' | 'EMPLOYEE' | 'MANAGER' | 'ADMIN' | 'SYSTEM';
  workflowStage:
  | 'OBJECTIVE_SETTING'
  | 'EMPLOYEE_ACHIEVEMENT'
  | 'MANAGER_REVIEW'
  | 'ANNUAL_DECISION'
  | 'CALCULATED';
  options?: ITemplateOption[];
  access?: ITemplateObjectiveTableColumnAccess[];
  evidenceConfig?: IObjectiveEvidenceColumnConfig;
}

export interface ITemplateObjectiveColumnGroup {
  groupId: string;
  label: string;
  columnIds: string[];
  displayOrder: number;
}

export interface ITemplateObjectiveRowGroup {
  rowGroupKey: string;
  label: string;
  source: 'PREDEFINED' | 'EMPLOYEE_CREATED' | 'MANAGER_CREATED';
  displayOrder: number;
}

export interface ITemplateObjectiveRowAssignment {
  objectiveKey: string;
  rowGroupKey: string;
  displayOrder: number;
}

export interface ITemplateObjectiveColumnTermPolicy {
  columnId: string;
  mode: TemplateObjectiveColumnTermMode;
  selectedTerms?: AssessmentTermCodeType[];
}

export interface ITemplateObjectiveFormula {
  formulaId: string;
  targetColumnId: string;
  scope: TemplateObjectiveFormulaScope;
  ast: Record<string, unknown>;
  emptyPolicy: 'IGNORE' | 'ZERO' | 'ERROR';
  divideByZeroPolicy: 'NULL' | 'ZERO' | 'ERROR';
  decimalPrecision?: number;
}

export interface ITemplateObjectiveCalculatedRow {
  calculatedRowId: string;
  label: string;
  scope: 'GROUP' | 'TABLE';
  formulaId: string;
  rowGroupKey?: string;
  displayOrder: number;
}

export interface ITemplateObjectiveTableLayout {
  enabled: boolean;
  layoutVersion: number;
  rowGroupColumnLabel?: string;
  columns: ITemplateObjectiveTableColumn[];
  columnGroups: ITemplateObjectiveColumnGroup[];
  rowGroups: ITemplateObjectiveRowGroup[];
  rowAssignments: ITemplateObjectiveRowAssignment[];
  termPolicies: ITemplateObjectiveColumnTermPolicy[];
  formulas: ITemplateObjectiveFormula[];
  calculatedRows: ITemplateObjectiveCalculatedRow[];
  dynamicRowPolicy: {
    employeeDefaultScope: 'CURRENT_TERM';
    managerDefaultScope: 'CURRENT_TERM';
    allowEmployeeTermChoice: boolean;
    allowManagerTermChoice: boolean;
  };
}

export interface ITemplateObjectiveConfig {
  mode: 'PREDEFINED' | 'DYNAMIC' | 'HYBRID';
  allowEmployeeCreated?: boolean;
  allowManagerCreated?: boolean;
  managerCreatedAutoApprove?: boolean;
  objectiveScoringPolicy?: {
    objectiveScoringEnabled?: boolean;
    objectiveScoringMode?: ObjectiveScoringModeType;
    objectiveSectionWeight?: number;
    perObjectiveScoreEntryAllowed?: boolean;
    overallScoreEntryAllowed?: boolean;
    noObjectiveScoringPolicy?: NoObjectiveScoringPolicyType;
    reviewTimingPolicy?: Record<string, unknown>;
    includedAssessmentTermGroupingPolicy?: Record<string, unknown>;
    termAggregationPolicy?: Record<string, unknown>;
    scoringValidationRules?: Record<string, unknown>;
    predefinedObjectivesScoreable?: boolean;
    managerCreatedScoreable?: boolean;
    employeeCreatedScoreable?: boolean;
    requireManagerApprovalForEmployeeScore?: boolean;
    requireWeightageBeforeAchievement?: boolean;
    allowManagerOverallForRemainingWeightage?: boolean;
    actualAggregationMode?: ObjectiveActualAggregationModeType;
  };
  predefinedObjectives?: ITemplatePredefinedObjective[];
  tableLayout?: ITemplateObjectiveTableLayout;
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
  metadata?: Record<string, unknown>;
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
    columns: Array<{
      key: string;
      label: string;
      type: string;
      required?: boolean;
      editable?: boolean;
      readOnly?: boolean;
      defaultValue?: unknown;
    }>;
    minRows?: number;
    maxRows?: number;
    defaultRows?: Array<Record<string, unknown>>;
    allowAddRows?: boolean;
    allowDeleteRows?: boolean;
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
  editable?: boolean;
  readOnly?: boolean;
  defaultValue?: unknown;
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
    editable: { type: Boolean },
    readOnly: { type: Boolean },
    defaultValue: { type: Schema.Types.Mixed },
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
    dueDate: { type: String, trim: true },
    weightage: { type: Number, min: 0, max: 100 },
    successCriteria: { type: String, trim: true },
    attachmentAllowed: { type: Boolean, default: false },
    applyToAllQuarters: { type: Boolean, default: true },
    editable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    termScope: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
    applicableTerms: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
    repeatFor: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: [],
    },
    columnValues: { type: Schema.Types.Mixed, default: {} },
    rowGroupKey: { type: String, trim: true },
    rowOrder: { type: Number, min: 0 },
  },
  { _id: false },
);

const objectiveTableColumnAccessSchema = new Schema<ITemplateObjectiveTableColumnAccess>(
  {
    role: { type: String, required: true, trim: true },
    visible: { type: Boolean, required: true, default: true },
    editable: { type: Boolean, required: true, default: false },
    required: { type: Boolean, default: false },
  },
  { _id: false },
);

const objectiveEvidenceColumnConfigSchema = new Schema<IObjectiveEvidenceColumnConfig>(
  {
    scope: {
      type: String,
      required: true,
      enum: ['PER_EMPLOYEE_TERM'],
    },
    displayMode: {
      type: String,
      required: true,
      enum: ['ANNUAL_AGGREGATED'],
    },
    maxActiveFilesPerTerm: {
      type: Number,
      required: true,
      enum: [1],
    },
    replacementPolicy: {
      type: String,
      required: true,
      enum: ['REPLACE_ACTIVE_TERM_DOCUMENT'],
    },
    maxFileSizeBytes: { type: Number, required: true, min: 1 },
    allowedMimeTypes: {
      type: [{ type: String, trim: true }],
      required: true,
      default: undefined,
    },
    showTermLabel: { type: Boolean, required: true },
    allowPreview: { type: Boolean, required: true },
    allowDownload: { type: Boolean, required: true },
    allowEmployeeRemove: { type: Boolean, required: true },
    retainReplacementHistory: { type: Boolean, required: true },
  },
  { _id: false },
);

const objectiveTableColumnSchema = new Schema<ITemplateObjectiveTableColumn>(
  {
    columnId: { type: String, required: true, trim: true },
    bindingKey: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: [
        PmsTemplateFieldType.SHORT_TEXT,
        PmsTemplateFieldType.LONG_TEXT,
        PmsTemplateFieldType.NUMERIC_INPUT,
        PmsTemplateFieldType.PERCENTAGE,
        PmsTemplateFieldType.CURRENCY,
        PmsTemplateFieldType.DATE,
        PmsTemplateFieldType.DROPDOWN,
        PmsTemplateFieldType.BOOLEAN,
        PmsTemplateFieldType.RATING_SCALE,
        PmsTemplateFieldType.ATTACHMENT,
        'OBJECTIVE_EVIDENCE',
        PmsTemplateFieldType.FORMULA,
        'SYSTEM_DISPLAY',
      ],
    },
    displayOrder: { type: Number, required: true, min: 0 },
    width: { type: Number, min: 60, max: 1200 },
    helpText: { type: String, trim: true },
    required: { type: Boolean, default: false },
    fillOwner: {
      type: String,
      required: true,
      enum: ['ROW_CREATOR', 'EMPLOYEE', 'MANAGER', 'ADMIN', 'SYSTEM'],
    },
    workflowStage: {
      type: String,
      required: true,
      enum: [
        'OBJECTIVE_SETTING',
        'EMPLOYEE_ACHIEVEMENT',
        'MANAGER_REVIEW',
        'ANNUAL_DECISION',
        'CALCULATED',
      ],
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
      default: undefined,
    },
    access: { type: [objectiveTableColumnAccessSchema], default: [] },
    evidenceConfig: {
      type: objectiveEvidenceColumnConfigSchema,
      default: undefined,
    },
  },
  { _id: false },
);

const objectiveColumnGroupSchema = new Schema<ITemplateObjectiveColumnGroup>(
  {
    groupId: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    columnIds: { type: [{ type: String, trim: true }], default: [] },
    displayOrder: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const objectiveRowGroupSchema = new Schema<ITemplateObjectiveRowGroup>(
  {
    rowGroupKey: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    source: {
      type: String,
      required: true,
      enum: ['PREDEFINED', 'EMPLOYEE_CREATED', 'MANAGER_CREATED'],
    },
    displayOrder: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const objectiveRowAssignmentSchema = new Schema<ITemplateObjectiveRowAssignment>(
  {
    objectiveKey: { type: String, required: true, trim: true },
    rowGroupKey: { type: String, required: true, trim: true },
    displayOrder: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const objectiveColumnTermPolicySchema = new Schema<ITemplateObjectiveColumnTermPolicy>(
  {
    columnId: { type: String, required: true, trim: true },
    mode: {
      type: String,
      required: true,
      enum: [
        'EVERY_REVIEW_PERIOD',
        'CURRENT_PERIOD',
        'SELECTED_PERIODS',
        'SHARED_ANNUAL',
      ],
    },
    selectedTerms: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: undefined,
    },
  },
  { _id: false },
);

const objectiveFormulaSchema = new Schema<ITemplateObjectiveFormula>(
  {
    formulaId: { type: String, required: true, trim: true },
    targetColumnId: { type: String, required: true, trim: true },
    scope: {
      type: String,
      required: true,
      enum: ['ROW', 'ROW_ACROSS_TERMS', 'GROUP', 'TABLE'],
    },
    ast: { type: Schema.Types.Mixed, required: true },
    emptyPolicy: {
      type: String,
      required: true,
      enum: ['IGNORE', 'ZERO', 'ERROR'],
      default: 'IGNORE',
    },
    divideByZeroPolicy: {
      type: String,
      required: true,
      enum: ['NULL', 'ZERO', 'ERROR'],
      default: 'NULL',
    },
    decimalPrecision: { type: Number, min: 0, max: 12 },
  },
  { _id: false },
);

const objectiveCalculatedRowSchema = new Schema<ITemplateObjectiveCalculatedRow>(
  {
    calculatedRowId: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    scope: { type: String, required: true, enum: ['GROUP', 'TABLE'] },
    formulaId: { type: String, required: true, trim: true },
    rowGroupKey: { type: String, trim: true },
    displayOrder: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const objectiveTableLayoutSchema = new Schema<ITemplateObjectiveTableLayout>(
  {
    enabled: { type: Boolean, default: false },
    layoutVersion: { type: Number, required: true, min: 1, default: 1 },
    rowGroupColumnLabel: { type: String, trim: true, default: 'Row group' },
    columns: { type: [objectiveTableColumnSchema], default: [] },
    columnGroups: { type: [objectiveColumnGroupSchema], default: [] },
    rowGroups: { type: [objectiveRowGroupSchema], default: [] },
    rowAssignments: { type: [objectiveRowAssignmentSchema], default: [] },
    termPolicies: { type: [objectiveColumnTermPolicySchema], default: [] },
    formulas: { type: [objectiveFormulaSchema], default: [] },
    calculatedRows: { type: [objectiveCalculatedRowSchema], default: [] },
    dynamicRowPolicy: {
      type: new Schema(
        {
          employeeDefaultScope: {
            type: String,
            enum: ['CURRENT_TERM'],
            default: 'CURRENT_TERM',
          },
          managerDefaultScope: {
            type: String,
            enum: ['CURRENT_TERM'],
            default: 'CURRENT_TERM',
          },
          allowEmployeeTermChoice: { type: Boolean, default: false },
          allowManagerTermChoice: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: () => ({
        employeeDefaultScope: 'CURRENT_TERM',
        managerDefaultScope: 'CURRENT_TERM',
        allowEmployeeTermChoice: false,
        allowManagerTermChoice: false,
      }),
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
    managerCreatedAutoApprove: { type: Boolean, default: true },
    objectiveScoringPolicy: {
      objectiveScoringEnabled: { type: Boolean, default: false },
      objectiveScoringMode: {
        type: String,
        enum: Object.values(ObjectiveScoringMode),
        default: ObjectiveScoringMode.CONTEXT_ONLY,
      },
      objectiveSectionWeight: { type: Number, min: 0, max: 100, default: 0 },
      perObjectiveScoreEntryAllowed: { type: Boolean, default: false },
      overallScoreEntryAllowed: { type: Boolean, default: false },
      noObjectiveScoringPolicy: {
        type: String,
        enum: Object.values(NoObjectiveScoringPolicy),
        default: NoObjectiveScoringPolicy.NO_OBJECTIVES_NOT_APPLICABLE,
      },
      reviewTimingPolicy: { type: Schema.Types.Mixed, default: {} },
      includedAssessmentTermGroupingPolicy: { type: Schema.Types.Mixed, default: {} },
      termAggregationPolicy: { type: Schema.Types.Mixed, default: {} },
      scoringValidationRules: { type: Schema.Types.Mixed, default: {} },
      predefinedObjectivesScoreable: { type: Boolean, default: true },
      managerCreatedScoreable: { type: Boolean, default: false },
      employeeCreatedScoreable: { type: Boolean, default: false },
      requireManagerApprovalForEmployeeScore: { type: Boolean, default: true },
      requireWeightageBeforeAchievement: { type: Boolean, default: true },
      allowManagerOverallForRemainingWeightage: { type: Boolean, default: true },
      actualAggregationMode: {
        type: String,
        enum: Object.values(ObjectiveActualAggregationMode),
        default: ObjectiveActualAggregationMode.LATEST_VALUE,
      },
    },
    predefinedObjectives: { type: [predefinedObjectiveSchema], default: [] },
    tableLayout: { type: objectiveTableLayoutSchema, default: undefined },
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
  renderingScope?: 'TERM_ONLY' | 'ANNUAL_ONLY' | 'BOTH';
  termScope?: AssessmentTermCodeType[];
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
  templateOwnership?: Record<string, unknown>;
  launchPolicy?: Record<string, unknown>;
  flowPolicy?: Record<string, unknown>;
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
    metadata: Schema.Types.Mixed,
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
        defaultRows?: Array<Record<string, unknown>>;
        allowAddRows?: boolean;
        allowDeleteRows?: boolean;
      }>(
        {
          columns: {
            type: [gridColumnSchema],
            default: [],
          },
          minRows: { type: Number, min: 0 },
          maxRows: { type: Number, min: 0 },
          defaultRows: { type: [Schema.Types.Mixed], default: undefined },
          allowAddRows: { type: Boolean },
          allowDeleteRows: { type: Boolean },
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
      enum: ['TERM_ONLY', 'ANNUAL_ONLY', 'BOTH'],
      default: 'ANNUAL_ONLY',
    },
    termScope: {
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
    templateOwnership: { type: Schema.Types.Mixed, default: {} },
    launchPolicy: { type: Schema.Types.Mixed, default: {} },
    flowPolicy: { type: Schema.Types.Mixed, default: {} },
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
