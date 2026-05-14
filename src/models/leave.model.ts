import { Schema, model, Document, Types } from 'mongoose';

export interface ILeave extends Document {
  userId: string | Types.ObjectId;
  user?: {
    name: string;
    email: string;
  };
  leaveTypeId: Types.ObjectId;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  noOfDays: number;
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
  // India-specific: Half-day leave support
  leaveDuration?: 'full-day' | 'half-day'; // Default: 'full-day'
  halfDayType?: 'first-half' | 'second-half'; // Required when leaveDuration = 'half-day'
  // Weekend and holiday exclusion information for UI display
  weekendExclusion?: {
    weekendDays: number[]; // Array of weekend day numbers (0=Sunday, 6=Saturday)
    excludedDates: Date[]; // Array of dates that were excluded (weekend dates + mandatory holidays)
    excludedHolidays?: Date[]; // Array of mandatory holiday dates that were excluded
    totalCalendarDays: number; // Total calendar days in the requested range
    actualDays: number; // Actual  days after excluding weekends and mandatory holidays (same as noOfDays)
  };
  // Apply on behalf feature
  appliedOnBehalf?: boolean; // true if applied by admin on behalf of employee
  appliedBy?: {
    _id: string | Types.ObjectId; // ID of person who applied (employee or admin)
    name: string;
    email: string;
  };
  // Dual approval for applied on behalf
  managerApproved?: boolean; // Manager approval status
  managerApprovedById?: Types.ObjectId; // Manager who approved
  managerApprovedAt?: Date; // Manager approval timestamp
  adminApproved?: boolean; // Admin approval status
  adminApprovedById?: Types.ObjectId; // Admin who approved
  adminApprovedAt?: Date; // Admin approval timestamp
  // Document attachments (optional, for apply on behalf)
  documents?: Array<{
    fileName: string;
    filePath: string;
    uploadDate: Date;
    uploadedBy?: Types.ObjectId;
  }>;
}

const leaveSchema = new Schema<ILeave>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    user: {
      name: String,
      email: String,
      _id: false,
    },
    leaveTypeId: { type: Schema.Types.ObjectId, required: true, ref: 'Lov' },
    leaveType: String,
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      required: true,
      default: 'Pending',
    },
    remarks: String,
    reason: String,
    appliedTo: {
      _id: String,
      name: String,
    },
    noOfDays: Number,
    approvedById: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: {
      _id: { type: Schema.Types.ObjectId, ref: 'User' },
      name: String,
      email: String,

    },
    approvedAt: Date,
    // Apply on behalf feature
    appliedOnBehalf: {
      type: Boolean,
      default: false
    },
    appliedBy: {
      _id: { type: Schema.Types.ObjectId, ref: 'User' },
      name: String,
      email: String,
    },
    // Dual approval for applied on behalf
    managerApproved: {
      type: Boolean,
      default: false
    },
    managerApprovedById: { type: Schema.Types.ObjectId, ref: 'User' },
    managerApprovedAt: Date,
    adminApproved: {
      type: Boolean,
      default: false
    },
    adminApprovedById: { type: Schema.Types.ObjectId, ref: 'User' },
    adminApprovedAt: Date,
    // Document attachments (optional, for apply on behalf)
    documents: [{
      fileName: { type: String, required: true },
      filePath: { type: String, required: true },
      uploadDate: { type: Date, default: Date.now },
      uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    }],
    // India-specific: Half-day leave support
    leaveDuration: {
      type: String,
      enum: ['full-day', 'half-day'],
      default: 'full-day'
    },
    halfDayType: {
      type: String,
      enum: ['first-half', 'second-half'],
      required: function (this: ILeave) {
        return this.leaveDuration === 'half-day';
      }
    },
    // Weekend and holiday exclusion information for UI display
    weekendExclusion: {
      weekendDays: {
        type: [Number],
        default: undefined
      },
      excludedDates: {
        type: [Date],
        default: undefined
      },
      excludedHolidays: {
        type: [Date],
        default: undefined
      },
      totalCalendarDays: {
        type: Number,
        default: undefined
      },
      actualDays: {
        type: Number,
        default: undefined
      }
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
leaveSchema.index({ userId: 1, startDate: -1 });
leaveSchema.index({ status: 1 });
leaveSchema.index({ approvedById: 1 });

// Validate end date is after start date
leaveSchema.pre('save', function (next) {
  if (this.endDate < this.startDate) {
    next(new Error('End date must be after start date'));
  }
  next();
});

// India-specific: Validate half-day leave rules
leaveSchema.pre('save', async function (next) {
  // Only validate half-day rules if leaveDuration is 'half-day'
  if (this.leaveDuration === 'half-day') {
    // For half-day leave, startDate must equal endDate (same day)
    const startDateStr = new Date(this.startDate).toDateString();
    const endDateStr = new Date(this.endDate).toDateString();

    if (startDateStr !== endDateStr) {
      return next(new Error('Half-day leaves must be on the same day (startDate = endDate)'));
    }

    // halfDayType must be specified
    if (!this.halfDayType) {
      return next(new Error('halfDayType is required for half-day leaves'));
    }

    // noOfDays must be exactly 0.5
    if (this.noOfDays !== 0.5) {
      return next(new Error('Half-day leaves must have noOfDays = 0.5'));
    }
  }

  // For full-day leaves, halfDayType should not be set
  if (this.leaveDuration === 'full-day' && this.halfDayType) {
    return next(new Error('halfDayType should not be set for full-day leaves'));
  }

  next();
});

export const Leave = model<ILeave>('Leave', leaveSchema); 