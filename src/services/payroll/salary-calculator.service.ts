import { Types } from 'mongoose';
import { PayrollSalaryStructure } from '../../models/payroll-salary-structure.model';
import { PayrollDeduction } from '../../models/payroll-deduction.model';
import { AttendanceRecord } from '../../models/attendance-record.model';
import { Leave } from '../../models/leave.model';

export class SalaryCalculatorService {
  private static PF_PERCENTAGE = 12;
  private static ESI_PERCENTAGE = 1.75;
  private static PROFESSIONAL_TAX = 200;

  async calculateMonthlySalary(userId: Types.ObjectId, month: string) {
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);

    // Get salary structure
    const salaryStructure = await PayrollSalaryStructure.findOne({
      userId,
      effectiveFrom: { $lte: new Date(year, monthNum - 1, 1) },
      $or: [
        { effectiveTo: { $gte: new Date(year, monthNum - 1, 1) } },
        { effectiveTo: null },
      ],
      isActive: true,
    });

    if (!salaryStructure) {
      throw new Error('No active salary structure found');
    }

    // Calculate attendance impact
    const attendanceImpact = await this.calculateAttendanceImpact(userId, year, monthNum);

    // Calculate gross salary
    const grossSalary = this.calculateGrossSalary(salaryStructure);

    // Calculate deductions
    const deductions = await this.calculateDeductions(userId, month, grossSalary);

    // Calculate net salary
    const netSalary = this.calculateNetSalary(grossSalary, deductions, attendanceImpact);

    return {
      grossSalary,
      deductions,
      netSalary,
      attendanceImpact,
    };
  }

  private async calculateAttendanceImpact(
    userId: Types.ObjectId,
    year: number,
    month: number
  ) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const [attendance, leaves] = await Promise.all([
      AttendanceRecord.find({
        userId,
        shiftDay: { $gte: startDate, $lte: endDate },
      }),
      Leave.find({
        userId,
        status: 'Approved',
        leaveType: { $ne: 'restricted_holiday' }, // Exclude restricted holidays (counted in holidayDays)
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
      }),
    ]);

    const workingDays = endDate.getDate();
    const presentDays = attendance.length;
    const leaveDays = leaves.reduce((sum, leave) => sum + this.calculateLeaveDays(leave, startDate, endDate), 0);
    const absentDays = workingDays - (presentDays + leaveDays);

    return {
      workingDays,
      presentDays,
      leaveDays,
      absentDays,
      deductionPerDay: absentDays > 0 ? (1 / workingDays) : 0,
    };
  }

  private calculateLeaveDays(leave: any, startDate: Date, endDate: Date) {
    const leaveStart = new Date(Math.max(leave.startDate.getTime(), startDate.getTime()));
    const leaveEnd = new Date(Math.min(leave.endDate.getTime(), endDate.getTime()));
    return Math.ceil((leaveEnd.getTime() - leaveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  private calculateGrossSalary(salaryStructure: any) {
    return {
      basic: salaryStructure.basic,
      hra: salaryStructure.hra,
      specialAllowance: salaryStructure.specialAllowance,
      conveyanceAllowance: salaryStructure.conveyanceAllowance,
      medicalAllowance: salaryStructure.medicalAllowance,
      lta: salaryStructure.lta,
      variablePay: salaryStructure.variablePay,
      total: Object.values(salaryStructure.toObject())
        .filter(value => typeof value === 'number')
        .reduce((sum: number, value: number) => sum + value, 0),
    };
  }

  private async calculateDeductions(userId: Types.ObjectId, month: string, grossSalary: any) {
    const pf = Math.min(grossSalary.basic * (SalaryCalculatorService.PF_PERCENTAGE / 100), 1800);
    const esi = grossSalary.total <= 21000 ?
      grossSalary.total * (SalaryCalculatorService.ESI_PERCENTAGE / 100) : 0;

    const deductions = await PayrollDeduction.findOne({ userId, month });

    return {
      pf,
      esi,
      professionalTax: SalaryCalculatorService.PROFESSIONAL_TAX,
      tds: deductions?.tds || 0,
      otherDeductions: deductions?.otherDeductions || 0,
      total: pf + esi + SalaryCalculatorService.PROFESSIONAL_TAX +
        (deductions?.tds || 0) + (deductions?.otherDeductions || 0),
    };
  }

  private calculateNetSalary(grossSalary: any, deductions: any, attendanceImpact: any) {
    const attendanceDeduction = grossSalary.total * attendanceImpact.deductionPerDay;
    return grossSalary.total - deductions.total - attendanceDeduction;
  }
}

export const salaryCalculatorService = new SalaryCalculatorService();