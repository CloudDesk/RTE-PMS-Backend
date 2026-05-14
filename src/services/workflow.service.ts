import {
  QuarterWorkflowState,
  WorkflowEntityType,
  isQuarterWorkflowState,
} from '../constants/pms.enums';
import { quarterTransitions } from '../constants/workflow.config';
import type {
  QuarterWorkflowState as QuarterWorkflowStateType,
  WorkflowTransitionInput,
  WorkflowTransitionResult,
  WorkflowValidationResult,
} from '../types/pms.types';

export class WorkflowTransitionError extends Error {
  public readonly errorCode: string;

  constructor(errorCode: string, message: string) {
    super(message);
    this.name = 'WorkflowTransitionError';
    this.errorCode = errorCode;
  }
}

export class WorkflowService {
  getAllowedNextStates(
    currentState: string,
  ): readonly QuarterWorkflowStateType[] {
    if (!isQuarterWorkflowState(currentState)) {
      return [];
    }

    return quarterTransitions[currentState];
  }

  validateTransition(input: WorkflowTransitionInput): WorkflowValidationResult {
    if (input.entityType !== WorkflowEntityType.QUARTER_ASSIGNMENT) {
      return {
        allowed: false,
        errorCode: 'INVALID_ENTITY_TYPE',
        message: 'Workflow transitions are currently supported only for Quarter Assignment records.',
      };
    }

    if (!isQuarterWorkflowState(input.currentState)) {
      return {
        allowed: false,
        errorCode: 'UNKNOWN_CURRENT_STATE',
        message: `Unknown current workflow state: ${input.currentState}`,
      };
    }

    if (!isQuarterWorkflowState(input.nextState)) {
      return {
        allowed: false,
        errorCode: 'UNKNOWN_NEXT_STATE',
        message: `Unknown next workflow state: ${input.nextState}`,
      };
    }

    if (this.requiresReason(input.nextState) && !input.reason?.trim()) {
      return {
        allowed: false,
        errorCode: 'REASON_REQUIRED',
        message: `Reason is required for transition to ${input.nextState}.`,
      };
    }

    const allowedNextStates = this.getAllowedNextStates(input.currentState);
    if (!allowedNextStates.includes(input.nextState)) {
      return {
        allowed: false,
        errorCode: 'INVALID_TRANSITION',
        message: `Transition from ${input.currentState} to ${input.nextState} is not allowed.`,
      };
    }

    return { allowed: true };
  }

  transition(input: WorkflowTransitionInput): WorkflowTransitionResult {
    const validation = this.validateTransition(input);
    if (!validation.allowed) {
      throw new WorkflowTransitionError(
        validation.errorCode ?? 'WORKFLOW_TRANSITION_REJECTED',
        validation.message ?? 'Workflow transition rejected.',
      );
    }

    return {
      entityType: input.entityType,
      entityId: input.entityId,
      previousState: input.currentState as QuarterWorkflowStateType,
      currentState: input.nextState as QuarterWorkflowStateType,
      actorId: input.actorId,
      actorRole: input.actorRole,
      reason: input.reason,
      metadata: input.metadata,
      transitionedAt: new Date(),
    };
  }

  private requiresReason(nextState: QuarterWorkflowStateType): boolean {
    const reasonRequiredStates: readonly QuarterWorkflowStateType[] = [
      QuarterWorkflowState.REOPENED_BY_ADMIN,
      QuarterWorkflowState.CLOSED_BY_ADMIN,
    ];

    return reasonRequiredStates.includes(nextState);
  }
}

export const workflowService = new WorkflowService();

/*
Example usage from another service:

const transition = workflowService.transition({
  entityType: WorkflowEntityType.QUARTER_ASSIGNMENT,
  entityId: quarterAssignment._id.toString(),
  currentState: quarterAssignment.workflowState,
  nextState: QuarterWorkflowState.OBJECTIVE_SUBMITTED,
  actorId: context.user._id.toString(),
  actorRole: context.user.role,
});

quarterAssignment.workflowState = transition.currentState;
await quarterAssignment.save();
*/
