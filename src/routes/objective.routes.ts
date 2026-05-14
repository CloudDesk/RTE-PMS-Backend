import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  CreateObjectiveInput,
  ReturnObjectiveInput,
} from '../services/objective.service';

export const objectiveRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.post(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const objective = await request.container!.objectiveService.createObjective(
          request.body as CreateObjectiveInput,
        );
        return reply.status(201).send(successResponse('Objective created successfully', objective));
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
        const objective = await request.container!.objectiveService.approveObjective(id);
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
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_OBJECTIVE_ERROR', message));
}
