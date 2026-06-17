import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { accessService } from './access.service';
import { transitionQuarterAssignmentState } from './quarter-assignment-workflow.service';
import {
  PmsRole,
  QuarterWorkflowState,
  WorkflowEntityType,
} from '../constants/pms.enums';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { EmployeeAchievementSubmission, EmployeeAchievementSubmissionStatus } from '../models/pms-employee-achievement-submission.model';
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
}

export interface WorkflowSyncInput {
  cycleId?: string;
  assessmentTermCode?: AssessmentTermCodeType;
  dryRun?: boolean;
  reason?: string;
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
  QuarterWorkflowState.QUARTER_FINALIZED,
  QuarterWorkflowState.CLOSED_BY_ADMIN,
];

export class WorkflowSyncService extends BaseService {
  async syncWorkflowStates(cycleId: string, input: WorkflowSyncInput = {}): Promise<WorkflowSyncResult> {
    await this.assertAdmin('workflow.sync');

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
    const candidate = await this.resolveCandidate(quarterAssignment, quarterCycle);
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

  private async resolveCandidate(
    quarterAssignment: IQuarterAssignment,
    quarterCycle?: IQuarterCycle,
  ): Promise<WorkflowSyncCandidate> {
    const state = quarterAssignment.quarterState;
    const now = this.getCurrentDate();

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
      if (!this.isWindowActive(now, window)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Objective setting window is not active.',
        };
      }
      return this.transitionCandidate(
        QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
        'Objective Setting Window',
        window,
        'Objective setting window is active.',
      );
    }

    if (state === QuarterWorkflowState.OBJECTIVE_APPROVED) {
      const achievementWindow = quarterCycle.achievementSubmissionWindow;
      if (achievementWindow?.enabled === true) {
        if (!this.hasWindowStarted(now, achievementWindow)) {
          return {
            skipReason: 'NOT_ELIGIBLE',
            reason: 'Employee achievement submission window has not started.',
          };
        }
        return this.transitionCandidate(
          QuarterWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
          'Employee Achievement Submission Window',
          achievementWindow,
          'Employee achievement submission window is eligible.',
        );
      }

      const managerReviewWindow = quarterCycle.managerReviewWindow;
      if (!this.hasWindowStarted(now, managerReviewWindow)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Manager review window has not started.',
        };
      }
      return this.transitionCandidate(
        QuarterWorkflowState.MANAGER_REVIEW_OPEN,
        'Manager Review Window',
        managerReviewWindow,
        'Employee achievement is disabled; manager review window is eligible.',
      );
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
      if (!this.hasWindowStarted(now, managerReviewWindow)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Manager review window has not started.',
        };
      }

      return this.transitionCandidate(
        QuarterWorkflowState.MANAGER_REVIEW_OPEN,
        'Manager Review Window',
        managerReviewWindow,
        'Employee achievement is submitted/locked and manager review window is eligible.',
      );
    }

    if (state === QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED) {
      const finalizationWindow = quarterCycle.quarterFinalizationWindow;
      if (!this.hasWindowStarted(now, finalizationWindow)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Finalization window has not started.',
        };
      }

      return this.transitionCandidate(
        QuarterWorkflowState.QUARTER_FINALIZED,
        'Finalization Window',
        finalizationWindow,
        'Finalization window is eligible.',
      );
    }

    if (
      state === QuarterWorkflowState.MANAGER_REVIEW_OPEN ||
      state === QuarterWorkflowState.QUARTER_FINALIZED ||
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
  ): WorkflowSyncCandidate {
    return {
      targetState,
      windowName,
      windowStart: window?.startDate,
      windowEnd: window?.endDate ?? window?.dueDate,
      reason,
    };
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
