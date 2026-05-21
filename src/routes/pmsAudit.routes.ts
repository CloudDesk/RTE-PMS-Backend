import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { auditService } from '../services/audit.service';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { VisibilityConfiguration } from '../models/pms-visibility-configuration.model';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';
import { getSubordinateUserIds } from '../utilis/userHierarchy';

export async function pmsAuditRoutes(fastify: FastifyInstance) {
  fastify.get('/:annualAssignmentId', { preHandler: [authenticate] }, async (request, reply) => {
    const { annualAssignmentId } = request.params as { annualAssignmentId: string };
    const userRole = normalizePmsRole((request.user as any).role || '') ?? ((request.user as any).role || '').replace(/[ /-]/g, '_').toUpperCase();
    const actorId = (request.user as any)._id?.toString?.() ?? '';
    const isDirector = userRole === PmsRole.DIRECTOR;
    const isAdmin = userRole === PmsRole.ADMIN;
    const isManagement = userRole === PmsRole.MANAGEMENT;
    const isManager = userRole === PmsRole.MANAGER;
    const isEmployee = userRole === PmsRole.EMPLOYEE;

    const annualAssignment = await AnnualAssignment.findById(annualAssignmentId).lean();
    if (!annualAssignment || annualAssignment.isDeleted) {
      return reply.status(404).send({
        success: false,
        message: 'Annual assignment not found',
      });
    }

    if (isEmployee) {
      if (annualAssignment.employeeId.toString() !== actorId) {
        return reply.status(403).send({ success: false, message: 'Access denied' });
      }
    } else if (isManager) {
      const subordinateIds = await getSubordinateUserIds(actorId);
      const inHierarchy = subordinateIds.some(
        (id) => id.toString() === annualAssignment.employeeId.toString(),
      );
      if (
        annualAssignment.assignedManagerId.toString() !== actorId &&
        !inHierarchy
      ) {
        return reply.status(403).send({ success: false, message: 'Access denied' });
      }
    }

    // Fetch the assignment to check visibility state
    const annualDecision = await AnnualDecision.findOne({ annualAssignmentId }).lean();
    const isVisibilityEnabled = annualDecision ? annualDecision.decisionStatus === 'VISIBILITY_ENABLED' : false;
    const visibilityConfiguration = await VisibilityConfiguration.findOne({ annualAssignmentId, isDeleted: false }).lean();
    const visibility = visibilityConfiguration
      ? {
          employeeReviewVisible: visibilityConfiguration.employeeReviewVisible,
          employeeGradeVisible: visibilityConfiguration.employeeGradeVisible,
          employeeMeritVisible: visibilityConfiguration.employeeMeritVisible,
          managerGradeVisible: visibilityConfiguration.managerGradeVisible,
          managerMeritVisible: visibilityConfiguration.managerMeritVisible,
          visibleFrom: visibilityConfiguration.visibleFrom,
        }
      : {
          employeeReviewVisible: annualAssignment.visibility?.employeeReviewVisible === true,
          employeeGradeVisible: annualAssignment.visibility?.employeeGradeVisible === true,
          employeeMeritVisible: annualAssignment.visibility?.employeeMeritVisible === true,
          managerGradeVisible: annualAssignment.visibility?.managerGradeVisible === true,
          managerMeritVisible: annualAssignment.visibility?.managerMeritVisible === true,
          visibleFrom: undefined,
        };
    const visibilityActive =
      isVisibilityEnabled &&
      (!visibility.visibleFrom || new Date(visibility.visibleFrom).getTime() <= Date.now());

    // Get all audit logs for this assignment
    const logs = await auditService.getHistory(annualAssignmentId);

    // Apply visibility rules based on FSD/Module audit governance.
    let filteredLogs = logs;

    if (!isAdmin && !isManagement && !isDirector) {
      filteredLogs = logs
        .filter((log) => {
          const action = String(log.action || '').toUpperCase();
          const isQuarterReviewAction =
            action.includes('QUARTER_REVIEW') ||
            action.includes('QUARTER_ASSIGNMENT_FINALIZED') ||
            action.includes('CORRECTION');
          const isAnnualDecisionAction =
            action.includes('ANNUAL_DECISION') ||
            action.includes('VISIBILITY');

          if (isEmployee && isQuarterReviewAction && (!visibilityActive || !visibility.employeeReviewVisible)) {
            return false;
          }

          if (isAnnualDecisionAction && !visibilityActive) {
            return false;
          }

          return true;
        })
        .map((log) =>
          maskAuditLog(log, {
            role: userRole,
            isVisibilityEnabled: visibilityActive,
            employeeReviewVisible: visibility.employeeReviewVisible,
            employeeGradeVisible: visibility.employeeGradeVisible,
            employeeMeritVisible: visibility.employeeMeritVisible,
            managerGradeVisible: visibility.managerGradeVisible,
            managerMeritVisible: visibility.managerMeritVisible,
          }),
        );
    }

    return reply.send({
      success: true,
      data: filteredLogs,
    });
  });
}

function maskAuditLog(
  log: any,
  context: {
    role: string;
    isVisibilityEnabled: boolean;
    employeeReviewVisible: boolean;
    employeeGradeVisible: boolean;
    employeeMeritVisible: boolean;
    managerGradeVisible: boolean;
    managerMeritVisible: boolean;
  },
) {
  const isEmployee = context.role === PmsRole.EMPLOYEE;
  const canSeeGrade = isEmployee
    ? context.isVisibilityEnabled && context.employeeGradeVisible
    : context.isVisibilityEnabled && context.managerGradeVisible;
  const canSeeMerit = isEmployee
    ? context.isVisibilityEnabled && context.employeeMeritVisible
    : context.isVisibilityEnabled && context.managerMeritVisible;
  const canSeeReview = !isEmployee || (context.isVisibilityEnabled && context.employeeReviewVisible);

  return {
    ...log,
    previousValue: redactAuditValue(log.previousValue, { canSeeGrade, canSeeMerit, canSeeReview }),
    oldValue: redactAuditValue(log.oldValue, { canSeeGrade, canSeeMerit, canSeeReview }),
    newValue: redactAuditValue(log.newValue, { canSeeGrade, canSeeMerit, canSeeReview }),
  };
}

function redactAuditValue(
  value: unknown,
  permissions: {
    canSeeGrade: boolean;
    canSeeMerit: boolean;
    canSeeReview: boolean;
  },
): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => redactAuditValue(item, permissions))
      .filter((item) => item !== undefined);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const gradeKeys = new Set([
    'grade',
    'gradedetails',
    'finalrating',
    'finalscore',
    'appraisaloutcometype',
  ]);
  const meritKeys = new Set(['merit', 'meritdetails']);
  const reviewKeys = new Set([
    'comments',
    'ratings',
    'score',
    'overallscore',
    'overallrating',
    'achievements',
    'developmentobservations',
    'recommendation',
    'finalquarterremarks',
    'quarterscore',
    'quarterrating',
    'quartersummary',
    'reviewstatus',
  ]);

  const redacted: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[_\s-]/g, '').toLowerCase();

    if (!permissions.canSeeGrade && gradeKeys.has(normalizedKey)) {
      continue;
    }

    if (!permissions.canSeeMerit && meritKeys.has(normalizedKey)) {
      continue;
    }

    if (!permissions.canSeeReview && reviewKeys.has(normalizedKey)) {
      continue;
    }

    const nextValue = redactAuditValue(nestedValue, permissions);
    if (nextValue !== undefined) {
      redacted[key] = nextValue;
    }
  }

  return Object.keys(redacted).length > 0 ? redacted : undefined;
}
