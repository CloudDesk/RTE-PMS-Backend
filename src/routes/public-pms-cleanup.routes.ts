import { FastifyInstance } from 'fastify';
import mongoose, { Types } from 'mongoose';

type CleanupMode = 'delete' | 'dry_run';

interface CleanupResult {
  collection: string;
  matchedCount: number;
  deletedCount: number;
  status: 'deleted' | 'dry_run' | 'not_found';
}

const toObjectId = (value: string) => new Types.ObjectId(value);

const toStringIds = (ids: Types.ObjectId[]) => ids.map((id) => id.toString());

const uniqueObjectIds = (values: unknown[]): Types.ObjectId[] => {
  const seen = new Set<string>();
  const result: Types.ObjectId[] = [];

  for (const value of values) {
    if (!value) continue;

    const id = value instanceof Types.ObjectId ? value : new Types.ObjectId(String(value));
    const key = id.toString();

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(id);
  }

  return result;
};

const hasIds = (ids: Types.ObjectId[]) => ids.length > 0;

const idIn = (ids: Types.ObjectId[]) => ({ $in: ids });

export async function publicPmsCleanupRoutes(fastify: FastifyInstance) {
  const runCollectionCleanup = async (
    collectionName: string,
    filter: Record<string, unknown>,
    mode: CleanupMode,
  ): Promise<CleanupResult> => {
    const db = mongoose.connection.db;

    if (!db) {
      throw new Error('MongoDB connection is not ready.');
    }

    const exists = await db.listCollections({ name: collectionName }).hasNext();

    if (!exists) {
      return {
        collection: collectionName,
        matchedCount: 0,
        deletedCount: 0,
        status: 'not_found',
      };
    }

    const collection = db.collection(collectionName);
    const matchedCount = await collection.countDocuments(filter);

    if (mode === 'dry_run') {
      return {
        collection: collectionName,
        matchedCount,
        deletedCount: 0,
        status: 'dry_run',
      };
    }

    const deleteResult = await collection.deleteMany(filter);

    return {
      collection: collectionName,
      matchedCount,
      deletedCount: deleteResult.deletedCount || 0,
      status: 'deleted',
    };
  };

  fastify.delete('/templates/:templateId/related-data', async (request, reply) => {
    try {
      const { templateId } = request.params as { templateId: string };
      const query = request.query as { dryRun?: string | boolean };
      const mode: CleanupMode =
        query.dryRun === true || query.dryRun === 'true' ? 'dry_run' : 'delete';

      if (!Types.ObjectId.isValid(templateId)) {
        return reply.code(400).send({
          success: false,
          error: 'Valid templateId is required.',
        });
      }

      const db = mongoose.connection.db;

      if (!db) {
        return reply.code(503).send({
          success: false,
          error: 'MongoDB connection is not ready.',
        });
      }

      const templateObjectId = toObjectId(templateId);
      const template = await db
        .collection('pms_templates')
        .findOne({ _id: templateObjectId }, { projection: { _id: 1, name: 1, code: 1 } });

      if (!template) {
        return reply.code(404).send({
          success: false,
          error: `Template "${templateId}" was not found.`,
        });
      }

      const templateVersions = await db
        .collection('pms_template_versions')
        .find({ templateId: templateObjectId }, { projection: { _id: 1 } })
        .toArray();

      const templateVersionIds = uniqueObjectIds(templateVersions.map((version) => version._id));

      if (!hasIds(templateVersionIds)) {
        return reply.code(404).send({
          success: false,
          error: `No template versions found for template "${templateId}".`,
          template: {
            id: template._id.toString(),
            name: template.name,
            code: template.code,
          },
        });
      }

      const annualAssignments = await db
        .collection('annual_assignments')
        .find(
          { templateVersionId: idIn(templateVersionIds) },
          { projection: { _id: 1, cycleId: 1, quarterAssignmentIds: 1 } },
        )
        .toArray();

      const annualAssignmentIds = uniqueObjectIds(annualAssignments.map((assignment) => assignment._id));
      const annualAssignmentCycleIds = uniqueObjectIds(annualAssignments.map((assignment) => assignment.cycleId));

      const quarterAssignmentFilters = [
        { templateVersionId: idIn(templateVersionIds) },
        ...(hasIds(annualAssignmentIds) ? [{ annualAssignmentId: idIn(annualAssignmentIds) }] : []),
      ];

      const quarterAssignments = await db
        .collection('quarter_assignments')
        .find(
          { $or: quarterAssignmentFilters },
          { projection: { _id: 1, cycleId: 1, cycleQuarterId: 1, annualAssignmentId: 1 } },
        )
        .toArray();

      const quarterAssignmentIds = uniqueObjectIds([
        ...quarterAssignments.map((assignment) => assignment._id),
        ...annualAssignments.flatMap((assignment) => assignment.quarterAssignmentIds || []),
      ]);
      const quarterCycleIds = uniqueObjectIds(quarterAssignments.map((assignment) => assignment.cycleQuarterId));
      const quarterAssignmentCycleIds = uniqueObjectIds(quarterAssignments.map((assignment) => assignment.cycleId));
      const relatedCycleIds = uniqueObjectIds([...annualAssignmentCycleIds, ...quarterAssignmentCycleIds]);

      const directCycles = await db
        .collection('annual_cycles')
        .find(
          { templateVersionId: idIn(templateVersionIds) },
          { projection: { _id: 1, quarterCycleIds: 1 } },
        )
        .toArray();

      const directCycleIds = uniqueObjectIds(directCycles.map((cycle) => cycle._id));
      const directQuarterCycleIds = uniqueObjectIds([
        ...quarterCycleIds,
        ...directCycles.flatMap((cycle) => cycle.quarterCycleIds || []),
      ]);

      const objectiveFilters = [
        { templateVersionId: idIn(templateVersionIds) },
        ...(hasIds(annualAssignmentIds) ? [{ annualAssignmentId: idIn(annualAssignmentIds) }] : []),
        ...(hasIds(quarterAssignmentIds) ? [{ quarterAssignmentId: idIn(quarterAssignmentIds) }] : []),
      ];

      const objectives = await db
        .collection('objectives')
        .find({ $or: objectiveFilters }, { projection: { _id: 1 } })
        .toArray();
      const objectiveIds = uniqueObjectIds(objectives.map((objective) => objective._id));

      const quarterReviews = hasIds(quarterAssignmentIds)
        ? await db
            .collection('quarter_reviews')
            .find(
              {
                $or: [
                  { quarterAssignmentId: idIn(quarterAssignmentIds) },
                  ...(hasIds(annualAssignmentIds) ? [{ annualAssignmentId: idIn(annualAssignmentIds) }] : []),
                ],
              },
              { projection: { _id: 1 } },
            )
            .toArray()
        : [];
      const quarterReviewIds = uniqueObjectIds(quarterReviews.map((review) => review._id));

      const annualDecisions = hasIds(annualAssignmentIds)
        ? await db
            .collection('annual_decisions')
            .find({ annualAssignmentId: idIn(annualAssignmentIds) }, { projection: { _id: 1 } })
            .toArray()
        : [];
      const annualDecisionIds = uniqueObjectIds(annualDecisions.map((decision) => decision._id));

      const entityIds = uniqueObjectIds([
        ...annualAssignmentIds,
        ...quarterAssignmentIds,
        ...objectiveIds,
        ...quarterReviewIds,
        ...annualDecisionIds,
      ]);

      const entityStringIds = toStringIds(entityIds);
      const annualAssignmentStringIds = toStringIds(annualAssignmentIds);

      const cleanupJobs: Array<{ collection: string; filter: Record<string, unknown> }> = [
        ...(hasIds(objectiveIds)
          ? [
              { collection: 'objective_attachments', filter: { objectiveId: idIn(objectiveIds) } },
              { collection: 'objective_evidence', filter: { objectiveId: idIn(objectiveIds) } },
              { collection: 'objective_comments', filter: { objectiveId: idIn(objectiveIds) } },
            ]
          : []),
        ...(hasIds(quarterAssignmentIds)
          ? [
              { collection: 'objective_values', filter: { quarterAssignmentId: idIn(quarterAssignmentIds) } },
              { collection: 'employee_achievement_submissions', filter: { quarterAssignmentId: idIn(quarterAssignmentIds) } },
              { collection: 'quarter_review_values', filter: { quarterAssignmentId: idIn(quarterAssignmentIds) } },
              { collection: 'quarter_reviews', filter: { quarterAssignmentId: idIn(quarterAssignmentIds) } },
              { collection: 'pms_documents', filter: { quarterAssignmentId: idIn(quarterAssignmentIds) } },
            ]
          : []),
        ...(hasIds(annualAssignmentIds)
          ? [
              { collection: 'objective_values', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'objective_comments', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'objective_evidence', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'employee_achievement_submissions', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'quarter_review_values', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'annual_decision_values', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'annual_decisions', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'visibility_configurations', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'communication_dispatches', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'performance_history_snapshots', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'reassignments', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
              { collection: 'pms_documents', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
            ]
          : []),
        ...(hasIds(annualDecisionIds)
          ? [{ collection: 'annual_decision_values', filter: { annualDecisionId: idIn(annualDecisionIds) } }]
          : []),
        ...(hasIds(entityIds)
          ? [
              {
                collection: 'workflow_events',
                filter: {
                  $or: [
                    { entityId: idIn(entityIds) },
                    ...(hasIds(annualAssignmentIds) ? [{ annualAssignmentId: idIn(annualAssignmentIds) }] : []),
                    ...(hasIds(quarterAssignmentIds) ? [{ quarterAssignmentId: idIn(quarterAssignmentIds) }] : []),
                  ],
                },
              },
              {
                collection: 'audit_logs',
                filter: {
                  $or: [
                    { entityId: idIn(entityIds) },
                    { entityId: { $in: entityStringIds } },
                    ...(annualAssignmentStringIds.length > 0
                      ? [{ assignmentId: { $in: annualAssignmentStringIds } }]
                      : []),
                  ],
                },
              },
              { collection: 'sla_events', filter: { entityId: idIn(entityIds) } },
              { collection: 'notification_events', filter: { entityId: idIn(entityIds) } },
            ]
          : []),
        ...(hasIds(directCycleIds)
          ? [
              { collection: 'sla_events', filter: { cycleId: idIn(directCycleIds) } },
              { collection: 'notification_events', filter: { cycleId: idIn(directCycleIds) } },
              { collection: 'assignment_exception_queue', filter: { cycleId: idIn(directCycleIds) } },
              { collection: 'delegations', filter: { cycleId: idIn(directCycleIds) } },
              { collection: 'quarter_cycles', filter: { cycleId: idIn(directCycleIds) } },
              { collection: 'annual_cycles', filter: { _id: idIn(directCycleIds) } },
            ]
          : []),
        ...(hasIds(directQuarterCycleIds)
          ? [{ collection: 'quarter_cycles', filter: { _id: idIn(directQuarterCycleIds) } }]
          : []),
        { collection: 'objectives', filter: { $or: objectiveFilters } },
        ...(hasIds(quarterAssignmentIds)
          ? [{ collection: 'quarter_assignments', filter: { _id: idIn(quarterAssignmentIds) } }]
          : []),
        ...(hasIds(annualAssignmentIds)
          ? [{ collection: 'annual_assignments', filter: { _id: idIn(annualAssignmentIds) } }]
          : []),
        { collection: 'performance_history_snapshots', filter: { templateVersionId: idIn(templateVersionIds) } },
      ];

      const mergedJobs = cleanupJobs.reduce<Map<string, Record<string, unknown>[]>>((acc, job) => {
        const existing = acc.get(job.collection) || [];
        existing.push(job.filter);
        acc.set(job.collection, existing);
        return acc;
      }, new Map());

      const results: CleanupResult[] = [];

      for (const [collection, filters] of mergedJobs.entries()) {
        const filter = filters.length === 1 ? filters[0] : { $or: filters };
        results.push(await runCollectionCleanup(collection, filter, mode));
      }

      const totalMatched = results.reduce((sum, result) => sum + result.matchedCount, 0);
      const totalDeleted = results.reduce((sum, result) => sum + result.deletedCount, 0);

      return reply.send({
        success: true,
        mode,
        message:
          mode === 'dry_run'
            ? `Dry run completed. ${totalMatched} related records matched.`
            : `Template related runtime data cleanup completed. ${totalDeleted} records deleted.`,
        template: {
          id: template._id.toString(),
          name: template.name,
          code: template.code,
        },
        references: {
          templateVersionIds: toStringIds(templateVersionIds),
          annualAssignmentIds: toStringIds(annualAssignmentIds),
          quarterAssignmentIds: toStringIds(quarterAssignmentIds),
          relatedCycleIds: toStringIds(relatedCycleIds),
          directlyDeletedCycleIds: toStringIds(directCycleIds),
          objectiveIds: toStringIds(objectiveIds),
          quarterReviewIds: toStringIds(quarterReviewIds),
          annualDecisionIds: toStringIds(annualDecisionIds),
        },
        summary: {
          collectionsChecked: results.length,
          matchedRecords: totalMatched,
          deletedRecords: totalDeleted,
        },
        results,
      });
    } catch (error: any) {
      request.log.error({ error }, 'Failed to cleanup PMS template related data');
      return reply.code(500).send({
        success: false,
        error: error.message || 'Internal Server Error',
      });
    }
  });
}
