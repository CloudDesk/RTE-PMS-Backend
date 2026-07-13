import { Types } from 'mongoose';
import { TermWorkflowState } from '../../src/constants/pms.enums';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { ManagerReviewPeriodService } from '../../src/services/managerReviewPeriod.service';

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

describe('ManagerReviewPeriodService grouped review eligibility', () => {
  const service = new ManagerReviewPeriodService({
    requestId: 'manager-review-period-service-test',
    reqRole: 'ADMIN',
    user: {
      _id: new Types.ObjectId(),
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
  });

  const termAssignmentId1 = new Types.ObjectId();
  const termAssignmentId2 = new Types.ObjectId();
  const termCycleId1 = new Types.ObjectId();
  const termCycleId2 = new Types.ObjectId();

  const review = {
    includedTermAssignmentIds: [termAssignmentId1, termAssignmentId2],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockTermAssignments(
    assignments: Array<{
      _id: Types.ObjectId;
      cycleTermId: Types.ObjectId;
      termState: string;
    }>,
  ) {
    (TermAssignment.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(assignments),
    });
  }

  function mockTermCycles(
    cycles: Array<{
      _id: Types.ObjectId;
      achievementEnabled: boolean;
    }>,
  ) {
    (TermCycle.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(
          cycles.map((cycle) => ({
            _id: cycle._id,
            achievementSubmissionWindow: { enabled: cycle.achievementEnabled },
          })),
        ),
      }),
    });
  }

  async function isEligible() {
    return (service as unknown as {
      isReviewPeriodOpenEligible(input: unknown, ignoreWindowDates: boolean): Promise<boolean>;
    }).isReviewPeriodOpenEligible(review, true);
  }

  it('does not open while an achievement-enabled term is only objective-approved', async () => {
    mockTermAssignments([
      {
        _id: termAssignmentId1,
        cycleTermId: termCycleId1,
        termState: TermWorkflowState.OBJECTIVE_APPROVED,
      },
      {
        _id: termAssignmentId2,
        cycleTermId: termCycleId2,
        termState: TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
      },
    ]);
    mockTermCycles([
      { _id: termCycleId1, achievementEnabled: true },
      { _id: termCycleId2, achievementEnabled: true },
    ]);

    await expect(isEligible()).resolves.toBe(false);
  });

  it('allows objective-approved terms when achievement submission is disabled', async () => {
    mockTermAssignments([
      {
        _id: termAssignmentId1,
        cycleTermId: termCycleId1,
        termState: TermWorkflowState.OBJECTIVE_APPROVED,
      },
      {
        _id: termAssignmentId2,
        cycleTermId: termCycleId2,
        termState: TermWorkflowState.OBJECTIVE_APPROVED,
      },
    ]);
    mockTermCycles([
      { _id: termCycleId1, achievementEnabled: false },
      { _id: termCycleId2, achievementEnabled: false },
    ]);

    await expect(isEligible()).resolves.toBe(true);
  });

  it('requires every included term assignment to still exist', async () => {
    mockTermAssignments([
      {
        _id: termAssignmentId1,
        cycleTermId: termCycleId1,
        termState: TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
      },
    ]);
    mockTermCycles([{ _id: termCycleId1, achievementEnabled: true }]);

    await expect(isEligible()).resolves.toBe(false);
  });
});
