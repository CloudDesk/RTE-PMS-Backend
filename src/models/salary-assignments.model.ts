import { Schema, model, Document, Types } from 'mongoose';

// Interface for TypeScript
export interface ISalaryAssignment extends Document {
    monthlyGross: number;
    annualInsurance: number;
    reimbursement: number;
    travelAllowance: number; // ✅ Fixed amount for travel allowance (UAE specific)
    airTicketAllowance: number; // ✅ NEW: Annual air ticket allowance for UAE employees
    medicalAllowance: number; // ✅ NEW: Medical insurance allowance for UAE employees
    employeeId: Types.ObjectId;
    salaryStructureId: Types.ObjectId;
    isActive: Boolean;
    effectiveFrom: Date;
    effectiveTo: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

// Mongoose Schema Definition
const SalaryAssignmentSchema = new Schema<ISalaryAssignment>(
    {
        salaryStructureId: { type: Schema.Types.ObjectId, required: true, ref: 'SalaryStructure' },
        employeeId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
        monthlyGross: { type: Number, required: true },
        reimbursement: { type: Number, required: false, default: 0 },
        annualInsurance: { type: Number, required: false, default: 0 },
        travelAllowance: { 
            type: Number, 
            required: false, 
            default: 0,
            min: [0, 'Travel allowance cannot be negative'],
            validate: {
                validator: function(v: number) {
                    return v >= 0;
                },
                message: 'Travel allowance must be a non-negative number'
            }
        },
        airTicketAllowance: { 
            type: Number, 
            required: false, 
            default: 0,
            min: [0, 'Air ticket allowance cannot be negative'],
            validate: {
                validator: function(v: number) {
                    return v >= 0;
                },
                message: 'Air ticket allowance must be a non-negative number'
            }
        },
        medicalAllowance: { 
            type: Number, 
            required: false, 
            default: 0,
            min: [0, 'Medical allowance cannot be negative'],
            validate: {
                validator: function(v: number) {
                    return v >= 0;
                },
                message: 'Medical allowance must be a non-negative number'
            }
        },
        isActive: { type: Boolean, required: true, default: false },
        effectiveFrom: { type: Date, required: true, index: true },
        effectiveTo: { type: Date, required: true }
    },
    {
        timestamps: true  // Automatically adds createdAt and updatedAt
    }
);

export const SalaryAssignment = model<ISalaryAssignment>('SalaryAssignment', SalaryAssignmentSchema);
