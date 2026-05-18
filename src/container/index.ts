import { RequestContext } from '../types/context';
import { ServiceContainer } from '../types/container';
import { UserService } from '../services/user.service';
import { ShiftService } from '../services/shift.service';
import { BiometricAttendanceService } from '../services/biometric-attendance.service';
import { LeaveService } from '../services/leave.service';
import { LeaveSummaryService } from '../services/leave-summary.service';
import { LovService } from '../services/lov.service';
import { OrganizationService } from '../services/organization.service';
import { TrainingService } from '../services/training.service';
import { TrainingAttendanceService } from '../services/training-attendance.service';
import { AuthService } from '../services/auth.service';
import { CollectionService } from '../services/collection.service';
import { AttendanceRegularizationService } from '../services/attendance-regularization.service';
import { AttendanceOverrideService } from '../services/attendance-override.service';
import { TimesheetService } from '../services/timesheet.service';
import { TaxDeclarationService } from '../services/tax-declaration.service';
import { TaxSlabService } from '../services/tax-slab.service';
import { SalaryStructureService } from '../services/salary-structure.service';
import { PayrollService } from '../services/payroll.service';
import { PayslipService } from '../services/payslip.service';
import { HolidayCalendarService } from '../services/holiday-calendar.service';
import { OvertimeService } from '../services/overtime.service';
import { ReportService } from '../services/reports.service';
import { SalaryAssignmentService } from '../services/salary-assignment.service';
import { WeekendCalendarService } from '../services/weekend-calendar.service';
import { DocumentService } from '../services/document.service';
import { DashboardService } from '../services/dashboard.service';
import { PermissionService } from '../services/permission.service';
import { PermissionSummaryService } from '../services/permission-summary.service';
import { WFHService } from '../services/wfh.service';
import { WFHSummaryService } from '../services/wfh-summary.service';
import { ShiftChangeService } from '../services/shift-change.service';
import { OptionalHolidayService } from '../services/optional-holiday.service';
import { PayslipPdfService } from '../services/payslip-pdf.service';
import { SalaryStatementService } from '../services/salary-statement.service';
import { TaxSalaryContextService } from '../services/tax-salary-context.service';
import { CommunicationService } from '../services/communication.service';
import { PmsTemplateService } from '../services/pms-template.service';
import { CycleService } from '../services/cycle.service';
import { AssignmentService } from '../services/assignment.service';
import { ObjectiveService } from '../services/objective.service';
import { QuarterReviewService } from '../services/quarterReview.service';
import { AnnualDecisionService } from '../services/annualDecision.service';
import { PmsCommunicationService } from '../services/pmsCommunication.service';
import { DelegationService } from '../services/delegation.service';
import { PmsDashboardService } from '../services/pmsDashboard.service';
import { PmsBulkOperationsService } from '../services/pmsBulkOperations.service';

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
      shiftService: new ShiftService(context),
      biometricAttendanceService: new BiometricAttendanceService(context),
      trainingAttendanceService: new TrainingAttendanceService(context),
      leaveService: new LeaveService(context),
      leaveSummaryService: new LeaveSummaryService(context),
      lovService: new LovService(context),
      organizationService: new OrganizationService(context),
      trainingService: new TrainingService(context),
      authService: new AuthService(),
      collectionService: new CollectionService(context),
      attendanceRegularizationService: new AttendanceRegularizationService(context),
      attendanceOverrideService: new AttendanceOverrideService(context),
      timesheetService: new TimesheetService(context),
      taxDeclarationService: new TaxDeclarationService(context),
      taxSlabService: new TaxSlabService(context),
      salaryStructureService: new SalaryStructureService(context),
      payrollService: new PayrollService(context),
      payslipService: new PayslipService(context),
      holidayCalendarService: new HolidayCalendarService(context),
      overtimeService: new OvertimeService(context),
      reportService: new ReportService(context),
      salaryAssignmentService: new SalaryAssignmentService(context),
      weekendCalendarService: new WeekendCalendarService(context),
      documentService: new DocumentService(context),
      dashboardService: new DashboardService(context),
      permissionService: new PermissionService(context),
      permissionSummaryService: new PermissionSummaryService(context),
      wfhService: new WFHService(context),
      wfhSummaryService: new WFHSummaryService(context),
      shiftChangeService: new ShiftChangeService(context),
      optionalHolidayService: new OptionalHolidayService(context),
      payslipPdfService: new PayslipPdfService(context),
      salaryStatementService: new SalaryStatementService(context),
      taxSalaryContextService: new TaxSalaryContextService(context),
      communicationService: new CommunicationService(context),
      pmsTemplateService: new PmsTemplateService(context),
      cycleService: new CycleService(context),
      assignmentService: new AssignmentService(context),
      objectiveService: new ObjectiveService(context),
      quarterReviewService: new QuarterReviewService(context),
      annualDecisionService: new AnnualDecisionService(context),
      pmsCommunicationService: new PmsCommunicationService(context),
      delegationService: new DelegationService(context),
      pmsDashboardService: new PmsDashboardService(context),
      pmsBulkOperationsService: new PmsBulkOperationsService(context),
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
