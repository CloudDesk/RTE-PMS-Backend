import cron, { ScheduledTask } from 'node-cron';
import { Types } from 'mongoose';
import { AnnualWorkflowState, PmsRole } from '../constants/pms.enums';
import { getDatabaseHealth } from '../config/database';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { WorkflowSyncService, type WorkflowSyncResult } from './workflow-sync.service';
import type { RequestContext } from '../types/context';
import { SYSTEM_WORKFLOW_SYNC_ACTOR } from '../constants/system-actors';

const DEFAULT_WORKFLOW_SYNC_CRON = '0 0 * * *';
const DEFAULT_WORKFLOW_SYNC_TIMEZONE = 'Asia/Kolkata';
let scheduledTask: ScheduledTask | undefined;
let running = false;

export interface AutomaticWorkflowSyncRunResult {
  checkedCycles: number;
  updatedAssignments: number;
  failedAssignments: number;
  skippedReason?: string;
  cycleResults: Array<{
    cycleId: string;
    cycleCode?: string;
    totalChecked: number;
    totalUpdated: number;
    failed: number;
  }>;
}

export function startAutomaticWorkflowSyncScheduler(): ScheduledTask | undefined {
  if (process.env.PMS_WORKFLOW_AUTO_SYNC_ENABLED === 'false') {
    console.log('[PMS Workflow Sync] Automatic daily sync disabled by PMS_WORKFLOW_AUTO_SYNC_ENABLED=false.');
    return undefined;
  }

  if (scheduledTask) {
    return scheduledTask;
  }

  const schedule = process.env.PMS_WORKFLOW_AUTO_SYNC_CRON || DEFAULT_WORKFLOW_SYNC_CRON;
  const timezone = process.env.PMS_WORKFLOW_AUTO_SYNC_TIMEZONE || DEFAULT_WORKFLOW_SYNC_TIMEZONE;

  scheduledTask = cron.schedule(
    schedule,
    () => {
      triggerAutomaticWorkflowSync('Scheduled');
    },
    { timezone },
  );

  console.log(`[PMS Workflow Sync] Automatic daily sync scheduled: "${schedule}" (${timezone}).`);
  if (process.env.PMS_WORKFLOW_AUTO_SYNC_ON_STARTUP === 'true') {
    triggerAutomaticWorkflowSync('Startup');
  }
  return scheduledTask;
}

function triggerAutomaticWorkflowSync(trigger: 'Startup' | 'Scheduled'): void {
  void runAutomaticWorkflowSyncOnce()
    .then((result) => {
      if (result.skippedReason) {
        console.log(`[PMS Workflow Sync] ${trigger} sync skipped: ${result.skippedReason}`);
        return;
      }

      console.log(
        `[PMS Workflow Sync] ${trigger} sync completed. ` +
          `Cycles=${result.checkedCycles}, updated=${result.updatedAssignments}, failed=${result.failedAssignments}.`,
      );
    })
    .catch((error) => {
      console.error(`[PMS Workflow Sync] ${trigger} sync failed:`, error);
    });
}

export async function runAutomaticWorkflowSyncOnce(
  asOfDate: Date = getBusinessDateAtUtcMidnight(new Date()),
): Promise<AutomaticWorkflowSyncRunResult> {
  if (running) {
    return {
      checkedCycles: 0,
      updatedAssignments: 0,
      failedAssignments: 0,
      skippedReason: 'previous workflow sync is still running',
      cycleResults: [],
    };
  }

  const db = getDatabaseHealth();
  if (!db.ready) {
    return {
      checkedCycles: 0,
      updatedAssignments: 0,
      failedAssignments: 0,
      skippedReason: `database is ${db.state}`,
      cycleResults: [],
    };
  }

  running = true;
  try {
    const cycles = await AnnualCycle.find({
      isDeleted: false,
      status: { $in: [AnnualWorkflowState.ACTIVE, AnnualWorkflowState.IN_PROGRESS] },
      startDate: { $lte: asOfDate },
      endDate: { $gte: asOfDate },
    })
      .select('_id code')
      .lean();

    const service = new WorkflowSyncService(createSystemWorkflowSyncContext(asOfDate));
    const cycleResults: AutomaticWorkflowSyncRunResult['cycleResults'] = [];
    let updatedAssignments = 0;
    let failedAssignments = 0;

    for (const cycle of cycles) {
      const result: WorkflowSyncResult = await service.syncWorkflowStates(cycle._id.toString(), {
        reason: 'Automatic daily PMS workflow sync',
        source: 'AUTOMATIC_DAILY_SYNC',
      });
      updatedAssignments += result.totalUpdated;
      failedAssignments += result.failed;
      cycleResults.push({
        cycleId: cycle._id.toString(),
        cycleCode: cycle.code,
        totalChecked: result.totalChecked,
        totalUpdated: result.totalUpdated,
        failed: result.failed,
      });
    }

    return {
      checkedCycles: cycles.length,
      updatedAssignments,
      failedAssignments,
      cycleResults,
    };
  } finally {
    running = false;
  }
}

export function getBusinessDateAtUtcMidnight(
  date: Date,
  timezone: string = process.env.PMS_WORKFLOW_AUTO_SYNC_TIMEZONE || DEFAULT_WORKFLOW_SYNC_TIMEZONE,
): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = getDatePart(parts, 'year');
  const month = getDatePart(parts, 'month');
  const day = getDatePart(parts, 'day');
  return new Date(Date.UTC(year, month - 1, day));
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: 'year' | 'month' | 'day'): number {
  const value = parts.find((part) => part.type === type)?.value;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Unable to resolve ${type} for automatic workflow sync date.`);
  }
  return parsed;
}

function createSystemWorkflowSyncContext(asOfDate: Date): RequestContext {
  return {
    requestId: `automatic-workflow-sync-${asOfDate.toISOString().slice(0, 10)}`,
    reqRole: PmsRole.ADMIN,
    pmsCurrentDate: asOfDate,
    user: {
      _id: new Types.ObjectId(SYSTEM_WORKFLOW_SYNC_ACTOR.id),
      email: SYSTEM_WORKFLOW_SYNC_ACTOR.email,
      name: SYSTEM_WORKFLOW_SYNC_ACTOR.name,
      role: PmsRole.ADMIN,
      departmentId: '',
      active: true,
      country: '',
      currency: '',
      licenseType: '',
      portalAccess: true,
    },
  };
}
