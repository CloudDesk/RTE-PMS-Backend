import { Types } from 'mongoose';
import { ObjectiveService, type ObjectiveEmployeeAssignmentListQuery } from '../../src/services/objective.service';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - employee assignment list scope', () => {
  const actorId = new Types.ObjectId();
  const otherEmployeeId = new Types.ObjectId();

  function createService(role: string): any {
    const context: RequestContext = {
      requestId: 'objective-assignment-scope-test',
      reqRole: role,
      user: {
        _id: actorId,
        email: `${role.toLowerCase()}@example.com`,
        name: role,
        role,
        departmentId: 'Engineering',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    };
    return new ObjectiveService(context) as any;
  }

  function scopedFilter(role: string, query: ObjectiveEmployeeAssignmentListQuery) {
    const filter: Record<string, unknown> = { isDeleted: false };
    if (query.employeeId) filter.employeeId = new Types.ObjectId(query.employeeId);
    createService(role).applyObjectiveEmployeeAssignmentListScope(filter, query);
    return filter as Record<string, any>;
  }

  it('returns a manager own assignment for SELF scope', () => {
    const filter = scopedFilter('MANAGER', { scope: 'SELF', employeeId: otherEmployeeId.toString() });

    expect(filter.employeeId.toString()).toBe(actorId.toString());
    expect(filter.managerId).toBeUndefined();
  });

  it('returns direct-report assignments for manager TEAM scope', () => {
    const filter = scopedFilter('MANAGER', { scope: 'TEAM' });

    expect(filter.managerId.toString()).toBe(actorId.toString());
    expect(filter.employeeId).toBeUndefined();
  });

  it('rejects TEAM scope for an employee', () => {
    expect(() => scopedFilter('STAFF', { scope: 'TEAM' })).toThrow('PMS team access denied');
  });

  it('supports older manager clients requesting their own employeeId', () => {
    const filter = scopedFilter('MANAGER', { employeeId: actorId.toString() });

    expect(filter.employeeId.toString()).toBe(actorId.toString());
    expect(filter.managerId).toBeUndefined();
  });

  it('preserves unrestricted authorized admin listing without a scope', () => {
    const filter = scopedFilter('ADMIN', {});

    expect(filter.employeeId).toBeUndefined();
    expect(filter.managerId).toBeUndefined();
  });
});
