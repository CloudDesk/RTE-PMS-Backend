import { BaseService } from './base.service';
import { User } from '../models/user.model';
import { LOV } from '../models/lov.model';
import { PmsRolePermission } from '../models/pms-role-permission.model';
import { RequestContext } from '../types/context';
import { Types } from 'mongoose';
import { emailService } from './email.service';
import { messaging } from '../config/firebase/firebaseConfig';
import { generateEmailTemplate } from '../emails/templates';
import { getSubordinateUserIds } from '../utilis/userHierarchy';
import { uploadFileToGCP } from '../utilis/gcpStorage';
import { getAllowedPmsReportingRoles } from '../utilis/reportingHierarchyRules';
import {
  canonicalizeTerminalDirectorMapping,
  isAllowedRepeatedL1AtL2,
  isDirectorRole,
} from '../utilis/reviewerMappingRules';
import * as fs from 'fs';
import * as path from 'path';

// import { MultipartFile } from '@fastify/multipart';

interface IBankDetails {
  accountHolderName: string;
  accountNumber: string;
  bankName: string;
  ifscCode: string;
  isActive: boolean; // Main salary account
}

interface IGovernmentIds {
  pan: { number?: string; documentUrl?: string; file?: any; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
  aadhaar: { number?: string; documentUrl?: string; file?: any; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
  passport: { number?: string; documentUrl?: string; file?: any; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
  voterId: { number?: string; documentUrl?: string; file?: any; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
  drivingLicense: { number?: string; documentUrl?: string; file?: any; verificationStatus?: 'Pending' | 'Verified' | 'Rejected' };
  pf: { number?: string; uan?: string };
}

interface IExperienceDetails {
  companyName?: string;
  role?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  duration?: string;
  documentUrl?: string;
  documentId?: string;
  companyAddress?: string;
  lastDrawnSalary?: number;
  reasonForLeaving?: string;
  verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
}

interface IAcademicDetails {
  qualificationType?: string;
  fieldOfStudy?: string;
  institution?: string;
  grade?: string;
  yearOfCompletion?: string | number;
  documentUrl?: string;
  documentId?: string;
  verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
}

interface IUserCreate {
  name: string;
  email: string;
  password: string;
  role: string;
  specificRole?: string;
  departmentId: string;
  managerId?: string;
  managerName?: string;
  l2ManagerId?: string;
  l2ManagerName?: string;
  l3ManagerId?: string;
  l3ManagerName?: string;
  employeeCode: string;
  biometricId?: string | null;
  active?: boolean;
  joiningDate: Date; // Required
  confirmationDate?: Date; // Optional - defaults to joiningDate if not provided
  probationStartDate?: Date; // Optional - defaults to joiningDate if not provided
  probationEndDate?: Date; // Optional - defaults to one year from probationStartDate
  probationDate?: Date; // Legacy probation end date alias
  location?: string;
  phone?: string;
  emergencyContact?: {
    name?: string;
    relationship?: string;
    address?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    pincode?: number;
    mobileNo?: string;
  };
  address?: string;
  bloodGroup?: string;
  dateOfBirth: Date; // Required
  fatherName?: string;
  maritalStatus?: string;
  spouseName?: string;
  separationDate?: Date;
  noticePeriod?: number;
  personalMailId?: string;
  upcomingShiftAssignment: string;
  currentShiftAssignment: string;
  upcomingShiftAssignmentData: object;
  currentShiftAssignmentData: object;
  costCenter?: string;
  nationality?: string;
  employmentStatus?: string;
  country?: string;
  currency?: string;
  licenseType?: string;
  portalAccess?: boolean;
  visaDetails?: {
    visaType?: 'Standard Employment Visa' | 'Domestic Worker Visa' | 'Green Visa';
    visaExpiryDate?: Date;
    isActive?: boolean; // Only relevant when visa details are provided
  };
  client?: string;
  isConsultancy?: boolean; // Flag for consultancy staff (no PF, 1% TDS)
  isIntern?: boolean; // Flag for intern employees (no PF, no tax, no professional tax)
  // PF (Provident Fund) related fields - individual fields (not in governmentIds)
  pfNumber?: string;
  uanNumber?: string;
  familyPfNumber?: string;
  pfJoinDate?: Date; // Optional - PF join date
  academicDetails?: IAcademicDetails[];
  experienceDetails?: IExperienceDetails[];
  /** When true and email already exists: allow create as payroll-only (same email, no login). New employee gets portalAccess: false. */
  allowDuplicateEmail?: boolean;
}

interface IUserUpdate {
  name?: string;
  email?: string;
  password?: string;
  role?: string;
  specificRole?: string;
  departmentId?: string;
  managerId?: string;
  managerName?: string;
  l2ManagerId?: string;
  l2ManagerName?: string;
  l3ManagerId?: string;
  l3ManagerName?: string;
  employeeCode?: string;
  biometricId?: string | null;
  active?: boolean;
  joiningDate?: Date;
  confirmationDate?: Date;
  probationStartDate?: Date;
  probationEndDate?: Date;
  probationDate?: Date;
  location?: string;
  phone?: string;
  emergencyContact?: {
    name?: string;
    relationship?: string;
    address?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    pincode?: number;
    mobileNo?: string;
  };
  address?: string;
  bloodGroup?: string;
  dateOfBirth?: Date;
  fatherName?: string;
  maritalStatus?: string;
  spouseName?: string;
  separationDate?: Date;
  noticePeriod?: number;
  personalMailId?: string;
  upcomingShiftAssignment?: string;
  currentShiftAssignment?: string;
  upcomingShiftAssignmentData?: object;
  currentShiftAssignmentData?: object;
  costCenter?: string;
  nationality?: string;
  employmentStatus?: string;
  bankDetails?: IBankDetails[]; // Array for multiple bank accounts
  governmentIds?: IGovernmentIds; // Separate section for identity documents
  country?: string;
  currency?: string;
  licenseType?: string;
  portalAccess?: boolean;
  visaDetails?: {
    visaType?: 'Standard Employment Visa' | 'Domestic Worker Visa' | 'Green Visa';
    visaExpiryDate?: Date;
    isActive?: boolean; // Only relevant when visa details are provided
  };
  client?: string;
  isConsultancy?: boolean; // Flag for consultancy staff (no PF, 1% TDS)
  isIntern?: boolean; // Flag for intern employees (no PF, no tax, no professional tax)
  // PF (Provident Fund) related fields - individual fields (not in governmentIds)
  pfNumber?: string;
  uanNumber?: string;
  familyPfNumber?: string;
  pfJoinDate?: Date; // Optional - PF join date
  academicDetails?: IAcademicDetails[];
  experienceDetails?: IExperienceDetails[];
}

function isTopLevelRole(role?: string) {
  const normalized = (role || '').trim().toLowerCase();
  return normalized === 'director' || normalized === 'admin' || normalized === 'superadmin';
}

interface IResignationState {
  status: 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';
  summary: string;
  remarks?: string;
  submittedAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  withdrawnAt?: Date;
  approvedBy?: Types.ObjectId;
  noticePeriodDays?: number;
  preferredLastWorkingDay?: Date;
  approvedLastWorkingDay?: Date;
  finalSettlementDone: boolean;
  isActive: boolean; // Indicates if the resignation is currently active
}

interface IResignation {
  remarks?: string;
  approvedBy?: {
    _id: string;
    name: string;
    email: string;
  };
}

interface IResignQuery {
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn' | null;
  page?: number;
  limit?: number;
}

export class UserService extends BaseService {
  protected context: RequestContext;

  constructor(context: RequestContext) {
    super(context);
    this.context = context;
  }

  private exactCaseInsensitiveRegex(value: string): RegExp {
    return new RegExp(`^${value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  }

  private getPmsReportingRoles(role?: string): string[] | null {
    return getAllowedPmsReportingRoles(role);
  }

  private async validateReportingManager(
    employeeRole: string,
    managerId: string,
    employeeId?: string,
  ) {
    if (!Types.ObjectId.isValid(managerId)) {
      throw new Error('Valid Reporting Manager is required');
    }

    if (employeeId && managerId === employeeId) {
      throw new Error('Employee cannot report to themselves');
    }

    const manager = await User.findById(managerId)
      .select('_id name role active portalAccess managerId')
      .lean();

    if (!manager) {
      throw new Error('Reporting Manager not found');
    }
    if (!manager.active) {
      throw new Error('Reporting Manager must be active');
    }
    if (manager.portalAccess === false) {
      throw new Error('Reporting Manager must have portal access');
    }

    const allowedRoles = this.getPmsReportingRoles(employeeRole);
    const normalizedManagerRole = String(manager.role || '').trim().toLowerCase();
    if (allowedRoles && !allowedRoles.includes(normalizedManagerRole)) {
      throw new Error(
        `${employeeRole} cannot report to a user with role ${manager.role}`,
      );
    }

    const visited = new Set<string>();
    let currentId: Types.ObjectId | undefined = manager._id;

    while (currentId) {
      const currentIdString = currentId.toString();
      if (employeeId && currentIdString === employeeId) {
        throw new Error('This Reporting Manager creates a circular reporting hierarchy');
      }
      if (visited.has(currentIdString)) {
        throw new Error('The selected Reporting Manager belongs to an invalid circular hierarchy');
      }
      visited.add(currentIdString);

      const current = await User.findById(currentId)
        .select('managerId')
        .lean();
      currentId = current?.managerId
        ? new Types.ObjectId(current.managerId)
        : undefined;
    }

    return manager;
  }

  private async validateMappedReviewer(
    managerId: string,
    label: 'L2 Manager' | 'L3 Manager',
    employeeId?: string,
  ) {
    if (!Types.ObjectId.isValid(managerId)) {
      throw new Error(`Valid ${label} is required`);
    }
    if (employeeId && managerId === employeeId) {
      throw new Error(`Employee cannot be their own ${label}`);
    }
    const manager = await User.findById(managerId)
      .select('_id name role active portalAccess managerId')
      .lean();
    if (!manager) throw new Error(`${label} not found`);
    if (!manager.active) throw new Error(`${label} must be active`);
    if (manager.portalAccess === false) {
      throw new Error(`${label} must have portal access`);
    }
    return manager;
  }

  async getPotentialManagers(
    role: string,
    departmentId?: string,
    employeeId?: string,
  ): Promise<any[]> {
    try {
      const normalizedRole = role.trim().toLowerCase();
      const normalizedDepartmentId = departmentId?.trim();
      const pmsReportingRoles = this.getPmsReportingRoles(normalizedRole);

      if (pmsReportingRoles) {
        if (pmsReportingRoles.length === 0) {
          return [];
        }

        const potentialManagers = await User.find({
          role: {
            $in: pmsReportingRoles.map((allowedRole) =>
              this.exactCaseInsensitiveRegex(allowedRole),
            ),
          },
          active: true,
          portalAccess: { $ne: false },
          ...(employeeId && Types.ObjectId.isValid(employeeId)
            ? { _id: { $ne: new Types.ObjectId(employeeId) } }
            : {}),
        })
          .select(
            '_id name email employeeCode role specificRole departmentId managerId managerName active portalAccess profilePicture',
          )
          .lean();

        return potentialManagers.sort((left, right) => {
          const leftSameDepartment =
            normalizedDepartmentId &&
            String(left.departmentId || '').toLowerCase() === normalizedDepartmentId.toLowerCase();
          const rightSameDepartment =
            normalizedDepartmentId &&
            String(right.departmentId || '').toLowerCase() === normalizedDepartmentId.toLowerCase();

          if (leftSameDepartment !== rightSameDepartment) {
            return leftSameDepartment ? -1 : 1;
          }
          return String(left.name || '').localeCompare(String(right.name || ''));
        });
      }

      const roleAliases =
        normalizedRole === 'staff' || normalizedRole === 'employee'
          ? ['staff', 'employee']
          : [normalizedRole];
      const roleRegexesForLookup = roleAliases.map((roleAlias) => {
        return this.exactCaseInsensitiveRegex(roleAlias);
      });
      const departmentFilter = normalizedDepartmentId
        ? {
          departmentId: {
            $regex: this.exactCaseInsensitiveRegex(normalizedDepartmentId),
          },
        }
        : {};

      // 1. Find the priority of the given role (case-insensitive).
      // PmsRolePermission can have multiple rows per role/resource/action, so
      // avoid findOne() here. Use the lowest numeric priority consistently.
      const rolePermissions = await PmsRolePermission.find({
        role: { $in: roleRegexesForLookup },
      })
        .select('role priority')
        .lean();

      const targetPriorities = rolePermissions
        .map((permission) => Number(permission.priority))
        .filter(Number.isFinite);
      
      const fetchActiveAdmins = () => User.find({
        role: { $regex: this.exactCaseInsensitiveRegex('admin') },
        active: true,
      }).select('_id name email employeeCode role profilePicture');

      // If role not found or has no priority, immediately fallback to active Admins.
      if (targetPriorities.length === 0) {
        return await fetchActiveAdmins();
      }

      const targetPriority = Math.min(...targetPriorities);

      // 2. Find all roles with a priority STRICTLY LESS THAN the target role's priority
      // (lower number = higher authority)
      const higherAuthorityRoles = await PmsRolePermission.find({
        priority: { $lt: targetPriority }
      })
        .select('role priority')
        .lean();

      // The roles in PmsRolePermission are often uppercase (e.g. "ADMIN"), 
      // but User.role is usually lowercase (e.g. "admin"). 
      let allowedRoleNames = [
        ...new Set(
          higherAuthorityRoles
            .map(r => r.role?.trim().toLowerCase())
            .filter((managerRole): managerRole is string => Boolean(managerRole) && managerRole !== normalizedRole)
        )
      ];

      // Edge case: If the role is Priority 1 (e.g. Admin), no one is < 1. 
      // We should allow Admins to manage Admins.
      if (allowedRoleNames.length === 0 && targetPriority === 1) {
        allowedRoleNames = [normalizedRole];
      }

      // 3. Query the User collection for active users with those roles
      if (allowedRoleNames.length === 0) {
        return await fetchActiveAdmins();
      }

      // Make the query case-insensitive just to be completely safe
      const roleRegexes = allowedRoleNames.map(r => this.exactCaseInsensitiveRegex(r));

      let potentialManagers = await User.find({
        role: { $in: roleRegexes },
        active: true,
        ...departmentFilter,
      }).select('_id name email employeeCode role profilePicture');

      // Fallback: If no same-department manager was found, show active admins.
      // Do not apply departmentFilter here; a new department may not have managers/admins yet.
      if (potentialManagers.length === 0) {
        potentialManagers = await fetchActiveAdmins();
      }

      return potentialManagers;
    } catch (error) {
      console.error('Error fetching potential managers', error);
      throw error;
    }
  }

  async getReviewerCandidates(employeeId?: string): Promise<any[]> {
    return User.find({
      active: true,
      portalAccess: { $ne: false },
      role: {
        $nin: [
          this.exactCaseInsensitiveRegex('trainee'),
          this.exactCaseInsensitiveRegex('staff'),
        ],
      },
      ...(employeeId && Types.ObjectId.isValid(employeeId)
        ? { _id: { $ne: new Types.ObjectId(employeeId) } }
        : {}),
    })
      .select(
        '_id name email employeeCode role specificRole departmentId active portalAccess',
      )
      .sort({ name: 1 })
      .lean();
  }

  async getReportingHierarchy(
    userId: string,
    includeSelf: boolean = false,
    maxLevels: number = 3,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error('Valid user ID is required');
    }

    const subject = await User.findById(userId)
      .select('_id role managerId l2ManagerId l3ManagerId')
      .lean();
    if (!subject) {
      throw new Error('User not found');
    }

    const hierarchy: Array<{
      level: number;
      _id: string;
      name: string;
      employeeCode?: string;
      role: string;
      specificRole?: string;
      managerId?: string;
    }> = [];
    const visited = new Set<string>();
    let currentId: Types.ObjectId | undefined = includeSelf
      ? subject._id
      : subject.managerId;
    while (currentId && hierarchy.length < maxLevels) {
      const currentIdString = currentId.toString();
      const isAllowedRepeatedL1AtL2 = Boolean(
        !includeSelf &&
        hierarchy.length === 1 &&
        subject.managerId?.toString() === currentIdString &&
        subject.l2ManagerId?.toString() === currentIdString &&
        subject.l3ManagerId &&
        hierarchy[0]?.managerId === subject.l3ManagerId.toString(),
      );
      if (visited.has(currentIdString) && !isAllowedRepeatedL1AtL2) {
        throw new Error('Circular reporting hierarchy detected');
      }
      visited.add(currentIdString);

      const current = await User.findById(currentId)
        .select('_id name employeeCode role specificRole managerId')
        .lean();
      if (!current) break;

      hierarchy.push({
        level: hierarchy.length + 1,
        _id: current._id.toString(),
        name: current.name,
        employeeCode: current.employeeCode,
        role: current.role,
        specificRole: current.specificRole,
        managerId: current.managerId?.toString(),
      });
      const explicitNextId =
        !includeSelf && hierarchy.length === 1
          ? subject.l2ManagerId
          : !includeSelf && hierarchy.length === 2
            ? subject.l3ManagerId
            : undefined;
      currentId = explicitNextId
        ? new Types.ObjectId(explicitNextId)
        : current.managerId
          ? new Types.ObjectId(current.managerId)
          : undefined;
    }

    return hierarchy;
  }

  async getUsers(query: {
    page?: number;
    limit?: number;
    my?: boolean;
    subordinates?: boolean;
    search?: string;
    nameCodeSearch?: string;
    role?: string;
    status?: string;
    active?: boolean | string;
    departmentId?: string;
    managerId?: string;
    country?: string;
    licenseType?: string;
    portalAccess?: boolean;
    isConsultancy?: boolean;
    isIntern?: boolean;
    employeeType?: 'regular' | 'trainee';
    objectiveAssignmentCandidates?: boolean | string;
    sort?: string;
    sortOrder?: 'asc' | 'desc';
    select?: string;
  }, authenticatedUser: any) {
    const {
      page = 1,
      // Use limit 1000 when role filter is specified (for dropdowns)
      // Otherwise use provided limit or default to 10
      limit: providedLimit,
      my,
      subordinates,
      search,
      nameCodeSearch,
      role,
      status,
      active,
      departmentId,
      managerId,
      country,
      licenseType,
      portalAccess,
      isConsultancy,
      isIntern,
      employeeType,
      objectiveAssignmentCandidates,
      sort = 'name',
      sortOrder = 'asc',
      select
    } = query;
    const rawActive: unknown = active;
    const normalizedActive =
      typeof rawActive === 'boolean'
        ? rawActive
        : typeof rawActive === 'string'
          ? rawActive.toLowerCase() === 'true'
            ? true
            : rawActive.toLowerCase() === 'false'
              ? false
              : undefined
          : undefined;
    const includeAllActiveStates =
      typeof rawActive === 'string' && rawActive.toLowerCase() === 'all';
    const isObjectiveAssignmentCandidateLookup =
      this.context.reqRole === 'QS' &&
      (objectiveAssignmentCandidates === true ||
        String(objectiveAssignmentCandidates).toLowerCase() === 'true');

    // Set limit to 1000 if role is specified (for dropdowns)
    // Override the default limit of 10 when role filter is used
    // If role is specified and limit is 10 (default from route schema), change it to 1000
    // If role is specified and limit is explicitly set to something else, use that
    // Otherwise use provided limit or default to 10
    let limit: number;
    if (role && !providedLimit) {
      // For role-based queries (likely dropdowns), use 1000 if no limit is provided
      limit = 1000;
    } else {
      // Otherwise use provided limit or default to 10
      limit = providedLimit || 10;
    }
    const skip = (page - 1) * limit;
    const filter: any = {};

    // Handle my filter - get current user by ID
    if (my) {
      filter._id = authenticatedUser._id;
    }
    // Handle subordinates filter
    else if (subordinates) {
      // Check if the authenticated user is a manager
      if (authenticatedUser.role.toLowerCase() === 'manager') {
        // Get all subordinate IDs recursively (staff + external users)
        const allSubordinateIds = await getSubordinateUserIds(authenticatedUser._id);

        if (allSubordinateIds.length > 0) {
          filter._id = { $in: allSubordinateIds };
        } else {
          // No subordinates found, return empty result
          filter._id = null;
        }
      } else {
        // For non-managers, get direct subordinates only
        filter.managerId = authenticatedUser._id;
      }
      if (typeof normalizedActive === 'boolean') {
        filter.active = normalizedActive;
      } else if (!includeAllActiveStates) {
        filter.active = true;
      }
    } else {
      // Apply role-based access control
      if (this.context.reqRole === 'MANAGER') {
        filter.managerId = this.context.user?._id;
      } else if (
        !isObjectiveAssignmentCandidateLookup &&
        !['ADMIN', 'HR', 'MANAGEMENT', 'DIRECTOR'].includes(this.context.reqRole)
      ) {
        filter._id = this.context.user?._id;
      }
    }

    // Objective-assignment candidate search is intentionally isolated from the
    // shared user-list search so existing screens keep their current behavior.
    if (nameCodeSearch) {
      const escapedNameCodeSearch = nameCodeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedNameCodeSearch, $options: 'i' } },
        { employeeCode: { $regex: escapedNameCodeSearch, $options: 'i' } },
      ];
    } else if (search) {
      // Escape special regex characters in search string
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const searchConditions: any[] = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { role: { $regex: escapedSearch, $options: 'i' } },
        { specificRole: { $regex: escapedSearch, $options: 'i' } },
        { licenseType: { $regex: escapedSearch, $options: 'i' } },
      ];

      // Search active status - handle common status terms
      const searchLower = search.toLowerCase();
      if (searchLower === 'active' || searchLower === 'true' || searchLower === '1') {
        searchConditions.push({ active: true });
      } else if (searchLower === 'inactive' || searchLower === 'false' || searchLower === '0' || searchLower === 'on hold' || searchLower === 'resigned') {
        searchConditions.push({ active: false });
      } else {
        // For partial matches, check if search contains status-related terms
        if (searchLower.includes('active') || searchLower.includes('true')) {
          searchConditions.push({ active: true });
        } else if (searchLower.includes('inactive') || searchLower.includes('false') || searchLower.includes('hold') || searchLower.includes('resign')) {
          searchConditions.push({ active: false });
        }
      }

      // Search departments by name in LOV collection
      try {
        const departmentLOV = await LOV.findOne({ type: 'department' }).lean();
        if (departmentLOV && departmentLOV.values) {
          // Use original search (not escaped) for simple string matching
          const matchingDepartments = departmentLOV.values.filter(
            (dept: any) =>
              dept.isActive !== false &&
              dept.label &&
              dept.label.toLowerCase().includes(searchLower)
          );

          if (matchingDepartments.length > 0) {
            const departmentIds = matchingDepartments.map((dept: any) => dept.value);
            searchConditions.push({ departmentId: { $in: departmentIds } });
          }
        }
      } catch (error) {
        console.error('Error searching departments:', error);
        // Continue without department search if there's an error
      }

      filter.$or = searchConditions;
    }

    if (role) {
      filter.role = { $regex: this.exactCaseInsensitiveRegex(role) };
    }

    // Handle active filter - direct boolean (takes precedence over status)
    if (typeof normalizedActive === 'boolean') {
      filter.active = normalizedActive;
    } else if (status) {
      // Fallback to status enum if active is not provided
      filter.active = status === 'active';
    }

    if (departmentId) {
      filter.departmentId = { $regex: this.exactCaseInsensitiveRegex(departmentId) };
    }

    if (managerId) {
      filter.managerId = managerId;
    }

    if (country) {
      filter.country = country;
    }

    if (licenseType) {
      filter.licenseType = licenseType;
    }

    if (typeof portalAccess === 'boolean') {
      filter.portalAccess = portalAccess;
    }

    if (typeof isConsultancy === 'boolean') {
      filter.isConsultancy = isConsultancy;
    }

    if (typeof isIntern === 'boolean') {
      filter.isIntern = isIntern;
    }

    if (employeeType === 'trainee') {
      filter.role = { $regex: this.exactCaseInsensitiveRegex('trainee') };
    } else if (employeeType === 'regular') {
      filter.$and = [
        ...(filter.$and || []),
        { role: { $not: this.exactCaseInsensitiveRegex('trainee') } },
      ];
    }

    // Build sort object
    const sortObj: any = {};
    sortObj[sort] = sortOrder === 'desc' ? -1 : 1;

    // Build select string
    const selectFields = (select || 'name email role specificRole departmentId active joiningDate probationStartDate probationEndDate probationDate managerId managerName l2ManagerId l2ManagerName l3ManagerId l3ManagerName employeeCode checkinId biometricId location phone emergencyContact address bloodGroup upcomingShiftAssignmentData currentShiftAssignmentData upcomingShiftAssignment currentShiftAssignment dateOfBirth holidayCalendarId holidayCalendarHistory weekendId createdAt updatedAt country currency licenseType portalAccess visaDetails isConsultancy isIntern')
      .replace(/,/g, ' ');

    console.log('Unified getUsers query:', { filter, page, limit, sort: sortObj, select: selectFields });

    const [users, total] = await Promise.all([
      User.find(filter)
        .select(selectFields)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return {
      users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async find(query: {
    page?: number;
    limit?: number;
    search?: string;
    active?: boolean;
    role?: string;
    departmentId?: string;
    reportingToId?: string;
    id?: string;
    sort?: string;
    select?: string;
  }) {
    const {
      page = 1,
      limit = 10,
      search,
      active,
      role,
      departmentId,
      reportingToId,
      id,
      sort = 'name',
      select = 'name email role specificRole departmentId active joiningDate managerId managerName l2ManagerId l2ManagerName l3ManagerId l3ManagerName employeeCode checkinId biometricId location phone emergencyContact address bloodGroup upcomingShiftAssignmentData currentShiftAssignmentData upcomingShiftAssignment currentShiftAssignment dateOfBirth holidayCalendarId holidayCalendarHistory weekendId createdAt updatedAt visaDetails',
    } = query;

    const skip = (page - 1) * limit;
    const filter: any = {};

    if (typeof active === 'boolean') {
      filter.active = active;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      filter.role = { $regex: this.exactCaseInsensitiveRegex(role) };
    }

    if (departmentId) {
      filter.departmentId = { $regex: this.exactCaseInsensitiveRegex(departmentId) };
    }

    if (reportingToId) {
      filter.managerId = reportingToId;
    }

    if (id) {
      filter._id = id;
    }

    if (this.context.reqRole === 'MANAGER') {
      filter.managerId = this.context.user?._id;
    } else if (!['ADMIN', 'HR'].includes(this.context.reqRole)) {
      filter._id = this.context.user?._id;
    }

    console.log('Dynamic find query:', { filter, page, limit, sort, select });

    let dbQuery = User.find(filter)
      .select(select)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    if (id) {
      const user = await dbQuery.findOne();
      console.log('Raw user data:', JSON.stringify(user, null, 2));
      return user;
    }

    const [users, total] = await Promise.all([
      dbQuery,
      User.countDocuments(filter),
    ]);

    return {
      users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findUserByPan(pan: string) {
    // Case-insensitive search for PAN
    return User.findOne({ 'governmentIds.pan.number': new RegExp(`^${pan}$`, 'i') }).lean();
  }

  async adminFindUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    month?: string; // '2025-05'
    departmentId?: string;
    role?: string;
    status?: ('Active' | 'On Hold' | 'Resigned')[] | string;
    active?: boolean;
    country?: 'AE' | 'IN';
  }) {
    const { page = 1, limit = 10, search, month, departmentId, role, status, active, country } = query;
    const skip = (page - 1) * limit;
    const andConditions: any[] = [];

    // 1. Search filter with escaped regex and word boundaries
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Prioritize matches that start at a word boundary for better UX
      const searchRegex = new RegExp(`(^|\\s|\\.|_)${escapedSearch}`, 'i');

      andConditions.push({
        $or: [
          { name: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
          { employeeCode: { $regex: searchRegex } },
          // Keep broad search as fallback if word boundary doesn't match?
          // Actually, let's keep it simple: word boundary + name/email/code
        ],
      });
    }

    // 2. Month filter on joiningDate
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      // Last day of the requested month
      const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);
      andConditions.push({
        joiningDate: { $lte: monthEnd },
      });
    }

    // 3. Department filter
    if (departmentId) {
      andConditions.push({ departmentId: { $regex: this.exactCaseInsensitiveRegex(departmentId) } });
    }

    // 4. Role filter
    if (role) {
      andConditions.push({ role: { $regex: this.exactCaseInsensitiveRegex(role) } });
    }

    // 5. Country filter
    if (country) {
      andConditions.push({ country });
    }

    // 6. Active filter (direct boolean filter)
    if (typeof active === 'boolean') {
      andConditions.push({ active });
    }

    // 7. Status filter (handle both array and single string)
    const statusArray = Array.isArray(status) ? status : (status ? [status] : []);
    if (statusArray.length > 0) {
      const statusFilters: any[] = [];

      if (statusArray.includes('Active' as any)) {
        statusFilters.push({ active: true });
      }

      if (statusArray.includes('On Hold' as any)) {
        statusFilters.push({
          active: true,
          resignations: {
            $elemMatch: {
              status: 'Pending',
              isActive: true,
            },
          },
        });
      }

      if (statusArray.includes('Resigned' as any)) {
        statusFilters.push({
          resignations: {
            $elemMatch: {
              status: 'Approved',
              isActive: true,
            },
          },
        });
      }

      if (statusFilters.length > 0) {
        andConditions.push({ $or: statusFilters });
      }
    }

    // Final query
    const finalQuery = andConditions.length > 0 ? { $and: andConditions } : {};

    console.log('Payroll adminFindUsers Filter:', JSON.stringify(finalQuery, null, 2));

    // Fetch users and count with explicit sorting
    const [users, total] = await Promise.all([
      User.find(finalQuery)
        .sort({ name: 1 }) // Always sort by name for predictable payroll management
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(finalQuery),
    ]);

    return {
      users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }


  async findAll(query: { page?: number; limit?: number; search?: string; active?: boolean }) {
    const { page = 1, limit = 10, search, active } = query;
    const skip = (page - 1) * limit;
    console.log("findAll query", query);
    const filter: any = {};
    if (typeof active === 'boolean') {
      filter.active = active;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (this.context.reqRole === 'MANAGER') {
      filter.managerId = this.context.user?._id;
    } else if (!['ADMIN', 'HR'].includes(this.context.reqRole)) {
      filter._id = this.context.user?._id;
    }
    const [users, total] = await Promise.all([
      User.find(filter).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    console.log('0.users', users);
    return {
      users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const user = await User.findById(id);
    console.log('User data retrieved:', user?._id);
    return user;
  }

  async findByRole(role: string) {
    return User.find({ role: { $regex: this.exactCaseInsensitiveRegex(role) } });
  }



  async findByRoleAndDepartment(query: {
    role?: string;
    departmentId?: string;
    page?: number;
    limit?: number;
    active?: boolean;
  }) {
    const { role, departmentId, active = true } = query;

    console.log('findByRoleAndDepartment', query);
    // Build filter
    const filter: any = { active };
    if (role) filter.role = { $regex: this.exactCaseInsensitiveRegex(role) };
    if (departmentId) filter.departmentId = { $regex: this.exactCaseInsensitiveRegex(departmentId) };

    // Execute queries in parallel
    const users = await User.find(filter)
      .select('name email role specificRole departmentId active joiningDate nationality employmentStatus ')
      .sort({ name: 1 });

    return users;
  }

  async findByReportingToId(reportingToId: string, page: number = 1, limit: number = 10, includeHierarchy: boolean = false): Promise<any> {
    const skip = (page - 1) * limit;

    let filter: any = { active: true };
    let total: number;

    if (includeHierarchy) {
      // Get the manager's role to determine if we should include hierarchy
      const manager = await User.findById(reportingToId).select('role').lean();

      if (manager?.role.toLowerCase() === 'manager') {
        // Get all subordinate IDs recursively (staff + external users)
        const allSubordinateIds = await getSubordinateUserIds(reportingToId);

        if (allSubordinateIds.length > 0) {
          filter._id = { $in: allSubordinateIds };
        } else {
          // No subordinates found, return empty result
          filter._id = null;
        }
        total = await User.countDocuments(filter);
      } else {
        // For non-managers, get direct subordinates only
        filter.managerId = reportingToId;
        total = await User.countDocuments(filter);
      }
    } else {
      // Original behavior - direct subordinates only
      filter.managerId = reportingToId;
      total = await User.countDocuments(filter);
    }

    // Query the database to find users
    const users = await User
      .find(filter)
      .select('_id name email role specificRole departmentId active managerId managerName employeeCode nationality employmentStatus')
      .skip(skip)
      .limit(limit)
      .lean();

    console.log(reportingToId, 'reportingToId');
    console.log(users, 'users found');
    console.log(total, 'total count');

    // Prepare metadata
    const meta = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };

    return { users, meta };
  }

  /**
   * Get all team members for a manager including hierarchical subordinates
   * @param managerId - The ID of the manager
   * @param query - Query parameters
   * @returns All team members including staff and external users
   */
  async getManagerTeamMembers(managerId: string, query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
    departmentId?: string;
    sort?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<any> {
    const {
      page = 1,
      limit = 10,
      search,
      role,
      status,
      departmentId,
      sort = 'name',
      sortOrder = 'asc'
    } = query;

    const skip = (page - 1) * limit;

    // Verify the user is actually a manager
    const manager = await User.findById(managerId).select('role').lean();
    if (!manager || manager.role.toLowerCase() !== 'manager') {
      throw new Error('User is not a manager');
    }

    // Get all subordinate IDs recursively
    const allSubordinateIds = await getSubordinateUserIds(managerId);

    if (allSubordinateIds.length === 0) {
      return {
        users: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    // Build filter
    const filter: any = {
      _id: { $in: allSubordinateIds },
      active: true
    };

    // Apply additional filters
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      filter.role = { $regex: this.exactCaseInsensitiveRegex(role) };
    }

    if (status) {
      filter.active = status === 'active';
    }

    if (departmentId) {
      filter.departmentId = { $regex: this.exactCaseInsensitiveRegex(departmentId) };
    }

    // Build sort object
    const sortObj: any = {};
    sortObj[sort] = sortOrder === 'desc' ? -1 : 1;

    // Execute queries
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('name email role specificRole departmentId active joiningDate probationStartDate probationEndDate probationDate managerId managerName employeeCode checkinId biometricId location phone emergencyContact address bloodGroup upcomingShiftAssignmentData currentShiftAssignmentData upcomingShiftAssignment currentShiftAssignment dateOfBirth holidayCalendarId weekendId createdAt updatedAt nationality employmentStatus country currency licenseType portalAccess')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return {
      users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(data: IUserCreate) {
    console.log('🔧 UserService.create() called');
    console.log('📦 Input data:', JSON.stringify(data, null, 2));
    console.log('📋 Data type:', typeof data);
    console.log('📋 Data keys:', Object.keys(data || {}));

    if (
      !['ADMIN', 'HR'].includes(this.context.reqRole) &&
      (data.l2ManagerId !== undefined || data.l3ManagerId !== undefined)
    ) {
      throw new Error('Only HR/Admin can manage L2 and L3 mappings');
    }

    // Validate required fields
    if (!isTopLevelRole(data.role) && !data.managerId) {
      throw new Error('Manager ID is required');
    }
    if (isTopLevelRole(data.role)) {
      delete data.managerId;
      delete data.managerName;
      delete data.l2ManagerId;
      delete data.l2ManagerName;
      delete data.l3ManagerId;
      delete data.l3ManagerName;
    } else if (data.managerId) {
      const reportingManager = await this.validateReportingManager(data.role, data.managerId);
      const l2Manager = !isDirectorRole(reportingManager.role) && data.l2ManagerId
        ? await this.validateMappedReviewer(data.l2ManagerId, 'L2 Manager')
        : undefined;
      const canonicalMapping = canonicalizeTerminalDirectorMapping({
        managerId: data.managerId,
        managerRole: reportingManager.role,
        l2ManagerId: data.l2ManagerId,
        l2ManagerRole: l2Manager?.role,
        l3ManagerId: data.l3ManagerId,
      });

      if (!canonicalMapping.l2ManagerId) {
        delete data.l2ManagerId;
        delete data.l2ManagerName;
      }
      if (!canonicalMapping.l3ManagerId) {
        delete data.l3ManagerId;
        delete data.l3ManagerName;
      }

      let l3Manager: { role?: string } | undefined;
      if (canonicalMapping.l3ManagerId) {
        if (String(data.role || '').trim().toLowerCase() === 'trainee') {
          delete data.l3ManagerId;
          delete data.l3ManagerName;
        } else {
          l3Manager = await this.validateMappedReviewer(
            canonicalMapping.l3ManagerId,
            'L3 Manager',
          );
          if (!isDirectorRole(l3Manager.role)) {
            throw new Error('L3 Manager must have the Director role');
          }
        }
      }

      const effectiveL3ManagerId =
        String(data.role || '').trim().toLowerCase() === 'trainee'
          ? undefined
          : canonicalMapping.l3ManagerId;
      const mappedIds = [
        canonicalMapping.managerId,
        canonicalMapping.l2ManagerId,
        effectiveL3ManagerId,
      ].filter(Boolean);
      const repeatedL1AtL2IsAllowed = isAllowedRepeatedL1AtL2({
        managerId: canonicalMapping.managerId,
        l2ManagerId: canonicalMapping.l2ManagerId,
        l3ManagerId: effectiveL3ManagerId,
        reportingManagerId: reportingManager.managerId?.toString(),
        l3ManagerRole: l3Manager?.role,
      });
      if (
        new Set(mappedIds).size !== mappedIds.length &&
        !repeatedL1AtL2IsAllowed
      ) {
        throw new Error(
          'Reporting Manager, L2 Manager, and L3 Manager must be different unless L1 repeats at L2 and reports directly to the L3 Director',
        );
      }
    }
    if (!data.joiningDate) {
      throw new Error('Joining date is required');
    }


    // Validate employeeCode uniqueness before creating
    if (data.employeeCode) {
      const existingUser = await User.findOne({ employeeCode: data.employeeCode });
      if (existingUser) {
        throw new Error(`Employee code "${data.employeeCode}" already exists. Please use a unique employee code.`);
      }
    }

    // Duplicate email (allowDuplicateEmail): (1) duplicate email found + (2) allowDuplicateEmail === true → allow create as payroll-only (portalAccess: false, no login; override attendance + payroll). Otherwise reject duplicate. Scenarios: login=portalAccess true only; forgotPassword=portalAccess true; welcome email=portalAccess true; payroll list=active only; attendance override=by userId; update email=unique among portalAccess true.
    const allowDuplicateEmail = data.allowDuplicateEmail === true;
    const emailNorm = data.email?.toLowerCase().trim();
    if (data.email && emailNorm) {
      const existingWithEmail = await User.findOne({ email: emailNorm });
      if (existingWithEmail) {
        if (allowDuplicateEmail) {
          // Condition 1 + 2: duplicate email and boolean yes → allow create; new employee = payroll-only (no login), override attendance, generate payroll.
          (data as any).portalAccess = false;
          console.log(`[Create] allowDuplicateEmail=true and duplicate email found: creating payroll-only employee (portalAccess=false, no login).`);
        } else {
          throw new Error(`Email "${data.email}" already exists. Please use a different email.`);
        }
      } else {
        // No duplicate: normal employee process. Enforce only one portal user per email.
        if (!allowDuplicateEmail) {
          // Treat missing portalAccess as portal (existing users); only one "portal" user per email.
          const existingPortalUser = await User.findOne({ email: emailNorm, portalAccess: { $ne: false } });
          if (existingPortalUser) {
            throw new Error(`Email "${data.email}" already exists for a user with portal access.`);
          }
        }
      }
    }
    // Do not persist allowDuplicateEmail to DB
    delete (data as any).allowDuplicateEmail;

    // ✅ FIX: Handle biometricId to prevent duplicate key error
    // For UAE and India users, don't set biometricId at all (undefined) to avoid sparse index issues
    if (data.country === 'AE' || data.country === 'IN') {
      // UAE and India users don't use biometric systems, so remove the field entirely
      delete (data as any).biometricId;
      console.log(`🔄 Service: Removed biometricId for ${data.country === 'AE' ? 'UAE' : 'India'} user (country: ${data.country})`);
    } else {
      // For non-UAE/India users, handle empty biometricId as before
      if (data.biometricId === '' || data.biometricId === null || data.biometricId === undefined) {
        (data as any).biometricId = null;
        console.log('🔄 Service: Converted empty biometricId to null for non-UAE/India user');
      } else if (typeof data.biometricId === 'string' && data.biometricId.trim() === '') {
        (data as any).biometricId = null;
        console.log('🔄 Service: Converted whitespace-only biometricId to null for non-UAE/India user');
      }
    }

    // ✅ FIX: Handle emergencyContact - validate and transform
    if (data.emergencyContact !== undefined) {
      // If emergencyContact is a primitive (string/number), assume it's a mobile number
      if (typeof data.emergencyContact === 'string' || typeof data.emergencyContact === 'number') {
        const mobileNo = String(data.emergencyContact).trim();
        if (mobileNo) {
          // Transform primitive value to proper object structure
          (data as any).emergencyContact = {
            mobileNo: mobileNo
          };
          console.log('🔄 Service Create: Converted primitive emergencyContact to object with mobileNo:', mobileNo);
        } else {
          // Empty string/number - explicitly set to undefined to remove it
          (data as any).emergencyContact = undefined;
          console.log('🔄 Service Create: Set empty primitive emergencyContact to undefined');
        }
      }
      // If emergencyContact is an object, check if it's empty
      else if (typeof data.emergencyContact === 'object' && data.emergencyContact !== null) {
        const hasAnyValue = Object.values(data.emergencyContact).some(
          value => value !== null && value !== undefined && value !== ''
        );
        if (!hasAnyValue) {
          // Empty object - explicitly set to undefined to remove it
          (data as any).emergencyContact = undefined;
          console.log('🔄 Service Create: Set empty emergencyContact object to undefined');
        }
      }
      // If emergencyContact is null, set to undefined
      else if (data.emergencyContact === null) {
        (data as any).emergencyContact = undefined;
        console.log('🔄 Service Create: Set null emergencyContact to undefined');
      }
    }

    // Log required fields specifically
    console.log('🔍 Required fields check:');
    console.log('  - name:', data.name, '(required:', !!data.name, ')');
    console.log('  - email:', data.email, '(required:', !!data.email, ')');
    console.log('  - password:', data.password ? '[HIDDEN]' : 'undefined', '(required:', !!data.password, ')');
    console.log('  - role:', data.role, '(required:', !!data.role, ')');
    console.log('  - departmentId:', data.departmentId, '(required:', !!data.departmentId, ')');
    console.log('  - biometricId:', data.biometricId, '(converted to null if empty)');
    console.log('  - upcomingShiftAssignment:', data.upcomingShiftAssignment, '(required:', !!data.upcomingShiftAssignment, ')');
    console.log('  - currentShiftAssignment:', data.currentShiftAssignment, '(required:', !!data.currentShiftAssignment, ')');
    console.log('  - upcomingShiftAssignmentData:', data.upcomingShiftAssignmentData, '(required:', !!data.upcomingShiftAssignmentData, ')');
    console.log('  - currentShiftAssignmentData:', data.currentShiftAssignmentData, '(required:', !!data.currentShiftAssignmentData, ')');

    console.log('🎯 Creating new User instance...');
    // Store plain password before hashing (for email notification if it's default password)
    const plainPassword = data.password === '123456' ? data.password : undefined;

    const addOneYear = (value?: Date) => {
      const date = value ? new Date(value) : undefined;
      if (!date || Number.isNaN(date.getTime())) return value;
      date.setFullYear(date.getFullYear() + 1);
      return date;
    };

    const isProbationStatus =
      String((data as any).employmentStatus || '').trim().toLowerCase() === 'probation';
    const probationStartDate = isProbationStatus
      ? (data as any).probationStartDate || data.joiningDate || undefined
      : undefined;
    const probationEndDate =
      isProbationStatus
        ? (data as any).probationEndDate ||
          (data as any).probationDate ||
          addOneYear(probationStartDate) ||
          data.joiningDate ||
          undefined
        : undefined;

    // Set default confirmationDate and probation dates if not provided (optional fields)
    const userDataWithDefaults = {
      ...data,
      confirmationDate: (data as any).confirmationDate || data.joiningDate || undefined,
      probationStartDate,
      probationEndDate,
      probationDate: probationEndDate,
    };

    const user = new User(userDataWithDefaults);
    console.log('✅ User instance created:', user._id);

    console.log('💾 Saving user to database...');
    let savedUser;
    try {
      savedUser = await user.save();
    } catch (err: any) {
      if (err.code === 11000 && err.message?.includes('email') && allowDuplicateEmail) {
        throw new Error('Duplicate email not allowed by database. Run once: npm run db:allow-duplicate-email then restart app to allow payroll-only employee with same email.');
      }
      throw err;
    }
    console.log('✅ User saved successfully:', savedUser._id);

    // Only send welcome email for active users with portal access (payroll-only duplicate-email users do not get login email)
    if (savedUser.active && savedUser.portalAccess) {
      console.log('📧 Sending welcome email...');
      await this.sendWelcomeEmail(savedUser, plainPassword);
      console.log('✅ Welcome email sent');
    } else {
      console.log('⏭️ Skipping welcome email for inactive or payroll-only user');
    }

    console.log('🎉 User creation completed successfully');
    return savedUser;
  }

  async update(id: string, data: IUserUpdate) {
    console.log('📝 [User Update] Update request received');
    console.log('📦 Update data:', JSON.stringify(data, null, 2));
    console.log('🔍 Active field in update data:', data.active, '(type:', typeof data.active, ')');
    console.log('🔍 EmergencyContact in update data:', data.emergencyContact, '(type:', typeof data.emergencyContact, ')');
    console.log('🆔 User ID:', id);

    if (!['ADMIN', 'HR'].includes(this.context.reqRole)) {
      delete data.l2ManagerId;
      delete data.l2ManagerName;
      delete data.l3ManagerId;
      delete data.l3ManagerName;
    }

    const user = await User.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    console.log('👤 Current user active status:', user.active);

    // Allow employees to edit all fields on their own profile
    // No restrictions for self-edits - employees can update any field on their own profile
    // All field restrictions have been removed - employees can edit everything on their own profile

    // Validate required fields if being updated
    const nextRole = data.role ?? user.role;
    const roleChanged =
      data.role !== undefined &&
      String(data.role).trim().toLowerCase() !== String(user.role).trim().toLowerCase();
    const managerChanged =
      data.managerId !== undefined &&
      data.managerId !== user.managerId?.toString();
    const nextManagerId =
      data.managerId !== undefined
        ? data.managerId
        : user.managerId?.toString();
    if (!isTopLevelRole(nextRole) && !nextManagerId) {
      throw new Error('Manager ID is required');
    }
    if (isTopLevelRole(nextRole)) {
      delete data.managerId;
      delete data.managerName;
      delete data.l2ManagerId;
      delete data.l2ManagerName;
      delete data.l3ManagerId;
      delete data.l3ManagerName;
      user.managerId = undefined;
      user.managerName = undefined;
      user.l2ManagerId = undefined;
      user.l2ManagerName = undefined;
      user.l3ManagerId = undefined;
      user.l3ManagerName = undefined;
    }
    if (!isTopLevelRole(nextRole)) {
      const hierarchyMappingChanged =
        roleChanged ||
        managerChanged ||
        data.l2ManagerId !== undefined ||
        data.l3ManagerId !== undefined;

      if (hierarchyMappingChanged && nextManagerId) {
        const reportingManager = await this.validateReportingManager(nextRole, nextManagerId, id);
        data.managerId = nextManagerId;

        const nextL2ManagerId = data.l2ManagerId !== undefined
          ? data.l2ManagerId || undefined
          : user.l2ManagerId?.toString();
        const nextL3ManagerId = data.l3ManagerId !== undefined
          ? data.l3ManagerId || undefined
          : user.l3ManagerId?.toString();
        const l2Manager = !isDirectorRole(reportingManager.role) && nextL2ManagerId
          ? await this.validateMappedReviewer(nextL2ManagerId, 'L2 Manager', id)
          : undefined;
        const canonicalMapping = canonicalizeTerminalDirectorMapping({
          managerId: nextManagerId,
          managerRole: reportingManager.role,
          l2ManagerId: nextL2ManagerId,
          l2ManagerRole: l2Manager?.role,
          l3ManagerId: nextL3ManagerId,
        });

        if (!canonicalMapping.l2ManagerId) {
          user.l2ManagerId = undefined;
          user.l2ManagerName = undefined;
          delete data.l2ManagerId;
          delete data.l2ManagerName;
        } else {
          data.l2ManagerId = canonicalMapping.l2ManagerId;
        }

        let l3Manager: { role?: string } | undefined;
        if (
          String(nextRole || '').trim().toLowerCase() === 'trainee' ||
          !canonicalMapping.l3ManagerId
        ) {
          user.l3ManagerId = undefined;
          user.l3ManagerName = undefined;
          delete data.l3ManagerId;
          delete data.l3ManagerName;
        } else {
          l3Manager = await this.validateMappedReviewer(
            canonicalMapping.l3ManagerId,
            'L3 Manager',
            id,
          );
          if (!isDirectorRole(l3Manager.role)) {
            throw new Error('L3 Manager must have the Director role');
          }
          data.l3ManagerId = canonicalMapping.l3ManagerId;
        }

        const mappedIds = [
          canonicalMapping.managerId,
          canonicalMapping.l2ManagerId,
          String(nextRole || '').trim().toLowerCase() === 'trainee'
            ? undefined
            : canonicalMapping.l3ManagerId,
        ].filter(Boolean);
        const repeatedL1AtL2IsAllowed = isAllowedRepeatedL1AtL2({
          managerId: canonicalMapping.managerId,
          l2ManagerId: canonicalMapping.l2ManagerId,
          l3ManagerId:
            String(nextRole || '').trim().toLowerCase() === 'trainee'
              ? undefined
              : canonicalMapping.l3ManagerId,
          reportingManagerId: reportingManager.managerId?.toString(),
          l3ManagerRole: l3Manager?.role,
        });
        if (
          new Set(mappedIds).size !== mappedIds.length &&
          !repeatedL1AtL2IsAllowed
        ) {
          throw new Error(
            'Reporting Manager, L2 Manager, and L3 Manager must be different unless L1 repeats at L2 and reports directly to the L3 Director',
          );
        }
      }
    }
    if (data.joiningDate !== undefined && !data.joiningDate) {
      throw new Error('Joining date is required');
    }


    // Validate employeeCode uniqueness if it's being updated
    if (data.employeeCode && data.employeeCode !== user.employeeCode) {
      const existingUser = await User.findOne({
        employeeCode: data.employeeCode,
        _id: { $ne: id }
      });
      if (existingUser) {
        throw new Error(`Employee code "${data.employeeCode}" already exists. Please use a unique employee code.`);
      }
    }

    // Allow active field to be updated
    // Log the active field update for tracking
    if (data.active !== undefined) {
      console.log(`🔄 [User Update] Updating active field from ${user.active} to ${data.active}`);
    }

    // Validate email uniqueness when user has portal access. Payroll-only (portalAccess: false) can share email.
    const willHavePortalAccess = data.portalAccess !== undefined ? data.portalAccess : user.portalAccess;
    if (willHavePortalAccess && data.email && data.email.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
      // Treat missing portalAccess as portal (existing users); only one "portal" user per email.
      const existingPortalUser = await User.findOne({
        email: data.email.toLowerCase().trim(),
        portalAccess: { $ne: false },
        _id: { $ne: id }
      });
      if (existingPortalUser) {
        throw new Error(`Email "${data.email}" already exists for a user with portal access.`);
      }
    }

    // ✅ FIX: Handle biometricId to prevent duplicate key error
    // For UAE and India users, don't set biometricId at all (undefined) to avoid sparse index issues
    // Check if country is being updated to IN/AE, or if user already has country IN/AE
    const targetCountry = data.country || user.country;
    if (targetCountry === 'AE' || targetCountry === 'IN') {
      // UAE and India users don't use biometric systems, so remove the field entirely
      delete (data as any).biometricId;
      // Also remove from existing user if it exists - set to undefined so Mongoose will unset it
      (user as any).biometricId = undefined;
      console.log(`🔄 Service Update: Removed biometricId for ${targetCountry === 'AE' ? 'UAE' : 'India'} user (country: ${targetCountry})`);
    } else {
      // For non-UAE/India users, handle empty biometricId as before
      if (data.biometricId === '' || data.biometricId === null || data.biometricId === undefined) {
        (data as any).biometricId = null;
        console.log('🔄 Service Update: Converted empty biometricId to null for non-UAE/India user');
      } else if (typeof data.biometricId === 'string' && data.biometricId.trim() === '') {
        (data as any).biometricId = null;
        console.log('🔄 Service Update: Converted whitespace-only biometricId to null for non-UAE/India user');
      }
    }

    // ✅ FIX: Handle emergencyContact - validate and transform
    if (data.emergencyContact !== undefined) {
      // If emergencyContact is a primitive (string/number), assume it's a mobile number
      if (typeof data.emergencyContact === 'string' || typeof data.emergencyContact === 'number') {
        const mobileNo = String(data.emergencyContact).trim();
        if (mobileNo) {
          // Transform primitive value to proper object structure
          (data as any).emergencyContact = {
            mobileNo: mobileNo
          };
          console.log('🔄 Service Update: Converted primitive emergencyContact to object with mobileNo:', mobileNo);
        } else {
          // Empty string/number - explicitly set to undefined to remove it
          (data as any).emergencyContact = undefined;
          console.log('🔄 Service Update: Set empty primitive emergencyContact to undefined');
        }
      }
      // If emergencyContact is an object, check if it's empty
      else if (typeof data.emergencyContact === 'object' && data.emergencyContact !== null) {
        const hasAnyValue = Object.values(data.emergencyContact).some(
          value => value !== null && value !== undefined && value !== ''
        );
        if (!hasAnyValue) {
          // Empty object - explicitly set to undefined to remove it
          (data as any).emergencyContact = undefined;
          console.log('🔄 Service Update: Set empty emergencyContact object to undefined');
        }
      }
      // If emergencyContact is null, set to undefined
      else if (data.emergencyContact === null) {
        (data as any).emergencyContact = undefined;
        console.log('🔄 Service Update: Set null emergencyContact to undefined');
      }
    }

    // ✅ FIX: Check if existing user has primitive emergencyContact that needs to be cleared
    // This must happen BEFORE Object.assign to ensure the primitive value is cleared
    if (user.emergencyContact && (typeof user.emergencyContact === 'string' || typeof user.emergencyContact === 'number')) {
      console.log('⚠️ Service Update: Existing user has primitive emergencyContact:', user.emergencyContact, '(type:', typeof user.emergencyContact, ')');
      // If we're clearing it (undefined) or not updating it, explicitly set to undefined
      if (data.emergencyContact === undefined || (data.emergencyContact && typeof data.emergencyContact === 'object')) {
        (user as any).emergencyContact = undefined;
        console.log('🔄 Service Update: Cleared existing primitive emergencyContact from user object');
      }
    }

    // Log before assignment
    console.log('🔄 [User Update] Before Object.assign - user.active:', user.active);
    console.log('🔄 [User Update] data.active:', data.active);
    console.log('🔄 [User Update] Before Object.assign - user.emergencyContact:', user.emergencyContact, '(type:', typeof user.emergencyContact, ')');
    console.log('🔄 [User Update] Before Object.assign - data.emergencyContact:', data.emergencyContact, '(type:', typeof data.emergencyContact, ')');

    const nextEmploymentStatus =
      data.employmentStatus !== undefined ? data.employmentStatus : user.employmentStatus;
    const updatingToNonProbation =
      data.employmentStatus !== undefined &&
      String(nextEmploymentStatus || '').trim().toLowerCase() !== 'probation';

    if (updatingToNonProbation) {
      (data as any).probationStartDate = null;
      (data as any).probationEndDate = null;
      (data as any).probationDate = null;
    } else if ((data as any).probationEndDate !== undefined && (data as any).probationDate === undefined) {
      (data as any).probationDate = (data as any).probationEndDate;
    } else if ((data as any).probationDate !== undefined && (data as any).probationEndDate === undefined) {
      (data as any).probationEndDate = (data as any).probationDate;
    }

    Object.assign(user, data);

    console.log('🔄 [User Update] After Object.assign - user.emergencyContact:', user.emergencyContact, '(type:', typeof user.emergencyContact, ')');

    // ✅ FIX: If emergencyContact is undefined and user still has a primitive value, explicitly unset it
    if (data.emergencyContact === undefined && user.emergencyContact && (typeof user.emergencyContact === 'string' || typeof user.emergencyContact === 'number')) {
      (user as any).emergencyContact = undefined;
      // Use Mongoose's markModified to ensure the field is properly unset
      user.markModified('emergencyContact');
      console.log('🔄 Service Update: Force cleared primitive emergencyContact after Object.assign');
    }

    // Log after assignment
    console.log('✅ [User Update] After Object.assign - user.active:', user.active);

    const savedUser = await user.save();
    console.log('💾 [User Update] After save - savedUser.active:', savedUser.active);
    return savedUser;
  }

  async delete(id: string) {
    const user = await User.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    user.active = false;
    return user.save();
  }

  async updateFcmToken(id: string, fcmToken: string) {
    console.log(id, fcmToken, 'updateFcmToken');
    const user = await User.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    console.log(user, 'user data updateFcmToken');

    if (user.fcmToken === fcmToken) {
      console.log('FCM token is the same, no update needed');
      return user;
    }
    user.fcmToken = fcmToken;
    return user.save();
  }

  async applyResignation(
    userId: string,
    data: {
      summary: string;
      remarks?: string;
      preferredLastWorkingDay?: Date;
    },
  ) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    console.log(user, 'user data apply');
    // Check if there's already a pending resignation
    const hasPendingResignation = (user.resignations ?? []).some(
      (resignation) => resignation.status === 'Pending' && resignation.isActive,
    );
    if (hasPendingResignation) {
      throw new Error('Cannot apply: There is already a pending resignation.');
    }
    // Check if there's already a pending resignation
    const hasApprovedResignation = (user.resignations ?? []).some(
      (resignation) => resignation.status === 'Approved' && resignation.isActive,
    );
    if (hasApprovedResignation) {
      throw new Error('Cannot apply: There is already a Approved resignation.');
    }

    // Mark all previous resignations as inactive
    (user.resignations ?? []).forEach((resignation) => {
      resignation.isActive = false;
    });

    const resignation: IResignationState = {
      status: 'Pending',
      summary: data.summary,
      remarks: data.remarks ?? '',
      submittedAt: new Date(),
      preferredLastWorkingDay: data.preferredLastWorkingDay,
      finalSettlementDone: false,
      isActive: true,
    };
    console.log(resignation, ' resignation data');
    user.resignations = user.resignations || [];
    user.resignations.push(resignation);
    await user.save();
    const hrEmail = process.env.HR_EMAIL || 'hr@company.com'; // or fetch from DB

    const html = generateEmailTemplate('resignationApplyEmail', {
      adminName: 'HR/Admin',
      employeeName: user.name,
      submittedDate: new Date().toDateString(),
      preferredLastWorkingDay: data.preferredLastWorkingDay ? data.preferredLastWorkingDay.toDateString() : '',
      summary: data.summary,
      remarks: data.remarks ?? '',
      companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS'
    });
    await emailService.sendEmail({
      body: {
        to: hrEmail,
        subject: `Resignation Request Submitted by ${user.name}`,
        text: `${user.name} has submitted a resignation request.`,
        html
      }
    });
    return { resignation };
  }

  async withdrawResignation(userId: string): Promise<any> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    // Find the latest active resignation
    const resignation = (user.resignations ?? []).find(
      (resignation) => resignation.status === 'Pending' && resignation.isActive,
    );
    if (!resignation) {
      throw new Error('No active resignation to withdraw');
    }

    resignation.status = 'Withdrawn';
    resignation.withdrawnAt = new Date();
    resignation.isActive = false; // Mark as inactive

    await user.save();
    return { resignation: user.resignations };
  }

  async approveResignation(
    userId: string,
    approverId: string,
    data: {
      remarks?: string;
      noticePeriodDays: number; // Make required
      approvedLastWorkingDay: Date;
    },
  ): Promise<any> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Find the latest active resignation with a Pending status
    const resignation = (user.resignations ?? []).find(
      (resignation) => resignation.status === 'Pending' && resignation.isActive,
    );
    if (!resignation) {
      throw new Error('No active pending resignation to approve');
    }
    if (!data.noticePeriodDays) {
      throw new Error('Notice period days are required');
    }

    const today = new Date();
    const approvedDate = new Date(data.approvedLastWorkingDay);

    if (approvedDate <= today) {
      throw new Error('Last working day must be a future date');
    }

    // Update the resignation details
    resignation.status = 'Approved';
    resignation.remarks = data.remarks || resignation.remarks;
    resignation.approvedBy = new Types.ObjectId(approverId);
    resignation.approvedAt = new Date();
    resignation.noticePeriodDays = data.noticePeriodDays;
    resignation.approvedLastWorkingDay = data.approvedLastWorkingDay;
    resignation.isActive = true; // Keep it active so we can track the approved resignation

    await user.save();

    const approver = await User.findById(approverId).select('name');

    const html = generateEmailTemplate('resignationApprovedEmail', {
      employeeName: user.name,
      approverName: approver?.name || 'HR/Admin',
      approvedDate: new Date().toDateString(),
      approvedLastWorkingDay: data.approvedLastWorkingDay.toDateString(),
      noticePeriodDays: data.noticePeriodDays,
      remarks: data.remarks ?? '',
      companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS'
    });

    await emailService.sendEmail({
      body: {
        to: user.email,
        subject: `Your Resignation Has Been Approved`,
        text: `Your resignation has been approved. Last working day: ${data.approvedLastWorkingDay.toDateString()}`,
        html
      }
    });

    return { resignation: user.resignations };
  }

  async rejectResignation(userId: string, data: IResignation): Promise<any> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    // Find the latest active resignation with a Pending status
    const resignation = (user.resignations ?? []).find(
      (resignation) => resignation.status === 'Pending' && resignation.isActive,
    );
    if (!resignation) {
      throw new Error('No active pending resignation to reject');
    }

    // Update the resignation details
    resignation.status = 'Rejected';
    resignation.remarks = data.remarks || resignation.remarks;
    resignation.approvedBy = new Types.ObjectId(data.approvedBy?._id);
    resignation.rejectedAt = new Date();
    resignation.isActive = false; // Mark as inactive after rejection

    await user.save();

    const approver = await User.findById(data.approvedBy?._id).select('name');

    const html = generateEmailTemplate('resignationRejectedEmail', {
      employeeName: user.name,
      approverName: approver?.name || 'HR/Admin',
      rejectedAt: new Date().toDateString(),
      remarks: data.remarks ?? '',
      companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS'
    });

    await emailService.sendEmail({
      body: {
        to: user.email,
        subject: `Your Resignation Has Been Rejected`,
        text: `Your resignation request has been rejected.`,
        html
      }
    });

    return { resignation: user.resignations };
  }

  async getResignationStatus(userId: string): Promise<any> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }


    return { resignation: user.resignations || null };
  }

  async checkResignationEligibility(userId: string): Promise<any> {
    console.log('checkResignationEligibility', userId);
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    console.log(user.resignations, 'user data checkResignationEligibility');

    // First check if there's an active pending resignation
    const pendingResignation = (user.resignations ?? []).find(
      (resignation) => resignation.status === 'Pending' && resignation.isActive,
    );

    if (pendingResignation) {
      return {
        canApply: false,
        canWithdraw: true,
        activeResignation: pendingResignation,
      };
    }
    console.log(pendingResignation, 'pendingResignation checkResignationEligibility');
    // Then check if there's an approved resignation (even if not active)
    const approvedResignation = (user.resignations ?? []).find(
      (resignation) => resignation.status === 'Approved',
    );
    console.log(approvedResignation, 'approvedResignation checkResignationEligibility');
    if (approvedResignation) {
      // User has an approved resignation, they cannot apply again
      return {
        canApply: false,
        canWithdraw: false,
        activeResignation: approvedResignation,
      };
    }

    // No active pending resignation and no approved resignation
    return {
      canApply: true,
      canWithdraw: false,
      // Get the most recent resignation for display if it exists
      lastResignation:
        (user.resignations ?? []).length > 0
          ? (user.resignations ?? []).sort(
            (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
          )[0]
          : null,
    };

    /*
    const activeResignation = (user.resignations ?? []).find(
      (resignation) => resignation.isActive
    );

    console.log(activeResignation, "activeResignation checkResignationEligibility")
    if (activeResignation) {
      return {
        canApply: false,
        canWithdraw: activeResignation.status === 'Pending',
        activeResignation,
      };
    }

    return {
      canApply: true,
      canWithdraw: false,
    };
    */
  }

  async getAllResignationsForAdmin(userId: string, query: IResignQuery = {}): Promise<any> {
    const { status, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Verify user is admin
    const adminUser = await User.findById(userId);
    if (!adminUser || adminUser.role.toUpperCase() !== 'ADMIN') {
      throw new Error('Unauthorized: Only admins can access this data');
    }
    // Build query
    const baseQuery: any = {
      resignations: { $exists: true, $ne: [] },
    };

    if (status) {
      baseQuery['resignations.status'] = status;
    }

    // Get users with resignations
    const [users, totalUsers] = await Promise.all([
      User.find(baseQuery)
        .select('name email role joiningDate resignations')
        .sort({ 'resignations.submittedAt': -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(baseQuery),
    ]);

    // Process resignations
    const resignations = users.flatMap((user) =>
      (user.resignations ?? [])
        .filter((r) => (status ? r.status === status : true))
        .map((r) => ({
          employeeId: user._id,
          employeeName: user.name,
          email: user.email,
          role: user.role,
          joiningDate: user.joiningDate,
          resignation: {
            status: r.status,
            summary: r.summary,
            remarks: r.remarks,
            submittedAt: r.submittedAt,
            approvedAt: r.approvedAt,
            rejectedAt: r.rejectedAt,
            withdrawnAt: r.withdrawnAt,
            approvedBy: r.approvedBy,
            noticePeriodDays: r.noticePeriodDays,
            preferredLastWorkingDay: r.preferredLastWorkingDay,
            approvedLastWorkingDay: r.approvedLastWorkingDay,
            finalSettlementDone: r.finalSettlementDone,
            isActive: r.isActive,
          },
        })),
    );

    // Sort resignations by submittedAt date
    const sortedResignations = resignations.sort(
      (a, b) =>
        new Date(b.resignation.submittedAt).getTime() -
        new Date(a.resignation.submittedAt).getTime(),
    );

    return {
      resignations: sortedResignations,
      meta: {
        page,
        limit,
        total: totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      },
    };
  }

  async getResignationsForManager(managerUserId: string, query: IResignQuery): Promise<any> {
    const { status, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Verify user is manager
    const managerUser = await User.findById(managerUserId);
    if (!managerUser || !['MANAGER', 'ADMIN'].includes(managerUser.role.toUpperCase())) {
      throw new Error('Unauthorized: Only managers can access this data');
    }

    // Build base query
    const baseQuery: any = {
      managerId: managerUserId,
      resignations: { $exists: true, $ne: [] },
    };

    if (status) {
      baseQuery['resignations.status'] = status;
    }

    // Get team members with resignations
    const [users, totalUsers] = await Promise.all([
      User.find(baseQuery)
        .select('name email role joiningDate resignations')
        .sort({ 'resignations.submittedAt': -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(baseQuery),
    ]);

    // Process resignations
    const resignations = users.flatMap((user) =>
      (user.resignations ?? [])
        .filter((r) => (status ? r.status === status : true))
        .map((r) => ({
          employeeId: user._id,
          employeeName: user.name,
          email: user.email,
          role: user.role,
          joiningDate: user.joiningDate,
          resignation: {
            status: r.status,
            summary: r.summary,
            remarks: r.remarks,
            submittedAt: r.submittedAt,
            approvedAt: r.approvedAt,
            rejectedAt: r.rejectedAt,
            withdrawnAt: r.withdrawnAt,
            approvedBy: r.approvedBy,
            noticePeriodDays: r.noticePeriodDays,
            preferredLastWorkingDay: r.preferredLastWorkingDay,
            approvedLastWorkingDay: r.approvedLastWorkingDay,
            finalSettlementDone: r.finalSettlementDone,
            isActive: r.isActive,
          },
        })),
    );

    // Sort resignations by submittedAt date
    const sortedResignations = resignations.sort(
      (a, b) =>
        new Date(b.resignation.submittedAt).getTime() -
        new Date(a.resignation.submittedAt).getTime(),
    );

    return {
      resignations: sortedResignations,
      meta: {
        page,
        limit,
        total: totalUsers,
        totalPages: Math.ceil(totalUsers / limit),
      },
    };
  }

  private async sendWelcomeEmail(user: any, plainPassword?: string) {
    try {
      // Application URL - adjust based on your environment
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      let companyName = process.env.COMPANY_NAME || 'RTE PMS';

      const emailData: any = {
        userName: user.name,
        email: user.email,
        role: user.role,
        loginUrl: `${appUrl}/login`,
        companyName: process.env.COMPANY_NAME || 'CloudDesk HRMS'
      };

      // Include password in email if provided (for imported users with default password)
      if (plainPassword) {
        emailData.password = plainPassword;
      }

      const htmlContent = generateEmailTemplate('welcomeEmail', emailData);

      let emailText = `Hello ${user.name},\n\nWelcome to the HRMS system.\nLogin at ${appUrl}/login with your email: ${user.email}`;
      if (plainPassword) {
        emailText += `\n\nYour default password: ${plainPassword}\n\n⚠️ Important: Please change your password after first login for security.`;
      }

      const emailRequest = {
        body: {
          to: user.email,
          subject: `Welcome to ${companyName}`,
          text: emailText,
          html: htmlContent
        },
      };

      // Send the email using your email service
      await emailService.sendEmail(emailRequest);
      return true;
    } catch (error) {
      console.log(error, 'error sending email');
      return false;
    }
  }

  async updateGovernmentIdFiles(
    userId: string,
    request: any,
    verificationStatus?: 'Pending' | 'Verified' | 'Rejected'
  ): Promise<any> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const files = (request as any).files as any[]; // fastify-multer adds files to request.files
    console.log('Uploaded files:', files);

    if (!files || files.length === 0) {
      throw new Error('No files uploaded');
    }

    // Initialize governmentIds with the correct structure if it doesn't exist
    if (!user.governmentIds) {
      user.governmentIds = {
        pan: {},
        aadhaar: {},
        passport: {},
        voterId: {},
        drivingLicense: {},
        pf: {},
      };
    }

    // Map field names to document types and labels
    const fieldMapping: Record<string, { type: string; label: string }> = {
      'pan_file': { type: 'pan', label: 'PAN Card' },
      'pan': { type: 'pan', label: 'PAN Card' },
      'passport_file': { type: 'passport', label: 'Passport' },
      'passport': { type: 'passport', label: 'Passport' },
      'aadhaar_file': { type: 'aadhaar', label: 'Aadhaar Card' },
      'aadhaar': { type: 'aadhaar', label: 'Aadhaar Card' },
      'voterId_file': { type: 'voterId', label: 'Voter ID' },
      'voterId': { type: 'voterId', label: 'Voter ID' },
      'drivingLicense_file': { type: 'drivingLicense', label: 'Driving License' },
      'drivingLicense': { type: 'drivingLicense', label: 'Driving License' },
    };

    type GovernmentIdFieldWithDoc = 'pan' | 'aadhaar' | 'passport' | 'voterId' | 'drivingLicense';

    const isAdminUpload = ['admin', 'hr'].includes(
      (this.context.user?.role || '').toLowerCase(),
    );
    const resolvedStatus: 'Pending' | 'Verified' | 'Rejected' =
      verificationStatus || (isAdminUpload ? 'Verified' : 'Pending');

    // Process each uploaded file
    for (const file of files) {
      const fieldName = file.fieldname; // e.g., pan_file, passport_file
      const mapping = fieldMapping[fieldName];

      if (!mapping) {
        console.warn(`Unknown field name: ${fieldName}, skipping...`);
        continue;
      }

      const targetField = mapping.type as GovernmentIdFieldWithDoc;
      const documentLabel = mapping.label;

      try {
        // Read file from disk (multer saves it)
        if (!fs.existsSync(file.path)) {
          throw new Error(`File not found at path: ${file.path}`);
        }

        const fileExt = path.extname(file.originalname);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedEmployeeName = user.name.replace(/[^a-zA-Z0-9]/g, '_');
        const newFileName = `GovernmentId_${targetField}_${sanitizedEmployeeName}_${timestamp}${fileExt}`;

        // Upload file to GCP Cloud Storage
        const gcpResult = await uploadFileToGCP({
          filePath: file.path,
          fileName: newFileName,
          employeeId: userId,
          category: 'Certification',
          type: 'GovernmentId'
        });

        if (!gcpResult.success) {
          throw new Error(`Failed to upload file to GCP: ${gcpResult.error}`);
        }

        const fileUrl = gcpResult.fileUrl!;

        // Clean up local file
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error('Error deleting local file:', err);
        }

        // Legacy HRMS Document records are removed; store the uploaded file URL on the user.
        const govIds = user.governmentIds!;
        if (!govIds[targetField]) {
          govIds[targetField] = {} as any;
        }
        (govIds[targetField] as any).documentUrl = fileUrl;
        (govIds[targetField] as any).documentId = undefined;
        (govIds[targetField] as any).verificationStatus = resolvedStatus;

        console.log(`Successfully uploaded and stored ${documentLabel} document for user ${user.name}`);
      } catch (error: any) {
        console.error(`Error processing file ${fieldName}:`, error);
        // Clean up local file on error
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (unlinkError) {
          console.error('Error cleaning up file after error:', unlinkError);
        }
        throw new Error(`Failed to process ${documentLabel} file: ${error.message}`);
      }
    }

    await user.save();
    return user;
  }

  async updateGovernmentIdFields(
    userId: string,
    fields: {
      pan_number?: string;
      passport_number?: string;
      aadhaar_number?: string;
      voterId_number?: string;
      drivingLicense_number?: string;
      pf_number?: string;
      pf_uan?: string;
      pan_verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
      passport_verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
      aadhaar_verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
      voterId_verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
      drivingLicense_verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
    }
  ): Promise<any> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    console.log('Form fields:', fields);
    // Initialize governmentIds with the correct structure if it doesn't exist
    if (!user.governmentIds) {
      user.governmentIds = {
        pan: {},
        aadhaar: {},
        passport: {},
        voterId: {},
        drivingLicense: {},
        pf: {},
      };
    }
    const govIds = user.governmentIds as any;

    // Update fields only if the corresponding payload key is provided (not undefined)
    if (fields.pan_number !== undefined) {
      if (!govIds.pan) {
        govIds.pan = {};
      }
      govIds.pan.number = fields.pan_number;
      if (fields.pan_verificationStatus) {
        (govIds.pan as any).verificationStatus = fields.pan_verificationStatus;
      }
    }

    if (fields.passport_number !== undefined) {
      if (!govIds.passport) {
        govIds.passport = {};
      }
      govIds.passport.number = fields.passport_number;
      if (fields.passport_verificationStatus) {
        (govIds.passport as any).verificationStatus = fields.passport_verificationStatus;
      }
    }

    if (fields.aadhaar_number !== undefined) {
      if (!govIds.aadhaar) {
        govIds.aadhaar = {};
      }
      govIds.aadhaar.number = fields.aadhaar_number;
      if (fields.aadhaar_verificationStatus) {
        (govIds.aadhaar as any).verificationStatus = fields.aadhaar_verificationStatus;
      }
    }

    if (fields.voterId_number !== undefined) {
      if (!govIds.voterId) {
        govIds.voterId = {};
      }
      govIds.voterId.number = fields.voterId_number;
      if (fields.voterId_verificationStatus) {
        (govIds.voterId as any).verificationStatus = fields.voterId_verificationStatus;
      }
    }

    if (fields.drivingLicense_number !== undefined) {
      if (!govIds.drivingLicense) {
        govIds.drivingLicense = {};
      }
      govIds.drivingLicense.number = fields.drivingLicense_number;
      if (fields.drivingLicense_verificationStatus) {
        (govIds.drivingLicense as any).verificationStatus = fields.drivingLicense_verificationStatus;
      }
    }

    if (fields.pf_number !== undefined) {
      if (!govIds.pf) {
        govIds.pf = {};
      }
      govIds.pf.number = fields.pf_number;
    }

    if (fields.pf_uan !== undefined) {
      if (!govIds.pf) {
        govIds.pf = {};
      }
      govIds.pf.uan = fields.pf_uan;
    }

    console.log(user, "after update uservalue ")

    await user.save();
    return user;
  }

  async updateAcademicDetails(userId: string, academicDetails: IAcademicDetails[]): Promise<any> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    console.log('Received academic details:', academicDetails);

    // Validate the incoming data (optional, depending on requirements)
    for (const detail of academicDetails) {
      if (!detail.institution?.trim()) {
        throw new Error('Institution name is required for all academic details');
      }
      if (detail.yearOfCompletion && !/^\d{4}$/.test(detail.yearOfCompletion.toString())) {
        throw new Error('Year of completion must be a valid 4-digit year');
      }
    }

    // Overwrite the academicDetails array with the new data
    user.academicDetails = academicDetails.map((detail, index) => {
      const existing = (user.academicDetails || [])[index] as any;
      return {
        qualificationType: detail.qualificationType || existing?.qualificationType || undefined,
        fieldOfStudy: detail.fieldOfStudy || existing?.fieldOfStudy || undefined,
        institution: detail.institution,
        grade: detail.grade || undefined,
        yearOfCompletion: detail.yearOfCompletion || undefined,
        documentUrl: detail.documentUrl || existing?.documentUrl || undefined,
        documentId: detail.documentId || existing?.documentId || undefined,
        verificationStatus:
          detail.verificationStatus ||
          existing?.verificationStatus ||
          'Pending',
      };
    });

    await user.save();
    return user;
  }

  async updateExperienceDetails(userId: string, experienceDetails: IExperienceDetails[]): Promise<any> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    console.log('Received experience details:', experienceDetails);

    // Validate the incoming data
    for (const detail of experienceDetails) {
      if (!detail.companyName?.trim()) {
        throw new Error('Company name is required for all experience details');
      }
      if (detail.duration && !/^\w+\s\d{4}(\s?-\s?\w+\s\d{4})?$/.test(detail.duration)) {
        throw new Error('Duration must be in format like "Jan 2020 - Dec 2023"');
      }
    }

    // Overwrite the experienceDetails array with the new data
    user.experienceDetails = experienceDetails.map((detail, index) => {
      const existing = (user.experienceDetails || [])[index] as any;
      return {
        companyName: detail.companyName,
        role: detail.role || undefined,
        startDate: detail.startDate || existing?.startDate || undefined,
        endDate: detail.endDate || existing?.endDate || undefined,
        duration: detail.duration || undefined,
        documentUrl: detail.documentUrl || existing?.documentUrl || undefined,
        documentId: detail.documentId || existing?.documentId || undefined,
        companyAddress: detail.companyAddress || undefined,
        lastDrawnSalary: detail.lastDrawnSalary || undefined,
        reasonForLeaving: detail.reasonForLeaving || undefined,
        verificationStatus:
          detail.verificationStatus ||
          existing?.verificationStatus ||
          'Pending',
      };
    });

    await user.save();
    return user;
  }

  async uploadAcademicDetailDocument(
    userId: string,
    academicDetailIndex: number,
    file: any,
    metadata?: { qualificationType?: any, fieldOfStudy?: string, institution?: string, yearOfCompletion?: string | number },
    verificationStatus?: 'Pending' | 'Verified' | 'Rejected'
  ): Promise<any> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize academicDetails array if it doesn't exist
    if (!user.academicDetails) {
      user.academicDetails = [];
    }

    // If academic detail doesn't exist at the specified index, create it
    if (!user.academicDetails[academicDetailIndex]) {
      // Create a new academic detail entry with metadata if provided
      const newAcademicDetail: any = {
        qualificationType: metadata?.qualificationType || 'Other',
        fieldOfStudy: metadata?.fieldOfStudy || undefined,
        institution: metadata?.institution || 'Unknown',
        yearOfCompletion: metadata?.yearOfCompletion || undefined,
        grade: undefined,
        documentUrl: undefined,
        documentId: undefined,
        verificationStatus: verificationStatus || 'Pending',
      };

      // Ensure the array is large enough to include the new index
      while (user.academicDetails.length <= academicDetailIndex) {
        user.academicDetails.push({} as any);
      }

      user.academicDetails[academicDetailIndex] = newAcademicDetail;
      await user.save();
    }

    const academicDetail = user.academicDetails[academicDetailIndex] as any;
    const isAdminUpload = ['admin', 'hr'].includes(
      (this.context.user?.role || '').toLowerCase(),
    );
    const resolvedStatus: 'Pending' | 'Verified' | 'Rejected' =
      verificationStatus || (isAdminUpload ? 'Verified' : 'Pending');

    try {
      // Read file from disk (multer saves it)
      if (!fs.existsSync(file.path)) {
        throw new Error(`File not found at path: ${file.path}`);
      }

      const fileExt = path.extname(file.originalname);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedEmployeeName = user.name.replace(/[^a-zA-Z0-9]/g, '_');
      const institution = metadata?.institution || academicDetail.institution || 'Unknown';
      const sanitizedInstitute = institution.replace(/[^a-zA-Z0-9]/g, '_');
      const newFileName = `Academic_${sanitizedInstitute}_${sanitizedEmployeeName}_${timestamp}${fileExt}`;

      // Upload file to GCP Cloud Storage
      const gcpResult = await uploadFileToGCP({
        filePath: file.path,
        fileName: newFileName,
        employeeId: userId,
        category: 'Certification',
        type: 'Academic'
      });

      if (!gcpResult.success) {
        throw new Error(`Failed to upload file to GCP: ${gcpResult.error}`);
      }

      const fileUrl = gcpResult.fileUrl!;

      // Clean up local file
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting local file:', err);
      }

      const uploadedDocument = {
        type: 'Academic',
        fileName: newFileName,
        fileUrl,
        verificationStatus: resolvedStatus,
      };

      // Legacy HRMS Document records are removed; store the uploaded file URL on the user.
      if (!user.academicDetails) {
        user.academicDetails = [];
      }
      if (user.academicDetails[academicDetailIndex]) {
        user.academicDetails[academicDetailIndex].documentUrl = fileUrl;
        user.academicDetails[academicDetailIndex].documentId = undefined;
        (user.academicDetails as any)[academicDetailIndex].verificationStatus = resolvedStatus;
      }

      await user.save();
      return { user, document: uploadedDocument };
    } catch (error: any) {
      console.error(`Error processing academic document:`, error);
      // Clean up local file on error
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (unlinkError) {
        console.error('Error cleaning up file after error:', unlinkError);
      }
      throw new Error(`Failed to process academic document: ${error.message}`);
    }
  }

  async uploadExperienceDetailDocument(
    userId: string,
    experienceDetailIndex: number,
    file: any,
    metadata?: { companyName?: string; duration?: string, role?: string },
    verificationStatus?: 'Pending' | 'Verified' | 'Rejected'
  ): Promise<any> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Initialize experienceDetails array if it doesn't exist
    if (!user.experienceDetails) {
      user.experienceDetails = [];
    }

    // If experience detail doesn't exist at the specified index, create it
    if (!user.experienceDetails[experienceDetailIndex]) {
      // Create a new experience detail entry with metadata if provided
      const newExperienceDetail: any = {
        companyName: metadata?.companyName || 'Unknown',
        role: metadata?.role || undefined,
        duration: metadata?.duration || undefined,
        documentUrl: undefined,
        documentId: undefined,
        verificationStatus: verificationStatus || 'Pending',
      };

      // Ensure the array is large enough to include the new index
      while (user.experienceDetails.length <= experienceDetailIndex) {
        user.experienceDetails.push({} as any);
      }

      user.experienceDetails[experienceDetailIndex] = newExperienceDetail;
      await user.save();
    }

    const experienceDetail = user.experienceDetails[experienceDetailIndex] as any;
    const isAdminUpload = ['admin', 'hr'].includes(
      (this.context.user?.role || '').toLowerCase(),
    );
    const resolvedStatus: 'Pending' | 'Verified' | 'Rejected' =
      verificationStatus || (isAdminUpload ? 'Verified' : 'Pending');

    try {
      // Read file from disk (multer saves it)
      if (!fs.existsSync(file.path)) {
        throw new Error(`File not found at path: ${file.path}`);
      }

      const fileExt = path.extname(file.originalname);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedEmployeeName = user.name.replace(/[^a-zA-Z0-9]/g, '_');
      const companyName = metadata?.companyName || experienceDetail.companyName || 'Unknown';
      const sanitizedCompany = companyName.replace(/[^a-zA-Z0-9]/g, '_');
      const newFileName = `Experience_${sanitizedCompany}_${sanitizedEmployeeName}_${timestamp}${fileExt}`;

      // Upload file to GCP Cloud Storage
      const gcpResult = await uploadFileToGCP({
        filePath: file.path,
        fileName: newFileName,
        employeeId: userId,
        category: 'Certification',
        type: 'Experience'
      });

      if (!gcpResult.success) {
        throw new Error(`Failed to upload file to GCP: ${gcpResult.error}`);
      }

      const fileUrl = gcpResult.fileUrl!;

      // Clean up local file
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('Error deleting local file:', err);
      }

      const uploadedDocument = {
        type: 'Experience',
        fileName: newFileName,
        fileUrl,
        verificationStatus: resolvedStatus,
      };

      // Legacy HRMS Document records are removed; store the uploaded file URL on the user.
      if (!user.experienceDetails) {
        user.experienceDetails = [];
      }
      if (user.experienceDetails[experienceDetailIndex]) {
        user.experienceDetails[experienceDetailIndex].documentUrl = fileUrl;
        user.experienceDetails[experienceDetailIndex].documentId = undefined;
        (user.experienceDetails as any)[experienceDetailIndex].verificationStatus = resolvedStatus;
      }

      await user.save();
      return { user, document: uploadedDocument };
    } catch (error: any) {
      console.error(`Error processing experience document:`, error);
      // Clean up local file on error
      try {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (unlinkError) {
        console.error('Error cleaning up file after error:', unlinkError);
      }
      throw new Error(`Failed to process experience document: ${error.message}`);
    }
  }

  async getUsersWithFcmTokens(userIds?: string[]) {
    const query = userIds ? { _id: { $in: userIds } } : {};
    return await User.find({
      ...query,
      fcmToken: { $exists: true, $ne: null }
    }).select('_id email role fcmToken');
  }

  async sendNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ) {
    try {
      const user = await this.findById(userId);

      if (!user || !user.fcmToken) {
        throw new Error('User does not have FCM token registered');
      }

      // Enhanced message structure for better cross-platform compatibility
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          timestamp: Date.now().toString(),
          userId: userId
        },
        token: user.fcmToken,
        // Platform-specific configurations
        webpush: {
          headers: {
            Urgency: 'high'
          },
          notification: {
            icon: '/icon-192x192.png',
            requireInteraction: true,
            actions: [
              {
                action: 'open',
                title: 'Open'
              }
            ]
          }
        },
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            priority: 'high' as const,
            channelId: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      console.log('Sending notification to user:', userId);
      console.log('User:', user.name, user.email);
      console.log('FCM Token:', user.fcmToken ? `${user.fcmToken.substring(0, 20)}...` : 'null');
      console.log('Message structure:', JSON.stringify(message, null, 2));

      const response = await messaging.send(message);
      console.log('Notification sent successfully:', response);

      return {
        success: true,
        messageId: response,
        userId,
        title,
        body,
        fcmToken: user.fcmToken
      };
    } catch (error: any) {
      console.error('Failed to send notification:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);

      // Handle specific error codes
      if (error.code === 'messaging/registration-token-not-registered') {
        console.log('Token is invalid, clearing from database...');
        await this.updateFcmToken(userId, '');
        throw new Error('FCM token is invalid. Please refresh the app.');
      } else if (error.code === 'messaging/invalid-registration-token') {
        console.log('Invalid token format, clearing from database...');
        await this.updateFcmToken(userId, '');
        throw new Error('Invalid FCM token format.');
      } else if (error.code === 'messaging/not-registered') {
        console.log('Token not registered, clearing from database...');
        await this.updateFcmToken(userId, '');
        throw new Error('FCM token not registered.');
      } else if (error.code === 'messaging/quota-exceeded') {
        throw new Error('FCM quota exceeded. Please try again later.');
      } else if (error.code === 'messaging/unavailable') {
        throw new Error('FCM service temporarily unavailable.');
      }

      throw error;
    }
  }

  async sendBulkNotifications(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ) {
    try {
      const users = await this.getUsersWithFcmTokens(userIds);
      const validTokens = users.filter(user => user.fcmToken).map(user => user.fcmToken!);

      if (validTokens.length === 0) {
        return {
          success: false,
          message: 'No valid FCM tokens found',
          results: []
        };
      }

      const message = {
        notification: {
          title,
          body
        },
        data: data || {},
        tokens: validTokens
      };

      const response = await messaging.sendEachForMulticast(message);

      // Handle failed tokens
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(validTokens[idx]);
            console.error('Failed to send to token:', validTokens[idx], resp.error);
          }
        });

        // You might want to clean up invalid tokens here
        // await this.cleanupInvalidTokens(failedTokens);
      }

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses
      };
    } catch (error: any) {
      console.error('Failed to send bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Get UAE users with visas expiring in the next 30 days
   * @param daysAhead - Number of days ahead to check (default: 30)
   * @returns Object with count and list of users with expiring visas
   */
  async getUAEUsersWithExpiringVisas(daysAhead: number = 30) {
    try {
      const today = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(today.getDate() + daysAhead);
      console.log("getUAEUsersWithExpiringVisas")
      // Find UAE users with visa details and expiring visas
      const users = await User.find({
        country: 'AE',
        active: true,
        'visaDetails.visaExpiryDate': {
          $gte: today,
          $lte: expiryDate
        },
        'visaDetails.isActive': true
      }).select('name email visaDetails.visaType visaDetails.visaExpiryDate').lean();
      console.log(users, "users getUAEUsersWithExpiringVisas")
      // Group by visa type for better reporting
      const visaTypeCounts: Record<string, number> = {};
      const expiringVisas = users.map(user => {
        const visaType = user.visaDetails?.visaType || 'Unknown';
        visaTypeCounts[visaType] = (visaTypeCounts[visaType] || 0) + 1;

        return {
          name: user.name,
          email: user.email,
          visaType: visaType,
          expiryDate: user.visaDetails?.visaExpiryDate,
          daysUntilExpiry: user.visaDetails?.visaExpiryDate ?
            Math.ceil((new Date(user.visaDetails.visaExpiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0
        };
      });

      // Sort by days until expiry (most urgent first)
      expiringVisas.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
      let expiringVisasData = {
        totalCount: users.length,
        visaTypeBreakdown: visaTypeCounts,
        expiringVisas,
        checkDate: today,
        expiryThreshold: expiryDate
      };
      console.log(expiringVisasData, "expiringVisasData")
      console.log(expiringVisasData.expiringVisas, "expiringVisasData.expiringVisas")
      return expiringVisasData
    } catch (error: any) {
      console.error('Error getting UAE users with expiring visas:', error);
      throw new Error(`Failed to get expiring visa data: ${error.message}`);
    }
  }

  /**
   * Generate visa expiry notification message for admins
   * @param daysAhead - Number of days ahead to check (default: 30)
   * @returns Formatted notification message
   */
  async generateVisaExpiryNotification(daysAhead: number = 30) {
    try {
      const visaData = await this.getUAEUsersWithExpiringVisas(daysAhead);
      console.log(visaData, "visaData")
      if (visaData.totalCount === 0) {
        return {
          title: 'Visa Status Update',
          body: `No UAE employee visas are expiring in the next ${daysAhead} days.`,
          data: {
            type: 'visa_expiry',
            count: '0',
            action: 'none_required',
            urgent_count: '0',
            visa_types: '',
            user_names: '',
            error: 'false'
          }
        };
      }

      // Create detailed message
      const visaTypeDetails = Object.entries(visaData.visaTypeBreakdown)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ');

      const urgentCount = visaData.expiringVisas.filter(v => v.daysUntilExpiry <= 7).length;
      const urgentText = urgentCount > 0 ? ` (${urgentCount} urgent - expiring within 7 days)` : '';

      // Create comma-separated list of user names
      const userNamesList = visaData.expiringVisas.map(v => v.name).join(', ');

      return {
        title: 'Visa Expiry Alert',
        body: `${visaData.totalCount} UAE employee visa(s) expiring in ${daysAhead} days: ${visaTypeDetails}${urgentText}`,
        data: {
          type: 'visa_expiry',
          count: visaData.totalCount.toString(),
          urgent_count: urgentCount.toString(),
          action: 'review_required',
          visa_types: Object.keys(visaData.visaTypeBreakdown).join(','),
          user_names: userNamesList,
          error: 'false'
        }
      };
    } catch (error: any) {
      console.error('Error generating visa expiry notification:', error);
      return {
        title: 'Visa Status Error',
        body: 'Unable to check visa expiry status. Please review manually.',
        data: {
          type: 'visa_expiry',
          error: 'true',
          count: '0',
          action: 'error',
          urgent_count: '0',
          visa_types: '',
          user_names: ''
        }
      };
    }
  }

  /*
    async deleteMultipleUsers(userIds: string[]) {

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error('Invalid user IDs provided');
    }

    // Ensure all IDs are valid ObjectIds
    const validUserIds = userIds.map(id => new Types.ObjectId(id));
    // delete record hard delete

    const result = await User.deleteMany({ _id: { $in: validUserIds } });
    console.log(result, 'result of deleteMany');

    return true
  }
     */

}
