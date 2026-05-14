import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { IPermissionCreate, IPermissionQuery } from '../services/permission.service';
import { Types } from 'mongoose';
import { User } from '../models';

export const permissionRoutes: RouteHandler = async (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> => {
  // Apply for permission
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Permission Management'],
        summary: 'Apply for permission',
        description: 'Submit a new permission request (hours-based, per month)',
        body: {
          type: 'object',
          required: ['permissionDate', 'hours', 'reason'],
          properties: {
            permissionDate: {
              type: 'string',
              format: 'date',
              description: 'Date for permission (YYYY-MM-DD)'
            },
            hours: {
              type: 'number',
              minimum: 0.5,
              maximum: 24,
              description: 'Number of hours requested (e.g., 0.5, 1, 2)'
            },
            remarks: {
              type: 'string',
              description: 'Additional remarks'
            },
            reason: {
              type: 'string',
              description: 'Reason for permission'
            },
            appliedTo: {
              type: 'object',
              description: 'Manager to approve the permission'
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
                  permissionDate: { type: 'string', format: 'date' },
                  hours: { type: 'number' },
                  status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] },
                  reason: { type: 'string' },
                }
              }
            }
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as IPermissionCreate;
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
          } else {
            appliedTo = {
              _id: '',
              name: 'Manager',
            };
          }
        }

        const permissionData: IPermissionCreate = {
          userId: userId.toString(),
          permissionDate: new Date(body.permissionDate),
          hours: body.hours,
          reason: body.reason,
          remarks: body.remarks,
          appliedTo,
        };

        const permission = await request.container!.permissionService.create(permissionData);
        return reply.status(201).send({
          success: true,
          data: permission,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get permission requests
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Permission Management'],
        summary: 'Get permission requests',
        description: 'Get paginated list of permission requests',
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
            search: {
              description: 'Search by employee name, reason, manager name, or status'
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, status, startDate, endDate, page, limit, search } = request.query as any;
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
          // - For managers: show requests where they are the approver (appliedTo)
          // - For admins: show all requests
          // - For regular users: show only their own requests
          if (userRole === 'admin' || userRole === 'superadmin') {
            // Admin sees all - no userId filter
          } else if (userRole === 'manager') {
            // Manager sees requests assigned to them
            query.appliedTo = (currentUser as any)._id.toString();
          } else {
            // Regular user sees only their own
            query.userId = (currentUser as any)._id;
          }
        }

        if (status) query.status = status;
        if (startDate) query.startDate = startDate;
        if (endDate) query.endDate = endDate;
        // Normalize search parameter (handle case where it might be an array from duplicate query params)
        if (search) {
          query.search = Array.isArray(search) ? search[0] : search;
        }

        const result = await request.container!.permissionService.findAll(query);
        return reply.send({
          success: true,
          data: result.permissions,
          total: result.total,
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

  // Get permissions by appliedTo
  fastify.get(
    '/applied-to/:appliedTo',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Permission Management'],
        summary: 'Get permission requests by appliedTo',
        description: 'Get Permission Data Based on appliedTo field',
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 5 },
            search: {
              description: 'Search by employee name, reason, manager name, or status'
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
                    permissionDate: { type: 'string', format: 'date' },
                    hours: { type: 'number' },
                    status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
                    reason: { type: 'string' },
                    remarks: { type: 'string' },
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
        const { userId, status, startDate, endDate, page, limit, search } = request.query as any;

        // Normalize search parameter (handle case where it might be an array from duplicate query params)
        const normalizedSearch = search ? (Array.isArray(search) ? search[0] : search) : undefined;

        const query: IPermissionQuery = {
          appliedTo,
          userId: userId,
          status: status ? status : undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          search: normalizedSearch,
        };

        const permissionData = await request.container!.permissionService.getPermissionsByAppliedTo(query);

        return reply.send({
          success: true,
          data: permissionData.data,
          meta: permissionData.meta
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get permission by ID
  fastify.get(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Permission Management'],
        summary: 'Get permission by ID',
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const permission = await request.container!.permissionService.findById(id);
        return reply.send({
          success: true,
          data: permission,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Approve/Reject permission request
  fastify.put(
    '/:id/status',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Permission Management'],
        summary: 'Approve/Reject permission request',
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
        const { status, remarks } = request.body as { status: string; remarks?: string };
        const approver = request.user!;

        const permission = await request.container!.permissionService.updateStatus(id, {
          status: status as 'Approved' | 'Rejected' | 'Cancelled',
          remarks,
          approvedById: approver._id instanceof Types.ObjectId ? approver._id : new Types.ObjectId(approver._id),
          approvedBy: {
            _id: approver._id instanceof Types.ObjectId ? approver._id : new Types.ObjectId(approver._id),
            name: approver.name,
            email: approver.email || '',
          },
        });

        return reply.send({
          success: true,
          data: permission,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Cancel permission request
  fastify.put(
    '/:id/cancel',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Permission Management'],
        summary: 'Cancel permission request',
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const userId = request.user!._id instanceof Types.ObjectId
          ? request.user!._id
          : new Types.ObjectId(request.user!._id);
        const result = await request.container!.permissionService.cancel(id, userId);
        return reply.send({
          success: true,
          message: result.message,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get permission balance for a month
  fastify.get(
    '/balance/:year/:month',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Permission Management'],
        summary: 'Get permission balance for a month',
      },
    },
    async (request, reply) => {
      try {
        const { year, month } = request.params as { year: string; month: string };
        const userId = request.user!._id instanceof Types.ObjectId
          ? request.user!._id
          : new Types.ObjectId(request.user!._id);
        const balance = await request.container!.permissionService.getPermissionBalance(
          userId,
          Number(year),
          Number(month)
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
};

