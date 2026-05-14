import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../src/config/database';
import {
  AnnualDecisionStatus,
  AnnualWorkflowState,
  ObjectiveSource,
  ObjectiveStatus,
  QuarterWorkflowState,
} from '../src/constants/pms.enums';
import { AnnualAssignment } from '../src/models/pms-annual-assignment.model';
import { AnnualCycle } from '../src/models/pms-annual-cycle.model';
import { Objective } from '../src/models/pms-objective.model';
import { QuarterAssignment } from '../src/models/pms-quarter-assignment.model';
import type { IQuarterAssignment } from '../src/models/pms-quarter-assignment.model';
import { QuarterCycle } from '../src/models/pms-quarter-cycle.model';
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
  const annualCycle = await upsertAnnualCycle();
  const quarterCycles = await upsertQuarterCycles(annualCycle._id);
  const annualAssignment = await upsertAnnualAssignment(
    annualCycle._id,
    employeeId,
    managerId,
  );
  const quarterAssignments = await upsertQuarterAssignments(
    annualAssignment._id,
    annualCycle._id,
    employeeId,
    managerId,
  );

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

async function upsertAnnualCycle() {
  const existing = await AnnualCycle.findOne({ code: DEMO_CYCLE_CODE });
  if (existing) return existing;

  return AnnualCycle.create({
    name: 'PMS Demo Cycle 2026',
    code: DEMO_CYCLE_CODE,
    appraisalYear: DEMO_YEAR,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T23:59:59.999Z'),
    status: AnnualWorkflowState.DRAFT,
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
        $setOnInsert: {
          cycleId,
          quarterCode: quarterInput.quarter,
          startDate: quarterInput.startDate,
          endDate: quarterInput.endDate,
          objectiveSettingWindow: {
            startDate: quarterInput.startDate,
            endDate: quarterInput.endDate,
          },
          managerReviewWindow: {
            startDate: quarterInput.startDate,
            endDate: quarterInput.endDate,
          },
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
) {
  const existing = await AnnualAssignment.findOne({
    cycleId,
    employeeId,
  });
  if (existing) return existing;

  return AnnualAssignment.create({
    cycleId,
    employeeId,
    assignedManagerId: managerId,
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
) {
  const quarters: QuarterCode[] = ['Q1', 'Q2', 'Q3', 'Q4'];

  for (const quarter of quarters) {
    await QuarterAssignment.updateOne(
      {
        annualAssignmentId,
        quarterCode: quarter,
      },
      {
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
    source: ObjectiveSource.EMPLOYEE_CREATED,
    title: 'Demo Q1 Objective',
    description: 'Seeded objective for PMS Day 1 local testing.',
    targetMetric: 'Complete PMS demo flow',
    targetDate: new Date('2026-03-31T23:59:59.999Z'),
    weightage: 100,
    successCriteria: 'Objective can be submitted, approved, reviewed, and finalized.',
    status: ObjectiveStatus.OBJECTIVE_DRAFT,
    attachments: [],
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
