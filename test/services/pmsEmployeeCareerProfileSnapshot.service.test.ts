import { Types } from 'mongoose';
import {
  AnnualAssignment,
  EmployeeCareerProfileSnapshotTrigger,
  type IEmployeeCareerProfileSnapshot,
} from '../../src/models/pms-annual-assignment.model';
import { PmsEmployeeCareerProfile } from '../../src/models/pms-employee-career-profile.model';
import { auditService } from '../../src/services/audit.service';
import {
  buildEmployeeCareerProfileSnapshot,
  PmsEmployeeCareerProfileSnapshotService,
} from '../../src/services/pmsEmployeeCareerProfileSnapshot.service';
import type { RequestContext } from '../../src/types/context';

const actorId = new Types.ObjectId();

function context(): RequestContext {
  return {
    requestId: 'career-profile-snapshot-test',
    reqRole: 'MANAGER',
    pmsCurrentDate: new Date('2026-07-24T00:00:00.000Z'),
    user: {
      _id: actorId,
      email: 'manager@test.local',
      name: 'PMS Manager',
      role: 'MANAGER',
      departmentId: 'OPS',
      active: true,
      country: 'IN',
      currency: 'INR',
      licenseType: 'employee',
      portalAccess: true,
    },
  };
}

function queryResult<T>(value: T) {
  return {
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(value),
    }),
  };
}

describe('PMS employee career-profile cycle snapshots', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('captures an immutable normalized profile at the freeze reference date', () => {
    const sourceProfileId = new Types.ObjectId();
    const snapshot = buildEmployeeCareerProfileSnapshot(
      {
        _id: sourceProfileId,
        profileVersion: 3,
        currentGrade: 'G5',
        gradeEffectiveDate: new Date('2024-07-24T00:00:00.000Z'),
        yearsInGrade: undefined,
        previousExperienceYears: 4,
        qualification: 'B.E.',
        asOfDate: new Date('2026-07-01T00:00:00.000Z'),
        careerProgressionPast: [
          {
            year: 2022,
            grade: 'G3',
            progression: 'Promotion',
            function: 'Production',
            unitOrDepartment: 'Plant 1',
            sequence: 2,
          },
          {
            year: 2024,
            grade: 'G4',
            progression: 'Promotion+Merit 50',
            function: 'Production',
            unitOrDepartment: 'Plant 2',
            sequence: 1,
          },
        ],
      } as any,
      {
        snapshotAt: new Date('2026-07-24T00:00:00.000Z'),
        trigger:
          EmployeeCareerProfileSnapshotTrigger
            .FIRST_MANAGER_REVIEW_SUBMISSION,
        triggeredBy: actorId,
      },
    );

    expect(snapshot).toMatchObject({
      profileAvailable: true,
      sourceProfileId,
      profileVersion: 3,
      currentGrade: 'G5',
      yearsInGradeAtReferenceDate: 2,
      previousExperienceYears: 4,
      qualification: 'B.E.',
      trigger: 'FIRST_MANAGER_REVIEW_SUBMISSION',
    });
    expect(snapshot.careerProgressionPast.map((entry) => entry.year)).toEqual([
      2024, 2022,
    ]);
    expect(snapshot.careerProgressionPast.map((entry) => entry.progression)).toEqual([
      'Promotion+Merit 50',
      'Promotion',
    ]);
  });

  it('freezes an explicit empty snapshot when the employee has no profile', () => {
    const snapshot = buildEmployeeCareerProfileSnapshot(null, {
      snapshotAt: new Date('2026-07-24T00:00:00.000Z'),
      trigger: EmployeeCareerProfileSnapshotTrigger.ANNUAL_DECISION_DRAFT,
    });

    expect(snapshot).toEqual({
      profileAvailable: false,
      careerProgressionPast: [],
      snapshotAt: new Date('2026-07-24T00:00:00.000Z'),
      trigger: 'ANNUAL_DECISION_DRAFT',
      triggeredBy: undefined,
    });
  });

  it('stores the first snapshot once and writes its audit event', async () => {
    const annualAssignmentId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    jest.spyOn(AnnualAssignment, 'findOne').mockReturnValue(
      queryResult({
        _id: annualAssignmentId,
        employeeId,
      }) as any,
    );
    jest.spyOn(PmsEmployeeCareerProfile, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        profileVersion: 2,
        currentGrade: 'G4',
        yearsInGrade: 1.5,
        previousExperienceYears: 3,
        qualification: 'Diploma',
        asOfDate: new Date('2026-07-01T00:00:00.000Z'),
        careerProgressionPast: [],
      }),
    } as any);

    let storedSnapshot: IEmployeeCareerProfileSnapshot | undefined;
    const updateSpy = jest.spyOn(
      AnnualAssignment,
      'findOneAndUpdate',
    ) as jest.Mock;
    updateSpy.mockImplementation(async (_filter: any, update: any) => {
        storedSnapshot = update.$set.careerProfileSnapshot;
        return { careerProfileSnapshot: storedSnapshot } as any;
      });
    const auditSpy = jest
      .spyOn(auditService, 'createAuditLog')
      .mockResolvedValue({} as any);

    const result = await new PmsEmployeeCareerProfileSnapshotService(
      context(),
    ).freezeForAnnualAssignment(
      annualAssignmentId,
      EmployeeCareerProfileSnapshotTrigger.FIRST_MANAGER_REVIEW_SUBMISSION,
    );

    expect(result).toMatchObject({
      profileAvailable: true,
      profileVersion: 2,
      currentGrade: 'G4',
      yearsInGradeAtReferenceDate: 1.5,
    });
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: annualAssignmentId,
        $or: expect.any(Array),
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          careerProfileSnapshot: expect.objectContaining({
            currentGrade: 'G4',
          }),
        }),
      }),
      { new: true, runValidators: true },
    );
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PMS_EMPLOYEE_PROFILE_SNAPSHOT_CREATED',
        assignmentId: annualAssignmentId.toString(),
      }),
    );
  });

  it('returns an existing frozen snapshot without reading the live profile', async () => {
    const existingSnapshot: IEmployeeCareerProfileSnapshot = {
      profileAvailable: false,
      careerProgressionPast: [],
      snapshotAt: new Date('2026-04-01T00:00:00.000Z'),
      trigger:
        EmployeeCareerProfileSnapshotTrigger.FIRST_MANAGER_REVIEW_SUBMISSION,
    };
    jest.spyOn(AnnualAssignment, 'findOne').mockReturnValue(
      queryResult({
        _id: new Types.ObjectId(),
        employeeId: new Types.ObjectId(),
        careerProfileSnapshot: existingSnapshot,
      }) as any,
    );
    const profileSpy = jest.spyOn(PmsEmployeeCareerProfile, 'findOne');
    const updateSpy = jest.spyOn(AnnualAssignment, 'findOneAndUpdate');

    const result = await new PmsEmployeeCareerProfileSnapshotService(
      context(),
    ).freezeForAnnualAssignment(
      new Types.ObjectId(),
      EmployeeCareerProfileSnapshotTrigger.ANNUAL_FINALIZATION,
    );

    expect(result).toBe(existingSnapshot);
    expect(profileSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
