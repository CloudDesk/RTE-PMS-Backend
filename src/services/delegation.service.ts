import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { Delegation } from '../models/pms-delegation.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { User } from '../models/user.model';
import { auditService } from './audit.service';
import { emailService } from './email.service';
import { normalizePmsRole, PmsRole, TermWorkflowState } from '../constants/pms.enums';

export interface CreateDelegationInput {
  delegatorUserId: string;
  delegateUserId: string;
  scopeType: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS';
  annualAssignmentId?: string;
  cycleId?: string;
  validFrom: Date | string;
  validTo: Date | string;
  reason?: string;
}

export class DelegationService extends BaseService {
  private readonly delegationTimezoneOffsetMinutes = 330;

  constructor(context: RequestContext) {
    super(context);
  }

  /**
   * Create a new PMS delegation config.
   * Can be configured by delegator, or by Admin / Super Admin.
   */
  async createDelegation(input: CreateDelegationInput): Promise<any> {
    const actor = this.requireActor();
    const actorRole = normalizePmsRole(actor.actorRole) ?? 'UNKNOWN';
    const actorId = actor.actorId;

    const delegatorId = input.delegatorUserId;
    const delegateId = input.delegateUserId;

    // Authorization: Only Admin, Super Admin, or the delegator themselves can set up a delegation.
    if (
      actorRole !== PmsRole.ADMIN &&
      actorId !== delegatorId
    ) {
      throw new Error('Unauthorized to configure delegation for this delegator.');
    }

    if (delegatorId === delegateId) {
      throw new Error('Delegator and Delegate cannot be the same user.');
    }

    const [delegator, delegate] = await Promise.all([
      User.findById(this.toObjectId(delegatorId, 'delegatorUserId')).lean(),
      User.findById(this.toObjectId(delegateId, 'delegateUserId')).lean(),
    ]);

    if (!delegator) throw new Error('Delegator not found.');
    if (!delegate) throw new Error('Delegate not found.');

    this.assertEligibleManagerRole(delegator.role, 'Delegator');
    this.assertEligibleManagerRole(delegate.role, 'Delegate');

    const fromDate = this.startOfDay(input.validFrom);
    const toDate = this.endOfDay(input.validTo);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new Error('Invalid validity dates.');
    }

    if (fromDate > toDate) {
      throw new Error('validFrom date cannot be after validTo date.');
    }

    if (input.annualAssignmentId) {
      await this.assertAssignmentHasDelegableWork({
        annualAssignmentId: input.annualAssignmentId,
        delegatorUserId: delegatorId,
        scopeType: input.scopeType ?? 'ALL',
      });
    }

    await this.assertNoOverlappingDelegation({
      delegatorUserId: delegatorId,
      delegateUserId: delegateId,
      scopeType: input.scopeType ?? 'ALL',
      annualAssignmentId: input.annualAssignmentId,
      cycleId: input.cycleId,
      validFrom: fromDate,
      validTo: toDate,
    });

    const delegation = await Delegation.create({
      delegatorUserId: new Types.ObjectId(delegatorId),
      delegateUserId: new Types.ObjectId(delegateId),
      scopeType: input.scopeType ?? 'ALL',
      annualAssignmentId: input.annualAssignmentId
        ? new Types.ObjectId(input.annualAssignmentId)
        : undefined,
      cycleId: input.cycleId ? new Types.ObjectId(input.cycleId) : undefined,
      validFrom: fromDate,
      validTo: toDate,
      reason: input.reason,
      status: 'ACTIVE',
      createdBy: new Types.ObjectId(actorId),
    });

    await this.audit(
      'PMS_DELEGATION_CREATED',
      'PMS_DELEGATION',
      delegation._id.toString(),
      undefined,
      delegation.toObject(),
    );

    void this.sendDelegationCreatedEmails({
      delegator,
      delegate,
      scopeType: delegation.scopeType,
      validFrom: delegation.validFrom,
      validTo: delegation.validTo,
      reason: delegation.reason,
    });

    return delegation;
  }

  /**
   * Get delegation configs for a specific delegator, delegate, or all
   */
  async listDelegations(query: {
    delegatorUserId?: string;
    delegateUserId?: string;
    status?: string;
    annualAssignmentId?: string;
    cycleId?: string;
    scopeType?: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS';
    activeOn?: Date | string;
  }): Promise<any[]> {
    const actor = this.requireActor();
    const actorRole = normalizePmsRole(actor.actorRole) ?? 'UNKNOWN';
    const filter: Record<string, any> = { isDeleted: false };

    if (actorRole !== PmsRole.ADMIN) {
      filter.$or = [
        { delegatorUserId: this.toObjectId(actor.actorId, 'actorId') },
        { delegateUserId: this.toObjectId(actor.actorId, 'actorId') },
      ];
    }

    if (query.delegatorUserId) {
      if (actorRole !== PmsRole.ADMIN && query.delegatorUserId !== actor.actorId) {
        throw new Error('Unauthorized to view delegations for this delegator.');
      }
      filter.delegatorUserId = this.toObjectId(query.delegatorUserId, 'delegatorUserId');
    }
    if (query.delegateUserId) {
      if (actorRole !== PmsRole.ADMIN && query.delegateUserId !== actor.actorId) {
        throw new Error('Unauthorized to view delegations for this delegate.');
      }
      filter.delegateUserId = this.toObjectId(query.delegateUserId, 'delegateUserId');
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.annualAssignmentId) {
      filter.annualAssignmentId = this.toObjectId(query.annualAssignmentId, 'annualAssignmentId');
    }
    if (query.cycleId) {
      filter.cycleId = this.toObjectId(query.cycleId, 'cycleId');
    }
    if (query.scopeType) {
      filter.scopeType = query.scopeType;
    }

    const activeOn = query.activeOn ? new Date(query.activeOn) : this.getCurrentDate();
    const delegations = await Delegation.find(filter)
      .populate('delegatorUserId', 'name email employeeCode')
      .populate('delegateUserId', 'name email employeeCode')
      .populate('cycleId', 'name startDate endDate')
      .sort({ createdAt: -1 })
      .lean();

    return delegations.map((delegation) => ({
      ...delegation,
      isCurrentlyActive:
        delegation.status === 'ACTIVE' &&
        delegation.validFrom <= activeOn &&
        delegation.validTo >= activeOn,
    }));
  }

  /**
   * Deactivate or revoke a delegation
   */
  async revokeDelegation(id: string, reason?: string): Promise<any> {
    const delegation = await Delegation.findById(this.toObjectId(id, 'delegationId'));
    if (!delegation) {
      throw new Error('Delegation config not found.');
    }

    const actor = this.requireActor();
    const actorRole = normalizePmsRole(actor.actorRole) ?? 'UNKNOWN';
    const actorId = actor.actorId;
    const delegatorId = delegation.delegatorUserId.toString();

    // Authorization Check
    if (
      actorRole !== PmsRole.ADMIN &&
      actorId !== delegatorId
    ) {
      throw new Error('Unauthorized to revoke this delegation.');
    }

    const previousValue = delegation.toObject();

    delegation.status = 'REVOKED';
    delegation.revokeReason = reason;
    delegation.revokedAt = new Date();
    delegation.revokedBy = new Types.ObjectId(actorId);
    delegation.updatedBy = new Types.ObjectId(actorId);
    delegation.version += 1;
    await delegation.save();

    await this.audit(
      'PMS_DELEGATION_REVOKED',
      'PMS_DELEGATION',
      delegation._id.toString(),
      previousValue,
      delegation.toObject(),
    );

    const [delegator, delegate] = await Promise.all([
      User.findById(delegation.delegatorUserId).lean(),
      User.findById(delegation.delegateUserId).lean(),
    ]);

    void this.sendDelegationRevokedEmails({
      delegator,
      delegate,
      scopeType: delegation.scopeType,
      validFrom: delegation.validFrom,
      validTo: delegation.validTo,
      reason,
    });

    return delegation;
  }

  private assertEligibleManagerRole(role: string | undefined, label: string): void {
    const mappedRole = role ? normalizePmsRole(role) : null;
    if (mappedRole !== PmsRole.MANAGER) {
      throw new Error(`${label} must have Manager role for scoped PMS delegation.`);
    }
  }

  private async assertNoOverlappingDelegation(input: {
    delegatorUserId: string;
    delegateUserId: string;
    scopeType: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS';
    annualAssignmentId?: string;
    cycleId?: string;
    validFrom: Date;
    validTo: Date;
  }): Promise<void> {
    const scopeCandidates =
      input.scopeType === 'ALL'
        ? ['ALL', 'PMS_OBJECTIVES', 'PMS_REVIEWS']
        : ['ALL', input.scopeType];

    const cycleConditions = input.cycleId
      ? [
          { cycleId: this.toObjectId(input.cycleId, 'cycleId') },
          { cycleId: { $exists: false } },
          { cycleId: null },
        ]
      : [{ cycleId: { $exists: true } }, { cycleId: null }, { cycleId: { $exists: false } }];
    const assignmentConditions = input.annualAssignmentId
      ? [
          { annualAssignmentId: this.toObjectId(input.annualAssignmentId, 'annualAssignmentId') },
          { annualAssignmentId: { $exists: false } },
          { annualAssignmentId: null },
        ]
      : [
          { annualAssignmentId: { $exists: true } },
          { annualAssignmentId: { $exists: false } },
          { annualAssignmentId: null },
        ];

    const overlappingDelegation = await Delegation.findOne({
      delegatorUserId: this.toObjectId(input.delegatorUserId, 'delegatorUserId'),
      status: 'ACTIVE',
      isDeleted: false,
      scopeType: { $in: scopeCandidates },
      $and: [
        { $or: cycleConditions },
        { $or: assignmentConditions },
      ],
      validFrom: { $lte: input.validTo },
      validTo: { $gte: input.validFrom },
    }).lean();

    if (!overlappingDelegation) {
      return;
    }

    const isSameDelegate =
      overlappingDelegation.delegateUserId?.toString() === input.delegateUserId;

    if (isSameDelegate) {
      throw new Error('An overlapping active delegation already exists for this delegator, delegate, scope, and assignment.');
    }

    throw new Error('A conflicting active delegation already exists for this delegator within the selected scope, assignment, and date range.');
  }

  private async assertAssignmentHasDelegableWork(input: {
    annualAssignmentId: string;
    delegatorUserId: string;
    scopeType: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS';
  }): Promise<void> {
    const termAssignments = await TermAssignment.find({
      annualAssignmentId: this.toObjectId(input.annualAssignmentId, 'annualAssignmentId'),
      assignedManagerId: this.toObjectId(input.delegatorUserId, 'delegatorUserId'),
      isDeleted: false,
    }).select('termState').lean();

    if (termAssignments.length === 0) {
      throw new Error('Delegation is not allowed because the selected assignment no longer belongs to this manager.');
    }

    const objectiveActionableStates = new Set<string>([
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      TermWorkflowState.OBJECTIVE_DRAFT,
      TermWorkflowState.OBJECTIVE_SUBMITTED,
      TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
      TermWorkflowState.REOPENED_BY_ADMIN,
    ]);
    const reviewActionableStates = new Set<string>([
      TermWorkflowState.OBJECTIVE_APPROVED,
      TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
      TermWorkflowState.MANAGER_REVIEW_OPEN,
      TermWorkflowState.REOPENED_BY_ADMIN,
    ]);

    const hasObjectiveWork = termAssignments.some((term) =>
      objectiveActionableStates.has(term.termState),
    );
    const hasReviewWork = termAssignments.some((term) =>
      reviewActionableStates.has(term.termState),
    );
    const hasObjectiveSettingOpen = termAssignments.some(
      (term) => term.termState === TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    );

    if (input.scopeType === 'PMS_OBJECTIVES' && !hasObjectiveWork) {
      throw new Error('Objective delegation is not allowed because all objective actions are already approved, finalized, or closed for this assignment.');
    }

    if (input.scopeType === 'PMS_REVIEWS' && !hasReviewWork) {
      if (hasObjectiveSettingOpen) {
        throw new Error('Review delegation is not allowed because objective setting is still open for this assignment. Choose Objectives Only, or delegate reviews after objective setting is closed.');
      }

      throw new Error('Review delegation is not allowed because all review actions are already submitted, finalized, or closed for this assignment.');
    }

    if (input.scopeType === 'ALL' && (!hasObjectiveWork || !hasReviewWork)) {
      if (!hasObjectiveWork && !hasReviewWork) {
        throw new Error('Delegation is not allowed because there are no pending PMS actions for this assignment.');
      }

      throw new Error('All PMS Actions delegation is available only when both objective and review actions are pending for this assignment. Choose the available specific scope instead.');
    }
  }

  /**
   * Checks if delegateUserId is currently authorized to act on behalf of delegatorUserId.
   * If yes, returns the active delegation record.
   */
  async getActiveDelegation(
    delegateUserId: string,
    delegatorUserId: string,
    scope: string,
    cycleId?: string,
    annualAssignmentId?: string,
  ): Promise<any | null> {
    const now = this.getCurrentDate();
    const scopeConditions =
      scope === 'ALL'
        ? ['ALL']
        : ['ALL', scope];
    const assignmentConditions = annualAssignmentId
      ? [
          { annualAssignmentId: { $exists: false } },
          { annualAssignmentId: null },
          { annualAssignmentId: new Types.ObjectId(annualAssignmentId) },
        ]
      : [];
    const cycleConditions = cycleId
      ? [
          { cycleId: new Types.ObjectId(cycleId) },
          { cycleId: null },
          { cycleId: { $exists: false } },
        ]
      : [
          { cycleId: null },
          { cycleId: { $exists: false } },
        ];
    const scopeFilters: Record<string, unknown>[] = [
      { $or: cycleConditions },
    ];

    if (assignmentConditions.length > 0) {
      scopeFilters.push({ $or: assignmentConditions });
    }

    return Delegation.findOne({
      delegateUserId: new Types.ObjectId(delegateUserId),
      delegatorUserId: new Types.ObjectId(delegatorUserId),
      status: 'ACTIVE',
      validFrom: { $lte: now },
      validTo: { $gte: now },
      scopeType: { $in: scopeConditions },
      $and: scopeFilters,
      isDeleted: false,
    }).lean();
  }

  async getActiveDelegationsForDelegate(
    delegateUserId: string,
    scope: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS',
    activeOn?: Date,
  ): Promise<any[]> {
    const scopeCandidates = scope === 'ALL' ? ['ALL'] : ['ALL', scope];
    const effectiveActiveOn = activeOn ?? this.getCurrentDate();

    return Delegation.find({
      delegateUserId: new Types.ObjectId(delegateUserId),
      status: 'ACTIVE',
      validFrom: { $lte: effectiveActiveOn },
      validTo: { $gte: effectiveActiveOn },
      scopeType: { $in: scopeCandidates },
      isDeleted: false,
    }).lean();
  }

  async getActivePmsWorkDelegationsForDelegate(
    delegateUserId: string,
    activeOn?: Date,
  ): Promise<any[]> {
    const effectiveActiveOn = activeOn ?? this.getCurrentDate();
    return Delegation.find({
      delegateUserId: new Types.ObjectId(delegateUserId),
      status: 'ACTIVE',
      validFrom: { $lte: effectiveActiveOn },
      validTo: { $gte: effectiveActiveOn },
      scopeType: { $in: ['ALL', 'PMS_OBJECTIVES', 'PMS_REVIEWS'] },
      isDeleted: false,
    }).lean();
  }

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private startOfDay(value: Date | string): Date {
    const dateOnly = this.parseDateOnly(value);
    if (dateOnly) {
      const { year, month, day } = dateOnly;
      return this.localDateTimeToUtc(year, month, day, 0, 0, 0, 0);
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) return date;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(value: Date | string): Date {
    const dateOnly = this.parseDateOnly(value);
    if (dateOnly) {
      const { year, month, day } = dateOnly;
      return this.localDateTimeToUtc(year, month, day, 23, 59, 59, 999);
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) return date;
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private parseDateOnly(value: Date | string): { year: number; month: number; day: number } | null {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;

    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  private localDateTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    millisecond: number,
  ): Date {
    return new Date(
      Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
      this.delegationTimezoneOffsetMinutes * 60 * 1000,
    );
  }

  private requireActor() {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    return {
      actorId: user._id.toString(),
      actorRole: user.role,
    };
  }

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Invalid ${fieldName}`);
    }
    return new Types.ObjectId(value);
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
  ): Promise<void> {
    const user = this.context.user;
    if (!user) return;

    await auditService.createAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action,
      entityType,
      entityId,
      previousValue,
      newValue,
    });
  }

  private async sendDelegationCreatedEmails(input: {
    delegator: any;
    delegate: any;
    scopeType: string;
    validFrom: Date;
    validTo: Date;
    reason?: string;
  }): Promise<void> {
    const delegatorName = this.userName(input.delegator, 'Original manager');
    const delegateName = this.userName(input.delegate, 'Delegate manager');
    const scope = this.formatScope(input.scopeType);
    const window = `${this.formatDate(input.validFrom)} to ${this.formatDate(input.validTo)}`;
    const reason = input.reason || 'Not provided';

    await this.sendBestEffortEmail(
      input.delegate?.email,
      'PMS Delegation Assigned',
      `Hello ${delegateName},\n\n${delegatorName} has delegated ${scope} PMS access to you for ${window}.\n\nReason: ${reason}`,
      `<p>Hello ${this.escapeHtml(delegateName)},</p><p>${this.escapeHtml(delegatorName)} has delegated <strong>${this.escapeHtml(scope)}</strong> PMS access to you for <strong>${window}</strong>.</p><p><strong>Reason:</strong> ${this.escapeHtml(reason)}</p>`,
    );

    await this.sendBestEffortEmail(
      input.delegator?.email,
      'PMS Delegation Created',
      `Hello ${delegatorName},\n\nYour ${scope} PMS access has been delegated to ${delegateName} for ${window}.\n\nReason: ${reason}`,
      `<p>Hello ${this.escapeHtml(delegatorName)},</p><p>Your <strong>${this.escapeHtml(scope)}</strong> PMS access has been delegated to <strong>${this.escapeHtml(delegateName)}</strong> for <strong>${window}</strong>.</p><p><strong>Reason:</strong> ${this.escapeHtml(reason)}</p>`,
    );
  }

  private async sendDelegationRevokedEmails(input: {
    delegator: any;
    delegate: any;
    scopeType: string;
    validFrom: Date;
    validTo: Date;
    reason?: string;
  }): Promise<void> {
    const delegatorName = this.userName(input.delegator, 'Original manager');
    const delegateName = this.userName(input.delegate, 'Delegate manager');
    const scope = this.formatScope(input.scopeType);
    const window = `${this.formatDate(input.validFrom)} to ${this.formatDate(input.validTo)}`;
    const reason = input.reason || 'Not provided';

    await this.sendBestEffortEmail(
      input.delegate?.email,
      'PMS Delegation Cancelled',
      `Hello ${delegateName},\n\nYour delegated ${scope} PMS access from ${delegatorName} has been cancelled.\n\nOriginal window: ${window}\nReason: ${reason}`,
      `<p>Hello ${this.escapeHtml(delegateName)},</p><p>Your delegated <strong>${this.escapeHtml(scope)}</strong> PMS access from <strong>${this.escapeHtml(delegatorName)}</strong> has been cancelled.</p><p><strong>Original window:</strong> ${window}</p><p><strong>Reason:</strong> ${this.escapeHtml(reason)}</p>`,
    );

    await this.sendBestEffortEmail(
      input.delegator?.email,
      'PMS Delegation Cancelled',
      `Hello ${delegatorName},\n\nYour delegation to ${delegateName} has been cancelled.\n\nScope: ${scope}\nOriginal window: ${window}\nReason: ${reason}`,
      `<p>Hello ${this.escapeHtml(delegatorName)},</p><p>Your delegation to <strong>${this.escapeHtml(delegateName)}</strong> has been cancelled.</p><p><strong>Scope:</strong> ${this.escapeHtml(scope)}</p><p><strong>Original window:</strong> ${window}</p><p><strong>Reason:</strong> ${this.escapeHtml(reason)}</p>`,
    );
  }

  private async sendBestEffortEmail(
    to: string | undefined,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    if (!to) return;
    try {
      await emailService.sendEmail({ body: { to, subject, text, html } });
    } catch (error) {
      console.warn('PMS delegation email notification failed:', error);
    }
  }

  private userName(user: any, fallback: string): string {
    return user?.name || user?.employeeCode || user?.email || fallback;
  }

  private formatScope(scopeType: string): string {
    return scopeType.replace(/^PMS_/, '').replace(/_/g, ' ').toLowerCase();
  }

  private formatDate(value: Date): string {
    return value.toLocaleDateString('en-GB');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
