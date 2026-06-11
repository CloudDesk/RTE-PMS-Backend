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
import { PmsRole } from '../constants/pms.enums';

const SUPPORTED_SLA_RULES = {
  objective_submission_pending: {
    quarterStates: ['NOT_STARTED', 'OBJECTIVE_DRAFT', 'OBJECTIVE_REVISION_REQUIRED'],
  },
  objective_approval_pending: {
    quarterStates: ['OBJECTIVE_SUBMITTED'],
  },
  quarter_review_pending: {
    quarterStates: ['OBJECTIVE_APPROVED', 'MANAGER_REVIEW_OPEN'],
  },
  // TODO(PMS v3.1 Phase D/E): Add employee_achievement_submission_pending
  // SLA/reminder generation after achievement window enforcement is introduced.
} as const;

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
      const activeRules = await SlaRule.find({
        isActive: true,
        isDeleted: false,
        eventType: { $in: Object.keys(SUPPORTED_SLA_RULES) },
        entityType: 'QUARTER_ASSIGNMENT',
      })
        .sort({ cycleId: -1, createdAt: 1 })
        .lean();
      if (activeRules.length === 0) return 0;
      const scopedRuleCycles = this.buildScopedRuleCycleMap(activeRules);

      for (const rule of activeRules) {
        const pendingAssignments = (await this.getPendingAssignmentsForRule(rule)).filter(
          (assignment) =>
            !this.shouldSkipGlobalRuleForCycle(
              scopedRuleCycles,
              rule.eventType,
              rule.cycleId?.toString(),
              assignment.cycleId?.toString(),
            ),
        );
        const activeAssignmentIds = new Set(pendingAssignments.map((assignment) => assignment._id.toString()));

        const existingEvents = await SlaEvent.find({
          slaType: rule.eventType,
          entityType: rule.entityType,
          isDeleted: false,
          ...(rule.cycleId ? { cycleId: rule.cycleId } : {}),
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

          const ownerUserId = this.resolveOwnerUserIdForRule(rule.targetRole, qa);
          if (!ownerUserId) {
            continue;
          }

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

          const escalationTargetUserId = await this.resolveEscalationTargetForRule(rule.targetRole, qa);

          if (!exists) {
            await SlaEvent.create({
              slaType: rule.eventType,
              entityType: rule.entityType,
              entityId: qa._id,
              cycleId: qa.cycleId,
              quarterCode: qa.quarterCode,
              ownerUserId,
              dueAt,
              status: 'OPEN',
              escalationTargetUserId,
            });
            createdCount++;
            continue;
          }

          let changed = false;
          if (exists.status === 'CLOSED') {
            exists.status = 'OPEN';
            changed = true;
          }
          if (exists.ownerUserId.toString() !== ownerUserId.toString()) {
            exists.ownerUserId = ownerUserId;
            changed = true;
          }
          if ((exists.escalationTargetUserId?.toString() ?? '') !== (escalationTargetUserId?.toString() ?? '')) {
            exists.escalationTargetUserId = escalationTargetUserId;
            changed = true;
          }
          if (exists.dueAt.getTime() !== dueAt.getTime()) {
            exists.dueAt = dueAt;
            changed = true;
          }
          if (changed) {
            exists.updatedAt = new Date();
            await exists.save();
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

    const openSlas = await SlaEvent.find({ status: { $in: ['OPEN', 'OVERDUE', 'BREACHED'] }, isDeleted: false });
    let processedCount = 0;
    let sentCount = 0;

    const now = new Date();

    for (const sla of openSlas) {
      processedCount++;

      // Find the SLA rules that apply
      const ruleCandidates = await SlaRule.find({
        eventType: sla.slaType,
        entityType: sla.entityType,
        isActive: true,
        isDeleted: false,
      }).lean();
      const slaRules = this.selectApplicableRulesForEvent(ruleCandidates, sla.cycleId?.toString());

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
        if (sla.status === 'OPEN' || sla.status === 'OVERDUE') {
          sla.status = 'BREACHED';
          if (!sla.metadata) {
            sla.metadata = {};
          }
          (sla.metadata as any).breachedAt = now;
        }
      }

      await sla.save();
    }

    return { processed: processedCount, notificationsSent: sentCount };
  }

  private async getPendingAssignmentsForRule(rule: {
    eventType: string;
    entityType: string;
    cycleId?: Types.ObjectId;
  }) {
    const supportedRule = SUPPORTED_SLA_RULES[rule.eventType as keyof typeof SUPPORTED_SLA_RULES];
    if (!supportedRule || rule.entityType !== 'QUARTER_ASSIGNMENT') {
      return [];
    }

    return QuarterAssignment.find({
      quarterState: { $in: supportedRule.quarterStates },
      isDeleted: false,
      ...(rule.cycleId ? { cycleId: rule.cycleId } : {}),
    }).lean();
  }

  private resolveOwnerUserIdForRule(targetRole: string, assignment: any) {
    if (targetRole === PmsRole.MANAGER) {
      return assignment.assignedManagerId;
    }

    return assignment.employeeId;
  }

  private async resolveEscalationTargetForRule(targetRole: string, assignment: any): Promise<Types.ObjectId | undefined> {
    if (targetRole === PmsRole.EMPLOYEE) {
      return assignment.assignedManagerId ? new Types.ObjectId(assignment.assignedManagerId) : undefined;
    }

    if (targetRole === PmsRole.MANAGER && assignment.assignedManagerId) {
      const manager = await User.findById(assignment.assignedManagerId).select('managerId').lean();
      if (manager && manager.managerId) {
        return new Types.ObjectId(manager.managerId);
      }
    }

    return undefined;
  }

  private selectApplicableRulesForEvent<T extends { cycleId?: Types.ObjectId | null }>(
    rules: T[],
    cycleId?: string,
  ): T[] {
    if (!cycleId) {
      return rules.filter((rule) => !rule.cycleId);
    }

    const scopedRules = rules.filter((rule) => rule.cycleId?.toString() === cycleId);
    if (scopedRules.length > 0) {
      return scopedRules;
    }

    return rules.filter((rule) => !rule.cycleId);
  }

  private buildScopedRuleCycleMap(
    rules: Array<{ eventType: string; cycleId?: Types.ObjectId | null }>,
  ): Map<string, Set<string>> {
    const scopedCycles = new Map<string, Set<string>>();

    for (const rule of rules) {
      const cycleId = rule.cycleId?.toString();
      if (!cycleId) continue;

      const eventCycles = scopedCycles.get(rule.eventType) ?? new Set<string>();
      eventCycles.add(cycleId);
      scopedCycles.set(rule.eventType, eventCycles);
    }

    return scopedCycles;
  }

  private shouldSkipGlobalRuleForCycle(
    scopedCycles: Map<string, Set<string>>,
    eventType: string,
    ruleCycleId: string | undefined,
    assignmentCycleId: string | undefined,
  ): boolean {
    if (ruleCycleId || !assignmentCycleId) {
      return false;
    }

    return scopedCycles.get(eventType)?.has(assignmentCycleId) ?? false;
  }

  /**
   * Extend the SLA due date for a specific event
   */
  async extendSla(
    slaEventId: string,
    newDueAt: Date,
    reason: string,
    adminUserId: string,
    adminRole: string
  ): Promise<any> {
    if (!reason || reason.trim() === '') {
      throw new Error('SLA Extension requires a mandatory reason');
    }

    const slaEvent = await SlaEvent.findById(slaEventId);
    if (!slaEvent || slaEvent.isDeleted) {
      throw new Error('SLA Event not found');
    }

    // Must dynamically import audit service to avoid circular dependency issues if any
    const { auditService } = await import('./audit.service');

    if (newDueAt <= slaEvent.dueAt) {
      throw new Error('New due date must be after the current due date');
    }

    const originalDueAt = slaEvent.dueAt;
    
    // Store extension history in metadata
    const metadata = (slaEvent.metadata as any) || {};
    if (!metadata.extensions) {
      metadata.extensions = [];
    }
    
    metadata.extensions.push({
      originalDueAt,
      newDueAt,
      reason,
      extendedBy: new Types.ObjectId(adminUserId),
      extendedAt: new Date(),
    });

    slaEvent.dueAt = newDueAt;
    slaEvent.metadata = metadata;
    
    // If it was breached or overdue, revert to open
    if (slaEvent.status === 'BREACHED' || slaEvent.status === 'OVERDUE') {
      slaEvent.status = 'OPEN';
    }

    slaEvent.updatedAt = new Date();
    await slaEvent.save();

    await auditService.createAuditLog({
      actorId: adminUserId,
      actorRole: adminRole,
      action: 'PMS_SLA_EXTENDED',
      entityType: 'SlaEvent',
      entityId: slaEventId,
      previousValue: originalDueAt,
      newValue: newDueAt,
      reason,
      metadata: { slaType: slaEvent.slaType },
    });

    return slaEvent;
  }
}

export const slaService = new SlaService();
