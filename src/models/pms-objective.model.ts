import mongoose, { Document, Schema, Types } from 'mongoose';
import { ObjectiveSource, ObjectiveStatus } from '../constants/pms.enums';
import type {
  ObjectiveSource as ObjectiveSourceType,
  ObjectiveStatus as ObjectiveStatusType,
} from '../constants/pms.enums';

interface IPmsAttachment {
  fileName?: string;
  fileUrl?: string;
  documentId?: string;
  uploadedBy?: Types.ObjectId;
  uploadedAt?: Date;
}

export interface IObjective extends Document {
  quarterAssignmentId: Types.ObjectId;
  annualAssignmentId?: Types.ObjectId;
  cycleId?: Types.ObjectId;
  quarterCode?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  employeeId: Types.ObjectId;
  assignedManagerId: Types.ObjectId;
  objectiveNo?: number;
  source: ObjectiveSourceType;
  templateObjectiveKey?: string;
  title: string;
  description?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDate?: Date;
  weightage?: number;
  successCriteria?: string;
  status: ObjectiveStatusType;
  attachments: IPmsAttachment[];
  createdByRole: string;
  createdByUserId: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  actingDelegateUserId?: Types.ObjectId;
  originalOwnerUserId?: Types.ObjectId;
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  returnedReason?: string;
  returnedAt?: Date;
  isDeleted: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<IPmsAttachment>(
  {
    fileName: String,
    fileUrl: String,
    documentId: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: Date,
  },
  { _id: false },
);

const objectiveSchema = new Schema<IObjective>(
  {
    quarterAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'QuarterAssignment',
    },
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualAssignment',
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    quarterCode: {
      type: String,
      enum: ['Q1', 'Q2', 'Q3', 'Q4'],
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    assignedManagerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    objectiveNo: Number,
    source: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveSource),
    },
    templateObjectiveKey: {
      type: String,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: { type: String, trim: true },
    targetMetric: { type: String, trim: true },
    targetValue: { type: String, trim: true },
    targetDate: Date,
    weightage: { type: Number, min: 0, max: 100 },
    successCriteria: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveStatus),
      default: ObjectiveStatus.OBJECTIVE_DRAFT,
      index: true,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    createdByRole: {
      type: String,
      required: true,
      trim: true,
    },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    actingDelegateUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    originalOwnerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    submittedAt: Date,
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    returnedReason: String,
    returnedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'objectives',
    timestamps: true,
  },
);

objectiveSchema.index(
  { quarterAssignmentId: 1 },
  { name: 'idx_objective_quarter_assignment' },
);
objectiveSchema.index({ annualAssignmentId: 1, quarterCode: 1 });
objectiveSchema.index({ employeeId: 1, cycleId: 1 });
objectiveSchema.index({ assignedManagerId: 1, status: 1 });
objectiveSchema.index({ status: 1 });
objectiveSchema.index({ quarterAssignmentId: 1, templateObjectiveKey: 1 });

export const Objective = mongoose.model<IObjective>('Objective', objectiveSchema);
