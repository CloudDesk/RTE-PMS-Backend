import { Types } from 'mongoose';
import {
  AnnualAssignment,
  EmployeeCareerProfileSnapshotTrigger,
  type EmployeeCareerProfileSnapshotTrigger as EmployeeCareerProfileSnapshotTriggerType,
  type IEmployeeCareerProfileSnapshot,
} from '../models/pms-annual-assignment.model';
import {
  PmsEmployeeCareerProfile,
  type IPmsEmployeeCareerProfile,
} from '../models/pms-employee-career-profile.model';
import type { RequestContext } from '../types/context';
import { auditService } from './audit.service';
import { BaseService } from './base.service';

type SnapshotProfileSource = Pick<
  IPmsEmployeeCareerProfile,
  | '_id'
  | 'profileVersion'
  | 'currentGrade'
  | 'gradeEffectiveDate'
  | 'yearsInGrade'
  | 'previousExperienceYears'
  | 'qualification'
  | 'careerProgressionPast'
  | 'asOfDate'
>;

export function buildEmployeeCareerProfileSnapshot(
  profile: SnapshotProfileSource | null,
  input: {
    snapshotAt: Date;
    trigger: EmployeeCareerProfileSnapshotTriggerType;
    triggeredBy?: Types.ObjectId;
  },
): IEmployeeCareerProfileSnapshot {
  if (!profile) {
    return {
      profileAvailable: false,
      careerProgressionPast: [],
      snapshotAt: input.snapshotAt,
      trigger: input.trigger,
      triggeredBy: input.triggeredBy,
    };
  }

  return {
    profileAvailable: true,
    sourceProfileId: new Types.ObjectId(profile._id.toString()),
    profileVersion: profile.profileVersion,
    currentGrade: profile.currentGrade,
    gradeEffectiveDate: profile.gradeEffectiveDate,
    yearsInGradeAtReferenceDate:
      yearsBetween(profile.gradeEffectiveDate, input.snapshotAt) ??
      profile.yearsInGrade,
    previousExperienceYears: profile.previousExperienceYears,
    qualification: profile.qualification,
    careerProgressionPast: (profile.careerProgressionPast ?? [])
      .slice()
      .sort(
        (left, right) =>
          right.year - left.year || left.sequence - right.sequence,
      )
      .map((entry) => ({
        year: entry.year,
        grade: entry.grade,
        function: entry.function,
        unitOrDepartment: entry.unitOrDepartment,
        sequence: entry.sequence,
      })),
    profileAsOfDate: profile.asOfDate,
    snapshotAt: input.snapshotAt,
    trigger: input.trigger,
    triggeredBy: input.triggeredBy,
  };
}

export class PmsEmployeeCareerProfileSnapshotService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async freezeForAnnualAssignment(
    annualAssignmentId: string | Types.ObjectId,
    trigger: EmployeeCareerProfileSnapshotTriggerType,
  ): Promise<IEmployeeCareerProfileSnapshot> {
    const assignmentId = annualAssignmentId.toString();
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new Error('Invalid annual assignment id for career-profile snapshot');
    }
    if (!Object.values(EmployeeCareerProfileSnapshotTrigger).includes(trigger)) {
      throw new Error('Invalid employee career-profile snapshot trigger');
    }

    const assignment = await AnnualAssignment.findOne({
      _id: assignmentId,
      isDeleted: false,
    })
      .select('employeeId careerProfileSnapshot')
      .lean();
    if (!assignment) {
      throw new Error('Annual assignment not found for career-profile snapshot');
    }
    if (assignment.careerProfileSnapshot) {
      return assignment.careerProfileSnapshot;
    }

    const profile = await PmsEmployeeCareerProfile.findOne({
      employeeId: assignment.employeeId,
    }).lean();
    const snapshotAt = this.context.pmsCurrentDate ?? new Date();
    const actorId = this.actorIdObject();
    const snapshot = buildEmployeeCareerProfileSnapshot(profile, {
      snapshotAt,
      trigger,
      triggeredBy: actorId,
    });

    const updatedAssignment = await AnnualAssignment.findOneAndUpdate(
      {
        _id: assignment._id,
        isDeleted: false,
        $or: [
          { careerProfileSnapshot: { $exists: false } },
          { careerProfileSnapshot: null },
        ],
      },
      {
        $set: {
          careerProfileSnapshot: snapshot,
          updatedBy: actorId,
        },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true },
    );

    if (!updatedAssignment) {
      const concurrentlyFrozen = await AnnualAssignment.findOne({
        _id: assignment._id,
        isDeleted: false,
      })
        .select('careerProfileSnapshot')
        .lean();
      if (!concurrentlyFrozen?.careerProfileSnapshot) {
        throw new Error('Unable to freeze employee career-profile snapshot');
      }
      return concurrentlyFrozen.careerProfileSnapshot;
    }

    await this.auditSnapshotCreated(
      assignment._id.toString(),
      updatedAssignment.careerProfileSnapshot!,
    );
    return updatedAssignment.careerProfileSnapshot!;
  }

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
  }

  private async auditSnapshotCreated(
    annualAssignmentId: string,
    snapshot: IEmployeeCareerProfileSnapshot,
  ): Promise<void> {
    const actor = this.context.user;
    if (!actor) return;

    await auditService.createAuditLog({
      actorId: actor._id.toString(),
      actorRole: actor.role,
      action: 'PMS_EMPLOYEE_PROFILE_SNAPSHOT_CREATED',
      entityType: 'ANNUAL_ASSIGNMENT',
      entityId: annualAssignmentId,
      assignmentId: annualAssignmentId,
      newValue: snapshot,
      metadata: {
        trigger: snapshot.trigger,
        profileAvailable: snapshot.profileAvailable,
        profileVersion: snapshot.profileVersion,
      },
    });
  }
}

function yearsBetween(
  startValue: Date | undefined,
  endValue: Date,
): number | undefined {
  if (!startValue) return undefined;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() < start.getTime()
  ) {
    return undefined;
  }
  const years =
    (end.getTime() - start.getTime()) /
    (365.2425 * 24 * 60 * 60 * 1000);
  return Number(years.toFixed(1));
}
