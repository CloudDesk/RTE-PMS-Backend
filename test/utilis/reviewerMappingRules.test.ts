import {
  canonicalizeTerminalDirectorMapping,
  isDirectorRole,
} from '../../src/utilis/reviewerMappingRules';

describe('reviewer mapping rules', () => {
  it('recognises the base Director role case-insensitively', () => {
    expect(isDirectorRole(' DIRECTOR ')).toBe(true);
    expect(isDirectorRole('management')).toBe(false);
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
