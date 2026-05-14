// src/routes/user-resignation.routes.ts

import { FastifyInstance, } from "fastify";
import { authenticate } from "../middleware/auth";

interface IResignationBody {
    summary: string;
    remarks?: string;
    preferredLastWorkingDay?: Date;
}

interface IApproveRejectBody {
    remarks?: string;
    noticePeriodDays: number; // Required
    approvedLastWorkingDay: Date; // Required
}

interface IResignationParams {
    userId: string;
}

export async function userResignationRoutes(fastify: FastifyInstance): Promise<void> {
    // Submit resignation
    fastify.post<{
        Body: IResignationBody;
        Params: IResignationParams;
    }>(
        '/:userId/submit',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Resignation'],
                summary: 'Submit resignation',
                params: {
                    type: 'object',
                    required: ['userId'],
                    properties: {
                        userId: { type: 'string' }
                    }
                },
                body: {
                    type: 'object',
                    required: ['summary'],
                    properties: {
                        summary: {
                            type: 'string',
                            description: 'Resignation reason'
                        },
                        remarks: { type: 'string' },
                        preferredLastWorkingDay: {
                            type: 'string',
                            format: 'date-time'
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
                                    resignation: {
                                        type: 'object',
                                        properties: {
                                            status: { type: 'string' },
                                            summary: { type: 'string' },
                                            submittedAt: { type: 'string', format: 'date-time' },
                                            preferredLastWorkingDay: {
                                                type: 'string',
                                                format: 'date-time',
                                                nullable: true
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
        async (request, reply) => {
            try {
                console.log("apply resignation", request.params.userId);
                console.log("apply resignation", request.body);
                const result = await request.container!.userService.applyResignation(
                    request.params.userId,
                    request.body
                );
                return reply.send({ success: true, data: result });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    // Withdraw resignation
    fastify.put<{ Params: IResignationParams }>(
        '/:userId/withdraw',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Resignation'],
                summary: 'Withdraw resignation',
                params: {
                    type: 'object',
                    required: ['userId'],
                    properties: {
                        userId: { type: 'string' }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const result = await request.container!.userService.withdrawResignation(
                    request.params.userId
                );
                return reply.send({ success: true, data: result });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    // Approve resignation (Manager/Admin only)
    fastify.put<{
        Body: IApproveRejectBody;
        Params: IResignationParams;
    }>(
        '/:userId/approve',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Resignation'],
                summary: 'Approve resignation',
                params: {
                    type: 'object',
                    required: ['userId'],
                    properties: {
                        userId: { type: 'string' }
                    }
                },
                body: {
                    type: 'object',
                    required: ['noticePeriodDays', 'approvedLastWorkingDay'],
                    properties: {
                        remarks: { type: 'string' },
                        noticePeriodDays: {
                            type: 'number',
                            minimum: 1
                        },
                        approvedLastWorkingDay: {
                            type: 'string',
                            format: 'date-time'
                        }
                    }
                }
            }
        },
        async (request, reply) => {
            try {
                const result = await request.container!.userService.approveResignation(
                    request.params.userId,
                    (request.user as any)._id,
                    request.body
                );
                return reply.send({ success: true, data: result });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    // Reject resignation (Manager/Admin only)
    fastify.put<{
        Body: { remarks?: string };
        Params: IResignationParams;
    }>(
        '/:userId/reject',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Resignation'],
                summary: 'Reject resignation',
                params: {
                    type: 'object',
                    required: ['userId'],
                    properties: {
                        userId: { type: 'string' }
                    }
                },
                body: {
                    type: 'object',
                    properties: {
                        remarks: { type: 'string' }
                    }
                }
            }
        },
        async (request, reply) => {
            try {

                const updateData = {
                    ...(request.body as any),
                    approvedBy: { _id: (request.user as any)._id, name: (request.user as any).name, email: (request.user as any).email },
                };

                const result = await request.container!.userService.rejectResignation(
                    request.params.userId,
                    updateData
                );
                return reply.send({ success: true, data: result });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message }
                });
            }
        }
    );

    // Get resignation status
    fastify.get<{ Params: IResignationParams }>(
        '/:userId/status',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Resignation'],
                summary: 'Get resignation status',
                params: {
                    type: 'object',
                    required: ['userId'],
                    properties: {
                        userId: { type: 'string' }
                    }
                }
            }
        },

        async (request, reply) => {
            console.log(request.params.userId, "request params")
            try {
                const result: any = await request.container!.userService.checkResignationEligibility(request.params.userId);

                console.log(result, "checkResignationEligibility")
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

    //get Resignation for Admin
    fastify.get(
        '/admin/:userId',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Resignation'],
                summary: 'Get resignation for admin',
                params: {
                    type: 'object',
                    required: ['userId'],
                    properties: {
                        userId: { type: 'string' }
                    }
                },
                querystring: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Withdrawn'] },
                        page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
                        limit: { type: 'number', minimum: 1, maximum: 100, default: 10, description: 'Records per page' },
                    }
                }
            }
        },
        async (request, reply) => {
            const { userId } = request.params as { userId: string };
            try {
                const result: any = await request.container!.userService.getAllResignationsForAdmin(userId, request.query as any);
                console.log(result, "get Resignation for Admin")
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


    //get Resignation for Manager
    fastify.get(
        '/manager/:userId',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Resignation'],
                summary: 'Get resignation for manager',
                params: {
                    type: 'object',
                    required: ['userId'],
                    properties: {
                        userId: { type: 'string' }
                    }
                },
                querystring: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Withdrawn'] },
                        page: { type: 'number', minimum: 1, default: 1, description: 'Page number' },
                        limit: { type: 'number', minimum: 1, maximum: 100, default: 10, description: 'Records per page' },
                    }
                }
            }
        },
        async (request, reply) => {
            const { userId } = request.params as { userId: string };
            try {
                const result: any = await request.container!.userService.getResignationsForManager(userId, request.query as any);
                // const result: any = await request.container!.userService.getResignationsForManager(userId, status);

                console.log(result, "get Resignation for Manager")
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