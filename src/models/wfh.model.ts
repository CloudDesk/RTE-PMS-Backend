import { Schema, model, Document, Types } from 'mongoose';

export interface IWFH extends Document {
  userId: string | Types.ObjectId;
  user?: {
    name: string;
    email: string;
  };
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
  rejectedAt?: Date;
  cancelledAt?: Date;
  // Weekend and holiday exclusion information for UI display + noOfDays accuracy
  weekendExclusion?: {
    weekendDays: number[];    // Weekend day numbers (0=Sunday, 6=Saturday) per the assigned WeekendCalendar
    excludedDates: Date[];    // All dates excluded from the range (weekends + mandatory holidays)
    excludedHolidays?: Date[]; // Only the mandatory holidays that were excluded
    totalCalendarDays: number; // Raw calendar days between startDate and endDate (inclusive)
    actualDays: number;        // Working days after exclusions (= noOfDays)
  };
  // Apply on behalf feature
  appliedOnBehalf?: boolean; // true if applied by admin on behalf of employee
  appliedBy?: {
    _id: string | Types.ObjectId; // ID of person who applied (employee or admin)
    name: string;
    email: string;
  };
  // Dual approval for applied on behalf
  managerApproved?: boolean;          // Manager approval status
  managerApprovedById?: Types.ObjectId; // Manager who approved
  managerApprovedAt?: Date;           // Manager approval timestamp
  adminApproved?: boolean;            // Admin approval status
  adminApprovedById?: Types.ObjectId; // Admin who approved
  adminApprovedAt?: Date;             // Admin approval timestamp
  // Document attachments (optional, for apply on behalf)
  documents?: Array<{
    fileName: string;
    filePath: string;
    uploadDate: Date;
    uploadedBy?: Types.ObjectId;
  }>;
}

const wfhSchema = new Schema<IWFH>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    user: {
      name: String,
      email: String,
      _id: false,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    noOfDays: { type: Number, required: true, min: 0.5 },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      required: true,
      default: 'Pending',
    },
    remarks: String,
    reason: { type: String, required: false },
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
    // Weekend and holiday exclusion information for UI display + noOfDays accuracy
    weekendExclusion: {
      weekendDays: {
        type: [Number],
        default: undefined,
      },
      excludedDates: {
        type: [Date],
        default: undefined,
      },
      excludedHolidays: {
        type: [Date],
        default: undefined,
      },
      totalCalendarDays: {
        type: Number,
        default: undefined,
      },
      actualDays: {
        type: Number,
        default: undefined,
      },
    },
    // Apply on behalf feature
    appliedOnBehalf: {
      type: Boolean,
      default: false,
    },
    appliedBy: {
      _id: { type: Schema.Types.ObjectId, ref: 'User' },
      name: String,
      email: String,
    },
    // Dual approval for applied on behalf
    managerApproved: {
      type: Boolean,
      default: false,
    },
    managerApprovedById: { type: Schema.Types.ObjectId, ref: 'User' },
    managerApprovedAt: Date,
    adminApproved: {
      type: Boolean,
      default: false,
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
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
wfhSchema.index({ userId: 1, startDate: -1 });
wfhSchema.index({ status: 1 });
wfhSchema.index({ approvedById: 1 });

// Validate end date is after start date
wfhSchema.pre('save', function (next) {
  if (this.endDate < this.startDate) {
    return next(new Error('End date must be after start date'));
  }
  next();
});

/**
 * Ensure noOfDays is consistent with weekendExclusion data.
 *
 * - If weekendExclusion is provided by the service layer (after computing
 *   excluded weekends + mandatory holidays), sync noOfDays = actualDays.
 * - If weekendExclusion is NOT provided (simple WFH request without
 *   calendar configuration), noOfDays must be a positive multiple of 0.5
 *   that does not exceed the inclusive calendar day count.
 */
wfhSchema.pre('save', function (next) {
  const MS_PER_DAY = 86_400_000;
  const inclusiveCalendarDays =
    Math.round((this.endDate.getTime() - this.startDate.getTime()) / MS_PER_DAY) + 1;

  if (this.weekendExclusion) {
    const we = this.weekendExclusion;

    // Keep totalCalendarDays in sync with the actual date range
    if (!we.totalCalendarDays || we.totalCalendarDays !== inclusiveCalendarDays) {
      we.totalCalendarDays = inclusiveCalendarDays;
    }

    // actualDays must be a positive multiple of 0.5 and cannot exceed total
    if (!we.actualDays || we.actualDays <= 0) {
      return next(new Error('weekendExclusion.actualDays must be a positive number'));
    }
    if (we.actualDays > we.totalCalendarDays) {
      return next(
        new Error(
          `weekendExclusion.actualDays (${we.actualDays}) cannot exceed totalCalendarDays (${we.totalCalendarDays})`,
        ),
      );
    }

    // Sync noOfDays with the computed actual working days
    this.noOfDays = we.actualDays;
  } else {
    // No exclusion data – basic sanity check
    if (this.noOfDays <= 0 || this.noOfDays % 0.5 !== 0) {
      return next(new Error('noOfDays must be a positive multiple of 0.5 (e.g. 0.5, 1, 1.5 …)'));
    }
    if (this.noOfDays > inclusiveCalendarDays) {
      return next(
        new Error(
          `noOfDays (${this.noOfDays}) cannot exceed the total calendar days in the range (${inclusiveCalendarDays})`,
        ),
      );
    }
  }

  next();
});

export const WFH = model<IWFH>('WFH', wfhSchema);
