import { Schema, model, Document, Types } from 'mongoose';

export interface IOptionalHolidayRequest extends Document {
    userId: Types.ObjectId;
    user?: {
        name: string;
        email: string;
    };
    holidayDate: Date;
    holidayName: string;
    year: number;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
    remarks?: string;
    reason?: string;
    appliedTo?: {
        _id: string;
        name: string;
    };
    approvedById?: Types.ObjectId;
    approvedBy?: {
        _id: string | Types.ObjectId;
        name: string;
        email: string;
    };
    approvedAt?: Date;
    rejectedAt?: Date;
    cancelledAt?: Date;
    // Migration tracking
    migratedFrom?: {
        source: 'leave' | 'attendance' | 'manual';
        leaveId?: Types.ObjectId;
        attendanceRecordId?: Types.ObjectId;
    };
    createdAt?: Date;
    updatedAt?: Date;
}

const optionalHolidayRequestSchema = new Schema<IOptionalHolidayRequest>(
    {
        userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
        user: {
            name: String,
            email: String,
            _id: false,
        },
        holidayDate: { type: Date, required: true },
        holidayName: { type: String, required: true, trim: true },
        year: { type: Number, required: true },
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
        approvedById: { type: Schema.Types.ObjectId, ref: 'User' },
        approvedBy: {
            _id: { type: Schema.Types.ObjectId, ref: 'User' },
            name: String,
            email: String,
        },
        approvedAt: Date,
        rejectedAt: Date,
        cancelledAt: Date,
        migratedFrom: {
            source: {
                type: String,
                enum: ['leave', 'attendance', 'manual'],
            },
            leaveId: { type: Schema.Types.ObjectId, ref: 'Leave' },
            attendanceRecordId: { type: Schema.Types.ObjectId, ref: 'AttendanceRecord' },
        },
    },
    {
        timestamps: true,
    },
);

// Indexes for efficient queries
optionalHolidayRequestSchema.index({ userId: 1, year: 1, status: 1 });
optionalHolidayRequestSchema.index({ holidayDate: 1 });
optionalHolidayRequestSchema.index({ userId: 1, holidayDate: 1 });
optionalHolidayRequestSchema.index({ status: 1, year: 1 });

// Validate holiday date is within the year
optionalHolidayRequestSchema.pre('save', function (next) {
    const holidayYear = new Date(this.holidayDate).getFullYear();
    if (holidayYear !== this.year) {
        return next(new Error('Holiday date must be within the specified year'));
    }
    next();
});

export const OptionalHolidayRequest = model<IOptionalHolidayRequest>(
    'OptionalHolidayRequest',
    optionalHolidayRequestSchema,
);

