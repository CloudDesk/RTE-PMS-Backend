import mongoose, { Types } from 'mongoose';
import {
  AssessmentTermCode,
  AssessmentTermType,
  ObjectiveSource,
  ObjectiveStatus,
  PmsRole,
  PmsTemplateSectionType,
  TermWorkflowState,
} from '../../src/constants/pms.enums';
import { AnnualAssignment } from '../../src/models/pms-annual-assignment.model';
import { Objective } from '../../src/models/pms-objective.model';
import { ObjectiveValue } from '../../src/models/pms-objective-value.model';
import { PmsTemplateVersion } from '../../src/models/pms-template-version.model';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { auditService } from '../../src/services/audit.service';
import { ObjectiveMatrixService } from '../../src/services/objective-matrix.service';
import {
  defaultObjectiveRowCoverage,
  normalizeObjectiveMatrixValue,
  ObjectiveMatrixWriteService,
  resolveObjectiveMatrixCreateRole,
  validateObjectiveMatrixCreateRequiredValues,
} from '../../src/services/objective-matrix-write.service';
import type { AnnualObjectiveMatrixResponse } from '../../src/types/pms-objective-matrix';

describe('Objective matrix write model Phase 6', () => {
  afterEach(() => jest.restoreAllMocks());

  it('normalizes supported values and rejects invalid/calculated values', () => {
    const base = {
      columnId: 'value', bindingKey: 'custom.value', label: 'Value', displayOrder: 1,
      fillOwner: 'MANAGER' as const, workflowStage: 'MANAGER_REVIEW' as const,
    };
    expect(normalizeObjectiveMatrixValue({ ...base, type: 'SHORT_TEXT' }, '  Ready  ')).toBe('Ready');
    expect(normalizeObjectiveMatrixValue({ ...base, type: 'NUMERIC_INPUT' }, 42)).toBe(42);
    expect(normalizeObjectiveMatrixValue({ ...base, type: 'BOOLEAN' }, false)).toBe(false);
    expect(normalizeObjectiveMatrixValue({ ...base, type: 'DATE' }, '2026-07-18')).toBeInstanceOf(Date);
    expect(() => normalizeObjectiveMatrixValue({ ...base, type: 'NUMERIC_INPUT' }, '42'))
      .toThrow('must be a finite number');
    expect(() => normalizeObjectiveMatrixValue({ ...base, type: 'FORMULA' }, 42))
      .toThrow('is calculated and cannot be changed');
  });

  it('carries employee-created objectives through remaining terms only', () => {
    const terms = [
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
    ];
    expect(defaultObjectiveRowCoverage(PmsRole.EMPLOYEE, AssessmentTermCode.Q1, terms)).toEqual(terms);
    expect(defaultObjectiveRowCoverage(PmsRole.EMPLOYEE, AssessmentTermCode.Q3, terms)).toEqual([
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
    ]);
    expect(defaultObjectiveRowCoverage(PmsRole.EMPLOYEE, AssessmentTermCode.Q4, terms)).toEqual([
      AssessmentTermCode.Q4,
    ]);
    expect(defaultObjectiveRowCoverage(PmsRole.MANAGER, AssessmentTermCode.Q2, terms)).toEqual([
      AssessmentTermCode.Q2,
    ]);
  });

  it('uses employee row permissions when a Manager-role user creates on their own assignment', () => {
    const managerEmployeeId = new Types.ObjectId().toString();

    expect(resolveObjectiveMatrixCreateRole({
      actorId: managerEmployeeId,
      actorRole: PmsRole.MANAGER,
      employeeId: managerEmployeeId,
      source: ObjectiveSource.EMPLOYEE_CREATED,
    })).toBe(PmsRole.EMPLOYEE);

    expect(resolveObjectiveMatrixCreateRole({
      actorId: managerEmployeeId,
      actorRole: PmsRole.MANAGER,
      employeeId: new Types.ObjectId().toString(),
      source: ObjectiveSource.EMPLOYEE_CREATED,
    })).toBeUndefined();

    expect(resolveObjectiveMatrixCreateRole({
      actorId: managerEmployeeId,
      actorRole: PmsRole.ADMIN,
      employeeId: managerEmployeeId,
      source: ObjectiveSource.EMPLOYEE_CREATED,
    })).toBeUndefined();
  });

  it('validates only fields configured as required when adding a dynamic row', () => {
    const columns = [
      {
        columnId: 'objective', bindingKey: 'objective.title', label: 'Objective', type: 'SHORT_TEXT' as const,
        displayOrder: 1, fillOwner: 'ROW_CREATOR' as const, workflowStage: 'OBJECTIVE_SETTING' as const,
        access: [{ role: PmsRole.EMPLOYEE, visible: true, editable: true, required: true }],
      },
      {
        columnId: 'unit', bindingKey: 'objective.kpi', label: 'Unit of Measure', type: 'SHORT_TEXT' as const,
        displayOrder: 2, fillOwner: 'ROW_CREATOR' as const, workflowStage: 'OBJECTIVE_SETTING' as const,
        access: [{ role: PmsRole.EMPLOYEE, visible: true, editable: true, required: false }],
      },
      {
        columnId: 'benchmark', bindingKey: 'custom.benchmark', label: 'Benchmark', type: 'NUMERIC_INPUT' as const,
        displayOrder: 3, fillOwner: 'ROW_CREATOR' as const, workflowStage: 'OBJECTIVE_SETTING' as const,
        access: [{ role: PmsRole.EMPLOYEE, visible: true, editable: true, required: true }],
      },
      {
        columnId: 'actual', bindingKey: 'custom.actual', label: 'Actual', type: 'NUMERIC_INPUT' as const,
        displayOrder: 4, fillOwner: 'MANAGER' as const, workflowStage: 'MANAGER_REVIEW' as const,
        required: true,
        access: [{ role: PmsRole.EMPLOYEE, visible: true, editable: true, required: true }],
      },
    ];
    expect(() => validateObjectiveMatrixCreateRequiredValues({
      columns, role: PmsRole.EMPLOYEE, coreValues: { title: 'Improve quality' }, customValues: {},
    })).toThrow('Benchmark is required');
    expect(() => validateObjectiveMatrixCreateRequiredValues({
      columns, role: PmsRole.EMPLOYEE, coreValues: { title: 'Improve quality' },
      customValues: { benchmark: 0 },
    })).not.toThrow();
  });

  it('saves multiple cells atomically with optimistic versions and audit records', async () => {
    const annualAssignmentId = new Types.ObjectId();
    const templateVersionId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const termAssignmentId = new Types.ObjectId();
    const objectiveId = new Types.ObjectId();
    const existingValueId = new Types.ObjectId();
    const rowKey = 'dynamic:phase6';
    const access = [{ role: PmsRole.MANAGER, visible: true, editable: true }];
    const columns = [
      {
        columnId: 'actual', bindingKey: 'custom.actual', label: 'Actual', type: 'NUMERIC_INPUT' as const,
        displayOrder: 1, fillOwner: 'MANAGER' as const, workflowStage: 'MANAGER_REVIEW' as const, access,
      },
      {
        columnId: 'comment', bindingKey: 'custom.comment', label: 'Manager Comment', type: 'LONG_TEXT' as const,
        displayOrder: 2, fillOwner: 'MANAGER' as const, workflowStage: 'MANAGER_REVIEW' as const, access,
      },
    ];
    const matrix = {
      annualAssignmentId: annualAssignmentId.toString(), cycleId: cycleId.toString(),
      employeeId: employeeId.toString(), managerId: managerId.toString(),
      templateVersionId: templateVersionId.toString(), layoutVersion: 1,
      mode: 'manager', viewRole: PmsRole.MANAGER,
      assessmentTermType: AssessmentTermType.QUARTERLY,
      termOrder: [AssessmentTermCode.Q1], currentTermCode: AssessmentTermCode.Q1,
      columns, columnGroups: [], termPolicies: columns.map((column) => ({
        columnId: column.columnId, mode: 'EVERY_REVIEW_PERIOD' as const,
      })),
      dynamicRowPolicy: {
        employeeDefaultScope: 'CURRENT_TERM', managerDefaultScope: 'CURRENT_TERM',
        allowEmployeeTermChoice: false, allowManagerTermChoice: false,
      },
      showRowGroups: false,
      rowGroups: [],
      rows: [{
        objectiveRowKey: rowKey, source: ObjectiveSource.MANAGER_CREATED, title: 'Delivery',
        rowOriginTermCode: AssessmentTermCode.Q1, rowCoverage: [AssessmentTermCode.Q1], rowOrder: 1,
        siblings: [{
          termCode: AssessmentTermCode.Q1, termAssignmentId: termAssignmentId.toString(),
          objectiveId: objectiveId.toString(), status: ObjectiveStatus.OBJECTIVE_APPROVED, version: 2,
        }],
        sharedCells: [],
        termCells: { Q1: columns.map((column, index) => ({
          cellKey: `${rowKey}:Q1:${column.columnId}`,
          columnId: column.columnId, fieldKey: column.bindingKey, kind: 'SOURCE' as const,
          termCode: AssessmentTermCode.Q1, objectiveId: objectiveId.toString(),
          termAssignmentId: termAssignmentId.toString(), value: index === 0 ? 10 : undefined,
          visible: true, editable: true, required: false, recordVersion: 2,
          valueVersion: index === 0 ? 3 : undefined,
        })) },
        evidenceByTerm: {},
        actions: {
          canEdit: false, canDelete: false, canSubmit: false, canApprove: false,
          canReturn: false, canComment: true, canAttach: false,
        },
      }],
      formulaResults: [], calculatedRows: [], evaluationOrder: [], generatedAt: new Date().toISOString(),
      contentVersion: 3, contentHash: 'a'.repeat(64),
    } satisfies AnnualObjectiveMatrixResponse;
    jest.spyOn(ObjectiveMatrixService.prototype, 'getAnnualMatrix').mockResolvedValue(matrix);

    const annual = {
      _id: annualAssignmentId, templateVersionId, cycleId, employeeId, assignedManagerId: managerId,
      applicableTerms: [AssessmentTermCode.Q1], isDeleted: false,
    };
    const assignment = {
      _id: termAssignmentId, annualAssignmentId, cycleId, employeeId, assignedManagerId: managerId,
      assessmentTermCode: AssessmentTermCode.Q1, assessmentTermType: AssessmentTermType.QUARTERLY,
      termState: TermWorkflowState.MANAGER_REVIEW_OPEN, isDeleted: false,
    };
    const objective = {
      _id: objectiveId, annualAssignmentId, termAssignmentId, cycleId, employeeId,
      assignedManagerId: managerId, objectiveRowKey: rowKey, assessmentTermCode: AssessmentTermCode.Q1,
      source: ObjectiveSource.MANAGER_CREATED, status: ObjectiveStatus.OBJECTIVE_APPROVED,
      title: 'Delivery', version: 2, isDeleted: false,
    };
    const layout = {
      enabled: true, layoutVersion: 1, columns, columnGroups: [], rowGroups: [], rowAssignments: [],
      termPolicies: matrix.termPolicies, formulas: [], calculatedRows: [], dynamicRowPolicy: matrix.dynamicRowPolicy,
    };
    const query = <T>(value: T) => ({
      lean: jest.fn().mockResolvedValue(value),
      session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }),
    });
    jest.spyOn(AnnualAssignment, 'findOne').mockReturnValue(query(annual) as never);
    jest.spyOn(PmsTemplateVersion, 'findById').mockReturnValue(query({
      _id: templateVersionId,
      sections: [{
        sectionKey: 'objectives', sectionType: PmsTemplateSectionType.OBJECTIVES,
        objectiveConfig: { tableLayout: layout },
      }],
    }) as never);
    jest.spyOn(TermAssignment, 'find').mockReturnValue(query([assignment]) as never);
    jest.spyOn(TermCycle, 'find').mockReturnValue(query([]) as never);
    jest.spyOn(Objective, 'find').mockReturnValue(query([objective]) as never);
    jest.spyOn(ObjectiveValue, 'find').mockReturnValue({
      sort: jest.fn().mockReturnValue({
        session: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([{
          _id: existingValueId, objectiveId, fieldKey: 'custom.actual', valueNumber: 10, version: 3,
        }]) }),
      }),
    } as never);
    const objectiveUpdate = jest.spyOn(Objective, 'updateOne').mockResolvedValue({ modifiedCount: 1 } as never);
    const valueUpdate = jest.spyOn(ObjectiveValue, 'updateOne').mockResolvedValue({ modifiedCount: 1 } as never);
    const valueCreate = jest.spyOn(ObjectiveValue, 'create').mockResolvedValue([] as never);
    const audit = jest.spyOn(auditService, 'createAuditLog').mockResolvedValue({} as never);
    const withTransaction = jest.fn(async (work: () => Promise<void>) => work());
    jest.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction, endSession: jest.fn().mockResolvedValue(undefined),
    } as never);

    const service = new ObjectiveMatrixWriteService({
      reqRole: PmsRole.MANAGER, requestId: 'phase-6',
      user: {
        _id: managerId, email: 'manager@example.test', name: 'Manager', role: PmsRole.MANAGER,
        departmentId: 'operations', active: true, country: 'IN', currency: 'INR',
        licenseType: 'FULL', portalAccess: true,
      },
    });
    const result = await service.saveCells(annualAssignmentId.toString(), { changes: [
      {
        objectiveRowKey: rowKey, objectiveId: objectiveId.toString(),
        termAssignmentId: termAssignmentId.toString(), termCode: AssessmentTermCode.Q1,
        columnId: 'actual', fieldKey: 'custom.actual', value: 25,
        expectedObjectiveVersion: 2, expectedValueVersion: 3,
      },
      {
        objectiveRowKey: rowKey, objectiveId: objectiveId.toString(),
        termAssignmentId: termAssignmentId.toString(), termCode: AssessmentTermCode.Q1,
        columnId: 'comment', fieldKey: 'custom.comment', value: 'On track',
        expectedObjectiveVersion: 2,
      },
    ] });

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(objectiveUpdate).toHaveBeenCalledTimes(1);
    expect(valueUpdate).toHaveBeenCalledTimes(1);
    expect(valueCreate).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(3);
    expect(result.changedCellKeys).toHaveLength(2);
    expect(result.matrix).toBe(matrix);

    objectiveUpdate.mockClear();
    (Objective.find as jest.Mock).mockReturnValue(query([{ ...objective, version: 3 }]));
    await expect(service.saveCells(annualAssignmentId.toString(), { changes: [{
      objectiveRowKey: rowKey, objectiveId: objectiveId.toString(),
      termAssignmentId: termAssignmentId.toString(), termCode: AssessmentTermCode.Q1,
      columnId: 'actual', fieldKey: 'custom.actual', value: 30,
      expectedObjectiveVersion: 2, expectedValueVersion: 3,
    }] })).rejects.toThrow('was changed by another user');
    expect(objectiveUpdate).not.toHaveBeenCalled();
  });
});
