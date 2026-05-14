import 'dotenv/config';
import { connectDB } from './config/database';
import { Payroll } from './models/payrolls.model';
import mongoose from 'mongoose';

async function run() {
    try {
        await connectDB();
        const count = await Payroll.countDocuments();
        console.log(`Total Payroll records: ${count}`);

        const fnfCount = await Payroll.countDocuments({ isFinalSettlement: true });
        console.log(`FNF records: ${fnfCount}`);

        const regularCount = await Payroll.countDocuments({ isFinalSettlement: { $ne: true } });
        console.log(`Regular records: ${regularCount}`);

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

run();
