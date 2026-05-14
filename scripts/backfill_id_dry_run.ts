import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { Document } from '../src/models/document.model';
import { User } from '../src/models/user.model';
import mongoose from 'mongoose';

async function dryRunBackfill() {
    try {
        console.log('🚀 IDENTITY PROOF BACKFILL - DRY RUN MODE\n');
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
        console.log(`🔍 Found ${docs.length} verified documents to evaluate.\n`);

        // -------

        //preview
        let pendingUpdates = 0;
        let summary: Record<string, number> = {};

        for (const doc of docs) {
            const idDetails = doc.metadata?.certificate?.idDetails;
            const idType = idDetails?.idType;
            const idKey = idType ? idTypeToGovernmentKey[idType] : null;

            if (!idKey || !doc.employeeId) continue;

            const setData: any = {
                [`governmentIds.${idKey}.number`]: idDetails.idNumber,
                [`governmentIds.${idKey}.country`]: idDetails.country,
                [`governmentIds.${idKey}.documentUrl`]: doc.filePath,
                [`governmentIds.${idKey}.documentId`]: doc._id,
                [`governmentIds.${idKey}.verificationStatus`]: "Verified"
            };

            if (idKey === "pf" && idDetails.uanNumber) {
                setData["governmentIds.pf.uan"] = idDetails.uanNumber;
            }

            // Preview first 5 records in detail (reduced for brevity)
            if (pendingUpdates < 5) {
                console.log(`[PREVIEW ${pendingUpdates + 1}] User ID: ${doc.employeeId}`);
                console.log(`   Type: ${idType} (${idKey})`);
                console.log(`   Update: ${JSON.stringify(setData)}`);
                console.log('   -----------------------------------');
            }

            pendingUpdates++;
            summary[idType as string] = (summary[idType as string] || 0) + 1;
        }

        console.log('\n📊 DRY RUN SUMMARY:');
        console.log(`Total records that would be updated: ${pendingUpdates}`);
        console.log('Distribution by Type:', JSON.stringify(summary, null, 2));

        console.log('\n⚠️  NO DATABASE CHANGES WERE APPLIED.');
        
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Dry run failed:', error);
        process.exit(1);
    }
}

dryRunBackfill();
