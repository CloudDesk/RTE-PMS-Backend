import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { EmployeeRolesResponsibilitiesError } from '../services/employee-roles-responsibilities.service';
import type { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';

type EntryBody = {
  entryId?: string;
  description?: unknown;
  serialNo?: unknown;
};

export const employeeRolesResponsibilitiesRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get('/me', { onRequest: [authenticate] }, async (request, reply) => {
    try {
      const result = await request.container!.employeeRolesResponsibilitiesService.getOwn();
      return reply.send(successResponse('Roles and responsibilities retrieved', result));
    } catch (error: unknown) {
      return sendRouteError(reply, error);
    }
  });

  fastify.put(
    '/me/entries/draft',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as EntryBody;
        const result =
          await request.container!.employeeRolesResponsibilitiesService.saveEntryDraft(
            body.description,
            body.entryId,
            body.serialNo,
          );
        return reply.send(successResponse('Responsibility draft saved', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/me/entries/submit',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as EntryBody;
        const result =
          await request.container!.employeeRolesResponsibilitiesService.submitEntry(
            body.description,
            body.entryId,
            body.serialNo,
          );
        return reply.send(successResponse('Responsibility submitted', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.patch(
    '/me/entries/:entryId/visibility',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const { entryId } = request.params as { entryId: string };
        const body = (request.body ?? {}) as {
          isVisible?: unknown;
          serialNo?: unknown;
        };
        if (typeof body.isVisible !== 'boolean') {
          throw new EmployeeRolesResponsibilitiesError(
            400,
            'ROLE_RESPONSIBILITY_VISIBILITY_INVALID',
            'isVisible must be true or false',
          );
        }
        const result =
          await request.container!.employeeRolesResponsibilitiesService.setEntryVisibility(
            entryId,
            body.isVisible,
            body.serialNo,
          );
        return reply.send(
          successResponse(
            body.isVisible
              ? 'Responsibility is now visible'
              : 'Responsibility is now hidden',
            result,
          ),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.delete(
    '/me/entries/:entryId',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const { entryId } = request.params as { entryId: string };
        const query = (request.query ?? {}) as { serialNo?: unknown };
        const body = (request.body ?? {}) as { serialNo?: unknown };
        const result =
          await request.container!.employeeRolesResponsibilitiesService.deleteEntry(
            entryId,
            query.serialNo ?? body.serialNo,
          );
        return reply.send(successResponse('Responsibility removed', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/employees/:employeeId/manage',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const { employeeId } = request.params as { employeeId: string };
        const result =
          await request.container!.employeeRolesResponsibilitiesService.getForEmployeeManagement(
            employeeId,
          );
        return reply.send(successResponse('Roles and responsibilities retrieved', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/employees/:employeeId/entries/draft',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const { employeeId } = request.params as { employeeId: string };
        const body = (request.body ?? {}) as EntryBody;
        const result =
          await request.container!.employeeRolesResponsibilitiesService.saveEntryDraft(
            body.description,
            body.entryId,
            body.serialNo,
            employeeId,
          );
        return reply.send(successResponse('Responsibility draft saved', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/employees/:employeeId/entries/submit',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const { employeeId } = request.params as { employeeId: string };
        const body = (request.body ?? {}) as EntryBody;
        const result =
          await request.container!.employeeRolesResponsibilitiesService.submitEntry(
            body.description,
            body.entryId,
            body.serialNo,
            employeeId,
          );
        return reply.send(successResponse('Responsibility submitted', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.patch(
    '/employees/:employeeId/entries/:entryId/visibility',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const { employeeId, entryId } = request.params as {
          employeeId: string;
          entryId: string;
        };
        const body = (request.body ?? {}) as {
          isVisible?: unknown;
          serialNo?: unknown;
        };
        if (typeof body.isVisible !== 'boolean') {
          throw new EmployeeRolesResponsibilitiesError(
            400,
            'ROLE_RESPONSIBILITY_VISIBILITY_INVALID',
            'isVisible must be true or false',
          );
        }
        const result =
          await request.container!.employeeRolesResponsibilitiesService.setEntryVisibility(
            entryId,
            body.isVisible,
            body.serialNo,
            employeeId,
          );
        return reply.send(
          successResponse(
            body.isVisible
              ? 'Responsibility is now visible'
              : 'Responsibility is now hidden',
            result,
          ),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.delete(
    '/employees/:employeeId/entries/:entryId',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const { employeeId, entryId } = request.params as {
          employeeId: string;
          entryId: string;
        };
        const query = (request.query ?? {}) as { serialNo?: unknown };
        const body = (request.body ?? {}) as { serialNo?: unknown };
        const result =
          await request.container!.employeeRolesResponsibilitiesService.deleteEntry(
            entryId,
            query.serialNo ?? body.serialNo,
            employeeId,
          );
        return reply.send(successResponse('Responsibility removed', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/employees/:employeeId',
    { onRequest: [authenticate] },
    async (request, reply) => {
      try {
        const { employeeId } = request.params as { employeeId: string };
        const result =
          await request.container!.employeeRolesResponsibilitiesService.getForEmployee(
            employeeId,
          );
        return reply.send(successResponse('Roles and responsibilities retrieved', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

};

function sendRouteError(reply: FastifyReply, error: unknown) {
  if (error instanceof EmployeeRolesResponsibilitiesError) {
    return reply
      .status(error.statusCode)
      .send(errorResponse(error.errorCode, error.message));
  }
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  return reply
    .status(500)
    .send(errorResponse('ROLES_RESPONSIBILITIES_ERROR', message));
}
