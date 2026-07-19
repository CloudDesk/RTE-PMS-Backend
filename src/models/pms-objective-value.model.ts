import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IObjectiveValue extends Document {
  objectiveId: Types.ObjectId;
  termAssignmentId: Types.ObjectId;
  annualAssignmentId?: Types.ObjectId;
  cycleId?: Types.ObjectId;
  employeeId: Types.ObjectId;
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
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const objectiveValueSchema = new Schema<IObjectiveValue>(
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
      ref: 'AnnualAssignment',
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
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'objective_values',
    timestamps: true,
  },
);

objectiveValueSchema.index({
  objectiveId: 1,
  fieldKey: 1,
  roleCode: 1,
  actorUserId: 1,
});
objectiveValueSchema.index({ termAssignmentId: 1, sectionKey: 1 });
objectiveValueSchema.index({ cycleId: 1, employeeId: 1 });
objectiveValueSchema.index({ fieldKey: 1, roleCode: 1 });
objectiveValueSchema.index(
  {
    objectiveId: 1,
    fieldKey: 1,
    roleCode: 1,
    actorUserId: 1,
    workflowStage: 1,
    isDeleted: 1,
  },
  { name: 'idx_objective_value_matrix_identity' },
);
objectiveValueSchema.index(
  { annualAssignmentId: 1, termAssignmentId: 1, fieldKey: 1, isDeleted: 1 },
  { name: 'idx_objective_value_matrix_assignment' },
);
objectiveValueSchema.index(
  { objectiveId: 1, fieldKey: 1, roleCode: 1, isDeleted: 1 },
  {
    name: 'uq_objective_value_template_seed_active',
    unique: true,
    partialFilterExpression: { isDeleted: false, roleCode: 'SYSTEM' },
  },
);

export const ObjectiveValue = mongoose.model<IObjectiveValue>(
  'ObjectiveValue',
  objectiveValueSchema,
);
