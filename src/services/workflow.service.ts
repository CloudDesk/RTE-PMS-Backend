import {
  AnnualWorkflowState,
  TermWorkflowState,
  WorkflowEntityType,
  isAnnualWorkflowState,
  isTermWorkflowState,
} from '../constants/pms.enums';
import { annualTransitions, termTransitions } from '../constants/workflow.config';
import type {
  AnnualWorkflowState as AnnualWorkflowStateType,
  TermWorkflowState as TermWorkflowStateType,
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
    entityType: WorkflowEntityType = WorkflowEntityType.TERM_ASSIGNMENT,
  ): readonly (TermWorkflowStateType | AnnualWorkflowStateType)[] {
    if (
      entityType === WorkflowEntityType.ANNUAL_CYCLE ||
      entityType === WorkflowEntityType.ANNUAL_ASSIGNMENT
    ) {
      if (!isAnnualWorkflowState(currentState)) {
        return [];
      }

      return annualTransitions[currentState];
    }

    if (!isTermWorkflowState(currentState)) {
      return [];
    }

    return termTransitions[currentState];
  }

  validateTransition(input: WorkflowTransitionInput): WorkflowValidationResult {
    if (
      input.entityType !== WorkflowEntityType.TERM_ASSIGNMENT &&
      input.entityType !== WorkflowEntityType.ANNUAL_CYCLE &&
      input.entityType !== WorkflowEntityType.ANNUAL_ASSIGNMENT
    ) {
      return {
        allowed: false,
        errorCode: 'INVALID_ENTITY_TYPE',
        message: `Unsupported workflow entity type: ${input.entityType}.`,
      };
    }

    if (!this.isKnownWorkflowState(input.currentState, input.entityType)) {
      return {
        allowed: false,
        errorCode: 'UNKNOWN_CURRENT_STATE',
        message: `Unknown current workflow state: ${input.currentState}`,
      };
    }

    if (!this.isKnownWorkflowState(input.nextState, input.entityType)) {
      return {
        allowed: false,
        errorCode: 'UNKNOWN_NEXT_STATE',
        message: `Unknown next workflow state: ${input.nextState}`,
      };
    }

    if (this.requiresReason(input.nextState, input.entityType) && !input.reason?.trim()) {
      return {
        allowed: false,
        errorCode: 'REASON_REQUIRED',
        message: `Reason is required for transition to ${input.nextState}.`,
      };
    }

    const allowedNextStates = this.getAllowedNextStates(input.currentState, input.entityType);
    if (
      !allowedNextStates.includes(
        input.nextState as TermWorkflowStateType | AnnualWorkflowStateType,
      )
    ) {
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
      previousState: input.currentState as TermWorkflowStateType | AnnualWorkflowStateType,
      currentState: input.nextState as TermWorkflowStateType | AnnualWorkflowStateType,
      actorId: input.actorId,
      actorRole: input.actorRole,
      reason: input.reason,
      metadata: input.metadata,
      transitionedAt: new Date(),
    };
  }

  private isKnownWorkflowState(
    state: string,
    entityType: WorkflowEntityType,
  ): boolean {
    if (
      entityType === WorkflowEntityType.ANNUAL_CYCLE ||
      entityType === WorkflowEntityType.ANNUAL_ASSIGNMENT
    ) {
      return isAnnualWorkflowState(state);
    }

    return isTermWorkflowState(state);
  }

  private requiresReason(nextState: string, entityType: WorkflowEntityType): boolean {
    if (
      entityType === WorkflowEntityType.ANNUAL_CYCLE ||
      entityType === WorkflowEntityType.ANNUAL_ASSIGNMENT
    ) {
      const reasonRequiredStates: readonly AnnualWorkflowStateType[] = [
        AnnualWorkflowState.CANCELLED,
        AnnualWorkflowState.APPRAISAL_WINDOW_OPEN, // Reopening annual window requires a reason
      ];

      return isAnnualWorkflowState(nextState) && reasonRequiredStates.includes(nextState);
    }

    const reasonRequiredStates: readonly TermWorkflowStateType[] = [
      TermWorkflowState.REOPENED_BY_ADMIN,
      TermWorkflowState.CLOSED_BY_ADMIN,
    ];

    return isTermWorkflowState(nextState) && reasonRequiredStates.includes(nextState);
  }
}

export const workflowService = new WorkflowService();

/*
Example usage from another service:

const transition = workflowService.transition({
  entityType: WorkflowEntityType.TERM_ASSIGNMENT,
  entityId: termAssignment._id.toString(),
  currentState: termAssignment.termState,
  nextState: TermWorkflowState.OBJECTIVE_SUBMITTED,
  actorId: context.user._id.toString(),
  actorRole: context.user.role,
});

termAssignment.termState = transition.currentState;
await termAssignment.save();
*/
