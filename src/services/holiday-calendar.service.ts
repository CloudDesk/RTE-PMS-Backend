import { Types } from "mongoose";
import { HolidayCalendar, IHolidayCalendar } from "../models/holiday-calendar.model";
import { User } from "../models/user.model";
import { BaseService } from "./base.service";
import { RequestContext } from "../types/context";

interface ICreateHolidayCalendar {
    name: string;
    description?: string;
    year: number;
    holidays: Array<{
        date: Date | string;
        name: string;
        type: "mandatory" | "optional" | "client-specific";
        description?: string;
    }>;
}

interface IUpdateHolidayCalendar {
    _id: string;
    name?: string;
    description?: string;
    year?: number;
    holidays?: Array<{
        date: Date | string;
        name: string;
        type: "mandatory" | "optional" | "client-specific";
        description?: string;
    }>;
    userIds?: string[];
}

interface IAssignEmployees {
    calendarId: string;
    employeeIds: string[];
}


export class HolidayCalendarService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }

    /**
     * Ensure only one active holiday calendar per user for a given year by
     * deactivating existing entries, then adding/activating the provided calendar.
     */
    private async activateCalendarForUsers(calendarId: Types.ObjectId, year: number, userIds: Types.ObjectId[], session: any, assignedBy?: Types.ObjectId) {
        if (!userIds.length) return;

        // Ensure array exists
        await User.updateMany(
            { _id: { $in: userIds }, $or: [{ holidayCalendarHistory: { $exists: false } }, { holidayCalendarHistory: { $eq: null } }] },
            { $set: { holidayCalendarHistory: [] } },
            { session }
        );

        // Deactivate any active entry for the same year
        await User.updateMany(
            { _id: { $in: userIds }, "holidayCalendarHistory.year": year },
            { $set: { "holidayCalendarHistory.$[entry].isActive": false } },
            {
                arrayFilters: [{ "entry.year": year }],
                session
            }
        );

        // Remove duplicate entry for this calendar/year before pushing a fresh active one
        await User.updateMany(
            { _id: { $in: userIds } },
            { $pull: { holidayCalendarHistory: { calendarId, year } } },
            { session }
        );

        // Add active entry and set current pointer (only for current year)
        // ✅ FIX: Only set holidayCalendarId if assigning CURRENT YEAR calendar
        const currentYear = new Date().getFullYear();

        const updateFields: any = {
            $push: {
                holidayCalendarHistory: {
                    calendarId,
                    year,
                    isActive: true,
                    assignedAt: new Date(),
                    ...(assignedBy ? { assignedBy } : {})
                }
            }
        };

        // Only update holidayCalendarId if this is the current year
        if (year === currentYear) {
            updateFields.$set = { holidayCalendarId: calendarId };
        }

        await User.updateMany(
            { _id: { $in: userIds } },
            updateFields,
            { session }
        );
    }

    /**
     * Mark the calendar inactive in history for the provided users.
     */
    private async deactivateCalendarForUsers(calendarId: Types.ObjectId, year: number, userIds: Types.ObjectId[], session: any) {
        if (!userIds.length) return;

        // Ensure array exists
        await User.updateMany(
            { _id: { $in: userIds }, $or: [{ holidayCalendarHistory: { $exists: false } }, { holidayCalendarHistory: { $eq: null } }] },
            { $set: { holidayCalendarHistory: [] } },
            { session }
        );

        // Mark as inactive in history
        await User.updateMany(
            { _id: { $in: userIds } },
            {
                $set: { "holidayCalendarHistory.$[entry].isActive": false }
            },
            {
                arrayFilters: [{ "entry.calendarId": calendarId, "entry.year": year }],
                session
            }
        );

        // ✅ FIX: Only unset holidayCalendarId if deactivating CURRENT YEAR calendar
        const currentYear = new Date().getFullYear();

        if (year === currentYear) {
            // For each user, check if they have another active calendar for current year
            for (const userId of userIds) {
                const user = await User.findById(userId).select('holidayCalendarHistory').session(session);

                if (user?.holidayCalendarHistory) {
                    // Find another active calendar for current year (excluding the one being deactivated)
                    const currentYearCalendar = user.holidayCalendarHistory.find(
                        (entry: any) =>
                            entry.year === currentYear &&
                            entry.isActive === true &&
                            entry.calendarId.toString() !== calendarId.toString()
                    );

                    if (currentYearCalendar) {
                        // Set to the other active current year calendar
                        await User.updateOne(
                            { _id: userId },
                            { $set: { holidayCalendarId: currentYearCalendar.calendarId } },
                            { session }
                        );
                    } else {
                        // No other active calendar for current year, unset
                        await User.updateOne(
                            { _id: userId },
                            { $unset: { holidayCalendarId: "" } },
                            { session }
                        );
                    }
                }
            }
        }
        // If deactivating past/future year, don't touch holidayCalendarId
    }
    private async validateUserCalendars(userIds: string[], year: number, excludeCalendarId?: string) {
        if (!userIds.length) return;

        const toObjectId = (val: unknown): Types.ObjectId | null => {
            if (!val) return null;
            if (val instanceof Types.ObjectId) return val;
            if (typeof val === 'string' && Types.ObjectId.isValid(val)) {
                return new Types.ObjectId(val);
            }
            return null;
        };

        // Find users that already have a holidayCalendarId set
        const usersWithCalendar = await User.find({
            _id: { $in: userIds.map(id => new Types.ObjectId(id)) },
            holidayCalendarId: { $exists: true, $ne: null },
        }).select('_id holidayCalendarId').lean();

        if (!usersWithCalendar.length) return;

        const calendarIds = usersWithCalendar
            .map(u => toObjectId(u.holidayCalendarId))
            .filter((id): id is Types.ObjectId => !!id);

        if (!calendarIds.length) return;

        const excludedId = excludeCalendarId ? toObjectId(excludeCalendarId) : null;

        const calendarFilter: any = { _id: { $in: calendarIds }, year };
        if (excludedId) {
            calendarFilter._id.$ne = excludedId;
        }

        const conflictCalendars = await HolidayCalendar.find(calendarFilter)
            .select('_id')
            .lean();

        if (!conflictCalendars.length) return;

        const conflictSet = new Set(conflictCalendars.map(c => c._id.toString()));
        const conflictedUsers = usersWithCalendar
            .filter(u => {
                const oid = toObjectId(u.holidayCalendarId);
                return oid ? conflictSet.has(oid.toString()) : false;
            })
            .map(u => u._id.toString());

        if (conflictedUsers.length > 0) {
            throw new Error(
                `Users ${conflictedUsers.join(", ")} already have a calendar for ${year}`,
            );
        }
    }

    async create(data: ICreateHolidayCalendar): Promise<IHolidayCalendar> {
        const session = await HolidayCalendar.startSession();
        session.startTransaction();

        try {
            // Validate holidays are in the correct year
            const holidays = data.holidays.map((h) => ({
                ...h,
                date: new Date(h.date),
            }));
            const invalidHolidays = holidays.filter(
                (holiday) => holiday.date.getFullYear() !== data.year,
            );

            if (invalidHolidays.length > 0) {
                throw new Error("All holidays must be within the specified year");
            }


            // Create calendar
            const calendar = new HolidayCalendar({
                name: data.name,
                description: data.description,
                year: data.year,
                holidays,
                assignedTo: [],
            });

            await calendar.save({ session });

            await session.commitTransaction();
            return calendar;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async update(data: IUpdateHolidayCalendar): Promise<IHolidayCalendar> {
        const session = await HolidayCalendar.startSession();
        session.startTransaction();

        try {
            const calendar = await HolidayCalendar.findById(data._id);
            if (!calendar) {
                throw new Error("Holiday calendar not found");
            }

            // Determine the year to validate against
            const targetYear = data.year ?? calendar.year;

            // Validate holidays if provided
            let holidays = calendar.holidays;
            if (data.holidays) {
                holidays = data.holidays.map((h) => ({
                    ...h,
                    date: new Date(h.date),
                }));
                const invalidHolidays = holidays.filter(
                    (holiday) => holiday.date.getFullYear() !== targetYear,
                );
                if (invalidHolidays.length > 0) {
                    throw new Error("All holidays must be within the specified year");
                }
            }

            // Validate user calendar assignments
            if (data.userIds && data.userIds.length > 0) {
                await this.validateUserCalendars(data.userIds, targetYear, data._id);
            }

            // Get current assigned users
            const currentUserIds = (calendar.assignedTo ?? []).map((id) => id.toString());

            // Update calendar
            calendar.set({
                name: data.name ?? calendar.name,
                description: data.description ?? calendar.description,
                year: targetYear,
                holidays,
                assignedTo: data.userIds ? data.userIds.map((id) => new Types.ObjectId(id)) : calendar.assignedTo,
            });

            await calendar.save({ session });

            if (data.userIds) {
                // Remove calendar from users no longer assigned
                const removedUsers = currentUserIds.filter((id) => !(data.userIds ?? []).includes(id));
                if (removedUsers.length > 0) {
                    await User.updateMany(
                        { _id: { $in: removedUsers } },
                        { $unset: { holidayCalendar: 1 } },
                        { session },
                    );

                    await this.deactivateCalendarForUsers(
                        calendar._id,
                        targetYear,
                        removedUsers.map(id => new Types.ObjectId(id)),
                        session
                    );
                }

                // Add calendar to newly assigned users
                const newUsers = data.userIds.filter((id) => !currentUserIds.includes(id));
                if (newUsers.length > 0) {
                    const assignedBy = this.context.user?._id
                        ? (this.context.user._id instanceof Types.ObjectId
                            ? this.context.user._id
                            : new Types.ObjectId(this.context.user._id))
                        : undefined;
                    await this.activateCalendarForUsers(
                        calendar._id,
                        targetYear,
                        newUsers.map(id => new Types.ObjectId(id)),
                        session,
                        assignedBy
                    );
                }
            }

            await session.commitTransaction();
            return calendar;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async getCalendars(query: { year?: number; page?: number; limit?: number; search?: string }) {
        const { year, page = 1, limit = 10, search } = query;
        const skip = (page - 1) * limit;

        // Build filter
        const filter: any = {};
        if (year) {
            filter.year = year;
        }

        if (search) {
            const trimmedSearch = search.trim();
            const escapedSearch = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchConditions: any[] = [
                { name: { $regex: escapedSearch, $options: 'i' } },
                { description: { $regex: escapedSearch, $options: 'i' } },
                { "holidays.name": { $regex: escapedSearch, $options: 'i' } }
            ];

            // If search is numeric, also search the year field
            if (/^\d+$/.test(trimmedSearch)) {
                const searchNum = parseInt(trimmedSearch);
                // For exact 4-digit year, match exactly
                if (trimmedSearch.length === 4) {
                    searchConditions.push({ year: searchNum });
                } else {
                    // For partial numeric search, check if year contains the numbers
                    // Since year is a number, we use $expr to convert to string or partial match if needed
                    // But in MongoDB, searching a number field with regex isn't directly supported 
                    // without $expr or converting to string.
                    // For simplicity, we'll only do exact year if 4 digits, 
                    // or just rely on the other string fields if partial.
                    // Alternatively, we can use $where or $expr:
                    searchConditions.push({ $expr: { $gt: [{ $indexOfCP: [{ $toString: "$year" }, trimmedSearch] }, -1] } });
                }
            }

            filter.$or = searchConditions;
        }

        // Execute queries in parallel
        const [calendars, total] = await Promise.all([
            HolidayCalendar.find(filter)
                .sort({ year: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('assignedTo', 'name email'),
            HolidayCalendar.countDocuments(filter)
        ]);

        return {
            calendars,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async assignEmployees({ calendarId, employeeIds }: IAssignEmployees) {
        const session = await HolidayCalendar.startSession();
        session.startTransaction();

        try {
            // Validate calendar exists
            const calendar = await HolidayCalendar.findById(calendarId);
            if (!calendar) {
                throw new Error('Holiday calendar not found');
            }

            // Convert string IDs to ObjectIds
            const employeeObjectIds = employeeIds.map(id => new Types.ObjectId(id));

            // Find other calendars from the same year that have these employees assigned
            const otherCalendars = await HolidayCalendar.find({
                _id: { $ne: calendarId },
                year: calendar.year,
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

                    // Deactivate history for removed calendar in same year
                    await this.deactivateCalendarForUsers(otherCalendar._id, otherCalendar.year, employeeObjectIds, session);
                }));
            }


            // Update calendar's assignedTo array
            calendar.assignedTo = employeeObjectIds;
            await calendar.save({ session });

            // Users previously on this calendar but not anymore
            const usersPreviouslyOnCalendar = await User.find({
                holidayCalendarId: calendarId,
                _id: { $nin: employeeObjectIds }
            }).select('_id').lean();
            const removedUserIds = usersPreviouslyOnCalendar.map(u => u._id as Types.ObjectId);

            // Remove calendar assignment from users not in the list
            await User.updateMany(
                {
                    holidayCalendarId: calendarId,
                    _id: { $nin: employeeObjectIds }
                },
                {
                    $unset: { holidayCalendarId: 1 }
                },
                { session }
            );

            await this.deactivateCalendarForUsers(new Types.ObjectId(calendarId), calendar.year, removedUserIds, session);

            // Update new users with calendar assignment
            const assignedBy = this.context.user?._id
                ? (this.context.user._id instanceof Types.ObjectId
                    ? this.context.user._id
                    : new Types.ObjectId(this.context.user._id))
                : undefined;
            await this.activateCalendarForUsers(new Types.ObjectId(calendarId), calendar.year, employeeObjectIds, session, assignedBy);

            await session.commitTransaction();

            // Fetch updated calendar with populated user data
            const updatedCalendar = await HolidayCalendar.findById(calendarId)
                .populate('assignedTo', 'name email');

            return updatedCalendar;

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
    async getCalendarsByUserId(userId: string, year?: number): Promise<IHolidayCalendar | null> {
        if (!Types.ObjectId.isValid(userId)) {
            throw new Error('Invalid user ID');
        }

        const userObjectId = new Types.ObjectId(userId);

        // If year is specified, look for that specific year in holidayCalendarHistory
        if (year) {
            const user = await User.findById(userId).select('holidayCalendarHistory').lean();

            if (!user?.holidayCalendarHistory || user.holidayCalendarHistory.length === 0) {
                return null;
            }

            // Find the active calendar for the specified year
            const historyEntry = user.holidayCalendarHistory.find(
                (entry: any) => entry.year === year && entry.isActive === true
            );

            if (!historyEntry) {
                return null;
            }

            // Fetch the calendar details
            const calendar = await HolidayCalendar.findById(historyEntry.calendarId)
                .select('-assignedTo -createdAt -updatedAt')
                .lean();

            return calendar;
        }

        // If no year specified, use the current logic (holidayCalendarId field)
        const user = await User.findById(userId).select('holidayCalendarId').lean();
        if (user?.holidayCalendarId) {
            const calendar = await HolidayCalendar.findById(user.holidayCalendarId)
                .select('-assignedTo -createdAt -updatedAt')
                .lean();
            if (calendar) {
                return calendar;
            }
        }

        // If no direct reference, check calendars where user is in assignedTo array (Method 2)
        const calendar = await HolidayCalendar.findOne({
            assignedTo: userObjectId
        })
            .select('-assignedTo -createdAt -updatedAt')
            .lean();

        return calendar;
    }

    async getUpcomingHolidays(userId: string, isAdmin: boolean = false, showAll: boolean = false) {
        const currentYear = new Date().getFullYear();
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        console.log(showAll, "showAll")
        let allCalendars: IHolidayCalendar[] = [];

        if (isAdmin) {
            allCalendars = await HolidayCalendar.find({ year: currentYear }).lean();
        } else {
            allCalendars = await HolidayCalendar.find({
                year: currentYear,
                assignedTo: userId,
            }).lean();
        }
        const holidayMap = new Map<string, {
            name: string;
            date: string;
            types: Set<string>;
            roles: Set<string>;
        }
        >();

        for (const calendar of allCalendars) {
            const roleName = calendar.name.split(" ")[0]; // Better if we use a new `group` field later

            for (const holiday of calendar.holidays) {
                const holidayDate = new Date(holiday.date);
                if (holidayDate < today) continue;

                const dateStr = holidayDate.toISOString().split("T")[0];

                const key = `${dateStr}_${holiday.name}`;

                if (!holidayMap.has(key)) {
                    holidayMap.set(key, {
                        name: holiday.name,
                        date: dateStr,
                        types: new Set([holiday.type]),
                        roles: new Set([roleName]),
                    });
                } else {
                    const entry = holidayMap.get(key)!;
                    entry.types.add(holiday.type);
                    entry.roles.add(roleName);
                }
            }
        }

        const result = Array.from(holidayMap.values()).map(entry => {
            let finalType = "optional";
            if (entry.types.has("mandatory")) finalType = "mandatory";
            else if (entry.types.has("client-specific")) finalType = "client-specific";

            return {
                date: entry.date,
                name: entry.name,
                type: finalType,
                roles: Array.from(entry.roles),
            };
        });

        // Sort by date (ascending)
        const sortedResult = result.sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        )

        // Return all or limit to 3 based on showAll parameter
        return showAll ? sortedResult : sortedResult.slice(0, 3);

        // const holidayMap = new Map();

        // for (const calendar of allCalendars) {
        //     const role = calendar.group; // e.g., "Admin", "Manager"
        //     for (const holiday of calendar.holidays) {
        //         if (new Date(holiday.date) < today) continue;

        //         const key = `${holiday.date.toISOString().split('T')[0]}|${holiday.name}`;
        //         if (!holidayMap.has(key)) {
        //             holidayMap.set(key, {
        //                 date: holiday.date,
        //                 name: holiday.name,
        //                 type: holiday.type,
        //                 description: holiday.description,
        //                 rolesApplicable: [role]
        //             });
        //         } else {
        //             holidayMap.get(key).rolesApplicable.push(role);
        //         }
        //     }
        // }

        // const upcomingHolidays = Array.from(holidayMap.values());

        // console.log(upcomingHolidays, "upcomingHolidays")
        // return upcomingHolidays;

    }

}

// export const holidayCalendarService = new HolidayCalendarService();