/**
 * Migration: Add Maternity Leave Field to Leave Summaries (UAE Only)
 * Date: October 14, 2025
 * 
 * This migration adds the maternity leave field to leave summaries for UAE employees.
 * - Adds maternity field with default allocation of 45 days for UAE female employees
 * - Sets allocation date and expiry date (1 year from allocation)
 * - Only affects UAE employees (country = 'AE')
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

interface IUser {
    _id: mongoose.Types.ObjectId;
    country: string;
    name: string;
    email: string;
}

async function up() {
    console.log('🚀 Starting migration: Add maternity leave field to UAE employees');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        // Get all UAE employees
        const uaeUsers = await db.collection('users').find({ country: 'AE' }).toArray() as unknown as IUser[];
        console.log(`📊 Found ${uaeUsers.length} UAE employees`);

        if (uaeUsers.length === 0) {
            console.log('ℹ️ No UAE employees found. Skipping migration.');
            return;
        }

        const currentYear = new Date().getFullYear();
        const today = new Date();
        const expiryDate = new Date(today);
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        let updatedCount = 0;
        let createdCount = 0;

        // Process each UAE employee
        for (const user of uaeUsers) {
            // Check if leave summary exists for current year
            const existingSummary = await db.collection('leavesummaries').findOne({
                userId: user._id,
                year: currentYear,
            });

            if (existingSummary) {
                // Update existing summary - add maternity field if not present
                if (!existingSummary.maternity) {
                    await db.collection('leavesummaries').updateOne(
                        { _id: existingSummary._id },
                        {
                            $set: {
                                maternity: {
                                    alloted: 45, // UAE standard maternity leave
                                    availed: 0,
                                    remaining: 45,
                                    leaveRequests: [],
                                    allocationDate: today,
                                    expiryDate: expiryDate,
                                    originalExpiryDate: expiryDate,
                                    manuallyAdjusted: false,
                                },
                                updatedAt: new Date(),
                            },
                        }
                    );
                    updatedCount++;
                    console.log(`✅ Updated maternity leave for ${user.name} (${user.email})`);
                } else {
                    console.log(`ℹ️ Maternity leave already exists for ${user.name} (${user.email})`);
                }
            } else {
                // Create new leave summary with maternity field
                await db.collection('leavesummaries').insertOne({
                    userId: user._id,
                    year: currentYear,
                    annual: { alloted: 0, availed: 0, remaining: 0, leaveRequests: [] },
                    sick: { alloted: 0, availed: 0, remaining: 0, leaveRequests: [] },
                    compOff: { alloted: 0, availed: 0, remaining: 0, leaveRequests: [] },
                    lossOfPay: { alloted: 0, availed: 0, remaining: 0, leaveRequests: [] },
                    otherPaid: { alloted: 0, availed: 0, remaining: 0, leaveRequests: [] },
                    otherUnpaid: { alloted: 0, availed: 0, remaining: 0, leaveRequests: [] },
                    maternity: {
                        alloted: 45,
                        availed: 0,
                        remaining: 45,
                        leaveRequests: [],
                        allocationDate: today,
                        expiryDate: expiryDate,
                        originalExpiryDate: expiryDate,
                        manuallyAdjusted: false,
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                createdCount++;
                console.log(`✅ Created leave summary with maternity for ${user.name} (${user.email})`);
            }
        }

        console.log('\n📊 Migration Summary:');
        console.log(`   - UAE employees processed: ${uaeUsers.length}`);
        console.log(`   - Leave summaries updated: ${updatedCount}`);
        console.log(`   - Leave summaries created: ${createdCount}`);
        console.log('\n✅ Migration completed successfully');

        // Add maternity field to LOV collection if not exists
        const maternityLeaveType = await db.collection('lovs').findOne({
            type: 'leavetype',
            'values.value': 'maternity',
        });

        if (!maternityLeaveType) {
            console.log('\n📝 Adding maternity leave type to LOV...');

            // Find the leavetype LOV document
            const leaveTypeLov = await db.collection('lovs').findOne({ type: 'leavetype' });

            if (leaveTypeLov) {
                // Add maternity to existing values
                await db.collection('lovs').updateOne(
                    { type: 'leavetype' },
                    {
                        $push: {
                            values: {
                                label: 'Maternity Leave',
                                value: 'maternity',
                                description: 'Maternity leave for female employees (UAE - 45 days)',
                                isActive: true,
                            },
                        },
                    }
                );
                console.log('✅ Added maternity leave type to LOV');
            } else {
                // Create new LOV document
                await db.collection('lovs').insertOne({
                    name: 'Leave Types',
                    type: 'leavetype',
                    values: [
                        {
                            label: 'Maternity Leave',
                            value: 'maternity',
                            description: 'Maternity leave for female employees (UAE - 45 days)',
                            isActive: true,
                        },
                    ],
                });
                console.log('✅ Created LOV with maternity leave type');
            }
        } else {
            console.log('\nℹ️ Maternity leave type already exists in LOV');
        }

    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
    }
}

async function down() {
    console.log('🔄 Starting rollback: Remove maternity leave field from leave summaries');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        // Remove maternity field from all leave summaries
        const result = await db.collection('leavesummaries').updateMany(
            { maternity: { $exists: true } },
            {
                $unset: { maternity: '' },
                $set: { updatedAt: new Date() },
            }
        );

        console.log(`✅ Removed maternity field from ${result.modifiedCount} leave summaries`);

        // Remove maternity leave type from LOV
        const lovResult = await db.collection('lovs').updateOne(
            { type: 'leavetype' },
            {
                $pull: {
                    values: { value: 'maternity' },
                },
            }
        );

        if (lovResult.modifiedCount > 0) {
            console.log('✅ Removed maternity leave type from LOV');
        } else {
            console.log('ℹ️ Maternity leave type not found in LOV');
        }

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
            console.log('\n✅ Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
} else if (command === 'down') {
    down()
        .then(() => {
            console.log('\n✅ Rollback completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Rollback failed:', error);
            process.exit(1);
        });
} else {
    console.log('Usage: ts-node 2025-10-14-add-maternity-leave-field.ts [up|down]');
    console.log('');
    console.log('Examples:');
    console.log('  npm run migrate:up    - Run migration');
    console.log('  npm run migrate:down  - Rollback migration');
    process.exit(1);
}

