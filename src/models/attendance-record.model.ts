import { Schema, model, Document, Types } from 'mongoose';

export interface IAttendanceRecord extends Document {
  userId: Types.ObjectId;
  shiftId: Types.ObjectId;
  shiftCode: string;
  shiftDay: Date; // DateTime in UTC, normalized to start of day
  shiftStart: Date; // DateTime in UTC
  shiftEnd: Date; // DateTime in UTC
  swipes: {
    timestamp: Date; // DateTime in UTC
    direction?: 'IN' | 'OUT';
    deviceId?: string;
    location?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: number;
      address: string;
    };
  }[];
  firstIn: Date | null;    // First IN swipe of the day
  lastOut: Date | null;    // Last OUT swipe of the day

  isWithinWindow: boolean;
  isLateEntry: boolean;
  isEarlyExit: boolean;
  isWFH: boolean;
  halfType?: 'First Half' | 'Second Half';
  needsRegularization: boolean;
  totalWorkHours: string;     // Total hours between first IN and last OUT
  breakHours: string;         // Automatically calculated break time
  actualWorkHours: string;    // Total work hours minus break hours
  shiftHours: string;         // Standard shift duration
  shortfallHours: string;     // Replaces shortTime - better naming
  excessHours: string;        // Replaces overtime - better naming
  overtimeStart?: Date;       // When overtime started (UTC)
  overtimeEnd?: Date;         // When overtime ended (UTC)

  status: 'incomplete' | 'complete' | 'duplicate_swipes' | 'missing_checkout' | 'holiday_swipe' | "leave_swipe" | 'pending_regularization' | 'regularized' | 'overridden';
  attendanceStatus: ('Present' | 'Late' | 'On-Time' | 'Early-Exit' | 'Absent' | 'On-Leave' | 'Out-Of-Window' | 'Holiday-Swipe' | 'Pending-Regularization' | 'Regularized' | 'OT' | 'Override')[];
  outOfWindowSwipes: {
    timestamp: Date; // DateTime in UTC
    direction?: 'IN' | 'OUT';
    deviceId?: string;
    location?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: number;
      address: string;
    };
    reason?: string;
  }[];
  //| 'Pending-Regularization' | 'Regularized' | 'Partial-Day' | 'IncorrectSwipe' | 'MultipleIssues'
  regularization?: {
    isRegularized: boolean;
    hasRegularizationRequest: boolean;
    regularizedAt?: Date;
    regularizedBy?: Types.ObjectId; // Reference to user who approved
    regularizationType?: ('Late' | 'On-Time' | 'Early-Exit' | 'Absent' | 'On-Leave' | 'Out-Of-Window' | 'Holiday-Swipe'
      | 'Pending-Regularization' | 'Regularized'
    )[];
    remarks?: string;
    status: 'Pending' | 'Approved' | 'Rejected-Absent' | 'Rejected-Leave';
    regularizationId: Types.ObjectId;
  }
  override?: {
    isOverridden: boolean;
    overriddenAt: Date;
    overriddenBy: Types.ObjectId;
    lastModifiedAt?: Date;
    lastModifiedBy?: Types.ObjectId;
    reason: string;
    remarks?: string;
    originalStatus?: string;
    originalAttendanceStatus?: string[];
    originalFirstIn?: Date | null;
    originalLastOut?: Date | null;
    originalTotalWorkHours?: string;
    originalActualWorkHours?: string;
    overrideHistory?: Array<{
      action: 'created' | 'modified' | 'removed';
      performedBy: Types.ObjectId;
      performedAt: Date;
      changes?: Array<{
        field: string;
        oldValue: any;
        newValue: any;
      }>;
      reason?: string;
    }>;
  };
  createdAt: Date; // DateTime in UTC
  updatedAt: Date; // DateTime in UTC
}

const attendanceRecordSchema = new Schema<IAttendanceRecord>(
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
    shiftDay: {
      type: Date, // Stores DateTime in UTC
      required: true,
    },
    shiftStart: {
      type: Date, // Stores DateTime in UTC
      required: true,
    },
    shiftEnd: {
      type: Date, // Stores DateTime in UTC
      required: true,
    },
    swipes: [{
      timestamp: {
        type: Date, // Stores DateTime in UTC
        required: true,
      },
      direction: {
        type: String,
        enum: ['IN', 'OUT'],
        required: true,
      },
      deviceId: {
        type: String,
        required: true,
      },
      location: {
        latitude: { type: Number },
        longitude: { type: Number },
        accuracy: { type: Number },
        altitude: { type: Number },
        address: { type: String },
      },
    }],
    isWithinWindow: {
      type: Boolean,
      default: false,
    },
    isLateEntry: {
      type: Boolean,
      default: false,
    },
    isEarlyExit: {
      type: Boolean,
      default: false,
    },
    isWFH: {
      type: Boolean,
      default: false,
    },
    halfType: {
      type: String,
      enum: ['First Half', 'Second Half'],
    },
    needsRegularization: {
      type: Boolean,
      default: false,
    },
    firstIn: {
      type: Date
    },
    lastOut: {
      type: Date
    },
    excessHours: {
      type: String,
      default: '0:00:00',
    },
    overtimeStart: {
      type: Date, // When overtime started (UTC)
    },
    overtimeEnd: {
      type: Date, // When overtime ended (UTC)
    },
    shortfallHours: {
      type: String,
      default: '0:00:00',
    },
    totalWorkHours: {
      type: String,
      default: '0:00:00',
    },
    breakHours: {
      type: String,
      default: '0:00:00',
    },
    actualWorkHours: {
      type: String,
      default: '0:00:00',
    },
    shiftHours: {
      type: String,
      default: '0:00:00',
    },
    status: {
      type: String,
      enum: ['incomplete', 'complete', 'duplicate_swipes', 'missing_checkout', 'holiday_swipe',
        'leave_swipe', 'pending_regularization', 'regularized', 'overridden'
      ],
      default: 'incomplete',
    },
    attendanceStatus: [{
      type: String,
      enum: ['Present', 'Late', 'On-Time', 'Early-Exit', 'Absent', 'On-Leave', 'Out-Of-Window', 'Holiday-Swipe', 'Pending-Regularization', 'Regularized', 'OT', 'Override'],
    }],
    outOfWindowSwipes: [{
      timestamp: {
        type: Date, // Stores DateTime in UTC
        required: true,
      },
      direction: {
        type: String,
        enum: ['IN', 'OUT'],
        required: true,
      },
      deviceId: {
        type: String,
        required: true,
      },
      location: {
        latitude: { type: Number },
        longitude: { type: Number },
        accuracy: { type: Number },
        altitude: { type: Number },
        address: { type: String },
      },
      reason: {
        type: String
      }
    }],
    regularization: {
      isRegularized: {
        type: Boolean,
        default: false,
      },
      hasRegularizationRequest: {
        type: Boolean,
        default: false,
      },
      regularizedAt: {
        type: Date,
      },
      regularizedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      regularizationType: {
        type: String,
        enum: ['Late', 'On-Time', 'Early-Exit', 'Absent', 'On-Leave', 'Out-Of-Window', 'Holiday-Swipe'
          , 'Pending-Regularization', 'Regularized'],
      },
      remarks: {
        type: String,
      },
      status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Rejected-Absent', 'Rejected-Leave'],
        default: 'Pending',
      },
      regularizationId: {
        type: Schema.Types.ObjectId,
        ref: 'AttendanceRegularization',
      },
    },
    override: {
      isOverridden: {
        type: Boolean,
        default: false,
      },
      overriddenAt: {
        type: Date,
      },
      overriddenBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      lastModifiedAt: {
        type: Date,
      },
      lastModifiedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      reason: {
        type: String,
      },
      remarks: {
        type: String,
      },
      originalStatus: {
        type: String,
      },
      originalAttendanceStatus: [{
        type: String,
      }],
      originalFirstIn: {
        type: Date,
      },
      originalLastOut: {
        type: Date,
      },
      originalTotalWorkHours: {
        type: String,
      },
      originalActualWorkHours: {
        type: String,
      },
      overrideHistory: [{
        action: {
          type: String,
          enum: ['created', 'modified', 'removed'],
        },
        performedBy: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        performedAt: {
          type: Date,
        },
        changes: [{
          field: { type: String },
          oldValue: { type: Schema.Types.Mixed },
          newValue: { type: Schema.Types.Mixed },
        }],
        reason: {
          type: String,
        },
      }],
    },
  },
  {
    timestamps: true, // createdAt and updatedAt will be in UTC
  },
);

// Indexes for efficient queries
attendanceRecordSchema.index({ userId: 1, shiftDay: 1, shiftCode: 1 }, { unique: true });
attendanceRecordSchema.index({ shiftDay: 1 });
attendanceRecordSchema.index({ shiftStart: 1 });
attendanceRecordSchema.index({ shiftEnd: 1 });
attendanceRecordSchema.index({ attendanceStatus: 1 });
// Indexes for override queries
attendanceRecordSchema.index({ 'override.isOverridden': 1 });
attendanceRecordSchema.index({ 'override.overriddenBy': 1 });
attendanceRecordSchema.index({ 'override.overriddenAt': 1 });

// Validate shift end is after shift start
attendanceRecordSchema.pre('save', function (next) {
  if (this.shiftEnd <= this.shiftStart) {
    next(new Error('Shift end time must be after shift start time'));
  }
  next();
});

// Pre-save hook to sort swipes and set status based on swipe count
attendanceRecordSchema.pre('save', function (next) {
  // Only update status if swipes are modified and status is not a special status
  if (!this.isModified('swipes')) {
    return next();
  }

  // Preserve special statuses (holiday_swipe, leave_swipe, overridden, regularized, pending_regularization)
  const specialStatuses = ['holiday_swipe', 'leave_swipe', 'overridden', 'regularized', 'pending_regularization'];
  if (this.status && specialStatuses.includes(this.status)) {
    return next();
  }

  // Sort swipes by timestamp
  this.swipes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Simple status logic based on swipe count
  // Filter swipes with valid direction
  const validSwipes = this.swipes.filter(s => s.direction === 'IN' || s.direction === 'OUT');

  // Set status based on count
  if (validSwipes.length < 2) {
    this.status = 'incomplete';  // First swipe only
  } else if (validSwipes.length === 2) {
    this.status = 'complete';    // Exactly 2 swipes (IN and OUT)
  } else {
    this.status = 'duplicate_swipes';  // 3 or more swipes
  }

  next();
});

export const AttendanceRecord = model<IAttendanceRecord>('AttendanceRecord', attendanceRecordSchema);



/*
  // Get first and last swipe times
  const firstSwipe = this.swipes[0]?.timestamp;
  const lastSwipe = this.swipes[this.swipes.length - 1]?.timestamp;
 
  // If we don't have both swipes, mark as incomplete
  if (!firstSwipe || !lastSwipe) {
    this.status = 'incomplete';
    this.excessHours = '0:00:00';
    this.shortfallHours = '0:00:00';
    return next();
  }
 
  // Calculate net time difference
  const netTimeDifferenceMs = lastSwipe.getTime() - firstSwipe.getTime();
  const netHours = Math.floor(netTimeDifferenceMs / (1000 * 60 * 60));
  const netMinutes = Math.floor((netTimeDifferenceMs % (1000 * 60 * 60)) / (1000 * 60));
  const netSeconds = Math.floor((netTimeDifferenceMs % (1000 * 60)) / 1000);
 
  // Format time difference
  const formatTime = (hours: number, minutes: number, seconds: number) =>
    `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
 
  // Reset both excessHours and shortfallHours
  this.excessHours = '0:00:00';
  this.shortfallHours = '0:00:00';
 
  // Set either excessHours or shortfallHours based on net difference
  const formattedTime = formatTime(netHours, netMinutes, netSeconds);
  if (netTimeDifferenceMs > 8 * 60 * 60 * 1000) { // More than 8 hours
    this.excessHours = formattedTime;
  } else {
    this.shortfallHours = formattedTime;
  }
*/