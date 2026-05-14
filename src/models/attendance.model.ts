import { Schema, model, Document, Types } from 'mongoose';

export interface IAttendance extends Document {
  userId: string | Types.ObjectId;
  checkIn: Date;
  checkOut?: Date;
  status: 'Late' | 'On-Time' | 'Early-Exit' | 'Absent';
  source: 'Biometric' | 'Web' | 'Manual';
  date: Date;
  location?: string;
  remarks?: string;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date },
    status: {
      type: String,
      enum: ['Late', 'On-Time', 'Early-Exit', 'Absent'],
      required: true,
    },
    source: {
      type: String,
      enum: ['Biometric', 'Web', 'Manual'],
      required: true,
    },
    date: { type: Date, required: true },
    location: { type: String, maxlength: 50 },
    remarks: String,
  },
  {
    timestamps: true,
  },
);

// Index for efficient queries
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1 });

export const Attendance = model<IAttendance>('Attendance', attendanceSchema); 