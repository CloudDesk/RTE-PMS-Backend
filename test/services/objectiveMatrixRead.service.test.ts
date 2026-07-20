import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
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
import { accessService } from '../../src/services/access.service';
import {
  isObjectiveMatrixDateWindowOpen,
  isObjectiveMatrixStageWindowOpen,
  ObjectiveMatrixService,
  resolveObjectiveMatrixCellPermission,
  validateObjectiveMatrixRowForSubmit,
} from '../../src/services/objective-matrix.service';

const permissionFixture = JSON.parse(fs.readFileSync(path.resolve(
  process.cwd(),
  'contracts/pms-template-objective-matrix/v1/permission-truth-table.v1.json',
), 'utf8')) as any;

describe('Objective matrix read model Phase 5', () => {
  afterEach(() => jest.restoreAllMocks());

  it('matches the frozen role/state/date permission truth table', () => {
    for (const testCase of permissionFixture.cases) {
      const input = testCase.input;
      const permission = resolveObjectiveMatrixCellPermission({
        role: input.role,
        workflowState: input.workflowState,
        termPosition: input.termPosition,
        windowOpen: input.windowOpen,
        columnFillOwner: input.columnFillOwner,
        columnRequired: input.columnRequired,
        columnType: input.columnType,
        explicitVisibility: input.explicitVisibility,
        explicitEditable: true,
        rowSource: input.role === PmsRole.EMPLOYEE
          ? ObjectiveSource.EMPLOYEE_CREATED
          : ObjectiveSource.MANAGER_CREATED,
      });
      expect(permission).toEqual({
        visible: testCase.expected.visible,
        editable: testCase.expected.editable,
        required: testCase.expected.required,
        ...(testCase.expected.denialReason
          ? { denialReason: testCase.expected.denialReason }
          : {}),
      });
    }
  });

  it('hides manager approval actions outside the effective approval dates', () => {
    const window = {
      startDate: new Date('2026-02-01T00:00:00.000Z'),
      endDate: new Date('2026-02-28T00:00:00.000Z'),
    };
    expect(isObjectiveMatrixDateWindowOpen(window, new Date('2026-01-31T12:00:00.000Z'))).toBe(false);
    expect(isObjectiveMatrixDateWindowOpen(window, new Date('2026-02-14T12:00:00.000Z'))).toBe(true);
    expect(isObjectiveMatrixDateWindowOpen(window, new Date('2026-03-01T12:00:00.000Z'))).toBe(false);
    expect(isObjectiveMatrixDateWindowOpen(undefined, new Date('2026-03-01T12:00:00.000Z'))).toBe(true);
  });

  it('uses an open configured window for the current term even before workflow sync advances the stored state', () => {
    expect(resolveObjectiveMatrixCellPermission({
      role: PmsRole.EMPLOYEE,
      workflowState: TermWorkflowState.NOT_STARTED,
      termPosition: 'CURRENT',
      windowOpen: true,
      columnFillOwner: PmsRole.EMPLOYEE,
      columnRequired: true,
      columnType: 'NUMERIC_INPUT',
      explicitVisibility: 'VISIBLE',
      explicitEditable: true,
      rowSource: ObjectiveSource.EMPLOYEE_CREATED,
    })).toEqual({ visible: true, editable: true, required: true });
  });

  it('keeps employee achievement cells open from objective setting until manager review starts', () => {
    const termCycle = {
      objectiveSettingWindow: { startDate: new Date('2026-07-20T00:00:00.000Z') },
      managerReviewWindow: { startDate: new Date('2026-10-05T00:00:00.000Z') },
    };
    const assignment = { termState: TermWorkflowState.OBJECTIVE_APPROVED };

    expect(isObjectiveMatrixStageWindowOpen({
      stage: 'EMPLOYEE_ACHIEVEMENT',
      assignment,
      termCycle,
      annualAssignment: {},
      now: new Date('2026-09-30T12:00:00.000Z'),
    })).toBe(true);

    expect(isObjectiveMatrixStageWindowOpen({
      stage: 'EMPLOYEE_ACHIEVEMENT',
      assignment: { termState: TermWorkflowState.MANAGER_REVIEW_OPEN },
      termCycle,
      annualAssignment: {},
      now: new Date('2026-10-05T00:00:00.000Z'),
    })).toBe(false);
  });

  it('validates configured employee-required cells instead of legacy objective fields', () => {
    const matrix = {
      columns: [
        { columnId: 'objective', label: 'Objective', workflowStage: 'OBJECTIVE_SETTING' },
        { columnId: 'result', label: 'Q1 Actual', workflowStage: 'MANAGER_REVIEW' },
      ],
      rows: [{
        objectiveRowKey: 'employee:delivery',
        siblings: [{ objectiveId: 'objective-q1', termCode: AssessmentTermCode.Q1 }],
        sharedCells: [{ columnId: 'objective', required: true, value: '' }],
        termCells: {
          Q1: [{ columnId: 'result', required: true, value: undefined }],
        },
      }],
    } as any;

    expect(() => validateObjectiveMatrixRowForSubmit(matrix, {
      objectiveId: 'objective-q1',
      objectiveRowKey: 'employee:delivery',
      termCode: AssessmentTermCode.Q1,
    })).toThrow('Complete required fields before submitting: Objective');

    matrix.rows[0].sharedCells[0].value = 'Improve delivery';
    expect(() => validateObjectiveMatrixRowForSubmit(matrix, {
      objectiveId: 'objective-q1',
      objectiveRowKey: 'employee:delivery',
      termCode: AssessmentTermCode.Q1,
    })).not.toThrow();
  });

  it('joins term siblings, masks columns, resolves term permissions and evaluates formulas', async () => {
    const annualAssignmentId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const templateVersionId = new Types.ObjectId();
    const q1AssignmentId = new Types.ObjectId();
    const q2AssignmentId = new Types.ObjectId();
    const q1ObjectiveId = new Types.ObjectId();
    const q2ObjectiveId = new Types.ObjectId();
    const rowKey = 'predefined:delivery';
    const access = [PmsRole.EMPLOYEE, PmsRole.MANAGER, PmsRole.DIRECTOR, PmsRole.ADMIN, PmsRole.MANAGEMENT]
      .map((role) => ({ role, visible: true, editable: role === PmsRole.MANAGER }));
    const layout = {
      enabled: true,
      layoutVersion: 4,
      columns: [
        {
          columnId: 'objective', bindingKey: 'objective.title', label: 'Objective',
          type: 'SHORT_TEXT', displayOrder: 1, fillOwner: 'ROW_CREATOR',
          workflowStage: 'OBJECTIVE_SETTING', access,
        },
        {
          columnId: 'q1', bindingKey: 'custom.q1Actual', label: 'Q1 Actual',
          type: 'NUMERIC_INPUT', displayOrder: 2, fillOwner: 'MANAGER',
          workflowStage: 'MANAGER_REVIEW', access,
        },
        {
          columnId: 'q2', bindingKey: 'custom.q2Actual', label: 'Q2 Actual',
          type: 'NUMERIC_INPUT', displayOrder: 3, fillOwner: 'MANAGER',
          workflowStage: 'MANAGER_REVIEW', access,
        },
        {
          columnId: 'secret', bindingKey: 'custom.secret', label: 'Secret',
          type: 'SHORT_TEXT', displayOrder: 4, fillOwner: 'ADMIN',
          workflowStage: 'ANNUAL_DECISION',
          access: access.map((entry) => ({ ...entry, visible: entry.role === PmsRole.ADMIN })),
        },
        {
          columnId: 'actual', bindingKey: 'formula.actual', label: 'Actual',
          type: 'FORMULA', displayOrder: 5, fillOwner: 'SYSTEM',
          workflowStage: 'CALCULATED', access: access.map((entry) => ({ ...entry, editable: false })),
        },
      ],
      columnGroups: [{
        groupId: 'results', label: 'Results',
        columnIds: ['q1', 'q2', 'secret', 'actual'], displayOrder: 1,
      }],
      rowGroups: [{
        rowGroupKey: 'company', label: 'Company Objectives', source: 'PREDEFINED', displayOrder: 1,
      }],
      rowAssignments: [{ objectiveKey: 'delivery', rowGroupKey: 'company', displayOrder: 1 }],
      termPolicies: [
        { columnId: 'objective', mode: 'SHARED_ANNUAL' },
        { columnId: 'q1', mode: 'SELECTED_PERIODS', selectedTerms: [AssessmentTermCode.Q1] },
        { columnId: 'q2', mode: 'SELECTED_PERIODS', selectedTerms: [AssessmentTermCode.Q2] },
        { columnId: 'secret', mode: 'SHARED_ANNUAL' },
        { columnId: 'actual', mode: 'SHARED_ANNUAL' },
      ],
      formulas: [{
        formulaId: 'actual', targetColumnId: 'actual', scope: 'ROW_ACROSS_TERMS',
        ast: {
          type: 'FUNCTION', name: 'LATEST_FILLED_TERM',
          arguments: [
            { type: 'COLUMN', columnId: 'q1' },
            { type: 'COLUMN', columnId: 'q2' },
          ],
        },
        emptyPolicy: 'IGNORE', divideByZeroPolicy: 'NULL', decimalPrecision: 2,
      }],
      calculatedRows: [],
      dynamicRowPolicy: {
        employeeDefaultScope: 'CURRENT_TERM', managerDefaultScope: 'CURRENT_TERM',
        allowEmployeeTermChoice: false, allowManagerTermChoice: false,
      },
    };
    const annual = {
      _id: annualAssignmentId, employeeId, assignedManagerId: managerId, cycleId,
      templateVersionId, applicableTerms: [AssessmentTermCode.Q1, AssessmentTermCode.Q2],
      assignmentWindowSnapshot: {}, isDeleted: false, version: 2,
    };
    const terms = [
      {
        _id: q1AssignmentId, annualAssignmentId, employeeId, assignedManagerId: managerId,
        assessmentTermCode: AssessmentTermCode.Q1, assessmentTermType: AssessmentTermType.QUARTERLY,
        termState: TermWorkflowState.MANAGER_REVIEW_OPEN, version: 3,
      },
      {
        _id: q2AssignmentId, annualAssignmentId, employeeId, assignedManagerId: managerId,
        assessmentTermCode: AssessmentTermCode.Q2, assessmentTermType: AssessmentTermType.QUARTERLY,
        termState: TermWorkflowState.MANAGER_REVIEW_OPEN, version: 1,
      },
    ];
    const objectives = [
      {
        _id: q1ObjectiveId, annualAssignmentId, termAssignmentId: q1AssignmentId,
        assessmentTermCode: AssessmentTermCode.Q1, objectiveRowKey: rowKey,
        rowOriginTermCode: AssessmentTermCode.Q1, rowGroupKey: 'company', rowOrder: 1,
        source: ObjectiveSource.PREDEFINED, title: 'Delivery', status: ObjectiveStatus.OBJECTIVE_APPROVED,
        version: 3, createdAt: new Date('2026-01-01'),
      },
      {
        _id: q2ObjectiveId, annualAssignmentId, termAssignmentId: q2AssignmentId,
        assessmentTermCode: AssessmentTermCode.Q2, objectiveRowKey: rowKey,
        rowOriginTermCode: AssessmentTermCode.Q1, rowGroupKey: 'company', rowOrder: 1,
        source: ObjectiveSource.PREDEFINED, title: 'Delivery', status: ObjectiveStatus.OBJECTIVE_APPROVED,
        version: 2, createdAt: new Date('2026-04-01'),
      },
    ];
    const values = [
      {
        _id: new Types.ObjectId(), objectiveId: q1ObjectiveId, fieldKey: 'custom.q1Actual',
        templateFieldId: 'q1', valueNumber: 20, version: 2, updatedAt: new Date('2026-02-01'),
      },
      {
        _id: new Types.ObjectId(), objectiveId: q2ObjectiveId, fieldKey: 'custom.q2Actual',
        templateFieldId: 'q2', valueNumber: 30, version: 1, updatedAt: new Date('2026-05-01'),
      },
    ];

    jest.spyOn(accessService, 'canPerform').mockResolvedValue({ allowed: true, mappedRole: PmsRole.MANAGER });
    jest.spyOn(AnnualAssignment, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue(annual) } as never);
    jest.spyOn(PmsTemplateVersion, 'findById').mockReturnValue({ lean: jest.fn().mockResolvedValue({
      _id: templateVersionId,
      sections: [{ sectionType: PmsTemplateSectionType.OBJECTIVES, objectiveConfig: { tableLayout: layout } }],
    }) } as never);
    jest.spyOn(TermAssignment, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue(terms) } as never);
    jest.spyOn(TermCycle, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as never);
    jest.spyOn(Objective, 'find').mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(objectives) }),
    } as never);
    jest.spyOn(ObjectiveValue, 'find').mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(values) }),
    } as never);
    const service = new ObjectiveMatrixService({
      reqRole: PmsRole.MANAGER,
      requestId: 'phase-5',
      user: {
        _id: managerId, email: 'manager@example.test', name: 'Manager', role: PmsRole.MANAGER,
        departmentId: 'operations', active: true, country: 'IN', currency: 'INR',
        licenseType: 'FULL', portalAccess: true,
      },
    });

    const matrix = await service.getAnnualMatrix(annualAssignmentId.toString(), { mode: 'manager' });

    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0].siblings.map((sibling) => sibling.termCode)).toEqual([
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q2,
    ]);
    expect(matrix.columns.map((column) => column.columnId)).not.toContain('secret');
    expect(matrix.columnGroups[0].columnIds).toEqual(['q1', 'q2', 'actual']);
    expect(matrix.rows[0].termCells.Q1?.find((cell) => cell.columnId === 'q1')).toMatchObject({
      value: 20, editable: true, required: false,
    });
    expect(matrix.rows[0].termCells.Q2?.find((cell) => cell.columnId === 'q2')).toMatchObject({
      value: 30, editable: false, denialReason: 'TERM_NOT_OPEN',
    });
    expect(matrix.rows[0].sharedCells.find((cell) => cell.columnId === 'actual')).toMatchObject({
      value: 30, kind: 'FORMULA', editable: false, denialReason: 'SYSTEM_CALCULATED',
    });
    expect(matrix.formulaResults[0].sourceVersions).toEqual(expect.objectContaining({
      [`${rowKey}:Q1:q1`]: 2,
      [`${rowKey}:Q2:q2`]: 1,
    }));
    expect(matrix.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const repeated = await service.getAnnualMatrix(annualAssignmentId.toString(), { mode: 'manager' });
    expect(repeated.contentHash).toBe(matrix.contentHash);

    const q2Matrix = await service.getAnnualMatrix(annualAssignmentId.toString(), {
      mode: 'manager',
      termAssignmentId: q2AssignmentId.toString(),
    });
    expect(q2Matrix.currentTermCode).toBe(AssessmentTermCode.Q2);
    expect(q2Matrix.rows[0].termCells.Q2?.find((cell) => cell.columnId === 'q2')).toMatchObject({
      value: 30, editable: true,
    });

    await expect(service.getAnnualMatrix(annualAssignmentId.toString(), {
      mode: 'manager',
      termAssignmentId: new Types.ObjectId().toString(),
    })).rejects.toThrow('Selected term does not belong to the annual assignment');
  });
});
