import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { AnnualDecisionService } from './annualDecision.service';
import { EmployeeAchievementSubmissionService } from './employeeAchievementSubmission.service';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';
import { AnnualAssignment, User } from '../models';

export interface ManagementEmployeeListQuery {
  page?: number;
  limit?: number;
  search?: string;
  active?: boolean;
  departmentId?: string;
  managerId?: string;
  employeeId?: string;
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
    const filter: Record<string, any> = {};

    if (typeof query.active === 'boolean') {
      filter.active = query.active;
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

  private assertManagementAccess(action: string): void {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const mappedRole = normalizePmsRole(user.role);
    const hasScopeAccess = user.scope === 'EXECUTIVE' || user.scope === 'ALL';

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

  private positiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.trunc(parsed);
  }

  private exactCaseInsensitiveRegex(value: string): RegExp {
    return new RegExp(`^${value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  }
}
