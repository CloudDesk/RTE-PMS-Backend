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

  fastify.post(
    '/:id/launch',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const cycle = await request.container!.cycleService.launchCycle(id);
        return reply.send(successResponse('PMS cycle launched successfully', cycle));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/close',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const cycle = await request.container!.cycleService.closeCycle(id);
        return reply.send(successResponse('PMS cycle closed successfully', cycle));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/archive',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const cycle = await request.container!.cycleService.archiveCycle(id);
        return reply.send(successResponse('PMS cycle archived successfully', cycle));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/cancel',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const cycle = await request.container!.cycleService.cancelCycle(id);
        return reply.send(successResponse('PMS cycle cancelled successfully', cycle));
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
