import { Types } from 'mongoose';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { ManagerReviewPeriodAssignment } from '../../src/models/pms-manager-review-period-assignment.model';
import { ObjectiveEmployeeAssignment } from '../../src/models/pms-objective-employee-assignment.model';
import { ObjectiveAssignmentPeriod } from '../../src/models/pms-objective-assignment-period.model';
import { User } from '../../src/models/user.model';
import { ObjectiveService } from '../../src/services/objective.service';
import { TermReviewService } from '../../src/services/termReview.service';
import { AnnualAssignment } from '../../src/models/pms-annual-assignment.model';
import { AnnualCycle } from '../../src/models/pms-annual-cycle.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { Objective } from '../../src/models/pms-objective.model';
import { ObjectiveComment } from '../../src/models/pms-objective-comment.model';
import { ObjectiveValue } from '../../src/models/pms-objective-value.model';
import { ObjectiveAttachment } from '../../src/models/pms-objective-attachment.model';
import { TermReview } from '../../src/models/pms-term-review.model';
import { TermReviewValue } from '../../src/models/pms-term-review-value.model';
import { PmsTemplateVersion } from '../../src/models/pms-template-version.model';
import { AssessmentTermCode, TermWorkflowState } from '../../src/constants/pms.enums';
import { databaseDiagnosticInternals } from '../../src/utilis/databaseDiagnostics';
import type { RequestContext } from '../../src/types/context';

function schemaHasIndex(model: any, expected: Record<string, number>, name: string): boolean {
  return model.schema.indexes().some(([fields, options]: [Record<string, number>, { name?: string }]) =>
    JSON.stringify(fields) === JSON.stringify(expected) && options.name === name,
  );
}

describe('Cosmos list-query optimizations', () => {
  afterEach(() => jest.restoreAllMocks());

  it('declares the three additive compound indexes with query-compatible ordering', () => {
    expect(schemaHasIndex(
      TermAssignment,
      { assignedManagerId: 1, isDeleted: 1, updatedAt: -1, assessmentTermCode: 1 },
      'idx_term_review_manager_list',
    )).toBe(true);
    expect(schemaHasIndex(
      ManagerReviewPeriodAssignment,
      { managerId: 1, isDeleted: 1, updatedAt: -1, reviewCode: 1 },
      'idx_grouped_review_manager_list',
    )).toBe(true);
    expect(schemaHasIndex(
      ObjectiveEmployeeAssignment,
      { managerId: 1, isDeleted: 1, createdAt: -1 },
      'idx_team_objective_manager_list',
    )).toBe(true);
  });

  it('extracts Cosmos code and Activity ID without logging documents', () => {
    expect(databaseDiagnosticInternals.cosmosErrorDetails({
      code: 50,
      message: 'Query exceeded timeout. ActivityId: 12345678-abcd-1234-abcd-123456789012',
    })).toEqual({
      code: 50,
      activityId: '12345678-abcd-1234-abcd-123456789012',
    });
  });

  it('paginates Team Objectives before related lookups and preserves record-array compatibility', async () => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const actorId = new Types.ObjectId();
    const periodId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    const assignmentId = new Types.ObjectId();
    const context: RequestContext = {
      requestId: 'cosmos-query-optimization-test',
      reqRole: 'MANAGER',
      user: {
        _id: actorId,
        email: 'manager@example.test',
        name: 'Manager',
        role: 'MANAGER',
        departmentId: 'Engineering',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    };
    const service = new ObjectiveService(context) as any;
    const assignment = {
      _id: assignmentId,
      objectiveAssignmentPeriodId: periodId,
      employeeId,
      managerId: actorId,
      sharedAccess: [],
      termStates: [],
    };
    const rootQuery = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([assignment]),
    };
    jest.spyOn(ObjectiveEmployeeAssignment, 'find').mockReturnValue(rootQuery as any);
    jest.spyOn(ObjectiveEmployeeAssignment, 'countDocuments').mockResolvedValue(21 as any);
    jest.spyOn(ObjectiveAssignmentPeriod, 'find').mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: periodId, name: 'Annual Objectives' }]),
      }),
    } as any);
    jest.spyOn(User, 'find').mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: employeeId, name: 'Employee' },
          { _id: actorId, name: 'Manager' },
        ]),
      }),
    } as any);
    jest.spyOn(service, 'mapObjectiveEmployeeAssignmentRecord').mockImplementation((value: any) => ({
      id: value._id.toString(),
      employeeName: value.employeeId.name,
    }));

    const paged = await service.listObjectiveEmployeeAssignments({ scope: 'TEAM', page: 2, pageSize: 10 });
    expect(rootQuery.skip).toHaveBeenCalledWith(10);
    expect(rootQuery.limit).toHaveBeenCalledWith(10);
    expect(paged).toEqual({
      items: [{ id: assignmentId.toString(), employeeName: 'Employee' }],
      pagination: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
    });

    rootQuery.lean.mockResolvedValueOnce([]);
    const legacy = await service.listObjectiveEmployeeAssignments({ scope: 'TEAM' });
    expect(Array.isArray(legacy)).toBe(true);
    expect(legacy).toEqual([]);
  });

  it('loads distinct template versions once for multiple visible term assignments', async () => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const actorId = new Types.ObjectId();
    const templateA = new Types.ObjectId();
    const templateB = new Types.ObjectId();
    const annualA = new Types.ObjectId();
    const annualB = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const termCycleId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const context: RequestContext = {
      requestId: 'term-template-batch-test',
      reqRole: 'ADMIN',
      user: {
        _id: actorId,
        email: 'admin@example.test',
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
    const service = new TermReviewService(context) as any;
    const assignments = [
      { annualAssignmentId: annualA, templateVersionId: templateA, assessmentTermCode: AssessmentTermCode.Q1 },
      { annualAssignmentId: annualA, templateVersionId: templateA, assessmentTermCode: AssessmentTermCode.Q2 },
      { annualAssignmentId: annualB, templateVersionId: templateB, assessmentTermCode: AssessmentTermCode.Q1 },
    ].map((item) => ({
      _id: new Types.ObjectId(),
      annualAssignmentId: item.annualAssignmentId,
      cycleId,
      cycleTermId: termCycleId,
      employeeId: new Types.ObjectId(),
      assignedManagerId: managerId,
      assessmentTermCode: item.assessmentTermCode,
      termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
      version: 1,
      updatedAt: new Date(),
    }));
    jest.spyOn(service, 'advanceTermAssignmentsToManagerReviewIfEligible').mockResolvedValue(undefined);
    jest.spyOn(service, 'isVisibleInManagerReviewList').mockReturnValue(true);
    jest.spyOn(TermAssignment, 'find').mockReturnValue({
      sort: jest.fn().mockResolvedValue(assignments),
    } as any);
    jest.spyOn(AnnualAssignment, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        { _id: annualA, templateVersionId: templateA, employeeSnapshot: {}, managerSnapshot: {} },
        { _id: annualB, templateVersionId: templateB, employeeSnapshot: {}, managerSnapshot: {} },
      ]),
    } as any);
    jest.spyOn(AnnualCycle, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: cycleId, name: 'Cycle' }]) } as any);
    jest.spyOn(TermCycle, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([{ _id: termCycleId }]) } as any);
    jest.spyOn(Objective, 'find').mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    } as any);
    jest.spyOn(TermReview, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);
    jest.spyOn(TermReviewValue, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);
    const templateFind = jest.spyOn(PmsTemplateVersion, 'find').mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: templateA, sections: [], scoringConfig: {} },
          { _id: templateB, sections: [], scoringConfig: {} },
        ]),
      }),
    } as any);

    const records = await service.listAssignments('admin');
    expect(records).toHaveLength(3);
    expect(templateFind).toHaveBeenCalledTimes(1);
    const queriedFilter = (templateFind.mock.calls as unknown as Array<[any]>)[0][0];
    const queriedIds = queriedFilter._id.$in.map((value: string) => value.toString());
    expect(new Set(queriedIds)).toEqual(new Set([templateA.toString(), templateB.toString()]));
  });
  it('keeps objective assignment listing read-only', async () => {
    const actorId = new Types.ObjectId();
    const annualAssignmentId = new Types.ObjectId();
    const termAssignmentId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const termCycleId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const service = new ObjectiveService({
      requestId: 'read-only-assignment-list-test',
      reqRole: 'STAFF',
      user: {
        _id: actorId,
        email: 'employee@example.test',
        name: 'Employee',
        role: 'STAFF',
        departmentId: 'Engineering',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    } as RequestContext) as any;
    const termAssignment = {
      _id: termAssignmentId,
      annualAssignmentId,
      cycleId,
      cycleTermId: termCycleId,
      employeeId: actorId,
      assignedManagerId: managerId,
      assessmentTermCode: AssessmentTermCode.Q1,
      termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      termSummary: { objectiveTemplateValues: [{ fieldKey: 'existing.value' }] },
    };

    jest.spyOn(TermAssignment, 'find').mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([termAssignment]) }),
    } as any);
    jest.spyOn(AnnualAssignment, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([{
        _id: annualAssignmentId,
        cycleId,
        employeeSnapshot: {},
        managerSnapshot: {},
      }]),
    } as any);
    jest.spyOn(AnnualCycle, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: cycleId, name: 'Cycle', code: 'CYCLE' }]),
    } as any);
    jest.spyOn(TermCycle, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: termCycleId }]),
    } as any);
    jest.spyOn(Objective, 'find').mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    } as any);
    for (const model of [ObjectiveComment, ObjectiveValue, ObjectiveAttachment]) {
      jest.spyOn(model, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      } as any);
    }
    jest.spyOn(service, 'buildObjectiveConfigMap').mockResolvedValue(new Map());
    jest.spyOn(service, 'buildAchievementSubmissionEnabledMap').mockResolvedValue(new Map());
    jest.spyOn(service, 'getEffectiveTermStateForDisplay').mockReturnValue(
      TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    );
    const objectiveBulkWrite = jest.spyOn(Objective, 'bulkWrite');
    const objectiveValueBulkWrite = jest.spyOn(ObjectiveValue, 'bulkWrite');

    const records = await service.listAssignments('employee');

    expect(records).toHaveLength(1);
    expect(objectiveBulkWrite).not.toHaveBeenCalled();
    expect(objectiveValueBulkWrite).not.toHaveBeenCalled();
  });
});
