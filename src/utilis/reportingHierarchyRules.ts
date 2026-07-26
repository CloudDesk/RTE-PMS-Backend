const PMS_REPORTING_ROLE_MAP: Readonly<Record<string, readonly string[]>> = {
  staff: ['manager', 'director'],
  employee: ['manager', 'director'],
  manager: ['manager', 'director'],
  management: ['director'],
  director: [],
};

export function getAllowedPmsReportingRoles(role?: string): string[] | null {
  const normalizedRole = (role || '').trim().toLowerCase();
  const allowedRoles = PMS_REPORTING_ROLE_MAP[normalizedRole];
  return allowedRoles ? [...allowedRoles] : null;
}

export function isAllowedPmsReportingRelationship(
  employeeRole: string,
  managerRole: string,
): boolean {
  const allowedRoles = getAllowedPmsReportingRoles(employeeRole);
  if (!allowedRoles) return true;
  return allowedRoles.includes((managerRole || '').trim().toLowerCase());
}
