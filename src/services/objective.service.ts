import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { ObjectiveSource, QuarterWorkflowState } from '../constants/pms.enums';
import { Objective } from '../models/pms-objective.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { transitionQuarterAssignmentState } from './quarter-assignment-workflow.service';
import type { IObjective } from '../models/pms-objective.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
import type { ObjectiveSource as ObjectiveSourceType } from '../constants/pms.enums';

interface ObjectiveAttachmentInput {
  fileName?: string;
  fileUrl?: string;
  documentId?: string;
  uploadedBy?: string;
  uploadedAt?: Date | string;
}

export interface CreateObjectiveInput {
  quarterAssignmentId: string;
  title: string;
  description?: string;
  targetMetric?: string;
  targetDate?: Date | string;
  weightage?: number;
  successCriteria?: string;
  attachments?: ObjectiveAttachmentInput[];
}

export interface ReturnObjectiveInput {
  reason: string;
}

export class ObjectiveService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async createObjective(input: CreateObjectiveInput): Promise<IObjective> {
    const actor = this.requireActor();
    const quarterAssignment = await this.getQuarterAssignment(input.quarterAssignmentId);
    const source = this.resolveObjectiveSource(actor.actorRole);

    this.assertAssignmentAccess('objective.create', quarterAssignment);

    if (source === ObjectiveSource.EMPLOYEE_CREATED) {
      await this.ensureQuarterState(
        quarterAssignment._id.toString(),
        quarterAssignment.workflowState,
        QuarterWorkflowState.OBJECTIVE_DRAFT,
      );
    } else {
      await this.ensureQuarterState(
        quarterAssignment._id.toString(),
        quarterAssignment.workflowState,
        QuarterWorkflowState.OBJECTIVE_APPROVED,
      );
      await this.openManagerReview(quarterAssignment._id.toString());
    }

    const objective = await Objective.create({
      quarterAssignmentId: quarterAssignment._id,
      employeeId: quarterAssignment.employeeId,
      managerId: quarterAssignment.managerId,
      source,
      title: input.title,
      description: input.description,
      targetMetric: input.targetMetric,
      targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      weightage: input.weightage,
      successCriteria: input.successCriteria,
      workflowState: source === ObjectiveSource.MANAGER_CREATED
        ? QuarterWorkflowState.OBJECTIVE_APPROVED
        : QuarterWorkflowState.OBJECTIVE_DRAFT,
      attachments: this.normalizeAttachments(input.attachments ?? []),
      createdBy: this.toObjectId(actor.actorId, 'actorId'),
      approvedAt: source === ObjectiveSource.MANAGER_CREATED ? new Date() : undefined,
    });

    await this.audit(
      source === ObjectiveSource.MANAGER_CREATED
        ? 'PMS_MANAGER_OBJECTIVE_CREATED_AND_APPROVED'
        : 'PMS_EMPLOYEE_OBJECTIVE_CREATED',
      'OBJECTIVE',
      objective._id.toString(),
      undefined,
      objective.toObject(),
    );

    return objective;
  }

  async submitObjective(objectiveId: string): Promise<IObjective> {
    const objective = await this.getObjective(objectiveId);
    this.assertObjectiveAccess('objective.submit', objective, true);

    if (objective.source === ObjectiveSource.MANAGER_CREATED) {
      throw new Error('Employee cannot submit manager-created objective');
    }

    if (
      objective.workflowState !== QuarterWorkflowState.OBJECTIVE_DRAFT &&
      objective.workflowState !== QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED
    ) {
      throw new Error('Only draft or revision-required objectives can be submitted');
    }

    await transitionQuarterAssignmentState(
      objective.quarterAssignmentId.toString(),
      QuarterWorkflowState.OBJECTIVE_SUBMITTED,
      this.requireActor(),
    );

    const previousState = objective.workflowState;
    objective.workflowState = QuarterWorkflowState.OBJECTIVE_SUBMITTED;
    objective.submittedAt = new Date();
    objective.returnedReason = undefined;
    await objective.save();

    await this.audit(
      'PMS_OBJECTIVE_SUBMITTED',
      'OBJECTIVE',
      objective._id.toString(),
      { workflowState: previousState },
      { workflowState: objective.workflowState },
    );

    return objective;
  }

  async approveObjective(objectiveId: string): Promise<IObjective> {
    const objective = await this.getObjective(objectiveId);
    this.assertObjectiveAccess('objective.approve', objective, false);

    if (objective.workflowState !== QuarterWorkflowState.OBJECTIVE_SUBMITTED) {
      throw new Error('Only submitted objectives can be approved');
    }

    await transitionQuarterAssignmentState(
      objective.quarterAssignmentId.toString(),
      QuarterWorkflowState.OBJECTIVE_APPROVED,
      this.requireActor(),
    );
    await this.openManagerReview(objective.quarterAssignmentId.toString());

    const previousState = objective.workflowState;
    objective.workflowState = QuarterWorkflowState.OBJECTIVE_APPROVED;
    objective.approvedAt = new Date();
    await objective.save();

    await this.audit(
      'PMS_OBJECTIVE_APPROVED',
      'OBJECTIVE',
      objective._id.toString(),
      { workflowState: previousState },
      { workflowState: objective.workflowState },
    );

    return objective;
  }

  async returnObjective(objectiveId: string, input: ReturnObjectiveInput): Promise<IObjective> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Return reason is required');
    }

    const objective = await this.getObjective(objectiveId);
    this.assertObjectiveAccess('objective.return', objective, false);

    if (objective.workflowState !== QuarterWorkflowState.OBJECTIVE_SUBMITTED) {
      throw new Error('Only submitted objectives can be returned for revision');
    }

    await transitionQuarterAssignmentState(
      objective.quarterAssignmentId.toString(),
      QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED,
      this.requireActor(),
      reason,
    );

    const previousState = objective.workflowState;
    objective.workflowState = QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED;
    objective.returnedReason = reason;
    await objective.save();

    await this.audit(
      'PMS_OBJECTIVE_RETURNED_FOR_REVISION',
      'OBJECTIVE',
      objective._id.toString(),
      { workflowState: previousState },
      { workflowState: objective.workflowState, returnedReason: reason },
      reason,
    );

    return objective;
  }

  private async ensureQuarterState(
    quarterAssignmentId: string,
    currentState: QuarterWorkflowState,
    targetState: QuarterWorkflowState,
  ): Promise<void> {
    if (currentState === targetState) return;

    if (currentState === QuarterWorkflowState.NOT_STARTED) {
      await transitionQuarterAssignmentState(
        quarterAssignmentId,
        QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
        this.requireActor(),
      );
    }

    const refreshedQuarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    if (refreshedQuarterAssignment.workflowState === targetState) return;

    await transitionQuarterAssignmentState(
      quarterAssignmentId,
      targetState,
      this.requireActor(),
    );
  }

  private async openManagerReview(quarterAssignmentId: string): Promise<void> {
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    if (quarterAssignment.workflowState !== QuarterWorkflowState.OBJECTIVE_APPROVED) {
      return;
    }

    await transitionQuarterAssignmentState(
      quarterAssignmentId,
      QuarterWorkflowState.MANAGER_REVIEW_OPEN,
      this.requireActor(),
    );
  }

  private resolveObjectiveSource(actorRole: string): ObjectiveSourceType {
    const mappedRole = accessService.mapRole(actorRole);

    if (mappedRole === 'Employee') return ObjectiveSource.EMPLOYEE_CREATED;
    if (mappedRole === 'Manager') return ObjectiveSource.MANAGER_CREATED;

    throw new Error('Only employee or manager can create objectives');
  }

  private assertAssignmentAccess(action: string, quarterAssignment: IQuarterAssignment): void {
    const actor = this.requireActor();
    const access = accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: quarterAssignment.employeeId.toString(),
        managerId: quarterAssignment.managerId.toString(),
      },
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private assertObjectiveAccess(
    action: string,
    objective: IObjective,
    employeeOnly: boolean,
  ): void {
    const actor = this.requireActor();

    if (employeeOnly && actor.actorId !== objective.employeeId.toString()) {
      throw new Error('Employee can submit only own objective');
    }

    const access = accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: objective.employeeId.toString(),
        managerId: objective.managerId.toString(),
      },
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private async getObjective(objectiveId: string): Promise<IObjective> {
    if (!Types.ObjectId.isValid(objectiveId)) {
      throw new Error('Invalid objective id');
    }

    const objective = await Objective.findById(objectiveId);
    if (!objective) {
      throw new Error('Objective not found');
    }

    return objective;
  }

  private async getQuarterAssignment(quarterAssignmentId: string): Promise<IQuarterAssignment> {
    if (!Types.ObjectId.isValid(quarterAssignmentId)) {
      throw new Error('Invalid quarterAssignmentId');
    }

    const quarterAssignment = await QuarterAssignment.findById(quarterAssignmentId);
    if (!quarterAssignment) {
      throw new Error('Quarter assignment not found');
    }

    return quarterAssignment;
  }

  private normalizeAttachments(attachments: ObjectiveAttachmentInput[]) {
    return attachments.map((attachment) => ({
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      documentId: attachment.documentId,
      uploadedBy: attachment.uploadedBy && Types.ObjectId.isValid(attachment.uploadedBy)
        ? new Types.ObjectId(attachment.uploadedBy)
        : undefined,
      uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : undefined,
    }));
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

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Invalid ${fieldName}`);
    }

    return new Types.ObjectId(value);
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
