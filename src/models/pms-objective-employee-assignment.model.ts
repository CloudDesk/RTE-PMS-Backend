import mongoose, { Document, Schema, Types } from 'mongoose';
import {
  AssessmentTermCode,
  ObjectiveEmployeeAssignmentStatus,
  ObjectiveTermEntryOverrideStatus,
  ObjectiveTermSubmissionMode,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  ObjectiveEmployeeAssignmentStatus as ObjectiveEmployeeAssignmentStatusType,
  ObjectiveTermEntryOverrideStatus as ObjectiveTermEntryOverrideStatusType,
  ObjectiveTermSubmissionMode as ObjectiveTermSubmissionModeType,
} from '../constants/pms.enums';
import {
  objectiveFrozenSnapshotSchema,
  type IObjectiveBusinessSnapshot,
} from './pms-objective-master-version.model';

const objectiveTermEntryOverrideSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['PAST_TERM'],
      required: true,
      default: 'PAST_TERM',
    },
    status: {
      type: String,
      enum: Object.values(ObjectiveTermEntryOverrideStatus),
      required: true,
    },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    enabledAt: { type: Date, required: true },
    enabledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revokedAt: Date,
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revocationReason: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

export interface IObjectiveFinalRecordParticipantSnapshot {
  id: string;
  name?: string;
  employeeCode?: string;
  department?: string;
  role?: string;
}

export interface IObjectiveFinalRecordTermSubmission {
  term: AssessmentTermCodeType;
  submittedAt?: string;
  submittedBy?: string;
  submittedByName?: string;
  onBehalfOf?: string;
  onBehalfOfName?: string;
  submissionMode?: ObjectiveTermSubmissionModeType;
}

export interface IObjectiveFinalRecordContributor {
  employee: IObjectiveFinalRecordParticipantSnapshot;
  terms: AssessmentTermCodeType[];
  onBehalfOf: IObjectiveFinalRecordParticipantSnapshot;
}

export interface IObjectiveFinalRecordConsolidatedNote {
  rowId: string;
  columnId: string;
  entries: Array<{ term: AssessmentTermCodeType; value: string }>;
  value: string;
}

export interface IObjectiveAssignmentFinalRecordSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  generatedBy: string;
  generationMode: 'SUBMISSION' | 'BACKFILL';
  completedAt?: string;
  completionBasis: 'EMPLOYEE_SELECTED_TERMS';
  objectiveAssignmentId: string;
  objectiveAssignmentPeriodId: string;
  objectiveMasterId: string;
  objectiveVersionId: string;
  selectedTerms: AssessmentTermCodeType[];
  termSubmissions: IObjectiveFinalRecordTermSubmission[];
  contributors: IObjectiveFinalRecordContributor[];
  assignmentPeriodSnapshot: Record<string, unknown>;
  employeeSnapshot: IObjectiveFinalRecordParticipantSnapshot;
  managerSnapshot?: IObjectiveFinalRecordParticipantSnapshot;
  frozenObjectiveSnapshot: IObjectiveBusinessSnapshot;
  employeeValues: Record<string, unknown>;
  calculatedValues: Record<string, number>;
  consolidatedNotes: IObjectiveFinalRecordConsolidatedNote[];
  contentHash: string;
}

export interface IObjectiveEmployeeAssignmentSharedAccess {
  _id?: Types.ObjectId;
  sharedWithEmployeeId: Types.ObjectId;
  terms: AssessmentTermCodeType[];
  status: 'ACTIVE' | 'REVOKED';
  note?: string;
  sharedBy: Types.ObjectId;
  sharedAt: Date;
  revokedBy?: Types.ObjectId;
  revokedAt?: Date;
  revocationReason?: string;
}

export interface IObjectiveEmployeeAssignment extends Document {
  objectiveAssignmentPeriodId: Types.ObjectId;
  objectiveMasterId: Types.ObjectId;
  objectiveVersionId: Types.ObjectId;
  employeeId: Types.ObjectId;
  managerId?: Types.ObjectId;
  selectedTerms: AssessmentTermCodeType[];
  termStates?: Array<{
    term: AssessmentTermCodeType;
    status: ObjectiveEmployeeAssignmentStatusType | 'LOCKED' | 'OPEN' | 'RETURNED';
    fillStartDate: Date;
    fillEndDate: Date;
    submittedAt?: Date;
    submittedBy?: Types.ObjectId;
    closedAt?: Date;
    closedBy?: Types.ObjectId;
    readOnlyReason?: string;
    submissionMode?: ObjectiveTermSubmissionModeType;
    entryOverride?: {
      type: 'PAST_TERM';
      status: ObjectiveTermEntryOverrideStatusType;
      opensAt: Date;
      closesAt: Date;
      reason: string;
      enabledAt: Date;
      enabledBy: Types.ObjectId;
      revokedAt?: Date;
      revokedBy?: Types.ObjectId;
      revocationReason?: string;
    };
  }>;
  frozenObjectiveSnapshot: IObjectiveBusinessSnapshot;
  values?: Record<string, unknown>;
  sharedAccess?: IObjectiveEmployeeAssignmentSharedAccess[];
  managerValues?: Record<string, unknown>;
  managerTermStates?: Array<{
    term: AssessmentTermCodeType;
    status: 'LOCKED' | 'OPEN' | 'SUBMITTED' | 'CLOSED';
    fillStartDate?: Date;
    fillEndDate?: Date;
    submittedAt?: Date;
    submittedBy?: Types.ObjectId;
    closedAt?: Date;
    closedBy?: Types.ObjectId;
    readOnlyReason?: string;
  }>;
  managerSubmittedAt?: Date;
  managerSubmittedBy?: Types.ObjectId;
  finalRecord?: IObjectiveAssignmentFinalRecordSnapshot;
  status: ObjectiveEmployeeAssignmentStatusType;
  submittedAt?: Date;
  submittedBy?: Types.ObjectId;
  closedAt?: Date;
  closedBy?: Types.ObjectId;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const objectiveEmployeeAssignmentSchema = new Schema<IObjectiveEmployeeAssignment>(
  {
    objectiveAssignmentPeriodId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'ObjectiveAssignmentPeriod',
      index: true,
    },
    objectiveMasterId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'ObjectiveMaster',
      index: true,
    },
    objectiveVersionId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'ObjectiveMasterVersion',
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    selectedTerms: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      required: true,
      default: [],
      index: true,
    },
    termStates: {
      type: [
        {
          term: {
            type: String,
            required: true,
            enum: Object.values(AssessmentTermCode),
          },
          status: {
            type: String,
            required: true,
            enum: [...Object.values(ObjectiveEmployeeAssignmentStatus), 'LOCKED', 'OPEN', 'RETURNED'],
            default: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
            index: true,
          },
          fillStartDate: {
            type: Date,
            required: true,
          },
          fillEndDate: {
            type: Date,
            required: true,
          },
          submittedAt: Date,
          submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          closedAt: Date,
          closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          readOnlyReason: { type: String, trim: true },
          submissionMode: {
            type: String,
            enum: Object.values(ObjectiveTermSubmissionMode),
          },
          entryOverride: {
            type: objectiveTermEntryOverrideSchema,
            required: false,
            default: undefined,
          },
        },
      ],
      default: [],
    },
    frozenObjectiveSnapshot: {
      type: objectiveFrozenSnapshotSchema,
      required: true,
    },
    values: {
      type: Schema.Types.Mixed,
      default: {},
    },
    sharedAccess: {
      type: [
        {
          sharedWithEmployeeId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
          },
          terms: {
            type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
            required: true,
            default: [],
          },
          status: {
            type: String,
            enum: ['ACTIVE', 'REVOKED'],
            required: true,
            default: 'ACTIVE',
            index: true,
          },
          note: { type: String, trim: true, maxlength: 500 },
          sharedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
          },
          sharedAt: {
            type: Date,
            required: true,
            default: Date.now,
          },
          revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          revokedAt: Date,
          revocationReason: { type: String, trim: true, maxlength: 500 },
        },
      ],
      default: [],
    },
    managerValues: {
      type: Schema.Types.Mixed,
      default: {},
    },
    managerTermStates: {
      type: [
        {
          term: {
            type: String,
            required: true,
            enum: Object.values(AssessmentTermCode),
          },
          status: {
            type: String,
            required: true,
            enum: ['LOCKED', 'OPEN', 'SUBMITTED', 'CLOSED'],
            default: 'LOCKED',
            index: true,
          },
          fillStartDate: Date,
          fillEndDate: Date,
          submittedAt: Date,
          submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          closedAt: Date,
          closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          readOnlyReason: { type: String, trim: true },
        },
      ],
      default: [],
    },
    managerSubmittedAt: Date,
    managerSubmittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    finalRecord: {
      type: Schema.Types.Mixed,
      required: false,
      default: undefined,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ObjectiveEmployeeAssignmentStatus),
      default: ObjectiveEmployeeAssignmentStatus.ASSIGNED,
      index: true,
    },
    submittedAt: Date,
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedAt: Date,
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'pms_objective_employee_assignments',
    timestamps: true,
    optimisticConcurrency: true,
  },
);

objectiveEmployeeAssignmentSchema.index({
  objectiveAssignmentPeriodId: 1,
  employeeId: 1,
  status: 1,
  isDeleted: 1,
});
objectiveEmployeeAssignmentSchema.index({
  objectiveMasterId: 1,
  objectiveVersionId: 1,
  employeeId: 1,
  isDeleted: 1,
});
objectiveEmployeeAssignmentSchema.index({ managerId: 1, status: 1, isDeleted: 1 });
objectiveEmployeeAssignmentSchema.index(
  { managerId: 1, isDeleted: 1, createdAt: -1 },
  { name: 'idx_team_objective_manager_list' },
);
objectiveEmployeeAssignmentSchema.index({ selectedTerms: 1, status: 1, isDeleted: 1 });
objectiveEmployeeAssignmentSchema.index({
  'sharedAccess.sharedWithEmployeeId': 1,
  'sharedAccess.status': 1,
  isDeleted: 1,
});
objectiveEmployeeAssignmentSchema.index({
  'sharedAccess.terms': 1,
  'sharedAccess.status': 1,
  isDeleted: 1,
});
objectiveEmployeeAssignmentSchema.index({ 'termStates.term': 1, 'termStates.status': 1, isDeleted: 1 });
objectiveEmployeeAssignmentSchema.index({ 'managerTermStates.term': 1, 'managerTermStates.status': 1, isDeleted: 1 });
objectiveEmployeeAssignmentSchema.index({
  'termStates.entryOverride.status': 1,
  'termStates.entryOverride.closesAt': 1,
  isDeleted: 1,
});
objectiveEmployeeAssignmentSchema.index(
  {
    objectiveAssignmentPeriodId: 1,
    objectiveVersionId: 1,
    employeeId: 1,
  },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
    name: 'idx_unique_objective_employee_assignment',
  },
);

export const ObjectiveEmployeeAssignment = mongoose.model<IObjectiveEmployeeAssignment>(
  'ObjectiveEmployeeAssignment',
  objectiveEmployeeAssignmentSchema,
);
