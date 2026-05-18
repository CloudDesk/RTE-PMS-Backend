import mongoose, { Types } from 'mongoose';
import { AuditLog } from '../models/audit-log.model';
import type { IAuditLog } from '../models/audit-log.model';
import type { CreateAuditLogInput } from '../types/pms.types';

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
        timestamp: createdAt,
        createdAt,
      },
    ], { session });

    return auditLog;
  }

  async getHistory(assignmentId: string): Promise<IAuditLog[]> {
    return AuditLog.find({ assignmentId: this.toObjectIdIfValid(assignmentId) })
      .sort({ timestamp: -1 })
      .lean();
  }

  private toObjectIdIfValid(value: string): Types.ObjectId | string {
    return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;
  }
}

export const auditService = new AuditService();
