import { Schema, model, Document, Types } from "mongoose";

export interface IHoliday {
    date: Date; // DateTime in UTC, normalized to start of day
    name: string;
    type: "mandatory" | "optional" | "client-specific";
    description?: string;
}
//  const rolesResponse: any = await lovsApi.getByType("role");
// if (rolesResponse.success) {
//     userRoles = rolesResponse?.data?.values.map((role: any) => ({
//       label: role.label,
//       value: role.value,
//     }));
//   }

export interface IHolidayCalendar extends Document {
    name: string;
    description?: string;
    year: number;
    holidays: IHoliday[];
    assignedTo?: Types.ObjectId[];
    createdAt?: Date;
    updatedAt?: Date;
}

const HolidaySchema = new Schema<IHoliday>(
    {
        date: {
            type: Date,
            required: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        type: {
            type: String,
            enum: ["mandatory", "optional", "client-specific"],
            required: true
        },

        description: {
            type: String,
            trim: true
        }
    },
    { _id: false }
);

const HolidayCalendarSchema = new Schema<IHolidayCalendar>(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },

        year: {
            type: Number,
            required: true,
            min: 2000,
            max: 2100,
            validate: {
                validator: Number.isInteger,
                message: 'Year must be an integer'
            }
        },
        assignedTo: [{
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: false,
        }],
        holidays: {
            type: [HolidaySchema],
            default: [],
            validate: {
                validator: function (this: any, holidays: IHoliday[]): boolean {
                    const calendarYear = this.year;
                    return holidays.every(holiday => {
                        const holidayYear = new Date(holiday.date).getFullYear();
                        return holidayYear === calendarYear;
                    });
                },
                message: 'All holiday dates must be within the calendar year'
            }
        }
    },
    {
        timestamps: true,
    }
);

// Indexes for efficient queries
HolidayCalendarSchema.index({ year: 1 });
HolidayCalendarSchema.index({ "holidays.date": 1 });
HolidayCalendarSchema.index({ assignedTo: 1, year: 1 });

export const HolidayCalendar = model<IHolidayCalendar>("HolidayCalendar", HolidayCalendarSchema);