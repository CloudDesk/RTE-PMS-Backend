import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../config/database';
import { PmsTemplateStatus } from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { EmployeeAchievementSubmission } from '../models/pms-employee-achievement-submission.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { auditService } from '../services/audit.service';
import {
  classifyAchievementSubmissionForRollout,
  convertLegacyDraftItemsForEmployeeAuthoredMode,
  employeeAuthoredRolloutMetadata,
} from '../utilis/employeeAchievementRollout';

type Options = {
  cycleId: string;
  apply: boolean;
  convertDrafts: boolean;
  actorId?: string;
  reason?: string;
};

function argumentValue(args: string[], name: string): string | undefined {
  return args.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function parseOptions(args: string[]): Options {
  const cycleId = argumentValue(args, '--cycle-id');
  const apply = args.includes('--apply');
  const actorId = argumentValue(args, '--actor-id');
  const reason = argumentValue(args, '--reason')?.trim();
  if (!cycleId || !Types.ObjectId.isValid(cycleId)) {
    throw new Error('A valid --cycle-id=<id> is required.');
  }
  if (apply && process.env.PMS_EMPLOYEE_ACHIEVEMENT_ROLLOUT_ENABLED !== 'true') {
    throw new Error(
      'Apply is disabled. Set PMS_EMPLOYEE_ACHIEVEMENT_ROLLOUT_ENABLED=true only for the approved rollout window.',
    );
  }
  if (apply && (!actorId || !Types.ObjectId.isValid(actorId))) {
    throw new Error('A valid --actor-id=<admin user id> is required for apply.');
  }
  if (apply && !reason) {
    throw new Error('--reason=<approved rollout reason> is required for apply.');
  }
  return {
    cycleId,
    apply,
    convertDrafts: args.includes('--convert-drafts'),
    actorId,
    reason,
  };
}

function cloneVersionPayload(
  source: Record<string, any>,
  versionNo: number,
  reason: string,
): Record<string, any> {
  return {
    templateId: source.templateId,
    versionNo,
    status: PmsTemplateStatus.ACTIVE,
    sections: source.sections ?? [],
    metadata: employeeAuthoredRolloutMetadata(
      source.metadata,
      source._id.toString(),
      reason,
    ),
    templateOwnership: source.templateOwnership ?? {},
    launchPolicy: source.launchPolicy ?? {},
    flowPolicy: source.flowPolicy ?? {},
    themeConfig: source.themeConfig ?? {},
    scoringConfig: source.scoringConfig ?? {},
    annualScoringConfig: source.annualScoringConfig ?? {},
    effectiveFrom: source.effectiveFrom,
    effectiveTo: source.effectiveTo,
    isLocked: true,
    lockedAt: new Date(),
    activatedAt: new Date(),
    isDeleted: false,
  };
}

async function run(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  await connectDB();

  const cycle = await AnnualCycle.findOne({ _id: options.cycleId, isDeleted: false });
  if (!cycle) throw new Error('PMS cycle was not found.');

  const assignments = await AnnualAssignment.find({
    cycleId: cycle._id,
    isDeleted: false,
  }).lean();
  const assignmentIds = assignments.map((assignment) => assignment._id);
  const submissions = await EmployeeAchievementSubmission.find({
    annualAssignmentId: { $in: assignmentIds },
    isDeleted: false,
  }).lean();
  const submissionByAssignment = new Map(
    submissions.map((submission) => [submission.annualAssignmentId.toString(), submission]),
  );

  const rows = assignments.map((assignment) => {
    const submission = submissionByAssignment.get(assignment._id.toString());
    const classification = classifyAchievementSubmissionForRollout(submission);
    const eligible =
      classification === 'NO_SUBMISSION' ||
      classification === 'EMPTY_DRAFT' ||
      (classification === 'MEANINGFUL_DRAFT' && options.convertDrafts);
    return {
      assignment,
      submission,
      classification,
      eligible,
      sourceTemplateVersionId: assignment.templateVersionId?.toString(),
    };
  });
  const counts = rows.reduce<Record<string, number>>((result, row) => {
    result[row.classification] = (result[row.classification] ?? 0) + 1;
    return result;
  }, {});
  const eligibleRows = rows.filter((row) => row.eligible && row.sourceTemplateVersionId);
  const blockedRows = rows.filter((row) => !row.eligible || !row.sourceTemplateVersionId);

  const summary: Record<string, any> = {
    mode: options.apply ? 'APPLY' : 'DRY_RUN',
    cycleId: cycle._id.toString(),
    cycleCode: cycle.code,
    rolloutFeatureEnabled:
      process.env.PMS_EMPLOYEE_ACHIEVEMENT_ROLLOUT_ENABLED === 'true',
    convertDrafts: options.convertDrafts,
    assignmentCount: assignments.length,
    classifications: counts,
    eligibleAssignmentCount: eligibleRows.length,
    blockedAssignmentCount: blockedRows.length,
    blockedAssignments: blockedRows.map((row) => ({
      annualAssignmentId: row.assignment._id.toString(),
      classification: row.classification,
      reason: row.sourceTemplateVersionId
        ? row.classification === 'MEANINGFUL_DRAFT'
          ? 'Meaningful draft requires --convert-drafts or must remain legacy.'
          : 'Submitted and locked records are never rewritten by this utility.'
        : 'Assignment has no template version.',
    })),
    clonedTemplateVersions: [] as Array<Record<string, string | number>>,
    migratedAssignmentCount: 0,
    convertedDraftCount: 0,
    cycleTemplateUpdated: false,
  };

  if (!options.apply || eligibleRows.length === 0) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const session = await mongoose.startSession();
  const correlationId = `employee-achievement-rollout:${cycle._id}:${Date.now()}`;
  try {
    await session.withTransaction(async () => {
      const sourceIds = Array.from(new Set(
        eligibleRows.map((row) => row.sourceTemplateVersionId as string),
      ));
      const sourceVersions = await PmsTemplateVersion.find({
        _id: { $in: sourceIds },
        isDeleted: false,
      }).session(session).lean();
      if (sourceVersions.length !== sourceIds.length) {
        throw new Error('One or more source template versions were not found.');
      }

      const cloneIdBySource = new Map<string, Types.ObjectId>();
      for (const source of sourceVersions) {
        const latest = await PmsTemplateVersion.findOne({ templateId: source.templateId })
          .sort({ versionNo: -1 })
          .session(session)
          .lean();
        const nextVersionNo = Number(latest?.versionNo ?? 0) + 1;
        const [clone] = await PmsTemplateVersion.create(
          [cloneVersionPayload(source, nextVersionNo, options.reason as string)],
          { session },
        );
        cloneIdBySource.set(source._id.toString(), clone._id);
        summary.clonedTemplateVersions.push({
          sourceVersionId: source._id.toString(),
          rolloutVersionId: clone._id.toString(),
          versionNo: nextVersionNo,
        });
      }

      for (const row of eligibleRows) {
        const sourceVersionId = row.sourceTemplateVersionId as string;
        const rolloutVersionId = cloneIdBySource.get(sourceVersionId);
        if (!rolloutVersionId) throw new Error('Rollout template version mapping failed.');

        const currentSubmission = await EmployeeAchievementSubmission.findOne({
          annualAssignmentId: row.assignment._id,
          isDeleted: false,
        }).session(session).lean();
        const currentClassification = classifyAchievementSubmissionForRollout(
          currentSubmission,
        );
        const stillEligible =
          currentClassification === 'NO_SUBMISSION' ||
          currentClassification === 'EMPTY_DRAFT' ||
          (currentClassification === 'MEANINGFUL_DRAFT' && options.convertDrafts);
        if (!stillEligible) {
          throw new Error(
            `Assignment ${row.assignment._id} changed after preview and is no longer eligible (${currentClassification}). Run dry-run again.`,
          );
        }

        const assignmentUpdate = await AnnualAssignment.updateOne(
          { _id: row.assignment._id, templateVersionId: row.assignment.templateVersionId },
          {
            $set: {
              templateVersionId: rolloutVersionId,
              updatedBy: new Types.ObjectId(options.actorId),
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (assignmentUpdate.matchedCount !== 1) {
          throw new Error(
            `Assignment ${row.assignment._id} changed after preview. Run dry-run again.`,
          );
        }

        if (currentSubmission) {
          const update: Record<string, any> = {
            templateVersionId: rolloutVersionId,
            updatedBy: new Types.ObjectId(options.actorId),
            auditMetadata: {
              ...(currentSubmission.auditMetadata ?? {}),
              employeeAchievementRollout: {
                correlationId,
                sourceTemplateVersionId: sourceVersionId,
                rolloutTemplateVersionId: rolloutVersionId.toString(),
                convertedLegacyDraft: currentClassification === 'MEANINGFUL_DRAFT',
              },
            },
          };
          if (currentClassification === 'MEANINGFUL_DRAFT') {
            update.achievementItems = convertLegacyDraftItemsForEmployeeAuthoredMode(
              currentSubmission.achievementItems as Array<Record<string, any>>,
            );
            summary.convertedDraftCount += 1;
          }
          const submissionUpdate = await EmployeeAchievementSubmission.updateOne(
            { _id: currentSubmission._id, status: 'DRAFT' },
            { $set: update, $inc: { version: 1 } },
            { session },
          );
          if (submissionUpdate.matchedCount !== 1) {
            throw new Error(
              `Achievement submission for assignment ${row.assignment._id} changed after preview. Run dry-run again.`,
            );
          }
        }

        await auditService.createAuditLog({
          actorId: options.actorId as string,
          actorRole: 'ADMIN',
          action: 'PMS_EMPLOYEE_ACHIEVEMENT_MODE_OVERRIDE',
          entityType: 'ANNUAL_ASSIGNMENT',
          entityId: row.assignment._id.toString(),
          assignmentId: row.assignment._id.toString(),
          previousValue: { templateVersionId: sourceVersionId, achievementEntryMode: 'OBJECTIVE_ROWS' },
          newValue: {
            templateVersionId: rolloutVersionId.toString(),
            achievementEntryMode: 'EMPLOYEE_AUTHORED',
            draftConversion: currentClassification === 'MEANINGFUL_DRAFT',
          },
          reason: options.reason,
          correlationId,
        }, session);
        summary.migratedAssignmentCount += 1;
      }

      const cycleSourceId = cycle.templateVersionId?.toString();
      const cycleSourceRows = rows.filter(
        (row) => row.sourceTemplateVersionId === cycleSourceId,
      );
      if (
        cycleSourceId &&
        cycleSourceRows.length > 0 &&
        cycleSourceRows.every((row) => row.eligible)
      ) {
        const rolloutVersionId = cloneIdBySource.get(cycleSourceId);
        if (rolloutVersionId) {
          cycle.templateVersionId = rolloutVersionId;
          cycle.updatedBy = new Types.ObjectId(options.actorId);
          cycle.version += 1;
          await cycle.save({ session });
          summary.cycleTemplateUpdated = true;
        }
      }

      await auditService.createAuditLog({
        actorId: options.actorId as string,
        actorRole: 'ADMIN',
        action: 'PMS_EMPLOYEE_ACHIEVEMENT_ROLLOUT_OVERRIDE',
        entityType: 'ANNUAL_CYCLE',
        entityId: cycle._id.toString(),
        previousValue: { achievementEntryMode: 'OBJECTIVE_ROWS' },
        newValue: {
          achievementEntryMode: 'EMPLOYEE_AUTHORED',
          migratedAssignmentCount: summary.migratedAssignmentCount,
          convertedDraftCount: summary.convertedDraftCount,
          blockedAssignmentCount: summary.blockedAssignmentCount,
          clonedTemplateVersions: summary.clonedTemplateVersions,
        },
        reason: options.reason,
        correlationId,
      }, session);
    });
  } finally {
    await session.endSession();
  }

  console.log(JSON.stringify(summary, null, 2));
}

run()
  .catch((error: unknown) => {
    console.error('Employee-authored achievement rollout failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
