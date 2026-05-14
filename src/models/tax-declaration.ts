import { Schema, model, Document, Types } from "mongoose";
interface ISlabwiseTax {
    slab: string;
    amount: number;
    fromAmount: number;
    toAmount?: number | null;
}
interface ITaxBreakdown {
    taxAmount: number; //SBT
    slabwiseTax: ISlabwiseTax[];
    cessAmount: number;
    totalTaxAmount: number; //taxAmount after the rebate/relief
    taxableIncome: number;
    rebateAmount: number; // Added for Rebate 87A(a)
    isRebateApplicable: boolean; // Flag for rebate eligibility
    marginalReliefAmount: number; // Added for Marginal Relief 87A(b)
    isMarginalReliefApplicable: boolean; // Flag for marginal relief eligibility
    taxWithCess: number; // Tax before Form12B TDS deduction
    form12bTDSAmount?: number; // TDS from Form12B
    finalTaxWithCess: number; // Final tax after rebate/relief, cess and Form 12B TDS
    ptDeduction?: number; // Annual PF deduction

}
interface IDocument {
    documentName: string;
    documentPath: string;
    uploadDate: Date;
    isLatestVersion: boolean;
    documentType?: string;
}
interface IMonthlyTaxDeduction {
    month: string;              // e.g., "Apr", "May", etc.
    financialYear: string;               // e.g., 2023, 2024
    plannedDeduction: number;   // Original planned deduction
    actualDeduction: number;    // What was actually deducted
    adjustmentAmount: number;   // Any adjustment applied this month
    plannedDate: Date;        // When the deduction occurred
    isProcessed: boolean;       // Whether this month's deduction has been processed
}

// Migration Adjustment Interface (for HRMS migration in December 2025)
interface IMigrationAdjustment {
    appliedForFY: string;                      // FY for which migration was applied (e.g., "2025-2026")
    uploadedAt: Date;                          // When Excel was uploaded
    uploadedBy?: Types.ObjectId;         // Admin who uploaded (optional)
    externalTaxPaid: number;                   // Tax paid in external system (Apr-Dec)
    externalTaxPaidMonths: number;             // Number of months tax paid externally (e.g., 9)
    newSystemTaxToPay: number;                 // Tax to be paid in new system (Jan-Mar)
    newSystemTaxMonths: number;                // Number of months remaining (e.g., 3)
    totalMigratedTaxLiability: number;         // ✅ True Final Tax (e.g. 1.20L) from Excel
    originalMonthlyDeductions?: IMonthlyTaxDeduction[]; // Backup of system-calculated plan
    overrideReason: string;                    // e.g., "HRMS Migration December 2025"
}
interface IDeclaration {
    section: string;          // "80C", "80D", etc.
    subSection: string;       // "Life Insurance", "Health Insurance", etc.
    maxLimit: number;         // Maximum allowed limit for this section/subsection
    limitType: "fixed" | "percentage" | "none";
    limitPercentage: number;
    description: string;      // Description of the declaration
    declaredAmount: number;
    verifiedAmount: number;
    status: "pending" | "verified" | "rejected" | "resubmission_requested" | "document_submitted";
    type?: "income" | "loss";

    documents: IDocument[];
    rentDetails?: {
        month: string;
        amount: number;
        landlordName?: string;
        landlordPan?: string;
    }[];
    reviewHistory: {
        reviewedBy: Types.ObjectId;
        reviewDate: Date;
        status: "verified" | "rejected" | "resubmission_requested";
        comments: string;
    }[];
    lastUpdated: Date;
    resubmissionInfo: {
        isResubmitted: boolean;      // Whether resubmission occurred
        resubmissionDeadline?: Date; // Deadline for resubmission
        previouslyRejected: boolean; // Whether it was previously rejected
        resubmissionAllowed: boolean; // Whether further resubmission is allowed
        rejectionCount: number;      // Count of rejections (max 2)
    };
}
export interface ITaxDeclaration extends Document {
    employeeId: Types.ObjectId;
    financialYear: string;
    regime: "old" | "new";
    declarations: IDeclaration[];
    cessRate: number;
    annualGross: number;
    totalDeclaredAmount: number;
    totalVerifiedAmount: number;
    totalDeclinedAmount: number;        // Track declined amounts separately
    standardDeduction: number;
    ptDeduction: number;                // Annual PF (Provident Fund) deduction
    initialTaxCalculated: boolean;      // Track if initial tax was calculated

    // Tax amounts
    calculatedTaxAmount: number;        // Initial calculated tax
    revisedTaxAmount: number;           // Tax after verification/rejection
    previousTaxAmount: number;          // Tax amount before resubmission/last adjustment
    taxPaid: number;                    // Tax already paid so far
    remainingTaxToPay: number;          // Tax still to be deducted this FY

    // Adjustment tracking
    taxAdjustmentRequired: boolean;
    adjustmentAmount: number;       // Positive for additional tax, negative for refund
    adjustmentReason: "declarations_declined" | "declarations_approved" | "salary_revision" | "revised_declaration" | "form12b_tds_adjustment" | "migration_initialization" | "missing_proof_rejection" | "other";
    monthlyAdjustment: number;      // Adjustment amount per remaining month
    remainingMonths: number;        // Number of months left for adjustment
    lastAdjustmentDate: Date;       // When adjustment was last calculated
    adjustmentDistribution: "equal" | "prorated" | "one_time"; // How to distribute adjustment

    // For handling mid-year declarations and adjustments
    initialDeclarationDate: Date;   // When first declaration was made
    lastDeclarationDate: Date;      // When last declaration was made
    monthlyDeductions: IMonthlyTaxDeduction[]; // Track deductions by month

    // For negative adjustments
    noFurtherTaxDeduction: boolean; // Flag when employee claims refund from govt
    excessTaxPaid: number;          // Track excess tax if any

    poiSubmissionStatus: "not_submitted" | "partial_submitted" | "submitted" | "verified" | "rejected" | "resubmission";
    reviewHistory: [
        {
            reviewedBy: Types.ObjectId;
            reviewDate: Date;
            action: "verified" | "rejected" | "resubmission_requested" | "document_submitted";
            comments: string;
        }
    ];
    isLocked: boolean; // True when declaration window is closed
    initialTaxBreakdown: ITaxBreakdown;
    _id?: Types.ObjectId;
    isDeclared: boolean;
    isPOISubmitted: boolean;
    isResubmitted: boolean;   // Whether any declaration DOCS has been resubmitted
    form12B?: Types.ObjectId;
    salaryAssignments: {
        assignmentId: Types.ObjectId;
        validFrom: Date;
        validTill: Date;
        monthlyGross: number;
        isActive: boolean;
    }[];

    isForm12BApplicable: boolean;

    // Migration Adjustment (for HRMS migration - December 2025)
    isMigrationAdjusted: boolean;              // Flag to identify migration-adjusted records
    isMigrationInitialized: boolean;           // NEW: Flag for one-time initialization
    migrationAdjustment?: IMigrationAdjustment; // Migration override data
    isSubmissionsEnabled: boolean;             // NEW: Toggle to lock user declarations

    createdAt?: Date;
    updatedAt?: Date;
}
const DocumentSchema = new Schema<IDocument>({
    documentName: { type: String, required: true },
    documentPath: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    isLatestVersion: { type: Boolean, default: true },
    documentType: { type: String }
});
const MonthlyTaxDeductionSchema = new Schema<IMonthlyTaxDeduction>({
    month: { type: String, required: true },
    financialYear: { type: String, required: true },
    plannedDeduction: { type: Number, default: 0 },
    actualDeduction: { type: Number, default: 0 },
    adjustmentAmount: { type: Number, default: 0 },
    plannedDate: { type: Date },
    isProcessed: { type: Boolean, default: false }
});

const RentDetailSchema = new Schema({
    month: { type: String, required: true },
    amount: { type: Number, required: true },
    landlordName: { type: String },
    landlordPan: { type: String }
}, { _id: false });

const DeclarationSchema = new Schema<IDeclaration>({

    section: {
        type: String,
        required: true,
        enum: ["10_13A", "80C", "80D", "80DD", "80E", "80G", "80TTA", "80GG", "80CCG", "80U", "80CCD2", "80RRB", "80DDB", "80CCD(1)", "80CCD(2)", "10(14)", "10(13A)", "24(b)", "80EEA", "income_loss_house_property"]
    },
    subSection: { type: String, required: true },
    maxLimit: { type: Number, required: true },
    limitType: {
        type: String,
        enum: ["fixed", "percentage", "none"],
        default: "fixed"
    },
    limitPercentage: { type: Number, required: false },
    description: { type: String },
    declaredAmount: { type: Number, default: 0 },
    verifiedAmount: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ["pending", "verified", "rejected", "resubmission_requested", "document_submitted"],
        default: "pending"
    },
    type: {
        type: String,
        enum: ["income", "loss"]
    },
    rentDetails: { type: [RentDetailSchema], default: undefined },
    documents: [DocumentSchema],
    reviewHistory: [{
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewDate: { type: Date, default: Date.now },
        status: {
            type: String,
            enum: ["verified", "rejected", "resubmission_requested"]
        },
        comments: String
    }],
    lastUpdated: { type: Date, default: Date.now },
    resubmissionInfo: {
        isResubmitted: { type: Boolean, default: false },
        resubmissionDeadline: { type: Date },
        previouslyRejected: { type: Boolean, default: false },
        resubmissionAllowed: { type: Boolean, default: false },
        rejectionCount: { type: Number, default: 0 }
    }
});

const TaxDeclarationSchema = new Schema<ITaxDeclaration>({
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    financialYear: { type: String, required: true },
    regime: { type: String, enum: ["old", "new"], required: true },
    declarations: [DeclarationSchema],
    annualGross: { type: Number, default: 0 },
    cessRate: { type: Number, default: 0 },
    totalDeclaredAmount: { type: Number, default: 0 },
    totalVerifiedAmount: { type: Number, default: 0 },
    totalDeclinedAmount: { type: Number, default: 0 },
    standardDeduction: { type: Number, required: true },
    ptDeduction: { type: Number, default: 0 },
    initialTaxCalculated: { type: Boolean, default: false },

    // Tax amounts
    calculatedTaxAmount: { type: Number, default: 0 },
    revisedTaxAmount: { type: Number, default: 0 },
    previousTaxAmount: { type: Number, default: 0 },
    taxPaid: { type: Number, default: 0 },
    remainingTaxToPay: { type: Number, default: 0 },

    // Adjustment tracking
    taxAdjustmentRequired: { type: Boolean, default: false },
    adjustmentAmount: { type: Number, default: 0 },
    monthlyAdjustment: { type: Number, default: 0 },
    remainingMonths: { type: Number, default: 0 },
    lastAdjustmentDate: { type: Date },
    adjustmentReason: { type: String, enum: ["declarations_declined", "declarations_approved", "revised_declaration", "salary_revision", "form12b_tds_adjustment", "migration_initialization", "missing_proof_rejection", "other"] },
    adjustmentDistribution: { type: String, enum: ["equal", "prorated", "one_time"], default: "equal" },

    // For handling mid-year declarations and adjustments
    initialDeclarationDate: { type: Date },
    lastDeclarationDate: { type: Date },
    monthlyDeductions: [MonthlyTaxDeductionSchema],

    // For negative adjustments
    noFurtherTaxDeduction: { type: Boolean, default: false },
    excessTaxPaid: { type: Number, default: 0 },

    poiSubmissionStatus: {
        type: String,
        enum: ["not_submitted", "submitted", "verified", "rejected", "resubmission", "partial_submitted"],
        default: "not_submitted"
    },
    reviewHistory: [
        {
            reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
            reviewDate: { type: Date },
            action: { type: String, enum: ["verified", "rejected", "resubmission_requested"] },
            comments: { type: String },
        },
    ],
    isLocked: { type: Boolean, default: false },
    isSubmissionsEnabled: { type: Boolean, default: false },
    initialTaxBreakdown: {
        taxAmount: { type: Number, default: 0 }, // SBT
        slabwiseTax: [
            {
                slab: { type: String },
                amount: { type: Number },
                fromAmount: { type: Number },
                toAmount: { type: Number, default: null, require: false }
            }
        ],
        cessAmount: { type: Number, default: 0 },
        totalTaxAmount: { type: Number, default: 0 },
        taxableIncome: { type: Number, default: 0 },
        rebateAmount: { type: Number, default: 0 }, // Added for Rebate 87A(a)
        isRebateApplicable: { type: Boolean, default: false }, // Flag for rebate eligibility
        marginalReliefAmount: { type: Number, default: 0 }, // Added for Marginal Relief 87A(b)
        isMarginalReliefApplicable: { type: Boolean, default: false }, // Flag for marginal relief eligibility
        taxWithCess: { type: Number, default: 0 }, // Tax before Form12B TDS deduction
        form12bTDSAmount: { type: Number, default: 0 }, // TDS amount from Form 12B, if applicable
        finalTaxWithCess: { type: Number, default: 0 }, // Final tax after rebate/relief , cess and Form 12B TDS
        ptDeduction: { type: Number, default: 0 } // Annual Professional Tax deduction
    },
    isDeclared: { type: Boolean, default: false },
    isPOISubmitted: { type: Boolean, default: false },
    isResubmitted: { type: Boolean, default: false },
    form12B: { type: Schema.Types.ObjectId, ref: 'Form12B' }, // Reference to Form 12B
    salaryAssignments: [{
        assignmentId: { type: Schema.Types.ObjectId, ref: 'SalaryAssignment' },
        validFrom: { type: Date, required: true },
        validTill: { type: Date, required: true },
        monthlyGross: { type: Number, required: true },
        isActive: { type: Boolean, default: false }
    }],
    isForm12BApplicable: { type: Boolean, default: false },

    // Migration Adjustment (for HRMS migration - December 2025)
    isMigrationAdjusted: { type: Boolean, default: false },
    isMigrationInitialized: { type: Boolean, default: false },
    migrationAdjustment: {
        appliedForFY: { type: String },
        uploadedAt: { type: Date },
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        externalTaxPaid: { type: Number, default: 0 },
        externalTaxPaidMonths: { type: Number, default: 0 },
        newSystemTaxToPay: { type: Number, default: 0 },
        newSystemTaxMonths: { type: Number, default: 0 },
        totalMigratedTaxLiability: { type: Number, default: 0 }, // ✅ Added field to schema
        originalMonthlyDeductions: [MonthlyTaxDeductionSchema],
        overrideReason: { type: String }
    }

},
    {
        timestamps: true
    })

// Add indexes for efficient queries
TaxDeclarationSchema.index({ employeeId: 1, financialYear: 1 }, { unique: true });
TaxDeclarationSchema.index({ financialYear: 1 });


export const TaxDeclaration = model<ITaxDeclaration>('TaxDeclaration', TaxDeclarationSchema)



/*
// Pre-save middleware to ensure consistency
TaxDeclarationSchema.pre('save', function (next) {
    // Update isResubmitted based on declarations
    this.isResubmitted = this.declarations.some(decl => decl.resubmissionInfo.isResubmitted);

    // Calculate totalDeclinedAmount (declarations that were rejected)
    this.totalDeclinedAmount = this.declarations
        .filter(decl => decl.status === 'rejected')
        .reduce((sum, decl) => sum + decl.declaredAmount, 0);

    // Update remainingTaxToPay field
    this.remainingTaxToPay = this.revisedTaxAmount - this.taxPaid;

    // If refund eligible, set appropriate flags
    if (this.remainingTaxToPay < 0) {
        this.excessTaxPaid = Math.abs(this.remainingTaxToPay);
        // this.refundEligible = true;
    }

    next();
});
*/