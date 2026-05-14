import { Types } from "mongoose";
import { ISalaryAssignment, SalaryAssignment } from "../models/salary-assignments.model";
import { BaseService } from "./base.service";
import { RequestContext } from "../types/context";
import { getCurrentFinancialYear } from "../utilis/dates";
import { TaxDeclaration } from "../models/tax-declaration";
import { ITaxDeclarationUpdate, TaxDeclarationService } from "./tax-declaration.service";



export interface ISalaryAssignmentCreate {
    employeeId: Types.ObjectId;
    monthlyGross: number;
    annualInsurance: number;
    reimbursement: number;
    travelAllowance?: number; // ✅ Optional travel allowance (default: 0)
    airTicketAllowance?: number; // ✅ NEW: Optional air ticket allowance (default: 0)
    medicalAllowance?: number; // ✅ NEW: Optional medical allowance (default: 0)
    salaryStructureId: Types.ObjectId
    isActive: Boolean;
    effectiveFrom: Date;
    effectiveTo: Date;
}

export interface ISalaryAssignmentUpdate {
    _id: Types.ObjectId;
    employeeId: Types.ObjectId;
    monthlyGross: number;
    annualInsurance: number;
    reimbursement: number;
    travelAllowance?: number; // ✅ Optional travel allowance (default: 0)
    airTicketAllowance?: number; // ✅ NEW: Optional air ticket allowance (default: 0)
    medicalAllowance?: number; // ✅ NEW: Optional medical allowance (default: 0)
    salaryStructureId: Types.ObjectId
    isActive: Boolean;
    effectiveFrom: Date;
    effectiveTo: Date;
}

export class SalaryAssignmentService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }

    async create(data: ISalaryAssignmentCreate): Promise<ISalaryAssignment> {

        const hasOverlap = await this.isDateOverlap(
            data.employeeId,
            data.effectiveFrom,
            data.effectiveTo
        );
        if (hasOverlap) {
            throw new Error('Salary assignment dates overlap with an existing record.');
        }

        if (data.isActive) {
            await SalaryAssignment.updateMany(
                { employeeId: data.employeeId, isActive: true },
                { isActive: false }
            );
        }
        const salaryAssignment = new SalaryAssignment(data);
        const savedAssignment = await salaryAssignment.save();

        // Trigger tax declaration update for the current financial year
        const financialYear = getCurrentFinancialYear();
        const taxDeclaration = await TaxDeclaration.findOne({
            employeeId: data.employeeId,
            financialYear
        });
        if (taxDeclaration) {
            // Check for migration adjustment
            if (taxDeclaration.isMigrationAdjusted) {
                console.warn(
                    `[MIGRATION WARNING] Salary assignment created for migration-adjusted employee ${data.employeeId}. ` +
                    `Annual tax will be recalculated, but monthly deductions will NOT be redistributed.`
                );
            }

            const taxDeclarationService = new TaxDeclarationService(this.context);
            const taxUpdateData: ITaxDeclarationUpdate = {
                _id: taxDeclaration._id.toString(),
                employeeId: data.employeeId.toString(),
                financialYear: taxDeclaration.financialYear,
                regime: taxDeclaration.regime,
                declarations: taxDeclaration.declarations.map((decl: any) => ({
                    ...decl,
                    subsection: decl.subsection ?? null // or provide a sensible default value
                })),
                cessRate: taxDeclaration.cessRate,
                annualGross: 0, // Will be recalculated in TaxDeclarationService
                totalDeclaredAmount: taxDeclaration.totalDeclaredAmount,
                totalVerifiedAmount: taxDeclaration.totalVerifiedAmount,
                standardDeduction: taxDeclaration.standardDeduction,
                ptDeduction: taxDeclaration.ptDeduction || 0,
                calculatedTaxAmount: taxDeclaration.calculatedTaxAmount,
                revisedTaxAmount: taxDeclaration.revisedTaxAmount,
                taxPaid: taxDeclaration.taxPaid,
                poiSubmissionStatus: taxDeclaration.poiSubmissionStatus,
                reviewHistory: taxDeclaration.reviewHistory?.map((item: any) => ({
                    reviewedBy: item.reviewedBy?.toString(),
                    reviewDate: item.reviewDate instanceof Date ? item.reviewDate.toISOString() : item.reviewDate,
                    action: item.action,
                    comments: item.comments
                })),
                isLocked: taxDeclaration.isLocked,
                initialTaxBreakdown: taxDeclaration.initialTaxBreakdown,
                isDeclared: taxDeclaration.isDeclared,
                isPOISubmitted: taxDeclaration.isPOISubmitted,
                isResubmitted: taxDeclaration.isResubmitted,
                previousTaxAmount: taxDeclaration.previousTaxAmount,
                taxAdjustmentRequired: taxDeclaration.taxAdjustmentRequired,
                adjustmentAmount: taxDeclaration.adjustmentAmount,
                adjustmentReason: taxDeclaration.adjustmentReason,
                monthlyAdjustment: taxDeclaration.monthlyAdjustment,
                remainingMonths: taxDeclaration.remainingMonths,
                adjustmentDistribution: taxDeclaration.adjustmentDistribution,
                lastAdjustmentDate: taxDeclaration.lastAdjustmentDate,
                excessTaxPaid: taxDeclaration.excessTaxPaid,
                noFurtherTaxDeduction: taxDeclaration.noFurtherTaxDeduction,
                remainingTaxToPay: taxDeclaration.remainingTaxToPay,
                monthlyDeductions: taxDeclaration.monthlyDeductions,
                salaryAssignments: (taxDeclaration.salaryAssignments ?? []).map((item: any) => ({
                    assignmentId: item.assignmentId instanceof Types.ObjectId ? item.assignmentId : item.assignmentId?._id ?? item.assignmentId,
                    validFrom: item.validFrom instanceof Date ? item.validFrom : new Date(item.validFrom),
                    validTill: item.validTill ? (item.validTill instanceof Date ? item.validTill : new Date(item.validTill)) : null,
                    monthlyGross: typeof item.monthlyGross === 'number' ? item.monthlyGross : Number(item.monthlyGross),
                    isActive: typeof item.isActive === 'boolean' ? item.isActive : Boolean(item.isActive)
                }))
            };
            await taxDeclarationService.update(taxUpdateData);
        }

        return savedAssignment;
    }

    async update(data: ISalaryAssignmentUpdate): Promise<ISalaryAssignment> {

        const hasOverlap = await this.isDateOverlap(
            data.employeeId,
            data.effectiveFrom,
            data.effectiveTo,
            data._id // To avoid falsely detect that the current record overlaps with itself.
        );
        if (hasOverlap) {
            throw new Error('Salary assignment dates overlap with an existing record.');
        }

        const salaryAssignment = await SalaryAssignment.findById(data._id);
        if (!salaryAssignment) {
            throw new Error('Salary Assignment not found');
        }
        // Deactivate other active assignments if this one is set to active
        if (data.isActive) {
            await SalaryAssignment.updateMany(
                { employeeId: data.employeeId, isActive: true, _id: { $ne: data._id } },
                { isActive: false }
            );
        }

        Object.assign(salaryAssignment, data);
        const updatedAssignment = await salaryAssignment.save();
        // Trigger tax declaration update for the current financial year
        if (!data.isActive) {
            return updatedAssignment; // If not active, no need to update tax declaration
        }
        const financialYear = getCurrentFinancialYear();
        const taxDeclaration = await TaxDeclaration.findOne({
            employeeId: data.employeeId,
            financialYear
        });
        console.log(taxDeclaration, "taxDeclaration in update method")
        if (taxDeclaration) {
            // Check for migration adjustment
            if (taxDeclaration.isMigrationAdjusted) {
                console.warn(
                    `[MIGRATION WARNING] Salary assignment updated for migration-adjusted employee ${data.employeeId}. ` +
                    `Annual tax will be recalculated, but monthly deductions will NOT be redistributed.`
                );
            }

            const taxDeclarationService = new TaxDeclarationService(this.context);
            const taxUpdateData: ITaxDeclarationUpdate = {
                _id: taxDeclaration._id.toString(),
                employeeId: data.employeeId.toString(),
                financialYear: taxDeclaration.financialYear,
                regime: taxDeclaration.regime,
                declarations: taxDeclaration.declarations.map((decl: any) => ({
                    ...decl,
                    subsection: decl.subsection ?? null // or provide a sensible default value
                })),
                cessRate: taxDeclaration.cessRate,
                annualGross: 0, // Will be recalculated in TaxDeclarationService
                totalDeclaredAmount: taxDeclaration.totalDeclaredAmount,
                totalVerifiedAmount: taxDeclaration.totalVerifiedAmount,
                standardDeduction: taxDeclaration.standardDeduction,
                ptDeduction: taxDeclaration.ptDeduction || 0,
                calculatedTaxAmount: taxDeclaration.calculatedTaxAmount,
                revisedTaxAmount: taxDeclaration.revisedTaxAmount,
                taxPaid: taxDeclaration.taxPaid,
                poiSubmissionStatus: taxDeclaration.poiSubmissionStatus,
                reviewHistory: taxDeclaration.reviewHistory?.map((item: any) => ({
                    reviewedBy: item.reviewedBy?.toString(),
                    reviewDate: item.reviewDate instanceof Date ? item.reviewDate.toISOString() : item.reviewDate,
                    action: item.action,
                    comments: item.comments
                })),
                isLocked: taxDeclaration.isLocked,
                initialTaxBreakdown: taxDeclaration.initialTaxBreakdown,
                isDeclared: taxDeclaration.isDeclared,
                isPOISubmitted: taxDeclaration.isPOISubmitted,
                isResubmitted: taxDeclaration.isResubmitted,
                previousTaxAmount: taxDeclaration.previousTaxAmount,
                taxAdjustmentRequired: taxDeclaration.taxAdjustmentRequired,
                adjustmentAmount: taxDeclaration.adjustmentAmount,
                adjustmentReason: taxDeclaration.adjustmentReason,
                monthlyAdjustment: taxDeclaration.monthlyAdjustment,
                remainingMonths: taxDeclaration.remainingMonths,
                adjustmentDistribution: taxDeclaration.adjustmentDistribution,
                lastAdjustmentDate: taxDeclaration.lastAdjustmentDate,
                excessTaxPaid: taxDeclaration.excessTaxPaid,
                noFurtherTaxDeduction: taxDeclaration.noFurtherTaxDeduction,
                remainingTaxToPay: taxDeclaration.remainingTaxToPay,
                monthlyDeductions: taxDeclaration.monthlyDeductions
            };
            await taxDeclarationService.update(taxUpdateData);
        }

        return updatedAssignment;
    }

    async delete(id: Types.ObjectId): Promise<ISalaryAssignment> {
        const salaryAssignment = await SalaryAssignment.findById(id);
        if (!salaryAssignment) {
            throw new Error('Salary Assignment not found');
        }
        await salaryAssignment.deleteOne();

        // Trigger tax declaration update after deletion
        const financialYear = getCurrentFinancialYear();
        const taxDeclaration = await TaxDeclaration.findOne({
            employeeId: salaryAssignment.employeeId,
            financialYear
        });
        if (taxDeclaration) {
            const taxDeclarationService = new TaxDeclarationService(this.context);
            const taxUpdateData: ITaxDeclarationUpdate = {
                _id: taxDeclaration._id.toString(),
                employeeId: salaryAssignment.employeeId.toString(),
                financialYear: taxDeclaration.financialYear,
                regime: taxDeclaration.regime,
                declarations: taxDeclaration.declarations.map((decl: any) => ({
                    ...decl,
                    subsection: decl.subsection ?? null // or provide a sensible default value
                })),
                cessRate: taxDeclaration.cessRate,
                annualGross: 0, // Will be recalculated in TaxDeclarationService
                totalDeclaredAmount: taxDeclaration.totalDeclaredAmount,
                totalVerifiedAmount: taxDeclaration.totalVerifiedAmount,
                standardDeduction: taxDeclaration.standardDeduction,
                ptDeduction: taxDeclaration.ptDeduction || 0,
                calculatedTaxAmount: taxDeclaration.calculatedTaxAmount,
                revisedTaxAmount: taxDeclaration.revisedTaxAmount,
                taxPaid: taxDeclaration.taxPaid,
                poiSubmissionStatus: taxDeclaration.poiSubmissionStatus,
                reviewHistory: taxDeclaration.reviewHistory?.map((item: any) => ({
                    reviewedBy: item.reviewedBy?.toString(),
                    reviewDate: item.reviewDate instanceof Date ? item.reviewDate.toISOString() : item.reviewDate,
                    action: item.action,
                    comments: item.comments
                })),
                isLocked: taxDeclaration.isLocked,
                initialTaxBreakdown: taxDeclaration.initialTaxBreakdown,
                isDeclared: taxDeclaration.isDeclared,
                isPOISubmitted: taxDeclaration.isPOISubmitted,
                isResubmitted: taxDeclaration.isResubmitted,
                previousTaxAmount: taxDeclaration.previousTaxAmount,
                taxAdjustmentRequired: taxDeclaration.taxAdjustmentRequired,
                adjustmentAmount: taxDeclaration.adjustmentAmount,
                adjustmentReason: taxDeclaration.adjustmentReason,
                monthlyAdjustment: taxDeclaration.monthlyAdjustment,
                remainingMonths: taxDeclaration.remainingMonths,
                adjustmentDistribution: taxDeclaration.adjustmentDistribution,
                lastAdjustmentDate: taxDeclaration.lastAdjustmentDate,
                excessTaxPaid: taxDeclaration.excessTaxPaid,
                noFurtherTaxDeduction: taxDeclaration.noFurtherTaxDeduction,
                remainingTaxToPay: taxDeclaration.remainingTaxToPay,
                monthlyDeductions: taxDeclaration.monthlyDeductions
            };
            await taxDeclarationService.update(taxUpdateData);
        }
        return salaryAssignment;
    }

    async findAll(): Promise<ISalaryAssignment[]> {
        return SalaryAssignment.find();
    }

    async findById(id: Types.ObjectId): Promise<ISalaryAssignment> {
        const salaryAssignment = await SalaryAssignment.findById(id);
        if (!salaryAssignment) {
            throw new Error('Salary Assignment not found');
        }
        return salaryAssignment;
    }

    async findByUserId(userId: Types.ObjectId): Promise<ISalaryAssignment[]> {
        return SalaryAssignment.find({ employeeId: userId })
    }

    async findActiveByUserId(userId: Types.ObjectId): Promise<ISalaryAssignment | null> {
        return SalaryAssignment.findOne({ employeeId: userId, isActive: true });
    }

    private async isDateOverlap(
        employeeId: Types.ObjectId,
        from: Date,
        to: Date,
        excludeId?: Types.ObjectId
    ): Promise<boolean> {
        const query: any = {
            employeeId,
            ...(excludeId && { _id: { $ne: excludeId } }),
            $or: [
                {
                    effectiveFrom: { $lte: to },
                    effectiveTo: { $gte: from }
                },
                {
                    effectiveFrom: { $lte: from },
                    effectiveTo: { $gte: from }
                },
                {
                    effectiveFrom: { $lte: to },
                    effectiveTo: { $gte: to }
                }
            ]
        };

        // Optional: if you want to ignore inactive ones, uncomment the below:
        // query.isActive = true;

        const overlappingAssignment = await SalaryAssignment.findOne(query);
        return !!overlappingAssignment;
    }


}

/*
export class SalaryAssignmentService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }

    async create(data: ISalaryAssignmentCreate): Promise<ISalaryAssignment> {
        const salaryAssignment = new SalaryAssignment(data);
        return salaryAssignment.save();
    }

    async update(data: ISalaryAssignmentUpdate): Promise<ISalaryAssignment> {
        const salaryAssignment = await SalaryAssignment.findById(data._id);
        if (!salaryAssignment) {
            throw new Error('Salary Assignment not found');
        }
        Object.assign(salaryAssignment, data);
        return salaryAssignment.save();
    }

    async delete(id: Types.ObjectId): Promise<ISalaryAssignment> {
        const salaryAssignment = await SalaryAssignment.findById(id);
        if (!salaryAssignment) {
            throw new Error('Salary Assignment not found');
        }
        await salaryAssignment.deleteOne();
        return salaryAssignment;
    }

    async findAll(): Promise<ISalaryAssignment[]> {
        return SalaryAssignment.find();
    }

    async findById(id: Types.ObjectId): Promise<ISalaryAssignment> {
        const salaryAssignment = await SalaryAssignment.findById(id);
        if (!salaryAssignment) {
            throw new Error('Salary Assignment not found');
        }
        return salaryAssignment;
    }

    async findByUserId(userId: Types.ObjectId): Promise<ISalaryAssignment[]> {
        return SalaryAssignment.find({ employeeId: userId })
    }

    async findActiveByUserId(userId: Types.ObjectId): Promise<ISalaryAssignment | null> {
        return SalaryAssignment.findOne({ employeeId: userId, isActive: true });
    }
}
     */