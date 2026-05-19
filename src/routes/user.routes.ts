import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import * as ExcelJS from 'exceljs';
import { messaging } from '../config/firebase/firebaseConfig';
import { filesUpload } from '../config/multer';
// import { IAcademicDetails, IExperienceDetails } from '../models';

const shiftAssignmentDataSchema = {
  type: 'object',
  properties: {
    startDate: { type: 'string', format: 'date-time' },
    endDate: { type: 'string', format: 'date-time' },
    shiftCode: { type: 'string' },
    shiftId: { type: 'string' },
    shiftAssignmentId: { type: 'string' },
  }
};
const bankDetailsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      accountHolderName: { type: 'string' },
      accountNumber: { type: 'string' },
      bankName: { type: 'string' },
      ifscCode: { type: 'string' },
      isActive: { type: 'boolean', default: false },
    },
    required: ['accountHolderName', 'accountNumber', 'bankName', 'ifscCode'],
  },
};

const visaDetailsSchema = {
  type: 'object',
  properties: {
    visaType: {
      type: 'string',
      enum: ['Standard Employment Visa', 'Domestic Worker Visa', 'Green Visa'],
      description: 'Type of UAE visa (optional)'
    },
    visaExpiryDate: {
      type: 'string',
      format: 'date-time',
      description: 'Visa expiry date (optional for UAE employees)'
    },
    isActive: {
      type: 'boolean',
      description: 'Whether the visa is active (only relevant when visa details are provided)'
    }
  }
  // Removed required array to make all fields optional
};

const emergencyContactSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 100, description: 'Emergency contact name (optional)' },
    relationship: { type: 'string', maxLength: 50, description: 'Relationship to employee (optional)' },
    address: { type: 'string', maxLength: 200, description: 'Emergency contact address (optional)' },
    city: { type: 'string', maxLength: 100, description: 'City (optional)' },
    district: { type: 'string', maxLength: 100, description: 'District (optional)' },
    state: { type: 'string', maxLength: 100, description: 'State (optional)' },
    country: { type: 'string', maxLength: 100, description: 'Country (optional)' },
    pincode: { type: 'number', description: 'Pincode/Postal code (optional)' },
    mobileNo: { type: 'string', maxLength: 20, description: 'Mobile number (optional)' },
  },
  // All fields are optional
};

const governmentIdsSchema = {
  type: 'object',
  properties: {
    pan: {
      type: 'object',
      properties: {
        number: { type: 'string' },
        documentUrl: { type: 'string' },
      },
    },
    aadhaar: {
      type: 'object',
      properties: {
        number: { type: 'string' },
        documentUrl: { type: 'string' },
      },
    },
    passport: {
      type: 'object',
      properties: {
        number: { type: 'string' },
        documentUrl: { type: 'string' },
      },
    },
    voterId: {
      type: 'object',
      properties: {
        number: { type: 'string' },
        documentUrl: { type: 'string' },
      },
    },
    drivingLicense: {
      type: 'object',
      properties: {
        number: { type: 'string' },
        documentUrl: { type: 'string' },
      },
    },
    pf: {
      type: 'object',
      properties: {
        number: { type: 'string' },
        uan: { type: 'string' },
      },
    }
  },
};
const academicDetailsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      qualificationType: {
        type: 'string',
        description: 'Type of qualification'
      },
      fieldOfStudy: { type: 'string', description: 'Major or field of study' },
      institution: { type: 'string', description: 'Name of the educational institution' },
      grade: { type: 'string', description: 'Grade or percentage obtained' },
      yearOfCompletion: { type: ['string', 'number'], description: 'Year the qualification was completed' },
      documentUrl: { type: 'string', description: 'URL to the academic certificate' },
      documentId: { type: 'string', description: 'ID of the corresponding document record' },
      verificationStatus: {
        type: 'string',
        enum: ['Pending', 'Verified', 'Rejected'],
        default: 'Pending'
      },
    },
  },
};

const experienceDetailsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      companyName: { type: 'string', description: 'Name of the previous employer' },
      role: { type: 'string', description: 'Designation or role held' },
      startDate: { type: ['string', 'null'], description: 'Employment start date' },
      endDate: { type: ['string', 'null'], description: 'Employment end date' },
      duration: { type: 'string', description: 'Total duration of employment' },
      documentUrl: { type: 'string', description: 'URL to the experience certificate' },
      documentId: { type: 'string', description: 'ID of the corresponding document record' },
      companyAddress: { type: 'string' },
      lastDrawnSalary: { type: 'number' },
      reasonForLeaving: { type: 'string' },
      verificationStatus: {
        type: 'string',
        enum: ['Pending', 'Verified', 'Rejected'],
        default: 'Pending'
      },
    }
  },
};

// Unified user response schema
const userResponseSchema = {
  type: 'object',
  properties: {
    _id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string' },
    specificRole: { type: 'string' },
    departmentId: { type: 'string' },
    managerId: { type: 'string' },
    managerName: { type: 'string' },
    costCenter: { type: 'string' },
    gender: { type: 'string' },
    currentCompanyExperience: {
      type: 'object',
      properties: {
        years: { type: 'number' },
        months: { type: 'number' },
        totalMonths: { type: 'number' },
      }
    },
    employeeCode: { type: 'string' },
    checkinId: { type: 'string' },
    biometricId: { type: 'string' },
    active: { type: 'boolean' },
    joiningDate: { type: 'string', format: 'date-time' },
    location: { type: 'string' },
    phone: { type: 'string' },
    emergencyContact: emergencyContactSchema,
    address: { type: 'string' },
    bloodGroup: { type: 'string' },
    upcomingShiftAssignmentData: shiftAssignmentDataSchema,
    currentShiftAssignmentData: shiftAssignmentDataSchema,
    upcomingShiftAssignment: { type: 'string' },
    currentShiftAssignment: { type: 'string' },
    dateOfBirth: { type: 'string', format: 'date-time' },
    nationality: { type: 'string' },
    employmentStatus: { type: 'string' },
    holidayCalendarId: { type: 'string' },
    holidayCalendarHistory: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          calendarId: { type: 'string' },
          year: { type: 'number' },
          isActive: { type: 'boolean' },
          assignedAt: { type: 'string', format: 'date-time' },
          assignedBy: { type: 'string' }
        }
      }
    },
    weekendId: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    bankDetails: bankDetailsSchema,
    governmentIds: governmentIdsSchema,
    academicDetails: academicDetailsSchema,
    experienceDetails: experienceDetailsSchema,
    // PF (Provident Fund) related fields - individual fields
    pfNumber: { type: 'string' },
    uanNumber: { type: 'string' },
    familyPfNumber: { type: 'string' },
    pfJoinDate: { type: 'string', format: 'date-time' },
    // New fields for UAE + external user support
    country: { type: 'string' },
    currency: { type: 'string' },
    licenseType: { type: 'string' },
    portalAccess: { type: 'boolean' },
    // UAE-specific visa details
    visaDetails: visaDetailsSchema,
    client: { type: 'string' },
    isConsultancy: { type: 'boolean' },
    isIntern: { type: 'boolean' },
    // Employee detail fields (63-70)
    confirmationDate: { type: 'string', format: 'date-time' },
    probationDate: { type: 'string', format: 'date-time' },
    separationDate: { type: 'string', format: 'date-time' },
    fatherName: { type: 'string' },
    maritalStatus: { type: 'string' },
    spouseName: { type: 'string' },
    noticePeriod: { type: 'number' },
    personalMailId: { type: 'string' }
  }
};

export const userRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {

  // Unified GET users endpoint
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      // Temporarily commented out schema for debugging

      schema: {
        tags: ['User Management'],
        summary: 'Get users with flexible filtering',
        description: 'Unified endpoint to get users with various filtering options. Use query parameters to filter results.',
        querystring: {
          type: 'object',
          properties: {
            // Pagination
            page: {
              type: 'number',
              minimum: 1,
              description: 'Page number for pagination'
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 1000,
              description: 'Records per page'
            },
            // Special filters
            my: {
              type: 'boolean',
              description: 'Get current user profile (overrides other filters)'
            },
            subordinates: {
              type: 'boolean',
              description: 'Get subordinates of current user (requires manager/admin role)'
            },
            // Standard filters
            search: {
              type: 'string',
              description: 'Search by name or email'
            },
            role: {
              type: 'string',
              enum: ['admin', 'manager', 'staff', 'director', 'external'],
              description: 'Filter by user role'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive'],
              description: 'Filter by user status'
            },
            active: {
              type: 'boolean',
              description: 'Filter by active status (true for active, false for inactive)'
            },
            departmentId: {
              type: 'string',
              description: 'Filter by department ID'
            },
            country: {
              type: 'string',
              enum: ['IN', 'AE'],
              description: 'Filter by country'
            },
            licenseType: {
              type: 'string',
              enum: ['employee', 'external'],
              description: 'Filter by license type'
            },
            portalAccess: {
              type: 'boolean',
              description: 'Filter by portal access'
            },
            isConsultancy: {
              type: 'boolean',
              description: 'Filter by consultancy staff status'
            },
            isIntern: {
              type: 'boolean',
              description: 'Filter by intern status'
            },
            // Sorting
            sort: {
              type: 'string',
              default: 'name',
              description: 'Field to sort by (e.g., name, email, joiningDate)'
            },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              default: 'asc',
              description: 'Sort order (asc or desc)'
            },
            // Field selection
            select: {
              type: 'string',
              description: 'Comma-separated list of fields to include'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: userResponseSchema
              },
              meta: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' }
                }
              }
            }
          },
          400: {
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
        }
      }

    },
    async (request, reply) => {
      try {
        const query = request.query as {
          page?: number;
          limit?: number;
          my?: boolean;
          subordinates?: boolean;
          search?: string;
          role?: string;
          status?: string;
          active?: boolean;
          departmentId?: string;
          country?: string;
          licenseType?: string;
          portalAccess?: boolean;
          isConsultancy?: boolean;
          isIntern?: boolean;
          sort?: string;
          sortOrder?: 'asc' | 'desc';
          select?: string;
        };

        const authenticatedUser = request.user;

        // Validate query parameters
        // if (query.subordinates && !['manager', 'admin'].includes(authenticatedUser.role.toLowerCase())) {
        //   return reply.status(403).send({
        //     success: false,
        //     error: { message: 'Access denied: Only managers or admins can view subordinates' }
        //   });
        // }

        // Handle special cases
        if (query.my) {
          // Get current user by ID directly from database
          const currentUser = await request.container!.userService.findById(authenticatedUser._id.toString());
          return reply.send({
            success: true,
            data: [currentUser],
            meta: {
              page: 1,
              limit: 1,
              total: 1,
              totalPages: 1
            }
          });
        }

        // Call the unified service method for other cases
        const result = await request.container!.userService.getUsers(query, authenticatedUser);

        return reply.send({
          success: true,
          data: result.users,
          meta: result.meta
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Get user by ID (keep this separate for specific user lookup)
  fastify.get(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['User Management'],
        summary: 'Get user by ID',
        description: 'Get detailed information about a specific user by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string',
              description: 'User ID'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: userResponseSchema
            }
          },
          404: {
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
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = await request.container!.userService.findById(id);

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: { message: 'User not found' }
          });
        }

        return reply.send({
          success: true,
          data: user
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  //payroll get users (keep as is)
  fastify.get(
    '/payroll',
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 10 },
            month: { type: 'string' }, // format: 'YYYY-MM'
            departmentId: { type: 'string' },
            status: {
              type: 'array',
              items: { type: 'string', enum: ['Active', 'On Hold', 'Resigned'] },
            },
            active: {
              type: 'boolean',
              description: 'Filter by active status (true for active, false for inactive)'
            },
            role: { type: 'string' },
            search: { type: 'string' },
            country: { type: 'string', enum: ['AE', 'IN'] },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await request.container!.userService.adminFindUsers(request.query as {
          page?: number;
          limit?: number;
          search?: string;
          month?: string;
          departmentId?: string;
          role?: string;
          status?: ('Active' | 'On Hold' | 'Resigned')[];
          active?: boolean;
          country?: 'AE' | 'IN';
        });
        return reply.status(200).send({
          success: true,
          data: result.users,
          meta: result.meta,
        })
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );

  // Create new user
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      preValidation: async (request) => {
        // Handle biometricId before validation
        if (request.body && typeof request.body === 'object') {
          const body = request.body as any;
          console.log('🔍 Pre-validation biometricId value:', body.biometricId, 'type:', typeof body.biometricId);

          if (body.biometricId === '' || body.biometricId === null || body.biometricId === undefined) {
            body.biometricId = null;
            console.log('🔄 Pre-validation: Converted empty biometricId to null');
          } else if (typeof body.biometricId === 'string' && body.biometricId.trim() === '') {
            body.biometricId = null;
            console.log('🔄 Pre-validation: Converted whitespace-only biometricId to null');
          } else if (typeof body.biometricId === 'string' && body.biometricId.length > 20) {
            // Handle long biometricId - truncate or convert to null
            console.log('⚠️ Pre-validation: BiometricId too long (' + body.biometricId.length + ' chars), converting to null');
            body.biometricId = null;
          }
        }
      },
      schema: {
        tags: ['User Management'],
        summary: 'Create new user',
        description: 'Create a new user with specified details',
        body: {
          type: 'object',
          required: ['name', 'email', 'password', 'role', 'departmentId', 'costCenter', 'currency', 'employmentStatus', 'probationDate', 'noticePeriod'],
          properties: {
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 100,
              description: 'Full name of the user'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email address'
            },
            password: {
              type: 'string',
              minLength: 6,
              description: 'Password (min 6 characters)'
            },
            role: {
              type: 'string',
              description: 'Role'
            },
            specificRole: {
              type: 'string',
              description: 'Specific role designation'
            },
            departmentId: {
              type: 'string',
              description: 'Department value from LOV'
            },
            biometricId: {
              type: ['string', 'null'],
              description: 'Biometric device ID (optional)',
              nullable: true,
              maxLength: 100
            },
            active: {
              type: 'boolean',
              default: true,
              description: 'User active status'
            },
            managerId: {
              type: 'string',
              description: 'Manager ID'
            },
            costCenter: {
              type: 'string',
              maxLength: 150,
              description: 'Cost center (e.g., Chennai Office, Takeda)'
            },
            gender: { type: 'string' },
            // Virtual field returned in responses
            currentCompanyExperience: {
              type: 'object',
              properties: {
                years: { type: 'number' },
                months: { type: 'number' },
                totalMonths: { type: 'number' },
              }
            },
            employeeCode: {
              type: 'string',
              description: 'Employee code (mandatory and unique)',
              maxLength: 50
            },
            joiningDate: {
              type: 'string',
              format: 'date-time',
              description: 'Date when user joined'
            },
            location: {
              type: 'string',
              maxLength: 100,
              description: 'Work location',

            },
            phone: {
              type: 'string',
              maxLength: 20,
              description: 'Contact number'
            },
            emergencyContact: emergencyContactSchema,
            address: {
              type: 'string',
              maxLength: 200,
              description: 'Residential address'
            },
            bloodGroup: {
              type: 'string',
              maxLength: 5,
              description: 'Blood group'
            },
            dateOfBirth: {
              type: ['string', 'null'],
              format: 'date-time',
              description: 'Date of birth',
              nullable: true
            },
            nationality: {
              type: 'string',
              maxLength: 100,
              description: 'Employee nationality'
            },
            employmentStatus: {
              type: 'string',
              maxLength: 100,
              description: 'Employment status (e.g., Full-time, Contract, Probation)'
            },
            // New fields for UAE + external user support
            country: {
              type: 'string',
              enum: ['IN', 'AE'],
              default: 'IN',
              description: 'Country code (IN for India, AE for UAE)'
            },
            currency: {
              type: 'string',
              enum: ['INR', 'AED'],
              default: 'INR',
              description: 'Currency code (INR for India, AED for UAE)'
            },
            licenseType: {
              type: 'string',
              enum: ['employee', 'external'],
              default: 'employee',
              description: 'User license type (employee or external)'
            },
            portalAccess: {
              type: 'boolean',
              default: true,
              description: 'Whether user has portal access (false for external users)'
            },
            allowDuplicateEmail: {
              type: 'boolean',
              description: 'If true and email already exists: create payroll-only employee (same email, no login). Override attendance and generate payroll for this employee. Otherwise duplicate email is rejected.'
            },
            // UAE-specific visa details
            visaDetails: {
              type: 'object',
              properties: {
                visaType: {
                  type: 'string',
                  enum: ['Standard Employment Visa', 'Domestic Worker Visa', 'Green Visa'],
                  description: 'Type of UAE visa (required for UAE employees)'
                },
                visaExpiryDate: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Visa expiry date (required for UAE employees)'
                },
                isActive: {
                  type: 'boolean',
                  default: true,
                  description: 'Whether the visa is active'
                }
              }
            },
            client: {
              type: 'string',
              maxLength: 100,
              description: 'Client name or identifier for employee assignment'
            },
            isConsultancy: {
              type: 'boolean',
              description: 'Flag for consultancy staff (no PF, 1% TDS)'
            },
            isIntern: {
              type: 'boolean',
              description: 'Flag for intern employees (no PF, no tax, no professional tax)'
            },
            // PF (Provident Fund) related fields - individual fields
            pfNumber: {
              type: 'string',
              maxLength: 50,
              description: 'Provident Fund (PF) Number'
            },
            uanNumber: {
              type: 'string',
              maxLength: 50,
              description: 'Universal Account Number (UAN) for PF'
            },
            familyPfNumber: {
              type: 'string',
              maxLength: 50,
              description: 'Family Provident Fund Number'
            },
            pfJoinDate: {
              type: 'string',
              format: 'date-time',
              description: 'PF join date (optional)'
            },
            // Employee detail fields (63-70)
            confirmationDate: {
              type: 'string',
              format: 'date-time',
              description: 'Employee confirmation date'
            },
            probationDate: {
              type: 'string',
              maxLength: 100,
              description: 'Probation date (e.g. 2025-01-01 or date-time string)'
            },
            separationDate: {
              type: 'string',
              format: 'date-time',
              description: 'Employee separation date'
            },
            fatherName: {
              type: 'string',
              maxLength: 100,
              description: "Employee's father's name"
            },
            maritalStatus: {
              type: 'string',
              description: 'Employee marital status'
            },
            spouseName: {
              type: 'string',
              maxLength: 100,
              description: "Employee's spouse name"
            },
            noticePeriod: {
              type: 'number',
              minimum: 0,
              description: 'Notice period in days'
            },
            personalMailId: {
              type: 'string',
              format: 'email',
              description: "Employee's personal email address"
            },
            bankDetails: bankDetailsSchema,
            governmentIds: governmentIdsSchema,
            academicDetails: academicDetailsSchema,
            experienceDetails: experienceDetailsSchema
          },
        },
      },
    },
    async (request, reply) => {
      try {
        console.log('🚀 CREATE EMPLOYEE ENDPOINT CALLED');
        console.log('📦 Raw request body:', JSON.stringify(request.body, null, 2));
        console.log('📋 Request body type:', typeof request.body);
        console.log('📋 Request body keys:', Object.keys(request.body || {}));

        // Log each field individually for debugging
        const body = request.body as any;
        console.log('🔍 Individual field values:');
        console.log('  - name:', body.name, '(type:', typeof body.name, ')');
        console.log('  - email:', body.email, '(type:', typeof body.email, ')');
        console.log('  - password:', body.password ? '[HIDDEN]' : 'undefined', '(type:', typeof body.password, ')');
        console.log('  - role:', body.role, '(type:', typeof body.role, ')');
        console.log('  - specificRole:', body.specificRole, '(type:', typeof body.specificRole, ')');
        console.log('  - departmentId:', body.departmentId, '(type:', typeof body.departmentId, ')');
        console.log('  - managerId:', body.managerId, '(type:', typeof body.managerId, ')');
        console.log('  - biometricId:', body.biometricId, '(type:', typeof body.biometricId, ')');
        console.log('  - active:', body.active, '(type:', typeof body.active, ')');
        console.log('  - joiningDate:', body.joiningDate, '(type:', typeof body.joiningDate, ')');
        console.log('  - dateOfBirth:', body.dateOfBirth, '(type:', typeof body.dateOfBirth, ')');
        console.log('  - phone:', body.phone, '(type:', typeof body.phone, ')');
        console.log('  - location:', body.location, '(type:', typeof body.location, ')');
        console.log('  - emergencyContact:', body.emergencyContact, '(type:', typeof body.emergencyContact, ')');
        console.log('  - address:', body.address, '(type:', typeof body.address, ')');
        console.log('  - bloodGroup:', body.bloodGroup, '(type:', typeof body.bloodGroup, ')');
        console.log('  - country:', body.country, '(type:', typeof body.country, ')');
        console.log('  - currency:', body.currency, '(type:', typeof body.currency, ')');
        console.log('  - licenseType:', body.licenseType, '(type:', typeof body.licenseType, ')');
        console.log('  - client:', body.client, '(type:', typeof body.client, ')');
        console.log('  - upcomingShiftAssignment:', body.upcomingShiftAssignment, '(type:', typeof body.upcomingShiftAssignment, ')');
        console.log('  - currentShiftAssignment:', body.currentShiftAssignment, '(type:', typeof body.currentShiftAssignment, ')');
        console.log('  - upcomingShiftAssignmentData:', body.upcomingShiftAssignmentData, '(type:', typeof body.upcomingShiftAssignmentData, ')');
        console.log('  - currentShiftAssignmentData:', body.currentShiftAssignmentData, '(type:', typeof body.currentShiftAssignmentData, ')');
        console.log('  - visaDetails:', body.visaDetails, '(type:', typeof body.visaDetails, ')');

        if (body.visaDetails) {
          console.log('🛂 Visa Details Breakdown:');
          console.log('    - visaType:', body.visaDetails.visaType, '(type:', typeof body.visaDetails.visaType, ')');
          console.log('    - visaExpiryDate:', body.visaDetails.visaExpiryDate, '(type:', typeof body.visaDetails.visaExpiryDate, ')');
          console.log('    - isActive:', body.visaDetails.isActive, '(type:', typeof body.visaDetails.isActive, ')');
        }

        console.log('🎯 Calling userService.create with payload...');
        const user = await request.container!.userService.create(request.body as any);
        console.log('✅ User created successfully:', user._id);

        return reply.status(201).send({
          success: true,
          data: user,
        });
      } catch (error: any) {
        console.error('❌ CREATE EMPLOYEE ERROR:', error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error name:', error.name);

        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Update user
  fastify.put(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['User Management'],
        summary: 'Update user',
        description: 'Update a user with the given details',
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 100 },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 6 },
            role: { type: 'string' },
            specificRole: { type: 'string' },
            departmentId: { type: 'string' },
            managerId: { type: 'string' },
            employeeCode: { type: 'string', maxLength: 50 },
            biometricId: { type: 'string', maxLength: 20 },
            active: {
              type: 'boolean',
              description: 'User active status (can be updated to true or false)'
            },
            joiningDate: { type: 'string', format: 'date-time' },
            costCenter: { type: 'string', maxLength: 150 },
            gender: { type: 'string' },
            // Virtual field (read-only)
            currentCompanyExperience: {
              type: 'object',
              properties: {
                years: { type: 'number' },
                months: { type: 'number' },
                totalMonths: { type: 'number' },
              }
            },
            location: { type: 'string', maxLength: 100 },
            phone: { type: 'string', maxLength: 20 },
            emergencyContact: emergencyContactSchema,
            address: { type: 'string', maxLength: 200 },
            bloodGroup: { type: 'string', maxLength: 5 },
            dateOfBirth: { type: 'string', format: 'date-time' },
            nationality: {
              type: 'string',
              maxLength: 100,
              description: 'Employee nationality'
            },
            employmentStatus: {
              type: 'string',
              maxLength: 100,
              description: 'Employment status (e.g., Full-time, Contract)'
            },
            bankDetails: bankDetailsSchema,
            // New fields for UAE + external user support
            country: {
              type: 'string',
              enum: ['IN', 'AE'],
              description: 'Country code (IN for India, AE for UAE)'
            },
            currency: {
              type: 'string',
              enum: ['INR', 'AED'],
              description: 'Currency code (INR for India, AED for UAE)'
            },
            licenseType: {
              type: 'string',
              enum: ['employee', 'external'],
              description: 'User license type (employee or external)'
            },
            portalAccess: {
              type: 'boolean',
              description: 'Whether user has portal access (false for external users)'
            },
            // UAE-specific visa details
            visaDetails: {
              type: 'object',
              properties: {
                visaType: {
                  type: 'string',
                  enum: ['Standard Employment Visa', 'Domestic Worker Visa', 'Green Visa'],
                  description: 'Type of UAE visa (required for UAE employees)'
                },
                visaExpiryDate: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Visa expiry date (required for UAE employees)'
                },
                isActive: {
                  type: 'boolean',
                  description: 'Whether the visa is active'
                }
              }
            },
            client: {
              type: 'string',
              maxLength: 100,
              description: 'Client name or identifier for employee assignment'
            },
            isConsultancy: {
              type: 'boolean',
              description: 'Flag for consultancy staff (no PF, 1% TDS)'
            },
            isIntern: {
              type: 'boolean',
              description: 'Flag for intern employees (no PF, no tax, no professional tax)'
            },
            // PF (Provident Fund) related fields - individual fields
            pfNumber: {
              type: 'string',
              maxLength: 50,
              description: 'Provident Fund (PF) Number'
            },
            uanNumber: {
              type: 'string',
              maxLength: 50,
              description: 'Universal Account Number (UAN) for PF'
            },
            familyPfNumber: {
              type: 'string',
              maxLength: 50,
              description: 'Family Provident Fund Number'
            },
            pfJoinDate: {
              type: 'string',
              format: 'date-time',
              description: 'PF join date (optional)'
            },
            // Employee detail fields (63-70)
            confirmationDate: {
              type: 'string',
              format: 'date-time',
              description: 'Employee confirmation date'
            },
            probationDate: {
              type: 'string',
              maxLength: 100,
              description: 'Probation date (as string)'
            },
            separationDate: {
              type: 'string',
              format: 'date-time',
              description: 'Employee separation date'
            },
            fatherName: {
              type: 'string',
              maxLength: 100,
              description: "Employee's father's name"
            },
            maritalStatus: {
              type: 'string',
              description: 'Employee marital status'
            },
            spouseName: {
              type: 'string',
              maxLength: 100,
              description: "Employee's spouse name"
            },
            noticePeriod: {
              type: 'number',
              minimum: 0,
              description: 'Notice period in days'
            },
            personalMailId: {
              type: 'string',
              format: 'email',
              description: "Employee's personal email address"
            },
            governmentIds: governmentIdsSchema,
            academicDetails: academicDetailsSchema,
            experienceDetails: experienceDetailsSchema
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as any;

        // Log the incoming request
        console.log('📨 [PUT /users/:id] Update request received');
        console.log('🔍 Active field in request body:', body.active, '(type:', typeof body.active, ')');
        console.log('📦 Full request body:', JSON.stringify(body, null, 2));

        const user = await request.container!.userService.update(id, body);

        console.log('✅ [PUT /users/:id] Update successful - user.active:', user.active);

        return reply.send({
          success: true,
          data: user,
        });
      } catch (error: any) {
        console.error('❌ [PUT /users/:id] Update error:', error.message);
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Delete user (soft delete)
  fastify.delete(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['User Management'],
        summary: 'Delete user',
        description: 'Delete a user by ID',
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        await request.container!.userService.delete(id);
        return reply.send({
          success: true,
          data: { message: 'User deactivated successfully' },
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  //Update FCMToken
  fastify.patch<{
    Params: { id: string };
    Body: { fcmToken: string };
  }>(
    '/:id/fcm-token',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['User Management'],
        summary: 'Update FCM Token',
        description: 'Update the FCM token for push notifications',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'User ID' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            fcmToken: { type: 'string' },
          },
          required: ['fcmToken'],
        },
      },
    },
    async (request, reply) => {
      try {
        const { fcmToken } = request.body;
        const { id } = request.params as { id: string };
        console.log('fcmToken:', fcmToken, 'id:', id, "updateFcmToken");

        // Update FCM token
        await request.container!.userService.updateFcmToken(id, fcmToken);

        // Get updated user to check role
        const user = await request.container!.userService.findById(id);

        // If user is admin, check for visa expiry and send notification if needed
        if (user && user.role.toLowerCase() === 'admin') {
          try {
            console.log('Admin logged in, checking visa expiry...');

            // Get visa expiry data first
            const visaData = await request.container!.userService.getUAEUsersWithExpiringVisas(30);
            console.log(visaData, "visaData")
            // Only send notification if there are expiring visas
            if (visaData.totalCount > 0) {
              console.log(`Found ${visaData.totalCount} expiring visas, sending notification...`);

              // Generate visa expiry notification
              const notificationData = await request.container!.userService.generateVisaExpiryNotification(30);

              // Send notification to admin
              const notificationResult = await request.container!.userService.sendNotification(
                id,
                notificationData.title,
                notificationData.body,
                notificationData.data
              );

              console.log('Visa expiry notification sent to admin:', notificationResult);

              return reply.send({
                success: true,
                data: {
                  message: 'FCM token updated successfully',
                  adminNotification: {
                    sent: true,
                    title: notificationData.title,
                    body: notificationData.body,
                    visaCount: visaData.totalCount,
                    userNames: notificationData.data.user_names
                  }
                },
              });
            } else {
              console.log('No expiring visas found, skipping notification');
              return reply.send({
                success: true,
                data: {
                  message: 'FCM token updated successfully',
                  adminNotification: {
                    sent: false,
                    reason: 'no_expiring_visas',
                    visaCount: 0
                  }
                },
              });
            }
          } catch (notificationError: any) {
            console.error('Failed to check visa expiry or send admin notification:', notificationError);
            // Don't fail the FCM update if notification fails
            return reply.send({
              success: true,
              data: {
                message: 'FCM token updated successfully',
                adminNotification: {
                  sent: false,
                  error: notificationError.message
                }
              },
            });
          }
        }

        return reply.send({
          success: true,
          data: { message: 'FCM token updated successfully' },
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );

  // Test notification FCM - Simple version for testing
  fastify.get<{
    Querystring: { userId: string; title?: string; body?: string }
  }>('/test-notify', {
    // preHandler: [authenticate] // Disabled for easy testing
  }, async (request, reply) => {
    try {
      const { userId, title = 'Test Notification', body = 'Hi from Backend!' } = request.query;

      // First, let's check if the user exists and has an FCM token
      const user = await request.container!.userService.findById(userId);

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { message: 'User not found' }
        });
      }

      if (!user.fcmToken) {
        return reply.status(400).send({
          success: false,
          error: { message: 'User does not have FCM token registered' }
        });
      }

      console.log('Testing notification for user:', {
        userId,
        userName: user.name,
        userEmail: user.email,
        fcmToken: user.fcmToken ? `${user.fcmToken.substring(0, 20)}...` : 'null'
      });

      const result = await request.container!.userService.sendNotification(
        userId,
        title,
        body,
        {
          type: 'test_notification',
          action: 'view_details',
          timestamp: Date.now().toString()
        }
      );

      return reply.send({
        success: true,
        message: 'Notification sent successfully',
        data: {
          ...result,
          userInfo: {
            name: user.name,
            email: user.email,
            fcmTokenExists: !!user.fcmToken
          }
        }
      });
    } catch (error: any) {
      console.error('Test notification error:', error);
      return reply.status(400).send({
        success: false,
        error: {
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR'
        }
      });
    }
  });

  // Test notification by FCM token directly
  fastify.post<{
    Body: {
      fcmToken: string;
      title?: string;
      body?: string;
      data?: Record<string, string>
    }
  }>('/test-notify-token', {
    // preHandler: [authenticate] // Disabled for easy testing
  }, async (request, reply) => {
    try {
      const { fcmToken, title = 'BE Trigger  Token Test', body = 'Testing with FCM token directly!', data = {} } = request.body;

      if (!fcmToken) {
        return reply.status(400).send({
          success: false,
          error: { message: 'FCM token is required' }
        });
      }

      console.log('Testing notification with token directly:', {
        fcmToken: fcmToken ? `${fcmToken.substring(0, 20)}...` : 'null',
        title,
        body
      });

      // Create message structure
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          type: 'direct_token_test',
          action: 'view_details',
          timestamp: Date.now().toString()
        },
        token: fcmToken,
        webpush: {
          headers: {
            Urgency: 'high'
          },
          notification: {
            icon: '/icon-192x192.png',
            requireInteraction: true,
            actions: [
              {
                action: 'open',
                title: 'Open'
              }
            ]
          }
        },
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            priority: 'high' as const,
            channelId: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      console.log('Sending direct token notification:', JSON.stringify(message, null, 2));

      const response = await messaging.send(message);
      console.log('Direct token notification sent successfully:', response);

      return reply.send({
        success: true,
        message: 'Direct token notification sent successfully',
        data: {
          messageId: response,
          fcmToken: fcmToken ? `${fcmToken.substring(0, 20)}...` : 'null',
          title,
          body
        }
      });
    } catch (error: any) {
      console.error('Direct token notification error:', error);
      return reply.status(400).send({
        success: false,
        error: {
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR'
        }
      });
    }
  });

  // Debug FCM token route
  fastify.get<{
    Querystring: { userId: string }
  }>('/debug-fcm-token', {
    // preHandler: [authenticate] // Enable authentication for security
  }, async (request, reply) => {
    try {
      const { userId } = request.query;

      const user = await request.container!.userService.findById(userId);

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { message: 'User not found' }
        });
      }

      return reply.send({
        success: true,
        data: {
          userId: user._id,
          name: user.name,
          email: user.email,
          fcmToken: user.fcmToken,
          fcmTokenExists: !!user.fcmToken,
          fcmTokenLength: user.fcmToken ? user.fcmToken.length : 0,
          fcmTokenPreview: user.fcmToken ? `${user.fcmToken.substring(0, 20)}...` : null
        }
      });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { message: error.message }
      });
    }
  });

  // Bulk test notification route
  fastify.post<{
    Body: {
      userIds: string[];
      title?: string;
      body?: string;
      data?: Record<string, string>
    }
  }>('/test-bulk-notify', {
    preHandler: [authenticate],
    schema: {
      tags: ['User Management'],
      summary: 'Test bulk notifications',
      description: 'Send test notifications to multiple users',
      body: {
        type: 'object',
        properties: {
          userIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of user IDs to send notifications to'
          },
          title: {
            type: 'string',
            default: 'Bulk Test Notification',
            description: 'Notification title'
          },
          body: {
            type: 'string',
            default: 'This is a bulk test notification',
            description: 'Notification body'
          },
          data: {
            type: 'object',
            description: 'Additional data to send with notification'
          }
        },
        required: ['userIds']
      }
    }
  }, async (request, reply) => {
    try {
      const { userIds, title = 'Bulk Test Notification', body = 'This is a bulk test notification', data = {} } = request.body;

      if (!userIds || userIds.length === 0) {
        return reply.status(400).send({
          success: false,
          error: { message: 'User IDs array is required and cannot be empty' }
        });
      }

      console.log('Testing bulk notification for users:', userIds);

      const result = await request.container!.userService.sendBulkNotifications(
        userIds,
        title,
        body,
        data
      );

      return reply.send({
        success: true,
        message: 'Bulk notifications sent successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Bulk test notification error:', error);
      return reply.status(400).send({
        success: false,
        error: {
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR'
        }
      });
    }
  });

  // Check visa expiry and send notification to admin
  fastify.get<{
    Querystring: { adminUserId: string; daysAhead?: number }
  }>('/check-visa-expiry', {
    onRequest: [authenticate],
    schema: {
      tags: ['User Management'],
      summary: 'Check UAE visa expiry and notify admin',
      description: 'Check for UAE employees with visas expiring soon and send notification to admin',
      querystring: {
        type: 'object',
        properties: {
          adminUserId: {
            type: 'string',
            description: 'Admin user ID to send notification to'
          },
          daysAhead: {
            type: 'number',
            default: 30,
            description: 'Number of days ahead to check for expiring visas'
          }
        },
        required: ['adminUserId']
      }
    }
  }, async (request, reply) => {
    try {
      const { adminUserId, daysAhead = 30 } = request.query;

      // Verify the target user is an admin
      const adminUser = await request.container!.userService.findById(adminUserId);
      if (!adminUser || adminUser.role.toLowerCase() !== 'admin') {
        return reply.status(400).send({
          success: false,
          error: { message: 'Target user must be an admin' }
        });
      }

      // Get visa expiry data
      const visaData = await request.container!.userService.getUAEUsersWithExpiringVisas(daysAhead);

      // Only send notification if there are expiring visas
      if (visaData.totalCount > 0) {
        console.log(`Found ${visaData.totalCount} expiring visas, sending notification...`);

        // Generate notification
        const notificationData = await request.container!.userService.generateVisaExpiryNotification(daysAhead);
        console.log(notificationData, "notificationData")
        // Send notification to admin
        const notificationResult = await request.container!.userService.sendNotification(
          adminUserId,
          notificationData.title,
          notificationData.body,
          notificationData.data
        );

        return reply.send({
          success: true,
          message: 'Visa expiry check completed and notification sent',
          data: {
            visaData,
            notification: notificationData,
            notificationResult,
            notificationSent: true
          }
        });
      } else {
        console.log('No expiring visas found, skipping notification');
        return reply.send({
          success: true,
          message: 'Visa expiry check completed - no expiring visas found',
          data: {
            visaData,
            notificationSent: false,
            reason: 'no_expiring_visas'
          }
        });
      }
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { message: error.message }
      });
    }
  });

  // Send notification to multiple users
  fastify.post<{
    Body: {
      userIds: string[];
      title: string;
      body: string;
      data?: Record<string, string>;
    }
  }>('/send-notification', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      // Only admins can send bulk notifications
      if (request.user.role !== 'ADMIN') {
        return reply.status(403).send({
          success: false,
          error: { message: 'Forbidden: Only admins can send bulk notifications' }
        });
      }

      const { userIds, title, body, data } = request.body;

      const results = await request.container!.userService.sendBulkNotifications(
        userIds,
        title,
        body,
        data
      );

      return reply.send({
        success: true,
        message: 'Bulk notifications sent',
        data: results
      });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { message: error.message }
      });
    }
  });

  // Download user data as Excel
  fastify.get(
    '/export',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['User Management'],
        summary: 'Export user data as Excel file',
        description: 'Download all active users data as an Excel file with visa details in separate columns',
        response: {
          200: {
            type: 'string',
            format: 'binary',
            description: 'Excel file buffer'
          },
          401: {
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
        }
      }
    },
    async (request, reply) => {
      try {
        // Check if user has permission to export data
        const authenticatedUser = request.user;
        if (!['admin', 'manager'].includes(authenticatedUser.role.toLowerCase())) {
          return reply.status(403).send({
            success: false,
            error: { message: 'Access denied: Only admins and managers can export user data' }
          });
        }

        // Get all active users with visa details
        const users = await request.container!.userService.getUsers({
          status: 'active',
          limit: 10000 // Get all users
        }, authenticatedUser);

        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Users Data');

        // Define headers
        const headers = [
          'Name',
          'Email',
          'Employee Code',
          'Role',
          'Department ID',
          'Manager Name',
          'Biometric ID',
          'Active',
          'Joining Date',
          'Country',
          'Location',
          'Phone',
          'License Type',
          'Portal Access',
          'Visa Type',
          'Visa Expiry Date',
          'Visa Is Active',
          'Client'
        ];

        // Add headers to worksheet
        worksheet.addRow(headers);

        // Style the header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };

        // Add data rows
        users.users.forEach((user: any) => {
          const row = [
            user.name || '',
            user.email || '',
            user.employeeCode || '',
            user.role || '',
            user.departmentId || '',
            user.managerName || '',
            user.biometricId || '',
            user.active ? 'Yes' : 'No',
            user.joiningDate ? new Date(user.joiningDate).toLocaleDateString() : '',
            user.country || '',
            user.location || '',
            user.phone || '',
            user.licenseType || '',
            user.portalAccess ? 'Yes' : 'No',
            user.visaDetails?.visaType || '',
            user.visaDetails?.visaExpiryDate ? new Date(user.visaDetails.visaExpiryDate).toLocaleDateString() : '',
            user.visaDetails?.isActive ? 'Yes' : 'No',
            user.client || ''
          ];
          worksheet.addRow(row);
        });

        // Auto-fit columns
        worksheet.columns.forEach((column, index) => {
          column.width = Math.max(
            column.width || 10,
            headers[index]?.length || 10
          );
        });

        // Add some styling
        worksheet.getColumn('A').width = 25; // Name
        worksheet.getColumn('B').width = 30; // Email
        worksheet.getColumn('C').width = 15; // Role
        worksheet.getColumn('D').width = 20; // Department ID
        worksheet.getColumn('E').width = 25; // Manager Name
        worksheet.getColumn('F').width = 15; // Biometric ID
        worksheet.getColumn('G').width = 10; // Active
        worksheet.getColumn('H').width = 15; // Joining Date
        worksheet.getColumn('I').width = 10; // Country
        worksheet.getColumn('J').width = 20; // Location
        worksheet.getColumn('K').width = 15; // Phone
        worksheet.getColumn('L').width = 15; // License Type
        worksheet.getColumn('M').width = 15; // Portal Access
        worksheet.getColumn('N').width = 25; // Visa Type
        worksheet.getColumn('O').width = 15; // Visa Expiry Date
        worksheet.getColumn('P').width = 15; // Visa Is Active

        // Generate Excel buffer
        const buffer = await workbook.xlsx.writeBuffer();

        // Set response headers
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', 'attachment; filename="users_export.xlsx"');

        return reply.send(buffer);
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Upload government ID files
  fastify.post<{ Params: { id: string } }>(
    '/:id/government-ids/files',
    {
      onRequest: [authenticate],
      preHandler: [filesUpload],
      schema: {
        tags: ['User Management'],
        summary: 'Upload government ID files',
        description: 'Upload files for government IDs (PAN, Aadhaar, Passport, Voter ID, Driving License)',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'User ID' }
          },
          required: ['id']
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const rawGovStatus = (request.body as any)?.verificationStatus;
        const verificationStatus: 'Pending' | 'Verified' | 'Rejected' | undefined =
          rawGovStatus === 'Pending' || rawGovStatus === 'Verified' || rawGovStatus === 'Rejected'
            ? rawGovStatus
            : undefined;
        const user = await request.container!.userService.updateGovernmentIdFiles(
          id,
          request,
          verificationStatus
        );

        return reply.status(200).send({
          success: true,
          data: user
        });
      } catch (error: any) {
        console.error('Error uploading government ID files:', error);
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Upload academic detail document
  fastify.post<{ Params: { id: string }; Querystring: { index: string } }>(
    '/:id/academic-details/files',
    {
      onRequest: [authenticate],
      preHandler: [filesUpload],
      schema: {
        tags: ['User Management'],
        summary: 'Upload academic detail document',
        description: 'Upload a document for a specific academic detail entry',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'User ID' }
          },
          required: ['id']
        },
        querystring: {
          type: 'object',
          properties: {
            index: { type: 'string', description: 'Index of the academic detail entry (0-based)' }
          },
          required: ['index']
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { index } = request.query as { index: string };
        const files = (request as any).files as any[];

        if (!files || files.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'No file uploaded' }
          });
        }

        const academicDetailIndex = parseInt(index, 10);
        if (isNaN(academicDetailIndex) || academicDetailIndex < 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'Invalid academic detail index' }
          });
        }

        const body = request.body as any;
        const rawAcademicStatus = body?.verificationStatus;
        const verificationStatus: 'Pending' | 'Verified' | 'Rejected' | undefined =
          rawAcademicStatus === 'Pending' || rawAcademicStatus === 'Verified' || rawAcademicStatus === 'Rejected'
            ? rawAcademicStatus
            : undefined;

        // Extract metadata if available
        const metadata = body?.institution || body?.yearOfCompletion
          ? {
            institution: body?.institution,
            yearOfCompletion: body?.yearOfCompletion,
            qualificationType: body?.qualificationType,
            fieldOfStudy: body?.fieldOfStudy
          }
          : undefined;

        const result = await request.container!.userService.uploadAcademicDetailDocument(
          id,
          academicDetailIndex,
          files[0],
          metadata,
          verificationStatus
        );

        return reply.status(200).send({
          success: true,
          data: result
        });
      } catch (error: any) {
        console.error('Error uploading academic detail document:', error);
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Upload experience detail document
  fastify.post<{ Params: { id: string }; Querystring: { index: string } }>(
    '/:id/experience-details/files',
    {
      onRequest: [authenticate],
      preHandler: [filesUpload],
      schema: {
        tags: ['User Management'],
        summary: 'Upload experience detail document',
        description: 'Upload a document for a specific experience detail entry',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'User ID' }
          },
          required: ['id']
        },
        querystring: {
          type: 'object',
          properties: {
            index: { type: 'string', description: 'Index of the experience detail entry (0-based)' }
          },
          required: ['index']
        }
      }
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { index } = request.query as { index: string };
        const files = (request as any).files as any[];

        if (!files || files.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'No file uploaded' }
          });
        }

        const experienceDetailIndex = parseInt(index, 10);
        if (isNaN(experienceDetailIndex) || experienceDetailIndex < 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'Invalid experience detail index' }
          });
        }

        const body = request.body as any;
        const rawExperienceStatus = body?.verificationStatus;
        const verificationStatus: 'Pending' | 'Verified' | 'Rejected' | undefined =
          rawExperienceStatus === 'Pending' || rawExperienceStatus === 'Verified' || rawExperienceStatus === 'Rejected'
            ? rawExperienceStatus
            : undefined;

        // Extract metadata if available
        const metadata = body?.companyName || body?.duration || body?.role
          ? {
            companyName: body?.companyName,
            duration: body?.duration,
            role: body?.role
          }
          : undefined;

        const result = await request.container!.userService.uploadExperienceDetailDocument(
          id,
          experienceDetailIndex,
          files[0],
          metadata,
          verificationStatus
        );

        return reply.status(200).send({
          success: true,
          data: result
        });
      } catch (error: any) {
        console.error('Error uploading experience detail document:', error);
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );
};
