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
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import {
  EmployeeAchievementSubmission,
  EmployeeAchievementSubmissionStatus,
} from '../models/pms-employee-achievement-submission.model';
import { PmsTemplateVersion, type ITemplateSection } from '../models/pms-template-version.model';

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
  employee_achievement_submission_pending: {
    quarterStates: [
      'NOT_STARTED',
      'OBJECTIVE_DRAFT',
      'OBJECTIVE_SUBMITTED',
      'OBJECTIVE_REVISION_REQUIRED',
      'OBJECTIVE_APPROVED',
      'MANAGER_REVIEW_OPEN',
      'MANAGER_REVIEW_SUBMITTED',
      'REOPENED_BY_ADMIN',
    ],
  },
} as const;

type PendingSlaTarget = {
  assignment: any;
  dueAt?: Date;
  ownerUserId?: Types.ObjectId;
  escalationTargetUserId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
};

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
        const pendingTargets = (await this.getPendingTargetsForRule(rule)).filter(
          (target) =>
            !this.shouldSkipGlobalRuleForCycle(
              scopedRuleCycles,
              rule.eventType,
              rule.cycleId?.toString(),
              target.assignment.cycleId?.toString(),
            ),
        );
        const activeAssignmentIds = new Set(
          pendingTargets.map((target) => target.assignment._id.toString()),
        );

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

        for (const target of pendingTargets) {
          const qa = target.assignment;
          const exists = existingEvents.find(
            (event) => event.entityId.toString() === qa._id.toString(),
          );

          const ownerUserId = target.ownerUserId ?? this.resolveOwnerUserIdForRule(rule.targetRole, qa);
          if (!ownerUserId) {
            continue;
          }

          const dueAt = target.dueAt ?? await this.calculateDueDate(
            rule.baseDatePointer,
            rule.offsetDays,
            {
              cycleId: qa.cycleId?.toString(),
              quarterCycleId: qa.cycleQuarterId?.toString(),
              previousTransitionDate: qa.lastTransitionAt,
              fixedDate: rule.fixedDate,
            },
          );

          const escalationTargetUserId = target.escalationTargetUserId ??
            await this.resolveEscalationTargetForRule(rule.targetRole, qa);

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
              metadata: target.metadata,
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
          if (this.hasMetadataChanged(exists.metadata, target.metadata)) {
            exists.metadata = target.metadata;
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
  async processSlas(currentDate?: Date): Promise<{ processed: number; notificationsSent: number }> {
    // Automatically synchronize/seed SLA Event records for open workflow steps
    await this.syncSlaEvents();

    const openSlas = await SlaEvent.find({ status: { $in: ['OPEN', 'OVERDUE', 'BREACHED'] }, isDeleted: false });
    let processedCount = 0;
    let sentCount = 0;

    const now = currentDate ?? new Date();

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

        for (const rem of reminderRules) {
          const triggerReminder = this.shouldTriggerReminder(sla, rem, now);

          if (triggerReminder) {
            const recipientIds = this.resolveRecipientIdsForReminder(sla, rem);

            for (const recipientId of recipientIds) {
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
              if (!user) {
                continue;
              }

              const content = this.buildReminderContent(sla, rem, user.name || 'User');

              await pmsNotificationService.triggerNotification(
                recipientId,
                `${sla.slaType}_${rem.reminderType}`,
                rem.channel,
                content.subject,
                content.body,
                sla.entityType,
                sla.entityId.toString(),
                sla.cycleId?.toString(),
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

  private async getPendingTargetsForRule(rule: {
    eventType: string;
    entityType: string;
    cycleId?: Types.ObjectId;
  }): Promise<PendingSlaTarget[]> {
    if (rule.eventType === 'employee_achievement_submission_pending') {
      return this.getPendingAchievementTargets(rule);
    }

    const assignments = await this.getPendingAssignmentsForRule(rule);
    return assignments.map((assignment) => ({ assignment }));
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

  private async getPendingAchievementTargets(rule: {
    eventType: string;
    entityType: string;
    cycleId?: Types.ObjectId;
  }): Promise<PendingSlaTarget[]> {
    if (rule.entityType !== 'QUARTER_ASSIGNMENT') {
      return [];
    }

    const supportedRule = SUPPORTED_SLA_RULES.employee_achievement_submission_pending;
    const assignments = await QuarterAssignment.find({
      quarterState: { $in: supportedRule.quarterStates },
      isDeleted: false,
      ...(rule.cycleId ? { cycleId: rule.cycleId } : {}),
    }).lean();

    if (assignments.length === 0) {
      return [];
    }

    const quarterAssignmentIds = assignments.map((assignment) => assignment._id);
    const cycleQuarterIds = Array.from(
      new Set(
        assignments
          .map((assignment) => assignment.cycleQuarterId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const annualAssignmentIds = Array.from(
      new Set(assignments.map((assignment) => assignment.annualAssignmentId.toString())),
    );

    const [quarterCycles, annualAssignments, submissions, annualCycles, adminUsers] = await Promise.all([
      QuarterCycle.find({
        _id: { $in: cycleQuarterIds.map((id) => new Types.ObjectId(id)) },
        isDeleted: false,
      })
        .select('achievementSubmissionWindow')
        .lean(),
      AnnualAssignment.find({
        _id: { $in: annualAssignmentIds.map((id) => new Types.ObjectId(id)) },
        isDeleted: false,
      })
        .select('templateVersionId orgSnapshot cycleId employeeSnapshot managerSnapshot')
        .lean(),
      EmployeeAchievementSubmission.find({
        quarterAssignmentId: { $in: quarterAssignmentIds },
        isDeleted: false,
      })
        .select('quarterAssignmentId status')
        .lean(),
      AnnualCycle.find({
        _id: {
          $in: Array.from(
            new Set(
              assignments
                .map((assignment) => assignment.cycleId?.toString())
                .filter((value): value is string => Boolean(value)),
            ),
          ).map((id) => new Types.ObjectId(id)),
        },
      })
        .select('name')
        .lean(),
      User.find({ active: true })
        .select('_id role')
        .lean(),
    ]);

    const templateVersionIds = Array.from(
      new Set(
        annualAssignments
          .map((assignment) => assignment.templateVersionId?.toString())
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const templateVersions = templateVersionIds.length > 0
      ? await PmsTemplateVersion.find({
        _id: { $in: templateVersionIds.map((id) => new Types.ObjectId(id)) },
      })
        .select('sections metadata')
        .lean()
      : [];

    const quarterCycleById = new Map(quarterCycles.map((cycle) => [cycle._id.toString(), cycle]));
    const annualAssignmentById = new Map(annualAssignments.map((assignment) => [assignment._id.toString(), assignment]));
    const submissionByQuarterAssignmentId = new Map(
      submissions.map((submission) => [submission.quarterAssignmentId.toString(), submission]),
    );
    const annualCycleById = new Map(annualCycles.map((cycle) => [cycle._id.toString(), cycle]));
    const templateVersionById = new Map(templateVersions.map((template) => [template._id.toString(), template]));
    const adminRecipientIds = adminUsers
      .filter((user) => normalizePmsRole(String(user.role ?? '')) === PmsRole.ADMIN)
      .map((user) => user._id.toString());

    const targets: PendingSlaTarget[] = [];

    for (const assignment of assignments) {
      if (!assignment.cycleQuarterId) {
        continue;
      }

      const quarterCycle = quarterCycleById.get(assignment.cycleQuarterId.toString());
      const window = quarterCycle?.achievementSubmissionWindow;
      if (!window || window.enabled !== true) {
        continue;
      }

      const dueDateSource = window.dueDate ?? window.endDate;
      if (!dueDateSource) {
        continue;
      }

      const annualAssignment = annualAssignmentById.get(assignment.annualAssignmentId.toString());
      const templateVersion = annualAssignment?.templateVersionId
        ? templateVersionById.get(annualAssignment.templateVersionId.toString())
        : undefined;

      if (!this.isEmployeeAchievementEnabledForTemplate(templateVersion, assignment.quarterCode)) {
        continue;
      }

      const submission = submissionByQuarterAssignmentId.get(assignment._id.toString());
      if (
        submission?.status === EmployeeAchievementSubmissionStatus.LOCKED ||
        submission?.status === EmployeeAchievementSubmissionStatus.SUBMITTED
      ) {
        continue;
      }

      const dueAt = new Date(dueDateSource);
      if (Number.isNaN(dueAt.getTime())) {
        continue;
      }

      const graceDays = Number.isFinite(window.graceDays) ? Number(window.graceDays) : 0;
      const allowedUntilAt = new Date(dueAt);
      allowedUntilAt.setDate(allowedUntilAt.getDate() + graceDays);

      const cycleName =
        String(annualAssignment?.orgSnapshot?.cycleName ?? '') ||
        String(annualCycleById.get(assignment.cycleId?.toString?.() ?? '')?.name ?? '') ||
        'Performance Cycle';
      const employeeName = String(annualAssignment?.employeeSnapshot?.name ?? 'Employee');
      const managerName = String(annualAssignment?.managerSnapshot?.name ?? 'Manager');

      const overdueRecipientUserIds = assignment.assignedManagerId
        ? [assignment.assignedManagerId.toString()]
        : [];
      const escalationRecipientUserIds = [
        ...overdueRecipientUserIds,
        ...adminRecipientIds,
      ].filter((value, index, values) => values.indexOf(value) === index);

      targets.push({
        assignment,
        dueAt,
        ownerUserId: new Types.ObjectId(assignment.employeeId),
        escalationTargetUserId: assignment.assignedManagerId
          ? new Types.ObjectId(assignment.assignedManagerId)
          : undefined,
        metadata: {
          employeeName,
          managerName,
          cycleName,
          quarterCode: assignment.quarterCode,
          dueDate: dueAt.toISOString(),
          allowedUntilAt: allowedUntilAt.toISOString(),
          graceDays,
          routePath: '/my/achievements',
          currentStatus: submission?.status ?? EmployeeAchievementSubmissionStatus.DRAFT,
          overdueRecipientUserIds,
          escalationRecipientUserIds,
        },
      });
    }

    return targets;
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

  private shouldTriggerReminder(
    sla: any,
    reminderRule: any,
    currentDate: Date,
  ): boolean {
    const dueDate = new Date(sla.dueAt);
    const daysDiff = this.getDaysDiff(currentDate, dueDate);

    if (reminderRule.reminderType === 'PRE_DUE' && daysDiff < 0) {
      return daysDiff === reminderRule.offsetDays;
    }

    if (reminderRule.reminderType === 'DUE_DATE') {
      return daysDiff === 0;
    }

    if (reminderRule.reminderType === 'OVERDUE' && daysDiff > 0) {
      return daysDiff === reminderRule.offsetDays;
    }

    if (reminderRule.reminderType !== 'ESCALATION') {
      return false;
    }

    if (sla.slaType === 'employee_achievement_submission_pending') {
      const allowedUntilAt = (sla.metadata as Record<string, any> | undefined)?.allowedUntilAt;
      if (!allowedUntilAt) {
        return false;
      }

      const escalationDate = new Date(allowedUntilAt);
      if (Number.isNaN(escalationDate.getTime()) || currentDate <= escalationDate) {
        return false;
      }

      return this.getDaysDiff(currentDate, escalationDate) === 0;
    }

    return daysDiff > 0 && daysDiff === reminderRule.offsetDays;
  }

  private resolveRecipientIdsForReminder(sla: any, reminderRule: any): string[] {
    const recipients = new Set<string>();
    const metadata = (sla.metadata ?? {}) as Record<string, any>;

    const primaryRecipient = reminderRule.reminderType === 'ESCALATION' && sla.escalationTargetUserId
      ? sla.escalationTargetUserId.toString()
      : sla.ownerUserId.toString();
    recipients.add(primaryRecipient);

    if (sla.slaType === 'employee_achievement_submission_pending') {
      const extraRecipientIds = reminderRule.reminderType === 'ESCALATION'
        ? metadata.escalationRecipientUserIds
        : reminderRule.reminderType === 'OVERDUE'
          ? metadata.overdueRecipientUserIds
          : [];

      if (Array.isArray(extraRecipientIds)) {
        for (const recipientId of extraRecipientIds) {
          if (typeof recipientId === 'string' && recipientId.trim()) {
            recipients.add(recipientId);
          }
        }
      }
    }

    return Array.from(recipients);
  }

  private buildReminderContent(
    sla: any,
    reminderRule: any,
    recipientName: string,
  ): { subject: string; body: string } {
    if (sla.slaType !== 'employee_achievement_submission_pending') {
      return {
        subject: reminderRule.subjectTemplate.replace('{userName}', recipientName || 'User'),
        body: reminderRule.bodyTemplate
          .replace('{userName}', recipientName || 'User')
          .replace('{dueDate}', new Date(sla.dueAt).toDateString()),
      };
    }

    const metadata = (sla.metadata ?? {}) as Record<string, any>;
    const dueDate = metadata.dueDate
      ? new Date(metadata.dueDate).toDateString()
      : new Date(sla.dueAt).toDateString();
    const actionLink = this.getAchievementActionLink(metadata.routePath);
    const subject = reminderRule.reminderType === 'PRE_DUE'
      ? 'Employee Achievement Submission Due Soon'
      : reminderRule.reminderType === 'ESCALATION'
        ? 'Employee Achievement Submission Escalation'
        : 'Employee Achievement Submission Overdue';

    const bodyLines = [
      `Hello ${recipientName || 'User'},`,
      '',
      reminderRule.reminderType === 'PRE_DUE'
        ? 'This is a reminder that an Employee Achievement Submission is due soon.'
        : reminderRule.reminderType === 'ESCALATION'
          ? 'An Employee Achievement Submission is still pending and now requires escalation attention.'
          : 'An Employee Achievement Submission is overdue.',
      `Employee: ${metadata.employeeName || 'Employee'}`,
      `Cycle / Quarter: ${metadata.cycleName || 'Performance Cycle'} / ${metadata.quarterCode || sla.quarterCode || ''}`,
      `Due Date: ${dueDate}`,
      `Current Status: ${metadata.currentStatus || 'DRAFT'}`,
      actionLink
        ? `Action Link: ${actionLink}`
        : 'Action: Open /my/achievements in the PMS portal.',
    ];

    return {
      subject,
      body: bodyLines.join('\n'),
    };
  }

  private getAchievementActionLink(routePath?: string): string | undefined {
    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL;
    if (!appUrl) {
      return undefined;
    }

    const normalizedBase = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
    const normalizedPath = routePath || '/my/achievements';
    return `${normalizedBase}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
  }

  private isEmployeeAchievementEnabledForTemplate(
    templateVersion: { metadata?: Record<string, unknown>; sections?: ITemplateSection[] } | null | undefined,
    quarterCode: 'Q1' | 'Q2' | 'Q3' | 'Q4',
  ): boolean {
    if (!templateVersion) {
      return false;
    }

    const section = (templateVersion.sections ?? []).find((item) => {
      const quarterScope = [
        ...(item.quarterScope ?? []),
        ...(item.repeatFor ?? []),
      ];

      return (
        item.sectionKey === 'employee_achievement_submission' &&
        item.level === 'QUARTER' &&
        (quarterScope.length === 0 || quarterScope.includes(quarterCode))
      );
    });

    const sectionExists = Boolean(section);
    const metadata = (templateVersion.metadata ?? {}) as Record<string, any>;
    const employeeAchievementConfig = (metadata.employeeAchievementConfig ?? {}) as Record<string, any>;
    const reviewFlowMode = metadata.reviewFlowMode === 'ACHIEVEMENT_THEN_MANAGER' || sectionExists
      ? 'ACHIEVEMENT_THEN_MANAGER'
      : 'MANAGER_ONLY';
    const employeeAchievementEnabled =
      employeeAchievementConfig.employeeAchievementEnabled !== undefined
        ? Boolean(employeeAchievementConfig.employeeAchievementEnabled)
        : sectionExists;

    return employeeAchievementEnabled && reviewFlowMode === 'ACHIEVEMENT_THEN_MANAGER';
  }

  private getDaysDiff(currentDate: Date, baseDate: Date): number {
    const timeDiffMs = currentDate.getTime() - baseDate.getTime();
    return Math.floor(timeDiffMs / (1000 * 60 * 60 * 24));
  }

  private hasMetadataChanged(
    existingMetadata: unknown,
    nextMetadata: unknown,
  ): boolean {
    return JSON.stringify(existingMetadata ?? null) !== JSON.stringify(nextMetadata ?? null);
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
