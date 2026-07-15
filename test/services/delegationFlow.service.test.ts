import { Types } from 'mongoose';
import { AnnualCycle } from '../../src/models/pms-annual-cycle.model';
import { Delegation } from '../../src/models/pms-delegation.model';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { DelegationService } from '../../src/services/delegation.service';
import { ManagerReviewPeriodService } from '../../src/services/managerReviewPeriod.service';
import type { RequestContext } from '../../src/types/context';

jest.mock('../../src/models/pms-delegation.model', () => ({
  Delegation: {
    find: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-annual-cycle.model', () => ({
  AnnualCycle: {
    findById: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-term-assignment.model', () => ({
  TermAssignment: {
    find: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-term-cycle.model', () => ({
  TermCycle: {
    find: jest.fn(),
  },
}));

function mockFindOneLean(value: unknown) {
  (Delegation.findOne as jest.Mock).mockReturnValue({
    lean: jest.fn().mockResolvedValue(value),
  });
}

const adminUserId = new Types.ObjectId();

function context(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    requestId: 'delegation-flow-test',
    reqRole: 'ADMIN',
    pmsCurrentDate: new Date('2027-07-03T04:30:00.000Z'),
    user: {
      _id: adminUserId,
      email: 'admin@test.local',
      name: 'Admin',
      role: 'ADMIN',
      departmentId: '',
      active: true,
      country: '',
      currency: '',
      licenseType: '',
      portalAccess: true,
    },
    ...overrides,
  };
}

function service() {
  return new DelegationService(context()) as unknown as {
    assertNoOverlappingDelegation(input: {
      delegatorUserId: string;
      delegateUserId: string;
      scopeType: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS';
      annualAssignmentId?: string;
      cycleId?: string;
      validFrom: Date;
      validTo: Date;
    }): Promise<void>;
    assertAssignmentHasDelegableWork(input: {
      annualAssignmentId: string;
      delegatorUserId: string;
      scopeType: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS';
    }): Promise<void>;
    startOfDay(value: Date | string): Date;
    endOfDay(value: Date | string): Date;
    toDelegationResponse(delegation: unknown): unknown;
    formatDate(value: Date): string;
  };
}

describe('PMS delegation full-flow guardrails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockDelegableAssignment(input: {
    cycleId: Types.ObjectId;
    cycleTermId: Types.ObjectId;
    cycleMode: 'TERM' | 'GROUPED';
    objectiveEndDate: Date;
    termState?: string;
  }) {
    (TermAssignment.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            termState: input.termState ?? 'MANAGER_REVIEW_OPEN',
            cycleId: input.cycleId,
            cycleTermId: input.cycleTermId,
          },
        ]),
      }),
    });
    (AnnualCycle.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          reviewCadenceConfig: {
            managerReviewMode: input.cycleMode,
          },
        }),
      }),
    });
    (TermCycle.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            objectiveSettingWindow: {
              startDate: new Date('2027-10-01T00:00:00.000Z'),
              endDate: input.objectiveEndDate,
            },
            objectiveApprovalWindow: {
              startDate: new Date('2027-10-08T00:00:00.000Z'),
              endDate: input.objectiveEndDate,
            },
          },
        ]),
      }),
    });
  }

  it('stores date-only input as the intended local day and returns date-only values', () => {
    const delegationService = service();

    const validFrom = delegationService.startOfDay('2026-07-14');
    const validTo = delegationService.endOfDay('2026-07-14');
    const response = delegationService.toDelegationResponse({
      validFrom,
      validTo,
    }) as { validFrom: string; validTo: string };

    expect(validFrom.toISOString()).toBe('2026-07-13T18:30:00.000Z');
    expect(validTo.toISOString()).toBe('2026-07-14T18:29:59.999Z');
    expect(response.validFrom).toBe('2026-07-14');
    expect(response.validTo).toBe('2026-07-14');
    expect(delegationService.formatDate(validFrom)).toBe('14/07/2026');
  });

  it('blocks only overlapping duplicates for the same delegate, scope, and assignment', async () => {
    const delegatorUserId = new Types.ObjectId().toString();
    const delegateUserId = new Types.ObjectId().toString();
    const annualAssignmentId = new Types.ObjectId().toString();
    const cycleId = new Types.ObjectId().toString();
    const validFrom = new Date('2027-07-01T00:00:00.000Z');
    const validTo = new Date('2027-07-07T23:59:59.999Z');

    mockFindOneLean({
      _id: new Types.ObjectId(),
      delegateUserId: new Types.ObjectId(delegateUserId),
    });

    await expect(
      service().assertNoOverlappingDelegation({
        delegatorUserId,
        delegateUserId,
        scopeType: 'PMS_REVIEWS',
        annualAssignmentId,
        cycleId,
        validFrom,
        validTo,
      }),
    ).rejects.toThrow('overlapping active delegation already exists');

    const query = (Delegation.findOne as jest.Mock).mock.calls[0][0];
    expect(query.delegatorUserId.toString()).toBe(delegatorUserId);
    expect(query.delegateUserId.toString()).toBe(delegateUserId);
    expect(query.scopeType.$in).toEqual(['ALL', 'PMS_REVIEWS']);
    expect(query.$and[1].$or).toEqual([
      { annualAssignmentId: new Types.ObjectId(annualAssignmentId) },
      { annualAssignmentId: { $exists: false } },
      { annualAssignmentId: null },
    ]);
  });

  it('treats ALL scope as conflicting with an overlapping review delegation for the same delegate', async () => {
    mockFindOneLean({ _id: new Types.ObjectId() });

    await expect(
      service().assertNoOverlappingDelegation({
        delegatorUserId: new Types.ObjectId().toString(),
        delegateUserId: new Types.ObjectId().toString(),
        scopeType: 'ALL',
        annualAssignmentId: new Types.ObjectId().toString(),
        cycleId: new Types.ObjectId().toString(),
        validFrom: new Date('2027-07-01T00:00:00.000Z'),
        validTo: new Date('2027-07-07T23:59:59.999Z'),
      }),
    ).rejects.toThrow('overlapping active delegation already exists');

    expect((Delegation.findOne as jest.Mock).mock.calls[0][0].scopeType.$in)
      .toEqual(['ALL', 'PMS_OBJECTIVES', 'PMS_REVIEWS']);
  });

  it('does not make objectives-only conflict with reviews-only for the same delegate', async () => {
    mockFindOneLean(null);

    await expect(
      service().assertNoOverlappingDelegation({
        delegatorUserId: new Types.ObjectId().toString(),
        delegateUserId: new Types.ObjectId().toString(),
        scopeType: 'PMS_OBJECTIVES',
        annualAssignmentId: new Types.ObjectId().toString(),
        cycleId: new Types.ObjectId().toString(),
        validFrom: new Date('2027-07-01T00:00:00.000Z'),
        validTo: new Date('2027-07-07T23:59:59.999Z'),
      }),
    ).resolves.toBeUndefined();

    expect((Delegation.findOne as jest.Mock).mock.calls[0][0].scopeType.$in)
      .toEqual(['ALL', 'PMS_OBJECTIVES']);
  });

  it('lets non-overlapping dates pass for the same delegate and assignment', async () => {
    mockFindOneLean(null);

    await expect(
      service().assertNoOverlappingDelegation({
        delegatorUserId: new Types.ObjectId().toString(),
        delegateUserId: new Types.ObjectId().toString(),
        scopeType: 'PMS_REVIEWS',
        annualAssignmentId: new Types.ObjectId().toString(),
        cycleId: new Types.ObjectId().toString(),
        validFrom: new Date('2027-07-08T00:00:00.000Z'),
        validTo: new Date('2027-07-14T23:59:59.999Z'),
      }),
    ).resolves.toBeUndefined();
  });

  it('blocks assignment-level duplicate when a broad delegation already covers the same delegate', async () => {
    const assignmentId = new Types.ObjectId().toString();
    mockFindOneLean({ _id: new Types.ObjectId(), annualAssignmentId: undefined });

    await expect(
      service().assertNoOverlappingDelegation({
        delegatorUserId: new Types.ObjectId().toString(),
        delegateUserId: new Types.ObjectId().toString(),
        scopeType: 'PMS_REVIEWS',
        annualAssignmentId: assignmentId,
        cycleId: new Types.ObjectId().toString(),
        validFrom: new Date('2027-07-01T00:00:00.000Z'),
        validTo: new Date('2027-07-07T23:59:59.999Z'),
      }),
    ).rejects.toThrow('overlapping active delegation already exists');

    expect((Delegation.findOne as jest.Mock).mock.calls[0][0].$and[1].$or)
      .toContainEqual({ annualAssignmentId: { $exists: false } });
  });

  it('returns undefined for invalid date-only output instead of shifting it', () => {
    const response = service().toDelegationResponse({
      validFrom: 'not-a-date',
      validTo: null,
    }) as { validFrom?: string; validTo?: string };

    expect(response.validFrom).toBeUndefined();
    expect(response.validTo).toBeUndefined();
  });

  it('allows objective delegation in grouped mode when a future objective window is still available', async () => {
    mockDelegableAssignment({
      cycleId: new Types.ObjectId(),
      cycleTermId: new Types.ObjectId(),
      cycleMode: 'GROUPED',
      objectiveEndDate: new Date('2027-10-15T18:29:59.999Z'),
      termState: 'NOT_STARTED',
    });

    await expect(
      service().assertAssignmentHasDelegableWork({
        annualAssignmentId: new Types.ObjectId().toString(),
        delegatorUserId: new Types.ObjectId().toString(),
        scopeType: 'PMS_OBJECTIVES',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects objective delegation in grouped mode once that term is already objective-approved', async () => {
    mockDelegableAssignment({
      cycleId: new Types.ObjectId(),
      cycleTermId: new Types.ObjectId(),
      cycleMode: 'GROUPED',
      objectiveEndDate: new Date('2027-10-15T18:29:59.999Z'),
      termState: 'OBJECTIVE_APPROVED',
    });

    await expect(
      service().assertAssignmentHasDelegableWork({
        annualAssignmentId: new Types.ObjectId().toString(),
        delegatorUserId: new Types.ObjectId().toString(),
        scopeType: 'PMS_OBJECTIVES',
      }),
    ).rejects.toThrow('Objective delegation is not allowed');
  });

  it('keeps normal flow state-based and rejects objective delegation after review opens', async () => {
    mockDelegableAssignment({
      cycleId: new Types.ObjectId(),
      cycleTermId: new Types.ObjectId(),
      cycleMode: 'TERM',
      objectiveEndDate: new Date('2027-10-15T18:29:59.999Z'),
    });

    await expect(
      service().assertAssignmentHasDelegableWork({
        annualAssignmentId: new Types.ObjectId().toString(),
        delegatorUserId: new Types.ObjectId().toString(),
        scopeType: 'PMS_OBJECTIVES',
      }),
    ).rejects.toThrow('Objective delegation is not allowed');
  });

  it('allows the same delegator, date, scope, and assignment to be assigned to another delegate', async () => {
    const delegatorUserId = new Types.ObjectId().toString();
    const sriramDelegateId = new Types.ObjectId().toString();

    mockFindOneLean(null);

    await expect(
      service().assertNoOverlappingDelegation({
        delegatorUserId,
        delegateUserId: sriramDelegateId,
        scopeType: 'PMS_REVIEWS',
        annualAssignmentId: new Types.ObjectId().toString(),
        cycleId: new Types.ObjectId().toString(),
        validFrom: new Date('2027-07-01T00:00:00.000Z'),
        validTo: new Date('2027-07-07T23:59:59.999Z'),
      }),
    ).resolves.toBeUndefined();

    expect((Delegation.findOne as jest.Mock).mock.calls[0][0].delegateUserId.toString())
      .toBe(sriramDelegateId);
  });

  it('allows the same delegate and same date on different assignment-specific delegations', async () => {
    const pravinAssignmentId = new Types.ObjectId().toString();
    const sriramAssignmentId = new Types.ObjectId().toString();

    mockFindOneLean(null);

    await expect(
      service().assertNoOverlappingDelegation({
        delegatorUserId: new Types.ObjectId().toString(),
        delegateUserId: new Types.ObjectId().toString(),
        scopeType: 'PMS_REVIEWS',
        annualAssignmentId: sriramAssignmentId,
        cycleId: new Types.ObjectId().toString(),
        validFrom: new Date('2027-07-01T00:00:00.000Z'),
        validTo: new Date('2027-07-07T23:59:59.999Z'),
      }),
    ).resolves.toBeUndefined();

    const assignmentConditions = (Delegation.findOne as jest.Mock).mock.calls[0][0].$and[1].$or;
    expect(assignmentConditions).toContainEqual({ annualAssignmentId: new Types.ObjectId(sriramAssignmentId) });
    expect(assignmentConditions).not.toContainEqual({ annualAssignmentId: new Types.ObjectId(pravinAssignmentId) });
  });

  it('maps active review delegations into grouped manager review list clauses', async () => {
    const delegateUserId = new Types.ObjectId().toString();
    const delegatorUserId = new Types.ObjectId();
    const annualAssignmentId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const lean = jest.fn().mockResolvedValue([
      {
        delegatorUserId,
        annualAssignmentId,
      },
      {
        delegatorUserId,
        cycleId,
      },
    ]);
    (Delegation.find as jest.Mock).mockReturnValue({ lean });

    const managerReviewService = new ManagerReviewPeriodService(context()) as unknown as {
      delegatedReviewPeriodClausesForActor(actorId: string): Promise<Record<string, unknown>[]>;
    };

    await expect(
      managerReviewService.delegatedReviewPeriodClausesForActor(delegateUserId),
    ).resolves.toEqual([
      {
        annualAssignmentId,
        managerId: delegatorUserId,
      },
      {
        managerId: delegatorUserId,
        cycleId,
      },
    ]);

    const query = (Delegation.find as jest.Mock).mock.calls[0][0];
    expect(query.delegateUserId.toString()).toBe(delegateUserId);
    expect(query.scopeType.$in).toEqual(['ALL', 'PMS_REVIEWS']);
  });
});
