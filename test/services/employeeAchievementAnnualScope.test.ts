import { Types } from 'mongoose';
import {
  AnnualWorkflowState,
  AssessmentTermCode,
  AssessmentTermType,
  ManagerReviewPeriodState,
  ObjectiveStatus,
  PmsRole,
  TermWorkflowState,
} from '../../src/constants/pms.enums';
import { EmployeeAchievementSubmissionService } from '../../src/services/employeeAchievementSubmission.service';
import { TermAssignment } from '../../src/models/pms-term-assignment.model';
import { TermCycle } from '../../src/models/pms-term-cycle.model';
import { ManagerReviewPeriodAssignment } from '../../src/models/pms-manager-review-period-assignment.model';
import { Objective } from '../../src/models/pms-objective.model';
import { EmployeeAchievementSubmission } from '../../src/models/pms-employee-achievement-submission.model';
import { accessService } from '../../src/services/access.service';
import type { RequestContext } from '../../src/types/context';

function queryResult<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  } as any;
}

function createService(currentDate = '2026-12-15T12:00:00.000Z') {
  const actorId = new Types.ObjectId();
  const context: RequestContext = {
    requestId: 'employee-achievement-annual-scope-test',
    reqRole: 'employee',
    pmsCurrentDate: new Date(currentDate),
    user: {
      _id: actorId,
      email: 'employee@example.com',
      name: 'Employee',
      role: PmsRole.EMPLOYEE,
      departmentId: 'Engineering',
      active: true,
      country: 'IN',
      currency: 'INR',
      licenseType: 'FULL',
      portalAccess: true,
    },
  };

  return new EmployeeAchievementSubmissionService(context) as any;
}

describe('EmployeeAchievementSubmissionService - annual common submission', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads Q1-Q2 and Q3-Q4 grouped reviews through the same annual submission record', async () => {
    const service = createService();
    const annualAssignmentId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const templateVersionId = new Types.ObjectId();
    const employeeId = service.context.user._id;
    const managerId = new Types.ObjectId();
    const q1 = {
      _id: new Types.ObjectId(),
      annualAssignmentId,
      cycleId,
      employeeId,
      assignedManagerId: managerId,
      assessmentTermCode: AssessmentTermCode.Q1,
      termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    };
    const q2 = {
      ...q1,
      _id: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q2,
      termState: TermWorkflowState.NOT_STARTED,
    };
    const q3 = {
      ...q1,
      _id: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q3,
      termState: TermWorkflowState.NOT_STARTED,
    };
    const q4 = {
      ...q1,
      _id: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q4,
      termState: TermWorkflowState.NOT_STARTED,
    };
    jest.spyOn(service, 'getTermAssignment')
      .mockResolvedValueOnce(q1)
      .mockResolvedValueOnce(q2)
      .mockResolvedValueOnce(q3)
      .mockResolvedValueOnce(q4);
    jest.spyOn(service, 'assertViewAccess').mockResolvedValue(undefined);
    jest.spyOn(service, 'getAnnualAssignment').mockResolvedValue({
      _id: annualAssignmentId,
      templateVersionId,
    });
    jest.spyOn(service, 'getTemplateVersion').mockResolvedValue({});
    jest.spyOn(service, 'getAchievementSection').mockReturnValue({
      sectionKey: 'employee_achievement_submission',
      sectionLabel: 'Employee Achievement',
      fields: [],
    });
    jest.spyOn(service, 'getAchievementField').mockReturnValue({
      fieldKey: 'achievement_items',
      fieldLabel: 'Achievement Items',
    });
    jest.spyOn(service, 'resolveTemplateConfig').mockReturnValue({
      employeeAchievementEnabled: true,
      reviewFlowMode: 'ACHIEVEMENT_THEN_MANAGER',
    });
    jest.spyOn(service, 'resolveEmployeeAchievementFields').mockResolvedValue([]);
    jest.spyOn(service, 'ensureAchievementStageOpen').mockImplementation(async (assignment: any) => assignment);
    jest.spyOn(service, 'getEligibleObjectives').mockResolvedValue([]);
    jest.spyOn(service, 'hasAnnualObjectiveSettingStarted').mockResolvedValue(true);
    jest.spyOn(service, 'resolveCommonAchievementEditPolicy').mockResolvedValue({ canEdit: true });
    jest.spyOn(service, 'resolveActualColumnMetadata').mockResolvedValue({
      assessmentTermType: AssessmentTermType.QUARTERLY,
      currentTerm: AssessmentTermCode.Q1,
      configuredActualColumns: [],
    });
    const submissionLookup = jest.spyOn(EmployeeAchievementSubmission, 'findOne')
      .mockReturnValue(queryResult(null));

    const q1Detail = await service.getSubmission(q1._id.toString());
    const q2Detail = await service.getSubmission(q2._id.toString());
    const q3Detail = await service.getSubmission(q3._id.toString());
    const q4Detail = await service.getSubmission(q4._id.toString());

    expect(q1Detail.annualAssignmentId).toBe(annualAssignmentId.toString());
    expect(q2Detail.annualAssignmentId).toBe(annualAssignmentId.toString());
    expect(q3Detail.annualAssignmentId).toBe(annualAssignmentId.toString());
    expect(q4Detail.annualAssignmentId).toBe(annualAssignmentId.toString());
    expect(q1Detail.canEdit).toBe(true);
    expect(q2Detail.canEdit).toBe(true);
    expect(q3Detail.canEdit).toBe(true);
    expect(q4Detail.canEdit).toBe(true);
    expect(submissionLookup).toHaveBeenCalledTimes(4);
    for (let callNumber = 1; callNumber <= 4; callNumber += 1) {
      expect(submissionLookup).toHaveBeenNthCalledWith(callNumber, {
        annualAssignmentId,
        isDeleted: false,
      });
    }
  });

  it('allows employee mutation when objective setting starts without requiring objective submission', async () => {
    const service = createService();
    const employeeId = service.context.user._id;
    const annualAssignmentId = new Types.ObjectId();
    const termAssignment = {
      _id: new Types.ObjectId(),
      annualAssignmentId,
      employeeId,
      assignedManagerId: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q1,
      termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    };
    jest.spyOn(service, 'assertAchievementWorkflowAllowed').mockResolvedValue(undefined);
    jest.spyOn(accessService, 'canPerform').mockResolvedValue({ allowed: true } as any);
    jest.spyOn(service, 'hasAnnualObjectiveSettingStarted').mockResolvedValue(true);
    jest.spyOn(service, 'getAnnualAssignment').mockResolvedValue({
      _id: annualAssignmentId,
      annualState: AnnualWorkflowState.IN_PROGRESS,
    });
    jest.spyOn(service, 'resolveCommonAchievementEditPolicy').mockResolvedValue({ canEdit: true });

    await expect(service.assertEmployeeEditAccess(termAssignment)).resolves.toBeUndefined();

    expect(service.resolveCommonAchievementEditPolicy).toHaveBeenCalledWith(
      termAssignment,
      expect.objectContaining({ annualState: AnnualWorkflowState.IN_PROGRESS }),
    );
  });

  it.each([
    [
      AssessmentTermType.QUARTERLY,
      AssessmentTermCode.Q1,
      [
        AssessmentTermCode.Q1,
        AssessmentTermCode.Q2,
        AssessmentTermCode.Q3,
        AssessmentTermCode.Q4,
      ],
    ],
    [
      AssessmentTermType.HALF_YEARLY,
      AssessmentTermCode.H1,
      [AssessmentTermCode.H1, AssessmentTermCode.H2],
    ],
    [AssessmentTermType.YEARLY, AssessmentTermCode.Y1, [AssessmentTermCode.Y1]],
  ])('opens %s achievement access on the first objective-setting start date', async (
    termType,
    firstTermCode,
    applicableTerms,
  ) => {
    const serviceBeforeStart = createService('2026-06-30T12:00:00.000Z');
    const serviceOnStart = createService('2026-07-01T12:00:00.000Z');
    const annualAssignmentId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const firstCycleTermId = new Types.ObjectId();
    const termAssignment = {
      annualAssignmentId,
      cycleId,
      assessmentTermCode: firstTermCode,
    };
    const annualAssignment = {
      applicableTerms,
    };
    jest.spyOn(serviceBeforeStart, 'resolveAssessmentTermType')
      .mockResolvedValue(termType);
    jest.spyOn(serviceOnStart, 'resolveAssessmentTermType')
      .mockResolvedValue(termType);
    jest.spyOn(TermAssignment, 'findOne').mockReturnValue(queryResult({
      _id: new Types.ObjectId(),
      annualAssignmentId,
      cycleTermId: firstCycleTermId,
      assessmentTermCode: firstTermCode,
      termState: TermWorkflowState.NOT_STARTED,
    }));
    jest.spyOn(TermCycle, 'findById').mockReturnValue(queryResult({
      objectiveSettingWindow: {
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        endDate: new Date('2026-07-07T00:00:00.000Z'),
      },
    }));
    const exists = jest.spyOn(TermAssignment, 'exists').mockResolvedValue(null);

    await expect(
      serviceBeforeStart.hasAnnualObjectiveSettingStarted(termAssignment, annualAssignment),
    ).resolves.toBe(false);
    await expect(
      serviceOnStart.hasAnnualObjectiveSettingStarted(termAssignment, annualAssignment),
    ).resolves.toBe(true);
    expect(exists).not.toHaveBeenCalled();
  });

  it('keeps the legacy state fallback when objective-setting dates are unavailable', async () => {
    const service = createService();
    const annualAssignmentId = new Types.ObjectId();
    const termAssignment = {
      annualAssignmentId,
      cycleId: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q1,
    };
    jest.spyOn(service, 'resolveAssessmentTermType').mockResolvedValue(AssessmentTermType.QUARTERLY);
    jest.spyOn(TermAssignment, 'findOne').mockReturnValue(queryResult(null));
    jest.spyOn(TermCycle, 'findOne').mockReturnValue(queryResult(null));
    const exists = jest.spyOn(TermAssignment, 'exists').mockResolvedValue({
      _id: new Types.ObjectId(),
    } as any);

    await expect(
      service.hasAnnualObjectiveSettingStarted(termAssignment, {}),
    ).resolves.toBe(true);
    expect(exists).toHaveBeenCalledWith({
      annualAssignmentId,
      termState: { $ne: TermWorkflowState.NOT_STARTED },
      isDeleted: false,
    });
  });

  it.each([
    [AssessmentTermType.QUARTERLY, AssessmentTermCode.Q4],
    [AssessmentTermType.HALF_YEARLY, AssessmentTermCode.H2],
    [AssessmentTermType.YEARLY, AssessmentTermCode.Y1],
  ])('uses the final %s term manager-review deadline', async (termType, finalTermCode) => {
    const service = createService();
    const annualAssignmentId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const finalTermAssignment = {
      _id: new Types.ObjectId(),
      annualAssignmentId,
      cycleId,
      cycleTermId: new Types.ObjectId(),
      assessmentTermCode: finalTermCode,
      termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
    };
    jest.spyOn(service, 'resolveAssessmentTermType').mockResolvedValue(termType);
    jest.spyOn(TermAssignment, 'findOne').mockReturnValue(queryResult(finalTermAssignment));
    jest.spyOn(ManagerReviewPeriodAssignment, 'findOne').mockReturnValue(queryResult(null));
    jest.spyOn(TermCycle, 'findById').mockReturnValue(queryResult({
      managerReviewWindow: {
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
    }));

    const policy = await service.resolveCommonAchievementEditPolicy(
      {
        annualAssignmentId,
        cycleId,
        assessmentTermCode: AssessmentTermCode.Q1,
      },
      {
        annualState: AnnualWorkflowState.IN_PROGRESS,
        applicableTerms: [finalTermCode],
      },
    );

    expect(TermAssignment.findOne).toHaveBeenCalledWith(expect.objectContaining({
      annualAssignmentId,
      assessmentTermCode: finalTermCode,
    }));
    expect(policy.canEdit).toBe(true);
    expect(policy.deadline).toEqual(new Date('2026-12-31T00:00:00.000Z'));
  });

  it('locks the common submission when the grouped review containing the final term is finalized', async () => {
    const service = createService();
    const annualAssignmentId = new Types.ObjectId();
    jest.spyOn(service, 'resolveAssessmentTermType').mockResolvedValue(AssessmentTermType.QUARTERLY);
    jest.spyOn(TermAssignment, 'findOne').mockReturnValue(queryResult({
      _id: new Types.ObjectId(),
      termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
    }));
    jest.spyOn(ManagerReviewPeriodAssignment, 'findOne').mockReturnValue(queryResult({
      reviewState: ManagerReviewPeriodState.FINALIZED,
      anchorTermAssignmentId: new Types.ObjectId(),
    }));

    const policy = await service.resolveCommonAchievementEditPolicy(
      {
        annualAssignmentId,
        cycleId: new Types.ObjectId(),
        assessmentTermCode: AssessmentTermCode.Q2,
      },
      {
        annualState: AnnualWorkflowState.IN_PROGRESS,
        applicableTerms: [
          AssessmentTermCode.Q1,
          AssessmentTermCode.Q2,
          AssessmentTermCode.Q3,
          AssessmentTermCode.Q4,
        ],
      },
    );

    expect(policy.canEdit).toBe(false);
    expect(policy.reason).toContain('final review term is finalized');
  });

  it('uses the grouped final review anchor manager-review deadline', async () => {
    const service = createService();
    const annualAssignmentId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    const anchorTermAssignmentId = new Types.ObjectId();
    const anchorCycleTermId = new Types.ObjectId();
    jest.spyOn(service, 'resolveAssessmentTermType').mockResolvedValue(AssessmentTermType.QUARTERLY);
    jest.spyOn(TermAssignment, 'findOne').mockReturnValue(queryResult({
      _id: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q4,
      termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
    }));
    jest.spyOn(ManagerReviewPeriodAssignment, 'findOne').mockReturnValue(queryResult({
      reviewState: ManagerReviewPeriodState.MANAGER_REVIEW_OPEN,
      anchorTermAssignmentId,
    }));
    jest.spyOn(TermAssignment, 'findById').mockReturnValue(queryResult({
      _id: anchorTermAssignmentId,
      assessmentTermCode: AssessmentTermCode.Q4,
      cycleTermId: anchorCycleTermId,
    }));
    jest.spyOn(TermCycle, 'findById').mockReturnValue(queryResult({
      managerReviewWindow: {
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
    }));

    const policy = await service.resolveCommonAchievementEditPolicy(
      { annualAssignmentId, cycleId, assessmentTermCode: AssessmentTermCode.Q3 },
      {
        annualState: AnnualWorkflowState.IN_PROGRESS,
        applicableTerms: [
          AssessmentTermCode.Q1,
          AssessmentTermCode.Q2,
          AssessmentTermCode.Q3,
          AssessmentTermCode.Q4,
        ],
      },
    );

    expect(TermAssignment.findById).toHaveBeenCalledWith(anchorTermAssignmentId);
    expect(TermCycle.findById).toHaveBeenCalledWith(anchorCycleTermId);
    expect(policy.canEdit).toBe(true);
    expect(policy.deadline).toEqual(new Date('2026-12-31T00:00:00.000Z'));
  });

  it.each([
    AnnualWorkflowState.ALL_TERMS_FINALIZED,
    AnnualWorkflowState.APPRAISAL_WINDOW_OPEN,
    AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT,
    AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED,
    AnnualWorkflowState.ANNUAL_FINALIZED,
    AnnualWorkflowState.VISIBILITY_ENABLED,
    AnnualWorkflowState.COMMUNICATION_READY,
    AnnualWorkflowState.COMMUNICATION_SENT,
    AnnualWorkflowState.CLOSED,
    AnnualWorkflowState.ARCHIVED,
    AnnualWorkflowState.CANCELLED,
  ])('keeps the common submission read-only in annual state %s', async (annualState) => {
    const service = createService();

    const policy = await service.resolveCommonAchievementEditPolicy(
      {
        annualAssignmentId: new Types.ObjectId(),
        cycleId: new Types.ObjectId(),
        assessmentTermCode: AssessmentTermCode.Q4,
      },
      { annualState },
    );

    expect(policy.canEdit).toBe(false);
    expect(policy.reason).toContain('finalized');
  });

  it('makes the common submission read-only after the final manager-review end date', async () => {
    const service = createService('2027-01-01T12:00:00.000Z');
    const annualAssignmentId = new Types.ObjectId();
    const cycleId = new Types.ObjectId();
    jest.spyOn(service, 'resolveAssessmentTermType').mockResolvedValue(AssessmentTermType.QUARTERLY);
    jest.spyOn(TermAssignment, 'findOne').mockReturnValue(queryResult({
      _id: new Types.ObjectId(),
      annualAssignmentId,
      cycleId,
      cycleTermId: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q4,
      termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
    }));
    jest.spyOn(ManagerReviewPeriodAssignment, 'findOne').mockReturnValue(queryResult(null));
    jest.spyOn(TermCycle, 'findById').mockReturnValue(queryResult({
      managerReviewWindow: {
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
    }));

    const policy = await service.resolveCommonAchievementEditPolicy(
      { annualAssignmentId, cycleId, assessmentTermCode: AssessmentTermCode.Q4 },
      {
        annualState: AnnualWorkflowState.IN_PROGRESS,
        applicableTerms: [
          AssessmentTermCode.Q1,
          AssessmentTermCode.Q2,
          AssessmentTermCode.Q3,
          AssessmentTermCode.Q4,
        ],
      },
    );

    expect(policy.canEdit).toBe(false);
    expect(policy.reason).toContain('Manager Review end date has passed');
  });

  it('loads the same annual set of approved objectives from every term tab', async () => {
    const service = createService();
    const annualAssignmentId = new Types.ObjectId();
    const q1Id = new Types.ObjectId();
    const q2Id = new Types.ObjectId();
    const q3Id = new Types.ObjectId();
    jest.spyOn(TermAssignment, 'find').mockReturnValue(queryResult([
      { _id: q1Id, assessmentTermCode: AssessmentTermCode.Q1 },
      { _id: q2Id, assessmentTermCode: AssessmentTermCode.Q2 },
      { _id: q3Id, assessmentTermCode: AssessmentTermCode.Q3 },
    ]));
    jest.spyOn(Objective, 'find').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    } as any);

    await service.getEligibleObjectives(annualAssignmentId);

    expect(Objective.find).toHaveBeenCalledWith({
      termAssignmentId: { $in: [q1Id, q2Id, q3Id] },
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
      isDeleted: false,
    });
  });

  it('keeps Performance Filling reads separate from the term achievement edit policy', async () => {
    const service = createService();
    const annualAssignmentId = new Types.ObjectId();
    const termAssignment = {
      _id: new Types.ObjectId(),
      annualAssignmentId,
      cycleId: new Types.ObjectId(),
      employeeId: service.context.user._id,
      assignedManagerId: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q1,
      termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    };
    jest.spyOn(service, 'getTermAssignment').mockResolvedValue(termAssignment);
    jest.spyOn(service, 'assertViewAccess').mockResolvedValue(undefined);
    jest.spyOn(service, 'getAnnualAssignment').mockResolvedValue({
      _id: annualAssignmentId,
      templateVersionId: new Types.ObjectId(),
    });
    jest.spyOn(service, 'getTemplateVersion').mockResolvedValue({});
    jest.spyOn(service, 'getAchievementSection').mockReturnValue({
      sectionKey: 'employee_achievement_submission',
      sectionLabel: 'Employee Achievement',
      fields: [],
    });
    jest.spyOn(service, 'getAchievementField').mockReturnValue({
      fieldKey: 'achievement_items',
      fieldLabel: 'Achievement Items',
    });
    jest.spyOn(service, 'resolveTemplateConfig').mockReturnValue({
      employeeAchievementEnabled: false,
      reviewFlowMode: 'MANAGER_ONLY',
    });
    jest.spyOn(service, 'resolveEmployeeAchievementFields').mockResolvedValue([]);
    const ensureAchievementStageOpen = jest
      .spyOn(service, 'ensureAchievementStageOpen')
      .mockImplementation(async (assignment: any) => assignment);
    const commonPolicy = jest
      .spyOn(service, 'resolveCommonAchievementEditPolicy')
      .mockResolvedValue({ canEdit: false });
    const performancePolicy = jest
      .spyOn(service, 'resolvePerformanceFillingAssignedFormEditPolicy')
      .mockResolvedValue({ canEdit: true, deadline: new Date('2027-07-27T00:00:00.000Z') });
    jest.spyOn(service, 'getEligibleObjectives').mockResolvedValue([]);
    jest.spyOn(service, 'resolveActualColumnMetadata').mockResolvedValue({
      assessmentTermType: AssessmentTermType.QUARTERLY,
      currentTerm: AssessmentTermCode.Q1,
      configuredActualColumns: [],
    });
    jest.spyOn(service, 'findLegacyPerformanceFillingValues').mockResolvedValue([]);
    jest.spyOn(EmployeeAchievementSubmission, 'findOne').mockReturnValue(queryResult(null));

    const detail = await service.getSubmission(termAssignment._id.toString(), true);

    expect(detail.canEdit).toBe(true);
    expect(detail.editDeadline).toBe('2027-07-27T00:00:00.000Z');
    expect(performancePolicy).toHaveBeenCalled();
    expect(commonPolicy).not.toHaveBeenCalled();
    expect(ensureAchievementStageOpen).not.toHaveBeenCalled();
  });

  it('persists the four Performance Filling fields once on the annual submission', async () => {
    const service = createService();
    const annualAssignmentId = new Types.ObjectId();
    const termAssignment = {
      _id: new Types.ObjectId(),
      annualAssignmentId,
      cycleId: new Types.ObjectId(),
      employeeId: service.context.user._id,
      assignedManagerId: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q1,
      termState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    };
    const values = [
      ['personal_development_2_objectives', 'performance_analysis', 'Annual analysis'],
      ['personal_development_2_employee_term_inputs', 'special_achievements_and_improvements', 'Annual achievement'],
      ['personal_development_2_employee_term_inputs', 'appraisee_response', 'Annual response'],
      ['personal_development_2_employee_term_inputs', 'contribution_to_cfts', 'Annual contribution'],
    ].map(([sectionKey, fieldKey, valueText]) => ({ sectionKey, fieldKey, valueText }));
    jest.spyOn(service, 'getTermAssignment').mockResolvedValue(termAssignment);
    const performanceAccess = jest
      .spyOn(service, 'assertPerformanceFillingAssignedFormAccess')
      .mockResolvedValue(undefined);
    const achievementAccess = jest
      .spyOn(service, 'assertEmployeeEditAccess')
      .mockResolvedValue(undefined);
    jest.spyOn(service, 'getAnnualAssignment').mockResolvedValue({
      _id: annualAssignmentId,
      templateVersionId: new Types.ObjectId(),
    });
    jest.spyOn(EmployeeAchievementSubmission, 'findOne').mockResolvedValue(null);
    const createSubmission = jest
      .spyOn(EmployeeAchievementSubmission, 'create')
      .mockImplementation(async (input: any) => ({
        ...input,
        _id: new Types.ObjectId(),
        achievementValues: input.achievementValues,
        toObject() {
          return { ...this };
        },
      }) as any);
    jest.spyOn(service, 'audit').mockResolvedValue(undefined);

    const saved = await service.saveAssignedFormValues(termAssignment._id.toString(), {
      values,
      performanceFilling: true,
    });

    expect(performanceAccess).toHaveBeenCalledWith(termAssignment);
    expect(achievementAccess).not.toHaveBeenCalled();
    expect(createSubmission).toHaveBeenCalledWith(expect.objectContaining({
      annualAssignmentId,
      achievementValues: expect.arrayContaining([
        expect.objectContaining({ fieldKey: 'performance_analysis' }),
        expect.objectContaining({ fieldKey: 'special_achievements_and_improvements' }),
        expect.objectContaining({ fieldKey: 'appraisee_response' }),
        expect.objectContaining({ fieldKey: 'contribution_to_cfts' }),
      ]),
    }));
    expect(saved.objectiveValues).toHaveLength(1);
    expect(saved.achievementValues).toHaveLength(3);
  });

  it('uses the newest non-empty legacy Performance Filling value only when annual data is absent', async () => {
    const service = createService();
    const annualAssignmentId = new Types.ObjectId();
    jest.spyOn(TermAssignment, 'find').mockReturnValue(queryResult([
      {
        termSummary: {
          objectiveTemplateValues: [{
            sectionKey: 'personal_development_2_objectives',
            fieldKey: 'performance_analysis',
            valueText: '   ',
          }],
        },
      },
      {
        termSummary: {
          objectiveTemplateValues: [{
            sectionKey: 'personal_development_2_objectives',
            fieldKey: 'performance_analysis',
            valueText: 'Newest non-empty legacy value',
          }],
        },
      },
      {
        termSummary: {
          objectiveTemplateValues: [{
            sectionKey: 'personal_development_2_objectives',
            fieldKey: 'performance_analysis',
            valueText: 'Older legacy value',
          }],
        },
      },
    ]));

    const legacy = await service.findLegacyPerformanceFillingValues(annualAssignmentId);
    const annualValue = {
      sectionKey: 'personal_development_2_objectives',
      fieldKey: 'performance_analysis',
      valueText: 'Annual value wins',
    };
    const merged = service.mergeLegacyPerformanceFillingValues(
      { achievementValues: [annualValue] },
      legacy,
      {},
      {},
    );

    expect(legacy).toEqual([
      expect.objectContaining({ valueText: 'Newest non-empty legacy value' }),
    ]);
    expect(merged.achievementValues).toEqual([annualValue]);
  });

});
