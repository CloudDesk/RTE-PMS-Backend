import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import { parseMultipartForm } from '../utilis/parseMultiPartForm';
import type {
  SaveAchievementDraftInput,
  SaveAchievementItemInput,
  SubmitAchievementInput,
  SubmitAchievementItemInput,
} from '../services/employeeAchievementSubmission.service';

const MAX_ACHIEVEMENT_ATTACHMENT_BYTES = 1024 * 1024;
const ACHIEVEMENT_ATTACHMENT_SIZE_MESSAGE =
  'Achievement attachments must be less than 1 MB per file.';

export const employeeAchievementSubmissionRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/attachments/download',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { fileUrl, fileName } = request.query as {
          fileUrl?: string;
          fileName?: string;
        };

        if (!fileUrl) {
          throw new Error('File URL is required');
        }

        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Unable to download attachment. Status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType =
          response.headers.get('content-type') || 'application/octet-stream';
        const safeFileName = (fileName || 'achievement-attachment').replace(/["\r\n]/g, '');

        return reply
          .header('Content-Type', contentType)
          .header('Content-Length', String(buffer.length))
          .header('Content-Disposition', `attachment; filename="${safeFileName}"`)
          .send(buffer);
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:termAssignmentId',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId } = request.params as { termAssignmentId: string };
        const submission = await request.container!.employeeAchievementSubmissionService.getSubmission(
          termAssignmentId,
        );
        return reply.send(
          successResponse('Employee achievement submission fetched successfully', submission),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:termAssignmentId/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId } = request.params as { termAssignmentId: string };
        const submission = await request.container!.employeeAchievementSubmissionService.saveDraft(
          termAssignmentId,
          request.body as SaveAchievementDraftInput,
        );
        return reply.send(
          successResponse('Employee achievement draft saved successfully', submission),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:termAssignmentId/items/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId } = request.params as { termAssignmentId: string };
        const submission = await request.container!.employeeAchievementSubmissionService.saveItemDraft(
          termAssignmentId,
          request.body as SaveAchievementItemInput,
        );
        return reply.send(
          successResponse('Achievement item draft saved successfully', submission),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:termAssignmentId/items/by-item/:itemId/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId, itemId } = request.params as {
          termAssignmentId: string;
          itemId: string;
        };
        const body = (request.body || {}) as SaveAchievementItemInput;
        const submission = await request.container!.employeeAchievementSubmissionService.saveItemDraft(
          termAssignmentId,
          {
            ...body,
            achievementItem: {
              ...(body.achievementItem || {}),
              itemId,
            },
          },
        );
        return reply.send(successResponse('Achievement item draft saved successfully', submission));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:termAssignmentId/items/:objectiveId/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId, objectiveId } = request.params as {
          termAssignmentId: string;
          objectiveId: string;
        };
        const body = (request.body || {}) as SaveAchievementItemInput;
        const submission = await request.container!.employeeAchievementSubmissionService.saveItemDraft(
          termAssignmentId,
          {
            ...body,
            achievementItem: {
              ...(body.achievementItem || {}),
              objectiveId,
            },
          },
        );
        return reply.send(
          successResponse('Objective achievement draft saved successfully', submission),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:termAssignmentId/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId } = request.params as { termAssignmentId: string };
        const submission = await request.container!.employeeAchievementSubmissionService.submit(
          termAssignmentId,
          request.body as SubmitAchievementInput,
        );
        return reply.send(
          successResponse('Employee achievement submitted successfully', submission),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:termAssignmentId/items/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId } = request.params as { termAssignmentId: string };
        const submission = await request.container!.employeeAchievementSubmissionService.submitItem(
          termAssignmentId,
          request.body as SubmitAchievementItemInput,
        );
        return reply.send(
          successResponse('Achievement item submitted successfully', submission),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:termAssignmentId/items/by-item/:itemId/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId, itemId } = request.params as {
          termAssignmentId: string;
          itemId: string;
        };
        const body = (request.body || {}) as SubmitAchievementItemInput;
        const submission = await request.container!.employeeAchievementSubmissionService.submitItem(
          termAssignmentId,
          {
            ...body,
            achievementItem: {
              ...(body.achievementItem || {}),
              itemId,
            },
          },
        );
        return reply.send(successResponse('Achievement item submitted successfully', submission));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:termAssignmentId/items/:objectiveId/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId, objectiveId } = request.params as {
          termAssignmentId: string;
          objectiveId: string;
        };
        const body = (request.body || {}) as SubmitAchievementItemInput;
        const submission = await request.container!.employeeAchievementSubmissionService.submitItem(
          termAssignmentId,
          {
            ...body,
            achievementItem: {
              ...(body.achievementItem || {}),
              objectiveId,
            },
          },
        );
        return reply.send(
          successResponse('Objective achievement submitted successfully', submission),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:termAssignmentId/attachments',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId } = request.params as { termAssignmentId: string };
        const { files } = await parseMultipartForm(request);

        if (!files || files.length === 0) {
          throw new Error('No attachment file uploaded');
        }

        const oversizedFile = files.find((file) => {
          const cachedBuffer = (file as any).__cachedBuffer as Buffer | undefined;
          return (cachedBuffer?.length ?? 0) >= MAX_ACHIEVEMENT_ATTACHMENT_BYTES;
        });

        if (oversizedFile) {
          throw new Error(ACHIEVEMENT_ATTACHMENT_SIZE_MESSAGE);
        }

        const attachment = await request.container!.employeeAchievementSubmissionService.uploadAttachment(
          termAssignmentId,
          files[0],
        );
        return reply.send(
          successResponse('Employee achievement attachment uploaded successfully', attachment),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  if (/less than 1 MB|file too large/i.test(message)) {
    return reply.status(413).send(errorResponse('PMS_EMPLOYEE_ACHIEVEMENT_ERROR', ACHIEVEMENT_ATTACHMENT_SIZE_MESSAGE));
  }
  return reply.status(400).send(errorResponse('PMS_EMPLOYEE_ACHIEVEMENT_ERROR', message));
}
