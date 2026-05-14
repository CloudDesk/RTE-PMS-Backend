import type {
  AccessActorContext,
  AccessCheckInput,
  AccessCheckResult,
  AccessResourceContext,
  PmsMappedRole,
} from '../types/pms.types';

export class AccessService {
  mapRole(actorRole: string): PmsMappedRole {
    const role = actorRole.toLowerCase();

    if (role === 'staff') return 'Employee';
    if (role === 'manager') return 'Manager';
    if (role === 'admin') return 'HR/Admin';

    return 'Unknown';
  }

  canPerform(input: AccessCheckInput): AccessCheckResult {
    const mappedRole = this.mapRole(input.actor.actorRole);

    if (mappedRole === 'Unknown') {
      return {
        allowed: false,
        errorCode: 'UNKNOWN_PMS_ROLE',
        message: `Role ${input.actor.actorRole} is not mapped for PMS access.`,
        mappedRole,
      };
    }

    if (mappedRole === 'HR/Admin') {
      return { allowed: true, mappedRole };
    }

    if (input.requiresAdmin) {
      return {
        allowed: false,
        errorCode: 'ADMIN_ACCESS_REQUIRED',
        message: 'This PMS action requires HR/Admin access.',
        mappedRole,
      };
    }

    if (mappedRole === 'Employee') {
      return this.canEmployeeAccess(input.actor, input.resource, mappedRole);
    }

    if (mappedRole === 'Manager') {
      return this.canManagerAccess(input.actor, input.resource, mappedRole);
    }

    return {
      allowed: false,
      errorCode: 'ACCESS_DENIED',
      message: 'PMS access denied.',
      mappedRole,
    };
  }

  private canEmployeeAccess(
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
      errorCode: 'EMPLOYEE_SCOPE_VIOLATION',
      message: 'Employees can access only their own PMS records.',
      mappedRole,
    };
  }

  private canManagerAccess(
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
      errorCode: 'MANAGER_SCOPE_VIOLATION',
      message: 'Managers can access only assigned employee PMS records.',
      mappedRole,
    };
  }
}

export const accessService = new AccessService();
