import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';
import { HolidayCalendar } from '../src/models/holiday-calendar.model';

dotenv.config();

async function backfill() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is required');
    }

    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const users = await User.find({
        holidayCalendarId: { $exists: true, $ne: null },
    })
        .select('_id holidayCalendarId holidayCalendarHistory')
        .lean();

    let updatedCount = 0;

    for (const user of users) {
        const calendarId = user.holidayCalendarId as mongoose.Types.ObjectId | undefined;
        if (!calendarId) continue;

        const calendar = await HolidayCalendar.findById(calendarId).select('_id year').lean();
        if (!calendar) continue;

        const history = Array.isArray(user.holidayCalendarHistory)
            ? [...user.holidayCalendarHistory]
            : [];

        // Deactivate entries for the same year and remove duplicates for this calendar/year
        const cleaned = history
            .map((entry) =>
                entry.year === calendar.year
                    ? { ...entry, isActive: false }
                    : entry
            )
            .filter(
                (entry) =>
                    !(
                        entry.calendarId?.toString() === calendar._id.toString() &&
                        entry.year === calendar.year
                    )
            );

        cleaned.push({
            calendarId: calendar._id,
            year: calendar.year,
            isActive: true,
            assignedAt: new Date(),
        });

        await User.updateOne(
            { _id: user._id },
            {
                $set: {
                    holidayCalendarHistory: cleaned,
                    holidayCalendarId: calendar._id,
                },
            }
        );
        updatedCount += 1;
    }

    console.log(`Backfill complete. Updated ${updatedCount} users.`);
}

backfill()
    .then(() => mongoose.disconnect())
    .catch((err) => {
        console.error(err);
        mongoose.disconnect().catch(() => undefined);
        process.exit(1);
    });

