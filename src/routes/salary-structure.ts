import { FastifyInstance, } from "fastify";
import { authenticate } from "../middleware/auth";
import { ISalaryStructureCreate, ISalaryStructureUpdate } from "../services/salary-structure.service";
import { Types } from "mongoose";

const normalizeCountry = (value?: string | null): 'IN' | 'AE' | undefined => {
    if (!value) {
        return undefined;
    }
    const upper = value.toUpperCase();
    return upper === 'AE' || upper === 'IN' ? (upper as 'AE' | 'IN') : undefined;
};

export async function salaryStructureRoutes(fastify: FastifyInstance): Promise<void> {

    fastify.get('/',
        {
            preHandler: [authenticate],
            schema: {
                tags: ['Salary Structure'],
                summary: 'Get Salary structure',
                description: '',
                querystring: {
                    type: 'object',
                    properties: {
                        search: {
                            type: 'string',
                            description: 'Filter by Name'
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
                        country: {
                            type: 'string',
                            enum: ['IN', 'AE'],
                            description: 'Filter salary structures by country'
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
                                        name: { type: 'string' },
                                        createdAt: { type: 'string', format: 'date-time' },
                                        updatedAt: { type: 'string', format: 'date-time' },
                                        fixedEarnings: {
                                            type: 'object',
                                            properties: {
                                                basicPercentage: { type: 'number' },
                                                hraPercentage: { type: 'number' },
                                                daPercentage: { type: 'number' },
                                                otherAllowancePercentage: { type: 'number' },
                                                travelAllowancePercentage: { type: 'number' },
                                                reimbursementPercentage: { type: 'number' },
                                                deductionPercentage: { type: 'number' },
                                                comment: { type: 'string' }
                                            }
                                        },
                                        country: {
                                            type: 'string',
                                            enum: ['IN', 'AE']
                                        },
                                        statutoryDeductions: {
                                            type: 'object',
                                            properties: {
                                                epf: {
                                                    type: 'object',
                                                    properties: {
                                                        employeeContribution: { type: 'number' },
                                                        employerContribution: { type: 'number' },
                                                        maxLimit: { type: 'number' }
                                                    }
                                                },
                                                esi: {
                                                    type: 'object',
                                                    properties: {
                                                        employeeContribution: { type: 'number' },
                                                        employerContribution: { type: 'number' },
                                                        applicabilityLimit: { type: 'number' }
                                                    }
                                                },
                                                professionalTax: {
                                                    type: 'object',
                                                    properties: {
                                                        state: { type: 'string' },
                                                        term: { type: 'string' },
                                                        slabs: {
                                                            type: 'array',
                                                            items: {
                                                                type: 'object',
                                                                properties: {
                                                                    fromAmount: { type: ['number', 'null'] },
                                                                    toAmount: { type: ['number', 'null'] },
                                                                    taxAmount: { type: 'number' },
                                                                    _id: { type: 'string' }
                                                                }
                                                            }
                                                        }
                                                    }
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
            const { page, limit, search, country: queryCountry } = request.query as { page?: number; limit?: number; search?: string; country?: string };
            console.log(page, limit, search, "*****")
            try {
                const userCountry = normalizeCountry(request.container?.requestContext.user?.country);
                const userRole = request.container?.requestContext.user?.role;
                let resolvedCountry = normalizeCountry(queryCountry);

                if (!resolvedCountry && userRole?.toLowerCase() === 'admin' && userCountry) {
                    resolvedCountry = userCountry === 'AE' ? 'AE' : 'IN';
                }

                const result = await request.container!.salaryStructureService.findAll({ page, limit, search, country: resolvedCountry });
                return reply.send({
                    success: true,
                    data: result.salaryStructures,
                    meta: result.meta
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )
    fastify.post('/', { preHandler: [authenticate] },
        async (request, reply) => {

            try {
                const body = request.body as ISalaryStructureCreate;
                const bodyCountry = normalizeCountry(body.country);
                const requesterCountry = normalizeCountry(request.container?.requestContext.user?.country);
                const structure = await request.container!.salaryStructureService.create({
                    ...body,
                    country: bodyCountry || requesterCountry
                });
                return reply.send({
                    success: true,
                    data: structure,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }

        }
    )
    fastify.put('/:id', { preHandler: [authenticate] },
        async (request, reply) => {
            try {
                const { id } = request.params as { id: string };
                const body = request.body as ISalaryStructureUpdate;
                const bodyCountry = normalizeCountry(body.country);
                const requesterCountry = normalizeCountry(request.container?.requestContext.user?.country);
                const structure = await request.container!.salaryStructureService.update({
                    ...body,
                    _id: new Types.ObjectId(id),
                    country: bodyCountry || requesterCountry,
                });
                return reply.send({
                    success: true,
                    data: structure,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )
    fastify.get('/:id', { preHandler: [authenticate] },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            try {
                const structure = await request.container!.salaryStructureService.findById(new Types.ObjectId(id));
                return reply.send({
                    success: true,
                    data: structure,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )
}
