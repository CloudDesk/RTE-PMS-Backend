import { Types } from "mongoose";
import { ITaxDeclaration, TaxDeclaration } from "../models/tax-declaration";
import { getCurrentFinancialYear } from "../utilis/dates";
import { ITaxSlab, TaxSlab } from "../models/tax-slab.model";
import { IUser, SalaryAssignment, User } from "../models";
// import { ISalaryAssignmentUpdate } from "./salary-assignment.service";
import { BaseService } from "./base.service";
import { RequestContext } from "../types/context";
import fs from 'fs';
import path from 'path';

import { Document } from "../models/document.model";
import * as xlsx from 'xlsx';
import { deductionSections, TAX_DEDUCTION_SECTION_IDS, type IDeductionSection } from "../constants/tax-deduction-sections";
import { uploadFileToGCP } from "../utilis/gcpStorage";

export interface ITaxDeclarationCreate {
    employeeId: string;
    financialYear: string;
    regime: 'new' | 'old';
}
export interface IDocument {
    documentName: string;
    documentPath: string;
    uploadDate: Date;
    isLatestVersion: boolean;
    documentType?: string;
}

export interface IDeclaration {
    section: string;
    subsection: string;
    subSection?: string;
    maxLimit: number;
    declaredAmount: number;
    verifiedAmount: number;
    status: "pending" | "verified" | "rejected" | "resubmission_requested" | "document_submitted";
    documents?: IDocument[];
    rentDetails?: {
        month: string;
        amount: number;
        landlordName?: string;
        landlordPan?: string;
    }[];
    type?: "income" | "loss";
    _id?: Types.ObjectId;
}

export interface ISlabwiseTax {
    slab: string;
    amount: number;
    fromAmount: number;
    toAmount?: number | null;
}

export interface ITaxBreakdown {
    taxAmount: number;
    slabwiseTax: ISlabwiseTax[];
    cessAmount: number;
    totalTaxAmount: number;
    taxableIncome: number;
    rebateAmount: number;
    isRebateApplicable: boolean;
    marginalReliefAmount: number;
    isMarginalReliefApplicable: boolean;
    taxWithCess: number; // Tax before Form12B TDS deduction
    form12bTDSAmount?: number;
    finalTaxWithCess: number;
    ptDeduction?: number; // Annual Professional Tax deduction
}
export interface IForm12BInput {
    form12bId: string;
    tdsAmount: number;
    financialYear: string;
}

export interface IMonthlyTaxDeduction {
    month: string;              // e.g., "Apr", "May", etc.
    financialYear: string;               // 2023-2024
    plannedDeduction: number;   // Original planned deduction
    actualDeduction: number;    // What was actually deducted
    adjustmentAmount: number;   // Any adjustment applied this month
    plannedDate: Date;        // When the deduction occurred
    isProcessed: boolean;       // Whether this month's deduction has been processed
}

export interface ITaxDeclarationUpdate {
    _id: Types.ObjectId | string;
    employeeId: string;
    financialYear: string;
    regime: 'new' | 'old';
    declarations: IDeclaration[];
    cessRate: number;
    annualGross: number;
    totalDeclaredAmount: number;
    totalVerifiedAmount: number;
    standardDeduction: number;
    ptDeduction: number;
    calculatedTaxAmount: number;
    revisedTaxAmount: number;
    taxPaid: number;

    poiSubmissionStatus: "not_submitted" | "partial_submitted" | "submitted" | "verified" | "rejected" | "resubmission";
    reviewHistory?: {
        reviewedBy: string;
        reviewDate: string;
        action: "verified" | "rejected" | "resubmission_requested";
        comments: string;
    }[];
    isLocked: boolean;
    initialTaxBreakdown: ITaxBreakdown;
    isDeclared: boolean;
    isPOISubmitted: boolean;
    isResubmitted: boolean;
    previousTaxAmount: number;

    taxAdjustmentRequired: boolean;
    adjustmentAmount: number;
    adjustmentReason: string;
    monthlyAdjustment: number;
    remainingMonths: number;
    adjustmentDistribution: string;
    lastAdjustmentDate: Date | string;

    excessTaxPaid: number;
    noFurtherTaxDeduction: boolean;
    remainingTaxToPay: number;
    monthlyDeductions: IMonthlyTaxDeduction[];
    salaryAssignments?: { assignmentId: Types.ObjectId; validFrom: Date; validTill: Date; monthlyGross: number; isActive: boolean }[];
    isSubmissionsEnabled?: boolean;
    isMigrationAdjusted?: boolean;
    isMigrationInitialized?: boolean;
}

// Migration Adjustment Interfaces (for HRMS migration - December 2025)
export interface IMigrationAdjustmentInput {
    employeeId: string;
    regime: 'OLD' | 'NEW';
    financialYear: string;
    externalTaxPaid: number;
    externalTaxPaidMonths: number;
    newSystemTaxToPay: number;
    newSystemTaxMonths: number;
}

export interface IMigrationAdjustmentResult {
    success: boolean;
    processed: number;
    failed: number;
    results: {
        employeeId: string;
        status: 'success' | 'failed';
        message?: string;
        oldMonthlyPlan?: any[];
        newMonthlyPlan?: any[];
    }[];
}

export interface IMigrationPreviewRow extends IMigrationAdjustmentInput {
    rowNumber: number;
    employeeName?: string;
    systemCalculatedTax?: number;
    isValid: boolean;
    errors: string[];
}

export interface IMigrationPreviewResult {
    summary: {
        totalRows: number;
        validRows: number;
        invalidRows: number;
    };
    validRows: IMigrationPreviewRow[];
    invalidRows: IMigrationPreviewRow[];
}

export class TaxDeclarationService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }
    private async calculateAnnualGross(employeeId: string, financialYear: string): Promise<{
        annualGross: number;
        salaryAssignments: { assignmentId: Types.ObjectId; validFrom: Date; validTill: Date; monthlyGross: number; isActive: boolean }[];
    }> {
        const [fyStartYear, fyEndYear] = financialYear.split('-').map(Number);
        const fyStartDate = new Date(`${fyStartYear}-04-01T00:00:00.000Z`);
        const fyEndDate = new Date(`${fyEndYear}-03-31T23:59:59.999Z`);

        const salaryAssignments = await SalaryAssignment.find({
            employeeId,
            effectiveFrom: { $lte: fyEndDate },
            effectiveTo: { $gte: fyStartDate }
        }).sort('effectiveFrom');
        if (!salaryAssignments.length) {
            throw new Error('No salary assignments found for the financial year');
        }
        let annualGross = 0;
        const assignmentsForTaxDeclaration: { assignmentId: Types.ObjectId; validFrom: Date; validTill: Date; monthlyGross: number; isActive: boolean }[] = [];
        for (const assignment of salaryAssignments) {
            const startDate = new Date(Math.max(assignment.effectiveFrom.getTime(), fyStartDate.getTime()));
            const endDate = new Date(Math.min(assignment.effectiveTo.getTime(), fyEndDate.getTime()));
            const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
            annualGross += Number(assignment.monthlyGross) * Number(months);
            assignmentsForTaxDeclaration.push({
                assignmentId: assignment._id,
                validFrom: startDate,
                validTill: endDate,
                monthlyGross: Number(assignment.monthlyGross),
                isActive: !!assignment.isActive
            });
        }
        return { annualGross, salaryAssignments: assignmentsForTaxDeclaration };
    }

    /**
     * Calculate annual PT (Professional Tax) deduction for the employee
     * PT is calculated based on salary slabs from the salary structure
     * Payment frequency is based on professionalTax.term:
     * - "monthly" = 12 times per year
     * - "half_yearly" = 2 times per year
     * - "yearly" = 1 time per year
     */
    private async calculateAnnualPTDeduction(employeeId: string, financialYear: string): Promise<number> {
        const [fyStartYear, fyEndYear] = financialYear.split('-').map(Number);
        const fyStartDate = new Date(`${fyStartYear}-04-01T00:00:00.000Z`);
        const fyEndDate = new Date(`${fyEndYear}-03-31T23:59:59.999Z`);

        const salaryAssignments = await SalaryAssignment.find({
            employeeId,
            effectiveFrom: { $lte: fyEndDate },
            effectiveTo: { $gte: fyStartDate }
        }).populate('salaryStructureId').sort('effectiveFrom');

        if (!salaryAssignments.length) {
            return 0;
        }

        let totalAnnualPT = 0;

        for (const assignment of salaryAssignments) {
            const salaryStructure = assignment.salaryStructureId as any;

            if (!salaryStructure || salaryStructure.country !== 'IN') {
                // PT is only applicable for Indian employees
                continue;
            }

            // Calculate the number of months this assignment is active in the FY
            const startDate = new Date(Math.max(assignment.effectiveFrom.getTime(), fyStartDate.getTime()));
            const endDate = new Date(Math.min(assignment.effectiveTo.getTime(), fyEndDate.getTime()));
            const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;

            // Get monthly gross salary
            const monthlyGross = Number(assignment.monthlyGross);

            // Find the applicable PT slab based on monthly gross
            const ptSlabs = salaryStructure.statutoryDeductions?.professionalTax?.slabs || [];
            let ptPerInstallment = 0;

            for (const slab of ptSlabs) {
                const fromAmount = Number(slab.fromAmount);
                const toAmount = slab.toAmount ? Number(slab.toAmount) : null;
                const taxAmount = Number(slab.taxAmount || 0);

                if (toAmount === null || toAmount === undefined) {
                    // Highest slab (no upper limit)
                    if (monthlyGross >= fromAmount) {
                        ptPerInstallment = taxAmount;
                        break;
                    }
                } else {
                    // Check if monthly gross falls within this slab
                    if (monthlyGross >= fromAmount && monthlyGross <= toAmount) {
                        ptPerInstallment = taxAmount;
                        break;
                    }
                }
            }

            // Determine PT payment frequency based on professionalTax term
            const term = salaryStructure.statutoryDeductions?.professionalTax?.term || 'monthly';
            let ptFrequency = 12; // Default to monthly (12 times per year)

            if (term === 'half_yearly') {
                ptFrequency = 2; // Paid 2 times per year
            } else if (term === 'yearly') {
                ptFrequency = 1; // Paid 1 time per year
            } else if (term === 'monthly') {
                ptFrequency = 12; // Paid 12 times per year
            }

            // Calculate PT for this assignment based on the frequency
            // For partial year assignments, prorate the frequency
            const activePeriodRatio = months / 12;
            const effectiveFrequency = Math.round(ptFrequency * activePeriodRatio);
            const assignmentPT = ptPerInstallment * effectiveFrequency;

            totalAnnualPT += assignmentPT;
        }

        return Math.round(totalAnnualPT);
    }

    /** Returns deduction sections config (aligned with FE) for tax declaration forms. */
    getDeductionSections(): IDeductionSection[] {
        return deductionSections;
    }

    // * user/admin chooses regime Creates a new tax declaration with initial calculations
    async create(data: ITaxDeclarationCreate): Promise<ITaxDeclaration> {
        console.log(data, "0 data")
        const { employeeId, regime, financialYear } = data;
        // 1. Get current FY tax slab
        const taxSlab = await TaxSlab.findOne({
            financialYear,
            regime,
            isActive: true
        }) as ITaxSlab | null;
        console.log(taxSlab, "1 taxSlab");
        if (!taxSlab) {
            throw new Error(`Tax slab not found for FY ${financialYear} and regime ${regime}`);
        }
        /*
                // 2. Get employee's salary details
                const salaryAssignment = await SalaryAssignment.findOne({
                    employeeId,
                    isActive: true
                }) as ISalaryAssignmentUpdate | null;
                console.log(salaryAssignment, "2 salaryAssignment");
                if (!salaryAssignment) {
                    throw new Error('Active salary assignment not found');
                }
        */
        //calculate the user Joining Date and allow make isForm12BApplicable value
        //fetch the user

        const user: IUser = await User.findById(employeeId).select('name joiningDate isConsultancy isIntern');
        if (!user) {
            throw new Error('User not found');
        }

        // Prevent tax declaration creation for consultancy staff
        if (user.isConsultancy) {
            throw new Error('Tax declaration cannot be created for consultancy staff. Consultancy users have 1% TDS deduction instead of income tax.');
        }

        // Prevent tax declaration creation for interns
        if (user.isIntern) {
            throw new Error('Tax declaration cannot be created for intern employees. Interns have no tax deductions.');
        }

        console.log(user, "getUser")
        const [fyStartYear, fyEndYear] = financialYear.split('-').map(Number);
        const fyStartDate = new Date(`${fyStartYear}-04-01T00:00:00.000Z`);
        const fyEndDate = new Date(`${fyEndYear}-03-31T23:59:59.999Z`);
        const joiningDate = new Date(user.joiningDate);
        const isForm12BApplicable = joiningDate >= fyStartDate && joiningDate <= fyEndDate;
        console.log(isForm12BApplicable, 'isForm12BApplicable');

        const { annualGross, salaryAssignments } = await this.calculateAnnualGross(employeeId, financialYear);


        // 3. Calculate annual gross income
        // const annualGross = (Number(salaryAssignment?.monthlyGross) ?? 0) * 12;
        console.log(annualGross, "3.1 annualGross");

        // 3.2 Calculate annual PT (Professional Tax) deduction - ONLY for old regime
        const ptDeduction = regime === 'old'
            ? await this.calculateAnnualPTDeduction(employeeId, financialYear)
            : 0;
        console.log(ptDeduction, "3.2 ptDeduction (only for old regime)");

        // 4. Convert tax slabs to plain objects for calculation
        const plainSlabs = taxSlab.slabs.map(slab => ({
            fromAmount: Number(slab.fromAmount),
            toAmount: slab.toAmount !== null ? Number(slab.toAmount) : null,
            taxRate: Number(slab.taxRate)
        }));
        console.log(plainSlabs, "4 plain slabs for calculation");

        // 5. Calculate initial tax
        const initialTax = await this.calculateIncomeTax(
            annualGross,
            regime,
            0, // No investments yet
            taxSlab.standardDeduction,
            plainSlabs,
            taxSlab.cessRate,
            ptDeduction
        );
        console.log(initialTax, "5 initialTax");
        // 6. Create monthly deduction plan based on FY months
        const monthlyDeductions = await this.createMonthlyDeductionPlan(
            financialYear,
            initialTax.finalTaxWithCess
        );
        console.log(monthlyDeductions, "6 monthlyDeductions");

        // 7. Create tax declaration
        const taxDeclaration = new TaxDeclaration({
            employeeId,
            financialYear,
            regime,
            standardDeduction: taxSlab.standardDeduction,
            ptDeduction,
            declarations: [],
            totalDeclaredAmount: 0,
            totalVerifiedAmount: 0,
            totalDeclinedAmount: 0,
            annualGross,
            calculatedTaxAmount: initialTax.taxAmount,//SBT
            revisedTaxAmount: initialTax.totalTaxAmount, // SBT after rebate/marginal relief
            remainingTaxToPay: initialTax.finalTaxWithCess,//Final tax with cess
            previousTaxAmount: initialTax.totalTaxAmount,
            initialTaxBreakdown: initialTax,
            initialTaxCalculated: true,
            lastDeclarationDate: new Date(),
            initialDeclarationDate: new Date(),
            // Initialize additional fields for old regime
            monthlyDeductions,
            poiSubmissionStatus: regime === 'old' ? 'not_submitted' : undefined,
            cessRate: taxSlab.cessRate,
            isLocked: false,
            salaryAssignments,
            isForm12BApplicable
        });

        console.log(taxDeclaration, "7 taxDeclaration");
        // 8. Calculate number of remaining months in FY for tax distribution
        const remainingMonths = this.calculateRemainingMonthsInFY(financialYear);
        taxDeclaration.remainingMonths = remainingMonths;

        console.log(remainingMonths, "8 remainingMonths");
        console.log(taxDeclaration, "8.1 taxDeclaration");

        await taxDeclaration.save();

        return taxDeclaration;
    }

    //declaration decclrerd by user
    async update(data: ITaxDeclarationUpdate): Promise<ITaxDeclaration> {
        // 1. Find the tax declaration document
        const taxDeclaration = await TaxDeclaration.findById(data._id);
        if (!taxDeclaration) {
            throw new Error('Tax Declaration not found');
        }

        // NEW: Check if submissions are locked for users
        if (!taxDeclaration.isSubmissionsEnabled && this.context.user?.role !== "admin") {
            throw new Error("Tax declaration submission is currently locked by the administrator.");
        }
        console.log(taxDeclaration, "1 taxDeclaration get")
        const { employeeId, regime, financialYear } = data;
        // 2. Get current FY tax slab
        const taxSlab = await TaxSlab.findOne({
            financialYear,
            regime,
            isActive: true
        }) as ITaxSlab | null;
        if (!taxSlab) {
            throw new Error(`Tax slab not found for FY ${financialYear} and regime ${regime}`);
        }
        console.log(taxSlab, "2 taxSlab");

        // update the correct standard deduction and cess rate
        taxDeclaration.standardDeduction = taxSlab.standardDeduction;
        taxDeclaration.cessRate = taxSlab.cessRate;
        console.log(taxDeclaration, "2.1 taxDeclaration updated with taxSlab");

        /* 
        // 3. Get employee's salary details
         const salaryAssignment = await SalaryAssignment.findOne({
             employeeId,
             isActive: true
         }) as ISalaryAssignmentUpdate | null;
         console.log(salaryAssignment, "3 salaryAssignment");
 
         // 4. Calculate annual gross income
         const annualGross = (Number(salaryAssignment?.monthlyGross) ?? 0) * 12;
         console.log(annualGross, "4 annualGross");
 */
        const { annualGross, salaryAssignments } = await this.calculateAnnualGross(employeeId, financialYear);

        // 4.2 Calculate annual PT (Professional Tax) deduction - ONLY for old regime
        const ptDeduction = regime === 'old'
            ? await this.calculateAnnualPTDeduction(employeeId, financialYear)
            : 0;
        console.log(ptDeduction, "4.2 ptDeduction (only for old regime)");
        taxDeclaration.ptDeduction = ptDeduction;

        // 5. Convert tax slabs to plain objects for calculation
        const plainSlabs = taxSlab.slabs.map(slab => ({
            fromAmount: Number(slab.fromAmount),
            toAmount: slab.toAmount !== null ? Number(slab.toAmount) : null,
            taxRate: Number(slab.taxRate)
        }));
        console.log(plainSlabs, "5 plain slabs for calculation");


        // 6. Normalize declarations: FE may send subsection -> map to subSection for model
        if (data.declarations && data.declarations.length > 0) {
            data.declarations = data.declarations.map((d: any) => {
                const normalized = {
                    ...d,
                    subSection: d.subSection ?? d.subsection,
                };
                // Remove rentDetails if not an HRA section
                if (normalized.section !== '10_13A') {
                    delete normalized.rentDetails;
                }
                return normalized;
            });
        }

        // Calculate total declared amount from declarations
        let totalDeclaredAmount = 0
        // If declarations array exists and has elements, calculate totalDeclaredAmount
        if (data.declarations && data.declarations.length > 0) {
            totalDeclaredAmount = data.declarations.reduce((sum, declaration) => {
                const amount = Number(declaration.declaredAmount) || 0;
                if (declaration.section === 'income_loss_house_property') {
                    const absAmount = Math.abs(amount);
                    if (declaration.type === 'income') {
                        return sum - absAmount;
                    } else {
                        const cappedLoss = declaration.maxLimit ? Math.min(absAmount, declaration.maxLimit) : Math.min(absAmount, 200000);
                        return sum + cappedLoss;
                    }
                }
                const cappedAmount = (declaration.maxLimit && declaration.maxLimit > 0) ? Math.min(amount, declaration.maxLimit) : amount;
                return sum + cappedAmount;
            }, 0);
            data.totalDeclaredAmount = totalDeclaredAmount;
            data.isDeclared = true;
        } else {
            data.isDeclared = false;
        }

        console.log(data, "6 taxDeclaration updated")
        // 7. Store previous tax amount for comparison
        const previousTaxAmount = taxDeclaration.initialTaxBreakdown.finalTaxWithCess || 0;
        data.previousTaxAmount = previousTaxAmount;
        console.log(data, "7 taxDeclaration updated")

        // 8. Calculate new tax based on declarations
        const updatedTax = await this.calculateIncomeTax(
            annualGross,
            regime,
            totalDeclaredAmount,
            taxSlab.standardDeduction,
            plainSlabs,
            taxSlab.cessRate,
            ptDeduction
        );
        console.log(updatedTax, "8 updatedTax");

        // Apply Form12B TDS if applicable
        if (taxDeclaration.isForm12BApplicable && taxDeclaration.form12B) {
            const docForm12B = await Document.findById(taxDeclaration.form12B);
            if (docForm12B && docForm12B.type === 'Form12B' && docForm12B.metadata?.form12B?.status === 'Verified') {
                updatedTax.form12bTDSAmount = docForm12B.metadata.form12B.tdsDeducted || 0;
                updatedTax.taxWithCess = updatedTax.finalTaxWithCess;
                updatedTax.finalTaxWithCess = Math.max(0, updatedTax.taxWithCess - 0);
            }
        }
        data.calculatedTaxAmount = updatedTax.taxAmount; //SBT
        data.revisedTaxAmount = updatedTax.finalTaxWithCess;// After rebate/relief and cess
        data.initialTaxBreakdown = updatedTax;

        data.annualGross = annualGross;
        data.salaryAssignments = salaryAssignments;
        console.log(data, "9 after update data")

        // 10. Calculate tax adjustment if needed
        if (previousTaxAmount !== updatedTax.finalTaxWithCess) {
            data.taxAdjustmentRequired = true;
            data.adjustmentAmount = updatedTax.finalTaxWithCess - previousTaxAmount;
            data.adjustmentReason = data.declarations.length > 0 ? 'revised_declaration' : 'salary_revision';
            data.lastAdjustmentDate = new Date();

            // 11. Calculate remaining months for adjustment
            const remainingMonths = this.calculateRemainingMonthsInFY(financialYear);
            data.remainingMonths = remainingMonths;

            // 12. Calculate monthly adjustment amount
            if (remainingMonths > 0) {
                data.monthlyAdjustment = Math.round(data.adjustmentAmount / remainingMonths);
            } else {
                // If no months remain, set to full amount for one-time adjustment
                data.monthlyAdjustment = data.adjustmentAmount;
                data.adjustmentDistribution = 'one_time';
            }
            console.log(data, "10 after update data")

            // MIGRATION CHECK: Skip monthly deduction recalculation if migration-adjusted
            if (!taxDeclaration.isMigrationAdjusted) {
                // Standard logic: recalculate monthly deductions
                const newObj = await this.updateMonthlyDeductionPlan(
                    taxDeclaration.monthlyDeductions,
                    updatedTax.finalTaxWithCess,
                    remainingMonths,
                    data.adjustmentAmount < 0
                );
                console.log(newObj, "10 newObj");
                data.monthlyDeductions = newObj;
            } else {
                // Migration override: ONLY update annual tax amounts, NOT monthly plan
                console.log(
                    `[MIGRATION OVERRIDE] Skipping monthly deduction recalculation for employee ${employeeId}. ` +
                    `Migration-adjusted record from ${taxDeclaration.migrationAdjustment?.uploadedAt}`
                );

                // FORCE Tax Liability to match Migration Value
                if (taxDeclaration.migrationAdjustment?.totalMigratedTaxLiability) {
                    const migratedTax = taxDeclaration.migrationAdjustment.totalMigratedTaxLiability;

                    // Override the System Calculated Tax
                    data.revisedTaxAmount = migratedTax;

                    console.log(`[MIGRATION OVERRIDE] Forcing Annual Tax Liability to ₹${migratedTax}`);
                }

                // Keep existing monthly deductions from migration adjustment
                data.monthlyDeductions = taxDeclaration.monthlyDeductions;
            }
        }
        console.log(previousTaxAmount !== updatedTax.totalTaxAmount, "10.1 after update data")

        // 14. Check if refund is needed (negative adjustment)
        if (data.adjustmentAmount < 0) {
            data.noFurtherTaxDeduction = true;
            data.excessTaxPaid = Math.abs(data.adjustmentAmount);
        }
        console.log(data, "11 after update data")

        // 15. Update remaining tax to pay
        // MIGRATION CHECK: Ensure we use the correct Revised Amount
        const finalTaxForCalc = taxDeclaration.isMigrationAdjusted && taxDeclaration.migrationAdjustment?.totalMigratedTaxLiability
            ? taxDeclaration.migrationAdjustment.totalMigratedTaxLiability
            : updatedTax.finalTaxWithCess;

        data.remainingTaxToPay = finalTaxForCalc - (taxDeclaration.taxPaid || 0);


        // 15. Update taxDeclaration object with new data
        Object.assign(taxDeclaration, data);
        return taxDeclaration.save();
    }

    // Updates POI documents for tax declarations
    async updateDocuments(id: Types.ObjectId, request: any): Promise<ITaxDeclaration> {
        // 1. Find the tax declaration document
        const taxDeclaration = await TaxDeclaration.findById(id);
        if (!taxDeclaration) {
            throw new Error('Tax Declaration not found');
        }

        // 2. Check if submissions are locked for users
        if (!taxDeclaration.isSubmissionsEnabled && this.context.user?.role !== "admin") {
            throw new Error("Document submission is currently locked by the administrator.");
        }

        // 3. Get user info using employeeId
        const user = await User.findOne({ _id: taxDeclaration.employeeId });
        if (!user) {
            throw new Error('User not found for given employeeId');
        }

        const userCleanName = user.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

        const files = request.files;
        const body = request.body || {};

        // 4. HRA validation for > 1,00,000
        const hraDecl = taxDeclaration.declarations.find(d => d.section === "10_13A" && d.subSection === "rent_paid");
        if (hraDecl && hraDecl.declaredAmount > 100000) {
            const isHraUpdate = files.some((f: any) => f.fieldname.startsWith("10_13A_rent_paid"));
            if (isHraUpdate) {
                const landlordName = body?.["10_13A_rent_paid_landlordName"] || body?.["landlordName"];
                const landlordPan = body?.["10_13A_rent_paid_landlordPan"] || body?.["landlordPan"];
                const panDoc = files.find((f: any) => f.fieldname === "10_13A_rent_paid_landlordPanDoc");

                if (!landlordName) throw new Error("Landlord name is required for HRA declaration above ₹1,00,000");
                if (!landlordPan) throw new Error("Landlord PAN is required for HRA declaration above ₹1,00,000");
                if (!panDoc) throw new Error("Landlord PAN document copy is required for HRA declaration above ₹1,00,000");
            }
        }

        console.log(taxDeclaration, "1 taxDeclaration");
        console.log(files, "1.1 files");

        // 5. Process each uploaded file
        for (const file of files) {
            const fieldname = file.fieldname;
            let section = "";
            let subSection = "";

            // 5a. Parse section + subSection against known section IDs
            for (const sId of TAX_DEDUCTION_SECTION_IDS) {
                if (fieldname.startsWith(sId + "_")) {
                    section = sId;
                    subSection = fieldname.substring(sId.length + 1);
                    break;
                }
            }

            // Fallback split (should not be reached with current constants)
            if (!section) {
                const parts = fieldname.split('_');
                section = parts[0];
                subSection = parts.slice(1).join('_');
            }

            console.log(section, subSection, "5a section, subsection identified");

            // 5b. Preserve original file extension
            const ext = path.extname(file.originalname); // e.g., '.pdf', '.jpg'
            const timestamp = Date.now();
            const newFileName = `Tax_Dec_${section}_${subSection}_${userCleanName}_${timestamp}${ext}`;
            const uploadDir = path.dirname(file.path);
            const newFilePath = path.join(uploadDir, newFileName);

            // 5c. Rename file on disk
            fs.renameSync(file.path, newFilePath);

            // 5d. Upload to GCP Cloud Storage
            let gcpFileUrl = '';
            try {
                const gcpResult = await uploadFileToGCP({
                    filePath: newFilePath,
                    fileName: newFileName,
                    employeeId: taxDeclaration.employeeId.toString(),
                    category: 'Tax',
                    type: 'TaxProof'
                });

                if (!gcpResult.success) {
                    throw new Error(`GCP upload failed: ${gcpResult.error}`);
                }
                gcpFileUrl = gcpResult.fileUrl!;
                console.log(gcpFileUrl, "5d GCP upload successful");
            } finally {
                // 5e. Clean up temp file from disk regardless of GCP outcome
                try {
                    fs.unlinkSync(newFilePath);
                } catch (cleanupErr) {
                    console.warn(`Failed to clean up temp file ${newFilePath}:`, cleanupErr);
                }
            }

            // 5f. Find the matching declaration
            // Sub-fields like _landlordPanDoc are matched to the parent subsection (e.g. rent_paid)
            const declaration = taxDeclaration.declarations.find(
                (decl) => decl.section === section &&
                    (decl.subSection === subSection || subSection.startsWith(decl.subSection + '_'))
            );

            if (!declaration) {
                console.warn(`No matching declaration found for section=${section}, subSection=${subSection}. Skipping.`);
                continue;
            }

            // 5g. Determine document type
            let documentType = "standard";
            if (subSection.endsWith("_landlordPanDoc")) {
                documentType = "landlord_pan_doc";
            }

            // 5h. Mark all existing docs of the same type as not latest
            declaration.documents.forEach(doc => {
                if (doc.documentType === documentType || (!doc.documentType && documentType === "standard")) {
                    doc.isLatestVersion = false;
                }
            });

            // 5i. Add new document entry with GCP URL as documentPath
            declaration.documents.push({
                documentName: file.originalname,
                documentPath: gcpFileUrl,        // ← GCP URL (was local http URL)
                uploadDate: new Date(),
                isLatestVersion: true,
                documentType
            });

            // 5j. Update declaration status
            declaration.lastUpdated = new Date();
            declaration.status = 'document_submitted';

            // 5j.1 Update landlordName / landlordPan on rentDetails if provided
            const specificLandlordName = body[`${section}_${subSection.split('_')[0]}_landlordName`] || body[`${section}_landlordName`];
            const specificLandlordPan = body[`${section}_${subSection.split('_')[0]}_landlordPan`] || body[`${section}_landlordPan`];

            if (declaration.rentDetails && declaration.rentDetails.length > 0) {
                const landlordName = specificLandlordName || ((section === '10_13A' || section === '80GG') ? (body.landlordName || body[`${section}_rent_paid_landlordName`]) : undefined);
                const landlordPan = specificLandlordPan || ((section === '10_13A' || section === '80GG') ? (body.landlordPan || body[`${section}_rent_paid_landlordPan`]) : undefined);

                if (landlordName || landlordPan) {
                    declaration.rentDetails.forEach((detail: any) => {
                        if (landlordName) detail.landlordName = landlordName;
                        if (landlordPan) detail.landlordPan = landlordPan;
                    });
                }
            }

            // 5k. Upsert Document collection record (type: TaxProof, category: Tax)
            // Key: taxDeclarationId + section + parent subSection + documentType
            const parentSubSection = declaration.subSection; // always the parent e.g. 'rent_paid'
            try {
                const existingDoc = await Document.findOne({
                    employeeId: taxDeclaration.employeeId,
                    type: 'TaxProof',
                    'metadata.taxProof.taxDeclarationId': taxDeclaration._id,
                    'metadata.taxProof.section': section,
                    'metadata.taxProof.subSection': parentSubSection,
                    'metadata.taxProof.documentType': documentType,
                });

                const docData = {
                    employeeId: taxDeclaration.employeeId,
                    type: 'TaxProof' as const,
                    category: 'Tax' as const,
                    fileName: newFileName,
                    filePath: gcpFileUrl,
                    tags: ['TaxProof', taxDeclaration.financialYear, section, parentSubSection],
                    uploadDate: new Date(),
                    uploadedBy: new Types.ObjectId(this.context.user?._id),
                    accessLevel: 'Private' as const,
                    status: 'Uploaded' as const,
                    metadata: {
                        taxProof: {
                            taxDeclarationId: taxDeclaration._id,
                            financialYear: taxDeclaration.financialYear,
                            section,
                            subSection: parentSubSection,
                            documentType: documentType as 'standard' | 'landlord_pan_doc',
                            uploadedAt: new Date(),
                        }
                    },
                };

                if (existingDoc) {
                    // Update existing: new GCP URL, increment version, add audit entry
                    Object.assign(existingDoc, { ...docData, version: existingDoc.version + 1 });
                    existingDoc.auditLog = existingDoc.auditLog || [];
                    existingDoc.auditLog.push({
                        action: 'Re-upload',
                        performedBy: new Types.ObjectId(this.context.user?._id),
                        timestamp: new Date(),
                        details: `Re-uploaded POI for ${section} / ${parentSubSection} (${documentType})`,
                    });
                    await existingDoc.save();
                    console.log(existingDoc._id, "5k Updated existing Document record");
                } else {
                    // Create new Document record
                    const newDoc = new Document({
                        ...docData,
                        version: 1,
                        auditLog: [{
                            action: 'Upload',
                            performedBy: new Types.ObjectId(this.context.user?._id),
                            timestamp: new Date(),
                            details: `Uploaded POI for ${section} / ${parentSubSection} (${documentType})`,
                        }],
                    });
                    await newDoc.save();
                    console.log(newDoc._id, "5k Created new Document record");
                }
            } catch (docErr) {
                // Log but don't fail the request — embedded doc is already saved
                console.error(`Failed to upsert Document collection record for ${section}/${parentSubSection}:`, docErr);
            }
        }

        console.log(taxDeclaration, "6 taxDeclaration after processing all files");

        // 6. Smart POI submission status
        //    Only count declarations that still need action (exclude verified and finally rejected)
        const needingDecls = taxDeclaration.declarations.filter(
            d => d.declaredAmount > 0 && d.status !== 'verified' && d.status !== 'rejected'
        );
        const coveredDecls = needingDecls.filter(
            d => d.documents.some(doc => doc.isLatestVersion === true)
        );

        if (needingDecls.length > 0) {
            if (coveredDecls.length === needingDecls.length) {
                // Every active declaration has at least one document
                taxDeclaration.poiSubmissionStatus = 'submitted';
            } else if (coveredDecls.length > 0) {
                // Some declarations have docs, but not all
                taxDeclaration.poiSubmissionStatus = 'partial_submitted';
            }
            // coveredDecls.length === 0: keep existing status (edge case guard)
        }

        // isPOISubmitted = true as long as at least one document was ever submitted
        taxDeclaration.isPOISubmitted = coveredDecls.length > 0;

        // 7. Save and return updated document
        return await taxDeclaration.save();
    }

    //Admin review of declarations with approval/rejection handling
    async reviewDeclarations(id: Types.ObjectId, data: any): Promise<ITaxDeclaration> {
        // 1. Find the tax declaration document
        const taxDeclaration = await TaxDeclaration.findById(id);
        if (!taxDeclaration) {
            throw new Error('Tax Declaration not found');
        }
        const { approvedList, declinedList, userInfo, comments = {} } = data;
        console.log(approvedList, "approvedList", '**', declinedList, "declinedList")
        console.log(userInfo, "userInfo", comments, "comments")
        // Store previous tax for comparison and adjustment calculation
        const previousTaxAmount = taxDeclaration.revisedTaxAmount;
        taxDeclaration.previousTaxAmount = previousTaxAmount;

        // 2. Process approved declarations
        for (const subSection of approvedList) {
            const declaration = taxDeclaration.declarations.find(d => d.subSection === subSection);
            console.log(declaration, "each declaration approvedList")
            if (declaration) {
                declaration.status = 'verified';
                declaration.verifiedAmount = declaration.declaredAmount;
                declaration.reviewHistory.push({
                    reviewedBy: userInfo._id,
                    reviewDate: new Date(),
                    status: 'verified',
                    comments: comments && comments[subSection] ? comments[subSection] : "Approved"
                });
            }
        }
        // 3. Process declined declarations with resubmission logic
        let totalDeclinedAmount = 0;

        for (const subSection of declinedList) {
            const declaration = taxDeclaration.declarations.find(d => d.subSection === subSection);
            console.log(declaration, "each declaration declinedList")
            if (declaration) {
                // Check resubmission status
                if (declaration.resubmissionInfo.isResubmitted) {
                    // Final rejection
                    declaration.status = "rejected";
                    declaration.verifiedAmount = 0;
                    taxDeclaration.poiSubmissionStatus = 'rejected';
                    declaration.resubmissionInfo.resubmissionAllowed = false;
                    declaration.resubmissionInfo.rejectionCount += 1;
                    totalDeclinedAmount += Math.abs(declaration.declaredAmount || 0);
                } else {
                    // First rejection, allow resubmission
                    declaration.status = "resubmission_requested";
                    declaration.verifiedAmount = 0;
                    declaration.resubmissionInfo.previouslyRejected = true;
                    declaration.resubmissionInfo.rejectionCount = 1;
                    declaration.resubmissionInfo.resubmissionAllowed = true;
                    declaration.resubmissionInfo.isResubmitted = true;

                    // Set resubmission deadline to 5 days from now
                    const resubmissionDeadline = new Date();
                    resubmissionDeadline.setDate(resubmissionDeadline.getDate() + 5);
                    declaration.resubmissionInfo.resubmissionDeadline = resubmissionDeadline;

                    // Update document status
                    taxDeclaration.poiSubmissionStatus = 'resubmission';
                    taxDeclaration.isResubmitted = true;
                    totalDeclinedAmount += Math.abs(declaration.declaredAmount || 0);
                }

                // Add review history
                declaration.reviewHistory.push({
                    reviewedBy: userInfo._id,
                    reviewDate: new Date(),
                    status: declaration.resubmissionInfo?.isResubmitted ? "rejected" : "resubmission_requested",
                    comments: comments && comments[subSection] ? comments[subSection] : "Rejected"
                });
            }
        }

        // Add previously declined items to the tally
        taxDeclaration.declarations.forEach(d => {
            if ((d.status === "rejected" || d.status === "resubmission_requested") &&
                !declinedList.includes(d.subSection)) {
                totalDeclinedAmount += Math.abs(d.declaredAmount || 0);
            }
        });


        // 5. Update total declined amount
        taxDeclaration.totalDeclinedAmount = totalDeclinedAmount;

        // 4. Recalculate tax based on updated verifications
        let recalculatedTax = await this.recalculateTax(taxDeclaration.toObject() as ITaxDeclarationUpdate);
        console.log(recalculatedTax, "4 recalculatedTax")

        // 5. Update tax amounts and calculate adjustments
        taxDeclaration.calculatedTaxAmount = recalculatedTax.taxAmount;
        taxDeclaration.revisedTaxAmount = recalculatedTax.finalTaxWithCess;
        taxDeclaration.totalVerifiedAmount = recalculatedTax.totalVerifiedAmount;
        taxDeclaration.initialTaxBreakdown = recalculatedTax;

        // taxDeclaration.taxAdjustmentRequired = taxDeclaration.calculatedTaxAmount !== taxDeclaration.revisedTaxAmount;
        console.log(taxDeclaration, "5 taxdeclaration")
        // 6. Handle tax adjustment if needed
        if (previousTaxAmount !== recalculatedTax.finalTaxWithCess) {
            taxDeclaration.taxAdjustmentRequired = true;
            taxDeclaration.adjustmentAmount = recalculatedTax.finalTaxWithCess - previousTaxAmount;
            taxDeclaration.adjustmentReason = 'declarations_declined';
            taxDeclaration.lastAdjustmentDate = new Date();

            console.log(taxDeclaration, "6 taxdeclaration")

            // 7. Calculate remaining months for adjustment
            const remainingMonths = this.calculateRemainingMonthsInFY(taxDeclaration.financialYear);
            taxDeclaration.remainingMonths = remainingMonths;

            console.log(taxDeclaration, "7 taxdeclaration")

            // 8. Calculate monthly adjustment
            if (remainingMonths > 0) {
                taxDeclaration.monthlyAdjustment = Math.round(taxDeclaration.adjustmentAmount / remainingMonths);
            } else {
                // If no months remain, set for one-time adjustment
                taxDeclaration.monthlyAdjustment = taxDeclaration.adjustmentAmount;
                taxDeclaration.adjustmentDistribution = 'one_time';
            }
            console.log(taxDeclaration.monthlyAdjustment, "8 monthlyAdjustment", taxDeclaration.remainingMonths, "8 remainingMonths")

            // 9. Update monthly deduction plan
            // const monthlyDeductions = await this.updateMonthlyDeductionPlan(
            //     taxDeclaration.monthlyDeductions,
            //     taxDeclaration.monthlyAdjustment,
            //     taxDeclaration.remainingMonths,      
            //     taxDeclaration.adjustmentAmount < 0
            // );
            const monthlyDeductions = await this.updateMonthlyDeductionPlan(
                taxDeclaration.monthlyDeductions,
                recalculatedTax.finalTaxWithCess,
                taxDeclaration.remainingMonths,
                taxDeclaration.adjustmentAmount < 0
            );

            taxDeclaration.monthlyDeductions = monthlyDeductions
            console.log(monthlyDeductions, "9 monthlyDeductions")
            // 10. Calculate remaining tax to pay
            taxDeclaration.remainingTaxToPay = taxDeclaration.revisedTaxAmount - (taxDeclaration.taxPaid || 0);

            // 11. Handle excess tax paid scenario
            if (taxDeclaration.remainingTaxToPay < 0) {
                taxDeclaration.excessTaxPaid = Math.abs(taxDeclaration.remainingTaxToPay);

                // If significant excess, stop further deductions
                if (taxDeclaration.excessTaxPaid > taxDeclaration.revisedTaxAmount * 0.25) {
                    taxDeclaration.noFurtherTaxDeduction = true;
                }
            }
        }
        console.log(taxDeclaration, "11 taxDeclaration");
        // return taxDeclaration;
        return await taxDeclaration.save();
    }

    //Form12B Integration Re-calculation Tax
    async processForm12BTDS(input: IForm12BInput): Promise<ITaxDeclaration> {
        console.log("processForm12BTDS called with input:", input);
        const { form12bId, tdsAmount, financialYear } = input;

        // 1. Find the tax declaration for the given financial year
        const taxDeclaration = await TaxDeclaration.findOne({
            financialYear,
            form12B: new Types.ObjectId(form12bId),
            isForm12BApplicable: true
        });
        console.log(taxDeclaration, "1 taxDeclaration for Form12B")

        if (!taxDeclaration) {
            throw new Error(`Tax Declaration not found for FY ${financialYear} with Form12B ID ${form12bId} or Form12B is not applicable`);
        }

        // 2. Verify regime is old
        if (taxDeclaration.regime !== 'old') {
            throw new Error('Form12B TDS processing is only applicable for old regime');
        }

        // 3. Update initialTaxBreakdown with form12bTDSAmount
        const initialTaxBreakdown = taxDeclaration.initialTaxBreakdown;
        initialTaxBreakdown.form12bTDSAmount = tdsAmount;
        initialTaxBreakdown.taxWithCess = initialTaxBreakdown.finalTaxWithCess;
        initialTaxBreakdown.finalTaxWithCess = Math.max(0, initialTaxBreakdown.taxWithCess - tdsAmount);
        taxDeclaration.revisedTaxAmount = initialTaxBreakdown.finalTaxWithCess;
        taxDeclaration.remainingTaxToPay = initialTaxBreakdown.finalTaxWithCess - (taxDeclaration.taxPaid || 0);
        taxDeclaration.previousTaxAmount = initialTaxBreakdown.taxWithCess;
        taxDeclaration.taxAdjustmentRequired = true;
        taxDeclaration.adjustmentAmount = initialTaxBreakdown.finalTaxWithCess - initialTaxBreakdown.taxWithCess;
        taxDeclaration.adjustmentReason = 'form12b_tds_adjustment';
        taxDeclaration.lastAdjustmentDate = new Date();


        console.log(taxDeclaration, "5 taxDeclaration after Form12B processing")
        // 6. Calculate remaining months
        const remainingMonths = this.calculateRemainingMonthsInFY(financialYear);
        console.log(remainingMonths, "6 remainingMonths after Form12B processing")
        taxDeclaration.remainingMonths = remainingMonths;

        // 7. Calculate monthly adjustment
        if (remainingMonths > 0) {
            taxDeclaration.monthlyAdjustment = Math.round(taxDeclaration.adjustmentAmount / remainingMonths);
        } else {
            taxDeclaration.monthlyAdjustment = taxDeclaration.adjustmentAmount;
            taxDeclaration.adjustmentDistribution = 'one_time';
        }

        // MIGRATION CHECK: Skip monthly deduction recalculation if migration-adjusted
        if (!taxDeclaration.isMigrationAdjusted) {
            // Standard flow: recalculate monthly deductions
            const monthlyDeductions = await this.updateMonthlyDeductionPlan(
                taxDeclaration.monthlyDeductions,
                initialTaxBreakdown.finalTaxWithCess,
                remainingMonths,
                taxDeclaration.adjustmentAmount < 0
            );
            console.log(monthlyDeductions, "8 monthlyDeductions after Form12B processing")
            taxDeclaration.monthlyDeductions = monthlyDeductions;
        } else {
            // Migration override: Log warning about tax mismatch
            const excelTaxTotal =
                taxDeclaration.migrationAdjustment!.externalTaxPaid +
                taxDeclaration.migrationAdjustment!.newSystemTaxToPay;

            const systemTaxAfterForm12B = initialTaxBreakdown.finalTaxWithCess;

            console.warn(
                `[FORM12B MIGRATION WARNING] Tax mismatch for ${taxDeclaration.employeeId}. ` +
                `Excel total: ₹${excelTaxTotal}, System after Form12B: ₹${systemTaxAfterForm12B}. ` +
                `Monthly deductions will NOT be recalculated.`
            );

            // Keep existing monthly deductions from migration adjustment
            console.log("8 Skipping monthly deduction recalculation (migration-adjusted)");
        }

        if (taxDeclaration.remainingTaxToPay < 0) {
            taxDeclaration.excessTaxPaid = Math.abs(taxDeclaration.remainingTaxToPay);
            if (taxDeclaration.excessTaxPaid > taxDeclaration.revisedTaxAmount * 0.25) {
                taxDeclaration.noFurtherTaxDeduction = true;
            }
        }
        console.log(taxDeclaration.excessTaxPaid, "8.1 excessTaxPaid after Form12B processing")
        // 9. Save and return updated tax declaration
        return await taxDeclaration.save();
    }

    async delete(id: Types.ObjectId): Promise<ITaxDeclaration> {
        const taxDeclaration = await TaxDeclaration.findById(id);
        if (!taxDeclaration) {
            throw new Error('Tax Declaration not found');
        }

        await taxDeclaration.deleteOne();
        return taxDeclaration;
    }

    // Bulk update isForm12BApplicable for migration purposes
    // This is a one-time admin operation to enable Form12B for existing employees
    async bulkEnableForm12B(data: {
        employeeIds: string[];
        financialYear: string;
    }): Promise<{
        success: boolean;
        updated: number;
        failed: string[];
        details: Array<{ employeeId: string; status: string; message?: string }>;
    }> {
        const { employeeIds, financialYear } = data;
        const results: Array<{ employeeId: string; status: string; message?: string }> = [];
        let updatedCount = 0;
        const failedEmployees: string[] = [];

        console.log(`Bulk enabling Form12B for FY: ${financialYear}, Employee IDs:`, employeeIds);

        for (const employeeId of employeeIds) {
            try {
                // Find tax declaration for this employee and FY
                const taxDeclaration = await TaxDeclaration.findOne({
                    employeeId: new Types.ObjectId(employeeId),
                    financialYear
                });

                if (!taxDeclaration) {
                    results.push({
                        employeeId,
                        status: 'failed',
                        message: `Tax declaration not found for FY ${financialYear}`
                    });
                    failedEmployees.push(employeeId);
                    continue;
                }

                // Update the flag
                taxDeclaration.isForm12BApplicable = true;
                await taxDeclaration.save();

                results.push({
                    employeeId,
                    status: 'success',
                    message: 'Form12B enabled successfully'
                });
                updatedCount++;

            } catch (error: any) {
                results.push({
                    employeeId,
                    status: 'error',
                    message: error.message
                });
                failedEmployees.push(employeeId);
            }
        }

        return {
            success: updatedCount > 0,
            updated: updatedCount,
            failed: failedEmployees,
            details: results
        };
    }

    // Bulk create tax declarations for migration purposes
    // Checks for existing records and creates only for employees without existing declarations
    async bulkCreateTaxDeclarations(data: {
        employeeIds: string[];
        financialYear: string;
        regime: 'new' | 'old';
    }): Promise<{
        success: boolean;
        created: number;
        skipped: number;
        failed: number;
        skippedEmployees: string[];
        failedEmployees: string[];
        details: Array<{ employeeId: string; status: string; message?: string }>;
    }> {
        const { employeeIds, financialYear, regime } = data;
        const results: Array<{ employeeId: string; status: string; message?: string }> = [];
        let createdCount = 0;
        let skippedCount = 0;
        let failedCount = 0;
        const skippedEmployees: string[] = [];
        const failedEmployees: string[] = [];

        console.log(`Bulk creating tax declarations for FY: ${financialYear}, Regime: ${regime}, Employee IDs:`, employeeIds);

        for (const employeeId of employeeIds) {
            try {
                // Check if tax declaration already exists for this employee and FY
                const existingDeclaration = await TaxDeclaration.findOne({
                    employeeId: new Types.ObjectId(employeeId),
                    financialYear
                });

                if (existingDeclaration) {
                    results.push({
                        employeeId,
                        status: 'skipped',
                        message: `Tax declaration already exists for FY ${financialYear}`
                    });
                    skippedEmployees.push(employeeId);
                    skippedCount++;
                    continue;
                }

                // Create tax declaration using existing create method
                await this.create({
                    employeeId,
                    financialYear,
                    regime
                });

                results.push({
                    employeeId,
                    status: 'success',
                    message: 'Tax declaration created successfully'
                });
                createdCount++;

            } catch (error: any) {
                results.push({
                    employeeId,
                    status: 'failed',
                    message: error.message
                });
                failedEmployees.push(employeeId);
                failedCount++;
            }
        }

        return {
            success: createdCount > 0,
            created: createdCount,
            skipped: skippedCount,
            failed: failedCount,
            skippedEmployees,
            failedEmployees,
            details: results
        };
    }

    async findAll(query: { page?: number; limit?: number; search?: string; financialYear?: string; isSubmissionsEnabled?: boolean; isMigrationAdjusted?: boolean; isMigrationInitialized?: boolean }):
        Promise<{
            taxDeclarations: ITaxDeclaration[],
            meta: { page: number, limit: number, total: number, totalPages: number }
        }> {
        const { page = 1, limit = 10, search, financialYear, isSubmissionsEnabled, isMigrationAdjusted, isMigrationInitialized } = query;
        const skip = (page - 1) * limit;
        console.log(query, "query")
        console.log(page, limit, search, financialYear, "*****")
        const filter: any = {};

        // Filter by regime (search)
        if (search) {
            filter.regime = { $regex: search, $options: 'i' }; // Case-insensitive search
        }

        // Filter by financial year
        if (financialYear) {
            filter.financialYear = financialYear;
        }

        // Filter by submission status
        if (typeof isSubmissionsEnabled !== 'undefined') {
            filter.isSubmissionsEnabled = isSubmissionsEnabled;
        }

        // Filter by migration status
        if (typeof isMigrationAdjusted !== 'undefined') {
            filter.isMigrationAdjusted = isMigrationAdjusted;
        }

        // Filter by migration initialization status
        if (typeof isMigrationInitialized !== 'undefined') {
            filter.isMigrationInitialized = isMigrationInitialized;
        }

        const [taxDeclarations, total] = await Promise.all([
            TaxDeclaration.find(filter).skip(skip).limit(limit),
            TaxDeclaration.countDocuments(filter),
        ]);

        return {
            taxDeclarations,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findById(id: Types.ObjectId): Promise<ITaxDeclaration> {
        const taxDeclaration = await TaxDeclaration.findById(id);
        if (!taxDeclaration) {
            throw new Error('Tax Declaration not found');
        }
        return taxDeclaration;
    }

    async getUserCurrentFY(userId: Types.ObjectId): Promise<ITaxDeclaration | null> {
        try {
            const currentFY = getCurrentFinancialYear();
            console.log(`Fetching tax declaration for User: ${userId}, FY: ${currentFY}`);

            const taxDeclaration = await TaxDeclaration.findOne({
                employeeId: userId,
                financialYear: currentFY,
            });

            if (!taxDeclaration) {
                console.warn(`No tax declaration found for User: ${userId} in FY: ${currentFY}`);
                return null;
            }
            return taxDeclaration;
        } catch (error: any) {
            console.error(`Error fetching tax declaration: ${error.message}`);
            throw new Error('Failed to fetch tax declaration');
        }
    }



    //inial calculation when record is created
    private async calculateIncomeTax(
        annualGross: number,
        regime: 'old' | 'new',
        investments: number = 0,
        standardDeduction: number = 50000,
        taxSlabs: { fromAmount: number; toAmount: number | null; taxRate: number }[],
        cessRate: number = 4,
        ptDeduction: number = 0
    ): Promise<ITaxBreakdown> {
        console.log("Input parameters:");
        console.log("annualGross:", annualGross);
        console.log("regime:", regime);
        console.log("investments:", investments);
        console.log("standardDeduction:", standardDeduction);
        console.log("ptDeduction:", ptDeduction);
        console.log("taxSlabs:", taxSlabs);

        // Calculate taxable income based on regime
        const useInvestments = regime === 'old' ? investments : 0;
        console.log("useInvestments:", useInvestments);

        const taxableIncome = annualGross - standardDeduction - ptDeduction - useInvestments;
        console.log("calculatedTaxableIncome:", taxableIncome);

        // Early return if no taxable income
        if (taxableIncome <= 0) {
            console.log("No taxable income, returning zeros");
            return {
                taxAmount: 0,
                slabwiseTax: [],
                cessAmount: 0,
                totalTaxAmount: 0,
                taxableIncome,
                rebateAmount: 0,
                isRebateApplicable: false,
                marginalReliefAmount: 0,
                isMarginalReliefApplicable: false,
                taxWithCess: 0,
                finalTaxWithCess: 0,
                form12bTDSAmount: 0,
                ptDeduction
            };
        }

        // Sort slabs by fromAmount
        const sortedSlabs = [...taxSlabs].sort((a, b) => a.fromAmount - b.fromAmount);
        console.log("Sorted slabs:", JSON.stringify(sortedSlabs, null, 2));

        let totalTax = 0;
        const slabwiseTax: ISlabwiseTax[] = [];

        // Process each slab
        // Calculate Slab-Based Tax (SBT)
        for (const slab of sortedSlabs) {

            console.log(slab, "slab in sortedSlabs")
            const { fromAmount, toAmount, taxRate } = slab;
            // Skip this slab if taxable income is below its range
            if (taxableIncome <= fromAmount) continue;

            // Determine the taxable amount in this slab
            let taxableAmountInSlab = 0;

            if (toAmount === null) {
                // This is the highest slab with no upper limit
                taxableAmountInSlab = taxableIncome - fromAmount;
                console.log(`Highest slab, taxable amount = ${taxableIncome} - ${fromAmount} = ${taxableAmountInSlab}`);
            } else {
                taxableAmountInSlab = taxableIncome <= toAmount ? taxableIncome - fromAmount : toAmount - fromAmount;
                console.log(`Income within slab, taxable amount = ${taxableIncome} - ${fromAmount} = ${taxableAmountInSlab}`);
            }
            // Calculate tax for this slab
            const taxForSlab = Math.round(taxableAmountInSlab * (taxRate / 100));
            totalTax += taxForSlab;

            // Format slab description
            const slabDesc = `${fromAmount} to ${toAmount === null ? 'above' : toAmount}`;
            // Add to slabwise tax breakdown
            slabwiseTax.push({ slab: slabDesc, amount: taxForSlab, fromAmount, toAmount });
        }
        console.log(taxableIncome, totalTax, "taxableIncome, totalTax")
        console.log(cessRate, taxSlabs, "cessRate, taxSlabs");
        console.log(slabwiseTax, "taxSlabs in calculateIncomeTax")
        const {
            rebateAmount,
            isRebateApplicable,
            marginalReliefAmount,
            isMarginalReliefApplicable,
            totalTaxAmount,
            cessAmount,
            taxWithCess
        } = this.calculateRebateAndRelief(regime, taxableIncome, totalTax, cessRate, taxSlabs, slabwiseTax);

        const result = {
            taxAmount: totalTax, //SBT
            slabwiseTax,
            cessAmount,
            totalTaxAmount, // SBT after rebate/marginal relief
            taxableIncome: Math.round(taxableIncome),
            rebateAmount,
            isRebateApplicable,
            marginalReliefAmount,
            isMarginalReliefApplicable,
            taxWithCess,
            finalTaxWithCess: taxWithCess,
            form12bTDSAmount: 0,
            ptDeduction
        };

        console.log("Final result:", JSON.stringify(result, null, 2));
        return result;
    }


    //recalculate tax when Admin verify declaration amount
    private async recalculateTax(taxDeclaration: ITaxDeclarationUpdate): Promise<ITaxBreakdown & { totalVerifiedAmount: number }> {
        const { financialYear, regime, annualGross, standardDeduction, ptDeduction, declarations } = taxDeclaration;

        // 1. Get current FY tax slab
        const taxSlab = await TaxSlab.findOne({
            financialYear,
            regime,
            isActive: true
        }) as ITaxSlab | null;
        if (!taxSlab) {
            throw new Error(`Tax slab not found for FY ${taxDeclaration.financialYear} and regime ${regime}`);
        }
        console.log(taxSlab, "1 taxSlab");

        // Convert the Mongoose slab documents to plain objects for calculation
        const plainSlabs = taxSlab.slabs.map(slab => ({
            fromAmount: Number(slab.fromAmount),
            toAmount: slab.toAmount !== null ? Number(slab.toAmount) : null,
            taxRate: Number(slab.taxRate)
        }));
        console.log(plainSlabs, "3.2 plain slabs for calculation");

        // Calculate total verified amount
        const totalVerifiedAmount = declarations
            .filter(d => d.status === "verified")
            .reduce((sum, d) => {
                const amount = d.verifiedAmount || 0;
                if (d.section === 'income_loss_house_property') {
                    const absAmount = Math.abs(amount);
                    if (d.type === 'income') {
                        return sum - absAmount;
                    } else {
                        const cappedLoss = d.maxLimit ? Math.min(absAmount, d.maxLimit) : Math.min(absAmount, 200000);
                        return sum + cappedLoss;
                    }
                }
                const cappedAmount = (d.maxLimit && d.maxLimit > 0) ? Math.min(amount, d.maxLimit) : amount;
                return sum + cappedAmount;
            }, 0);

        // Calculate tax with rebate and marginal relief
        const taxBreakdown = await this.calculateIncomeTax(
            annualGross,
            regime,
            totalVerifiedAmount,
            standardDeduction,
            plainSlabs,
            taxSlab.cessRate,
            ptDeduction || 0
        );

        return { ...taxBreakdown, totalVerifiedAmount };
    }

    private calculateRebateAndRelief(
        regime: 'old' | 'new',
        taxableIncome: number,
        totalTax: number,
        cessRate: number,
        taxSlabs: { fromAmount: number; toAmount: number | null; taxRate: number }[],
        slabwiseTax: ISlabwiseTax[]
    ): Pick<ITaxBreakdown, 'rebateAmount' | 'isRebateApplicable' | 'marginalReliefAmount' | 'isMarginalReliefApplicable' | 'totalTaxAmount' | 'cessAmount' | 'taxWithCess'> {
        let rebateAmount = 0;
        let isRebateApplicable = false;
        let marginalReliefAmount = 0;
        let isMarginalReliefApplicable = false;
        let totalTaxAmount = totalTax;
        console.log(slabwiseTax, "slabwiseTax in calculateRebateAndRelief")
        // Define rebate thresholds and marginal relief base
        const rebateThreshold = regime === 'old' ? 12500 : 60000;
        const marginalReliefBase = regime === 'old' ? 500000 : 1200000;

        // Calculate the marginal relief upper limit dynamically
        let marginalReliefUpperLimit = marginalReliefBase;
        const sortedSlabs = [...taxSlabs].sort((a, b) => a.fromAmount - b.fromAmount);

        // Find the slab where marginal relief applies
        for (const slab of sortedSlabs) {
            if (slab.fromAmount >= marginalReliefBase && slab.taxRate > 0) {
                // Calculate taxable income where SBT = Excess Income + rebateThreshold
                const taxRate = slab.taxRate / 100;
                // SBT = BaseTax + taxRate * (TI - slab.fromAmount)
                // Excess = TI - marginalReliefBase
                // Set SBT = Excess + rebateThreshold
                // BaseTax + taxRate * (TI - slab.fromAmount) = (TI - marginalReliefBase) + rebateThreshold
                // Solve for TI
                const baseTax = sortedSlabs
                    .filter(s => s.fromAmount < slab.fromAmount && s.fromAmount < taxableIncome)
                    .reduce((sum, s) => {
                        const amount = s.toAmount ? Math.min(s.toAmount, taxableIncome) - s.fromAmount : taxableIncome - s.fromAmount;
                        return sum + amount * (s.taxRate / 100);
                    }, 0);
                const ti = (baseTax + marginalReliefBase + rebateThreshold - taxRate * slab.fromAmount) / (1 - taxRate);
                if (ti > slab.fromAmount && (!slab.toAmount || ti <= slab.toAmount)) {
                    marginalReliefUpperLimit = Math.round(ti);
                    break;
                }
            }
        }

        // Apply Rebate (87A(a)) and Marginal Relief (87A(b))
        if (regime === 'old') {
            // Rebate eligibility: SBT ≤ ₹12,500
            // if (totalTax <= rebateThreshold) {
            //     rebateAmount = totalTax;
            //     isRebateApplicable = true;
            //     totalTaxAmount = 0;
            // } else {
            //     // Marginal relief: TI between ₹5,00,001 and calculated upper limit
            //     const excessIncome = taxableIncome - marginalReliefBase;
            //     if (taxableIncome > marginalReliefBase && taxableIncome <= marginalReliefUpperLimit && totalTax > excessIncome) {
            //         marginalReliefAmount = totalTax - excessIncome;
            //         isMarginalReliefApplicable = true;
            //         totalTaxAmount = excessIncome;
            //     }
            // }
            // Rebate eligibility: Total income ≤ ₹5,00,000, up to ₹12,500
            if (taxableIncome <= marginalReliefBase && totalTax <= rebateThreshold) {
                rebateAmount = totalTax;
                isRebateApplicable = true;
                totalTaxAmount = 0;
            }
            // No marginal relief or rebate if total income > ₹5,00,000
        } else { // New regime
            // Rebate eligibility: SBT ≤ ₹60,000
            if (totalTax <= rebateThreshold) {
                rebateAmount = totalTax;
                isRebateApplicable = true;
                totalTaxAmount = 0;
            } else {
                // Marginal relief: TI between ₹12,00,001 and calculated upper limit
                const excessIncome = taxableIncome - marginalReliefBase;
                if (taxableIncome > marginalReliefBase && taxableIncome <= marginalReliefUpperLimit && totalTax > excessIncome) {
                    marginalReliefAmount = totalTax - excessIncome;
                    isMarginalReliefApplicable = true;
                    totalTaxAmount = excessIncome;
                }
            }
        }

        // Calculate cess and final tax
        const cessAmount = Math.round(totalTaxAmount * (cessRate / 100));

        const taxWithCess = totalTaxAmount + cessAmount;

        return {
            rebateAmount,
            isRebateApplicable,
            marginalReliefAmount,
            isMarginalReliefApplicable,
            totalTaxAmount,
            cessAmount,
            taxWithCess
        };
    }


    private async createMonthlyDeductionPlan(financialYear: string, totalTaxAmount: number, regimeMonth?: string) {

        console.log("createMonthlyDeductionPlan", financialYear, totalTaxAmount)
        const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

        // If regimeMonth is not provided, use current month
        let selectedMonth = regimeMonth;
        if (!selectedMonth) {
            const currentDate = new Date();
            const currentMonthIndex = currentDate.getMonth(); // 0-11 (Jan-Dec)

            // Convert calendar month to our financial year month format
            // Jan = 9, Feb = 10, Mar = 11, Apr = 0, May = 1, ..., Dec = 8
            let financialMonthIndex;
            if (currentMonthIndex <= 2) {
                // Jan (0) -> 9, Feb (1) -> 10, Mar (2) -> 11
                financialMonthIndex = currentMonthIndex + 9;
            } else {
                // Apr (3) -> 0, May (4) -> 1, ..., Dec (11) -> 8
                financialMonthIndex = currentMonthIndex - 3;
            }

            selectedMonth = months[financialMonthIndex];
        }

        // Validate that selected month is in the months array
        const startIndex = months.indexOf(selectedMonth);
        if (startIndex === -1) {
            throw new Error(`Invalid regime start month: ${selectedMonth}. Month must be one of: ${months.join(", ")}`);
        }

        // Number of months remaining from the selected month till March
        const remainingMonths = months.slice(startIndex);
        const monthCount = remainingMonths.length;

        // Divide tax amount among remaining months
        const monthlyDeduction = Math.floor(totalTaxAmount / monthCount);
        let remainingAmount = totalTaxAmount - (monthlyDeduction * monthCount);

        // Parse financial year for date calculations
        const [startYear, endYear] = financialYear.split('-').map(year => parseInt(year));

        const deductions = months.map((month, index) => {
            if (index < startIndex) {
                return {
                    month,
                    financialYear,
                    plannedDeduction: 0,
                    actualDeduction: 0,
                    adjustmentAmount: 0,
                    plannedDate: null,
                    isProcessed: false
                };
            }

            let adjustment = 0;
            if (remainingAmount > 0) {
                adjustment = 1;
                remainingAmount -= 1;
            }

            // Calculate correct plannedDate
            // For Apr-Dec: use startYear, for Jan-Mar: use endYear
            const year = (index <= 8) ? startYear : endYear; // 8 is index of Dec, 9 is index of Jan

            // Convert month index to calendar month (0-11 for Date constructor)
            // Apr (index 0) = calendar month 3, May (index 1) = calendar month 4, etc.
            let calendarMonth;
            if (index <= 8) {
                // Apr-Dec: 3-11
                calendarMonth = index + 3;
            } else {
                // Jan-Mar: 0-2
                calendarMonth = index - 9;
            }

            // Set to 2nd day of the month as required
            const plannedDate = new Date(year, calendarMonth, 2);

            return {
                month,
                financialYear,
                plannedDeduction: monthlyDeduction + adjustment,
                actualDeduction: monthlyDeduction + adjustment,
                adjustmentAmount: adjustment,
                plannedDate,
                isProcessed: false,
            };
        });

        return deductions;
    }

    private calculateRemainingMonthsInFY(financialYear: string) {
        const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

        const [startYear, endYear] = financialYear.split("-").map(Number);
        const fyStartDate = new Date(startYear, 3, 1); // April 1st of start year
        const fyEndDate = new Date(endYear, 2, 31); // March 31st of end year
        const today = new Date();

        // If today's date is before the FY start (upcoming FY) or after the FY end (past FY), return 0
        if (today < fyStartDate || today > fyEndDate) return 0;

        // Find the current month in the FY
        const currentMonthIndex = today.getMonth(); // 0-based index (Jan = 0, Apr = 3)
        const financialYearIndex = months.findIndex((_, i) => {
            return new Date(startYear, i + 3, 1).getMonth() === currentMonthIndex;
        });

        // Remaining months in the financial year (1 if today is in March)
        let remainingMonths = financialYearIndex >= 11 ? 1 : months.length - financialYearIndex;
        console.log(remainingMonths, "remainingMonths")
        return remainingMonths;
    }

    private async updateMonthlyDeductionPlan(
        monthlyDeductions: IMonthlyTaxDeduction[],
        newTotalTax: number,
        remainingMonths: number,
        isRefund: boolean
    ): Promise<IMonthlyTaxDeduction[]> {
        console.log(isRefund, "isRefund")
        // 1. Validate inputs
        if (remainingMonths <= 0 || !monthlyDeductions?.length) {
            return monthlyDeductions;
        }

        // 2. Define month order
        const monthOrder = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
        const targetMonth = monthOrder[monthOrder.length - remainingMonths];

        // 3. Find start index for adjustments
        const startIndex = monthlyDeductions.findIndex(m => m.month === targetMonth);
        if (startIndex === -1) {
            return monthlyDeductions;
        }

        // 4. Calculate total processed deductions
        const processedDeductions = monthlyDeductions
            .filter(m => m.isProcessed)
            .reduce((sum, m) => sum + (m.actualDeduction || 0), 0);

        // 5. Calculate remaining tax to distribute
        const remainingTax = Math.max(0, newTotalTax - processedDeductions);

        // 6. Count unprocessed months from startIndex
        const unprocessedMonths = monthlyDeductions.slice(startIndex).filter(m => !m.isProcessed);
        const unprocessedMonthCount = unprocessedMonths.length;
        if (unprocessedMonthCount === 0) {
            return monthlyDeductions;
        }

        // 7. Calculate new planned deduction per month
        const newPlannedDeduction = Math.floor(remainingTax / unprocessedMonthCount);
        let remainingAmount = remainingTax - (newPlannedDeduction * unprocessedMonthCount);

        // 8. Update unprocessed months
        for (let i = startIndex; i < monthlyDeductions.length; i++) {
            const month = monthlyDeductions[i];
            if (month.isProcessed) continue;

            // Assign new planned deduction
            const adjustment = remainingAmount > 0 ? 1 : 0;
            remainingAmount -= adjustment;
            month.plannedDeduction = newPlannedDeduction + adjustment;

            // Store the old actualDeduction to calculate the adjustment
            const oldActualDeduction = month.actualDeduction;

            // Update actualDeduction for unprocessed months to match new plan
            if (!month.isProcessed) {
                month.actualDeduction = month.plannedDeduction;
            }

            // Calculate adjustmentAmount as the change from old plan
            // For unprocessed months: newActualDeduction - oldActualDeduction
            // For processed months: 0 (no change)
            month.adjustmentAmount = month.actualDeduction - oldActualDeduction;

            // Ensure plannedDate is set
            month.plannedDate = month.plannedDate || new Date();
        }

        return monthlyDeductions;
        /* console.log(isRefund, "isRefund")
         const monthOrder = [
             "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"
         ];
 
         // Find the starting index based on the remaining months count
         const targetMonth = monthOrder[monthOrder.length - remainingMonths];
         const startIndex = monthlyDeductions.findIndex(m => m.month === targetMonth);
 
         if (startIndex === -1) return monthlyDeductions; // If no valid start index, return original array
 
         // Update only the remaining months
         for (let i = startIndex; i < monthlyDeductions.length; i++) {
 
             monthlyDeductions[i].plannedDeduction += monthlyAdjustment;
             monthlyDeductions[i].adjustmentAmount = monthlyAdjustment;
             // monthlyDeductions[i].actualDeduction = monthlyAdjustment;
 
         }
 
         return monthlyDeductions;
         */
    }

    // ==================== MIGRATION ADJUSTMENT METHODS ====================
    // For HRMS Migration - December 2025

    /**
     * Validate migration adjustment data against system records
     */
    private async validateMigrationData(data: IMigrationAdjustmentInput): Promise<void> {
        const { employeeId, regime, financialYear, externalTaxPaid, externalTaxPaidMonths, newSystemTaxToPay, newSystemTaxMonths } = data;

        // Rule 1: FY Validation
        const currentFY = getCurrentFinancialYear();
        if (financialYear !== currentFY) {
            throw new Error(`Migration upload only allowed for current FY: ${currentFY}. Provided FY: ${financialYear}`);
        }

        // Rule 2: Month Count Validation
        if (externalTaxPaidMonths + newSystemTaxMonths !== 12) {
            throw new Error(
                `Invalid month distribution for ${employeeId}: ` +
                `${externalTaxPaidMonths} + ${newSystemTaxMonths} ≠ 12`
            );
        }

        // Fetch existing tax declaration
        const taxDeclaration = await TaxDeclaration.findOne({
            employeeId: new Types.ObjectId(employeeId),
            financialYear
        });

        if (!taxDeclaration) {
            throw new Error(`Tax declaration not found for ${employeeId} in FY ${financialYear}`);
        }

        // Rule 3: Regime Validation
        if (regime !== taxDeclaration.regime.toUpperCase()) {
            throw new Error(
                `Regime mismatch for ${employeeId}: ` +
                `Excel (${regime}) vs System (${taxDeclaration.regime.toUpperCase()})`
            );
        }

        // Rule 4: Tax Amount Consistency
        const calculatedTotalTax = externalTaxPaid + newSystemTaxToPay;
        const systemCalculatedTax = taxDeclaration.initialTaxBreakdown.finalTaxWithCess;
        const tolerance = systemCalculatedTax * 0.01; // 1% tolerance

        if (Math.abs(calculatedTotalTax - systemCalculatedTax) > tolerance) {
            console.warn(
                `[MIGRATION INFO] Tax mismatch for ${employeeId}: ` +
                `Excel total (₹${calculatedTotalTax}) differs from System (₹${systemCalculatedTax}). ` +
                `Using Excel total as the True Final Tax Liability (assuming pre-existing declarations).`
            );
        }

        // Rule 5: Remaining Months Validation (Warning only)
        const currentMonth = new Date().getMonth(); // 0-11
        const fyStartMonth = 3; // April = 3
        let actualRemainingMonths;

        if (currentMonth >= fyStartMonth) {
            actualRemainingMonths = 12 - (currentMonth - fyStartMonth);
        } else {
            actualRemainingMonths = 3 - currentMonth;
        }

        if (newSystemTaxMonths !== actualRemainingMonths) {
            console.warn(
                `[MIGRATION WARNING] Employee ${employeeId}: ` +
                `Excel shows ${newSystemTaxMonths} remaining months, ` +
                `but system calculates ${actualRemainingMonths}. Using Excel value.`
            );
        }
    }

    /**
     * Override monthly deductions for remaining months only.
     *
     * - Past months  (index < externalTaxPaidMonths):
     *     Evenly distribute externalTaxPaid (floor + 1 for remainder),
     *     mark isProcessed = true, set plannedDate to 5th of that month.
     *     adjustmentAmount is left unchanged (spread from existing record).
     *
     * - Future months (index >= externalTaxPaidMonths):
     *     Unchanged from original logic — evenly split newTaxToPay.
     *
     * startIndex = externalTaxPaidMonths (≡ months.length - remainingMonths
     *   since externalTaxPaidMonths + newSystemTaxMonths === 12 is already validated).
     */
    private overrideRemainingMonths(
        monthlyDeductions: IMonthlyTaxDeduction[],
        newTaxToPay: number,
        remainingMonths: number,
        externalTaxPaid: number,
        externalTaxPaidMonths: number,
        financialYear: string
    ): IMonthlyTaxDeduction[] {
        const [startYear, endYear] = financialYear.split('-').map(Number);

        // startIndex separates past months from future months.
        // Since externalTaxPaidMonths + newSystemTaxMonths === 12 (validated),
        // this equals months.length - remainingMonths — same as before.
        const startIndex = externalTaxPaidMonths;

        // --- External (past) months: evenly split externalTaxPaid ---
        const externalMonthlyAmount = externalTaxPaidMonths > 0
            ? Math.floor(externalTaxPaid / externalTaxPaidMonths)
            : 0;
        let externalRemainder = externalTaxPaidMonths > 0
            ? externalTaxPaid - (externalMonthlyAmount * externalTaxPaidMonths)
            : 0;

        // --- Future (remaining) months: evenly split newTaxToPay (unchanged logic) ---
        const newMonthlyAmount = remainingMonths > 0
            ? Math.floor(newTaxToPay / remainingMonths)
            : 0;
        let newRemainder = remainingMonths > 0
            ? newTaxToPay - (newMonthlyAmount * remainingMonths)
            : 0;

        return monthlyDeductions.map((deduction, index) => {
            if (index < startIndex) {
                // ── PAST MONTHS ──────────────────────────────────────────────
                // Distribute externalTaxPaid evenly; first months absorb the
                // remainder (1 extra rupee each) so the total sums exactly.
                const externalAdjustment = externalRemainder > 0 ? 1 : 0;
                externalRemainder -= externalAdjustment;

                // plannedDate = 5th of this month in the correct calendar year.
                // Apr–Dec (index 0–8) belong to startYear;
                // Jan–Mar (index 9–11) belong to endYear.
                const year = index <= 8 ? startYear : endYear;
                const calendarMonth = index <= 8 ? index + 3 : index - 9; // 0-based
                const plannedDate = new Date(year, calendarMonth, 5);

                return {
                    ...deduction,           // preserves adjustmentAmount as-is
                    plannedDeduction: externalMonthlyAmount + externalAdjustment,
                    actualDeduction: externalMonthlyAmount + externalAdjustment,
                    isProcessed: true,
                    plannedDate
                };
            } else {
                // ── FUTURE / REMAINING MONTHS ─────────────────────────────
                // Exact same logic as before — do NOT touch this block.
                const adjustment = newRemainder > 0 ? 1 : 0;
                newRemainder -= adjustment;

                return {
                    ...deduction,
                    plannedDeduction: newMonthlyAmount + adjustment,
                    actualDeduction: newMonthlyAmount + adjustment,
                    adjustmentAmount: adjustment,
                    isProcessed: false
                };
            }
        });
    }

    /**
     * Apply migration adjustment from Excel upload
     * This method processes bulk migration data and updates tax declarations
     */
    async applyMigrationAdjustment(
        migrationData: IMigrationAdjustmentInput[],
        uploadedBy: string
    ): Promise<IMigrationAdjustmentResult> {
        const results: IMigrationAdjustmentResult = {
            success: true,
            processed: 0,
            failed: 0,
            results: []
        };

        for (const data of migrationData) {
            try {
                // 1. Validate all rules
                await this.validateMigrationData(data);

                // 2. Fetch existing tax declaration
                const taxDeclaration = await TaxDeclaration.findOne({
                    employeeId: new Types.ObjectId(data.employeeId),
                    financialYear: data.financialYear
                });

                if (!taxDeclaration) {
                    throw new Error(`Tax declaration not found for ${data.employeeId}`);
                }

                // 3. Backup original monthly deductions
                const originalMonthlyDeductions = JSON.parse(
                    JSON.stringify(taxDeclaration.monthlyDeductions)
                );

                // 4. Override monthly deductions:
                //    - Past months  → evenly distribute externalTaxPaid, isProcessed = true
                //    - Future months → evenly distribute newSystemTaxToPay, isProcessed = false
                const newMonthlyDeductions = this.overrideRemainingMonths(
                    taxDeclaration.monthlyDeductions,
                    data.newSystemTaxToPay,
                    data.newSystemTaxMonths,
                    data.externalTaxPaid,
                    data.externalTaxPaidMonths,
                    data.financialYear
                );

                // 5. Update tax declaration with migration override
                const totalMigratedTax = data.externalTaxPaid + data.newSystemTaxToPay;

                taxDeclaration.isMigrationAdjusted = true;
                taxDeclaration.migrationAdjustment = {
                    appliedForFY: data.financialYear,
                    uploadedAt: new Date(),
                    uploadedBy: new Types.ObjectId(uploadedBy),
                    externalTaxPaid: data.externalTaxPaid,
                    externalTaxPaidMonths: data.externalTaxPaidMonths,
                    newSystemTaxToPay: data.newSystemTaxToPay,
                    newSystemTaxMonths: data.newSystemTaxMonths,
                    totalMigratedTaxLiability: totalMigratedTax, // ✅ Store True Tax
                    originalMonthlyDeductions: originalMonthlyDeductions,
                    overrideReason: 'HRMS Migration December 2025'
                };

                // 6. Update taxPaid and Remaining Tax
                taxDeclaration.taxPaid = data.externalTaxPaid;
                taxDeclaration.remainingTaxToPay = data.newSystemTaxToPay;
                taxDeclaration.monthlyDeductions = newMonthlyDeductions;

                // ✅ FORCE Revised Tax Amount to match Excel Total
                // This ensures Validation/Accounting consistency
                taxDeclaration.revisedTaxAmount = totalMigratedTax;

                // 7. Save
                await taxDeclaration.save();

                console.log(`[MIGRATION SUCCESS] Applied migration adjustment for employee ${data.employeeId}`);

                results.processed++;
                results.results.push({
                    employeeId: data.employeeId,
                    status: 'success',
                    oldMonthlyPlan: originalMonthlyDeductions,
                    newMonthlyPlan: newMonthlyDeductions
                });

            } catch (error: any) {
                console.error(`[MIGRATION FAILED] Employee ${data.employeeId}: ${error.message}`);

                results.failed++;
                results.results.push({
                    employeeId: data.employeeId,
                    status: 'failed',
                    message: error.message
                });
            }
        }

        results.success = results.failed === 0;
        console.log(
            `[MIGRATION SUMMARY] Total: ${migrationData.length}, ` +
            `Processed: ${results.processed}, Failed: ${results.failed}`
        );

        return results;
    }

    /**
     * Preview migration adjustment from Excel data
     */
    async previewMigrationAdjustment(
        migrationData: IMigrationAdjustmentInput[]
    ): Promise<IMigrationPreviewResult> {
        const previewResult: IMigrationPreviewResult = {
            summary: {
                totalRows: migrationData.length,
                validRows: 0,
                invalidRows: 0
            },
            validRows: [],
            invalidRows: []
        };

        const seenEmployeeIds = new Set<string>();

        for (let i = 0; i < migrationData.length; i++) {
            const data = migrationData[i];
            const rowNumber = i + 2; // +1 for 0-index, +1 for header row
            const previewRow: IMigrationPreviewRow = {
                ...data,
                rowNumber,
                isValid: true,
                errors: []
            };

            try {
                // 1. Duplicate & ID Format Validation
                if (seenEmployeeIds.has(data.employeeId)) {
                    previewRow.errors.push(`Duplicate record in file for employee ${data.employeeId}`);
                }
                seenEmployeeIds.add(data.employeeId);

                if (!data.employeeId || !Types.ObjectId.isValid(data.employeeId)) {
                    throw new Error(`Invalid Employee ID format: ${data.employeeId}. Must be a 24-character hex string.`);
                }

                // 2. Fetch User and Tax Declaration to get names and verification
                const user = await User.findOne({ _id: new Types.ObjectId(data.employeeId) }).select('name').lean();
                if (!user) {
                    throw new Error(`Employee ID ${data.employeeId} not found in system`);
                }
                previewRow.employeeName = user.name;

                const taxDeclaration = await TaxDeclaration.findOne({
                    employeeId: new Types.ObjectId(data.employeeId),
                    financialYear: data.financialYear
                }).lean();

                if (!taxDeclaration) {
                    throw new Error(`Tax declaration not found for ${data.employeeId} in FY ${data.financialYear}`);
                }

                previewRow.systemCalculatedTax = taxDeclaration.initialTaxBreakdown.finalTaxWithCess;

                // 2. Run validations (we use the logic from validateMigrationData but collect errors)
                const currentFY = getCurrentFinancialYear();
                if (data.financialYear !== currentFY) {
                    previewRow.errors.push(`FY mismatch: Excel shows ${data.financialYear}, System requires ${currentFY}`);
                }

                if (data.externalTaxPaidMonths + data.newSystemTaxMonths !== 12) {
                    previewRow.errors.push(`Invalid month distribution: ${data.externalTaxPaidMonths} + ${data.newSystemTaxMonths} ≠ 12`);
                }

                if (data.regime.toUpperCase() !== taxDeclaration.regime.toUpperCase()) {
                    previewRow.errors.push(`Regime mismatch: Excel (${data.regime}) vs System (${taxDeclaration.regime.toUpperCase()})`);
                }

                if (previewRow.errors.length > 0) {
                    throw new Error("Validation failed");
                }

                previewResult.validRows.push(previewRow);
                previewResult.summary.validRows++;

            } catch (error: any) {
                previewRow.isValid = false;
                if (previewRow.errors.length === 0) {
                    previewRow.errors.push(error.message);
                }
                previewResult.invalidRows.push(previewRow);
                previewResult.summary.invalidRows++;
            }
        }

        return previewResult;
    }

    /**
     * Generate Excel template for migration adjustment
     */
    async generateMigrationTemplate(): Promise<Buffer> {
        // Sheet 1: Template (Headers Only)
        const headers = [
            'user',
            'regime',
            'FY',
            'tax_paid_amount',
            'tax_paid_months',
            'tax_to_be_paid_amount', // New System Tax
            'tax_to_be_paid_months'  // New System Months
        ];

        // Create empty data array with headers as keys for clarity (though strictly we just need headers)
        // Using aoa_to_sheet for explicit header control
        const templateData = [headers];
        const templateSheet = xlsx.utils.aoa_to_sheet(templateData);

        // Adjust column widths for better readability
        templateSheet['!cols'] = [
            { wch: 15 }, // user
            { wch: 10 }, // regime
            { wch: 12 }, // FY
            { wch: 15 }, // tax_paid_amount
            { wch: 15 }, // tax_paid_months
            { wch: 20 }, // tax_to_be_paid_amount
            { wch: 20 }  // tax_to_be_paid_months
        ];

        // Sheet 2: Reference (User Details & Instructions)
        // Fetch all active users to populate reference sheet using CORRECT field names from user.model.ts
        const users = await User.find({ active: true }).select('_id name email').lean();

        // Add instructions to Reference sheet (or a separate Instructions sheet? 
        // User asked for "sheet 2 - ref with user name and id and each other column expected format value")

        // Let's create a separate "Instructions" sheet or append to Reference.
        // The requirement says "sheet 2 - ref ... and each other column expected format value"
        // I'll add instructions as a separate small table in Reference sheet or a 3rd sheet.
        // Let's stick to 2 sheets as requested: "sheet 1 -- headers", "sheet 2 - ref".
        // I'll put user list first, then instructions below or to the side. 
        // Actually, mixing data types in one sheet is messy. 
        // I will add a 3rd sheet "Instructions" for clarity, or just put it in Reference.
        // Let's put instructions in "Reference" sheet, starting at column G or H, or just use a separate "Instructions" sheet?
        // The prompt said "return excel file as response with 2 sheets". I should strictly follow "2 sheets".

        // Let's create a combined Reference sheet.
        // But `json_to_sheet` creates a table.
        // Maybe I should create a "Users" sheet and an "Instructions" sheet?
        // The prompt says "sheet 2 - ref with user name and id AND each other column expected format".
        // I will interpret this as: Sheet 2 contains User Reference AND Format Instructions.

        // Let's build Sheet 2 manually with AOA to combine tables.
        const refSheetData: any[][] = [
            ['COLUMN FORMAT INSTRUCTIONS'],
            ['Column Name', 'Description', 'Expected Format', 'Example'],
            ['user', 'Employee ID from system (Matches "User ID" in table below)', 'Text', 'EMP001'],
            ['regime', 'Tax Regime', 'Text (OLD/NEW)', 'NEW'],
            ['FY', 'Financial Year', 'Text (YYYY-YYYY)', '2025-2026'],
            ['tax_paid_amount', 'Tax already paid in previous system (Apr-Dec)', 'Number', '90000'],
            ['tax_paid_months', 'Number of months tax paid externally', 'Number (1-12)', '9'],
            ['tax_to_be_paid_amount', 'Tax remaining to be paid in this system (Jan-Mar)', 'Number', '30000'],
            ['tax_to_be_paid_months', 'Number of months remaining in current FY', 'Number (1-12)', '3'],
            [], // Row 12
            [], // Row 13
            ['ACTIVE USERS REFERENCE (Copy Employee ID below to the "user" column in Template)'], // Row 14
            ['User ID (Employee ID)', 'Employee Name', 'Email'], // Row 15 (Headers)
        ];

        users.forEach((u: any) => {
            // Use u._id as the ID for copying, as requested by the user
            refSheetData.push([u._id.toString(), u.name, u.email]);
        });

        const combinedRefSheet = xlsx.utils.aoa_to_sheet(refSheetData);

        // Auto-width for Ref sheet
        combinedRefSheet['!cols'] = [
            { wch: 30 }, { wch: 30 }, { wch: 40 }
        ];

        // Create Workbook
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, templateSheet, 'Template');
        xlsx.utils.book_append_sheet(workbook, combinedRefSheet, 'Reference');

        // Generate Buffer
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        return buffer;
    }

    // Initialize tax history for migration.
    // Divides total yearly tax by 12 and optionally locks past months as processed.
    async initializeMigrationTax(
        id: Types.ObjectId,
        uptoMonth: string | undefined = "Jan",
        uploadedBy?: Types.ObjectId,
        lockPastMonths: boolean = true
    ): Promise<ITaxDeclaration> {
        const taxDeclaration = await TaxDeclaration.findById(id);
        if (!taxDeclaration) throw new Error('Tax Declaration not found');

        const monthOrder = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
        const uptoIndex = lockPastMonths
            ? monthOrder.indexOf(uptoMonth || "Jan")
            : -1;
        if (lockPastMonths && uptoIndex === -1) throw new Error('Invalid month provided for migration initialization');

        // 0. Only update PT deduction if not already set
        if (!taxDeclaration.ptDeduction || taxDeclaration.ptDeduction === 0) {
            const ptDeduction = taxDeclaration.regime === 'old'
                ? await this.calculateAnnualPTDeduction(taxDeclaration.employeeId.toString(), taxDeclaration.financialYear)
                : 0;
            taxDeclaration.ptDeduction = ptDeduction;
        }

        // 1. Determine total yearly tax baseline from existing tax calculation
        // Use revisedTaxAmount if available (includes declarations), else calculatedTaxAmount
        const totalYearlyTax = taxDeclaration.revisedTaxAmount || taxDeclaration.calculatedTaxAmount;
        if (!totalYearlyTax) throw new Error('No tax calculation found to initialize migration');

        // 2. Calculate even monthly split
        const monthlyShare = Math.floor(totalYearlyTax / 12);
        let accumulatedHistoryPaid = 0;

        // 3. Update monthly records
        taxDeclaration.monthlyDeductions.forEach((m) => {
            const mIndex = monthOrder.indexOf(m.month);

            // Set even split for all months initially
            m.plannedDeduction = monthlyShare;
            m.actualDeduction = monthlyShare;
            m.adjustmentAmount = 0;

            // Lock past months
            if (lockPastMonths && mIndex <= uptoIndex) {
                m.isProcessed = true;
                m.plannedDate = m.plannedDate || new Date();
                accumulatedHistoryPaid += monthlyShare;
            } else {
                // Keep future months open
                m.isProcessed = false;
            }
        });

        // 4. Handle rounding difference on the last month (March)
        const roundDiff = totalYearlyTax - (monthlyShare * 12);
        const marchRecord = taxDeclaration.monthlyDeductions.find(m => m.month === 'Mar');
        if (marchRecord) {
            marchRecord.plannedDeduction += roundDiff;
            marchRecord.actualDeduction += roundDiff;
        }

        // 5. Update summary fields and set Audit Flag
        taxDeclaration.taxPaid = accumulatedHistoryPaid;
        taxDeclaration.remainingTaxToPay = totalYearlyTax - accumulatedHistoryPaid;
        taxDeclaration.isMigrationInitialized = true; // NEW Flag
        taxDeclaration.initialTaxCalculated = true;

        // 6. Populate migrationAdjustment fields
        const processedMonths = lockPastMonths ? uptoIndex + 1 : 0;
        const remainingMonths = 12 - processedMonths;
        const appliedUptoMonth = lockPastMonths ? (uptoMonth || "Jan") : "None";

        taxDeclaration.migrationAdjustment = {
            appliedForFY: taxDeclaration.financialYear,
            uploadedAt: new Date(),
            uploadedBy: uploadedBy || taxDeclaration.migrationAdjustment?.uploadedBy, // Use current user or keep existing
            externalTaxPaid: accumulatedHistoryPaid,
            externalTaxPaidMonths: processedMonths,
            newSystemTaxToPay: totalYearlyTax - accumulatedHistoryPaid,
            newSystemTaxMonths: remainingMonths,
            totalMigratedTaxLiability: totalYearlyTax,
            originalMonthlyDeductions: taxDeclaration.monthlyDeductions.map(m => ({
                month: m.month,
                financialYear: m.financialYear,
                plannedDeduction: m.plannedDeduction,
                actualDeduction: m.actualDeduction,
                adjustmentAmount: m.adjustmentAmount,
                plannedDate: m.plannedDate,
                isProcessed: m.isProcessed
            })),
            overrideReason: lockPastMonths
                ? `Migration initialized up to ${appliedUptoMonth} for FY ${taxDeclaration.financialYear}`
                : `Migration initialized without locking any month for FY ${taxDeclaration.financialYear}`
        };

        // 7. Reset summary flags for a clean 'Source of Truth'
        taxDeclaration.excessTaxPaid = 0;
        taxDeclaration.noFurtherTaxDeduction = false;
        taxDeclaration.taxAdjustmentRequired = false;
        taxDeclaration.adjustmentAmount = 0;
        taxDeclaration.monthlyAdjustment = 0;
        taxDeclaration.adjustmentReason = "migration_initialization";

        console.log(
            `[MIGRATION INIT] Employee ${taxDeclaration.employeeId}: Total Tax ${totalYearlyTax}, Paid upto ${appliedUptoMonth}: ${accumulatedHistoryPaid}, lockPastMonths=${lockPastMonths}`
        );

        // Note: Mongoose automatically increments __v on save
        return await taxDeclaration.save();
    }

    // Toggle user submission access
    async toggleSubmissions(id: Types.ObjectId, enabled: boolean): Promise<ITaxDeclaration> {
        const taxDeclaration = await TaxDeclaration.findById(id);
        if (!taxDeclaration) throw new Error("Tax Declaration not found");

        taxDeclaration.isSubmissionsEnabled = enabled;
        return await taxDeclaration.save();
    }

    // Mass Reject Declarations without proper proof
    async bulkRejectMissingProofs(id: Types.ObjectId): Promise<ITaxDeclaration> {
        const taxDeclaration = await TaxDeclaration.findById(id);
        if (!taxDeclaration) throw new Error("Tax Declaration not found");

        const previousTaxAmount = taxDeclaration.revisedTaxAmount || taxDeclaration.calculatedTaxAmount;
        let totalDeclinedAmount = taxDeclaration.totalDeclinedAmount || 0;
        let rejectedCount = 0;

        taxDeclaration.declarations.forEach(d => {
            // Target any section that is not verified or already rejected
            if (d.status !== "verified" && d.status !== "rejected") {
                d.status = "rejected";
                d.verifiedAmount = 0;
                totalDeclinedAmount += Math.abs(d.declaredAmount || 0);
                rejectedCount++;

                d.reviewHistory.push({
                    reviewedBy: new Types.ObjectId(this.context.user?._id),
                    reviewDate: new Date(),
                    status: "rejected" as any,
                    comments: "System Rejection: Missing or insufficient proof submitted before the deadline."
                });
            }
        });

        if (rejectedCount === 0) return taxDeclaration;

        taxDeclaration.totalDeclinedAmount = totalDeclinedAmount;
        taxDeclaration.poiSubmissionStatus = "rejected";

        // Recalculate tax with new rejections
        const res = await this.recalculateTax(taxDeclaration.toObject() as any);

        taxDeclaration.revisedTaxAmount = res.finalTaxWithCess;
        taxDeclaration.totalVerifiedAmount = res.totalVerifiedAmount;
        taxDeclaration.initialTaxBreakdown = res;

        // Spread the tax increase over remaining months
        if (previousTaxAmount !== res.finalTaxWithCess) {
            taxDeclaration.taxAdjustmentRequired = true;
            taxDeclaration.adjustmentAmount = res.finalTaxWithCess - previousTaxAmount;
            taxDeclaration.adjustmentReason = "missing_proof_rejection";
            taxDeclaration.lastAdjustmentDate = new Date();

            const remainingMonths = this.calculateRemainingMonthsInFY(taxDeclaration.financialYear);
            taxDeclaration.remainingMonths = remainingMonths;

            taxDeclaration.monthlyDeductions = await this.updateMonthlyDeductionPlan(
                taxDeclaration.monthlyDeductions,
                res.finalTaxWithCess,
                remainingMonths,
                taxDeclaration.adjustmentAmount < 0
            );
        }

        return await taxDeclaration.save();
    }
}

// export const taxDeclarationService = new TaxDeclarationService();
