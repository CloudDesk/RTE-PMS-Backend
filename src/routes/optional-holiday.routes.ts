import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { IOptionalHolidayCreate } from '../services/optional-holiday.service';
import { Types } from 'mongoose';
import { User } from '../models';

export const optionalHolidayRoutes: RouteHandler = async (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> => {
  // Apply for optional holiday
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Optional Holiday Management'],
        summary: 'Apply for optional holiday',
        description: 'Submit a new optional holiday request (max 2 per year)',
        body: {
          type: 'object',
          required: ['holidayDate', 'holidayName'],
          properties: {
            holidayDate: {
              type: 'string',
              format: 'date',
              description: 'Date of optional holiday (YYYY-MM-DD)',
            },
            holidayName: {
              type: 'string',
              description: 'Name of the optional holiday',
            },
            reason: {
              type: 'string',
              description: 'Reason for requesting optional holiday',
            },
            appliedTo: {
              type: 'object',
              description: 'Manager to approve the request',
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
                  holidayDate: { type: 'string', format: 'date' },
                  holidayName: { type: 'string' },
                  status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as IOptionalHolidayCreate;
        const userId = (request.user as any)._id;

        // Get user to find manager if appliedTo is not provided
        let appliedTo = body.appliedTo;
        if (!appliedTo) {
          const user = await User.findById(userId).select('managerId managerName');
          if (user && (user as any).managerId) {
            const manager = await User.findById((user as any).managerId).select('name');
            appliedTo = {
              _id: (user as any).managerId.toString(),
              name: manager?.name || (user as any).managerName || 'Manager',
            };
          }
          // If no manager found, leave appliedTo as undefined (don't set empty string)
        }

        const optionalHolidayData: IOptionalHolidayCreate = {
          userId: userId.toString(),
          holidayDate: new Date(body.holidayDate),
          holidayName: body.holidayName,
          reason: body.reason,
          appliedTo,
        };

        const optionalHoliday = await request.container!.optionalHolidayService.create(optionalHolidayData);
        return reply.status(201).send({
          success: true,
          data: optionalHoliday,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get optional holiday requests
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Optional Holiday Management'],
        summary: 'Get optional holiday requests',
        description: 'Get paginated list of optional holiday requests',
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
            appliedTo: { type: 'string', description: 'Filter by manager ID (Admin only)' },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            year: { type: 'number' },
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
            search: {
              description: 'Search by holiday name, reason, employee name, status, or applied to (manager name)'
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, status, startDate, endDate, year, page, limit, search } = request.query as any;
        const currentUser = request.user!;
        const userRole = (currentUser as any).role?.toLowerCase() || '';

        // Build query
        const query: any = {
          page: page ? Number(page) : 1,
          limit: limit ? Number(limit) : 10,
        };

        // If userId is provided, filter by that user
        if (userId) {
          query.userId = userId;
        } else {
          // If no userId provided:
          // - For admins: show all requests
          // - For managers: show requests where they are the approver (appliedTo)
          // - For regular users: show only their own requests
          if (userRole === 'admin' || userRole === 'superadmin') {
            // Admin sees all - no userId filter
          } else if (userRole === 'manager') {
            // Manager sees requests assigned to them
            query.appliedTo = (currentUser as any)._id.toString();
          } else {
            // Regular user sees only their own
            query.userId = (currentUser as any)._id.toString();
          }
        }

        if (status) query.status = status;
        if (startDate) query.startDate = startDate;
        if (endDate) query.endDate = endDate;
        if (year) query.year = Number(year);
        // Normalize search parameter (handle case where it might be an array from duplicate query params)
        if (search) {
          query.search = Array.isArray(search) ? search[0] : search;
        }

        const result = await request.container!.optionalHolidayService.findAll(query);
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

  // Get single optional holiday request
  fastify.get(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Optional Holiday Management'],
        summary: 'Get optional holiday request by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const optionalHoliday = await request.container!.optionalHolidayService.findById(id);
        return reply.send({
          success: true,
          data: optionalHoliday,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Approve/Reject optional holiday request
  fastify.put(
    '/:id/status',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Optional Holiday Management'],
        summary: 'Approve/Reject optional holiday request',
        description: 'Approve or reject an optional holiday request',
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Approved', 'Rejected', 'Cancelled'] },
            remarks: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const updateData = {
          ...(request.body as any),
          approvedBy: {
            _id: (request.user as any)._id,
            name: (request.user as any).name,
            email: (request.user as any).email,
          },
        };

        const optionalHoliday = await request.container!.optionalHolidayService.updateStatus(id, updateData);
        return reply.send({
          success: true,
          data: optionalHoliday,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Cancel optional holiday request
  fastify.delete(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Optional Holiday Management'],
        summary: 'Cancel optional holiday request',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const userId = (request.user as any)._id;
        const optionalHoliday = await request.container!.optionalHolidayService.cancel(id, userId);
        return reply.send({
          success: true,
          data: optionalHoliday,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get usage summary
  fastify.get(
    '/user/:userId/summary',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Optional Holiday Management'],
        summary: 'Get optional holiday usage summary',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            year: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };
        const { year } = request.query as { year?: number };
        const currentYear = year || new Date().getFullYear();

        const summary = await request.container!.optionalHolidayService.getUsageSummary(
          new Types.ObjectId(userId),
          currentYear,
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

  // Check annual limit
  fastify.get(
    '/user/:userId/limit',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Optional Holiday Management'],
        summary: 'Check annual limit for optional holidays',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            year: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };
        const { year } = request.query as { year?: number };
        const currentYear = year || new Date().getFullYear();

        const limit = await request.container!.optionalHolidayService.checkAnnualLimit(
          new Types.ObjectId(userId),
          currentYear,
        );
        return reply.send({
          success: true,
          data: limit,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get optional holiday requests by appliedTo
  fastify.get(
    '/applied-to/:appliedTo',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Optional Holiday Management'],
        summary: 'Get optional holiday requests by appliedTo',
        description: 'Get Optional Holiday Data Based on appliedTo field',
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            year: { type: 'number' },
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 5 },
            search: {
              description: 'Search by holiday name, reason, employee name, status, or applied to (manager name)'
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
                    holidayDate: { type: 'string', format: 'date' },
                    holidayName: { type: 'string' },
                    status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
                    reason: { type: 'string' },
                    appliedTo: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                      },
                    },
                    user: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
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
            },
            required: ['success', 'data', 'meta']
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { appliedTo } = request.params as { appliedTo: string };
        const { userId, status, startDate, endDate, year, page, limit, search } = request.query as any;

        // Normalize search parameter (handle case where it might be an array from duplicate query params)
        const normalizedSearch = search ? (Array.isArray(search) ? search[0] : search) : undefined;

        const query: any = {
          appliedTo,
          userId: userId,
          status: status ? status : undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          year: year ? Number(year) : undefined,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          search: normalizedSearch,
        };

        const optionalHolidayData = await request.container!.optionalHolidayService.getOptionalHolidaysByAppliedTo(query);
        console.log(optionalHolidayData, 'Route optional holiday');

        return reply.send({
          success: true,
          data: optionalHolidayData.data,
          meta: optionalHolidayData.meta
        });
      } catch (error: any) {
        console.log(error, 'error');
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );
};

