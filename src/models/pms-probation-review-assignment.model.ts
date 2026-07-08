import mongoose, { Document, Schema, Types } from 'mongoose';

export const ProbationReviewStatus = {
  SCHEDULED: 'SCHEDULED',
  REVIEW_OPEN: 'REVIEW_OPEN',
  MANAGER_1_SUBMITTED: 'MANAGER_1_SUBMITTED',
  RETURNED_TO_MANAGER_1: 'RETURNED_TO_MANAGER_1',
  FINALIZED: 'FINALIZED',
  CANCELLED: 'CANCELLED',
} as const;

export type ProbationReviewStatus =
  (typeof ProbationReviewStatus)[keyof typeof ProbationReviewStatus];

export interface IProbationReviewValue {
  sectionKey: string;
  fieldKey: string;
  fieldType?: string;
  value?: unknown;
  updatedBy?: Types.ObjectId;
  updatedAt?: Date;
}

export type ProbationReviewerRole = 'MANAGER_1' | 'MANAGER_2';

export interface IProbationReviewAccessRule {
  visible: boolean;
  editable: boolean;
  mandatory?: boolean;
}

export interface IProbationReviewFieldPermission {
  sectionKey: string;
  sectionLabel?: string;
  fieldKey: string;
  fieldLabel?: string;
  fieldType?: string;
  parentFieldKey?: string;
  isGridRow?: boolean;
  gridRowKey?: string;
  manager1: IProbationReviewAccessRule;
  manager2: IProbationReviewAccessRule;
}

export interface IProbationReviewReviewerConfiguration {
  fillingManagerRole: ProbationReviewerRole;
  approvingManagerRole: ProbationReviewerRole;
  permissions: IProbationReviewFieldPermission[];
}

interface IProbationReviewAuditEntry {
  action: string;
  actorId?: Types.ObjectId;
  comment?: string;
  createdAt: Date;
}

export interface IPmsProbationReviewAssignment extends Document {
  employeeId: Types.ObjectId;
  joiningDate?: Date;
  probationStartDate?: Date;
  probationEndDate: Date;
  reviewOpenDate: Date;
  openedAt?: Date;
  reviewOpenOffsetDays?: number;
  manager1Id: Types.ObjectId;
  manager2Id: Types.ObjectId;
  templateId: Types.ObjectId;
  templateVersionId: Types.ObjectId;
  reviewerConfiguration?: IProbationReviewReviewerConfiguration;
  status: ProbationReviewStatus;
  reviewValues: IProbationReviewValue[];
  manager1SubmittedAt?: Date;
  manager1SubmittedBy?: Types.ObjectId;
  manager2ReviewedAt?: Date;
  manager2ReviewedBy?: Types.ObjectId;
  finalizedAt?: Date;
  returnedAt?: Date;
  returnReason?: string;
  approvalComments?: string;
  cancelledAt?: Date;
  cancelledBy?: Types.ObjectId;
  cancelReason?: string;
  auditTrail: IProbationReviewAuditEntry[];
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const probationReviewValueSchema = new Schema<IProbationReviewValue>(
  {
    sectionKey: { type: String, required: true, trim: true },
    fieldKey: { type: String, required: true, trim: true },
    fieldType: { type: String, trim: true },
    value: Schema.Types.Mixed,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedAt: Date,
  },
  { _id: false },
);

const probationReviewAuditSchema = new Schema<IProbationReviewAuditEntry>(
  {
    action: { type: String, required: true, trim: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    comment: { type: String, trim: true },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const probationReviewAssignmentSchema =
  new Schema<IPmsProbationReviewAssignment>(
    {
      employeeId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User',
        index: true,
      },
      joiningDate: { type: Date },
      probationStartDate: { type: Date },
      probationEndDate: { type: Date, required: true, index: true },
      reviewOpenDate: { type: Date, required: true, index: true },
      openedAt: Date,
      reviewOpenOffsetDays: { type: Number, min: 0, default: 30 },
      manager1Id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User',
        index: true,
      },
      manager2Id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'User',
        index: true,
      },
      templateId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'PmsTemplate',
        index: true,
      },
      templateVersionId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: 'PmsTemplateVersion',
        index: true,
      },
      reviewerConfiguration: { type: Schema.Types.Mixed, default: undefined },
      status: {
        type: String,
        enum: Object.values(ProbationReviewStatus),
        required: true,
        default: ProbationReviewStatus.SCHEDULED,
        index: true,
      },
      reviewValues: { type: [probationReviewValueSchema], default: [] },
      manager1SubmittedAt: Date,
      manager1SubmittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      manager2ReviewedAt: Date,
      manager2ReviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      finalizedAt: Date,
      returnedAt: Date,
      returnReason: { type: String, trim: true },
      approvalComments: { type: String, trim: true },
      cancelledAt: Date,
      cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
      cancelReason: { type: String, trim: true },
      auditTrail: { type: [probationReviewAuditSchema], default: [] },
      isDeleted: { type: Boolean, default: false, index: true },
      createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      version: { type: Number, default: 1 },
    },
    {
      collection: 'pms_probation_review_assignments',
      timestamps: true,
    },
  );

probationReviewAssignmentSchema.index({
  employeeId: 1,
  probationEndDate: 1,
  isDeleted: 1,
});
probationReviewAssignmentSchema.index({ status: 1, reviewOpenDate: 1 });

export const PmsProbationReviewAssignment =
  mongoose.model<IPmsProbationReviewAssignment>(
    'PmsProbationReviewAssignment',
    probationReviewAssignmentSchema,
  );
