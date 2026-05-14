import { Schema, model, Document, Types } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  code: string;
  parentId?: Types.ObjectId;
  level: number;
  path: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
    },
    level: {
      type: Number,
      required: true,
      min: 0,
    },
    path: [{
      type: String,
      required: true,
    }],
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
organizationSchema.index({ code: 1 }, { unique: true });
organizationSchema.index({ parentId: 1 });
organizationSchema.index({ path: 1 });
organizationSchema.index({ level: 1 });

export const Organization = model<IOrganization>('Organization', organizationSchema);