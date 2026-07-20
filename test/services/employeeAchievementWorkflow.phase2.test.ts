import { Types } from 'mongoose';
import { PmsRole } from '../../src/constants/pms.enums';
import {
  AchievementEntryMode,
  AchievementItemType,
  EmployeeAchievementSubmissionStatus,
} from '../../src/models/pms-employee-achievement-submission.model';
import { EmployeeAchievementSubmissionService } from '../../src/services/employeeAchievementSubmission.service';
import {
  isEmployeeAchievementSubmissionComplete,
  resolveEmployeeAchievementCompletionConfig,
} from '../../src/utilis/employeeAchievementCompletion';
import type { RequestContext } from '../../src/types/context';

function createService() {
  const context: RequestContext = {
    requestId: 'employee-achievement-phase-2-test',
    reqRole: 'employee',
    user: {
      _id: new Types.ObjectId(),
      email: 'employee@example.com',
      name: 'Employee',
      role: PmsRole.EMPLOYEE,
      departmentId: 'Engineering',
      active: true,
      country: 'IN',
      currency: 'INR',
      licenseType: 'FULL',
      portalAccess: true,
    },
  };
  return new EmployeeAchievementSubmissionService(context) as any;
}

function employeeAuthoredConfig(overrides: Record<string, unknown> = {}) {
  return {
    reviewFlowMode: 'ACHIEVEMENT_THEN_MANAGER',
    employeeAchievementEnabled: true,
    achievementSubmissionRequired: true,
    achievementEntryMode: AchievementEntryMode.EMPLOYEE_AUTHORED,
    objectiveRelationshipEnabled: true,
    objectiveRelationshipRequired: false,
    allowMultipleAchievementsPerObjective: true,
    objectiveLinkedAchievementRequired: false,
    additionalContributionsEnabled: true,
    allowManagerReviewWithoutAchievement: false,
    managerCanEditEmployeeAchievement: false,
    ...overrides,
  };
}

function approvedObjective() {
  return {
    id: new Types.ObjectId().toString(),
    assessmentTermCode: 'Q1',
    objectiveNo: 2,
    title: 'Reduce machine downtime',
    description: 'Improve preventive maintenance.',
    isScoreable: true,
  };
}

describe('EmployeeAchievementSubmissionService - Phase 2 workflow', () => {
  it('preserves the employee subject and stores an approved objective as a relationship', () => {
    const service = createService();
    const objective = approvedObjective();

    const [item] = service.normalizeAchievementItems(
      [{
        itemId: 'authored-1',
        type: AchievementItemType.EMPLOYEE_AUTHORED,
        relatedObjectiveId: objective.id,
        subject: 'Preventive maintenance rollout',
        description: 'Rolled out a new maintenance schedule.',
      }],
      true,
      [objective],
      employeeAuthoredConfig(),
    );

    expect(item).toEqual(expect.objectContaining({
      itemId: 'authored-1',
      type: AchievementItemType.EMPLOYEE_AUTHORED,
      subject: 'Preventive maintenance rollout',
      objectiveId: undefined,
      relatedObjectiveSnapshot: expect.objectContaining({
        title: objective.title,
        assessmentTermCode: 'Q1',
        objectiveNo: 2,
      }),
    }));
    expect(item.relatedObjectiveId.toString()).toBe(objective.id);
  });

  it('generates stable IDs and allows duplicate subjects and relationships', () => {
    const service = createService();
    const objective = approvedObjective();
    const items = service.normalizeAchievementItems(
      [
        { relatedObjectiveId: objective.id, subject: 'Same subject', description: 'First result.' },
        { relatedObjectiveId: objective.id, subject: 'Same subject', description: 'Second result.' },
      ],
      true,
      [objective],
      employeeAuthoredConfig(),
    );

    expect(items).toHaveLength(2);
    expect(items[0].itemId).toEqual(expect.any(String));
    expect(items[1].itemId).toEqual(expect.any(String));
    expect(items[0].itemId).not.toBe(items[1].itemId);
  });

  it('rejects invalid and missing required objective relationships', () => {
    const service = createService();

    expect(() => service.normalizeAchievementItems(
      [{ subject: 'Achievement', description: 'Result', relatedObjectiveId: new Types.ObjectId().toString() }],
      true,
      [],
      employeeAuthoredConfig(),
    )).toThrow('Related Objective must be an approved objective');

    expect(() => service.normalizeAchievementItems(
      [{ subject: 'Achievement', description: 'Result' }],
      true,
      [],
      employeeAuthoredConfig({ objectiveRelationshipRequired: true }),
    )).toThrow('Related Objective is required');
  });

  it('merges employee-authored items only by itemId', () => {
    const service = createService();
    const existing = [
      { itemId: 'item-1', type: AchievementItemType.EMPLOYEE_AUTHORED, subject: 'Same', description: 'One' },
      { itemId: 'item-2', type: AchievementItemType.EMPLOYEE_AUTHORED, subject: 'Same', description: 'Two' },
    ];

    const merged = service.mergeAchievementItem(existing, {
      itemId: 'item-2',
      type: AchievementItemType.EMPLOYEE_AUTHORED,
      subject: 'Same',
      description: 'Updated two',
    });

    expect(merged).toHaveLength(2);
    expect(merged[0].description).toBe('One');
    expect(merged[1].description).toBe('Updated two');
  });

  it('lazily assigns an itemId while updating a legacy objective row in place', () => {
    const service = createService();
    const objectiveId = new Types.ObjectId();
    const merged = service.mergeAchievementItem(
      [{
        type: AchievementItemType.OBJECTIVE,
        objectiveId,
        subject: 'Legacy objective',
        description: 'Old result',
      }],
      {
        itemId: 'lazy-item-id',
        type: AchievementItemType.OBJECTIVE,
        objectiveId,
        subject: 'Legacy objective',
        description: 'Updated result',
      },
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(expect.objectContaining({
      itemId: 'lazy-item-id',
      description: 'Updated result',
    }));
  });

  it('keeps submitted items read-only', () => {
    const service = createService();
    expect(() => service.assertItemCanBeEdited(
      [{ itemId: 'item-1', itemStatus: EmployeeAchievementSubmissionStatus.SUBMITTED }],
      { itemId: 'item-1' },
    )).toThrow('Submitted achievement item is read-only');
    expect(() => service.assertSubmittedItemsPreserved(
      [{
        itemId: 'item-1',
        type: AchievementItemType.EMPLOYEE_AUTHORED,
        subject: 'Achievement',
        description: 'Submitted result',
        itemStatus: EmployeeAchievementSubmissionStatus.SUBMITTED,
      }],
      [],
    )).toThrow('Submitted achievement items must remain unchanged');
  });

  it('records entry mode and objective relationship changes in mutation audit metadata', () => {
    const service = createService();
    const relatedObjectiveId = new Types.ObjectId();
    const metadata = service.buildAchievementMutationAuditMetadata(
      employeeAuthoredConfig(),
      [{ itemId: 'item-1' }],
      [{
        itemId: 'item-1',
        relatedObjectiveId,
        relatedObjectiveSnapshot: { title: 'Reduce machine downtime' },
      }],
    );

    expect(metadata).toEqual(expect.objectContaining({
      achievementEntryMode: AchievementEntryMode.EMPLOYEE_AUTHORED,
      itemIds: ['item-1'],
      relationshipChanges: [expect.objectContaining({
        itemId: 'item-1',
        relatedObjectiveId: relatedObjectiveId.toString(),
      })],
    }));
  });

  it('uses mode-aware workflow and SLA completion rules', () => {
    const employeeConfig = resolveEmployeeAchievementCompletionConfig({
      employeeAchievementConfig: {
        achievementEntryMode: AchievementEntryMode.EMPLOYEE_AUTHORED,
        achievementSubmissionRequired: true,
      },
    });
    expect(isEmployeeAchievementSubmissionComplete({
      submission: {
        status: EmployeeAchievementSubmissionStatus.SUBMITTED,
        achievementItems: [{
          itemId: 'item-1',
          type: AchievementItemType.EMPLOYEE_AUTHORED,
          subject: 'Achievement',
          description: 'Result',
          itemStatus: EmployeeAchievementSubmissionStatus.SUBMITTED,
        }],
      },
      config: employeeConfig,
      scoreableObjectiveIds: ['objective-not-covered'],
    })).toBe(true);

    const legacyConfig = resolveEmployeeAchievementCompletionConfig({});
    expect(legacyConfig.achievementEntryMode).toBe(AchievementEntryMode.OBJECTIVE_ROWS);
    expect(isEmployeeAchievementSubmissionComplete({
      submission: {
        status: EmployeeAchievementSubmissionStatus.SUBMITTED,
        achievementItems: [{
          type: AchievementItemType.ADDITIONAL,
          description: 'Additional result',
          itemStatus: EmployeeAchievementSubmissionStatus.SUBMITTED,
        }],
      },
      config: legacyConfig,
      scoreableObjectiveIds: ['legacy-objective'],
    })).toBe(false);
  });
});
