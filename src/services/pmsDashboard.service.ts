import { Types } from 'mongoose';
import { BaseService } from './base.service';
import {
  AnnualAssignment,
  AnnualDecision,
  VisibilityConfiguration,
  TermAssignment,
  Objective,
  TermReview,
  SlaEvent,
  CommunicationDispatch,
  AuditLog,
  AssignmentExceptionQueue,
  Delegation,
  Reassignment,
  User,
} from '../models';
import { visibilityMaskService } from './visibilityMask.service';
import { accessService } from './access.service';
import {
  PmsProbationReviewAssignment,
  ProbationReviewStatus,
} from '../models/pms-probation-review-assignment.model';

export class PmsDashboardService extends BaseService {
  /**
   * Get PMS Employee Dashboard Data
   */
  async getEmployeeDashboard(employeeId: string, cycleId?: string): Promise<any> {
    const query: Record<string, any> = { employeeId: new Types.ObjectId(employeeId), isDeleted: false };
    if (cycleId) {
      query.cycleId = new Types.ObjectId(cycleId);
    }

    // Load active or most relevant Annual Assignment
    const annualAssignments = await AnnualAssignment.find(query)
      .populate('cycleId', 'name startDate endDate')
      .populate('assignedManagerId', 'name email employeeCode')
      .sort({ createdAt: -1 })
      .lean();
    const annualAssignment = await this.selectEmployeeDashboardAssignment(
      annualAssignments,
      Boolean(cycleId),
    );

    if (!annualAssignment) {
      return {
        hasAssignment: false,
        message: 'No active PMS annual cycle assignment found.',
      };
    }

    // Load linked Term Assignments
    const termAssignments = await TermAssignment.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    })
      .populate('cycleTermId', 'name assessmentTermCode assessmentTermType termCode termLabel')
      .sort({ assessmentTermCode: 1 })
      .lean();

    const [annualDecision, visibilityConfiguration] = await Promise.all([
      AnnualDecision.findOne({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }).lean(),
      VisibilityConfiguration.findOne({
        annualAssignmentId: annualAssignment._id,
        isDeleted: false,
      }).lean(),
    ]);
    const visibilitySource = visibilityConfiguration ?? annualAssignment.visibility;
    const visibilityEffective = this.isVisibilityEffective(visibilitySource);
    const employeeVisibility = {
      employeeReviewVisible: visibilityEffective
        ? Boolean(visibilitySource?.employeeReviewVisible)
        : false,
      employeeGradeVisible: visibilityEffective
        ? Boolean(visibilitySource?.employeeGradeVisible)
        : false,
      employeeMeritVisible: visibilityEffective
        ? Boolean(visibilitySource?.employeeMeritVisible)
        : false,
      managerGradeVisible: visibilityEffective
        ? Boolean(visibilitySource?.managerGradeVisible)
        : false,
      managerMeritVisible: visibilityEffective
        ? Boolean(visibilitySource?.managerMeritVisible)
        : false,
    };

    // Query Objectives count for this annual assignment
    const objectives = await Objective.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    }).lean();

    const objectiveStats = {
      total: objectives.length,
      draft: objectives.filter((o) => o.status === 'OBJECTIVE_DRAFT').length,
      submitted: objectives.filter((o) => o.status === 'OBJECTIVE_SUBMITTED').length,
      approved: objectives.filter((o) => o.status === 'OBJECTIVE_APPROVED').length,
      revisionRequired: objectives.filter((o) => o.status === 'OBJECTIVE_REVISION_REQUIRED').length,
    };

    // Load Quarter Reviews and apply visibility rules
    const termReviewsRaw = await TermReview.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    }).lean();

    const employeeReviewVisible = employeeVisibility.employeeReviewVisible === true;
    const termReviews = termReviewsRaw.map((rev) => {
      if (!employeeReviewVisible) {
        // Redact comments, ratings and scores if employee review visibility is disabled
        return {
          _id: rev._id,
          termAssignmentId: rev.termAssignmentId,
          reviewStatus: rev.reviewStatus,
          message: 'Review remarks and ratings are currently hidden by administration.',
        };
      }
      return rev;
    });

    // Handle Annual Decision / Outcomes with Dynamic Visibility Masking
    const actorRole = this.context.user?.role ?? 'employee';
    const hasVisibilityOverride = this.context.user ? (await accessService.canPerform({
      actor: { actorId: this.context.user._id.toString(), actorRole: this.context.user.role },
      action: 'assignment.visibility.override',
      requiresAdmin: true
    })).allowed : false;
    
    const maskContext = {
      actorRole,
      employeeReviewVisible: employeeVisibility.employeeReviewVisible,
      employeeGradeVisible: employeeVisibility.employeeGradeVisible,
      employeeMeritVisible: employeeVisibility.employeeMeritVisible,
      managerGradeVisible: employeeVisibility.managerGradeVisible,
      managerMeritVisible: employeeVisibility.managerMeritVisible,
      visibleFrom: visibilitySource?.visibleFrom,
      hasVisibilityOverride,
    };

    const annualOutcomeSource = {
      ...annualAssignment,
      gradeDetails: annualDecision?.gradeDetails ?? (annualAssignment as Record<string, unknown>).gradeDetails,
      meritDetails: annualDecision?.meritDetails ?? (annualAssignment as Record<string, unknown>).meritDetails,
      nilReason: annualDecision?.nilReason ?? (annualAssignment as Record<string, unknown>).nilReason,
      finalScore: annualDecision?.finalScore ?? (annualAssignment as Record<string, unknown>).finalScore,
      finalRating: annualDecision?.finalRating ?? (annualAssignment as Record<string, unknown>).finalRating,
      appraisalOutcomeType: annualDecision?.appraisalOutcomeType ?? annualAssignment.appraisalOutcomeType,
    };
    const maskedAnnualAssignment = visibilityMaskService.mask(annualOutcomeSource, maskContext);
    const reassignmentHistory = await Reassignment.find({
      annualAssignmentId: annualAssignment._id,
      employeeId: new Types.ObjectId(employeeId),
      isDeleted: false,
    })
      .populate('fromManagerId', 'name email employeeCode')
      .populate('toManagerId', 'name email employeeCode')
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .lean();

    return {
      hasAssignment: true,
      annualAssignment: maskedAnnualAssignment,
      termAssignments,
      objectiveStats,
      termReviews,
      reassignmentHistory,
      visibilityConfig: {
        ...maskContext,
        visibleFrom: visibilityConfiguration?.visibleFrom,
        visibilityEffective,
      },
    };
  }

  private async selectEmployeeDashboardAssignment(
    annualAssignments: any[],
    hasExplicitCycle: boolean,
  ) {
    if (annualAssignments.length <= 1 || hasExplicitCycle) {
      return annualAssignments[0] ?? null;
    }

    const annualAssignmentIds = annualAssignments.map((item) => item._id);
    const [objectiveActivity, quarterActivity] = await Promise.all([
      Objective.aggregate([
        {
          $match: {
            annualAssignmentId: { $in: annualAssignmentIds },
            isDeleted: false,
          },
        },
        { $group: { _id: '$annualAssignmentId', count: { $sum: 1 } } },
      ]),
      TermAssignment.aggregate([
        {
          $match: {
            annualAssignmentId: { $in: annualAssignmentIds },
            isDeleted: false,
            termState: { $ne: 'NOT_STARTED' },
          },
        },
        { $group: { _id: '$annualAssignmentId', count: { $sum: 1 } } },
      ]),
    ]);

    const objectiveActivityIds = new Set(
      objectiveActivity.map((item) => item._id.toString()),
    );
    const quarterActivityIds = new Set(
      quarterActivity.map((item) => item._id.toString()),
    );
    const visibilityRows = await VisibilityConfiguration.find({
      annualAssignmentId: { $in: annualAssignmentIds },
      isDeleted: false,
    }).lean();
    const visibilityByAssignmentId = new Map(
      visibilityRows.map((item) => [item.annualAssignmentId.toString(), item]),
    );
    const hasEmployeeReleasedVisibility = (item: any) => {
      const released =
        ['VISIBILITY_ENABLED', 'CLOSED'].includes(String(item.annualState || '').toUpperCase()) ||
        String(item.finalDecisionStatus || '').toUpperCase() === 'VISIBILITY_ENABLED';
      if (!released) return false;

      const visibility = visibilityByAssignmentId.get(item._id.toString()) ?? item.visibility;
      if (!this.isVisibilityEffective(visibility)) return false;
      return [
        visibility?.employeeReviewVisible,
        visibility?.employeeGradeVisible,
        visibility?.employeeMeritVisible,
      ].some(Boolean);
    };

    return (
      annualAssignments.find(hasEmployeeReleasedVisibility) ??
      annualAssignments.find((item) => objectiveActivityIds.has(item._id.toString())) ??
      annualAssignments.find((item) => quarterActivityIds.has(item._id.toString())) ??
      annualAssignments.find((item) => ['ACTIVE', 'IN_PROGRESS'].includes(item.annualState)) ??
      annualAssignments[0] ??
      null
    );
  }

  private isVisibilityEffective(visibility?: { visibleFrom?: Date | string | null } | null): boolean {
    if (!visibility?.visibleFrom) return false;
    const visibleFrom = new Date(visibility.visibleFrom);
    if (Number.isNaN(visibleFrom.getTime())) return false;
    return visibleFrom.getTime() <= Date.now();
  }

  /**
   * Get PMS Manager Dashboard Data
   */
  async getManagerDashboard(managerId: string, cycleId?: string): Promise<any> {
    const managerObjectId = new Types.ObjectId(managerId);
    const cycleObjectId = cycleId ? new Types.ObjectId(cycleId) : undefined;

    // Get direct reports and assignments
    const query: Record<string, any> = { assignedManagerId: managerObjectId, isDeleted: false };
    if (cycleObjectId) {
      query.cycleId = cycleObjectId;
    }

    const assignedAnnuals = await AnnualAssignment.find(query).select('_id employeeId cycleId').lean();
    const employeeIds = assignedAnnuals.map((a) => a.employeeId);
    const annualAssignmentIds = assignedAnnuals.map((a) => a._id);
    const managerTermAssignmentQuery = {
      assignedManagerId: managerObjectId,
      ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
      isDeleted: false,
    };

    const managerTermAssignments = await TermAssignment.find(managerTermAssignmentQuery)
      .select('_id annualAssignmentId employeeId assignedManagerId cycleId assessmentTermCode assessmentTermType termCode termLabel termState updatedAt')
      .populate('employeeId', 'name email employeeCode')
      .sort({ updatedAt: -1, assessmentTermCode: 1 })
      .lean();
    const managerTermAssignmentIds = managerTermAssignments.map((item) => item._id);

    // 1. Objectives Approval Queue (submitted objectives linked to manager-owned quarter assignments)
    const pendingObjectives = await Objective.find({
      termAssignmentId: { $in: managerTermAssignmentIds },
      assignedManagerId: managerObjectId,
      status: 'OBJECTIVE_SUBMITTED',
      isDeleted: false,
    })
      .populate('employeeId', 'name email employeeCode')
      .sort({ updatedAt: -1, objectiveNo: 1 })
      .lean();

    // 2. Quarter Review Queue
    const termReviewQueue = await TermAssignment.find({
      assignedManagerId: managerObjectId,
      termState: { $in: ['MANAGER_REVIEW_OPEN'] },
      ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
      isDeleted: false,
    })
      .populate('employeeId', 'name email employeeCode')
      .lean();

    // 3. Overdue SLA triggers owned by this manager
    const overdueSlas = await SlaEvent.find({
      ownerUserId: managerObjectId,
      status: 'OPEN',
      dueAt: { $lt: new Date() },
      ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
      isDeleted: false,
    }).lean();

    // 4. Finalized Quarters under this manager
    const [totalTermAssignmentsCount, finalizedQuartersCount] = await Promise.all([
      TermAssignment.countDocuments(managerTermAssignmentQuery),
      TermAssignment.countDocuments({
        ...managerTermAssignmentQuery,
        termState: 'TERM_FINALIZED',
      }),
    ]);

    const reassignmentAnnualAssignmentIds = cycleObjectId
      ? (
          await AnnualAssignment.find({
            cycleId: cycleObjectId,
            isDeleted: false,
          })
            .select('_id')
            .lean()
        ).map((assignment) => assignment._id)
      : annualAssignmentIds;

    const [activeDelegationsIn, activeDelegationsOut, recentReassignments] = await Promise.all([
      Delegation.countDocuments({
        delegateUserId: managerObjectId,
        status: 'ACTIVE',
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() },
        isDeleted: false,
      }),
      Delegation.countDocuments({
        delegatorUserId: managerObjectId,
        status: 'ACTIVE',
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() },
        isDeleted: false,
      }),
      Reassignment.find({
        ...(reassignmentAnnualAssignmentIds.length > 0
          ? { annualAssignmentId: { $in: reassignmentAnnualAssignmentIds } }
          : { annualAssignmentId: { $in: [] } }),
        $or: [
          { fromManagerId: managerObjectId },
          { toManagerId: managerObjectId },
        ],
        isDeleted: false,
      })
        .populate('employeeId', 'name email employeeCode')
        .populate('fromManagerId', 'name email employeeCode')
        .populate('toManagerId', 'name email employeeCode')
        .sort({ effectiveFrom: -1, createdAt: -1 })
        .limit(10)
        .lean(),
    ]);
    const visibilityRows = annualAssignmentIds.length > 0
      ? await VisibilityConfiguration.find({
          annualAssignmentId: { $in: annualAssignmentIds },
          isDeleted: false,
          $or: [
            { managerGradeVisible: true },
            { managerMeritVisible: true },
          ],
        }).lean()
      : [];
    const releasedVisibilityRows = visibilityRows.filter((visibility) =>
      this.isVisibilityEffective(visibility) &&
      (visibility.managerGradeVisible || visibility.managerMeritVisible),
    );
    const visibilityByAssignmentId = new Map(
      releasedVisibilityRows.map((visibility) => [
        visibility.annualAssignmentId.toString(),
        visibility,
      ]),
    );
    const releasedAnnualAssignmentIds = releasedVisibilityRows.map(
      (visibility) => visibility.annualAssignmentId,
    );
    const releasedAssignments = releasedAnnualAssignmentIds.length > 0
      ? await AnnualAssignment.find({
          _id: { $in: releasedAnnualAssignmentIds },
          isDeleted: false,
          $or: [
            { annualState: { $in: ['VISIBILITY_ENABLED', 'CLOSED'] } },
            { finalDecisionStatus: 'VISIBILITY_ENABLED' },
          ],
        })
          .populate('employeeId', 'name email employeeCode')
          .sort({ updatedAt: -1 })
          .lean()
      : [];
    const releasedDecisions = releasedAssignments.length > 0
      ? await AnnualDecision.find({
          annualAssignmentId: { $in: releasedAssignments.map((assignment) => assignment._id) },
          isDeleted: false,
        }).lean()
      : [];
    const decisionByAssignmentId = new Map(
      releasedDecisions.map((decision) => [decision.annualAssignmentId.toString(), decision]),
    );
    const releasedOutcomes = releasedAssignments.map((assignment) => {
      const assignmentRecord = assignment as Record<string, any>;
      const visibility = visibilityByAssignmentId.get(assignment._id.toString());
      const decision = decisionByAssignmentId.get(assignment._id.toString());
      const canSeeGrade = Boolean(visibility?.managerGradeVisible);
      const canSeeMerit = Boolean(visibility?.managerMeritVisible);

      return {
        ...assignment,
        gradeDetails: canSeeGrade
          ? decision?.gradeDetails ?? assignment.gradeDetails
          : undefined,
        meritDetails: canSeeMerit
          ? decision?.meritDetails ?? assignment.meritDetails
          : undefined,
        finalScore: canSeeGrade
          ? decision?.finalScore ?? assignmentRecord.finalScore
          : undefined,
        finalRating: canSeeGrade
          ? decision?.finalRating ?? assignmentRecord.finalRating
          : undefined,
        appraisalOutcomeType: decision?.appraisalOutcomeType ?? assignment.appraisalOutcomeType,
        visibility: {
          managerGradeVisible: canSeeGrade,
          managerMeritVisible: canSeeMerit,
          visibleFrom: visibility?.visibleFrom,
        },
      };
    });

    const traineeReviews = await this.getTraineeReviewSummary(managerObjectId);

    return {
      teamStats: {
        totalDirectReports: employeeIds.length,
        totalTermAssignmentsCount,
        finalizedQuartersCount,
        pendingApprovalsCount: pendingObjectives.length,
        pendingReviewsCount: termReviewQueue.length,
        overdueItemsCount: overdueSlas.length,
        activeDelegationsIn,
        activeDelegationsOut,
      },
      queues: {
        pendingObjectives,
        termReviewQueue,
        overdueSlas,
        recentReassignments,
      },
      releasedOutcomes,
      traineeReviews,
    };
  }

  /**
   * Get PMS Admin / Super Admin Dashboard Data
   */
  async getAdminDashboard(cycleId?: string): Promise<any> {
    const query: Record<string, any> = { isDeleted: false };
    const qaQuery: Record<string, any> = { isDeleted: false };
    const cycleObjectId = cycleId ? new Types.ObjectId(cycleId) : undefined;
    if (cycleId) {
      query.cycleId = cycleObjectId;
      qaQuery.cycleId = cycleObjectId;
    }

    const annualAssignments = await AnnualAssignment.find(query).select('_id').lean();
    const annualAssignmentIds = annualAssignments.map((item) => item._id);

    // 1. Cycle Progress (Counts by annual assignment states)
    const annualProgress = await AnnualAssignment.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$annualState',
          count: { $sum: 1 },
        },
      },
    ]);

    // 2. Quarter Completion Progress
    const termProgress = await TermAssignment.aggregate([
      { $match: qaQuery },
      {
        $group: {
          _id: '$termState',
          count: { $sum: 1 },
        },
      },
    ]);

    // 3. SLA Breaches Count
    const slaBreachesCount = await SlaEvent.countDocuments({
      status: 'OPEN',
      dueAt: { $lt: new Date() },
      ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
      isDeleted: false,
    });

    // 4. Appraisal Readiness (Quarters finalized vs total quarters)
    const [totalQuarters, finalizedQuarters] = await Promise.all([
      TermAssignment.countDocuments(qaQuery),
      TermAssignment.countDocuments({ ...qaQuery, termState: 'TERM_FINALIZED' }),
    ]);

    const appraisalReadiness = {
      totalQuarters,
      finalizedQuarters,
      readinessPercentage: totalQuarters > 0 ? Math.round((finalizedQuarters / totalQuarters) * 100) : 0,
    };

    // 5. Communication status (Draft vs Sent vs Ready)
    const totalDispatches = await CommunicationDispatch.countDocuments({
      ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
      isDeleted: false,
    });
    const sentDispatches = await CommunicationDispatch.countDocuments({
      ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
      dispatchStatus: 'SENT',
      isDeleted: false,
    });

    const communicationStatus = {
      totalDispatches,
      sentDispatches,
      pendingDispatches: totalDispatches - sentDispatches,
    };

    // 6. Reopen tracking (Audits showing transitions to REOPENED)
    const reopenTrackingLogRows = await AuditLog.find({
      action: { $regex: /reopen/i },
      ...(annualAssignmentIds.length > 0
        ? { assignmentId: { $in: annualAssignmentIds } }
        : cycleObjectId
          ? { assignmentId: { $in: [] } }
          : {}),
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    const reopenActorIds = [
      ...new Set(
        reopenTrackingLogRows
          .map((log) => String(log.actorId || log.userId || ''))
          .filter((actorId) => Types.ObjectId.isValid(actorId)),
      ),
    ];
    const reopenActors = reopenActorIds.length > 0
      ? await User.find({ _id: { $in: reopenActorIds } })
          .select('_id name employeeCode role')
          .lean()
      : [];
    const reopenActorById = new Map(
      reopenActors.map((actor) => [actor._id.toString(), actor]),
    );
    const reopenTrackingLogs = reopenTrackingLogRows.map((log) => {
      const actorId = String(log.actorId || log.userId || '');
      const actor = reopenActorById.get(actorId);
      const newValue = log.newValue as Record<string, any> | undefined;
      const metadata = log.metadata as Record<string, any> | undefined;

      return {
        ...log,
        actorName: actor?.name || actor?.employeeCode || actorId || 'System',
        actorRole: log.actorRole || actor?.role || '',
        details:
          log.reason ||
          metadata?.reason ||
          newValue?.reason ||
          '',
      };
    });

    // 7. Assignment Exception Queue Metrics
    const [totalExceptions, openExceptions, resolvedExceptions, recentExceptions] = await Promise.all([
      AssignmentExceptionQueue.countDocuments(query),
      AssignmentExceptionQueue.countDocuments({ ...query, status: 'OPEN' }),
      AssignmentExceptionQueue.countDocuments({ ...query, status: 'RESOLVED' }),
      AssignmentExceptionQueue.find(query)
        .populate('employeeId', 'name email employeeCode')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const exceptionQueueStatus = {
      total: totalExceptions,
      open: openExceptions,
      resolved: resolvedExceptions,
      recent: recentExceptions,
    };

    const [activeDelegationsCount, recentDelegations, recentReassignments] = await Promise.all([
      Delegation.countDocuments({
        status: 'ACTIVE',
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() },
        ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
        isDeleted: false,
      }),
      Delegation.find({
        ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
        isDeleted: false,
      })
        .populate('delegatorUserId', 'name email employeeCode')
        .populate('delegateUserId', 'name email employeeCode')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Reassignment.find({
        ...(annualAssignmentIds.length > 0
          ? { annualAssignmentId: { $in: annualAssignmentIds } }
          : cycleObjectId
            ? { annualAssignmentId: { $in: [] } }
            : {}),
        isDeleted: false,
      })
        .populate('employeeId', 'name email employeeCode')
        .populate('fromManagerId', 'name email employeeCode')
        .populate('toManagerId', 'name email employeeCode')
        .populate('approvedBy', 'name email employeeCode')
        .sort({ effectiveFrom: -1, createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const traineeReviews = await this.getTraineeReviewSummary();

    return {
      annualProgress,
      termProgress,
      slaBreachesCount,
      appraisalReadiness,
      communicationStatus,
      reopenLogs: reopenTrackingLogs,
      exceptionQueueStatus,
      delegationMetrics: {
        activeCount: activeDelegationsCount,
        recent: recentDelegations,
      },
      reassignmentMetrics: {
        recent: recentReassignments,
      },
      traineeReviews,
    };
  }

  /**
   * Get PMS Management Dashboard Data
   */
  async getManagementDashboard(cycleId?: string): Promise<any> {
    const query: Record<string, any> = { isDeleted: false };
    if (cycleId) {
      query.cycleId = new Types.ObjectId(cycleId);
    }

    const [annualAssignments, assignedManagerIds] = await Promise.all([
      AnnualAssignment.find(query).select('_id').lean(),
      AnnualAssignment.distinct('assignedManagerId', query),
    ]);
    const annualAssignmentIds = annualAssignments.map((item) => item._id);

    // 1. Annual Appraisals Pending vs Decision Drafts vs Finalized
    const appraisalStates = await AnnualAssignment.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$annualState',
          count: { $sum: 1 },
        },
      },
    ]);

    // 2. Grade & Merit Distributions (obeying dynamic visibility restrictions for general exports but aggregated for analytics)
    const releasedAnnualStates = ['ANNUAL_FINALIZED', 'VISIBILITY_ENABLED', 'CLOSED'];
    const gradeDistribution = await AnnualAssignment.aggregate([
      {
        $match: {
          ...query,
          annualState: { $in: releasedAnnualStates },
        },
      },
      {
        $lookup: {
          from: 'annual_decisions',
          localField: '_id',
          foreignField: 'annualAssignmentId',
          as: 'decisionRows',
        },
      },
      {
        $set: {
          decision: {
            $first: {
              $filter: {
                input: '$decisionRows',
                as: 'decision',
                cond: { $ne: ['$$decision.isDeleted', true] },
              },
            },
          },
        },
      },
      {
        $project: {
          grade: {
            $ifNull: [
              '$decision.gradeDetails.grade',
              {
                $ifNull: [
                  '$decision.gradeDetails.finalGrade',
                  {
                    $ifNull: [
                      '$decision.gradeDetails.gradeValue',
                      {
                        $ifNull: [
                          '$decision.gradeDetails.gradeCode',
                          {
                            $ifNull: [
                              '$gradeDetails.grade',
                              {
                                $ifNull: [
                                  '$gradeDetails.finalGrade',
                                  {
                                    $ifNull: ['$gradeDetails.gradeValue', '$gradeDetails.gradeCode'],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        $match: {
          grade: { $nin: [null, '', 'N/A', 'n/a', 'NA', 'na'] },
        },
      },
      {
        $group: {
          _id: '$grade',
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const gradesAppliedCount = gradeDistribution.reduce(
      (total, bucket) => total + Number(bucket.count || 0),
      0,
    );

    const meritStats = await AnnualAssignment.aggregate([
      {
        $match: {
          ...query,
          annualState: { $in: ['ANNUAL_FINALIZED', 'VISIBILITY_ENABLED', 'CLOSED'] },
          isMeritApplied: true,
        },
      },
      {
        $group: {
          _id: null,
          totalMeritAmount: { $sum: '$meritDetails.meritAmount' },
          avgMeritAmount: { $avg: '$meritDetails.meritAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    // 3. NIL Outcomes
    const nilOutcomesCount = await AnnualAssignment.countDocuments({
      ...query,
      appraisalOutcomeType: 'NIL',
    });

    // 4. Communication Readiness (Locked decisions with visibility enabled)
    const communicationReadinessCount = await AnnualAssignment.countDocuments({
      ...query,
      annualState: 'VISIBILITY_ENABLED',
    });

    const [decisionDraftCount, frozenDecisionCount, visibleDecisionCount, reopenCount] = await Promise.all([
      AnnualAssignment.countDocuments({
        ...query,
        annualState: 'MANAGEMENT_DECISION_DRAFT',
      }),
      AnnualAssignment.countDocuments({
        ...query,
        annualState: 'ANNUAL_FINALIZED',
      }),
      AnnualAssignment.countDocuments({
        ...query,
        annualState: { $in: ['VISIBILITY_ENABLED', 'CLOSED'] },
      }),
      AuditLog.countDocuments({
        action: { $regex: /reopen/i },
        ...(annualAssignmentIds.length > 0
          ? { assignmentId: { $in: annualAssignmentIds } }
          : cycleId
            ? { assignmentId: { $in: [] } }
            : {}),
      }),
    ]);

    const totalAssignments = annualAssignments.length;
    const employeeManagerCount = assignedManagerIds.length;
    const finalizedOrVisibleCount = frozenDecisionCount + visibleDecisionCount;
    const cycleCompletionPercentage = totalAssignments > 0 
      ? Math.round((finalizedOrVisibleCount / totalAssignments) * 100) 
      : 0;

    const traineeReviews = await this.getTraineeReviewSummary();

    return {
      appraisalStates,
      gradeDistribution,
      meritSummary: meritStats[0] || { totalMeritAmount: 0, avgMeritAmount: 0, count: 0 },
      outcomes: {
        nilOutcomes: nilOutcomesCount,
      },
      readiness: {
        totalAssignments,
        employeeManagerCount,
        assignedManagerCount: employeeManagerCount,
        communicationReady: communicationReadinessCount,
        decisionDrafts: decisionDraftCount,
        decisionsFinalized: finalizedOrVisibleCount,
        decisionReadiness: decisionDraftCount + finalizedOrVisibleCount,
        gradesApplied: gradesAppliedCount,
        cycleCompletionPercentage,
      },
      reassignmentMetrics: {
        reopens: reopenCount,
      },
      traineeReviews,
    };
  }

  private async getTraineeReviewSummary(managerId?: Types.ObjectId): Promise<any> {
    const now = new Date();
    const dueSoonAt = new Date(now);
    dueSoonAt.setDate(dueSoonAt.getDate() + 7);

    const activeStatuses = [
      ProbationReviewStatus.REVIEW_OPEN,
      ProbationReviewStatus.MANAGER_1_SUBMITTED,
      ProbationReviewStatus.DELEGATED_TO_APPROVER,
      ProbationReviewStatus.APPROVAL_REASSIGNED,
      ProbationReviewStatus.RETURNED_TO_MANAGER_1,
    ];
    const approvalStatuses = [
      ProbationReviewStatus.MANAGER_1_SUBMITTED,
      ProbationReviewStatus.DELEGATED_TO_APPROVER,
      ProbationReviewStatus.APPROVAL_REASSIGNED,
    ];
    const scopeFilter: Record<string, any> = managerId
      ? {
          $and: [
            { isDeleted: false },
            { $or: [{ manager1Id: managerId }, { manager2Id: managerId }] },
          ],
        }
      : { isDeleted: false };

    const effectiveManagerExpression = (roleExpression: any) => ({
      $cond: [{ $eq: [roleExpression, 'MANAGER_1'] }, '$manager1Id', '$manager2Id'],
    });
    const fillingRoleExpression = {
      $ifNull: ['$reviewerConfiguration.fillingManagerRole', 'MANAGER_1'],
    };
    const approvingRoleExpression = {
      $ifNull: [
        '$approvalOwnerRoleOverride',
        { $ifNull: ['$reviewerConfiguration.approvingManagerRole', 'MANAGER_2'] },
      ],
    };
    const managerActionFilter = managerId
      ? {
          $or: [
            {
              status: {
                $in: [
                  ProbationReviewStatus.REVIEW_OPEN,
                  ProbationReviewStatus.RETURNED_TO_MANAGER_1,
                ],
              },
              $expr: {
                $eq: [effectiveManagerExpression(fillingRoleExpression), managerId],
              },
            },
            {
              status: { $in: approvalStatuses },
              $expr: {
                $eq: [effectiveManagerExpression(approvingRoleExpression), managerId],
              },
            },
          ],
        }
      : { status: { $in: activeStatuses } };

    const [statusRows, actionRequired, overdue, dueSoon, recent] = await Promise.all([
      PmsProbationReviewAssignment.aggregate([
        { $match: scopeFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      PmsProbationReviewAssignment.countDocuments({
        $and: [scopeFilter, managerActionFilter],
      }),
      PmsProbationReviewAssignment.countDocuments({
        $and: [
          scopeFilter,
          managerActionFilter,
          { probationEndDate: { $lt: now } },
        ],
      }),
      PmsProbationReviewAssignment.countDocuments({
        $and: [
          scopeFilter,
          managerActionFilter,
          { probationEndDate: { $gte: now, $lte: dueSoonAt } },
        ],
      }),
      PmsProbationReviewAssignment.find(scopeFilter)
        .select(
          '_id employeeId manager1Id manager2Id status reviewOpenDate probationEndDate delegatedAt delegatedBy updatedAt',
        )
        .populate('employeeId', 'name employeeCode departmentId')
        .populate('manager1Id', 'name employeeCode')
        .populate('manager2Id', 'name employeeCode')
        .populate('delegatedBy', 'name employeeCode')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
    ]);

    const byStatus = Object.fromEntries(
      statusRows.map((row) => [String(row._id), Number(row.count || 0)]),
    );
    const statusCount = (...statuses: string[]) =>
      statuses.reduce((total, status) => total + Number(byStatus[status] || 0), 0);
    const total = statusRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const finalized = statusCount(ProbationReviewStatus.FINALIZED);
    const cancelled = statusCount(ProbationReviewStatus.CANCELLED);
    const eligibleForCompletion = Math.max(0, total - cancelled);

    let forwardedToMe = 0;
    let forwardedByMe = 0;
    if (managerId) {
      [forwardedToMe, forwardedByMe] = await Promise.all([
        PmsProbationReviewAssignment.countDocuments({
          $and: [
            scopeFilter,
            { status: { $in: approvalStatuses } },
            {
              $expr: {
                $eq: [effectiveManagerExpression(approvingRoleExpression), managerId],
              },
            },
          ],
        }),
        PmsProbationReviewAssignment.countDocuments({
          $and: [
            scopeFilter,
            { status: { $in: approvalStatuses } },
            {
              $or: [
                { delegatedBy: managerId },
                { manager1SubmittedBy: managerId },
                { approvalOwnerOverrideBy: managerId },
              ],
            },
          ],
        }),
      ]);
    }

    return {
      asOf: now,
      dueSoonDays: 7,
      total,
      active: Math.max(0, total - finalized - cancelled),
      actionRequired,
      overdue,
      dueSoon,
      scheduled: statusCount(ProbationReviewStatus.SCHEDULED),
      open: statusCount(ProbationReviewStatus.REVIEW_OPEN),
      awaitingApproval: statusCount(...approvalStatuses),
      returned: statusCount(ProbationReviewStatus.RETURNED_TO_MANAGER_1),
      finalized,
      cancelled,
      forwardedInProgress: statusCount(
        ProbationReviewStatus.DELEGATED_TO_APPROVER,
        ProbationReviewStatus.APPROVAL_REASSIGNED,
      ),
      forwardedToMe,
      forwardedByMe,
      completionRate:
        eligibleForCompletion > 0
          ? Math.round((finalized / eligibleForCompletion) * 100)
          : 0,
      byStatus,
      recent,
    };
  }
}
