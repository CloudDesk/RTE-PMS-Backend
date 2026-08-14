import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import {
  PMS_EMPLOYEE_PROFILE_MAX_FILE_BYTES,
} from '../services/pmsEmployeeProfileImport.service';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import { parseMultipartForm } from '../utilis/parseMultiPartForm';

const XLSX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

export const pmsEmployeeProfileRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  const ensureAdmin = async (request: any, reply: FastifyReply) => {
    const role = String(request.user?.role ?? '').trim().toLowerCase();
    if (!['admin', 'hr', 'hr_admin', 'hradmin'].includes(role)) {
      return reply
        .status(403)
        .send(
          errorResponse(
            'PMS_EMPLOYEE_PROFILE_ACCESS_DENIED',
            'Administrative role is required for employee career profiles',
          ),
        );
    }
  };

  fastify.get(
    '/',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary: 'List employees and their PMS career-profile status',
      },
    },
    async (request, reply) => {
      try {
        const query = request.query as Record<string, string | undefined>;
        const active =
          query.active === undefined || query.active === '' || query.active === 'all'
            ? undefined
            : query.active === 'true';
        const result =
          await request.container!.pmsEmployeeProfileImportService.listCareerProfiles(
            {
              page: Number(query.page) || 1,
              limit: Number(query.limit) || 20,
              search: query.search,
              department: query.department,
              grade: query.grade,
              profileStatus: query.profileStatus,
              active,
            },
          );
        return reply.send({
          success: true,
          message: 'Employee career profiles retrieved',
          data: result.items,
          meta: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        });
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/import-template',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary: 'Download the PMS employee career-profile Excel template',
      },
    },
    async (request, reply) => {
      try {
        const buffer =
          await request.container!.pmsEmployeeProfileImportService.generateImportTemplate();
        reply.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        reply.header(
          'Content-Disposition',
          'attachment; filename="pms_employee_career_profile_import_template.xlsx"',
        );
        return reply.send(buffer);
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/import/validate',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary: 'Validate a PMS employee career-profile Excel workbook',
        consumes: ['multipart/form-data'],
      },
    },
    async (request, reply) => {
      try {
        const { files } = await parseMultipartForm(request);
        if (files.length !== 1) {
          return reply
            .status(400)
            .send(
              errorResponse(
                'PMS_EMPLOYEE_PROFILE_FILE_REQUIRED',
                'Upload exactly one .xlsx file using the file field',
              ),
            );
        }

        const file = files[0];
        const originalFileName = String(file.filename ?? '').trim();
        if (!originalFileName.toLowerCase().endsWith('.xlsx')) {
          return reply
            .status(400)
            .send(
              errorResponse(
                'PMS_EMPLOYEE_PROFILE_FILE_TYPE_INVALID',
                'Only .xlsx files are supported',
              ),
            );
        }
        if (file.mimetype && !XLSX_MIME_TYPES.has(file.mimetype)) {
          return reply
            .status(400)
            .send(
              errorResponse(
                'PMS_EMPLOYEE_PROFILE_FILE_TYPE_INVALID',
                'The uploaded file is not recognized as an .xlsx workbook',
              ),
            );
        }

        const buffer = await file.toBuffer();
        if (buffer.length > PMS_EMPLOYEE_PROFILE_MAX_FILE_BYTES) {
          return reply
            .status(400)
            .send(
              errorResponse(
                'PMS_EMPLOYEE_PROFILE_FILE_TOO_LARGE',
                'The workbook exceeds the 10 MB file-size limit',
              ),
            );
        }

        const result =
          await request.container!.pmsEmployeeProfileImportService.queueImportWorkbook(
            {
              buffer,
              originalFileName,
            },
          );
        return reply.status(202).send(
          successResponse(
            result.status === 'FAILED'
              ? 'Workbook uploaded but background validation could not be queued'
              : 'Employee career-profile workbook queued for validation',
            result,
          ),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/import/:importReference/errors',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary: 'Download the validation error report for an import',
      },
    },
    async (request, reply) => {
      try {
        const { importReference } = request.params as { importReference: string };
        const buffer =
          await request.container!.pmsEmployeeProfileImportService.generateValidationErrorReport(
            importReference,
          );
        reply.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        reply.header(
          'Content-Disposition',
          `attachment; filename="pms_employee_profile_validation_${importReference}.xlsx"`,
        );
        return reply.send(buffer);
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/import/:importReference/confirm',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary:
          'Confirm a validated import or safely retry a failed confirmation',
      },
    },
    async (request, reply) => {
      try {
        const { importReference } = request.params as { importReference: string };
        const result =
          await request.container!.pmsEmployeeProfileImportService.queueImportConfirmation(
            importReference,
          );
        return reply.status(202).send(
          successResponse(
            result.status === 'FAILED'
              ? 'Background import could not be queued'
              : 'Employee career-profile import queued',
            result,
          ),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/import/:importReference/status',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary: 'Get background validation/import progress and results',
      },
    },
    async (request, reply) => {
      try {
        const { importReference } = request.params as {
          importReference: string;
        };
        const query = request.query as {
          previewPage?: string;
          previewLimit?: string;
        };
        const result =
          await request.container!.pmsEmployeeProfileImportService.getImportOperation(
            importReference,
            true,
            {
              page: Number(query.previewPage) || 1,
              limit: Number(query.previewLimit) || 100,
            },
          );
        return reply.send(
          successResponse('Employee career-profile import status retrieved', result),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/import/:importReference/retry',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary: 'Retry a failed background validation or import operation',
      },
    },
    async (request, reply) => {
      try {
        const { importReference } = request.params as {
          importReference: string;
        };
        const result =
          await request.container!.pmsEmployeeProfileImportService.retryImportOperation(
            importReference,
          );
        return reply
          .status(202)
          .send(successResponse('Background import retry queued', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/visibility/:employeeId',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary:
          'Get a read-only employee career profile for an authorized hierarchy viewer',
      },
    },
    async (request, reply) => {
      try {
        const { employeeId } = request.params as { employeeId: string };
        const result =
          await request.container!.pmsEmployeeProfileImportService.getVisibleCareerProfile(
            employeeId,
          );
        return reply.send(
          successResponse('Employee career profile retrieved', result),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:employeeId/history',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary: 'Get the change history for one employee career profile',
      },
    },
    async (request, reply) => {
      try {
        const { employeeId } = request.params as { employeeId: string };
        const result =
          await request.container!.pmsEmployeeProfileImportService.getCareerProfileHistory(
            employeeId,
          );
        return reply.send(
          successResponse('Employee career-profile history retrieved', result),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:employeeId',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary: 'Get one employee and the current PMS career profile',
      },
    },
    async (request, reply) => {
      try {
        const { employeeId } = request.params as { employeeId: string };
        const result =
          await request.container!.pmsEmployeeProfileImportService.getCareerProfile(
            employeeId,
          );
        return reply.send(
          successResponse('Employee career profile retrieved', result),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:employeeId',
    {
      onRequest: [authenticate, ensureAdmin],
      schema: {
        tags: ['PMS Employee Career Profiles'],
        summary: 'Create or update one employee PMS career profile',
      },
    },
    async (request, reply) => {
      try {
        const { employeeId } = request.params as { employeeId: string };
        const result =
          await request.container!.pmsEmployeeProfileImportService.saveCareerProfile(
            employeeId,
            request.body as any,
          );
        return reply.send(
          successResponse('Employee career profile saved', result),
        );
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  const normalized = message.toLowerCase();
  const status = normalized.includes('access denied')
    ? 403
    : normalized.includes('not found')
      ? 404
      : normalized.includes('changed by another administrator') ||
          normalized.includes('refresh the page')
        ? 409
        : 400;
  return reply
    .status(status)
    .send(errorResponse('PMS_EMPLOYEE_PROFILE_ERROR', message));
}
