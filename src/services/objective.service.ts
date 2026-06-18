import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AssessmentTermCode,
  ObjectiveSource,
  ObjectiveStatus,
  PmsRole,
  PmsTemplateSectionType,
  QuarterWorkflowState,
} from '../constants/pms.enums';
import { Objective } from '../models/pms-objective.model';
import { ObjectiveValue } from '../models/pms-objective-value.model';
import { ObjectiveAttachment } from '../models/pms-objective-attachment.model';
import { ObjectiveComment } from '../models/pms-objective-comment.model';
import { ManagerObjectiveLibrary } from '../models/pms-manager-objective-library.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { CorrectionLayer } from '../models/pms-correction-layer.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { DelegationService } from './delegation.service';
import { transitionQuarterAssignmentState } from './quarter-assignment-workflow.service';
import type { IObjective } from '../models/pms-objective.model';
import type { IManagerObjectiveLibraryItem } from '../models/pms-manager-objective-library.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
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
  quarterAssignmentId: string;
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

type BulkManagerObjectiveDraftInput = Omit<CreateObjectiveInput, 'quarterAssignmentId'> & {
  clientObjectiveId?: string;
};

export interface BulkManagerObjectiveWeightageAdjustmentInput {
  quarterAssignmentId: string;
  objectiveId: string;
  weightage: number;
}

export interface BulkManagerObjectiveWeightageOverrideInput {
  quarterAssignmentId: string;
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
  quarterAssignmentIds: string[];
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

export interface ReturnObjectiveInput {
  reason: string;
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
  predefinedObjectives: Array<{
    key: string;
    title: string;
    description?: string;
    kpi?: string;
    targetValue?: string;
    weightage?: number;
    successCriteria?: string;
    applicableQuarters?: AssessmentTermCodeValue[];
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
  quarterAssignmentId: string;
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
  quarterAssignmentId: string;
  cycleId: string;
  cycleName: string;
  quarter: AssessmentTermCodeValue;
  assessmentTermType?: string;
  termCode?: AssessmentTermCodeValue;
  termLabel?: string;
  quarterState: string;
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
  objectiveConfig: ObjectiveConfig;
  objectives: ObjectiveRecord[];
};

type BulkCreateManagerObjectiveResult = {
  created: Array<{
    quarterAssignmentId: string;
    objectiveId: string;
    employeeId: string;
    employeeName: string;
    objectiveTitle: string;
    clientObjectiveId?: string;
  }>;
  updated: Array<{
    quarterAssignmentId: string;
    objectiveId: string;
    objectiveTitle: string;
    previousWeightage?: number;
    weightage?: number;
  }>;
  failed: Array<{
    quarterAssignmentId: string;
    employeeId?: string;
    employeeName?: string;
    objectiveTitle?: string;
    clientObjectiveId?: string;
    reason: string;
  }>;
};

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
        const clause: Record<string, unknown> = {
          assignedManagerId: delegation.delegatorUserId,
        };
        if (delegation.cycleId) {
          clause.cycleId = delegation.cycleId;
        }
        managerClauses.push(clause);
      }

      filter.$or = managerClauses;
    }

    const quarterAssignments = await QuarterAssignment.find(filter)
      .sort({ createdAt: -1, quarterCode: 1 })
      .lean();

    if (quarterAssignments.length === 0) {
      return [];
    }

    const annualAssignments = await AnnualAssignment.find({
      _id: { $in: quarterAssignments.map((item) => item.annualAssignmentId) },
      isDeleted: false,
    }).lean();

    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );

    const quarterCycles = await QuarterCycle.find({
      _id: {
        $in: quarterAssignments
          .map((item) => item.cycleQuarterId)
          .filter(Boolean),
      },
      isDeleted: false,
    }).lean();

    const quarterCycleMap = new Map(
      quarterCycles.map((item) => [item._id.toString(), item]),
    );

    await this.ensurePredefinedObjectivesForAssignments(annualAssignments, quarterAssignments);

    const objectives = await Objective.find({
      quarterAssignmentId: { $in: quarterAssignments.map((item) => item._id) },
      isDeleted: false,
    })
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
    const objectivesByQuarterAssignmentId = new Map<string, typeof objectives>();

    for (const objective of objectives) {
      const key = objective.quarterAssignmentId.toString();
      const bucket = objectivesByQuarterAssignmentId.get(key) ?? [];
      bucket.push(objective);
      objectivesByQuarterAssignmentId.set(key, bucket);
    }

    const configMap = await this.buildObjectiveConfigMap(annualAssignments, quarterAssignments);

    return quarterAssignments.map((quarterAssignment) => {
      const annualAssignment = annualAssignmentMap.get(quarterAssignment.annualAssignmentId.toString());
      const quarterCycle = quarterAssignment.cycleQuarterId
        ? quarterCycleMap.get(quarterAssignment.cycleQuarterId.toString())
        : undefined;
      const objectiveConfig = configMap.get(quarterAssignment._id.toString()) ?? this.defaultObjectiveConfig();
      const objectiveRecords = (objectivesByQuarterAssignmentId.get(quarterAssignment._id.toString()) ?? [])
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

      return {
        id: quarterAssignment._id.toString(),
        annualAssignmentId: quarterAssignment.annualAssignmentId.toString(),
        quarterAssignmentId: quarterAssignment._id.toString(),
        cycleId: quarterAssignment.cycleId?.toString() ?? '',
        cycleName: this.getCycleName(annualAssignment),
        quarter: quarterAssignment.quarterCode,
        assessmentTermType: quarterAssignment.assessmentTermType,
        termCode: quarterAssignment.termCode ?? quarterAssignment.quarterCode,
        termLabel: quarterAssignment.termLabel ?? quarterAssignment.termCode ?? quarterAssignment.quarterCode,
        quarterState: quarterAssignment.quarterState,
        quarterWindows: this.mapQuarterWindows(quarterCycle),
        employeeId: quarterAssignment.employeeId.toString(),
        employeeName: this.getEmployeeName(annualAssignment, quarterAssignment.employeeId.toString()),
        employeeCode,
        employeeNo: employeeCode,
        designation: employeeDesignation,
        employeeDesignation,
        department: employeeDepartment,
        departmentId: String(employeeSnapshot.departmentId ?? employeeDepartment),
        managerId: quarterAssignment.assignedManagerId.toString(),
        managerName: this.getManagerName(annualAssignment, quarterAssignment.assignedManagerId.toString()),
        objectiveWeightageCap: 100,
        backendConnected: true,
        templateVersionId: annualAssignment?.templateVersionId?.toString() ?? '',
        objectiveConfig,
        objectives: objectiveRecords,
      };
    });
  }

  async getObjectiveDetail(objectiveId: string): Promise<ObjectiveRecord> {
    const objective = await this.getObjective(objectiveId);
    await this.assertObjectiveAccess('objective.view', objective, false);

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

  async createObjective(input: CreateObjectiveInput): Promise<IObjective> {
    const actor = this.requireActor();
    const quarterAssignment = await this.getQuarterAssignment(input.quarterAssignmentId);
    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const source = this.resolveObjectiveSource(actor.actorRole, quarterAssignment);
    const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, quarterAssignment);

    const bucket = this.resolveObjectiveBucket(source, objectiveConfig);
    if (!bucket) {
      throw new Error(`No matching objective bucket configuration found for source: ${source}`);
    }

    if (bucket.owner === 'EMPLOYEE' && actor.actorId !== quarterAssignment.employeeId.toString()) {
      throw new Error('Only the employee can add objectives to the employee-owned bucket');
    }
    if (bucket.owner === 'MANAGER') {
      const isManager = actor.actorId === quarterAssignment.assignedManagerId.toString();
      const isDelegate = await this.getObjectiveDelegation(
        actor.actorId,
        quarterAssignment.assignedManagerId.toString(),
        quarterAssignment.cycleId?.toString(),
      );
      if (!isManager && !isDelegate && accessService.mapRole(actor.actorRole) !== PmsRole.ADMIN) {
        throw new Error('Only the manager or their delegate can add objectives to the manager-owned bucket');
      }
    }

    await this.assertAssignmentAccess('objective.create', quarterAssignment);
    await this.assertObjectiveWindow(quarterAssignment, 'setting');
    this.validateContextObjectivePayload(input as unknown as Record<string, unknown>, source);
    this.validateObjectiveInput(input);
    this.validateContextObjectiveRequiredFields(input, source);
    this.validateCreateAgainstConfig(source, objectiveConfig);
    if (source === ObjectiveSource.PREDEFINED) {
      await this.validateQuarterObjectiveRules(
        quarterAssignment,
        input.weightage,
        undefined,
        source,
        objectiveConfig,
        false,
      );
    }

    if (quarterAssignment.quarterState === QuarterWorkflowState.NOT_STARTED) {
      await this.ensureQuarterState(
        quarterAssignment._id.toString(),
        quarterAssignment.quarterState,
        QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
      );
    }

    if (
      source === ObjectiveSource.EMPLOYEE_CREATED &&
      quarterAssignment.quarterState === QuarterWorkflowState.OBJECTIVE_SETTING_OPEN
    ) {
      await this.transitionQuarterIfNeeded(
        quarterAssignment._id.toString(),
        QuarterWorkflowState.OBJECTIVE_DRAFT,
      );
    }

    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');
    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== quarterAssignment.assignedManagerId.toString()) {
      const delegation = await this.getObjectiveDelegation(
        actor.actorId,
        quarterAssignment.assignedManagerId.toString(),
        quarterAssignment.cycleId?.toString(),
      );

      if (delegation) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = quarterAssignment.assignedManagerId;
      }
    }

    const objective = await Objective.create({
      quarterAssignmentId: quarterAssignment._id,
      annualAssignmentId: quarterAssignment.annualAssignmentId,
      cycleId: quarterAssignment.cycleId,
      quarterCode: quarterAssignment.quarterCode,
      employeeId: quarterAssignment.employeeId,
      assignedManagerId: quarterAssignment.assignedManagerId,
      objectiveNo: await this.getNextObjectiveNo(quarterAssignment._id),
      source,
      title: input.title.trim(),
      description: input.description?.trim(),
      priority: this.normalizeObjectivePriority(input.priority),
      expectedOutcome: input.expectedOutcome?.trim(),
      targetMetric: source === ObjectiveSource.PREDEFINED ? input.targetMetric?.trim() : undefined,
      targetValue: source === ObjectiveSource.PREDEFINED ? input.targetValue?.trim() : undefined,
      targetDate: source === ObjectiveSource.PREDEFINED && input.targetDate ? new Date(input.targetDate) : undefined,
      weightage: source === ObjectiveSource.PREDEFINED ? input.weightage : undefined,
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
      quarterAssignment,
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
    const quarterAssignmentIds = Array.from(new Set(input.quarterAssignmentIds ?? []));
    if (quarterAssignmentIds.length === 0) {
      throw new Error('At least one quarter assignment is required');
    }

    const objectiveInputs = this.resolveBulkManagerObjectiveInputs(input);
    if (objectiveInputs.length === 0) {
      throw new Error('At least one objective is required');
    }
    if ((input.weightageAdjustments ?? []).length > 0 || (input.objectiveWeightageOverrides ?? []).length > 0) {
      throw new Error('Manager-created objectives are context-only and cannot carry weightage adjustments');
    }

    const actor = this.requireActor();
    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');
    const created: BulkCreateManagerObjectiveResult['created'] = [];
    const updated: BulkCreateManagerObjectiveResult['updated'] = [];
    const failed: BulkCreateManagerObjectiveResult['failed'] = [];

    for (const quarterAssignmentId of quarterAssignmentIds) {
      let quarterAssignment: IQuarterAssignment | null = null;
      let annualAssignment: IAnnualAssignment | null = null;

      try {
        quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
        annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
        const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, quarterAssignment);
        const source = ObjectiveSource.MANAGER_CREATED;
        const bucket = this.resolveObjectiveBucket(source, objectiveConfig);

        if (!bucket) {
          throw new Error(`No matching objective bucket configuration found for source: ${source}`);
        }
        if (bucket.owner !== 'MANAGER') {
          throw new Error('Bulk assignment can create objectives only in manager-owned buckets');
        }

        const isManager = actor.actorId === quarterAssignment.assignedManagerId.toString();
        const isDelegate = await this.getObjectiveDelegation(
          actor.actorId,
          quarterAssignment.assignedManagerId.toString(),
          quarterAssignment.cycleId?.toString(),
        );

        if (!isManager && !isDelegate && accessService.mapRole(actor.actorRole) !== PmsRole.ADMIN) {
          throw new Error('Only the manager or their delegate can assign manager objectives');
        }

        await this.assertAssignmentAccess('objective.create', quarterAssignment);
        await this.assertObjectiveWindow(quarterAssignment, 'setting');
        this.validateCreateAgainstConfig(source, objectiveConfig);

        if (quarterAssignment.quarterState === QuarterWorkflowState.NOT_STARTED) {
          await this.ensureQuarterState(
            quarterAssignment._id.toString(),
            quarterAssignment.quarterState,
            QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
          );
        }

        let actingDelegateUserId: Types.ObjectId | undefined;
        let originalOwnerUserId: Types.ObjectId | undefined;
        if (isDelegate && !isManager) {
          actingDelegateUserId = actorObjectId;
          originalOwnerUserId = quarterAssignment.assignedManagerId;
        }

        const objectiveInputsForAssignment = objectiveInputs;

        for (const objectiveInput of objectiveInputsForAssignment) {
          try {
            this.validateContextObjectivePayload(
              objectiveInput as unknown as Record<string, unknown>,
              source,
            );
            this.validateObjectiveInput({
              ...objectiveInput,
              quarterAssignmentId,
            });
            this.validateContextObjectiveRequiredFields(objectiveInput, source);

            const objective = await Objective.create({
              quarterAssignmentId: quarterAssignment._id,
              annualAssignmentId: quarterAssignment.annualAssignmentId,
              cycleId: quarterAssignment.cycleId,
              quarterCode: quarterAssignment.quarterCode,
              employeeId: quarterAssignment.employeeId,
              assignedManagerId: quarterAssignment.assignedManagerId,
              objectiveNo: await this.getNextObjectiveNo(quarterAssignment._id),
              source,
              title: objectiveInput.title.trim(),
              description: objectiveInput.description?.trim(),
              priority: this.normalizeObjectivePriority(objectiveInput.priority),
              expectedOutcome: objectiveInput.expectedOutcome?.trim(),
              targetMetric: undefined,
              targetValue: undefined,
              targetDate: undefined,
              weightage: undefined,
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
              quarterAssignment,
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
              quarterAssignmentId,
              objectiveId: objective._id.toString(),
              employeeId: quarterAssignment.employeeId.toString(),
              employeeName: this.getEmployeeName(annualAssignment, quarterAssignment.employeeId.toString()),
              objectiveTitle: objective.title,
              clientObjectiveId: objectiveInput.clientObjectiveId,
            });
          } catch (error) {
            failed.push({
              quarterAssignmentId,
              employeeId: quarterAssignment.employeeId.toString(),
              employeeName: this.getEmployeeName(annualAssignment, quarterAssignment.employeeId.toString()),
              objectiveTitle: objectiveInput.title,
              clientObjectiveId: objectiveInput.clientObjectiveId,
              reason: error instanceof Error ? error.message : 'Unexpected error',
            });
          }
        }

      } catch (error) {
        failed.push({
          quarterAssignmentId,
          employeeId: quarterAssignment?.employeeId?.toString(),
          employeeName: quarterAssignment && annualAssignment
            ? this.getEmployeeName(annualAssignment, quarterAssignment.employeeId.toString())
            : undefined,
          reason: error instanceof Error ? error.message : 'Unexpected error',
        });
      }
    }

    return { created, updated, failed };
  }

  async closeObjectiveSetting(
    quarterAssignmentId: string,
    input: CloseObjectiveSettingInput = {},
  ): Promise<IQuarterAssignment> {
    const confirmed = input.confirm === true || input.confirmationAccepted === true;
    if (!confirmed) {
      throw new Error(
        'Confirmation is required to close objective setting. Predefined objectives are approved. No additional objectives will be accepted after moving forward.',
      );
    }

    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    const actor = this.requireActor();
    const actorObjectId = this.toObjectId(actor.actorId, 'actorId');
    const mappedRole = accessService.mapRole(actor.actorRole);
    const isAdmin = mappedRole === PmsRole.ADMIN;
    const isAssignedManager =
      actor.actorId === quarterAssignment.assignedManagerId.toString();
    const isDelegate = await this.getObjectiveDelegation(
      actor.actorId,
      quarterAssignment.assignedManagerId.toString(),
      quarterAssignment.cycleId?.toString(),
    );

    if (!isAdmin && !isAssignedManager && !isDelegate) {
      throw new Error('Only the assigned manager or HR/Admin can close objective setting');
    }

    if (quarterAssignment.quarterState !== QuarterWorkflowState.OBJECTIVE_SETTING_OPEN) {
      throw new Error(
        `Objective setting can be closed only from ${QuarterWorkflowState.OBJECTIVE_SETTING_OPEN}. Current state: ${quarterAssignment.quarterState}`,
      );
    }

    const objectives = await Objective.find({
      quarterAssignmentId: quarterAssignment._id,
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

    const reason =
      input.reason?.trim() ||
      'Predefined objectives are approved. No additional objectives will be accepted after moving forward.';
    const previousState = quarterAssignment.quarterState;

    await transitionQuarterAssignmentState(
      quarterAssignment._id.toString(),
      QuarterWorkflowState.OBJECTIVE_APPROVED,
      actor,
      reason,
      'CLOSE_OBJECTIVE_SETTING',
    );

    const approvedQuarterAssignment = await this.getQuarterAssignment(
      quarterAssignment._id.toString(),
    );
    if (approvedQuarterAssignment.quarterState !== QuarterWorkflowState.OBJECTIVE_APPROVED) {
      throw new Error(
        `Objective setting cannot be closed from state ${approvedQuarterAssignment.quarterState}`,
      );
    }

    const closedQuarterAssignment = await this.getQuarterAssignment(
      approvedQuarterAssignment._id.toString(),
    );
    closedQuarterAssignment.objectiveSettingClosedBy = actorObjectId;
    closedQuarterAssignment.objectiveSettingClosedAt = new Date();
    closedQuarterAssignment.objectiveSettingCloseReason = reason;
    closedQuarterAssignment.objectiveSettingCloseSource = isAdmin
      ? 'ADMIN'
      : 'MANAGER';
    closedQuarterAssignment.updatedBy = actorObjectId;
    closedQuarterAssignment.version += 1;
    await closedQuarterAssignment.save();

    await this.audit(
      'PMS_OBJECTIVE_SETTING_CLOSED',
      'QUARTER_ASSIGNMENT',
      closedQuarterAssignment._id.toString(),
      { quarterState: previousState },
      {
        quarterState: closedQuarterAssignment.quarterState,
        objectiveSettingClosedAt: closedQuarterAssignment.objectiveSettingClosedAt,
        objectiveSettingCloseSource: closedQuarterAssignment.objectiveSettingCloseSource,
      },
      reason,
    );

    return closedQuarterAssignment;
  }

  async updateObjective(objectiveId: string, input: UpdateObjectiveInput): Promise<IObjective> {
    const objective = await this.getObjective(objectiveId);
    const quarterAssignment = await this.getQuarterAssignment(objective.quarterAssignmentId.toString());
    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, quarterAssignment);
    const actor = this.requireActor();

    await this.assertObjectiveAccess('objective.edit', objective, false);
    this.assertRegularObjectiveEditAccess(objective);
    await this.assertObjectiveWindow(quarterAssignment, 'setting');

    // Predefined gating check
    if (objective.source === ObjectiveSource.PREDEFINED || objectiveConfig.mode === 'PREDEFINED') {
      if (accessService.mapRole(actor.actorRole) !== PmsRole.ADMIN) {
        throw new Error('Predefined objectives are read-only and cannot be modified');
      }
    }
    this.validateContextObjectivePayload(
      input as unknown as Record<string, unknown>,
      objective.source as ObjectiveSourceType,
    );
    this.validateObjectiveInput({
      quarterAssignmentId: objective.quarterAssignmentId.toString(),
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
      objective.source === ObjectiveSource.PREDEFINED ? input.weightage ?? objective.weightage : undefined,
    );

    let actingDelegateUserId: Types.ObjectId | undefined;
    let originalOwnerUserId: Types.ObjectId | undefined;

    if (actor.actorId !== objective.assignedManagerId.toString()) {
      const delegation = await this.getObjectiveDelegation(
        actor.actorId,
        objective.assignedManagerId.toString(),
        objective.cycleId?.toString(),
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
      quarterAssignment,
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

  async submitObjective(objectiveId: string): Promise<IObjective> {
    const objective = await this.getObjective(objectiveId);
    const quarterAssignment = await this.getQuarterAssignment(objective.quarterAssignmentId.toString());
    await this.assertObjectiveAccess('objective.submit', objective, true);
    await this.assertObjectiveWindow(quarterAssignment, 'setting');

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
    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, quarterAssignment);
    if (objective.source === ObjectiveSource.PREDEFINED) {
      await this.validateQuarterObjectiveRules(
        quarterAssignment,
        objective.weightage,
        objective._id.toString(),
        objective.source as ObjectiveSourceType,
        objectiveConfig,
        true,
      );
    }

    await this.transitionQuarterIfNeeded(
      objective.quarterAssignmentId.toString(),
      QuarterWorkflowState.OBJECTIVE_SUBMITTED,
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

  async approveObjective(objectiveId: string): Promise<IObjective> {
    const objective = await this.getObjective(objectiveId);
    const quarterAssignment = await this.getQuarterAssignment(objective.quarterAssignmentId.toString());
    await this.assertObjectiveAccess('objective.approve', objective, false);
    await this.assertObjectiveWindow(quarterAssignment, 'approval');

    if (objective.status !== ObjectiveStatus.OBJECTIVE_SUBMITTED) {
      throw new Error('Only submitted objectives can be approved');
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
      );

      if (delegation) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = objective.assignedManagerId;
      }
    }

    const previousState = objective.status;
    objective.status = ObjectiveStatus.OBJECTIVE_APPROVED;
    objective.approvedAt = new Date();
    objective.approvedBy = actorObjectId;
    objective.updatedBy = actorObjectId;
    if (actingDelegateUserId) {
      objective.actingDelegateUserId = actingDelegateUserId;
      objective.originalOwnerUserId = originalOwnerUserId;
    }
    objective.version += 1;
    await objective.save();

    await this.updateQuarterStateAfterApproval(objective.quarterAssignmentId.toString());

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
    const quarterAssignment = await this.getQuarterAssignment(objective.quarterAssignmentId.toString());
    await this.assertObjectiveAccess('objective.return', objective, false);
    await this.assertObjectiveWindow(quarterAssignment, 'approval');

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
      );

      if (delegation) {
        actingDelegateUserId = actorObjectId;
        originalOwnerUserId = objective.assignedManagerId;
      }
    }

    await this.transitionQuarterIfNeeded(
      objective.quarterAssignmentId.toString(),
      QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED,
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
      quarterAssignmentId: objective.quarterAssignmentId.toString(),
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
    quarterAssignments: Array<IQuarterAssignment | Record<string, any>>,
  ): Promise<void> {
    if (annualAssignments.length === 0 || quarterAssignments.length === 0) {
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

    const [templateVersions, existingObjectives] = await Promise.all([
      PmsTemplateVersion.find({
        _id: { $in: templateVersionIds },
        isDeleted: false,
      }).lean(),
      Objective.find({
        quarterAssignmentId: { $in: quarterAssignments.map((item) => item._id) },
        isDeleted: false,
      })
        .select('quarterAssignmentId source templateObjectiveKey objectiveNo')
        .lean(),
    ]);

    const templateVersionMap = new Map(
      templateVersions.map((item) => [item._id.toString(), item]),
    );
    const annualAssignmentMap = new Map(
      annualAssignments.map((item) => [item._id.toString(), item]),
    );
    const predefinedKeysByQuarterAssignment = new Map<string, Set<string>>();
    const maxObjectiveNoByQuarterAssignment = new Map<string, number>();

    for (const objective of existingObjectives) {
      const quarterAssignmentId = objective.quarterAssignmentId.toString();
      const currentMax = maxObjectiveNoByQuarterAssignment.get(quarterAssignmentId) ?? 0;
      maxObjectiveNoByQuarterAssignment.set(
        quarterAssignmentId,
        Math.max(currentMax, objective.objectiveNo ?? 0),
      );

      if (
        objective.source === ObjectiveSource.PREDEFINED &&
        typeof objective.templateObjectiveKey === 'string' &&
        objective.templateObjectiveKey.trim().length > 0
      ) {
        const existingKeys = predefinedKeysByQuarterAssignment.get(quarterAssignmentId) ?? new Set<string>();
        existingKeys.add(objective.templateObjectiveKey);
        predefinedKeysByQuarterAssignment.set(quarterAssignmentId, existingKeys);
      }
    }

    const actorId = this.toObjectId(this.requireActor().actorId, 'actorId');
    const now = new Date();
    const objectivePayloads: Array<Record<string, unknown>> = [];

    for (const quarterAssignment of quarterAssignments) {
      const annualAssignment = annualAssignmentMap.get(quarterAssignment.annualAssignmentId.toString());
      const templateVersion = annualAssignment?.templateVersionId
        ? templateVersionMap.get(annualAssignment.templateVersionId.toString())
        : undefined;
      const objectiveConfig = templateVersion
        ? this.resolveTemplateObjectiveConfig(templateVersion.sections ?? [], quarterAssignment.quarterCode)
        : undefined;

      if (!objectiveConfig || objectiveConfig.predefinedObjectives.length === 0) {
        continue;
      }

      const quarterAssignmentId = quarterAssignment._id.toString();
      const existingKeys = predefinedKeysByQuarterAssignment.get(quarterAssignmentId) ?? new Set<string>();
      let nextObjectiveNo = maxObjectiveNoByQuarterAssignment.get(quarterAssignmentId) ?? 0;

      for (const predefinedObjective of objectiveConfig.predefinedObjectives) {
        if (
          !this.matchesPredefinedObjectiveQuarter(
            quarterAssignment.quarterCode,
            predefinedObjective.applicableQuarters,
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
          quarterAssignmentId: quarterAssignment._id,
          annualAssignmentId: quarterAssignment.annualAssignmentId,
          cycleId: quarterAssignment.cycleId,
          templateVersionId: annualAssignment?.templateVersionId,
          quarterCode: quarterAssignment.quarterCode,
          employeeId: quarterAssignment.employeeId,
          assignedManagerId: quarterAssignment.assignedManagerId,
          objectiveNo: nextObjectiveNo,
          source: ObjectiveSource.PREDEFINED,
          templateObjectiveKey: predefinedObjective.key,
          isPredefined: true,
          title: predefinedObjective.title.trim(),
          description: predefinedObjective.description,
          targetMetric: predefinedObjective.kpi,
          targetValue: predefinedObjective.targetValue,
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

      maxObjectiveNoByQuarterAssignment.set(quarterAssignmentId, nextObjectiveNo);
      predefinedKeysByQuarterAssignment.set(quarterAssignmentId, existingKeys);
    }

    if (objectivePayloads.length > 0) {
      await Objective.insertMany(objectivePayloads);
    }
  }

  private async buildObjectiveConfigMap(
    annualAssignments: Array<IAnnualAssignment | Record<string, any>>,
    quarterAssignments: Array<IQuarterAssignment | Record<string, any>>,
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

    for (const quarterAssignment of quarterAssignments) {
      const annualAssignment = annualAssignmentMap.get(quarterAssignment.annualAssignmentId.toString());
      const templateVersion = annualAssignment?.templateVersionId
        ? templateVersionMap.get(annualAssignment.templateVersionId.toString())
        : undefined;
      const config = templateVersion
        ? this.resolveTemplateObjectiveConfig(templateVersion.sections ?? [], quarterAssignment.quarterCode)
        : undefined;
      configMap.set(
        quarterAssignment._id.toString(),
        config ?? this.defaultObjectiveConfig(),
      );
    }

    return configMap;
  }

  private defaultObjectiveConfig(): ObjectiveConfig {
    return {
      mode: 'DYNAMIC',
      allowEmployeeCreated: true,
      allowManagerCreated: true,
      predefinedObjectives: [],
      objectiveBuckets: this.defaultObjectiveBuckets(),
    };
  }

  private defaultObjectiveBuckets(): IObjectiveBucket[] {
    return [
      {
        bucketKey: 'template_predefined',
        label: 'Template Predefined Objectives',
        source: 'TEMPLATE_PREDEFINED',
        owner: 'SYSTEM',
        bucketWeightage: 20,
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
        bucketWeightage: 50,
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
        bucketWeightage: 30,
        rowWeightMode: 'OWNER_ENTERED',
        editableBy: ['MANAGER'],
        requiresManagerApproval: false,
        autoApprove: true,
      },
    ];
  }

  private resolveTemplateObjectiveConfig(
    sections: ITemplateSection[],
    quarterCode: AssessmentTermCodeValue,
  ): ObjectiveConfig | undefined {
    const objectiveSection = sections.find((section) => {
      if (section.sectionType !== PmsTemplateSectionType.OBJECTIVES) return false;
      if (section.level !== 'QUARTER') return false;

      const allowedQuarters = [
        ...(section.quarterScope ?? []),
        ...(section.repeatFor ?? []),
      ];

      return this.assessmentTermScopeMatches(allowedQuarters, quarterCode);
    });

    if (!objectiveSection?.objectiveConfig) {
      return undefined;
    }

    return {
      mode: objectiveSection.objectiveConfig.mode ?? 'DYNAMIC',
      allowEmployeeCreated: objectiveSection.objectiveConfig.allowEmployeeCreated !== false,
      allowManagerCreated: objectiveSection.objectiveConfig.allowManagerCreated !== false,
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
          weightage: objective.weightage,
          successCriteria: objective.successCriteria,
          applicableQuarters: this.normalizeScopedQuarters(
            objective.quarterScope ?? objective.applicableQuarters ?? objective.repeatFor,
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

  private normalizeScopedQuarters(
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

  private matchesPredefinedObjectiveQuarter(
    quarterCode: AssessmentTermCodeValue,
    applicableQuarters?: AssessmentTermCodeValue[],
  ): boolean {
    if (typeof applicableQuarters === 'undefined') {
      return true;
    }

    if (applicableQuarters.length === 0) {
      return false;
    }

    return this.assessmentTermScopeMatches(applicableQuarters, quarterCode);
  }

  private assessmentTermScopeMatches(
    scopedTerms: AssessmentTermCodeValue[],
    termCode: AssessmentTermCodeValue,
  ): boolean {
    if (scopedTerms.length === 0) {
      return true;
    }

    if (scopedTerms.includes(termCode)) {
      return true;
    }

    const quarterlyTerms = [
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
    ] as AssessmentTermCodeValue[];
    const allQuarterlyTermsSelected = quarterlyTerms.every((quarter) =>
      scopedTerms.includes(quarter),
    );

    return allQuarterlyTermsSelected && (
      termCode === AssessmentTermCode.H1 ||
      termCode === AssessmentTermCode.H2 ||
      termCode === AssessmentTermCode.Y1
    );
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
      assignmentId: objective.quarterAssignmentId.toString(),
      quarterAssignmentId: objective.quarterAssignmentId.toString(),
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

  private mapQuarterWindows(quarterCycle?: Record<string, any>) {
    if (!quarterCycle) return undefined;

    const mapWindow = (window?: { startDate?: Date; endDate?: Date }) => {
      if (!window?.startDate || !window?.endDate) return undefined;
      return {
        startDate: new Date(window.startDate).toISOString(),
        endDate: new Date(window.endDate).toISOString(),
      };
    };

    const achievementSubmissionWindow = quarterCycle.achievementSubmissionWindow
      ? {
          enabled: quarterCycle.achievementSubmissionWindow.enabled === true,
          startDate: quarterCycle.achievementSubmissionWindow.startDate
            ? new Date(quarterCycle.achievementSubmissionWindow.startDate).toISOString()
            : undefined,
          endDate: quarterCycle.achievementSubmissionWindow.endDate
            ? new Date(quarterCycle.achievementSubmissionWindow.endDate).toISOString()
            : undefined,
          dueDate: quarterCycle.achievementSubmissionWindow.dueDate
            ? new Date(quarterCycle.achievementSubmissionWindow.dueDate).toISOString()
            : undefined,
          graceDays: quarterCycle.achievementSubmissionWindow.graceDays,
          reminderDaysBefore: quarterCycle.achievementSubmissionWindow.reminderDaysBefore,
          escalationDaysAfterDue: quarterCycle.achievementSubmissionWindow.escalationDaysAfterDue,
        }
      : undefined;

    return {
      objectiveSetting: mapWindow(quarterCycle.objectiveSettingWindow),
      objectiveApproval: mapWindow(quarterCycle.objectiveApprovalWindow),
      achievementSubmission: achievementSubmissionWindow,
      managerReview: mapWindow(quarterCycle.managerReviewWindow),
      quarterFinalization: mapWindow(quarterCycle.quarterFinalizationWindow),
    };
  }

  private getCycleName(annualAssignment?: IAnnualAssignment | Record<string, any> | null): string {
    const snapshot = annualAssignment?.orgSnapshot as Record<string, any> | undefined;
    const assignmentRecord = annualAssignment as Record<string, any> | undefined;
    return String(
      snapshot?.cycleName ??
      assignmentRecord?.cycleName ??
      assignmentRecord?.cycleCode ??
      'Performance Cycle',
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
  ): void {
    if (
      source !== ObjectiveSource.EMPLOYEE_CREATED &&
      source !== ObjectiveSource.MANAGER_CREATED
    ) {
      return;
    }

    const blockedFields = [
      'weightage',
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
    quarterAssignment: IQuarterAssignment,
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
      quarterAssignmentId: quarterAssignment._id,
      annualAssignmentId: quarterAssignment.annualAssignmentId,
      cycleId: quarterAssignment.cycleId,
      employeeId: quarterAssignment.employeeId,
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
    quarterAssignment: IQuarterAssignment,
    newWeightage?: number,
    editingObjectiveId?: string,
    source?: ObjectiveSourceType,
    objectiveConfig?: ObjectiveConfig,
    requireExactBucketTotal = false,
  ): Promise<void> {
    if (
      quarterAssignment.quarterState === QuarterWorkflowState.QUARTER_FINALIZED ||
      quarterAssignment.quarterState === QuarterWorkflowState.CLOSED_BY_ADMIN ||
      quarterAssignment.quarterState === QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED
    ) {
      throw new Error('Cannot create or edit objectives for finalized quarters');
    }

    if (newWeightage === undefined) return;

    if (source && objectiveConfig?.objectiveBuckets?.length) {
      await this.validateBucketObjectiveWeightage(
        quarterAssignment,
        source,
        objectiveConfig,
        newWeightage,
        editingObjectiveId,
        requireExactBucketTotal,
      );
      return;
    }

    const existingObjectives = await Objective.find({
      quarterAssignmentId: quarterAssignment._id,
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

  private async validateBucketObjectiveWeightage(
    quarterAssignment: IQuarterAssignment,
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
      quarterAssignmentId: quarterAssignment._id,
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
      quarterAssignmentIds: _quarterAssignmentIds,
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

    const quarterAssignment = await this.getQuarterAssignment(objective.quarterAssignmentId.toString());
    await this.validateQuarterObjectiveRules(
      quarterAssignment,
      nextWeightage,
      objective._id.toString(),
      objective.source as ObjectiveSourceType,
      objectiveConfig,
      false,
    );
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

  private async getNextObjectiveNo(quarterAssignmentId: Types.ObjectId): Promise<number> {
    const lastObjective = await Objective.findOne({
      quarterAssignmentId,
      isDeleted: false,
    })
      .sort({ objectiveNo: -1 })
      .select('objectiveNo')
      .lean();

    return (lastObjective?.objectiveNo ?? 0) + 1;
  }

  private async ensureQuarterState(
    quarterAssignmentId: string,
    currentState: QuarterWorkflowState,
    targetState: QuarterWorkflowState,
  ): Promise<void> {
    if (currentState === targetState) return;

    if (currentState === QuarterWorkflowState.NOT_STARTED) {
      await transitionQuarterAssignmentState(
        quarterAssignmentId,
        QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
        this.requireActor(),
      );
    }

    const refreshedQuarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    if (refreshedQuarterAssignment.quarterState === targetState) return;

    await this.transitionQuarterIfNeeded(
      quarterAssignmentId,
      targetState,
    );
  }

  private async transitionQuarterIfNeeded(
    quarterAssignmentId: string,
    targetState: QuarterWorkflowState,
    reason?: string,
  ): Promise<void> {
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    if (quarterAssignment.quarterState === targetState) {
      return;
    }

    if (quarterAssignment.quarterState === QuarterWorkflowState.OBJECTIVE_SETTING_OPEN) {
      return;
    }

    const allowedTransitions: Partial<Record<QuarterWorkflowState, QuarterWorkflowState[]>> = {
      [QuarterWorkflowState.NOT_STARTED]: [QuarterWorkflowState.OBJECTIVE_SETTING_OPEN],
      [QuarterWorkflowState.OBJECTIVE_SETTING_OPEN]: [
        QuarterWorkflowState.OBJECTIVE_DRAFT,
        QuarterWorkflowState.OBJECTIVE_SUBMITTED,
        QuarterWorkflowState.OBJECTIVE_APPROVED,
      ],
      [QuarterWorkflowState.OBJECTIVE_DRAFT]: [QuarterWorkflowState.OBJECTIVE_SUBMITTED],
      [QuarterWorkflowState.OBJECTIVE_SUBMITTED]: [
        QuarterWorkflowState.OBJECTIVE_APPROVED,
        QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED,
      ],
      [QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED]: [QuarterWorkflowState.OBJECTIVE_SUBMITTED],
      [QuarterWorkflowState.OBJECTIVE_APPROVED]: [
        QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
        QuarterWorkflowState.MANAGER_REVIEW_OPEN,
      ],
      [QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN]: [
        QuarterWorkflowState.MANAGER_REVIEW_OPEN,
      ],
    };

    const nextStates = allowedTransitions[quarterAssignment.quarterState] ?? [];
    if (!nextStates.includes(targetState)) {
      return;
    }

    await transitionQuarterAssignmentState(
      quarterAssignmentId,
      targetState,
      this.requireActor(),
      reason,
    );
  }

  private async updateQuarterStateAfterApproval(quarterAssignmentId: string): Promise<void> {
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    if (quarterAssignment.quarterState === QuarterWorkflowState.OBJECTIVE_SETTING_OPEN) {
      return;
    }

    const objectives = await Objective.find({
      quarterAssignmentId,
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
      quarterAssignmentId,
      QuarterWorkflowState.OBJECTIVE_APPROVED,
      'All submitted objectives are approved; waiting for manager/admin objective-setting close',
    );
  }

  private async getObjectiveConfigForAssignment(
    annualAssignment: IAnnualAssignment,
    quarterAssignment: IQuarterAssignment,
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
      quarterAssignment.quarterCode,
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
      quarterAssignmentId: objective.quarterAssignmentId,
      annualAssignmentId: objective.annualAssignmentId,
      cycleId: objective.cycleId,
      quarterCode: objective.quarterCode,
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

  private async assertAssignmentAccess(action: string, quarterAssignment: IQuarterAssignment): Promise<void> {
    const actor = this.requireActor();
    const access = await accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: quarterAssignment.employeeId.toString(),
        managerId: quarterAssignment.assignedManagerId.toString(),
      },
    });

    if (access.allowed) {
      return;
    }

    // Check delegation
    const delegation = await this.getObjectiveDelegation(
      actor.actorId,
      quarterAssignment.assignedManagerId.toString(),
      quarterAssignment.cycleId?.toString(),
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

  private async getQuarterAssignment(quarterAssignmentId: string): Promise<IQuarterAssignment> {
    if (!Types.ObjectId.isValid(quarterAssignmentId)) {
      throw new Error('Invalid quarterAssignmentId');
    }

    const quarterAssignment = await QuarterAssignment.findById(quarterAssignmentId);
    if (!quarterAssignment || quarterAssignment.isDeleted) {
      throw new Error('Quarter assignment not found');
    }

    return quarterAssignment;
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

  private async assertObjectiveWindow(
    quarterAssignment: IQuarterAssignment,
    windowType: 'setting' | 'approval',
  ): Promise<void> {
    if (!quarterAssignment.cycleQuarterId) {
      return;
    }

    const quarterCycle = await QuarterCycle.findById(quarterAssignment.cycleQuarterId)
      .select('objectiveSettingWindow objectiveApprovalWindow')
      .lean();
    if (!quarterCycle) {
      return;
    }

    const window = windowType === 'setting'
      ? quarterCycle.objectiveSettingWindow
      : quarterCycle.objectiveApprovalWindow;

    if (!window?.startDate || !window?.endDate) {
      return;
    }

    const now = this.getCurrentDate();
    const start = new Date(window.startDate);
    const end = new Date(window.endDate);

    if (now < start || now > end) {
      throw new Error(
        windowType === 'setting'
          ? 'Objective setting window is closed for this quarter'
          : 'Objective approval window is closed for this quarter',
      );
    }
  }

  private async getObjectiveDelegation(
    delegateUserId: string,
    delegatorUserId: string,
    cycleId?: string,
  ): Promise<any | null> {
    return new DelegationService(this.context).getActiveDelegation(
      delegateUserId,
      delegatorUserId,
      'PMS_OBJECTIVES',
      cycleId,
    );
  }

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private resolveObjectiveSource(
    actorRole: string,
    quarterAssignment: IQuarterAssignment,
  ): ObjectiveSourceType {
    const actor = this.requireActor();
    const actorId = actor.actorId;

    if (actorId === quarterAssignment.employeeId.toString()) {
      return ObjectiveSource.EMPLOYEE_CREATED;
    }

    if (
      actorId === quarterAssignment.assignedManagerId.toString() ||
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
      const objective = await Objective.findById(entityId).select('assignedManagerId').lean();
      if (objective && actor.actorId !== objective.assignedManagerId?.toString()) {
        const delegation = await this.getObjectiveDelegation(
          actor.actorId,
          objective.assignedManagerId.toString()
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

    if (entityType === 'QUARTER_ASSIGNMENT') {
      const quarterAssignment = await QuarterAssignment.findById(entityId)
        .select('annualAssignmentId')
        .lean();
      return quarterAssignment?.annualAssignmentId?.toString();
    }

    if (entityType === 'OBJECTIVE') {
      const objective = await Objective.findById(entityId)
        .select('annualAssignmentId quarterAssignmentId')
        .lean();

      if (objective?.annualAssignmentId) {
        return objective.annualAssignmentId.toString();
      }

      if (objective?.quarterAssignmentId) {
        const quarterAssignment = await QuarterAssignment.findById(objective.quarterAssignmentId)
          .select('annualAssignmentId')
          .lean();
        return quarterAssignment?.annualAssignmentId?.toString();
      }
    }

    return undefined;
  }
}
