import { Types } from 'mongoose';
import { PayrollSalaryStructure, IPayrollSalaryStructure } from '../../models/payroll-salary-structure.model';

export interface IPayrollSalaryStructureCreate {
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
  grossSalary: number;
  netSalary: number;
  ctc: number;
  pfDeduction: number;
  incomeTaxDeduction: number;
  pfEmployerContribution: number;
  gratuity: number;
  isActive: boolean;
}

export interface IPayrollSalaryStructureUpdate {
  basic?: number;
  hra?: number;
  specialAllowance?: number;
  conveyanceAllowance?: number;
  medicalAllowance?: number;
  lta?: number;
  variablePay?: number;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  grossSalary?: number;
  netSalary?: number;
  ctc?: number;
  pfDeduction?: number;
  incomeTaxDeduction?: number;
  pfEmployerContribution?: number;
  gratuity?: number;
  isActive?: boolean;
}

class PayrollSalaryStructureService {
  async create(data: IPayrollSalaryStructureCreate): Promise<IPayrollSalaryStructure> {
    // Deactivate any existing active salary structure
    await PayrollSalaryStructure.updateMany(
      {
        userId: data.userId,
        isActive: true,
        effectiveFrom: { $lt: data.effectiveFrom },
      },
      {
        $set: {
          isActive: false,
          effectiveTo: data.effectiveFrom,
        },
      }
    );

    const salaryStructure = new PayrollSalaryStructure(data);
    console.log(salaryStructure, 'salaryStructure');
    await salaryStructure.save();
    return salaryStructure;
  }

  async getCurrentStructure(userId: Types.ObjectId): Promise<IPayrollSalaryStructure | null> {
    return PayrollSalaryStructure.findOne({
      userId,
      isActive: true,
      effectiveFrom: { $lte: new Date() },
      $or: [
        { effectiveTo: { $gte: new Date() } },
        { effectiveTo: null },
      ],
    });
  }

  async getHistory(userId: Types.ObjectId): Promise<IPayrollSalaryStructure[]> {
    return PayrollSalaryStructure.find({ userId })
      .sort({ effectiveFrom: -1 });
  }


  async update(recordId: Types.ObjectId, data: IPayrollSalaryStructureUpdate): Promise<IPayrollSalaryStructure | null> {
    const salaryStructure = await PayrollSalaryStructure.findById(recordId);

    if (!salaryStructure) {
      throw new Error('Salary structure not found');
    }

    Object.assign(salaryStructure, data);
    await salaryStructure.save();
    return salaryStructure;
  }
}

export const payrollSalaryStructureService = new PayrollSalaryStructureService();