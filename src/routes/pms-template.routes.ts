import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  CreateTemplateInput,
  CreateTemplateVersionInput,
  ResolveTemplateVersionInput,
  TemplateField,
  TemplateListQuery,
  TemplatePermission,
  TemplateSection,
  UpdateTemplateInput,
} from '../services/pms-template.service';

export const pmsTemplateRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const templates = await request.container!.pmsTemplateService.listTemplates(
          request.query as TemplateListQuery,
        );
        return reply.send(successResponse('PMS templates fetched successfully', templates));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const template = await request.container!.pmsTemplateService.createTemplate(
          request.body as CreateTemplateInput,
        );
        return reply.status(201).send(successResponse('PMS template created successfully', template));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const template = await request.container!.pmsTemplateService.updateTemplate(
          id,
          request.body as UpdateTemplateInput,
        );
        return reply.send(successResponse('PMS template updated successfully', template));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.delete(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        await request.container!.pmsTemplateService.deleteTemplate(id);
        return reply.send(successResponse('PMS template deleted successfully', { id }));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/clone',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const template = await request.container!.pmsTemplateService.cloneTemplate(id);
        return reply.status(201).send(successResponse('PMS template cloned successfully', template));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/versions',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const version = await request.container!.pmsTemplateService.createTemplateVersion(
          id,
          request.body as CreateTemplateVersionInput,
        );
        return reply.status(201).send(successResponse('PMS template version created successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id/versions',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const versions = await request.container!.pmsTemplateService.listTemplateVersions(id);
        return reply.send(successResponse('PMS template versions fetched successfully', versions));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id/audit',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const history = await request.container!.pmsTemplateService.getTemplateAuditHistory(id);
        return reply.send(successResponse('PMS template audit history fetched successfully', history));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/versions/:versionId/activate',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        const version = await request.container!.pmsTemplateService.activateTemplateVersion(versionId);
        return reply.send(successResponse('PMS template version activated successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/versions/:versionId/deactivate',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        const version = await request.container!.pmsTemplateService.deactivateTemplateVersion(versionId);
        return reply.send(successResponse('PMS template version deactivated successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.delete(
    '/versions/:versionId',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        await request.container!.pmsTemplateService.deleteTemplateVersion(versionId);
        return reply.send(successResponse('PMS template version deleted successfully', { versionId }));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/versions/:versionId',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        const version = await request.container!.pmsTemplateService.getTemplateVersion(versionId);
        return reply.send(successResponse('PMS template version fetched successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/versions/:versionId/sections',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        const { sections, annualScoringConfig } = request.body as {
          sections: TemplateSection[];
          annualScoringConfig?: Record<string, unknown>;
        };
        const version = await request.container!.pmsTemplateService.configureSections(versionId, sections, {
          annualScoringConfig,
        });
        return reply.send(successResponse('PMS template sections configured successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/versions/:versionId/fields',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        const { sectionKey, fields } = request.body as {
          sectionKey: string;
          fields: TemplateField[];
        };
        const version = await request.container!.pmsTemplateService.configureFields(versionId, sectionKey, fields);
        return reply.send(successResponse('PMS template fields configured successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/versions/:versionId/section-permissions',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        const { sectionKey, permissions } = request.body as {
          sectionKey: string;
          permissions: TemplatePermission[];
        };
        const version = await request.container!.pmsTemplateService.configureSectionPermissions(versionId, sectionKey, permissions);
        return reply.send(successResponse('PMS template section permissions configured successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/versions/:versionId/field-permissions',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        const { sectionKey, fieldKey, permissions } = request.body as {
          sectionKey: string;
          fieldKey: string;
          permissions: TemplatePermission[];
        };
        const version = await request.container!.pmsTemplateService.configureFieldPermissions(versionId, sectionKey, fieldKey, permissions);
        return reply.send(successResponse('PMS template field permissions configured successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/versions/:versionId/resolve',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        const resolved = await request.container!.pmsTemplateService.resolveTemplateVersion(
          versionId,
          request.body as ResolveTemplateVersionInput,
        );
        return reply.send(successResponse('PMS template version resolved successfully', resolved));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/versions/:versionId/preview',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { versionId } = request.params as { versionId: string };
        const version = await request.container!.pmsTemplateService.previewTemplate(versionId);
        return reply.send(successResponse('PMS template preview generated successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Template Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const template = await request.container!.pmsTemplateService.getTemplate(id);
        return reply.send(successResponse('PMS template fetched successfully', template));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_TEMPLATE_ERROR', message));
}
