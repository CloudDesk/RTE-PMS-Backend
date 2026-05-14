import { Types } from "mongoose";
import * as fsPromises from "fs/promises";
import path from 'path';
import handlebars from 'handlebars';
import { RequestContext } from "../types/context";
import { BaseService } from "./base.service";
import { User, Payroll, LOV } from "../models";
import { Document } from "../models/document.model";
import { uploadFileToGCP, deleteFileFromGCP } from "../utilis/gcpStorage";
import { formatCurrency } from "../utilis/currency";
import { formatDateToDDMMYYYY } from "../utilis/dates";
import { cleanupPayslipTempFile, getPayslipTempFilePath, logPayslipTempFileStats, renderPayslipPdf } from "./payslip-pdf-runtime";

interface IPayslipGenerationResult {
    userId: string;
    status: string;
    documentId?: string;
    pdfPath?: string;
    error?: string;
}

interface IBulkGenerationResult {
    success: boolean;
    payslips: IPayslipGenerationResult[];
    summary: {
        total: number;
        generated: number;
        failed: number;
        updated: number;
    };
}

interface IdentityDocumentResult {
    panNumber?: string;
    pfNumber?: string;
    pfUan?: string;
}

interface PayslipLogContext {
    userId: string;
    month: number;
    year: number;
}

export class PayslipPdfService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }

    async generatePayslip(month: number, year: number, userIds: string[]): Promise<IBulkGenerationResult> {
        if (month < 1 || month > 12 || year < 2000 || year > 2100) {
            throw new Error('Invalid month (1-12) or year (2000-2100).');
        }

        const lastDayOfMonth = new Date(year, month, 0);
        const baseLogContext = { month, year };
        const employees = await this.measureStep(
            baseLogContext,
            'fetch_employee_data',
            async () => User.find({
                _id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
                joiningDate: { $lt: lastDayOfMonth },
            }).populate('departmentId').lean()
        );

        if (!employees.length) {
            throw new Error('No eligible employees found for payslip generation.');
        }

        const payrolls = await this.measureStep(
            baseLogContext,
            'fetch_payroll_data',
            async () => Payroll.find({
                month,
                year,
                employeeId: { $in: userIds.map((id) => new Types.ObjectId(id)) },
                status: 'Completed',
            }).lean()
        );

        if (!payrolls.length) {
            throw new Error('No payroll data found for the specified users.');
        }

        const [departmentLov, locationLov] = await this.measureStep(
            baseLogContext,
            'fetch_lov_mappings',
            async () => Promise.all([
                LOV.findOne({ type: 'department' }).lean(),
                LOV.findOne({ type: 'location' }).lean()
            ])
        );

        const departmentMap: Record<string, string> = {};
        const locationMap: Record<string, string> = {};

        departmentLov?.values?.forEach(v => { departmentMap[v.value] = v.label; });
        locationLov?.values?.forEach(v => { locationMap[v.value] = v.label; });

        const results: IPayslipGenerationResult[] = [];

        for (const employee of employees) {
            const logContext: PayslipLogContext = {
                userId: employee._id.toString(),
                month,
                year
            };

            try {
                const payroll = payrolls.find((p) => p.employeeId.toString() === employee._id.toString());
                if (!payroll) {
                    this.logInfo(logContext, 'fetch_payroll_data', { status: 'No Payroll Found' });
                    results.push({ userId: employee._id.toString(), status: 'No Payroll Found' });
                    continue;
                }

                const monthStr = month <= 9 ? `0${month}` : `${month}`;
                const cleanName = employee.name.replace(/[^a-zA-Z0-9]/g, '_');
                const filename = `Doc_Payslip_${employee._id.toString().slice(-5)}_${cleanName}_${year}_${monthStr}.pdf`;
                
                const tempFilePath = await this.measureStep(
                    logContext,
                    'prepare_temp_file',
                    async () => getPayslipTempFilePath(filename)
                );

                try {
                    await this.generatePayslipHtmlToPdf(employee, payroll, tempFilePath, { departmentMap, locationMap }, logContext);

                    await this.measureStep(
                        logContext,
                        'temp_file_stats',
                        async () => logPayslipTempFileStats(tempFilePath, logContext)
                    );

                    const gcpResult = await this.measureStep(
                        logContext,
                        'upload_to_gcp',
                        async () => uploadFileToGCP({
                            filePath: tempFilePath,
                            fileName: filename,
                            employeeId: employee._id.toString(),
                            category: 'Payroll',
                            type: 'Payslip'
                        })
                    );

                    if (!gcpResult.success) {
                        throw new Error(`Failed to upload payslip to GCP: ${gcpResult.error}`);
                    }

                    const fileUrl = gcpResult.fileUrl!;

                    const document = await this.measureStep(
                        logContext,
                        'save_document',
                        async () => {
                            let existingDocument = await Document.findOne({
                                employeeId: new Types.ObjectId(employee._id),
                                type: 'Payslip',
                                'metadata.payslip.month': month,
                                'metadata.payslip.year': year,
                            });

                            const documentData = {
                                employeeId: new Types.ObjectId(employee._id),
                                type: 'Payslip' as const,
                                category: 'Payroll' as const,
                                fileName: filename,
                                filePath: fileUrl,
                                tags: ['Payslip', `${year}`, `month-${month}`],
                                uploadDate: new Date(),
                                uploadedBy: new Types.ObjectId(this.context.user?._id || (employee._id as string)),
                                version: existingDocument ? (existingDocument.version || 1) + 1 : 1,
                                accessLevel: 'Private' as const,
                                status: 'Generated' as const,
                                metadata: {
                                    payslip: {
                                        payrollId: payroll._id,
                                        monthYear: `${year}-${monthStr}`,
                                        month,
                                        year,
                                        netSalary: payroll.netSalary,
                                        paySummary: {
                                            gross: payroll.monthlyGross,
                                            net: payroll.netSalary,
                                            deductions: payroll.totalDeductions,
                                            bonus: payroll.bonus || 0,
                                            reimbursement: payroll.reimbursement || 0,
                                        },
                                        presentDays: payroll.presentDays,
                                        totalDays: payroll.totalDaysInMonth,
                                        payableDays: payroll.payableDays,
                                        isExport: false,
                                    },
                                },
                                auditLog: [
                                    ...(existingDocument?.auditLog || []),
                                    {
                                        action: 'Generate' as const,
                                        performedBy: new Types.ObjectId(this.context.user?._id || (employee._id as string)),
                                        timestamp: new Date(),
                                        details: `Payslip generated using HTML-to-PDF for ${employee.name} for ${month}-${year}`,
                                    },
                                ],
                            };

                            if (existingDocument) {
                                if (existingDocument.filePath) {
                                    try {
                                        await deleteFileFromGCP(existingDocument.filePath);
                                    } catch (err) {
                                        const message = err instanceof Error ? err.message : String(err);
                                        this.logWarn(logContext, 'delete_old_gcp_file', {
                                            filePath: existingDocument.filePath,
                                            message
                                        });
                                    }
                                }
                                Object.assign(existingDocument, documentData);
                            } else {
                                existingDocument = new Document(documentData);
                            }

                            await existingDocument.save();
                            return existingDocument;
                        }
                    );

                    results.push({
                        userId: employee._id.toString(),
                        status: 'Generated',
                        documentId: document._id.toString(),
                    });
                } finally {
                    await this.measureStep(
                        logContext,
                        'cleanup',
                        async () => cleanupPayslipTempFile(tempFilePath, logContext)
                    );
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.logError(logContext, 'generate_payslip', message);
                results.push({
                    userId: employee._id.toString(),
                    status: 'Error',
                    error: message,
                });
            }
        }

        return {
            success: true,
            payslips: results,
            summary: {
                total: userIds.length,
                generated: results.filter((r) => r.status === 'Generated').length,
                failed: results.filter((r) => r.status === 'Error').length,
                updated: results.filter((r) => r.status === 'Generated' && r.documentId).length,
            },
        };
    }

    private async generatePayslipHtmlToPdf(
        employee: any,
        payroll: any,
        outputPath: string,
        lovMaps: { departmentMap: Record<string, string>; locationMap: Record<string, string> },
        logContext: PayslipLogContext
    ): Promise<void> {
        const normalizedCountry = (payroll.country as string)?.toUpperCase() || 'IN';
        const isUaePayroll = normalizedCountry === 'AE';
        const isConsultant = payroll.isConsultancy === true || employee.isConsultancy === true;

        const sanitizeText = (value: unknown): string | undefined => {
            if (value === undefined || value === null) return undefined;
            const text = String(value).trim();
            if (!text || text === '-' || ['undefined', 'null', 'n/a', 'na'].includes(text.toLowerCase())) return undefined;
            return text;
        };

        const formatLabel = (input: any, type?: 'department' | 'location'): string => {
            if (typeof input === 'object' && input?.name) return input.name;

            const sanitized = sanitizeText(input);
            if (!sanitized) return '-';

            // Check LOV mapping first
            if (type === 'department' && lovMaps.departmentMap[sanitized]) return lovMaps.departmentMap[sanitized];
            if (type === 'location' && lovMaps.locationMap[sanitized]) return lovMaps.locationMap[sanitized];

            return sanitized
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        };

        const sanitizeAmount = (value: unknown): number => {
            if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
            if (typeof value === 'string') {
                const numeric = Number(value.trim().replace(/,/g, ''));
                return Number.isFinite(numeric) ? numeric : 0;
            }
            return 0;
        };

        const activeBankData = employee.bankDetails?.find((bank: any) => bank?.isActive);
        const govtIds = await this.getIdentityDocuments(employee._id.toString());

        // Core values mapped from master service logic
        const basicValue = isUaePayroll ? sanitizeAmount(payroll.basic) : (payroll.basic || 0);
        const hraValue = isUaePayroll ? sanitizeAmount(payroll.hra) : (payroll.hra || 0);
        const daValue = isUaePayroll ? sanitizeAmount(payroll.da) : (payroll.da || 0);
        const otherAllowanceValue = isUaePayroll ? sanitizeAmount(payroll.otherAllowance) : (payroll.otherAllowance || 0);
        const travelAllowanceValue = isUaePayroll ? sanitizeAmount(payroll.travelAllowance) : (payroll.travelAllowance ?? 0);
        const reimbursementValue = isUaePayroll ? sanitizeAmount(payroll.reimbursement) : (payroll.reimbursement || 0);
        const holdSalaryValue = isUaePayroll ? sanitizeAmount(payroll.holdSalary) : (payroll.holdSalary || 0);
        const airTicketAllowanceValue = sanitizeAmount(payroll.airTicketAllowance);
        const medicalAllowanceValue = sanitizeAmount(payroll.medicalAllowance);

        const assignedBasicValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.basic) : (payroll.assigned?.basic || 0);
        const assignedHraValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.hra) : (payroll.assigned?.hra || 0);
        const assignedOtherAllowanceValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.otherAllowance) : (payroll.assigned?.otherAllowance || 0);
        const assignedTravelAllowanceValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.travelAllowance) : (payroll.assigned?.travelAllowance ?? 0);
        const assignedReimbursementValue = isUaePayroll ? sanitizeAmount(payroll.assigned?.reimbursementAllowance) : (payroll.assigned?.reimbursementAllowance || 0);
        const assignedAirTicketValue = sanitizeAmount(payroll.assigned?.airTicketAllowance);
        const assignedMedicalValue = sanitizeAmount(payroll.assigned?.medicalAllowance);

        const employeeDesignation = isUaePayroll
            ? (sanitizeText(employee.specificRole) || formatLabel(employee.role))
            : (employee.specificRole || formatLabel(employee.role));

        const customReimbursementsTotal = (payroll.customReimbursements || []).reduce(
            (sum: number, item: any) => sum + sanitizeAmount(item?.value),
            0
        );
        const customDeductionsTotal = (payroll.customDeductions || []).reduce(
            (sum: number, item: any) => sum + sanitizeAmount(item?.value),
            0
        );

        const totalEarnings =
            basicValue + hraValue + otherAllowanceValue + daValue + travelAllowanceValue + holdSalaryValue + customReimbursementsTotal;

        const netSalaryValue = isUaePayroll ? sanitizeAmount(payroll.netSalary) : (payroll.netSalary || 0);
        const netPayNumeric = Math.round(netSalaryValue);
        const absoluteNetPay = Math.abs(netPayNumeric);
        const netPayWordsRaw = await this.numberToWords(absoluteNetPay);

        let netPayWords = "";
        if (netPayNumeric === 0) {
            netPayWords = `${isUaePayroll ? 'Dirhams' : 'Rupees'} zero only`;
        } else if (netPayNumeric > 0) {
            netPayWords = `${isUaePayroll ? 'Dirhams' : 'Rupees'} ${netPayWordsRaw} only`;
        } else {
            // Handle negative values for "words" sentence
            netPayWords = `Minus ${isUaePayroll ? 'Dirhams' : 'Rupees'} ${netPayWordsRaw} only`;
        }

        const earnActual = {
            basic: formatCurrency(basicValue, payroll.country),
            hra: formatCurrency(hraValue, payroll.country),
            other: formatCurrency(otherAllowanceValue, payroll.country),
            travelAllowance: formatCurrency(travelAllowanceValue, payroll.country),
            reimbursement: formatCurrency(reimbursementValue, payroll.country),
            holdSalary: holdSalaryValue > 0 ? formatCurrency(holdSalaryValue, payroll.country) : undefined,
            airTicketAllowance: formatCurrency(airTicketAllowanceValue, payroll.country),
            medicalAllowance: formatCurrency(medicalAllowanceValue, payroll.country),
            total: formatCurrency(totalEarnings, payroll.country)
        };

        const earnFull = {
            basic: formatCurrency(assignedBasicValue, payroll.country),
            hra: formatCurrency(assignedHraValue, payroll.country),
            other: formatCurrency(assignedOtherAllowanceValue, payroll.country),
            travelAllowance: formatCurrency(assignedTravelAllowanceValue, payroll.country),
            reimbursement: formatCurrency(assignedReimbursementValue, payroll.country),
            holdSalary: holdSalaryValue > 0 ? formatCurrency(holdSalaryValue, payroll.country) : undefined,
            airTicketAllowance: formatCurrency(assignedAirTicketValue, payroll.country),
            medicalAllowance: formatCurrency(assignedMedicalValue, payroll.country),
            total: formatCurrency(
                assignedBasicValue +
                assignedHraValue +
                assignedOtherAllowanceValue +
                assignedTravelAllowanceValue +
                holdSalaryValue +
                customReimbursementsTotal,
                payroll.country
            )
        };

        const deduction = (() => {
            const pf = Number(payroll.epfEmployee || 0);
            const lop = Number(payroll.leaveDeductions || 0);
            const pt = Number(payroll.professionalTax || 0);
            const it = Number(payroll.incomeTax || 0);
            const tds = Number(payroll.tdsDeduction || 0);
            const notice = Number(payroll.noticePeriodRecovery || 0);

            const obj: any = {
                total: formatCurrency((payroll.totalDeductions || 0) + customDeductionsTotal, payroll.country)
            };
            if (pf > 0) obj.pf = formatCurrency(pf, payroll.country);
            if (lop > 0) obj.lop = formatCurrency(lop, payroll.country);
            if (pt > 0) obj.pt = formatCurrency(pt, payroll.country);
            if (it > 0) obj.it = formatCurrency(it, payroll.country);
            if (tds > 0) obj.tds = formatCurrency(tds, payroll.country);
            if (notice > 0) obj.noticeRecovery = formatCurrency(notice, payroll.country);

            return obj;
        })();

        const templateData = {
            empName: sanitizeText(employee.name) || '-',
            empJoinDate: formatDateToDDMMYYYY(employee.joiningDate),
            empRole: employeeDesignation,
            empDes: employeeDesignation || '-',
            empDept: formatLabel(employee.departmentId, 'department'),
            empLocation: formatLabel(employee.location, 'location'),
            empNo: sanitizeText(employee.employeeCode) || sanitizeText(employee.biometricId) || '-',
            bankName: sanitizeText(activeBankData?.bankName) || '-',
            bankAccNo: sanitizeText(activeBankData?.accountNumber) || '-',
            panNo: sanitizeText(govtIds.panNumber) || sanitizeText(employee.governmentIds?.pan?.number) || '-',
            pfNo: sanitizeText(employee.pfNumber) || sanitizeText(govtIds.pfNumber) || sanitizeText(employee.governmentIds?.pf?.number) || '-',
            pfUan: sanitizeText(employee.uanNumber) || sanitizeText(govtIds.pfUan) || sanitizeText(employee.governmentIds?.pf?.uan) || '-',
            payMonth: this.getMonthName(payroll.month),
            payYear: payroll.year.toString(),

            daysPresent: payroll.presentDays || 0,
            daysLOP: payroll.LOPDays || 0,
            lopDays: payroll.LOPDays || 0,
            effectiveDays: payroll.payableDays || 0,
            effectiveWorkDays: payroll.payableDays || (payroll.totalDaysInMonth - (payroll.LOPDays || 0)) || 0,
            monthDays: payroll.totalDaysInMonth || 0,

            earnActual: earnActual,
            earnFull: earnFull,

            income: {
                total: earnActual.total,
                fullTotal: earnFull.total
            },
            deduction: deduction,

            allEarnings: (() => {
                const arr: any[] = [];
                
                const pushIfValid = (label: string, actual: number, full: number) => {
                    if (actual > 0 || full > 0) {
                        arr.push({ label, fullAmount: formatCurrency(full, payroll.country), actualAmount: formatCurrency(actual, payroll.country) });
                    }
                };

                if (isConsultant) {
                    // Consultants: Group Basic, HRA, and Other Allowance into "CONSULTANCY FEES"
                    const consolidatedFeesActual = basicValue + hraValue + otherAllowanceValue;
                    const consolidatedFeesFull = assignedBasicValue + assignedHraValue + assignedOtherAllowanceValue;
                    pushIfValid('CONSULTANCY FEES', consolidatedFeesActual, consolidatedFeesFull);
                } else {
                    // Regular Employees: Existing logic (Basic, HRA, DA, Other)
                    pushIfValid('BASIC', basicValue, assignedBasicValue);
                    pushIfValid('HRA', hraValue, assignedHraValue);
                    pushIfValid('DEARNESS ALLOWANCE', daValue, 0);
                    pushIfValid('OTHER ALLOWANCE', otherAllowanceValue, assignedOtherAllowanceValue);
                }

                // Shared components (Travel, Reimbursement, etc. - usually consultants don't have these but handled for safety)
                pushIfValid('TRAVEL ALLOWANCE', travelAllowanceValue, assignedTravelAllowanceValue);
                pushIfValid('HOLD SALARY', holdSalaryValue, holdSalaryValue);
                pushIfValid('REIMBURSEMENT', reimbursementValue, assignedReimbursementValue);
                pushIfValid('AIR TICKET ALLOWANCE', airTicketAllowanceValue, assignedAirTicketValue);
                pushIfValid('MEDICAL ALLOWANCE', medicalAllowanceValue, assignedMedicalValue);
                
                if (payroll.customReimbursements && payroll.customReimbursements.length > 0) {
                    payroll.customReimbursements.forEach((item: any) => {
                        if (sanitizeAmount(item?.value) > 0) {
                            pushIfValid(String(item.name || '').toUpperCase(), sanitizeAmount(item.value), sanitizeAmount(item.value));
                        }
                    });
                }

                return arr;
            })(),

            allDeductions: (() => {
                const arr: any[] = [];
                const pf = Number(payroll.epfEmployee || 0);
                const lop = Number(payroll.leaveDeductions || 0);
                const pt = Number(payroll.professionalTax || 0);
                const it = Number(payroll.incomeTax || 0);
                const tds = Number(payroll.tdsDeduction || 0);
                const notice = Number(payroll.noticePeriodRecovery || 0);

                if (isConsultant) {
                    // Consultants: Show TDS value as "INCOME TAX"
                    if (tds > 0) arr.push({ label: 'INCOME TAX', amount: formatCurrency(tds, payroll.country) });
                    if (lop > 0) arr.push({ label: 'LOSS OF PAY', amount: formatCurrency(lop, payroll.country) });
                    if (notice > 0) arr.push({ label: 'NOTICE PERIOD RECOVERY', amount: formatCurrency(notice, payroll.country) });
                } else {
                    // Regular Employees: Existing logic
                    if (pf > 0) arr.push({ label: 'PROVIDENT FUND', amount: formatCurrency(pf, payroll.country) });
                    if (lop > 0) arr.push({ label: 'LOSS OF PAY', amount: formatCurrency(lop, payroll.country) });
                    if (it > 0) arr.push({ label: 'INCOME TAX', amount: formatCurrency(it, payroll.country) });
                    if (pt > 0) arr.push({ label: 'PROFESSIONAL TAX', amount: formatCurrency(pt, payroll.country) });
                    if (tds > 0) arr.push({ label: 'TDS (1%)', amount: formatCurrency(tds, payroll.country) });
                    if (notice > 0) arr.push({ label: 'NOTICE PERIOD RECOVERY', amount: formatCurrency(notice, payroll.country) });
                }

                if (payroll.customDeductions && payroll.customDeductions.length > 0) {
                    payroll.customDeductions.forEach((item: any) => {
                        if (sanitizeAmount(item?.value) > 0) {
                            arr.push({ label: String(item.name || '').toUpperCase(), amount: formatCurrency(sanitizeAmount(item.value), payroll.country) });
                        }
                    });
                }

                return arr;
            })(),

            netPay: formatCurrency(payroll.netSalary || 0, payroll.country),
            netPayWords: netPayWords,
            isConsultant: isConsultant,
            isUae: isUaePayroll,
            currencyCode: isUaePayroll ? 'AED' : 'INR'
        };

        const html = await this.measureStep(
            logContext,
            'prepare_template',
            async () => {
                const templatePath = path.join(__dirname, '..', 'emails', 'templates', 'payslip.hbs');
                const templateHtml = await fsPromises.readFile(templatePath, 'utf-8');
                const compiledTemplate = handlebars.compile(templateHtml);
                return compiledTemplate(templateData);
            }
        );

        await renderPayslipPdf({
            logContext,
            outputPath,
            renderPage: async (page) => {
                await this.measureStep(
                    logContext,
                    'set_page_viewport',
                    async () => page.setViewport({ width: 718, height: 5000, deviceScaleFactor: 1 })
                );

                await this.measureStep(
                    logContext,
                    'set_page_content',
                    async () => page.setContent(html, { waitUntil: 'networkidle0' })
                );

                const contentHeightPx = await page.evaluate((): number => {
                    const slip = document.querySelector('.slip') as HTMLElement | null;
                    const footer = document.querySelector('.footer-note') as HTMLElement | null;
                    if (footer) {
                        const rect = footer.getBoundingClientRect();
                        return Math.ceil(rect.bottom) + 16;
                    }
                    if (slip) {
                        const rect = slip.getBoundingClientRect();
                        return Math.ceil(rect.bottom) + 16;
                    }
                    return document.body.scrollHeight;
                });

                const heightMm = Math.ceil(contentHeightPx * 0.264583) + 12;
                return {
                    width: '210mm',
                    height: `${heightMm}mm`,
                    printBackground: true,
                    margin: { top: '8mm', right: '10mm', bottom: '8mm', left: '10mm' }
                };
            }
        });
    }

    private getMonthName(monthNumber: number): string {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return monthNames[monthNumber - 1] || 'Unknown';
    }

    private async numberToWords(num: number): Promise<string> {
        if (num === 0) return "zero";
        const belowTwenty = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
        const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
        const thousandUnits = ["", "thousand", "million", "billion"];

        function helper(n: number): string {
            if (n === 0) return "";
            if (n < 20) return belowTwenty[n] + " ";
            if (n < 100) return tens[Math.floor(n / 10)] + " " + helper(n % 10);
            return belowTwenty[Math.floor(n / 100)] + " hundred " + helper(n % 100);
        }

        let result = "";
        let unitIndex = 0;
        let tempNum = num;
        while (tempNum > 0) {
            let chunk = tempNum % 1000;
            if (chunk !== 0) {
                result = helper(chunk) + thousandUnits[unitIndex] + " " + result;
            }
            tempNum = Math.floor(tempNum / 1000);
            unitIndex++;
        }
        return result.trim();
    }

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

            docs.forEach((doc: any) => {
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
            return {};
        }
    };

    private logInfo(context: Partial<PayslipLogContext>, step: string, extra?: Record<string, unknown>): void {
        console.log(JSON.stringify({
            scope: 'payslip_pdf_service',
            level: 'info',
            step,
            ...context,
            ...(extra || {})
        }));
    }

    private logWarn(context: Partial<PayslipLogContext>, step: string, extra?: Record<string, unknown>): void {
        console.warn(JSON.stringify({
            scope: 'payslip_pdf_service',
            level: 'warn',
            step,
            ...context,
            ...(extra || {})
        }));
    }

    private logError(context: Partial<PayslipLogContext>, step: string, message: string): void {
        console.error(JSON.stringify({
            scope: 'payslip_pdf_service',
            level: 'error',
            step,
            ...context,
            message
        }));
    }

    private async measureStep<T>(context: Partial<PayslipLogContext>, step: string, operation: () => Promise<T>): Promise<T> {
        const startedAt = Date.now();
        try {
            const result = await operation();
            this.logInfo(context, step, { durationMs: Date.now() - startedAt });
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(JSON.stringify({
                scope: 'payslip_pdf_service',
                level: 'error',
                step,
                ...context,
                durationMs: Date.now() - startedAt,
                message
            }));
            throw error;
        }
    }
}

