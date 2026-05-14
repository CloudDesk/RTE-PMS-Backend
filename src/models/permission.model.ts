import { Schema, model, Document, Types } from 'mongoose';

export interface IPermission extends Document {
  userId: string | Types.ObjectId;
  user?: {
    name: string;
    email: string;
  };
  permissionDate: Date;
  hours: number; // Hours requested (e.g., 0.5, 1, 2)
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  remarks?: string;
  reason: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
  approvedById?: Types.ObjectId;
  approvedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  approvedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
}

const permissionSchema = new Schema<IPermission>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    user: {
      name: String,
      email: String,
      _id: false,
    },
    permissionDate: { type: Date, required: true },
    hours: { type: Number, required: true, min: 0.5, max: 24 }, // Min 0.5 hours, max 24 hours
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      required: true,
      default: 'Pending',
    },
    remarks: String,
    reason: { type: String, required: true },
    appliedTo: {
      _id: String,
      name: String,
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
  },
);

// Indexes for efficient queries
permissionSchema.index({ userId: 1, permissionDate: -1 });
permissionSchema.index({ status: 1 });
permissionSchema.index({ approvedById: 1 });
permissionSchema.index({ userId: 1, permissionDate: 1 }); // For monthly queries

// Validate hours is positive
permissionSchema.pre('save', function (next) {
  if (this.hours <= 0) {
    next(new Error('Hours must be greater than 0'));
  }
  if (this.hours > 24) {
    next(new Error('Hours cannot exceed 24'));
  }
  next();
});

export const Permission = model<IPermission>('Permission', permissionSchema);

