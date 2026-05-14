import { Types } from 'mongoose';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      _id: Types.ObjectId;
      email: string;
      name: string;
      role: string;
      departmentId: string;
      active: boolean;
      iat?: number;
      exp?: number;
    };
    user: {
      _id: Types.ObjectId;
      email: string;
      name: string;
      role: string;
      departmentId: string;
      active: boolean;
    };
  }
} 