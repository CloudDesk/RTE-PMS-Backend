import { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    reqRole?: string;
  }
}

export const addReqRole = async (request: FastifyRequest) => {
  const reqRole = request.headers['reqrole'] as string;
  if (reqRole) {
    request.reqRole = reqRole;
  }
}; 