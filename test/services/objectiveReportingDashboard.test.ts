import { Types } from 'mongoose';
import {
  ObjectiveApplicabilityStatus,
  ObjectiveScoringMode,
  ObjectiveStatus,
  ObjectiveTargetDirection,
  TermWorkflowState,
} from '../../src/constants/pms.enums';
import { ObjectiveService } from '../../src/services/objective.service';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - Reporting and dashboard readiness helpers', () => {
  let service: any;

  beforeEach(() => {
    const context: RequestContext = {
      requestId: 'objective-reporting-dashboard-test',
      reqRole: 'admin',
      user: {
        _id: new Types.ObjectId(),
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        departmentId: 'Engineering',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    };
    service = new ObjectiveService(context) as any;
  });

  it('maps workflow and applicability states to dashboard statuses', () => {
    expect(service.resolveObjectiveDashboardStatus(
      ObjectiveStatus.OBJECTIVE_DRAFT,
      ObjectiveApplicabilityStatus.ACTIVE,
      TermWorkflowState.NOT_STARTED,
    ).dashboardStatus).toBe('not_started');

    expect(service.resolveObjectiveDashboardStatus(
      ObjectiveStatus.OBJECTIVE_SUBMITTED,
      ObjectiveApplicabilityStatus.ACTIVE,
      TermWorkflowState.OBJECTIVE_SUBMITTED,
    ).dashboardStatus).toBe('submitted');

    expect(service.resolveObjectiveDashboardStatus(
      ObjectiveStatus.OBJECTIVE_APPROVED,
      ObjectiveApplicabilityStatus.ACTIVE,
      TermWorkflowState.TERM_FINALIZED,
    ).dashboardStatus).toBe('finalized');

    expect(service.resolveObjectiveDashboardStatus(
      ObjectiveStatus.OBJECTIVE_APPROVED,
      ObjectiveApplicabilityStatus.NOT_APPLICABLE,
      TermWorkflowState.OBJECTIVE_APPROVED,
    ).dashboardStatus).toBe('closed_not_applicable');

    expect(service.resolveObjectiveDashboardStatus(
      ObjectiveStatus.OBJECTIVE_APPROVED,
      ObjectiveApplicabilityStatus.ACTIVE,
      TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
    ).dashboardStatus).toBe('pending_achievement');

    expect(service.resolveObjectiveDashboardStatus(
      ObjectiveStatus.OBJECTIVE_APPROVED,
      ObjectiveApplicabilityStatus.ACTIVE,
      TermWorkflowState.MANAGER_REVIEW_OPEN,
    ).dashboardStatus).toBe('pending_manager_review');

    expect(service.resolveObjectiveDashboardStatus(
      ObjectiveStatus.OBJECTIVE_APPROVED,
      ObjectiveApplicabilityStatus.ACTIVE,
      TermWorkflowState.MANAGER_REVIEW_OPEN,
      undefined,
      true,
    ).dashboardStatus).toBe('overdue');
  });

  it('blocks dashboard status when scoreable objective has invalid scoring setup', () => {
    const dashboard = service.resolveObjectiveDashboardStatus(
      ObjectiveStatus.OBJECTIVE_APPROVED,
      ObjectiveApplicabilityStatus.ACTIVE,
      TermWorkflowState.MANAGER_REVIEW_OPEN,
      {
        scoreable: true,
        approvedWeightage: undefined,
        targetDirection: ObjectiveTargetDirection.HIGHER_IS_BETTER,
        targetValue: '100',
      },
    );

    expect(dashboard.dashboardStatus).toBe('blocked');
    expect(dashboard.blockedReason).toContain('approved weightage');
  });

  it('extracts objective scoring details from calculated review snapshot', () => {
    const objectiveId = new Types.ObjectId().toString();
    const snapshot = service.resolveReportingScoreSnapshot(
      objectiveId,
      {
        scoreSnapshot: {
          sections: [
            {
              objectiveScoringMode: ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE,
              objectiveSectionScore: 72,
              objectiveSectionContribution: 28.8,
              objectives: [
                {
                  objectiveId,
                  managerScore: 80,
                  contribution: 48,
                },
              ],
            },
          ],
        },
      },
    );

    expect(snapshot).toEqual(
      expect.objectContaining({
        managerScore: 80,
        calculatedWeightedScore: 48,
        objectiveSectionScore: 72,
        objectiveSectionContribution: 28.8,
        objectiveScoringMode: ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE,
      }),
    );
  });

  it('extracts actual value from nested achievement value rows', () => {
    const objectiveId = new Types.ObjectId().toString();
    const actualValue = service.resolveReportingActualValue(
      objectiveId,
      {
        achievementItems: [],
        achievementValues: [
          {
            fieldKey: 'objective_actuals',
            valueJson: [
              {
                objectiveId,
                actual: 95,
              },
            ],
          },
        ],
      },
    );

    expect(actualValue).toBe(95);
  });

  it('reports assignment level from rule, flexible source, template, or direct objective fields', () => {
    expect(service.resolveObjectiveAssignmentLevel({
      assignmentRuleRefs: [new Types.ObjectId()],
    })).toBe('ASSIGNMENT_RULE');

    expect(service.resolveObjectiveAssignmentLevel({
      sourceType: 'DEPARTMENT_OBJECTIVE',
    })).toBe('DEPARTMENT_OBJECTIVE');

    expect(service.resolveObjectiveAssignmentLevel({
      templateObjectiveKey: 'quality',
    })).toBe('TEMPLATE');

    expect(service.resolveObjectiveAssignmentLevel({})).toBe('DIRECT');
  });
});
