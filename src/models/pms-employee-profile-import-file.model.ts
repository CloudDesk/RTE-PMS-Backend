import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPmsEmployeeProfileImportFile extends Document {
  importId: Types.ObjectId;
  workbook: Buffer;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pmsEmployeeProfileImportFileSchema =
  new Schema<IPmsEmployeeProfileImportFile>(
    {
      importId: {
        type: Schema.Types.ObjectId,
        ref: 'PmsEmployeeProfileImport',
        required: true,
        unique: true,
      },
      workbook: {
        type: Buffer,
        required: true,
      },
      expiresAt: {
        type: Date,
        required: true,
      },
    },
    {
      collection: 'pms_employee_profile_import_files',
      timestamps: true,
    },
  );

pmsEmployeeProfileImportFileSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'ttl_pms_employee_profile_import_file' },
);

export const PmsEmployeeProfileImportFile =
  mongoose.model<IPmsEmployeeProfileImportFile>(
    'PmsEmployeeProfileImportFile',
    pmsEmployeeProfileImportFileSchema,
  );
