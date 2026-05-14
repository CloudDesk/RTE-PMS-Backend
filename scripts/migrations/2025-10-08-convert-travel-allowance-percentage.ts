/**
 * Migration: Convert Travel Allowance Percentage to Fixed Amount for UAE Employees
 * Date: October 8, 2025
 * 
 * This migration converts existing percentage-based travel allowances to fixed amounts
 * for UAE employees by calculating: travelAllowance = (monthlyGross * travelAllowancePercentage) / 100
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

interface SalaryAssignment {
    _id: mongoose.Types.ObjectId;
    employeeId: mongoose.Types.ObjectId;
    salaryStructureId: mongoose.Types.ObjectId;
    monthlyGross: number;
    travelAllowance: number;
    isActive: boolean;
}

interface SalaryStructure {
    _id: mongoose.Types.ObjectId;
    country: string;
    fixedEarnings: {
        travelAllowancePercentage?: number;
    };
}

interface User {
    _id: mongoose.Types.ObjectId;
    country: string;
}

async function up() {
    console.log('🚀 Starting migration: Convert travel allowance percentage to fixed amount for UAE employees');
    
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        // Get all UAE employees
        const uaeUsers = await db.collection('users')
            .find({ country: 'AE' })
            .toArray() as unknown as User[];
        
        const uaeEmployeeIds = uaeUsers.map((e) => e._id);
        console.log(`📊 Found ${uaeEmployeeIds.length} UAE employees`);

        if (uaeEmployeeIds.length === 0) {
            console.log('ℹ️ No UAE employees found. Skipping migration.');
            return;
        }

        // Get active salary assignments for UAE employees
        const assignments = await db.collection('salaryassignments')
            .find({
                employeeId: { $in: uaeEmployeeIds },
                isActive: true,
            })
            .toArray() as unknown as SalaryAssignment[];

        console.log(`📊 Found ${assignments.length} active salary assignments for UAE employees`);

        let migratedCount = 0;
        let skippedCount = 0;
        const migrationDetails: any[] = [];

        for (const assignment of assignments) {
            try {
                // Get salary structure
                const structure = await db.collection('salarystructures')
                    .findOne({ _id: assignment.salaryStructureId }) as unknown as SalaryStructure | null;

                if (!structure) {
                    console.log(`⚠️ Salary structure not found for assignment ${assignment._id}`);
                    skippedCount++;
                    continue;
                }

                // Calculate travel allowance amount from percentage
                const travelPercentage = structure.fixedEarnings?.travelAllowancePercentage || 0;

                if (travelPercentage > 0) {
                    const travelAmount = Math.round((assignment.monthlyGross * travelPercentage) / 100);

                    await db.collection('salaryassignments').updateOne(
                        { _id: assignment._id },
                        {
                            $set: {
                                travelAllowance: travelAmount,
                                updatedAt: new Date(),
                            },
                        }
                    );

                    migrationDetails.push({
                        assignmentId: assignment._id,
                        employeeId: assignment.employeeId,
                        monthlyGross: assignment.monthlyGross,
                        travelPercentage,
                        travelAmount,
                    });

                    migratedCount++;
                    console.log(`✅ Migrated assignment ${assignment._id}: ${travelPercentage}% of ${assignment.monthlyGross} = ${travelAmount} AED`);
                } else {
                    skippedCount++;
                    console.log(`ℹ️ Skipped assignment ${assignment._id}: No travel allowance percentage set`);
                }
            } catch (error: any) {
                console.error(`❌ Error processing assignment ${assignment._id}:`, error.message);
                skippedCount++;
            }
        }

        console.log('\n📊 Migration Summary:');
        console.log(`✅ Successfully migrated: ${migratedCount} assignments`);
        console.log(`⏭️ Skipped: ${skippedCount} assignments`);
        console.log(`📈 Total processed: ${assignments.length} assignments`);

        // Save migration details to a temporary collection for audit
        if (migrationDetails.length > 0) {
            await db.collection('migration_logs').insertOne({
                migration: '2025-10-08-convert-travel-allowance-percentage',
                timestamp: new Date(),
                details: migrationDetails,
                summary: {
                    migratedCount,
                    skippedCount,
                    totalProcessed: assignments.length,
                },
            });
            console.log('📝 Migration details saved to migration_logs collection');
        }

        console.log('✅ Migration completed successfully');

    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
    }
}

async function down() {
    console.log('🔄 Starting rollback: Reset travel allowance to 0 for UAE employees');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        // Get all UAE employees
        const uaeUsers = await db.collection('users')
            .find({ country: 'AE' })
            .toArray() as unknown as User[];
        
        const uaeEmployeeIds = uaeUsers.map((e) => e._id);
        console.log(`📊 Found ${uaeEmployeeIds.length} UAE employees`);

        // Reset travel allowance to 0 for UAE employee assignments
        const result = await db.collection('salaryassignments').updateMany(
            { employeeId: { $in: uaeEmployeeIds } },
            {
                $set: {
                    travelAllowance: 0,
                    updatedAt: new Date(),
                },
            }
        );

        console.log(`✅ Reset travel allowance for ${result.modifiedCount} assignments`);
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
    console.log('Usage: ts-node 2025-10-08-convert-travel-allowance-percentage.ts [up|down]');
    process.exit(1);
}

