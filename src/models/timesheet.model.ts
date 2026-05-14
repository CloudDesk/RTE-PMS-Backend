import { Schema, model, Document, Types } from 'mongoose';

// Interface for Task Entry
export interface ITaskEntry {
    project: string;
    task: string;
    description?: string;
    duration: number; // Hours (e.g., 2.5)
}

// Interface for Timesheet
export interface ITimesheet extends Document {
    userId: Types.ObjectId;
    dateUTC: Date;
    entries: ITaskEntry[];
    totalDuration?: number; // Calculated
    createdAt?: Date;
    updatedAt?: Date;
}

// Task Entry Schema
const TaskEntrySchema = new Schema<ITaskEntry>({
    project: {
        type: String,
        required: [true, 'Project is required'],
        trim: true,
    },
    task: {
        type: String,
        required: [true, 'Task is required'],
        trim: true,
    },
    description: {
        type: String,
        trim: true,
        default: '',
    },
    duration: {
        type: Number,
        required: [true, 'Duration is required'],
        min: [0.1, 'Duration must be at least 0.1 hours'],
    },
});

// Timesheet Schema
const TimesheetSchema = new Schema<ITimesheet>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        dateUTC: {
            type: Date,
            required: [true, 'Date is required'],
            set: (date: Date) => {
                console.log(date, 'Date is required')
                const d = new Date(date);
                return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
            },
        },
        entries: {
            type: [TaskEntrySchema],
            required: [true, 'At least one entry is required'],
            validate: {
                validator: function (entries: ITaskEntry[]) {

                    console.log(entries, 'entries validate');
                    const projects = new Set(entries.map((entry) => entry.project));
                    return projects.size > 0 && entries.length >= projects.size;
                },
                message: 'Each project must have at least one task',
            },
        },
        totalDuration: {
            type: Number,
            default: 0,
            max: [9, 'Total duration cannot exceed 12 hours'],
        },
    },
    { timestamps: true }
);

// Unique index for one record per employee per day
TimesheetSchema.index({ userId: 1, dateUTC: 1 }, { unique: true });

// Pre-validate hook for total duration
TimesheetSchema.pre('validate', function (next) {
    this.totalDuration = this.entries.reduce((sum, entry) => sum + entry.duration, 0);
    console.log(this.totalDuration, 'totalDuration near test ==> ');
    if (this.totalDuration > 9) {
        next(new Error('Total duration cannot exceed 9 hours per day'));
    }
    next();
});

// Model
export const Timesheet = model<ITimesheet>('Timesheet', TimesheetSchema);