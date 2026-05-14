import { uploadFileToGCP } from '../utilis/gcpStorage';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import handlebars from 'handlebars';
import { formatCurrency, numberToWords as standardNumberToWords } from '../utilis/currency';
import { getPuppeteerLaunchOptions } from '../utilis/puppeteer';

/**
 * Enhanced Number to Words for Indian Currency
 */
function numberToWords(num: number): string {
    const result = standardNumberToWords(num);
    // standardNumberToWords might need "Rupees only" suffix for professional documents
    return `${result} Rupees only`.replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Format Date with Ordinals (e.g., Aug 2nd, 2024)
 */
export function formatOrdinalDate(date: Date): string {
    const day = date.getDate();
    const month = date.toLocaleString('en-IN', { month: 'short' });
    const year = date.getFullYear();

    const ordinal = (n: number) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    return `${month} ${ordinal(day)}, ${year}`;
}

/**
 * Prepare Data for Hike Letter Template
 */
function prepareHikeLetterTemplateData(data: {
    employee: any,
    salaryAssignment: any,
    salaryStructure: any,
    signatory: { name: string, designation: string, signaturePath?: string },
    logoPath?: string,
}): any {
    const { employee, salaryAssignment, salaryStructure, signatory } = data;

    // Statutory Calculations
    const monthlyGross = salaryAssignment.monthlyGross;
    const basic = (monthlyGross * (salaryStructure.fixedEarnings.basicPercentage / 100));
    const hra = (monthlyGross * (salaryStructure.fixedEarnings.hraPercentage / 100));
    const otherAllowance = (monthlyGross * (salaryStructure.fixedEarnings.otherAllowancePercentage / 100));
    
    const subtotalFixedMonthly = basic + hra + otherAllowance;
    const subtotalFixedAnnual = subtotalFixedMonthly * 12;

    // PF Logic
    const epfConfig = salaryStructure.statutoryDeductions.epf;
    const totalEmployerPfMonthly = Math.min(basic, epfConfig.maxLimit) * (epfConfig.employerContribution / 100);
    const annualEmployerPf = totalEmployerPfMonthly * 12;

    const annualInsurance = (salaryAssignment as any).annualInsurance || 0;
    const annualSubtotalG = annualInsurance + annualEmployerPf;
    const totalCtc = subtotalFixedAnnual + annualSubtotalG;

    // Ensure we use IST (Asia/Kolkata) for current date to avoid UTC discrepancies
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    
    return {
        companyName: 'Cloud Desk Technology Pvt Ltd.', 
        letterDateOrdinal: formatOrdinalDate(nowIST),
        effectiveDateOrdinal: formatOrdinalDate(salaryAssignment.effectiveDate || nowIST),
        employeeName: employee.name,
        employeeCode: employee.employeeCode || employee._id.toString().slice(-5),
        
        monthlyBasic: Math.round(basic),
        annualBasic: Math.round(basic * 12),
        monthlyHra: Math.round(hra),
        annualHra: Math.round(hra * 12),
        monthlyOtherAllowance: Math.round(otherAllowance),
        annualOtherAllowance: Math.round(otherAllowance * 12),
        
        monthlySubtotalFixed: Math.round(subtotalFixedMonthly),
        annualSubtotalFixed: Math.round(subtotalFixedAnnual),
        
        annualInsurance: Math.round(annualInsurance),
        annualEmployerPf: Math.round(annualEmployerPf),
        annualSubtotalG: Math.round(annualSubtotalG),
        
        totalCtc: Math.round(totalCtc),
        totalCtcWords: numberToWords(Math.round(totalCtc)),
        effectiveDate: formatOrdinalDate(new Date(salaryAssignment.effectiveFrom || Date.now())),
        generatedDate: formatOrdinalDate(nowIST),
        
        signatoryName: signatory.name,
        signatoryDesignation: signatory.designation,
        hasAnnualComponents: annualSubtotalG > 0
    };
}

/**
 * Generate Bulk Hike Letter PDF via HTML to PDF (Puppeteer)
 */
export async function generateHikeLetterPDF(data: {
    employees: Array<{
        employee: any,
        salaryAssignment: any,
        salaryStructure: any
    }>,
    signatory: { name: string, designation: string, signaturePath?: string },
    logoPath?: string,
}): Promise<string> {
    const { employees, signatory, logoPath } = data;
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const firstEmp = employees[0].employee;
    const fileName = `HikeLetter_Preview_${firstEmp.employeeCode || firstEmp._id}_${Date.now()}.pdf`;
    const outputPdfPath = path.join(uploadsDir, fileName);

    let companyLogoUrl = 'https://storage.googleapis.com/tendlylogo/cd_logo_2%20(1).png';
    let signatureImageBase64: string | undefined;

    if (logoPath && fs.existsSync(logoPath)) {
        const logoBuffer = await fsPromises.readFile(logoPath);
        const ext = path.extname(logoPath).slice(1) || 'png';
        companyLogoUrl = `data:image/${ext};base64,${logoBuffer.toString('base64')}`;
    }

    if (signatory.signaturePath && fs.existsSync(signatory.signaturePath)) {
        const sigBuffer = await fsPromises.readFile(signatory.signaturePath);
        const ext = path.extname(signatory.signaturePath).slice(1) || 'png';
        signatureImageBase64 = `data:image/${ext};base64,${sigBuffer.toString('base64')}`;
    }

    let browser;
    try {
        const templatePath = path.join(process.cwd(), 'templates', 'hikeLetter.hbs');
        const templateHtml = await fsPromises.readFile(templatePath, 'utf-8');
        
        // Extract style and body content once
        const styleMatch = templateHtml.match(/<style>([\s\S]*?)<\/style>/);
        const bodyMatch = templateHtml.match(/<body>([\s\S]*?)<\/body>/);
        const style = styleMatch ? styleMatch[1] : '';
        const bodyInner = bodyMatch ? bodyMatch[1] : templateHtml;
        
        handlebars.registerHelper('formatCurrency', (val: any) => formatCurrency(val));
        const compiledTemplate = handlebars.compile(bodyInner);

        // Generate combined HTML for all employees
        let combinedInnerHtml = '';
        for (let i = 0; i < employees.length; i++) {
            const empData = employees[i];
            const templateData = {
                ...prepareHikeLetterTemplateData({
                    ...empData,
                    signatory,
                    logoPath
                }),
                companyLogo: companyLogoUrl,
                signatureImage: signatureImageBase64
            };

            combinedInnerHtml += `<div class="letter-wrapper" style="${i > 0 ? 'page-break-before: always;' : ''}">
                ${compiledTemplate(templateData)}
            </div>`;
        }

        // Final valid HTML shell
        const finalHtml = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="UTF-8">
                    <style>${style}</style>
                </head>
                <body>
                    ${combinedInnerHtml}
                </body>
            </html>
        `;

        browser = await puppeteer.launch(getPuppeteerLaunchOptions());
        const page = await browser.newPage();
        await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

        const footerTemplate = `
            <div style="width: 100%; font-family: Arial, sans-serif; font-size: 10px; color: #777; position: relative; height: 60px; -webkit-print-color-adjust: exact;">
                <div style="position: absolute; left: 0; top: 0; width: 100px; height: 35px; background-color: #002B5B !important;">&nbsp;</div>
                <div style="position: absolute; right: 0; top: 0; width: 40px; height: 35px; background-color: #94D3E2 !important;">&nbsp;</div>
                <div style="width: 100%; text-align: center; padding-top: 5px; line-height: 1.5;">
                    <div style="margin-bottom: 3px; color: #555;">51, Tek Meadows, Old Mahabalipuram Road, Sholinganallur, Chennai, Tamil Nadu-600119</div>
                    <div style="font-size: 9px; margin-bottom: 8px;">
                        <span style="margin: 0 10px;">📱 +91 8015441135</span>
                        <span style="margin: 0 10px;">✉️ myhr@clouddesk.ae</span>
                        <span style="margin: 0 10px;">🌐 www.clouddesk.ae</span>
                    </div>
                    <div style="font-weight: bold; color: #333;">
                        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
                    </div>
                </div>
            </div>
        `;

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: footerTemplate,
            margin: { top: '20mm', right: '15mm', bottom: '30mm', left: '15mm' }
        });

        await fsPromises.writeFile(outputPdfPath, pdfBuffer);

        const gcpResult = await uploadFileToGCP({
            filePath: outputPdfPath,
            fileName: fileName,
            employeeId: 'Preview',
            category: 'EmployeeLifecycle',
            type: 'HikeLetter'
        });

        if (!gcpResult.success) throw new Error(`GCP Upload failed: ${gcpResult.error}`);
        return gcpResult.fileUrl!;
    } catch (error) {
        console.error('Hike Letter PDF Helper Error:', error);
        throw error;
    } finally {
        if (browser) await browser.close();
        try {
            if (fs.existsSync(outputPdfPath)) await fsPromises.unlink(outputPdfPath);
        } catch (err) {
            console.warn('Temp PDF cleanup failed:', err);
        }
    }
}
