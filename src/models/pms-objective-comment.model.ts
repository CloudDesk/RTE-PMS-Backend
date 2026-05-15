import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IObjectiveComment extends Document {
  objectiveId: Types.ObjectId;
  quarterAssignmentId: Types.ObjectId;
  annualAssignmentId?: Types.ObjectId;
  cycleId?: Types.ObjectId;
  quarterCode?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  employeeId?: Types.ObjectId;
  commentType: string;
  commentText: string;
  actorUserId: Types.ObjectId;
  actorRole: string;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const objectiveCommentSchema = new Schema<IObjectiveComment>(
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
      ref: 'User',
      index: true,
    },
    commentType: { type: String, required: true, trim: true },
    commentText: { type: String, required: true, trim: true },
    actorUserId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    actorRole: { type: String, required: true, trim: true },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'objective_comments',
    timestamps: true,
  },
);

objectiveCommentSchema.index({ objectiveId: 1, createdAt: -1 });
objectiveCommentSchema.index({ quarterAssignmentId: 1, createdAt: -1 });

export const ObjectiveComment = mongoose.model<IObjectiveComment>(
  'ObjectiveComment',
  objectiveCommentSchema,
);
