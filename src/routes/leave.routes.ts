/* eslint-disable @typescript-eslint/no-unused-vars */
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { ILeaveCreate, ILeaveQuery } from '../services/leave.service';
import { leaveSummaryRoutes } from './leave-summary.routes';
import { Leave } from '../models';
import mongoose from 'mongoose';
import { parseMultipartForm } from '../utilis/parseMultiPartForm';
import { uploadFileToGCP } from '../utilis/gcpStorage';
import * as fs from 'fs';
import * as path from 'path';
import { Types } from 'mongoose';

export const leaveRoutes: RouteHandler = async (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> => {
  let value = await leaveSummaryRoutes(fastify);
  console.log(value, 'value');
  // Apply for leave
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Leave Management'],
        summary: 'Apply for leave',
        description: 'Submit a new leave request',
        body: {
          type: 'object',
          required: ['leaveTypeId', 'startDate', 'endDate'],
          properties: {
            leaveTypeId: {
              type: 'string',
              description: 'Type of leave being requested'
            },
            startDate: {
              type: 'string',
              format: 'date',
              description: 'Leave start date (YYYY-MM-DD)'
            },
            endDate: {
              type: 'string',
              format: 'date',
              description: 'Leave end date (YYYY-MM-DD). For half-day leaves, must be same as startDate'
            },
            remarks: {
              type: 'string',
              description: 'Additional remarks for the leave request'
            },
            noOfDays: {
              type: 'number',
              description: 'Number of days for leave (0.5 for half-day, 1+ for full-day)'
            },
            reason: {
              type: 'string',
              description: 'Reason for leave'
            },
            appliedTo: {
              type: 'object',
              description: 'Leave applied'
            },
            leaveDuration: {
              type: 'string',
              enum: ['full-day', 'half-day'],
              description: 'Leave duration type (India only). Default: full-day'
            },
            halfDayType: {
              type: 'string',
              enum: ['first-half', 'second-half'],
              description: 'Half-day type - required when leaveDuration is half-day (India only)'
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  userId: { type: 'string' },
                  leaveTypeId: { type: 'string' },
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' },
                  status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] },
                  remarks: { type: 'string' },
                  noOfDays: { type: 'number' },
                  reason: { type: 'string' },
                }
              }
            }
          }
        }
      },
    },
    async (request, reply) => {
      try {
        // Start of Selection
        const body = request.body as {
          leaveTypeId: string;
          startDate: string;
          endDate: string;
          remarks?: string;
          leaveType?: string;
          noOfDays?: number; // Optional - will be calculated by backend (excludes weekends and mandatory holidays)
          reason: string;
          appliedTo: {
            _id: string;
            name: string;
          };
          leaveDuration?: 'full-day' | 'half-day';
          halfDayType?: 'first-half' | 'second-half';
        };

        const leaveData: ILeaveCreate = {
          userId: (request.user as any)._id,
          leaveTypeId: body.leaveTypeId,
          leaveType: body.leaveType,
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          remarks: body.remarks,
          // noOfDays is calculated by backend - ignore frontend value if provided
          noOfDays: body.noOfDays, // Will be overridden by backend calculation
          reason: body.reason,
          appliedTo: body.appliedTo,
          leaveDuration: body.leaveDuration || 'full-day',
          halfDayType: body.halfDayType,
        };
        console.log(leaveData, 'leaveData insert');
        const leave = await request.container!.leaveService.create(leaveData);
        return reply.status(201).send({
          success: true,
          data: leave,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Apply for leave on behalf (Admin only)
  fastify.post(
    '/apply-on-behalf',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Leave Management'],
        summary: 'Apply for leave on behalf of employee (Admin only)',
        description: 'Admin can apply for leave on behalf of an employee after 3 business days. Supports optional document uploads.',
        consumes: ['multipart/form-data'],
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  userId: { type: 'string' },
                  leaveTypeId: { type: 'string' },
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' },
                  status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] },
                  appliedOnBehalf: { type: 'boolean' },
                  appliedBy: { type: 'object' },
                  documents: { type: 'array' },
                }
              }
            }
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const currentUser = request.user as any;
        const userRole = currentUser?.role?.toLowerCase() || '';
        const isSuperAdmin = currentUser?.isSuperAdmin || false;

        // Check if user is admin
        if (userRole !== 'admin' && !isSuperAdmin) {
          return reply.status(403).send({
            success: false,
            error: { message: 'Only admins can apply for leave on behalf of employees' },
          });
        }

        // Parse multipart form data or JSON body
        let body: any;
        let files: any[] = [];

        // Check if request has multipart content
        const contentType = request.headers['content-type'] || '';
        const isMultipart = contentType.includes('multipart/form-data');

        if (isMultipart) {
          try {
            const parsed = await parseMultipartForm(request);
            body = parsed.body;
            files = parsed.files || [];
          } catch (parseError: any) {
            console.error('Error parsing multipart form:', parseError);
            // Fallback to request.body if parsing fails
            body = (request as any).body || {};
            files = [];
          }
        } else {
          // Regular JSON body
          body = request.body as any;
          files = [];
        }

        // Debug logging
        console.log('Content-Type:', contentType);
        console.log('Is Multipart:', isMultipart);
        console.log('Parsed body:', body);
        console.log('Body keys:', Object.keys(body || {}));
        console.log('Files count:', files.length);

        // Validate required fields - handle both undefined and empty strings
        const userId = body?.userId?.trim ? body.userId.trim() : body?.userId || '';
        const leaveTypeId = body?.leaveTypeId?.trim ? body.leaveTypeId.trim() : body?.leaveTypeId || '';
        const startDate = body?.startDate?.trim ? body.startDate.trim() : body?.startDate || '';
        const endDate = body?.endDate?.trim ? body.endDate.trim() : body?.endDate || '';
        const reason = body?.reason?.trim ? body.reason.trim() : body?.reason || ''; // Optional field

        // Check which required fields are missing (reason is optional)
        const missingFields: string[] = [];
        if (!userId) missingFields.push('userId');
        if (!leaveTypeId) missingFields.push('leaveTypeId');
        if (!startDate) missingFields.push('startDate');
        if (!endDate) missingFields.push('endDate');
        // reason is optional, so we don't check it

        if (missingFields.length > 0) {
          console.log('Missing fields:', missingFields);
          console.log('Body values:', { userId, leaveTypeId, startDate, endDate, reason });
          return reply.status(400).send({
            success: false,
            error: {
              message: `Missing required fields: ${missingFields.join(', ')}`,
              missingFields: missingFields
            },
          });
        }

        const remarks = body.remarks || (body as any).remarks;
        const leaveType = body.leaveType || (body as any).leaveType;
        const leaveDuration = body.leaveDuration || (body as any).leaveDuration || 'full-day';
        const halfDayType = body.halfDayType || (body as any).halfDayType;

        // Parse appliedTo if it's a JSON string
        let appliedTo: { _id: string; name: string } | undefined;
        if (body.appliedTo) {
          try {
            appliedTo = typeof body.appliedTo === 'string' ? JSON.parse(body.appliedTo) : body.appliedTo;
          } catch {
            appliedTo = body.appliedTo as any;
          }
        }

        // Process uploaded documents (optional)
        const documents: Array<{ fileName: string; filePath: string; uploadDate: Date; uploadedBy: Types.ObjectId }> = [];
        const fileErrors: string[] = [];

        if (files && files.length > 0) {
          if (files.length > 1) {
            return reply.status(400).send({
              success: false,
              error: { message: 'Maximum 1 supporting document is allowed' },
            });
          }

          // File validation constants
          const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
          const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];

          for (const file of files) {
            try {
              // Validate file type
              const fileExt = path.extname(file.filename).toLowerCase();
              if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
                fileErrors.push(`File "${file.filename}" has invalid extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
                continue;
              }

              // Validate file size
              const buffer = await file.toBuffer();
              if (buffer.length > MAX_FILE_SIZE) {
                fileErrors.push(`File "${file.filename}" exceeds maximum size of 1MB`);
                continue;
              }

              // Save file temporarily
              const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
              await fs.promises.mkdir(uploadsDir, { recursive: true });
              const timestamp = Date.now();
              const randomSuffix = Math.random().toString(36).substring(2, 8);
              const sanitizedFileName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
              const tempFilePath = path.join(uploadsDir, `leave_${timestamp}_${randomSuffix}_${sanitizedFileName}`);

              // Save file buffer to disk
              await fs.promises.writeFile(tempFilePath, buffer);

              // Upload to GCP
              const newFileName = `Leave_Doc_${userId}_${timestamp}_${randomSuffix}${fileExt}`;
               const gcpResult = await uploadFileToGCP({
                 filePath: tempFilePath,
                 fileName: newFileName,
                 employeeId: userId,
                 category: 'EmployeeLifecycle',
                 type: 'OfferLetter', // Using OfferLetter type for leave documents
                 public: true,
               });

              // Clean up temp file
              try {
                await fs.promises.unlink(tempFilePath);
              } catch (err) {
                console.error('Error deleting temp file:', err);
              }

              if (gcpResult.success && gcpResult.fileUrl) {
                documents.push({
                  fileName: file.filename,
                  filePath: gcpResult.fileUrl,
                  uploadDate: new Date(),
                  uploadedBy: new Types.ObjectId(currentUser._id),
                });
              } else {
                fileErrors.push(`Failed to upload file "${file.filename}": ${gcpResult.error || 'Unknown error'}`);
              }
            } catch (fileError: any) {
              console.error('Error processing file upload:', fileError);
              fileErrors.push(`Error processing file "${file.filename}": ${fileError.message || 'Unknown error'}`);
              // Continue with other files even if one fails
            }
          }

          // If all files failed and there were files, return error
          if (documents.length === 0 && files.length > 0 && fileErrors.length > 0) {
            return reply.status(400).send({
              success: false,
              error: {
                message: 'All file uploads failed',
                details: fileErrors
              },
            });
          }
        }

        const leaveData: ILeaveCreate = {
          userId,
          leaveTypeId,
          leaveType,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          remarks: remarks || undefined,
          reason: reason || undefined, // Optional field
          appliedTo,
          leaveDuration: leaveDuration as 'full-day' | 'half-day',
          halfDayType: halfDayType as 'first-half' | 'second-half' | undefined,
          appliedOnBehalf: true, // Mark as applied on behalf
          appliedBy: {
            _id: currentUser._id,
            name: currentUser.name,
            email: currentUser.email || '',
          },
          documents: documents.length > 0 ? documents : undefined,
        };

        const leave = await request.container!.leaveService.create(leaveData);
        return reply.status(201).send({
          success: true,
          data: leave,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  //delete collection all data
  fastify.post(
    '/delete-collection-data',
    {
      schema: {
        tags: ['Admin Operations'],
        summary: 'Delete all documents from a collection',
        description: 'Deletes all documents from the specified MongoDB collection.',
        body: {
          type: 'object',
          required: ['collectionName'],
          properties: {
            collectionName: {
              type: 'string',
              description: 'Name of the collection to clear',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { collectionName } = request.body as { collectionName: string };
        console.log(collectionName, 'collectionName');
        if (!collectionName) {
          return reply.status(400).send({
            success: false,
            error: 'Collection name is required',
          });
        }

        // Check if the collection exists
        const collectionExists = await mongoose.connection.db
          .listCollections({ name: collectionName })
          .hasNext();

        if (!collectionExists) {
          return reply.status(400).send({
            success: false,
            error: `Collection "${collectionName}" does not exist`,
          });
        }

        // Clear the collection
        await mongoose.connection.collection(collectionName).deleteMany({});

        return reply.status(200).send({
          success: true,
          message: `All documents from collection "${collectionName}" have been deleted.`,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: error.message || 'An error occurred while deleting collection data.',
        });
      }
    }
  );

  // Get leave requests (for user or admin)
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Leave Management'],
        summary: 'Get leave requests',
        description: 'Get paginated list of leave requests with optional filters',
        querystring: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'Filter by user ID'
            },
            status: {
              type: 'string',
              enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
              description: 'Filter by leave status'
            },
            leaveType: {
              type: 'string',
              description: 'Filter by leave type (e.g., annual, sick, lossOfPay)'
            },
            appliedTo: {
              type: 'string',
              description: 'Filter by manager ID (Admin only)'
            },
            search: {
              description: 'Search by employee name, leave type, reason, manager name, or status'
            },
            startDate: {
              type: 'string',
              format: 'date',
              description: 'Filter by start date'
            },
            endDate: {
              type: 'string',
              format: 'date',
              description: 'Filter by end date'
            },
            page: {
              type: 'number',
              minimum: 1,
              default: 1,
              description: 'Page number'
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              default: 10,
              description: 'Records per page'
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    userId: { type: 'string' },
                    leaveTypeId: { type: 'string' },
                    leaveType: { type: 'string' },
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' },
                    status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
                    remarks: { type: 'string' },
                    reason: { type: 'string' },
                    noOfDays: { type: 'number' },
                    appliedTo: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' }
                      }
                    },
                    user: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' }
                      }
                    },
                    appliedOnBehalf: { type: 'boolean' },
                    appliedBy: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string' }
                      }
                    },
                    managerApproved: { type: 'boolean' },
                    adminApproved: { type: 'boolean' },
                    managerApprovedById: { type: 'string' },
                    managerApprovedAt: { type: 'string', format: 'date-time' },
                    adminApprovedById: { type: 'string' },
                    adminApprovedAt: { type: 'string', format: 'date-time' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                  }
                }
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
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const { userId, status, leaveType, startDate, endDate, page, limit, search, appliedTo } = request.query as any;
        const currentUser = request.user!;
        const userRole = (currentUser as any).role?.toLowerCase() || '';

        const query: ILeaveQuery = {
          userId: userId,
          status: status ? status : undefined,
          leaveType: leaveType,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          search: Array.isArray(search) ? search[0] : search,
        };

        // If userId is provided, filter by that user
        if (userId) {
          query.userId = userId;
        }

        if (status) query.status = status as 'Pending' | 'Approved' | 'Rejected';
        // Normalize search parameter (handle case where it might be an array from duplicate query params)
        if (search) {
          query.search = Array.isArray(search) ? search[0] : search;
        }
        if (startDate) query.startDate = new Date(startDate);
        if (endDate) query.endDate = new Date(endDate);

        // Allow admins to filter by manager (appliedTo)
        if (appliedTo && (userRole === 'admin' || userRole === 'superadmin')) {
          query.appliedTo = appliedTo;
        }

        console.log(query, "1 query");
        const result = await request.container!.leaveService.findAll(query);
        return reply.send({
          success: true,
          data: result.leaves,
          total: result.meta?.total || 0,
          meta: result.meta,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Approve/Reject leave request
  fastify.put(
    '/:id/status',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Leave Management'],
        summary: 'Approve/Reject leave request',
        description: 'Approve or reject a leave request',
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Approved', 'Rejected', 'Cancelled'] },
            remarks: { type: 'string' },
            reason: { type: 'string' },
            appliedTo: { type: 'string' },
            noOfDays: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const updateData = {
          ...(request.body as any),
          approvedBy: { _id: (request.user as any)._id, name: (request.user as any).name, email: (request.user as any).email },
        };

        const leave = await request.container!.leaveService.updateStatus(id, updateData);
        console.log(Leave, 'Leave data');
        return reply.send({
          success: true,
          data: leave,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Cancel leave request
  fastify.delete(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Leave Management'],
        summary: 'Cancel leave request',
        description: 'Cancel a leave request',
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.leaveService.cancel(id, (request.user as any)._id);
        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );
  //get leave based on id
  fastify.get(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Leave Management'],
        summary: 'Get leave requests',
        description: 'Get Leave Data Based on ID',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  userId: { type: 'string' },
                  leaveTypeId: { type: 'string' },
                  leaveType: { type: 'string' },
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' },
                  status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
                  remarks: { type: 'string' },
                  noOfDays: { type: 'number' },
                  reason: { type: 'string' },
                  appliedTo: {
                    type: 'object',
                    properties: {
                      _id: { type: 'string' },
                      name: { type: 'string' },
                    },
                  },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  user: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                  approvedBy: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                  // Apply on behalf fields
                  appliedOnBehalf: { type: 'boolean' },
                  appliedBy: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      _id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                  managerApproved: { type: 'boolean' },
                  adminApproved: { type: 'boolean' },
                  managerApprovedById: { type: 'string', nullable: true },
                  managerApprovedAt: { type: 'string', format: 'date-time', nullable: true },
                  adminApprovedById: { type: 'string', nullable: true },
                  adminApprovedAt: { type: 'string', format: 'date-time', nullable: true },
                  documents: {
                    type: 'array',
                    nullable: true,
                    items: {
                      type: 'object',
                      properties: {
                        fileName: { type: 'string' },
                        filePath: { type: 'string' },
                        uploadDate: { type: 'string', format: 'date-time' },
                        uploadedBy: { type: 'string', nullable: true },
                      },
                    },
                  },
                  // Half-day support
                  leaveDuration: { type: 'string', enum: ['full-day', 'half-day'] },
                  halfDayType: { type: 'string', enum: ['first-half', 'second-half'], nullable: true },
                  // Weekend exclusion info
                  weekendExclusion: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      weekendDays: { type: 'array', items: { type: 'number' } },
                      excludedDates: { type: 'array', items: { type: 'string', format: 'date-time' } },
                      excludedHolidays: { type: 'array', items: { type: 'string', format: 'date-time' } },
                      totalCalendarDays: { type: 'number' },
                      actualDays: { type: 'number' },
                    },
                  },
                }

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
          }
        }
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const Leave = await request.container!.leaveService.findById(id);
        console.log(Leave, 'Route leave');
        if (!Leave) {
          return reply.status(404).send({
            success: false,
            error: { message: 'Leave not found' },
          });
        }
        console.log(Leave, 'Route leave 2');

        return reply.send({
          success: true,
          data: Leave,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  fastify.get(
    '/userId/:userId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Leave Management'],
        summary: 'Get leave requests By user Id',
        description: 'Get Leave Data Based on userId with optional filters',
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20 },
            search: { type: 'string' },
            status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
            leaveType: { type: 'string' },
            startDate: { type: 'string', format: 'date' }, // YYYY-MM-DD
            endDate: { type: 'string', format: 'date' },   // YYYY-MM-DD
            sortBy: { type: 'string', default: 'startDate' },
            sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        },
        params: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
          },
          required: ['userId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    userId: { type: 'string' },
                    leaveTypeId: { type: 'string' },
                    leaveType: { type: 'string' },
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' },
                    status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
                    remarks: { type: 'string' },
                    noOfDays: { type: 'number' },
                    reason: { type: 'string' },
                    appliedTo: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                    user: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    approvedBy: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                  },
                },
              },
              meta: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };
        const {
          page = 1,
          limit = 10,
          search,
          status,
          leaveType,
          startDate,
          endDate,
          sortBy = 'startDate',
          sortOrder = 'desc',
        } = request.query as {
          page?: number;
          limit?: number;
          search?: string;
          status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
          leaveType?: string;
          startDate?: string;
          endDate?: string;
          sortBy?: string;
          sortOrder?: 'asc' | 'desc';
        };

        // Optional: Validate date range
        if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
          return reply.status(400).send({
            success: false,
            error: { message: 'endDate must be on or after startDate' },
          });
        }

        const filters = {
          search,
          status,
          leaveType,
          startDate,
          endDate,
        };

        const { leaves, total } = await request.container!.leaveService.findByUserId(userId, filters, {
          page: Number(page),
          limit: Number(limit),
          sortBy,
          sortOrder,
        });

        return reply.send({
          success: true,
          data: leaves,
          meta: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error: any) {
        console.error(error, 'Error fetching leaves');
        return reply.status(400).send({
          success: false,
          error: { message: error.message || 'Failed to fetch leaves' },
        });
      }
    }
  );

  // Get leave balance
  fastify.get(
    '/balance/:leaveTypeId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Leave Management'],
        summary: 'Get leave balance',
        description: 'Get the leave balance for a specific leave type',
      },
    },
    async (request, reply) => {
      try {
        const { leaveTypeId } = request.params as { leaveTypeId: string };
        const balance = await request.container!.leaveService.getLeaveBalance((request.user as any)._id, leaveTypeId);
        return reply.send({
          success: true,
          data: balance,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  //GET leaves appliedTo
  fastify.get(
    '/applied-to/:appliedTo',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Leave Management'],
        summary: 'Get leave requests by appliedTo',
        description: 'Get Leave Data Based on appliedTo field',
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 5 },
            search: {
              description: 'Search by employee name, leave type, reason, manager name, or status'
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    userId: { type: 'string' },
                    leaveTypeId: { type: 'string' },
                    leaveType: { type: 'string' },
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' },
                    status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
                    reason: { type: 'string' },
                    remarks: { type: 'string' },
                    appliedTo: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                      },
                    },
                    user: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    noOfDays: { type: 'number' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' }
                  }
                }
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
            },
            required: ['success', 'data', 'meta']
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { appliedTo } = request.params as { appliedTo: string };
        const { userId, status, startDate, endDate, page, limit, search } = request.query as any;
        // Normalize search parameter (handle case where it might be an array from duplicate query params)
        const normalizedSearch = search ? (Array.isArray(search) ? search[0] : search) : undefined;

        const query: ILeaveQuery = {
          appliedTo,
          userId: userId,
          status: status ? status : undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          search: normalizedSearch,
        };

        const leaveData = await request.container!.leaveService.getLeavesByAppliedTo(query);
        console.log(leaveData, 'Route leave');

        // if (!leaveData || !leaveData.data || leaveData.data.length === 0) {
        //   return reply.status(404).send({
        //     success: false,
        //     error: { message: 'No leaves found' },
        //   });
        // }

        return reply.send({
          success: true,
          data: leaveData.data,
          meta: leaveData.meta
        });
      } catch (error: any) {
        console.log(error, 'error');
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );
};
