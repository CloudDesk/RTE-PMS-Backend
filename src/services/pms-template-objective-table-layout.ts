import {
  AssessmentTermCode,
  PmsRole,
  PmsTemplateFieldType,
  normalizePmsRole,
} from '../constants/pms.enums';
import type {
  ITemplateObjectiveTableLayout,
  ITemplatePredefinedObjective,
} from '../models/pms-template-version.model';

const COLUMN_TYPES = new Set<string>([
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
]);
const FILL_OWNERS = new Set([
  'ROW_CREATOR',
  'EMPLOYEE',
  'MANAGER',
  'ADMIN',
  'SYSTEM',
]);
const WORKFLOW_STAGES = new Set([
  'OBJECTIVE_SETTING',
  'EMPLOYEE_ACHIEVEMENT',
  'MANAGER_REVIEW',
  'ANNUAL_DECISION',
  'CALCULATED',
]);
const TERM_MODES = new Set([
  'EVERY_REVIEW_PERIOD',
  'CURRENT_PERIOD',
  'SELECTED_PERIODS',
  'SHARED_ANNUAL',
]);
const FORMULA_SCOPES = new Set(['ROW', 'ROW_ACROSS_TERMS', 'GROUP', 'TABLE']);
const FORMULA_OPERATORS = new Set(['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE']);
const FORMULA_FUNCTIONS = new Set([
  'ABS',
  'ROUND',
  'MIN',
  'MAX',
  'SUM_TERMS',
  'AVERAGE_TERMS',
  'LATEST_FILLED_TERM',
  'MIN_TERMS',
  'MAX_TERMS',
  'SUM_GROUP',
  'AVERAGE_GROUP',
  'MIN_GROUP',
  'MAX_GROUP',
  'COUNT_GROUP',
  'SUM_TABLE',
  'AVERAGE_TABLE',
  'MIN_TABLE',
  'MAX_TABLE',
  'COUNT_TABLE',
]);
const FORMULA_NODE_TYPES = new Set([
  'LITERAL',
  'COLUMN',
  'OPERATOR',
  'FUNCTION',
  'ROW_GROUP',
]);
const CORE_BINDINGS = new Set([
  'objective.title',
  'objective.description',
  'objective.kpi',
  'objective.targetValue',
  'objective.targetDate',
  'objective.weightage',
  'objective.successCriteria',
  'objective.status',
  'objective.source',
]);

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function slug(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function stableId(
  prefix: string,
  current: unknown,
  seed: unknown,
  used: Set<string>,
): string {
  const requested = String(current ?? '').trim();
  if (requested) {
    used.add(requested);
    return requested;
  }
  const base = `${prefix}-${slug(seed)}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function roleCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  return normalizePmsRole(raw) ?? raw.replace(/[ /-]/g, '_').toUpperCase();
}

function validTermList(value: unknown): AssessmentTermCode[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((term): term is AssessmentTermCode =>
    Object.values(AssessmentTermCode).includes(term as AssessmentTermCode),
  );
}

export function normalizeObjectiveTableLayout(
  rawLayout: unknown,
): ITemplateObjectiveTableLayout | undefined {
  if (!rawLayout || typeof rawLayout !== 'object' || Array.isArray(rawLayout)) {
    return undefined;
  }

  const layout = rawLayout as Record<string, any>;
  const columnIds = new Set<string>();
  const groupIds = new Set<string>();
  const rowGroupIds = new Set<string>();
  const formulaIds = new Set<string>();
  const calculatedRowIds = new Set<string>();

  const sourceColumns = Array.isArray(layout.columns) ? layout.columns : [];
  const columns = sourceColumns.map((column: Record<string, any>, index: number) => {
    const columnId = stableId(
      'column',
      column.columnId ?? column.id,
      column.bindingKey ?? column.fieldKey ?? column.label ?? index + 1,
      columnIds,
    );
    const type = String(column.type ?? PmsTemplateFieldType.SHORT_TEXT).toUpperCase();
    return {
      columnId,
      bindingKey: String(column.bindingKey ?? column.fieldKey ?? `custom.${slug(column.label ?? columnId)}`).trim(),
      label: String(column.label ?? column.fieldLabel ?? '').trim(),
      type: (COLUMN_TYPES.has(type) ? type : type) as any,
      displayOrder: Number.isFinite(Number(column.displayOrder))
        ? Number(column.displayOrder)
        : index + 1,
      width: column.width === undefined ? undefined : Number(column.width),
      helpText: column.helpText ? String(column.helpText) : undefined,
      required: column.required === true,
      fillOwner: String(column.fillOwner ?? (type === 'FORMULA' ? 'SYSTEM' : 'ROW_CREATOR')).toUpperCase() as any,
      workflowStage: String(column.workflowStage ?? (type === 'FORMULA' ? 'CALCULATED' : 'OBJECTIVE_SETTING')).toUpperCase() as any,
      options: Array.isArray(column.options)
        ? column.options.map((option: Record<string, any>) => ({
          label: String(option.label ?? '').trim(),
          value: String(option.value ?? '').trim(),
          ...(option.score === undefined ? {} : { score: Number(option.score) }),
          ...(option.weight === undefined ? {} : { weight: Number(option.weight) }),
        }))
        : undefined,
      access: Array.isArray(column.access)
        ? column.access.map((access: Record<string, any>) => ({
          role: roleCode(access.role),
          visible: access.visible !== false,
          editable: access.editable === true,
          required: access.required === true,
        }))
        : [],
      evidenceConfig: column.evidenceConfig && typeof column.evidenceConfig === 'object'
        ? {
          scope: String(column.evidenceConfig.scope ?? '').toUpperCase(),
          displayMode: String(column.evidenceConfig.displayMode ?? '').toUpperCase(),
          maxActiveFilesPerTerm: Number(column.evidenceConfig.maxActiveFilesPerTerm),
          replacementPolicy: String(column.evidenceConfig.replacementPolicy ?? '').toUpperCase(),
          maxFileSizeBytes: Number(column.evidenceConfig.maxFileSizeBytes),
          allowedMimeTypes: Array.isArray(column.evidenceConfig.allowedMimeTypes)
            ? column.evidenceConfig.allowedMimeTypes.map((mimeType: unknown) => String(mimeType).trim())
            : [],
          showTermLabel: column.evidenceConfig.showTermLabel === true,
          allowPreview: column.evidenceConfig.allowPreview === true,
          allowDownload: column.evidenceConfig.allowDownload === true,
          allowEmployeeRemove: column.evidenceConfig.allowEmployeeRemove === true,
          retainReplacementHistory: column.evidenceConfig.retainReplacementHistory === true,
        } as any
        : undefined,
    };
  });

  const columnsById = new Map(columns.map((column, index) => [column.columnId, sourceColumns[index]]));
  const columnGroups = (Array.isArray(layout.columnGroups) ? layout.columnGroups : []).map(
    (group: Record<string, any>, index: number) => ({
      groupId: stableId('column-group', group.groupId ?? group.id, group.label ?? index + 1, groupIds),
      label: String(group.label ?? '').trim(),
      columnIds: Array.isArray(group.columnIds) ? group.columnIds.map(String) : [],
      displayOrder: Number.isFinite(Number(group.displayOrder))
        ? Number(group.displayOrder)
        : index + 1,
    }),
  );
  const rowGroups = (Array.isArray(layout.rowGroups) ? layout.rowGroups : []).map(
    (group: Record<string, any>, index: number) => ({
      rowGroupKey: stableId(
        'row-group',
        group.rowGroupKey ?? group.id,
        group.label ?? group.source ?? index + 1,
        rowGroupIds,
      ),
      label: String(group.label ?? '').trim(),
      source: String(group.source ?? 'PREDEFINED').toUpperCase() as any,
      displayOrder: Number.isFinite(Number(group.displayOrder))
        ? Number(group.displayOrder)
        : index + 1,
    }),
  );
  const rowAssignments = (Array.isArray(layout.rowAssignments) ? layout.rowAssignments : []).map(
    (assignment: Record<string, any>, index: number) => ({
      objectiveKey: String(assignment.objectiveKey ?? '').trim(),
      rowGroupKey: String(assignment.rowGroupKey ?? '').trim(),
      displayOrder: Number.isFinite(Number(assignment.displayOrder))
        ? Number(assignment.displayOrder)
        : index + 1,
    }),
  );

  const rawTermPolicies = Array.isArray(layout.termPolicies) ? layout.termPolicies : [];
  const termPolicyByColumn = new Map(
    rawTermPolicies.map((policy: Record<string, any>) => [String(policy.columnId ?? ''), policy]),
  );
  const termPolicies = columns.map((column) => {
    const sourceColumn = columnsById.get(column.columnId) ?? {};
    const rawPolicy = termPolicyByColumn.get(column.columnId) ?? {
      mode: sourceColumn.termPolicy,
      selectedTerms: sourceColumn.selectedTerms,
    };
    const mode = String(rawPolicy.mode ?? 'EVERY_REVIEW_PERIOD').toUpperCase();
    return {
      columnId: column.columnId,
      mode: (TERM_MODES.has(mode) ? mode : mode) as any,
      selectedTerms: validTermList(rawPolicy.selectedTerms),
    };
  });

  const formulas = (Array.isArray(layout.formulas) ? layout.formulas : []).map(
    (formula: Record<string, any>, index: number) => ({
      formulaId: stableId(
        'formula',
        formula.formulaId ?? formula.id,
        formula.targetColumnId ?? index + 1,
        formulaIds,
      ),
      targetColumnId: String(formula.targetColumnId ?? '').trim(),
      scope: String(formula.scope ?? 'ROW').toUpperCase() as any,
      ast: cloneValue(formula.ast ?? {}),
      emptyPolicy: String(formula.emptyPolicy ?? 'IGNORE').toUpperCase() as any,
      divideByZeroPolicy: String(formula.divideByZeroPolicy ?? 'NULL').toUpperCase() as any,
      decimalPrecision:
        formula.decimalPrecision === undefined
          ? undefined
          : Number(formula.decimalPrecision),
    }),
  );
  const calculatedRows = (Array.isArray(layout.calculatedRows) ? layout.calculatedRows : []).map(
    (row: Record<string, any>, index: number) => ({
      calculatedRowId: stableId(
        'calculated-row',
        row.calculatedRowId ?? row.id,
        row.label ?? index + 1,
        calculatedRowIds,
      ),
      label: String(row.label ?? '').trim(),
      scope: String(row.scope ?? 'TABLE').toUpperCase() as any,
      formulaId: String(row.formulaId ?? '').trim(),
      rowGroupKey: row.rowGroupKey ? String(row.rowGroupKey).trim() : undefined,
      displayOrder: Number.isFinite(Number(row.displayOrder))
        ? Number(row.displayOrder)
        : index + 1,
    }),
  );

  return {
    enabled: layout.enabled === true,
    layoutVersion: Number.isInteger(Number(layout.layoutVersion)) && Number(layout.layoutVersion) > 0
      ? Number(layout.layoutVersion)
      : 1,
    columns,
    columnGroups,
    rowGroups,
    rowAssignments,
    termPolicies,
    formulas,
    calculatedRows,
    dynamicRowPolicy: {
      employeeDefaultScope: 'CURRENT_TERM',
      managerDefaultScope: 'CURRENT_TERM',
      allowEmployeeTermChoice: layout.dynamicRowPolicy?.allowEmployeeTermChoice === true,
      allowManagerTermChoice: layout.dynamicRowPolicy?.allowManagerTermChoice === true,
    },
  };
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function collectFormulaReferences(
  node: unknown,
  path: string,
  errors: string[],
  references: Set<string>,
): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    errors.push(`${path} must be an expression object`);
    return;
  }
  const expression = node as Record<string, unknown>;
  const type = String(expression.type ?? '');
  if (!FORMULA_NODE_TYPES.has(type)) {
    errors.push(`${path} has unsupported node type "${type || 'missing'}"`);
    return;
  }
  if (type === 'COLUMN') {
    const columnId = String(expression.columnId ?? '').trim();
    if (!columnId) errors.push(`${path} column reference is missing columnId`);
    else references.add(columnId);
    return;
  }
  if (type === 'LITERAL' || type === 'ROW_GROUP') return;
  if (type === 'OPERATOR') {
    const operator = String(expression.operator ?? '');
    if (!FORMULA_OPERATORS.has(operator)) {
      errors.push(`${path} has unsupported operator "${operator || 'missing'}"`);
    }
    collectFormulaReferences(expression.left, `${path}.left`, errors, references);
    collectFormulaReferences(expression.right, `${path}.right`, errors, references);
    return;
  }
  const name = String(expression.name ?? '');
  if (!FORMULA_FUNCTIONS.has(name)) {
    errors.push(`${path} has unsupported function "${name || 'missing'}"`);
  }
  const args = Array.isArray(expression.arguments) ? expression.arguments : [];
  if (args.length === 0) errors.push(`${path} function ${name || 'unknown'} requires arguments`);
  args.forEach((argument, index) =>
    collectFormulaReferences(argument, `${path}.arguments[${index}]`, errors, references),
  );
}

function collectFormulaFunctions(node: unknown, functions = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return functions;
  const expression = node as Record<string, unknown>;
  if (expression.type === 'OPERATOR') {
    collectFormulaFunctions(expression.left, functions);
    collectFormulaFunctions(expression.right, functions);
  }
  if (expression.type === 'FUNCTION') {
    const name = String(expression.name ?? '').trim();
    if (name) functions.add(name);
    for (const argument of Array.isArray(expression.arguments) ? expression.arguments : []) {
      collectFormulaFunctions(argument, functions);
    }
  }
  return functions;
}

export function objectiveTableLayoutValidationErrors(
  layout: ITemplateObjectiveTableLayout | undefined,
  options: {
    activationReady: boolean;
    predefinedObjectives?: ITemplatePredefinedObjective[];
    templateFieldKeys?: string[];
    allowEmployeeCreated?: boolean;
    allowManagerCreated?: boolean;
  },
): string[] {
  if (!layout || !layout.enabled) return [];
  const errors: string[] = [];
  const prefix = 'Objective table layout';
  const columns = layout.columns ?? [];
  const columnIds = new Set(columns.map((column) => column.columnId));
  const columnBindingKeys = new Set(columns.map((column) => column.bindingKey));
  const columnById = new Map(columns.map((column) => [column.columnId, column]));
  const rowGroupKeys = new Set((layout.rowGroups ?? []).map((group) => group.rowGroupKey));
  const formulaIds = new Set((layout.formulas ?? []).map((formula) => formula.formulaId));
  const templateFieldKeys = new Set(options.templateFieldKeys ?? []);
  const predefinedKeys = new Set(
    (options.predefinedObjectives ?? []).map((objective) => objective.objectiveKey),
  );

  if (options.activationReady && columns.length === 0) {
    errors.push(`${prefix} requires at least one column before activation`);
  }
  if (options.activationReady && predefinedKeys.size === 0) {
    errors.push(`${prefix} requires at least one template row before activation`);
  }
  for (const duplicate of duplicateValues(columns.map((column) => column.columnId))) {
    errors.push(`${prefix} has duplicate columnId "${duplicate}"`);
  }
  for (const duplicate of duplicateValues(columns.map((column) => column.bindingKey))) {
    errors.push(`${prefix} has duplicate bindingKey "${duplicate}"`);
  }
  if (columns.filter((column) => column.type === 'OBJECTIVE_EVIDENCE').length > 1) {
    errors.push(`${prefix} allows only one OBJECTIVE_EVIDENCE column`);
  }
  for (const column of columns) {
    if (!column.columnId?.trim()) errors.push(`${prefix} has a column without columnId`);
    if (!column.bindingKey?.trim()) errors.push(`${prefix} column "${column.columnId}" requires bindingKey`);
    if (!column.label?.trim()) errors.push(`${prefix} column "${column.columnId}" requires label`);
    if (!COLUMN_TYPES.has(column.type)) errors.push(`${prefix} column "${column.columnId}" has invalid type "${column.type}"`);
    if (!FILL_OWNERS.has(column.fillOwner)) errors.push(`${prefix} column "${column.columnId}" has invalid fillOwner "${column.fillOwner}"`);
    if (!WORKFLOW_STAGES.has(column.workflowStage)) errors.push(`${prefix} column "${column.columnId}" has invalid workflowStage "${column.workflowStage}"`);
    const bindingAllowed =
      CORE_BINDINGS.has(column.bindingKey) ||
      templateFieldKeys.has(column.bindingKey) ||
      ['custom.', 'formula.', 'system.'].some((prefixValue) => column.bindingKey.startsWith(prefixValue));
    if (options.activationReady && !bindingAllowed) {
      errors.push(`${prefix} column "${column.columnId}" has unsupported bindingKey "${column.bindingKey}"`);
    }
    if (column.type === 'FORMULA' || column.type === 'SYSTEM_DISPLAY') {
      if (column.fillOwner !== 'SYSTEM' || column.workflowStage !== 'CALCULATED') {
        errors.push(`${prefix} calculated column "${column.columnId}" must be SYSTEM/CALCULATED`);
      }
    }
    if (column.type === PmsTemplateFieldType.DROPDOWN &&
        options.activationReady && (!column.options || column.options.length === 0)) {
      errors.push(`${prefix} dropdown column "${column.columnId}" requires options`);
    }
    if (column.type === 'OBJECTIVE_EVIDENCE') {
      const config = column.evidenceConfig;
      if (column.bindingKey !== 'system.objectiveEvidence') {
        errors.push(`${prefix} evidence column "${column.columnId}" must use bindingKey "system.objectiveEvidence"`);
      }
      if (column.fillOwner !== 'EMPLOYEE' || column.workflowStage !== 'EMPLOYEE_ACHIEVEMENT') {
        errors.push(`${prefix} evidence column "${column.columnId}" must be EMPLOYEE/EMPLOYEE_ACHIEVEMENT`);
      }
      if (column.required === true) {
        errors.push(`${prefix} evidence column "${column.columnId}" must be optional`);
      }
      if (!config) {
        errors.push(`${prefix} evidence column "${column.columnId}" requires evidenceConfig`);
      } else {
        if (config.scope !== 'PER_EMPLOYEE_TERM') {
          errors.push(`${prefix} evidence column "${column.columnId}" must use PER_EMPLOYEE_TERM scope`);
        }
        if (config.displayMode !== 'ANNUAL_AGGREGATED') {
          errors.push(`${prefix} evidence column "${column.columnId}" must use ANNUAL_AGGREGATED display`);
        }
        if (config.maxActiveFilesPerTerm !== 1) {
          errors.push(`${prefix} evidence column "${column.columnId}" must allow one active file per term`);
        }
        if (config.replacementPolicy !== 'REPLACE_ACTIVE_TERM_DOCUMENT') {
          errors.push(`${prefix} evidence column "${column.columnId}" must replace the active term document`);
        }
        if (!Number.isInteger(config.maxFileSizeBytes) || config.maxFileSizeBytes < 1) {
          errors.push(`${prefix} evidence column "${column.columnId}" requires a positive max file size`);
        }
        if (!Array.isArray(config.allowedMimeTypes) ||
            config.allowedMimeTypes.length === 0 ||
            config.allowedMimeTypes.some((mimeType) => !mimeType.trim())) {
          errors.push(`${prefix} evidence column "${column.columnId}" requires allowed MIME types`);
        }
      }
    } else if (column.evidenceConfig) {
      errors.push(`${prefix} column "${column.columnId}" cannot have evidenceConfig unless its type is OBJECTIVE_EVIDENCE`);
    }
    for (const duplicate of duplicateValues((column.access ?? []).map((access) => access.role))) {
      errors.push(`${prefix} column "${column.columnId}" has duplicate access role "${duplicate}"`);
    }
    for (const access of column.access ?? []) {
      if (!Object.values(PmsRole).includes(access.role as any)) {
        errors.push(`${prefix} column "${column.columnId}" has invalid access role "${access.role}"`);
      }
      if (!access.visible && (access.editable || access.required)) {
        errors.push(`${prefix} column "${column.columnId}" cannot be hidden and editable/required for ${access.role}`);
      }
      if ((column.type === 'FORMULA' || column.type === 'SYSTEM_DISPLAY') && access.editable) {
        errors.push(`${prefix} calculated column "${column.columnId}" cannot be editable for ${access.role}`);
      }
      if (column.type === 'OBJECTIVE_EVIDENCE') {
        if (access.required) {
          errors.push(`${prefix} evidence column "${column.columnId}" cannot be required for ${access.role}`);
        }
        if (access.editable && access.role !== PmsRole.EMPLOYEE) {
          errors.push(`${prefix} evidence column "${column.columnId}" cannot be editable for ${access.role}`);
        }
      }
    }
  }

  for (const duplicate of duplicateValues((layout.columnGroups ?? []).map((group) => group.groupId))) {
    errors.push(`${prefix} has duplicate column group "${duplicate}"`);
  }
  const groupedColumns = new Set<string>();
  for (const group of layout.columnGroups ?? []) {
    if (!group.label?.trim()) errors.push(`${prefix} column group "${group.groupId}" requires label`);
    for (const columnId of group.columnIds) {
      if (!columnIds.has(columnId)) errors.push(`${prefix} column group "${group.groupId}" references missing column "${columnId}"`);
      if (groupedColumns.has(columnId)) errors.push(`${prefix} column "${columnId}" belongs to more than one header group`);
      groupedColumns.add(columnId);
    }
  }

  for (const duplicate of duplicateValues((layout.rowGroups ?? []).map((group) => group.rowGroupKey))) {
    errors.push(`${prefix} has duplicate row group "${duplicate}"`);
  }
  for (const group of layout.rowGroups ?? []) {
    if (!group.label?.trim()) errors.push(`${prefix} row group "${group.rowGroupKey}" requires label`);
    if (!['PREDEFINED', 'EMPLOYEE_CREATED', 'MANAGER_CREATED'].includes(group.source)) {
      errors.push(`${prefix} row group "${group.rowGroupKey}" has invalid source "${group.source}"`);
    }
  }
  for (const duplicate of duplicateValues((layout.rowGroups ?? []).map((group) => group.source))) {
    errors.push(`${prefix} has more than one destination row group for source "${duplicate}"`);
  }
  const rowGroupingEnabled = (layout.rowGroups ?? []).length > 0;
  if (rowGroupingEnabled && options.activationReady && options.allowEmployeeCreated !== false &&
      !(layout.rowGroups ?? []).some((group) => group.source === 'EMPLOYEE_CREATED')) {
    errors.push(`${prefix} requires an EMPLOYEE_CREATED destination row group`);
  }
  if (rowGroupingEnabled && options.activationReady && options.allowManagerCreated !== false &&
      !(layout.rowGroups ?? []).some((group) => group.source === 'MANAGER_CREATED')) {
    errors.push(`${prefix} requires a MANAGER_CREATED destination row group`);
  }

  if (rowGroupingEnabled) {
    for (const duplicate of duplicateValues((layout.rowAssignments ?? []).map((item) => item.objectiveKey))) {
      errors.push(`${prefix} has duplicate row assignment for objective "${duplicate}"`);
    }
    for (const assignment of layout.rowAssignments ?? []) {
      if (!predefinedKeys.has(assignment.objectiveKey)) errors.push(`${prefix} row assignment references missing objective "${assignment.objectiveKey}"`);
      if (!rowGroupKeys.has(assignment.rowGroupKey)) errors.push(`${prefix} row assignment for "${assignment.objectiveKey}" references missing row group "${assignment.rowGroupKey}"`);
      const targetGroup = (layout.rowGroups ?? []).find(
        (group) => group.rowGroupKey === assignment.rowGroupKey,
      );
      if (targetGroup && targetGroup.source !== 'PREDEFINED') {
        errors.push(`${prefix} row assignment for "${assignment.objectiveKey}" must target a PREDEFINED row group`);
      }
    }
  }
  for (const objective of options.predefinedObjectives ?? []) {
    if (rowGroupingEnabled && objective.rowGroupKey && !rowGroupKeys.has(objective.rowGroupKey)) {
      errors.push(`${prefix} objective "${objective.objectiveKey}" references missing row group "${objective.rowGroupKey}"`);
    }
    for (const valueKey of Object.keys(objective.columnValues ?? {})) {
      // Template rows may be serialized by the stable internal column ID or by
      // the configured binding key used by the non-technical table designer.
      // Both are dynamic schema references; neither requires a predefined name.
      if (!columnIds.has(valueKey) && !columnBindingKeys.has(valueKey)) {
        errors.push(`${prefix} objective "${objective.objectiveKey}" has a value for missing column "${valueKey}"`);
      }
    }
  }

  for (const duplicate of duplicateValues((layout.termPolicies ?? []).map((policy) => policy.columnId))) {
    errors.push(`${prefix} has duplicate term policy for column "${duplicate}"`);
  }
  if (options.activationReady && (layout.termPolicies ?? []).length !== columns.length) {
    errors.push(`${prefix} requires exactly one term policy per column`);
  }
  for (const policy of layout.termPolicies ?? []) {
    if (!columnIds.has(policy.columnId)) errors.push(`${prefix} term policy references missing column "${policy.columnId}"`);
    if (!TERM_MODES.has(policy.mode)) errors.push(`${prefix} column "${policy.columnId}" has invalid term mode "${policy.mode}"`);
    if (policy.mode === 'SELECTED_PERIODS' && (!policy.selectedTerms || policy.selectedTerms.length === 0)) {
      errors.push(`${prefix} column "${policy.columnId}" must select at least one assessment term`);
    }
    if (columnById.get(policy.columnId)?.type === 'OBJECTIVE_EVIDENCE' &&
        policy.mode !== 'EVERY_REVIEW_PERIOD') {
      errors.push(`${prefix} evidence column "${policy.columnId}" must use EVERY_REVIEW_PERIOD`);
    }
  }

  const dependencies = new Map<string, string[]>();
  for (const duplicate of duplicateValues((layout.formulas ?? []).map((formula) => formula.formulaId))) {
    errors.push(`${prefix} has duplicate formulaId "${duplicate}"`);
  }
  for (const duplicate of duplicateValues((layout.formulas ?? []).map((formula) => formula.targetColumnId))) {
    errors.push(`${prefix} has more than one formula targeting column "${duplicate}"`);
  }
  for (const formula of layout.formulas ?? []) {
    if (!columnIds.has(formula.targetColumnId)) errors.push(`${prefix} formula "${formula.formulaId}" targets missing column "${formula.targetColumnId}"`);
    const target = columns.find((column) => column.columnId === formula.targetColumnId);
    if (target && target.type !== 'FORMULA') errors.push(`${prefix} formula "${formula.formulaId}" target must have FORMULA type`);
    if (!FORMULA_SCOPES.has(formula.scope)) errors.push(`${prefix} formula "${formula.formulaId}" has invalid scope "${formula.scope}"`);
    if (!['IGNORE', 'ZERO', 'ERROR'].includes(formula.emptyPolicy)) errors.push(`${prefix} formula "${formula.formulaId}" has invalid emptyPolicy`);
    if (!['NULL', 'ZERO', 'ERROR'].includes(formula.divideByZeroPolicy)) errors.push(`${prefix} formula "${formula.formulaId}" has invalid divideByZeroPolicy`);
    if (formula.decimalPrecision !== undefined &&
        (!Number.isInteger(formula.decimalPrecision) || formula.decimalPrecision < 0 || formula.decimalPrecision > 12)) {
      errors.push(`${prefix} formula "${formula.formulaId}" decimalPrecision must be between 0 and 12`);
    }
    const references = new Set<string>();
    collectFormulaReferences(formula.ast, `Formula "${formula.formulaId}"`, errors, references);
    const functions = collectFormulaFunctions(formula.ast);
    if ([...functions].some((name) => name.endsWith('_TERMS') || name === 'LATEST_FILLED_TERM') &&
        formula.scope !== 'ROW_ACROSS_TERMS') {
      errors.push(`${prefix} formula "${formula.formulaId}" uses a term function and must have ROW_ACROSS_TERMS scope`);
    }
    if ([...functions].some((name) => name.endsWith('_GROUP')) && formula.scope !== 'GROUP') {
      errors.push(`${prefix} formula "${formula.formulaId}" uses a group function and must have GROUP scope`);
    }
    if ([...functions].some((name) => name.endsWith('_TABLE')) && formula.scope !== 'TABLE') {
      errors.push(`${prefix} formula "${formula.formulaId}" uses a table function and must have TABLE scope`);
    }
    for (const reference of references) {
      if (!columnIds.has(reference)) errors.push(`${prefix} formula "${formula.formulaId}" references missing column "${reference}"`);
      if (reference === formula.targetColumnId) errors.push(`${prefix} formula "${formula.formulaId}" cannot reference itself`);
      const source = columnById.get(reference);
      if (source?.type === 'OBJECTIVE_EVIDENCE') {
        errors.push(`${prefix} formula "${formula.formulaId}" cannot reference evidence column "${reference}"`);
      }
      if (source && ![
        PmsTemplateFieldType.NUMERIC_INPUT,
        PmsTemplateFieldType.PERCENTAGE,
        PmsTemplateFieldType.CURRENCY,
        PmsTemplateFieldType.RATING_SCALE,
        PmsTemplateFieldType.FORMULA,
        'SYSTEM_DISPLAY',
      ].includes(source.type)) {
        errors.push(`${prefix} formula "${formula.formulaId}" references non-numeric column "${reference}"`);
      }
    }
    dependencies.set(
      formula.targetColumnId,
      [...references].filter((reference) =>
        (layout.formulas ?? []).some((candidate) => candidate.targetColumnId === reference),
      ),
    );
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (columnId: string): boolean => {
    if (visiting.has(columnId)) return true;
    if (visited.has(columnId)) return false;
    visiting.add(columnId);
    for (const dependency of dependencies.get(columnId) ?? []) {
      if (visit(dependency)) return true;
    }
    visiting.delete(columnId);
    visited.add(columnId);
    return false;
  };
  if ([...dependencies.keys()].some((columnId) => visit(columnId))) {
    errors.push(`${prefix} formulas contain a circular dependency`);
  }
  if (options.activationReady) {
    const formulaTargets = new Set((layout.formulas ?? []).map((formula) => formula.targetColumnId));
    for (const column of columns.filter((candidate) => candidate.type === PmsTemplateFieldType.FORMULA)) {
      if (!formulaTargets.has(column.columnId)) {
        errors.push(`${prefix} calculated column "${column.columnId}" requires a formula`);
      }
    }
  }

  for (const duplicate of duplicateValues((layout.calculatedRows ?? []).map((row) => row.calculatedRowId))) {
    errors.push(`${prefix} has duplicate calculatedRowId "${duplicate}"`);
  }
  for (const row of layout.calculatedRows ?? []) {
    if (!row.label?.trim()) errors.push(`${prefix} calculated row "${row.calculatedRowId}" requires label`);
    if (!formulaIds.has(row.formulaId)) errors.push(`${prefix} calculated row "${row.calculatedRowId}" references missing formula "${row.formulaId}"`);
    if (row.scope === 'GROUP' && (!row.rowGroupKey || !rowGroupKeys.has(row.rowGroupKey))) {
      errors.push(`${prefix} group calculated row "${row.calculatedRowId}" requires a valid rowGroupKey`);
    }
    const rowFormula = (layout.formulas ?? []).find((formula) => formula.formulaId === row.formulaId);
    if (rowFormula && rowFormula.scope !== row.scope) {
      errors.push(`${prefix} calculated row "${row.calculatedRowId}" scope must match formula "${row.formulaId}"`);
    }
  }

  return [...new Set(errors)];
}

export function objectiveTableLayoutAuditSummary(
  layout: ITemplateObjectiveTableLayout | undefined,
): Record<string, unknown> | undefined {
  if (!layout) return undefined;
  return {
    enabled: layout.enabled,
    layoutVersion: layout.layoutVersion,
    columnIds: layout.columns.map((column) => column.columnId),
    columnGroupIds: layout.columnGroups.map((group) => group.groupId),
    rowGroupKeys: layout.rowGroups.map((group) => group.rowGroupKey),
    formulaIds: layout.formulas.map((formula) => formula.formulaId),
    calculatedRowIds: layout.calculatedRows.map((row) => row.calculatedRowId),
    dynamicRowPolicy: layout.dynamicRowPolicy,
  };
}
