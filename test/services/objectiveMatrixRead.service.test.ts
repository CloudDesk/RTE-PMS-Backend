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
import { ObjectiveAttachment } from '../../src/models/pms-objective-attachment.model';
import { ObjectiveEvidence } from '../../src/models/pms-objective-evidence.model';
import { Objective } from '../../src/models/pms-objective.model';
import { ObjectiveValue } from '../../src/models/pms-objective-value.model';
import { PmsTemplateVersion } from '../../src/models/pms-template-version.model';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { accessService } from '../../src/services/access.service';
import {
  isObjectiveMatrixDateWindowOpen,
  isGlobalDirectorObjectiveRead,
  isObjectiveMatrixStageWindowOpen,
  ObjectiveMatrixService,
  resolveObjectiveMatrixCellPermission,
  resolveObjectiveTermEvidencePermission,
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

  it('grants only Director the global objective-matrix read exception', async () => {
    expect(isGlobalDirectorObjectiveRead(PmsRole.DIRECTOR)).toBe(true);
    expect(isGlobalDirectorObjectiveRead(PmsRole.ADMIN)).toBe(false);
    expect(isGlobalDirectorObjectiveRead(PmsRole.MANAGER)).toBe(false);
    expect(isGlobalDirectorObjectiveRead(PmsRole.EMPLOYEE)).toBe(false);
    expect(isGlobalDirectorObjectiveRead(PmsRole.MANAGEMENT)).toBe(false);

    const access = jest.spyOn(accessService, 'canPerform').mockResolvedValue({
      allowed: false,
      mappedRole: PmsRole.DIRECTOR,
      message: 'Hierarchy denied',
    });
    const service = new ObjectiveMatrixService({} as any);
    await expect((service as any).assertAccess(
      { actorId: new Types.ObjectId().toString(), actorRole: PmsRole.DIRECTOR },
      {
        _id: new Types.ObjectId(),
        employeeId: new Types.ObjectId(),
        assignedManagerId: new Types.ObjectId(),
        cycleId: new Types.ObjectId(),
      },
    )).resolves.toBeUndefined();
    expect(access).not.toHaveBeenCalled();

    expect(resolveObjectiveMatrixCellPermission({
      role: PmsRole.DIRECTOR,
      workflowState: TermWorkflowState.MANAGER_REVIEW_OPEN,
      termPosition: 'CURRENT',
      windowOpen: true,
      columnFillOwner: PmsRole.MANAGER,
      columnRequired: true,
      columnType: 'LONG_TEXT',
      explicitVisibility: 'VISIBLE',
      explicitEditable: true,
      rowSource: ObjectiveSource.MANAGER_CREATED,
    })).toEqual({
      visible: true,
      editable: false,
      required: false,
      denialReason: 'ROLE_READ_ONLY',
    });
  });

  it('allows a Manager-role user only when explicitly assigned as the Final Reviewer', async () => {
    const reviewerId = new Types.ObjectId();
    const access = jest.spyOn(accessService, 'canPerform').mockResolvedValue({
      allowed: false,
      mappedRole: PmsRole.MANAGER,
      message: 'Managers can access only assigned employee PMS records.',
    });
    const service = new ObjectiveMatrixService({} as any);
    const assignment = {
      _id: new Types.ObjectId(),
      employeeId: new Types.ObjectId(),
      assignedManagerId: new Types.ObjectId(),
      finalReviewerId: reviewerId,
      cycleId: new Types.ObjectId(),
    };

    await expect((service as any).assertAccess(
      { actorId: reviewerId.toString(), actorRole: PmsRole.MANAGER },
      assignment,
      'reviewer',
    )).resolves.toBeUndefined();
    expect(access).not.toHaveBeenCalled();

    expect((service as any).resolveView(
      { actorId: reviewerId.toString(), actorRole: PmsRole.MANAGER },
      'reviewer',
      true,
    )).toMatchObject({
      mode: 'reviewer',
      viewRole: PmsRole.DIRECTOR,
      permissionRole: PmsRole.DIRECTOR,
    });
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

  it('allows global Director matrix reads while keeping matrix cells read-only', async () => {
    const actorId = new Types.ObjectId();
    const accessCheck = jest.spyOn(accessService, 'canPerform');
    const service = new ObjectiveMatrixService({
      reqRole: PmsRole.DIRECTOR,
      requestId: 'director-global-matrix-read',
      user: {
        _id: actorId,
        email: 'director@example.test',
        name: 'Director',
        role: PmsRole.DIRECTOR,
        departmentId: 'management',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    });

    await expect(
      (service as any).assertAccess(
        { actorId: actorId.toString(), actorRole: PmsRole.DIRECTOR },
        {
          employeeId: new Types.ObjectId(),
          assignedManagerId: new Types.ObjectId(),
          cycleId: new Types.ObjectId(),
        },
      ),
    ).resolves.toBeUndefined();
    expect(accessCheck).not.toHaveBeenCalled();
    expect(resolveObjectiveMatrixCellPermission({
      role: PmsRole.DIRECTOR,
      workflowState: TermWorkflowState.MANAGER_REVIEW_OPEN,
      termPosition: 'CURRENT',
      windowOpen: true,
      columnFillOwner: PmsRole.MANAGER,
      columnRequired: true,
      columnType: 'NUMERIC_INPUT',
      explicitVisibility: 'VISIBLE',
      explicitEditable: true,
      rowSource: ObjectiveSource.MANAGER_CREATED,
    })).toEqual({
      visible: true,
      editable: false,
      required: false,
      denialReason: 'ROLE_READ_ONLY',
    });
  });

  it('resolves evidence editability independently from generic matrix-cell persistence', () => {
    expect(resolveObjectiveTermEvidencePermission({
      role: PmsRole.EMPLOYEE,
      workflowState: TermWorkflowState.OBJECTIVE_APPROVED,
      termPosition: 'CURRENT',
      windowOpen: true,
      explicitEditable: true,
    })).toEqual({ editable: true });

    expect(resolveObjectiveTermEvidencePermission({
      role: PmsRole.MANAGER,
      workflowState: TermWorkflowState.OBJECTIVE_APPROVED,
      termPosition: 'CURRENT',
      windowOpen: true,
      explicitEditable: false,
    })).toEqual({ editable: false, denialReason: 'ROLE_READ_ONLY' });

    expect(resolveObjectiveTermEvidencePermission({
      role: PmsRole.EMPLOYEE,
      workflowState: TermWorkflowState.NOT_STARTED,
      termPosition: 'FUTURE',
      windowOpen: true,
      explicitEditable: true,
    })).toEqual({ editable: false, denialReason: 'TERM_NOT_OPEN' });
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
    const evidenceId = new Types.ObjectId();
    const attachmentId = new Types.ObjectId();
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
        {
          columnId: 'evidence', bindingKey: 'system.objectiveEvidence', label: 'Supporting Documents',
          type: 'OBJECTIVE_EVIDENCE', displayOrder: 6, fillOwner: 'EMPLOYEE',
          workflowStage: 'EMPLOYEE_ACHIEVEMENT',
          access: access.map((entry) => ({
            ...entry,
            editable: entry.role === PmsRole.EMPLOYEE,
            required: false,
          })),
          evidenceConfig: {
            scope: 'PER_EMPLOYEE_TERM',
            displayMode: 'ANNUAL_AGGREGATED',
            maxActiveFilesPerTerm: 1,
            replacementPolicy: 'REPLACE_ACTIVE_TERM_DOCUMENT',
            maxFileSizeBytes: 1048576,
            allowedMimeTypes: ['application/pdf'],
            showTermLabel: true,
            allowPreview: true,
            allowDownload: true,
            allowEmployeeRemove: true,
            retainReplacementHistory: true,
          },
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
        { columnId: 'evidence', mode: 'SHARED_ANNUAL' },
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
    const evidenceRecords = [{
      _id: evidenceId,
      objectiveId: q1ObjectiveId,
      termAssignmentId: q1AssignmentId,
      assessmentTermCode: AssessmentTermCode.Q1,
      evidenceType: 'TERM_SUPPORTING_DOCUMENT',
      attachmentIds: [attachmentId],
      version: 8,
    }];
    const attachments = [{
      _id: attachmentId,
      objectiveId: q1ObjectiveId,
      documentId: 'document-q1',
      fileName: 'q1-summary.pdf',
      fileUrl: 'https://storage.example.test/private-object',
      fileType: 'application/pdf',
      fileSize: 540000,
      uploadedAt: new Date('2026-04-10T08:00:00.000Z'),
      version: 2,
    }];

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
    const evidenceFind = jest.spyOn(ObjectiveEvidence, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue(evidenceRecords),
    } as never);
    jest.spyOn(ObjectiveAttachment, 'find').mockReturnValue({
      lean: jest.fn().mockImplementation(async () => attachments),
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
    expect(matrix.rows[0].evidenceByTerm).toMatchObject({
      Q1: {
        evidenceId: evidenceId.toString(),
        objectiveId: q1ObjectiveId.toString(),
        termAssignmentId: q1AssignmentId.toString(),
        termCode: AssessmentTermCode.Q1,
        version: 8,
        editable: false,
        denialReason: 'WINDOW_CLOSED',
        attachment: {
          id: attachmentId.toString(),
          documentId: 'document-q1',
          fileName: 'q1-summary.pdf',
          fileType: 'application/pdf',
          fileSize: 540000,
          uploadedAt: '2026-04-10T08:00:00.000Z',
          previewAvailable: true,
          downloadAvailable: true,
        },
      },
      Q2: {
        objectiveId: q2ObjectiveId.toString(),
        termAssignmentId: q2AssignmentId.toString(),
        termCode: AssessmentTermCode.Q2,
        version: 0,
        editable: false,
        denialReason: 'TERM_NOT_OPEN',
      },
    });
    expect(JSON.stringify(matrix.rows[0].evidenceByTerm)).not.toContain('fileUrl');
    expect(matrix.contentVersion).toBe(8);
    expect(evidenceFind).toHaveBeenCalledWith(expect.objectContaining({
      objectiveId: { $in: [q1ObjectiveId, q2ObjectiveId] },
      evidenceType: 'TERM_SUPPORTING_DOCUMENT',
      isDeleted: false,
    }));
    expect(matrix.formulaResults[0].sourceVersions).toEqual(expect.objectContaining({
      [`${rowKey}:Q1:q1`]: 2,
      [`${rowKey}:Q2:q2`]: 1,
    }));
    expect(matrix.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const repeated = await service.getAnnualMatrix(annualAssignmentId.toString(), { mode: 'manager' });
    expect(repeated.contentHash).toBe(matrix.contentHash);

    attachments[0].fileName = 'q1-summary-replaced.pdf';
    const replaced = await service.getAnnualMatrix(annualAssignmentId.toString(), { mode: 'manager' });
    expect(replaced.contentHash).not.toBe(matrix.contentHash);

    const q2Matrix = await service.getAnnualMatrix(annualAssignmentId.toString(), {
      mode: 'manager',
      termAssignmentId: q2AssignmentId.toString(),
    });
    expect(q2Matrix.currentTermCode).toBe(AssessmentTermCode.Q2);
    expect(q2Matrix.rows[0].termCells.Q2?.find((cell) => cell.columnId === 'q2')).toMatchObject({
      value: 30, editable: true,
    });

    const evidenceCallsBeforeHiddenView = evidenceFind.mock.calls.length;
    const evidenceColumn = layout.columns.find((column) => column.columnId === 'evidence')!;
    evidenceColumn.access = evidenceColumn.access.map((entry) => ({
      ...entry,
      visible: entry.role === PmsRole.MANAGER ? false : entry.visible,
    }));
    const hiddenEvidenceMatrix = await service.getAnnualMatrix(
      annualAssignmentId.toString(),
      { mode: 'manager' },
    );
    expect(hiddenEvidenceMatrix.columns.map((column) => column.columnId)).not.toContain('evidence');
    expect(hiddenEvidenceMatrix.rows[0].evidenceByTerm).toEqual({});
    expect(evidenceFind).toHaveBeenCalledTimes(evidenceCallsBeforeHiddenView);

    await expect(service.getAnnualMatrix(annualAssignmentId.toString(), {
      mode: 'manager',
      termAssignmentId: new Types.ObjectId().toString(),
    })).rejects.toThrow('Selected term does not belong to the annual assignment');

    const directorService = new ObjectiveMatrixService({
      reqRole: PmsRole.DIRECTOR,
      requestId: 'director-cross-perspective-read',
      user: {
        _id: new Types.ObjectId(),
        email: 'director@example.test',
        name: 'Director',
        role: PmsRole.DIRECTOR,
        departmentId: 'management',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    });

    for (const mode of ['employee', 'manager', 'admin'] as const) {
      const directorMatrix = await directorService.getAnnualMatrix(
        annualAssignmentId.toString(),
        { mode },
      );
      const expectedProjectionRole = mode === 'employee'
        ? PmsRole.EMPLOYEE
        : mode === 'manager'
          ? PmsRole.MANAGER
          : PmsRole.ADMIN;

      expect(directorMatrix.mode).toBe(mode);
      expect(directorMatrix.viewRole).toBe(expectedProjectionRole);
      expect(directorMatrix.rows).toHaveLength(1);
      expect(
        directorMatrix.columns
          .flatMap((column) => column.access ?? [])
          .every((entry) => entry.editable === false && entry.required === false),
      ).toBe(true);
      expect(directorMatrix.rows[0].actions).toEqual({
        canEdit: false,
        canDelete: false,
        canSubmit: false,
        canApprove: false,
        canReturn: false,
        canComment: false,
        canAttach: false,
      });
      const directorSourceCells = [
        ...directorMatrix.rows[0].sharedCells,
        ...Object.values(directorMatrix.rows[0].termCells).flat(),
      ].filter((cell) => cell.kind === 'SOURCE');
      expect(directorSourceCells.length).toBeGreaterThan(0);
      expect(directorSourceCells).toEqual(expect.arrayContaining([
        expect.objectContaining({
          editable: false,
          required: false,
          denialReason: 'ROLE_READ_ONLY',
        }),
      ]));
      expect(directorSourceCells.every((cell) => cell.editable === false)).toBe(true);
      expect(directorSourceCells.every((cell) => cell.required === false)).toBe(true);
    }
  });
});
