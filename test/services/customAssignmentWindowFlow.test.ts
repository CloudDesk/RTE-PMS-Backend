import { Types } from 'mongoose';
import { AssessmentTermCode, TermWorkflowState } from '../../src/constants/pms.enums';
import { AssignmentService } from '../../src/services/assignment.service';
import { transitionTermAssignmentState } from '../../src/services/term-assignment-workflow.service';
import {
  resolveEffectiveTermWindows,
  type PmsAssignmentTermWindowSnapshot,
} from '../../src/utilis/pmsAssignmentWindows';

jest.mock('../../src/services/term-assignment-workflow.service', () => ({
  transitionTermAssignmentState: jest.fn(),
}));

const actorId = new Types.ObjectId();

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function createAssignmentService(currentDate = '2026-07-09T00:00:00.000Z') {
  const service: any = new AssignmentService({
    requestId: 'custom-window-test',
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

function cycleQ3Windows() {
  return {
    objectiveSettingWindow: { startDate: date('2026-07-01'), endDate: date('2026-07-05') },
    objectiveApprovalWindow: { startDate: date('2026-07-06'), endDate: date('2026-07-08') },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: date('2026-07-09'),
      endDate: date('2026-07-20'),
      dueDate: date('2026-07-20'),
    },
    managerReviewWindow: { startDate: date('2026-07-21'), endDate: date('2026-07-28') },
    termFinalizationWindow: { startDate: date('2026-07-29'), endDate: date('2026-07-29') },
  };
}

function activeObjectiveSettingCycleWindows() {
  return {
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

function activeObjectiveApprovalCycleWindows() {
  return {
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

function continueFromAchievementWindow(
  start = '2026-07-09',
  achievementEnd = '2026-07-20',
): PmsAssignmentTermWindowSnapshot {
  return {
    windowSource: 'ASSIGNMENT_CUSTOM',
    customFlowMode: 'CONTINUE_FROM_ACHIEVEMENT',
    achievementSubmissionWindow: {
      enabled: true,
      startDate: date(start),
      endDate: date(achievementEnd),
      dueDate: date(achievementEnd),
    },
    managerReviewWindow: { startDate: date('2026-07-21'), endDate: date('2026-07-28') },
    termFinalizationWindow: { startDate: date('2026-07-29'), endDate: date('2026-07-29') },
  };
}

function reopenObjectiveSetupWindow(): PmsAssignmentTermWindowSnapshot {
  return {
    windowSource: 'ASSIGNMENT_CUSTOM',
    customFlowMode: 'REOPEN_OBJECTIVE_SETUP',
    objectiveSettingWindow: { startDate: date('2026-07-09'), endDate: date('2026-07-13') },
    objectiveApprovalWindow: { startDate: date('2026-07-14'), endDate: date('2026-07-18') },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: date('2026-07-19'),
      endDate: date('2026-07-20'),
      dueDate: date('2026-07-20'),
    },
    managerReviewWindow: { startDate: date('2026-07-21'), endDate: date('2026-07-28') },
    termFinalizationWindow: { startDate: date('2026-07-29'), endDate: date('2026-07-29') },
  };
}

function termAssignment(
  code = AssessmentTermCode.Q3,
  state: TermWorkflowState = TermWorkflowState.NOT_STARTED,
) {
  return {
    _id: new Types.ObjectId(),
    cycleTermId: new Types.ObjectId(),
    assessmentTermCode: code,
    termState: state,
  };
}

function termCycleMap(term: any, windows: Record<string, unknown>) {
  return new Map([
    [
      term.cycleTermId.toString(),
      {
        _id: term.cycleTermId,
        assessmentTermCode: term.assessmentTermCode,
        assessmentTermType: 'QUARTERLY',
        ...windows,
      },
    ],
  ]);
}

function annualAssignment(customWindow?: PmsAssignmentTermWindowSnapshot) {
  return {
    _id: new Types.ObjectId(),
    assignmentWindowSnapshot: customWindow
      ? {
          terms: {
            [AssessmentTermCode.Q3]: customWindow,
          },
        }
      : undefined,
  };
}

function mockTransition() {
  (transitionTermAssignmentState as jest.Mock).mockImplementation(
    async (termAssignmentId: string, targetState: TermWorkflowState) => ({
      _id: termAssignmentId,
      termState: targetState,
      previousTermState: TermWorkflowState.NOT_STARTED,
      lastTransitionAt: date('2026-07-09'),
    }),
  );
}

describe('Custom assignment window flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps normal flow on cycle-inherited windows when no custom window exists', () => {
    const cycleWindows = cycleQ3Windows();

    const effective = resolveEffectiveTermWindows(
      { assessmentTermCode: AssessmentTermCode.Q3 },
      cycleWindows,
      undefined,
    );

    expect(effective.windowSource).toBe('CYCLE_INHERITED');
    expect(effective.objectiveSettingWindow).toBe(cycleWindows.objectiveSettingWindow);
    expect(effective.objectiveApprovalWindow).toBe(cycleWindows.objectiveApprovalWindow);
    expect(effective.achievementSubmissionWindow).toBe(cycleWindows.achievementSubmissionWindow);
    expect(effective.managerReviewWindow).toBe(cycleWindows.managerReviewWindow);
    expect(effective.termFinalizationWindow).toBe(cycleWindows.termFinalizationWindow);
  });

  it('skips objective setup only for custom continue-from-achievement flow', () => {
    const cycleWindows = cycleQ3Windows();
    const customWindow = continueFromAchievementWindow();

    const effective = resolveEffectiveTermWindows(
      { assessmentTermCode: AssessmentTermCode.Q3 },
      cycleWindows,
      {
        assignmentWindowSnapshot: {
          terms: {
            [AssessmentTermCode.Q3]: customWindow,
          },
        },
      },
    );

    expect(effective.windowSource).toBe('ASSIGNMENT_CUSTOM');
    expect(effective.objectiveSettingWindow).toBeUndefined();
    expect(effective.objectiveApprovalWindow).toBeUndefined();
    expect(effective.achievementSubmissionWindow).toBe(customWindow.achievementSubmissionWindow);
    expect(effective.managerReviewWindow).toBe(customWindow.managerReviewWindow);
  });

  it('keeps objective setup windows for custom reopen-objective-setup flow', () => {
    const cycleWindows = cycleQ3Windows();
    const customWindow = reopenObjectiveSetupWindow();

    const effective = resolveEffectiveTermWindows(
      { assessmentTermCode: AssessmentTermCode.Q3 },
      cycleWindows,
      {
        assignmentWindowSnapshot: {
          terms: {
            [AssessmentTermCode.Q3]: customWindow,
          },
        },
      },
    );

    expect(effective.windowSource).toBe('ASSIGNMENT_CUSTOM');
    expect(effective.objectiveSettingWindow).toBe(customWindow.objectiveSettingWindow);
    expect(effective.objectiveApprovalWindow).toBe(customWindow.objectiveApprovalWindow);
    expect(effective.achievementSubmissionWindow).toBe(customWindow.achievementSubmissionWindow);
  });

  it('requires custom permission before accepting custom windows', () => {
    const service = createAssignmentService();

    expect(() =>
      service.buildAssignmentWindowSnapshot(
        {
          specialWindowOverride: false,
          assignmentWindowSnapshot: {
            reason: 'Employee joined after term started',
            terms: {
              [AssessmentTermCode.Q3]: continueFromAchievementWindow(),
            },
          },
        },
        [AssessmentTermCode.Q3],
      ),
    ).toThrow('Custom assignment window permission is required');
  });

  it('allows one-day same-day window only for continue-from-achievement flow', () => {
    const service = createAssignmentService();
    const sameDayContinueWindow = continueFromAchievementWindow('2026-07-29', '2026-07-29');
    sameDayContinueWindow.managerReviewWindow = {
      startDate: date('2026-07-29'),
      endDate: date('2026-07-29'),
    };
    sameDayContinueWindow.termFinalizationWindow = {
      startDate: date('2026-07-29'),
      endDate: date('2026-07-29'),
    };

    expect(() =>
      service.normalizeAssignmentTermWindow(AssessmentTermCode.Q3, sameDayContinueWindow),
    ).not.toThrow();

    const sameDayReopenWindow: PmsAssignmentTermWindowSnapshot = {
      ...sameDayContinueWindow,
      customFlowMode: 'REOPEN_OBJECTIVE_SETUP',
      objectiveSettingWindow: { startDate: date('2026-07-29'), endDate: date('2026-07-29') },
      objectiveApprovalWindow: { startDate: date('2026-07-29'), endDate: date('2026-07-29') },
    };

    expect(() =>
      service.normalizeAssignmentTermWindow(AssessmentTermCode.Q3, sameDayReopenWindow),
    ).toThrow('window must start after');
  });

  it('opens normal assignments only when objective setting is currently active', async () => {
    const service = createAssignmentService();
    const q3: any = termAssignment();
    mockTransition();

    await service.syncInitialTermAssignmentStates(
      annualAssignment(),
      [q3],
      new Set(),
      termCycleMap(q3, activeObjectiveSettingCycleWindows()),
    );

    expect(transitionTermAssignmentState).toHaveBeenCalledTimes(1);
    expect((transitionTermAssignmentState as jest.Mock).mock.calls[0][1]).toBe(
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    );
    expect(q3.termState).toBe(TermWorkflowState.OBJECTIVE_SETTING_OPEN);
  });

  it('does not auto-submit objectives when normal assignment starts during objective approval', async () => {
    const service = createAssignmentService('2026-07-11T00:00:00.000Z');
    const q3: any = termAssignment();
    mockTransition();

    await service.syncInitialTermAssignmentStates(
      annualAssignment(),
      [q3],
      new Set(),
      termCycleMap(q3, activeObjectiveApprovalCycleWindows()),
    );

    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
    expect(q3.termState).toBe(TermWorkflowState.NOT_STARTED);
  });

  it('opens custom reopen-objective-setup only when custom objective setting is active', async () => {
    const service = createAssignmentService();
    const q3: any = termAssignment();
    mockTransition();

    await service.syncInitialTermAssignmentStates(
      annualAssignment(reopenObjectiveSetupWindow()),
      [q3],
      new Set(),
      termCycleMap(q3, cycleQ3Windows()),
    );

    expect(transitionTermAssignmentState).toHaveBeenCalledTimes(1);
    expect((transitionTermAssignmentState as jest.Mock).mock.calls[0][1]).toBe(
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    );
    expect(q3.termState).toBe(TermWorkflowState.OBJECTIVE_SETTING_OPEN);
  });

  it('does not create a workflow state while only the legacy custom achievement window is active', async () => {
    const service = createAssignmentService();
    const q3: any = termAssignment();
    mockTransition();

    await service.syncInitialTermAssignmentStates(
      annualAssignment(continueFromAchievementWindow()),
      [q3],
      new Set(),
      termCycleMap(q3, cycleQ3Windows()),
    );

    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
    expect(q3.termState).toBe(TermWorkflowState.NOT_STARTED);
  });

  it('moves continue-with-achievement to manager review when achievement is past and custom manager review is active', async () => {
    const service = createAssignmentService('2026-07-21T00:00:00.000Z');
    const q3: any = termAssignment();
    const customWindow = continueFromAchievementWindow('2026-07-09', '2026-07-20');
    mockTransition();

    await service.syncInitialTermAssignmentStates(
      annualAssignment(customWindow),
      [q3],
      new Set(),
      termCycleMap(q3, cycleQ3Windows()),
    );

    expect(transitionTermAssignmentState).toHaveBeenCalledTimes(3);
    expect((transitionTermAssignmentState as jest.Mock).mock.calls.map((call) => call[1])).toEqual([
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      TermWorkflowState.OBJECTIVE_APPROVED,
      TermWorkflowState.MANAGER_REVIEW_OPEN,
    ]);
    expect(q3.termState).toBe(TermWorkflowState.MANAGER_REVIEW_OPEN);
  });

  it('moves continue-with-achievement to finalization-ready when achievement and manager review are past', async () => {
    const service = createAssignmentService('2026-07-29T00:00:00.000Z');
    const q3: any = termAssignment();
    const customWindow = continueFromAchievementWindow('2026-07-09', '2026-07-20');
    mockTransition();

    await service.syncInitialTermAssignmentStates(
      annualAssignment(customWindow),
      [q3],
      new Set(),
      termCycleMap(q3, cycleQ3Windows()),
    );

    expect(transitionTermAssignmentState).toHaveBeenCalledTimes(4);
    expect((transitionTermAssignmentState as jest.Mock).mock.calls.map((call) => call[1])).toEqual([
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      TermWorkflowState.OBJECTIVE_APPROVED,
      TermWorkflowState.MANAGER_REVIEW_OPEN,
      TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
    ]);
    expect(q3.termState).toBe(TermWorkflowState.MANAGER_REVIEW_SUBMITTED);
  });

  it('rejects dates for stages skipped by the selected custom flow', () => {
    const service = createAssignmentService();
    const invalidWindow: PmsAssignmentTermWindowSnapshot = {
      ...continueFromAchievementWindow(),
      objectiveSettingWindow: {
        startDate: date('2026-07-09'),
        endDate: date('2026-07-10'),
      },
    };

    expect(() =>
      service.normalizeAssignmentTermWindow(AssessmentTermCode.Q3, invalidWindow),
    ).toThrow('objective setting window must be empty');
  });

  it('keeps continue-from-achievement scheduled when custom achievement starts later', async () => {
    const service = createAssignmentService();
    const q3: any = termAssignment();
    mockTransition();

    await service.syncInitialTermAssignmentStates(
      annualAssignment(continueFromAchievementWindow('2026-07-15')),
      [q3],
      new Set(),
      termCycleMap(q3, cycleQ3Windows()),
    );

    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
    expect(q3.termState).toBe(TermWorkflowState.NOT_STARTED);
  });

  it('does not overwrite already-progressed term assignments during initial sync', async () => {
    const service = createAssignmentService();
    const q3: any = termAssignment(AssessmentTermCode.Q3, TermWorkflowState.OBJECTIVE_SUBMITTED);
    mockTransition();

    await service.syncInitialTermAssignmentStates(
      annualAssignment(continueFromAchievementWindow()),
      [q3],
      new Set(),
      termCycleMap(q3, cycleQ3Windows()),
    );

    expect(transitionTermAssignmentState).not.toHaveBeenCalled();
    expect(q3.termState).toBe(TermWorkflowState.OBJECTIVE_SUBMITTED);
  });
});
