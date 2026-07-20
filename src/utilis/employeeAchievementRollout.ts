import { randomUUID } from 'crypto';

export type AchievementRolloutClassification =
  | 'NO_SUBMISSION'
  | 'EMPTY_DRAFT'
  | 'MEANINGFUL_DRAFT'
  | 'SUBMITTED_OR_LOCKED';

export function isMeaningfulLegacyAchievementItem(item: Record<string, any>): boolean {
  return Boolean(
    String(item.subject ?? '').trim() ||
    String(item.description ?? '').trim() ||
    String(item.outcome ?? '').trim() ||
    item.employeeSelfRating !== undefined ||
    (Array.isArray(item.attachments) && item.attachments.length > 0),
  );
}

export function classifyAchievementSubmissionForRollout(
  submission?: Record<string, any> | null,
): AchievementRolloutClassification {
  if (!submission) return 'NO_SUBMISSION';
  if (submission.status === 'SUBMITTED' || submission.status === 'LOCKED') {
    return 'SUBMITTED_OR_LOCKED';
  }
  const meaningfulItems = (submission.achievementItems ?? []).filter(
    isMeaningfulLegacyAchievementItem,
  );
  return meaningfulItems.length > 0 ? 'MEANINGFUL_DRAFT' : 'EMPTY_DRAFT';
}

export function convertLegacyDraftItemsForEmployeeAuthoredMode(
  items: Array<Record<string, any>>,
): Array<Record<string, any>> {
  return items.filter(isMeaningfulLegacyAchievementItem).map((item) => {
    const objectiveSnapshot = item.objectiveSnapshot
      ? JSON.parse(JSON.stringify(item.objectiveSnapshot))
      : undefined;
    const converted: Record<string, any> = {
      ...item,
      itemId: String(item.itemId ?? '').trim() || randomUUID(),
      type: 'EMPLOYEE_AUTHORED',
      subject:
        String(item.subject ?? '').trim() ||
        String(objectiveSnapshot?.title ?? '').trim() ||
        'Achievement',
      relatedObjectiveId: item.relatedObjectiveId ?? item.objectiveId,
      relatedObjectiveSnapshot: item.relatedObjectiveSnapshot ?? objectiveSnapshot,
    };
    delete converted.objectiveId;
    delete converted.objectiveSnapshot;
    return converted;
  });
}

export function employeeAuthoredRolloutMetadata(
  metadata: Record<string, any> | undefined,
  sourceVersionId: string,
  reason: string,
  now = new Date(),
): Record<string, any> {
  const existingConfig = (metadata?.employeeAchievementConfig ?? {}) as Record<string, any>;
  return {
    ...(metadata ?? {}),
    reviewFlowMode: 'ACHIEVEMENT_THEN_MANAGER',
    employeeAchievementConfig: {
      ...existingConfig,
      employeeAchievementEnabled: true,
      achievementSubmissionRequired:
        existingConfig.achievementSubmissionRequired !== false,
      achievementEntryMode: 'EMPLOYEE_AUTHORED',
      objectiveRelationshipEnabled: true,
      objectiveRelationshipRequired: false,
      allowMultipleAchievementsPerObjective: true,
      objectiveLinkedAchievementRequired: false,
      additionalContributionsEnabled: true,
      managerCanEditEmployeeAchievement: false,
    },
    employeeAchievementRollout: {
      sourceVersionId,
      migratedAt: now.toISOString(),
      reason,
      strategy: 'CLONED_VERSION_AND_REASSIGNED_ELIGIBLE_ASSIGNMENTS',
    },
  };
}
