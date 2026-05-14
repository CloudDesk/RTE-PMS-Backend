import { Schema, model, Document, Types } from "mongoose";

export interface IWeekendRule {
  weekday: number; // 0 = Sunday to 6 = Saturday
  occurrences?: ("1st" | "2nd" | "3rd" | "4th" | "5th")[]; // only for conditional weekends
}

export interface IWeekendCalendar extends Document {
  name: string;
  description?: string;
  weekends: IWeekendRule[]; // defines all off-days
  assignedTo?: Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

// Schema for individual rules
const WeekendRuleSchema = new Schema<IWeekendRule>(
  {
    weekday: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    occurrences: {
      type: [String],
      enum: ["1st", "2nd", "3rd", "4th", "5th"],
      required: false,
    },
  },
  { _id: false }
);

// Main schema
const WeekendCalendarSchema = new Schema<IWeekendCalendar>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    weekends: {
      type: [WeekendRuleSchema],
      required: true,
      validate: {
        validator: (weekends: IWeekendRule[]) => {
          const days = weekends.map((w) => w.weekday);
          return new Set(days).size === days.length; // no duplicates
        },
        message: "Duplicate weekdays not allowed.",
      },
    },
    assignedTo: [{
      type: Types.ObjectId, ref: "User",
      required: false,
    }],
  },
  {
    timestamps: true,
  }
);

// Index
WeekendCalendarSchema.index({ name: 1 }, { unique: true });

export const WeekendCalendar = model<IWeekendCalendar>("WeekendCalendar", WeekendCalendarSchema);
