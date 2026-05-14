import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RouteHandler } from '../types/routes';

export const collectionRoutes: RouteHandler = async (
    fastify: FastifyInstance,
    _opts: FastifyPluginOptions,
): Promise<void> => {

    // Get all collection names
    fastify.get('/', {
        schema: {
            summary: "Get all Collections",
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'array',
                            items: { type: 'string' }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const result = await request.container!.collectionService.getAllCollection()
            return reply.send({
                success: true,
                data: result
            });
        } catch (error: any) {
            fastify.log.error(error, 'Error retrieving collections');
            return reply.status(500).send({
                success: false,
                error: 'Failed to retrieve collections'
            });
        }
    });

    // Get fields by collection name with enhanced details
    fastify.get('/:modelName/fields', {
        schema: {
            summary: "Get Schema Fields for a Specific Model",
            params: {
                type: 'object',
                properties: {
                    modelName: { type: 'string' }
                },
                required: ['modelName']
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
                                    field: { type: 'string' },
                                    type: { type: 'string' },
                                    required: { type: 'boolean' },
                                    references: { type: ['string', 'null'] },
                                    nested: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                field: { type: 'string' },
                                                type: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                404: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { modelName } = request.params as { modelName: string };
            const result = await request.container!.collectionService.getCollectionFields(modelName)
            return reply.send({
                success: true,
                data: result
            });

        } catch (error: any) {
            fastify.log.error(error, 'Error retrieving model fields');
            return reply.status(404).send({
                success: false,
                error: error.message || 'Failed to retrieve model fields'
            });
        }
    });
}