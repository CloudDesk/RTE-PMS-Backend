import { Types } from 'mongoose';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
import { WorkflowEntityType } from '../constants/pms.enums';
import { auditService } from './audit.service';
import { workflowService } from './workflow.service';
import type { QuarterWorkflowState } from '../types/pms.types';
import type { WorkflowActorContext } from '../types/pms.types';

export async function transitionQuarterAssignmentState(
  quarterAssignmentId: string,
  nextState: QuarterWorkflowState,
  actorContext: WorkflowActorContext,
  reason?: string,
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
  });

  quarterAssignment.previousQuarterState = transition.previousState;
  quarterAssignment.quarterState = transition.currentState;
  quarterAssignment.lastTransitionAt = transition.transitionedAt;
  quarterAssignment.lastTransitionBy = new Types.ObjectId(actorContext.actorId);
  quarterAssignment.lastTransitionRole = actorContext.actorRole;
  quarterAssignment.lastTransitionReason = reason;

  const updatedQuarterAssignment = await quarterAssignment.save();

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

  return updatedQuarterAssignment;
}
