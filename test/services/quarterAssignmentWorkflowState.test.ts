import { Types } from 'mongoose';
import { AssignmentService } from '../../src/services/assignment.service';
import { ObjectiveService } from '../../src/services/objective.service';
import { WorkflowSyncService } from '../../src/services/workflow-sync.service';
import { QuarterWorkflowState } from '../../src/constants/pms.enums';
import { transitionQuarterAssignmentState } from '../../src/services/quarter-assignment-workflow.service';
import { Objective } from '../../src/models/pms-objective.model';
import { AnnualCycle } from '../../src/models/pms-annual-cycle.model';
import { QuarterAssignment } from '../../src/models/pms-quarter-assignment.model';
import { QuarterCycle } from '../../src/models/pms-quarter-cycle.model';
import { accessService } from '../../src/services/access.service';

jest.mock('../../src/services/quarter-assignment-workflow.service', () => ({
  transitionQuarterAssignmentState: jest.fn(),
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

jest.mock('../../src/models/pms-quarter-assignment.model', () => ({
  QuarterAssignment: {
    find: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-quarter-cycle.model', () => ({
  QuarterCycle: {
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
const quarterAssignmentId = new Types.ObjectId();
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

function mockQuarterAssignment(state: string) {
  return {
    _id: quarterAssignmentId,
    annualAssignmentId,
    cycleId,
    employeeId,
    assignedManagerId: managerId,
    quarterCode: 'Q1',
    quarterState: state,
  };
}

describe('Quarter assignment workflow state ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (accessService.canPerform as jest.Mock).mockResolvedValue({
      allowed: true,
      mappedRole: 'ADMIN',
    });
  });

  it('does not let objective submit move quarterState from OBJECTIVE_SETTING_OPEN', async () => {
    const service = createObjectiveService();
    service.getQuarterAssignment = jest.fn().mockResolvedValue(
      mockQuarterAssignment(QuarterWorkflowState.OBJECTIVE_SETTING_OPEN),
    );

    await service.transitionQuarterIfNeeded(
      quarterAssignmentId.toString(),
      QuarterWorkflowState.OBJECTIVE_SUBMITTED,
    );

    expect(transitionQuarterAssignmentState).not.toHaveBeenCalled();
  });

  it('does not let objective return move quarterState from OBJECTIVE_SETTING_OPEN', async () => {
    const service = createObjectiveService();
    service.getQuarterAssignment = jest.fn().mockResolvedValue(
      mockQuarterAssignment(QuarterWorkflowState.OBJECTIVE_SETTING_OPEN),
    );

    await service.transitionQuarterIfNeeded(
      quarterAssignmentId.toString(),
      QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED,
    );

    expect(transitionQuarterAssignmentState).not.toHaveBeenCalled();
  });

  it('does not let objective approval silently close objective setting', async () => {
    const service = createObjectiveService();
    service.getQuarterAssignment = jest.fn().mockResolvedValue(
      mockQuarterAssignment(QuarterWorkflowState.OBJECTIVE_SETTING_OPEN),
    );

    await service.updateQuarterStateAfterApproval(quarterAssignmentId.toString());

    expect(Objective.find).not.toHaveBeenCalled();
    expect(transitionQuarterAssignmentState).not.toHaveBeenCalled();
  });

  it('opens seeded predefined-objective assignments to OBJECTIVE_SETTING_OPEN at launch', async () => {
    const service = createAssignmentService();
    const quarterAssignment = mockQuarterAssignment(QuarterWorkflowState.NOT_STARTED);
    (transitionQuarterAssignmentState as jest.Mock).mockResolvedValue(
      mockQuarterAssignment(QuarterWorkflowState.OBJECTIVE_SETTING_OPEN),
    );

    await service.openSeededQuarterAssignmentsForObjectiveSetting(
      [quarterAssignment],
      new Set([quarterAssignmentId.toString()]),
    );

    expect(transitionQuarterAssignmentState).toHaveBeenCalledWith(
      quarterAssignmentId.toString(),
      QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Seeded predefined objectives are approved; objective setting remains open for additional objectives',
    );
  });

  it('closes objective setting explicitly from OBJECTIVE_SETTING_OPEN to OBJECTIVE_APPROVED', async () => {
    const service = createObjectiveService();
    const initialQuarterAssignment = mockQuarterAssignment(
      QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
    );
    const approvedQuarterAssignment = mockQuarterAssignment(
      QuarterWorkflowState.OBJECTIVE_APPROVED,
    );
    const closedQuarterAssignment = {
      ...approvedQuarterAssignment,
      version: 1,
      save: jest.fn().mockResolvedValue(undefined),
    };

    service.getQuarterAssignment = jest.fn()
      .mockResolvedValueOnce(initialQuarterAssignment)
      .mockResolvedValueOnce(approvedQuarterAssignment)
      .mockResolvedValueOnce(closedQuarterAssignment);
    service.getObjectiveDelegation = jest.fn().mockResolvedValue(null);
    service.audit = jest.fn();
    (Objective.find as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
    (transitionQuarterAssignmentState as jest.Mock).mockResolvedValue(
      approvedQuarterAssignment,
    );

    const result = await service.closeObjectiveSetting(
      quarterAssignmentId.toString(),
      { confirm: true, reason: 'Ready for sync' },
    );

    expect(transitionQuarterAssignmentState).toHaveBeenCalledWith(
      quarterAssignmentId.toString(),
      QuarterWorkflowState.OBJECTIVE_APPROVED,
      { actorId: actorId.toString(), actorRole: 'ADMIN' },
      'Ready for sync',
      'CLOSE_OBJECTIVE_SETTING',
    );
    expect(closedQuarterAssignment.save).toHaveBeenCalled();
    expect(result.objectiveSettingCloseSource).toBe('ADMIN');
  });

  it('manual sync skips OBJECTIVE_SETTING_OPEN records', async () => {
    const service = createWorkflowSyncService();
    (AnnualCycle.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: cycleId, isDeleted: false }),
    });
    (QuarterAssignment.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        mockQuarterAssignment(QuarterWorkflowState.OBJECTIVE_SETTING_OPEN),
      ]),
    });
    (QuarterCycle.find as jest.Mock).mockResolvedValue([
      {
        cycleId,
        quarterCode: 'Q1',
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
    expect(transitionQuarterAssignmentState).not.toHaveBeenCalled();
  });

  it('manual sync moves OBJECTIVE_APPROVED forward after objective setting is closed', async () => {
    const service = createWorkflowSyncService();
    (AnnualCycle.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ _id: cycleId, isDeleted: false }),
    });
    (QuarterAssignment.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        mockQuarterAssignment(QuarterWorkflowState.OBJECTIVE_APPROVED),
      ]),
    });
    (QuarterCycle.find as jest.Mock).mockResolvedValue([
      {
        cycleId,
        quarterCode: 'Q1',
        achievementSubmissionWindow: {
          enabled: true,
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2026-06-30T00:00:00.000Z'),
        },
      },
    ]);
    (transitionQuarterAssignmentState as jest.Mock).mockResolvedValue(
      mockQuarterAssignment(QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN),
    );

    const result = await service.syncWorkflowStates(cycleId.toString());

    expect(result.totalChecked).toBe(1);
    expect(result.totalUpdated).toBe(1);
    expect(transitionQuarterAssignmentState).toHaveBeenCalledWith(
      quarterAssignmentId.toString(),
      QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
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
