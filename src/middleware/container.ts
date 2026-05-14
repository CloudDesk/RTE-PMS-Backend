import { FastifyRequest, FastifyReply } from 'fastify';
import { Container } from '../container';
import { RequestContext } from '../types/context';
import { ServiceContainer } from '../types/container';

declare module 'fastify' {
  interface FastifyRequest {
    container?: ServiceContainer;
  }
}

export const setupContainer = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const requestId = request.id;
  
  // Initialize with default values
  const context: RequestContext = {
    requestId: requestId,
    reqRole: '',
    user: undefined
  };

  const container = Container.getInstance();
  const scope = container.createScope(requestId, context);

  // Attach to request
  request.container = scope;

  // Clean up after request
  reply.raw.on('finish', () => {
    container.clearScope(requestId);
  });
}; 