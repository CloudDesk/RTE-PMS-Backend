import { RequestContext } from '../types/context';
import { ServiceContainer } from '../types/container';
import { UserService } from '../services/user.service';
import { LovService } from '../services/lov.service';
import { AuthService } from '../services/auth.service';
import { CollectionService } from '../services/collection.service';
import { PmsTemplateService } from '../services/pms-template.service';
import { CycleService } from '../services/cycle.service';
import { AssignmentService } from '../services/assignment.service';
import { ObjectiveService } from '../services/objective.service';
import { EmployeeAchievementSubmissionService } from '../services/employeeAchievementSubmission.service';
import { TermReviewService } from '../services/termReview.service';
import { AnnualDecisionService } from '../services/annualDecision.service';
import { PmsCommunicationService } from '../services/pmsCommunication.service';
import { DelegationService } from '../services/delegation.service';
import { PmsDashboardService } from '../services/pmsDashboard.service';
import { PmsManagementEmployeeService } from '../services/pmsManagementEmployee.service';
import { PmsBulkOperationsService } from '../services/pmsBulkOperations.service';
import { WorkflowSyncService } from '../services/workflow-sync.service';
import { PmsDocumentService } from '../services/pms-document.service';

export class Container {
  private static instance: Container;
  private context: Map<string, RequestContext>;

  private constructor() {
    this.context = new Map();
  }

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  createScope(requestId: string, context: RequestContext): ServiceContainer {
    this.context.set(requestId, context);

    // Create new instances of services with request context
    return {
      requestContext: context,
      userService: new UserService(context),
      lovService: new LovService(context),
      authService: new AuthService(),
      collectionService: new CollectionService(context),
      pmsTemplateService: new PmsTemplateService(context),
      cycleService: new CycleService(context),
      assignmentService: new AssignmentService(context),
      objectiveService: new ObjectiveService(context),
      employeeAchievementSubmissionService: new EmployeeAchievementSubmissionService(context),
      termReviewService: new TermReviewService(context),
      annualDecisionService: new AnnualDecisionService(context),
      pmsCommunicationService: new PmsCommunicationService(context),
      delegationService: new DelegationService(context),
      pmsDashboardService: new PmsDashboardService(context),
      pmsManagementEmployeeService: new PmsManagementEmployeeService(context),
      pmsBulkOperationsService: new PmsBulkOperationsService(context),
      workflowSyncService: new WorkflowSyncService(context),
      pmsDocumentService: new PmsDocumentService(context),
    };
  }


  clearScope(requestId: string): void {
    this.context.delete(requestId);
  }
}


/*
Container and RequestContext
  - Purpose: The Container class is a singleton toolbox that organizes and provides services (tools) for each request in a Node.js, Fastify, TypeScript app.

  - Key Points:

    * Singleton: One Container instance (toolbox) exists to avoid creating multiple toolboxes.
    * RequestContext: A note with request-specific details (e.g., user ID, database connection) passed to services.
    * createScope: Prepares a fresh toolbox for each request, creating new service instances with RequestContext.
    * clearScope: Cleans up the toolbox after the request, removing the RequestContext to avoid memory issues.
    * Services: Tools like BiometricAttendanceService use RequestContext for request-specific tasks; others like SalaryAssignmentService are shared and don’t need it.

  - Why Use It? Ensures each request gets its own customized services, preventing mix-ups (e.g., wrong user data).

  - Analogy: The Container is a kitchen manager who gives each chef (request) a toolbox with tools (services) and a note (RequestContext) with dish details (e.g., “Spicy for Customer A”). After cooking, the note is discarded.

*/
