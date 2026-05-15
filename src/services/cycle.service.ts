import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { AnnualWorkflowState, PmsTemplateStatus, QuarterWorkflowState } from '../constants/pms.enums';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { QuarterCycle } from '../models/pms-quarter-cycle.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import type { IAnnualCycle } from '../models/pms-annual-cycle.model';
import type { IQuarterCycle } from '../models/pms-quarter-cycle.model';

type QuarterCode = 'Q1' | 'Q2' | 'Q3' | 'Q4';

interface DateWindowInput {
  startDate?: Date | string;
  endDate?: Date | string;
}

interface QuarterCycleInput {
  quarter?: QuarterCode;
  quarterCode?: QuarterCode;
  startDate: Date | string;
  endDate: Date | string;
  objectiveWindow?: DateWindowInput;
  objectiveSettingWindow?: DateWindowInput;
  objectiveApprovalWindow?: DateWindowInput;
  reviewWindow?: DateWindowInput;
  managerReviewWindow?: DateWindowInput;
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
  quarters?: QuarterCycleInput[];
  appraisalWindowConfig?: Record<string, unknown>;
  communicationRuleConfig?: Record<string, unknown>;
}

export interface CreateCycleResult {
  annualCycle: IAnnualCycle;
  quarterCycles: IQuarterCycle[];
}

export class CycleService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async createCycle(input: CreateCycleInput): Promise<CreateCycleResult> {
    this.assertAdmin('cycle.create');
    this.validateCycleInput(input);

    const templateVersionId = await this.validateTemplateVersion(input.templateVersionId);
    const code = input.code.trim().toUpperCase();
    const existingCycle = await AnnualCycle.exists({ code });
    if (existingCycle) {
      throw new Error('Cycle code already exists');
    }

    const annualCycle = await AnnualCycle.create({
      name: input.name,
      code,
      appraisalYear: input.appraisalYear ?? input.year,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      status: AnnualWorkflowState.DRAFT,
      templateVersionId,
      appraisalWindowConfig: input.appraisalWindowConfig ?? {},
      communicationRuleConfig: input.communicationRuleConfig ?? {},
      createdBy: this.actorIdObject(),
    });

    const quarterPayload = this.buildQuarterPayloads(input, annualCycle._id);
    const quarterCycles = await QuarterCycle.insertMany(quarterPayload);

    annualCycle.quarterCycleIds = quarterCycles.map((quarterCycle) => quarterCycle._id);
    await annualCycle.save();

    await this.audit(
      'PMS_CYCLE_CREATED',
      'ANNUAL_CYCLE',
      annualCycle._id.toString(),
      undefined,
      {
        annualCycle,
        quarterCycleIds: annualCycle.quarterCycleIds,
      },
    );

    return { annualCycle, quarterCycles };
  }

  async launchCycle(cycleId: string): Promise<IAnnualCycle> {
    this.assertAdmin('cycle.launch');
    const cycle = await this.getCycleForAction(cycleId);
    if (
      cycle.status !== AnnualWorkflowState.DRAFT &&
      cycle.status !== AnnualWorkflowState.SCHEDULED
    ) {
      throw new Error('Only DRAFT or SCHEDULED cycles can be launched');
    }

    const previousStatus = cycle.status;
    cycle.status = AnnualWorkflowState.ACTIVE;
    cycle.launchedAt = new Date();
    cycle.updatedBy = this.actorIdObject();
    await cycle.save();

    await this.audit('PMS_CYCLE_LAUNCHED', 'ANNUAL_CYCLE', cycle._id.toString(), { status: previousStatus }, { status: cycle.status });
    return cycle;
  }

  async closeCycle(cycleId: string): Promise<IAnnualCycle> {
    this.assertAdmin('cycle.close');
    const cycle = await this.getCycleForAction(cycleId);
    if (
      cycle.status === AnnualWorkflowState.ARCHIVED ||
      cycle.status === AnnualWorkflowState.CANCELLED
    ) {
      throw new Error('Archived or cancelled cycles cannot be closed');
    }

    const previousStatus = cycle.status;
    cycle.status = AnnualWorkflowState.CLOSED;
    cycle.closedAt = new Date();
    cycle.updatedBy = this.actorIdObject();
    await cycle.save();

    await this.audit('PMS_CYCLE_CLOSED', 'ANNUAL_CYCLE', cycle._id.toString(), { status: previousStatus }, { status: cycle.status });
    return cycle;
  }

  async archiveCycle(cycleId: string): Promise<IAnnualCycle> {
    this.assertAdmin('cycle.archive');
    const cycle = await this.getCycleForAction(cycleId);
    if (cycle.status !== AnnualWorkflowState.CLOSED) {
      throw new Error('Only CLOSED cycles can be archived');
    }

    const previousStatus = cycle.status;
    cycle.status = AnnualWorkflowState.ARCHIVED;
    cycle.updatedBy = this.actorIdObject();
    await cycle.save();

    await this.audit('PMS_CYCLE_ARCHIVED', 'ANNUAL_CYCLE', cycle._id.toString(), { status: previousStatus }, { status: cycle.status });
    return cycle;
  }

  async cancelCycle(cycleId: string): Promise<IAnnualCycle> {
    this.assertAdmin('cycle.cancel');
    const cycle = await this.getCycleForAction(cycleId);
    if (
      cycle.status === AnnualWorkflowState.CLOSED ||
      cycle.status === AnnualWorkflowState.ARCHIVED
    ) {
      throw new Error('Closed or archived cycles cannot be cancelled');
    }

    const previousStatus = cycle.status;
    cycle.status = AnnualWorkflowState.CANCELLED;
    cycle.updatedBy = this.actorIdObject();
    await cycle.save();

    await this.audit('PMS_CYCLE_CANCELLED', 'ANNUAL_CYCLE', cycle._id.toString(), { status: previousStatus }, { status: cycle.status });
    return cycle;
  }

  private buildQuarterPayloads(
    input: CreateCycleInput,
    cycleId: Types.ObjectId,
  ): Array<{
    cycleId: Types.ObjectId;
    quarterCode: QuarterCode;
    startDate: Date;
    endDate: Date;
    objectiveSettingWindow?: { startDate?: Date; endDate?: Date };
    objectiveApprovalWindow?: { startDate?: Date; endDate?: Date };
    managerReviewWindow?: { startDate?: Date; endDate?: Date };
    slaConfig?: Record<string, unknown>;
    closureRules?: Record<string, unknown>;
    status: QuarterWorkflowState;
    createdBy?: Types.ObjectId;
  }> {
    const quarters = input.quarters ?? this.createDefaultQuarterDates(input.startDate, input.endDate);
    const expectedQuarters: QuarterCode[] = ['Q1', 'Q2', 'Q3', 'Q4'];
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
        startDate: new Date(quarterInput.startDate),
        endDate: new Date(quarterInput.endDate),
        objectiveSettingWindow: this.normalizeWindow(
          quarterInput.objectiveSettingWindow ?? quarterInput.objectiveWindow,
        ),
        objectiveApprovalWindow: this.normalizeWindow(quarterInput.objectiveApprovalWindow),
        managerReviewWindow: this.normalizeWindow(
          quarterInput.managerReviewWindow ?? quarterInput.reviewWindow,
        ),
        slaConfig: quarterInput.slaConfig ?? {},
        closureRules: quarterInput.closureRules ?? {},
        status: QuarterWorkflowState.NOT_STARTED,
        createdBy: this.actorIdObject(),
      };
    });
  }

  private createDefaultQuarterDates(
    startDateInput: Date | string,
    endDateInput: Date | string,
  ): QuarterCycleInput[] {
    const startDate = new Date(startDateInput);
    const endDate = new Date(endDateInput);
    const quarterLengthMs = Math.floor((endDate.getTime() - startDate.getTime() + 1) / 4);
    const quarters: QuarterCode[] = ['Q1', 'Q2', 'Q3', 'Q4'];

    return quarters.map((quarter, index) => {
      const quarterStart = new Date(startDate.getTime() + quarterLengthMs * index);
      const quarterEnd = index === 3
        ? endDate
        : new Date(startDate.getTime() + quarterLengthMs * (index + 1) - 1);

      return {
        quarterCode: quarter,
        startDate: quarterStart,
        endDate: quarterEnd,
      };
    });
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

    const quarters = input.quarters ?? this.createDefaultQuarterDates(input.startDate, input.endDate);
    this.validateQuarterWindows(quarters, cycleStart, cycleEnd);
  }

  private validateQuarterWindows(
    quarters: QuarterCycleInput[],
    cycleStart: Date,
    cycleEnd: Date,
  ): void {
    const expectedQuarters: QuarterCode[] = ['Q1', 'Q2', 'Q3', 'Q4'];
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
      this.validateWindowWithinQuarter(
        quarter.managerReviewWindow ?? quarter.reviewWindow,
        startDate,
        endDate,
        `${quarterCode} manager review window`,
      );

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

  private assertValidDateRange(startDate: Date, endDate: Date, label: string): void {
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new Error(`${label} has invalid dates`);
    }

    if (startDate > endDate) {
      throw new Error(`${label} startDate must be before or equal to endDate`);
    }
  }

  private getQuarterCode(quarter: QuarterCycleInput): QuarterCode {
    return (quarter.quarterCode ?? quarter.quarter) as QuarterCode;
  }

  private async validateTemplateVersion(templateVersionId: string): Promise<Types.ObjectId> {
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

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
  }

  private assertAdmin(action: string): void {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const access = accessService.canPerform({
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
  ): Promise<void> {
    const user = this.context.user;
    if (!user) return;

    await auditService.createAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action,
      entityType,
      entityId,
      previousValue,
      newValue,
    });
  }
}
