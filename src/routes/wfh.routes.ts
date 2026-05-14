import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { IWFHCreate, IWFHQuery } from '../services/wfh.service';
import { Types } from 'mongoose';
import { parseMultipartForm } from '../utilis/parseMultiPartForm';
import { uploadFileToGCP } from '../utilis/gcpStorage';
import * as fs from 'fs';
import * as path from 'path';
import { User } from '../models';

export const wfhRoutes: RouteHandler = async (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> => {
  // Apply for WFH on behalf (Admin only)
  fastify.post(
    '/apply-on-behalf',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['WFH Management'],
        summary: 'Apply for WFH on behalf of employee (Admin only)',
        description: 'Admin can apply for WFH on behalf of an employee after 3 business days. Supports optional document uploads.',
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
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' },
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
            error: { message: 'Only admins can apply for WFH on behalf of employees' },
          });
        }

        // Parse multipart form data or JSON body
        let body: any;
        let files: any[] = [];
        
        try {
          const parsed = await parseMultipartForm(request);
          body = parsed.body;
          files = parsed.files || [];
        } catch (parseError) {
          // If parsing fails, try to get JSON body (for requests without files)
          body = request.body as any;
          files = [];
        }

        // Validate required fields - handle both undefined and empty strings
        const userId = body?.userId?.trim ? body.userId.trim() : body?.userId || '';
        const startDate = body?.startDate?.trim ? body.startDate.trim() : body?.startDate || '';
        const endDate = body?.endDate?.trim ? body.endDate.trim() : body?.endDate || '';
        const reason = body?.reason?.trim ? body.reason.trim() : body?.reason || ''; // Optional field

        // Check which required fields are missing (reason is optional)
        const missingFields: string[] = [];
        if (!userId) missingFields.push('userId');
        if (!startDate) missingFields.push('startDate');
        if (!endDate) missingFields.push('endDate');
        // reason is optional, so we don't check it

        if (missingFields.length > 0) {
          console.log('Missing fields:', missingFields);
          console.log('Body values:', { userId, startDate, endDate, reason });
          return reply.status(400).send({
            success: false,
            error: { 
              message: `Missing required fields: ${missingFields.join(', ')}`,
              missingFields: missingFields
            },
          });
        }

        const remarks = body.remarks || (body as any).remarks;

        // Parse appliedTo if it's a JSON string
        let appliedTo: { _id: string; name: string } | undefined;
        if (body.appliedTo) {
          try {
            appliedTo = typeof body.appliedTo === 'string' ? JSON.parse(body.appliedTo) : body.appliedTo;
          } catch {
            appliedTo = body.appliedTo as any;
          }
        }

        // Get user to find manager if appliedTo is not provided
        if (!appliedTo || !appliedTo._id || appliedTo._id.trim() === '') {
          const user = await User.findById(userId).select('managerId managerName');
          if (user && (user as any).managerId) {
            const manager = await User.findById((user as any).managerId).select('name');
            appliedTo = {
              _id: (user as any).managerId.toString(),
              name: manager?.name || (user as any).managerName || 'Manager',
            };
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
              const tempFilePath = path.join(uploadsDir, `wfh_${timestamp}_${randomSuffix}_${sanitizedFileName}`);

              // Save file buffer to disk
              await fs.promises.writeFile(tempFilePath, buffer);

              // Upload to GCP
              const newFileName = `WFH_Doc_${userId}_${timestamp}_${randomSuffix}${fileExt}`;
              const gcpResult = await uploadFileToGCP({
                filePath: tempFilePath,
                fileName: newFileName,
                employeeId: userId,
                category: 'EmployeeLifecycle',
                type: 'OfferLetter', // Using OfferLetter type for WFH documents
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

        const wfhData: IWFHCreate = {
          userId,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          reason: reason || undefined, // Optional field
          remarks: remarks || undefined,
          appliedTo,
          appliedOnBehalf: true, // Mark as applied on behalf
          appliedBy: {
            _id: currentUser._id,
            name: currentUser.name,
            email: currentUser.email || '',
          },
          documents: documents.length > 0 ? documents : undefined,
        };

        const wfh = await request.container!.wfhService.create(wfhData);
        return reply.status(201).send({
          success: true,
          data: wfh,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Apply for WFH
  fastify.post(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['WFH Management'],
        summary: 'Apply for Work From Home',
        description: 'Submit a new WFH request. If allocated days = 0, unlimited WFH allowed. If allocated > 0, balance validation applies (includes pending requests).',
        body: {
          type: 'object',
          required: ['startDate', 'endDate', 'reason'],
          properties: {
            startDate: {
              type: 'string',
              format: 'date',
              description: 'WFH start date (YYYY-MM-DD)'
            },
            endDate: {
              type: 'string',
              format: 'date',
              description: 'WFH end date (YYYY-MM-DD)'
            },
            remarks: {
              type: 'string',
              description: 'Additional remarks'
            },
            reason: {
              type: 'string',
              description: 'Reason for WFH'
            },
            appliedTo: {
              type: 'object',
              description: 'Manager to approve the WFH'
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
                  startDate: { type: 'string', format: 'date' },
                  endDate: { type: 'string', format: 'date' },
                  noOfDays: { type: 'number' },
                  status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] },
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
        const body = request.body as IWFHCreate;
        const userId = (request.user as any)._id;

        // Get user to find manager if appliedTo is not provided or has empty _id
        let appliedTo = body.appliedTo;
        if (!appliedTo || !appliedTo._id || appliedTo._id.trim() === '') {
          const user = await User.findById(userId).select('managerId managerName');
          if (user && (user as any).managerId) {
            const manager = await User.findById((user as any).managerId).select('name');
            appliedTo = {
              _id: (user as any).managerId.toString(),
              name: manager?.name || (user as any).managerName || 'Manager',
            };
          } else {
            // If no manager found, set appliedTo to undefined (will skip email notification)
            appliedTo = undefined;
          }
        }

        const wfhData: IWFHCreate = {
          userId: userId.toString(),
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate),
          reason: body.reason,
          remarks: body.remarks,
          appliedTo,
        };

        const wfh = await request.container!.wfhService.create(wfhData);
        return reply.status(201).send({
          success: true,
          data: wfh,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get WFH requests
  fastify.get(
    '/',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['WFH Management'],
        summary: 'Get WFH requests',
        description: 'Get paginated list of WFH requests',
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'] },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            appliedTo: { type: 'string' },
            page: { type: 'number', minimum: 1, default: 1 },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
            search: {
              description: 'Search by employee name, reason, manager name, or status'
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { userId, status, startDate, endDate, appliedTo, search, page, limit } = request.query as any;
        const currentUser = request.user!;
        const userRole = (currentUser as any).role?.toLowerCase() || '';

        // Build query
        const query: any = {
          page: page ? Number(page) : 1,
          limit: limit ? Number(limit) : 10,
        };

        // If userId is provided, filter by that user
        if (userId) {
          query.userId = userId;
        } else {
          // If no userId provided:
          // - For managers: show requests where they are the approver (appliedTo)
          // - For admins: show all requests
          // - For regular users: show only their own requests
          if (userRole === 'admin' || userRole === 'superadmin') {
            // Admin sees all - no userId filter
            // Admin can filter by appliedTo if provided
            if (appliedTo) {
              query.appliedTo = appliedTo;
            }
          } else if (userRole === 'manager') {
            // Manager sees requests assigned to them
            query.appliedTo = (currentUser as any)._id.toString();
          } else {
            // Regular user sees only their own
            query.userId = (currentUser as any)._id;
          }
        }

        if (status) query.status = status;
        if (startDate) query.startDate = startDate;
        if (endDate) query.endDate = endDate;
        // Normalize search parameter (handle case where it might be an array from duplicate query params)
        if (search) {
          query.search = Array.isArray(search) ? search[0] : search;
        }

        const result = await request.container!.wfhService.findAll(query);
        return reply.send({
          success: true,
          data: result.wfhs,
          total: result.total,
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

  // Get WFH requests by appliedTo
  fastify.get(
    '/applied-to/:appliedTo',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['WFH Management'],
        summary: 'Get WFH requests by appliedTo',
        description: 'Get WFH Data Based on appliedTo field',
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
              description: 'Search by employee name, reason, manager name, or status'
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
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' },
                    noOfDays: { type: 'number' },
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
        
        const normalizedSearch = search ? (Array.isArray(search) ? search[0] : search) : undefined;
        
        const query: IWFHQuery = {
          appliedTo,
          userId: userId,
          status: status ? status : undefined,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          search: normalizedSearch,
        };

        const wfhData = await request.container!.wfhService.getWFHsByAppliedTo(query);

        return reply.send({
          success: true,
          data: wfhData.data,
          meta: wfhData.meta
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get WFH by ID
  fastify.get(
    '/:id',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['WFH Management'],
        summary: 'Get WFH by ID',
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const wfh = await request.container!.wfhService.findById(id);
        return reply.send({
          success: true,
          data: wfh,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Approve/Reject WFH request
  fastify.put(
    '/:id/status',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['WFH Management'],
        summary: 'Approve/Reject WFH request',
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Approved', 'Rejected', 'Cancelled'] },
            remarks: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { status, remarks } = request.body as { status: string; remarks?: string };
        const approver = request.user!;

        const wfh = await request.container!.wfhService.updateStatus(id, {
          status: status as 'Approved' | 'Rejected' | 'Cancelled',
          remarks,
          approvedById: approver._id instanceof Types.ObjectId ? approver._id : new Types.ObjectId(approver._id),
          approvedBy: {
            _id: approver._id instanceof Types.ObjectId ? approver._id : new Types.ObjectId(approver._id),
            name: approver.name,
            email: approver.email || '',
          },
        });

        return reply.send({
          success: true,
          data: wfh,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Cancel WFH request
  fastify.put(
    '/:id/cancel',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['WFH Management'],
        summary: 'Cancel WFH request',
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const userId = request.user!._id instanceof Types.ObjectId
          ? request.user!._id
          : new Types.ObjectId(request.user!._id);
        const result = await request.container!.wfhService.cancel(id, userId);
        return reply.send({
          success: true,
          message: result.message,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    },
  );

  // Get WFH balance for a year
  fastify.get(
    '/balance/:year',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['WFH Management'],
        summary: 'Get WFH balance for a year',
      },
    },
    async (request, reply) => {
      try {
        const { year } = request.params as { year: string };
        const userId = request.user!._id instanceof Types.ObjectId
          ? request.user!._id
          : new Types.ObjectId(request.user!._id);
        const balance = await request.container!.wfhService.getWFHBalance(
          userId,
          Number(year)
        );
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
};

