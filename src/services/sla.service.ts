import { SlaRule } from '../models/pms-sla-rule.model';
import { ReminderRule } from '../models/pms-reminder-rule.model';
import { SlaEvent } from '../models/pms-sla-event.model';
import { pmsNotificationService } from './pms-notification.service';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import { User } from '../models/user.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { Types } from 'mongoose';
import { NotificationEvent } from '../models/pms-notification-event.model';

export class SlaService {
  /**
   * Calculates due date based on rules
   */
  async calculateDueDate(
    baseDatePointer: 'CYCLE_START' | 'QUARTER_START' | 'PREVIOUS_TRANSITION' | 'FIXED_DATE',
    offsetDays: number,
    context: {
      cycleId?: string;
      quarterCycleId?: string;
      previousTransitionDate?: Date;
      fixedDate?: Date;
    }
  ): Promise<Date> {
    let baseDate = new Date();

    if (baseDatePointer === 'CYCLE_START' && context.cycleId) {
      const cycle = await AnnualCycle.findById(context.cycleId).lean();
      if (cycle) baseDate = new Date(cycle.startDate);
    } else if (baseDatePointer === 'QUARTER_START' && context.quarterCycleId) {
      const qCycle = await QuarterCycle.findById(context.quarterCycleId).lean();
      if (qCycle) baseDate = new Date(qCycle.startDate);
    } else if (baseDatePointer === 'PREVIOUS_TRANSITION' && context.previousTransitionDate) {
      baseDate = new Date(context.previousTransitionDate);
    } else if (baseDatePointer === 'FIXED_DATE' && context.fixedDate) {
      baseDate = new Date(context.fixedDate);
    }

    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + offsetDays);
    return dueDate;
  }

  /**
   * Create SlaEvent for a specific target entity
   */
  async createSlaEvent(input: {
    slaType: string;
    entityType: string;
    entityId: string;
    cycleId?: string;
    quarterCode?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    ownerUserId: string;
    dueAt: Date;
    escalationTargetUserId?: string;
    metadata?: any;
  }): Promise<any> {
    return await SlaEvent.create({
      slaType: input.slaType,
      entityType: input.entityType,
      entityId: new Types.ObjectId(input.entityId),
      cycleId: input.cycleId ? new Types.ObjectId(input.cycleId) : undefined,
      quarterCode: input.quarterCode,
      ownerUserId: new Types.ObjectId(input.ownerUserId),
      dueAt: input.dueAt,
      status: 'OPEN',
      escalationTargetUserId: input.escalationTargetUserId
        ? new Types.ObjectId(input.escalationTargetUserId)
        : undefined,
      metadata: input.metadata,
    });
  }

  /**
   * Automatically synchronizes and creates SlaEvent records for open workflow steps
   * that match active SLA rules (e.g. pending objective submissions).
   */
  async syncSlaEvents(): Promise<number> {
    let createdCount = 0;
    try {
      const activeRules = await SlaRule.find({ isActive: true, isDeleted: false }).lean();
      if (activeRules.length === 0) return 0;

      for (const rule of activeRules) {
        const pendingAssignments = await this.getPendingAssignmentsForRule(rule.eventType);
        const activeAssignmentIds = new Set(pendingAssignments.map((assignment) => assignment._id.toString()));

        const existingEvents = await SlaEvent.find({
          slaType: rule.eventType,
          entityType: 'QUARTER_ASSIGNMENT',
          isDeleted: false,
        });

        for (const event of existingEvents) {
          if (!activeAssignmentIds.has(event.entityId.toString()) && event.status !== 'CLOSED') {
            event.status = 'CLOSED';
            event.updatedAt = new Date();
            await event.save();
          }
        }

        for (const qa of pendingAssignments) {
          const exists = existingEvents.find(
            (event) => event.entityId.toString() === qa._id.toString(),
          );

          if (!exists) {
            const dueAt = await this.calculateDueDate(
              rule.baseDatePointer,
              rule.offsetDays,
              {
                cycleId: qa.cycleId?.toString(),
                quarterCycleId: qa.cycleQuarterId?.toString(),
                previousTransitionDate: qa.lastTransitionAt,
                fixedDate: rule.fixedDate,
              },
            );

            await SlaEvent.create({
              slaType: rule.eventType,
              entityType: 'QUARTER_ASSIGNMENT',
              entityId: qa._id,
              cycleId: qa.cycleId,
              quarterCode: qa.quarterCode,
              ownerUserId: this.resolveOwnerUserIdForRule(rule.eventType, qa),
              dueAt,
              status: 'OPEN',
              escalationTargetUserId: this.resolveEscalationTargetForRule(rule.eventType, qa),
            });
            createdCount++;
          }
        }
      }
    } catch (error) {
      console.error('Error syncing SLA events:', error);
    }
    return createdCount;
  }

  /**
   * Process all outstanding SLA and Reminder rules.
   * Runs checks for pre-due, due-date, overdue, and escalation triggers.
   */
  async processSlas(): Promise<{ processed: number; notificationsSent: number }> {
    // Automatically synchronize/seed SLA Event records for open workflow steps
    await this.syncSlaEvents();

    const openSlas = await SlaEvent.find({ status: 'OPEN', isDeleted: false });
    let processedCount = 0;
    let sentCount = 0;

    const now = new Date();

    for (const sla of openSlas) {
      processedCount++;

      // Find the SLA rules that apply
      const slaRules = await SlaRule.find({ eventType: sla.slaType, isActive: true, isDeleted: false });

      for (const rule of slaRules) {
        const reminderRules = await ReminderRule.find({
          slaRuleId: rule._id,
          isActive: true,
          isDeleted: false,
        });

        const timeDiffMs = now.getTime() - sla.dueAt.getTime();
        const daysDiff = Math.floor(timeDiffMs / (1000 * 60 * 60 * 24));

        for (const rem of reminderRules) {
          let triggerReminder = false;

          if (rem.reminderType === 'PRE_DUE' && daysDiff < 0) {
            // Negative offsetDays specifies how many days before due date to remind
            if (daysDiff === rem.offsetDays) {
              triggerReminder = true;
            }
          } else if (rem.reminderType === 'DUE_DATE' && daysDiff === 0) {
            triggerReminder = true;
          } else if (rem.reminderType === 'OVERDUE' && daysDiff > 0 && daysDiff === rem.offsetDays) {
            triggerReminder = true;
          } else if (rem.reminderType === 'ESCALATION' && daysDiff > 0 && daysDiff === rem.offsetDays) {
            // Escalation rule
            triggerReminder = true;
          }

          if (triggerReminder) {
            const recipientId = rem.reminderType === 'ESCALATION' && sla.escalationTargetUserId
              ? sla.escalationTargetUserId.toString()
              : sla.ownerUserId.toString();

            const alreadySent = await NotificationEvent.findOne({
              eventType: `${sla.slaType}_${rem.reminderType}`,
              recipientUserId: new Types.ObjectId(recipientId),
              entityType: sla.entityType,
              entityId: sla.entityId,
              channel: rem.channel === 'BOTH' ? { $in: ['EMAIL', 'IN_APP'] } : rem.channel,
              deliveryStatus: { $in: ['PENDING', 'SENT'] },
              isDeleted: false,
            }).lean();

            if (alreadySent) {
              continue;
            }

            const user = await User.findById(recipientId).lean();
            if (user) {
              // Custom text formatting
              let subject = rem.subjectTemplate.replace('{userName}', user.name || 'User');
              let body = rem.bodyTemplate
                .replace('{userName}', user.name || 'User')
                .replace('{dueDate}', sla.dueAt.toDateString());

              // Send the notification
              await pmsNotificationService.triggerNotification(
                recipientId,
                `${sla.slaType}_${rem.reminderType}`,
                rem.channel,
                subject,
                body,
                sla.entityType,
                sla.entityId.toString(),
                sla.cycleId?.toString()
              );

              sentCount++;

              if (rem.reminderType === 'ESCALATION') {
                sla.escalatedAt = now;
              } else {
                sla.lastReminderAt = now;
              }
            }
          }
        }
      }

      // If overdue, update SLA event status but never auto-progress workflow (FSD Rule)
      if (now > sla.dueAt) {
        sla.status = 'OVERDUE';
      }

      await sla.save();
    }

    return { processed: processedCount, notificationsSent: sentCount };
  }

  private async getPendingAssignmentsForRule(eventType: string) {
    if (eventType === 'objective_submission_pending') {
      return QuarterAssignment.find({
        quarterState: { $in: ['NOT_STARTED', 'OBJECTIVE_DRAFT', 'OBJECTIVE_REVISION_REQUIRED'] },
        isDeleted: false,
      }).lean();
    }

    if (eventType === 'objective_approval_pending') {
      return QuarterAssignment.find({
        quarterState: 'OBJECTIVE_SUBMITTED',
        isDeleted: false,
      }).lean();
    }

    if (eventType === 'quarter_review_pending') {
      return QuarterAssignment.find({
        quarterState: { $in: ['OBJECTIVE_APPROVED', 'MANAGER_REVIEW_OPEN'] },
        isDeleted: false,
      }).lean();
    }

    return [];
  }

  private resolveOwnerUserIdForRule(eventType: string, assignment: any) {
    if (eventType === 'objective_submission_pending') {
      return assignment.employeeId;
    }

    if (eventType === 'objective_approval_pending' || eventType === 'quarter_review_pending') {
      return assignment.assignedManagerId;
    }

    return assignment.employeeId;
  }

  private resolveEscalationTargetForRule(eventType: string, assignment: any) {
    if (eventType === 'objective_submission_pending') {
      return assignment.assignedManagerId;
    }

    return undefined;
  }
}

export const slaService = new SlaService();
