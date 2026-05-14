import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import '@fastify/cookie';
import '@fastify/jwt';

interface LoginBody {
  email: string;
  password: string;
}

interface ResetPasswordBody {
  token: string;
  password: string;
}

export const authRoutes: RouteHandler = async (fastify: FastifyInstance): Promise<void> => {
  // Login
  fastify.post(
    '/login',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'User login',
        description: 'Authenticate user with email and password',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 }
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
                  token: { type: 'string' },
                  user: {
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' },
                      role: { type: 'string' },
                      specificRole: { type: 'string' },
                      departmentId: { type: 'string' },
                      biometricId: { type: 'string' },
                      managerId: { type: 'string' },
                      managerName: { type: 'string' },
                      joiningDate: { type: 'string' },
                      // New fields for UAE + external user support
                      country: { type: 'string' },
                      currency: { type: 'string' },
                      licenseType: { type: 'string' },
                      portalAccess: { type: 'boolean' }
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
        const { email, password } = request.body as LoginBody;
        console.log(email, password, 'email, password');
        const user = await request.container!.authService.login(email, password);
        console.log(user, 'loged in user');
        const token = await reply.jwtSign({
          _id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          specificRole: user.specificRole,
          departmentId: user.departmentId,
          active: user.active,
          managerId: user.managerId,
          managerName: user.managerName,
          // New fields for UAE + external user support
          country: user.country,
          currency: user.currency,
          licenseType: user.licenseType,
          portalAccess: user.portalAccess !== false
        } as {
          _id: string;
          email: string;
          name: string;
          role: string;
          specificRole: string;
          departmentId: string;
          active: boolean;
          managerId: string;
          managerName: string;
          // New fields for UAE + external user support
          country: string;
          currency: string;
          licenseType: string;
          portalAccess: boolean;
        });
        // Set JWT token as cookie
        reply.setCookie('access_token', token, {
          path: '/',
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });


        return reply.send({
          success: true,
          data: {
            token,
            user: {
              _id: user._id,
              name: user.name,
              email: user.email,
              role: user.role,
              specificRole: user.specificRole,
              departmentId: user.departmentId,
              biometricId: user.biometricId,
              managerId: user.managerId,
              managerName: user.managerName,
              joiningDate: user.joiningDate,
              // New fields for UAE + external user support
              country: user.country,
              currency: user.currency,
              licenseType: user.licenseType,
              portalAccess: user.portalAccess !== false
            }
          }
        });
      } catch (error: any) {
        return reply.status(401).send({
          success: false,
          error: {
            message: error.message || 'Authentication failed'
          }
        });
      }
    }
  );

  // Forgot password
  fastify.post(
    '/forgot-password',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Request password reset',
        description: 'Send password reset instructions to user email',
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' }
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
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { email } = request.body as { email: string };
        await request.container!.authService.forgotPassword(email);

        return reply.send({
          success: true,
          data: { message: 'Password reset instructions sent to email' }
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Reset password
  fastify.post(
    '/reset-password',
    {
      schema: {
        tags: ['Authentication'],
        summary: 'Reset password',
        description: 'Reset user password using reset token',
        body: {
          type: 'object',
          required: ['token', 'password'],
          properties: {
            token: { type: 'string' },
            password: { type: 'string', minLength: 6 }
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
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { token, password } = request.body as ResetPasswordBody;
        await request.container!.authService.resetPassword(token, password);

        return reply.send({
          success: true,
          data: { message: 'Password reset successful' }
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );
};