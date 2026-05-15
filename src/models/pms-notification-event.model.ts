import mongoose, { Document, Schema, Types } from 'mongoose';

export interface INotificationEvent extends Document {
  eventType: string;
  recipientUserId: Types.ObjectId;
  channel: string;
  deliveryStatus: string;
  entityType?: string;
  entityId?: Types.ObjectId;
  cycleId?: Types.ObjectId;
  sentAt?: Date;
  payload?: unknown;
  errorMessage?: string;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const notificationEventSchema = new Schema<INotificationEvent>(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    recipientUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    channel: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    deliveryStatus: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityType: {
      type: String,
      trim: true,
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    sentAt: Date,
    payload: Schema.Types.Mixed,
    errorMessage: String,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'notification_events',
    timestamps: true,
  },
);

notificationEventSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
notificationEventSchema.index({ cycleId: 1, eventType: 1, createdAt: -1 });

export const NotificationEvent = mongoose.model<INotificationEvent>(
  'NotificationEvent',
  notificationEventSchema,
);
