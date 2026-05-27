import { Types } from 'mongoose';
import { CookieSerializeOptions } from '@fastify/cookie';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      _id: Types.ObjectId | string;
      email: string;
      name: string;
      role: string;
      departmentId: string;
      active: boolean;
      // New fields for UAE + external user support
      country: string;
      currency: string;
      licenseType: string;
      portalAccess: boolean;
      scope?: string;
    };
  }

  interface FastifyReply {
    setCookie(
      name: string,
      value: string,
      options?: CookieSerializeOptions
    ): FastifyReply;
    cookie(
      name: string,
      value: string,
      options?: CookieSerializeOptions
    ): FastifyReply;
  }

  interface FastifyInstance {
    cookies: any;
    [Symbol.for('fastify.plugins.registered')]: any;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      _id: string;
      email: string;
      name: string;
      role: string;
      departmentId: string;
      active: boolean;
      // New fields for UAE + external user support
      country: string;
      currency: string;
      licenseType: string;
      portalAccess: boolean;
      scope?: string;
    };
    user: {
      _id: Types.ObjectId | string;
      email: string;
      name: string;
      role: string;
      departmentId: string;
      active: boolean;
      // New fields for UAE + external user support
      country: string;
      currency: string;
      licenseType: string;
      portalAccess: boolean;
      scope?: string;
    };
  }
} 