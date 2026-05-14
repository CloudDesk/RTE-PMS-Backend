import { Schema, model, Document, Types } from 'mongoose';

export interface ILeaveCarryForward extends Document {
  employeeId: Types.ObjectId;
  fromYear: number;
  toYear: number;
  leaveType: 'annual' | 'sick' | 'compOff' | 'lossOfPay' | 'otherPaid' | 'otherUnpaid';
  balanceBefore: number;      // Balance at end of fromYear
  daysCarriedForward: number; // Admin-specified amount (can be decimal)
  daysForfeited: number;      // BalanceBefore - daysCarriedForward
  processedAt: Date;
  processedBy: Types.ObjectId;
  notes?: string;
}

const leaveCarryForwardSchema = new Schema<ILeaveCarryForward>(
  {
    employeeId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    fromYear: { type: Number, required: true },
    toYear: { type: Number, required: true },
    leaveType: {
      type: String,
      enum: ['annual', 'sick', 'compOff', 'lossOfPay', 'otherPaid', 'otherUnpaid'],
      required: true
    },
    balanceBefore: { type: Number, required: true, min: 0 },
    daysCarriedForward: { type: Number, required: true, min: 0 },
    daysForfeited: { type: Number, required: true, min: 0 },
    processedAt: {
      type: Date,
      default: Date.now
    },
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    notes: String
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
leaveCarryForwardSchema.index({ employeeId: 1, fromYear: -1, toYear: -1 });
leaveCarryForwardSchema.index({ fromYear: 1, toYear: 1 });

// Validate carry-forward rules
leaveCarryForwardSchema.pre('save', function (next) {
  // toYear must be fromYear + 1
  if (this.toYear !== this.fromYear + 1) {
    return next(new Error('toYear must be fromYear + 1'));
  }
  
  // daysCarriedForward cannot exceed balanceBefore
  if (this.daysCarriedForward > this.balanceBefore) {
    return next(new Error('daysCarriedForward cannot exceed balanceBefore'));
  }
  
  // daysForfeited must equal balanceBefore - daysCarriedForward
  const calculatedForfeited = this.balanceBefore - this.daysCarriedForward;
  if (Math.abs(this.daysForfeited - calculatedForfeited) > 0.01) { // Allow small floating point differences
    return next(new Error('daysForfeited must equal balanceBefore - daysCarriedForward'));
  }
  
  next();
});

export const LeaveCarryForward = model<ILeaveCarryForward>('LeaveCarryForward', leaveCarryForwardSchema);

