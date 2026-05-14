import { Schema, model, Document, Types } from 'mongoose';

interface IPermissionSummaryDetail {
  alloted: number; // Total hours allotted per month (e.g., 2 hours)
  availed: number; // Total hours used this month
  remaining: number; // Remaining hours (alloted - availed)
  permissionRequests: Types.ObjectId[]; // Array of permission request IDs
}

export interface IPermissionSummary extends Document {
  userId: Types.ObjectId;
  year: number;
  month: number; // 1-12 (January = 1, December = 12)
  permissions: IPermissionSummaryDetail;
  createdAt: Date;
  updatedAt: Date;
}

const permissionSummaryDetailSchema = new Schema<IPermissionSummaryDetail>({
  alloted: { type: Number, default: 0 },
  availed: { type: Number, default: 0 },
  remaining: { type: Number, default: 0 },
  permissionRequests: [{ type: Schema.Types.ObjectId, ref: 'Permission' }],
});

const permissionSummarySchema = new Schema<IPermissionSummary>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    permissions: permissionSummaryDetailSchema,
  },
  {
    timestamps: true,
  },
);

// Create compound index for userId, year, and month to ensure unique combination
permissionSummarySchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

// Pre-save hook to calculate remaining hours
permissionSummarySchema.pre('save', function (this: IPermissionSummary & Document, next) {
  if (this.permissions) {
    this.permissions.remaining = Math.max(0, this.permissions.alloted - this.permissions.availed);
  }
  next();
});

export const PermissionSummary = model<IPermissionSummary>('PermissionSummary', permissionSummarySchema);

