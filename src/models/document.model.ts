import { Document as DocumentM, Schema, Types, model } from 'mongoose';

export interface IDocument extends DocumentM {
    employeeId: Types.ObjectId; // Links to the employee
    type: 'Payslip' | 'TimesheetFile' | 'Form16' | 'Form12B' | 'Form12BB' | 'OfferLetter' | 'HikeLetter' | 'Certificate' | 'AdminUpload' | 'GovernmentId' | 'Academic' | 'Experience' | 'AttendanceFile' | 'TaxProof' | 'FNF Letter'; // Document types
    category: 'Payroll' | 'Timesheet' | 'Tax' | 'EmployeeLifecycle' | 'Certification' | 'Attendance' | 'Settlement'; // Document categories
    tags?: string[]; // e.g., ['2025', 'Confidential', 'Exported', 'Degree', 'Aadhaar']
    fileName: string; // e.g., 'ABCDE1234F_2025-06.xlsx'
    filePath: string; // GCP or local path
    uploadDate: Date;
    uploadedBy?: Types.ObjectId; // Admin/Self or system-generated
    updatedBy?: Types.ObjectId; // Admin/Self who last updated the document 
    expiryDate?: Date; // For documents like certifications
    accessLevel: 'Public' | 'Private' | 'Role-Based'; // Access control
    status: 'Uploaded' | 'Assigned' | 'Acknowledged' | 'Generated' | 'Sent' | 'Exported';
    version: number; // Versioning for document updates
    metadata: {
        payslip?: {
            payrollId: Types.ObjectId | null; // Reference to Payroll collection (null for manually uploaded payslips)
            monthYear: string; // e.g., '2025-06'
            month: number; // 1-12
            year: number; // e.g., 2025
            netSalary: number;
            paySummary: {
                gross: number;
                net: number;
                deductions: number;
                bonus: number;
                reimbursement: number;
            };
            isExport: boolean; // Tracks if payslip was exported/sent
            emailHistory?: Array<{
                sentAt: Date;
                status: 'Sent' | 'Failed';
                sentBy: Types.ObjectId;
                recipientEmail?: string;
                errorMessage?: string;
                messageId?: string;
            }>;
        };
        timesheet?: {
            month: number; // 1-12
            year: number; // e.g., 2025
        };
        form16?: {
            financialYear: string; // e.g., '2024-25'
            pan: string; // e.g., 'ABCDE1234F'
            tdsAmount: number; // Total TDS deducted
        };
        form12B?: {
            previousEmployer: {
                name: string;
                pan: string;
                tan: string;
            };
            employmentPeriod: {
                startDate: Date;
                endDate: Date;
            };
            salaryEarned: number;
            tdsDeducted: number;
            financialYear: string;
            status: 'Pending' | 'Verified' | 'Rejected' | 'ResubmissionRequested';
            isLocked: boolean;
        };
        form12BB?: {
            financialYear: string; // e.g., '2024-25'
            regime: string
            taxDeclarationId: Types.ObjectId; // Reference to TaxDeclaration collection
            totalIncome: number; // Total income for the financial year
            deductions: number; // Total deductions claimed
            taxPayable: number; // Total tax payable after deductions
            isLocked: boolean; // Prevents further modifications once submitted
            isPreviewEnabled: boolean; // Allows preview for employees
            tdsPaid: number; // Total TDS paid for the financial year
        };
        offerLetter?: {
            offerDate?: Date; // Date the offer was issued
            joiningDate?: Date; // Expected joining date
            designation?: string; // e.g., 'Software Engineer'
            ctc?: number; // Cost to Company
            candidateName?: string; // For manual offer letter dispatch
            candidateEmail?: string; // For manual offer letter dispatch
            dispatchId?: string; // Links multiple files in one dispatch
            isAnnexure?: boolean; // Flag for annexure files
        };
        hikeLetter?: {
            effectiveDate: Date; // Date the hike takes effect
            monthlyGross?: number; // Cache monthly gross at time of hike
            newCtc: number; // Updated CTC
            percentageIncrease: number; // e.g., 10 for 10%
            dispatchId?: string; // Links multiple files in one dispatch
            batchName?: string; // User-defined name for the hike cycle
            isAnnexure?: boolean; // Flag for annexure files
            employeeCode?: string; // Cache employee code for robustness
            employeeName?: string; // Cache employee name for robustness
            employeeEmail?: string; // Cache employee email for robustness
            signatoryName?: string; // Cache signatory name natively for easy re-dispatch
            signatoryDesignation?: string; // Cache signatory designation natively
            signatureBase64?: string; // Secret cached string to persist signature image
        };
        certificate?: {
            certificateType: 'Academic' | 'Experience' | 'Skill' | 'IdentityProof'; // Added IdentityProof
            title: string; // e.g., 'B.Tech Computer Science', 'Aadhaar Card'
            issuingAuthority?: string; // e.g., 'University of XYZ', 'UIDAI' (Optional)
            issueDate?: Date; // Date certificate or ID was issued (Optional)
            expiryDate?: Date; // Optional, for IDs like Passport
            certificateId?: string; // Unique ID from issuer (e.g., Aadhaar number, Passport number)
            idDetails?: { // For IdentityProof-specific metadata
                idType: 'Aadhaar' | 'PAN' | 'Passport' | 'DriverLicense' | 'VoterID' | 'PF' | 'Other';
                idNumber: string; // Encrypted or masked (e.g., 'XXXX-XXXX-1234')
                country?: string; // e.g., 'India', 'USA'
                uanNumber?: string; // For PF: Universal Account Number
            };
            skillDetails?: {
                skillName: string; // e.g., 'Cloud Computing', 'Salesforce'
                proficiencyLevel?: string;
                category: string;
            }; // For skill-related certificates

            academicDetails?: { // Added for Degree certificates
                qualificationType: string; // Renamed degreeType to qualificationType
                fieldOfStudy: string; // e.g., 'Computer Science', 'Mechanical Engineering'
                grade?: string; // e.g., 'First Class', '3.8 GPA'
                institution: string; // e.g., 'University of XYZ'
                yearOfCompletion?: number
            };
            experienceDetails?: { // Added for Experience certificates
                companyName: string; // e.g., 'PreviousCorp Inc.'
                role: string; // e.g., 'Software Engineer'
                startDate: Date;
                endDate?: Date; // Optional if still employed
                duration?: string; // e.g., '2 years'
            };

            verificationStatus?: 'Pending' | 'Verified' | 'Rejected'; // For HR verification
            verificationDetails?: {
                verifiedBy: Types.ObjectId; // Admin/HR who verified
                verifiedAt: Date;
                comments?: string; // e.g., 'Verified with UIDAI'
            };
        };
        adminUpload?: {
            documentType: 'Payslip' | 'Timesheet' | 'Other'; // Simple type for admin uploads
            documentName: string; // User-friendly name, e.g., "John Timesheet Jan 2025"
            documentDate: Date; // Document date (e.g., payslip date, timesheet date)
            description?: string; // Optional description
            uploadedAt: Date; // When admin uploaded
        };
        governmentId?: {
            idType: string;
            label: string;
            uploadedAt: Date;
            verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
            verificationDetails?: {
                verifiedBy: Types.ObjectId;
                verifiedAt: Date;
                comments?: string;
            };
        };
        academic?: {
            instituteName: string;
            yearOfPassing?: string;
            grade?: string;
            uploadedAt: Date;
            verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
            verificationDetails?: {
                verifiedBy: Types.ObjectId;
                verifiedAt: Date;
                comments?: string;
            };
        };
        experience?: {
            companyName: string;
            period?: string;
            designation?: string;
            uploadedAt: Date;
            verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
            verificationDetails?: {
                verifiedBy: Types.ObjectId;
                verifiedAt: Date;
                comments?: string;
            };
        };
        attendanceFile?: {
            documentName: string; // User-friendly name for the attendance file
            year: number; // Year for the attendance file (e.g., 2024, 2025)
            uploadedAt: Date; // When admin uploaded
            description?: string; // Optional description
        };
        // Tax POI (Proof of Investment) documents for tax declaration submissions
        taxProof?: {
            taxDeclarationId: Types.ObjectId; // Reference to TaxDeclaration collection
            financialYear: string;            // e.g., '2025-2026'
            section: string;                  // e.g., '80C', '10_13A', '80D'
            subSection: string;               // e.g., 'life_insurance', 'rent_paid'
            documentType: 'standard' | 'landlord_pan_doc'; // standard proof or landlord PAN copy
            uploadedAt: Date;
        };
    };
    auditLog?: Array<{
        action: 'Upload' | 'View' | 'Download' | 'Send' | 'Generate' | 'Acknowledge' | 'Verify' | 'Update' | 'Re-upload' | 'Re-Generate'; // Added Re-Generate for Form12BB
        performedBy: Types.ObjectId;
        timestamp: Date;
        details?: string;
    }>;
}

const documentSchema = new Schema<IDocument>(
    {
        employeeId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
        type: {
            type: String,
            enum: ['Payslip', 'TimesheetFile', 'Form16', 'OfferLetter', 'HikeLetter', 'Certificate', 'Form12B', 'Form12BB', 'AdminUpload', 'GovernmentId', 'Academic', 'Experience', 'AttendanceFile', 'TaxProof', 'FNF Letter'],
            required: true,
        },
        category: {
            type: String,
            enum: ['Payroll', 'Timesheet', 'Tax', 'EmployeeLifecycle', 'Certification', 'Attendance', 'Settlement'],
            required: true,
        },
        tags: [{ type: String }],
        fileName: { type: String, required: true },
        filePath: { type: String, required: true },
        uploadDate: { type: Date, default: Date.now },
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // Admin/Self who last updated the document
        expiryDate: { type: Date },
        version: { type: Number, default: 1, required: true },
        accessLevel: {
            type: String,
            enum: ['Public', 'Private', 'Role-Based'],
            default: 'Private',
        },
        status: {
            type: String,
            enum: ['Uploaded', 'Assigned', 'Acknowledged', 'Generated', 'Sent', 'Exported',],
            default: 'Uploaded',
        },
        metadata: {
            type: Schema.Types.Mixed,
            validate: {
                validator: function (value: any) {
                    // 'this' refers to the document being validated
                    const docType = (this as any).type;
                    if (docType === 'Payslip') {
                        return (
                            value.payslip &&
                            value.payslip.monthYear &&
                            value.payslip.month &&
                            value.payslip.year &&
                            typeof value.payslip.netSalary === 'number' &&
                            value.payslip.paySummary
                        );
                    }
                    if (docType === 'TimesheetFile') {
                        return value.timesheet && value.timesheet.month && value.timesheet.year;
                    }
                    if (docType === 'Form16') {
                        return value.form16 && value.form16.financialYear && value.form16.pan;
                    }
                    if (docType === 'OfferLetter') {
                        return value.offerLetter && (
                            (value.offerLetter.offerDate && value.offerLetter.joiningDate) ||
                            (value.offerLetter.candidateName)
                        );
                    }
                    if (docType === 'HikeLetter') {
                        return value.hikeLetter && value.hikeLetter.effectiveDate && value.hikeLetter.newCtc;
                    }
                    if (docType === 'Form12B') {
                        return (
                            value.form12B &&
                            value.form12B.financialYear &&
                            value.form12B.previousEmployer &&
                            value.form12B.previousEmployer.name &&
                            value.form12B.previousEmployer.pan &&
                            value.form12B.previousEmployer.tan &&
                            value.form12B.employmentPeriod &&
                            value.form12B.employmentPeriod.startDate &&
                            value.form12B.employmentPeriod.endDate &&
                            typeof value.form12B.salaryEarned === 'number' &&
                            typeof value.form12B.tdsDeducted === 'number' &&
                            value.form12B.status &&
                            ['Pending', 'Verified', 'Rejected', 'ResubmissionRequested'].includes(value.form12B.status) &&
                            typeof value.form12B.isLocked === 'boolean'
                        );
                    }
                    if (docType === 'Form12BB') {
                        return (
                            value.form12BB &&
                            value.form12BB.financialYear &&
                            value.form12BB.taxDeclarationId &&
                            value.form12BB.employeeId &&
                            typeof value.form12BB.totalIncome === 'number' &&
                            typeof value.form12BB.deductions === 'number' &&
                            typeof value.form12BB.taxPayable === 'number' &&
                            typeof value.form12BB.isLocked === 'boolean' &&
                            typeof value.form12BB.tdsPaid === 'number' &&
                            typeof value.form12BB.isPreviewEnabled === 'boolean'
                        );
                    }
                    if (docType === 'Certificate') {
                        return (
                            value.certificate &&
                            value.certificate.certificateType &&
                            value.certificate.title &&
                            (value.certificate.certificateType === 'Academic' ? value.certificate.academicDetails && value.certificate.academicDetails.qualificationType && value.certificate.academicDetails.institution : true) &&
                            (value.certificate.certificateType === 'Experience' ? value.certificate.experienceDetails && value.certificate.experienceDetails.companyName && value.certificate.experienceDetails.startDate : true) &&
                            (value.certificate.certificateType === 'Skill' ? value.certificate.skillDetails && value.certificate.skillDetails.skillName : true) &&
                            (value.certificate.certificateType === 'IdentityProof' ? value.certificate.idDetails && value.certificate.idDetails.idType && value.certificate.idDetails.idNumber && (value.certificate.idDetails.idType !== 'PF' || value.certificate.idDetails.uanNumber) : true)

                        );
                    }
                    if (docType === 'AdminUpload') {
                        return (
                            value.adminUpload &&
                            value.adminUpload.documentType &&
                            value.adminUpload.documentName &&
                            value.adminUpload.documentDate &&
                            value.adminUpload.uploadedAt
                        );
                    }
                    if (docType === 'GovernmentId') {
                        return value.governmentId && value.governmentId.idType && value.governmentId.label && value.governmentId.uploadedAt;
                    }
                    if (docType === 'Academic') {
                        return value.academic && value.academic.instituteName && value.academic.uploadedAt;
                    }
                    if (docType === 'Experience') {
                        return value.experience && value.experience.companyName && value.experience.uploadedAt;
                    }
                    if (docType === 'AttendanceFile') {
                        return value.attendanceFile && value.attendanceFile.documentName && value.attendanceFile.year && value.attendanceFile.uploadedAt;
                    }
                    // Tax POI proof — uploaded via tax-declaration updateDocuments flow
                    if (docType === 'TaxProof') {
                        return (
                            value.taxProof &&
                            value.taxProof.taxDeclarationId &&
                            value.taxProof.financialYear &&
                            value.taxProof.section &&
                            value.taxProof.subSection &&
                            value.taxProof.documentType
                        );
                    }

                    return true;
                },
                message: (props) =>
                    `Metadata validation failed for type ${(props as any).parent?.type || 'Unknown'}`,
            },
        },
        auditLog: [
            {
                action: {
                    type: String,
                    enum: ['Upload', 'Update', 'View', 'Download', 'Send', 'Generate', 'Acknowledge', 'Verify', 'Update', 'Re-upload', 'Re-Generate'], // Added Re-Generate for Form12BB
                    required: true,
                },
                performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
                timestamp: { type: Date, default: Date.now },
                details: { type: String },
            },
        ],
    },
    { timestamps: true }
);

// Indexes for efficient queries
documentSchema.index({ employeeId: 1, type: 1 });
documentSchema.index({ type: 1, 'metadata.payslip.monthYear': 1 });
documentSchema.index({ type: 1, 'metadata.timesheet.month': 1, 'metadata.timesheet.year': 1 });
documentSchema.index({ type: 1, 'metadata.form16.financialYear': 1 });
documentSchema.index({ type: 1, 'metadata.offerLetter.offerDate': 1 });
documentSchema.index({ type: 1, 'metadata.hikeLetter.effectiveDate': 1 });
documentSchema.index({ type: 1, 'metadata.certificate.certificateType': 1 }); // Added for certificates
documentSchema.index({ type: 1, 'metadata.certificate.academicDetails.qualificationType': 1 }); // Added for academic certificates
documentSchema.index({ type: 1, 'metadata.form12B.financialYear': 1 }, { partialFilterExpression: { type: 'Form12B' } });
documentSchema.index({ type: 1, 'metadata.attendanceFile.year': 1 }); // Added for attendance files

// Unique constraints for multiple instances
documentSchema.index(
    { employeeId: 1, type: 1, 'metadata.payslip.month': 1, 'metadata.payslip.year': 1 },
    { unique: true, partialFilterExpression: { type: 'Payslip' } }
);
documentSchema.index(
    { employeeId: 1, type: 1, 'metadata.timesheet.month': 1, 'metadata.timesheet.year': 1 },
    { unique: true, partialFilterExpression: { type: 'TimesheetFile' } }
);
documentSchema.index(
    { employeeId: 1, type: 1, 'metadata.form16.financialYear': 1 },
    { unique: true, partialFilterExpression: { type: 'Form16' } }
);

documentSchema.index(
    { employeeId: 1, type: 1, 'metadata.certificate.certificateType': 1, 'metadata.certificate.certificateId': 1 },
    { unique: true, partialFilterExpression: { type: 'Certificate', 'metadata.certificate.certificateId': { $exists: true } } } // Unique for certificates with certificateId
);

export const Document = model<IDocument>('Document', documentSchema);