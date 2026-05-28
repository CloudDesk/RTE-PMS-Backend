import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import { PmsRolePermission } from '../models/pms-role-permission.model';
import { accessService } from '../services/access.service';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';

export const pmsRolePermissionRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  
  // List all permissions
  fastify.get(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Role Permissions'] } },
    async (_request, reply) => {
      try {
        const permissions = await PmsRolePermission.find().sort({ priority: -1 }).lean();
        return reply.send(successResponse('Permissions fetched successfully', permissions));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  // Create a new permission
  fastify.post(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Role Permissions'] } },
    async (request, reply) => {
      try {
        const user = (request as any).user;
        const actorRole = normalizePmsRole(user?.role ?? '');
        if (actorRole !== PmsRole.ADMIN) {
          return reply.status(403).send(errorResponse('FORBIDDEN', 'Only Admins can manage permissions.'));
        }

        const data = request.body as any;
        data.role = normalizePmsRole(data.role); // Standardize the role string
        const newPermission = await PmsRolePermission.create(data);
        
        // Reload access engine
        await accessService.reloadPermissions();
        
        return reply.send(successResponse('Permission created successfully', newPermission));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  // Update an existing permission
  fastify.put(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Role Permissions'] } },
    async (request, reply) => {
      try {
        const user = (request as any).user;
        const actorRole = normalizePmsRole(user?.role ?? '');
        if (actorRole !== PmsRole.ADMIN) {
          return reply.status(403).send(errorResponse('FORBIDDEN', 'Only Admins can manage permissions.'));
        }

        const { id } = request.params as { id: string };
        const data = request.body as any;
        if (data.role) data.role = normalizePmsRole(data.role);

        const updated = await PmsRolePermission.findByIdAndUpdate(id, data, { new: true });
        if (!updated) {
          return reply.status(404).send(errorResponse('NOT_FOUND', 'Permission not found'));
        }

        // Reload access engine
        await accessService.reloadPermissions();

        return reply.send(successResponse('Permission updated successfully', updated));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Request failed';
  return reply.status(400).send(errorResponse('PMS_ROLE_PERMISSION_FAILED', message));
}
