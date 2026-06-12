import { Types } from 'mongoose';
import { BaseService } from './base.service';
import {
  AnnualAssignment,
  AnnualDecision,
  QuarterAssignment,
  Objective,
  QuarterReview,
  SlaEvent,
  CommunicationDispatch,
  AuditLog,
  AssignmentExceptionQueue,
  Delegation,
  Reassignment,
} from '../models';
import { visibilityMaskService } from './visibilityMask.service';
import { AssignmentService } from './assignment.service';
import { accessService } from './access.service';

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

    // Load linked Quarter Assignments
    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    })
      .populate('cycleQuarterId', 'name quarterCode')
      .sort({ quarterCode: 1 })
      .lean();

    const annualDecision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    }).lean();

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
    const quarterReviewsRaw = await QuarterReview.find({
      annualAssignmentId: annualAssignment._id,
      isDeleted: false,
    }).lean();

    const employeeReviewVisible = annualAssignment.visibility?.employeeReviewVisible === true;
    const quarterReviews = quarterReviewsRaw.map((rev) => {
      if (!employeeReviewVisible) {
        // Redact comments, ratings and scores if employee review visibility is disabled
        return {
          _id: rev._id,
          quarterAssignmentId: rev.quarterAssignmentId,
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
      employeeReviewVisible: annualAssignment.visibility?.employeeReviewVisible ?? false,
      employeeGradeVisible: annualAssignment.visibility?.employeeGradeVisible ?? false,
      employeeMeritVisible: annualAssignment.visibility?.employeeMeritVisible ?? false,
      managerGradeVisible: annualAssignment.visibility?.managerGradeVisible ?? false,
      managerMeritVisible: annualAssignment.visibility?.managerMeritVisible ?? false,
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
      quarterAssignments,
      objectiveStats,
      quarterReviews,
      reassignmentHistory,
      visibilityConfig: maskContext,
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
      QuarterAssignment.aggregate([
        {
          $match: {
            annualAssignmentId: { $in: annualAssignmentIds },
            isDeleted: false,
            quarterState: { $ne: 'NOT_STARTED' },
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

    return (
      annualAssignments.find((item) => objectiveActivityIds.has(item._id.toString())) ??
      annualAssignments.find((item) => quarterActivityIds.has(item._id.toString())) ??
      annualAssignments.find((item) => ['ACTIVE', 'IN_PROGRESS'].includes(item.annualState)) ??
      annualAssignments[0] ??
      null
    );
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
    const managerQuarterAssignmentQuery = {
      assignedManagerId: managerObjectId,
      ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
      isDeleted: false,
    };

    const managerQuarterAssignments = await QuarterAssignment.find(managerQuarterAssignmentQuery)
      .select('_id annualAssignmentId employeeId assignedManagerId cycleId quarterCode quarterState updatedAt')
      .populate('employeeId', 'name email employeeCode')
      .sort({ updatedAt: -1, quarterCode: 1 })
      .lean();
    const managerQuarterAssignmentIds = managerQuarterAssignments.map((item) => item._id);

    // 1. Objectives Approval Queue (submitted objectives linked to manager-owned quarter assignments)
    const pendingObjectives = await Objective.find({
      quarterAssignmentId: { $in: managerQuarterAssignmentIds },
      assignedManagerId: managerObjectId,
      status: 'OBJECTIVE_SUBMITTED',
      isDeleted: false,
    })
      .populate('employeeId', 'name email employeeCode')
      .sort({ updatedAt: -1, objectiveNo: 1 })
      .lean();

    // 2. Quarter Review Queue (actual manager review action state)
    const quarterReviewQueue = managerQuarterAssignments.filter(
      (assignment) => assignment.quarterState === 'MANAGER_REVIEW_OPEN',
    );

    // 3. Overdue SLA triggers owned by this manager
    const overdueSlas = await SlaEvent.find({
      ownerUserId: managerObjectId,
      status: 'OPEN',
      dueAt: { $lt: new Date() },
      ...(cycleObjectId ? { cycleId: cycleObjectId } : {}),
      isDeleted: false,
    }).lean();

    // 4. Finalized Quarters under this manager
    const [totalQuarterAssignmentsCount, finalizedQuartersCount] = await Promise.all([
      QuarterAssignment.countDocuments(managerQuarterAssignmentQuery),
      QuarterAssignment.countDocuments({
        ...managerQuarterAssignmentQuery,
        quarterState: 'QUARTER_FINALIZED',
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

    return {
      teamStats: {
        totalDirectReports: employeeIds.length,
        totalQuarterAssignmentsCount,
        finalizedQuartersCount,
        pendingApprovalsCount: pendingObjectives.length,
        pendingReviewsCount: quarterReviewQueue.length,
        overdueItemsCount: overdueSlas.length,
        activeDelegationsIn,
        activeDelegationsOut,
      },
      queues: {
        pendingObjectives,
        quarterReviewQueue,
        overdueSlas,
        recentReassignments,
      },
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
    const quarterProgress = await QuarterAssignment.aggregate([
      { $match: qaQuery },
      {
        $group: {
          _id: '$quarterState',
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
      QuarterAssignment.countDocuments(qaQuery),
      QuarterAssignment.countDocuments({ ...qaQuery, quarterState: 'QUARTER_FINALIZED' }),
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
    const reopenTrackingLogs = await AuditLog.find({
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

    return {
      annualProgress,
      quarterProgress,
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

    const assignmentService = new AssignmentService(this.context);
    await assignmentService.applyScopedAssignmentFilter(query);

    const annualAssignments = await AnnualAssignment.find(query).select('_id').lean();
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
    const gradeDistribution = await AnnualAssignment.aggregate([
      {
        $match: {
          ...query,
          annualState: { $in: ['ANNUAL_FINALIZED', 'VISIBILITY_ENABLED', 'CLOSED'] },
          isGradeApplied: true,
        },
      },
      {
        $group: {
          _id: '$gradeDetails.grade',
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

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

    const [decisionDraftCount, frozenDecisionCount, reopenCount] = await Promise.all([
      AnnualAssignment.countDocuments({
        ...query,
        annualState: 'MANAGEMENT_DECISION_DRAFT',
      }),
      AnnualAssignment.countDocuments({
        ...query,
        annualState: 'ANNUAL_FINALIZED',
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
    const cycleCompletionPercentage = totalAssignments > 0 
      ? Math.round((frozenDecisionCount / totalAssignments) * 100) 
      : 0;

    return {
      appraisalStates,
      gradeDistribution,
      meritSummary: meritStats[0] || { totalMeritAmount: 0, avgMeritAmount: 0, count: 0 },
      outcomes: {
        nilOutcomes: nilOutcomesCount,
      },
      readiness: {
        communicationReady: communicationReadinessCount,
        decisionDrafts: decisionDraftCount,
        decisionsFinalized: frozenDecisionCount,
        decisionReadiness: decisionDraftCount + frozenDecisionCount,
        cycleCompletionPercentage,
      },
      reassignmentMetrics: {
        reopens: reopenCount,
      },
    };
  }
}
