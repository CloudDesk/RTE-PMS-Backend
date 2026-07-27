/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const REPAIR_FROZEN = process.argv.includes('--repair-frozen');
const REVIEW_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];

function id(value) {
  if (!value) return undefined;
  const text = String(value);
  return mongoose.Types.ObjectId.isValid(text)
    ? new mongoose.Types.ObjectId(text)
    : undefined;
}

function isDirector(user) {
  return String(user?.role || '').trim().toLowerCase() === 'director';
}

function snapshot(user) {
  return {
    employeeCode: user.employeeCode,
    name: user.name,
    email: user.email,
    role: user.role,
    specificRole: user.specificRole,
  };
}

async function resolveDirector(db, assignment) {
  const users = db.collection('users');
  const visited = new Set();
  let currentId = id(assignment.finalReviewerId);

  for (let depth = 0; currentId && depth < 20; depth += 1) {
    const key = String(currentId);
    if (visited.has(key)) throw new Error(`Hierarchy cycle detected at ${key}`);
    visited.add(key);
    const user = await users.findOne({ _id: currentId });
    if (!user) break;
    if (isDirector(user)) return { user, source: 'REPORTING_DIRECTOR' };
    currentId = id(user.managerId);
  }

  const cycle = await db.collection('annual_cycles').findOne({ _id: assignment.cycleId });
  const fallback = cycle?.defaultFinalReviewerId
    ? await users.findOne({ _id: id(cycle.defaultFinalReviewerId) })
    : null;
  if (fallback && isDirector(fallback)) {
    return { user: fallback, source: 'CYCLE_DEFAULT' };
  }
  throw new Error(`Director not found for annual assignment ${assignment._id}`);
}

function updateTemplateSections(sections = []) {
  let changed = false;
  const next = sections.map((section) => {
    if (section?.metadata?.finalReviewSection !== true) return section;
    return {
      ...section,
      fields: (section.fields || []).map((field) => {
        const fieldKey = String(field.fieldKey || field.key || '').toLowerCase();
        if (!['ed_svp_assessment', 'dic_assessment'].includes(fieldKey)) return field;
        const stage = fieldKey === 'ed_svp_assessment' ? 'L2' : 'DIRECTOR';
        changed = true;
        return {
          ...field,
          isRequired: true,
          metadata: {
            ...(field.metadata || {}),
            finalReviewStage: stage,
          },
          validationRules: {
            ...(field.validationRules || {}),
            requiredFor: Array.from(new Set([
              ...(field.validationRules?.requiredFor || []),
              'DIRECTOR',
            ])),
          },
          behaviors: (field.behaviors || []).map((behavior) =>
            behavior.role === 'DIRECTOR' &&
            behavior.workflowState === 'MANAGEMENT_DECISION_SUBMITTED'
              ? { ...behavior, mandatory: true }
              : behavior,
          ),
        };
      }),
    };
  });
  return { changed, sections: next };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const assignments = db.collection('annual_assignments');
  const decisionValues = db.collection('annual_decision_values');
  const templateVersions = db.collection('pms_template_versions');

  const candidates = await assignments.find({
    finalReviewStatus: { $in: REVIEW_STATUSES },
    isDeleted: false,
    directorReviewerId: { $exists: false },
  }).toArray();
  console.log(`${APPLY ? 'Applying' : 'Dry run'}: ${candidates.length} assignment(s)`);

  const templateIds = new Set();
  for (const assignment of candidates) {
    const resolved = await resolveDirector(db, assignment);
    console.log(
      `${assignment._id}: L2=${assignment.finalReviewerSnapshot?.name || assignment.finalReviewerId} -> Director=${resolved.user.name}`,
    );
    if (assignment.templateVersionId) templateIds.add(String(assignment.templateVersionId));
    if (!APPLY) continue;

    await assignments.updateOne(
      { _id: assignment._id, directorReviewerId: { $exists: false } },
      {
        $set: {
          directorReviewerId: resolved.user._id,
          directorReviewerSource: resolved.source,
          directorReviewerSnapshot: snapshot(resolved.user),
          directorReviewStatus: 'PENDING',
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
    );
    await decisionValues.updateMany(
      {
        annualAssignmentId: assignment._id,
        fieldKey: 'dic_assessment',
        roleCode: 'DIRECTOR',
        isDeleted: false,
      },
      {
        $set: { isDeleted: true, updatedAt: new Date() },
        $inc: { version: 1 },
      },
    );
  }

  for (const templateId of templateIds) {
    const template = await templateVersions.findOne({ _id: id(templateId) });
    if (!template) continue;
    const normalized = updateTemplateSections(template.sections);
    if (!normalized.changed) continue;
    console.log(`${template._id}: mark ED/SVP=L2 and DIC=Director; both required`);
    if (APPLY) {
      await templateVersions.updateOne(
        { _id: template._id },
        {
          $set: { sections: normalized.sections, updatedAt: new Date() },
          $inc: { version: 1 },
        },
      );
    }
  }

  const invalidFrozenAssignments = await assignments.find({
    finalReviewStatus: 'COMPLETED',
    directorReviewStatus: { $in: ['PENDING', 'IN_PROGRESS'] },
    finalDecisionStatus: { $in: ['FROZEN', 'VISIBILITY_ENABLED'] },
    isDeleted: false,
  }).toArray();
  for (const assignment of invalidFrozenAssignments) {
    console.log(
      `${assignment._id}: frozen under the old single-reviewer flow; Director stage is incomplete`,
    );
    if (!APPLY || !REPAIR_FROZEN) continue;
    const previousState = {
      annualState: assignment.annualState,
      finalDecisionStatus: assignment.finalDecisionStatus,
      visibility: assignment.visibility,
    };
    const hiddenVisibility = {
      ...(assignment.visibility || {}),
      employeeReviewVisible: false,
      employeeGradeVisible: false,
      employeeMeritVisible: false,
      managerGradeVisible: false,
      managerMeritVisible: false,
    };
    await assignments.updateOne(
      { _id: assignment._id },
      {
        $set: {
          annualState: 'MANAGEMENT_DECISION_SUBMITTED',
          finalDecisionStatus: 'SUBMITTED',
          visibility: hiddenVisibility,
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
    );
    await db.collection('annual_decisions').updateOne(
      { annualAssignmentId: assignment._id, isDeleted: false },
      {
        $set: {
          decisionStatus: 'SUBMITTED',
          updatedAt: new Date(),
        },
        $unset: {
          frozenAt: '',
          frozenBy: '',
        },
        $inc: { version: 1 },
      },
    );
    await db.collection('visibility_configurations').updateMany(
      { annualAssignmentId: assignment._id, isDeleted: false },
      {
        $set: {
          employeeReviewVisible: false,
          employeeGradeVisible: false,
          employeeMeritVisible: false,
          managerGradeVisible: false,
          managerMeritVisible: false,
          disabledAt: new Date(),
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
    );
    await db.collection('audit_logs').insertOne({
      entityType: 'ANNUAL_ASSIGNMENT',
      entityId: assignment._id,
      assignmentId: assignment._id,
      action: 'PMS_FINAL_REVIEW_SEQUENCE_MIGRATION_REOPENED',
      actorRole: 'SYSTEM',
      previousValue: previousState,
      newValue: {
        annualState: 'MANAGEMENT_DECISION_SUBMITTED',
        finalDecisionStatus: 'SUBMITTED',
        finalReviewStatus: assignment.finalReviewStatus,
        directorReviewStatus: assignment.directorReviewStatus,
      },
      reason: 'Director DIC Assessment was introduced after the record was frozen by the old single-reviewer flow.',
      timestamp: new Date(),
      createdAt: new Date(),
    });
  }

  await mongoose.disconnect();
  if (invalidFrozenAssignments.length > 0 && !REPAIR_FROZEN) {
    console.log('Frozen repair not applied. Re-run with --apply --repair-frozen after review.');
  }
  console.log(APPLY ? 'Migration completed.' : 'Dry run completed. Re-run with --apply.');
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
