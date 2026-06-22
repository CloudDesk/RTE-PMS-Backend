import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth';
import { SlaRule } from '../models/pms-sla-rule.model';
import { ReminderRule } from '../models/pms-reminder-rule.model';
import { NotificationEvent } from '../models/pms-notification-event.model';
import { slaService } from '../services/sla.service';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';
import { errorResponse, successResponse } from '../utilis/apiResponse';

const SUPPORTED_SLA_EVENT_TYPES = [
  'objective_submission_pending',
  'objective_approval_pending',
  'term_review_pending',
  'employee_achievement_submission_pending',
] as const;

const SUPPORTED_ENTITY_TYPE = 'TERM_ASSIGNMENT';

const ALLOWED_TARGET_ROLES: Record<string, string[]> = {
  objective_submission_pending: [PmsRole.EMPLOYEE, PmsRole.MANAGER],
  objective_approval_pending: [PmsRole.MANAGER],
  term_review_pending: [PmsRole.MANAGER],
  employee_achievement_submission_pending: [PmsRole.EMPLOYEE],
};

export async function pmsSlaRoutes(fastify: FastifyInstance) {
  fastify.get('/rules', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const rules = await SlaRule.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();
    return reply.send(successResponse('PMS SLA rules fetched successfully', rules));
  });

  fastify.post('/rules', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const ruleData = request.body as any;
    const validationError = validateRulePayload(ruleData);
    if (validationError) {
      return reply.status(400).send(errorResponse('PMS_SLA_VALIDATION_ERROR', validationError));
    }

    const rule = await SlaRule.create({
      ...ruleData,
      createdBy: (request.user as any)._id,
    });

    return reply.status(201).send(successResponse('PMS SLA rule created successfully', rule));
  });

  fastify.put('/rules/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const { id } = request.params as { id: string };
    const ruleData = request.body as any;
    const existingRule = await SlaRule.findById(id).lean();
    if (!existingRule || existingRule.isDeleted) {
      return reply.status(404).send(errorResponse('PMS_SLA_RULE_NOT_FOUND', 'SLA rule not found'));
    }

    const mergedRule = {
      ...existingRule,
      ...ruleData,
    };
    const validationError = validateRulePayload(mergedRule);
    if (validationError) {
      return reply.status(400).send(errorResponse('PMS_SLA_VALIDATION_ERROR', validationError));
    }

    const rule = await SlaRule.findByIdAndUpdate(
      id,
      { ...ruleData, updatedBy: (request.user as any)._id },
      { new: true },
    );

    return reply.send(successResponse('PMS SLA rule updated successfully', rule));
  });

  fastify.delete('/rules/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const { id } = request.params as { id: string };
    await SlaRule.findByIdAndUpdate(id, { isDeleted: true });

    return reply.send(successResponse('PMS SLA rule deleted successfully', null));
  });

  fastify.get('/reminders/:slaRuleId', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const { slaRuleId } = request.params as { slaRuleId: string };
    const reminders = await ReminderRule.find({ slaRuleId, isDeleted: false }).sort({ createdAt: -1 }).lean();
    return reply.send(successResponse('PMS SLA reminders fetched successfully', reminders));
  });

  fastify.post('/reminders', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const reminderData = request.body as any;
    const reminder = await ReminderRule.create({
      ...reminderData,
      createdBy: (request.user as any)._id,
    });

    return reply.status(201).send(successResponse('PMS SLA reminder created successfully', reminder));
  });

  fastify.put('/reminders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const { id } = request.params as { id: string };
    const reminderData = request.body as any;

    const reminder = await ReminderRule.findByIdAndUpdate(
      id,
      { ...reminderData, updatedBy: (request.user as any)._id },
      { new: true },
    );

    return reply.send(successResponse('PMS SLA reminder updated successfully', reminder));
  });

  fastify.delete('/reminders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const { id } = request.params as { id: string };
    await ReminderRule.findByIdAndUpdate(id, { isDeleted: true });

    return reply.send(successResponse('PMS SLA reminder deleted successfully', null));
  });

  fastify.post('/trigger-check', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const result = await slaService.processSlas(request.container?.requestContext.pmsCurrentDate);
    return reply.send(successResponse('PMS SLA engine processed successfully', result));
  });

  fastify.post('/events/:id/extend', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const { id } = request.params as { id: string };
    const { newDueAt, reason } = request.body as any;
    
    if (!newDueAt || !reason) {
      return reply.status(400).send(errorResponse('PMS_SLA_VALIDATION_ERROR', 'newDueAt and reason are required'));
    }

    const adminUser = request.user as any;
    const adminRole = normalizePmsRole(adminUser.role || '');

    const slaEvent = await slaService.extendSla(
      id,
      new Date(newDueAt),
      reason,
      adminUser._id,
      adminRole
    );

    return reply.send(successResponse('PMS SLA extended successfully', slaEvent));
  });

  fastify.get('/history/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    if (!assertAdmin(request, reply)) return;

    const { userId } = request.params as { userId: string };
    const history = await NotificationEvent.find({ recipientUserId: userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return reply.send(successResponse('PMS notification history fetched successfully', history));
  });
}

function assertAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  const role = normalizePmsRole(String((request.user as any)?.role ?? ''));
  if (role !== PmsRole.ADMIN) {
    reply.status(403).send(errorResponse('PMS_ADMIN_ACCESS_REQUIRED', 'Unauthorized config access'));
    return false;
  }

  return true;
}

function validateRulePayload(ruleData: any): string | null {
  const eventType = String(ruleData?.eventType ?? '');
  if (!SUPPORTED_SLA_EVENT_TYPES.includes(eventType as (typeof SUPPORTED_SLA_EVENT_TYPES)[number])) {
    return 'Unsupported SLA event type';
  }

  if (String(ruleData?.entityType ?? '') !== SUPPORTED_ENTITY_TYPE) {
    return `SLA rules must use entityType "${SUPPORTED_ENTITY_TYPE}"`;
  }

  const normalizedRole = normalizePmsRole(String(ruleData?.targetRole ?? ''));
  const allowedRoles = ALLOWED_TARGET_ROLES[eventType] ?? [];
  if (!normalizedRole || !allowedRoles.includes(normalizedRole)) {
    return `Target role is invalid for event type "${eventType}"`;
  }

  if (ruleData?.baseDatePointer === 'FIXED_DATE' && !ruleData?.fixedDate) {
    return 'Fixed date is required when base date pointer is FIXED_DATE';
  }

  return null;
}
