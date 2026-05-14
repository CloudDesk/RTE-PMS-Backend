import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { Payroll } from '../src/models/payrolls.model';
import mongoose from 'mongoose';

async function previewEpfSplit() {
    try {
        console.log('🚀 EPF/EPS SPLIT BACKFILL - PREVIEW MODE\n');
        await connectDB();

        //get
        const query = {
            country: 'IN',
            $or: [
                { epfEmployerEps: { $exists: false } },
                { epfEmployerEps: 0 }
            ]
        };

        const records = await Payroll.find(query).limit(10).lean();
        console.log(`🔍 Found ${records.length} sample records to evaluate for backfill.\n`);

        // -------

        //preview
        console.log('📊 CALCULATION PREVIEW:');
        console.log('--------------------------------------------------------------------------------');
        console.log('| Employee ID             | Total EPF | Basic+DA | Calculated EPS | Calculated EPF |');
        console.log('--------------------------------------------------------------------------------');

        for (const record of records) {
            const basicPlusDa = (record.basic || 0) + (record.da || 0);
            const epfTotal = (record.epfEmployer || 0);
            
            let epsValue = 0;
            let epfValue = 0;

            // Logic: Skip calculation if employer contribution is 0 or less (Consultancy/Interns)
            if (epfTotal > 0) {
                const epsPercentage = 8.33;
                const epsWageCap = 15000;
                const currentWageForEps = Math.min(basicPlusDa, epsWageCap);
                epsValue = Number(((epsPercentage / 100) * currentWageForEps).toFixed(2));
                epfValue = Number((epfTotal - epsValue).toFixed(2));
            }

            console.log(`| ${String(record.employeeId).padEnd(23)} | ${String(epfTotal).padEnd(9)} | ${String(basicPlusDa).padEnd(8)} | ${String(epsValue).padEnd(14)} | ${String(epfValue).padEnd(14)} |`);
        }

        console.log('--------------------------------------------------------------------------------');
        console.log(`\nNote: EPF = Total Employer PF - EPS (Pension). Cap used: ₹${15000}`);
        console.log('\n⚠️  NO DATABASE CHANGES WERE APPLIED.');
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Preview failed:', error);
        process.exit(1);
    }
}

previewEpfSplit();
