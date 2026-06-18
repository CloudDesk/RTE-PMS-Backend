import { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.routes";
import { userRoutes } from "./user.routes";
import { lovRoutes } from "./lov.routes";
import { pmsTemplateRoutes } from "./pms-template.routes";
import { pmsAccessRoutes } from "./pms-access.routes";
import { pmsRolePermissionRoutes } from "./pms-role-permission.routes";
import { cycleRoutes } from "./cycle.routes";
import { assignmentRoutes } from "./assignment.routes";
import { objectiveRoutes } from "./objective.routes";
import { employeeAchievementSubmissionRoutes } from "./employeeAchievementSubmission.routes";
import { quarterReviewRoutes } from "./quarterReview.routes";
import { quarterAssignmentRoutes } from "./quarterAssignment.routes";
import { annualDecisionRoutes } from "./annualDecision.routes";
import { pmsCommunicationRoutes } from "./pmsCommunication.routes";
import { pmsAuditRoutes } from "./pmsAudit.routes";
import { pmsSlaRoutes } from "./pmsSla.routes";
import { delegationRoutes } from "./delegation.routes";
import { pmsDashboardRoutes } from "./pmsDashboard.routes";
import { pmsBulkOperationsRoutes } from "./pmsBulkOperations.routes";
import { pmsDocumentRoutes } from "./pmsDocument.routes";
import mongoose from "mongoose";

export async function routes(fastify: FastifyInstance) {
  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(userRoutes, { prefix: "/users" });
  fastify.register(lovRoutes, { prefix: "/lovs" });
  // PMS Routes
  fastify.register(pmsRolePermissionRoutes, { prefix: "/pms/permissions" });
  fastify.register(pmsTemplateRoutes, { prefix: "/pms/templates" });
  fastify.register(pmsAccessRoutes, { prefix: "/pms/access" });
  fastify.register(cycleRoutes, { prefix: "/pms/cycles" });
  fastify.register(assignmentRoutes, { prefix: "/pms/cycles" });
  fastify.register(objectiveRoutes, { prefix: "/pms/objectives" });
  fastify.register(employeeAchievementSubmissionRoutes, { prefix: "/pms/achievement-submissions" });
  fastify.register(quarterReviewRoutes, { prefix: "/pms/quarter-reviews" });
  fastify.register(quarterAssignmentRoutes, { prefix: "/pms/quarter-assignments" });
  fastify.register(annualDecisionRoutes, { prefix: "/pms/annual-assignments" });
  fastify.register(pmsCommunicationRoutes, { prefix: "/pms/communications" });
  fastify.register(pmsAuditRoutes, { prefix: "/pms/audit" });
  fastify.register(pmsSlaRoutes, { prefix: "/pms/sla" });
  fastify.register(delegationRoutes, { prefix: "/pms/delegations" });
  fastify.register(pmsDashboardRoutes, { prefix: "/pms/dashboard" });
  fastify.register(pmsBulkOperationsRoutes, { prefix: "/pms/bulk" });
  fastify.register(pmsDocumentRoutes, { prefix: "/pms/documents" });
  fastify.get("/test", async (_request, reply) => {
    // Removed verbose logging - use request.log instead if needed
    reply.send("Hello World");
  });



  const parseCollectionNames = (input: unknown): string[] => {
    if (Array.isArray(input)) {
      return input
        .flatMap((value) => parseCollectionNames(value))
        .filter(Boolean);
    }

    if (typeof input !== "string") {
      return [];
    }

    return input
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  };

  const deleteCollections = async (collectionNames: string[]) => {
    const uniqueNames = [...new Set(collectionNames)];
    const results = [];

    for (const collectionName of uniqueNames) {
      const collectionExists = await mongoose.connection.db
        .listCollections({ name: collectionName })
        .hasNext();

      if (!collectionExists) {
        results.push({
          collection: collectionName,
          deleted: false,
          deletedCount: 0,
          status: "not_found",
        });
        continue;
      }

      const result = await mongoose.connection
        .collection(collectionName)
        .deleteMany({});

      results.push({
        collection: collectionName,
        deleted: true,
        deletedCount: result.deletedCount || 0,
        status: "deleted",
      });
    }

    return results;
  };

  fastify.delete("/admin/collections/:name", async (request, reply) => {
    try {
      const { name } = request.params as { name: string };
      const query = request.query as { names?: string | string[] };
      const body = (request.body || {}) as {
        name?: string;
        names?: string | string[];
        collections?: string | string[];
      };
      const collectionNames = [
        ...parseCollectionNames(name),
        ...parseCollectionNames(query.names),
        ...parseCollectionNames(body.name),
        ...parseCollectionNames(body.names),
        ...parseCollectionNames(body.collections),
      ];

      if (collectionNames.length === 0) {
        return reply.code(400).send({
          success: false,
          error: "At least one collection name is required.",
        });
      }

      const results = await deleteCollections(collectionNames);
      const deleted = results.filter((result) => result.deleted);
      const missing = results.filter((result) => !result.deleted);
      const statusCode = deleted.length > 0 ? 200 : 404;

      return reply.code(statusCode).send({
        success: deleted.length > 0,
        message:
          results.length === 1
            ? deleted.length === 1
              ? `All documents from collection "${results[0].collection}" have been deleted.`
              : `Collection "${results[0].collection}" does not exist.`
            : `${deleted.length} of ${results.length} collections cleared.`,
        results,
        summary: {
          requested: results.length,
          deleted: deleted.length,
          notFound: missing.length,
        },
      });
    } catch (error: any) {
      console.error("Error deleting collection:", error);
      return reply.code(500).send({
        success: false,
        error: error.message || "Internal Server Error",
      });
    }
  });

  fastify.delete("/admin/collections", async (request, reply) => {
    try {
      const query = request.query as { names?: string | string[] };
      const body = (request.body || {}) as {
        name?: string;
        names?: string | string[];
        collections?: string | string[];
      };
      const collectionNames = [
        ...parseCollectionNames(query.names),
        ...parseCollectionNames(body.name),
        ...parseCollectionNames(body.names),
        ...parseCollectionNames(body.collections),
      ];

      if (collectionNames.length === 0) {
        return reply.code(400).send({
          success: false,
          error:
            'At least one collection name is required. Send body {"names":["collection_a","collection_b"]} or query ?names=a,b.',
        });
      }

      const results = await deleteCollections(collectionNames);
      const deleted = results.filter((result) => result.deleted);
      const missing = results.filter((result) => !result.deleted);

      return reply.code(deleted.length > 0 ? 200 : 404).send({
        success: deleted.length > 0,
        message: `${deleted.length} of ${results.length} collections cleared.`,
        results,
        summary: {
          requested: results.length,
          deleted: deleted.length,
          notFound: missing.length,
        },
      });
    } catch (error: any) {
      console.error("Error deleting collections:", error);
      return reply.code(500).send({
        success: false,
        error: error.message || "Internal Server Error",
      });
    }
  });
}
