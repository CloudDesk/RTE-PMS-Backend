import {
  canonicalizeTerminalDirectorMapping,
  isAllowedRepeatedL1AtL2,
  isDirectorRole,
} from '../../src/utilis/reviewerMappingRules';

describe('reviewer mapping rules', () => {
  it('recognises the base Director role case-insensitively', () => {
    expect(isDirectorRole(' DIRECTOR ')).toBe(true);
    expect(isDirectorRole('management')).toBe(false);
  });

  it('allows L1 to repeat at L2 when L1 reports directly to the L3 Director', () => {
    expect(isAllowedRepeatedL1AtL2({
      managerId: 'l1',
      l2ManagerId: 'l1',
      l3ManagerId: 'director',
      reportingManagerId: 'director',
      l3ManagerRole: 'DIRECTOR',
    })).toBe(true);
  });

  it('rejects repeated L1 at L2 when L3 is not L1\'s Director manager', () => {
    expect(isAllowedRepeatedL1AtL2({
      managerId: 'l1',
      l2ManagerId: 'l1',
      l3ManagerId: 'another-director',
      reportingManagerId: 'director',
      l3ManagerRole: 'director',
    })).toBe(false);
    expect(isAllowedRepeatedL1AtL2({
      managerId: 'l1',
      l2ManagerId: 'l1',
      l3ManagerId: 'manager',
      reportingManagerId: 'manager',
      l3ManagerRole: 'manager',
    })).toBe(false);
  });

  it('keeps a normal three-person hierarchy unchanged', () => {
    expect(canonicalizeTerminalDirectorMapping({
      managerId: 'l1',
      managerRole: 'manager',
      l2ManagerId: 'l2',
      l2ManagerRole: 'manager',
      l3ManagerId: 'l3',
    })).toEqual({
      managerId: 'l1',
      l2ManagerId: 'l2',
      l3ManagerId: 'l3',
      hierarchyEndsAt: null,
    });
  });

  it('removes L3 when L2 is the terminal Director', () => {
    expect(canonicalizeTerminalDirectorMapping({
      managerId: 'l1',
      managerRole: 'manager',
      l2ManagerId: 'director',
      l2ManagerRole: 'director',
      l3ManagerId: 'director',
    })).toEqual({
      managerId: 'l1',
      l2ManagerId: 'director',
      hierarchyEndsAt: 'L2',
    });
  });

  it('removes L2 and L3 when L1 is the terminal Director', () => {
    expect(canonicalizeTerminalDirectorMapping({
      managerId: 'director',
      managerRole: 'DIRECTOR',
      l2ManagerId: 'director',
      l2ManagerRole: 'director',
      l3ManagerId: 'director',
    })).toEqual({
      managerId: 'director',
      hierarchyEndsAt: 'L1',
    });
  });
});
