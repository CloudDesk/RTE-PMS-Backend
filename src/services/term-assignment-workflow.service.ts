import { Types } from 'mongoose';
import { TermAssignment } from '../models/pms-term-assignment.model';
import type { ITermAssignment } from '../models/pms-term-assignment.model';
import { WorkflowEvent } from '../models/pms-workflow-event.model';
import {
  TermWorkflowState as TermWorkflowStateEnum,
  WorkflowEntityType,
} from '../constants/pms.enums';
import { auditService } from './audit.service';
import { rollupAnnualAssignmentIfAllTermsFinalized } from './annual-term-rollup.service';
import { workflowService } from './workflow.service';
import type { TermWorkflowState } from '../types/pms.types';
import type { WorkflowActorContext } from '../types/pms.types';

export async function transitionTermAssignmentState(
  termAssignmentId: string,
  nextState: TermWorkflowState,
  actorContext: WorkflowActorContext,
  reason?: string,
  action?: string,
  metadata?: Record<string, unknown>,
): Promise<ITermAssignment> {
  const termAssignment = await TermAssignment.findById(termAssignmentId);

  if (!termAssignment) {
    throw new Error(`Term Assignment not found: ${termAssignmentId}`);
  }

  const transition = workflowService.transition({
    entityType: WorkflowEntityType.TERM_ASSIGNMENT,
    entityId: termAssignment._id.toString(),
    currentState: termAssignment.termState,
    nextState,
    actorId: actorContext.actorId,
    actorRole: actorContext.actorRole,
    reason,
    metadata,
  });

  termAssignment.previousTermState = transition.previousState as TermWorkflowState;
  termAssignment.termState = transition.currentState as TermWorkflowState;
  termAssignment.lastTransitionAt = transition.transitionedAt;
  termAssignment.lastTransitionBy = new Types.ObjectId(actorContext.actorId);
  termAssignment.lastTransitionRole = actorContext.actorRole;
  termAssignment.lastTransitionReason = reason;

  const updatedTermAssignment = await termAssignment.save();

  await WorkflowEvent.create({
    entityType: WorkflowEntityType.TERM_ASSIGNMENT,
    entityId: termAssignment._id,
    annualAssignmentId: termAssignment.annualAssignmentId,
    termAssignmentId: termAssignment._id,
    cycleId: termAssignment.cycleId,
    fromState: transition.previousState,
    toState: transition.currentState,
    action: action || `TRANSITION_${transition.previousState}_TO_${transition.currentState}`,
    actorUserId: Types.ObjectId.isValid(actorContext.actorId)
      ? new Types.ObjectId(actorContext.actorId)
      : actorContext.actorId,
    actorRole: actorContext.actorRole,
    reason,
    metadata: transition.metadata ?? {},
    createdBy: Types.ObjectId.isValid(actorContext.actorId)
      ? new Types.ObjectId(actorContext.actorId)
      : actorContext.actorId,
    createdAt: transition.transitionedAt,
  });

  await auditService.createAuditLog({
    actorId: actorContext.actorId,
    actorRole: actorContext.actorRole,
    action: 'TERM_ASSIGNMENT_STATE_TRANSITIONED',
    entityType: WorkflowEntityType.TERM_ASSIGNMENT,
    entityId: termAssignment._id.toString(),
    previousValue: { termState: transition.previousState },
    newValue: { termState: transition.currentState },
    reason,
  });

  if (updatedTermAssignment.termState === TermWorkflowStateEnum.TERM_FINALIZED) {
    await rollupAnnualAssignmentIfAllTermsFinalized(
      updatedTermAssignment.annualAssignmentId,
      actorContext,
      reason || 'Term finalized; checking annual assignment completion.',
    );
  }

  return updatedTermAssignment;
}
