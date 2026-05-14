import { Schema, model, Document, Types } from 'mongoose';

export interface ILeaveRelease extends Document {
  employeeId: Types.ObjectId;
  releaseType: 'monthly' | 'quarterly' | 'annual' | 'carryforward'; // monthly = 1 month, quarterly = 3 months, annual = yearly allocation, carryforward = year-end carry forward
  period: {
    month?: number;      // 1-12 (required for monthly)
    quarter?: number;    // 1-4 (required for quarterly, Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)
    year: number;        // Required for all types. For carryforward, this is the toYear (year the leaves are carried forward to)
  };
  leaveType: 'annual' | 'sick' | 'compOff' | 'lossOfPay' | 'otherPaid' | 'otherUnpaid' | 'restricted_holiday';
  daysReleased: number;  // Can be decimal (e.g., 4.5)

  releasedAt: Date;
  releasedBy: Types.ObjectId;  // Admin user
  notes?: string;
}

const leaveReleaseSchema = new Schema<ILeaveRelease>(
  {
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    releaseType: {
      type: String,
      enum: ['monthly', 'quarterly', 'annual', 'carryforward'],
      required: true
    },
    period: {
      month: {
        type: Number,
        min: 1,
        max: 12,
        required: function (this: ILeaveRelease) {
          // Month is required only for monthly release (not for annual or restricted_holiday)
          return this.releaseType === 'monthly' && this.leaveType !== 'restricted_holiday';
        }
      },
      quarter: {
        type: Number,
        min: 1,
        max: 4,
        required: function (this: ILeaveRelease) {
          return this.releaseType === 'quarterly';
        }
      },
      // For carryforward type, month and quarter are not required
      // period.year represents the toYear (year the leaves are carried forward to)
      year: { type: Number, required: true }
    },
    leaveType: {
      type: String,
      enum: ['annual', 'sick', 'compOff', 'lossOfPay', 'otherPaid', 'otherUnpaid', 'restricted_holiday'],
      required: true
    },
    daysReleased: {
      type: Number,
      required: true,
      min: 0
    },
    releasedAt: {
      type: Date,
      default: Date.now
    },
    releasedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    notes: String
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
leaveReleaseSchema.index({ employeeId: 1, 'period.year': -1 });
leaveReleaseSchema.index({ releaseType: 1, 'period.year': 1 });

// Validate period based on release type
leaveReleaseSchema.pre('save', function (next) {
  if (this.releaseType === 'monthly') {
    // For restricted_holiday, month is optional, only year is required
    if (this.leaveType !== 'restricted_holiday' && !this.period.month) {
      return next(new Error('Month is required for monthly release'));
    }
    if (this.period.quarter) {
      return next(new Error('Quarter should not be set for monthly release'));
    }
  }
  if (this.releaseType === 'quarterly') {
    if (!this.period.quarter) {
      return next(new Error('Quarter is required for quarterly release'));
    }
    if (this.period.month) {
      return next(new Error('Month should not be set for quarterly release'));
    }
  }
  if (this.releaseType === 'annual') {
    // For annual release, only year is required, month and quarter should not be set
    if (this.period.month) {
      return next(new Error('Month should not be set for annual release'));
    }
    if (this.period.quarter) {
      return next(new Error('Quarter should not be set for annual release'));
    }
    // period.year is required and represents the year for annual allocation
  }
  if (this.releaseType === 'carryforward') {
    // For carryforward, month and quarter should not be set
    if (this.period.month) {
      return next(new Error('Month should not be set for carryforward release'));
    }
    if (this.period.quarter) {
      return next(new Error('Quarter should not be set for carryforward release'));
    }
    // period.year is required and represents the toYear (year the leaves are carried forward to)
  }
  next();
});

export const LeaveRelease = model<ILeaveRelease>('LeaveRelease', leaveReleaseSchema);

