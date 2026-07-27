import { Types } from 'mongoose';
import {
  PmsEmployeeCareerProfile,
  PmsEmployeeProfileUpdateSource,
} from '../../src/models/pms-employee-career-profile.model';
import {
  PmsEmployeeProfileImport,
  PmsEmployeeProfileImportIssueSeverity,
  PmsEmployeeProfileImportStatus,
} from '../../src/models/pms-employee-profile-import.model';
import { PmsEmployeeProfileImportRow } from '../../src/models/pms-employee-profile-import-row.model';
import { PmsEmployeeProfileImportFile } from '../../src/models/pms-employee-profile-import-file.model';
import {
  PmsEmployeeCareerProfileChange,
  PmsEmployeeCareerProfileChangeAction,
} from '../../src/models/pms-employee-career-profile-change.model';
import {
  AnnualAssignment,
  EmployeeCareerProfileSnapshotTrigger,
} from '../../src/models/pms-annual-assignment.model';

describe('PMS employee career profile data foundation', () => {
  it('accepts a valid manually maintained profile with embedded career history', async () => {
    const profile = new PmsEmployeeCareerProfile({
      employeeId: new Types.ObjectId(),
      employeeCode: 'RTE0123',
      currentGrade: 'G5',
      gradeEffectiveDate: new Date('2024-04-01T00:00:00.000Z'),
      previousExperienceYears: 4.5,
      qualification: 'B.E. Mechanical',
      asOfDate: new Date('2026-04-01T00:00:00.000Z'),
      careerProgressionPast: [
        {
          year: 2024,
          grade: 'G5',
          function: 'Operations',
          unitOrDepartment: 'Plant 2',
          sequence: 1,
        },
      ],
      lastUpdatedSource: PmsEmployeeProfileUpdateSource.MANUAL_EDIT,
    });

    await expect(profile.validate()).resolves.toBeUndefined();
    expect(profile.profileVersion).toBe(1);
  });

  it('requires Years in Grade when Grade Effective Date is unavailable', async () => {
    const profile = new PmsEmployeeCareerProfile({
      employeeId: new Types.ObjectId(),
      employeeCode: 'RTE0124',
      currentGrade: 'G4',
      asOfDate: new Date('2026-04-01T00:00:00.000Z'),
      lastUpdatedSource: PmsEmployeeProfileUpdateSource.MANUAL_EDIT,
    });

    await expect(profile.validate()).rejects.toThrow(
      'Years in Grade is required when Grade Effective Date is unavailable',
    );
  });

  it('rejects invalid or duplicate career history and future career years', async () => {
    const profile = new PmsEmployeeCareerProfile({
      employeeId: new Types.ObjectId(),
      employeeCode: 'RTE0125',
      currentGrade: 'G5',
      yearsInGrade: 2,
      asOfDate: new Date('2026-04-01T00:00:00.000Z'),
      careerProgressionPast: [
        { year: 2027, sequence: 1 },
        { year: 2027, grade: 'G5', sequence: 1 },
        { year: 2027, grade: 'g5', sequence: 2 },
      ],
      lastUpdatedSource: PmsEmployeeProfileUpdateSource.MANUAL_EDIT,
    });

    const error = await profile.validate().catch((validationError) => validationError);
    expect(error).toBeDefined();
    const errorPaths = Object.keys(error.errors);
    expect(errorPaths.some((path) => path.endsWith('.grade'))).toBe(true);
    expect(errorPaths.some((path) => path.endsWith('.year'))).toBe(true);
    expect(
      Object.values(error.errors).some((item: any) =>
        String(item.message).includes(
          'Career progression requires Grade, Progression, Function, or Unit / Department',
        ),
      ),
    ).toBe(true);
  });

  it('requires an import reference for an Excel-imported profile', async () => {
    const profile = new PmsEmployeeCareerProfile({
      employeeId: new Types.ObjectId(),
      employeeCode: 'RTE0126',
      currentGrade: 'G6',
      yearsInGrade: 1,
      asOfDate: new Date('2026-04-01T00:00:00.000Z'),
      lastUpdatedSource: PmsEmployeeProfileUpdateSource.EXCEL_IMPORT,
    });

    await expect(profile.validate()).rejects.toThrow(
      'Source Import is required for an Excel-imported profile',
    );
  });

  it('defines one unique employee profile and supporting lookup indexes', () => {
    const indexes = PmsEmployeeCareerProfile.schema.indexes();
    const employeeIndex = indexes.find(
      ([fields]) => fields.employeeId === 1,
    );
    const employeeCodeIndex = indexes.find(
      ([fields]) => fields.employeeCode === 1,
    );

    expect(employeeIndex?.[1]?.unique).toBe(true);
    expect(employeeCodeIndex?.[1]?.unique).toBe(true);
  });

  it('defines a validated cycle snapshot on the annual assignment', async () => {
    const assignment = new AnnualAssignment({
      employeeId: new Types.ObjectId(),
      assignedManagerId: new Types.ObjectId(),
      cycleId: new Types.ObjectId(),
      applicableTerms: ['Q1'],
      careerProfileSnapshot: {
        profileAvailable: true,
        sourceProfileId: new Types.ObjectId(),
        profileVersion: 2,
        currentGrade: 'G5',
        yearsInGradeAtReferenceDate: 1.5,
        previousExperienceYears: 4,
        qualification: 'B.E.',
        careerProgressionPast: [
          {
            year: 2024,
            grade: 'G4',
            function: 'Operations',
            unitOrDepartment: 'Plant 1',
            sequence: 1,
          },
        ],
        profileAsOfDate: new Date('2026-03-31T00:00:00.000Z'),
        snapshotAt: new Date('2026-04-01T00:00:00.000Z'),
        trigger:
          EmployeeCareerProfileSnapshotTrigger
            .FIRST_MANAGER_REVIEW_SUBMISSION,
      },
    });

    await expect(assignment.validate()).resolves.toBeUndefined();
    expect(assignment.careerProfileSnapshot?.profileVersion).toBe(2);
    expect(
      AnnualAssignment.schema.path('careerProfileSnapshot.snapshotAt'),
    ).toBeDefined();
  });
});

describe('PMS employee profile import audit data foundation', () => {
  it('creates an upload audit with deterministic defaults', async () => {
    const importAudit = new PmsEmployeeProfileImport({
      originalFileName: 'employee-career-profiles.xlsx',
      fileChecksum: 'ABCDEF123456',
      templateVersion: '1.0',
      uploadedBy: new Types.ObjectId(),
    });

    await expect(importAudit.validate()).resolves.toBeUndefined();
    expect(importAudit.status).toBe(PmsEmployeeProfileImportStatus.UPLOADED);
    expect(importAudit.fileChecksum).toBe('abcdef123456');
    expect(importAudit.counts.profileRows).toBe(0);
    expect(importAudit.confirmationAttemptCount).toBe(0);
    expect(importAudit.validationAttemptCount).toBe(0);
    expect(importAudit.progress.percent).toBe(0);
    expect(importAudit.validationIssues).toEqual([]);
  });

  it('stores confirmation recovery audit metadata', async () => {
    const actorId = new Types.ObjectId();
    const attemptedAt = new Date('2026-07-24T12:00:00.000Z');
    const importAudit = new PmsEmployeeProfileImport({
      originalFileName: 'employee-career-profiles.xlsx',
      fileChecksum: 'abcdef123456',
      templateVersion: '1.1',
      status: PmsEmployeeProfileImportStatus.COMPLETED,
      uploadedBy: actorId,
      confirmationAttemptCount: 2,
      lastAttemptedAt: attemptedAt,
      lastAttemptedBy: actorId,
      lastFailedAt: new Date('2026-07-24T11:55:00.000Z'),
      recoveredAt: attemptedAt,
    });

    await expect(importAudit.validate()).resolves.toBeUndefined();
    expect(importAudit.confirmationAttemptCount).toBe(2);
    expect(importAudit.recoveredAt).toEqual(attemptedAt);
  });

  it('stores structured validation issues for later import phases', async () => {
    const importAudit = new PmsEmployeeProfileImport({
      originalFileName: 'employee-career-profiles.xlsx',
      fileChecksum: 'abcdef123456',
      templateVersion: '1.0',
      status: PmsEmployeeProfileImportStatus.VALIDATION_FAILED,
      uploadedBy: new Types.ObjectId(),
      validationIssues: [
        {
          severity: PmsEmployeeProfileImportIssueSeverity.ERROR,
          sheet: 'Employee Profile',
          rowNumber: 8,
          employeeCode: 'RTE0142',
          column: 'Current Grade',
          code: 'GRADE_NOT_FOUND',
          message: 'Current Grade must exist in the PMS Grade LOV',
        },
      ],
    });

    await expect(importAudit.validate()).resolves.toBeUndefined();
    expect(importAudit.validationIssues[0].code).toBe('GRADE_NOT_FOUND');
  });

  it('stages one normalized profile per employee and import reference', async () => {
    const importId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    const row = new PmsEmployeeProfileImportRow({
      importId,
      employeeId,
      employeeCode: 'RTE0127',
      sourceRowNumber: 2,
      currentGrade: 'G5',
      yearsInGrade: 2,
      previousExperienceYears: 3.5,
      qualification: 'B.E.',
      asOfDate: new Date('2026-04-01T00:00:00.000Z'),
      sourceProfileVersion: 2,
      submittedCareerProgressionPast: [
        {
          year: 2025,
          grade: 'G5',
          function: 'Operations',
          sequence: 1,
        },
      ],
      careerProgressionPast: [
        {
          year: 2024,
          grade: 'G4',
          function: 'Operations',
          sequence: 1,
        },
      ],
    });

    await expect(row.validate()).resolves.toBeUndefined();
    expect(row.sourceProfileVersion).toBe(2);
    expect(row.submittedCareerProgressionPast).toHaveLength(1);
    const uniqueIndex = PmsEmployeeProfileImportRow.schema
      .indexes()
      .find(([fields]) => fields.importId === 1 && fields.employeeId === 1);
    expect(uniqueIndex?.[1]?.unique).toBe(true);
  });

  it('stores temporary workbooks with an automatic expiry index', async () => {
    const storedFile = new PmsEmployeeProfileImportFile({
      importId: new Types.ObjectId(),
      workbook: Buffer.from('xlsx-content'),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(storedFile.validate()).resolves.toBeUndefined();
    const ttlIndex = PmsEmployeeProfileImportFile.schema
      .indexes()
      .find(([fields]) => fields.expiresAt === 1);
    expect(ttlIndex?.[1]?.expireAfterSeconds).toBe(0);
  });
});

describe('PMS employee profile manual-change audit', () => {
  it('stores the reason, version transition, actor, and before/after values', async () => {
    const change = new PmsEmployeeCareerProfileChange({
      employeeId: new Types.ObjectId(),
      profileId: new Types.ObjectId(),
      action: PmsEmployeeCareerProfileChangeAction.UPDATED,
      reason: 'Corrected the grade effective date from the approved HR record',
      previousVersion: 3,
      newVersion: 4,
      beforeValue: { currentGrade: 'G4' },
      afterValue: { currentGrade: 'G5' },
      changedBy: new Types.ObjectId(),
    });

    await expect(change.validate()).resolves.toBeUndefined();
    expect(change.changedAt).toBeInstanceOf(Date);
    expect(change.newVersion).toBeGreaterThan(change.previousVersion);
  });

  it('rejects a manual change without a meaningful reason', async () => {
    const change = new PmsEmployeeCareerProfileChange({
      employeeId: new Types.ObjectId(),
      profileId: new Types.ObjectId(),
      action: PmsEmployeeCareerProfileChangeAction.CREATED,
      reason: 'x',
      previousVersion: 0,
      newVersion: 1,
      afterValue: { currentGrade: 'G4' },
      changedBy: new Types.ObjectId(),
    });

    await expect(change.validate()).rejects.toThrow();
  });
});
