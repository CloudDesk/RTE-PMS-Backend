import { Types } from 'mongoose';
import { ObjectiveEmployeeAssignmentStatus } from '../../src/constants/pms.enums';
import { ObjectiveEmployeeAssignment } from '../../src/models/pms-objective-employee-assignment.model';
import { ObjectiveService } from '../../src/services/objective.service';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - final objective record completion contract', () => {
  let service: any;

  beforeEach(() => {
    const context: RequestContext = {
      requestId: 'objective-final-record-completion-test',
      reqRole: 'employee',
      user: {
        _id: new Types.ObjectId(),
        email: 'employee@example.com',
        name: 'Employee',
        role: 'EMPLOYEE',
        departmentId: 'Engineering',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    };
    service = new ObjectiveService(context) as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function serviceFor(role: string, actorId = new Types.ObjectId()) {
    return new ObjectiveService({
      requestId: `objective-final-record-${role.toLowerCase()}-test`,
      reqRole: role.toLowerCase(),
      user: {
        _id: actorId,
        email: `${role.toLowerCase()}@example.com`,
        name: role,
        role: role as any,
        departmentId: 'Engineering',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    } as RequestContext) as any;
  }

  function termState(term: string, status: string, submittedAt?: string) {
    return { term, status, submittedAt };
  }

  function readiness(input: Record<string, unknown>) {
    return service.resolveObjectiveFinalRecordReadiness(
      input,
      (input.termStates ?? []) as any[],
    );
  }

  it('becomes available when all selected quarterly employee terms are submitted', () => {
    const result = readiness({
      status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
      selectedTerms: ['Q1', 'Q2', 'Q3', 'Q4'],
      termStates: [
        termState('Q1', 'SUBMITTED', '2026-06-30T10:00:00.000Z'),
        termState('Q2', 'SUBMITTED', '2026-09-30T10:00:00.000Z'),
        termState('Q3', 'SUBMITTED', '2026-12-31T10:00:00.000Z'),
        termState('Q4', 'SUBMITTED', '2027-03-31T10:00:00.000Z'),
      ],
      submittedAt: new Date('2027-03-31T10:00:00.000Z'),
    });

    expect(result).toEqual({
      availability: 'AVAILABLE',
      reason: 'READY',
      completionBasis: 'EMPLOYEE_SELECTED_TERMS',
      selectedTerms: ['Q1', 'Q2', 'Q3', 'Q4'],
      submittedTerms: ['Q1', 'Q2', 'Q3', 'Q4'],
      pendingTerms: [],
      completedAt: '2027-03-31T10:00:00.000Z',
      message: 'All selected employee terms are submitted.',
    });
  });

  it('ignores unselected earlier terms for a mid-cycle assignment', () => {
    const result = readiness({
      status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
      selectedTerms: ['Q2', 'Q3', 'Q4'],
      termStates: [
        termState('Q1', 'LOCKED'),
        termState('Q2', 'SUBMITTED', '2026-09-30T10:00:00.000Z'),
        termState('Q3', 'SUBMITTED', '2026-12-31T10:00:00.000Z'),
        termState('Q4', 'SUBMITTED', '2027-03-31T10:00:00.000Z'),
      ],
    });

    expect(result.availability).toBe('AVAILABLE');
    expect(result.selectedTerms).toEqual(['Q2', 'Q3', 'Q4']);
    expect(result.pendingTerms).toEqual([]);
    expect(result.completedAt).toBe('2027-03-31T10:00:00.000Z');
  });

  it('reports selected employee terms that remain pending', () => {
    const result = readiness({
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      selectedTerms: ['Q1', 'Q2', 'Q3', 'Q4'],
      termStates: [
        termState('Q1', 'SUBMITTED', '2026-06-30T10:00:00.000Z'),
        termState('Q2', 'SUBMITTED', '2026-09-30T10:00:00.000Z'),
        termState('Q3', 'LOCKED'),
        termState('Q4', 'OPEN'),
      ],
    });

    expect(result.availability).toBe('PENDING');
    expect(result.reason).toBe('EMPLOYEE_TERMS_PENDING');
    expect(result.submittedTerms).toEqual(['Q1', 'Q2']);
    expect(result.pendingTerms).toEqual(['Q3', 'Q4']);
    expect(result.message).toBe('Employee submission pending for Q3, Q4.');
  });

  it.each([
    [['H1', 'H2'], ['H1', 'H2']],
    [['Y1'], ['Y1']],
  ])('uses the same employee-only contract for selected terms %j', (selectedTerms, submittedTerms) => {
    const result = readiness({
      status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
      selectedTerms,
      termStates: submittedTerms.map((term) => termState(term, 'SUBMITTED', '2027-03-31T10:00:00.000Z')),
    });

    expect(result.availability).toBe('AVAILABLE');
    expect(result.submittedTerms).toEqual(submittedTerms);
  });

  it('does not make manager submission part of final-record readiness', () => {
    const result = readiness({
      status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
      selectedTerms: ['Q4'],
      termStates: [termState('Q4', 'SUBMITTED', '2027-03-31T10:00:00.000Z')],
      managerTermStates: [termState('Q4', 'LOCKED')],
      managerValues: {},
    });

    expect(result.availability).toBe('AVAILABLE');
    expect(result.pendingTerms).toEqual([]);
  });

  it('keeps a previously submitted record available after it is closed', () => {
    const result = readiness({
      status: ObjectiveEmployeeAssignmentStatus.CLOSED,
      selectedTerms: ['Q1', 'Q2'],
      submittedAt: new Date('2026-09-30T10:00:00.000Z'),
      termStates: [
        termState('Q1', 'CLOSED', '2026-06-30T10:00:00.000Z'),
        termState('Q2', 'CLOSED', '2026-09-30T10:00:00.000Z'),
      ],
    });

    expect(result.availability).toBe('AVAILABLE');
    expect(result.completedAt).toBe('2026-09-30T10:00:00.000Z');
  });

  it('does not treat an incomplete closed assignment as completed', () => {
    const result = readiness({
      status: ObjectiveEmployeeAssignmentStatus.CLOSED,
      selectedTerms: ['Q1', 'Q2'],
      termStates: [
        termState('Q1', 'CLOSED', '2026-06-30T10:00:00.000Z'),
        termState('Q2', 'CLOSED'),
      ],
    });

    expect(result.availability).toBe('PENDING');
    expect(result.submittedTerms).toEqual(['Q1']);
    expect(result.pendingTerms).toEqual(['Q2']);
  });

  it('does not produce readiness without selected employee terms', () => {
    const result = readiness({
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      selectedTerms: [],
      termStates: [],
    });

    expect(result.availability).toBe('PENDING');
    expect(result.reason).toBe('NO_SELECTED_TERMS');
    expect(result.selectedTerms).toEqual([]);
  });

  it('builds an immutable employee-only record with ordered consolidated Notes', async () => {
    service.getCurrentDate = jest.fn(() => new Date('2027-03-31T10:05:00.000Z'));
    const assignmentId = new Types.ObjectId();
    const periodId = new Types.ObjectId();
    const masterId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const assignment = {
      _id: assignmentId,
      objectiveAssignmentPeriodId: periodId,
      objectiveMasterId: masterId,
      objectiveVersionId: versionId,
      employeeId: {
        _id: employeeId,
        name: 'Employee One',
        employeeCode: 'E001',
        departmentName: 'Engineering',
        specificRole: 'Engineer',
      },
      managerId: { _id: managerId, name: 'Manager One' },
      status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
      selectedTerms: ['Q1', 'Q2'],
      submittedAt: new Date('2026-09-30T10:00:00.000Z'),
      termStates: [
        termState('Q1', 'SUBMITTED', '2026-06-30T10:00:00.000Z'),
        termState('Q2', 'SUBMITTED', '2026-09-30T10:00:00.000Z'),
      ],
      frozenObjectiveSnapshot: {
        title: 'Annual Objective',
        objectiveType: 'SHEET',
        sheetLayout: {
          rows: [{ id: 'row_1', label: 'Objective line 1' }],
          columns: [
            { id: 'objective', label: 'Objective', type: 'LONG_TEXT' },
            { id: 'remarks', label: 'Notes', type: 'LONG_TEXT' },
            { id: 'private_note', label: 'Private', type: 'LONG_TEXT' },
          ],
          fillPermissions: [
            { columnId: 'objective', actor: 'EMPLOYEE', access: 'FILL' },
            { columnId: 'remarks', actor: 'EMPLOYEE', access: 'FILL' },
            { columnId: 'private_note', actor: 'EMPLOYEE', access: 'HIDDEN' },
            { columnId: 'objective', actor: 'MANAGER', access: 'VIEW' },
            { columnId: 'remarks', actor: 'MANAGER', access: 'VIEW' },
            { columnId: 'private_note', actor: 'MANAGER', access: 'VIEW' },
          ],
        },
      },
      values: {
        'Q1:row_1:objective': 'Objective line 1',
        'Q1:row_1:remarks': 'Started',
        'Q1:row_1:private_note': 'Employee hidden value',
        'Q2:row_1:remarks': 'Completed, verified',
        'Q3:row_1:remarks': 'Unselected draft',
      },
      managerValues: {
        'Q1:row_1:remarks': 'Manager draft must not be included',
      },
    };
    const period = {
      _id: periodId,
      name: 'FY 2026 Objective Assignment',
      status: 'ACTIVE',
      fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
      fillEndDate: new Date('2027-03-31T23:59:59.999Z'),
      termFillWindows: [],
    };
    const finalReadiness = readiness(assignment);

    const snapshot = await service.buildObjectiveFinalRecordSnapshot(
      assignment,
      period,
      finalReadiness,
      'SUBMISSION',
    );

    expect(snapshot.employeeValues).toEqual({
      'Q1:row_1:objective': 'Objective line 1',
      'Q1:row_1:remarks': 'Started',
      'Q1:row_1:private_note': 'Employee hidden value',
      'Q2:row_1:remarks': 'Completed, verified',
    });
    expect(snapshot).not.toHaveProperty('managerValues');
    expect(snapshot.consolidatedNotes).toEqual([{
      rowId: 'row_1',
      columnId: 'remarks',
      entries: [
        { term: 'Q1', value: 'Started' },
        { term: 'Q2', value: 'Completed, verified' },
      ],
      value: 'Q1: Started, Q2: Completed, verified',
    }]);
    expect(snapshot.employeeSnapshot).toMatchObject({
      id: employeeId.toString(),
      name: 'Employee One',
      employeeCode: 'E001',
    });
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.verifyObjectiveFinalRecordIntegrity(snapshot)).toBe(true);

    assignment.values['Q1:row_1:remarks'] = 'Changed after completion';
    assignment.frozenObjectiveSnapshot.sheetLayout.columns[0].label = 'Changed column';
    expect(snapshot.employeeValues['Q1:row_1:remarks']).toBe('Started');
    expect(snapshot.frozenObjectiveSnapshot.sheetLayout.columns[0].label).toBe('Objective');
    expect(service.verifyObjectiveFinalRecordIntegrity(snapshot)).toBe(true);
  });

  it('filters hidden columns and values in the role-specific final-record response', async () => {
    service.getCurrentDate = jest.fn(() => new Date('2027-03-31T10:05:00.000Z'));
    const id = new Types.ObjectId();
    const assignment = {
      _id: id,
      objectiveAssignmentPeriodId: new Types.ObjectId(),
      objectiveMasterId: new Types.ObjectId(),
      objectiveVersionId: new Types.ObjectId(),
      employeeId: { _id: new Types.ObjectId(), name: 'Employee One' },
      selectedTerms: ['Y1'],
      status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
      submittedAt: new Date('2027-03-31T10:00:00.000Z'),
      termStates: [termState('Y1', 'SUBMITTED', '2027-03-31T10:00:00.000Z')],
      frozenObjectiveSnapshot: {
        title: 'Year Objective',
        objectiveType: 'SHEET',
        sheetLayout: {
          rows: [{ id: 'row_1', label: 'Objective line 1' }],
          columns: [
            { id: 'remarks', label: 'Notes', type: 'LONG_TEXT' },
            { id: 'private_note', label: 'Private', type: 'LONG_TEXT' },
          ],
          fillPermissions: [
            { columnId: 'remarks', actor: 'EMPLOYEE', access: 'FILL' },
            { columnId: 'private_note', actor: 'EMPLOYEE', access: 'HIDDEN' },
            { columnId: 'remarks', actor: 'MANAGER', access: 'VIEW' },
            { columnId: 'private_note', actor: 'MANAGER', access: 'VIEW' },
          ],
        },
      },
      values: {
        'Y1:row_1:remarks': 'Employee visible note',
        'Y1:row_1:private_note': 'Employee hidden note',
      },
    };
    const finalReadiness = readiness(assignment);
    const snapshot = await service.buildObjectiveFinalRecordSnapshot(
      assignment,
      { _id: assignment.objectiveAssignmentPeriodId, status: 'ACTIVE' },
      finalReadiness,
      'SUBMISSION',
    );

    const employeeView = service.mapObjectiveFinalRecordForView(snapshot, 'EMPLOYEE');
    const managerView = service.mapObjectiveFinalRecordForView(snapshot, 'MANAGER');

    expect(employeeView.frozenObjectiveSnapshot.sheetLayout.columns.map((column: any) => column.id))
      .toEqual(['remarks']);
    expect(employeeView.employeeValues).toEqual({
      'Y1:row_1:remarks': 'Employee visible note',
    });
    expect(employeeView.consolidatedNotes).toHaveLength(1);
    expect(employeeView.integrityVerified).toBe(true);
    expect(managerView.frozenObjectiveSnapshot.sheetLayout.columns.map((column: any) => column.id))
      .toEqual(['remarks', 'private_note']);
    expect(managerView.employeeValues).toHaveProperty('Y1:row_1:private_note', 'Employee hidden note');

    snapshot.employeeValues['Y1:row_1:remarks'] = 'Tampered';
    expect(service.mapObjectiveFinalRecordForView(snapshot, 'EMPLOYEE').integrityVerified).toBe(false);
  });

  it('freezes calculated Actual and Gap values in the final record', async () => {
    service.getCurrentDate = jest.fn(() => new Date('2027-03-31T10:05:00.000Z'));
    const assignment = {
      _id: new Types.ObjectId(),
      objectiveAssignmentPeriodId: new Types.ObjectId(),
      objectiveMasterId: new Types.ObjectId(),
      objectiveVersionId: new Types.ObjectId(),
      employeeId: { _id: new Types.ObjectId(), name: 'Employee One' },
      selectedTerms: ['Q1', 'Q2'],
      status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
      submittedAt: new Date('2026-09-30T10:00:00.000Z'),
      termStates: [
        termState('Q1', 'SUBMITTED', '2026-06-30T10:00:00.000Z'),
        termState('Q2', 'SUBMITTED', '2026-09-30T10:00:00.000Z'),
      ],
      frozenObjectiveSnapshot: {
        title: 'Calculated Objective',
        objectiveType: 'SHEET',
        sheetLayout: {
          rows: [{ id: 'row_1', label: 'Objective line 1' }],
          columns: [
            { id: 'target', label: 'Target', type: 'PERCENTAGE' },
            { id: 'q1_actual', label: 'Q1 Actual', type: 'PERCENTAGE' },
            { id: 'q2_actual', label: 'Q2 Actual', type: 'PERCENTAGE' },
            { id: 'actual', label: 'Actual', type: 'CALCULATED' },
            { id: 'gap', label: 'Gap', type: 'CALCULATED' },
          ],
          formulas: [
            {
              id: 'actual_formula',
              kind: 'ACTUAL',
              targetColumnId: 'actual',
              mode: 'SUM_TERMS',
              sourceColumnIds: ['q1_actual', 'q2_actual'],
            },
            {
              id: 'gap_formula',
              kind: 'GAP',
              targetColumnId: 'gap',
              mode: 'TARGET_MINUS_ACTUAL',
              leftColumnId: 'target',
              rightColumnId: 'actual',
            },
          ],
        },
      },
      values: {
        'Q1:row_1:target': '100',
        'Q1:row_1:q1_actual': '30',
        'Q2:row_1:q2_actual': '40',
      },
    };

    const snapshot = await service.buildObjectiveFinalRecordSnapshot(
      assignment,
      { _id: assignment.objectiveAssignmentPeriodId, status: 'ACTIVE' },
      readiness(assignment),
      'SUBMISSION',
    );

    expect(snapshot.calculatedValues).toEqual({
      'row_1:actual': 70,
      'row_1:gap': 30,
    });
    expect(service.verifyObjectiveFinalRecordIntegrity(snapshot)).toBe(true);

    const employeeView = service.mapObjectiveFinalRecordForView(snapshot, 'EMPLOYEE');
    expect(employeeView.frozenObjectiveSnapshot.sheetLayout.formulas[0]).toEqual({
      id: 'actual_formula',
      kind: 'ACTUAL',
      targetColumnId: 'actual',
      mode: 'SUM_TERMS',
    });
    expect(employeeView.frozenObjectiveSnapshot.sheetLayout.formulas[0])
      .not.toHaveProperty('sourceColumnIds');
    expect(employeeView.frozenObjectiveSnapshot.sheetLayout.formulas[1])
      .not.toHaveProperty('leftColumnId');
  });

  it('authorizes only the employee, assigned manager, admin, management, and director views', () => {
    const employeeId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const assignment = { employeeId, managerId };

    expect(serviceFor('EMPLOYEE', employeeId).resolveObjectiveFinalRecordViewActor(assignment))
      .toBe('EMPLOYEE');
    expect(serviceFor('MANAGER', managerId).resolveObjectiveFinalRecordViewActor(assignment))
      .toBe('MANAGER');
    expect(serviceFor('ADMIN').resolveObjectiveFinalRecordViewActor(assignment)).toBe('ADMIN');
    expect(serviceFor('MANAGEMENT').resolveObjectiveFinalRecordViewActor(assignment)).toBe('ADMIN');
    expect(serviceFor('DIRECTOR').resolveObjectiveFinalRecordViewActor(assignment)).toBe('REVIEWER');
    expect(() => serviceFor('EMPLOYEE').resolveObjectiveFinalRecordViewActor(assignment))
      .toThrow('You do not have access to this final objective record');
    expect(() => serviceFor('MANAGER').resolveObjectiveFinalRecordViewActor(assignment))
      .toThrow('You do not have access to this final objective record');
  });

  it('atomically backfills a completed legacy assignment only on first final-record view', async () => {
    const employeeId = new Types.ObjectId();
    service = serviceFor('EMPLOYEE', employeeId);
    const assignment = {
      _id: new Types.ObjectId(),
      objectiveAssignmentPeriodId: new Types.ObjectId(),
      employeeId,
      selectedTerms: ['Y1'],
      status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
      submittedAt: new Date('2027-03-31T10:00:00.000Z'),
      termStates: [termState('Y1', 'SUBMITTED', '2027-03-31T10:00:00.000Z')],
    };
    const candidate = {
      contentHash: 'legacy-backfill-hash',
      completedAt: '2027-03-31T10:00:00.000Z',
    };
    service.loadObjectiveEmployeeAssignment = jest.fn().mockResolvedValue(assignment);
    service.loadObjectiveAssignmentPeriod = jest.fn().mockResolvedValue({
      _id: assignment.objectiveAssignmentPeriodId,
      status: 'CLOSED',
    });
    service.buildObjectiveFinalRecordSnapshot = jest.fn().mockResolvedValue(candidate);
    service.mapObjectiveFinalRecordForView = jest.fn().mockReturnValue({ id: 'mapped-record' });
    service.audit = jest.fn().mockResolvedValue(undefined);
    const updateSpy = jest
      .spyOn(ObjectiveEmployeeAssignment, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as any);

    const result = await service.getObjectiveEmployeeAssignmentFinalRecord(
      assignment._id.toString(),
    );

    expect(result.availability).toBe('AVAILABLE');
    expect(result.record).toEqual({ id: 'mapped-record' });
    expect(service.buildObjectiveFinalRecordSnapshot).toHaveBeenCalledWith(
      assignment,
      expect.any(Object),
      expect.objectContaining({ availability: 'AVAILABLE' }),
      'BACKFILL',
    );
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: assignment._id,
        $or: [{ finalRecord: { $exists: false } }, { finalRecord: null }],
      }),
      { $set: { finalRecord: candidate } },
    );
    expect(service.audit).toHaveBeenCalledWith(
      'PMS_OBJECTIVE_FINAL_RECORD_BACKFILLED',
      'OBJECTIVE_EMPLOYEE_ASSIGNMENT',
      assignment._id.toString(),
      undefined,
      expect.objectContaining({ contentHash: candidate.contentHash }),
    );
  });

  it('does not build or write a final record while employee terms remain pending', async () => {
    const employeeId = new Types.ObjectId();
    service = serviceFor('EMPLOYEE', employeeId);
    const assignment = {
      _id: new Types.ObjectId(),
      objectiveAssignmentPeriodId: new Types.ObjectId(),
      employeeId,
      selectedTerms: ['Q1', 'Q2'],
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      termStates: [
        termState('Q1', 'SUBMITTED', '2026-06-30T10:00:00.000Z'),
        termState('Q2', 'OPEN'),
      ],
    };
    service.loadObjectiveEmployeeAssignment = jest.fn().mockResolvedValue(assignment);
    service.loadObjectiveAssignmentPeriod = jest.fn().mockResolvedValue({
      _id: assignment.objectiveAssignmentPeriodId,
      status: 'ACTIVE',
    });
    service.buildObjectiveFinalRecordSnapshot = jest.fn();
    const updateSpy = jest.spyOn(ObjectiveEmployeeAssignment, 'updateOne');

    const result = await service.getObjectiveEmployeeAssignmentFinalRecord(
      assignment._id.toString(),
    );

    expect(result.availability).toBe('PENDING');
    expect(result.readiness.pendingTerms).toEqual(['Q2']);
    expect(service.buildObjectiveFinalRecordSnapshot).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
