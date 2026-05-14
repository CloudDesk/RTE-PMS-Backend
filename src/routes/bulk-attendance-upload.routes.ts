import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { BulkAttendanceUploadService } from '../services/bulk-attendance-upload.service';
import { Types } from 'mongoose';
import { filesUpload } from '../config/multer';
import { AttendanceRecord } from '../models/attendance-record.model';
import {  ShiftAssignment } from '../models/shift.model';
import { Leave } from '../models/leave.model';
import { AttendanceRegularization } from '../models/attendance-regularization.model';
import { Document } from '../models/document.model';
import { User } from '../models/user.model';

export const bulkAttendanceUploadRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  const bulkUploadService = new BulkAttendanceUploadService();

  // Download Excel template
  fastify.get(
    '/template',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Bulk Attendance Upload'],
        summary: 'Download Excel template for bulk attendance upload',
        description: 'Download a pre-formatted Excel template for bulk attendance upload with instructions and sample data',
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
          }
        }
      }
    },
    async (request, reply) => {
      try {
        // Get the authenticated user's information
        const currentUser = request.user as any;
        if (!currentUser || !currentUser._id || !currentUser.role) {
          return reply.status(401).send({
            success: false,
            error: { message: 'User not authenticated or missing required information' }
          });
        }

        const templateBuffer = await bulkUploadService.generateExcelTemplate(
          currentUser._id,
          currentUser.role
        );

        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', 'attachment; filename="bulk_attendance_template.xlsx"');

        return reply.send(templateBuffer);
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Parse and validate Excel file
  fastify.post(
    '/parse',
    {
      onRequest: [authenticate, filesUpload],
      // schema: {
      //   tags: ['Bulk Attendance Upload'],
      //   summary: 'Parse and validate Excel file for bulk attendance upload',
      //   description: 'Parse Excel file and validate all rows, returning preview with errors and warnings',
      //   consumes: ['multipart/form-data'],
      //   body: {
      //     type: 'object',
      //     required: ['file'],
      //     properties: {
      //       file: {
      //         type: 'string',
      //         format: 'binary',
      //         description: 'Excel file (.xlsx) containing bulk attendance data'
      //       }
      //     }
      //   },
      //   response: {
      //     200: {
      //       type: 'object',
      //       properties: {
      //         success: { type: 'boolean' },
      //         data: {
      //           type: 'object',
      //           properties: {
      //             validRows: {
      //               type: 'array',
      //               items: {
      //                 type: 'object',
      //                 properties: {
      //                   rowNumber: { type: 'number' },
      //                   userId: { type: 'string' },
      //                   userName: { type: 'string' },
      //                   shiftCode: { type: 'string' },
      //                   shiftName: { type: 'string' },
      //                   startDate: { type: 'string' },
      //                   endDate: { type: 'string' },
      //                   weekendDays: { type: 'string' },
      //                   attendanceDate: { type: 'string' },
      //                   inTime: { type: 'string' },
      //                   outTime: { type: 'string' },
      //                   deviceId: { type: 'string' },
      //                   location: { type: 'string' }
      //                 }
      //               }
      //             },
      //             invalidRows: {
      //               type: 'array',
      //               items: {
      //                 type: 'object',
      //                 properties: {
      //                   rowNumber: { type: 'number' },
      //                   userId: { type: 'string' },
      //                   userName: { type: 'string' },
      //                   shiftCode: { type: 'string' },
      //                   shiftName: { type: 'string' },
      //                   startDate: { type: 'string' },
      //                   endDate: { type: 'string' },
      //                   weekendDays: { type: 'string' },
      //                   attendanceDate: { type: 'string' },
      //                   inTime: { type: 'string' },
      //                   outTime: { type: 'string' },
      //                   deviceId: { type: 'string' },
      //                   location: { type: 'string' }
      //                 }
      //               }
      //             },
      //             errors: {
      //               type: 'array',
      //               items: {
      //                 type: 'object',
      //                 properties: {
      //                   rowNumber: { type: 'number' },
      //                   field: { type: 'string' },
      //                   message: { type: 'string' },
      //                   severity: { type: 'string', enum: ['error', 'warning'] }
      //                 }
      //               }
      //             },
      //             summary: {
      //               type: 'object',
      //               properties: {
      //                 totalRows: { type: 'number' },
      //                 validRows: { type: 'number' },
      //                 invalidRows: { type: 'number' },
      //                 errors: { type: 'number' },
      //                 warnings: { type: 'number' },
      //                 weekendAttendanceCount: { type: 'number' }
      //               }
      //             }
      //           }
      //         },
      //         message: { type: 'string' }
      //       }
      //     },
      //     400: {
      //       type: 'object',
      //       properties: {
      //         success: { type: 'boolean', default: false },
      //         error: {
      //           type: 'object',
      //           properties: {
      //             message: { type: 'string' }
      //           }
      //         }
      //       }
      //     }
      //   }
      // }
    },
    async (request, reply) => {
      try {
        // Handle Multer file upload
        const files = (request as any).files;
        console.log('Files received:', files);
        console.log('Request keys:', Object.keys(request));
        
        if (!files) {
          return reply.status(400).send({
            success: false,
            error: { message: 'No files object found in request' }
          });
        }
        
        if (!Array.isArray(files) || files.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'No files uploaded' }
          });
        }

        const uploadedFile = files[0]; // Get the first file
        console.log('Uploaded file:', uploadedFile);

        // Validate file type
        if (!uploadedFile.mimetype.includes('spreadsheet') && !uploadedFile.originalname.endsWith('.xlsx')) {
          return reply.status(400).send({
            success: false,
            error: { message: 'Invalid file type. Please upload an Excel (.xlsx) file' }
          });
        }

        // Read file from disk (Multer saves to disk)
        const fs = require('fs');
        
        // Check if file exists
        if (!fs.existsSync(uploadedFile.path)) {
          return reply.status(400).send({
            success: false,
            error: { message: 'Uploaded file not found on disk' }
          });
        }
        
        const fileBuffer = fs.readFileSync(uploadedFile.path);
        console.log('File buffer size:', fileBuffer.length);
        console.log('File path:', uploadedFile.path);

        // Parse Excel file
        const rows = await bulkUploadService.parseExcelFile(fileBuffer);
        console.log('Parsed rows:', rows.length);

        if (rows.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'No valid data found in Excel file' }
          });
        }

        //only delete the external users from the rows for attenance and shitassignments
        // attandancerecord.userId
        //shiftassignment.userId

        


        // Get the authenticated user's information for validation
        const currentUser = request.user as any;
        const currentUserId = currentUser?._id;
        const currentUserRole = currentUser?.role;

        // Validate parsed data
        const validationResult = await bulkUploadService.validateBulkUploadData(
          rows,
          currentUserId,
          currentUserRole
        );
        console.log('Validation result:', validationResult.summary);

        // Clean up uploaded file
        try {
          fs.unlinkSync(uploadedFile.path);
          console.log('Cleaned up uploaded file');
        } catch (cleanupError) {
          console.warn('Failed to cleanup uploaded file:', cleanupError);
        }

        return reply.send({
          success: true,
          data: validationResult,
          message: `Parsed ${rows.length} rows. Found ${validationResult.summary.validRows} valid rows and ${validationResult.summary.invalidRows} invalid rows.`
        });

      } catch (error: any) {
        console.error('Error in parse route:', error);
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Confirm and process bulk upload
  fastify.post(
    '/confirm',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Bulk Attendance Upload'],
        summary: 'Confirm and process bulk attendance upload',
        description: 'Confirm the bulk upload and insert shift assignments and attendance records into the database',
        body: {
          type: 'object',
          required: ['validRows'],
          properties: {
            validRows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rowNumber: { type: 'number' },
                  userId: { type: 'string' },
                  userName: { type: 'string' },
                  shiftCode: { type: 'string' },
                  shiftName: { type: 'string' },
                  startDate: { type: 'string' },
                  endDate: { type: 'string' },
                  weekendDays: { type: 'string' },
                  attendanceDate: { type: 'string' },
                  inTime: { type: 'string' },
                  outTime: { type: 'string' },
                  deviceId: { type: 'string' },
                  location: { type: 'string' }
                }
              }
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
                  shiftAssignmentsCreated: { type: 'number' },
                  attendanceRecordsCreated: { type: 'number' },
                  overtimeRecordsCreated: { type: 'number' },
                  errors: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                }
              },
              message: { type: 'string' }
            }
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
              data: {
                type: 'object',
                properties: {
                  shiftAssignmentsCreated: { type: 'number' },
                  attendanceRecordsCreated: { type: 'number' },
                  overtimeRecordsCreated: { type: 'number' },
                  errors: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                }
              },
              message: { type: 'string' },
              errorType: { type: 'string', enum: ['VALIDATION_ERROR', 'DUPLICATE_RECORDS'] }
            }
          },
          409: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
              data: {
                type: 'object',
                properties: {
                  shiftAssignmentsCreated: { type: 'number' },
                  attendanceRecordsCreated: { type: 'number' },
                  overtimeRecordsCreated: { type: 'number' },
                  errors: {
                    type: 'array',
                    items: { type: 'string' }
                  }
                }
              },
              message: { type: 'string' },
              errorType: { type: 'string', enum: ['DUPLICATE_RECORDS'] }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        console.log(request,"request confirm")
        const { validRows } = request.body as { validRows: any[] };
console.log(validRows,"Valid Rows")
console.log("first")
        if (!validRows || validRows.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'No valid rows provided for processing' }
          });
        }

        // Get the authenticated user's ID
        const userId = (request.user as any)?._id;
        if (!userId) {
          return reply.status(401).send({
            success: false,
            error: { message: 'User not authenticated' }
          });
        }

        // Get the authenticated user's role
        const currentUserRole = (request.user as any)?.role;

        // Confirm bulk upload
        const result = await bulkUploadService.confirmBulkUpload(
          validRows,
          new Types.ObjectId(userId),
          currentUserRole
        );

        // Return appropriate HTTP status based on result
        if (result.success) {
          return reply.status(200).send({
            success: true,
            data: result.data,
            message: result.message
          });
        } else {
          // Check if it's a duplicate key error
          const hasDuplicateError = result.data.errors.some((error: string) => 
            error.includes('duplicate key error') || error.includes('E11000')
          );
          
          if (hasDuplicateError) {
            return reply.status(409).send({
              success: false,
              data: result.data,
              message: 'Duplicate attendance records detected. Please check your data and try again.',
              errorType: 'DUPLICATE_RECORDS'
            });
          } else {
            return reply.status(400).send({
              success: false,
              data: result.data,
              message: result.message,
              errorType: 'VALIDATION_ERROR'
            });
          }
        }

      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Get upload statistics
  fastify.get(
    '/stats',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Bulk Attendance Upload'],
        summary: 'Get bulk upload statistics',
        description: 'Get statistics about bulk uploads including recent uploads and success rates',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  totalUploads: { type: 'number' },
                  successfulUploads: { type: 'number' },
                  failedUploads: { type: 'number' },
                  totalRecordsProcessed: { type: 'number' },
                  averageRecordsPerUpload: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      try {
        // This would typically query a separate collection for upload logs
        // For now, return placeholder data
        return reply.send({
          success: true,
          data: {
            totalUploads: 0,
            successfulUploads: 0,
            failedUploads: 0,
            totalRecordsProcessed: 0,
            averageRecordsPerUpload: 0
          }
        });
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Cleanup attendance records (Development/Testing only)
  fastify.delete(
    '/cleanup',
    {
      schema: {
        tags: ['Bulk Attendance Upload'],
        summary: 'Cleanup records from various collections',
        description: 'Delete records from specified collections (attendancerecords, leaves, shiftassignments, attendanceregularizations). Use only for development/testing.',
        querystring: {
          type: 'object',
          properties: {
            confirm: {
              type: 'string',
              description: 'Must be "true" to confirm deletion'
            },
            collection: {
              type: 'string',
              description: 'Optional: Collection name to clean up (default: attendancerecords)',
              enum: ['attendancerecords', 'leaves', 'shiftassignments', 'attendanceregularizations','documents']
            },
            userId: {
              type: 'string',
              description: 'Optional: Delete only records for specific user'
            },
            shiftCode: {
              type: 'string',
              description: 'Optional: Delete only records for specific shift'
            },
            dateFrom: {
              type: 'string',
              description: 'Optional: Delete records from this date (YYYY-MM-DD)'
            },
            dateTo: {
              type: 'string',
              description: 'Optional: Delete records up to this date (YYYY-MM-DD)'
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
                  deletedCount: { type: 'number' },
                  totalRecordsBefore: { type: 'number' },
                  totalRecordsAfter: { type: 'number' },
                  collection: { type: 'string' }
                }
              },
              message: { type: 'string' }
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
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { confirm, collection = 'attendancerecords', userId, shiftCode, dateFrom, dateTo } = request.query as any;

        // Require confirmation
        if (confirm !== 'true') {
          return reply.status(400).send({
            success: false,
            error: { 
              message: 'Confirmation required. Add ?confirm=true to the URL to proceed with deletion.' 
            }
          });
        }

        // Get the appropriate model based on collection name
        let Model: any;
        let query: any = {};
        let dateField = 'shiftDay'; // default for attendance records

        switch (collection) {
          case 'attendancerecords':
            Model = AttendanceRecord;
            dateField = 'shiftDay';
            break;
          case 'shiftassignments':
            Model = ShiftAssignment;
            dateField = 'startDate';
            break;
          case 'leaves':
            Model = Leave;
            dateField = 'createdAt';
            break;
          case 'attendanceregularizations':
            Model = AttendanceRegularization;
            dateField = 'createdAt';
            break;
          case 'documents':
            Model = Document;
            dateField = 'createdAt';
            break;
          default:
            return reply.status(400).send({
              success: false,
              error: { 
                message: `Invalid collection: ${collection}. Supported collections: attendancerecords, leaves, shiftassignments, attendanceregularizations` 
              }
            });
        }

        // Get all external user IDs for filtering
        const externalUsers = await User.find({ role: 'external' }).select('_id').lean();
        const externalUserIds = externalUsers.map((user: any) => user._id);
        
        console.log(`Found ${externalUserIds.length} external users for cleanup`);

        // Get total records before deletion
        const totalRecordsBefore = await Model.countDocuments();

        // Build query based on parameters
        if (userId) {
          query.userId = new Types.ObjectId(userId);
        } else {
          // For attendance records and shift assignments, only delete external user records
          if (collection === 'attendancerecords' || collection === 'shiftassignments') {
            query.userId = { $in: externalUserIds };
            console.log(`Filtering ${collection} deletion to external users only`);
          }
        }
        
        if (shiftCode) {
          query.shiftCode = shiftCode;
        }
        
        if (dateFrom || dateTo) {
          query[dateField] = {};
          if (dateFrom) {
            query[dateField].$gte = new Date(dateFrom);
          }
          if (dateTo) {
            query[dateField].$lte = new Date(dateTo + 'T23:59:59.999Z');
          }
        }

        // Log the final query for debugging
        console.log(`Cleanup query for ${collection}:`, JSON.stringify(query, null, 2));

        // Delete records
        const result = await Model.deleteMany(query);
        const deletedCount = result.deletedCount || 0;

        // Get total records after deletion
        const totalRecordsAfter = await Model.countDocuments();

        // Create appropriate message based on collection type
        let message = `Successfully deleted ${deletedCount} ${collection} records. Total records: ${totalRecordsBefore} → ${totalRecordsAfter}`;
        
        if ((collection === 'attendancerecords' || collection === 'shiftassignments') && !userId) {
          message += ` (External users only)`;
        }

        return reply.send({
          success: true,
          data: {
            deletedCount,
            totalRecordsBefore,
            totalRecordsAfter,
            collection,
            externalUsersCount: externalUserIds.length
          },
          message
        });

      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  
}; 