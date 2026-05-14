import { Schema, model, Document, Types } from 'mongoose';

export interface IPayrollSalaryStructure extends Document {
  userId: Types.ObjectId;
  basic: number;
  hra: number;
  specialAllowance: number;
  conveyanceAllowance: number;
  medicalAllowance: number;
  lta: number;
  variablePay: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  grossSalary: number;
  netSalary: number;
  ctc: number;
  pfDeduction: number;
  incomeTaxDeduction: number;
  pfEmployerContribution: number;
  gratuity: number;
}

const payrollSalaryStructureSchema = new Schema<IPayrollSalaryStructure>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    basic: { type: Number, required: true, min: 0 },
    hra: { type: Number, required: true, min: 0 },
    specialAllowance: { type: Number, required: true, min: 0 },
    conveyanceAllowance: { type: Number, required: true, min: 0 },
    medicalAllowance: { type: Number, required: true, min: 0 },
    lta: { type: Number, required: true, min: 0 },
    variablePay: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: Date,
    isActive: { type: Boolean, default: true },
    grossSalary: { type: Number, required: true, min: 0 },
    netSalary: { type: Number, required: true, min: 0 },
    ctc: { type: Number, required: true, min: 0 },
    pfDeduction: { type: Number, required: true, min: 0 },
    incomeTaxDeduction: { type: Number, required: true, min: 0 },
    pfEmployerContribution: { type: Number, required: true, min: 0 },
    gratuity: { type: Number, required: true, min: 0 },

  },
  { timestamps: true }
);

payrollSalaryStructureSchema.index({ userId: 1, effectiveFrom: -1 });
payrollSalaryStructureSchema.index({ isActive: 1 });

export const PayrollSalaryStructure = model<IPayrollSalaryStructure>('PayrollSalaryStructure', payrollSalaryStructureSchema);