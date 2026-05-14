import { Schema, model, Document, Types } from 'mongoose';

interface IWFHSummaryDetail {
  alloted: number; // Total days allotted per year
  availed: number; // Total days used this year
  remaining: number; // Remaining days (alloted - availed)
  wfhRequests: Types.ObjectId[]; // Array of WFH request IDs
}

export interface IWFHSummary extends Document {
  userId: Types.ObjectId;
  year: number;
  wfh: IWFHSummaryDetail;
  createdAt: Date;
  updatedAt: Date;
}

const wfhSummaryDetailSchema = new Schema<IWFHSummaryDetail>({
  alloted: { type: Number, default: 0 },
  availed: { type: Number, default: 0 },
  remaining: { type: Number, default: 0 },
  wfhRequests: [{ type: Schema.Types.ObjectId, ref: 'WFH' }],
});

const wfhSummarySchema = new Schema<IWFHSummary>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    year: { type: Number, required: true },
    wfh: wfhSummaryDetailSchema,
  },
  {
    timestamps: true,
  },
);

// Create compound index for userId and year to ensure unique combination
wfhSummarySchema.index({ userId: 1, year: 1 }, { unique: true });

// Pre-save hook to calculate remaining days
wfhSummarySchema.pre('save', function (this: IWFHSummary & Document, next) {
  if (this.wfh) {
    this.wfh.remaining = Math.max(0, this.wfh.alloted - this.wfh.availed);
  }
  next();
});

export const WFHSummary = model<IWFHSummary>('WFHSummary', wfhSummarySchema);

