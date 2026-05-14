import { Schema, model, Document, Types } from 'mongoose';


export interface IPayslip extends Document {
  userId: Types.ObjectId;
  payrollId: Types.ObjectId;
  monthYear: string;
  month: number;
  year: number;
  netSalary: number;
  paySummary?: {
    gross: number;
    net: number;
    deductions: number;
    bonus: number;
    reimbursement: number;
  };
  status: 'Generated' | 'Sent' | 'Exported';
  isExport: boolean;
  payslipUrl: string;

  sentAt?: Date;
  sentBy?: Types.ObjectId;

  emailHistory?: Array<{
    sentAt: Date;
    status: 'Sent' | 'Failed';
    sentBy: Types.ObjectId;
    recipientEmail?: string;
    errorMessage?: string;
    messageId?: string;
  }>;
}

const payslipSchema = new Schema<IPayslip>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    payrollId: { type: Schema.Types.ObjectId, required: true, ref: 'Payroll' },

    monthYear: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^\d{4}-\d{2}$/.test(v),
        message: 'Month must be in YYYY-MM format',
      },
    },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    netSalary: { type: Number, required: true },
    paySummary: {
      gross: { type: Number, required: true },
      net: { type: Number, required: true },
      deductions: { type: Number, required: true },
      bonus: { type: Number, required: true },
      reimbursement: { type: Number, required: true },
    },
    status: {
      type: String,
      enum: ['Generated', 'Sent', 'Exported'],
      default: 'Generated',
    },
    isExport: { type: Boolean, default: false },
    payslipUrl: { type: String },
    sentAt: { type: Date },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    emailHistory: [
      {
        sentAt: { type: Date, required: true },
        status: { type: String, enum: ['Sent', 'Failed'], required: true },
        sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        recipientEmail: { type: String },
        errorMessage: { type: String },
        messageId: { type: String }
      }
    ]
  },
  {
    timestamps: true,
  }

)
// Indexes for efficient queries
payslipSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

export const Payslip = model<IPayslip>('Payslip', payslipSchema);


/*import { Schema, model, Document, Types } from 'mongoose';

export interface IPayslip extends Document {
  userId: string | Types.ObjectId;
  payrollId: Types.ObjectId;

  //payroll period
  monthYear: string;// YYYY-MM format
  month: number;
  year: number;

  //attendance & leaves
  presentDays: number;
  lateDays: number;
  overtimeHours: number;
  absentDays: number;
  totalLeaves: number;
  approvedLeaves: number;
  rejectedLeaves: number;
  sickLeaveBalance: number;
  casualLeaveBalance: number;
  earnedLeaveBalance: number;

  //salary details (summary from payroll)
  grossSalary: number;
  netSalary: number;
  totalDeductions: number;
  reimbursment: number;
  bonus: number;

  exportStatus: 'Pending' | 'Completed' | 'Failed';
  payslipUrl: String;
  generatedAt: Date;
  exportedAt?: Date;
  emailSent: boolean; // Default: false
  lastEmailSentAt?: Date;
  emailHistory: {
    sentAt: Date,
    status: 'success' | 'failed',
    messageId: String,
    recipientEmail: String
    error: String// For failed attempts
  }[]
}

const payslipSchema = new Schema<IPayslip>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    payrollId: { type: Schema.Types.ObjectId, required: true, ref: 'Payroll' },

    monthYear: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^\d{4}-\d{2}$/.test(v),
        message: 'Month must be in YYYY-MM format',
      },
    },
    month: { type: Number, required: true },
    year: { type: Number, required: true },

    presentDays: { type: Number, default: 0, min: 0 },
    lateDays: { type: Number, default: 0, min: 0 },
    overtimeHours: { type: Number, default: 0, min: 0 },
    absentDays: { type: Number, default: 0, min: 0 },
    totalLeaves: { type: Number, default: 0, min: 0 },
    approvedLeaves: { type: Number, default: 0, min: 0 },
    rejectedLeaves: { type: Number, default: 0, min: 0 },
    sickLeaveBalance: { type: Number, default: 0, min: 0 },
    casualLeaveBalance: { type: Number, default: 0, min: 0 },
    earnedLeaveBalance: { type: Number, default: 0, min: 0 },

    grossSalary: { type: Number, required: true },
    netSalary: { type: Number, required: true },
    totalDeductions: { type: Number, required: true },
    reimbursment: { type: Number, required: true },
    bonus: { type: Number, required: true },

    payslipUrl: { type: String },
    exportStatus: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed'],
      default: 'Pending',
    },
    generatedAt: { type: Date, required: true, default: Date.now },
    exportedAt: Date,
    emailSent: { type: Boolean, default: false },
    lastEmailSentAt: Date,
    emailHistory: [{
      sentAt: { type: Date, required: true },
      status: { type: String, enum: ['success', 'failed'], required: true },
      messageId: { type: String },
      recipientEmail: { type: String },
      error: { type: String } // For failed attempts
    }]

  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
payslipSchema.index({ userId: 1, month: 1 }, { unique: true });
payslipSchema.index({ month: 1 });
payslipSchema.index({ exportStatus: 1 });

export const Payslip = model<IPayslip>('Payslip', payslipSchema); 

*/