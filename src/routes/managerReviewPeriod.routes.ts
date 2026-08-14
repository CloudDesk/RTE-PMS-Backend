import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  ManagerReviewPeriodWorkspaceMode,
  SaveManagerReviewPeriodDraftInput,
  SubmitManagerReviewPeriodInput,
} from '../services/managerReviewPeriod.service';

export const managerReviewPeriodRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/assignments',
    { onRequest: [authenticate], schema: { tags: ['PMS Grouped Manager Reviews'] } },
    async (request, reply) => {
      try {
        const { mode = 'manager' } = request.query as { mode?: ManagerReviewPeriodWorkspaceMode };
        const result = await request.container!.managerReviewPeriodService.listAssignments(mode);
        return reply.send(successResponse('Grouped manager review assignments fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/assignments/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Grouped Manager Reviews'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.managerReviewPeriodService.getAssignment(id);
        return reply.send(successResponse('Grouped manager review assignment fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Grouped Manager Reviews'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.managerReviewPeriodService.saveDraft(
          id,
          request.body as SaveManagerReviewPeriodDraftInput,
        );
        return reply.send(successResponse('Grouped manager review draft saved successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Grouped Manager Reviews'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.managerReviewPeriodService.submitReview(
          id,
          request.body as SubmitManagerReviewPeriodInput,
        );
        return reply.send(successResponse('Grouped manager review submitted successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  reply.log.error({ err: error }, 'Route handler error');
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_GROUPED_MANAGER_REVIEW_ERROR', message));
}
