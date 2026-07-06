import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualWorkflowState,
  AssessmentTermCode,
  ObjectiveSource,
  ObjectiveStatus,
  PmsRole,
  PmsTemplateSectionType,
  TermWorkflowState,
} from '../constants/pms.enums';
import { Objective } from '../models/pms-objective.model';
import { ObjectiveValue } from '../models/pms-objective-value.model';
import { ObjectiveAttachment } from '../models/pms-objective-attachment.model';
import { ObjectiveComment } from '../models/pms-objective-comment.model';
import { PmsDocument } from '../models/pms-document.model';
import { ManagerObjectiveLibrary } from '../models/pms-manager-objective-library.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { AuditLog } from '../models/audit-log.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { DelegationService } from './delegation.service';
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
  ObjectiveSource as ObjectiveSourceType,
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

type AssignmentMode = 'employee' | 'manager';

type ObjectiveConfig = {
  mode: 'PREDEFINED' | 'DYNAMIC' | 'HYBRID';
  allowEmployeeCreated: boolean;
  allowManagerCreated: boolean;
  objectiveScoringPolicy: {
    predefinedObjectivesScoreable: boolean;
    managerCreatedScoreable: boolean;
    employeeCreatedScoreable: boolean;
    requireManagerApprovalForEmployeeScore: boolean;
    requireWeightageBeforeAchievement: boolean;
    allowManagerOverallForRemainingWeightage: boolean;
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

  async saveAssignmentTemplateValues(
    termAssignmentId: string,
    input: SaveAssignmentTemplateValuesInput,
  ): Promise<Array<Record<string, unknown>>> {
    const termAssignment = await this.getTermAssignment(termAssignmentId);
    const actor = this.requireActor();
    const mappedRole = accessService.mapRole(actor.actorRole);

    await this.assertAssignmentAccess('objective.create', termAssignment);
    await this.assertObjectiveWindow(termAssignment, 'setting');

    if (
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
      predefinedObjectivesScoreable: true,
      managerCreatedScoreable: false,
      employeeCreatedScoreable: false,
      requireManagerApprovalForEmployeeScore: true,
      requireWeightageBeforeAchievement: true,
      allowManagerOverallForRemainingWeightage: true,
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
        predefinedObjectivesScoreable:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.predefinedObjectivesScoreable !== false,
        managerCreatedScoreable:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.managerCreatedScoreable === true,
        employeeCreatedScoreable:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.employeeCreatedScoreable === true,
        requireManagerApprovalForEmployeeScore:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.requireManagerApprovalForEmployeeScore !== false,
        requireWeightageBeforeAchievement:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.requireWeightageBeforeAchievement !== false,
        allowManagerOverallForRemainingWeightage:
          objectiveSection.objectiveConfig.objectiveScoringPolicy?.allowManagerOverallForRemainingWeightage !== false,
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
