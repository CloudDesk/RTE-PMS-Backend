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



  fastify.delete("/admin/collections/:name", async (request, reply) => {
    try {
      const { name: collectionName } = request.params as { name: string };
      console.log(collectionName, "collectionName");
      if (!collectionName) {
        return reply.code(400).send({
          success: false,
          error: "Collection name is required.",
        });
      }

      const collectionExists = await mongoose.connection.db
        .listCollections({ name: collectionName })
        .hasNext();

      if (!collectionExists) {
        return reply.code(404).send({
          success: false,
          error: `Collection "${collectionName}" does not exist.`,
        });
      }

      await mongoose.connection.collection(collectionName).deleteMany({});

      return reply.code(200).send({
        success: true,
        message: `All documents from collection "${collectionName}" have been deleted.`,
      });
    } catch (error: any) {
      console.error("Error deleting collection:", error);
      return reply.code(500).send({
        success: false,
        error: error.message || "Internal Server Error",
      });
    }
  });
}
