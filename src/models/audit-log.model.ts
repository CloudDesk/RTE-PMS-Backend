import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  entityType: string;
  entityId: unknown;
  action: string;
  fieldName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  userId?: Schema.Types.ObjectId;
  actorId?: unknown;
  actorRole?: string;
  previousValue?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  timestamp: Date;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    entityType: { type: String, required: true, maxlength: 100 },
    entityId: { type: Schema.Types.Mixed, required: true },
    action: { type: String, required: true, maxlength: 100 },
    fieldName: { type: String, maxlength: 100 },
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorId: { type: Schema.Types.Mixed },
    actorRole: { type: String, maxlength: 100 },
    previousValue: Schema.Types.Mixed,
    reason: String,
    metadata: Schema.Types.Mixed,
    ipAddress: { type: String, maxlength: 45 },
    timestamp: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'audit_logs',
    timestamps: false,
  },
);

// Indexes for efficient queries
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ actorId: 1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema); 
