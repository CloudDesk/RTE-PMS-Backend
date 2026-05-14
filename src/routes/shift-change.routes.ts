import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { IShiftChangeCreate, IShiftChangeQuery } from '../services/shift-change.service';
import { Types } from 'mongoose';
import { User } from '../models';

export const shiftChangeRoutes: RouteHandler = async (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> => {
  // Add custom parser for empty JSON bodies (for cancel endpoint)
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      // Convert body to string if it's a Buffer
      const bodyStr = typeof body === 'string' ? body : body.toString();

      // Handle empty body by converting to empty object
      if (!bodyStr || bodyStr.trim() === '' || bodyStr === 'null') {
        return done(null, {});
      }
      const json = JSON.parse(bodyStr);
      done(null, json);
    } catch (err: any) {
      done(err, undefined);
    }
  });

  // Create shift change request
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Change Management'],
        summary: 'Create shift change request',
        description: 'Submit a new shift change request',
        body: {
          type: 'object',
          required: ['requestedShiftId', 'effectiveDate', 'reason'],
          properties: {
            requestedShiftId: {
              type: 'string',
              description: 'ID of the shift to change to',
            },
            effectiveDate: {
              type: 'string',
              format: 'date',
              description: 'Date when shift change should take effect (YYYY-MM-DD)',
            },
            reason: {
              type: 'string',
              minLength: 10,
              description: 'Reason for shift change (min 10 characters)',
            },
            remarks: {
              type: 'string',
              description: 'Optional additional remarks',
            },
            appliedTo: {
              type: 'object',
              description: 'Manager/Admin to approve the request',
              properties: {
                _id: { type: 'string' },
                name: { type: 'string' },
              },
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as IShiftChangeCreate;
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
            throw new Error('Manager not found. Please specify appliedTo in request body.');
          }
        }

        const shiftChangeData: IShiftChangeCreate = {
          requestedShiftId: body.requestedShiftId,
          effectiveDate: body.effectiveDate,
          reason: body.reason,
          remarks: body.remarks,
          appliedTo,
        };

        const shiftChangeRequest = await request.container!.shiftChangeService.create(
          shiftChangeData,
          new Types.ObjectId(userId)
        );

        return reply.code(201).send({
          success: true,
          data: shiftChangeRequest,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );

  // Get all shift change requests
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Change Management'],
        summary: 'Get shift change requests',
        description: 'Get paginated list of shift change requests',
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            status: {
              type: 'string',
              enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
            },
            appliedTo: { type: 'string', description: 'Filter by manager ID (Admin only)' },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            search: {
              description: 'Search by applied by (employee name/email), applied to (manager name), reason, status, current shift name/code, or requested shift name/code'
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, status, startDate, endDate, appliedTo, page, limit, search } = request.query as any;
        const currentUser = request.user!;
        const userRole = (currentUser as any).role?.toLowerCase() || '';

        // Build query
        const query: any = {
          page: page ? Number(page) : 1,
          limit: limit ? Number(limit) : 20,
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
        if (appliedTo && (userRole === 'admin' || userRole === 'superadmin')) {
          query.appliedTo = appliedTo;
        }
        // Normalize search parameter (handle case where it might be an array from duplicate query params)
        if (search) {
          query.search = Array.isArray(search) ? search[0] : search;
        }

        const result = await request.container!.shiftChangeService.findAll(query);
        return reply.send({
          success: true,
          data: result.requests,
          total: result.total,
          meta: result.meta,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );

  // Get shift change requests by appliedTo
  fastify.get(
    '/applied-to/:appliedTo',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Change Management'],
        summary: 'Get shift change requests by appliedTo',
        description: 'Get Shift Change Data Based on appliedTo field',
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
              description: 'Search by employee name, reason, manager name, status, current shift name/code, or requested shift name/code'
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
                    effectiveDate: { type: 'string', format: 'date' },
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
                    requestedShift: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        code: { type: 'string' },
                        startTime: { type: 'string' },
                        endTime: { type: 'string' },
                      },
                    },
                    currentShift: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        code: { type: 'string' },
                        startTime: { type: 'string' },
                        endTime: { type: 'string' },
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

        const query: IShiftChangeQuery = {
          appliedTo,
          userId: userId,
          status: status ? status : undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          search: normalizedSearch,
        };

        const shiftChangeData = await request.container!.shiftChangeService.getShiftChangesByAppliedTo(query);

        return reply.send({
          success: true,
          data: shiftChangeData.data,
          meta: shiftChangeData.meta
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );

  // Get shift change request by ID
  fastify.get(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Change Management'],
        summary: 'Get shift change request by ID',
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const currentUser = request.user as any;
        const requestData = await request.container!.shiftChangeService.findById(id);

        // Authorization check in route
        const userRole = (currentUser as any).role?.toLowerCase() || '';
        const userId = requestData.userId.toString();
        const currentUserId = (currentUser as any)._id?.toString();
        const appliedToId = requestData.appliedTo?._id?.toString() || null;

        const canView =
          userRole === 'admin' ||
          userRole === 'superadmin' ||
          userId === currentUserId ||
          (appliedToId === currentUserId);

        if (!canView) {
          return reply.status(403).send({
            success: false,
            error: { message: 'Unauthorized to view this request' },
          });
        }

        return reply.send({
          success: true,
          data: requestData,
        });
      } catch (error: any) {
        if (error.message === 'Shift change request not found') {
          return reply.status(404).send({
            success: false,
            error: { message: error.message },
          });
        }
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );

  // Approve/Reject shift change request
  fastify.put(
    '/:id/status',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Change Management'],
        summary: 'Approve/Reject shift change request',
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
        const { status, remarks } = request.body as { status: string; remarks?: string };
        const approver = request.user!;
        const currentUser = approver as any;

        // Check authorization
        const requestData = await request.container!.shiftChangeService.findById(id);
        const userRole = currentUser.role?.toLowerCase() || '';
        const appliedToId = requestData.appliedTo?._id?.toString() || null;
        const currentUserId = currentUser._id?.toString();

        const canApprove =
          userRole === 'admin' ||
          userRole === 'superadmin' ||
          (appliedToId === currentUserId && (userRole === 'admin' || userRole === 'manager'));

        if (!canApprove) {
          return reply.status(403).send({
            success: false,
            error: { message: 'Unauthorized to approve/reject this request' },
          });
        }

        const shiftChangeRequest = await request.container!.shiftChangeService.updateStatus(id, {
          status: status as 'Approved' | 'Rejected',
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
          data: shiftChangeRequest,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );

  // Cancel shift change request
  fastify.put(
    '/:id/cancel',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Change Management'],
        summary: 'Cancel shift change request',
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const userId = request.user!._id instanceof Types.ObjectId
          ? request.user!._id
          : new Types.ObjectId(request.user!._id);
        const result = await request.container!.shiftChangeService.cancel(id, userId);
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
    }
  );
};

