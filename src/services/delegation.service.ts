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
      actorRole !== PmsRole.SUPER_ADMIN &&
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

    const fromDate = new Date(input.validFrom);
    const toDate = new Date(input.validTo);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new Error('Invalid validity dates.');
    }

    if (fromDate > toDate) {
      throw new Error('validFrom date cannot be after validTo date.');
    }

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
  }): Promise<any[]> {
    const filter: Record<string, any> = { isDeleted: false };
    if (query.delegatorUserId) {
      filter.delegatorUserId = this.toObjectId(query.delegatorUserId, 'delegatorUserId');
    }
    if (query.delegateUserId) {
      filter.delegateUserId = this.toObjectId(query.delegateUserId, 'delegateUserId');
    }
    if (query.status) {
      filter.status = query.status;
    }

    return await Delegation.find(filter)
      .populate('delegatorUserId', 'name email employeeCode')
      .populate('delegateUserId', 'name email employeeCode')
      .sort({ createdAt: -1 })
      .lean();
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
      actorRole !== PmsRole.SUPER_ADMIN &&
      actorRole !== PmsRole.ADMIN &&
      actorId !== delegatorId
    ) {
      throw new Error('Unauthorized to revoke this delegation.');
    }

    const previousValue = delegation.toObject();

    delegation.status = 'REVOKED';
    delegation.reason = reason ?? delegation.reason;
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

  /**
   * Checks if delegateUserId is currently authorized to act on behalf of delegatorUserId.
   * If yes, returns the active delegation record.
   */
  async getActiveDelegation(
    delegateUserId: string,
    delegatorUserId: string,
    scope: string
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

    return delegation;
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
