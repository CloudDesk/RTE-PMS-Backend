import mongoose, { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualWorkflowState,
  getAssessmentTerms,
  getAssessmentTermLabel,
  getDefaultAssessmentTermType,
  PmsTemplateStatus,
  PmsRole,
  QuarterWorkflowState,
  WorkflowEntityType,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import { PmsTemplate } from '../models/pms-template.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { workflowService } from './workflow.service';
import type { IAnnualCycle, ICommunicationRuleConfig } from '../models/pms-annual-cycle.model';
import type { IQuarterCycle } from '../models/pms-quarter-cycle.model';
import type {
  AnnualWorkflowState as AnnualWorkflowStateType,
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
} from '../constants/pms.enums';

type QuarterCode = AssessmentTermCodeType;
type AppraisalWindowType = 'FIXED_DATE' | 'FIXED_RANGE' | 'RELATIVE_OFFSET';
type AppraisalWindowBase =
  | 'Q4_FINALIZATION'
  | 'ALL_APPLICABLE_QUARTERS_FINALIZED'
  | 'ANNUAL_CYCLE_END';

export interface DateWindowInput {
  startDate?: Date | string;
  endDate?: Date | string;
}

export interface AchievementSubmissionWindowInput extends DateWindowInput {
  enabled?: boolean;
  dueDate?: Date | string;
  graceDays?: number;
  reminderDaysBefore?: number[];
  escalationDaysAfterDue?: number;
}

const ACHIEVEMENT_SUBMISSION_WINDOW_DEFAULTS = {
  enabled: true,
  graceDays: 0,
  reminderDaysBefore: [] as number[],
  escalationDaysAfterDue: 0,
} as const;

export interface QuarterCycleInput {
  quarter?: QuarterCode;
  quarterCode?: QuarterCode;
  assessmentTermType?: AssessmentTermTypeType;
  termCode?: QuarterCode;
  termLabel?: string;
  startDate: Date | string;
  endDate: Date | string;
  objectiveWindow?: DateWindowInput;
  objectiveSettingWindow?: DateWindowInput;
  objectiveApprovalWindow?: DateWindowInput;
  achievementSubmissionWindow?: AchievementSubmissionWindowInput;
  reviewWindow?: DateWindowInput;
  managerReviewWindow?: DateWindowInput;
  quarterFinalizationWindow?: DateWindowInput;
  slaConfig?: Record<string, unknown>;
  closureRules?: Record<string, unknown>;
}

export interface CreateCycleInput {
  name: string;
  code: string;
  appraisalYear?: number;
  year?: number;
  startDate: Date | string;
  endDate: Date | string;
  templateVersionId: string;
  assessmentTermType?: AssessmentTermTypeType;
  quarters?: QuarterCycleInput[];
  appraisalWindowConfig?: Record<string, unknown>;
  communicationRuleConfig?: ICommunicationRuleConfig;
}

interface AppraisalWindowConfigInput {
  type?: AppraisalWindowType;
  mode?: AppraisalWindowType;
  date?: Date | string;
  startDate?: Date | string;
  endDate?: Date | string;
  base?: AppraisalWindowBase;
  offsetDays?: number;
  durationDays?: number;
  fixedWindow?: DateWindowInput;
  relativeOffset?: {
    dependency?: 'Q4_COMPLETION' | AppraisalWindowBase;
    offsetDays?: number;
    durationDays?: number;
  };
}

export interface CreateCycleResult {
  annualCycle: IAnnualCycle;
  quarterCycles: IQuarterCycle[];
}

export interface UpdateCycleInput {
  name?: string;
  code?: string;
  appraisalYear?: number;
  year?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  templateVersionId?: string;
  assessmentTermType?: AssessmentTermTypeType;
  quarters?: QuarterCycleInput[];
  appraisalWindowConfig?: Record<string, unknown>;
  communicationRuleConfig?: ICommunicationRuleConfig;
}

export interface CycleListQuery {
  status?: string;
  appraisalYear?: string | number;
  search?: string;
  page?: string | number;
  limit?: string | number;
}

export interface CycleDetailResult {
  annualCycle: any;
  quarterCycles: IQuarterCycle[];
}

export interface CycleListResult {
  items: any[];
  total: number;
  page: number;
  limit: number;
}

export interface CancelCycleInput {
  reason: string;
}

export class CycleService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async listCycles(query: CycleListQuery = {}): Promise<CycleListResult> {
    await this.assertCycleListAccess();
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 20), 100);
    const filter: Record<string, unknown> = { isDeleted: false };
    const assignedCycleIds = await this.getAssignedCycleIdsForActor();
    if (assignedCycleIds) {
      filter._id = { $in: assignedCycleIds };
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.appraisalYear !== undefined) {
      const appraisalYear = Number(query.appraisalYear);
      if (Number.isNaN(appraisalYear)) {
        throw new Error('appraisalYear must be a number');
      }
      filter.appraisalYear = appraisalYear;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      AnnualCycle.find(filter)
        .sort({ appraisalYear: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AnnualCycle.countDocuments(filter),
    ]);

    const templateVersionIds = items
      .map((item) => item.templateVersionId)
      .filter((id): id is Types.ObjectId => Boolean(id));

    const versions = await PmsTemplateVersion.find({ _id: { $in: templateVersionIds } }).lean();
    const templateIds = versions.map((v) => v.templateId);
    const templates = await PmsTemplate.find({ _id: { $in: templateIds } }).select('name code').lean();

    const templateMap = new Map(templates.map((t) => [t._id.toString(), t]));
    const versionMap = new Map(versions.map((v) => [v._id.toString(), v]));

    const itemsWithTemplateName = items.map((item) => {
      const obj = item.toObject() as any;
      if (item.templateVersionId) {
        const version = versionMap.get(item.templateVersionId.toString());
        if (version) {
          const template = templateMap.get(version.templateId.toString());
          const templateName = template?.name ?? 'PMS Template';
          obj.templateVersionName = `${templateName} v${version.versionNo}`;
        }
      }
      if (!obj.templateVersionName) {
        obj.templateVersionName = '—';
      }
      return obj;
    });

    return { items: itemsWithTemplateName, total, page, limit };
  }

  async getCycleDetail(cycleId: string): Promise<CycleDetailResult> {
    const annualCycle = await this.getCycleForAction(cycleId);
    await this.assertCycleReadAccess(annualCycle);
    const quarterCycles = await QuarterCycle.find({
      cycleId: annualCycle._id,
      isDeleted: false,
    }).sort({ quarterCode: 1 });

    const obj = annualCycle.toObject() as any;
    if (annualCycle.templateVersionId) {
      const version = await PmsTemplateVersion.findById(annualCycle.templateVersionId).lean();
      if (version) {
        const template = await PmsTemplate.findById(version.templateId).select('name code').lean();
        const templateName = template?.name ?? 'PMS Template';
        obj.templateVersionName = `${templateName} v${version.versionNo}`;
      }
    }
    if (!obj.templateVersionName) {
      obj.templateVersionName = '—';
    }

    return { annualCycle: obj, quarterCycles };
  }

  async getCycleAuditHistory(cycleId: string) {
    const annualCycle = await this.getCycleForAction(cycleId);
    await this.assertCycleReadAccess(annualCycle);
    return auditService.getEntityHistory('ANNUAL_CYCLE', annualCycle._id.toString());
  }

  async createCycle(input: CreateCycleInput): Promise<CreateCycleResult> {
    await this.assertAdmin('cycle.create');
    this.validateCycleInput(input);

    const templateVersionId = await this.validateTemplateVersion(
      input.templateVersionId,
      input.startDate,
      input.endDate,
    );
    let code = input.code.trim().toUpperCase();
    let existingCycle = await AnnualCycle.exists({ code });
    if (existingCycle) {
      if (/^PMS-\d{4}-\d{3,}$/.test(code)) {
        // Auto-regenerate for auto-generated codes
        const prefix = code.split('-').slice(0, 2).join('-');
        let newCode = `${prefix}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;
        while (await AnnualCycle.exists({ code: newCode })) {
          newCode = `${prefix}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;
        }
        code = newCode;
      } else {
        throw new Error('Cycle code already exists');
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const [annualCycle] = await AnnualCycle.create(
        [
          {
            name: input.name,
            code,
            appraisalYear: input.appraisalYear ?? input.year,
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
            assessmentTermType: input.assessmentTermType ?? getDefaultAssessmentTermType(),
            status: AnnualWorkflowState.DRAFT,
            templateVersionId,
            appraisalWindowConfig: this.normalizeAppraisalWindowConfig(
              input.appraisalWindowConfig,
            ),
            communicationRuleConfig: input.communicationRuleConfig ?? {},
            createdBy: this.actorIdObject(),
          },
        ],
        { session },
      );

      const quarterPayload = this.buildQuarterPayloads(input, annualCycle._id);
      const quarterCycles = await QuarterCycle.insertMany(quarterPayload, { session });

      annualCycle.quarterCycleIds = quarterCycles.map((qc) => qc._id as Types.ObjectId);
      await annualCycle.save({ session });

      const version = await PmsTemplateVersion.findById(templateVersionId).lean();
      let templateVersionName = '—';
      if (version) {
        const template = await PmsTemplate.findById(version.templateId).select('name code').lean();
        const templateName = template?.name ?? 'PMS Template';
        templateVersionName = `${templateName} v${version.versionNo}`;
      }

      const annualCycleObj = annualCycle.toObject() as any;
      annualCycleObj.templateVersionName = templateVersionName;

      await this.audit(
        'PMS_CYCLE_CREATED',
        'ANNUAL_CYCLE',
        annualCycle._id.toString(),
        undefined,
        {
          annualCycle: annualCycle.toObject(),
          quarterCycleIds: annualCycle.quarterCycleIds,
        },
        undefined,
        session,
      );

      await session.commitTransaction();
      return { annualCycle: annualCycleObj, quarterCycles };
    } catch (error: any) {
      if (session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          // Ignore abort errors if transaction was already aborted by MongoDB
        }
      }
      if (error.code === 11000) {
        throw new Error('A cycle with this cycle code already exists. Please try again with a different code.');
      }
      if (error.message && error.message.includes('does not match any in-progress transactions')) {
        throw new Error('A system error occurred while saving. Please try again.');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async updateCycle(cycleId: string, input: UpdateCycleInput): Promise<CycleDetailResult> {
    await this.assertAdmin('cycle.update');
    const cycle = await this.getCycleForAction(cycleId);
    if (
      cycle.status !== AnnualWorkflowState.DRAFT &&
      cycle.status !== AnnualWorkflowState.SCHEDULED
    ) {
      throw new Error('Only DRAFT or SCHEDULED cycles can be updated');
    }

    const existingQuarters = await QuarterCycle.find({
      cycleId: cycle._id,
      isDeleted: false,
    }).sort({ quarterCode: 1 });
    const mergedInput = await this.buildMergedUpdateInput(cycle, existingQuarters, input);
    this.validateCycleInput(mergedInput);

    const previousValue = {
      annualCycle: cycle.toObject(),
      quarterCycles: existingQuarters.map((quarter) => quarter.toObject()),
    };

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (input.code?.trim()) {
        let code = input.code.trim().toUpperCase();
        let existingCycle = await AnnualCycle.exists({
          code,
          _id: { $ne: cycle._id },
        });
        if (existingCycle) {
          if (/^PMS-\d{4}-\d{3,}$/.test(code)) {
            // Auto-regenerate for auto-generated codes
            const prefix = code.split('-').slice(0, 2).join('-');
            let newCode = `${prefix}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;
            while (await AnnualCycle.exists({ code: newCode, _id: { $ne: cycle._id } })) {
              newCode = `${prefix}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;
            }
            code = newCode;
          } else {
            throw new Error('Cycle code already exists');
          }
        }
        cycle.code = code;
      }

      if (input.startDate !== undefined || input.endDate !== undefined || input.templateVersionId !== undefined) {
        const targetTemplateVersionId = input.templateVersionId ?? cycle.templateVersionId?.toString();
        if (targetTemplateVersionId) {
          const validatedId = await this.validateTemplateVersion(
            targetTemplateVersionId,
            input.startDate ?? cycle.startDate,
            input.endDate ?? cycle.endDate
          );
          if (input.templateVersionId) {
            cycle.templateVersionId = validatedId;
          }
        }
      }

      if (input.name !== undefined) cycle.name = input.name;
      if (input.appraisalYear !== undefined || input.year !== undefined) {
        cycle.appraisalYear = input.appraisalYear ?? input.year!;
      }
      if (input.startDate !== undefined) cycle.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) cycle.endDate = new Date(input.endDate);
      if (input.assessmentTermType !== undefined) {
        cycle.assessmentTermType = input.assessmentTermType;
      }
      if (input.appraisalWindowConfig !== undefined) {
        cycle.appraisalWindowConfig = this.normalizeAppraisalWindowConfig(
          input.appraisalWindowConfig,
        );
      }
      if (input.communicationRuleConfig !== undefined) {
        cycle.communicationRuleConfig = input.communicationRuleConfig;
      }
      cycle.updatedBy = this.actorIdObject();

      let quarterCycles: IQuarterCycle[] = existingQuarters;
      if (input.quarters) {
        const quarterPayloads = this.buildQuarterPayloads(mergedInput, cycle._id);
        const activeQuarterCodes = quarterPayloads.map((payload) => payload.quarterCode);
        const upsertPromises = quarterPayloads.map((payload) =>
          QuarterCycle.findOneAndUpdate(
            { cycleId: cycle._id, quarterCode: payload.quarterCode },
            { $set: { ...payload, updatedBy: this.actorIdObject() } },
            { upsert: true, new: true, session },
          ),
        );
        quarterCycles = (await Promise.all(upsertPromises)) as IQuarterCycle[];
        await QuarterCycle.updateMany(
          {
            cycleId: cycle._id,
            quarterCode: { $nin: activeQuarterCodes },
            isDeleted: false,
          },
          {
            $set: {
              isDeleted: true,
              updatedBy: this.actorIdObject(),
            },
          },
          { session },
        );
        cycle.quarterCycleIds = quarterCycles.map((qc) => qc._id as Types.ObjectId);
      }

      await cycle.save({ session });

      const targetVersionId = input.templateVersionId ?? cycle.templateVersionId?.toString();
      let templateVersionName = '—';
      if (targetVersionId) {
        const version = await PmsTemplateVersion.findById(targetVersionId).lean();
        if (version) {
          const template = await PmsTemplate.findById(version.templateId).select('name code').lean();
          const templateName = template?.name ?? 'PMS Template';
          templateVersionName = `${templateName} v${version.versionNo}`;
        }
      }

      const cycleObj = cycle.toObject() as any;
      cycleObj.templateVersionName = templateVersionName;

      await this.audit(
        'PMS_CYCLE_UPDATED',
        'ANNUAL_CYCLE',
        cycle._id.toString(),
        previousValue,
        {
          annualCycle: cycle.toObject(),
          quarterCycles: quarterCycles.map((qc) => qc.toObject()),
        },
        undefined,
        session,
      );

      await session.commitTransaction();
      return { annualCycle: cycleObj, quarterCycles };
    } catch (error: any) {
      if (session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          // Ignore abort errors if transaction was already aborted by MongoDB
        }
      }
      if (error.code === 11000) {
        throw new Error('A cycle with this cycle code already exists. Please try again with a different code.');
      }
      if (error.message && error.message.includes('does not match any in-progress transactions')) {
        throw new Error('A system error occurred while updating. Please try again.');
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async updateWindows(cycleId: string, quarters: QuarterCycleInput[]): Promise<CycleDetailResult> {
    return this.updateCycle(cycleId, { quarters });
  }

  async updateCommunication(cycleId: string, config: Record<string, unknown>): Promise<IAnnualCycle> {
    await this.assertAdmin('cycle.communication.update');
    const cycle = await this.getCycleForAction(cycleId);
    const previousValue = {
      communicationRuleConfig: cycle.communicationRuleConfig ?? {},
    };

    cycle.communicationRuleConfig = config as ICommunicationRuleConfig;
    cycle.updatedBy = this.actorIdObject();
    await cycle.save();

    await this.audit(
      'PMS_CYCLE_COMMUNICATION_UPDATED',
      'ANNUAL_CYCLE',
      cycle._id.toString(),
      previousValue,
      { communicationRuleConfig: cycle.communicationRuleConfig ?? {} },
    );

    return cycle;
  }

  async updateAppraisalWindow(cycleId: string, config: Record<string, unknown>): Promise<IAnnualCycle> {
    const result = await this.updateCycle(cycleId, { appraisalWindowConfig: config });
    return result.annualCycle;
  }

  async launchCycle(cycleId: string): Promise<IAnnualCycle> {
    await this.assertAdmin('cycle.launch');
    let cycle = await this.getCycleForAction(cycleId);
    await this.assertLaunchReady(cycle);

    if (cycle.status === AnnualWorkflowState.DRAFT) {
      cycle = await this.executeTransition(
        cycle,
        AnnualWorkflowState.SCHEDULED,
        'PMS_CYCLE_SCHEDULED',
        {},
        undefined,
        { returnDocument: true },
      );
    }

    return this.executeTransition(cycle, AnnualWorkflowState.ACTIVE, 'PMS_CYCLE_LAUNCHED', {
      launchedAt: new Date(),
    });
  }

  async scheduleCycle(cycleId: string): Promise<IAnnualCycle> {
    await this.assertAdmin('cycle.schedule');
    const cycle = await this.getCycleForAction(cycleId);
    return this.executeTransition(cycle, AnnualWorkflowState.SCHEDULED, 'PMS_CYCLE_SCHEDULED');
  }

  async closeCycle(cycleId: string, input: { reason: string }): Promise<IAnnualCycle> {
    await this.assertAdmin('cycle.close');
    const cycle = await this.getCycleForAction(cycleId);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Close reason is required');
    }
    return this.executeTransition(cycle, AnnualWorkflowState.CLOSED, 'PMS_CYCLE_CLOSED', {
      closedAt: new Date(),
    }, reason);
  }

  async archiveCycle(cycleId: string, input: { reason: string }): Promise<IAnnualCycle> {
    await this.assertAdmin('cycle.archive');
    const cycle = await this.getCycleForAction(cycleId);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Archive reason is required');
    }
    return this.executeTransition(cycle, AnnualWorkflowState.ARCHIVED, 'PMS_CYCLE_ARCHIVED', {}, reason);
  }

  async cancelCycle(cycleId: string, input: CancelCycleInput): Promise<IAnnualCycle> {
    await this.assertAdmin('cycle.cancel');
    const cycle = await this.getCycleForAction(cycleId);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Cancel reason is required');
    }

    await this.assertCycleCanBeCancelled(cycle);

    return this.executeTransition(
      cycle,
      AnnualWorkflowState.CANCELLED,
      'PMS_CYCLE_CANCELLED',
      {},
      reason,
    );
  }

  async syncCycleProgression(cycleId: string): Promise<IAnnualCycle> {
    await this.assertAdmin('cycle.progression.sync');
    const cycle = await this.getCycleForAction(cycleId);

    if (
      cycle.status !== AnnualWorkflowState.ACTIVE &&
      cycle.status !== AnnualWorkflowState.IN_PROGRESS &&
      cycle.status !== AnnualWorkflowState.ALL_QUARTERS_FINALIZED
    ) {
      throw new Error(
        'Cycle progression can be synced only for ACTIVE, IN_PROGRESS, or ALL_QUARTERS_FINALIZED cycles',
      );
    }

    const completion = await this.getQuarterCompletionForCycle(cycle);
    if (!completion.hasAssignments) {
      throw new Error('Cycle progression cannot be synced without annual assignments');
    }
    if (!completion.allComplete) {
      throw new Error('Applicable quarter assignments are not all finalized or closed');
    }

    let updatedCycle = cycle;
    if (updatedCycle.status === AnnualWorkflowState.ACTIVE) {
      updatedCycle = await this.executeTransition(
        updatedCycle,
        AnnualWorkflowState.IN_PROGRESS,
        'PMS_CYCLE_IN_PROGRESS',
        {},
        undefined,
        { returnDocument: true },
      );
    }

    if (updatedCycle.status === AnnualWorkflowState.IN_PROGRESS) {
      updatedCycle = await this.executeTransition(
        updatedCycle,
        AnnualWorkflowState.ALL_QUARTERS_FINALIZED,
        'PMS_CYCLE_ALL_QUARTERS_FINALIZED',
        { allQuartersFinalizedAt: completion.completedAt },
        undefined,
        { returnDocument: true },
      );
    }

    if (
      updatedCycle.status === AnnualWorkflowState.ALL_QUARTERS_FINALIZED &&
      await this.isAppraisalWindowOpen(updatedCycle, completion.completedAt)
    ) {
      updatedCycle = await this.executeTransition(
        updatedCycle,
        AnnualWorkflowState.APPRAISAL_WINDOW_OPEN,
        'PMS_CYCLE_APPRAISAL_WINDOW_OPEN',
        { appraisalWindowOpenedAt: new Date() },
      );
    }

    return updatedCycle;
  }

  private async executeTransition(
    cycle: IAnnualCycle,
    nextState: AnnualWorkflowStateType,
    auditEvent: string,
    additionalUpdates: Record<string, unknown> = {},
    reason?: string,
    options: { returnDocument?: boolean } = {},
  ): Promise<any> {
    const previousState = cycle.status;
    const transition = this.transitionAnnualCycle(cycle, nextState, reason);

    cycle.status = transition.currentState as AnnualWorkflowStateType;
    Object.assign(cycle, additionalUpdates);
    cycle.updatedBy = this.actorIdObject();
    await cycle.save();

    await this.audit(
      auditEvent,
      'ANNUAL_CYCLE',
      cycle._id.toString(),
      { status: previousState },
      { status: cycle.status },
      reason,
    );

    if (options.returnDocument) {
      return cycle;
    }

    const obj = cycle.toObject() as any;
    if (cycle.templateVersionId) {
      const version = await PmsTemplateVersion.findById(cycle.templateVersionId).lean();
      if (version) {
        const template = await PmsTemplate.findById(version.templateId).select('name code').lean();
        const templateName = template?.name ?? 'PMS Template';
        obj.templateVersionName = `${templateName} v${version.versionNo}`;
      }
    }
    if (!obj.templateVersionName) {
      obj.templateVersionName = '—';
    }

    return obj;
  }

  private buildQuarterPayloads(
    input: CreateCycleInput,
    cycleId: Types.ObjectId,
  ): Array<{
    cycleId: Types.ObjectId;
    quarterCode: QuarterCode;
    assessmentTermType?: AssessmentTermTypeType;
    termCode?: QuarterCode;
    termLabel?: string;
    startDate: Date;
    endDate: Date;
    objectiveSettingWindow?: { startDate?: Date; endDate?: Date };
    objectiveApprovalWindow?: { startDate?: Date; endDate?: Date };
    achievementSubmissionWindow?: {
      enabled?: boolean;
      startDate?: Date;
      endDate?: Date;
      dueDate?: Date;
      graceDays?: number;
      reminderDaysBefore?: number[];
      escalationDaysAfterDue?: number;
    };
    managerReviewWindow?: { startDate?: Date; endDate?: Date };
    quarterFinalizationWindow?: { startDate?: Date; endDate?: Date };
    slaConfig?: Record<string, unknown>;
    closureRules?: Record<string, unknown>;
    status: QuarterWorkflowState;
    isDeleted?: boolean;
    createdBy?: Types.ObjectId;
  }> {
    const assessmentTermType = input.assessmentTermType ?? getDefaultAssessmentTermType();
    const quarters = input.quarters ?? this.createDefaultQuarterDates(
      input.startDate,
      input.endDate,
      assessmentTermType,
    );
    const expectedQuarters = getAssessmentTerms(assessmentTermType);
    const submittedQuarters = new Set(quarters.map((quarter) => this.getQuarterCode(quarter)));

    for (const quarter of expectedQuarters) {
      if (!submittedQuarters.has(quarter)) {
        throw new Error(`Missing ${quarter} configuration`);
      }
    }

    return expectedQuarters.map((quarter) => {
      const quarterInput = quarters.find((item) => this.getQuarterCode(item) === quarter);
      if (!quarterInput) {
        throw new Error(`Missing ${quarter} configuration`);
      }

      return {
        cycleId,
        quarterCode: quarter,
        assessmentTermType: quarterInput.assessmentTermType ?? assessmentTermType,
        termCode: quarterInput.termCode ?? quarter,
        termLabel: quarterInput.termLabel ?? getAssessmentTermLabel(quarterInput.termCode ?? quarter),
        startDate: new Date(quarterInput.startDate),
        endDate: new Date(quarterInput.endDate),
        objectiveSettingWindow: this.normalizeWindow(
          quarterInput.objectiveSettingWindow ?? quarterInput.objectiveWindow,
        ),
        objectiveApprovalWindow: this.normalizeWindow(quarterInput.objectiveApprovalWindow),
        achievementSubmissionWindow: this.normalizeAchievementSubmissionWindow(
          quarterInput.achievementSubmissionWindow,
        ),
        managerReviewWindow: this.normalizeWindow(
          quarterInput.managerReviewWindow ?? quarterInput.reviewWindow,
        ),
        quarterFinalizationWindow: this.normalizeWindow(
          this.getQuarterFinalizationWindowInput(quarterInput),
        ),
        slaConfig: quarterInput.slaConfig ?? {},
        closureRules: quarterInput.closureRules ?? {},
        status: QuarterWorkflowState.NOT_STARTED,
        isDeleted: false,
        createdBy: this.actorIdObject(),
      };
    });
  }

  private createDefaultQuarterDates(
    startDateInput: Date | string,
    endDateInput: Date | string,
    assessmentTermType: AssessmentTermTypeType = getDefaultAssessmentTermType(),
  ): QuarterCycleInput[] {
    const startDate = new Date(startDateInput);
    const endDate = new Date(endDateInput);
    const terms = getAssessmentTerms(assessmentTermType);
    const termLengthMs = Math.floor((endDate.getTime() - startDate.getTime() + 1) / terms.length);

    return terms.map((termCode, index) => {
      const quarterStart = new Date(startDate.getTime() + termLengthMs * index);
      const quarterEnd = index === terms.length - 1
        ? endDate
        : new Date(startDate.getTime() + termLengthMs * (index + 1) - 1);

      return {
        quarterCode: termCode,
        assessmentTermType,
        termCode,
        termLabel: getAssessmentTermLabel(termCode),
        startDate: quarterStart,
        endDate: quarterEnd,
      };
    });
  }

  private async buildMergedUpdateInput(
    cycle: IAnnualCycle,
    existingQuarters: IQuarterCycle[],
    input: UpdateCycleInput,
  ): Promise<CreateCycleInput> {
    const templateVersionId = input.templateVersionId
      ?? cycle.templateVersionId?.toString();
    if (!templateVersionId) {
      throw new Error('Active templateVersionId is required for cycle setup');
    }

    return {
      name: input.name ?? cycle.name,
      code: input.code ?? cycle.code,
      appraisalYear: input.appraisalYear ?? input.year ?? cycle.appraisalYear,
      startDate: input.startDate ?? cycle.startDate,
      endDate: input.endDate ?? cycle.endDate,
      templateVersionId,
      assessmentTermType:
        input.assessmentTermType ?? cycle.assessmentTermType ?? getDefaultAssessmentTermType(),
      quarters: input.quarters ?? this.quarterCyclesToInput(existingQuarters),
      appraisalWindowConfig: input.appraisalWindowConfig ?? cycle.appraisalWindowConfig ?? {},
      communicationRuleConfig:
        input.communicationRuleConfig ?? cycle.communicationRuleConfig ?? {},
    };
  }

  private quarterCyclesToInput(quarterCycles: IQuarterCycle[]): QuarterCycleInput[] {
    return quarterCycles.map((quarterCycle) => ({
      quarterCode: quarterCycle.quarterCode,
      assessmentTermType: quarterCycle.assessmentTermType,
      termCode: quarterCycle.termCode,
      termLabel: quarterCycle.termLabel,
      startDate: quarterCycle.startDate,
      endDate: quarterCycle.endDate,
      objectiveSettingWindow: quarterCycle.objectiveSettingWindow,
      objectiveApprovalWindow: quarterCycle.objectiveApprovalWindow,
      achievementSubmissionWindow: quarterCycle.achievementSubmissionWindow,
      managerReviewWindow: quarterCycle.managerReviewWindow,
      quarterFinalizationWindow: quarterCycle.quarterFinalizationWindow,
      slaConfig: quarterCycle.slaConfig,
      closureRules: quarterCycle.closureRules,
    }));
  }

  private normalizeWindow(
    window?: DateWindowInput,
  ): { startDate?: Date; endDate?: Date } | undefined {
    if (!window) return undefined;

    return {
      startDate: window.startDate ? new Date(window.startDate) : undefined,
      endDate: window.endDate ? new Date(window.endDate) : undefined,
    };
  }

  private normalizeAchievementSubmissionWindow(
    window?: AchievementSubmissionWindowInput,
  ):
    | {
        enabled?: boolean;
        startDate?: Date;
        endDate?: Date;
        dueDate?: Date;
        graceDays?: number;
        reminderDaysBefore?: number[];
        escalationDaysAfterDue?: number;
      }
    | undefined {
    if (!window) return undefined;

    const endDate = window.endDate ? new Date(window.endDate) : undefined;

    return {
      enabled: ACHIEVEMENT_SUBMISSION_WINDOW_DEFAULTS.enabled,
      startDate: window.startDate ? new Date(window.startDate) : undefined,
      endDate,
      dueDate: endDate,
      graceDays: ACHIEVEMENT_SUBMISSION_WINDOW_DEFAULTS.graceDays,
      reminderDaysBefore: [...ACHIEVEMENT_SUBMISSION_WINDOW_DEFAULTS.reminderDaysBefore],
      escalationDaysAfterDue: ACHIEVEMENT_SUBMISSION_WINDOW_DEFAULTS.escalationDaysAfterDue,
    };
  }

  private getQuarterFinalizationWindowInput(
    quarterInput: QuarterCycleInput,
  ): DateWindowInput | undefined {
    const closureRules = quarterInput.closureRules as
      | {
          quarterFinalizationWindow?: DateWindowInput;
          finalizationWindow?: DateWindowInput;
        }
      | undefined;

    return (
      quarterInput.quarterFinalizationWindow ??
      closureRules?.quarterFinalizationWindow ??
      closureRules?.finalizationWindow
    );
  }

  private normalizeAppraisalWindowConfig(
    config: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (!config || Object.keys(config).length === 0) {
      return {};
    }

    const appraisalConfig = config as AppraisalWindowConfigInput;
    const type = appraisalConfig.type ?? appraisalConfig.mode;

    if (type === 'FIXED_DATE' && appraisalConfig.fixedWindow) {
      return {
        type: 'FIXED_RANGE',
        mode: 'FIXED_DATE',
        startDate: appraisalConfig.fixedWindow.startDate,
        endDate: appraisalConfig.fixedWindow.endDate,
      };
    }

    if (type === 'RELATIVE_OFFSET' && appraisalConfig.relativeOffset) {
      const dependency = appraisalConfig.relativeOffset.dependency;
      return {
        type: 'RELATIVE_OFFSET',
        mode: 'RELATIVE_OFFSET',
        base: dependency === 'Q4_COMPLETION' ? 'Q4_FINALIZATION' : dependency,
        offsetDays: Number(appraisalConfig.relativeOffset.offsetDays),
        durationDays: Number(appraisalConfig.relativeOffset.durationDays),
      };
    }

    return {
      ...config,
      type,
    };
  }

  private validateCycleInput(input: CreateCycleInput): void {
    if (!input.name?.trim()) {
      throw new Error('Cycle name is required');
    }

    if (!input.code?.trim()) {
      throw new Error('Cycle code is required');
    }

    const appraisalYear = input.appraisalYear ?? input.year;
    if (!appraisalYear) {
      throw new Error('appraisalYear is required');
    }

    if (!input.templateVersionId) {
      throw new Error('Active templateVersionId is required for cycle setup');
    }

    const cycleStart = new Date(input.startDate);
    const cycleEnd = new Date(input.endDate);
    this.assertValidDateRange(cycleStart, cycleEnd, 'Annual cycle');

    const assessmentTermType = input.assessmentTermType ?? getDefaultAssessmentTermType();
    const quarters = input.quarters ?? this.createDefaultQuarterDates(
      input.startDate,
      input.endDate,
      assessmentTermType,
    );
    this.validateQuarterWindows(quarters, cycleStart, cycleEnd, assessmentTermType);
    const appraisalWindowConfig = this.normalizeAppraisalWindowConfig(
      input.appraisalWindowConfig,
    );
    this.validateAppraisalWindowConfig(
      appraisalWindowConfig,
      cycleStart,
      cycleEnd,
    );
    this.validateAppraisalWindowAfterQuarterFinalization(quarters, appraisalWindowConfig);
  }

  private validateAppraisalWindowAfterQuarterFinalization(
    quarters: QuarterCycleInput[],
    config: Record<string, unknown>,
  ): void {
    if (!config || Object.keys(config).length === 0) {
      return;
    }

    const appraisalConfig = config as AppraisalWindowConfigInput;
    if (appraisalConfig.type === 'RELATIVE_OFFSET') {
      return;
    }

    const appraisalStartInput = appraisalConfig.startDate ?? appraisalConfig.date;
    if (!appraisalStartInput) {
      return;
    }

    const finalizationEnds = quarters
      .map((quarter) => this.getQuarterFinalizationWindowInput(quarter)?.endDate)
      .filter((endDate): endDate is Date | string => Boolean(endDate))
      .map((endDate) => new Date(endDate));

    if (!finalizationEnds.length) {
      return;
    }

    const latestFinalizationEnd = finalizationEnds.reduce((latest, current) =>
      current > latest ? current : latest,
    );
    const appraisalStart = new Date(appraisalStartInput);

    if (appraisalStart <= latestFinalizationEnd) {
      throw new Error(
        'Annual appraisal window must open after applicable quarter finalization windows',
      );
    }
  }

  private validateAppraisalWindowConfig(
    config: Record<string, unknown> | undefined,
    cycleStart: Date,
    cycleEnd: Date,
  ): void {
    if (!config || Object.keys(config).length === 0) {
      return;
    }

    const appraisalWindowConfig = config as AppraisalWindowConfigInput;
    const allowedTypes: AppraisalWindowType[] = ['FIXED_DATE', 'FIXED_RANGE', 'RELATIVE_OFFSET'];
    if (!appraisalWindowConfig.type || !allowedTypes.includes(appraisalWindowConfig.type)) {
      throw new Error(
        `appraisalWindowConfig.type must be one of: ${allowedTypes.join(', ')}`,
      );
    }

    if (appraisalWindowConfig.type === 'FIXED_DATE') {
      if (!appraisalWindowConfig.date) {
        throw new Error('appraisalWindowConfig.date is required for FIXED_DATE');
      }

      const date = new Date(appraisalWindowConfig.date);
      this.assertValidDate(date, 'Appraisal fixed date');
      if (date < cycleStart || date > cycleEnd) {
        throw new Error('Appraisal fixed date must be within annual cycle timeline');
      }
      return;
    }

    if (appraisalWindowConfig.type === 'FIXED_RANGE') {
      const startDate = appraisalWindowConfig.startDate
        ? new Date(appraisalWindowConfig.startDate)
        : undefined;
      const endDate = appraisalWindowConfig.endDate
        ? new Date(appraisalWindowConfig.endDate)
        : undefined;

      if (!startDate || !endDate) {
        throw new Error(
          'appraisalWindowConfig.startDate and endDate are required for FIXED_RANGE',
        );
      }

      this.assertValidDateRange(startDate, endDate, 'Appraisal fixed range');
      if (startDate < cycleStart || endDate > cycleEnd) {
        throw new Error('Appraisal fixed range must be within annual cycle timeline');
      }
      return;
    }

    const allowedBases: AppraisalWindowBase[] = [
      'Q4_FINALIZATION',
      'ALL_APPLICABLE_QUARTERS_FINALIZED',
      'ANNUAL_CYCLE_END',
    ];
    if (!appraisalWindowConfig.base || !allowedBases.includes(appraisalWindowConfig.base)) {
      throw new Error(
        `appraisalWindowConfig.base must be one of: ${allowedBases.join(', ')}`,
      );
    }

    const offsetDays = appraisalWindowConfig.offsetDays;
    if (offsetDays === undefined || !Number.isInteger(offsetDays) || offsetDays < 0) {
      throw new Error('appraisalWindowConfig.offsetDays must be a non-negative integer');
    }

    if (
      appraisalWindowConfig.durationDays !== undefined &&
      (!Number.isInteger(appraisalWindowConfig.durationDays) ||
        appraisalWindowConfig.durationDays <= 0)
    ) {
      throw new Error('appraisalWindowConfig.durationDays must be a positive integer');
    }
  }

  private validateQuarterWindows(
    quarters: QuarterCycleInput[],
    cycleStart: Date,
    cycleEnd: Date,
    assessmentTermType: AssessmentTermTypeType = getDefaultAssessmentTermType(),
  ): void {
    const expectedQuarters = getAssessmentTerms(assessmentTermType);
    const seen = new Set<QuarterCode>();
    const normalized = quarters.map((quarter) => {
      const quarterCode = this.getQuarterCode(quarter);
      if (!quarterCode) {
        throw new Error('Quarter code is required');
      }

      if (seen.has(quarterCode)) {
        throw new Error(`Duplicate ${quarterCode} configuration`);
      }
      seen.add(quarterCode);

      const startDate = new Date(quarter.startDate);
      const endDate = new Date(quarter.endDate);
      this.assertValidDateRange(startDate, endDate, `${quarterCode} cycle`);

      if (startDate < cycleStart || endDate > cycleEnd) {
        throw new Error(`${quarterCode} dates must be within annual cycle dates`);
      }

      this.validateWindowWithinQuarter(
        quarter.objectiveSettingWindow ?? quarter.objectiveWindow,
        startDate,
        endDate,
        `${quarterCode} objective setting window`,
      );
      this.validateWindowWithinQuarter(
        quarter.objectiveApprovalWindow,
        startDate,
        endDate,
        `${quarterCode} objective approval window`,
      );
      this.validateAchievementSubmissionWindow(
        quarter.achievementSubmissionWindow,
        startDate,
        endDate,
        `${quarterCode} employee achievement submission window`,
      );
      this.validateWindowWithinQuarter(
        quarter.managerReviewWindow ?? quarter.reviewWindow,
        startDate,
        endDate,
        `${quarterCode} manager review window`,
      );
      this.validateWindowWithinQuarter(
        this.getQuarterFinalizationWindowInput(quarter),
        startDate,
        endDate,
        `${quarterCode} quarter finalization window`,
      );
      this.validateQuarterWindowSequence(quarter, quarterCode);

      return { quarterCode, startDate, endDate };
    });

    for (const quarterCode of expectedQuarters) {
      if (!seen.has(quarterCode)) {
        throw new Error(`Missing ${quarterCode} configuration`);
      }
    }

    const sorted = normalized.sort(
      (left, right) =>
        expectedQuarters.indexOf(left.quarterCode) - expectedQuarters.indexOf(right.quarterCode),
    );

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (current.startDate <= previous.endDate) {
        throw new Error(`${current.quarterCode} dates must not overlap previous quarter`);
      }
    }
  }

  private validateWindowWithinQuarter(
    window: DateWindowInput | undefined,
    quarterStart: Date,
    quarterEnd: Date,
    label: string,
  ): void {
    if (!window) return;

    const startDate = window.startDate ? new Date(window.startDate) : undefined;
    const endDate = window.endDate ? new Date(window.endDate) : undefined;
    if (!startDate || !endDate) {
      throw new Error(`${label} must include startDate and endDate`);
    }

    this.assertValidDateRange(startDate, endDate, label);
    if (startDate < quarterStart || endDate > quarterEnd) {
      throw new Error(`${label} must be within quarter dates`);
    }
  }

  private validateAchievementSubmissionWindow(
    window: AchievementSubmissionWindowInput | undefined,
    quarterStart: Date,
    quarterEnd: Date,
    label: string,
  ): void {
    if (!window) return;

    const hasStart = Boolean(window.startDate);
    const hasEnd = Boolean(window.endDate);
    if (hasStart || hasEnd) {
      if (!hasStart || !hasEnd) {
        throw new Error(`${label} must include both startDate and endDate when dates are provided`);
      }

      const startDate = new Date(window.startDate as Date | string);
      const endDate = new Date(window.endDate as Date | string);
      this.assertValidDateRange(startDate, endDate, label);
      if (startDate < quarterStart || endDate > quarterEnd) {
        throw new Error(`${label} must be within quarter dates`);
      }
    }
  }

  private validateQuarterWindowSequence(
    quarter: QuarterCycleInput,
    quarterCode: QuarterCode,
  ): void {
    const sequence = [
      {
        label: 'objective setting window',
        window: quarter.objectiveSettingWindow ?? quarter.objectiveWindow,
      },
      {
        label: 'objective approval window',
        window: quarter.objectiveApprovalWindow,
      },
      {
        label: 'employee achievement submission window',
        window:
          quarter.achievementSubmissionWindow?.startDate &&
          quarter.achievementSubmissionWindow?.endDate
            ? quarter.achievementSubmissionWindow
            : undefined,
      },
      {
        label: 'manager review window',
        window: quarter.managerReviewWindow ?? quarter.reviewWindow,
      },
      {
        label: 'quarter finalization window',
        window: this.getQuarterFinalizationWindowInput(quarter),
      },
    ]
      .filter((item) => item.window)
      .map((item) => ({
        label: item.label,
        startDate: new Date(item.window!.startDate as Date | string),
        endDate: new Date(item.window!.endDate as Date | string),
      }));

    for (let index = 1; index < sequence.length; index += 1) {
      const previous = sequence[index - 1];
      const current = sequence[index];

      if (current.startDate <= previous.endDate) {
        throw new Error(
          `${quarterCode} ${current.label} must start after ${previous.label} ends`,
        );
      }
    }
  }

  private assertValidDateRange(startDate: Date, endDate: Date, label: string): void {
    this.assertValidDate(startDate, `${label} startDate`);
    this.assertValidDate(endDate, `${label} endDate`);

    if (startDate > endDate) {
      throw new Error(`${label} startDate must be before or equal to endDate`);
    }
  }

  private assertValidDate(date: Date, label: string): void {
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${label} has invalid date`);
    }
  }

  private getQuarterCode(quarter: QuarterCycleInput): QuarterCode {
    return (quarter.quarterCode ?? quarter.quarter) as QuarterCode;
  }

  private normalizePositiveInteger(value: string | number | undefined, fallback: number): number {
    const normalized = Number(value ?? fallback);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
  }

  private async validateTemplateVersion(
    templateVersionId: string,
    cycleStartDate?: Date | string,
    cycleEndDate?: Date | string,
  ): Promise<Types.ObjectId> {
    if (!Types.ObjectId.isValid(templateVersionId)) {
      throw new Error('Invalid templateVersionId');
    }

    const templateVersion = await PmsTemplateVersion.findById(templateVersionId);
    if (!templateVersion) {
      throw new Error('Template version not found');
    }

    if (templateVersion.status !== PmsTemplateStatus.ACTIVE) {
      throw new Error('Only active template versions can be selected for cycle setup');
    }

    const parentTemplate = await PmsTemplate.findById(templateVersion.templateId).lean();
    const effectiveFromDate = templateVersion.effectiveFrom ?? parentTemplate?.effectiveDate;

    if (cycleStartDate && effectiveFromDate) {
      const cycleStart = new Date(cycleStartDate);
      const effectiveFrom = new Date(effectiveFromDate);
      if (cycleStart < effectiveFrom) {
        throw new Error(
          `Cycle start date (${cycleStart.toDateString()}) cannot be before the template's effective date (${effectiveFrom.toDateString()})`,
        );
      }
    }

    if (cycleEndDate && templateVersion.effectiveTo) {
      const cycleEnd = new Date(cycleEndDate);
      const effectiveTo = new Date(templateVersion.effectiveTo);
      if (cycleEnd > effectiveTo) {
        throw new Error(
          `Cycle end date (${cycleEnd.toDateString()}) cannot be after the template's effective expiration date (${effectiveTo.toDateString()})`,
        );
      }
    }

    return templateVersion._id;
  }

  private async getCycleForAction(cycleId: string): Promise<IAnnualCycle> {
    if (!Types.ObjectId.isValid(cycleId)) {
      throw new Error('Invalid cycleId');
    }

    const cycle = await AnnualCycle.findById(cycleId);
    if (!cycle) {
      throw new Error('Annual cycle not found');
    }

    if (cycle.isDeleted) {
      throw new Error('Annual cycle is deleted');
    }

    return cycle;
  }

  private transitionAnnualCycle(
    cycle: IAnnualCycle,
    nextState: AnnualWorkflowStateType,
    reason?: string,
  ) {
    const actor = this.requireActor();
    return workflowService.transition({
      entityType: WorkflowEntityType.ANNUAL_CYCLE,
      entityId: cycle._id.toString(),
      currentState: cycle.status,
      nextState,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      reason,
    });
  }

  private async assertLaunchReady(cycle: IAnnualCycle): Promise<void> {
    const expectedQuarters = getAssessmentTerms(
      cycle.assessmentTermType ?? getDefaultAssessmentTermType(),
    );
    const quarterCycles = await QuarterCycle.find({
      cycleId: cycle._id,
      isDeleted: false,
    }).select('quarterCode');
    const configuredQuarters = new Set(
      quarterCycles.map((quarterCycle) => quarterCycle.quarterCode),
    );

    for (const quarter of expectedQuarters) {
      if (!configuredQuarters.has(quarter)) {
        throw new Error(`Cycle cannot be launched because ${quarter} cycle setup is missing`);
      }
    }

    const annualAssignments = await AnnualAssignment.find({
      cycleId: cycle._id,
      isDeleted: false,
    }).select('applicableQuarters quarterAssignmentIds employeeId');
    if (annualAssignments.length === 0) {
      throw new Error('Cycle cannot be launched without annual assignments');
    }

    const annualAssignmentIds = annualAssignments.map((assignment) => assignment._id);
    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId: { $in: annualAssignmentIds },
      isDeleted: false,
    }).select('annualAssignmentId quarterCode');

    const quarterAssignmentsByAnnualAssignment = new Map<string, Set<QuarterCode>>();
    for (const quarterAssignment of quarterAssignments) {
      const key = quarterAssignment.annualAssignmentId.toString();
      const quarters = quarterAssignmentsByAnnualAssignment.get(key) ?? new Set<QuarterCode>();
      quarters.add(quarterAssignment.quarterCode);
      quarterAssignmentsByAnnualAssignment.set(key, quarters);
    }

    for (const assignment of annualAssignments) {
      if (!assignment.applicableQuarters.length) {
        throw new Error(
          `Cycle cannot be launched because assignment ${assignment._id.toString()} has no applicable quarters`,
        );
      }

      const linkedQuarters = quarterAssignmentsByAnnualAssignment.get(assignment._id.toString())
        ?? new Set<QuarterCode>();
      for (const applicableQuarter of assignment.applicableQuarters) {
        if (!linkedQuarters.has(applicableQuarter)) {
          throw new Error(
            `Cycle cannot be launched because assignment ${assignment._id.toString()} is missing ${applicableQuarter} quarter assignment`,
          );
        }
      }
    }
  }

  private async assertCycleCanBeCancelled(cycle: IAnnualCycle): Promise<void> {
    if (
      cycle.status !== AnnualWorkflowState.ACTIVE &&
      cycle.status !== AnnualWorkflowState.IN_PROGRESS
    ) {
      return;
    }

    const activeAssignments = await AnnualAssignment.countDocuments({
      cycleId: cycle._id,
      isDeleted: false,
      annualState: {
        $nin: [
          AnnualWorkflowState.DRAFT,
          AnnualWorkflowState.CANCELLED,
          AnnualWorkflowState.CLOSED,
          AnnualWorkflowState.ARCHIVED,
        ],
      },
    });

    if (activeAssignments > 0) {
      throw new Error(
        'Cycle has active assignments. Close or archive affected assignments before cancelling the cycle.',
      );
    }
  }

  private async getQuarterCompletionForCycle(cycle: IAnnualCycle): Promise<{
    hasAssignments: boolean;
    allComplete: boolean;
    completedAt: Date;
  }> {
    const annualAssignments = await AnnualAssignment.find({
      cycleId: cycle._id,
      isDeleted: false,
    }).select('applicableQuarters');
    if (annualAssignments.length === 0) {
      return { hasAssignments: false, allComplete: false, completedAt: new Date() };
    }

    const annualAssignmentIds = annualAssignments.map((assignment) => assignment._id);
    const quarterAssignments = await QuarterAssignment.find({
      annualAssignmentId: { $in: annualAssignmentIds },
      isDeleted: false,
    }).select('annualAssignmentId quarterCode quarterState lastTransitionAt updatedAt');
    const quarterByAssignment = new Map<string, Map<QuarterCode, typeof quarterAssignments[number]>>();

    for (const quarterAssignment of quarterAssignments) {
      const key = quarterAssignment.annualAssignmentId.toString();
      const quarters = quarterByAssignment.get(key) ?? new Map<QuarterCode, typeof quarterAssignment>();
      quarters.set(quarterAssignment.quarterCode, quarterAssignment);
      quarterByAssignment.set(key, quarters);
    }

    const completedStates = new Set<QuarterWorkflowState>([
      QuarterWorkflowState.QUARTER_FINALIZED,
      QuarterWorkflowState.CLOSED_BY_ADMIN,
    ]);
    let completedAt = cycle.updatedAt ?? new Date();

    for (const assignment of annualAssignments) {
      const quarters = quarterByAssignment.get(assignment._id.toString());
      if (!quarters) {
        return { hasAssignments: true, allComplete: false, completedAt };
      }

      for (const applicableQuarter of assignment.applicableQuarters) {
        const quarter = quarters.get(applicableQuarter);
        if (!quarter || !completedStates.has(quarter.quarterState as QuarterWorkflowState)) {
          return { hasAssignments: true, allComplete: false, completedAt };
        }

        const transitionDate = quarter.lastTransitionAt ?? quarter.updatedAt;
        if (transitionDate && transitionDate > completedAt) {
          completedAt = transitionDate;
        }
      }
    }

    return { hasAssignments: true, allComplete: true, completedAt };
  }

  private async isAppraisalWindowOpen(cycle: IAnnualCycle, allQuartersCompletedAt: Date): Promise<boolean> {
    const config = this.normalizeAppraisalWindowConfig(cycle.appraisalWindowConfig);
    if (!config || Object.keys(config).length === 0) {
      return false;
    }

    const now = this.getCurrentDate();
    const appraisalConfig = config as AppraisalWindowConfigInput;
    if (appraisalConfig.type === 'FIXED_DATE' || appraisalConfig.type === 'FIXED_RANGE') {
      const startDateInput = appraisalConfig.startDate ?? appraisalConfig.date;
      return Boolean(startDateInput && now >= new Date(startDateInput));
    }

    if (appraisalConfig.type !== 'RELATIVE_OFFSET') {
      return false;
    }

    const baseDate = await this.resolveRelativeAppraisalBaseDate(
      cycle,
      appraisalConfig,
      allQuartersCompletedAt,
    );
    const offsetDays = appraisalConfig.offsetDays ?? 0;
    const openDate = new Date(baseDate);
    openDate.setDate(openDate.getDate() + offsetDays);
    return now >= openDate;
  }

  private async resolveRelativeAppraisalBaseDate(
    cycle: IAnnualCycle,
    config: AppraisalWindowConfigInput,
    allQuartersCompletedAt: Date,
  ): Promise<Date | string> {
    if (config.base === 'ANNUAL_CYCLE_END') {
      return cycle.endDate;
    }

    if (config.base === 'Q4_FINALIZATION') {
      return await this.getQ4FinalizationWindowEndDate(cycle._id) ?? allQuartersCompletedAt;
    }

    return allQuartersCompletedAt;
  }

  private async getQ4FinalizationWindowEndDate(
    cycleId: Types.ObjectId,
  ): Promise<Date | string | null> {
    const quarterCycle = await QuarterCycle.findOne({
      cycleId,
      quarterCode: 'Q4',
      isDeleted: false,
    })
      .select('quarterFinalizationWindow closureRules')
      .lean();

    if (!quarterCycle) {
      return null;
    }

    const closureRules = quarterCycle.closureRules as Record<string, unknown> | undefined;

    return (
      this.getWindowEndDate(quarterCycle.quarterFinalizationWindow) ??
      this.getWindowEndDate(closureRules?.quarterFinalizationWindow) ??
      this.getWindowEndDate(closureRules?.finalizationWindow) ??
      null
    );
  }

  private getWindowEndDate(window: unknown): Date | string | undefined {
    if (!window || typeof window !== 'object') {
      return undefined;
    }

    return (window as { endDate?: Date | string }).endDate;
  }

  private getCurrentDate(): Date {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
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

  private async assertCycleListAccess(): Promise<void> {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const mappedRole = accessService.mapRole(user.role);
    const allowedRoles: string[] = [
      PmsRole.ADMIN,
      PmsRole.DIRECTOR,
      PmsRole.MANAGEMENT,
      PmsRole.EMPLOYEE,
      PmsRole.MANAGER,
    ];

    if (!allowedRoles.includes(mappedRole as PmsRole)) {
      throw new Error(`Role ${user.role} is not mapped for PMS cycle access.`);
    }
  }

  private async assertCycleReadAccess(cycle: IAnnualCycle): Promise<void> {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const mappedRole = accessService.mapRole(user.role);
    if (
      mappedRole === PmsRole.ADMIN ||
      mappedRole === PmsRole.DIRECTOR ||
      mappedRole === PmsRole.MANAGEMENT
    ) {
      return;
    }

    const assignedCycleIds = await this.getAssignedCycleIdsForActor();
    const isAssigned = assignedCycleIds?.some((cycleId) => cycleId.equals(cycle._id)) ?? false;
    if (!isAssigned) {
      throw new Error('Users can access only assigned PMS cycle data.');
    }
  }

  private async getAssignedCycleIdsForActor(): Promise<Types.ObjectId[] | undefined> {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const mappedRole = accessService.mapRole(user.role);
    if (
      mappedRole === PmsRole.ADMIN ||
      mappedRole === PmsRole.DIRECTOR ||
      mappedRole === PmsRole.MANAGEMENT
    ) {
      return undefined;
    }

    const actorId = this.actorIdObject();
    if (!actorId) {
      throw new Error('Invalid authenticated user id');
    }

    const assignmentFilter: Record<string, unknown> = { isDeleted: false };
    if (mappedRole === PmsRole.EMPLOYEE) {
      assignmentFilter.employeeId = actorId;
    } else if (mappedRole === PmsRole.MANAGER) {
      assignmentFilter.assignedManagerId = actorId;
    } else {
      throw new Error(`Role ${user.role} is not mapped for PMS cycle access.`);
    }

    const assignments = await AnnualAssignment.find(assignmentFilter).select('cycleId');
    return assignments.map((assignment) => assignment.cycleId);
  }

  private async assertAdmin(action: string): Promise<void> {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const access = await accessService.canPerform({
      actor: {
        actorId: user._id.toString(),
        actorRole: user.role,
      },
      action,
      requiresAdmin: true,
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
    reason?: string,
    session?: mongoose.ClientSession,
  ): Promise<void> {
    const user = this.context.user;
    if (!user) return;

    await auditService.createAuditLog(
      {
        actorId: user._id.toString(),
        actorRole: user.role,
        action,
        entityType,
        entityId,
        previousValue,
        newValue,
        reason,
      },
      session,
    );
  }
}
