import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth";
// import { holidayCalendarService } from "../services/holiday-calendar.service";

// Interfaces for request bodies and params
interface ICreateHolidayCalendarBody {
    name: string;
    description?: string;
    year: number;
    // group?: string;
    holidays: Array<{
        date: string;
        name: string;
        type: "mandatory" | "optional" | "client-specific";
        description?: string;
    }>;
}

interface IUpdateHolidayCalendarBody {
    _id: string;
    name?: string;
    description?: string;
    year?: number;
    // group?: string;
    holidays?: Array<{
        date: string;
        name: string;
        type: "mandatory" | "optional" | "client-specific";
        description?: string;
    }>;
    userIds?: string[];
}

interface ICalendarParams {
    id: string;
}
interface IAssignEmployeesBody {
    employeeIds: string[];
}

interface IGetCalendarsQuery {
    year?: number;
    page?: number;
    limit?: number;
    search?: string;
}

interface IUpcomingHolidaysQuery {
    context: string;
    limit?: number;
}

export async function holidayCalendarRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.post<{ Body: ICreateHolidayCalendarBody }>(
        "/",
        {
            onRequest: [authenticate],
            schema: {
                tags: ["Holiday Calendar"],
                summary: "Create new holiday calendar",
                body: {
                    type: "object",
                    required: ["name", "year", "holidays"],
                    properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        year: { type: "number" },
                        // group: { type: "string", enum: ["admin", "manager", "staff"], default: "admin" },
                        holidays: {
                            type: "array",
                            items: {
                                type: "object",
                                required: ["date", "name", "type"],
                                properties: {
                                    date: { type: "string", format: "date-time" },
                                    name: { type: "string" },
                                    type: {
                                        type: "string",
                                        enum: ["mandatory", "optional", "client-specific"],
                                    },
                                    description: { type: "string" },
                                },
                            },
                        }
                    },
                },
                response: {
                    201: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "object",
                                properties: {
                                    _id: { type: "string" },
                                    name: { type: "string" },
                                    description: { type: "string" },
                                    year: { type: "number" },
                                    // group: { type: "string" },
                                    holidays: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                date: { type: "string", format: "date-time" },
                                                name: { type: "string" },
                                                type: { type: "string" },
                                                description: { type: "string" },
                                            },
                                        },
                                    },
                                    assignedTo: {
                                        type: "array",
                                        items: { type: "string" },
                                    }
                                },
                            },
                        },
                    },
                    400: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            error: { type: "string" },
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            try {
                const result = await request.container!.holidayCalendarService.create(request.body);
                return reply.status(201).send({
                    success: true,
                    data: result,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: error.message,
                });
            }
        }
    );

    fastify.put<{ Params: ICalendarParams; Body: IUpdateHolidayCalendarBody }>(
        "/:id",
        {
            onRequest: [authenticate],
            schema: {
                tags: ["Holiday Calendar"],
                summary: "Update holiday calendar",
                params: {
                    type: "object",
                    required: ["id"],
                    properties: {
                        id: { type: "string" },
                    },
                },
                body: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        year: { type: "number" },
                        // group: { type: "string", enum: ["admin", "manager", "staff"], default: "admin" },
                        holidays: {
                            type: "array",
                            items: {
                                type: "object",
                                required: ["date", "name", "type"],
                                properties: {
                                    date: { type: "string", format: "date-time" },
                                    name: { type: "string" },
                                    type: {
                                        type: "string",
                                        enum: ["mandatory", "optional", "client-specific"],
                                    },
                                    description: { type: "string" },
                                },
                            },
                        },
                        userIds: {
                            type: "array",
                            items: { type: "string" },
                        },
                    },
                },
                response: {
                    200: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            data: {
                                type: "object",
                                properties: {
                                    _id: { type: "string" },
                                    name: { type: "string" },
                                    description: { type: "string" },
                                    year: { type: "number" },
                                    // group: { type: "string" },
                                    holidays: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                date: { type: "string", format: "date-time" },
                                                name: { type: "string" },
                                                type: { type: "string" },
                                                description: { type: "string" },
                                            },
                                        },
                                    },
                                    assignedTo: {
                                        type: "array",
                                        items: { type: "string" },
                                    }
                                },
                            },
                        },
                    },
                    400: {
                        type: "object",
                        properties: {
                            success: { type: "boolean" },
                            error: { type: "string" },
                        },
                    },
                },
            },
        },
        async (request, reply) => {
            try {
                const result = await request.container!.holidayCalendarService.update(request.body);
                return reply.status(200).send({
                    success: true,
                    data: result,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: error.message,
                });
            }
        }
    );
    fastify.get<{ Querystring: IGetCalendarsQuery }>(
        '/',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Holiday Calendar'],
                summary: 'Get holiday calendars',
                description: 'Retrieve holiday calendars with optional year filter',
                querystring: {
                    type: 'object',
                    properties: {
                        year: {
                            type: 'number',
                            description: 'Filter by year'
                        },
                        page: {
                            type: 'number',
                            minimum: 1,
                            default: 1
                        },
                        limit: {
                            type: 'number',
                            minimum: 1,
                            maximum: 100,
                            default: 10
                        },
                        search: {
                            type: 'string',
                            description: 'Search by name or description'
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
                                    calendars: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                _id: { type: 'string' },
                                                name: { type: 'string' },
                                                description: { type: 'string' },
                                                year: { type: 'number' },
                                                // group: { type: 'string' },
                                                holidays: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        properties: {
                                                            date: { type: 'string', format: 'date-time' },
                                                            name: { type: 'string' },
                                                            type: { type: 'string' },
                                                            description: { type: 'string' }
                                                        }
                                                    }
                                                },
                                                assignedTo: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        properties: {
                                                            _id: { type: 'string' },
                                                            name: { type: 'string' },
                                                            email: { type: 'string' }
                                                        }
                                                    }
                                                },
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
                const result = await request.container!.holidayCalendarService.getCalendars(request.query);
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

    fastify.post<{
        Body: IAssignEmployeesBody;
        Params: ICalendarParams;
    }>(
        '/:id/assign',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Holiday Calendar'],
                summary: 'Assign employees to holiday calendar',
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Holiday calendar ID'
                        }
                    }
                },
                body: {
                    type: 'object',
                    required: ['employeeIds'],
                    properties: {
                        employeeIds: {
                            type: 'array',
                            items: { type: 'string' },
                            minItems: 1,
                            description: 'Array of employee IDs to assign'
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
                                    year: { type: 'number' },
                                    assignedTo: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                _id: { type: 'string' },
                                                name: { type: 'string' },
                                                email: { type: 'string' }
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
            console.log(request.body, "assign req body")
            console.log(request.params, "assign req params")
            try {
                const result = await request.container!.holidayCalendarService.assignEmployees({
                    calendarId: request.params.id,
                    employeeIds: request.body.employeeIds
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

    fastify.get<{ Params: { userId: string }; Querystring: { year?: number } }>(
        '/user/:userId',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Holiday Calendar'],
                summary: 'Get holiday calendar by user ID',
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
                querystring: {
                    type: 'object',
                    properties: {
                        year: {
                            type: 'number',
                            description: 'Filter by specific year'
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
                                    year: { type: 'number' },
                                    // group: { type: 'string' },
                                    holidays: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                date: { type: 'string', format: 'date-time' },
                                                name: { type: 'string' },
                                                type: { type: 'string' },
                                                description: { type: 'string' }
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
                const year = request.query.year;
                const result = await request.container!.holidayCalendarService.getCalendarsByUserId(request.params.userId, year);
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

    fastify.get<{ Querystring: IUpcomingHolidaysQuery }>('/upcoming',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Holiday Calendar'],
                summary: 'Get upcoming holidays',
                description: 'Get upcoming holidays based on user role and context',
                querystring: {
                    type: 'object',
                    properties: {
                        context: {
                            type: 'string',
                            enum: ['admin', 'my'],
                            description: 'View context. Defaults to user role if not specified'
                        },
                        view: {
                            type: 'string',
                            enum: ['all'],
                            description: 'View context. Defaults to user role if not specified'
                        },
                        limit: {
                            type: 'number',
                            minimum: 1,
                            maximum: 100,
                            default: 10,
                            description: 'Number of upcoming holidays to fetch'
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
                                        date: {
                                            type: 'string',
                                            format: 'date-time',
                                            description: 'Holiday date'
                                        },
                                        name: {
                                            type: 'string',
                                            description: 'Holiday name'
                                        },
                                        type: {
                                            type: 'string',
                                            enum: ['mandatory', 'optional', 'client-specific'],
                                            description: 'Holiday type'
                                        },
                                        description: {
                                            type: 'string',
                                            nullable: true
                                        },
                                        calendarName: {
                                            type: 'string',
                                            description: 'Source calendar name'
                                        },
                                        roles: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            description: 'Applicable roles (admin view only)'
                                        },
                                        calendarNames: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            description: 'Source calendar names (admin view only)'
                                        }
                                    },
                                    required: ['date', 'name', 'type']
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
                    },
                    401: {
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
                let id = (request.user as any)._id
                let role = (request.user as any).role
                const context = (request.query as any).context || role.toLowerCase(); // fallback if no context passed
                const { view } = request.query as { view?: string };
                const isContextAdmin = context === "admin" ? true : false;
                const showAll = view === 'all' ? true : false;
                // let isAdmin = ole.toLowerCase() === "admin"  ||
                //     role.toLowerCase() === "manager"?true:false;
                const result = await request.container!.holidayCalendarService.getUpcomingHolidays(id, isContextAdmin, showAll);
                console.log(result, "upcoming holidays")
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
    )
}