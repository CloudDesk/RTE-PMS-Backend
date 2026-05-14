import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth";

interface ICreateWeekendCalendarBody {
    name: string;
    description?: string;
    weekends: Array<{
        weekday: number;
        occurrences?: ("1st" | "2nd" | "3rd" | "4th" | "5th")[];
    }>;
}

interface IUpdateWeekendCalendarBody {
    _id: string;
    name?: string;
    description?: string;
    weekends?: Array<{
        weekday: number;
        occurrences?: ("1st" | "2nd" | "3rd" | "4th" | "5th")[];
    }>;
    userIds?: string[];
}

interface IAssignEmployeesBody {
    employeeIds: string[];
}

interface IGetCalendarsQuery {
    page?: number;
    limit?: number;
}

export async function weekendCalendarRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.post<{ Body: ICreateWeekendCalendarBody }>(
        "/",
        {
            onRequest: [authenticate],
            schema: {
                tags: ["Weekend Calendar"],
                summary: "Create new weekend calendar",
                body: {
                    type: "object",
                    required: ["name", "weekends"],
                    properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        weekends: {
                            type: "array",
                            items: {
                                type: "object",
                                required: ["weekday"],
                                properties: {
                                    weekday: { type: "number", minimum: 0, maximum: 6 },
                                    occurrences: {
                                        type: "array",
                                        items: { type: "string", enum: ["1st", "2nd", "3rd", "4th", "5th"] },
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
                const result = await request.container!.weekendCalendarService.create(request.body);
                return reply.status(201).send({ success: true, data: result });
            } catch (error: any) {
                return reply.status(400).send({ success: false, error: error.message });
            }
        }
    );

    fastify.put<{ Body: IUpdateWeekendCalendarBody }>(
        "/:id",
        {
            onRequest: [authenticate],
            schema: {
                tags: ["Weekend Calendar"],
                summary: "Update weekend calendar",
                body: {
                    type: "object",
                    properties: {
                        _id: { type: "string" },
                        name: { type: "string" },
                        description: { type: "string" },
                        weekends: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    weekday: { type: "number", minimum: 0, maximum: 6 },
                                    occurrences: {
                                        type: "array",
                                        items: { type: "string", enum: ["1st", "2nd", "3rd", "4th", "5th"] },
                                    },
                                },
                            },
                        },
                        userIds: {
                            type: "array",
                            items: { type: "string" },
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            try {
                const result = await request.container!.weekendCalendarService.update(request.body);
                return reply.status(200).send({ success: true, data: result });
            } catch (error: any) {
                return reply.status(400).send({ success: false, error: error.message });
            }
        }
    );

    fastify.get<{ Querystring: IGetCalendarsQuery }>(
        "/",
        {
            onRequest: [authenticate],
            schema: {
                tags: ["Weekend Calendar"],
                summary: "Get all weekend calendars",
                querystring: {
                    type: "object",
                    properties: {
                        page: { type: "number", minimum: 1, default: 1 },
                        limit: { type: "number", minimum: 1, maximum: 100, default: 10 },
                    },
                },
            },
        },
        async (request, reply) => {
            try {
                const result = await request.container!.weekendCalendarService.getAll(request.query);
                return reply.send({ success: true, data: result });
            } catch (error: any) {
                return reply.status(400).send({ success: false, error: error.message });
            }
        }
    );

    fastify.post<{ Body: IAssignEmployeesBody; Params: { id: string } }>(
        "/:id/assign",
        {
            onRequest: [authenticate],
            schema: {
                tags: ["Weekend Calendar"],
                summary: "Assign employees to weekend calendar",
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string" },
                    },
                },
                body: {
                    type: "object",
                    required: ["employeeIds"],
                    properties: {
                        employeeIds: {
                            type: "array",
                            items: { type: "string" },
                            minItems: 1,
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            try {
                const result = await request.container!.weekendCalendarService.assignEmployees({
                    calendarId: request.params.id,
                    employeeIds: request.body.employeeIds,
                });
                return reply.send({ success: true, data: result });
            } catch (error: any) {
                return reply.status(400).send({ success: false, error: error.message });
            }
        }
    );

    fastify.get<{ Params: { userId: string } }>(
        '/user/:userId',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Weekend Calendar'],
                summary: 'Get weekend calendar by user ID',
                params: {
                    type: 'object',
                    required: ['userId'],
                    properties: {
                        userId: {
                            type: 'string',
                            description: 'User ID to fetch calendar for'
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
                                    description: { type: 'string' },
                                    weekends: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                weekday: { type: 'number' },
                                                occurrences: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'string',
                                                        enum: ['1st', '2nd', '3rd', '4th', '5th']
                                                    }
                                                }
                                            }
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
                            error: { type: 'string' }
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const result = await request.container!.weekendCalendarService.getCalendarsByUserId(request.params.userId);
                return reply.send({
                    success: true,
                    data: result
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: error.message
                });
            }
        }
    );
}