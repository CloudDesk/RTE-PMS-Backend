import mongoose, { Document, Schema, Types } from 'mongoose';

interface IBulkOperationFailureSummary {
  employeeId?: Types.ObjectId;
  entityId?: Types.ObjectId;
  reason?: string;
  metadata?: unknown;
}

export interface IBulkOperationJob extends Document {
  jobType: string;
  cycleId?: Types.ObjectId;
  status: string;
  requestedBy: Types.ObjectId;
  totalCount: number;
  successCount: number;
  failureCount: number;
  failureSummary: IBulkOperationFailureSummary[];
  startedAt?: Date;
  completedAt?: Date;
  metadata?: unknown;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const failureSummarySchema = new Schema<IBulkOperationFailureSummary>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'User' },
    entityId: Schema.Types.ObjectId,
    reason: String,
    metadata: Schema.Types.Mixed,
  },
  { _id: false },
);

const bulkOperationJobSchema = new Schema<IBulkOperationJob>(
  {
    jobType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    totalCount: { type: Number, default: 0, min: 0 },
    successCount: { type: Number, default: 0, min: 0 },
    failureCount: { type: Number, default: 0, min: 0 },
    failureSummary: {
      type: [failureSummarySchema],
      default: [],
    },
    startedAt: Date,
    completedAt: Date,
    metadata: Schema.Types.Mixed,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'bulk_operation_jobs',
    timestamps: true,
  },
);

bulkOperationJobSchema.index({ cycleId: 1, jobType: 1, createdAt: -1 });
bulkOperationJobSchema.index({ requestedBy: 1, createdAt: -1 });
bulkOperationJobSchema.index({ status: 1, createdAt: -1 });

export const BulkOperationJob = mongoose.model<IBulkOperationJob>(
  'BulkOperationJob',
  bulkOperationJobSchema,
);
