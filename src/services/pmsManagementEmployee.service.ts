import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { AnnualDecisionService } from './annualDecision.service';
import { EmployeeAchievementSubmissionService } from './employeeAchievementSubmission.service';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';
import {
  AnnualAssignment,
  AnnualCycle,
  AnnualDecision,
  AnnualDecisionValue,
  ManagerReviewPeriodAssignment,
  PmsTemplateVersion,
  TermReviewValue,
  User,
} from '../models';

export interface ManagementEmployeeListQuery {
  page?: number;
  limit?: number;
  search?: string;
  active?: boolean | string;
  departmentId?: string;
  managerId?: string;
  employeeId?: string;
  cycleId?: string;
  assignedOnly?: boolean | string;
  assignmentScope?: string;
  sort?: string;
  sortOrder?: 'asc' | 'desc';
}

type ManagementEmployeeRecord = {
  _id: string;
  name: string;
  email?: string;
  employeeCode?: string;
  departmentId?: string;
  departmentName?: string;
  managerId?: string;
  managerName?: string;
  managerEmployeeCode?: string;
  managerEmail?: string;
  managerDepartmentId?: string;
  managerDepartmentName?: string;
  managerRole?: string;
  managerSpecificRole?: string;
  managerReportsToId?: string;
  managerReportsToName?: string;
  annualState?: string;
  finalDecisionStatus?: string;
  isGradeApplied?: boolean;
  gradeDetails?: Record<string, unknown>;
  role?: string;
  specificRole?: string;
  active?: boolean;
};

export class PmsManagementEmployeeService extends BaseService {
  private readonly annualDecisionService = new AnnualDecisionService(this.context);
  private readonly achievementSubmissionService = new EmployeeAchievementSubmissionService(this.context);

  async listEmployees(query: ManagementEmployeeListQuery = {}) {
    this.assertManagementAccess('pmsManagementEmployees.list');

    const page = this.positiveNumber(query.page, 1);
    const limit = Math.min(this.positiveNumber(query.limit, 10), 1000);
    const skip = (page - 1) * limit;
    const assignedOnly = this.booleanValue(query.assignedOnly) === true;

    if (assignedOnly) {
      return this.listAssignedEmployees(query, page, limit, skip);
    }

    const filter: Record<string, any> = {};
    const active = this.booleanValue(query.active);

    if (typeof active === 'boolean') {
      filter.active = active;
    }

    if (query.employeeId?.trim()) {
      if (!Types.ObjectId.isValid(query.employeeId)) {
        throw new Error('Invalid employee id');
      }
      filter._id = new Types.ObjectId(query.employeeId);
    }

    if (query.departmentId?.trim()) {
      filter.departmentId = this.exactCaseInsensitiveRegex(query.departmentId);
    }

    if (query.managerId?.trim()) {
      if (Types.ObjectId.isValid(query.managerId)) {
        filter.managerId = new Types.ObjectId(query.managerId);
      } else {
        filter.managerName = this.exactCaseInsensitiveRegex(query.managerId);
      }
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { employeeCode: { $regex: escaped, $options: 'i' } },
        { role: { $regex: escaped, $options: 'i' } },
        { specificRole: { $regex: escaped, $options: 'i' } },
        { departmentId: { $regex: escaped, $options: 'i' } },
        { managerName: { $regex: escaped, $options: 'i' } },
      ];
    }

    const sortField = query.sort?.trim() || 'name';
    const sort: Record<string, 1 | -1> = {
      [sortField]: query.sortOrder === 'desc' ? -1 : 1,
    };
    const select =
      '_id name email role specificRole departmentId active managerId managerName employeeCode country currency licenseType portalAccess createdAt updatedAt';

    const [users, total] = await Promise.all([
      User.find(filter).select(select).sort(sort).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    return {
      employees: await this.decorateEmployees(users),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getEmployeePerformance(employeeId: string) {
    this.assertManagementAccess('pmsManagementEmployees.performance');

    if (!Types.ObjectId.isValid(employeeId)) {
      throw new Error('Invalid employee id');
    }

    const employee =
      (await this.findEmployee(employeeId)) ??
      (await this.findEmployeeSnapshot(employeeId));

    if (!employee) {
      throw new Error('Employee not found');
    }

    const assignmentsResponse = await this.annualDecisionService.listAssignments({
      employeeId,
    });

    const summaries = await Promise.allSettled(
      assignmentsResponse.map((assignment) =>
        this.annualDecisionService.getSummary(assignment.annualAssignmentId),
      ),
    );

    const cycles = assignmentsResponse.map((assignment, index) => {
      const result = summaries[index];
      return {
        assignment,
        summary: result.status === 'fulfilled' ? result.value : undefined,
        summaryError:
          result.status === 'rejected'
            ? result.reason instanceof Error
              ? result.reason.message
              : 'Unable to load annual summary.'
            : undefined,
      };
    });

    const termAssignments = cycles.flatMap((cycle) =>
      (cycle.summary?.termAssignments ?? []).map((termAssignment: any) => ({
        id: termAssignment._id?.toString?.() ?? String(termAssignment._id),
        termAssignment,
      })),
    );

    const achievementResults = await Promise.allSettled(
      termAssignments.map((item) =>
        this.achievementSubmissionService.getSubmission(item.id),
      ),
    );

    const achievementsByTermAssignment = termAssignments.reduce(
      (acc, item, index) => {
        const result = achievementResults[index];
        if (result.status === 'fulfilled') {
          acc[item.id] = result.value;
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );
    const achievementErrorsByTermAssignment = termAssignments.reduce(
      (acc, item, index) => {
        const result = achievementResults[index];
        if (result.status === 'rejected') {
          acc[item.id] =
            result.reason instanceof Error
              ? result.reason.message
              : 'Unable to load achievement submission.';
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    return {
      employee,
      cycles,
      achievementsByTermAssignment,
      achievementErrorsByTermAssignment,
    };
  }

  async getEmployeeTrainingIdentification(employeeId: string) {
    this.assertTrainingIdentificationAccess();
    if (!Types.ObjectId.isValid(employeeId)) throw new Error('Invalid employee id');

    const employeeObjectId = new Types.ObjectId(employeeId);
    const [employee, assignments] = await Promise.all([
      User.findById(employeeObjectId)
        .select('_id name employeeCode departmentId departmentName')
        .lean(),
      AnnualAssignment.find({ employeeId: employeeObjectId, isDeleted: false })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
    ]);
    if (!employee && assignments.length === 0) throw new Error('Employee not found');

    const cycleIds = assignments.map((item) => item.cycleId).filter(Boolean);
    const cycles = await AnnualCycle.find({ _id: { $in: cycleIds }, isDeleted: false })
      .select('_id name code appraisalYear startDate endDate')
      .lean();
    const cycleMap = new Map(cycles.map((cycle) => [cycle._id.toString(), cycle]));
    const assignmentIds = assignments.map((item) => item._id);
    const trainingKeys = [
      'competency_mapping_gap',
      'function_domain_training',
      'soft_skills_training',
    ];
    const templateVersionIds = assignments
      .map((assignment) => assignment.templateVersionId)
      .filter(Boolean);
    const templateVersions = templateVersionIds.length
      ? await PmsTemplateVersion.find({ _id: { $in: templateVersionIds } })
        .select('sections.fields')
        .lean()
      : [];
    const normalizedLabel = (value: unknown) => String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const canonicalTrainingKey = (fieldKey: string, fieldLabel?: string) => {
      const key = String(fieldKey ?? '').trim();
      if (trainingKeys.includes(key)) return key;
      const label = normalizedLabel(fieldLabel);
      if (label.includes('gap from competency') || label.includes('competency mapping')) return 'competency_mapping_gap';
      if (label.includes('training in functions') || label.includes('training in function') || label.includes('domain area')) return 'function_domain_training';
      if (label.includes('training in personality') || label.includes('soft skills')) return 'soft_skills_training';
      return undefined;
    };
    const templateKeyMap = new Map<string, string>();
    for (const version of templateVersions) {
      for (const section of version.sections ?? []) {
        for (const field of section.fields ?? []) {
          const canonical = canonicalTrainingKey(field.fieldKey, field.fieldLabel);
          if (canonical) templateKeyMap.set(field.fieldKey, canonical);
        }
      }
    }
    const acceptedTrainingKeys = [...new Set([...trainingKeys, ...templateKeyMap.keys()])];
    const [annualManagerReviews, managerReviewValues, annualReviewValues] = await Promise.all([
      ManagerReviewPeriodAssignment.find({
        annualAssignmentId: { $in: assignmentIds },
        employeeId: employeeObjectId,
        reviewState: { $in: ['MANAGER_REVIEW_SUBMITTED', 'FINALIZED', 'CLOSED_BY_ADMIN'] },
        isDeleted: false,
      })
        .select('annualAssignmentId reviewValues submittedAt updatedAt')
        .sort({ submittedAt: -1, updatedAt: -1 })
        .lean(),
      TermReviewValue.find({
        annualAssignmentId: { $in: assignmentIds },
        employeeId: employeeObjectId,
        roleCode: 'MANAGER',
        fieldKey: { $in: acceptedTrainingKeys },
        valueStatus: 'ACTIVE',
        submittedAt: { $exists: true, $ne: null },
        isDeleted: false,
      })
        .sort({ submittedAt: -1, updatedAt: -1 })
        .lean(),
      AnnualDecisionValue.find({
        annualAssignmentId: { $in: assignmentIds },
        fieldKey: { $in: acceptedTrainingKeys },
        roleCode: { $in: ['MANAGER', 'L2', 'DIRECTOR'] },
        isDeleted: false,
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
    ]);
    const valuesByAssignment = new Map<string, Map<string, any>>();
    const annualManagerReviewValues = annualManagerReviews.flatMap((review) =>
      (review.reviewValues ?? [])
        .map((value) => ({
          ...value,
          fieldKey: templateKeyMap.get(value.fieldKey) ?? canonicalTrainingKey(value.fieldKey),
          annualAssignmentId: review.annualAssignmentId,
        }))
        .filter((value): value is typeof value & { fieldKey: string } => Boolean(value.fieldKey)),
    );
    // Annual Manager Review is the source displayed to HR after L3 completion.
    // The historic term/decision collections remain fallbacks for older cycles.
    for (const value of [...annualManagerReviewValues, ...managerReviewValues, ...annualReviewValues]) {
      const assignmentKey = value.annualAssignmentId.toString();
      const canonicalKey = templateKeyMap.get(value.fieldKey) ?? canonicalTrainingKey(value.fieldKey);
      if (!canonicalKey) continue;
      const fieldMap = valuesByAssignment.get(assignmentKey) ?? new Map<string, any>();
      if (!fieldMap.has(canonicalKey)) fieldMap.set(canonicalKey, value);
      valuesByAssignment.set(assignmentKey, fieldMap);
    }
    const serializedValue = (value?: any) => {
      if (!value) return '';
      if (value.valueText !== undefined) return value.valueText;
      if (value.valueNumber !== undefined) return value.valueNumber;
      if (value.valueDate) return new Date(value.valueDate).toISOString();
      return value.valueJson ?? '';
    };

    return assignments.map((assignment) => {
      const cycle = cycleMap.get(assignment.cycleId.toString());
      const fieldMap = valuesByAssignment.get(assignment._id.toString()) ?? new Map();
      const ready = assignment.directorReviewStatus === 'COMPLETED';
      const snapshot = assignment.employeeSnapshot ?? {};
      return {
        annualAssignmentId: assignment._id.toString(),
        cycleId: assignment.cycleId.toString(),
        cycleName: cycle?.name ?? cycle?.code ?? 'PMS Cycle',
        assessmentYear: cycle?.appraisalYear ?? new Date(cycle?.endDate ?? assignment.updatedAt).getFullYear(),
        status: ready ? 'AVAILABLE' : 'MANAGEMENT_DECISION_PENDING',
        finalReviewStatus: assignment.finalReviewStatus,
        directorReviewStatus: assignment.directorReviewStatus,
        completedAt: assignment.directorReviewCompletedAt?.toISOString?.(),
        employee: {
          name: String(employee?.name ?? snapshot.name ?? ''),
          employeeCode: String(employee?.employeeCode ?? snapshot.employeeCode ?? ''),
          department: String(
            (employee as any)?.departmentName ?? employee?.departmentId ??
            snapshot.departmentName ?? snapshot.department ?? snapshot.departmentId ?? '',
          ),
        },
        values: ready ? {
          competencyMappingGap: serializedValue(fieldMap.get('competency_mapping_gap')),
          functionDomainTraining: serializedValue(fieldMap.get('function_domain_training')),
          softSkillsTraining: serializedValue(fieldMap.get('soft_skills_training')),
        } : undefined,
      };
    });
  }

  private async findEmployee(employeeId: string): Promise<ManagementEmployeeRecord | null> {
    const employee = await User.findById(employeeId)
      .select('_id name email role specificRole departmentId active managerId managerName employeeCode country currency licenseType portalAccess')
      .lean();

    if (!employee) {
      return null;
    }

    const [decorated] = await this.decorateEmployees([employee]);
    return decorated ?? null;
  }

  private async findEmployeeSnapshot(employeeId: string): Promise<ManagementEmployeeRecord | null> {
    const assignment = await AnnualAssignment.findOne({
      employeeId: new Types.ObjectId(employeeId),
      isDeleted: false,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    if (!assignment) {
      return null;
    }

    const snapshot = assignment.employeeSnapshot ?? {};
    const managerSnapshot = assignment.managerSnapshot ?? {};

    return {
      _id: assignment.employeeId.toString(),
      name: String(snapshot.name ?? 'Employee'),
      email: String(snapshot.email ?? ''),
      employeeCode: String(snapshot.employeeCode ?? ''),
      departmentId: String(snapshot.departmentId ?? snapshot.department ?? ''),
      departmentName: String(snapshot.departmentName ?? snapshot.department ?? ''),
      managerId: assignment.assignedManagerId?.toString(),
      managerName: String(managerSnapshot.name ?? ''),
      role: String(snapshot.specificRole ?? snapshot.role ?? 'Employee'),
      specificRole: String(snapshot.specificRole ?? ''),
      active: true,
    };
  }

  private async decorateEmployees(users: any[]): Promise<ManagementEmployeeRecord[]> {
    const managerIds = [
      ...new Set(
        users
          .map((user) => user.managerId?.toString?.() ?? user.managerId)
          .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id)),
      ),
    ];

    const managers = managerIds.length
      ? await User.find({ _id: { $in: managerIds.map((id) => new Types.ObjectId(id)) } })
          .select('_id name email employeeCode')
          .lean()
      : [];
    const managerMap = new Map(managers.map((manager) => [manager._id.toString(), manager]));

    return users.map((user) => {
      const managerId = user.managerId?.toString?.() ?? user.managerId;
      const manager = managerId ? managerMap.get(managerId) : undefined;
      return {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        employeeCode: user.employeeCode,
        departmentId: user.departmentId,
        departmentName: user.departmentName,
        managerId,
        managerName: user.managerName || manager?.name || '',
        role: user.role,
        specificRole: user.specificRole,
        active: user.active,
      };
    });
  }

  private async listAssignedEmployees(
    query: ManagementEmployeeListQuery,
    page: number,
    limit: number,
    skip: number,
  ) {
    const assignmentFilter: Record<string, any> = { isDeleted: false };

    if (query.cycleId?.trim()) {
      if (!Types.ObjectId.isValid(query.cycleId)) {
        throw new Error('Invalid cycle id');
      }
      assignmentFilter.cycleId = new Types.ObjectId(query.cycleId);
    }

    if (query.employeeId?.trim()) {
      if (!Types.ObjectId.isValid(query.employeeId)) {
        throw new Error('Invalid employee id');
      }
      assignmentFilter.employeeId = new Types.ObjectId(query.employeeId);
    }

    if (query.managerId?.trim() && Types.ObjectId.isValid(query.managerId)) {
      assignmentFilter.assignedManagerId = new Types.ObjectId(query.managerId);
    }

    const assignmentScope = Array.isArray(query.assignmentScope)
      ? String(query.assignmentScope[0] ?? '').trim()
      : String(query.assignmentScope ?? '').trim();

    switch (assignmentScope) {
      case 'decisionReady':
        assignmentFilter.annualState = {
          $in: ['MANAGEMENT_DECISION_DRAFT', 'MANAGEMENT_DECISION_SUBMITTED', 'ANNUAL_FINALIZED', 'VISIBILITY_ENABLED', 'CLOSED'],
        };
        break;
      case 'gradesApplied':
        assignmentFilter.annualState = { $in: ['ANNUAL_FINALIZED', 'VISIBILITY_ENABLED', 'CLOSED'] };
        break;
      case '':
        break;
      default:
        throw new Error('Invalid assignment scope');
    }

    const assignments = await AnnualAssignment.find(assignmentFilter)
      .select('employeeId assignedManagerId employeeSnapshot managerSnapshot annualState finalDecisionStatus isGradeApplied gradeDetails cycleId createdAt updatedAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const employeeIds = [
      ...new Set(
        assignments
          .map((assignment) => assignment.employeeId?.toString?.())
          .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id)),
      ),
    ];
    const managerIds = [
      ...new Set(
        assignments
          .map((assignment) => assignment.assignedManagerId?.toString?.())
          .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id)),
      ),
    ];
    const assignmentIds = assignments
      .map((assignment) => assignment._id?.toString?.())
      .filter((id): id is string => Boolean(id) && Types.ObjectId.isValid(id));

    const [users, managers, decisions] = await Promise.all([
      employeeIds.length
        ? User.find({ _id: { $in: employeeIds.map((id) => new Types.ObjectId(id)) } })
            .select('_id name email role specificRole departmentId departmentName active managerId managerName employeeCode')
            .lean()
        : [],
      managerIds.length
        ? User.find({ _id: { $in: managerIds.map((id) => new Types.ObjectId(id)) } })
            .select('_id name email employeeCode role specificRole departmentId departmentName managerId managerName')
            .lean()
        : [],
      assignmentIds.length
        ? AnnualDecision.find({
            annualAssignmentId: { $in: assignmentIds.map((id) => new Types.ObjectId(id)) },
            isDeleted: false,
          })
            .select('annualAssignmentId decisionStatus isGradeApplied gradeDetails isMeritApplied meritDetails nilReason appraisalOutcomeType')
            .lean()
        : [],
    ]);

    const userMap = new Map(users.map((user) => [user._id.toString(), user]));
    const managerMap = new Map(managers.map((manager) => [manager._id.toString(), manager]));
    const decisionMap = new Map(decisions.map((decision) => [decision.annualAssignmentId.toString(), decision]));
    const recordsByEmployee = new Map<string, ManagementEmployeeRecord>();

    for (const assignment of assignments) {
      const employeeId = assignment.employeeId?.toString?.();
      if (!employeeId || recordsByEmployee.has(employeeId)) continue;

      const user = userMap.get(employeeId) as Record<string, any> | undefined;
      const employeeSnapshot = assignment.employeeSnapshot ?? {};
      const managerId = assignment.assignedManagerId?.toString?.();
      const manager = (managerId ? managerMap.get(managerId) : undefined) as Record<string, any> | undefined;
      const managerSnapshot = assignment.managerSnapshot ?? {};
      const decision = decisionMap.get(assignment._id.toString()) as Record<string, any> | undefined;
      const gradeDetails = decision?.gradeDetails ?? assignment.gradeDetails;
      const isGradeApplied = decision?.isGradeApplied ?? assignment.isGradeApplied;

      recordsByEmployee.set(employeeId, {
        _id: employeeId,
        name: String(user?.name ?? employeeSnapshot.name ?? 'Employee'),
        email: String(user?.email ?? employeeSnapshot.email ?? ''),
        employeeCode: String(user?.employeeCode ?? employeeSnapshot.employeeCode ?? ''),
        departmentId: String(user?.departmentId ?? employeeSnapshot.departmentId ?? employeeSnapshot.department ?? ''),
        departmentName: String(user?.departmentName ?? employeeSnapshot.departmentName ?? employeeSnapshot.department ?? ''),
        managerId,
        managerName: String(manager?.name ?? managerSnapshot.name ?? ''),
        managerEmployeeCode: String(manager?.employeeCode ?? managerSnapshot.employeeCode ?? ''),
        managerEmail: String(manager?.email ?? managerSnapshot.email ?? ''),
        managerDepartmentId: String(manager?.departmentId ?? managerSnapshot.departmentId ?? managerSnapshot.department ?? ''),
        managerDepartmentName: String(manager?.departmentName ?? managerSnapshot.departmentName ?? managerSnapshot.department ?? ''),
        managerRole: String(manager?.role ?? managerSnapshot.role ?? managerSnapshot.specificRole ?? ''),
        managerSpecificRole: String(manager?.specificRole ?? managerSnapshot.specificRole ?? ''),
        managerReportsToId: manager?.managerId?.toString?.() ?? '',
        managerReportsToName: String(manager?.managerName ?? managerSnapshot.managerName ?? ''),
        annualState: String(assignment.annualState ?? ''),
        finalDecisionStatus: String(assignment.finalDecisionStatus ?? ''),
        isGradeApplied: Boolean(isGradeApplied),
        gradeDetails: gradeDetails as Record<string, unknown> | undefined,
        role: String(user?.role ?? employeeSnapshot.role ?? employeeSnapshot.specificRole ?? 'Employee'),
        specificRole: String(user?.specificRole ?? employeeSnapshot.specificRole ?? ''),
        active: user?.active ?? true,
      });
    }

    let records = Array.from(recordsByEmployee.values());
    if (assignmentScope === 'gradesApplied') {
      records = records.filter(
        (record) => this.hasMeaningfulGrade(record.gradeDetails),
      );
    }

    const active = this.booleanValue(query.active);
    if (typeof active === 'boolean') {
      records = records.filter((record) => record.active === active);
    }

    if (query.managerId?.trim() && !Types.ObjectId.isValid(query.managerId)) {
      const managerName = this.normalize(query.managerId);
      records = records.filter((record) => this.normalize(record.managerName) === managerName);
    }

    if (query.departmentId?.trim()) {
      const department = this.normalize(query.departmentId);
      records = records.filter(
        (record) =>
          this.normalize(record.departmentId) === department ||
          this.normalize(record.departmentName) === department,
      );
    }

    if (query.search?.trim()) {
      const search = this.normalize(query.search);
      records = records.filter((record) =>
        [
          record.name,
          record.email,
          record.employeeCode,
          record.role,
          record.specificRole,
          record.departmentId,
          record.departmentName,
          record.managerName,
        ].some((value) => this.normalize(value).includes(search)),
      );
    }

    const sortField = query.sort?.trim() || 'name';
    const sortDirection = query.sortOrder === 'desc' ? -1 : 1;
    records.sort((left, right) => {
      const leftValue = this.normalize((left as Record<string, unknown>)[sortField]);
      const rightValue = this.normalize((right as Record<string, unknown>)[sortField]);
      return leftValue.localeCompare(rightValue) * sortDirection;
    });

    const total = records.length;

    return {
      employees: records.slice(skip, skip + limit),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private assertManagementAccess(action: string): void {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const mappedRole = normalizePmsRole(user.role);
    const rawRole = String(user.role || '').trim().toUpperCase();
    const hasScopeAccess =
      rawRole !== 'HR' &&
      (user.scope === 'EXECUTIVE' || user.scope === 'ALL');

    if (
      mappedRole === PmsRole.ADMIN ||
      mappedRole === PmsRole.DIRECTOR ||
      mappedRole === PmsRole.MANAGEMENT ||
      hasScopeAccess
    ) {
      return;
    }

    throw new Error(`Access denied for ${action}`);
  }

  private assertTrainingIdentificationAccess(): void {
    const user = this.context.user;
    if (!user) throw new Error('Authentication required');
    const rawRole = String(user.role || '').trim().toUpperCase();
    const mappedRole = normalizePmsRole(user.role);
    if (['HR', 'HR_ADMIN', 'HRADMIN'].includes(rawRole) || mappedRole === PmsRole.ADMIN) return;
    throw new Error('Only HR/Admin can view Training Identification');
  }

  private positiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.trunc(parsed);
  }

  private booleanValue(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return undefined;
  }

  private normalize(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private hasMeaningfulGrade(gradeDetails: Record<string, unknown> | undefined): boolean {
    const excludedValues = new Set(['', 'n/a', 'na']);
    return [
      gradeDetails?.grade,
      gradeDetails?.finalGrade,
      gradeDetails?.gradeValue,
      gradeDetails?.gradeCode,
    ].some((value) => !excludedValues.has(String(value ?? '').trim().toLowerCase()));
  }

  private exactCaseInsensitiveRegex(value: string): RegExp {
    return new RegExp(`^${value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  }
}
