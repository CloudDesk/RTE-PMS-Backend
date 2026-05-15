import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IObjectiveAttachment extends Document {
  objectiveId: Types.ObjectId;
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  uploadedBy?: Types.ObjectId;
  uploadedByRole?: string;
  visibilityRules?: Record<string, unknown>;
  versionNo: number;
  uploadedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const objectiveAttachmentSchema = new Schema<IObjectiveAttachment>(
  {
    objectiveId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Objective',
      index: true,
    },
    fileName: String,
    fileUrl: String,
    fileType: String,
    fileSize: Number,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedByRole: String,
    visibilityRules: { type: Schema.Types.Mixed, default: {} },
    versionNo: { type: Number, default: 1 },
    uploadedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'objective_attachments',
    timestamps: true,
  },
);

objectiveAttachmentSchema.index({ objectiveId: 1, isDeleted: 1 });

export const ObjectiveAttachment = mongoose.model<IObjectiveAttachment>(
  'ObjectiveAttachment',
  objectiveAttachmentSchema,
);
