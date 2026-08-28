import { Types } from 'mongoose';
import {
  AssessmentTermCode,
  AssessmentTermType,
  FlexibleObjectiveSourceType,
  ObjectiveSource,
} from '../../src/constants/pms.enums';
import { ObjectiveService } from '../../src/services/objective.service';
import { User } from '../../src/models';
import { ObjectiveEmployeeAssignment } from '../../src/models/pms-objective-employee-assignment.model';
import { ObjectiveMaster } from '../../src/models/pms-objective-master.model';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - Flexible objective assignment preview helpers', () => {
  const actorId = new Types.ObjectId();
  let service: any;

  beforeEach(() => {
    const context: RequestContext = {
      requestId: 'objective-assignment-preview-test',
      reqRole: 'admin',
      user: {
        _id: actorId,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        departmentId: 'Engineering',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    };
    service = new ObjectiveService(context) as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('matches rules only to configured cycle term type and labels', () => {
    const rule = {
      assessmentTermType: AssessmentTermType.QUARTERLY,
      termLabels: [AssessmentTermCode.Q1],
    };

    expect(service.ruleMatchesTerm(rule, AssessmentTermCode.Q1, AssessmentTermType.QUARTERLY)).toBe(true);
    expect(service.ruleMatchesTerm(rule, AssessmentTermCode.Q2, AssessmentTermType.QUARTERLY)).toBe(false);
    expect(service.ruleMatchesTerm(rule, AssessmentTermCode.Q1, AssessmentTermType.HALF_YEARLY)).toBe(false);
  });

  it('matches organization and employee criteria against assignment snapshots', () => {
    const employeeId = new Types.ObjectId();
    const managerId = new Types.ObjectId();
    const annualAssignment = {
      employeeId,
      assignedManagerId: managerId,
      employeeSnapshot: {
        departmentId: 'Engineering',
        location: 'Chennai',
        role: 'Engineer',
        specificRole: 'Senior Engineer',
        employmentStatus: 'Full Time',
      },
      orgSnapshot: {
        reportingManagerId: managerId,
      },
    };

    expect(service.ruleMatchesAssignmentCriteria({
      department: 'engineering',
      location: 'chennai',
      designation: 'Senior Engineer',
      employeeGroup: 'Full Time',
      reportingManagerId: managerId,
      employeeIds: [employeeId],
    }, annualAssignment)).toBe(true);

    expect(service.ruleMatchesAssignmentCriteria({
      department: 'Sales',
    }, annualAssignment)).toBe(false);
  });

  it('warns on similar title without blocking a different objective master', () => {
    const warning = service.findSimilarTitleWarning(
      [
        {
          objectiveMasterId: new Types.ObjectId(),
          title: 'Reduce release incidents',
        },
      ],
      ' reduce   release incidents ',
      new Types.ObjectId().toString(),
    );

    expect(warning).toBe('Similar title found - please review');
  });

  it('maps flexible source types to legacy objective source values', () => {
    expect(service.mapFlexibleSourceToLegacySource(FlexibleObjectiveSourceType.COMPANY_OBJECTIVE))
      .toBe(ObjectiveSource.PREDEFINED);
    expect(service.mapFlexibleSourceToLegacySource(FlexibleObjectiveSourceType.MANAGER_CREATED_OBJECTIVE))
      .toBe(ObjectiveSource.MANAGER_CREATED);
    expect(service.mapFlexibleSourceToLegacySource(FlexibleObjectiveSourceType.EMPLOYEE_CREATED_OBJECTIVE))
      .toBe(ObjectiveSource.EMPLOYEE_CREATED);
  });

  it('normalizes quarterly assignment terms into fiscal order', () => {
    expect(
      service.normalizePeriodTerms(AssessmentTermType.QUARTERLY, [
        AssessmentTermCode.Q2,
        AssessmentTermCode.Q3,
        AssessmentTermCode.Q4,
        AssessmentTermCode.Q1,
      ]),
    ).toEqual([
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
    ]);
  });

  it('keeps each fill window attached to its term after canonical sorting', () => {
    const periodStart = new Date('2026-08-27T00:00:00.000Z');
    const periodEnd = new Date('2027-03-31T00:00:00.000Z');
    const terms = service.normalizePeriodTerms(AssessmentTermType.QUARTERLY, [
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
      AssessmentTermCode.Q1,
    ]);
    const windows = service.normalizeTermFillWindows(
      terms,
      [
        { term: AssessmentTermCode.Q2, fillStartDate: '2026-10-20', fillEndDate: '2026-12-12' },
        { term: AssessmentTermCode.Q3, fillStartDate: '2026-12-13', fillEndDate: '2027-02-04' },
        { term: AssessmentTermCode.Q4, fillStartDate: '2027-02-05', fillEndDate: '2027-03-30' },
        { term: AssessmentTermCode.Q1, fillStartDate: '2026-08-27', fillEndDate: '2026-10-19' },
      ],
      periodStart,
      periodEnd,
    );

    expect(windows.map((window: any) => window.term)).toEqual([
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
    ]);
    expect(windows[0].fillStartDate.toISOString().slice(0, 10)).toBe('2026-08-27');
    expect(windows[0].fillEndDate.toISOString().slice(0, 10)).toBe('2026-10-19');
  });

  it('rejects fill dates that place Q1 after Q4', () => {
    const terms = service.normalizePeriodTerms(AssessmentTermType.QUARTERLY, [
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
      AssessmentTermCode.Q1,
    ]);

    expect(() =>
      service.normalizeTermFillWindows(
        terms,
        [
          { term: AssessmentTermCode.Q2, fillStartDate: '2026-10-20', fillEndDate: '2026-12-12' },
          { term: AssessmentTermCode.Q3, fillStartDate: '2026-12-13', fillEndDate: '2027-02-04' },
          { term: AssessmentTermCode.Q4, fillStartDate: '2027-02-05', fillEndDate: '2027-03-30' },
          { term: AssessmentTermCode.Q1, fillStartDate: '2027-03-31', fillEndDate: '2027-03-31' },
        ],
        new Date('2026-08-27T00:00:00.000Z'),
        new Date('2027-03-31T00:00:00.000Z'),
      ),
    ).toThrow('Q2 fill period must come after Q1');
  });

  it('uses the real assignment date even when the request context has a future test date', async () => {
    const realAssignmentDate = new Date('2026-08-27T07:30:00.000Z');
    const futureTestDate = new Date('2027-09-26T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(realAssignmentDate);
    const serviceWithTestDate = new ObjectiveService({
      ...(service as any).context,
      pmsCurrentDate: futureTestDate,
    } as RequestContext) as any;
    const employeeId = new Types.ObjectId();
    const period = {
      _id: new Types.ObjectId(),
      objectiveMasterId: new Types.ObjectId(),
      objectiveVersionId: new Types.ObjectId(),
      status: 'ACTIVE',
      terms: [AssessmentTermCode.Q1],
      fillStartDate: new Date('2026-08-27T00:00:00.000Z'),
      fillEndDate: new Date('2026-10-19T23:59:59.999Z'),
      termFillWindows: [
        {
          term: AssessmentTermCode.Q1,
          fillStartDate: new Date('2026-08-27T00:00:00.000Z'),
          fillEndDate: new Date('2026-10-19T23:59:59.999Z'),
        },
      ],
      pastTermEntryWindows: [],
    };

    serviceWithTestDate.requireAdminForObjectiveAssignment = jest.fn().mockResolvedValue(undefined);
    serviceWithTestDate.loadObjectiveAssignmentPeriod = jest.fn().mockResolvedValue(period);
    serviceWithTestDate.loadActiveObjectiveVersionForPeriod = jest.fn().mockResolvedValue({});
    jest.spyOn(ObjectiveMaster, 'findOne').mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ sourceType: FlexibleObjectiveSourceType.MANAGER_CREATED_OBJECTIVE }),
      }),
    } as any);
    jest.spyOn(User, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          _id: employeeId,
          name: 'Test Employee',
          employeeCode: 'EMP-001',
          active: true,
        },
      ]),
    } as any);
    jest.spyOn(ObjectiveEmployeeAssignment, 'find').mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    } as any);
    const createdAssignmentId = new Types.ObjectId();
    const createAssignment = jest
      .spyOn(ObjectiveEmployeeAssignment, 'create')
      .mockResolvedValue({ _id: createdAssignmentId } as any);
    serviceWithTestDate.audit = jest.fn().mockResolvedValue(undefined);

    const preview = await serviceWithTestDate.previewObjectiveAssignmentPeriodEmployees(
      period._id.toString(),
      { employeeIds: [employeeId.toString()] },
    );
    const applied = await serviceWithTestDate.applyObjectiveAssignmentPeriodEmployees(
      period._id.toString(),
      { employeeIds: [employeeId.toString()], confirm: true },
    );

    const [initialState] = serviceWithTestDate.buildObjectiveEmployeeAssignmentTermStates(
      period,
      actorId,
      realAssignmentDate,
    );

    expect(preview.newAssignments).toBe(1);
    expect(preview.blocked).toBe(0);
    expect(preview.rows[0].status).toBe('NEW');
    expect(applied.createdAssignmentIds).toEqual([createdAssignmentId.toString()]);
    expect((createAssignment.mock.calls[0][0] as any).termStates[0].status).toBe('OPEN');
    expect(initialState.status).toBe('OPEN');
    expect(
      serviceWithTestDate.resolveObjectiveEmployeeAssignmentTermWindowState(
        period,
        period.fillStartDate,
        period.fillEndDate,
      ).status,
    ).toBe('LOCKED');
  });
});
