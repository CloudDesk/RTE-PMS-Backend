import mongoose, { Document, Schema, Types } from 'mongoose';
import { AssessmentTermCode } from '../constants/pms.enums';
import type { AssessmentTermCode as AssessmentTermCodeType } from '../constants/pms.enums';

export interface IObjectiveEvidence extends Document {
  objectiveId: Types.ObjectId;
  termAssignmentId: Types.ObjectId;
  annualAssignmentId: Types.ObjectId;
  cycleId: Types.ObjectId;
  assessmentTermCode: AssessmentTermCodeType;
  employeeId: Types.ObjectId;
  evidenceType: string;
  title: string;
  description?: string;
  attachmentIds: Types.ObjectId[];
  submittedByRole: string;
  submittedBy: Types.ObjectId;
  submittedAt?: Date;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const objectiveEvidenceSchema = new Schema<IObjectiveEvidence>(
  {
    objectiveId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Objective',
      index: true,
    },
    termAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'TermAssignment',
      index: true,
    },
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
    assessmentTermCode: {
      type: String,
      required: true,
      enum: Object.values(AssessmentTermCode),
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    evidenceType: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    attachmentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'ObjectiveAttachment' }],
      default: [],
    },
    submittedByRole: { type: String, required: true, trim: true },
    submittedBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    submittedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'objective_evidence',
    timestamps: true,
  },
);

objectiveEvidenceSchema.index({ objectiveId: 1 });
objectiveEvidenceSchema.index({ termAssignmentId: 1, createdAt: -1 });
objectiveEvidenceSchema.index({ cycleId: 1, employeeId: 1 });

export const ObjectiveEvidence = mongoose.model<IObjectiveEvidence>(
  'ObjectiveEvidence',
  objectiveEvidenceSchema,
);
