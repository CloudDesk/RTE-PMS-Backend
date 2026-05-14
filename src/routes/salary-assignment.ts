import { FastifyInstance, } from "fastify";
import { authenticate } from "../middleware/auth";
import { ISalaryAssignmentCreate, ISalaryAssignmentUpdate } from '../services/salary-assignment.service'
import { Types } from "mongoose";
import { SalaryAssignment } from "../models/salary-assignments.model";


export async function salaryAssignmentRoutes(fastify: FastifyInstance): Promise<void> {

    fastify.get('/',
        { preHandler: [authenticate] },
        async (request, reply) => {
            console.log(request, "request");
            try {
                const structure = await request.container!.salaryAssignmentService.findAll();
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

    fastify.post('/', { preHandler: [authenticate] },
        async (request, reply) => {

            try {
                const structure = await request.container!.salaryAssignmentService.create(request.body as ISalaryAssignmentCreate);
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

                // Validate ObjectId
                if (!Types.ObjectId.isValid(id)) {
                    return reply.status(400).send({
                        success: false,
                        error: { message: "Invalid salary assignment ID" },
                    });
                }

                const assignmentId = new Types.ObjectId(id);

                // Fetch existing document to get employeeId if not provided in body
                const existingAssignment = await SalaryAssignment.findById(assignmentId);
                if (!existingAssignment) {
                    return reply.status(404).send({
                        success: false,
                        error: { message: "Salary Assignment not found" },
                    });
                }

                const body = request.body as any;

                // Merge the ID from URL params into the request body
                // Use existing employeeId if not provided in body
                const updateData: ISalaryAssignmentUpdate = {
                    ...body,
                    _id: assignmentId,
                    employeeId: body.employeeId ? new Types.ObjectId(body.employeeId) : existingAssignment.employeeId,
                    salaryStructureId: body.salaryStructureId ? new Types.ObjectId(body.salaryStructureId) : existingAssignment.salaryStructureId,
                };

                const structure = await request.container!.salaryAssignmentService.update(updateData);
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

    fastify.get('/user/:userId', { preHandler: [authenticate] },
        async (request, reply) => {
            try {
                const { userId } = request.params as { userId: string };
                if (!Types.ObjectId.isValid(userId)) {
                    return reply.status(400).send({ success: false, error: { message: "Invalid userId" } });
                }
                const assignments = await request.container!.salaryAssignmentService.findByUserId(new Types.ObjectId(userId));
                return reply.send({
                    success: true,
                    data: assignments,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        }
    )

    fastify.get('/user/:userId/active', { preHandler: [authenticate] },
        async (request, reply) => {
            try {
                const { userId } = request.params as { userId: string };
                if (!Types.ObjectId.isValid(userId)) {
                    return reply.status(400).send({ success: false, error: { message: "Invalid userId" } });
                }

                const activeAssignment = await request.container!.salaryAssignmentService.findActiveByUserId(new Types.ObjectId(userId));
                return reply.send({
                    success: true,
                    data: activeAssignment,
                });
            } catch (error: any) {
                return reply.status(400).send({
                    success: false,
                    error: { message: error.message },
                });
            }
        })

    // Combined DELETE route to handle both /:id and /?id=
    fastify.delete('/', async (request, reply) => {
        try {
            const { id: queryId } = request.query as { id: string };
            if (!queryId || !Types.ObjectId.isValid(queryId)) {
                return reply.status(400).send({ success: false, error: { message: "Invalid or missing salary assignment ID in query" } });
            }
            const structure = await request.container!.salaryAssignmentService.delete(new Types.ObjectId(queryId));
            return reply.send({ success: true, data: structure });
        } catch (error: any) {
            return reply.status(400).send({ success: false, error: { message: error.message } });
        }
    });

    fastify.delete('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            if (!id || !Types.ObjectId.isValid(id)) {
                return reply.status(400).send({ success: false, error: { message: "Invalid salary assignment ID in path" } });
            }
            const structure = await request.container!.salaryAssignmentService.delete(new Types.ObjectId(id));
            return reply.send({ success: true, data: structure });
        } catch (error: any) {
            return reply.status(400).send({ success: false, error: { message: error.message } });
        }
    });
}