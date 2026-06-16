import mongoose, { Document, Schema, Types } from 'mongoose';
import { ObjectiveSource } from '../constants/pms.enums';

export interface IManagerObjectiveLibraryItem {
  localId: string;
  source: typeof ObjectiveSource.MANAGER_CREATED;
  title: string;
  description?: string;
  priority?: string;
  expectedOutcome?: string;
  kpi?: string;
  targetValue?: string;
  dueDate?: string;
  weightage?: number;
  successCriteria?: string;
  attachments: any[];
  objectiveValues: any[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IManagerObjectiveLibrary extends Document {
  managerId: Types.ObjectId;
  objectives: IManagerObjectiveLibraryItem[];
  createdAt: Date;
  updatedAt: Date;
}

const managerObjectiveLibraryItemSchema = new Schema(
  {
    localId: { type: String, required: true, trim: true },
    source: {
      type: String,
      enum: [ObjectiveSource.MANAGER_CREATED],
      default: ObjectiveSource.MANAGER_CREATED,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    priority: {
      type: String,
      trim: true,
      uppercase: true,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
    },
    expectedOutcome: { type: String, trim: true },
    kpi: { type: String, trim: true },
    targetValue: { type: String, trim: true },
    dueDate: { type: String, trim: true },
    weightage: Number,
    successCriteria: { type: String, trim: true },
    attachments: { type: [Schema.Types.Mixed], default: [] },
    objectiveValues: { type: [Schema.Types.Mixed], default: [] },
    createdAt: Date,
    updatedAt: Date,
  },
  { _id: false },
);

const managerObjectiveLibrarySchema = new Schema<IManagerObjectiveLibrary>(
  {
    managerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      unique: true,
      index: true,
    },
    objectives: {
      type: [managerObjectiveLibraryItemSchema],
      default: [],
    },
  },
  {
    collection: 'pms_manager_objective_libraries',
    timestamps: true,
  },
);

export const ManagerObjectiveLibrary = mongoose.model<IManagerObjectiveLibrary>(
  'ManagerObjectiveLibrary',
  managerObjectiveLibrarySchema,
);
