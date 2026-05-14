import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { Document } from '../src/models/document.model';
import mongoose from 'mongoose';

/**
 * PREVIEW SCRIPT: Backfill Identity Proof
 * Evaluates how many documents will be mapped to user governmentIds.
 * NO CHANGES ARE APPLIED TO THE DATABASE.
 */
async function previewBackfillIdentityProof() {
    try {
        console.log('🚀 IDENTITY PROOF BACKFILL - PREVIEW MODE\n');
        await connectDB();

        const idTypeToGovernmentKey: Record<string, string> = {
            Aadhaar: "aadhaar",
            PAN: "pan",
            Passport: "passport",
            DriverLicense: "drivingLicense",
            VoterID: "voterId",
            PF: "pf"
        };

        //get
        const query = {
            type: "Certificate",
            category: "Certification",
            "metadata.certificate.certificateType": "IdentityProof",
            "metadata.certificate.verificationStatus": "Verified",
            "metadata.certificate.idDetails.idType": { $in: Object.keys(idTypeToGovernmentKey) }
        };

        const docs = await Document.find(query).sort({ uploadDate: -1 });
        console.log(`🔍 Found ${docs.length} verified identity documents to evaluate.\n`);

        if (docs.length === 0) {
            console.log('No documents found matching the criteria.');
            await mongoose.connection.close();
            process.exit(0);
        }

        // -------

        //preview
        let previewCount = 0;
        const summary: Record<string, number> = {};

        console.log('📄 SAMPLE EVALUATIONS:');
        console.log('-------------------------------------------');

        for (const doc of docs) {
            const idDetails = doc.metadata?.certificate?.idDetails;
            const idType = idDetails?.idType || 'Unknown';
            const idKey = idType ? idTypeToGovernmentKey[idType] : null;

            if (idKey && doc.employeeId) {
                summary[idType] = (summary[idType] || 0) + 1;

                // Show first 5 samples
                if (previewCount < 5) {
                    console.log(`[SAMPLE ${previewCount + 1}]`);
                    console.log(`   User ID: ${doc.employeeId}`);
                    console.log(`   ID Type: ${idType} (mapped to '${idKey}')`);
                    console.log(`   ID Number: ${idDetails?.idNumber || 'N/A'}`);
                    if (idKey === 'pf' && idDetails?.uanNumber) {
                        console.log(`   UAN: ${idDetails.uanNumber}`);
                    }
                    console.log(`   Status: Would be set to 'Verified'`);
                    console.log('   -------------------------------------------');
                }
                previewCount++;
            }
        }

        console.log('\n📊 MIGRATION PREVIEW SUMMARY:');
        console.log(`Total records to be updated: ${previewCount}`);
        console.log('Breakdown by ID Type:');
        console.table(summary);

        console.log('\n⚠️  NO DATABASE CHANGES WERE APPLIED.');
        console.log('To apply these changes, run: npm run ts-node scripts/backfillIdentityProof.ts');
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Preview failed:', error);
        process.exit(1);
    }
}

previewBackfillIdentityProof();
