import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type { SimulateTemplateAccessInput } from '../services/pms-template.service';
import { accessService } from '../services/access.service';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';

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

  /**
   * POST /api/pms/access/reload-permissions
   * Forces the in-memory permission cache to reload from the DB immediately.
   * Admin-only. Useful after creating/updating PmsRolePermission records.
   */
  fastify.post(
    '/reload-permissions',
    { onRequest: [authenticate], schema: { tags: ['PMS Access Control'] } },
    async (request, reply) => {
      try {
        const user = (request as any).user;
        const role = normalizePmsRole(user?.role ?? '');
        if (role !== PmsRole.ADMIN) {
          return reply.status(403).send(errorResponse('FORBIDDEN', 'Only Admins can reload PMS permissions.'));
        }
        await accessService.reloadPermissions();
        return reply.send(
          successResponse('PMS permissions reloaded successfully.', {
            cacheAgeMs: accessService.cacheAge(),
          }),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  /**
   * GET /api/pms/access/permission-cache-status
   * Returns the age of the current in-memory permission cache.
   * Admin-only.
   */
  fastify.get(
    '/permission-cache-status',
    { onRequest: [authenticate], schema: { tags: ['PMS Access Control'] } },
    async (request, reply) => {
      try {
        const user = (request as any).user;
        const role = normalizePmsRole(user?.role ?? '');
        if (role !== PmsRole.ADMIN) {
          return reply.status(403).send(errorResponse('FORBIDDEN', 'Only Admins can view permission cache status.'));
        }
        return reply.send(
          successResponse('PMS permission cache status', {
            cacheAgeMs: accessService.cacheAge(),
            cacheTtlMs: parseInt(process.env.PMS_PERMISSION_CACHE_TTL_MS ?? '300000', 10),
          }),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  reply.log.error({ err: error }, 'Route handler error');
  const message = error instanceof Error ? error.message : 'Request failed';
  return reply.status(400).send(errorResponse('PMS_ACCESS_FAILED', message));
}

