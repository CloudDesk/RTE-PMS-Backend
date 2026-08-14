import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  CreateManagerReviewTemplateInput,
  LaunchManagerReviewInput,
  ManagerReviewQueueQuery,
  ManagerReviewTeamQuery,
  UpdateManagerReviewTemplateInput,
} from '../services/managerInitiatedReview.service';

export const managerInitiatedReviewRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/employees',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Initiated Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.managerInitiatedReviewService.listEligibleTeamMembers(
          request.query as ManagerReviewTeamQuery,
        );
        return reply.send(successResponse('Eligible team members fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/queue',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Initiated Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.managerInitiatedReviewService.getManagerReviewQueue(
          request.query as ManagerReviewQueueQuery,
        );
        return reply.send(successResponse('Manager review queue fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/templates',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Initiated Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.managerInitiatedReviewService.listManagerTemplates();
        return reply.send(successResponse('Manager review templates fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/templates',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Initiated Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.managerInitiatedReviewService.createManagerTemplate(
          request.body as CreateManagerReviewTemplateInput,
        );
        return reply.status(201).send(successResponse('Manager review template created successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/templates/:templateId',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Initiated Reviews'] } },
    async (request, reply) => {
      try {
        const { templateId } = request.params as { templateId: string };
        const result = await request.container!.managerInitiatedReviewService.getTemplate(templateId);
        return reply.send(successResponse('Manager review template fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/templates/:templateId',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Initiated Reviews'] } },
    async (request, reply) => {
      try {
        const { templateId } = request.params as { templateId: string };
        const result = await request.container!.managerInitiatedReviewService.updateManagerTemplate(
          templateId,
          request.body as UpdateManagerReviewTemplateInput,
        );
        return reply.send(successResponse('Manager review template updated successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/launch',
    { onRequest: [authenticate], schema: { tags: ['PMS Manager Initiated Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.managerInitiatedReviewService.launchReview(
          request.body as LaunchManagerReviewInput,
        );
        return reply.status(201).send(successResponse('Manager initiated review launched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  reply.log.error({ err: error }, 'Route handler error');
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_MANAGER_INITIATED_REVIEW_ERROR', message));
}
