import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { AnnualWorkflowState, AppraisalOutcomeType, QuarterWorkflowState } from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { Objective } from '../models/pms-objective.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterReview } from '../models/pms-quarter-review.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { visibilityMaskService } from './visibilityMask.service';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IAnnualDecision } from '../models/pms-annual-decision.model';
import type { IObjective } from '../models/pms-objective.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
import type { IQuarterReview } from '../models/pms-quarter-review.model';
import type { AppraisalOutcomeType as AppraisalOutcomeTypeType } from '../constants/pms.enums';

export interface AnnualSummaryResult {
  annualAssignment: IAnnualAssignment;
  quarterAssignments: IQuarterAssignment[];
  objectives: IObjective[];
  quarterReviews: IQuarterReview[];
  annualDecision: Record<string, unknown> | null;
}

export interface SaveDecisionDraftInput {
  isGradeApplied: boolean;
  isMeritApplied: boolean;
  gradeDetails?: Record<string, unknown>;
  meritDetails?: Record<string, unknown>;
  nilReason?: string;
}

export interface UpdateVisibilityInput {
  employeeGradeVisible?: boolean;
  employeeMeritVisible?: boolean;
  managerGradeVisible?: boolean;
  managerMeritVisible?: boolean;
}

export class AnnualDecisionService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async getSummary(annualAssignmentId: string): Promise<AnnualSummaryResult> {
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    this.assertAssignmentAccess('annualAssignment.summary', annualAssignment);

    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId: annualAssignment._id,
    }).sort({ quarter: 1 });

    const quarterAssignmentIds = quarterAssignments.map((quarterAssignment) => quarterAssignment._id);

    const [objectives, quarterReviews, annualDecision] = await Promise.all([
      Objective.find({ quarterAssignmentId: { $in: quarterAssignmentIds } }),
      QuarterReview.find({ quarterAssignmentId: { $in: quarterAssignmentIds } }),
      AnnualDecision.findOne({ annualAssignmentId: annualAssignment._id }),
    ]);

    return {
      annualAssignment,
      quarterAssignments,
      objectives,
      quarterReviews,
      annualDecision: annualDecision
        ? this.maskDecision(annualDecision, annualAssignment)
        : null,
    };
  }

  async saveDecisionDraft(
    annualAssignmentId: string,
    input: SaveDecisionDraftInput,
  ): Promise<IAnnualDecision> {
    this.assertAdmin('annualDecision.draft');
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    const existingDecision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
    });

    if (existingDecision?.frozenAt || existingDecision?.status === AnnualWorkflowState.ANNUAL_FINALIZED) {
      throw new Error('Frozen annual decision cannot be edited');
    }

    const appraisalOutcomeType = this.deriveOutcome(
      input.isGradeApplied,
      input.isMeritApplied,
    );

    const payload = {
      annualAssignmentId: annualAssignment._id,
      isGradeApplied: input.isGradeApplied,
      isMeritApplied: input.isMeritApplied,
      appraisalOutcomeType,
      gradeDetails: input.gradeDetails,
      meritDetails: input.meritDetails,
      nilReason: appraisalOutcomeType === AppraisalOutcomeType.NIL ? input.nilReason : undefined,
      status: AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT,
    };

    const decision = existingDecision
      ? await AnnualDecision.findByIdAndUpdate(existingDecision._id, payload, {
        new: true,
        runValidators: true,
      })
      : await AnnualDecision.create(payload);

    if (!decision) {
      throw new Error('Unable to save annual decision draft');
    }

    annualAssignment.finalDecisionStatus = AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT;
    await annualAssignment.save();

    await this.audit(
      'PMS_ANNUAL_DECISION_DRAFT_SAVED',
      'ANNUAL_DECISION',
      decision._id.toString(),
      existingDecision?.toObject(),
      decision.toObject(),
    );

    return decision;
  }

  async freezeDecision(annualAssignmentId: string): Promise<IAnnualDecision> {
    this.assertAdmin('annualDecision.freeze');
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    await this.assertAllQuartersComplete(annualAssignment._id);

    const decision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
    });

    if (!decision) {
      throw new Error('Annual decision draft must exist before freeze');
    }

    if (decision.frozenAt || decision.status === AnnualWorkflowState.ANNUAL_FINALIZED) {
      throw new Error('Annual decision is already frozen');
    }

    const previousValue = decision.toObject();
    decision.status = AnnualWorkflowState.ANNUAL_FINALIZED;
    decision.frozenAt = new Date();
    decision.frozenBy = this.actorIdObject();
    await decision.save();

    annualAssignment.workflowState = AnnualWorkflowState.ANNUAL_FINALIZED;
    annualAssignment.finalDecisionStatus = AnnualWorkflowState.ANNUAL_FINALIZED;
    await annualAssignment.save();

    await this.audit(
      'PMS_ANNUAL_DECISION_FROZEN',
      'ANNUAL_DECISION',
      decision._id.toString(),
      previousValue,
      decision.toObject(),
    );

    return decision;
  }

  async updateVisibility(
    annualAssignmentId: string,
    input: UpdateVisibilityInput,
  ): Promise<IAnnualAssignment> {
    this.assertAdmin('annualDecision.visibility');
    const annualAssignment = await this.getAnnualAssignment(annualAssignmentId);
    const previousValue = annualAssignment.toObject();

    annualAssignment.employeeGradeVisible = input.employeeGradeVisible ?? annualAssignment.employeeGradeVisible;
    annualAssignment.employeeMeritVisible = input.employeeMeritVisible ?? annualAssignment.employeeMeritVisible;
    annualAssignment.managerGradeVisible = input.managerGradeVisible ?? annualAssignment.managerGradeVisible;
    annualAssignment.managerMeritVisible = input.managerMeritVisible ?? annualAssignment.managerMeritVisible;
    annualAssignment.workflowState = AnnualWorkflowState.VISIBILITY_ENABLED;
    await annualAssignment.save();

    await this.audit(
      'PMS_ANNUAL_VISIBILITY_UPDATED',
      'ANNUAL_ASSIGNMENT',
      annualAssignment._id.toString(),
      previousValue,
      annualAssignment.toObject(),
    );

    return annualAssignment;
  }

  private deriveOutcome(
    isGradeApplied: boolean,
    isMeritApplied: boolean,
  ): AppraisalOutcomeTypeType {
    if (isGradeApplied && isMeritApplied) return AppraisalOutcomeType.BOTH;
    if (isGradeApplied && !isMeritApplied) return AppraisalOutcomeType.GRADE_ONLY;
    if (!isGradeApplied && isMeritApplied) return AppraisalOutcomeType.MERIT_ONLY;
    return AppraisalOutcomeType.NIL;
  }

  private async assertAllQuartersComplete(annualAssignmentId: Types.ObjectId): Promise<void> {
    const quarterAssignments = await QuarterAssignment.find({ annualAssignmentId });
    if (quarterAssignments.length === 0) {
      throw new Error('No quarter assignments found for annual assignment');
    }

    const incompleteQuarter = quarterAssignments.find(
      (quarterAssignment) =>
        quarterAssignment.workflowState !== QuarterWorkflowState.QUARTER_FINALIZED &&
        quarterAssignment.workflowState !== QuarterWorkflowState.CLOSED_BY_ADMIN,
    );

    if (incompleteQuarter) {
      throw new Error('Annual decision can be frozen only after all quarters are finalized or closed');
    }
  }

  private maskDecision(
    decision: IAnnualDecision,
    annualAssignment: IAnnualAssignment,
  ): Record<string, unknown> {
    return visibilityMaskService.maskGradeMeritFields(
      decision.toObject() as Record<string, unknown>,
      {
        actorRole: this.requireActor().actorRole,
        employeeGradeVisible: annualAssignment.employeeGradeVisible,
        employeeMeritVisible: annualAssignment.employeeMeritVisible,
        managerGradeVisible: annualAssignment.managerGradeVisible,
        managerMeritVisible: annualAssignment.managerMeritVisible,
      },
    );
  }

  private assertAssignmentAccess(action: string, annualAssignment: IAnnualAssignment): void {
    const access = accessService.canPerform({
      actor: this.requireActor(),
      action,
      resource: {
        employeeId: annualAssignment.employeeId.toString(),
        managerId: annualAssignment.managerId.toString(),
      },
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private assertAdmin(action: string): void {
    const access = accessService.canPerform({
      actor: this.requireActor(),
      action,
      requiresAdmin: true,
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private async getAnnualAssignment(annualAssignmentId: string): Promise<IAnnualAssignment> {
    if (!Types.ObjectId.isValid(annualAssignmentId)) {
      throw new Error('Invalid annual assignment id');
    }

    const annualAssignment = await AnnualAssignment.findById(annualAssignmentId);
    if (!annualAssignment) {
      throw new Error('Annual assignment not found');
    }

    return annualAssignment;
  }

  private requireActor() {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    return {
      actorId: user._id.toString(),
      actorRole: user.role,
    };
  }

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
    reason?: string,
  ): Promise<void> {
    const actor = this.requireActor();

    await auditService.createAuditLog({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action,
      entityType,
      entityId,
      previousValue,
      newValue,
      reason,
    });
  }
}
