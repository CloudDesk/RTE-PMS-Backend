import { Types } from 'mongoose';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
import { WorkflowEvent } from '../models/pms-workflow-event.model';
import {
  QuarterWorkflowState as QuarterWorkflowStateEnum,
  WorkflowEntityType,
} from '../constants/pms.enums';
import { auditService } from './audit.service';
import { rollupAnnualAssignmentIfAllTermsFinalized } from './annual-term-rollup.service';
import { workflowService } from './workflow.service';
import type { QuarterWorkflowState } from '../types/pms.types';
import type { WorkflowActorContext } from '../types/pms.types';

export async function transitionQuarterAssignmentState(
  quarterAssignmentId: string,
  nextState: QuarterWorkflowState,
  actorContext: WorkflowActorContext,
  reason?: string,
  action?: string,
  metadata?: Record<string, unknown>,
): Promise<IQuarterAssignment> {
  const quarterAssignment = await QuarterAssignment.findById(quarterAssignmentId);

  if (!quarterAssignment) {
    throw new Error(`Quarter Assignment not found: ${quarterAssignmentId}`);
  }

  const transition = workflowService.transition({
    entityType: WorkflowEntityType.QUARTER_ASSIGNMENT,
    entityId: quarterAssignment._id.toString(),
    currentState: quarterAssignment.quarterState,
    nextState,
    actorId: actorContext.actorId,
    actorRole: actorContext.actorRole,
    reason,
    metadata,
  });

  quarterAssignment.previousQuarterState = transition.previousState as QuarterWorkflowState;
  quarterAssignment.quarterState = transition.currentState as QuarterWorkflowState;
  quarterAssignment.lastTransitionAt = transition.transitionedAt;
  quarterAssignment.lastTransitionBy = new Types.ObjectId(actorContext.actorId);
  quarterAssignment.lastTransitionRole = actorContext.actorRole;
  quarterAssignment.lastTransitionReason = reason;

  const updatedQuarterAssignment = await quarterAssignment.save();

  await WorkflowEvent.create({
    entityType: WorkflowEntityType.QUARTER_ASSIGNMENT,
    entityId: quarterAssignment._id,
    annualAssignmentId: quarterAssignment.annualAssignmentId,
    quarterAssignmentId: quarterAssignment._id,
    cycleId: quarterAssignment.cycleId,
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
    action: 'QUARTER_ASSIGNMENT_STATE_TRANSITIONED',
    entityType: WorkflowEntityType.QUARTER_ASSIGNMENT,
    entityId: quarterAssignment._id.toString(),
    previousValue: { quarterState: transition.previousState },
    newValue: { quarterState: transition.currentState },
    reason,
  });

  if (updatedQuarterAssignment.quarterState === QuarterWorkflowStateEnum.TERM_FINALIZED) {
    await rollupAnnualAssignmentIfAllTermsFinalized(
      updatedQuarterAssignment.annualAssignmentId,
      actorContext,
      reason || 'Term finalized; checking annual assignment completion.',
    );
  }

  return updatedQuarterAssignment;
}
