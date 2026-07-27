import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  AnnualDecisionListQuery,
  ReassignFinalReviewerInput,
  OverrideFinalRatingInput,
  OverrideFinalScoreInput,
  ReopenDecisionInput,
  SaveDecisionDraftInput,
  SaveFinalReviewInput,
  UpdateVisibilityInput,
} from '../services/annualDecision.service';

export const annualDecisionRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.get(
    '/my-final-reviews',
    { onRequest: [authenticate], schema: { tags: ['PMS Final Review'] } },
    async (request, reply) => {
      try {
        const items = await request.container!.annualDecisionService.listMyFinalReviews();
        return reply.send(successResponse('My Final Reviews fetched successfully', items));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:id/decision/final-review',
    { onRequest: [authenticate], schema: { tags: ['PMS Final Review'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.annualDecisionService.saveFinalReview(id, request.body as SaveFinalReviewInput);
        return reply.send(successResponse('Final Review saved successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/decision/final-review/complete',
    { onRequest: [authenticate], schema: { tags: ['PMS Final Review'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.annualDecisionService.completeFinalReview(id);
        return reply.send(successResponse('Final Review completed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/final-reviewer/reassign',
    { onRequest: [authenticate], schema: { tags: ['PMS Final Review'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.annualDecisionService.reassignFinalReviewer(id, request.body as ReassignFinalReviewerInput);
        return reply.send(successResponse('Final Reviewer reassigned successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Annual Appraisal Decision'] } },
    async (request, reply) => {
      try {
        const assignments = await request.container!.annualDecisionService.listAssignments(
          request.query as AnnualDecisionListQuery,
        );
        return reply.send(successResponse('Annual decision assignments fetched successfully', assignments));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id/summary',
    { onRequest: [authenticate], schema: { tags: ['PMS Annual Appraisal Decision'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const summary = await request.container!.annualDecisionService.getSummary(id);
        return reply.send(successResponse('Annual assignment summary fetched successfully', summary));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:id/decision/draft',
    { onRequest: [authenticate], schema: { tags: ['PMS Annual Appraisal Decision'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const decision = await request.container!.annualDecisionService.saveDecisionDraft(
          id,
          request.body as SaveDecisionDraftInput,
        );
        return reply.send(successResponse('Annual decision draft saved successfully', decision));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/decision/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Annual Appraisal Decision'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const decision = await request.container!.annualDecisionService.submitDecision(id);
        return reply.send(successResponse('Annual decision submitted successfully', decision));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/decision/final-score/override',
    { onRequest: [authenticate], schema: { tags: ['PMS Annual Appraisal Decision'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const decision = await request.container!.annualDecisionService.overrideFinalScore(
          id,
          request.body as OverrideFinalScoreInput,
        );
        return reply.send(successResponse('Annual final score overridden successfully', decision));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/decision/final-rating/override',
    { onRequest: [authenticate], schema: { tags: ['PMS Annual Appraisal Decision'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const decision = await request.container!.annualDecisionService.overrideFinalRating(
          id,
          request.body as OverrideFinalRatingInput,
        );
        return reply.send(successResponse('Annual final rating overridden successfully', decision));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/decision/freeze',
    { onRequest: [authenticate], schema: { tags: ['PMS Annual Appraisal Decision'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const decision = await request.container!.annualDecisionService.freezeDecision(id);
        return reply.send(successResponse('Annual decision frozen successfully', decision));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/decision/reopen',
    { onRequest: [authenticate], schema: { tags: ['PMS Annual Appraisal Decision'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const decision = await request.container!.annualDecisionService.reopenDecision(
          id,
          request.body as ReopenDecisionInput,
        );
        return reply.send(successResponse('Annual decision reopened successfully', decision));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/visibility',
    { onRequest: [authenticate], schema: { tags: ['PMS Visibility Governance'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const annualAssignment = await request.container!.annualDecisionService.updateVisibility(
          id,
          request.body as UpdateVisibilityInput,
        );
        return reply.send(successResponse('Annual visibility updated successfully', annualAssignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_ANNUAL_DECISION_ERROR', message));
}
