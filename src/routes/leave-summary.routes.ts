import { FastifyInstance } from 'fastify';
import { Types } from 'mongoose';
import { authenticate } from '../middleware/auth';

const getLeaveSummarySchema = {
  tags: ['Leave Summary'],
  summary: 'Get leave summary for logged-in user',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      year: {
        type: 'number',
        description: 'Year for leave summary',
        default: new Date().getFullYear(),
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
            annual: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
                leaveRequests: { type: 'array', items: { type: 'string' } },
              },
            },
            sick: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
                leaveRequests: { type: 'array', items: { type: 'string' } },
              },
            },
            compOff: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
                leaveRequests: { type: 'array', items: { type: 'string' } },
              },
            },
            lossOfPay: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
                leaveRequests: { type: 'array', items: { type: 'string' } },
              },
            },
            otherPaid: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
                leaveRequests: { type: 'array', items: { type: 'string' } },
              },
            },
            otherUnpaid: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
                leaveRequests: { type: 'array', items: { type: 'string' } },
              },
            },
            maternity: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
                leaveRequests: { type: 'array', items: { type: 'string' } },
              },
            },
            workFromHome: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
                leaveRequests: { type: 'array', items: { type: 'string' } },
              },
            },
            restricted_holiday: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
                leaveRequests: { type: 'array', items: { type: 'string' } },
              },
            },
            editHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  editedBy: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  field: { type: 'string' },
                  oldValue: { type: 'number' },
                  newValue: { type: 'number' },
                  editedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
  },
};

const getMultipleUsersSummarySchema = {
  tags: ['Leave Summary'],
  summary: 'Get leave summaries for multiple users',
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
        description: 'Year for leave summary',
        default: new Date().getFullYear(),
      },
    },
    required: ['userIds'],
  },
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: {
            type: 'object',
            properties: {
              _id: { type: 'string' },
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
          year: { type: 'number' },
          annual: {
            type: 'object',
            properties: {
              alloted: { type: 'number' },
              availed: { type: 'number' },
              remaining: { type: 'number' },
              leaveRequests: { type: 'array', items: { type: 'string' } },
            },
          },
          sick: {
            type: 'object',
            properties: {
              alloted: { type: 'number' },
              availed: { type: 'number' },
              remaining: { type: 'number' },
              leaveRequests: { type: 'array', items: { type: 'string' } },
            },
          },
          // ... other leave types similar to above
        },
      },
    },
    403: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

const updateLeaveAllotmentSchema = {
  tags: ['Leave Summary'],
  summary: 'Update leave allotments for a user',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['userId', 'year'],
    properties: {
      userId: {
        type: 'string',
        description: 'User ID to update leave allotments for',
      },
      year: {
        type: 'number',
        description: 'Year for leave allotments',
        default: new Date().getFullYear(),
      },

      annual: {
        type: 'number',
        minimum: 0,
        description: 'Annual leave days',
      },
      sick: {
        type: 'number',
        minimum: 0,
        description: 'Sick leave days',
      },
      otherPaid: {
        type: 'number',
        minimum: 0,
        description: 'Other paid leave days',
      },
      otherUnpaid: {
        type: 'number',
        minimum: 0,
        description: 'Other unpaid leave days',
      },
      compOff: {
        type: 'number',
        minimum: 0,
        description: 'Compensatory off days',
      },
      maternity: {
        type: 'number',
        minimum: 0,
        description: 'Maternity leave days',
      },
      workFromHome: {
        type: 'number',
        minimum: 0,
        description: 'Work from home days',
      },
      restricted_holiday: {
        type: 'number',
        minimum: 0,
        description: 'Restricted holiday (optional holiday) allocation count per year',
      }
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
            annual: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
              },
            },
            sick: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
              },
            },
            otherPaid: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
              },
            },
            otherUnpaid: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
              },
            },
            workFromHome: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
              },
            },
            restricted_holiday: {
              type: 'object',
              properties: {
                alloted: { type: 'number' },
                availed: { type: 'number' },
                remaining: { type: 'number' },
              },
            },
            editHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  editedBy: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  field: { type: 'string' },
                  oldValue: { type: 'number' },
                  newValue: { type: 'number' },
                  editedAt: { type: 'string', format: 'date-time' },
                },
              },
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
    403: {
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
};

export async function leaveSummaryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/summary/:userId',
    {
      schema: getLeaveSummarySchema,
      preHandler: [authenticate],
    },
    async (request, reply) => {
      console.log('test');
      const { year = new Date().getFullYear() } = request.query as { year?: number };
      const userId = new Types.ObjectId((request.params as any).userId as string);
      console.log(
        userId, 'userId'
      );
      // Use formatted summary that returns country-specific fields
      const summary = await request.container!.leaveSummaryService.getFormattedLeaveSummary(userId, year);
      return reply.send({
        success: true,
        data: summary,
      });
    },
  );

  fastify.get(
    '/leave-summaries',
    {
      schema: getMultipleUsersSummarySchema,
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { userIds, year = new Date().getFullYear() } = request.query as {
        userIds: string;
        year?: number;
      };

      const userIdList = userIds.split(',').map((id) => new Types.ObjectId(id.trim()));

      const summaries = await request.container!.leaveSummaryService.getAllUserLeaveSummaries(userIdList, year);

      return reply.send(summaries);
    },
  );

  fastify.post(
    '/allotments',
    {
      schema: updateLeaveAllotmentSchema,
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const {
          userId,
          year = new Date().getFullYear(),
          annual,
          sick,
          otherPaid,
          otherUnpaid,
          compOff,
          maternity,
          workFromHome,
          restricted_holiday,
        } = request.body as {
          userId: string;
          year: number;
          annual?: number;
          sick?: number;
          otherPaid?: number;
          otherUnpaid?: number;
          compOff?: number;
          maternity?: number;
          workFromHome?: number;
          restricted_holiday?: number;
        };

        const updatedSummary = await request.container!.leaveSummaryService.updateLeaveAllotments(
          new Types.ObjectId(userId),
          year,
          {
            annual,
            sick,
            otherPaid,
            otherUnpaid,
            compOff,
            maternity,
            workFromHome,
            restricted_holiday,
          }
        );

        // Format response to include all leave types including workFromHome and editHistory
        const formattedResponse = {
          userId: updatedSummary.userId,
          year: updatedSummary.year,
          annual: {
            alloted: updatedSummary.annual?.alloted || 0,
            availed: updatedSummary.annual?.availed || 0,
            remaining: updatedSummary.annual?.remaining || 0,
          },
          sick: {
            alloted: updatedSummary.sick?.alloted || 0,
            availed: updatedSummary.sick?.availed || 0,
            remaining: updatedSummary.sick?.remaining || 0,
          },
          compOff: {
            alloted: updatedSummary.compOff?.alloted || 0,
            availed: updatedSummary.compOff?.availed || 0,
            remaining: updatedSummary.compOff?.remaining || 0,
          },
          lossOfPay: {
            alloted: updatedSummary.lossOfPay?.alloted || 0,
            availed: updatedSummary.lossOfPay?.availed || 0,
            remaining: updatedSummary.lossOfPay?.remaining || 0,
          },
          otherPaid: {
            alloted: updatedSummary.otherPaid?.alloted || 0,
            availed: updatedSummary.otherPaid?.availed || 0,
            remaining: updatedSummary.otherPaid?.remaining || 0,
          },
          otherUnpaid: {
            alloted: updatedSummary.otherUnpaid?.alloted || 0,
            availed: updatedSummary.otherUnpaid?.availed || 0,
            remaining: updatedSummary.otherUnpaid?.remaining || 0,
          },
          maternity: {
            alloted: updatedSummary.maternity?.alloted || 0,
            availed: updatedSummary.maternity?.availed || 0,
            remaining: updatedSummary.maternity?.remaining || 0,
          },
          workFromHome: {
            alloted: updatedSummary.workFromHome?.alloted || 0,
            availed: updatedSummary.workFromHome?.availed || 0,
            remaining: updatedSummary.workFromHome?.remaining || 0,
          },
          restricted_holiday: {
            alloted: updatedSummary.restricted_holiday?.alloted || 0,
            availed: updatedSummary.restricted_holiday?.availed || 0,
            remaining: updatedSummary.restricted_holiday?.remaining || 0,
          },
          editHistory: updatedSummary.editHistory || [],
        };

        return reply.send({
          success: true,
          data: formattedResponse,
        });
      } catch (error: any) {
        return reply.status(error.statusCode || 400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // India-specific: Release leaves (monthly/quarterly)
  fastify.post(
    '/release',
    {
      schema: {
        tags: ['Leave Summary'],
        summary: 'Release leaves to employees (India only)',
        description: 'Release leaves on monthly or quarterly basis - adds to existing balance',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['employeeIds', 'releaseType', 'period', 'leaveType', 'daysReleased'],
          properties: {
            employeeIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of employee IDs'
            },
            releaseType: {
              type: 'string',
              enum: ['monthly', 'quarterly', 'annual'],
              description: 'Release type: monthly (1 month), quarterly (3 months), or annual (yearly allocation)'
            },
            period: {
              type: 'object',
              required: ['year'],
              properties: {
                month: { type: 'number', minimum: 1, maximum: 12 },
                quarter: { type: 'number', minimum: 1, maximum: 4 },
                year: { type: 'number' }
              }
            },
            leaveType: {
              type: 'string',
              enum: ['annual', 'sick', 'compOff', 'lossOfPay', 'otherPaid', 'otherUnpaid', 'restricted_holiday']
            },
            daysReleased: {
              type: 'number',
              minimum: 0,
              description: 'Days to release (can be decimal, e.g., 4.5)'
            },
            notes: { type: 'string' }
          }
        }
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { LeaveReleaseService } = await import('../services/leave-release.service');
        const leaveReleaseService = new LeaveReleaseService(request.container!.requestContext);

        const result = await leaveReleaseService.releaseLeaves(request.body as any);

        return reply.send({
          success: true,
          data: result
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Get release history for an employee
  fastify.get(
    '/release-history/:userId',
    {
      schema: {
        tags: ['Leave Summary'],
        summary: 'Get leave release history (India only)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            year: { type: 'number' },
            yearLessThan: { type: 'number', description: 'Filter by years less than or equal to this value (e.g., 2020 for all records from 2020 and earlier)' }
          }
        }
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };
        const { year, yearLessThan } = request.query as { year?: number; yearLessThan?: number };

        const { LeaveReleaseService } = await import('../services/leave-release.service');
        const leaveReleaseService = new LeaveReleaseService(request.container!.requestContext);

        const history = await leaveReleaseService.getReleaseHistory(userId, year, yearLessThan);

        return reply.send({
          success: true,
          data: history
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // India-specific: Carry-forward leaves (year-end)
  fastify.post(
    '/carry-forward',
    {
      schema: {
        tags: ['Leave Summary'],
        summary: 'Process leave carry-forward for employee (India only)',
        description: 'Carry forward specified days from previous year to next year',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['employeeId', 'fromYear', 'toYear', 'leaveType', 'daysCarriedForward'],
          properties: {
            employeeId: { type: 'string' },
            fromYear: { type: 'number' },
            toYear: { type: 'number' },
            leaveType: {
              type: 'string',
              enum: ['annual', 'sick', 'compOff', 'lossOfPay', 'otherPaid', 'otherUnpaid', 'restricted_holiday']
            },
            daysCarriedForward: {
              type: 'number',
              minimum: 0,
              description: 'Days to carry forward (can be decimal)'
            },
            notes: { type: 'string' }
          }
        }
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { LeaveCarryForwardService } = await import('../services/leave-carry-forward.service');
        const carryForwardService = new LeaveCarryForwardService(request.container!.requestContext);

        const result = await carryForwardService.processCarryForward(request.body as any);

        return reply.send({
          success: true,
          data: result
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Batch carry-forward for multiple employees
  fastify.post(
    '/carry-forward/batch',
    {
      schema: {
        tags: ['Leave Summary'],
        summary: 'Batch process leave carry-forward (India only)',
        description: 'Process carry-forward for multiple employees at once',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['employees', 'fromYear', 'toYear'],
          properties: {
            employees: {
              type: 'array',
              items: {
                type: 'object',
                required: ['employeeId', 'leaveType', 'daysCarriedForward'],
                properties: {
                  employeeId: { type: 'string' },
                  leaveType: {
                    type: 'string',
                    enum: ['annual', 'sick', 'compOff', 'lossOfPay', 'otherPaid', 'otherUnpaid', 'restricted_holiday']
                  },
                  daysCarriedForward: { type: 'number', minimum: 0 }
                }
              }
            },
            fromYear: { type: 'number' },
            toYear: { type: 'number' },
            notes: { type: 'string' }
          }
        }
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { LeaveCarryForwardService } = await import('../services/leave-carry-forward.service');
        const carryForwardService = new LeaveCarryForwardService(request.container!.requestContext);

        const result = await carryForwardService.batchProcessCarryForward(request.body as any);

        return reply.send({
          success: true,
          data: result
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Get carry-forward details
  fastify.get(
    '/carry-forward/:userId',
    {
      schema: {
        tags: ['Leave Summary'],
        summary: 'Get carry-forward details (India only)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            fromYear: { type: 'number' },
            toYear: { type: 'number' }
          }
        }
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };
        const { fromYear, toYear } = request.query as { fromYear?: number; toYear?: number };

        const { LeaveCarryForwardService } = await import('../services/leave-carry-forward.service');
        const carryForwardService = new LeaveCarryForwardService(request.container!.requestContext);

        const details = await carryForwardService.getCarryForwardDetails(userId, fromYear, toYear);

        return reply.send({
          success: true,
          data: details
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Get available balance for carry-forward
  fastify.get(
    '/carry-forward-balance/:userId',
    {
      schema: {
        tags: ['Leave Summary'],
        summary: 'Get available balance for carry-forward (India only)',
        description: 'Get remaining leave balance at end of year for carry-forward',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['year'],
          properties: {
            year: { type: 'number' }
          }
        }
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };
        const { year } = request.query as { year: number };

        const { LeaveCarryForwardService } = await import('../services/leave-carry-forward.service');
        const carryForwardService = new LeaveCarryForwardService(request.container!.requestContext);

        const balance = await carryForwardService.getAvailableBalanceForCarryForward(userId, year);

        return reply.send({
          success: true,
          data: balance
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Admin: Get all leave releases with employee details
  fastify.get(
    '/releases',
    {
      schema: {
        tags: ['Leave Summary'],
        summary: 'Get all leave releases with employee details (Admin only)',
        description: 'List all leave releases across all employees with filtering options',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            employeeId: { type: 'string', description: 'Filter by employee ID' },
            search: { type: 'string', description: 'Search by employee name, email, employee code, leave type, release type, or notes' },
            year: { type: 'number', description: 'Filter by exact year. Takes precedence over yearLessThan if both are provided.' },
            yearLessThan: { type: 'number', description: 'Filter by years less than or equal to this value (e.g., 2021 returns all records from 2021 and earlier). Useful for viewing older year data.' },
            leaveType: {
              type: 'string',
              enum: ['annual', 'sick', 'compOff', 'lossOfPay', 'otherPaid', 'otherUnpaid', 'restricted_holiday'],
              description: 'Filter by leave type'
            },
            releaseType: {
              type: 'string',
              enum: ['monthly', 'quarterly', 'carryforward'],
              description: 'Filter by release type'
            },
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50, description: 'Items per page' }
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
                  releases: { type: 'array' },
                  total: { type: 'number' },
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  totalPages: { type: 'number' }
                }
              }
            }
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        // Check if user is admin
        const userRole = (request.user as any)?.role?.toLowerCase();
        if (userRole !== 'admin' && userRole !== 'superadmin') {
          return reply.status(403).send({
            success: false,
            error: { message: 'Access denied. Admin role required.' }
          });
        }

        const queryParams = request.query as any;
        const employeeId = queryParams.employeeId || undefined;
        const year = queryParams.year ? parseInt(queryParams.year, 10) : undefined;
        const yearLessThan = queryParams.yearLessThan ? parseInt(queryParams.yearLessThan, 10) : undefined;
        const leaveType = queryParams.leaveType || undefined;
        const releaseType = queryParams.releaseType || undefined;
        const search = queryParams.search || undefined;
        const page = queryParams.page ? parseInt(queryParams.page, 10) : 1;
        const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 50;

        const { LeaveReleaseService } = await import('../services/leave-release.service');
        const leaveReleaseService = new LeaveReleaseService(request.container!.requestContext);

        const result = await leaveReleaseService.getAllReleases({
          employeeId,
          year,
          yearLessThan,
          leaveType,
          releaseType,
          search,
          page,
          limit
        });

        return reply.send({
          success: true,
          data: result
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Admin: Get all carry-forwards with employee details
  fastify.get(
    '/carry-forwards',
    {
      schema: {
        tags: ['Leave Summary'],
        summary: 'Get all carry-forwards with employee details (Admin only)',
        description: 'List all leave carry-forwards across all employees with filtering options',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            employeeId: { type: 'string', description: 'Filter by employee ID' },
            search: { type: 'string', description: 'Search by employee name, email, employee code, leave type, notes, or year' },
            fromYear: { type: 'number', description: 'Filter by exact from year. Takes precedence over yearLessThan if both are provided.' },
            toYear: { type: 'number', description: 'Filter by to year' },
            yearLessThan: { type: 'number', description: 'Filter by from years less than or equal to this value (e.g., 2021 returns all carry-forwards where fromYear <= 2021 - includes 2021, 2020, 2019, and all earlier years). Useful for viewing older year data.' },
            leaveType: {
              type: 'string',
              enum: ['annual', 'sick', 'compOff', 'lossOfPay', 'otherPaid', 'otherUnpaid', 'restricted_holiday'],
              description: 'Filter by leave type'
            },
            page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50, description: 'Items per page' }
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
                  carryForwards: { type: 'array' },
                  total: { type: 'number' },
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  totalPages: { type: 'number' }
                }
              }
            }
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      },
      preHandler: [authenticate],
    },
    async (request, reply) => {
      try {
        // Check if user is admin
        const userRole = (request.user as any)?.role?.toLowerCase();
        if (userRole !== 'admin' && userRole !== 'superadmin') {
          return reply.status(403).send({
            success: false,
            error: { message: 'Access denied. Admin role required.' }
          });
        }

        const queryParams = request.query as any;
        const employeeId = queryParams.employeeId || undefined;
        const fromYear = queryParams.fromYear ? parseInt(queryParams.fromYear, 10) : undefined;
        const toYear = queryParams.toYear ? parseInt(queryParams.toYear, 10) : undefined;
        const yearLessThan = queryParams.yearLessThan ? parseInt(queryParams.yearLessThan, 10) : undefined;
        const leaveType = queryParams.leaveType || undefined;
        const search = queryParams.search || undefined;
        const page = queryParams.page ? parseInt(queryParams.page, 10) : 1;
        const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 50;

        const { LeaveCarryForwardService } = await import('../services/leave-carry-forward.service');
        const carryForwardService = new LeaveCarryForwardService(request.container!.requestContext);

        const result = await carryForwardService.getAllCarryForwards({
          employeeId,
          fromYear,
          toYear,
          yearLessThan,
          leaveType,
          search,
          page,
          limit
        });

        return reply.send({
          success: true,
          data: result
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );
}
