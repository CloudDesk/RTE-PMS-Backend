import { Types } from 'mongoose';
import { TermWorkflowState } from '../../src/constants/pms.enums';
import { AnnualCycle } from '../../src/models/pms-annual-cycle.model';
import { AnnualAssignment } from '../../src/models/pms-annual-assignment.model';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { EmployeeAchievementSubmission } from '../../src/models/pms-employee-achievement-submission.model';
import { WorkflowSyncService } from '../../src/services/workflow-sync.service';
import { transitionTermAssignmentState } from '../../src/services/term-assignment-workflow.service';
import { accessService } from '../../src/services/access.service';

const mockOpenEligiblePeriodsForCycle = jest.fn();

jest.mock('../../src/services/term-assignment-workflow.service', () => ({
  transitionTermAssignmentState: jest.fn(),
}));

jest.mock('../../src/services/managerReviewPeriod.service', () => ({
  ManagerReviewPeriodService: jest.fn().mockImplementation(() => ({
    openEligiblePeriodsForCycle: mockOpenEligiblePeriodsForCycle,
  })),
}));

jest.mock('../../src/models/pms-annual-cycle.model', () => ({
  AnnualCycle: {
    findOne: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-annual-assignment.model', () => ({
  AnnualAssignment: {
    find: jest.fn(),
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

jest.mock('../../src/models/pms-employee-achievement-submission.model', () => ({
  EmployeeAchievementSubmissionStatus: {
    DRAFT: 'DRAFT',
    SUBMITTED: 'SUBMITTED',
    LOCKED: 'LOCKED',
  },
  EmployeeAchievementSubmission: {
    findOne: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-objective.model', () => ({
  Objective: {
    find: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-template-version.model', () => ({
  PmsTemplateVersion: {
    findById: jest.fn(),
  },
}));

jest.mock('../../src/services/access.service', () => ({
  accessService: {
    canPerform: jest.fn(),
  },
}));

jest.mock('../../src/services/workflow.service', () => ({
  workflowService: {
    validateTransition: jest.fn(() => ({ allowed: true })),
  },
}));

const actorId = new Types.ObjectId();
const cycleId = new Types.ObjectId();
const annualAssignmentId = new Types.ObjectId();
const termAssignmentId = new Types.ObjectId();

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function createService(currentDate: string) {
  return new WorkflowSyncService({
    requestId: 'automatic-sync-flow-test',
    reqRole: 'ADMIN',
    pmsCurrentDate: new Date(currentDate),
    user: {
      _id: actorId,
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
}

function termAssignment(state: TermWorkflowState = TermWorkflowState.NOT_STARTED) {
  return {
    _id: termAssignmentId,
    annualAssignmentId,
    cycleId,
    cycleTermId: new Types.ObjectId(),
    employeeId: new Types.ObjectId(),
    assignedManagerId: new Types.ObjectId(),
    assessmentTermCode: 'Q2',
    assessmentTermType: 'QUARTERLY',
    termLabel: 'Q2',
    termState: state,
  };
}

function termCycle() {
  return {
    _id: new Types.ObjectId(),
    cycleId,
    assessmentTermCode: 'Q2',
    assessmentTermType: 'QUARTERLY',
    objectiveSettingWindow: { startDate: date('2026-07-09'), endDate: date('2026-07-10') },
    objectiveApprovalWindow: { startDate: date('2026-07-11'), endDate: date('2026-07-14') },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: date('2026-07-15'),
      endDate: date('2026-09-15'),
      dueDate: date('2026-09-15'),
    },
    managerReviewWindow: { startDate: date('2026-09-16'), endDate: date('2026-09-22') },
    termFinalizationWindow: { startDate: date('2026-09-23'), endDate: date('2026-09-29') },
  };
}

function customContinueAchievementAssignment(start = '2026-07-15') {
  return {
    _id: annualAssignmentId,
    assignmentWindowSnapshot: {
      terms: {
        Q2: {
          windowSource: 'ASSIGNMENT_CUSTOM',
          customFlowMode: 'CONTINUE_FROM_ACHIEVEMENT',
          achievementSubmissionWindow: {
            enabled: true,
            startDate: date(start),
            endDate: date('2026-09-15'),
            dueDate: date('2026-09-15'),
          },
          managerReviewWindow: { startDate: date('2026-09-16'), endDate: date('2026-09-22') },
          termFinalizationWindow: { startDate: date('2026-09-23'), endDate: date('2026-09-29') },
        },
      },
    },
  };
}

function mockCommonQueries(
  assignmentState: TermWorkflowState,
  annualAssignment: Record<string, unknown> = { _id: annualAssignmentId },
) {
  const assignment = termAssignment(assignmentState);
  (AnnualCycle.findOne as jest.Mock).mockReturnValue({
    lean: jest.fn().mockResolvedValue({ _id: cycleId, isDeleted: false }),
  });
  (TermAssignment.find as jest.Mock).mockReturnValue({
    sort: jest.fn().mockResolvedValue([assignment]),
  });
  (TermCycle.find as jest.Mock).mockResolvedValue([termCycle()]);
  (AnnualAssignment.find as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([annualAssignment]),
    }),
  });
  (EmployeeAchievementSubmission.findOne as jest.Mock).mockReturnValue({
    lean: jest.fn().mockResolvedValue(undefined),
  });
  (transitionTermAssignmentState as jest.Mock).mockResolvedValue(assignment);
}

function mockGroupedAnnualCycle() {
  (AnnualCycle.findOne as jest.Mock).mockReturnValue({
    lean: jest.fn().mockResolvedValue({
      _id: cycleId,
      isDeleted: false,
      reviewCadenceConfig: {
        version: 1,
        managerReviewMode: 'GROUPED',
        managerReviewCadence: 'HALF_YEARLY',
        groups: [
          {
            reviewCode: 'H1',
            label: 'H1 Manager Review',
            includedTerms: ['Q1', 'Q2'],
            anchorTerm: 'Q2',
            windowSource: 'ANCHOR_TERM',
          },
          {
            reviewCode: 'H2',
            label: 'H2 Manager Review',
            includedTerms: ['Q3', 'Q4'],
            anchorTerm: 'Q4',
            windowSource: 'ANCHOR_TERM',
          },
        ],
        scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
        annualDecisionGate: 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED',
      },
    }),
  });
}

function mockAnnualManagerReviewCycle() {
  (AnnualCycle.findOne as jest.Mock).mockReturnValue({
    lean: jest.fn().mockResolvedValue({
      _id: cycleId,
      isDeleted: false,
      reviewCadenceConfig: {
        version: 1,
        managerReviewMode: 'GROUPED',
        managerReviewCadence: 'ANNUAL',
        groups: [
          {
            reviewCode: 'ANNUAL',
            label: 'Annual Manager Review',
            includedTerms: ['H1', 'H2'],
            anchorTerm: 'H2',
            windowSource: 'ANCHOR_TERM',
          },
        ],
        scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
        annualDecisionGate: 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED',
      },
    }),
  });
}

describe('Automatic workflow sync flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenEligiblePeriodsForCycle.mockResolvedValue({ checked: 0, opened: 0 });
    (accessService.canPerform as jest.Mock).mockResolvedValue({
      allowed: true,
      mappedRole: 'ADMIN',
    });
  });

  it('opens normal objective setting automatically when the normal objective setting window is active', async () => {
    mockCommonQueries(TermWorkflowState.NOT_STARTED);
    const service = createService('2026-07-09T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });

    expect(result.totalUpdated).toBe(1);
    expect(transitionTermAssignmentState).toHaveBeenCalledWith(
      termAssignmentId.toString(),
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Automatic daily PMS workflow sync',
      'ADMIN_WORKFLOW_SYNC',
      expect.objectContaining({
        source: 'AUTOMATIC_DAILY_SYNC',
        windowName: 'Objective Setting Window',
      }),
    );
  });

  it('does not jump normal late assignments during objective approval', async () => {
    mockCommonQueries(TermWorkflowState.NOT_STARTED);
    const service = createService('2026-07-11T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });

    expect(result.totalUpdated).toBe(0);
    expect(result.results[0].message).toBe('Objective setting window is not active for this employee.');
    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
  });

  it('opens custom continue-with-achievement automatically when the custom achievement window starts', async () => {
    mockCommonQueries(
      TermWorkflowState.NOT_STARTED,
      customContinueAchievementAssignment('2026-07-15'),
    );
    const service = createService('2026-07-15T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });

    expect(result.totalUpdated).toBe(1);
    expect((transitionTermAssignmentState as jest.Mock).mock.calls.map((call) => call[1])).toEqual([
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      TermWorkflowState.OBJECTIVE_APPROVED,
      TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
    ]);
    expect((transitionTermAssignmentState as jest.Mock).mock.calls[2][5]).toEqual(
      expect.objectContaining({
        source: 'AUTOMATIC_DAILY_SYNC',
        windowName: 'Achievement Submission Window',
        windowOverrideApplied: true,
      }),
    );
  });

  it('keeps custom continue-with-achievement scheduled before the custom achievement window starts', async () => {
    mockCommonQueries(
      TermWorkflowState.NOT_STARTED,
      customContinueAchievementAssignment('2026-07-15'),
    );
    const service = createService('2026-07-10T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });

    expect(result.totalUpdated).toBe(0);
    expect(result.results[0].message).toBe(
      'Custom achievement, manager review, or finalization window is not active for this employee.',
    );
    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
  });

  it('opens manager review and warns when employee achievement submission is missing', async () => {
    mockCommonQueries(TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN);
    const service = createService('2026-09-16T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });

    expect(result.totalUpdated).toBe(1);
    expect(result.results[0].warning).toContain('Employee achievement submission is not submitted or incomplete');
    expect(result.results[0].message).toContain('Warning: Employee achievement submission is not submitted or incomplete');
    expect(EmployeeAchievementSubmission.findOne).toHaveBeenCalledWith({
      termAssignmentId,
      isDeleted: false,
    });
    expect(transitionTermAssignmentState).toHaveBeenCalledWith(
      termAssignmentId.toString(),
      TermWorkflowState.MANAGER_REVIEW_OPEN,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Automatic daily PMS workflow sync',
      'ADMIN_WORKFLOW_SYNC',
      expect.objectContaining({
        source: 'AUTOMATIC_DAILY_SYNC',
        windowName: 'Manager Review Window',
      }),
    );
  });

  it('opens manager review without a warning when employee achievement is submitted', async () => {
    mockCommonQueries(TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN);
    (EmployeeAchievementSubmission.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ status: 'SUBMITTED' }),
    });
    const service = createService('2026-09-16T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });

    expect(result.totalUpdated).toBe(1);
    expect(result.results[0].warning).toBeUndefined();
    expect(result.results[0].message).toBe('Manager review window is eligible.');
  });

  it('does not open per-term manager review when grouped manager review is configured', async () => {
    mockCommonQueries(TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN);
    mockGroupedAnnualCycle();
    mockOpenEligiblePeriodsForCycle.mockResolvedValueOnce({ checked: 2, opened: 1 });
    const service = createService('2026-09-16T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });

    expect(result.totalUpdated).toBe(0);
    expect(result.groupedReviewPeriodsChecked).toBe(2);
    expect(result.groupedReviewPeriodsOpened).toBe(1);
    expect(result.results[0].message).toBe(
      'Grouped manager review is configured for this cycle. Manager review opens at the configured grouped review period.',
    );
    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
    expect(mockOpenEligiblePeriodsForCycle).toHaveBeenCalledWith(cycleId.toString(), {
      dryRun: false,
      ignoreWindowDates: false,
      promoteIncludedTerms: true,
    });
  });

  it('allows each term to reach manager review before opening an annual manager review', async () => {
    mockCommonQueries(TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN);
    mockAnnualManagerReviewCycle();
    const service = createService('2026-09-16T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });

    expect(result.totalUpdated).toBe(1);
    expect(transitionTermAssignmentState).toHaveBeenCalledWith(
      termAssignmentId.toString(),
      TermWorkflowState.MANAGER_REVIEW_OPEN,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Automatic daily PMS workflow sync',
      'ADMIN_WORKFLOW_SYNC',
      expect.objectContaining({
        source: 'AUTOMATIC_DAILY_SYNC',
        windowName: 'Manager Review Window',
      }),
    );
    expect(mockOpenEligiblePeriodsForCycle).toHaveBeenCalledWith(cycleId.toString(), {
      dryRun: false,
      ignoreWindowDates: false,
      promoteIncludedTerms: false,
    });
  });

  it('reports grouped manager review readiness during dry-run preview', async () => {
    mockCommonQueries(TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN);
    mockGroupedAnnualCycle();
    mockOpenEligiblePeriodsForCycle.mockResolvedValueOnce({ checked: 2, opened: 1 });
    const service = createService('2026-09-16T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      dryRun: true,
      ignoreWindowDates: true,
      reason: 'Manual admin workflow sync',
      source: 'ADMIN_MANUAL_SYNC',
    });

    expect(result.totalUpdated).toBe(0);
    expect(result.groupedReviewPeriodsChecked).toBe(2);
    expect(result.groupedReviewPeriodsReady).toBe(1);
    expect(result.groupedReviewPeriodsOpened).toBe(0);
    expect(result.results[0].status).toBe('SKIPPED');
    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
    expect(mockOpenEligiblePeriodsForCycle).toHaveBeenCalledWith(cycleId.toString(), {
      dryRun: true,
      ignoreWindowDates: true,
      promoteIncludedTerms: true,
    });
  });

  it('does not overwrite assignments that already moved forward', async () => {
    mockCommonQueries(
      TermWorkflowState.OBJECTIVE_SUBMITTED,
      customContinueAchievementAssignment('2026-07-15'),
    );
    const service = createService('2026-07-15T00:00:00.000Z');

    const result = await service.syncWorkflowStates(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });

    expect(result.totalUpdated).toBe(0);
    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
  });
});
