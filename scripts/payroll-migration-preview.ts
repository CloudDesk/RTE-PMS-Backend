import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { Payroll } from '../src/models/payrolls.model';
import mongoose from 'mongoose';

async function previewPayrollMigration() {
    try {
        console.log('🚀 PAYROLL TYPE MIGRATION - PREVIEW MODE\n');
        await connectDB();

        //get
        const fnfQuery = { isFinalSettlement: true };
        const regularQuery = { isFinalSettlement: { $ne: true } };

        // -------

        //preview
        const fnfCount = await Payroll.countDocuments(fnfQuery);
        const regularCount = await Payroll.countDocuments(regularQuery);
        const totalCount = await Payroll.countDocuments({});

        console.log('📊 MIGRATION PREVIEW:');
        console.log(`Current Total Payroll Records: ${totalCount}`);
        console.log(`-------------------------------------------`);
        console.log(`Target: 'FinalSettlement' -> ${fnfCount} records`);
        console.log(`Target: 'Regular'         -> ${regularCount} records`);
        console.log(`-------------------------------------------`);

        // Sample check for peace of mind
        if (fnfCount > 0) {
            const sampleFnf = await Payroll.findOne(fnfQuery).select('employeeId month year');
            console.log('\n📄 Sample Final Settlement Record:');
            console.log(`   ID: ${sampleFnf?.employeeId || 'N/A'}, Date: ${sampleFnf?.month}/${sampleFnf?.year}`);
        }

        console.log('\n⚠️  NO DATABASE CHANGES WERE APPLIED.');
        console.log('To apply these changes, call migratePayrollType() in your migration flow.');
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Preview failed:', error);
        process.exit(1);
    }
}

previewPayrollMigration();
