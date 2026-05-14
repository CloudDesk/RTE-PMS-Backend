import { Schema, model, Document, Types } from 'mongoose';

export interface IShiftChangeRequest extends Document {
  userId: Types.ObjectId;
  user?: {
    name: string;
    email: string;
  };
  currentShiftId: Types.ObjectId; // Reference to ShiftAssignment._id
  requestedShiftId: Types.ObjectId; // Reference to Shift._id
  effectiveDate: Date;
  reason: string;
  remarks?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  appliedTo: {
    _id: Types.ObjectId;
    name: string;
  };
  approvedById?: Types.ObjectId;
  approvedBy?: {
    _id: Types.ObjectId;
    name: string;
    email: string;
  };
  approvedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const shiftChangeRequestSchema = new Schema<IShiftChangeRequest>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    currentShiftId: {
      type: Schema.Types.ObjectId,
      ref: 'ShiftAssignment',
      required: true,
    },
    requestedShiftId: {
      type: Schema.Types.ObjectId,
      ref: 'Shift',
      required: true,
    },
    effectiveDate: {
      type: Date,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    user: {
      name: String,
      email: String,
      _id: false,
    },
    appliedTo: {
      _id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
    },
    approvedById: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: {
      _id: { type: Schema.Types.ObjectId, ref: 'User' },
      name: String,
      email: String,
    },
    approvedAt: Date,
    rejectedAt: Date,
    cancelledAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
shiftChangeRequestSchema.index({ userId: 1, effectiveDate: -1 });
shiftChangeRequestSchema.index({ status: 1 });
shiftChangeRequestSchema.index({ approvedById: 1 });
shiftChangeRequestSchema.index({ 'appliedTo._id': 1, status: 1 });
shiftChangeRequestSchema.index({ userId: 1, effectiveDate: 1, status: 1 }); // For duplicate prevention

export const ShiftChangeRequest = model<IShiftChangeRequest>(
  'ShiftChangeRequest',
  shiftChangeRequestSchema
);

