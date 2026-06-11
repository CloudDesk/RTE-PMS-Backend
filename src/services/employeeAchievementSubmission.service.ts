import { MultipartFile } from '@fastify/multipart';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { PmsTemplateVersion, type ITemplateField, type ITemplateSection } from '../models/pms-template-version.model';
import {
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
  subject?: string;
  description?: string;
  attachments?: AchievementAttachmentInput[];
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
  allowManagerReviewWithoutAchievement: boolean;
  managerCanEditEmployeeAchievement: false;
};

type AchievementSubmissionRecord = {
  id: string;
  annualAssignmentId: string;
  quarterAssignmentId: string;
  cycleId?: string;
  employeeId: string;
  managerId: string;
  templateVersionId?: string;
  quarterCode: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  status: string;
  achievementItems: Array<{
    subject: string;
    description: string;
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
  quarterCode: 'Q1' | 'Q2' | 'Q3' | 'Q4';
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
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    await this.assertViewAccess(quarterAssignment);

    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, quarterAssignment.quarterCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    const submission = await EmployeeAchievementSubmission.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    }).lean();
    const actor = this.requireActor();

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
      submission: submission ? this.mapSubmissionRecord(submission) : null,
      canEdit:
        actor.actorId === quarterAssignment.employeeId.toString() &&
        (!submission || submission.status !== EmployeeAchievementSubmissionStatus.LOCKED),
    };
  }

  async saveDraft(
    quarterAssignmentId: string,
    input: SaveAchievementDraftInput,
  ): Promise<AchievementSubmissionRecord> {
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    await this.assertEmployeeEditAccess(quarterAssignment);

    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, quarterAssignment.quarterCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    });

    if (existingSubmission?.status === EmployeeAchievementSubmissionStatus.LOCKED) {
      await this.auditBlockedAttempt(existingSubmission, 'PMS_EMPLOYEE_ACHIEVEMENT_UPDATE_BLOCKED');
      throw new Error('Submitted employee achievement is locked and cannot be edited');
    }

    const normalizedItems = this.normalizeAchievementItems(input.achievementItems ?? [], false);
    const normalizedValues = this.normalizeAchievementValues(
      input.achievementValues ?? [],
      normalizedItems,
      field,
      false,
    );

    this.validateAchievementPayload(section, field, normalizedItems, normalizedValues, false, config);

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
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    await this.assertEmployeeEditAccess(quarterAssignment);

    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, quarterAssignment.quarterCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    });

    if (existingSubmission?.status === EmployeeAchievementSubmissionStatus.LOCKED) {
      await this.auditBlockedAttempt(existingSubmission, 'PMS_EMPLOYEE_ACHIEVEMENT_UPDATE_BLOCKED');
      throw new Error('Submitted employee achievement is locked and cannot be edited');
    }

    const normalizedItems = this.normalizeAchievementItems(
      input.achievementItems ?? existingSubmission?.achievementItems ?? [],
      true,
    );
    const normalizedValues = this.normalizeAchievementValues(
      input.achievementValues ?? [],
      normalizedItems,
      field,
      true,
    );

    this.validateAchievementPayload(section, field, normalizedItems, normalizedValues, true, config);

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
          achievementItems: normalizedItems,
          achievementValues: normalizedValues,
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
    const quarterAssignment = await this.getQuarterAssignment(quarterAssignmentId);
    await this.assertEmployeeEditAccess(quarterAssignment);

    const annualAssignment = await this.getAnnualAssignment(quarterAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, quarterAssignment.quarterCode);
    this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

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
        subject: String(item.subject ?? ''),
        description: String(item.description ?? ''),
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
  ) {
    return items.map((item, index) => {
      const subject = String(item.subject ?? '').trim();
      const description = String(item.description ?? '').trim();

      if (isSubmit && !subject) {
        throw new Error(`Achievement Subject is required for row ${index + 1}`);
      }
      if (isSubmit && !description) {
        throw new Error(`Achievement Description is required for row ${index + 1}`);
      }

      return {
        subject,
        description,
        attachments: (item.attachments ?? []).map((attachment) => ({
          fileName: attachment.fileName?.trim(),
          fileUrl: attachment.fileUrl?.trim(),
          fileType: attachment.fileType?.trim(),
          fileSize: attachment.fileSize === undefined ? undefined : Number(attachment.fileSize),
          documentId: attachment.documentId?.trim(),
          uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : undefined,
        })),
      };
    });
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
          : true,
      managerCanEditEmployeeAchievement: false,
    };
  }

  private getAchievementSection(
    templateVersion: { sections?: ITemplateSection[] } | null,
    quarterCode: 'Q1' | 'Q2' | 'Q3' | 'Q4',
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
          (quarterScope.length === 0 || quarterScope.includes(quarterCode))
        );
      },
    );

    if (!section) {
      throw new Error('Employee Achievement Submission section is not configured for this template');
    }

    return section;
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

    if (mappedRole === PmsRole.ADMIN) {
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

    // TODO(PMS v3.1 Phase B): Enforce QuarterCycle.achievementSubmissionWindow
    // during Employee Achievement Submission submit without changing lock behavior.
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
