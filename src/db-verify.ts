import 'dotenv/config';
import { connectDB } from './config/database';
import { Payroll } from './models/payrolls.model';
import mongoose from 'mongoose';

async function run() {
    try {
        await connectDB();

        const fnfSettled = await Payroll.countDocuments({ type: 'FinalSettlement' });
        const regularSettled = await Payroll.countDocuments({ type: 'Regular' });
        const missingType = await Payroll.countDocuments({ type: { $exists: false } });

        console.log(`FinalSettlement type count: ${fnfSettled}`);
        console.log(`Regular type count: ${regularSettled}`);
        console.log(`Missing type count: ${missingType}`);

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Final Verification failed:', error);
        process.exit(1);
    }
}

run();
