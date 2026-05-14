import { Payroll, SalaryAssignment, User } from '../models';
import { PayrollStatus } from './payroll-status.service';
import { TaxDeclaration } from '../models/tax-declaration';
import ExcelJS from 'exceljs';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { Types } from 'mongoose';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
] as const;

const MONTH_SHORT_NAMES: Record<string, string> = {
    January: 'Jan',
    February: 'Feb',
    March: 'Mar',
    April: 'Apr',
    May: 'May',
    June: 'Jun',
    July: 'Jul',
    August: 'Aug',
    September: 'Sep',
    October: 'Oct',
    November: 'Nov',
    December: 'Dec',
};

/**
 * SalaryStatementService
 * 
 * Logic for generating salary statement reports (Excel).
 * Isolated from PayrollService to allow for specialized simulation/preview logic
 * without affecting core payroll processing.
 */
export class SalaryStatementService extends BaseService {
    constructor(context: RequestContext) {
        super(context);
    }

    /**
     * Generates a salary statement Excel file for the given month/year.
     * Supports both real payroll records and virtual (projected) data.
     */
    async generateSalaryStatement(month: number, year: number, isPreview: boolean = false, country?: string) {
        let payrollRecords: any[];
        console.log(`[SalaryStatementService] Generating statement for ${month}/${year}, preview=${isPreview}, country=${country || 'All'}`);

        if (isPreview) {
            // Generate virtual payroll data in-memory without saving to DB
            payrollRecords = await this.getVirtualPayrollData(month, year, country);
        } else {
            const query: any = {
                month,
                year,
                status: { $nin: [PayrollStatus.Cancelled] }
            };

            // If country is provided, we need to filter by employee's country
            // This requires a join/lookup or fetching IDs first.
            // For now, let's keep it simple or assume records have country field if needed.
            // Actually, Payroll model usually has employeeId populated.

            payrollRecords = await Payroll.find(query)
                .populate('employeeId')
                .lean();

            if (country) {
                payrollRecords = payrollRecords.filter(r => r.employeeId?.country === country);
            }
        }

        if (!payrollRecords.length) {
            throw new Error(`No ${isPreview ? 'eligible employees' : 'payroll records'} found for ${month}/${year}`);
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Salary Statement');
        const monthName = MONTH_NAMES[month - 1];

        // Column structure for advanced report
        const columnDefinitions = [
            { header: 'Employee No', key: 'employeeNo', width: 15 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Join Date', key: 'joinDate', width: 18 },
            { header: 'Left?', key: 'left', width: 10 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'DAYS IN MONTH', key: 'daysInMonth', width: 15 },
            { header: 'EMP EFFECTIVE WORKDAYS', key: 'effectiveWorkdays', width: 25 },
            { header: 'BASIC', key: 'basic', width: 12 },
            { header: 'HRA', key: 'hra', width: 12 },
            { header: 'CONSULTANCY FEES', key: 'consultancyFees', width: 20 },
            { header: 'OTHER ALLOWANCE', key: 'otherAllowance', width: 20 },
            { header: 'GROSS', key: 'gross', width: 15 },
            { header: 'PF', key: 'pf', width: 12 },
            { header: 'ESI', key: 'esi', width: 12 },
            { header: 'INCOME TAX', key: 'incomeTax', width: 15 },
            { header: 'Professional Tax', key: 'professionalTax', width: 18 },
            { header: 'TDS Amount', key: 'tdsAmount', width: 15 },
            { header: 'TOTAL DEDUCTIONS', key: 'totalDeductions', width: 20 },
            { header: 'NET PAY', key: 'netPay', width: 15 },
        ];

        // --- NEW: DYNAMIC COLUMNS FOR CUSTOM COMPONENTS ---
        const customEarningNames = new Set<string>();
        const customDeductionNames = new Set<string>();

        payrollRecords.forEach(record => {
            (record.customReimbursements || []).forEach((r: any) => {
                if (r.name) customEarningNames.add(r.name.trim().toUpperCase());
            });
            (record.customDeductions || []).forEach((d: any) => {
                if (d.name) customDeductionNames.add(d.name.trim().toUpperCase());
            });
        });

        const sortedCustomEarnings = Array.from(customEarningNames).sort();
        const sortedCustomDeductions = Array.from(customDeductionNames).sort();

        // Inject dynamic earnings after 'OTHER ALLOWANCE' (key: otherAllowance, index 10 in 0-based is index 11 in table)
        // Actually, let's inject them just before 'GROSS'.
        const grossIndex = columnDefinitions.findIndex(c => c.key === 'gross');
        sortedCustomEarnings.forEach(name => {
            columnDefinitions.splice(grossIndex, 0, {
                header: `${name} (+)`,
                key: `custom_earn_${name}`,
                width: 15
            });
        });

        // Inject dynamic deductions after 'PF' or before 'TOTAL DEDUCTIONS'
        const totalDeductionsIndex = columnDefinitions.findIndex(c => c.key === 'totalDeductions');
        sortedCustomDeductions.forEach(name => {
            columnDefinitions.splice(totalDeductionsIndex, 0, {
                header: `${name} (-)`,
                key: `custom_ded_${name}`,
                width: 15
            });
        });
        // --- END DYNAMIC COLUMNS ---

        worksheet.columns = columnDefinitions.map(col => ({ key: col.key, width: col.width }));
        worksheet.getRow(1).values = [];

        // 1. Created On (Row 1, Top Right)
        const createdOn = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
        const row1 = worksheet.getRow(1);
        const createdOnCell = row1.getCell(18);
        createdOnCell.value = `Created On: ${createdOn}`;
        createdOnCell.alignment = { horizontal: 'right' };
        createdOnCell.font = { size: 10, italic: true };

        // 2. Main Title (Row 2, Centered)
        const lastColLetter = worksheet.getColumn(columnDefinitions.length).letter;
        worksheet.mergeCells(`A2:${lastColLetter}2`);
        const titleCell = worksheet.getCell('A2');
        titleCell.value = `Salary Statement For The Month Of ${monthName} ${year}`;
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.font = { bold: true, size: 16 };
        worksheet.getRow(2).height = 30;

        // 3. Table Headers (Row 3)
        const headerRow = worksheet.getRow(3);
        columnDefinitions.forEach((col, index) => {
            const cell = headerRow.getCell(index + 1);
            cell.value = col.header;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF000000' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        headerRow.height = 25;

        // 4. Data Rows
        let grandTotals = {
            daysInMonth: 0,
            effectiveWorkdays: 0,
            basic: 0,
            hra: 0,
            consultancyFees: 0,
            otherAllowance: 0,
            gross: 0,
            pf: 0,
            esi: 0,
            incomeTax: 0,
            professionalTax: 0,
            tdsAmount: 0,
            totalDeductions: 0,
            netPay: 0
        };

        const customTotals: Record<string, number> = {};
        [...sortedCustomEarnings.map(n => `custom_earn_${n}`), ...sortedCustomDeductions.map(n => `custom_ded_${n}`)].forEach(key => {
            customTotals[key] = 0;
        });

        let positiveNetPayTotal = 0;
        let negativeNetPayTotal = 0;

        payrollRecords.forEach((record: any) => {
            const user = record.employeeId;
            if (!user) return;
            const customDeductionTotal = (record.customDeductions || []).reduce(
                (sum: number, item: any) => sum + Math.round(item?.value || 0),
                0
            );

            const rowData = {
                employeeNo: user.employeeCode || '',
                name: user.name || '',
                joinDate: user.joiningDate ? new Date(user.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
                left: user.active === false ? 'Yes' : 'No',
                status: isPreview ? (record.status || '') : (user.employmentStatus || ''),
                daysInMonth: record.totalDaysInMonth || 0,
                effectiveWorkdays: record.payableDays || 0,
                basic: Math.round(record.basic || 0),
                hra: Math.round(record.hra || 0),
                consultancyFees: Math.round(record.da || 0),
                otherAllowance: Math.round(record.otherAllowance || 0),
                gross: Math.round(record.monthlyGross || 0),
                pf: Math.round(record.epfEmployee || 0),
                esi: Math.round(record.esiEmployee || 0),
                incomeTax: Math.round(record.incomeTax || 0),
                professionalTax: Math.round(record.professionalTax || 0),
                tdsAmount: Math.round(record.tdsDeduction || 0),
                totalDeductions: Math.round((record.totalDeductions || 0) + customDeductionTotal),
                netPay: Math.round(record.netSalary || 0)
            };

            // Populate dynamic values
            sortedCustomEarnings.forEach(name => {
                const totalVal = (record.customReimbursements || [])
                    .filter((r: any) => (r.name || "").trim().toUpperCase() === name)
                    .reduce((sum: number, item: any) => sum + (item.value || 0), 0);
                (rowData as any)[`custom_earn_${name}`] = Math.round(totalVal);
                customTotals[`custom_earn_${name}`] += Math.round(totalVal);
            });

            sortedCustomDeductions.forEach(name => {
                const totalVal = (record.customDeductions || [])
                    .filter((d: any) => (d.name || "").trim().toUpperCase() === name)
                    .reduce((sum: number, item: any) => sum + (item.value || 0), 0);
                (rowData as any)[`custom_ded_${name}`] = Math.round(totalVal);
                customTotals[`custom_ded_${name}`] += Math.round(totalVal);
            });

            const row = worksheet.addRow(rowData);
            const netPayCell = row.getCell('netPay');
            if (record.netSalary < 0) {
                netPayCell.font = { color: { argb: 'FFFF0000' }, bold: true };
                negativeNetPayTotal += record.netSalary;
            } else if (record.netSalary > 0) {
                netPayCell.font = { color: { argb: 'FF00B050' }, bold: true };
                positiveNetPayTotal += record.netSalary;
            }

            grandTotals.daysInMonth += rowData.daysInMonth;
            grandTotals.effectiveWorkdays += rowData.effectiveWorkdays;
            grandTotals.basic += rowData.basic;
            grandTotals.hra += rowData.hra;
            grandTotals.consultancyFees += rowData.consultancyFees;
            grandTotals.otherAllowance += rowData.otherAllowance;
            grandTotals.gross += rowData.gross;
            grandTotals.pf += rowData.pf;
            grandTotals.esi += rowData.esi;
            grandTotals.incomeTax += rowData.incomeTax;
            grandTotals.professionalTax += rowData.professionalTax;
            grandTotals.tdsAmount += rowData.tdsAmount;
            grandTotals.totalDeductions += rowData.totalDeductions;
            grandTotals.netPay += rowData.netPay;

            row.eachCell((cell) => {
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
        });

        // 5. Grand Total Row with Integer Rounding matching Payroll dashboard
        const totalRow = worksheet.addRow({
            status: 'Grand Total',
            daysInMonth: grandTotals.daysInMonth,
            effectiveWorkdays: grandTotals.effectiveWorkdays,
            basic: Math.round(grandTotals.basic),
            hra: Math.round(grandTotals.hra),
            consultancyFees: Math.round(grandTotals.consultancyFees),
            otherAllowance: Math.round(grandTotals.otherAllowance),
            gross: Math.round(grandTotals.gross),
            pf: Math.round(grandTotals.pf),
            esi: Math.round(grandTotals.esi),
            incomeTax: Math.round(grandTotals.incomeTax),
            professionalTax: Math.round(grandTotals.professionalTax),
            tdsAmount: Math.round(grandTotals.tdsAmount),
            totalDeductions: Math.round(grandTotals.totalDeductions),
            netPay: Math.round(grandTotals.netPay),
            ...customTotals
        });
        totalRow.font = { bold: true };
        totalRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        if (negativeNetPayTotal < 0) {
            const posTotalRow = worksheet.addRow({ status: 'Total Positive Net Pay', netPay: Math.round(positiveNetPayTotal) });
            posTotalRow.font = { bold: true };
            posTotalRow.getCell('netPay').font = { color: { argb: 'FF00B050' }, bold: true };
            posTotalRow.eachCell(cell => cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } });

            const negTotalRow = worksheet.addRow({ status: 'Total Negative Net Pay', netPay: Math.round(negativeNetPayTotal) });
            negTotalRow.font = { bold: true };
            negTotalRow.getCell('netPay').font = { color: { argb: 'FFFF0000' }, bold: true };
            negTotalRow.eachCell(cell => cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } });
        }

        return workbook;
    }

    /**
     * Generates virtual payroll records for preview using a localized 
     * version of the core payroll engine to ensure independence from PayrollService.
     */
    private async getVirtualPayrollData(month: number, year: number, country?: string): Promise<any[]> {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);
        const daysInMonth = endDate.getDate();

        console.log(`[VirtualPayroll] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

        const userQuery: any = {
            $and: [
                { joiningDate: { $lte: endDate } },
                {
                    $or: [
                        { active: true },
                        { active: false, separationDate: { $gte: startDate, $lte: endDate } }
                    ]
                }
            ]
        };

        if (country) {
            userQuery.country = country;
        }

        const users = await User.find(userQuery).sort({ name: 1 }).lean();
        console.log(`[VirtualPayroll] Found ${users.length} potential users matching joining/separation criteria`);

        const existingPayrolls = await Payroll.find({
            month,
            year,
            employeeId: { $in: users.map((user: any) => user._id) },
            status: { $nin: [PayrollStatus.Cancelled] }
        })
            .sort({ updatedAt: -1 })
            .lean();

        const existingPayrollMap = new Map<string, any>();
        existingPayrolls.forEach((payroll: any) => {
            const employeeId = payroll.employeeId?.toString?.() || String(payroll.employeeId);
            if (!existingPayrollMap.has(employeeId)) {
                existingPayrollMap.set(employeeId, payroll);
            }
        });

        const payrollRecords: any[] = [];
        const monthName = MONTH_NAMES[month - 1];

        for (const user of users) {
            try {
                // Find latest salary assignment that started before or during this month
                const sa = await SalaryAssignment.findOne({
                    employeeId: user._id,
                    effectiveFrom: { $lte: endDate }
                })
                    .sort({ effectiveFrom: -1 })
                    .populate('salaryStructureId')
                    .lean();

                if (!sa) {
                    console.log(`[VirtualPayroll] Skipping ${user.name} (${user.employeeCode}): No salary assignment found starting on or before ${endDate.toLocaleDateString()}`);
                    continue;
                }

                if (!sa.salaryStructureId) {
                    console.log(`[VirtualPayroll] Skipping ${user.name} (${user.employeeCode}): Salary assignment exists but salaryStructureId is missing`);
                    continue;
                }

                // Calculate Simulation Payable Days
                // If they joined mid-month, pay from joining date
                const effectiveJoin = user.joiningDate > startDate ? user.joiningDate : startDate;

                // If they separated mid-month, or their salary assignment ends mid-month
                // We only respect separationDate if it's on or after joiningDate (avoiding stale data)
                // and only if it falls within or after the current month.
                let effectiveSeparation = endDate;
                if (user.separationDate && user.separationDate >= user.joiningDate) {
                    if (user.separationDate < endDate && user.separationDate >= startDate) {
                        effectiveSeparation = user.separationDate;
                    } else if (user.separationDate < startDate && !user.active) {
                        // Truly inactive and separated before this month
                        effectiveSeparation = new Date(startDate.getTime() - 1);
                    }
                }

                // Also respect the assignment's effectiveTo date
                if (sa.effectiveTo && sa.effectiveTo < effectiveSeparation) {
                    effectiveSeparation = sa.effectiveTo;
                }

                const payableDays = Math.max(0, Math.floor((effectiveSeparation.getTime() - effectiveJoin.getTime()) / (1000 * 60 * 60 * 24)) + 1);

                console.log(`[VirtualPayroll] Processing ${user.name}: payableDays=${payableDays} (Join: ${user.joiningDate.toLocaleDateString()}, Sep: ${user.separationDate?.toLocaleDateString() || 'N/A'})`);

                const record = await this.calculatePayrollRecordLocally(
                    user, sa, { presentDays: payableDays, weekendDays: 0, holidayDays: 0, absentDays: 0 },
                    0, daysInMonth, monthName, month, year
                );

                const existingPayroll = existingPayrollMap.get(user._id.toString());
                const customReimbursements = existingPayroll?.customReimbursements || [];
                const customDeductions = existingPayroll?.customDeductions || [];
                const customReimbursementsTotal = customReimbursements.reduce(
                    (sum: number, item: any) => sum + Math.round(item?.value || 0),
                    0
                );
                const customDeductionsTotal = customDeductions.reduce(
                    (sum: number, item: any) => sum + Math.round(item?.value || 0),
                    0
                );

                let statusBadge = user.joiningDate > startDate ? "Joined Mid-Month" :
                    (user.separationDate && user.separationDate >= startDate && user.separationDate <= endDate) ? "Separated Mid-Month" :
                        (!user.active ? "Inactive" : "Active");

                payrollRecords.push({
                    ...record,
                    customReimbursements,
                    customDeductions,
                    totalCustomReimbursements: customReimbursementsTotal,
                    totalCustomDeductions: customDeductionsTotal,
                    netSalary: Math.round((record.netSalary || 0) + customReimbursementsTotal - customDeductionsTotal),
                    employeeId: user,
                    status: statusBadge,
                    totalDaysInMonth: daysInMonth,
                    payableDays: payableDays
                });
            } catch (error) {
                console.error(`[VirtualPayroll] Error calculating for ${user.name}:`, error);
            }
        }

        console.log(`[VirtualPayroll] Total records generated: ${payrollRecords.length}`);
        return payrollRecords;
    }

    /**
     * LOCALIZED CALCULATION ENGINE
     * Duplicated from PayrollService to fulfill the requirement of not updating existing services 
     * while giving this service full control over simulation logic.
     */
    private async calculatePayrollRecordLocally(employee: any, sa: any, attendance: any, approvedLeaves: number, daysInMonth: number, monthName: string, month: number, year: number) {
        const country = employee.country || 'IN';
        const payableDays = Math.min(daysInMonth, attendance.presentDays + (attendance.weekendDays || 0) + (attendance.holidayDays || 0) + approvedLeaves);
        const monthlyGross = sa.monthlyGross;
        const struct = sa.salaryStructureId;

        // Base unrounded gross for calculation
        const rawAdjGross = (payableDays / daysInMonth) * monthlyGross;
        const adjGross = Math.round(rawAdjGross); // Round as per Model pre-save

        const basic = Math.round((struct.fixedEarnings.basicPercentage / 100) * adjGross);
        const hra = Math.round((struct.fixedEarnings.hraPercentage / 100) * adjGross);
        const da = Math.round((struct.fixedEarnings.daPercentage / 100) * adjGross);
        const travel = Math.round(country === 'AE' ? (sa.travelAllowance || 0) * (payableDays / daysInMonth) : (struct.fixedEarnings.travelAllowancePercentage / 100) * adjGross);
        const reim = Math.round((struct.fixedEarnings.reimbursementPercentage ?? 0) / 100 * adjGross);
        const other = adjGross - (basic + hra + da + travel + reim);

        const resDeductions = await this.calculateDeductionsLocally(basic, da, struct, monthName, month, year, employee._id, payableDays, daysInMonth, monthlyGross, country, employee.isConsultancy, employee.isIntern);

        return {
            basic, hra, da,
            otherAllowance: Math.round(other),
            travelAllowance: travel,
            reimbursementAllowance: reim,
            monthlyGross: adjGross,
            epfEmployee: Math.round(resDeductions.epfEmployee || 0),
            epfEmployer: Math.round(resDeductions.epfEmployer || 0),
            esiEmployee: Math.round(resDeductions.esiEmployee || 0),
            professionalTax: Math.round(resDeductions.professionalTax),
            incomeTax: Math.round(resDeductions.incomeTax),
            tdsDeduction: Math.round(resDeductions.tdsDeduction),
            totalDeductions: Math.round(resDeductions.totalDeductions),
            netSalary: Math.round(adjGross - resDeductions.totalDeductions),
        };
    }

    private async calculateDeductionsLocally(basic: number, da: number, struct: any, monthName: string, month: number, year: number, empId: Types.ObjectId, payableDays: number, daysInMonth: number, monthlyGross: number, country: string, isConsultancy: boolean, isIntern: boolean) {
        if (country === 'AE') {
            const unpaid = Math.max(daysInMonth - payableDays, 0);
            const leaveDed = unpaid > 0 ? (unpaid / daysInMonth) * monthlyGross : 0;
            return { epfEmployee: 0, esiEmployee: 0, professionalTax: 0, incomeTax: 0, tdsDeduction: 0, totalDeductions: 0, leaveDeductions: leaveDed };
        }

        let epfEmployee = 0;
        let epfEmployer = 0;
        let esiEmployee = 0;
        if (!isConsultancy && !isIntern) {
            // EPF: Decoupled logic (12% Employee, 13% Employer)
            const epfConfig = struct.statutoryDeductions.epf;
            const basicForEpf = basic + da;
            const maxLimit = epfConfig.maxLimit || 15000;

            const epfRawEmployee = (epfConfig.employeeContribution / 100) * basicForEpf;
            const epfCapEmployee = (epfConfig.employeeContribution / 100) * maxLimit;
            epfEmployee = Number((basicForEpf >= maxLimit ? epfCapEmployee : epfRawEmployee).toFixed(2));

            const epfRawEmployer = (epfConfig.employerContribution / 100) * basicForEpf;
            const epfCapEmployer = (epfConfig.employerContribution / 100) * maxLimit;
            epfEmployer = Number((basicForEpf >= maxLimit ? epfCapEmployer : epfRawEmployer).toFixed(2));

            // ESI: 0.75% of actual Gross if actual Gross <= 21000
            const esiConfig = struct.statutoryDeductions.esi || { applicabilityLimit: 21000, employeeContribution: 0.75 };
            const actualGross = basic + da + (struct.fixedEarnings.hraPercentage / 100 * monthlyGross * (payableDays / daysInMonth)); // Simplified estimate
            if (actualGross <= esiConfig.applicabilityLimit) {
                esiEmployee = Number(((esiConfig.employeeContribution / 100) * actualGross).toFixed(2));
            }
        }

        let pt = 0;
        if (!isConsultancy && !isIntern) pt = this.calculatePTLocally(monthlyGross, struct.statutoryDeductions.professionalTax, month);

        let it = 0;
        let tds = isConsultancy ? Number(((1 / 100) * monthlyGross).toFixed(2)) : 0;
        if (!isConsultancy && !isIntern) it = await this.calculateITLocally(empId, monthName, month, year);

        const unpaid = Math.max(daysInMonth - payableDays, 0);
        const leaveDed = Number((unpaid > 0 ? (unpaid / daysInMonth) * monthlyGross : 0).toFixed(2));

        // NOTE: totalDeductions here only includes statutory items because the base 'adjGross' 
        // in calculatePayrollRecordLocally already accounts for 'leaveDed'.
        return {
            epfEmployee,
            epfEmployer,
            esiEmployee,
            professionalTax: pt,
            incomeTax: it,
            tdsDeduction: tds,
            totalDeductions: Number((epfEmployee + esiEmployee + pt + it + tds).toFixed(2)),
            leaveDeductions: leaveDed
        };
    }

    private calculatePTLocally(gross: number, config: any, month: number): number {
        const { term, slabs } = config;
        const applicable: Record<string, number[]> = { half_yearly: [2, 8], yearly: [4], monthly: Array.from({ length: 12 }, (_, i) => i + 1) };
        if (!applicable[term]?.includes(month)) return 0;
        const mult: Record<string, number> = { monthly: 1, half_yearly: 6, yearly: 12 };
        const comparison = gross * (mult[term] ?? 1);
        for (const slab of slabs) {
            if (comparison >= slab.fromAmount && (!slab.toAmount || comparison <= slab.toAmount)) return slab.taxAmount;
        }
        return 0;
    }

    private async calculateITLocally(empId: Types.ObjectId, monthName: string, month: number, year: number): Promise<number> {
        const fYear = month <= 3 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
        const shortName = MONTH_SHORT_NAMES[monthName] || monthName;
        const dec = await TaxDeclaration.findOne({ employeeId: empId, financialYear: fYear }).lean();
        if (!dec) return 0;
        const md = dec.monthlyDeductions?.find((m: any) => m.month === shortName && m.financialYear === fYear && !m.isProcessed);
        return md ? md.plannedDeduction : 0;
    }
}
