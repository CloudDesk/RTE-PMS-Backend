import { Schema, model, Document, Types } from 'mongoose';

export interface ITimesheetFile extends Document {
    userId: Types.ObjectId;
    filePath: string;
    month: number;
    year: number;
    createdAt?: Date;
    updatedAt?: Date;
}

const TimesheetFileSchema = new Schema<ITimesheetFile>({

    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    filePath: { type: String, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2000 }
}, { timestamps: true });

TimesheetFileSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

export const TimesheetFile = model<ITimesheetFile>('TimesheetFile', TimesheetFileSchema);
