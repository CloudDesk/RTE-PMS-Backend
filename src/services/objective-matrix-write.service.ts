import mongoose, { Types } from 'mongoose';
import {
  normalizePmsRole,
  ObjectiveSource,
  ObjectiveStatus,
  PmsRole,
  PmsTemplateSectionType,
} from '../constants/pms.enums';
import type { AssessmentTermCode as AssessmentTermCodeType } from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { Objective } from '../models/pms-objective.model';
import { ObjectiveValue } from '../models/pms-objective-value.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import type {
  ITemplateObjectiveTableColumn,
} from '../models/pms-template-version.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import type { RequestContext } from '../types/context';
import type {
  AnnualObjectiveMatrixResponse,
  ObjectiveMatrixCellChange,
  ObjectiveMatrixCellSaveInput,
  ObjectiveMatrixCreateRowInput,
  ObjectiveMatrixCreateRowResult,
  ObjectiveMatrixDeleteRowInput,
  ObjectiveMatrixDeleteRowResult,
  ObjectiveMatrixWriteResult,
} from '../types/pms-objective-matrix';
import { auditService } from './audit.service';
import {
  deterministicDynamicObjectiveRowKey,
  normalizeObjectiveRowCoverage,
  upsertObjectiveRowSeedEntries,
  type ObjectiveRowSeedEntry,
} from './objective-assignment-seeding.service';
import {
  isObjectiveMatrixStageWindowOpen,
  ObjectiveMatrixService,
  resolveObjectiveMatrixCellPermission,
} from './objective-matrix.service';

type LeanRecord = Record<string, any>;

type PreparedCellChange = {
  change: ObjectiveMatrixCellChange;
  column: ITemplateObjectiveTableColumn;
  rowSource: string;
  previousValue: unknown;
};

const CORE_BINDINGS: Record<string, string> = {
  'objective.title': 'title',
  'objective.description': 'description',
  'objective.kpi': 'targetMetric',
  'objective.targetValue': 'targetValue',
  'objective.targetDate': 'targetDate',
  'objective.weightage': 'weightage',
  'objective.successCriteria': 'successCriteria',
};

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

export function validateObjectiveMatrixCreateRequiredValues(input: {
  columns: ITemplateObjectiveTableColumn[];
  role: string;
  coreValues: ObjectiveMatrixCreateRowInput['coreValues'];
  customValues?: Record<string, unknown>;
}): void {
  const coreValuesByBinding: Record<string, unknown> = {
    'objective.title': input.coreValues?.title,
    'objective.description': input.coreValues?.description,
    'objective.kpi': input.coreValues?.targetMetric,
    'objective.targetValue': input.coreValues?.targetValue,
    'objective.targetDate': input.coreValues?.targetDate,
    'objective.weightage': input.coreValues?.weightage,
    'objective.successCriteria': input.coreValues?.successCriteria,
  };
  for (const column of input.columns) {
    if (column.workflowStage !== 'OBJECTIVE_SETTING' ||
      column.type === 'FORMULA' || column.type === 'SYSTEM_DISPLAY') continue;
    const access = column.access?.find((entry) => entry.role === input.role);
    const requiredWhenAdding = access?.editable === true &&
      (access.required === true || column.required === true);
    if (!requiredWhenAdding) continue;
    const value = column.bindingKey.startsWith('objective.')
      ? coreValuesByBinding[column.bindingKey]
      : input.customValues?.[column.columnId];
    if (isEmpty(value)) throw new Error(`${column.label} is required`);
  }
}

export function normalizeObjectiveMatrixValue(
  column: ITemplateObjectiveTableColumn,
  value: unknown,
): unknown {
  if (isEmpty(value)) {
    if (column.required) throw new Error(`${column.label} is required`);
    return undefined;
  }
  if (['SHORT_TEXT', 'LONG_TEXT', 'DROPDOWN'].includes(column.type)) {
    if (typeof value !== 'string') throw new Error(`${column.label} must be text`);
    const normalized = value.trim();
    if (column.type === 'DROPDOWN' && column.options?.length) {
      const allowed = column.options.some((option) => option.value === normalized);
      if (!allowed) throw new Error(`${column.label} contains an unsupported option`);
    }
    return normalized;
  }
  if (['NUMERIC_INPUT', 'PERCENTAGE', 'CURRENCY', 'RATING_SCALE'].includes(column.type)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${column.label} must be a finite number`);
    }
    return value;
  }
  if (column.type === 'BOOLEAN') {
    if (typeof value !== 'boolean') throw new Error(`${column.label} must be Yes or No`);
    return value;
  }
  if (column.type === 'DATE') {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new Error(`${column.label} must be a valid date`);
    return date;
  }
  if (column.type === 'ATTACHMENT') {
    if (typeof value !== 'object') throw new Error(`${column.label} must contain attachment data`);
    return value;
  }
  throw new Error(`${column.label} is calculated and cannot be changed`);
}

function typedValuePayload(column: ITemplateObjectiveTableColumn, value: unknown) {
  if (value === undefined) return {};
  if (column.type === 'DATE') return { valueDate: value as Date };
  if (['NUMERIC_INPUT', 'PERCENTAGE', 'CURRENCY', 'RATING_SCALE'].includes(column.type)) {
    return { valueNumber: value as number };
  }
  if (['SHORT_TEXT', 'LONG_TEXT', 'DROPDOWN'].includes(column.type)) {
    return { valueText: value as string };
  }
  return { valueJson: value };
}

export class ObjectiveMatrixWriteService {
  constructor(private readonly context: RequestContext) {}

  async saveCells(
    annualAssignmentId: string,
    input: ObjectiveMatrixCellSaveInput,
  ): Promise<ObjectiveMatrixWriteResult> {
    const changes = input?.changes ?? [];
    if (!changes.length) throw new Error('At least one matrix cell change is required');
    if (changes.length > 100) throw new Error('A maximum of 100 matrix cells can be saved at once');
    const matrix = await new ObjectiveMatrixService(this.context).getAnnualMatrix(annualAssignmentId);
    const resources = await this.loadTemplateResources(annualAssignmentId);
    if (resources.annual.templateVersionId!.toString() !== matrix.templateVersionId) {
      throw new Error('The assigned objective template changed; reload the matrix');
    }
    const prepared = this.prepareCellChanges(matrix, changes);
    const actor = this.requireActor();
    const actorId = this.objectId(actor.actorId, 'actorId');
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const annual = await AnnualAssignment.findOne({
          _id: this.objectId(annualAssignmentId, 'annualAssignmentId'),
          isDeleted: false,
        }).session(session).lean();
        if (!annual) throw new Error('Annual assignment not found');
        if (
          annual.employeeId.toString() !== matrix.employeeId ||
          annual.assignedManagerId.toString() !== matrix.managerId ||
          annual.templateVersionId?.toString() !== matrix.templateVersionId
        ) throw new Error('The annual assignment changed; reload the matrix');
        const objectiveIds = [...new Set(prepared.map((item) => item.change.objectiveId))]
          .map((id) => this.objectId(id, 'objectiveId'));
        const objectives = await Objective.find({ _id: { $in: objectiveIds }, isDeleted: false })
          .session(session).lean();
        const objectiveById = new Map(objectives.map((item) => [item._id.toString(), item]));
        const termAssignmentIds = [...new Set(prepared.map((item) => item.change.termAssignmentId))]
          .map((id) => this.objectId(id, 'termAssignmentId'));
        const assignments = await TermAssignment.find({ _id: { $in: termAssignmentIds }, isDeleted: false })
          .session(session).lean();
        const assignmentById = new Map(assignments.map((item) => [item._id.toString(), item]));
        const cycles = await TermCycle.find({
          _id: { $in: assignments.map((item) => item.cycleTermId).filter(Boolean) },
          isDeleted: false,
        }).session(session).lean();
        const cycleById = new Map(cycles.map((item) => [item._id.toString(), item]));

        const customPrepared = prepared.filter((item) => !CORE_BINDINGS[item.column.bindingKey]);
        const values = await ObjectiveValue.find({
          objectiveId: { $in: objectiveIds },
          fieldKey: { $in: customPrepared.map((item) => item.change.fieldKey) },
          isDeleted: false,
        }).sort({ updatedAt: 1, createdAt: 1 }).session(session).lean();
        const valueByCell = new Map<string, LeanRecord>();
        for (const value of values) valueByCell.set(`${value.objectiveId}:${value.fieldKey}`, value);

        for (const item of prepared) {
          const { change, column } = item;
          const objective = objectiveById.get(change.objectiveId);
          const assignment = assignmentById.get(change.termAssignmentId);
          if (!objective || !assignment) throw new Error('A matrix row changed or no longer exists');
          this.assertRelationship(annualAssignmentId, objective, assignment, change);
          if (objective.version !== change.expectedObjectiveVersion) {
            throw new Error(`Objective ${change.objectiveId} was changed by another user`);
          }
          this.assertCurrentPermission(matrix, item, assignment, annual, cycleById);
          const currentValue = valueByCell.get(`${change.objectiveId}:${change.fieldKey}`);
          if (!CORE_BINDINGS[column.bindingKey]) {
            if (currentValue && change.expectedValueVersion !== currentValue.version) {
              throw new Error(`Cell ${change.columnId} was changed by another user`);
            }
            if (!currentValue && change.expectedValueVersion !== undefined) {
              throw new Error(`Cell ${change.columnId} no longer exists`);
            }
          }
        }

        const byObjective = new Map<string, PreparedCellChange[]>();
        for (const item of prepared) {
          byObjective.set(item.change.objectiveId, [...(byObjective.get(item.change.objectiveId) ?? []), item]);
        }
        for (const [objectiveId, objectiveChanges] of byObjective) {
          const objective = objectiveById.get(objectiveId)!;
          const coreSet: Record<string, unknown> = { updatedBy: actorId };
          const coreUnset: Record<string, 1> = {};
          for (const item of objectiveChanges) {
            const modelField = CORE_BINDINGS[item.column.bindingKey];
            if (!modelField) continue;
            let normalized = normalizeObjectiveMatrixValue(item.column, item.change.value);
            if (modelField === 'targetValue' && normalized !== undefined) normalized = String(normalized);
            if (normalized === undefined) coreUnset[modelField] = 1;
            else coreSet[modelField] = normalized;
          }
          const result = await Objective.updateOne(
            { _id: objective._id, version: objective.version, isDeleted: false },
            {
              $set: coreSet,
              ...(Object.keys(coreUnset).length ? { $unset: coreUnset } : {}),
              $inc: { version: 1 },
            },
            { session },
          );
          if (result.modifiedCount !== 1) throw new Error(`Objective ${objectiveId} was changed by another user`);
        }

        for (const item of customPrepared) {
          const { change, column } = item;
          const objective = objectiveById.get(change.objectiveId)!;
          const normalized = normalizeObjectiveMatrixValue(column, change.value);
          const currentValue = valueByCell.get(`${change.objectiveId}:${change.fieldKey}`);
          const base = {
            objectiveId: objective._id,
            termAssignmentId: objective.termAssignmentId,
            annualAssignmentId: objective.annualAssignmentId,
            cycleId: objective.cycleId,
            employeeId: objective.employeeId,
            templateFieldId: column.columnId,
            fieldKey: column.bindingKey,
            sectionKey: resources.section.sectionKey,
            roleCode: matrix.viewRole,
            actorUserId: actorId,
            workflowStage: column.workflowStage,
            valueStatus: 'ACTIVE',
            isDeleted: false,
            updatedBy: actorId,
          };
          if (currentValue) {
            const unsetValueFields = normalized === undefined
              ? { valueDate: 1, valueNumber: 1, valueText: 1, valueJson: 1 }
              : {
                ...(column.type !== 'DATE' ? { valueDate: 1 } : {}),
                ...(!['NUMERIC_INPUT', 'PERCENTAGE', 'CURRENCY', 'RATING_SCALE'].includes(column.type)
                  ? { valueNumber: 1 } : {}),
                ...(!['SHORT_TEXT', 'LONG_TEXT', 'DROPDOWN'].includes(column.type)
                  ? { valueText: 1 } : {}),
                ...(['DATE', 'NUMERIC_INPUT', 'PERCENTAGE', 'CURRENCY', 'RATING_SCALE',
                  'SHORT_TEXT', 'LONG_TEXT', 'DROPDOWN'].includes(column.type) ? { valueJson: 1 } : {}),
              };
            const result = await ObjectiveValue.updateOne(
              { _id: currentValue._id, version: currentValue.version, isDeleted: false },
              {
                $set: { ...base, ...typedValuePayload(column, normalized) },
                $unset: unsetValueFields,
                $inc: { version: 1 },
              },
              { session },
            );
            if (result.modifiedCount !== 1) throw new Error(`Cell ${change.columnId} was changed by another user`);
          } else if (normalized !== undefined) {
            await ObjectiveValue.create([{
              _id: new Types.ObjectId(),
              ...base,
              ...typedValuePayload(column, normalized),
              createdBy: actorId,
              version: 1,
            }], { session });
          }
        }

        for (const item of prepared) {
          await auditService.createAuditLog({
            actorId: actor.actorId,
            actorRole: actor.actorRole,
            action: 'PMS_OBJECTIVE_MATRIX_CELL_UPDATED',
            entityType: 'OBJECTIVE',
            entityId: item.change.objectiveId,
            assignmentId: annualAssignmentId,
            previousValue: { columnId: item.change.columnId, value: item.previousValue },
            newValue: { columnId: item.change.columnId, value: item.change.value },
            metadata: {
              objectiveRowKey: item.change.objectiveRowKey,
              termCode: item.change.termCode,
              fieldKey: item.change.fieldKey,
              requestId: this.context.requestId,
            },
          }, session);
        }
        await auditService.createAuditLog({
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          action: 'PMS_OBJECTIVE_MATRIX_BATCH_SAVED',
          entityType: 'ANNUAL_ASSIGNMENT',
          entityId: annualAssignmentId,
          assignmentId: annualAssignmentId,
          newValue: { changedCells: prepared.length },
          metadata: { requestId: this.context.requestId },
        }, session);
      });
    } finally {
      await session.endSession();
    }
    const refreshed = await new ObjectiveMatrixService(this.context).getAnnualMatrix(annualAssignmentId);
    const changedCellPrefixes = prepared.map((item) =>
      `${item.change.objectiveRowKey}:${item.change.termCode}:${item.change.columnId}`,
    );
    const affectedFormulaColumnIds = [...new Set(refreshed.formulaResults
      .filter((result) => result.sourceCellKeys.some((key) => changedCellPrefixes.includes(key)))
      .map((result) => result.targetColumnId))];
    return {
      changedCellKeys: prepared.map((item) => `${item.change.objectiveRowKey}:${item.change.termCode}:${item.change.columnId}`),
      affectedFormulaColumnIds,
      matrix: refreshed,
    };
  }

  async createRow(
    annualAssignmentId: string,
    input: ObjectiveMatrixCreateRowInput,
  ): Promise<ObjectiveMatrixCreateRowResult> {
    const matrix = await new ObjectiveMatrixService(this.context).getAnnualMatrix(annualAssignmentId);
    const actor = this.requireActor();
    const role = normalizePmsRole(actor.actorRole);
    const expectedSource = role === PmsRole.EMPLOYEE
      ? ObjectiveSource.EMPLOYEE_CREATED
      : role === PmsRole.MANAGER
        ? ObjectiveSource.MANAGER_CREATED
        : undefined;
    if (!expectedSource || input.source !== expectedSource) {
      throw new Error('Only Employee or Manager can create their own matrix objective rows');
    }
    if (input.currentTermCode !== matrix.currentTermCode) {
      throw new Error('Dynamic objective rows can be created only in the current term');
    }
    const correlationId = input.correlationId?.trim();
    if (!correlationId) throw new Error('A client correlation id is required');
    const coverage = normalizeObjectiveRowCoverage(
      input.selectedTermCoverage?.length ? input.selectedTermCoverage : [input.currentTermCode],
    );
    if (!coverage.includes(input.currentTermCode) || coverage.some((term) => !matrix.termOrder.includes(term))) {
      throw new Error('Selected row coverage must contain only assigned terms and include the current term');
    }
    const currentTermIndex = matrix.termOrder.indexOf(input.currentTermCode);
    if (coverage.some((term) => matrix.termOrder.indexOf(term) < currentTermIndex)) {
      throw new Error('A new objective row cannot be added to a past term');
    }
    const canChoose = role === PmsRole.EMPLOYEE
      ? matrix.dynamicRowPolicy.allowEmployeeTermChoice
      : matrix.dynamicRowPolicy.allowManagerTermChoice;
    if (!canChoose && (coverage.length !== 1 || coverage[0] !== input.currentTermCode)) {
      throw new Error('This template allows new objective rows only in the current term');
    }
    if (!input.coreValues?.title?.trim()) throw new Error('Objective title is required');

    const resources = await this.loadTemplateResources(annualAssignmentId);
    validateObjectiveMatrixCreateRequiredValues({
      columns: resources.layout.columns,
      role: role!,
      coreValues: input.coreValues,
      customValues: input.customValues,
    });
    const objectiveConfig = resources.section.objectiveConfig!;
    if (role === PmsRole.EMPLOYEE && objectiveConfig.allowEmployeeCreated !== true) {
      throw new Error('Employee-created objectives are disabled by this template');
    }
    if (role === PmsRole.MANAGER && objectiveConfig.allowManagerCreated !== true) {
      throw new Error('Manager-created objectives are disabled by this template');
    }
    const rowGroups = resources.layout.rowGroups.filter((group) => group.source === input.source);
    const rowGroupKey = input.rowGroupKey ?? rowGroups[0]?.rowGroupKey;
    if (rowGroupKey && !rowGroups.some((group) => group.rowGroupKey === rowGroupKey)) {
      throw new Error('The selected row group does not accept this objective source');
    }
    const actorId = this.objectId(actor.actorId, 'actorId');
    const objectiveRowKey = deterministicDynamicObjectiveRowKey(annualAssignmentId, correlationId);
    const columnById = new Map(resources.layout.columns.map((column) => [column.columnId, column]));
    const customValues = input.customValues ?? {};
    for (const [columnId, value] of Object.entries(customValues)) {
      const column = columnById.get(columnId);
      if (!column || column.bindingKey.startsWith('objective.')) throw new Error(`Unknown custom column ${columnId}`);
      normalizeObjectiveMatrixValue(column, value);
    }
    const titleColumn = resources.layout.columns.find((column) => column.bindingKey === 'objective.title');
    if (!titleColumn) throw new Error('The objective table requires an Objective column for dynamic rows');
    const suppliedCoreValues = [
      ['objective.title', input.coreValues.title],
      ['objective.description', input.coreValues.description],
      ['objective.kpi', input.coreValues.targetMetric],
      ['objective.targetValue', input.coreValues.targetValue],
      ['objective.targetDate', input.coreValues.targetDate],
      ['objective.weightage', input.coreValues.weightage],
      ['objective.successCriteria', input.coreValues.successCriteria],
    ].filter((entry) => entry[1] !== undefined) as Array<[string, unknown]>;
    if (input.coreValues.priority && !['LOW', 'MEDIUM', 'HIGH'].includes(input.coreValues.priority.trim().toUpperCase())) {
      throw new Error('Objective priority must be LOW, MEDIUM, or HIGH');
    }
    if (input.coreValues.targetDate && Number.isNaN(new Date(input.coreValues.targetDate).getTime())) {
      throw new Error('Objective target date must be valid');
    }
    if (input.coreValues.weightage !== undefined &&
      (!Number.isFinite(input.coreValues.weightage) || input.coreValues.weightage < 0 || input.coreValues.weightage > 100)) {
      throw new Error('Objective weightage must be between 0 and 100');
    }

    const session = await mongoose.startSession();
    let objectiveIds: string[] = [];
    try {
      await session.withTransaction(async () => {
        const transactionAnnual = await AnnualAssignment.findOne({
          _id: resources.annual._id,
          isDeleted: false,
        }).session(session).lean();
        if (!transactionAnnual ||
          transactionAnnual.templateVersionId?.toString() !== matrix.templateVersionId ||
          transactionAnnual.assignedManagerId.toString() !== matrix.managerId) {
          throw new Error('The annual assignment changed; reload the matrix');
        }
        const existing = await Objective.find({
          annualAssignmentId: transactionAnnual._id,
          objectiveRowKey,
          isDeleted: false,
        }).session(session).lean();
        if (existing.length) {
          objectiveIds = existing.map((item) => item._id.toString());
          return;
        }
        const selectedAssignments = await TermAssignment.find({
          annualAssignmentId: transactionAnnual._id,
          assessmentTermCode: { $in: coverage },
          isDeleted: false,
        }).session(session).lean();
        if (selectedAssignments.length !== coverage.length) throw new Error('A selected term assignment no longer exists');
        const cycles = await TermCycle.find({
          _id: { $in: selectedAssignments.map((item) => item.cycleTermId).filter(Boolean) },
          isDeleted: false,
        }).session(session).lean();
        const cycleById = new Map(cycles.map((item) => [item._id.toString(), item]));
        const currentAssignment = selectedAssignments.find((assignment) =>
          assignment.assessmentTermCode === input.currentTermCode,
        )!;
        const currentCycle = currentAssignment.cycleTermId
          ? cycleById.get(currentAssignment.cycleTermId.toString())
          : undefined;
        for (const [bindingKey, value] of suppliedCoreValues) {
          const column = resources.layout.columns.find((item) => item.bindingKey === bindingKey);
          if (!column) throw new Error(`The template does not expose ${bindingKey} for dynamic rows`);
          const columnAccess = column.access?.find((entry) => entry.role === role);
          const permission = resolveObjectiveMatrixCellPermission({
            role: role!,
            workflowState: currentAssignment.termState,
            termPosition: 'CURRENT',
            windowOpen: isObjectiveMatrixStageWindowOpen({
              stage: column.workflowStage,
              assignment: currentAssignment,
              termCycle: currentCycle,
              annualAssignment: transactionAnnual,
              now: this.context.pmsCurrentDate ?? new Date(),
            }),
            columnFillOwner: column.fillOwner,
            columnRequired: columnAccess?.required === true || column.required === true,
            columnType: column.type,
            explicitVisibility: columnAccess?.visible === false ? 'HIDDEN' : 'VISIBLE',
            explicitEditable: columnAccess?.editable === true,
            rowSource: input.source,
          });
          if (!permission.editable) throw new Error(permission.denialReason ?? `${column.label} is read-only`);
          normalizeObjectiveMatrixValue(column, value);
        }
        for (const assignment of selectedAssignments) {
          const columnAccess = titleColumn.access?.find((entry) => entry.role === role);
          const permission = resolveObjectiveMatrixCellPermission({
            role: role!,
            workflowState: assignment.termState,
            termPosition: assignment.assessmentTermCode === matrix.currentTermCode ? 'CURRENT' : 'FUTURE',
            windowOpen: isObjectiveMatrixStageWindowOpen({
              stage: titleColumn.workflowStage,
              assignment,
              termCycle: assignment.cycleTermId ? cycleById.get(assignment.cycleTermId.toString()) : undefined,
              annualAssignment: transactionAnnual,
              now: this.context.pmsCurrentDate ?? new Date(),
            }),
            columnFillOwner: titleColumn.fillOwner,
            columnRequired: true,
            columnType: titleColumn.type,
            explicitVisibility: columnAccess?.visible === false ? 'HIDDEN' : 'VISIBLE',
            explicitEditable: columnAccess?.editable === true,
            rowSource: input.source,
          });
          if (assignment.assessmentTermCode === input.currentTermCode && !permission.editable) {
            throw new Error(permission.denialReason ?? 'The current term is not open for objective creation');
          }
        }
        const customValuesByTerm = new Map<AssessmentTermCodeType, Record<string, unknown>>();
        for (const assignment of selectedAssignments) {
          const termValues: Record<string, unknown> = {};
          for (const [columnId, value] of Object.entries(customValues)) {
            const column = columnById.get(columnId)!;
            const policy = resources.layout.termPolicies.find((item) => item.columnId === columnId);
            const applies = policy?.mode === 'SHARED_ANNUAL'
              ? assignment.assessmentTermCode === input.currentTermCode
              : policy?.mode === 'SELECTED_PERIODS'
                ? policy.selectedTerms?.includes(assignment.assessmentTermCode) === true
                : assignment.assessmentTermCode === input.currentTermCode;
            if (!applies) continue;
            const columnAccess = column.access?.find((entry) => entry.role === role);
            const permission = resolveObjectiveMatrixCellPermission({
              role: role!,
              workflowState: assignment.termState,
              termPosition: assignment.assessmentTermCode === input.currentTermCode ? 'CURRENT' : 'FUTURE',
              windowOpen: isObjectiveMatrixStageWindowOpen({
                stage: column.workflowStage,
                assignment,
                termCycle: assignment.cycleTermId ? cycleById.get(assignment.cycleTermId.toString()) : undefined,
                annualAssignment: transactionAnnual,
                now: this.context.pmsCurrentDate ?? new Date(),
              }),
              columnFillOwner: column.fillOwner,
              columnRequired: columnAccess?.required === true || column.required === true,
              columnType: column.type,
              explicitVisibility: columnAccess?.visible === false ? 'HIDDEN' : 'VISIBLE',
              explicitEditable: columnAccess?.editable === true,
              rowSource: input.source,
            });
            if (!permission.editable) throw new Error(permission.denialReason ?? `${column.label} is read-only`);
            termValues[columnId] = value;
          }
          customValuesByTerm.set(assignment.assessmentTermCode, termValues);
        }
        for (const column of resources.layout.columns) {
          if (column.bindingKey.startsWith('objective.') ||
            column.type === 'FORMULA' || column.type === 'SYSTEM_DISPLAY' ||
            column.workflowStage !== 'OBJECTIVE_SETTING') continue;
          const access = column.access?.find((entry) => entry.role === role);
          const policy = resources.layout.termPolicies.find((item) => item.columnId === column.columnId);
          const requiredNow = (access?.required === true || column.required === true) && access?.editable === true;
          const appliesNow = policy?.mode !== 'SELECTED_PERIODS' ||
            policy.selectedTerms?.includes(input.currentTermCode) === true;
          if (requiredNow && appliesNow && isEmpty(customValuesByTerm.get(input.currentTermCode)?.[column.columnId])) {
            throw new Error(`${column.label} is required`);
          }
        }
        const now = new Date();
        const entries: ObjectiveRowSeedEntry[] = selectedAssignments.map((assignment) => {
          return {
            annualAssignmentId: transactionAnnual._id,
            termAssignmentId: assignment._id,
            assessmentTermCode: assignment.assessmentTermCode,
            objectiveRowKey,
            rowOriginTermCode: input.currentTermCode,
            rowCoverage: coverage,
            rowGroupKey,
            sectionKey: resources.section.sectionKey,
            columnValues: undefined,
            columnBindingKeyById: Object.fromEntries(resources.layout.columns.map((column) => [column.columnId, column.bindingKey])),
            columnTypeById: Object.fromEntries(resources.layout.columns.map((column) => [column.columnId, column.type])),
            payload: {
              cycleId: transactionAnnual.cycleId,
              templateVersionId: transactionAnnual.templateVersionId,
              employeeId: transactionAnnual.employeeId,
              assignedManagerId: transactionAnnual.assignedManagerId,
              source: input.source,
              title: input.coreValues.title.trim(),
              description: input.coreValues.description?.trim(),
              priority: input.coreValues.priority?.trim().toUpperCase(),
              expectedOutcome: input.coreValues.expectedOutcome?.trim(),
              targetMetric: input.coreValues.targetMetric?.trim(),
              targetValue: input.coreValues.targetValue === undefined ? undefined : String(input.coreValues.targetValue),
              targetDate: input.coreValues.targetDate ? new Date(input.coreValues.targetDate) : undefined,
              weightage: input.coreValues.weightage,
              successCriteria: input.coreValues.successCriteria?.trim(),
              status: input.source === ObjectiveSource.MANAGER_CREATED
                ? ObjectiveStatus.OBJECTIVE_APPROVED
                : ObjectiveStatus.OBJECTIVE_DRAFT,
              attachments: [],
              createdByRole: actor.actorRole,
              createdByUserId: actorId,
              createdBy: actorId,
              updatedBy: actorId,
              approvedAt: input.source === ObjectiveSource.MANAGER_CREATED ? now : undefined,
              approvedBy: input.source === ObjectiveSource.MANAGER_CREATED ? actorId : undefined,
              isDeleted: false,
              version: 1,
            },
          };
        });
        const result = await upsertObjectiveRowSeedEntries(entries, actorId, session);
        objectiveIds = result.objectiveIds;
        const createdObjectives = await Objective.find({
          _id: { $in: objectiveIds.map((id) => this.objectId(id, 'objectiveId')) },
          isDeleted: false,
        }).session(session).lean();
        const valuesToCreate = createdObjectives.flatMap((objective) => {
          const valuesForTerm = objective.assessmentTermCode
            ? customValuesByTerm.get(objective.assessmentTermCode) ?? {}
            : {};
          return Object.entries(valuesForTerm).flatMap(([columnId, value]) => {
            const column = columnById.get(columnId)!;
            const normalized = normalizeObjectiveMatrixValue(column, value);
            if (normalized === undefined) return [];
            return [{
              _id: new Types.ObjectId(),
              objectiveId: objective._id,
              termAssignmentId: objective.termAssignmentId,
              annualAssignmentId: transactionAnnual._id,
              cycleId: transactionAnnual.cycleId,
              employeeId: transactionAnnual.employeeId,
              templateFieldId: column.columnId,
              fieldKey: column.bindingKey,
              sectionKey: resources.section.sectionKey,
              roleCode: role,
              actorUserId: actorId,
              workflowStage: column.workflowStage,
              ...typedValuePayload(column, normalized),
              valueStatus: 'ACTIVE',
              isDeleted: false,
              createdBy: actorId,
              updatedBy: actorId,
              version: 1,
            }];
          });
        });
        if (valuesToCreate.length) await ObjectiveValue.insertMany(valuesToCreate, { session });
        for (const objectiveId of objectiveIds) {
          await auditService.createAuditLog({
            actorId: actor.actorId,
            actorRole: actor.actorRole,
            action: input.source === ObjectiveSource.MANAGER_CREATED
              ? 'PMS_MANAGER_MATRIX_OBJECTIVE_CREATED_AND_APPROVED'
              : 'PMS_EMPLOYEE_MATRIX_OBJECTIVE_CREATED',
            entityType: 'OBJECTIVE',
            entityId: objectiveId,
            assignmentId: annualAssignmentId,
            newValue: { objectiveRowKey, coverage, title: input.coreValues.title },
            correlationId,
            metadata: { requestId: this.context.requestId },
          }, session);
        }
        await auditService.createAuditLog({
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          action: 'PMS_OBJECTIVE_MATRIX_ROW_CREATED',
          entityType: 'ANNUAL_ASSIGNMENT',
          entityId: annualAssignmentId,
          assignmentId: annualAssignmentId,
          newValue: { objectiveRowKey, coverage, objectiveIds },
          correlationId,
          metadata: { source: input.source, requestId: this.context.requestId },
        }, session);
      });
    } finally {
      await session.endSession();
    }
    return {
      objectiveRowKey,
      objectiveIds,
      coverage,
      matrix: await new ObjectiveMatrixService(this.context).getAnnualMatrix(annualAssignmentId),
    };
  }

  async deleteRow(
    annualAssignmentId: string,
    objectiveRowKey: string,
    input: ObjectiveMatrixDeleteRowInput,
  ): Promise<ObjectiveMatrixDeleteRowResult> {
    if (!objectiveRowKey?.trim()) throw new Error('objectiveRowKey is required');
    const matrix = await new ObjectiveMatrixService(this.context).getAnnualMatrix(annualAssignmentId);
    if (input.currentTermCode !== matrix.currentTermCode) {
      throw new Error('Row deletion must be requested from the current term');
    }
    const resources = await this.loadTemplateResources(annualAssignmentId);
    const titleColumn = resources.layout.columns.find((column) => column.bindingKey === 'objective.title');
    if (!titleColumn) throw new Error('The objective table has no row identity column');
    const row = matrix.rows.find((item) => item.objectiveRowKey === objectiveRowKey);
    if (!row) throw new Error('Objective matrix row not found');
    if (row.source === ObjectiveSource.PREDEFINED) throw new Error('Template objective rows cannot be deleted');
    if (!row.actions.canDelete) throw new Error('This objective row is not deletable in the current workflow');
    const selectedTerms = input.scope === 'CURRENT_TERM'
      ? [input.currentTermCode]
      : normalizeObjectiveRowCoverage(input.selectedTerms ?? []);
    if (!selectedTerms.length) throw new Error('At least one linked draft term must be selected');
    const targets = row.siblings.filter((sibling) => selectedTerms.includes(sibling.termCode));
    if (targets.length !== selectedTerms.length) throw new Error('A selected linked objective term does not exist');
    if (targets.some((target) => target.status !== ObjectiveStatus.OBJECTIVE_DRAFT)) {
      throw new Error('Only linked objective drafts can be deleted');
    }
    for (const target of targets) {
      if (input.expectedObjectiveVersions?.[target.objectiveId] !== target.version) {
        throw new Error(`Objective ${target.objectiveId} was changed by another user`);
      }
    }
    const actor = this.requireActor();
    const actorId = this.objectId(actor.actorId, 'actorId');
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const annual = await AnnualAssignment.findOne({
          _id: this.objectId(annualAssignmentId, 'annualAssignmentId'),
          isDeleted: false,
        }).session(session).lean();
        const currentSibling = row.siblings.find((sibling) => sibling.termCode === input.currentTermCode);
        if (!annual || !currentSibling ||
          annual.assignedManagerId.toString() !== matrix.managerId ||
          annual.templateVersionId?.toString() !== matrix.templateVersionId) {
          throw new Error('The annual assignment changed; reload the matrix');
        }
        const assignment = await TermAssignment.findOne({
          _id: this.objectId(currentSibling.termAssignmentId, 'termAssignmentId'),
          annualAssignmentId: annual._id,
          isDeleted: false,
        }).session(session).lean();
        if (!assignment) throw new Error('The current term assignment changed; reload the matrix');
        const termCycle = assignment.cycleTermId
          ? await TermCycle.findOne({ _id: assignment.cycleTermId, isDeleted: false }).session(session).lean()
          : undefined;
        const access = titleColumn.access?.find((entry) => entry.role === matrix.viewRole);
        const permission = resolveObjectiveMatrixCellPermission({
          role: matrix.viewRole,
          workflowState: assignment.termState,
          termPosition: 'CURRENT',
          windowOpen: isObjectiveMatrixStageWindowOpen({
            stage: titleColumn.workflowStage,
            assignment,
            termCycle: termCycle ?? undefined,
            annualAssignment: annual,
            now: this.context.pmsCurrentDate ?? new Date(),
          }),
          columnFillOwner: titleColumn.fillOwner,
          columnRequired: access?.required === true || titleColumn.required === true,
          columnType: titleColumn.type,
          explicitVisibility: access?.visible === false ? 'HIDDEN' : 'VISIBLE',
          explicitEditable: access?.editable === true,
          rowSource: row.source,
        });
        if (!permission.editable) throw new Error(permission.denialReason ?? 'The row is no longer deletable');
        for (const target of targets) {
          const result = await Objective.updateOne(
            {
              _id: this.objectId(target.objectiveId, 'objectiveId'),
              annualAssignmentId: this.objectId(annualAssignmentId, 'annualAssignmentId'),
              objectiveRowKey,
              status: ObjectiveStatus.OBJECTIVE_DRAFT,
              version: target.version,
              isDeleted: false,
            },
            { $set: { isDeleted: true, updatedBy: actorId }, $inc: { version: 1 } },
            { session },
          );
          if (result.modifiedCount !== 1) throw new Error(`Objective ${target.objectiveId} was changed by another user`);
          await ObjectiveValue.updateMany(
            { objectiveId: this.objectId(target.objectiveId, 'objectiveId'), isDeleted: false },
            { $set: { isDeleted: true, updatedBy: actorId }, $inc: { version: 1 } },
            { session },
          );
          await auditService.createAuditLog({
            actorId: actor.actorId,
            actorRole: actor.actorRole,
            action: 'PMS_OBJECTIVE_MATRIX_DRAFT_DELETED',
            entityType: 'OBJECTIVE',
            entityId: target.objectiveId,
            assignmentId: annualAssignmentId,
            previousValue: { objectiveRowKey, termCode: target.termCode, status: target.status },
            newValue: { isDeleted: true },
            metadata: { scope: input.scope, requestId: this.context.requestId },
          }, session);
        }
        await auditService.createAuditLog({
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          action: 'PMS_OBJECTIVE_MATRIX_ROW_DELETE_BATCH',
          entityType: 'ANNUAL_ASSIGNMENT',
          entityId: annualAssignmentId,
          assignmentId: annualAssignmentId,
          newValue: { objectiveRowKey, deletedTerms: selectedTerms },
          metadata: { scope: input.scope, requestId: this.context.requestId },
        }, session);
      });
    } finally {
      await session.endSession();
    }
    return {
      objectiveRowKey,
      deletedObjectiveIds: targets.map((target) => target.objectiveId),
      deletedTerms: targets.map((target) => target.termCode),
      matrix: await new ObjectiveMatrixService(this.context).getAnnualMatrix(annualAssignmentId),
    };
  }

  private prepareCellChanges(
    matrix: AnnualObjectiveMatrixResponse,
    changes: ObjectiveMatrixCellChange[],
  ): PreparedCellChange[] {
    const duplicateKeys = new Set<string>();
    return changes.map((change) => {
      if (!Types.ObjectId.isValid(change.objectiveId) || !Types.ObjectId.isValid(change.termAssignmentId)) {
        throw new Error('A matrix cell contains an invalid objective or term assignment id');
      }
      if (!Number.isInteger(change.expectedObjectiveVersion) || change.expectedObjectiveVersion < 1) {
        throw new Error('Every matrix cell change requires a valid expectedObjectiveVersion');
      }
      const duplicateKey = `${change.objectiveId}:${change.fieldKey}`;
      if (duplicateKeys.has(duplicateKey)) throw new Error(`Duplicate matrix cell change ${change.columnId}`);
      duplicateKeys.add(duplicateKey);
      const row = matrix.rows.find((item) => item.objectiveRowKey === change.objectiveRowKey);
      const column = matrix.columns.find((item) => item.columnId === change.columnId);
      const cells = row ? [...row.sharedCells, ...Object.values(row.termCells).flatMap((items) => items ?? [])] : [];
      const cell = cells.find((item) =>
        item.columnId === change.columnId &&
        item.objectiveId === change.objectiveId &&
        item.termAssignmentId === change.termAssignmentId,
      );
      if (!row || !column || !cell) throw new Error('Matrix cell does not exist or is not visible');
      if (cell.fieldKey !== change.fieldKey || column.bindingKey !== change.fieldKey) {
        throw new Error('Matrix column binding does not match the requested field');
      }
      if (column.bindingKey.startsWith('objective.') && !CORE_BINDINGS[column.bindingKey]) {
        throw new Error(`${column.label} is a system-owned objective field`);
      }
      if (column.bindingKey.startsWith('formula.') || column.bindingKey.startsWith('system.')) {
        throw new Error(`${column.label} is calculated and cannot be changed`);
      }
      if (!cell.editable) throw new Error(cell.denialReason ?? 'Matrix cell is read-only');
      if (cell.required && isEmpty(change.value)) throw new Error(`${column.label} is required`);
      normalizeObjectiveMatrixValue(column, change.value);
      return { change, column, rowSource: row.source, previousValue: cell.value };
    });
  }

  private assertRelationship(
    annualAssignmentId: string,
    objective: LeanRecord,
    assignment: LeanRecord,
    change: ObjectiveMatrixCellChange,
  ) {
    if (
      objective.annualAssignmentId?.toString() !== annualAssignmentId ||
      objective.objectiveRowKey !== change.objectiveRowKey ||
      objective.termAssignmentId.toString() !== change.termAssignmentId ||
      objective.assessmentTermCode !== change.termCode ||
      assignment._id.toString() !== change.termAssignmentId ||
      assignment.annualAssignmentId.toString() !== annualAssignmentId ||
      assignment.assessmentTermCode !== change.termCode ||
      assignment.employeeId.toString() !== objective.employeeId.toString() ||
      assignment.assignedManagerId.toString() !== objective.assignedManagerId.toString()
    ) throw new Error('Objective row, term, and annual assignment relationship is invalid');
  }

  private assertCurrentPermission(
    matrix: AnnualObjectiveMatrixResponse,
    item: PreparedCellChange,
    assignment: LeanRecord,
    annual: LeanRecord,
    cycleById: Map<string, LeanRecord>,
  ) {
    const access = item.column.access?.find((entry) => entry.role === matrix.viewRole);
    const currentIndex = matrix.currentTermCode ? matrix.termOrder.indexOf(matrix.currentTermCode) : -1;
    const termIndex = matrix.termOrder.indexOf(item.change.termCode);
    const termPosition = currentIndex < 0 || termIndex === currentIndex
      ? 'CURRENT'
      : termIndex < currentIndex ? 'PAST' : 'FUTURE';
    const permission = resolveObjectiveMatrixCellPermission({
      role: matrix.viewRole,
      workflowState: assignment.termState,
      termPosition,
      windowOpen: isObjectiveMatrixStageWindowOpen({
        stage: item.column.workflowStage,
        assignment,
        termCycle: assignment.cycleTermId ? cycleById.get(assignment.cycleTermId.toString()) : undefined,
        annualAssignment: annual,
        now: this.context.pmsCurrentDate ?? new Date(),
      }),
      columnFillOwner: item.column.fillOwner,
      columnRequired: access?.required === true || item.column.required === true,
      columnType: item.column.type,
      explicitVisibility: access?.visible === false ? 'HIDDEN' : 'VISIBLE',
      explicitEditable: access?.editable === true,
      rowSource: item.rowSource,
    });
    if (!permission.editable) throw new Error(permission.denialReason ?? 'Matrix cell is read-only');
  }

  private async loadTemplateResources(annualAssignmentId: string) {
    const annual = await AnnualAssignment.findOne({
      _id: this.objectId(annualAssignmentId, 'annualAssignmentId'), isDeleted: false,
    }).lean();
    if (!annual?.templateVersionId) throw new Error('Annual assignment has no template version');
    const [template, assignments] = await Promise.all([
      PmsTemplateVersion.findById(annual.templateVersionId).lean(),
      TermAssignment.find({ annualAssignmentId: annual._id, isDeleted: false }).lean(),
    ]);
    const section = template?.sections?.find((item) =>
      item.sectionType === PmsTemplateSectionType.OBJECTIVES && item.objectiveConfig?.tableLayout?.enabled,
    );
    if (!section?.objectiveConfig?.tableLayout) throw new Error('Objective table layout is not enabled');
    return { annual, assignments, section, layout: section.objectiveConfig.tableLayout };
  }

  private requireActor() {
    if (!this.context.user) throw new Error('Authentication required');
    return { actorId: this.context.user._id.toString(), actorRole: this.context.user.role };
  }

  private objectId(value: string, field: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) throw new Error(`Invalid ${field}`);
    return new Types.ObjectId(value);
  }
}
