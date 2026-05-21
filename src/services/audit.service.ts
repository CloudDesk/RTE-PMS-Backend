import mongoose, { Types } from 'mongoose';
import { AuditLog } from '../models/audit-log.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { Objective } from '../models/pms-objective.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterReview } from '../models/pms-quarter-review.model';
import { VisibilityConfiguration } from '../models/pms-visibility-configuration.model';
import { User } from '../models/user.model';
import type { IAuditLog } from '../models/audit-log.model';
import type { CreateAuditLogInput } from '../types/pms.types';

export interface AuditHistoryEntry {
  _id: string;
  entityType: string;
  entityId: unknown;
  action: string;
  actorId?: unknown;
  actorRole?: string;
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
      quarterAssignments,
      quarterReviews,
      objectives,
      annualDecision,
      visibilityConfiguration,
    ] = await Promise.all([
      QuarterAssignment.find({
        annualAssignmentId: assignmentObjectId,
        isDeleted: false,
      })
        .select('_id')
        .lean(),
      QuarterReview.find({
        annualAssignmentId: assignmentObjectId,
        isDeleted: false,
      })
        .select('_id quarterAssignmentId')
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

    const quarterAssignmentIds = quarterAssignments.map((item) => item._id);
    if (quarterAssignmentIds.length > 0) {
      entityFilters.push({
        entityType: 'QUARTER_ASSIGNMENT',
        entityId: { $in: quarterAssignmentIds },
      });
    }

    const quarterReviewIds = quarterReviews.map((item) => item._id);
    if (quarterReviewIds.length > 0) {
      entityFilters.push({
        entityType: 'QUARTER_REVIEW',
        entityId: { $in: quarterReviewIds },
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

    if (quarterAssignmentIds.length > 0) {
      correctionEntityFilters.push({
        entityType: 'QUARTER_ASSIGNMENT',
        entityId: { $in: quarterAssignmentIds },
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
          (layer.correctedValue as Record<string, unknown> | undefined)?.quarterState ??
          (layer.correctedValue as Record<string, unknown> | undefined)?.annualState ??
          (layer.correctedValue as Record<string, unknown> | undefined)?.decisionStatus,
      },
      assignmentId: assignmentObjectId,
      timestamp: layer.correctedAt,
      createdAt: layer.createdAt,
    }));

    return [...auditLogs, ...correctionLogs].sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
  }

  async getEntityHistory(entityType: string, entityId: string): Promise<AuditHistoryEntry[]> {
    const normalizedEntityId = this.toObjectIdIfValid(entityId);
    return AuditLog.find({
      entityType,
      entityId: normalizedEntityId,
    })
      .sort({ timestamp: -1 })
      .lean();
  }

  private toObjectIdIfValid(value: string): Types.ObjectId | string {
    return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;
  }
}

export const auditService = new AuditService();
