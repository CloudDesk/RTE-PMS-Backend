import mongoose, { Document, Schema, Types } from 'mongoose';

export const PmsEmployeeCareerProfileChangeAction = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
} as const;

export type PmsEmployeeCareerProfileChangeAction =
  (typeof PmsEmployeeCareerProfileChangeAction)[keyof typeof PmsEmployeeCareerProfileChangeAction];

export interface IPmsEmployeeCareerProfileChange extends Document {
  employeeId: Types.ObjectId;
  profileId: Types.ObjectId;
  action: PmsEmployeeCareerProfileChangeAction;
  reason: string;
  previousVersion: number;
  newVersion: number;
  beforeValue?: Record<string, unknown>;
  afterValue: Record<string, unknown>;
  changedBy: Types.ObjectId;
  changedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pmsEmployeeCareerProfileChangeSchema =
  new Schema<IPmsEmployeeCareerProfileChange>(
    {
      employeeId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      profileId: {
        type: Schema.Types.ObjectId,
        ref: 'PmsEmployeeCareerProfile',
        required: true,
      },
      action: {
        type: String,
        required: true,
        enum: Object.values(PmsEmployeeCareerProfileChangeAction),
      },
      reason: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 500,
      },
      previousVersion: { type: Number, required: true, min: 0 },
      newVersion: { type: Number, required: true, min: 1 },
      beforeValue: { type: Schema.Types.Mixed },
      afterValue: { type: Schema.Types.Mixed, required: true },
      changedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      changedAt: { type: Date, required: true, default: Date.now },
    },
    {
      collection: 'pms_employee_career_profile_changes',
      timestamps: true,
    },
  );

pmsEmployeeCareerProfileChangeSchema.index({
  employeeId: 1,
  changedAt: -1,
});
pmsEmployeeCareerProfileChangeSchema.index({
  profileId: 1,
  newVersion: -1,
});
pmsEmployeeCareerProfileChangeSchema.index({ changedBy: 1, changedAt: -1 });

export const PmsEmployeeCareerProfileChange =
  mongoose.model<IPmsEmployeeCareerProfileChange>(
    'PmsEmployeeCareerProfileChange',
    pmsEmployeeCareerProfileChangeSchema,
  );
