import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { authenticate } from '../middleware/auth';
import { Objective } from '../models/pms-objective.model';
import { PmsDocument } from '../models/pms-document.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import { parseMultipartForm } from '../utilis/parseMultiPartForm';
import type {
  AddObjectiveCommentInput,
  BulkCreateManagerObjectiveInput,
  CloseObjectiveSettingInput,
  CreateObjectiveInput,
  CorrectObjectiveInput,
  ReturnObjectiveInput,
  SaveManagerObjectiveLibraryInput,
  UpdateObjectiveInput,
} from '../services/objective.service';

const MAX_OBJECTIVE_ATTACHMENT_BYTES = 1024 * 1024;

export const objectiveRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.post(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const payload = await resolveObjectivePayloadWithAttachments(request);
        const objective = await request.container!.objectiveService.createObjective(
          payload as unknown as CreateObjectiveInput,
        );
        return reply.status(201).send(successResponse('Objective created successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/bulk-manager',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.objectiveService.bulkCreateManagerObjectives(
          request.body as BulkCreateManagerObjectiveInput,
        );
        return reply.status(201).send(successResponse('Manager objectives assigned successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/manager-library',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const objectives = await request.container!.objectiveService.listManagerObjectiveLibrary();
        return reply.send(successResponse('Manager objective library fetched successfully', objectives));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/manager-library',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const objectives = await request.container!.objectiveService.saveManagerObjectiveLibrary(
          request.body as SaveManagerObjectiveLibraryInput,
        );
        return reply.send(successResponse('Manager objective library saved successfully', objectives));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/assignments',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { mode = 'employee' } = request.query as { mode?: 'employee' | 'manager' };
        const assignments = await request.container!.objectiveService.listAssignments(mode);
        return reply.send(successResponse('Objective assignments fetched successfully', assignments));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignments/:termAssignmentId/close-objective-setting',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId } = request.params as { termAssignmentId: string };
        const termAssignment = await request.container!.objectiveService.closeObjectiveSetting(
          termAssignmentId,
          request.body as CloseObjectiveSettingInput,
        );
        return reply.send(successResponse('Objective setting closed successfully', termAssignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.getObjectiveDetail(id);
        return reply.send(successResponse('Objective fetched successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const payload = await resolveObjectivePayloadWithAttachments(request, id);
        const objective = await request.container!.objectiveService.updateObjective(
          id,
          payload as unknown as UpdateObjectiveInput,
        );
        return reply.send(successResponse('Objective updated successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.delete(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.objectiveService.deleteDraftObjective(id);
        return reply.send(successResponse('Draft objective deleted successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.submitObjective(id);
        return reply.send(successResponse('Objective submitted successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/approve',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.approveObjective(
          id,
          request.body as { weightage?: number },
        );
        return reply.send(successResponse('Objective approved successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/return',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.returnObjective(
          id,
          request.body as ReturnObjectiveInput,
        );
        return reply.send(successResponse('Objective returned for revision successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/comments',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const comment = await request.container!.objectiveService.addComment(
          id,
          request.body as AddObjectiveCommentInput,
        );
        return reply.status(201).send(successResponse('Objective comment added successfully', comment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/correction',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.correctObjective(
          id,
          request.body as CorrectObjectiveInput,
        );
        return reply.send(successResponse('Objective corrected successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function isMultipartRequest(request: FastifyRequest) {
  const contentType = String(request.headers['content-type'] || '');
  return contentType.toLowerCase().includes('multipart/form-data');
}

function parseObjectivePayloadField(rawPayload: unknown) {
  if (!rawPayload) {
    return {};
  }

  if (typeof rawPayload === 'object') {
    return rawPayload as Record<string, unknown>;
  }

  if (typeof rawPayload !== 'string') {
    throw new Error('Invalid objective payload');
  }

  try {
    return JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid objectivePayload JSON');
  }
}

async function resolveObjectivePayloadWithAttachments(
  request: FastifyRequest,
  objectiveId?: string,
) {
  if (!isMultipartRequest(request)) {
    return request.body as Record<string, unknown>;
  }

  const uploadedDocumentIds: Types.ObjectId[] = [];

  try {
    const { body, files } = await parseMultipartForm(request);
    const payload = parseObjectivePayloadField(
      body.objectivePayload ?? body.payload ?? body.objective,
    );

    if (!files.length) {
      return payload;
    }

    const oversizedFile = files.find((file) => {
      const cachedBuffer = (file as any).__cachedBuffer as Buffer | undefined;
      return (cachedBuffer?.length ?? 0) >= MAX_OBJECTIVE_ATTACHMENT_BYTES;
    });

    if (oversizedFile) {
      throw new Error('Objective attachments must be less than 1 MB per file.');
    }

    const termAssignment = await resolveTermAssignmentForObjectivePayload(payload, objectiveId);
    const termLabel = termAssignment.termLabel || termAssignment.termCode || termAssignment.assessmentTermCode;
    const documentName = `${String(payload.title || 'PMS Objective').trim() || 'PMS Objective'} - ${termLabel}`;

    const uploadedAttachments = [];
    for (const file of files) {
      const uploaded = await request.container!.pmsDocumentService.uploadDocument({
        employeeId: termAssignment.employeeId.toString(),
        cycleId: termAssignment.cycleId?.toString(),
        annualAssignmentId: termAssignment.annualAssignmentId.toString(),
        termAssignmentId: termAssignment._id.toString(),
        documentType: 'ObjectiveAttachment',
        documentName,
        documentDate: new Date(),
        description: `PMS objective attachment for ${documentName}`,
        file,
      });

      if (uploaded.documentId && Types.ObjectId.isValid(uploaded.documentId)) {
        uploadedDocumentIds.push(new Types.ObjectId(uploaded.documentId));
      }

      uploadedAttachments.push({
        documentId: uploaded.documentId?.toString?.() ?? String(uploaded.documentId || ''),
        fileName: uploaded.fileName,
        fileUrl: uploaded.fileUrl,
        fileType: file.mimetype,
        fileSize: (file as any).__cachedBuffer?.length,
        uploadedAt: uploaded.uploadedAt,
      });
    }

    return {
      ...payload,
      attachments: [
        ...((Array.isArray(payload.attachments) ? payload.attachments : []) as unknown[]),
        ...uploadedAttachments,
      ],
    };
  } catch (error) {
    if (uploadedDocumentIds.length > 0) {
      await PmsDocument.updateMany(
        { _id: { $in: uploadedDocumentIds } },
        { $set: { isDeleted: true } },
      ).catch(() => undefined);
    }
    throw error;
  }
}

async function resolveTermAssignmentForObjectivePayload(
  payload: Record<string, unknown>,
  objectiveId?: string,
) {
  let termAssignmentId = typeof payload.termAssignmentId === 'string'
    ? payload.termAssignmentId
    : '';

  if (!termAssignmentId && objectiveId) {
    const objective = await Objective.findById(objectiveId).select('termAssignmentId').lean();
    termAssignmentId = objective?.termAssignmentId?.toString?.() || '';
  }

  if (!termAssignmentId || !Types.ObjectId.isValid(termAssignmentId)) {
    throw new Error('Valid termAssignmentId is required for objective attachments');
  }

  const termAssignment = await TermAssignment.findById(termAssignmentId).lean();
  if (!termAssignment || termAssignment.isDeleted) {
    throw new Error('Quarter assignment not found for objective attachments');
  }

  return termAssignment;
}

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  if (/file too large|less than 1 MB/i.test(message)) {
    return reply.status(413).send(errorResponse('PMS_OBJECTIVE_ERROR', 'Objective attachments must be less than 1 MB per file.'));
  }
  return reply.status(400).send(errorResponse('PMS_OBJECTIVE_ERROR', message));
}
