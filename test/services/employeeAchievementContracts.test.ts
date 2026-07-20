import { Types } from 'mongoose';
import { PmsRole } from '../../src/constants/pms.enums';
import {
  AchievementEntryMode,
  AchievementItemType,
  EmployeeAchievementSubmission,
  EmployeeAchievementSubmissionStatus,
} from '../../src/models/pms-employee-achievement-submission.model';
import { EmployeeAchievementSubmissionService } from '../../src/services/employeeAchievementSubmission.service';
import type { RequestContext } from '../../src/types/context';

function createService() {
  const context: RequestContext = {
    requestId: 'employee-achievement-contract-test',
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

describe('EmployeeAchievementSubmissionService - Phase 1 contracts', () => {
  it('adds employee-authored persistence fields without removing legacy fields', () => {
    const achievementItemsPath = EmployeeAchievementSubmission.schema.path('achievementItems') as any;
    const itemSchema = achievementItemsPath.schema;

    expect(Object.values(AchievementItemType)).toContain(AchievementItemType.EMPLOYEE_AUTHORED);
    expect(itemSchema.path('itemId')).toBeDefined();
    expect(itemSchema.path('objectiveId')).toBeDefined();
    expect(itemSchema.path('objectiveSnapshot')).toBeDefined();
    expect(itemSchema.path('relatedObjectiveId')).toBeDefined();
    expect(itemSchema.path('relatedObjectiveSnapshot')).toBeDefined();
  });

  it('resolves missing entry-mode metadata as legacy objective rows', () => {
    const service = createService();
    const config = service.resolveTemplateConfig(
      { metadata: {} },
      { sectionKey: 'employee_achievement_submission' },
    );

    expect(config).toEqual(expect.objectContaining({
      achievementEntryMode: AchievementEntryMode.OBJECTIVE_ROWS,
      objectiveLinkedAchievementRequired: true,
      objectiveRelationshipEnabled: true,
      objectiveRelationshipRequired: false,
      allowMultipleAchievementsPerObjective: true,
    }));
  });

  it('preserves explicit employee-authored relationship configuration', () => {
    const service = createService();
    const config = service.resolveTemplateConfig(
      {
        metadata: {
          employeeAchievementConfig: {
            achievementEntryMode: AchievementEntryMode.EMPLOYEE_AUTHORED,
            objectiveRelationshipEnabled: true,
            objectiveRelationshipRequired: false,
            allowMultipleAchievementsPerObjective: true,
          },
        },
      },
      { sectionKey: 'employee_achievement_submission' },
    );

    expect(config).toEqual(expect.objectContaining({
      achievementEntryMode: AchievementEntryMode.EMPLOYEE_AUTHORED,
      objectiveLinkedAchievementRequired: false,
      objectiveRelationshipEnabled: true,
      objectiveRelationshipRequired: false,
      allowMultipleAchievementsPerObjective: true,
    }));
  });

  it('returns new item identity and relationship fields without dropping legacy fields', () => {
    const service = createService();
    const objectiveId = new Types.ObjectId();
    const relatedObjectiveId = new Types.ObjectId();
    const now = new Date('2026-07-21T10:00:00.000Z');

    const result = service.mapSubmissionRecord({
      _id: new Types.ObjectId(),
      annualAssignmentId: new Types.ObjectId(),
      termAssignmentId: new Types.ObjectId(),
      employeeId: new Types.ObjectId(),
      managerId: new Types.ObjectId(),
      assessmentTermCode: 'Q1',
      status: EmployeeAchievementSubmissionStatus.DRAFT,
      achievementItems: [
        {
          itemId: 'achievement-item-1',
          type: AchievementItemType.EMPLOYEE_AUTHORED,
          objectiveId,
          objectiveSnapshot: { title: 'Legacy objective' },
          relatedObjectiveId,
          relatedObjectiveSnapshot: {
            title: 'Reduce machine downtime',
            assessmentTermCode: 'Q1',
            objectiveNo: 2,
          },
          subject: 'Preventive maintenance rollout',
          description: 'Rolled out the new preventive maintenance schedule.',
          attachments: [],
        },
      ],
      achievementValues: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(result.achievementItems[0]).toEqual(expect.objectContaining({
      itemId: 'achievement-item-1',
      type: AchievementItemType.EMPLOYEE_AUTHORED,
      objectiveId: objectiveId.toString(),
      relatedObjectiveId: relatedObjectiveId.toString(),
      subject: 'Preventive maintenance rollout',
      relatedObjectiveSnapshot: expect.objectContaining({
        title: 'Reduce machine downtime',
        assessmentTermCode: 'Q1',
        objectiveNo: 2,
      }),
    }));
  });
});
