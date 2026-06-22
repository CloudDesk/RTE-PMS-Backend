import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type { ManagementEmployeeListQuery } from '../services/pmsManagementEmployee.service';

export const pmsManagementEmployeeRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/employees',
    { onRequest: [authenticate], schema: { tags: ['PMS Management Employees'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.pmsManagementEmployeeService.listEmployees(
          request.query as ManagementEmployeeListQuery,
        );

        return reply.send({
          success: true,
          message: 'Management employees fetched successfully',
          data: result.employees,
          meta: result.meta,
        });
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/employees/:employeeId/performance',
    { onRequest: [authenticate], schema: { tags: ['PMS Management Employees'] } },
    async (request, reply) => {
      try {
        const { employeeId } = request.params as { employeeId: string };
        const result = await request.container!.pmsManagementEmployeeService.getEmployeePerformance(
          employeeId,
        );

        return reply.send(
          successResponse('Management employee performance fetched successfully', result),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_MANAGEMENT_EMPLOYEE_ERROR', message));
}
