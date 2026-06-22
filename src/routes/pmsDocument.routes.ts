import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { authenticate } from '../middleware/auth';
import { parseMultipartForm } from '../utilis/parseMultiPartForm';

export const pmsDocumentRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/upload',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['PMS Documents'],
        summary: 'Upload a PMS document attachment',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { body, files } = await parseMultipartForm(request);

        if (!files || files.length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'No file uploaded',
          });
        }

        const employeeId = String(body.employeeId || '').trim();
        const documentType = String(body.documentType || 'Other').trim();
        const documentName = String(body.documentName || '').trim();
        const documentDateRaw = String(body.documentDate || '').trim();
        const description = body.description ? String(body.description).trim() : undefined;
        const cycleId = body.cycleId ? String(body.cycleId).trim() : undefined;
        const annualAssignmentId = body.annualAssignmentId
          ? String(body.annualAssignmentId).trim()
          : undefined;
        const termAssignmentId = body.termAssignmentId
          ? String(body.termAssignmentId).trim()
          : undefined;

        if (!employeeId || !documentName || !documentDateRaw) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required fields: employeeId, documentName, documentDate',
          });
        }

        if (!Types.ObjectId.isValid(employeeId)) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid employeeId',
          });
        }

        const documentDate = new Date(documentDateRaw);
        if (Number.isNaN(documentDate.getTime())) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid document date',
          });
        }

        const data = await request.container!.pmsDocumentService.uploadDocument({
          employeeId,
          documentType,
          documentName,
          documentDate,
          description,
          cycleId,
          annualAssignmentId,
          termAssignmentId,
          file: files[0],
        });

        return reply.status(200).send({
          success: true,
          message: 'PMS document uploaded successfully',
          data,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (/file too large/i.test(errorMessage)) {
          return reply.status(413).send({
            success: false,
            error: 'Objective attachments must be less than 1 MB per file.',
          });
        }
        request.log.error({ error }, 'PMS document upload failed');
        return reply.status(500).send({
          success: false,
          error: `Internal server error: ${errorMessage}`,
        });
      }
    },
  );
};
