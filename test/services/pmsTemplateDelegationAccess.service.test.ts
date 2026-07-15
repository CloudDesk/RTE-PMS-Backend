import { Types } from 'mongoose';
import { Delegation } from '../../src/models/pms-delegation.model';
import { PmsTemplateService } from '../../src/services/pms-template.service';
import { accessService } from '../../src/services/access.service';
import type { RequestContext } from '../../src/types/context';

jest.mock('../../src/models/pms-delegation.model', () => ({
  Delegation: {
    findOne: jest.fn(),
  },
}));

jest.mock('../../src/services/access.service', () => ({
  accessService: {
    mapRole: jest.fn(),
    canPerform: jest.fn(),
  },
}));

function context(delegateUserId: Types.ObjectId): RequestContext {
  return {
    requestId: 'template-delegation-test',
    reqRole: 'MANAGER',
    pmsCurrentDate: new Date('2027-07-03T12:00:00.000Z'),
    user: {
      _id: delegateUserId,
      email: 'delegate@test.local',
      name: 'Delegate Manager',
      role: 'MANAGER',
      departmentId: '',
      active: true,
      country: '',
      currency: '',
      licenseType: '',
      portalAccess: true,
    },
  };
}

describe('PMS template runtime access delegation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (accessService.mapRole as jest.Mock).mockReturnValue('MANAGER');
    (accessService.canPerform as jest.Mock).mockResolvedValue({
      allowed: false,
      mappedRole: 'MANAGER',
      message: 'Managers can access only assigned employee PMS records.',
    });
  });

  it('allows delegated review template resolve using the PMS tester date', async () => {
    const delegateUserId = new Types.ObjectId();
    const delegatorUserId = new Types.ObjectId();
    const annualAssignmentId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();

    (Delegation.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    });

    const service = new PmsTemplateService(context(delegateUserId)) as unknown as {
      assertRuntimeTemplateAccess(
        annualAssignment: Record<string, unknown>,
        termAssignment: Record<string, unknown>,
        input: Record<string, unknown>,
      ): Promise<void>;
    };

    await expect(
      service.assertRuntimeTemplateAccess(
        {
          _id: annualAssignmentId,
          cycleId,
          employeeId: new Types.ObjectId(),
          assignedManagerId: delegatorUserId,
        },
        {
          assignedManagerId: delegatorUserId,
        },
        {
          role: 'MANAGER',
          workflowState: 'MANAGER_REVIEW_OPEN',
        },
      ),
    ).resolves.toBeUndefined();

    const query = (Delegation.findOne as jest.Mock).mock.calls[0][0];
    expect(query.delegateUserId.toString()).toBe(delegateUserId.toString());
    expect(query.delegatorUserId.toString()).toBe(delegatorUserId.toString());
    expect(query.validFrom.$lte.toISOString()).toBe('2027-07-03T12:00:00.000Z');
    expect(query.validTo.$gte.toISOString()).toBe('2027-07-03T12:00:00.000Z');
    expect(query.scopeType.$in).toEqual(['ALL', 'PMS_REVIEWS']);
    expect(query.$or).toContainEqual({ annualAssignmentId });
  });

  it('keeps normal denial when no active delegation matches', async () => {
    (Delegation.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const service = new PmsTemplateService(context(new Types.ObjectId())) as unknown as {
      assertRuntimeTemplateAccess(
        annualAssignment: Record<string, unknown>,
        termAssignment: Record<string, unknown>,
        input: Record<string, unknown>,
      ): Promise<void>;
    };

    await expect(
      service.assertRuntimeTemplateAccess(
        {
          _id: new Types.ObjectId(),
          cycleId: new Types.ObjectId(),
          employeeId: new Types.ObjectId(),
          assignedManagerId: new Types.ObjectId(),
        },
        {
          assignedManagerId: new Types.ObjectId(),
        },
        {
          role: 'MANAGER',
          workflowState: 'MANAGER_REVIEW_OPEN',
        },
      ),
    ).rejects.toThrow('Managers can access only assigned employee PMS records.');
  });
});
