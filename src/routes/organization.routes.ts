import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';

export const organizationRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Create organization
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Organization'],
        summary: 'Create organization',
        description: 'Create a new organization unit',
        body: {
          type: 'object',
          required: ['name', 'code'],
          properties: {
            name: { 
              type: 'string', 
              maxLength: 100,
              description: 'Organization name'
            },
            code: { 
              type: 'string', 
              maxLength: 20,
              description: 'Organization code'
            },
            parentId: { 
              type: 'string',
              description: 'Parent organization ID'
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  name: { type: 'string' },
                  code: { type: 'string' },
                  parentId: { type: 'string' }
                }
              }
            }
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const org = await request.container!.organizationService.create(request.body as any);
        return reply.status(201).send({
          success: true,
          data: org,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );

  // Get organization hierarchy
  fastify.get(
    '/hierarchy',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Organization'],
        summary: 'Get organization hierarchy',
        description: 'Get hierarchical structure of organizations starting from optional root ID',
        querystring: {
          type: 'object',
          properties: {
            rootId: { 
              type: 'string',
              description: 'Root organization ID to start hierarchy from'
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    name: { type: 'string' },
                    code: { type: 'string' },
                    parentId: { type: 'string' },
                    children: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          _id: { type: 'string' },
                          name: { type: 'string' },
                          code: { type: 'string' },
                          parentId: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const { rootId } = request.query as { rootId?: string };
        const hierarchy = await request.container!.organizationService.getHierarchy(rootId);
        return reply.send({
          success: true,
          data: hierarchy,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );
};