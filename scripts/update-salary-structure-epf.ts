import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { SalaryStructure } from '../src/models/salary-structure.model';
import mongoose from 'mongoose';

async function updateSalaryStructureEpf() {
    try {
        console.log('🚀 SALARY STRUCTURE EPF UPDATE - EXECUTION MODE\n');
        await connectDB();

        const query = {
            country: 'IN',
            'statutoryDeductions.epf.employerContribution': { $ne: 13 }
        };

        const result = await SalaryStructure.updateMany(
            query,
            {
                $set: {
                    'statutoryDeductions.epf.employerContribution': 13,
                    updatedAt: new Date()
                }
            }
        );

        console.log(`✅ Update Complete!`);
        console.log(`📊 Matched: ${result.matchedCount}`);
        console.log(`📊 Modified: ${result.modifiedCount}`);

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Update failed:', error);
        process.exit(1);
    }
}

updateSalaryStructureEpf();
