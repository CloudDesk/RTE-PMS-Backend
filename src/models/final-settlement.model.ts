
import { Schema, Document, Types, model } from 'mongoose';

// Enhanced with component breakdown for unpaid months

// Reimbursement Item Interface
export interface IReimbursementItem {
    type: 'travel' | 'medical' | 'mobile' | 'relocation' | 'certification' | 'other';
    description: string;
    amount: number; // Positive = company pays employee, Negative = employee pays company
    date: Date;
    receiptUrl?: string;

    // For certifications only
    completionDate?: Date;
    monthsWorkedAfterCompletion?: number;
    requiredMonths?: number;
    isEligible?: boolean;
}

// Final Settlement Document Interface
export interface IFinalSettlement extends Document {
    employeeId: Types.ObjectId;
    employeeName: string;
    employeeCode: string;

    // Step 2: Resignation Details
    resignationSubmittedOn: Date;
    leavingDate: Date; // Last Working Day
    leavingReason: string;
    settlementDate: Date;

    // Step 3: Notice Pay
    noticeRequired: boolean;
    noticePeriodDays: number;
    daysServed: number;
    excessInNotice: number; // Positive = excess, Negative = shortfall
    noticePeriodRecovery: number; // Amount to deduct if shortfall

    // Step 4: Work Days
    lastPaidMonth: string; // e.g., "Sep 2025"
    lastPaidMonthDate: Date; // For sorting/filtering

    // Hold payrolls (auto-detected)
    holdPayrolls: Array<{
        payrollId: Types.ObjectId;
        month: number;
        year: number;
        monthYear: string;
        netSalary: number;
        monthlyGross: number;
        totalDays: number;
        daysWorked: number;
        presentDays: number;
        lopDays: number;
        status: string;
    }>;
    totalHoldAmount: number;

    // Unpaid months (partial/full)
    unpaidMonths: Array<{
        monthYear: string;
        month: number;
        year: number;
        totalDays: number;
        daysWorked: number;
        presentDays: number;
        weekendDays: number;
        holidayDays: number;
        leaveDays: number;
        lopDays: number;
        lopAmount: number;       // ✅ LOP deduction amount

        // ✅ Salary component breakdown
        components: {
            basic: number;
            hra: number;
            conveyance: number;
            specialAllowance: number;
            otherAllowances: number;
            gross: number;
        };

        salary: number;          // Net salary (gross - LOP)
        professionalTax: number;
        incomeTax: number;       // ✅ Added TDS
        providentFund: number;
        epfEmployer: number;      // ✅ Added Employer Total
        epfEmployerEps: number;   // ✅ Added EPS Split
        epfEmployerEpf: number;   // ✅ Added EPF Split
        esi: number;
    }>;
    totalUnpaidSalary: number;

    totalDaysWorked: number;

    // Step 5: Leave Encashment
    leaveBalance: Array<{
        leaveType: string;
        balance: number; // Can be negative
        encashDays: number; // Can be negative (deduction)
        perDayRate: number;
        encashAmount: number; // Positive = addition, Negative = deduction
    }>;
    totalLeaveEncashment: number; // Net amount (can be negative)

    // Step 6: Reimbursements & Deductions
    reimbursements: Array<IReimbursementItem>;
    totalReimbursements: number; // Sum of all reimbursement amounts (can be +/-)

    otherDeductions: Array<{
        description: string;
        amount: number; // Always positive, will be deducted
    }>;
    totalOtherDeductions: number;

    otherAdditions: Array<{
        description: string;
        amount: number; // Always positive, will be added
    }>;
    totalOtherAdditions: number;

    // Final Calculation
    finalCalculation: {
        // Payable amounts
        holdSalaries: number;
        unpaidSalaries: number;
        leaveEncashment: number; // Can be negative
        reimbursements: number; // Can be negative
        otherAdditions: number;
        gratuity: number; // ✅ Added
        totalPayable: number;

        // Deductions
        noticePeriodRecovery: number;
        professionalTax: number;
        incomeTax: number;       // ✅ Added TDS
        providentFund: number;   // ✅ Added
        epfEmployer: number;     // ✅ Added Employer Total
        epfEmployerEps: number;  // ✅ Added EPS Split
        epfEmployerEpf: number;  // ✅ Added EPF Split
        esi: number;             // ✅ Added
        otherDeductions: number;
        totalDeductions: number;

        // Net
        netAmount: number;
        isNegative: boolean; // True if employee owes company
    };

    // Status & Tracking
    status: 'Draft' | 'Confirmed';
    mode: 'automatic' | 'manual'; // How data was populated
    initiatedAt: Date;
    initiatedBy: Types.ObjectId;
    confirmedAt?: Date;
    confirmedBy?: Types.ObjectId;
    pdfUrl?: string;
    remarks?: string;

    // Audit Tracking for edits after confirmation
    lastEditedAt?: Date;
    lastEditedBy?: Types.ObjectId;

    // Metadata
    createdAt: Date;
    updatedAt: Date;
}

const finalSettlementSchema = new Schema<IFinalSettlement>(
    {
        employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        employeeName: { type: String, required: true },
        employeeCode: { type: String, required: true },

        // Step 2: Resignation Details
        resignationSubmittedOn: { type: Date, required: true },
        leavingDate: { type: Date, required: true },
        leavingReason: { type: String, required: true },
        settlementDate: { type: Date, required: true },

        // Step 3: Notice Pay
        noticeRequired: { type: Boolean, default: false },
        noticePeriodDays: { type: Number, default: 0 },
        daysServed: { type: Number, default: 0 },
        excessInNotice: { type: Number, default: 0 },
        noticePeriodRecovery: { type: Number, default: 0 },

        // Step 4: Work Days
        lastPaidMonth: { type: String, required: true },
        lastPaidMonthDate: { type: Date, required: true },

        holdPayrolls: [{
            payrollId: { type: Schema.Types.ObjectId, ref: 'Payroll', required: true },
            month: { type: Number, required: true },
            year: { type: Number, required: true },
            monthYear: { type: String, required: true },
            netSalary: { type: Number, required: true },
            monthlyGross: { type: Number, required: true },
            totalDays: { type: Number, default: 0 },
            daysWorked: { type: Number, default: 0 },
            presentDays: { type: Number, default: 0 },
            lopDays: { type: Number, default: 0 },
            status: { type: String, required: true }
        }],
        totalHoldAmount: { type: Number, default: 0 },

        unpaidMonths: [{
            monthYear: { type: String, required: true },
            month: { type: Number, required: true },
            year: { type: Number, required: true },
            totalDays: { type: Number, required: true },
            daysWorked: { type: Number, required: true },
            presentDays: { type: Number, default: 0 },
            weekendDays: { type: Number, default: 0 },
            holidayDays: { type: Number, default: 0 },
            leaveDays: { type: Number, default: 0 },
            lopDays: { type: Number, default: 0 },
            lopAmount: { type: Number, default: 0 },

            // Salary component breakdown
            components: {
                basic: { type: Number, default: 0 },
                hra: { type: Number, default: 0 },
                conveyance: { type: Number, default: 0 },
                specialAllowance: { type: Number, default: 0 },
                otherAllowances: { type: Number, default: 0 },
                gross: { type: Number, default: 0 }
            },

            salary: { type: Number, required: true },
            professionalTax: { type: Number, default: 0 },
            incomeTax: { type: Number, default: 0 }, // ✅ Added TDS
            providentFund: { type: Number, default: 0 },
            epfEmployer: { type: Number, default: 0 },   // ✅ Added
            epfEmployerEps: { type: Number, default: 0 },// ✅ Added
            epfEmployerEpf: { type: Number, default: 0 },// ✅ Added
            esi: { type: Number, default: 0 }
        }],
        totalUnpaidSalary: { type: Number, default: 0 },

        totalDaysWorked: { type: Number, default: 0 },

        // Step 5: Leave Encashment
        leaveBalance: [{
            leaveType: { type: String, required: true },
            balance: { type: Number, required: true },
            encashDays: { type: Number, default: 0 },
            perDayRate: { type: Number, required: true },
            encashAmount: { type: Number, default: 0 }
        }],
        totalLeaveEncashment: { type: Number, default: 0 },

        // Step 6: Reimbursements & Deductions
        reimbursements: [{
            type: {
                type: String,
                enum: ['travel', 'medical', 'mobile', 'relocation', 'certification', 'other'],
                required: true
            },
            description: { type: String, required: true },
            amount: { type: Number, required: true },
            date: { type: Date, required: true },
            receiptUrl: { type: String },
            completionDate: { type: Date },
            monthsWorkedAfterCompletion: { type: Number },
            requiredMonths: { type: Number },
            isEligible: { type: Boolean }
        }],
        totalReimbursements: { type: Number, default: 0 },

        otherDeductions: [{
            description: { type: String, required: true },
            amount: { type: Number, required: true }
        }],
        totalOtherDeductions: { type: Number, default: 0 },

        otherAdditions: [{
            description: { type: String, required: true },
            amount: { type: Number, required: true }
        }],
        totalOtherAdditions: { type: Number, default: 0 },

        // Final Calculation
        finalCalculation: {
            holdSalaries: { type: Number, default: 0 },
            unpaidSalaries: { type: Number, default: 0 },
            leaveEncashment: { type: Number, default: 0 },
            reimbursements: { type: Number, default: 0 },
            otherAdditions: { type: Number, default: 0 },
            gratuity: { type: Number, default: 0 }, // ✅ Added
            totalPayable: { type: Number, default: 0 },

            noticePeriodRecovery: { type: Number, default: 0 },
            professionalTax: { type: Number, default: 0 },
            incomeTax: { type: Number, default: 0 }, // ✅ Added TDS
            providentFund: { type: Number, default: 0 }, // ✅ Added
            epfEmployer: { type: Number, default: 0 },   // ✅ Added
            epfEmployerEps: { type: Number, default: 0 },// ✅ Added
            epfEmployerEpf: { type: Number, default: 0 },// ✅ Added
            esi: { type: Number, default: 0 },            // ✅ Added
            lopAmount: { type: Number, default: 0 },      // ✅ Added for consistency
            otherDeductions: { type: Number, default: 0 },
            totalDeductions: { type: Number, default: 0 },

            netAmount: { type: Number, default: 0 },
            isNegative: { type: Boolean, default: false }
        },

        // Status & Tracking
        status: {
            type: String,
            enum: ['Draft', 'Confirmed'],
            default: 'Draft'
        },
        mode: {
            type: String,
            enum: ['automatic', 'manual'],
            default: 'automatic'
        },
        initiatedAt: { type: Date, required: true },
        initiatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        confirmedAt: { type: Date },
        confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        pdfUrl: { type: String },
        remarks: { type: String },

        // Audit Tracking for edits after confirmation
        lastEditedAt: { type: Date },
        lastEditedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    {
        timestamps: true
    }
);

// Indexes
finalSettlementSchema.index({ employeeId: 1 });
finalSettlementSchema.index({ status: 1 });
finalSettlementSchema.index({ employeeId: 1, status: 1 });
finalSettlementSchema.index({ lastPaidMonthDate: -1 });

export const FinalSettlement = model<IFinalSettlement>('FinalSettlement', finalSettlementSchema);
