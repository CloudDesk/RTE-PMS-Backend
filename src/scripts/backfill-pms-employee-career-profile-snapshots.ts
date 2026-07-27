import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../config/database';
import { AnnualWorkflowState } from '../constants/pms.enums';
import { SYSTEM_WORKFLOW_SYNC_ACTOR } from '../constants/system-actors';
import {
  AnnualAssignment,
  EmployeeCareerProfileSnapshotTrigger,
} from '../models/pms-annual-assignment.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { ManagerReviewPeriodAssignment } from '../models/pms-manager-review-period-assignment.model';
import { TermReview } from '../models/pms-term-review.model';
import { PmsEmployeeCareerProfileSnapshotService } from '../services/pmsEmployeeCareerProfileSnapshot.service';
import type { RequestContext } from '../types/context';

const historicalAnnualStates = [
  AnnualWorkflowState.ALL_TERMS_FINALIZED,
  AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT,
  AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED,
  AnnualWorkflowState.ANNUAL_FINALIZED,
  AnnualWorkflowState.VISIBILITY_ENABLED,
  AnnualWorkflowState.COMMUNICATION_READY,
  AnnualWorkflowState.COMMUNICATION_SENT,
  AnnualWorkflowState.CLOSED,
  AnnualWorkflowState.ARCHIVED,
];

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const [reviewAssignmentIds, groupedReviewAssignmentIds, decisionAssignmentIds] =
    await Promise.all([
      TermReview.distinct('annualAssignmentId', {
        isDeleted: false,
        submittedAt: { $exists: true, $ne: null },
      }),
      ManagerReviewPeriodAssignment.distinct('annualAssignmentId', {
        isDeleted: false,
        submittedAt: { $exists: true, $ne: null },
      }),
      AnnualDecision.distinct('annualAssignmentId', {
        isDeleted: false,
      }),
    ]);

  const triggeredAssignmentIds = Array.from(
    new Set(
      [
        ...reviewAssignmentIds,
        ...groupedReviewAssignmentIds,
        ...decisionAssignmentIds,
      ].map((id) => id.toString()),
    ),
  ).map((id) => new Types.ObjectId(id));

  const assignments = await AnnualAssignment.find({
    isDeleted: false,
    $and: [
      {
        $or: [
          { careerProfileSnapshot: { $exists: false } },
          { careerProfileSnapshot: null },
        ],
      },
      {
        $or: [
          { annualState: { $in: historicalAnnualStates } },
          { _id: { $in: triggeredAssignmentIds } },
        ],
      },
    ],
  })
    .select('_id employeeId annualState')
    .lean();

  if (apply) {
    const snapshotService = new PmsEmployeeCareerProfileSnapshotService(
      systemContext(),
    );
    for (const assignment of assignments) {
      await snapshotService.freezeForAnnualAssignment(
        assignment._id,
        EmployeeCareerProfileSnapshotTrigger.LEGACY_BACKFILL,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        eligibleAssignments: assignments.length,
        assignmentIds: assignments.map((assignment) =>
          assignment._id.toString(),
        ),
        note:
          'Legacy snapshots use the current profile because the historical profile value did not previously exist.',
      },
      null,
      2,
    ),
  );
}

function systemContext(): RequestContext {
  return {
    requestId: 'pms-career-profile-snapshot-backfill',
    reqRole: 'ADMIN',
    user: {
      _id: SYSTEM_WORKFLOW_SYNC_ACTOR.id,
      email: SYSTEM_WORKFLOW_SYNC_ACTOR.email,
      name: SYSTEM_WORKFLOW_SYNC_ACTOR.name,
      role: 'ADMIN',
      departmentId: 'SYSTEM',
      active: true,
      country: 'IN',
      currency: 'INR',
      licenseType: 'system',
      portalAccess: false,
    },
  };
}

run()
  .catch((error: unknown) => {
    console.error('PMS employee career-profile snapshot backfill failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
