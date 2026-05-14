import { Schema, model, Document, Types } from 'mongoose';

interface ILeaveCategoryDetail {
  alloted: number;
  availed: number;
  remaining: number;
  leaveRequests: Types.ObjectId[];
}

export interface IEditHistory {
  editedBy: {
    id: Types.ObjectId;
    name: string;
  };
  field: string; // e.g., "annual.alloted", "sick.alloted"
  oldValue: number;
  newValue: number;
  editedAt: Date;
}

export interface ILeaveSummary extends Document {
  userId: Types.ObjectId;
  year: number;
  annual: ILeaveCategoryDetail;
  sick: ILeaveCategoryDetail;
  compOff: ILeaveCategoryDetail;
  lossOfPay: ILeaveCategoryDetail;
  otherPaid: ILeaveCategoryDetail;
  otherUnpaid: ILeaveCategoryDetail;
  maternity: ILeaveCategoryDetail;
  workFromHome: ILeaveCategoryDetail;
  restricted_holiday: ILeaveCategoryDetail;
  editHistory: IEditHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const leaveCategoryDetailSchema = new Schema<ILeaveCategoryDetail>({
  alloted: { type: Number, default: 0 },
  availed: { type: Number, default: 0 },
  remaining: { type: Number, default: 0 },
  leaveRequests: [{ type: Schema.Types.ObjectId, ref: 'Leave' }]
});

const editHistorySchema = new Schema<IEditHistory>({
  editedBy: {
    id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true }
  },
  field: { type: String, required: true }, // e.g., "annual.alloted", "sick.alloted"
  oldValue: { type: Number, required: true },
  newValue: { type: Number, required: true },
  editedAt: { type: Date, default: Date.now }
}, { _id: false });

const leaveSummarySchema = new Schema<ILeaveSummary>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    year: { type: Number, required: true },
    annual: leaveCategoryDetailSchema,
    sick: leaveCategoryDetailSchema,
    compOff: leaveCategoryDetailSchema,
    lossOfPay: leaveCategoryDetailSchema,
    otherPaid: leaveCategoryDetailSchema,
    otherUnpaid: leaveCategoryDetailSchema,
    maternity: leaveCategoryDetailSchema,
    workFromHome: leaveCategoryDetailSchema,
    restricted_holiday: leaveCategoryDetailSchema,
    editHistory: { type: [editHistorySchema], default: [] }
  },
  {
    timestamps: true
  }
);

// Create compound index for userId and year to ensure unique combination
leaveSummarySchema.index({ userId: 1, year: 1 }, { unique: true });

// Pre-save hook to calculate remaining days and clean editHistory
leaveSummarySchema.pre('save', function (this: ILeaveSummary & Document, next) {
  // Calculate remaining days for each leave category
  const categories = ['annual', 'sick', 'compOff', 'lossOfPay', 'otherPaid', 'otherUnpaid', 'maternity', 'workFromHome', 'restricted_holiday'] as const;

  categories.forEach(category => {
    const leaveCategory = this[category];
    if (leaveCategory) {
      leaveCategory.remaining = Math.max(0, leaveCategory.alloted - leaveCategory.availed);
    }
  });

  // Clean up invalid editHistory entries before validation
  // This handles cases where existing documents have partial/invalid entries
  if (this.editHistory && Array.isArray(this.editHistory)) {
    this.editHistory = this.editHistory.filter((entry: any) => {
      // Only keep entries that have all required fields
      return entry &&
        entry.editedBy &&
        entry.editedBy.id &&
        entry.editedBy.name &&
        entry.field &&
        typeof entry.oldValue === 'number' &&
        typeof entry.newValue === 'number' &&
        entry.editedAt;
    });
  } else if (this.isNew || !this.editHistory) {
    // Initialize editHistory for new documents or if it doesn't exist
    this.editHistory = [];
  }

  next();
});


export const LeaveSummary = model<ILeaveSummary>('LeaveSummary', leaveSummarySchema); 