import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';

export const pmsDashboardRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/trainees',
    { onRequest: [authenticate], schema: { tags: ['PMS Dashboard'], summary: 'Get trainee review dashboard metrics' } },
    async (request, reply) => {
      try {
        const role = normalizePmsRole(request.user.role);
        const rawRole = String(request.user.role || '').trim().toUpperCase();
        const managerScoped = role === PmsRole.MANAGER && rawRole !== 'HR';
        const dashboardRoleAllowed = role === PmsRole.MANAGER || role === PmsRole.ADMIN;
        if (!dashboardRoleAllowed && rawRole !== 'HR') {
          return reply.status(403).send(errorResponse('PMS_ACCESS_DENIED', 'Access Denied: Manager or HR/Admin role required'));
        }
        const result = await request.container!.pmsDashboardService.getTraineeDashboard(
          managerScoped ? request.user._id.toString() : undefined,
        );
        return reply.send(successResponse('Trainee dashboard loaded successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  // GET /pms/dashboard/employee
  fastify.get(
    '/employee',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['PMS Dashboard'],
        summary: 'Get employee-specific PMS dashboard metrics',
        querystring: {
          type: 'object',
          properties: {
            cycleId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const role = normalizePmsRole(request.user.role);
        if (role === PmsRole.MANAGEMENT) {
          return reply.status(403).send(errorResponse('PMS_ACCESS_DENIED', 'Access Denied: Employee dashboard is not available for director/management role'));
        }

        const employeeId = request.user._id.toString();
        const { cycleId } = request.query as { cycleId?: string };
        const result = await request.container!.pmsDashboardService.getEmployeeDashboard(
          employeeId,
          cycleId,
        );
        return reply.send(successResponse('Employee PMS dashboard loaded successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  // GET /pms/dashboard/manager
  fastify.get(
    '/manager',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['PMS Dashboard'],
        summary: 'Get manager-specific PMS dashboard metrics',
        querystring: {
          type: 'object',
          properties: {
            cycleId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const role = normalizePmsRole(request.user.role) ?? request.user.role?.replace(/[ /-]/g, '_').toUpperCase();
        const rawRole = String(request.user.role || '').trim().toUpperCase();
        if (!['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role) && rawRole !== 'HR') {
          return reply.status(403).send(errorResponse('PMS_ACCESS_DENIED', 'Access Denied: Manager role required'));
        }

        const managerId = request.user._id.toString();
        const { cycleId } = request.query as { cycleId?: string };
        const result = await request.container!.pmsDashboardService.getManagerDashboard(
          managerId,
          cycleId,
        );
        return reply.send(successResponse('Manager PMS dashboard loaded successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  // GET /pms/dashboard/admin
  fastify.get(
    '/admin',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['PMS Dashboard'],
        summary: 'Get admin-specific PMS dashboard metrics',
        querystring: {
          type: 'object',
          properties: {
            cycleId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const role = normalizePmsRole(request.user.role) ?? request.user.role?.replace(/[ /-]/g, '_').toUpperCase();
        const rawRole = String(request.user.role || '').trim().toUpperCase();
        if (!['ADMIN', 'SUPER_ADMIN'].includes(role) && rawRole !== 'HR') {
          return reply.status(403).send(errorResponse('PMS_ACCESS_DENIED', 'Access Denied: Admin role required'));
        }

        const { cycleId } = request.query as { cycleId?: string };
        const result = await request.container!.pmsDashboardService.getAdminDashboard(cycleId);
        return reply.send(successResponse('Admin PMS dashboard loaded successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  // GET /pms/dashboard/management
  fastify.get(
    '/management',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['PMS Dashboard'],
        summary: 'Get management-specific PMS dashboard metrics',
        querystring: {
          type: 'object',
          properties: {
            cycleId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const role = normalizePmsRole(request.user.role) ?? request.user.role?.replace(/[ /-]/g, '_').toUpperCase();
        const rawRole = String(request.user.role || '').trim().toUpperCase();
        const hasScopeAccess =
          rawRole !== 'HR' &&
          (request.user.scope === 'EXECUTIVE' || request.user.scope === 'ALL');
        if (!['MANAGEMENT', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(role) && !hasScopeAccess) {
          return reply.status(403).send(errorResponse('PMS_ACCESS_DENIED', 'Access Denied: Management role required'));
        }

        const { cycleId } = request.query as { cycleId?: string };
        const result = await request.container!.pmsDashboardService.getManagementDashboard(cycleId);
        return reply.send(successResponse('Management PMS dashboard loaded successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  reply.log.error({ err: error }, 'Route handler error');
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_DASHBOARD_ERROR', message));
}
