import { Schema, model, Document, Types } from 'mongoose';
import { DEFAULT_GRACE_PERIOD } from '../constants/attendance';

export interface IShift extends Document {
  name: string;
  code: string;
  startTime: string; // HH:mm format in UTC
  endTime: string; // HH:mm format in UTC
  shiftWindowStart: string; // HH:mm format in UTC, when employees can start checking in
  shiftWindowEnd: string; // HH:mm format in UTC, last allowed check-in time
  applicableForRoles: Types.ObjectId[];
  validFrom: Date; // DateTime in UTC
  validTill?: Date; // DateTime in UTC
  isActive: boolean;
  description?: string;
  graceTimeInMinutes?: number;
  createdAt: Date; // DateTime in UTC
  updatedAt: Date; // DateTime in UTC
  isOvernightShift: boolean;
}

export interface IShiftAssignment extends Document {
  userId: Types.ObjectId;
  shiftId: Types.ObjectId;
  shift: IShift;
  shiftCode: string;
  startDate: Date; // DateTime in UTC
  endDate?: Date; // DateTime in UTC
  isActive: boolean;
  status?: 'current' | 'upcoming' | 'past';
  earlyCheckInThreshold?: number; // minutes
  assignedBy: Types.ObjectId;
  assignedAt: Date; // DateTime in UTC
  weekendDays: number[],
  modifiedBy?: Types.ObjectId;
  modifiedAt?: Date; // DateTime in UTC
}

const shiftSchema = new Schema<IShift>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    startTime: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: 'Start time must be in HH:mm format (UTC)',
      },
    },
    endTime: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: 'End time must be in HH:mm format (UTC)',
      },
    },
    shiftWindowStart: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: 'Shift window start time must be in HH:mm format (UTC)',
      },
    },
    shiftWindowEnd: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: 'Shift window end time must be in HH:mm format (UTC)',
      },
    },
    applicableForRoles: [{
      type: Schema.Types.ObjectId,
      ref: 'Lov',
      required: true,
    }],
    validFrom: {
      type: Date, // Stores DateTime in UTC
      required: true,
    },
    validTill: {
      type: Date, // Stores DateTime in UTC
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    description: String,
    graceTimeInMinutes: {
      type: Number,
      min: 0,
      max: 60,
      default: DEFAULT_GRACE_PERIOD,
    },
    isOvernightShift: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true, // createdAt and updatedAt will be in UTC
  },
);

const shiftAssignmentSchema = new Schema<IShiftAssignment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    shiftId: {
      type: Schema.Types.ObjectId,
      ref: 'Shift',
      required: true,
    },
    shiftCode: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date, // Stores DateTime in UTC
      required: true,
    },
    endDate: {
      type: Date, // Stores DateTime in UTC
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    earlyCheckInThreshold: {
      type: Number,
      min: 0,
      max: 240, // 4 hours max
    },
    status: {
      type: String,
      enum: ['current', 'upcoming', 'past'],
      required: true,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    weekendDays: {
      type: [Number],
      validate: {
        validator: function (arr: number[]) {
          // Check if array exists and has valid values
          return Array.isArray(arr) &&
            arr.length > 0 &&
            arr.every(day => Number.isInteger(day) && day >= 0 && day <= 6);
        },
        message: 'Weekend days must be an array of numbers between 0 and 6'
      },
      default: [0] // Default to Sunday
    },
    assignedAt: {
      type: Date, // Stores DateTime in UTC
      required: true,
      default: () => new Date(),
    },
    modifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    modifiedAt: {
      type: Date, // Stores DateTime in UTC
    },
  },
  {
    timestamps: true, // createdAt and updatedAt will be in UTC
  },
);

// Indexes for efficient queries
shiftSchema.index({ code: 1 }, { unique: true });
shiftSchema.index({ isActive: 1 });
shiftSchema.index({ validFrom: 1, validTill: 1 });
shiftSchema.index({ applicableForRoles: 1 });

shiftAssignmentSchema.index({ userId: 1, startDate: -1 });
shiftAssignmentSchema.index({ shiftId: 1 });
shiftAssignmentSchema.index({ isActive: 1 });
shiftAssignmentSchema.index({ userId: 1, shiftCode: 1, startDate: 1 });

// Validate end time is after start time and shift window times
shiftSchema.pre('save', function (next) {
  const startParts = this.startTime.split(':').map(Number);
  const endParts = this.endTime.split(':').map(Number);
  const windowStartParts = this.shiftWindowStart.split(':').map(Number);
  const windowEndParts = this.shiftWindowEnd.split(':').map(Number);

  const startMinutes = startParts[0] * 60 + startParts[1];
  const endMinutes = endParts[0] * 60 + endParts[1];
  const windowStartMinutes = windowStartParts[0] * 60 + windowStartParts[1];
  const windowEndMinutes = windowEndParts[0] * 60 + windowEndParts[1];

  // Validate shift window start is before shift start
  if (windowStartMinutes > startMinutes) {
    next(new Error('Shift window start time must be before or equal to shift start time'));
    return;
  }

  // Validate shift window end is after shift start
  if (windowEndMinutes < startMinutes) {
    next(new Error('Shift window end time must be after shift start time'));
    return;
  }

  // Validate shift end is after shift start for regular shifts
  if (endMinutes <= startMinutes && !this.isOvernightShift) {
    next(new Error('Shift end time must be after shift start time'));
    return;
  }

  // For overnight shifts, ensure end time is less than start time
  if (this.isOvernightShift && endMinutes > startMinutes) {
    next(new Error('For overnight shifts, end time must be on the next day (less than start time)'));
    return;
  }

  next();
});

// Validate no overlapping assignments for the same user
shiftAssignmentSchema.pre('save', async function (next) {
  if (!this.isModified('startDate') && !this.isModified('endDate')) {
    return next();
  }

  const ShiftAssignmentModel = model<IShiftAssignment>('ShiftAssignment');
  const overlappingAssignment = await ShiftAssignmentModel.findOne({
    userId: this.userId,
    shiftCode: this.shiftCode,
    _id: { $ne: this._id },
    status: 'current',
    $or: [
      {
        startDate: { $lte: this.startDate },
        $or: [
          { endDate: { $gte: this.startDate } },
          { endDate: null },
        ],
      },
      {
        startDate: { $lte: this.endDate || this.startDate },
        $or: [
          { endDate: { $gte: this.endDate || this.startDate } },
          { endDate: null },
        ],
      },
    ],
  });

  if (overlappingAssignment) {
    next(new Error('User already has an active shift assignment during this period'));
  }
  next();
});

export const Shift = model<IShift>('Shift', shiftSchema);
export const ShiftAssignment = model<IShiftAssignment>('ShiftAssignment', shiftAssignmentSchema); 