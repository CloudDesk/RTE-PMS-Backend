import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';

export const trainingAttendanceRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Process swipe
  fastify.post(
    '/swipe',
    {
      schema: {
        tags: ['Training Attendance'],
        summary: 'Process a training swipe',
        description: 'Process an unauthenticated training swipe and record attendance based on training window in UTC',
        body: {
          type: 'object',
          required: ['biometricId'],
          properties: {
            biometricId: { 
              type: 'string',
              description: 'Biometric ID of the user'
            },
            timestamp: { 
              type: 'string', 
              format: 'date-time',
              description: 'Optional timestamp of the swipe in UTC (ISO format). Defaults to current UTC time if not provided.'
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
                  
                  swipeTime: { 
                    type: 'string', 
                    format: 'date-time',
                    description: 'UTC timestamp'
                  },
                  isWithinWindow: { type: 'boolean' },
                  isLateEntry: { type: 'boolean' },
                  isEarlyExit: { type: 'boolean' }
                  
                }
              }
            }
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
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
        const { biometricId, timestamp = new Date().toISOString() } = request.body as any;
        const result = await request.container!.trainingAttendanceService.processSwipe({
          biometricId,
          timestamp: new Date(timestamp)
        });
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Get attendance status
  fastify.get(
    '/status/:userId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Biometric Attendance'],
        summary: 'Get attendance status for a user',
        description: 'Get attendance status for a specific user on a given date',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { 
              type: 'string',
              description: 'User ID to get attendance status for'
            }
          }
        },
        querystring: {
          type: 'object',
          required: ['date'],
          properties: {
            date: { 
              type: 'string', 
              format: 'date',
              description: 'Date in UTC (YYYY-MM-DD)'
            }
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
                    trainingCode: { type: 'string' },
                    status: { 
                      type: 'string',
                      enum: ['incomplete', 'complete', 'duplicate_swipes', 'missing_checkout']
                    },
                    overtime: { 
                      type: 'string',
                      description: 'Overtime duration in HH:mm:ss format'
                    },
                    shortTime: { 
                      type: 'string',
                      description: 'Short time duration in HH:mm:ss format'
                    },
                    firstSwipe: { 
                      type: 'string', 
                      format: 'date-time',
                      description: 'UTC timestamp',
                      nullable: true
                    },
                    lastSwipe: { 
                      type: 'string', 
                      format: 'date-time',
                      description: 'UTC timestamp',
                      nullable: true
                    }
                  }
                }
              }
            }
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
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
        const result = await request.container!.trainingAttendanceService.getAttendanceStatus(
          (request.params as any).userId,
          new Date((request.query as any).date)
        );
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Get attendance records
  fastify.post(
    '/records',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Biometric Attendance'],
        summary: 'Get attendance records',
        description: 'Get attendance records for specified date range and users. ',
        body: {
          type: 'object',
          required: ['startDate', 'endDate'],
          properties: {
            startDate: { 
              type: 'string', 
              format: 'date-time',
              description: 'Start date in UTC (YYYY-MM-DDTHH:mm:ssZ)'
            },
            endDate: { 
              type: 'string', 
              format: 'date-time',
              description: 'End date in UTC (YYYY-MM-DDTHH:mm:ssZ)'
            },
            userIds: { 
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of user IDs to filter records'
            },
            page: { 
              type: 'number', 
              minimum: 1, 
              default: 1,
              description: 'Page number for pagination'
            },
            limit: { 
              type: 'number', 
              minimum: 1, 
              maximum: 100, 
              default: 10,
              description: 'Number of records per page'
            }
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
                    userId: { type: 'string' },
                    userName: { type: 'string' },
                    records: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          trainingDay: { 
                            type: 'string', 
                            format: 'date-time',
                            description: 'UTC date'
                          },
                          trainingCode: { type: 'string' },
                          status: { 
                            type: 'string',
                            enum: ['incomplete', 'complete', 'duplicate_swipes', 'missing_checkout']
                          },
                          overtime: { 
                            type: 'string',
                            description: 'Overtime duration in HH:mm:ss format'
                          },
                          shortTime: { 
                            type: 'string',
                            description: 'Short time duration in HH:mm:ss format'
                          },
                          firstSwipe: { 
                            type: 'string', 
                            format: 'date-time',
                            description: 'UTC timestamp',
                            nullable: true
                          },
                          lastSwipe: { 
                            type: 'string', 
                            format: 'date-time',
                            description: 'UTC timestamp',
                            nullable: true
                          },
                          attendanceStatus: {
                            type: 'array',
                            items: {
                              type: 'string',
                              enum: ['Late', 'On-Time', 'Early-Exit', 'Absent']
                            }
                          }
                        }
                      }
                    },
                    summary: {
                      type: 'object',
                      properties: {
                        totalDays: { type: 'number' },
                        lateDays: { type: 'number' },
                        presentDays: { type: 'number' },
                        regularisedDays: { type: 'number' },
                        leaveDays: { type: 'number' }
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
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
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
        const result = await request.container!.trainingAttendanceService.getAttendanceRecords({
          ...(request.body as any)
        });
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  fastify.post(
    '/records/all',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Biometric Attendance'],
        summary: 'Get attendance records',
        description: 'Get attendance records for specified date range and users. ',
        body: {
          type: 'object',
          required: ['startDate', 'endDate'],
          properties: {
            startDate: { 
              type: 'string', 
              format: 'date-time',
              description: 'Start date in UTC (YYYY-MM-DDTHH:mm:ssZ)'
            },
            endDate: { 
              type: 'string', 
              format: 'date-time',
              description: 'End date in UTC (YYYY-MM-DDTHH:mm:ssZ)'
            },
            page: { 
              type: 'number', 
              minimum: 1, 
              default: 1,
              description: 'Page number for pagination'
            },
            limit: { 
              type: 'number', 
              minimum: 1, 
              maximum: 100, 
              default: 10,
              description: 'Number of records per page'
            }
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
                    userId: { type: 'string' },
                    userName: { type: 'string' },
                    records: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          trainingDay: { 
                            type: 'string', 
                            format: 'date-time',
                            description: 'UTC date'
                          },
                          trainingCode: { type: 'string' },
                          status: { 
                            type: 'string',
                            enum: ['incomplete', 'complete', 'duplicate_swipes', 'missing_checkout']
                          },
                          overtime: { 
                            type: 'string',
                            description: 'Overtime duration in HH:mm:ss format'
                          },
                          shortTime: { 
                            type: 'string',
                            description: 'Short time duration in HH:mm:ss format'
                          },
                          firstSwipe: { 
                            type: 'string', 
                            format: 'date-time',
                            description: 'UTC timestamp',
                            nullable: true
                          },
                          lastSwipe: { 
                            type: 'string', 
                            format: 'date-time',
                            description: 'UTC timestamp',
                            nullable: true
                          },
                          attendanceStatus: {
                            type: 'array',
                            items: {
                              type: 'string',
                              enum: ['Late', 'On-Time', 'Early-Exit', 'Absent']
                            }
                          }
                        }
                      }
                    },
                    summary: {
                      type: 'object',
                      properties: {
                        totalDays: { type: 'number' },
                        lateDays: { type: 'number' },
                        presentDays: { type: 'number' },
                        regularisedDays: { type: 'number' },
                        leaveDays: { type: 'number' }
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
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
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
        const userResult = await request.container!.userService.findAll({
          active: true
        });
        const userIds = userResult.users.map((user: any) => user._id);
        const result = await request.container!.trainingAttendanceService.getAttendanceRecords({
          ...(request.body as any),
          userIds
        });
        return reply.send(result);
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );
}; 