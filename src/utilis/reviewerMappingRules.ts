export interface ReviewerMappingInput {
  managerId?: string;
  managerRole?: string;
  l2ManagerId?: string;
  l2ManagerRole?: string;
  l3ManagerId?: string;
}

export interface CanonicalReviewerMapping {
  managerId?: string;
  l2ManagerId?: string;
  l3ManagerId?: string;
  hierarchyEndsAt: 'L1' | 'L2' | null;
}

export function isDirectorRole(role?: string): boolean {
  return String(role || '').trim().toLowerCase() === 'director';
}

/**
 * Employee hierarchy fields describe distinct people in the reporting chain.
 * When a Director terminates the chain, later levels stay empty. PMS routing
 * may still assign that terminal Director to both sequential review stages.
 */
export function canonicalizeTerminalDirectorMapping(
  input: ReviewerMappingInput,
): CanonicalReviewerMapping {
  if (isDirectorRole(input.managerRole)) {
    return {
      managerId: input.managerId,
      hierarchyEndsAt: 'L1',
    };
  }

  if (isDirectorRole(input.l2ManagerRole)) {
    return {
      managerId: input.managerId,
      l2ManagerId: input.l2ManagerId,
      hierarchyEndsAt: 'L2',
    };
  }

  return {
    managerId: input.managerId,
    l2ManagerId: input.l2ManagerId,
    l3ManagerId: input.l3ManagerId,
    hierarchyEndsAt: null,
  };
}
