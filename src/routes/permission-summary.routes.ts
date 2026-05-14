import { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { authenticate } from '../middleware/auth';

export async function permissionSummaryRoutes(fastify: FastifyInstance): Promise<void> {
  // Get permission summary for a user (specific month)
  fastify.get(
    '/summary/:userId',
    {
      schema: {
        tags: ['Permission Summary'],
        summary: 'Get permission summary for a user',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            year: {
              type: 'number',
              description: 'Year for permission summary',
              default: new Date().getFullYear(),
            },
            month: {
              type: 'number',
              description: 'Month for permission summary (1-12)',
              minimum: 1,
              maximum: 12,
              default: new Date().getMonth() + 1,
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = request.query as {
          year?: number;
          month?: number;
        };
        const userId = new Types.ObjectId((request.params as any).userId as string);

        const summary = await request.container!.permissionSummaryService.getPermissionSummary(
          userId,
          year,
          month
        );

        return reply.send({
          success: true,
          data: summary,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get permission balance for a user (specific month)
  fastify.get(
    '/balance/:userId',
    {
      schema: {
        tags: ['Permission Summary'],
        summary: 'Get permission balance for a user',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            year: {
              type: 'number',
              description: 'Year for permission balance',
              default: new Date().getFullYear(),
            },
            month: {
              type: 'number',
              description: 'Month for permission balance (1-12)',
              minimum: 1,
              maximum: 12,
              default: new Date().getMonth() + 1,
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = request.query as {
          year?: number;
          month?: number;
        };
        const userId = new Types.ObjectId((request.params as any).userId as string);

        const balance = await request.container!.permissionSummaryService.getMonthlyPermissionBalance(
          userId,
          year,
          month
        );

        return reply.send({
          success: true,
          data: balance,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Update permission allotment (Admin only)
  fastify.post(
    '/allotments',
    {
      schema: {
        tags: ['Permission Summary'],
        summary: 'Update permission allotment for a user (Admin)',
        description: 'Set monthly permission hours allotment (e.g., 2 hours per month)',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['userId', 'year', 'month', 'alloted'],
          properties: {
            userId: {
              type: 'string',
              description: 'User ID to update permission allotment for',
            },
            year: {
              type: 'number',
              description: 'Year for permission allotment',
              default: new Date().getFullYear(),
            },
            month: {
              type: 'number',
              description: 'Month for permission allotment (1-12)',
              minimum: 1,
              maximum: 12,
            },
            alloted: {
              type: 'number',
              minimum: 0,
              description: 'Hours allotted per month (e.g., 2)',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  year: { type: 'number' },
                  month: { type: 'number' },
                  permissions: {
                    type: 'object',
                    properties: {
                      alloted: { type: 'number' },
                      availed: { type: 'number' },
                      remaining: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { userId, year = new Date().getFullYear(), month, alloted } = request.body as {
          userId: string;
          year?: number;
          month: number;
          alloted: number;
        };

        const updatedSummary = await request.container!.permissionSummaryService.updatePermissionAllotments(
          new Types.ObjectId(userId),
          year,
          month,
          alloted
        );

        return reply.send({
          success: true,
          data: updatedSummary,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get multiple users permission summaries
  fastify.get(
    '/summaries',
    {
      schema: {
        tags: ['Permission Summary'],
        summary: 'Get permission summaries for multiple users',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            userIds: {
              type: 'string',
              description: 'Comma-separated list of user IDs',
            },
            year: {
              type: 'number',
              description: 'Year for permission summary',
              default: new Date().getFullYear(),
            },
            month: {
              type: 'number',
              description: 'Month for permission summary (1-12)',
              minimum: 1,
              maximum: 12,
              default: new Date().getMonth() + 1,
            },
          },
          required: ['userIds'],
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const {
          userIds,
          year = new Date().getFullYear(),
          month = new Date().getMonth() + 1,
        } = request.query as {
          userIds: string;
          year?: number;
          month?: number;
        };

        const userIdList = userIds.split(',').map((id) => new Types.ObjectId(id.trim()));

        const summaries = await Promise.all(
          userIdList.map((userId) =>
            request.container!.permissionSummaryService.getPermissionSummary(userId, year, month)
          )
        );

        return reply.send({
          success: true,
          data: summaries,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Bulk update permission allotments (Admin only)
  fastify.post(
    '/allotments/bulk',
    {
      schema: {
        tags: ['Permission Summary'],
        summary: 'Bulk update permission allotments for multiple users (Admin)',
        description: 'Set monthly permission hours allotment for multiple users at once',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['allotments', 'year', 'month'],
          properties: {
            allotments: {
              type: 'array',
              description: 'Array of user allotments',
              items: {
                type: 'object',
                required: ['userId', 'alloted'],
                properties: {
                  userId: {
                    type: 'string',
                    description: 'User ID',
                  },
                  alloted: {
                    type: 'number',
                    minimum: 0,
                    description: 'Hours allotted per month (e.g., 2)',
                  },
                },
              },
              minItems: 1,
            },
            year: {
              type: 'number',
              description: 'Year for permission allotment',
              default: new Date().getFullYear(),
            },
            month: {
              type: 'number',
              description: 'Month for permission allotment (1-12)',
              minimum: 1,
              maximum: 12,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  successCount: { type: 'number' },
                  failedCount: { type: 'number' },
                  errors: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        userId: { type: 'string' },
                        error: { type: 'string' },
                      },
                    },
                  },
                  updated: {
                    type: 'array',
                    items: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { allotments, year = new Date().getFullYear(), month } = request.body as {
          allotments: Array<{ userId: string; alloted: number }>;
          year?: number;
          month: number;
        };

        // Validate allotments array
        if (!Array.isArray(allotments) || allotments.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'allotments must be a non-empty array' },
          });
        }

        // Convert to ObjectId format
        const allotmentsWithObjectId = allotments.map((a) => ({
          userId: new Types.ObjectId(a.userId),
          alloted: a.alloted,
        }));

        const result = await request.container!.permissionSummaryService.bulkUpdatePermissionAllotments(
          allotmentsWithObjectId,
          year,
          month
        );

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );
}

