import { Types } from "mongoose";
import { ISalaryStructure, SalaryStructure } from "../models/salary-structure.model";
import { RequestContext } from "../types/context";
import { BaseService } from "./base.service";



export interface ISalaryStructureCreate {

    name: string;
    country?: 'IN' | 'AE';
    fixedEarnings: {
        basicPercentage: number;
        hraPercentage: number;
        daPercentage: number;
        otherAllowancePercentage: number;
        travelAllowancePercentage?: number;
        reimbursementPercentage?: number;
        deductionPercentage?: number;
        comment?: string;
    };
    statutoryDeductions: {
        epf: {
            employeeContribution: number;
            employerContribution: number;
            maxLimit: number;
        };
        esi: {
            employeeContribution: number;
            employerContribution: number;
            applicabilityLimit: number;
        };
        professionalTax: {
            state: string;
            term?: string;
            slabs: {
                fromAmount: number;
                toAmount: number;
                taxAmount: number;
            }[];
        };
    }

}

export interface ISalaryStructureUpdate {
    _id: Types.ObjectId;
    name?: string;
    country?: 'IN' | 'AE';
    fixedEarnings?: {
        basicPercentage?: number;
        hraPercentage?: number;
        daPercentage?: number;
        otherAllowancePercentage?: number;
        travelAllowancePercentage?: number;
        reimbursementPercentage?: number;
        deductionPercentage?: number;
        comment?: string;
    };
    statutoryDeductions?: {
        epf?: {
            employeeContribution?: number;
            employerContribution?: number;
            maxLimit?: number;
        };
        esi?: {
            employeeContribution?: number;
            employerContribution?: number;
            applicabilityLimit?: number;
        };
        professionalTax?: {
            state?: string;
            term?: string;
            slabs?: {
                fromAmount: number;
                toAmount: number;
                taxAmount: number;
            }[];
        };
    }
}

export class SalaryStructureService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }

    private normalizeCountry(value?: string | null): 'IN' | 'AE' | undefined {
        if (!value) {
            return undefined;
        }
        const upper = value.toUpperCase();
        return upper === 'AE' || upper === 'IN' ? (upper as 'IN' | 'AE') : undefined;
    }

    private normalizeStatutoryForUAE(input: ISalaryStructureCreate | ISalaryStructureUpdate) {
        if (input.country !== 'AE') {
            return;
        }

        if (!input.statutoryDeductions) {
            input.statutoryDeductions = {
                epf: { employeeContribution: 0, employerContribution: 0, maxLimit: 0 },
                esi: { employeeContribution: 0, employerContribution: 0, applicabilityLimit: 0 },
                professionalTax: { state: 'N/A', term: 'Monthly', slabs: [] },
            } as ISalaryStructureCreate['statutoryDeductions'];
            return;
        }

        input.statutoryDeductions.epf = {
            employeeContribution: 0,
            employerContribution: 0,
            maxLimit: 0,
            ...input.statutoryDeductions.epf,
        };
        input.statutoryDeductions.esi = {
            employeeContribution: 0,
            employerContribution: 0,
            applicabilityLimit: 0,
            ...input.statutoryDeductions.esi,
        };
        const existingPT = input.statutoryDeductions.professionalTax;
        const normalizedSlabs = (existingPT?.slabs || []).map((slab: any) => ({
            fromAmount: slab?.fromAmount ?? 0,
            toAmount: slab?.toAmount ?? 0,
            taxAmount: slab?.taxAmount ?? slab?.amount ?? 0,
        }));
        input.statutoryDeductions.professionalTax = {
            state: existingPT?.state || 'N/A',
            term: existingPT?.term || 'Monthly',
            slabs: normalizedSlabs,
        };
    }

    private validateUAEFields(data: ISalaryStructureCreate | ISalaryStructureUpdate) {
        if (data.country !== 'AE') {
            return;
        }

        // ✅ UPDATED: travelAllowancePercentage is no longer required for UAE
        // Travel allowance is now handled as a fixed amount in salary assignments
        // This validation method is kept for future UAE-specific validations if needed
        
        // No specific validations required for UAE currently
    }

    async create(data: ISalaryStructureCreate): Promise<ISalaryStructure> {
        const country = this.normalizeCountry(data.country) || this.normalizeCountry(this.context.user?.country) || 'IN';
        const payload: ISalaryStructureCreate = {
            ...data,
            country,
            fixedEarnings: {
                travelAllowancePercentage: 0,
                reimbursementPercentage: 0,
                deductionPercentage: 0,
                comment: undefined,
                ...data.fixedEarnings,
            },
        };

        const legacyFixed = (data as any)?.fixedEarnings;
        if (
            legacyFixed &&
            legacyFixed.reInvestmentPercentage !== undefined &&
            (payload.fixedEarnings.reimbursementPercentage === undefined || payload.fixedEarnings.reimbursementPercentage === null)
        ) {
            payload.fixedEarnings.reimbursementPercentage = legacyFixed.reInvestmentPercentage;
        }

        if (payload.fixedEarnings.comment) {
            payload.fixedEarnings.comment = payload.fixedEarnings.comment.trim();
        }

        this.validateUAEFields(payload);
        this.normalizeStatutoryForUAE(payload);

        const salaryStructure = new SalaryStructure(payload);
        return salaryStructure.save();
    }

    async update(data: ISalaryStructureUpdate): Promise<ISalaryStructure> {
        const salaryStructure = await SalaryStructure.findById(data._id);
        if (!salaryStructure) {
            throw new Error('Salary structure not found');
        }

        const payload: ISalaryStructureUpdate = {
            ...data,
        };

        const incomingCountry = this.normalizeCountry(payload.country);
        const existingCountry = this.normalizeCountry(salaryStructure.country);
        payload.country = incomingCountry || existingCountry;

        if (payload.fixedEarnings) {
            payload.fixedEarnings = {
                travelAllowancePercentage: salaryStructure.fixedEarnings.travelAllowancePercentage ?? 0,
                reimbursementPercentage: salaryStructure.fixedEarnings.reimbursementPercentage ?? 0,
                deductionPercentage: salaryStructure.fixedEarnings.deductionPercentage ?? 0,
                comment: salaryStructure.fixedEarnings.comment,
                ...payload.fixedEarnings,
            };
            const legacyFixed = (data as any)?.fixedEarnings;
            if (
                legacyFixed &&
                legacyFixed.reInvestmentPercentage !== undefined &&
                (payload.fixedEarnings.reimbursementPercentage === undefined || payload.fixedEarnings.reimbursementPercentage === null)
            ) {
                payload.fixedEarnings.reimbursementPercentage = legacyFixed.reInvestmentPercentage;
            }
            if (payload.fixedEarnings.comment) {
                payload.fixedEarnings.comment = payload.fixedEarnings.comment.trim();
            }
        }

        this.validateUAEFields(payload);
        this.normalizeStatutoryForUAE(payload);

        Object.assign(salaryStructure, payload);
        return salaryStructure.save();
    }

    async delete(id: Types.ObjectId): Promise<ISalaryStructure> {
        const salaryStructure = await SalaryStructure.findById(id);
        if (!salaryStructure) {
            throw new Error('Salary structure not found');
        }
        await salaryStructure.deleteOne();
        return salaryStructure;
    }

    async findAll(query: { page?: number; limit?: number; search?: string; country?: 'IN' | 'AE' }): Promise<{ salaryStructures: ISalaryStructure[], meta: { page: number, limit: number, total: number, totalPages: number } }> {
        const { page = 1, limit = 10, search, country } = query;
        const skip = (page - 1) * limit;
        console.log(query, "query")
        console.log(page, limit, search, "*****")
        const filter: any = {};
        if (search) {
            filter.name = { $regex: search, $options: 'i' }; // Case-insensitive search
        }
        if (country) {
            filter.country = country;
        }

        const [salaryStructures, total] = await Promise.all([
            SalaryStructure.find(filter).skip(skip).limit(limit),
            SalaryStructure.countDocuments(filter),
        ]);

        return {
            salaryStructures,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findById(id: Types.ObjectId): Promise<ISalaryStructure> {
        const salaryStructure = await SalaryStructure.findById(id);
        if (!salaryStructure) {
            throw new Error('Salary structure not found');
        }
        return salaryStructure;
    }
}

// export const salaryStructureService = new SalaryStructureService();
