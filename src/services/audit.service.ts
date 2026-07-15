import mongoose, { Types } from 'mongoose';
import { AuditLog } from '../models/audit-log.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { Objective } from '../models/pms-objective.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermReview } from '../models/pms-term-review.model';
import { VisibilityConfiguration } from '../models/pms-visibility-configuration.model';
import { User } from '../models/user.model';
import type { IAuditLog } from '../models/audit-log.model';
import type { CreateAuditLogInput } from '../types/pms.types';
import { SYSTEM_WORKFLOW_SYNC_ACTOR } from '../constants/system-actors';

export interface AuditHistoryEntry {
  _id: string;
  entityType: string;
  entityId: unknown;
  action: string;
  actorId?: unknown;
  actorRole?: string;
  actorName?: string;
  actorEmail?: string;
  actorEmployeeCode?: string;
  actorDepartment?: string;
  actorDepartmentId?: string;
  previousValue?: unknown;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  assignmentId?: unknown;
  correlationId?: string;
  timestamp: Date;
  createdAt: Date;
}

export class AuditService {
  async createAuditLog(input: CreateAuditLogInput, session?: mongoose.ClientSession): Promise<IAuditLog> {
    const sensitiveActions = [
      'PMS_CYCLE_CANCELLED',
      'PMS_CYCLE_CLOSED',
      'PMS_CYCLE_REOPENED',
      'PMS_ANNUAL_DECISION_REOPENED',
      'PMS_ANNUAL_ASSIGNMENT_REOPENED',
      'PMS_ASSIGNMENT_REOPENED',
      'PMS_ASSIGNMENT_CLOSED',
      'PMS_OBJECTIVE_RETURNED_FOR_REVISION',
      'PMS_OBJECTIVE_CORRECTED',
      'PMS_CORRECTION_APPLIED',
      'PMS_REASSIGNMENT',
    ];

    const isSensitive = sensitiveActions.includes(input.action) ||
      input.action.includes('REOPEN') ||
      input.action.includes('CANCEL') ||
      input.action.includes('CORRECT') ||
      input.action.includes('CLOSE') ||
      input.action.includes('OVERRIDE') ||
      input.action.includes('VISIBILITY');

    if (isSensitive && !input.reason?.trim()) {
      throw new Error(`Reason is strictly mandatory for sensitive audit action: ${input.action}`);
    }

    const createdAt = new Date();

    const [auditLog] = await AuditLog.create([
      {
        actorId: this.toObjectIdIfValid(input.actorId),
        userId: this.toObjectIdIfValid(input.actorId),
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: this.toObjectIdIfValid(input.entityId),
        previousValue: input.previousValue,
        oldValue: input.previousValue,
        newValue: input.newValue,
        reason: input.reason,
        metadata: input.metadata,
        assignmentId: input.assignmentId ? this.toObjectIdIfValid(input.assignmentId) : undefined,
        correlationId: input.correlationId,
        timestamp: createdAt,
        createdAt,
      },
    ], { session });

    return auditLog;
  }

  async getHistory(assignmentId: string): Promise<AuditHistoryEntry[]> {
    const assignmentObjectId = this.toObjectIdIfValid(assignmentId);
    const [
      termAssignments,
      termReviews,
      objectives,
      annualDecision,
      visibilityConfiguration,
    ] = await Promise.all([
      TermAssignment.find({
        annualAssignmentId: assignmentObjectId,
        isDeleted: false,
      })
        .select('_id')
        .lean(),
      TermReview.find({
        annualAssignmentId: assignmentObjectId,
        isDeleted: false,
      })
        .select('_id termAssignmentId')
        .lean(),
      Objective.find({
        annualAssignmentId: assignmentObjectId,
        isDeleted: false,
      })
        .select('_id')
        .lean(),
      AnnualDecision.findOne({
        annualAssignmentId: assignmentObjectId,
        isDeleted: false,
      })
        .select('_id')
        .lean(),
      VisibilityConfiguration.findOne({
        annualAssignmentId: assignmentObjectId,
        isDeleted: false,
      })
        .select('_id')
        .lean(),
    ]);

    const entityFilters: Array<Record<string, unknown>> = [
      { assignmentId: assignmentObjectId },
      { entityType: 'ANNUAL_ASSIGNMENT', entityId: assignmentObjectId },
    ];

    const termAssignmentIds = termAssignments.map((item) => item._id);
    if (termAssignmentIds.length > 0) {
      entityFilters.push({
        entityType: 'TERM_ASSIGNMENT',
        entityId: { $in: termAssignmentIds },
      });
    }

    const termReviewIds = termReviews.map((item) => item._id);
    if (termReviewIds.length > 0) {
      entityFilters.push({
        entityType: 'QUARTER_REVIEW',
        entityId: { $in: termReviewIds },
      });
    }

    const objectiveIds = objectives.map((item) => item._id);
    if (objectiveIds.length > 0) {
      entityFilters.push({
        entityType: 'OBJECTIVE',
        entityId: { $in: objectiveIds },
      });
    }

    if (annualDecision?._id) {
      entityFilters.push({
        entityType: 'ANNUAL_DECISION',
        entityId: annualDecision._id,
      });
    }

    if (visibilityConfiguration?._id) {
      entityFilters.push({
        entityType: 'VISIBILITY_CONFIGURATION',
        entityId: visibilityConfiguration._id,
      });
    }

    const auditLogs = await AuditLog.find({ $or: entityFilters })
      .sort({ timestamp: -1 })
      .lean();

    const correctionEntityFilters: Array<Record<string, unknown>> = [];

    if (termAssignmentIds.length > 0) {
      correctionEntityFilters.push({
        entityType: 'TERM_ASSIGNMENT',
        entityId: { $in: termAssignmentIds },
      });
    }

    if (objectiveIds.length > 0) {
      correctionEntityFilters.push({
        entityType: 'OBJECTIVE',
        entityId: { $in: objectiveIds },
      });
    }

    if (annualDecision?._id) {
      correctionEntityFilters.push({
        entityType: 'ANNUAL_DECISION',
        entityId: annualDecision._id,
      });
    }

    const correctionLayers = correctionEntityFilters.length > 0
      ? await CorrectionLayer.find({
        $or: correctionEntityFilters,
        isDeleted: false,
      })
        .sort({ correctedAt: -1 })
        .lean()
      : [];

    const correctedByIds = Array.from(
      new Set(
        correctionLayers
          .map((item) => item.correctedBy?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const correctedByUsers = correctedByIds.length > 0
      ? await User.find({ _id: { $in: correctedByIds } })
        .select('role')
        .lean()
      : [];

    const correctedByRoleMap = new Map(
      correctedByUsers.map((item) => [item._id.toString(), item.role]),
    );

    const correctionLogs: AuditHistoryEntry[] = correctionLayers.map((layer: any) => ({
      _id: `correction:${layer._id.toString()}`,
      entityType: layer.entityType,
      entityId: layer.entityId,
      action: 'PMS_CORRECTION_APPLIED',
      actorId: layer.correctedBy,
      actorRole: correctedByRoleMap.get(layer.correctedBy?.toString?.() ?? '') ?? 'UNKNOWN',
      previousValue: layer.originalValue,
      oldValue: layer.originalValue,
      newValue: layer.correctedValue,
      reason: layer.correctionReason,
      metadata: {
        correctionLayerId: layer._id.toString(),
        fieldKey: layer.fieldKey,
        approvedBy: layer.approvedBy,
        approvedAt: layer.approvedAt,
        workflowState:
          (layer.correctedValue as Record<string, unknown> | undefined)?.termState ??
          (layer.correctedValue as Record<string, unknown> | undefined)?.annualState ??
          (layer.correctedValue as Record<string, unknown> | undefined)?.decisionStatus,
      },
      assignmentId: assignmentObjectId,
      timestamp: layer.correctedAt,
      createdAt: layer.createdAt,
    }));

    const enrichedLogs = await this.enrichActorDetails([...auditLogs, ...correctionLogs]);

    return enrichedLogs.sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
  }

  async getEntityHistory(entityType: string, entityId: string): Promise<AuditHistoryEntry[]> {
    const normalizedEntityId = this.toObjectIdIfValid(entityId);
    const logs = await AuditLog.find({
      entityType,
      entityId: normalizedEntityId,
    })
      .sort({ timestamp: -1 })
      .lean();

    return this.enrichActorDetails(logs);
  }

  private toObjectIdIfValid(value: string): Types.ObjectId | string {
    return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;
  }

  private async enrichActorDetails(logs: AuditHistoryEntry[]): Promise<AuditHistoryEntry[]> {
    const actorIds = Array.from(
      new Set(
        logs
          .map((log) => log.actorId?.toString?.() ?? '')
          .filter((value) => value && Types.ObjectId.isValid(value)),
      ),
    );

    if (actorIds.length === 0) {
      return logs;
    }

    const users = await User.find({ _id: { $in: actorIds } })
      .select('name email employeeCode departmentId role specificRole')
      .lean();

    const userMap = new Map(users.map((user: any) => [user._id.toString(), user]));

    return logs.map((log) => {
      const actorId = log.actorId?.toString?.() ?? '';

      if (actorId === SYSTEM_WORKFLOW_SYNC_ACTOR.id) {
        return {
          ...log,
          actorName: SYSTEM_WORKFLOW_SYNC_ACTOR.name,
          actorEmail: SYSTEM_WORKFLOW_SYNC_ACTOR.email,
        };
      }

      const actor = userMap.get(actorId);

      if (!actor) {
        return log;
      }

      const actorDepartment = actor.departmentId || actor.specificRole || '';

      return {
        ...log,
        actorRole: log.actorRole || actor.role,
        actorName: actor.name,
        actorEmail: actor.email,
        actorEmployeeCode: actor.employeeCode,
        actorDepartment,
        actorDepartmentId: actor.departmentId,
      };
    });
  }
}

export const auditService = new AuditService();
