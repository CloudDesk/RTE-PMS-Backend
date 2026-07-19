import mongoose, { Types } from 'mongoose';
import { AssessmentTermCode } from '../../src/constants/pms.enums';
import { Objective } from '../../src/models/pms-objective.model';
import { ObjectiveValue } from '../../src/models/pms-objective-value.model';
import {
  deterministicDynamicObjectiveRowKey,
  deterministicPredefinedObjectiveRowKey,
  normalizeObjectiveRowCoverage,
  predefinedObjectiveSeedEntry,
  upsertObjectiveRowSeedEntries,
  createDynamicObjectiveRowWithCoverage,
} from '../../src/services/objective-assignment-seeding.service';

describe('Objective assignment row seeding Phase 4', () => {
  const annualAssignmentId = new Types.ObjectId();
  const actorUserId = new Types.ObjectId();

  afterEach(() => jest.restoreAllMocks());

  it('uses one immutable predefined row key for all term siblings', () => {
    const q1 = predefinedObjectiveSeedEntry({
      sectionKey: 'objectives',
      objectiveKey: 'delivery',
      annualAssignmentId,
      termAssignmentId: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q1,
      coverage: [AssessmentTermCode.Q4, AssessmentTermCode.Q1, AssessmentTermCode.Q2],
      payload: {},
    });
    const q2 = predefinedObjectiveSeedEntry({
      sectionKey: 'objectives',
      objectiveKey: 'delivery',
      annualAssignmentId,
      termAssignmentId: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q2,
      coverage: [AssessmentTermCode.Q1, AssessmentTermCode.Q2, AssessmentTermCode.Q4],
      payload: {},
    });

    expect(q1.objectiveRowKey).toBe(q2.objectiveRowKey);
    expect(q1.rowCoverage).toEqual([AssessmentTermCode.Q1, AssessmentTermCode.Q2, AssessmentTermCode.Q4]);
    expect(q1.rowOriginTermCode).toBe(AssessmentTermCode.Q1);
    expect(deterministicPredefinedObjectiveRowKey('another-section', 'delivery'))
      .not.toBe(q1.objectiveRowKey);
  });

  it('normalizes coverage and creates retry-stable dynamic row keys', () => {
    expect(normalizeObjectiveRowCoverage([
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q3,
    ])).toEqual([AssessmentTermCode.Q1, AssessmentTermCode.Q3]);
    expect(deterministicDynamicObjectiveRowKey(annualAssignmentId, 'request-42'))
      .toBe(deterministicDynamicObjectiveRowKey(annualAssignmentId, 'request-42'));
    expect(deterministicDynamicObjectiveRowKey(annualAssignmentId, 'request-43'))
      .not.toBe(deterministicDynamicObjectiveRowKey(annualAssignmentId, 'request-42'));
  });

  it('uses idempotent objective/value upserts and maps custom cells by binding key', async () => {
    const termAssignmentId = new Types.ObjectId();
    const objectiveId = new Types.ObjectId();
    const entry = predefinedObjectiveSeedEntry({
      sectionKey: 'objectives',
      objectiveKey: 'delivery',
      annualAssignmentId,
      termAssignmentId,
      assessmentTermCode: AssessmentTermCode.Q1,
      coverage: [AssessmentTermCode.Q1],
      columnValues: { 'objective.title': 'Core title', 'custom.benchmark': 95 },
      columnBindingKeyById: {
        objective_column: 'objective.title',
        custom_column: 'custom.benchmark',
      },
      columnTypeById: { custom_column: 'NUMERIC_INPUT' },
      payload: {
        cycleId: new Types.ObjectId(),
        employeeId: new Types.ObjectId(),
        assignedManagerId: new Types.ObjectId(),
        objectiveNo: 1,
        title: 'Delivery',
        status: 'OBJECTIVE_APPROVED',
        createdByRole: 'SYSTEM',
        createdByUserId: actorUserId,
        createdBy: actorUserId,
      },
    });
    const objectiveBulkWrite = jest.spyOn(Objective, 'bulkWrite').mockResolvedValue({} as never);
    const lean = jest.fn().mockResolvedValue([{
      _id: objectiveId,
      annualAssignmentId,
      objectiveRowKey: entry.objectiveRowKey,
      assessmentTermCode: AssessmentTermCode.Q1,
      cycleId: entry.payload.cycleId,
      employeeId: entry.payload.employeeId,
    }]);
    jest.spyOn(Objective, 'find').mockReturnValue({ lean } as never);
    const valueBulkWrite = jest.spyOn(ObjectiveValue, 'bulkWrite').mockResolvedValue({} as never);

    await upsertObjectiveRowSeedEntries([entry], actorUserId);
    await upsertObjectiveRowSeedEntries([entry], actorUserId);

    expect(objectiveBulkWrite).toHaveBeenCalledTimes(2);
    const objectiveOperation = objectiveBulkWrite.mock.calls[0][0][0] as any;
    expect(objectiveOperation.updateOne.upsert).toBe(true);
    expect(objectiveOperation.updateOne.filter.$or[0]).toEqual(expect.objectContaining({
      annualAssignmentId,
      objectiveRowKey: entry.objectiveRowKey,
      assessmentTermCode: AssessmentTermCode.Q1,
    }));
    expect(objectiveOperation.updateOne.update.$setOnInsert).toEqual(expect.objectContaining({
      annualAssignmentId,
      termAssignmentId,
      assessmentTermCode: AssessmentTermCode.Q1,
    }));
    expect(valueBulkWrite).toHaveBeenCalledTimes(2);
    const valueOperations = valueBulkWrite.mock.calls[0][0] as any[];
    expect(valueOperations).toHaveLength(1);
    expect(valueOperations[0].updateOne).toEqual(expect.objectContaining({
      upsert: true,
      filter: expect.objectContaining({ fieldKey: 'custom.benchmark' }),
      update: { $setOnInsert: expect.objectContaining({
        templateFieldId: 'custom_column',
        valueNumber: 95,
      }) },
    }));
  });

  it('creates all selected dynamic term siblings inside one transaction', async () => {
    const q1AssignmentId = new Types.ObjectId();
    const q2AssignmentId = new Types.ObjectId();
    const withTransaction = jest.fn(async (callback: () => Promise<void>) => callback());
    const endSession = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction,
      endSession,
    } as never);
    const objectiveBulkWrite = jest.spyOn(Objective, 'bulkWrite').mockResolvedValue({} as never);
    const lean = jest.fn().mockImplementation(async () => {
      const operations = objectiveBulkWrite.mock.calls[0][0] as any[];
      return operations.map((operation, index) => ({
        _id: new Types.ObjectId(),
        annualAssignmentId,
        objectiveRowKey: operation.updateOne.update.$set.objectiveRowKey,
        assessmentTermCode: index === 0 ? AssessmentTermCode.Q1 : AssessmentTermCode.Q2,
        cycleId: new Types.ObjectId(),
        employeeId: new Types.ObjectId(),
        createdByUserId: actorUserId,
      }));
    });
    jest.spyOn(Objective, 'find').mockReturnValue({
      session: jest.fn().mockReturnValue({ lean }),
    } as never);

    const result = await createDynamicObjectiveRowWithCoverage({
      annualAssignmentId,
      currentTermCode: AssessmentTermCode.Q1,
      selectedCoverage: [AssessmentTermCode.Q1, AssessmentTermCode.Q2],
      correlationId: 'client-request-7',
      sectionKey: 'objectives',
      actorUserId,
      termTargets: [
        {
          termAssignmentId: q1AssignmentId,
          assessmentTermCode: AssessmentTermCode.Q1,
          payload: { title: 'Covered row' },
        },
        {
          termAssignmentId: q2AssignmentId,
          assessmentTermCode: AssessmentTermCode.Q2,
          payload: { title: 'Covered row' },
        },
      ],
    });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(objectiveBulkWrite.mock.calls[0][0]).toHaveLength(2);
    expect(result.coverage).toEqual([AssessmentTermCode.Q1, AssessmentTermCode.Q2]);
    expect(result.objectiveIds).toHaveLength(2);
    const rowKeys = (objectiveBulkWrite.mock.calls[0][0] as any[])
      .map((operation) => operation.updateOne.update.$set.objectiveRowKey);
    expect(new Set(rowKeys).size).toBe(1);
  });

  it('registers the active sibling uniqueness indexes', () => {
    const indexes = Objective.schema.indexes();
    expect(indexes).toEqual(expect.arrayContaining([
      expect.arrayContaining([
        expect.objectContaining({
          annualAssignmentId: 1,
          objectiveRowKey: 1,
          assessmentTermCode: 1,
          isDeleted: 1,
        }),
        expect.objectContaining({ unique: true, name: 'uq_objective_annual_row_term_active' }),
      ]),
      expect.arrayContaining([
        expect.objectContaining({ termAssignmentId: 1, objectiveRowKey: 1, isDeleted: 1 }),
        expect.objectContaining({ unique: true, name: 'uq_objective_term_row_active' }),
      ]),
    ]));
  });
});
