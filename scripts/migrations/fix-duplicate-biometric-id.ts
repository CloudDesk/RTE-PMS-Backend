#!/usr/bin/env ts-node

/**
 * Migration Script: Fix Duplicate BiometricId Issue
 * 
 * This script fixes the E11000 duplicate key error for biometricId field
 * by converting empty strings to null values.
 * 
 * Date: 2025-01-15
 * Issue: E11000 duplicate key error collection: users index: biometricId_1 dup key: { biometricId: "" }
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://******:*******@cluster0.0ktur.mongodb.net/hrms_production?retryWrites=true&w=majority&appName=Cluster0');
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    }
};

// User schema (simplified for migration)
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    biometricId: { type: String, sparse: true, unique: true }
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function fixDuplicateBiometricId() {
    try {
        console.log('🔍 Starting biometricId duplicate fix migration...');

        // Find all users with empty string biometricId
        const usersWithEmptyBiometricId = await User.find({ biometricId: '' });
        console.log(`📊 Found ${usersWithEmptyBiometricId.length} users with empty biometricId`);

        if (usersWithEmptyBiometricId.length === 0) {
            console.log('✅ No users with empty biometricId found. Migration not needed.');
            return;
        }

        // Update all empty biometricId to null
        const updateResult = await User.updateMany(
            { biometricId: '' },
            { $set: { biometricId: null } }
        );

        console.log(`✅ Updated ${updateResult.modifiedCount} users`);
        console.log('📋 Update details:', updateResult);

        // Verify the fix
        const remainingEmptyBiometricId = await User.countDocuments({ biometricId: '' });
        console.log(`🔍 Remaining users with empty biometricId: ${remainingEmptyBiometricId}`);

        if (remainingEmptyBiometricId === 0) {
            console.log('🎉 Migration completed successfully!');
        } else {
            console.log('⚠️ Some users still have empty biometricId. Manual review needed.');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

async function main() {
    try {
        await connectDB();
        await fixDuplicateBiometricId();
    } catch (error) {
        console.error('❌ Migration script failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
    }
}

// Run migration if called directly
if (require.main === module) {
    main();
}

export { fixDuplicateBiometricId };
