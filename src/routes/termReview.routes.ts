import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  ReopenTermAssignmentInput,
  SaveTermReviewDraftInput,
  SubmitTermReviewInput,
  TermReviewWorkspaceMode,
} from '../services/termReview.service';

export const termReviewRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/assignments',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Quarterly Review'] } },
    async (request, reply) => {
      try {
        const { mode = 'manager' } = request.query as { mode?: TermReviewWorkspaceMode };
        const result = await request.container!.termReviewService.listAssignments(mode);
        return reply.send(successResponse('Quarter review assignments fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/assignments/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Quarterly Review'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.termReviewService.getAssignment(id);
        return reply.send(successResponse('Quarter review assignment fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Quarterly Review'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.termReviewService.saveTermReviewDraft(
          id,
          request.body as SaveTermReviewDraftInput,
        );
        return reply.send(successResponse('Quarter review draft saved successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Quarterly Review'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.termReviewService.submitTermReview(
          id,
          request.body as SubmitTermReviewInput,
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
        const result = await request.container!.termReviewService.finalizeTermAssignment(id);
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
        const result = await request.container!.termReviewService.reopenTermAssignment(
          id,
          request.body as ReopenTermAssignmentInput,
        );
        return reply.send(successResponse('Quarter review reopened successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  reply.log.error({ err: error }, 'Route handler error');
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_QUARTER_REVIEW_ERROR', message));
}
