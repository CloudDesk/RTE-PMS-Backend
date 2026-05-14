import { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth";
import { ITaxSlabCreate, ITaxSlabUpdate } from '../services/tax-slab.service';
import { Types } from "mongoose";

export async function taxSlabRoutes(fastify: FastifyInstance): Promise<void> {

    fastify.get('/',
        {
            preHandler: [authenticate],
            schema: {
                tags: ['Tax Slab'],
                summary: "Get Tax Slabs",
                description: 'Retrieve all tax slabs with pagination and search functionality',
                querystring: {
                    type: 'object',
                    properties: {
                        search: {
                            type: 'string',
                            description: 'Filter by Financial Year'
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
                                        _id: { type: 'string' },
                                        regime: { type: 'string', enum: ["old", "new"] },
                                        financialYear: { type: "string" },
                                        cessRate: { type: "number" },
                                        standardDeduction: { type: "number" },
                                        isActive: { type: 'boolean' },
                                        createdAt: { type: 'string', format: 'date-time' },
                                        updatedAt: { type: 'string', format: 'date-time' },
                                        slabs: {
                                            type: "array",
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    fromAmount: { type: 'number' },
                                                    toAmount: { type: 'number', nullable: true },
                                                    taxRate: { type: 'number' }
                                                }
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
            },
        },

        async (request, reply) => {
            console.log(request.query, "request salary structre");
            const { page, limit, search } = request.query as { page?: number; limit?: number; search?: string };
            console.log(page, limit, search, "*****")
            try {
                const result = await request.container!.taxSlabService.findAll({ page, limit, search });
                return reply.send({
                    success: true,
                    data: result.taxSlabs,
                    meta: result.meta
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );

    fastify.post('/',
        {
            preHandler: [authenticate],
            schema: {
                tags: ['Tax Slab'],
                summary: "Create Tax Slab",
                description: 'Create a new tax slab',
                body: {
                    type: 'object',
                    required: ['regime', 'financialYear', 'slabs', 'cessRate', 'standardDeduction', 'isActive'],
                    properties: {
                        regime: { type: 'string', enum: ["old", "new"] },
                        financialYear: { type: "string" },
                        cessRate: { type: "number" },
                        standardDeduction: { type: "number" },
                        isActive: { type: 'boolean' },
                        slabs: {
                            type: "array",
                            items: {
                                type: 'object',
                                properties: {
                                    fromAmount: { type: 'number' },
                                    toAmount: { type: 'number', nullable: true },
                                    taxRate: { type: 'number' }
                                }
                            }
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
                                    regime: { type: 'string', enum: ["old", "new"] },
                                    financialYear: { type: "string" },
                                    cessRate: { type: "number" },
                                    standardDeduction: { type: "number" },
                                    isActive: { type: 'boolean' },
                                    createdAt: { type: 'string', format: 'date-time' },
                                    updatedAt: { type: 'string', format: 'date-time' },
                                    slabs: {
                                        type: "array",
                                        items: {
                                            type: 'object',
                                            properties: {
                                                fromAmount: { type: 'number' },
                                                toAmount: { type: 'number', nullable: true },
                                                taxRate: { type: 'number' }
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
            },
        },
        async (request, reply) => {
            try {
                const slab = await request.container!.taxSlabService.create(request.body as ITaxSlabCreate);
                return reply.send({
                    success: true,
                    data: slab,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );

    fastify.put('/:id',
        {
            preHandler: [authenticate],
            schema: {
                tags: ['Tax Slab'],
                summary: "Update Tax Slab",
                description: 'Update an existing tax slab',
                body: {
                    type: 'object',
                    required: ['_id'],
                    properties: {
                        _id: { type: 'string' },
                        regime: { type: 'string', enum: ["old", "new"] },
                        financialYear: { type: "string" },
                        cessRate: { type: "number" },
                        standardDeduction: { type: "number" },
                        isActive: { type: 'boolean' },
                        slabs: {
                            type: "array",
                            items: {
                                type: 'object',
                                properties: {
                                    fromAmount: { type: 'number' },
                                    toAmount: { type: 'number', nullable: true },
                                    taxRate: { type: 'number' }
                                }
                            }
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
                                    regime: { type: 'string', enum: ["old", "new"] },
                                    financialYear: { type: "string" },
                                    cessRate: { type: "number" },
                                    standardDeduction: { type: "number" },
                                    isActive: { type: 'boolean' },
                                    createdAt: { type: 'string', format: 'date-time' },
                                    updatedAt: { type: 'string', format: 'date-time' },
                                    slabs: {
                                        type: "array",
                                        items: {
                                            type: 'object',
                                            properties: {
                                                fromAmount: { type: 'number' },
                                                toAmount: { type: 'number', nullable: true },
                                                taxRate: { type: 'number' }
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
            },
        },
        async (request, reply) => {
            try {
                const slab = await request.container!.taxSlabService.update(request.body as ITaxSlabUpdate);
                return reply.send({
                    success: true,
                    data: slab,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );

    fastify.delete('/:id',
        {
            preHandler: [authenticate],
            schema: {
                tags: ['Tax Slab'],
                summary: "Delete Tax Slab",
                description: 'Delete a tax slab by ID',
                params: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'string' }
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
                                    regime: { type: 'string', enum: ["old", "new"] },
                                    financialYear: { type: "string" },
                                    cessRate: { type: "number" },
                                    standardDeduction: { type: "number" },
                                    isActive: { type: 'boolean' },
                                    createdAt: { type: 'string', format: 'date-time' },
                                    updatedAt: { type: 'string', format: 'date-time' },
                                    slabs: {
                                        type: "array",
                                        items: {
                                            type: 'object',
                                            properties: {
                                                fromAmount: { type: 'number' },
                                                toAmount: { type: 'number', nullable: true },
                                                taxRate: { type: 'number' }
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
            },
        },
        async (request, reply) => {
            try {
                const { id } = request.params as { id: string };
                if (!Types.ObjectId.isValid(id)) {
                    return reply.status(400).send({ success: false, error: { message: "Invalid ID" } });
                }
                const slab = await request.container!.taxSlabService.delete(new Types.ObjectId(id));
                return reply.send({
                    success: true,
                    data: slab,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );

    fastify.get('/current-fy',
        {
            preHandler: [authenticate],
            schema: {
                tags: ['Tax Slab'],
                summary: "Get Current Financial Year Tax Slabs",
                description: 'Retrieve active tax slabs for the current financial year',
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
                                        regime: { type: 'string', enum: ["old", "new"] },
                                        financialYear: { type: "string" },
                                        cessRate: { type: "number" },
                                        standardDeduction: { type: "number" },
                                        isActive: { type: 'boolean' },
                                        createdAt: { type: 'string', format: 'date-time' },
                                        updatedAt: { type: 'string', format: 'date-time' },
                                        slabs: {
                                            type: "array",
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    fromAmount: { type: 'number' },
                                                    toAmount: { type: 'number', nullable: true },
                                                    taxRate: { type: 'number' }
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
            },
        },
        async (request, reply) => {
            console.log(request)
            try {
                const slabs = await request.container!.taxSlabService.getCurrentFY();
                return reply.send({
                    success: true,
                    data: slabs,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    );
}