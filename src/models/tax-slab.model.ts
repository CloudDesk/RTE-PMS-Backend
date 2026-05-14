import { Schema, model, Document } from 'mongoose';

export interface ITaxSlab extends Document {
    regime: "old" | "new";
    financialYear: string;
    slabs: [
        {
            fromAmount: number;
            toAmount?: number | null; // Null for highest slab
            taxRate: number; // In percentage
        }
    ];
    cessRate: number; // In percentage
    standardDeduction: number;
    isActive: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}


const TaxSlabSchema = new Schema<ITaxSlab>(
    {
        regime: { type: String, enum: ["old", "new"], required: true },
        financialYear: { type: String, required: true },
        slabs: [
            {
                fromAmount: { type: Number, required: true },
                toAmount: { type: Number, required: false, default: null },
                taxRate: { type: Number, required: true }
            }
        ],
        cessRate: { type: Number, required: true, default: 4 },
        standardDeduction: { type: Number, required: true, default: 75000 },
        isActive: { type: Boolean, required: true, default: false },

    },
    {
        timestamps: true  // Automatically adds createdAt and updatedAt
    }
)

export const TaxSlab = model<ITaxSlab>('TaxSlab', TaxSlabSchema)