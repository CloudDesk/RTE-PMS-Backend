import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  ApproveProbationReviewInput,
  CancelProbationReviewInput,
  CreateProbationReviewInput,
  ProbationReviewListQuery,
  ReturnProbationReviewInput,
  SaveProbationReviewValuesInput,
} from '../services/probationReview.service';

export const probationReviewRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Probation Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.probationReviewService.listAssignments(
          request.query as ProbationReviewListQuery,
        );
        return reply.send(successResponse('Probation review assignments fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Probation Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.probationReviewService.createAssignment(
          request.body as CreateProbationReviewInput,
        );
        return reply.status(201).send(successResponse('Probation review assignment created successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:assignmentId',
    { onRequest: [authenticate], schema: { tags: ['PMS Probation Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.getAssignment(assignmentId);
        return reply.send(successResponse('Probation review assignment fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/open',
    { onRequest: [authenticate], schema: { tags: ['PMS Probation Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.openAssignment(assignmentId);
        return reply.send(successResponse('Probation review opened successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:assignmentId/manager-1/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Probation Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.saveManager1Draft(
          assignmentId,
          request.body as SaveProbationReviewValuesInput,
        );
        return reply.send(successResponse('Probation review draft saved successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/manager-1/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Probation Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.submitManager1(
          assignmentId,
          request.body as SaveProbationReviewValuesInput,
        );
        return reply.send(successResponse('Probation review submitted to Manager 2 successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/manager-2/approve',
    { onRequest: [authenticate], schema: { tags: ['PMS Probation Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.approveByManager2(
          assignmentId,
          request.body as ApproveProbationReviewInput,
        );
        return reply.send(successResponse('Probation review finalized successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/manager-2/return',
    { onRequest: [authenticate], schema: { tags: ['PMS Probation Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.returnToManager1(
          assignmentId,
          request.body as ReturnProbationReviewInput,
        );
        return reply.send(successResponse('Probation review returned to Manager 1 successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/cancel',
    { onRequest: [authenticate], schema: { tags: ['PMS Probation Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.cancelAssignment(
          assignmentId,
          request.body as CancelProbationReviewInput,
        );
        return reply.send(successResponse('Probation review cancelled successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_PROBATION_REVIEW_ERROR', message));
}
