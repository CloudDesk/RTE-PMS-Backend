import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAssignmentExceptionQueue extends Document {
  cycleId: Types.ObjectId;
  employeeId: Types.ObjectId;
  exceptionType: string;
  status: string;
  message: string;
  resolution?: string;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  metadata?: unknown;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const assignmentExceptionQueueSchema = new Schema<IAssignmentExceptionQueue>(
  {
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
    exceptionType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: 'OPEN',
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    resolution: String,
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: Date,
    metadata: Schema.Types.Mixed,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'assignment_exception_queue',
    timestamps: true,
  },
);

assignmentExceptionQueueSchema.index({ cycleId: 1, status: 1 });
assignmentExceptionQueueSchema.index({ employeeId: 1, status: 1 });
assignmentExceptionQueueSchema.index({ exceptionType: 1, status: 1 });

export const AssignmentExceptionQueue = mongoose.model<IAssignmentExceptionQueue>(
  'AssignmentExceptionQueue',
  assignmentExceptionQueueSchema,
);
