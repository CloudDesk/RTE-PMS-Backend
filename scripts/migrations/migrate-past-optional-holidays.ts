/**
 * Migration: Migrate Past Optional Holidays Data
 * Date: January 2025
 * 
 * This migration creates OptionalHolidayRequest records for past optional holidays
 * based on employee leave records and attendance data.
 * 
 * Strategy:
 * 1. Find all optional holidays from past dates in holiday calendars
 * 2. For each employee assigned to those calendars:
 *    - Check if they took leave on optional holiday dates
 *    - If yes, create OptionalHolidayRequest with status 'Approved'
 *    - If no leave but was absent, create with status 'Pending' (for review)
 * 3. Respect 2-per-year limit (only approve first 2 per year)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

interface MigrationStats {
  totalOptionalHolidays: number;
  employeesProcessed: number;
  requestsCreated: number;
  requestsApproved: number;
  requestsPending: number;
  errors: number;
  skipped: number;
}

async function up() {
  console.log('🚀 Starting migration: Migrate past optional holidays data');
  console.log('📅 This will create OptionalHolidayRequest records for past optional holidays');
  console.log('⚠️  Strategy: If employee took leave on optional holiday → Auto-approve (max 2/year)');
  console.log('⚠️  Strategy: If employee was absent → Create as Pending (for manual review)');
  console.log('');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    // Import models
    const { HolidayCalendar } = await import('../../src/models/holiday-calendar.model');
    const { User } = await import('../../src/models/user.model');
    const { Leave } = await import('../../src/models/leave.model');
    const { AttendanceRecord } = await import('../../src/models/attendance-record.model');
    const { OptionalHolidayRequest } = await import('../../src/models/optional-holiday-request.model');

    const stats: MigrationStats = {
      totalOptionalHolidays: 0,
      employeesProcessed: 0,
      requestsCreated: 0,
      requestsApproved: 0,
      requestsPending: 0,
      errors: 0,
      skipped: 0,
    };

    // Get current date to find past holidays
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all holiday calendars
    const calendars = await HolidayCalendar.find({}).lean();
    console.log(`📊 Found ${calendars.length} holiday calendars`);

    // Process each calendar
    for (const calendar of calendars) {
      // Find optional holidays that are in the past
      const pastOptionalHolidays = calendar.holidays.filter((h) => {
        const holidayDate = new Date(h.date);
        holidayDate.setHours(0, 0, 0, 0);
        return h.type === 'optional' && holidayDate < today;
      });

      if (pastOptionalHolidays.length === 0) {
        continue;
      }

      stats.totalOptionalHolidays += pastOptionalHolidays.length;
      console.log(`\n📅 Calendar: ${calendar.name} (${calendar.year})`);
      console.log(`   Found ${pastOptionalHolidays.length} past optional holidays`);

      // Get employees assigned to this calendar (Method 2: assignedTo array)
      const employeeIdsFromArray = calendar.assignedTo || [];
      
      // Get employees with direct holidayCalendarId reference (Method 1: direct reference)
      const employeesWithDirectRef = await User.find({
        holidayCalendarId: calendar._id,
        active: true
      }).select('_id').lean();
      const employeeIdsFromDirectRef = employeesWithDirectRef.map(e => e._id);

      // Combine both methods and remove duplicates
      const allEmployeeIds = [
        ...new Set([
          ...employeeIdsFromArray.map(id => id.toString()),
          ...employeeIdsFromDirectRef.map(id => id.toString())
        ])
      ].map(id => new mongoose.Types.ObjectId(id));

      if (allEmployeeIds.length === 0) {
        console.log(`   ⚠️  No employees assigned to this calendar`);
        continue;
      }

      console.log(`   👥 Processing ${allEmployeeIds.length} employees (${employeeIdsFromArray.length} from assignedTo, ${employeeIdsFromDirectRef.length} from direct reference)`);

      // Process each employee
      for (const employeeId of allEmployeeIds) {
        try {
          const employee = await User.findById(employeeId).select('name email active').lean();
          if (!employee || !employee.active) {
            stats.skipped++;
            continue;
          }

          stats.employeesProcessed++;

          // Track approved optional holidays per year
          const approvedByYear = new Map<number, number>();

          // Process each optional holiday
          for (const holiday of pastOptionalHolidays) {
            const holidayDate = new Date(holiday.date);
            holidayDate.setHours(0, 0, 0, 0);
            const year = holidayDate.getFullYear();

            // Check if request already exists
            const startOfDay = new Date(holidayDate);
            startOfDay.setUTCHours(0, 0, 0, 0);
            const endOfDay = new Date(holidayDate);
            endOfDay.setUTCHours(23, 59, 59, 999);
            
            const existingRequest = await OptionalHolidayRequest.findOne({
              userId: employeeId,
              holidayDate: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            });

            if (existingRequest) {
              stats.skipped++;
              continue;
            }

            // Check if employee took leave on this date
            const leaveOnHoliday = await Leave.findOne({
              userId: employeeId,
              status: 'Approved',
              startDate: { $lte: holidayDate },
              endDate: { $gte: holidayDate },
            }).lean();

            // Check if employee was absent on this date
            const attendanceOnHoliday = await AttendanceRecord.findOne({
              userId: employeeId,
              shiftDay: holidayDate,
            }).lean();

            const wasAbsent = attendanceOnHoliday && 
              attendanceOnHoliday.attendanceStatus?.includes('Absent');

            // Determine status
            let status: 'Approved' | 'Pending' = 'Pending';
            let approvedAt: Date | undefined = undefined;
            let approvedById: mongoose.Types.ObjectId | undefined = undefined;

            if (leaveOnHoliday) {
              // Employee took leave on optional holiday → Auto-approve (if within limit)
              const approvedCount = approvedByYear.get(year) || 0;
              if (approvedCount < 2) {
                status = 'Approved';
                approvedAt = leaveOnHoliday.approvedAt || new Date();
                approvedById = leaveOnHoliday.approvedById 
                  ? new mongoose.Types.ObjectId(leaveOnHoliday.approvedById.toString())
                  : undefined;
                approvedByYear.set(year, approvedCount + 1);
                stats.requestsApproved++;
              } else {
                // Limit reached, create as Pending for review
                status = 'Pending';
                stats.requestsPending++;
              }
            } else if (wasAbsent) {
              // Employee was absent but no leave → Create as Pending for review
              status = 'Pending';
              stats.requestsPending++;
            } else {
              // Employee worked on optional holiday → Skip (they didn't use it)
              stats.skipped++;
              continue;
            }

            // Create OptionalHolidayRequest
            const request = new OptionalHolidayRequest({
              userId: employeeId,
              holidayDate: holidayDate,
              holidayName: holiday.name,
              year: year,
              status: status,
              reason: leaveOnHoliday ? `Migrated from leave record` : `Migrated from attendance data`,
              approvedAt: approvedAt,
              approvedById: approvedById,
              migratedFrom: {
                source: leaveOnHoliday ? 'leave' : 'attendance',
                leaveId: leaveOnHoliday ? new mongoose.Types.ObjectId(leaveOnHoliday._id.toString()) : undefined,
                attendanceRecordId: attendanceOnHoliday 
                  ? new mongoose.Types.ObjectId(attendanceOnHoliday._id.toString())
                  : undefined,
              },
              user: {
                name: employee.name,
                email: employee.email,
              },
            });

            await request.save();
            stats.requestsCreated++;

            if (status === 'Approved') {
              console.log(`   ✅ ${employee.name}: Approved ${holiday.name} (${holidayDate.toLocaleDateString()}) - From leave`);
            } else {
              console.log(`   ⏳ ${employee.name}: Pending ${holiday.name} (${holidayDate.toLocaleDateString()}) - Needs review`);
            }
          }
        } catch (error: any) {
          console.error(`   ❌ Error processing employee ${employeeId}:`, error.message);
          stats.errors++;
        }
      }
    }

    // Print summary
    console.log('\n📊 Migration Summary:');
    console.log(`   Total optional holidays found: ${stats.totalOptionalHolidays}`);
    console.log(`   Employees processed: ${stats.employeesProcessed}`);
    console.log(`   Requests created: ${stats.requestsCreated}`);
    console.log(`   ├─ Approved: ${stats.requestsApproved}`);
    console.log(`   └─ Pending (needs review): ${stats.requestsPending}`);
    console.log(`   Skipped: ${stats.skipped}`);
    console.log(`   Errors: ${stats.errors}`);

    if (stats.requestsPending > 0) {
      console.log('\n⚠️  Note: Some requests were created as Pending and need manual review.');
      console.log('   These are cases where employees were absent but had no approved leave.');
    }

    console.log('\n✅ Migration completed successfully');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

async function down() {
  console.log('🔄 Starting rollback: Remove migrated optional holiday requests');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const { OptionalHolidayRequest } = await import('../../src/models/optional-holiday-request.model');

    // Delete all requests that were migrated (have migratedFrom field)
    const result = await OptionalHolidayRequest.deleteMany({
      migratedFrom: { $exists: true },
    });

    console.log(`✅ Removed ${result.deletedCount} migrated optional holiday requests`);
    console.log('✅ Rollback complete');

  } catch (error: any) {
    console.error('❌ Rollback failed:', error.message);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run migration based on command line argument
const command = process.argv[2];

if (command === 'up') {
  up()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
} else if (command === 'down') {
  down()
    .then(() => {
      console.log('✅ Rollback completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Rollback failed:', error);
      process.exit(1);
    });
} else {
  console.log('Usage: ts-node scripts/migrations/migrate-past-optional-holidays.ts [up|down]');
  console.log('');
  console.log('Options:');
  console.log('  up   - Run migration to create OptionalHolidayRequest records');
  console.log('  down - Rollback migration (remove migrated records)');
  process.exit(1);
}

