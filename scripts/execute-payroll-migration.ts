import 'dotenv/config';
import { connectDB } from '../src/config/database';
import mongoose from 'mongoose';

// Importing model directly to avoid resolution issues
const payrollSchema = new mongoose.Schema({}, { strict: false });
const Payroll = mongoose.models.Payroll || mongoose.model('Payroll', payrollSchema, 'payrolls');

async function runPayrollMigration() {
    try {
        console.log('🚀 EXECUTING PAYROLL TYPE MIGRATION...\n');
        await connectDB();

        //get
        const fnfQuery = { isFinalSettlement: true };
        const regularQuery = { isFinalSettlement: { $ne: true } };

        // -------

        //update
        console.log('Starting Payroll Type updates...');

        // 1. Update Final Settlement records
        const fnfResult = await Payroll.updateMany(
            fnfQuery,
            { $set: { type: 'FinalSettlement' } }
        );
        console.log(`Updated ${fnfResult.modifiedCount} records to 'FinalSettlement'`);

        // 2. Update Regular records
        const regularResult = await Payroll.updateMany(
            regularQuery,
            { $set: { type: 'Regular' } }
        );
        console.log(`Updated ${regularResult.modifiedCount} records to 'Regular'`);

        console.log('\n✅ Payroll Type migration finished successfully.');
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runPayrollMigration();
