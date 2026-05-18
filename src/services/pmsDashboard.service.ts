import { Types } from 'mongoose';
import { BaseService } from './base.service';
import {
  AnnualAssignment,
  QuarterAssignment,
  Objective,
  QuarterReview,
  SlaEvent,
  CommunicationDispatch,
  AuditLog,
} from '../models';
import { visibilityMaskService } from './visibilityMask.service';

export class PmsDashboardService extends BaseService {
  /**
   * Get PMS Employee Dashboard Data
   */
  async getEmployeeDashboard(employeeId: string, cycleId?: string): Promise<any> {
    const query: Record<string, any> = { employeeId: new Types.ObjectId(employeeId), isDeleted: false };
    if (cycleId) {
      query.cycleId = new Types.ObjectId(cycleId);
    }

    // Load active or most recent Annual Assignment
    const annualAssignment = await AnnualAssignment.findOne(query)
      .populate('cycleId', 'name startDate endDate')
      .populate('assignedManagerId', 'name email employeeCode')
      .sort({ createdAt: -1 })
      .lean();

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
    const maskContext = {
      actorRole,
      employeeReviewVisible: annualAssignment.visibility?.employeeReviewVisible ?? false,
      employeeGradeVisible: annualAssignment.visibility?.employeeGradeVisible ?? false,
      employeeMeritVisible: annualAssignment.visibility?.employeeMeritVisible ?? false,
      managerGradeVisible: annualAssignment.visibility?.managerGradeVisible ?? false,
      managerMeritVisible: annualAssignment.visibility?.managerMeritVisible ?? false,
    };

    const maskedAnnualAssignment = visibilityMaskService.mask(annualAssignment, maskContext);

    return {
      hasAssignment: true,
      annualAssignment: maskedAnnualAssignment,
      quarterAssignments,
      objectiveStats,
      quarterReviews,
      visibilityConfig: maskContext,
    };
  }

  /**
   * Get PMS Manager Dashboard Data
   */
  async getManagerDashboard(managerId: string, cycleId?: string): Promise<any> {
    const managerObjectId = new Types.ObjectId(managerId);

    // Get direct reports and assignments
    const query: Record<string, any> = { assignedManagerId: managerObjectId, isDeleted: false };
    if (cycleId) {
      query.cycleId = new Types.ObjectId(cycleId);
    }

    const assignedAnnuals = await AnnualAssignment.find(query).select('_id employeeId').lean();
    const employeeIds = assignedAnnuals.map((a) => a.employeeId);

    // 1. Objectives Approval Queue (Objectives in SUBMITTED state for direct reports)
    const pendingObjectives = await Objective.find({
      employeeId: { $in: employeeIds },
      status: 'OBJECTIVE_SUBMITTED',
      isDeleted: false,
    })
      .populate('employeeId', 'name email employeeCode')
      .lean();

    // 2. Quarter Review Queue (Quarter assignments currently in MANAGER_REVIEW_OPEN or MANAGER_REVIEW_DRAFT)
    const quarterReviewQueue = await QuarterAssignment.find({
      assignedManagerId: managerObjectId,
      quarterState: { $in: ['MANAGER_REVIEW_OPEN', 'OBJECTIVE_APPROVED'] }, // objectives approved means ready for review
      isDeleted: false,
    })
      .populate('employeeId', 'name email employeeCode')
      .lean();

    // 3. Overdue SLA triggers owned by this manager
    const overdueSlas = await SlaEvent.find({
      ownerUserId: managerObjectId,
      status: 'OPEN',
      dueAt: { $lt: new Date() },
      isDeleted: false,
    }).lean();

    // 4. Finalized Quarters under this manager
    const finalizedQuartersCount = await QuarterAssignment.countDocuments({
      assignedManagerId: managerObjectId,
      quarterState: 'QUARTER_FINALIZED',
      isDeleted: false,
    });

    return {
      teamStats: {
        totalDirectReports: employeeIds.length,
        finalizedQuartersCount,
        pendingApprovalsCount: pendingObjectives.length,
        pendingReviewsCount: quarterReviewQueue.length,
        overdueItemsCount: overdueSlas.length,
      },
      queues: {
        pendingObjectives,
        quarterReviewQueue,
        overdueSlas,
      },
    };
  }

  /**
   * Get PMS Admin / Super Admin Dashboard Data
   */
  async getAdminDashboard(cycleId?: string): Promise<any> {
    const query: Record<string, any> = { isDeleted: false };
    const qaQuery: Record<string, any> = { isDeleted: false };
    if (cycleId) {
      query.cycleId = new Types.ObjectId(cycleId);
      qaQuery.cycleId = new Types.ObjectId(cycleId);
    }

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
    const totalDispatches = await CommunicationDispatch.countDocuments({ isDeleted: false });
    const sentDispatches = await CommunicationDispatch.countDocuments({
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
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return {
      annualProgress,
      quarterProgress,
      slaBreachesCount,
      appraisalReadiness,
      communicationStatus,
      reopenLogs: reopenTrackingLogs,
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

    return {
      appraisalStates,
      gradeDistribution,
      meritSummary: meritStats[0] || { totalMeritAmount: 0, avgMeritAmount: 0, count: 0 },
      nilOutcomesCount,
      communicationReadinessCount,
    };
  }
}
