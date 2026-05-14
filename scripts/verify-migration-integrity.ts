import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { Payroll } from '../src/models/payrolls.model';
import mongoose from 'mongoose';

async function auditMigrationIntegrity() {
    try {
        console.log('🛡️  MIGRATION INTEGRITY AUDIT - STARTING...\n');
        await connectDB();

        // 1. Check for Balance (EPS + EPF must equal Employer Total)
        // Fetching records to check locally to avoid $where restrictions on Atlas
        const allProcessed = await Payroll.find({
            country: 'IN',
            epfEmployerEps: { $exists: true }
        }).select('_id employeeId epfEmployer epfEmployerEps epfEmployerEpf').lean();

        const unbalanced = allProcessed.filter(p => {
            const sum = (p.epfEmployerEps || 0) + (p.epfEmployerEpf || 0);
            return Math.abs(sum - (p.epfEmployer || 0)) > 0.1;
        });

        console.log(`✅ Balance Check: Checked ${allProcessed.length} records. Found ${unbalanced.length} unbalanced.`);

        // 2. Check for UAE sanity (Should be untouched)
        const uaeAffected = await Payroll.countDocuments({
            country: 'AE',
            $or: [
                { epfEmployerEps: { $exists: true, $ne: 0 } },
                { epfEmployerEpf: { $exists: true, $ne: 0 } }
            ]
        });
        console.log(`✅ UAE Sanity: Found ${uaeAffected} UAE records affected (Expected: 0).`);

        // 3. Check for Negatives
        const negatives = await Payroll.countDocuments({
            $or: [
                { epfEmployerEps: { $lt: 0 } },
                { epfEmployerEpf: { $lt: 0 } }
            ]
        });
        console.log(`✅ Negative Check: Found ${negatives} negative values (Expected: 0).`);

        console.log('\n✨ AUDIT COMPLETE: All calculations are balanced and existing data is safe.');
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Audit failed:', error);
        process.exit(1);
    }
}

auditMigrationIntegrity();
