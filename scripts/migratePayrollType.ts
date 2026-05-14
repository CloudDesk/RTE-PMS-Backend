import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { Payroll } from '../src/models/payrolls.model';
import mongoose from 'mongoose';

/**
 * Migration Utility: Updates the 'type' field for all existing payroll records.
 * if isFinalSettlement is true => type = 'FinalSettlement'
 * else => type = 'Regular'
 */
export async function migratePayrollType() {
    try {
        await connectDB();
        console.log('Starting Payroll Type migration...');

        //get
        const fnfQuery = { isFinalSettlement: true };
        const regularQuery = { isFinalSettlement: { $ne: true } };

        const fnfCount = await Payroll.countDocuments(fnfQuery);
        const regularCount = await Payroll.countDocuments(regularQuery);
        console.log(`Found ${fnfCount} FnF records and ${regularCount} Regular records.`);

        // -------

        //update

        // 1. Update Final Settlement records
        const fnfResult = await Payroll.updateMany(
            fnfQuery,
            { $set: { type: 'FinalSettlement' } }
        );

        // 2. Update Regular records
        const regularResult = await Payroll.updateMany(
            regularQuery,
            { $set: { type: 'Regular' } }
        );

        const totalUpdated = fnfResult.modifiedCount + regularResult.modifiedCount;
        console.log(`Payroll Type migration complete. Records processed: ${totalUpdated}`);
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migratePayrollType();
