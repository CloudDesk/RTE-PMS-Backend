import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { AnnualWorkflowState, PmsTemplateStatus, QuarterWorkflowState } from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { QuarterAssignment } from '../models/pms-quarter-assignment.model';
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
  quarters?: QuarterCycleInput[];
  appraisalWindowConfig?: Record<string, unknown>;
  communicationRuleConfig?: Record<string, unknown>;
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
  quarters?: QuarterCycleInput[];
  appraisalWindowConfig?: Record<string, unknown>;
  communicationRuleConfig?: Record<string, unknown>;
}

export interface CycleListQuery {
  status?: string;
  appraisalYear?: string | number;
  search?: string;
  page?: string | number;
  limit?: string | number;
}

export interface CycleDetailResult {
  annualCycle: IAnnualCycle;
  quarterCycles: IQuarterCycle[];
}

export interface CycleListResult {
  items: IAnnualCycle[];
  total: number;
  page: number;
  limit: number;
}

export class CycleService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async listCycles(query: CycleListQuery = {}): Promise<CycleListResult> {
    this.assertAdmin('cycle.list');
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 20), 100);
    const filter: Record<string, unknown> = { isDeleted: false };

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

    return { items, total, page, limit };
  }

  async getCycleDetail(cycleId: string): Promise<CycleDetailResult> {
    this.assertAdmin('cycle.detail');
    const annualCycle = await this.getCycleForAction(cycleId);
    const quarterCycles = await QuarterCycle.find({
      cycleId: annualCycle._id,
      isDeleted: false,
    }).sort({ quarterCode: 1 });

    return { annualCycle, quarterCycles };
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

  async updateCycle(cycleId: string, input: UpdateCycleInput): Promise<CycleDetailResult> {
    this.assertAdmin('cycle.update');
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

    if (input.code?.trim()) {
      const code = input.code.trim().toUpperCase();
      const existingCycle = await AnnualCycle.exists({
        code,
        _id: { $ne: cycle._id },
      });
      if (existingCycle) {
        throw new Error('Cycle code already exists');
      }
      cycle.code = code;
    }

    if (input.templateVersionId) {
      cycle.templateVersionId = await this.validateTemplateVersion(input.templateVersionId);
    }

    if (input.name !== undefined) cycle.name = input.name;
    if (input.appraisalYear !== undefined || input.year !== undefined) {
      cycle.appraisalYear = input.appraisalYear ?? input.year!;
    }
    if (input.startDate !== undefined) cycle.startDate = new Date(input.startDate);
    if (input.endDate !== undefined) cycle.endDate = new Date(input.endDate);
    if (input.appraisalWindowConfig !== undefined) {
      cycle.appraisalWindowConfig = input.appraisalWindowConfig;
    }
    if (input.communicationRuleConfig !== undefined) {
      cycle.communicationRuleConfig = input.communicationRuleConfig;
    }
    cycle.updatedBy = this.actorIdObject();

    let quarterCycles = existingQuarters;
    if (input.quarters) {
      await QuarterCycle.deleteMany({ cycleId: cycle._id });
      const quarterPayload = this.buildQuarterPayloads(mergedInput, cycle._id);
      quarterCycles = await QuarterCycle.insertMany(quarterPayload);
      cycle.quarterCycleIds = quarterCycles.map((quarterCycle) => quarterCycle._id);
    }

    await cycle.save();

    await this.audit(
      'PMS_CYCLE_UPDATED',
      'ANNUAL_CYCLE',
      cycle._id.toString(),
      previousValue,
      {
        annualCycle: cycle,
        quarterCycles,
      },
    );

    return { annualCycle: cycle, quarterCycles };
  }

  async launchCycle(cycleId: string): Promise<IAnnualCycle> {
    this.assertAdmin('cycle.launch');
    const cycle = await this.getCycleForAction(cycleId);
    if (cycle.status !== AnnualWorkflowState.SCHEDULED) {
      throw new Error('Only SCHEDULED cycles can be launched');
    }
    await this.assertLaunchReady(cycle);

    const previousStatus = cycle.status;
    cycle.status = AnnualWorkflowState.ACTIVE;
    cycle.launchedAt = new Date();
    cycle.updatedBy = this.actorIdObject();
    await cycle.save();

    await this.audit('PMS_CYCLE_LAUNCHED', 'ANNUAL_CYCLE', cycle._id.toString(), { status: previousStatus }, { status: cycle.status });
    return cycle;
  }

  async scheduleCycle(cycleId: string): Promise<IAnnualCycle> {
    this.assertAdmin('cycle.schedule');
    const cycle = await this.getCycleForAction(cycleId);
    if (cycle.status !== AnnualWorkflowState.DRAFT) {
      throw new Error('Only DRAFT cycles can be scheduled');
    }

    const previousStatus = cycle.status;
    cycle.status = AnnualWorkflowState.SCHEDULED;
    cycle.updatedBy = this.actorIdObject();
    await cycle.save();

    await this.audit(
      'PMS_CYCLE_SCHEDULED',
      'ANNUAL_CYCLE',
      cycle._id.toString(),
      { status: previousStatus },
      { status: cycle.status },
    );
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
    quarterFinalizationWindow?: { startDate?: Date; endDate?: Date };
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
        quarterFinalizationWindow: this.normalizeWindow(quarterInput.quarterFinalizationWindow),
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
      quarters: input.quarters ?? this.quarterCyclesToInput(existingQuarters),
      appraisalWindowConfig: input.appraisalWindowConfig ?? cycle.appraisalWindowConfig ?? {},
      communicationRuleConfig:
        input.communicationRuleConfig ?? cycle.communicationRuleConfig ?? {},
    };
  }

  private quarterCyclesToInput(quarterCycles: IQuarterCycle[]): QuarterCycleInput[] {
    return quarterCycles.map((quarterCycle) => ({
      quarterCode: quarterCycle.quarterCode,
      startDate: quarterCycle.startDate,
      endDate: quarterCycle.endDate,
      objectiveSettingWindow: quarterCycle.objectiveSettingWindow,
      objectiveApprovalWindow: quarterCycle.objectiveApprovalWindow,
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
      this.validateWindowWithinQuarter(
        quarter.quarterFinalizationWindow,
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
        label: 'manager review window',
        window: quarter.managerReviewWindow ?? quarter.reviewWindow,
      },
      {
        label: 'quarter finalization window',
        window: quarter.quarterFinalizationWindow,
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

  private normalizePositiveInteger(value: string | number | undefined, fallback: number): number {
    const normalized = Number(value ?? fallback);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
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

  private async assertLaunchReady(cycle: IAnnualCycle): Promise<void> {
    const expectedQuarters: QuarterCode[] = ['Q1', 'Q2', 'Q3', 'Q4'];
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
