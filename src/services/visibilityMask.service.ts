import type { VisibilityMaskContext } from '../types/pms.types';
import { normalizePmsRole } from '../constants/pms.enums';

type MaskableRecord = Record<string, unknown>;

const gradeFields = new Set([
  'isGradeApplied',
  'grade',
  'gradeValue',
  'gradeScale',
  'gradeEffectiveDate',
  'gradeRemarks',
  'gradeApprovedBy',
  'gradeApprovedDate',
  'gradeDetails',
  'finalGrade',
]);

const meritFields = new Set([
  'isMeritApplied',
  'merit',
  'meritType',
  'meritAmount',
  'meritPercentage',
  'meritEffectiveDate',
  'payrollEffectiveDate',
  'meritRemarks',
  'meritApprovedBy',
  'meritApprovedDate',
  'meritDetails',
]);

const outcomeFields = new Set([
  'appraisalOutcomeType',
  'nilReason',
  'communicationPolicy',
]);

export class VisibilityMaskService {
  mask<T>(data: T, context: VisibilityMaskContext): T {
    if (Array.isArray(data)) {
      return data.map((item) => this.mask(item, context)) as T;
    }

    if (!this.isRecord(data)) {
      return data;
    }

    if (context.hasVisibilityOverride) {
      return { ...data };
    }

    // Evaluate visibleFrom date
    let effectiveContext = { ...context };
    const visibleFrom = context.visibleFrom ? new Date(context.visibleFrom) : null;
    if (!visibleFrom || Number.isNaN(visibleFrom.getTime()) || new Date() < visibleFrom) {
      effectiveContext.employeeGradeVisible = false;
      effectiveContext.employeeMeritVisible = false;
      effectiveContext.managerGradeVisible = false;
      effectiveContext.managerMeritVisible = false;
    }

    const gradeVisible = this.canViewGrade(effectiveContext);
    const meritVisible = this.canViewMerit(effectiveContext);
    const shouldHideOutcome = !gradeVisible || !meritVisible;
    const masked: MaskableRecord = {};

    for (const [key, value] of Object.entries(data)) {
      if (!gradeVisible && gradeFields.has(key)) continue;
      if (!meritVisible && meritFields.has(key)) continue;
      if (shouldHideOutcome && outcomeFields.has(key)) continue;

      // Check dynamic confidential fields from template config
      if (context.confidentialFields && context.confidentialFields.has(key)) {
        // Hide dynamic confidential fields unless outcome is fully visible
        // (Assuming confidential = grade/merit equivalents)
        if (shouldHideOutcome) continue;
      }

      masked[key] = value;
    }

    return masked as T;
  }

  maskGradeMeritFields<T>(data: T, context: VisibilityMaskContext): T {
    return this.mask(data, context);
  }

  private getNormalizedRole(actorRole: string): string {
    const normalized = normalizePmsRole(actorRole) ?? 'EMPLOYEE';
    return normalized.toLowerCase();
  }

  private canViewGrade(context: VisibilityMaskContext): boolean {
    if (context.hasVisibilityOverride) return true;
    const role = this.getNormalizedRole(context.actorRole);
    if (role === 'admin' || role === 'director') return true;
    if (role === 'employee') return context.employeeGradeVisible === true;
    if (role === 'manager') return context.managerGradeVisible === true;
    return false;
  }

  private canViewMerit(context: VisibilityMaskContext): boolean {
    if (context.hasVisibilityOverride) return true;
    const role = this.getNormalizedRole(context.actorRole);
    if (role === 'admin' || role === 'director') return true;
    if (role === 'employee') return context.employeeMeritVisible === true;
    if (role === 'manager') return context.managerMeritVisible === true;
    return false;
  }

  private isRecord(value: unknown): value is MaskableRecord {
    return typeof value === 'object' && value !== null;
  }
}

export const visibilityMaskService = new VisibilityMaskService();
