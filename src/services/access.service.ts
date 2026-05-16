import type {
  AccessActorContext,
  AccessCheckInput,
  AccessCheckResult,
  AccessResourceContext,
  PmsMappedRole,
} from '../types/pms.types';
import { normalizePmsRole, PmsErrorCode, PmsRole } from '../constants/pms.enums';

export class AccessService {
  mapRole(actorRole: string): PmsMappedRole {
    return normalizePmsRole(actorRole) ?? 'UNKNOWN';
  }

  canPerform(input: AccessCheckInput): AccessCheckResult {
    const mappedRole = this.mapRole(input.actor.actorRole);

    if (mappedRole === 'UNKNOWN') {
      return {
        allowed: false,
        errorCode: PmsErrorCode.UNKNOWN_ROLE,
        message: `Role ${input.actor.actorRole} is not mapped for PMS access.`,
        mappedRole,
      };
    }

    if (mappedRole === PmsRole.ADMIN || mappedRole === PmsRole.SUPER_ADMIN) {
      return { allowed: true, mappedRole };
    }

    if (input.requiresAdmin) {
      return {
        allowed: false,
        errorCode: PmsErrorCode.ADMIN_ACCESS_REQUIRED,
        message: 'This PMS action requires Admin access.',
        mappedRole,
      };
    }

    if (mappedRole === PmsRole.EMPLOYEE) {
      return this.canEmployeeAccess(input.actor, input.resource, mappedRole);
    }

    if (mappedRole === PmsRole.MANAGER || mappedRole === PmsRole.MANAGEMENT) {
      return this.canManagerAccess(input.actor, input.resource, mappedRole);
    }

    return {
      allowed: false,
      errorCode: PmsErrorCode.ACCESS_DENIED,
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
      errorCode: PmsErrorCode.EMPLOYEE_SCOPE_VIOLATION,
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
      errorCode: PmsErrorCode.MANAGER_SCOPE_VIOLATION,
      message: 'Managers can access only assigned employee PMS records.',
      mappedRole,
    };
  }
}

export const accessService = new AccessService();
