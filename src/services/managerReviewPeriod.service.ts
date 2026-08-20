import { Types } from 'mongoose';
import { BaseService } from './base.service';
import {
  ManagerReviewPeriodState,
  normalizePmsRole,
  PmsRole,
  TermWorkflowState,
} from '../constants/pms.enums';
import {
  AnnualAssignment,
  EmployeeCareerProfileSnapshotTrigger,
} from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { EmployeeAchievementSubmission } from '../models/pms-employee-achievement-submission.model';
import { ManagerReviewPeriodAssignment } from '../models/pms-manager-review-period-assignment.model';
import { Objective } from '../models/pms-objective.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { TermCycle } from '../models/pms-term-cycle.model';
import { LOV } from '../models/lov.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { DelegationService } from './delegation.service';
import { PmsEmployeeCareerProfileSnapshotService } from './pmsEmployeeCareerProfileSnapshot.service';
import { traceDatabaseOperation } from '../utilis/databaseDiagnostics';
import { transitionTermAssignmentState } from './term-assignment-workflow.service';
import {
  intersectGroupTerms,
  isGroupedManagerReviewConfig,
  normalizeReviewCadenceConfig,
} from '../utilis/pmsReviewCadence';
import type { RequestContext } from '../types/context';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IManagerReviewPeriodAssignment } from '../models/pms-manager-review-period-assignment.model';
import type { ITermAssignment } from '../models/pms-term-assignment.model';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  ManagerReviewPeriodState as ManagerReviewPeriodStateType,
} from '../constants/pms.enums';

interface ReviewValueInput {
  templateFieldId?: string;
  fieldKey: string;
  sectionKey: string;
  roleCode?: string;
  actorUserId?: string;
  workflowStage?: string;
  valueJson?: unknown;
  valueText?: string;
  valueNumber?: number;
  valueDate?: Date | string;
}

interface RatingInput {
  objectiveId?: string;
  rating?: number;
  comments?: string;
}

interface AttachmentInput {
  fileName?: string;
  fileUrl?: string;
  documentId?: string;
  uploadedAt?: Date | string;
}

interface ManagerReviewPeriodAchievementSubmissionRecord {
  id: string;
  annualAssignmentId: string;
  termAssignmentId: string;
  cycleId?: string;
  employeeId: string;
  managerId: string;
  templateVersionId?: string;
  assessmentTermCode: AssessmentTermCodeType;
  status: string;
  achievementItems: Array<Record<string, unknown>>;
  achievementValues: Array<Record<string, unknown>>;
  draftSavedAt?: string;
  submittedBy?: string;
  submittedAt?: string;
  lockedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveManagerReviewPeriodDraftInput {
  ratings?: RatingInput[];
  comments?: string;
  score?: number;
  overallRating?: string;
  recommendation?: string;
  achievements?: string;
  developmentObservations?: string;
  attachments?: AttachmentInput[];
  reviewValues?: ReviewValueInput[];
}

export interface SubmitManagerReviewPeriodInput extends SaveManagerReviewPeriodDraftInput {
  score?: number;
  comments: string;
}

// Current client flow stores the manager's rating without a numeric score.
// Retain the score fields and legacy path for future client activation.
const RATING_ONLY_MANAGER_REVIEW = true;

export type ManagerReviewPeriodWorkspaceMode = 'manager' | 'employee' | 'admin';

export interface OpenEligibleManagerReviewPeriodsResult {
  checked: number;
  opened: number;
  alreadyOpen: number;
  alreadyAdvanced: number;
  notReady: number;
}

export interface ManagerReviewPeriodAssignmentRecord {
  id: string;
  annualAssignmentId: string;
  cycleId: string;
  cycleName: string;
  cycleCode?: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  designation?: string;
  employeeDesignation?: string;
  specificRole?: string;
  department?: string;
  departmentName?: string;
  employeeDepartment?: string;
  departmentId?: string;
  managerId: string;
  managerName: string;
  templateVersionId: string;
  reviewCode: string;
  label: string;
  includedTerms: AssessmentTermCodeType[];
  includedTermAssignmentIds: string[];
  anchorTerm: AssessmentTermCodeType;
  anchorTermAssignmentId?: string;
  reviewState: ManagerReviewPeriodStateType;
  isDelegated?: boolean;
  assessmentStartDate?: string;
  assessmentEndDate?: string;
  reviewWindow?: { startDate?: string; endDate?: string };
  finalizationWindow?: { startDate?: string; endDate?: string };
  approvedObjectives: Array<{
    id: string;
    termAssignmentId: string;
    assessmentTermCode: AssessmentTermCodeType;
    title: string;
    description?: string;
    targetMetric?: string;
    targetValue?: string;
    successCriteria?: string;
    weightage?: number;
  }>;
  achievementSubmissions: ManagerReviewPeriodAchievementSubmissionRecord[];
  review: {
    id: string;
    reviewState: ManagerReviewPeriodStateType;
    ratings: RatingInput[];
    comments?: string;
    score?: number;
    overallRating?: string;
    recommendation?: string;
    achievements?: string;
    developmentObservations?: string;
    attachments: AttachmentInput[];
    reviewValues: ReviewValueInput[];
    submittedAt?: string;
    finalizedAt?: string;
  };
}

export class ManagerReviewPeriodService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async createPeriodsForAnnualAssignment(
    annualAssignment: IAnnualAssignment,
    termAssignments: ITermAssignment[],
  ): Promise<IManagerReviewPeriodAssignment[]> {
    const cycle = await AnnualCycle.findById(annualAssignment.cycleId).lean();
    if (!cycle || !isGroupedManagerReviewConfig(cycle.reviewCadenceConfig)) {
      return [];
    }

    const config = normalizeReviewCadenceConfig(
      cycle.reviewCadenceConfig,
      cycle.assessmentTermType,
    );
    const termByCode = new Map(
      termAssignments.map((termAssignment) => [termAssignment.assessmentTermCode, termAssignment]),
    );
    const payloads = config.groups.flatMap((group) => {
      const includedTerms = intersectGroupTerms(group, annualAssignment.applicableTerms);
      const includedAssignments = includedTerms
        .map((term) => termByCode.get(term))
        .filter((item): item is ITermAssignment => Boolean(item));

      if (includedAssignments.length === 0) {
        return [];
      }

      const anchorAssignment =
        termByCode.get(group.anchorTerm) ?? includedAssignments[includedAssignments.length - 1];

      return [{
        annualAssignmentId: annualAssignment._id,
        cycleId: annualAssignment.cycleId,
        employeeId: annualAssignment.employeeId,
        managerId: annualAssignment.assignedManagerId,
        templateVersionId: annualAssignment.templateVersionId,
        reviewCode: group.reviewCode,
        label: group.label,
        includedTerms,
        includedTermAssignmentIds: includedAssignments.map((item) => item._id),
        anchorTerm: anchorAssignment.assessmentTermCode,
        anchorTermAssignmentId: anchorAssignment._id,
        reviewState: ManagerReviewPeriodState.NOT_STARTED,
        createdBy: this.actorIdObject(),
      }];
    });

    if (payloads.length === 0) {
      return [];
    }

    return ManagerReviewPeriodAssignment.insertMany(payloads);
  }

  async listAssignments(
    mode: ManagerReviewPeriodWorkspaceMode = 'manager',
  ): Promise<ManagerReviewPeriodAssignmentRecord[]> {
    const actor = this.requireActor();
    const actorRole = normalizePmsRole(actor.actorRole);
    const filter: Record<string, unknown> = { isDeleted: false };

    if (mode === 'employee') {
      filter.employeeId = this.toObjectId(actor.actorId, 'actorId');
    } else if (mode === 'admin' && actorRole === PmsRole.ADMIN) {
      // Admin can inspect all grouped manager reviews.
    } else {
      const managerId = this.toObjectId(actor.actorId, 'actorId');
      const delegatedClauses = await this.delegatedReviewPeriodClausesForActor(actor.actorId);
      filter.$or = [{ managerId }, ...delegatedClauses];
    }

    const reviews = await traceDatabaseOperation(
      'grouped-reviews.list.root',
      { route: '/pms/manager-review-periods/assignments', mode },
      async () => ManagerReviewPeriodAssignment.find(filter).sort({ updatedAt: -1, reviewCode: 1 }).lean(),
      (records) => records.length,
    );
    return this.mapRecords(reviews);
  }

  async getAssignment(reviewPeriodId: string): Promise<ManagerReviewPeriodAssignmentRecord> {
    const review = await this.getReviewPeriod(reviewPeriodId);
    await this.assertReviewAccess('managerReviewPeriod.detail', review);
    const [record] = await this.mapRecords([review]);
    return record;
  }

  async openEligiblePeriodsForCycle(
    cycleId: string,
    options: {
      dryRun?: boolean;
      ignoreWindowDates?: boolean;
      promoteIncludedTerms?: boolean;
      annualAssignmentId?: string;
      annualAssignmentIds?: string[];
    } = {},
  ): Promise<OpenEligibleManagerReviewPeriodsResult> {
    const cycleObjectId = this.toObjectId(cycleId, 'cycleId');
    const filter: Record<string, unknown> = {
      cycleId: cycleObjectId,
      isDeleted: false,
    };
    const scopedAnnualAssignmentIds = Array.from(new Set([
      ...(options.annualAssignmentIds ?? []),
      ...(options.annualAssignmentId ? [options.annualAssignmentId] : []),
    ])).map((id) => this.toObjectId(id, 'annualAssignmentId'));
    if (scopedAnnualAssignmentIds.length === 1) {
      filter.annualAssignmentId = scopedAnnualAssignmentIds[0];
    } else if (scopedAnnualAssignmentIds.length > 1) {
      filter.annualAssignmentId = { $in: scopedAnnualAssignmentIds };
    }
    const reviews = await ManagerReviewPeriodAssignment.find(filter);
    let opened = 0;
    let alreadyOpen = 0;
    let alreadyAdvanced = 0;
    let notReady = 0;

    for (const review of reviews) {
      const canPromoteIncludedTerms = options.promoteIncludedTerms !== false;
      if (
        review.reviewState === ManagerReviewPeriodState.MANAGER_REVIEW_OPEN ||
        review.reviewState === ManagerReviewPeriodState.REOPENED_BY_ADMIN
      ) {
        const termsReady = await this.isReviewPeriodOpenEligible(review, true);
        if (termsReady) {
          alreadyOpen += 1;
          continue;
        }

        if (options.dryRun === true) {
          notReady += 1;
          continue;
        }

        review.previousReviewState = review.reviewState;
        review.reviewState = ManagerReviewPeriodState.NOT_STARTED;
        review.updatedBy = this.actorIdObject();
        review.version += 1;
        await review.save();
        await this.audit(
          'PMS_GROUPED_MANAGER_REVIEW_RESET_NOT_READY',
          'MANAGER_REVIEW_PERIOD',
          review._id.toString(),
          { reviewState: review.previousReviewState },
          { reviewState: review.reviewState },
          'Grouped manager review was previously opened before all included terms reached manager review.',
        );
      }

      if (review.reviewState !== ManagerReviewPeriodState.NOT_STARTED) {
        alreadyAdvanced += 1;
        continue;
      }

      const eligible = await this.isReviewPeriodOpenEligible(
        review,
        options.ignoreWindowDates === true,
        canPromoteIncludedTerms,
      );
      if (!eligible) {
        notReady += 1;
        continue;
      }

      if (options.dryRun !== true) {
        if (canPromoteIncludedTerms) {
          await this.promoteIncludedTermsToManagerReview(
            review,
            options.ignoreWindowDates === true,
          );
        }
        const strictlyReady = await this.isReviewPeriodOpenEligible(
          review,
          options.ignoreWindowDates === true,
        );
        if (!strictlyReady) {
          notReady += 1;
          continue;
        }

        review.previousReviewState = review.reviewState;
        review.reviewState = ManagerReviewPeriodState.MANAGER_REVIEW_OPEN;
        review.openedAt = new Date();
        review.updatedBy = this.actorIdObject();
        review.version += 1;
        await review.save();
        await this.audit(
          'PMS_MANAGER_REVIEW_PERIOD_OPENED',
          'MANAGER_REVIEW_PERIOD',
          review._id.toString(),
          { reviewState: ManagerReviewPeriodState.NOT_STARTED },
          { reviewState: review.reviewState },
        );
      }
      opened += 1;
    }

    return { checked: reviews.length, opened, alreadyOpen, alreadyAdvanced, notReady };
  }

  async saveDraft(
    reviewPeriodId: string,
    input: SaveManagerReviewPeriodDraftInput,
  ): Promise<IManagerReviewPeriodAssignment> {
    const review = await this.getReviewPeriod(reviewPeriodId);
    await this.assertManagerAccess('managerReviewPeriod.draft', review);
    await this.assertReviewWindow(review);

    if (review.reviewState !== ManagerReviewPeriodState.MANAGER_REVIEW_OPEN) {
      throw new Error('Grouped manager review draft can be saved only when manager review is open');
    }
    await this.assertIncludedTermsReadyForManagerReview(review);

    const overallRating = await this.validateManagerOverallRating(input.overallRating, false);
    this.applyReviewInput(review, { ...input, overallRating }, false);
    await review.save();
    await this.audit(
      'PMS_MANAGER_REVIEW_PERIOD_DRAFT_SAVED',
      'MANAGER_REVIEW_PERIOD',
      review._id.toString(),
      undefined,
      review.toObject(),
    );
    return review;
  }

  async submitReview(
    reviewPeriodId: string,
    input: SubmitManagerReviewPeriodInput,
  ): Promise<IManagerReviewPeriodAssignment> {
    const review = await this.getReviewPeriod(reviewPeriodId);
    await this.assertManagerAccess('managerReviewPeriod.submit', review);
    await this.assertReviewWindow(review);

    if (review.reviewState !== ManagerReviewPeriodState.MANAGER_REVIEW_OPEN) {
      throw new Error('Grouped manager review can be submitted only when manager review is open');
    }
    await this.assertIncludedTermsReadyForManagerReview(review);
    if (!RATING_ONLY_MANAGER_REVIEW && !Number.isFinite(Number(input.score))) {
      throw new Error('Grouped manager review requires a numeric score');
    }
    if (!input.comments?.trim()) {
      throw new Error('Grouped manager review comments are required');
    }
    const overallRating = await this.validateManagerOverallRating(input.overallRating, true);

    await new PmsEmployeeCareerProfileSnapshotService(
      this.context,
    ).freezeForAnnualAssignment(
      review.annualAssignmentId,
      EmployeeCareerProfileSnapshotTrigger.FIRST_MANAGER_REVIEW_SUBMISSION,
    );

    this.applyReviewInput(review, { ...input, overallRating }, true);
    review.previousReviewState = review.reviewState;
    review.reviewState = ManagerReviewPeriodState.MANAGER_REVIEW_SUBMITTED;
    review.submittedAt = new Date();
    review.updatedBy = this.actorIdObject();
    review.version += 1;
    await review.save();

    await this.finalizeReviewPeriod(review);
    const finalized = await this.getReviewPeriod(reviewPeriodId);
    await this.audit(
      'PMS_MANAGER_REVIEW_PERIOD_SUBMITTED',
      'MANAGER_REVIEW_PERIOD',
      review._id.toString(),
      undefined,
      finalized.toObject(),
    );
    return finalized;
  }

  async closePeriodsForAnnualAssignment(
    annualAssignmentId: Types.ObjectId,
    reason: string,
  ): Promise<void> {
    await ManagerReviewPeriodAssignment.updateMany(
      {
        annualAssignmentId,
        isDeleted: false,
        reviewState: {
          $nin: [
            ManagerReviewPeriodState.FINALIZED,
            ManagerReviewPeriodState.CLOSED_BY_ADMIN,
          ],
        },
      },
      {
        $set: {
          reviewState: ManagerReviewPeriodState.CLOSED_BY_ADMIN,
          updatedBy: this.actorIdObject(),
        },
        $inc: { version: 1 },
      },
    );

    await this.audit(
      'PMS_MANAGER_REVIEW_PERIODS_CLOSED',
      'ANNUAL_ASSIGNMENT',
      annualAssignmentId.toString(),
      undefined,
      { reason },
      reason,
    );
  }

  async updateManagerForMutablePeriods(
    annualAssignmentId: Types.ObjectId,
    mutableTermAssignmentIds: Types.ObjectId[],
    managerId: Types.ObjectId,
  ): Promise<void> {
    const mutableIds = new Set(mutableTermAssignmentIds.map((id) => id.toString()));
    const periods = await ManagerReviewPeriodAssignment.find({
      annualAssignmentId,
      isDeleted: false,
      reviewState: {
        $nin: [
          ManagerReviewPeriodState.FINALIZED,
          ManagerReviewPeriodState.CLOSED_BY_ADMIN,
        ],
      },
    });

    for (const period of periods) {
      const includedIds = period.includedTermAssignmentIds.map((id) => id.toString());
      const touched = includedIds.some((id) => mutableIds.has(id));
      const fullyTouched = includedIds.every((id) => mutableIds.has(id));
      if (touched && !fullyTouched) {
        throw new Error(
          `Manager reassignment must include the full grouped manager review period ${period.reviewCode}.`,
        );
      }
      if (fullyTouched) {
        period.managerId = managerId;
        period.updatedBy = this.actorIdObject();
        period.version += 1;
        await period.save();
      }
    }
  }

  private async finalizeReviewPeriod(review: IManagerReviewPeriodAssignment): Promise<void> {
    const termAssignments = await TermAssignment.find({
      _id: { $in: review.includedTermAssignmentIds },
      isDeleted: false,
    });
    const actor = this.requireActor();

    for (const termAssignment of termAssignments) {
      const finalizedTermAssignment = await this.transitionTermToFinalized(
        termAssignment,
        actor,
        review._id.toString(),
      );
      if (!finalizedTermAssignment) {
        continue;
      }

      finalizedTermAssignment.termScore = review.score;
      finalizedTermAssignment.termRating = review.overallRating;
      finalizedTermAssignment.termSummary = {
        ...(finalizedTermAssignment.termSummary ?? {}),
        managerReviewPeriodId: review._id,
        managerReviewPeriodCode: review.reviewCode,
        comments: review.comments,
        recommendation: review.recommendation,
        achievements: review.achievements,
        developmentObservations: review.developmentObservations,
        submittedAt: review.submittedAt,
        finalizedAt: new Date(),
        reviewStatus: ManagerReviewPeriodState.FINALIZED,
      };
      finalizedTermAssignment.updatedBy = this.actorIdObject();
      finalizedTermAssignment.version += 1;
      await finalizedTermAssignment.save();
    }

    review.previousReviewState = review.reviewState;
    review.reviewState = ManagerReviewPeriodState.FINALIZED;
    review.finalizedAt = new Date();
    review.updatedBy = this.actorIdObject();
    review.version += 1;
    await review.save();
  }

  private async transitionTermToFinalized(
    termAssignment: ITermAssignment,
    actor: { actorId: string; actorRole: string },
    managerReviewPeriodId: string,
  ): Promise<ITermAssignment | null> {
    if (termAssignment.termState === TermWorkflowState.TERM_FINALIZED) {
      return termAssignment;
    }
    if (termAssignment.termState === TermWorkflowState.CLOSED_BY_ADMIN) {
      return null;
    }

    const path = this.pathToTermFinalized(termAssignment.termState);
    for (const nextState of path) {
      await transitionTermAssignmentState(
        termAssignment._id.toString(),
        nextState,
        actor,
        'Grouped manager review finalized.',
        'PMS_GROUPED_MANAGER_REVIEW_FINALIZED',
        {
          managerReviewPeriodId,
        },
      );
    }

    return TermAssignment.findById(termAssignment._id);
  }

  private pathToTermFinalized(state: string): TermWorkflowState[] {
    switch (state) {
      case TermWorkflowState.OBJECTIVE_APPROVED:
        return [
          TermWorkflowState.MANAGER_REVIEW_OPEN,
          TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
          TermWorkflowState.TERM_FINALIZED,
        ];
      case TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN:
        return [
          TermWorkflowState.MANAGER_REVIEW_OPEN,
          TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
          TermWorkflowState.TERM_FINALIZED,
        ];
      case TermWorkflowState.MANAGER_REVIEW_OPEN:
        return [
          TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
          TermWorkflowState.TERM_FINALIZED,
        ];
      case TermWorkflowState.MANAGER_REVIEW_SUBMITTED:
        return [TermWorkflowState.TERM_FINALIZED];
      default:
        throw new Error(`Term ${state} cannot be finalized by grouped manager review`);
    }
  }

  private async isReviewPeriodOpenEligible(
    review: IManagerReviewPeriodAssignment,
    ignoreWindowDates: boolean,
    allowTermPromotion = false,
  ): Promise<boolean> {
    const readiness = await this.getGroupedReviewTermReadiness(review, ignoreWindowDates);
    if (!readiness) {
      return false;
    }

    if (!allowTermPromotion && readiness.pendingPromotion.length > 0) {
      return false;
    }

    if (!ignoreWindowDates) {
      const window = await this.getReviewWindow(review);
      if (
        window?.startDate &&
        window?.endDate &&
        !this.isWindowActive(this.getCurrentDate(), window)
      ) {
        return false;
      }
    }

    return true;
  }

  private async getGroupedReviewTermReadiness(
    review: IManagerReviewPeriodAssignment,
    _ignoreWindowDates: boolean,
  ): Promise<{
    pendingPromotion: ITermAssignment[];
  } | null> {
    const termAssignments = await TermAssignment.find({
      _id: { $in: review.includedTermAssignmentIds },
      isDeleted: false,
    }).lean();

    if (termAssignments.length !== review.includedTermAssignmentIds.length) {
      return null;
    }

    const pendingPromotion: ITermAssignment[] = [];

    for (const term of termAssignments) {
      const state = term.termState;
      if (
        state === TermWorkflowState.MANAGER_REVIEW_OPEN ||
        state === TermWorkflowState.MANAGER_REVIEW_SUBMITTED ||
        state === TermWorkflowState.TERM_FINALIZED
      ) {
        continue;
      }

      if (
        state !== TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN &&
        state !== TermWorkflowState.OBJECTIVE_APPROVED
      ) {
        return null;
      }

      pendingPromotion.push(term as ITermAssignment);
    }

    return { pendingPromotion };
  }

  private async promoteIncludedTermsToManagerReview(
    review: IManagerReviewPeriodAssignment,
    ignoreWindowDates: boolean,
  ): Promise<void> {
    const readiness = await this.getGroupedReviewTermReadiness(review, ignoreWindowDates);
    if (!readiness || readiness.pendingPromotion.length === 0) {
      return;
    }

    const actor = this.requireActor();
    for (const termAssignment of readiness.pendingPromotion) {
      await transitionTermAssignmentState(
        termAssignment._id.toString(),
        TermWorkflowState.MANAGER_REVIEW_OPEN,
        actor,
        'All included terms are objective-approved; grouped manager review is ready.',
        'PMS_GROUPED_MANAGER_REVIEW_TERM_OPENED',
        {
          managerReviewPeriodId: review._id.toString(),
          windowOverrideApplied: ignoreWindowDates,
        },
      );
    }
  }

  private isWindowActive(
    now: Date,
    window?: { startDate?: Date; endDate?: Date },
  ): boolean {
    if (!window?.startDate || !window?.endDate) return false;

    const start = new Date(window.startDate);
    const end = new Date(window.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return now >= start && now <= end;
  }

  private applyReviewInput(
    review: IManagerReviewPeriodAssignment,
    input: SaveManagerReviewPeriodDraftInput,
    submitted: boolean,
  ): void {
    review.ratings = this.normalizeRatings(input.ratings ?? []);
    review.comments = input.comments?.trim();
    review.score = RATING_ONLY_MANAGER_REVIEW ? undefined : input.score;
    review.overallScore = RATING_ONLY_MANAGER_REVIEW ? undefined : input.score;
    review.overallRating = input.overallRating?.trim();
    review.recommendation = input.recommendation?.trim();
    review.achievements = input.achievements?.trim();
    review.developmentObservations = input.developmentObservations?.trim();
    review.attachments = this.normalizeAttachments(input.attachments ?? []);
    review.reviewValues = this.normalizeReviewValues(input.reviewValues ?? []);
    if (submitted) {
      review.submittedAt = new Date();
    }
    review.updatedBy = this.actorIdObject();
    review.version += 1;
  }

  private async validateManagerOverallRating(
    rating: string | undefined,
    required: boolean,
  ): Promise<string | undefined> {
    const normalizedRating = rating?.trim();
    if (!normalizedRating) {
      if (required) {
        throw new Error('Overall Rating is required');
      }
      return undefined;
    }

    const managerRatingLov = await LOV.findOne({ type: 'managerrating' })
      .select('values')
      .lean();
    const activeOptions = managerRatingLov?.values?.filter(
      (option) => option.isActive !== false,
    ) ?? [];
    const matchedOption = activeOptions.find(
      (option) =>
        option.value.trim().toLowerCase() === normalizedRating.toLowerCase() ||
        option.label.trim().toLowerCase() === normalizedRating.toLowerCase(),
    );

    if (!matchedOption) {
      throw new Error('Overall Rating must be an active Manager Rating option');
    }

    return matchedOption.value.trim();
  }

  private async mapRecords(
    reviews: IManagerReviewPeriodAssignment[],
  ): Promise<ManagerReviewPeriodAssignmentRecord[]> {
    if (reviews.length === 0) {
      return [];
    }

    const annualAssignmentIds = reviews.map((review) => review.annualAssignmentId);
    const cycleIds = reviews.map((review) => review.cycleId);
    const termAssignmentIds = reviews.flatMap((review) => review.includedTermAssignmentIds);
    const [annualAssignments, cycles, termAssignments, objectives, achievementSubmissions] =
      await traceDatabaseOperation(
        'grouped-reviews.list.related-batches',
        { route: '/pms/manager-review-periods/assignments', reviewCount: reviews.length },
        async () => Promise.all([
          AnnualAssignment.find({ _id: { $in: annualAssignmentIds }, isDeleted: false }).lean(),
          AnnualCycle.find({ _id: { $in: cycleIds }, isDeleted: false })
            .select({ name: 1, code: 1, startDate: 1, endDate: 1 })
            .lean(),
          TermAssignment.find({ _id: { $in: termAssignmentIds }, isDeleted: false })
            .select({ _id: 1, cycleTermId: 1 })
            .lean(),
          Objective.find({
            termAssignmentId: { $in: termAssignmentIds },
            isDeleted: false,
            status: 'OBJECTIVE_APPROVED',
          }).lean(),
          EmployeeAchievementSubmission.find({
            annualAssignmentId: { $in: annualAssignmentIds },
            isDeleted: false,
          }).lean(),
        ]),
      );
    const annualById = new Map(annualAssignments.map((item) => [item._id.toString(), item]));
    const cycleById = new Map(cycles.map((item) => [item._id.toString(), item]));
    const termCycles = await TermCycle.find({
      _id: {
        $in: termAssignments
          .map((assignment) => assignment.cycleTermId)
          .filter(Boolean),
      },
      isDeleted: false,
    })
      .select({
        startDate: 1,
        endDate: 1,
        managerReviewWindow: 1,
        termFinalizationWindow: 1,
      })
      .lean();
    const termAssignmentById = new Map(
      termAssignments.map((assignment) => [assignment._id.toString(), assignment]),
    );
    const termCycleById = new Map(
      termCycles.map((termCycle) => [termCycle._id.toString(), termCycle]),
    );
    const objectivesByTermId = new Map<string, typeof objectives>();
    for (const objective of objectives) {
      const key = objective.termAssignmentId.toString();
      const bucket = objectivesByTermId.get(key) ?? [];
      bucket.push(objective);
      objectivesByTermId.set(key, bucket);
    }
    const achievementSubmissionsByAnnualId = new Map(
      achievementSubmissions.map((submission) => [
        submission.annualAssignmentId.toString(),
        submission,
      ]),
    );

    const actorId = this.context.user?._id.toString();

    return Promise.all(reviews.map(async (review) => {
      const annualAssignment = annualById.get(review.annualAssignmentId.toString());
      const cycle = cycleById.get(review.cycleId.toString());
      const employeeSnapshot = annualAssignment?.employeeSnapshot ?? {};
      const managerSnapshot = annualAssignment?.managerSnapshot ?? {};
      const orgSnapshot = annualAssignment?.orgSnapshot ?? {};
      const employeeDesignation = String(
        employeeSnapshot.specificRole ??
        employeeSnapshot.designation ??
        employeeSnapshot.role ??
        '',
      );
      const employeeDepartment = String(
        employeeSnapshot.department ??
        employeeSnapshot.departmentName ??
        employeeSnapshot.departmentId ??
        '',
      );
      const includedTermCycles = review.includedTermAssignmentIds
        .map((termAssignmentId) =>
          termAssignmentById.get(termAssignmentId.toString()))
        .map((termAssignment) =>
          termAssignment?.cycleTermId
            ? termCycleById.get(termAssignment.cycleTermId.toString())
            : undefined)
        .filter((termCycle): termCycle is NonNullable<typeof termCycle> =>
          Boolean(termCycle));
      const anchorTermAssignment = review.anchorTermAssignmentId
        ? termAssignmentById.get(review.anchorTermAssignmentId.toString())
        : undefined;
      const anchorTermCycle = anchorTermAssignment?.cycleTermId
        ? termCycleById.get(anchorTermAssignment.cycleTermId.toString())
        : undefined;
      const reviewWindow = anchorTermCycle?.managerReviewWindow;
      const finalizationWindow = anchorTermCycle?.termFinalizationWindow;
      const includedStartDates = includedTermCycles
        .map((termCycle) => termCycle.startDate)
        .filter((date): date is Date => Boolean(date));
      const includedEndDates = includedTermCycles
        .map((termCycle) => termCycle.endDate)
        .filter((date): date is Date => Boolean(date));
      const isAnnualReview = review.reviewCode.trim().toUpperCase() === 'ANNUAL';
      const assessmentStartDate = isAnnualReview && cycle?.startDate
        ? cycle.startDate
        : includedStartDates.reduce<Date | undefined>(
          (earliest, date) => !earliest || date < earliest ? date : earliest,
          undefined,
        );
      const assessmentEndDate = isAnnualReview && cycle?.endDate
        ? cycle.endDate
        : includedEndDates.reduce<Date | undefined>(
          (latest, date) => !latest || date > latest ? date : latest,
          undefined,
        );
      const approvedObjectives = review.includedTermAssignmentIds.flatMap((termAssignmentId) =>
        (objectivesByTermId.get(termAssignmentId.toString()) ?? []).map((objective) => ({
          id: objective._id.toString(),
          termAssignmentId: termAssignmentId.toString(),
          assessmentTermCode: objective.assessmentTermCode as AssessmentTermCodeType,
          title: objective.title,
          description: objective.description,
          targetMetric: objective.targetMetric,
          targetValue: objective.targetValue,
          successCriteria: objective.successCriteria,
          weightage: objective.weightage,
        })),
      );
      const annualAchievementSubmission = achievementSubmissionsByAnnualId.get(
        review.annualAssignmentId.toString(),
      );
      const includedAchievementSubmissions = annualAchievementSubmission
        ? [this.mapAchievementSubmissionRecord(annualAchievementSubmission)]
        : [];

      return {
        id: review._id.toString(),
        annualAssignmentId: review.annualAssignmentId.toString(),
        cycleId: review.cycleId.toString(),
        cycleName: String(
          cycle?.name ??
          orgSnapshot.cycleName ??
          orgSnapshot.cycleCode ??
          review.cycleId.toString(),
        ),
        cycleCode: cycle?.code ?? (orgSnapshot.cycleCode as string | undefined),
        employeeId: review.employeeId.toString(),
        employeeName: String(employeeSnapshot.name ?? 'Employee'),
        employeeCode: employeeSnapshot.employeeCode as string | undefined,
        designation: employeeDesignation,
        employeeDesignation,
        specificRole: String(employeeSnapshot.specificRole ?? ''),
        department: employeeDepartment,
        departmentName: String(employeeSnapshot.departmentName ?? employeeDepartment),
        employeeDepartment,
        departmentId: String(employeeSnapshot.departmentId ?? employeeDepartment),
        managerId: review.managerId.toString(),
        managerName: String(managerSnapshot.name ?? 'Manager'),
        isDelegated: Boolean(actorId && actorId !== review.managerId.toString()),
        templateVersionId:
          review.templateVersionId?.toString() ??
          annualAssignment?.templateVersionId?.toString() ??
          '',
        reviewCode: review.reviewCode,
        label: review.label,
        includedTerms: review.includedTerms,
        includedTermAssignmentIds: review.includedTermAssignmentIds.map((id) => id.toString()),
        anchorTerm: review.anchorTerm,
        anchorTermAssignmentId: review.anchorTermAssignmentId?.toString(),
        reviewState: review.reviewState,
        assessmentStartDate: assessmentStartDate?.toISOString(),
        assessmentEndDate: assessmentEndDate?.toISOString(),
        reviewWindow: this.mapWindow(reviewWindow),
        finalizationWindow: this.mapWindow(finalizationWindow),
        approvedObjectives,
        achievementSubmissions: includedAchievementSubmissions,
        review: {
          id: review._id.toString(),
          reviewState: review.reviewState,
          ratings: review.ratings.map((rating) => ({
            objectiveId: rating.objectiveId?.toString(),
            rating: rating.rating,
            comments: rating.comments,
          })),
          comments: review.comments,
          score: review.score,
          overallRating: review.overallRating,
          recommendation: review.recommendation,
          achievements: review.achievements,
          developmentObservations: review.developmentObservations,
          attachments: review.attachments.map((attachment) => ({
            fileName: attachment.fileName,
            fileUrl: attachment.fileUrl,
            documentId: attachment.documentId,
            uploadedAt: attachment.uploadedAt?.toISOString(),
          })),
          reviewValues: review.reviewValues.map((value) => ({
            templateFieldId: value.templateFieldId,
            fieldKey: value.fieldKey,
            sectionKey: value.sectionKey,
            roleCode: value.roleCode,
            actorUserId: value.actorUserId?.toString(),
            workflowStage: value.workflowStage,
            valueJson: value.valueJson,
            valueText: value.valueText,
            valueNumber: value.valueNumber,
            valueDate: value.valueDate,
          })),
          submittedAt: review.submittedAt?.toISOString(),
          finalizedAt: review.finalizedAt?.toISOString(),
        },
      };
    }));
  }

  private mapAchievementSubmissionRecord(
    submission: Record<string, any>,
  ): ManagerReviewPeriodAchievementSubmissionRecord {
    return {
      id: submission._id.toString(),
      annualAssignmentId: submission.annualAssignmentId.toString(),
      termAssignmentId: submission.termAssignmentId.toString(),
      cycleId: submission.cycleId?.toString(),
      employeeId: submission.employeeId.toString(),
      managerId: submission.managerId.toString(),
      templateVersionId: submission.templateVersionId?.toString(),
      assessmentTermCode: submission.assessmentTermCode,
      status: submission.status,
      achievementItems: (submission.achievementItems ?? []).map((item: Record<string, any>) => ({
        itemId: item.itemId,
        type: item.type,
        objectiveId: item.objectiveId?.toString?.(),
        objectiveSnapshot: item.objectiveSnapshot
          ? {
            ...item.objectiveSnapshot,
            targetDate: item.objectiveSnapshot.targetDate
              ? new Date(item.objectiveSnapshot.targetDate).toISOString()
              : undefined,
          }
          : undefined,
        relatedObjectiveId: item.relatedObjectiveId?.toString?.(),
        relatedObjectiveSnapshot: item.relatedObjectiveSnapshot
          ? {
            ...item.relatedObjectiveSnapshot,
            targetDate: item.relatedObjectiveSnapshot.targetDate
              ? new Date(item.relatedObjectiveSnapshot.targetDate).toISOString()
              : undefined,
          }
          : undefined,
        subject: String(item.subject ?? ''),
        description: String(item.description ?? ''),
        employeeSelfRating: item.employeeSelfRating,
        employeeSelfRatingComments: item.employeeSelfRatingComments,
        outcome: item.outcome,
        actualValues: item.actualValues,
        attachments: (item.attachments ?? []).map((attachment: Record<string, any>) => ({
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
          fileType: attachment.fileType,
          fileSize: attachment.fileSize,
          documentId: attachment.documentId,
          uploadedAt: attachment.uploadedAt
            ? new Date(attachment.uploadedAt).toISOString()
            : undefined,
        })),
        itemStatus: item.itemStatus ?? submission.status,
        draftSavedAt: item.draftSavedAt
          ? new Date(item.draftSavedAt).toISOString()
          : undefined,
        submittedBy: item.submittedBy?.toString?.(),
        submittedAt: item.submittedAt
          ? new Date(item.submittedAt).toISOString()
          : undefined,
      })),
      achievementValues: (submission.achievementValues ?? []).map((value: Record<string, any>) => ({
        templateFieldId: value.templateFieldId,
        fieldKey: value.fieldKey,
        sectionKey: value.sectionKey,
        roleCode: value.roleCode,
        actorUserId: value.actorUserId?.toString?.() ?? '',
        workflowStage: value.workflowStage,
        valueJson: value.valueJson,
        valueText: value.valueText,
        valueNumber: value.valueNumber,
        valueDate: value.valueDate ? new Date(value.valueDate).toISOString() : undefined,
        valueStatus: value.valueStatus,
        submittedAt: value.submittedAt ? new Date(value.submittedAt).toISOString() : undefined,
      })),
      draftSavedAt: submission.draftSavedAt
        ? new Date(submission.draftSavedAt).toISOString()
        : undefined,
      submittedBy: submission.submittedBy?.toString?.(),
      submittedAt: submission.submittedAt
        ? new Date(submission.submittedAt).toISOString()
        : undefined,
      lockedAt: submission.lockedAt ? new Date(submission.lockedAt).toISOString() : undefined,
      createdAt: new Date(submission.createdAt).toISOString(),
      updatedAt: new Date(submission.updatedAt).toISOString(),
    };
  }

  private async assertReviewAccess(
    action: string,
    review: IManagerReviewPeriodAssignment,
  ): Promise<void> {
    const actor = this.requireActor();
    const access = await accessService.canPerform({
      actor,
      action,
      resource: {
        employeeId: review.employeeId.toString(),
        managerId: review.managerId.toString(),
      },
    });
    if (access.allowed) {
      return;
    }

    const delegation = await this.getReviewDelegation(
      actor.actorId,
      review.managerId.toString(),
      review.cycleId.toString(),
      review.annualAssignmentId.toString(),
    );

    if (delegation) {
      return;
    }

    throw new Error(access.message ?? 'Access denied');
  }

  private async assertManagerAccess(
    action: string,
    review: IManagerReviewPeriodAssignment,
  ): Promise<void> {
    const actor = this.requireActor();
    const mappedRole = normalizePmsRole(actor.actorRole);
    if (mappedRole === PmsRole.ADMIN) {
      return;
    }
    if (actor.actorId === review.managerId.toString()) {
      return;
    }

    const delegation = await this.getReviewDelegation(
      actor.actorId,
      review.managerId.toString(),
      review.cycleId.toString(),
      review.annualAssignmentId.toString(),
    );

    if (delegation) {
      return;
    }

    await this.assertReviewAccess(action, review);
  }

  private async delegatedReviewPeriodClausesForActor(actorId: string): Promise<Record<string, unknown>[]> {
    const delegations = await new DelegationService(this.context).getActiveDelegationsForDelegate(
      actorId,
      'PMS_REVIEWS',
    );

    return delegations.map((delegation) => {
      if (delegation.annualAssignmentId) {
        return {
          annualAssignmentId: delegation.annualAssignmentId,
          managerId: delegation.delegatorUserId,
        };
      }

      const clause: Record<string, unknown> = {
        managerId: delegation.delegatorUserId,
      };
      if (delegation.cycleId) {
        clause.cycleId = delegation.cycleId;
      }
      return clause;
    });
  }

  private async getReviewDelegation(
    delegateUserId: string,
    delegatorUserId: string,
    cycleId?: string,
    annualAssignmentId?: string,
  ): Promise<any | null> {
    return new DelegationService(this.context).getActiveDelegation(
      delegateUserId,
      delegatorUserId,
      'PMS_REVIEWS',
      cycleId,
      annualAssignmentId,
    );
  }

  private async assertReviewWindow(review: IManagerReviewPeriodAssignment): Promise<void> {
    const window = await this.getReviewWindow(review);
    if (!window?.startDate || !window?.endDate) {
      return;
    }

    const now = this.getCurrentDate();
    const start = new Date(window.startDate);
    const end = new Date(window.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (now < start || now > end) {
      throw new Error('Grouped manager review window is closed for this review period.');
    }
  }

  private async assertIncludedTermsReadyForManagerReview(
    review: IManagerReviewPeriodAssignment,
  ): Promise<void> {
    const ready = await this.isReviewPeriodOpenEligible(review, false);
    if (!ready) {
      throw new Error(
        'Grouped manager review is unavailable until all included terms reach Manager Review Open.',
      );
    }
  }

  private async getReviewWindow(review: IManagerReviewPeriodAssignment) {
    const termCycle = await this.getAnchorTermCycle(review);
    return termCycle?.managerReviewWindow;
  }

  private async getAnchorTermCycle(review: IManagerReviewPeriodAssignment) {
    if (!review.anchorTermAssignmentId) {
      return null;
    }

    const termAssignment = await TermAssignment.findById(review.anchorTermAssignmentId)
      .select('cycleTermId')
      .lean();
    if (!termAssignment?.cycleTermId) {
      return null;
    }

    return TermCycle.findById(termAssignment.cycleTermId)
      .select('managerReviewWindow termFinalizationWindow')
      .lean();
  }

  private normalizeRatings(ratings: RatingInput[]) {
    return ratings
      .filter((rating) => rating.objectiveId && Types.ObjectId.isValid(rating.objectiveId))
      .map((rating) => ({
        objectiveId: new Types.ObjectId(rating.objectiveId),
        rating: rating.rating,
        comments: rating.comments?.trim(),
      }));
  }

  private normalizeAttachments(attachments: AttachmentInput[]) {
    return attachments.map((attachment) => ({
      fileName: attachment.fileName,
      fileUrl: attachment.fileUrl,
      documentId: attachment.documentId,
      uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : undefined,
    }));
  }

  private normalizeReviewValues(values: ReviewValueInput[]) {
    const actorId = this.actorIdObject();
    return values.map((value) => ({
      templateFieldId: value.templateFieldId,
      fieldKey: value.fieldKey,
      sectionKey: value.sectionKey,
      roleCode: value.roleCode,
      actorUserId: value.actorUserId && Types.ObjectId.isValid(value.actorUserId)
        ? new Types.ObjectId(value.actorUserId)
        : actorId,
      workflowStage: value.workflowStage,
      valueJson: value.valueJson,
      valueText: value.valueText,
      valueNumber: value.valueNumber,
      valueDate: value.valueDate ? new Date(value.valueDate) : undefined,
    }));
  }

  private mapWindow(window?: { startDate?: Date; endDate?: Date }) {
    if (!window?.startDate || !window?.endDate) {
      return undefined;
    }

    return {
      startDate: new Date(window.startDate).toISOString(),
      endDate: new Date(window.endDate).toISOString(),
    };
  }

  private async getReviewPeriod(reviewPeriodId: string) {
    if (!Types.ObjectId.isValid(reviewPeriodId)) {
      throw new Error('Invalid manager review period id');
    }

    const review = await ManagerReviewPeriodAssignment.findOne({
      _id: reviewPeriodId,
      isDeleted: false,
    });
    if (!review) {
      throw new Error('Grouped manager review period not found');
    }
    return review;
  }

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
  }

  private toObjectId(value: string, fieldName: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`Invalid ${fieldName}`);
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

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
    reason?: string,
  ): Promise<void> {
    const actor = this.requireActor();
    await auditService.createAuditLog({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action,
      entityType,
      entityId,
      previousValue,
      newValue,
      reason,
    });
  }
}
