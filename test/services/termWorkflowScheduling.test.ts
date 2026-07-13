import { Types } from 'mongoose';
import { AssignmentService } from '../../src/services/assignment.service';
import { WorkflowSyncService } from '../../src/services/workflow-sync.service';
import {
  AssessmentTermCode,
  AssessmentTermType,
  TermWorkflowState,
} from '../../src/constants/pms.enums';
import { transitionTermAssignmentState } from '../../src/services/term-assignment-workflow.service';
import { AnnualAssignment } from '../../src/models/pms-annual-assignment.model';
import { AnnualCycle } from '../../src/models/pms-annual-cycle.model';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { accessService } from '../../src/services/access.service';

const mockOpenEligiblePeriodsForCycle = jest.fn();
const mockCreatePeriodsForAnnualAssignment = jest.fn();

jest.mock('../../src/services/term-assignment-workflow.service', () => ({
  transitionTermAssignmentState: jest.fn(),
}));

jest.mock('../../src/services/managerReviewPeriod.service', () => ({
  ManagerReviewPeriodService: jest.fn().mockImplementation(() => ({
    openEligiblePeriodsForCycle: mockOpenEligiblePeriodsForCycle,
    createPeriodsForAnnualAssignment: mockCreatePeriodsForAnnualAssignment,
  })),
}));

jest.mock('../../src/models/pms-annual-assignment.model', () => ({
  AnnualAssignment: {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-annual-cycle.model', () => ({
  AnnualCycle: {
    findOne: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('../../src/models/pms-term-assignment.model', () => ({
  TermAssignment: {
    find: jest.fn(),
    insertMany: jest.fn(),
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
  assessmentTermCode: AssessmentTermCode,
  cycleTermId: Types.ObjectId,
  termState: TermWorkflowState,
  assessmentTermType: AssessmentTermType = AssessmentTermType.QUARTERLY,
) {
  return {
    _id: id,
    annualAssignmentId,
    cycleId,
    cycleTermId,
    employeeId: new Types.ObjectId(),
    assignedManagerId: new Types.ObjectId(),
    assessmentTermCode,
    assessmentTermType,
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
    mockCreatePeriodsForAnnualAssignment.mockResolvedValue([]);
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

  it.each([
    ['quarterly', AssessmentTermCode.Q1, AssessmentTermType.QUARTERLY],
    ['half-yearly', AssessmentTermCode.H1, AssessmentTermType.HALF_YEARLY],
    ['yearly', AssessmentTermCode.Y1, AssessmentTermType.YEARLY],
  ])(
    'opens a newly assigned %s term immediately when objective setting is active',
    async (_label, termCode, termType) => {
      const service = createAssignmentService('2026-07-13T12:00:00.000Z');
      const termAssignmentId = new Types.ObjectId();
      const termCycleId = new Types.ObjectId();
      const termAssignment = mockTermAssignment(
        termAssignmentId,
        termCode,
        termCycleId,
        TermWorkflowState.NOT_STARTED,
        termType,
      );

      (transitionTermAssignmentState as jest.Mock).mockResolvedValue({
        ...termAssignment,
        termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      });

      await service.syncInitialTermAssignmentStates(
        { _id: annualAssignmentId, assignmentWindowSnapshot: undefined },
        [termAssignment],
        new Set(),
        new Map([
          [
            termCycleId.toString(),
            {
              assessmentTermCode: termCode,
              assessmentTermType: termType,
              objectiveSettingWindow: {
                startDate: new Date('2026-07-13T00:00:00.000Z'),
                endDate: new Date('2026-07-19T00:00:00.000Z'),
              },
            },
          ],
        ]),
      );

      expect(transitionTermAssignmentState).toHaveBeenCalledTimes(1);
      expect(termAssignment.termState).toBe(TermWorkflowState.OBJECTIVE_SETTING_OPEN);
    },
  );

  it.each([
    ['quarterly', AssessmentTermCode.Q1, AssessmentTermType.QUARTERLY],
    ['half-yearly', AssessmentTermCode.H1, AssessmentTermType.HALF_YEARLY],
    ['yearly', AssessmentTermCode.Y1, AssessmentTermType.YEARLY],
  ])(
    'keeps a newly assigned future %s term scheduled',
    async (_label, termCode, termType) => {
      const service = createAssignmentService('2026-07-12T12:00:00.000Z');
      const termAssignmentId = new Types.ObjectId();
      const termCycleId = new Types.ObjectId();
      const termAssignment = mockTermAssignment(
        termAssignmentId,
        termCode,
        termCycleId,
        TermWorkflowState.NOT_STARTED,
        termType,
      );

      await service.syncInitialTermAssignmentStates(
        { _id: annualAssignmentId, assignmentWindowSnapshot: undefined },
        [termAssignment],
        new Set(),
        new Map([
          [
            termCycleId.toString(),
            {
              assessmentTermCode: termCode,
              assessmentTermType: termType,
              objectiveSettingWindow: {
                startDate: new Date('2026-07-13T00:00:00.000Z'),
                endDate: new Date('2026-07-19T00:00:00.000Z'),
              },
            },
          ],
        ]),
      );

      expect(transitionTermAssignmentState).not.toHaveBeenCalled();
      expect(termAssignment.termState).toBe(TermWorkflowState.NOT_STARTED);
    },
  );

  it('opens an active selected H2 term when H1 is not assigned', async () => {
    const service = createAssignmentService('2027-01-13T12:00:00.000Z');
    const h2Id = new Types.ObjectId();
    const h2CycleId = new Types.ObjectId();
    const h2 = mockTermAssignment(
      h2Id,
      AssessmentTermCode.H2,
      h2CycleId,
      TermWorkflowState.NOT_STARTED,
      AssessmentTermType.HALF_YEARLY,
    );

    (transitionTermAssignmentState as jest.Mock).mockResolvedValue({
      ...h2,
      termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    });

    await service.syncInitialTermAssignmentStates(
      { _id: annualAssignmentId, assignmentWindowSnapshot: undefined },
      [h2],
      new Set(),
      new Map([
        [
          h2CycleId.toString(),
          {
            assessmentTermCode: AssessmentTermCode.H2,
            assessmentTermType: AssessmentTermType.HALF_YEARLY,
            objectiveSettingWindow: {
              startDate: new Date('2027-01-11T00:00:00.000Z'),
              endDate: new Date('2027-01-17T00:00:00.000Z'),
            },
          },
        ],
      ]),
    );

    expect(transitionTermAssignmentState).toHaveBeenCalledTimes(1);
    expect(h2.termState).toBe(TermWorkflowState.OBJECTIVE_SETTING_OPEN);
  });

  it('returns the refreshed persisted term states from assignment creation', async () => {
    const service: any = createAssignmentService('2026-07-13T12:00:00.000Z');
    const employeeId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const templateVersionId = new Types.ObjectId();
    const h1Id = new Types.ObjectId();
    const h2Id = new Types.ObjectId();
    const h1CycleId = new Types.ObjectId();
    const h2CycleId = new Types.ObjectId();
    const h1 = mockTermAssignment(
      h1Id,
      AssessmentTermCode.H1,
      h1CycleId,
      TermWorkflowState.NOT_STARTED,
      AssessmentTermType.HALF_YEARLY,
    );
    const h2 = mockTermAssignment(
      h2Id,
      AssessmentTermCode.H2,
      h2CycleId,
      TermWorkflowState.NOT_STARTED,
      AssessmentTermType.HALF_YEARLY,
    );
    const refreshedH1 = {
      ...h1,
      termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    };
    const annualAssignment: any = {
      _id: annualAssignmentId,
      cycleId,
      templateVersionId,
      termAssignmentIds: [],
      assignmentWindowSnapshot: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };

    service.assertAdmin = jest.fn().mockResolvedValue(undefined);
    service.resolveSelectedTemplateVersionId = jest.fn().mockResolvedValue(templateVersionId);
    service.buildAssignmentSnapshots = jest.fn().mockResolvedValue({
      employeeSnapshot: { active: true },
      managerSnapshot: {},
      orgSnapshot: {},
    });
    service.validateEmployeeEligibility = jest.fn();
    service.seedPredefinedObjectives = jest.fn().mockResolvedValue(new Set());
    service.syncInitialTermAssignmentStates = jest.fn().mockImplementation(async () => {
      h1.termState = TermWorkflowState.OBJECTIVE_SETTING_OPEN;
    });
    service.lockTemplateVersion = jest.fn().mockResolvedValue(undefined);

    (AnnualCycle.findById as jest.Mock).mockResolvedValue({
      _id: cycleId,
      assessmentTermType: AssessmentTermType.HALF_YEARLY,
      templateVersionId,
    });
    (AnnualAssignment.findOne as jest.Mock).mockResolvedValue(null);
    (AnnualAssignment.create as jest.Mock).mockResolvedValue(annualAssignment);
    (TermCycle.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: h1CycleId,
          assessmentTermCode: AssessmentTermCode.H1,
        },
        {
          _id: h2CycleId,
          assessmentTermCode: AssessmentTermCode.H2,
        },
      ]),
    });
    (TermAssignment.insertMany as jest.Mock).mockResolvedValue([h1, h2]);
    (TermAssignment.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockResolvedValue([refreshedH1, h2]),
    });

    const result = await service.assignEmployee(cycleId.toString(), {
      employeeId: employeeId.toString(),
      managerId: managerId.toString(),
      applicableTerms: [AssessmentTermCode.H1, AssessmentTermCode.H2],
    });

    expect(result.termAssignments).toEqual([refreshedH1, h2]);
    expect(result.termAssignments[0].termState).toBe(
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    );
    expect(result.termAssignments[1].termState).toBe(TermWorkflowState.NOT_STARTED);
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
    expect(q1.termState).toBe(TermWorkflowState.OBJECTIVE_SETTING_OPEN);
    expect(q2.termState).toBe(TermWorkflowState.NOT_STARTED);
  });

  it('opens only the first pending term when objective windows overlap at assignment launch', async () => {
    const service = createAssignmentService();
    const q1 = mockTermAssignment(q1Id, 'Q1', q1CycleId, TermWorkflowState.NOT_STARTED);
    const q2 = mockTermAssignment(q2Id, 'Q2', q2CycleId, TermWorkflowState.NOT_STARTED);
    const activeWindow = {
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      endDate: new Date('2026-04-30T00:00:00.000Z'),
    };
    const termCycleById = new Map([
      [
        q1CycleId.toString(),
        {
          assessmentTermCode: 'Q1',
          assessmentTermType: 'QUARTERLY',
          objectiveSettingWindow: activeWindow,
        },
      ],
      [
        q2CycleId.toString(),
        {
          assessmentTermCode: 'Q2',
          assessmentTermType: 'QUARTERLY',
          objectiveSettingWindow: activeWindow,
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
      new Set(),
      termCycleById,
    );

    expect(transitionTermAssignmentState).toHaveBeenCalledTimes(1);
    expect(transitionTermAssignmentState).toHaveBeenCalledWith(
      q1Id.toString(),
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      expect.anything(),
      expect.any(String),
      'PMS_TERM_ASSIGNMENT_INITIAL_OBJECTIVE_SETTING_OPEN',
      expect.any(Object),
    );
    expect(q1.termState).toBe(TermWorkflowState.OBJECTIVE_SETTING_OPEN);
    expect(q2.termState).toBe(TermWorkflowState.NOT_STARTED);
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
