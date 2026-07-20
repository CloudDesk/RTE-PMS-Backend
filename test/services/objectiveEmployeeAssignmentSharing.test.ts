import { Types } from 'mongoose';
import {
  ObjectiveAssignmentPeriodStatus,
  ObjectiveEmployeeAssignmentStatus,
} from '../../src/constants/pms.enums';
import { ObjectiveEmployeeAssignment } from '../../src/models/pms-objective-employee-assignment.model';
import { User } from '../../src/models/user.model';
import { ObjectiveService } from '../../src/services/objective.service';
import { auditService } from '../../src/services/audit.service';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - objective assignment sharing', () => {
  const ownerId = new Types.ObjectId();
  const sharedEmployeeId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const periodId = new Types.ObjectId();

  function serviceFor(actorId: Types.ObjectId): any {
    const context: RequestContext = {
      requestId: 'objective-assignment-sharing-test',
      reqRole: 'employee',
      user: {
        _id: actorId,
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
    return new ObjectiveService(context) as any;
  }

  function assignment(overrides: Record<string, unknown> = {}) {
    return {
      _id: assignmentId,
      __v: 4,
      version: 7,
      objectiveAssignmentPeriodId: periodId,
      employeeId: ownerId,
      status: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      selectedTerms: ['Q1', 'Q2', 'Q3', 'Q4'],
      termStates: ['Q1', 'Q2', 'Q3', 'Q4'].map((term) => ({ term, status: 'OPEN' })),
      sharedAccess: [],
      ...overrides,
    };
  }

  const period = {
    status: ObjectiveAssignmentPeriodStatus.ACTIVE,
    terms: ['Q1', 'Q2', 'Q3', 'Q4'],
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires at least one dynamic assigned term', () => {
    const service = serviceFor(ownerId);

    expect(() => service.normalizeObjectiveEmployeeAssignmentShareTerms([])).toThrow(
      'Select at least one term to share',
    );
    expect(() => service.assertObjectiveEmployeeAssignmentCanShare(
      assignment(),
      period,
      { sharedWithEmployeeId: sharedEmployeeId.toString(), terms: ['H1'] },
    )).toThrow('H1 is not part of this objective assignment');
  });

  it('rejects stale and malformed sharing versions before writing', async () => {
    const service = serviceFor(ownerId);
    const source = assignment();
    jest.spyOn(service, 'loadObjectiveEmployeeAssignment').mockResolvedValue(source);
    jest.spyOn(service, 'loadObjectiveAssignmentPeriod').mockResolvedValue(period);
    jest.spyOn(service, 'syncObjectiveEmployeeAssignmentTerms').mockResolvedValue(undefined);
    const userLookup = jest.spyOn(User, 'findOne');
    const write = jest.spyOn(ObjectiveEmployeeAssignment, 'findOneAndUpdate');

    await expect(service.shareObjectiveEmployeeAssignment(assignmentId.toString(), {
      sharedWithEmployeeId: sharedEmployeeId.toString(),
      terms: ['Q2'],
      expectedVersion: 6,
    })).rejects.toThrow('Objective assignment was updated by another request');
    await expect(service.shareObjectiveEmployeeAssignment(assignmentId.toString(), {
      sharedWithEmployeeId: sharedEmployeeId.toString(),
      terms: ['Q2'],
      expectedVersion: 0,
    })).rejects.toThrow('A valid expectedVersion is required');
    expect(userLookup).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects an oversized share note', () => {
    const service = serviceFor(ownerId);
    expect(() => service.assertObjectiveEmployeeAssignmentCanShare(
      assignment(),
      period,
      {
        sharedWithEmployeeId: sharedEmployeeId.toString(),
        terms: ['Q2'],
        note: 'x'.repeat(501),
        expectedVersion: 7,
      },
    )).toThrow('Share note cannot exceed 500 characters');
  });

  it('gives one active filler per term', () => {
    const ownerService = serviceFor(ownerId);
    const sharedService = serviceFor(sharedEmployeeId);
    const value = assignment({
      sharedAccess: [{
        sharedWithEmployeeId: sharedEmployeeId,
        terms: ['Q2', 'Q3'],
        status: 'ACTIVE',
      }],
    });

    expect(ownerService.canActorEditObjectiveEmployeeAssignmentTerm(value, 'Q1')).toBe(true);
    expect(ownerService.canActorEditObjectiveEmployeeAssignmentTerm(value, 'Q2')).toBe(false);
    expect(sharedService.canActorEditObjectiveEmployeeAssignmentTerm(value, 'Q2')).toBe(true);
    expect(sharedService.canActorEditObjectiveEmployeeAssignmentTerm(value, 'Q4')).toBe(false);
  });

  it('fails closed when corrupted data contains two active fillers for one term', async () => {
    const secondSharedEmployeeId = new Types.ObjectId();
    const service = serviceFor(sharedEmployeeId);
    const value = assignment({
      sharedAccess: [
        { sharedWithEmployeeId: sharedEmployeeId, terms: ['Q2'], status: 'ACTIVE' },
        { sharedWithEmployeeId: secondSharedEmployeeId, terms: ['Q2'], status: 'ACTIVE' },
      ],
    });

    expect(service.canActorEditObjectiveEmployeeAssignmentTerm(value, 'Q2')).toBe(false);
    await expect(service.assertObjectiveAssignmentEditable(value, 'Q2', 'EMPLOYEE', period))
      .rejects.toThrow('Q2 has conflicting shared access');
  });

  it('uses an atomic versioned write that rejects an already active shared term', async () => {
    const service = serviceFor(ownerId);
    const source = assignment();
    const updated = assignment({
      version: 8,
      __v: 5,
      sharedAccess: [{
        sharedWithEmployeeId: sharedEmployeeId,
        terms: ['Q2', 'Q3'],
        status: 'ACTIVE',
      }],
    });
    jest.spyOn(service, 'loadObjectiveEmployeeAssignment').mockResolvedValue(source);
    jest.spyOn(service, 'loadObjectiveAssignmentPeriod').mockResolvedValue(period);
    jest.spyOn(service, 'syncObjectiveEmployeeAssignmentTerms').mockResolvedValue(undefined);
    jest.spyOn(service, 'mapObjectiveEmployeeAssignmentRecord').mockReturnValue({ id: assignmentId.toString() });
    jest.spyOn(service, 'audit').mockResolvedValue(undefined);
    jest.spyOn(User, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: sharedEmployeeId }) } as any);
    const query = {
      populate: jest.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(updated)),
    };
    const updateSpy = jest.spyOn(ObjectiveEmployeeAssignment, 'findOneAndUpdate').mockReturnValue(query as any);

    await service.shareObjectiveEmployeeAssignment(assignmentId.toString(), {
      sharedWithEmployeeId: sharedEmployeeId.toString(),
      terms: ['Q2', 'Q3'],
      note: 'Cover second half',
      expectedVersion: 7,
    });

    const [filter, update] = updateSpy.mock.calls[0] as any[];
    expect(filter.version).toBe(7);
    expect(filter.__v).toBe(4);
    expect(filter.sharedAccess.$not.$elemMatch).toEqual({
      status: 'ACTIVE',
      terms: { $in: ['Q2', 'Q3'] },
    });
    expect(update.$inc).toEqual({ version: 1, __v: 1 });
  });

  it('allows an active shared contributor to view the final record as employee', () => {
    const service = serviceFor(sharedEmployeeId);
    const value = assignment({
      sharedAccess: [{
        sharedWithEmployeeId: sharedEmployeeId,
        terms: ['Q2'],
        status: 'ACTIVE',
      }],
    });

    expect(service.resolveObjectiveFinalRecordViewActor(value)).toBe('EMPLOYEE');
  });

  it('returns only the contributor own share details and falls back to period terms', () => {
    const otherEmployeeId = new Types.ObjectId();
    const service = serviceFor(sharedEmployeeId);
    const value = assignment({
      objectiveMasterId: new Types.ObjectId(),
      objectiveVersionId: new Types.ObjectId(),
      selectedTerms: [],
      frozenObjectiveSnapshot: {},
      values: {},
      sharedAccess: [
        {
          sharedWithEmployeeId: sharedEmployeeId,
          terms: ['Q2'],
          status: 'ACTIVE',
          note: 'Complete Q2 for the owner',
          sharedBy: ownerId,
          sharedAt: new Date('2026-07-15T10:00:00.000Z'),
        },
        {
          sharedWithEmployeeId: otherEmployeeId,
          terms: ['Q3'],
          status: 'ACTIVE',
          sharedBy: ownerId,
          sharedAt: new Date('2026-07-15T11:00:00.000Z'),
        },
      ],
    });
    jest.spyOn(service, 'resolveObjectiveEmployeeAssignmentEditState').mockReturnValue({ canEdit: true });
    jest.spyOn(service, 'resolveObjectiveManagerAssignmentEditState').mockReturnValue({ canEdit: false });
    jest.spyOn(service, 'resolveObjectiveEmployeeAssignmentTermStates').mockReturnValue([]);
    jest.spyOn(service, 'resolveObjectiveManagerAssignmentTermStates').mockReturnValue([]);
    jest.spyOn(service, 'resolveObjectiveFinalRecordReadiness').mockReturnValue({ availability: 'PENDING' });
    jest.spyOn(service, 'resolveObjectiveEmployeeAssignmentEditableTermsForActor').mockReturnValue(['Q2']);

    const result = service.mapObjectiveEmployeeAssignmentRecord(value, period);

    expect(result.selectedTerms).toEqual(period.terms);
    expect(result.sharedWithMe).toBe(true);
    expect(result.sharedTermsWithMe).toEqual(['Q2']);
    expect(result.employeeEditableTerms).toEqual(['Q2']);
    expect(result.sharedAccessForMe).toHaveLength(1);
    expect(result.sharedAccess).toHaveLength(1);
    expect(result.sharedAccess[0]).toMatchObject({
      sharedWithEmployeeId: sharedEmployeeId.toString(),
      terms: ['Q2'],
      note: 'Complete Q2 for the owner',
    });
  });

  it('keeps the complete share summary visible to the original assignee', () => {
    const service = serviceFor(ownerId);
    const value = assignment({
      sharedAccess: [
        { sharedWithEmployeeId: sharedEmployeeId, terms: ['Q2'], status: 'ACTIVE' },
        { sharedWithEmployeeId: new Types.ObjectId(), terms: ['Q3'], status: 'ACTIVE' },
      ],
    });

    expect(service.canActorViewAllObjectiveAssignmentSharedAccess(value, true)).toBe(true);
  });

  it('changes open shared terms while preserving submitted terms with the existing contributor', async () => {
    const service = serviceFor(ownerId);
    const accessId = new Types.ObjectId();
    const nextEmployeeId = new Types.ObjectId();
    const source: any = assignment({
      termStates: [
        { term: 'Q1', status: 'OPEN' },
        { term: 'Q2', status: 'OPEN' },
        { term: 'Q3', status: ObjectiveEmployeeAssignmentStatus.SUBMITTED },
        { term: 'Q4', status: 'OPEN' },
      ],
      sharedAccess: [{
        _id: accessId,
        sharedWithEmployeeId: sharedEmployeeId,
        terms: ['Q2', 'Q3'],
        status: 'ACTIVE',
        sharedBy: ownerId,
        sharedAt: new Date('2026-07-15T10:00:00.000Z'),
      }],
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    });
    jest.spyOn(service, 'loadObjectiveEmployeeAssignment').mockResolvedValue(source);
    jest.spyOn(service, 'loadObjectiveAssignmentPeriod').mockResolvedValue(period);
    jest.spyOn(service, 'syncObjectiveEmployeeAssignmentTerms').mockResolvedValue(undefined);
    jest.spyOn(service, 'loadObjectiveEmployeeAssignmentForResponse').mockResolvedValue(source);
    jest.spyOn(service, 'mapObjectiveEmployeeAssignmentRecord').mockReturnValue({ id: assignmentId.toString() });
    const auditSpy = jest.spyOn(service, 'audit').mockResolvedValue(undefined);
    jest.spyOn(User, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: nextEmployeeId }) } as any);

    await service.changeObjectiveEmployeeAssignmentShare(assignmentId.toString(), {
      sharedAccessId: accessId.toString(),
      sharedWithEmployeeId: nextEmployeeId.toString(),
      terms: ['Q2', 'Q4'],
      note: 'Move the remaining work',
      expectedVersion: 7,
    });

    expect(source.sharedAccess).toEqual(expect.arrayContaining([
      expect.objectContaining({
        _id: accessId,
        sharedWithEmployeeId: sharedEmployeeId,
        terms: ['Q3'],
        status: 'ACTIVE',
      }),
      expect.objectContaining({
        terms: ['Q2'],
        status: 'REVOKED',
        revocationReason: 'Sharing changed by original assignee',
      }),
      expect.objectContaining({
        sharedWithEmployeeId: nextEmployeeId,
        terms: ['Q2', 'Q4'],
        status: 'ACTIVE',
        note: 'Move the remaining work',
      }),
    ]));
    expect(source.markModified).toHaveBeenCalledWith('sharedAccess');
    expect(source.save).toHaveBeenCalledTimes(1);
    expect(auditSpy).toHaveBeenCalledWith(
      'PMS_OBJECTIVE_EMPLOYEE_ASSIGNMENT_SHARE_CHANGED',
      'OBJECTIVE_EMPLOYEE_ASSIGNMENT',
      assignmentId.toString(),
      expect.anything(),
      expect.anything(),
      'Move the remaining work',
      expect.objectContaining({
        terms: ['Q2', 'Q4'],
        previousTerms: ['Q2'],
        sharedWithEmployeeId: nextEmployeeId.toString(),
        previousSharedWithEmployeeId: sharedEmployeeId.toString(),
      }),
    );
  });

  it('rejects a sharing change that does not alter employee, terms, or note', async () => {
    const service = serviceFor(ownerId);
    const accessId = new Types.ObjectId();
    const source = assignment({
      sharedAccess: [{
        _id: accessId,
        sharedWithEmployeeId: sharedEmployeeId,
        terms: ['Q2'],
        status: 'ACTIVE',
        note: 'Existing note',
      }],
    });
    jest.spyOn(service, 'loadObjectiveEmployeeAssignment').mockResolvedValue(source);
    jest.spyOn(service, 'loadObjectiveAssignmentPeriod').mockResolvedValue(period);
    jest.spyOn(service, 'syncObjectiveEmployeeAssignmentTerms').mockResolvedValue(undefined);
    jest.spyOn(User, 'findOne').mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: sharedEmployeeId }) } as any);

    await expect(service.changeObjectiveEmployeeAssignmentShare(assignmentId.toString(), {
      sharedAccessId: accessId.toString(),
      sharedWithEmployeeId: sharedEmployeeId.toString(),
      terms: ['Q2'],
      note: 'Existing note',
      expectedVersion: 7,
    })).rejects.toThrow('No sharing changes were made');
  });

  it('converts an optimistic concurrency failure into a refresh instruction', async () => {
    const service = serviceFor(ownerId);
    await expect(service.saveObjectiveEmployeeAssignmentSharingChange({
      save: jest.fn().mockRejectedValue(Object.assign(new Error('version conflict'), { name: 'VersionError' })),
    })).rejects.toThrow('Objective assignment was updated by another request. Refresh and try again.');
  });

  it('returns a sanitized sharing activity feed to an authorized assignee', async () => {
    const service = serviceFor(ownerId);
    jest.spyOn(service, 'loadObjectiveEmployeeAssignment').mockResolvedValue(assignment());
    jest.spyOn(auditService, 'getEntityHistory').mockResolvedValue([{
      _id: 'audit-1',
      entityType: 'OBJECTIVE_EMPLOYEE_ASSIGNMENT',
      entityId: assignmentId,
      action: 'PMS_OBJECTIVE_EMPLOYEE_ASSIGNMENT_SHARED_SUBMITTED',
      actorId: sharedEmployeeId,
      actorName: 'Priya Raman',
      actorRole: 'EMPLOYEE',
      previousValue: { privateValue: 'must not be returned' },
      newValue: { privateValue: 'must not be returned' },
      metadata: {
        terms: ['Q2'],
        sharedWithEmployeeId: sharedEmployeeId.toString(),
        onBehalfOfEmployeeId: ownerId.toString(),
      },
      timestamp: new Date('2026-07-16T08:00:00.000Z'),
      createdAt: new Date('2026-07-16T08:00:00.000Z'),
    }]);
    jest.spyOn(User, 'find').mockReturnValue({
      select: () => ({
        lean: async () => [
          { _id: sharedEmployeeId, name: 'Priya Raman' },
          { _id: ownerId, name: 'Original Assignee' },
        ],
      }),
    } as any);

    const result = await service.getObjectiveEmployeeAssignmentActivity(assignmentId.toString());

    expect(result).toEqual([expect.objectContaining({
      action: 'PMS_OBJECTIVE_EMPLOYEE_ASSIGNMENT_SHARED_SUBMITTED',
      actorName: 'Priya Raman',
      terms: ['Q2'],
      sharedWithEmployeeName: 'Priya Raman',
      onBehalfOfEmployeeName: 'Original Assignee',
    })]);
    expect(result[0]).not.toHaveProperty('previousValue');
    expect(result[0]).not.toHaveProperty('newValue');
  });

  it('does not allow a submitted term to be reassigned', async () => {
    const service = serviceFor(ownerId);
    const accessId = new Types.ObjectId();
    const source = assignment({
      termStates: [
        { term: 'Q1', status: 'OPEN' },
        { term: 'Q2', status: ObjectiveEmployeeAssignmentStatus.SUBMITTED },
        { term: 'Q3', status: 'OPEN' },
        { term: 'Q4', status: 'OPEN' },
      ],
      sharedAccess: [{
        _id: accessId,
        sharedWithEmployeeId: sharedEmployeeId,
        terms: ['Q2'],
        status: 'ACTIVE',
      }],
    });
    jest.spyOn(service, 'loadObjectiveEmployeeAssignment').mockResolvedValue(source);
    jest.spyOn(service, 'loadObjectiveAssignmentPeriod').mockResolvedValue(period);
    jest.spyOn(service, 'syncObjectiveEmployeeAssignmentTerms').mockResolvedValue(undefined);

    await expect(service.changeObjectiveEmployeeAssignmentShare(assignmentId.toString(), {
      sharedAccessId: accessId.toString(),
      sharedWithEmployeeId: new Types.ObjectId().toString(),
      terms: ['Q2'],
      expectedVersion: 7,
    })).rejects.toThrow('Q2 is submitted or closed and cannot be reassigned');
  });

  it('requires an audit reason before revoking open shared terms', async () => {
    const service = serviceFor(ownerId);
    const source = assignment({
      sharedAccess: [{
        _id: new Types.ObjectId(),
        sharedWithEmployeeId: sharedEmployeeId,
        terms: ['Q2'],
        status: 'ACTIVE',
      }],
    });
    jest.spyOn(service, 'loadObjectiveEmployeeAssignment').mockResolvedValue(source);
    jest.spyOn(service, 'loadObjectiveAssignmentPeriod').mockResolvedValue(period);
    jest.spyOn(service, 'syncObjectiveEmployeeAssignmentTerms').mockResolvedValue(undefined);

    await expect(service.revokeObjectiveEmployeeAssignmentShare(assignmentId.toString(), {
      sharedWithEmployeeId: sharedEmployeeId.toString(),
      terms: ['Q2'],
      expectedVersion: 7,
    })).rejects.toThrow('Revocation reason is required');
  });
});
