import type {
  AccessActorContext,
  AccessCheckInput,
  AccessCheckResult,
  AccessResourceContext,
  PmsMappedRole,
} from '../types/pms.types';
import { normalizePmsRole, PmsErrorCode, PmsRole } from '../constants/pms.enums';
import { PmsRolePermission, type IPmsRolePermission } from '../models/pms-role-permission.model';

export class AccessService {
  private permissions: IPmsRolePermission[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      let dbPermissions = await PmsRolePermission.find().lean();
      
      if (dbPermissions.length === 0) {
        dbPermissions = await this.seedDefaultPermissions();
      }

      this.permissions = dbPermissions as IPmsRolePermission[];
      this.initialized = true;
      console.log(`[AccessService] Loaded ${this.permissions.length} permissions`);
    } catch (error) {
      console.error('[AccessService] Failed to load permissions from DB', error);
      this.permissions = this.getDefaultPermissions();
      this.initialized = true;
    }
  }

  private async seedDefaultPermissions(): Promise<any[]> {
    const defaults = this.getDefaultPermissions();
    const created = await PmsRolePermission.insertMany(defaults);
    return created;
  }

  private getDefaultPermissions(): any[] {
    return [
      { role: PmsRole.ADMIN, resource: '*', action: '*', scope: 'ALL', isAllowed: true, priority: 100 },
      { role: PmsRole.EMPLOYEE, resource: '*', action: '*', scope: 'OWN', isAllowed: true, priority: 10 },
      { role: PmsRole.MANAGER, resource: '*', action: '*', scope: 'TEAM', isAllowed: true, priority: 20 },
      { role: PmsRole.MANAGEMENT, resource: '*', action: '*', scope: 'TEAM', isAllowed: true, priority: 20 },
      { role: PmsRole.DIRECTOR, resource: '*', action: '*', scope: 'HIERARCHY', isAllowed: true, priority: 30 },
    ];
  }

  mapRole(actorRole: string): PmsMappedRole {
    return normalizePmsRole(actorRole) ?? 'UNKNOWN';
  }

  async canPerform(input: AccessCheckInput): Promise<AccessCheckResult> {
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

    const applicableRules = this.permissions.filter(p => 
      p.role === mappedRole && 
      (p.resource === '*' || p.resource === (input.action.split('.')[0])) &&
      (p.action === '*' || p.action === input.action)
    ).sort((a, b) => b.priority - a.priority);

    if (applicableRules.length === 0) {
      return { allowed: false, errorCode: PmsErrorCode.ACCESS_DENIED, message: 'PMS access denied.', mappedRole };
    }

    const rule = applicableRules[0];

    if (!rule.isAllowed) {
      return { allowed: false, errorCode: PmsErrorCode.ACCESS_DENIED, message: 'PMS access explicitly denied.', mappedRole };
    }

    if (rule.scope === 'ALL') {
      return { allowed: true, mappedRole };
    }

    if (rule.scope === 'OWN') {
      return this.checkOwnScope(input.actor, input.resource, mappedRole);
    }

    if (rule.scope === 'TEAM') {
      return this.checkTeamScope(input.actor, input.resource, mappedRole);
    }

    if (rule.scope === 'HIERARCHY') {
      return await this.checkHierarchyScope(input.actor, input.resource, mappedRole);
    }

    return { allowed: true, mappedRole };
  }

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
      return { allowed: false, errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION, message: 'Resource lacks employeeId for hierarchy check.', mappedRole };
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
}

export const accessService = new AccessService();
