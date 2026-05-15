import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IVisibilityConfiguration extends Document {
  annualAssignmentId: Types.ObjectId;
  cycleId: Types.ObjectId;
  employeeId: Types.ObjectId;
  employeeReviewVisible: boolean;
  employeeGradeVisible: boolean;
  employeeMeritVisible: boolean;
  managerGradeVisible: boolean;
  managerMeritVisible: boolean;
  visibleFrom?: Date;
  enabledBy?: Types.ObjectId;
  enabledAt?: Date;
  disabledBy?: Types.ObjectId;
  disabledAt?: Date;
  reason?: string;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

const visibilityConfigurationSchema = new Schema<IVisibilityConfiguration>(
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
    employeeReviewVisible: { type: Boolean, default: false },
    employeeGradeVisible: { type: Boolean, default: false },
    employeeMeritVisible: { type: Boolean, default: false },
    managerGradeVisible: { type: Boolean, default: false },
    managerMeritVisible: { type: Boolean, default: false },
    visibleFrom: Date,
    enabledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    enabledAt: Date,
    disabledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    disabledAt: Date,
    reason: String,
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'visibility_configurations',
    timestamps: true,
  },
);

visibilityConfigurationSchema.index(
  { annualAssignmentId: 1 },
  { unique: true, name: 'idx_visibility_annual_assignment' },
);
visibilityConfigurationSchema.index({ cycleId: 1 });
visibilityConfigurationSchema.index({ employeeId: 1 });

export const VisibilityConfiguration = mongoose.model<IVisibilityConfiguration>(
  'VisibilityConfiguration',
  visibilityConfigurationSchema,
);
