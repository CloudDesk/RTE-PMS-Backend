import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReassignment extends Document {
  annualAssignmentId: Types.ObjectId;
  quarterAssignmentId?: Types.ObjectId;
  employeeId: Types.ObjectId;
  fromManagerId: Types.ObjectId;
  toManagerId: Types.ObjectId;
  effectiveFrom: Date;
  appliesTo: string;
  reason: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const reassignmentSchema = new Schema<IReassignment>(
  {
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualAssignment',
      index: true,
    },
    quarterAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'QuarterAssignment',
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    fromManagerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    toManagerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      index: true,
    },
    appliesTo: {
      type: String,
      required: true,
      trim: true,
      default: 'FUTURE_ACTIONS_ONLY',
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'reassignments',
    timestamps: true,
  },
);

reassignmentSchema.index({ annualAssignmentId: 1, effectiveFrom: -1 });
reassignmentSchema.index({ employeeId: 1, effectiveFrom: -1 });
reassignmentSchema.index({ toManagerId: 1, effectiveFrom: -1 });

export const Reassignment = mongoose.model<IReassignment>(
  'Reassignment',
  reassignmentSchema,
);
