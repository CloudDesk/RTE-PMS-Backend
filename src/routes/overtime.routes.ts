import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
// import { overtimeService } from '../services/overtime.service';
import { Types } from 'mongoose';

export const overtimeRoutes: RouteHandler = async (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> => {
  // Log overtime
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Attendance Management'],
        summary: 'Request overtime',
        description: 'Submit a new overtime request',
        body: {
          type: 'object',
          required: ['date', 'hours'],
          properties: {
            date: {
              type: 'string',
              format: 'date',
              description: 'Date of overtime work'
            },
            hours: {
              type: 'number',
              minimum: 1,
              maximum: 24,
              description: 'Number of overtime hours'
            },
            remarks: {
              type: 'string',
              description: 'Additional remarks for overtime request'
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
                  userId: { type: 'string' },
                  date: { type: 'string', format: 'date' },
                  hours: { type: 'number' },
                  status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] },
                  remarks: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const overtime = await request.container!.overtimeService.create({
          userId: (request.user as any)._id,
          ...(request.body as any),
          date: new Date((request.body as any).date),
        });
        return reply.status(201).send({
          success: true,
          data: overtime,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get overtime records
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Attendance Management'],
        summary: 'Get overtime requests',
        description: 'Get paginated list of overtime requests with optional filters',
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['Pending', 'Approved', 'Rejected'],
              description: 'Filter by overtime status'
            },
            startDate: {
              type: 'string',
              format: 'date',
              description: 'Filter by start date'
            },
            endDate: {
              type: 'string',
              format: 'date',
              description: 'Filter by end date'
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
                    userId: { type: 'string' },
                    date: { type: 'string', format: 'date' },
                    hours: { type: 'number' },
                    status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] },
                    remarks: { type: 'string' }
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
        const result = await request.container!.overtimeService.findAll({
          userId: (request.user as any)._id,
          ...(request.query as any),
        });
        return reply.send({
          success: true,
          data: result.overtimes,
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

  // Approve/Reject overtime
  fastify.put(
    '/:id/status',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Attendance Management'],
        summary: 'Approve/Reject overtime',
        description: 'Approve or reject an overtime request',
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Approved', 'Rejected'] },
            remarks: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const overtime = await request.container!.overtimeService.updateStatus(id, {
          ...(request.body as any),
          approvedBy: new Types.ObjectId((request.user as any)._id),
        });
        return reply.send({
          success: true,
          data: overtime,
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