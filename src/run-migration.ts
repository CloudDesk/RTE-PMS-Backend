import 'dotenv/config';
import { connectDB } from './config/database';
import { migratePayrollType } from '../scripts/migratePayrollType';
import mongoose from 'mongoose';

async function run() {
    try {
        await connectDB();
        await migratePayrollType();
        console.log('Migration finished, closing connection...');
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Execution failed:', error);
        process.exit(1);
    }
}

run();
