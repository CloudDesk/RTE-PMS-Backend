import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type { AssignEmployeeInput } from '../services/assignment.service';

export const assignmentRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.post(
    '/:id/assign',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.assignmentService.assignEmployee(
          id,
          request.body as AssignEmployeeInput,
        );
        return reply.status(201).send(successResponse('Employee assigned to PMS cycle successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_ASSIGNMENT_ERROR', message));
}
