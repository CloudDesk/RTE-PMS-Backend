import {
  getAllowedPmsReportingRoles,
  isAllowedPmsReportingRelationship,
} from '../../src/utilis/reportingHierarchyRules';

describe('PMS reporting hierarchy rules', () => {
  it('allows staff and employees to report to Manager or Director', () => {
    expect(getAllowedPmsReportingRoles('staff')).toEqual(['manager', 'director']);
    expect(getAllowedPmsReportingRoles('EMPLOYEE')).toEqual(['manager', 'director']);
  });

  it('allows Manager to report to another Manager or Director', () => {
    expect(isAllowedPmsReportingRelationship('MANAGER', 'MANAGER')).toBe(true);
    expect(isAllowedPmsReportingRelationship('manager', 'director')).toBe(true);
  });

  it('keeps Director at the top of the PMS reporting hierarchy', () => {
    expect(getAllowedPmsReportingRoles('DIRECTOR')).toEqual([]);
    expect(isAllowedPmsReportingRelationship('DIRECTOR', 'MANAGER')).toBe(false);
  });

  it('allows Management to report only to Director', () => {
    expect(isAllowedPmsReportingRelationship('MANAGEMENT', 'DIRECTOR')).toBe(true);
    expect(isAllowedPmsReportingRelationship('MANAGEMENT', 'MANAGER')).toBe(false);
  });

  it('leaves roles outside the contained PMS map on their existing handling', () => {
    expect(getAllowedPmsReportingRoles('external')).toBeNull();
    expect(isAllowedPmsReportingRelationship('external', 'admin')).toBe(true);
  });
});
