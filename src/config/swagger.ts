import { SwaggerOptions } from "@fastify/swagger";

export const swaggerOptions = {
  swagger: {
    info: {
      title: 'HRMS API',
      description: 'API documentation for Human Resource Management System',
      version: '1.0.0',
      contact: {
        name: 'HRMS Support',
        email: 'support@hrms.com'
      }
    },
    host: 'localhost:3000',
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
    tags: [
      { 
        name: 'Authentication', 
        description: 'User authentication and password management endpoints' 
      },
      { 
        name: 'User Management', 
        description: 'User CRUD operations and profile management' 
      },
      { 
        name: 'Organization', 
        description: 'Organization structure and hierarchy management' 
      },
      { 
        name: 'Biometric Attendance', 
        description: 'Biometric attendance tracking and management with shift windows' 
      },
      { 
        name: 'Attendance Management', 
        description: 'Overtime requests and attendance regularization' 
      },
      { 
        name: 'Leave Management', 
        description: 'Leave applications, approvals, and balance tracking' 
      },
      { 
        name: 'Leave Summary', 
        description: 'Leave summaries and balance reports' 
      },
      { 
        name: 'Payroll', 
        description: 'Salary structures, calculations, and payslip generation' 
      },
      { 
        name: 'Shift Management', 
        description: 'Shift definitions, assignments, and scheduling' 
      },
      { 
        name: 'Master Data', 
        description: 'List of values and master data management' 
      }
    ],
    securityDefinitions: {
      bearerAuth: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description: 'JWT Bearer token. Example: Bearer {token}'
      }
    },
    security: [{ bearerAuth: [] }],
    responses: {
      401: {
        description: 'Unauthorized - Authentication failed or token missing/invalid',
        type: 'object',
        properties: {
          success: { type: 'boolean', default: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' }
            }
          }
        }
      },
      403: {
        description: 'Forbidden - Insufficient permissions',
        type: 'object',
        properties: {
          success: { type: 'boolean', default: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' }
            }
          }
        }
      },
      400: {
        description: 'Bad Request - Invalid input or validation failed',
        type: 'object',
        properties: {
          success: { type: 'boolean', default: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' }
            }
          }
        }
      },
      404: {
        description: 'Not Found - Resource not found',
        type: 'object',
        properties: {
          success: { type: 'boolean', default: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' }
            }
          }
        }
      },
      500: {
        description: 'Internal Server Error',
        type: 'object',
        properties: {
          success: { type: 'boolean', default: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' }
            }
          }
        }
      }
    },
    externalDocs: {
      description: 'Find out more about HRMS',
      url: 'https://hrms.com/docs'
    }
  },
  exposeRoute: true,
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true
  },
  staticCSP: true,
  transformStaticCSP: (header: string) => header
} as SwaggerOptions; 