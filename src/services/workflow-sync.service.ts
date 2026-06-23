import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { accessService } from './access.service';
import { transitionTermAssignmentState } from './term-assignment-workflow.service';
import {
  ObjectiveStatus,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  PmsRole,
  TermWorkflowState,
  WorkflowEntityType,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { EmployeeAchievementSubmission, EmployeeAchievementSubmissionStatus } from '../models/pms-employee-achievement-submission.model';
import { Objective } from '../models/pms-objective.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import type { ITemplateSection } from '../models/pms-template-version.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import type { ITermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import type { ITermCycle } from '../models/pms-term-cycle.model';
import { workflowService } from './workflow.service';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  TermWorkflowState as TermWorkflowStateType,
} from '../constants/pms.enums';

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

interface ObjectiveScoringReadiness {
  ready: boolean;
  reason?: string;
}

export interface WorkflowSyncInput {
  cycleId?: string;
  assessmentTermCode?: AssessmentTermCodeType;
  dryRun?: boolean;
  reason?: string;
  ignoreWindowDates?: boolean;
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
}

export interface WorkflowSyncResult {
  totalChecked: number;
  totalUpdated: number;
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

    const termCycleMap = new Map(
      termCycles.map((termCycle) => [termCycle.assessmentTermCode, termCycle]),
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
        assignmentTerms,
        termCycleMap,
        input,
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

    return result;
  }

  private async processTermAssignment(
    termAssignment: ITermAssignment,
    termCycle: ITermCycle | undefined,
    assignmentTerms: ITermAssignment[],
    termCycleMap: Map<AssessmentTermCodeType, ITermCycle>,
    input: WorkflowSyncInput,
  ): Promise<WorkflowSyncResultItem> {
    if (termAssignment.termState === TermWorkflowState.OBJECTIVE_SETTING_OPEN) {
      return this.processObjectiveSettingOpenAssignment(
        termAssignment,
        termCycle,
        input,
      );
    }

    const candidate = await this.resolveCandidate(termAssignment, termCycle, {
      ignoreWindowDates: input.ignoreWindowDates === true,
    }, assignmentTerms, termCycleMap);
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

    if (candidate.targetState === TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN) {
      const readiness = await this.validateObjectiveScoringReadyForAchievementOpen(termAssignment);
      if (!readiness.ready) {
        return {
          ...baseItem,
          status: 'SKIPPED',
          skipReason: 'OBJECTIVE_SCORING_NOT_READY',
          message: readiness.reason,
        };
      }
    }

    const transitionValidation = workflowService.validateTransition({
      entityType: WorkflowEntityType.TERM_ASSIGNMENT,
      entityId: termAssignment._id.toString(),
      currentState: termAssignment.termState,
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
      await transitionTermAssignmentState(
        termAssignment._id.toString(),
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
    termAssignment: ITermAssignment,
    termCycle: ITermCycle | undefined,
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
    const closeReason =
      input.reason?.trim() ||
      'All objectives are approved; objective setting auto-closed during workflow sync.';

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

    if (finalCandidate.targetState === TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN) {
      const readiness = await this.validateObjectiveScoringReadyForAchievementOpen(termAssignment);
      if (!readiness.ready) {
        return {
          ...baseItem,
          status: 'SKIPPED',
          skipReason: 'OBJECTIVE_SCORING_NOT_READY',
          message: readiness.reason,
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
          source: 'ADMIN_MANUAL_SYNC',
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
    termAssignment: ITermAssignment,
    termCycle?: ITermCycle,
    options: { ignoreWindowDates?: boolean } = {},
    assignmentTerms: ITermAssignment[] = [],
    termCycleMap: Map<AssessmentTermCodeType, ITermCycle> = new Map(),
  ): Promise<WorkflowSyncCandidate> {
    const state = termAssignment.termState;
    const now = this.getCurrentDate();
    const ignoreWindowDates = options.ignoreWindowDates === true;

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
      const objectiveSettingEligibility = this.resolveObjectiveSettingOpenEligibility(
        termAssignment,
        assignmentTerms,
        termCycleMap,
        ignoreWindowDates,
        now,
      );

      if (!objectiveSettingEligibility.eligible) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: objectiveSettingEligibility.reason,
        };
      }

      const window = termCycle.objectiveSettingWindow;
      return this.transitionCandidate(
        TermWorkflowState.OBJECTIVE_SETTING_OPEN,
        'Objective Setting Window',
        window,
        ignoreWindowDates
          ? 'Objective setting window date bypassed for testing.'
          : 'Objective setting window is active.',
        ignoreWindowDates,
      );
    }

    if (state === TermWorkflowState.OBJECTIVE_APPROVED) {
      return this.resolveApprovedStateCandidate(termCycle, { ignoreWindowDates });
    }

    if (state === TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN) {
      const submission = await EmployeeAchievementSubmission.findOne({
        termAssignmentId: termAssignment._id,
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

      const managerReviewWindow = termCycle.managerReviewWindow;
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
          ? 'Employee achievement is submitted/locked and manager review window date bypassed for testing.'
          : 'Employee achievement is submitted/locked and manager review window is eligible.',
        ignoreWindowDates,
      );
    }

    if (state === TermWorkflowState.MANAGER_REVIEW_SUBMITTED) {
      const finalizationWindow = termCycle.termFinalizationWindow;
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
          : 'Finalization window is eligible.',
        ignoreWindowDates,
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

  private resolveObjectiveSettingOpenEligibility(
    termAssignment: ITermAssignment,
    assignmentTerms: ITermAssignment[],
    termCycleMap: Map<AssessmentTermCodeType, ITermCycle>,
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
        const windowActive = ignoreWindowDates || this.isWindowActive(now, currentTermCycle?.objectiveSettingWindow);

        if (!windowActive) {
          return {
            eligible: false,
            reason: isTarget
              ? 'Objective setting window is not active.'
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

  private async validateObjectiveScoringReadyForAchievementOpen(
    termAssignment: ITermAssignment,
  ): Promise<ObjectiveScoringReadiness> {
    const objectiveSectionWeightage = await this.getObjectiveScoringWeightage(termAssignment);

    if (objectiveSectionWeightage <= 0) {
      return { ready: true };
    }

    const approvedObjectives = await Objective.find({
      termAssignmentId: termAssignment._id,
      isDeleted: false,
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
    })
      .select('title weightage')
      .lean();

    if (approvedObjectives.length === 0) {
      return {
        ready: false,
        reason:
          `Performance Objectives has ${this.formatWeightage(objectiveSectionWeightage)}% scoring weightage, ` +
          'but no approved objectives exist. Add/approve objectives or change the scoring split before opening achievement submission.',
      };
    }

    const approvedObjectiveWeightage = approvedObjectives.reduce(
      (total, objective) => total + Number(objective.weightage ?? 0),
      0,
    );

    if (Math.abs(approvedObjectiveWeightage - 100) > 0.01) {
      return {
        ready: false,
        reason:
          'Approved objective weightage must total 100% before achievement submission opens. ' +
          `Current approved objective total is ${this.formatWeightage(approvedObjectiveWeightage)}%.`,
      };
    }

    return { ready: true };
  }

  private async getObjectiveScoringWeightage(termAssignment: ITermAssignment): Promise<number> {
    const templateVersionId = await this.resolveTemplateVersionId(termAssignment);
    if (!templateVersionId) {
      return 0;
    }

    const templateVersion = await PmsTemplateVersion.findById(templateVersionId)
      .select('sections')
      .lean();

    if (!templateVersion) {
      return 0;
    }

    return (templateVersion.sections ?? [])
      .filter((section) => this.isObjectiveScoringSectionInTermScope(section, termAssignment.assessmentTermCode))
      .reduce((total, section) => total + Number(section.sectionScoringConfig?.weightage ?? 0), 0);
  }

  private async resolveTemplateVersionId(termAssignment: ITermAssignment): Promise<Types.ObjectId | undefined> {
    if (termAssignment.templateVersionId) {
      return termAssignment.templateVersionId;
    }

    const annualAssignment = await AnnualAssignment.findById(termAssignment.annualAssignmentId)
      .select('templateVersionId')
      .lean();

    return annualAssignment?.templateVersionId;
  }

  private isObjectiveScoringSectionInTermScope(
    section: ITemplateSection,
    assessmentTermCode: AssessmentTermCodeType,
  ): boolean {
    if (section.sectionType !== PmsTemplateSectionType.OBJECTIVES) {
      return false;
    }

    if (!this.isTermLevelTemplateSection(section.level)) {
      return false;
    }

    if (section.sectionScoringConfig?.participatesInScoring !== true) {
      return false;
    }

    const allowedTerms = [
      ...(section.termScope ?? []),
      ...(section.repeatFor ?? []),
    ];

    return allowedTerms.length === 0 || allowedTerms.includes(assessmentTermCode);
  }

  private isTermLevelTemplateSection(level?: unknown): boolean {
    return String(level ?? '').trim().toUpperCase() === PmsTemplateSectionLevel.TERM;
  }

  private formatWeightage(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  private resolveApprovedStateCandidate(
    termCycle: ITermCycle | undefined,
    options: { ignoreWindowDates?: boolean } = {},
  ): WorkflowSyncCandidate {
    const now = this.getCurrentDate();
    const ignoreWindowDates = options.ignoreWindowDates === true;

    if (!termCycle) {
      return {
        skipReason: 'NOT_ELIGIBLE',
        reason: 'Assessment term window configuration was not found.',
      };
    }

    const achievementWindow = termCycle.achievementSubmissionWindow;
    if (achievementWindow?.enabled === true) {
      if (!ignoreWindowDates && !this.hasWindowStarted(now, achievementWindow)) {
        return {
          skipReason: 'NOT_ELIGIBLE',
          reason: 'Employee achievement submission window has not started.',
        };
      }
      return this.transitionCandidate(
        TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
        'Employee Achievement Submission Window',
        achievementWindow,
        ignoreWindowDates
          ? 'Employee achievement submission window date bypassed for testing.'
          : 'Employee achievement submission window is eligible.',
        ignoreWindowDates,
      );
    }

    const managerReviewWindow = termCycle.managerReviewWindow;
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
        ? 'Employee achievement is disabled; manager review window date bypassed for testing.'
        : 'Employee achievement is disabled; manager review window is eligible.',
      ignoreWindowDates,
    );
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
