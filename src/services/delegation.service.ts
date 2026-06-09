import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { Delegation } from '../models/pms-delegation.model';
import { User } from '../models/user.model';
import { auditService } from './audit.service';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';

export interface CreateDelegationInput {
  delegatorUserId: string;
  delegateUserId: string;
  scopeType: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS';
  cycleId?: string;
  validFrom: Date | string;
  validTo: Date | string;
  reason?: string;
}

export class DelegationService extends BaseService {
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

    await this.assertNoOverlappingDelegation({
      delegatorUserId: delegatorId,
      delegateUserId: delegateId,
      scopeType: input.scopeType ?? 'ALL',
      cycleId: input.cycleId,
      validFrom: fromDate,
      validTo: toDate,
    });

    const delegation = await Delegation.create({
      delegatorUserId: new Types.ObjectId(delegatorId),
      delegateUserId: new Types.ObjectId(delegateId),
      scopeType: input.scopeType ?? 'ALL',
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

    return delegation;
  }

  /**
   * Get delegation configs for a specific delegator, delegate, or all
   */
  async listDelegations(query: {
    delegatorUserId?: string;
    delegateUserId?: string;
    status?: string;
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
    if (query.cycleId) {
      filter.cycleId = this.toObjectId(query.cycleId, 'cycleId');
    }
    if (query.scopeType) {
      filter.scopeType = query.scopeType;
    }

    const activeOn = query.activeOn ? new Date(query.activeOn) : new Date();
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

    const overlappingDelegation = await Delegation.findOne({
      delegatorUserId: this.toObjectId(input.delegatorUserId, 'delegatorUserId'),
      status: 'ACTIVE',
      isDeleted: false,
      scopeType: { $in: scopeCandidates },
      $or: cycleConditions,
      validFrom: { $lte: input.validTo },
      validTo: { $gte: input.validFrom },
    }).lean();

    if (!overlappingDelegation) {
      return;
    }

    const isSameDelegate =
      overlappingDelegation.delegateUserId?.toString() === input.delegateUserId;

    if (isSameDelegate) {
      throw new Error('An overlapping active delegation already exists for this delegator, delegate, scope, and cycle.');
    }

    throw new Error('A conflicting active delegation already exists for this delegator within the selected scope, cycle, and date range.');
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
  ): Promise<any | null> {
    const now = new Date();
    const delegation = await Delegation.findOne({
      delegateUserId: new Types.ObjectId(delegateUserId),
      delegatorUserId: new Types.ObjectId(delegatorUserId),
      status: 'ACTIVE',
      validFrom: { $lte: now },
      validTo: { $gte: now },
      isDeleted: false,
    }).lean();

    if (!delegation) return null;

    // Check scope match
    if (delegation.scopeType !== 'ALL' && delegation.scopeType !== scope) {
      return null;
    }

    if (delegation.cycleId && cycleId && delegation.cycleId.toString() !== cycleId) {
      return null;
    }

    if (delegation.cycleId && !cycleId) {
      return null;
    }

    return delegation;
  }

  async getActiveDelegationsForDelegate(
    delegateUserId: string,
    scope: 'ALL' | 'PMS_OBJECTIVES' | 'PMS_REVIEWS',
    activeOn: Date = new Date(),
  ): Promise<any[]> {
    const scopeCandidates = scope === 'ALL' ? ['ALL'] : ['ALL', scope];

    return Delegation.find({
      delegateUserId: new Types.ObjectId(delegateUserId),
      status: 'ACTIVE',
      validFrom: { $lte: activeOn },
      validTo: { $gte: activeOn },
      scopeType: { $in: scopeCandidates },
      isDeleted: false,
    }).lean();
  }

  private startOfDay(value: Date | string): Date {
    const date = new Date(value);
    if (isNaN(date.getTime())) return date;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(value: Date | string): Date {
    const date = new Date(value);
    if (isNaN(date.getTime())) return date;
    date.setHours(23, 59, 59, 999);
    return date;
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
}
