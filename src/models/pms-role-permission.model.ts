import { Schema, model, Document } from 'mongoose';

export interface IPmsRolePermission extends Document {
  role: string;
  resource: string;
  action: string;
  scope: 'OWN' | 'TEAM' | 'ALL' | 'DELEGATED' | 'HIERARCHY';
  conditions: Record<string, unknown>;
  isAllowed: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

const pmsRolePermissionSchema = new Schema<IPmsRolePermission>(
  {
    role: { type: String, required: true },
    resource: { type: String, required: true }, // e.g., 'objective', 'quarterReview', 'annualDecision', '*'
    action: { type: String, required: true },   // e.g., 'create', 'read', 'update', 'delete', '*'
    scope: { 
      type: String, 
      enum: ['OWN', 'TEAM', 'ALL', 'DELEGATED', 'HIERARCHY'], 
      required: true,
      default: 'OWN'
    },
    conditions: { type: Schema.Types.Mixed, default: {} },
    isAllowed: { type: Boolean, required: true, default: true },
    priority: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
  }
);

pmsRolePermissionSchema.index({ role: 1, resource: 1, action: 1 });

export const PmsRolePermission = model<IPmsRolePermission>('PmsRolePermission', pmsRolePermissionSchema);
