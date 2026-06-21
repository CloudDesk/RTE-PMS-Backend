import { Types } from 'mongoose';
import {
  AnnualDecisionStatus,
  AnnualWorkflowState,
  isTermFinalized,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { auditService } from './audit.service';
import type { WorkflowActorContext } from '../types/pms.types';

export interface AnnualTermRollupResult {
  allTermsFinalized: boolean;
  rolledUp: boolean;
  completedTerms: number;
  totalTerms: number;
}

const ROLLUP_ELIGIBLE_ANNUAL_STATES = new Set<string>([
  AnnualWorkflowState.DRAFT,
  AnnualWorkflowState.SCHEDULED,
  AnnualWorkflowState.ACTIVE,
  AnnualWorkflowState.IN_PROGRESS,
]);

function actorObjectId(actorId: string) {
  return Types.ObjectId.isValid(actorId) ? new Types.ObjectId(actorId) : undefined;
}

export async function rollupAnnualAssignmentIfAllTermsFinalized(
  annualAssignmentId: Types.ObjectId | string,
  actorContext: WorkflowActorContext,
  reason = 'All applicable assessment terms are finalized.',
): Promise<AnnualTermRollupResult> {
  const annualAssignment = await AnnualAssignment.findOne({
    _id: annualAssignmentId,
    isDeleted: false,
  });

  if (!annualAssignment) {
    return {
      allTermsFinalized: false,
      rolledUp: false,
      completedTerms: 0,
      totalTerms: 0,
    };
  }

  const applicableTerms = annualAssignment.applicableTerms ?? [];
  if (applicableTerms.length === 0) {
    return {
      allTermsFinalized: false,
      rolledUp: false,
      completedTerms: 0,
      totalTerms: 0,
    };
  }

  const termAssignments = await TermAssignment.find({
    annualAssignmentId: annualAssignment._id,
    assessmentTermCode: { $in: applicableTerms },
    isDeleted: false,
  }).select('assessmentTermCode termState');

  const termByCode = new Map(
    termAssignments.map((assignment) => [assignment.assessmentTermCode, assignment]),
  );

  const completedTerms = applicableTerms.filter((termCode) => {
    const termAssignment = termByCode.get(termCode);
    return termAssignment ? isTermFinalized(termAssignment.termState) : false;
  }).length;

  const allTermsFinalized = completedTerms === applicableTerms.length;
  if (!allTermsFinalized) {
    return {
      allTermsFinalized: false,
      rolledUp: false,
      completedTerms,
      totalTerms: applicableTerms.length,
    };
  }

  if (annualAssignment.annualState === AnnualWorkflowState.ALL_TERMS_FINALIZED) {
    return {
      allTermsFinalized: true,
      rolledUp: false,
      completedTerms,
      totalTerms: applicableTerms.length,
    };
  }

  if (!ROLLUP_ELIGIBLE_ANNUAL_STATES.has(annualAssignment.annualState)) {
    return {
      allTermsFinalized: true,
      rolledUp: false,
      completedTerms,
      totalTerms: applicableTerms.length,
    };
  }

  const previousValue = annualAssignment.toObject();
  annualAssignment.annualState = AnnualWorkflowState.ALL_TERMS_FINALIZED;
  if (
    !annualAssignment.finalDecisionStatus ||
    annualAssignment.finalDecisionStatus === AnnualDecisionStatus.DRAFT
  ) {
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.DRAFT;
  }
  const updatedBy = actorObjectId(actorContext.actorId);
  if (updatedBy) {
    annualAssignment.updatedBy = updatedBy;
  }
  annualAssignment.version += 1;
  await annualAssignment.save();

  await auditService.createAuditLog({
    actorId: actorContext.actorId,
    actorRole: actorContext.actorRole,
    action: 'PMS_ANNUAL_ASSIGNMENT_ALL_TERMS_FINALIZED',
    entityType: 'ANNUAL_ASSIGNMENT',
    entityId: annualAssignment._id.toString(),
    previousValue,
    newValue: {
      annualState: annualAssignment.annualState,
      finalDecisionStatus: annualAssignment.finalDecisionStatus,
      completedTerms,
      totalTerms: applicableTerms.length,
    },
    reason,
    assignmentId: annualAssignment._id.toString(),
  });

  return {
    allTermsFinalized: true,
    rolledUp: true,
    completedTerms,
    totalTerms: applicableTerms.length,
  };
}
