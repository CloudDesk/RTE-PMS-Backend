import { Schema, model, Document } from 'mongoose';

// Interface for TypeScript
export interface ISalaryStructure extends Document {
    name: string;
    country: 'IN' | 'AE';
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
            term: string;
            slabs: {
                fromAmount: number;
                toAmount: number;
                amount: number;
            }[];
        };
        employerSplit?: {
            epsPercentage: number;
            epsWageCap: number;
        };
    };
    createdAt?: Date;
    updatedAt?: Date;
}

// Mongoose Schema Definition
const SalaryStructureSchema = new Schema<ISalaryStructure>(
    {
        name: { type: String, required: true }, // Name for the salary structure
        country: {
            type: String,
            enum: ['IN', 'AE'],
            required: true,
            default: 'IN',
        },

        fixedEarnings: {
            basicPercentage: { type: Number, required: true },  // % of Gross, e.g., 40%
            hraPercentage: { type: Number, required: true },    // % of Gross, e.g., 20%
            daPercentage: { type: Number, required: true },     // % of Basic
            otherAllowancePercentage: { type: Number, required: true },  // % of Gross
            travelAllowancePercentage: {
                type: Number,
                required: false, // ✅ CHANGED: No longer required for UAE (deprecated for UAE, moved to salary assignment)
                default: 0,
            },
            reimbursementPercentage: {
                type: Number,
                default: 0,
            },
            deductionPercentage: {
                type: Number,
                default: 0,
            },
            comment: {
                type: String,
                trim: true,
                default: '',
            },
        },

        statutoryDeductions: {
            epf: {
                employeeContribution: { type: Number, required: true }, // 12% of (Basic + DA)
                employerContribution: { type: Number, required: true }, // 12% of (Basic + DA)
                maxLimit: { type: Number, required: true }              // Max ₹1800
            },
            esi: {
                employeeContribution: { type: Number, required: true }, // 0.75% of Gross
                employerContribution: { type: Number, required: true }, // 3.25% of Gross
                applicabilityLimit: { type: Number, required: true }    // ≤ ₹21,000/month
            },
            professionalTax: {
                state: { type: String, required: true },
                term: { type: String, required: true },
                slabs: [
                    {
                        fromAmount: { type: Number, required: true },   // Salary Range
                        toAmount: { type: Number, required: false },     // Salary Range  
                        taxAmount: { type: Number, required: true }   // PT Amount
                    }
                ]
            },
            employerSplit: {
                epsPercentage: { type: Number, default: 8.33 },
                epsWageCap: { type: Number, default: 15000 }
            }
        }
    },
    {
        timestamps: true  // Automatically adds createdAt and updatedAt
    }
);

export const SalaryStructure = model<ISalaryStructure>('SalaryStructure', SalaryStructureSchema);
