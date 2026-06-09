import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDelegation extends Document {
  delegatorUserId: Types.ObjectId;
  delegateUserId: Types.ObjectId;
  scopeType: string;
  cycleId?: Types.ObjectId;
  validFrom: Date;
  validTo: Date;
  status: string;
  reason?: string;
  revokeReason?: string;
  revokedAt?: Date;
  revokedBy?: Types.ObjectId;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const delegationSchema = new Schema<IDelegation>(
  {
    delegatorUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    delegateUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    scopeType: {
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
    validFrom: {
      type: Date,
      required: true,
      index: true,
    },
    validTo: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: 'ACTIVE',
      index: true,
    },
    reason: String,
    revokeReason: String,
    revokedAt: Date,
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'delegations',
    timestamps: true,
  },
);

delegationSchema.index({ delegateUserId: 1, status: 1, validFrom: 1, validTo: 1 });
delegationSchema.index({ delegatorUserId: 1, status: 1 });
delegationSchema.index({ cycleId: 1, status: 1 });

export const Delegation = mongoose.model<IDelegation>(
  'Delegation',
  delegationSchema,
);
