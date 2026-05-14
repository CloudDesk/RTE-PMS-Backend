/**
 * Migration: Add travelAllowance Field to Salary Assignments
 * Date: October 8, 2025
 * 
 * This migration adds the travelAllowance field to all existing salary assignments
 * with a default value of 0.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function up() {
    console.log('🚀 Starting migration: Add travelAllowance field to salary assignments');
    
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        // Add travelAllowance field with default value 0
        const result = await db.collection('salaryassignments').updateMany(
            { travelAllowance: { $exists: false } },
            {
                $set: {
                    travelAllowance: 0,
                    updatedAt: new Date(),
                },
            }
        );

        console.log(`✅ Updated ${result.modifiedCount} salary assignments`);

        // Verify the migration
        const count = await db.collection('salaryassignments').countDocuments({
            travelAllowance: { $exists: true },
        });

        console.log(`✅ Total salary assignments with travelAllowance field: ${count}`);

        const totalCount = await db.collection('salaryassignments').countDocuments();
        console.log(`📊 Total salary assignments: ${totalCount}`);

        if (count === totalCount) {
            console.log('✅ Migration completed successfully - All records updated');
        } else {
            console.log(`⚠️ Warning: ${totalCount - count} records were not updated`);
        }

    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
    }
}

async function down() {
    console.log('🔄 Starting rollback: Remove travelAllowance field');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        // Remove travelAllowance field
        const result = await db.collection('salaryassignments').updateMany(
            {},
            {
                $unset: { travelAllowance: '' },
                $set: { updatedAt: new Date() },
            }
        );

        console.log(`✅ Removed travelAllowance from ${result.modifiedCount} salary assignments`);
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
    console.log('Usage: ts-node 2025-10-08-add-travel-allowance-field.ts [up|down]');
    process.exit(1);
}

