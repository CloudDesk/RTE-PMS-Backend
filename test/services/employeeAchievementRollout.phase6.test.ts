import {
  classifyAchievementSubmissionForRollout,
  convertLegacyDraftItemsForEmployeeAuthoredMode,
  employeeAuthoredRolloutMetadata,
} from '../../src/utilis/employeeAchievementRollout';

describe('Employee achievement Phase 6 rollout helpers', () => {
  it('classifies historical submission safety without mutating records', () => {
    expect(classifyAchievementSubmissionForRollout()).toBe('NO_SUBMISSION');
    expect(classifyAchievementSubmissionForRollout({ status: 'DRAFT', achievementItems: [] }))
      .toBe('EMPTY_DRAFT');
    expect(classifyAchievementSubmissionForRollout({
      status: 'DRAFT',
      achievementItems: [{ objectiveId: 'objective-1', description: 'Delivered result' }],
    })).toBe('MEANINGFUL_DRAFT');
    expect(classifyAchievementSubmissionForRollout({
      status: 'SUBMITTED',
      achievementItems: [{ description: 'Historical result' }],
    })).toBe('SUBMITTED_OR_LOCKED');
  });

  it('converts only meaningful legacy draft rows and preserves the relationship snapshot', () => {
    const converted = convertLegacyDraftItemsForEmployeeAuthoredMode([
      { objectiveId: 'objective-1', objectiveSnapshot: { title: 'Improve quality' } },
      {
        objectiveId: 'objective-2',
        objectiveSnapshot: { title: 'Reduce downtime' },
        description: 'Introduced preventive maintenance.',
        attachments: [{ fileName: 'proof.pdf' }],
      },
    ]);

    expect(converted).toHaveLength(1);
    expect(converted[0]).toEqual(expect.objectContaining({
      type: 'EMPLOYEE_AUTHORED',
      subject: 'Reduce downtime',
      relatedObjectiveId: 'objective-2',
      relatedObjectiveSnapshot: { title: 'Reduce downtime' },
      description: 'Introduced preventive maintenance.',
    }));
    expect(converted[0].itemId).toEqual(expect.any(String));
    expect(converted[0].objectiveId).toBeUndefined();
  });

  it('creates additive rollout metadata and does not change permission metadata', () => {
    const metadata = employeeAuthoredRolloutMetadata(
      {
        permissionPresetRef: 'STANDARD_PMS_PERMISSIONS',
        employeeAchievementConfig: { achievementSubmissionRequired: false },
      },
      'source-version',
      'Approved pilot',
      new Date('2026-07-21T00:00:00.000Z'),
    );

    expect(metadata.permissionPresetRef).toBe('STANDARD_PMS_PERMISSIONS');
    expect(metadata.employeeAchievementConfig).toEqual(expect.objectContaining({
      achievementEntryMode: 'EMPLOYEE_AUTHORED',
      achievementSubmissionRequired: false,
      objectiveRelationshipRequired: false,
      managerCanEditEmployeeAchievement: false,
    }));
    expect(metadata.employeeAchievementRollout).toEqual(expect.objectContaining({
      sourceVersionId: 'source-version',
      reason: 'Approved pilot',
    }));
  });
});
