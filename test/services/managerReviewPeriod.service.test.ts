import { Types } from 'mongoose';
import { AssessmentTermCode, AssessmentTermType, TermWorkflowState } from '../../src/constants/pms.enums';
import { AnnualCycle } from '../../src/models/pms-annual-cycle.model';
import { AnnualAssignment } from '../../src/models/pms-annual-assignment.model';
import { ManagerReviewPeriodAssignment } from '../../src/models/pms-manager-review-period-assignment.model';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { ManagerReviewPeriodService } from '../../src/services/managerReviewPeriod.service';

jest.mock('../../src/models/pms-annual-assignment.model', () => ({
  AnnualAssignment: {
    findById: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-annual-cycle.model', () => ({
  AnnualCycle: {
    findById: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-manager-review-period-assignment.model', () => ({
  ManagerReviewPeriodAssignment: {
    find: jest.fn(),
    insertMany: jest.fn(),
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
    (AnnualAssignment.findById as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(undefined),
      }),
    });
    (AnnualCycle.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(undefined),
    });
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

  it('does not treat objective-approved terms as manager-ready before promotion', async () => {
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

    await expect(isEligible()).resolves.toBe(false);
  });

  it('does not open while any included term is still in employee achievement', async () => {
    mockTermAssignments([
      {
        _id: termAssignmentId1,
        cycleTermId: termCycleId1,
        termState: TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
      },
      {
        _id: termAssignmentId2,
        cycleTermId: termCycleId2,
        termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
      },
    ]);
    mockTermCycles([
      { _id: termCycleId1, achievementEnabled: true },
      { _id: termCycleId2, achievementEnabled: true },
    ]);

    await expect(isEligible()).resolves.toBe(false);
  });

  it('allows grouped review only after every included term reaches manager review', async () => {
    mockTermAssignments([
      {
        _id: termAssignmentId1,
        cycleTermId: termCycleId1,
        termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
      },
      {
        _id: termAssignmentId2,
        cycleTermId: termCycleId2,
        termState: TermWorkflowState.TERM_FINALIZED,
      },
    ]);
    mockTermCycles([
      { _id: termCycleId1, achievementEnabled: true },
      { _id: termCycleId2, achievementEnabled: true },
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

  it('resets a stale grouped review and keeps it closed while an included term is still in achievement', async () => {
    const staleReview = {
      _id: new Types.ObjectId(),
      cycleId: new Types.ObjectId(),
      reviewState: 'MANAGER_REVIEW_OPEN',
      includedTermAssignmentIds: [termAssignmentId1, termAssignmentId2],
      previousReviewState: undefined,
      version: 3,
      save: jest.fn().mockResolvedValue(undefined),
    };
    (ManagerReviewPeriodAssignment.find as jest.Mock).mockResolvedValue([staleReview]);
    (service as unknown as { audit: jest.Mock }).audit = jest.fn();
    mockTermAssignments([
      {
        _id: termAssignmentId1,
        cycleTermId: termCycleId1,
        termState: TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
      },
      {
        _id: termAssignmentId2,
        cycleTermId: termCycleId2,
        termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
      },
    ]);
    mockTermCycles([
      { _id: termCycleId1, achievementEnabled: true },
      { _id: termCycleId2, achievementEnabled: true },
    ]);

    const result = await service.openEligiblePeriodsForCycle(staleReview.cycleId.toString());

    expect(result.opened).toBe(0);
    expect(result.notReady).toBe(1);
    expect(staleReview.reviewState).toBe('NOT_STARTED');
    expect(staleReview.save).toHaveBeenCalledTimes(1);
    expect((service as unknown as { audit: jest.Mock }).audit).toHaveBeenCalledWith(
      'PMS_GROUPED_MANAGER_REVIEW_RESET_NOT_READY',
      'MANAGER_REVIEW_PERIOD',
      staleReview._id.toString(),
      { reviewState: 'MANAGER_REVIEW_OPEN' },
      { reviewState: 'NOT_STARTED' },
      expect.any(String),
    );
  });

  it('does not bulk-promote annual review terms that are still in achievement', async () => {
    const annualReview = {
      _id: new Types.ObjectId(),
      cycleId: new Types.ObjectId(),
      reviewCode: 'ANNUAL',
      reviewState: 'NOT_STARTED',
      includedTermAssignmentIds: [termAssignmentId1, termAssignmentId2],
      version: 1,
      save: jest.fn().mockResolvedValue(undefined),
    };
    (ManagerReviewPeriodAssignment.find as jest.Mock).mockResolvedValue([annualReview]);
    mockTermAssignments([
      {
        _id: termAssignmentId1,
        cycleTermId: termCycleId1,
        termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
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

    const result = await service.openEligiblePeriodsForCycle(
      annualReview.cycleId.toString(),
      { ignoreWindowDates: true, promoteIncludedTerms: false },
    );

    expect(result.opened).toBe(0);
    expect(result.notReady).toBe(1);
    expect(annualReview.reviewState).toBe('NOT_STARTED');
    expect(annualReview.save).not.toHaveBeenCalled();
  });

  it('opens the annual manager review after every included term reaches manager review', async () => {
    const annualReview = {
      _id: new Types.ObjectId(),
      cycleId: new Types.ObjectId(),
      reviewCode: 'ANNUAL',
      reviewState: 'NOT_STARTED',
      previousReviewState: undefined,
      includedTermAssignmentIds: [termAssignmentId1, termAssignmentId2],
      version: 1,
      save: jest.fn().mockResolvedValue(undefined),
    };
    (ManagerReviewPeriodAssignment.find as jest.Mock).mockResolvedValue([annualReview]);
    (service as unknown as { audit: jest.Mock }).audit = jest.fn();
    mockTermAssignments([
      {
        _id: termAssignmentId1,
        cycleTermId: termCycleId1,
        termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
      },
      {
        _id: termAssignmentId2,
        cycleTermId: termCycleId2,
        termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
      },
    ]);
    mockTermCycles([
      { _id: termCycleId1, achievementEnabled: true },
      { _id: termCycleId2, achievementEnabled: true },
    ]);

    const result = await service.openEligiblePeriodsForCycle(
      annualReview.cycleId.toString(),
      { ignoreWindowDates: true, promoteIncludedTerms: false },
    );

    expect(result.opened).toBe(1);
    expect(result.notReady).toBe(0);
    expect(annualReview.reviewState).toBe('MANAGER_REVIEW_OPEN');
    expect(annualReview.save).toHaveBeenCalledTimes(1);
  });

  describe('manager review cadence period creation', () => {
    const annualAssignment = {
      _id: new Types.ObjectId(),
      cycleId: new Types.ObjectId(),
      employeeId: new Types.ObjectId(),
      assignedManagerId: new Types.ObjectId(),
      templateVersionId: new Types.ObjectId(),
      applicableTerms: [
        AssessmentTermCode.Q1,
        AssessmentTermCode.Q2,
        AssessmentTermCode.Q3,
        AssessmentTermCode.Q4,
      ],
    };

    function termAssignments(codes: AssessmentTermCode[]) {
      return codes.map((code) => ({
        _id: new Types.ObjectId(),
        assessmentTermCode: code,
      }));
    }

    function mockCycle(input: {
      assessmentTermType: AssessmentTermType;
      reviewCadenceConfig?: Record<string, unknown>;
    }) {
      (AnnualCycle.findById as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: annualAssignment.cycleId,
          assessmentTermType: input.assessmentTermType,
          reviewCadenceConfig: input.reviewCadenceConfig,
        }),
      });
    }

    it.each([
      ['quarterly', AssessmentTermType.QUARTERLY],
      ['half-yearly', AssessmentTermType.HALF_YEARLY],
      ['yearly', AssessmentTermType.YEARLY],
    ])('keeps normal %s flow term-based and creates no grouped review periods', async (_label, assessmentTermType) => {
      mockCycle({
        assessmentTermType,
        reviewCadenceConfig: {
          managerReviewMode: 'TERM',
          managerReviewCadence: 'SAME_AS_EMPLOYEE',
        },
      });

      await expect(
        service.createPeriodsForAnnualAssignment(
          {
            ...annualAssignment,
            applicableTerms:
              assessmentTermType === AssessmentTermType.YEARLY
                ? [AssessmentTermCode.Y1]
                : assessmentTermType === AssessmentTermType.HALF_YEARLY
                  ? [AssessmentTermCode.H1, AssessmentTermCode.H2]
                  : annualAssignment.applicableTerms,
          } as any,
          termAssignments(
            assessmentTermType === AssessmentTermType.YEARLY
              ? [AssessmentTermCode.Y1]
              : assessmentTermType === AssessmentTermType.HALF_YEARLY
                ? [AssessmentTermCode.H1, AssessmentTermCode.H2]
                : annualAssignment.applicableTerms,
          ) as any,
        ),
      ).resolves.toEqual([]);

      expect(ManagerReviewPeriodAssignment.insertMany).not.toHaveBeenCalled();
    });

    it('creates H1 and H2 grouped manager review periods for quarterly employee terms', async () => {
      mockCycle({
        assessmentTermType: AssessmentTermType.QUARTERLY,
        reviewCadenceConfig: {
          managerReviewMode: 'GROUPED',
          managerReviewCadence: 'HALF_YEARLY',
        },
      });
      (ManagerReviewPeriodAssignment.insertMany as jest.Mock).mockResolvedValue([]);

      await service.createPeriodsForAnnualAssignment(
        annualAssignment as any,
        termAssignments(annualAssignment.applicableTerms) as any,
      );

      const payloads = (ManagerReviewPeriodAssignment.insertMany as jest.Mock).mock.calls[0][0];
      expect(payloads.map((payload: any) => payload.reviewCode)).toEqual(['H1', 'H2']);
      expect(payloads[0].includedTerms).toEqual([AssessmentTermCode.Q1, AssessmentTermCode.Q2]);
      expect(payloads[1].includedTerms).toEqual([AssessmentTermCode.Q3, AssessmentTermCode.Q4]);
      expect(payloads[0].anchorTerm).toBe(AssessmentTermCode.Q2);
      expect(payloads[1].anchorTerm).toBe(AssessmentTermCode.Q4);
    });

    it.each([
      ['quarterly annual', AssessmentTermType.QUARTERLY, [
        AssessmentTermCode.Q1,
        AssessmentTermCode.Q2,
        AssessmentTermCode.Q3,
        AssessmentTermCode.Q4,
      ], AssessmentTermCode.Q4],
      ['half-yearly annual', AssessmentTermType.HALF_YEARLY, [
        AssessmentTermCode.H1,
        AssessmentTermCode.H2,
      ], AssessmentTermCode.H2],
      ['yearly annual', AssessmentTermType.YEARLY, [
        AssessmentTermCode.Y1,
      ], AssessmentTermCode.Y1],
    ])('creates one grouped %s manager review period', async (_label, assessmentTermType, terms, anchorTerm) => {
      mockCycle({
        assessmentTermType,
        reviewCadenceConfig: {
          managerReviewMode: 'GROUPED',
          managerReviewCadence: 'ANNUAL',
        },
      });
      (ManagerReviewPeriodAssignment.insertMany as jest.Mock).mockResolvedValue([]);

      await service.createPeriodsForAnnualAssignment(
        {
          ...annualAssignment,
          applicableTerms: terms,
        } as any,
        termAssignments(terms) as any,
      );

      const payloads = (ManagerReviewPeriodAssignment.insertMany as jest.Mock).mock.calls[0][0];
      expect(payloads).toHaveLength(1);
      expect(payloads[0].reviewCode).toBe('ANNUAL');
      expect(payloads[0].label).toBe('Annual Manager Review');
      expect(payloads[0].includedTerms).toEqual(terms);
      expect(payloads[0].anchorTerm).toBe(anchorTerm);
    });
  });
});
