import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { authenticate } from '../middleware/auth';
import { Objective } from '../models/pms-objective.model';
import { PmsDocument } from '../models/pms-document.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import { RouteHandler } from '../types/routes';
import { errorResponse, successResponse } from '../utilis/apiResponse';
import { parseMultipartForm } from '../utilis/parseMultiPartForm';
import type {
  AddObjectiveCommentInput,
  AmendFlexibleObjectiveInput,
  ApplyObjectiveAssignmentsInput,
  ApplyObjectiveAssignmentPeriodInput,
  BulkCreateManagerObjectiveInput,
  CloseObjectiveSettingInput,
  CreateObjectiveAssignmentPeriodInput,
  CreateObjectiveAssignmentRuleInput,
  CreateObjectiveMasterInput,
  CreateObjectiveInput,
  ObjectiveAssignmentPeriodEmployeeInput,
  ObjectiveAssignmentPeriodListQuery,
  ObjectiveAssignmentPeriodReportQuery,
  ObjectiveAssignmentPreviewInput,
  ObjectiveEmployeeAssignmentListQuery,
  ObjectiveReportingQuery,
  CorrectObjectiveInput,
  ChangeObjectiveEmployeeAssignmentShareInput,
  EnableObjectiveEmployeeAssignmentPastTermEntryInput,
  ManagerObjectiveLibraryDraftInput,
  ObjectiveMasterListQuery,
  ReturnObjectiveInput,
  RevokeObjectiveEmployeeAssignmentPastTermEntryInput,
  RevokeObjectiveEmployeeAssignmentShareInput,
  SaveAssignmentTemplateValuesInput,
  SaveObjectiveEmployeeAssignmentValuesInput,
  SaveManagerObjectiveLibraryInput,
  ShareObjectiveEmployeeAssignmentInput,
  UpdateObjectiveAssignmentRuleInput,
  UpdateObjectiveAssignmentPeriodInput,
  UpdateObjectiveMasterVersionInput,
  UpdateObjectiveInput,
} from '../services/objective.service';

const MAX_OBJECTIVE_ATTACHMENT_BYTES = 1024 * 1024;

export const objectiveRoutes: RouteHandler = async (
  fastify: FastifyInstance,
): Promise<void> => {
  fastify.post(
    '/',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const payload = await resolveObjectivePayloadWithAttachments(request);
        const objective = await request.container!.objectiveService.createObjective(
          payload as unknown as CreateObjectiveInput,
        );
        return reply.status(201).send(successResponse('Objective created successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/bulk-manager',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.objectiveService.bulkCreateManagerObjectives(
          request.body as BulkCreateManagerObjectiveInput,
        );
        return reply.status(201).send(successResponse('Manager objectives assigned successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/manager-library',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const objectives = await request.container!.objectiveService.listManagerObjectiveLibrary();
        return reply.send(successResponse('Manager objective library fetched successfully', objectives));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/manager-library',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const objectives = await request.container!.objectiveService.saveManagerObjectiveLibrary(
          request.body as SaveManagerObjectiveLibraryInput,
        );
        return reply.send(successResponse('Manager objective library saved successfully', objectives));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/manager-library/items',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const objectives = await request.container!.objectiveService.createManagerObjectiveLibraryItem(
          request.body as ManagerObjectiveLibraryDraftInput,
        );
        return reply.status(201).send(successResponse('Manager objective library item saved successfully', objectives));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.delete(
    '/manager-library/items/:localId',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { localId } = request.params as { localId: string };
        const objectives = await request.container!.objectiveService.deleteManagerObjectiveLibraryItem(localId);
        return reply.send(successResponse('Manager objective library item deleted successfully', objectives));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/assignments',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { mode = 'employee' } = request.query as { mode?: 'employee' | 'manager' };
        const assignments = await request.container!.objectiveService.listAssignments(mode);
        return reply.send(successResponse('Objective assignments fetched successfully', assignments));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/masters',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.objectiveService.createObjectiveMaster(
          request.body as CreateObjectiveMasterInput,
        );
        return reply.status(201).send(successResponse('Objective Master created successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/masters',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.objectiveService.listObjectiveMasters(
          request.query as ObjectiveMasterListQuery,
        );
        return reply.send(successResponse('Objective Masters fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/masters/:objectiveMasterId',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const { objectiveMasterId } = request.params as { objectiveMasterId: string };
        const result = await request.container!.objectiveService.getObjectiveMasterDetail(
          objectiveMasterId,
        );
        return reply.send(successResponse('Objective Master fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/masters/:objectiveMasterId/versions',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const { objectiveMasterId } = request.params as { objectiveMasterId: string };
        const versions = await request.container!.objectiveService.listObjectiveMasterVersions(
          objectiveMasterId,
        );
        return reply.send(successResponse('Objective Master versions fetched successfully', versions));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/masters/:objectiveMasterId/versions',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const { objectiveMasterId } = request.params as { objectiveMasterId: string };
        const { sourceVersionId } = (request.body ?? {}) as { sourceVersionId?: string };
        const version = await request.container!.objectiveService.createObjectiveMasterVersion(
          objectiveMasterId,
          sourceVersionId,
        );
        return reply.status(201).send(successResponse('Objective Master version created successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/master-versions/:objectiveVersionId',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const { objectiveVersionId } = request.params as { objectiveVersionId: string };
        const version = await request.container!.objectiveService.updateDraftObjectiveMasterVersion(
          objectiveVersionId,
          request.body as UpdateObjectiveMasterVersionInput,
        );
        return reply.send(successResponse('Draft objective version updated successfully', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/master-versions/:objectiveVersionId/activate',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const { objectiveVersionId } = request.params as { objectiveVersionId: string };
        const result = await request.container!.objectiveService.activateObjectiveMasterVersion(
          objectiveVersionId,
        );
        return reply.send(successResponse('Objective version activated successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/master-versions/:objectiveVersionId/deactivate',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const { objectiveVersionId } = request.params as { objectiveVersionId: string };
        const result = await request.container!.objectiveService.deactivateObjectiveMasterVersion(
          objectiveVersionId,
        );
        return reply.send(successResponse('Objective version deactivated successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/master-versions/:objectiveVersionId/archive',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const { objectiveVersionId } = request.params as { objectiveVersionId: string };
        const result = await request.container!.objectiveService.archiveObjectiveMasterVersion(
          objectiveVersionId,
        );
        return reply.send(successResponse('Objective version archived successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/master-versions/:objectiveVersionId/assignable',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const { objectiveVersionId } = request.params as { objectiveVersionId: string };
        const version = await request.container!.objectiveService.assertObjectiveVersionAssignable(
          objectiveVersionId,
        );
        return reply.send(successResponse('Objective version is assignable', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/master-versions/:objectiveVersionId/reviewable',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Master'] } },
    async (request, reply) => {
      try {
        const { objectiveVersionId } = request.params as { objectiveVersionId: string };
        const version = await request.container!.objectiveService.assertObjectiveVersionReviewable(
          objectiveVersionId,
        );
        return reply.send(successResponse('Objective version is reviewable', version));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-rules',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Rules'] } },
    async (request, reply) => {
      try {
        const rule = await request.container!.objectiveService.createObjectiveAssignmentRule(
          request.body as CreateObjectiveAssignmentRuleInput,
        );
        return reply.status(201).send(successResponse('Objective assignment rule created successfully', rule));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/assignment-rules/:assignmentRuleId',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Rules'] } },
    async (request, reply) => {
      try {
        const { assignmentRuleId } = request.params as { assignmentRuleId: string };
        const rule = await request.container!.objectiveService.updateObjectiveAssignmentRule(
          assignmentRuleId,
          request.body as UpdateObjectiveAssignmentRuleInput,
        );
        return reply.send(successResponse('Objective assignment rule updated successfully', rule));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-rules/:assignmentRuleId/deactivate',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Rules'] } },
    async (request, reply) => {
      try {
        const { assignmentRuleId } = request.params as { assignmentRuleId: string };
        const rule = await request.container!.objectiveService.deactivateObjectiveAssignmentRule(
          assignmentRuleId,
        );
        return reply.send(successResponse('Objective assignment rule deactivated successfully', rule));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-rules/preview',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Rules'] } },
    async (request, reply) => {
      try {
        const preview = await request.container!.objectiveService.previewObjectiveAssignments(
          request.body as ObjectiveAssignmentPreviewInput,
        );
        return reply.send(successResponse('Objective assignment preview generated successfully', preview));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-rules/apply',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Rules'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.objectiveService.applyObjectiveAssignments(
          request.body as ApplyObjectiveAssignmentsInput,
        );
        return reply.send(successResponse('Objective assignments applied successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-periods',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Periods'] } },
    async (request, reply) => {
      try {
        const period = await request.container!.objectiveService.createObjectiveAssignmentPeriod(
          request.body as CreateObjectiveAssignmentPeriodInput,
        );
        return reply.status(201).send(successResponse('Objective Assignment Period created successfully', period));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/assignment-periods',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Periods'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.objectiveService.listObjectiveAssignmentPeriods(
          request.query as ObjectiveAssignmentPeriodListQuery,
        );
        return reply.send(successResponse('Objective Assignment Periods fetched successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/assignment-periods/:periodId',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Periods'] } },
    async (request, reply) => {
      try {
        const { periodId } = request.params as { periodId: string };
        const period = await request.container!.objectiveService.getObjectiveAssignmentPeriod(periodId);
        return reply.send(successResponse('Objective Assignment Period fetched successfully', period));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/assignment-periods/:periodId',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Periods'] } },
    async (request, reply) => {
      try {
        const { periodId } = request.params as { periodId: string };
        const period = await request.container!.objectiveService.updateObjectiveAssignmentPeriod(
          periodId,
          request.body as UpdateObjectiveAssignmentPeriodInput,
        );
        return reply.send(successResponse('Objective Assignment Period updated successfully', period));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-periods/:periodId/activate',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Periods'] } },
    async (request, reply) => {
      try {
        const { periodId } = request.params as { periodId: string };
        const period = await request.container!.objectiveService.activateObjectiveAssignmentPeriod(periodId);
        return reply.send(successResponse('Objective Assignment Period activated successfully', period));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-periods/:periodId/close',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Periods'] } },
    async (request, reply) => {
      try {
        const { periodId } = request.params as { periodId: string };
        const period = await request.container!.objectiveService.closeObjectiveAssignmentPeriod(periodId);
        return reply.send(successResponse('Objective Assignment Period closed successfully', period));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-periods/:periodId/preview',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Periods'] } },
    async (request, reply) => {
      try {
        const { periodId } = request.params as { periodId: string };
        const preview = await request.container!.objectiveService.previewObjectiveAssignmentPeriodEmployees(
          periodId,
          request.body as ObjectiveAssignmentPeriodEmployeeInput,
        );
        return reply.send(successResponse('Objective Assignment Period preview generated successfully', preview));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-periods/:periodId/apply',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Periods'] } },
    async (request, reply) => {
      try {
        const { periodId } = request.params as { periodId: string };
        const result = await request.container!.objectiveService.applyObjectiveAssignmentPeriodEmployees(
          periodId,
          request.body as ApplyObjectiveAssignmentPeriodInput,
        );
        return reply.send(successResponse('Objective Assignment Period applied successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/employee-assignments',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const assignments = await request.container!.objectiveService.listObjectiveEmployeeAssignments(
          request.query as ObjectiveEmployeeAssignmentListQuery,
        );
        return reply.send(successResponse('Objective employee assignments fetched successfully', assignments));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/employee-assignments/sync-term-states',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.objectiveService.syncObjectiveEmployeeAssignmentTermStates(
          (request.body ?? {}) as any,
        );
        return reply.send(successResponse('Objective assignment term states synced successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/employee-assignments/:assignmentId/final-record',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const finalRecord = await request.container!.objectiveService.getObjectiveEmployeeAssignmentFinalRecord(
          assignmentId,
        );
        return reply.send(successResponse('Final objective record fetched successfully', finalRecord));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/employee-assignments/:assignmentId/activity',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const activity = await request.container!.objectiveService.getObjectiveEmployeeAssignmentActivity(
          assignmentId,
        );
        return reply.send(successResponse('Objective assignment activity fetched successfully', activity));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/employee-assignments/:assignmentId/values',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const assignment = await request.container!.objectiveService.saveObjectiveEmployeeAssignmentValues(
          assignmentId,
          request.body as SaveObjectiveEmployeeAssignmentValuesInput,
        );
        return reply.send(successResponse('Objective assignment values saved successfully', assignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/employee-assignments/:assignmentId/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const assignment = await request.container!.objectiveService.submitObjectiveEmployeeAssignment(
          assignmentId,
          (request.body ?? {}) as SaveObjectiveEmployeeAssignmentValuesInput,
        );
        return reply.send(successResponse('Objective assignment submitted successfully', assignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/employee-assignments/:assignmentId/share',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const assignment = await request.container!.objectiveService.shareObjectiveEmployeeAssignment(
          assignmentId,
          request.body as ShareObjectiveEmployeeAssignmentInput,
        );
        return reply.send(successResponse('Objective assignment shared successfully', assignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/employee-assignments/:assignmentId/share/revoke',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const assignment = await request.container!.objectiveService.revokeObjectiveEmployeeAssignmentShare(
          assignmentId,
          request.body as RevokeObjectiveEmployeeAssignmentShareInput,
        );
        return reply.send(successResponse('Objective assignment shared access revoked successfully', assignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/employee-assignments/:assignmentId/share',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const assignment = await request.container!.objectiveService.changeObjectiveEmployeeAssignmentShare(
          assignmentId,
          request.body as ChangeObjectiveEmployeeAssignmentShareInput,
        );
        return reply.send(successResponse('Objective assignment sharing changed successfully', assignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/employee-assignments/:assignmentId/terms/:term/past-entry',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId, term } = request.params as { assignmentId: string; term: string };
        const assignment = await request.container!.objectiveService.enableObjectiveEmployeeAssignmentPastTermEntry(
          assignmentId,
          term,
          request.body as EnableObjectiveEmployeeAssignmentPastTermEntryInput,
        );
        return reply.send(successResponse('Past-term employee entry enabled successfully', assignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/employee-assignments/:assignmentId/terms/:term/past-entry/revoke',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId, term } = request.params as { assignmentId: string; term: string };
        const assignment = await request.container!.objectiveService.revokeObjectiveEmployeeAssignmentPastTermEntry(
          assignmentId,
          term,
          request.body as RevokeObjectiveEmployeeAssignmentPastTermEntryInput,
        );
        return reply.send(successResponse('Past-term employee entry revoked successfully', assignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/employee-assignments/:assignmentId/close',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Employee Assignments'] } },
    async (request, reply) => {
      try {
        const { assignmentId } = request.params as { assignmentId: string };
        const assignment = await request.container!.objectiveService.closeObjectiveEmployeeAssignment(assignmentId);
        return reply.send(successResponse('Objective assignment closed successfully', assignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/assignment-period-reports',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Period Reports'] } },
    async (request, reply) => {
      try {
        const report = await request.container!.objectiveService.getObjectiveAssignmentPeriodReport(
          request.query as ObjectiveAssignmentPeriodReportQuery,
        );
        return reply.send(successResponse('Objective Assignment Period report fetched successfully', report));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignment-periods/scheduled-close',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Assignment Period Reports'] } },
    async (request, reply) => {
      try {
        const result = await request.container!.objectiveService.runScheduledObjectiveAssignmentPeriodClose();
        return reply.send(successResponse('Objective Assignment Period scheduled close completed successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/reporting',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Reporting'] } },
    async (request, reply) => {
      try {
        const data = await request.container!.objectiveService.getObjectiveReportingData(
          request.query as ObjectiveReportingQuery,
        );
        return reply.send(successResponse('Objective reporting data fetched successfully', data));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/dashboard-statuses',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Reporting'] } },
    async (request, reply) => {
      try {
        const data = await request.container!.objectiveService.getObjectiveDashboardStatuses(
          request.query as ObjectiveReportingQuery,
        );
        return reply.send(successResponse('Objective dashboard statuses fetched successfully', data));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/assignments/:termAssignmentId/close-objective-setting',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId } = request.params as { termAssignmentId: string };
        const termAssignment = await request.container!.objectiveService.closeObjectiveSetting(
          termAssignmentId,
          request.body as CloseObjectiveSettingInput,
        );
        return reply.send(successResponse('Objective setting closed successfully', termAssignment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/assignments/:termAssignmentId/template-values',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { termAssignmentId } = request.params as { termAssignmentId: string };
        const values = await request.container!.objectiveService.saveAssignmentTemplateValues(
          termAssignmentId,
          request.body as SaveAssignmentTemplateValuesInput,
        );
        return reply.send(successResponse('Objective template values saved successfully', values));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id/fillability',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const policy = await request.container!.objectiveService.getObjectiveFillabilityPolicy(id);
        return reply.send(successResponse('Objective fillability policy fetched successfully', policy));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.get(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.getObjectiveDetail(id);
        return reply.send(successResponse('Objective fetched successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.put(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const payload = await resolveObjectivePayloadWithAttachments(request, id);
        const objective = await request.container!.objectiveService.updateObjective(
          id,
          payload as unknown as UpdateObjectiveInput,
        );
        return reply.send(successResponse('Objective updated successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.delete(
    '/:id',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.objectiveService.deleteDraftObjective(id);
        return reply.send(successResponse('Draft objective deleted successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/submit',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.submitObjective(id);
        return reply.send(successResponse('Objective submitted successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/approve',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.approveObjective(
          id,
          request.body as { weightage?: number },
        );
        return reply.send(successResponse('Objective approved successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/return',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.returnObjective(
          id,
          request.body as ReturnObjectiveInput,
        );
        return reply.send(successResponse('Objective returned for revision successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/comments',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const comment = await request.container!.objectiveService.addComment(
          id,
          request.body as AddObjectiveCommentInput,
        );
        return reply.status(201).send(successResponse('Objective comment added successfully', comment));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/correction',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const objective = await request.container!.objectiveService.correctObjective(
          id,
          request.body as CorrectObjectiveInput,
        );
        return reply.send(successResponse('Objective corrected successfully', objective));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );

  fastify.post(
    '/:id/amendment',
    { onRequest: [authenticate], schema: { tags: ['PMS Objective Management'] } },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const result = await request.container!.objectiveService.amendFlexibleObjective(
          id,
          request.body as AmendFlexibleObjectiveInput,
        );
        return reply.send(successResponse('Objective amendment applied successfully', result));
      } catch (error: unknown) {
        return sendRouteError(reply, error);
      }
    },
  );
};

function isMultipartRequest(request: FastifyRequest) {
  const contentType = String(request.headers['content-type'] || '');
  return contentType.toLowerCase().includes('multipart/form-data');
}

function parseObjectivePayloadField(rawPayload: unknown) {
  if (!rawPayload) {
    return {};
  }

  if (typeof rawPayload === 'object') {
    return rawPayload as Record<string, unknown>;
  }

  if (typeof rawPayload !== 'string') {
    throw new Error('Invalid objective payload');
  }

  try {
    return JSON.parse(rawPayload) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid objectivePayload JSON');
  }
}

async function resolveObjectivePayloadWithAttachments(
  request: FastifyRequest,
  objectiveId?: string,
) {
  if (!isMultipartRequest(request)) {
    return request.body as Record<string, unknown>;
  }

  const uploadedDocumentIds: Types.ObjectId[] = [];

  try {
    const { body, files } = await parseMultipartForm(request);
    const payload = parseObjectivePayloadField(
      body.objectivePayload ?? body.payload ?? body.objective,
    );

    if (!files.length) {
      return payload;
    }

    const oversizedFile = files.find((file) => {
      const cachedBuffer = (file as any).__cachedBuffer as Buffer | undefined;
      return (cachedBuffer?.length ?? 0) >= MAX_OBJECTIVE_ATTACHMENT_BYTES;
    });

    if (oversizedFile) {
      throw new Error('Objective attachments must be less than 1 MB per file.');
    }

    const termAssignment = await resolveTermAssignmentForObjectivePayload(payload, objectiveId);
    const termLabel = termAssignment.termLabel || termAssignment.termCode || termAssignment.assessmentTermCode;
    const documentName = `${String(payload.title || 'PMS Objective').trim() || 'PMS Objective'} - ${termLabel}`;

    const uploadedAttachments = [];
    for (const file of files) {
      const uploaded = await request.container!.pmsDocumentService.uploadDocument({
        employeeId: termAssignment.employeeId.toString(),
        cycleId: termAssignment.cycleId?.toString(),
        annualAssignmentId: termAssignment.annualAssignmentId.toString(),
        termAssignmentId: termAssignment._id.toString(),
        documentType: 'ObjectiveAttachment',
        documentName,
        documentDate: new Date(),
        description: `PMS objective attachment for ${documentName}`,
        file,
      });

      if (uploaded.documentId && Types.ObjectId.isValid(uploaded.documentId)) {
        uploadedDocumentIds.push(new Types.ObjectId(uploaded.documentId));
      }

      uploadedAttachments.push({
        documentId: uploaded.documentId?.toString?.() ?? String(uploaded.documentId || ''),
        fileName: uploaded.fileName,
        fileUrl: uploaded.fileUrl,
        fileType: file.mimetype,
        fileSize: (file as any).__cachedBuffer?.length,
        uploadedAt: uploaded.uploadedAt,
      });
    }

    return {
      ...payload,
      attachments: [
        ...((Array.isArray(payload.attachments) ? payload.attachments : []) as unknown[]),
        ...uploadedAttachments,
      ],
    };
  } catch (error) {
    if (uploadedDocumentIds.length > 0) {
      await PmsDocument.updateMany(
        { _id: { $in: uploadedDocumentIds } },
        { $set: { isDeleted: true } },
      ).catch(() => undefined);
    }
    throw error;
  }
}

async function resolveTermAssignmentForObjectivePayload(
  payload: Record<string, unknown>,
  objectiveId?: string,
) {
  let termAssignmentId = typeof payload.termAssignmentId === 'string'
    ? payload.termAssignmentId
    : '';

  if (!termAssignmentId && objectiveId) {
    const objective = await Objective.findById(objectiveId).select('termAssignmentId').lean();
    termAssignmentId = objective?.termAssignmentId?.toString?.() || '';
  }

  if (!termAssignmentId || !Types.ObjectId.isValid(termAssignmentId)) {
    throw new Error('Valid termAssignmentId is required for objective attachments');
  }

  const termAssignment = await TermAssignment.findById(termAssignmentId).lean();
  if (!termAssignment || termAssignment.isDeleted) {
    throw new Error('Quarter assignment not found for objective attachments');
  }

  return termAssignment;
}

function sendRouteError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  if (/file too large|less than 1 MB/i.test(message)) {
    return reply.status(413).send(errorResponse('PMS_OBJECTIVE_ERROR', 'Objective attachments must be less than 1 MB per file.'));
  }
  return reply.status(400).send(errorResponse('PMS_OBJECTIVE_ERROR', message));
}
