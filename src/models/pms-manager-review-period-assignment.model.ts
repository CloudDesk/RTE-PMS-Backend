import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  AssessmentTermCode,
  ManagerReviewPeriodState,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  ManagerReviewPeriodState as ManagerReviewPeriodStateType,
} from '../constants/pms.enums';

interface IManagerReviewPeriodRating {
  objectiveId?: Types.ObjectId;
  rating?: number;
  comments?: string;
}

interface IManagerReviewPeriodValue {
  templateFieldId?: string;
  fieldKey: string;
  sectionKey: string;
  roleCode?: string;
  actorUserId?: Types.ObjectId;
  workflowStage?: string;
  valueJson?: unknown;
  valueText?: string;
  valueNumber?: number;
  valueDate?: Date;
}

interface IManagerReviewPeriodAttachment {
  fileName?: string;
  fileUrl?: string;
  documentId?: string;
  uploadedBy?: Types.ObjectId;
  uploadedAt?: Date;
}

export interface IManagerReviewPeriodAssignment extends Document {
  annualAssignmentId: Types.ObjectId;
  cycleId: Types.ObjectId;
  employeeId: Types.ObjectId;
  managerId: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  reviewCode: string;
  label: string;
  includedTerms: AssessmentTermCodeType[];
  includedTermAssignmentIds: Types.ObjectId[];
  anchorTerm: AssessmentTermCodeType;
  anchorTermAssignmentId?: Types.ObjectId;
  reviewState: ManagerReviewPeriodStateType;
  previousReviewState?: ManagerReviewPeriodStateType;
  ratings: IManagerReviewPeriodRating[];
  comments?: string;
  score?: number;
  overallScore?: number;
  overallRating?: string;
  recommendation?: string;
  achievements?: string;
  developmentObservations?: string;
  attachments: IManagerReviewPeriodAttachment[];
  reviewValues: IManagerReviewPeriodValue[];
  scoreSnapshot?: Record<string, unknown>;
  openedAt?: Date;
  submittedAt?: Date;
  finalizedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const ratingSchema = new Schema<IManagerReviewPeriodRating>(
  {
    objectiveId: { type: Schema.Types.ObjectId, ref: 'Objective' },
    rating: { type: Number, min: 0 },
    comments: String,
  },
  { _id: false },
);

const valueSchema = new Schema<IManagerReviewPeriodValue>(
  {
    templateFieldId: String,
    fieldKey: { type: String, required: true, trim: true },
    sectionKey: { type: String, required: true, trim: true },
    roleCode: String,
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    workflowStage: String,
    valueJson: Schema.Types.Mixed,
    valueText: String,
    valueNumber: Number,
    valueDate: Date,
  },
  { _id: false },
);

const attachmentSchema = new Schema<IManagerReviewPeriodAttachment>(
  {
    fileName: String,
    fileUrl: String,
    documentId: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: Date,
  },
  { _id: false },
);

const managerReviewPeriodAssignmentSchema = new Schema<IManagerReviewPeriodAssignment>(
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
    reviewCode: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    includedTerms: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      required: true,
    },
    includedTermAssignmentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'TermAssignment' }],
      required: true,
    },
    anchorTerm: {
      type: String,
      required: true,
      enum: Object.values(AssessmentTermCode),
    },
    anchorTermAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'TermAssignment',
    },
    reviewState: {
      type: String,
      required: true,
      enum: Object.values(ManagerReviewPeriodState),
      default: ManagerReviewPeriodState.NOT_STARTED,
      index: true,
    },
    previousReviewState: {
      type: String,
      enum: Object.values(ManagerReviewPeriodState),
    },
    ratings: { type: [ratingSchema], default: [] },
    comments: String,
    score: { type: Number, min: 0 },
    overallScore: { type: Number, min: 0 },
    overallRating: String,
    recommendation: String,
    achievements: String,
    developmentObservations: String,
    attachments: { type: [attachmentSchema], default: [] },
    reviewValues: { type: [valueSchema], default: [] },
    scoreSnapshot: { type: Schema.Types.Mixed },
    openedAt: Date,
    submittedAt: Date,
    finalizedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'manager_review_period_assignments',
    timestamps: true,
  },
);

managerReviewPeriodAssignmentSchema.index(
  { annualAssignmentId: 1, reviewCode: 1 },
  { unique: true, name: 'idx_manager_review_period_annual_code' },
);
managerReviewPeriodAssignmentSchema.index({ managerId: 1, reviewState: 1 });
managerReviewPeriodAssignmentSchema.index({ cycleId: 1, reviewState: 1 });
managerReviewPeriodAssignmentSchema.index({ includedTermAssignmentIds: 1 });

export const ManagerReviewPeriodAssignment =
  mongoose.model<IManagerReviewPeriodAssignment>(
    'ManagerReviewPeriodAssignment',
    managerReviewPeriodAssignmentSchema,
  );
