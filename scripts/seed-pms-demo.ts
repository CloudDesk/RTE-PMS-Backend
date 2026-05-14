import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../src/config/database';
import { AnnualWorkflowState, ObjectiveSource, QuarterWorkflowState } from '../src/constants/pms.enums';
import { AnnualAssignment } from '../src/models/pms-annual-assignment.model';
import { AnnualCycle } from '../src/models/pms-annual-cycle.model';
import { Objective } from '../src/models/pms-objective.model';
import { QuarterAssignment } from '../src/models/pms-quarter-assignment.model';
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
    employeeId,
    managerId,
  );

  annualCycle.quarterCycleIds = quarterCycles.map((quarterCycle) => quarterCycle._id);
  await annualCycle.save();

  annualAssignment.quarterAssignmentIds = quarterAssignments.map(
    (quarterAssignment) => quarterAssignment._id,
  );
  await annualAssignment.save();

  const q1Assignment = quarterAssignments.find((item) => item.quarter === 'Q1');
  if (q1Assignment) {
    await upsertQ1Objective(q1Assignment._id, employeeId, managerId);
  }

  printSeedSummary({
    adminId,
    managerId,
    employeeId,
    annualCycleId: annualCycle._id,
    annualAssignmentId: annualAssignment._id,
    quarterAssignmentIds: quarterAssignments.map((quarterAssignment) => ({
      quarter: quarterAssignment.quarter,
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
    year: DEMO_YEAR,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T23:59:59.999Z'),
    workflowState: AnnualWorkflowState.DRAFT,
  });
}

async function upsertQuarterCycles(annualCycleId: Types.ObjectId) {
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
        annualCycleId,
        quarter: quarterInput.quarter,
      },
      {
        $setOnInsert: {
          annualCycleId,
          quarter: quarterInput.quarter,
          startDate: quarterInput.startDate,
          endDate: quarterInput.endDate,
          objectiveWindow: {
            startDate: quarterInput.startDate,
            endDate: quarterInput.endDate,
          },
          reviewWindow: {
            startDate: quarterInput.startDate,
            endDate: quarterInput.endDate,
          },
          status: QuarterWorkflowState.NOT_STARTED,
        },
      },
      { upsert: true },
    );
  }

  return QuarterCycle.find({ annualCycleId }).sort({ quarter: 1 });
}

async function upsertAnnualAssignment(
  annualCycleId: Types.ObjectId,
  employeeId: Types.ObjectId,
  managerId: Types.ObjectId,
) {
  const existing = await AnnualAssignment.findOne({
    annualCycleId,
    employeeId,
  });
  if (existing) return existing;

  return AnnualAssignment.create({
    annualCycleId,
    employeeId,
    managerId,
    workflowState: AnnualWorkflowState.DRAFT,
    finalDecisionStatus: AnnualWorkflowState.DRAFT,
  });
}

async function upsertQuarterAssignments(
  annualAssignmentId: Types.ObjectId,
  employeeId: Types.ObjectId,
  managerId: Types.ObjectId,
) {
  const quarters: QuarterCode[] = ['Q1', 'Q2', 'Q3', 'Q4'];

  for (const quarter of quarters) {
    await QuarterAssignment.updateOne(
      {
        annualAssignmentId,
        quarter,
      },
      {
        $setOnInsert: {
          annualAssignmentId,
          employeeId,
          managerId,
          quarter,
          workflowState: QuarterWorkflowState.NOT_STARTED,
        },
      },
      { upsert: true },
    );
  }

  return QuarterAssignment.find({ annualAssignmentId }).sort({ quarter: 1 });
}

async function upsertQ1Objective(
  quarterAssignmentId: Types.ObjectId,
  employeeId: Types.ObjectId,
  managerId: Types.ObjectId,
): Promise<void> {
  const existing = await Objective.findOne({
    quarterAssignmentId,
    title: 'Demo Q1 Objective',
  });

  if (existing) return;

  await Objective.create({
    quarterAssignmentId,
    employeeId,
    managerId,
    source: ObjectiveSource.EMPLOYEE_CREATED,
    title: 'Demo Q1 Objective',
    description: 'Seeded objective for PMS Day 1 local testing.',
    targetMetric: 'Complete PMS demo flow',
    targetDate: new Date('2026-03-31T23:59:59.999Z'),
    weightage: 100,
    successCriteria: 'Objective can be submitted, approved, reviewed, and finalized.',
    workflowState: QuarterWorkflowState.OBJECTIVE_DRAFT,
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
  annualCycleId: Types.ObjectId;
  annualAssignmentId: Types.ObjectId;
  quarterAssignmentIds: Array<{ quarter: QuarterCode; id: Types.ObjectId }>;
}): void {
  console.log('PMS demo seed completed');
  console.log(`adminId: ${summary.adminId.toString()}`);
  console.log(`managerId: ${summary.managerId.toString()}`);
  console.log(`employeeId: ${summary.employeeId.toString()}`);
  console.log(`annualCycleId: ${summary.annualCycleId.toString()}`);
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
