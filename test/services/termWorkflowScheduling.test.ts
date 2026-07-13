import { Types } from 'mongoose';
import { AssignmentService } from '../../src/services/assignment.service';
import { WorkflowSyncService } from '../../src/services/workflow-sync.service';
import { TermWorkflowState } from '../../src/constants/pms.enums';
import { transitionTermAssignmentState } from '../../src/services/term-assignment-workflow.service';
import { AnnualAssignment } from '../../src/models/pms-annual-assignment.model';
import { AnnualCycle } from '../../src/models/pms-annual-cycle.model';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
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

jest.mock('../../src/models/pms-annual-assignment.model', () => ({
  AnnualAssignment: {
    find: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-annual-cycle.model', () => ({
  AnnualCycle: {
    findOne: jest.fn(),
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

jest.mock('../../src/services/access.service', () => ({
  accessService: {
    canPerform: jest.fn(),
    mapRole: jest.fn((role: string) => role),
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
const q1Id = new Types.ObjectId();
const q2Id = new Types.ObjectId();
const q1CycleId = new Types.ObjectId();
const q2CycleId = new Types.ObjectId();

function createAssignmentService(currentDate = '2026-04-15T00:00:00.000Z') {
  const service: any = new AssignmentService({
    requestId: 'test-request',
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

  service.requireActor = jest.fn(() => ({
    actorId: actorId.toString(),
    actorRole: 'ADMIN',
  }));
  service.audit = jest.fn();

  return service;
}

function createWorkflowSyncService(currentDate = '2026-04-15T00:00:00.000Z') {
  return new WorkflowSyncService({
    requestId: 'test-request',
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

function mockTermAssignment(
  id: Types.ObjectId,
  assessmentTermCode: 'Q1' | 'Q2',
  cycleTermId: Types.ObjectId,
  termState: TermWorkflowState,
) {
  return {
    _id: id,
    annualAssignmentId,
    cycleId,
    cycleTermId,
    employeeId: new Types.ObjectId(),
    assignedManagerId: new Types.ObjectId(),
    assessmentTermCode,
    assessmentTermType: 'QUARTERLY',
    termLabel: assessmentTermCode,
    termState,
  };
}

describe('Term workflow scheduling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (accessService.canPerform as jest.Mock).mockResolvedValue({
      allowed: true,
      mappedRole: 'ADMIN',
    });
    mockOpenEligiblePeriodsForCycle.mockResolvedValue({
      checked: 0,
      opened: 0,
      alreadyOpen: 0,
      alreadyAdvanced: 0,
      notReady: 0,
      results: [],
    });
    (AnnualAssignment.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
  });

  it('shows a not-started assignment as objective setting open during its active window', () => {
    const service = createAssignmentService('2026-07-13T00:00:00.000Z');
    const termAssignment = mockTermAssignment(
      q1Id,
      'Q1',
      q1CycleId,
      TermWorkflowState.NOT_STARTED,
    );

    const effectiveState = service.getEffectiveAssignmentTermState(
      termAssignment,
      [termAssignment],
      new Map([
        [
          q1CycleId.toString(),
          {
            startDate: new Date('2026-07-13T00:00:00.000Z'),
            objectiveSettingWindow: {
              startDate: new Date('2026-07-13T00:00:00.000Z'),
              endDate: new Date('2026-07-19T00:00:00.000Z'),
            },
          },
        ],
      ]),
      { _id: annualAssignmentId },
    );

    expect(effectiveState).toBe(TermWorkflowState.OBJECTIVE_SETTING_OPEN);
  });

  it('keeps a not-started assignment scheduled before its objective setting window', () => {
    const service = createAssignmentService('2026-07-12T00:00:00.000Z');
    const termAssignment = mockTermAssignment(
      q1Id,
      'Q1',
      q1CycleId,
      TermWorkflowState.NOT_STARTED,
    );

    const effectiveState = service.getEffectiveAssignmentTermState(
      termAssignment,
      [termAssignment],
      new Map([
        [
          q1CycleId.toString(),
          {
            startDate: new Date('2026-07-13T00:00:00.000Z'),
            objectiveSettingWindow: {
              startDate: new Date('2026-07-13T00:00:00.000Z'),
              endDate: new Date('2026-07-19T00:00:00.000Z'),
            },
          },
        ],
      ]),
      { _id: annualAssignmentId },
    );

    expect(effectiveState).toBe(TermWorkflowState.NOT_STARTED);
  });

  it('opens only the currently active seeded term at assignment launch', async () => {
    const service = createAssignmentService();
    const q1 = mockTermAssignment(q1Id, 'Q1', q1CycleId, TermWorkflowState.NOT_STARTED);
    const q2 = mockTermAssignment(q2Id, 'Q2', q2CycleId, TermWorkflowState.NOT_STARTED);

    const termCycleById = new Map([
      [
        q1CycleId.toString(),
        {
          assessmentTermCode: 'Q1',
          assessmentTermType: 'QUARTERLY',
          objectiveSettingWindow: {
            startDate: new Date('2026-04-01T00:00:00.000Z'),
            endDate: new Date('2026-04-30T00:00:00.000Z'),
          },
        },
      ],
      [
        q2CycleId.toString(),
        {
          assessmentTermCode: 'Q2',
          assessmentTermType: 'QUARTERLY',
          objectiveSettingWindow: {
            startDate: new Date('2026-07-01T00:00:00.000Z'),
            endDate: new Date('2026-07-31T00:00:00.000Z'),
          },
        },
      ],
    ]);

    (transitionTermAssignmentState as jest.Mock).mockResolvedValue({
      ...q1,
      termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    });

    await service.syncInitialTermAssignmentStates(
      { _id: annualAssignmentId, assignmentWindowSnapshot: undefined },
      [q1, q2],
      new Set([q1Id.toString(), q2Id.toString()]),
      termCycleById,
    );

    expect(transitionTermAssignmentState).toHaveBeenCalledTimes(1);
    expect(transitionTermAssignmentState).toHaveBeenCalledWith(
      q1Id.toString(),
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Current objective-setting window is active at assignment launch.',
      'PMS_TERM_ASSIGNMENT_SEEDED_OBJECTIVE_SETTING_OPEN',
      expect.objectContaining({
        annualAssignmentId: annualAssignmentId.toString(),
        assessmentTermCode: 'Q1',
        windowSource: 'CYCLE_INHERITED',
      }),
    );
  });

  it('does not let sync open a future term while a prior term is still in objective workflow', async () => {
    const service = createWorkflowSyncService();
    const q1 = mockTermAssignment(q1Id, 'Q1', q1CycleId, TermWorkflowState.OBJECTIVE_SUBMITTED);
    const q2 = mockTermAssignment(q2Id, 'Q2', q2CycleId, TermWorkflowState.NOT_STARTED);

    (AnnualCycle.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: cycleId, isDeleted: false }),
    });
    (TermAssignment.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([q1, q2]),
    });
    (TermCycle.find as jest.Mock).mockResolvedValue([
      {
        cycleId,
        assessmentTermCode: 'Q1',
        assessmentTermType: 'QUARTERLY',
        objectiveSettingWindow: {
          startDate: new Date('2026-04-01T00:00:00.000Z'),
          endDate: new Date('2026-04-30T00:00:00.000Z'),
        },
      },
      {
        cycleId,
        assessmentTermCode: 'Q2',
        assessmentTermType: 'QUARTERLY',
        objectiveSettingWindow: {
          startDate: new Date('2026-04-10T00:00:00.000Z'),
          endDate: new Date('2026-04-25T00:00:00.000Z'),
        },
      },
    ]);

    const result = await service.syncWorkflowStates(cycleId.toString());

    expect(result.totalUpdated).toBe(0);
    expect(result.results.find((item) => item.termAssignmentId === q2Id.toString())?.message)
      .toContain('Q1 is still in the objective-setting workflow');
    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
  });

  it('opens the next term during sync after the prior term has moved past objective setting', async () => {
    const service = createWorkflowSyncService();
    const q1 = mockTermAssignment(q1Id, 'Q1', q1CycleId, TermWorkflowState.OBJECTIVE_APPROVED);
    const q2 = mockTermAssignment(q2Id, 'Q2', q2CycleId, TermWorkflowState.NOT_STARTED);

    (AnnualCycle.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: cycleId, isDeleted: false }),
    });
    (TermAssignment.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([q1, q2]),
    });
    (TermCycle.find as jest.Mock).mockResolvedValue([
      {
        cycleId,
        assessmentTermCode: 'Q1',
        assessmentTermType: 'QUARTERLY',
        achievementSubmissionWindow: {
          enabled: true,
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2026-06-30T00:00:00.000Z'),
        },
      },
      {
        cycleId,
        assessmentTermCode: 'Q2',
        assessmentTermType: 'QUARTERLY',
        objectiveSettingWindow: {
          startDate: new Date('2026-04-10T00:00:00.000Z'),
          endDate: new Date('2026-04-25T00:00:00.000Z'),
        },
      },
    ]);
    (transitionTermAssignmentState as jest.Mock).mockResolvedValue({
      ...q2,
      termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    });

    const result = await service.syncWorkflowStates(cycleId.toString());

    expect(result.totalUpdated).toBe(1);
    expect(transitionTermAssignmentState).toHaveBeenCalledWith(
      q2Id.toString(),
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Objective setting window is active.',
      'ADMIN_WORKFLOW_SYNC',
      expect.objectContaining({
        source: 'ADMIN_MANUAL_SYNC',
        windowName: 'Objective Setting Window',
      }),
    );
  });
});
