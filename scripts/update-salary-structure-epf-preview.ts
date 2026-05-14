import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { SalaryStructure } from '../src/models/salary-structure.model';
import mongoose from 'mongoose';

/**
 * PREVIEW SCRIPT: Salary Structure EPF Update
 * Evaluates how many Indian salary structures need their EPF employer contribution updated to 13%.
 * NO CHANGES ARE APPLIED TO THE DATABASE.
 */
async function previewUpdateSalaryStructureEpf() {
    try {
        console.log('🚀 SALARY STRUCTURE EPF UPDATE - PREVIEW MODE\n');
        await connectDB();

        //get
        const query = {
            country: 'IN',
            'statutoryDeductions.epf.employerContribution': { $ne: 13 }
        };

        const totalToUpdate = await SalaryStructure.countDocuments(query);
        const totalInIndia = await SalaryStructure.countDocuments({ country: 'IN' });

        console.log('📊 MIGRATION PREVIEW:');
        console.log(`-------------------------------------------`);
        console.log(`Total Salary Structures (India): ${totalInIndia}`);
        console.log(`Structures needing update (!= 13%): ${totalToUpdate}`);
        console.log(`-------------------------------------------`);

        if (totalToUpdate > 0) {
            // Show a few samples
            const samples = await SalaryStructure.find(query).limit(3).select('name statutoryDeductions.epf.employerContribution');
            console.log('\n📄 SAMPLE RECORDS TO BE UPDATED:');
            samples.forEach((s, i) => {
                console.log(`${i + 1}. Name: ${s.name || 'N/A'}`);
                console.log(`   Current Contribution: ${s.statutoryDeductions?.epf?.employerContribution}%`);
            });
        } else {
            console.log('\n✅ All Indian salary structures are already at 13%. No updates needed.');
        }

        console.log('\n⚠️  NO DATABASE CHANGES WERE APPLIED.');
        console.log('To apply these changes, run: npx ts-node scripts/update-salary-structure-epf.ts');
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Preview failed:', error);
        process.exit(1);
    }
}

previewUpdateSalaryStructureEpf();
