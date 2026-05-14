import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';

export const attendanceOverrideRoutes: RouteHandler = async (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> => {
  // Create Override
  fastify.post(
    '/attendance/override',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Attendance Override'],
        summary: 'Create or update attendance override',
        description: 'Admin can override attendance for any user. If an attendance record already exists for the same userId and shiftDay, it will update the existing override. Otherwise, it creates a new override. Supports Present, Absent, On-Leave, and Holiday-Swipe statuses.',
        body: {
          type: 'object',
          required: ['userId', 'shiftDay', 'attendanceStatus'],
          properties: {
            userId: {
              type: 'string',
              description: 'User ID whose attendance is being overridden',
            },
            attendanceId: {
              type: 'string',
              description: 'Optional: Attendance record ID. If provided, updates existing record. Otherwise finds by userId and shiftDay.',
            },
            shiftDay: {
              type: 'string',
              format: 'date',
              description: 'Date in YYYY-MM-DD format',
            },
            attendanceStatus: {
              type: 'array',
              items: { type: 'string' },
              description: 'Must include "Override" and one of: Present, Absent, On-Leave, Holiday-Swipe',
            },
            reason: {
              type: 'string',
              description: 'Optional: Reason for override (if null, backend sets default)',
            },
            remarks: {
              type: 'string',
              description: 'Optional additional notes',
            },
            leaveTypeId: {
              type: 'string',
              description: 'Required for On-Leave status - Leave type ID',
            },
            leaveReason: {
              type: 'string',
              description: 'Optional: Reason for leave (if creating new leave request)',
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  attendanceRecord: { type: 'object' },
                  message: { type: 'string' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
              error: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const overrideService = request.container!.attendanceOverrideService;
        const adminId = (request.user as any)._id;

        const attendanceRecord = await overrideService.createOverride(
          request.body as any,
          adminId
        );

        return reply.send({
          success: true,
          data: {
            attendanceRecord,
            message: 'Attendance override created successfully',
          },
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get Override History
  fastify.get(
    '/attendance/override/history',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Attendance Override'],
        summary: 'Get override history',
        description: 'Get all attendance overrides with filters',
        querystring: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'Filter by user ID',
            },
            startDate: {
              type: 'string',
              format: 'date',
              description: 'Start date (YYYY-MM-DD)',
            },
            endDate: {
              type: 'string',
              format: 'date',
              description: 'End date (YYYY-MM-DD)',
            },
            overriddenBy: {
              type: 'string',
              description: 'Filter by admin who created override',
            },
            page: {
              type: 'number',
              default: 1,
              description: 'Page number',
            },
            limit: {
              type: 'number',
              default: 10,
              description: 'Page size',
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
                items: { type: 'object' },
              },
              meta: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const overrideService = request.container!.attendanceOverrideService;
        const query = request.query as any;

        const result = await overrideService.getOverrideHistory(query);

        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get Override Details
  fastify.get(
    '/attendance/override/:attendanceRecordId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Attendance Override'],
        summary: 'Get override details',
        description: 'Get detailed information about a specific attendance override',
        params: {
          type: 'object',
          properties: {
            attendanceRecordId: {
              type: 'string',
              description: 'Attendance record ID',
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
                  attendanceRecord: { type: 'object' },
                  user: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      employeeCode: { type: 'string' },
                    },
                  },
                  overriddenBy: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                  lastModifiedBy: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                  overrideHistory: {
                    type: 'array',
                    items: { type: 'object' },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
              error: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const overrideService = request.container!.attendanceOverrideService;
        const { attendanceRecordId } = request.params as { attendanceRecordId: string };

        const result = await overrideService.getOverrideDetails(attendanceRecordId);

        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Bulk Override (Optional)
  fastify.post(
    '/attendance/override/bulk',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Attendance Override'],
        summary: 'Bulk create attendance overrides',
        description: 'Create multiple attendance overrides in a single request',
        body: {
          type: 'object',
          required: ['overrides'],
          properties: {
            overrides: {
              type: 'array',
              items: {
                type: 'object',
                required: ['userId', 'shiftDay', 'attendanceStatus'],
                properties: {
                  userId: { type: 'string' },
                  attendanceId: { type: 'string' },
                  shiftDay: { type: 'string', format: 'date' },
                  attendanceStatus: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  reason: { type: 'string' },
                  remarks: { type: 'string' },
                  leaveTypeId: { type: 'string' },
                  leaveReason: { type: 'string' },
                },
              },
            },
            commonReason: {
              type: 'string',
              description: 'Common reason for all overrides',
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
                  successful: { type: 'number' },
                  failed: { type: 'number' },
                  results: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        userId: { type: 'string' },
                        shiftDay: { type: 'string' },
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const overrideService = request.container!.attendanceOverrideService;
        const adminId = (request.user as any)._id;
        const { overrides, commonReason } = request.body as any;

        const results: Array<{
          userId: string;
          shiftDay: string;
          success: boolean;
          error?: string;
        }> = [];

        let successful = 0;
        let failed = 0;

        for (const overrideData of overrides) {
          try {
            await overrideService.createOverride(
              {
                ...overrideData,
                reason: overrideData.reason || commonReason,
              },
              adminId
            );
            results.push({
              userId: overrideData.userId,
              shiftDay: overrideData.shiftDay,
              success: true,
            });
            successful++;
          } catch (error: any) {
            results.push({
              userId: overrideData.userId,
              shiftDay: overrideData.shiftDay,
              success: false,
              error: error.message,
            });
            failed++;
          }
        }

        return reply.send({
          success: true,
          data: {
            successful,
            failed,
            results,
          },
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

