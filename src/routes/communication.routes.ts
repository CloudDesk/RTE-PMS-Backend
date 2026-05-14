import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { parseMultipartForm } from '../utilis/parseMultiPartForm';
import { authenticate } from '../middleware/auth';

export const communicationRoutes = async (fastify: FastifyInstance) => {
    // 1. Send Manual Greeting/Event
    fastify.post('/send-greeting', {
        preHandler: [authenticate],
        schema: {
            response: {
                200: Type.Object({
                    success: Type.Boolean(),
                    data: Type.Object({
                        success: Type.Boolean(),
                        socialEventId: Type.String(),
                        total: Type.Number(),
                        results: Type.Array(Type.Any())
                    })
                })
            }
        },
        handler: async (request, _reply) => {
            const { communicationService } = request.container!;
            const { body, files } = await parseMultipartForm(request);

            // Handle employeeIds if sent as a JSON string or individual parts
            let employeeIds = body.employeeIds;
            if (typeof employeeIds === 'string') {
                try {
                    employeeIds = JSON.parse(employeeIds);
                } catch {
                    employeeIds = [employeeIds];
                }
            }

            const result = await communicationService.sendPersonalizedGreeting({
                employeeIds,
                type: body.type,
                subject: body.subject,
                message: body.message,
                eventDate: body.eventDate,
                files,
                adminId: (request.user as any)._id,
                socialEventId: body.socialEventId
            });
            return { success: true, data: result };
        }
    });

    // 2. Get Social Wall Events
    fastify.get('/social-wall', {
        preHandler: [authenticate],
        schema: {
            querystring: Type.Object({
                limit: Type.Optional(Type.Number({ default: 10 })),
                offset: Type.Optional(Type.Number({ default: 0 }))
            }),
            response: {
                200: Type.Array(Type.Any())
            }
        },
        handler: async (request, _reply) => {
            const { communicationService } = request.container!;
            const events = await communicationService.getSocialWall(request.query as any);
            return events;
        }
    });

    // 3. Get Communication Logs (Manual historical dispatches)
    fastify.get('/logs', {
        preHandler: [authenticate],
        schema: {
            querystring: Type.Object({
                limit: Type.Optional(Type.Number({ default: 10 })),
                page: Type.Optional(Type.Number({ default: 1 })),
                search: Type.Optional(Type.String()),
                month: Type.Optional(Type.Number()),
                year: Type.Optional(Type.Number())
            }),
            response: {
                200: Type.Object({
                    success: Type.Optional(Type.Boolean()),
                    data: Type.Object({
                        data: Type.Array(Type.Any()),
                        meta: Type.Object({
                            total: Type.Number(),
                            page: Type.Number(),
                            limit: Type.Number(),
                            totalPages: Type.Number()
                        })
                    })
                })
            }
        },
        handler: async (request, _reply) => {
            const { communicationService } = request.container!;
            const events = await communicationService.getCommunicationLogs(request.query as any);
            return { success: true, data: events };
        }
    });

    // 4. Trigger Milestones (Admin only / Manual trigger)
    fastify.post('/trigger-milestones', {
        preHandler: [authenticate],
        schema: {
            response: {
                200: Type.Object({
                    success: Type.Boolean(),
                    data: Type.Object({
                        birthdays: Type.Number(),
                        anniversaries: Type.Number()
                    })
                })
            }
        },
        handler: async (request, _reply) => {
            const { communicationService } = request.container!;
            const stats = await communicationService.processDailyMilestones();
            return { success: true, data: stats };
        }
    });
};
