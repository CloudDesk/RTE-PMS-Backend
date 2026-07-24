import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { accessService } from './access.service';
import { transitionTermAssignmentState } from './term-assignment-workflow.service';
import {
  ObjectiveStatus,
  PmsRole,
  TermWorkflowState,
  WorkflowEntityType,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { EmployeeAchievementSubmission } from '../models/pms-employee-achievement-submission.model';
import { Objective } from '../models/pms-objective.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import type { ITermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import type { ITermCycle } from '../models/pms-term-cycle.model';
import { workflowService } from './workflow.service';
import { ManagerReviewPeriodService } from './managerReviewPeriod.service';
import { resolveEffectiveTermWindows } from '../utilis/pmsAssignmentWindows';
import {
  isAnnualManagerReviewConfig,
  isGroupedManagerReviewConfig,
} from '../utilis/pmsReviewCadence';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  TermWorkflowState as TermWorkflowStateType,
} from '../constants/pms.enums';
import {
  isEmployeeAchievementSubmissionComplete,
  resolveEmployeeAchievementCompletionConfig,
} from '../utilis/employeeAchievementCompletion';

type SyncSkipReason =
  | 'NOT_ELIGIBLE'
  | 'ALREADY_ADVANCED'
  | 'OBJECTIVE_SETTING_OPEN'
  | 'OBJECTIVE_SCORING_NOT_READY'
  | 'TRANSITION_NOT_ALLOWED'
  | 'FAILED';

interface DateWindowLike {
  startDate?: Date;
  endDate?: Date;
  dueDate?: Date;
  enabled?: boolean;
}

interface WorkflowSyncCandidate {
  targetState?: TermWorkflowStateType;
  transitionPath?: TermWorkflowStateType[];
  windowName?: string;
  windowStart?: Date;
  windowEnd?: Date;
  skipReason?: SyncSkipReason;
  reason: string;
  windowOverrideApplied?: boolean;
  warning?: string;
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
  source?: 'ADMIN_MANUAL_SYNC' | 'AUTOMATIC_DAILY_SYNC';
}

export interface WorkflowSyncResultItem {
  termAssignmentId: string;
  annualAssignmentId?: string;
  employeeId?: string;
  managerId?: string;
  assessmentTermCode: string;
  fromState: TermWorkflowStateType;
  toState?: TermWorkflowStateType;
  action?: string;
  windowName?: string;
  windowStart?: string;
  windowEnd?: string;
  windowOverrideApplied?: boolean;
  status: 'UPDATED' | 'DRY_RUN' | 'SKIPPED' | 'FAILED';
  skipReason?: SyncSkipReason;
  message?: string;
  warning?: string;
}

export interface WorkflowSyncResult {
  totalChecked: number;
  totalUpdated: number;
  groupedReviewPeriodsChecked: number;
  groupedReviewPeriodsReady: number;
  groupedReviewPeriodsOpened: number;
  groupedReviewPeriodsAlreadyOpen: number;
  groupedReviewPeriodsAlreadyAdvanced: number;
  groupedReviewPeriodsNotReady: number;
  skippedNotEligible: number;
  skippedAlreadyAdvanced: number;
  skippedObjectiveSettingOpen: number;
  skippedObjectiveScoringNotReady: number;
  skippedTransitionNotAllowed: number;
  failed: number;
  dryRun: boolean;
  windowOverrideRequested: boolean;
  windowOverrideAllowed: boolean;
  results: WorkflowSyncResultItem[];
}

const FORWARD_STATE_ORDER: TermWorkflowStateType[] = [
  TermWorkflowState.NOT_STARTED,
  TermWorkflowState.OBJECTIVE_SETTING_OPEN,
  TermWorkflowState.OBJECTIVE_DRAFT,
  TermWorkflowState.OBJECTIVE_SUBMITTED,
  TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
  TermWorkflowState.OBJECTIVE_APPROVED,
  TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
  TermWorkflowState.MANAGER_REVIEW_OPEN,
  TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
  TermWorkflowState.TERM_FINALIZED,
  TermWorkflowState.CLOSED_BY_ADMIN,
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
    const groupedManagerReviewEnabled = isGroupedManagerReviewConfig(cycle.reviewCadenceConfig);
    const groupedManagerReviewControlsTermOpening =
      groupedManagerReviewEnabled &&
      !isAnnualManagerReviewConfig(cycle.reviewCadenceConfig);

    const filter: Record<string, unknown> = {
      cycleId: cycleObjectId,
      isDeleted: false,
    };
    if (input.assessmentTermCode) {
      filter.assessmentTermCode = input.assessmentTermCode;
    }

    const [termAssignments, termCycles] = await Promise.all([
      TermAssignment.find(filter).sort({ employeeId: 1, assessmentTermCode: 1 }),
      TermCycle.find({ cycleId: cycleObjectId, isDeleted: false }),
    ]);
    const annualAssignmentIds = Array.from(
      new Set(termAssignments.map((termAssignment) => termAssignment.annualAssignmentId.toString())),
    );
    const annualAssignments = annualAssignmentIds.length > 0
      ? await AnnualAssignment.find({
          _id: { $in: annualAssignmentIds.map((id) => new Types.ObjectId(id)) },
          isDeleted: false,
        })
          .select('assignmentWindowSnapshot')
          .lean()
      : [];

    const termCycleMap = new Map(
      termCycles.map((termCycle) => [termCycle.assessmentTermCode, termCycle]),
    );
    const annualAssignmentMap = new Map(
      annualAssignments.map((assignment) => [assignment._id.toString(), assignment]),
    );
    const termAssignmentsByAnnualAssignment = new Map<string, ITermAssignment[]>();

    for (const termAssignment of termAssignments) {
      const key = termAssignment.annualAssignmentId.toString();
      termAssignmentsByAnnualAssignment.set(key, [
        ...(termAssignmentsByAnnualAssignment.get(key) ?? []),
        termAssignment,
      ]);
    }

    for (const assignmentTerms of termAssignmentsByAnnualAssignment.values()) {
      assignmentTerms.sort((left, right) => this.compareAssignmentTerms(left, right, termCycleMap));
    }

    const result: WorkflowSyncResult = {
      totalChecked: termAssignments.length,
      totalUpdated: 0,
      groupedReviewPeriodsChecked: 0,
      groupedReviewPeriodsReady: 0,
      groupedReviewPeriodsOpened: 0,
      groupedReviewPeriodsAlreadyOpen: 0,
      groupedReviewPeriodsAlreadyAdvanced: 0,
      groupedReviewPeriodsNotReady: 0,
      skippedNotEligible: 0,
      skippedAlreadyAdvanced: 0,
      skippedObjectiveSettingOpen: 0,
      skippedObjectiveScoringNotReady: 0,
      skippedTransitionNotAllowed: 0,
      failed: 0,
      dryRun: input.dryRun === true,
      windowOverrideRequested,
      windowOverrideAllowed,
      results: [],
    };

    for (const termAssignment of termAssignments) {
      const termCycle = termCycleMap.get(termAssignment.assessmentTermCode);
      const assignmentTerms = termAssignmentsByAnnualAssignment.get(
        termAssignment.annualAssignmentId.toString(),
      ) ?? [termAssignment];
      const item = await this.processTermAssignment(
        termAssignment,
        termCycle,
        annualAssignmentMap.get(termAssignment.annualAssignmentId.toString()),
        assignmentTerms,
        termCycleMap,
        annualAssignmentMap,
        input,
        groupedManagerReviewControlsTermOpening,
      );
      result.results.push(item);

      if (item.status === 'UPDATED') {
        result.totalUpdated += 1;
      } else if (item.status === 'FAILED') {
        result.failed += 1;
      } else if (item.skipReason === 'OBJECTIVE_SETTING_OPEN') {
        result.skippedObjectiveSettingOpen += 1;
      } else if (item.skipReason === 'OBJECTIVE_SCORING_NOT_READY') {
        result.skippedObjectiveScoringNotReady += 1;
      } else if (item.skipReason === 'ALREADY_ADVANCED') {
        result.skippedAlreadyAdvanced += 1;
      } else if (item.skipReason === 'TRANSITION_NOT_ALLOWED') {
        result.skippedTransitionNotAllowed += 1;
      } else if (item.skipReason === 'NOT_ELIGIBLE') {
        result.skippedNotEligible += 1;
      }
    }

    const groupedReviewResult = await new ManagerReviewPeriodService(this.context).openEligiblePeriodsForCycle(
      cycleObjectId.toString(),
      {
        dryRun: input.dryRun === true,
        ignoreWindowDates: input.ignoreWindowDates === true,
        promoteIncludedTerms: !isAnnualManagerReviewConfig(cycle.reviewCadenceConfig),
      },
    );
    result.groupedReviewPeriodsChecked = groupedReviewResult.checked;
    result.groupedReviewPeriodsAlreadyOpen = groupedReviewResult.alreadyOpen ?? 0;
    result.groupedReviewPeriodsAlreadyAdvanced = groupedReviewResult.alreadyAdvanced ?? 0;
    result.groupedReviewPeriodsNotReady = groupedReviewResult.notReady ?? 0;
    if (input.dryRun === true) {
      result.groupedReviewPeriodsReady = groupedReviewResult.opened;
    } else {
      result.groupedReviewPeriodsOpened = groupedReviewResult.opened;
    }

    return result;
  }

  private async processTermAssignment(
    termAssignment: ITermAssignment,
    termCycle: ITermCycle | undefined,
    annualAssignment: Record<string, any> | undefined,
    assignmentTerms: ITermAssignment[],
    termCycleMap: Map<AssessmentTermCodeType, ITermCycle>,
    annualAssignmentMap: Map<string, Record<string, any>>,
    input: WorkflowSyncInput,
    groupedManagerReviewEnabled: boolean,
  ): Promise<WorkflowSyncResultItem> {
    if (termAssignment.termState === TermWorkflowState.OBJECTIVE_SETTING_OPEN) {
      return this.processObjectiveSettingOpenAssignment(
        termAssignment,
        termCycle,
        annualAssignment,
        input,
      );
    }

    const candidate = await this.resolveCandidate(termAssignment, termCycle, {
      ignoreWindowDates: input.ignoreWindowDates === true,
      groupedManagerReviewEnabled,
    }, assignmentTerms, termCycleMap, annualAssignment, annualAssignmentMap);
    const baseItem = this.buildBaseResultItem(termAssignment, candidate);

    if (!candidate.targetState) {
      return {
        ...baseItem,
        status: 'SKIPPED',
        skipReason: candidate.skipReason ?? 'NOT_ELIGIBLE',
        message: candidate.reason,
      };
    }

    if (!this.isForwardMove(termAssignment.termState, candidate.targetState)) {
      return {
        ...baseItem,
        status: 'SKIPPED',
        skipReason: 'ALREADY_ADVANCED',
        message: `Current state ${termAssignment.termState} is already at or beyond ${candidate.targetState}.`,
      };
    }

    const actor = this.requireActor();
    const syncSource = input.source ?? 'ADMIN_MANUAL_SYNC';
    const transitionPath = candidate.transitionPath?.length
      ? candidate.transitionPath
      : [candidate.targetState];
    let currentState: TermWorkflowStateType = termAssignment.termState;
    for (const nextState of transitionPath) {
      const transitionValidation = workflowService.validateTransition({
        entityType: WorkflowEntityType.TERM_ASSIGNMENT,
        entityId: termAssignment._id.toString(),
        currentState,
        nextState,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
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
      currentState = nextState;
    }

    if (input.dryRun === true) {
      return {
        ...baseItem,
        status: 'DRY_RUN',
        message: this.workflowSyncMessage(candidate),
        warning: candidate.warning,
      };
    }

    try {
      for (const nextState of transitionPath) {
        await transitionTermAssignmentState(
          termAssignment._id.toString(),
          nextState,
          actor,
          input.reason?.trim() || candidate.reason,
          'ADMIN_WORKFLOW_SYNC',
          {
            source: syncSource,
            windowName: candidate.windowName,
            windowStart: candidate.windowStart,
            windowEnd: candidate.windowEnd,
            windowOverrideApplied: candidate.windowOverrideApplied === true,
          },
        );
      }

      return {
        ...baseItem,
        status: 'UPDATED',
        message: this.workflowSyncMessage(candidate),
        warning: candidate.warning,
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
    termAssignment: ITermAssignment,
    termCycle: ITermCycle | undefined,
    annualAssignment: Record<string, any> | undefined,
    input: WorkflowSyncInput,
  ): Promise<WorkflowSyncResultItem> {
    const closeCheck = await this.canAutoCloseObjectiveSetting(termAssignment);
    if (!closeCheck.canClose) {
      const candidate: WorkflowSyncCandidate = {
        skipReason: 'OBJECTIVE_SETTING_OPEN',
        reason: closeCheck.reason,
      };
      return {
        ...this.buildBaseResultItem(termAssignment, candidate),
        status: 'SKIPPED',
        skipReason: 'OBJECTIVE_SETTING_OPEN',
        message: closeCheck.reason,
      };
    }

    const approvedCandidate = await this.resolveApprovedStateCandidate(
      termCycle,
      termAssignment,
      annualAssignment,
      { ignoreWindowDates: input.ignoreWindowDates === true },
    );
    const finalCandidate: WorkflowSyncCandidate = approvedCandidate.targetState
      ? {
          ...approvedCandidate,
          reason: `All objectives are approved; objective setting auto-closed during workflow sync. ${approvedCandidate.reason}`,
        }
      : {
          targetState: TermWorkflowState.OBJECTIVE_APPROVED,
          reason: `All objectives are approved; objective setting auto-closed during workflow sync. ${approvedCandidate.reason}`,
          windowOverrideApplied: false,
        };
    const baseItem = this.buildBaseResultItem(termAssignment, finalCandidate);
    const actor = this.requireActor();
    const syncSource = input.source ?? 'ADMIN_MANUAL_SYNC';
    const closeReason =
      input.reason?.trim() ||
      closeCheck.reason;

    const closeValidation = workflowService.validateTransition({
      entityType: WorkflowEntityType.TERM_ASSIGNMENT,
      entityId: termAssignment._id.toString(),
      currentState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
      nextState: TermWorkflowState.OBJECTIVE_APPROVED,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      reason: closeReason,
    });

    if (!closeValidation.allowed) {
      return {
        ...baseItem,
        toState: TermWorkflowState.OBJECTIVE_APPROVED,
        status: 'SKIPPED',
        skipReason: 'TRANSITION_NOT_ALLOWED',
        message: closeValidation.message,
      };
    }

    if (
      finalCandidate.targetState &&
      finalCandidate.targetState !== TermWorkflowState.OBJECTIVE_APPROVED
    ) {
      const nextValidation = workflowService.validateTransition({
        entityType: WorkflowEntityType.TERM_ASSIGNMENT,
        entityId: termAssignment._id.toString(),
        currentState: TermWorkflowState.OBJECTIVE_APPROVED,
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
      await transitionTermAssignmentState(
        termAssignment._id.toString(),
        TermWorkflowState.OBJECTIVE_APPROVED,
        actor,
        closeReason,
        'ADMIN_WORKFLOW_SYNC_AUTO_CLOSE',
        {
          source: syncSource,
          autoClosedObjectiveSetting: true,
        },
      );

      const autoClosedAssignment = await TermAssignment.findById(termAssignment._id);
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
        finalCandidate.targetState !== TermWorkflowState.OBJECTIVE_APPROVED
      ) {
        await transitionTermAssignmentState(
          termAssignment._id.toString(),
          finalCandidate.targetState,
          actor,
          input.reason?.trim() || finalCandidate.reason,
          'ADMIN_WORKFLOW_SYNC',
          {
            source: syncSource,
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
    termAssignment: ITermAssignment,
    termCycle?: ITermCycle,
    options: { ignoreWindowDates?: boolean; groupedManagerReviewEnabled?: boolean } = {},
    assignmentTerms: ITermAssignment[] = [],
    termCycleMap: Map<AssessmentTermCodeType, ITermCycle> = new Map(),
    annualAssignment?: Record<string, any>,
    annualAssignmentMap: Map<string, Record<string, any>> = new Map(),
  ): Promise<WorkflowSyncCandidate> {
    const state = termAssignment.termState;
    const now = this.getCurrentDate();
    const ignoreWindowDates = options.ignoreWindowDates === true;
    const groupedManagerReviewEnabled = options.groupedManagerReviewEnabled === true;

    if (!termCycle) {
      return {
        skipReason: 'NOT_ELIGIBLE',
        reason: 'Assessment term window configuration was not found.',
      };
    }

    if (state === TermWorkflowState.OBJECTIVE_SETTING_OPEN) {
      return {
        skipReason: 'OBJECTIVE_SETTING_OPEN',
        reason: 'Objective setting is still open and must be closed explicitly by Manager/Admin.',
      };
    }

    if (state === TermWorkflowState.NOT_STARTED) {
      const customFlowMode = annualAssignment?.assignmentWindowSnapshot?.terms?.[
        termAssignment.assessmentTermCode
      ]?.customFlowMode;
      if (customFlowMode && customFlowMode !== 'REOPEN_OBJECTIVE_SETUP') {
        const effectiveWindows = resolveEffectiveTermWindows(
          termAssignment,
          termCycle,
          annualAssignment,
        );
        const customCandidate = this.resolveCustomNotStartedCandidate(
          customFlowMode,
          effectiveWindows,
          ignoreWindowDates,
          now,
          groupedManagerReviewEnabled,
        );
        if (customCandidate) return customCandidate;
      }

      const objectiveSettingEligibility = this.resolveObjectiveSettingOpenEligibility(
        termAssignment,
        assignmentTerms,
        termCycleMap,
        annualAssignmentMap,
        ignoreWindowDates,
        now,
      );

      if (!objectiveSettingEligibility.eligible) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: objectiveSettingEligibility.reason,
        };
      }

      const effectiveWindows = resolveEffectiveTermWindows(
        termAssignment,
        termCycle,
        annualAssignment,
      );
      const window = effectiveWindows.objectiveSettingWindow;
      return this.transitionCandidate(
        TermWorkflowState.OBJECTIVE_SETTING_OPEN,
        'Objective Setting Window',
        window,
        effectiveWindows.windowSource === 'ASSIGNMENT_CUSTOM'
          ? 'Custom assignment objective setting window is active for this employee.'
          : ignoreWindowDates
          ? 'Objective setting window date bypassed for testing.'
          : 'Objective setting window is active.',
        ignoreWindowDates || effectiveWindows.windowSource === 'ASSIGNMENT_CUSTOM',
      );
    }

    if (state === TermWorkflowState.OBJECTIVE_APPROVED) {
      return this.resolveApprovedStateCandidate(
        termCycle,
        termAssignment,
        annualAssignment,
        { ignoreWindowDates, groupedManagerReviewEnabled },
      );
    }

    if (state === TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN) {
      if (groupedManagerReviewEnabled) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Grouped manager review is configured for this cycle. Manager review opens at the configured grouped review period.',
        };
      }

      const effectiveWindows = resolveEffectiveTermWindows(
        termAssignment,
        termCycle,
        annualAssignment,
      );
      const managerReviewWindow = effectiveWindows.managerReviewWindow;
      if (!ignoreWindowDates && !this.hasWindowStarted(now, managerReviewWindow)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Manager review window has not started.',
        };
      }

      const candidate = this.transitionCandidate(
        TermWorkflowState.MANAGER_REVIEW_OPEN,
        'Manager Review Window',
        managerReviewWindow,
        ignoreWindowDates
          ? 'Manager review window date bypassed for testing.'
          : effectiveWindows.windowSource === 'ASSIGNMENT_CUSTOM'
          ? 'Custom manager review window is eligible for this employee.'
          : 'Manager review window is eligible.',
        ignoreWindowDates || effectiveWindows.windowSource === 'ASSIGNMENT_CUSTOM',
      );
      candidate.warning = await this.getAchievementSubmissionWarningForManagerReview(
        termAssignment,
        annualAssignment,
      );
      return candidate;
    }

    if (state === TermWorkflowState.MANAGER_REVIEW_SUBMITTED) {
      const effectiveWindows = resolveEffectiveTermWindows(
        termAssignment,
        termCycle,
        annualAssignment,
      );
      const finalizationWindow = effectiveWindows.termFinalizationWindow;
      if (!ignoreWindowDates && !this.hasWindowStarted(now, finalizationWindow)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Finalization window has not started.',
        };
      }

      return this.transitionCandidate(
        TermWorkflowState.TERM_FINALIZED,
        'Finalization Window',
        finalizationWindow,
        ignoreWindowDates
          ? 'Finalization window date bypassed for testing.'
          : effectiveWindows.windowSource === 'ASSIGNMENT_CUSTOM'
          ? 'Custom finalization window is eligible for this employee.'
          : 'Finalization window is eligible.',
        ignoreWindowDates || effectiveWindows.windowSource === 'ASSIGNMENT_CUSTOM',
      );
    }

    if (
      state === TermWorkflowState.MANAGER_REVIEW_OPEN ||
      state === TermWorkflowState.TERM_FINALIZED ||
      state === TermWorkflowState.CLOSED_BY_ADMIN
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
    targetState: TermWorkflowStateType,
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

  private resolveCustomNotStartedCandidate(
    customFlowMode: string,
    effectiveWindows: ReturnType<typeof resolveEffectiveTermWindows>,
    ignoreWindowDates: boolean,
    now: Date,
    groupedManagerReviewEnabled: boolean,
  ): WorkflowSyncCandidate | undefined {
    const active = (window?: DateWindowLike) =>
      ignoreWindowDates || this.isWindowActive(now, window);

    if (customFlowMode === 'CONTINUE_FROM_ACHIEVEMENT') {
      if (groupedManagerReviewEnabled) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Grouped manager review is configured for this cycle. Custom manager review and finalization jumps are handled by grouped review periods.',
        };
      }

      if (active(effectiveWindows.managerReviewWindow)) {
        return {
          ...this.transitionCandidate(
            TermWorkflowState.MANAGER_REVIEW_OPEN,
            'Manager Review Window',
            effectiveWindows.managerReviewWindow,
            'Custom assignment manager review window is active for this employee.',
            true,
          ),
          transitionPath: [
            TermWorkflowState.OBJECTIVE_SETTING_OPEN,
            TermWorkflowState.OBJECTIVE_APPROVED,
            TermWorkflowState.MANAGER_REVIEW_OPEN,
          ],
        };
      }

      if (active(effectiveWindows.termFinalizationWindow)) {
        return {
          ...this.transitionCandidate(
            TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
            'Finalization Window',
            effectiveWindows.termFinalizationWindow,
            'Custom assignment finalization window is active for this employee.',
            true,
          ),
          transitionPath: [
            TermWorkflowState.OBJECTIVE_SETTING_OPEN,
            TermWorkflowState.OBJECTIVE_APPROVED,
            TermWorkflowState.MANAGER_REVIEW_OPEN,
            TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
          ],
        };
      }

      return {
        skipReason: 'NOT_ELIGIBLE',
        reason: 'Custom manager review or finalization window is not active for this employee.',
      };
    }

    return undefined;
  }

  private resolveObjectiveSettingOpenEligibility(
    termAssignment: ITermAssignment,
    assignmentTerms: ITermAssignment[],
    termCycleMap: Map<AssessmentTermCodeType, ITermCycle>,
    annualAssignmentMap: Map<string, Record<string, any>>,
    ignoreWindowDates: boolean,
    now: Date,
  ): { eligible: boolean; reason: string } {
    const orderedTerms = assignmentTerms.length > 0
      ? assignmentTerms
      : [termAssignment];

    for (const currentTerm of orderedTerms) {
      const state = currentTerm.termState;
      const isTarget = currentTerm._id.toString() === termAssignment._id.toString();
      const label = currentTerm.termLabel || currentTerm.assessmentTermCode;

      if (this.isTermPastObjectiveSetting(state)) {
        continue;
      }

      if (state === TermWorkflowState.NOT_STARTED) {
        const currentTermCycle = termCycleMap.get(currentTerm.assessmentTermCode);
        const currentAnnualAssignment = annualAssignmentMap.get(
          currentTerm.annualAssignmentId.toString(),
        );
        const currentEffectiveWindows = resolveEffectiveTermWindows(
          currentTerm,
          currentTermCycle,
          currentAnnualAssignment,
        );
        const windowActive = ignoreWindowDates || this.isWindowActive(now, currentEffectiveWindows.objectiveSettingWindow);

        if (!windowActive) {
          return {
            eligible: false,
            reason: isTarget
              ? 'Objective setting window is not active for this employee.'
              : `${label} is the next scheduled assessment term, but its objective setting window is not active yet.`,
          };
        }

        if (!isTarget) {
          return {
            eligible: false,
            reason: `${label} must open objective setting before later terms can move forward.`,
          };
        }

        return {
          eligible: true,
          reason: ignoreWindowDates
            ? 'Objective setting window date bypassed for testing.'
            : 'Objective setting window is active.',
        };
      }

      return {
        eligible: false,
        reason: `${label} is still in the objective-setting workflow and must move forward before later terms can open.`,
      };
    }

    return {
      eligible: false,
      reason: 'This assessment term is not the next eligible term for objective setting.',
    };
  }

  private isTermPastObjectiveSetting(state: TermWorkflowStateType): boolean {
    switch (state) {
      case TermWorkflowState.OBJECTIVE_APPROVED:
      case TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN:
      case TermWorkflowState.MANAGER_REVIEW_OPEN:
      case TermWorkflowState.MANAGER_REVIEW_SUBMITTED:
      case TermWorkflowState.TERM_FINALIZED:
      case TermWorkflowState.CLOSED_BY_ADMIN:
        return true;
      default:
        return false;
    }
  }

  private compareAssignmentTerms(
    left: ITermAssignment,
    right: ITermAssignment,
    termCycleMap: Map<AssessmentTermCodeType, ITermCycle>,
  ): number {
    const leftRank = this.getAssessmentTermRank(
      left.assessmentTermCode,
      left.assessmentTermType ?? termCycleMap.get(left.assessmentTermCode)?.assessmentTermType,
    );
    const rightRank = this.getAssessmentTermRank(
      right.assessmentTermCode,
      right.assessmentTermType ?? termCycleMap.get(right.assessmentTermCode)?.assessmentTermType,
    );

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftStart = termCycleMap.get(left.assessmentTermCode)?.objectiveSettingWindow?.startDate?.getTime()
      ?? Number.MAX_SAFE_INTEGER;
    const rightStart = termCycleMap.get(right.assessmentTermCode)?.objectiveSettingWindow?.startDate?.getTime()
      ?? Number.MAX_SAFE_INTEGER;
    return leftStart - rightStart;
  }

  private getAssessmentTermRank(
    assessmentTermCode: AssessmentTermCodeType,
    assessmentTermType?: string,
  ): number {
    if (assessmentTermType === 'HALF_YEARLY') {
      const index = ['H1', 'H2'].indexOf(assessmentTermCode);
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    }
    if (assessmentTermType === 'YEARLY') {
      const index = ['Y1'].indexOf(assessmentTermCode);
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    }
    const index = ['Q1', 'Q2', 'Q3', 'Q4'].indexOf(assessmentTermCode);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  }

  private async canAutoCloseObjectiveSetting(
    termAssignment: ITermAssignment,
  ): Promise<ObjectiveSettingCloseCheck> {
    const objectives = await Objective.find({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
    })
      .select('title status')
      .lean();

    if (objectives.length === 0) {
      return {
        canClose: true,
        reason: 'No active objectives were found.',
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

  private async getAchievementSubmissionWarningForManagerReview(
    termAssignment: ITermAssignment,
    annualAssignment?: Record<string, any>,
  ): Promise<string | undefined> {
    const submission = await EmployeeAchievementSubmission.findOne({
      annualAssignmentId: termAssignment.annualAssignmentId,
      isDeleted: false,
    }).lean();

    const ready = await this.isAchievementSubmissionReadyForManagerReview(
      termAssignment,
      submission,
      annualAssignment,
    );
    return ready
      ? undefined
      : 'Employee achievement submission is not submitted or incomplete. Sync is allowed, but manager review will open with missing employee input.';
  }

  private async isAchievementSubmissionReadyForManagerReview(
    termAssignment: ITermAssignment,
    submission: Record<string, any> | null | undefined,
    annualAssignment?: Record<string, any>,
  ): Promise<boolean> {
    const templateVersion = annualAssignment?.templateVersionId
      ? await PmsTemplateVersion.findById(annualAssignment.templateVersionId)
        .select('metadata sections')
        .lean()
      : null;
    const achievementSection = templateVersion?.sections?.find(
      (section) => section.sectionKey === 'employee_achievement_submission',
    );
    const config = resolveEmployeeAchievementCompletionConfig(
      (templateVersion?.metadata ?? {}) as Record<string, any>,
      (achievementSection?.metadata ?? {}) as Record<string, any>,
    );
    if (config.achievementEntryMode === 'EMPLOYEE_AUTHORED') {
      return isEmployeeAchievementSubmissionComplete({ submission, config });
    }
    if (!submission || !Array.isArray(submission.achievementItems) || submission.achievementItems.length === 0) {
      return isEmployeeAchievementSubmissionComplete({ submission, config });
    }

    const approvedObjectives = await Objective.find({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
    })
      .select('weightage source isPredefined')
      .lean();
    const scoreableObjectiveIds = approvedObjectives
      .filter((objective: Record<string, any>) =>
        Number.isFinite(Number(objective.weightage)) ||
        objective.isPredefined === true ||
        objective.source === 'PREDEFINED'
      )
      .map((objective: Record<string, any>) => objective._id.toString());

    return isEmployeeAchievementSubmissionComplete({
      submission,
      config,
      scoreableObjectiveIds,
    });
  }

  private resolveApprovedStateCandidate(
    termCycle: ITermCycle | undefined,
    termAssignment: ITermAssignment,
    annualAssignment?: Record<string, any>,
    options: { ignoreWindowDates?: boolean; groupedManagerReviewEnabled?: boolean } = {},
  ): WorkflowSyncCandidate {
    const now = this.getCurrentDate();
    const ignoreWindowDates = options.ignoreWindowDates === true;
    const groupedManagerReviewEnabled = options.groupedManagerReviewEnabled === true;

    if (!termCycle) {
      return {
        skipReason: 'NOT_ELIGIBLE',
        reason: 'Assessment term window configuration was not found.',
      };
    }

    const effectiveWindows = resolveEffectiveTermWindows(
      termAssignment,
      termCycle,
      annualAssignment,
    );
    if (groupedManagerReviewEnabled) {
      return {
        skipReason: 'NOT_ELIGIBLE',
        reason: 'Grouped manager review is configured for this cycle. Manager review opens at the configured grouped review period.',
      };
    }

    const managerReviewWindow = effectiveWindows.managerReviewWindow;
    if (!ignoreWindowDates && !this.hasWindowStarted(now, managerReviewWindow)) {
      return {
        skipReason: 'NOT_ELIGIBLE',
        reason: 'Manager review window has not started.',
      };
    }
    return this.transitionCandidate(
      TermWorkflowState.MANAGER_REVIEW_OPEN,
      'Manager Review Window',
      managerReviewWindow,
      ignoreWindowDates
        ? 'Manager review window date bypassed for testing.'
        : effectiveWindows.windowSource === 'ASSIGNMENT_CUSTOM'
        ? 'Custom manager review window is eligible for this employee.'
        : 'Manager review window is eligible.',
      ignoreWindowDates || effectiveWindows.windowSource === 'ASSIGNMENT_CUSTOM',
    );
  }

  private workflowSyncMessage(candidate: WorkflowSyncCandidate): string {
    return candidate.warning
      ? `${candidate.reason} Warning: ${candidate.warning}`
      : candidate.reason;
  }

  private buildBaseResultItem(
    termAssignment: ITermAssignment,
    candidate: WorkflowSyncCandidate,
  ): WorkflowSyncResultItem {
    return {
      termAssignmentId: termAssignment._id.toString(),
      annualAssignmentId: termAssignment.annualAssignmentId?.toString(),
      employeeId: termAssignment.employeeId?.toString(),
      managerId: termAssignment.assignedManagerId?.toString(),
      assessmentTermCode: termAssignment.assessmentTermCode,
      fromState: termAssignment.termState,
      toState: candidate.targetState,
      action: candidate.targetState ? 'ADMIN_WORKFLOW_SYNC' : undefined,
      windowName: candidate.windowName,
      windowStart: candidate.windowStart?.toISOString(),
      windowEnd: candidate.windowEnd?.toISOString(),
      windowOverrideApplied: candidate.windowOverrideApplied === true,
      warning: candidate.warning,
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
    currentState: TermWorkflowStateType,
    targetState: TermWorkflowStateType,
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
