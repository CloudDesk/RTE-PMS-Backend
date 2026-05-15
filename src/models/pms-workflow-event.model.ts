import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IWorkflowEvent extends Document {
  entityType: string;
  entityId: Types.ObjectId | string;
  annualAssignmentId?: Types.ObjectId;
  quarterAssignmentId?: Types.ObjectId;
  cycleId?: Types.ObjectId;
  fromState: string;
  toState: string;
  action: string;
  actorUserId: Types.ObjectId | string;
  actorRole: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdBy?: Types.ObjectId | string;
  createdAt: Date;
}

const workflowEventSchema = new Schema<IWorkflowEvent>(
  {
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: Schema.Types.Mixed, required: true, index: true },
    annualAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualAssignment',
      index: true,
    },
    quarterAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'QuarterAssignment',
      index: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'AnnualCycle',
      index: true,
    },
    fromState: { type: String, required: true, trim: true },
    toState: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true },
    actorUserId: { type: Schema.Types.Mixed, required: true },
    actorRole: { type: String, required: true, trim: true },
    reason: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdBy: Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: 'workflow_events',
    timestamps: false,
  },
);

workflowEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
workflowEventSchema.index({ annualAssignmentId: 1, createdAt: -1 });
workflowEventSchema.index({ quarterAssignmentId: 1, createdAt: -1 });

export const WorkflowEvent = mongoose.model<IWorkflowEvent>(
  'WorkflowEvent',
  workflowEventSchema,
);
