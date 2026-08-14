import { Types } from 'mongoose';
import { User } from '../models/user.model';

export const FinalReviewStatus = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export type FinalReviewStatus =
  (typeof FinalReviewStatus)[keyof typeof FinalReviewStatus];

export const FinalReviewerSource = {
  REPORTING_L2: 'REPORTING_L2',
  REPORTING_DIRECTOR: 'REPORTING_DIRECTOR',
  L1_DIRECTOR: 'L1_DIRECTOR',
  CYCLE_DEFAULT: 'CYCLE_DEFAULT',
  EMPLOYEE_L2_MAPPING: 'EMPLOYEE_L2_MAPPING',
  EMPLOYEE_L3_MAPPING: 'EMPLOYEE_L3_MAPPING',
} as const;

export type FinalReviewerSource =
  (typeof FinalReviewerSource)[keyof typeof FinalReviewerSource];

export interface FinalReviewerUser {
  _id: Types.ObjectId;
  employeeCode?: string;
  name: string;
  email?: string;
  role: string;
  specificRole?: string;
  managerId?: Types.ObjectId;
  l2ManagerId?: Types.ObjectId;
  l3ManagerId?: Types.ObjectId;
  active?: boolean;
  portalAccess?: boolean;
}

export interface FinalReviewerResolution {
  finalReviewStatus: FinalReviewStatus;
  finalReviewerId?: Types.ObjectId;
  finalReviewerSource?: FinalReviewerSource;
  finalReviewerSnapshot?: {
    employeeCode?: string;
    name: string;
    email?: string;
    role: string;
    specificRole?: string;
  };
  directorReviewerId?: Types.ObjectId;
  directorReviewerSource?: FinalReviewerSource;
  directorReviewerSnapshot?: {
    employeeCode?: string;
    name: string;
    email?: string;
    role: string;
    specificRole?: string;
  };
  directorReviewStatus: FinalReviewStatus;
}

export interface ResolveFinalReviewerInput {
  employeeId: Types.ObjectId | string;
  assignedManagerId: Types.ObjectId | string;
  defaultFinalReviewerId?: Types.ObjectId | string;
  finalReviewRequired: boolean;
  findUserById?: (id: string) => Promise<FinalReviewerUser | null>;
}

function objectIdString(value: Types.ObjectId | string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return Types.ObjectId.isValid(normalized) ? normalized : undefined;
}

function isDirectorRole(role?: string): boolean {
  return String(role || '').trim().toLowerCase() === 'director';
}

function snapshotReviewer(user: FinalReviewerUser) {
  return {
    employeeCode: user.employeeCode,
    name: user.name,
    email: user.email,
    role: user.role,
    specificRole: user.specificRole,
  };
}

function validateReviewer(
  reviewer: FinalReviewerUser | null,
  employeeId: string,
  assignedManagerId: string,
  allowAssignedManager = false,
): FinalReviewerUser {
  if (!reviewer) {
    throw new Error('Configured Final Reviewer was not found');
  }
  if (reviewer.active === false) {
    throw new Error('Final Reviewer must be active');
  }
  if (reviewer.portalAccess === false) {
    throw new Error('Final Reviewer must have portal access');
  }

  const reviewerId = reviewer._id.toString();
  if (reviewerId === employeeId) {
    throw new Error('Employee cannot be their own Final Reviewer');
  }
  if (!allowAssignedManager && reviewerId === assignedManagerId) {
    throw new Error('L1 Manager cannot also be the Final Reviewer');
  }
  return reviewer;
}

async function defaultFindUserById(id: string): Promise<FinalReviewerUser | null> {
  const user = await User.findById(id)
    .select('_id employeeCode name email role specificRole managerId l2ManagerId l3ManagerId active portalAccess')
    .lean();
  return user as FinalReviewerUser | null;
}

export async function resolveFinalReviewer(
  input: ResolveFinalReviewerInput,
): Promise<FinalReviewerResolution> {
  if (!input.finalReviewRequired) {
    return {
      finalReviewStatus: FinalReviewStatus.NOT_REQUIRED,
      directorReviewStatus: FinalReviewStatus.NOT_REQUIRED,
    };
  }

  const employeeId = objectIdString(input.employeeId);
  const assignedManagerId = objectIdString(input.assignedManagerId);
  if (!employeeId) throw new Error('Valid employeeId is required for Final Reviewer resolution');
  if (!assignedManagerId) {
    throw new Error('Valid assignedManagerId is required for Final Reviewer resolution');
  }

  const findUserById = input.findUserById ?? defaultFindUserById;
  const l1 = await findUserById(assignedManagerId);
  const employee = await findUserById(employeeId);
  if (!l1) throw new Error('Assigned L1 Manager was not found');
  if (l1.active === false) throw new Error('Assigned L1 Manager must be active');
  if (l1.portalAccess === false) {
    throw new Error('Assigned L1 Manager must have portal access');
  }

  const explicitL2Id = objectIdString(employee?.l2ManagerId);
  const explicitL3Id = objectIdString(employee?.l3ManagerId);
  const reportingL2Id = objectIdString(l1.managerId);
  const l1DirectorIsFinalReviewer = isDirectorRole(l1.role) && !reportingL2Id;

  const l2CandidateId =
    explicitL2Id ?? reportingL2Id ??
    (l1DirectorIsFinalReviewer ? assignedManagerId : objectIdString(input.defaultFinalReviewerId));
  const l2Source = explicitL2Id
    ? FinalReviewerSource.EMPLOYEE_L2_MAPPING
    : reportingL2Id
      ? FinalReviewerSource.REPORTING_L2
    : l1DirectorIsFinalReviewer
      ? FinalReviewerSource.L1_DIRECTOR
      : FinalReviewerSource.CYCLE_DEFAULT;

  if (!l2CandidateId) {
    throw new Error(
      'Final Reviewer could not be resolved from L2 and no default Director is configured',
    );
  }

  const l2Reviewer = validateReviewer(
    await findUserById(l2CandidateId),
    employeeId,
    assignedManagerId,
    l1DirectorIsFinalReviewer,
  );

  let directorReviewer: FinalReviewerUser | null = explicitL3Id
    ? validateReviewer(await findUserById(explicitL3Id), employeeId, assignedManagerId, true)
    : isDirectorRole(l2Reviewer.role)
      ? l2Reviewer
      : null;
  let directorSource: FinalReviewerSource = explicitL3Id
    ? FinalReviewerSource.EMPLOYEE_L3_MAPPING
    : isDirectorRole(l2Reviewer.role)
      ? l2Source
      : FinalReviewerSource.REPORTING_DIRECTOR;
  let nextId = objectIdString(l2Reviewer.managerId);
  const visited = new Set<string>([assignedManagerId, l2Reviewer._id.toString()]);

  for (let depth = 0; !directorReviewer && nextId && depth < 20; depth += 1) {
    if (visited.has(nextId)) {
      throw new Error('Reporting hierarchy contains a cycle while resolving the Director Reviewer');
    }
    visited.add(nextId);
    const candidate = validateReviewer(
      await findUserById(nextId),
      employeeId,
      assignedManagerId,
      true,
    );
    if (isDirectorRole(candidate.role)) {
      directorReviewer = candidate;
      break;
    }
    nextId = objectIdString(candidate.managerId);
  }

  if (!directorReviewer) {
    const defaultDirectorId = objectIdString(input.defaultFinalReviewerId);
    if (defaultDirectorId) {
      const candidate = validateReviewer(
        await findUserById(defaultDirectorId),
        employeeId,
        assignedManagerId,
        true,
      );
      if (!isDirectorRole(candidate.role)) {
        throw new Error('Default Director Reviewer must have Director portal access');
      }
      directorReviewer = candidate;
      directorSource = FinalReviewerSource.CYCLE_DEFAULT;
    }
  }

  if (!directorReviewer) {
    throw new Error('Director Reviewer could not be resolved from the reporting hierarchy');
  }

  return {
    finalReviewStatus: FinalReviewStatus.PENDING,
    finalReviewerId: l2Reviewer._id,
    finalReviewerSource: l2Source,
    finalReviewerSnapshot: snapshotReviewer(l2Reviewer),
    directorReviewerId: directorReviewer._id,
    directorReviewerSource: directorSource,
    directorReviewerSnapshot: snapshotReviewer(directorReviewer),
    directorReviewStatus: FinalReviewStatus.PENDING,
  };
}
