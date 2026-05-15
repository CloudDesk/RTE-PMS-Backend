import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IObjectiveEvidence extends Document {
  objectiveId: Types.ObjectId;
  quarterAssignmentId: Types.ObjectId;
  annualAssignmentId: Types.ObjectId;
  cycleId: Types.ObjectId;
  quarterCode: 'Q1' | 'Q2' | 'Q3' | 'Q4';
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
    quarterAssignmentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'QuarterAssignment',
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
    quarterCode: {
      type: String,
      required: true,
      enum: ['Q1', 'Q2', 'Q3', 'Q4'],
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
objectiveEvidenceSchema.index({ quarterAssignmentId: 1, createdAt: -1 });
objectiveEvidenceSchema.index({ cycleId: 1, employeeId: 1 });

export const ObjectiveEvidence = mongoose.model<IObjectiveEvidence>(
  'ObjectiveEvidence',
  objectiveEvidenceSchema,
);
