import { FastifyInstance } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';
import { DataMigrationService, IExportRequest, IImportRequest, ExportableObject } from '../services/data-migration.service';
import { filesUpload } from '../config/multer';
import * as fs from 'fs';

export const dataMigrationRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  // Download Excel template for import
  fastify.get(
    '/template',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Data Migration'],
        summary: 'Download Excel template for data import',
        description: 'Download a pre-formatted Excel template with headers for selected objects',
        querystring: {
          type: 'object',
          required: ['objects'],
          properties: {
            objects: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['user', 'shift', 'leave', 'salary-assignment', 'salary-structure', 'attendance-record']
              },
              description: 'Array of object types to include in template'
            }
          }
        },
        response: {
          200: {
            type: 'string',
            format: 'binary',
            description: 'Excel file buffer'
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const objects = Array.isArray(query.objects)
          ? query.objects
          : query.objects?.split(',') || [];

        if (objects.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'At least one object type must be specified' }
          });
        }

        // Validate and cast to ExportableObject[]
        const validObjectTypes: ExportableObject[] = ['user', 'shift', 'leave', 'salary-assignment', 'salary-structure', 'attendance-record'];
        const validatedObjects = objects.filter((obj: string): obj is ExportableObject =>
          validObjectTypes.includes(obj as ExportableObject)
        ) as ExportableObject[];

        if (validatedObjects.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'No valid object types specified. Valid types: user, shift, leave, salary-assignment, salary-structure, attendance-record' }
          });
        }

        const service = new DataMigrationService(request.container!.requestContext);
        const templateBuffer = await service.generateTemplate(validatedObjects);

        const filename = `data_import_template_${new Date().toISOString().split('T')[0]}.xlsx`;

        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);

        return reply.send(templateBuffer);
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Export data to Excel
  fastify.get(
    '/export',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Data Migration'],
        summary: 'Export data to Excel',
        description: 'Export selected objects (User, Shift, Leave, etc.) to Excel file',
        querystring: {
          type: 'object',
          required: ['objects'],
          properties: {
            objects: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['user', 'shift', 'leave', 'salary-assignment', 'salary-structure', 'attendance-record']
              },
              description: 'Array of object types to export'
            },
            active: {
              type: 'boolean',
              description: 'Filter by active status (for users)'
            },
            country: {
              type: 'string',
              enum: ['IN', 'AE'],
              description: 'Filter by country (for users)'
            },
            role: {
              type: 'string',
              description: 'Filter by role (for users)'
            },
            departmentId: {
              type: 'string',
              description: 'Filter by department (for users)'
            },
            isActive: {
              type: 'boolean',
              description: 'Filter by active status (for shifts, salary assignments)'
            },
            status: {
              type: 'string',
              description: 'Filter by status (for leaves)'
            },
            userId: {
              type: 'string',
              description: 'Filter by user ID'
            },
            shiftCode: {
              type: 'string',
              description: 'Filter by shift code'
            },
            shiftDay: {
              type: 'string',
              description: 'Filter by shift day (YYYY-MM-DD)'
            },
            year: {
              type: 'number',
              description: 'Filter optional holidays by year'
            }
          }
        },
        response: {
          200: {
            type: 'string',
            format: 'binary',
            description: 'Excel file buffer'
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const objects = Array.isArray(query.objects)
          ? query.objects
          : query.objects?.split(',') || [];

        if (objects.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'At least one object type must be specified' }
          });
        }

        // Validate and cast to ExportableObject[]
        const validObjectTypes: ExportableObject[] = ['user', 'shift', 'leave', 'salary-assignment', 'salary-structure', 'attendance-record'];
        const validatedObjects = objects.filter((obj: string): obj is ExportableObject =>
          validObjectTypes.includes(obj as ExportableObject)
        ) as ExportableObject[];

        if (validatedObjects.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'No valid object types specified. Valid types: user, shift, leave, salary-assignment, salary-structure, attendance-record' }
          });
        }

        const exportRequest: IExportRequest = {
          objects: validatedObjects,
          filters: {
            active: query.active,
            country: query.country,
            role: query.role,
            departmentId: query.departmentId,
            isActive: query.isActive,
            status: query.status,
            userId: query.userId,
            shiftCode: query.shiftCode,
            shiftDay: query.shiftDay,
            year: query.year
          }
        };

        const service = new DataMigrationService(request.container!.requestContext);
        const excelBuffer = await service.exportToExcel(exportRequest);

        const filename = `data_export_${new Date().toISOString().split('T')[0]}.xlsx`;

        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);

        return reply.send(excelBuffer);
      } catch (error: any) {
        return reply.status(500).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Parse and validate Excel file (Preview)
  fastify.post(
    '/import/preview',
    {
      onRequest: [authenticate],
      preHandler: [filesUpload],
      schema: {
        tags: ['Data Migration'],
        summary: 'Parse and validate Excel file for import',
        description: 'Upload Excel file, parse it, and validate data. Returns preview with errors/warnings.',
        consumes: ['multipart/form-data'],
        // Note: body schema removed for multipart/form-data - validation done in handler
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                description: 'Validation results for each object type',
                additionalProperties: true
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        console.log('📥 [Data Migration Preview] Request received');

        const files = (request as any).files;

        if (!files || !Array.isArray(files) || files.length === 0) {
          console.error('❌ [Data Migration Preview] No file uploaded');
          return reply.status(400).send({
            success: false,
            error: { message: 'No file uploaded' }
          });
        }

        const uploadedFile = files[0];
        console.log('📄 [Data Migration Preview] File info:', {
          filename: uploadedFile.originalname,
          mimetype: uploadedFile.mimetype,
          size: uploadedFile.size,
          path: uploadedFile.path
        });

        // Validate file type
        if (!uploadedFile.mimetype.includes('spreadsheet') && !uploadedFile.originalname.endsWith('.xlsx')) {
          console.error('❌ [Data Migration Preview] Invalid file type:', uploadedFile.mimetype);
          return reply.status(400).send({
            success: false,
            error: { message: 'Invalid file type. Please upload an Excel (.xlsx) file' }
          });
        }

        // Get objects from request body (parsed by multer)
        const body = request.body as any;
        console.log('📋 [Data Migration Preview] Request body objects:', body.objects);

        let objects: string[] = [];

        // Handle objects field - could be string (JSON) or array
        if (body.objects) {
          if (typeof body.objects === 'string') {
            try {
              // Try parsing as JSON first
              objects = JSON.parse(body.objects);
              console.log('✅ [Data Migration Preview] Parsed objects from JSON:', objects);
            } catch {
              // If not JSON, treat as comma-separated string
              objects = body.objects.split(',').map((s: string) => s.trim()).filter(Boolean);
              console.log('✅ [Data Migration Preview] Parsed objects from comma-separated string:', objects);
            }
          } else if (Array.isArray(body.objects)) {
            objects = body.objects;
            console.log('✅ [Data Migration Preview] Objects from array:', objects);
          }
        }

        if (objects.length === 0) {
          console.error('❌ [Data Migration Preview] No objects specified');
          return reply.status(400).send({
            success: false,
            error: { message: 'At least one object type must be specified' }
          });
        }

        // Validate and cast to ExportableObject[]
        const validObjectTypes: ExportableObject[] = ['user', 'shift', 'leave', 'salary-assignment', 'salary-structure', 'attendance-record'];
        const validatedObjects = objects.filter((obj: string): obj is ExportableObject =>
          validObjectTypes.includes(obj as ExportableObject)
        ) as ExportableObject[];

        console.log('🔍 [Data Migration Preview] Validated objects:', validatedObjects);

        if (validatedObjects.length === 0) {
          console.error('❌ [Data Migration Preview] No valid object types. Received:', objects);
          return reply.status(400).send({
            success: false,
            error: { message: 'No valid object types specified. Valid types: user, shift, leave, salary-assignment, salary-structure, attendance-record' }
          });
        }

        // Read file
        if (!fs.existsSync(uploadedFile.path)) {
          console.error('❌ [Data Migration Preview] File not found at path:', uploadedFile.path);
          return reply.status(400).send({
            success: false,
            error: { message: 'Uploaded file not found' }
          });
        }

        const fileBuffer = fs.readFileSync(uploadedFile.path);
        console.log('📊 [Data Migration Preview] File buffer size:', fileBuffer.length, 'bytes');

        // Parse and validate
        console.log('🔄 [Data Migration Preview] Starting parse and validation...');
        const service = new DataMigrationService(request.container!.requestContext);
        const parsedData = await service.parseExcelFile(fileBuffer, validatedObjects);
        console.log('📦 [Data Migration Preview] Parsed data summary:',
          Object.keys(parsedData).map(key => ({
            objectType: key,
            rowCount: parsedData[key]?.length || 0
          }))
        );

        const validationResults = await service.validateImportData(parsedData, validatedObjects);

        // Log validation results with better formatting
        console.log('\n' + '='.repeat(80));
        console.log('✅ [Data Migration Preview] Validation completed');
        console.log('='.repeat(80));

        Object.keys(validationResults).forEach(objectType => {
          const result = validationResults[objectType];
          console.log(`\n📊 [${objectType.toUpperCase()}] Validation Summary:`);
          console.log(`   Total Rows: ${result.summary.totalRows}`);
          console.log(`   ✅ Valid: ${result.summary.validRows}`);
          console.log(`   ❌ Invalid: ${result.summary.invalidRows}`);
          console.log(`   ⚠️  Errors: ${result.summary.errors}`);
          console.log(`   ⚠️  Warnings: ${result.summary.warnings}`);

          if (result.errors.length > 0) {
            console.log(`\n❌ [${objectType.toUpperCase()}] Validation Errors (${result.errors.length}):`);
            // Group errors by row for better readability
            const errorsByRow = new Map<number, typeof result.errors>();
            result.errors.forEach(err => {
              if (!errorsByRow.has(err.rowNumber)) {
                errorsByRow.set(err.rowNumber, []);
              }
              errorsByRow.get(err.rowNumber)!.push(err);
            });

            errorsByRow.forEach((errors, rowNum) => {
              console.log(`   Row ${rowNum}:`);
              errors.forEach(err => {
                console.log(`     - ${err.field}: ${err.message} [${err.severity}]`);
              });
            });
          }

          if (result.validRows.length > 0) {
            console.log(`\n✅ [${objectType.toUpperCase()}] Valid Rows Preview (${result.validRows.length} total):`);
            result.validRows.slice(0, 3).forEach(row => {
              const preview = Object.keys(row)
                .filter(k => k !== 'rowNumber')
                .reduce((acc: any, key) => {
                  const value = row[key];
                  // Truncate long values for readability
                  if (typeof value === 'string' && value.length > 50) {
                    acc[key] = value.substring(0, 50) + '...';
                  } else {
                    acc[key] = value;
                  }
                  return acc;
                }, {});
              console.log(`   Row ${row.rowNumber}:`, preview);
            });
            if (result.validRows.length > 3) {
              console.log(`   ... and ${result.validRows.length - 3} more valid rows`);
            }
          }
        });

        console.log('\n' + '='.repeat(80));

        // Clean up uploaded file
        try {
          fs.unlinkSync(uploadedFile.path);
          console.log('🧹 [Data Migration Preview] Cleaned up uploaded file');
        } catch (cleanupError) {
          console.warn('⚠️ [Data Migration Preview] Failed to cleanup uploaded file:', cleanupError);
        }

        console.log('✅ [Data Migration Preview] Sending response with validation results');
        console.log('📤 [Data Migration Preview] Validation results keys:', Object.keys(validationResults));

        // Deep serialization function to handle Date objects and other non-serializable values
        const deepSerialize = (obj: any): any => {
          if (obj === null || obj === undefined) {
            return obj;
          }

          // Handle Date objects
          if (obj instanceof Date) {
            return obj.toISOString();
          }

          // Handle arrays
          if (Array.isArray(obj)) {
            return obj.map(item => deepSerialize(item));
          }

          // Handle plain objects
          if (typeof obj === 'object' && obj.constructor === Object) {
            const serialized: any = {};
            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                serialized[key] = deepSerialize(obj[key]);
              }
            }
            return serialized;
          }

          // Handle primitives and other types
          if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
            return obj;
          }

          // For other types (functions, class instances, etc.), convert to string
          try {
            // Try to convert to string if it's a complex object
            if (typeof obj === 'object') {
              // Check if it has a toJSON method
              if (typeof obj.toJSON === 'function') {
                return deepSerialize(obj.toJSON());
              }
              // Try to stringify and parse back
              return JSON.parse(JSON.stringify(obj, (_key, value) => {
                if (value instanceof Date) {
                  return value.toISOString();
                }
                return value;
              }));
            }
            return String(obj);
          } catch (e) {
            console.warn(`⚠️ [Serialization] Could not serialize value for key, using string representation:`, e);
            return String(obj);
          }
        };

        // Serialize the entire validation results
        const serializedResults = deepSerialize(validationResults);

        console.log('📤 [Data Migration Preview] Serialized results keys:', Object.keys(serializedResults));
        console.log('📤 [Data Migration Preview] Serialized results sample (first 2000 chars):', JSON.stringify(serializedResults, null, 2).substring(0, 2000));
        console.log('📤 [Data Migration Preview] Serialized results type check:', typeof serializedResults);
        console.log('📤 [Data Migration Preview] Serialized results user keys:', serializedResults.user ? Object.keys(serializedResults.user) : 'no user key');

        const response = {
          success: true,
          data: serializedResults
        };

        // Final check - ensure response can be stringified
        try {
          const testStringify = JSON.stringify(response);
          console.log('✅ [Data Migration Preview] Response can be stringified, length:', testStringify.length);
        } catch (e) {
          console.error('❌ [Data Migration Preview] Response cannot be stringified:', e);
        }

        return reply.send(response);
      } catch (error: any) {
        console.error('❌ [Data Migration Preview] Error:', error);
        console.error('❌ [Data Migration Preview] Error stack:', error.stack);
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Confirm and insert valid data
  fastify.post(
    '/import/confirm',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Data Migration'],
        summary: 'Confirm and insert validated data',
        description: 'Confirm the import and insert valid rows into the database',
        body: {
          type: 'object',
          required: ['objects', 'validRows'],
          properties: {
            objects: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['user', 'shift', 'leave', 'salary-assignment', 'salary-structure', 'attendance-record']
              },
              description: 'Array of object types to import'
            },
            validRows: {
              type: 'object',
              description: 'Object containing valid rows for each object type',
              additionalProperties: {
                type: 'array',
                items: { type: 'object' }
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
                description: 'Insert results for each object type',
                additionalProperties: true
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const body = request.body as any;
        const { objects, validRows } = body;

        if (!objects || !Array.isArray(objects) || objects.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'At least one object type must be specified' }
          });
        }

        if (!validRows || typeof validRows !== 'object') {
          return reply.status(400).send({
            success: false,
            error: { message: 'Valid rows must be provided' }
          });
        }

        // Validate and cast to ExportableObject[]
        const validObjectTypes: ExportableObject[] = ['user', 'shift', 'leave', 'salary-assignment', 'salary-structure', 'attendance-record'];
        const validatedObjects = objects.filter((obj: string): obj is ExportableObject =>
          validObjectTypes.includes(obj as ExportableObject)
        ) as ExportableObject[];

        if (validatedObjects.length === 0) {
          return reply.status(400).send({
            success: false,
            error: { message: 'No valid object types specified. Valid types: user, shift, leave, salary-assignment, salary-structure, attendance-record' }
          });
        }

        const importRequest: IImportRequest = {
          objects: validatedObjects,
          validRows
        };

        console.log('📥 [Data Migration Confirm] Request received');
        console.log('📋 [Data Migration Confirm] Objects:', validatedObjects);
        console.log('📋 [Data Migration Confirm] Valid rows keys:', Object.keys(validRows));

        const service = new DataMigrationService(request.container!.requestContext);
        const results = await service.confirmAndInsert(importRequest);

        console.log('✅ [Data Migration Confirm] Insert completed');
        console.log('📤 [Data Migration Confirm] Results keys:', Object.keys(results));
        console.log('📤 [Data Migration Confirm] Results:', JSON.stringify(results, null, 2).substring(0, 2000));

        // Deep serialization function to handle all data types properly
        const deepSerialize = (obj: any): any => {
          if (obj === null || obj === undefined) {
            return obj;
          }

          // Handle Date objects
          if (obj instanceof Date) {
            return obj.toISOString();
          }

          // Handle arrays
          if (Array.isArray(obj)) {
            return obj.map(item => deepSerialize(item));
          }

          // Handle plain objects
          if (typeof obj === 'object' && obj.constructor === Object) {
            const serialized: any = {};
            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                serialized[key] = deepSerialize(obj[key]);
              }
            }
            return serialized;
          }

          // Handle primitives
          if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
            return obj;
          }

          // For other types, convert to string
          try {
            if (typeof obj === 'object' && typeof obj.toJSON === 'function') {
              return deepSerialize(obj.toJSON());
            }
            return JSON.parse(JSON.stringify(obj, (_key, value) => {
              if (value instanceof Date) {
                return value.toISOString();
              }
              return value;
            }));
          } catch (e) {
            console.warn(`⚠️ [Serialization] Could not serialize value, using string representation:`, e);
            return String(obj);
          }
        };

        // Serialize the entire results object
        const serializedResults = deepSerialize(results);

        console.log('📤 [Data Migration Confirm] Serialized results keys:', Object.keys(serializedResults));
        console.log('📤 [Data Migration Confirm] Serialized results sample:', JSON.stringify(serializedResults, null, 2).substring(0, 1000));

        // Final check - ensure response can be stringified
        try {
          const testStringify = JSON.stringify({ success: true, data: serializedResults });
          console.log('✅ [Data Migration Confirm] Response can be stringified, length:', testStringify.length);
        } catch (e) {
          console.error('❌ [Data Migration Confirm] Response cannot be stringified:', e);
        }

        return reply.send({
          success: true,
          data: serializedResults
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

