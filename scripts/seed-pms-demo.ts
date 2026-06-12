import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../src/config/database';
import {
  AnnualDecisionStatus,
  AnnualWorkflowState,
  ObjectiveSource,
  ObjectiveStatus,
  PmsTemplateStatus,
  QuarterWorkflowState,
} from '../src/constants/pms.enums';
import { AnnualAssignment } from '../src/models/pms-annual-assignment.model';
import { AnnualCycle } from '../src/models/pms-annual-cycle.model';
import { Objective } from '../src/models/pms-objective.model';
import { QuarterAssignment } from '../src/models/pms-quarter-assignment.model';
import { ReminderRule } from '../src/models/pms-reminder-rule.model';
import type { IQuarterAssignment } from '../src/models/pms-quarter-assignment.model';
import { QuarterCycle } from '../src/models/pms-quarter-cycle.model';
import { SlaRule } from '../src/models/pms-sla-rule.model';
import { PmsTemplateVersion } from '../src/models/pms-template-version.model';
import { User } from '../src/models/user.model';

type QuarterCode = 'Q1' | 'Q2' | 'Q3' | 'Q4';

const DEMO_CYCLE_CODE = 'PMS_DEMO_2026';
const DEMO_YEAR = 2026;

const fallbackIds = {
  admin: new Types.ObjectId('660000000000000000000001'),
  manager: new Types.ObjectId('660000000000000000000002'),
  employee: new Types.ObjectId('660000000000000000000003'),
};

async function seedPmsDemo(): Promise<void> {
  await connectDB();

  const { adminId, managerId, employeeId } = await resolveDemoUsers();
  const achievementTemplateVersion = await resolveAchievementTemplateVersion();
  const annualCycle = await upsertAnnualCycle(achievementTemplateVersion?._id);
  const quarterCycles = await upsertQuarterCycles(annualCycle._id);
  const annualAssignment = await upsertAnnualAssignment(
    annualCycle._id,
    employeeId,
    managerId,
    achievementTemplateVersion?._id,
  );
  const quarterAssignments = await upsertQuarterAssignments(
    annualAssignment._id,
    annualCycle._id,
    employeeId,
    managerId,
    quarterCycles,
  );
  await upsertAchievementSlaRules();

  annualCycle.quarterCycleIds = quarterCycles.map((quarterCycle) => quarterCycle._id);
  await annualCycle.save();

  annualAssignment.quarterAssignmentIds = quarterAssignments.map(
    (quarterAssignment) => quarterAssignment._id,
  );
  await annualAssignment.save();

  const q1Assignment = quarterAssignments.find((item) => item.quarterCode === 'Q1');
  if (q1Assignment) {
    await upsertQ1Objective(q1Assignment, employeeId, managerId);
  }

  printSeedSummary({
    adminId,
    managerId,
    employeeId,
    cycleId: annualCycle._id,
    annualAssignmentId: annualAssignment._id,
    quarterAssignmentIds: quarterAssignments.map((quarterAssignment) => ({
      quarter: quarterAssignment.quarterCode,
      id: quarterAssignment._id,
    })),
  });

  if (!achievementTemplateVersion?._id) {
    console.warn(
      'No active template version with Employee Achievement Submission was found. ' +
      'Demo SLA rules and windows were seeded, but achievement SLA events will not generate until a compatible template is assigned.',
    );
  }
}

async function resolveDemoUsers(): Promise<{
  adminId: Types.ObjectId;
  managerId: Types.ObjectId;
  employeeId: Types.ObjectId;
}> {
  const [admin, manager, employee] = await Promise.all([
    User.findOne({ role: 'admin', active: true }).select('_id').lean(),
    User.findOne({ role: 'manager', active: true }).select('_id').lean(),
    User.findOne({ role: 'staff', active: true }).select('_id').lean(),
  ]);

  return {
    adminId: toObjectId(admin?._id, fallbackIds.admin),
    managerId: toObjectId(manager?._id, fallbackIds.manager),
    employeeId: toObjectId(employee?._id, fallbackIds.employee),
  };
}

async function upsertAnnualCycle(templateVersionId?: Types.ObjectId) {
  const existing = await AnnualCycle.findOne({ code: DEMO_CYCLE_CODE });
  if (existing) {
    if (templateVersionId && !existing.templateVersionId) {
      existing.templateVersionId = templateVersionId;
      await existing.save();
    }
    return existing;
  }

  return AnnualCycle.create({
    name: 'PMS Demo Cycle 2026',
    code: DEMO_CYCLE_CODE,
    appraisalYear: DEMO_YEAR,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T23:59:59.999Z'),
    status: AnnualWorkflowState.DRAFT,
    templateVersionId,
  });
}

async function upsertQuarterCycles(cycleId: Types.ObjectId) {
  const quarterInputs: Array<{
    quarter: QuarterCode;
    startDate: Date;
    endDate: Date;
  }> = [
    {
      quarter: 'Q1',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-03-31T23:59:59.999Z'),
    },
    {
      quarter: 'Q2',
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T23:59:59.999Z'),
    },
    {
      quarter: 'Q3',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T23:59:59.999Z'),
    },
    {
      quarter: 'Q4',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.999Z'),
    },
  ];

  for (const quarterInput of quarterInputs) {
    await QuarterCycle.updateOne(
      {
        cycleId,
        quarterCode: quarterInput.quarter,
      },
      {
        $set: {
          objectiveSettingWindow: {
            startDate: quarterInput.startDate,
            endDate: quarterInput.endDate,
          },
          achievementSubmissionWindow: {
            enabled: true,
            startDate: quarterInput.startDate,
            endDate: quarterInput.endDate,
            dueDate: quarterInput.endDate,
            graceDays: 3,
            reminderDaysBefore: [2],
            escalationDaysAfterDue: 1,
          },
          managerReviewWindow: {
            startDate: quarterInput.startDate,
            endDate: quarterInput.endDate,
          },
        },
        $setOnInsert: {
          cycleId,
          quarterCode: quarterInput.quarter,
          startDate: quarterInput.startDate,
          endDate: quarterInput.endDate,
          status: QuarterWorkflowState.NOT_STARTED,
        },
      },
      { upsert: true },
    );
  }

  return QuarterCycle.find({ cycleId }).sort({ quarterCode: 1 });
}

async function upsertAnnualAssignment(
  cycleId: Types.ObjectId,
  employeeId: Types.ObjectId,
  managerId: Types.ObjectId,
  templateVersionId?: Types.ObjectId,
) {
  const existing = await AnnualAssignment.findOne({
    cycleId,
    employeeId,
  });
  if (existing) {
    if (templateVersionId && !existing.templateVersionId) {
      existing.templateVersionId = templateVersionId;
      await existing.save();
    }
    return existing;
  }

  return AnnualAssignment.create({
    cycleId,
    employeeId,
    assignedManagerId: managerId,
    templateVersionId,
    annualState: AnnualWorkflowState.DRAFT,
    finalDecisionStatus: AnnualDecisionStatus.DRAFT,
    applicableQuarters: ['Q1', 'Q2', 'Q3', 'Q4'],
    assignmentReason: 'FULL_YEAR',
  });
}

async function upsertQuarterAssignments(
  annualAssignmentId: Types.ObjectId,
  cycleId: Types.ObjectId,
  employeeId: Types.ObjectId,
  managerId: Types.ObjectId,
  quarterCycles: Array<{ _id: Types.ObjectId; quarterCode: QuarterCode }>,
) {
  const quarters: QuarterCode[] = ['Q1', 'Q2', 'Q3', 'Q4'];
  const quarterCycleByCode = new Map(
    quarterCycles.map((quarterCycle) => [quarterCycle.quarterCode, quarterCycle._id]),
  );

  for (const quarter of quarters) {
    await QuarterAssignment.updateOne(
      {
        annualAssignmentId,
        quarterCode: quarter,
      },
      {
        $set: {
          cycleQuarterId: quarterCycleByCode.get(quarter),
        },
        $setOnInsert: {
          annualAssignmentId,
          cycleId,
          employeeId,
          assignedManagerId: managerId,
          quarterCode: quarter,
          quarterState: QuarterWorkflowState.NOT_STARTED,
        },
      },
      { upsert: true },
    );
  }

  return QuarterAssignment.find({ annualAssignmentId }).sort({ quarterCode: 1 });
}

async function resolveAchievementTemplateVersion() {
  return PmsTemplateVersion.findOne({
    status: PmsTemplateStatus.ACTIVE,
    isDeleted: false,
    sections: {
      $elemMatch: {
        sectionKey: 'employee_achievement_submission',
        level: 'QUARTER',
      },
    },
  })
    .select('_id metadata sections')
    .lean();
}

async function upsertAchievementSlaRules(): Promise<void> {
  const rule = await SlaRule.findOneAndUpdate(
    {
      eventType: 'employee_achievement_submission_pending',
      entityType: 'QUARTER_ASSIGNMENT',
      targetRole: 'EMPLOYEE',
      cycleId: { $exists: false },
    },
    {
      $set: {
        name: 'Employee Achievement Submission Pending',
        eventType: 'employee_achievement_submission_pending',
        entityType: 'QUARTER_ASSIGNMENT',
        targetRole: 'EMPLOYEE',
        baseDatePointer: 'QUARTER_START',
        offsetDays: 0,
        isActive: true,
        isDeleted: false,
      },
      $unset: {
        cycleId: '',
        fixedDate: '',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const reminderInputs = [
    {
      name: 'Employee Achievement Reminder - 2 Days Before Due',
      reminderType: 'PRE_DUE',
      offsetDays: -2,
      channel: 'EMAIL',
      subjectTemplate: 'Employee Achievement Submission Due Soon',
      bodyTemplate: 'Employee Achievement Submission is due on {dueDate}.',
    },
    {
      name: 'Employee Achievement Overdue Notification',
      reminderType: 'OVERDUE',
      offsetDays: 1,
      channel: 'EMAIL',
      subjectTemplate: 'Employee Achievement Submission Overdue',
      bodyTemplate: 'Employee Achievement Submission is overdue as of {dueDate}.',
    },
    {
      name: 'Employee Achievement Escalation',
      reminderType: 'ESCALATION',
      offsetDays: 0,
      channel: 'EMAIL',
      subjectTemplate: 'Employee Achievement Submission Escalation',
      bodyTemplate: 'Employee Achievement Submission remains pending after the allowed window.',
    },
  ] as const;

  for (const reminderInput of reminderInputs) {
    await ReminderRule.findOneAndUpdate(
      {
        slaRuleId: rule._id,
        reminderType: reminderInput.reminderType,
        name: reminderInput.name,
      },
      {
        $set: {
          ...reminderInput,
          slaRuleId: rule._id,
          isActive: true,
          isDeleted: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
}

async function upsertQ1Objective(
  quarterAssignment: IQuarterAssignment,
  employeeId: Types.ObjectId,
  managerId: Types.ObjectId,
): Promise<void> {
  const existing = await Objective.findOne({
    quarterAssignmentId: quarterAssignment._id,
    title: 'Demo Q1 Objective',
  });

  if (existing) return;

  await Objective.create({
    quarterAssignmentId: quarterAssignment._id,
    annualAssignmentId: quarterAssignment.annualAssignmentId,
    cycleId: quarterAssignment.cycleId,
    quarterCode: quarterAssignment.quarterCode,
    employeeId,
    assignedManagerId: managerId,
    objectiveNo: 1,
    source: ObjectiveSource.EMPLOYEE_CREATED,
    title: 'Demo Q1 Objective',
    description: 'Seeded objective for PMS Day 1 local testing.',
    targetMetric: 'Complete PMS demo flow',
    targetValue: 'Submitted, approved, reviewed, and finalized',
    targetDate: new Date('2026-03-31T23:59:59.999Z'),
    weightage: 100,
    successCriteria: 'Objective can be submitted, approved, reviewed, and finalized.',
    status: ObjectiveStatus.OBJECTIVE_DRAFT,
    attachments: [],
    createdByRole: 'Employee',
    createdByUserId: employeeId,
    createdBy: employeeId,
  });
}

function toObjectId(
  value: unknown,
  fallback: Types.ObjectId,
): Types.ObjectId {
  if (value instanceof Types.ObjectId) return value;

  if (typeof value === 'string' && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value);
  }

  return fallback;
}

function printSeedSummary(summary: {
  adminId: Types.ObjectId;
  managerId: Types.ObjectId;
  employeeId: Types.ObjectId;
  cycleId: Types.ObjectId;
  annualAssignmentId: Types.ObjectId;
  quarterAssignmentIds: Array<{ quarter: QuarterCode; id: Types.ObjectId }>;
}): void {
  console.log('PMS demo seed completed');
  console.log(`adminId: ${summary.adminId.toString()}`);
  console.log(`managerId: ${summary.managerId.toString()}`);
  console.log(`employeeId: ${summary.employeeId.toString()}`);
  console.log(`cycleId: ${summary.cycleId.toString()}`);
  console.log(`annualAssignmentId: ${summary.annualAssignmentId.toString()}`);
  console.log('quarterAssignmentIds:');
  for (const quarterAssignment of summary.quarterAssignmentIds) {
    console.log(`  ${quarterAssignment.quarter}: ${quarterAssignment.id.toString()}`);
  }
  console.log('SLA rule seeded: employee_achievement_submission_pending');
  console.log('To run SLA check manually: POST /pms/sla/trigger-check');
}

seedPmsDemo()
  .catch((error: unknown) => {
    console.error('PMS demo seed failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
