import { createHash } from 'crypto';
import { Types } from 'mongoose';
import {
  AssessmentTermCode,
  AssessmentTermType,
  getAssessmentTerms,
  normalizePmsRole,
  ObjectiveSource,
  ObjectiveStatus,
  PmsRole,
  PmsTemplateSectionType,
  TermWorkflowState,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { ObjectiveAttachment } from '../models/pms-objective-attachment.model';
import { ObjectiveEvidence } from '../models/pms-objective-evidence.model';
import { Objective } from '../models/pms-objective.model';
import { ObjectiveValue } from '../models/pms-objective-value.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import type {
  ITemplateObjectiveTableColumn,
  ITemplateObjectiveTableLayout,
} from '../models/pms-template-version.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import type { RequestContext } from '../types/context';
import type {
  AnnualObjectiveMatrixResponse,
  ObjectiveMatrixCell,
  ObjectiveMatrixCellPermission,
  ObjectiveMatrixMode,
  ObjectiveMatrixReadQuery,
  ObjectiveMatrixRow,
  ObjectiveTermEvidenceSummary,
} from '../types/pms-objective-matrix';
import { resolveEffectiveTermWindows } from '../utilis/pmsAssignmentWindows';
import { accessService } from './access.service';
import { DelegationService } from './delegation.service';
import {
  evaluateObjectiveMatrixFormulas,
  type ObjectiveMatrixFormulaResult,
  type ObjectiveMatrixFormulaSourceCell,
} from './objective-matrix-formula.service';

type MatrixActor = { actorId: string; actorRole: string };
type LeanRecord = Record<string, any>;
type ObjectiveMatrixAccessContext = { allowHrWorkspaceRead?: boolean };

export function isObjectiveMatrixStageWindowOpen(input: {
  stage: ITemplateObjectiveTableColumn['workflowStage'];
  assignment: LeanRecord;
  termCycle?: LeanRecord;
  annualAssignment: LeanRecord;
  now: Date;
}): boolean {
  const windows = resolveEffectiveTermWindows(
    input.assignment,
    input.termCycle,
    input.annualAssignment,
  );

  // Employee Achievement is continuous in the current PMS flow. Employees can
  // update the applicable term result from that term's Objective Setting start
  // until Manager Review starts. It no longer depends on the legacy, transient
  // EMPLOYEE_ACHIEVEMENT_OPEN workflow state.
  if (input.stage === 'EMPLOYEE_ACHIEVEMENT') {
    if ([
      TermWorkflowState.MANAGER_REVIEW_OPEN,
      TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
      TermWorkflowState.TERM_FINALIZED,
      TermWorkflowState.CLOSED_BY_ADMIN,
    ].includes(input.assignment.termState)) return false;

    const continuousStart = windows.objectiveSettingWindow?.startDate;
    if (continuousStart) {
      const start = new Date(continuousStart);
      start.setHours(0, 0, 0, 0);
      if (input.now < start) return false;
    }

    const managerReviewStart = windows.managerReviewWindow?.startDate;
    if (managerReviewStart) {
      const cutoff = new Date(managerReviewStart);
      cutoff.setHours(0, 0, 0, 0);
      if (input.now >= cutoff) return false;
    }

    return true;
  }

  const allowedStates: Record<string, string[]> = {
    OBJECTIVE_SETTING: [
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      TermWorkflowState.OBJECTIVE_DRAFT,
      TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
      TermWorkflowState.REOPENED_BY_ADMIN,
    ],
    MANAGER_REVIEW: [TermWorkflowState.MANAGER_REVIEW_OPEN, TermWorkflowState.REOPENED_BY_ADMIN],
    ANNUAL_DECISION: [],
    CALCULATED: [],
  };
  if (!(allowedStates[input.stage] ?? []).includes(input.assignment.termState)) return false;
  const window = input.stage === 'OBJECTIVE_SETTING'
    ? windows.objectiveSettingWindow
    : input.stage === 'MANAGER_REVIEW'
        ? windows.managerReviewWindow
        : undefined;
  if (!window?.startDate && !window?.endDate) return true;
  if (window.startDate && input.now < new Date(window.startDate)) return false;
  if (window.endDate) {
    const end = new Date(window.endDate);
    end.setHours(23, 59, 59, 999);
    if (input.now > end) return false;
  }
  return true;
}

export function isObjectiveMatrixDateWindowOpen(
  window: { startDate?: Date; endDate?: Date } | undefined,
  now: Date,
): boolean {
  if (!window?.startDate && !window?.endDate) return true;
  if (window.startDate) {
    const start = new Date(window.startDate);
    start.setHours(0, 0, 0, 0);
    if (now < start) return false;
  }
  if (window.endDate) {
    const end = new Date(window.endDate);
    end.setHours(23, 59, 59, 999);
    if (now > end) return false;
  }
  return true;
}

export interface ObjectiveMatrixCellPermissionInput {
  role: string;
  workflowState: string;
  termPosition: 'PAST' | 'CURRENT' | 'FUTURE';
  windowOpen: boolean;
  columnFillOwner: ITemplateObjectiveTableColumn['fillOwner'];
  columnRequired: boolean;
  columnType: ITemplateObjectiveTableColumn['type'];
  explicitVisibility: 'VISIBLE' | 'HIDDEN';
  explicitEditable: boolean;
  rowSource: string;
}

export function resolveObjectiveTermEvidencePermission(input: {
  role: string;
  workflowState: string;
  termPosition: 'PAST' | 'CURRENT' | 'FUTURE';
  windowOpen: boolean;
  explicitEditable: boolean;
}): Pick<ObjectiveTermEvidenceSummary, 'editable' | 'denialReason'> {
  if ([TermWorkflowState.TERM_FINALIZED, TermWorkflowState.CLOSED_BY_ADMIN]
    .includes(input.workflowState as any)) {
    return { editable: false, denialReason: 'TERM_FINALIZED' };
  }
  if (input.termPosition !== 'CURRENT' || input.workflowState === TermWorkflowState.NOT_STARTED) {
    return { editable: false, denialReason: 'TERM_NOT_OPEN' };
  }
  if (!input.windowOpen) {
    return { editable: false, denialReason: 'WINDOW_CLOSED' };
  }
  if (input.role !== PmsRole.EMPLOYEE) {
    return { editable: false, denialReason: 'ROLE_READ_ONLY' };
  }
  if (!input.explicitEditable) {
    return { editable: false, denialReason: 'COLUMN_READ_ONLY' };
  }
  return { editable: true };
}

export function validateObjectiveMatrixRowForSubmit(
  matrix: AnnualObjectiveMatrixResponse,
  input: {
    objectiveId: string;
    objectiveRowKey?: string;
    termCode: AssessmentTermCodeType;
  },
): void {
  const row = matrix.rows.find((candidate) =>
    candidate.objectiveRowKey === input.objectiveRowKey ||
    candidate.siblings.some((sibling) => sibling.objectiveId === input.objectiveId),
  );
  if (!row) throw new Error('Objective row is not available in the assigned template table');
  if (!row.siblings.some((sibling) =>
    sibling.objectiveId === input.objectiveId && sibling.termCode === input.termCode,
  )) {
    throw new Error('Objective does not belong to the selected review period');
  }

  const objectiveSettingColumnIds = new Set(
    matrix.columns
      .filter((column) => column.workflowStage === 'OBJECTIVE_SETTING')
      .map((column) => column.columnId),
  );
  const applicableCells = [
    ...row.sharedCells,
    ...(row.termCells[input.termCode] ?? []),
  ].filter((cell) => objectiveSettingColumnIds.has(cell.columnId));
  const missing = applicableCells.filter((cell) =>
    cell.required === true &&
    (cell.value === undefined || cell.value === null || String(cell.value).trim() === ''),
  );
  if (missing.length > 0) {
    const labelByColumnId = new Map(matrix.columns.map((column) => [column.columnId, column.label]));
    const labels = [...new Set(missing.map((cell) => labelByColumnId.get(cell.columnId) ?? cell.columnId))];
    throw new Error(`Complete required fields before submitting: ${labels.join(', ')}`);
  }
}

function creatorRole(source: string): string {
  if (source === ObjectiveSource.EMPLOYEE_CREATED) return PmsRole.EMPLOYEE;
  if (source === ObjectiveSource.MANAGER_CREATED) return PmsRole.MANAGER;
  return 'SYSTEM';
}

export function resolveObjectiveMatrixCellPermission(
  input: ObjectiveMatrixCellPermissionInput,
): ObjectiveMatrixCellPermission {
  if (input.explicitVisibility === 'HIDDEN') {
    return { visible: false, editable: false, required: false, denialReason: 'COLUMN_HIDDEN' };
  }
  if (input.columnType === 'OBJECTIVE_EVIDENCE') {
    // Evidence uses its dedicated upload/replace lifecycle, never generic
    // objective_values matrix-cell persistence.
    return { visible: true, editable: false, required: false, denialReason: 'COLUMN_READ_ONLY' };
  }
  if (input.columnType === 'FORMULA' || input.columnType === 'SYSTEM_DISPLAY' || input.columnFillOwner === 'SYSTEM') {
    return { visible: true, editable: false, required: false, denialReason: 'SYSTEM_CALCULATED' };
  }
  if ([TermWorkflowState.TERM_FINALIZED, TermWorkflowState.CLOSED_BY_ADMIN].includes(input.workflowState as any)) {
    return { visible: true, editable: false, required: false, denialReason: 'TERM_FINALIZED' };
  }
  // Date-window simulation (and the daily workflow synchronizer's boundary)
  // can put a current term inside an open stage before its persisted state has
  // advanced. An explicitly open window is authoritative for the current term;
  // future terms must always remain locked.
  if (input.termPosition === 'FUTURE' ||
      (input.workflowState === TermWorkflowState.NOT_STARTED && !input.windowOpen)) {
    return { visible: true, editable: false, required: false, denialReason: 'TERM_NOT_OPEN' };
  }
  if (!input.windowOpen) {
    return { visible: true, editable: false, required: false, denialReason: 'WINDOW_CLOSED' };
  }
  if (input.role === PmsRole.DIRECTOR || input.role === PmsRole.MANAGEMENT) {
    return { visible: true, editable: false, required: false, denialReason: 'ROLE_READ_ONLY' };
  }
  const ownerRole = input.columnFillOwner === 'ROW_CREATOR'
    ? creatorRole(input.rowSource)
    : input.columnFillOwner;
  if (input.role === PmsRole.ADMIN && ownerRole !== PmsRole.ADMIN) {
    return { visible: true, editable: false, required: false, denialReason: 'CORRECTION_FLOW_REQUIRED' };
  }
  if (ownerRole !== input.role) {
    return { visible: true, editable: false, required: false, denialReason: 'COLUMN_OWNER_MISMATCH' };
  }
  if (!input.explicitEditable) {
    return { visible: true, editable: false, required: false, denialReason: 'COLUMN_READ_ONLY' };
  }
  return {
    visible: true,
    editable: true,
    required: input.columnRequired,
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function objectiveCoreValue(objective: LeanRecord, fieldKey: string): unknown {
  const values: Record<string, unknown> = {
    'objective.title': objective.title,
    'objective.description': objective.description,
    'objective.kpi': objective.targetMetric,
    'objective.targetValue': objective.targetValue,
    'objective.targetDate': objective.targetDate
      ? new Date(objective.targetDate).toISOString().slice(0, 10)
      : undefined,
    'objective.weightage': objective.weightage,
    'objective.successCriteria': objective.successCriteria,
    'objective.status': objective.status,
    'objective.source': objective.source,
  };
  return values[fieldKey];
}

export function isGlobalDirectorObjectiveRead(role: string | undefined): boolean {
  return normalizePmsRole(role ?? '') === PmsRole.DIRECTOR;
}

function typedStoredValue(value?: LeanRecord): unknown {
  if (!value) return undefined;
  if (value.valueNumber !== undefined) return value.valueNumber;
  if (value.valueDate !== undefined) return new Date(value.valueDate).toISOString();
  if (value.valueText !== undefined) return value.valueText;
  return value.valueJson;
}

export class ObjectiveMatrixService {
  constructor(private readonly context: RequestContext) {}

  async getAnnualMatrix(
    annualAssignmentId: string,
    query: ObjectiveMatrixReadQuery = {},
    accessContext: ObjectiveMatrixAccessContext = {},
  ): Promise<AnnualObjectiveMatrixResponse> {
    if (!Types.ObjectId.isValid(annualAssignmentId)) throw new Error('Invalid annualAssignmentId');
    const actor = this.requireActor();
    const annualAssignment = await AnnualAssignment.findOne({
      _id: new Types.ObjectId(annualAssignmentId),
      isDeleted: false,
    }).lean();
    if (!annualAssignment) throw new Error('Annual assignment not found');
    await this.assertAccess(actor, annualAssignment, query.mode, accessContext);

    const isAssignedFinalReviewer =
      annualAssignment.finalReviewerId?.toString() === actor.actorId ||
      annualAssignment.directorReviewerId?.toString() === actor.actorId;
    const isAssignmentEmployee = annualAssignment.employeeId.toString() === actor.actorId;
    const isAssignmentManager = annualAssignment.assignedManagerId.toString() === actor.actorId;
    const { mode, viewRole, permissionRole } = this.resolveView(
      actor,
      query.mode,
      isAssignedFinalReviewer,
      isAssignmentEmployee,
      isAssignmentManager,
    );
    const includeAudit = query.includeAudit === true || query.includeAudit === 'true';
    if (includeAudit && normalizePmsRole(actor.actorRole) !== PmsRole.ADMIN) {
      throw new Error('Matrix audit details require Admin access');
    }
    if (query.employeeId && query.employeeId !== annualAssignment.employeeId.toString()) {
      throw new Error('employeeId does not match the annual assignment');
    }
    if (!annualAssignment.templateVersionId) throw new Error('Annual assignment has no template version');

    const [templateVersion, termAssignments] = await Promise.all([
      PmsTemplateVersion.findById(annualAssignment.templateVersionId).lean(),
      TermAssignment.find({ annualAssignmentId: annualAssignment._id, isDeleted: false }).lean(),
    ]);
    if (!templateVersion) throw new Error('Assigned template version not found');
    const objectiveSection = (templateVersion.sections ?? []).find(
      (section) => section.sectionType === PmsTemplateSectionType.OBJECTIVES &&
        section.objectiveConfig?.tableLayout?.enabled === true,
    );
    const layout = objectiveSection?.objectiveConfig?.tableLayout;
    if (!layout) throw new Error('Objective table layout is not enabled for this assignment');

    const assessmentTermType = this.assessmentTermType(termAssignments, annualAssignment.applicableTerms);
    const configuredOrder = getAssessmentTerms(assessmentTermType);
    const assignmentByTerm = new Map(termAssignments.map((term) => [term.assessmentTermCode, term]));
    const termOrder = configuredOrder.filter((term) => assignmentByTerm.has(term));
    const sortedAssignments = termOrder.map((term) => assignmentByTerm.get(term)!);
    const selectedTermAssignment = query.termAssignmentId
      ? sortedAssignments.find((term) => term._id.toString() === query.termAssignmentId)
      : query.currentTermCode
        ? assignmentByTerm.get(query.currentTermCode)
        : undefined;
    if ((query.termAssignmentId || query.currentTermCode) && !selectedTermAssignment) {
      throw new Error('Selected term does not belong to the annual assignment');
    }
    const currentTermCode = selectedTermAssignment?.assessmentTermCode ?? this.currentTerm(sortedAssignments);
    const termCycles = await TermCycle.find({
      _id: { $in: sortedAssignments.map((term) => term.cycleTermId).filter(Boolean) },
      isDeleted: false,
    }).lean();
    const termCycleById = new Map(termCycles.map((term) => [term._id.toString(), term]));

    const objectives = await Objective.find({
      annualAssignmentId: annualAssignment._id,
      termAssignmentId: { $in: sortedAssignments.map((term) => term._id) },
      isDeleted: false,
    }).sort({ rowOrder: 1, objectiveNo: 1, createdAt: 1 }).lean();
    const visibleObjectives = objectives.filter((objective) =>
      !(
        viewRole !== PmsRole.EMPLOYEE &&
        objective.source === ObjectiveSource.EMPLOYEE_CREATED &&
        objective.status === ObjectiveStatus.OBJECTIVE_DRAFT
      ),
    );
    const objectiveValues = await ObjectiveValue.find({
      objectiveId: { $in: visibleObjectives.map((objective) => objective._id) },
      isDeleted: false,
    }).sort({ updatedAt: 1, createdAt: 1 }).lean();
    const valuesByObjective = new Map<string, LeanRecord[]>();
    for (const value of objectiveValues) {
      const key = value.objectiveId.toString();
      valuesByObjective.set(key, [...(valuesByObjective.get(key) ?? []), value]);
    }

    const visibleColumns = layout.columns
      .filter((column) => this.columnAccess(column, viewRole).visible)
      .map((column) => ({
        ...column,
        access: column.access
          ?.filter((entry) => entry.role === viewRole)
          .map((entry) => permissionRole === PmsRole.DIRECTOR
            ? { ...entry, editable: false, required: false }
            : entry),
      }))
      .sort((left, right) => left.displayOrder - right.displayOrder);
    const visibleColumnIds = new Set(visibleColumns.map((column) => column.columnId));
    const columnGroups = layout.columnGroups
      .map((group) => ({ ...group, columnIds: group.columnIds.filter((id) => visibleColumnIds.has(id)) }))
      .filter((group) => group.columnIds.length > 0)
      .sort((left, right) => left.displayOrder - right.displayOrder);
    const termPolicies = layout.termPolicies.filter((policy) => visibleColumnIds.has(policy.columnId));
    const evidenceColumn = visibleColumns.find((column) => column.type === 'OBJECTIVE_EVIDENCE');
    const evidenceRecords = evidenceColumn && visibleObjectives.length > 0
      ? await ObjectiveEvidence.find({
          objectiveId: { $in: visibleObjectives.map((objective) => objective._id) },
          evidenceType: 'TERM_SUPPORTING_DOCUMENT',
          isDeleted: false,
        }).lean()
      : [];
    const evidenceByObjective = new Map<string, LeanRecord>();
    for (const evidence of evidenceRecords) {
      evidenceByObjective.set(evidence.objectiveId.toString(), evidence);
    }
    const activeAttachmentIds = evidenceRecords.flatMap((evidence) => evidence.attachmentIds ?? []);
    const attachments = activeAttachmentIds.length > 0
      ? await ObjectiveAttachment.find({
          _id: { $in: activeAttachmentIds },
          objectiveId: { $in: visibleObjectives.map((objective) => objective._id) },
          isDeleted: false,
        }).lean()
      : [];
    const attachmentById = new Map(
      attachments.map((attachment) => [attachment._id.toString(), attachment]),
    );

    const grouped = new Map<string, LeanRecord[]>();
    for (const objective of visibleObjectives) {
      const key = objective.objectiveRowKey || `legacy:${objective._id.toString()}`;
      grouped.set(key, [...(grouped.get(key) ?? []), objective]);
    }
    const formulaSourceCells: ObjectiveMatrixFormulaSourceCell[] = [];
    const rows = [...grouped.entries()].map(([rowKey, siblings]) => this.buildRow({
      rowKey,
      siblings,
      layout,
      allColumns: layout.columns,
      visibleColumnIds,
      valuesByObjective,
      evidenceColumn,
      evidenceByObjective,
      attachmentById,
      assignmentByTerm,
      termCycleById,
      annualAssignment,
      termOrder,
      currentTermCode,
      viewRole,
      permissionRole,
      includeAudit,
      formulaSourceCells,
    }));

    const formulaEvaluation = evaluateObjectiveMatrixFormulas({
      layout,
      cells: formulaSourceCells,
      termOrder,
    });
    this.attachFormulaCells(rows, formulaEvaluation.results, layout, visibleColumnIds);
    // Row groups are an optional presentation choice. Layouts keep their source
    // groups for row identity and future configuration, but the employee table
    // must not expose them unless the admin explicitly enabled row grouping.
    const showRowGroups = objectiveSection?.metadata?.objectiveTableShowRowGroups === true;
    const rowGroupKeys = new Set(rows.map((row) => row.rowGroupKey).filter(Boolean));
    const rowGroups = showRowGroups
      ? layout.rowGroups
        .filter((group) => rowGroupKeys.has(group.rowGroupKey))
        .sort((left, right) => left.displayOrder - right.displayOrder)
      : [];
    rows.sort((left, right) => {
      const leftGroup = rowGroups.find((group) => group.rowGroupKey === left.rowGroupKey)?.displayOrder ?? 9999;
      const rightGroup = rowGroups.find((group) => group.rowGroupKey === right.rowGroupKey)?.displayOrder ?? 9999;
      return leftGroup - rightGroup || left.rowOrder - right.rowOrder || left.objectiveRowKey.localeCompare(right.objectiveRowKey);
    });
    const visibleFormulaIds = new Set(
      layout.formulas.filter((formula) => visibleColumnIds.has(formula.targetColumnId)).map((formula) => formula.formulaId),
    );
    const formulaResults = formulaEvaluation.results.filter((result) => visibleFormulaIds.has(result.formulaId));
    const calculatedRows = formulaEvaluation.calculatedRows.filter((row) => visibleFormulaIds.has(row.formulaId));
    const generatedAt = new Date().toISOString();
    const hashPayload = {
      annualAssignmentId,
      templateVersionId: templateVersion._id.toString(),
      layoutVersion: layout.layoutVersion,
      mode,
      viewRole,
      termOrder,
      columns: visibleColumns,
      columnGroups,
      termPolicies,
      rowGroupColumnLabel: layout.rowGroupColumnLabel,
      dynamicRowPolicy: layout.dynamicRowPolicy,
      showRowGroups,
      rowGroups,
      rows: JSON.parse(JSON.stringify(rows, (key, value) => key === 'audit' ? undefined : value)),
      formulaResults,
      calculatedRows,
    };
    return {
      annualAssignmentId,
      cycleId: annualAssignment.cycleId.toString(),
      employeeId: annualAssignment.employeeId.toString(),
      managerId: annualAssignment.assignedManagerId.toString(),
      templateVersionId: templateVersion._id.toString(),
      layoutVersion: layout.layoutVersion,
      mode,
      viewRole,
      assessmentTermType,
      termOrder,
      currentTermCode,
      columns: visibleColumns,
      columnGroups,
      termPolicies,
      rowGroupColumnLabel: layout.rowGroupColumnLabel,
      dynamicRowPolicy: layout.dynamicRowPolicy,
      showRowGroups,
      rowGroups,
      rows,
      formulaResults,
      calculatedRows,
      evaluationOrder: formulaEvaluation.evaluationOrder,
      generatedAt,
      contentVersion: Math.max(
        annualAssignment.version ?? 1,
        ...termAssignments.map((term) => term.version ?? 1),
        ...visibleObjectives.map((objective) => objective.version ?? 1),
        ...objectiveValues.map((value) => value.version ?? 1),
        ...evidenceRecords.map((evidence) => evidence.version ?? 1),
        ...attachments.map((attachment) => attachment.version ?? 1),
      ),
      contentHash: createHash('sha256').update(canonicalJson(hashPayload)).digest('hex'),
    };
  }

  private buildRow(input: {
    rowKey: string;
    siblings: LeanRecord[];
    layout: ITemplateObjectiveTableLayout;
    allColumns: ITemplateObjectiveTableColumn[];
    visibleColumnIds: Set<string>;
    valuesByObjective: Map<string, LeanRecord[]>;
    evidenceColumn?: ITemplateObjectiveTableColumn;
    evidenceByObjective: Map<string, LeanRecord>;
    attachmentById: Map<string, LeanRecord>;
    assignmentByTerm: Map<AssessmentTermCodeType, LeanRecord>;
    termCycleById: Map<string, LeanRecord>;
    annualAssignment: LeanRecord;
    termOrder: AssessmentTermCodeType[];
    currentTermCode?: AssessmentTermCodeType;
    viewRole: string;
    permissionRole: string;
    includeAudit: boolean;
    formulaSourceCells: ObjectiveMatrixFormulaSourceCell[];
  }): ObjectiveMatrixRow {
    const siblingByTerm = new Map(input.siblings.map((sibling) => [sibling.assessmentTermCode, sibling]));
    const first = input.siblings[0];
    const coverage = input.termOrder.filter((term) => siblingByTerm.has(term));
    const origin = first.rowOriginTermCode && siblingByTerm.get(first.rowOriginTermCode)
      ? first.rowOriginTermCode
      : coverage[0];
    const sharedCells: ObjectiveMatrixCell[] = [];
    const termCells: Partial<Record<AssessmentTermCodeType, ObjectiveMatrixCell[]>> = {};
    for (const column of input.allColumns) {
      if (column.type === 'FORMULA') continue;
      const policy = input.layout.termPolicies.find((item) => item.columnId === column.columnId);
      const sharedOwnerTerm = column.workflowStage === 'OBJECTIVE_SETTING'
        ? origin
        : input.currentTermCode && siblingByTerm.has(input.currentTermCode)
          ? input.currentTermCode
          : origin;
      const terms: AssessmentTermCodeType[] = policy?.mode === 'SHARED_ANNUAL'
        ? sharedOwnerTerm ? [sharedOwnerTerm] : []
        : policy?.mode === 'CURRENT_PERIOD'
          ? input.currentTermCode ? [input.currentTermCode] : []
          : policy?.mode === 'SELECTED_PERIODS'
            ? input.termOrder.filter((term) => policy.selectedTerms?.includes(term))
            : coverage;
      for (const termCode of terms) {
        const objective = siblingByTerm.get(termCode);
        if (!objective) continue;
        const cell = this.buildCell({ ...input, objective, column, termCode });
        input.formulaSourceCells.push({
          rowKey: input.rowKey,
          rowGroupKey: first.rowGroupKey,
          termCode: policy?.mode === 'SHARED_ANNUAL' ? undefined : termCode,
          columnId: column.columnId,
          value: cell.value,
          version: cell.valueVersion ?? cell.recordVersion,
        });
        if (!input.visibleColumnIds.has(column.columnId)) continue;
        if (policy?.mode === 'SHARED_ANNUAL') sharedCells.push({ ...cell, termCode: undefined });
        else termCells[termCode] = [...(termCells[termCode] ?? []), cell];
      }
    }
    const role = input.permissionRole;
    const evidenceByTerm: Partial<Record<AssessmentTermCodeType, ObjectiveTermEvidenceSummary>> = {};
    if (input.evidenceColumn) {
      const evidenceAccess = this.columnAccess(input.evidenceColumn, input.viewRole);
      const evidenceConfig = input.evidenceColumn.evidenceConfig;
      for (const termCode of coverage) {
        const sibling = siblingByTerm.get(termCode)!;
        const assignment = input.assignmentByTerm.get(termCode)!;
        const cycle = assignment.cycleTermId
          ? input.termCycleById.get(assignment.cycleTermId.toString())
          : undefined;
        const permission = resolveObjectiveTermEvidencePermission({
          role,
          workflowState: assignment.termState,
          termPosition: this.termPosition(termCode, input.currentTermCode, input.termOrder),
          windowOpen: this.stageWindowOpen(
            'EMPLOYEE_ACHIEVEMENT',
            assignment,
            cycle,
            input.annualAssignment,
          ),
          explicitEditable: evidenceAccess.editable,
        });
        const evidence = input.evidenceByObjective.get(sibling._id.toString());
        const attachmentId = evidence?.attachmentIds?.[0]?.toString();
        const attachmentCandidate = attachmentId
          ? input.attachmentById.get(attachmentId)
          : undefined;
        const attachment = attachmentCandidate?.objectiveId?.toString() === sibling._id.toString()
          ? attachmentCandidate
          : undefined;
        evidenceByTerm[termCode] = {
          ...(evidence ? { evidenceId: evidence._id.toString() } : {}),
          objectiveId: sibling._id.toString(),
          termAssignmentId: sibling.termAssignmentId.toString(),
          termCode,
          version: evidence?.version ?? 0,
          ...permission,
          ...(attachment ? {
            attachment: {
              id: attachment._id.toString(),
              documentId: attachment.documentId ?? '',
              fileName: attachment.fileName ?? '',
              ...(attachment.fileType ? { fileType: attachment.fileType } : {}),
              ...(attachment.fileSize !== undefined ? { fileSize: attachment.fileSize } : {}),
              uploadedAt: new Date(
                attachment.uploadedAt ?? attachment.createdAt,
              ).toISOString(),
              previewAvailable: evidenceConfig?.allowPreview === true,
              downloadAvailable: evidenceConfig?.allowDownload === true,
            },
          } : {}),
        };
      }
    }
    const ownDraft = role === PmsRole.EMPLOYEE && first.source === ObjectiveSource.EMPLOYEE_CREATED &&
      input.siblings.some((sibling) => sibling.status === ObjectiveStatus.OBJECTIVE_DRAFT);
    const ownRevision = role === PmsRole.EMPLOYEE && first.source === ObjectiveSource.EMPLOYEE_CREATED &&
      input.siblings.some((sibling) => sibling.status === ObjectiveStatus.OBJECTIVE_REVISION_REQUIRED);
    const managerSubmitted = role === PmsRole.MANAGER &&
      input.siblings.some((sibling) =>
        sibling.status === ObjectiveStatus.OBJECTIVE_SUBMITTED &&
        sibling.assessmentTermCode === input.currentTermCode,
      );
    const currentAssignment = input.currentTermCode
      ? input.assignmentByTerm.get(input.currentTermCode)
      : undefined;
    const currentCycle = currentAssignment?.cycleTermId
      ? input.termCycleById.get(currentAssignment.cycleTermId.toString())
      : undefined;
    const approvalWindowOpen = currentAssignment
      ? isObjectiveMatrixDateWindowOpen(
          resolveEffectiveTermWindows(
            currentAssignment,
            currentCycle,
            input.annualAssignment,
          ).objectiveApprovalWindow,
          this.context.pmsCurrentDate ?? new Date(),
        )
      : false;
    const titleColumn = input.allColumns.find((column) =>
      column.bindingKey === 'objective.title' && column.workflowStage === 'OBJECTIVE_SETTING',
    );
    const actionAssignment = currentAssignment ?? (origin ? input.assignmentByTerm.get(origin) : undefined);
    const actionCycle = actionAssignment?.cycleTermId
      ? input.termCycleById.get(actionAssignment.cycleTermId.toString())
      : undefined;
    const titleAccess = titleColumn ? this.columnAccess(titleColumn, input.viewRole) : undefined;
    const objectiveSettingEditable = Boolean(titleColumn && actionAssignment &&
      resolveObjectiveMatrixCellPermission({
        role,
        workflowState: actionAssignment.termState,
        termPosition: 'CURRENT',
        windowOpen: this.stageWindowOpen(
          titleColumn.workflowStage,
          actionAssignment,
          actionCycle,
          input.annualAssignment,
        ),
        columnFillOwner: titleColumn.fillOwner,
        columnRequired: titleAccess?.required === true || titleColumn.required === true,
        columnType: titleColumn.type,
        explicitVisibility: titleAccess?.visible === false ? 'HIDDEN' : 'VISIBLE',
        explicitEditable: titleAccess?.editable === true,
        rowSource: first.source,
      }).editable);
    return {
      objectiveRowKey: input.rowKey,
      source: first.source,
      matrixCode: first.matrixCode,
      matrixLabel: first.matrixLabel,
      title: first.title ?? '',
      rowOriginTermCode: origin,
      rowCoverage: coverage,
      rowGroupKey: first.rowGroupKey,
      rowOrder: first.rowOrder ?? first.objectiveNo ?? 0,
      siblings: coverage.map((termCode) => {
        const sibling = siblingByTerm.get(termCode)!;
        return {
          termCode,
          termAssignmentId: sibling.termAssignmentId.toString(),
          objectiveId: sibling._id.toString(),
          status: sibling.status,
          version: sibling.version ?? 1,
        };
      }),
      sharedCells,
      termCells,
      evidenceByTerm,
      actions: {
        canEdit: (ownDraft || ownRevision) && objectiveSettingEditable,
        canDelete: ownDraft && objectiveSettingEditable,
        canSubmit: (ownDraft || ownRevision) && objectiveSettingEditable,
        canApprove: managerSubmitted && approvalWindowOpen,
        canReturn: managerSubmitted && approvalWindowOpen,
        canComment: [PmsRole.EMPLOYEE, PmsRole.MANAGER, PmsRole.ADMIN].includes(role as any),
        canAttach: (ownDraft || ownRevision) && objectiveSettingEditable,
      },
    };
  }

  private buildCell(input: {
    rowKey: string;
    objective: LeanRecord;
    column: ITemplateObjectiveTableColumn;
    termCode: AssessmentTermCodeType;
    valuesByObjective: Map<string, LeanRecord[]>;
    assignmentByTerm: Map<AssessmentTermCodeType, LeanRecord>;
    termCycleById: Map<string, LeanRecord>;
    annualAssignment: LeanRecord;
    termOrder: AssessmentTermCodeType[];
    currentTermCode?: AssessmentTermCodeType;
    viewRole: string;
    permissionRole: string;
    includeAudit: boolean;
  }): ObjectiveMatrixCell {
    const objectiveValues = input.valuesByObjective.get(input.objective._id.toString()) ?? [];
    const storedValue = [...objectiveValues].reverse().find((value) =>
      value.fieldKey === input.column.bindingKey || value.templateFieldId === input.column.columnId,
    );
    const value = input.column.bindingKey.startsWith('objective.')
      ? objectiveCoreValue(input.objective, input.column.bindingKey)
      : typedStoredValue(storedValue);
    const assignment = input.assignmentByTerm.get(input.termCode)!;
    const position = this.termPosition(input.termCode, input.currentTermCode, input.termOrder);
    const cycle = assignment.cycleTermId
      ? input.termCycleById.get(assignment.cycleTermId.toString())
      : undefined;
    const windowOpen = this.stageWindowOpen(
      input.column.workflowStage,
      assignment,
      cycle,
      input.annualAssignment,
    );
    const access = this.columnAccess(input.column, input.viewRole);
    const resolvedPermission = resolveObjectiveMatrixCellPermission({
      role: input.permissionRole,
      workflowState: assignment.termState,
      termPosition: position,
      windowOpen,
      columnFillOwner: input.column.fillOwner,
      columnRequired: access.required || input.column.required === true,
      columnType: input.column.type,
      explicitVisibility: access.visible ? 'VISIBLE' : 'HIDDEN',
      explicitEditable: access.editable,
      rowSource: input.objective.source,
    });
    const lockApprovedEmployeeObjectiveSetting =
      input.viewRole === PmsRole.EMPLOYEE &&
      input.objective.source === ObjectiveSource.EMPLOYEE_CREATED &&
      input.column.workflowStage === 'OBJECTIVE_SETTING' &&
      input.objective.status !== ObjectiveStatus.OBJECTIVE_DRAFT &&
      input.objective.status !== ObjectiveStatus.OBJECTIVE_REVISION_REQUIRED;
    const permission: ObjectiveMatrixCellPermission = lockApprovedEmployeeObjectiveSetting
      ? {
          ...resolvedPermission,
          editable: false,
          required: false,
          denialReason: 'COLUMN_READ_ONLY',
        }
      : resolvedPermission;
    return {
      cellKey: `${input.rowKey}:${input.termCode}:${input.column.columnId}`,
      columnId: input.column.columnId,
      fieldKey: input.column.bindingKey,
      kind: 'SOURCE',
      termCode: input.termCode,
      objectiveId: input.objective._id.toString(),
      termAssignmentId: input.objective.termAssignmentId.toString(),
      value,
      recordVersion: input.objective.version ?? 1,
      valueVersion: storedValue?.version,
      ...permission,
      ...(input.includeAudit && storedValue ? {
        audit: {
          actorUserId: storedValue.actorUserId?.toString(),
          roleCode: storedValue.roleCode,
          workflowStage: storedValue.workflowStage,
          updatedAt: storedValue.updatedAt ? new Date(storedValue.updatedAt).toISOString() : undefined,
        },
      } : {}),
    };
  }

  private attachFormulaCells(
    rows: ObjectiveMatrixRow[],
    results: ObjectiveMatrixFormulaResult[],
    layout: ITemplateObjectiveTableLayout,
    visibleColumnIds: Set<string>,
  ): void {
    const columnById = new Map(layout.columns.map((column) => [column.columnId, column]));
    for (const result of results) {
      if (!result.rowKey || !visibleColumnIds.has(result.targetColumnId)) continue;
      const row = rows.find((candidate) => candidate.objectiveRowKey === result.rowKey);
      const column = columnById.get(result.targetColumnId);
      const sibling = row?.siblings.find((item) => item.termCode === row.rowOriginTermCode) ?? row?.siblings[0];
      if (!row || !column || !sibling) continue;
      row.sharedCells.push({
        cellKey: `${row.objectiveRowKey}:FORMULA:${column.columnId}`,
        columnId: column.columnId,
        fieldKey: column.bindingKey,
        kind: 'FORMULA',
        objectiveId: sibling.objectiveId,
        termAssignmentId: sibling.termAssignmentId,
        value: result.value,
        recordVersion: sibling.version,
        visible: true,
        editable: false,
        required: false,
        denialReason: 'SYSTEM_CALCULATED',
        sourceCellKeys: result.sourceCellKeys,
        sourceVersions: result.sourceVersions,
      });
    }
  }

  private columnAccess(column: ITemplateObjectiveTableColumn, role: string) {
    const configured = column.access ?? [];
    const access = configured.find((item) => item.role === role);
    if (access) return {
      visible: access.visible !== false,
      editable: access.editable === true,
      required: access.required === true,
    };
    return { visible: configured.length === 0, editable: false, required: false };
  }

  private stageWindowOpen(
    stage: ITemplateObjectiveTableColumn['workflowStage'],
    assignment: LeanRecord,
    termCycle: LeanRecord | undefined,
    annualAssignment: LeanRecord,
  ): boolean {
    return isObjectiveMatrixStageWindowOpen({
      stage,
      assignment,
      termCycle,
      annualAssignment,
      now: this.context.pmsCurrentDate ?? new Date(),
    });
  }

  private termPosition(
    term: AssessmentTermCodeType,
    current: AssessmentTermCodeType | undefined,
    order: AssessmentTermCodeType[],
  ): 'PAST' | 'CURRENT' | 'FUTURE' {
    if (!current || term === current) return 'CURRENT';
    return order.indexOf(term) < order.indexOf(current) ? 'PAST' : 'FUTURE';
  }

  private currentTerm(assignments: LeanRecord[]): AssessmentTermCodeType | undefined {
    return assignments.find((term) =>
      ![TermWorkflowState.NOT_STARTED, TermWorkflowState.TERM_FINALIZED, TermWorkflowState.CLOSED_BY_ADMIN]
        .includes(term.termState),
    )?.assessmentTermCode ?? assignments.find((term) =>
      ![TermWorkflowState.TERM_FINALIZED, TermWorkflowState.CLOSED_BY_ADMIN].includes(term.termState),
    )?.assessmentTermCode ?? assignments.at(-1)?.assessmentTermCode;
  }

  private assessmentTermType(
    assignments: LeanRecord[],
    applicableTerms: AssessmentTermCodeType[],
  ): AssessmentTermTypeType {
    const explicit = assignments.find((term) => term.assessmentTermType)?.assessmentTermType;
    if (explicit) return explicit;
    if (applicableTerms.some((term) => term.startsWith('H'))) return AssessmentTermType.HALF_YEARLY;
    if (applicableTerms.includes(AssessmentTermCode.Y1)) return AssessmentTermType.YEARLY;
    return AssessmentTermType.QUARTERLY;
  }

  private resolveView(
    actor: MatrixActor,
    requested?: ObjectiveMatrixMode,
    isAssignedFinalReviewer = false,
    isAssignmentEmployee = false,
    isAssignmentManager = false,
  ) {
    const role = normalizePmsRole(actor.actorRole);
    if (!role) throw new Error(`Role ${actor.actorRole} is not mapped for PMS access`);
    if (requested && !['employee', 'manager', 'reviewer', 'admin'].includes(requested)) {
      throw new Error(`Unsupported matrix mode ${requested}`);
    }
    const defaultMode: ObjectiveMatrixMode = role === PmsRole.EMPLOYEE
      ? 'employee'
      : role === PmsRole.MANAGER
        ? 'manager'
        : role === PmsRole.DIRECTOR && isAssignmentManager
          ? 'manager'
        : role === PmsRole.ADMIN
          ? 'admin'
          : 'reviewer';
    const mode = requested ?? defaultMode;
    const requestedRole = mode === 'employee'
      ? PmsRole.EMPLOYEE
      : mode === 'manager'
        ? PmsRole.MANAGER
        : mode === 'admin'
          ? PmsRole.ADMIN
          : role === PmsRole.MANAGEMENT ? PmsRole.MANAGEMENT : PmsRole.DIRECTOR;
    // Freeze captures all configured matrix perspectives. An assigned final
    // reviewer may read those perspectives for the same assignment, while the
    // permission role remains DIRECTOR so no matrix edit capability is granted.
    const isFinalReviewerPerspective = isAssignedFinalReviewer;
    const canReadCrossPerspective =
      role === PmsRole.ADMIN || role === PmsRole.DIRECTOR || isFinalReviewerPerspective;
    // A person's functional role may be MANAGER while they are still the employee
    // (subject) of their own PMS assignment. In that assignment only, allow the
    // employee perspective and apply employee column/action permissions.
    const canReadOwnEmployeePerspective =
      role === PmsRole.MANAGER && mode === 'employee' && isAssignmentEmployee;
    // A Director who is the employee's assigned L1 manager must receive the
    // same matrix permissions as a normal manager for that assignment only.
    const canActAsAssignedManager =
      role === PmsRole.DIRECTOR && isAssignmentManager && mode === 'manager';
    if (!canReadCrossPerspective && !canReadOwnEmployeePerspective && !canActAsAssignedManager && requestedRole !== role) {
      throw new Error(`Matrix mode ${mode} is not permitted for role ${actor.actorRole}`);
    }
    const viewRole = canReadCrossPerspective || canReadOwnEmployeePerspective || canActAsAssignedManager
      ? requestedRole
      : role;
    return {
      mode,
      viewRole,
      // Director can inspect another perspective's configured columns, but all
      // permission and row-action calculations must remain Director read-only.
      permissionRole:
        (role === PmsRole.DIRECTOR && !canActAsAssignedManager) ||
        (isFinalReviewerPerspective && !canActAsAssignedManager)
          ? PmsRole.DIRECTOR
          : viewRole,
    };
  }

  private async assertAccess(
    actor: MatrixActor,
    annualAssignment: LeanRecord,
    _requestedMode?: ObjectiveMatrixMode,
    accessContext: ObjectiveMatrixAccessContext = {},
  ): Promise<void> {
    const rawRole = String(actor.actorRole || '').trim().toUpperCase();
    if (accessContext.allowHrWorkspaceRead === true && rawRole === 'HR') {
      return;
    }

    // Director matrix access is global and read-only. Cell/action permissions
    // still prevent Director edits; this bypass only keeps matrix-enabled
    // assignments readable from management performance summaries.
    if (normalizePmsRole(actor.actorRole) === PmsRole.DIRECTOR) {
      return;
    }
    // A reporting-hierarchy reviewer may still have the functional MANAGER role.
    // Their access is limited to the assignment explicitly resolved to them. Allow
    // every read-only perspective because annual-decision freeze captures the
    // employee, manager, and reviewer matrices in one immutable snapshot.
    if (
      (
        annualAssignment.finalReviewerId?.toString() === actor.actorId ||
        annualAssignment.directorReviewerId?.toString() === actor.actorId
      )
    ) {
      return;
    }

    const access = await accessService.canPerform({
      actor,
      action: 'objective.view',
      resource: {
        employeeId: annualAssignment.employeeId.toString(),
        managerId: annualAssignment.assignedManagerId.toString(),
      },
    });
    if (access.allowed) return;
    const delegation = await new DelegationService(this.context).getActiveDelegation(
      actor.actorId,
      annualAssignment.assignedManagerId.toString(),
      'PMS_OBJECTIVES',
      annualAssignment.cycleId.toString(),
      annualAssignment._id.toString(),
    );
    if (!delegation) throw new Error(access.message ?? 'Access denied');
  }

  private requireActor(): MatrixActor {
    if (!this.context.user) throw new Error('Authentication required');
    return {
      actorId: this.context.user._id.toString(),
      actorRole: this.context.user.role,
    };
  }
}
