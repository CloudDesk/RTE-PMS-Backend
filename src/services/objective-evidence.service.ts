import path from 'path';
import type { MultipartFile } from '@fastify/multipart';
import mongoose, { Types } from 'mongoose';
import {
  normalizePmsRole,
  ObjectiveApplicabilityStatus,
  PmsRole,
  TermWorkflowState,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { ObjectiveAttachment } from '../models/pms-objective-attachment.model';
import { ObjectiveEvidence } from '../models/pms-objective-evidence.model';
import { Objective } from '../models/pms-objective.model';
import { PmsDocument } from '../models/pms-document.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import type {
  IObjectiveEvidenceColumnConfig,
  ITemplateObjectiveTableColumn,
} from '../models/pms-template-version.model';
import type { RequestContext } from '../types/context';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { BaseService } from './base.service';
import { DelegationService } from './delegation.service';
import {
  isGlobalDirectorObjectiveRead,
  isObjectiveMatrixStageWindowOpen,
} from './objective-matrix.service';
import { PmsDocumentService } from './pms-document.service';

export const TERM_SUPPORTING_DOCUMENT = 'TERM_SUPPORTING_DOCUMENT';
export const OBJECTIVE_TERM_EVIDENCE_DOCUMENT_TYPE = 'ObjectiveTermEvidence';

type LeanRecord = Record<string, any>;

export class ObjectiveEvidenceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ObjectiveEvidenceError';
  }
}

export interface ReplaceObjectiveTermEvidenceInput {
  objectiveId: string;
  file: MultipartFile;
  expectedEvidenceVersion?: number;
}

export interface RemoveObjectiveTermEvidenceInput {
  objectiveId: string;
  expectedEvidenceVersion?: number;
}

export interface ObjectiveTermEvidenceResult {
  evidenceId: string;
  objectiveId: string;
  objectiveRowKey?: string;
  termAssignmentId: string;
  termCode: string;
  version: number;
  attachment: {
    id: string;
    documentId: string;
    fileName: string;
    fileType?: string;
    fileSize?: number;
    uploadedAt: string;
  };
  operation: 'UPLOADED' | 'REPLACED';
}

export interface ObjectiveEvidenceContent {
  fileUrl: string;
  fileName: string;
  fileType: string;
}

interface EvidenceResources {
  actorId: Types.ObjectId;
  actorRole: string;
  objective: LeanRecord;
  assignment: LeanRecord;
  annual: LeanRecord;
  termCycle?: LeanRecord;
  column: ITemplateObjectiveTableColumn;
  config: IObjectiveEvidenceColumnConfig;
}

export class ObjectiveEvidenceService extends BaseService {
  private readonly documentService: PmsDocumentService;

  constructor(
    context: RequestContext,
    documentService = new PmsDocumentService(context),
  ) {
    super(context);
    this.documentService = documentService;
  }

  async replaceTermEvidence(
    input: ReplaceObjectiveTermEvidenceInput,
  ): Promise<ObjectiveTermEvidenceResult> {
    const resources = await this.loadEditableResources(input.objectiveId);
    const buffer = await this.validateFile(input.file, resources.config);
    const activeEvidence = await ObjectiveEvidence.findOne({
      objectiveId: resources.objective._id,
      evidenceType: TERM_SUPPORTING_DOCUMENT,
      isDeleted: false,
    }).lean();
    this.assertExpectedVersion(activeEvidence, input.expectedEvidenceVersion);

    const uploaded = await this.documentService.uploadDocument({
      employeeId: resources.objective.employeeId.toString(),
      cycleId: resources.annual.cycleId.toString(),
      annualAssignmentId: resources.annual._id.toString(),
      termAssignmentId: resources.assignment._id.toString(),
      documentType: OBJECTIVE_TERM_EVIDENCE_DOCUMENT_TYPE,
      documentName: `${resources.objective.title} - ${resources.assignment.assessmentTermCode} Supporting Document`,
      documentDate: this.now(),
      description: `Supporting document for ${resources.assignment.assessmentTermCode} objective achievement`,
      file: input.file,
    });
    const documentId = uploaded.documentId?.toString?.() ?? String(uploaded.documentId ?? '');
    if (!Types.ObjectId.isValid(documentId)) {
      throw new ObjectiveEvidenceError(
        'The document could not be uploaded. Your existing document was not changed.',
        502,
        'PMS_OBJECTIVE_EVIDENCE_STORAGE_ERROR',
      );
    }

    let session: mongoose.ClientSession | undefined;
    let result: ObjectiveTermEvidenceResult | undefined;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const now = this.now();
        const nextVersion = activeEvidence ? Number(activeEvidence.version ?? 1) + 1 : 1;
        const [attachment] = await ObjectiveAttachment.create([{
          objectiveId: resources.objective._id,
          fileName: uploaded.fileName,
          fileUrl: uploaded.fileUrl,
          fileType: input.file.mimetype || undefined,
          fileSize: buffer.length,
          documentId,
          uploadedBy: resources.actorId,
          uploadedByRole: resources.actorRole,
          visibilityRules: {
            purpose: TERM_SUPPORTING_DOCUMENT,
            annualAssignmentId: resources.annual._id.toString(),
            termAssignmentId: resources.assignment._id.toString(),
          },
          versionNo: nextVersion,
          uploadedAt: uploaded.uploadedAt ?? now,
          isDeleted: false,
          createdBy: resources.actorId,
          updatedBy: resources.actorId,
          version: 1,
        }], { session });

        let evidenceId: Types.ObjectId;
        let retiredAttachments: LeanRecord[] = [];
        if (activeEvidence) {
          const update = await ObjectiveEvidence.updateOne(
            {
              _id: activeEvidence._id,
              version: activeEvidence.version,
              isDeleted: false,
            },
            {
              $set: {
                attachmentIds: [attachment._id],
                submittedByRole: resources.actorRole,
                submittedBy: resources.actorId,
                submittedAt: now,
                updatedBy: resources.actorId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
          if (update.modifiedCount !== 1) {
            throw this.versionConflict();
          }
          evidenceId = activeEvidence._id;
          retiredAttachments = await this.retireAttachments(
            activeEvidence.attachmentIds ?? [],
            resources.actorId,
            session!,
          );
        } else {
          const [createdEvidence] = await ObjectiveEvidence.create([{
            objectiveId: resources.objective._id,
            termAssignmentId: resources.assignment._id,
            annualAssignmentId: resources.annual._id,
            cycleId: resources.annual.cycleId,
            assessmentTermCode: resources.assignment.assessmentTermCode,
            employeeId: resources.objective.employeeId,
            evidenceType: TERM_SUPPORTING_DOCUMENT,
            title: `${resources.assignment.assessmentTermCode} supporting document`,
            attachmentIds: [attachment._id],
            submittedByRole: resources.actorRole,
            submittedBy: resources.actorId,
            submittedAt: now,
            isDeleted: false,
            createdBy: resources.actorId,
            updatedBy: resources.actorId,
            version: 1,
          }], { session });
          evidenceId = createdEvidence._id;
        }

        await auditService.createAuditLog({
          actorId: resources.actorId.toString(),
          actorRole: resources.actorRole,
          action: activeEvidence
            ? 'PMS_OBJECTIVE_TERM_EVIDENCE_REPLACED'
            : 'PMS_OBJECTIVE_TERM_EVIDENCE_UPLOADED',
          entityType: 'OBJECTIVE_EVIDENCE',
          entityId: evidenceId.toString(),
          assignmentId: resources.annual._id.toString(),
          previousValue: activeEvidence
            ? {
              version: activeEvidence.version,
              attachments: retiredAttachments.map((previous) => ({
                attachmentId: previous._id?.toString(),
                documentId: previous.documentId,
                fileName: previous.fileName,
                fileType: previous.fileType,
                fileSize: previous.fileSize,
                uploadedAt: previous.uploadedAt,
              })),
            }
            : undefined,
          newValue: {
            version: nextVersion,
            attachmentId: attachment._id.toString(),
            documentId,
            fileName: uploaded.fileName,
          },
          metadata: {
            objectiveId: resources.objective._id.toString(),
            objectiveRowKey: resources.objective.objectiveRowKey,
            termAssignmentId: resources.assignment._id.toString(),
            termCode: resources.assignment.assessmentTermCode,
            employeeId: resources.objective.employeeId.toString(),
            requestId: this.context.requestId,
          },
        }, session);

        result = {
          evidenceId: evidenceId.toString(),
          objectiveId: resources.objective._id.toString(),
          objectiveRowKey: resources.objective.objectiveRowKey,
          termAssignmentId: resources.assignment._id.toString(),
          termCode: resources.assignment.assessmentTermCode,
          version: nextVersion,
          attachment: {
            id: attachment._id.toString(),
            documentId,
            fileName: uploaded.fileName,
            fileType: input.file.mimetype || undefined,
            fileSize: buffer.length,
            uploadedAt: new Date(uploaded.uploadedAt ?? now).toISOString(),
          },
          operation: activeEvidence ? 'REPLACED' : 'UPLOADED',
        };
      });
    } catch (error: unknown) {
      await PmsDocument.updateOne(
        { _id: new Types.ObjectId(documentId) },
        { $set: { isDeleted: true } },
      ).catch(() => undefined);
      if ((error as { code?: number })?.code === 11000) throw this.versionConflict();
      throw error;
    } finally {
      if (session) await session.endSession();
    }

    if (!result) throw new Error('Objective evidence transaction did not complete');
    return result;
  }

  async resolveActiveAttachmentContent(
    evidenceId: string,
    attachmentId: string,
    action: 'preview' | 'download',
  ): Promise<ObjectiveEvidenceContent> {
    const actorId = this.actorId();
    const actorRole = normalizePmsRole(
      this.context.reqRole || this.context.user?.role || '',
    );
    if (
      !actorRole ||
      !Types.ObjectId.isValid(evidenceId) ||
      !Types.ObjectId.isValid(attachmentId)
    ) {
      throw this.contentNotAvailable();
    }

    const evidence = await ObjectiveEvidence.findOne({
      _id: new Types.ObjectId(evidenceId),
      evidenceType: TERM_SUPPORTING_DOCUMENT,
      isDeleted: false,
      attachmentIds: new Types.ObjectId(attachmentId),
    }).lean();
    if (!evidence) throw this.contentNotAvailable();

    const [objective, attachment, annual] = await Promise.all([
      Objective.findOne({ _id: evidence.objectiveId, isDeleted: false }).lean(),
      ObjectiveAttachment.findOne({
        _id: new Types.ObjectId(attachmentId),
        objectiveId: evidence.objectiveId,
        isDeleted: false,
      }).lean(),
      AnnualAssignment.findOne({
        _id: evidence.annualAssignmentId,
        isDeleted: false,
      }).lean(),
    ]);
    if (!objective || !attachment || !annual) throw this.contentNotAvailable();
    if (
      objective.annualAssignmentId?.toString() !== annual._id.toString() ||
      objective.termAssignmentId?.toString() !== evidence.termAssignmentId.toString() ||
      objective.employeeId?.toString() !== annual.employeeId.toString()
    ) {
      throw this.contentNotAvailable();
    }

    const access = await accessService.canPerform({
      actor: { actorId: actorId.toString(), actorRole },
      action: 'objective.view',
      resource: {
        employeeId: annual.employeeId.toString(),
        managerId: annual.assignedManagerId.toString(),
      },
    });
    if (!access.allowed && !isGlobalDirectorObjectiveRead(actorRole)) {
      const delegation = await new DelegationService(this.context).getActiveDelegation(
        actorId.toString(),
        annual.assignedManagerId.toString(),
        'PMS_OBJECTIVES',
        annual.cycleId.toString(),
        annual._id.toString(),
      );
      if (!delegation) throw this.contentNotAvailable();
    }

    const templateVersionId =
      annual.templateVersionId ?? objective.templateVersionId;
    const template = templateVersionId
      ? await PmsTemplateVersion.findOne({
          _id: templateVersionId,
          isDeleted: { $ne: true },
        }).lean()
      : undefined;
    const objectiveSection = template?.sections?.find((section: LeanRecord) =>
      section.sectionType === 'OBJECTIVES' &&
      section.objectiveConfig?.tableLayout?.enabled === true,
    );
    const column = objectiveSection?.objectiveConfig?.tableLayout?.columns?.find(
      (candidate: ITemplateObjectiveTableColumn) =>
        candidate.type === 'OBJECTIVE_EVIDENCE' &&
        candidate.bindingKey === 'system.objectiveEvidence',
    ) as ITemplateObjectiveTableColumn | undefined;
    const roleAccess = column?.access?.find((entry) => entry.role === actorRole);
    const actionAllowed = action === 'preview'
      ? column?.evidenceConfig?.allowPreview === true
      : column?.evidenceConfig?.allowDownload === true;
    if (!column || roleAccess?.visible === false || !actionAllowed) {
      throw this.contentNotAvailable();
    }

    const documentId = attachment.documentId?.toString();
    if (!documentId || !Types.ObjectId.isValid(documentId)) {
      throw this.contentNotAvailable();
    }
    const document = await PmsDocument.findOne({
      _id: new Types.ObjectId(documentId),
      employeeId: annual.employeeId,
      annualAssignmentId: annual._id,
      termAssignmentId: evidence.termAssignmentId,
      isDeleted: false,
    }).lean();
    if (!document?.fileUrl) throw this.contentNotAvailable();

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(document.fileUrl);
    } catch {
      throw this.contentNotAvailable();
    }
    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.hostname !== 'storage.googleapis.com'
    ) {
      throw this.contentNotAvailable();
    }
    return {
      fileUrl: parsedUrl.toString(),
      fileName: attachment.fileName || document.fileName || 'supporting-document',
      fileType: attachment.fileType || document.fileType || 'application/octet-stream',
    };
  }

  async removeTermEvidence(input: RemoveObjectiveTermEvidenceInput): Promise<{
    evidenceId: string;
    objectiveId: string;
    termCode: string;
    removedVersion: number;
  }> {
    const resources = await this.loadEditableResources(input.objectiveId);
    if (resources.config.allowEmployeeRemove !== true) {
      throw new ObjectiveEvidenceError(
        'Removing supporting documents is not enabled for this template.',
        403,
        'PMS_OBJECTIVE_EVIDENCE_REMOVE_FORBIDDEN',
      );
    }
    const evidence = await ObjectiveEvidence.findOne({
      objectiveId: resources.objective._id,
      evidenceType: TERM_SUPPORTING_DOCUMENT,
      isDeleted: false,
    }).lean();
    if (!evidence) {
      throw new ObjectiveEvidenceError(
        'No supporting document is available for this objective and review period.',
        404,
        'PMS_OBJECTIVE_EVIDENCE_NOT_FOUND',
      );
    }
    this.assertExpectedVersion(evidence, input.expectedEvidenceVersion);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const update = await ObjectiveEvidence.updateOne(
          { _id: evidence._id, version: evidence.version, isDeleted: false },
          {
            $set: {
              isDeleted: true,
              updatedBy: resources.actorId,
              submittedAt: this.now(),
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.modifiedCount !== 1) throw this.versionConflict();
        const retiredAttachments = await this.retireAttachments(
          evidence.attachmentIds ?? [],
          resources.actorId,
          session,
        );
        await auditService.createAuditLog({
          actorId: resources.actorId.toString(),
          actorRole: resources.actorRole,
          action: 'PMS_OBJECTIVE_TERM_EVIDENCE_REMOVED',
          entityType: 'OBJECTIVE_EVIDENCE',
          entityId: evidence._id.toString(),
          assignmentId: resources.annual._id.toString(),
          previousValue: {
            version: evidence.version,
            attachments: retiredAttachments.map((previous) => ({
              attachmentId: previous._id?.toString(),
              documentId: previous.documentId,
              fileName: previous.fileName,
              fileType: previous.fileType,
              fileSize: previous.fileSize,
              uploadedAt: previous.uploadedAt,
            })),
          },
          newValue: {
            isDeleted: true,
            version: Number(evidence.version ?? 1) + 1,
          },
          metadata: {
            objectiveId: resources.objective._id.toString(),
            objectiveRowKey: resources.objective.objectiveRowKey,
            termAssignmentId: resources.assignment._id.toString(),
            termCode: resources.assignment.assessmentTermCode,
            employeeId: resources.objective.employeeId.toString(),
            requestId: this.context.requestId,
          },
        }, session);
      });
    } finally {
      await session.endSession();
    }

    return {
      evidenceId: evidence._id.toString(),
      objectiveId: resources.objective._id.toString(),
      termCode: resources.assignment.assessmentTermCode,
      removedVersion: Number(evidence.version ?? 1) + 1,
    };
  }

  private async loadEditableResources(objectiveId: string): Promise<EvidenceResources> {
    const actorId = this.actorId();
    const actorRole = normalizePmsRole(
      this.context.reqRole || this.context.user?.role || '',
    );
    if (!actorRole || actorRole !== PmsRole.EMPLOYEE) {
      throw new ObjectiveEvidenceError(
        'You cannot change documents for this objective.',
        403,
        'PMS_OBJECTIVE_EVIDENCE_FORBIDDEN',
      );
    }
    if (!Types.ObjectId.isValid(objectiveId)) {
      throw new ObjectiveEvidenceError(
        'Supporting document objective was not found.',
        404,
        'PMS_OBJECTIVE_EVIDENCE_NOT_FOUND',
      );
    }

    const objective = await Objective.findOne({
      _id: new Types.ObjectId(objectiveId),
      isDeleted: false,
    }).lean();
    if (!objective) {
      throw new ObjectiveEvidenceError(
        'Supporting document objective was not found.',
        404,
        'PMS_OBJECTIVE_EVIDENCE_NOT_FOUND',
      );
    }
    if (objective.employeeId?.toString() !== actorId.toString()) {
      throw new ObjectiveEvidenceError(
        'You cannot change documents for this objective.',
        403,
        'PMS_OBJECTIVE_EVIDENCE_FORBIDDEN',
      );
    }
    if (
      objective.applicabilityStatus === ObjectiveApplicabilityStatus.NOT_APPLICABLE ||
      objective.applicabilityStatus === ObjectiveApplicabilityStatus.REPLACED
    ) {
      throw new ObjectiveEvidenceError(
        'Supporting documents cannot be changed for an inactive objective.',
        409,
        'PMS_OBJECTIVE_EVIDENCE_OBJECTIVE_INACTIVE',
      );
    }

    const [assignment, annual] = await Promise.all([
      TermAssignment.findOne({
        _id: objective.termAssignmentId,
        isDeleted: false,
      }).lean(),
      AnnualAssignment.findOne({
        _id: objective.annualAssignmentId,
        isDeleted: false,
      }).lean(),
    ]);
    if (!assignment || !annual ||
        assignment.annualAssignmentId?.toString() !== annual._id.toString() ||
        assignment.employeeId?.toString() !== objective.employeeId?.toString() ||
        annual.employeeId?.toString() !== objective.employeeId?.toString() ||
        objective.cycleId?.toString() !== annual.cycleId?.toString() ||
        assignment.assessmentTermCode !== objective.assessmentTermCode) {
      throw new ObjectiveEvidenceError(
        'Objective assignment details are inconsistent.',
        409,
        'PMS_OBJECTIVE_EVIDENCE_RELATIONSHIP_ERROR',
      );
    }

    const termCycle = assignment.cycleTermId
      ? await TermCycle.findOne({ _id: assignment.cycleTermId, isDeleted: false }).lean() ?? undefined
      : undefined;
    const explicitlyReopened =
      assignment.termState === TermWorkflowState.REOPENED_BY_ADMIN;
    const termNotStarted = assignment.termState === TermWorkflowState.NOT_STARTED;
    if (!explicitlyReopened && (termNotStarted || !isObjectiveMatrixStageWindowOpen({
      stage: 'EMPLOYEE_ACHIEVEMENT',
      assignment,
      termCycle,
      annualAssignment: annual,
      now: this.now(),
    }))) {
      throw new ObjectiveEvidenceError(
        'This review period is closed for employee changes.',
        409,
        'PMS_OBJECTIVE_EVIDENCE_WINDOW_CLOSED',
      );
    }

    const templateVersionId =
      annual.templateVersionId ?? assignment.templateVersionId ?? objective.templateVersionId;
    const template = templateVersionId
      ? await PmsTemplateVersion.findOne({ _id: templateVersionId, isDeleted: { $ne: true } }).lean()
      : undefined;
    const objectiveSection = template?.sections?.find((section: LeanRecord) =>
      section.sectionType === 'OBJECTIVES' &&
      section.objectiveConfig?.tableLayout?.enabled === true,
    );
    const column = objectiveSection?.objectiveConfig?.tableLayout?.columns?.find(
      (candidate: ITemplateObjectiveTableColumn) =>
        candidate.type === 'OBJECTIVE_EVIDENCE' &&
        candidate.bindingKey === 'system.objectiveEvidence',
    ) as ITemplateObjectiveTableColumn | undefined;
    const employeeAccess = column?.access?.find((access) => access.role === PmsRole.EMPLOYEE);
    if (!column?.evidenceConfig || employeeAccess?.visible === false || employeeAccess?.editable !== true) {
      throw new ObjectiveEvidenceError(
        'Supporting document upload is not enabled for this objective.',
        409,
        'PMS_OBJECTIVE_EVIDENCE_NOT_ENABLED',
      );
    }

    return {
      actorId,
      actorRole,
      objective,
      assignment,
      annual,
      termCycle,
      column,
      config: column.evidenceConfig,
    };
  }

  private async validateFile(
    file: MultipartFile | undefined,
    config: IObjectiveEvidenceColumnConfig,
  ): Promise<Buffer> {
    if (!file) {
      throw new ObjectiveEvidenceError(
        'Choose a document to upload.',
        400,
        'PMS_OBJECTIVE_EVIDENCE_FILE_REQUIRED',
      );
    }
    const originalName = path.basename(String(file.filename ?? '')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!originalName || originalName === '.' || originalName === '..') {
      throw new ObjectiveEvidenceError(
        'The document filename is invalid.',
        400,
        'PMS_OBJECTIVE_EVIDENCE_INVALID_FILENAME',
      );
    }
    if (!config.allowedMimeTypes.includes(file.mimetype)) {
      throw new ObjectiveEvidenceError(
        'This file type is not supported.',
        415,
        'PMS_OBJECTIVE_EVIDENCE_UNSUPPORTED_TYPE',
      );
    }
    const cached = (file as any).__cachedBuffer as Buffer | undefined;
    const buffer = cached ?? await file.toBuffer();
    (file as any).__cachedBuffer = buffer;
    (file as any).toBuffer = async () => buffer;
    if (buffer.length === 0) {
      throw new ObjectiveEvidenceError(
        'The document is empty.',
        400,
        'PMS_OBJECTIVE_EVIDENCE_EMPTY_FILE',
      );
    }
    if (buffer.length >= config.maxFileSizeBytes) {
      throw new ObjectiveEvidenceError(
        `The document must be smaller than ${this.fileSizeLabel(config.maxFileSizeBytes)}.`,
        413,
        'PMS_OBJECTIVE_EVIDENCE_FILE_TOO_LARGE',
      );
    }
    return buffer;
  }

  private assertExpectedVersion(
    evidence: LeanRecord | null,
    expectedVersion?: number,
  ): void {
    if (expectedVersion === undefined) return;
    const actualVersion = evidence ? Number(evidence.version ?? 1) : 0;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || expectedVersion !== actualVersion) {
      throw this.versionConflict();
    }
  }

  private async retireAttachments(
    attachmentIds: Types.ObjectId[],
    actorId: Types.ObjectId,
    session: mongoose.ClientSession,
  ): Promise<LeanRecord[]> {
    if (!attachmentIds.length) return [];
    const attachments = await ObjectiveAttachment.find({
      _id: { $in: attachmentIds },
      isDeleted: false,
    }).session(session).lean();
    await ObjectiveAttachment.updateMany(
      { _id: { $in: attachmentIds }, isDeleted: false },
      {
        $set: { isDeleted: true, updatedBy: actorId },
        $inc: { version: 1 },
      },
      { session },
    );
    const documentIds = attachments
      .map((attachment) => attachment.documentId)
      .filter((documentId): documentId is string =>
        typeof documentId === 'string' && Types.ObjectId.isValid(documentId),
      )
      .map((documentId) => new Types.ObjectId(documentId));
    if (documentIds.length) {
      await PmsDocument.updateMany(
        { _id: { $in: documentIds }, isDeleted: false },
        { $set: { isDeleted: true } },
        { session },
      );
    }
    return attachments;
  }

  private actorId(): Types.ObjectId {
    const actorId = this.context.user?._id?.toString();
    if (!actorId || !Types.ObjectId.isValid(actorId)) {
      throw new ObjectiveEvidenceError(
        'Authenticated employee is required.',
        401,
        'PMS_OBJECTIVE_EVIDENCE_UNAUTHENTICATED',
      );
    }
    return new Types.ObjectId(actorId);
  }

  private now(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private versionConflict(): ObjectiveEvidenceError {
    return new ObjectiveEvidenceError(
      'This document changed in another session. Refresh and try again.',
      409,
      'PMS_OBJECTIVE_EVIDENCE_VERSION_CONFLICT',
    );
  }

  private contentNotAvailable(): ObjectiveEvidenceError {
    return new ObjectiveEvidenceError(
      'Supporting document not available.',
      404,
      'PMS_OBJECTIVE_EVIDENCE_CONTENT_NOT_AVAILABLE',
    );
  }

  private fileSizeLabel(bytes: number): string {
    if (bytes === 1024 * 1024) return '1 MB';
    return `${bytes} bytes`;
  }
}
