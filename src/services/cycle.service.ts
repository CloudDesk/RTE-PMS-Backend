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
  quarter: QuarterCode;
  startDate: Date | string;
  endDate: Date | string;
  objectiveWindow?: DateWindowInput;
  reviewWindow?: DateWindowInput;
}

export interface CreateCycleInput {
  name: string;
  code: string;
  year: number;
  startDate: Date | string;
  endDate: Date | string;
  templateVersionId?: string;
  quarters?: QuarterCycleInput[];
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

    const templateVersionId = input.templateVersionId
      ? await this.validateTemplateVersion(input.templateVersionId)
      : undefined;

    const annualCycle = await AnnualCycle.create({
      name: input.name,
      code: input.code.trim().toUpperCase(),
      year: input.year,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      workflowState: AnnualWorkflowState.DRAFT,
      templateVersionId,
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

  private buildQuarterPayloads(
    input: CreateCycleInput,
    annualCycleId: Types.ObjectId,
  ): Array<{
    annualCycleId: Types.ObjectId;
    quarter: QuarterCode;
    startDate: Date;
    endDate: Date;
    objectiveWindow?: { startDate?: Date; endDate?: Date };
    reviewWindow?: { startDate?: Date; endDate?: Date };
    status: QuarterWorkflowState;
  }> {
    const quarters = input.quarters ?? this.createDefaultQuarterDates(input.startDate, input.endDate);
    const expectedQuarters: QuarterCode[] = ['Q1', 'Q2', 'Q3', 'Q4'];
    const submittedQuarters = new Set(quarters.map((quarter) => quarter.quarter));

    for (const quarter of expectedQuarters) {
      if (!submittedQuarters.has(quarter)) {
        throw new Error(`Missing ${quarter} configuration`);
      }
    }

    return expectedQuarters.map((quarter) => {
      const quarterInput = quarters.find((item) => item.quarter === quarter);
      if (!quarterInput) {
        throw new Error(`Missing ${quarter} configuration`);
      }

      return {
        annualCycleId,
        quarter,
        startDate: new Date(quarterInput.startDate),
        endDate: new Date(quarterInput.endDate),
        objectiveWindow: this.normalizeWindow(quarterInput.objectiveWindow),
        reviewWindow: this.normalizeWindow(quarterInput.reviewWindow),
        status: QuarterWorkflowState.NOT_STARTED,
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
        quarter,
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
