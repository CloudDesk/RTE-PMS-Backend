import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { SlaRule } from '../models/pms-sla-rule.model';
import { ReminderRule } from '../models/pms-reminder-rule.model';
import { NotificationEvent } from '../models/pms-notification-event.model';
import { slaService } from '../services/sla.service';
import { PmsRole } from '../constants/pms.enums';

export async function pmsSlaRoutes(fastify: FastifyInstance) {
  // Config routes - restricted to SUPER_ADMIN & ADMIN
  fastify.get('/rules', { preHandler: [authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role.replace(/[ /-]/g, '_').toUpperCase();
    if (userRole !== PmsRole.SUPER_ADMIN && userRole !== PmsRole.ADMIN) {
      return reply.status(403).send({ success: false, message: 'Unauthorized config access' });
    }

    const rules = await SlaRule.find({ isDeleted: false }).lean();
    return reply.send({ success: true, data: rules });
  });

  fastify.post('/rules', { preHandler: [authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role.replace(/[ /-]/g, '_').toUpperCase();
    if (userRole !== PmsRole.SUPER_ADMIN && userRole !== PmsRole.ADMIN) {
      return reply.status(403).send({ success: false, message: 'Unauthorized config access' });
    }

    const ruleData = request.body as any;
    const rule = await SlaRule.create({
      ...ruleData,
      createdBy: (request.user as any)._id,
    });

    return reply.send({ success: true, data: rule });
  });

  fastify.put('/rules/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role.replace(/[ /-]/g, '_').toUpperCase();
    if (userRole !== PmsRole.SUPER_ADMIN && userRole !== PmsRole.ADMIN) {
      return reply.status(403).send({ success: false, message: 'Unauthorized config access' });
    }

    const { id } = request.params as { id: string };
    const ruleData = request.body as any;

    const rule = await SlaRule.findByIdAndUpdate(
      id,
      { ...ruleData, updatedBy: (request.user as any)._id },
      { new: true }
    );

    return reply.send({ success: true, data: rule });
  });

  fastify.delete('/rules/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role.replace(/[ /-]/g, '_').toUpperCase();
    if (userRole !== PmsRole.SUPER_ADMIN && userRole !== PmsRole.ADMIN) {
      return reply.status(403).send({ success: false, message: 'Unauthorized config access' });
    }

    const { id } = request.params as { id: string };
    await SlaRule.findByIdAndUpdate(id, { isDeleted: true });

    return reply.send({ success: true, message: 'SLA rule deleted successfully' });
  });

  // Reminders config
  fastify.get('/reminders/:slaRuleId', { preHandler: [authenticate] }, async (request, reply) => {
    const { slaRuleId } = request.params as { slaRuleId: string };
    const reminders = await ReminderRule.find({ slaRuleId, isDeleted: false }).lean();
    return reply.send({ success: true, data: reminders });
  });

  fastify.post('/reminders', { preHandler: [authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role.replace(/[ /-]/g, '_').toUpperCase();
    if (userRole !== PmsRole.SUPER_ADMIN && userRole !== PmsRole.ADMIN) {
      return reply.status(403).send({ success: false, message: 'Unauthorized config access' });
    }

    const reminderData = request.body as any;
    const reminder = await ReminderRule.create({
      ...reminderData,
      createdBy: (request.user as any)._id,
    });

    return reply.send({ success: true, data: reminder });
  });

  fastify.put('/reminders/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role.replace(/[ /-]/g, '_').toUpperCase();
    if (userRole !== PmsRole.SUPER_ADMIN && userRole !== PmsRole.ADMIN) {
      return reply.status(403).send({ success: false, message: 'Unauthorized config access' });
    }

    const { id } = request.params as { id: string };
    const reminderData = request.body as any;

    const reminder = await ReminderRule.findByIdAndUpdate(
      id,
      { ...reminderData, updatedBy: (request.user as any)._id },
      { new: true }
    );

    return reply.send({ success: true, data: reminder });
  });

  // Trigger processing SLA engine manually
  fastify.post('/trigger-check', { preHandler: [authenticate] }, async (_request, reply) => {
    const result = await slaService.processSlas();
    return reply.send({ success: true, data: result });
  });

  // Get user notification history logs (useful to show in-app or audit reminders)
  fastify.get('/history/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const history = await NotificationEvent.find({ recipientUserId: userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return reply.send({ success: true, data: history });
  });
}
