import { Types } from 'mongoose';
import { ITaxSlab, TaxSlab } from '../models/tax-slab.model';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';

export interface ITaxSlabCreate {
    regime: "old" | "new";
    financialYear: string;
    slabs: {
        fromAmount: number;
        toAmount?: number | null;
        taxRate: number;
    }[];
    cessRate: number;
    standardDeduction: number;
    isActive: boolean;
}

export interface ITaxSlabUpdate {
    _id: Types.ObjectId;
    regime?: "old" | "new";
    financialYear?: string;
    slabs?: {
        fromAmount: number;
        toAmount?: number | null;
        taxRate: number;
    }[];
    cessRate?: number;
    standardDeduction?: number;
    isActive?: boolean;
}

export class TaxSlabService extends BaseService {
    protected context: RequestContext;

    constructor(context: RequestContext) {
        super(context);
        this.context = context;
    }
    async create(data: ITaxSlabCreate): Promise<ITaxSlab> {
        // Check for existing record with the same regime and financialYear
        const existingRecord = await TaxSlab.findOne({ regime: data.regime, financialYear: data.financialYear, isActive: data.isActive });
        if (existingRecord) {
            throw new Error('A Tax Slab with the same regime and financialYear already exists');
        }

        const taxSlab = new TaxSlab(data);
        return taxSlab.save();
    }

    async update(data: ITaxSlabUpdate): Promise<ITaxSlab> {
        const taxSlab = await TaxSlab.findById(data._id);
        if (!taxSlab) {
            throw new Error('Tax Slab not found');
        }

        // Check for existing record with the same regime and financialYear
        const existingRecord = await TaxSlab.findOne({ regime: data.regime, financialYear: data.financialYear, isActive: data.isActive, _id: { $ne: data._id } });
        if (existingRecord) {
            throw new Error('A Tax Slab with the same regime and financialYear already exists');
        }

        Object.assign(taxSlab, data);
        return taxSlab.save();
    }

    async delete(id: Types.ObjectId): Promise<ITaxSlab> {
        const taxSlab = await TaxSlab.findById(id);
        if (!taxSlab) {
            throw new Error('Tax Slab not found');
        }
        await taxSlab.deleteOne();
        return taxSlab;
    }

    async findAll(query: { page?: number; limit?: number; search?: string }): Promise<{ taxSlabs: ITaxSlab[], meta: { page: number, limit: number, total: number, totalPages: number } }> {
        const { page = 1, limit = 10, search } = query;
        const skip = (page - 1) * limit;
        console.log(query, "query")
        console.log(page, limit, search, "*****")
        const filter: any = {};
        if (search) {
            filter.financialYear = { $regex: search, $options: 'i' }; // Case-insensitive search
        }

        const [taxSlabs, total] = await Promise.all([
            TaxSlab.find(filter).skip(skip).limit(limit),
            TaxSlab.countDocuments(filter),
        ]);

        return {
            taxSlabs,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findById(id: Types.ObjectId): Promise<ITaxSlab> {
        const taxSlab = await TaxSlab.findById(id);
        if (!taxSlab) {
            throw new Error('Tax Slab not found');
        }
        return taxSlab;
    }

    async getCurrentFY(): Promise<ITaxSlab[]> {

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // Months are zero-based, so +1

        let startYear: number;
        let endYear: number;

        if (currentMonth >= 4) {
            // If month is April (4) or later, FY starts from this year
            startYear = currentYear;
            endYear = currentYear + 1;
        } else {
            // If month is Jan-March, FY belongs to the previous year
            startYear = currentYear - 1;
            endYear = currentYear;
        }

        const financialYear = `${startYear}-${endYear}`;
        console.log("getCurrentFY:", financialYear);

        return TaxSlab.find({ financialYear, isActive: true });
    }
}

