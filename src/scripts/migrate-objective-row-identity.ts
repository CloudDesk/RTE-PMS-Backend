import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import { ObjectiveSource, PmsTemplateSectionType } from '../constants/pms.enums';
import type { AssessmentTermCode as AssessmentTermCodeType } from '../constants/pms.enums';
import { Objective } from '../models/pms-objective.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import {
  deterministicDynamicObjectiveRowKey,
  deterministicPredefinedObjectiveRowKey,
  normalizeObjectiveRowCoverage,
} from '../services/objective-assignment-seeding.service';

type RowPlan = {
  objective: Record<string, any>;
  rowKey: string;
  rowGroupKey?: string;
  rowOrder?: number;
};

function legacyCorrelation(objective: Record<string, any>): string {
  if (objective.objectiveMasterId) return `master:${objective.objectiveMasterId}`;
  if (objective.objectiveVersionId) return `version:${objective.objectiveVersionId}`;
  if (objective.parentObjectiveId) return `parent:${objective.parentObjectiveId}`;
  return `legacy-objective:${objective._id}`;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await connectDB();

  const objectives = await Objective.find({
    isDeleted: false,
    annualAssignmentId: { $exists: true },
    assessmentTermCode: { $exists: true },
  }).lean();

  const templateVersionIds = Array.from(new Set(
    objectives.map((objective) => objective.templateVersionId?.toString()).filter(Boolean),
  ));
  const versions = await PmsTemplateVersion.find({ _id: { $in: templateVersionIds } })
    .select('sections')
    .lean();
  const predefinedByVersion = new Map<string, Map<string, {
    sectionKey: string;
    rowGroupKey?: string;
    rowOrder?: number;
  }>>();

  for (const version of versions) {
    const rows = new Map<string, { sectionKey: string; rowGroupKey?: string; rowOrder?: number }>();
    for (const section of version.sections ?? []) {
      if (section.sectionType !== PmsTemplateSectionType.OBJECTIVES) continue;
      for (const [index, predefined] of (section.objectiveConfig?.predefinedObjectives ?? []).entries()) {
        if (!predefined.objectiveKey) continue;
        const assignment = section.objectiveConfig?.tableLayout?.rowAssignments?.find(
          (candidate) => candidate.objectiveKey === predefined.objectiveKey,
        );
        rows.set(predefined.objectiveKey, {
          sectionKey: section.sectionKey,
          rowGroupKey: predefined.rowGroupKey ?? assignment?.rowGroupKey,
          rowOrder: predefined.rowOrder ?? assignment?.displayOrder ?? index,
        });
      }
    }
    predefinedByVersion.set(version._id.toString(), rows);
  }

  const plans: RowPlan[] = objectives.map((objective) => {
    const predefined = objective.templateVersionId && objective.templateObjectiveKey
      ? predefinedByVersion.get(objective.templateVersionId.toString())?.get(objective.templateObjectiveKey)
      : undefined;
    if (objective.source === ObjectiveSource.PREDEFINED && objective.templateObjectiveKey) {
      const sectionKey = predefined?.sectionKey ?? 'objectives';
      return {
        objective,
        rowKey: objective.objectiveRowKey ||
          deterministicPredefinedObjectiveRowKey(sectionKey, objective.templateObjectiveKey),
        rowGroupKey: objective.rowGroupKey ?? predefined?.rowGroupKey,
        rowOrder: objective.rowOrder ?? predefined?.rowOrder,
      };
    }
    const correlation = objective.rowCreationCorrelationId || legacyCorrelation(objective);
    return {
      objective,
      rowKey: objective.objectiveRowKey ||
        deterministicDynamicObjectiveRowKey(String(objective.annualAssignmentId), correlation),
      rowGroupKey: objective.rowGroupKey,
      rowOrder: objective.rowOrder,
    };
  });

  const groups = new Map<string, RowPlan[]>();
  for (const plan of plans) {
    const key = `${plan.objective.annualAssignmentId}:${plan.rowKey}`;
    groups.set(key, [...(groups.get(key) ?? []), plan]);
  }

  const operations: any[] = [];
  const conflicts: Array<{ annualAssignmentId: string; rowKey: string; term: string }> = [];
  for (const groupPlans of groups.values()) {
    const seenTerms = new Set<string>();
    const duplicateTerm = groupPlans.find((plan) => {
      const term = String(plan.objective.assessmentTermCode);
      if (seenTerms.has(term)) return true;
      seenTerms.add(term);
      return false;
    });
    if (duplicateTerm) {
      conflicts.push({
        annualAssignmentId: String(duplicateTerm.objective.annualAssignmentId),
        rowKey: duplicateTerm.rowKey,
        term: String(duplicateTerm.objective.assessmentTermCode),
      });
      continue;
    }
    const coverage = normalizeObjectiveRowCoverage(
      groupPlans.map((plan) => plan.objective.assessmentTermCode as AssessmentTermCodeType),
    );
    for (const plan of groupPlans) {
      const set: Record<string, unknown> = {
        objectiveRowKey: plan.rowKey,
        rowOriginTermCode: coverage[0] ?? plan.objective.assessmentTermCode,
        rowCoverage: coverage,
      };
      if (plan.rowGroupKey !== undefined) set.rowGroupKey = plan.rowGroupKey;
      if (plan.rowOrder !== undefined) set.rowOrder = plan.rowOrder;
      operations.push({ updateOne: { filter: { _id: plan.objective._id }, update: { $set: set } } });
    }
  }

  if (apply && operations.length) {
    await Objective.bulkWrite(operations, { ordered: false });
  }
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    matchedObjectives: objectives.length,
    plannedUpdates: operations.length,
    conflictCount: conflicts.length,
    conflicts,
  }, null, 2));
}

run()
  .catch((error: unknown) => {
    console.error('Objective row identity migration failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
