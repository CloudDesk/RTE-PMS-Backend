import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualAssignment,
  AnnualDecision,
  CommunicationDispatch,
  QuarterAssignment,
  User,
  BulkOperationJob,
  QuarterCycle,
  NotificationEvent,
} from '../models';
import {
  AnnualDecisionStatus,
  normalizePmsRole,
  PmsRole,
} from '../constants/pms.enums';
import { auditService } from './audit.service';
import { AssignmentService } from './assignment.service';
import { AnnualDecisionService } from './annualDecision.service';
import { PmsCommunicationService } from './pmsCommunication.service';

export interface BulkAssignInputItem {
  employeeId: string;
  managerId?: string;
  assignmentReason?: string;
  applicableQuarters?: ('Q1' | 'Q2' | 'Q3' | 'Q4')[];
}

export interface BulkVisibilityUpdateInput {
  employeeReviewVisible?: boolean;
  employeeGradeVisible?: boolean;
  employeeMeritVisible?: boolean;
  managerGradeVisible?: boolean;
  managerMeritVisible?: boolean;
}

export class PmsBulkOperationsService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  /**
   * Helper to assert that the logged-in user is an Admin or Super Admin
   */
  private assertAdminActor() {
    const actor = this.requireActor();
    const role = normalizePmsRole(actor.actorRole);
    if (role !== PmsRole.ADMIN) {
      throw new Error('Access denied. Admin role is required to perform bulk operations.');
    }
    return actor;
  }

  private requireActor() {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }
    return {
      actorId: user._id.toString(),
      actorRole: user.role,
    };
  }

  /**
   * Helper to initialize a BulkOperationJob log in the database
   */
  private async createJobTracker(jobType: string, cycleId?: string): Promise<any> {
    const actor = this.requireActor();
    return await BulkOperationJob.create({
      jobType,
      cycleId: cycleId ? new Types.ObjectId(cycleId) : undefined,
      status: 'RUNNING',
      requestedBy: new Types.ObjectId(actor.actorId),
      totalCount: 0,
      successCount: 0,
      failureCount: 0,
      failureSummary: [],
      startedAt: new Date(),
      metadata: {},
      createdBy: new Types.ObjectId(actor.actorId),
    });
  }

  /**
   * 1. Bulk Assignment Preview
   * Checks for duplicates, existing assignments, and missing managers prior to execution.
   */
  async previewBulkAssignment(
    cycleId: string,
    assignments: BulkAssignInputItem[]
  ): Promise<any> {
    this.assertAdminActor();

    if (!Array.isArray(assignments) || assignments.length === 0) {
      throw new Error('assignments are required');
    }

    const results: any[] = [];
    const seenEmployeeIds = new Set<string>();

    for (const item of assignments) {
      const { employeeId, managerId } = item;

      if (!employeeId) {
        results.push({
          status: 'FAILED',
          message: 'employeeId is required',
        });
        continue;
      }

      if (seenEmployeeIds.has(employeeId)) {
        results.push({
          employeeId,
          status: 'SKIPPED',
          message: 'Duplicate employee in bulk request list',
        });
        continue;
      }
      seenEmployeeIds.add(employeeId);

      try {
        const empObjectId = new Types.ObjectId(employeeId);
        const cycleObjectId = new Types.ObjectId(cycleId);

        // Check if employee exists
        const employee = await User.findById(empObjectId).lean();
        if (!employee) {
          results.push({
            employeeId,
            status: 'FAILED',
            message: 'Employee not found in systems',
          });
          continue;
        }

        // Check if already assigned
        const existing = await AnnualAssignment.findOne({
          employeeId: empObjectId,
          cycleId: cycleObjectId,
          isDeleted: false,
        }).lean();

        if (existing) {
          results.push({
            employeeId,
            status: 'SKIPPED',
            message: 'Employee is already assigned to this cycle',
          });
          continue;
        }

        // Check resolved manager
        const resolvedManagerId = managerId;
        if (!resolvedManagerId) {
          results.push({
            employeeId,
            status: 'EXCEPTION',
            message: 'Missing manager - will queue to Administrative Exception Queue',
          });
          continue;
        }

        // Verify resolved manager exists
        const manager = await User.findById(resolvedManagerId).lean();
        if (!manager) {
          results.push({
            employeeId,
            status: 'FAILED',
            message: 'Resolved manager not found in systems',
          });
          continue;
        }

        results.push({
          employeeId,
          status: 'ELIGIBLE',
          message: 'Ready for assignment launch',
          resolvedManagerId: resolvedManagerId.toString(),
        });
      } catch (err: any) {
        results.push({
          employeeId,
          status: 'FAILED',
          message: err?.message || 'Unexpected validation failure',
        });
      }
    }

    return {
      totalCount: assignments.length,
      eligibleCount: results.filter(r => r.status === 'ELIGIBLE').length,
      skippedCount: results.filter(r => r.status === 'SKIPPED').length,
      exceptionCount: results.filter(r => r.status === 'EXCEPTION').length,
      failedCount: results.filter(r => r.status === 'FAILED').length,
      records: results,
    };
  }

  /**
   * 2. Bulk Assignment Execution
   */
  async executeBulkAssignment(
    cycleId: string,
    assignments: BulkAssignInputItem[]
  ): Promise<any> {
    const actor = this.assertAdminActor();
    const tracker = await this.createJobTracker('ASSIGNMENT', cycleId);
    tracker.metadata = {
      request: {
        cycleId,
        assignments,
      },
    };
    await tracker.save();

    setImmediate(async () => {
      try {
        const assignmentService = new AssignmentService(this.context);
        const results: any[] = [];

        const seenEmployeeIds = new Set<string>();

    for (const item of assignments) {
      const { employeeId, managerId, assignmentReason, applicableQuarters } = item as any;

      if (!employeeId) {
        results.push({
          status: 'FAILED',
          message: 'employeeId is required',
        });
        tracker.failureCount += 1;
        tracker.failureSummary.push({ reason: 'employeeId is required' });
        continue;
      }

      if (seenEmployeeIds.has(employeeId)) {
        results.push({
          employeeId,
          status: 'SKIPPED',
          message: 'Duplicate employee in bulk request list',
        });
        continue;
      }
      seenEmployeeIds.add(employeeId);

      try {
        const empObjectId = new Types.ObjectId(employeeId);
        const employee = await User.findById(empObjectId).lean();

        if (!employee) {
          throw new Error('Employee not found in systems');
        }

        const resolvedManagerId = managerId;
        if (!resolvedManagerId) {
          // Send to exception queue as required by Module 15 business rules
          const exception = await assignmentService.bulkAssign(cycleId, {
            assignments: [{ employeeId, managerId: undefined, applicableQuarters, assignmentReason }]
          });
          results.push({
            employeeId,
            status: 'EXCEPTION',
            message: 'Missing manager - queued to exceptions',
            details: exception,
          });
          tracker.successCount += 1; // Exception count is handled as success in queueing
          continue;
        }

        const assignRes = await assignmentService.assignEmployee(cycleId, {
          employeeId,
          managerId: resolvedManagerId.toString(),
          applicableQuarters,
          assignmentReason: assignmentReason || 'BULK_LAUNCH',
        });

        results.push({
          employeeId,
          status: 'SUCCESS',
          message: 'Assignment successfully created',
          annualAssignmentId: assignRes.annualAssignment._id.toString(),
          quarterAssignmentIds: assignRes.quarterAssignments.map((q: any) => q._id.toString()),
        });
        tracker.successCount += 1;
      } catch (err: any) {
        const msg = err?.message || 'Assignment execution failed';
        const isDuplicate = msg.includes('already exists') || msg.includes('duplicate');
        results.push({
          employeeId,
          status: isDuplicate ? 'SKIPPED' : 'FAILED',
          message: msg,
        });

        if (isDuplicate) {
          // Duplicate rows are intentionally skipped and tracked separately in the result summary.
        } else {
          tracker.failureCount += 1;
          tracker.failureSummary.push({
            employeeId: new Types.ObjectId(employeeId),
            reason: msg,
          });
        }
      }
    }

    tracker.totalCount = assignments.length;
    tracker.status = tracker.failureCount > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    tracker.completedAt = new Date();
    tracker.metadata = {
      ...(tracker.metadata ?? {}),
      resultSummary: {
        totalCount: tracker.totalCount,
        successCount: tracker.successCount,
        skippedCount: results.filter(r => r.status === 'SKIPPED').length,
        exceptionCount: results.filter(r => r.status === 'EXCEPTION').length,
        failureCount: tracker.failureCount,
      },
    };
    tracker.version += 1;
    await tracker.save();

      await auditService.createAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'PMS_BULK_ASSIGNMENT_EXECUTED',
        entityType: 'PMS_CYCLE',
        entityId: cycleId,
        newValue: {
          jobId: tracker._id.toString(),
          totalCount: tracker.totalCount,
          successCount: tracker.successCount,
          failureCount: tracker.failureCount,
        },
      });
      } catch (err: any) {
        tracker.status = 'FAILED';
        tracker.failureSummary.push({ reason: err?.message || 'Unexpected background job failure' });
        tracker.completedAt = new Date();
        await tracker.save();
      }
    });

    return {
      jobId: tracker._id.toString(),
      status: tracker.status,
      message: 'Bulk assignment job has been queued and is processing in the background',
    };
  }

  /**
   * 3. Bulk Reminder Preview
   */
  async previewBulkReminder(
    cycleId: string,
    targetType: 'OBJECTIVES' | 'REVIEWS'
  ): Promise<any> {
    this.assertAdminActor();

    const results: any[] = [];
    const cycleObjectId = new Types.ObjectId(cycleId);

    // Load active quarter cycles under this annual cycle
    const quarterCycles = await QuarterCycle.find({
      parentCycleId: cycleObjectId,
      isDeleted: false,
    }).lean();

    const activeQuarterIds = quarterCycles.map((q: any) => q._id);

    if (targetType === 'OBJECTIVES') {
      // Find Quarter Assignments in DRAFT or REVISION_REQUIRED
      const quarterAssignments = await QuarterAssignment.find({
        cycleQuarterId: { $in: activeQuarterIds },
        quarterState: { $in: ['OBJECTIVE_DRAFT', 'OBJECTIVE_REVISION_REQUIRED'] },
        isDeleted: false,
      })
        .populate('employeeId', 'name email employeeCode')
        .populate('assignedManagerId', 'name email employeeCode')
        .lean();

      for (const qa of quarterAssignments) {
        results.push({
          assignmentId: qa._id.toString(),
          employeeId: (qa.employeeId as any)?._id?.toString() || qa.employeeId?.toString(),
          employeeName: (qa.employeeId as any)?.name || 'Employee',
          employeeEmail: (qa.employeeId as any)?.email || '',
          managerName: (qa.assignedManagerId as any)?.name || '',
          status: 'PENDING_OBJECTIVE',
          message: `Objectives are in ${qa.quarterState} state. Needs employee submission.`,
        });
      }
    } else if (targetType === 'REVIEWS') {
      // Find Quarter Assignments where manager review is pending
      const quarterAssignments = await QuarterAssignment.find({
        cycleQuarterId: { $in: activeQuarterIds },
        quarterState: { $in: ['MANAGER_REVIEW_OPEN', 'OBJECTIVE_APPROVED'] },
        isDeleted: false,
      })
        .populate('employeeId', 'name email employeeCode')
        .populate('assignedManagerId', 'name email employeeCode')
        .lean();

      for (const qa of quarterAssignments) {
        results.push({
          assignmentId: qa._id.toString(),
          managerId: (qa.assignedManagerId as any)?._id?.toString() || qa.assignedManagerId?.toString(),
          managerName: (qa.assignedManagerId as any)?.name || 'Manager',
          managerEmail: (qa.assignedManagerId as any)?.email || '',
          employeeName: (qa.employeeId as any)?.name || '',
          status: 'PENDING_REVIEW',
          message: `Review is pending by manager in quarter state: ${qa.quarterState}`,
        });
      }
    }

    return {
      totalTargeted: results.length,
      targetType,
      records: results,
    };
  }

  /**
   * 4. Bulk Reminder Execution
   */
  async executeBulkReminder(
    cycleId: string,
    targetType: 'OBJECTIVES' | 'REVIEWS',
    subject: string,
    message: string
  ): Promise<any> {
    const actor = this.assertAdminActor();
    const tracker = await this.createJobTracker('REMINDER', cycleId);
    tracker.metadata = {
      request: {
        cycleId,
        targetType,
        subject,
        message,
      },
    };
    await tracker.save();

    setImmediate(async () => {
      try {
        const preview = await this.previewBulkReminder(cycleId, targetType);
        const results: any[] = [];

        for (const record of preview.records) {
      try {
        const recipientUserId = targetType === 'OBJECTIVES' ? record.employeeId : record.managerId;
        if (!recipientUserId) {
          throw new Error('Recipient user ID missing');
        }

        // Create the event notification
        const notification = await NotificationEvent.create({
          eventType: targetType === 'OBJECTIVES' ? 'OBJECTIVE_WINDOW_OPEN' : 'PMS_REMINDER_TRIGGERED',
          recipientUserId: new Types.ObjectId(recipientUserId),
          channel: 'EMAIL',
          deliveryStatus: 'SUCCESS',
          entityType: 'QUARTER_ASSIGNMENT',
          entityId: new Types.ObjectId(record.assignmentId),
          cycleId: new Types.ObjectId(cycleId),
          sentAt: new Date(),
          payload: { subject, message },
          createdBy: new Types.ObjectId(actor.actorId),
        });

        results.push({
          assignmentId: record.assignmentId,
          recipientName: targetType === 'OBJECTIVES' ? record.employeeName : record.managerName,
          status: 'SUCCESS',
          notificationId: notification._id.toString(),
        });
        tracker.successCount += 1;
      } catch (err: any) {
        const msg = err?.message || 'Failed to dispatch reminder';
        results.push({
          assignmentId: record.assignmentId,
          status: 'FAILED',
          message: msg,
        });
        tracker.failureCount += 1;
        tracker.failureSummary.push({
          entityId: new Types.ObjectId(record.assignmentId),
          reason: msg,
        });
      }
    }

    tracker.totalCount = preview.records.length;
    tracker.status = tracker.failureCount > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    tracker.completedAt = new Date();
    tracker.metadata = {
      ...(tracker.metadata ?? {}),
      resultSummary: {
        totalCount: tracker.totalCount,
        successCount: tracker.successCount,
        skippedCount: results.filter(r => r.status === 'SKIPPED').length,
        failureCount: tracker.failureCount,
      },
    };
    tracker.version += 1;
    await tracker.save();

      await auditService.createAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'PMS_BULK_REMINDER_EXECUTED',
        entityType: 'PMS_CYCLE',
        entityId: cycleId,
        newValue: {
          jobId: tracker._id.toString(),
          targetType,
          totalCount: tracker.totalCount,
          successCount: tracker.successCount,
        },
      });
      } catch (err: any) {
        tracker.status = 'FAILED';
        tracker.failureSummary.push({ reason: err?.message || 'Unexpected background job failure' });
        tracker.completedAt = new Date();
        await tracker.save();
      }
    });

    return {
      jobId: tracker._id.toString(),
      status: tracker.status,
      message: 'Bulk reminder job has been queued and is processing in the background',
    };
  }

  /**
   * 5. Bulk Visibility Preview
   */
  async previewBulkVisibility(
    cycleId: string,
    employeeIds: string[],
    visibilityUpdate: BulkVisibilityUpdateInput
  ): Promise<any> {
    this.assertAdminActor();

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      throw new Error('employeeIds array is required');
    }

    const results: any[] = [];
    const cycleObjectId = new Types.ObjectId(cycleId);

    for (const empId of employeeIds) {
      try {
        const empObjectId = new Types.ObjectId(empId);
        const annual = await AnnualAssignment.findOne({
          employeeId: empObjectId,
          cycleId: cycleObjectId,
          isDeleted: false,
        })
          .populate('employeeId', 'name employeeCode')
          .lean();

        if (!annual) {
          results.push({
            employeeId: empId,
            status: 'FAILED',
            message: 'Annual assignment not found for this employee',
          });
          continue;
        }

        const decision = await AnnualDecision.findOne({
          annualAssignmentId: annual._id,
          isDeleted: false,
        })
          .select('decisionStatus')
          .lean();

        if (
          !decision ||
          (
            decision.decisionStatus !== AnnualDecisionStatus.FROZEN &&
            decision.decisionStatus !== AnnualDecisionStatus.VISIBILITY_ENABLED
          )
        ) {
          results.push({
            employeeId: empId,
            employeeName: (annual.employeeId as any)?.name || 'Employee',
            employeeCode: (annual.employeeId as any)?.employeeCode || '',
            status: 'SKIPPED',
            message: 'Visibility can be updated only after annual decision is frozen',
          });
          continue;
        }

        results.push({
          employeeId: empId,
          employeeName: (annual.employeeId as any)?.name || 'Employee',
          employeeCode: (annual.employeeId as any)?.employeeCode || '',
          status: 'ELIGIBLE',
          currentVisibility: annual.visibility || {},
          targetVisibility: {
            ...annual.visibility,
            ...visibilityUpdate,
          },
        });
      } catch (err: any) {
        results.push({
          employeeId: empId,
          status: 'FAILED',
          message: err?.message || 'Error resolving assignment',
        });
      }
    }

    return {
      totalCount: employeeIds.length,
      eligibleCount: results.filter(r => r.status === 'ELIGIBLE').length,
      skippedCount: results.filter(r => r.status === 'SKIPPED').length,
      failedCount: results.filter(r => r.status === 'FAILED').length,
      records: results,
    };
  }

  /**
   * 6. Bulk Visibility Execution
   */
  async executeBulkVisibility(
    cycleId: string,
    employeeIds: string[],
    visibilityUpdate: BulkVisibilityUpdateInput
  ): Promise<any> {
    const actor = this.assertAdminActor();
    const tracker = await this.createJobTracker('VISIBILITY', cycleId);
    tracker.metadata = {
      request: {
        cycleId,
        employeeIds,
        visibilityUpdate,
      },
    };
    await tracker.save();

    setImmediate(async () => {
      try {
        const preview = await this.previewBulkVisibility(cycleId, employeeIds, visibilityUpdate);
        const results: any[] = [];
        const annualDecisionService = new AnnualDecisionService(this.context);

        for (const record of preview.records) {
      if (record.status !== 'ELIGIBLE') {
        results.push({
          employeeId: record.employeeId,
          status: record.status,
          message: record.message || 'Record not eligible for updates',
        });
        if (record.status === 'FAILED') {
          tracker.failureCount += 1;
          tracker.failureSummary.push({
            employeeId: new Types.ObjectId(record.employeeId),
            reason: record.message || 'Not eligible',
          });
        }
        continue;
      }

      try {
        const empObjectId = new Types.ObjectId(record.employeeId);
        const cycleObjectId = new Types.ObjectId(cycleId);

        const annual = await AnnualAssignment.findOne({
          employeeId: empObjectId,
          cycleId: cycleObjectId,
          isDeleted: false,
        });

        if (!annual) throw new Error('Annual assignment not found');
        await annualDecisionService.updateVisibility(annual._id.toString(), {
          ...visibilityUpdate,
          reason: 'Bulk visibility update',
        });

        results.push({
          employeeId: record.employeeId,
          status: 'SUCCESS',
          message: 'Visibility flags successfully updated',
        });

        tracker.successCount += 1;
      } catch (err: any) {
        const msg = err?.message || 'Visibility update failed';
        results.push({
          employeeId: record.employeeId,
          status: 'FAILED',
          message: msg,
        });
        tracker.failureCount += 1;
        tracker.failureSummary.push({
          employeeId: new Types.ObjectId(record.employeeId),
          reason: msg,
        });
      }
    }

    tracker.totalCount = employeeIds.length;
    tracker.status = tracker.failureCount > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    tracker.completedAt = new Date();
    tracker.metadata = {
      ...(tracker.metadata ?? {}),
      resultSummary: {
        totalCount: tracker.totalCount,
        successCount: tracker.successCount,
        skippedCount: results.filter(r => r.status === 'SKIPPED').length,
        failureCount: tracker.failureCount,
      },
    };
    tracker.version += 1;
    await tracker.save();

      await auditService.createAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'PMS_BULK_VISIBILITY_EXECUTED',
        entityType: 'PMS_CYCLE',
        entityId: cycleId,
        newValue: {
          jobId: tracker._id.toString(),
          totalCount: tracker.totalCount,
          successCount: tracker.successCount,
          failureCount: tracker.failureCount,
          visibilityUpdate,
        },
      });
      } catch (err: any) {
        tracker.status = 'FAILED';
        tracker.failureSummary.push({ reason: err?.message || 'Unexpected background job failure' });
        tracker.completedAt = new Date();
        await tracker.save();
      }
    });

    return {
      jobId: tracker._id.toString(),
      status: tracker.status,
      message: 'Bulk visibility job has been queued and is processing in the background',
    };
  }

  /**
   * 7. Bulk Communication Preview
   */
  async previewBulkCommunication(
    cycleId: string,
    employeeIds: string[]
  ): Promise<any> {
    this.assertAdminActor();

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      throw new Error('employeeIds array is required');
    }

    const results: any[] = [];
    const cycleObjectId = new Types.ObjectId(cycleId);
    const communicationService = new PmsCommunicationService(this.context);

    for (const empId of employeeIds) {
      try {
        const empObjectId = new Types.ObjectId(empId);
        const annual = await AnnualAssignment.findOne({
          employeeId: empObjectId,
          cycleId: cycleObjectId,
          isDeleted: false,
        })
          .populate('employeeId', 'name employeeCode')
          .lean();

        if (!annual) {
          results.push({
            employeeId: empId,
            status: 'FAILED',
            message: 'Annual cycle assignment not found',
          });
          continue;
        }

        const existingDispatch = await CommunicationDispatch.findOne({
          annualAssignmentId: annual._id,
          dispatchStatus: 'SENT',
          resendOf: null,
        }).lean();
        if (existingDispatch) {
          results.push({
            employeeId: empId,
            employeeName: (annual.employeeId as any)?.name || 'Employee',
            employeeCode: (annual.employeeId as any)?.employeeCode || '',
            status: 'SKIPPED',
            message: 'Communication already sent for this annual assignment.',
          });
          continue;
        }

        if (!annual.appraisalOutcomeType || annual.appraisalOutcomeType === 'NIL') {
          results.push({
            employeeId: empId,
            employeeName: (annual.employeeId as any)?.name || 'Employee',
            employeeCode: (annual.employeeId as any)?.employeeCode || '',
            status: 'SKIPPED',
            message: `Outcome type is NIL or missing. No letter communication required.`,
          });
          continue;
        }

        try {
          await communicationService.previewCommunication({
            annualAssignmentId: annual._id.toString(),
          });
        } catch (previewError: any) {
          results.push({
            employeeId: empId,
            employeeName: (annual.employeeId as any)?.name || 'Employee',
            employeeCode: (annual.employeeId as any)?.employeeCode || '',
            status: 'SKIPPED',
            message: previewError?.message || 'Communication dispatch is not eligible for this assignment.',
          });
          continue;
        }

        results.push({
          employeeId: empId,
          employeeName: (annual.employeeId as any)?.name || 'Employee',
          employeeCode: (annual.employeeId as any)?.employeeCode || '',
          status: 'ELIGIBLE',
          outcomeType: annual.appraisalOutcomeType,
          message: 'Ready for communication dispatch',
        });
      } catch (err: any) {
        results.push({
          employeeId: empId,
          status: 'FAILED',
          message: err?.message || 'Error verifying communication prerequisites',
        });
      }
    }

    return {
      totalCount: employeeIds.length,
      eligibleCount: results.filter(r => r.status === 'ELIGIBLE').length,
      skippedCount: results.filter(r => r.status === 'SKIPPED').length,
      failedCount: results.filter(r => r.status === 'FAILED').length,
      records: results,
    };
  }

  /**
   * 8. Bulk Communication Dispatch
   */
  async executeBulkCommunication(
    cycleId: string,
    employeeIds: string[]
  ): Promise<any> {
    const actor = this.assertAdminActor();
    const tracker = await this.createJobTracker('COMMUNICATION', cycleId);
    tracker.metadata = {
      request: {
        cycleId,
        employeeIds,
      },
    };
    await tracker.save();

    setImmediate(async () => {
      try {
        const preview = await this.previewBulkCommunication(cycleId, employeeIds);
        const results: any[] = [];

        for (const record of preview.records) {
      if (record.status !== 'ELIGIBLE') {
        results.push({
          employeeId: record.employeeId,
          status: record.status,
          message: record.message || 'Skipped from communication dispatch',
        });
        continue;
      }

      try {
        const empObjectId = new Types.ObjectId(record.employeeId);
        const cycleObjectId = new Types.ObjectId(cycleId);

        const annual = await AnnualAssignment.findOne({
          employeeId: empObjectId,
          cycleId: cycleObjectId,
          isDeleted: false,
        });

        if (!annual) throw new Error('Annual assignment not found');

        // Route communication through the standard PmsCommunicationService to trigger actual letter rendering and dispatching
        const communicationService = new PmsCommunicationService(this.context);
        const dispatch = await communicationService.sendCommunication({
          annualAssignmentId: annual._id.toString(),
        });

        results.push({
          employeeId: record.employeeId,
          status: 'SUCCESS',
          message: 'Letter successfully generated and dispatched',
          dispatchId: dispatch._id.toString(),
        });
        tracker.successCount += 1;
      } catch (err: any) {
        const msg = err?.message || 'Dispatch failed';
        results.push({
          employeeId: record.employeeId,
          status: 'FAILED',
          message: msg,
        });
        tracker.failureCount += 1;
        tracker.failureSummary.push({
          employeeId: new Types.ObjectId(record.employeeId),
          reason: msg,
        });
      }
    }

    tracker.totalCount = employeeIds.length;
    tracker.status = tracker.failureCount > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    tracker.completedAt = new Date();
    tracker.metadata = {
      ...(tracker.metadata ?? {}),
      resultSummary: {
        totalCount: tracker.totalCount,
        successCount: tracker.successCount,
        skippedCount: results.filter(r => r.status === 'SKIPPED').length,
        failureCount: tracker.failureCount,
      },
    };
    tracker.version += 1;
    await tracker.save();

      await auditService.createAuditLog({
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        action: 'PMS_BULK_COMMUNICATION_EXECUTED',
        entityType: 'PMS_CYCLE',
        entityId: cycleId,
        newValue: {
          jobId: tracker._id.toString(),
          totalCount: tracker.totalCount,
          successCount: tracker.successCount,
          failureCount: tracker.failureCount,
        },
      });
      } catch (err: any) {
        tracker.status = 'FAILED';
        tracker.failureSummary.push({ reason: err?.message || 'Unexpected background job failure' });
        tracker.completedAt = new Date();
        await tracker.save();
      }
    });

    return {
      jobId: tracker._id.toString(),
      status: tracker.status,
      message: 'Bulk communication job has been queued and is processing in the background',
    };
  }

  /**
   * 9. Bulk Close with Mandatory Reason Preview
   */
  async previewBulkClose(
    cycleId: string,
    employeeIds: string[]
  ): Promise<any> {
    this.assertAdminActor();

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      throw new Error('employeeIds array is required');
    }

    const results: any[] = [];
    const cycleObjectId = new Types.ObjectId(cycleId);

    for (const empId of employeeIds) {
      try {
        const empObjectId = new Types.ObjectId(empId);
        const annual = await AnnualAssignment.findOne({
          employeeId: empObjectId,
          cycleId: cycleObjectId,
          isDeleted: false,
        })
          .populate('employeeId', 'name employeeCode')
          .lean();

        if (!annual) {
          results.push({
            employeeId: empId,
            status: 'FAILED',
            message: 'Annual appraisal assignment not found',
          });
          continue;
        }

        if (annual.annualState === 'CLOSED' || annual.annualState === 'ARCHIVED') {
          results.push({
            employeeId: empId,
            status: 'SKIPPED',
            message: `Assignment is already in a completed/closed state: ${annual.annualState}`,
          });
          continue;
        }

        results.push({
          employeeId: empId,
          employeeName: (annual.employeeId as any)?.name || 'Employee',
          employeeCode: (annual.employeeId as any)?.employeeCode || '',
          status: 'ELIGIBLE',
          currentState: annual.annualState,
          message: 'Ready for administrative closure',
        });
      } catch (err: any) {
        results.push({
          employeeId: empId,
          status: 'FAILED',
          message: err?.message || 'Error resolving record',
        });
      }
    }

    return {
      totalCount: employeeIds.length,
      eligibleCount: results.filter(r => r.status === 'ELIGIBLE').length,
      skippedCount: results.filter(r => r.status === 'SKIPPED').length,
      failedCount: results.filter(r => r.status === 'FAILED').length,
      records: results,
    };
  }

  /**
   * 10. Bulk Close with Mandatory Reason Execution
   */
  async executeBulkClose(
    cycleId: string,
    employeeIds: string[],
    reason: string
  ): Promise<any> {
    const actor = this.assertAdminActor();

    if (!reason || !reason.trim()) {
      throw new Error('Closure reason is strictly mandatory to execute bulk administrative closures.');
    }

    const tracker = await this.createJobTracker('CLOSE', cycleId);
    tracker.metadata = {
      request: {
        cycleId,
        employeeIds,
        reason: reason.trim(),
      },
    };
    await tracker.save();
    const preview = await this.previewBulkClose(cycleId, employeeIds);
    const results: any[] = [];

    for (const record of preview.records) {
      if (record.status !== 'ELIGIBLE') {
        results.push({
          employeeId: record.employeeId,
          status: record.status,
          message: record.message || 'Skipped from bulk closure',
        });
        continue;
      }

      try {
        const empObjectId = new Types.ObjectId(record.employeeId);
        const cycleObjectId = new Types.ObjectId(cycleId);

        const annual = await AnnualAssignment.findOne({
          employeeId: empObjectId,
          cycleId: cycleObjectId,
          isDeleted: false,
        });

        if (!annual) throw new Error('Annual assignment not found');

        // Route the closure through the official AssignmentService closeAssignment method to preserve all hooks and state transitions
        const assignmentService = new AssignmentService(this.context);
        await assignmentService.closeAssignment(annual._id.toString(), {
          reason: reason.trim(),
        });

        results.push({
          employeeId: record.employeeId,
          status: 'SUCCESS',
          message: 'Appraisal assignment successfully closed',
        });
        tracker.successCount += 1;
      } catch (err: any) {
        const msg = err?.message || 'Closure failed';
        results.push({
          employeeId: record.employeeId,
          status: 'FAILED',
          message: msg,
        });
        tracker.failureCount += 1;
        tracker.failureSummary.push({
          employeeId: new Types.ObjectId(record.employeeId),
          reason: msg,
        });
      }
    }

    tracker.totalCount = employeeIds.length;
    tracker.status = tracker.failureCount > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS';
    tracker.completedAt = new Date();
    tracker.metadata = {
      ...(tracker.metadata ?? {}),
      resultSummary: {
        totalCount: tracker.totalCount,
        successCount: tracker.successCount,
        failureCount: tracker.failureCount,
      },
    };
    tracker.version += 1;
    await tracker.save();

    await auditService.createAuditLog({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action: 'PMS_BULK_CLOSE_EXECUTED',
      entityType: 'PMS_CYCLE',
      entityId: cycleId,
      reason: reason.trim(),
      newValue: {
        jobId: tracker._id.toString(),
        totalCount: tracker.totalCount,
        successCount: tracker.successCount,
        failureCount: tracker.failureCount,
      },
    });

    return {
      jobId: tracker._id.toString(),
      status: tracker.status,
      totalCount: tracker.totalCount,
      successCount: tracker.successCount,
      failureCount: tracker.failureCount,
      records: results,
    };
  }

  /**
   * 11. Get list of bulk operation jobs for cycle or hr monitors
   */
  async listBulkJobs(query: { cycleId?: string; status?: string }): Promise<any[]> {
    this.assertAdminActor();
    const filter: Record<string, any> = { isDeleted: false };
    if (query.cycleId) {
      filter.cycleId = new Types.ObjectId(query.cycleId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    return await BulkOperationJob.find(filter)
      .populate('requestedBy', 'name email employeeCode')
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Get detail of a specific bulk job
   */
  async getBulkJobDetail(id: string): Promise<any> {
    this.assertAdminActor();
    const job = await BulkOperationJob.findById(new Types.ObjectId(id))
      .populate('requestedBy', 'name email employeeCode')
      .lean();
    if (!job) {
      throw new Error('Bulk operation job record not found.');
    }
    return job;
  }

  /**
   * Retry failed records of a specific bulk job
   */
  async retryFailedBulkRecords(jobId: string): Promise<any> {
    const job = await this.getBulkJobDetail(jobId);

    if (!job.failureSummary || job.failureSummary.length === 0) {
      throw new Error('No failed records found to retry.');
    }

    const failedEmployeeIds = job.failureSummary.map((f: any) => f.employeeId?.toString()).filter(Boolean);
    if (failedEmployeeIds.length === 0) {
      throw new Error('Could not extract employee IDs from the failure summary.');
    }

    switch (job.operationType) {
      case 'ASSIGNMENT':
        // For assignment, we need to extract from metadata if available, but assignment uses BulkAssignInputItem[]
        if (!job.metadata?.request?.assignments) {
           throw new Error('Original assignments missing in job metadata. Cannot retry.');
        }
        const assignmentsToRetry = job.metadata.request.assignments.filter((a: any) => failedEmployeeIds.includes(a.employeeId));
        return this.executeBulkAssignment(job.cycleId.toString(), assignmentsToRetry);

      case 'REMINDER':
        const targetType = job.metadata?.request?.targetType;
        if (!targetType) throw new Error('Reminder metadata missing. Cannot retry.');
        // Note: For reminder, preview usually filters by target, so we would ideally pass failed employee IDs.
        // Since executeBulkReminder doesn't accept a subset of IDs, we throw not supported for now.
        throw new Error('Retry for Reminder operation is currently not supported natively.');

      case 'VISIBILITY':
        const visibilityUpdate = job.metadata?.request?.visibilityUpdate;
        if (!visibilityUpdate) throw new Error('Visibility metadata missing. Cannot retry.');
        return this.executeBulkVisibility(job.cycleId.toString(), failedEmployeeIds, visibilityUpdate);

      case 'COMMUNICATION':
        return this.executeBulkCommunication(job.cycleId.toString(), failedEmployeeIds);

      default:
        throw new Error(`Retry not implemented for operation type: ${job.operationType}`);
    }
  }
}
