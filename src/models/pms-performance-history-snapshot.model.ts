import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPerformanceHistorySnapshot extends Document {
  annualAssignmentId: Types.ObjectId;
  cycleId: Types.ObjectId;
  employeeId: Types.ObjectId;
  templateVersionId: Types.ObjectId;
  annualSnapshot?: unknown;
  quarterSnapshots?: Record<string, unknown>;
  finalDecisionSnapshot?: unknown;
  visibilitySnapshot?: unknown;
  communicationSnapshot?: unknown;
  snapshotHash?: string;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const performanceHistorySnapshotSchema = new Schema<IPerformanceHistorySnapshot>(
  {
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualAssignment',
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualCycle',
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsTemplateVersion',
      index: true,
    },
    annualSnapshot: Schema.Types.Mixed,
    quarterSnapshots: {
      type: Schema.Types.Mixed,
      default: {},
    },
    finalDecisionSnapshot: Schema.Types.Mixed,
    visibilitySnapshot: Schema.Types.Mixed,
    communicationSnapshot: Schema.Types.Mixed,
    snapshotHash: {
      type: String,
      trim: true,
      index: true,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'performance_history_snapshots',
    timestamps: true,
  },
);

performanceHistorySnapshotSchema.index({ annualAssignmentId: 1, createdAt: -1 });
performanceHistorySnapshotSchema.index({ cycleId: 1, employeeId: 1, createdAt: -1 });
performanceHistorySnapshotSchema.index({ templateVersionId: 1 });

export const PerformanceHistorySnapshot = mongoose.model<IPerformanceHistorySnapshot>(
  'PerformanceHistorySnapshot',
  performanceHistorySnapshotSchema,
);
