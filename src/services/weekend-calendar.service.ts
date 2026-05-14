import { Types } from "mongoose";
import { WeekendCalendar, IWeekendCalendar } from "../models/weekend-calendar.model";
import { User } from "../models/user.model";
import { BaseService } from "./base.service";
import { RequestContext } from "../types/context";

interface ICreateWeekendCalendar {
    name: string;
    description?: string;
    weekends: Array<{
        weekday: number;
        occurrences?: ("1st" | "2nd" | "3rd" | "4th" | "5th")[];
    }>;
}

interface IUpdateWeekendCalendar {
    _id: string;
    name?: string;
    description?: string;
    weekends?: Array<{
        weekday: number;
        occurrences?: ("1st" | "2nd" | "3rd" | "4th" | "5th")[];
    }>;
    userIds?: string[];
}

interface IAssignEmployees {
    calendarId: string;
    employeeIds: string[];
}

export class WeekendCalendarService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }

    async create(data: ICreateWeekendCalendar): Promise<IWeekendCalendar> {
        const calendar = new WeekendCalendar({
            name: data.name,
            description: data.description,
            weekends: data.weekends,
            assignedTo: [],
        });

        await calendar.save();
        return calendar;
    }

    async update(data: IUpdateWeekendCalendar): Promise<IWeekendCalendar> {
        const calendar = await WeekendCalendar.findById(data._id);
        if (!calendar) {
            throw new Error("Weekend calendar not found");
        }

        calendar.set({
            name: data.name ?? calendar.name,
            description: data.description ?? calendar.description,
            weekends: data.weekends ?? calendar.weekends,
            assignedTo: data.userIds ? data.userIds.map((id) => new Types.ObjectId(id)) : calendar.assignedTo,
        });

        await calendar.save();
        return calendar;
    }

    async getAll(query: { page?: number; limit?: number }) {
        const { page = 1, limit = 10 } = query;
        const skip = (page - 1) * limit;

        const [calendars, total] = await Promise.all([
            WeekendCalendar.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("assignedTo", "name email"),
            WeekendCalendar.countDocuments(),
        ]);

        return {
            calendars,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async assignEmployees({ calendarId, employeeIds }: IAssignEmployees) {
        const session = await WeekendCalendar.startSession();
        session.startTransaction();

        try {
            // Validate calendar exists
            const calendar = await WeekendCalendar.findById(calendarId);
            if (!calendar) {
                throw new Error('Weekend calendar not found');
            }

            // Convert string IDs to ObjectIds
            const employeeObjectIds = employeeIds.map(id => new Types.ObjectId(id));

            // Find other calendars that have these employees assigned
            const otherCalendars = await WeekendCalendar.find({
                _id: { $ne: calendarId },
                assignedTo: { $in: employeeObjectIds }
            });

            // Remove employees from other calendars
            if (otherCalendars.length > 0) {
                await Promise.all(otherCalendars.map(async (otherCalendar) => {
                    // Remove employees from assignedTo array
                    otherCalendar.assignedTo = (otherCalendar.assignedTo ?? []).filter(
                        userId => !employeeObjectIds.some(empId => empId.equals(userId))
                    );
                    await otherCalendar.save({ session });
                }));
            }

            // Update current calendar's assignedTo array
            calendar.assignedTo = employeeObjectIds;
            await calendar.save({ session });

            // Remove calendar assignment from users not in the list
            await User.updateMany(
                {
                    weekendCalendarId: calendarId,
                    _id: { $nin: employeeObjectIds }
                },
                {
                    $unset: { weekendCalendarId: 1 }
                },
                { session }
            );

            // Remove weekendCalendarId from users assigned to other calendars
            if (otherCalendars.length > 0) {
                const otherCalendarIds = otherCalendars.map(c => c._id);
                await User.updateMany(
                    {
                        _id: { $in: employeeObjectIds },
                        weekendCalendarId: { $in: otherCalendarIds }
                    },
                    {
                        $unset: { weekendCalendarId: 1 }
                    },
                    { session }
                );
            }

            // Update new users with current calendar assignment
            await User.updateMany(
                { _id: { $in: employeeObjectIds } },
                {
                    $set: { weekendCalendarId: calendarId }
                },
                { session }
            );

            await session.commitTransaction();

            // Fetch updated calendar with populated user data
            const updatedCalendar = await WeekendCalendar.findById(calendarId)
                .populate('assignedTo', 'name email');

            return updatedCalendar;

        } catch (error) {
            console.log(error, "error in assignEmployees");
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async getCalendarsByUserId(userId: string): Promise<IWeekendCalendar | null> {
        if (!Types.ObjectId.isValid(userId)) {
            throw new Error('Invalid user ID');
        }

        const calendar = await WeekendCalendar.findOne({
            assignedTo: new Types.ObjectId(userId)
        })
            .select('-assignedTo -createdAt -updatedAt')
            .lean();

        return calendar;
    }
}

// export const weekendCalendarService = new WeekendCalendarService();