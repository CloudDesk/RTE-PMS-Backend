import type { AchievementEntryMode as AchievementEntryModeType } from '../models/pms-employee-achievement-submission.model';

const OBJECTIVE_ROWS = 'OBJECTIVE_ROWS' as const;
const EMPLOYEE_AUTHORED = 'EMPLOYEE_AUTHORED' as const;
const OBJECTIVE_ITEM = 'OBJECTIVE' as const;
const SUBMITTED = 'SUBMITTED' as const;
const LOCKED = 'LOCKED' as const;

export type EmployeeAchievementCompletionConfig = {
  achievementEntryMode: AchievementEntryModeType;
  achievementSubmissionRequired: boolean;
  objectiveRelationshipRequired: boolean;
  objectiveLinkedAchievementRequired: boolean;
};

export function resolveEmployeeAchievementCompletionConfig(
  metadata?: Record<string, any>,
): EmployeeAchievementCompletionConfig {
  const raw = (metadata?.employeeAchievementConfig ?? {}) as Record<string, any>;
  const achievementEntryMode = raw.achievementEntryMode === EMPLOYEE_AUTHORED
    ? EMPLOYEE_AUTHORED
    : OBJECTIVE_ROWS;

  return {
    achievementEntryMode,
    achievementSubmissionRequired:
      raw.achievementSubmissionRequired !== undefined
        ? Boolean(raw.achievementSubmissionRequired)
        : true,
    objectiveRelationshipRequired:
      raw.objectiveRelationshipRequired !== undefined
        ? Boolean(raw.objectiveRelationshipRequired)
        : false,
    objectiveLinkedAchievementRequired:
      raw.objectiveLinkedAchievementRequired !== undefined
        ? Boolean(raw.objectiveLinkedAchievementRequired)
        : achievementEntryMode === OBJECTIVE_ROWS,
  };
}

export function isEmployeeAchievementSubmissionComplete(input: {
  submission?: Record<string, any> | null;
  config: EmployeeAchievementCompletionConfig;
  scoreableObjectiveIds?: string[];
}): boolean {
  const { submission, config } = input;

  if (!config.achievementSubmissionRequired) {
    return true;
  }
  if (submission?.status === LOCKED) {
    return true;
  }

  const items = Array.isArray(submission?.achievementItems) ? submission.achievementItems : [];
  const submittedItems = items.filter(isSubmittedAchievementItem);

  if (config.achievementEntryMode === EMPLOYEE_AUTHORED) {
    return submission?.status === SUBMITTED;
  }

  if (submittedItems.length === 0) {
    return false;
  }
  if (!config.objectiveLinkedAchievementRequired) {
    return submission?.status === SUBMITTED;
  }

  const scoreableObjectiveIds = input.scoreableObjectiveIds ?? [];
  if (scoreableObjectiveIds.length === 0) {
    return true;
  }

  const submittedObjectiveIds = new Set(
    submittedItems
      .filter((item) =>
        item?.type === OBJECTIVE_ITEM &&
        item?.objectiveId &&
        String(item.description ?? '').trim().length > 0
      )
      .map((item) => item.objectiveId.toString()),
  );

  return scoreableObjectiveIds.every((objectiveId) => submittedObjectiveIds.has(objectiveId));
}

function isSubmittedAchievementItem(item: Record<string, any>): boolean {
  return (
    item?.itemStatus === SUBMITTED ||
    item?.itemStatus === LOCKED ||
    Boolean(item?.submittedAt)
  );
}
