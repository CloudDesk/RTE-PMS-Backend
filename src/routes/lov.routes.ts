import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';

export const lovRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {

  // Get all LOVs
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Master Data'],
        summary: 'Get list of values',
        description: 'Get paginated list of values with optional filters',
        querystring: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Filter by LOV type'
            },
            search: {
              type: 'string',
              description: 'Search by name'
            },
            page: {
              type: 'number',
              minimum: 1,
              default: 1,
              description: 'Page number'
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              default: 10,
              description: 'Records per page'
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
                    type: { type: 'string' },
                    values: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          label: { type: 'string' },
                          value: { type: 'string' },
                          description: { type: 'string' },
                          isActive: { type: 'boolean' }
                        }
                      }
                    }
                  }
                }
              },
              meta: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        console.log(request.query, "2 query");
        const result = await request.container!.lovService.findAll(request.query as any);
        return reply.send({
          success: true,
          data: result.lovs,
          meta: result.meta,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get LOV by type
  fastify.get(
    '/type/:type',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Master Data'],
        summary: 'Get values by type',
        description: 'Get all values for a specific LOV type',
        params: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              description: 'LOV type to fetch values for'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string' },
                  values: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        value: { type: 'string' },
                        description: { type: 'string' },
                        isActive: { type: 'boolean' }
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
    async (request, reply) => {
      try {
        const { type } = request.params as { type: string };
        const lov = await request.container!.lovService.findByType(type);
        if (!lov) {
          return reply.code(404).send({
            success: false,
            error: { message: 'LOV not found' }
          });
        }
        return reply.send({
          success: true,
          data: lov,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Create new LOV
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Master Data'],
        summary: 'Create a new LOV',
        description: 'Create a new LOV with the given details',
        body: {
          type: 'object',
          required: ['name', 'type', 'values'],
          properties: {
            name: { type: 'string', maxLength: 50 },
            type: { type: 'string', maxLength: 50 },
            values: {
              type: 'array',
              items: {
                type: 'object',
                required: ['label', 'value'],
                properties: {
                  label: { type: 'string', maxLength: 100 },
                  value: { type: 'string', maxLength: 100 },
                  description: { type: 'string' },
                  isActive: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const lov = await request.container!.lovService.create(request.body as any);
        return reply.status(201).send({
          success: true,
          data: lov,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  fastify.put(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Master Data'],
        summary: 'Update a LOV',
        description: 'Update a LOV with the given details',
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const lov = await request.container!.lovService.update(id, request.body as any);
        return reply.send({
          success: true,
          data: lov,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );
};
