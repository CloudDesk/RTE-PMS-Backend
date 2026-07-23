import { MultipartFile } from '@fastify/multipart';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualWorkflowState,
  AssessmentTermCode,
  AssessmentTermType,
  getAssessmentTerms,
  ManagerReviewPeriodState,
  normalizePmsRole,
  ObjectiveActualAggregationMode,
  ObjectiveSource,
  ObjectiveStatus,
  ObjectiveTargetDirection,
  PmsRole,
  TermWorkflowState,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
  ObjectiveActualAggregationMode as ObjectiveActualAggregationModeType,
  ObjectiveTargetDirection as ObjectiveTargetDirectionType,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { Objective } from '../models/pms-objective.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import { ManagerReviewPeriodAssignment } from '../models/pms-manager-review-period-assignment.model';
import { PmsTemplateVersion, type ITemplateField, type ITemplateSection } from '../models/pms-template-version.model';
import {
  AchievementEntryMode,
  AchievementItemType,
  EmployeeAchievementSubmission,
  EmployeeAchievementSubmissionStatus,
  type IEmployeeAchievementSubmission,
} from '../models/pms-employee-achievement-submission.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { DelegationService } from './delegation.service';
import { gcpFileStorageService } from './gcp-file-storage.service';
import { PmsTemplateService, type ResolvedTemplateField } from './pms-template.service';
import { resolveEffectiveTermWindows } from '../utilis/pmsAssignmentWindows';

interface AchievementAttachmentInput {
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
  documentId?: string;
  uploadedAt?: Date | string;
}

interface AchievementItemInput {
  itemId?: string;
  type?: AchievementItemType;
  objectiveId?: string | Types.ObjectId;
  objectiveSnapshot?: AchievementObjectiveSnapshotInput;
  relatedObjectiveId?: string | Types.ObjectId;
  relatedObjectiveSnapshot?: AchievementObjectiveSnapshotInput;
  subject?: string;
  description?: string;
  employeeSelfRating?: number | string;
  employeeSelfRatingComments?: string;
  outcome?: string;
  attachments?: AchievementAttachmentInput[];
  itemStatus?: EmployeeAchievementSubmissionStatus;
  draftSavedAt?: Date | string;
  submittedBy?: string | Types.ObjectId;
  submittedAt?: Date | string;
}

interface AchievementObjectiveSnapshotInput {
  title?: string;
  description?: string;
  expectedOutcome?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDirection?: ObjectiveTargetDirectionType;
  actualAggregationMode?: ObjectiveActualAggregationModeType;
  targetDate?: Date | string;
  weightage?: number;
  source?: string;
  assessmentTermCode?: AssessmentTermCodeType;
  objectiveNo?: number;
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

export interface SubmitAchievementInput extends SaveAchievementDraftInput { }

export interface SaveAchievementItemInput {
  achievementItem: AchievementItemInput;
}

export interface SubmitAchievementItemInput extends SaveAchievementItemInput { }

type AchievementTemplateConfig = {
  reviewFlowMode: 'MANAGER_ONLY' | 'ACHIEVEMENT_THEN_MANAGER';
  employeeAchievementEnabled: boolean;
  achievementSubmissionRequired: boolean;
  achievementEntryMode: AchievementEntryMode;
  objectiveRelationshipEnabled: boolean;
  objectiveRelationshipRequired: boolean;
  allowMultipleAchievementsPerObjective: boolean;
  objectiveLinkedAchievementRequired: boolean;
  additionalContributionsEnabled: boolean;
  allowManagerReviewWithoutAchievement: boolean;
  managerCanEditEmployeeAchievement: false;
};

type AchievementObjectiveRecord = {
  id: string;
  assessmentTermCode?: AssessmentTermCodeType;
  objectiveNo?: number;
  title: string;
  description?: string;
  expectedOutcome?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDirection?: ObjectiveTargetDirectionType;
  actualAggregationMode?: ObjectiveActualAggregationModeType;
  targetDirectionLabel?: string;
  targetInterpretation?: ObjectiveTargetInterpretation;
  targetDate?: string;
  weightage?: number;
  source?: string;
  isPredefined?: boolean;
  isScoreable: boolean;
};

type AchievementSubmissionRecord = {
  id: string;
  annualAssignmentId: string;
  termAssignmentId: string;
  cycleId?: string;
  employeeId: string;
  managerId: string;
  templateVersionId?: string;
  assessmentTermCode: AssessmentTermCodeType;
  status: string;
  achievementItems: Array<{
    itemId?: string;
    type: AchievementItemType;
    objectiveId?: string;
    objectiveSnapshot?: AchievementObjectiveSnapshotInput;
    relatedObjectiveId?: string;
    relatedObjectiveSnapshot?: AchievementObjectiveSnapshotInput;
    subject: string;
    description: string;
    employeeSelfRating?: number;
    employeeSelfRatingComments?: string;
    outcome?: string;
    attachments: Array<{
      fileName?: string;
      fileUrl?: string;
      fileType?: string;
      fileSize?: number;
      documentId?: string;
      uploadedAt?: string;
    }>;
    itemStatus?: string;
    draftSavedAt?: string;
    submittedBy?: string;
    submittedAt?: string;
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
  termAssignmentId: string;
  annualAssignmentId: string;
  cycleId?: string;
  assessmentTermCode: AssessmentTermCodeType;
  assessmentTermType?: AssessmentTermTypeType;
  employeeId: string;
  managerId: string;
  templateVersionId?: string;
  reviewFlowMode: 'MANAGER_ONLY' | 'ACHIEVEMENT_THEN_MANAGER';
  employeeAchievementConfig: AchievementTemplateConfig;
  actualColumnMetadata: ActualColumnMetadata;
  section: {
    key: string;
    title: string;
    fieldKey: string;
    fieldLabel: string;
    workUpdateFields: EmployeeWorkUpdateFieldRecord[];
  };
  objectives: AchievementObjectiveRecord[];
  submission: AchievementSubmissionRecord | null;
  canEdit: boolean;
  editDeadline?: string;
  readOnlyReason?: string;
};

type CommonAchievementEditPolicy = {
  canEdit: boolean;
  deadline?: Date;
  reason?: string;
};

type ActualColumnMetadata = {
  assessmentTermType: AssessmentTermTypeType;
  allowedTerms: AssessmentTermCodeType[];
  currentTerm: AssessmentTermCodeType;
  configuredActualColumns: Array<{
    key: string;
    label: string;
    term: AssessmentTermCodeType;
    source: 'FIELD' | 'GRID_COLUMN';
    allowed: boolean;
  }>;
};

type NormalizedTargetDirection =
  | typeof ObjectiveTargetDirection.HIGHER_IS_BETTER
  | typeof ObjectiveTargetDirection.LOWER_IS_BETTER
  | typeof ObjectiveTargetDirection.NOT_APPLICABLE;

type ObjectiveTargetInterpretation = {
  targetDirection?: NormalizedTargetDirection;
  targetDirectionLabel: string;
  actualAggregationMode: ObjectiveActualAggregationModeType;
  targetValue?: number;
  actualValue?: number;
  targetMet?: boolean;
  status:
  | 'NOT_APPLICABLE'
  | 'MET'
  | 'NOT_MET'
  | 'MISSING_TARGET'
  | 'MISSING_ACTUAL'
  | 'MISSING_TARGET_DIRECTION'
  | 'INVALID_ACTUAL';
  message: string;
};

type ObjectiveActualValueCandidate = {
  value: unknown;
  term?: AssessmentTermCodeType;
  order: number;
};

type EmployeeWorkUpdateFieldRecord = {
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  isRequired: boolean;
  visible?: boolean;
  editable?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label?: string; value?: string }>;
  metadata?: Record<string, unknown>;
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

  async getSubmission(termAssignmentId: string): Promise<AchievementSubmissionDetail> {
    let termAssignment = await this.getTermAssignment(termAssignmentId);
    await this.assertViewAccess(termAssignment);

    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, termAssignment.assessmentTermCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);
    const resolvedFields = await this.resolveEmployeeAchievementFields(
      annualAssignment,
      termAssignment,
      [],
    );

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    termAssignment = await this.ensureAchievementStageOpen(termAssignment, config);

    const submission = await EmployeeAchievementSubmission.findOne({
      annualAssignmentId: termAssignment.annualAssignmentId,
      isDeleted: false,
    }).lean();
    const actor = this.requireActor();
    const [objectives, objectiveSettingStarted, editPolicy] = await Promise.all([
      this.getEligibleObjectives(termAssignment.annualAssignmentId),
      this.hasAnnualObjectiveSettingStarted(termAssignment, annualAssignment),
      this.resolveCommonAchievementEditPolicy(termAssignment, annualAssignment),
    ]);
    const actualColumnMetadata = await this.resolveActualColumnMetadata(
      termAssignment,
      section,
      field,
    );

    return {
      termAssignmentId: termAssignment._id.toString(),
      annualAssignmentId: termAssignment.annualAssignmentId.toString(),
      cycleId: termAssignment.cycleId?.toString(),
      assessmentTermCode: termAssignment.assessmentTermCode,
      assessmentTermType: actualColumnMetadata.assessmentTermType,
      employeeId: termAssignment.employeeId.toString(),
      managerId: termAssignment.assignedManagerId.toString(),
      templateVersionId: annualAssignment.templateVersionId?.toString(),
      reviewFlowMode: config.reviewFlowMode,
      employeeAchievementConfig: config,
      actualColumnMetadata,
      section: {
        key: section.sectionKey,
        title: section.sectionLabel,
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        workUpdateFields: this.getWorkUpdateFields(section, field.fieldKey, resolvedFields),
      },
      objectives,
      submission: submission ? this.mapSubmissionRecord(submission) : null,
      canEdit:
        actor.actorId === termAssignment.employeeId.toString() &&
        objectiveSettingStarted &&
        editPolicy.canEdit &&
        (!submission || submission.status !== EmployeeAchievementSubmissionStatus.LOCKED),
      editDeadline: editPolicy.deadline?.toISOString(),
      readOnlyReason: !objectiveSettingStarted
        ? 'Employee Achievement opens when Objective Setting starts for the first assessment term.'
        : editPolicy.reason,
    };
  }

  async saveDraft(
    termAssignmentId: string,
    input: SaveAchievementDraftInput,
  ): Promise<AchievementSubmissionRecord> {
    let termAssignment = await this.getTermAssignment(termAssignmentId);

    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, termAssignment.assessmentTermCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    termAssignment = await this.ensureAchievementStageOpen(termAssignment, config);
    await this.assertEmployeeEditAccess(termAssignment);

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      annualAssignmentId: termAssignment.annualAssignmentId,
      isDeleted: false,
    });

    if (existingSubmission?.status === EmployeeAchievementSubmissionStatus.LOCKED) {
      await this.auditBlockedAttempt(existingSubmission, 'PMS_EMPLOYEE_ACHIEVEMENT_UPDATE_BLOCKED');
      throw new Error('Submitted employee achievement is locked and cannot be edited');
    }

    const approvedObjectives = await this.getEligibleObjectives(
      termAssignment.annualAssignmentId,
    );
    const normalizedItems = this.normalizeAchievementItems(
      input.achievementItems ?? [],
      false,
      approvedObjectives,
      config,
    );
    this.assertSubmittedItemsPreserved(
      existingSubmission?.achievementItems ?? [],
      normalizedItems,
    );
    const normalizedValues = this.normalizeAchievementValues(
      input.achievementValues ?? [],
      normalizedItems,
      field,
      false,
    );
    await this.assertActualColumnsAllowedForCycleTermType(termAssignment, section, field, normalizedValues);
    const resolvedFields = await this.resolveEmployeeAchievementFields(
      annualAssignment,
      termAssignment,
      normalizedValues,
    );

    this.validateAchievementPayload(
      section,
      field,
      normalizedItems,
      normalizedValues,
      false,
      config,
      approvedObjectives,
      resolvedFields,
    );
    const achievementValues = this.mergePreservedReadOnlyAchievementValues(
      normalizedValues,
      existingSubmission?.achievementValues ?? [],
      resolvedFields,
      field.fieldKey,
    );

    const actorObjectId = this.actorIdObject();
    const previousValue = existingSubmission?.toObject();
    const now = new Date();
    const stampedItems = normalizedItems.map((item) => ({
      ...item,
      itemStatus: item.itemStatus || EmployeeAchievementSubmissionStatus.DRAFT,
      draftSavedAt: item.draftSavedAt || now,
    }));
    const mutationAuditMetadata = this.buildAchievementMutationAuditMetadata(
      config,
      existingSubmission?.achievementItems ?? [],
      stampedItems,
    );

    const submission = existingSubmission
      ? await EmployeeAchievementSubmission.findByIdAndUpdate(
        existingSubmission._id,
        {
          $set: {
            achievementItems: stampedItems,
            achievementValues,
            draftSavedAt: now,
            updatedBy: actorObjectId,
            auditMetadata: {
              todo: 'Strict achievement window enforcement will be implemented in a later PMS v3.1 runtime change.',
              ...mutationAuditMetadata,
            },
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      : await EmployeeAchievementSubmission.create({
        annualAssignmentId: termAssignment.annualAssignmentId,
        termAssignmentId: termAssignment._id,
        cycleId: termAssignment.cycleId,
        employeeId: termAssignment.employeeId,
        managerId: termAssignment.assignedManagerId,
        templateVersionId: annualAssignment.templateVersionId,
        assessmentTermCode: termAssignment.assessmentTermCode,
        achievementItems: stampedItems,
        achievementValues,
        status: EmployeeAchievementSubmissionStatus.DRAFT,
        draftSavedAt: now,
        auditMetadata: {
          todo: 'Strict achievement window enforcement will be implemented in a later PMS v3.1 runtime change.',
          ...mutationAuditMetadata,
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
    termAssignmentId: string,
    input: SubmitAchievementInput,
  ): Promise<AchievementSubmissionRecord> {
    let termAssignment = await this.getTermAssignment(termAssignmentId);

    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, termAssignment.assessmentTermCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    termAssignment = await this.ensureAchievementStageOpen(termAssignment, config);
    await this.assertEmployeeEditAccess(termAssignment);

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      annualAssignmentId: termAssignment.annualAssignmentId,
      isDeleted: false,
    });

    if (existingSubmission?.status === EmployeeAchievementSubmissionStatus.LOCKED) {
      await this.auditBlockedAttempt(existingSubmission, 'PMS_EMPLOYEE_ACHIEVEMENT_SUBMIT_BLOCKED_LOCKED');
      throw new Error('Achievement submission is already locked.');
    }

    const approvedObjectives = await this.getEligibleObjectives(
      termAssignment.annualAssignmentId,
    );
    const submitItems = this.normalizeAchievementItems(
      input.achievementItems ?? existingSubmission?.achievementItems ?? [],
      true,
      approvedObjectives,
      config,
    );
    this.assertSubmittedItemsPreserved(
      existingSubmission?.achievementItems ?? [],
      submitItems,
    );
    const submitValues = this.normalizeAchievementValues(
      input.achievementValues ?? [],
      submitItems,
      field,
      true,
    );
    await this.assertActualColumnsAllowedForCycleTermType(termAssignment, section, field, submitValues);
    const resolvedFields = await this.resolveEmployeeAchievementFields(
      annualAssignment,
      termAssignment,
      submitValues,
    );

    this.validateAchievementPayload(
      section,
      field,
      submitItems,
      submitValues,
      true,
      config,
      approvedObjectives,
      resolvedFields,
    );
    const achievementValues = this.mergePreservedReadOnlyAchievementValues(
      submitValues,
      existingSubmission?.achievementValues ?? [],
      resolvedFields,
      field.fieldKey,
    );

    const actorObjectId = this.actorIdObject();
    const previousValue = existingSubmission?.toObject();
    const now = new Date();
    const stampedSubmitItems = submitItems.map((item) => ({
      ...item,
      itemStatus: EmployeeAchievementSubmissionStatus.SUBMITTED,
      submittedBy: actorObjectId,
      submittedAt: now,
    }));
    const mutationAuditMetadata = this.buildAchievementMutationAuditMetadata(
      config,
      existingSubmission?.achievementItems ?? [],
      stampedSubmitItems,
    );

    const submission = existingSubmission
      ? await EmployeeAchievementSubmission.findByIdAndUpdate(
        existingSubmission._id,
        {
          $set: {
            achievementItems: stampedSubmitItems,
            achievementValues,
            status: EmployeeAchievementSubmissionStatus.SUBMITTED,
            submittedBy: actorObjectId,
            submittedAt: now,
            lockedAt: undefined,
            updatedBy: actorObjectId,
            auditMetadata: {
              todo: 'Strict achievement window enforcement will be implemented in a later PMS v3.1 runtime change.',
              ...mutationAuditMetadata,
            },
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      : await EmployeeAchievementSubmission.create({
        annualAssignmentId: termAssignment.annualAssignmentId,
        termAssignmentId: termAssignment._id,
        cycleId: termAssignment.cycleId,
        employeeId: termAssignment.employeeId,
        managerId: termAssignment.assignedManagerId,
        templateVersionId: annualAssignment.templateVersionId,
        assessmentTermCode: termAssignment.assessmentTermCode,
        achievementItems: stampedSubmitItems,
        achievementValues,
        status: EmployeeAchievementSubmissionStatus.SUBMITTED,
        draftSavedAt: now,
        submittedBy: actorObjectId,
        submittedAt: now,
        lockedAt: undefined,
        auditMetadata: {
          todo: 'Strict achievement window enforcement will be implemented in a later PMS v3.1 runtime change.',
          ...mutationAuditMetadata,
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

  async saveItemDraft(
    termAssignmentId: string,
    input: SaveAchievementItemInput,
  ): Promise<AchievementSubmissionRecord> {
    const context = await this.prepareAchievementMutation(termAssignmentId);
    const { termAssignment, annualAssignment, section, field, config } = context;
    await this.assertEmployeeEditAccess(termAssignment);

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      annualAssignmentId: termAssignment.annualAssignmentId,
      isDeleted: false,
    });

    if (existingSubmission?.status === EmployeeAchievementSubmissionStatus.LOCKED) {
      await this.auditBlockedAttempt(existingSubmission, 'PMS_EMPLOYEE_ACHIEVEMENT_ITEM_UPDATE_BLOCKED');
      throw new Error('Submitted employee achievement is locked and cannot be edited');
    }

    const approvedObjectives = await this.getEligibleObjectives(
      termAssignment.annualAssignmentId,
    );
    const [normalizedItem] = this.normalizeAchievementItems(
      [input.achievementItem],
      false,
      approvedObjectives,
      config,
    );
    if (!normalizedItem) {
      throw new Error('Achievement details are required to save this item draft.');
    }
    if (normalizedItem.type !== AchievementItemType.OBJECTIVE && !normalizedItem.subject) {
      throw new Error('Achievement Subject is required to save this item draft.');
    }
    this.assertItemCanBeEdited(existingSubmission?.achievementItems ?? [], normalizedItem);

    const now = new Date();
    const nextItems = this.mergeAchievementItem(
      existingSubmission?.achievementItems ?? [],
      {
        ...normalizedItem,
        itemStatus: EmployeeAchievementSubmissionStatus.DRAFT,
        draftSavedAt: now,
      },
    );
    const normalizedValues = this.normalizeAchievementValues([], nextItems, field, false);
    await this.assertActualColumnsAllowedForCycleTermType(termAssignment, section, field, normalizedValues);
    const nextAchievementValues = this.mergeExistingNonAchievementValues(
      normalizedValues,
      existingSubmission?.achievementValues ?? [],
      field.fieldKey,
    );
    const resolvedFields = await this.resolveEmployeeAchievementFields(
      annualAssignment,
      termAssignment,
      nextAchievementValues,
    );
    this.validateAchievementPayload(
      section,
      field,
      nextItems,
      normalizedValues,
      false,
      config,
      approvedObjectives,
      resolvedFields,
    );
    const achievementValues = nextAchievementValues;

    const actorObjectId = this.actorIdObject();
    const previousValue = existingSubmission?.toObject();
    const mutationAuditMetadata = this.buildAchievementMutationAuditMetadata(
      config,
      existingSubmission?.achievementItems ?? [],
      nextItems,
    );
    const submission = existingSubmission
      ? await EmployeeAchievementSubmission.findByIdAndUpdate(
        existingSubmission._id,
        {
          $set: {
            achievementItems: nextItems,
            achievementValues,
            status: EmployeeAchievementSubmissionStatus.DRAFT,
            draftSavedAt: now,
            updatedBy: actorObjectId,
            auditMetadata: mutationAuditMetadata,
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      : await EmployeeAchievementSubmission.create({
        annualAssignmentId: termAssignment.annualAssignmentId,
        termAssignmentId: termAssignment._id,
        cycleId: termAssignment.cycleId,
        employeeId: termAssignment.employeeId,
        managerId: termAssignment.assignedManagerId,
        templateVersionId: annualAssignment.templateVersionId,
        assessmentTermCode: termAssignment.assessmentTermCode,
        achievementItems: nextItems,
        achievementValues,
        status: EmployeeAchievementSubmissionStatus.DRAFT,
        draftSavedAt: now,
        auditMetadata: mutationAuditMetadata,
        createdBy: actorObjectId,
        updatedBy: actorObjectId,
      });

    if (!submission) {
      throw new Error('Unable to save achievement item draft');
    }

    await this.audit(
      'PMS_EMPLOYEE_ACHIEVEMENT_ITEM_DRAFT_SAVED',
      'EMPLOYEE_ACHIEVEMENT_SUBMISSION',
      submission._id.toString(),
      previousValue,
      submission.toObject(),
    );

    return this.mapSubmissionRecord(submission.toObject());
  }

  async submitItem(
    termAssignmentId: string,
    input: SubmitAchievementItemInput,
  ): Promise<AchievementSubmissionRecord> {
    const context = await this.prepareAchievementMutation(termAssignmentId);
    const { termAssignment, annualAssignment, section, field, config } = context;
    await this.assertEmployeeEditAccess(termAssignment);

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      annualAssignmentId: termAssignment.annualAssignmentId,
      isDeleted: false,
    });

    if (existingSubmission?.status === EmployeeAchievementSubmissionStatus.LOCKED) {
      await this.auditBlockedAttempt(existingSubmission, 'PMS_EMPLOYEE_ACHIEVEMENT_ITEM_SUBMIT_BLOCKED_LOCKED');
      throw new Error('Achievement submission is already locked.');
    }

    const approvedObjectives = await this.getEligibleObjectives(
      termAssignment.annualAssignmentId,
    );
    const [normalizedItem] = this.normalizeAchievementItems(
      [input.achievementItem],
      true,
      approvedObjectives,
      config,
    );
    if (!normalizedItem) {
      throw new Error('Achievement details are required to submit this item.');
    }
    this.assertItemCanBeEdited(existingSubmission?.achievementItems ?? [], normalizedItem);

    const actorObjectId = this.actorIdObject();
    const now = new Date();
    const submittedItem = {
      ...normalizedItem,
      itemStatus: EmployeeAchievementSubmissionStatus.SUBMITTED,
      submittedBy: actorObjectId,
      submittedAt: now,
    };
    const nextItems = this.mergeAchievementItem(existingSubmission?.achievementItems ?? [], submittedItem);
    const normalizedValues = this.normalizeAchievementValues([], nextItems, field, true);
    await this.assertActualColumnsAllowedForCycleTermType(termAssignment, section, field, normalizedValues);
    const nextAchievementValues = this.mergeExistingNonAchievementValues(
      normalizedValues,
      existingSubmission?.achievementValues ?? [],
      field.fieldKey,
    );
    const resolvedFields = await this.resolveEmployeeAchievementFields(
      annualAssignment,
      termAssignment,
      nextAchievementValues,
    );
    this.validateAchievementPayload(
      section,
      field,
      nextItems,
      normalizedValues,
      false,
      config,
      approvedObjectives,
      resolvedFields,
    );
    const achievementValues = nextAchievementValues;
    const promoteToSubmitted = this.canPromoteItemSubmissionToOverall(
      section,
      field,
      nextItems,
      achievementValues,
      config,
      approvedObjectives,
      resolvedFields,
    );
    const nextSubmissionStatus = promoteToSubmitted
      ? EmployeeAchievementSubmissionStatus.SUBMITTED
      : existingSubmission?.status ?? EmployeeAchievementSubmissionStatus.DRAFT;
    const nextSubmittedBy = promoteToSubmitted
      ? existingSubmission?.submittedBy ?? actorObjectId
      : existingSubmission?.submittedBy;
    const nextSubmittedAt = promoteToSubmitted
      ? existingSubmission?.submittedAt ?? now
      : existingSubmission?.submittedAt;
    const submittedAchievementValues = promoteToSubmitted
      ? achievementValues.map((value) =>
        value.fieldKey === field.fieldKey
          ? {
            ...value,
            workflowStage: 'ACHIEVEMENT_SUBMITTED',
            valueStatus: 'ACTIVE',
            submittedAt: value.submittedAt ?? now,
          }
          : value,
      )
      : achievementValues;

    const previousValue = existingSubmission?.toObject();
    const mutationAuditMetadata = this.buildAchievementMutationAuditMetadata(
      config,
      existingSubmission?.achievementItems ?? [],
      nextItems,
    );
    const submission = existingSubmission
      ? await EmployeeAchievementSubmission.findByIdAndUpdate(
        existingSubmission._id,
        {
          $set: {
            achievementItems: nextItems,
            achievementValues: submittedAchievementValues,
            status: nextSubmissionStatus,
            submittedBy: nextSubmittedBy,
            submittedAt: nextSubmittedAt,
            lockedAt: undefined,
            updatedBy: actorObjectId,
            auditMetadata: mutationAuditMetadata,
          },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true },
      )
      : await EmployeeAchievementSubmission.create({
        annualAssignmentId: termAssignment.annualAssignmentId,
        termAssignmentId: termAssignment._id,
        cycleId: termAssignment.cycleId,
        employeeId: termAssignment.employeeId,
        managerId: termAssignment.assignedManagerId,
        templateVersionId: annualAssignment.templateVersionId,
        assessmentTermCode: termAssignment.assessmentTermCode,
        achievementItems: nextItems,
        achievementValues: submittedAchievementValues,
        status: nextSubmissionStatus,
        draftSavedAt: now,
        submittedBy: nextSubmittedBy,
        submittedAt: nextSubmittedAt,
        lockedAt: undefined,
        auditMetadata: mutationAuditMetadata,
        createdBy: actorObjectId,
        updatedBy: actorObjectId,
      });

    if (!submission) {
      throw new Error('Unable to submit achievement item');
    }

    await this.audit(
      'PMS_EMPLOYEE_ACHIEVEMENT_ITEM_SUBMITTED',
      'EMPLOYEE_ACHIEVEMENT_SUBMISSION',
      submission._id.toString(),
      previousValue,
      submission.toObject(),
    );

    return this.mapSubmissionRecord(submission.toObject());
  }

  async uploadAttachment(
    termAssignmentId: string,
    file: MultipartFile,
  ): Promise<UploadedAchievementAttachment> {
    let termAssignment = await this.getTermAssignment(termAssignmentId);

    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, termAssignment.assessmentTermCode);
    this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    termAssignment = await this.ensureAchievementStageOpen(termAssignment, config);
    await this.assertEmployeeEditAccess(termAssignment);

    const existingSubmission = await EmployeeAchievementSubmission.findOne({
      annualAssignmentId: termAssignment.annualAssignmentId,
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
      employeeId: termAssignment.employeeId.toString(),
      category: 'PMS',
      type: 'EmployeeAchievement',
      public: true,
    });

    await this.audit(
      'PMS_EMPLOYEE_ACHIEVEMENT_ATTACHMENT_UPLOADED',
      'EMPLOYEE_ACHIEVEMENT_SUBMISSION',
      existingSubmission?._id?.toString() || termAssignment._id.toString(),
      undefined,
      {
        termAssignmentId: termAssignment._id.toString(),
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
      termAssignmentId: submission.termAssignmentId.toString(),
      cycleId: submission.cycleId?.toString(),
      employeeId: submission.employeeId.toString(),
      managerId: submission.managerId.toString(),
      templateVersionId: submission.templateVersionId?.toString(),
      assessmentTermCode: submission.assessmentTermCode,
      status: submission.status,
      achievementItems: (submission.achievementItems ?? []).map((item: Record<string, any>) => ({
        itemId: item.itemId,
        type: Object.values(AchievementItemType).includes(item.type)
          ? item.type
          : item.objectiveId
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
            targetDirection: item.objectiveSnapshot.targetDirection,
            actualAggregationMode: item.objectiveSnapshot.actualAggregationMode,
            targetDate: item.objectiveSnapshot.targetDate
              ? new Date(item.objectiveSnapshot.targetDate).toISOString()
              : undefined,
            weightage: item.objectiveSnapshot.weightage,
            source: item.objectiveSnapshot.source,
            assessmentTermCode: item.objectiveSnapshot.assessmentTermCode,
            objectiveNo: item.objectiveSnapshot.objectiveNo,
          }
          : undefined,
        relatedObjectiveId: item.relatedObjectiveId?.toString?.(),
        relatedObjectiveSnapshot: item.relatedObjectiveSnapshot
          ? {
            title: item.relatedObjectiveSnapshot.title,
            description: item.relatedObjectiveSnapshot.description,
            expectedOutcome: item.relatedObjectiveSnapshot.expectedOutcome,
            targetMetric: item.relatedObjectiveSnapshot.targetMetric,
            targetValue: item.relatedObjectiveSnapshot.targetValue,
            targetDirection: item.relatedObjectiveSnapshot.targetDirection,
            actualAggregationMode: item.relatedObjectiveSnapshot.actualAggregationMode,
            targetDate: item.relatedObjectiveSnapshot.targetDate
              ? new Date(item.relatedObjectiveSnapshot.targetDate).toISOString()
              : undefined,
            weightage: item.relatedObjectiveSnapshot.weightage,
            source: item.relatedObjectiveSnapshot.source,
            assessmentTermCode: item.relatedObjectiveSnapshot.assessmentTermCode,
            objectiveNo: item.relatedObjectiveSnapshot.objectiveNo,
          }
          : undefined,
        subject: String(item.subject ?? ''),
        description: String(item.description ?? ''),
        employeeSelfRating: item.employeeSelfRating,
        employeeSelfRatingComments: item.employeeSelfRatingComments,
        outcome: item.outcome,
        attachments: (item.attachments ?? []).map((attachment: Record<string, any>) => ({
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
          documentId: attachment.documentId,
          uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt).toISOString() : undefined,
        })),
        itemStatus: item.itemStatus ?? this.defaultItemStatusForSubmission(submission.status),
        draftSavedAt: item.draftSavedAt ? new Date(item.draftSavedAt).toISOString() : undefined,
        submittedBy: item.submittedBy?.toString?.(),
        submittedAt: item.submittedAt ? new Date(item.submittedAt).toISOString() : undefined,
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
    const employeeAuthoredMode =
      config?.achievementEntryMode === AchievementEntryMode.EMPLOYEE_AUTHORED;
    const normalized = items.map((item, index) => {
      const itemId = this.normalizeAchievementItemId(item.itemId) ?? randomUUID();
      const itemType = employeeAuthoredMode
        ? AchievementItemType.EMPLOYEE_AUTHORED
        : item.type === AchievementItemType.OBJECTIVE || item.objectiveId
          ? AchievementItemType.OBJECTIVE
          : AchievementItemType.ADDITIONAL;
      const objectiveId = !employeeAuthoredMode && item.objectiveId
        ? String(item.objectiveId).trim()
        : undefined;
      const objective = objectiveId ? objectiveById.get(objectiveId) : undefined;
      const relatedObjectiveId = employeeAuthoredMode && item.relatedObjectiveId
        ? String(item.relatedObjectiveId).trim()
        : undefined;
      const relatedObjective = relatedObjectiveId
        ? objectiveById.get(relatedObjectiveId)
        : undefined;
      const subject = itemType === AchievementItemType.OBJECTIVE
        ? String(objective?.title ?? item.subject ?? '').trim()
        : String(item.subject ?? '').trim();
      const description = String(item.description ?? '').trim();
      const employeeSelfRating =
        item.employeeSelfRating === undefined ||
          item.employeeSelfRating === null ||
          item.employeeSelfRating === ''
          ? undefined
          : Number(item.employeeSelfRating);
      const employeeSelfRatingComments = String(item.employeeSelfRatingComments ?? '').trim();
      const outcome = String(item.outcome ?? '').trim();
      const attachments = (item.attachments ?? []).map((attachment) => ({
        fileName: attachment.fileName?.trim(),
        fileUrl: attachment.fileUrl?.trim(),
        fileType: attachment.fileType?.trim(),
        fileSize: attachment.fileSize === undefined ? undefined : Number(attachment.fileSize),
        documentId: attachment.documentId?.trim(),
        uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : undefined,
      }));

      const isEmptyAuthored =
        itemType !== AchievementItemType.OBJECTIVE &&
        !subject &&
        !description &&
        !outcome &&
        attachments.every((attachment) => !attachment.fileName && !attachment.fileUrl && !attachment.documentId);
      const isEmptyObjective =
        itemType === AchievementItemType.OBJECTIVE &&
        !description &&
        employeeSelfRating === undefined &&
        !employeeSelfRatingComments &&
        !outcome &&
        attachments.every((attachment) => !attachment.fileName && !attachment.fileUrl && !attachment.documentId);

      if (!isSubmit && (isEmptyAuthored || isEmptyObjective)) {
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

      if (employeeAuthoredMode) {
        if (relatedObjectiveId && config?.objectiveRelationshipEnabled === false) {
          throw new Error(`Related Objective is not enabled for achievement row ${index + 1}`);
        }
        if (relatedObjectiveId && !relatedObjective) {
          throw new Error(`Related Objective must be an approved objective for achievement row ${index + 1}`);
        }
        if (isSubmit && config?.objectiveRelationshipRequired && !relatedObjectiveId) {
          throw new Error(`Related Objective is required for achievement row ${index + 1}`);
        }
      }

      if (isSubmit && !subject) {
        throw new Error(`Achievement Subject is required for row ${index + 1}`);
      }
      if (isSubmit && !description) {
        throw new Error(`Achievement Description is required for row ${index + 1}`);
      }

      return {
        itemId,
        type: itemType,
        objectiveId: itemType === AchievementItemType.OBJECTIVE && objectiveId
          ? new Types.ObjectId(objectiveId)
          : undefined,
        objectiveSnapshot: itemType === AchievementItemType.OBJECTIVE && objective
          ? this.buildObjectiveSnapshot(objective)
          : undefined,
        relatedObjectiveId: employeeAuthoredMode && relatedObjectiveId
          ? new Types.ObjectId(relatedObjectiveId)
          : undefined,
        relatedObjectiveSnapshot: employeeAuthoredMode && relatedObjective
          ? this.buildObjectiveSnapshot(relatedObjective)
          : undefined,
        subject,
        description,
        employeeSelfRating,
        employeeSelfRatingComments: employeeSelfRatingComments || undefined,
        outcome: outcome || undefined,
        attachments,
        itemStatus: item.itemStatus || EmployeeAchievementSubmissionStatus.DRAFT,
        draftSavedAt: item.draftSavedAt ? new Date(item.draftSavedAt) : undefined,
        submittedBy:
          item.submittedBy && Types.ObjectId.isValid(String(item.submittedBy))
            ? new Types.ObjectId(String(item.submittedBy))
            : undefined,
        submittedAt: item.submittedAt ? new Date(item.submittedAt) : undefined,
      };
    });
    const meaningfulItems = normalized.filter((item): item is Exclude<typeof item, null> => Boolean(item));
    const itemIds = new Set<string>();
    for (const item of meaningfulItems) {
      if (itemIds.has(item.itemId)) {
        throw new Error(`Duplicate achievement itemId: ${item.itemId}`);
      }
      itemIds.add(item.itemId);
    }

    if (employeeAuthoredMode && config?.allowMultipleAchievementsPerObjective === false) {
      const relatedObjectiveIds = new Set<string>();
      for (const item of meaningfulItems) {
        const relatedId = item.relatedObjectiveId?.toString();
        if (!relatedId) continue;
        if (relatedObjectiveIds.has(relatedId)) {
          throw new Error('Only one achievement may be related to each objective for this template');
        }
        relatedObjectiveIds.add(relatedId);
      }
    }

    return meaningfulItems;
  }

  private normalizeAchievementItemId(value?: string): string | undefined {
    const itemId = String(value ?? '').trim();
    if (!itemId) return undefined;
    if (itemId.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(itemId)) {
      throw new Error('Achievement itemId is invalid');
    }
    return itemId;
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
      valueJson: value.fieldKey === field.fieldKey
        ? achievementItems
        : value.valueJson,
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
    resolvedFields: ResolvedTemplateField[] = [],
  ): void {
    if (!this.isTermLevelTemplateSection(section.level)) {
      throw new Error('Employee Achievement Submission section must be assessment-term-level');
    }

    if (field.fieldType !== 'DATA_GRID') {
      throw new Error('Achievement Items field must use DATA_GRID');
    }

    const sectionFieldMap = new Map(
      (section.fields ?? []).map((sectionField) => [sectionField.fieldKey, sectionField]),
    );
    const resolvedFieldMap = new Map(resolvedFields.map((resolvedField) => [resolvedField.key, resolvedField]));

    for (const value of values) {
      if (value.sectionKey !== EmployeeAchievementSubmissionService.SECTION_KEY) {
        throw new Error('Only Employee Achievement Submission values can be saved through this API');
      }
      if (!sectionFieldMap.has(value.fieldKey)) {
        throw new Error(`Field "${value.fieldKey}" is not configured for Employee Achievement Submission`);
      }
      if (value.fieldKey !== field.fieldKey && resolvedFieldMap.get(value.fieldKey)?.editable !== true) {
        throw new Error(`Field "${value.fieldKey}" is read-only for Employee Achievement Submission`);
      }
    }

    if (isSubmit && config.achievementSubmissionRequired && items.length === 0) {
      throw new Error('At least one achievement item is required before submission');
    }

    if (
      isSubmit &&
      config.achievementEntryMode !== AchievementEntryMode.EMPLOYEE_AUTHORED &&
      config.objectiveLinkedAchievementRequired
    ) {
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

    if (config.achievementEntryMode !== AchievementEntryMode.EMPLOYEE_AUTHORED) {
      this.validateObjectiveActualValues(items, values, isSubmit, approvedObjectives);
    }

    const gridColumns = Array.isArray(field.gridConfig?.columns) ? field.gridConfig.columns : [];
    const subjectColumn = gridColumns.find((column) =>
      ['achievement_subject', 'objective_ref'].includes(String(column.key ?? '')),
    );
    const descriptionColumn = gridColumns.find((column) =>
      ['achievement_description', 'achievement'].includes(String(column.key ?? '')),
    );

    if (!subjectColumn || !descriptionColumn) {
      throw new Error('Achievement Items field is missing required grid columns');
    }

    if (isSubmit) {
      for (const workUpdateField of this.getWorkUpdateFields(section, field.fieldKey, resolvedFields)) {
        if (workUpdateField.editable !== true || workUpdateField.isRequired !== true) {
          continue;
        }

        const submittedValue = values.find((value) => value.fieldKey === workUpdateField.fieldKey);
        if (!this.hasMeaningfulAchievementValue(submittedValue)) {
          throw new Error(`${workUpdateField.fieldLabel} is required.`);
        }
      }
    }
  }

  private async assertActualColumnsAllowedForCycleTermType(
    termAssignment: any,
    section: ITemplateSection,
    field: ITemplateField,
    values: Array<Record<string, any>>,
  ): Promise<void> {
    const metadata = await this.resolveActualColumnMetadata(termAssignment, section, field);
    const allowedTerms = new Set(metadata.allowedTerms);
    const invalidTerms = new Set<AssessmentTermCodeType>();

    for (const value of values) {
      const termFromField = this.extractActualTermFromKeyOrLabel(value.fieldKey);
      if (termFromField && !allowedTerms.has(termFromField)) {
        invalidTerms.add(termFromField);
      }

      for (const termFromValue of this.extractActualTermsFromValue(value.valueJson)) {
        if (!allowedTerms.has(termFromValue)) {
          invalidTerms.add(termFromValue);
        }
      }
    }

    if (invalidTerms.size > 0) {
      throw new Error(
        `Actual columns ${[...invalidTerms].join(', ')} are not allowed for ${metadata.assessmentTermType} cycle. Allowed actual columns: ${metadata.allowedTerms.join(', ')}`,
      );
    }
  }

  private validateObjectiveActualValues(
    items: Array<Record<string, any>>,
    values: Array<Record<string, any>>,
    isSubmit: boolean,
    approvedObjectives: AchievementObjectiveRecord[] = [],
  ): void {
    if (!isSubmit || approvedObjectives.length === 0) {
      return;
    }

    const objectiveById = new Map(approvedObjectives.map((objective) => [objective.id, objective]));
    const submittedObjectiveItems = items.filter((item) =>
      item.type === AchievementItemType.OBJECTIVE &&
      item.objectiveId &&
      item.description,
    );

    for (const item of submittedObjectiveItems) {
      const objectiveId = item.objectiveId.toString();
      const objective = objectiveById.get(objectiveId);
      if (!objective) {
        continue;
      }

      const targetNumber = this.parseNumericTargetValue(objective.targetValue);
      const targetDirection = this.normalizeTargetDirection(objective.targetDirection);
      if (targetNumber === undefined && !this.isNumericTargetDirection(targetDirection)) {
        continue;
      }
      if (targetNumber === undefined) {
        throw new Error(`Numeric target value is required for target-based validation: ${objective.title}`);
      }
      if (!this.isNumericTargetDirection(targetDirection)) {
        throw new Error(`Target direction is required for objective: ${objective.title}`);
      }

      const actualCandidates = this.findObjectiveActualValues(objectiveId, item, values);
      if (actualCandidates.length === 0) {
        throw new Error(`Actual value is required for objective: ${objective.title}`);
      }

      const actualNumbers = actualCandidates
        .map((candidate) => ({
          ...candidate,
          numericValue: this.parseNumericTargetValue(candidate.value),
        }));
      const invalidActual = actualNumbers.find((candidate) => candidate.numericValue === undefined);
      if (invalidActual) {
        throw new Error(`Actual value must be numeric for objective: ${objective.title}`);
      }

      const actualNumber = this.aggregateObjectiveActualValues(
        actualNumbers.map((candidate) => ({
          value: candidate.numericValue as number,
          term: candidate.term,
          order: candidate.order,
        })),
        objective.actualAggregationMode,
      );
      if (actualNumber === undefined) {
        throw new Error(`Actual value is required for objective: ${objective.title}`);
      }

      this.interpretObjectiveTarget(objective, actualNumber);
    }
  }

  private findObjectiveActualValues(
    objectiveId: string,
    item: Record<string, any>,
    values: Array<Record<string, any>>,
  ): ObjectiveActualValueCandidate[] {
    const candidates: ObjectiveActualValueCandidate[] = [];
    candidates.push(...this.extractActualValuesFromRecord(item, candidates.length));

    for (const value of values) {
      candidates.push(...this.extractActualValuesFromRecord(value, candidates.length));
      candidates.push(...this.extractActualValuesForObjective(objectiveId, value.valueJson, candidates.length));
    }

    return candidates.filter((candidate) =>
      candidate.value !== undefined &&
      candidate.value !== null &&
      String(candidate.value).trim() !== '',
    );
  }

  private extractActualValuesForObjective(
    objectiveId: string,
    value: unknown,
    startOrder = 0,
  ): ObjectiveActualValueCandidate[] {
    if (!value || typeof value !== 'object') {
      return [];
    }

    const candidates: ObjectiveActualValueCandidate[] = [];
    if (Array.isArray(value)) {
      for (const item of value) {
        candidates.push(...this.extractActualValuesForObjective(objectiveId, item, startOrder + candidates.length));
      }
      return candidates;
    }

    const record = value as Record<string, unknown>;
    const rowObjectiveId = record.objectiveId?.toString?.() ?? String(record.objectiveId ?? '');
    if (rowObjectiveId && rowObjectiveId !== objectiveId) {
      return [];
    }

    if (rowObjectiveId === objectiveId) {
      candidates.push(...this.extractActualValuesFromRecord(record, startOrder + candidates.length));
    }

    for (const nestedValue of Object.values(record)) {
      candidates.push(...this.extractActualValuesForObjective(objectiveId, nestedValue, startOrder + candidates.length));
    }

    return candidates;
  }

  private extractActualValuesFromRecord(
    record: Record<string, any>,
    startOrder = 0,
  ): ObjectiveActualValueCandidate[] {
    const candidates: ObjectiveActualValueCandidate[] = [];
    const recordFieldTerm = this.extractActualTermFromKeyOrLabel(record.fieldKey);
    if (recordFieldTerm) {
      candidates.push({
        value: record.valueNumber ?? record.valueText ?? record.valueJson,
        term: recordFieldTerm,
        order: startOrder,
      });
    }

    for (const [key, value] of Object.entries(record)) {
      if (key === 'fieldKey' || key === 'valueNumber' || key === 'valueText' || key === 'valueJson') {
        continue;
      }
      const normalizedKey = key.trim().toLowerCase();
      const term = this.extractActualTermFromKeyOrLabel(key);
      if (
        normalizedKey === 'actual' ||
        normalizedKey === 'actualvalue' ||
        normalizedKey === 'actual_value' ||
        term
      ) {
        candidates.push({
          value,
          term,
          order: startOrder + candidates.length,
        });
      }
    }

    return candidates;
  }

  private aggregateObjectiveActualValues(
    candidates: Array<{ value: number; term?: AssessmentTermCodeType; order: number }>,
    configuredMode?: unknown,
  ): number | undefined {
    if (candidates.length === 0) {
      return undefined;
    }

    const sortedCandidates = [...candidates].sort((left, right) => {
      const leftRank = this.actualTermRank(left.term);
      const rightRank = this.actualTermRank(right.term);
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.order - right.order;
    });
    const values = sortedCandidates.map((candidate) => candidate.value);

    switch (this.normalizeActualAggregationMode(configuredMode)) {
      case ObjectiveActualAggregationMode.SUM_OF_TERMS:
        return values.reduce((sum, value) => sum + value, 0);
      case ObjectiveActualAggregationMode.AVERAGE_OF_TERMS:
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      case ObjectiveActualAggregationMode.MAX_OF_TERMS:
        return Math.max(...values);
      case ObjectiveActualAggregationMode.MIN_OF_TERMS:
        return Math.min(...values);
      case ObjectiveActualAggregationMode.LATEST_VALUE:
      default:
        return sortedCandidates[sortedCandidates.length - 1].value;
    }
  }

  private normalizeActualAggregationMode(mode?: unknown): ObjectiveActualAggregationModeType {
    return Object.values(ObjectiveActualAggregationMode).includes(mode as ObjectiveActualAggregationModeType)
      ? mode as ObjectiveActualAggregationModeType
      : ObjectiveActualAggregationMode.LATEST_VALUE;
  }

  private actualTermRank(term?: AssessmentTermCodeType): number {
    const rank: Record<string, number> = {
      [AssessmentTermCode.Q1]: 1,
      [AssessmentTermCode.Q2]: 2,
      [AssessmentTermCode.Q3]: 3,
      [AssessmentTermCode.Q4]: 4,
      [AssessmentTermCode.H1]: 5,
      [AssessmentTermCode.H2]: 6,
      [AssessmentTermCode.Y1]: 7,
    };

    return rank[term ?? ''] ?? 100;
  }

  private interpretObjectiveTarget(
    objective: Pick<AchievementObjectiveRecord, 'targetValue' | 'targetDirection' | 'actualAggregationMode'>,
    actualValue: unknown,
  ): ObjectiveTargetInterpretation {
    const targetDirection = this.normalizeTargetDirection(objective.targetDirection);
    const targetDirectionLabel = this.getTargetDirectionLabel(objective.targetDirection);
    const actualAggregationMode = this.normalizeActualAggregationMode(objective.actualAggregationMode);
    const targetValue = this.parseNumericTargetValue(objective.targetValue);

    if (!this.isNumericTargetDirection(targetDirection)) {
      return {
        targetDirection,
        targetDirectionLabel,
        actualAggregationMode,
        status: 'NOT_APPLICABLE',
        message: 'No numeric target interpretation is required.',
      };
    }

    if (targetValue === undefined) {
      return {
        targetDirection,
        targetDirectionLabel,
        actualAggregationMode,
        status: 'MISSING_TARGET',
        message: 'Numeric target value is required before target status can be shown.',
      };
    }

    if (actualValue === undefined || actualValue === null || String(actualValue).trim() === '') {
      return {
        targetDirection,
        targetDirectionLabel,
        actualAggregationMode,
        targetValue,
        status: 'MISSING_ACTUAL',
        message: 'Actual value is required before target status can be shown.',
      };
    }

    const actualNumber = this.parseNumericTargetValue(actualValue);
    if (actualNumber === undefined) {
      return {
        targetDirection,
        targetDirectionLabel,
        actualAggregationMode,
        targetValue,
        status: 'INVALID_ACTUAL',
        message: 'Actual value must be numeric.',
      };
    }

    const targetMet = targetDirection === ObjectiveTargetDirection.HIGHER_IS_BETTER
      ? actualNumber >= targetValue
      : actualNumber <= targetValue;

    return {
      targetDirection,
      targetDirectionLabel,
      actualAggregationMode,
      targetValue,
      actualValue: actualNumber,
      targetMet,
      status: targetMet ? 'MET' : 'NOT_MET',
      message: targetMet ? 'Target met.' : 'Target not met.',
    };
  }

  private normalizeTargetDirection(direction?: unknown): NormalizedTargetDirection | undefined {
    switch (direction) {
      case ObjectiveTargetDirection.HIGHER_IS_BETTER:
      case ObjectiveTargetDirection.INCREASE:
      case ObjectiveTargetDirection.ACHIEVE:
        return ObjectiveTargetDirection.HIGHER_IS_BETTER;
      case ObjectiveTargetDirection.LOWER_IS_BETTER:
      case ObjectiveTargetDirection.DECREASE:
        return ObjectiveTargetDirection.LOWER_IS_BETTER;
      case ObjectiveTargetDirection.NOT_APPLICABLE:
      case ObjectiveTargetDirection.MAINTAIN:
        return ObjectiveTargetDirection.NOT_APPLICABLE;
      default:
        return undefined;
    }
  }

  private isNumericTargetDirection(direction?: NormalizedTargetDirection): boolean {
    return (
      direction === ObjectiveTargetDirection.HIGHER_IS_BETTER ||
      direction === ObjectiveTargetDirection.LOWER_IS_BETTER
    );
  }

  private getTargetDirectionLabel(direction?: unknown): string {
    const normalized = this.normalizeTargetDirection(direction);
    switch (normalized) {
      case ObjectiveTargetDirection.HIGHER_IS_BETTER:
        return 'Higher value is better';
      case ObjectiveTargetDirection.LOWER_IS_BETTER:
        return 'Lower value is better';
      case ObjectiveTargetDirection.NOT_APPLICABLE:
      default:
        return 'No numeric target';
    }
  }

  private parseNumericTargetValue(value: unknown): number | undefined {
    if (value === undefined || value === null || String(value).trim() === '') {
      return undefined;
    }

    const numberValue = typeof value === 'number'
      ? value
      : Number(String(value).replace(/,/g, '').trim());

    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private async resolveActualColumnMetadata(
    termAssignment: any,
    section: ITemplateSection,
    achievementField: ITemplateField,
  ): Promise<ActualColumnMetadata> {
    const assessmentTermType = await this.resolveAssessmentTermType(termAssignment);
    const allowedTerms = getAssessmentTerms(assessmentTermType) as AssessmentTermCodeType[];
    const allowedTermSet = new Set(allowedTerms);
    const configuredActualColumns = this.getConfiguredActualColumns(section, achievementField)
      .map((column) => ({
        ...column,
        allowed: allowedTermSet.has(column.term),
      }));

    return {
      assessmentTermType,
      allowedTerms,
      currentTerm: termAssignment.assessmentTermCode,
      configuredActualColumns,
    };
  }

  private async resolveAssessmentTermType(termAssignment: any): Promise<AssessmentTermTypeType> {
    if (termAssignment.assessmentTermType) {
      return termAssignment.assessmentTermType;
    }

    if (termAssignment.cycleTermId) {
      const termCycle = await TermCycle.findById(termAssignment.cycleTermId)
        .select('assessmentTermType')
        .lean();
      if (termCycle?.assessmentTermType) {
        return termCycle.assessmentTermType;
      }
    }

    if (termAssignment.cycleId) {
      const cycle = await AnnualCycle.findById(termAssignment.cycleId)
        .select('assessmentTermType')
        .lean();
      if (cycle?.assessmentTermType) {
        return cycle.assessmentTermType;
      }
    }

    return AssessmentTermType.QUARTERLY;
  }

  private getConfiguredActualColumns(
    section: ITemplateSection,
    achievementField: ITemplateField,
  ): ActualColumnMetadata['configuredActualColumns'] {
    const actualColumns: ActualColumnMetadata['configuredActualColumns'] = [];

    for (const field of section.fields ?? []) {
      if (field.fieldKey === achievementField.fieldKey) {
        continue;
      }
      const term = this.extractActualTermFromKeyOrLabel(field.fieldKey, field.fieldLabel);
      if (term) {
        actualColumns.push({
          key: field.fieldKey,
          label: field.fieldLabel,
          term,
          source: 'FIELD',
          allowed: false,
        });
      }
    }

    for (const column of achievementField.gridConfig?.columns ?? []) {
      const term = this.extractActualTermFromKeyOrLabel(column.key, column.label);
      if (term) {
        actualColumns.push({
          key: column.key,
          label: column.label,
          term,
          source: 'GRID_COLUMN',
          allowed: false,
        });
      }
    }

    return actualColumns;
  }

  private extractActualTermsFromValue(value: unknown): AssessmentTermCodeType[] {
    const terms = new Set<AssessmentTermCodeType>();
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }

      for (const [key, nestedValue] of Object.entries(node as Record<string, unknown>)) {
        const term = this.extractActualTermFromKeyOrLabel(key);
        if (term) {
          terms.add(term);
        }
        visit(nestedValue);
      }
    };

    visit(value);
    return [...terms];
  }

  private extractActualTermFromKeyOrLabel(
    key?: unknown,
    label?: unknown,
  ): AssessmentTermCodeType | undefined {
    const text = `${String(key ?? '')} ${String(label ?? '')}`.toUpperCase();
    if (!text.includes('ACTUAL')) {
      return undefined;
    }

    const compact = text.replace(/[^A-Z0-9]/g, '_');
    const candidates: AssessmentTermCodeType[] = [
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
      AssessmentTermCode.H1,
      AssessmentTermCode.H2,
      AssessmentTermCode.Y1,
    ];

    return candidates.find((term) =>
      new RegExp(`(^|_)${term}(_|$)`).test(compact) ||
      new RegExp(`(^|_)ACTUAL_${term}(_|$)`).test(compact) ||
      new RegExp(`(^|_)${term}_ACTUAL(_|$)`).test(compact),
    );
  }

  private canPromoteItemSubmissionToOverall(
    section: ITemplateSection,
    field: ITemplateField,
    items: Array<Record<string, any>>,
    values: Array<Record<string, any>>,
    config: AchievementTemplateConfig,
    approvedObjectives: AchievementObjectiveRecord[] = [],
    resolvedFields: ResolvedTemplateField[] = [],
  ): boolean {
    if (config.achievementSubmissionRequired && items.length === 0) {
      return false;
    }

    if (items.length === 0) {
      return false;
    }

    if (config.achievementEntryMode === AchievementEntryMode.EMPLOYEE_AUTHORED) {
      const validSubmittedItem = items.some((item) =>
        item.type === AchievementItemType.EMPLOYEE_AUTHORED &&
        String(item.subject ?? '').trim().length > 0 &&
        String(item.description ?? '').trim().length > 0 &&
        this.isAchievementItemSubmittedOrLocked(item) &&
        (!config.objectiveRelationshipRequired || Boolean(item.relatedObjectiveId))
      );
      if (config.achievementSubmissionRequired && !validSubmittedItem) {
        return false;
      }
    }

    if (
      config.achievementEntryMode !== AchievementEntryMode.EMPLOYEE_AUTHORED &&
      config.objectiveLinkedAchievementRequired
    ) {
      const submittedObjectiveIds = new Set(
        items
          .filter((item) =>
            item.type === AchievementItemType.OBJECTIVE &&
            item.objectiveId &&
            item.description &&
            this.isAchievementItemSubmittedOrLocked(item)
          )
          .map((item) => item.objectiveId.toString()),
      );
      const missingObjective = approvedObjectives.find(
        (objective) => objective.isScoreable && !submittedObjectiveIds.has(objective.id),
      );

      if (missingObjective) {
        return false;
      }
    }

    if (
      config.achievementSubmissionRequired &&
      !items.some((item) => this.isAchievementItemSubmittedOrLocked(item))
    ) {
      return false;
    }

    for (const workUpdateField of this.getWorkUpdateFields(section, field.fieldKey, resolvedFields)) {
      if (workUpdateField.editable !== true || workUpdateField.isRequired !== true) {
        continue;
      }

      const submittedValue = values.find((value) => value.fieldKey === workUpdateField.fieldKey);
      if (!this.hasMeaningfulAchievementValue(submittedValue)) {
        return false;
      }
    }

    return true;
  }

  private isAchievementItemSubmittedOrLocked(item: Record<string, any>): boolean {
    return (
      item.itemStatus === EmployeeAchievementSubmissionStatus.SUBMITTED ||
      item.itemStatus === EmployeeAchievementSubmissionStatus.LOCKED
    );
  }

  private hasMeaningfulAchievementValue(value?: Record<string, any>): boolean {
    if (!value) return false;
    if (value.valueJson !== undefined && value.valueJson !== null) {
      if (Array.isArray(value.valueJson)) return value.valueJson.length > 0;
      if (typeof value.valueJson === 'object') return Object.keys(value.valueJson).length > 0;
      return String(value.valueJson).trim().length > 0;
    }
    if (value.valueNumber !== undefined && value.valueNumber !== null) {
      return Number.isFinite(Number(value.valueNumber));
    }
    if (value.valueDate) {
      return !Number.isNaN(new Date(value.valueDate).getTime());
    }
    return String(value.valueText ?? '').trim().length > 0;
  }

  private resolveTemplateConfig(
    templateVersion: { metadata?: Record<string, unknown>; sections?: ITemplateSection[] } | null,
    section: ITemplateSection,
  ): AchievementTemplateConfig {
    const metadata = (templateVersion?.metadata ?? {}) as Record<string, any>;
    const sectionExists = Boolean(section);
    // Achievement settings were historically stored on the section and are now
    // also stored on version metadata. Keep the assigned version authoritative,
    // but do not discard the section settings when version metadata is absent.
    const employeeAchievementConfig = {
      ...((section.metadata ?? {}) as Record<string, any>),
      ...((metadata.employeeAchievementConfig ?? {}) as Record<string, any>),
    };
    const achievementEntryMode =
      employeeAchievementConfig.achievementEntryMode === AchievementEntryMode.EMPLOYEE_AUTHORED
        ? AchievementEntryMode.EMPLOYEE_AUTHORED
        : AchievementEntryMode.OBJECTIVE_ROWS;
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
      achievementEntryMode,
      objectiveRelationshipEnabled:
        employeeAchievementConfig.objectiveRelationshipEnabled !== undefined
          ? Boolean(employeeAchievementConfig.objectiveRelationshipEnabled)
          : true,
      objectiveRelationshipRequired:
        employeeAchievementConfig.objectiveRelationshipRequired !== undefined
          ? Boolean(employeeAchievementConfig.objectiveRelationshipRequired)
          : false,
      allowMultipleAchievementsPerObjective:
        employeeAchievementConfig.allowMultipleAchievementsPerObjective !== undefined
          ? Boolean(employeeAchievementConfig.allowMultipleAchievementsPerObjective)
          : true,
      allowManagerReviewWithoutAchievement:
        employeeAchievementConfig.allowManagerReviewWithoutAchievement !== undefined
          ? Boolean(employeeAchievementConfig.allowManagerReviewWithoutAchievement)
          : false,
      managerCanEditEmployeeAchievement: false,
      objectiveLinkedAchievementRequired:
        employeeAchievementConfig.objectiveLinkedAchievementRequired !== undefined
          ? Boolean(employeeAchievementConfig.objectiveLinkedAchievementRequired)
          : achievementEntryMode === AchievementEntryMode.OBJECTIVE_ROWS,
      additionalContributionsEnabled:
        employeeAchievementConfig.additionalContributionsEnabled !== undefined
          ? Boolean(employeeAchievementConfig.additionalContributionsEnabled)
          : true,
    };
  }

  private async getEligibleObjectives(
    annualAssignmentId: Types.ObjectId,
  ): Promise<AchievementObjectiveRecord[]> {
    const termAssignments = await TermAssignment.find({
      annualAssignmentId,
      isDeleted: false,
    })
      .select('_id assessmentTermCode')
      .lean();
    const termCodeByAssignmentId = new Map(
      termAssignments.map((assignment) => [
        assignment._id.toString(),
        assignment.assessmentTermCode as AssessmentTermCodeType,
      ]),
    );
    const termRank = new Map(
      (Object.values(AssessmentTermCode) as AssessmentTermCodeType[])
        .map((term, index) => [term, index]),
    );
    const objectives = await Objective.find({
      termAssignmentId: { $in: termAssignments.map((assignment) => assignment._id) },
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
      isDeleted: false,
    })
      .select(
        'termAssignmentId assessmentTermCode objectiveNo title description expectedOutcome targetMetric targetValue targetDate weightage source isPredefined objectiveSnapshot',
      )
      .lean();

    return objectives
      .sort((left: Record<string, any>, right: Record<string, any>) => {
        const leftTerm = left.assessmentTermCode ?? termCodeByAssignmentId.get(left.termAssignmentId.toString());
        const rightTerm = right.assessmentTermCode ?? termCodeByAssignmentId.get(right.termAssignmentId.toString());
        const termDifference = (termRank.get(leftTerm) ?? 0) - (termRank.get(rightTerm) ?? 0);
        if (termDifference !== 0) return termDifference;
        return Number(left.objectiveNo ?? 0) - Number(right.objectiveNo ?? 0);
      })
      .map((objective: Record<string, any>) => {
      const weightage = objective.weightage === undefined || objective.weightage === null
        ? undefined
        : Number(objective.weightage);

      return {
        id: objective._id.toString(),
        assessmentTermCode:
          objective.assessmentTermCode ??
          termCodeByAssignmentId.get(objective.termAssignmentId.toString()),
        objectiveNo: objective.objectiveNo,
        title: String(objective.title ?? ''),
        description: objective.description,
        expectedOutcome: objective.expectedOutcome,
        targetMetric: objective.targetMetric,
        targetValue: objective.objectiveSnapshot?.targetValue ?? objective.targetValue,
        targetDirection: objective.objectiveSnapshot?.targetDirection,
        actualAggregationMode:
          objective.objectiveSnapshot?.actualAggregationMode ?? ObjectiveActualAggregationMode.LATEST_VALUE,
        targetDirectionLabel: this.getTargetDirectionLabel(objective.objectiveSnapshot?.targetDirection),
        targetInterpretation: this.interpretObjectiveTarget(
          {
            targetValue: objective.objectiveSnapshot?.targetValue ?? objective.targetValue,
            targetDirection: objective.objectiveSnapshot?.targetDirection,
            actualAggregationMode:
              objective.objectiveSnapshot?.actualAggregationMode ?? ObjectiveActualAggregationMode.LATEST_VALUE,
          },
          undefined,
        ),
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

  private async hasAnnualObjectiveSettingStarted(
    termAssignment: any,
    annualAssignment: any,
  ): Promise<boolean> {
    const assessmentTermType = await this.resolveAssessmentTermType(termAssignment);
    const assessmentTerms = getAssessmentTerms(assessmentTermType) as AssessmentTermCodeType[];
    const configuredTerms = new Set<AssessmentTermCodeType>(
      (annualAssignment.applicableTerms ?? []) as AssessmentTermCodeType[],
    );
    const firstTermCode = assessmentTerms.find(
      (term) => configuredTerms.size === 0 || configuredTerms.has(term),
    ) ?? assessmentTerms[0];
    const firstTermAssignment = await TermAssignment.findOne({
      annualAssignmentId: termAssignment.annualAssignmentId,
      assessmentTermCode: firstTermCode,
      isDeleted: false,
    }).lean();
    const firstTermContext = firstTermAssignment ?? {
      assessmentTermCode: firstTermCode,
    };
    const termCycle = firstTermAssignment?.cycleTermId
      ? await TermCycle.findById(firstTermAssignment.cycleTermId).lean()
      : await TermCycle.findOne({
        cycleId: termAssignment.cycleId,
        assessmentTermCode: firstTermCode,
        isDeleted: false,
      }).lean();
    const startDate = resolveEffectiveTermWindows(
      firstTermContext,
      termCycle,
      annualAssignment,
    ).objectiveSettingWindow?.startDate;

    if (startDate) {
      return this.toDateOnlyValue(this.getCurrentDate()) >= this.toDateOnlyValue(startDate);
    }

    // Legacy cycles may not contain a window snapshot. Preserve their previous
    // state-based access behavior instead of making existing data inaccessible.
    const startedAssignment = await TermAssignment.exists({
      annualAssignmentId: termAssignment.annualAssignmentId,
      termState: { $ne: TermWorkflowState.NOT_STARTED },
      isDeleted: false,
    });

    return Boolean(startedAssignment);
  }

  private buildObjectiveSnapshot(objective: AchievementObjectiveRecord) {
    return {
      assessmentTermCode: objective.assessmentTermCode,
      objectiveNo: objective.objectiveNo,
      title: objective.title,
      description: objective.description,
      expectedOutcome: objective.expectedOutcome,
      targetMetric: objective.targetMetric,
      targetValue: objective.targetValue,
      targetDirection: objective.targetDirection,
      actualAggregationMode: objective.actualAggregationMode ?? ObjectiveActualAggregationMode.LATEST_VALUE,
      targetDate: objective.targetDate ? new Date(objective.targetDate) : undefined,
      weightage: objective.weightage,
      source: objective.source,
    };
  }

  private getAchievementSection(
    templateVersion: { sections?: ITemplateSection[] } | null,
    assessmentTermCode: AssessmentTermCodeType,
  ): ITemplateSection {
    const section = (templateVersion?.sections ?? []).find(
      (item) => {
        const termScope = [
          ...(item.termScope ?? []),
          ...(item.repeatFor ?? []),
        ];

        return (
          item.sectionKey === EmployeeAchievementSubmissionService.SECTION_KEY &&
          this.isTermLevelTemplateSection(item.level) &&
          this.assessmentTermScopeMatches(termScope, assessmentTermCode)
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

  private isTermLevelTemplateSection(level?: unknown): boolean {
    const normalized = String(level ?? '').trim().toUpperCase();
    return normalized === 'TERM';
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

  private getWorkUpdateFields(
    section: ITemplateSection,
    achievementFieldKey: string,
    resolvedFields: ResolvedTemplateField[] = [],
  ): EmployeeWorkUpdateFieldRecord[] {
    const resolvedFieldMap = new Map(resolvedFields.map((field) => [field.key, field]));
    return (section.fields ?? [])
      .filter((field) => field.fieldKey !== achievementFieldKey)
      .filter((field) => resolvedFieldMap.has(field.fieldKey))
      .sort((left, right) => Number(left.displayOrder ?? 0) - Number(right.displayOrder ?? 0))
      .map((field) => ({
        fieldKey: field.fieldKey,
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType,
        isRequired: resolvedFieldMap.get(field.fieldKey)?.required ?? field.isRequired === true,
        visible: resolvedFieldMap.get(field.fieldKey)?.visible !== false,
        editable: resolvedFieldMap.get(field.fieldKey)?.editable === true,
        placeholder: field.placeholder,
        helpText: field.helpText,
        options: (field.options ?? []).map((option) => ({
          label: option.label,
          value: option.value,
        })),
      }));
  }

  private async resolveEmployeeAchievementFields(
    annualAssignment: any,
    termAssignment: any,
    achievementValues: Array<Record<string, any>>,
  ): Promise<ResolvedTemplateField[]> {
    if (!annualAssignment.templateVersionId) {
      return [];
    }

    const templateService = new PmsTemplateService(this.context);
    const resolved = await templateService.resolveTemplateVersion(
      annualAssignment.templateVersionId.toString(),
      {
        role: PmsRole.EMPLOYEE,
        workflowState: TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
        hierarchyScope: 'self',
        quarter: termAssignment.assessmentTermCode,
        annualAssignmentId: termAssignment.annualAssignmentId.toString(),
        termAssignmentId: termAssignment._id.toString(),
        values: this.buildAchievementResolveValues(achievementValues),
      },
    );

    return resolved.sections.flatMap((section) => section.fields);
  }

  private buildAchievementResolveValues(
    achievementValues: Array<Record<string, any>>,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const value of achievementValues) {
      if (!value.fieldKey) continue;
      if (value.valueJson !== undefined) values[value.fieldKey] = value.valueJson;
      else if (value.valueNumber !== undefined) values[value.fieldKey] = value.valueNumber;
      else if (value.valueDate !== undefined) values[value.fieldKey] = value.valueDate;
      else if (value.valueText !== undefined) values[value.fieldKey] = value.valueText;
    }
    return values;
  }

  private mergePreservedReadOnlyAchievementValues(
    nextValues: Array<Record<string, any>>,
    existingValues: Array<Record<string, any>>,
    resolvedFields: ResolvedTemplateField[],
    achievementFieldKey: string,
  ): Array<Record<string, any>> {
    const resolvedFieldMap = new Map(resolvedFields.map((field) => [field.key, field]));
    const nextKeys = new Set(nextValues.map((value) => `${value.sectionKey}::${value.fieldKey}`));
    const preservedValues = existingValues.filter((value) => {
      if (!value?.fieldKey || value.fieldKey === achievementFieldKey) return false;
      const resolvedField = resolvedFieldMap.get(value.fieldKey);
      if (resolvedField?.editable === true) return false;
      return !nextKeys.has(`${value.sectionKey}::${value.fieldKey}`);
    });

    return [...nextValues, ...preservedValues];
  }

  private mergeExistingNonAchievementValues(
    nextValues: Array<Record<string, any>>,
    existingValues: Array<Record<string, any>>,
    achievementFieldKey: string,
  ): Array<Record<string, any>> {
    const nextKeys = new Set(nextValues.map((value) => `${value.sectionKey}::${value.fieldKey}`));
    const preservedValues = existingValues.filter((value) => {
      if (!value?.fieldKey || value.fieldKey === achievementFieldKey) return false;
      return !nextKeys.has(`${value.sectionKey}::${value.fieldKey}`);
    });

    return [...nextValues, ...preservedValues];
  }

  private async assertViewAccess(termAssignment: any): Promise<void> {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);

    if (
      mappedRole === PmsRole.ADMIN ||
      mappedRole === PmsRole.MANAGEMENT ||
      mappedRole === PmsRole.DIRECTOR
    ) {
      return;
    }

    if (actor.actorId === termAssignment.employeeId.toString()) {
      return;
    }

    if (actor.actorId === termAssignment.assignedManagerId.toString()) {
      return;
    }

    const delegation = await this.getReviewDelegation(
      actor.actorId,
      termAssignment.assignedManagerId.toString(),
      termAssignment.cycleId?.toString(),
      termAssignment.annualAssignmentId.toString(),
    );
    if (delegation) {
      return;
    }

    throw new Error('Access denied');
  }

  private async assertEmployeeEditAccess(termAssignment: any): Promise<void> {
    await this.assertAchievementWorkflowAllowed(termAssignment);

    const actor = this.requireActor();
    const access = await accessService.canPerform({
      actor,
      action: 'achievementSubmission.edit',
      resource: {
        employeeId: termAssignment.employeeId.toString(),
        managerId: termAssignment.assignedManagerId.toString(),
      },
    });

    if (!access.allowed) {
      throw new Error('Only the employee can edit employee achievement submission');
    }

    if (actor.actorId !== termAssignment.employeeId.toString()) {
      throw new Error('Employee can edit only own achievement submission');
    }

    const annualAssignment = await this.getAnnualAssignment(
      termAssignment.annualAssignmentId.toString(),
    );
    if (!await this.hasAnnualObjectiveSettingStarted(termAssignment, annualAssignment)) {
      throw new Error('Employee Achievement opens when Objective Setting starts for the first assessment term.');
    }

    const editPolicy = await this.resolveCommonAchievementEditPolicy(
      termAssignment,
      annualAssignment,
    );
    if (!editPolicy.canEdit) {
      throw new Error(editPolicy.reason || 'Employee Achievement is read-only.');
    }
  }

  private async ensureAchievementStageOpen(
    termAssignment: any,
    _config: AchievementTemplateConfig,
  ) {
    await this.assertAchievementWorkflowAllowed(termAssignment);
    return termAssignment;
  }

  private async assertAchievementWorkflowAllowed(termAssignment: any): Promise<void> {
    const annualAssignment = await this.getAnnualAssignment(
      termAssignment.annualAssignmentId.toString(),
    );
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

  private async resolveCommonAchievementEditPolicy(
    termAssignment: any,
    annualAssignment: any,
  ): Promise<CommonAchievementEditPolicy> {
    const closedAnnualStates = new Set<string>([
      AnnualWorkflowState.ALL_TERMS_FINALIZED,
      AnnualWorkflowState.APPRAISAL_WINDOW_OPEN,
      AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT,
      AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED,
      AnnualWorkflowState.ANNUAL_FINALIZED,
      AnnualWorkflowState.VISIBILITY_ENABLED,
      AnnualWorkflowState.COMMUNICATION_READY,
      AnnualWorkflowState.COMMUNICATION_SENT,
      AnnualWorkflowState.CLOSED,
      AnnualWorkflowState.ARCHIVED,
      AnnualWorkflowState.CANCELLED,
    ]);
    if (closedAnnualStates.has(String(annualAssignment.annualState))) {
      return {
        canEdit: false,
        reason: 'The performance term is finalized, so Employee Achievement is read-only.',
      };
    }

    const assessmentTermType = await this.resolveAssessmentTermType(termAssignment);
    const assessmentTerms = getAssessmentTerms(assessmentTermType) as AssessmentTermCodeType[];
    const configuredTerms = new Set<AssessmentTermCodeType>(
      (annualAssignment.applicableTerms ?? []) as AssessmentTermCodeType[],
    );
    const finalTermCode = [...assessmentTerms]
      .reverse()
      .find((term) => configuredTerms.size === 0 || configuredTerms.has(term))
      ?? assessmentTerms[assessmentTerms.length - 1];

    const [finalTermAssignment, finalReviewPeriod] = await Promise.all([
      TermAssignment.findOne({
        annualAssignmentId: termAssignment.annualAssignmentId,
        assessmentTermCode: finalTermCode,
        isDeleted: false,
      }).lean(),
      ManagerReviewPeriodAssignment.findOne({
        annualAssignmentId: termAssignment.annualAssignmentId,
        includedTerms: finalTermCode,
        isDeleted: false,
      })
        .select('anchorTermAssignmentId reviewState')
        .lean(),
    ]);

    const finalTermClosed = finalTermAssignment && (
      finalTermAssignment.termState === TermWorkflowState.TERM_FINALIZED ||
      finalTermAssignment.termState === TermWorkflowState.CLOSED_BY_ADMIN
    );
    const finalGroupClosed = finalReviewPeriod && (
      finalReviewPeriod.reviewState === ManagerReviewPeriodState.FINALIZED ||
      finalReviewPeriod.reviewState === ManagerReviewPeriodState.CLOSED_BY_ADMIN
    );
    if (finalTermClosed || finalGroupClosed) {
      return {
        canEdit: false,
        reason: 'The final review term is finalized, so Employee Achievement is read-only.',
      };
    }

    const deadlineTermAssignment = finalReviewPeriod?.anchorTermAssignmentId
      ? await TermAssignment.findById(finalReviewPeriod.anchorTermAssignmentId).lean()
      : finalTermAssignment;
    const deadlineTermContext = deadlineTermAssignment ?? {
      assessmentTermCode: finalTermCode,
    };
    const termCycle = deadlineTermAssignment?.cycleTermId
      ? await TermCycle.findById(deadlineTermAssignment.cycleTermId).lean()
      : await TermCycle.findOne({
        cycleId: termAssignment.cycleId,
        assessmentTermCode: finalTermCode,
        isDeleted: false,
      }).lean();
    const deadline = resolveEffectiveTermWindows(
      deadlineTermContext,
      termCycle,
      annualAssignment,
    ).managerReviewWindow?.endDate;

    if (
      deadline &&
      this.toDateOnlyValue(this.getCurrentDate()) > this.toDateOnlyValue(deadline)
    ) {
      return {
        canEdit: false,
        deadline: new Date(deadline),
        reason: 'The final Manager Review end date has passed, so Employee Achievement is read-only.',
      };
    }

    return {
      canEdit: true,
      deadline: deadline ? new Date(deadline) : undefined,
    };
  }

  private async prepareAchievementMutation(termAssignmentId: string) {
    let termAssignment = await this.getTermAssignment(termAssignmentId);
    const annualAssignment = await this.getAnnualAssignment(termAssignment.annualAssignmentId.toString());
    const templateVersion = await this.getTemplateVersion(annualAssignment.templateVersionId?.toString());
    const section = this.getAchievementSection(templateVersion, termAssignment.assessmentTermCode);
    const field = this.getAchievementField(section);
    const config = this.resolveTemplateConfig(templateVersion, section);

    if (!config.employeeAchievementEnabled || config.reviewFlowMode !== 'ACHIEVEMENT_THEN_MANAGER') {
      throw new Error('Employee Achievement Submission is not enabled for this template');
    }

    termAssignment = await this.ensureAchievementStageOpen(termAssignment, config);

    return {
      termAssignment,
      annualAssignment,
      templateVersion,
      section,
      field,
      config,
    };
  }

  private achievementItemIdentity(item: Partial<AchievementItemInput> | Record<string, any>) {
    const itemId = String(item.itemId ?? '').trim();
    if (itemId) return `ITEM:${itemId}`;
    return this.legacyAchievementItemIdentity(item);
  }

  private legacyAchievementItemIdentity(item: Partial<AchievementItemInput> | Record<string, any>) {
    const objectiveId = item.objectiveId?.toString?.() || (item.objectiveId ? String(item.objectiveId) : '');
    if (objectiveId) return `OBJECTIVE:${objectiveId}`;
    const subject = String(item.subject ?? '').trim().toLowerCase();
    return `${item.type || AchievementItemType.ADDITIONAL}:${subject}`;
  }

  private defaultItemStatusForSubmission(status?: string) {
    if (status === EmployeeAchievementSubmissionStatus.SUBMITTED) {
      return EmployeeAchievementSubmissionStatus.SUBMITTED;
    }
    if (status === EmployeeAchievementSubmissionStatus.LOCKED) {
      return EmployeeAchievementSubmissionStatus.LOCKED;
    }
    return EmployeeAchievementSubmissionStatus.DRAFT;
  }

  private mergeAchievementItem(
    items: Array<Record<string, any>>,
    nextItem: Record<string, any>,
  ) {
    const nextKey = this.achievementItemIdentity(nextItem);
    const nextItems = items.map((item) =>
      typeof item?.toObject === 'function' ? item.toObject() : { ...item },
    );
    let existingIndex = nextItems.findIndex((item) => this.achievementItemIdentity(item) === nextKey);
    if (
      existingIndex < 0 &&
      nextItem.type !== AchievementItemType.EMPLOYEE_AUTHORED
    ) {
      const legacyKey = this.legacyAchievementItemIdentity(nextItem);
      existingIndex = nextItems.findIndex((item) =>
        !item.itemId && this.legacyAchievementItemIdentity(item) === legacyKey,
      );
    }

    if (existingIndex >= 0) {
      const mergedItem = {
        ...nextItems[existingIndex],
        ...nextItem,
      };
      if (Object.prototype.hasOwnProperty.call(nextItem, 'attachments')) {
        mergedItem.attachments = Array.isArray(nextItem.attachments) ? nextItem.attachments : [];
      }
      nextItems[existingIndex] = {
        ...mergedItem,
      };
      return nextItems;
    }

    return [...nextItems, nextItem];
  }

  private assertItemCanBeEdited(
    items: Array<Record<string, any>>,
    nextItem: Record<string, any>,
  ): void {
    const nextKey = this.achievementItemIdentity(nextItem);
    const existingItem = items.find((item) => this.achievementItemIdentity(item) === nextKey) ?? (
      nextItem.type !== AchievementItemType.EMPLOYEE_AUTHORED
        ? items.find((item) =>
          !item.itemId &&
          this.legacyAchievementItemIdentity(item) === this.legacyAchievementItemIdentity(nextItem),
        )
        : undefined
    );
    if (!existingItem) return;
    if (
      existingItem.itemStatus === EmployeeAchievementSubmissionStatus.SUBMITTED ||
      existingItem.itemStatus === EmployeeAchievementSubmissionStatus.LOCKED
    ) {
      throw new Error('Submitted achievement item is read-only and cannot be edited');
    }
  }

  private assertSubmittedItemsPreserved(
    existingItems: Array<Record<string, any>>,
    nextItems: Array<Record<string, any>>,
  ): void {
    for (const rawExistingItem of existingItems) {
      const existingItem = typeof rawExistingItem?.toObject === 'function'
        ? rawExistingItem.toObject()
        : rawExistingItem;
      if (
        existingItem.itemStatus !== EmployeeAchievementSubmissionStatus.SUBMITTED &&
        existingItem.itemStatus !== EmployeeAchievementSubmissionStatus.LOCKED
      ) {
        continue;
      }

      const nextItem = nextItems.find((item) =>
        this.achievementItemIdentity(item) === this.achievementItemIdentity(existingItem) ||
        (!existingItem.itemId &&
          item.type !== AchievementItemType.EMPLOYEE_AUTHORED &&
          this.legacyAchievementItemIdentity(item) === this.legacyAchievementItemIdentity(existingItem))
      );
      if (!nextItem || this.achievementItemEditableFingerprint(nextItem) !== this.achievementItemEditableFingerprint(existingItem)) {
        throw new Error('Submitted achievement items must remain unchanged');
      }
    }
  }

  private achievementItemEditableFingerprint(item: Record<string, any>): string {
    const attachments = (item.attachments ?? []).map((attachment: Record<string, any>) => ({
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
      documentId: attachment.documentId,
    }));
    return JSON.stringify({
      type: item.type,
      objectiveId: item.objectiveId?.toString?.(),
      relatedObjectiveId: item.relatedObjectiveId?.toString?.(),
      subject: String(item.subject ?? '').trim(),
      description: String(item.description ?? '').trim(),
      employeeSelfRating: item.employeeSelfRating === undefined ? undefined : Number(item.employeeSelfRating),
      employeeSelfRatingComments: String(item.employeeSelfRatingComments ?? '').trim(),
      outcome: String(item.outcome ?? '').trim(),
      attachments,
    });
  }

  private async getTermAssignment(termAssignmentId: string) {
    if (!Types.ObjectId.isValid(termAssignmentId)) {
      throw new Error('Invalid quarter assignment id');
    }

    const termAssignment = await TermAssignment.findById(termAssignmentId);
    if (!termAssignment || termAssignment.isDeleted) {
      throw new Error('Quarter assignment not found');
    }

    return termAssignment;
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
    annualAssignmentId?: string,
  ): Promise<any | null> {
    return new DelegationService(this.context).getActiveDelegation(
      delegateUserId,
      delegatorUserId,
      'PMS_REVIEWS',
      cycleId,
      annualAssignmentId,
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

  private toDateOnlyValue(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid achievement submission window date');
    }

    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
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

  private buildAchievementMutationAuditMetadata(
    config: AchievementTemplateConfig,
    previousItems: Array<Record<string, any>>,
    nextItems: Array<Record<string, any>>,
  ): Record<string, unknown> {
    const previousByItemId = new Map(
      previousItems
        .map((item) => typeof item?.toObject === 'function' ? item.toObject() : item)
        .filter((item) => item?.itemId)
        .map((item) => [String(item.itemId), item]),
    );
    const nextItemIds = new Set(
      nextItems.map((item) => String(item.itemId ?? '')).filter(Boolean),
    );
    const relationshipChanges = nextItems
      .map((item) => typeof item?.toObject === 'function' ? item.toObject() : item)
      .filter((item) => item?.itemId)
      .map((item) => {
        const previous = previousByItemId.get(String(item.itemId));
        const previousRelatedObjectiveId = previous?.relatedObjectiveId?.toString?.();
        const relatedObjectiveId = item.relatedObjectiveId?.toString?.();
        if (previous && previousRelatedObjectiveId === relatedObjectiveId) return null;
        if (!previous && !relatedObjectiveId) return null;
        return {
          itemId: String(item.itemId),
          previousRelatedObjectiveId,
          relatedObjectiveId,
          relatedObjectiveSnapshot: item.relatedObjectiveSnapshot,
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;
    for (const [itemId, previous] of previousByItemId) {
      if (nextItemIds.has(itemId) || !previous.relatedObjectiveId) continue;
      relationshipChanges.push({
        itemId,
        previousRelatedObjectiveId: previous.relatedObjectiveId.toString(),
        relatedObjectiveId: undefined,
        relatedObjectiveSnapshot: undefined,
      });
    }

    return {
      achievementEntryMode: config.achievementEntryMode,
      itemIds: [...nextItemIds],
      relationshipChanges,
    };
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
