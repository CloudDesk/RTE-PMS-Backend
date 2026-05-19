import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';

export const pmsBulkOperationsRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Middleware to ensure user is ADMIN
  const ensureAdmin = async (request: any, reply: FastifyReply) => {
    const role = request.user?.role?.toLowerCase();
    if (role !== 'admin') {
      return reply.status(403).send(errorResponse('PMS_ACCESS_DENIED', 'Access Denied: Administrative role required'));
    }
  };

  // POST /pms/bulk/assignments/preview
  fastify.post(
    '/assignments/preview',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, assignments } = request.body as {
          cycleId: string;
          assignments: any[];
        };
        const result = await request.container!.pmsBulkOperationsService.previewBulkAssignment(
          cycleId,
          assignments
        );
        return reply.send(successResponse('Bulk assignment preview completed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // POST /pms/bulk/assignments/execute
  fastify.post(
    '/assignments/execute',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, assignments } = request.body as {
          cycleId: string;
          assignments: any[];
        };
        const result = await request.container!.pmsBulkOperationsService.executeBulkAssignment(
          cycleId,
          assignments
        );
        return reply.send(successResponse('Bulk assignment execution completed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // POST /pms/bulk/reminders/preview
  fastify.post(
    '/reminders/preview',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, targetType } = request.body as {
          cycleId: string;
          targetType: 'OBJECTIVES' | 'REVIEWS';
        };
        const result = await request.container!.pmsBulkOperationsService.previewBulkReminder(
          cycleId,
          targetType
        );
        return reply.send(successResponse('Bulk reminder preview completed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // POST /pms/bulk/reminders/execute
  fastify.post(
    '/reminders/execute',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, targetType, subject, message } = request.body as {
          cycleId: string;
          targetType: 'OBJECTIVES' | 'REVIEWS';
          subject: string;
          message: string;
        };
        const result = await request.container!.pmsBulkOperationsService.executeBulkReminder(
          cycleId,
          targetType,
          subject,
          message
        );
        return reply.send(successResponse('Bulk reminders dispatched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // POST /pms/bulk/visibility/preview
  fastify.post(
    '/visibility/preview',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, employeeIds, visibilityUpdate } = request.body as {
          cycleId: string;
          employeeIds: string[];
          visibilityUpdate: any;
        };
        const result = await request.container!.pmsBulkOperationsService.previewBulkVisibility(
          cycleId,
          employeeIds,
          visibilityUpdate
        );
        return reply.send(successResponse('Bulk visibility updates previewed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // POST /pms/bulk/visibility/execute
  fastify.post(
    '/visibility/execute',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, employeeIds, visibilityUpdate } = request.body as {
          cycleId: string;
          employeeIds: string[];
          visibilityUpdate: any;
        };
        const result = await request.container!.pmsBulkOperationsService.executeBulkVisibility(
          cycleId,
          employeeIds,
          visibilityUpdate
        );
        return reply.send(successResponse('Bulk visibility updates executed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // POST /pms/bulk/communications/preview
  fastify.post(
    '/communications/preview',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, employeeIds } = request.body as {
          cycleId: string;
          employeeIds: string[];
        };
        const result = await request.container!.pmsBulkOperationsService.previewBulkCommunication(
          cycleId,
          employeeIds
        );
        return reply.send(successResponse('Bulk communications previewed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // POST /pms/bulk/communications/execute
  fastify.post(
    '/communications/execute',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, employeeIds } = request.body as {
          cycleId: string;
          employeeIds: string[];
        };
        const result = await request.container!.pmsBulkOperationsService.executeBulkCommunication(
          cycleId,
          employeeIds
        );
        return reply.send(successResponse('Bulk communications dispatched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // POST /pms/bulk/close/preview
  fastify.post(
    '/close/preview',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, employeeIds } = request.body as {
          cycleId: string;
          employeeIds: string[];
        };
        const result = await request.container!.pmsBulkOperationsService.previewBulkClose(
          cycleId,
          employeeIds
        );
        return reply.send(successResponse('Bulk administrative closure preview completed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // POST /pms/bulk/close/execute
  fastify.post(
    '/close/execute',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { cycleId, employeeIds, reason } = request.body as {
          cycleId: string;
          employeeIds: string[];
          reason: string;
        };
        const result = await request.container!.pmsBulkOperationsService.executeBulkClose(
          cycleId,
          employeeIds,
          reason
        );
        return reply.send(successResponse('Bulk administrative closure executed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // GET /pms/bulk/jobs
  fastify.get(
    '/jobs',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const query = request.query as { cycleId?: string; status?: string };
        const result = await request.container!.pmsBulkOperationsService.listBulkJobs(query);
        return reply.send(successResponse('Bulk operation jobs retrieved successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );

  // GET /pms/bulk/jobs/:id
  fastify.get(
    '/jobs/:id',
    {
      onRequest: [authenticate, ensureAdmin],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.pmsBulkOperationsService.getBulkJobDetail(id);
        return reply.send(successResponse('Bulk operation job details retrieved successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    }
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected bulk operations error';
  return reply.status(400).send(errorResponse('PMS_BULK_ERROR', message));
}
