import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import { parseMultipartForm } from '../utilis/parseMultiPartForm';
import type {
  SaveAchievementDraftInput,
  SubmitAchievementInput,
} from '../services/employeeAchievementSubmission.service';

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
    '/:quarterAssignmentId',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { quarterAssignmentId } = request.params as { quarterAssignmentId: string };
        const submission = await request.container!.employeeAchievementSubmissionService.getSubmission(
          quarterAssignmentId,
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
    '/:quarterAssignmentId/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { quarterAssignmentId } = request.params as { quarterAssignmentId: string };
        const submission = await request.container!.employeeAchievementSubmissionService.saveDraft(
          quarterAssignmentId,
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

  fastify.post(
    '/:quarterAssignmentId/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { quarterAssignmentId } = request.params as { quarterAssignmentId: string };
        const submission = await request.container!.employeeAchievementSubmissionService.submit(
          quarterAssignmentId,
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
    '/:quarterAssignmentId/attachments',
    { onRequest: [authenticate], schema: { tags: ['PMS Employee Achievement Submission'] } },
    async (request, reply) => {
      try {
        const { quarterAssignmentId } = request.params as { quarterAssignmentId: string };
        const { files } = await parseMultipartForm(request);

        if (!files || files.length === 0) {
          throw new Error('No attachment file uploaded');
        }

        const attachment = await request.container!.employeeAchievementSubmissionService.uploadAttachment(
          quarterAssignmentId,
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
  return reply.status(400).send(errorResponse('PMS_EMPLOYEE_ACHIEVEMENT_ERROR', message));
}
