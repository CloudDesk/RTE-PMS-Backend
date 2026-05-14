import { Schema, model, Document, Types } from 'mongoose';
import { DEFAULT_GRACE_PERIOD } from '../constants/attendance';

export interface ITraining extends Document {
  name: string;
  code: string;
  startTime: string; // HH:mm format in UTC
  endTime: string; // HH:mm format in UTC
  trainingWindowStart: string; // HH:mm format in UTC, when trainees can start checking in
  trainingWindowEnd: string; // HH:mm format in UTC, last allowed check-in time
  applicableForRoles: Types.ObjectId[];
  validFrom: Date; // DateTime in UTC
  validTill?: Date; // DateTime in UTC
  isActive: boolean;
  description?: string;
  graceTimeInMinutes?: number;
  trainer: Types.ObjectId;
  location: string;
  maxParticipants: number;
  prerequisites?: string[];
  materials?: string[];
  objectives?: string[];
  assessmentCriteria?: string[];
  createdAt: Date; // DateTime in UTC
  updatedAt: Date; // DateTime in UTC
}

export interface ITrainingAssignment extends Document {
  userId: Types.ObjectId;
  trainingId: Types.ObjectId;
  training: ITraining;
  trainingCode: string;
  startDate: Date; // DateTime in UTC
  endDate?: Date; // DateTime in UTC
  isActive: boolean;
  earlyCheckInThreshold?: number; // minutes
  assignedBy: Types.ObjectId;
  assignedAt: Date; // DateTime in UTC
  modifiedBy?: Types.ObjectId;
  modifiedAt?: Date; // DateTime in UTC
}

const trainingSchema = new Schema<ITraining>(
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
    trainingWindowStart: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: 'Training window start time must be in HH:mm format (UTC)',
      },
    },
    trainingWindowEnd: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(v),
        message: 'Training window end time must be in HH:mm format (UTC)',
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
      default: true,
    },
    description: String,
    graceTimeInMinutes: {
      type: Number,
      min: 0,
      max: 60,
      default: DEFAULT_GRACE_PERIOD,
    },
    trainer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    maxParticipants: {
      type: Number,
      required: true,
    },
    prerequisites: [String],
    materials: [String],
    objectives: [String],
    assessmentCriteria: [String],
  },
  {
    timestamps: true, // createdAt and updatedAt will be in UTC
  },
);

const trainingAssignmentSchema = new Schema<ITrainingAssignment>(
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
    startDate: {
      type: Date, // Stores DateTime in UTC
      required: true,
    },
    endDate: {
      type: Date, // Stores DateTime in UTC
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    earlyCheckInThreshold: {
      type: Number,
      min: 0,
      max: 240, // 4 hours max
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
trainingSchema.index({ code: 1 }, { unique: true });
trainingSchema.index({ isActive: 1 });
trainingSchema.index({ validFrom: 1, validTill: 1 });
trainingSchema.index({ applicableForRoles: 1 });

trainingAssignmentSchema.index({ userId: 1, startDate: -1 });
trainingAssignmentSchema.index({ trainingId: 1 });
trainingAssignmentSchema.index({ isActive: 1 });
trainingAssignmentSchema.index({ userId: 1, trainingCode: 1, startDate: 1 });

// Validate end time is after start time and training window times
trainingSchema.pre('save', function(next) {
  const startParts = this.startTime.split(':').map(Number);
  const endParts = this.endTime.split(':').map(Number);
  const windowStartParts = this.trainingWindowStart.split(':').map(Number);
  const windowEndParts = this.trainingWindowEnd.split(':').map(Number);

  const startMinutes = startParts[0] * 60 + startParts[1];
  const endMinutes = endParts[0] * 60 + endParts[1];
  const windowStartMinutes = windowStartParts[0] * 60 + windowStartParts[1];
  const windowEndMinutes = windowEndParts[0] * 60 + windowEndParts[1];

  // Validate training window start is before training start
  if (windowStartMinutes > startMinutes) {
    next(new Error('Training window start time must be before or equal to training start time'));
  }

  // Validate training window end is after training start
  if (windowEndMinutes < startMinutes) {
    next(new Error('Training window end time must be after training start time'));
  }

  // Validate training end is after training start
  if (endMinutes <= startMinutes) {
    next(new Error('Training end time must be after training start time'));
  }

  next();
});

// Validate no overlapping assignments for the same user
trainingAssignmentSchema.pre('save', async function(next) {
  if (!this.isModified('startDate') && !this.isModified('endDate')) {
    return next();
  }

  const TrainingAssignmentModel = model<ITrainingAssignment>('TrainingAssignment');
  const overlappingAssignment = await TrainingAssignmentModel.findOne({
    userId: this.userId,
    trainingCode: this.trainingCode,
    _id: { $ne: this._id },
    isActive: true,
    $or: [
      {
        startDate: { $lte: this.startDate },
        $or: [
          { endDate: { $gte: this.startDate } },
          { endDate: null },
        ],
      },
      {
        startDate: { $lte: this.endDate },
        $or: [
          { endDate: { $gte: this.endDate } },
          { endDate: null },
        ],
      },
    ],
  });

  if (overlappingAssignment) {
    next(new Error('User already has an active training assignment during this period'));
  }
  next();
});

export const Training = model<ITraining>('Training', trainingSchema);
export const TrainingAssignment = model<ITrainingAssignment>('TrainingAssignment', trainingAssignmentSchema); 