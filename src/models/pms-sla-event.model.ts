import mongoose, { Document, Schema, Types } from 'mongoose';
import { AssessmentTermCode } from '../constants/pms.enums';
import type { AssessmentTermCode as AssessmentTermCodeType } from '../constants/pms.enums';

export interface ISlaEvent extends Document {
  slaType: string;
  entityType: string;
  entityId: Types.ObjectId;
  cycleId?: Types.ObjectId;
  assessmentTermCode?: AssessmentTermCodeType;
  ownerUserId: Types.ObjectId;
  dueAt: Date;
  status: string;
  lastReminderAt?: Date;
  escalatedAt?: Date;
  escalationTargetUserId?: Types.ObjectId;
  metadata?: unknown;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const slaEventSchema = new Schema<ISlaEvent>(
  {
    slaType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    assessmentTermCode: {
      type: String,
      enum: Object.values(AssessmentTermCode),
      index: true,
    },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    dueAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      trim: true,
      default: 'OPEN',
      index: true,
    },
    lastReminderAt: Date,
    escalatedAt: Date,
    escalationTargetUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    metadata: Schema.Types.Mixed,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'sla_events',
    timestamps: true,
  },
);

slaEventSchema.index({ ownerUserId: 1, status: 1, dueAt: 1 });
slaEventSchema.index({ entityType: 1, entityId: 1 });
slaEventSchema.index({ cycleId: 1, assessmentTermCode: 1, status: 1 });

export const SlaEvent = mongoose.model<ISlaEvent>(
  'SlaEvent',
  slaEventSchema,
);
