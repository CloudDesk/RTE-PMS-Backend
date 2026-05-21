import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type { SimulateTemplateAccessInput } from '../services/pms-template.service';

export const pmsAccessRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.post(
    '/simulate',
    { onRequest: [authenticate], schema: { tags: ['PMS Access Control'] } },
    async (request, reply) => {
      try {
        const resolved = await request.container!.pmsTemplateService.simulateTemplateAccess(
          request.body as SimulateTemplateAccessInput,
        );
        return reply.send(successResponse('PMS access simulation completed successfully', resolved));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Request failed';
  return reply.status(400).send(errorResponse('PMS_ACCESS_SIMULATION_FAILED', message));
}
