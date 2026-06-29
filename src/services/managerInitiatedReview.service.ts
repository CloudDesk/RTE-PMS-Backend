import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualWorkflowState,
  AssessmentTermCode,
  AssessmentTermType,
  PmsRole,
  PmsTemplateFieldType,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  PmsTemplateStatus,
  TermWorkflowState,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { PmsTemplate } from '../models/pms-template.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { TermReview } from '../models/pms-term-review.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import { User } from '../models/user.model';
import { auditService } from './audit.service';
import { getSubordinateUserIds } from '../utilis/userHierarchy';
import type { IPmsTemplateVersion, ITemplateSection } from '../models/pms-template-version.model';

export interface ManagerReviewTeamQuery {
  search?: string;
  page?: string | number;
  limit?: string | number;
  includeAllTeam?: string | boolean;
}

export interface ManagerReviewQueueQuery extends ManagerReviewTeamQuery {
  status?: string;
  department?: string;
  reviewType?: string;
  dueDate?: string;
}

export interface CreateManagerReviewTemplateInput {
  name: string;
  code?: string;
  description?: string;
  sections?: ITemplateSection[];
}

export interface UpdateManagerReviewTemplateInput {
  name?: string;
  description?: string;
}

export interface LaunchManagerReviewInput {
  employeeId: string;
  templateVersionId: string;
  reviewPeriodLabel?: string;
  startDate?: string | Date;
  endDate?: string | Date;
}

const DEFAULT_MANAGER_REVIEW_FLOW_POLICY = {
  objectiveRequired: false,
  employeeSubmissionRequired: false,
  achievementSubmissionRequired: false,
  skipObjectiveApproval: true,
} as const;

export class ManagerInitiatedReviewService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async listEligibleTeamMembers(query: ManagerReviewTeamQuery = {}) {
    const managerId = this.requireManagerActorId();
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 20), 100);
    const includeAllTeam = query.includeAllTeam === true || query.includeAllTeam === 'true';
    const subordinateIds = await getSubordinateUserIds(managerId);

    if (subordinateIds.length === 0) {
      return { items: [], total: 0, page, limit };
    }

    const filter: Record<string, unknown> = {
      _id: { $in: subordinateIds },
      active: true,
    };

    if (!includeAllTeam) {
      const probationKeywords = ['intern', 'probation', 'fresher', 'trainee', 'junior'];
      filter.$or = [
        { isIntern: true },
        ...probationKeywords.flatMap((keyword) => [
          { role: { $regex: keyword, $options: 'i' } },
          { specificRole: { $regex: keyword, $options: 'i' } },
          { employmentStatus: { $regex: keyword, $options: 'i' } },
        ]),
      ];
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { employeeCode: { $regex: search, $options: 'i' } },
          ],
        },
      ];
    }

    const [items, total] = await Promise.all([
      User.find(filter)
        .select('name email role specificRole departmentId active joiningDate probationDate managerId managerName employeeCode employmentStatus isIntern location')
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async listManagerTemplates() {
    const managerId = this.requireManagerActorId();
    const templates = await PmsTemplate.find({
      isDeleted: false,
      status: PmsTemplateStatus.ACTIVE,
      $or: [
        { visibilityScope: 'GLOBAL' },
        { ownerManagerId: new Types.ObjectId(managerId), visibilityScope: 'MANAGER_TEAM' },
      ],
    })
      .sort({ templateLabel: 1, name: 1 })
      .lean();

    const versionIds = templates
      .map((template) => template.currentVersionId)
      .filter((id): id is Types.ObjectId => Boolean(id));
    const versions = await PmsTemplateVersion.find({
      _id: { $in: versionIds },
      status: PmsTemplateStatus.ACTIVE,
      isDeleted: false,
    })
      .select('_id templateId versionNo status metadata templateOwnership launchPolicy flowPolicy')
      .lean();
    const versionByTemplateId = new Map(
      versions.map((version) => [version.templateId.toString(), version]),
    );

    return templates
      .map((template) => ({
        ...template,
        currentVersion: versionByTemplateId.get(template._id.toString()) ?? null,
      }))
      .filter((template) => this.isManagerLaunchTemplate(template, managerId));
  }

  async getManagerReviewQueue(query: ManagerReviewQueueQuery = {}) {
    const managerId = this.requireManagerActorId();
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 100), 200);
    const search = query.search?.trim().toLowerCase() || '';
    const statusFilter = query.status?.trim().toUpperCase() || '';
    const departmentFilter = query.department?.trim().toLowerCase() || '';
    const reviewTypeFilter = query.reviewType?.trim().toLowerCase() || '';
    const dueDateFilter = query.dueDate?.trim() || '';
    const subordinateIds = await getSubordinateUserIds(managerId);
    const templates = await this.listManagerTemplates();
    const defaultTemplate = templates.find((template: any) => template.currentVersion?._id) || null;
    const managerObjectId = new Types.ObjectId(managerId);

    if (subordinateIds.length === 0) {
      return {
        pending: [],
        inProgress: [],
        completed: [],
        blocked: [],
        templates,
        defaultTemplateVersionId: defaultTemplate?.currentVersion?._id?.toString?.() || null,
        defaultTemplateName: defaultTemplate?.name || null,
        counts: { pending: 0, inProgress: 0, completed: 0, blocked: 0, ready: 0 },
        meta: { page, limit, total: 0 },
      };
    }

    const [employees, cycles] = await Promise.all([
      User.find({ _id: { $in: subordinateIds }, active: true })
        .select('name email role specificRole departmentId active joiningDate probationDate managerId managerName employeeCode employmentStatus isIntern location')
        .sort({ name: 1 })
        .lean(),
      AnnualCycle.find({
        launchSource: 'MANAGER_INITIATED',
        launchedByUserId: managerObjectId,
        isDeleted: false,
      })
        .select('_id name code startDate endDate status launchedAt managerInitiatedReview')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const cycleIds = cycles.map((cycle: any) => cycle._id);
    const [termAssignments, termCycles, termReviews] = await Promise.all([
      TermAssignment.find({
        cycleId: { $in: cycleIds },
        assignedManagerId: managerObjectId,
        isDeleted: false,
      })
        .select('_id annualAssignmentId cycleId cycleTermId employeeId templateVersionId termState termLabel termScore termRating termSummary createdAt updatedAt')
        .lean(),
      TermCycle.find({ cycleId: { $in: cycleIds }, isDeleted: false })
        .select('_id cycleId managerReviewWindow termFinalizationWindow startDate endDate')
        .lean(),
      TermReview.find({ cycleId: { $in: cycleIds }, managerId: managerObjectId, isDeleted: false })
        .select('termAssignmentId reviewStatus comments score overallScore overallRating recommendation achievements developmentObservations attachments submittedAt finalizedAt')
        .lean(),
    ]);

    const cycleById = new Map(cycles.map((cycle: any) => [cycle._id.toString(), cycle]));
    const termCycleById = new Map(termCycles.map((cycle: any) => [cycle._id.toString(), cycle]));
    const reviewByTermAssignmentId = new Map(
      termReviews.map((review: any) => [review.termAssignmentId.toString(), review]),
    );
    const assignmentsByEmployeeId = new Map<string, any[]>();
    for (const assignment of termAssignments as any[]) {
      const employeeId = assignment.employeeId?.toString?.();
      if (!employeeId) continue;
      assignmentsByEmployeeId.set(employeeId, [
        ...(assignmentsByEmployeeId.get(employeeId) || []),
        assignment,
      ]);
    }

    const pending = employees.map((employee: any) => {
      const existing = assignmentsByEmployeeId.get(employee._id.toString())?.[0] || null;
      const eligible = this.isConfirmationReviewEligible(employee);
      const status = !defaultTemplate
        ? 'MISSING_REVIEW_FORM'
        : existing
          ? 'ALREADY_STARTED'
          : eligible
            ? 'READY'
            : 'NOT_ELIGIBLE';
      return {
        employee,
        employeeId: employee._id.toString(),
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.departmentId,
        joiningDate: employee.joiningDate,
        reviewType: 'Confirmation Review',
        status,
        canStartReview: status === 'READY',
        cannotStartReason: this.queueCannotStartReason(status),
        primaryAction: status === 'READY' ? 'START_REVIEW' : existing ? 'OPEN_REVIEW' : 'NONE',
        dueDate: employee.probationDate || null,
        existingReviewId: existing?._id?.toString?.() || null,
      };
    });

    const reviewRows = (termAssignments as any[]).map((assignment) => {
      const cycle = cycleById.get(assignment.cycleId?.toString?.() || '');
      const termCycle = termCycleById.get(assignment.cycleTermId?.toString?.() || '');
      const termReview = reviewByTermAssignmentId.get(assignment._id.toString()) || null;
      const employee = employees.find((item: any) => item._id.toString() === assignment.employeeId?.toString?.());
      const dueDate = termCycle?.managerReviewWindow?.endDate || cycle?.endDate || null;
      const queueStatus = this.queueStatusForTermState(assignment.termState, dueDate);
      return {
        id: assignment._id.toString(),
        termAssignmentId: assignment._id.toString(),
        employeeId: assignment.employeeId?.toString?.(),
        employeeName: employee?.name || 'Employee',
        employeeCode: employee?.employeeCode,
        department: employee?.departmentId,
        reviewName: assignment.termLabel || cycle?.name || 'Confirmation Review',
        cycleName: cycle?.name || assignment.termLabel || 'Confirmation Review',
        startedOn: termCycle?.managerReviewWindow?.startDate || cycle?.startDate || assignment.createdAt,
        dueDate,
        completedOn: termReview?.finalizedAt || termReview?.submittedAt || assignment.updatedAt,
        currentStep: this.queueStepLabel(queueStatus),
        status: queueStatus,
        primaryAction: queueStatus === 'COMPLETED' || queueStatus === 'SUBMITTED' ? 'VIEW' : 'CONTINUE',
        result: assignment.termRating || termReview?.overallRating || termReview?.reviewStatus || queueStatus,
        termState: assignment.termState,
        score: assignment.termScore ?? termReview?.overallScore ?? termReview?.score,
        rating: assignment.termRating || termReview?.overallRating,
        comments: termReview?.comments,
        recommendation: termReview?.recommendation,
        achievements: termReview?.achievements,
        developmentObservations: termReview?.developmentObservations,
        attachments: termReview?.attachments || [],
      };
    });

    const inProgress = reviewRows.filter((row) => row.status === 'IN_PROGRESS' || row.status === 'OVERDUE');
    const completed = reviewRows.filter((row) => row.status === 'SUBMITTED' || row.status === 'COMPLETED');
    const blocked = pending.filter((row) => !row.canStartReview && row.status !== 'ALREADY_STARTED');

    const queueFilters = { search, statusFilter, departmentFilter, reviewTypeFilter, dueDateFilter };
    const filteredPending = this.filterQueueRows(pending, queueFilters);
    const filteredInProgress = this.filterQueueRows(inProgress, queueFilters);
    const filteredCompleted = this.filterQueueRows(completed, queueFilters);
    const filteredBlocked = this.filterQueueRows(blocked, queueFilters);

    return {
      pending: filteredPending.slice((page - 1) * limit, page * limit),
      inProgress: filteredInProgress,
      completed: filteredCompleted,
      blocked: filteredBlocked,
      templates,
      defaultTemplateVersionId: defaultTemplate?.currentVersion?._id?.toString?.() || null,
      defaultTemplateName: defaultTemplate?.name || null,
      counts: {
        pending: filteredPending.length,
        inProgress: filteredInProgress.length,
        completed: filteredCompleted.length,
        blocked: filteredBlocked.length,
        ready: filteredPending.filter((row) => row.status === 'READY').length,
      },
      meta: {
        page,
        limit,
        total: filteredPending.length,
      },
    };
  }

  async getTemplate(templateId: string) {
    const managerId = this.requireManagerActorId();
    return this.getAvailableTemplateWithVersion(templateId, managerId);
  }

  async createManagerTemplate(input: CreateManagerReviewTemplateInput) {
    const managerId = this.requireManagerActorId();
    const managerObjectId = new Types.ObjectId(managerId);
    const name = this.requireText(input.name, 'Template name');
    const code = this.normalizeManagerTemplateCode(input.code || name, managerId);
    const existing = await PmsTemplate.findOne({ code, isDeleted: false }).lean();

    if (existing) {
      throw new Error('Template code already exists');
    }

    const sections = this.normalizeManagerTemplateSections(input.sections);
    const template = await PmsTemplate.create({
      name,
      code,
      description: input.description?.trim() || undefined,
      status: PmsTemplateStatus.ACTIVE,
      effectiveDate: new Date(),
      createdByRole: 'MANAGER',
      ownerManagerId: managerObjectId,
      visibilityScope: 'MANAGER_TEAM',
      templateLabel: 'Manager Template',
      approvalStatus: 'ACTIVE',
      createdBy: managerObjectId,
      updatedBy: managerObjectId,
    });

    const version = await PmsTemplateVersion.create({
      templateId: template._id,
      versionNo: 1,
      status: PmsTemplateStatus.ACTIVE,
      sections,
      metadata: {
        purpose: 'MANAGER_INITIATED_REVIEW',
        reviewType: 'CONFIRMATION_PROBATION_REVIEW',
      },
      templateOwnership: {
        createdByRole: 'MANAGER',
        ownerManagerId: managerId,
        visibilityScope: 'MANAGER_TEAM',
        templateLabel: 'Manager Template',
        approvalStatus: 'ACTIVE',
      },
      launchPolicy: {
        launchOwner: 'MANAGER',
        launchSource: 'MANAGER_INITIATED',
      },
      flowPolicy: DEFAULT_MANAGER_REVIEW_FLOW_POLICY,
      scoringConfig: { mode: 'MANUAL' },
      annualScoringConfig: { mode: 'MANUAL', assessmentTermType: AssessmentTermType.YEARLY },
      isLocked: true,
      lockedAt: new Date(),
      activatedAt: new Date(),
      createdBy: managerObjectId,
      updatedBy: managerObjectId,
    });

    template.currentVersionId = version._id;
    await template.save();

    await this.audit('PMS_MANAGER_TEMPLATE_CREATED', 'PMS_TEMPLATE', template._id.toString(), {
      template,
      version,
    });

    return { template, version };
  }

  async updateManagerTemplate(templateId: string, input: UpdateManagerReviewTemplateInput) {
    const managerId = this.requireManagerActorId();
    const managerObjectId = new Types.ObjectId(managerId);
    const templateObjectId = this.toObjectId(templateId, 'templateId');

    const template = await PmsTemplate.findOne({
      _id: templateObjectId,
      isDeleted: false,
      status: PmsTemplateStatus.ACTIVE,
      createdByRole: 'MANAGER',
      visibilityScope: 'MANAGER_TEAM',
      ownerManagerId: managerObjectId,
    });

    if (!template) {
      throw new Error('Editable manager template not found');
    }

    if (input.name !== undefined) {
      template.name = this.requireText(input.name, 'Template name');
    }
    if (input.description !== undefined) {
      template.description = input.description.trim() || undefined;
    }
    template.updatedBy = managerObjectId;
    await template.save();

    const version = await PmsTemplateVersion.findOne({
      _id: template.currentVersionId,
      templateId: template._id,
      isDeleted: false,
    }).lean();

    await this.audit('PMS_MANAGER_TEMPLATE_UPDATED', 'PMS_TEMPLATE', template._id.toString(), {
      template,
    });

    return { template: template.toObject(), version };
  }

  async launchReview(input: LaunchManagerReviewInput) {
    const managerId = this.requireManagerActorId();
    const managerObjectId = new Types.ObjectId(managerId);
    const employeeId = this.toObjectId(input.employeeId, 'employeeId');
    const templateVersionId = this.toObjectId(input.templateVersionId, 'templateVersionId');

    await this.assertEmployeeInManagerTeam(managerId, employeeId);
    const templateVersion = await this.getLaunchableTemplateVersion(templateVersionId, managerId);
    const [employee, manager] = await Promise.all([
      User.findById(employeeId)
        .select('employeeCode name email role specificRole departmentId location joiningDate separationDate employmentStatus managerId managerName active isIntern probationDate')
        .lean(),
      User.findById(managerObjectId)
        .select('employeeCode name email role specificRole departmentId location')
        .lean(),
    ]);

    if (!employee) throw new Error('Employee not found');
    if (!manager) throw new Error('Manager not found');
    if (employee.active === false) throw new Error('Employee is inactive');

    const now = new Date();
    const startDate = this.parseDate(input.startDate, now);
    const endDate = this.parseDate(input.endDate, startDate);
    if (endDate < startDate) {
      throw new Error('Review end date cannot be before start date');
    }

    const cycleCode = this.buildManagerCycleCode(managerId, employeeId.toString());
    const reviewPeriodLabel = input.reviewPeriodLabel?.trim() || 'Manager Initiated Review';

    const annualCycle = await AnnualCycle.create({
      name: `${reviewPeriodLabel} - ${employee.name}`,
      code: cycleCode,
      appraisalYear: endDate.getFullYear(),
      startDate,
      endDate,
      assessmentTermType: AssessmentTermType.YEARLY,
      status: AnnualWorkflowState.IN_PROGRESS,
      templateVersionId,
      termCycleIds: [],
      launchSource: 'MANAGER_INITIATED',
      launchedByRole: 'MANAGER',
      launchedByUserId: managerObjectId,
      managerInitiatedReview: {
        employeeId: employeeId.toString(),
        managerId,
        reviewPeriodLabel,
      },
      createdBy: managerObjectId,
      updatedBy: managerObjectId,
      launchedAt: now,
    });

    const termCycle = await TermCycle.create({
      cycleId: annualCycle._id,
      assessmentTermCode: AssessmentTermCode.Y1,
      assessmentTermType: AssessmentTermType.YEARLY,
      termCode: AssessmentTermCode.Y1,
      termLabel: reviewPeriodLabel,
      startDate,
      endDate,
      managerReviewWindow: { startDate, endDate },
      termFinalizationWindow: { startDate, endDate },
      status: TermWorkflowState.MANAGER_REVIEW_OPEN,
      createdBy: managerObjectId,
      updatedBy: managerObjectId,
    });

    annualCycle.termCycleIds = [termCycle._id];
    await annualCycle.save();

    const annualAssignment = await AnnualAssignment.create({
      employeeId,
      assignedManagerId: managerObjectId,
      cycleId: annualCycle._id,
      templateVersionId,
      termAssignmentIds: [],
      annualState: AnnualWorkflowState.IN_PROGRESS,
      applicableTerms: [AssessmentTermCode.Y1],
      assignmentReason: 'MANAGER_INITIATED_REVIEW',
      launchSource: 'MANAGER_INITIATED',
      launchedByRole: 'MANAGER',
      launchedByUserId: managerObjectId,
      flowPolicy: templateVersion.flowPolicy ?? DEFAULT_MANAGER_REVIEW_FLOW_POLICY,
      employeeSnapshot: this.buildEmployeeSnapshot(employee),
      managerSnapshot: this.buildManagerSnapshot(manager),
      orgSnapshot: {
        departmentId: employee.departmentId,
        location: employee.location,
        reportingManagerId: managerObjectId,
      },
      createdBy: managerObjectId,
      updatedBy: managerObjectId,
    });

    const termAssignment = await TermAssignment.create({
      annualAssignmentId: annualAssignment._id,
      cycleId: annualCycle._id,
      cycleTermId: termCycle._id,
      employeeId,
      assignedManagerId: managerObjectId,
      templateVersionId,
      assessmentTermCode: AssessmentTermCode.Y1,
      assessmentTermType: AssessmentTermType.YEARLY,
      termCode: AssessmentTermCode.Y1,
      termLabel: reviewPeriodLabel,
      termState: TermWorkflowState.MANAGER_REVIEW_OPEN,
      previousTermState: TermWorkflowState.NOT_STARTED,
      lastTransitionAt: now,
      lastTransitionBy: managerObjectId,
      lastTransitionRole: PmsRole.MANAGER,
      lastTransitionReason: 'Manager initiated review launched without objective setting.',
      objectiveSettingClosedBy: managerObjectId,
      objectiveSettingClosedAt: now,
      objectiveSettingCloseReason: 'Objectives not required for manager initiated review.',
      objectiveSettingCloseSource: 'MANAGER_INITIATED_REVIEW',
      createdBy: managerObjectId,
      updatedBy: managerObjectId,
    });

    annualAssignment.termAssignmentIds = [termAssignment._id];
    await annualAssignment.save();

    await this.audit('PMS_MANAGER_REVIEW_LAUNCHED', 'ANNUAL_ASSIGNMENT', annualAssignment._id.toString(), {
      annualAssignment,
      termAssignment,
      annualCycle,
      termCycle,
    });

    return {
      annualCycle,
      termCycle,
      annualAssignment,
      termAssignment,
    };
  }

  private normalizeManagerTemplateSections(sections?: ITemplateSection[]): ITemplateSection[] {
    if (Array.isArray(sections) && sections.length > 0) {
      return sections;
    }

    return [
      {
        sectionKey: 'confirmation_review',
        sectionLabel: 'Confirmation Review',
        sectionType: PmsTemplateSectionType.OVERALL_FEEDBACK,
        level: PmsTemplateSectionLevel.TERM,
        repeatFor: [AssessmentTermCode.Y1],
        renderingScope: 'TERM_ONLY',
        layout: 'vertical',
        sectionScoringConfig: {
          participatesInScoring: false,
          weightage: 0,
          aggregationMethod: 'WEIGHTED_AVERAGE',
          maxSectionScore: 100,
        },
        fields: [
          {
            fieldKey: 'performance_level',
            fieldLabel: 'Overall Performance',
            fieldType: PmsTemplateFieldType.RADIO,
            isRequired: true,
            displayOrder: 1,
            colSpan: 4,
            options: [
              { label: 'Needs Improvement', value: 'NEEDS_IMPROVEMENT' },
              { label: 'Satisfactory', value: 'SATISFACTORY' },
              { label: 'Good', value: 'GOOD' },
              { label: 'Excellent', value: 'EXCELLENT' },
            ],
          },
          {
            fieldKey: 'job_learning',
            fieldLabel: 'Job Learning and Role Understanding',
            fieldType: PmsTemplateFieldType.RADIO,
            isRequired: true,
            displayOrder: 3,
            colSpan: 4,
            options: [
              { label: 'Needs Guidance', value: 'NEEDS_GUIDANCE' },
              { label: 'Satisfactory', value: 'SATISFACTORY' },
              { label: 'Good', value: 'GOOD' },
              { label: 'Excellent', value: 'EXCELLENT' },
            ],
          },
          {
            fieldKey: 'performance_comments',
            fieldLabel: 'Performance Comments',
            fieldType: PmsTemplateFieldType.LONG_TEXT,
            displayOrder: 2,
            colSpan: 4,
          },
          {
            fieldKey: 'job_learning_comments',
            fieldLabel: 'Job Learning Comments',
            fieldType: PmsTemplateFieldType.LONG_TEXT,
            displayOrder: 4,
            colSpan: 4,
          },
          {
            fieldKey: 'attendance_punctuality',
            fieldLabel: 'Attendance and Punctuality',
            fieldType: PmsTemplateFieldType.RADIO,
            isRequired: true,
            displayOrder: 5,
            colSpan: 4,
            options: [
              { label: 'Needs Improvement', value: 'NEEDS_IMPROVEMENT' },
              { label: 'Satisfactory', value: 'SATISFACTORY' },
              { label: 'Good', value: 'GOOD' },
              { label: 'Excellent', value: 'EXCELLENT' },
            ],
          },
          {
            fieldKey: 'attendance_comments',
            fieldLabel: 'Attendance Comments',
            fieldType: PmsTemplateFieldType.LONG_TEXT,
            displayOrder: 6,
            colSpan: 4,
          },
          {
            fieldKey: 'conduct_team_fit',
            fieldLabel: 'Conduct, Discipline and Team Fit',
            fieldType: PmsTemplateFieldType.RADIO,
            isRequired: true,
            displayOrder: 7,
            colSpan: 4,
            options: [
              { label: 'Needs Improvement', value: 'NEEDS_IMPROVEMENT' },
              { label: 'Satisfactory', value: 'SATISFACTORY' },
              { label: 'Good', value: 'GOOD' },
              { label: 'Excellent', value: 'EXCELLENT' },
            ],
          },
          {
            fieldKey: 'conduct_comments',
            fieldLabel: 'Conduct and Team Fit Comments',
            fieldType: PmsTemplateFieldType.LONG_TEXT,
            displayOrder: 8,
            colSpan: 4,
          },
          {
            fieldKey: 'special_achievement_level',
            fieldLabel: 'Special Achievement or Initiative',
            fieldType: PmsTemplateFieldType.RADIO,
            displayOrder: 9,
            colSpan: 4,
            options: [
              { label: 'Not Observed', value: 'NOT_OBSERVED' },
              { label: 'Some Initiative', value: 'SOME_INITIATIVE' },
              { label: 'Good Contribution', value: 'GOOD_CONTRIBUTION' },
              { label: 'Outstanding Contribution', value: 'OUTSTANDING' },
            ],
          },
          {
            fieldKey: 'special_achievement_comments',
            fieldLabel: 'Special Achievement Comments',
            fieldType: PmsTemplateFieldType.LONG_TEXT,
            displayOrder: 10,
            colSpan: 4,
          },
          {
            fieldKey: 'strengths',
            fieldLabel: 'Key Strengths Observed',
            fieldType: PmsTemplateFieldType.LONG_TEXT,
            displayOrder: 11,
            colSpan: 4,
          },
          {
            fieldKey: 'areas_to_improve',
            fieldLabel: 'Areas to Improve Before Confirmation',
            fieldType: PmsTemplateFieldType.LONG_TEXT,
            isRequired: true,
            displayOrder: 12,
            colSpan: 4,
          },
          {
            fieldKey: 'training_required',
            fieldLabel: 'Training or Support Required',
            fieldType: PmsTemplateFieldType.LONG_TEXT,
            displayOrder: 13,
            colSpan: 4,
          },
          {
            fieldKey: 'manager_recommendation',
            fieldLabel: 'Confirmation Recommendation',
            fieldType: PmsTemplateFieldType.RADIO,
            isRequired: true,
            displayOrder: 14,
            colSpan: 4,
            options: [
              { label: 'Confirm', value: 'CONFIRM' },
              { label: 'Extend Probation', value: 'EXTEND_PROBATION' },
              { label: 'Role Change / Transfer', value: 'ROLE_CHANGE' },
              { label: 'Not Suitable', value: 'NOT_SUITABLE' },
            ],
          },
          {
            fieldKey: 'recommendation_comments',
            fieldLabel: 'Recommendation Comments',
            fieldType: PmsTemplateFieldType.LONG_TEXT,
            isRequired: true,
            displayOrder: 15,
            colSpan: 4,
          },
          {
            fieldKey: 'supporting_documents',
            fieldLabel: 'Supporting Documents',
            fieldType: PmsTemplateFieldType.ATTACHMENT,
            displayOrder: 16,
            colSpan: 4,
          },
        ],
      },
    ];
  }

  private async getLaunchableTemplateVersion(
    templateVersionId: Types.ObjectId,
    managerId: string,
  ): Promise<IPmsTemplateVersion> {
    const version = await PmsTemplateVersion.findOne({
      _id: templateVersionId,
      status: PmsTemplateStatus.ACTIVE,
      isDeleted: false,
    });
    if (!version) {
      throw new Error('Active template version not found');
    }

    const template = await PmsTemplate.findOne({
      _id: version.templateId,
      status: PmsTemplateStatus.ACTIVE,
      isDeleted: false,
      $or: [
        { visibilityScope: 'GLOBAL' },
        { ownerManagerId: new Types.ObjectId(managerId), visibilityScope: 'MANAGER_TEAM' },
      ],
    }).lean();

    if (!template) {
      throw new Error('Template is not available for this manager');
    }

    if (
      !this.isManagerLaunchTemplate(
        {
          ...template,
          currentVersion: version,
        },
        managerId,
      )
    ) {
      throw new Error('Template is not configured for manager initiated review launch');
    }

    return version;
  }

  private async getAvailableTemplateWithVersion(templateId: string, managerId: string) {
    const templateObjectId = this.toObjectId(templateId, 'templateId');
    const template = await PmsTemplate.findOne({
      _id: templateObjectId,
      status: PmsTemplateStatus.ACTIVE,
      isDeleted: false,
      $or: [
        { visibilityScope: 'GLOBAL' },
        { ownerManagerId: new Types.ObjectId(managerId), visibilityScope: 'MANAGER_TEAM' },
      ],
    }).lean();

    if (!template) {
      throw new Error('Template is not available for this manager');
    }

    const version = await PmsTemplateVersion.findOne({
      _id: template.currentVersionId,
      templateId: template._id,
      status: PmsTemplateStatus.ACTIVE,
      isDeleted: false,
    }).lean();

    if (!version) {
      throw new Error('Active template version not found');
    }

    const templateWithVersion = { ...template, currentVersion: version };
    if (!this.isManagerLaunchTemplate(templateWithVersion, managerId)) {
      throw new Error('Template is not configured for manager initiated review launch');
    }

    return templateWithVersion;
  }

  private isManagerLaunchTemplate(template: Record<string, any>, managerId: string): boolean {
    if (
      template.visibilityScope === 'MANAGER_TEAM' &&
      template.ownerManagerId?.toString?.() === managerId
    ) {
      return true;
    }

    const version = template.currentVersion;
    return (
      template.visibilityScope === 'GLOBAL' &&
      ((template.metadata as Record<string, unknown> | undefined)?.isFullPmsTemplate === false ||
        version?.metadata?.isFullPmsTemplate === false) &&
      version?.metadata?.reviewFlowMode === 'MANAGER_ONLY' &&
      version?.launchPolicy?.launchOwner === 'MANAGER' &&
      version?.launchPolicy?.launchSource === 'MANAGER_INITIATED'
    );
  }

  private isConfirmationReviewEligible(employee: Record<string, any>): boolean {
    if (employee.active === false) return false;
    if (employee.isIntern) return true;
    const haystack = [
      employee.role,
      employee.specificRole,
      employee.employmentStatus,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return ['intern', 'probation', 'fresher', 'trainee', 'junior'].some((keyword) =>
      haystack.includes(keyword),
    );
  }

  private queueCannotStartReason(status: string): string | null {
    if (status === 'MISSING_REVIEW_FORM') {
      return 'A review form is required before you can start reviews.';
    }
    if (status === 'NOT_ELIGIBLE') {
      return 'This employee is not ready for confirmation review yet.';
    }
    if (status === 'ALREADY_STARTED') {
      return 'A confirmation review has already been started for this employee.';
    }
    return null;
  }

  private queueStatusForTermState(state: string, dueDate?: Date | string | null): string {
    if (state === TermWorkflowState.TERM_FINALIZED || state === TermWorkflowState.CLOSED_BY_ADMIN) {
      return 'COMPLETED';
    }
    if (state === TermWorkflowState.MANAGER_REVIEW_SUBMITTED) {
      return 'SUBMITTED';
    }
    if (dueDate && new Date(dueDate).getTime() < Date.now()) {
      return 'OVERDUE';
    }
    return 'IN_PROGRESS';
  }

  private queueStepLabel(status: string): string {
    if (status === 'SUBMITTED') return 'Review Submitted';
    if (status === 'COMPLETED') return 'Completed';
    if (status === 'OVERDUE') return 'Overdue';
    return 'Manager Review Pending';
  }

  private filterQueueRows<T extends Record<string, any>>(
    rows: T[],
    filters: {
      search: string;
      statusFilter: string;
      departmentFilter: string;
      reviewTypeFilter: string;
      dueDateFilter: string;
    },
  ): T[] {
    return rows.filter((row) => {
      if (filters.statusFilter && row.status !== filters.statusFilter) return false;
      if (
        filters.reviewTypeFilter &&
        !String(row.reviewType || row.reviewName || '')
          .toLowerCase()
          .includes(filters.reviewTypeFilter)
      ) {
        return false;
      }
      if (filters.dueDateFilter) {
        const rowDueDate = row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : '';
        if (rowDueDate !== filters.dueDateFilter) return false;
      }
      if (
        filters.departmentFilter &&
        !String(row.department || '').toLowerCase().includes(filters.departmentFilter)
      ) {
        return false;
      }
      if (!filters.search) return true;
      return [
        row.employeeName,
        row.employeeCode,
        row.department,
        row.reviewName,
        row.reviewType,
        row.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(filters.search);
    });
  }

  private async assertEmployeeInManagerTeam(managerId: string, employeeId: Types.ObjectId) {
    const subordinateIds = await getSubordinateUserIds(managerId);
    const allowed = subordinateIds.some((id) => id.toString() === employeeId.toString());
    if (!allowed) {
      throw new Error('Employee is not in this manager team');
    }
  }

  private requireManagerActorId(): string {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }
    const role = String(user.role || '').toUpperCase();
    if (role !== PmsRole.MANAGER && role !== PmsRole.ADMIN) {
      throw new Error('Only managers can use manager initiated reviews');
    }
    return user._id.toString();
  }

  private normalizePositiveInteger(value: string | number | undefined, fallback: number): number {
    const normalized = Number(value ?? fallback);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
  }

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Valid ${fieldName} is required`);
    }
    return new Types.ObjectId(value);
  }

  private requireText(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${fieldName} is required`);
    }
    return value.trim();
  }

  private normalizeManagerTemplateCode(value: string, managerId: string): string {
    const base = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
    return `MGR_${managerId.slice(-6).toUpperCase()}_${base || Date.now()}`;
  }

  private buildManagerCycleCode(managerId: string, employeeId: string): string {
    return `MIR_${managerId.slice(-6).toUpperCase()}_${employeeId.slice(-6).toUpperCase()}_${Date.now()}`;
  }

  private parseDate(value: string | Date | undefined, fallback: Date): Date {
    if (!value) return fallback;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid date value');
    }
    return date;
  }

  private buildEmployeeSnapshot(employee: Record<string, any>) {
    return {
      employeeCode: employee.employeeCode,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      specificRole: employee.specificRole,
      departmentId: employee.departmentId,
      location: employee.location,
      joiningDate: employee.joiningDate,
      separationDate: employee.separationDate,
      employmentStatus: employee.employmentStatus,
      active: employee.active,
      isIntern: employee.isIntern,
      probationDate: employee.probationDate,
    };
  }

  private buildManagerSnapshot(manager: Record<string, any>) {
    return {
      managerId: manager._id,
      employeeCode: manager.employeeCode,
      name: manager.name,
      email: manager.email,
      role: manager.role,
      specificRole: manager.specificRole,
    };
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    newValue?: unknown,
  ): Promise<void> {
    const user = this.context.user;
    if (!user) return;

    await auditService.createAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action,
      entityType,
      entityId,
      newValue,
    });
  }
}
