import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

/**
 * Migration: Add Air Ticket Allowance and Medical Allowance fields to Salary Assignments
 * Date: January 10, 2025
 * 
 * Purpose: Adds airTicketAllowance and medicalAllowance fields to all existing salary assignment records.
 * These fields are specific to UAE employees and will default to 0.
 * 
 * Usage:
 *   Up (Apply):    ts-node scripts/migrations/2025-01-10-add-air-ticket-medical-allowance.ts up
 *   Down (Revert): ts-node scripts/migrations/2025-01-10-add-air-ticket-medical-allowance.ts down
 */

interface MigrationResult {
    success: boolean;
    modifiedCount?: number;
    message: string;
    details?: any;
}

/**
 * Apply migration: Add new fields with default values
 */
async function up(): Promise<MigrationResult> {
    try {
        console.log('\n🚀 Starting migration: Add Air Ticket and Medical Allowance fields\n');

        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db!.collection('salaryassignments');

        // Check current state
        const totalRecords = await collection.countDocuments({});
        const recordsWithoutAirTicket = await collection.countDocuments({ 
            airTicketAllowance: { $exists: false } 
        });
        const recordsWithoutMedical = await collection.countDocuments({ 
            medicalAllowance: { $exists: false } 
        });

        console.log(`\n📊 Pre-migration Status:`);
        console.log(`   Total Salary Assignments: ${totalRecords}`);
        console.log(`   Records without airTicketAllowance: ${recordsWithoutAirTicket}`);
        console.log(`   Records without medicalAllowance: ${recordsWithoutMedical}`);

        if (recordsWithoutAirTicket === 0 && recordsWithoutMedical === 0) {
            console.log('\n✨ Migration already applied - all records have the new fields');
            await mongoose.connection.close();
            return {
                success: true,
                message: 'Migration already applied'
            };
        }

        // Apply migration
        console.log('\n⚙️  Applying migration...');

        const result = await collection.updateMany(
            {
                $or: [
                    { airTicketAllowance: { $exists: false } },
                    { medicalAllowance: { $exists: false } }
                ]
            },
            {
                $set: {
                    airTicketAllowance: { 
                        $ifNull: ['$airTicketAllowance', 0] 
                    },
                    medicalAllowance: { 
                        $ifNull: ['$medicalAllowance', 0] 
                    },
                    updatedAt: new Date()
                }
            }
        );

        // Verify migration
        const verifyWithoutAirTicket = await collection.countDocuments({ 
            airTicketAllowance: { $exists: false } 
        });
        const verifyWithoutMedical = await collection.countDocuments({ 
            medicalAllowance: { $exists: false } 
        });

        console.log(`\n📈 Migration Results:`);
        console.log(`   Records modified: ${result.modifiedCount}`);
        console.log(`   Records still without airTicketAllowance: ${verifyWithoutAirTicket}`);
        console.log(`   Records still without medicalAllowance: ${verifyWithoutMedical}`);

        if (verifyWithoutAirTicket === 0 && verifyWithoutMedical === 0) {
            console.log('\n✅ Migration completed successfully!');
        } else {
            console.log('\n⚠️  Warning: Some records may not have been updated');
        }

        // Sample records for verification
        console.log('\n📋 Sample records after migration:');
        const samples = await collection.find({}).limit(3).toArray();
        samples.forEach((record, index) => {
            console.log(`\n   Record ${index + 1}:`);
            console.log(`     Employee ID: ${record.employeeId}`);
            console.log(`     Monthly Gross: ${record.monthlyGross}`);
            console.log(`     Travel Allowance: ${record.travelAllowance || 0}`);
            console.log(`     Air Ticket Allowance: ${record.airTicketAllowance || 0}`);
            console.log(`     Medical Allowance: ${record.medicalAllowance || 0}`);
            console.log(`     Is Active: ${record.isActive}`);
        });

        await mongoose.connection.close();
        console.log('\n🔌 Disconnected from MongoDB\n');

        return {
            success: true,
            modifiedCount: result.modifiedCount,
            message: 'Migration applied successfully',
            details: {
                totalRecords,
                recordsUpdated: result.modifiedCount,
                recordsWithoutAirTicketBefore: recordsWithoutAirTicket,
                recordsWithoutMedicalBefore: recordsWithoutMedical,
                recordsWithoutAirTicketAfter: verifyWithoutAirTicket,
                recordsWithoutMedicalAfter: verifyWithoutMedical
            }
        };

    } catch (error: any) {
        console.error('\n❌ Migration failed:', error.message);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        return {
            success: false,
            message: `Migration failed: ${error.message}`
        };
    }
}

/**
 * Revert migration: Remove new fields
 */
async function down(): Promise<MigrationResult> {
    try {
        console.log('\n🔄 Starting migration rollback: Remove Air Ticket and Medical Allowance fields\n');

        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db!.collection('salaryassignments');

        // Check current state
        const totalRecords = await collection.countDocuments({});
        const recordsWithAirTicket = await collection.countDocuments({ 
            airTicketAllowance: { $exists: true } 
        });
        const recordsWithMedical = await collection.countDocuments({ 
            medicalAllowance: { $exists: true } 
        });

        console.log(`\n📊 Pre-rollback Status:`);
        console.log(`   Total Salary Assignments: ${totalRecords}`);
        console.log(`   Records with airTicketAllowance: ${recordsWithAirTicket}`);
        console.log(`   Records with medicalAllowance: ${recordsWithMedical}`);

        if (recordsWithAirTicket === 0 && recordsWithMedical === 0) {
            console.log('\n✨ No rollback needed - fields already removed');
            await mongoose.connection.close();
            return {
                success: true,
                message: 'No rollback needed'
            };
        }

        // Rollback migration
        console.log('\n⚙️  Rolling back migration...');

        const result = await collection.updateMany(
            {},
            {
                $unset: {
                    airTicketAllowance: '',
                    medicalAllowance: ''
                },
                $set: {
                    updatedAt: new Date()
                }
            }
        );

        // Verify rollback
        const verifyWithAirTicket = await collection.countDocuments({ 
            airTicketAllowance: { $exists: true } 
        });
        const verifyWithMedical = await collection.countDocuments({ 
            medicalAllowance: { $exists: true } 
        });

        console.log(`\n📈 Rollback Results:`);
        console.log(`   Records modified: ${result.modifiedCount}`);
        console.log(`   Records still with airTicketAllowance: ${verifyWithAirTicket}`);
        console.log(`   Records still with medicalAllowance: ${verifyWithMedical}`);

        if (verifyWithAirTicket === 0 && verifyWithMedical === 0) {
            console.log('\n✅ Rollback completed successfully!');
        } else {
            console.log('\n⚠️  Warning: Some fields may not have been removed');
        }

        await mongoose.connection.close();
        console.log('\n🔌 Disconnected from MongoDB\n');

        return {
            success: true,
            modifiedCount: result.modifiedCount,
            message: 'Rollback completed successfully',
            details: {
                totalRecords,
                recordsUpdated: result.modifiedCount,
                recordsWithAirTicketBefore: recordsWithAirTicket,
                recordsWithMedicalBefore: recordsWithMedical,
                recordsWithAirTicketAfter: verifyWithAirTicket,
                recordsWithMedicalAfter: verifyWithMedical
            }
        };

    } catch (error: any) {
        console.error('\n❌ Rollback failed:', error.message);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        return {
            success: false,
            message: `Rollback failed: ${error.message}`
        };
    }
}

// Main execution
const command = process.argv[2];

if (!command || !['up', 'down'].includes(command)) {
    console.error('\n❌ Invalid command. Usage:');
    console.error('   Up (Apply):    ts-node scripts/migrations/2025-01-10-add-air-ticket-medical-allowance.ts up');
    console.error('   Down (Revert): ts-node scripts/migrations/2025-01-10-add-air-ticket-medical-allowance.ts down\n');
    process.exit(1);
}

if (!MONGODB_URI) {
    console.error('\n❌ MONGODB_URI environment variable not set\n');
    process.exit(1);
}

// Execute migration
(async () => {
    try {
        const result = command === 'up' ? await up() : await down();
        
        if (result.success) {
            console.log('✅ Operation completed successfully');
            process.exit(0);
        } else {
            console.error('❌ Operation failed');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    }
})();

