import mongoose, { Document, Schema, Types } from 'mongoose';
import { AssessmentTermCode } from '../constants/pms.enums';
import type { AssessmentTermCode as AssessmentTermCodeType } from '../constants/pms.enums';

export const EmployeeAchievementSubmissionStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  LOCKED: 'LOCKED',
} as const;

export type EmployeeAchievementSubmissionStatus =
  (typeof EmployeeAchievementSubmissionStatus)[keyof typeof EmployeeAchievementSubmissionStatus];

export interface IAchievementAttachmentMetadata {
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  documentId?: string;
  uploadedAt?: Date;
}

export interface IAchievementItem {
  subject: string;
  description: string;
  attachments?: IAchievementAttachmentMetadata[];
}

export interface IEmployeeAchievementValue {
  templateFieldId?: string;
  fieldKey: string;
  sectionKey: string;
  roleCode: string;
  actorUserId: Types.ObjectId;
  workflowStage: string;
  valueJson?: unknown;
  valueText?: string;
  valueNumber?: number;
  valueDate?: Date;
  valueStatus: string;
  submittedAt?: Date;
}

export interface IEmployeeAchievementSubmission extends Document {
  annualAssignmentId: Types.ObjectId;
  quarterAssignmentId: Types.ObjectId;
  cycleId?: Types.ObjectId;
  employeeId: Types.ObjectId;
  managerId: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  quarterCode: AssessmentTermCodeType;
  achievementItems: IAchievementItem[];
  achievementValues: IEmployeeAchievementValue[];
  status: EmployeeAchievementSubmissionStatus;
  draftSavedAt?: Date;
  submittedBy?: Types.ObjectId;
  submittedAt?: Date;
  lockedAt?: Date;
  auditMetadata?: Record<string, unknown>;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const achievementAttachmentMetadataSchema = new Schema<IAchievementAttachmentMetadata>(
  {
    fileName: String,
    fileUrl: String,
    fileType: String,
    fileSize: Number,
    documentId: String,
    uploadedAt: Date,
  },
  { _id: false },
);

const achievementItemSchema = new Schema<IAchievementItem>(
  {
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    attachments: { type: [achievementAttachmentMetadataSchema], default: [] },
  },
  { _id: false },
);

const employeeAchievementValueSchema = new Schema<IEmployeeAchievementValue>(
  {
    templateFieldId: String,
    fieldKey: { type: String, required: true, trim: true },
    sectionKey: { type: String, required: true, trim: true },
    roleCode: { type: String, required: true, trim: true },
    actorUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    workflowStage: { type: String, required: true, trim: true },
    valueJson: Schema.Types.Mixed,
    valueText: String,
    valueNumber: Number,
    valueDate: Date,
    valueStatus: { type: String, default: 'ACTIVE', trim: true },
    submittedAt: Date,
  },
  { _id: false },
);

const employeeAchievementSubmissionSchema = new Schema<IEmployeeAchievementSubmission>(
  {
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualAssignment',
      index: true,
    },
    quarterAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'QuarterAssignment',
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
    managerId: {
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
    quarterCode: {
      type: String,
      required: true,
      enum: Object.values(AssessmentTermCode),
      index: true,
    },
    achievementItems: { type: [achievementItemSchema], default: [] },
    achievementValues: { type: [employeeAchievementValueSchema], default: [] },
    status: {
      type: String,
      required: true,
      enum: Object.values(EmployeeAchievementSubmissionStatus),
      default: EmployeeAchievementSubmissionStatus.DRAFT,
      index: true,
    },
    draftSavedAt: Date,
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    submittedAt: Date,
    lockedAt: Date,
    auditMetadata: { type: Schema.Types.Mixed, default: {} },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'employee_achievement_submissions',
    timestamps: true,
  },
);

employeeAchievementSubmissionSchema.index(
  { quarterAssignmentId: 1 },
  { unique: true, name: 'idx_employee_achievement_submission_quarter_assignment' },
);
employeeAchievementSubmissionSchema.index({ annualAssignmentId: 1, quarterCode: 1 });
employeeAchievementSubmissionSchema.index({ employeeId: 1, cycleId: 1, quarterCode: 1 });

export const EmployeeAchievementSubmission = mongoose.model<IEmployeeAchievementSubmission>(
  'EmployeeAchievementSubmission',
  employeeAchievementSubmissionSchema,
);
