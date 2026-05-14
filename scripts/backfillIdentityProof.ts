import 'dotenv/config';
import { connectDB } from '../src/config/database';
import { Document } from '../src/models/document.model';
import { User } from '../src/models/user.model';
import mongoose from 'mongoose';

async function backfillIdentityProof() {
    try {
        console.log('Connecting to MongoDB...');
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
        console.log(`Found ${docs.length} verified identity documents to process.`);

        // -------

        //update
        let updatedCount = 0;

        for (const doc of docs) {
            const idDetails = doc.metadata?.certificate?.idDetails;
            const idType = idDetails?.idType;
            const idKey = idType ? idTypeToGovernmentKey[idType] : null;

            if (!idKey || !doc.employeeId || !idDetails) continue;

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

            // Cleaning undefined values
            Object.keys(setData).forEach((key) => {
                if (setData[key] === undefined) delete setData[key];
            });

            const result = await User.updateOne(
                { _id: doc.employeeId },
                { $set: setData }
            );

            if (result.modifiedCount > 0 || result.matchedCount > 0) {
                updatedCount++;
            }
        }

        console.log(`Backfill complete. Users processed: ${updatedCount}`);
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

backfillIdentityProof();
