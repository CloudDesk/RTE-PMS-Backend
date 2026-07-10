import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  ApproveProbationReviewInput,
  BulkCreateProbationReviewInput,
  CancelProbationReviewInput,
  CreateProbationReviewInput,
  OpenProbationReviewInput,
  ProbationReviewListQuery,
  ReturnProbationReviewInput,
  SaveProbationReviewDraftInput,
  SaveProbationReviewValuesInput,
  SyncDueProbationReviewsInput,
} from '../services/probationReview.service';

export const probationReviewRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.probationReviewService.listAssignments(
          request.query as ProbationReviewListQuery,
        );
        return reply.send(successResponse('Trainee review assignments fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.probationReviewService.createAssignment(
          request.body as CreateProbationReviewInput,
        );
        return reply.status(201).send(successResponse('Trainee review assignment created successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/sync-due',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.probationReviewService.syncDueProbationReviews(
          request.body as SyncDueProbationReviewsInput,
        );
        return reply.send(successResponse('Due trainee reviews synced successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/bulk',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.probationReviewService.createAssignmentsBulk(
          request.body as BulkCreateProbationReviewInput,
        );
        return reply.status(201).send(successResponse('Trainee review assignments processed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/drafts',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.probationReviewService.listDrafts();
        return reply.send(successResponse('Trainee review drafts fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/drafts',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.probationReviewService.saveDraft(
          request.body as SaveProbationReviewDraftInput,
        );
        return reply.status(201).send(successResponse('Trainee review draft saved successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/drafts/:draftId',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { draftId } = request.params as { draftId: string };
        const result = await request.container!.probationReviewService.getDraft(draftId);
        return reply.send(successResponse('Trainee review draft fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.delete(
    '/drafts/:draftId',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { draftId } = request.params as { draftId: string };
        const result = await request.container!.probationReviewService.deleteDraft(draftId);
        return reply.send(successResponse('Trainee review draft discarded successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/drafts/:draftId/assign',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { draftId } = request.params as { draftId: string };
        const result = await request.container!.probationReviewService.assignDraft(draftId);
        return reply.send(successResponse('Trainee review draft assigned successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:assignmentId',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.getAssignment(assignmentId);
        return reply.send(successResponse('Trainee review assignment fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/open',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.openAssignment(
          assignmentId,
          request.body as OpenProbationReviewInput,
        );
        return reply.send(successResponse('Trainee review opened successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:assignmentId/manager-1/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.saveManager1Draft(
          assignmentId,
          request.body as SaveProbationReviewValuesInput,
        );
        return reply.send(successResponse('Trainee review draft saved successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/manager-1/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.submitManager1(
          assignmentId,
          request.body as SaveProbationReviewValuesInput,
        );
        return reply.send(successResponse('Trainee review submitted to Approver Level Two successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/manager-1/delegate-to-manager-2',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.delegateToManager2(
          assignmentId,
          request.body as SaveProbationReviewValuesInput,
        );
        return reply.send(successResponse('Trainee review delegated to Approver Level Two successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/manager-2/approve',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.approveByManager2(
          assignmentId,
          request.body as ApproveProbationReviewInput,
        );
        return reply.send(successResponse('Trainee review finalized successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/manager-2/return',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.returnToManager1(
          assignmentId,
          request.body as ReturnProbationReviewInput,
        );
        return reply.send(successResponse('Trainee review returned to Approver Level One successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/manager-2/reassign-approval-to-manager-1',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.reassignApprovalToManager1(
          assignmentId,
          request.body as ReturnProbationReviewInput,
        );
        return reply.send(successResponse('Approval reassigned to Approver Level One successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:assignmentId/cancel',
    { onRequest: [authenticate], schema: { tags: ['PMS Trainee Reviews'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const result = await request.container!.probationReviewService.cancelAssignment(
          assignmentId,
          request.body as CancelProbationReviewInput,
        );
        return reply.send(successResponse('Trainee review cancelled successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_PROBATION_REVIEW_ERROR', message));
}
