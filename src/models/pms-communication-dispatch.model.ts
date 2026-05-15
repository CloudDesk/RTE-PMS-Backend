import mongoose, { Document, Schema, Types } from 'mongoose';
import { AppraisalOutcomeType } from '../constants/pms.enums';
import type { AppraisalOutcomeType as AppraisalOutcomeTypeType } from '../constants/pms.enums';

export interface ICommunicationDispatch extends Document {
  annualAssignmentId: Types.ObjectId;
  cycleId: Types.ObjectId;
  employeeId: Types.ObjectId;
  appraisalOutcomeType: AppraisalOutcomeTypeType;
  templateId: Types.ObjectId;
  templateVersionId: Types.ObjectId;
  channel: string;
  dispatchStatus: string;
  renderedSubject: string;
  renderedBodySnapshot: string;
  contentHash: string;
  renderedAt: Date;
  deliveryStatus?: Record<string, unknown>;
  sentBy?: Types.ObjectId;
  sentAt?: Date;
  resendOf?: Types.ObjectId;
  correctionReason?: string;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const communicationDispatchSchema = new Schema<ICommunicationDispatch>(
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
    appraisalOutcomeType: {
      type: String,
      required: true,
      enum: Object.values(AppraisalOutcomeType),
      index: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsLetterTemplate',
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsLetterTemplateVersion',
    },
    channel: { type: String, required: true, default: 'EMAIL' },
    dispatchStatus: { type: String, required: true, default: 'RENDERED', index: true },
    renderedSubject: { type: String, required: true },
    renderedBodySnapshot: { type: String, required: true },
    contentHash: { type: String, required: true },
    renderedAt: { type: Date, required: true },
    deliveryStatus: { type: Schema.Types.Mixed, default: {} },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sentAt: Date,
    resendOf: { type: Schema.Types.ObjectId, ref: 'CommunicationDispatch' },
    correctionReason: String,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'communication_dispatches',
    timestamps: true,
  },
);

communicationDispatchSchema.index({ annualAssignmentId: 1 });
communicationDispatchSchema.index({ cycleId: 1, dispatchStatus: 1 });
communicationDispatchSchema.index({ employeeId: 1 });
communicationDispatchSchema.index({ contentHash: 1 });

export const CommunicationDispatch = mongoose.model<ICommunicationDispatch>(
  'CommunicationDispatch',
  communicationDispatchSchema,
);
