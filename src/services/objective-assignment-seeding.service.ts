import { createHash } from 'crypto';
import mongoose, { ClientSession, Types } from 'mongoose';
import { AssessmentTermCode, ObjectiveSource } from '../constants/pms.enums';
import type { AssessmentTermCode as AssessmentTermCodeType } from '../constants/pms.enums';
import { Objective } from '../models/pms-objective.model';
import { ObjectiveValue } from '../models/pms-objective-value.model';

export interface ObjectiveRowSeedEntry {
  annualAssignmentId: Types.ObjectId;
  termAssignmentId: Types.ObjectId;
  assessmentTermCode: AssessmentTermCodeType;
  objectiveRowKey: string;
  templateObjectiveKey?: string;
  rowOriginTermCode: AssessmentTermCodeType;
  rowCoverage: AssessmentTermCodeType[];
  rowGroupKey?: string;
  rowOrder?: number;
  sectionKey: string;
  columnValues?: Record<string, unknown>;
  columnBindingKeyById?: Record<string, string>;
  columnTypeById?: Record<string, string>;
  payload: Record<string, unknown>;
}

export interface DynamicObjectiveCoverageInput {
  annualAssignmentId: Types.ObjectId;
  termTargets: Array<{
    termAssignmentId: Types.ObjectId;
    assessmentTermCode: AssessmentTermCodeType;
    payload: Record<string, unknown>;
  }>;
  currentTermCode: AssessmentTermCodeType;
  selectedCoverage: AssessmentTermCodeType[];
  rowGroupKey?: string;
  sectionKey: string;
  columnValues?: Record<string, unknown>;
  columnBindingKeyById?: Record<string, string>;
  columnTypeById?: Record<string, string>;
  correlationId: string;
  actorUserId: Types.ObjectId;
}

export function deterministicPredefinedObjectiveRowKey(
  sectionKey: string,
  objectiveKey: string,
): string {
  const seed = `${sectionKey.trim().toLowerCase()}:${objectiveKey.trim().toLowerCase()}`;
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 24);
  return `predefined:${digest}`;
}

export function deterministicDynamicObjectiveRowKey(
  annualAssignmentId: Types.ObjectId | string,
  correlationId: string,
): string {
  const seed = `${annualAssignmentId.toString()}:${correlationId.trim()}`;
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 24);
  return `dynamic:${digest}`;
}

export function normalizeObjectiveRowCoverage(
  terms: AssessmentTermCodeType[],
): AssessmentTermCodeType[] {
  const allowed = Object.values(AssessmentTermCode) as AssessmentTermCodeType[];
  const unique = new Set(terms.filter((term) => allowed.includes(term)));
  return allowed.filter((term) => unique.has(term));
}

export function futureCoveredObjectiveTerms(
  coverage: AssessmentTermCodeType[],
  currentTermCode: AssessmentTermCodeType,
): AssessmentTermCodeType[] {
  const normalized = normalizeObjectiveRowCoverage(coverage);
  const currentIndex = normalized.indexOf(currentTermCode);
  return currentIndex < 0 ? [] : normalized.slice(currentIndex + 1);
}

function customColumnValues(
  values?: Record<string, unknown>,
  columnBindingKeyById?: Record<string, string>,
) {
  return Object.entries(values || {}).flatMap(([valueKey, value]) => {
    const matchingColumn = Object.entries(columnBindingKeyById || {}).find(
      ([, bindingKey]) => bindingKey === valueKey,
    );
    const columnId = columnBindingKeyById?.[valueKey]
      ? valueKey
      : matchingColumn?.[0] ?? valueKey;
    const fieldKey = columnBindingKeyById?.[columnId] ?? valueKey;
    if (
      fieldKey.startsWith('objective.') ||
      fieldKey.startsWith('formula.') ||
      fieldKey.startsWith('system.')
    ) return [];
    return [{ columnId, fieldKey, value }];
  });
}

function typedObjectiveValue(value: unknown, columnType?: string) {
  if (value === undefined) return {};
  if (columnType === 'DATE' && value) {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) return { valueDate: date };
  }
  if (typeof value === 'number') return { valueNumber: value };
  if (typeof value === 'string') return { valueText: value };
  if (typeof value === 'boolean') return { valueJson: value };
  return { valueJson: value };
}

export async function upsertObjectiveRowSeedEntries(
  entries: ObjectiveRowSeedEntry[],
  actorUserId: Types.ObjectId,
  session?: ClientSession,
): Promise<{ objectiveIds: string[]; termAssignmentIds: Set<string> }> {
  if (!entries.length) return { objectiveIds: [], termAssignmentIds: new Set<string>() };
  const operations = entries.map((entry) => {
    const insertPayload: Record<string, unknown> = {
      ...entry.payload,
      annualAssignmentId: entry.annualAssignmentId,
      termAssignmentId: entry.termAssignmentId,
      assessmentTermCode: entry.assessmentTermCode,
    };
    delete insertPayload.objectiveRowKey;
    delete insertPayload.rowOriginTermCode;
    delete insertPayload.rowCoverage;
    delete insertPayload.rowGroupKey;
    delete insertPayload.rowOrder;
    const identity: Record<string, unknown> = {
      objectiveRowKey: entry.objectiveRowKey,
      rowOriginTermCode: entry.rowOriginTermCode,
      rowCoverage: entry.rowCoverage,
    };
    if (entry.rowGroupKey !== undefined) identity.rowGroupKey = entry.rowGroupKey;
    if (entry.rowOrder !== undefined) identity.rowOrder = entry.rowOrder;
    return { updateOne: {
      filter: {
        isDeleted: false,
        $or: [
          {
            annualAssignmentId: entry.annualAssignmentId,
            objectiveRowKey: entry.objectiveRowKey,
            assessmentTermCode: entry.assessmentTermCode,
          },
          ...(entry.templateObjectiveKey ? [{
            termAssignmentId: entry.termAssignmentId,
            templateObjectiveKey: entry.templateObjectiveKey,
          }] : []),
        ],
      },
      update: {
        $set: identity,
        $setOnInsert: insertPayload,
      },
      upsert: true,
    } };
  });
  await Objective.bulkWrite(operations, { ordered: false, session });

  let objectiveQuery = Objective.find({
    isDeleted: false,
    $or: entries.map((entry) => ({
      annualAssignmentId: entry.annualAssignmentId,
      objectiveRowKey: entry.objectiveRowKey,
      assessmentTermCode: entry.assessmentTermCode,
    })),
  });
  if (session) objectiveQuery = objectiveQuery.session(session);
  const objectives = await objectiveQuery.lean();
  const objectiveByIdentity = new Map(
    objectives.map((objective) => [
      `${objective.annualAssignmentId?.toString()}:${objective.objectiveRowKey}:${objective.assessmentTermCode}`,
      objective,
    ]),
  );

  const valueOperations = entries.flatMap((entry) => {
    const objective = objectiveByIdentity.get(
      `${entry.annualAssignmentId.toString()}:${entry.objectiveRowKey}:${entry.assessmentTermCode}`,
    );
    if (!objective) return [];
    const seedActorUserId = objective.createdByUserId ?? actorUserId;
    return customColumnValues(entry.columnValues, entry.columnBindingKeyById).map(
      ({ columnId, fieldKey, value }) => ({
      updateOne: {
        filter: {
          objectiveId: objective._id,
          fieldKey,
          roleCode: 'SYSTEM',
          actorUserId: seedActorUserId,
          workflowStage: 'OBJECTIVE_SETTING',
          isDeleted: false,
        },
        update: {
          $setOnInsert: {
            objectiveId: objective._id,
            termAssignmentId: entry.termAssignmentId,
            annualAssignmentId: entry.annualAssignmentId,
            cycleId: objective.cycleId,
            employeeId: objective.employeeId,
            templateFieldId: columnId,
            fieldKey,
            sectionKey: entry.sectionKey,
            roleCode: 'SYSTEM',
            actorUserId: seedActorUserId,
            workflowStage: 'OBJECTIVE_SETTING',
            ...typedObjectiveValue(value, entry.columnTypeById?.[columnId]),
            valueStatus: 'ACTIVE',
            isDeleted: false,
            createdBy: seedActorUserId,
            updatedBy: seedActorUserId,
            version: 1,
          },
        },
        upsert: true,
      },
      }),
    );
  });
  if (valueOperations.length) {
    await ObjectiveValue.bulkWrite(valueOperations, { ordered: false, session });
  }

  return {
    objectiveIds: objectives.map((objective) => objective._id.toString()),
    termAssignmentIds: new Set(entries.map((entry) => entry.termAssignmentId.toString())),
  };
}

export async function createDynamicObjectiveRowWithCoverage(
  input: DynamicObjectiveCoverageInput,
): Promise<{ objectiveRowKey: string; objectiveIds: string[]; coverage: AssessmentTermCodeType[] }> {
  const coverage = normalizeObjectiveRowCoverage(input.selectedCoverage);
  if (!coverage.length || !coverage.includes(input.currentTermCode)) {
    throw new Error('Dynamic objective row coverage must include the current term');
  }
  const targetByTerm = new Map(
    input.termTargets.map((target) => [target.assessmentTermCode, target]),
  );
  const missingTerm = coverage.find((term) => !targetByTerm.has(term));
  if (missingTerm) throw new Error(`Term assignment is missing for ${missingTerm}`);
  const correlationId = input.correlationId.trim();
  if (!correlationId) {
    throw new Error('A client correlation id is required to create a covered objective row');
  }
  const objectiveRowKey = deterministicDynamicObjectiveRowKey(
    input.annualAssignmentId,
    correlationId,
  );
  const entries: ObjectiveRowSeedEntry[] = coverage.map((term) => {
    const target = targetByTerm.get(term)!;
    return {
      annualAssignmentId: input.annualAssignmentId,
      termAssignmentId: target.termAssignmentId,
      assessmentTermCode: term,
      objectiveRowKey,
      rowOriginTermCode: input.currentTermCode,
      rowCoverage: coverage,
      rowGroupKey: input.rowGroupKey,
      sectionKey: input.sectionKey,
      columnValues: input.columnValues,
      columnBindingKeyById: input.columnBindingKeyById,
      columnTypeById: input.columnTypeById,
      payload: {
        ...target.payload,
        annualAssignmentId: input.annualAssignmentId,
        termAssignmentId: target.termAssignmentId,
        assessmentTermCode: term,
        objectiveRowKey,
        rowOriginTermCode: input.currentTermCode,
        rowCoverage: coverage,
        rowGroupKey: input.rowGroupKey,
        rowCreationCorrelationId: correlationId,
      },
    };
  });

  const session = await mongoose.startSession();
  try {
    let objectiveIds: string[] = [];
    await session.withTransaction(async () => {
      const result = await upsertObjectiveRowSeedEntries(entries, input.actorUserId, session);
      objectiveIds = result.objectiveIds;
    });
    return { objectiveRowKey, objectiveIds, coverage };
  } finally {
    await session.endSession();
  }
}

export function predefinedObjectiveSeedEntry(input: {
  sectionKey: string;
  objectiveKey: string;
  annualAssignmentId: Types.ObjectId;
  termAssignmentId: Types.ObjectId;
  assessmentTermCode: AssessmentTermCodeType;
  coverage: AssessmentTermCodeType[];
  rowGroupKey?: string;
  rowOrder?: number;
  columnValues?: Record<string, unknown>;
  columnBindingKeyById?: Record<string, string>;
  columnTypeById?: Record<string, string>;
  payload: Record<string, unknown>;
}): ObjectiveRowSeedEntry {
  const coverage = normalizeObjectiveRowCoverage(input.coverage);
  return {
    annualAssignmentId: input.annualAssignmentId,
    termAssignmentId: input.termAssignmentId,
    assessmentTermCode: input.assessmentTermCode,
    objectiveRowKey: deterministicPredefinedObjectiveRowKey(input.sectionKey, input.objectiveKey),
    templateObjectiveKey: input.objectiveKey,
    rowOriginTermCode: coverage[0] || input.assessmentTermCode,
    rowCoverage: coverage,
    rowGroupKey: input.rowGroupKey,
    rowOrder: input.rowOrder,
    sectionKey: input.sectionKey,
    columnValues: input.columnValues,
    columnBindingKeyById: input.columnBindingKeyById,
    columnTypeById: input.columnTypeById,
    payload: {
      ...input.payload,
      annualAssignmentId: input.annualAssignmentId,
      termAssignmentId: input.termAssignmentId,
      assessmentTermCode: input.assessmentTermCode,
      source: ObjectiveSource.PREDEFINED,
      templateObjectiveKey: input.objectiveKey,
      objectiveRowKey: deterministicPredefinedObjectiveRowKey(input.sectionKey, input.objectiveKey),
      rowOriginTermCode: coverage[0] || input.assessmentTermCode,
      rowCoverage: coverage,
      rowGroupKey: input.rowGroupKey,
      rowOrder: input.rowOrder,
      isPredefined: true,
    },
  };
}
