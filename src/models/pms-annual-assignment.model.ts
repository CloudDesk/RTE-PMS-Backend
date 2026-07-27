import mongoose, { Document, Schema, Types } from 'mongoose';
import { AnnualDecisionStatus, AnnualWorkflowState, AssessmentTermCode } from '../constants/pms.enums';
import type { PmsAssignmentWindowSnapshot } from '../utilis/pmsAssignmentWindows';
import type {
  AnnualDecisionStatus as AnnualDecisionStatusType,
  AnnualWorkflowState as AnnualWorkflowStateType,
  AssessmentTermCode as AssessmentTermCodeType,
} from '../constants/pms.enums';
import type {
  FinalReviewerSource,
  FinalReviewStatus,
} from '../utilis/finalReviewer';

type QuarterCode = AssessmentTermCodeType;

interface IVisibilityCache {
  cacheSource?: string;
  employeeReviewVisible: boolean;
  employeeGradeVisible: boolean;
  employeeMeritVisible: boolean;
  managerGradeVisible: boolean;
  managerMeritVisible: boolean;
}

export const EmployeeCareerProfileSnapshotTrigger = {
  FIRST_MANAGER_REVIEW_SUBMISSION: 'FIRST_MANAGER_REVIEW_SUBMISSION',
  ANNUAL_DECISION_DRAFT: 'ANNUAL_DECISION_DRAFT',
  ANNUAL_FINALIZATION: 'ANNUAL_FINALIZATION',
  ASSIGNMENT_CLOSED: 'ASSIGNMENT_CLOSED',
  LEGACY_BACKFILL: 'LEGACY_BACKFILL',
} as const;

export type EmployeeCareerProfileSnapshotTrigger =
  (typeof EmployeeCareerProfileSnapshotTrigger)[keyof typeof EmployeeCareerProfileSnapshotTrigger];

export interface IEmployeeCareerProfileSnapshot {
  profileAvailable: boolean;
  sourceProfileId?: Types.ObjectId;
  profileVersion?: number;
  currentGrade?: string;
  gradeEffectiveDate?: Date;
  yearsInGradeAtReferenceDate?: number;
  previousExperienceYears?: number;
  qualification?: string;
  careerProgressionPast: Array<{
    year: number;
    grade?: string;
    function?: string;
    unitOrDepartment?: string;
    sequence: number;
  }>;
  profileAsOfDate?: Date;
  snapshotAt: Date;
  trigger: EmployeeCareerProfileSnapshotTrigger;
  triggeredBy?: Types.ObjectId;
}

export interface IAnnualAssignment extends Document {
  employeeId: Types.ObjectId;
  assignedManagerId: Types.ObjectId;
  finalReviewerId?: Types.ObjectId;
  finalReviewerSource?: FinalReviewerSource;
  finalReviewerSnapshot?: {
    employeeCode?: string;
    name: string;
    email?: string;
    role: string;
    specificRole?: string;
  };
  finalReviewStatus: FinalReviewStatus;
  finalReviewCompletedBy?: Types.ObjectId;
  finalReviewCompletedAt?: Date;
  directorReviewerId?: Types.ObjectId;
  directorReviewerSource?: FinalReviewerSource;
  directorReviewerSnapshot?: {
    employeeCode?: string;
    name: string;
    email?: string;
    role: string;
    specificRole?: string;
  };
  directorReviewStatus: FinalReviewStatus;
  directorReviewCompletedBy?: Types.ObjectId;
  directorReviewCompletedAt?: Date;
  cycleId: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  termAssignmentIds: Types.ObjectId[];
  annualState: AnnualWorkflowStateType;
  finalDecisionStatus?: AnnualDecisionStatusType;
  isGradeApplied?: boolean;
  isMeritApplied?: boolean;
  gradeDetails?: Record<string, unknown>;
  meritDetails?: Record<string, unknown>;
  nilReason?: string;
  appraisalOutcomeType?: string;
  applicableTerms: QuarterCode[];
  assignmentReason: string;
  launchSource?: 'ADMIN_CYCLE' | 'MANAGER_INITIATED';
  launchedByRole?: 'ADMIN' | 'MANAGER';
  launchedByUserId?: Types.ObjectId;
  flowPolicy?: Record<string, unknown>;
  assignmentWindowSnapshot?: PmsAssignmentWindowSnapshot;
  visibility: IVisibilityCache;
  employeeSnapshot?: Record<string, unknown>;
  managerSnapshot?: Record<string, unknown>;
  orgSnapshot?: Record<string, unknown>;
  careerProfileSnapshot?: IEmployeeCareerProfileSnapshot;
  communicationStatus?: string;
  isDeleted: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const visibilityCacheSchema = new Schema<IVisibilityCache>(
  {
    cacheSource: { type: String, default: 'visibility_configurations' },
    employeeReviewVisible: { type: Boolean, default: false },
    employeeGradeVisible: { type: Boolean, default: false },
    employeeMeritVisible: { type: Boolean, default: false },
    managerGradeVisible: { type: Boolean, default: false },
    managerMeritVisible: { type: Boolean, default: false },
  },
  { _id: false },
);

const careerProfileSnapshotEntrySchema = new Schema(
  {
    year: { type: Number, required: true, min: 1900, max: 2200 },
    grade: { type: String, trim: true, maxlength: 100 },
    function: { type: String, trim: true, maxlength: 150 },
    unitOrDepartment: { type: String, trim: true, maxlength: 150 },
    sequence: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const employeeCareerProfileSnapshotSchema =
  new Schema<IEmployeeCareerProfileSnapshot>(
    {
      profileAvailable: { type: Boolean, required: true },
      sourceProfileId: {
        type: Schema.Types.ObjectId,
        ref: 'PmsEmployeeCareerProfile',
      },
      profileVersion: { type: Number, min: 1 },
      currentGrade: { type: String, trim: true, maxlength: 100 },
      gradeEffectiveDate: Date,
      yearsInGradeAtReferenceDate: { type: Number, min: 0, max: 80 },
      previousExperienceYears: { type: Number, min: 0, max: 80 },
      qualification: { type: String, trim: true, maxlength: 250 },
      careerProgressionPast: {
        type: [careerProfileSnapshotEntrySchema],
        default: [],
      },
      profileAsOfDate: Date,
      snapshotAt: { type: Date, required: true },
      trigger: {
        type: String,
        required: true,
        enum: Object.values(EmployeeCareerProfileSnapshotTrigger),
      },
      triggeredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { _id: false },
  );

const annualAssignmentSchema = new Schema<IAnnualAssignment>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    assignedManagerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    finalReviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    finalReviewerSource: {
      type: String,
      enum: ['REPORTING_L2', 'REPORTING_DIRECTOR', 'L1_DIRECTOR', 'CYCLE_DEFAULT'],
    },
    finalReviewerSnapshot: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    finalReviewStatus: {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING', 'IN_PROGRESS', 'COMPLETED'],
      default: 'NOT_REQUIRED',
      required: true,
      index: true,
    },
    finalReviewCompletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    finalReviewCompletedAt: Date,
    directorReviewerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    directorReviewerSource: {
      type: String,
      enum: ['REPORTING_L2', 'REPORTING_DIRECTOR', 'L1_DIRECTOR', 'CYCLE_DEFAULT'],
    },
    directorReviewerSnapshot: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    directorReviewStatus: {
      type: String,
      enum: ['NOT_REQUIRED', 'PENDING', 'IN_PROGRESS', 'COMPLETED'],
      default: 'NOT_REQUIRED',
      required: true,
      index: true,
    },
    directorReviewCompletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    directorReviewCompletedAt: Date,
    cycleId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'AnnualCycle',
      index: true,
    },
    templateVersionId: {
      type: Schema.Types.ObjectId,
      required: false,
      ref: 'PmsTemplateVersion',
      index: true,
    },
    termAssignmentIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'TermAssignment' }],
      default: [],
    },
    annualState: {
      type: String,
      required: true,
      enum: Object.values(AnnualWorkflowState),
      default: AnnualWorkflowState.DRAFT,
      index: true,
    },
    finalDecisionStatus: {
      type: String,
      enum: Object.values(AnnualDecisionStatus),
      default: AnnualDecisionStatus.DRAFT,
    },
    isGradeApplied: Boolean,
    isMeritApplied: Boolean,
    gradeDetails: Schema.Types.Mixed,
    meritDetails: Schema.Types.Mixed,
    nilReason: String,
    appraisalOutcomeType: String,
    applicableTerms: {
      type: [{ type: String, enum: Object.values(AssessmentTermCode) }],
      default: ['Q1', 'Q2', 'Q3', 'Q4'],
    },
    assignmentReason: { type: String, default: 'FULL_YEAR' },
    launchSource: {
      type: String,
      enum: ['ADMIN_CYCLE', 'MANAGER_INITIATED'],
      default: 'ADMIN_CYCLE',
      index: true,
    },
    launchedByRole: {
      type: String,
      enum: ['ADMIN', 'MANAGER'],
    },
    launchedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    flowPolicy: { type: Schema.Types.Mixed, default: {} },
    assignmentWindowSnapshot: { type: Schema.Types.Mixed, default: undefined },
    visibility: { type: visibilityCacheSchema, default: () => ({}) },
    employeeSnapshot: { type: Schema.Types.Mixed, default: {} },
    managerSnapshot: { type: Schema.Types.Mixed, default: {} },
    orgSnapshot: { type: Schema.Types.Mixed, default: {} },
    careerProfileSnapshot: {
      type: employeeCareerProfileSnapshotSchema,
      default: undefined,
    },
    communicationStatus: { type: String, default: 'NOT_REQUIRED' },
    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'annual_assignments',
    timestamps: true,
  },
);

annualAssignmentSchema.index(
  { employeeId: 1, cycleId: 1 },
  { unique: true, name: 'idx_employee_annual_cycle' },
);
annualAssignmentSchema.index({ assignedManagerId: 1, annualState: 1 });
annualAssignmentSchema.index({ finalReviewerId: 1, finalReviewStatus: 1 });
annualAssignmentSchema.index({ directorReviewerId: 1, directorReviewStatus: 1 });
annualAssignmentSchema.index({ cycleId: 1, assignedManagerId: 1, annualState: 1 });
annualAssignmentSchema.index({ cycleId: 1, appraisalOutcomeType: 1 });
annualAssignmentSchema.index({ cycleId: 1, 'employeeSnapshot.department': 1 });
annualAssignmentSchema.index({ cycleId: 1, 'orgSnapshot.businessUnit': 1 });
annualAssignmentSchema.index({ launchSource: 1, launchedByUserId: 1, annualState: 1 });
annualAssignmentSchema.index({ 'careerProfileSnapshot.snapshotAt': 1 });

export const AnnualAssignment = mongoose.model<IAnnualAssignment>(
  'AnnualAssignment',
  annualAssignmentSchema,
);
