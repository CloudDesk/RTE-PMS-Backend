import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SalaryStructure } from '../src/models/salary-structure.model';

dotenv.config();

const DEFAULT_STRUCTURE_NAME = 'UAE Standard Structure';

async function seedUaeSalaryStructure() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI must be provided in the environment');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const upsertPayload = {
      name: DEFAULT_STRUCTURE_NAME,
      country: 'AE' as const,
      fixedEarnings: {
        basicPercentage: 45,
        hraPercentage: 0,
        daPercentage: 0,
        otherAllowancePercentage: 40,
        travelAllowancePercentage: 0, // ✅ CHANGED: Travel allowance now handled in salary assignment
        reimbursementPercentage: 5,
        deductionPercentage: 5,
        comment: 'Default UAE payroll template. Note: Travel allowance is now set as a fixed amount in employee salary assignment.',
      },
      statutoryDeductions: {
        epf: {
          employeeContribution: 0,
          employerContribution: 0,
          maxLimit: 0,
        },
        esi: {
          employeeContribution: 0,
          employerContribution: 0,
          applicabilityLimit: 0,
        },
        professionalTax: {
          state: 'N/A',
          term: 'Monthly',
          slabs: [],
        },
      },
    };

    const result = await SalaryStructure.findOneAndUpdate(
      { name: DEFAULT_STRUCTURE_NAME },
      upsertPayload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log('Upserted UAE salary structure:', result?._id?.toString());
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed UAE salary structure', error);
    process.exit(1);
  }
}

seedUaeSalaryStructure();
