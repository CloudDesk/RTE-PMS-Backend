import type {
  AccessActorContext,
  AccessCheckInput,
  AccessCheckResult,
  AccessResourceContext,
  PmsMappedRole,
} from '../types/pms.types';
import { normalizePmsRole, PmsErrorCode, PmsRole } from '../constants/pms.enums';
import { PmsRolePermission, type IPmsRolePermission } from '../models/pms-role-permission.model';

/**
 * TTL (ms) after which the in-memory permission cache is considered stale
 * and will be refreshed from the database on the next canPerform() call.
 * Default: 5 minutes. Override via PMS_PERMISSION_CACHE_TTL_MS env var.
 */
const PERMISSION_CACHE_TTL_MS =
  parseInt(process.env.PMS_PERMISSION_CACHE_TTL_MS ?? '300000', 10);

export class AccessService {
  private permissions: IPmsRolePermission[] = [];
  private initialized = false;
  /** Wall-clock timestamp (ms) of the last successful permission load from DB */
  private lastLoadedAt = 0;

  // ─────────────────────────────────────────────
  // Initialisation & Cache Refresh
  // ─────────────────────────────────────────────

  async initialize(): Promise<void> {
    await this.loadPermissions();
  }

  /**
   * Force an immediate reload from the database.
   * Call this after an admin creates/updates/deletes a PmsRolePermission record
   * so the access engine picks up the change without a server restart.
   */
  async reloadPermissions(): Promise<void> {
    this.initialized = false;
    await this.loadPermissions();
    console.log('[AccessService] Permissions reloaded on demand.');
  }

  /** Returns the age (ms) of the current in-memory cache. */
  cacheAge(): number {
    return Date.now() - this.lastLoadedAt;
  }

  private async loadPermissions(): Promise<void> {
    try {
      let dbPermissions = await PmsRolePermission.find().lean();

      if (dbPermissions.length === 0) {
        dbPermissions = await this.seedDefaultPermissions();
      }

      this.permissions = dbPermissions as IPmsRolePermission[];
      this.initialized = true;
      this.lastLoadedAt = Date.now();
      console.log(
        `[AccessService] Loaded ${this.permissions.length} permissions ` +
        `(TTL refresh every ${PERMISSION_CACHE_TTL_MS / 1000}s)`,
      );
    } catch (error) {
      console.error('[AccessService] Failed to load permissions from DB', error);
      if (!this.initialized) {
        // Only fall back to defaults on the very first load; keep stale cache on refresh errors
        this.permissions = this.getDefaultPermissions();
        this.initialized = true;
        this.lastLoadedAt = Date.now();
      }
    }
  }

  private async ensureFresh(): Promise<void> {
    if (!this.initialized) {
      await this.loadPermissions();
      return;
    }
    // TTL-based refresh — silently reload if cache is stale
    if (this.cacheAge() > PERMISSION_CACHE_TTL_MS) {
      await this.loadPermissions();
    }
  }

  // ─────────────────────────────────────────────
  // Default / Seed Helpers
  // ─────────────────────────────────────────────

  private async seedDefaultPermissions(): Promise<any[]> {
    const defaults = this.getDefaultPermissions();
    const created = await PmsRolePermission.insertMany(defaults);
    return created;
  }

  private getDefaultPermissions(): any[] {
    return [
      { role: PmsRole.ADMIN,      resource: '*', action: '*', scope: 'ALL',       isAllowed: true, priority: 100 },
      { role: PmsRole.EMPLOYEE,   resource: '*', action: '*', scope: 'OWN',       isAllowed: true, priority: 10  },
      { role: PmsRole.MANAGER,    resource: '*', action: '*', scope: 'TEAM',      isAllowed: true, priority: 20  },
      { role: PmsRole.MANAGEMENT, resource: '*', action: '*', scope: 'TEAM',      isAllowed: true, priority: 20  },
      { role: PmsRole.DIRECTOR,   resource: '*', action: '*', scope: 'HIERARCHY', isAllowed: true, priority: 30  },
    ];
  }

  // ─────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────

  mapRole(actorRole: string): PmsMappedRole {
    return normalizePmsRole(actorRole) ?? 'UNKNOWN';
  }

  async canPerform(input: AccessCheckInput): Promise<AccessCheckResult> {
    // Ensure cache is fresh (TTL-based auto-refresh)
    await this.ensureFresh();

    const mappedRole = this.mapRole(input.actor.actorRole);

    if (mappedRole === 'UNKNOWN') {
      return {
        allowed: false,
        errorCode: PmsErrorCode.UNKNOWN_ROLE,
        message: `Role ${input.actor.actorRole} is not mapped for PMS access.`,
        mappedRole,
      };
    }

    if (input.requiresAdmin && mappedRole !== PmsRole.ADMIN) {
      return {
        allowed: false,
        errorCode: PmsErrorCode.ADMIN_ACCESS_REQUIRED,
        message: 'This PMS action requires Admin access.',
        mappedRole,
      };
    }

    const applicableRules = this.permissions
      .filter(
        (p) =>
          p.role === mappedRole &&
          (p.resource === '*' || p.resource === input.action.split('.')[0]) &&
          (p.action === '*' || p.action === input.action),
      )
      .sort((a, b) => b.priority - a.priority);

    if (applicableRules.length === 0) {
      return {
        allowed: false,
        errorCode: PmsErrorCode.ACCESS_DENIED,
        message: 'PMS access denied.',
        mappedRole,
      };
    }

    // Deny-Over-Allow priority rule (FR-DRP-08):
    // If any matched applicable rule has isAllowed: false, access is explicitly denied,
    // overriding any higher-priority allow rules.
    const explicitDeny = applicableRules.find((r) => !r.isAllowed);
    if (explicitDeny) {
      return {
        allowed: false,
        errorCode: PmsErrorCode.ACCESS_DENIED,
        message: 'PMS access explicitly denied by policy rules.',
        mappedRole,
      };
    }

    const rule = applicableRules[0];

    switch (rule.scope) {
      case 'ALL':
      case 'GLOBAL':
        return { allowed: true, mappedRole };

      case 'OWN':
        return this.checkOwnScope(input.actor, input.resource, mappedRole);

      case 'TEAM':
        return this.checkTeamScope(input.actor, input.resource, mappedRole);

      case 'HIERARCHY':
        return this.checkHierarchyScope(input.actor, input.resource, mappedRole);

      case 'DELEGATED':
        return this.checkDelegatedScope(input.actor, input.resource, mappedRole);

      case 'DEPARTMENT':
        return this.checkDepartmentScope(input.actor, input.resource, mappedRole);

      case 'BUSINESS_UNIT':
        return this.checkBusinessUnitScope(input.actor, input.resource, mappedRole);

      case 'REGION':
        return this.checkRegionScope(input.actor, input.resource, mappedRole);

      default:
        return { allowed: true, mappedRole };
    }
  }

  // ─────────────────────────────────────────────
  // Scope Evaluators
  // ─────────────────────────────────────────────

  private checkOwnScope(
    actor: AccessActorContext,
    resource: AccessResourceContext | undefined,
    mappedRole: PmsMappedRole,
  ): AccessCheckResult {
    const employeeId = resource?.employeeId ?? resource?.ownerId;

    if (employeeId && employeeId === actor.actorId) {
      return { allowed: true, mappedRole };
    }

    return {
      allowed: false,
      errorCode: PmsErrorCode.EMPLOYEE_SCOPE_VIOLATION,
      message: 'Employees can access only their own PMS records.',
      mappedRole,
    };
  }

  private checkTeamScope(
    actor: AccessActorContext,
    resource: AccessResourceContext | undefined,
    mappedRole: PmsMappedRole,
  ): AccessCheckResult {
    const managerIds = [
      resource?.managerId,
      resource?.assignedManagerId,
      ...(resource?.allowedManagerIds ?? []),
    ].filter((managerId): managerId is string => Boolean(managerId));

    if (managerIds.includes(actor.actorId)) {
      return { allowed: true, mappedRole };
    }

    return {
      allowed: false,
      errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
      message: 'Managers can access only assigned employee PMS records.',
      mappedRole,
    };
  }

  private async checkHierarchyScope(
    actor: AccessActorContext,
    resource: AccessResourceContext | undefined,
    mappedRole: PmsMappedRole,
  ): Promise<AccessCheckResult> {
    const employeeId = resource?.employeeId ?? resource?.ownerId;

    if (!employeeId) {
      return {
        allowed: false,
        errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
        message: 'Resource lacks employeeId for hierarchy check.',
        mappedRole,
      };
    }

    try {
      const { User } = await import('../models/user.model');
      let currentEmployee = await User.findById(employeeId).select('managerId').lean();
      let levels = 0;

      // Traverse up to 10 levels of hierarchy to prevent infinite loops
      while (currentEmployee && currentEmployee.managerId && levels < 10) {
        if (currentEmployee.managerId.toString() === actor.actorId) {
          return { allowed: true, mappedRole };
        }
        currentEmployee = await User.findById(currentEmployee.managerId).select('managerId').lean();
        levels++;
      }
    } catch (e) {
      console.error('[AccessService] Hierarchy check failed', e);
    }

    return {
      allowed: false,
      errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
      message: 'Directors can access only employee PMS records within their extended hierarchy.',
      mappedRole,
    };
  }

  /**
   * DELEGATED scope — checks whether the actor holds an active, unexpired
   * delegation from the resource owner (delegatorId) that covers the
   * requested action scope and, optionally, the cycle.
   *
   * Delegation records are always read live from the DB so that
   * revocations take effect immediately (no cache lag).
   *
   * Scope matching:
   *   - Delegation.scopeType === 'ALL'            → always matches
   *   - Delegation.scopeType === 'PMS_OBJECTIVES' → matches objective.* actions
   *   - Delegation.scopeType === 'PMS_REVIEWS'    → matches quarterReview.* actions
   */
  private async checkDelegatedScope(
    actor: AccessActorContext,
    resource: AccessResourceContext | undefined,
    mappedRole: PmsMappedRole,
  ): Promise<AccessCheckResult> {
    const delegatorId = resource?.delegatorId ?? resource?.managerId ?? resource?.assignedManagerId;

    if (!delegatorId) {
      return {
        allowed: false,
        errorCode: PmsErrorCode.ACCESS_DENIED,
        message: 'No delegatorId present in resource context for delegation check.',
        mappedRole,
      };
    }

    if (delegatorId === actor.actorId) {
      // Actor IS the delegator — TEAM scope would cover this; deny DELEGATED self-access
      return {
        allowed: false,
        errorCode: PmsErrorCode.ACCESS_DENIED,
        message: 'Delegation scope cannot be used for self-access.',
        mappedRole,
      };
    }

    try {
      const { Delegation } = await import('../models/pms-delegation.model');
      const { Types } = await import('mongoose');

      if (!Types.ObjectId.isValid(actor.actorId) || !Types.ObjectId.isValid(delegatorId)) {
        return {
          allowed: false,
          errorCode: PmsErrorCode.ACCESS_DENIED,
          message: 'Invalid actor or delegator ID.',
          mappedRole,
        };
      }

      const now = new Date();
      const delegationQuery: Record<string, unknown> = {
        delegateUserId: new Types.ObjectId(actor.actorId),
        delegatorUserId: new Types.ObjectId(delegatorId),
        status: 'ACTIVE',
        validFrom: { $lte: now },
        validTo: { $gte: now },
        isDeleted: false,
      };

      // Cycle-scoped delegation — if cycleId provided, match cycle or global delegations
      if (resource?.cycleId && Types.ObjectId.isValid(resource.cycleId)) {
        delegationQuery.$or = [
          { cycleId: new Types.ObjectId(resource.cycleId) },
          { cycleId: null },
          { cycleId: { $exists: false } },
        ];
      }

      const delegation = await Delegation.findOne(delegationQuery).lean();

      if (!delegation) {
        return {
          allowed: false,
          errorCode: PmsErrorCode.ACCESS_DENIED,
          message: 'No active delegation found granting access to this resource.',
          mappedRole,
        };
      }

      return { allowed: true, mappedRole };
    } catch (e) {
      console.error('[AccessService] Delegation check failed', e);
      return {
        allowed: false,
        errorCode: PmsErrorCode.ACCESS_DENIED,
        message: 'Delegation check failed due to an internal error.',
        mappedRole,
      };
    }
  }

  private async checkDepartmentScope(
    actor: AccessActorContext,
    resource: AccessResourceContext | undefined,
    mappedRole: PmsMappedRole,
  ): Promise<AccessCheckResult> {
    const employeeId = resource?.employeeId ?? resource?.ownerId;
    if (!employeeId) {
      return {
        allowed: false,
        errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
        message: 'Resource lacks employeeId for department check.',
        mappedRole,
      };
    }
    try {
      const { User } = await import('../models/user.model');
      const [actorUser, employeeUser] = await Promise.all([
        User.findById(actor.actorId).select('departmentId').lean(),
        User.findById(employeeId).select('departmentId').lean(),
      ]);

      if (actorUser && employeeUser && actorUser.departmentId === employeeUser.departmentId) {
        return { allowed: true, mappedRole };
      }
    } catch (e) {
      console.error('[AccessService] Department scope check failed', e);
    }
    return {
      allowed: false,
      errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
      message: 'Access denied: Employee belongs to a different department.',
      mappedRole,
    };
  }

  private async checkBusinessUnitScope(
    actor: AccessActorContext,
    resource: AccessResourceContext | undefined,
    mappedRole: PmsMappedRole,
  ): Promise<AccessCheckResult> {
    const employeeId = resource?.employeeId ?? resource?.ownerId;
    if (!employeeId) {
      return {
        allowed: false,
        errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
        message: 'Resource lacks employeeId for business unit check.',
        mappedRole,
      };
    }
    try {
      const { User } = await import('../models/user.model');
      const [actorUser, employeeUser] = await Promise.all([
        User.findById(actor.actorId).select('location').lean(),
        User.findById(employeeId).select('location').lean(),
      ]);

      if (actorUser && employeeUser && actorUser.location === employeeUser.location) {
        return { allowed: true, mappedRole };
      }
    } catch (e) {
      console.error('[AccessService] Business unit scope check failed', e);
    }
    return {
      allowed: false,
      errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
      message: 'Access denied: Employee belongs to a different business unit (location).',
      mappedRole,
    };
  }

  private async checkRegionScope(
    actor: AccessActorContext,
    resource: AccessResourceContext | undefined,
    mappedRole: PmsMappedRole,
  ): Promise<AccessCheckResult> {
    const employeeId = resource?.employeeId ?? resource?.ownerId;
    if (!employeeId) {
      return {
        allowed: false,
        errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
        message: 'Resource lacks employeeId for region check.',
        mappedRole,
      };
    }
    try {
      const { User } = await import('../models/user.model');
      const [actorUser, employeeUser] = await Promise.all([
        User.findById(actor.actorId).select('country').lean(),
        User.findById(employeeId).select('country').lean(),
      ]);

      if (actorUser && employeeUser && actorUser.country === employeeUser.country) {
        return { allowed: true, mappedRole };
      }
    } catch (e) {
      console.error('[AccessService] Region scope check failed', e);
    }
    return {
      allowed: false,
      errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
      message: 'Access denied: Employee belongs to a different region (country).',
      mappedRole,
    };
  }
}

export const accessService = new AccessService();
