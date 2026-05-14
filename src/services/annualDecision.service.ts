import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualDecisionStatus,
  AnnualWorkflowState,
  AppraisalOutcomeType,
  QuarterWorkflowState,
} from '../constants/pms.enums';
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
      quarterCode: { $in: annualAssignment.applicableQuarters },
    }).sort({ quarterCode: 1 });

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

    if (existingDecision?.frozenAt || existingDecision?.decisionStatus === AnnualDecisionStatus.FROZEN) {
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
      decisionStatus: AnnualDecisionStatus.DRAFT,
      updatedBy: this.actorIdObject(),
      createdBy: existingDecision ? existingDecision.createdBy : this.actorIdObject(),
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

    annualAssignment.annualState = AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.DRAFT;
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

    if (decision.frozenAt || decision.decisionStatus === AnnualDecisionStatus.FROZEN) {
      throw new Error('Annual decision is already frozen');
    }

    const previousValue = decision.toObject();
    decision.decisionStatus = AnnualDecisionStatus.FROZEN;
    decision.frozenAt = new Date();
    decision.frozenBy = this.actorIdObject();
    decision.updatedBy = this.actorIdObject();
    await decision.save();

    annualAssignment.annualState = AnnualWorkflowState.ANNUAL_FINALIZED;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.FROZEN;
    annualAssignment.isGradeApplied = decision.isGradeApplied;
    annualAssignment.isMeritApplied = decision.isMeritApplied;
    annualAssignment.appraisalOutcomeType = decision.appraisalOutcomeType;
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

    annualAssignment.visibility.employeeGradeVisible =
      input.employeeGradeVisible ?? annualAssignment.visibility.employeeGradeVisible;
    annualAssignment.visibility.employeeMeritVisible =
      input.employeeMeritVisible ?? annualAssignment.visibility.employeeMeritVisible;
    annualAssignment.visibility.managerGradeVisible =
      input.managerGradeVisible ?? annualAssignment.visibility.managerGradeVisible;
    annualAssignment.visibility.managerMeritVisible =
      input.managerMeritVisible ?? annualAssignment.visibility.managerMeritVisible;
    annualAssignment.annualState = AnnualWorkflowState.VISIBILITY_ENABLED;
    annualAssignment.finalDecisionStatus = AnnualDecisionStatus.VISIBILITY_ENABLED;
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
    const annualAssignment = await AnnualAssignment.findById(annualAssignmentId);
    if (!annualAssignment) {
      throw new Error('Annual assignment not found');
    }

    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId,
      quarterCode: { $in: annualAssignment.applicableQuarters },
    });
    if (quarterAssignments.length === 0) {
      throw new Error('No quarter assignments found for annual assignment');
    }

    const incompleteQuarter = quarterAssignments.find(
      (quarterAssignment) =>
        quarterAssignment.quarterState !== QuarterWorkflowState.QUARTER_FINALIZED &&
        quarterAssignment.quarterState !== QuarterWorkflowState.CLOSED_BY_ADMIN,
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
        employeeGradeVisible: annualAssignment.visibility.employeeGradeVisible,
        employeeMeritVisible: annualAssignment.visibility.employeeMeritVisible,
        managerGradeVisible: annualAssignment.visibility.managerGradeVisible,
        managerMeritVisible: annualAssignment.visibility.managerMeritVisible,
      },
    );
  }

  private assertAssignmentAccess(action: string, annualAssignment: IAnnualAssignment): void {
    const access = accessService.canPerform({
      actor: this.requireActor(),
      action,
      resource: {
        employeeId: annualAssignment.employeeId.toString(),
        managerId: annualAssignment.assignedManagerId.toString(),
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
