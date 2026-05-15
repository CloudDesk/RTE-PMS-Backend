import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  ReopenQuarterAssignmentInput,
  SubmitQuarterReviewInput,
} from '../services/quarterReview.service';

export const quarterReviewRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.post(
    '/:id/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Quarterly Review'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.quarterReviewService.submitQuarterReview(
          id,
          request.body as SubmitQuarterReviewInput,
        );
        return reply.send(successResponse('Quarter review submitted successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/finalize',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Quarterly Review'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.quarterReviewService.finalizeQuarterAssignment(id);
        return reply.send(successResponse('Quarter review finalized successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/reopen',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Quarterly Review'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.quarterReviewService.reopenQuarterAssignment(
          id,
          request.body as ReopenQuarterAssignmentInput,
        );
        return reply.send(successResponse('Quarter review reopened successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_QUARTER_REVIEW_ERROR', message));
}
