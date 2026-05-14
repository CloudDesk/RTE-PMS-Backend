import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { Types } from 'mongoose';

export const shiftRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Get all shifts
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Get all shifts',
        description: 'Get paginated list of shifts with optional filters',
        querystring: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Search by shift name or code'
            },
            isActive: {
              type: 'boolean',
              description: 'Filter by active status'
            },
            role: {
              type: 'string',
              description: 'Filter by role ID'
            },
            validOn: {
              type: 'string',
              format: 'date',
              description: 'Filter shifts valid on this date'
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
                    code: { type: 'string' },
                    startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                    endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                    shiftWindowStart: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                    shiftWindowEnd: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                    applicableForRoles: { type: 'array', items: { type: 'string' } },
                    validFrom: { type: 'string', format: 'date-time' },
                    validTill: { type: 'string', format: 'date-time', nullable: true },
                    description: { type: 'string' },
                    graceTimeInMinutes: { type: 'number', minimum: 0, maximum: 60 }
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
        const result = await request.container!.shiftService.findAllShifts(request.query as any);
        return reply.send({
          success: true,
          data: result.shifts,
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

  // Create shift
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Create a new shift',
        description: 'Create a new shift with the given details',
        body: {
          type: 'object',
          required: [
            'name',
            'code',
            'startTime',
            'endTime',
            'shiftWindowStart',
            'shiftWindowEnd',
            'validFrom'
          ],
          properties: {
            name: {
              type: 'string',
              maxLength: 100,
              description: 'Shift name'
            },
            code: {
              type: 'string',
              maxLength: 20,
              description: 'Unique shift code'
            },
            startTime: {
              type: 'string',
              pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
              description: 'Shift start time in UTC (HH:mm format)'
            },
            endTime: {
              type: 'string',
              pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
              description: 'Shift end time in UTC (HH:mm format)'
            },
            shiftWindowStart: {
              type: 'string',
              pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
              description: 'Window start time in UTC (HH:mm format) - earliest allowed check-in time'
            },
            shiftWindowEnd: {
              type: 'string',
              pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
              description: 'Window end time in UTC (HH:mm format) - latest allowed check-out time'
            },
            applicableForRoles: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of role IDs this shift applies to'
            },
            validFrom: {
              type: 'string',
              format: 'date-time',
              description: 'Start date in UTC (YYYY-MM-DD format)'
            },
            validTill: {
              type: 'string',
              format: 'date-time',
              description: 'End date in UTC (YYYY-MM-DD format), if applicable'
            },
            description: {
              type: 'string',
              description: 'Optional shift description'
            },
            graceTimeInMinutes: {
              type: 'number',
              minimum: 0,
              maximum: 60,
              description: 'Grace period in minutes for late entry'
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
                  startTime: { type: 'string', description: 'UTC time HH:mm' },
                  endTime: { type: 'string', description: 'UTC time HH:mm' },
                  shiftWindowStart: { type: 'string', description: 'UTC time HH:mm' },
                  shiftWindowEnd: { type: 'string', description: 'UTC time HH:mm' },
                  applicableForRoles: { type: 'array', items: { type: 'string' } },
                  validFrom: { type: 'string', format: 'date-time', description: 'UTC date' },
                  validTill: { type: 'string', format: 'date-time', description: 'UTC date', nullable: true },
                  description: { type: 'string' },
                  graceTimeInMinutes: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const shift = await request.container!.shiftService.createShift(request.body as any);
        return reply.status(201).send({
          success: true,
          data: shift,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  //update shift
  fastify.put(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Update a shift',
        description: 'Update a shift with the given details',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Shift ID' }
          }
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 100 },
            startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
            endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
            shiftWindowStart: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
            shiftWindowEnd: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
            applicableForRoles: { type: 'array', items: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
            validTill: { type: 'string', format: 'date-time', nullable: true },
            description: { type: 'string' },
            graceTimeInMinutes: { type: 'number', minimum: 0, maximum: 60 },
            isActive: { type: 'boolean' }
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
                  code: { type: 'string' },
                  startTime: { type: 'string' },
                  endTime: { type: 'string' },
                  shiftWindowStart: { type: 'string' },
                  shiftWindowEnd: { type: 'string' },
                  applicableForRoles: { type: 'array', items: { type: 'string' } },
                  validFrom: { type: 'string', format: 'date-time' },
                  validTill: { type: 'string', format: 'date-time', nullable: true },
                  description: { type: 'string' },
                  graceTimeInMinutes: { type: 'number' },
                  isActive: { type: 'boolean' }
                }
              }
            }
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const shift = await request.container!.shiftService.updateShift(id, request.body as any);
        return reply.send({
          success: true,
          data: shift,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Assign shift
  fastify.post(
    '/:shiftId/assign',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Bulk assign/remove users to/from shift',
        description: 'Add or remove multiple users from a shift assignment',
        params: {
          type: 'object',
          required: ['shiftId'],
          properties: {
            shiftId: {
              type: 'string',
              description: 'ID of the shift to assign'
            }
          }
        },
        body: {
          type: 'object',
          required: ['addUserIds', 'removeUserIds', 'startDate', 'shiftCode', 'weekends'],
          properties: {
            addUserIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of user IDs to assign to the shift'
            },
            removeUserIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of user IDs to remove from the shift'
            },
            shiftCode: {
              type: 'string',
              description: 'Shift code to assign'
            },
            startDate: {
              type: 'string',
              format: 'date-time',
              description: 'Assignment start date in UTC'
            },
            endDate: {
              type: 'string',
              format: 'date-time',
              description: 'Optional assignment end date in UTC'
            },
            weekends: {
              type: 'array',
              items: { type: 'number' },
              description: 'Array of weekend days (0-6) to assign'
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
                  message: { type: 'string' },
                  addedCount: { type: 'number' },
                  removedCount: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        console.log(request.params, "0,req param ")
        const { shiftId } = request.params as { shiftId: string };
        console.log(shiftId, "0.1, shiftId")
        const result = await request.container!.shiftService.bulkAssignShift({
          ...(request.body as any),
          shiftId,
          assignedBy: new Types.ObjectId((request.user as any)._id)
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

  // Get current shift
  fastify.get(
    '/current/:userId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Get current shift for a user',
        description: 'Fetch the current shift assigned to a user',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$', description: 'User ID' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                nullable: true,
                properties: {
                  _id: { type: 'string' },
                  userId: { type: 'string' },
                  shiftId: { 
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      name: { type: 'string' },
                      code: { type: 'string' },
                      startTime: { type: 'string' },
                      endTime: { type: 'string' },
                      graceTimeInMinutes: { type: 'number' }
                    }
                  },
                  shiftCode: { type: 'string' },
                  startDate: { type: 'string', format: 'date-time' },
                  endDate: { type: 'string', format: 'date-time', nullable: true },
                  isActive: { type: 'boolean' },
                  status: { type: 'string' },
                  assignedBy: { type: 'string' },
                  weekendDays: { type: 'array', items: { type: 'number' } },
                  assignedAt: { type: 'string', format: 'date-time' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      console.log("get current shift")
      let { userId } = request.params as { userId: string };
      try {
        const shift = await request.container!.shiftService.getCurrentShift(new Types.ObjectId(userId));
        console.log(shift, "getCurrentShift result")
        return reply.send({
          success: true,
          data: shift,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // get Upcoming shifts
  fastify.get(
    '/upcoming-shifts/:userId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Get upcoming shifts for a user',
        description: 'Fetch upcoming shifts assigned to a user',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$', description: 'User ID' }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {} // Allow any type (object or null)
            },
            required: ['success']
          }
        }
      }
    },
    async (request, reply) => {
      console.log(request, "request.user")
      console.log(request.params, "request.params")
      let { userId } = request.params as { userId: string };
      console.log(userId, "request userId")
      try {
        let result = await request.container!.shiftService.getUpcomingShift(new Types.ObjectId(userId));
        console.log(result, "getUpcomingShift result")
        reply.send({ success: true, data: result });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // get Past shifts
  fastify.get(
    '/past-shifts/:userId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Get past shifts for a user',
        description: 'Fetch past shifts assigned to a user',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$', description: 'User ID' }
          }
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
                    shiftId: { 
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        code: { type: 'string' },
                        startTime: { type: 'string' },
                        endTime: { type: 'string' },
                        graceTimeInMinutes: { type: 'number' }
                      }
                    },
                    shiftCode: { type: 'string' },
                    startDate: { type: 'string', format: 'date-time' },
                    endDate: { type: 'string', format: 'date-time', nullable: true },
                    isActive: { type: 'boolean' },
                    status: { type: 'string' },
                    assignedBy: { type: 'string' },
                    weekendDays: { type: 'array', items: { type: 'number' } },
                    assignedAt: { type: 'string', format: 'date-time' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      console.log(request, "request.user")
      console.log(request.params, "request.params")
      let { userId } = request.params as { userId: string };
      console.log(userId, "request userId")
      try {
        let result = await request.container!.shiftService.getPastShift(new Types.ObjectId(userId));
        console.log(result, "getPastShift result")
        reply.send({ success: true, data: result });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // update shift assignments
  fastify.put('/shift-assignment/:shiftAssignmentId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Update Shift Assignment',
        description: 'Update shift assignment for a user',
        params: {
          type: 'object',
          required: ['shiftAssignmentId'],
          properties: {
            shiftAssignmentId: {
              type: 'string',
              description: 'ID of shiftAssignment to update'
            }
          }
        },
        body: {
          type: 'object',
          required: ['shiftId', 'startDate', 'shiftCode'],
          properties: {
            shiftId: {
              type: 'string',
              description: 'ID of the shift to assign'
            },
            shiftCode: {
              type: 'string',
              description: 'Shift code to assign'
            },
            startDate: {
              type: 'string',
              format: 'date-time',
              description: 'Assignment start date in UTC'
            },
            endDate: {
              type: 'string',
              format: 'date-time',
              description: 'Optional assignment end date in UTC',
              nullable: true
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
                  message: { type: 'string' },
                  addedCount: { type: 'number' },
                  removedCount: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { shiftAssignmentId } = request.params as { shiftAssignmentId: string };

        const shift = await request.container!.shiftService.bulkUpdateShift({
          ...(request.body as any),
          shiftAssignmentId: new Types.ObjectId(shiftAssignmentId),
          modifiedBy: new Types.ObjectId((request.user as any)._id),
        });
        console.log(shift, "bulkUpdateShift result")
        return reply.send({
          success: true,
          data: shift,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  //delete shift assignment
  fastify.delete<{
    Params: { assignmentId: string };
  }>(
    '/shift-assignment/:assignmentId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Delete shift assignment',
        description: 'Delete shift assignment and clear user shift data',
        params: {
          type: 'object',
          required: ['assignmentId'],
          properties: {
            assignmentId: {
              type: 'string',
              description: 'Shift assignment ID to delete'
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
                  success: { type: 'boolean' },
                  affectedUsers: { type: 'number' }
                }
              }
            }
          },
          400: {
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
      }
    },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params;
        const result = await request.container!.shiftService.deleteShiftAssignment(assignmentId);

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

  //get shift assignment by userId and date range
  fastify.get<{
    Params: { userId: string };
    Querystring: { startDate: string; endDate?: string };
  }>(
    '/shift-assignments/:userId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: 'Fetch shift assignments by userId and date range',
        description: 'Fetch shift assignments for a user within a specified date range and return weekend days with day names.',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', description: 'User ID to fetch shift assignments for' }
          }
        },
        querystring: {
          type: 'object',
          required: ['startDate'],
          properties: {
            startDate: { type: 'string', format: 'date', description: 'Start date in YYYY-MM-DD format' },
            endDate: { type: 'string', format: 'date', description: 'End date in YYYY-MM-DD format (optional)' }
          }
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
                    shiftAssignmentId: { type: 'string' },
                    shiftCode: { type: 'string' },
                    startDate: { type: 'string', format: 'date-time' },
                    endDate: { type: 'string', format: 'date-time', nullable: true },
                    weekendDays: {
                      type: 'array',
                      items: { type: 'number' }
                    }
                  }
                }
              }
            }
          },
          400: {
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
      }
    },
    async (request, reply) => {
      try {
        const { userId } = request.params;
        const result = await request.container!.shiftService.getShiftAssignmentByUserId(userId, request.query as any);

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


  fastify.put(
    '/update-shift-assignments/:userId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Shift Management'],
        summary: "Update shift assignments for a user",
        description: 'Update the current and upcoming shift assignments for a user based on the provided logic',
        params: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID' },
          },
          required: ['userId'],
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
                  currentShiftAssignmentData: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      shiftAssignmentId: { type: 'string' },
                      startDate: { type: 'string', format: 'date-time' },
                      endDate: { type: 'string', format: 'date-time', nullable: true },
                      shiftCode: { type: 'string' },
                      assignedBy: { type: 'string' },
                      assignedAt: { type: 'string', format: 'date-time' },
                      isActive: { type: 'boolean' },
                    },
                  },
                  upcomingShiftAssignmentData: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      shiftAssignmentId: { type: 'string' },
                      startDate: { type: 'string', format: 'date-time' },
                      endDate: { type: 'string', format: 'date-time', nullable: true },
                      shiftCode: { type: 'string' },
                      assignedBy: { type: 'string' },
                      assignedAt: { type: 'string', format: 'date-time' },
                      isActive: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'object', properties: { message: { type: 'string' } } },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };
        const updatedUser = await request.container!.shiftService.updateShiftAssignments(new Types.ObjectId(userId));
        console.log(updatedUser, "updatedUser");
        return reply.send({
          success: true,
          data: updatedUser,
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