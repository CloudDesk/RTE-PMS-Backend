import { Types } from 'mongoose';
import {
  ObjectiveAssignmentPeriodStatus,
  ObjectiveEmployeeAssignmentStatus,
  ObjectiveTermEntryOverrideStatus,
} from '../../src/constants/pms.enums';
import { ObjectiveService } from '../../src/services/objective.service';
import { ObjectiveEmployeeAssignment } from '../../src/models/pms-objective-employee-assignment.model';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - past-term employee entry lifecycle', () => {
  const now = new Date('2026-07-14T06:30:00.000Z');
  let service: any;

  beforeEach(() => {
    const context: RequestContext = {
      requestId: 'objective-past-term-entry-test',
      reqRole: 'admin',
      pmsCurrentDate: now,
      user: {
        _id: new Types.ObjectId(),
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
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

  const period = (terms: string[]) => ({
    status: ObjectiveAssignmentPeriodStatus.ACTIVE,
    terms,
    fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
    fillEndDate: new Date('2027-03-31T23:59:59.999Z'),
    termFillWindows: terms.map((term) => ({
      term,
      fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
      fillEndDate: new Date('2026-06-30T23:59:59.999Z'),
    })),
  });

  const activeOverride = () => ({
    type: 'PAST_TERM',
    status: ObjectiveTermEntryOverrideStatus.ACTIVE,
    opensAt: new Date('2026-07-14T00:00:00.000Z'),
    closesAt: new Date('2026-07-20T23:59:59.999Z'),
    reason: 'Employee joined after the scheduled Q1 window.',
    enabledAt: now,
    enabledBy: new Types.ObjectId(),
  });

  it('keeps a past Q1 open under an active override even when Q2 is submitted', () => {
    const assignment = {
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      selectedTerms: ['Q1', 'Q2'],
      termStates: [
        {
          term: 'Q1',
          status: 'LOCKED',
          fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
          fillEndDate: new Date('2026-06-30T23:59:59.999Z'),
          entryOverride: activeOverride(),
        },
        {
          term: 'Q2',
          status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
          fillStartDate: new Date('2026-07-01T00:00:00.000Z'),
          fillEndDate: new Date('2026-09-30T23:59:59.999Z'),
        },
      ],
    };
    const assignmentPeriod = period(['Q1', 'Q2']);
    assignmentPeriod.termFillWindows[1] = {
      term: 'Q2',
      fillStartDate: new Date('2026-07-01T00:00:00.000Z'),
      fillEndDate: new Date('2026-09-30T23:59:59.999Z'),
    };

    const states = service.normalizeObjectiveEmployeeAssignmentTermStates(assignment, assignmentPeriod);

    expect(states.find((state: any) => state.term === 'Q1').status).toBe('OPEN');
    expect(states.find((state: any) => state.term === 'Q2').status).toBe(ObjectiveEmployeeAssignmentStatus.SUBMITTED);
  });

  it('never reopens a submitted term even when override metadata exists', () => {
    const assignment = {
      status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
      selectedTerms: ['Q1'],
      termStates: [{
        term: 'Q1',
        status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
        fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
        fillEndDate: new Date('2026-06-30T23:59:59.999Z'),
        entryOverride: activeOverride(),
      }],
    };

    const [state] = service.normalizeObjectiveEmployeeAssignmentTermStates(assignment, period(['Q1']));

    expect(state.status).toBe(ObjectiveEmployeeAssignmentStatus.SUBMITTED);
  });

  it('locks an expired override and exposes the effective expired status', () => {
    const assignment = {
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      selectedTerms: ['Q1'],
      termStates: [{
        term: 'Q1',
        status: 'OPEN',
        fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
        fillEndDate: new Date('2026-06-30T23:59:59.999Z'),
        entryOverride: {
          ...activeOverride(),
          closesAt: new Date('2026-07-13T23:59:59.999Z'),
        },
      }],
    };

    const [state] = service.normalizeObjectiveEmployeeAssignmentTermStates(assignment, period(['Q1']), true);

    expect(state.status).toBe('LOCKED');
    expect(state.entryOverride.status).toBe(ObjectiveTermEntryOverrideStatus.EXPIRED);
    expect(state.readOnlyReason).toBe('Past-term employee entry access has expired');
  });

  it('does not let an active override bypass a closed assignment period', () => {
    const assignment = {
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      selectedTerms: ['Q1'],
      termStates: [{
        term: 'Q1',
        status: 'OPEN',
        fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
        fillEndDate: new Date('2026-06-30T23:59:59.999Z'),
        entryOverride: activeOverride(),
      }],
    };
    const closedPeriod = {
      ...period(['Q1']),
      status: ObjectiveAssignmentPeriodStatus.CLOSED,
    };

    const [state] = service.normalizeObjectiveEmployeeAssignmentTermStates(assignment, closedPeriod, true);

    expect(state.status).toBe('LOCKED');
    expect(state.readOnlyReason).toBe('Objective Assignment Period is not active');
  });

  it.each(['H1', 'Y1'])('applies the same override lifecycle to %s', (term) => {
    const assignment = {
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      selectedTerms: [term],
      termStates: [{
        term,
        status: 'LOCKED',
        fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
        fillEndDate: new Date('2026-06-30T23:59:59.999Z'),
        entryOverride: activeOverride(),
      }],
    };

    const [state] = service.normalizeObjectiveEmployeeAssignmentTermStates(assignment, period([term]));

    expect(state.status).toBe('OPEN');
  });

  it('keeps legacy term states valid when no override metadata exists', () => {
    const id = new Types.ObjectId();
    const assignment = new ObjectiveEmployeeAssignment({
      objectiveAssignmentPeriodId: id,
      objectiveMasterId: id,
      objectiveVersionId: id,
      employeeId: id,
      selectedTerms: ['Q1'],
      termStates: [{
        term: 'Q1',
        status: 'LOCKED',
        fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
        fillEndDate: new Date('2026-06-30T23:59:59.999Z'),
      }],
      frozenObjectiveSnapshot: { objectiveType: 'SIMPLE', title: 'Legacy objective' },
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      createdBy: id,
    });

    expect(assignment.validateSync()).toBeUndefined();
  });
});
