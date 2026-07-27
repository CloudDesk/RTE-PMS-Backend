import * as ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import {
  PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS,
  PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS,
  PmsEmployeeProfileImportService,
  PmsEmployeeProfileWorkbookSheet,
  type PmsEmployeeProfileReferenceData,
} from '../../src/services/pmsEmployeeProfileImport.service';
import type { RequestContext } from '../../src/types/context';

const runPerformanceSuite =
  process.env.RUN_PMS_PROFILE_IMPORT_PERF === 'true' ? describe : describe.skip;
const thresholdMs = Number(
  process.env.PMS_PROFILE_IMPORT_PERF_THRESHOLD_MS ?? 180_000,
);

runPerformanceSuite('PMS employee profile maximum-size workbook performance', () => {
  jest.setTimeout(Math.max(thresholdMs + 60_000, 180_000));

  it(`validates ${PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS} profiles and ${PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS} career rows within the configured threshold`, async () => {
    const referenceData = buildReferenceData();
    const importService = new PmsEmployeeProfileImportService(context());
    const workbook = await importService.buildTemplateWorkbook({
      ...referenceData,
      generatedAt: new Date('2026-07-24T00:00:00.000Z'),
      generatedBy: 'Phase 8 performance test',
    });
    populateMaximumRows(workbook);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    expect(buffer.length).toBeLessThanOrEqual(10 * 1024 * 1024);

    const startedAt = performance.now();
    const result = await importService.validateWorkbookBuffer(
      buffer,
      referenceData,
    );
    const elapsedMs = performance.now() - startedAt;

    expect(result.canImport).toBe(true);
    expect(result.profileRowCount).toBe(PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS);
    expect(result.careerRowCount).toBe(PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS);
    expect(elapsedMs).toBeLessThanOrEqual(thresholdMs);
  });
});

function context(): RequestContext {
  return {
    requestId: 'pms-profile-import-performance-test',
    reqRole: 'ADMIN',
    user: {
      _id: new Types.ObjectId(),
      email: 'performance@test.local',
      name: 'Performance Test Admin',
      role: 'ADMIN',
      departmentId: 'HR',
      active: true,
      country: 'IN',
      currency: 'INR',
      licenseType: 'system',
      portalAccess: false,
    },
  };
}

function buildReferenceData(): PmsEmployeeProfileReferenceData {
  return {
    employees: Array.from(
      { length: PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS },
      (_, index) => ({
        employeeId: new Types.ObjectId().toString(),
        employeeCode: employeeCode(index),
        name: `Performance Employee ${index + 1}`,
        designation: 'Engineer',
        department: 'Engineering',
        managerCode: '',
        managerName: '',
        active: true,
      }),
    ),
    grades: [
      { code: 'G4', label: 'Grade 4', displayOrder: 1 },
      { code: 'G5', label: 'Grade 5', displayOrder: 2 },
    ],
  };
}

function populateMaximumRows(workbook: ExcelJS.Workbook): void {
  const profileSheet = workbook.getWorksheet(
    PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE,
  )!;
  const careerSheet = workbook.getWorksheet(
    PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION,
  )!;

  for (let index = 0; index < PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS; index += 1) {
    const code = employeeCode(index);
    profileSheet.addRow([code, 'G5', '', 2, 3, 'B.E.']);
    for (let careerIndex = 0; careerIndex < 5; careerIndex += 1) {
      careerSheet.addRow([
        code,
        2020 + careerIndex,
        careerIndex % 2 === 0 ? 'G4' : 'G5',
        'Engineering',
        'Product',
        careerIndex + 1,
      ]);
    }
  }
}

function employeeCode(index: number): string {
  return `PERF${String(index + 1).padStart(5, '0')}`;
}
