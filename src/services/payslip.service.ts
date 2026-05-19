
import { Types } from 'mongoose';
import { Payslip, User, Payroll, IPayroll, IUser, IPayslip } from '../models';
import { Document, IDocument } from '../models/document.model';
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import { formatCurrency } from '../utilis/currency';
import { emailService } from './email.service';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { uploadFileToGCP } from '../utilis/gcpStorage';
import { formatDateToDDMMYYYY } from '../utilis/dates';

//fs-extra ,number-to-words ,pdfkit

interface ISendPayslipsRequest {
  month: number;
  year: number;
  recipients: string[];

}

interface IPayslipHistoryQuery {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface IPayslipGenerate {
  userId: string;
  month: string; // Format: YYYY-MM
  year: number;
}

export interface IPayslipQuery {
  userId?: string;
  month?: string;
  year?: number;
  exportStatus?: 'Pending' | 'Completed' | 'Failed';
  page?: number;
  limit?: number;
}

// LibreOffice PDF conversion removed - functionality no longer available
const convertToPdf = () => {
    throw new Error('LibreOffice PDF conversion is no longer available. Please use an alternative PDF generation method.');
};

interface IdentityDocumentResult {
  panNumber?: string;
  pfNumber?: string;
  pfUan?: string;
}

export class PayslipService extends BaseService {
  protected context: RequestContext;

  constructor(context: RequestContext) {
    super(context);
    this.context = context;
  }

  async deletePayroll(month: number, year: number) {
    console.log(`Deleting payroll records for ${month}-${year}`);
    // Delete all payroll records for the specified month and year
    const result = await Payslip.deleteMany({ month, year });
    console.log(`Deleted ${result.deletedCount} payroll records for ${month}-${year}`);
    return result.deletedCount > 0;
  }
  //get the payslip status for userIds ,month and year
  async getPayslipRecordsForUsers(
    userIds: string[],
    month: number,
    year: number
  ) {
    const objectIds = userIds.map(id => new Types.ObjectId(id));
    console.log(objectIds, 'objectIds getPayslipRecordsForUsers');
    const payrollRecords = await Payslip.find({
      userId: { $in: objectIds },
      month,
      year
    },
      { userId: 1, status: 1, payslipUrl: 1, isExport: 1, monthYear: 1, month: 1, year: 1, netSalary: 1, grossSalary: 1, totalDeductions: 1, reimbursement: 1, bonus: 1 }
    )
    console.log(payrollRecords, 'payrollRecords getPayrollRecordsForUsers');

    return payrollRecords;
  }
  //my payslip
  async getEmployeePayslipAndPayroll(
    userId: string,
    month?: number,
    year?: number
  ): Promise<{ payslips: any[] }> {
    // Build filter
    const filter: any = {
      isExport: true,
      status: { $in: ["Sent", "Exported"] },
    };
    if (userId) filter.userId = new Types.ObjectId(userId);
    if (month) filter.month = month;
    if (year) filter.year = year;
    console.log(filter, "filters getEmployeePayslipAndPayroll")
    // Fetch payslips and payroll data without pagination
    const payslips = await Payslip.find(filter)
      .sort({ year: -1, month: -1 }) // Sort by year and month descending
      .populate('userId', 'name email')
      .populate('payrollId', 'month year monthYear monthlyGross basic hra da otherAllowance travelAllowance airTicketAllowance medicalAllowance epfEmployee professionalTax incomeTax overtimePay netSalary ctc totalDeductions reimbursement bonus holdSalary noticePeriodRecovery');

    console.log(payslips, "payslips getEmployeePayslipAndPayroll")
    // Format the response with detailed payroll calculations
    const formattedPayslips = payslips.map((payslip) => {
      const payroll = payslip.payrollId as any;
      console.log(payroll, "payslip payrollId")
      const users = payslip.userId as any;
      console.log(users, "payslip userId")
      return {
        payslipId: payslip._id,
        employeeId: typeof payslip.userId === 'object' ? payslip.userId._id : payslip.userId,
        employeeName: users.name,
        email: users.email,
        month: payroll.month,
        year: payroll.year,
        basic: payroll.basic,
        hra: payroll.hra,
        da: payroll.da,
        otherAllowance: payroll.otherAllowance,
        travelAllowance: payroll.travelAllowance || 0, // ✅ Include travel allowance
        airTicketAllowance: payroll.airTicketAllowance || 0, // ✅ NEW: Include air ticket allowance
        medicalAllowance: payroll.medicalAllowance || 0, // ✅ NEW: Include medical allowance
        monthYear: payroll.monthYear,
        epfEmployee: payroll.epfEmployee,
        professionalTax: payroll.professionalTax,
        incomeTax: payroll.incomeTax,
        overtimePay: payroll.overtimePay,
        grossSalary: payroll.monthlyGross,
        netSalary: payroll.netSalary,
        ctc: payroll.ctc,
        totalDeductions: payroll.totalDeductions,
        reimbursement: payroll.reimbursement,
        holdSalary: payroll.holdSalary || 0, // ✅ NEW: Include Hold Salary in response
        noticePeriodRecovery: payroll.noticePeriodRecovery || 0, // ✅ NEW: Include Notice Recovery in response
        bonus: payroll.bonus,
        // generatedAt: payslip.generatedAt,
        payslipUrl: payslip.payslipUrl
      };

    });
    console.log(formattedPayslips, "formattedPayslips getEmployeePayslipAndPayroll")
    return {
      payslips: formattedPayslips,
    };
  }
  //send payslips
  async sendPayslips(data: ISendPayslipsRequest, userId: string): Promise<{
    success: number;
    failed: number;
    results: Array<{
      employeeId: string;
      status: 'success' | 'failed';
      message?: string;
    }>;
  }> {
    const { month, year, recipients } = data;
    console.log(month, year, recipients, "snedPayslips body")
    // 1. Get payslips and user details in parallel
    const [payslips, users] = await Promise.all([
      Payslip.find({
        userId: { $in: recipients.map(id => new Types.ObjectId(id)) },
        month,
        year,
      }),
      User.find({
        _id: { $in: recipients.map(id => new Types.ObjectId(id)) }
      }).select('_id email name')
    ]);

    console.log(payslips, "send payslips")
    console.log(users, "send users")
    // Create maps for quick lookup
    const payslipMap = new Map(payslips.map(p => [p.userId.toString(), p]));
    const userMap = new Map(users.map(u => [u._id.toString(), u]));
    console.log(payslipMap, userMap, "payslipMap userMap")
    // 2. Process each recipient sequentially to avoid SMTP timeout spikes in deployed environments
    const results: Array<{
      employeeId: string;
      status: 'success' | 'failed';
      message?: string;
    }> = [];

    for (const recipientId of recipients) {
      try {
        const user = userMap.get(recipientId);
        const payslip = payslipMap.get(recipientId);

        // Validate user and payslip exist
        if (!user || !user.email) {
          results.push({
            employeeId: recipientId,
            status: 'failed' as const,
            message: 'User not found or no email address'
          });
          continue;
        }

        if (!payslip || !payslip.payslipUrl) {
          results.push({
            employeeId: recipientId,
            status: 'failed' as const,
            message: 'Payslip not found or not generated'
          });
          continue;
        }

        // Send Email with Payslip
        let emailResult: any = await emailService.sendPayslipEmails(
          month, year, [{
            employeeId: recipientId,
            employeeName: user.name,
            email: user.email,
            payslipId: payslip._id.toString(),
            payslipUrl: payslip.payslipUrl as string
          }],
          recipients
        );

        console.log(emailResult, "emailResult payslip gen")

        // If email sent successfully, update the payslip record
        if (emailResult.success) {
          const now = new Date();
          const messageId = emailResult.results?.[0]?.messageId || '';

          await Payslip.findByIdAndUpdate(
            payslip._id,
            {
              isExport: true,
              status: 'Sent',
              sentAt: now,
              sentBy: new Types.ObjectId(userId),
              $push: {
                emailHistory: {
                  sentAt: now,
                  status: 'Sent',
                  sentBy: new Types.ObjectId(userId),
                  recipientEmail: user.email,
                  messageId,
                }
              }
            }
          );
        }
        results.push({
          employeeId: recipientId,
          status: 'success' as const
        });

      } catch (error: any) {
        results.push({
          employeeId: recipientId,
          status: 'failed' as const,
          message: error.message
        });
      }
    }

    // 3. Summarize results
    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.length - successCount;
    let res = {
      success: successCount,
      failed: failedCount,
      results
    };
    console.log(res, "final response sendPayslip")
    return {
      success: successCount,
      failed: failedCount,
      results
    };
  }
  // Bulk generate payslips for multiple users
  async bulkGenerate(month: number, year: number, userIds: string[]) {
    console.log("bulkGenerate called with:", month, year, userIds);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new Error('Invalid Month format. month should be 1 to 12.');
    }

    const firstDayOfMonth = new Date(`${year}-${month}-01`);
    console.log(firstDayOfMonth, "firstDayOfMonth")
    const lastDayOfMonth = new Date(year, month, 0); // Last day of the month

    try {
      // Fetch employees based on provided userIds
      const employees = await User.find({
        _id: { $in: userIds },
        joiningDate: { $lt: lastDayOfMonth }, // Ensure employee joined before the last day of the month
      }).lean();
      console.log(employees.length, "employees length")
      if (!employees.length) {
        throw new Error('No eligible employees found for payslip generation.');
      }

      // Fetch payroll data for the given month, year, and userIds
      const payrolls: IPayroll[] = await Payroll.find({
        month,
        year,
        employeeId: { $in: userIds },
        status: 'Completed' // Ensure payroll is completed,
      });
      console.log(payrolls.length, "payrolls length")
      if (!payrolls.length) {
        throw new Error('No payroll data found for the specified users.');
      }

      const payslipPromises = employees.map(async (employee) => {
        const payroll = payrolls.find((p) => p.employeeId.toString() === employee._id.toString());
        if (!payroll) {
          return { userId: employee._id, status: 'No Payroll Found' };
        }

        // Debug: Log payroll data to check if travelAllowance exists
        console.log("=== PAYROLL DEBUG ===");
        console.log("Payroll ID:", payroll._id);
        console.log("Employee:", employee.name);
        console.log("travelAllowance:", payroll.travelAllowance);
        console.log("assigned.travelAllowance:", payroll.assigned?.travelAllowance);
        console.log("Payroll keys:", Object.keys(payroll));
        console.log("=====================");

        const monthStr: string = month <= 9 ? `0${month}` : `${month}`;
        const payslipData = {
          userId: new Types.ObjectId(employee._id),
          payrollId: payroll._id,
          monthYear: `${year}-${monthStr}`,
          month,
          year,
          // grossSalary: payroll.monthlyGross,
          netSalary: payroll.netSalary,
          paySummary: {
            gross: payroll.monthlyGross,
            net: payroll.netSalary,
            deductions: payroll.totalDeductions,
            bonus: payroll.bonus,
            reimbursement: payroll.reimbursement,
          },
          isExport: false
        };

        // Check if payslip already exists
        let payslip: IPayslip | null = await Payslip.findOne({
          userId: employee._id,
          month,
          year,
        });

        if (payslip) {
          // Update existing payslip
          Object.assign(payslip, payslipData);
        } else {
          // Create new payslip
          payslip = new Payslip(payslipData);
        }

        // Generate PDF
        const pdfPath = await this.generatePayslipPDF(employee, payroll, payslip._id);
        payslip.payslipUrl = pdfPath;
        payslip.status = 'Generated';
        console.log(payslip, "payslip before save")
        await payslip.save();

        return { userId: employee._id, status: 'Payslip Generated', pdfPath };
      });

      // Wait for all payslips to be generated
      const payslipResults = await Promise.all(payslipPromises);
      return { success: true, payslips: payslipResults };
    } catch (error) {
      console.error('Error generating payslips:', error);
      throw error;
    }
  }
  // Get identity documents from Document collection (same as document.service.ts)
  private getIdentityDocuments = async (employeeId: string): Promise<IdentityDocumentResult> => {
    try {
      if (!Types.ObjectId.isValid(employeeId)) {
        throw new Error('Invalid employeeId');
      }

      const docs = await Document.find({
        employeeId: new Types.ObjectId(employeeId),
        category: 'Certification',
        'metadata.certificate.certificateType': 'IdentityProof',
      }).lean();

      if (!docs || docs.length === 0) {
        return { panNumber: undefined, pfNumber: undefined, pfUan: undefined };
      }

      const result: IdentityDocumentResult = {};

      docs.forEach((doc: IDocument) => {
        if (doc.metadata?.certificate?.idDetails) {
          const { idType, idNumber, uanNumber } = doc.metadata.certificate.idDetails;

          if (idType === 'PAN' && idNumber) {
            result.panNumber = idNumber;
          } else if (idType === 'PF' && idNumber) {
            result.pfNumber = idNumber;
            result.pfUan = uanNumber;
          }
        }
      });

      return result;
    } catch (error) {
      console.error('Error fetching identity documents:', error);
      // Return empty result on error, will fallback to employee fields
      return { panNumber: undefined, pfNumber: undefined, pfUan: undefined };
    }
  };

  private async generatePayslipPDF(employee: IUser, payroll: IPayroll, payslipId: Types.ObjectId): Promise<string> {
    // Ensure logs include meaningful data

    console.log("Generating Payslip PDF for:", payroll)
    console.log("Payroll travelAllowance:", payroll.travelAllowance)
    console.log("Payroll assigned.travelAllowance:", payroll.assigned?.travelAllowance)
    console.log("Generating Payslip PDF for:", employee)
    console.log("Generating Payslip PDF for:", payslipId)

    // Define paths for input template and output files
    const payslipDir = path.join(process.cwd(), 'uploads');

    // const payslipDir = `${process.env.PROTOCOL}://${host}/`;

    console.log(payslipDir, "1 payslipDir")
    // // Create payslips directory if it doesn't exist
    if (!fs.existsSync("uploads")) {
      fs.mkdirSync("uploads", { recursive: true });
    }

    const payslipBaseName = `payslip_${employee._id}_${payroll.monthYear}`;
    // Keep these for file operations (physical paths)
    const outputDocxPath = path.join(payslipDir, `${payslipBaseName}.docx`);
    const outputPdfPath = path.join(payslipDir, `${payslipBaseName}.pdf`);


    console.log(outputPdfPath, "outputPdfPath")
    const sanitizeText = (value: unknown): string | undefined => {
      if (value === undefined || value === null) {
        return undefined;
      }
      const text = String(value).trim();
      if (
        !text ||
        text === '-' ||
        ['undefined', 'null', 'n/a', 'na'].includes(text.toLowerCase())
      ) {
        return undefined;
      }
      return text;
    };

    const sanitizeAmount = (value: unknown): number => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return 0;
        }
        const numeric = Number(trimmed.replace(/,/g, ''));
        return Number.isFinite(numeric) ? numeric : 0;
      }
      return 0;
    };

    const formatLabel = (input: string | undefined | null): string => {
      const sanitized = sanitizeText(input);
      if (!sanitized) {
        return '-';
      }
      return sanitized
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    };

    const activeBankData = employee.bankDetails?.find(bank => bank?.isActive);

    // Get identity documents from Document collection (with fallback to employee fields)
    const govtIds = await this.getIdentityDocuments(employee._id.toString());

    const isUaePayroll = payroll.country?.toUpperCase() === 'AE';

    const basicValue = isUaePayroll ? sanitizeAmount(payroll.basic) : (payroll.basic || 0);
    const hraValue = isUaePayroll ? sanitizeAmount(payroll.hra) : (payroll.hra || 0);
    const daValue = isUaePayroll ? sanitizeAmount(payroll.da) : (payroll.da || 0);
    const otherAllowanceValue = isUaePayroll ? sanitizeAmount(payroll.otherAllowance) : (payroll.otherAllowance || 0);
    const travelAllowanceValue = isUaePayroll ? sanitizeAmount(payroll.travelAllowance) : (payroll.travelAllowance ?? 0);
    const reimbursementValue = isUaePayroll ? sanitizeAmount(payroll.reimbursement) : (payroll.reimbursement || 0);
    const assignedBasicValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.basic) : (payroll.assigned?.basic || 0);
    const assignedHraValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.hra) : (payroll.assigned?.hra || 0);
    const assignedOtherAllowanceValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.otherAllowance) : (payroll.assigned?.otherAllowance || 0);
    const assignedTravelAllowanceValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.travelAllowance) : (payroll.assigned?.travelAllowance ?? 0);
    const assignedReimbursementValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.reimbursementAllowance) : (payroll.assigned?.reimbursementAllowance || 0);

    const employeeDesignation = isUaePayroll
      ? (sanitizeText(employee.specificRole) || formatLabel(employee.role))
      : (employee.specificRole || formatLabel(employee.role));

    const holdSalaryValue = isUaePayroll ? sanitizeAmount(payroll.holdSalary) : (payroll.holdSalary || 0);
    const customReimbursementsTotal = (payroll.customReimbursements || []).reduce(
      (sum, item) => sum + sanitizeAmount(item?.value),
      0
    );
    const customDeductionsTotal = (payroll.customDeductions || []).reduce(
      (sum, item) => sum + sanitizeAmount(item?.value),
      0
    );

    // ✅ UPDATED: Total earnings = Monthly components + Hold Salary + Custom Reimbursements
    const totalEarnings =
      basicValue + hraValue + otherAllowanceValue + daValue + travelAllowanceValue + holdSalaryValue + customReimbursementsTotal;

    console.log(activeBankData, "activeBankData")


    const netSalaryValue = isUaePayroll ? sanitizeAmount(payroll.netSalary) : (payroll.netSalary || 0);
    const netPayNumeric = Math.round(netSalaryValue);
    const netPayValue = await this.numberToWords(netPayNumeric);
    const netPayWords = netPayNumeric > 0
      ? `${isUaePayroll ? 'Dirhams' : 'Rupees'} ${netPayValue} only`
      : `${isUaePayroll ? 'Dirhams' : 'Rupees'} ${netPayValue}`;

    console.log(netPayNumeric, "netPayNumeric")
    console.log(netPayWords, "netPayWords")
    console.log(netPayValue, "netPayValue")

    // Prepare template data
    const templateData = {
      // Personal Details
      // Personal Info
      empName: sanitizeText(employee.name) || '-',
      empJoinDate: formatDateToDDMMYYYY(employee.joiningDate),
      empRole: employeeDesignation,
      empDes: employeeDesignation || '-',
      empDept: formatLabel(employee.departmentId),
      empLocation: formatLabel(employee.location),
      // Employee No: Use employeeCode (primary) or biometricId (fallback)
      empNo: sanitizeText(employee.employeeCode) || sanitizeText(employee.biometricId) || '-',

      // Bank & ID Info
      // Fallback: If no active bank found, use the first one available
      bankName: sanitizeText(activeBankData?.bankName) || '-',
      bankAccNo: sanitizeText(activeBankData?.accountNumber) || '-',
      // PAN: Priority: Document collection > governmentIds > fallback to '-'
      panNo: sanitizeText(govtIds?.panNumber) || sanitizeText(employee.governmentIds?.pan?.number) || '-',
      // PF No: Priority: employee.pfNumber > Document collection > governmentIds > fallback to '-'
      pfNo: sanitizeText(employee.pfNumber) || sanitizeText(govtIds?.pfNumber) || sanitizeText(employee.governmentIds?.pf?.number) || '-',
      // PF UAN: Priority: employee.uanNumber > Document collection > governmentIds > fallback to '-'
      pfUan: sanitizeText(employee.uanNumber) || sanitizeText(govtIds?.pfUan) || sanitizeText(employee.governmentIds?.pf?.uan) || '-',

      // Payslip Info
      payMonth: this.getMonthName(payroll.month),
      payYear: payroll.year.toString(),

      daysPresent: payroll.presentDays,
      daysLOP: payroll.LOPDays,
      effectiveDays: payroll.payableDays,
      monthDays: payroll.totalDaysInMonth,

      // Earnings
      earnActual: {
        basic: formatCurrency(basicValue, payroll.country),
        hra: formatCurrency(hraValue, payroll.country),
        other: formatCurrency(otherAllowanceValue, payroll.country),
        travelAllowance: formatCurrency(travelAllowanceValue, payroll.country), // ✅ Travel Allowance with sanitization
        reimbursement: formatCurrency(reimbursementValue, payroll.country),
        ...((payroll.holdSalary && payroll.holdSalary > 0) && {
          holdSalary: formatCurrency(payroll.holdSalary, payroll.country)
        }), // ✅ NEW: Hold Salary (Only if > 0)
        airTicketAllowance: formatCurrency(sanitizeAmount(payroll.airTicketAllowance), payroll.country), // ✅ NEW: Air Ticket Allowance
        medicalAllowance: formatCurrency(sanitizeAmount(payroll.medicalAllowance), payroll.country), // ✅ NEW: Medical Allowance
        total: formatCurrency(totalEarnings, payroll.country)
      },
      earnFull: {
        basic: formatCurrency(assignedBasicValue, payroll.country),
        hra: formatCurrency(assignedHraValue, payroll.country),
        other: formatCurrency(assignedOtherAllowanceValue, payroll.country),
        travelAllowance: formatCurrency(assignedTravelAllowanceValue, payroll.country), // ✅ Travel Allowance with sanitization
        reimbursement: formatCurrency(assignedReimbursementValue, payroll.country),
        ...((payroll.holdSalary && payroll.holdSalary > 0) && {
          holdSalary: formatCurrency(payroll.holdSalary, payroll.country)
        }), // ✅ NEW: Hold Salary (Only if > 0)
        airTicketAllowance: formatCurrency(sanitizeAmount(payroll.assigned?.airTicketAllowance), payroll.country), // ✅ Annual (for display/reference only)
        medicalAllowance: formatCurrency(sanitizeAmount(payroll.assigned?.medicalAllowance), payroll.country), // ✅ Annual (for display/reference only)
        total: formatCurrency(
          assignedBasicValue +
          assignedHraValue +
          assignedOtherAllowanceValue +
          assignedTravelAllowanceValue +
          holdSalaryValue +
          customReimbursementsTotal,
          payroll.country
          // ✅ Air Ticket & Medical NOT included in monthly total (annual only)
        )
      },

      // Deductions - Only include non-zero values (so template rows can be conditional)
      deduction: (() => {
        const deductionObj: any = {
          total: formatCurrency((payroll.totalDeductions || 0) + customDeductionsTotal, payroll.country)
        };

        // Normalize values to numbers and only include if > 0
        const pfVal = Number(payroll.epfEmployee ?? 0);
        const lopVal = Number(payroll.leaveDeductions ?? 0);
        const ptVal = Number(payroll.professionalTax ?? 0);
        const itVal = Number(payroll.incomeTax ?? 0);
        const tdsVal = Number(payroll.tdsDeduction ?? 0);
        const noticeVal = Number(payroll.noticePeriodRecovery ?? 0);

        if (pfVal > 0) {
          deductionObj.pf = formatCurrency(pfVal, payroll.country);
        }
        if (lopVal > 0) {
          deductionObj.lop = formatCurrency(lopVal, payroll.country);
        }
        if (ptVal > 0) {
          deductionObj.pt = formatCurrency(ptVal, payroll.country);
        }
        if (itVal > 0) {
          deductionObj.it = formatCurrency(itVal, payroll.country);
        }
        if (tdsVal > 0) {
          deductionObj.tds = formatCurrency(tdsVal, payroll.country);
        }
        if (noticeVal > 0) {
          deductionObj.noticeRecovery = formatCurrency(noticeVal, payroll.country);
        }

        return deductionObj;
      })(),

      // Dynamic Earnings List (only non-zero items)
      allEarnings: (() => {
        const earningsArray: any[] = [];

        // Helper to add row if actual or full > 0
        const pushIfValid = (label: string, actual: number, full: number) => {
          if (actual > 0 || full > 0) {
            earningsArray.push({
              label,
              fullAmount: formatCurrency(full, payroll.country),
              actualAmount: formatCurrency(actual, payroll.country)
            });
          }
        };

        pushIfValid('BASIC', basicValue, assignedBasicValue);
        pushIfValid('HRA', hraValue, assignedHraValue);
        pushIfValid('DEARNESS ALLOWANCE', daValue, 0); // Usually no "full" DA assigned separately
        pushIfValid('OTHER ALLOWANCE', otherAllowanceValue, assignedOtherAllowanceValue);
        pushIfValid('TRAVEL ALLOWANCE', travelAllowanceValue, assignedTravelAllowanceValue);
        pushIfValid('HOLD SALARY', holdSalaryValue, holdSalaryValue);
        pushIfValid('REIMBURSEMENT', reimbursementValue, assignedReimbursementValue);

        if (sanitizeAmount(payroll.airTicketAllowance) > 0 || sanitizeAmount(payroll.assigned?.airTicketAllowance) > 0) {
          pushIfValid('AIR TICKET ALLOWANCE', sanitizeAmount(payroll.airTicketAllowance), sanitizeAmount(payroll.assigned?.airTicketAllowance));
        }
        if (sanitizeAmount(payroll.medicalAllowance) > 0 || sanitizeAmount(payroll.assigned?.medicalAllowance) > 0) {
          pushIfValid('MEDICAL ALLOWANCE', sanitizeAmount(payroll.medicalAllowance), sanitizeAmount(payroll.assigned?.medicalAllowance));
        }

        // Add Dynamic Custom Reimbursements
        if (payroll.customReimbursements && payroll.customReimbursements.length > 0) {
          payroll.customReimbursements.forEach(item => {
            if (item.value > 0) {
              pushIfValid(item.name.toUpperCase(), item.value, item.value);
            }
          });
        }

        return earningsArray;
      })(),

      // Dynamic Deductions List (only non-zero items)
      allDeductions: (() => {
        const deductionsArray: any[] = [];
        const pfVal = Number(payroll.epfEmployee ?? 0);
        const lopVal = Number(payroll.leaveDeductions ?? 0);
        const ptVal = Number(payroll.professionalTax ?? 0);
        const itVal = Number(payroll.incomeTax ?? 0);
        const tdsVal = Number(payroll.tdsDeduction ?? 0);
        const noticeVal = Number(payroll.noticePeriodRecovery ?? 0);

        if (pfVal > 0) deductionsArray.push({ label: 'PROVIDENT FUND', amount: formatCurrency(pfVal, payroll.country) });
        if (lopVal > 0) deductionsArray.push({ label: 'LOSS OF PAY', amount: formatCurrency(lopVal, payroll.country) });
        if (itVal > 0) deductionsArray.push({ label: 'INCOME TAX', amount: formatCurrency(itVal, payroll.country) });
        if (ptVal > 0) deductionsArray.push({ label: 'PROFESSIONAL TAX', amount: formatCurrency(ptVal, payroll.country) });
        if (tdsVal > 0) deductionsArray.push({ label: 'TDS (1%)', amount: formatCurrency(tdsVal, payroll.country) });
        if (noticeVal > 0) deductionsArray.push({ label: 'NOTICE PERIOD RECOVERY', amount: formatCurrency(noticeVal, payroll.country) });

        // Add Dynamic Custom Deductions
        if (payroll.customDeductions && payroll.customDeductions.length > 0) {
          payroll.customDeductions.forEach(item => {
            if (item.value > 0) {
              deductionsArray.push({ label: item.name.toUpperCase(), amount: formatCurrency(item.value, payroll.country) });
            }
          });
        }

        return deductionsArray;
      })(),

      // Net Pay
      netPay: formatCurrency(netSalaryValue, payroll.country),

      netPayWords: netPayWords
    };
    console.log({
      payrollTravelAllowance: payroll.travelAllowance,
      sanitizedTravelAllowance: travelAllowanceValue,
      assignedTravelAllowance: payroll.assigned?.travelAllowance,
      sanitizedAssignedTravelAllowance: assignedTravelAllowanceValue,
      country: payroll.country,
    }, "travel allowance debug");
    console.log("=== DEDUCTION DEBUG ===");
    console.log("Payroll deduction values:", {
      epfEmployee: payroll.epfEmployee,
      leaveDeductions: payroll.leaveDeductions,
      professionalTax: payroll.professionalTax,
      incomeTax: payroll.incomeTax,
      tdsDeduction: payroll.tdsDeduction,
      totalDeductions: payroll.totalDeductions
    });
    console.log("Deduction object:", templateData.deduction);
    console.log("Deduction keys:", Object.keys(templateData.deduction));
    console.log("======================");
    console.log(templateData, " templateData")
    console.log("earnActual.travelAllowance:", templateData.earnActual.travelAllowance)
    console.log("earnFull.travelAllowance:", templateData.earnFull.travelAllowance)
    try {
      // Replace placeholders in DOCX template
      await this.replacePlaceholdersInDocx(
        // path.join(process.cwd(), 'CD_paySlip.docx'),
        //path.join(process.cwd(), 'CD_payslip_Dubai Zuno.docx'),
        // path.join(process.cwd(), 'CD_paySlip old2.docx'),
        // path.join(process.cwd(), 'CD_paySlip_new.docx'),
        path.join(process.cwd(), 'CD_paySlip old3.docx'),
        outputDocxPath,
        templateData
      );

      // Convert DOCX to PDF using libreoffice-convert
      await this.convertDocxToPDF(outputDocxPath, outputPdfPath);

      // Upload to GCP Cloud Storage
      const gcpResult = await uploadFileToGCP({
        filePath: outputPdfPath,
        fileName: `${payslipBaseName}.pdf`,
        employeeId: employee._id.toString(),
        category: 'Payroll',
        type: 'Payslip'
      });

      if (!gcpResult.success) {
        throw new Error(`Failed to upload payslip to GCP: ${gcpResult.error}`);
      }

      // Clean up temporary files
      try {
        await fsPromises.unlink(outputDocxPath);
        await fsPromises.unlink(outputPdfPath);
      } catch (err) {
        console.warn('Failed to clean up temporary files:', err);
      }

      return gcpResult.fileUrl!;
    } catch (error: any) {
      console.error('Payslip Generation Error:', error);
      throw new Error(`Failed to generate payslip for ${employee.name}: ${error.message}`);
    }
  }
  private async replacePlaceholdersInDocx(inputPath: string, outputPath: string, data: any) {
    try {
      console.log("replacePlaceholdersInDocx", inputPath, outputPath);
      console.log("Template data keys:", Object.keys(data));

      // Check if template file exists
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Template file not found: ${inputPath}`);
      }

      const content = fs.readFileSync(inputPath, "binary");
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => {
          // Return empty string for missing properties instead of undefined
          return '';
        }
      });

      doc.render(data);

      const updatedContent = doc.getZip().generate({ type: "nodebuffer" });
      fs.writeFileSync(outputPath, updatedContent);
    } catch (error: any) {
      console.error('DOCX Template Rendering Error:', error);

      // Handle Docxtemplater MultiError
      if (error.properties && error.properties.errors && Array.isArray(error.properties.errors)) {
        const errors = error.properties.errors.map((err: any) => ({
          name: err.name,
          message: err.message,
          properties: err.properties
        }));
        console.error('Template errors:', JSON.stringify(errors, null, 2));
        throw new Error(`Template rendering failed: ${errors.map((e: any) => e.message).join('; ')}`);
      }

      throw error;
    }
  }

  private async convertDocxToPDF(docxPath: string, pdfPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Read the DOCX file
        const docxBuffer = fs.readFileSync(docxPath);

        // Convert to PDF
        convertToPdf(docxBuffer, '.pdf', undefined)
          .then((pdfBuffer) => {
            // Write PDF to file
            fs.writeFileSync(pdfPath, pdfBuffer);
            console.log(`PDF generated successfully at: ${pdfPath}`);
            resolve();
          })
          .catch((conversionError) => {
            console.error('PDF Conversion Error:', conversionError);
            reject(conversionError);
          });
      } catch (error) {
        console.error('PDF Conversion Setup Error:', error);
        reject(error);
      }
    });
  }

  private async numberToWords(num: number): Promise<string> {
    if (num === 0) return "zero";

    const belowTwenty = [
      "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
      "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
      "seventeen", "eighteen", "nineteen"
    ];

    const tens = [
      "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"
    ];

    const thousandUnits = ["", "thousand", "million"];

    function helper(n: number): string {
      if (n === 0) return "";
      else if (n < 20) return belowTwenty[n] + " ";
      else if (n < 100) return tens[Math.floor(n / 10)] + " " + helper(n % 10);
      else return belowTwenty[Math.floor(n / 100)] + " hundred " + helper(n % 100);
    }

    let result = "";
    let unitIndex = 0;

    while (num > 0) {
      let chunk = num % 1000;
      if (chunk !== 0) {
        result = helper(chunk) + thousandUnits[unitIndex] + " " + result;
      }
      num = Math.floor(num / 1000);
      unitIndex++;
    }

    return result.trim();
  }
  private getMonthName(monthNumber: number): string {
    console.log(monthNumber, "getMonthName monthNumber")
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthNumber - 1] || 'Unknown';
  }

  // Check payslip generation status
  async checkPayslipGeneration(month: number, year: number): Promise<any> {
    // Validate input
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new Error('Invalid month/year format');
    }

    // Find payroll and payslip records for the month
    const [payrollRecords, payslipRecords] = await Promise.all([
      Payroll.find({
        month,
        year,
        status: "Processing"
      }).select('employeeId'),
      Payslip.find({
        month,
        year
      }).populate('userId', 'name')
    ]);

    console.log(payrollRecords, "payrollRecords")
    console.log(payslipRecords, "payslipRecords")
    // Get employee details for payslips
    const payslipDetails = payslipRecords.map(payslip => ({
      employeeId: (payslip.userId as any)?._id.toString(),
      employeeName: (payslip.userId as any)?.name || 'Unknown',
      payslipId: payslip._id.toString(),
      payslipUrl: payslip.payslipUrl as string | null,
      status: payslip.status,
      isExport: payslip.isExport,
      sentAt: payslip.sentAt
    }));

    // Calculate summary
    const summary = {
      total: payrollRecords.length,
      generated: payslipRecords.length,
      pending: payrollRecords.length - payslipRecords.length
    };

    console.log({
      payrollCount: payrollRecords.length,
      payslipCount: payslipRecords.length,
      summary
    });

    return {
      generated: payrollRecords.length > 0 && payrollRecords.length === payslipRecords.length,
      payslips: payslipDetails,
      summary
    };
  }

  // Get payslip history with pagination
  async getPayslipHistory(query: IPayslipHistoryQuery, isAdmin: boolean) {
    const { userId, startDate, endDate, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;
    console.log(query, "query getPayslipHistory", skip)
    // Build filter
    const filter: any = {};
    if (!isAdmin && userId) {
      filter.userId = new Types.ObjectId(userId);
    } else if (userId) {
      // If querying a specific user
      filter.userId = new Types.ObjectId(userId);
    }
    // Handle date filtering - correct way to build date range
    if (startDate || endDate) {
      filter.generatedAt = {};

      if (startDate) {
        // Convert string dates to Date objects if needed
        const startDateObj = typeof startDate === 'string' ? new Date(startDate) : startDate;
        filter.generatedAt.$gte = startDateObj;
      }

      if (endDate) {
        // Convert string dates to Date objects if needed
        const endDateObj = typeof endDate === 'string' ? new Date(endDate) : endDate;
        filter.generatedAt.$lte = endDateObj;
      }
    }
    console.log(filter, "filters getPayslipHistory")
    const [payslips, total] = await Promise.all([
      Payslip.find(filter).sort({ generatedAt: -1 }).skip(skip).limit(limit)
        .populate('userId', 'name email')
        .populate('payrollId', 'month year'),
      Payslip.countDocuments(filter)
    ]);

    console.log(payslips, "get payslip records getPayslipHistory ")
    console.log(total, "totals")

    const formattedPayslips = payslips.map(payslip => ({
      payslipId: payslip._id,
      employeeId: typeof payslip.userId === 'object' ? payslip.userId._id : payslip.userId,
      employeeName: (payslip.userId as any).name,
      email: (payslip.userId as any).email,
      month: (payslip.payrollId as any).month,
      year: (payslip.payrollId as any).year,
      netSalary: payslip.netSalary,
    }));
    console.log(formattedPayslips, "formattedPayslips History getPayslipHistory");

    return {
      payslips: formattedPayslips,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // Check for pending payslips
  async getPendingPayslips(month: number, year: number): Promise<any[]> {
    return Payslip.find({
      month,
      year,
      payslipUrl: { $exists: true, $ne: null },
      $or: [
        { isExport: { $exists: false } },
        { isExport: false }
      ]
    }).populate('userId', 'name email');
  }
}

