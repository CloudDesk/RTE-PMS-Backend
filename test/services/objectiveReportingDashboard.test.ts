import { Types } from 'mongoose';
import {
  ObjectiveApplicabilityStatus,
  ObjectiveStatus,
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
