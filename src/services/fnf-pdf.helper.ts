import { uploadFileToGCP } from '../utilis/gcpStorage';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { formatCurrency } from '../utilis/currency';

// LibreOffice PDF conversion removed - functionality no longer available
const convertToPdf = () => {
    throw new Error('LibreOffice PDF conversion is no longer available. Please use an alternative PDF generation method.');
};

// Helper to match Payslip Service Logic
async function convertDocxToPDF(docxPath: string, pdfPath: string): Promise<void> {
    try {
        // Read the DOCX file
        const docxBuffer = fs.readFileSync(docxPath);

        // Convert to PDF using promisified function
        const pdfBuffer = await convertToPdf(docxBuffer, '.pdf', undefined);

        // Write PDF to file
        fs.writeFileSync(pdfPath, pdfBuffer as Buffer);
        console.log(`PDF generated successfully at: ${pdfPath}`);
    } catch (error) {
        console.error('PDF Conversion Error:', error);
        throw error;
    }
}

/**
 * Generate FNF Letter PDF
 */
export async function generateFNFLetter(settlement: any, employee: any): Promise<string> {
    const fnfDir = path.join(process.cwd(), 'uploads');

    if (!fs.existsSync("uploads")) {
        fs.mkdirSync("uploads", { recursive: true });
    }

    const fnfBaseName = `FNF_${settlement.employeeCode}_${Date.now()}`;
    const outputDocxPath = path.join(fnfDir, `${fnfBaseName}.docx`);
    const outputPdfPath = path.join(fnfDir, `${fnfBaseName}.pdf`);

    // Helper functions


    const formatDate = (date: Date | string | undefined): string => {
        if (!date) return 'N/A';
        const d = new Date(date);
        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const numberToWords = (num: number): string => {
        if (num === 0) return "zero";
        const belowTwenty = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
        const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
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
    };

    // Calculate Net Pay in Words
    const netAmount = Math.round(settlement.finalCalculation.netAmount);
    // Use absolute value for word conversion to handle negative net pay (recoveries)
    const netPayWords = numberToWords(Math.abs(netAmount));
    const currencyWord = (employee.country === 'AE' || employee.country === 'United Arab Emirates') ? 'Dirhams' : 'Rupees';

    // ✅ Calculate component-wise breakdown from unpaid months
    // ✅ Calculate component-wise breakdown from unpaid months
    const unpaidBasic = settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.components?.basic || 0), 0);
    const unpaidHRA = settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.components?.hra || 0), 0);
    const unpaidConveyance = settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.components?.conveyance || 0), 0);
    const unpaidOtherAllowances = settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.components?.otherAllowances || 0), 0);
    const totalLOPAmount = settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.lopAmount || 0), 0);

    // Prepare template data matching the user's PDF image structure
    const templateData = {
        // Header / Employee Details
        empNo: settlement.employeeCode,
        empName: settlement.employeeName,
        empDept: (employee as any).department || (employee as any).departmentId || 'N/A',
        empDesig: (employee as any).designation || (employee as any).specificRole || (employee as any).role || 'N/A',
        empLocation: (employee as any).location || 'Chennai',
        joiningDate: formatDate((employee as any).joiningDate),
        resignDate: formatDate(settlement.resignationSubmittedOn),
        leavingDate: formatDate(settlement.leavingDate),
        remarks: settlement.remarks || '',

        // ✅ FIX: Show 0 instead of null for numeric fields
        noticePeriod: settlement.noticePeriodDays || 0,
        noticeAdjustable: settlement.daysServed || 0, // ✅ User Requirement: Show Notice served days

        // Days Calculation - strictly use UNPAID MONTHS (exclude holdPayrolls as per user requirement)
        plDays: settlement.leaveBalance?.reduce((sum: number, l: any) => sum + (l.encashDays || 0), 0) || 0,
        salaryDays: settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.daysWorked || 0), 0),
        monthDays: settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.totalDays || 0), 0),
        lopDays: settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.lopDays || 0), 0),

        // ✅ Effective workdays - strictly use UNPAID MONTHS (exclude holdPayrolls as per user requirement)
        effectiveWorkdays: settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.daysWorked || 0), 0),

        // ✅ INCOME / EARNINGS (Payslip Style - Only add properties if value > 0)
        income: (() => {
            const iObj: any = {
                total: formatCurrency(settlement.finalCalculation.totalPayable, 'IN')
            };

            // Only add properties if value > 0 (prevents empty rows in template)
            if (unpaidBasic > 0) {
                iObj.unpaidBasic = formatCurrency(unpaidBasic, 'IN');
            }
            if (unpaidHRA > 0) {
                iObj.unpaidHRA = formatCurrency(unpaidHRA, 'IN');
            }
            if (unpaidConveyance > 0) {
                iObj.unpaidConveyance = formatCurrency(unpaidConveyance, 'IN');
            }
            if (unpaidOtherAllowances > 0) {
                iObj.unpaidOtherAllowance = formatCurrency(unpaidOtherAllowances, 'IN');
            }
            if (settlement.finalCalculation.holdSalaries > 0) {
                iObj.holdSalary = formatCurrency(settlement.finalCalculation.holdSalaries, 'IN');
            }
            if (settlement.finalCalculation.reimbursements > 0) {
                iObj.reimbursement = formatCurrency(settlement.finalCalculation.reimbursements, 'IN');
            }
            if (settlement.finalCalculation.leaveEncashment > 0) {
                iObj.leaveEncashment = formatCurrency(settlement.finalCalculation.leaveEncashment, 'IN');
            }
            if (settlement.finalCalculation.otherAdditions > 0) {
                iObj.otherAdditions = formatCurrency(settlement.finalCalculation.otherAdditions, 'IN');
            }

            return iObj;
        })(),

        // Totals (always show)
        totalIncome: formatCurrency(settlement.finalCalculation.totalPayable, 'IN'),
        totalDeductions: formatCurrency(settlement.finalCalculation.totalDeductions, 'IN'),

        // ✅ DEDUCTIONS Object (Only add properties if value > 0) - matches template placeholders
        deduction: (() => {
            const dObj: any = {
                total: formatCurrency(settlement.finalCalculation.totalDeductions, 'IN')
            };

            if ((settlement.finalCalculation as any).providentFund > 0) dObj.pf = formatCurrency((settlement.finalCalculation as any).providentFund, 'IN');
            if (settlement.finalCalculation.professionalTax > 0) dObj.pt = formatCurrency(settlement.finalCalculation.professionalTax, 'IN');
            if ((settlement.finalCalculation as any).incomeTax > 0) dObj.it = formatCurrency((settlement.finalCalculation as any).incomeTax, 'IN');
            if ((settlement.finalCalculation as any).esi > 0) dObj.esi = formatCurrency((settlement.finalCalculation as any).esi, 'IN');
            if (totalLOPAmount > 0) dObj.lopDeduction = formatCurrency(totalLOPAmount, 'IN'); // ✅ Matches template {#lopDeduction}
            if (settlement.finalCalculation.noticePeriodRecovery > 0) dObj.noticeRecovery = formatCurrency(settlement.finalCalculation.noticePeriodRecovery, 'IN');
            if (settlement.finalCalculation.otherDeductions > 0) dObj.otherDeduction = formatCurrency(settlement.finalCalculation.otherDeductions, 'IN');

            return dObj;
        })(),

        // Net Summary
        netPay: formatCurrency(netAmount, 'IN'),
        netPayWords: `${currencyWord} ${netPayWords} Only`,

        // Earnings list breakdown (only non-zero items) - matches payslip format
        allEarnings: (() => {
            const earningsArray: any[] = [];

            if (unpaidBasic > 0) {
                earningsArray.push({ label: 'Basic', amount: formatCurrency(unpaidBasic, 'IN') });
            }
            if (unpaidHRA > 0) {
                earningsArray.push({ label: 'HRA', amount: formatCurrency(unpaidHRA, 'IN') });
            }
            if (settlement.finalCalculation.holdSalaries > 0) {
                earningsArray.push({ label: 'Hold Salary', amount: formatCurrency(settlement.finalCalculation.holdSalaries, 'IN') });
            }
            if (unpaidConveyance > 0) {
                earningsArray.push({ label: 'Conveyance Allowance', amount: formatCurrency(unpaidConveyance, 'IN') });
            }
            if (unpaidOtherAllowances > 0) {
                earningsArray.push({ label: 'Other Allowance', amount: formatCurrency(unpaidOtherAllowances, 'IN') });
            }
            if (settlement.finalCalculation.leaveEncashment > 0) {
                earningsArray.push({ label: 'Leave Encashment', amount: formatCurrency(settlement.finalCalculation.leaveEncashment, 'IN') });
            }
            if (settlement.finalCalculation.reimbursements !== 0) {
                earningsArray.push({ label: 'Reimbursements', amount: formatCurrency(settlement.finalCalculation.reimbursements, 'IN') });
            }
            // Add other additions (detailed breakdown)
            if (settlement.otherAdditions && settlement.otherAdditions.length > 0) {
                settlement.otherAdditions
                    .filter((a: any) => (a.amount || 0) > 0)
                    .forEach((a: any) => {
                        earningsArray.push({
                            label: a.description || 'Other Addition',
                            amount: formatCurrency(a.amount, 'IN')
                        });
                    });
            } else if (settlement.finalCalculation.otherAdditions > 0) {
                // Fallback if array is missing but total exists
                earningsArray.push({ label: 'Other Additions', amount: formatCurrency(settlement.finalCalculation.otherAdditions, 'IN') });
            }
            if ((settlement.finalCalculation as any).gratuity > 0) {
                earningsArray.push({ label: 'Gratuity', amount: formatCurrency((settlement.finalCalculation as any).gratuity, 'IN') });
            }

            // Check for variableEarnings array if it exists
            if (settlement.variableEarnings && Array.isArray(settlement.variableEarnings)) {
                settlement.variableEarnings
                    .filter((e: any) => (e.amount || 0) > 0)
                    .forEach((e: any) => {
                        // Avoid duplicates if already added (basic check)
                        const isDuplicate = earningsArray.some(existing => existing.label.toLowerCase() === e.label.toLowerCase());
                        if (!isDuplicate) {
                            earningsArray.push({
                                label: e.label,
                                amount: formatCurrency(e.amount, 'IN')
                            });
                        }
                    });
            }

            return earningsArray;
        })(),

        // Deductions array for template looping (only non-zero items) - matches payslip format
        allDeductions: (() => {
            const deductionsArray: any[] = [];

            const pfVal = Number((settlement.finalCalculation as any).providentFund ?? 0);
            const ptVal = Number(settlement.finalCalculation.professionalTax ?? 0);
            const itVal = Number((settlement.finalCalculation as any).incomeTax ?? 0);
            const esiVal = Number((settlement.finalCalculation as any).esi ?? 0);
            const noticeVal = Number(settlement.finalCalculation.noticePeriodRecovery ?? 0);
            const lopVal = Number(totalLOPAmount ?? 0);

            if (pfVal > 0) {
                deductionsArray.push({
                    label: 'Provident Fund',
                    amount: formatCurrency(pfVal, 'IN')
                });
            }
            if (lopVal > 0) {
                deductionsArray.push({
                    label: 'Loss of Pay',
                    amount: formatCurrency(lopVal, 'IN')
                });
            }
            if (itVal > 0) {
                deductionsArray.push({
                    label: 'Income Tax',
                    amount: formatCurrency(itVal, 'IN')
                });
            }
            if (ptVal > 0) {
                deductionsArray.push({
                    label: 'Professional Tax',
                    amount: formatCurrency(ptVal, 'IN')
                });
            }
            if (esiVal > 0) {
                deductionsArray.push({
                    label: 'ESI',
                    amount: formatCurrency(esiVal, 'IN')
                });
            }
            if (noticeVal > 0) {
                deductionsArray.push({
                    label: 'Notice Period Recovery',
                    amount: formatCurrency(noticeVal, 'IN')
                });
            }

            // check for variableDeductions
            if (settlement.variableDeductions && Array.isArray(settlement.variableDeductions)) {
                settlement.variableDeductions
                    .filter((d: any) => (d.amount || 0) > 0)
                    .forEach((d: any) => {
                        // Avoid duplicates
                        const isDuplicate = deductionsArray.some(existing => existing.label.toLowerCase() === d.label.toLowerCase());
                        if (!isDuplicate) {
                            deductionsArray.push({
                                label: d.label,
                                amount: formatCurrency(d.amount, 'IN')
                            });
                        }
                    });
            }

            // Add other deductions if not already covered
            // Logic: standard otherDeductions array in settlement
            if (settlement.otherDeductions && settlement.otherDeductions.length > 0) {
                settlement.otherDeductions
                    .filter((d: any) => (d.amount || 0) > 0)
                    .forEach((d: any) => {
                        const label = d.description || d.label || 'Other Deduction';
                        // avoid simple duplicates by label
                        const isDuplicate = deductionsArray.some(x => x.label.toLowerCase() === label.toLowerCase());

                        if (!isDuplicate) {
                            deductionsArray.push({
                                label: label.toUpperCase(),
                                amount: formatCurrency(d.amount, 'IN')
                            });
                        }
                    });
            } else if (settlement.finalCalculation.otherDeductions > 0) {
                // Fallback if array is missing but total exists
                deductionsArray.push({
                    label: 'OTHER DEDUCTIONS',
                    amount: formatCurrency(settlement.finalCalculation.otherDeductions, 'IN')
                });
            }

            return deductionsArray;
        })(),
    };

    // 🔍 DEBUG: Console log template data
    console.log("=== PDF TEMPLATE DATA ===");
    console.log("Employee Info:", {
        empNo: templateData.empNo,
        empName: templateData.empName,
        empDept: templateData.empDept,
        empDesig: templateData.empDesig,
        empLocation: templateData.empLocation,
        joiningDate: templateData.joiningDate,
        resignDate: templateData.resignDate,
        leavingDate: templateData.leavingDate
    });
    console.log("Notice Period:", {
        noticePeriod: templateData.noticePeriod,
        noticeAdjustable: templateData.noticeAdjustable
    });
    console.log("Days Calculation:", {
        plDays: templateData.plDays,
        salaryDays: templateData.salaryDays,
        monthDays: templateData.monthDays,
        lopDays: templateData.lopDays,
        effectiveWorkdays: templateData.effectiveWorkdays
    });
    console.log("========================");

    try {
        console.log("=== START FNF PDF GENERATION ===");

        // Resolve FNF template
        const templateName = 'Final_Settlement_2.docx';
        const candidates = [
            path.join(process.cwd(), 'templates', templateName),
            path.join(process.cwd(), templateName),
        ];
        console.log("Looking for template in:", candidates);

        let inputPath: string | null = null;
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                inputPath = p;
                console.log("Template FOUND at:", inputPath);
                break;
            }
        }

        if (!inputPath) {
            console.error("TEMPLATE NOT FOUND! Checked:", candidates);
            throw new Error(
                "FNF_Template.docx not found. Place FNF_Template.docx in project root or in templates/ folder."
            );
        }

        console.log("Reading template file...");
        const content = fs.readFileSync(inputPath, "binary");
        console.log("Template read success. Size:", content.length);

        console.log("Initializing PizZip...");
        const zip = new PizZip(content);

        console.log("Initializing Docxtemplater...");
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            nullGetter: () => '',
        });

        console.log("Rendering Template...");
        doc.render(templateData);

        console.log("Generating DOCX buffer...");
        const updatedContent = doc.getZip().generate({ type: "nodebuffer" });

        console.log("Writing temp DOCX to:", outputDocxPath);
        fs.writeFileSync(outputDocxPath, updatedContent);

        console.log("Starting LibreOffice Conversion...");

        // USE HELPER METHOD HERE
        await convertDocxToPDF(outputDocxPath, outputPdfPath);

        console.log("PDF Verified Generated and Saved.");

        // Upload to GCP
        console.log("Uploading to GCP...");
        const gcpResult = await uploadFileToGCP({
            filePath: outputPdfPath,
            fileName: `${fnfBaseName}.pdf`,
            employeeId: settlement.employeeId.toString(),
            category: 'Settlement',
            type: 'FNF Letter'
        });
        console.log("GCP Upload Result:", gcpResult);

        // Cleanup
        try {
            await fsPromises.unlink(outputDocxPath);
            await fsPromises.unlink(outputPdfPath);
        } catch (e) { console.warn('Cleanup failed', e); }

        if (!gcpResult.success) {
            throw new Error(`GCP Upload failed: ${gcpResult.error}`);
        }
        return gcpResult.fileUrl!;

    } catch (error: any) {
        console.error('FNF PDF Generation FATAL ERROR:', error);
        return '';
    }
}
