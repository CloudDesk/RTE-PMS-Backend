import { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.routes";
import { userRoutes } from "./user.routes";
// import { userProfileRoutes } from "./user-profile.routes";
// import { biometricAttendanceRoutes } from "./biometric-attendance.routes";
// import { leaveRoutes } from "./leave.routes";
// import { leaveSummaryRoutes } from "./leave-summary.routes";
// import { overtimeRoutes } from "./overtime.routes";
import { lovRoutes } from "./lov.routes";
import { pmsTemplateRoutes } from "./pms-template.routes";
import { cycleRoutes } from "./cycle.routes";
import { assignmentRoutes } from "./assignment.routes";
import { objectiveRoutes } from "./objective.routes";
import { quarterReviewRoutes } from "./quarterReview.routes";
import { quarterAssignmentRoutes } from "./quarterAssignment.routes";
import { annualDecisionRoutes } from "./annualDecision.routes";
// import { shiftRoutes } from "./shift.routes";
// import { trainingRoutes } from "./training.routes";
// import { trainingAttendanceRoutes } from "./training-attendance.routes";
// import { organizationRoutes } from "./organization.routes";
// import { salaryStructureRoutes } from "./salary-structure";
// import { salaryAssignmentRoutes } from "./salary-assignment";
// import { taxSlabRoutes } from "./tax-slab.routes";
// import { taxDeclarationRoutes } from "./tax-declaration";
// import { payrollRoutes } from "./payroll.routes";
// import { dataUnitRoutes } from "./data-unit.routes";
// import { collectionRoutes } from "./collections.routes";
// import { payslipRoutes } from "./payslip.routes";
// import { reportRoutes } from "./reports.routes";
// import { timesheetRoutes } from "./timesheet.routes";
// import { holidayCalendarRoutes } from "./holiday-calendar.routes";
// import { weekendCalendarRoutes } from "./weekend-calendar.routes";
// import { userResignationRoutes } from "./user-resignation.routes";
import { updateShiftAssignmentStatuses } from "../utilis/updateShiftAssignmentStatuses";
// import { attendanceRegularizeRoutes } from "./attendance-regularization.routes";
// import { attendanceOverrideRoutes } from "./attendance-override.routes";
import {
  AttendanceRecord,
  Leave,
  Payroll,
  Payslip,
  SalaryAssignment,
  ShiftAssignment,
  Timesheet,
  User,
} from "../models";
import { TaxDeclaration } from "../models/tax-declaration";
import { TimesheetFile } from "../models/timesheet-file.model";
// import { documentRoutes } from "./document.routes";
// import { bulkAttendanceUploadRoutes } from "./bulk-attendance-upload.routes";
import { dashboardRoutes } from "./dashboard.routes";
// import { dataMigrationRoutes } from "./data-migration.routes";
// import { permissionRoutes } from "./permission.routes";
// import { wfhRoutes } from "./wfh.routes";
// import { permissionSummaryRoutes } from "./permission-summary.routes";
// import { wfhSummaryRoutes } from "./wfh-summary.routes";
// import { shiftChangeRoutes } from "./shift-change.routes";
// import { optionalHolidayRoutes } from "./optional-holiday.routes";
// import finalSettlementRoutes from "./final-settlement.routes";
// import { communicationRoutes } from "./communication.routes";
import mongoose from "mongoose";

export async function routes(fastify: FastifyInstance) {
  fastify.register(authRoutes, { prefix: "/auth" });
  fastify.register(userRoutes, { prefix: "/users" });
  // fastify.register(userProfileRoutes, { prefix: "/user-profile" });
  // fastify.register(userResignationRoutes, { prefix: "/users-resignations" });
  // fastify.register(biometricAttendanceRoutes, { prefix: "/attendance" });
  // fastify.register(attendanceRegularizeRoutes, {
  //   prefix: "/attendance-regularizations",
  // });
  // fastify.register(attendanceOverrideRoutes);
  // fastify.register(leaveRoutes, { prefix: "/leaves" });
  // fastify.register(leaveSummaryRoutes, { prefix: "/leave-summary" });
  // fastify.register(overtimeRoutes, { prefix: "/overtime" });
  // fastify.register(payrollRoutes, { prefix: "/payroll" });
  fastify.register(lovRoutes, { prefix: "/lovs" });
  fastify.register(pmsTemplateRoutes, { prefix: "/pms/templates" });
  fastify.register(cycleRoutes, { prefix: "/pms/cycles" });
  fastify.register(assignmentRoutes, { prefix: "/pms/cycles" });
  fastify.register(objectiveRoutes, { prefix: "/pms/objectives" });
  fastify.register(quarterReviewRoutes, { prefix: "/pms/quarter-reviews" });
  fastify.register(quarterAssignmentRoutes, { prefix: "/pms/quarter-assignments" });
  fastify.register(annualDecisionRoutes, { prefix: "/pms/annual-assignments" });
  // fastify.register(shiftRoutes, { prefix: "/shifts" });
  // fastify.register(trainingRoutes, { prefix: "/trainings" });
  // fastify.register(trainingAttendanceRoutes, {
  //   prefix: "/training-attendance",
  // });
  // fastify.register(organizationRoutes, { prefix: "/organizations" });
  // fastify.register(salaryStructureRoutes, { prefix: "/salary-structure" });
  // fastify.register(salaryAssignmentRoutes, { prefix: "/salary-assignment" });
  // fastify.register(taxSlabRoutes, { prefix: "/tax-slab" });
  // fastify.register(taxDeclarationRoutes, { prefix: "/tax-declaration" });
  // fastify.register(dataUnitRoutes, { prefix: "/data-units" });
  // fastify.register(collectionRoutes, { prefix: "/collections" });
  // fastify.register(payslipRoutes, { prefix: "/payslip" });
  // fastify.register(reportRoutes, { prefix: "/reports" });
  // fastify.register(timesheetRoutes, { prefix: "/timesheet" });
  // fastify.register(holidayCalendarRoutes, { prefix: "/holiday-calendar" });
  // fastify.register(weekendCalendarRoutes, { prefix: "/weekend-calendar" });
  // fastify.register(documentRoutes, { prefix: "/documents" });
  // fastify.register(bulkAttendanceUploadRoutes, { prefix: "/bulk-upload" });
  fastify.register(dashboardRoutes, { prefix: "/dashboard" });
  // fastify.register(dataMigrationRoutes, { prefix: "/data-migration" });
  // fastify.register(permissionRoutes, { prefix: "/permissions" });
  // fastify.register(wfhRoutes, { prefix: "/wfh" });
  // fastify.register(permissionSummaryRoutes, { prefix: "/permission-summary" });
  // fastify.register(wfhSummaryRoutes, { prefix: "/wfh-summary" });
  // fastify.register(shiftChangeRoutes, { prefix: "/shift-changes" });
  // fastify.register(optionalHolidayRoutes, { prefix: "/optional-holidays" });
  // fastify.register(finalSettlementRoutes, { prefix: "/" });
  // fastify.register(communicationRoutes, { prefix: "/communications" });

  fastify.get("/dev/run-shift-cron", async (_request, reply) => {
    await updateShiftAssignmentStatuses();
    reply.send({
      success: true,
      message: "Shift assignment statuses updated.",
    });
  });
  fastify.get("/test", async (_request, reply) => {
    // Removed verbose logging - use request.log instead if needed
    reply.send("Hello World");
  });

  fastify.delete("/cleanup-users", async (request, reply) => {
    const userIds = [
      "6833fa49c09376954e12555b",
      "6835809bedcfe9adff1d9561",
      "6835809eedcfe9adff1d956d",
      "683580a1edcfe9adff1d957a",
      "683580a3edcfe9adff1d9587",
      "683580a6edcfe9adff1d9594",
      "683580aaedcfe9adff1d95a1",
      "683580acedcfe9adff1d95ae",
      "6848021dd90258110a73e805",
      "68480220d90258110a73e812",
      "68482cec636d191a6db11d55",
      "68482cee636d191a6db11d61",
      "68482cf0636d191a6db11d6e",
    ];

    try {
      await Promise.all([
        User.deleteMany({ _id: { $in: userIds } }),
        Payroll.deleteMany({ employeeId: { $in: userIds } }),
        AttendanceRecord.deleteMany({ userId: { $in: userIds } }),
        Leave.deleteMany({ userId: { $in: userIds } }),
        Payslip.deleteMany({ userId: { $in: userIds } }),
        SalaryAssignment.deleteMany({ employeeId: { $in: userIds } }),
        ShiftAssignment.deleteMany({ userId: { $in: userIds } }),
        TaxDeclaration.deleteMany({ employeeId: { $in: userIds } }),
        TimesheetFile.deleteMany({ userId: { $in: userIds } }),
        Timesheet.deleteMany({ userId: { $in: userIds } }),
      ]);

      return reply.send({
        success: true,
        message: "Deleted all related records for specified users",
      });
    } catch (err) {
      request.log.error(err);
      return reply
        .status(500)
        .send({ success: false, message: "Internal server error" });
    }
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

/*
puppeteer - pdf gen by html 

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Define output folder for PDFs
const PDF_OUTPUT_DIR = path.join(__dirname, '../public/pdfs');
if (!fs.existsSync(PDF_OUTPUT_DIR)) {
  fs.mkdirSync(PDF_OUTPUT_DIR, { recursive: true });
}
  
  fastify.get('/test', async (request, reply) => {
    try {
      console.log(`Generating Payslip PDF for: ${request.url}`);

      // Sample Payslip Data
      const payslipData = {
        employeeName: "Suresh Kumar",
        employeeId: "CD0143",
        payMonth: "March",
        payYear: "2025",
        payDate: "01/03/2025",
        basicSalary: 50000,
        hra: 15000,
        incomeTax: 1250,
        pf: 1200,
        netPay: 62550
      };

      // Correct way to use __dirname in CommonJS
      const templatePath = path.join(__dirname, "../templates/payslip.html");

      if (!fs.existsSync(templatePath)) {
        return reply.status(500).send({ error: "Payslip template not found" });
      }

      let template = fs.readFileSync(templatePath, "utf8");

      // Replace placeholders with actual data
      Object.keys(payslipData).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, "g"); // Global replace
        template = template.replace(regex, String(payslipData[key as keyof typeof payslipData]));
      });
      console.log("Generated HTML:", template);
      // Launch Puppeteer
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent(template, { waitUntil: "networkidle0" });

      const pdfFileName = `payslip_${payslipData.employeeId}_${payslipData.payMonth}_${payslipData.payYear}.pdf`;
      const pdfFilePath = path.join(PDF_OUTPUT_DIR, pdfFileName);

      await page.pdf({ path: pdfFilePath, format: "A4", printBackground: true });

      await browser.close();

      console.log(`Payslip PDF Generated: ${pdfFilePath}`);

      // Respond with File Download URL
      reply.send({
        message: "Payslip generated successfully!",
        downloadUrl: `http://localhost:3000/public/src/pdfs/${pdfFileName}`
      });
    } catch (error) {
      console.error("Error generating payslip:", error);
      reply.status(500).send({ error: "Internal Server Error" });
    }
  });
*/
