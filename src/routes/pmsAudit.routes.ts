import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { auditService } from '../services/audit.service';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { PmsRole } from '../constants/pms.enums';

export async function pmsAuditRoutes(fastify: FastifyInstance) {
  fastify.get('/:annualAssignmentId', { preHandler: [authenticate] }, async (request, reply) => {
    const { annualAssignmentId } = request.params as { annualAssignmentId: string };
    const userRole = (request.user as any).role.replace(/[ /-]/g, '_').toUpperCase();
    const isSuperAdmin = userRole === PmsRole.SUPER_ADMIN;
    const isAdmin = userRole === PmsRole.ADMIN;
    const isManagement = userRole === PmsRole.MANAGEMENT;

    // Fetch the assignment to check visibility state
    const annualDecision = await AnnualDecision.findOne({ annualAssignmentId }).lean();
    if (!annualDecision) {
      return reply.status(404).send({ success: false, message: 'Annual decision not found' });
    }

    const isVisibilityEnabled = annualDecision.decisionStatus === 'VISIBILITY_ENABLED';

    // Get all audit logs for this assignment
    const logs = await auditService.getHistory(annualAssignmentId);

    // Apply visibility rules based on FSD Module 11
    // "ADMIN, SUPER_ADMIN, and authorized MANAGEMENT can view full audit where permitted. EMPLOYEE and MANAGER see only visible historical fields."
    let filteredLogs = logs;

    if (!isSuperAdmin && !isAdmin && !isManagement) {
      // It's a Manager or Employee
      filteredLogs = logs.filter(log => {
        // Redact actions that are invisible until visibility is enabled
        const isGradeMeritAction = log.action === 'ANNUAL_DECISION_DRAFT' || log.action === 'ANNUAL_DECISION_SUBMIT' || log.action === 'ANNUAL_DECISION_FREEZE' || log.action === 'VISIBILITY_UPDATE' || log.action.includes('GRADE') || log.action.includes('MERIT');
        
        if (isGradeMeritAction && !isVisibilityEnabled) {
          return false;
        }

        const isManagerReviewAction = log.action.includes('QUARTER_REVIEW');
        if (isManagerReviewAction && !isVisibilityEnabled) {
          // If FSD says employee cannot see manager review until visibility enabled, we might need to be more granular.
          // For now, if visibility is not enabled, hide manager review actions from employee.
          if (userRole === PmsRole.EMPLOYEE) {
             return false;
          }
        }
        
        return true;
      }).map(log => {
        // We can further mask newValue/previousValue if needed, but filtering out the event might be enough.
        return log;
      });
    }

    return reply.send({
      success: true,
      data: filteredLogs,
    });
  });
}
