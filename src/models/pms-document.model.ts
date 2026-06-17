import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPmsDocument extends Document {
  employeeId: Types.ObjectId;
  cycleId?: Types.ObjectId;
  annualAssignmentId?: Types.ObjectId;
  quarterAssignmentId?: Types.ObjectId;
  documentType: string;
  documentName: string;
  documentDate?: Date;
  description?: string;
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: number;
  uploadedBy?: Types.ObjectId;
  uploadedAt: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pmsDocumentSchema = new Schema<IPmsDocument>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualAssignment',
      index: true,
    },
    quarterAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'QuarterAssignment',
      index: true,
    },
    documentType: {
      type: String,
      required: true,
      trim: true,
      default: 'Other',
    },
    documentName: {
      type: String,
      required: true,
      trim: true,
    },
    documentDate: Date,
    description: {
      type: String,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },
    fileType: String,
    fileSize: Number,
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    collection: 'pms_documents',
    timestamps: true,
  },
);

pmsDocumentSchema.index({ employeeId: 1, uploadedAt: -1 });
pmsDocumentSchema.index({ quarterAssignmentId: 1, documentType: 1, isDeleted: 1 });

export const PmsDocument = mongoose.model<IPmsDocument>('PmsDocument', pmsDocumentSchema);
