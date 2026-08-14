import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  CancelCycleInput,
  CreateCycleInput,
  CycleListQuery,
  UpdateCycleInput,
  TermCycleInput,
} from '../services/cycle.service';
import type { WorkflowSyncInput } from '../services/workflow-sync.service';

export const cycleRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.cycleService.listCycles(
          request.query as CycleListQuery,
        );
        return reply.send(successResponse('PMS cycles fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

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

  fastify.get(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.cycleService.getCycleDetail(id);
        return reply.send(successResponse('PMS cycle fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id/history',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.cycleService.getCycleAuditHistory(id);
        return reply.send(successResponse('PMS cycle audit history fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.cycleService.updateCycle(
          id,
          request.body as UpdateCycleInput,
        );
        return reply.send(successResponse('PMS cycle updated successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.patch(
    '/:id/windows',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as { quarters?: TermCycleInput[] } | TermCycleInput[];
        const quarters = Array.isArray(body) ? body : body.quarters;
        const result = await request.container!.cycleService.updateWindows(
          id,
          quarters ?? [],
        );
        return reply.send(successResponse('PMS cycle windows updated successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.patch(
    '/:id/communication',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = (request.body ?? {}) as
          | { config?: Record<string, unknown> }
          | Record<string, unknown>;
        const config: Record<string, unknown> =
          'config' in body && body.config
            ? (body.config as Record<string, unknown>)
            : (body as Record<string, unknown>);
        const result = await request.container!.cycleService.updateCommunication(
          id,
          config,
        );
        return reply.send(successResponse('PMS cycle communication config updated successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.patch(
    '/:id/appraisal-window',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = (request.body ?? {}) as
          | { config?: Record<string, unknown> }
          | Record<string, unknown>;
        const config: Record<string, unknown> =
          'config' in body && body.config
            ? (body.config as Record<string, unknown>)
            : (body as Record<string, unknown>);
        const result = await request.container!.cycleService.updateAppraisalWindow(
          id,
          config,
        );
        return reply.send(successResponse('PMS cycle appraisal window updated successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/schedule',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const cycle = await request.container!.cycleService.scheduleCycle(id);
        return reply.send(successResponse('PMS cycle scheduled successfully', cycle));
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
        const cycle = await request.container!.cycleService.closeCycle(
          id,
          request.body as { reason: string }
        );
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
        const cycle = await request.container!.cycleService.archiveCycle(
          id,
          request.body as { reason: string }
        );
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
        const cycle = await request.container!.cycleService.cancelCycle(
          id,
          request.body as CancelCycleInput,
        );
        return reply.send(successResponse('PMS cycle cancelled successfully', cycle));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/workflow-sync',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.workflowSyncService.syncWorkflowStates(
          id,
          request.body as WorkflowSyncInput,
        );
        return reply.send(successResponse('PMS workflow states synced successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/sync-progression',
    { onRequest: [authenticate], schema: { tags: ['PMS Cycle Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const cycle = await request.container!.cycleService.syncCycleProgression(id);
        return reply.send(successResponse('PMS cycle progression synced successfully', cycle));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  reply.log.error({ err: error }, 'Route handler error');
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_CYCLE_ERROR', message));
}
