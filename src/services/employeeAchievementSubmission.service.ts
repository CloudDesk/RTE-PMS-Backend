import { MultipartFile } from '@fastify/multipart';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AssessmentTermCode,
  normalizePmsRole,
  ObjectiveSource,
  ObjectiveStatus,
  PmsRole,
  QuarterWorkflowState,
} from '../constants/pms.enums';
import type { AssessmentTermCode as AssessmentTermCodeType } from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { Objective } from '../models/pms-objective.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import { PmsTemplateVersion, type ITemplateField, type ITemplateSection } from '../models/pms-template-version.model';
import {
  AchievementItemType,
  EmployeeAchievementSubmission,
  EmployeeAchievementSubmissionStatus,
  type IEmployeeAchievementSubmission,
} from '../models/pms-employee-achievement-submission.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { DelegationService } from './delegation.service';
import { gcpFileStorageService } from './gcp-file-storage.service';

interface AchievementAttachmentInput {
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  documentId?: string;
  uploadedAt?: Date | string;
}

interface AchievementItemInput {
  type?: 'OBJECTIVE' | 'ADDITIONAL';
  objectiveId?: string | Types.ObjectId;
  objectiveSnapshot?: AchievementObjectiveSnapshotInput;
  subject?: string;
  description?: string;
  outcome?: string;
  attachments?: AchievementAttachmentInput[];
}

interface AchievementObjectiveSnapshotInput {
  title?: string;
  description?: string;
  expectedOutcome?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDate?: Date | string;
  weightage?: number;
  source?: string;
}

interface AchievementValueInput {
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

export interface SaveAchievementDraftInput {
  achievementItems?: AchievementItemInput[];
  achievementValues?: AchievementValueInput[];
}

export interface SubmitAchievementInput extends SaveAchievementDraftInput {}

type AchievementTemplateConfig = {
  reviewFlowMode: 'MANAGER_ONLY' | 'ACHIEVEMENT_THEN_MANAGER';
  employeeAchievementEnabled: boolean;
  achievementSubmissionRequired: boolean;
  objectiveLinkedAchievementRequired: boolean;
  additionalContributionsEnabled: boolean;
  allowManagerReviewWithoutAchievement: boolean;
  managerCanEditEmployeeAchievement: false;
};

type AchievementObjectiveRecord = {
  id: string;
  objectiveNo?: number;
  title: string;
  description?: string;
  expectedOutcome?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDate?: string;
  weightage?: number;
  source?: string;
  isPredefined?: boolean;
  isScoreable: boolean;
};

type AchievementSubmissionRecord = {
  id: string;
  annualAssignmentId: string;
  quarterAssignmentId: string;
  cycleId?: string;
  employeeId: string;
  managerId: string;
  templateVersionId?: string;
  quarterCode: AssessmentTermCodeType;
  status: string;
  achievementItems: Array<{
    type: 'OBJECTIVE' | 'ADDITIONAL';
    objectiveId?: string;
    objectiveSnapshot?: AchievementObjectiveSnapshotInput;
    subject: string;
    description: string;
    outcome?: string;
    attachments: Array<{
      fileName?: string;
      fileUrl?: string;
      fileType?: string;
      fileSize?: number;
      documentId?: string;
      uploadedAt?: string;
    }>;
  }>;
  achievementValues: Array<{
    templateFieldId?: string;
    fieldKey: string;
    sectionKey: string;
    roleCode: string;
    actorUserId: string;
    workflowStage: string;
    valueJson?: unknown;
    valueText?: string;
    valueNumber?: number;
    valueDate?: string;
    valueStatus: string;
    submittedAt?: string;
  }>;
  draftSavedAt?: string;
  submittedBy?: string;
  submittedAt?: string;
  lockedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type AchievementSubmissionDetail = {
  quarterAssignmentId: string;
  annualAssignmentId: string;
  cycleId?: string;
  quarterCode: AssessmentTermCodeType;
  employeeId: string;
  managerId: string;
  templateVersionId?: string;
  reviewFlowMode: 'MANAGER_ONLY' | 'ACHIEVEMENT_THEN_MANAGER';
  employeeAchievementConfig: AchievementTemplateConfig;
  section: {
    key: string;
    title: string;
    fieldKey: string;
    fieldLabel: string;
  };
  objectives: AchievementObjectiveRecord[];
  submission: AchievementSubmissionRecord | null;
  canEdit: boolean;
};

export type UploadedAchievementAttachment = {
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: number;
  documentId: string;
  uploadedAt: string;
};

export class EmployeeAchievementSubmissionService extends BaseService {
  private static readonly SECTION_KEY = 'employee_achievement_submission';
  private static readonly FIELD_KEY = 'achievement_items';

  constructor(context: RequestContext) {
    super(context);
  }

  async getSubmission(quarterAssignmentId: string): Promise<AchievementSubmissionDetail> {
    let quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    await this.assertViewAccess(quarterAssignment);

    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, quarterAssignment.quarterCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    quarterAssignment = await this.ensureAchievementStageOpen(quarterAssignment, config);

    const submission = await EmployeeAchievementSubmission.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    }).lean();
    const actor = this.requireActor();
    const objectives = await this.getApprovedObjectives(quarterAssignment._id);

    return {
      quarterAssignmentId: quarterAssignment._id.toString(),
      annualAssignmentId: quarterAssignment.annualAssignmentId.toString(),
      cycleId: quarterAssignment.cycleId?.toString(),
      quarterCode: quarterAssignment.quarterCode,
      employeeId: quarterAssignment.employeeId.toString(),
      managerId: quarterAssignment.assignedManagerId.toString(),
      templateVersionId: annualAssignment.templateVersionId?.toString(),
      reviewFlowMode: config.reviewFlowMode,
      employeeAchievementConfig: config,
      section: {
        key: section.sectionKey,
        title: section.sectionLabel,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
      },
      objectives,
      submission: submission ? this.mapSubmissionRecord(submission) : null,
      canEdit:
        actor.actorId === quarterAssignment.employeeId.toString() &&
        quarterAssignment.quarterState === QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN &&
        (!submission || submission.status !== EmployeeAchievementSubmissionStatus.LOCKED),
    };
  }

  async saveDraft(
    quarterAssignmentId: string,
    input: SaveAchievementDraftInput,
  ): Promise<AchievementSubmissionRecord> {
    let quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);

    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, quarterAssignment.quarterCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    quarterAssignment = await this.ensureAchievementStageOpen(quarterAssignment, config);
    await this.assertEmployeeEditAccess(quarterAssignment);

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    });

    if (existingSubmission?.status === EmployeeAchievementSubmissionStatus.LOCKED) {
      await this.auditBlockedAttempt(existingSubmission, 'PMS_EMPLOYEE_ACHIEVEMENT_UPDATE_BLOCKED');
      throw new Error('Submitted employee achievement is locked and cannot be edited');
    }

    const approvedObjectives = await this.getApprovedObjectives(quarterAssignment._id);
    const normalizedItems = this.normalizeAchievementItems(
      input.achievementItems ?? [],
      false,
      approvedObjectives,
      config,
    );
    const normalizedValues = this.normalizeAchievementValues(
      input.achievementValues ?? [],
      normalizedItems,
      field,
      false,
    );

    this.validateAchievementPayload(
      section,
      field,
      normalizedItems,
      normalizedValues,
      false,
      config,
      approvedObjectives,
    );

    const actorObjectId = this.actorIdObject();
    const previousValue = existingSubmission?.toObject();
    const now = new Date();

    const submission = existingSubmission
      ? await EmployeeAchievementSubmission.findByIdAndUpdate(
          existingSubmission._id,
          {
            $set: {
              achievementItems: normalizedItems,
              achievementValues: normalizedValues,
              draftSavedAt: now,
              updatedBy: actorObjectId,
              auditMetadata: {
                todo: 'Strict achievement window enforcement will be implemented in a later PMS v3.1 runtime change.',
              },
            },
            $inc: { version: 1 },
          },
          { new: true, runValidators: true },
        )
      : await EmployeeAchievementSubmission.create({
          annualAssignmentId: quarterAssignment.annualAssignmentId,
          quarterAssignmentId: quarterAssignment._id,
          cycleId: quarterAssignment.cycleId,
          employeeId: quarterAssignment.employeeId,
          managerId: quarterAssignment.assignedManagerId,
          templateVersionId: annualAssignment.templateVersionId,
          quarterCode: quarterAssignment.quarterCode,
          achievementItems: normalizedItems,
          achievementValues: normalizedValues,
          status: EmployeeAchievementSubmissionStatus.DRAFT,
          draftSavedAt: now,
          auditMetadata: {
            todo: 'Strict achievement window enforcement will be implemented in a later PMS v3.1 runtime change.',
          },
          createdBy: actorObjectId,
          updatedBy: actorObjectId,
        });

    if (!submission) {
      throw new Error('Unable to save employee achievement draft');
    }

    await this.audit(
      'PMS_EMPLOYEE_ACHIEVEMENT_DRAFT_SAVED',
      'EMPLOYEE_ACHIEVEMENT_SUBMISSION',
      submission._id.toString(),
      previousValue,
      submission.toObject(),
    );

    return this.mapSubmissionRecord(submission.toObject());
  }

  async submit(
    quarterAssignmentId: string,
    input: SubmitAchievementInput,
  ): Promise<AchievementSubmissionRecord> {
    let quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);

    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, quarterAssignment.quarterCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    quarterAssignment = await this.ensureAchievementStageOpen(quarterAssignment, config);
    await this.assertEmployeeEditAccess(quarterAssignment);

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    });

    if (existingSubmission?.status === EmployeeAchievementSubmissionStatus.LOCKED) {
      await this.auditBlockedAttempt(existingSubmission, 'PMS_EMPLOYEE_ACHIEVEMENT_SUBMIT_BLOCKED_LOCKED');
      throw new Error('Achievement submission is already locked.');
    }

    await this.assertSubmitWindowOpen(quarterAssignment, existingSubmission);

    const approvedObjectives = await this.getApprovedObjectives(quarterAssignment._id);
    const submitItems = this.normalizeAchievementItems(
      input.achievementItems ?? existingSubmission?.achievementItems ?? [],
      true,
      approvedObjectives,
      config,
    );
    const submitValues = this.normalizeAchievementValues(
      input.achievementValues ?? [],
      submitItems,
      field,
      true,
    );

    this.validateAchievementPayload(
      section,
      field,
      submitItems,
      submitValues,
      true,
      config,
      approvedObjectives,
    );

    const actorObjectId = this.actorIdObject();
    const previousValue = existingSubmission?.toObject();
    const now = new Date();

    const submission = existingSubmission
      ? await EmployeeAchievementSubmission.findByIdAndUpdate(
          existingSubmission._id,
          {
            $set: {
              achievementItems: submitItems,
              achievementValues: submitValues,
              status: EmployeeAchievementSubmissionStatus.LOCKED,
              submittedBy: actorObjectId,
              submittedAt: now,
              lockedAt: now,
              updatedBy: actorObjectId,
              auditMetadata: {
                todo: 'Strict achievement window enforcement will be implemented in a later PMS v3.1 runtime change.',
              },
            },
            $inc: { version: 1 },
          },
          { new: true, runValidators: true },
        )
      : await EmployeeAchievementSubmission.create({
          annualAssignmentId: quarterAssignment.annualAssignmentId,
          quarterAssignmentId: quarterAssignment._id,
          cycleId: quarterAssignment.cycleId,
          employeeId: quarterAssignment.employeeId,
          managerId: quarterAssignment.assignedManagerId,
          templateVersionId: annualAssignment.templateVersionId,
          quarterCode: quarterAssignment.quarterCode,
          achievementItems: submitItems,
          achievementValues: submitValues,
          status: EmployeeAchievementSubmissionStatus.LOCKED,
          draftSavedAt: now,
          submittedBy: actorObjectId,
          submittedAt: now,
          lockedAt: now,
          auditMetadata: {
            todo: 'Strict achievement window enforcement will be implemented in a later PMS v3.1 runtime change.',
          },
          createdBy: actorObjectId,
          updatedBy: actorObjectId,
        });

    if (!submission) {
      throw new Error('Unable to submit employee achievement');
    }

    await this.audit(
      'PMS_EMPLOYEE_ACHIEVEMENT_SUBMITTED',
      'EMPLOYEE_ACHIEVEMENT_SUBMISSION',
      submission._id.toString(),
      previousValue,
      submission.toObject(),
    );

    return this.mapSubmissionRecord(submission.toObject());
  }

  async uploadAttachment(
    quarterAssignmentId: string,
    file: MultipartFile,
  ): Promise<UploadedAchievementAttachment> {
    let quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);

    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, quarterAssignment.quarterCode);
    this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    quarterAssignment = await this.ensureAchievementStageOpen(quarterAssignment, config);
    await this.assertEmployeeEditAccess(quarterAssignment);

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    });

    if (existingSubmission?.status === EmployeeAchievementSubmissionStatus.LOCKED) {
      await this.auditBlockedAttempt(existingSubmission, 'PMS_EMPLOYEE_ACHIEVEMENT_ATTACHMENT_UPLOAD_BLOCKED');
      throw new Error('Submitted employee achievement is locked and cannot be edited');
    }

    if (!file?.filename) {
      throw new Error('No attachment file uploaded');
    }

    const attachment = await gcpFileStorageService.uploadMultipartFile({
      file,
      employeeId: quarterAssignment.employeeId.toString(),
      category: 'PMS',
      type: 'EmployeeAchievement',
      public: true,
    });

    await this.audit(
      'PMS_EMPLOYEE_ACHIEVEMENT_ATTACHMENT_UPLOADED',
      'EMPLOYEE_ACHIEVEMENT_SUBMISSION',
      existingSubmission?._id?.toString() || quarterAssignment._id.toString(),
      undefined,
      {
        quarterAssignmentId: quarterAssignment._id.toString(),
        fileName: attachment.fileName,
        fileUrl: attachment.fileUrl,
        documentId: attachment.documentId,
      },
    );

    return attachment;
  }

  private mapSubmissionRecord(
    submission: Record<string, any>,
  ): AchievementSubmissionRecord {
    return {
      id: submission._id.toString(),
      annualAssignmentId: submission.annualAssignmentId.toString(),
      quarterAssignmentId: submission.quarterAssignmentId.toString(),
      cycleId: submission.cycleId?.toString(),
      employeeId: submission.employeeId.toString(),
      managerId: submission.managerId.toString(),
      templateVersionId: submission.templateVersionId?.toString(),
      quarterCode: submission.quarterCode,
      status: submission.status,
      achievementItems: (submission.achievementItems ?? []).map((item: Record<string, any>) => ({
        type: item.type === AchievementItemType.OBJECTIVE
          ? AchievementItemType.OBJECTIVE
          : AchievementItemType.ADDITIONAL,
        objectiveId: item.objectiveId?.toString?.(),
        objectiveSnapshot: item.objectiveSnapshot
          ? {
              title: item.objectiveSnapshot.title,
              description: item.objectiveSnapshot.description,
              expectedOutcome: item.objectiveSnapshot.expectedOutcome,
              targetMetric: item.objectiveSnapshot.targetMetric,
              targetValue: item.objectiveSnapshot.targetValue,
              targetDate: item.objectiveSnapshot.targetDate
                ? new Date(item.objectiveSnapshot.targetDate).toISOString()
                : undefined,
              weightage: item.objectiveSnapshot.weightage,
              source: item.objectiveSnapshot.source,
            }
          : undefined,
        subject: String(item.subject ?? ''),
        description: String(item.description ?? ''),
        outcome: item.outcome,
        attachments: (item.attachments ?? []).map((attachment: Record<string, any>) => ({
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
          documentId: attachment.documentId,
          uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt).toISOString() : undefined,
        })),
      })),
      achievementValues: (submission.achievementValues ?? []).map((value: Record<string, any>) => ({
        templateFieldId: value.templateFieldId,
        fieldKey: value.fieldKey,
        sectionKey: value.sectionKey,
        roleCode: value.roleCode,
        actorUserId: value.actorUserId?.toString?.() ?? '',
        workflowStage: value.workflowStage,
        valueJson: value.valueJson,
        valueText: value.valueText,
        valueNumber: value.valueNumber,
        valueDate: value.valueDate ? new Date(value.valueDate).toISOString() : undefined,
        valueStatus: value.valueStatus,
        submittedAt: value.submittedAt ? new Date(value.submittedAt).toISOString() : undefined,
      })),
      draftSavedAt: submission.draftSavedAt ? new Date(submission.draftSavedAt).toISOString() : undefined,
      submittedBy: submission.submittedBy?.toString?.(),
      submittedAt: submission.submittedAt ? new Date(submission.submittedAt).toISOString() : undefined,
      lockedAt: submission.lockedAt ? new Date(submission.lockedAt).toISOString() : undefined,
      createdAt: new Date(submission.createdAt).toISOString(),
      updatedAt: new Date(submission.updatedAt).toISOString(),
    };
  }

  private normalizeAchievementItems(
    items: AchievementItemInput[],
    isSubmit: boolean,
    approvedObjectives: AchievementObjectiveRecord[] = [],
    config?: AchievementTemplateConfig,
  ) {
    const objectiveById = new Map(approvedObjectives.map((objective) => [objective.id, objective]));
    const normalized = items.map((item, index) => {
      const itemType = item.type === AchievementItemType.OBJECTIVE || item.objectiveId
        ? AchievementItemType.OBJECTIVE
        : AchievementItemType.ADDITIONAL;
      const objectiveId = item.objectiveId ? String(item.objectiveId).trim() : undefined;
      const objective = objectiveId ? objectiveById.get(objectiveId) : undefined;
      const subject = itemType === AchievementItemType.OBJECTIVE
        ? String(objective?.title ?? item.subject ?? '').trim()
        : String(item.subject ?? '').trim();
      const description = String(item.description ?? '').trim();
      const outcome = String(item.outcome ?? '').trim();
      const attachments = (item.attachments ?? []).map((attachment) => ({
        fileName: attachment.fileName?.trim(),
        fileUrl: attachment.fileUrl?.trim(),
        fileType: attachment.fileType?.trim(),
        fileSize: attachment.fileSize === undefined ? undefined : Number(attachment.fileSize),
        documentId: attachment.documentId?.trim(),
        uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : undefined,
      }));

      const isEmptyAdditional =
        itemType === AchievementItemType.ADDITIONAL &&
        !subject &&
        !description &&
        !outcome &&
        attachments.every((attachment) => !attachment.fileName && !attachment.fileUrl && !attachment.documentId);
      const isEmptyObjective =
        itemType === AchievementItemType.OBJECTIVE &&
        !description &&
        !outcome &&
        attachments.every((attachment) => !attachment.fileName && !attachment.fileUrl && !attachment.documentId);

      if (!isSubmit && (isEmptyAdditional || isEmptyObjective)) {
        return null;
      }

      if (itemType === AchievementItemType.OBJECTIVE) {
        if (!objectiveId || !objective) {
          throw new Error(`Approved objective is required for achievement row ${index + 1}`);
        }
      }

      if (itemType === AchievementItemType.ADDITIONAL && config?.additionalContributionsEnabled === false) {
        throw new Error('Additional achievements are not enabled for this template');
      }

      if (isSubmit && !subject) {
        throw new Error(`Achievement Subject is required for row ${index + 1}`);
      }
      if (isSubmit && !description) {
        throw new Error(`Achievement Description is required for row ${index + 1}`);
      }

      return {
        type: itemType,
        objectiveId: itemType === AchievementItemType.OBJECTIVE && objectiveId
          ? new Types.ObjectId(objectiveId)
          : undefined,
        objectiveSnapshot: itemType === AchievementItemType.OBJECTIVE && objective
          ? this.buildObjectiveSnapshot(objective)
          : undefined,
        subject,
        description,
        outcome: outcome || undefined,
        attachments,
      };
    });

    return normalized.filter((item): item is Exclude<typeof item, null> => Boolean(item));
  }

  private normalizeAchievementValues(
    inputValues: AchievementValueInput[],
    achievementItems: Array<Record<string, any>>,
    field: ITemplateField,
    isSubmit: boolean,
  ) {
    const actor = this.requireActor();
    const actorUserId = this.toObjectId(actor.actorId, 'actorId');
    const now = new Date();
    const effectiveValues = inputValues.length > 0
      ? inputValues
      : [
          {
            templateFieldId: field.fieldKey,
            fieldKey: field.fieldKey,
            sectionKey: EmployeeAchievementSubmissionService.SECTION_KEY,
            roleCode: 'EMPLOYEE',
            workflowStage: isSubmit ? 'ACHIEVEMENT_SUBMITTED' : 'ACHIEVEMENT_DRAFT',
            valueJson: achievementItems,
            valueStatus: isSubmit ? 'ACTIVE' : 'DRAFT',
            valueDate: undefined,
          },
        ];

    return effectiveValues.map((value) => ({
      templateFieldId: value.templateFieldId,
      fieldKey: value.fieldKey,
      sectionKey: value.sectionKey,
      roleCode: value.roleCode?.trim() || 'EMPLOYEE',
      actorUserId,
      workflowStage: value.workflowStage?.trim() || (isSubmit ? 'ACHIEVEMENT_SUBMITTED' : 'ACHIEVEMENT_DRAFT'),
      valueJson: value.valueJson ?? achievementItems,
      valueText: value.valueText?.trim(),
      valueNumber: value.valueNumber === undefined || value.valueNumber === null
        ? undefined
        : Number(value.valueNumber),
      valueDate: value.valueDate ? new Date(value.valueDate) : undefined,
      valueStatus: value.valueStatus?.trim() || (isSubmit ? 'ACTIVE' : 'DRAFT'),
      submittedAt: isSubmit ? now : undefined,
    }));
  }

  private validateAchievementPayload(
    section: ITemplateSection,
    field: ITemplateField,
    items: Array<Record<string, any>>,
    values: Array<Record<string, any>>,
    isSubmit: boolean,
    config: AchievementTemplateConfig,
    approvedObjectives: AchievementObjectiveRecord[] = [],
  ): void {
    if (section.level !== 'QUARTER') {
      throw new Error('Employee Achievement Submission section must be quarter-level');
    }

    if (field.fieldType !== 'DATA_GRID') {
      throw new Error('Achievement Items field must use DATA_GRID');
    }

    for (const value of values) {
      if (value.sectionKey !== EmployeeAchievementSubmissionService.SECTION_KEY) {
        throw new Error('Only Employee Achievement Submission values can be saved through this API');
      }
      if (value.fieldKey !== field.fieldKey) {
        throw new Error('Only Achievement Items field values can be saved through this API');
      }
    }

    if (isSubmit && config.achievementSubmissionRequired && items.length === 0) {
      throw new Error('At least one achievement item is required before submission');
    }

    if (isSubmit && config.objectiveLinkedAchievementRequired) {
      const submittedObjectiveIds = new Set(
        items
          .filter((item) => item.type === AchievementItemType.OBJECTIVE && item.objectiveId && item.description)
          .map((item) => item.objectiveId.toString()),
      );
      const missingObjective = approvedObjectives.find(
        (objective) => objective.isScoreable && !submittedObjectiveIds.has(objective.id),
      );

      if (missingObjective) {
        throw new Error(`Achievement details are required for objective: ${missingObjective.title}`);
      }
    }

    const gridColumns = Array.isArray(field.gridConfig?.columns) ? field.gridConfig.columns : [];
    const subjectColumn = gridColumns.find((column) => column.key === 'achievement_subject');
    const descriptionColumn = gridColumns.find((column) => column.key === 'achievement_description');

    if (!subjectColumn || !descriptionColumn) {
      throw new Error('Achievement Items field is missing required grid columns');
    }
  }

  private resolveTemplateConfig(
    templateVersion: { metadata?: Record<string, unknown>; sections?: ITemplateSection[] } | null,
    section: ITemplateSection,
  ): AchievementTemplateConfig {
    const metadata = (templateVersion?.metadata ?? {}) as Record<string, any>;
    const sectionExists = Boolean(section);
    const employeeAchievementConfig = (metadata.employeeAchievementConfig ?? {}) as Record<string, any>;
    const reviewFlowMode = metadata.reviewFlowMode === 'ACHIEVEMENT_THEN_MANAGER' || sectionExists
      ? 'ACHIEVEMENT_THEN_MANAGER'
      : 'MANAGER_ONLY';

    return {
      reviewFlowMode,
      employeeAchievementEnabled:
        employeeAchievementConfig.employeeAchievementEnabled !== undefined
          ? Boolean(employeeAchievementConfig.employeeAchievementEnabled)
          : sectionExists,
      achievementSubmissionRequired:
        employeeAchievementConfig.achievementSubmissionRequired !== undefined
          ? Boolean(employeeAchievementConfig.achievementSubmissionRequired)
          : sectionExists,
      allowManagerReviewWithoutAchievement:
        employeeAchievementConfig.allowManagerReviewWithoutAchievement !== undefined
          ? Boolean(employeeAchievementConfig.allowManagerReviewWithoutAchievement)
          : false,
      managerCanEditEmployeeAchievement: false,
      objectiveLinkedAchievementRequired:
        employeeAchievementConfig.objectiveLinkedAchievementRequired !== undefined
          ? Boolean(employeeAchievementConfig.objectiveLinkedAchievementRequired)
          : true,
      additionalContributionsEnabled:
        employeeAchievementConfig.additionalContributionsEnabled !== undefined
          ? Boolean(employeeAchievementConfig.additionalContributionsEnabled)
          : true,
    };
  }

  private async getApprovedObjectives(
    quarterAssignmentId: Types.ObjectId,
  ): Promise<AchievementObjectiveRecord[]> {
    const objectives = await Objective.find({
      quarterAssignmentId,
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
      isDeleted: false,
    })
      .select(
        'objectiveNo title description expectedOutcome targetMetric targetValue targetDate weightage source isPredefined',
      )
      .sort({ objectiveNo: 1, createdAt: 1 })
      .lean();

    return objectives.map((objective: Record<string, any>) => {
      const weightage = objective.weightage === undefined || objective.weightage === null
        ? undefined
        : Number(objective.weightage);

      return {
        id: objective._id.toString(),
        objectiveNo: objective.objectiveNo,
        title: String(objective.title ?? ''),
        description: objective.description,
        expectedOutcome: objective.expectedOutcome,
        targetMetric: objective.targetMetric,
        targetValue: objective.targetValue,
        targetDate: objective.targetDate ? new Date(objective.targetDate).toISOString() : undefined,
        weightage,
        source: objective.source,
        isPredefined: Boolean(objective.isPredefined),
        isScoreable:
          Number.isFinite(weightage) ||
          objective.source === ObjectiveSource.PREDEFINED ||
          objective.isPredefined === true,
      };
    });
  }

  private buildObjectiveSnapshot(objective: AchievementObjectiveRecord) {
    return {
      title: objective.title,
      description: objective.description,
      expectedOutcome: objective.expectedOutcome,
      targetMetric: objective.targetMetric,
      targetValue: objective.targetValue,
      targetDate: objective.targetDate ? new Date(objective.targetDate) : undefined,
      weightage: objective.weightage,
      source: objective.source,
    };
  }

  private getAchievementSection(
    templateVersion: { sections?: ITemplateSection[] } | null,
    quarterCode: AssessmentTermCodeType,
  ): ITemplateSection {
    const section = (templateVersion?.sections ?? []).find(
      (item) => {
        const quarterScope = [
          ...(item.quarterScope ?? []),
          ...(item.repeatFor ?? []),
        ];

        return (
          item.sectionKey === EmployeeAchievementSubmissionService.SECTION_KEY &&
          item.level === 'QUARTER' &&
          this.assessmentTermScopeMatches(quarterScope, quarterCode)
        );
      },
    );

    if (!section) {
      throw new Error('Employee Achievement Submission section is not configured for this template');
    }

    return section;
  }

  private assessmentTermScopeMatches(
    scopedTerms: AssessmentTermCodeType[],
    termCode: AssessmentTermCodeType,
  ): boolean {
    if (scopedTerms.length === 0) return true;
    if (scopedTerms.includes(termCode)) return true;

    const quarterlyTerms = [
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
    ] as AssessmentTermCodeType[];
    const allQuarterlyTermsSelected = quarterlyTerms.every((quarter) =>
      scopedTerms.includes(quarter),
    );

    return allQuarterlyTermsSelected && (
      termCode === AssessmentTermCode.H1 ||
      termCode === AssessmentTermCode.H2 ||
      termCode === AssessmentTermCode.Y1
    );
  }

  private getAchievementField(section: ITemplateSection): ITemplateField {
    const field = (section.fields ?? []).find(
      (item) => item.fieldKey === EmployeeAchievementSubmissionService.FIELD_KEY,
    );

    if (!field) {
      throw new Error('Achievement Items field is not configured for this template');
    }

    return field;
  }

  private async assertViewAccess(quarterAssignment: any): Promise<void> {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);

    if (
      mappedRole === PmsRole.ADMIN ||
      mappedRole === PmsRole.MANAGEMENT ||
      mappedRole === PmsRole.DIRECTOR
    ) {
      return;
    }

    if (actor.actorId === quarterAssignment.employeeId.toString()) {
      return;
    }

    if (actor.actorId === quarterAssignment.assignedManagerId.toString()) {
      return;
    }

    const delegation = await this.getReviewDelegation(
      actor.actorId,
      quarterAssignment.assignedManagerId.toString(),
      quarterAssignment.cycleId?.toString(),
    );
    if (delegation) {
      return;
    }

    throw new Error('Access denied');
  }

  private async assertEmployeeEditAccess(quarterAssignment: any): Promise<void> {
    const actor = this.requireActor();
    const access = await accessService.canPerform({
      actor,
      action: 'achievementSubmission.edit',
      resource: {
        employeeId: quarterAssignment.employeeId.toString(),
        managerId: quarterAssignment.assignedManagerId.toString(),
      },
    });

    if (!access.allowed || normalizePmsRole(actor.actorRole) !== PmsRole.EMPLOYEE) {
      throw new Error('Only the employee can edit employee achievement submission');
    }

    if (actor.actorId !== quarterAssignment.employeeId.toString()) {
      throw new Error('Employee can edit only own achievement submission');
    }

    if (quarterAssignment.quarterState !== QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN) {
      throw new Error('Employee Achievement Submission can be edited only during the Employee Achievement Submission stage.');
    }
  }

  private async ensureAchievementStageOpen(
    quarterAssignment: any,
    _config: AchievementTemplateConfig,
  ) {
    return quarterAssignment;
  }

  private async assertSubmitWindowOpen(
    quarterAssignment: any,
    submission?: IEmployeeAchievementSubmission | null,
  ): Promise<void> {
    if (!quarterAssignment.cycleQuarterId) {
      return;
    }

    const quarterCycle = await QuarterCycle.findById(quarterAssignment.cycleQuarterId)
      .select('achievementSubmissionWindow')
      .lean();

    const window = quarterCycle?.achievementSubmissionWindow;
    if (!window || window.enabled !== true) {
      return;
    }

    const now = this.getCurrentDate();
    const startDate = window.startDate ? new Date(window.startDate) : undefined;
    const baseEndDate = window.endDate
      ? new Date(window.endDate)
      : window.dueDate
        ? new Date(window.dueDate)
        : undefined;
    const allowedEndDate = baseEndDate
      ? this.applyGraceDays(baseEndDate, window.graceDays)
      : undefined;

    if (startDate && now < startDate) {
      await this.auditQuarterAssignmentBlockedAttempt(
        quarterAssignment,
        submission,
        'PMS_EMPLOYEE_ACHIEVEMENT_SUBMIT_BLOCKED_BEFORE_WINDOW',
        { startDate: startDate.toISOString(), currentDate: now.toISOString() },
      );
      throw new Error('Achievement submission window has not opened yet.');
    }

    if (allowedEndDate && now > allowedEndDate) {
      await this.auditQuarterAssignmentBlockedAttempt(
        quarterAssignment,
        submission,
        'PMS_EMPLOYEE_ACHIEVEMENT_SUBMIT_BLOCKED_AFTER_WINDOW',
        {
          endDate: allowedEndDate.toISOString(),
          currentDate: now.toISOString(),
          graceDays: window.graceDays,
        },
      );
      throw new Error('Achievement submission window is closed.');
    }
  }

  private async getQuarterAssignment(quarterAssignmentId: string) {
    if (!Types.ObjectId.isValid(quarterAssignmentId)) {
      throw new Error('Invalid quarter assignment id');
    }

    const quarterAssignment = await QuarterAssignment.findById(quarterAssignmentId);
    if (!quarterAssignment || quarterAssignment.isDeleted) {
      throw new Error('Quarter assignment not found');
    }

    return quarterAssignment;
  }

  private async getAnnualAssignment(annualAssignmentId: string) {
    if (!Types.ObjectId.isValid(annualAssignmentId)) {
      throw new Error('Invalid annual assignment id');
    }

    const annualAssignment = await AnnualAssignment.findById(annualAssignmentId);
    if (!annualAssignment || annualAssignment.isDeleted) {
      throw new Error('Annual assignment not found');
    }

    return annualAssignment;
  }

  private async getTemplateVersion(templateVersionId?: string) {
    if (!templateVersionId) {
      return null;
    }
    if (!Types.ObjectId.isValid(templateVersionId)) {
      throw new Error('Invalid template version id');
    }

    return PmsTemplateVersion.findById(templateVersionId)
      .select('sections metadata')
      .lean();
  }

  private async getReviewDelegation(
    delegateUserId: string,
    delegatorUserId: string,
    cycleId?: string,
  ): Promise<any | null> {
    return new DelegationService(this.context).getActiveDelegation(
      delegateUserId,
      delegatorUserId,
      'PMS_REVIEWS',
      cycleId,
    );
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

  private actorIdObject(): Types.ObjectId {
    return this.toObjectId(this.requireActor().actorId, 'actorId');
  }

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private applyGraceDays(baseEndDate: Date, graceDays?: number): Date {
    if (graceDays === undefined || graceDays === null) {
      return baseEndDate;
    }

    const endDateWithGrace = new Date(baseEndDate);
    endDateWithGrace.setDate(endDateWithGrace.getDate() + graceDays);
    return endDateWithGrace;
  }

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Invalid ${fieldName}`);
    }

    return new Types.ObjectId(value);
  }

  private async auditBlockedAttempt(
    submission: IEmployeeAchievementSubmission,
    action: string,
  ): Promise<void> {
    await this.audit(
      action,
      'EMPLOYEE_ACHIEVEMENT_SUBMISSION',
      submission._id.toString(),
      undefined,
      { status: submission.status },
    );
  }

  private async auditQuarterAssignmentBlockedAttempt(
    quarterAssignment: any,
    submission: IEmployeeAchievementSubmission | null | undefined,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    const actor = this.requireActor();

    await auditService.createAuditLog({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action,
      entityType: submission ? 'EMPLOYEE_ACHIEVEMENT_SUBMISSION' : 'QUARTER_ASSIGNMENT',
      entityId: submission ? submission._id.toString() : quarterAssignment._id.toString(),
      assignmentId: quarterAssignment.annualAssignmentId.toString(),
      newValue: {
        quarterAssignmentId: quarterAssignment._id.toString(),
        status: submission?.status,
        ...details,
      },
    });
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
  ): Promise<void> {
    const actor = this.requireActor();

    await auditService.createAuditLog({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action,
      entityType,
      entityId,
      assignmentId: await this.resolveAuditAssignmentId(entityType, entityId),
      previousValue,
      newValue,
    });
  }

  private async resolveAuditAssignmentId(
    entityType: string,
    entityId: string,
  ): Promise<string | undefined> {
    if (entityType !== 'EMPLOYEE_ACHIEVEMENT_SUBMISSION') {
      return undefined;
    }

    const submission = await EmployeeAchievementSubmission.findById(entityId)
      .select('annualAssignmentId')
      .lean();

    return submission?.annualAssignmentId?.toString();
  }
}
