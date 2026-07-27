import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITemplateFieldAttachment extends Document {
  annualAssignmentId: Types.ObjectId;
  termAssignmentId: Types.ObjectId;
  cycleId?: Types.ObjectId;
  employeeId: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  sectionKey: string;
  fieldKey: string;
  documentId: Types.ObjectId;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  versionNo: number;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const templateFieldAttachmentSchema = new Schema<ITemplateFieldAttachment>(
  {
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualAssignment',
      index: true,
    },
    termAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'TermAssignment',
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'PmsTemplateVersion',
      index: true,
    },
    sectionKey: { type: String, required: true, trim: true },
    fieldKey: { type: String, required: true, trim: true },
    documentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'PmsDocument',
    },
    fileName: { type: String, required: true, trim: true },
    fileType: String,
    fileSize: Number,
    versionNo: { type: Number, required: true, default: 1, min: 1 },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    uploadedAt: { type: Date, required: true, default: Date.now },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'pms_template_field_attachments',
    timestamps: true,
  },
);

templateFieldAttachmentSchema.index({
  termAssignmentId: 1,
  sectionKey: 1,
  fieldKey: 1,
  isDeleted: 1,
});

export const TemplateFieldAttachment =
  mongoose.model<ITemplateFieldAttachment>(
    'TemplateFieldAttachment',
    templateFieldAttachmentSchema,
  );
