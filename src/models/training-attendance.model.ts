import { Schema, model, Document, Types } from 'mongoose';

export interface ITrainingAttendanceRecord extends Document {
  userId: Types.ObjectId;
  trainingId: Types.ObjectId;
  trainingCode: string;
  trainingDay: Date; // DateTime in UTC, normalized to start of day
  trainingStart: Date; // DateTime in UTC
  trainingEnd: Date; // DateTime in UTC
  swipes: {
    timestamp: Date; // DateTime in UTC
    direction?: 'IN' | 'OUT';
    deviceId?: string;
    location?: string;
  }[];
  isWithinWindow: boolean;
  isLateEntry: boolean;
  isEarlyExit: boolean;
  needsRegularization: boolean;
  overtime: string; // Duration in HH:mm:ss format
  shortTime: string; // Duration in HH:mm:ss format
  status: 'incomplete' | 'complete' | 'duplicate_swipes' | 'missing_checkout';
  attendanceStatus: ('Late' | 'On-Time' | 'Early-Exit' | 'Absent')[];
  outOfWindowSwipes: {
    timestamp: Date; // DateTime in UTC
    direction?: 'IN' | 'OUT';
    deviceId?: string;
    location?: string;
    reason?: string;
  }[];
  createdAt: Date; // DateTime in UTC
  updatedAt: Date; // DateTime in UTC
}

const trainingAttendanceRecordSchema = new Schema<ITrainingAttendanceRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    trainingId: {
      type: Schema.Types.ObjectId,
      ref: 'Training',
      required: true,
    },
    trainingCode: {
      type: String,
      required: true,
    },
    trainingDay: {
      type: Date, // Stores DateTime in UTC
      required: true,
    },
    trainingStart: {
      type: Date, // Stores DateTime in UTC
      required: true,
    },
    trainingEnd: {
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
      location: String,
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
    needsRegularization: {
      type: Boolean,
      default: false,
    },
    overtime: {
      type: String,
      default: '0:00:00',
    },
    shortTime: {
      type: String,
      default: '0:00:00',
    },
    status: {
      type: String,
      enum: ['incomplete', 'complete', 'duplicate_swipes', 'missing_checkout'],
      default: 'incomplete',
    },
    attendanceStatus: [{
      type: String,
      enum: ['Late', 'On-Time', 'Early-Exit', 'Absent'],
    }],
  },
  {
    timestamps: true, // createdAt and updatedAt will be in UTC
  },
);

// Indexes for efficient queries
trainingAttendanceRecordSchema.index({ userId: 1, trainingDay: 1, trainingCode: 1 }, { unique: true });
trainingAttendanceRecordSchema.index({ trainingDay: 1 });
trainingAttendanceRecordSchema.index({ trainingStart: 1 });
trainingAttendanceRecordSchema.index({ trainingEnd: 1 });
trainingAttendanceRecordSchema.index({ attendanceStatus: 1 });

// Validate training end is after training start
trainingAttendanceRecordSchema.pre('save', function(next) {
  if (this.trainingEnd <= this.trainingStart) {
    next(new Error('Training end time must be after training start time'));
  }
  next();
});

// Pre-save hook to calculate overtime and shortTime
trainingAttendanceRecordSchema.pre('save', function(next) {
  if (!this.isModified('swipes')) {
    return next();
  }

  // Sort swipes by timestamp
  this.swipes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Get first and last swipe times
  const firstSwipe = this.swipes[0]?.timestamp;
  const lastSwipe = this.swipes[this.swipes.length - 1]?.timestamp;

  // If we don't have both swipes, mark as incomplete
  if (!firstSwipe || !lastSwipe) {
    this.status = 'incomplete';
    this.overtime = '0:00:00';
    this.shortTime = '0:00:00';
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

  // Reset both overtime and shortTime
  this.overtime = '0:00:00';
  this.shortTime = '0:00:00';

  // Set either overtime or shortTime based on net difference
  const formattedTime = formatTime(netHours, netMinutes, netSeconds);
  if (netTimeDifferenceMs > 8 * 60 * 60 * 1000) { // More than 8 hours
    this.overtime = formattedTime;
  } else {
    this.shortTime = formattedTime;
  }

  // Update status
  if (this.swipes.length === 2) {
    this.status = 'complete';
  } else if (this.swipes.length > 2) {
    this.status = 'duplicate_swipes';
  } else {
    this.status = 'missing_checkout';
  }

  next();
});

export const TrainingAttendanceRecord = model<ITrainingAttendanceRecord>('TrainingAttendanceRecord', trainingAttendanceRecordSchema); 
