import { Schema, model, Document, Types } from 'mongoose';

export interface IOvertime extends Document {
  userId: string | Types.ObjectId;
  date: Date;
  month: number; // 1-12 (not index)
  year: number;
  hours: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  remarks?: string;
  approvedBy?: string | Types.ObjectId;
  approvedAt?: Date;
}

const overtimeSchema = new Schema<IOvertime>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    date: { type: Date, required: true },
    month: { 
      type: Number, 
      required: true, 
      min: 1, 
      max: 12,
      validate: {
        validator: Number.isInteger,
        message: 'Month must be a whole number between 1-12',
      }
    },
    year: { 
      type: Number, 
      required: true,
      min: 2000,
      max: 2100,
      validate: {
        validator: Number.isInteger,
        message: 'Year must be a whole number',
      }
    },
    hours: {
      type: Number,
      required: true,
      min: 0,
      max: 24,
      validate: {
        validator: Number.isInteger,
        message: 'Hours must be a whole number',
      },
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      required: true,
      default: 'Pending',
    },
    remarks: String,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
overtimeSchema.index({ userId: 1, date: -1 });
overtimeSchema.index({ userId: 1, month: 1, year: 1 }); // For payroll queries
overtimeSchema.index({ status: 1 });

// Pre-save middleware to automatically populate month and year from date
overtimeSchema.pre('save', function(next) {
  if (this.date && (!this.month || !this.year)) {
    this.month = this.date.getMonth() + 1; // getMonth() returns 0-11, so add 1
    this.year = this.date.getFullYear();
  }
  next();
});

// Pre-insertMany middleware for bulk operations
overtimeSchema.pre('insertMany', function(next, docs) {
  if (Array.isArray(docs)) {
    docs.forEach(doc => {
      if (doc.date && (!doc.month || !doc.year)) {
        const date = new Date(doc.date);
        doc.month = date.getMonth() + 1; // getMonth() returns 0-11, so add 1
        doc.year = date.getFullYear();
      }
    });
  }
  next();
});

export const Overtime = model<IOvertime>('Overtime', overtimeSchema); 