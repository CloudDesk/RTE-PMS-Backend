import { FastifyInstance, FastifyPluginOptions } from 'fastify';

export type RouteHandler = (
  fastify: FastifyInstance,
  opts: FastifyPluginOptions,
) => Promise<void>;

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface DateRangeQuery {
  startDate?: string;
  endDate?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    details?: any;
  };
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
} 