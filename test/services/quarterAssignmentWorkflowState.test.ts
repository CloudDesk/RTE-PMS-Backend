import { Types } from 'mongoose';
import { AssignmentService } from '../../src/services/assignment.service';
import { ObjectiveService } from '../../src/services/objective.service';
import { WorkflowSyncService } from '../../src/services/workflow-sync.service';
import { TermWorkflowState } from '../../src/constants/pms.enums';
import { transitionTermAssignmentState } from '../../src/services/term-assignment-workflow.service';
import { Objective } from '../../src/models/pms-objective.model';
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

jest.mock('../../src/services/workflow.service', () => ({
  workflowService: {
    validateTransition: jest.fn(() => ({ allowed: true })),
    transition: jest.fn(({ currentState, nextState }) => ({
      previousState: currentState,
      currentState: nextState,
      transitionedAt: new Date('2026-06-17T00:00:00.000Z'),
      metadata: {},
    })),
  },
}));

jest.mock('../../src/models/pms-objective.model', () => ({
  Objective: {
    find: jest.fn(),
  },
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

jest.mock('../../src/services/access.service', () => ({
  accessService: {
    canPerform: jest.fn(),
    mapRole: jest.fn((role: string) => role),
  },
}));

const actorId = new Types.ObjectId();
const cycleId = new Types.ObjectId();
const termAssignmentId = new Types.ObjectId();
const termCycleId = new Types.ObjectId();
const annualAssignmentId = new Types.ObjectId();
const employeeId = new Types.ObjectId();
const managerId = new Types.ObjectId();

function createObjectiveService() {
  const service: any = new ObjectiveService({
    requestId: 'test-request',
    reqRole: 'ADMIN',
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

  return service;
}

function createAssignmentService() {
  const service: any = new AssignmentService({
    requestId: 'test-request',
    reqRole: 'ADMIN',
    pmsCurrentDate: new Date('2026-06-17T00:00:00.000Z'),
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

function createWorkflowSyncService() {
  return new WorkflowSyncService({
    requestId: 'test-request',
    reqRole: 'ADMIN',
    pmsCurrentDate: new Date('2026-06-17T00:00:00.000Z'),
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

function mockTermAssignment(state: string) {
  return {
    _id: termAssignmentId,
    annualAssignmentId,
    cycleId,
    cycleTermId: termCycleId,
    employeeId,
    assignedManagerId: managerId,
    assessmentTermCode: 'Q1',
    assessmentTermType: 'QUARTERLY',
    termLabel: 'Q1',
    termState: state,
  };
}

describe('Term assignment workflow state ownership', () => {
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

  it('does not let objective submit move termState from OBJECTIVE_SETTING_OPEN', async () => {
    const service = createObjectiveService();
    service.getTermAssignment = jest.fn().mockResolvedValue(
      mockTermAssignment(TermWorkflowState.OBJECTIVE_SETTING_OPEN),
    );

    await service.transitionQuarterIfNeeded(
      termAssignmentId.toString(),
      TermWorkflowState.OBJECTIVE_SUBMITTED,
    );

    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
  });

  it('does not let objective return move termState from OBJECTIVE_SETTING_OPEN', async () => {
    const service = createObjectiveService();
    service.getTermAssignment = jest.fn().mockResolvedValue(
      mockTermAssignment(TermWorkflowState.OBJECTIVE_SETTING_OPEN),
    );

    await service.transitionQuarterIfNeeded(
      termAssignmentId.toString(),
      TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
    );

    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
  });

  it('does not let objective approval silently close objective setting', async () => {
    const service = createObjectiveService();
    service.getTermAssignment = jest.fn().mockResolvedValue(
      mockTermAssignment(TermWorkflowState.OBJECTIVE_SETTING_OPEN),
    );

    await service.updateTermStateAfterApproval(termAssignmentId.toString());

    expect(Objective.find).not.toHaveBeenCalled();
    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
  });

  it('opens seeded predefined-objective assignments to OBJECTIVE_SETTING_OPEN at launch', async () => {
    const service = createAssignmentService();
    const termAssignment = mockTermAssignment(TermWorkflowState.NOT_STARTED);
    (transitionTermAssignmentState as jest.Mock).mockResolvedValue(
      mockTermAssignment(TermWorkflowState.OBJECTIVE_SETTING_OPEN),
    );

    await service.syncInitialTermAssignmentStates(
      { _id: annualAssignmentId, assignmentWindowSnapshot: undefined },
      [termAssignment],
      new Set([termAssignmentId.toString()]),
      new Map([
        [
          termCycleId.toString(),
          {
            assessmentTermCode: 'Q1',
            assessmentTermType: 'QUARTERLY',
            objectiveSettingWindow: {
              startDate: new Date('2026-06-01T00:00:00.000Z'),
              endDate: new Date('2026-06-30T00:00:00.000Z'),
            },
          },
        ],
      ]),
    );

    expect(transitionTermAssignmentState).toHaveBeenCalledWith(
      termAssignmentId.toString(),
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Current objective-setting window is active at assignment launch.',
      'PMS_TERM_ASSIGNMENT_SEEDED_OBJECTIVE_SETTING_OPEN',
      expect.objectContaining({
        annualAssignmentId: annualAssignmentId.toString(),
        assessmentTermCode: 'Q1',
      }),
    );
  });

  it('closes objective setting explicitly from OBJECTIVE_SETTING_OPEN to OBJECTIVE_APPROVED', async () => {
    const service = createObjectiveService();
    const initialTermAssignment = mockTermAssignment(
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    );
    const approvedTermAssignment = mockTermAssignment(
      TermWorkflowState.OBJECTIVE_APPROVED,
    );
    const closedTermAssignment = {
      ...approvedTermAssignment,
      version: 1,
      save: jest.fn().mockResolvedValue(undefined),
    };

    service.getTermAssignment = jest.fn()
      .mockResolvedValueOnce(initialTermAssignment)
      .mockResolvedValueOnce(approvedTermAssignment)
      .mockResolvedValueOnce(closedTermAssignment);
    service.getAnnualAssignment = jest.fn().mockResolvedValue({});
    service.getObjectiveConfigForAssignment = jest.fn().mockResolvedValue({});
    service.validateObjectiveWeightageBeforeClose = jest.fn().mockResolvedValue(undefined);
    service.getObjectiveDelegation = jest.fn().mockResolvedValue(null);
    service.audit = jest.fn();
    (Objective.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
    (transitionTermAssignmentState as jest.Mock).mockResolvedValue(
      approvedTermAssignment,
    );

    const result = await service.closeObjectiveSetting(
      termAssignmentId.toString(),
      { confirm: true, reason: 'Ready for sync' },
    );

    expect(transitionTermAssignmentState).toHaveBeenCalledWith(
      termAssignmentId.toString(),
      TermWorkflowState.OBJECTIVE_APPROVED,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Ready for sync',
      'CLOSE_OBJECTIVE_SETTING',
    );
    expect(closedTermAssignment.save).toHaveBeenCalled();
    expect(result.objectiveSettingCloseSource).toBe('ADMIN');
  });

  it('manual sync skips OBJECTIVE_SETTING_OPEN records', async () => {
    const service = createWorkflowSyncService();
    (AnnualCycle.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: cycleId, isDeleted: false }),
    });
    (TermAssignment.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        mockTermAssignment(TermWorkflowState.OBJECTIVE_SETTING_OPEN),
      ]),
    });
    (TermCycle.find as jest.Mock).mockResolvedValue([
      {
        cycleId,
        assessmentTermCode: 'Q1',
        assessmentTermType: 'QUARTERLY',
        objectiveSettingWindow: {
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2026-06-30T00:00:00.000Z'),
        },
      },
    ]);

    const result = await service.syncWorkflowStates(cycleId.toString());

    expect(result.totalChecked).toBe(1);
    expect(result.totalUpdated).toBe(0);
    expect(result.skippedObjectiveSettingOpen).toBe(1);
    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
  });

  it('manual sync moves OBJECTIVE_APPROVED forward after objective setting is closed', async () => {
    const service = createWorkflowSyncService();
    (service as any).validateObjectiveScoringReadyForAchievementOpen = jest.fn().mockResolvedValue({
      ready: true,
    });
    (AnnualCycle.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: cycleId, isDeleted: false }),
    });
    (TermAssignment.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        mockTermAssignment(TermWorkflowState.OBJECTIVE_APPROVED),
      ]),
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
    ]);
    (transitionTermAssignmentState as jest.Mock).mockResolvedValue(
      mockTermAssignment(TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN),
    );

    const result = await service.syncWorkflowStates(cycleId.toString());

    expect(result.totalChecked).toBe(1);
    expect(result.totalUpdated).toBe(1);
    expect(transitionTermAssignmentState).toHaveBeenCalledWith(
      termAssignmentId.toString(),
      TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Employee achievement submission window is eligible.',
      'ADMIN_WORKFLOW_SYNC',
      expect.objectContaining({
        source: 'ADMIN_MANUAL_SYNC',
        windowName: 'Employee Achievement Submission Window',
      }),
    );
  });
});
