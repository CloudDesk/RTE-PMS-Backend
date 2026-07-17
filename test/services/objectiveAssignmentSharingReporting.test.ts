import { Types } from 'mongoose';
import {
  ObjectiveAssignmentPeriodStatus,
  ObjectiveEmployeeAssignmentStatus,
} from '../../src/constants/pms.enums';
import { AuditLog } from '../../src/models/audit-log.model';
import { ObjectiveAssignmentPeriod } from '../../src/models/pms-objective-assignment-period.model';
import { ObjectiveEmployeeAssignment } from '../../src/models/pms-objective-employee-assignment.model';
import { ObjectiveService } from '../../src/services/objective.service';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - admin sharing reporting', () => {
  const adminId = new Types.ObjectId();

  function serviceForAdmin(): any {
    const context: RequestContext = {
      requestId: 'objective-sharing-reporting-test',
      reqRole: 'admin',
      user: {
        _id: adminId,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        departmentId: 'HR',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    };
    return new ObjectiveService(context) as any;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds active sharing and on-behalf submission totals to period reporting', async () => {
    const service = serviceForAdmin();
    const periodId = new Types.ObjectId();
    const masterId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    jest.spyOn(service, 'requireAdminForObjectiveReporting').mockResolvedValue(undefined);
    jest.spyOn(service, 'getCurrentDate').mockReturnValue(new Date('2026-07-16T10:00:00.000Z'));
    jest.spyOn(ObjectiveAssignmentPeriod, 'find').mockReturnValue({
      sort: () => ({
        lean: async () => [{
          _id: periodId,
          name: 'FY 2026',
          objectiveMasterId: masterId,
          objectiveVersionId: versionId,
          status: ObjectiveAssignmentPeriodStatus.ACTIVE,
          terms: ['H1', 'H2'],
          fillStartDate: new Date('2026-04-01T00:00:00.000Z'),
          fillEndDate: new Date('2027-03-31T23:59:59.000Z'),
        }],
      }),
    } as any);
    const assignmentAggregate = jest.spyOn(ObjectiveEmployeeAssignment, 'aggregate');
    assignmentAggregate
      .mockResolvedValueOnce([{
        _id: periodId,
        activeSharedAssignmentCount: 2,
        activeSharedTermCount: 3,
        sharedSubmittedTermCount: 1,
      }])
      .mockResolvedValueOnce([
        { _id: { periodId, status: ObjectiveEmployeeAssignmentStatus.ASSIGNED }, count: 2 },
        { _id: { periodId, status: ObjectiveEmployeeAssignmentStatus.SUBMITTED }, count: 1 },
      ]);
    jest.spyOn(AuditLog, 'aggregate').mockResolvedValue([]);

    const result = await service.getObjectiveAssignmentPeriodReport({
      objectiveMasterId: masterId.toString(),
    });

    expect(result.periods[0]).toMatchObject({
      terms: ['H1', 'H2'],
      totalAssignments: 3,
      activeSharedAssignmentCount: 2,
      activeSharedTermCount: 3,
      sharedSubmittedTermCount: 1,
    });
    expect(result.summary).toMatchObject({
      activeSharedAssignmentCount: 2,
      activeSharedTermCount: 3,
      sharedSubmittedTermCount: 1,
    });
    expect(assignmentAggregate.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ $project: expect.objectContaining({ activeSharedTerms: expect.any(Object) }) }),
    ]));
  });

  it('maps the actual shared contributor name for an admin term row', () => {
    const service = serviceForAdmin();
    const contributorId = new Types.ObjectId();
    const result = service.resolveObjectiveEmployeeAssignmentTermStates({
      selectedTerms: ['Y1'],
      termStates: [{
        term: 'Y1',
        status: ObjectiveEmployeeAssignmentStatus.SUBMITTED,
        submittedAt: new Date('2027-03-31T10:00:00.000Z'),
        submittedBy: {
          _id: contributorId,
          name: 'Priya Raman',
          employeeCode: 'E002',
        },
      }],
    });

    expect(result[0]).toMatchObject({
      term: 'Y1',
      submittedBy: contributorId.toString(),
      submittedByName: 'Priya Raman',
    });
  });
});
