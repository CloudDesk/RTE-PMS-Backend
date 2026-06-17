import { Document as MongooseDocument, Schema, Types, model } from 'mongoose';

export interface IAdminUploadMetadata {
  documentType: string;
  documentName: string;
  documentDate: Date;
  description?: string;
  uploadedAt: Date;
}

export interface IDocument extends MongooseDocument {
  employeeId: Types.ObjectId;
  type: string;
  category: string;
  tags?: string[];
  fileName: string;
  filePath: string;
  uploadDate: Date;
  uploadedBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  expiryDate?: Date;
  accessLevel: string;
  status: string;
  version: number;
  metadata: {
    adminUpload?: IAdminUploadMetadata;
    [key: string]: any;
  };
  auditLog?: Array<{
    action: string;
    performedBy?: Types.ObjectId;
    timestamp: Date;
    details?: string;
  }>;
}

const documentSchema = new Schema<IDocument>(
  {
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    type: { type: String, required: true, default: 'AdminUpload', index: true },
    category: { type: String, required: true, default: 'PMS', index: true },
    tags: [{ type: String }],
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiryDate: { type: Date },
    version: { type: Number, default: 1, required: true },
    accessLevel: { type: String, default: 'Private' },
    status: { type: String, default: 'Uploaded' },
    metadata: {
      type: Schema.Types.Mixed,
      validate: {
        validator(value: any) {
          if ((this as any).type !== 'AdminUpload') {
            return true;
          }

          return Boolean(
            value?.adminUpload?.documentType &&
              value?.adminUpload?.documentName &&
              value?.adminUpload?.documentDate &&
              value?.adminUpload?.uploadedAt,
          );
        },
        message: 'Admin upload metadata is required for uploaded PMS documents',
      },
    },
    auditLog: [
      {
        action: { type: String, required: true },
        performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
        details: { type: String },
      },
    ],
  },
  {
    collection: 'documents',
    timestamps: true,
  },
);

documentSchema.index({ employeeId: 1, type: 1 });
documentSchema.index({ category: 1, uploadDate: -1 });
documentSchema.index({ type: 1, 'metadata.adminUpload.documentName': 1 });

export const Document = model<IDocument>('Document', documentSchema);
