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
  L1_DIRECTOR: 'L1_DIRECTOR',
  CYCLE_DEFAULT: 'CYCLE_DEFAULT',
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
    .select('_id employeeCode name email role specificRole managerId active portalAccess')
    .lean();
  return user as FinalReviewerUser | null;
}

export async function resolveFinalReviewer(
  input: ResolveFinalReviewerInput,
): Promise<FinalReviewerResolution> {
  if (!input.finalReviewRequired) {
    return { finalReviewStatus: FinalReviewStatus.NOT_REQUIRED };
  }

  const employeeId = objectIdString(input.employeeId);
  const assignedManagerId = objectIdString(input.assignedManagerId);
  if (!employeeId) throw new Error('Valid employeeId is required for Final Reviewer resolution');
  if (!assignedManagerId) {
    throw new Error('Valid assignedManagerId is required for Final Reviewer resolution');
  }

  const findUserById = input.findUserById ?? defaultFindUserById;
  const l1 = await findUserById(assignedManagerId);
  if (!l1) throw new Error('Assigned L1 Manager was not found');
  if (l1.active === false) throw new Error('Assigned L1 Manager must be active');
  if (l1.portalAccess === false) {
    throw new Error('Assigned L1 Manager must have portal access');
  }

  const reportingL2Id = objectIdString(l1.managerId);
  const l1DirectorIsFinalReviewer = isDirectorRole(l1.role) && !reportingL2Id;

  const candidateId =
    reportingL2Id ??
    (l1DirectorIsFinalReviewer ? assignedManagerId : objectIdString(input.defaultFinalReviewerId));
  const source = reportingL2Id
    ? FinalReviewerSource.REPORTING_L2
    : l1DirectorIsFinalReviewer
      ? FinalReviewerSource.L1_DIRECTOR
      : FinalReviewerSource.CYCLE_DEFAULT;

  if (!candidateId) {
    throw new Error(
      'Final Reviewer could not be resolved from L2 and no default Director is configured',
    );
  }

  const reviewer = validateReviewer(
    await findUserById(candidateId),
    employeeId,
    assignedManagerId,
    l1DirectorIsFinalReviewer,
  );

  return {
    finalReviewStatus: FinalReviewStatus.PENDING,
    finalReviewerId: reviewer._id,
    finalReviewerSource: source,
    finalReviewerSnapshot: snapshotReviewer(reviewer),
  };
}
