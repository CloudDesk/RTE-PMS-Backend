import { Types } from 'mongoose';
import {
  AssessmentTermCode,
  AssessmentTermType,
  ObjectiveActualAggregationMode,
  ObjectiveTargetDirection,
  PmsRole,
} from '../../src/constants/pms.enums';
import { EmployeeAchievementSubmissionService } from '../../src/services/employeeAchievementSubmission.service';
import type { RequestContext } from '../../src/types/context';

function createService() {
  const actorId = new Types.ObjectId();
  const context: RequestContext = {
    requestId: 'employee-achievement-actual-columns-test',
    reqRole: 'employee',
    user: {
      _id: actorId,
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

function createAchievementSection() {
  const field = {
    _id: new Types.ObjectId(),
    fieldKey: 'achievement_items',
    fieldLabel: 'Achievement Items',
    fieldType: 'DATA_GRID',
    gridConfig: {
      columns: [
        { key: 'achievement_subject', label: 'Subject' },
        { key: 'achievement_description', label: 'Description' },
        { key: 'q1_actual', label: 'Q1 Actual' },
        { key: 'h1_actual', label: 'H1 Actual' },
        { key: 'y1_actual', label: 'Y1 Actual' },
      ],
    },
  };

  return {
    field,
    section: {
      sectionKey: 'employee_achievement_submission',
      sectionLabel: 'Employee Achievement Submission',
      level: 'TERM',
      fields: [
        field,
        {
          _id: new Types.ObjectId(),
          fieldKey: 'q1_actual',
          fieldLabel: 'Q1 Actual',
          fieldType: 'NUMBER',
        },
        {
          _id: new Types.ObjectId(),
          fieldKey: 'q2_actual_summary',
          fieldLabel: 'Q2 Actual Summary',
          fieldType: 'TEXT',
        },
      ],
    },
  };
}

describe('EmployeeAchievementSubmissionService - actual columns by cycle term type', () => {
  it('marks configured actual columns against the selected cycle term type', async () => {
    const service = createService();
    const { section, field } = createAchievementSection();

    const metadata = await service.resolveActualColumnMetadata(
      {
        assessmentTermType: AssessmentTermType.HALF_YEARLY,
        assessmentTermCode: AssessmentTermCode.H1,
      },
      section,
      field,
    );

    expect(metadata.allowedTerms).toEqual([AssessmentTermCode.H1, AssessmentTermCode.H2]);
    expect(metadata.configuredActualColumns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'h1_actual', term: AssessmentTermCode.H1, allowed: true }),
        expect.objectContaining({ key: 'q1_actual', term: AssessmentTermCode.Q1, allowed: false }),
        expect.objectContaining({ key: 'q2_actual_summary', term: AssessmentTermCode.Q2, allowed: false }),
      ]),
    );
  });

  it('rejects quarterly actual columns for a half-yearly cycle', async () => {
    const service = createService();
    const { section, field } = createAchievementSection();

    await expect(
      service.assertActualColumnsAllowedForCycleTermType(
        {
          assessmentTermType: AssessmentTermType.HALF_YEARLY,
          assessmentTermCode: AssessmentTermCode.H1,
        },
        section,
        field,
        [
          {
            fieldKey: 'q1_actual',
            sectionKey: 'employee_achievement_submission',
            valueNumber: 100,
          },
        ],
      ),
    ).rejects.toThrow('Actual columns Q1 are not allowed for HALF_YEARLY cycle');
  });

  it('rejects nested disallowed actual columns inside grid values', async () => {
    const service = createService();
    const { section, field } = createAchievementSection();

    await expect(
      service.assertActualColumnsAllowedForCycleTermType(
        {
          assessmentTermType: AssessmentTermType.YEARLY,
          assessmentTermCode: AssessmentTermCode.Y1,
        },
        section,
        field,
        [
          {
            fieldKey: 'achievement_items',
            sectionKey: 'employee_achievement_submission',
            valueJson: [{ subject: 'Delivery', q1_actual: 80 }],
          },
        ],
      ),
    ).rejects.toThrow('Actual columns Q1 are not allowed for YEARLY cycle');
  });

  it('allows yearly actual columns for a yearly cycle', async () => {
    const service = createService();
    const { section, field } = createAchievementSection();

    await expect(
      service.assertActualColumnsAllowedForCycleTermType(
        {
          assessmentTermType: AssessmentTermType.YEARLY,
          assessmentTermCode: AssessmentTermCode.Y1,
        },
        section,
        field,
        [
          {
            fieldKey: 'achievement_items',
            sectionKey: 'employee_achievement_submission',
            valueJson: [{ subject: 'Delivery', y1_actual: 95 }],
          },
        ],
      ),
    ).resolves.toBeUndefined();
  });

  it('blocks submission when a numeric target objective is missing actual value', () => {
    const service = createService();
    const { section, field } = createAchievementSection();
    const objectiveId = new Types.ObjectId().toString();

    expect(() =>
      service.validateAchievementPayload(
        section,
        field,
        [
          {
            type: 'OBJECTIVE',
            objectiveId,
            subject: 'Revenue growth',
            description: 'Completed account plan.',
          },
        ],
        [
          {
            fieldKey: 'achievement_items',
            sectionKey: 'employee_achievement_submission',
            valueJson: [{ objectiveId, description: 'Completed account plan.' }],
          },
        ],
        true,
        {
          achievementSubmissionRequired: true,
          objectiveLinkedAchievementRequired: true,
        },
        [
          {
            id: objectiveId,
            title: 'Revenue growth',
            targetValue: '100',
            targetDirection: ObjectiveTargetDirection.HIGHER_IS_BETTER,
            isScoreable: true,
          },
        ],
        [],
      ),
    ).toThrow('Actual value is required for objective: Revenue growth');
  });

  it('blocks non-numeric actual value for a numeric target objective', () => {
    const service = createService();
    const { section, field } = createAchievementSection();
    const objectiveId = new Types.ObjectId().toString();

    expect(() =>
      service.validateAchievementPayload(
        section,
        field,
        [
          {
            type: 'OBJECTIVE',
            objectiveId,
            subject: 'Defect reduction',
            description: 'Reduced defects.',
          },
        ],
        [
          {
            fieldKey: 'achievement_items',
            sectionKey: 'employee_achievement_submission',
            valueJson: [{ objectiveId, q1_actual: 'not available' }],
          },
        ],
        true,
        {
          achievementSubmissionRequired: true,
          objectiveLinkedAchievementRequired: true,
        },
        [
          {
            id: objectiveId,
            title: 'Defect reduction',
            targetValue: '10',
            targetDirection: ObjectiveTargetDirection.LOWER_IS_BETTER,
            isScoreable: true,
          },
        ],
        [],
      ),
    ).toThrow('Actual value must be numeric for objective: Defect reduction');
  });

  it('allows submission when numeric actual does not meet the target', () => {
    const service = createService();
    const { section, field } = createAchievementSection();
    const objectiveId = new Types.ObjectId().toString();

    expect(() =>
      service.validateAchievementPayload(
        section,
        field,
        [
          {
            type: 'OBJECTIVE',
            objectiveId,
            subject: 'Revenue growth',
            description: 'Completed account plan.',
          },
        ],
        [
          {
            fieldKey: 'achievement_items',
            sectionKey: 'employee_achievement_submission',
            valueJson: [{ objectiveId, q1_actual: 90 }],
          },
        ],
        true,
        {
          achievementSubmissionRequired: true,
          objectiveLinkedAchievementRequired: true,
        },
        [
          {
            id: objectiveId,
            title: 'Revenue growth',
            targetValue: '100',
            targetDirection: ObjectiveTargetDirection.HIGHER_IS_BETTER,
            isScoreable: true,
          },
        ],
        [],
      ),
    ).not.toThrow();

    expect(
      service.interpretObjectiveTarget(
        {
          targetValue: '100',
          targetDirection: ObjectiveTargetDirection.HIGHER_IS_BETTER,
        },
        90,
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'NOT_MET',
        targetMet: false,
        targetDirectionLabel: 'Higher value is better',
      }),
    );
  });

  it('stores target direction in the achievement objective snapshot', () => {
    const service = createService();

    expect(
      service.buildObjectiveSnapshot({
        title: 'Defect reduction',
        targetValue: '10',
        targetDirection: ObjectiveTargetDirection.LOWER_IS_BETTER,
      }),
    ).toEqual(
      expect.objectContaining({
        targetValue: '10',
        targetDirection: ObjectiveTargetDirection.LOWER_IS_BETTER,
      }),
    );
  });

  it('aggregates actual values by configured mode before target interpretation', () => {
    const service = createService();
    const candidates = [
      { term: AssessmentTermCode.Q1, value: 40, order: 0 },
      { term: AssessmentTermCode.Q2, value: 60, order: 1 },
      { term: AssessmentTermCode.Q3, value: 20, order: 2 },
    ];

    expect(service.aggregateObjectiveActualValues(candidates)).toBe(20);
    expect(service.aggregateObjectiveActualValues(candidates, ObjectiveActualAggregationMode.SUM_OF_TERMS)).toBe(120);
    expect(service.aggregateObjectiveActualValues(candidates, ObjectiveActualAggregationMode.AVERAGE_OF_TERMS)).toBe(40);
    expect(service.aggregateObjectiveActualValues(candidates, ObjectiveActualAggregationMode.MAX_OF_TERMS)).toBe(60);
    expect(service.aggregateObjectiveActualValues(candidates, ObjectiveActualAggregationMode.MIN_OF_TERMS)).toBe(20);
  });

  it('uses aggregated actual value for target status', () => {
    const service = createService();
    const aggregatedActual = service.aggregateObjectiveActualValues(
      [
        { term: AssessmentTermCode.Q1, value: 40, order: 0 },
        { term: AssessmentTermCode.Q2, value: 60, order: 1 },
      ],
      ObjectiveActualAggregationMode.SUM_OF_TERMS,
    );

    expect(
      service.interpretObjectiveTarget(
        {
          targetValue: '100',
          targetDirection: ObjectiveTargetDirection.HIGHER_IS_BETTER,
          actualAggregationMode: ObjectiveActualAggregationMode.SUM_OF_TERMS,
        },
        aggregatedActual,
      ),
    ).toEqual(
      expect.objectContaining({
        actualAggregationMode: ObjectiveActualAggregationMode.SUM_OF_TERMS,
        actualValue: 100,
        status: 'MET',
      }),
    );
  });

  it('accepts direct numeric achievement value fields during target validation', () => {
    const service = createService();
    const { section, field } = createAchievementSection();
    const objectiveId = new Types.ObjectId().toString();

    expect(() =>
      service.validateAchievementPayload(
        section,
        field,
        [
          {
            type: 'OBJECTIVE',
            objectiveId,
            subject: 'Revenue growth',
            description: 'Completed account plan.',
          },
        ],
        [
          {
            fieldKey: 'q1_actual',
            sectionKey: 'employee_achievement_submission',
            valueNumber: 95,
          },
        ],
        true,
        {
          achievementSubmissionRequired: true,
          objectiveLinkedAchievementRequired: true,
        },
        [
          {
            id: objectiveId,
            title: 'Revenue growth',
            targetValue: '100',
            targetDirection: ObjectiveTargetDirection.HIGHER_IS_BETTER,
            actualAggregationMode: ObjectiveActualAggregationMode.LATEST_VALUE,
            isScoreable: true,
          },
        ],
        [
          {
            key: 'q1_actual',
            editable: true,
          },
        ],
      ),
    ).not.toThrow();
  });
});
