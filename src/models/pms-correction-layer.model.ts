import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICorrectionLayer extends Document {
  entityType: string;
  entityId: Types.ObjectId;
  fieldKey?: string;
  originalValue?: unknown;
  correctedValue?: unknown;
  correctionReason: string;
  correctedBy: Types.ObjectId;
  correctedAt: Date;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const correctionLayerSchema = new Schema<ICorrectionLayer>(
  {
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
    fieldKey: {
      type: String,
      trim: true,
      index: true,
    },
    originalValue: Schema.Types.Mixed,
    correctedValue: Schema.Types.Mixed,
    correctionReason: {
      type: String,
      required: true,
      trim: true,
    },
    correctedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    correctedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
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
    collection: 'correction_layers',
    timestamps: true,
  },
);

correctionLayerSchema.index({ entityType: 1, entityId: 1, correctedAt: -1 });
correctionLayerSchema.index({ correctedBy: 1, correctedAt: -1 });
correctionLayerSchema.index({ approvedBy: 1, approvedAt: -1 });

export const CorrectionLayer = mongoose.model<ICorrectionLayer>(
  'CorrectionLayer',
  correctionLayerSchema,
);
