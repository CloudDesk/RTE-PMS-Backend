import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';

export const dashboardRoutes: RouteHandler = async (fastify: FastifyInstance): Promise<void> => {

    // Admin Dashboard - Get comprehensive metrics
    fastify.get(
        '/admin',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Dashboard'],
                summary: 'Get admin dashboard metrics',
                description: 'Retrieve comprehensive dashboard metrics for admin users',
                security: [{ bearerAuth: [] }]
            }
        },
        async (request, reply) => {
            try {
                // Check if user is admin
                if (request.user.role !== 'admin') {
                    return reply.status(403).send({
                        success: false,
                        error: { message: 'Access denied. Admin role required.' }
                    });
                }

                const metrics = await request.container!.dashboardService.getDashboardMetrics();

                return reply.send({
                    success: true,
                    data: metrics
                });
            } catch (error: any) {
                console.error('Admin Dashboard Error:', error);
                return reply.status(500).send({
                    success: false,
                    error: { message: error.message || 'Internal server error' }
                });
            }
        }
    );

    // Manager Dashboard - Get team-specific metrics
    fastify.get(
        '/manager',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Dashboard'],
                summary: 'Get manager dashboard data',
                description: 'Retrieve team-specific dashboard data for manager users',
                security: [{ bearerAuth: [] }]
            }
        },
        async (request, reply) => {
            try {
                // Check if user is manager or admin
                if (!['manager', 'admin'].includes(request.user.role)) {
                    return reply.status(403).send({
                        success: false,
                        error: { message: 'Access denied. Manager or Admin role required.' }
                    });
                }

                const managerId = request.user._id;
                const data = await request.container!.dashboardService.getManagerDashboardData(managerId);

                return reply.send({
                    success: true,
                    data
                });
            } catch (error: any) {
                console.error('Manager Dashboard Error:', error);
                return reply.status(500).send({
                    success: false,
                    error: { message: error.message || 'Internal server error' }
                });
            }
        }
    );

    // Get dashboard data for current user (role-based)
    fastify.get(
        '/',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Dashboard'],
                summary: 'Get role-based dashboard data',
                description: 'Retrieve dashboard data based on user role',
                security: [{ bearerAuth: [] }]
            }
        },
        async (request, reply) => {
            try {
                const userRole = request.user.role;
                let data;

                if (userRole === 'admin') {
                    data = await request.container!.dashboardService.getDashboardMetrics();
                } else if (userRole === 'manager') {
                    const managerId = request.user._id;
                    data = await request.container!.dashboardService.getManagerDashboardData(managerId);
                } else if (userRole === 'user' || userRole === 'employee') {
                    const userId = request.user._id.toString();
                    data = await request.container!.dashboardService.getUserDashboardData(userId);
                } else {
                    return reply.status(403).send({
                        success: false,
                        error: { message: 'Access denied. Admin, Manager or User role required.' }
                    });
                }

                return reply.send({
                    success: true,
                    data,
                    userRole
                });
            } catch (error: any) {
                console.error('Dashboard Error:', error);
                return reply.status(500).send({
                    success: false,
                    error: { message: error.message || 'Internal server error' }
                });
            }
        }
    );
    // Get personal stats for the current user (regardless of role)
    fastify.get(
        '/my-stats',
        {
            onRequest: [authenticate],
            schema: {
                tags: ['Dashboard'],
                summary: 'Get personal dashboard analytics',
                description: 'Retrieve individual average working hours and presence for the current user',
                security: [{ bearerAuth: [] }]
            }
        },
        async (request, reply) => {
            try {
                const userId = request.user._id.toString();
                const data = await request.container!.dashboardService.getUserDashboardData(userId);

                return reply.send({
                    success: true,
                    data
                });
            } catch (error: any) {
                console.error('User Stats Error:', error);
                return reply.status(500).send({
                    success: false,
                    error: { message: error.message || 'Internal server error' }
                });
            }
        }
    );
};
