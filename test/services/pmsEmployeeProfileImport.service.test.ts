import * as ExcelJS from 'exceljs';
import mongoose, { Types } from 'mongoose';
import {
  PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS,
  PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS,
  PMS_EMPLOYEE_PROFILE_TEMPLATE_VERSION,
  PmsEmployeeProfileImportService,
  PmsEmployeeProfileWorkbookSheet,
  type PmsEmployeeProfileReferenceData,
} from '../../src/services/pmsEmployeeProfileImport.service';
import { PmsEmployeeProfileImport } from '../../src/models/pms-employee-profile-import.model';
import { PmsEmployeeProfileImportRow } from '../../src/models/pms-employee-profile-import-row.model';
import { PmsEmployeeCareerProfile } from '../../src/models/pms-employee-career-profile.model';
import type { RequestContext } from '../../src/types/context';
import * as userHierarchy from '../../src/utilis/userHierarchy';

const adminId = new Types.ObjectId();

function context(): RequestContext {
  return {
    requestId: 'pms-employee-profile-import-test',
    reqRole: 'ADMIN',
    user: {
      _id: adminId,
      email: 'admin@test.local',
      name: 'PMS Admin',
      role: 'ADMIN',
      departmentId: 'HR',
      active: true,
      country: 'IN',
      currency: 'INR',
      licenseType: 'employee',
      portalAccess: true,
    },
  };
}

function service() {
  return new PmsEmployeeProfileImportService(context());
}

const referenceData: PmsEmployeeProfileReferenceData = {
  employees: [
    {
      employeeId: new Types.ObjectId().toString(),
      employeeCode: 'RTE0001',
      name: 'Anita Rao',
      designation: 'Operations Manager',
      department: 'Operations',
      managerCode: 'RTE0009',
      managerName: 'Suresh Kumar',
      active: true,
    },
    {
      employeeId: new Types.ObjectId().toString(),
      employeeCode: 'RTE0002',
      name: 'John Mathew',
      designation: 'Engineer',
      department: 'Engineering',
      managerCode: 'RTE0001',
      managerName: 'Anita Rao',
      active: false,
    },
  ],
  grades: [
    { code: 'G4', label: 'Grade 4', displayOrder: 1 },
    { code: 'G5', label: 'Grade 5', displayOrder: 2 },
  ],
};

async function templateWorkbook() {
  return service().buildTemplateWorkbook({
    ...referenceData,
    generatedAt: new Date('2026-07-24T06:30:00.000Z'),
    generatedBy: 'ADM001 - PMS Admin',
  });
}

async function workbookBuffer(workbook: ExcelJS.Workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('PMS employee profile Phase 2 workbook template', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('generates the exact five-sheet versioned workbook with reference data', async () => {
    const workbook = await templateWorkbook();

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Instructions',
      'Employee Profile',
      'Career Progression Past',
      'Employee Reference',
      'Grade Reference',
    ]);
    expect(
      workbook
        .getWorksheet(PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS)
        ?.getCell('B2').value,
    ).toBe(PMS_EMPLOYEE_PROFILE_TEMPLATE_VERSION);
    expect(
      workbook.definedNames.getRanges('PmsProfileTemplateVersion').ranges,
    ).toContain('Instructions!$B$2');
    expect(
      workbook
        .getWorksheet(PmsEmployeeProfileWorkbookSheet.EMPLOYEE_REFERENCE)
        ?.getCell('A2').value,
    ).toBe('RTE0001');
    expect(
      workbook
        .getWorksheet(PmsEmployeeProfileWorkbookSheet.EMPLOYEE_REFERENCE)
        ?.getCell('A3').value,
    ).toBeNull();
    expect(
      workbook
        .getWorksheet(PmsEmployeeProfileWorkbookSheet.GRADE_REFERENCE)
        ?.getCell('A2').value,
    ).toBe('G4');

    const profileSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE,
    )!;
    const careerSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION,
    )!;
    expect((profileSheet as any).dataValidations.model).toHaveProperty(
      `A2:A${PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS + 1}`,
    );
    expect((careerSheet as any).dataValidations.model).toHaveProperty(
      `A2:A${PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS + 1}`,
    );
    expect((profileSheet as any).sheetProtection.sheet).toBe(true);
    expect((careerSheet as any).sheetProtection.sheet).toBe(true);
  });

  it('gives non-technical administrators clear completion and incremental-history guidance', async () => {
    const workbook = await templateWorkbook();
    const instructions = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS,
    )!;
    const profileSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE,
    )!;
    const careerSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION,
    )!;

    expect(instructions.getCell('A5').value).toBe(
      'START HERE — COMPLETE ONLY THE TWO BLUE TABS',
    );
    expect(instructions.getCell('B6').value).toContain(
      'Employee Profile: enter one row',
    );
    expect(instructions.getCell('B7').value).toContain(
      'Career Progression Past',
    );
    expect(instructions.getCell('B7').value).toContain('may be left blank');
    expect(instructions.getCell('C19').value).toBe('What to enter');
    expect(instructions.getCell('A26').value).toBe('Last verified date');
    expect(instructions.getCell('B26').value).toContain(
      'current server date automatically',
    );
    expect(instructions.getCell('C36').value).toContain(
      'same employee has movements with different grades in the same year',
    );
    expect(instructions.getCell('B29').value).toContain(
      'Do not repeat the same Employee Code + Year + Grade combination',
    );
    expect(instructions.getCell('B39').value).toContain(
      'Career Progression Past is incremental',
    );
    expect(instructions.getCell('B40').value).toContain(
      'Nothing is saved when the workbook has a blocking error',
    );
    expect(profileSheet.getCell('A1').note).toContain(
      'one profile row per employee',
    );
    expect(profileSheet.getCell('F1').value).toBe('Qualification');
    expect(profileSheet.getCell('G1').value).toBeNull();
    expect(careerSheet.getCell('F1').note).toContain(
      'worksheet row order is used',
    );
  });

  it('validates a correctly populated workbook and resolves current employee data', async () => {
    const workbook = await templateWorkbook();
    const profileSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE,
    )!;
    profileSheet.addRow([
      'RTE0001',
      'G5',
      new Date('2024-04-01T00:00:00.000Z'),
      '',
      3.5,
      'B.E. Mechanical',
    ]);
    const careerSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION,
    )!;
    careerSheet.addRow(['RTE0001', 2024, 'G5', 'Operations', 'Plant 2', 1]);

    const result = await service().validateWorkbookBuffer(
      await workbookBuffer(workbook),
      referenceData,
    );

    expect(result.canImport).toBe(true);
    expect(result.validCount).toBe(1);
    expect(result.invalidCount).toBe(0);
    expect(result.profiles[0]).toMatchObject({
      employeeCode: 'RTE0001',
      employeeName: 'Anita Rao',
      designation: 'Operations Manager',
      managerName: 'Suresh Kumar',
      currentGrade: 'G5',
      previousExperienceYears: 3.5,
    });
    const now = new Date();
    expect(result.profiles[0].asOfDate).toEqual(
      new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
    );
    expect(result.profiles[0].careerProgressionPast).toHaveLength(1);
  });

  it('accepts Employee Profile data when optional Career Progression Past is blank', async () => {
    const workbook = await templateWorkbook();
    workbook
      .getWorksheet(PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE)!
      .addRow([
        'RTE0001',
        'G4',
        '',
        2,
        3,
        'B.E. Mechanical',
      ]);

    const result = await service().validateWorkbookBuffer(
      await workbookBuffer(workbook),
      referenceData,
    );

    expect(result.canImport).toBe(true);
    expect(result.validCount).toBe(1);
    expect(result.careerRowCount).toBe(0);
    expect(result.profiles[0].careerProgressionPast).toEqual([]);
  });

  it('returns actionable blocking errors, including inactive employees', async () => {
    const workbook = await templateWorkbook();
    const profileSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE,
    )!;
    profileSheet.addRow([
      'RTE0002',
      'INVALID',
      '',
      '',
      -1,
      'B.Sc.',
    ]);

    const result = await service().validateWorkbookBuffer(
      await workbookBuffer(workbook),
      referenceData,
    );
    const issueCodes = result.issues.map((issue) => issue.code);

    expect(result.canImport).toBe(false);
    expect(result.invalidCount).toBe(1);
    expect(issueCodes).toEqual(
      expect.arrayContaining([
        'EMPLOYEE_INACTIVE',
        'GRADE_NOT_FOUND',
        'NUMBER_OUT_OF_RANGE',
        'GRADE_TENURE_SOURCE_REQUIRED',
      ]),
    );
  });

  it('rejects a workbook with a missing required sheet and version name', async () => {
    const workbook = await templateWorkbook();
    workbook.removeWorksheet(
      workbook.getWorksheet(PmsEmployeeProfileWorkbookSheet.GRADE_REFERENCE)!.id,
    );
    workbook.definedNames.remove(
      "'Instructions'!$B$2",
      'PmsProfileTemplateVersion',
    );

    const result = await service().validateWorkbookBuffer(
      await workbookBuffer(workbook),
      referenceData,
    );
    const issueCodes = result.issues.map((issue) => issue.code);

    expect(result.canImport).toBe(false);
    expect(issueCodes).toEqual(
      expect.arrayContaining([
        'SHEET_MISSING',
        'TEMPLATE_VERSION_NAME_MISSING',
      ]),
    );
  });

  it('rejects formulas and duplicate employee/year/grade career rows', async () => {
    const workbook = await templateWorkbook();
    const profileSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE,
    )!;
    profileSheet.addRow([
      'RTE0001',
      'G5',
      new Date('2024-04-01T00:00:00.000Z'),
      '',
      3,
      { formula: '="B.E."', result: 'B.E.' },
    ]);
    const careerSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION,
    )!;
    careerSheet.addRow(['RTE0001', 2024, 'G5', '', '', 1]);
    careerSheet.addRow(['RTE0001', 2024, 'G5', '', '', 2]);

    const result = await service().validateWorkbookBuffer(
      await workbookBuffer(workbook),
      referenceData,
    );
    const issueCodes = result.issues.map((issue) => issue.code);

    expect(result.canImport).toBe(false);
    expect(issueCodes).toEqual(
      expect.arrayContaining([
        'FORMULA_NOT_ALLOWED',
        'DUPLICATE_CAREER_YEAR_GRADE',
      ]),
    );
  });

  it('accepts the same employee and year when the career grade differs', async () => {
    const workbook = await templateWorkbook();
    workbook
      .getWorksheet(PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE)!
      .addRow(['RTE0001', 'G5', '', 2, 3, 'B.E. Mechanical']);
    const careerSheet = workbook.getWorksheet(
      PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION,
    )!;
    careerSheet.addRow(['RTE0001', 2024, 'G4', '', '', 1]);
    careerSheet.addRow(['RTE0001', 2024, 'G5', '', '', 2]);

    const result = await service().validateWorkbookBuffer(
      await workbookBuffer(workbook),
      referenceData,
    );

    expect(result.canImport).toBe(true);
    expect(result.profiles[0].careerProgressionPast).toHaveLength(2);
    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_CAREER_YEAR_GRADE' }),
      ]),
    );
  });

  it('preserves stored career history and appends only new imported movements', async () => {
    const validation = careerMergeValidation([
      {
        rowNumber: 2,
        employeeCode: 'RTE0001',
        year: 2025,
        grade: 'G5',
        function: 'Operations',
        unitOrDepartment: 'Plant 2',
        sequence: 1,
      },
    ]);
    mockExistingCareerProfile([
      { year: 2020, grade: 'G2', sequence: 1 },
      { year: 2023, grade: 'G4', sequence: 1 },
      { year: 2024, grade: 'G4', sequence: 1 },
    ]);

    await (service() as any).mergeExistingCareerHistoryForImport(validation);

    expect(validation.canImport).toBe(true);
    expect(validation.profiles[0].sourceProfileVersion).toBe(4);
    expect(validation.profiles[0].submittedCareerProgressionPast).toHaveLength(1);
    expect(
      validation.profiles[0].careerProgressionPast.map(
        (entry: any) => `${entry.year}-${entry.grade}`,
      ),
    ).toEqual(['2020-G2', '2023-G4', '2024-G4', '2025-G5']);
  });

  it('keeps an identical stored Year and Grade once and reports a warning', async () => {
    const validation = careerMergeValidation([
      {
        rowNumber: 2,
        employeeCode: 'RTE0001',
        year: 2024,
        grade: 'g4',
        function: ' operations ',
        unitOrDepartment: 'plant 2',
        sequence: 9,
      },
    ]);
    mockExistingCareerProfile([
      {
        year: 2024,
        grade: 'G4',
        function: 'Operations',
        unitOrDepartment: 'Plant 2',
        sequence: 1,
      },
    ]);

    await (service() as any).mergeExistingCareerHistoryForImport(validation);

    expect(validation.canImport).toBe(true);
    expect(validation.warningCount).toBe(1);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CAREER_HISTORY_ALREADY_EXISTS' }),
      ]),
    );
    expect(validation.profiles[0].careerProgressionPast).toHaveLength(1);
    expect(validation.profiles[0].careerProgressionPast[0].sequence).toBe(1);
  });

  it('blocks an imported Year and Grade that conflicts with stored history details', async () => {
    const validation = careerMergeValidation([
      {
        rowNumber: 2,
        employeeCode: 'RTE0001',
        year: 2024,
        grade: 'G4',
        function: 'Engineering',
        unitOrDepartment: 'Plant 3',
        sequence: 1,
      },
    ]);
    mockExistingCareerProfile([
      {
        year: 2024,
        grade: 'G4',
        function: 'Operations',
        unitOrDepartment: 'Plant 2',
        sequence: 1,
      },
    ]);

    await (service() as any).mergeExistingCareerHistoryForImport(validation);

    expect(validation.canImport).toBe(false);
    expect(validation.invalidCount).toBe(1);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CAREER_HISTORY_CONFLICT' }),
      ]),
    );
  });

  it('keeps all stored history when the later workbook has no career rows', async () => {
    const validation = careerMergeValidation([]);
    mockExistingCareerProfile([
      { year: 2020, grade: 'G2', sequence: 1 },
      { year: 2024, grade: 'G4', sequence: 1 },
    ]);

    await (service() as any).mergeExistingCareerHistoryForImport(validation);

    expect(validation.canImport).toBe(true);
    expect(validation.profiles[0].submittedCareerProgressionPast).toEqual([]);
    expect(validation.profiles[0].careerProgressionPast).toHaveLength(2);
  });

  it('generates a structured validation error workbook from an import audit', async () => {
    jest.spyOn(PmsEmployeeProfileImport, 'findById').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        validationIssues: [
          {
            severity: 'ERROR',
            sheet: 'Employee Profile',
            rowNumber: 8,
            employeeCode: 'RTE0142',
            column: 'Current Grade *',
            code: 'GRADE_NOT_FOUND',
            message: 'Current Grade must exist in the PMS Grade LOV',
          },
        ],
      }),
    } as any);

    const buffer = await service().generateValidationErrorReport(
      new Types.ObjectId().toString(),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet('Validation Errors')!;

    expect(sheet.getRow(1).values).toEqual(
      expect.arrayContaining(['Severity', 'Employee Code', 'Message']),
    );
    expect(sheet.getCell('F2').value).toBe('GRADE_NOT_FOUND');
  });

  it('confirms staged rows transactionally with created, updated, and unchanged counts', async () => {
    const importId = new Types.ObjectId();
    const now = new Date();
    const confirmationDate = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
    const employeeIds = [
      new Types.ObjectId(),
      new Types.ObjectId(),
      new Types.ObjectId(),
    ];
    const stagedRows = employeeIds.map((employeeId, index) => ({
      _id: new Types.ObjectId(),
      importId,
      employeeId,
      employeeCode: `RTE100${index + 1}`,
      sourceRowNumber: index + 2,
      currentGrade: index === 1 ? 'G5' : 'G4',
      yearsInGrade: index + 1,
      previousExperienceYears: index,
      qualification: index === 1 ? undefined : 'B.E.',
      asOfDate: confirmationDate,
      sourceProfileVersion: index === 0 ? 1 : index === 1 ? 3 : 0,
      careerProgressionPast: [],
    }));
    const existingProfiles = [
      {
        _id: new Types.ObjectId(),
        employeeId: employeeIds[0],
        employeeCode: 'RTE1001',
        currentGrade: 'G4',
        yearsInGrade: 1,
        previousExperienceYears: 0,
        qualification: 'B.E.',
        asOfDate: confirmationDate,
        careerProgressionPast: [],
        profileVersion: 1,
      },
      {
        _id: new Types.ObjectId(),
        employeeId: employeeIds[1],
        employeeCode: 'RTE1002',
        currentGrade: 'G4',
        yearsInGrade: 8,
        previousExperienceYears: 1,
        qualification: 'Old qualification',
        asOfDate: confirmationDate,
        careerProgressionPast: [],
        profileVersion: 3,
      },
    ];

    jest.spyOn(PmsEmployeeProfileImport, 'findById').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: importId,
        status: 'VALIDATED',
        counts: {
          validProfiles: 3,
          createdProfiles: 0,
          updatedProfiles: 0,
          unchangedProfiles: 0,
          failedProfiles: 0,
        },
      }),
    } as any);
    jest.spyOn(PmsEmployeeProfileImportRow, 'find').mockReturnValueOnce({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(stagedRows),
      }),
    } as any);
    const importService = service();
    jest.spyOn(importService as any, 'loadReferenceData').mockResolvedValue({
      employees: employeeIds.map((employeeId, index) => ({
        employeeId: employeeId.toString(),
        employeeCode: `RTE100${index + 1}`,
        name: `Employee ${index + 1}`,
        designation: 'Engineer',
        department: 'Engineering',
        managerCode: '',
        managerName: '',
        active: true,
      })),
      grades: [
        { code: 'G4', label: 'Grade 4', displayOrder: 1 },
        { code: 'G5', label: 'Grade 5', displayOrder: 2 },
      ],
    });
    jest
      .spyOn(PmsEmployeeProfileImport, 'findOneAndUpdate')
      .mockResolvedValue({ _id: importId } as any);
    jest.spyOn(PmsEmployeeCareerProfile, 'find').mockReturnValueOnce({
      session: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(existingProfiles),
      }),
    } as any);
    const bulkWrite = jest
      .spyOn(PmsEmployeeCareerProfile, 'bulkWrite')
      .mockResolvedValue({ modifiedCount: 1 } as any);
    jest
      .spyOn(PmsEmployeeProfileImport, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as any);
    const session = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as any);

    const result = await importService.confirmImport(importId.toString());

    expect(result).toMatchObject({
      createdProfiles: 1,
      updatedProfiles: 1,
      unchangedProfiles: 1,
      failedProfiles: 0,
    });
    expect(bulkWrite).toHaveBeenCalledTimes(1);
    const operations = bulkWrite.mock.calls[0][0] as any[];
    expect(operations).toHaveLength(2);
    expect(operations.some((operation) => operation.insertOne)).toBe(true);
    expect(
      operations.some(
        (operation) => operation.updateOne?.update?.$unset?.qualification === 1,
      ),
    ).toBe(true);
    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('blocks confirmation when the stored profile changed after incremental validation', async () => {
    const importId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    jest.spyOn(PmsEmployeeProfileImport, 'findById').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: importId,
        status: 'VALIDATED',
        confirmationAttemptCount: 0,
        counts: { validProfiles: 1 },
      }),
    } as any);
    jest.spyOn(PmsEmployeeProfileImportRow, 'find').mockReturnValueOnce({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            importId,
            employeeId,
            employeeCode: 'RTE1999',
            sourceRowNumber: 2,
            currentGrade: 'G4',
            yearsInGrade: 2,
            asOfDate: new Date('2026-07-25T00:00:00.000Z'),
            sourceProfileVersion: 2,
            submittedCareerProgressionPast: [
              { year: 2025, grade: 'G4', sequence: 1 },
            ],
            careerProgressionPast: [
              { year: 2025, grade: 'G4', sequence: 1 },
            ],
          },
        ]),
      }),
    } as any);
    const importService = service();
    jest.spyOn(importService as any, 'loadReferenceData').mockResolvedValue({
      employees: [
        {
          employeeId: employeeId.toString(),
          employeeCode: 'RTE1999',
          name: 'Changed Employee',
          designation: 'Engineer',
          department: 'Engineering',
          managerCode: '',
          managerName: '',
          active: true,
        },
      ],
      grades: [{ code: 'G4', label: 'Grade 4', displayOrder: 1 }],
    });
    jest
      .spyOn(PmsEmployeeProfileImport, 'findOneAndUpdate')
      .mockResolvedValue({ _id: importId } as any);
    jest.spyOn(PmsEmployeeCareerProfile, 'find').mockReturnValueOnce({
      session: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            employeeId,
            profileVersion: 3,
          },
        ]),
      }),
    } as any);
    const bulkWrite = jest.spyOn(PmsEmployeeCareerProfile, 'bulkWrite');
    jest
      .spyOn(PmsEmployeeProfileImport, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as any);
    const session = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as any);

    await expect(
      importService.confirmImport(importId.toString()),
    ).rejects.toThrow(
      'Career profile for RTE1999 changed after validation. Validate the workbook again.',
    );
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('retries a failed import from its retained validated rows', async () => {
    const importId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    const stagedRows = [
      {
        _id: new Types.ObjectId(),
        importId,
        employeeId,
        employeeCode: 'RTE2001',
        sourceRowNumber: 2,
        currentGrade: 'G4',
        yearsInGrade: 2,
        previousExperienceYears: 1,
        qualification: 'B.E.',
        asOfDate: new Date('2026-07-24T00:00:00.000Z'),
        careerProgressionPast: [],
      },
    ];

    jest.spyOn(PmsEmployeeProfileImport, 'findById').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: importId,
        status: 'FAILED',
        confirmationAttemptCount: 1,
        counts: {
          validProfiles: 1,
          createdProfiles: 0,
          updatedProfiles: 0,
          unchangedProfiles: 0,
          failedProfiles: 1,
        },
      }),
    } as any);
    jest.spyOn(PmsEmployeeProfileImportRow, 'find').mockReturnValueOnce({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(stagedRows),
      }),
    } as any);
    const importService = service();
    jest.spyOn(importService as any, 'loadReferenceData').mockResolvedValue({
      employees: [
        {
          employeeId: employeeId.toString(),
          employeeCode: 'RTE2001',
          name: 'Recovery Employee',
          designation: 'Engineer',
          department: 'Engineering',
          managerCode: '',
          managerName: '',
          active: true,
        },
      ],
      grades: [{ code: 'G4', label: 'Grade 4', displayOrder: 1 }],
    });
    const lock = jest
      .spyOn(PmsEmployeeProfileImport, 'findOneAndUpdate')
      .mockResolvedValue({ _id: importId } as any);
    jest.spyOn(PmsEmployeeCareerProfile, 'find').mockReturnValueOnce({
      session: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    } as any);
    jest
      .spyOn(PmsEmployeeCareerProfile, 'bulkWrite')
      .mockResolvedValue({ insertedCount: 1, modifiedCount: 0 } as any);
    jest
      .spyOn(PmsEmployeeProfileImport, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as any);
    const session = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as any);

    const result = await importService.confirmImport(importId.toString());

    expect(result).toMatchObject({
      status: 'COMPLETED',
      recovered: true,
      confirmationAttemptCount: 2,
      createdProfiles: 1,
      failedProfiles: 0,
    });
    expect(lock.mock.calls[0][0]).toMatchObject({
      _id: importId,
      status: { $in: ['VALIDATED', 'FAILED', 'IMPORT_QUEUED'] },
    });
    expect(lock.mock.calls[0][1]).toMatchObject({
      $set: {
        status: 'IMPORTING',
        recoveredAt: expect.any(Date),
        'counts.failedProfiles': 0,
      },
      $inc: { version: 1, confirmationAttemptCount: 1 },
    });
  });

  it('marks a failed confirmation attempt without deleting its staged rows', async () => {
    const importId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    const stagedRows = [
      {
        _id: new Types.ObjectId(),
        importId,
        employeeId,
        employeeCode: 'RTE3001',
        sourceRowNumber: 2,
        currentGrade: 'G4',
        yearsInGrade: 2,
        asOfDate: new Date('2026-07-24T00:00:00.000Z'),
        careerProgressionPast: [],
      },
    ];

    jest.spyOn(PmsEmployeeProfileImport, 'findById').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: importId,
        status: 'VALIDATED',
        confirmationAttemptCount: 0,
        counts: { validProfiles: 1 },
      }),
    } as any);
    const stagedFind = jest
      .spyOn(PmsEmployeeProfileImportRow, 'find')
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(stagedRows),
        }),
      } as any);
    const importService = service();
    jest.spyOn(importService as any, 'loadReferenceData').mockResolvedValue({
      employees: [
        {
          employeeId: employeeId.toString(),
          employeeCode: 'RTE3001',
          name: 'Failure Employee',
          designation: 'Engineer',
          department: 'Engineering',
          managerCode: '',
          managerName: '',
          active: true,
        },
      ],
      grades: [{ code: 'G4', label: 'Grade 4', displayOrder: 1 }],
    });
    const failureUpdate = jest
      .spyOn(PmsEmployeeProfileImport, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as any);
    const session = {
      withTransaction: jest
        .fn()
        .mockRejectedValue(new Error('database write unavailable')),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(mongoose, 'startSession').mockResolvedValue(session as any);

    await expect(
      importService.confirmImport(importId.toString()),
    ).rejects.toThrow('database write unavailable');

    expect(failureUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: importId }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'database write unavailable',
          'counts.failedProfiles': 1,
        }),
        $inc: { version: 1, confirmationAttemptCount: 1 },
      }),
    );
    expect(stagedFind).toHaveBeenCalledTimes(1);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
});

function careerMergeValidation(careerProgressionPast: any[]): any {
  return {
    templateVersion: PMS_EMPLOYEE_PROFILE_TEMPLATE_VERSION,
    profileRowCount: 1,
    careerRowCount: careerProgressionPast.length,
    validCount: 1,
    invalidCount: 0,
    warningCount: 0,
    canImport: true,
    issues: [],
    profiles: [
      {
        rowNumber: 2,
        employeeId: referenceData.employees[0].employeeId,
        employeeCode: 'RTE0001',
        currentGrade: 'G5',
        yearsInGrade: 1,
        asOfDate: new Date('2026-07-25T00:00:00.000Z'),
        careerProgressionPast,
        valid: true,
        errors: [],
        warnings: [],
      },
    ],
  };
}

function mockExistingCareerProfile(careerProgressionPast: any[]) {
  jest.spyOn(PmsEmployeeCareerProfile, 'find').mockReturnValueOnce({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        {
          employeeId: new Types.ObjectId(referenceData.employees[0].employeeId),
          profileVersion: 4,
          careerProgressionPast,
        },
      ]),
    }),
  } as any);
}

describe('PMS employee profile Phase 4 manual validation', () => {
  const activeGrades = new Map([
    ['g4', 'G4'],
    ['g5', 'G5'],
  ]);

  it('normalizes a valid manual profile using the same grade and career rules', () => {
    const result = (service() as any).validateManualProfileInput(
      {
        reasonForChange: 'Corrected from the approved HR source record',
        currentGrade: 'g5',
        gradeEffectiveDate: '01/04/2024',
        previousExperienceYears: 3.5,
        qualification: 'B.E. Mechanical',
        careerProgressionPast: [
          {
            year: 2023,
            grade: 'g4',
            function: 'Operations',
            unitOrDepartment: 'Plant 2',
            sequence: 1,
          },
        ],
      },
      activeGrades,
    );

    expect(result.currentGrade).toBe('G5');
    expect(result.careerProgressionPast[0].grade).toBe('G4');
    expect(result.previousExperienceYears).toBe(3.5);
  });

  it('rejects an inactive grade', () => {
    expect(() =>
      (service() as any).validateManualProfileInput(
        {
          reasonForChange: 'Manual correction',
          currentGrade: 'G5',
          yearsInGrade: 2,
          careerProgressionPast: [
            { year: 2024, grade: 'G4', sequence: 1 },
            { year: 2024, grade: 'G6', sequence: 1 },
          ],
        },
        activeGrades,
      ),
    ).toThrow();
  });

  it('rejects duplicate career year and grade even when sequence differs', () => {
    expect(() =>
      (service() as any).validateManualProfileInput(
        {
          reasonForChange: 'Manual correction',
          currentGrade: 'G5',
          yearsInGrade: 2,
          careerProgressionPast: [
            { year: 2024, grade: 'G4', sequence: 1 },
            { year: 2024, grade: 'g4', sequence: 2 },
          ],
        },
        activeGrades,
      ),
    ).toThrow('Each Year + Grade combination can appear only once');
  });

  it('accepts the same career year when the grade differs', () => {
    const result = (service() as any).validateManualProfileInput(
      {
        reasonForChange: 'Manual correction',
        currentGrade: 'G5',
        yearsInGrade: 2,
        careerProgressionPast: [
          { year: 2024, grade: 'G4', sequence: 1 },
          { year: 2024, grade: 'G5', sequence: 2 },
        ],
      },
      activeGrades,
    );

    expect(result.careerProgressionPast).toHaveLength(2);
  });

  it('requires either grade effective date or years in grade', () => {
    expect(() =>
      (service() as any).validateManualProfileInput(
        {
          reasonForChange: 'Create initial career profile',
          currentGrade: 'G4',
          careerProgressionPast: [],
        },
        activeGrades,
      ),
    ).toThrow(
      'Years in Grade is required when Grade Effective Date is unavailable',
    );
  });
});

describe('PMS employee profile Phase 5 visibility authorization', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function visibilityService(role: string, scope?: string) {
    return new PmsEmployeeProfileImportService({
      ...context(),
      reqRole: role,
      user: {
        ...context().user!,
        role,
        scope,
      },
    });
  }

  it('allows a direct or higher reporting manager to view a subordinate profile', async () => {
    const employeeId = new Types.ObjectId();
    jest
      .spyOn(userHierarchy, 'getSubordinateUserIds')
      .mockResolvedValue([employeeId]);

    await expect(
      (visibilityService('MANAGER') as any).assertCareerProfileViewAccess(
        employeeId.toString(),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects an unrelated manager', async () => {
    jest
      .spyOn(userHierarchy, 'getSubordinateUserIds')
      .mockResolvedValue([new Types.ObjectId()]);

    await expect(
      (visibilityService('MANAGER') as any).assertCareerProfileViewAccess(
        new Types.ObjectId().toString(),
      ),
    ).rejects.toThrow('not in your reporting hierarchy');
  });

  it('allows management-wide and executive-scope viewers without hierarchy lookup', async () => {
    const hierarchySpy = jest.spyOn(userHierarchy, 'getSubordinateUserIds');
    const employeeId = new Types.ObjectId().toString();

    await expect(
      (visibilityService('MANAGEMENT') as any).assertCareerProfileViewAccess(
        employeeId,
      ),
    ).resolves.toBeUndefined();
    await expect(
      (visibilityService('MANAGER', 'EXECUTIVE') as any).assertCareerProfileViewAccess(
        employeeId,
      ),
    ).resolves.toBeUndefined();
    expect(hierarchySpy).not.toHaveBeenCalled();
  });

  it('does not expose this management view to employees', async () => {
    await expect(
      (visibilityService('EMPLOYEE') as any).assertCareerProfileViewAccess(
        new Types.ObjectId().toString(),
      ),
    ).rejects.toThrow('not in your reporting hierarchy');
  });
});
