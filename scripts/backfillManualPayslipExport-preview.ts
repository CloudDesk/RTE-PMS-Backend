import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { Document } from '../src/models/document.model';
import mongoose from 'mongoose';

async function previewManualPayslipExport() {
    try {
        console.log('🚀 MANUAL PAYSLIP EXPORT BACKFILL - PREVIEW MODE\n');
        await connectDB();

        //get
        const query = {
            type: 'Payslip',
            $or: [
                { 'isManual': true },
                { 'metadata.payslip.isManual': true },
                { 'metadata.payslip.payrollId': null },
                { 'metadata.payslip.payrollId': { $exists: false } }
            ]
        };

        // -------

        //preview
        const manualCount = await Document.countDocuments(query);
        const regularCount = await Document.countDocuments({ 
            type: 'Payslip', 
            'metadata.payslip.payrollId': { $exists: true, $ne: null } 
        });

        console.log('📊 MIGRATION PREVIEW:');
        console.log(`Target: 'isExport: true' -> ${manualCount} manual records`);
        console.log(`Verified: Regular payroll records (safe) -> ${regularCount} records`);
        console.log(`-------------------------------------------`);

        if (manualCount > 0) {
            const sample = await Document.findOne(query).select('fileName metadata.payslip.monthYear');
            console.log('\n📄 Sample Manual Payslip:');
            console.log(`   File: ${sample?.fileName || 'N/A'}, Month: ${sample?.metadata?.payslip?.monthYear || 'N/A'}`);
        }

        console.log('\n⚠️  NO DATABASE CHANGES WERE APPLIED.');
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Preview failed:', error);
        process.exit(1);
    }
}

previewManualPayslipExport();
