import { FastifyInstance } from 'fastify';
import mongoose, { Types } from 'mongoose';
import {
  AnnualWorkflowState,
  isTermFinalized,
} from '../constants/pms.enums';

type CleanupMode = 'delete' | 'dry_run';

interface CleanupResult {
  collection: string;
  matchedCount: number;
  deletedCount: number;
  status: 'deleted' | 'dry_run' | 'not_found';
}

interface RelatedDataJob {
  collection: string;
  filter: Record<string, unknown>;
}

interface RelatedDataContext {
  cleanupSchema: 'term' | 'legacy_quarter';
  template: {
    id: string;
    name?: string;
    code?: string;
  };
  references: {
    templateVersionIds: string[];
    annualAssignmentIds: string[];
    termAssignmentIds: string[];
    relatedCycleIds: string[];
    directlyDeletedCycleIds: string[];
    objectiveIds: string[];
    termReviewIds: string[];
    annualDecisionIds: string[];
  };
  jobs: RelatedDataJob[];
}

interface RuntimeDataNaming {
  cleanupSchema: 'term' | 'legacy_quarter';
  annualAssignmentTermIdsField: 'termAssignmentIds' | 'quarterAssignmentIds';
  assignmentCollection: 'term_assignments' | 'quarter_assignments';
  assignmentIdField: 'termAssignmentId' | 'quarterAssignmentId';
  assignmentCycleIdField: 'cycleTermId' | 'cycleQuarterId';
  assignmentCodeField: 'assessmentTermCode' | 'quarterCode';
  cycleCollection: 'term_cycles' | 'quarter_cycles';
  cycleIdsField: 'termCycleIds' | 'quarterCycleIds';
  reviewCollection: 'term_reviews' | 'quarter_reviews';
  reviewValueCollection: 'term_review_values' | 'quarter_review_values';
}

class RouteError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
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

const normalizeJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const annualDecisionReadyOrLaterStates = new Set<string>([
  AnnualWorkflowState.ALL_TERMS_FINALIZED,
  AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT,
  AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED,
  AnnualWorkflowState.ANNUAL_FINALIZED,
  AnnualWorkflowState.VISIBILITY_ENABLED,
  AnnualWorkflowState.COMMUNICATION_READY,
  AnnualWorkflowState.COMMUNICATION_SENT,
  AnnualWorkflowState.CLOSED,
]);

const termRuntimeDataNaming: RuntimeDataNaming = {
  cleanupSchema: 'term',
  annualAssignmentTermIdsField: 'termAssignmentIds',
  assignmentCollection: 'term_assignments',
  assignmentIdField: 'termAssignmentId',
  assignmentCycleIdField: 'cycleTermId',
  assignmentCodeField: 'assessmentTermCode',
  cycleCollection: 'term_cycles',
  cycleIdsField: 'termCycleIds',
  reviewCollection: 'term_reviews',
  reviewValueCollection: 'term_review_values',
};

const legacyQuarterRuntimeDataNaming: RuntimeDataNaming = {
  cleanupSchema: 'legacy_quarter',
  annualAssignmentTermIdsField: 'quarterAssignmentIds',
  assignmentCollection: 'quarter_assignments',
  assignmentIdField: 'quarterAssignmentId',
  assignmentCycleIdField: 'cycleQuarterId',
  assignmentCodeField: 'quarterCode',
  cycleCollection: 'quarter_cycles',
  cycleIdsField: 'quarterCycleIds',
  reviewCollection: 'quarter_reviews',
  reviewValueCollection: 'quarter_review_values',
};

export async function publicPmsCleanupRoutes(fastify: FastifyInstance) {
  const getDb = () => {
    const db = mongoose.connection.db;

    if (!db) {
      throw new RouteError(503, 'MongoDB connection is not ready.');
    }

    return db;
  };

  const mergeJobs = (jobs: RelatedDataJob[]) => {
    const mergedJobs = jobs.reduce<Map<string, Record<string, unknown>[]>>((acc, job) => {
      const existing = acc.get(job.collection) || [];
      existing.push(job.filter);
      acc.set(job.collection, existing);
      return acc;
    }, new Map());

    return Array.from(mergedJobs.entries()).map(([collection, filters]) => ({
      collection,
      filter: filters.length === 1 ? filters[0] : { $or: filters },
    }));
  };

  const useLegacyQuarterData = (input: Record<string, unknown>) =>
    input.legacyQuarterData === true ||
    input.legacyQuarterData === 'true' ||
    input.cleanupSchema === 'legacy_quarter';

  const buildTemplateRelatedDataContext = async (
    templateId: string,
    naming: RuntimeDataNaming,
  ): Promise<RelatedDataContext> => {
    if (!Types.ObjectId.isValid(templateId)) {
      throw new RouteError(400, 'Valid templateId is required.');
    }

    const db = getDb();
    const templateObjectId = toObjectId(templateId);
    const template = await db
      .collection('pms_templates')
      .findOne({ _id: templateObjectId }, { projection: { _id: 1, name: 1, code: 1 } });

    if (!template) {
      throw new RouteError(404, `Template "${templateId}" was not found.`);
    }

    const templateVersions = await db
      .collection('pms_template_versions')
      .find({ templateId: templateObjectId }, { projection: { _id: 1 } })
      .toArray();

    const templateVersionIds = uniqueObjectIds(templateVersions.map((version) => version._id));

    if (!hasIds(templateVersionIds)) {
      throw new RouteError(404, `No template versions found for template "${templateId}".`, {
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
        {
          projection: {
            _id: 1,
            cycleId: 1,
            [naming.annualAssignmentTermIdsField]: 1,
          },
        },
      )
      .toArray();

    const annualAssignmentIds = uniqueObjectIds(annualAssignments.map((assignment) => assignment._id));
    const annualAssignmentCycleIds = uniqueObjectIds(annualAssignments.map((assignment) => assignment.cycleId));

    const termAssignmentFilters = [
      { templateVersionId: idIn(templateVersionIds) },
      ...(hasIds(annualAssignmentIds) ? [{ annualAssignmentId: idIn(annualAssignmentIds) }] : []),
    ];

    const termAssignments = await db
      .collection(naming.assignmentCollection)
      .find(
        { $or: termAssignmentFilters },
        {
          projection: {
            _id: 1,
            cycleId: 1,
            [naming.assignmentCycleIdField]: 1,
            annualAssignmentId: 1,
          },
        },
      )
      .toArray();

    const termAssignmentIds = uniqueObjectIds([
      ...termAssignments.map((assignment) => assignment._id),
      ...annualAssignments.flatMap(
        (assignment) => assignment[naming.annualAssignmentTermIdsField] || [],
      ),
    ]);
    const termCycleIds = uniqueObjectIds(
      termAssignments.map((assignment) => assignment[naming.assignmentCycleIdField]),
    );
    const termAssignmentCycleIds = uniqueObjectIds(termAssignments.map((assignment) => assignment.cycleId));
    const relatedCycleIds = uniqueObjectIds([...annualAssignmentCycleIds, ...termAssignmentCycleIds]);

    const directCycles = await db
      .collection('annual_cycles')
      .find(
        { templateVersionId: idIn(templateVersionIds) },
        { projection: { _id: 1, [naming.cycleIdsField]: 1 } },
      )
      .toArray();

    const directCycleIds = uniqueObjectIds(directCycles.map((cycle) => cycle._id));
    const directTermCycleIds = uniqueObjectIds([
      ...termCycleIds,
      ...directCycles.flatMap((cycle) => cycle[naming.cycleIdsField] || []),
    ]);

    const objectiveFilters = [
      { templateVersionId: idIn(templateVersionIds) },
      ...(hasIds(annualAssignmentIds) ? [{ annualAssignmentId: idIn(annualAssignmentIds) }] : []),
      ...(hasIds(termAssignmentIds) ? [{ [naming.assignmentIdField]: idIn(termAssignmentIds) }] : []),
    ];

    const objectives = await db
      .collection('objectives')
      .find({ $or: objectiveFilters }, { projection: { _id: 1 } })
      .toArray();
    const objectiveIds = uniqueObjectIds(objectives.map((objective) => objective._id));

    const termReviews = hasIds(termAssignmentIds)
      ? await db
          .collection(naming.reviewCollection)
          .find(
            {
              $or: [
                { [naming.assignmentIdField]: idIn(termAssignmentIds) },
                ...(hasIds(annualAssignmentIds) ? [{ annualAssignmentId: idIn(annualAssignmentIds) }] : []),
              ],
            },
            { projection: { _id: 1 } },
          )
          .toArray()
      : [];
    const termReviewIds = uniqueObjectIds(termReviews.map((review) => review._id));

    const annualDecisions = hasIds(annualAssignmentIds)
      ? await db
          .collection('annual_decisions')
          .find({ annualAssignmentId: idIn(annualAssignmentIds) }, { projection: { _id: 1 } })
          .toArray()
      : [];
    const annualDecisionIds = uniqueObjectIds(annualDecisions.map((decision) => decision._id));

    const entityIds = uniqueObjectIds([
      ...annualAssignmentIds,
      ...termAssignmentIds,
      ...objectiveIds,
      ...termReviewIds,
      ...annualDecisionIds,
    ]);

    const entityStringIds = toStringIds(entityIds);
    const annualAssignmentStringIds = toStringIds(annualAssignmentIds);

    const cleanupJobs: RelatedDataJob[] = [
      ...(hasIds(objectiveIds)
        ? [
            { collection: 'objective_attachments', filter: { objectiveId: idIn(objectiveIds) } },
            { collection: 'objective_evidence', filter: { objectiveId: idIn(objectiveIds) } },
            { collection: 'objective_comments', filter: { objectiveId: idIn(objectiveIds) } },
          ]
        : []),
      ...(hasIds(termAssignmentIds)
        ? [
            { collection: 'objective_values', filter: { [naming.assignmentIdField]: idIn(termAssignmentIds) } },
            { collection: 'employee_achievement_submissions', filter: { [naming.assignmentIdField]: idIn(termAssignmentIds) } },
            { collection: naming.reviewValueCollection, filter: { [naming.assignmentIdField]: idIn(termAssignmentIds) } },
            { collection: naming.reviewCollection, filter: { [naming.assignmentIdField]: idIn(termAssignmentIds) } },
            { collection: 'pms_documents', filter: { [naming.assignmentIdField]: idIn(termAssignmentIds) } },
          ]
        : []),
      ...(hasIds(annualAssignmentIds)
        ? [
            { collection: 'objective_values', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
            { collection: 'objective_comments', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
            { collection: 'objective_evidence', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
            { collection: 'employee_achievement_submissions', filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
            { collection: naming.reviewValueCollection, filter: { annualAssignmentId: idIn(annualAssignmentIds) } },
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
                  ...(hasIds(termAssignmentIds) ? [{ [naming.assignmentIdField]: idIn(termAssignmentIds) }] : []),
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
            { collection: naming.cycleCollection, filter: { cycleId: idIn(directCycleIds) } },
            { collection: 'annual_cycles', filter: { _id: idIn(directCycleIds) } },
          ]
        : []),
      ...(hasIds(directTermCycleIds)
        ? [{ collection: naming.cycleCollection, filter: { _id: idIn(directTermCycleIds) } }]
        : []),
      { collection: 'objectives', filter: { $or: objectiveFilters } },
      ...(hasIds(termAssignmentIds)
        ? [{ collection: naming.assignmentCollection, filter: { _id: idIn(termAssignmentIds) } }]
        : []),
      ...(hasIds(annualAssignmentIds)
        ? [{ collection: 'annual_assignments', filter: { _id: idIn(annualAssignmentIds) } }]
        : []),
      { collection: 'performance_history_snapshots', filter: { templateVersionId: idIn(templateVersionIds) } },
    ];

    return {
      cleanupSchema: naming.cleanupSchema,
      template: {
        id: template._id.toString(),
        name: template.name,
        code: template.code,
      },
      references: {
        templateVersionIds: toStringIds(templateVersionIds),
        annualAssignmentIds: toStringIds(annualAssignmentIds),
        termAssignmentIds: toStringIds(termAssignmentIds),
        relatedCycleIds: toStringIds(relatedCycleIds),
        directlyDeletedCycleIds: toStringIds(directCycleIds),
        objectiveIds: toStringIds(objectiveIds),
        termReviewIds: toStringIds(termReviewIds),
        annualDecisionIds: toStringIds(annualDecisionIds),
      },
      jobs: mergeJobs(cleanupJobs),
    };
  };

  const runCollectionCleanup = async (
    collectionName: string,
    filter: Record<string, unknown>,
    mode: CleanupMode,
  ): Promise<CleanupResult> => {
    const db = getDb();

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

  const getCollectionRelatedData = async (collectionName: string, filter: Record<string, unknown>) => {
    const db = getDb();
    const exists = await db.listCollections({ name: collectionName }).hasNext();

    if (!exists) {
      return {
        collection: collectionName,
        matchedCount: 0,
        status: 'not_found',
        data: [],
      };
    }

    const collection = db.collection(collectionName);
    const data = await collection.find(filter).toArray();

    return {
      collection: collectionName,
      matchedCount: data.length,
      status: 'found',
      data: normalizeJson(data),
    };
  };

  const optionalObjectId = (value?: unknown, fieldName = 'id') => {
    if (!value) return undefined;

    if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
      throw new RouteError(400, `Valid ${fieldName} is required.`);
    }

    return toObjectId(value);
  };

  const resolveTemplateVersionScope = async (templateId?: unknown) => {
    const db = getDb();
    const templateObjectId = optionalObjectId(templateId, 'templateId');

    if (!templateObjectId) return undefined;

    const versions = await db
      .collection('pms_template_versions')
      .find({ templateId: templateObjectId }, { projection: { _id: 1 } })
      .toArray();

    return uniqueObjectIds(versions.map((version) => version._id));
  };

  const buildAnnualAssignmentVerificationFilter = async (input: {
    cycleId?: unknown;
    annualAssignmentId?: unknown;
    termAssignmentId?: unknown;
    templateId?: unknown;
  }) => {
    const db = getDb();
    const cycleId = optionalObjectId(input.cycleId, 'cycleId');
    const annualAssignmentId = optionalObjectId(
      input.annualAssignmentId,
      'annualAssignmentId',
    );
    const termAssignmentId = optionalObjectId(
      input.termAssignmentId,
      'termAssignmentId',
    );
    const templateVersionIds = await resolveTemplateVersionScope(input.templateId);
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (cycleId) filter.cycleId = cycleId;
    if (annualAssignmentId) filter._id = annualAssignmentId;
    if (termAssignmentId) {
      const termAssignment = await db
        .collection('term_assignments')
        .findOne(
          { _id: termAssignmentId },
          { projection: { annualAssignmentId: 1 } },
        );

      if (!termAssignment?.annualAssignmentId) {
        throw new RouteError(
          404,
          `Term assignment "${termAssignmentId.toString()}" was not found.`,
        );
      }

      if (
        annualAssignmentId &&
        termAssignment.annualAssignmentId.toString() !== annualAssignmentId.toString()
      ) {
        throw new RouteError(
          400,
          'annualAssignmentId does not match the provided termAssignmentId.',
        );
      }

      filter._id = termAssignment.annualAssignmentId;
    }
    if (templateVersionIds) {
      filter.templateVersionId = idIn(templateVersionIds);
    }

    return filter;
  };

  const verifyTermFlowAssignments = async (input: {
    cycleId?: unknown;
    annualAssignmentId?: unknown;
    termAssignmentId?: unknown;
    templateId?: unknown;
    limit?: unknown;
  }) => {
    const db = getDb();
    const filter = await buildAnnualAssignmentVerificationFilter(input);
    const parsedLimit = Number(input.limit || 200);
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 500))
      : 200;

    const annualAssignments = await db
      .collection('annual_assignments')
      .find(filter)
      .limit(limit)
      .toArray();

    const assignments = [];

    for (const annualAssignment of annualAssignments) {
      const annualAssignmentId = annualAssignment._id as Types.ObjectId;
      const applicableTerms = Array.isArray(annualAssignment.applicableTerms)
        ? annualAssignment.applicableTerms.filter(Boolean)
        : [];
      const termAssignments = await db
        .collection('term_assignments')
        .find({
          annualAssignmentId,
          isDeleted: { $ne: true },
          ...(applicableTerms.length > 0
            ? { assessmentTermCode: { $in: applicableTerms } }
            : {}),
        })
        .sort({ assessmentTermCode: 1 })
        .toArray();

      const termRecords = termAssignments.map((assignment) => ({
        termAssignmentId: assignment._id?.toString(),
        termCode: assignment.termCode || assignment.assessmentTermCode,
        state: assignment.termState,
        finalized: isTermFinalized(assignment.termState),
        managerId: assignment.assignedManagerId?.toString(),
        updatedAt: assignment.updatedAt,
      }));

      const termsToCheck =
        applicableTerms.length > 0
          ? applicableTerms
          : termRecords.map((record) => record.termCode).filter(Boolean);
      const foundTerms = new Set(termRecords.map((record) => record.termCode));
      const missingTerms = termsToCheck.filter((term) => !foundTerms.has(term));
      const nonFinalizedTerms = termRecords.filter((record) => !record.finalized);
      const allTermsFinalized =
        termsToCheck.length > 0 &&
        missingTerms.length === 0 &&
        nonFinalizedTerms.length === 0;
      const annualState = annualAssignment.annualState;
      const annualReadyOrLater = annualDecisionReadyOrLaterStates.has(String(annualState));
      const issues = [];

      if (allTermsFinalized && !annualReadyOrLater) {
        issues.push(
          'All applicable terms are finalized, but annual assignment is not rolled to All Terms Finalized or later.',
        );
      }

      if (!allTermsFinalized && annualReadyOrLater) {
        issues.push(
          'Annual assignment is marked ready/finalized even though one or more applicable terms are not finalized.',
        );
      }

      if (missingTerms.length > 0) {
        issues.push(`Missing term assignment records: ${missingTerms.join(', ')}`);
      }

      assignments.push({
        annualAssignmentId: annualAssignmentId.toString(),
        cycleId: annualAssignment.cycleId?.toString(),
        employeeId: annualAssignment.employeeId?.toString(),
        managerId: annualAssignment.assignedManagerId?.toString(),
        annualState,
        finalDecisionStatus: annualAssignment.finalDecisionStatus,
        applicableTerms: termsToCheck,
        termRecords,
        summary: {
          termCount: termsToCheck.length,
          finalizedTerms: termRecords.filter((record) => record.finalized).length,
          missingTerms: missingTerms.length,
          nonFinalizedTerms: nonFinalizedTerms.length,
          allTermsFinalized,
          annualReadyOrLater,
        },
        issues,
      });
    }

    return assignments;
  };

  const sendRouteError = (reply: any, error: any) => {
    if (error instanceof RouteError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        ...(error.details || {}),
      });
    }

    return reply.code(500).send({
      success: false,
      error: error.message || 'Internal Server Error',
    });
  };

  const readTemplateRelatedData = async (request: any, reply: any) => {
    try {
      const { templateId } = request.params as { templateId: string };
      const query = (request.query || {}) as Record<string, unknown>;
      const naming = useLegacyQuarterData(query)
        ? legacyQuarterRuntimeDataNaming
        : termRuntimeDataNaming;
      const context = await buildTemplateRelatedDataContext(templateId, naming);
      const collections = [];

      for (const job of context.jobs) {
        collections.push(await getCollectionRelatedData(job.collection, job.filter));
      }

      const totalMatched = collections.reduce((sum, result) => sum + result.matchedCount, 0);

      return reply.send({
        success: true,
        mode: 'read',
        message: `${totalMatched} related records found.`,
        cleanupSchema: context.cleanupSchema,
        template: context.template,
        references: context.references,
        summary: {
          collectionsChecked: collections.length,
          matchedRecords: totalMatched,
        },
        results: collections.map(({ data, ...result }) => result),
        data: collections.reduce<Record<string, unknown[]>>((acc, result) => {
          acc[result.collection] = result.data;
          return acc;
        }, {}),
      });
    } catch (error: any) {
      request.log.error({ error }, 'Failed to fetch PMS template related data');
      return sendRouteError(reply, error);
    }
  };

  const parseTermFlowRequestInput = (request: any) => ({
    ...((request.query || {}) as Record<string, unknown>),
    ...((request.body || {}) as Record<string, unknown>),
  });

  const verifyTermFlow = async (request: any, reply: any) => {
    try {
      const input = parseTermFlowRequestInput(request);
      const assignments = await verifyTermFlowAssignments(input);
      const assignmentsWithIssues = assignments.filter(
        (assignment) => assignment.issues.length > 0,
      );

      return reply.send({
        success: true,
        mode: 'term_flow_verification',
        message:
          assignmentsWithIssues.length === 0
            ? 'Term flow verification passed.'
            : 'Term flow verification completed with items to review.',
        summary: {
          assignmentsChecked: assignments.length,
          assignmentsWithIssues: assignmentsWithIssues.length,
        },
        assignments,
      });
    } catch (error: any) {
      request.log.error({ error }, 'Failed to verify PMS term flow data');
      return sendRouteError(reply, error);
    }
  };

  fastify.get('/term-flow/verify', verifyTermFlow);
  fastify.post('/term-flow/verify', verifyTermFlow);

  fastify.get('/templates/:templateId', readTemplateRelatedData);
  fastify.get('/templates/:templateId/related-data', readTemplateRelatedData);

  fastify.delete('/templates/:templateId/related-data', async (request, reply) => {
    try {
      const { templateId } = request.params as { templateId: string };
      const query = request.query as { dryRun?: string | boolean };
      const naming = useLegacyQuarterData(query as Record<string, unknown>)
        ? legacyQuarterRuntimeDataNaming
        : termRuntimeDataNaming;
      const mode: CleanupMode =
        query.dryRun === true || query.dryRun === 'true' ? 'dry_run' : 'delete';
      const context = await buildTemplateRelatedDataContext(templateId, naming);

      const results: CleanupResult[] = [];

      for (const job of context.jobs) {
        results.push(await runCollectionCleanup(job.collection, job.filter, mode));
      }

      const totalMatched = results.reduce((sum, result) => sum + result.matchedCount, 0);
      const totalDeleted = results.reduce((sum, result) => sum + result.deletedCount, 0);

      return reply.send({
        success: true,
        mode,
        cleanupSchema: context.cleanupSchema,
        message:
          mode === 'dry_run'
            ? `Dry run completed. ${totalMatched} related records matched.`
            : `Template related runtime data cleanup completed. ${totalDeleted} records deleted.`,
        template: context.template,
        references: context.references,
        summary: {
          collectionsChecked: results.length,
          matchedRecords: totalMatched,
          deletedRecords: totalDeleted,
        },
        results,
      });
    } catch (error: any) {
      request.log.error({ error }, 'Failed to cleanup PMS template related data');
      return sendRouteError(reply, error);
    }
  });
}
