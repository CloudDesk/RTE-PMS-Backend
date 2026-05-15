import { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/auth';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import type {
  PreviewPmsCommunicationInput,
  SendPmsCommunicationInput,
} from '../services/pmsCommunication.service';

export const pmsCommunicationRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.post(
    '/preview',
    { onRequest: [authenticate], schema: { tags: ['PMS Communication Dispatch'] } },
    async (request, reply) => {
      try {
        const preview = await request.container!.pmsCommunicationService.previewCommunication(
          request.body as PreviewPmsCommunicationInput,
        );
        return reply.send(successResponse('PMS communication preview generated successfully', preview));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/send',
    { onRequest: [authenticate], schema: { tags: ['PMS Communication Dispatch'] } },
    async (request, reply) => {
      try {
        const dispatch = await request.container!.pmsCommunicationService.sendCommunication(
          request.body as SendPmsCommunicationInput,
        );
        return reply.status(201).send(successResponse('PMS communication sent successfully', dispatch));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/resend',
    { onRequest: [authenticate], schema: { tags: ['PMS Communication Dispatch'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { correctionReason } = request.body as { correctionReason?: string };
        const dispatch = await request.container!.pmsCommunicationService.resendCommunication(
          id,
          correctionReason,
        );
        return reply.status(201).send(successResponse('PMS communication resent successfully', dispatch));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/history/:annualAssignmentId',
    { onRequest: [authenticate], schema: { tags: ['PMS Communication Dispatch'] } },
    async (request, reply) => {
      try {
        const { annualAssignmentId } = request.params as { annualAssignmentId: string };
        const history = await request.container!.pmsCommunicationService.getHistory(annualAssignmentId);
        return reply.send(successResponse('PMS communication history fetched successfully', history));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return reply.status(400).send(errorResponse('PMS_COMMUNICATION_ERROR', message));
}
