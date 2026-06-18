import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { accessService } from './access.service';
import { transitionQuarterAssignmentState } from './quarter-assignment-workflow.service';
import {
  ObjectiveStatus,
  PmsRole,
  QuarterWorkflowState,
  WorkflowEntityType,
} from '../constants/pms.enums';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { EmployeeAchievementSubmission, EmployeeAchievementSubmissionStatus } from '../models/pms-employee-achievement-submission.model';
import { Objective } from '../models/pms-objective.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import type { IQuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import type { IQuarterCycle } from '../models/pms-quarter-cycle.model';
import { workflowService } from './workflow.service';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  QuarterWorkflowState as QuarterWorkflowStateType,
} from '../constants/pms.enums';

type SyncSkipReason =
  | 'NOT_ELIGIBLE'
  | 'ALREADY_ADVANCED'
  | 'OBJECTIVE_SETTING_OPEN'
  | 'TRANSITION_NOT_ALLOWED'
  | 'FAILED';

interface DateWindowLike {
  startDate?: Date;
  endDate?: Date;
  dueDate?: Date;
  enabled?: boolean;
}

interface WorkflowSyncCandidate {
  targetState?: QuarterWorkflowStateType;
  windowName?: string;
  windowStart?: Date;
  windowEnd?: Date;
  skipReason?: SyncSkipReason;
  reason: string;
  windowOverrideApplied?: boolean;
}

interface ObjectiveSettingCloseCheck {
  canClose: boolean;
  reason: string;
}

export interface WorkflowSyncInput {
  cycleId?: string;
  assessmentTermCode?: AssessmentTermCodeType;
  dryRun?: boolean;
  reason?: string;
  ignoreWindowDates?: boolean;
}

export interface WorkflowSyncResultItem {
  quarterAssignmentId: string;
  annualAssignmentId?: string;
  employeeId?: string;
  managerId?: string;
  assessmentTermCode: string;
  fromState: QuarterWorkflowStateType;
  toState?: QuarterWorkflowStateType;
  action?: string;
  windowName?: string;
  windowStart?: string;
  windowEnd?: string;
  windowOverrideApplied?: boolean;
  status: 'UPDATED' | 'DRY_RUN' | 'SKIPPED' | 'FAILED';
  skipReason?: SyncSkipReason;
  message?: string;
}

export interface WorkflowSyncResult {
  totalChecked: number;
  totalUpdated: number;
  skippedNotEligible: number;
  skippedAlreadyAdvanced: number;
  skippedObjectiveSettingOpen: number;
  skippedTransitionNotAllowed: number;
  failed: number;
  dryRun: boolean;
  windowOverrideRequested: boolean;
  windowOverrideAllowed: boolean;
  results: WorkflowSyncResultItem[];
}

const FORWARD_STATE_ORDER: QuarterWorkflowStateType[] = [
  QuarterWorkflowState.NOT_STARTED,
  QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
  QuarterWorkflowState.OBJECTIVE_DRAFT,
  QuarterWorkflowState.OBJECTIVE_SUBMITTED,
  QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED,
  QuarterWorkflowState.OBJECTIVE_APPROVED,
  QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
  QuarterWorkflowState.MANAGER_REVIEW_OPEN,
  QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED,
  QuarterWorkflowState.TERM_FINALIZED,
  QuarterWorkflowState.CLOSED_BY_ADMIN,
];

export class WorkflowSyncService extends BaseService {
  async syncWorkflowStates(cycleId: string, input: WorkflowSyncInput = {}): Promise<WorkflowSyncResult> {
    await this.assertAdmin('workflow.sync');
    const windowOverrideRequested = input.ignoreWindowDates === true;
    const windowOverrideAllowed = this.isWindowOverrideAllowed();

    if (windowOverrideRequested && !windowOverrideAllowed) {
      throw new Error('Workflow window date override is disabled in this environment.');
    }

    const cycleObjectId = this.toObjectId(input.cycleId ?? cycleId, 'cycleId');
    const cycle = await AnnualCycle.findOne({ _id: cycleObjectId, isDeleted: false }).lean();
    if (!cycle) {
      throw new Error('PMS cycle not found');
    }

    const filter: Record<string, unknown> = {
      cycleId: cycleObjectId,
      isDeleted: false,
    };
    if (input.assessmentTermCode) {
      filter.quarterCode = input.assessmentTermCode;
    }

    const [quarterAssignments, quarterCycles] = await Promise.all([
      QuarterAssignment.find(filter).sort({ employeeId: 1, quarterCode: 1 }),
      QuarterCycle.find({ cycleId: cycleObjectId, isDeleted: false }),
    ]);

    const quarterCycleMap = new Map(
      quarterCycles.map((quarterCycle) => [quarterCycle.quarterCode, quarterCycle]),
    );

    const result: WorkflowSyncResult = {
      totalChecked: quarterAssignments.length,
      totalUpdated: 0,
      skippedNotEligible: 0,
      skippedAlreadyAdvanced: 0,
      skippedObjectiveSettingOpen: 0,
      skippedTransitionNotAllowed: 0,
      failed: 0,
      dryRun: input.dryRun === true,
      windowOverrideRequested,
      windowOverrideAllowed,
      results: [],
    };

    for (const quarterAssignment of quarterAssignments) {
      const quarterCycle = quarterCycleMap.get(quarterAssignment.quarterCode);
      const item = await this.processQuarterAssignment(
        quarterAssignment,
        quarterCycle,
        input,
      );
      result.results.push(item);

      if (item.status === 'UPDATED') {
        result.totalUpdated += 1;
      } else if (item.status === 'FAILED') {
        result.failed += 1;
      } else if (item.skipReason === 'OBJECTIVE_SETTING_OPEN') {
        result.skippedObjectiveSettingOpen += 1;
      } else if (item.skipReason === 'ALREADY_ADVANCED') {
        result.skippedAlreadyAdvanced += 1;
      } else if (item.skipReason === 'TRANSITION_NOT_ALLOWED') {
        result.skippedTransitionNotAllowed += 1;
      } else if (item.skipReason === 'NOT_ELIGIBLE') {
        result.skippedNotEligible += 1;
      }
    }

    return result;
  }

  private async processQuarterAssignment(
    quarterAssignment: IQuarterAssignment,
    quarterCycle: IQuarterCycle | undefined,
    input: WorkflowSyncInput,
  ): Promise<WorkflowSyncResultItem> {
    if (quarterAssignment.quarterState === QuarterWorkflowState.OBJECTIVE_SETTING_OPEN) {
      return this.processObjectiveSettingOpenAssignment(
        quarterAssignment,
        quarterCycle,
        input,
      );
    }

    const candidate = await this.resolveCandidate(quarterAssignment, quarterCycle, {
      ignoreWindowDates: input.ignoreWindowDates === true,
    });
    const baseItem = this.buildBaseResultItem(quarterAssignment, candidate);

    if (!candidate.targetState) {
      return {
        ...baseItem,
        status: 'SKIPPED',
        skipReason: candidate.skipReason ?? 'NOT_ELIGIBLE',
        message: candidate.reason,
      };
    }

    if (!this.isForwardMove(quarterAssignment.quarterState, candidate.targetState)) {
      return {
        ...baseItem,
        status: 'SKIPPED',
        skipReason: 'ALREADY_ADVANCED',
        message: `Current state ${quarterAssignment.quarterState} is already at or beyond ${candidate.targetState}.`,
      };
    }

    const transitionValidation = workflowService.validateTransition({
      entityType: WorkflowEntityType.QUARTER_ASSIGNMENT,
      entityId: quarterAssignment._id.toString(),
      currentState: quarterAssignment.quarterState,
      nextState: candidate.targetState,
      actorId: this.requireActor().actorId,
      actorRole: this.requireActor().actorRole,
      reason: input.reason?.trim() || candidate.reason,
    });

    if (!transitionValidation.allowed) {
      return {
        ...baseItem,
        status: 'SKIPPED',
        skipReason: 'TRANSITION_NOT_ALLOWED',
        message: transitionValidation.message,
      };
    }

    if (input.dryRun === true) {
      return {
        ...baseItem,
        status: 'DRY_RUN',
        message: candidate.reason,
      };
    }

    try {
      await transitionQuarterAssignmentState(
        quarterAssignment._id.toString(),
        candidate.targetState,
        this.requireActor(),
        input.reason?.trim() || candidate.reason,
        'ADMIN_WORKFLOW_SYNC',
        {
          source: 'ADMIN_MANUAL_SYNC',
          windowName: candidate.windowName,
          windowStart: candidate.windowStart,
          windowEnd: candidate.windowEnd,
          windowOverrideApplied: candidate.windowOverrideApplied === true,
        },
      );

      return {
        ...baseItem,
        status: 'UPDATED',
        message: candidate.reason,
      };
    } catch (error) {
      return {
        ...baseItem,
        status: 'FAILED',
        skipReason: 'FAILED',
        message: error instanceof Error ? error.message : 'Workflow sync failed',
      };
    }
  }

  private async processObjectiveSettingOpenAssignment(
    quarterAssignment: IQuarterAssignment,
    quarterCycle: IQuarterCycle | undefined,
    input: WorkflowSyncInput,
  ): Promise<WorkflowSyncResultItem> {
    const closeCheck = await this.canAutoCloseObjectiveSetting(quarterAssignment);
    if (!closeCheck.canClose) {
      const candidate: WorkflowSyncCandidate = {
        skipReason: 'OBJECTIVE_SETTING_OPEN',
        reason: closeCheck.reason,
      };
      return {
        ...this.buildBaseResultItem(quarterAssignment, candidate),
        status: 'SKIPPED',
        skipReason: 'OBJECTIVE_SETTING_OPEN',
        message: closeCheck.reason,
      };
    }

    const approvedCandidate = await this.resolveApprovedStateCandidate(
      quarterCycle,
      { ignoreWindowDates: input.ignoreWindowDates === true },
    );
    const finalCandidate: WorkflowSyncCandidate = approvedCandidate.targetState
      ? {
          ...approvedCandidate,
          reason: `All objectives are approved; objective setting auto-closed during workflow sync. ${approvedCandidate.reason}`,
        }
      : {
          targetState: QuarterWorkflowState.OBJECTIVE_APPROVED,
          reason: `All objectives are approved; objective setting auto-closed during workflow sync. ${approvedCandidate.reason}`,
          windowOverrideApplied: false,
        };
    const baseItem = this.buildBaseResultItem(quarterAssignment, finalCandidate);
    const actor = this.requireActor();
    const closeReason =
      input.reason?.trim() ||
      'All objectives are approved; objective setting auto-closed during workflow sync.';

    const closeValidation = workflowService.validateTransition({
      entityType: WorkflowEntityType.QUARTER_ASSIGNMENT,
      entityId: quarterAssignment._id.toString(),
      currentState: QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
      nextState: QuarterWorkflowState.OBJECTIVE_APPROVED,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      reason: closeReason,
    });

    if (!closeValidation.allowed) {
      return {
        ...baseItem,
        toState: QuarterWorkflowState.OBJECTIVE_APPROVED,
        status: 'SKIPPED',
        skipReason: 'TRANSITION_NOT_ALLOWED',
        message: closeValidation.message,
      };
    }

    if (
      finalCandidate.targetState &&
      finalCandidate.targetState !== QuarterWorkflowState.OBJECTIVE_APPROVED
    ) {
      const nextValidation = workflowService.validateTransition({
        entityType: WorkflowEntityType.QUARTER_ASSIGNMENT,
        entityId: quarterAssignment._id.toString(),
        currentState: QuarterWorkflowState.OBJECTIVE_APPROVED,
        nextState: finalCandidate.targetState,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        reason: input.reason?.trim() || finalCandidate.reason,
      });

      if (!nextValidation.allowed) {
        return {
          ...baseItem,
          status: 'SKIPPED',
          skipReason: 'TRANSITION_NOT_ALLOWED',
          message: nextValidation.message,
        };
      }
    }

    if (input.dryRun === true) {
      return {
        ...baseItem,
        status: 'DRY_RUN',
        message: finalCandidate.reason,
      };
    }

    try {
      await transitionQuarterAssignmentState(
        quarterAssignment._id.toString(),
        QuarterWorkflowState.OBJECTIVE_APPROVED,
        actor,
        closeReason,
        'ADMIN_WORKFLOW_SYNC_AUTO_CLOSE',
        {
          source: 'ADMIN_MANUAL_SYNC',
          autoClosedObjectiveSetting: true,
        },
      );

      const autoClosedAssignment = await QuarterAssignment.findById(quarterAssignment._id);
      if (autoClosedAssignment) {
        autoClosedAssignment.objectiveSettingClosedBy = this.toObjectId(actor.actorId, 'actorId');
        autoClosedAssignment.objectiveSettingClosedAt = new Date();
        autoClosedAssignment.objectiveSettingCloseReason = closeReason;
        autoClosedAssignment.objectiveSettingCloseSource = 'ADMIN';
        autoClosedAssignment.updatedBy = this.toObjectId(actor.actorId, 'actorId');
        autoClosedAssignment.version += 1;
        await autoClosedAssignment.save();
      }

      if (
        finalCandidate.targetState &&
        finalCandidate.targetState !== QuarterWorkflowState.OBJECTIVE_APPROVED
      ) {
        await transitionQuarterAssignmentState(
          quarterAssignment._id.toString(),
          finalCandidate.targetState,
          actor,
          input.reason?.trim() || finalCandidate.reason,
          'ADMIN_WORKFLOW_SYNC',
          {
            source: 'ADMIN_MANUAL_SYNC',
            windowName: finalCandidate.windowName,
            windowStart: finalCandidate.windowStart,
            windowEnd: finalCandidate.windowEnd,
            windowOverrideApplied: finalCandidate.windowOverrideApplied === true,
            autoClosedObjectiveSetting: true,
          },
        );
      }

      return {
        ...baseItem,
        status: 'UPDATED',
        message: finalCandidate.reason,
      };
    } catch (error) {
      return {
        ...baseItem,
        status: 'FAILED',
        skipReason: 'FAILED',
        message: error instanceof Error ? error.message : 'Workflow sync failed',
      };
    }
  }

  private async resolveCandidate(
    quarterAssignment: IQuarterAssignment,
    quarterCycle?: IQuarterCycle,
    options: { ignoreWindowDates?: boolean } = {},
  ): Promise<WorkflowSyncCandidate> {
    const state = quarterAssignment.quarterState;
    const now = this.getCurrentDate();
    const ignoreWindowDates = options.ignoreWindowDates === true;

    if (!quarterCycle) {
      return {
        skipReason: 'NOT_ELIGIBLE',
        reason: 'Assessment term window configuration was not found.',
      };
    }

    if (state === QuarterWorkflowState.OBJECTIVE_SETTING_OPEN) {
      return {
        skipReason: 'OBJECTIVE_SETTING_OPEN',
        reason: 'Objective setting is still open and must be closed explicitly by Manager/Admin.',
      };
    }

    if (state === QuarterWorkflowState.NOT_STARTED) {
      const window = quarterCycle.objectiveSettingWindow;
      if (!ignoreWindowDates && !this.isWindowActive(now, window)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Objective setting window is not active.',
        };
      }
      return this.transitionCandidate(
        QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
        'Objective Setting Window',
        window,
        ignoreWindowDates
          ? 'Objective setting window date bypassed for testing.'
          : 'Objective setting window is active.',
        ignoreWindowDates,
      );
    }

    if (state === QuarterWorkflowState.OBJECTIVE_APPROVED) {
      return this.resolveApprovedStateCandidate(quarterCycle, { ignoreWindowDates });
    }

    if (state === QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN) {
      const submission = await EmployeeAchievementSubmission.findOne({
        quarterAssignmentId: quarterAssignment._id,
        isDeleted: false,
      }).lean();

      const isSubmittedOrLocked =
        submission?.status === EmployeeAchievementSubmissionStatus.SUBMITTED ||
        submission?.status === EmployeeAchievementSubmissionStatus.LOCKED;

      if (!isSubmittedOrLocked) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Employee achievement submission is not submitted or locked.',
        };
      }

      const managerReviewWindow = quarterCycle.managerReviewWindow;
      if (!ignoreWindowDates && !this.hasWindowStarted(now, managerReviewWindow)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Manager review window has not started.',
        };
      }

      return this.transitionCandidate(
        QuarterWorkflowState.MANAGER_REVIEW_OPEN,
        'Manager Review Window',
        managerReviewWindow,
        ignoreWindowDates
          ? 'Employee achievement is submitted/locked and manager review window date bypassed for testing.'
          : 'Employee achievement is submitted/locked and manager review window is eligible.',
        ignoreWindowDates,
      );
    }

    if (state === QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED) {
      const finalizationWindow = quarterCycle.quarterFinalizationWindow;
      if (!ignoreWindowDates && !this.hasWindowStarted(now, finalizationWindow)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Finalization window has not started.',
        };
      }

      return this.transitionCandidate(
        QuarterWorkflowState.TERM_FINALIZED,
        'Finalization Window',
        finalizationWindow,
        ignoreWindowDates
          ? 'Finalization window date bypassed for testing.'
          : 'Finalization window is eligible.',
        ignoreWindowDates,
      );
    }

    if (
      state === QuarterWorkflowState.MANAGER_REVIEW_OPEN ||
      state === QuarterWorkflowState.TERM_FINALIZED ||
      state === QuarterWorkflowState.CLOSED_BY_ADMIN
    ) {
      return {
        skipReason: 'ALREADY_ADVANCED',
        reason: `Current state ${state} is already advanced for manual sync.`,
      };
    }

    return {
      skipReason: 'NOT_ELIGIBLE',
      reason: `Current state ${state} is not eligible for manual workflow sync.`,
    };
  }

  private transitionCandidate(
    targetState: QuarterWorkflowStateType,
    windowName: string,
    window: DateWindowLike | undefined,
    reason: string,
    windowOverrideApplied = false,
  ): WorkflowSyncCandidate {
    return {
      targetState,
      windowName,
      windowStart: window?.startDate,
      windowEnd: window?.endDate ?? window?.dueDate,
      reason,
      windowOverrideApplied,
    };
  }

  private async canAutoCloseObjectiveSetting(
    quarterAssignment: IQuarterAssignment,
  ): Promise<ObjectiveSettingCloseCheck> {
    const objectives = await Objective.find({
      quarterAssignmentId: quarterAssignment._id,
      isDeleted: false,
    })
      .select('title status')
      .lean();

    if (objectives.length === 0) {
      return {
        canClose: false,
        reason: 'Objective setting is still open and no active objectives were found.',
      };
    }

    const pendingObjective = objectives.find(
      (objective) => objective.status !== ObjectiveStatus.OBJECTIVE_APPROVED,
    );
    if (pendingObjective) {
      return {
        canClose: false,
        reason: `Objective setting is still open. Pending objective: ${pendingObjective.title}`,
      };
    }

    return {
      canClose: true,
      reason: 'All objectives are approved.',
    };
  }

  private resolveApprovedStateCandidate(
    quarterCycle: IQuarterCycle | undefined,
    options: { ignoreWindowDates?: boolean } = {},
  ): WorkflowSyncCandidate {
    const now = this.getCurrentDate();
    const ignoreWindowDates = options.ignoreWindowDates === true;

    if (!quarterCycle) {
      return {
        skipReason: 'NOT_ELIGIBLE',
        reason: 'Assessment term window configuration was not found.',
      };
    }

    const achievementWindow = quarterCycle.achievementSubmissionWindow;
    if (achievementWindow?.enabled === true) {
      if (!ignoreWindowDates && !this.hasWindowStarted(now, achievementWindow)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Employee achievement submission window has not started.',
        };
      }
      return this.transitionCandidate(
        QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
        'Employee Achievement Submission Window',
        achievementWindow,
        ignoreWindowDates
          ? 'Employee achievement submission window date bypassed for testing.'
          : 'Employee achievement submission window is eligible.',
        ignoreWindowDates,
      );
    }

    const managerReviewWindow = quarterCycle.managerReviewWindow;
    if (!ignoreWindowDates && !this.hasWindowStarted(now, managerReviewWindow)) {
      return {
        skipReason: 'NOT_ELIGIBLE',
        reason: 'Manager review window has not started.',
      };
    }
    return this.transitionCandidate(
      QuarterWorkflowState.MANAGER_REVIEW_OPEN,
      'Manager Review Window',
      managerReviewWindow,
      ignoreWindowDates
        ? 'Employee achievement is disabled; manager review window date bypassed for testing.'
        : 'Employee achievement is disabled; manager review window is eligible.',
      ignoreWindowDates,
    );
  }

  private buildBaseResultItem(
    quarterAssignment: IQuarterAssignment,
    candidate: WorkflowSyncCandidate,
  ): WorkflowSyncResultItem {
    return {
      quarterAssignmentId: quarterAssignment._id.toString(),
      annualAssignmentId: quarterAssignment.annualAssignmentId?.toString(),
      employeeId: quarterAssignment.employeeId?.toString(),
      managerId: quarterAssignment.assignedManagerId?.toString(),
      assessmentTermCode: quarterAssignment.quarterCode,
      fromState: quarterAssignment.quarterState,
      toState: candidate.targetState,
      action: candidate.targetState ? 'ADMIN_WORKFLOW_SYNC' : undefined,
      windowName: candidate.windowName,
      windowStart: candidate.windowStart?.toISOString(),
      windowEnd: candidate.windowEnd?.toISOString(),
      windowOverrideApplied: candidate.windowOverrideApplied === true,
      status: 'SKIPPED',
    };
  }

  private isWindowActive(now: Date, window?: DateWindowLike): boolean {
    if (!window?.startDate || !window?.endDate) {
      return false;
    }

    return now >= new Date(window.startDate) && now <= new Date(window.endDate);
  }

  private hasWindowStarted(now: Date, window?: DateWindowLike): boolean {
    if (!window?.startDate) {
      return false;
    }

    return now >= new Date(window.startDate);
  }

  private isForwardMove(
    currentState: QuarterWorkflowStateType,
    targetState: QuarterWorkflowStateType,
  ): boolean {
    const currentIndex = FORWARD_STATE_ORDER.indexOf(currentState);
    const targetIndex = FORWARD_STATE_ORDER.indexOf(targetState);
    return currentIndex >= 0 && targetIndex > currentIndex;
  }

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private isWindowOverrideAllowed(): boolean {
    return process.env.PMS_DISABLE_WORKFLOW_WINDOW_OVERRIDE !== 'true';
  }

  private toObjectId(value: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`${label} is invalid`);
    }
    return new Types.ObjectId(value);
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

  private async assertAdmin(action: string): Promise<void> {
    const actor = this.requireActor();
    const access = await accessService.canPerform({
      actor,
      action,
      requiresAdmin: true,
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'This PMS action requires Admin access.');
    }

    if (access.mappedRole !== PmsRole.ADMIN) {
      throw new Error('Manual workflow sync is restricted to HR/Admin.');
    }
  }
}
