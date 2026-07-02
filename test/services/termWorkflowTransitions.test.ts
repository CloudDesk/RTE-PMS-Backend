import { TermWorkflowState, WorkflowEntityType } from '../../src/constants/pms.enums';
import { workflowService, WorkflowTransitionError } from '../../src/services/workflow.service';

describe('Term workflow transitions', () => {
  it('allows cycle cancellation to close a not-started term assignment', () => {
    const result = workflowService.transition({
      entityType: WorkflowEntityType.TERM_ASSIGNMENT,
      entityId: 'term-assignment-id',
      currentState: TermWorkflowState.NOT_STARTED,
      nextState: TermWorkflowState.CLOSED_BY_ADMIN,
      actorId: 'admin-id',
      actorRole: 'ADMIN',
      reason: 'Cycle cancelled: created by mistake',
      metadata: {
        source: 'CYCLE_CANCELLATION',
      },
    });

    expect(result.previousState).toBe(TermWorkflowState.NOT_STARTED);
    expect(result.currentState).toBe(TermWorkflowState.CLOSED_BY_ADMIN);
  });

  it('still requires a reason when closing a not-started term assignment', () => {
    expect(() =>
      workflowService.transition({
        entityType: WorkflowEntityType.TERM_ASSIGNMENT,
        entityId: 'term-assignment-id',
        currentState: TermWorkflowState.NOT_STARTED,
        nextState: TermWorkflowState.CLOSED_BY_ADMIN,
        actorId: 'admin-id',
        actorRole: 'ADMIN',
      }),
    ).toThrow(WorkflowTransitionError);
  });
});
