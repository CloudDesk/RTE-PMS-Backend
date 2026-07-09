import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualWorkflowState,
  AssessmentTermCode,
  FlexibleObjectiveSourceType,
  ObjectiveAssignmentRuleStatus,
  ObjectiveApplicabilityStatus,
  ObjectiveAttachmentPolicy,
  ObjectiveActualAggregationMode,
  ObjectiveScoringMode,
  ObjectiveMasterType,
  ObjectiveMasterStatus,
  ObjectiveMasterVersionStatus,
  ObjectiveSource,
  ObjectiveStatus,
  ObjectiveTargetDirection,
  PmsRole,
  PmsTemplateSectionType,
  TermWorkflowState,
  isTermFinalized,
} from '../constants/pms.enums';
import { Objective } from '../models/pms-objective.model';
import { ObjectiveAssignmentRule } from '../models/pms-objective-assignment-rule.model';
import { ObjectiveMaster } from '../models/pms-objective-master.model';
import { ObjectiveMasterVersion } from '../models/pms-objective-master-version.model';
import { ObjectiveValue } from '../models/pms-objective-value.model';
import { ObjectiveAttachment } from '../models/pms-objective-attachment.model';
import { ObjectiveComment } from '../models/pms-objective-comment.model';
import { PmsDocument } from '../models/pms-document.model';
import { ManagerObjectiveLibrary } from '../models/pms-manager-objective-library.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import { TermReview } from '../models/pms-term-review.model';
import { EmployeeAchievementSubmission } from '../models/pms-employee-achievement-submission.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { AuditLog } from '../models/audit-log.model';
import { User } from '../models/user.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { DelegationService } from './delegation.service';
import { PmsTemplateService, type ResolvedTemplateField } from './pms-template.service';
import { transitionTermAssignmentState } from './term-assignment-workflow.service';
import type { IObjective } from '../models/pms-objective.model';
import type { IManagerObjectiveLibraryItem } from '../models/pms-manager-objective-library.model';
import type { ITermAssignment } from '../models/pms-term-assignment.model';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type {
  IObjectiveBucket,
  ITemplatePredefinedObjective,
  ITemplateSection,
} from '../models/pms-template-version.model';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
  FlexibleObjectiveSourceType as FlexibleObjectiveSourceTypeType,
  ObjectiveAssignmentRuleStatus as ObjectiveAssignmentRuleStatusType,
  ObjectiveApplicabilityStatus as ObjectiveApplicabilityStatusType,
  ObjectiveAttachmentPolicy as ObjectiveAttachmentPolicyType,
  ObjectiveMasterType as ObjectiveMasterTypeType,
  ObjectiveMasterStatus as ObjectiveMasterStatusType,
  ObjectiveMasterVersionStatus as ObjectiveMasterVersionStatusType,
  ObjectiveSource as ObjectiveSourceType,
  ObjectiveTargetDirection as ObjectiveTargetDirectionType,
} from '../constants/pms.enums';

type AssessmentTermCodeValue = AssessmentTermCodeType;

interface ObjectiveAttachmentInput {
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  documentId?: string;
  uploadedBy?: string;
  uploadedByRole?: string;
  uploadedAt?: Date | string;
  visibilityRules?: Record<string, unknown>;
}

interface ObjectiveValueInput {
  templateFieldId?: string;
  fieldKey: string;
  sectionKey: string;
  roleCode?: string;
  actorUserId?: string;
  workflowStage?: string;
  valueJson?: unknown;
  valueText?: string;
  valueNumber?: number;
  valueDate?: Date | string;
  valueStatus?: string;
}

export interface CreateObjectiveInput {
  termAssignmentId: string;
  title: string;
  description?: string;
  priority?: string;
  expectedOutcome?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDate?: Date | string;
  weightage?: number;
  successCriteria?: string;
  attachments?: ObjectiveAttachmentInput[];
  objectiveValues?: ObjectiveValueInput[];
  commentText?: string;
}

type BulkManagerObjectiveDraftInput = Omit<CreateObjectiveInput, 'termAssignmentId'> & {
  clientObjectiveId?: string;
};

export interface BulkManagerObjectiveWeightageAdjustmentInput {
  termAssignmentId: string;
  objectiveId: string;
  weightage: number;
}

export interface BulkManagerObjectiveWeightageOverrideInput {
  termAssignmentId: string;
  clientObjectiveId?: string;
  objectiveIndex?: number;
  weightage: number;
}

export interface ManagerObjectiveLibraryDraftInput {
  localId?: string;
  source?: ObjectiveSourceType;
  title: string;
  description?: string;
  priority?: string;
  expectedOutcome?: string;
  kpi?: string;
  targetValue?: string;
  dueDate?: string;
  weightage?: number;
  successCriteria?: string;
  attachments?: ObjectiveAttachmentInput[];
  objectiveValues?: ObjectiveValueInput[];
}

export interface SaveManagerObjectiveLibraryInput {
  objectives?: ManagerObjectiveLibraryDraftInput[];
}

export interface BulkCreateManagerObjectiveInput extends Partial<BulkManagerObjectiveDraftInput> {
  termAssignmentIds: string[];
  objectives?: BulkManagerObjectiveDraftInput[];
  weightageAdjustments?: BulkManagerObjectiveWeightageAdjustmentInput[];
  objectiveWeightageOverrides?: BulkManagerObjectiveWeightageOverrideInput[];
}

export interface UpdateObjectiveInput {
  title?: string;
  description?: string;
  priority?: string;
  expectedOutcome?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDate?: Date | string;
  weightage?: number;
  successCriteria?: string;
  attachments?: ObjectiveAttachmentInput[];
  objectiveValues?: ObjectiveValueInput[];
}

export interface SaveAssignmentTemplateValuesInput {
  objectiveValues?: ObjectiveValueInput[];
}

export interface ObjectiveFillabilityFieldPolicy {
  templateFieldId?: string;
  fieldKey: string;
  sectionKey: string;
  fieldLabel: string;
  fieldType: string;
  visible: boolean;
  editable: boolean;
  required: boolean;
  roleCode: string;
  workflowState: string;
  denialReason?: string;
}

export interface ObjectiveFillabilityPolicy {
  objectiveId?: string;
  termAssignmentId: string;
  annualAssignmentId: string;
  cycleId?: string;
  employeeId: string;
  assignedManagerId: string;
  assessmentTermCode?: string;
  actorRole: string;
  actorUserId: string;
  workflowState: string;
  canEditAnyField: boolean;
  source: 'TEMPLATE' | 'LEGACY_NO_TEMPLATE';
  fields: ObjectiveFillabilityFieldPolicy[];
}

export interface ReturnObjectiveInput {
  reason: string;
}

export interface ApproveObjectiveInput {
  weightage?: number;
}

export interface AddObjectiveCommentInput {
  commentText: string;
  commentType?: string;
}

export interface CloseObjectiveSettingInput {
  confirm?: boolean;
  confirmationAccepted?: boolean;
  reason?: string;
}

export interface CorrectObjectiveInput {
  reason: string;
  title?: string;
  description?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDate?: Date | string;
  priority?: string;
  expectedOutcome?: string;
  weightage?: number;
  successCriteria?: string;
  attachments?: ObjectiveAttachmentInput[];
  objectiveValues?: ObjectiveValueInput[];
}

export interface AmendFlexibleObjectiveInput {
  action: 'MARK_NOT_APPLICABLE' | 'REPLACE_OBJECTIVE';
  reason: string;
  replacementObjectiveVersionId?: string;
  assignmentRuleRefs?: string[];
}

export interface FlexibleObjectiveAmendmentResult {
  previousObjective: IObjective;
  replacementObjective?: IObjective;
  action: string;
  applicabilityStatus: ObjectiveApplicabilityStatusType;
}

export interface ObjectiveReportingQuery {
  cycleId?: string;
  annualAssignmentId?: string;
  employeeId?: string;
  assessmentTerm?: AssessmentTermCodeType;
  sourceType?: FlexibleObjectiveSourceTypeType;
  objectiveMasterId?: string;
  objectiveVersionId?: string;
  status?: string;
}

export interface ObjectiveReportingRecord {
  objectiveId: string;
  objectiveSource: string;
  objectiveMasterId?: string;
  objectiveVersionId?: string;
  objectiveTitle: string;
  assignmentLevel: string;
  assignmentRuleIds: string[];
  cycleId?: string;
  annualAssignmentId?: string;
  termAssignmentId: string;
  assessmentTerm?: string;
  employeeId: string;
  assignedManagerId: string;
  employeeDepartment?: string;
  employeeGroup?: string;
  employeeRole?: string;
  objectiveApprovalStatus: string;
  applicabilityStatus: string;
  approvedWeightage?: number;
  scoreable?: boolean;
  targetValue?: string;
  actualValue?: unknown;
  targetDirection?: string;
  actualAggregationMode?: string;
  managerScore?: number;
  calculatedWeightedScore?: number;
  objectiveSectionScore?: number;
  objectiveSectionContribution?: number;
  objectiveScoringMode?: string;
  finalizedStatus?: boolean;
}

export interface ObjectiveDashboardStatusRecord {
  objectiveId: string;
  termAssignmentId: string;
  annualAssignmentId?: string;
  cycleId?: string;
  employeeId: string;
  assessmentTerm?: string;
  objectiveTitle: string;
  workflowStatus: string;
  applicabilityStatus: string;
  dashboardStatus:
    | 'not_started'
    | 'pending_objective_setup'
    | 'pending_achievement'
    | 'pending_manager_review'
    | 'submitted'
    | 'approved'
    | 'returned_for_revision'
    | 'finalized'
    | 'overdue'
    | 'closed_not_applicable'
    | 'blocked';
  blockedReason?: string;
}

interface ObjectiveOwnerInput {
  ownerUserId?: string;
  ownerRole?: string;
  ownerDepartment?: string;
  ownerScope?: Record<string, unknown>;
}

interface ObjectiveAssignerInput {
  assignerUserId?: string;
  assignerRole?: string;
  assignerDepartment?: string;
  assignerScope?: Record<string, unknown>;
}

interface ObjectiveReviewerInput {
  reviewerUserId?: string;
  reviewerRole?: string;
  reviewerDepartment?: string;
  reviewerScope?: Record<string, unknown>;
}

interface ObjectiveSheetLayoutInput {
  columns?: Array<{
    id?: string;
    label?: string;
    type?: string;
    width?: string;
    required?: boolean;
    defaultValue?: string;
    helpText?: string;
    options?: string[];
  }>;
  rows?: Array<{
    id?: string;
    label?: string;
    group?: string;
  }>;
  headerGroups?: Array<{
    id?: string;
    label?: string;
    startColumnId?: string;
    endColumnId?: string;
  }>;
  rowGroups?: Array<{
    id?: string;
    levelLabel?: string;
    label?: string;
    startRowId?: string;
    endRowId?: string;
  }>;
  formulas?: Array<{
    id?: string;
    kind?: string;
    label?: string;
    targetColumnId?: string;
    mode?: string;
    sourceColumnIds?: string[];
    leftColumnId?: string;
    rightColumnId?: string;
    customExpression?: string;
  }>;
  fillPermissions?: Array<{
    id?: string;
    columnId?: string;
    actor?: string;
    access?: string;
    required?: boolean;
    lockRule?: string;
  }>;
  termAvailability?: Array<{
    id?: string;
    columnId?: string;
    terms?: string[];
  }>;
}

interface NormalizedObjectiveSheetLayout {
  columns: Array<{
    id: string;
    label: string;
    type: string;
    width: string;
    required: boolean;
    defaultValue?: string;
    helpText?: string;
    options?: string[];
  }>;
  rows: Array<{
    id: string;
    label: string;
    group?: string;
  }>;
  headerGroups: Array<{
    id: string;
    label: string;
    startColumnId: string;
    endColumnId: string;
  }>;
  rowGroups: Array<{
    id: string;
    levelLabel: string;
    label: string;
    startRowId: string;
    endRowId: string;
  }>;
  formulas: Array<{
    id: string;
    kind: string;
    label: string;
    targetColumnId: string;
    mode: string;
    sourceColumnIds?: string[];
    leftColumnId?: string;
    rightColumnId?: string;
    customExpression?: string;
  }>;
  fillPermissions: Array<{
    id: string;
    columnId: string;
    actor: string;
    access: string;
    required: boolean;
    lockRule: string;
  }>;
  termAvailability: Array<{
    id: string;
    columnId: string;
    terms: string[];
  }>;
}

export interface ObjectiveMasterVersionDetailsInput
  extends ObjectiveOwnerInput,
    ObjectiveAssignerInput,
    ObjectiveReviewerInput {
  objectiveType?: ObjectiveMasterTypeType;
  sheetLayout?: ObjectiveSheetLayoutInput;
  title: string;
  description?: string;
  measurementGuidance?: string;
  targetValue?: string;
  targetDescription?: string;
  targetDirection?: ObjectiveTargetDirectionType;
  priority?: string;
  attachmentPolicy?: ObjectiveAttachmentPolicyType;
  scoreable?: boolean;
  defaultScoringEligibilityRef?: string;
  approvedWeightage?: number;
  applicableTermLabels?: AssessmentTermCodeType[];
}

export interface CreateObjectiveMasterInput extends ObjectiveMasterVersionDetailsInput {
  code?: string;
  sourceType: FlexibleObjectiveSourceTypeType;
}

export type UpdateObjectiveMasterVersionInput = Partial<ObjectiveMasterVersionDetailsInput>;

export interface ObjectiveMasterRecord {
  id: string;
  code?: string;
  sourceType: string;
  status: ObjectiveMasterStatusType;
  currentVersionId?: string;
  ownerUserId?: string;
  ownerRole?: string;
  ownerDepartment?: string;
  ownerScope?: Record<string, unknown>;
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ObjectiveMasterVersionRecord {
  id: string;
  objectiveMasterId: string;
  versionNo: number;
  status: ObjectiveMasterVersionStatusType;
  objectiveType: ObjectiveMasterTypeType;
  sheetLayout?: ObjectiveSheetLayoutInput;
  title: string;
  description?: string;
  measurementGuidance?: string;
  targetValue?: string;
  targetDescription?: string;
  targetDirection?: string;
  priority?: string;
  attachmentPolicy?: string;
  scoreable?: boolean;
  defaultScoringEligibilityRef?: string;
  approvedWeightage?: number;
  applicableTermLabels: string[];
  ownerUserId?: string;
  ownerRole?: string;
  ownerDepartment?: string;
  ownerScope?: Record<string, unknown>;
  assignerUserId?: string;
  assignerRole?: string;
  assignerDepartment?: string;
  assignerScope?: Record<string, unknown>;
  reviewerUserId?: string;
  reviewerRole?: string;
  reviewerDepartment?: string;
  reviewerScope?: Record<string, unknown>;
  activatedAt?: string;
  activatedBy?: string;
  activatedByName?: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivatedByName?: string;
  archivedAt?: string;
  archivedBy?: string;
  archivedByName?: string;
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ObjectiveVersionUsageRecord {
  objectiveId: string;
  annualAssignmentId?: string;
  cycleId?: string;
  employeeId?: string;
  assessmentTerm?: string;
  status?: string;
  title?: string;
}

export interface ObjectiveVersionHistoryRecord extends ObjectiveMasterVersionRecord {
  isCurrentActive: boolean;
  usageCount: number;
  assignmentRuleCount: number;
  usage: ObjectiveVersionUsageRecord[];
}

export interface ObjectiveMasterSummaryRecord {
  master: ObjectiveMasterRecord;
  currentVersion?: ObjectiveMasterVersionRecord;
  latestVersion?: ObjectiveMasterVersionRecord;
  versionCount: number;
  activeVersionCount: number;
  draftVersionCount: number;
  actions?: ObjectiveMasterActionAvailability;
}

export interface ObjectiveMasterDetailRecord extends ObjectiveMasterSummaryRecord {
  versions: ObjectiveVersionHistoryRecord[];
}

export interface ObjectiveMasterListQuery {
  search?: string;
  status?: ObjectiveMasterStatusType | string;
  sourceType?: FlexibleObjectiveSourceTypeType | string;
  ownerDepartment?: string;
  limit?: number | string;
  page?: number | string;
}

export interface ObjectiveMasterListResult {
  items: ObjectiveMasterSummaryRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface ObjectiveMasterWithVersionRecord {
  master: ObjectiveMasterRecord;
  version: ObjectiveMasterVersionRecord;
}

export interface ObjectiveMasterActionAvailability {
  canCreateDraftVersion: boolean;
  canEditDraft: boolean;
  canActivateDraft: boolean;
  canDeactivateActive: boolean;
  canArchiveVersion: boolean;
  canCreateAssignmentRule: boolean;
  canReviewActiveVersion: boolean;
}

export interface ObjectiveAssignmentCriteriaInput {
  company?: string;
  businessUnit?: string;
  location?: string;
  department?: string;
  team?: string;
  role?: string;
  designation?: string;
  grade?: string;
  employeeGroup?: string;
  reportingManagerId?: string;
  employeeIds?: string[];
}

export interface CreateObjectiveAssignmentRuleInput {
  objectiveVersionId: string;
  cycleId?: string;
  assessmentTermType?: AssessmentTermTypeType;
  termLabels?: AssessmentTermCodeType[];
  criteria?: ObjectiveAssignmentCriteriaInput;
  status?: ObjectiveAssignmentRuleStatusType;
  effectiveFrom?: Date | string;
  effectiveTo?: Date | string;
  note?: string;
}

export type UpdateObjectiveAssignmentRuleInput = Partial<CreateObjectiveAssignmentRuleInput>;

export interface ObjectiveAssignmentPreviewInput {
  cycleId: string;
  termLabels?: AssessmentTermCodeType[];
  assignmentRuleIds?: string[];
  objectiveVersionId?: string;
}

export interface ApplyObjectiveAssignmentsInput extends ObjectiveAssignmentPreviewInput {
  confirm?: boolean;
}

export interface ObjectiveAssignmentRuleRecord {
  id: string;
  objectiveMasterId: string;
  objectiveVersionId: string;
  cycleId?: string;
  assessmentTermType?: string;
  termLabels: string[];
  criteria: Record<string, unknown>;
  status: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  note?: string;
}

export interface ObjectiveAssignmentPreviewRow {
  key: string;
  assignmentRuleIds: string[];
  objectiveMasterId: string;
  objectiveVersionId: string;
  objectiveTitle: string;
  annualAssignmentId: string;
  termAssignmentId: string;
  cycleId: string;
  employeeId: string;
  employeeName?: string;
  employeeCode?: string;
  employeeDepartment?: string;
  employeeRole?: string;
  assessmentTerm: string;
  status: 'NEW' | 'ALREADY_ASSIGNED' | 'WARNING' | 'BLOCKED';
  warnings: string[];
  blockedReason?: string;
}

export interface ObjectiveAssignmentPreviewResult {
  cycleId: string;
  totalEmployees: number;
  totalTerms: number;
  newAssignments: number;
  alreadyAssigned: number;
  warnings: number;
  blocked: number;
  rows: ObjectiveAssignmentPreviewRow[];
}

export interface ObjectiveAssignmentApplyResult extends ObjectiveAssignmentPreviewResult {
  createdObjectiveIds: string[];
  updatedObjectiveIds: string[];
}

type AssignmentMode = 'employee' | 'manager';

type ObjectiveConfig = {
  mode: 'PREDEFINED' | 'DYNAMIC' | 'HYBRID';
  allowEmployeeCreated: boolean;
  allowManagerCreated: boolean;
  objectiveScoringPolicy: {
    objectiveScoringEnabled: boolean;
    objectiveScoringMode: string;
    objectiveSectionWeight: number;
    perObjectiveScoreEntryAllowed: boolean;
    overallScoreEntryAllowed: boolean;
    noObjectiveScoringPolicy: string;
    reviewTimingPolicy: Record<string, unknown>;
    includedAssessmentTermGroupingPolicy: Record<string, unknown>;
    termAggregationPolicy: Record<string, unknown>;
    scoringValidationRules: Record<string, unknown>;
    predefinedObjectivesScoreable: boolean;
    managerCreatedScoreable: boolean;
    employeeCreatedScoreable: boolean;
    requireManagerApprovalForEmployeeScore: boolean;
    requireWeightageBeforeAchievement: boolean;
    allowManagerOverallForRemainingWeightage: boolean;
    actualAggregationMode: string;
  };
  predefinedObjectives: Array<{
    key: string;
    title: string;
    description?: string;
    kpi?: string;
    targetValue?: string;
    dueDate?: string;
    weightage?: number;
    successCriteria?: string;
    attachmentAllowed?: boolean;
    applyToAllQuarters?: boolean;
    editable?: boolean;
    isActive?: boolean;
    applicableTerms?: AssessmentTermCodeValue[];
  }>;
  objectiveBuckets: IObjectiveBucket[];
};

type ObjectiveCommentRecord = {
  id: string;
  commentType: string;
  commentText: string;
  actorUserId: string;
  actorRole: string;
  actorName: string;
  createdAt: string;
  type: string;
  actorId: string;
};

type ObjectiveRecord = {
  id: string;
  backendId: string;
  assignmentId: string;
  termAssignmentId: string;
  employeeId: string;
  employeeName: string;
  managerId: string;
  managerName: string;
  source: string;
  templateObjectiveKey?: string;
  isPredefined: boolean;
  title: string;
  description: string;
  priority?: string;
  expectedOutcome?: string;
  kpi: string;
  targetValue: string;
  dueDate: string;
  weightage?: number;
  successCriteria: string;
  status: string;
  createdByRole: string;
  createdByUserId: string;
  createdByName: string;
  comments: ObjectiveCommentRecord[];
  objectiveValues: Array<{
    templateFieldId?: string;
    fieldKey: string;
    sectionKey: string;
    roleCode: string;
    actorUserId?: string;
    workflowStage: string;
    valueJson?: unknown;
    valueText?: string;
    valueNumber?: number;
    valueDate?: string;
    valueStatus?: string;
  }>;
  attachments: Array<{
    id: string;
    documentId?: string;
    fileName: string;
    fileType?: string;
    fileSize?: number;
    fileUrl?: string;
    uploadedAt: string;
    uploadedByName?: string;
    uploadedByRole?: string;
  }>;
  submittedAt?: string;
  approvedAt?: string;
  returnedReason?: string;
  returnedAt?: string;
  objectiveMasterId?: string;
  objectiveVersionId?: string;
  assignmentRuleRefs?: string[];
  sourceType?: string;
  objectiveSnapshot?: Record<string, unknown>;
  applicabilityStatus?: string;
  amendmentReason?: string;
  amendmentAction?: string;
  amendmentAt?: string;
  amendmentBy?: string;
  replacementObjectiveId?: string;
  updatedAt: string;
  createdAt: string;
};

type AssignmentRecord = {
  id: string;
  annualAssignmentId: string;
  termAssignmentId: string;
  cycleId: string;
  cycleName: string;
  cycleCode?: string;
  quarter: AssessmentTermCodeValue;
  assessmentTermType?: string;
  termCode?: AssessmentTermCodeValue;
  termLabel?: string;
  termState: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  employeeNo?: string;
  designation?: string;
  employeeDesignation?: string;
  department?: string;
  departmentId?: string;
  managerId: string;
  managerName: string;
  objectiveWeightageCap: number;
  backendConnected: boolean;
  achievementSubmissionEnabled?: boolean;
  objectiveConfig: ObjectiveConfig;
  objectiveTemplateValues?: Array<{
    templateFieldId?: string;
    fieldKey: string;
    sectionKey: string;
    roleCode: string;
    actorUserId?: string;
    workflowStage: string;
    valueJson?: unknown;
    valueText?: string;
    valueNumber?: number;
    valueDate?: string;
    valueStatus?: string;
  }>;
  objectives: ObjectiveRecord[];
};

type BulkCreateManagerObjectiveResult = {
  created: Array<{
    termAssignmentId: string;
    objectiveId: string;
    employeeId: string;
    employeeName: string;
    objectiveTitle: string;
    clientObjectiveId?: string;
  }>;
  updated: Array<{
    termAssignmentId: string;
    objectiveId: string;
    objectiveTitle: string;
    previousWeightage?: number;
    weightage?: number;
  }>;
  failed: Array<{
    termAssignmentId: string;
    employeeId?: string;
    employeeName?: string;
    objectiveTitle?: string;
    clientObjectiveId?: string;
    reason: string;
  }>;
};

const DELEGATED_OBJECTIVE_ASSIGNMENT_STATES = [
  TermWorkflowState.OBJECTIVE_SETTING_OPEN,
  TermWorkflowState.OBJECTIVE_DRAFT,
  TermWorkflowState.OBJECTIVE_SUBMITTED,
  TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
  TermWorkflowState.REOPENED_BY_ADMIN,
] as const;

export class ObjectiveService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async listObjectiveMasters(
    query: ObjectiveMasterListQuery = {},
  ): Promise<ObjectiveMasterListResult> {
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 20), 100);
    const filter: Record<string, unknown> = { isDeleted: false };

    if (query.status && Object.values(ObjectiveMasterStatus).includes(query.status as ObjectiveMasterStatusType)) {
      filter.status = query.status;
    }
    if (
      query.sourceType &&
      Object.values(FlexibleObjectiveSourceType).includes(query.sourceType as FlexibleObjectiveSourceTypeType)
    ) {
      filter.sourceType = query.sourceType;
    }
    if (query.ownerDepartment?.trim()) {
      filter.ownerDepartment = { $regex: query.ownerDepartment.trim(), $options: 'i' };
    }

    const search = query.search?.trim();
    const searchableMasterIds = new Set<string>();
    if (search) {
      const matchingVersions = await ObjectiveMasterVersion.find({
        isDeleted: false,
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { targetValue: { $regex: search, $options: 'i' } },
          { ownerDepartment: { $regex: search, $options: 'i' } },
        ],
      })
        .select('objectiveMasterId')
        .lean();
      for (const version of matchingVersions) {
        const masterId = version.objectiveMasterId?.toString();
        if (masterId) searchableMasterIds.add(masterId);
      }

      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { ownerRole: { $regex: search, $options: 'i' } },
        { ownerDepartment: { $regex: search, $options: 'i' } },
        ...(searchableMasterIds.size
          ? [{ _id: { $in: Array.from(searchableMasterIds).map((id) => this.toObjectId(id, 'objectiveMasterId')) } }]
          : []),
      ];
    }

    const [candidateMasters, totalCandidates] = await Promise.all([
      ObjectiveMaster.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ObjectiveMaster.countDocuments(filter),
    ]);

    const masterIds = candidateMasters.map((master) => master._id);
    const versions = masterIds.length
      ? await ObjectiveMasterVersion.find({
          objectiveMasterId: { $in: masterIds },
          isDeleted: false,
        })
          .sort({ versionNo: -1 })
          .lean()
      : [];
    const auditUserNames = await this.buildUserNameMapForObjectiveAudit([
      ...candidateMasters,
      ...versions,
    ]);

    const versionsByMaster = new Map<string, typeof versions>();
    for (const version of versions) {
      const masterId = version.objectiveMasterId?.toString();
      if (!masterId) continue;
      const grouped = versionsByMaster.get(masterId) ?? [];
      grouped.push(version);
      versionsByMaster.set(masterId, grouped);
    }

    const items: ObjectiveMasterSummaryRecord[] = [];
    for (const master of candidateMasters) {
      const masterVersions = versionsByMaster.get(master._id.toString()) ?? [];
      if (!(await this.canViewObjectiveVersionHistory(master.sourceType, master, masterVersions))) {
        continue;
      }
      items.push(await this.toObjectiveMasterSummaryRecord(master, masterVersions, auditUserNames));
    }

    return {
      items,
      total: totalCandidates,
      page,
      limit,
    };
  }

  async getObjectiveMasterDetail(
    objectiveMasterId: string,
  ): Promise<ObjectiveMasterDetailRecord> {
    const masterObjectId = this.toObjectId(objectiveMasterId, 'objectiveMasterId');
    const master = await ObjectiveMaster.findOne({
      _id: masterObjectId,
      isDeleted: false,
    }).lean();

    if (!master) {
      throw new Error('Objective Master not found');
    }

    const versions = await this.listObjectiveMasterVersions(objectiveMasterId);
    return {
      ...(await this.toObjectiveMasterSummaryRecord(
        master,
        versions,
        await this.buildUserNameMapForObjectiveAudit([master, ...versions]),
      )),
      versions,
    };
  }

  async createObjectiveMaster(
    input: CreateObjectiveMasterInput,
  ): Promise<ObjectiveMasterWithVersionRecord> {
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');
    const sourceType = this.requireFlexibleObjectiveSourceType(input.sourceType);
    this.assertObjectiveMasterCreatableSourceType(sourceType);
    const owner = this.normalizeObjectiveOwnerInput(input, actor);

    await this.assertObjectiveOwnerPermission(sourceType, owner);
    const code = input.code?.trim() || await this.generateObjectiveMasterCode(sourceType);

    const master = await ObjectiveMaster.create({
      code,
      sourceType,
      status: ObjectiveMasterStatus.ACTIVE,
      ...owner,
      createdBy: actorId,
    });

    const version = await ObjectiveMasterVersion.create({
      objectiveMasterId: master._id,
      versionNo: 1,
      status: ObjectiveMasterVersionStatus.DRAFT,
      ...this.normalizeObjectiveMasterVersionDetails(input, actor),
      createdBy: actorId,
    });

    await this.audit(
      'PMS_OBJECTIVE_MASTER_CREATED',
      'OBJECTIVE_MASTER',
      master._id.toString(),
      undefined,
      this.mapObjectiveMasterRecord(master),
    );
    await this.audit(
      'PMS_OBJECTIVE_VERSION_CREATED',
      'OBJECTIVE_MASTER_VERSION',
      version._id.toString(),
      undefined,
      this.mapObjectiveMasterVersionRecord(version),
    );

    return {
      master: this.mapObjectiveMasterRecord(master),
      version: this.mapObjectiveMasterVersionRecord(version),
    };
  }

  async createObjectiveMasterVersion(
    objectiveMasterId: string,
    sourceVersionId?: string,
  ): Promise<ObjectiveMasterVersionRecord> {
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');
    const masterObjectId = this.toObjectId(objectiveMasterId, 'objectiveMasterId');
    const master = await ObjectiveMaster.findOne({
      _id: masterObjectId,
      isDeleted: false,
    });

    if (!master) {
      throw new Error('Objective Master not found');
    }

    this.assertObjectiveMasterCreatableSourceType(master.sourceType);
    await this.assertObjectiveOwnerPermission(master.sourceType, master);

    const sourceVersion = sourceVersionId
      ? await ObjectiveMasterVersion.findOne({
        _id: this.toObjectId(sourceVersionId, 'sourceVersionId'),
        objectiveMasterId: master._id,
        isDeleted: false,
      })
      : await ObjectiveMasterVersion.findOne({
        objectiveMasterId: master._id,
        isDeleted: false,
      }).sort({ versionNo: -1 });

    if (!sourceVersion) {
      throw new Error('Source Objective Master Version not found');
    }

    const latestVersion = await ObjectiveMasterVersion.findOne({
      objectiveMasterId: master._id,
      isDeleted: false,
    }).sort({ versionNo: -1 }).select('versionNo');
    const nextVersionNo = Number(latestVersion?.versionNo ?? 0) + 1;

    const version = await ObjectiveMasterVersion.create({
      objectiveMasterId: master._id,
      versionNo: nextVersionNo,
      status: ObjectiveMasterVersionStatus.DRAFT,
      ...this.cloneObjectiveMasterVersionDetails(sourceVersion, actor),
      createdBy: actorId,
    });

    await this.audit(
      'PMS_OBJECTIVE_VERSION_CREATED',
      'OBJECTIVE_MASTER_VERSION',
      version._id.toString(),
      { sourceVersionId: sourceVersion._id.toString() },
      this.mapObjectiveMasterVersionRecord(version),
    );

    return this.mapObjectiveMasterVersionRecord(version);
  }

  async updateDraftObjectiveMasterVersion(
    objectiveVersionId: string,
    input: UpdateObjectiveMasterVersionInput,
  ): Promise<ObjectiveMasterVersionRecord> {
    const actor = this.requireActor();
    const version = await ObjectiveMasterVersion.findOne({
      _id: this.toObjectId(objectiveVersionId, 'objectiveVersionId'),
      isDeleted: false,
    });

    if (!version) {
      throw new Error('Objective Master Version not found');
    }

    if (version.status !== ObjectiveMasterVersionStatus.DRAFT) {
      throw new Error('Only Draft objective versions can be updated');
    }

    const assignedCount = await Objective.countDocuments({
      objectiveVersionId: version._id,
      isDeleted: false,
    });
    if (assignedCount > 0) {
      throw new Error('Assigned objective snapshots cannot be changed through Objective Master edits');
    }

    const master = await ObjectiveMaster.findOne({
      _id: version.objectiveMasterId,
      isDeleted: false,
    });
    if (!master) {
      throw new Error('Objective Master not found');
    }

    await this.assertObjectiveOwnerPermission(
      master.sourceType,
      this.mergeObjectiveOwnerMetadata(version, master),
    );

    const previousValue = this.mapObjectiveMasterVersionRecord(version);
    const normalized = this.normalizeObjectiveMasterVersionPatch(input, actor);

    Object.assign(version, normalized, {
      updatedBy: this.toObjectId(actor.actorId, 'actorId'),
    });

    await version.save();

    await this.audit(
      'PMS_OBJECTIVE_VERSION_DRAFT_UPDATED',
      'OBJECTIVE_MASTER_VERSION',
      version._id.toString(),
      previousValue,
      this.mapObjectiveMasterVersionRecord(version),
    );

    return this.mapObjectiveMasterVersionRecord(version);
  }

  async activateObjectiveMasterVersion(
    objectiveVersionId: string,
  ): Promise<ObjectiveMasterWithVersionRecord> {
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');
    const version = await ObjectiveMasterVersion.findOne({
      _id: this.toObjectId(objectiveVersionId, 'objectiveVersionId'),
      isDeleted: false,
    });

    if (!version) {
      throw new Error('Objective Master Version not found');
    }

    if (version.status === ObjectiveMasterVersionStatus.ARCHIVED) {
      throw new Error('Archived objective versions cannot be activated');
    }

    const master = await ObjectiveMaster.findOne({
      _id: version.objectiveMasterId,
      isDeleted: false,
    });
    if (!master) {
      throw new Error('Objective Master not found');
    }

    await this.assertObjectiveOwnerPermission(
      master.sourceType,
      this.mergeObjectiveOwnerMetadata(version, master),
    );

    const previousValue = {
      master: this.mapObjectiveMasterRecord(master),
      version: this.mapObjectiveMasterVersionRecord(version),
    };

    await ObjectiveMasterVersion.updateMany(
      {
        objectiveMasterId: master._id,
        _id: { $ne: version._id },
        status: ObjectiveMasterVersionStatus.ACTIVE,
        isDeleted: false,
      },
      {
        $set: {
          status: ObjectiveMasterVersionStatus.INACTIVE,
          deactivatedAt: this.getCurrentDate(),
          deactivatedBy: actorId,
          updatedBy: actorId,
        },
      },
    );

    version.status = ObjectiveMasterVersionStatus.ACTIVE;
    version.activatedAt = this.getCurrentDate();
    version.activatedBy = actorId;
    version.deactivatedAt = undefined;
    version.deactivatedBy = undefined;
    version.updatedBy = actorId;
    await version.save();

    master.status = ObjectiveMasterStatus.ACTIVE;
    master.currentVersionId = version._id;
    master.updatedBy = actorId;
    await master.save();

    await this.audit(
      'PMS_OBJECTIVE_VERSION_ACTIVATED',
      'OBJECTIVE_MASTER_VERSION',
      version._id.toString(),
      previousValue,
      {
        master: this.mapObjectiveMasterRecord(master),
        version: this.mapObjectiveMasterVersionRecord(version),
      },
    );

    return {
      master: this.mapObjectiveMasterRecord(master),
      version: this.mapObjectiveMasterVersionRecord(version),
    };
  }

  async deactivateObjectiveMasterVersion(
    objectiveVersionId: string,
  ): Promise<ObjectiveMasterWithVersionRecord> {
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');
    const version = await ObjectiveMasterVersion.findOne({
      _id: this.toObjectId(objectiveVersionId, 'objectiveVersionId'),
      isDeleted: false,
    });

    if (!version) {
      throw new Error('Objective Master Version not found');
    }

    if (version.status === ObjectiveMasterVersionStatus.ARCHIVED) {
      throw new Error('Archived objective versions are already history-only');
    }

    const master = await ObjectiveMaster.findOne({
      _id: version.objectiveMasterId,
      isDeleted: false,
    });
    if (!master) {
      throw new Error('Objective Master not found');
    }

    await this.assertObjectiveOwnerPermission(
      master.sourceType,
      this.mergeObjectiveOwnerMetadata(version, master),
    );

    const previousValue = {
      master: this.mapObjectiveMasterRecord(master),
      version: this.mapObjectiveMasterVersionRecord(version),
    };

    version.status = ObjectiveMasterVersionStatus.INACTIVE;
    version.deactivatedAt = this.getCurrentDate();
    version.deactivatedBy = actorId;
    version.updatedBy = actorId;
    await version.save();

    if (master.currentVersionId?.toString() === version._id.toString()) {
      master.currentVersionId = undefined;
      master.status = ObjectiveMasterStatus.INACTIVE;
      master.updatedBy = actorId;
      await master.save();
    }

    await this.audit(
      'PMS_OBJECTIVE_VERSION_DEACTIVATED',
      'OBJECTIVE_MASTER_VERSION',
      version._id.toString(),
      previousValue,
      {
        master: this.mapObjectiveMasterRecord(master),
        version: this.mapObjectiveMasterVersionRecord(version),
      },
    );

    return {
      master: this.mapObjectiveMasterRecord(master),
      version: this.mapObjectiveMasterVersionRecord(version),
    };
  }

  async archiveObjectiveMasterVersion(
    objectiveVersionId: string,
  ): Promise<ObjectiveMasterWithVersionRecord> {
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');
    const version = await ObjectiveMasterVersion.findOne({
      _id: this.toObjectId(objectiveVersionId, 'objectiveVersionId'),
      isDeleted: false,
    });

    if (!version) {
      throw new Error('Objective Master Version not found');
    }

    const master = await ObjectiveMaster.findOne({
      _id: version.objectiveMasterId,
      isDeleted: false,
    });
    if (!master) {
      throw new Error('Objective Master not found');
    }

    await this.assertObjectiveOwnerPermission(
      master.sourceType,
      this.mergeObjectiveOwnerMetadata(version, master),
    );

    const previousValue = {
      master: this.mapObjectiveMasterRecord(master),
      version: this.mapObjectiveMasterVersionRecord(version),
    };

    version.status = ObjectiveMasterVersionStatus.ARCHIVED;
    version.archivedAt = this.getCurrentDate();
    version.archivedBy = actorId;
    version.updatedBy = actorId;
    await version.save();

    if (master.currentVersionId?.toString() === version._id.toString()) {
      master.currentVersionId = undefined;
      const activeReplacement = await ObjectiveMasterVersion.findOne({
        objectiveMasterId: master._id,
        status: ObjectiveMasterVersionStatus.ACTIVE,
        isDeleted: false,
        _id: { $ne: version._id },
      }).sort({ versionNo: -1 });
      master.currentVersionId = activeReplacement?._id;
      master.status = activeReplacement ? ObjectiveMasterStatus.ACTIVE : ObjectiveMasterStatus.INACTIVE;
      master.updatedBy = actorId;
      await master.save();
    }

    await this.audit(
      'PMS_OBJECTIVE_VERSION_ARCHIVED',
      'OBJECTIVE_MASTER_VERSION',
      version._id.toString(),
      previousValue,
      {
        master: this.mapObjectiveMasterRecord(master),
        version: this.mapObjectiveMasterVersionRecord(version),
      },
    );

    return {
      master: this.mapObjectiveMasterRecord(master),
      version: this.mapObjectiveMasterVersionRecord(version),
    };
  }

  async listObjectiveMasterVersions(
    objectiveMasterId: string,
  ): Promise<ObjectiveVersionHistoryRecord[]> {
    const masterObjectId = this.toObjectId(objectiveMasterId, 'objectiveMasterId');
    const master = await ObjectiveMaster.findOne({
      _id: masterObjectId,
      isDeleted: false,
    }).lean();

    if (!master) {
      throw new Error('Objective Master not found');
    }

    const versions = await ObjectiveMasterVersion.find({
      objectiveMasterId: masterObjectId,
      isDeleted: false,
    }).sort({ versionNo: -1 }).lean();

    const canViewMasterHistory = await this.canViewObjectiveVersionHistory(
      master.sourceType,
      master,
      versions,
    );
    if (!canViewMasterHistory) {
      throw new Error('Only configured Objective Owner, Assigner, Reviewer, or Admin can view objective version history');
    }
    const versionIds = versions.map((version) => version._id);

    const [assignedObjectives, assignmentRules, auditUserNames] = await Promise.all([
      Objective.find({
        objectiveVersionId: { $in: versionIds },
        isDeleted: false,
      })
        .select('_id objectiveVersionId annualAssignmentId cycleId employeeId assessmentTerm assessmentTermCode status title')
        .lean(),
      ObjectiveAssignmentRule.find({
        objectiveVersionId: { $in: versionIds },
        isDeleted: false,
      })
        .select('_id objectiveVersionId')
        .lean(),
      this.buildUserNameMapForObjectiveAudit([master, ...versions]),
    ]);

    const usageByVersion = new Map<string, ObjectiveVersionUsageRecord[]>();
    for (const objective of assignedObjectives) {
      const versionId = objective.objectiveVersionId?.toString();
      if (!versionId) continue;
      const usage = usageByVersion.get(versionId) ?? [];
      usage.push({
        objectiveId: objective._id.toString(),
        annualAssignmentId: objective.annualAssignmentId?.toString(),
        cycleId: objective.cycleId?.toString(),
        employeeId: objective.employeeId?.toString(),
        assessmentTerm: objective.assessmentTerm ?? objective.assessmentTermCode,
        status: objective.status,
        title: objective.title,
      });
      usageByVersion.set(versionId, usage);
    }

    const ruleCountByVersion = new Map<string, number>();
    for (const rule of assignmentRules) {
      const versionId = rule.objectiveVersionId?.toString();
      if (!versionId) continue;
      ruleCountByVersion.set(versionId, (ruleCountByVersion.get(versionId) ?? 0) + 1);
    }

    return versions.map((version) => {
      const record = this.mapObjectiveMasterVersionRecord(version, auditUserNames);
      const versionId = version._id.toString();
      const usage = usageByVersion.get(versionId) ?? [];
      return {
        ...record,
        isCurrentActive: master.currentVersionId?.toString() === versionId,
        usageCount: usage.length,
        assignmentRuleCount: ruleCountByVersion.get(versionId) ?? 0,
        usage,
      };
    });
  }

  async assertObjectiveVersionAssignable(
    objectiveVersionId: string,
  ): Promise<ObjectiveMasterVersionRecord> {
    const version = await ObjectiveMasterVersion.findOne({
      _id: this.toObjectId(objectiveVersionId, 'objectiveVersionId'),
      isDeleted: false,
    }).lean();

    if (!version) {
      throw new Error('Objective Master Version not found');
    }

    if (version.status !== ObjectiveMasterVersionStatus.ACTIVE) {
      throw new Error('Only Active objective versions can be assigned');
    }

    const master = await ObjectiveMaster.findOne({
      _id: version.objectiveMasterId,
      currentVersionId: version._id,
      status: ObjectiveMasterStatus.ACTIVE,
      isDeleted: false,
    }).lean();

    if (!master) {
      throw new Error('Objective version is not the active version for its Objective Master');
    }

    await this.assertObjectiveAssignerPermission(master.sourceType, version);

    return this.mapObjectiveMasterVersionRecord(version);
  }

  async assertObjectiveVersionReviewable(
    objectiveVersionId: string,
  ): Promise<ObjectiveMasterVersionRecord> {
    const version = await ObjectiveMasterVersion.findOne({
      _id: this.toObjectId(objectiveVersionId, 'objectiveVersionId'),
      isDeleted: false,
    }).lean();

    if (!version) {
      throw new Error('Objective Master Version not found');
    }

    const master = await ObjectiveMaster.findOne({
      _id: version.objectiveMasterId,
      isDeleted: false,
    }).lean();

    if (!master) {
      throw new Error('Objective Master not found');
    }

    await this.assertObjectiveReviewerPermission(master.sourceType, version);

    return this.mapObjectiveMasterVersionRecord(version);
  }

  async createObjectiveAssignmentRule(
    input: CreateObjectiveAssignmentRuleInput,
  ): Promise<ObjectiveAssignmentRuleRecord> {
    const version = await ObjectiveMasterVersion.findOne({
      _id: this.toObjectId(input.objectiveVersionId, 'objectiveVersionId'),
      isDeleted: false,
    }).lean();
    if (!version) {
      throw new Error('Objective Master Version not found');
    }

    const master = await ObjectiveMaster.findOne({
      _id: version.objectiveMasterId,
      isDeleted: false,
    }).lean();
    if (!master) {
      throw new Error('Objective Master not found');
    }

    await this.assertObjectiveAssignerPermission(master.sourceType, version);

    if (version.status !== ObjectiveMasterVersionStatus.ACTIVE) {
      throw new Error('Only Active objective versions can be used in assignment rules');
    }

    const actorId = this.toObjectId(this.requireActor().actorId, 'actorId');
    const rule = await ObjectiveAssignmentRule.create({
      objectiveMasterId: version.objectiveMasterId,
      objectiveVersionId: version._id,
      cycleId: input.cycleId ? this.toObjectId(input.cycleId, 'cycleId') : undefined,
      assessmentTermType: input.assessmentTermType,
      termLabels: this.normalizeApplicableTermLabels(input.termLabels),
      criteria: this.normalizeObjectiveAssignmentCriteria(input.criteria),
      status: input.status ?? ObjectiveAssignmentRuleStatus.DRAFT,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
      note: input.note?.trim() || undefined,
      createdBy: actorId,
    });

    await this.audit(
      'PMS_OBJECTIVE_ASSIGNMENT_RULE_CREATED',
      'OBJECTIVE_ASSIGNMENT_RULE',
      rule._id.toString(),
      undefined,
      this.mapObjectiveAssignmentRuleRecord(rule),
    );

    return this.mapObjectiveAssignmentRuleRecord(rule);
  }

  async updateObjectiveAssignmentRule(
    assignmentRuleId: string,
    input: UpdateObjectiveAssignmentRuleInput,
  ): Promise<ObjectiveAssignmentRuleRecord> {
    const rule = await ObjectiveAssignmentRule.findOne({
      _id: this.toObjectId(assignmentRuleId, 'assignmentRuleId'),
      isDeleted: false,
    });
    if (!rule) {
      throw new Error('Objective assignment rule not found');
    }

    const targetVersionId = input.objectiveVersionId
      ? this.toObjectId(input.objectiveVersionId, 'objectiveVersionId')
      : rule.objectiveVersionId;
    const version = await ObjectiveMasterVersion.findOne({
      _id: targetVersionId,
      isDeleted: false,
    }).lean();
    if (!version) {
      throw new Error('Objective Master Version not found');
    }

    const master = await ObjectiveMaster.findOne({
      _id: version.objectiveMasterId,
      isDeleted: false,
    }).lean();
    if (!master) {
      throw new Error('Objective Master not found');
    }

    await this.assertObjectiveAssignerPermission(master.sourceType, version);

    if (version.status !== ObjectiveMasterVersionStatus.ACTIVE) {
      throw new Error('Only Active objective versions can be used in assignment rules');
    }

    const previousValue = this.mapObjectiveAssignmentRuleRecord(rule);
    rule.objectiveMasterId = version.objectiveMasterId;
    rule.objectiveVersionId = version._id;
    if (input.cycleId !== undefined) {
      rule.cycleId = input.cycleId ? this.toObjectId(input.cycleId, 'cycleId') : undefined;
    }
    if (input.assessmentTermType !== undefined) {
      rule.assessmentTermType = input.assessmentTermType;
    }
    if (input.termLabels !== undefined) {
      rule.termLabels = this.normalizeApplicableTermLabels(input.termLabels);
    }
    if (input.criteria !== undefined) {
      rule.criteria = this.normalizeObjectiveAssignmentCriteria(input.criteria);
    }
    if (input.status !== undefined) {
      if (!Object.values(ObjectiveAssignmentRuleStatus).includes(input.status)) {
        throw new Error('Invalid objective assignment rule status');
      }
      rule.status = input.status;
    }
    if (input.effectiveFrom !== undefined) {
      rule.effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : undefined;
    }
    if (input.effectiveTo !== undefined) {
      rule.effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : undefined;
    }
    if (input.note !== undefined) {
      rule.note = input.note?.trim() || undefined;
    }
    rule.updatedBy = this.toObjectId(this.requireActor().actorId, 'actorId');
    rule.version += 1;
    await rule.save();

    const nextValue = this.mapObjectiveAssignmentRuleRecord(rule);
    await this.audit(
      'PMS_OBJECTIVE_ASSIGNMENT_RULE_UPDATED',
      'OBJECTIVE_ASSIGNMENT_RULE',
      rule._id.toString(),
      previousValue,
      nextValue,
    );

    return nextValue;
  }

  async deactivateObjectiveAssignmentRule(
    assignmentRuleId: string,
  ): Promise<ObjectiveAssignmentRuleRecord> {
    const rule = await ObjectiveAssignmentRule.findOne({
      _id: this.toObjectId(assignmentRuleId, 'assignmentRuleId'),
      isDeleted: false,
    });
    if (!rule) {
      throw new Error('Objective assignment rule not found');
    }

    const version = await ObjectiveMasterVersion.findOne({
      _id: rule.objectiveVersionId,
      isDeleted: false,
    }).lean();
    if (!version) {
      throw new Error('Objective Master Version not found');
    }
    const master = await ObjectiveMaster.findOne({
      _id: version.objectiveMasterId,
      isDeleted: false,
    }).lean();
    if (!master) {
      throw new Error('Objective Master not found');
    }
    await this.assertObjectiveAssignerPermission(master.sourceType, version);

    const previousValue = this.mapObjectiveAssignmentRuleRecord(rule);
    rule.status = ObjectiveAssignmentRuleStatus.INACTIVE;
    rule.updatedBy = this.toObjectId(this.requireActor().actorId, 'actorId');
    rule.version += 1;
    await rule.save();

    const nextValue = this.mapObjectiveAssignmentRuleRecord(rule);
    await this.audit(
      'PMS_OBJECTIVE_ASSIGNMENT_RULE_DEACTIVATED',
      'OBJECTIVE_ASSIGNMENT_RULE',
      rule._id.toString(),
      previousValue,
      nextValue,
    );

    return nextValue;
  }

  async previewObjectiveAssignments(
    input: ObjectiveAssignmentPreviewInput,
  ): Promise<ObjectiveAssignmentPreviewResult> {
    await this.requireAdminForObjectiveAssignment('objectiveAssignment.preview');
    return this.buildObjectiveAssignmentPreview(input);
  }

  async applyObjectiveAssignments(
    input: ApplyObjectiveAssignmentsInput,
  ): Promise<ObjectiveAssignmentApplyResult> {
    await this.requireAdminForObjectiveAssignment('objectiveAssignment.apply');
    if (input.confirm !== true) {
      throw new Error('Confirmation is required before applying objective assignments');
    }

    return this.applyObjectiveAssignmentPreview(input, 'MANUAL_CONFIRMATION');
  }

  async applyObjectiveRulesForCycleLaunch(cycleId: string): Promise<ObjectiveAssignmentApplyResult> {
    await this.requireAdminForObjectiveAssignment('objectiveAssignment.applyOnLaunch');
    return this.applyObjectiveAssignmentPreview(
      { cycleId },
      'CYCLE_LAUNCH',
    );
  }

  async getObjectiveReportingData(
    query: ObjectiveReportingQuery = {},
  ): Promise<ObjectiveReportingRecord[]> {
    await this.requireAdminForObjectiveReporting('objective.reporting');
    const filter = this.buildObjectiveReportingFilter(query);
    const objectives = await Objective.find(filter)
      .select('termAssignmentId annualAssignmentId cycleId employeeId assignedManagerId assessmentTerm assessmentTermCode source sourceType objectiveMasterId objectiveVersionId assignmentRuleRefs title status applicabilityStatus objectiveSnapshot weightage targetValue')
      .lean();
    const objectiveIds = objectives.map((objective) => objective._id.toString());
    const termAssignmentIds = Array.from(new Set(objectives.map((objective) => objective.termAssignmentId.toString())));

    const annualAssignmentIds = Array.from(
      new Set(
        objectives
          .map((objective) => objective.annualAssignmentId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const annualAssignments = await AnnualAssignment.find({
      _id: { $in: annualAssignmentIds.map((id) => this.toObjectId(id, 'annualAssignmentId')) },
      isDeleted: false,
    }).select('employeeSnapshot orgSnapshot').lean();
    const annualById = new Map(annualAssignments.map((assignment) => [assignment._id.toString(), assignment]));
    const [achievementSubmissions, termReviews, termAssignments] = await Promise.all([
      EmployeeAchievementSubmission.find({
        termAssignmentId: { $in: termAssignmentIds.map((id) => this.toObjectId(id, 'termAssignmentId')) },
        isDeleted: false,
      })
        .select('termAssignmentId achievementItems achievementValues status submittedAt lockedAt updatedAt')
        .sort({ lockedAt: -1, submittedAt: -1, updatedAt: -1 })
        .lean(),
      TermReview.find({
        termAssignmentId: { $in: termAssignmentIds.map((id) => this.toObjectId(id, 'termAssignmentId')) },
        isDeleted: false,
      })
        .select('termAssignmentId ratings scoreSnapshot reviewStatus finalizedAt submittedAt updatedAt')
        .sort({ finalizedAt: -1, submittedAt: -1, updatedAt: -1 })
        .lean(),
      TermAssignment.find({
        _id: { $in: termAssignmentIds.map((id) => this.toObjectId(id, 'termAssignmentId')) },
        isDeleted: false,
      }).select('termState').lean(),
    ]);
    const achievementByTerm = this.firstByStringKey(achievementSubmissions, 'termAssignmentId');
    const reviewByTerm = this.firstByStringKey(termReviews, 'termAssignmentId');
    const termById = new Map(termAssignments.map((termAssignment) => [termAssignment._id.toString(), termAssignment]));
    const reportingSnapshotByObjectiveId = new Map(
      objectiveIds.map((objectiveId) => {
        const objective = objectives.find((item) => item._id.toString() === objectiveId);
        const termAssignmentId = objective?.termAssignmentId.toString() ?? '';
        return [
          objectiveId,
          {
            actualValue: this.resolveReportingActualValue(objectiveId, achievementByTerm.get(termAssignmentId)),
            scoring: this.resolveReportingScoreSnapshot(objectiveId, reviewByTerm.get(termAssignmentId)),
            finalizedStatus: isTermFinalized(termById.get(termAssignmentId)?.termState),
          },
        ];
      }),
    );

    return objectives.map((objective) => {
      const annualAssignment = objective.annualAssignmentId
        ? annualById.get(objective.annualAssignmentId.toString())
        : undefined;
      const employeeSnapshot = annualAssignment?.employeeSnapshot ?? {};
      const orgSnapshot = annualAssignment?.orgSnapshot ?? {};
      const snapshot = (objective.objectiveSnapshot ?? {}) as Record<string, any>;
      const reportingSnapshot = reportingSnapshotByObjectiveId.get(objective._id.toString());
      return {
        objectiveId: objective._id.toString(),
        objectiveSource: objective.sourceType ?? objective.source,
        objectiveMasterId: objective.objectiveMasterId?.toString(),
        objectiveVersionId: objective.objectiveVersionId?.toString(),
        objectiveTitle: snapshot.title ?? objective.title,
        assignmentLevel: this.resolveObjectiveAssignmentLevel(objective),
        assignmentRuleIds: (objective.assignmentRuleRefs ?? []).map((id: Types.ObjectId) => id.toString()),
        cycleId: objective.cycleId?.toString(),
        annualAssignmentId: objective.annualAssignmentId?.toString(),
        termAssignmentId: objective.termAssignmentId.toString(),
        assessmentTerm: objective.assessmentTerm ?? objective.assessmentTermCode,
        employeeId: objective.employeeId.toString(),
        assignedManagerId: objective.assignedManagerId.toString(),
        employeeDepartment: String(
          employeeSnapshot.department ??
          employeeSnapshot.departmentName ??
          employeeSnapshot.departmentId ??
          orgSnapshot.department ??
          orgSnapshot.departmentId ??
          '',
        ) || undefined,
        employeeGroup: String(employeeSnapshot.employeeGroup ?? employeeSnapshot.employmentStatus ?? '') || undefined,
        employeeRole: String(employeeSnapshot.specificRole ?? employeeSnapshot.role ?? '') || undefined,
        objectiveApprovalStatus: objective.status,
        applicabilityStatus: objective.applicabilityStatus ?? ObjectiveApplicabilityStatus.ACTIVE,
        approvedWeightage: snapshot.approvedWeightage ?? objective.weightage,
        scoreable: snapshot.scoreable,
        targetValue: snapshot.targetValue ?? objective.targetValue,
        actualValue: reportingSnapshot?.actualValue,
        targetDirection: snapshot.targetDirection,
        actualAggregationMode: snapshot.actualAggregationMode,
        managerScore: reportingSnapshot?.scoring.managerScore,
        calculatedWeightedScore: reportingSnapshot?.scoring.calculatedWeightedScore,
        objectiveSectionScore: reportingSnapshot?.scoring.objectiveSectionScore,
        objectiveSectionContribution: reportingSnapshot?.scoring.objectiveSectionContribution,
        objectiveScoringMode: reportingSnapshot?.scoring.objectiveScoringMode,
        finalizedStatus: reportingSnapshot?.finalizedStatus,
      };
    });
  }

  async getObjectiveDashboardStatuses(
    query: ObjectiveReportingQuery = {},
  ): Promise<ObjectiveDashboardStatusRecord[]> {
    const actor = this.requireActor();
    const mappedRole = accessService.mapRole(actor.actorRole);
    const filter = this.buildObjectiveReportingFilter(query);

    if (mappedRole === PmsRole.EMPLOYEE) {
      filter.employeeId = this.toObjectId(actor.actorId, 'actorId');
    } else if (mappedRole === PmsRole.MANAGER) {
      filter.assignedManagerId = this.toObjectId(actor.actorId, 'actorId');
    } else if (mappedRole !== PmsRole.ADMIN && mappedRole !== PmsRole.MANAGEMENT && mappedRole !== PmsRole.DIRECTOR) {
      throw new Error('PMS access denied');
    }

    const objectives = await Objective.find(filter)
      .select('termAssignmentId annualAssignmentId cycleId employeeId assessmentTerm assessmentTermCode title status applicabilityStatus objectiveSnapshot')
      .lean();
    const termAssignmentIds = Array.from(new Set(objectives.map((objective) => objective.termAssignmentId.toString())));
    const termAssignments = await TermAssignment.find({
      _id: { $in: termAssignmentIds.map((id) => this.toObjectId(id, 'termAssignmentId')) },
      isDeleted: false,
    }).select('termState cycleTermId').lean();
    const termById = new Map(termAssignments.map((termAssignment) => [termAssignment._id.toString(), termAssignment]));
    const termCycleIds = Array.from(
      new Set(
        termAssignments
          .map((termAssignment) => termAssignment.cycleTermId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const termCycles = await TermCycle.find({
      _id: { $in: termCycleIds.map((id) => this.toObjectId(id, 'cycleTermId')) },
      isDeleted: false,
    }).select('achievementSubmissionWindow managerReviewWindow').lean();
    const termCycleById = new Map(termCycles.map((termCycle) => [termCycle._id.toString(), termCycle]));

    return objectives.map((objective) => {
      const termAssignment = termById.get(objective.termAssignmentId.toString());
      const termCycle = termAssignment?.cycleTermId
        ? termCycleById.get(termAssignment.cycleTermId.toString())
        : undefined;
      const dashboard = this.resolveObjectiveDashboardStatus(
        objective.status,
        objective.applicabilityStatus ?? ObjectiveApplicabilityStatus.ACTIVE,
        termAssignment?.termState,
        objective.objectiveSnapshot,
        this.isObjectiveDashboardOverdue(termAssignment?.termState, termCycle),
      );
      return {
        objectiveId: objective._id.toString(),
        termAssignmentId: objective.termAssignmentId.toString(),
        annualAssignmentId: objective.annualAssignmentId?.toString(),
        cycleId: objective.cycleId?.toString(),
        employeeId: objective.employeeId.toString(),
        assessmentTerm: objective.assessmentTerm ?? objective.assessmentTermCode,
        objectiveTitle: objective.objectiveSnapshot?.title ?? objective.title,
        workflowStatus: objective.status,
        applicabilityStatus: objective.applicabilityStatus ?? ObjectiveApplicabilityStatus.ACTIVE,
        dashboardStatus: dashboard.dashboardStatus,
        blockedReason: dashboard.blockedReason,
      };
    });
  }

  async listManagerObjectiveLibrary(): Promise<IManagerObjectiveLibraryItem[]> {
    const actor = this.requireActor();
    const managerId = this.toObjectId(actor.actorId, 'actorId');
    const library = await ManagerObjectiveLibrary.findOne({ managerId }).lean();

    return (library?.objectives ?? []).map((objective) =>
      this.mapManagerObjectiveLibraryItem(objective),
    );
  }

  async saveManagerObjectiveLibrary(
    input: SaveManagerObjectiveLibraryInput,
  ): Promise<IManagerObjectiveLibraryItem[]> {
    const actor = this.requireActor();
    const managerId = this.toObjectId(actor.actorId, 'actorId');
    const objectives = (input.objectives ?? []).map((objective, index) =>
      this.normalizeManagerObjectiveLibraryItem(objective, index),
    );

    const library = await ManagerObjectiveLibrary.findOneAndUpdate(
      { managerId },
      { $set: { objectives } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return (library?.objectives ?? []).map((objective) =>
      this.mapManagerObjectiveLibraryItem(objective),
    );
  }

  async createManagerObjectiveLibraryItem(
    input: ManagerObjectiveLibraryDraftInput,
  ): Promise<IManagerObjectiveLibraryItem[]> {
    const actor = this.requireActor();
    const managerId = this.toObjectId(actor.actorId, 'actorId');
    const objective = this.normalizeManagerObjectiveLibraryItem(input, 0);
    const existingLibrary = await ManagerObjectiveLibrary.findOne({ managerId }).lean();
    const existingObjectives = (existingLibrary?.objectives ?? []).map((existingObjective) =>
      this.mapManagerObjectiveLibraryItem(existingObjective),
    );
    const objectives = [
      ...existingObjectives.filter((existingObjective) => existingObjective.localId !== objective.localId),
      objective,
    ];

    const library = await ManagerObjectiveLibrary.findOneAndUpdate(
      { managerId },
      { $set: { objectives } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return (library?.objectives ?? []).map((libraryObjective) =>
      this.mapManagerObjectiveLibraryItem(libraryObjective),
    );
  }

  async deleteManagerObjectiveLibraryItem(localId: string): Promise<IManagerObjectiveLibraryItem[]> {
    const actor = this.requireActor();
    const managerId = this.toObjectId(actor.actorId, 'actorId');
    const normalizedLocalId = localId.trim();

    if (!normalizedLocalId) {
      throw new Error('Objective localId is required');
    }

    const library = await ManagerObjectiveLibrary.findOneAndUpdate(
      { managerId },
      { $pull: { objectives: { localId: normalizedLocalId } } },
      { new: true },
    ).lean();

    return (library?.objectives ?? []).map((objective) =>
      this.mapManagerObjectiveLibraryItem(objective),
    );
  }

  async listAssignments(mode: AssignmentMode): Promise<AssignmentRecord[]> {
    const actor = this.requireActor();
    const filter: Record<string, unknown> = { isDeleted: false };

    if (mode === 'employee') {
      filter.employeeId = this.toObjectId(actor.actorId, 'actorId');
    }

    if (mode === 'manager') {
      const managerId = this.toObjectId(actor.actorId, 'actorId');
      const delegations = await new DelegationService(this.context).getActiveDelegationsForDelegate(
        actor.actorId,
        'PMS_OBJECTIVES',
      );
      const managerClauses: Record<string, unknown>[] = [{ assignedManagerId: managerId }];

      for (const delegation of delegations) {
        const clause: Record<string, unknown> = delegation.annualAssignmentId
          ? {
              annualAssignmentId: delegation.annualAssignmentId,
              assignedManagerId: delegation.delegatorUserId,
              termState: { $in: DELEGATED_OBJECTIVE_ASSIGNMENT_STATES },
            }
          : {
              assignedManagerId: delegation.delegatorUserId,
              termState: { $in: DELEGATED_OBJECTIVE_ASSIGNMENT_STATES },
            };
        if (!delegation.annualAssignmentId && delegation.cycleId) {
          clause.cycleId = delegation.cycleId;
        }
        managerClauses.push(clause);
      }

      filter.$or = managerClauses;
    }

    const termAssignments = await TermAssignment.find(filter)
      .sort({ createdAt: -1, assessmentTermCode: 1 })
      .lean();

    if (termAssignments.length === 0) {
      return [];
    }

    const annualAssignments = await AnnualAssignment.find({
      _id: { $in: termAssignments.map((item) => item.annualAssignmentId) },
      isDeleted: false,
    }).lean();

    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );
    const annualCycles = await AnnualCycle.find({
      _id: {
        $in: annualAssignments
          .map((item) => item.cycleId)
          .filter(Boolean),
      },
      isDeleted: false,
    }).lean();
    const annualCycleMap = new Map(
      annualCycles.map((item) => [item._id.toString(), item]),
    );

    const termCycles = await TermCycle.find({
      _id: {
        $in: termAssignments
          .map((item) => item.cycleTermId)
          .filter(Boolean),
      },
      isDeleted: false,
    }).lean();

    const termCycleMap = new Map(
      termCycles.map((item) => [item._id.toString(), item]),
    );

    await this.ensurePredefinedObjectivesForAssignments(annualAssignments, termAssignments);

    const objectiveFilter: Record<string, unknown> = {
      termAssignmentId: { $in: termAssignments.map((item) => item._id) },
      isDeleted: false,
    };

    if (mode === 'manager') {
      objectiveFilter.$nor = [
        {
          source: ObjectiveSource.EMPLOYEE_CREATED,
          status: ObjectiveStatus.OBJECTIVE_DRAFT,
        },
      ];
    }

    const objectives = await Objective.find(objectiveFilter)
      .sort({ objectiveNo: 1, createdAt: 1 })
      .lean();

    const comments = await ObjectiveComment.find({
      objectiveId: { $in: objectives.map((item) => item._id) },
      isDeleted: false,
    })
      .sort({ createdAt: 1 })
      .lean();
    const objectiveValues = await ObjectiveValue.find({
      objectiveId: { $in: objectives.map((item) => item._id) },
      isDeleted: false,
    })
      .sort({ createdAt: 1 })
      .lean();
    const objectiveAttachments = await ObjectiveAttachment.find({
      objectiveId: { $in: objectives.map((item) => item._id) },
      isDeleted: false,
    })
      .sort({ uploadedAt: 1, createdAt: 1 })
      .lean();

    const commentsByObjectiveId = this.groupCommentsByObjective(comments);
    const objectiveValuesByObjectiveId = this.groupObjectiveValuesByObjective(objectiveValues);
    const attachmentsByObjectiveId = this.groupAttachmentsByObjective(objectiveAttachments);
    const objectivesByTermAssignmentId = new Map<string, typeof objectives>();

    for (const objective of objectives) {
      const key = objective.termAssignmentId.toString();
      const bucket = objectivesByTermAssignmentId.get(key) ?? [];
      bucket.push(objective);
      objectivesByTermAssignmentId.set(key, bucket);
    }

    const configMap = await this.buildObjectiveConfigMap(annualAssignments, termAssignments);
    const achievementSubmissionEnabledMap =
      await this.buildAchievementSubmissionEnabledMap(annualAssignments, termAssignments);
    const termAssignmentIdsNeedingTemplateValueFallback = termAssignments
      .filter((termAssignment) => {
        const summary = (termAssignment.termSummary as Record<string, unknown> | undefined) ?? {};
        const values = summary.objectiveTemplateValues;
        return !Array.isArray(values) || values.length === 0;
      })
      .map((termAssignment) => termAssignment._id.toString());
    const objectiveTemplateValueAuditFallbackByTermId = new Map<string, Array<Record<string, any>>>();

    if (termAssignmentIdsNeedingTemplateValueFallback.length > 0) {
      const termAssignmentAuditEntityIds = [
        ...termAssignmentIdsNeedingTemplateValueFallback,
        ...termAssignmentIdsNeedingTemplateValueFallback
          .filter((termAssignmentId) => Types.ObjectId.isValid(termAssignmentId))
          .map((termAssignmentId) => new Types.ObjectId(termAssignmentId)),
      ];
      const latestTemplateValueAudits = await AuditLog.find({
        entityType: 'TERM_ASSIGNMENT',
        action: 'PMS_OBJECTIVE_TEMPLATE_VALUES_UPDATED',
        entityId: { $in: termAssignmentAuditEntityIds },
      })
        .sort({ timestamp: -1, createdAt: -1 })
        .lean();
      const seenTermIds = new Set<string>();

      for (const audit of latestTemplateValueAudits) {
        const termAssignmentId = String(audit.entityId ?? '');
        if (!termAssignmentId || seenTermIds.has(termAssignmentId)) continue;
        seenTermIds.add(termAssignmentId);

        const newValue =
          audit.newValue && typeof audit.newValue === 'object'
            ? (audit.newValue as Record<string, unknown>)
            : {};
        const values = newValue.objectiveTemplateValues;
        objectiveTemplateValueAuditFallbackByTermId.set(
          termAssignmentId,
          Array.isArray(values) ? (values as Array<Record<string, any>>) : [],
        );
      }
    }

    return termAssignments.map((termAssignment) => {
      const annualAssignment = annualAssignmentMap.get(termAssignment.annualAssignmentId.toString());
      const annualCycle = annualAssignment?.cycleId
        ? annualCycleMap.get(annualAssignment.cycleId.toString())
        : undefined;
      const termCycle = termAssignment.cycleTermId
        ? termCycleMap.get(termAssignment.cycleTermId.toString())
        : undefined;
      const effectiveTermState = this.getEffectiveTermStateForDisplay(
        termAssignment.termState,
        annualAssignment?.annualState,
        annualCycle?.status,
      );
      const objectiveConfig = configMap.get(termAssignment._id.toString()) ?? this.defaultObjectiveConfig();
      const objectiveRecords = (objectivesByTermAssignmentId.get(termAssignment._id.toString()) ?? [])
        .map((objective) =>
          this.mapObjectiveRecord(
            objective,
            annualAssignment,
            commentsByObjectiveId.get(objective._id.toString()) ?? [],
            objectiveValuesByObjectiveId.get(objective._id.toString()) ?? [],
            attachmentsByObjectiveId.get(objective._id.toString()) ?? [],
          ),
        );

      const employeeSnapshot = annualAssignment?.employeeSnapshot ?? {};
      const employeeCode = String(employeeSnapshot.employeeCode ?? '');
      const employeeDesignation = String(
        employeeSnapshot.specificRole ??
        employeeSnapshot.designation ??
        employeeSnapshot.role ??
        '',
      );
      const employeeDepartment = String(
        employeeSnapshot.department ??
        employeeSnapshot.departmentName ??
        employeeSnapshot.departmentId ??
        '',
      );
      const summary = (termAssignment.termSummary as Record<string, unknown> | undefined) ?? {};
      const summaryTemplateValues = Array.isArray(summary.objectiveTemplateValues)
        ? (summary.objectiveTemplateValues as Array<Record<string, any>>)
        : [];
      const objectiveTemplateValues =
        summaryTemplateValues.length > 0
          ? summaryTemplateValues
          : objectiveTemplateValueAuditFallbackByTermId.get(termAssignment._id.toString()) ?? [];

      return {
        id: termAssignment._id.toString(),
        annualAssignmentId: termAssignment.annualAssignmentId.toString(),
        termAssignmentId: termAssignment._id.toString(),
        cycleId: termAssignment.cycleId?.toString() ?? '',
        cycleName: this.getCycleName(
          annualAssignment,
          annualCycle,
        ),
        cycleCode: annualCycle?.code ?? undefined,
        quarter: termAssignment.assessmentTermCode,
        assessmentTermType: termAssignment.assessmentTermType,
        termCode: termAssignment.termCode ?? termAssignment.assessmentTermCode,
        termLabel: termAssignment.termLabel ?? termAssignment.termCode ?? termAssignment.assessmentTermCode,
        termState: effectiveTermState,
        assessmentStartDate: termCycle?.startDate
          ? new Date(termCycle.startDate).toISOString()
          : undefined,
        assessmentEndDate: termCycle?.endDate
          ? new Date(termCycle.endDate).toISOString()
          : undefined,
        termWindows: this.mapTermWindows(termCycle),
        employeeId: termAssignment.employeeId.toString(),
        employeeName: this.getEmployeeName(annualAssignment, termAssignment.employeeId.toString()),
        employeeCode,
        employeeNo: employeeCode,
        designation: employeeDesignation,
        employeeDesignation,
        department: employeeDepartment,
        departmentId: String(employeeSnapshot.departmentId ?? employeeDepartment),
        managerId: termAssignment.assignedManagerId.toString(),
        managerName: this.getManagerName(annualAssignment, termAssignment.assignedManagerId.toString()),
        objectiveWeightageCap: 100,
        backendConnected: true,
        achievementSubmissionEnabled:
          achievementSubmissionEnabledMap.get(termAssignment._id.toString()) ?? false,
        templateVersionId: annualAssignment?.templateVersionId?.toString() ?? '',
        objectiveConfig,
        objectiveTemplateValues: this.mapTemplateObjectiveValues(objectiveTemplateValues),
        objectives: objectiveRecords,
      };
    });
  }

  async getObjectiveDetail(objectiveId: string): Promise<ObjectiveRecord> {
    const objective = await this.getObjective(objectiveId);
    await this.assertObjectiveAccess('objective.view', objective, false);
    this.assertEmployeeDraftVisibility(objective);

    const annualAssignment = objective.annualAssignmentId
      ? await AnnualAssignment.findById(objective.annualAssignmentId).lean()
      : null;
    const comments = await ObjectiveComment.find({
      objectiveId: objective._id,
      isDeleted: false,
    })
      .sort({ createdAt: 1 })
      .lean();
    const objectiveValues = await ObjectiveValue.find({
      objectiveId: objective._id,
      isDeleted: false,
    })
      .sort({ createdAt: 1 })
      .lean();
    const objectiveAttachments = await ObjectiveAttachment.find({
      objectiveId: objective._id,
      isDeleted: false,
    })
      .sort({ uploadedAt: 1, createdAt: 1 })
      .lean();

    return this.mapObjectiveRecord(
      objective.toObject(),
      annualAssignment,
      comments,
      objectiveValues,
      objectiveAttachments,
    );
  }

  async getObjectiveFillabilityPolicy(objectiveId: string): Promise<ObjectiveFillabilityPolicy> {
    const objective = await this.getObjective(objectiveId);
    await this.assertObjectiveAccess('objective.view', objective, false);
    const termAssignment = await this.getTermAssignment(objective.termAssignmentId.toString());
    return this.resolveObjectiveFillabilityPolicy(termAssignment, objective);
  }

  async saveAssignmentTemplateValues(
    termAssignmentId: string,
    input: SaveAssignmentTemplateValuesInput,
  ): Promise<Array<Record<string, unknown>>> {
    const termAssignment = await this.getTermAssignment(termAssignmentId);
    const actor = this.requireActor();
    const mappedRole = accessService.mapRole(actor.actorRole);

    await this.assertAssignmentAccess('objective.create', termAssignment);
    await this.assertObjectiveWindow(termAssignment, 'setting');

    const policy = await this.resolveObjectiveFillabilityPolicy(termAssignment);
    const hasTemplatePolicy = policy.source === 'TEMPLATE';
    if (
      !hasTemplatePolicy &&
      mappedRole !== PmsRole.ADMIN &&
      actor.actorId !== termAssignment.employeeId.toString()
    ) {
      throw new Error('Only the employee or admin can update template form values');
    }

    const normalizedValues = (input.objectiveValues ?? [])
      .filter((value) => value.fieldKey?.trim() && value.sectionKey?.trim())
      .map((value) => ({
        templateFieldId: value.templateFieldId,
        fieldKey: value.fieldKey.trim(),
        sectionKey: value.sectionKey.trim(),
        roleCode: value.roleCode ?? actor.actorRole,
        actorUserId: value.actorUserId ?? actor.actorId,
        workflowStage: value.workflowStage ?? 'OBJECTIVE_SETTING',
        valueJson: value.valueJson,
        valueText: value.valueText,
        valueNumber: value.valueNumber,
        valueDate: value.valueDate ? new Date(value.valueDate).toISOString() : undefined,
        valueStatus: value.valueStatus ?? 'ACTIVE',
      }));

    this.assertObjectiveValuesFillable(normalizedValues, policy);

    const previousSummary = (termAssignment.termSummary ?? {}) as Record<string, unknown>;
    termAssignment.termSummary = {
      ...previousSummary,
      objectiveTemplateValues: normalizedValues,
    };
    termAssignment.updatedBy = this.toObjectId(actor.actorId, 'actorId');
    termAssignment.version += 1;
    await termAssignment.save();

    await this.audit(
      'PMS_OBJECTIVE_TEMPLATE_VALUES_UPDATED',
      'TERM_ASSIGNMENT',
      termAssignment._id.toString(),
      previousSummary,
      termAssignment.termSummary,
    );

    return this.mapTemplateObjectiveValues(normalizedValues);
  }

  async createObjective(input: CreateObjectiveInput): Promise<IObjective> {
    const actor = this.requireActor();
    const termAssignment = await this.getTermAssignment(input.termAssignmentId);
    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const source = this.resolveObjectiveSource(actor.actorRole, termAssignment);
    const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, termAssignment);

    const bucket = this.resolveObjectiveBucket(source, objectiveConfig);
    if (!bucket) {
      throw new Error(`No matching objective bucket configuration found for source: ${source}`);
    }

    if (bucket.owner === 'EMPLOYEE' && actor.actorId !== termAssignment.employeeId.toString()) {
      throw new Error('Only the employee can add objectives to the employee-owned bucket');
    }
    if (bucket.owner === 'MANAGER') {
      const isManager = actor.actorId === termAssignment.assignedManagerId.toString();
      const isDelegate = await this.getObjectiveDelegation(
        actor.actorId,
        termAssignment.assignedManagerId.toString(),
        termAssignment.cycleId?.toString(),
        termAssignment.annualAssignmentId.toString(),
      );
      if (!isManager && !isDelegate && accessService.mapRole(actor.actorRole) !== PmsRole.ADMIN) {
        throw new Error('Only the manager or their delegate can add objectives to the manager-owned bucket');
      }
    }

    await this.assertAssignmentAccess('objective.create', termAssignment);
    if (source === ObjectiveSource.MANAGER_CREATED) {
      await this.assertManagerCreatedObjectiveAssignmentAllowed(termAssignment);
    } else {
      await this.assertObjectiveWindow(termAssignment, 'setting');
    }
    this.validateContextObjectivePayload(input as unknown as Record<string, unknown>, source, objectiveConfig);
    this.validateObjectiveInput(input);
    this.validateContextObjectiveRequiredFields(input, source);
    this.validateCreateAgainstConfig(source, objectiveConfig);
    if (this.objectiveSourceIsScoreable(source, objectiveConfig)) {
      await this.validateQuarterObjectiveRules(
        termAssignment,
        input.weightage,
        undefined,
        source,
        objectiveConfig,
        false,
      );
    }

    if (termAssignment.termState === TermWorkflowState.NOT_STARTED) {
      await this.ensureQuarterState(
        termAssignment._id.toString(),
        termAssignment.termState,
        TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      );
    }

    if (
      source === ObjectiveSource.EMPLOYEE_CREATED &&
      termAssignment.termState === TermWorkflowState.OBJECTIVE_SETTING_OPEN
    ) {
      await this.transitionQuarterIfNeeded(
        termAssignment._id.toString(),
        TermWorkflowState.OBJECTIVE_DRAFT,
      );
    }

    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');
    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== termAssignment.assignedManagerId.toString()) {
      const delegation = await this.getObjectiveDelegation(
        actor.actorId,
        termAssignment.assignedManagerId.toString(),
        termAssignment.cycleId?.toString(),
        termAssignment.annualAssignmentId.toString(),
      );

      if (delegation) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = termAssignment.assignedManagerId;
      }
    }

    const objective = await Objective.create({
      termAssignmentId: termAssignment._id,
      annualAssignmentId: termAssignment.annualAssignmentId,
      cycleId: termAssignment.cycleId,
      assessmentTermCode: termAssignment.assessmentTermCode,
      employeeId: termAssignment.employeeId,
      assignedManagerId: termAssignment.assignedManagerId,
      objectiveNo: await this.getNextObjectiveNo(termAssignment._id),
      source,
      title: input.title.trim(),
      description: input.description?.trim(),
      priority: this.normalizeObjectivePriority(input.priority),
      expectedOutcome: input.expectedOutcome?.trim(),
      targetMetric: source === ObjectiveSource.PREDEFINED ? input.targetMetric?.trim() : undefined,
      targetValue: source === ObjectiveSource.PREDEFINED ? input.targetValue?.trim() : undefined,
      targetDate: source === ObjectiveSource.PREDEFINED && input.targetDate ? new Date(input.targetDate) : undefined,
      weightage: this.objectiveSourceIsScoreable(source, objectiveConfig) ? input.weightage : undefined,
      successCriteria: source === ObjectiveSource.PREDEFINED ? input.successCriteria?.trim() : undefined,
      status: source === ObjectiveSource.MANAGER_CREATED
        ? ObjectiveStatus.OBJECTIVE_APPROVED
        : ObjectiveStatus.OBJECTIVE_DRAFT,
      attachments: this.normalizeAttachments(input.attachments ?? []),
      createdByRole: actor.actorRole,
      createdByUserId: actorObjectId,
      createdBy: actorObjectId,
      actingDelegateUserId,
      originalOwnerUserId,
      approvedAt: source === ObjectiveSource.MANAGER_CREATED ? new Date() : undefined,
      approvedBy: source === ObjectiveSource.MANAGER_CREATED ? actorObjectId : undefined,
    });

    await this.replaceObjectiveAttachments(objective, input.attachments ?? [], actor.actorRole);
    if (input.commentText?.trim()) {
      await this.createCommentRecord(
        objective,
        input.commentText.trim(),
        'OBJECTIVE_CREATION',
      );
    }
    await this.persistObjectiveValues(
      objective,
      termAssignment,
      input.objectiveValues ?? [],
      false,
    );

    await this.audit(
      source === ObjectiveSource.MANAGER_CREATED
        ? 'PMS_MANAGER_OBJECTIVE_CREATED_AND_APPROVED'
        : 'PMS_EMPLOYEE_OBJECTIVE_CREATED',
      'OBJECTIVE',
      objective._id.toString(),
      undefined,
      objective.toObject(),
    );

    return objective;
  }

  async bulkCreateManagerObjectives(
    input: BulkCreateManagerObjectiveInput,
  ): Promise<BulkCreateManagerObjectiveResult> {
    const termAssignmentIds = Array.from(new Set(input.termAssignmentIds ?? []));
    if (termAssignmentIds.length === 0) {
      throw new Error('At least one quarter assignment is required');
    }

    const objectiveInputs = this.resolveBulkManagerObjectiveInputs(input);
    if (objectiveInputs.length === 0) {
      throw new Error('At least one objective is required');
    }
    if ((input.weightageAdjustments ?? []).length > 0 || (input.objectiveWeightageOverrides ?? []).length > 0) {
      throw new Error('Bulk weightage adjustments are not supported; set weightage on each scoreable manager objective');
    }
    const actor = this.requireActor();
    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');
    const created: BulkCreateManagerObjectiveResult['created'] = [];
    const updated: BulkCreateManagerObjectiveResult['updated'] = [];
    const failed: BulkCreateManagerObjectiveResult['failed'] = [];

    for (const termAssignmentId of termAssignmentIds) {
      let termAssignment: ITermAssignment | null = null;
      let annualAssignment: IAnnualAssignment | null = null;

      try {
        termAssignment = await this.getTermAssignment(termAssignmentId);
        annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
        const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, termAssignment);
        const source = ObjectiveSource.MANAGER_CREATED;
        const bucket = this.resolveObjectiveBucket(source, objectiveConfig);

        if (!bucket) {
          throw new Error(`No matching objective bucket configuration found for source: ${source}`);
        }
        if (bucket.owner !== 'MANAGER') {
          throw new Error('Bulk assignment can create objectives only in manager-owned buckets');
        }

        const isManager = actor.actorId === termAssignment.assignedManagerId.toString();
        const isDelegate = await this.getObjectiveDelegation(
          actor.actorId,
          termAssignment.assignedManagerId.toString(),
          termAssignment.cycleId?.toString(),
          termAssignment.annualAssignmentId.toString(),
        );

        if (!isManager && !isDelegate && accessService.mapRole(actor.actorRole) !== PmsRole.ADMIN) {
          throw new Error('Only the manager or their delegate can assign manager objectives');
        }

        await this.assertAssignmentAccess('objective.create', termAssignment);
        await this.assertManagerCreatedObjectiveAssignmentAllowed(termAssignment);
        this.validateCreateAgainstConfig(source, objectiveConfig);

        if (termAssignment.termState === TermWorkflowState.NOT_STARTED) {
          await this.ensureQuarterState(
            termAssignment._id.toString(),
            termAssignment.termState,
            TermWorkflowState.OBJECTIVE_SETTING_OPEN,
          );
        }

        let actingDelegateUserId: Types.ObjectId | undefined;
        let originalOwnerUserId: Types.ObjectId | undefined;
        if (isDelegate && !isManager) {
          actingDelegateUserId = actorObjectId;
          originalOwnerUserId = termAssignment.assignedManagerId;
        }

        const objectiveInputsForAssignment = objectiveInputs;

        for (const objectiveInput of objectiveInputsForAssignment) {
          try {
            this.validateContextObjectivePayload(
              objectiveInput as unknown as Record<string, unknown>,
              source,
              objectiveConfig,
            );
            this.validateObjectiveInput({
              ...objectiveInput,
              termAssignmentId,
            });
            this.validateContextObjectiveRequiredFields(objectiveInput, source);
            if (this.objectiveSourceIsScoreable(source, objectiveConfig)) {
              await this.validateQuarterObjectiveRules(
                termAssignment,
                objectiveInput.weightage,
                undefined,
                source,
                objectiveConfig,
                false,
              );
            }

            const objective = await Objective.create({
              termAssignmentId: termAssignment._id,
              annualAssignmentId: termAssignment.annualAssignmentId,
              cycleId: termAssignment.cycleId,
              assessmentTermCode: termAssignment.assessmentTermCode,
              employeeId: termAssignment.employeeId,
              assignedManagerId: termAssignment.assignedManagerId,
              objectiveNo: await this.getNextObjectiveNo(termAssignment._id),
              source,
              title: objectiveInput.title.trim(),
              description: objectiveInput.description?.trim(),
              priority: this.normalizeObjectivePriority(objectiveInput.priority),
              expectedOutcome: objectiveInput.expectedOutcome?.trim(),
              targetMetric: undefined,
              targetValue: undefined,
              targetDate: undefined,
              weightage: this.objectiveSourceIsScoreable(source, objectiveConfig)
                ? objectiveInput.weightage
                : undefined,
              successCriteria: undefined,
              status: ObjectiveStatus.OBJECTIVE_APPROVED,
              attachments: this.normalizeAttachments(objectiveInput.attachments ?? []),
              createdByRole: actor.actorRole,
              createdByUserId: actorObjectId,
              createdBy: actorObjectId,
              actingDelegateUserId,
              originalOwnerUserId,
              approvedAt: new Date(),
              approvedBy: actorObjectId,
            });

            await this.replaceObjectiveAttachments(objective, objectiveInput.attachments ?? [], actor.actorRole);
            await this.persistObjectiveValues(
              objective,
              termAssignment,
              objectiveInput.objectiveValues ?? [],
              false,
            );

            await this.audit(
              'PMS_MANAGER_OBJECTIVE_BULK_CREATED_AND_APPROVED',
              'OBJECTIVE',
              objective._id.toString(),
              undefined,
              objective.toObject(),
            );

            created.push({
              termAssignmentId,
              objectiveId: objective._id.toString(),
              employeeId: termAssignment.employeeId.toString(),
              employeeName: this.getEmployeeName(annualAssignment, termAssignment.employeeId.toString()),
              objectiveTitle: objective.title,
              clientObjectiveId: objectiveInput.clientObjectiveId,
            });
          } catch (error) {
            failed.push({
              termAssignmentId,
              employeeId: termAssignment.employeeId.toString(),
              employeeName: this.getEmployeeName(annualAssignment, termAssignment.employeeId.toString()),
              objectiveTitle: objectiveInput.title,
              clientObjectiveId: objectiveInput.clientObjectiveId,
              reason: error instanceof Error ? error.message : 'Unexpected error',
            });
          }
        }

      } catch (error) {
        failed.push({
          termAssignmentId,
          employeeId: termAssignment?.employeeId?.toString(),
          employeeName: termAssignment && annualAssignment
            ? this.getEmployeeName(annualAssignment, termAssignment.employeeId.toString())
            : undefined,
          reason: error instanceof Error ? error.message : 'Unexpected error',
        });
      }
    }

    return { created, updated, failed };
  }

  async closeObjectiveSetting(
    termAssignmentId: string,
    input: CloseObjectiveSettingInput = {},
  ): Promise<ITermAssignment> {
    const confirmed = input.confirm === true || input.confirmationAccepted === true;
    if (!confirmed) {
      throw new Error(
        'Confirmation is required to close objective setting. Predefined objectives are approved. No additional objectives will be accepted after moving forward.',
      );
    }

    const termAssignment = await this.getTermAssignment(termAssignmentId);
    const actor = this.requireActor();
    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');
    const mappedRole = accessService.mapRole(actor.actorRole);
    const isAdmin = mappedRole === PmsRole.ADMIN;
    const isAssignedManager =
      actor.actorId === termAssignment.assignedManagerId.toString();
    const isDelegate = await this.getObjectiveDelegation(
      actor.actorId,
      termAssignment.assignedManagerId.toString(),
      termAssignment.cycleId?.toString(),
      termAssignment.annualAssignmentId.toString(),
    );

    if (!isAdmin && !isAssignedManager && !isDelegate) {
      throw new Error('Only the assigned manager or HR/Admin can close objective setting');
    }

    if (termAssignment.termState !== TermWorkflowState.OBJECTIVE_SETTING_OPEN) {
      throw new Error(
        `Objective setting can be closed only from ${TermWorkflowState.OBJECTIVE_SETTING_OPEN}. Current state: ${termAssignment.termState}`,
      );
    }

    const objectives = await Objective.find({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
    })
      .select('title status source')
      .lean();

    const pendingObjective = objectives.find(
      (objective) => objective.status !== ObjectiveStatus.OBJECTIVE_APPROVED,
    );
    if (pendingObjective) {
      throw new Error(
        `Objective setting cannot be closed until all objectives are approved. Pending objective: ${pendingObjective.title}`,
      );
    }

    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, termAssignment);
    await this.validateObjectiveWeightageBeforeClose(
      termAssignment,
      objectiveConfig,
    );

    const reason =
      input.reason?.trim() ||
      'Predefined objectives are approved. No additional objectives will be accepted after moving forward.';
    const previousState = termAssignment.termState;

    await transitionTermAssignmentState(
      termAssignment._id.toString(),
      TermWorkflowState.OBJECTIVE_APPROVED,
      actor,
      reason,
      'CLOSE_OBJECTIVE_SETTING',
    );

    const approvedTermAssignment = await this.getTermAssignment(
      termAssignment._id.toString(),
    );
    if (approvedTermAssignment.termState !== TermWorkflowState.OBJECTIVE_APPROVED) {
      throw new Error(
        `Objective setting cannot be closed from state ${approvedTermAssignment.termState}`,
      );
    }

    const closedTermAssignment = await this.getTermAssignment(
      approvedTermAssignment._id.toString(),
    );
    closedTermAssignment.objectiveSettingClosedBy = actorObjectId;
    closedTermAssignment.objectiveSettingClosedAt = new Date();
    closedTermAssignment.objectiveSettingCloseReason = reason;
    closedTermAssignment.objectiveSettingCloseSource = isAdmin
      ? 'ADMIN'
      : 'MANAGER';
    closedTermAssignment.updatedBy = actorObjectId;
    closedTermAssignment.version += 1;
    await closedTermAssignment.save();

    await this.audit(
      'PMS_OBJECTIVE_SETTING_CLOSED',
      'TERM_ASSIGNMENT',
      closedTermAssignment._id.toString(),
      { termState: previousState },
      {
        termState: closedTermAssignment.termState,
        objectiveSettingClosedAt: closedTermAssignment.objectiveSettingClosedAt,
        objectiveSettingCloseSource: closedTermAssignment.objectiveSettingCloseSource,
      },
      reason,
    );

    return closedTermAssignment;
  }

  async updateObjective(objectiveId: string, input: UpdateObjectiveInput): Promise<IObjective> {
    const objective = await this.getObjective(objectiveId);
    const termAssignment = await this.getTermAssignment(objective.termAssignmentId.toString());
    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, termAssignment);
    const actor = this.requireActor();
    const mappedRole = accessService.mapRole(actor.actorRole);

    await this.assertObjectiveAccess('objective.edit', objective, false);
    await this.assertObjectiveWindow(termAssignment, 'setting');

    const allowEmployeePredefinedValueUpdate =
      objective.source === ObjectiveSource.PREDEFINED &&
      mappedRole === PmsRole.EMPLOYEE &&
      actor.actorId === objective.employeeId.toString();

    if (allowEmployeePredefinedValueUpdate) {
      this.assertPredefinedObjectiveValueOnlyUpdate(objective, input);

      const previousValue = objective.toObject();
      objective.updatedBy = this.toObjectId(actor.actorId, 'actorId');
      objective.version += 1;
      await objective.save();

      await this.persistObjectiveValues(
        objective,
        termAssignment,
        input.objectiveValues ?? [],
        objective.status === ObjectiveStatus.OBJECTIVE_SUBMITTED || objective.status === ObjectiveStatus.OBJECTIVE_APPROVED,
      );

      await this.audit(
        'PMS_PREDEFINED_OBJECTIVE_VALUES_UPDATED',
        'OBJECTIVE',
        objective._id.toString(),
        previousValue,
        objective.toObject(),
      );

      return objective;
    }

    this.assertRegularObjectiveEditAccess(objective);

    // Predefined gating check
    if (objective.source === ObjectiveSource.PREDEFINED || objectiveConfig.mode === 'PREDEFINED') {
      if (mappedRole !== PmsRole.ADMIN) {
        throw new Error('Predefined objectives are read-only and cannot be modified');
      }
    }
    this.validateContextObjectivePayload(
      input as unknown as Record<string, unknown>,
      objective.source as ObjectiveSourceType,
      objectiveConfig,
    );
    this.validateObjectiveInput({
      termAssignmentId: objective.termAssignmentId.toString(),
      title: input.title ?? objective.title,
      description: input.description ?? objective.description,
      priority: input.priority ?? objective.priority,
      expectedOutcome: input.expectedOutcome ?? objective.expectedOutcome,
      targetMetric: input.targetMetric ?? objective.targetMetric,
      targetValue: input.targetValue ?? objective.targetValue,
      targetDate: input.targetDate ?? objective.targetDate,
      weightage: input.weightage ?? objective.weightage,
      successCriteria: input.successCriteria ?? objective.successCriteria,
      attachments: input.attachments ?? this.mapExistingAttachments(objective.attachments),
    });
    this.validateContextObjectiveRequiredFields(
      {
        title: input.title ?? objective.title,
        description: input.description ?? objective.description,
        priority: input.priority ?? objective.priority,
        expectedOutcome: input.expectedOutcome ?? objective.expectedOutcome,
      },
      objective.source as ObjectiveSourceType,
    );
    await this.validateUpdateAgainstConfig(
      objective,
      objectiveConfig,
      this.objectiveSourceIsScoreable(objective.source as ObjectiveSourceType, objectiveConfig)
        ? input.weightage ?? objective.weightage
        : undefined,
    );

    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== objective.assignedManagerId.toString()) {
      const delegation = await this.getObjectiveDelegation(
        actor.actorId,
        objective.assignedManagerId.toString(),
        objective.cycleId?.toString(),
        objective.annualAssignmentId?.toString(),
      );

      if (delegation) {
        actingDelegateUserId = new Types.ObjectId(actor.actorId);
        originalOwnerUserId = objective.assignedManagerId;
      }
    }

    const previousValue = objective.toObject();

    objective.title = (input.title ?? objective.title).trim();
    objective.description = input.description === undefined
      ? objective.description
      : input.description.trim();
    objective.priority = input.priority === undefined
      ? objective.priority
      : this.normalizeObjectivePriority(input.priority);
    objective.expectedOutcome = input.expectedOutcome === undefined
      ? objective.expectedOutcome
      : input.expectedOutcome.trim();
    objective.targetMetric = objective.source !== ObjectiveSource.PREDEFINED
      ? objective.targetMetric
      : input.targetMetric === undefined
      ? objective.targetMetric
      : input.targetMetric.trim();
    objective.targetValue = objective.source !== ObjectiveSource.PREDEFINED
      ? objective.targetValue
      : input.targetValue === undefined
      ? objective.targetValue
      : input.targetValue.trim();
    objective.targetDate = objective.source !== ObjectiveSource.PREDEFINED
      ? objective.targetDate
      : input.targetDate === undefined
      ? objective.targetDate
      : input.targetDate
        ? new Date(input.targetDate)
        : undefined;
    objective.weightage = objective.source !== ObjectiveSource.PREDEFINED
      && !this.objectiveSourceIsScoreable(objective.source as ObjectiveSourceType, objectiveConfig)
      ? objective.weightage
      : input.weightage === undefined
      ? objective.weightage
      : input.weightage;
    objective.successCriteria = objective.source !== ObjectiveSource.PREDEFINED
      ? objective.successCriteria
      : input.successCriteria === undefined
      ? objective.successCriteria
      : input.successCriteria.trim();
    objective.attachments = input.attachments === undefined
      ? objective.attachments
      : this.normalizeAttachments(input.attachments);
    objective.updatedBy = this.toObjectId(actor.actorId, 'actorId');
    if (actingDelegateUserId) {
      objective.actingDelegateUserId = actingDelegateUserId;
      objective.originalOwnerUserId = originalOwnerUserId;
    }
    objective.version += 1;
    await objective.save();

    if (input.attachments !== undefined) {
      await this.replaceObjectiveAttachments(objective, input.attachments, actor.actorRole);
    }
    await this.persistObjectiveValues(
      objective,
      termAssignment,
      input.objectiveValues ?? [],
      objective.status === ObjectiveStatus.OBJECTIVE_SUBMITTED || objective.status === ObjectiveStatus.OBJECTIVE_APPROVED,
    );

    await this.audit(
      'PMS_OBJECTIVE_DRAFT_UPDATED',
      'OBJECTIVE',
      objective._id.toString(),
      previousValue,
      objective.toObject(),
    );

    return objective;
  }

  async deleteDraftObjective(objectiveId: string): Promise<{ deleted: boolean; objectiveId: string }> {
    const objective = await this.getObjective(objectiveId);
    const termAssignment = await this.getTermAssignment(objective.termAssignmentId.toString());
    const actor = this.requireActor();
    const mappedRole = accessService.mapRole(actor.actorRole);
    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');

    if (objective.source !== ObjectiveSource.EMPLOYEE_CREATED) {
      throw new Error('Only employee-created draft objectives can be deleted');
    }

    if (objective.status !== ObjectiveStatus.OBJECTIVE_DRAFT) {
      throw new Error('Only draft objectives can be deleted');
    }

    if (
      termAssignment.termState !== TermWorkflowState.OBJECTIVE_SETTING_OPEN &&
      termAssignment.termState !== TermWorkflowState.OBJECTIVE_DRAFT
    ) {
      throw new Error(
        `Draft objectives can be deleted only during objective setting. Current state: ${termAssignment.termState}`,
      );
    }

    const isOwnerEmployee =
      actor.actorId === objective.employeeId.toString() &&
      actor.actorId === objective.createdByUserId.toString();
    const isAdmin = mappedRole === PmsRole.ADMIN;

    if (!isOwnerEmployee && !isAdmin) {
      throw new Error('Only the employee who created this draft objective can delete it');
    }

    if (!isAdmin) {
      await this.assertObjectiveWindow(termAssignment, 'setting');
    }

    const previousValue = objective.toObject();
    const activeAttachments = await ObjectiveAttachment.find({
      objectiveId: objective._id,
      isDeleted: false,
    }).lean();
    const linkedDocumentIds = Array.from(
      new Set(
        [
          ...activeAttachments.map((attachment) => attachment.documentId),
          ...(objective.attachments ?? []).map((attachment) => attachment.documentId),
        ]
          .filter((documentId): documentId is string => Boolean(documentId))
          .filter((documentId) => Types.ObjectId.isValid(documentId)),
      ),
    );

    objective.isDeleted = true;
    objective.updatedBy = actorObjectId;
    objective.version += 1;
    await objective.save();

    await ObjectiveValue.updateMany(
      { objectiveId: objective._id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          updatedBy: actorObjectId,
        },
      },
    );

    await ObjectiveAttachment.updateMany(
      { objectiveId: objective._id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          updatedBy: actorObjectId,
        },
      },
    );

    await ObjectiveComment.updateMany(
      { objectiveId: objective._id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          updatedBy: actorObjectId,
        },
      },
    );

    if (linkedDocumentIds.length > 0) {
      await PmsDocument.updateMany(
        {
          _id: { $in: linkedDocumentIds.map((documentId) => new Types.ObjectId(documentId)) },
          isDeleted: false,
        },
        { $set: { isDeleted: true } },
      );
    }

    await this.reopenObjectiveSettingIfLastEmployeeDraftDeleted(termAssignment._id.toString());

    await this.audit(
      'PMS_OBJECTIVE_DRAFT_DELETED',
      'OBJECTIVE',
      objective._id.toString(),
      previousValue,
      { isDeleted: true },
      'Employee-created draft objective deleted',
    );

    return { deleted: true, objectiveId: objective._id.toString() };
  }

  async submitObjective(objectiveId: string): Promise<IObjective> {
    const objective = await this.getObjective(objectiveId);
    const termAssignment = await this.getTermAssignment(objective.termAssignmentId.toString());
    await this.assertObjectiveAccess('objective.submit', objective, true);
    await this.assertObjectiveWindow(termAssignment, 'setting');

    if (objective.source === ObjectiveSource.MANAGER_CREATED) {
      throw new Error('Employee cannot submit manager-created objective');
    }

    if (
      objective.status !== ObjectiveStatus.OBJECTIVE_DRAFT &&
      objective.status !== ObjectiveStatus.OBJECTIVE_REVISION_REQUIRED
    ) {
      throw new Error('Only draft or revision-required objectives can be submitted');
    }

    this.validateObjectiveForSubmit(objective);
    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, termAssignment);
    if (objective.source === ObjectiveSource.PREDEFINED) {
      await this.validateQuarterObjectiveRules(
        termAssignment,
        objective.weightage,
        objective._id.toString(),
        objective.source as ObjectiveSourceType,
        objectiveConfig,
        true,
      );
    }

    await this.transitionQuarterIfNeeded(
      objective.termAssignmentId.toString(),
      TermWorkflowState.OBJECTIVE_SUBMITTED,
    );

    const previousState = objective.status;
    objective.status = ObjectiveStatus.OBJECTIVE_SUBMITTED;
    objective.submittedAt = new Date();
    objective.returnedReason = undefined;
    objective.returnedAt = undefined;
    objective.updatedBy = this.toObjectId(this.requireActor().actorId, 'actorId');
    objective.version += 1;
    await objective.save();
    await ObjectiveValue.updateMany(
      { objectiveId: objective._id, isDeleted: false },
      {
        $set: {
          valueStatus: 'ACTIVE',
          submittedAt: objective.submittedAt,
          updatedBy: objective.updatedBy,
        },
      },
    );

    await this.audit(
      'PMS_OBJECTIVE_SUBMITTED',
      'OBJECTIVE',
      objective._id.toString(),
      { status: previousState },
      { status: objective.status },
    );

    return objective;
  }

  async approveObjective(
    objectiveId: string,
    input: ApproveObjectiveInput = {},
  ): Promise<IObjective> {
    const objective = await this.getObjective(objectiveId);
    const termAssignment = await this.getTermAssignment(objective.termAssignmentId.toString());
    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, termAssignment);
    await this.assertObjectiveAccess('objective.approve', objective, false);
    await this.assertObjectiveWindow(termAssignment, 'approval');

    if (objective.status !== ObjectiveStatus.OBJECTIVE_SUBMITTED) {
      throw new Error('Only submitted objectives can be approved');
    }

    if (input.weightage !== undefined && !this.objectiveSourceIsScoreable(objective.source as ObjectiveSourceType, objectiveConfig)) {
      throw new Error('This objective type cannot carry score weightage for this assignment');
    }

    if (input.weightage !== undefined) {
      this.validateObjectiveInput({
        title: objective.title,
        weightage: input.weightage,
      });
      await this.validateQuarterObjectiveRules(
        termAssignment,
        input.weightage,
        objective._id.toString(),
        objective.source as ObjectiveSourceType,
        objectiveConfig,
        false,
      );
    }

    const actor = this.requireActor();
    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');
    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== objective.assignedManagerId.toString()) {
      const delegation = await this.getObjectiveDelegation(
        actor.actorId,
        objective.assignedManagerId.toString(),
        objective.cycleId?.toString(),
        objective.annualAssignmentId?.toString(),
      );

      if (delegation) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = objective.assignedManagerId;
      }
    }

    const previousState = objective.status;
    objective.status = ObjectiveStatus.OBJECTIVE_APPROVED;
    if (input.weightage !== undefined) {
      objective.weightage = input.weightage;
    }
    objective.approvedAt = new Date();
    objective.approvedBy = actorObjectId;
    objective.updatedBy = actorObjectId;
    if (actingDelegateUserId) {
      objective.actingDelegateUserId = actingDelegateUserId;
      objective.originalOwnerUserId = originalOwnerUserId;
    }
    objective.version += 1;
    await objective.save();

    await this.updateTermStateAfterApproval(objective.termAssignmentId.toString());

    await this.audit(
      'PMS_OBJECTIVE_APPROVED',
      'OBJECTIVE',
      objective._id.toString(),
      { status: previousState },
      { status: objective.status },
    );

    return objective;
  }

  async returnObjective(objectiveId: string, input: ReturnObjectiveInput): Promise<IObjective> {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Return reason is required');
    }

    const objective = await this.getObjective(objectiveId);
    const termAssignment = await this.getTermAssignment(objective.termAssignmentId.toString());
    await this.assertObjectiveAccess('objective.return', objective, false);
    await this.assertObjectiveWindow(termAssignment, 'approval');

    if (objective.status !== ObjectiveStatus.OBJECTIVE_SUBMITTED) {
      throw new Error('Only submitted objectives can be returned for revision');
    }

    const actor = this.requireActor();
    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');
    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== objective.assignedManagerId.toString()) {
      const delegation = await this.getObjectiveDelegation(
        actor.actorId,
        objective.assignedManagerId.toString(),
        objective.cycleId?.toString(),
        objective.annualAssignmentId?.toString(),
      );

      if (delegation) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = objective.assignedManagerId;
      }
    }

    await this.transitionQuarterIfNeeded(
      objective.termAssignmentId.toString(),
      TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
      reason,
    );

    const previousState = objective.status;
    objective.status = ObjectiveStatus.OBJECTIVE_REVISION_REQUIRED;
    objective.returnedReason = reason;
    objective.returnedAt = new Date();
    objective.updatedBy = actorObjectId;
    if (actingDelegateUserId) {
      objective.actingDelegateUserId = actingDelegateUserId;
      objective.originalOwnerUserId = originalOwnerUserId;
    }
    objective.version += 1;
    await objective.save();

    await this.createCommentRecord(objective, reason, 'RETURN_FOR_REVISION');

    await this.audit(
      'PMS_OBJECTIVE_RETURNED_FOR_REVISION',
      'OBJECTIVE',
      objective._id.toString(),
      { status: previousState },
      { status: objective.status, returnedReason: reason },
      reason,
    );

    return objective;
  }

  async addComment(objectiveId: string, input: AddObjectiveCommentInput) {
    const commentText = input.commentText?.trim();
    if (!commentText) {
      throw new Error('Comment text is required');
    }

    const objective = await this.getObjective(objectiveId);
    await this.assertObjectiveAccess('objective.comment', objective, false);

    return this.createCommentRecord(
      objective,
      commentText,
      input.commentType?.trim() || 'GENERAL',
    );
  }

  async correctObjective(objectiveId: string, input: CorrectObjectiveInput): Promise<IObjective> {
    await this.assertAdmin('objective.correction');

    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Correction reason is required');
    }

    const objective = await this.getObjective(objectiveId);
    if (objective.status !== ObjectiveStatus.OBJECTIVE_APPROVED) {
      throw new Error('Only approved objectives can be corrected through correction flow');
    }
    this.validateContextObjectivePayload(
      input as unknown as Record<string, unknown>,
      objective.source as ObjectiveSourceType,
    );

    const actorId = this.toObjectId(this.requireActor().actorId, 'actorId');
    const previousValue = objective.toObject();
    const nextValues = {
      title: input.title ?? objective.title,
      description: input.description ?? objective.description,
      priority: input.priority ?? objective.priority,
      expectedOutcome: input.expectedOutcome ?? objective.expectedOutcome,
      targetMetric: input.targetMetric ?? objective.targetMetric,
      targetValue: input.targetValue ?? objective.targetValue,
      targetDate: input.targetDate === undefined
        ? objective.targetDate
        : input.targetDate
          ? new Date(input.targetDate)
          : undefined,
      weightage: input.weightage ?? objective.weightage,
      successCriteria: input.successCriteria ?? objective.successCriteria,
      attachments: input.attachments === undefined
        ? this.mapExistingAttachments(objective.attachments)
        : input.attachments,
    };

    this.validateObjectiveInput({
      termAssignmentId: objective.termAssignmentId.toString(),
      title: String(nextValues.title ?? ''),
      description: nextValues.description ?? undefined,
      priority: nextValues.priority ?? undefined,
      expectedOutcome: nextValues.expectedOutcome ?? undefined,
      targetMetric: nextValues.targetMetric ?? undefined,
      targetValue: nextValues.targetValue ?? undefined,
      targetDate: nextValues.targetDate as Date | undefined,
      weightage: nextValues.weightage ?? undefined,
      successCriteria: nextValues.successCriteria ?? undefined,
      attachments: nextValues.attachments,
    });

    const changedEntries: Array<{ fieldKey: string; originalValue: unknown; correctedValue: unknown }> = [];
    for (const [fieldKey, correctedValue] of Object.entries(nextValues)) {
      const originalValue = previousValue[fieldKey as keyof typeof previousValue];
      if (this.valuesDiffer(originalValue, correctedValue)) {
        changedEntries.push({ fieldKey, originalValue, correctedValue });
      }
    }

    if (changedEntries.length === 0) {
      throw new Error('No objective changes detected for correction flow');
    }

    objective.title = String(nextValues.title).trim();
    objective.description = nextValues.description
      ? String(nextValues.description).trim()
      : undefined;
    objective.priority = nextValues.priority
      ? this.normalizeObjectivePriority(String(nextValues.priority))
      : undefined;
    objective.expectedOutcome = nextValues.expectedOutcome
      ? String(nextValues.expectedOutcome).trim()
      : undefined;
    objective.targetMetric = nextValues.targetMetric
      ? String(nextValues.targetMetric).trim()
      : undefined;
    objective.targetValue = nextValues.targetValue
      ? String(nextValues.targetValue).trim()
      : undefined;
    objective.targetDate = nextValues.targetDate as Date | undefined;
    objective.weightage = nextValues.weightage as number | undefined;
    objective.successCriteria = nextValues.successCriteria
      ? String(nextValues.successCriteria).trim()
      : undefined;
    objective.attachments = this.normalizeAttachments(nextValues.attachments);
    objective.updatedBy = actorId;
    objective.version += 1;
    await objective.save();

    if (input.attachments !== undefined) {
      await this.replaceObjectiveAttachments(objective, input.attachments, this.requireActor().actorRole);
    }

    await CorrectionLayer.insertMany(
      changedEntries.map((entry) => ({
        entityType: 'OBJECTIVE',
        entityId: objective._id,
        fieldKey: entry.fieldKey,
        originalValue: entry.originalValue,
        correctedValue: entry.correctedValue,
        correctionReason: reason,
        correctedBy: actorId,
        correctedAt: new Date(),
        approvedBy: actorId,
        approvedAt: new Date(),
        createdBy: actorId,
      })),
    );

    await this.createCommentRecord(objective, reason, 'CORRECTION_REASON');

    await this.audit(
      'PMS_OBJECTIVE_CORRECTED',
      'OBJECTIVE',
      objective._id.toString(),
      previousValue,
      objective.toObject(),
      reason,
    );

    return objective;
  }

  async amendFlexibleObjective(
    objectiveId: string,
    input: AmendFlexibleObjectiveInput,
  ): Promise<FlexibleObjectiveAmendmentResult> {
    await this.assertAdmin('objective.amendment');

    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Amendment reason is required');
    }

    const objective = await this.getObjective(objectiveId);
    if (!objective.objectiveMasterId || !objective.objectiveVersionId || !objective.objectiveSnapshot) {
      throw new Error('Only flexible assigned objectives can use amendment flow');
    }

    const termAssignment = await this.getTermAssignment(objective.termAssignmentId.toString());
    this.assertObjectiveAmendmentAllowed(termAssignment);

    if (objective.applicabilityStatus === ObjectiveApplicabilityStatus.NOT_APPLICABLE) {
      throw new Error('Objective is already marked not applicable');
    }
    if (objective.applicabilityStatus === ObjectiveApplicabilityStatus.REPLACED) {
      throw new Error('Objective has already been replaced');
    }

    if (input.action === 'MARK_NOT_APPLICABLE') {
      return this.markFlexibleObjectiveNotApplicable(objective, reason);
    }

    if (input.action === 'REPLACE_OBJECTIVE') {
      if (!input.replacementObjectiveVersionId) {
        throw new Error('replacementObjectiveVersionId is required for replacement amendment');
      }
      return this.replaceFlexibleObjective(objective, input.replacementObjectiveVersionId, reason, input.assignmentRuleRefs ?? []);
    }

    throw new Error('Unsupported objective amendment action');
  }

  private async ensurePredefinedObjectivesForAssignments(
    annualAssignments: Array<IAnnualAssignment | Record<string, any>>,
    termAssignments: Array<ITermAssignment | Record<string, any>>,
  ): Promise<void> {
    if (annualAssignments.length === 0 || termAssignments.length === 0) {
      return;
    }

    const templateVersionIds = Array.from(
      new Set(
        annualAssignments
          .map((item) => item.templateVersionId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (templateVersionIds.length === 0) {
      return;
    }

    const termCycleIds = Array.from(
      new Set(
        termAssignments
          .map((item) => item.cycleTermId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [templateVersions, existingObjectives, termCycles] = await Promise.all([
      PmsTemplateVersion.find({
        _id: { $in: templateVersionIds },
        isDeleted: false,
      }).lean(),
      Objective.find({
        termAssignmentId: { $in: termAssignments.map((item) => item._id) },
        isDeleted: false,
      })
        .select('termAssignmentId source templateObjectiveKey objectiveNo')
        .lean(),
      TermCycle.find({
        _id: { $in: termCycleIds },
        isDeleted: false,
      })
        .select('achievementSubmissionWindow termFinalizationWindow')
        .lean(),
    ]);

    const templateVersionMap = new Map(
      templateVersions.map((item) => [item._id.toString(), item]),
    );
    const termCycleMap = new Map(
      termCycles.map((item) => [item._id.toString(), item]),
    );
    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );
    const predefinedKeysByTermAssignment = new Map<string, Set<string>>();
    const maxObjectiveNoByTermAssignment = new Map<string, number>();

    for (const objective of existingObjectives) {
      const termAssignmentId = objective.termAssignmentId.toString();
      const currentMax = maxObjectiveNoByTermAssignment.get(termAssignmentId) ?? 0;
      maxObjectiveNoByTermAssignment.set(
        termAssignmentId,
        Math.max(currentMax, objective.objectiveNo ?? 0),
      );

      if (
        objective.source === ObjectiveSource.PREDEFINED &&
        typeof objective.templateObjectiveKey === 'string' &&
        objective.templateObjectiveKey.trim().length > 0
      ) {
        const existingKeys = predefinedKeysByTermAssignment.get(termAssignmentId) ?? new Set<string>();
        existingKeys.add(objective.templateObjectiveKey);
        predefinedKeysByTermAssignment.set(termAssignmentId, existingKeys);
      }
    }

    const actorId = this.toObjectId(this.requireActor().actorId, 'actorId');
    const now = new Date();
    const objectivePayloads: Array<Record<string, unknown>> = [];

    for (const termAssignment of termAssignments) {
      const annualAssignment = annualAssignmentMap.get(termAssignment.annualAssignmentId.toString());
      const templateVersion = annualAssignment?.templateVersionId
        ? templateVersionMap.get(annualAssignment.templateVersionId.toString())
        : undefined;
      const termCycle = termAssignment.cycleTermId
        ? termCycleMap.get(termAssignment.cycleTermId.toString())
        : undefined;
      const defaultDueDate =
        termCycle?.achievementSubmissionWindow?.endDate ||
        termCycle?.achievementSubmissionWindow?.dueDate ||
        termCycle?.termFinalizationWindow?.endDate ||
        undefined;
      const objectiveConfig = templateVersion
        ? this.resolveTemplateObjectiveConfig(templateVersion.sections ?? [], termAssignment.assessmentTermCode)
        : undefined;

      if (!objectiveConfig || objectiveConfig.predefinedObjectives.length === 0) {
        continue;
      }

      const termAssignmentId = termAssignment._id.toString();
      const existingKeys = predefinedKeysByTermAssignment.get(termAssignmentId) ?? new Set<string>();
      let nextObjectiveNo = maxObjectiveNoByTermAssignment.get(termAssignmentId) ?? 0;

      for (const predefinedObjective of objectiveConfig.predefinedObjectives) {
        if (predefinedObjective.isActive === false) {
          continue;
        }
        if (
          !this.matchesPredefinedObjectiveTerm(
            termAssignment.assessmentTermCode,
            predefinedObjective.applicableTerms,
          )
        ) {
          continue;
        }

        if (!predefinedObjective.key || !predefinedObjective.title?.trim()) {
          continue;
        }

        if (existingKeys.has(predefinedObjective.key)) {
          continue;
        }

        nextObjectiveNo += 1;
        existingKeys.add(predefinedObjective.key);

        objectivePayloads.push({
          termAssignmentId: termAssignment._id,
          annualAssignmentId: termAssignment.annualAssignmentId,
          cycleId: termAssignment.cycleId,
          templateVersionId: annualAssignment?.templateVersionId,
          assessmentTermCode: termAssignment.assessmentTermCode,
          employeeId: termAssignment.employeeId,
          assignedManagerId: termAssignment.assignedManagerId,
          objectiveNo: nextObjectiveNo,
          source: ObjectiveSource.PREDEFINED,
          templateObjectiveKey: predefinedObjective.key,
          isPredefined: true,
          title: predefinedObjective.title.trim(),
          description: predefinedObjective.description,
          targetMetric: predefinedObjective.kpi,
          targetValue: predefinedObjective.targetValue,
          targetDate: defaultDueDate,
          weightage: predefinedObjective.weightage,
          successCriteria: predefinedObjective.successCriteria,
          status: ObjectiveStatus.OBJECTIVE_APPROVED,
          attachments: [],
          createdByRole: 'SYSTEM',
          createdByUserId: actorId,
          createdBy: actorId,
          approvedAt: now,
          approvedBy: actorId,
        });
      }

      maxObjectiveNoByTermAssignment.set(termAssignmentId, nextObjectiveNo);
      predefinedKeysByTermAssignment.set(termAssignmentId, existingKeys);
    }

    if (objectivePayloads.length > 0) {
      await Objective.insertMany(objectivePayloads);
    }
  }

  private async buildObjectiveConfigMap(
    annualAssignments: Array<IAnnualAssignment | Record<string, any>>,
    termAssignments: Array<ITermAssignment | Record<string, any>>,
  ): Promise<Map<string, ObjectiveConfig>> {
    const templateVersionIds = Array.from(
      new Set(
        annualAssignments
          .map((item) => item.templateVersionId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const templateVersions = await PmsTemplateVersion.find({
      _id: { $in: templateVersionIds },
      isDeleted: false,
    }).lean();
    const templateVersionMap = new Map(
      templateVersions.map((item) => [item._id.toString(), item]),
    );

    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );
    const configMap = new Map<string, ObjectiveConfig>();

    for (const termAssignment of termAssignments) {
      const annualAssignment = annualAssignmentMap.get(termAssignment.annualAssignmentId.toString());
      const templateVersion = annualAssignment?.templateVersionId
        ? templateVersionMap.get(annualAssignment.templateVersionId.toString())
        : undefined;
      const config = templateVersion
        ? this.resolveTemplateObjectiveConfig(templateVersion.sections ?? [], termAssignment.assessmentTermCode)
        : undefined;
      configMap.set(
        termAssignment._id.toString(),
        config ?? this.defaultObjectiveConfig(),
      );
    }

    return configMap;
  }

  private async buildAchievementSubmissionEnabledMap(
    annualAssignments: Array<IAnnualAssignment | Record<string, any>>,
    termAssignments: Array<ITermAssignment | Record<string, any>>,
  ): Promise<Map<string, boolean>> {
    const templateVersionIds = Array.from(
      new Set(
        annualAssignments
          .map((item) => item.templateVersionId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const templateVersions = await PmsTemplateVersion.find({
      _id: { $in: templateVersionIds },
      isDeleted: false,
    }).lean();
    const templateVersionMap = new Map(
      templateVersions.map((item) => [item._id.toString(), item]),
    );
    const enabledMap = new Map<string, boolean>();
    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );

    for (const termAssignment of termAssignments) {
      const annualAssignment = annualAssignmentMap.get(termAssignment.annualAssignmentId.toString());
      const templateVersion = annualAssignment?.templateVersionId
        ? templateVersionMap.get(annualAssignment.templateVersionId.toString())
        : undefined;
      enabledMap.set(
        termAssignment._id.toString(),
        this.templateSupportsAchievementSubmission(
          templateVersion,
          termAssignment.assessmentTermCode,
        ),
      );
    }

    return enabledMap;
  }

  private templateSupportsAchievementSubmission(
    templateVersion?: Record<string, any>,
    assessmentTermCode?: AssessmentTermCodeValue,
  ): boolean {
    if (!templateVersion) return false;

    const section = (templateVersion.sections ?? []).find((section: ITemplateSection) => {
      if (section.sectionKey !== 'employee_achievement_submission') return false;
      if (!this.isTermLevelTemplateSection(section.level)) return false;
      const termScope = [
        ...(section.termScope ?? []),
        ...(section.repeatFor ?? []),
      ];
      if (
        assessmentTermCode &&
        !this.assessmentTermScopeMatches(termScope, assessmentTermCode)
      ) {
        return false;
      }
      return (section.fields ?? []).some((field) => field.fieldKey === 'achievement_items');
    });
    if (!section) return false;

    const metadata = (templateVersion.metadata ?? {}) as Record<string, any>;
    const config = (metadata.employeeAchievementConfig ?? {}) as Record<string, any>;
    const reviewFlowMode = metadata.reviewFlowMode === 'ACHIEVEMENT_THEN_MANAGER' || section
      ? 'ACHIEVEMENT_THEN_MANAGER'
      : 'MANAGER_ONLY';
    const employeeAchievementEnabled =
      config.employeeAchievementEnabled !== undefined
        ? Boolean(config.employeeAchievementEnabled)
        : true;

    return employeeAchievementEnabled && reviewFlowMode === 'ACHIEVEMENT_THEN_MANAGER';
  }

  private defaultObjectiveConfig(): ObjectiveConfig {
    return {
      mode: 'DYNAMIC',
      allowEmployeeCreated: true,
      allowManagerCreated: true,
      objectiveScoringPolicy: this.defaultObjectiveScoringPolicy(),
      predefinedObjectives: [],
      objectiveBuckets: this.defaultObjectiveBuckets(),
    };
  }

  private defaultObjectiveScoringPolicy(): ObjectiveConfig['objectiveScoringPolicy'] {
    return {
      objectiveScoringEnabled: false,
      objectiveScoringMode: ObjectiveScoringMode.CONTEXT_ONLY,
      objectiveSectionWeight: 0,
      perObjectiveScoreEntryAllowed: false,
      overallScoreEntryAllowed: false,
      noObjectiveScoringPolicy: 'NO_OBJECTIVES_NOT_APPLICABLE',
      reviewTimingPolicy: {},
      includedAssessmentTermGroupingPolicy: {},
      termAggregationPolicy: {},
      scoringValidationRules: {},
      predefinedObjectivesScoreable: true,
      managerCreatedScoreable: false,
      employeeCreatedScoreable: false,
      requireManagerApprovalForEmployeeScore: true,
      requireWeightageBeforeAchievement: true,
      allowManagerOverallForRemainingWeightage: true,
      actualAggregationMode: ObjectiveActualAggregationMode.LATEST_VALUE,
    };
  }

  private defaultObjectiveBuckets(): IObjectiveBucket[] {
    return [
      {
        bucketKey: 'template_predefined',
        label: 'Template Predefined Objectives',
        source: 'TEMPLATE_PREDEFINED',
        owner: 'SYSTEM',
        bucketWeightage: 100,
        rowWeightMode: 'FIXED_BY_TEMPLATE',
        editableBy: ['ADMIN'],
        requiresManagerApproval: false,
        autoApprove: true,
      },
      {
        bucketKey: 'employee_dynamic',
        label: 'Employee Objectives',
        source: 'EMPLOYEE_DYNAMIC',
        owner: 'EMPLOYEE',
        bucketWeightage: 0,
        rowWeightMode: 'OWNER_ENTERED',
        editableBy: ['EMPLOYEE'],
        requiresManagerApproval: true,
        autoApprove: false,
      },
      {
        bucketKey: 'manager_dynamic',
        label: 'Manager Objectives',
        source: 'MANAGER_DYNAMIC',
        owner: 'MANAGER',
        bucketWeightage: 0,
        rowWeightMode: 'OWNER_ENTERED',
        editableBy: ['MANAGER'],
        requiresManagerApproval: false,
        autoApprove: true,
      },
    ];
  }

  private resolveTemplateObjectiveConfig(
    sections: ITemplateSection[],
    assessmentTermCode: AssessmentTermCodeValue,
  ): ObjectiveConfig | undefined {
    const objectiveSection = sections.find((section) => {
      if (section.sectionType !== PmsTemplateSectionType.OBJECTIVES) return false;
      if (!this.isTermLevelTemplateSection(section.level)) return false;

      const allowedQuarters = [
        ...(section.termScope ?? []),
        ...(section.repeatFor ?? []),
      ];

      return this.assessmentTermScopeMatches(allowedQuarters, assessmentTermCode);
    });

    if (!objectiveSection?.objectiveConfig) {
      return undefined;
    }

    return {
      mode: objectiveSection.objectiveConfig.mode ?? 'DYNAMIC',
      allowEmployeeCreated: objectiveSection.objectiveConfig.allowEmployeeCreated !== false,
      allowManagerCreated: objectiveSection.objectiveConfig.allowManagerCreated !== false,
      objectiveScoringPolicy: {
        objectiveScoringEnabled:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringEnabled === true &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringMode !== ObjectiveScoringMode.CONTEXT_ONLY,
        objectiveScoringMode:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringEnabled === true
            ? objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringMode ??
              ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE
            : ObjectiveScoringMode.CONTEXT_ONLY,
        objectiveSectionWeight: Number(
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveSectionWeight ?? 0,
        ),
        perObjectiveScoreEntryAllowed:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringEnabled === true &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringMode ===
            ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.perObjectiveScoreEntryAllowed !== false,
        overallScoreEntryAllowed:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringEnabled === true &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringMode ===
            ObjectiveScoringMode.OVERALL_OBJECTIVE_SCORE &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.overallScoreEntryAllowed !== false,
        noObjectiveScoringPolicy:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.noObjectiveScoringPolicy ??
          'NO_OBJECTIVES_NOT_APPLICABLE',
        reviewTimingPolicy:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.reviewTimingPolicy ?? {},
        includedAssessmentTermGroupingPolicy:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.includedAssessmentTermGroupingPolicy ?? {},
        termAggregationPolicy:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.termAggregationPolicy ?? {},
        scoringValidationRules:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.scoringValidationRules ?? {},
        predefinedObjectivesScoreable:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringEnabled === true &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringMode !==
            ObjectiveScoringMode.CONTEXT_ONLY &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.predefinedObjectivesScoreable === true,
        managerCreatedScoreable:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringEnabled === true &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringMode !==
            ObjectiveScoringMode.CONTEXT_ONLY &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.managerCreatedScoreable === true,
        employeeCreatedScoreable:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringEnabled === true &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.objectiveScoringMode !==
            ObjectiveScoringMode.CONTEXT_ONLY &&
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.employeeCreatedScoreable === true,
        requireManagerApprovalForEmployeeScore:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.requireManagerApprovalForEmployeeScore !== false,
        requireWeightageBeforeAchievement:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.requireWeightageBeforeAchievement !== false,
        allowManagerOverallForRemainingWeightage:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.allowManagerOverallForRemainingWeightage !== false,
        actualAggregationMode:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.actualAggregationMode ??
          ObjectiveActualAggregationMode.LATEST_VALUE,
      },
      objectiveBuckets: objectiveSection.objectiveBuckets?.length
        ? objectiveSection.objectiveBuckets
        : this.defaultObjectiveBuckets(),
      predefinedObjectives: (objectiveSection.objectiveConfig.predefinedObjectives ?? []).map(
        (objective: ITemplatePredefinedObjective, index: number) => ({
          key: this.buildDeterministicTemplateObjectiveKey(
            objectiveSection.sectionKey,
            objective,
            index,
          ),
          title: objective.title?.trim(),
          description: objective.description,
          kpi: objective.kpi,
          targetValue: objective.targetValue,
          dueDate: objective.dueDate,
          weightage: objective.weightage,
          successCriteria: objective.successCriteria,
          attachmentAllowed: objective.attachmentAllowed === true,
          applyToAllQuarters: objective.applyToAllQuarters !== false,
          editable: objective.editable !== false,
          isActive: objective.isActive !== false,
          applicableTerms: this.normalizeScopedTerms(
            objective.termScope ?? objective.applicableTerms ?? objective.repeatFor,
          ),
        }),
      ),
    };
  }

  private buildDeterministicTemplateObjectiveKey(
    sectionKey: string,
    objective: ITemplatePredefinedObjective,
    index: number,
  ): string {
    const explicitKey = objective.objectiveKey?.trim();
    if (explicitKey) {
      return explicitKey;
    }

    const titleSlug = String(objective.title ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!titleSlug) {
      return '';
    }

    return `${sectionKey}__${titleSlug}__${index + 1}`;
  }

  private normalizeScopedTerms(
    quarters?: AssessmentTermCodeValue[],
  ): AssessmentTermCodeValue[] | undefined {
    if (!quarters?.length) {
      return undefined;
    }

    const validQuarters = Object.values(AssessmentTermCode) as AssessmentTermCodeValue[];
    const normalized = quarters.filter((quarter): quarter is AssessmentTermCodeValue =>
      validQuarters.includes(quarter as AssessmentTermCodeValue),
    );

    return Array.from(new Set(normalized));
  }

  private matchesPredefinedObjectiveTerm(
    assessmentTermCode: AssessmentTermCodeValue,
    applicableTerms?: AssessmentTermCodeValue[],
  ): boolean {
    if (typeof applicableTerms === 'undefined') {
      return true;
    }

    if (applicableTerms.length === 0) {
      return false;
    }

    return this.assessmentTermScopeMatches(applicableTerms, assessmentTermCode);
  }

  private isTermLevelTemplateSection(level?: unknown): boolean {
    const normalized = String(level ?? '').trim().toUpperCase();
    return normalized === 'TERM';
  }

  private assessmentTermScopeMatches(
    scopedTerms: AssessmentTermCodeValue[],
    termCode: AssessmentTermCodeValue,
  ): boolean {
    if (scopedTerms.length === 0) {
      return true;
    }

    return scopedTerms.includes(termCode);
  }

  private mapObjectiveRecord(
    objective: IObjective | Record<string, any>,
    annualAssignment: IAnnualAssignment | Record<string, any> | null | undefined,
    comments: Array<Record<string, any>>,
    objectiveValues: Array<Record<string, any>>,
    attachments: Array<Record<string, any>> = [],
  ): ObjectiveRecord {
    const objectiveId = objective._id.toString();
    const employeeId = objective.employeeId.toString();
    const managerId = objective.assignedManagerId.toString();
    const objectiveAttachments = attachments.length > 0
      ? attachments
      : (objective.attachments ?? []);

    return {
      id: objectiveId,
      backendId: objectiveId,
      assignmentId: objective.termAssignmentId.toString(),
      termAssignmentId: objective.termAssignmentId.toString(),
      employeeId,
      employeeName: this.getEmployeeName(annualAssignment, employeeId),
      managerId,
      managerName: this.getManagerName(annualAssignment, managerId),
      source: objective.source,
      templateObjectiveKey: objective.templateObjectiveKey,
      isPredefined: objective.source === ObjectiveSource.PREDEFINED,
      title: objective.title ?? '',
      description: objective.description ?? '',
      priority: objective.priority,
      expectedOutcome: objective.expectedOutcome ?? '',
      kpi: objective.targetMetric ?? '',
      targetValue: objective.targetValue ?? '',
      dueDate: objective.targetDate ? new Date(objective.targetDate).toISOString().slice(0, 10) : '',
      weightage: objective.weightage,
      successCriteria: objective.successCriteria ?? '',
      status: objective.status,
      createdByRole: objective.createdByRole,
      createdByUserId: objective.createdByUserId?.toString?.() ?? '',
      createdByName: this.resolveActorName(
        annualAssignment,
        objective.createdByUserId?.toString?.() ?? '',
        objective.createdByRole,
      ),
      comments: comments.map((comment) => ({
        id: comment._id.toString(),
        commentType: comment.commentType,
        commentText: comment.commentText,
        actorUserId: comment.actorUserId.toString(),
        actorRole: comment.actorRole,
        actorName: this.resolveActorName(
          annualAssignment,
          comment.actorUserId.toString(),
          comment.actorRole,
        ),
        createdAt: new Date(comment.createdAt).toISOString(),
        type: comment.commentType,
        actorId: comment.actorUserId.toString(),
      })),
      objectiveValues: objectiveValues.map((value) => ({
        templateFieldId: value.templateFieldId,
        fieldKey: value.fieldKey,
        sectionKey: value.sectionKey,
        roleCode: value.roleCode,
        actorUserId: value.actorUserId?.toString?.(),
        workflowStage: value.workflowStage,
        valueJson: value.valueJson,
        valueText: value.valueText,
        valueNumber: value.valueNumber,
        valueDate: value.valueDate ? new Date(value.valueDate).toISOString() : undefined,
        valueStatus: value.valueStatus,
      })),
      attachments: objectiveAttachments.map((attachment: Record<string, any>, index: number) => ({
        id: `${objectiveId}-${attachment.documentId ?? attachment.fileName ?? index}`,
        documentId: attachment.documentId,
        fileName: attachment.fileName ?? 'Attachment',
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        fileUrl: attachment.fileUrl,
        uploadedAt: attachment.uploadedAt
          ? new Date(attachment.uploadedAt).toISOString()
          : new Date(objective.createdAt).toISOString(),
        uploadedByName: attachment.uploadedBy
          ? this.resolveActorName(annualAssignment, attachment.uploadedBy.toString(), attachment.uploadedByRole)
          : undefined,
        uploadedByRole: attachment.uploadedByRole,
      })),
      submittedAt: objective.submittedAt ? new Date(objective.submittedAt).toISOString() : undefined,
      approvedAt: objective.approvedAt ? new Date(objective.approvedAt).toISOString() : undefined,
      returnedReason: objective.returnedReason,
      returnedAt: objective.returnedAt ? new Date(objective.returnedAt).toISOString() : undefined,
      objectiveMasterId: objective.objectiveMasterId?.toString?.(),
      objectiveVersionId: objective.objectiveVersionId?.toString?.(),
      assignmentRuleRefs: (objective.assignmentRuleRefs ?? []).map((id: any) => id.toString()),
      sourceType: objective.sourceType,
      objectiveSnapshot: objective.objectiveSnapshot,
      applicabilityStatus: objective.applicabilityStatus,
      amendmentReason: objective.amendmentReason,
      amendmentAction: objective.amendmentAction,
      amendmentAt: objective.amendmentAt ? new Date(objective.amendmentAt).toISOString() : undefined,
      amendmentBy: objective.amendmentBy?.toString?.(),
      replacementObjectiveId: objective.replacementObjectiveId?.toString?.(),
      updatedAt: new Date(objective.updatedAt).toISOString(),
      createdAt: new Date(objective.createdAt).toISOString(),
    };
  }

  private mapTemplateObjectiveValues(values?: Array<Record<string, any>>) {
    return (values ?? []).map((value) => ({
      templateFieldId: value.templateFieldId,
      fieldKey: value.fieldKey,
      sectionKey: value.sectionKey,
      roleCode: value.roleCode,
      actorUserId: value.actorUserId?.toString?.() ?? value.actorUserId,
      workflowStage: value.workflowStage,
      valueJson: value.valueJson,
      valueText: value.valueText,
      valueNumber: value.valueNumber,
      valueDate: value.valueDate ? new Date(value.valueDate).toISOString() : undefined,
      valueStatus: value.valueStatus,
    }));
  }

  private async resolveObjectiveFillabilityPolicy(
    termAssignment: ITermAssignment,
    objective?: IObjective,
  ): Promise<ObjectiveFillabilityPolicy> {
    const actor = this.requireActor();
    const templateVersionId = termAssignment.templateVersionId?.toString()
      || (await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString()))
        .templateVersionId?.toString();

    const basePolicy = {
      objectiveId: objective?._id.toString(),
      termAssignmentId: termAssignment._id.toString(),
      annualAssignmentId: termAssignment.annualAssignmentId.toString(),
      cycleId: termAssignment.cycleId?.toString(),
      employeeId: termAssignment.employeeId.toString(),
      assignedManagerId: termAssignment.assignedManagerId.toString(),
      assessmentTermCode: termAssignment.assessmentTermCode,
      actorRole: actor.actorRole,
      actorUserId: actor.actorId,
      workflowState: termAssignment.termState,
    };

    if (!templateVersionId) {
      return {
        ...basePolicy,
        canEditAnyField: true,
        source: 'LEGACY_NO_TEMPLATE',
        fields: [],
      };
    }

    const resolvedTemplate = await new PmsTemplateService(this.context).resolveTemplateVersion(
      templateVersionId,
      {
        role: actor.actorRole,
        workflowState: termAssignment.termState,
        quarter: termAssignment.assessmentTermCode,
        annualAssignmentId: termAssignment.annualAssignmentId.toString(),
        termAssignmentId: termAssignment._id.toString(),
      },
    );

    const fields = resolvedTemplate.sections.flatMap((section) =>
      section.fields.map((field) =>
        this.toObjectiveFillabilityFieldPolicy(
          field,
          section.key,
          actor.actorRole,
          termAssignment.termState,
        ),
      ),
    );

    return {
      ...basePolicy,
      canEditAnyField: fields.some((field) =>
        field.editable || (accessService.mapRole(actor.actorRole) === PmsRole.ADMIN && field.visible),
      ),
      source: 'TEMPLATE',
      fields,
    };
  }

  private toObjectiveFillabilityFieldPolicy(
    field: ResolvedTemplateField,
    sectionKey: string,
    roleCode: string,
    workflowState: string,
  ): ObjectiveFillabilityFieldPolicy {
    const editable = field.editable === true;
    return {
      templateFieldId: field.id,
      fieldKey: field.key,
      sectionKey,
      fieldLabel: field.label,
      fieldType: field.type,
      visible: field.visible !== false,
      editable,
      required: field.required === true,
      roleCode,
      workflowState,
      denialReason: editable ? undefined : 'Field is read-only for this role and workflow state',
    };
  }

  private assertObjectiveValuesFillable(
    values: Array<Record<string, any>>,
    policy: ObjectiveFillabilityPolicy,
  ): void {
    if (values.length === 0 || policy.source === 'LEGACY_NO_TEMPLATE') {
      return;
    }

    const actorRole = accessService.mapRole(policy.actorRole);
    const fieldPolicyByKey = new Map(
      policy.fields.map((field) => [`${field.sectionKey}:${field.fieldKey}`, field]),
    );

    for (const value of values) {
      const fieldKey = String(value.fieldKey ?? '').trim();
      const sectionKey = String(value.sectionKey ?? '').trim();
      if (!fieldKey || !sectionKey) {
        continue;
      }

      const fieldPolicy = fieldPolicyByKey.get(`${sectionKey}:${fieldKey}`);
      if (!fieldPolicy || fieldPolicy.visible === false) {
        throw new Error(`Field "${fieldKey}" is not visible for objective entry`);
      }

      const adminVisibleFallback = actorRole === PmsRole.ADMIN && fieldPolicy.visible === true;
      if (fieldPolicy.editable !== true && !adminVisibleFallback) {
        throw new Error(
          `Field "${fieldPolicy.fieldLabel || fieldKey}" is read-only for ${policy.actorRole} in ${policy.workflowState}`,
        );
      }
    }
  }

  private groupCommentsByObjective(comments: Array<Record<string, any>>) {
    const grouped = new Map<string, Array<Record<string, any>>>();
    for (const comment of comments) {
      const key = comment.objectiveId.toString();
      const bucket = grouped.get(key) ?? [];
      bucket.push(comment);
      grouped.set(key, bucket);
    }
    return grouped;
  }

  private groupObjectiveValuesByObjective(values: Array<Record<string, any>>) {
    const grouped = new Map<string, Array<Record<string, any>>>();
    for (const value of values) {
      const key = value.objectiveId.toString();
      const bucket = grouped.get(key) ?? [];
      bucket.push(value);
      grouped.set(key, bucket);
    }
    return grouped;
  }

  private groupAttachmentsByObjective(attachments: Array<Record<string, any>>) {
    const grouped = new Map<string, Array<Record<string, any>>>();
    for (const attachment of attachments) {
      const key = attachment.objectiveId.toString();
      const bucket = grouped.get(key) ?? [];
      bucket.push(attachment);
      grouped.set(key, bucket);
    }
    return grouped;
  }

  private mapTermWindows(termCycle?: Record<string, any>) {
    if (!termCycle) return undefined;

    const mapWindow = (window?: { startDate?: Date; endDate?: Date }) => {
      if (!window?.startDate || !window?.endDate) return undefined;
      return {
        startDate: new Date(window.startDate).toISOString(),
        endDate: new Date(window.endDate).toISOString(),
      };
    };

    const achievementSubmissionWindow = termCycle.achievementSubmissionWindow
      ? {
          enabled: termCycle.achievementSubmissionWindow.enabled === true,
          startDate: termCycle.achievementSubmissionWindow.startDate
            ? new Date(termCycle.achievementSubmissionWindow.startDate).toISOString()
            : undefined,
          endDate: termCycle.achievementSubmissionWindow.endDate
            ? new Date(termCycle.achievementSubmissionWindow.endDate).toISOString()
            : undefined,
          dueDate: termCycle.achievementSubmissionWindow.dueDate
            ? new Date(termCycle.achievementSubmissionWindow.dueDate).toISOString()
            : undefined,
          graceDays: termCycle.achievementSubmissionWindow.graceDays,
          reminderDaysBefore: termCycle.achievementSubmissionWindow.reminderDaysBefore,
          escalationDaysAfterDue: termCycle.achievementSubmissionWindow.escalationDaysAfterDue,
        }
      : undefined;

    return {
      objectiveSetting: mapWindow(termCycle.objectiveSettingWindow),
      objectiveApproval: mapWindow(termCycle.objectiveApprovalWindow),
      achievementSubmission: achievementSubmissionWindow,
      managerReview: mapWindow(termCycle.managerReviewWindow),
      quarterFinalization: mapWindow(termCycle.termFinalizationWindow),
    };
  }

  private getCycleName(
    annualAssignment?: IAnnualAssignment | Record<string, any> | null,
    annualCycle?: Record<string, any> | null,
  ): string {
    const snapshot = annualAssignment?.orgSnapshot as Record<string, any> | undefined;
    const assignmentRecord = annualAssignment as Record<string, any> | undefined;
    return String(
      annualCycle?.name ??
      annualCycle?.code ??
      snapshot?.cycleName ??
      snapshot?.cycleCode ??
      assignmentRecord?.cycleName ??
      assignmentRecord?.cycleCode ??
      assignmentRecord?.cycleId ??
      'Cycle',
    );
  }

  private getEmployeeName(
    annualAssignment: IAnnualAssignment | Record<string, any> | null | undefined,
    employeeId: string,
  ): string {
    return this.resolveActorName(
      annualAssignment,
      employeeId,
      PmsRole.EMPLOYEE,
    );
  }

  private getManagerName(
    annualAssignment: IAnnualAssignment | Record<string, any> | null | undefined,
    managerId: string,
  ): string {
    return this.resolveActorName(
      annualAssignment,
      managerId,
      PmsRole.MANAGER,
    );
  }

  private resolveActorName(
    annualAssignment: IAnnualAssignment | Record<string, any> | null | undefined,
    actorId: string,
    actorRole?: string,
  ): string {
    const employeeSnapshot = annualAssignment?.employeeSnapshot as Record<string, any> | undefined;
    const managerSnapshot = annualAssignment?.managerSnapshot as Record<string, any> | undefined;

    if (actorRole === 'SYSTEM') return 'Template Seed';

    if (
      annualAssignment?.employeeId?.toString?.() === actorId ||
      employeeSnapshot?.id === actorId ||
      employeeSnapshot?._id === actorId
    ) {
      return String(employeeSnapshot?.name ?? employeeSnapshot?.employeeName ?? 'Employee');
    }

    if (
      annualAssignment?.assignedManagerId?.toString?.() === actorId ||
      managerSnapshot?.id === actorId ||
      managerSnapshot?._id === actorId
    ) {
      return String(managerSnapshot?.name ?? managerSnapshot?.managerName ?? 'Manager');
    }

    if (actorRole && typeof actorRole === 'string') {
      const normalizedRole = accessService.mapRole(actorRole);
      if (normalizedRole === PmsRole.ADMIN) {
        return 'Admin';
      }
      if (normalizedRole === PmsRole.DIRECTOR) {
        return 'Director';
      }
      if (normalizedRole === PmsRole.MANAGEMENT) {
        return 'Management';
      }
    }

    return 'User';
  }

  private validateObjectiveInput(input: CreateObjectiveInput | UpdateObjectiveInput): void {
    if (!input.title?.trim()) {
      throw new Error('Objective title is required');
    }

    if (input.title.trim().length > 200) {
      throw new Error('Objective title cannot exceed 200 characters');
    }

    if (input.weightage !== undefined && (input.weightage < 0 || input.weightage > 100)) {
      throw new Error('Objective weightage must be between 0 and 100');
    }

    if (input.targetDate) {
      const targetDate = new Date(input.targetDate);
      if (Number.isNaN(targetDate.getTime())) {
        throw new Error('Invalid targetDate');
      }
    }
  }

  private validateContextObjectivePayload(
    input: Record<string, unknown>,
    source: ObjectiveSourceType,
    objectiveConfig?: ObjectiveConfig,
  ): void {
    if (
      source !== ObjectiveSource.EMPLOYEE_CREATED &&
      source !== ObjectiveSource.MANAGER_CREATED
    ) {
      return;
    }

    const scoreable = objectiveConfig
      ? this.objectiveSourceIsScoreable(source, objectiveConfig)
      : false;

    const blockedFields = [
      ...(scoreable ? [] : ['weightage']),
      'rating',
      'score',
      'weightedScore',
      'targetMetric',
      'kpi',
      'targetValue',
      'targetDate',
      'dueDate',
      'successCriteria',
    ];
    const sentBlockedField = blockedFields.find((field) =>
      Object.prototype.hasOwnProperty.call(input, field) &&
      input[field] !== undefined &&
      input[field] !== null &&
      input[field] !== '',
    );

    if (sentBlockedField) {
      throw new Error(
        `Employee-created and manager-created objectives are context-only; ${sentBlockedField} is not allowed`,
      );
    }

    if (input.scoringParticipation === true) {
      throw new Error(
        'Employee-created and manager-created objectives cannot participate in scoring',
      );
    }
  }

  private objectiveSourceIsScoreable(
    source: ObjectiveSourceType,
    objectiveConfig: ObjectiveConfig,
  ): boolean {
    if (source === ObjectiveSource.PREDEFINED) {
      return objectiveConfig.objectiveScoringPolicy.predefinedObjectivesScoreable;
    }
    if (source === ObjectiveSource.MANAGER_CREATED) {
      return objectiveConfig.objectiveScoringPolicy.managerCreatedScoreable;
    }
    if (source === ObjectiveSource.EMPLOYEE_CREATED) {
      return objectiveConfig.objectiveScoringPolicy.employeeCreatedScoreable;
    }
    return false;
  }

  private normalizeObjectivePriority(priority?: string): 'LOW' | 'MEDIUM' | 'HIGH' | undefined {
    if (priority === undefined || priority === null || !String(priority).trim()) {
      return undefined;
    }

    const normalized = String(priority).trim().toUpperCase();
    if (normalized !== 'LOW' && normalized !== 'MEDIUM' && normalized !== 'HIGH') {
      throw new Error('Objective priority must be LOW, MEDIUM, or HIGH');
    }

    return normalized;
  }

  private validateContextObjectiveRequiredFields(
    input: Pick<CreateObjectiveInput | UpdateObjectiveInput, 'title' | 'description' | 'priority' | 'expectedOutcome'>,
    source: ObjectiveSourceType,
  ): void {
    if (
      source !== ObjectiveSource.EMPLOYEE_CREATED &&
      source !== ObjectiveSource.MANAGER_CREATED
    ) {
      return;
    }

    const missingFields: string[] = [];
    if (!input.title?.trim()) missingFields.push('title');
    if (!input.description?.trim()) missingFields.push('description');
    if (!this.normalizeObjectivePriority(input.priority)) missingFields.push('priority');
    if (!input.expectedOutcome?.trim()) missingFields.push('expectedOutcome');

    if (missingFields.length > 0) {
      throw new Error(`Context objective requires: ${missingFields.join(', ')}`);
    }
  }

  private validateObjectiveForSubmit(objective: IObjective): void {
    if (
      objective.source === ObjectiveSource.EMPLOYEE_CREATED ||
      objective.source === ObjectiveSource.MANAGER_CREATED
    ) {
      this.validateContextObjectiveRequiredFields(
        {
          title: objective.title,
          description: objective.description,
          priority: objective.priority,
          expectedOutcome: objective.expectedOutcome,
        },
        objective.source as ObjectiveSourceType,
      );
      return;
    }

    if (!objective.description?.trim()) {
      throw new Error('Objective description is required on submit');
    }
    if (!objective.targetMetric?.trim()) {
      throw new Error('Objective KPI/measurement is required on submit');
    }
    if (!objective.targetValue?.trim()) {
      throw new Error('Objective target value is required on submit');
    }
    if (!objective.targetDate) {
      throw new Error('Objective due date is required on submit');
    }
    if (objective.weightage === undefined || objective.weightage === null) {
      throw new Error('Objective weightage is required on submit');
    }
    if (!objective.successCriteria?.trim()) {
      throw new Error('Objective success criteria is required on submit');
    }
  }

  private async persistObjectiveValues(
    objective: IObjective,
    termAssignment: ITermAssignment,
    objectiveValues: ObjectiveValueInput[],
    isSubmitted: boolean,
  ): Promise<void> {
    const actor = this.requireActor();
    const actorUserId = new Types.ObjectId(actor.actorId);
    const effectiveAt = isSubmitted
      ? (objective.submittedAt ?? new Date())
      : new Date();
    const baseValue = {
      objectiveId: objective._id,
      termAssignmentId: termAssignment._id,
      annualAssignmentId: termAssignment.annualAssignmentId,
      cycleId: termAssignment.cycleId,
      employeeId: termAssignment.employeeId,
      roleCode: actor.actorRole,
      actorUserId,
      workflowStage: 'OBJECTIVE_SETTING',
      valueStatus: isSubmitted ? 'ACTIVE' : 'DRAFT',
      submittedAt: isSubmitted ? effectiveAt : undefined,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };

    const valuesToCreate = this.normalizeObjectiveValues(
      objectiveValues,
      actorUserId,
      effectiveAt,
      baseValue,
      isSubmitted,
    );
    const policy = await this.resolveObjectiveFillabilityPolicy(termAssignment, objective);
    this.assertObjectiveValuesFillable(valuesToCreate, policy);

    await ObjectiveValue.deleteMany({ objectiveId: objective._id });
    if (valuesToCreate.length > 0) {
      await ObjectiveValue.insertMany(valuesToCreate);
    }
  }

  private normalizeObjectiveValues(
    objectiveValues: ObjectiveValueInput[],
    defaultActorUserId: Types.ObjectId,
    effectiveAt: Date,
    baseValue: Record<string, unknown>,
    isSubmitted: boolean,
  ) {
    return objectiveValues
      .filter((value) => value.fieldKey?.trim() && value.sectionKey?.trim())
      .map((objectiveValue) => ({
        ...baseValue,
        templateFieldId: objectiveValue.templateFieldId,
        fieldKey: objectiveValue.fieldKey,
        sectionKey: objectiveValue.sectionKey,
        roleCode: objectiveValue.roleCode ?? String(baseValue.roleCode ?? 'EMPLOYEE'),
        actorUserId: objectiveValue.actorUserId && Types.ObjectId.isValid(objectiveValue.actorUserId)
          ? new Types.ObjectId(objectiveValue.actorUserId)
          : defaultActorUserId,
        workflowStage: objectiveValue.workflowStage ?? String(baseValue.workflowStage ?? 'OBJECTIVE_SETTING'),
        valueJson: objectiveValue.valueJson,
        valueText: objectiveValue.valueText,
        valueNumber: objectiveValue.valueNumber,
        valueDate: objectiveValue.valueDate ? new Date(objectiveValue.valueDate) : undefined,
        valueStatus: objectiveValue.valueStatus ?? (isSubmitted ? 'ACTIVE' : 'DRAFT'),
        submittedAt: isSubmitted ? effectiveAt : undefined,
      }));
  }

  private async validateQuarterObjectiveRules(
    termAssignment: ITermAssignment,
    newWeightage?: number,
    editingObjectiveId?: string,
    source?: ObjectiveSourceType,
    objectiveConfig?: ObjectiveConfig,
    requireExactBucketTotal = false,
  ): Promise<void> {
    if (
      termAssignment.termState === TermWorkflowState.TERM_FINALIZED ||
      termAssignment.termState === TermWorkflowState.CLOSED_BY_ADMIN ||
      termAssignment.termState === TermWorkflowState.MANAGER_REVIEW_SUBMITTED
    ) {
      throw new Error('Cannot create or edit objectives for finalized quarters');
    }

    if (newWeightage === undefined) return;

    if (source && objectiveConfig?.objectiveBuckets?.length) {
      await this.validateBucketObjectiveWeightage(
        termAssignment,
        source,
        objectiveConfig,
        newWeightage,
        editingObjectiveId,
        requireExactBucketTotal,
      );
      await this.validateOverallScoreableObjectiveWeightage(
        termAssignment,
        objectiveConfig,
        newWeightage,
        editingObjectiveId,
      );
      return;
    }

    const existingObjectives = await Objective.find({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
      ...(editingObjectiveId ? { _id: { $ne: new Types.ObjectId(editingObjectiveId) } } : {}),
    }).select('weightage').lean();
    const currentWeightage = existingObjectives.reduce(
      (total, objective) => total + (objective.weightage ?? 0),
      0,
    );

    if (currentWeightage + newWeightage > 100) {
      throw new Error('Total objective weightage for the quarter cannot exceed 100');
    }
  }

  private async validateObjectiveWeightageBeforeClose(
    termAssignment: ITermAssignment,
    objectiveConfig: ObjectiveConfig,
  ): Promise<void> {
    if (!objectiveConfig.objectiveScoringPolicy.requireWeightageBeforeAchievement) {
      return;
    }

    const objectives = await Objective.find({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
    })
      .select('source weightage title')
      .lean();

    const scoreableObjectives = objectives.filter((objective) =>
      this.objectiveSourceIsScoreable(
        objective.source as ObjectiveSourceType,
        objectiveConfig,
      ),
    );
    const totalWeightage = scoreableObjectives.reduce(
      (sum, objective) => sum + Number(objective.weightage ?? 0),
      0,
    );
    const invalidWeightageObjective = scoreableObjectives.find((objective) => {
      const weightage = Number(objective.weightage);
      return !Number.isFinite(weightage) || weightage <= 0 || weightage > 100;
    });

    if (invalidWeightageObjective) {
      throw new Error('Each scoreable objective must have weightage greater than 0 and no more than 100 before achievement opens.');
    }

    if (Math.abs(totalWeightage - 100) > 0.001) {
      throw new Error(
        `Scoreable objective weightage must total 100% before achievement opens. Current total is ${totalWeightage}%.`,
      );
    }
  }

  private async validateOverallScoreableObjectiveWeightage(
    termAssignment: ITermAssignment,
    objectiveConfig: ObjectiveConfig,
    newWeightage: number,
    editingObjectiveId?: string,
  ): Promise<void> {
    const objectives = await Objective.find({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
      ...(editingObjectiveId ? { _id: { $ne: new Types.ObjectId(editingObjectiveId) } } : {}),
    })
      .select('source weightage')
      .lean();

    const currentWeightage = objectives.reduce((sum, objective) => {
      return this.objectiveSourceIsScoreable(
        objective.source as ObjectiveSourceType,
        objectiveConfig,
      )
        ? sum + Number(objective.weightage ?? 0)
        : sum;
    }, 0);

    if (currentWeightage + Number(newWeightage ?? 0) > 100) {
      throw new Error('Total scoreable objective weightage for the quarter cannot exceed 100');
    }
  }

  private async validateBucketObjectiveWeightage(
    termAssignment: ITermAssignment,
    source: ObjectiveSourceType,
    objectiveConfig: ObjectiveConfig,
    newWeightage: number,
    editingObjectiveId?: string,
    requireExactBucketTotal = false,
  ): Promise<void> {
    const bucket = this.resolveObjectiveBucket(source, objectiveConfig);
    if (!bucket) {
      return;
    }

    const existingObjectives = await Objective.find({
      termAssignmentId: termAssignment._id,
      source,
      isDeleted: false,
      ...(editingObjectiveId ? { _id: { $ne: new Types.ObjectId(editingObjectiveId) } } : {}),
    }).select('weightage').lean();

    const currentWeightage = existingObjectives.reduce(
      (total, objective) => total + Number(objective.weightage ?? 0),
      0,
    );
    const nextTotal = currentWeightage + Number(newWeightage ?? 0);

    if (requireExactBucketTotal) {
      if (Math.abs(nextTotal - 100) > 0.001) {
        throw new Error(
          `Objective row weightage inside "${bucket.label}" must total 100% before submission (currently ${nextTotal}%)`,
        );
      }
      return;
    }

    if (nextTotal > 100) {
      throw new Error(
        `Objective row weightage inside "${bucket.label}" cannot exceed 100% (currently ${nextTotal}%)`,
      );
    }
  }

  private resolveObjectiveBucket(
    source: ObjectiveSourceType,
    objectiveConfig: ObjectiveConfig,
  ): IObjectiveBucket | undefined {
    const bucketSource =
      source === ObjectiveSource.PREDEFINED
        ? 'TEMPLATE_PREDEFINED'
        : source === ObjectiveSource.MANAGER_CREATED
          ? 'MANAGER_DYNAMIC'
          : 'EMPLOYEE_DYNAMIC';

    return objectiveConfig.objectiveBuckets.find((bucket) => bucket.source === bucketSource);
  }

  private validateCreateAgainstConfig(
    source: ObjectiveSourceType,
    objectiveConfig: ObjectiveConfig,
  ): void {
    if (objectiveConfig.mode === 'PREDEFINED') {
      throw new Error('Only predefined objectives are allowed for this assignment');
    }

    if (source === ObjectiveSource.EMPLOYEE_CREATED && !objectiveConfig.allowEmployeeCreated) {
      throw new Error('Employee-created objectives are not allowed for this assignment');
    }

    if (source === ObjectiveSource.MANAGER_CREATED && !objectiveConfig.allowManagerCreated) {
      throw new Error('Manager-created objectives are not allowed for this assignment');
    }
  }

  private normalizeManagerObjectiveLibraryItem(
    objective: ManagerObjectiveLibraryDraftInput,
    index: number,
  ): IManagerObjectiveLibraryItem {
    const title = objective.title?.trim();
    if (!title) {
      throw new Error(`Objective ${index + 1}: title is required`);
    }
    if (!objective.description?.trim()) {
      throw new Error(`Objective ${index + 1}: description is required`);
    }
    const priority = this.normalizeObjectivePriority(objective.priority);
    if (!priority) {
      throw new Error(`Objective ${index + 1}: priority is required`);
    }
    if (!objective.expectedOutcome?.trim()) {
      throw new Error(`Objective ${index + 1}: expected outcome is required`);
    }
    this.validateContextObjectivePayload(
      objective as unknown as Record<string, unknown>,
      ObjectiveSource.MANAGER_CREATED,
    );

    const existing = objective as ManagerObjectiveLibraryDraftInput & {
      createdAt?: Date | string;
      updatedAt?: Date | string;
    };
    const now = new Date();
    const createdAt = existing.createdAt ? new Date(existing.createdAt) : now;

    return {
      localId: objective.localId?.trim() || new Types.ObjectId().toString(),
      source: ObjectiveSource.MANAGER_CREATED,
      title,
      description: objective.description?.trim(),
      priority,
      expectedOutcome: objective.expectedOutcome?.trim(),
      kpi: undefined,
      targetValue: undefined,
      dueDate: undefined,
      weightage: undefined,
      successCriteria: undefined,
      attachments: (objective.attachments ?? []) as unknown as Record<string, unknown>[],
      objectiveValues: (objective.objectiveValues ?? []) as unknown as Record<string, unknown>[],
      createdAt: Number.isNaN(createdAt.getTime()) ? now : createdAt,
      updatedAt: now,
    };
  }

  private mapManagerObjectiveLibraryItem(
    objective: IManagerObjectiveLibraryItem,
  ): IManagerObjectiveLibraryItem {
    return {
      localId: objective.localId,
      source: ObjectiveSource.MANAGER_CREATED,
      title: objective.title,
      description: objective.description ?? '',
      priority: objective.priority,
      expectedOutcome: objective.expectedOutcome ?? '',
      kpi: '',
      targetValue: '',
      dueDate: '',
      weightage: undefined,
      successCriteria: '',
      attachments: objective.attachments ?? [],
      objectiveValues: objective.objectiveValues ?? [],
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    };
  }

  private resolveBulkManagerObjectiveInputs(
    input: BulkCreateManagerObjectiveInput,
  ): BulkManagerObjectiveDraftInput[] {
    if (Array.isArray(input.objectives) && input.objectives.length > 0) {
      return input.objectives;
    }

    const {
      termAssignmentIds: _termAssignmentIds,
      objectives: _objectives,
      weightageAdjustments: _weightageAdjustments,
      objectiveWeightageOverrides: _objectiveWeightageOverrides,
      ...objectiveInput
    } = input;
    return [objectiveInput as BulkManagerObjectiveDraftInput];
  }

  private async validateUpdateAgainstConfig(
    objective: IObjective,
    objectiveConfig: ObjectiveConfig,
    nextWeightage?: number,
  ): Promise<void> {
    if (
      objective.source === ObjectiveSource.EMPLOYEE_CREATED &&
      !objectiveConfig.allowEmployeeCreated
    ) {
      throw new Error('Employee-created objectives are not allowed for this assignment');
    }

    if (
      objective.source === ObjectiveSource.MANAGER_CREATED &&
      !objectiveConfig.allowManagerCreated
    ) {
      throw new Error('Manager-created objectives are not allowed for this assignment');
    }

    const termAssignment = await this.getTermAssignment(objective.termAssignmentId.toString());
    await this.validateQuarterObjectiveRules(
      termAssignment,
      nextWeightage,
      objective._id.toString(),
      objective.source as ObjectiveSourceType,
      objectiveConfig,
      false,
    );
  }

  private assertPredefinedObjectiveValueOnlyUpdate(
    objective: IObjective,
    input: UpdateObjectiveInput,
  ): void {
    const normalizedTargetDate = (value?: Date | string) => {
      if (!value) return '';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
    };

    const titleMatches =
      input.title === undefined || String(input.title).trim() === String(objective.title || '').trim();
    const descriptionMatches =
      input.description === undefined ||
      String(input.description || '').trim() === String(objective.description || '').trim();
    const targetMetricMatches =
      input.targetMetric === undefined ||
      String(input.targetMetric || '').trim() === String(objective.targetMetric || '').trim();
    const targetValueMatches =
      input.targetValue === undefined ||
      String(input.targetValue || '').trim() === String(objective.targetValue || '').trim();
    const targetDateMatches =
      input.targetDate === undefined ||
      normalizedTargetDate(input.targetDate) === normalizedTargetDate(objective.targetDate);
    const weightageMatches =
      input.weightage === undefined || Number(input.weightage) === Number(objective.weightage);
    const successCriteriaMatches =
      input.successCriteria === undefined ||
      String(input.successCriteria || '').trim() === String(objective.successCriteria || '').trim();
    const attachmentsEmpty = (input.attachments ?? []).length === 0;

    if (
      !titleMatches ||
      !descriptionMatches ||
      !targetMetricMatches ||
      !targetValueMatches ||
      !targetDateMatches ||
      !weightageMatches ||
      !successCriteriaMatches ||
      !attachmentsEmpty
    ) {
      throw new Error('Predefined objective core fields are read-only; only template field values can be updated');
    }
  }

  private assertRegularObjectiveEditAccess(objective: IObjective): void {
    const actor = this.requireActor();
    const mappedRole = accessService.mapRole(actor.actorRole);

    if (mappedRole === PmsRole.ADMIN) {
      throw new Error('Admin must use approved correction flow for objective overrides');
    }

    if (objective.status === ObjectiveStatus.OBJECTIVE_APPROVED) {
      throw new Error('Approved objectives are read-only');
    }

    if (
      objective.status !== ObjectiveStatus.OBJECTIVE_DRAFT &&
      objective.status !== ObjectiveStatus.OBJECTIVE_REVISION_REQUIRED
    ) {
      throw new Error('Only draft or revision-required objectives can be edited');
    }

    if (objective.source === ObjectiveSource.MANAGER_CREATED) {
      throw new Error('Employee cannot edit manager-created objective');
    }

    if (actor.actorId !== objective.employeeId.toString()) {
      throw new Error('Only the employee can edit this objective');
    }
  }

  private assertEmployeeDraftVisibility(objective: IObjective): void {
    if (
      objective.source !== ObjectiveSource.EMPLOYEE_CREATED ||
      objective.status !== ObjectiveStatus.OBJECTIVE_DRAFT
    ) {
      return;
    }

    const actor = this.requireActor();
    const mappedRole = accessService.mapRole(actor.actorRole);
    if (mappedRole === PmsRole.ADMIN || actor.actorId === objective.employeeId.toString()) {
      return;
    }

    throw new Error('Objective not found');
  }

  private async getNextObjectiveNo(termAssignmentId: Types.ObjectId): Promise<number> {
    const lastObjective = await Objective.findOne({
      termAssignmentId,
      isDeleted: false,
    })
      .sort({ objectiveNo: -1 })
      .select('objectiveNo')
      .lean();

    return (lastObjective?.objectiveNo ?? 0) + 1;
  }

  private async ensureQuarterState(
    termAssignmentId: string,
    currentState: TermWorkflowState,
    targetState: TermWorkflowState,
  ): Promise<void> {
    if (currentState === targetState) return;

    if (currentState === TermWorkflowState.NOT_STARTED) {
      await transitionTermAssignmentState(
        termAssignmentId,
        TermWorkflowState.OBJECTIVE_SETTING_OPEN,
        this.requireActor(),
      );
    }

    const refreshedTermAssignment = await this.getTermAssignment(termAssignmentId);
    if (refreshedTermAssignment.termState === targetState) return;

    await this.transitionQuarterIfNeeded(
      termAssignmentId,
      targetState,
    );
  }

  private async transitionQuarterIfNeeded(
    termAssignmentId: string,
    targetState: TermWorkflowState,
    reason?: string,
  ): Promise<void> {
    const termAssignment = await this.getTermAssignment(termAssignmentId);
    if (termAssignment.termState === targetState) {
      return;
    }

    if (termAssignment.termState === TermWorkflowState.OBJECTIVE_SETTING_OPEN) {
      return;
    }

    const allowedTransitions: Partial<Record<TermWorkflowState, TermWorkflowState[]>> = {
      [TermWorkflowState.NOT_STARTED]: [TermWorkflowState.OBJECTIVE_SETTING_OPEN],
      [TermWorkflowState.OBJECTIVE_SETTING_OPEN]: [
        TermWorkflowState.OBJECTIVE_DRAFT,
        TermWorkflowState.OBJECTIVE_SUBMITTED,
        TermWorkflowState.OBJECTIVE_APPROVED,
      ],
      [TermWorkflowState.OBJECTIVE_DRAFT]: [TermWorkflowState.OBJECTIVE_SUBMITTED],
      [TermWorkflowState.OBJECTIVE_SUBMITTED]: [
        TermWorkflowState.OBJECTIVE_APPROVED,
        TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
      ],
      [TermWorkflowState.OBJECTIVE_REVISION_REQUIRED]: [TermWorkflowState.OBJECTIVE_SUBMITTED],
      [TermWorkflowState.OBJECTIVE_APPROVED]: [
        TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
        TermWorkflowState.MANAGER_REVIEW_OPEN,
      ],
      [TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN]: [
        TermWorkflowState.MANAGER_REVIEW_OPEN,
      ],
    };

    const nextStates = allowedTransitions[termAssignment.termState] ?? [];
    if (!nextStates.includes(targetState)) {
      return;
    }

    await transitionTermAssignmentState(
      termAssignmentId,
      targetState,
      this.requireActor(),
      reason,
    );
  }

  private async updateTermStateAfterApproval(termAssignmentId: string): Promise<void> {
    const termAssignment = await this.getTermAssignment(termAssignmentId);
    if (termAssignment.termState === TermWorkflowState.OBJECTIVE_SETTING_OPEN) {
      return;
    }

    const objectives = await Objective.find({
      termAssignmentId,
      isDeleted: false,
    })
      .select('status')
      .lean();

    if (objectives.length === 0) {
      return;
    }

    const allApproved = objectives.every(
      (objective) => objective.status === ObjectiveStatus.OBJECTIVE_APPROVED,
    );

    if (!allApproved) {
      return;
    }

    await this.transitionQuarterIfNeeded(
      termAssignmentId,
      TermWorkflowState.OBJECTIVE_APPROVED,
      'All submitted objectives are approved; waiting for manager/admin objective-setting close',
    );
  }

  private async reopenObjectiveSettingIfLastEmployeeDraftDeleted(termAssignmentId: string): Promise<void> {
    const termAssignment = await this.getTermAssignment(termAssignmentId);
    if (termAssignment.termState !== TermWorkflowState.OBJECTIVE_DRAFT) {
      return;
    }

    const remainingEmployeeInProgressObjective = await Objective.exists({
      termAssignmentId: termAssignment._id,
      source: ObjectiveSource.EMPLOYEE_CREATED,
      status: {
        $in: [
          ObjectiveStatus.OBJECTIVE_DRAFT,
          ObjectiveStatus.OBJECTIVE_SUBMITTED,
        ],
      },
      isDeleted: false,
    });

    if (remainingEmployeeInProgressObjective) {
      return;
    }

    const actor = this.requireActor();
    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');
    const previousState = termAssignment.termState;

    termAssignment.previousTermState = previousState;
    termAssignment.termState = TermWorkflowState.OBJECTIVE_SETTING_OPEN;
    termAssignment.lastTransitionAt = new Date();
    termAssignment.lastTransitionBy = actorObjectId;
    termAssignment.lastTransitionRole = actor.actorRole;
    termAssignment.lastTransitionReason = 'Last employee-created draft objective deleted';
    termAssignment.updatedBy = actorObjectId;
    termAssignment.version += 1;
    await termAssignment.save();

    await this.audit(
      'PMS_OBJECTIVE_SETTING_REOPENED_AFTER_DRAFT_DELETE',
      'TERM_ASSIGNMENT',
      termAssignment._id.toString(),
      { termState: previousState },
      { termState: termAssignment.termState },
      'Last employee-created draft objective deleted',
    );
  }

  private async getObjectiveConfigForAssignment(
    annualAssignment: IAnnualAssignment,
    termAssignment: ITermAssignment,
  ): Promise<ObjectiveConfig> {
    const templateVersionId = annualAssignment.templateVersionId?.toString();
    if (!templateVersionId) {
      return this.defaultObjectiveConfig();
    }

    const templateVersion = await PmsTemplateVersion.findById(templateVersionId).lean();
    if (!templateVersion) {
      return this.defaultObjectiveConfig();
    }

    return this.resolveTemplateObjectiveConfig(
      templateVersion.sections ?? [],
      termAssignment.assessmentTermCode,
    ) ?? this.defaultObjectiveConfig();
  }

  private async createCommentRecord(
    objective: IObjective,
    commentText: string,
    commentType: string,
  ) {
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');

    const comment = await ObjectiveComment.create({
      objectiveId: objective._id,
      termAssignmentId: objective.termAssignmentId,
      annualAssignmentId: objective.annualAssignmentId,
      cycleId: objective.cycleId,
      assessmentTermCode: objective.assessmentTermCode,
      employeeId: objective.employeeId,
      commentType,
      commentText,
      actorUserId: actorId,
      actorRole: actor.actorRole,
      createdBy: actorId,
    });

    await this.audit(
      'PMS_OBJECTIVE_COMMENT_ADDED',
      'OBJECTIVE_COMMENT',
      comment._id.toString(),
      undefined,
      comment.toObject(),
    );

    return comment;
  }

  private async replaceObjectiveAttachments(
    objective: IObjective,
    attachments: ObjectiveAttachmentInput[],
    actorRole: string,
  ): Promise<void> {
    await ObjectiveAttachment.updateMany(
      { objectiveId: objective._id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          updatedBy: objective.updatedBy ?? objective.createdByUserId,
        },
      },
    );

    if (attachments.length === 0) return;

    await ObjectiveAttachment.insertMany(
      attachments.map((attachment) => ({
        objectiveId: objective._id,
        fileName: attachment.fileName,
        fileUrl: attachment.fileUrl,
        fileType: attachment.fileType,
        fileSize: attachment.fileSize,
        documentId: attachment.documentId,
        uploadedBy: attachment.uploadedBy && Types.ObjectId.isValid(attachment.uploadedBy)
          ? new Types.ObjectId(attachment.uploadedBy)
          : objective.updatedBy ?? objective.createdByUserId,
        uploadedByRole: attachment.uploadedByRole ?? actorRole,
        visibilityRules: attachment.visibilityRules ?? {},
        versionNo: 1,
        uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : new Date(),
        createdBy: objective.updatedBy ?? objective.createdByUserId,
      })),
    );
  }

  private normalizeAttachments(attachments: ObjectiveAttachmentInput[]) {
    return attachments.map((attachment) => ({
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
      documentId: attachment.documentId,
      uploadedBy: attachment.uploadedBy && Types.ObjectId.isValid(attachment.uploadedBy)
        ? new Types.ObjectId(attachment.uploadedBy)
        : undefined,
      uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : undefined,
      uploadedByRole: attachment.uploadedByRole,
    }));
  }

  private mapExistingAttachments(
    attachments: Array<Record<string, any>>,
  ): ObjectiveAttachmentInput[] {
    return (attachments ?? []).map((attachment) => ({
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
      documentId: attachment.documentId,
      uploadedBy: attachment.uploadedBy?.toString?.(),
      uploadedByRole: attachment.uploadedByRole,
      uploadedAt: attachment.uploadedAt,
    }));
  }

  private async assertObjectiveOwnerPermission(
    sourceType: string,
    metadataOrOwnerId?: string | {
      ownerUserId?: Types.ObjectId | string;
      ownerRole?: string;
      ownerDepartment?: string;
      ownerScope?: Record<string, unknown>;
    },
  ): Promise<void> {
    const metadata = typeof metadataOrOwnerId === 'string'
      ? { ownerUserId: metadataOrOwnerId }
      : metadataOrOwnerId;
    const allowed = await this.matchesObjectivePermissionMetadata(sourceType, {
      userId: metadata?.ownerUserId,
      role: metadata?.ownerRole,
      department: metadata?.ownerDepartment,
      scope: metadata?.ownerScope,
    });

    if (!allowed) {
      throw new Error('Only Admin or the Objective Owner can perform this action');
    }
  }

  private async assertObjectiveAssignerPermission(
    sourceType: string,
    metadata: {
      assignerUserId?: Types.ObjectId | string;
      assignerRole?: string;
      assignerDepartment?: string;
      assignerScope?: Record<string, unknown>;
    },
  ): Promise<void> {
    const allowed = await this.matchesObjectivePermissionMetadata(sourceType, {
      userId: metadata.assignerUserId,
      role: metadata.assignerRole,
      department: metadata.assignerDepartment,
      scope: metadata.assignerScope,
    });

    if (!allowed) {
      throw new Error('Only Admin or the Objective Assigner can assign this objective version');
    }
  }

  private async assertObjectiveReviewerPermission(
    sourceType: string,
    metadata: {
      reviewerUserId?: Types.ObjectId | string;
      reviewerRole?: string;
      reviewerDepartment?: string;
      reviewerScope?: Record<string, unknown>;
    },
  ): Promise<void> {
    const allowed = await this.matchesObjectivePermissionMetadata(sourceType, {
      userId: metadata.reviewerUserId,
      role: metadata.reviewerRole,
      department: metadata.reviewerDepartment,
      scope: metadata.reviewerScope,
    });

    if (!allowed) {
      throw new Error('Only Admin or the Objective Reviewer can review this objective version');
    }
  }

  private async canViewObjectiveVersionHistory(
    sourceType: string,
    master: {
      ownerUserId?: Types.ObjectId | string;
      ownerRole?: string;
      ownerDepartment?: string;
      ownerScope?: Record<string, unknown>;
    },
    versions: Array<{
      ownerUserId?: Types.ObjectId | string;
      ownerRole?: string;
      ownerDepartment?: string;
      ownerScope?: Record<string, unknown>;
      assignerUserId?: Types.ObjectId | string;
      assignerRole?: string;
      assignerDepartment?: string;
      assignerScope?: Record<string, unknown>;
      reviewerUserId?: Types.ObjectId | string;
      reviewerRole?: string;
      reviewerDepartment?: string;
      reviewerScope?: Record<string, unknown>;
    }>,
  ): Promise<boolean> {
    if (await this.matchesObjectivePermissionMetadata(sourceType, {
      userId: master.ownerUserId,
      role: master.ownerRole,
      department: master.ownerDepartment,
      scope: master.ownerScope,
    })) {
      return true;
    }

    for (const version of versions) {
      if (await this.matchesObjectivePermissionMetadata(sourceType, {
        userId: version.ownerUserId,
        role: version.ownerRole,
        department: version.ownerDepartment,
        scope: version.ownerScope,
      })) {
        return true;
      }
      if (await this.matchesObjectivePermissionMetadata(sourceType, {
        userId: version.assignerUserId,
        role: version.assignerRole,
        department: version.assignerDepartment,
        scope: version.assignerScope,
      })) {
        return true;
      }
      if (await this.matchesObjectivePermissionMetadata(sourceType, {
        userId: version.reviewerUserId,
        role: version.reviewerRole,
        department: version.reviewerDepartment,
        scope: version.reviewerScope,
      })) {
        return true;
      }
    }

    return false;
  }

  private mergeObjectiveOwnerMetadata(
    version: {
      ownerUserId?: Types.ObjectId | string;
      ownerRole?: string;
      ownerDepartment?: string;
      ownerScope?: Record<string, unknown>;
    },
    master: {
      ownerUserId?: Types.ObjectId | string;
      ownerRole?: string;
      ownerDepartment?: string;
      ownerScope?: Record<string, unknown>;
    },
  ) {
    return {
      ownerUserId: version.ownerUserId ?? master.ownerUserId,
      ownerRole: version.ownerRole ?? master.ownerRole,
      ownerDepartment: version.ownerDepartment ?? master.ownerDepartment,
      ownerScope: version.ownerScope ?? master.ownerScope,
    };
  }

  private async matchesObjectivePermissionMetadata(
    sourceType: string,
    metadata: {
      userId?: Types.ObjectId | string;
      role?: string;
      department?: string;
      scope?: Record<string, unknown>;
    },
  ): Promise<boolean> {
    const actor = this.requireActor();
    const mappedRole = accessService.mapRole(actor.actorRole);

    if (mappedRole === PmsRole.ADMIN) {
      return true;
    }

    if (metadata.userId?.toString?.() === actor.actorId) {
      return true;
    }

    const configuredRole = this.normalizeObjectivePermissionRole(metadata.role);
    if (!configuredRole) {
      return false;
    }

    if (configuredRole !== this.normalizeObjectivePermissionRole(actor.actorRole)) {
      return false;
    }

    if (configuredRole === 'DEPARTMENT_HEAD') {
      return this.matchesDepartmentHeadObjectiveScope(sourceType, metadata);
    }

    const metadataDepartment = metadata.department?.trim();
    if (metadataDepartment) {
      const actorDepartment = await this.getActorDepartmentId();
      if (!this.sameScopeValue(actorDepartment, metadataDepartment)) {
        return false;
      }
    }

    return true;
  }

  private async matchesDepartmentHeadObjectiveScope(
    sourceType: string,
    metadata: {
      department?: string;
      scope?: Record<string, unknown>;
    },
  ): Promise<boolean> {
    if (sourceType !== FlexibleObjectiveSourceType.DEPARTMENT_OBJECTIVE) {
      return false;
    }

    const configuredDepartment = String(
      metadata.department ??
      metadata.scope?.department ??
      metadata.scope?.departmentId ??
      '',
    ).trim();

    if (!configuredDepartment) {
      return false;
    }

    const actorDepartment = await this.getActorDepartmentId();
    return this.sameScopeValue(actorDepartment, configuredDepartment);
  }

  private async getActorDepartmentId(): Promise<string> {
    const actor = this.requireActor();
    const contextDepartment = this.context.user?.departmentId?.trim();
    if (contextDepartment) {
      return contextDepartment;
    }

    const actorUser = await User.findById(actor.actorId).select('departmentId').lean();
    return String(actorUser?.departmentId ?? '').trim();
  }

  private normalizeObjectivePermissionRole(role?: string): string {
    const normalized = String(role ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (['DEPARTMENT_HEAD', 'DEPT_HEAD', 'HOD', 'HEAD_OF_DEPARTMENT'].includes(normalized)) {
      return 'DEPARTMENT_HEAD';
    }
    return normalized;
  }

  private sameScopeValue(left?: string, right?: string): boolean {
    return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
  }

  private requireFlexibleObjectiveSourceType(
    sourceType: FlexibleObjectiveSourceTypeType,
  ): FlexibleObjectiveSourceTypeType {
    if (!Object.values(FlexibleObjectiveSourceType).includes(sourceType)) {
      throw new Error('Valid objective source type is required');
    }

    return sourceType;
  }

  private assertObjectiveMasterCreatableSourceType(sourceType: FlexibleObjectiveSourceTypeType): void {
    if (
      sourceType !== FlexibleObjectiveSourceType.COMPANY_OBJECTIVE &&
      sourceType !== FlexibleObjectiveSourceType.DEPARTMENT_OBJECTIVE
    ) {
      throw new Error('Objective Master can be created only for Company/Global or Department objectives.');
    }
  }

  private async generateObjectiveMasterCode(
    sourceType: FlexibleObjectiveSourceTypeType,
  ): Promise<string> {
    const prefix =
      sourceType === FlexibleObjectiveSourceType.DEPARTMENT_OBJECTIVE
        ? 'D-OBJ'
        : 'G-OBJ';

    const latest = await ObjectiveMaster.findOne({
      code: { $regex: `^${prefix}-\\d+$` },
    })
      .sort({ createdAt: -1, code: -1 })
      .select('code')
      .lean();

    let nextNumber = 1;
    const latestCode = String(latest?.code ?? '');
    const match = latestCode.match(/-(\d+)$/);
    if (match) {
      nextNumber = Number(match[1]) + 1;
    }

    let code = `${prefix}-${String(nextNumber).padStart(3, '0')}`;
    while (await ObjectiveMaster.exists({ code })) {
      nextNumber += 1;
      code = `${prefix}-${String(nextNumber).padStart(3, '0')}`;
    }

    return code;
  }

  private normalizeObjectiveOwnerInput(
    input: ObjectiveOwnerInput,
    actor: { actorId: string; actorRole: string },
  ) {
    return {
      ownerUserId: input.ownerUserId
        ? this.toObjectId(input.ownerUserId, 'ownerUserId')
        : this.toObjectId(actor.actorId, 'actorId'),
      ownerRole: input.ownerRole?.trim() || actor.actorRole,
      ownerDepartment: input.ownerDepartment?.trim() || undefined,
      ownerScope: input.ownerScope ?? {},
    };
  }

  private normalizeObjectiveAssignerInput(
    input: ObjectiveAssignerInput,
    actor: { actorId: string; actorRole: string },
  ) {
    return {
      assignerUserId: input.assignerUserId
        ? this.toObjectId(input.assignerUserId, 'assignerUserId')
        : this.toObjectId(actor.actorId, 'actorId'),
      assignerRole: input.assignerRole?.trim() || actor.actorRole,
      assignerDepartment: input.assignerDepartment?.trim() || undefined,
      assignerScope: input.assignerScope ?? {},
    };
  }

  private normalizeObjectiveReviewerInput(
    input: ObjectiveReviewerInput,
  ) {
    return {
      reviewerUserId: input.reviewerUserId
        ? this.toObjectId(input.reviewerUserId, 'reviewerUserId')
        : undefined,
      reviewerRole: input.reviewerRole?.trim() || undefined,
      reviewerDepartment: input.reviewerDepartment?.trim() || undefined,
      reviewerScope: input.reviewerScope ?? {},
    };
  }

  private normalizeObjectiveMasterVersionDetails(
    input: ObjectiveMasterVersionDetailsInput,
    actor: { actorId: string; actorRole: string },
  ) {
    const title = input.title?.trim();
    if (!title) {
      throw new Error('Objective title is required');
    }

    const objectiveType = this.normalizeObjectiveMasterType(input.objectiveType);
    const scoreable = false;
    const approvedWeightage = undefined;

    return {
      objectiveType,
      sheetLayout: objectiveType === ObjectiveMasterType.SHEET
        ? this.normalizeObjectiveSheetLayout(input.sheetLayout)
        : undefined,
      title,
      description: input.description?.trim() || undefined,
      measurementGuidance: input.measurementGuidance?.trim() || undefined,
      targetValue: input.targetValue?.trim() || undefined,
      targetDescription: input.targetDescription?.trim() || undefined,
      targetDirection:
        objectiveType === ObjectiveMasterType.SHEET
          ? ObjectiveTargetDirection.NOT_APPLICABLE
          : input.targetDirection && Object.values(ObjectiveTargetDirection).includes(input.targetDirection)
            ? input.targetDirection
            : undefined,
      priority: input.priority?.trim().toUpperCase() || undefined,
      attachmentPolicy: input.attachmentPolicy && Object.values(ObjectiveAttachmentPolicy).includes(input.attachmentPolicy)
        ? input.attachmentPolicy
        : ObjectiveAttachmentPolicy.OPTIONAL,
      scoreable,
      defaultScoringEligibilityRef: undefined,
      approvedWeightage,
      applicableTermLabels: this.normalizeApplicableTermLabels(input.applicableTermLabels),
      ...this.normalizeObjectiveOwnerInput(input, actor),
      ...this.normalizeObjectiveAssignerInput(input, actor),
      ...this.normalizeObjectiveReviewerInput(input),
    };
  }

  private normalizeObjectiveMasterVersionPatch(
    input: UpdateObjectiveMasterVersionInput,
    actor: { actorId: string; actorRole: string },
  ) {
    const patch: Record<string, unknown> = {};
    const nextObjectiveType =
      input.objectiveType !== undefined
        ? this.normalizeObjectiveMasterType(input.objectiveType)
        : undefined;

    if (nextObjectiveType !== undefined) patch.objectiveType = nextObjectiveType;
    if (input.sheetLayout !== undefined || nextObjectiveType === ObjectiveMasterType.SHEET) {
      patch.sheetLayout =
        nextObjectiveType === ObjectiveMasterType.SIMPLE
          ? undefined
          : this.normalizeObjectiveSheetLayout(input.sheetLayout);
    }
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) {
        throw new Error('Objective title is required');
      }
      patch.title = title;
    }
    if (input.description !== undefined) patch.description = input.description?.trim() || undefined;
    if (input.measurementGuidance !== undefined) patch.measurementGuidance = input.measurementGuidance?.trim() || undefined;
    if (input.targetValue !== undefined) patch.targetValue = input.targetValue?.trim() || undefined;
    if (input.targetDescription !== undefined) patch.targetDescription = input.targetDescription?.trim() || undefined;
    if (input.targetDirection !== undefined) {
      if (input.targetDirection && !Object.values(ObjectiveTargetDirection).includes(input.targetDirection)) {
        throw new Error('Invalid target direction');
      }
      patch.targetDirection = input.targetDirection || undefined;
    }
    if (nextObjectiveType === ObjectiveMasterType.SHEET) {
      patch.scoreable = false;
      patch.approvedWeightage = undefined;
      patch.targetDirection = ObjectiveTargetDirection.NOT_APPLICABLE;
    } else if (nextObjectiveType === ObjectiveMasterType.SIMPLE) {
      patch.sheetLayout = undefined;
    }
    patch.scoreable = false;
    patch.approvedWeightage = undefined;
    patch.defaultScoringEligibilityRef = undefined;
    if (input.priority !== undefined) patch.priority = input.priority?.trim().toUpperCase() || undefined;
    if (input.attachmentPolicy !== undefined) {
      if (input.attachmentPolicy && !Object.values(ObjectiveAttachmentPolicy).includes(input.attachmentPolicy)) {
        throw new Error('Invalid attachment policy');
      }
      patch.attachmentPolicy = input.attachmentPolicy || undefined;
    }
    if (input.applicableTermLabels !== undefined) {
      patch.applicableTermLabels = this.normalizeApplicableTermLabels(input.applicableTermLabels);
    }
    if (input.ownerUserId !== undefined) {
      patch.ownerUserId = input.ownerUserId ? this.toObjectId(input.ownerUserId, 'ownerUserId') : undefined;
    }
    if (input.ownerRole !== undefined) patch.ownerRole = input.ownerRole?.trim() || actor.actorRole;
    if (input.ownerDepartment !== undefined) patch.ownerDepartment = input.ownerDepartment?.trim() || undefined;
    if (input.ownerScope !== undefined) patch.ownerScope = input.ownerScope ?? {};
    if (input.assignerUserId !== undefined) {
      patch.assignerUserId = input.assignerUserId ? this.toObjectId(input.assignerUserId, 'assignerUserId') : undefined;
    }
    if (input.assignerRole !== undefined) patch.assignerRole = input.assignerRole?.trim() || actor.actorRole;
    if (input.assignerDepartment !== undefined) patch.assignerDepartment = input.assignerDepartment?.trim() || undefined;
    if (input.assignerScope !== undefined) patch.assignerScope = input.assignerScope ?? {};
    if (input.reviewerUserId !== undefined) {
      patch.reviewerUserId = input.reviewerUserId ? this.toObjectId(input.reviewerUserId, 'reviewerUserId') : undefined;
    }
    if (input.reviewerRole !== undefined) patch.reviewerRole = input.reviewerRole?.trim() || undefined;
    if (input.reviewerDepartment !== undefined) patch.reviewerDepartment = input.reviewerDepartment?.trim() || undefined;
    if (input.reviewerScope !== undefined) patch.reviewerScope = input.reviewerScope ?? {};

    return patch;
  }

  private normalizeObjectiveMasterType(
    objectiveType?: ObjectiveMasterTypeType | string,
  ): ObjectiveMasterTypeType {
    if (objectiveType && Object.values(ObjectiveMasterType).includes(objectiveType as ObjectiveMasterTypeType)) {
      return objectiveType as ObjectiveMasterTypeType;
    }

    return ObjectiveMasterType.SIMPLE;
  }

  private normalizeObjectiveSheetLayout(
    layout?: ObjectiveSheetLayoutInput,
  ): NormalizedObjectiveSheetLayout {
    const allowedTypes = new Set(['TEXT', 'LONG_TEXT', 'NUMBER', 'PERCENTAGE', 'DATE', 'DROPDOWN', 'FORMULA']);
    const allowedWidths = new Set(['SMALL', 'MEDIUM', 'LARGE']);
    const allowedFormulaKinds = new Set(['ACTUAL', 'GAP']);
    const allowedFormulaModes = new Set([
      'SUM_TERMS',
      'AVERAGE_TERMS',
      'LATEST_FILLED_TERM',
      'TARGET_MINUS_ACTUAL',
      'ACTUAL_MINUS_TARGET',
      'BM_MINUS_ACTUAL',
      'ACTUAL_MINUS_BM',
      'ABSOLUTE_DIFFERENCE',
      'CUSTOM',
    ]);
    const fallback = this.defaultObjectiveSheetLayout();
    const inputColumns = Array.isArray(layout?.columns) ? layout.columns : fallback.columns;
    const inputRows = Array.isArray(layout?.rows) ? layout.rows : fallback.rows;
    const inputHeaderGroups = Array.isArray(layout?.headerGroups)
      ? layout.headerGroups
      : fallback.headerGroups;
    const inputRowGroups = Array.isArray(layout?.rowGroups)
      ? layout.rowGroups
      : fallback.rowGroups;
    const inputFormulas = Array.isArray(layout?.formulas)
      ? layout.formulas
      : fallback.formulas;

    const columns: NormalizedObjectiveSheetLayout['columns'] = [];
    inputColumns.forEach((column, index) => {
        const label = String(column?.label ?? '').trim();
        if (!label) return;
        const type = String(column?.type ?? 'TEXT').trim().toUpperCase();
        const width = String(column?.width ?? 'MEDIUM').trim().toUpperCase();
        const options = Array.isArray(column?.options)
          ? Array.from(new Set(column.options.map((option) => String(option ?? '').trim()).filter(Boolean)))
          : [];
        if (type === 'DROPDOWN' && options.length === 0) {
          throw new Error(`Dropdown column "${label}" requires at least one option.`);
        }
        columns.push({
          id: this.normalizeSheetKey(column?.id, `col_${index + 1}`),
          label,
          type: allowedTypes.has(type) ? type : 'TEXT',
          width: allowedWidths.has(width) ? width : 'MEDIUM',
          required: column?.required === true,
          defaultValue: String(column?.defaultValue ?? '').trim() || undefined,
          helpText: String(column?.helpText ?? '').trim() || undefined,
          options: type === 'DROPDOWN' ? options : undefined,
        });
      });

    const rows: NormalizedObjectiveSheetLayout['rows'] = [];
    inputRows.forEach((row, index) => {
        const label = String(row?.label ?? '').trim();
        if (!label) return;
        rows.push({
          id: this.normalizeSheetKey(row?.id, `row_${index + 1}`),
          label,
          group: String(row?.group ?? '').trim() || undefined,
        });
      });

    if (!columns.length) {
      throw new Error('Objective table requires at least one column.');
    }
    if (!rows.length) {
      throw new Error('Objective table requires at least one row.');
    }

    const columnIndexByKey = new Map<string, number>();
    columns.forEach((column, index) => {
      columnIndexByKey.set(this.normalizeSheetKey(column.id, ''), index);
      columnIndexByKey.set(this.normalizeSheetKey(column.label, ''), index);
    });
    const headerGroups: NormalizedObjectiveSheetLayout['headerGroups'] = [];
    inputHeaderGroups.forEach((group, index) => {
      const label = String(group?.label ?? '').trim();
      if (!label) return;
      const startColumnId = this.normalizeSheetKey(group?.startColumnId, '');
      const endColumnId = this.normalizeSheetKey(group?.endColumnId, '');
      const startIndex = columnIndexByKey.get(startColumnId);
      const endIndex = columnIndexByKey.get(endColumnId);
      if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) {
        throw new Error(`Header group "${label}" has an invalid column range.`);
      }
      headerGroups.push({
        id: this.normalizeSheetKey(group?.id, `group_${index + 1}`),
        label,
        startColumnId: columns[startIndex].id,
        endColumnId: columns[endIndex].id,
      });
    });

    const rowIndexByKey = new Map<string, number>();
    rows.forEach((row, index) => {
      rowIndexByKey.set(this.normalizeSheetKey(row.id, ''), index);
      rowIndexByKey.set(this.normalizeSheetKey(row.label, ''), index);
    });
    const rowGroupCandidates: Array<NormalizedObjectiveSheetLayout['rowGroups'][number] & {
      levelKey: string;
      startIndex: number;
      endIndex: number;
    }> = [];
    inputRowGroups.forEach((group, index) => {
      const levelLabel = String(group?.levelLabel ?? '').trim();
      const label = String(group?.label ?? '').trim();
      if (!levelLabel && !label) return;
      if (!levelLabel || !label) {
        throw new Error(`Row group ${index + 1} requires both group column and label.`);
      }
      const startRowId = this.normalizeSheetKey(group?.startRowId, '');
      const endRowId = this.normalizeSheetKey(group?.endRowId, '');
      const startIndex = rowIndexByKey.get(startRowId);
      const endIndex = rowIndexByKey.get(endRowId);
      if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) {
        throw new Error(`Row group "${label}" has an invalid row range.`);
      }
      const levelKey = levelLabel.trim().toLowerCase();
      rowGroupCandidates.push({
        id: this.normalizeSheetKey(group?.id, `row_group_${index + 1}`),
        levelLabel,
        levelKey,
        label,
        startRowId: rows[startIndex].id,
        endRowId: rows[endIndex].id,
        startIndex,
        endIndex,
      });
    });
    const occupiedRowGroupRanges = new Map<string, number>();
    const rowGroups: NormalizedObjectiveSheetLayout['rowGroups'] = [];
    rowGroupCandidates
      .sort((left, right) => left.levelKey.localeCompare(right.levelKey) || left.startIndex - right.startIndex)
      .forEach((group) => {
        const occupiedUntil = occupiedRowGroupRanges.get(group.levelKey) ?? -1;
        if (group.startIndex <= occupiedUntil) {
          throw new Error(`Row group "${group.label}" overlaps another group in "${group.levelLabel}".`);
        }
        occupiedRowGroupRanges.set(group.levelKey, group.endIndex);
        rowGroups.push({
          id: group.id,
          levelLabel: group.levelLabel,
          label: group.label,
          startRowId: group.startRowId,
          endRowId: group.endRowId,
        });
      });

    type CalculationColumnType = 'NUMBER' | 'PERCENTAGE';
    const isCalculationColumnType = (type?: string): type is CalculationColumnType =>
      type === 'NUMBER' || type === 'PERCENTAGE';
    const resolveFormulaTargetIndex = (formula: any): number | undefined =>
      columnIndexByKey.get(this.normalizeSheetKey(formula?.targetColumnId, ''));
    const resolveCustomFormulaType = (
      formula: any,
      targetColumnIndex?: number,
      visitedColumnIds = new Set<string>(),
    ): CalculationColumnType | undefined => {
      return validateCustomFormula(formula, targetColumnIndex, visitedColumnIds).type;
    };
    const validateCustomFormula = (
      formula: any,
      targetColumnIndex?: number,
      visitedColumnIds = new Set<string>(),
    ): { type?: CalculationColumnType; error?: string } => {
      const expression = String(formula?.customExpression ?? '').trim();
      if (!expression) return { error: 'Enter a formula using available columns.' };

      const candidates = columns
        .map((column, columnIndex) => ({ column, columnIndex }))
        .filter(({ columnIndex }) => columnIndex !== targetColumnIndex)
        .map(({ column, columnIndex }) => ({
          column,
          columnIndex,
          type: resolveCalculationType(
            columnIndex,
            new Set([
              ...visitedColumnIds,
              targetColumnIndex !== undefined ? columns[targetColumnIndex]?.id : '',
            ].filter(Boolean)),
          ),
        }))
        .filter((item): item is { column: typeof columns[number]; columnIndex: number; type: CalculationColumnType } => Boolean(item.type))
        .sort((a, b) =>
          Math.max(b.column.label.length, b.column.id.length) -
          Math.max(a.column.label.length, a.column.id.length),
        );

      const referencedTypes: CalculationColumnType[] = [];
      let index = 0;
      let lastToken: 'operand' | 'operator' | 'open' | 'close' | '' = '';
      let openParens = 0;
      const lowerExpression = expression.toLowerCase();

      while (index < expression.length) {
        const char = expression[index];
        if (/\s/.test(char)) {
          index += 1;
          continue;
        }

        if (/[+\-*/]/.test(char)) {
          if (!lastToken || lastToken === 'operator' || lastToken === 'open') return { error: 'Add a column before the operator.' };
          lastToken = 'operator';
          index += 1;
          continue;
        }

        if (char === '(') {
          if (lastToken === 'operand' || lastToken === 'close') return { error: 'Add an operator before opening brackets.' };
          openParens += 1;
          lastToken = 'open';
          index += 1;
          continue;
        }

        if (char === ')') {
          if (openParens === 0 || lastToken === 'operator' || lastToken === 'open' || !lastToken) return { error: 'Close brackets after a complete value.' };
          openParens -= 1;
          lastToken = 'close';
          index += 1;
          continue;
        }

        const numberMatch = expression.slice(index).match(/^\d+(\.\d+)?/);
        if (numberMatch) {
          if (lastToken === 'operand' || lastToken === 'close') return { error: 'Add an operator between values.' };
          lastToken = 'operand';
          index += numberMatch[0].length;
          continue;
        }

        const matched = candidates.find(({ column }) =>
          columnReferenceMatches(lowerExpression, index, column.label) ||
          columnReferenceMatches(lowerExpression, index, column.id),
        );
        if (!matched) return { error: 'Use only available columns, numbers, operators, and brackets.' };
        if (lastToken === 'operand' || lastToken === 'close') return { error: 'Add an operator between selected columns.' };

        referencedTypes.push(matched.type);
        lastToken = 'operand';
        index += columnReferenceLength(lowerExpression, index, matched.column.label, matched.column.id);
      }

      if (openParens > 0) return { error: 'Close all brackets in the formula.' };
      if (lastToken === 'operator' || lastToken === 'open') return { error: 'Complete the formula after the operator.' };

      const uniqueTypes = new Set(referencedTypes);
      if (!referencedTypes.length) return { error: 'Select at least one Number or Percentage column.' };
      if (uniqueTypes.size > 1) return { error: 'Custom formula columns must all be Number or all be Percentage.' };
      return { type: referencedTypes[0] };
    };
    const columnReferenceMatches = (expression: string, index: number, reference: string): boolean => {
      const normalizedReference = reference.toLowerCase();
      if (!normalizedReference || !expression.startsWith(normalizedReference, index)) return false;
      const nextChar = expression[index + normalizedReference.length] || '';
      return !/[a-z0-9_]/i.test(nextChar);
    };
    const columnReferenceLength = (expression: string, index: number, label: string, id: string): number => {
      const lowerLabel = label.toLowerCase();
      return expression.startsWith(lowerLabel, index) ? label.length : id.length;
    };
    const resolveCalculationType = (
      columnIndex: number | undefined,
      visitedColumnIds = new Set<string>(),
    ): CalculationColumnType | undefined => {
      if (columnIndex === undefined) return undefined;
      const column = columns[columnIndex];
      if (!column) return undefined;
      if (isCalculationColumnType(column.type)) return column.type;
      if (column.type !== 'FORMULA' || visitedColumnIds.has(column.id)) return undefined;

      visitedColumnIds.add(column.id);
      const linkedFormula = inputFormulas.find((formula) => resolveFormulaTargetIndex(formula) === columnIndex);
      if (!linkedFormula) return undefined;
      const kind = String(linkedFormula?.kind ?? '').trim().toUpperCase();
      const mode = String(linkedFormula?.mode ?? '').trim().toUpperCase();
      if (!allowedFormulaKinds.has(kind) || !allowedFormulaModes.has(mode)) {
        return undefined;
      }
      if (mode === 'CUSTOM') return resolveCustomFormulaType(linkedFormula, columnIndex, new Set(visitedColumnIds));

      if (kind === 'ACTUAL') {
        const sourceTypes = Array.isArray(linkedFormula?.sourceColumnIds)
          ? linkedFormula.sourceColumnIds.map((columnId: unknown) =>
              resolveCalculationType(
                columnIndexByKey.get(this.normalizeSheetKey(columnId, '')),
                new Set(visitedColumnIds),
              ),
            )
          : [];
        const uniqueTypes = new Set(sourceTypes.filter(Boolean));
        return sourceTypes.length > 0 && sourceTypes.every(Boolean) && uniqueTypes.size === 1
          ? [...uniqueTypes][0] as CalculationColumnType
          : undefined;
      }

      const leftType = resolveCalculationType(
        columnIndexByKey.get(this.normalizeSheetKey(linkedFormula?.leftColumnId, '')),
        new Set(visitedColumnIds),
      );
      const rightType = resolveCalculationType(
        columnIndexByKey.get(this.normalizeSheetKey(linkedFormula?.rightColumnId, '')),
        new Set(visitedColumnIds),
      );
      return leftType && rightType && leftType === rightType ? leftType : undefined;
    };

    const formulas: NormalizedObjectiveSheetLayout['formulas'] = [];
    inputFormulas.forEach((formula, index) => {
      const kind = String(formula?.kind ?? '').trim().toUpperCase();
      const label = String(formula?.label ?? '').trim() || kind;
      const mode = String(formula?.mode ?? '').trim().toUpperCase();
      const targetColumnKey = this.normalizeSheetKey(formula?.targetColumnId, '');
      const targetIndex = columnIndexByKey.get(targetColumnKey);
      if (!allowedFormulaKinds.has(kind) || !allowedFormulaModes.has(mode) || targetIndex === undefined) {
        throw new Error(`Formula "${label}" has an invalid configuration.`);
      }

      const sourceColumnIds = Array.isArray(formula?.sourceColumnIds)
        ? formula.sourceColumnIds
            .map((columnId) => columnIndexByKey.get(this.normalizeSheetKey(columnId, '')))
            .filter((columnIndex): columnIndex is number => columnIndex !== undefined)
            .map((columnIndex) => columns[columnIndex].id)
        : [];
      const leftIndex = columnIndexByKey.get(this.normalizeSheetKey(formula?.leftColumnId, ''));
      const rightIndex = columnIndexByKey.get(this.normalizeSheetKey(formula?.rightColumnId, ''));

      if (kind === 'ACTUAL' && mode !== 'CUSTOM' && sourceColumnIds.length === 0) {
        throw new Error(`Actual formula "${label}" needs at least one source column.`);
      }
      if (kind === 'GAP' && mode !== 'CUSTOM' && (leftIndex === undefined || rightIndex === undefined)) {
        throw new Error(`Gap formula "${label}" needs valid left and right columns.`);
      }
      if (columns[targetIndex].type !== 'FORMULA') {
        throw new Error(`Formula "${label}" must target a calculated column.`);
      }
      if (mode === 'CUSTOM') {
        const customValidation = validateCustomFormula(formula, targetIndex);
        if (!customValidation.type) {
          throw new Error(`Custom formula "${label}" is invalid. ${customValidation.error ?? 'Use valid formula syntax.'}`);
        }
      }
      if (kind === 'ACTUAL' && mode !== 'CUSTOM') {
        const sourceTypes = sourceColumnIds.map((sourceColumnId) =>
          resolveCalculationType(columnIndexByKey.get(this.normalizeSheetKey(sourceColumnId, ''))),
        );
        const uniqueTypes = new Set(sourceTypes.filter(Boolean));
        if (sourceTypes.some((sourceType) => !sourceType)) {
          throw new Error(`Actual formula "${label}" can use only Number or Percentage columns.`);
        }
        if (uniqueTypes.size > 1) {
          throw new Error(`Actual formula "${label}" source columns must all be Number or all be Percentage.`);
        }
      }
      if (kind === 'GAP' && mode !== 'CUSTOM') {
        const leftType = resolveCalculationType(leftIndex);
        const rightType = resolveCalculationType(rightIndex);
        if (!leftType || !rightType) {
          throw new Error(`Gap formula "${label}" can use only Number or Percentage columns.`);
        }
        if (leftType !== rightType) {
          throw new Error(`Gap formula "${label}" columns must both be Number or both be Percentage.`);
        }
      }

      formulas.push({
        id: this.normalizeSheetKey(formula?.id, `formula_${index + 1}`),
        kind,
        label,
        targetColumnId: columns[targetIndex].id,
        mode,
        sourceColumnIds: sourceColumnIds.length ? sourceColumnIds : undefined,
        leftColumnId: leftIndex !== undefined ? columns[leftIndex].id : undefined,
        rightColumnId: rightIndex !== undefined ? columns[rightIndex].id : undefined,
        customExpression: String(formula?.customExpression ?? '').trim() || undefined,
      });
    });

    const allowedFillActors = new Set(['EMPLOYEE', 'MANAGER', 'REVIEWER', 'ADMIN', 'SYSTEM']);
    const allowedFillAccess = new Set(['HIDDEN', 'VIEW', 'FILL']);
    const allowedFillLockRules = new Set(['NONE', 'LOCK_AFTER_SUBMIT', 'EDITABLE_UNTIL_MANAGER_REVIEW']);
    const allowedAvailabilityTerms = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'Y1']);
    const fillPermissionMap = new Map(
      this.defaultObjectiveSheetFillPermissions(columns).map((permission) => [
        `${permission.columnId}:${permission.actor}`,
        permission,
      ]),
    );

    const inputFillPermissions = Array.isArray(layout?.fillPermissions) ? layout.fillPermissions : [];
    inputFillPermissions.forEach((permission: NonNullable<ObjectiveSheetLayoutInput['fillPermissions']>[number], index: number) => {
      const columnIndex = columnIndexByKey.get(this.normalizeSheetKey(permission?.columnId, ''));
      if (columnIndex === undefined) {
        throw new Error(`Fill permission ${index + 1} references an invalid column.`);
      }
      const column = columns[columnIndex];
      const actor = String(permission?.actor ?? '').trim().toUpperCase();
      const access = String(permission?.access ?? '').trim().toUpperCase();
      const lockRule = String(permission?.lockRule ?? 'NONE').trim().toUpperCase() || 'NONE';
      if (!allowedFillActors.has(actor) || !allowedFillAccess.has(access) || !allowedFillLockRules.has(lockRule)) {
        throw new Error(`Fill permission for "${column.label}" has an invalid actor, access, or lock rule.`);
      }
      if (permission?.required === true && access !== 'FILL') {
        throw new Error(`Fill permission for "${column.label}" can be required only when access is Can fill.`);
      }
      if (lockRule !== 'NONE' && access !== 'FILL') {
        throw new Error(`Fill permission for "${column.label}" can use lock rules only when access is Can fill.`);
      }
      if (column.type === 'FORMULA' && actor !== 'SYSTEM' && access === 'FILL') {
        throw new Error(`Formula column "${column.label}" can only be filled by the system.`);
      }
      if (column.type === 'FORMULA' && actor === 'SYSTEM' && access !== 'FILL') {
        throw new Error(`Formula column "${column.label}" must remain system calculated.`);
      }
      if (column.type !== 'FORMULA' && actor === 'SYSTEM' && access === 'FILL') {
        throw new Error(`System can fill only calculated formula columns. "${column.label}" must use View or Hidden for System.`);
      }

      fillPermissionMap.set(`${column.id}:${actor}`, {
        id: this.normalizeSheetKey(permission?.id, `perm_${column.id}_${actor.toLowerCase()}`),
        columnId: column.id,
        actor,
        access,
        required: access === 'FILL' ? permission?.required === true : false,
        lockRule: access === 'FILL' ? lockRule : 'NONE',
      });
    });

    const fillPermissions = Array.from(fillPermissionMap.values()).sort((a, b) => {
      const columnDelta = columns.findIndex((column) => column.id === a.columnId) -
        columns.findIndex((column) => column.id === b.columnId);
      if (columnDelta !== 0) return columnDelta;
      return ['EMPLOYEE', 'MANAGER', 'REVIEWER', 'ADMIN', 'SYSTEM'].indexOf(a.actor) -
        ['EMPLOYEE', 'MANAGER', 'REVIEWER', 'ADMIN', 'SYSTEM'].indexOf(b.actor);
    });

    const termAvailabilityMap = new Map(
      this.defaultObjectiveSheetTermAvailability(columns).map((availability) => [
        availability.columnId,
        availability,
      ]),
    );
    const inputTermAvailability = Array.isArray(layout?.termAvailability) ? layout.termAvailability : [];
    inputTermAvailability.forEach((availability: NonNullable<ObjectiveSheetLayoutInput['termAvailability']>[number], index: number) => {
      const columnIndex = columnIndexByKey.get(this.normalizeSheetKey(availability?.columnId, ''));
      if (columnIndex === undefined) {
        throw new Error(`Term availability ${index + 1} references an invalid column.`);
      }
      const terms = Array.isArray(availability?.terms)
        ? Array.from(new Set(availability.terms.map((term) => String(term ?? '').trim().toUpperCase()).filter(Boolean)))
        : [];
      if (terms.length === 0) {
        throw new Error(`Term availability for "${columns[columnIndex].label}" requires at least one term.`);
      }
      if (terms.some((term) => !allowedAvailabilityTerms.has(term))) {
        throw new Error(`Term availability for "${columns[columnIndex].label}" contains an invalid term.`);
      }
      termAvailabilityMap.set(columns[columnIndex].id, {
        id: this.normalizeSheetKey(availability?.id, `term_${columns[columnIndex].id}`),
        columnId: columns[columnIndex].id,
        terms,
      });
    });

    const termAvailability = Array.from(termAvailabilityMap.values()).sort((a, b) =>
      columns.findIndex((column) => column.id === a.columnId) -
      columns.findIndex((column) => column.id === b.columnId),
    );

    return { columns, rows, headerGroups, rowGroups, formulas, fillPermissions, termAvailability };
  }

  private normalizeSheetKey(value: unknown, fallback: string): string {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || fallback;
  }

  private defaultObjectiveSheetFillPermissions(
    columns: NormalizedObjectiveSheetLayout['columns'],
  ): NormalizedObjectiveSheetLayout['fillPermissions'] {
    const actors = ['EMPLOYEE', 'MANAGER', 'REVIEWER', 'ADMIN', 'SYSTEM'];
    return columns.flatMap((column) =>
      actors.map((actor) => {
        const isFormula = column.type === 'FORMULA';
        const isSystem = actor === 'SYSTEM';
        const isEmployee = actor === 'EMPLOYEE';
        return {
          id: `perm_${column.id}_${actor.toLowerCase()}`,
          columnId: column.id,
          actor,
          access: isFormula ? (isSystem ? 'FILL' : 'VIEW') : (isSystem ? 'HIDDEN' : isEmployee ? 'FILL' : 'VIEW'),
          required: !isFormula && isEmployee && column.required === true,
          lockRule: !isFormula && isEmployee ? 'LOCK_AFTER_SUBMIT' : 'NONE',
        };
      }),
    );
  }

  private inferObjectiveSheetColumnTerms(column: Pick<NormalizedObjectiveSheetLayout['columns'][number], 'id' | 'label'>): string[] {
    const allTerms = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'Y1'];
    const text = `${column.id || ''} ${column.label || ''}`.toUpperCase();
    const matchedTerms = allTerms.filter((term) =>
      new RegExp(`(^|[^A-Z0-9])${term}([^A-Z0-9]|$)`).test(text),
    );
    return matchedTerms.length > 0 ? matchedTerms : allTerms;
  }

  private defaultObjectiveSheetTermAvailability(
    columns: NormalizedObjectiveSheetLayout['columns'],
  ): NormalizedObjectiveSheetLayout['termAvailability'] {
    return columns.map((column) => ({
      id: `term_${column.id}`,
      columnId: column.id,
      terms: this.inferObjectiveSheetColumnTerms(column),
    }));
  }

  private defaultObjectiveSheetLayout(): NormalizedObjectiveSheetLayout {
    const columns: NormalizedObjectiveSheetLayout['columns'] = [
      { id: 'objective', label: 'Objective', type: 'LONG_TEXT', width: 'LARGE', required: true },
      { id: 'uom', label: 'UOM', type: 'DROPDOWN', width: 'SMALL', required: false, options: ['%', 'Nos', 'Minutes', 'Hours'] },
      { id: 'bm', label: 'BM', type: 'PERCENTAGE', width: 'SMALL', required: false },
      { id: 'target', label: 'Target', type: 'PERCENTAGE', width: 'SMALL', required: false },
      { id: 'q1_actual', label: 'Q1 Actual', type: 'PERCENTAGE', width: 'SMALL', required: false },
      { id: 'q2_actual', label: 'Q2 Actual', type: 'PERCENTAGE', width: 'SMALL', required: false },
      { id: 'q3_actual', label: 'Q3 Actual', type: 'PERCENTAGE', width: 'SMALL', required: false },
      { id: 'q4_actual', label: 'Q4 Actual', type: 'PERCENTAGE', width: 'SMALL', required: false },
      { id: 'actual', label: 'Actual', type: 'FORMULA', width: 'SMALL', required: false, helpText: 'Calculated from term actuals' },
      { id: 'gap', label: 'Gap', type: 'FORMULA', width: 'SMALL', required: false, helpText: 'Calculated from target and actual' },
      { id: 'remarks', label: 'Remarks', type: 'LONG_TEXT', width: 'LARGE', required: false },
    ];
    return {
      columns: [
        ...columns,
      ],
      rows: [
        { id: 'row_1', label: 'Objective line 1' },
      ],
      headerGroups: [],
      rowGroups: [],
      formulas: [
        {
          id: 'formula_actual',
          kind: 'ACTUAL',
          label: 'Actual',
          targetColumnId: 'actual',
          mode: 'SUM_TERMS',
          sourceColumnIds: ['q1_actual', 'q2_actual', 'q3_actual', 'q4_actual'],
        },
        {
          id: 'formula_gap',
          kind: 'GAP',
          label: 'Gap',
          targetColumnId: 'gap',
          mode: 'TARGET_MINUS_ACTUAL',
          leftColumnId: 'target',
          rightColumnId: 'actual',
        },
      ],
      fillPermissions: this.defaultObjectiveSheetFillPermissions(columns),
      termAvailability: this.defaultObjectiveSheetTermAvailability(columns),
    };
  }

  private cloneObjectiveMasterVersionDetails(
    version: {
      objectiveType?: ObjectiveMasterTypeType;
      sheetLayout?: ObjectiveSheetLayoutInput;
      title: string;
      description?: string;
      measurementGuidance?: string;
      targetValue?: string;
      targetDescription?: string;
      targetDirection?: ObjectiveTargetDirectionType;
      priority?: string;
      attachmentPolicy?: ObjectiveAttachmentPolicyType;
      scoreable?: boolean;
      defaultScoringEligibilityRef?: string;
      approvedWeightage?: number;
      applicableTermLabels?: AssessmentTermCodeType[];
      ownerUserId?: Types.ObjectId;
      ownerRole?: string;
      ownerDepartment?: string;
      ownerScope?: Record<string, unknown>;
      assignerDepartment?: string;
      assignerScope?: Record<string, unknown>;
    },
    actor: { actorId: string; actorRole: string },
  ) {
    const objectiveType = this.normalizeObjectiveMasterType(version.objectiveType);

    return {
      objectiveType,
      sheetLayout: objectiveType === ObjectiveMasterType.SHEET
        ? this.normalizeObjectiveSheetLayout(version.sheetLayout)
        : undefined,
      title: version.title,
      description: version.description,
      measurementGuidance: version.measurementGuidance,
      targetValue: version.targetValue,
      targetDescription: version.targetDescription,
      targetDirection: objectiveType === ObjectiveMasterType.SHEET ? ObjectiveTargetDirection.NOT_APPLICABLE : version.targetDirection,
      priority: version.priority,
      attachmentPolicy: version.attachmentPolicy ?? ObjectiveAttachmentPolicy.OPTIONAL,
      scoreable: objectiveType === ObjectiveMasterType.SHEET ? false : version.scoreable === true,
      defaultScoringEligibilityRef: version.defaultScoringEligibilityRef,
      approvedWeightage: objectiveType !== ObjectiveMasterType.SHEET && version.scoreable === true ? version.approvedWeightage : undefined,
      applicableTermLabels: version.applicableTermLabels ?? [],
      ownerUserId: version.ownerUserId ?? this.toObjectId(actor.actorId, 'actorId'),
      ownerRole: version.ownerRole ?? actor.actorRole,
      ownerDepartment: version.ownerDepartment,
      ownerScope: version.ownerScope ?? {},
      assignerUserId: this.toObjectId(actor.actorId, 'actorId'),
      assignerRole: actor.actorRole,
      assignerDepartment: version.assignerDepartment,
      assignerScope: version.assignerScope ?? {},
      reviewerUserId: (version as any).reviewerUserId,
      reviewerRole: (version as any).reviewerRole,
      reviewerDepartment: (version as any).reviewerDepartment,
      reviewerScope: (version as any).reviewerScope ?? {},
    };
  }

  private normalizeApplicableTermLabels(
    terms?: AssessmentTermCodeType[],
  ): AssessmentTermCodeType[] {
    if (!Array.isArray(terms)) {
      return [];
    }

    const validTerms = Object.values(AssessmentTermCode);
    return Array.from(new Set(terms.filter((term) => validTerms.includes(term))));
  }

  private userIdString(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value._id) return value._id?.toString?.() ?? String(value._id);
    return value.toString?.() ?? '';
  }

  private userDisplayName(value: any): string {
    if (!value || typeof value === 'string') return '';
    return String(value.name || value.employeeCode || value.email || '').trim();
  }

  private resolveUserDisplayName(value: any, userNamesById: Map<string, string>): string | undefined {
    const populatedName = this.userDisplayName(value);
    if (populatedName) return populatedName;

    const id = this.userIdString(value);
    if (!id) return undefined;

    const contextUser = this.context.user;
    if (contextUser?._id?.toString?.() === id && contextUser.name) {
      return contextUser.name;
    }

    return userNamesById.get(id);
  }

  private collectUserId(value: any, userIds: Set<string>) {
    const id = this.userIdString(value);
    if (id && Types.ObjectId.isValid(id)) {
      userIds.add(id);
    }
  }

  private async buildUserNameMapForObjectiveAudit(records: any[]): Promise<Map<string, string>> {
    const userIds = new Set<string>();
    for (const record of records) {
      this.collectUserId(record?.createdBy, userIds);
      this.collectUserId(record?.updatedBy, userIds);
      this.collectUserId(record?.activatedBy, userIds);
      this.collectUserId(record?.deactivatedBy, userIds);
      this.collectUserId(record?.archivedBy, userIds);
    }

    if (!userIds.size) {
      return new Map();
    }

    const users = await User.find({
      _id: { $in: Array.from(userIds).map((id) => new Types.ObjectId(id)) },
    })
      .select('name employeeCode email')
      .lean();

    return new Map(
      users.map((user: any) => [
        user._id.toString(),
        String(user.name || user.employeeCode || user.email || '').trim(),
      ]),
    );
  }

  private mapObjectiveMasterRecord(
    master: any,
    userNamesById: Map<string, string> = new Map(),
  ): ObjectiveMasterRecord {
    return {
      id: master._id?.toString?.() ?? master.id ?? '',
      code: master.code,
      sourceType: master.sourceType,
      status: master.status,
      currentVersionId: master.currentVersionId?.toString?.(),
      ownerUserId: master.ownerUserId?.toString?.(),
      ownerRole: master.ownerRole,
      ownerDepartment: master.ownerDepartment,
      ownerScope: master.ownerScope ?? {},
      createdBy: this.userIdString(master.createdBy),
      createdByName: master.createdByName || this.resolveUserDisplayName(master.createdBy, userNamesById),
      updatedBy: this.userIdString(master.updatedBy) || undefined,
      updatedByName: master.updatedByName || this.resolveUserDisplayName(master.updatedBy, userNamesById),
      createdAt: typeof master.createdAt === 'string' ? master.createdAt : master.createdAt?.toISOString?.(),
      updatedAt: typeof master.updatedAt === 'string' ? master.updatedAt : master.updatedAt?.toISOString?.(),
    };
  }

  private mapObjectiveMasterVersionRecord(
    version: any,
    userNamesById: Map<string, string> = new Map(),
  ): ObjectiveMasterVersionRecord {
    return {
      id: version._id?.toString?.() ?? version.id ?? '',
      objectiveMasterId: this.userIdString(version.objectiveMasterId),
      versionNo: version.versionNo,
      status: version.status,
      objectiveType: this.normalizeObjectiveMasterType(version.objectiveType),
      sheetLayout: version.sheetLayout,
      title: version.title,
      description: version.description,
      measurementGuidance: version.measurementGuidance,
      targetValue: version.targetValue,
      targetDescription: version.targetDescription,
      targetDirection: version.targetDirection,
      priority: version.priority,
      attachmentPolicy: version.attachmentPolicy,
      scoreable: version.scoreable === true,
      defaultScoringEligibilityRef: version.defaultScoringEligibilityRef,
      approvedWeightage: version.approvedWeightage,
      applicableTermLabels: version.applicableTermLabels ?? [],
      ownerUserId: version.ownerUserId?.toString?.(),
      ownerRole: version.ownerRole,
      ownerDepartment: version.ownerDepartment,
      ownerScope: version.ownerScope ?? {},
      assignerUserId: version.assignerUserId?.toString?.(),
      assignerRole: version.assignerRole,
      assignerDepartment: version.assignerDepartment,
      assignerScope: version.assignerScope ?? {},
      reviewerUserId: version.reviewerUserId?.toString?.(),
      reviewerRole: version.reviewerRole,
      reviewerDepartment: version.reviewerDepartment,
      reviewerScope: version.reviewerScope ?? {},
      activatedAt: typeof version.activatedAt === 'string' ? version.activatedAt : version.activatedAt?.toISOString?.(),
      activatedBy: this.userIdString(version.activatedBy) || undefined,
      activatedByName: version.activatedByName || this.resolveUserDisplayName(version.activatedBy, userNamesById),
      deactivatedAt: typeof version.deactivatedAt === 'string' ? version.deactivatedAt : version.deactivatedAt?.toISOString?.(),
      deactivatedBy: this.userIdString(version.deactivatedBy) || undefined,
      deactivatedByName: version.deactivatedByName || this.resolveUserDisplayName(version.deactivatedBy, userNamesById),
      archivedAt: typeof version.archivedAt === 'string' ? version.archivedAt : version.archivedAt?.toISOString?.(),
      archivedBy: this.userIdString(version.archivedBy) || undefined,
      archivedByName: version.archivedByName || this.resolveUserDisplayName(version.archivedBy, userNamesById),
      createdBy: this.userIdString(version.createdBy),
      createdByName: version.createdByName || this.resolveUserDisplayName(version.createdBy, userNamesById),
      updatedBy: this.userIdString(version.updatedBy) || undefined,
      updatedByName: version.updatedByName || this.resolveUserDisplayName(version.updatedBy, userNamesById),
      createdAt: typeof version.createdAt === 'string' ? version.createdAt : version.createdAt?.toISOString?.(),
      updatedAt: typeof version.updatedAt === 'string' ? version.updatedAt : version.updatedAt?.toISOString?.(),
    };
  }

  private async toObjectiveMasterSummaryRecord(
    master: any,
    versions: any[],
    userNamesById: Map<string, string> = new Map(),
  ): Promise<ObjectiveMasterSummaryRecord> {
    const mappedVersions = versions.map((version) =>
      this.mapObjectiveMasterVersionRecord(version, userNamesById),
    );
    const currentVersionId = master.currentVersionId?.toString?.();
    const currentVersion = mappedVersions.find((version) => version.id === currentVersionId);
    const latestVersion = mappedVersions[0];

    return {
      master: this.mapObjectiveMasterRecord(master, userNamesById),
      currentVersion,
      latestVersion,
      versionCount: mappedVersions.length,
      activeVersionCount: mappedVersions.filter((version) => version.status === ObjectiveMasterVersionStatus.ACTIVE).length,
      draftVersionCount: mappedVersions.filter((version) => version.status === ObjectiveMasterVersionStatus.DRAFT).length,
      actions: await this.buildObjectiveMasterActionAvailability(master, versions),
    };
  }

  private async buildObjectiveMasterActionAvailability(
    master: any,
    versions: any[],
  ): Promise<ObjectiveMasterActionAvailability> {
    const currentVersionId = master.currentVersionId?.toString?.();
    const activeVersion =
      versions.find((version) => version._id?.toString?.() === currentVersionId) ||
      versions.find((version) => version.status === ObjectiveMasterVersionStatus.ACTIVE);
    const draftVersion = versions.find((version) => version.status === ObjectiveMasterVersionStatus.DRAFT);
    const canOwnMaster = await this.matchesObjectivePermissionMetadata(master.sourceType, {
      userId: master.ownerUserId,
      role: master.ownerRole,
      department: master.ownerDepartment,
      scope: master.ownerScope,
    });
    const canOwnAnyVersion = canOwnMaster || await this.anyVersionMatchesPermission(master.sourceType, versions, 'owner');
    const canAssignActiveVersion = activeVersion
      ? await this.matchesObjectivePermissionMetadata(master.sourceType, {
        userId: activeVersion.assignerUserId,
        role: activeVersion.assignerRole,
        department: activeVersion.assignerDepartment,
        scope: activeVersion.assignerScope,
      })
      : false;
    const canReviewActiveVersion = activeVersion
      ? await this.matchesObjectivePermissionMetadata(master.sourceType, {
        userId: activeVersion.reviewerUserId,
        role: activeVersion.reviewerRole,
        department: activeVersion.reviewerDepartment,
        scope: activeVersion.reviewerScope,
      })
      : false;

    return {
      canCreateDraftVersion: canOwnAnyVersion && Boolean(activeVersion || versions.length > 0),
      canEditDraft: canOwnAnyVersion && Boolean(draftVersion),
      canActivateDraft: canOwnAnyVersion && Boolean(draftVersion),
      canDeactivateActive: canOwnAnyVersion && Boolean(activeVersion),
      canArchiveVersion: canOwnAnyVersion && versions.length > 0,
      canCreateAssignmentRule: canAssignActiveVersion && Boolean(activeVersion),
      canReviewActiveVersion,
    };
  }

  private async anyVersionMatchesPermission(
    sourceType: string,
    versions: any[],
    permissionType: 'owner' | 'assigner' | 'reviewer',
  ): Promise<boolean> {
    for (const version of versions) {
      if (await this.matchesObjectivePermissionMetadata(sourceType, {
        userId: version[`${permissionType}UserId`],
        role: version[`${permissionType}Role`],
        department: version[`${permissionType}Department`],
        scope: version[`${permissionType}Scope`],
      })) {
        return true;
      }
    }
    return false;
  }

  private normalizePositiveInteger(value: string | number | undefined, fallback: number): number {
    const normalized = Number(value ?? fallback);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
  }

  private async buildObjectiveAssignmentPreview(
    input: ObjectiveAssignmentPreviewInput,
  ): Promise<ObjectiveAssignmentPreviewResult> {
    const cycleId = this.toObjectId(input.cycleId, 'cycleId');
    const selectedTermLabels = this.normalizeApplicableTermLabels(input.termLabels);
    const rules = await this.loadObjectiveAssignmentRulesForPreview(input, cycleId);
    const cycle = await AnnualCycle.findById(cycleId).select('assessmentTermType').lean();
    if (!cycle) {
      throw new Error('Annual cycle not found');
    }

    const annualAssignments = await AnnualAssignment.find({
      cycleId,
      isDeleted: false,
    }).lean();
    const termAssignments = await TermAssignment.find({
      cycleId,
      isDeleted: false,
      ...(selectedTermLabels.length > 0 ? { assessmentTermCode: { $in: selectedTermLabels } } : {}),
    }).lean();

    const annualById = new Map(annualAssignments.map((assignment) => [assignment._id.toString(), assignment]));
    const versionIds = Array.from(new Set(rules.map((rule) => rule.objectiveVersionId.toString())));
    const masterIds = Array.from(new Set(rules.map((rule) => rule.objectiveMasterId.toString())));
    const [versions, masters, existingObjectives] = await Promise.all([
      ObjectiveMasterVersion.find({ _id: { $in: versionIds }, isDeleted: false }).lean(),
      ObjectiveMaster.find({ _id: { $in: masterIds }, isDeleted: false }).lean(),
      Objective.find({
        cycleId,
        isDeleted: false,
      })
        .select('_id termAssignmentId objectiveMasterId objectiveVersionId assignmentRuleRefs employeeId assessmentTerm assessmentTermCode title')
        .lean(),
    ]);

    const versionsById = new Map(versions.map((version) => [version._id.toString(), version]));
    const mastersById = new Map(masters.map((master) => [master._id.toString(), master]));
    const exactExisting = new Map<string, any>();
    const existingByTerm = new Map<string, any[]>();
    for (const objective of existingObjectives) {
      const term = objective.assessmentTerm ?? objective.assessmentTermCode;
      if (objective.objectiveMasterId && objective.employeeId && term) {
        exactExisting.set(
          this.objectiveAssignmentKey(
            objective.objectiveMasterId.toString(),
            objective.employeeId.toString(),
            term,
          ),
          objective,
        );
      }
      const termAssignmentId = objective.termAssignmentId?.toString();
      if (termAssignmentId) {
        const list = existingByTerm.get(termAssignmentId) ?? [];
        list.push(objective);
        existingByTerm.set(termAssignmentId, list);
      }
    }

    const groupedRows = new Map<string, ObjectiveAssignmentPreviewRow>();
    const blockedRows: ObjectiveAssignmentPreviewRow[] = [];

    for (const rule of rules) {
      const version = versionsById.get(rule.objectiveVersionId.toString());
      const master = mastersById.get(rule.objectiveMasterId.toString());
      const ruleBlockedReason = this.getObjectiveAssignmentRuleBlockedReason(
        rule,
        version,
        master,
        cycle.assessmentTermType ?? undefined,
      );

      for (const termAssignment of termAssignments) {
        const annualAssignment = annualById.get(termAssignment.annualAssignmentId.toString());
        if (!annualAssignment) continue;
        if (!this.ruleMatchesTerm(rule, termAssignment.assessmentTermCode, cycle.assessmentTermType ?? undefined)) {
          continue;
        }
        if (!this.ruleMatchesAssignmentCriteria(rule.criteria ?? {}, annualAssignment)) {
          continue;
        }

        const key = this.objectiveAssignmentKey(
          rule.objectiveMasterId.toString(),
          termAssignment.employeeId.toString(),
          termAssignment.assessmentTermCode,
        );

        if (ruleBlockedReason || !version || !master) {
          blockedRows.push(this.buildObjectiveAssignmentPreviewRow({
            key: `${key}:${rule._id.toString()}:blocked`,
            ruleIds: [rule._id.toString()],
            rule,
            version,
            termAssignment,
            annualAssignment,
            status: 'BLOCKED',
            warnings: [],
            blockedReason: ruleBlockedReason ?? 'Objective version or master is not available',
          }));
          continue;
        }

        const existing = exactExisting.get(key);
        const similarTitleWarning = this.findSimilarTitleWarning(
          existingByTerm.get(termAssignment._id.toString()) ?? [],
          version.title,
          rule.objectiveMasterId.toString(),
        );

        const existingGrouped = groupedRows.get(key);
        if (existingGrouped) {
          existingGrouped.assignmentRuleIds = Array.from(new Set([
            ...existingGrouped.assignmentRuleIds,
            rule._id.toString(),
          ]));
          if (similarTitleWarning && !existingGrouped.warnings.includes(similarTitleWarning)) {
            existingGrouped.warnings.push(similarTitleWarning);
            if (existingGrouped.status === 'NEW') existingGrouped.status = 'WARNING';
          }
          continue;
        }

        groupedRows.set(key, this.buildObjectiveAssignmentPreviewRow({
          key,
          ruleIds: [rule._id.toString()],
          rule,
          version,
          termAssignment,
          annualAssignment,
          status: existing ? 'ALREADY_ASSIGNED' : similarTitleWarning ? 'WARNING' : 'NEW',
          warnings: similarTitleWarning ? [similarTitleWarning] : [],
        }));
      }
    }

    const rows = [...groupedRows.values(), ...blockedRows];
    return this.summarizeObjectiveAssignmentPreview(input.cycleId, annualAssignments.length, termAssignments.length, rows);
  }

  private async applyObjectiveAssignmentPreview(
    input: ObjectiveAssignmentPreviewInput,
    applySource: 'CYCLE_LAUNCH' | 'MANUAL_CONFIRMATION',
  ): Promise<ObjectiveAssignmentApplyResult> {
    const preview = await this.buildObjectiveAssignmentPreview(input);
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');
    const rowsToApply = preview.rows.filter((row) => row.status === 'NEW' || row.status === 'WARNING');
    const duplicateRows = preview.rows.filter((row) => row.status === 'ALREADY_ASSIGNED');
    const createdObjectiveIds: string[] = [];
    const updatedObjectiveIds: string[] = [];

    const ruleIds = Array.from(new Set(preview.rows.flatMap((row) => row.assignmentRuleIds)));
    const [rules, versions, termAssignments] = await Promise.all([
      ObjectiveAssignmentRule.find({ _id: { $in: ruleIds.map((id) => this.toObjectId(id, 'assignmentRuleId')) } }).lean(),
      ObjectiveMasterVersion.find({
        _id: { $in: Array.from(new Set(rowsToApply.map((row) => row.objectiveVersionId))).map((id) => this.toObjectId(id, 'objectiveVersionId')) },
      }).lean(),
      TermAssignment.find({
        _id: { $in: rowsToApply.map((row) => this.toObjectId(row.termAssignmentId, 'termAssignmentId')) },
      }).lean(),
    ]);
    const rulesById = new Map(rules.map((rule) => [rule._id.toString(), rule]));
    const versionsById = new Map(versions.map((version) => [version._id.toString(), version]));
    const termsById = new Map(termAssignments.map((termAssignment) => [termAssignment._id.toString(), termAssignment]));
    const masters = await ObjectiveMaster.find({
      _id: { $in: Array.from(new Set(rules.map((rule) => rule.objectiveMasterId.toString()))).map((id) => this.toObjectId(id, 'objectiveMasterId')) },
    }).lean();
    const mastersById = new Map(masters.map((master) => [master._id.toString(), master]));

    for (const row of duplicateRows) {
      const existingObjective = await Objective.findOne({
        objectiveMasterId: this.toObjectId(row.objectiveMasterId, 'objectiveMasterId'),
        employeeId: this.toObjectId(row.employeeId, 'employeeId'),
        assessmentTerm: row.assessmentTerm,
        isDeleted: false,
      });
      if (!existingObjective) continue;
      const beforeRefs = (existingObjective.assignmentRuleRefs ?? []).map((ref) => ref.toString());
      const mergedRefs = Array.from(new Set([...beforeRefs, ...row.assignmentRuleIds]));
      if (mergedRefs.length !== beforeRefs.length) {
        existingObjective.assignmentRuleRefs = mergedRefs.map((id) => this.toObjectId(id, 'assignmentRuleId'));
        existingObjective.updatedBy = actorId;
        existingObjective.version += 1;
        await existingObjective.save();
        updatedObjectiveIds.push(existingObjective._id.toString());
      }
    }

    const nextObjectiveNoByTerm = await this.resolveNextObjectiveNos(rowsToApply.map((row) => row.termAssignmentId));
    const objectivePayloads = rowsToApply.map((row) => {
      const version = versionsById.get(row.objectiveVersionId);
      const termAssignment = termsById.get(row.termAssignmentId);
      const firstRule = row.assignmentRuleIds.map((id) => rulesById.get(id)).find(Boolean);
      if (!version || !termAssignment || !firstRule) {
        throw new Error('Objective assignment preview is stale. Please preview again.');
      }
      const master = mastersById.get(firstRule.objectiveMasterId.toString());
      const sourceType = this.resolveFlexibleSourceTypeForObjective(version, firstRule, master);
      const nextObjectiveNo = nextObjectiveNoByTerm.get(row.termAssignmentId) ?? 1;
      nextObjectiveNoByTerm.set(row.termAssignmentId, nextObjectiveNo + 1);
      return {
        termAssignmentId: termAssignment._id,
        annualAssignmentId: termAssignment.annualAssignmentId,
        cycleId: termAssignment.cycleId,
        templateVersionId: termAssignment.templateVersionId,
        assessmentTermCode: termAssignment.assessmentTermCode,
        assessmentTerm: termAssignment.assessmentTermCode,
        employeeId: termAssignment.employeeId,
        assignedManagerId: termAssignment.assignedManagerId,
        objectiveMasterId: firstRule.objectiveMasterId,
        objectiveVersionId: version._id,
        assignmentRuleRefs: row.assignmentRuleIds.map((id) => this.toObjectId(id, 'assignmentRuleId')),
        sourceType,
        parentObjectiveId: undefined,
        objectiveSnapshot: this.buildAssignedObjectiveSnapshot(version, termAssignment.assessmentTermCode, sourceType),
        objectiveNo: nextObjectiveNo,
        source: this.mapFlexibleSourceToLegacySource(sourceType),
        isPredefined: true,
        title: version.title,
        description: version.description,
        priority: version.priority,
        targetMetric: version.measurementGuidance,
        targetValue: version.targetValue,
        weightage: version.scoreable === true ? version.approvedWeightage : undefined,
        successCriteria: version.targetDescription,
        status: ObjectiveStatus.OBJECTIVE_APPROVED,
        attachments: [],
        createdByRole: actor.actorRole,
        createdByUserId: actorId,
        createdBy: actorId,
        approvedAt: new Date(),
        approvedBy: actorId,
      };
    });

    if (objectivePayloads.length > 0) {
      const inserted = await Objective.insertMany(objectivePayloads);
      createdObjectiveIds.push(...inserted.map((objective) => objective._id.toString()));
    }

    await this.audit(
      applySource === 'CYCLE_LAUNCH'
        ? 'PMS_OBJECTIVE_ASSIGNMENT_RULES_APPLIED_ON_LAUNCH'
        : 'PMS_OBJECTIVE_ASSIGNMENT_RULES_APPLIED',
      'ANNUAL_CYCLE',
      input.cycleId,
      undefined,
      {
        preview,
        createdObjectiveIds,
        updatedObjectiveIds,
      },
    );

    return {
      ...preview,
      createdObjectiveIds,
      updatedObjectiveIds,
    };
  }

  private async loadObjectiveAssignmentRulesForPreview(
    input: ObjectiveAssignmentPreviewInput,
    cycleId: Types.ObjectId,
  ) {
    const filter: Record<string, unknown> = {
      status: ObjectiveAssignmentRuleStatus.ACTIVE,
      isDeleted: false,
      $or: [{ cycleId }, { cycleId: { $exists: false } }, { cycleId: null }],
    };

    if (input.assignmentRuleIds?.length) {
      filter._id = { $in: input.assignmentRuleIds.map((id) => this.toObjectId(id, 'assignmentRuleId')) };
    }

    if (input.objectiveVersionId) {
      filter.objectiveVersionId = this.toObjectId(input.objectiveVersionId, 'objectiveVersionId');
    }

    const now = this.getCurrentDate();
    filter.$and = [
      { $or: [{ effectiveFrom: { $exists: false } }, { effectiveFrom: { $lte: now } }, { effectiveFrom: null }] },
      { $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gte: now } }, { effectiveTo: null }] },
    ];

    return ObjectiveAssignmentRule.find(filter).lean();
  }

  private assertObjectiveAmendmentAllowed(termAssignment: ITermAssignment): void {
    if (isTermFinalized(termAssignment.termState)) {
      throw new Error('Finalized or closed term objectives cannot be amended');
    }
  }

  private async markFlexibleObjectiveNotApplicable(
    objective: IObjective,
    reason: string,
  ): Promise<FlexibleObjectiveAmendmentResult> {
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');
    const previousValue = objective.toObject();

    objective.applicabilityStatus = ObjectiveApplicabilityStatus.NOT_APPLICABLE;
    objective.amendmentAction = 'MARK_NOT_APPLICABLE';
    objective.amendmentReason = reason;
    objective.amendmentAt = new Date();
    objective.amendmentBy = actorId;
    objective.updatedBy = actorId;
    objective.version += 1;
    await objective.save();

    await CorrectionLayer.create({
      entityType: 'OBJECTIVE',
      entityId: objective._id,
      fieldKey: 'applicabilityStatus',
      originalValue: previousValue,
      correctedValue: objective.toObject(),
      correctionReason: reason,
      correctedBy: actorId,
      correctedAt: new Date(),
      approvedBy: actorId,
      approvedAt: new Date(),
      createdBy: actorId,
    });

    await this.createCommentRecord(objective, reason, 'AMENDMENT_MARK_NOT_APPLICABLE');
    await this.audit(
      'PMS_OBJECTIVE_MARKED_NOT_APPLICABLE',
      'OBJECTIVE',
      objective._id.toString(),
      previousValue,
      objective.toObject(),
      reason,
    );

    return {
      previousObjective: objective,
      action: 'MARK_NOT_APPLICABLE',
      applicabilityStatus: ObjectiveApplicabilityStatus.NOT_APPLICABLE,
    };
  }

  private async replaceFlexibleObjective(
    objective: IObjective,
    replacementObjectiveVersionId: string,
    reason: string,
    assignmentRuleRefs: string[],
  ): Promise<FlexibleObjectiveAmendmentResult> {
    const actor = this.requireActor();
    const actorId = this.toObjectId(actor.actorId, 'actorId');
    const replacementVersionRecord = await this.assertObjectiveVersionAssignable(replacementObjectiveVersionId);
    const replacementVersion = await ObjectiveMasterVersion.findById(replacementVersionRecord.id).lean();
    if (!replacementVersion) {
      throw new Error('Replacement objective version not found');
    }

    if (replacementVersion.objectiveMasterId.toString() === objective.objectiveMasterId?.toString()) {
      throw new Error('Replacement objective must be a different objective master');
    }

    const replacementMaster = await ObjectiveMaster.findById(replacementVersion.objectiveMasterId).lean();
    if (!replacementMaster) {
      throw new Error('Replacement objective master not found');
    }

    const existingReplacement = await Objective.findOne({
      objectiveMasterId: replacementVersion.objectiveMasterId,
      employeeId: objective.employeeId,
      assessmentTerm: objective.assessmentTerm ?? objective.assessmentTermCode,
      isDeleted: false,
    });
    if (existingReplacement) {
      throw new Error('Replacement objective is already assigned to this employee and term');
    }

    const previousValue = objective.toObject();
    const nextObjectiveNoByTerm = await this.resolveNextObjectiveNos([objective.termAssignmentId.toString()]);
    const sourceType = this.resolveFlexibleSourceTypeForObjective(replacementVersion, {}, replacementMaster);
    const replacementObjective = await Objective.create({
      termAssignmentId: objective.termAssignmentId,
      annualAssignmentId: objective.annualAssignmentId,
      cycleId: objective.cycleId,
      templateVersionId: objective.templateVersionId,
      assessmentTermCode: objective.assessmentTermCode,
      assessmentTerm: objective.assessmentTerm ?? objective.assessmentTermCode,
      employeeId: objective.employeeId,
      assignedManagerId: objective.assignedManagerId,
      objectiveMasterId: replacementVersion.objectiveMasterId,
      objectiveVersionId: replacementVersion._id,
      assignmentRuleRefs: assignmentRuleRefs.map((id) => this.toObjectId(id, 'assignmentRuleId')),
      sourceType,
      parentObjectiveId: objective._id,
      objectiveSnapshot: this.buildAssignedObjectiveSnapshot(
        replacementVersion,
        objective.assessmentTerm ?? objective.assessmentTermCode!,
        sourceType,
      ),
      objectiveNo: nextObjectiveNoByTerm.get(objective.termAssignmentId.toString()) ?? 1,
      source: this.mapFlexibleSourceToLegacySource(sourceType),
      isPredefined: true,
      title: replacementVersion.title,
      description: replacementVersion.description,
      priority: replacementVersion.priority,
      targetMetric: replacementVersion.measurementGuidance,
      targetValue: replacementVersion.targetValue,
      weightage: replacementVersion.approvedWeightage,
      successCriteria: replacementVersion.targetDescription,
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
      applicabilityStatus: ObjectiveApplicabilityStatus.ACTIVE,
      attachments: [],
      createdByRole: actor.actorRole,
      createdByUserId: actorId,
      createdBy: actorId,
      approvedAt: new Date(),
      approvedBy: actorId,
    });

    objective.applicabilityStatus = ObjectiveApplicabilityStatus.REPLACED;
    objective.amendmentAction = 'REPLACE_OBJECTIVE';
    objective.amendmentReason = reason;
    objective.amendmentAt = new Date();
    objective.amendmentBy = actorId;
    objective.replacementObjectiveId = replacementObjective._id;
    objective.updatedBy = actorId;
    objective.version += 1;
    await objective.save();

    await CorrectionLayer.create({
      entityType: 'OBJECTIVE',
      entityId: objective._id,
      fieldKey: 'replacementObjective',
      originalValue: previousValue,
      correctedValue: {
        replacedObjective: objective.toObject(),
        replacementObjective: replacementObjective.toObject(),
      },
      correctionReason: reason,
      correctedBy: actorId,
      correctedAt: new Date(),
      approvedBy: actorId,
      approvedAt: new Date(),
      createdBy: actorId,
    });

    await this.createCommentRecord(objective, reason, 'AMENDMENT_REPLACED');
    await this.createCommentRecord(replacementObjective, reason, 'AMENDMENT_REPLACEMENT');
    await this.audit(
      'PMS_OBJECTIVE_REPLACED',
      'OBJECTIVE',
      objective._id.toString(),
      previousValue,
      {
        replacedObjective: objective.toObject(),
        replacementObjective: replacementObjective.toObject(),
      },
      reason,
    );

    return {
      previousObjective: objective,
      replacementObjective,
      action: 'REPLACE_OBJECTIVE',
      applicabilityStatus: ObjectiveApplicabilityStatus.REPLACED,
    };
  }

  private getObjectiveAssignmentRuleBlockedReason(
    rule: any,
    version: any | undefined,
    master: any | undefined,
    cycleTermType?: string,
  ): string | undefined {
    if (!version) return 'Objective version was not found';
    if (!master) return 'Objective master was not found';
    if (version.status !== ObjectiveMasterVersionStatus.ACTIVE) {
      return 'Not assignable because the objective version is not active';
    }
    if (master.status !== ObjectiveMasterStatus.ACTIVE) {
      return 'Not assignable because the objective master is not active';
    }
    if (rule.assessmentTermType && cycleTermType && rule.assessmentTermType !== cycleTermType) {
      return 'Term does not match the cycle type';
    }
    return undefined;
  }

  private ruleMatchesTerm(rule: any, termCode: AssessmentTermCodeType, cycleTermType?: string): boolean {
    if (rule.assessmentTermType && cycleTermType && rule.assessmentTermType !== cycleTermType) {
      return false;
    }
    const labels = Array.isArray(rule.termLabels) ? rule.termLabels : [];
    return labels.length === 0 || labels.includes(termCode);
  }

  private ruleMatchesAssignmentCriteria(criteria: Record<string, any>, annualAssignment: any): boolean {
    const employeeSnapshot = annualAssignment.employeeSnapshot ?? {};
    const managerSnapshot = annualAssignment.managerSnapshot ?? {};
    const orgSnapshot = annualAssignment.orgSnapshot ?? {};
    const checks: Array<[unknown, unknown[]]> = [
      [criteria.company, [employeeSnapshot.company, orgSnapshot.company]],
      [criteria.businessUnit, [employeeSnapshot.businessUnit, orgSnapshot.businessUnit]],
      [criteria.location, [employeeSnapshot.location, orgSnapshot.location]],
      [criteria.department, [employeeSnapshot.department, employeeSnapshot.departmentName, employeeSnapshot.departmentId, orgSnapshot.department, orgSnapshot.departmentName, orgSnapshot.departmentId]],
      [criteria.team, [employeeSnapshot.team, orgSnapshot.team]],
      [criteria.role, [employeeSnapshot.role, employeeSnapshot.specificRole]],
      [criteria.designation, [employeeSnapshot.designation, employeeSnapshot.specificRole]],
      [criteria.grade, [employeeSnapshot.grade, orgSnapshot.grade]],
      [criteria.employeeGroup, [employeeSnapshot.employeeGroup, employeeSnapshot.employmentStatus]],
      [criteria.reportingManagerId?.toString?.(), [annualAssignment.assignedManagerId?.toString?.(), orgSnapshot.reportingManagerId?.toString?.(), managerSnapshot.managerId?.toString?.()]],
    ];

    for (const [expected, actualValues] of checks) {
      if (expected && !actualValues.some((actual) => this.sameScopeValue(String(actual ?? ''), String(expected)))) {
        return false;
      }
    }

    const employeeIds = Array.isArray(criteria.employeeIds) ? criteria.employeeIds : [];
    if (employeeIds.length > 0) {
      return employeeIds.some((employeeId: any) => employeeId?.toString?.() === annualAssignment.employeeId?.toString?.());
    }

    return true;
  }

  private buildObjectiveAssignmentPreviewRow(input: {
    key: string;
    ruleIds: string[];
    rule: any;
    version?: any;
    termAssignment: any;
    annualAssignment?: any;
    status: ObjectiveAssignmentPreviewRow['status'];
    warnings: string[];
    blockedReason?: string;
  }): ObjectiveAssignmentPreviewRow {
    const employeeSnapshot = input.annualAssignment?.employeeSnapshot ?? {};
    const employeeDepartment = String(
      employeeSnapshot.departmentName ??
      employeeSnapshot.department ??
      employeeSnapshot.departmentId ??
      '',
    );
    const employeeRole = String(
      employeeSnapshot.specificRole ??
      employeeSnapshot.designation ??
      employeeSnapshot.role ??
      '',
    );
    return {
      key: input.key,
      assignmentRuleIds: input.ruleIds,
      objectiveMasterId: input.rule.objectiveMasterId.toString(),
      objectiveVersionId: input.rule.objectiveVersionId.toString(),
      objectiveTitle: input.version?.title ?? '',
      annualAssignmentId: input.termAssignment.annualAssignmentId.toString(),
      termAssignmentId: input.termAssignment._id.toString(),
      cycleId: input.termAssignment.cycleId.toString(),
      employeeId: input.termAssignment.employeeId.toString(),
      employeeName: String(employeeSnapshot.name ?? 'Employee'),
      employeeCode: String(employeeSnapshot.employeeCode ?? ''),
      employeeDepartment: employeeDepartment || undefined,
      employeeRole: employeeRole || undefined,
      assessmentTerm: input.termAssignment.assessmentTermCode,
      status: input.status,
      warnings: input.warnings,
      blockedReason: input.blockedReason,
    };
  }

  private summarizeObjectiveAssignmentPreview(
    cycleId: string,
    totalEmployees: number,
    totalTerms: number,
    rows: ObjectiveAssignmentPreviewRow[],
  ): ObjectiveAssignmentPreviewResult {
    return {
      cycleId,
      totalEmployees,
      totalTerms,
      newAssignments: rows.filter((row) => row.status === 'NEW' || row.status === 'WARNING').length,
      alreadyAssigned: rows.filter((row) => row.status === 'ALREADY_ASSIGNED').length,
      warnings: rows.filter((row) => row.warnings.length > 0).length,
      blocked: rows.filter((row) => row.status === 'BLOCKED').length,
      rows,
    };
  }

  private objectiveAssignmentKey(objectiveMasterId: string, employeeId: string, assessmentTerm: string): string {
    return `${objectiveMasterId}:${employeeId}:${assessmentTerm}`;
  }

  private findSimilarTitleWarning(
    existingObjectives: any[],
    title: string,
    objectiveMasterId: string,
  ): string | undefined {
    const normalizedTitle = this.normalizeTitleForComparison(title);
    if (!normalizedTitle) return undefined;
    const similar = existingObjectives.find((objective) =>
      objective.objectiveMasterId?.toString?.() !== objectiveMasterId &&
      this.normalizeTitleForComparison(objective.title) === normalizedTitle,
    );
    return similar ? 'Similar title found - please review' : undefined;
  }

  private normalizeTitleForComparison(title?: string): string {
    return String(title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private async resolveNextObjectiveNos(termAssignmentIds: string[]): Promise<Map<string, number>> {
    const uniqueTermIds = Array.from(new Set(termAssignmentIds));
    const objectives = await Objective.find({
      termAssignmentId: { $in: uniqueTermIds.map((id) => this.toObjectId(id, 'termAssignmentId')) },
      isDeleted: false,
    }).select('termAssignmentId objectiveNo').lean();
    const nextByTerm = new Map(uniqueTermIds.map((id) => [id, 1]));
    for (const objective of objectives) {
      const termId = objective.termAssignmentId.toString();
      nextByTerm.set(termId, Math.max(nextByTerm.get(termId) ?? 1, (objective.objectiveNo ?? 0) + 1));
    }
    return nextByTerm;
  }

  private buildAssignedObjectiveSnapshot(
    version: any,
    applicableTerm: AssessmentTermCodeType,
    sourceType: FlexibleObjectiveSourceTypeType,
  ) {
    return {
      title: version.title,
      description: version.description,
      source: sourceType,
      measurementGuidance: version.measurementGuidance,
      targetValue: version.targetValue,
      targetDescription: version.targetDescription,
      targetDirection: version.targetDirection,
      priority: version.priority,
      attachmentPolicy: version.attachmentPolicy,
      scoreable: version.scoreable === true,
      approvedWeightage: version.scoreable === true ? version.approvedWeightage : undefined,
      applicableTerm,
      ownerUserId: version.ownerUserId,
      ownerRole: version.ownerRole,
      ownerDepartment: version.ownerDepartment,
      ownerScope: version.ownerScope ?? {},
      assignerUserId: version.assignerUserId,
      assignerRole: version.assignerRole,
      assignerDepartment: version.assignerDepartment,
      assignerScope: version.assignerScope ?? {},
      frozenAt: new Date(),
    };
  }

  private resolveFlexibleSourceTypeForObjective(
    version: any,
    rule: any,
    master?: any,
  ): FlexibleObjectiveSourceTypeType {
    return version.sourceType ?? rule.sourceType ?? master?.sourceType ?? FlexibleObjectiveSourceType.COMPANY_OBJECTIVE;
  }

  private mapFlexibleSourceToLegacySource(sourceType: FlexibleObjectiveSourceTypeType): ObjectiveSourceType {
    if (sourceType === FlexibleObjectiveSourceType.MANAGER_CREATED_OBJECTIVE) {
      return ObjectiveSource.MANAGER_CREATED;
    }
    if (sourceType === FlexibleObjectiveSourceType.EMPLOYEE_CREATED_OBJECTIVE) {
      return ObjectiveSource.EMPLOYEE_CREATED;
    }
    return ObjectiveSource.PREDEFINED;
  }

  private normalizeObjectiveAssignmentCriteria(criteria?: ObjectiveAssignmentCriteriaInput) {
    return {
      company: criteria?.company?.trim() || undefined,
      businessUnit: criteria?.businessUnit?.trim() || undefined,
      location: criteria?.location?.trim() || undefined,
      department: criteria?.department?.trim() || undefined,
      team: criteria?.team?.trim() || undefined,
      role: criteria?.role?.trim() || undefined,
      designation: criteria?.designation?.trim() || undefined,
      grade: criteria?.grade?.trim() || undefined,
      employeeGroup: criteria?.employeeGroup?.trim() || undefined,
      reportingManagerId: criteria?.reportingManagerId
        ? this.toObjectId(criteria.reportingManagerId, 'reportingManagerId')
        : undefined,
      employeeIds: (criteria?.employeeIds ?? []).map((id) => this.toObjectId(id, 'employeeId')),
    };
  }

  private mapObjectiveAssignmentRuleRecord(rule: any): ObjectiveAssignmentRuleRecord {
    return {
      id: rule._id?.toString?.() ?? '',
      objectiveMasterId: rule.objectiveMasterId?.toString?.() ?? '',
      objectiveVersionId: rule.objectiveVersionId?.toString?.() ?? '',
      cycleId: rule.cycleId?.toString?.(),
      assessmentTermType: rule.assessmentTermType,
      termLabels: rule.termLabels ?? [],
      criteria: rule.criteria ?? {},
      status: rule.status,
      effectiveFrom: rule.effectiveFrom?.toISOString?.(),
      effectiveTo: rule.effectiveTo?.toISOString?.(),
      note: rule.note,
    };
  }

  private async requireAdminForObjectiveAssignment(action: string): Promise<void> {
    const access = await accessService.canPerform({
      actor: this.requireActor(),
      action,
      requiresAdmin: true,
    });
    if (!access.allowed) {
      throw new Error(access.message ?? 'Admin access required');
    }
  }

  private async requireAdminForObjectiveReporting(action: string): Promise<void> {
    const access = await accessService.canPerform({
      actor: this.requireActor(),
      action,
      requiresAdmin: true,
    });
    if (!access.allowed) {
      throw new Error(access.message ?? 'Admin access required');
    }
  }

  private buildObjectiveReportingFilter(query: ObjectiveReportingQuery): Record<string, unknown> {
    const filter: Record<string, unknown> = { isDeleted: false };
    if (query.cycleId) filter.cycleId = this.toObjectId(query.cycleId, 'cycleId');
    if (query.annualAssignmentId) filter.annualAssignmentId = this.toObjectId(query.annualAssignmentId, 'annualAssignmentId');
    if (query.employeeId) filter.employeeId = this.toObjectId(query.employeeId, 'employeeId');
    if (query.assessmentTerm) {
      filter.$or = [
        { assessmentTerm: query.assessmentTerm },
        { assessmentTermCode: query.assessmentTerm },
      ];
    }
    if (query.sourceType) filter.sourceType = query.sourceType;
    if (query.objectiveMasterId) filter.objectiveMasterId = this.toObjectId(query.objectiveMasterId, 'objectiveMasterId');
    if (query.objectiveVersionId) filter.objectiveVersionId = this.toObjectId(query.objectiveVersionId, 'objectiveVersionId');
    if (query.status) filter.status = query.status;
    return filter;
  }

  private resolveObjectiveAssignmentLevel(objective: {
    sourceType?: string;
    assignmentRuleRefs?: unknown[];
    templateObjectiveKey?: string;
  }): string {
    if (objective.assignmentRuleRefs?.length) return 'ASSIGNMENT_RULE';
    if (objective.sourceType) return objective.sourceType;
    if (objective.templateObjectiveKey) return 'TEMPLATE';
    return 'DIRECT';
  }

  private firstByStringKey<T extends Record<string, any>>(records: T[], fieldKey: string): Map<string, T> {
    const map = new Map<string, T>();
    for (const record of records) {
      const key = record[fieldKey]?.toString?.() ?? String(record[fieldKey] ?? '');
      if (key && !map.has(key)) {
        map.set(key, record);
      }
    }
    return map;
  }

  private resolveReportingActualValue(
    objectiveId: string,
    achievementSubmission?: Record<string, any>,
  ): unknown {
    if (!achievementSubmission) return undefined;

    const objectiveItem = (achievementSubmission.achievementItems ?? []).find((item: Record<string, any>) =>
      item.objectiveId?.toString?.() === objectiveId,
    );
    const directActual =
      objectiveItem?.actual ??
      objectiveItem?.actualValue ??
      objectiveItem?.outcome ??
      objectiveItem?.description;
    if (directActual !== undefined && directActual !== null && String(directActual).trim() !== '') {
      return directActual;
    }

    for (const value of achievementSubmission.achievementValues ?? []) {
      const fromJson = this.findReportingActualValueInJson(objectiveId, value.valueJson);
      if (fromJson !== undefined) return fromJson;

      if (this.isActualFieldKey(value.fieldKey)) {
        const valueRecord = value as Record<string, unknown>;
        const rawValue = valueRecord.valueNumber ?? valueRecord.valueText ?? valueRecord.valueJson;
        if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
          return rawValue;
        }
      }
    }

    return undefined;
  }

  private findReportingActualValueInJson(objectiveId: string, value: unknown): unknown {
    if (!value || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const actual = this.findReportingActualValueInJson(objectiveId, item);
        if (actual !== undefined) return actual;
      }
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const rowObjectiveId = record.objectiveId?.toString?.() ?? String(record.objectiveId ?? '');
    if (rowObjectiveId && rowObjectiveId !== objectiveId) {
      return undefined;
    }

    if (rowObjectiveId === objectiveId) {
      const actual = record.actual ?? record.actualValue ?? record.actual_value;
      if (actual !== undefined && actual !== null && String(actual).trim() !== '') {
        return actual;
      }
    }

    for (const nestedValue of Object.values(record)) {
      const actual = this.findReportingActualValueInJson(objectiveId, nestedValue);
      if (actual !== undefined) return actual;
    }
    return undefined;
  }

  private isActualFieldKey(fieldKey?: string): boolean {
    const normalized = String(fieldKey ?? '').trim().toLowerCase();
    return normalized === 'actual' || normalized === 'actualvalue' || normalized === 'actual_value';
  }

  private resolveReportingScoreSnapshot(
    objectiveId: string,
    review?: Record<string, any>,
  ): {
    managerScore?: number;
    calculatedWeightedScore?: number;
    objectiveSectionScore?: number;
    objectiveSectionContribution?: number;
    objectiveScoringMode?: string;
  } {
    const sections = review?.scoreSnapshot?.sections ?? [];
    for (const section of sections) {
      const objectiveMatch = (section.objectives ?? []).find((objective: Record<string, any>) =>
        objective.objectiveId?.toString?.() === objectiveId,
      );
      if (objectiveMatch) {
        return {
          managerScore: Number.isFinite(Number(objectiveMatch.managerScore))
            ? Number(objectiveMatch.managerScore)
            : undefined,
          calculatedWeightedScore: Number.isFinite(Number(objectiveMatch.contribution))
            ? Number(objectiveMatch.contribution)
            : undefined,
          objectiveSectionScore: Number.isFinite(Number(section.objectiveSectionScore))
            ? Number(section.objectiveSectionScore)
            : undefined,
          objectiveSectionContribution: Number.isFinite(Number(section.objectiveSectionContribution))
            ? Number(section.objectiveSectionContribution)
            : undefined,
          objectiveScoringMode: section.objectiveScoringMode,
        };
      }

      if (section.objectiveScoringMode === ObjectiveScoringMode.OVERALL_OBJECTIVE_SCORE) {
        return {
          managerScore: Number.isFinite(Number(section.overallObjectiveScore))
            ? Number(section.overallObjectiveScore)
            : undefined,
          objectiveSectionScore: Number.isFinite(Number(section.objectiveSectionScore))
            ? Number(section.objectiveSectionScore)
            : undefined,
          objectiveSectionContribution: Number.isFinite(Number(section.objectiveSectionContribution))
            ? Number(section.objectiveSectionContribution)
            : undefined,
          objectiveScoringMode: section.objectiveScoringMode,
        };
      }
    }

    const ratingMatch = (review?.ratings ?? []).find((rating: Record<string, any>) =>
      rating.objectiveId?.toString?.() === objectiveId,
    );
    return {
      managerScore: Number.isFinite(Number(ratingMatch?.rating)) ? Number(ratingMatch.rating) : undefined,
    };
  }

  private resolveObjectiveDashboardStatus(
    objectiveStatus: string,
    applicabilityStatus: string,
    termState?: string,
    objectiveSnapshot?: Record<string, any>,
    isOverdue = false,
  ): {
    dashboardStatus: ObjectiveDashboardStatusRecord['dashboardStatus'];
    blockedReason?: string;
  } {
    if (
      applicabilityStatus === ObjectiveApplicabilityStatus.NOT_APPLICABLE ||
      applicabilityStatus === ObjectiveApplicabilityStatus.REPLACED ||
      termState === TermWorkflowState.CLOSED_BY_ADMIN
    ) {
      return { dashboardStatus: 'closed_not_applicable' };
    }

    if (isOverdue) {
      return { dashboardStatus: 'overdue' };
    }

    if (termState && isTermFinalized(termState)) {
      return { dashboardStatus: 'finalized' };
    }

    if (termState === TermWorkflowState.NOT_STARTED) {
      return { dashboardStatus: 'not_started' };
    }

    if (
      termState === TermWorkflowState.OBJECTIVE_SETTING_OPEN ||
      objectiveStatus === ObjectiveStatus.OBJECTIVE_DRAFT
    ) {
      return { dashboardStatus: 'pending_objective_setup' };
    }

    if (termState === TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN) {
      return { dashboardStatus: 'pending_achievement' };
    }

    if (termState === TermWorkflowState.MANAGER_REVIEW_OPEN) {
      const blockedReason = this.resolveObjectiveScoringBlockedReason(objectiveSnapshot);
      return blockedReason
        ? { dashboardStatus: 'blocked', blockedReason }
        : { dashboardStatus: 'pending_manager_review' };
    }

    if (objectiveStatus === ObjectiveStatus.OBJECTIVE_SUBMITTED) {
      return { dashboardStatus: 'submitted' };
    }

    if (objectiveStatus === ObjectiveStatus.OBJECTIVE_APPROVED) {
      return { dashboardStatus: 'approved' };
    }

    if (objectiveStatus === ObjectiveStatus.OBJECTIVE_REVISION_REQUIRED) {
      return { dashboardStatus: 'returned_for_revision' };
    }

    return {
      dashboardStatus: 'blocked',
      blockedReason: `Unsupported objective status: ${objectiveStatus}`,
    };
  }

  private resolveObjectiveScoringBlockedReason(objectiveSnapshot?: Record<string, any>): string | undefined {
    if (!objectiveSnapshot?.scoreable) {
      return undefined;
    }

    const weightage = Number(objectiveSnapshot.approvedWeightage);
    if (!Number.isFinite(weightage) || weightage <= 0 || weightage > 100) {
      return 'Scoreable objective is missing valid approved weightage.';
    }

    const targetDirection = objectiveSnapshot.targetDirection;
    const requiresNumericTarget =
      targetDirection === ObjectiveTargetDirection.HIGHER_IS_BETTER ||
      targetDirection === ObjectiveTargetDirection.LOWER_IS_BETTER;
    if (requiresNumericTarget && !String(objectiveSnapshot.targetValue ?? '').trim()) {
      return 'Scoreable objective is missing target value for target-based validation.';
    }

    return undefined;
  }

  private isObjectiveDashboardOverdue(
    termState?: string,
    termCycle?: Record<string, any>,
  ): boolean {
    const now = Date.now();
    if (termState === TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN) {
      const dueDate =
        termCycle?.achievementSubmissionWindow?.dueDate ??
        termCycle?.achievementSubmissionWindow?.endDate;
      return dueDate ? new Date(dueDate).getTime() < now : false;
    }

    if (termState === TermWorkflowState.MANAGER_REVIEW_OPEN) {
      const dueDate = termCycle?.managerReviewWindow?.endDate;
      return dueDate ? new Date(dueDate).getTime() < now : false;
    }

    return false;
  }

  private async assertAssignmentAccess(action: string, termAssignment: ITermAssignment): Promise<void> {
    if (action !== 'objective.view') {
      await this.assertObjectiveWorkflowAllowed(termAssignment);
    }

    const actor = this.requireActor();
    const access = await accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: termAssignment.employeeId.toString(),
        managerId: termAssignment.assignedManagerId.toString(),
      },
    });

    if (access.allowed) {
      return;
    }

    // Check delegation
    const delegation = await this.getObjectiveDelegation(
      actor.actorId,
      termAssignment.assignedManagerId.toString(),
      termAssignment.cycleId?.toString(),
      termAssignment.annualAssignmentId.toString(),
    );

    if (delegation) {
      return;
    }

    throw new Error(access.message ?? 'Access denied');
  }

  private async assertObjectiveAccess(
    action: string,
    objective: IObjective,
    employeeOnly: boolean,
  ): Promise<void> {
    if (action !== 'objective.view') {
      const termAssignment = await this.getTermAssignment(objective.termAssignmentId.toString());
      await this.assertObjectiveWorkflowAllowed(termAssignment);
    }

    const actor = this.requireActor();

    if (employeeOnly && actor.actorId !== objective.employeeId.toString()) {
      throw new Error('Employee can submit only own objective');
    }

    const access = await accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: objective.employeeId.toString(),
        managerId: objective.assignedManagerId.toString(),
      },
    });

    if (access.allowed) {
      return;
    }

    // Check delegation
    const delegation = await this.getObjectiveDelegation(
      actor.actorId,
      objective.assignedManagerId.toString(),
      objective.cycleId?.toString(),
      objective.annualAssignmentId?.toString(),
    );

    if (delegation) {
      return;
    }

    throw new Error(access.message ?? 'Access denied');
  }

  private async getObjective(objectiveId: string): Promise<IObjective> {
    if (!Types.ObjectId.isValid(objectiveId)) {
      throw new Error('Invalid objective id');
    }

    const objective = await Objective.findById(objectiveId);
    if (!objective || objective.isDeleted) {
      throw new Error('Objective not found');
    }

    return objective;
  }

  private async getTermAssignment(termAssignmentId: string): Promise<ITermAssignment> {
    if (!Types.ObjectId.isValid(termAssignmentId)) {
      throw new Error('Invalid termAssignmentId');
    }

    const termAssignment = await TermAssignment.findById(termAssignmentId);
    if (!termAssignment || termAssignment.isDeleted) {
      throw new Error('Quarter assignment not found');
    }

    return termAssignment;
  }

  private async getAnnualAssignment(annualAssignmentId: string): Promise<IAnnualAssignment> {
    if (!Types.ObjectId.isValid(annualAssignmentId)) {
      throw new Error('Invalid annualAssignmentId');
    }

    const annualAssignment = await AnnualAssignment.findById(annualAssignmentId);
    if (!annualAssignment || annualAssignment.isDeleted) {
      throw new Error('Annual assignment not found');
    }

    return annualAssignment;
  }

  private getEffectiveTermStateForDisplay(
    termState: TermWorkflowState,
    annualState?: AnnualWorkflowState,
    cycleState?: AnnualWorkflowState,
  ): TermWorkflowState {
    if (
      annualState === AnnualWorkflowState.CANCELLED ||
      cycleState === AnnualWorkflowState.CANCELLED
    ) {
      return termState === TermWorkflowState.TERM_FINALIZED
        ? termState
        : TermWorkflowState.CLOSED_BY_ADMIN;
    }

    return termState;
  }

  private async assertObjectiveWorkflowAllowed(termAssignment: ITermAssignment): Promise<void> {
    const annualAssignment = await AnnualAssignment.findById(termAssignment.annualAssignmentId)
      .select('annualState cycleId isDeleted')
      .lean();

    if (!annualAssignment || annualAssignment.isDeleted) {
      throw new Error('Annual assignment not found');
    }

    const cycle = annualAssignment.cycleId
      ? await AnnualCycle.findById(annualAssignment.cycleId).select('status isDeleted').lean()
      : null;

    if (!cycle || cycle.isDeleted) {
      throw new Error('Annual cycle not found');
    }

    if (
      annualAssignment.annualState === AnnualWorkflowState.CANCELLED ||
      cycle.status === AnnualWorkflowState.CANCELLED
    ) {
      throw new Error('This assignment is cancelled because the parent cycle was cancelled.');
    }
  }

  private async assertObjectiveWindow(
    termAssignment: ITermAssignment,
    windowType: 'setting' | 'approval',
  ): Promise<void> {
    if (!termAssignment.cycleTermId) {
      return;
    }

    const termCycle = await TermCycle.findById(termAssignment.cycleTermId)
      .select('objectiveSettingWindow objectiveApprovalWindow')
      .lean();
    if (!termCycle) {
      return;
    }

    const window = windowType === 'setting'
      ? termCycle.objectiveSettingWindow
      : termCycle.objectiveApprovalWindow;

    if (!window?.startDate || !window?.endDate) {
      return;
    }

    const now = this.getCurrentDate();
    const start = new Date(window.startDate);
    const end = new Date(window.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (now < start || now > end) {
      throw new Error(
        windowType === 'setting'
          ? 'Objective setting window is closed for this quarter'
          : 'Objective approval window is closed for this quarter',
      );
    }
  }

  private async assertManagerCreatedObjectiveAssignmentAllowed(
    termAssignment: ITermAssignment,
  ): Promise<void> {
    const allowedStates = new Set<TermWorkflowState>([
      TermWorkflowState.NOT_STARTED,
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      TermWorkflowState.OBJECTIVE_APPROVED,
    ]);

    if (!allowedStates.has(termAssignment.termState)) {
      throw new Error(
        `Manager-created objectives can be assigned only during objective setting or after objectives are approved. Current state: ${termAssignment.termState}`,
      );
    }

    if (termAssignment.termState === TermWorkflowState.OBJECTIVE_APPROVED) {
      return;
    }

    await this.assertObjectiveWindow(termAssignment, 'setting');
  }

  private async getObjectiveDelegation(
    delegateUserId: string,
    delegatorUserId: string,
    cycleId?: string,
    annualAssignmentId?: string,
  ): Promise<any | null> {
    return new DelegationService(this.context).getActiveDelegation(
      delegateUserId,
      delegatorUserId,
      'PMS_OBJECTIVES',
      cycleId,
      annualAssignmentId,
    );
  }

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private resolveObjectiveSource(
    actorRole: string,
    termAssignment: ITermAssignment,
  ): ObjectiveSourceType {
    const actor = this.requireActor();
    const actorId = actor.actorId;

    if (actorId === termAssignment.employeeId.toString()) {
      return ObjectiveSource.EMPLOYEE_CREATED;
    }

    if (
      actorId === termAssignment.assignedManagerId.toString() ||
      this.context.reqRole === 'manager' ||
      accessService.mapRole(actorRole) === PmsRole.MANAGER
    ) {
      return ObjectiveSource.MANAGER_CREATED;
    }

    const mappedRole = accessService.mapRole(actorRole);
    if (mappedRole === PmsRole.EMPLOYEE) return ObjectiveSource.EMPLOYEE_CREATED;
    if (mappedRole === PmsRole.MANAGER) return ObjectiveSource.MANAGER_CREATED;

    throw new Error('Only employee or manager can create objectives');
  }

  private async assertAdmin(action: string): Promise<void> {
    const access = await accessService.canPerform({
      actor: this.requireActor(),
      action,
      requiresAdmin: true,
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private requireActor() {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    return {
      actorId: user._id.toString(),
      actorRole: user.role,
    };
  }

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Invalid ${fieldName}`);
    }

    return new Types.ObjectId(value);
  }

  private valuesDiffer(left: unknown, right: unknown): boolean {
    return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null);
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
    reason?: string,
  ): Promise<void> {
    const actor = this.requireActor();
    const assignmentId = await this.resolveAuditAssignmentId(entityType, entityId);
    let metadata: Record<string, unknown> | undefined = undefined;

    if (entityType === 'OBJECTIVE') {
      const objective = await Objective.findById(entityId).select('assignedManagerId cycleId annualAssignmentId').lean();
      if (objective && actor.actorId !== objective.assignedManagerId?.toString()) {
        const delegation = await this.getObjectiveDelegation(
          actor.actorId,
          objective.assignedManagerId.toString(),
          objective.cycleId?.toString(),
          objective.annualAssignmentId?.toString(),
        );
        if (delegation) {
          metadata = { actedAsDelegateFor: objective.assignedManagerId.toString() };
        }
      }
    }

    await auditService.createAuditLog({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action,
      entityType,
      entityId,
      assignmentId,
      previousValue,
      newValue,
      reason,
      metadata,
    });
  }

  private async resolveAuditAssignmentId(entityType: string, entityId: string): Promise<string | undefined> {
    if (entityType === 'ANNUAL_ASSIGNMENT') {
      return entityId;
    }

    if (entityType === 'TERM_ASSIGNMENT') {
      const termAssignment = await TermAssignment.findById(entityId)
        .select('annualAssignmentId')
        .lean();
      return termAssignment?.annualAssignmentId?.toString();
    }

    if (entityType === 'OBJECTIVE') {
      const objective = await Objective.findById(entityId)
        .select('annualAssignmentId termAssignmentId')
        .lean();

      if (objective?.annualAssignmentId) {
        return objective.annualAssignmentId.toString();
      }

      if (objective?.termAssignmentId) {
        const termAssignment = await TermAssignment.findById(objective.termAssignmentId)
          .select('annualAssignmentId')
          .lean();
        return termAssignment?.annualAssignmentId?.toString();
      }
    }

    return undefined;
  }
}
