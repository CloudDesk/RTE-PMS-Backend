import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReminderRule extends Document {
  name: string;
  slaRuleId: Types.ObjectId;
  reminderType: 'PRE_DUE' | 'DUE_DATE' | 'OVERDUE' | 'ESCALATION';
  offsetDays: number; // Negative for pre-due, positive for overdue, 0 for due date
  channel: 'EMAIL' | 'IN_APP' | 'BOTH';
  subjectTemplate: string;
  bodyTemplate: string;
  escalationTargetRole?: string; // For ESCALATION reminders
  isActive: boolean;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const reminderRuleSchema = new Schema<IReminderRule>(
  {
    name: { type: String, required: true, trim: true },
    slaRuleId: { type: Schema.Types.ObjectId, ref: 'SlaRule', required: true, index: true },
    reminderType: {
      type: String,
      enum: ['PRE_DUE', 'DUE_DATE', 'OVERDUE', 'ESCALATION'],
      required: true,
      index: true,
    },
    offsetDays: { type: Number, required: true, default: 0 },
    channel: {
      type: String,
      enum: ['EMAIL', 'IN_APP', 'BOTH'],
      required: true,
      default: 'BOTH',
    },
    subjectTemplate: { type: String, required: true },
    bodyTemplate: { type: String, required: true },
    escalationTargetRole: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'reminder_rules',
    timestamps: true,
  },
);

export const ReminderRule = mongoose.model<IReminderRule>('ReminderRule', reminderRuleSchema);
