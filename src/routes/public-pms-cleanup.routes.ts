import { FastifyInstance } from 'fastify';
import mongoose, { Types } from 'mongoose';
import {
  AnnualWorkflowState,
  QuarterWorkflowState,
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
  template: {
    id: string;
    name?: string;
    code?: string;
  };
  references: {
    templateVersionIds: string[];
    annualAssignmentIds: string[];
    quarterAssignmentIds: string[];
    relatedCycleIds: string[];
    directlyDeletedCycleIds: string[];
    objectiveIds: string[];
    quarterReviewIds: string[];
    annualDecisionIds: string[];
  };
  jobs: RelatedDataJob[];
}

interface TermFlowCleanupResult {
  collection: string;
  field: string;
  from: string;
  to: string;
  matchedCount: number;
  modifiedCount: number;
  status: 'updated' | 'dry_run' | 'not_found';
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

const termFlowEnumReplacements = [
  {
    collection: 'quarter_assignments',
    fields: ['quarterState', 'previousQuarterState'],
    replacements: {
      QUARTER_FINALIZED: QuarterWorkflowState.TERM_FINALIZED,
    },
  },
  {
    collection: 'quarter_cycles',
    fields: ['status'],
    replacements: {
      QUARTER_FINALIZED: QuarterWorkflowState.TERM_FINALIZED,
    },
  },
  {
    collection: 'annual_assignments',
    fields: ['annualState'],
    replacements: {
      ALL_QUARTERS_FINALIZED: AnnualWorkflowState.ALL_TERMS_FINALIZED,
    },
  },
  {
    collection: 'annual_cycles',
    fields: ['status'],
    replacements: {
      ALL_QUARTERS_FINALIZED: AnnualWorkflowState.ALL_TERMS_FINALIZED,
    },
  },
  {
    collection: 'workflow_events',
    fields: ['fromState', 'toState'],
    replacements: {
      QUARTER_FINALIZED: QuarterWorkflowState.TERM_FINALIZED,
      ALL_QUARTERS_FINALIZED: AnnualWorkflowState.ALL_TERMS_FINALIZED,
    },
  },
  {
    collection: 'audit_logs',
    fields: ['action'],
    replacements: {
      PMS_QUARTER_FINALIZED: 'PMS_TERM_FINALIZED',
      PMS_ANNUAL_ASSIGNMENT_ALL_QUARTERS_FINALIZED:
        'PMS_ANNUAL_ASSIGNMENT_ALL_TERMS_FINALIZED',
    },
  },
] as const;

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

  const buildTemplateRelatedDataContext = async (templateId: string): Promise<RelatedDataContext> => {
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

    const cleanupJobs: RelatedDataJob[] = [
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

    return {
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

  const buildTermFlowScope = async (input: {
    cycleId?: unknown;
    annualAssignmentId?: unknown;
    quarterAssignmentId?: unknown;
    templateId?: unknown;
  }) => {
    const cycleId = optionalObjectId(input.cycleId, 'cycleId');
    const annualAssignmentId = optionalObjectId(
      input.annualAssignmentId,
      'annualAssignmentId',
    );
    const quarterAssignmentId = optionalObjectId(
      input.quarterAssignmentId,
      'quarterAssignmentId',
    );
    const templateVersionIds = await resolveTemplateVersionScope(input.templateId);

    return {
      cycleId,
      annualAssignmentId,
      quarterAssignmentId,
      templateVersionIds,
    };
  };

  const buildCollectionScopeFilter = (
    collectionName: string,
    scope: Awaited<ReturnType<typeof buildTermFlowScope>>,
  ) => {
    const filter: Record<string, unknown> = {};

    if (scope.cycleId) {
      if (collectionName === 'annual_cycles') {
        filter._id = scope.cycleId;
      } else {
        filter.cycleId = scope.cycleId;
      }
    }

    if (scope.annualAssignmentId) {
      if (collectionName === 'annual_assignments') {
        filter._id = scope.annualAssignmentId;
      } else {
        filter.annualAssignmentId = scope.annualAssignmentId;
      }
    }

    if (scope.quarterAssignmentId) {
      if (collectionName === 'quarter_assignments') {
        filter._id = scope.quarterAssignmentId;
      } else {
        filter.quarterAssignmentId = scope.quarterAssignmentId;
      }
    }

    if (scope.templateVersionIds) {
      filter.templateVersionId = idIn(scope.templateVersionIds);
    }

    return filter;
  };

  const runTermFlowEnumCleanup = async (
    scope: Awaited<ReturnType<typeof buildTermFlowScope>>,
    dryRun: boolean,
  ) => {
    const db = getDb();
    const results: TermFlowCleanupResult[] = [];

    for (const config of termFlowEnumReplacements) {
      const exists = await db.listCollections({ name: config.collection }).hasNext();

      if (!exists) {
        for (const field of config.fields) {
          for (const [from, to] of Object.entries(config.replacements)) {
            results.push({
              collection: config.collection,
              field,
              from,
              to,
              matchedCount: 0,
              modifiedCount: 0,
              status: 'not_found',
            });
          }
        }
        continue;
      }

      const collection = db.collection(config.collection);

      for (const field of config.fields) {
        for (const [from, to] of Object.entries(config.replacements)) {
          const filter = {
            ...buildCollectionScopeFilter(config.collection, scope),
            [field]: from,
          };
          const matchedCount = await collection.countDocuments(filter);
          let modifiedCount = 0;

          if (!dryRun && matchedCount > 0) {
            const updateResult = await collection.updateMany(filter, {
              $set: { [field]: to },
            });
            modifiedCount = updateResult.modifiedCount || 0;
          }

          results.push({
            collection: config.collection,
            field,
            from,
            to,
            matchedCount,
            modifiedCount,
            status: dryRun ? 'dry_run' : 'updated',
          });
        }
      }
    }

    return results;
  };

  const buildAnnualAssignmentVerificationFilter = async (input: {
    cycleId?: unknown;
    annualAssignmentId?: unknown;
    quarterAssignmentId?: unknown;
    templateId?: unknown;
  }) => {
    const db = getDb();
    const cycleId = optionalObjectId(input.cycleId, 'cycleId');
    const annualAssignmentId = optionalObjectId(
      input.annualAssignmentId,
      'annualAssignmentId',
    );
    const quarterAssignmentId = optionalObjectId(
      input.quarterAssignmentId,
      'quarterAssignmentId',
    );
    const templateVersionIds = await resolveTemplateVersionScope(input.templateId);
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (cycleId) filter.cycleId = cycleId;
    if (annualAssignmentId) filter._id = annualAssignmentId;
    if (quarterAssignmentId) {
      const quarterAssignment = await db
        .collection('quarter_assignments')
        .findOne(
          { _id: quarterAssignmentId },
          { projection: { annualAssignmentId: 1 } },
        );

      if (!quarterAssignment?.annualAssignmentId) {
        throw new RouteError(
          404,
          `Quarter assignment "${quarterAssignmentId.toString()}" was not found.`,
        );
      }

      if (
        annualAssignmentId &&
        quarterAssignment.annualAssignmentId.toString() !== annualAssignmentId.toString()
      ) {
        throw new RouteError(
          400,
          'annualAssignmentId does not match the provided quarterAssignmentId.',
        );
      }

      filter._id = quarterAssignment.annualAssignmentId;
    }
    if (templateVersionIds) {
      filter.templateVersionId = idIn(templateVersionIds);
    }

    return filter;
  };

  const verifyTermFlowAssignments = async (input: {
    cycleId?: unknown;
    annualAssignmentId?: unknown;
    quarterAssignmentId?: unknown;
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
      const applicableTerms = Array.isArray(annualAssignment.applicableQuarters)
        ? annualAssignment.applicableQuarters.filter(Boolean)
        : [];
      const quarterAssignments = await db
        .collection('quarter_assignments')
        .find({
          annualAssignmentId,
          isDeleted: { $ne: true },
          ...(applicableTerms.length > 0
            ? { quarterCode: { $in: applicableTerms } }
            : {}),
        })
        .sort({ quarterCode: 1 })
        .toArray();

      const termRecords = quarterAssignments.map((assignment) => ({
        quarterAssignmentId: assignment._id?.toString(),
        termCode: assignment.termCode || assignment.quarterCode,
        state: assignment.quarterState,
        finalized: isTermFinalized(assignment.quarterState),
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

  const countLegacyTermFlowEnums = async (
    scope: Awaited<ReturnType<typeof buildTermFlowScope>>,
  ) => {
    const results = await runTermFlowEnumCleanup(scope, true);
    return results.filter((result) => result.matchedCount > 0);
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
      const context = await buildTemplateRelatedDataContext(templateId);
      const collections = [];

      for (const job of context.jobs) {
        collections.push(await getCollectionRelatedData(job.collection, job.filter));
      }

      const totalMatched = collections.reduce((sum, result) => sum + result.matchedCount, 0);

      return reply.send({
        success: true,
        mode: 'read',
        message: `${totalMatched} related records found.`,
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
      const scope = await buildTermFlowScope(input);
      const assignments = await verifyTermFlowAssignments(input);
      const legacyEnums = await countLegacyTermFlowEnums(scope);
      const assignmentsWithIssues = assignments.filter(
        (assignment) => assignment.issues.length > 0,
      );

      return reply.send({
        success: true,
        mode: 'term_flow_verification',
        message:
          assignmentsWithIssues.length === 0 && legacyEnums.length === 0
            ? 'Term flow verification passed.'
            : 'Term flow verification completed with items to review.',
        summary: {
          assignmentsChecked: assignments.length,
          assignmentsWithIssues: assignmentsWithIssues.length,
          legacyEnumMatches: legacyEnums.reduce(
            (sum, result) => sum + result.matchedCount,
            0,
          ),
        },
        legacyEnums,
        assignments,
      });
    } catch (error: any) {
      request.log.error({ error }, 'Failed to verify PMS term flow data');
      return sendRouteError(reply, error);
    }
  };

  const cleanupTermFlowEnums = async (request: any, reply: any) => {
    try {
      const input = parseTermFlowRequestInput(request);
      const dryRun = input.dryRun !== false && input.dryRun !== 'false';
      const scope = await buildTermFlowScope(input);
      const results = await runTermFlowEnumCleanup(scope, dryRun);
      const totalMatched = results.reduce((sum, result) => sum + result.matchedCount, 0);
      const totalModified = results.reduce((sum, result) => sum + result.modifiedCount, 0);

      return reply.send({
        success: true,
        mode: dryRun ? 'dry_run' : 'update',
        message: dryRun
          ? `Dry run completed. ${totalMatched} legacy enum values matched.`
          : `Term-flow enum cleanup completed. ${totalModified} values updated.`,
        summary: {
          checks: results.length,
          matchedValues: totalMatched,
          modifiedValues: totalModified,
        },
        results,
      });
    } catch (error: any) {
      request.log.error({ error }, 'Failed to cleanup PMS term flow enum data');
      return sendRouteError(reply, error);
    }
  };

  fastify.get('/term-flow/verify', verifyTermFlow);
  fastify.post('/term-flow/verify', verifyTermFlow);
  fastify.get('/term-flow/enum-cleanup', cleanupTermFlowEnums);
  fastify.post('/term-flow/enum-cleanup', cleanupTermFlowEnums);

  fastify.get('/templates/:templateId', readTemplateRelatedData);
  fastify.get('/templates/:templateId/related-data', readTemplateRelatedData);

  fastify.delete('/templates/:templateId/related-data', async (request, reply) => {
    try {
      const { templateId } = request.params as { templateId: string };
      const query = request.query as { dryRun?: string | boolean };
      const mode: CleanupMode =
        query.dryRun === true || query.dryRun === 'true' ? 'dry_run' : 'delete';
      const context = await buildTemplateRelatedDataContext(templateId);

      const results: CleanupResult[] = [];

      for (const job of context.jobs) {
        results.push(await runCollectionCleanup(job.collection, job.filter, mode));
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
