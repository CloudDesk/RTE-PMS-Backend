import { Schema, model, Document, Types } from 'mongoose';

export interface IAttendanceRegularization extends Document {
    attendanceId: Types.ObjectId;
    from: Date;
    to: Date;
    shiftDay: Date;
    reason: string;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Rejected-Absent' | 'Rejected-Leave' | 'Withdrawn';
    approver: {
        id: Types.ObjectId;
        name: string;
    };
    approvedDate?: Date;
    comments?: string;
    userId: Types.ObjectId;
}

// Type '"Pending" | "Approved" | "Rejected" | "Rejected-Absent" | "Rejected-Leave"' is not assignable to
//  type '"Pending" | "Approved" | "Rejected-Absent" | "Rejected-Leave"'.


const attendanceRegularizationSchema = new Schema<IAttendanceRegularization>(
    {
        attendanceId: {
            type: Schema.Types.ObjectId,
            ref: 'AttendanceRecord',
            required: true,
        },
        from: {
            type: Date,
            required: true,
        },
        to: {
            type: Date,
            required: true,
        },
        shiftDay: {
            type: Date,
            required: true,
        },
        reason: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected', "Rejected-Absent", "Rejected-Leave", "Withdrawn"],
            default: 'Pending',
        },
        approver: {
            id: {
                type: Schema.Types.ObjectId,
                ref: 'User',
                required: true,
            },
            name: {
                type: String,
                required: true,
            },
        },
        approvedDate: {
            type: Date,
        },
        comments: {
            type: String,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export const AttendanceRegularization = model<IAttendanceRegularization>('AttendanceRegularization', attendanceRegularizationSchema);

//2-5

//ar - 682308f093f5873ed2af2a51
//a - 682308f093f5873ed2af2a4e

//3-5
//ar - 6823135ef96781d81b50bbff
//a - 6823135ef96781d81b50bbfc