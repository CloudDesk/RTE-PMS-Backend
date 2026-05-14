import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type { CreateCycleInput } from '../services/cycle.service';

export const cycleRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.post(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.cycleService.createCycle(
          request.body as CreateCycleInput,
        );
        return reply.status(201).send(successResponse('PMS cycle created successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_CYCLE_ERROR', message));
}
