import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { Types } from 'mongoose';

export const trainingRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Get all shifts
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Traning Management'],
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
                    trainingWindowStart: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                    trainingWindowEnd: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                    applicableForRoles: { type: 'array', items: { type: 'string' } },
                    validFrom: { type: 'string', format: 'date-time' },
                    validTill: { type: 'string', format: 'date-time', nullable: true },
                    description: { type: 'string' },
                    trainer: { 
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string' }
                      }
                    },
                    location: { type: 'string' },
                    maxParticipants: { type: 'number' },
                    prerequisites: { 
                      type: 'array', 
                      items: { type: 'string' }
                    },
                    materials: { 
                      type: 'array', 
                      items: { type: 'string' }
                    },
                    objectives: { 
                      type: 'array', 
                      items: { type: 'string' }
                    },
                    assessmentCriteria: { 
                      type: 'array', 
                      items: { type: 'string' }
                    },
                    isActive: { type: 'boolean' }
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
        const result = await request.container!.trainingService.findAllTrainings(request.query as any);
        return reply.send({
          success: true,
          data: result.trainings,
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

  // Get training by ID
  fastify.get(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Traning Management'],
        summary: 'Get training by ID',
        description: 'Get detailed information about a specific training',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { 
              type: 'string',
              description: 'Training ID'
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
                  code: { type: 'string' },
                  startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                  endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                  trainingWindowStart: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                  trainingWindowEnd: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                  applicableForRoles: { type: 'array', items: { type: 'string' } },
                  validFrom: { type: 'string', format: 'date-time' },
                  validTill: { type: 'string', format: 'date-time', nullable: true },
                  description: { type: 'string' },
                  trainer: { 
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' }
                    }
                  },
                  location: { type: 'string' },
                  maxParticipants: { type: 'number' },
                  prerequisites: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  materials: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  objectives: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  assessmentCriteria: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  isActive: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const training = await request.container!.trainingService.findTrainingById(id);
        
        if (!training) {
          return reply.status(404).send({
            success: false,
            error: { message: 'Training not found' }
          });
        }

        return reply.send({
          success: true,
          data: training
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Create shift
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Traning Management'],
        summary: 'Create a new training',
        description: 'Create a new training with the given details',
        body: {
          type: 'object',
          required: [
            'name',
            'code',
            'startTime',
            'endTime',
            'trainingWindowStart',
            'trainingWindowEnd',
            'validFrom'
          ],
          properties: {
            name: { 
              type: 'string', 
              maxLength: 100,
              description: 'Traning name'
            },
            code: { 
              type: 'string', 
              maxLength: 20,
              description: 'Unique shift code'
            },
            startTime: { 
              type: 'string', 
              pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
              description: 'Traning start time in UTC (HH:mm format)'
            },
            endTime: { 
              type: 'string', 
              pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
              description: 'Traning end time in UTC (HH:mm format)'
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
                  trainingWindowStart: { type: 'string', description: 'UTC time HH:mm' },
                  trainingWindowEnd: { type: 'string', description: 'UTC time HH:mm' },
                  applicableForRoles: { type: 'array', items: { type: 'string' } },
                  validFrom: { type: 'string', format: 'date-time', description: 'UTC date' },
                  validTill: { type: 'string', format: 'date-time', description: 'UTC date', nullable: true },
                  description: { type: 'string' },
                  graceTimeInMinutes: { type: 'number' },
                  trainer: { 
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' }
                    }
                  },
                  location: { type: 'string' },
                  maxParticipants: { type: 'number' },
                  prerequisites: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  materials: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  objectives: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  assessmentCriteria: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  isActive: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const training = await request.container!.trainingService.createTraining(request.body as any);
        return reply.status(201).send({
          success: true,
          data: training,
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
        tags: ['Traning Management'],
        summary: 'Update a training',
        description: 'Update a training with the given details',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { 
              type: 'string',
              description: 'Training ID'
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
                  code: { type: 'string' },
                  startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                  endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                  trainingWindowStart: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                  trainingWindowEnd: { type: 'string', pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$' },
                  applicableForRoles: { type: 'array', items: { type: 'string' } },
                  validFrom: { type: 'string', format: 'date-time' },
                  validTill: { type: 'string', format: 'date-time', nullable: true },
                  description: { type: 'string' },
                  trainer: { 
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' }
                    }
                  },
                  location: { type: 'string' },
                  maxParticipants: { type: 'number' },
                  prerequisites: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  materials: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  objectives: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  assessmentCriteria: { 
                    type: 'array', 
                    items: { type: 'string' }
                  },
                  isActive: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const training = await request.container!.trainingService.updateTraining(id, request.body as any);
        return reply.send({
          success: true,
          data: training,
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
    '/:trainingId/assign',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Traning Management'],
        summary: 'Bulk assign/remove users to/from training',
        description: 'Add or remove multiple users from a training assignment',
        params: {
          type: 'object',
          required: ['trainingId'],
          properties: {
            trainingId: { 
              type: 'string',
              description: 'ID of the training to assign'
            }
          }
        },
        body: {
          type: 'object',
          required: ['addUserIds', 'removeUserIds', 'startDate', 'trainingCode'],
          properties: {
            addUserIds: { 
              type: 'array',
              items: { type: 'string' },
              description: 'Array of user IDs to assign to the training'
            },
            removeUserIds: { 
              type: 'array',
              items: { type: 'string' },
              description: 'Array of user IDs to remove from the training'
            },
            trainingCode: { 
              type: 'string',
              description: 'Traning code to assign'
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
        const { trainingId } = request.params as { trainingId: string };
        const result = await request.container!.trainingService.bulkAssignTraining({
          ...(request.body as any),
          trainingId,
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
    '/current',
    {
      onRequest: [authenticate],
    },
    async (request, reply) => {
      try {
        const training = await request.container!.trainingService.getCurrentTrainings(new Types.ObjectId((request.user as any)._id));
        return reply.send({
          success: true,
          data: training,
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