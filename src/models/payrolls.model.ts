import { Schema, Document, Types, model } from 'mongoose';

export interface IPayroll extends Document {
    employeeId: Types.ObjectId;
    salaryAssignmentId: Types.ObjectId;
    assigned: {
        basic: number;
        hra: number;
        da: number;
        otherAllowance: number;
        travelAllowance: number;
        airTicketAllowance: number; // ✅ NEW: Air ticket allowance
        medicalAllowance: number; // ✅ NEW: Medical allowance
        reimbursementAllowance: number;
    };
    // Income Components
    monthlyGross: number;
    attendanceAdjustGross: number;
    basic: number;
    hra: number;
    da: number;
    otherAllowance: number;
    travelAllowance: number;
    airTicketAllowance: number; // ✅ NEW: Air ticket allowance
    medicalAllowance: number; // ✅ NEW: Medical allowance
    reimbursementAllowance: number;
    // Deductions
    epfEmployee: number;
    epfEmployer: number;
    epfEmployerEps?: number;
    epfEmployerEpf?: number;
    esiEmployee: number;
    esiEmployer: number;
    professionalTax: number;
    incomeTax: number;
    tdsDeduction: number; // 1% TDS for consultancy staff
    totalDeductions: number;
    additionalDeduction: number;
    // Additional Pay Components
    overtimeHours: number;
    overtimePay: number;
    leaveDeductions: number;
    reimbursement: number;
    bonus: number;
    holdSalary?: number; // ✅ NEW: Hold Salary field
    noticePeriodRecovery?: number; // ✅ NEW: Notice Period Recovery field
    customReimbursements: Array<{ name: string; value: number }>;
    customDeductions: Array<{ name: string; value: number }>;
    totalCustomReimbursements: number;
    totalCustomDeductions: number;
    customComponentAuditTrail?: Array<{
        appliedBy?: {
            userId: Types.ObjectId;
            name: string;
            email?: string;
        };
        appliedAt: Date;
        employeeId: Types.ObjectId;
        month: number;
        year: number;
        monthYear: string;
        customReimbursements: Array<{ name: string; value: number }>;
        customDeductions: Array<{ name: string; value: number }>;
    }>;
    // Final Payroll Calculations
    netSalary: number;
    ctc: number;
    // Payroll Period
    monthYear: string; // YYYY-MM
    month: number;
    year: number;
    // New Fields
    totalDaysInMonth: number;
    presentDays: number;
    LOPDays: number;
    payableDays: number;
    processedAt: Date;
    status: 'Draft' | 'PendingApproval' | 'InPayment' | 'Completed' | 'Failed' | 'RetryPending' | 'Cancelled' | 'Hold';
    approvedBy?: Types.ObjectId;
    approvalDate?: Date;
    paymentConfirmedAt?: Date;
    payslipReleaseDate?: Date;
    failureReason?: string;
    retryCount?: number;
    statusHistory?: Array<{ status: string; timestamp: Date; reason?: string; changedBy: Types.ObjectId }>;
    utrNumber?: string; // New field for UTR number in Completed status
    country: string; // 'AE' | 'IN' - Country code for payroll processing
    isFinalSettlement?: boolean; // ✅ Flag for FNF generated records
    type: 'Regular' | 'FinalSettlement'; // ✅ NEW: Type of payroll
    _id?: Types.ObjectId;
}

const PayrollSchema = new Schema<IPayroll>(
    {
        employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        salaryAssignmentId: { type: Schema.Types.ObjectId, ref: 'SalaryAssignment', required: true },
        assigned: {
            basic: { type: Number, required: true },
            hra: { type: Number, required: true },
            da: { type: Number, required: true },
            otherAllowance: { type: Number, required: true },
            travelAllowance: { type: Number, required: true, default: 0 },
            airTicketAllowance: { type: Number, required: true, default: 0 },
            medicalAllowance: { type: Number, required: true, default: 0 },
            reimbursementAllowance: { type: Number, required: true, default: 0 },
        },
        monthlyGross: { type: Number, required: true, default: 0 },
        attendanceAdjustGross: { type: Number, default: 0, required: true },
        basic: { type: Number, required: true },
        hra: { type: Number, required: true },
        da: { type: Number, required: true },
        otherAllowance: { type: Number, required: true },
        travelAllowance: { type: Number, required: true, default: 0 },
        airTicketAllowance: { type: Number, required: true, default: 0 },
        medicalAllowance: { type: Number, required: true, default: 0 },
        reimbursementAllowance: { type: Number, required: true, default: 0 },
        epfEmployee: { type: Number, required: true, default: 0 },
        epfEmployer: { type: Number, required: true, default: 0 },
        epfEmployerEps: { type: Number, default: 0 },
        epfEmployerEpf: { type: Number, default: 0 },
        esiEmployee: { type: Number, required: true, default: 0 },
        esiEmployer: { type: Number, required: true, default: 0 },
        professionalTax: { type: Number, required: true, default: 0 },
        incomeTax: { type: Number, required: true, default: 0 },
        tdsDeduction: { type: Number, required: true, default: 0 },
        totalDeductions: { type: Number, required: true, default: 0 },
        additionalDeduction: { type: Number, required: true, default: 0 },
        overtimeHours: { type: Number, default: 0 },
        overtimePay: { type: Number, default: 0 },
        leaveDeductions: { type: Number, default: 0 },
        reimbursement: { type: Number, default: 0 },
        bonus: { type: Number, default: 0 },
        holdSalary: { type: Number, default: 0 }, // ✅ Explicit Hold Salary field
        noticePeriodRecovery: { type: Number, default: 0 }, // ✅ Explicit Notice Period Recovery field
        customReimbursements: [{
            name: { type: String, required: true },
            value: { type: Number, required: true }
        }],
        customDeductions: [{
            name: { type: String, required: true },
            value: { type: Number, required: true }
        }],
        totalCustomReimbursements: { type: Number, default: 0 },
        totalCustomDeductions: { type: Number, default: 0 },
        customComponentAuditTrail: [{
            appliedBy: {
                userId: { type: Schema.Types.ObjectId, ref: 'User' },
                name: { type: String },
                email: { type: String },
                _id: false,
            },
            appliedAt: { type: Date, default: Date.now },
            employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            month: { type: Number, required: true },
            year: { type: Number, required: true },
            monthYear: { type: String, required: true },
            customReimbursements: [{
                name: { type: String, required: true },
                value: { type: Number, required: true }
            }],
            customDeductions: [{
                name: { type: String, required: true },
                value: { type: Number, required: true }
            }],
            _id: false,
        }],
        netSalary: { type: Number, required: true },
        ctc: { type: Number, required: true },
        monthYear: { type: String, required: true },
        month: { type: Number, required: true },
        year: { type: Number, required: true },
        totalDaysInMonth: { type: Number, required: true },
        presentDays: { type: Number, required: true },
        LOPDays: { type: Number, required: true },
        payableDays: { type: Number, required: true },
        processedAt: { type: Date, default: Date.now },
        status: {
            type: String,
            enum: ['Draft', 'PendingApproval', 'InPayment', 'Completed', 'Failed', 'RetryPending', 'Cancelled', 'Hold'],
            default: 'Draft',
        },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false }, // Changed ref to 'User' for consistency
        approvalDate: { type: Date },
        paymentConfirmedAt: { type: Date },
        payslipReleaseDate: { type: Date },
        failureReason: { type: String },
        retryCount: { type: Number, default: 0 },
        statusHistory: [{
            status: { type: String, required: true },
            timestamp: { type: Date, required: true, default: Date.now },
            reason: { type: String },
            changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
        }],
        utrNumber: { type: String }, // New field for UTR number
        country: {
            type: String,
            required: true,
            enum: ['AE', 'IN'],
            description: 'Country code for payroll processing'
        },
        isFinalSettlement: { type: Boolean, default: false }, // ✅ Flag for FNF generated records
        type: {
            type: String,
            enum: ['Regular', 'FinalSettlement'],
            required: true,
            default: 'Regular'
        },
    },
    { timestamps: true },
);

PayrollSchema.index({ employeeId: 1, monthYear: 1, month: 1, year: 1 }, { unique: true });

PayrollSchema.pre<IPayroll>('save', async function (next) {
    if (this.isNew) {
        const existingPayroll = await (this.constructor as any).findOne({
            employeeId: this.employeeId,
            monthYear: this.monthYear,
            month: this.month,
            year: this.year,
        }).session(this.$session());

        if (existingPayroll) {
            return next(new Error('Payroll entry for this employee and period already exists.'));
        }
    }

    // Ensure monetary fields are rounded
    const monetaryFields = [
        'assigned.basic', 'assigned.hra', 'assigned.da', 'assigned.otherAllowance', 'assigned.travelAllowance', 'assigned.airTicketAllowance', 'assigned.medicalAllowance', 'assigned.reimbursementAllowance',
        'monthlyGross', 'basic', 'hra', 'da', 'otherAllowance', 'travelAllowance', 'airTicketAllowance', 'medicalAllowance', 'reimbursementAllowance', 'epfEmployee', 'epfEmployer',
        'epfEmployerEps', 'epfEmployerEpf',
        'esiEmployee', 'esiEmployer', 'professionalTax', 'incomeTax', 'tdsDeduction', 'totalDeductions', 'additionalDeduction', 'overtimePay',
        'leaveDeductions', 'reimbursement', 'bonus', 'netSalary', 'ctc',
    ];

    monetaryFields.forEach((field) => {
        const value = this.get(field);
        if (typeof value === 'number') {
            this.set(field, Math.round(value));
        }
    });

    if (this.customReimbursements && this.customReimbursements.length > 0) {
        this.customReimbursements.forEach(item => {
            if (typeof item.value === 'number') {
                item.value = Math.round(item.value);
            }
        });
    }

    if (this.customDeductions && this.customDeductions.length > 0) {
        this.customDeductions.forEach(item => {
            if (typeof item.value === 'number') {
                item.value = Math.round(item.value);
            }
        });
    }

    // Ensure non-monetary fields are integers (already handled in logic, but reinforcing here)
    const integerFields = ['totalDaysInMonth', 'presentDays', 'LOPDays', 'payableDays', 'overtimeHours'];
    integerFields.forEach((field) => {
        const value = this.get(field);
        if (typeof value === 'number') {
            this.set(field, Math.floor(value)); // Ensure no decimals
        }
    });

    this.totalCustomReimbursements = Math.round(this.totalCustomReimbursements || 0);
    this.totalCustomDeductions = Math.round(this.totalCustomDeductions || 0);

    next();
});


export const Payroll = model<IPayroll>('Payroll', PayrollSchema);

/*
Payroll Status Workflow
    - Draft: Payroll is initiated and awaits admin review.
    - PendingApproval: Admin reviews payroll summary; can confirm (stays in PendingApproval until processed) or cancel (moves to Cancelled).
    - InPayment: Finance team exports data and sends it to the external payment system for processing.
    - Completed: Payment succeeds in the external system, and the UTR number is updated.
    - Failed: Payment fails in the external system (e.g., bank issues, incorrect account details).
    - RetryPending: Failed payment with resolved issues (e.g., updated bank details), queued for retry.
    - Cancelled: Payroll is explicitly cancelled by admin during PendingApproval or manually terminated.
    - Hold: Payroll is on hold (not paid yet), typically for resigned employees pending final settlement.
*/
