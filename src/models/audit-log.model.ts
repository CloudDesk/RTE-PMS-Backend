import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  entityType: string;
  entityId: Schema.Types.ObjectId;
  action: 'Created' | 'Updated' | 'Deleted';
  fieldName: string;
  oldValue?: string;
  newValue?: string;
  userId: Schema.Types.ObjectId;
  ipAddress?: string;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    entityType: { type: String, required: true, maxlength: 50 },
    entityId: { type: Schema.Types.ObjectId, required: true },
    action: {
      type: String,
      enum: ['Created', 'Updated', 'Deleted'],
      required: true,
    },
    fieldName: { type: String, required: true, maxlength: 50 },
    oldValue: String,
    newValue: String,
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    ipAddress: { type: String, maxlength: 45 },
    timestamp: { type: Date, default: Date.now },
  },
  {
    timestamps: false, // We'll use the timestamp field instead
  },
);

// Indexes for efficient queries
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ timestamp: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema); 