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

export interface RepeatedL1AtL2Input {
  managerId?: string;
  l2ManagerId?: string;
  l3ManagerId?: string;
  reportingManagerId?: string;
  l3ManagerRole?: string;
}

export function isDirectorRole(role?: string): boolean {
  return String(role || '').trim().toLowerCase() === 'director';
}

/**
 * The same person may occupy L1 and L2 only when their own reporting manager
 * is the Director stored at L3. All other repeated hierarchy mappings remain
 * invalid.
 */
export function isAllowedRepeatedL1AtL2(
  input: RepeatedL1AtL2Input,
): boolean {
  const managerId = String(input.managerId || '');
  const l2ManagerId = String(input.l2ManagerId || '');
  const l3ManagerId = String(input.l3ManagerId || '');
  const reportingManagerId = String(input.reportingManagerId || '');

  return Boolean(
    managerId &&
    managerId === l2ManagerId &&
    l3ManagerId &&
    l3ManagerId !== managerId &&
    reportingManagerId === l3ManagerId &&
    isDirectorRole(input.l3ManagerRole),
  );
}

/**
 * Employee hierarchy fields normally describe distinct people in the reporting chain.
 * A separately validated exception may repeat L1 at L2 when L1 reports directly
 * to the Director stored at L3.
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
