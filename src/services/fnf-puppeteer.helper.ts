import { uploadFileToGCP } from '../utilis/gcpStorage';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import handlebars from 'handlebars';
import { formatCurrency } from '../utilis/currency';
import { getPuppeteerLaunchOptions } from '../utilis/puppeteer';
import { LOV } from '../models/lov.model';

/**
 * Generate FNF Letter PDF via HTML to PDF (Puppeteer)
 * This logic matches the side-by-side visual layout provided by the user.
 */
export async function generateFNFLetter(settlement: any, employee: any): Promise<string> {
    const fnfDir = path.join(process.cwd(), 'uploads');
    console.log(fnfDir)
    if (!fs.existsSync("uploads")) {
        fs.mkdirSync("uploads", { recursive: true });
    }

    const fnfBaseName = `FNF_${settlement.employeeCode}_${Date.now()}`;
    const outputPdfPath = path.join(fnfDir, `${fnfBaseName}.pdf`);

    // Helper to format dates to DD MMM YYYY
    const formatDate = (date: Date | string | undefined): string => {
        if (!date) return 'N/A';
        const d = new Date(date);
        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Helper for number to words
    const numberToWords = (num: number): string => {
        if (num === 0) return "zero";
        const belowTwenty = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
        const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
        const thousandUnits = ["", "Thousand", "Million", "Billion"];

        function helper(n: number): string {
            if (n === 0) return "";
            if (n < 20) return belowTwenty[n] + " ";
            if (n < 100) return tens[Math.floor(n / 10)] + " " + helper(n % 10);
            return belowTwenty[Math.floor(n / 100)] + " Hundred " + helper(n % 100);
        }

        let result = "";
        let unitIndex = 0;
        let tempNum = Math.abs(Math.round(num));
        while (tempNum > 0) {
            let chunk = tempNum % 1000;
            if (chunk !== 0) {
                result = helper(chunk) + thousandUnits[unitIndex] + " " + result;
            }
            tempNum = Math.floor(tempNum / 1000);
            unitIndex++;
        }
        return result.trim();
    };

    const netAmountRaw = Math.round(settlement.finalCalculation.netAmount);
    // Determine sign for formatting
    const sign = netAmountRaw < 0 ? '-' : '';
    const netAmountFormatted = sign + formatCurrency(Math.abs(netAmountRaw), 'IN');
    const netPayWords = numberToWords(netAmountRaw);
    const currencyWord = (employee.country === 'AE' || employee.country === 'United Arab Emirates') ? 'Dirhams' : 'Rupees';

    // Component-wise breakdown
    const unpaidBasic = (settlement.unpaidMonths || []).reduce((sum: number, m: any) => sum + (m.components?.basic || 0), 0);
    const unpaidHRA = (settlement.unpaidMonths || []).reduce((sum: number, m: any) => sum + (m.components?.hra || 0), 0);
    const unpaidConveyance = (settlement.unpaidMonths || []).reduce((sum: number, m: any) => sum + (m.components?.conveyance || 0), 0);
    const unpaidOtherAllowances = (settlement.unpaidMonths || []).reduce((sum: number, m: any) => sum + (m.components?.otherAllowances || 0), 0);
    const totalLOPAmount = (settlement.unpaidMonths || []).reduce((sum: number, m: any) => sum + (m.lopAmount || 0), 0);

    // Prepare Earnings list
    const allEarnings: any[] = [];
    if (unpaidBasic > 0) allEarnings.push({ label: 'BASIC', amount: (unpaidBasic).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (unpaidHRA > 0) allEarnings.push({ label: 'HRA', amount: (unpaidHRA).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (settlement.finalCalculation.holdSalaries > 0) allEarnings.push({ label: 'HOLD SALARY', amount: (settlement.finalCalculation.holdSalaries).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (unpaidConveyance > 0) allEarnings.push({ label: 'CONVEYANCE ALLOWANCE', amount: (unpaidConveyance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (unpaidOtherAllowances > 0) allEarnings.push({ label: 'OTHER ALLOWANCE', amount: (unpaidOtherAllowances).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (settlement.finalCalculation.leaveEncashment > 0) allEarnings.push({ label: 'LEAVE ENCASHMENT', amount: (settlement.finalCalculation.leaveEncashment).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (settlement.finalCalculation.reimbursements > 0) allEarnings.push({ label: 'REIMBURSEMENTS', amount: (settlement.finalCalculation.reimbursements).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if ((settlement as any).gratuity > 0) allEarnings.push({ label: 'GRATUITY', amount: ((settlement as any).gratuity).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });

    (settlement.otherAdditions || []).forEach((a: any) => {
        if (a.amount > 0) allEarnings.push({ label: (a.description || 'OTHER ADDITION').toUpperCase(), amount: (a.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    });

    // Prepare Deductions list
    const allDeductions: any[] = [];
    const d = settlement.finalCalculation;
    if (d.providentFund > 0) allDeductions.push({ label: 'PF', amount: (d.providentFund).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (totalLOPAmount > 0) allDeductions.push({ label: 'LOSS OF PAY', amount: (totalLOPAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (d.professionalTax > 0) allDeductions.push({ label: 'PROF TAX', amount: (d.professionalTax).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (d.incomeTax > 0) allDeductions.push({ label: 'INCOME TAX', amount: (d.incomeTax).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    if (d.noticePeriodRecovery > 0) allDeductions.push({ label: 'NOTICE PERIOD RECOVERY', amount: (d.noticePeriodRecovery).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });

    (settlement.otherDeductions || []).forEach((od: any) => {
        if (od.amount > 0) allDeductions.push({ label: (od.description || 'OTHER DEDUCTION').toUpperCase(), amount: (od.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
    });

    // Create combined rows for side-by-side display
    const combinedRows = [];
    const maxLen = Math.max(allEarnings.length, allDeductions.length);
    for (let i = 0; i < maxLen; i++) {
        combinedRows.push({
            income: allEarnings[i] || { label: '', amount: '' },
            deduction: allDeductions[i] || { label: '', amount: '' }
        });
    }

    // Resolve department and location labels using LOV lookup or fallbacks
    // We prioritize populated names or direct manual fields, then fall back to LOV lookup using the ID
    let deptValForLookup = (employee as any).departmentId || (employee as any).department;
    let empDept = (employee as any).departmentName || (employee as any).departmentId?.name || (employee as any).department || 'N/A';

    if (empDept === 'N/A' || empDept === deptValForLookup) {
        const deptLov = await LOV.findOne({ type: 'department', 'values.value': deptValForLookup });
        if (deptLov) {
            const dVal = deptLov.values.find((v: any) => v.value === deptValForLookup);
            if (dVal) empDept = dVal.label;
        }
    }

    let locValForLookup = (employee as any).location;
    let empLocation = (employee as any).locationName || locValForLookup || 'N/A';

    if (empLocation === 'N/A' || empLocation === locValForLookup) {
        const locLov = await LOV.findOne({ type: 'location', 'values.value': locValForLookup });
        if (locLov) {
            const lVal = locLov.values.find((v: any) => v.value === locValForLookup);
            if (lVal) empLocation = lVal.label;
        }
    }

    // Format lastPaidMonth to full name (e.g., "March 2026") for report display
    const lastPaidDate = settlement.lastPaidMonthDate ? new Date(settlement.lastPaidMonthDate) : null;
    const lastPaidMonthFormatted = (lastPaidDate && !isNaN(lastPaidDate.getTime()))
        ? lastPaidDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : settlement.lastPaidMonth || 'N/A';

    /**
     * Helper to format labels (Refer Payslip)
     * 1. Replaces underscores with spaces
     * 2. Capitalizes each word
     */
    const formatLabel = (str: string | undefined | null): string => {
        if (!str || str === 'N/A') return 'N/A';
        return str
            .replace(/_/g, ' ')
            .toLowerCase()
            .split(' ')
            .filter(Boolean)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const templateData = {
        logoUrl: 'https://storage.googleapis.com/tendlylogo/cd_logo_2%20(1).png', // Official Cloud Desk Logo URLs URL
        empNo: settlement.employeeCode,
        empName: formatLabel(settlement.employeeName),
        empDept: formatLabel(empDept),
        empDesig: formatLabel((employee as any).designation || (employee as any).specificRole || (employee as any).role || 'N/A'),
        empLocation: formatLabel(empLocation),
        joiningDate: formatDate((employee as any).joiningDate),
        lastPaidMonth: lastPaidMonthFormatted,
        resignDate: formatDate(settlement.resignationSubmittedOn),
        leavingDate: formatDate(settlement.leavingDate),
        noticePeriod: settlement.noticePeriodDays || 0,
        noticeAdjustable: settlement.daysServed || 0,
        plDays: (settlement.leaveBalance || []).reduce((sum: number, l: any) => sum + (l.encashDays || 0), 0) || 0,
        salaryDays: (settlement.unpaidMonths || []).reduce((sum: number, m: any) => sum + (m.daysWorked || 0), 0),
        monthDays: (settlement.unpaidMonths || []).reduce((sum: number, m: any) => sum + (m.totalDays || 0), 0),
        lopDays: (settlement.unpaidMonths || []).reduce((sum: number, m: any) => sum + (m.lopDays || 0), 0),
        effectiveWorkdays: (settlement.unpaidMonths || []).reduce((sum: number, m: any) => sum + (m.daysWorked || 0), 0),

        combinedRows,
        totalIncome: (settlement.finalCalculation.totalPayable).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        totalDeductions: (settlement.finalCalculation.totalDeductions).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        netAmount: netAmountFormatted,
        netPayWords: `(${currencyWord} ${netPayWords} Only)`,
        remarks: settlement.remarks || 'FULL AND FINAL SETTLEMENT'
    };

    let browser;
    try {
        const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'finalSettlement.hbs');
        const templateHtml = await fsPromises.readFile(templatePath, 'utf-8');
        const compiledTemplate = handlebars.compile(templateHtml);
        const html = compiledTemplate(templateData);

        browser = await puppeteer.launch(getPuppeteerLaunchOptions());

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load' });
        await page.waitForNetworkIdle({ concurrency: 0 });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' }
        });

        await fsPromises.writeFile(outputPdfPath, pdfBuffer);

        const gcpResult = await uploadFileToGCP({
            filePath: outputPdfPath,
            fileName: `${fnfBaseName}.pdf`,
            employeeId: settlement.employeeId.toString(),
            category: 'Settlement',
            type: 'FNF Letter'
        });
        console.log(gcpResult, "gcpResult");
        if (!gcpResult.success) {
            throw new Error(`GCP Upload failed: ${gcpResult.error}`);
        }

        return gcpResult.fileUrl!;
    } catch (error) {
        console.error('FNF Puppeteer Helper FATAL ERROR:', error);
        throw error;
    } finally {
        if (browser) await browser.close();
        try {
            if (fs.existsSync(outputPdfPath)) {
                await fsPromises.unlink(outputPdfPath);
            }
        } catch (cleanupErr) {
            console.warn('Cleanup of temp Puppeteer PDF failed', cleanupErr);
        }
    }
}
