import { FastifyRequest, FastifyReply } from 'fastify';
import { FinalSettlement, IFinalSettlement } from '../models/final-settlement.model';
import { Payroll } from '../models/payrolls.model';
import { User } from '../models/user.model';
import { LeaveSummary } from '../models/leave-summary.model';
import { SalaryAssignment } from '../models/salary-assignments.model';
import { AttendanceRecord, Leave } from '../models';
import { ShiftAssignment } from '../models/shift.model';
import { HolidayCalendar } from '../models/holiday-calendar.model';
import { Types } from 'mongoose';
import { Storage } from '@google-cloud/storage';
import path from 'path';

import { emailService } from './email.service';
import { generateFNFLetter } from './fnf-puppeteer.helper';
import { TaxDeclaration } from '../models/tax-declaration';
import { Document } from '../models/document.model';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_SHORT_NAMES: Record<string, string> = {
    January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr',
    May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
    September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec'
};

/**
 * Helper: Calculate Unpaid Gaps (Months between Last Paid and LWD)
 * Extracts the complex loop logic to be reusable in Save/Update updates.
 */
async function calculateUnpaidGaps(
    employeeId: string,
    leavingDate: Date,
    monthlyGross: number,
    salaryAssignment: any,
    holdPayrolls: any[]
) {
    const unpaidMonths = [];
    let totalUnpaidSalary = 0;
    let totalDaysWorked = 0;
    let totalProfessionalTax = 0;
    let totalProvidentFund = 0;
    let totalEpfEmployer = 0;     // ✅ Added
    let totalEpfEmployerEps = 0;  // ✅ Added
    let totalEpfEmployerEpf = 0;  // ✅ Added
    let totalIncomeTax = 0;
    let totalESI = 0;
    let totalLOPAmount = 0; // Track total LOP

    // Find last PAID payroll (status = Completed)
    const lastPaidPayroll = await Payroll.findOne({
        employeeId: new Types.ObjectId(employeeId),
        status: 'Completed'
    }).sort({ year: -1, month: -1 });

    const employee = await User.findById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const lwdDate = new Date(leavingDate);
    const lwdMonth = lwdDate.getMonth() + 1;
    const lwdYear = lwdDate.getFullYear();
    let currentMonth = 0;
    let currentYear = 0;

    // Helper functions
    const incrementMonth = () => {
        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
    };

    const calculatePT = (grossSalary: number, monthNumber: number, isLWD: boolean) => {
        const ptConfig = salaryAssignment?.salaryStructureId?.statutoryDeductions?.professionalTax;
        if (!ptConfig?.slabs?.length) return 0;
        const { term, slabs } = ptConfig;

        let shouldDeduct = false;
        const applicableMonths: Record<string, number[]> = {
            half_yearly: [2, 8], // Standard: Feb & Aug
            yearly: [4],
            monthly: Array.from({ length: 12 }, (_, i) => i + 1),
        };

        // 1. Standard Deduction Check (Monthly or traditional half-yearly months)
        if (applicableMonths[term]?.includes(monthNumber) || [4, 10].includes(monthNumber)) {
            shouldDeduct = true;
        }
        // 2. FNF Special Rule (Catch-up for Half-Yearly)
        // If employee leaves BEFORE the deduction month (Aug or Feb), they are still liable for that half-year.
        else if (term === 'half_yearly' && isLWD) {
            // First Half (Apr-Sept): If leaving in Apr-Jul, force deduction.
            if ([5, 6, 7].includes(monthNumber)) shouldDeduct = true;

            // Second Half (Oct-Mar): If leaving in Oct-Jan, force deduction.
            if ([11, 12, 1].includes(monthNumber)) shouldDeduct = true;
        }

        if (!shouldDeduct) return 0;

        for (const slab of slabs) {
            if (grossSalary >= slab.fromAmount && (!slab.toAmount || grossSalary <= slab.toAmount)) {
                return Number(slab.taxAmount) || 0;
            }
        }
        return 0;
    };

    const calculatePF = (basic: number, da: number) => {
        const structure = salaryAssignment?.salaryStructureId;
        const epfConfig = structure?.statutoryDeductions?.epf;
        const employerSplit = structure?.statutoryDeductions?.employerSplit;
        
        if (!epfConfig) return { epfEmployee: 0, epfEmployer: 0, epfEmployerEps: 0, epfEmployerEpf: 0 };

        const empRate = epfConfig.employeeContribution ?? 12;
        const employerRate = epfConfig.employerContribution ?? 13;
        const epsPercentage = employerSplit?.epsPercentage ?? 8.33;
        const epsWageCap = employerSplit?.epsWageCap ?? 15000;
        
        const wage = basic + (da || 0);
        const maxLimit = epfConfig.maxLimit ?? 15000;

        // Separate caps for employee and employer
        const maxEpfEmployee = (empRate / 100) * maxLimit;
        const maxEpfEmployer = (employerRate / 100) * maxLimit;

        const isCapped = basic >= maxLimit;

        const finalEpfEmployee = Math.round(isCapped ? maxEpfEmployee : wage * (empRate / 100));
        const finalEpfEmployer = Math.round(isCapped ? maxEpfEmployer : wage * (employerRate / 100));

        // EPS (Pension) Calculation
        const currentWageForEps = Math.min(wage, epsWageCap);
        const finalEpfEmployerEps = Math.round((epsPercentage / 100) * currentWageForEps);

        // EPF (Employer Share) = Total Employer - EPS
        const finalEpfEmployerEpf = Math.max(0, finalEpfEmployer - finalEpfEmployerEps);

        return {
            epfEmployee: finalEpfEmployee,
            epfEmployer: finalEpfEmployer,
            epfEmployerEps: finalEpfEmployerEps,
            epfEmployerEpf: finalEpfEmployerEpf
        };
    };

    const calculateESI = () => 0;

    const calculateIncomeTax = async (monthNumber: number, year: number) => {
        const financialYear = monthNumber <= 3 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
        const monthName = MONTH_NAMES[monthNumber - 1];
        const monthShortName = MONTH_SHORT_NAMES[monthName] || monthName;

        const taxDeclaration = await TaxDeclaration.findOne({
            employeeId: new Types.ObjectId(employeeId),
            financialYear,
        }).lean();

        if (!taxDeclaration) return 0;

        const monthlyDeduction = taxDeclaration.monthlyDeductions?.find(
            (md) => md.month === monthShortName && md.financialYear === financialYear && !md.isProcessed
        );

        return monthlyDeduction?.plannedDeduction || 0;
    };

    // Calculation Loop
    // Determine start month
    let startDate: Date;
    if (lastPaidPayroll) {
        // Default: Start from Next Month of Last Paid
        startDate = new Date(lastPaidPayroll.year, lastPaidPayroll.month, 1); // Month is 0-indexed in Date, but LastPaid.month is 1-indexed. So (year, month) is effectively month+1.
        // ex: Paid Jan (1). Date(Y, 1, 1) = Feb 1. Correct.
    } else {
        startDate = employee.joiningDate || new Date();
    }

    // ❌ REMOVED: Previous requirement "resignation date to last working date" caused issues where gaps
    // between Last Paid (e.g. Dec) and Resignation Month (e.g. Feb) were skipped.
    // We must calculate ALL unpaid months since the last payroll regardless of resignation date. 
    /*
    if (resignationDate) {
        // Align to the first of the resignation month to ensure the full month is considered if applicable
        const resMonthStart = new Date(resignationDate.getFullYear(), resignationDate.getMonth(), 1);
        if (resMonthStart > startDate) {
           // startDate = resMonthStart; // DISABLED to allow full gap calculation
        }
    }
    */

    currentMonth = startDate.getMonth() + 1;
    currentYear = startDate.getFullYear();

    const holdMonthSet = new Set(
        holdPayrolls.map(p => `${p.year}-${p.month}`)
    );

    // ✅ PT AGGREGATE INITIALIZATION:
    // Identify Cycle Start for the current LWD (Apr-Sep or Oct-Mar)
    const isH1 = lwdMonth >= 4 && lwdMonth <= 9;
    const cycleStartYear = isH1 ? lwdYear : (lwdMonth >= 10 ? lwdYear : lwdYear - 1);

    let cycleAggregateGross = 0;
    let cyclePaidPT = 0;

    // ✅ ACTUAL LEGAL: Fetch ALL Salary Assignments to handle historical hikes accurately
    const allSalaryAssignments: any[] = await SalaryAssignment.find({
        employeeId: new Types.ObjectId(employeeId)
    }).sort({ effectiveFrom: 1 }).populate('salaryStructureId').lean();

    const _latestSalaryAssignment = allSalaryAssignments.length ? allSalaryAssignments[allSalaryAssignments.length - 1] : salaryAssignment;
    const _latestMonthlyGross = _latestSalaryAssignment?.monthlyGross || monthlyGross;

    // Helper: Find assignment for month
    const getAssignmentForMonth = (month: number, year: number) => {
        const firstDayOfMonth = new Date(year, month - 1, 1);
        const lastDayOfMonth = new Date(year, month, 0);

        return allSalaryAssignments.find((a: any) =>
            new Date(a.effectiveFrom) <= lastDayOfMonth &&
            new Date(a.effectiveTo) >= firstDayOfMonth
        ) || _latestSalaryAssignment;
    };

    // Iterate through each month of the cycle up to the month BEFORE the first gap month
    const startOfCycle = isH1 ? new Date(cycleStartYear, 3, 1) : new Date(cycleStartYear, 9, 1);
    const endOfCycle = isH1 ? new Date(cycleStartYear, 8, 30) : new Date(cycleStartYear + 1, 2, 31);

    // Fetch all relevant payrolls for the cycle
    const cyclePayrolls = await Payroll.find({
        employeeId: new Types.ObjectId(employeeId),
        status: 'Completed',
        type: { $ne: 'FinalSettlement' },
        $or: [
            { year: cycleStartYear, month: { $gte: isH1 ? 4 : 10 } },
            { year: cycleStartYear + 1, month: { $lte: 3 } }
        ]
    }).lean();

    const payrollMap = new Map(cyclePayrolls.map(p => [`${p.year}-${p.month}`, p]));

    // Iterate through cycle months to determine aggregate gross
    let checkDate = new Date(startOfCycle);
    const lastMonthToCalc = new Date(currentYear, currentMonth - 1, 1); // Start of our "Unpaid Gaps" loop

    while (checkDate < lastMonthToCalc && checkDate <= endOfCycle) {
        const cM = checkDate.getMonth() + 1;
        const cY = checkDate.getFullYear();
        const key = `${cY}-${cM}`;

        const existing = payrollMap.get(key);
        if (existing) {
            cycleAggregateGross += (Number(existing.attendanceAdjustGross) || Number((existing as any).attendanceAdjustedGross) || Number(existing.monthlyGross) || 0);
            cyclePaidPT += (Number(existing.professionalTax) || 0);
        } else {
            // ✅ ACTUAL LEGAL: Identify correct salary for this historical month
            const monthHistAssignment = getAssignmentForMonth(cM, cY);
            const monthHistGross = monthHistAssignment?.monthlyGross || _latestMonthlyGross;

            // If NO payroll exists, but employee was ACTIVE, we should assume they earned their gross
            const jDate = employee.joiningDate ? new Date(employee.joiningDate) : null;
            if (jDate && checkDate >= new Date(jDate.getFullYear(), jDate.getMonth(), 1)) {
                cycleAggregateGross += monthHistGross;
            }
        }

        // Move to next month
        checkDate.setMonth(checkDate.getMonth() + 1);
    }

    console.log(`PT Cycle Aware Debug: Found ${cyclePayrolls.length} items in DB. Calculated Aggregate: ${cycleAggregateGross} for cycle starting ${startOfCycle.toISOString()}`);

    // Loop through all months from (lastPaid + 1) to LWD month
    while (
        currentYear < lwdYear ||
        (currentYear === lwdYear && currentMonth <= lwdMonth)
    ) {
        const monthKey = `${currentYear}-${currentMonth}`;

        // ✅ LOGIC FIX:
        // If the month exists in Hold Payrolls, we should SKIP it here.
        // It will be added to the Final Settlement as a "Hold Salary" component.
        // We only want to calculate "Unpaid Gaps" for months that are NOT in Hold.
        if (holdMonthSet.has(monthKey)) {
            // Skip this month, it's already covered by Hold Payrolls
            incrementMonth();
            continue;
        }

        const isLWDMonth = currentYear === lwdYear && currentMonth === lwdMonth;
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

        // If it is the LWD month, we limit the calculation to the LWD date.
        // Otherwise, it's a full unpaid month.
        const maxDays = isLWDMonth ? lwdDate.getDate() : daysInMonth;

        const periodStartDate = new Date(currentYear, currentMonth - 1, 1);
        const endDate = isLWDMonth ? lwdDate : new Date(currentYear, currentMonth, 0);
        endDate.setHours(23, 59, 59, 999);

        // Fetch attendance
        const attendanceRecords = await AttendanceRecord.find({
            userId: new Types.ObjectId(employeeId),
            shiftDay: {
                $gte: periodStartDate,
                $lte: endDate
            }
        }).select('shiftDay attendanceStatus halfType').lean();

        // Shift Assignment & Weekends
        const firstDay = new Date(currentYear, currentMonth - 1, 1);
        const lastDay = new Date(currentYear, currentMonth, 0);
        const shiftAssignments = await ShiftAssignment.find({
            userId: new Types.ObjectId(employeeId),
            $or: [
                { endDate: { $exists: false }, startDate: { $lte: lastDay } },
                { endDate: { $gte: firstDay }, startDate: { $lte: lastDay } },
            ],
        }).select('weekendDays').lean();
        const weekendDayNumbers = shiftAssignments.length > 0 && shiftAssignments[0].weekendDays?.length
            ? Array.from(new Set(shiftAssignments.flatMap((s: any) => s.weekendDays || [])))
            : [0, 6];

        // Mandatory Holidays
        const userForCalendar = await User.findById(employeeId).select('holidayCalendarHistory').lean();
        let mandatoryHolidayCount = 0;
        const mandatoryHolidayDateStrs: string[] = [];
        if (userForCalendar?.holidayCalendarHistory?.length) {
            const historyEntry = (userForCalendar as any).holidayCalendarHistory.find(
                (e: any) => e.year === currentYear && e.isActive === true
            );
            if (historyEntry) {
                const cal = await HolidayCalendar.findById(historyEntry.calendarId).select('holidays').lean();
                if (cal?.holidays) {
                    (cal.holidays as any[]).filter((h: any) => {
                        const d = new Date(h.date);
                        return d.getFullYear() === currentYear && d.getMonth() === currentMonth - 1 && d.getDate() <= maxDays && h.type === 'mandatory';
                    }).forEach((h: any) => {
                        mandatoryHolidayCount++;
                        mandatoryHolidayDateStrs.push(new Date(h.date).toISOString().split('T')[0]);
                    });
                }
            }
        }

        // Calculate Weekends (Only up to LWD)
        let weekendDaysInMonth = 0;
        const employmentDaysForWeekend = isLWDMonth ? lwdDate.getDate() : daysInMonth;
        for (let i = 1; i <= employmentDaysForWeekend; i++) {
            const d = new Date(currentYear, currentMonth - 1, i);
            const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            if (mandatoryHolidayDateStrs.includes(dateStr)) continue;
            if (weekendDayNumbers.includes(d.getDay())) weekendDaysInMonth++;
        }
        const holidayDays = mandatoryHolidayCount;

        // Calculate Present
        let presentDays = 0;
        const statusList = (arr: string[] | undefined) => Array.isArray(arr) ? arr : [];
        attendanceRecords.forEach((record: any) => {
            const arr = statusList(record.attendanceStatus);
            const isWeekend = record.shiftDay && weekendDayNumbers.includes(new Date(record.shiftDay).getDay());
            const isPresentLike = arr.includes('Present') || arr.includes('Late') || arr.includes('On-Time') || arr.includes('Early-Exit')
                || (arr.includes('Override') && arr.includes('Present'));
            const isOnLeave = arr.includes('On-Leave');
            const halfDay = record.halfType && (record.halfType === 'First Half' || record.halfType === 'Second Half');
            if (!isWeekend && isPresentLike) {
                presentDays += (halfDay && isOnLeave) ? 0.5 : 1;
            }
        });

        const weekendDays = weekendDaysInMonth;

        // Approved Leaves
        const leaves = await Leave.find({
            userId: new Types.ObjectId(employeeId),
            status: 'Approved',
            startDate: { $lte: endDate },
            endDate: { $gte: periodStartDate }
        });

        let leaveDays = 0;
        let lopDays = 0;

        for (const leave of leaves) {
            const leaveStart = leave.startDate < periodStartDate ? periodStartDate : leave.startDate;
            const leaveEnd = leave.endDate > endDate ? endDate : leave.endDate;
            const days = Math.floor((leaveEnd.getTime() - leaveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            if (leave.leaveType === 'LOP' || leave.leaveType === 'Loss Of Pay') {
                lopDays += days;
            } else {
                leaveDays += days;
            }
        }

        let payableDays = presentDays + weekendDays + holidayDays + leaveDays;

        // ✅ LOP Calculation Logic (Updated):
        // LOP should ONLY be calculated for days within the employment period (1st to LWD or End of Month).
        // Days AFTER the LWD are NOT LOP; they are simply non-payable, non-employment days.

        const employmentDays = isLWDMonth ? lwdDate.getDate() : daysInMonth;

        // Cap payableDays at employmentDays (just in case)
        if (payableDays > employmentDays) payableDays = employmentDays;

        // LOP = Employment Days - Payable Days
        // Ensure we don't return negative LOP
        lopDays = Math.max(0, employmentDays - payableDays);

        // ✅ GUARD 2: Skip if no payable days (CRITICAL - Prevents overpayment)
        if (payableDays <= 0) {
            incrementMonth();
            continue;
        }

        // ✅ ACTUAL LEGAL: Fetch correct assignment for THIS specific gap month
        const currentMonthAssignment = getAssignmentForMonth(currentMonth, currentYear);
        const currentMonthGross = currentMonthAssignment?.monthlyGross || _latestMonthlyGross;
        const currentMonthStructure = currentMonthAssignment?.salaryStructureId || _latestSalaryAssignment?.salaryStructureId || {};

        const monthlySalary = (currentMonthGross / daysInMonth) * payableDays;

        // Proration Logic (Matched with Payroll Service)
        const structure = currentMonthStructure;
        const basicPerc = structure.fixedEarnings?.basicPercentage ?? 0;
        const daPerc = Number(structure.fixedEarnings?.daPercentage) || 0;
        const hraPerc = Number(structure.fixedEarnings?.hraPercentage) || 0;
        const conveyancePerc = Number(structure.fixedEarnings?.conveyancePercentage) || 0;
        // removed otherAllowancePerc as it is now calculated via balancing logic below

        const fullBasic = currentMonthGross * (basicPerc / 100);
        const fullDA = daPerc === 0 ? 0 : fullBasic * (daPerc / 100);
        const fullHRA = currentMonthGross * (hraPerc / 100);
        const fullConveyance = currentMonthGross * (conveyancePerc / 100);
        // removed fullOtherAllowances

        const proratedBasic = (fullBasic / daysInMonth) * payableDays;
        const proratedDA = (fullDA / daysInMonth) * payableDays;
        const proratedHRA = (fullHRA / daysInMonth) * payableDays;
        const proratedConveyance = (fullConveyance / daysInMonth) * payableDays;

        // Note: Use rounded components and sum value to avoid 1-rupee rounding drift.
        const lopAmount = (currentMonthGross / daysInMonth) * lopDays;

        // ✅ PT Calculation Logic (Updated to Aggregate Cycle Logic)
        // Add current month's earned gross to the aggregate ONLY if it's in the same cycle as LWD (Apr-Sep or Oct-Mar)
        const currentMonthIsH1 = currentMonth >= 4 && currentMonth <= 9;
        if (currentMonthIsH1 === isH1) {
            cycleAggregateGross += Math.round(monthlySalary);
        }

        let ptAmount = 0;
        const ptConfig = salaryAssignment?.salaryStructureId?.statutoryDeductions?.professionalTax;
        const ptTerm = ptConfig?.term || 'half_yearly';

        if (ptTerm === 'half_yearly') {
            // Half-Yearly: Only calculate PT deduction in the EXIT month (Aggregate sum)
            if (isLWDMonth) {
                // Determine slab for TOTAL cycle gross (Reusing calculatePT for slab lookup)
                const representativeMonth = isH1 ? 8 : 2; // Aug or Feb
                const totalDueForCycle = Math.round(calculatePT(cycleAggregateGross, representativeMonth, true));
                ptAmount = Math.max(0, totalDueForCycle - cyclePaidPT);
            } else {
                ptAmount = 0; // Gap months for half-yearly have 0 PT (deducted at end)
            }
        } else {
            // Monthly / Yearly / Other Fallbacks: Deduct in every applicable month (Individual monthly gross)
            ptAmount = Math.round(calculatePT(currentMonthGross, currentMonth, isLWDMonth));
        }

        const { epfEmployee, epfEmployer, epfEmployerEps, epfEmployerEpf } = calculatePF(proratedBasic, proratedDA);
        const pfAmount = epfEmployee;
        const itAmount = await calculateIncomeTax(currentMonth, currentYear);
        const esiAmount = calculateESI();

        const targetGross = Math.round(monthlySalary);
        const componentBasic = Math.round(proratedBasic + proratedDA);
        const componentHRA = Math.round(proratedHRA);
        const componentConveyance = Math.round(proratedConveyance);

        // Internal Balancing Logic: Adjust 'Other Allowances' to ensure sum of components exactly matches rounded total gross.
        const componentOtherAllowances = targetGross - (componentBasic + componentHRA + componentConveyance);

        const componentSum = targetGross;
        const componentGross = componentSum;
        const componentOtherAllowancesAdjusted = componentOtherAllowances;

        const roundedSalary = componentGross;

        unpaidMonths.push({
            month: currentMonth,
            year: currentYear,
            monthYear: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
            totalDays: daysInMonth,
            daysWorked: payableDays,
            presentDays: presentDays,
            weekendDays: weekendDays,
            holidayDays: holidayDays,
            leaveDays: leaveDays,
            lopDays: lopDays,
            lopAmount: Math.round(lopAmount),
            components: {
                basic: componentBasic,
                hra: componentHRA,
                conveyance: componentConveyance,
                specialAllowance: 0,
                otherAllowances: componentOtherAllowancesAdjusted,
                gross: componentGross
            },
            salary: roundedSalary,
            professionalTax: ptAmount,
            incomeTax: itAmount,
            providentFund: pfAmount,
            epfEmployer: epfEmployer,       // ✅ Added
            epfEmployerEps: epfEmployerEps, // ✅ Added
            epfEmployerEpf: epfEmployerEpf, // ✅ Added
            esi: esiAmount
        });

        totalUnpaidSalary += roundedSalary;
        totalDaysWorked += payableDays;
        totalProfessionalTax += ptAmount;
        totalProvidentFund += pfAmount;
        totalEpfEmployer += epfEmployer;        // ✅ Added
        totalEpfEmployerEps += epfEmployerEps;  // ✅ Added
        totalEpfEmployerEpf += epfEmployerEpf;  // ✅ Added
        totalIncomeTax += itAmount;
        totalESI += esiAmount;
        totalLOPAmount += Math.round(lopAmount);

        incrementMonth();
    }

    return {
        unpaidMonths,
        totalUnpaidSalary: Math.round(totalUnpaidSalary),
        totalDaysWorked,
        totalProfessionalTax,
        totalProvidentFund,
        totalEpfEmployer,     // ✅ Added
        totalEpfEmployerEps,  // ✅ Added
        totalEpfEmployerEpf,  // ✅ Added
        totalIncomeTax,
        totalESI,
        totalLOPAmount // Return for Final Calc
    };
}

/**
 * Helper: Calculate Notice Period Data
 * Handles days served and LOP adjustment
 */
async function calculateNoticeData(
    employeeId: string,
    resignationDate: Date,
    leavingDate: Date,
    noticePeriodDays: number,
    monthlyGross: number
) {
    let daysServed = 0;
    if (resignationDate && leavingDate) {
        const start = new Date(resignationDate);
        const end = new Date(leavingDate);
        // Base days (inclusive)
        daysServed = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // Subtract LOP during notice period
        const noticeLeaves = await Leave.find({
            userId: new Types.ObjectId(employeeId),
            status: 'Approved',
            startDate: { $lte: end },
            endDate: { $gte: start },
            $or: [{ leaveType: 'LOP' }, { leaveType: 'Loss Of Pay' }]
        });

        let lopDuringNotice = 0;
        for (const leave of noticeLeaves) {
            const lStart = leave.startDate < start ? start : leave.startDate;
            const lEnd = leave.endDate > end ? end : leave.endDate;
            if (lStart <= lEnd) {
                const days = Math.floor((lEnd.getTime() - lStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                lopDuringNotice += days;
            }
        }
        daysServed = Math.max(0, daysServed - lopDuringNotice);
    }

    const excessInNotice = daysServed - noticePeriodDays;

    let noticePeriodRecovery = 0;

    // ✅ Updated Calculation: Annual Days Logic (Day-wise based on month)
    // If shortfall exists, calculate recovery based on ACTUAL days in the specific months of the shortfall
    if (excessInNotice < 0) {
        const shortfallDays = Math.abs(excessInNotice);

        // Use UTC to avoid timezone shifts affecting the "Start Date"
        // ex: Feb 15T00:00:00Z should start recovery on Feb 16, regardless of server timezone
        const lDate = new Date(leavingDate);
        let currentIter = new Date(Date.UTC(lDate.getUTCFullYear(), lDate.getUTCMonth(), lDate.getUTCDate()));

        // Start recovery from the day AFTER leaving
        currentIter.setUTCDate(currentIter.getUTCDate() + 1);

        for (let i = 0; i < shortfallDays; i++) {
            const year = currentIter.getUTCFullYear();
            const month = currentIter.getUTCMonth(); // 0 = Jan

            // Days in Month using UTC (Day 0 of next month = Last day of current)
            const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

            noticePeriodRecovery += monthlyGross / daysInMonth;

            // Move to next day
            currentIter.setUTCDate(currentIter.getUTCDate() + 1);
        }
    }

    return { daysServed, excessInNotice, noticePeriodRecovery };
}

/**
 * Helper: Calculate Gratuity
 * Rule: 4 years 240 days (approx 4.66 years)
 */
/*
function calculateGratuity(
    joiningDate: Date,
    leavingDate: Date,
    monthlyGross: number,
    basicPercentage: number
) {
    if (!joiningDate || !leavingDate) return 0;
    const serviceMs = new Date(leavingDate).getTime() - new Date(joiningDate).getTime();
    const serviceYears = serviceMs / (1000 * 60 * 60 * 24 * 365.25);
 
    // 4 years and 240 days rule (~4.66 years)
    if (serviceYears >= 4.66) {
        const lastBasic = monthlyGross * (basicPercentage / 100);
        // Formula: (Last Basic * 15 / 26) * Completed Years (rounded)
        return Math.round((lastBasic * 15 / 26) * Math.round(serviceYears));
    }
    return 0;
}
*/


// Enhanced with component breakdown calculation

/**
 * Initialize Final Settlement (Auto-fill from existing data)
 * GET /final-settlement/initialize/:employeeId
 */
export async function initializeFinalSettlement(
    request: FastifyRequest<{ Params: { employeeId: string } }>,
    reply: FastifyReply
) {
    try {
        const { employeeId } = request.params;

        if (!Types.ObjectId.isValid(employeeId)) {
            return reply.code(400).send({ success: false, error: 'Invalid employee ID' });
        }

        // Get employee details
        const employee = await User.findById(employeeId);
        if (!employee) {
            return reply.code(404).send({ success: false, error: 'Employee not found' });
        }

        // ✅ VALIDATION: Check salary assignment exists and is active
        const salaryAssignment: any = await SalaryAssignment.findOne({
            employeeId: new Types.ObjectId(employeeId)
        }).sort({ effectiveFrom: -1 }).populate('salaryStructureId');

        // Block if no salary assignment found
        if (!salaryAssignment) {
            return reply.code(400).send({
                success: false,
                error: 'No salary assignment found for this employee. Please assign a salary structure before processing final settlement.'
            });
        }

        // Block if salary assignment is not active (using isActive field)
        if (!salaryAssignment.isActive) {
            return reply.code(400).send({
                success: false,
                error: `Salary assignment is not active. Please activate the salary assignment before processing final settlement.`
            });
        }

        const monthlyGross = salaryAssignment?.monthlyGross || 0;

        // Get latest resignation (if exists)
        const resignation = employee.resignations && employee.resignations.length > 0
            ? employee.resignations[employee.resignations.length - 1]
            : null;

        // Find last PAID payroll (status = Completed)
        const lastPaidPayroll = await Payroll.findOne({
            employeeId: new Types.ObjectId(employeeId),
            status: 'Completed'
        }).sort({ year: -1, month: -1 });

        // Calculate metadata for filtering
        const today = new Date();
        const leavingDate = resignation?.approvedLastWorkingDay || today;
        const resignationDate = resignation?.submittedAt || today;

        // Find HOLD payrolls for this employee
        const holdPayrolls = await Payroll.find({
            employeeId: new Types.ObjectId(employeeId),
            status: 'Hold'
        }).sort({ year: 1, month: 1 });

        // ✅ FIX: Do NOT filter out the LWD month if it's in Hold.
        // User Requirement: "if hold month show hold month".
        // If the payroll for the LWD month was processed and put on Hold, we treat it as a Hold Payroll release.
        // calculateUnpaidGaps will skip months present in this list.
        const filteredHoldPayrolls = holdPayrolls;

        // Get leave summary for the year of leaving
        const leaveYear = leavingDate instanceof Date ? leavingDate.getFullYear() : new Date(leavingDate).getFullYear();
        const leaveSummary = await LeaveSummary.findOne({ userId: employeeId, year: leaveYear });

        // Calculate notice period
        const noticePeriodDays = employee.noticePeriod || 0;

        // 1 & 2. Calculate Notice Data (using helper)
        const { daysServed, excessInNotice, noticePeriodRecovery } = await calculateNoticeData(
            employeeId,
            resignationDate,
            leavingDate,
            noticePeriodDays,
            monthlyGross
        );

        // Prepare hold payrolls data
        const holdPayrollsData = filteredHoldPayrolls.map(p => ({
            payrollId: p._id!,
            month: p.month,
            year: p.year,
            monthYear: p.monthYear,
            netSalary: p.netSalary,
            monthlyGross: p.monthlyGross,
            totalDays: p.totalDaysInMonth || 0,
            daysWorked: p.payableDays ?? 0,
            presentDays: p.presentDays ?? 0,
            lopDays: p.LOPDays ?? 0,
            status: p.status
        }));

        const totalHoldAmount = filteredHoldPayrolls.reduce((sum, p) => sum + p.netSalary, 0);

        // Last paid month
        const lastPaidMonth = lastPaidPayroll
            ? `${new Date(lastPaidPayroll.year, lastPaidPayroll.month - 1).toLocaleString('default', { month: 'short' })} ${lastPaidPayroll.year}`
            : 'N/A';
        const lastPaidMonthDate = lastPaidPayroll
            ? new Date(lastPaidPayroll.year, lastPaidPayroll.month - 1, 1)
            : new Date();

        // ✅ Step 5: Leave Encashment on (Basic Salary Only)
        // One Day Basic = Basic Salary / Actual Days in Month
        const alBalance = leaveSummary?.annual?.remaining || 0;
        let encashPerDay = 0;

        // Get actual days in the relevant month (leaving month)
        const encashDate = leavingDate instanceof Date ? leavingDate : new Date(leavingDate);
        const daysInEncashMonth = new Date(encashDate.getFullYear(), encashDate.getMonth() + 1, 0).getDate();

        const structure = salaryAssignment?.salaryStructureId;
        if (structure) {
            const basicPerc = structure.fixedEarnings?.basicPercentage ?? 0;
            // Removed DA from calculation as per requirement
            const basic = monthlyGross * (basicPerc / 100);
            encashPerDay = basic / daysInEncashMonth;
        } else {
            // Fallback if no structure (should rarely happen)
            encashPerDay = monthlyGross / daysInEncashMonth;
        }

        // 🔍 DEBUG: Log leave encashment calculation
        console.log("=== INITIALIZE - LEAVE ENCASHMENT CALCULATION ===");
        console.log("Monthly Gross:", monthlyGross);
        console.log("Basic %:", structure?.fixedEarnings?.basicPercentage ?? 0);
        console.log("DA %:", Number(structure?.fixedEarnings?.daPercentage) || 0);
        console.log("Calculated Basic:", monthlyGross * ((structure?.fixedEarnings?.basicPercentage ?? 0) / 100));
        console.log("Calculated DA:", structure?.fixedEarnings?.daPercentage ? (monthlyGross * ((structure?.fixedEarnings?.basicPercentage ?? 0) / 100)) * ((Number(structure?.fixedEarnings?.daPercentage) || 0) / 100) : 0);
        console.log("Per Day Rate:", encashPerDay);
        console.log("Rounded Per Day Rate:", Math.round(encashPerDay));
        console.log("Leave Balance:", alBalance);
        console.log("Encash Amount:", Math.round(alBalance * encashPerDay));
        console.log("=================================================");

        const leaveBalance = [
            {
                leaveType: 'AL',
                balance: alBalance,
                encashDays: alBalance,
                perDayRate: Math.round(encashPerDay),
                encashAmount: Math.round(alBalance * encashPerDay)
            }
        ];

        let gratuityAmount = 0; // Disabled as per requirement

        // Calculate unpaid months using reused function
        const unpaidCalculation = await calculateUnpaidGaps(
            employeeId,
            leavingDate,
            monthlyGross,
            salaryAssignment,
            filteredHoldPayrolls // Use filtered (which is now ALL) list
        );

        const {
            unpaidMonths,
            totalUnpaidSalary,
            totalDaysWorked,
            totalProfessionalTax,
            totalProvidentFund,
            totalIncomeTax,
            totalESI,
            totalLOPAmount
        } = unpaidCalculation;

        // Auto-fill response
        const initialData = {
            mode: 'automatic',
            employeeId,
            employeeName: employee.name,
            employeeCode: employee.employeeCode,

            // Step 2: Resignation Details
            resignationSubmittedOn: resignationDate,
            leavingDate,
            leavingReason: resignation?.summary || 'RESIGNED',
            settlementDate: today,

            // Step 3: Notice Pay
            noticeRequired: noticePeriodDays > 0,
            noticePeriodDays: noticePeriodDays > 0 ? noticePeriodDays : 0,
            daysServed: noticePeriodDays > 0 ? daysServed : 0,
            excessInNotice: noticePeriodDays > 0 ? excessInNotice : 0,
            noticePeriodRecovery: Math.round(noticePeriodDays > 0 ? noticePeriodRecovery : 0),

            // Step 4: Work Days
            lastPaidMonth,
            lastPaidMonthDate,
            holdPayrolls: holdPayrollsData,
            totalHoldAmount: Math.round(totalHoldAmount),
            unpaidMonths,
            totalUnpaidSalary: Math.round(totalUnpaidSalary),
            totalDaysWorked,

            // Step 5: Leave Encashment
            leaveBalance,
            totalLeaveEncashment: Math.round(leaveBalance[0].encashAmount),

            // Step 6: Reimbursements
            reimbursements: [],
            totalReimbursements: 0,
            otherDeductions: [],
            totalOtherDeductions: 0,
            otherAdditions: [],
            totalOtherAdditions: 0,

            // Final Calculation (nested for backward compatibility)
            finalCalculation: {
                holdSalaries: Math.round(totalHoldAmount),
                unpaidSalaries: Math.round(totalUnpaidSalary),
                leaveEncashment: Math.round(leaveBalance[0].encashAmount),
                reimbursements: 0,
                otherAdditions: 0,
                gratuity: Math.round(gratuityAmount),
                totalPayable: Math.round(totalHoldAmount + totalUnpaidSalary + leaveBalance[0].encashAmount + gratuityAmount),
                noticePeriodRecovery: Math.round(noticePeriodRecovery),
                professionalTax: Math.round(totalProfessionalTax),
                incomeTax: Math.round(totalIncomeTax),
                providentFund: Math.round(totalProvidentFund),
                esi: Math.round(totalESI),
                lopAmount: Math.round(totalLOPAmount || 0), // ✅ Added LOP amount
                otherDeductions: 0,
                totalDeductions: Math.round(noticePeriodRecovery + totalProfessionalTax + totalIncomeTax + totalProvidentFund + totalESI + (totalLOPAmount || 0)),
                netAmount: Math.round((totalHoldAmount + totalUnpaidSalary + leaveBalance[0].encashAmount + gratuityAmount) - (noticePeriodRecovery + totalProfessionalTax + totalIncomeTax + totalProvidentFund + totalESI + (totalLOPAmount || 0))),
                isNegative: ((totalHoldAmount + totalUnpaidSalary + leaveBalance[0].encashAmount + gratuityAmount) - (noticePeriodRecovery + totalProfessionalTax + totalIncomeTax + totalProvidentFund + totalESI + (totalLOPAmount || 0))) < 0
            }
        };

        // ✅ FIX #2: Flatten response structure
        const flatResponse = {
            success: true,
            message: 'Final settlement data initialized',
            netAmount: initialData.finalCalculation.netAmount,
            isNegative: initialData.finalCalculation.isNegative,
            totalPayable: initialData.finalCalculation.totalPayable,
            totalDeductions: initialData.finalCalculation.totalDeductions,
            providentFund: initialData.finalCalculation.providentFund,
            esi: initialData.finalCalculation.esi,
            professionalTax: initialData.finalCalculation.professionalTax,
            incomeTax: initialData.finalCalculation.incomeTax,
            gratuity: initialData.finalCalculation.gratuity,
            lopAmount: initialData.finalCalculation.lopAmount, // ✅ Added for easy access
            ...initialData
        };

        return reply.send(flatResponse);

    } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
}

/**
 * Internal Helper: Reconciles flat API payload into nested Mongoose structure
 */
function packSettlement(settlement: any, data: any) {
    if (!data) return;

    // 1. Direct Root-Level Fields
    const rootFields = [
        'employeeId', 'employeeName', 'employeeCode',
        'resignationSubmittedOn', 'leavingDate', 'leavingReason', 'settlementDate',
        'lastPaidMonth', 'lastPaidMonthDate',
        'holdPayrolls', 'totalHoldAmount',
        'unpaidMonths', 'totalUnpaidSalary',
        'totalDaysWorked',
        'leaveBalance', 'totalLeaveEncashment',
        'reimbursements', 'totalReimbursements',
        'otherDeductions', 'totalOtherDeductions',
        'otherAdditions', 'totalOtherAdditions',
        'status', 'mode', 'pdfUrl', 'remarks',
        // ✅ Add missing notice fields
        'noticeRequired', 'daysServed', 'noticePeriodRecovery', 'excessInNotice', 'noticePeriodDays'
    ];

    // Date fields that must be sanitized — 'N/A' or empty strings cause Mongoose cast errors
    const dateFields = new Set(['lastPaidMonthDate', 'resignationSubmittedOn', 'leavingDate', 'settlementDate']);

    rootFields.forEach(field => {
        if (data[field] !== undefined) {
            // ✅ PREVENT CLEARING PDF URL: If settlement already has a PDF, 
            // don't let it be overwritten by an empty string or null during saves.
            if (field === 'pdfUrl' && settlement[field] && !data[field]) {
                return;
            }
            // ✅ SANITIZE DATE FIELDS: Reject 'N/A', empty strings, or unparseable values
            if (dateFields.has(field)) {
                const val = data[field];
                if (!val || val === 'N/A' || val === 'n/a' || isNaN(Date.parse(val))) {
                    settlement[field] = null;
                    return;
                }
            }
            settlement[field] = data[field];
        }
    });

    // 2. Map Flat Notice Fields (Direct to Root Level - Schema uses flat fields, not nested)
    if (data.noticeRequired !== undefined) settlement.noticeRequired = data.noticeRequired;
    if (data.noticePeriodDays !== undefined) settlement.noticePeriodDays = data.noticePeriodDays;
    if (data.daysServed !== undefined) settlement.daysServed = data.daysServed;
    if (data.excessInNotice !== undefined) settlement.excessInNotice = data.excessInNotice;
    if (data.noticePeriodRecovery !== undefined) settlement.noticePeriodRecovery = data.noticePeriodRecovery;

    // 3. Map Summary Fields to finalCalculation Object
    if (!settlement.finalCalculation) settlement.finalCalculation = {};
    const calc = settlement.finalCalculation;

    // Payable
    const hAmt = data.totalHoldAmount !== undefined ? data.totalHoldAmount : data.holdSalaries;
    if (hAmt !== undefined) calc.holdSalaries = Math.round(hAmt);

    const uSalary = data.totalUnpaidSalary !== undefined ? data.totalUnpaidSalary : data.unpaidSalaries;
    if (uSalary !== undefined) calc.unpaidSalaries = Math.round(uSalary);

    const leAmt = data.totalLeaveEncashment !== undefined ? data.totalLeaveEncashment : data.leaveEncashment;
    if (leAmt !== undefined) calc.leaveEncashment = Math.round(leAmt);

    const rAmt = data.totalReimbursements !== undefined ? data.totalReimbursements : data.reimbursements;
    if (rAmt !== undefined) calc.reimbursements = Math.round(rAmt);

    const aAmt = data.totalOtherAdditions !== undefined ? data.totalOtherAdditions : data.otherAdditions;
    if (aAmt !== undefined) calc.otherAdditions = Math.round(aAmt);

    if (data.gratuity !== undefined) calc.gratuity = Math.round(data.gratuity);
    if (data.totalPayable !== undefined) calc.totalPayable = Math.round(data.totalPayable);

    // Deductions
    if (data.noticePeriodRecovery !== undefined) calc.noticePeriodRecovery = Math.round(data.noticePeriodRecovery);
    if (data.professionalTax !== undefined) calc.professionalTax = Math.round(data.professionalTax);
    if (data.providentFund !== undefined) calc.providentFund = Math.round(data.providentFund);
    if (data.epfEmployer !== undefined) calc.epfEmployer = Math.round(data.epfEmployer);           // ✅ Added
    if (data.epfEmployerEps !== undefined) calc.epfEmployerEps = Math.round(data.epfEmployerEps); // ✅ Added
    if (data.epfEmployerEpf !== undefined) calc.epfEmployerEpf = Math.round(data.epfEmployerEpf); // ✅ Added
    if (data.esi !== undefined) calc.esi = Math.round(data.esi);
    if (data.incomeTax !== undefined) calc.incomeTax = Math.round(data.incomeTax);
    if (data.lopAmount !== undefined) calc.lopAmount = Math.round(data.lopAmount);

    const dAmt = data.totalOtherDeductions !== undefined ? data.totalOtherDeductions : data.otherDeductions;
    if (dAmt !== undefined) calc.otherDeductions = Math.round(dAmt);

    if (data.totalDeductions !== undefined) calc.totalDeductions = Math.round(data.totalDeductions);

    // Net
    if (data.netAmount !== undefined) calc.netAmount = Math.round(data.netAmount);
    if (data.isNegative !== undefined) calc.isNegative = data.isNegative;
}

/**
 * Save/Update Final Settlement (Draft)
 * POST /final-settlement/save
 */
export async function saveFinalSettlement(
    request: FastifyRequest<{
        Params: { employeeId: string },
        Body: Partial<IFinalSettlement>
    }>,
    reply: FastifyReply
) {
    try {
        const data = request.body as any;
        const { employeeId } = request.params;

        // Ensure employeeId is set
        const effectiveEmployeeId = employeeId || data.employeeId;
        if (!effectiveEmployeeId) {
            return reply.code(400).send({ success: false, error: 'Employee ID is required' });
        }
        const employeeIdStr = String(effectiveEmployeeId);
        const employeeIdObj = new Types.ObjectId(employeeIdStr);

        // 1. Check if a Draft already exists (priority)
        let settlement = await FinalSettlement.findOne({
            employeeId: employeeIdObj,
            status: "Draft",
        });

        // 2. If no Draft exists, check if a Confirmed one is already there
        // This prevents creating a second settlement record for the same employee
        if (!settlement) {
            const confirmedExisting = await FinalSettlement.findOne({
                employeeId: employeeIdObj,
                status: "Confirmed",
            });

            if (confirmedExisting) {
                return reply.code(400).send({
                    success: false,
                    error: "A confirmed settlement already exists for this employee. Please use the 'Unlock' feature to make any changes.",
                });
            }

            // 3. If no settlement (Draft or Confirmed) exists, create a new one
            settlement = new FinalSettlement({
                employeeId: employeeIdObj,
                status: "Draft",
                initiatedAt: new Date(),
                initiatedBy: data.initiatedBy || employeeIdObj,
            });
        }

        // 2. Perform Backend Recalculation (Security Check)
        // SECURITY FIX: Fetch hold payrolls from DB instead of trusting body
        // 2. Perform Backend Recalculation (Security Check)
        // SECURITY FIX: Fetch hold payrolls from DB instead of trusting body
        const holdPayrollIds = (data.holdPayrolls || []).map((p: any) => p.payrollId || p._id);
        const holdPayrolls = await Payroll.find({
            _id: { $in: holdPayrollIds },
            employeeId: employeeIdObj
        });

        // ✅ ACTUAL LEGAL: Fetch ALL Salary Assignments to handle historical hikes accurately
        const allSalaryAssignments: any[] = await SalaryAssignment.find({
            employeeId: employeeIdObj
        }).sort({ effectiveFrom: 1 }).populate('salaryStructureId').lean();

        const salaryAssignment: any = allSalaryAssignments.length ? allSalaryAssignments[allSalaryAssignments.length - 1] : null;
        const monthlyGross = salaryAssignment?.monthlyGross || 0;
        const structure = salaryAssignment?.salaryStructureId || {};

        const _latestSalaryAssignment = salaryAssignment;

        const getAssignmentForMonth = (m: number, y: number) => {
            const fD = new Date(y, m - 1, 1);
            const lD = new Date(y, m, 0);
            return allSalaryAssignments.find(a =>
                new Date(a.effectiveFrom) <= lD &&
                new Date(a.effectiveTo) >= fD
            ) || _latestSalaryAssignment;
        };

        const employee = await User.findById(employeeIdObj);


        const leavingDate = data.leavingDate || data.resignationDetails?.lwd;

        let unpaidMonths: any[] = [];
        let totalUnpaid = 0;
        let pt = 0;
        let pf = 0;
        let it = 0;
        let esi = 0;
        let totalEpfEmployer = 0;     // ✅ Added
        let totalEpfEmployerEps = 0;  // ✅ Added
        let totalEpfEmployerEpf = 0;  // ✅ Added
        let totalLOPAmount = 0;

        // ✅ RECALCULATION STRATEGY:
        // If mode is 'automatic' (or default), we MUST regenerate the Unpaid Gaps based on the
        // potentially updated Leaving Date. Trusting 'data.unpaidMonths' is risky because
        // it might contain stale days/weekend counts if the user changed the date in Step 2.
        if (data.mode !== 'manual' && leavingDate) {
            const gapCalc = await calculateUnpaidGaps(
                effectiveEmployeeId.toString(),
                new Date(leavingDate),
                monthlyGross,
                salaryAssignment,
                holdPayrolls
            );

            unpaidMonths = gapCalc.unpaidMonths;
            totalUnpaid = gapCalc.totalUnpaidSalary;
            pt = gapCalc.totalProfessionalTax;
            pf = gapCalc.totalProvidentFund;
            esi = gapCalc.totalESI;
            it = gapCalc.totalIncomeTax;
            totalLOPAmount = gapCalc.totalLOPAmount;
            totalEpfEmployer = gapCalc.totalEpfEmployer || 0;
            totalEpfEmployerEps = gapCalc.totalEpfEmployerEps || 0;
            totalEpfEmployerEpf = gapCalc.totalEpfEmployerEpf || 0;

        } else {
            // Manual Mode: Trust the input array (Legacy fallback)
            unpaidMonths = data.unpaidMonths || [];

            // Recalculation Helpers (Same as Calculate route)
            const calculatePT = (gross: number, m: number) => {
                const ptConfig = structure?.statutoryDeductions?.professionalTax;
                if (!ptConfig?.slabs?.length) return 0;
                const applicableMonths: Record<string, number[]> = {
                    half_yearly: [2, 8],
                    monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
                };
                if (!applicableMonths[ptConfig.term]?.includes(m)) return 0;
                for (const slab of ptConfig.slabs) {
                    if (gross >= slab.fromAmount && (!slab.toAmount || gross <= slab.toAmount)) return Number(slab.taxAmount) || 0;
                }
                return 0;
            };

            const calculatePF = (basic: number, da: number) => {
                const epf = structure?.statutoryDeductions?.epf;
                const employerSplit = structure?.statutoryDeductions?.employerSplit;
                
                if (!epf) return { epfEmployee: 0, epfEmployer: 0, epfEmployerEps: 0, epfEmployerEpf: 0 };

                const wage = basic + da;
                const empRate = (epf.employeeContribution || 12) / 100;
                const employerRate = (epf.employerContribution || 13) / 100;
                const epsPercentage = (employerSplit?.epsPercentage ?? 8.33) / 100;
                const epsWageCap = employerSplit?.epsWageCap ?? 15000;
                
                const limit = epf.maxLimit ?? 15000;

                const isCapped = wage >= limit;
                const finalEpfEmployee = Math.round(isCapped ? (limit * empRate) : (wage * empRate));
                const finalEpfEmployer = Math.round(isCapped ? (limit * employerRate) : (wage * employerRate));

                const currentWageForEps = Math.min(wage, epsWageCap);
                const finalEpfEmployerEps = Math.round(epsPercentage * currentWageForEps);
                const finalEpfEmployerEpf = Math.max(0, finalEpfEmployer - finalEpfEmployerEps);

                return {
                    epfEmployee: finalEpfEmployee,
                    epfEmployer: finalEpfEmployer,
                    epfEmployerEps: finalEpfEmployerEps,
                    epfEmployerEpf: finalEpfEmployerEpf
                };
            };

            const calculateESI = () => 0;

            for (const m of unpaidMonths) {
                const daysInMonth = m.totalDays || 30;
                const payableDays = m.daysWorked || 0;

                if (daysInMonth > 0) {
                    // ✅ ACTUAL LEGAL: Fetch correct assignment for THIS specific month in loop
                    const mAssignment = getAssignmentForMonth(m.month, m.year);
                    const mGross = mAssignment?.monthlyGross || monthlyGross;
                    const mStructure = mAssignment?.salaryStructureId || structure;

                    const bP = (mStructure.fixedEarnings?.basicPercentage ?? 0) / 100;
                    const dP = (mStructure.fixedEarnings?.daPercentage ?? 0) / 100;
                    const hP = (mStructure.fixedEarnings?.hraPercentage ?? 0) / 100;
                    const tP = (mStructure.fixedEarnings?.travelAllowancePercentage ?? 0) / 100;
                    const oP = (mStructure.fixedEarnings?.otherAllowancePercentage ?? 0) / 100;

                    const fullB = mGross * bP;
                    const fullD = fullB * dP;
                    const fullH = mGross * hP;
                    const fullT = mGross * tP;
                    const fullOtherAllowances = mGross * oP;

                    const pb = (fullB / daysInMonth) * payableDays;
                    const pd = (fullD / daysInMonth) * payableDays;
                    const ph = (fullH / daysInMonth) * payableDays;
                    const ptAllo = (fullT / daysInMonth) * payableDays;
                    const proratedOtherAllowances = (fullOtherAllowances / daysInMonth) * payableDays;

                    const pg = (mGross / daysInMonth) * payableDays;
                    const targetGross = Math.round(pg);
                    const roundedBasic = Math.round(pb + pd);
                    const roundedHRA = Math.round(ph);
                    const roundedConveyance = Math.round(ptAllo);
                    const roundedOtherAllowances = Math.round(proratedOtherAllowances);

                    // Re-calculate balancing allowance to ensure sum of components exactly matches targetGross.
                    const roundedSpecialAllowance = targetGross - (roundedBasic + roundedHRA + roundedConveyance + roundedOtherAllowances);

                    m.components = {
                        basic: roundedBasic,
                        hra: roundedHRA,
                        conveyance: roundedConveyance,
                        specialAllowance: roundedSpecialAllowance,
                        otherAllowances: roundedOtherAllowances,
                        gross: targetGross
                    };

                    m.salary = targetGross;

                    // ✅ PT Calculation Logic (Updated to Aggregate Cycle Logic for Manual Mode)
                    const lDate = leavingDate ? new Date(leavingDate) : new Date();
                    const isLeavingMonth = m.year === lDate.getFullYear() && m.month === (lDate.getMonth() + 1);
                    const lwMonth = lDate.getMonth() + 1;
                    const lwYear = lDate.getFullYear();
                    const isH1_m = lwMonth >= 4 && lwMonth <= 9;
                    const cycleStartYear_m = isH1_m ? lwYear : (lwMonth >= 10 ? lwYear : lwYear - 1);

                    let ptAmount = 0;
                    const ptConfig = structure?.statutoryDeductions?.professionalTax;
                    const ptTerm = ptConfig?.term || 'half_yearly';

                    if (ptTerm === 'half_yearly') {
                        if (isLeavingMonth) {
                            // Simplified lookup for manual mode with Cycle Awareness
                            const allCompleted = await Payroll.find({
                                employeeId: employeeIdObj,
                                status: 'Completed',
                                type: { $ne: 'FinalSettlement' }
                            }).lean();
                            const payrollMap_m = new Map(allCompleted.map(p => [`${p.year}-${p.month}`, p]));

                            let prevGross = 0;
                            let prevPT = 0;

                            const cycleStartDate = isH1_m ? new Date(cycleStartYear_m, 3, 1) : new Date(cycleStartYear_m, 9, 1);
                            const thisMonthStart = new Date(m.year, m.month - 1, 1);
                            let iterDate = new Date(cycleStartDate);

                            while (iterDate < thisMonthStart) {
                                const iM = iterDate.getMonth() + 1;
                                const iY = iterDate.getFullYear();
                                const key = `${iY}-${iM}`;
                                const existing = payrollMap_m.get(key);
                                if (existing) {
                                    prevGross += (Number(existing.attendanceAdjustGross) || Number((existing as any).attendanceAdjustedGross) || Number(existing.monthlyGross) || 0);
                                    prevPT += (Number(existing.professionalTax) || 0);
                                } else {
                                    // Missing records: Use assumption if active
                                    const monthCycleAssignment = getAssignmentForMonth(iM, iY);
                                    const monthCycleGross = monthCycleAssignment?.monthlyGross || monthlyGross;

                                    const jDate = employee?.joiningDate ? new Date(employee.joiningDate) : null;
                                    if (jDate && iterDate >= new Date(jDate.getFullYear(), jDate.getMonth(), 1)) {
                                        prevGross += monthCycleGross;
                                    }
                                }
                                iterDate.setMonth(iterDate.getMonth() + 1);
                            }

                            // totalUnpaid includes all gaps before this month
                            // plus current month gross (pg)
                            const totalCycleGross = prevGross + totalUnpaid + pg;
                            const representativeMonth = isH1_m ? 8 : 2;
                            const totalDue = Math.round(calculatePT(totalCycleGross, representativeMonth));
                            ptAmount = Math.max(0, totalDue - prevPT);
                        } else {
                            ptAmount = 0;
                        }
                    } else {
                        ptAmount = Math.round(calculatePT(mGross, m.month));
                    }

                    m.professionalTax = ptAmount;
                    const pfResult = calculatePF(pb, pd);
                    m.providentFund = pfResult.epfEmployee;
                    m.epfEmployer = pfResult.epfEmployer;        // ✅ Added
                    m.epfEmployerEps = pfResult.epfEmployerEps;  // ✅ Added
                    m.epfEmployerEpf = pfResult.epfEmployerEpf;  // ✅ Added
                    m.esi = Math.round(calculateESI());

                    totalUnpaid += m.salary;

                    // Sum totals
                    pt += m.professionalTax;
                    pf += m.providentFund;
                    totalEpfEmployer += (m.epfEmployer || 0);        // ✅ Added
                    totalEpfEmployerEps += (m.epfEmployerEps || 0);  // ✅ Added
                    totalEpfEmployerEpf += (m.epfEmployerEpf || 0);  // ✅ Added
                    esi += m.esi;
                    it += (m.incomeTax || 0);
                    totalLOPAmount += (m.lopAmount || 0);
                }
            }
        }


        let gratuity = 0;

        // Recalculate Leave Encashment
        let totalLeaveAmt = 0;
        if (data.leaveBalance) {
            // SECURITY FIX: Calculate rate from structure (Basic + DA) / 30
            // SECURITY FIX: Calculate rate from structure (Basic Only) / DaysInMonth
            let safePerDayRate = 0;
            const basicPerc = structure.fixedEarnings?.basicPercentage ?? 0;

            // Re-calculate days in month for consistency
            const encashDate = leavingDate ? new Date(leavingDate) : new Date();
            const daysInEncashMonth = new Date(encashDate.getFullYear(), encashDate.getMonth() + 1, 0).getDate();

            if (basicPerc > 0) {
                const basic = monthlyGross * (basicPerc / 100);
                safePerDayRate = basic / daysInEncashMonth;
            } else {
                safePerDayRate = monthlyGross / daysInEncashMonth;
            }



            for (const l of data.leaveBalance) {
                // Force backend rate
                l.perDayRate = Math.round(safePerDayRate);
                l.encashAmount = Math.round((Number(l.encashDays) || 0) * safePerDayRate);
                totalLeaveAmt += l.encashAmount;
            }
        }

        // Aggregate Totals
        const holdSalaries = holdPayrolls.reduce((sum: number, p: any) => sum + (p.netSalary || 0), 0) || 0;
        const totalReimbursements = data.reimbursements?.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0) || 0;
        const totalAdditions = data.otherAdditions?.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0) || 0;
        const totalDeductions = data.otherDeductions?.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0) || 0;



        // Notice Recovery
        let noticeRecovery = data.noticePay?.noticePeriodRecovery ?? data.noticePeriodRecovery;

        // ✅ FIX: Use precise day-by-day calculation helper
        if (data.noticeRequired === false) {
            noticeRecovery = 0;
        } else {
            // Recalculate if:
            // 1. Not provided
            // 2. Is 0 but shortfall exists
            // 3. Mode is AUTOMATIC (Force refresh to ensure backend calculated value)
            const isAutomatic = data.mode !== 'manual';
            const shouldRecalculate = isAutomatic || noticeRecovery === undefined || (noticeRecovery === 0 && (data.excessInNotice || 0) < 0);

            if (shouldRecalculate) {
                // Determine notice days - check root, then nested, then fallback to employee default
                let noticeDays = data.noticePeriodDays;
                if (noticeDays === undefined && (data as any).noticePay?.noticePeriodDays !== undefined) {
                    noticeDays = (data as any).noticePay.noticePeriodDays;
                }

                // If notice days still unknown, try to use existing settlement or employee default
                if (noticeDays === undefined) {
                    // This creates a circular dependency if we strictly rely on input. 
                    // But typically save is called with full state. 
                    // Fallback to simplistic if we really can't find notice days? 
                    // No, try to use initialized default from prior fetch.
                    // For now, assume 0 if missing to avoid blocking save.
                    noticeDays = 0;
                }

                if (leavingDate && data.resignationSubmittedOn && monthlyGross > 0) {
                    // Re-use the helper for consistency with initialize
                    const noticeData = await calculateNoticeData(
                        effectiveEmployeeId.toString(),
                        new Date(data.resignationSubmittedOn),
                        new Date(leavingDate),
                        Number(noticeDays),
                        monthlyGross
                    );

                    // Only override if we really needed to recalculate
                    if (noticeData.excessInNotice < 0) {
                        noticeRecovery = Math.round(noticeData.noticePeriodRecovery);
                    }
                } else if ((data.excessInNotice || 0) < 0) {
                    // Fallback to simplistic if dates are missing but shortfall exists (Legacy fallback)
                    noticeRecovery = Math.round(Math.abs(data.excessInNotice || 0) * monthlyGross / 30);
                }
            }
        }

        const totalPayable = Math.round(holdSalaries + totalUnpaid + totalLeaveAmt + totalReimbursements + totalAdditions + gratuity);
        // ✅ Include LOP Amount in Total Deductions
        const allDeductions = Math.round((noticeRecovery || 0) + totalDeductions + pt + pf + esi + it + totalLOPAmount);
        const netAmount = totalPayable - allDeductions;


        // Sanitize Notice Period Data if Notice is NOT Required
        if (data.noticeRequired === false) {
            data.daysServed = 0;
            data.noticePeriodDays = 0;
            data.excessInNotice = 0;
            data.noticePeriodRecovery = 0;
            if (data.finalCalculation) {
                data.finalCalculation.noticePeriodRecovery = 0;
            }

            // Explicitly set on settlement too, to be safe
            settlement.noticeRequired = false;
            settlement.daysServed = 0;
            settlement.noticePeriodDays = 0;
            settlement.excessInNotice = 0;
            settlement.noticePeriodRecovery = 0;
        } else {
            if (data.daysServed !== undefined) settlement.daysServed = data.daysServed;
            if (data.noticeRequired !== undefined) settlement.noticeRequired = data.noticeRequired;
            if (data.noticePeriodDays !== undefined) settlement.noticePeriodDays = data.noticePeriodDays;
            if (data.excessInNotice !== undefined) settlement.excessInNotice = data.excessInNotice;
        }

        // Ensure notice recovery matches calculation or override
        if (data.finalCalculation?.noticePeriodRecovery !== undefined) {
            settlement.noticePeriodRecovery = data.finalCalculation.noticePeriodRecovery;
        } else if (data.noticePeriodRecovery !== undefined) {
            settlement.noticePeriodRecovery = data.noticePeriodRecovery;
        }

        // 3. Pack recalculated and original data into Mongoose structure
        // packSettlement helper now includes these fields in whitelist
        const enrichedData = {
            ...data,
            unpaidMonths,
            totalHoldAmount: holdSalaries,
            totalUnpaidSalary: totalUnpaid,
            totalLeaveEncashment: totalLeaveAmt,
            totalReimbursements: totalReimbursements,
            totalOtherAdditions: totalAdditions, // Maps to data.totalOtherAdditions in packSettlement
            totalOtherDeductions: totalDeductions,
            professionalTax: pt,
            providentFund: pf,
            epfEmployer: totalEpfEmployer,           // ✅ Added
            epfEmployerEps: totalEpfEmployerEps,     // ✅ Added
            epfEmployerEpf: totalEpfEmployerEpf,     // ✅ Added
            esi: esi,
            incomeTax: it,
            gratuity: gratuity,
            lopAmount: totalLOPAmount, // ✅ Added LOP amount
            noticePeriodRecovery: noticeRecovery,
            totalPayable,
            totalDeductions: allDeductions,
            netAmount,
            isNegative: netAmount < 0
        };

        packSettlement(settlement, enrichedData);

        await settlement.save();

        return reply.send({
            success: true,
            message: 'Final settlement saved as draft',

            // Root-level summary fields (for UI wizard consistency)
            netAmount: enrichedData.netAmount,
            isNegative: enrichedData.isNegative,
            totalPayable: enrichedData.totalPayable,
            totalDeductions: enrichedData.totalDeductions,

            // Root-level tax/summary
            providentFund: pf,
            epfEmployer: totalEpfEmployer,           // ✅ Added
            epfEmployerEps: totalEpfEmployerEps,     // ✅ Added
            epfEmployerEpf: totalEpfEmployerEpf,     // ✅ Added
            esi: esi,
            professionalTax: pt,
            incomeTax: it,
            gratuity: gratuity,
            lopAmount: totalLOPAmount, // ✅ Added for consistency

            // Full document
            data: settlement
        });

    } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Internal server error', details: error.message });
    }
}

/**
 * Unlock (Re-open) Confirmed Final Settlement
 * POST /final-settlement/unlock/:employeeId
 */
export async function unlockFinalSettlement(
    request: FastifyRequest<{ Params: { employeeId: string }, Body: { unlockedBy: string } }>,
    reply: FastifyReply
) {
    try {
        const { employeeId } = request.params;
        const { unlockedBy } = request.body;

        if (!Types.ObjectId.isValid(employeeId)) {
            return reply.code(400).send({ success: false, error: 'Invalid employee ID' });
        }

        const settlement = await FinalSettlement.findOne({
            employeeId: new Types.ObjectId(employeeId),
            status: 'Confirmed'
        });

        if (!settlement) {
            return reply.code(404).send({ success: false, error: 'Confirmed settlement not found' });
        }

        // ✅ REFINED SAFETY CHECK: Check if ANY payroll (Regular or F&F) for the UNPAID MONTHS 
        // involved in this settlement has already been marked as 'Completed'.
        // Hold payrolls are excluded from this lock check.
        const involvedMonths = (settlement.unpaidMonths || []).map((m: any) => m.monthYear);

        const completedPayslips = await Payroll.findOne({
            employeeId: new Types.ObjectId(employeeId),
            monthYear: { $in: involvedMonths },
            status: 'Completed'
        });

        if (completedPayslips) {
            return reply.code(400).send({
                success: false,
                error: `Cannot edit: Payroll for ${completedPayslips.monthYear} is already "Completed" (Paid).`
            });
        }

        // ✅ CLEANUP: Delete the auto-generated F&F Draft payslips that were created during confirmation.
        // This prevents double-counting of income when recalculating during the edit flow.
        await Payroll.deleteMany({
            employeeId: new Types.ObjectId(employeeId),
            monthYear: { $in: involvedMonths },
            isFinalSettlement: true,
            type: 'FinalSettlement',
            status: 'Draft'
        });

        settlement.status = 'Draft';
        settlement.lastEditedAt = new Date();
        settlement.lastEditedBy = new Types.ObjectId(unlockedBy);

        await settlement.save();

        return reply.send({
            success: true,
            message: 'Settlement unlocked and returned to Draft status',
            data: settlement
        });

    } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Internal server error', details: error.message });
    }
}

/**
 * Download Settlement File via Backend (GCP Streaming)
 * GET /final-settlement/download-file?filePath=<encoded-path>
 *
 * Streams the file from GCP with Content-Disposition: attachment so
 * the browser always downloads it rather than opening in a tab.
 */
export async function downloadSettlementFile(
    request: FastifyRequest<{ Querystring: { filePath: string } }>,
    reply: FastifyReply
) {
    try {
        const { filePath } = request.query;

        if (!filePath) {
            return reply.code(400).send({ success: false, error: 'filePath query parameter is required' });
        }

        const bucketName = process.env.GCP_STORAGE_BUCKET;
        if (!bucketName) {
            return reply.code(500).send({ success: false, error: 'GCP bucket not configured' });
        }

        // Build GCP Storage client using same env-based credentials as gcpStorage utility
        const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
        const clientEmail = process.env.GCP_CLIENT_EMAIL;
        const privateKey = process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const projectId = process.env.PROJECT_ID;

        let storageClient: Storage;
        if (serviceAccountJson) {
            const creds = JSON.parse(serviceAccountJson);
            storageClient = new Storage({ projectId, credentials: { client_email: creds.client_email, private_key: creds.private_key } });
        } else if (clientEmail && privateKey) {
            storageClient = new Storage({ projectId, credentials: { client_email: clientEmail, private_key: privateKey } });
        } else {
            storageClient = new Storage({ projectId });
        }

        const bucket = storageClient.bucket(bucketName);
        const file = bucket.file(filePath);

        // Check file exists before streaming
        const [exists] = await file.exists();
        if (!exists) {
            return reply.code(404).send({ success: false, error: 'File not found in storage' });
        }

        // Get file metadata to set correct content type
        const [metadata] = await file.getMetadata();
        const contentType = (metadata as any).contentType || 'application/octet-stream';
        const fileName = path.basename(filePath);

        // Set headers for forced download
        reply.header('Content-Type', contentType);
        reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
        reply.header('Cache-Control', 'no-store');

        // Stream directly from GCP — no buffering in memory
        const readStream = file.createReadStream();
        return reply.send(readStream);

    } catch (error: any) {
        request.log.error(error, 'GCP File Download Error');
        return reply.code(500).send({ success: false, error: 'Failed to download file', details: error.message });
    }
}

/**
 * Get All Final Settlements (List with Pagination)
 * GET /final-settlement?page=1&limit=10&status=Draft&search=query
 */
export async function getAllFinalSettlements(
    request: FastifyRequest<{
        Querystring: {
            page?: number;
            limit?: number;
            status?: 'Draft' | 'Confirmed';
            search?: string;
        };
    }>,
    reply: FastifyReply
) {
    try {
        const rawPage = request.query.page ?? 1;
        const rawLimit = request.query.limit ?? 10;
        const page = Math.max(1, Number(rawPage) || 1);
        const limit = Math.min(100, Math.max(1, Number(rawLimit) || 10));
        const status = request.query.status;
        const search = request.query.search?.trim();

        // Calculate skip for pagination
        const skip = (page - 1) * limit;

        // Define matching criteria (e.g. status)
        const matchStage: any = {};
        if (status === "Draft" || status === "Confirmed") {
            matchStage.status = status;
        }

        // Unified Aggregation Pipeline for Listing & Searching
        // This ensures deduplication while maintaining search capabilities
        const deduplicatePipeline: any[] = [
            { $match: matchStage },
            // 1. Initial sort to ensure $group picks the newest record correctly
            { $sort: { createdAt: -1 } },
            // 2. Group by employee to ensure uniqueness
            {
                $group: {
                    _id: "$employeeId",
                    doc: { $first: "$$ROOT" },
                },
            },
            { $replaceRoot: { newRoot: "$doc" } },
        ];

        // 3. Add Search Stage if applicable
        if (search) {
            deduplicatePipeline.push({
                $lookup: {
                    from: "users",
                    localField: "employeeId",
                    foreignField: "_id",
                    as: "employeeDetails",
                },
            });
            deduplicatePipeline.push({ $unwind: "$employeeDetails" });
            deduplicatePipeline.push({
                $match: {
                    $or: [
                        { employeeName: { $regex: search, $options: "i" } },
                        { employeeCode: { $regex: search, $options: "i" } },
                        { status: { $regex: search, $options: "i" } },
                        { "employeeDetails.name": { $regex: search, $options: "i" } },
                        { "employeeDetails.email": { $regex: search, $options: "i" } },
                        { "employeeDetails.employeeCode": { $regex: search, $options: "i" } },
                    ],
                },
            });
        } else {
            // Standard population for normal list
            deduplicatePipeline.push({
                $lookup: {
                    from: "users",
                    localField: "employeeId",
                    foreignField: "_id",
                    as: "employeeDetails",
                },
            });
            deduplicatePipeline.push({
                $unwind: { path: "$employeeDetails", preserveNullAndEmptyArrays: true },
            });
        }

        // 4. Final sorting and pagination
        deduplicatePipeline.push({ $sort: { createdAt: -1 } });
        deduplicatePipeline.push({
            $facet: {
                metadata: [{ $count: "total" }],
                data: [{ $skip: skip }, { $limit: limit }],
            },
        });

        // 5. Execute Pipeline
        const result = await FinalSettlement.aggregate(deduplicatePipeline);
        const settlementsRaw = result[0]?.data || [];
        const total = result[0]?.metadata[0]?.total || 0;

        // 6. Final mapping and populate mimics
        const settlements = await Promise.all(
            settlementsRaw.map(async (s: any) => {
                const mapped = {
                    ...s,
                    employeeId: s.employeeDetails || s.employeeId,
                    employeeName: s.employeeName || s.employeeDetails?.name,
                    employeeCode: s.employeeCode || s.employeeDetails?.employeeCode,
                };
                delete mapped.employeeDetails;

                // CHECK: If any unpaid gap month is already 'Completed' in main payroll
                const involvedMonths = (s.unpaidMonths || []).map((m: any) => m.monthYear);
                const completedPayslip = await Payroll.findOne({
                    employeeId: mapped.employeeId?._id || mapped.employeeId,
                    monthYear: { $in: involvedMonths },
                    status: "Completed",
                });
                mapped.canEdit = !completedPayslip;

                return mapped;
            }),
        );

        return reply.send({
            success: true,
            data: settlements,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });


    } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
}

/**
 * Get Final Settlement
 * GET /final-settlement/:employeeId
 */
export async function getFinalSettlement(
    request: FastifyRequest<{ Params: { employeeId: string } }>,
    reply: FastifyReply
) {
    try {
        const { employeeId } = request.params;

        if (!Types.ObjectId.isValid(employeeId)) {
            return reply.code(400).send({ success: false, error: 'Invalid employee ID' });
        }

        const settlement = await FinalSettlement.findOne({
            employeeId: new Types.ObjectId(employeeId)
        })
            .populate('lastEditedBy', 'name')
            .populate('initiatedBy', 'name')
            .sort({ createdAt: -1 });

        if (!settlement) {
            return reply.code(404).send({
                success: false,
                error: 'No final settlement found for this employee'
            });
        }

        // ✅ REFINED CHECK: Check if ANY payroll (Regular or F&F) for the UNPAID MONTHS 
        // involved in this settlement has already been marked as 'Completed'.
        // Hold payrolls are excluded from this lock check.
        const involvedMonths = (settlement.unpaidMonths || []).map((m: any) => m.monthYear);

        const completedPayslips = await Payroll.findOne({
            employeeId: new Types.ObjectId(employeeId),
            monthYear: { $in: involvedMonths },
            status: 'Completed'
        });

        // ✅ FIX #2: Return flattened response for GET endpoint
        return reply.send({
            success: true,
            canEdit: !completedPayslips, // Indicate if it can be unlocked/edited

            // Root-level fields
            pdfUrl: settlement.pdfUrl,
            netAmount: settlement.finalCalculation?.netAmount || 0,
            isNegative: settlement.finalCalculation?.isNegative || false,
            totalPayable: settlement.finalCalculation?.totalPayable || 0,
            totalDeductions: settlement.finalCalculation?.totalDeductions || 0,
            providentFund: settlement.finalCalculation?.providentFund || 0,
            esi: settlement.finalCalculation?.esi || 0,
            professionalTax: settlement.finalCalculation?.professionalTax || 0,
            incomeTax: settlement.finalCalculation?.incomeTax || 0,
            gratuity: settlement.finalCalculation?.gratuity || 0,

            // Full settlement data
            data: settlement
        });

    } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
}

/**
 * Confirm Final Settlement
 * POST /final-settlement/confirm/:employeeId
 */
export async function confirmFinalSettlement(
    request: FastifyRequest<{
        Params: { employeeId: string };
        Body: Partial<IFinalSettlement> & { confirmedBy: string };
    }>,
    reply: FastifyReply
) {
    const { employeeId } = request.params;
    const bodyData = request.body;
    const { confirmedBy } = bodyData;

    if (!confirmedBy) {
        return reply.code(400).send({ success: false, error: 'Confirmed by ID is required' });
    }

    try {
        // --- PHASE 1: Pre-Transaction Validation & PDF Generation ---

        // 1.1 Fetch current draft (without lock first to generate PDF)
        const draft = await FinalSettlement.findOne({
            employeeId: new Types.ObjectId(employeeId),
            status: 'Draft'
        });

        if (!draft) {
            const alreadyConfirmed = await FinalSettlement.findOne({
                employeeId: new Types.ObjectId(employeeId),
                status: 'Confirmed'
            });
            return reply.code(alreadyConfirmed ? 400 : 404).send({
                success: false,
                error: alreadyConfirmed ? 'Settlement already confirmed' : 'No draft settlement found'
            });
        }

        const employee = await User.findById(employeeId);
        if (!employee) {
            return reply.code(404).send({ success: false, error: 'Employee not found' });
        }

        // 1.2 Generate PDF (Outside transaction to prevent timeouts)
        // Note: settlement data might change if another admin confirms, 
        // but we verify status again inside the transaction.
        let pdfUrl = '';
        try {
            // ✅ FIX: Merge body data into draft for PDF generation (so PDF has latest values)
            const pdfData = {
                ...draft.toObject(),
                ...(bodyData.daysServed !== undefined && { daysServed: bodyData.daysServed }),
                ...(bodyData.noticeRequired !== undefined && { noticeRequired: bodyData.noticeRequired }),
                ...(bodyData.noticePeriodDays !== undefined && { noticePeriodDays: bodyData.noticePeriodDays }),
                ...(bodyData.excessInNotice !== undefined && { excessInNotice: bodyData.excessInNotice }),
                ...(bodyData.noticePeriodRecovery !== undefined && { noticePeriodRecovery: bodyData.noticePeriodRecovery }),
                // ✅ FIX: Also merge complex arrays if provided, as PDF helper recalculates summaries from them
                ...(bodyData.unpaidMonths && { unpaidMonths: bodyData.unpaidMonths }),
                ...(bodyData.holdPayrolls && { holdPayrolls: bodyData.holdPayrolls }),
                ...(bodyData.leaveBalance && { leaveBalance: bodyData.leaveBalance }),
                // Ensure finalCalculation is updated if provided
                ...(bodyData.finalCalculation && { finalCalculation: { ...draft.finalCalculation, ...bodyData.finalCalculation } })
            };

            pdfUrl = await generateFNFLetter(pdfData, employee);
            if (!pdfUrl || !pdfUrl.startsWith('http')) throw new Error('Invalid PDF URL generated');
        } catch (pdfErr: any) {
            request.log.error(pdfErr, 'FNF PDF generation failed');
            return reply.code(500).send({ success: false, error: `PDF generation failed: ${pdfErr.message || pdfErr}` });
        }

        // ✅ START TRANSACTION: To ensure atomicity of data creation
        const session = await FinalSettlement.db.startSession();
        try {
            session.startTransaction();

            // ✅ CLEANUP: Delete any previously generated FNF payslips for this employee
            // This ensures editing the settlement doesn't result in duplicate payroll records
            await Payroll.deleteMany({
                employeeId: new Types.ObjectId(employeeId),
                isFinalSettlement: true,
                type: 'FinalSettlement'
            }).session(session);

            // Fetch Employee and Salary details for metadata
            const employee: any = await User.findById(employeeId).session(session);
            // 2.1 Re-fetch AND LOCK the draft inside transaction
            const settlement = await FinalSettlement.findOne({
                _id: draft._id,
                status: 'Draft'
            }).session(session);

            if (!settlement) {
                await session.abortTransaction();
                return reply.code(400).send({ success: false, error: 'Settlement status changed during PDF generation. Please retry.' });
            }

            // Check if this settlement was already confirmed before (for audit tracking)
            const wasAlreadyConfirmed = !!settlement.confirmedAt;

            // 2.2 Update settlement data
            // SECURITY FIX: Fetch hold payrolls from DB (Mirroring save/calculate)
            if (bodyData.holdPayrolls && bodyData.holdPayrolls.length > 0) {
                const holdPayrollIds = bodyData.holdPayrolls.map((p: any) => p.payrollId || p._id);
                const holdPayrollsDb = await Payroll.find({
                    _id: { $in: holdPayrollIds },
                    employeeId: new Types.ObjectId(employeeId)
                }).session(session);

                // Replace body data with DB data
                bodyData.holdPayrolls = holdPayrollsDb.map(p => ({
                    payrollId: p._id,
                    month: p.month,
                    year: p.year,
                    monthYear: p.monthYear,
                    netSalary: p.netSalary, // AUTHENTIC SOURCE
                    monthlyGross: p.monthlyGross,
                    totalDays: p.totalDaysInMonth,
                    daysWorked: p.payableDays,
                    presentDays: p.presentDays,
                    lopDays: p.LOPDays,
                    status: p.status
                }));
                // Recalculate Hold Total
                bodyData.totalHoldAmount = holdPayrollsDb.reduce((sum, p) => sum + p.netSalary, 0);
            }

            // SECURITY FIX: Enforce Safe Leave Rate
            if (bodyData.leaveBalance) {
                const salaryAssignment: any = await SalaryAssignment.findOne({
                    employeeId: new Types.ObjectId(employeeId)
                }).sort({ effectiveFrom: -1 }).populate('salaryStructureId').session(session);

                const monthlyGross = salaryAssignment?.monthlyGross || 0;
                const structure = salaryAssignment?.salaryStructureId || {};

                let safePerDayRate = 0;
                const basicPerc = structure.fixedEarnings?.basicPercentage ?? 0;

                // Re-calculate days in month for consistency (Confirm Step)
                const encashDate = settlement.leavingDate || new Date();
                const daysInEncashMonth = new Date(encashDate.getFullYear(), encashDate.getMonth() + 1, 0).getDate();

                if (basicPerc > 0) {
                    const basic = monthlyGross * (basicPerc / 100);
                    safePerDayRate = basic / daysInEncashMonth;
                } else {
                    safePerDayRate = monthlyGross / daysInEncashMonth;
                }

                bodyData.leaveBalance.forEach((l: any) => {
                    l.perDayRate = Math.round(safePerDayRate);
                    l.encashAmount = Math.round((Number(l.encashDays) || 0) * safePerDayRate);
                });

                bodyData.totalLeaveEncashment = bodyData.leaveBalance.reduce((sum: number, l: any) => sum + l.encashAmount, 0);
            }


            // ✅ FIX: Explicitly save Notice Period Metadata
            // If notice is NOT required, force these values to 0 for consistency
            if (bodyData.noticeRequired === false) {
                bodyData.daysServed = 0;
                bodyData.noticePeriodDays = 0;
                bodyData.excessInNotice = 0;
                bodyData.noticePeriodRecovery = 0;
                if (bodyData.finalCalculation) {
                    bodyData.finalCalculation.noticePeriodRecovery = 0;
                }

                settlement.noticeRequired = false;
                settlement.daysServed = 0;
                settlement.noticePeriodDays = 0;
                settlement.excessInNotice = 0;
                settlement.noticePeriodRecovery = 0;
            } else {
                if (bodyData.daysServed !== undefined) settlement.daysServed = bodyData.daysServed;
                if (bodyData.noticeRequired !== undefined) settlement.noticeRequired = bodyData.noticeRequired;
                if (bodyData.noticePeriodDays !== undefined) settlement.noticePeriodDays = bodyData.noticePeriodDays;
                if (bodyData.excessInNotice !== undefined) settlement.excessInNotice = bodyData.excessInNotice;
            }

            // Ensure notice recovery matches calculation
            if (bodyData.finalCalculation?.noticePeriodRecovery !== undefined) {
                settlement.noticePeriodRecovery = bodyData.finalCalculation.noticePeriodRecovery;
            } else if (bodyData.noticePeriodRecovery !== undefined) {
                settlement.noticePeriodRecovery = bodyData.noticePeriodRecovery;
            }

            // Use packSettlement helper for consistent structure mapping
            packSettlement(settlement, bodyData);

            // Update settlement status and audit info
            settlement.status = 'Confirmed';
            settlement.confirmedAt = new Date();
            settlement.confirmedBy = new Types.ObjectId(confirmedBy);

            // ✅ FORCE PERSISTENT PDF URL
            settlement.set('pdfUrl', pdfUrl);

            // If it was already confirmed before, track that it's being updated
            if (wasAlreadyConfirmed) {
                settlement.lastEditedAt = new Date();
                settlement.lastEditedBy = new Types.ObjectId(confirmedBy);
            }

            await settlement.save({ session });

            // ✅ REGISTER AS DOCUMENT FOR DASHBOARD VISIBILITY
            const fileName = pdfUrl.split('/').pop() || `FNF_Letter_${settlement.employeeCode}.pdf`;

            await Document.findOneAndUpdate(
                {
                    employeeId: new Types.ObjectId(employeeId),
                    type: 'FNF Letter'
                },
                {
                    $set: {
                        category: 'Settlement',
                        fileName: fileName,
                        filePath: pdfUrl,
                        uploadDate: new Date(),
                        uploadedBy: new Types.ObjectId(confirmedBy),
                        accessLevel: 'Private',
                        status: 'Generated'
                    },
                    $inc: { version: 1 },
                    $push: {
                        auditLog: {
                            action: 'Generate',
                            performedBy: new Types.ObjectId(confirmedBy),
                            timestamp: new Date(),
                            details: 'Final Settlement PDF generated on confirmation'
                        }
                    }
                },
                { upsert: true, session }
            );

            // 2.3 Release hold payrolls
            // DISABLED: User requested to keep original hold payrolls as 'Hold' status
            // They are paid out via the Final Settlement PDF/Calculations, but the original record remains unchanged.
            /*
            if (settlement.holdPayrolls && settlement.holdPayrolls.length > 0) {
                const holdPayrollIds = settlement.holdPayrolls.map((p: any) => p.payrollId);
                await Payroll.updateMany(
                    { _id: { $in: holdPayrollIds } },
                    {
                        $set: {
                            status: 'Completed',
                            paymentConfirmedAt: new Date(),
                            payslipReleaseDate: new Date(),
                            processedAt: new Date(),
                            isFinalSettlement: true 
                        }
                    },
                    { session }
                );
                request.log.info(`Released ${holdPayrollIds.length} hold payrolls for FNF`);
            }
            */

            // 2.4 Mark Income Tax as processed for unpaid months
            // This prevents double-deduction if employee is rehired or payroll is corrected

            // Calculate Total Hold Salary (Net) to add to the main F&F Payslip
            const totalHoldNet = (settlement.holdPayrolls && settlement.holdPayrolls.length > 0)
                ? settlement.holdPayrolls.reduce((sum: number, p: any) => sum + (p.netSalary || 0), 0)
                : 0;

            // Sort unpaid months to ensure we identify the Last Month (LWD Month)
            const sortedUnpaidMonths = [...settlement.unpaidMonths].sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                return a.month - b.month;
            });

            for (let i = 0; i < sortedUnpaidMonths.length; i++) {
                const month = sortedUnpaidMonths[i];
                const isLastMonth = i === sortedUnpaidMonths.length - 1;

                // ✅ AUTO-GENERATE PAYSLIP LOGIC
                // Create or Update a standard Payroll record for this settled month
                const monthName = MONTH_NAMES[month.month - 1];

                // Fetch salary assignment for proper structure
                const salaryAssignment = await SalaryAssignment.findOne({
                    employeeId: new Types.ObjectId(employeeId)
                }).sort({ effectiveFrom: -1 }).populate('salaryStructureId').session(session);

                if (!salaryAssignment) {
                    throw new Error(`No salary assignment found for employee ${employeeId}`);
                }

                const monthlyGross = salaryAssignment.monthlyGross;
                const structure = salaryAssignment.salaryStructureId as any;
                const employeeCountry = employee.country || 'IN';
                const isUAE = employeeCountry === 'AE';

                // Calculate attendance adjusted gross (same as Payroll Service)
                const attendanceAdjustedGross = Math.round((month.daysWorked / month.totalDays) * monthlyGross);

                // Calculate earnings components (matching Payroll Service logic)
                const basic = Math.round((structure.fixedEarnings.basicPercentage / 100) * attendanceAdjustedGross);
                const hra = Math.round((structure.fixedEarnings.hraPercentage / 100) * attendanceAdjustedGross);
                const da = Math.round((structure.fixedEarnings.daPercentage / 100) * basic);

                // Calculate travel allowance based on country
                const travelAllowanceFromPercentageProrated = Math.round(
                    ((structure.fixedEarnings.travelAllowancePercentage ?? 0) / 100) * attendanceAdjustedGross
                );
                const travelAllowanceFromAssignment = salaryAssignment.travelAllowance || 0;
                const travelAllowance = isUAE
                    ? Math.round((month.daysWorked / month.totalDays) * travelAllowanceFromAssignment)
                    : travelAllowanceFromPercentageProrated;

                const reimbursementAllowance = Math.round(
                    ((structure.fixedEarnings.reimbursementPercentage ?? 0) / 100) * attendanceAdjustedGross
                );

                // Air ticket and medical allowances (UAE only, annual)
                const airTicketAllowance = isUAE ? (salaryAssignment.airTicketAllowance || 0) : 0;
                const medicalAllowance = isUAE ? (salaryAssignment.medicalAllowance || 0) : 0;

                // ✅ Balancing Logic for Other Allowance (India & UAE)
                const otherAllowance = Math.round(
                    attendanceAdjustedGross - (basic + hra + da + travelAllowance + reimbursementAllowance + airTicketAllowance + medicalAllowance)
                );

                // Calculate assigned values (full month, not prorated)
                const assignedBasic = Math.round((structure.fixedEarnings.basicPercentage / 100) * monthlyGross);
                const assignedHra = Math.round((structure.fixedEarnings.hraPercentage / 100) * monthlyGross);
                const assignedDa = Math.round((structure.fixedEarnings.daPercentage / 100) * monthlyGross);

                const travelAllowanceForAssigned = isUAE ? travelAllowanceFromAssignment : Math.round(
                    ((structure.fixedEarnings.travelAllowancePercentage ?? 0) / 100) * monthlyGross
                );

                let assignedOtherAllowance: number;
                if (isUAE) {
                    assignedOtherAllowance = Math.round(
                        monthlyGross - (assignedBasic + assignedHra + assignedDa + travelAllowanceForAssigned)
                    );
                } else {
                    assignedOtherAllowance = Math.round(
                        (structure.fixedEarnings.otherAllowancePercentage / 100) * monthlyGross
                    );
                }
                // ✅ ADD HOLD SALARY TO REIMBURSEMENT (Only for Last Month)
                const holdSalaryAddition = isLastMonth ? totalHoldNet : 0;
                // Accumulate to existing reimbursement if any
                const existingReimbursement = (month as any).reimbursement || 0; // Use manual entry if present, else 0

                const finalReimburseVal = existingReimbursement;


                // Calculate total deductions (matching Payroll Service)
                const noticeRecoveryAmount = isLastMonth ? Math.round(settlement.noticePeriodRecovery || 0) : 0;

                const totalDeductions = Math.round(
                    month.professionalTax +
                    month.incomeTax +
                    month.providentFund +
                    month.esi +
                    (month.lopAmount || 0) +
                    noticeRecoveryAmount
                );

                // Calculate net salary (matching Payroll Service)
                const netSalary = Math.round(
                    attendanceAdjustedGross -
                    month.providentFund -
                    month.incomeTax -
                    month.professionalTax -
                    month.esi +
                    finalReimburseVal + // Add Reimbursement
                    holdSalaryAddition - // ✅ ADDED: Include Hold Salary in Net Pay for FNF Month
                    noticeRecoveryAmount
                );
                // Calculate CTC based on country (matching Payroll Service)
                let ctc: number;
                if (isUAE) {
                    const monthlyComponents = assignedBasic + assignedHra + assignedDa + assignedOtherAllowance + travelAllowanceForAssigned;
                    ctc = Math.round(
                        (monthlyComponents * 12) +
                        (salaryAssignment.airTicketAllowance || 0) +
                        (salaryAssignment.medicalAllowance || 0) +
                        (salaryAssignment.annualInsurance || 0) // ✅ Annual insurance (stored as yearly)
                    );
                } else {
                    ctc = Math.round(
                        attendanceAdjustedGross +
                        (month.epfEmployer || month.providentFund) + // epfEmployer
                        month.esi // esiEmployer
                    );
                }

                // Prepare proper values for Assigned (Full Column) vs Actual
                // ✅ FNF SPECIAL: Use 'periodGross' (Worked + LOP) for Assigned Values
                // This ensures "Full" column shows the Max Salary for the Period (e.g. 1-14 Feb),
                // while "Actual" column shows what was earned (deducting LOP).
                const periodDays = (month.daysWorked || 0) + (month.lopDays || 0);
                const periodGross = Math.round((periodDays / month.totalDays) * monthlyGross);

                // Prepare payload matching Payroll Service structure
                const payrollPayload = {
                    salaryAssignmentId: salaryAssignment._id,
                    country: employeeCountry,
                    monthYear: `${month.year}-${String(month.month).padStart(2, '0')}`,

                    // Earnings (matching Payroll Service calculations)
                    basic,
                    hra,
                    da,
                    otherAllowance,
                    travelAllowance,
                    airTicketAllowance,
                    medicalAllowance,
                    reimbursementAllowance,

                    // Deductions (from FNF calculations)
                    professionalTax: month.professionalTax,
                    incomeTax: month.incomeTax,
                    epfEmployee: month.providentFund,
                    epfEmployer: month.epfEmployer || month.providentFund,     // ✅ Corrected: 13% rate
                    epfEmployerEps: month.epfEmployerEps || 0,                 // ✅ Added
                    epfEmployerEpf: month.epfEmployerEpf || 0,                 // ✅ Added
                    esiEmployee: month.esi,
                    esiEmployer: month.esi,
                    tdsDeduction: 0,
                    noticePeriodRecovery: noticeRecoveryAmount,
                    additionalDeduction: 0,
                    totalDeductions,
                    leaveDeductions: month.lopAmount || 0,

                    // Salary calculations
                    monthlyGross: attendanceAdjustedGross,
                    attendanceAdjustGross: attendanceAdjustedGross,
                    netSalary,
                    ctc,

                    // Attendance data
                    totalDaysInMonth: month.totalDays,
                    presentDays: month.presentDays,
                    payableDays: month.daysWorked,
                    LOPDays: month.lopDays,

                    // Additional fields
                    overtimeHours: 0,
                    overtimePay: 0,
                    reimbursement: finalReimburseVal,
                    holdSalary: holdSalaryAddition, // ✅ Store Hold Salary explicitly
                    bonus: 0,

                    // Assigned values (matching Payroll Service)
                    assigned: (() => {
                        const aBasic = Math.round((structure.fixedEarnings.basicPercentage / 100) * periodGross);
                        const aHra = Math.round((structure.fixedEarnings.hraPercentage / 100) * periodGross);
                        const aDa = Math.round((structure.fixedEarnings.daPercentage / 100) * aBasic);
                        const aTravel = Math.round(((structure.fixedEarnings.travelAllowancePercentage ?? 0) / 100) * periodGross);
                        const aReimbursement = Math.round(((structure.fixedEarnings.reimbursementPercentage ?? 0) / 100) * periodGross);
                        const aAir = isUAE ? (salaryAssignment.airTicketAllowance || 0) : 0;
                        const aMedical = isUAE ? (salaryAssignment.medicalAllowance || 0) : 0;

                        // Balancing Logic for Assigned Other Allowance
                        const aOther = Math.round(periodGross - (aBasic + aHra + aDa + aTravel + aReimbursement + aAir + aMedical));

                        return {
                            basic: aBasic,
                            hra: aHra,
                            da: aDa,
                            otherAllowance: aOther,
                            travelAllowance: aTravel,
                            airTicketAllowance: aAir,
                            medicalAllowance: aMedical,
                            reimbursementAllowance: aReimbursement
                        };
                    })(),

                    // Status fields (Set to Draft for admin review)
                    status: 'Draft',
                    processedAt: new Date(),
                    isFinalSettlement: true,
                    type: 'FinalSettlement'
                };

                if (false) { // Skip existing check since we deleted them above
                    // (Old block kept for context but disabled by cleanup logic above)
                } else {
                    // Create new payroll with all calculated values
                    const newPayroll = new Payroll({
                        employeeId: new Types.ObjectId(employeeId),
                        month: month.month,
                        year: month.year,
                        ...payrollPayload
                    });

                    await newPayroll.save({ session });
                    request.log.info(`Auto-generated new payslip for FNF month: ${monthName} ${month.year}`);
                }

                if (month.incomeTax > 0) {
                    const financialYear = month.month <= 3
                        ? `${month.year - 1}-${month.year}`
                        : `${month.year}-${month.year + 1}`;

                    const monthShortName = MONTH_SHORT_NAMES[monthName];

                    try {
                        await TaxDeclaration.updateOne(
                            {
                                employeeId: new Types.ObjectId(employeeId),
                                financialYear,
                                'monthlyDeductions.month': monthShortName,
                                'monthlyDeductions.isProcessed': false
                            },
                            {
                                $set: {
                                    'monthlyDeductions.$.isProcessed': true,
                                    'monthlyDeductions.$.actualDeduction': month.incomeTax,
                                    'monthlyDeductions.$.processedDate': new Date()
                                }
                            },
                            { session }
                        );
                    } catch (taxErr) {
                        // Log but don't fail the entire transaction if tax update fails
                        // This is non-critical as the IT was already deducted in FNF
                        request.log.warn(taxErr, `Failed to mark IT as processed for ${monthName} ${month.year}`);
                    }
                }
            }

            // 2.5 Update user status and mark as inactive
            // When final settlement is confirmed, employee should be marked as inactive
            await User.updateOne(
                { _id: new Types.ObjectId(employeeId) },
                {
                    $set: {
                        finalSettlementDone: true,
                        active: false  // ✅ Mark employee as inactive on settlement confirmation
                    }
                },
                { session }
            );

            await session.commitTransaction();
            session.endSession();

            // --- PHASE 3: Post-Transaction Notification ---
            if (employee.email) {
                emailService.sendEmail({
                    body: {
                        to: employee.email,
                        subject: 'Full and Final Settlement Confirmed',
                        html: `<p>Your F&F letter is ready: <a href="${pdfUrl}">Download</a></p>`,
                        text: `Your F&F letter is ready: ${pdfUrl}`
                    }
                }).catch(e => console.error('Email failed (non-critical)', e));
            }

            return reply.send({
                success: true,
                pdfUrl: pdfUrl,
                netAmount: settlement.finalCalculation?.netAmount || 0,
                data: settlement
            });

        } catch (dbError: any) {
            await session.abortTransaction();
            session.endSession();
            throw dbError; // Caught by outer catch
        }

    } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Internal server error', details: error.message });
    }
}

/**
 * Delete Final Settlement Draft
 * DELETE /final-settlement/:employeeId
 */
export async function deleteFinalSettlement(
    request: FastifyRequest<{ Params: { employeeId: string } }>,
    reply: FastifyReply
) {
    try {
        const { employeeId } = request.params;

        if (!Types.ObjectId.isValid(employeeId)) {
            return reply.code(400).send({ success: false, error: 'Invalid employee ID' });
        }

        const result = await FinalSettlement.deleteOne({
            employeeId: new Types.ObjectId(employeeId),
            status: 'Draft'
        });

        if (result.deletedCount === 0) {
            return reply.code(404).send({
                success: false,
                error: 'No draft final settlement found for this employee'
            });
        }

        return reply.send({
            success: true,
            message: 'Final settlement draft deleted successfully'
        });

    } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
}

/**
 * Calculate Final Settlement
 * POST /final-settlement/calculate
 */
export async function calculateFinalSettlement(
    request: FastifyRequest<{ Body: Partial<IFinalSettlement> }>,
    reply: FastifyReply
) {
    try {
        const data = request.body as Partial<IFinalSettlement>;

        // DEBUG: Log what we're receiving
        console.log('=== CALCULATE ENDPOINT DEBUG ===');
        console.log('holdPayrolls received:', data.holdPayrolls?.length || 0, 'items');
        console.log('unpaidMonths received:', data.unpaidMonths?.length || 0, 'items');
        console.log('workDays.holdPayrolls:', (data as any).workDays?.holdPayrolls?.length || 0, 'items');
        console.log('workDays.unpaidMonths:', (data as any).workDays?.unpaidMonths?.length || 0, 'items');
        console.log('leavingDate:', data.leavingDate);
        console.log('================================');

        // Support both formats: prioritize workDays, then root level
        // Check for non-empty arrays to avoid using empty root-level arrays
        const holdPayrollsFromWorkDays = (data as any).workDays?.holdPayrolls;
        const holdPayrollsFromRoot = data.holdPayrolls;
        const holdPayrolls = (holdPayrollsFromWorkDays && holdPayrollsFromWorkDays.length > 0)
            ? holdPayrollsFromWorkDays
            : (holdPayrollsFromRoot && holdPayrollsFromRoot.length > 0)
                ? holdPayrollsFromRoot
                : [];

        const unpaidMonthsFromWorkDays = (data as any).workDays?.unpaidMonths;
        const unpaidMonthsFromRoot = data.unpaidMonths;
        const unpaidMonthsRaw = (unpaidMonthsFromWorkDays && unpaidMonthsFromWorkDays.length > 0)
            ? unpaidMonthsFromWorkDays
            : (unpaidMonthsFromRoot && unpaidMonthsFromRoot.length > 0)
                ? unpaidMonthsFromRoot
                : [];

        // ✅ FIX: Backend Validation for LOP Days (Prevents invalid inputs)
        for (const m of unpaidMonthsRaw) {
            if (m.lopDays < 0 || m.lopDays > (m.totalDays || 31)) {
                return reply.code(400).send({
                    success: false,
                    error: `Invalid LOP days for ${m.monthYear}. Must be between 0 and ${m.totalDays || 31}.`
                });
            }
        }

        // Filter unpaid months based on LWD FIRST
        let filteredUnpaidMonths = unpaidMonthsRaw;
        if (data.leavingDate && filteredUnpaidMonths.length > 0) {
            const lwdDate = new Date(data.leavingDate);
            const lwdYear = lwdDate.getFullYear();
            const lwdMonth = lwdDate.getMonth() + 1; // 1-indexed

            filteredUnpaidMonths = filteredUnpaidMonths.filter((month: any) => {
                const monthYear = month.year;
                const monthMonth = month.month;

                // Only include months before or IN the same month as LWD
                return (monthYear < lwdYear) || (monthYear === lwdYear && monthMonth <= lwdMonth);
            });
        }

        const employeeIdObj = data.employeeId ? new Types.ObjectId(data.employeeId.toString()) : null;

        // SECURITY FIX Mirror: Fetch hold payrolls from DB
        const holdPayrollIds = (holdPayrolls || []).map((p: any) => p.payrollId || p._id);
        const holdPayrollsDb = await Payroll.find({
            _id: { $in: holdPayrollIds },
            employeeId: employeeIdObj
        });


        // Payable components (using filtered data)
        const totalHoldAmount = holdPayrollsDb.reduce((sum: number, p: any) => sum + (p.netSalary || 0), 0) || 0;


        // RECICULATION LOGIC: Recalculate unpaid salaries locally to ensure Zero-Logic from frontend
        let totalUnpaidSalary = 0;

        // ✅ ACTUAL LEGAL: Fetch ALL Salary Assignments to handle historical hikes accurately
        const allSalaryAssignments: any[] = employeeIdObj ? await SalaryAssignment.find({
            employeeId: employeeIdObj
        }).sort({ effectiveFrom: 1 }).populate('salaryStructureId').lean() : [];

        const salaryAssignment: any = allSalaryAssignments.length ? allSalaryAssignments[allSalaryAssignments.length - 1] : null;
        const monthlyGross = salaryAssignment?.monthlyGross || 0;
        const structure = salaryAssignment?.salaryStructureId || {};

        const _latestSalaryAssignment = salaryAssignment;

        const getAssignmentForMonth = (m: number, y: number) => {
            const fD = new Date(y, m - 1, 1);
            const lD = new Date(y, m, 0);
            return allSalaryAssignments.find(a =>
                new Date(a.effectiveFrom) <= lD &&
                new Date(a.effectiveTo) >= fD
            ) || _latestSalaryAssignment;
        };


        // Fetch User needed for Country check inside loop
        const employee = employeeIdObj ? await User.findById(employeeIdObj) : null;


        // Recalculation Helpers (Same as Calculate route)
        // Helper: PT Calculation (Cloned for recalculation logic)
        const calculatePT = (grossSalary: number, monthNumber: number) => {
            const ptConfig = structure?.statutoryDeductions?.professionalTax;
            if (!ptConfig?.slabs?.length) return 0;
            const { term, slabs } = ptConfig;
            const applicableMonths: Record<string, number[]> = {
                half_yearly: [2, 8],
                monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            };
            if (!applicableMonths[term]?.includes(monthNumber)) return 0;
            for (const slab of slabs) {
                if (grossSalary >= slab.fromAmount && (!slab.toAmount || grossSalary <= slab.toAmount)) {
                    return Number(slab.taxAmount) || 0;
                }
            }
            return 0;
        };

        // Helper: PF Calculation (Cloned for recalculation logic)
        const calculatePF = (basic: number, da: number) => {
            const epf = structure?.statutoryDeductions?.epf;
            const employerSplit = structure?.statutoryDeductions?.employerSplit;
            
            if (!epf) return { epfEmployee: 0, epfEmployer: 0, epfEmployerEps: 0, epfEmployerEpf: 0 };
            
            const wage = basic + da;
            const rate = (epf.employeeContribution || 12) / 100;
            const employerRate = (epf.employerContribution || 13) / 100;
            const epsPercentage = (employerSplit?.epsPercentage ?? 8.33) / 100;
            const epsWageCap = employerSplit?.epsWageCap ?? 15000;
            
            const limit = epf.maxLimit ?? 15000;
            
            const isCapped = wage >= limit;
            const finalEpfEmployee = Math.round(isCapped ? (limit * rate) : (wage * rate));
            const finalEpfEmployer = Math.round(isCapped ? (limit * employerRate) : (wage * employerRate));

            // EPS (Pension) Calculation
            const currentWageForEps = Math.min(wage, epsWageCap);
            const finalEpfEmployerEps = Math.round(epsPercentage * currentWageForEps);

            // EPF (Employer Share) = Total Employer - EPS
            const finalEpfEmployerEpf = Math.max(0, finalEpfEmployer - finalEpfEmployerEps);

            return {
                epfEmployee: finalEpfEmployee,
                epfEmployer: finalEpfEmployer,
                epfEmployerEps: finalEpfEmployerEps,
                epfEmployerEpf: finalEpfEmployerEpf
            };
        };

        // Helper: ESI Calculation
        const calculateESI = () => 0;

        filteredUnpaidMonths = unpaidMonthsRaw;

        // Variables for aggregation
        let professionalTax = 0;
        let providentFund = 0;
        let epfEmployerTotal = 0;     // ✅ Added
        let epfEmployerEpsTotal = 0;  // ✅ Added
        let epfEmployerEpfTotal = 0;  // ✅ Added
        let esi = 0;
        let incomeTax = 0;
        let totalLOPAmount = 0;

        // Reset (reuse existing variable)
        totalUnpaidSalary = 0;

        const effectiveLeavingDate = data.leavingDate || (data as any).resignationDetails?.lwd;

        // ✅ RECALCULATION STRATEGY:
        // Use calculateUnpaidGaps if mode is automatic/default and we have a valid leaving date.
        // This ensures days/weekends are correct for the given LWD.
        if (data.mode !== 'manual' && effectiveLeavingDate && employeeIdObj) {
            const gapCalc = await calculateUnpaidGaps(
                employeeIdObj.toString(),
                new Date(effectiveLeavingDate),
                monthlyGross,
                salaryAssignment,
                holdPayrollsDb
            );

            filteredUnpaidMonths = gapCalc.unpaidMonths;
            totalUnpaidSalary = gapCalc.totalUnpaidSalary;
            professionalTax = gapCalc.totalProfessionalTax || 0;
            providentFund = gapCalc.totalProvidentFund || 0;
            epfEmployerTotal = gapCalc.totalEpfEmployer || 0;     // ✅ Added
            epfEmployerEpsTotal = gapCalc.totalEpfEmployerEps || 0; // ✅ Added
            epfEmployerEpfTotal = gapCalc.totalEpfEmployerEpf || 0; // ✅ Added
            esi = gapCalc.totalESI || 0;
            incomeTax = gapCalc.totalIncomeTax || 0;
            totalLOPAmount = gapCalc.totalLOPAmount || 0;

        } else {
            // Manual Mode or missing data: Process the input array
            // Filter unpaid months based on LWD FIRST (Legacy logic)
            if (effectiveLeavingDate && filteredUnpaidMonths.length > 0) {
                const lwdDate = new Date(effectiveLeavingDate);
                const lwdYear = lwdDate.getFullYear();
                const lwdMonth = lwdDate.getMonth() + 1;

                filteredUnpaidMonths = filteredUnpaidMonths.filter((month: any) => {
                    const monthYear = month.year;
                    const monthMonth = month.month;
                    return (monthYear < lwdYear) || (monthYear === lwdYear && monthMonth <= lwdMonth);
                });
            }

            for (const month of filteredUnpaidMonths) {
                const daysInMonth = month.totalDays || 30;
                const payableDays = month.daysWorked || 0;
                const lopDays = month.lopDays || 0;

                if (daysInMonth > 0) {
                    // ✅ ACTUAL LEGAL: Fetch correct assignment for THIS specific month in loop
                    const curMonthAssignment = getAssignmentForMonth(month.month, month.year);
                    const curMonthGross = curMonthAssignment?.monthlyGross || monthlyGross;
                    const curMonthStructure = curMonthAssignment?.salaryStructureId || structure;

                    const bP = (curMonthStructure.fixedEarnings?.basicPercentage ?? 0) / 100;
                    const dP = (curMonthStructure.fixedEarnings?.daPercentage ?? 0) / 100;
                    const hP = (curMonthStructure.fixedEarnings?.hraPercentage ?? 0) / 100;
                    const tP = (curMonthStructure.fixedEarnings?.travelAllowancePercentage ?? 0) / 100;
                    // removed oP as it is now calculated via balancing logic below

                    const fullB = curMonthGross * bP;
                    const fullD = fullB * dP;
                    const fullH = curMonthGross * hP;
                    const fullT = curMonthGross * tP;
                    // removed fullOtherAllowances

                    const proratedBasic = (fullB / daysInMonth) * payableDays;
                    const proratedDA = (fullD / daysInMonth) * payableDays;
                    const proratedHRA = (fullH / daysInMonth) * payableDays;
                    const proratedTravelAllowance = (fullT / daysInMonth) * payableDays;

                    const pg = (curMonthGross / daysInMonth) * payableDays;
                    const targetGross = Math.round(pg);
                    const roundedBasic = Math.round(proratedBasic + proratedDA);
                    const roundedHRA = Math.round(proratedHRA);
                    const roundedConveyance = Math.round(proratedTravelAllowance);

                    // Balancing Logic: Adjust 'Other Allowance' to ensure sum of components matches targetGross exactly.
                    const roundedOtherAllowances = targetGross - (roundedBasic + roundedHRA + roundedConveyance);

                    const lopAmount = (curMonthGross / daysInMonth) * lopDays;
                    const pfResult = calculatePF(proratedBasic, proratedDA);
                    const pfAmount = pfResult.epfEmployee;
                    const esiAmount = calculateESI();

                    month.components = {
                        basic: roundedBasic,
                        hra: roundedHRA,
                        conveyance: roundedConveyance,
                        specialAllowance: 0,
                        otherAllowances: roundedOtherAllowances,
                        gross: targetGross
                    };

                    month.lopAmount = Math.round(lopAmount);
                    month.salary = targetGross;

                    // ✅ PT Calculation Logic (Updated to Aggregate Cycle Logic for Manual recalculation)
                    const lDate = effectiveLeavingDate ? new Date(effectiveLeavingDate) : new Date();
                    const isLeavingMonth = month.year === lDate.getFullYear() && month.month === (lDate.getMonth() + 1);
                    const lwMonth = lDate.getMonth() + 1;
                    const lwYear = lDate.getFullYear();
                    const isH1_m = lwMonth >= 4 && lwMonth <= 9;
                    const cycleStartYear_m = isH1_m ? lwYear : (lwMonth >= 10 ? lwYear : lwYear - 1);

                    let ptAmount = 0;
                    const ptConfig = structure?.statutoryDeductions?.professionalTax;
                    const ptTerm = ptConfig?.term || 'half_yearly';

                    if (ptTerm === 'half_yearly') {
                        if (isLeavingMonth) {
                            // Simplified lookup for recalculation with Cycle Awareness
                            const allCompletedRecalc = await Payroll.find({
                                employeeId: employeeIdObj,
                                status: 'Completed',
                                type: { $ne: 'FinalSettlement' }
                            }).lean();
                            const payrollMap_r = new Map(allCompletedRecalc.map(p => [`${p.year}-${p.month}`, p]));

                            let prevGross = 0;
                            let prevPT = 0;

                            const cycleStartDate = isH1_m ? new Date(cycleStartYear_m, 3, 1) : new Date(cycleStartYear_m, 9, 1);
                            const thisMonthStart = new Date(month.year, month.month - 1, 1);
                            let iterDate = new Date(cycleStartDate);

                            while (iterDate < thisMonthStart) {
                                const iM = iterDate.getMonth() + 1;
                                const iY = iterDate.getFullYear();
                                const key = `${iY}-${iM}`;
                                const existing = payrollMap_r.get(key);
                                if (existing) {
                                    prevGross += (Number(existing.attendanceAdjustGross) || Number((existing as any).attendanceAdjustedGross) || Number(existing.monthlyGross) || 0);
                                    prevPT += (Number(existing.professionalTax) || 0);
                                } else {
                                    // Missing records: Use assumption if active
                                    const monthCycleAssignment = getAssignmentForMonth(iM, iY);
                                    const monthCycleGross = monthCycleAssignment?.monthlyGross || monthlyGross;

                                    const jDate = employee?.joiningDate ? new Date(employee.joiningDate) : null;
                                    if (jDate && iterDate >= new Date(jDate.getFullYear(), jDate.getMonth(), 1)) {
                                        prevGross += monthCycleGross; // Use historical gross
                                    }
                                }
                                iterDate.setMonth(iterDate.getMonth() + 1);
                            }

                            // totalUnpaidSalary includes all gaps processed before this month
                            // plus current month gross (pg)
                            const totalCycleGross = prevGross + totalUnpaidSalary + pg;
                            const representativeMonth = isH1_m ? 8 : 2;
                            const totalDue = Math.round(calculatePT(totalCycleGross, representativeMonth));
                            ptAmount = Math.max(0, totalDue - prevPT);
                        } else {
                            ptAmount = 0;
                        }
                    } else {
                        ptAmount = Math.round(calculatePT(curMonthGross, month.month));
                    }

                    month.professionalTax = ptAmount;
                    month.providentFund = pfAmount;
                    month.epfEmployer = pfResult.epfEmployer;        // ✅ Added
                    month.epfEmployerEps = pfResult.epfEmployerEps;  // ✅ Added
                    month.epfEmployerEpf = pfResult.epfEmployerEpf;  // ✅ Added
                    month.esi = esiAmount;
                    month.incomeTax = month.incomeTax || 0;

                    totalUnpaidSalary += month.salary;

                    // Accumulate Override Stats
                    professionalTax += month.professionalTax;
                    providentFund += month.providentFund;
                    epfEmployerTotal += (month.epfEmployer || 0);     // ✅ Added
                    epfEmployerEpsTotal += (month.epfEmployerEps || 0); // ✅ Added
                    epfEmployerEpfTotal += (month.epfEmployerEpf || 0); // ✅ Added
                    esi += month.esi;
                    incomeTax += month.incomeTax;
                    totalLOPAmount += month.lopAmount;
                }
            }
        }






        // RECALCULATION LOGIC: Recalculate leave encashment amounts based on SAFE perDayRate
        let totalLeaveEncashment = 0;
        // ✅ Step 5: Leave Encashment on (Basic Salary Only)
        // One Day Basic = Basic Salary / Actual Days in Month
        // const leaveSummary = (data as any).leaveSummary; // Assuming leaveSummary is available in data
        // const alBalance = leaveSummary?.annual?.remaining || 0;
        let encashPerDay = 0;

        // Get actual days in the relevant month (leaving month)
        const encashDate = data.leavingDate ? (data.leavingDate instanceof Date ? data.leavingDate : new Date(data.leavingDate)) : new Date();
        const daysInEncashMonth = new Date(encashDate.getFullYear(), encashDate.getMonth() + 1, 0).getDate();

        // const structure = salaryAssignment?.salaryStructureId; // Already defined above
        if (structure) {
            const basicPerc = structure.fixedEarnings?.basicPercentage ?? 0;
            // Removed DA from calculation as per requirement
            const basic = monthlyGross * (basicPerc / 100);
            encashPerDay = basic / daysInEncashMonth;
        } else {
            // Fallback if no structure (should rarely happen)
            encashPerDay = monthlyGross / daysInEncashMonth;
        }

        if (data.leaveBalance) {
            for (const l of data.leaveBalance) {
                // Backend trusts its own perDayRate (Basic+DA) logic provided during init
                l.perDayRate = Math.round(encashPerDay); // Use the newly calculated encashPerDay
                l.encashAmount = Math.round((Number(l.encashDays) || 0) * encashPerDay);
                totalLeaveEncashment += l.encashAmount;
            }
        }

        const totalReimbursements = data.reimbursements?.reduce((sum: number, r: any) => sum + (r.amount || 0), 0) || 0;
        const totalOtherAdditions = data.otherAdditions?.reduce((sum: number, a: any) => sum + (a.amount || 0), 0) || 0;

        // Deductions
        const totalOtherDeductions = data.otherDeductions?.reduce((sum: number, d: any) => sum + (d.amount || 0), 0) || 0;

        let noticeRecovery = 0;

        if (data.noticeRequired === false) {
            noticeRecovery = 0;
        } else {
            // Check for manual override provided in request
            const manualRecovery = (data.noticePeriodRecovery !== undefined)
                ? data.noticePeriodRecovery
                : (data as any).noticePay?.noticePeriodRecovery;

            // If manual recovery is provided and non-zero, favor it (User Override)
            // BUT: If mode is automatic, we should Recalculate based on dates to ensure accuracy
            const isAutomatic = data.mode !== 'manual';
            const hasManualOverride = manualRecovery !== undefined && manualRecovery !== 0;

            if (hasManualOverride && !isAutomatic) {
                noticeRecovery = manualRecovery;
            } else {
                // ✅ Recalculate using precise helper
                const resignationDate = (data as any).resignationSubmittedOn ? new Date((data as any).resignationSubmittedOn) : null;
                const leavingDateForNotice = data.leavingDate ? new Date(data.leavingDate) : null;

                // Get notice days from payload or nested
                const noticeDays = (data.noticePeriodDays !== undefined)
                    ? Number(data.noticePeriodDays)
                    : Number((data as any).noticePay?.noticePeriodDays || 0);

                if (resignationDate && leavingDateForNotice && monthlyGross > 0) {
                    const calculatedNotice = await calculateNoticeData(
                        (data.employeeId || "").toString(),
                        resignationDate,
                        leavingDateForNotice,
                        noticeDays,
                        monthlyGross
                    );

                    // Use the auto-calculated recovery
                    noticeRecovery = Math.round(calculatedNotice.noticePeriodRecovery);
                } else if ((data.excessInNotice || 0) < 0) {
                    // Fallback simplistic if dates missing (should not happen in calculate preview)
                    noticeRecovery = Math.abs(data.excessInNotice || 0) * monthlyGross / 30;
                }
            }
        }



        // Fetch User to check Joining Date for Gratuity
        // const employee = await User.findById(data.employeeId); // Already fetched above

        let gratuity = 0;
        // Gratuity calculation logic disabled temporarily

        const totalPayable = totalHoldAmount + totalUnpaidSalary + totalLeaveEncashment + totalReimbursements + totalOtherAdditions + gratuity;
        // ✅ Include LOP Amount in Total Deductions
        const totalDeductions = noticeRecovery + totalOtherDeductions + professionalTax + providentFund + esi + incomeTax + totalLOPAmount;
        const netAmount = totalPayable - totalDeductions;

        const calculation = {
            holdSalaries: Math.round(totalHoldAmount),
            unpaidSalaries: Math.round(totalUnpaidSalary),
            leaveEncashment: Math.round(totalLeaveEncashment),
            reimbursements: Math.round(totalReimbursements),
            otherAdditions: Math.round(totalOtherAdditions),
            gratuity: Math.round(gratuity),
            totalPayable: Math.round(totalPayable),
            noticePeriodRecovery: Math.round(noticeRecovery),
            professionalTax: Math.round(professionalTax),
            incomeTax: Math.round(incomeTax),
            providentFund: Math.round(providentFund),
            epfEmployer: Math.round(epfEmployerTotal),        // ✅ Added
            epfEmployerEps: Math.round(epfEmployerEpsTotal),  // ✅ Added
            epfEmployerEpf: Math.round(epfEmployerEpfTotal),  // ✅ Added
            esi: Math.round(esi),
            lopAmount: Math.round(totalLOPAmount), // ✅ Added for consistency with other statutory deductions
            otherDeductions: Math.round(totalOtherDeductions),
            totalDeductions: Math.round(totalDeductions),
            netAmount: Math.round(netAmount),
            isNegative: netAmount < 0
        };
        return reply.send({
            success: true,

            // Root-level summary fields (for UI cards)
            netAmount: calculation.netAmount,
            isNegative: calculation.isNegative,
            totalPayable: calculation.totalPayable,
            totalDeductions: calculation.totalDeductions,

            // Root-level tax fields
            providentFund: calculation.providentFund,
            epfEmployer: calculation.epfEmployer,       // ✅ Added
            epfEmployerEps: calculation.epfEmployerEps, // ✅ Added
            epfEmployerEpf: calculation.epfEmployerEpf, // ✅ Added
            esi: calculation.esi,
            professionalTax: calculation.professionalTax,
            incomeTax: calculation.incomeTax,
            gratuity: calculation.gratuity,
            lopAmount: calculation.lopAmount, // ✅ Added for consistency

            // Nested details (for tables)
            workDays: {
                holdPayrolls: holdPayrolls,
                unpaidMonths: filteredUnpaidMonths
            },

            // Backward compatibility (keep for now)
            data: calculation,
            finalCalculation: calculation
        });

    } catch (error: any) {
        request.log.error(error);
        return reply.code(500).send({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
}
