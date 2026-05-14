
import { ShiftAssignment } from './../models/shift.model'
import { User } from './../models/user.model';

// Get today's date boundaries in UTC
const getTodayUTCDateRange = () => {
    const now = new Date();
    const utcYear = now.getUTCFullYear();
    const utcMonth = now.getUTCMonth();
    const utcDate = now.getUTCDate();
    const start = new Date(Date.UTC(utcYear, utcMonth, utcDate, 0, 0, 0));
    const end = new Date(Date.UTC(utcYear, utcMonth, utcDate, 23, 59, 59, 999));
    return { start, end };
};

export const updateShiftAssignmentStatuses = async () => {
    const { start: todayStartUTC, end: todayEndUTC } = getTodayUTCDateRange();

    console.log(`[ShiftStatusCron] UTC check: ${todayStartUTC.toISOString()} → ${todayEndUTC.toISOString()}`);

    // 1. CURRENT → PAST if endDate ≤ today
    const currentToPast = await ShiftAssignment.find({
        status: 'current',
        isActive: true,
        endDate: { $lte: todayEndUTC },
    });

    for (const assignment of currentToPast) {
        assignment.status = 'past';
        assignment.isActive = false;
        await assignment.save();

        await User.updateOne(
            { _id: assignment.userId },
            { $set: { currentShiftAssignmentData: null } }
        );
    }

    // 2. UPCOMING → CURRENT if startDate <= today (catches any upcoming shifts that should be current)
    const upcomingToCurrent = await ShiftAssignment.find({
        status: 'upcoming',
        isActive: true,
        startDate: { $lte: todayEndUTC },
    });

    for (const assignment of upcomingToCurrent) {
        // Check if there's already a current assignment for this user that needs to be ended
        const existingCurrent = await ShiftAssignment.findOne({
            userId: assignment.userId,
            status: 'current',
            isActive: true,
            _id: { $ne: assignment._id }
        });

        // If there's an existing current assignment and this new one starts today or earlier,
        // mark the old one as past (set endDate to day before new one starts)
        if (existingCurrent) {
            const assignmentStartDate = new Date(assignment.startDate);
            assignmentStartDate.setUTCHours(0, 0, 0, 0);
            const previousDay = new Date(assignmentStartDate);
            previousDay.setUTCDate(previousDay.getUTCDate() - 1);
            previousDay.setUTCHours(23, 59, 59, 999);

            existingCurrent.endDate = previousDay;
            existingCurrent.status = 'past';
            existingCurrent.isActive = false;
            await existingCurrent.save();
        }

        // Mark the upcoming assignment as current
        assignment.status = 'current';
        await assignment.save();

        const shiftData = {
            startDate: assignment.startDate,
            endDate: assignment.endDate,
            shiftCode: assignment.shiftCode,
            shiftId: assignment.shiftId,
            shiftAssignmentId: assignment._id,
        };

        // Find the next upcoming shift (if any) for this user after this one becomes current
        const nextUpcoming = await ShiftAssignment.findOne({
            userId: assignment.userId,
            status: 'upcoming',
            isActive: true,
            startDate: { $gt: todayEndUTC },
            _id: { $ne: assignment._id }
        }).sort({ startDate: 1 });

        const nextUpcomingData = nextUpcoming ? {
            startDate: nextUpcoming.startDate,
            endDate: nextUpcoming.endDate,
            shiftCode: nextUpcoming.shiftCode,
            shiftId: nextUpcoming.shiftId,
            shiftAssignmentId: nextUpcoming._id,
        } : null;

        await User.updateOne(
            { _id: assignment.userId },
            {
                $set: {
                    currentShiftAssignmentData: shiftData,
                    upcomingShiftAssignmentData: nextUpcomingData,
                },
            }
        );
    }

    console.log(`[ShiftStatusCron] Done → ${currentToPast.length} past, ${upcomingToCurrent.length} current`);
};
