import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  AssignEmployeeInput,
  AssignmentListQuery,
  AssignmentStateInput,
  BulkAssignInput,
  CancelReassignmentInput,
  ReassignManagerInput,
  ResolveExceptionInput,
} from '../services/assignment.service';

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

  fastify.get(
    '/:id/assignments',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.assignmentService.listAssignments(
          id,
          request.query as AssignmentListQuery,
        );
        return reply.send(successResponse('PMS assignments fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/assignments/bulk',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.assignmentService.bulkAssign(
          id,
          request.body as BulkAssignInput,
        );
        return reply.status(201).send(successResponse('PMS bulk assignment processed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id/assignment-exceptions',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { status } = request.query as { status?: string };
        const result = await request.container!.assignmentService.listExceptions(
          id,
          status ?? 'OPEN',
        );
        return reply.send(successResponse('PMS assignment exceptions fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id/reassignments',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.assignmentService.listReassignments(
          id,
          request.query as { employeeId?: string; managerId?: string; assignmentId?: string },
        );
        return reply.send(successResponse('PMS reassignment history fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:cycleId/assignments/:assignmentId',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { cycleId: string; assignmentId: string };
        const result = await request.container!.assignmentService.getAssignment(assignmentId);
        return reply.send(successResponse('PMS assignment fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:cycleId/assignments/:assignmentId/reassign',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { cycleId: string; assignmentId: string };
        const result = await request.container!.assignmentService.reassignManager(
          assignmentId,
          request.body as ReassignManagerInput,
        );
        return reply.send(successResponse('PMS assignment manager reassigned successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:cycleId/assignments/:assignmentId/reassignments/:reassignmentId/cancel',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { assignmentId, reassignmentId } = request.params as {
          cycleId: string;
          assignmentId: string;
          reassignmentId: string;
        };
        const result = await request.container!.assignmentService.cancelReassignment(
          assignmentId,
          reassignmentId,
          request.body as CancelReassignmentInput,
        );
        return reply.send(successResponse('PMS reassignment cancelled successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:cycleId/assignments/:assignmentId/close',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { cycleId: string; assignmentId: string };
        const result = await request.container!.assignmentService.closeAssignment(
          assignmentId,
          request.body as AssignmentStateInput,
        );
        return reply.send(successResponse('PMS assignment closed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:cycleId/assignments/:assignmentId/reopen',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { cycleId: string; assignmentId: string };
        const result = await request.container!.assignmentService.reopenAssignment(
          assignmentId,
          request.body as AssignmentStateInput,
        );
        return reply.send(successResponse('PMS assignment reopened successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:cycleId/assignments/:assignmentId/reopen-appraisal',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { cycleId: string; assignmentId: string };
        const result = await request.container!.assignmentService.adminReopenAnnual(
          assignmentId,
          request.body as AssignmentStateInput,
        );
        return reply.send(successResponse('PMS annual appraisal window reopened successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:cycleId/assignment-exceptions/:exceptionId/resolve',
    { onRequest: [authenticate], schema: { tags: ['PMS Assignment Management'] } },
    async (request, reply) => {
      try {
        const { exceptionId } = request.params as { cycleId: string; exceptionId: string };
        const result = await request.container!.assignmentService.resolveException(
          exceptionId,
          request.body as ResolveExceptionInput,
        );
        return reply.send(successResponse('PMS assignment exception resolved successfully', result));
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
