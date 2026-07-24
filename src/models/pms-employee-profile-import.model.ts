import mongoose, { Document, Schema, Types } from 'mongoose';

export const PmsEmployeeProfileImportStatus = {
  UPLOADED: 'UPLOADED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATED: 'VALIDATED',
  IMPORTING: 'IMPORTING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type PmsEmployeeProfileImportStatus =
  (typeof PmsEmployeeProfileImportStatus)[keyof typeof PmsEmployeeProfileImportStatus];

export const PmsEmployeeProfileImportIssueSeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
} as const;

export type PmsEmployeeProfileImportIssueSeverity =
  (typeof PmsEmployeeProfileImportIssueSeverity)[keyof typeof PmsEmployeeProfileImportIssueSeverity];

export interface IPmsEmployeeProfileImportIssue {
  severity: PmsEmployeeProfileImportIssueSeverity;
  sheet: string;
  rowNumber?: number;
  employeeCode?: string;
  column?: string;
  code: string;
  message: string;
}

export interface IPmsEmployeeProfileImportCounts {
  profileRows: number;
  careerRows: number;
  validProfiles: number;
  invalidProfiles: number;
  warningCount: number;
  createdProfiles: number;
  updatedProfiles: number;
  unchangedProfiles: number;
  failedProfiles: number;
}

export interface IPmsEmployeeProfileImport extends Document {
  originalFileName: string;
  fileChecksum: string;
  templateVersion: string;
  status: PmsEmployeeProfileImportStatus;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
  validatedAt?: Date;
  confirmedAt?: Date;
  completedAt?: Date;
  counts: IPmsEmployeeProfileImportCounts;
  validationIssues: IPmsEmployeeProfileImportIssue[];
  affectedEmployeeIds: Types.ObjectId[];
  failureReason?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const importIssueSchema = new Schema<IPmsEmployeeProfileImportIssue>(
  {
    severity: {
      type: String,
      required: true,
      enum: Object.values(PmsEmployeeProfileImportIssueSeverity),
    },
    sheet: { type: String, required: true, trim: true, maxlength: 100 },
    rowNumber: { type: Number, min: 1 },
    employeeCode: { type: String, trim: true, maxlength: 50 },
    column: { type: String, trim: true, maxlength: 100 },
    code: { type: String, required: true, trim: true, maxlength: 100 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

const importCountsSchema = new Schema<IPmsEmployeeProfileImportCounts>(
  {
    profileRows: { type: Number, default: 0, min: 0 },
    careerRows: { type: Number, default: 0, min: 0 },
    validProfiles: { type: Number, default: 0, min: 0 },
    invalidProfiles: { type: Number, default: 0, min: 0 },
    warningCount: { type: Number, default: 0, min: 0 },
    createdProfiles: { type: Number, default: 0, min: 0 },
    updatedProfiles: { type: Number, default: 0, min: 0 },
    unchangedProfiles: { type: Number, default: 0, min: 0 },
    failedProfiles: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const pmsEmployeeProfileImportSchema = new Schema<IPmsEmployeeProfileImport>(
  {
    originalFileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    fileChecksum: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 128,
    },
    templateVersion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(PmsEmployeeProfileImportStatus),
      default: PmsEmployeeProfileImportStatus.UPLOADED,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    uploadedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    validatedAt: Date,
    confirmedAt: Date,
    completedAt: Date,
    counts: {
      type: importCountsSchema,
      default: () => ({}),
    },
    validationIssues: {
      type: [importIssueSchema],
      default: [],
      validate: {
        validator: (issues: IPmsEmployeeProfileImportIssue[]) => issues.length <= 5000,
        message: 'Import audit cannot store more than 5,000 validation issues',
      },
    },
    affectedEmployeeIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    failureReason: { type: String, trim: true, maxlength: 2000 },
    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Import version must be a whole number',
      },
    },
  },
  {
    collection: 'pms_employee_profile_imports',
    timestamps: true,
  },
);

pmsEmployeeProfileImportSchema.index({ status: 1, createdAt: -1 });
pmsEmployeeProfileImportSchema.index({ uploadedBy: 1, createdAt: -1 });
pmsEmployeeProfileImportSchema.index({ fileChecksum: 1, createdAt: -1 });
pmsEmployeeProfileImportSchema.index({ affectedEmployeeIds: 1, createdAt: -1 });

export const PmsEmployeeProfileImport = mongoose.model<IPmsEmployeeProfileImport>(
  'PmsEmployeeProfileImport',
  pmsEmployeeProfileImportSchema,
);
