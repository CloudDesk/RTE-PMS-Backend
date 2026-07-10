import type { AssessmentTermCode as AssessmentTermCodeType } from '../constants/pms.enums';

export interface PmsDateWindowSnapshot {
  startDate?: Date;
  endDate?: Date;
}

export interface PmsAchievementWindowSnapshot extends PmsDateWindowSnapshot {
  enabled?: boolean;
  dueDate?: Date;
  graceDays?: number;
  reminderDaysBefore?: number[];
  escalationDaysAfterDue?: number;
}

export interface PmsAssignmentTermWindowSnapshot {
  windowSource?: 'ASSIGNMENT_CUSTOM' | 'CYCLE_INHERITED';
  customFlowMode?:
    | 'REOPEN_OBJECTIVE_SETUP'
    | 'CONTINUE_FROM_ACHIEVEMENT';
  objectiveSettingWindow?: PmsDateWindowSnapshot;
  objectiveApprovalWindow?: PmsDateWindowSnapshot;
  achievementSubmissionWindow?: PmsAchievementWindowSnapshot;
  managerReviewWindow?: PmsDateWindowSnapshot;
  termFinalizationWindow?: PmsDateWindowSnapshot;
}

export interface PmsAssignmentWindowSnapshot {
  mode?: string;
  specialWindowOverride?: boolean;
  reason?: string;
  createdBy?: unknown;
  createdAt?: Date;
  terms?: Partial<Record<AssessmentTermCodeType, PmsAssignmentTermWindowSnapshot>>;
}

export interface PmsEffectiveTermWindows {
  objectiveSettingWindow?: PmsDateWindowSnapshot;
  objectiveApprovalWindow?: PmsDateWindowSnapshot;
  achievementSubmissionWindow?: PmsAchievementWindowSnapshot;
  managerReviewWindow?: PmsDateWindowSnapshot;
  termFinalizationWindow?: PmsDateWindowSnapshot;
  windowSource: 'ASSIGNMENT_CUSTOM' | 'CYCLE_INHERITED';
}

interface TermAssignmentLike {
  assessmentTermCode?: AssessmentTermCodeType;
}

interface TermCycleLike {
  objectiveSettingWindow?: PmsDateWindowSnapshot;
  objectiveApprovalWindow?: PmsDateWindowSnapshot;
  achievementSubmissionWindow?: PmsAchievementWindowSnapshot;
  managerReviewWindow?: PmsDateWindowSnapshot;
  termFinalizationWindow?: PmsDateWindowSnapshot;
}

interface AnnualAssignmentLike {
  assignmentWindowSnapshot?: PmsAssignmentWindowSnapshot;
}

function hasWindow(window?: PmsDateWindowSnapshot): boolean {
  return Boolean(window?.startDate || window?.endDate);
}

function hasAchievementWindow(window?: PmsAchievementWindowSnapshot): boolean {
  return Boolean(
    window?.enabled === true ||
    window?.startDate ||
    window?.endDate ||
    window?.dueDate,
  );
}

function hasCustomTermWindow(termWindow?: PmsAssignmentTermWindowSnapshot): boolean {
  return Boolean(
    termWindow?.windowSource === 'ASSIGNMENT_CUSTOM' ||
    hasWindow(termWindow?.objectiveSettingWindow) ||
    hasWindow(termWindow?.objectiveApprovalWindow) ||
    hasAchievementWindow(termWindow?.achievementSubmissionWindow) ||
    hasWindow(termWindow?.managerReviewWindow) ||
    hasWindow(termWindow?.termFinalizationWindow),
  );
}

type CustomWindowStage =
  | 'objectiveSetting'
  | 'objectiveApproval'
  | 'achievement'
  | 'managerReview'
  | 'finalization';

function getCustomFlowStartStage(
  customFlowMode?: PmsAssignmentTermWindowSnapshot['customFlowMode'],
): CustomWindowStage {
  if (customFlowMode === 'CONTINUE_FROM_ACHIEVEMENT') return 'achievement';
  return 'objectiveSetting';
}

function isCustomStageIncluded(
  customFlowMode: PmsAssignmentTermWindowSnapshot['customFlowMode'] | undefined,
  stage: CustomWindowStage,
): boolean {
  const order: CustomWindowStage[] = [
    'objectiveSetting',
    'objectiveApproval',
    'achievement',
    'managerReview',
    'finalization',
  ];
  return order.indexOf(stage) >= order.indexOf(getCustomFlowStartStage(customFlowMode));
}

export function resolveAssignmentTermWindowSnapshot(
  termAssignment: TermAssignmentLike,
  annualAssignment?: AnnualAssignmentLike | null,
): PmsAssignmentTermWindowSnapshot | undefined {
  const termCode = termAssignment.assessmentTermCode;
  if (!termCode) return undefined;
  return annualAssignment?.assignmentWindowSnapshot?.terms?.[termCode];
}

export function resolveEffectiveTermWindows(
  termAssignment: TermAssignmentLike,
  termCycle?: TermCycleLike | null,
  annualAssignment?: AnnualAssignmentLike | null,
): PmsEffectiveTermWindows {
  const assignmentTermWindow = resolveAssignmentTermWindowSnapshot(
    termAssignment,
    annualAssignment,
  );
  const useCustomWindow = hasCustomTermWindow(assignmentTermWindow);

  if (useCustomWindow && assignmentTermWindow) {
    const customFlowMode = assignmentTermWindow.customFlowMode;

    return {
      objectiveSettingWindow: isCustomStageIncluded(customFlowMode, 'objectiveSetting')
        ? assignmentTermWindow.objectiveSettingWindow
        : undefined,
      objectiveApprovalWindow: isCustomStageIncluded(customFlowMode, 'objectiveApproval')
        ? assignmentTermWindow.objectiveApprovalWindow
        : undefined,
      achievementSubmissionWindow: isCustomStageIncluded(customFlowMode, 'achievement')
        ? assignmentTermWindow.achievementSubmissionWindow
        : undefined,
      managerReviewWindow: isCustomStageIncluded(customFlowMode, 'managerReview')
        ? assignmentTermWindow.managerReviewWindow
        : undefined,
      termFinalizationWindow:
        assignmentTermWindow.termFinalizationWindow,
      windowSource: 'ASSIGNMENT_CUSTOM',
    };
  }

  return {
    objectiveSettingWindow: termCycle?.objectiveSettingWindow,
    objectiveApprovalWindow: termCycle?.objectiveApprovalWindow,
    achievementSubmissionWindow: termCycle?.achievementSubmissionWindow,
    managerReviewWindow: termCycle?.managerReviewWindow,
    termFinalizationWindow: termCycle?.termFinalizationWindow,
    windowSource: 'CYCLE_INHERITED',
  };
}

export function mapEffectiveTermWindowsForResponse(
  windows: PmsEffectiveTermWindows,
) {
  const mapWindow = (window?: PmsDateWindowSnapshot) => {
    if (!window?.startDate || !window?.endDate) return undefined;
    return {
      startDate: new Date(window.startDate).toISOString(),
      endDate: new Date(window.endDate).toISOString(),
    };
  };

  const achievementSubmissionWindow = windows.achievementSubmissionWindow
    ? {
        enabled: windows.achievementSubmissionWindow.enabled === true,
        startDate: windows.achievementSubmissionWindow.startDate
          ? new Date(windows.achievementSubmissionWindow.startDate).toISOString()
          : undefined,
        endDate: windows.achievementSubmissionWindow.endDate
          ? new Date(windows.achievementSubmissionWindow.endDate).toISOString()
          : undefined,
        dueDate: windows.achievementSubmissionWindow.dueDate
          ? new Date(windows.achievementSubmissionWindow.dueDate).toISOString()
          : undefined,
        graceDays: windows.achievementSubmissionWindow.graceDays,
        reminderDaysBefore: windows.achievementSubmissionWindow.reminderDaysBefore,
        escalationDaysAfterDue: windows.achievementSubmissionWindow.escalationDaysAfterDue,
      }
    : undefined;

  return {
    windowSource: windows.windowSource,
    objectiveSetting: mapWindow(windows.objectiveSettingWindow),
    objectiveApproval: mapWindow(windows.objectiveApprovalWindow),
    achievementSubmission: achievementSubmissionWindow,
    managerReview: mapWindow(windows.managerReviewWindow),
    quarterFinalization: mapWindow(windows.termFinalizationWindow),
  };
}
