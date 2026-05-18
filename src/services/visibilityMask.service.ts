import type { VisibilityMaskContext } from '../types/pms.types';

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

    const role = context.actorRole.toLowerCase();
    if (role === 'admin' || role === 'super_admin' || role === 'management') {
      return { ...data };
    }

    const gradeVisible = this.canViewGrade(context);
    const meritVisible = this.canViewMerit(context);
    const shouldHideOutcome = !gradeVisible || !meritVisible;
    const masked: MaskableRecord = {};

    for (const [key, value] of Object.entries(data)) {
      if (!gradeVisible && gradeFields.has(key)) continue;
      if (!meritVisible && meritFields.has(key)) continue;
      if (shouldHideOutcome && outcomeFields.has(key)) continue;

      masked[key] = value;
    }

    return masked as T;
  }

  maskGradeMeritFields<T>(data: T, context: VisibilityMaskContext): T {
    return this.mask(data, context);
  }

  private canViewGrade(context: VisibilityMaskContext): boolean {
    const role = context.actorRole.toLowerCase();
    if (role === 'admin' || role === 'super_admin' || role === 'management') return true;
    if (role === 'staff' || role === 'employee') return context.employeeGradeVisible === true;
    if (role === 'manager') return context.managerGradeVisible === true;
    return false;
  }

  private canViewMerit(context: VisibilityMaskContext): boolean {
    const role = context.actorRole.toLowerCase();
    if (role === 'admin' || role === 'super_admin' || role === 'management') return true;
    if (role === 'staff' || role === 'employee') return context.employeeMeritVisible === true;
    if (role === 'manager') return context.managerMeritVisible === true;
    return false;
  }

  private isRecord(value: unknown): value is MaskableRecord {
    return typeof value === 'object' && value !== null;
  }
}

export const visibilityMaskService = new VisibilityMaskService();
