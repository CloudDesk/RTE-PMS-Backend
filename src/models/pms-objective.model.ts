import mongoose, { Document, Schema, Types } from 'mongoose';
import { ObjectiveSource, QuarterWorkflowState } from '../constants/pms.enums';
import type {
  ObjectiveSource as ObjectiveSourceType,
  QuarterWorkflowState as QuarterWorkflowStateType,
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
  employeeId: Types.ObjectId;
  managerId: Types.ObjectId;
  source: ObjectiveSourceType;
  title: string;
  description?: string;
  targetMetric?: string;
  targetDate?: Date;
  weightage?: number;
  successCriteria?: string;
  workflowState: QuarterWorkflowStateType;
  attachments: IPmsAttachment[];
  createdBy: Types.ObjectId;
  submittedAt?: Date;
  approvedAt?: Date;
  returnedReason?: string;
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
    source: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveSource),
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: { type: String, trim: true },
    targetMetric: { type: String, trim: true },
    targetDate: Date,
    weightage: { type: Number, min: 0, max: 100 },
    successCriteria: { type: String, trim: true },
    workflowState: {
      type: String,
      required: true,
      enum: Object.values(QuarterWorkflowState),
      default: QuarterWorkflowState.OBJECTIVE_DRAFT,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    submittedAt: Date,
    approvedAt: Date,
    returnedReason: String,
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

export const Objective = mongoose.model<IObjective>('Objective', objectiveSchema);
