import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type { CreateDelegationInput } from '../services/delegation.service';

export const delegationRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Create a delegation config
  fastify.post(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Delegation Management'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.delegationService.createDelegation(
          request.body as CreateDelegationInput,
        );
        return reply.status(201).send(successResponse('PMS delegation configured successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  // List delegations
  fastify.get(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Delegation Management'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.delegationService.listDelegations(
          request.query as {
            delegatorUserId?: string;
            delegateUserId?: string;
            status?: string;
            annualAssignmentId?: string;
            cycleId?: string;
            scopeType?: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS';
            activeOn?: string;
          },
        );
        return reply.send(successResponse('PMS delegations fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  // Revoke/Deactivate a delegation
  fastify.post(
    '/:id/revoke',
    { onRequest: [authenticate], schema: { tags: ['PMS Delegation Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { reason } = (request.body as { reason?: string }) ?? {};
        const result = await request.container!.delegationService.revokeDelegation(id, reason);
        return reply.send(successResponse('PMS delegation revoked successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  reply.log.error({ err: error }, 'Route handler error');
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_DELEGATION_ERROR', message));
}
