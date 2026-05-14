import { Schema, model, Document, Types } from 'mongoose';

export interface IPayrollDeduction extends Document {
  userId: Types.ObjectId;
  month: string; // YYYY-MM
  pf: number;
  esi: number;
  tds: number;
  professionalTax: number;
  otherDeductions: number;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const payrollDeductionSchema = new Schema<IPayrollDeduction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    month: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => /^\d{4}-\d{2}$/.test(v),
        message: 'Month must be in YYYY-MM format',
      },
    },
    pf: { type: Number, required: true, min: 0 },
    esi: { type: Number, required: true, min: 0 },
    tds: { type: Number, required: true, min: 0 },
    professionalTax: { type: Number, required: true, min: 0 },
    otherDeductions: { type: Number, required: true, min: 0 },
    remarks: String,
  },
  { timestamps: true }
);

payrollDeductionSchema.index({ userId: 1, month: 1 }, { unique: true });

export const PayrollDeduction = model<IPayrollDeduction>('PayrollDeduction', payrollDeductionSchema);