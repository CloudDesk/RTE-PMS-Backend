import mongoose, { Types } from 'mongoose';
import { AnnualAssignment } from '../../src/models/pms-annual-assignment.model';
import { ObjectiveAttachment } from '../../src/models/pms-objective-attachment.model';
import { ObjectiveEvidence } from '../../src/models/pms-objective-evidence.model';
import { Objective } from '../../src/models/pms-objective.model';
import { PmsDocument } from '../../src/models/pms-document.model';
import { PmsTemplateVersion } from '../../src/models/pms-template-version.model';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { auditService } from '../../src/services/audit.service';
import { accessService } from '../../src/services/access.service';
import {
  ObjectiveEvidenceError,
  ObjectiveEvidenceService,
  resolveObjectiveEvidenceEditRole,
  TERM_SUPPORTING_DOCUMENT,
} from '../../src/services/objective-evidence.service';
import type { RequestContext } from '../../src/types/context';

function context(role = 'EMPLOYEE', userId = new Types.ObjectId().toString()): RequestContext {
  return {
    requestId: 'objective-evidence-phase2-test',
    reqRole: role,
    pmsCurrentDate: new Date('2026-04-15T10:00:00.000Z'),
    user: {
      _id: userId,
      email: 'employee@test.local',
      name: 'Employee',
      role,
      departmentId: '',
      active: true,
      country: '',
      currency: '',
      licenseType: '',
      portalAccess: true,
    },
  };
}

function queryResult<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) } as never;
}

function file(
  mimeType = 'application/pdf',
  bytes = Buffer.from('valid evidence'),
) {
  return {
    filename: 'q1-result.pdf',
    mimetype: mimeType,
    __cachedBuffer: bytes,
    toBuffer: jest.fn().mockResolvedValue(bytes),
  } as any;
}

function config() {
  return {
    scope: 'PER_EMPLOYEE_TERM' as const,
    displayMode: 'ANNUAL_AGGREGATED' as const,
    maxActiveFilesPerTerm: 1 as const,
    replacementPolicy: 'REPLACE_ACTIVE_TERM_DOCUMENT' as const,
    maxFileSizeBytes: 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/png'],
    showTermLabel: true,
    allowPreview: true,
    allowDownload: true,
    allowEmployeeRemove: true,
    retainReplacementHistory: true,
  };
}

function resources() {
  const employeeId = new Types.ObjectId();
  const objectiveId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const annualId = new Types.ObjectId();
  const cycleId = new Types.ObjectId();
  return {
    actorId: employeeId,
    actorRole: 'EMPLOYEE',
    objective: {
      _id: objectiveId,
      employeeId,
      title: 'Improve delivery',
      objectiveRowKey: 'row-delivery',
    },
    assignment: {
      _id: assignmentId,
      assessmentTermCode: 'Q1',
    },
    annual: {
      _id: annualId,
      cycleId,
    },
    column: {
      columnId: 'column-supporting-documents',
      bindingKey: 'system.objectiveEvidence',
      label: 'Supporting Documents',
      type: 'OBJECTIVE_EVIDENCE',
      displayOrder: 1,
      fillOwner: 'EMPLOYEE',
      workflowStage: 'EMPLOYEE_ACHIEVEMENT',
    },
    config: config(),
  } as any;
}

function sessionMock() {
  const session = {
    withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
    endSession: jest.fn().mockResolvedValue(undefined),
  };
  jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as never);
  return session;
}

describe('ObjectiveEvidenceService Phase 2', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses employee evidence permissions only for a Manager-role user acting on their own objective', () => {
    const managerEmployeeId = new Types.ObjectId().toString();

    expect(resolveObjectiveEvidenceEditRole({
      actorId: managerEmployeeId,
      actorRole: 'MANAGER',
      employeeId: managerEmployeeId,
    })).toBe('EMPLOYEE');
    expect(resolveObjectiveEvidenceEditRole({
      actorId: managerEmployeeId,
      actorRole: 'MANAGER',
      employeeId: new Types.ObjectId().toString(),
    })).toBeUndefined();
    expect(resolveObjectiveEvidenceEditRole({
      actorId: managerEmployeeId,
      actorRole: 'ADMIN',
      employeeId: managerEmployeeId,
    })).toBeUndefined();
  });

  it('declares one active evidence record per term-specific objective', () => {
    const index = ObjectiveEvidence.schema.indexes().find(
      ([fields, options]) =>
        fields.objectiveId === 1 &&
        fields.evidenceType === 1 &&
        options.name === 'idx_unique_active_objective_term_evidence',
    );
    expect(index?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: {
        isDeleted: false,
        evidenceType: TERM_SUPPORTING_DOCUMENT,
      },
    });
  });

  it('allows a Director to read authorized evidence outside hierarchy without exposing a storage URL in the matrix', async () => {
    const employeeId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const evidenceId = new Types.ObjectId();
    const attachmentId = new Types.ObjectId();
    const documentId = new Types.ObjectId();
    const objectiveId = new Types.ObjectId();
    const annualId = new Types.ObjectId();
    const termId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const templateId = new Types.ObjectId();

    jest.spyOn(ObjectiveEvidence, 'findOne').mockReturnValue(queryResult({
      _id: evidenceId,
      objectiveId,
      annualAssignmentId: annualId,
      termAssignmentId: termId,
      attachmentIds: [attachmentId],
    }));
    jest.spyOn(Objective, 'findOne').mockReturnValue(queryResult({
      _id: objectiveId,
      annualAssignmentId: annualId,
      termAssignmentId: termId,
      employeeId,
      templateVersionId: templateId,
    }));
    jest.spyOn(ObjectiveAttachment, 'findOne').mockReturnValue(queryResult({
      _id: attachmentId,
      objectiveId,
      documentId: documentId.toString(),
      fileName: 'q1-result.pdf',
      fileType: 'application/pdf',
    }));
    jest.spyOn(AnnualAssignment, 'findOne').mockReturnValue(queryResult({
      _id: annualId,
      employeeId,
      assignedManagerId: managerId,
      cycleId,
      templateVersionId: templateId,
    }));
    jest.spyOn(accessService, 'canPerform').mockResolvedValue({
      allowed: false,
      mappedRole: 'DIRECTOR',
      message: 'Directors can access only employee PMS records within their extended hierarchy.',
    });
    jest.spyOn(PmsTemplateVersion, 'findOne').mockReturnValue(queryResult({
      _id: templateId,
      sections: [{
        sectionType: 'OBJECTIVES',
        objectiveConfig: {
          tableLayout: {
            enabled: true,
            columns: [{
              type: 'OBJECTIVE_EVIDENCE',
              bindingKey: 'system.objectiveEvidence',
              access: [{ role: 'DIRECTOR', visible: true, editable: false }],
              evidenceConfig: config(),
            }],
          },
        },
      }],
    }));
    jest.spyOn(PmsDocument, 'findOne').mockReturnValue(queryResult({
      _id: documentId,
      employeeId,
      annualAssignmentId: annualId,
      termAssignmentId: termId,
      fileName: 'q1-result.pdf',
      fileType: 'application/pdf',
      fileUrl: 'https://storage.googleapis.com/pms-test/q1-result.pdf',
    }));

    const result = await new ObjectiveEvidenceService(
      context('DIRECTOR', new Types.ObjectId().toString()),
    ).resolveActiveAttachmentContent(
      evidenceId.toString(),
      attachmentId.toString(),
      'preview',
    );

    expect(result).toEqual({
      fileUrl: 'https://storage.googleapis.com/pms-test/q1-result.pdf',
      fileName: 'q1-result.pdf',
      fileType: 'application/pdf',
    });
  });

  it('uploads the first active term document and writes an audit event', async () => {
    const loaded = resources();
    const documentId = new Types.ObjectId();
    const attachmentId = new Types.ObjectId();
    const evidenceId = new Types.ObjectId();
    const documentService = {
      uploadDocument: jest.fn().mockResolvedValue({
        documentId,
        fileName: 'q1-result.pdf',
        fileUrl: 'https://storage.test/q1-result.pdf',
        uploadedAt: new Date('2026-04-15T10:00:00.000Z'),
      }),
    };
    const service = new ObjectiveEvidenceService(
      context('EMPLOYEE', loaded.actorId.toString()),
      documentService as any,
    );
    jest.spyOn(service as any, 'loadEditableResources').mockResolvedValue(loaded);
    jest.spyOn(ObjectiveEvidence, 'findOne').mockReturnValue(queryResult(null));
    jest.spyOn(ObjectiveAttachment, 'create').mockResolvedValue([{
      _id: attachmentId,
    }] as never);
    jest.spyOn(ObjectiveEvidence, 'create').mockResolvedValue([{
      _id: evidenceId,
    }] as never);
    const audit = jest.spyOn(auditService, 'createAuditLog').mockResolvedValue({} as never);
    const session = sessionMock();

    const result = await service.replaceTermEvidence({
      objectiveId: loaded.objective._id.toString(),
      file: file(),
      expectedEvidenceVersion: 0,
    });

    expect(result).toMatchObject({
      evidenceId: evidenceId.toString(),
      objectiveId: loaded.objective._id.toString(),
      termCode: 'Q1',
      version: 1,
      operation: 'UPLOADED',
      attachment: {
        id: attachmentId.toString(),
        documentId: documentId.toString(),
        fileName: 'q1-result.pdf',
      },
    });
    expect(documentService.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'ObjectiveTermEvidence',
        employeeId: loaded.actorId.toString(),
        termAssignmentId: loaded.assignment._id.toString(),
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PMS_OBJECTIVE_TERM_EVIDENCE_UPLOADED',
      }),
      session,
    );
  });

  it('replaces only the active same-term attachment and retires its document', async () => {
    const loaded = resources();
    const previousAttachmentId = new Types.ObjectId();
    const previousDocumentId = new Types.ObjectId();
    const newDocumentId = new Types.ObjectId();
    const newAttachmentId = new Types.ObjectId();
    const evidenceId = new Types.ObjectId();
    const activeEvidence = {
      _id: evidenceId,
      version: 3,
      attachmentIds: [previousAttachmentId],
    };
    const documentService = {
      uploadDocument: jest.fn().mockResolvedValue({
        documentId: newDocumentId,
        fileName: 'q1-result.pdf',
        fileUrl: 'https://storage.test/new.pdf',
        uploadedAt: new Date(),
      }),
    };
    const service = new ObjectiveEvidenceService(context(), documentService as any);
    jest.spyOn(service as any, 'loadEditableResources').mockResolvedValue(loaded);
    jest.spyOn(ObjectiveEvidence, 'findOne').mockReturnValue(queryResult(activeEvidence));
    jest.spyOn(ObjectiveAttachment, 'create').mockResolvedValue([{
      _id: newAttachmentId,
    }] as never);
    const evidenceUpdate = jest.spyOn(ObjectiveEvidence, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as never);
    jest.spyOn(ObjectiveAttachment, 'find').mockReturnValue({
      session: jest.fn().mockReturnValue(queryResult([{
        _id: previousAttachmentId,
        documentId: previousDocumentId.toString(),
      }])),
    } as never);
    const attachmentUpdate = jest.spyOn(ObjectiveAttachment, 'updateMany')
      .mockResolvedValue({ modifiedCount: 1 } as never);
    const documentUpdate = jest.spyOn(PmsDocument, 'updateMany')
      .mockResolvedValue({ modifiedCount: 1 } as never);
    jest.spyOn(auditService, 'createAuditLog').mockResolvedValue({} as never);
    sessionMock();

    const result = await service.replaceTermEvidence({
      objectiveId: loaded.objective._id.toString(),
      file: file(),
      expectedEvidenceVersion: 3,
    });

    expect(result.operation).toBe('REPLACED');
    expect(result.version).toBe(4);
    expect(evidenceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: evidenceId, version: 3 }),
      expect.objectContaining({
        $set: expect.objectContaining({ attachmentIds: [newAttachmentId] }),
        $inc: { version: 1 },
      }),
      expect.any(Object),
    );
    expect(attachmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: [previousAttachmentId] } }),
      expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) }),
      expect.any(Object),
    );
    expect(documentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: [previousDocumentId] } }),
      { $set: { isDeleted: true } },
      expect.any(Object),
    );
  });

  it('rejects a stale version before uploading a new file', async () => {
    const loaded = resources();
    const documentService = { uploadDocument: jest.fn() };
    const service = new ObjectiveEvidenceService(context(), documentService as any);
    jest.spyOn(service as any, 'loadEditableResources').mockResolvedValue(loaded);
    jest.spyOn(ObjectiveEvidence, 'findOne').mockReturnValue(queryResult({
      _id: new Types.ObjectId(),
      version: 2,
      attachmentIds: [],
    }));

    await expect(service.replaceTermEvidence({
      objectiveId: loaded.objective._id.toString(),
      file: file(),
      expectedEvidenceVersion: 1,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'PMS_OBJECTIVE_EVIDENCE_VERSION_CONFLICT',
    });
    expect(documentService.uploadDocument).not.toHaveBeenCalled();
  });

  it('soft-deletes a newly uploaded document when the atomic switch loses a race', async () => {
    const loaded = resources();
    const oldAttachmentId = new Types.ObjectId();
    const newDocumentId = new Types.ObjectId();
    const service = new ObjectiveEvidenceService(context(), {
      uploadDocument: jest.fn().mockResolvedValue({
        documentId: newDocumentId,
        fileName: 'q1-result.pdf',
        fileUrl: 'https://storage.test/new.pdf',
        uploadedAt: new Date(),
      }),
    } as any);
    jest.spyOn(service as any, 'loadEditableResources').mockResolvedValue(loaded);
    jest.spyOn(ObjectiveEvidence, 'findOne').mockReturnValue(queryResult({
      _id: new Types.ObjectId(),
      version: 1,
      attachmentIds: [oldAttachmentId],
    }));
    jest.spyOn(ObjectiveAttachment, 'create').mockResolvedValue([{
      _id: new Types.ObjectId(),
    }] as never);
    jest.spyOn(ObjectiveEvidence, 'updateOne')
      .mockResolvedValue({ modifiedCount: 0 } as never);
    const cleanup = jest.spyOn(PmsDocument, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as never);
    const retire = jest.spyOn(ObjectiveAttachment, 'updateMany');
    sessionMock();

    await expect(service.replaceTermEvidence({
      objectiveId: loaded.objective._id.toString(),
      file: file(),
      expectedEvidenceVersion: 1,
    })).rejects.toMatchObject({
      code: 'PMS_OBJECTIVE_EVIDENCE_VERSION_CONFLICT',
    });
    expect(cleanup).toHaveBeenCalledWith(
      { _id: newDocumentId },
      { $set: { isDeleted: true } },
    );
    expect(retire).not.toHaveBeenCalled();
  });

  it('soft-deletes the uploaded document when a transaction cannot start', async () => {
    const loaded = resources();
    const newDocumentId = new Types.ObjectId();
    const service = new ObjectiveEvidenceService(context(), {
      uploadDocument: jest.fn().mockResolvedValue({
        documentId: newDocumentId,
        fileName: 'q1-result.pdf',
        fileUrl: 'https://storage.test/new.pdf',
        uploadedAt: new Date(),
      }),
    } as any);
    jest.spyOn(service as any, 'loadEditableResources').mockResolvedValue(loaded);
    jest.spyOn(ObjectiveEvidence, 'findOne').mockReturnValue(queryResult(null));
    jest.spyOn(mongoose, 'startSession').mockRejectedValue(new Error('Mongo unavailable'));
    const cleanup = jest.spyOn(PmsDocument, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as never);

    await expect(service.replaceTermEvidence({
      objectiveId: loaded.objective._id.toString(),
      file: file(),
      expectedEvidenceVersion: 0,
    })).rejects.toThrow('Mongo unavailable');
    expect(cleanup).toHaveBeenCalledWith(
      { _id: newDocumentId },
      { $set: { isDeleted: true } },
    );
  });

  it('removes evidence and retires only its referenced attachment/document', async () => {
    const loaded = resources();
    const evidenceId = new Types.ObjectId();
    const attachmentId = new Types.ObjectId();
    const documentId = new Types.ObjectId();
    const service = new ObjectiveEvidenceService(context(), {} as any);
    jest.spyOn(service as any, 'loadEditableResources').mockResolvedValue(loaded);
    jest.spyOn(ObjectiveEvidence, 'findOne').mockReturnValue(queryResult({
      _id: evidenceId,
      version: 2,
      attachmentIds: [attachmentId],
    }));
    jest.spyOn(ObjectiveEvidence, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as never);
    jest.spyOn(ObjectiveAttachment, 'find').mockReturnValue({
      session: jest.fn().mockReturnValue(queryResult([{
        _id: attachmentId,
        documentId: documentId.toString(),
      }])),
    } as never);
    const attachmentUpdate = jest.spyOn(ObjectiveAttachment, 'updateMany')
      .mockResolvedValue({ modifiedCount: 1 } as never);
    const documentUpdate = jest.spyOn(PmsDocument, 'updateMany')
      .mockResolvedValue({ modifiedCount: 1 } as never);
    const audit = jest.spyOn(auditService, 'createAuditLog').mockResolvedValue({} as never);
    sessionMock();

    const result = await service.removeTermEvidence({
      objectiveId: loaded.objective._id.toString(),
      expectedEvidenceVersion: 2,
    });

    expect(result.removedVersion).toBe(3);
    expect(attachmentUpdate).toHaveBeenCalled();
    expect(documentUpdate).toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PMS_OBJECTIVE_TERM_EVIDENCE_REMOVED' }),
      expect.any(Object),
    );
  });

  it('honors the template remove policy', async () => {
    const loaded = resources();
    loaded.config.allowEmployeeRemove = false;
    const service = new ObjectiveEvidenceService(context(), {} as any);
    jest.spyOn(service as any, 'loadEditableResources').mockResolvedValue(loaded);
    const evidenceLookup = jest.spyOn(ObjectiveEvidence, 'findOne');

    await expect(service.removeTermEvidence({
      objectiveId: loaded.objective._id.toString(),
    })).rejects.toMatchObject({
      statusCode: 403,
      code: 'PMS_OBJECTIVE_EVIDENCE_REMOVE_FORBIDDEN',
    });
    expect(evidenceLookup).not.toHaveBeenCalled();
  });

  it('rejects non-employees, other employees, and closed review periods', async () => {
    const objectiveId = new Types.ObjectId();
    await expect((new ObjectiveEvidenceService(context('ADMIN')) as any)
      .loadEditableResources(objectiveId.toString()))
      .rejects.toMatchObject({ statusCode: 403 });

    const actorId = new Types.ObjectId();
    jest.spyOn(Objective, 'findOne').mockReturnValue(queryResult({
      _id: objectiveId,
      employeeId: new Types.ObjectId(),
    }));
    await expect((new ObjectiveEvidenceService(context('EMPLOYEE', actorId.toString())) as any)
      .loadEditableResources(objectiveId.toString()))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect((new ObjectiveEvidenceService(context('MANAGER', actorId.toString())) as any)
      .loadEditableResources(objectiveId.toString()))
      .rejects.toMatchObject({ statusCode: 403 });
    jest.restoreAllMocks();

    const employeeId = new Types.ObjectId();
    const assignmentId = new Types.ObjectId();
    const annualId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    jest.spyOn(Objective, 'findOne').mockReturnValue(queryResult({
      _id: objectiveId,
      employeeId,
      termAssignmentId: assignmentId,
      annualAssignmentId: annualId,
      cycleId,
      assessmentTermCode: 'Q1',
    }));
    jest.spyOn(TermAssignment, 'findOne').mockReturnValue(queryResult({
      _id: assignmentId,
      annualAssignmentId: annualId,
      employeeId,
      assessmentTermCode: 'Q1',
      termState: 'MANAGER_REVIEW_OPEN',
    }));
    jest.spyOn(AnnualAssignment, 'findOne').mockReturnValue(queryResult({
      _id: annualId,
      employeeId,
      cycleId,
    }));

    await expect((new ObjectiveEvidenceService(context('EMPLOYEE', employeeId.toString())) as any)
      .loadEditableResources(objectiveId.toString()))
      .rejects.toMatchObject({
        statusCode: 409,
        code: 'PMS_OBJECTIVE_EVIDENCE_WINDOW_CLOSED',
      });
  });

  it('restores employee evidence editing for an explicitly reopened term', async () => {
    const employeeId = new Types.ObjectId();
    const objectiveId = new Types.ObjectId();
    const assignmentId = new Types.ObjectId();
    const annualId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const termCycleId = new Types.ObjectId();
    const templateVersionId = new Types.ObjectId();
    jest.spyOn(Objective, 'findOne').mockReturnValue(queryResult({
      _id: objectiveId,
      employeeId,
      termAssignmentId: assignmentId,
      annualAssignmentId: annualId,
      cycleId,
      templateVersionId,
      assessmentTermCode: 'Q1',
    }));
    jest.spyOn(TermAssignment, 'findOne').mockReturnValue(queryResult({
      _id: assignmentId,
      annualAssignmentId: annualId,
      employeeId,
      cycleTermId: termCycleId,
      assessmentTermCode: 'Q1',
      termState: 'REOPENED_BY_ADMIN',
    }));
    jest.spyOn(AnnualAssignment, 'findOne').mockReturnValue(queryResult({
      _id: annualId,
      employeeId,
      cycleId,
      templateVersionId,
    }));
    jest.spyOn(TermCycle, 'findOne').mockReturnValue(queryResult({
      _id: termCycleId,
      objectiveSettingWindow: { startDate: new Date('2026-01-01') },
      managerReviewWindow: { startDate: new Date('2026-04-01') },
    }));
    jest.spyOn(PmsTemplateVersion, 'findOne').mockReturnValue(queryResult({
      _id: templateVersionId,
      sections: [{
        sectionType: 'OBJECTIVES',
        objectiveConfig: {
          tableLayout: {
            enabled: true,
            columns: [{
              columnId: 'column-supporting-documents',
              bindingKey: 'system.objectiveEvidence',
              label: 'Supporting Documents',
              type: 'OBJECTIVE_EVIDENCE',
              displayOrder: 1,
              fillOwner: 'EMPLOYEE',
              workflowStage: 'EMPLOYEE_ACHIEVEMENT',
              access: [{ role: 'EMPLOYEE', visible: true, editable: true }],
              evidenceConfig: config(),
            }],
          },
        },
      }],
    }));

    const loaded = await (new ObjectiveEvidenceService(
      context('EMPLOYEE', employeeId.toString()),
    ) as any).loadEditableResources(objectiveId.toString());

    expect(loaded.assignment.termState).toBe('REOPENED_BY_ADMIN');
    expect(loaded.config.scope).toBe('PER_EMPLOYEE_TERM');
  });

  it('enforces configured MIME type, non-empty file, and size limit', async () => {
    const service = new ObjectiveEvidenceService(context());
    await expect((service as any).validateFile(file('text/plain'), config()))
      .rejects.toMatchObject({ statusCode: 415 });
    await expect((service as any).validateFile(file('application/pdf', Buffer.alloc(0)), config()))
      .rejects.toMatchObject({ code: 'PMS_OBJECTIVE_EVIDENCE_EMPTY_FILE' });
    await expect((service as any).validateFile(
      file('application/pdf', Buffer.alloc(1024 * 1024)),
      config(),
    )).rejects.toMatchObject({ statusCode: 413 });
  });

  it('uses structured errors for evidence failures', () => {
    const error = new ObjectiveEvidenceError('Conflict', 409, 'CONFLICT');
    expect(error).toMatchObject({
      name: 'ObjectiveEvidenceError',
      message: 'Conflict',
      statusCode: 409,
      code: 'CONFLICT',
    });
  });
});
