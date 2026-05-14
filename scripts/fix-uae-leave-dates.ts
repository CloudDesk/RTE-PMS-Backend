/**
 * Migration Script: Fix UAE Leave Allocation/Expiry Dates
 * 
 * Purpose: Add missing allocation and expiry dates to UAE employee leave summaries
 * 
 * Background:
 * - UAE employees should have allocation and expiry dates for ALL leave types
 * - Some existing records are missing these dates for sick leave, comp-off, etc.
 * - This script backfills the missing dates
 * 
 * Run: ts-node scripts/fix-uae-leave-dates.ts
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../src/models/user.model';
import { LeaveSummary } from '../src/models/leave-summary.model';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function calculateExpiryDate(allocationDate: Date): Promise<Date> {
    const expiry = new Date(allocationDate);
    expiry.setFullYear(expiry.getFullYear() + 1);
    return expiry;
}

async function fixUAELeaveDates() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get all UAE employees
        const uaeEmployees = await User.find({ country: 'AE' }).select('_id name email joiningDate');
        console.log(`📊 Found ${uaeEmployees.length} UAE employees\n`);

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        const currentYear = new Date().getFullYear();

        for (const employee of uaeEmployees) {
            try {
                const summary = await LeaveSummary.findOne({
                    userId: employee._id,
                    year: currentYear
                });

                if (!summary) {
                    console.log(`⚠️  No leave summary for ${employee.name} (${employee.email}) - Year ${currentYear}`);
                    skippedCount++;
                    continue;
                }

                let needsUpdate = false;
                const updates: any = {};

                // Default allocation date: use joining date or Jan 1st of current year
                const defaultAllocationDate = employee.joiningDate || new Date(`${currentYear}-01-01`);

                // UAE leave types to check
                const uaeLeaveTypes = ['annual', 'sick', 'compOff', 'maternity'] as const;

                for (const leaveType of uaeLeaveTypes) {
                    const category = summary[leaveType];

                    // Only set dates for leave types that have allocated days (alloted > 0)
                    if (category && category.alloted > 0) {
                        // Check if allocation date is missing
                        if (!category.allocationDate) {
                            needsUpdate = true;
                            updates[`${leaveType}.allocationDate`] = defaultAllocationDate;
                            console.log(`  🔧 ${leaveType}: Adding allocation date ${defaultAllocationDate.toISOString()}`);
                        }

                        // Check if expiry date is missing
                        if (!category.expiryDate) {
                            needsUpdate = true;
                            const expiryDate = await calculateExpiryDate(category.allocationDate || defaultAllocationDate);
                            updates[`${leaveType}.expiryDate`] = expiryDate;
                            console.log(`  🔧 ${leaveType}: Adding expiry date ${expiryDate.toISOString()}`);
                        }

                        // Check if originalExpiryDate is missing
                        if (!category.originalExpiryDate) {
                            needsUpdate = true;
                            const originalExpiry = await calculateExpiryDate(category.allocationDate || defaultAllocationDate);
                            updates[`${leaveType}.originalExpiryDate`] = originalExpiry;
                            console.log(`  🔧 ${leaveType}: Adding original expiry date ${originalExpiry.toISOString()}`);
                        }

                        // Check if manuallyAdjusted is undefined
                        if (category.manuallyAdjusted === undefined) {
                            needsUpdate = true;
                            updates[`${leaveType}.manuallyAdjusted`] = false;
                            console.log(`  🔧 ${leaveType}: Setting manuallyAdjusted to false`);
                        }
                    } else if (category && category.alloted === 0) {
                        // For unallocated leaves (alloted = 0), remove dates if they exist
                        if (category.allocationDate || category.expiryDate || category.originalExpiryDate) {
                            needsUpdate = true;
                            updates[`${leaveType}.allocationDate`] = undefined;
                            updates[`${leaveType}.expiryDate`] = undefined;
                            updates[`${leaveType}.originalExpiryDate`] = undefined;
                            updates[`${leaveType}.manuallyAdjusted`] = false;
                            console.log(`  🧹 ${leaveType}: Removing dates (alloted = 0)`);
                        }
                    }
                }

                if (needsUpdate) {
                    await LeaveSummary.updateOne(
                        { _id: summary._id },
                        { $set: updates }
                    );
                    console.log(`✅ Updated leave summary for ${employee.name} (${employee.email})\n`);
                    updatedCount++;
                } else {
                    console.log(`✓  ${employee.name} (${employee.email}) - Already has all dates\n`);
                    skippedCount++;
                }

            } catch (err: any) {
                console.error(`❌ Error processing ${employee.name}: ${err.message}\n`);
                errorCount++;
            }
        }

        console.log('\n📈 Migration Summary:');
        console.log(`   ✅ Updated: ${updatedCount} employees`);
        console.log(`   ⏭️  Skipped: ${skippedCount} employees (already have dates or no summary)`);
        console.log(`   ❌ Errors: ${errorCount} employees`);
        console.log('\n🎉 Migration completed!\n');

    } catch (error: any) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
        process.exit(0);
    }
}

// Run migration
fixUAELeaveDates();

