import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RouteHandler } from '../types/routes';
import mongoose from 'mongoose';

export const dataUnitRoutes: RouteHandler = async (
    fastify: FastifyInstance,
    _opts: FastifyPluginOptions,
): Promise<void> => {

    // Get all data units
    fastify.get('/', async (_request, reply) => {
        try {
            const dataUnits = await mongoose.connection.db.collection('data_units').find().toArray();
            return reply.send({ success: true, data: dataUnits });
        } catch (error: any) {
            return reply.status(400).send({ success: false, error: error.message });
        }
    });

    // Insert data units
    fastify.post('/', async (request, reply) => {
        try {
            const body = request.body;
            console.log(body, "req body")
            const result = true
            return reply.status(201).send({ success: true, data: result });
        } catch (error: any) {
            return reply.status(400).send({ success: false, error: error.message });
        }
    });

    // Upsert data units
    fastify.put('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            const body = request.body;
            console.log(body, id)
            const result = true
            return reply.send({ success: true, data: result });
        } catch (error: any) {
            return reply.status(400).send({ success: false, error: error.message });
        }
    });

    // Get data unit by ID
    fastify.get('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            console.log(id)
            return reply.send({ success: true, data: true });
        } catch (error: any) {
            return reply.status(400).send({ success: false, error: error.message });
        }
    });

    // Delete data unit by ID
    fastify.delete('/:id', async (request, reply) => {
        try {
            const { id } = request.params as { id: string };
            console.log(id)
            return reply.send({ success: true, data: true });
        } catch (error: any) {
            return reply.status(400).send({ success: false, error: error.message });
        }
    });
};
