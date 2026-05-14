import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import { getCountryConfig, isUAECountry, isIndianCountry } from '../utilis/countryConfig';

export const userProfileRoutes: RouteHandler = async (fastify: FastifyInstance): Promise<void> => {
  // Get user profile with country-specific information
  fastify.get(
    '/profile',
    {
      schema: {
        tags: ['User Profile'],
        summary: 'Get user profile with country-specific data',
        description: 'Returns user profile including country, currency, and license type information',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  user: {
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' },
                      role: { type: 'string' },
                      departmentId: { type: 'string' },
                      country: { type: 'string' },
                      currency: { type: 'string' },
                      licenseType: { type: 'string' },
                      portalAccess: { type: 'boolean' },
                      joiningDate: { type: 'string' }
                    }
                  },
                  countryConfig: {
                    type: 'object',
                    properties: {
                      timezone: { type: 'string' },
                      dateFormat: { type: 'string' },
                      taxSystem: { type: 'string' },
                      workingDays: { type: 'array', items: { type: 'number' } },
                      defaultWorkingHours: { type: 'number' }
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
        const user = request.user;
        
        if (!user) {
          return reply.status(401).send({
            success: false,
            error: { message: 'User not authenticated' }
          });
        }

        // Get country-specific configuration
        const countryConfig = getCountryConfig(user.country);

        // Example of country-specific logic
        let welcomeMessage = '';
        if (isUAECountry(user.country)) {
          welcomeMessage = 'مرحباً! Welcome to UAE operations.';
        } else if (isIndianCountry(user.country)) {
          welcomeMessage = 'नमस्ते! Welcome to India operations.';
        }

        // Example of license type specific logic
        let userType = '';
        if (user.licenseType === 'external') {
          userType = 'External Contractor/Vendor';
        } else {
          userType = 'Employee';
        }

        return reply.send({
          success: true,
          data: {
            user: {
              _id: user._id,
              name: user.name,
              email: user.email,
              role: user.role,
              departmentId: user.departmentId,
              country: user.country,
              currency: user.currency,
              licenseType: user.licenseType,
              portalAccess: user.portalAccess !== false,
              joiningDate: new Date().toISOString() // This would come from the actual user data
            },
            countryConfig: {
              timezone: countryConfig.timezone,
              dateFormat: countryConfig.dateFormat,
              taxSystem: countryConfig.taxSystem,
              workingDays: countryConfig.workingDays,
              defaultWorkingHours: countryConfig.defaultWorkingHours
            },
            welcomeMessage,
            userType
          }
        });
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: { message: error.message || 'Internal server error' }
        });
      }
    }
  );

  // Update user country preferences (example endpoint)
  fastify.put(
    '/profile/country',
    {
      schema: {
        tags: ['User Profile'],
        summary: 'Update user country preferences',
        description: 'Update user country and currency preferences',
        body: {
          type: 'object',
          required: ['country'],
          properties: {
            country: { 
              type: 'string', 
              enum: ['IN', 'AE'] 
            },
            currency: { 
              type: 'string', 
              enum: ['INR', 'AED'] 
            }
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
                  message: { type: 'string' },
                  updatedFields: {
                    type: 'object',
                    properties: {
                      country: { type: 'string' },
                      currency: { type: 'string' }
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
        const user = request.user;
        const { country, currency } = request.body as { country: string; currency?: string };

        if (!user) {
          return reply.status(401).send({
            success: false,
            error: { message: 'User not authenticated' }
          });
        }

        // Get the appropriate currency for the country if not provided
        const targetCurrency = currency || getCountryConfig(country).currency;

        // In a real implementation, you would update the user in the database
        // For this example, we'll just return the intended changes
        const updatedFields = {
          country,
          currency: targetCurrency
        };

        return reply.send({
          success: true,
          data: {
            message: 'Country preferences updated successfully',
            updatedFields
          }
        });
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: { message: error.message || 'Internal server error' }
        });
      }
    }
  );
}; 