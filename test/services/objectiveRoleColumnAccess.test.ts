import { Types } from 'mongoose';
import {
  ObjectiveAssignmentPeriodStatus,
  ObjectiveEmployeeAssignmentStatus,
} from '../../src/constants/pms.enums';
import { ObjectiveService } from '../../src/services/objective.service';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - role-based assignment column access', () => {
  let service: any;

  beforeEach(() => {
    const context: RequestContext = {
      requestId: 'objective-role-column-access-test',
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

  const layout = {
    columns: [
      { id: 'objective', label: 'Objective', type: 'LONG_TEXT' },
      { id: 'uom', label: 'UOM', type: 'SHORT_TEXT' },
      { id: 'target', label: 'Target', type: 'PERCENTAGE' },
      { id: 'q1_actual', label: 'Q1 Actual', type: 'PERCENTAGE' },
      { id: 'remarks', label: 'Remarks', type: 'LONG_TEXT' },
      { id: 'gap', label: 'Gap', type: 'FORMULA' },
    ],
    rows: [{ id: 'row_1', label: 'Objective line 1' }],
    fillPermissions: [
      { columnId: 'objective', actor: 'EMPLOYEE', access: 'FILL', required: true },
      { columnId: 'uom', actor: 'EMPLOYEE', access: 'FILL', required: false },
      { columnId: 'target', actor: 'EMPLOYEE', access: 'VIEW', required: false },
      { columnId: 'q1_actual', actor: 'EMPLOYEE', access: 'FILL', required: true },
      { columnId: 'remarks', actor: 'EMPLOYEE', access: 'FILL', required: false },
      { columnId: 'q1_actual', actor: 'MANAGER', access: 'FILL', required: true },
      { columnId: 'remarks', actor: 'MANAGER', access: 'FILL', required: false },
      { columnId: 'objective', actor: 'MANAGER', access: 'VIEW', required: false },
      { columnId: 'uom', actor: 'MANAGER', access: 'VIEW', required: false },
      { columnId: 'target', actor: 'MANAGER', access: 'VIEW', required: false },
    ],
    termAvailability: [
      { columnId: 'objective', terms: ['Q1', 'H1', 'Y1'] },
      { columnId: 'uom', terms: ['Q1', 'H1', 'Y1'] },
      { columnId: 'target', terms: ['Q1', 'H1', 'Y1'] },
      { columnId: 'q1_actual', terms: ['Q1'] },
      { columnId: 'remarks', terms: ['Q1', 'H1', 'Y1'] },
      { columnId: 'gap', terms: ['Q1', 'H1', 'Y1'] },
    ],
  };

  const period = {
    status: ObjectiveAssignmentPeriodStatus.ACTIVE,
    terms: ['Q1'],
    fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
    fillEndDate: new Date('2027-03-31T23:59:59.999Z'),
    termFillWindows: [{
      term: 'Q1',
      fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
      fillEndDate: new Date('2026-06-30T23:59:59.999Z'),
    }],
  };

  function assignment(employeeStatus = 'OPEN') {
    return {
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      selectedTerms: ['Q1'],
      termStates: [{
        term: 'Q1',
        status: employeeStatus,
        fillStartDate: period.termFillWindows[0].fillStartDate,
        fillEndDate: period.termFillWindows[0].fillEndDate,
      }],
      managerTermStates: [],
      frozenObjectiveSnapshot: { sheetLayout: layout },
      values: {},
      managerValues: {},
    };
  }

  it('honors configured Employee access for Objective and UOM without hard-coded exceptions', () => {
    const fillable = service.getObjectiveAssignmentFillableColumns(assignment(), 'Q1', 'EMPLOYEE');

    expect(fillable.map((column: any) => column.id)).toEqual([
      'objective',
      'uom',
      'q1_actual',
      'remarks',
    ]);
  });

  it('honors Manager access independently from Employee access', () => {
    const fillable = service.getObjectiveAssignmentFillableColumns(assignment(), 'Q1', 'MANAGER');

    expect(fillable.map((column: any) => column.id)).toEqual(['q1_actual', 'remarks']);
  });

  it('rejects API values for a role-owned View-only column', () => {
    expect(() => service.assertObjectiveAssignmentInputValuesAllowed(
      assignment(),
      'Q1',
      'MANAGER',
      { 'Q1:row_1:target': '95' },
    )).toThrow('manager cannot enter one or more fields for Q1');
  });

  it('opens Manager entry only after the Employee submits the term', () => {
    const beforeSubmission = service.normalizeObjectiveManagerAssignmentTermStates(
      assignment('OPEN'),
      period,
    );
    const afterSubmission = service.normalizeObjectiveManagerAssignmentTermStates(
      assignment(ObjectiveEmployeeAssignmentStatus.SUBMITTED),
      period,
    );

    expect(beforeSubmission[0].status).toBe('LOCKED');
    expect(beforeSubmission[0].readOnlyReason).toBe('Available after the employee submits this term');
    expect(afterSubmission[0].status).toBe('OPEN');
  });

  it('requires Manager values even when the Employee supplied the same column', () => {
    const record = assignment(ObjectiveEmployeeAssignmentStatus.SUBMITTED);
    record.values = { 'Q1:row_1:q1_actual': '80' };

    expect(() => service.validateObjectiveAssignmentTermSubmission(record, 'Q1', 'MANAGER'))
      .toThrow('Complete required fields before submitting');

    record.managerValues = { 'Q1:row_1:q1_actual': '85' };
    expect(() => service.validateObjectiveAssignmentTermSubmission(record, 'Q1', 'MANAGER'))
      .not.toThrow();
  });

  it.each(['Q1', 'H1', 'Y1'])('uses the same access evaluation for %s assignments', (term) => {
    const record = assignment(ObjectiveEmployeeAssignmentStatus.SUBMITTED);
    record.selectedTerms = [term];
    record.termStates[0].term = term;
    const fillable = service.getObjectiveAssignmentFillableColumns(record, term, 'EMPLOYEE');

    expect(fillable.map((column: any) => column.id)).toContain('objective');
    expect(fillable.map((column: any) => column.id)).toContain('remarks');
  });
});
