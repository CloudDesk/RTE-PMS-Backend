import * as crypto from 'crypto';
import * as ExcelJS from 'exceljs';
import mongoose, { Types } from 'mongoose';
import { normalizePmsRole, PmsRole } from '../constants/pms.enums';
import {
  LOV,
  PmsEmployeeCareerProfile,
  PmsEmployeeCareerProfileChange,
  PmsEmployeeCareerProfileChangeAction,
  PmsEmployeeProfileImportRow,
  PmsEmployeeProfileImportFile,
  PmsEmployeeProfileUpdateSource,
  PmsEmployeeProfileImport,
  PmsEmployeeProfileImportStatus,
  User,
} from '../models';
import { RequestContext } from '../types/context';
import { getSubordinateUserIds } from '../utilis/userHierarchy';
import { BaseService } from './base.service';

export const PMS_EMPLOYEE_PROFILE_TEMPLATE_VERSION = 'v1.1';
export const PMS_EMPLOYEE_PROFILE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS = 5000;
export const PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS = 25000;

export const PmsEmployeeProfileWorkbookSheet = {
  INSTRUCTIONS: 'Instructions',
  EMPLOYEE_PROFILE: 'Employee Profile',
  CAREER_PROGRESSION: 'Career Progression Past',
  EMPLOYEE_REFERENCE: 'Employee Reference',
  GRADE_REFERENCE: 'Grade Reference',
} as const;

const PROFILE_HEADERS = [
  'Employee Code *',
  'Current Grade *',
  'Grade Effective Date',
  'Years in Grade',
  'Previous Experience (Years)',
  'Qualification',
] as const;

const CAREER_HEADERS = [
  'Employee Code *',
  'Year *',
  'Grade',
  'Function',
  'Unit / Department',
  'Sequence',
] as const;

const SINGLE_SHEET_TEMPLATE_VERSION = 'single-sheet-v1';
const SINGLE_SHEET_HEADER_ALIASES = {
  employeeCode: ['emp code', 'employee code'],
  employeeName: ['emp name', 'employee name'],
  year: ['year'],
  progression: ['progression'],
  promotedAs: ['promoted as'],
} as const;

const EMPLOYEE_REFERENCE_HEADERS = [
  'Employee Code',
  'Employee Name',
  'Designation',
  'Department',
  'Manager Code',
  'Manager Name',
  'Employee Status',
] as const;

const GRADE_REFERENCE_HEADERS = [
  'Grade Code',
  'Grade Label',
  'Display Order',
] as const;

const REQUIRED_SHEETS = Object.values(PmsEmployeeProfileWorkbookSheet);
const TEMPLATE_PROTECTION_PASSWORD = 'rte-pms-template';
const IMPORT_VALIDATION_IGNORED_WORKSHEET_NODES = [
  'sheetPr',
  'sheetViews',
  'sheetFormatPr',
  'cols',
  'autoFilter',
  'mergeCells',
  'rowBreaks',
  'hyperlinks',
  'pageMargins',
  'dataValidations',
  'pageSetup',
  'headerFooter',
  'printOptions',
  'picture',
  'drawing',
  'sheetProtection',
  'tableParts',
  'conditionalFormatting',
  'extLst',
];
const ACTIVE_BACKGROUND_IMPORTS = new Set<string>();
const IMPORT_FILE_RETENTION_MS = 24 * 60 * 60 * 1000;

export type PmsEmployeeProfileTemplateEmployee = {
  employeeId: string;
  employeeCode: string;
  name: string;
  designation: string;
  department: string;
  managerCode: string;
  managerName: string;
  active: boolean;
};

export type PmsEmployeeProfileTemplateGrade = {
  code: string;
  label: string;
  displayOrder: number;
};

export type PmsEmployeeProfileValidationIssue = {
  severity: 'ERROR' | 'WARNING';
  sheet: string;
  rowNumber?: number;
  employeeCode?: string;
  column?: string;
  code: string;
  message: string;
};

export type ParsedCareerProgressionRow = {
  rowNumber: number;
  employeeCode: string;
  year: number;
  grade?: string;
  progression?: string;
  function?: string;
  unitOrDepartment?: string;
  sequence: number;
};

export type ParsedEmployeeProfileRow = {
  rowNumber: number;
  employeeId?: string;
  employeeCode: string;
  employeeName?: string;
  designation?: string;
  department?: string;
  managerCode?: string;
  managerName?: string;
  employeeActive?: boolean;
  currentGrade: string;
  gradeEffectiveDate?: Date;
  yearsInGrade?: number;
  previousExperienceYears?: number;
  qualification?: string;
  asOfDate: Date;
  sourceProfileVersion?: number;
  submittedCareerProgressionPast?: ParsedCareerProgressionRow[];
  careerProgressionPast: ParsedCareerProgressionRow[];
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type PmsEmployeeProfileWorkbookValidation = {
  templateVersion?: string;
  profileRowCount: number;
  careerRowCount: number;
  validCount: number;
  invalidCount: number;
  warningCount: number;
  canImport: boolean;
  issues: PmsEmployeeProfileValidationIssue[];
  profiles: ParsedEmployeeProfileRow[];
};

export type PmsEmployeeProfileImportConfirmation = {
  importReference: string;
  status: 'COMPLETED';
  confirmationAttemptCount: number;
  recovered: boolean;
  createdProfiles: number;
  updatedProfiles: number;
  unchangedProfiles: number;
  failedProfiles: number;
  affectedEmployees: Array<{
    employeeId: string;
    employeeCode: string;
  }>;
};

export type PmsEmployeeProfileImportOperation = {
  importReference: string;
  status: string;
  processingStage?: 'VALIDATION' | 'IMPORT';
  failedStage?: 'VALIDATION' | 'IMPORT';
  progress: {
    processedRows: number;
    totalRows: number;
    percent: number;
    message?: string;
  };
  failureReason?: string;
  validation?: PmsEmployeeProfileWorkbookValidation;
  result?: PmsEmployeeProfileImportConfirmation;
  preview: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type PmsEmployeeCareerProfileListItem = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  department: string;
  managerName: string;
  active: boolean;
  currentGrade?: string;
  asOfDate?: Date;
  profileVersion?: number;
  profileStatus: 'MISSING' | 'AVAILABLE' | 'VALIDATION_ATTENTION';
  lastUpdatedSource?: string;
  updatedAt?: Date;
};

export type ManualCareerProgressionInput = {
  year: number;
  grade?: string;
  progression?: string;
  function?: string;
  unitOrDepartment?: string;
  sequence: number;
};

export type ManualEmployeeCareerProfileInput = {
  profileVersion?: number;
  reasonForChange: string;
  currentGrade: string;
  gradeEffectiveDate?: string | Date;
  yearsInGrade?: number;
  previousExperienceYears?: number;
  qualification?: string;
  careerProgressionPast?: ManualCareerProgressionInput[];
};

export type PmsEmployeeProfileReferenceData = {
  employees: PmsEmployeeProfileTemplateEmployee[];
  grades: PmsEmployeeProfileTemplateGrade[];
};

type TemplateBuildInput = PmsEmployeeProfileReferenceData & {
  generatedAt: Date;
  generatedBy: string;
};

export class PmsEmployeeProfileImportService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async generateImportTemplate(): Promise<Buffer> {
    const actor = this.assertAdminActor();
    const referenceData = await this.loadReferenceData();

    const actorEmployee = referenceData.employees.find(
      (employee) => employee.employeeId === actor.actorId,
    );
    const workbook = await this.buildSingleSheetTemplateWorkbook({
      ...referenceData,
      generatedAt: new Date(),
      generatedBy: actorEmployee
        ? `${actorEmployee.employeeCode} - ${actorEmployee.name}`
        : this.context.user?.name || actor.actorId,
    });
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async queueImportWorkbook(input: {
    buffer: Buffer;
    originalFileName: string;
  }): Promise<PmsEmployeeProfileImportOperation> {
    const actor = this.assertAdminActor();
    if (!input.buffer.length) throw new Error('The uploaded workbook is empty');
    if (input.buffer.length > PMS_EMPLOYEE_PROFILE_MAX_FILE_BYTES) {
      throw new Error('The workbook exceeds the 10 MB file-size limit');
    }

    const importId = new Types.ObjectId();
    const safeFileName =
      this.cleanText(input.originalFileName, 255) || 'career-profiles.xlsx';
    const fileChecksum = crypto
      .createHash('sha256')
      .update(input.buffer)
      .digest('hex');

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await PmsEmployeeProfileImport.create(
          [
            {
              _id: importId,
              originalFileName: safeFileName,
              fileChecksum,
              templateVersion: 'PENDING',
              status: PmsEmployeeProfileImportStatus.QUEUED,
              uploadedBy: new Types.ObjectId(actor.actorId),
              uploadedAt: new Date(),
              processingStage: 'VALIDATION',
              progress: {
                processedRows: 0,
                totalRows: 0,
                percent: 0,
                message: 'Validation queued in the application',
              },
            },
          ],
          { session },
        );
        await PmsEmployeeProfileImportFile.create(
          [
            {
              importId,
              workbook: input.buffer,
              expiresAt: new Date(Date.now() + IMPORT_FILE_RETENTION_MS),
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    this.scheduleBackgroundValidation(importId.toString());
    return this.getImportOperation(importId.toString());
  }

  async processQueuedValidation(
    importReference: string,
  ): Promise<PmsEmployeeProfileImportOperation> {
    if (!Types.ObjectId.isValid(importReference)) {
      throw new Error('Invalid import reference');
    }
    const importId = new Types.ObjectId(importReference);
    const staleHeartbeat = new Date(Date.now() - 20 * 60 * 1000);
    const claimed = await PmsEmployeeProfileImport.findOneAndUpdate(
      {
        _id: importId,
        $or: [
          {
            status: {
              $in: [
                PmsEmployeeProfileImportStatus.UPLOADED,
                PmsEmployeeProfileImportStatus.QUEUED,
              ],
            },
          },
          {
            status: PmsEmployeeProfileImportStatus.VALIDATING,
            processingHeartbeatAt: { $lt: staleHeartbeat },
          },
          {
            status: PmsEmployeeProfileImportStatus.FAILED,
            failedStage: 'VALIDATION',
          },
        ],
      },
      {
        $set: {
          status: PmsEmployeeProfileImportStatus.VALIDATING,
          processingStage: 'VALIDATION',
          processingStartedAt: new Date(),
          processingHeartbeatAt: new Date(),
          'progress.percent': 5,
          'progress.message': 'Reading and validating workbook',
        },
        $inc: { validationAttemptCount: 1, version: 1 },
      },
      { new: true },
    ).lean();
    if (!claimed) return this.getImportOperation(importReference, false);

    let validationCompleted = false;
    try {
      const storedFile = await PmsEmployeeProfileImportFile.findOne({
        importId,
      })
        .select('workbook')
        .lean();
      if (!storedFile?.workbook) {
        throw new Error(
          'The temporary workbook is no longer available. Upload it again.',
        );
      }
      const buffer = this.readStoredWorkbookBuffer(storedFile.workbook);
      const referenceData = await this.loadReferenceData();
      const validation = await this.validateWorkbookBuffer(buffer, referenceData);
      await this.mergeExistingCareerHistoryForImport(validation);
      const duplicateImport = await PmsEmployeeProfileImport.findOne({
        _id: { $ne: importId },
        fileChecksum: claimed.fileChecksum,
        status: {
          $in: [
            PmsEmployeeProfileImportStatus.VALIDATED,
            PmsEmployeeProfileImportStatus.IMPORT_QUEUED,
            PmsEmployeeProfileImportStatus.IMPORTING,
            PmsEmployeeProfileImportStatus.COMPLETED,
          ],
        },
      })
        .select('_id status createdAt')
        .sort({ createdAt: -1 })
        .lean();
      if (duplicateImport) {
        const issue = this.issue(
          'WARNING',
          PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS,
          'DUPLICATE_FILE',
          `This workbook matches prior import ${duplicateImport._id.toString()} (${duplicateImport.status}). Review it before confirming.`,
        );
        validation.issues.push(issue);
        validation.warningCount += 1;
        validation.profiles.forEach((profile) =>
          profile.warnings.push(issue.message),
        );
      }

      if (validation.canImport) {
        await PmsEmployeeProfileImportRow.deleteMany({ importId });
        await PmsEmployeeProfileImportRow.insertMany(
          validation.profiles.map((profile) => ({
            importId,
            employeeId: new Types.ObjectId(profile.employeeId!),
            employeeCode: profile.employeeCode,
            employeeName: profile.employeeName,
            designation: profile.designation,
            department: profile.department,
            managerName: profile.managerName,
            warnings: profile.warnings,
            sourceRowNumber: profile.rowNumber,
            currentGrade: profile.currentGrade,
            gradeEffectiveDate: profile.gradeEffectiveDate,
            yearsInGrade: profile.yearsInGrade,
            previousExperienceYears: profile.previousExperienceYears,
            qualification: profile.qualification,
            asOfDate: profile.asOfDate!,
            sourceProfileVersion: profile.sourceProfileVersion,
            submittedCareerProgressionPast:
              profile.submittedCareerProgressionPast ?? [],
            careerProgressionPast: profile.careerProgressionPast,
          })),
          { ordered: true },
        );
      }
      const now = new Date();
      await PmsEmployeeProfileImport.updateOne(
        { _id: importId, status: PmsEmployeeProfileImportStatus.VALIDATING },
        {
          $set: {
            templateVersion: validation.templateVersion || 'UNKNOWN',
            status: validation.canImport
              ? PmsEmployeeProfileImportStatus.VALIDATED
              : PmsEmployeeProfileImportStatus.VALIDATION_FAILED,
            validatedAt: now,
            processingHeartbeatAt: now,
            validationIssues: validation.issues.slice(0, 5000),
            affectedEmployeeIds: validation.profiles
              .map((profile) => profile.employeeId)
              .filter((id): id is string => Boolean(id))
              .map((id) => new Types.ObjectId(id)),
            counts: {
              profileRows: validation.profileRowCount,
              careerRows: validation.careerRowCount,
              validProfiles: validation.validCount,
              invalidProfiles: validation.invalidCount,
              warningCount: validation.warningCount,
              createdProfiles: 0,
              updatedProfiles: 0,
              unchangedProfiles: 0,
              failedProfiles: 0,
            },
            progress: {
              processedRows:
                validation.profileRowCount + validation.careerRowCount,
              totalRows:
                validation.profileRowCount + validation.careerRowCount,
              percent: 100,
              message: validation.canImport
                ? 'Validation complete; ready to import'
                : 'Validation complete; corrections required',
            },
          },
          $unset: {
            failedStage: 1,
            failureReason: 1,
          },
        },
      );
      validationCompleted = true;
      return this.getImportOperation(importReference, false);
    } catch (error) {
      await PmsEmployeeProfileImport.updateOne(
        { _id: importId },
        {
          $set: {
            status: PmsEmployeeProfileImportStatus.FAILED,
            failedStage: 'VALIDATION',
            failureReason:
              error instanceof Error
                ? this.cleanText(error.message, 2000)
                : 'Background validation failed',
            processingHeartbeatAt: new Date(),
            'progress.message': 'Background validation failed',
          },
        },
      );
      throw error;
    } finally {
      if (validationCompleted) {
        await PmsEmployeeProfileImportFile.deleteOne({ importId }).catch(
          () => undefined,
        );
      }
    }
  }

  async queueImportConfirmation(
    importReference: string,
  ): Promise<PmsEmployeeProfileImportOperation> {
    const actor = this.assertAdminActor();
    if (!Types.ObjectId.isValid(importReference)) {
      throw new Error('Invalid import reference');
    }
    const importId = new Types.ObjectId(importReference);
    const existing = await PmsEmployeeProfileImport.findById(importId).lean();
    if (!existing) throw new Error('Employee profile import audit was not found');
    if (existing.status === PmsEmployeeProfileImportStatus.COMPLETED) {
      return this.getImportOperation(importReference);
    }
    const retryableFailure =
      existing.status === PmsEmployeeProfileImportStatus.FAILED &&
      existing.failedStage === 'IMPORT';
    if (
      existing.status !== PmsEmployeeProfileImportStatus.VALIDATED &&
      !retryableFailure
    ) {
      throw new Error(
        `Only a validated or failed import can be queued. Current status: ${existing.status}`,
      );
    }
    const queued = await PmsEmployeeProfileImport.findOneAndUpdate(
      {
        _id: importId,
        status: existing.status,
      },
      {
        $set: {
          status: PmsEmployeeProfileImportStatus.IMPORT_QUEUED,
          processingStage: 'IMPORT',
          lastAttemptedBy: new Types.ObjectId(actor.actorId),
          progress: {
            processedRows: 0,
            totalRows: existing.counts.validProfiles,
            percent: 0,
            message: 'Import queued',
          },
        },
        $inc: { version: 1 },
      },
      { new: true },
    );
    if (!queued) throw new Error('Import status changed; refresh and try again');
    this.scheduleBackgroundConfirmation(importReference);
    return this.getImportOperation(importReference);
  }

  async processQueuedConfirmation(
    importReference: string,
  ): Promise<PmsEmployeeProfileImportConfirmation> {
    if (!Types.ObjectId.isValid(importReference)) {
      throw new Error('Invalid import reference');
    }
    const audit = await PmsEmployeeProfileImport.findById(importReference)
      .select('uploadedBy lastAttemptedBy status')
      .lean();
    if (!audit) throw new Error('Employee profile import audit was not found');
    const actorId = audit.lastAttemptedBy || audit.uploadedBy;
    const actor = await User.findById(actorId)
      .select(
        '_id email name role departmentId active country currency licenseType portalAccess scope',
      )
      .lean();
    if (!actor) throw new Error('Import confirmation actor was not found');
    const workerService = new PmsEmployeeProfileImportService({
      requestId: `pms-profile-import-worker:${importReference}`,
      reqRole: String(actor.role || 'ADMIN'),
      user: {
        _id: actor._id,
        email: String(actor.email || ''),
        name: String(actor.name || ''),
        role: String(actor.role || 'ADMIN'),
        departmentId: String(actor.departmentId || ''),
        active: actor.active !== false,
        country: String(actor.country || 'IN'),
        currency: String(actor.currency || 'INR'),
        licenseType: String(actor.licenseType || 'employee'),
        portalAccess: Boolean(actor.portalAccess),
        scope: (actor as any).scope
          ? String((actor as any).scope)
          : undefined,
      },
    });
    return workerService.confirmImport(importReference);
  }

  async retryImportOperation(
    importReference: string,
  ): Promise<PmsEmployeeProfileImportOperation> {
    this.assertAdminActor();
    if (!Types.ObjectId.isValid(importReference)) {
      throw new Error('Invalid import reference');
    }
    const audit = await PmsEmployeeProfileImport.findById(importReference).lean();
    if (!audit) throw new Error('Employee profile import audit was not found');
    if (
      audit.status !== PmsEmployeeProfileImportStatus.FAILED ||
      !audit.failedStage
    ) {
      throw new Error('Only a failed background operation can be retried');
    }
    if (audit.failedStage === 'IMPORT') {
      return this.queueImportConfirmation(importReference);
    }
    const storedFile = await PmsEmployeeProfileImportFile.exists({
      importId: audit._id,
    });
    if (!storedFile) {
      throw new Error(
        'The temporary workbook is no longer available. Upload the workbook again.',
      );
    }
    const reset = await PmsEmployeeProfileImport.findOneAndUpdate(
      {
        _id: audit._id,
        status: PmsEmployeeProfileImportStatus.FAILED,
        failedStage: 'VALIDATION',
      },
      {
        $set: {
          status: PmsEmployeeProfileImportStatus.QUEUED,
          processingStage: 'VALIDATION',
          progress: {
            processedRows: 0,
            totalRows: 0,
            percent: 0,
            message: 'Validation retry queued',
          },
        },
        $unset: { failureReason: 1, failedStage: 1 },
        $inc: { version: 1 },
      },
      { new: true },
    );
    if (!reset) throw new Error('Import status changed; refresh and try again');
    this.scheduleBackgroundValidation(importReference);
    return this.getImportOperation(importReference);
  }

  async getImportOperation(
    importReference: string,
    requireAdmin = true,
    previewInput: { page?: number; limit?: number } = {},
  ): Promise<PmsEmployeeProfileImportOperation> {
    if (requireAdmin) this.assertAdminActor();
    if (!Types.ObjectId.isValid(importReference)) {
      throw new Error('Invalid import reference');
    }
    const audit = await PmsEmployeeProfileImport.findById(importReference).lean();
    if (!audit) throw new Error('Employee profile import audit was not found');
    const heartbeatAge = audit.processingHeartbeatAt
      ? Date.now() - new Date(audit.processingHeartbeatAt).getTime()
      : Number.POSITIVE_INFINITY;
    if (
      audit.status === PmsEmployeeProfileImportStatus.QUEUED ||
      (audit.status === PmsEmployeeProfileImportStatus.VALIDATING &&
        heartbeatAge >= 20 * 60 * 1000)
    ) {
      this.scheduleBackgroundValidation(importReference);
    } else if (
      audit.status === PmsEmployeeProfileImportStatus.IMPORT_QUEUED
    ) {
      this.scheduleBackgroundConfirmation(importReference);
    }
    const previewPage = Math.max(1, Number(previewInput.page) || 1);
    const previewLimit = Math.min(
      200,
      Math.max(1, Number(previewInput.limit) || 100),
    );
    const previewTotal = audit.counts?.validProfiles || 0;
    const operation: PmsEmployeeProfileImportOperation = {
      importReference,
      status: audit.status,
      processingStage: audit.processingStage,
      failedStage: audit.failedStage,
      progress: audit.progress || {
        processedRows: 0,
        totalRows: 0,
        percent: 0,
      },
      failureReason: audit.failureReason,
      preview: {
        page: previewPage,
        limit: previewLimit,
        total: previewTotal,
        totalPages: Math.max(1, Math.ceil(previewTotal / previewLimit)),
      },
    };
    const includeValidation =
      [
        PmsEmployeeProfileImportStatus.VALIDATED,
        PmsEmployeeProfileImportStatus.VALIDATION_FAILED,
        PmsEmployeeProfileImportStatus.IMPORT_QUEUED,
        PmsEmployeeProfileImportStatus.IMPORTING,
      ].includes(audit.status as any) ||
      (audit.status === PmsEmployeeProfileImportStatus.FAILED &&
        audit.failedStage === 'IMPORT');
    if (includeValidation) {
      const rows =
        audit.status !== PmsEmployeeProfileImportStatus.VALIDATION_FAILED
          ? await PmsEmployeeProfileImportRow.find({ importId: audit._id })
              .sort({ sourceRowNumber: 1 })
              .skip((previewPage - 1) * previewLimit)
              .limit(previewLimit)
              .lean()
          : [];
      operation.validation = {
        templateVersion: audit.templateVersion,
        profileRowCount: audit.counts.profileRows,
        careerRowCount: audit.counts.careerRows,
        validCount: audit.counts.validProfiles,
        invalidCount: audit.counts.invalidProfiles,
        warningCount: audit.counts.warningCount,
        canImport:
          audit.status !== PmsEmployeeProfileImportStatus.VALIDATION_FAILED,
        issues: audit.validationIssues || [],
        profiles: rows.map((row) => ({
          rowNumber: row.sourceRowNumber,
          employeeId: row.employeeId.toString(),
          employeeCode: row.employeeCode,
          employeeName: row.employeeName,
          designation: row.designation,
          department: row.department,
          managerName: row.managerName,
          currentGrade: row.currentGrade,
          gradeEffectiveDate: row.gradeEffectiveDate,
          yearsInGrade: row.yearsInGrade,
          previousExperienceYears: row.previousExperienceYears,
          qualification: row.qualification,
          asOfDate: row.asOfDate,
          careerProgressionPast: row.careerProgressionPast as any,
          valid: true,
          errors: [],
          warnings: row.warnings || [],
        })),
      };
    }
    if (audit.status === PmsEmployeeProfileImportStatus.COMPLETED) {
      const rows = await PmsEmployeeProfileImportRow.find({
        importId: audit._id,
      })
        .select('employeeId employeeCode')
        .sort({ sourceRowNumber: 1 })
        .skip((previewPage - 1) * previewLimit)
        .limit(previewLimit)
        .lean();
      operation.result = {
        importReference,
        status: 'COMPLETED',
        confirmationAttemptCount: audit.confirmationAttemptCount || 1,
        recovered: Boolean(audit.recoveredAt),
        createdProfiles: audit.counts.createdProfiles,
        updatedProfiles: audit.counts.updatedProfiles,
        unchangedProfiles: audit.counts.unchangedProfiles,
        failedProfiles: audit.counts.failedProfiles,
        affectedEmployees: rows.map((row) => ({
          employeeId: row.employeeId.toString(),
          employeeCode: row.employeeCode,
        })),
      };
    }
    return operation;
  }

  private scheduleBackgroundValidation(importReference: string): void {
    this.scheduleBackgroundOperation(
      `VALIDATION:${importReference}`,
      importReference,
      'VALIDATION',
      async (service) => {
        await service.processQueuedValidation(importReference);
      },
    );
  }

  private readStoredWorkbookBuffer(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return Buffer.from(value);

    const storedBinary = value as {
      value?: (asRaw?: boolean) => unknown;
      buffer?: Uint8Array;
      position?: number;
    };
    if (typeof storedBinary?.value === 'function') {
      const rawValue = storedBinary.value(true);
      if (rawValue instanceof Uint8Array) {
        return Buffer.from(rawValue);
      }
    }
    if (storedBinary?.buffer instanceof Uint8Array) {
      const validLength = Math.min(
        storedBinary.buffer.length,
        Math.max(0, Number(storedBinary.position) || storedBinary.buffer.length),
      );
      return Buffer.from(storedBinary.buffer.subarray(0, validLength));
    }
    throw new Error('The temporary workbook data is invalid. Upload it again.');
  }

  private scheduleBackgroundConfirmation(importReference: string): void {
    this.scheduleBackgroundOperation(
      `IMPORT:${importReference}`,
      importReference,
      'IMPORT',
      async (service) => {
        await service.processQueuedConfirmation(importReference);
      },
    );
  }

  private scheduleBackgroundOperation(
    key: string,
    importReference: string,
    stage: 'VALIDATION' | 'IMPORT',
    operation: (service: PmsEmployeeProfileImportService) => Promise<void>,
  ): void {
    if (ACTIVE_BACKGROUND_IMPORTS.has(key)) return;
    ACTIVE_BACKGROUND_IMPORTS.add(key);
    setImmediate(async () => {
      const service = new PmsEmployeeProfileImportService({
        requestId: `pms-profile-import-background:${importReference}`,
        reqRole: 'SYSTEM',
      });
      try {
        await operation(service);
      } catch (error) {
        await PmsEmployeeProfileImport.updateOne(
          {
            _id: new Types.ObjectId(importReference),
            status: {
              $in:
                stage === 'VALIDATION'
                  ? [
                      PmsEmployeeProfileImportStatus.QUEUED,
                      PmsEmployeeProfileImportStatus.VALIDATING,
                    ]
                  : [
                      PmsEmployeeProfileImportStatus.IMPORT_QUEUED,
                      PmsEmployeeProfileImportStatus.IMPORTING,
                    ],
            },
          },
          {
            $set: {
              status: PmsEmployeeProfileImportStatus.FAILED,
              failedStage: stage,
              failureReason:
                error instanceof Error
                  ? this.cleanText(error.message, 2000)
                  : `Background ${stage.toLowerCase()} failed`,
              processingHeartbeatAt: new Date(),
              'progress.message': `Background ${stage.toLowerCase()} failed`,
            },
          },
        ).catch(() => undefined);
        console.error(
          `[PMS employee profile import] ${stage} failed for ${importReference}`,
          error,
        );
      } finally {
        ACTIVE_BACKGROUND_IMPORTS.delete(key);
      }
    });
  }

  async validateImportWorkbook(input: {
    buffer: Buffer;
    originalFileName: string;
  }): Promise<PmsEmployeeProfileWorkbookValidation & { importReference: string }> {
    const actor = this.assertAdminActor();
    if (!input.buffer.length) {
      throw new Error('The uploaded workbook is empty');
    }
    if (input.buffer.length > PMS_EMPLOYEE_PROFILE_MAX_FILE_BYTES) {
      throw new Error('The workbook exceeds the 10 MB file-size limit');
    }

    const referenceData = await this.loadReferenceData();
    const validation = await this.validateWorkbookBuffer(input.buffer, referenceData);
    await this.mergeExistingCareerHistoryForImport(validation);
    const fileChecksum = crypto
      .createHash('sha256')
      .update(input.buffer)
      .digest('hex');
    const duplicateImport = await PmsEmployeeProfileImport.findOne({
      fileChecksum,
      status: {
        $in: [
          PmsEmployeeProfileImportStatus.VALIDATED,
          PmsEmployeeProfileImportStatus.IMPORTING,
          PmsEmployeeProfileImportStatus.COMPLETED,
        ],
      },
    })
      .select('_id status createdAt')
      .sort({ createdAt: -1 })
      .lean();
    if (duplicateImport) {
      const duplicateIssue = this.issue(
        'WARNING',
        PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS,
        'DUPLICATE_FILE',
        `This workbook matches prior import ${duplicateImport._id.toString()} (${duplicateImport.status}). Review it before confirming.`,
      );
      validation.issues.push(duplicateIssue);
      validation.warningCount += 1;
      for (const profile of validation.profiles) {
        profile.warnings.push(duplicateIssue.message);
      }
    }
    const importAudit = await PmsEmployeeProfileImport.create({
      originalFileName: this.cleanText(input.originalFileName, 255),
      fileChecksum,
      templateVersion: validation.templateVersion || 'UNKNOWN',
      status: validation.canImport
        ? PmsEmployeeProfileImportStatus.VALIDATED
        : PmsEmployeeProfileImportStatus.VALIDATION_FAILED,
      uploadedBy: new Types.ObjectId(actor.actorId),
      uploadedAt: new Date(),
      validatedAt: new Date(),
      counts: {
        profileRows: validation.profileRowCount,
        careerRows: validation.careerRowCount,
        validProfiles: validation.validCount,
        invalidProfiles: validation.invalidCount,
        warningCount: validation.warningCount,
        createdProfiles: 0,
        updatedProfiles: 0,
        unchangedProfiles: 0,
        failedProfiles: 0,
      },
      validationIssues: validation.issues.slice(0, 5000),
      affectedEmployeeIds: validation.profiles
        .map((profile) => profile.employeeId)
        .filter((employeeId): employeeId is string => Boolean(employeeId))
        .map((employeeId) => new Types.ObjectId(employeeId)),
    });

    if (validation.canImport) {
      try {
        await PmsEmployeeProfileImportRow.insertMany(
          validation.profiles.map((profile) => ({
            importId: importAudit._id,
            employeeId: new Types.ObjectId(profile.employeeId!),
            employeeCode: profile.employeeCode,
            employeeName: profile.employeeName,
            designation: profile.designation,
            department: profile.department,
            managerName: profile.managerName,
            warnings: profile.warnings,
            sourceRowNumber: profile.rowNumber,
            currentGrade: profile.currentGrade,
            gradeEffectiveDate: profile.gradeEffectiveDate,
            yearsInGrade: profile.yearsInGrade,
            previousExperienceYears: profile.previousExperienceYears,
            qualification: profile.qualification,
            asOfDate: profile.asOfDate!,
            sourceProfileVersion: profile.sourceProfileVersion,
            submittedCareerProgressionPast:
              profile.submittedCareerProgressionPast ?? [],
            careerProgressionPast: profile.careerProgressionPast.map((entry) => ({
              year: entry.year,
              grade: entry.grade,
              progression: entry.progression,
              function: entry.function,
              unitOrDepartment: entry.unitOrDepartment,
              sequence: entry.sequence,
            })),
          })),
          { ordered: true },
        );
      } catch (error) {
        await PmsEmployeeProfileImport.updateOne(
          { _id: importAudit._id },
          {
            $set: {
              status: PmsEmployeeProfileImportStatus.FAILED,
              failureReason:
                error instanceof Error
                  ? `Could not stage validated rows: ${error.message}`
                  : 'Could not stage validated rows',
            },
          },
        );
        throw new Error(
          'The workbook was validated but its rows could not be staged for confirmation',
        );
      }
    }

    return {
      importReference: importAudit._id.toString(),
      ...validation,
    };
  }

  async confirmImport(
    importReference: string,
  ): Promise<PmsEmployeeProfileImportConfirmation> {
    const actor = this.assertAdminActor();
    if (!Types.ObjectId.isValid(importReference)) {
      throw new Error('Invalid import reference');
    }

    const importId = new Types.ObjectId(importReference);
    const audit = await PmsEmployeeProfileImport.findById(importId).lean();
    if (!audit) {
      throw new Error('Employee profile import audit was not found');
    }
    if (audit.status === PmsEmployeeProfileImportStatus.COMPLETED) {
      const completedRows = await PmsEmployeeProfileImportRow.find({ importId })
        .select('employeeId employeeCode')
        .sort({ sourceRowNumber: 1 })
        .lean();
      return {
        importReference,
        status: 'COMPLETED',
        confirmationAttemptCount: audit.confirmationAttemptCount ?? 1,
        recovered: Boolean(audit.recoveredAt),
        createdProfiles: audit.counts.createdProfiles,
        updatedProfiles: audit.counts.updatedProfiles,
        unchangedProfiles: audit.counts.unchangedProfiles,
        failedProfiles: audit.counts.failedProfiles,
        affectedEmployees: completedRows.map((row) => ({
          employeeId: row.employeeId.toString(),
          employeeCode: row.employeeCode,
        })),
      };
    }
    if (
      audit.status !== PmsEmployeeProfileImportStatus.VALIDATED &&
      audit.status !== PmsEmployeeProfileImportStatus.FAILED &&
      audit.status !== PmsEmployeeProfileImportStatus.IMPORT_QUEUED
    ) {
      throw new Error(
        `Only a validated or failed import can be confirmed. Current status: ${audit.status}`,
      );
    }
    const recoveryAttempt =
      audit.status === PmsEmployeeProfileImportStatus.FAILED ||
      (audit.status === PmsEmployeeProfileImportStatus.IMPORT_QUEUED &&
        (audit.confirmationAttemptCount ?? 0) > 0);
    const now = new Date();
    let stagedRows: any[] = [];
    try {
      stagedRows = await PmsEmployeeProfileImportRow.find({ importId })
        .sort({ sourceRowNumber: 1 })
        .lean();
      if (
        stagedRows.length === 0 ||
        stagedRows.length !== audit.counts.validProfiles
      ) {
        throw new Error(
          'Validated import rows are incomplete. Upload and validate the workbook again.',
        );
      }

      const referenceData = await this.loadReferenceData();
      const employeeById = new Map(
        referenceData.employees.map((employee) => [
          employee.employeeId,
          employee,
        ]),
      );
      for (const row of stagedRows) {
        const employee = employeeById.get(row.employeeId.toString());
        if (
          !employee ||
          this.normalizeKey(employee.employeeCode) !==
            this.normalizeKey(row.employeeCode)
        ) {
          throw new Error(
            `Employee ${row.employeeCode} changed after validation. Upload and validate the workbook again.`,
          );
        }
      }
    } catch (error) {
      await this.recordImportConfirmationFailure({
        importId,
        actorId: actor.actorId,
        attemptedAt: now,
        failedProfiles: stagedRows.length || audit.counts.validProfiles,
        error,
      });
      throw error;
    }

    let session: mongoose.ClientSession | undefined;
    let createdProfiles = 0;
    let updatedProfiles = 0;
    let unchangedProfiles = 0;
    const confirmationDate = this.currentServerDate();

    try {
      session = await mongoose.startSession();
      await session.withTransaction(async () => {
        const lockedAudit = await PmsEmployeeProfileImport.findOneAndUpdate(
          {
            _id: importId,
            status: {
              $in: [
                PmsEmployeeProfileImportStatus.VALIDATED,
                PmsEmployeeProfileImportStatus.FAILED,
                PmsEmployeeProfileImportStatus.IMPORT_QUEUED,
              ],
            },
          },
          {
            $set: {
              status: PmsEmployeeProfileImportStatus.IMPORTING,
              confirmedAt: now,
              lastAttemptedAt: now,
              lastAttemptedBy: new Types.ObjectId(actor.actorId),
              ...(recoveryAttempt ? { recoveredAt: now } : {}),
              failureReason: undefined,
              'counts.failedProfiles': 0,
              processingHeartbeatAt: now,
              'progress.percent': 10,
              'progress.message': 'Applying validated profile changes',
            },
            $inc: { version: 1, confirmationAttemptCount: 1 },
          },
          { new: true, session },
        );
        if (!lockedAudit) {
          throw new Error(
            'This import is already being confirmed or is no longer valid',
          );
        }

        const employeeIds = stagedRows.map((row) => row.employeeId);
        const existingProfiles = await PmsEmployeeCareerProfile.find({
          employeeId: { $in: employeeIds },
        })
          .session(session!)
          .lean();
        const existingByEmployeeId = new Map(
          existingProfiles.map((profile) => [
            profile.employeeId.toString(),
            profile,
          ]),
        );
        const operations: any[] = [];

        for (const row of stagedRows) {
          const existing = existingByEmployeeId.get(row.employeeId.toString());
          if (row.sourceProfileVersion !== undefined) {
            const currentProfileVersion = existing?.profileVersion ?? 0;
            if (currentProfileVersion !== row.sourceProfileVersion) {
              throw new Error(
                `Career profile for ${row.employeeCode} changed after validation. Validate the workbook again.`,
              );
            }
          }
          const normalized = {
            ...this.normalizedProfileValues(row),
            asOfDate: confirmationDate,
          };
          if (!existing) {
            createdProfiles += 1;
            operations.push({
              insertOne: {
                document: {
                  employeeId: row.employeeId,
                  employeeCode: row.employeeCode,
                  ...normalized,
                  profileVersion: 1,
                  lastUpdatedSource:
                    PmsEmployeeProfileUpdateSource.EXCEL_IMPORT,
                  sourceImportId: importId,
                  lastImportedAt: now,
                  lastImportedBy: new Types.ObjectId(actor.actorId),
                  createdBy: new Types.ObjectId(actor.actorId),
                  updatedBy: new Types.ObjectId(actor.actorId),
                },
              },
            });
            continue;
          }

          if (this.profileValuesEqual(existing, normalized)) {
            unchangedProfiles += 1;
            continue;
          }

          updatedProfiles += 1;
          const setValues: Record<string, unknown> = {
            employeeCode: row.employeeCode,
            currentGrade: normalized.currentGrade,
            asOfDate: normalized.asOfDate,
            careerProgressionPast: normalized.careerProgressionPast,
            lastUpdatedSource: PmsEmployeeProfileUpdateSource.EXCEL_IMPORT,
            sourceImportId: importId,
            lastImportedAt: now,
            lastImportedBy: new Types.ObjectId(actor.actorId),
            updatedBy: new Types.ObjectId(actor.actorId),
          };
          const unsetValues: Record<string, 1> = {};
          for (const key of [
            'gradeEffectiveDate',
            'yearsInGrade',
            'previousExperienceYears',
            'qualification',
          ] as const) {
            if (normalized[key] === undefined) {
              unsetValues[key] = 1;
            } else {
              setValues[key] = normalized[key];
            }
          }
          operations.push({
            updateOne: {
              filter: {
                _id: existing._id,
                profileVersion: existing.profileVersion,
              },
              update: {
                $set: setValues,
                ...(Object.keys(unsetValues).length > 0
                  ? { $unset: unsetValues }
                  : {}),
                $inc: { profileVersion: 1 },
              },
            },
          });
        }

        if (operations.length > 0) {
          const writeResult = await PmsEmployeeCareerProfile.bulkWrite(
            operations,
            { ordered: true, session },
          );
          const appliedUpdates = writeResult.modifiedCount ?? 0;
          if (appliedUpdates !== updatedProfiles) {
            throw new Error(
              'A career profile changed during confirmation. Upload and validate again.',
            );
          }
        }

        await PmsEmployeeProfileImport.updateOne(
          {
            _id: importId,
            status: PmsEmployeeProfileImportStatus.IMPORTING,
          },
          {
            $set: {
              status: PmsEmployeeProfileImportStatus.COMPLETED,
              completedAt: now,
              'counts.createdProfiles': createdProfiles,
              'counts.updatedProfiles': updatedProfiles,
              'counts.unchangedProfiles': unchangedProfiles,
              'counts.failedProfiles': 0,
              processingHeartbeatAt: now,
              'progress.processedRows': stagedRows.length,
              'progress.totalRows': stagedRows.length,
              'progress.percent': 100,
              'progress.message': 'Import completed',
            },
          },
          { session },
        );
      });
    } catch (error) {
      await this.recordImportConfirmationFailure({
        importId,
        actorId: actor.actorId,
        attemptedAt: now,
        failedProfiles: stagedRows.length,
        error,
      });
      throw error;
    } finally {
      await session?.endSession();
    }

    return {
      importReference,
      status: 'COMPLETED',
      confirmationAttemptCount: (audit.confirmationAttemptCount ?? 0) + 1,
      recovered: recoveryAttempt,
      createdProfiles,
      updatedProfiles,
      unchangedProfiles,
      failedProfiles: 0,
      affectedEmployees: stagedRows.map((row) => ({
        employeeId: row.employeeId.toString(),
        employeeCode: row.employeeCode,
      })),
    };
  }

  private async recordImportConfirmationFailure(input: {
    importId: Types.ObjectId;
    actorId: string;
    attemptedAt: Date;
    failedProfiles: number;
    error: unknown;
  }): Promise<void> {
    await PmsEmployeeProfileImport.updateOne(
      {
        _id: input.importId,
        status: {
          $in: [
            PmsEmployeeProfileImportStatus.VALIDATED,
            PmsEmployeeProfileImportStatus.IMPORTING,
            PmsEmployeeProfileImportStatus.FAILED,
            PmsEmployeeProfileImportStatus.IMPORT_QUEUED,
          ],
        },
      },
      {
        $set: {
          status: PmsEmployeeProfileImportStatus.FAILED,
          failedStage: 'IMPORT',
          lastAttemptedAt: input.attemptedAt,
          lastAttemptedBy: new Types.ObjectId(input.actorId),
          lastFailedAt: input.attemptedAt,
          failureReason:
            input.error instanceof Error
              ? this.cleanText(input.error.message, 2000)
              : 'Import confirmation failed',
          'counts.failedProfiles': input.failedProfiles,
        },
        $inc: {
          version: 1,
          confirmationAttemptCount: 1,
        },
      },
    );
  }

  async listCareerProfiles(input: {
    page?: number;
    limit?: number;
    search?: string;
    department?: string;
    grade?: string;
    profileStatus?: string;
    active?: boolean;
  }): Promise<{
    items: PmsEmployeeCareerProfileListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    this.assertAdminActor();
    const page = Math.max(1, Number(input.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));
    const userQuery: Record<string, unknown> = {
      employeeCode: { $exists: true, $ne: '' },
      active: { $ne: false },
    };
    if (input.search?.trim()) {
      const safeSearch = input.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userQuery.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { employeeCode: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    if (input.department?.trim()) {
      userQuery.departmentId = input.department.trim();
    }

    const [users, departmentLov] = await Promise.all([
      User.find(userQuery)
        .select(
          '_id employeeCode name specificRole role departmentId managerId managerName active',
        )
        .sort({ employeeCode: 1 })
        .lean(),
      LOV.findOne({ type: 'department' }).lean(),
    ]);
    const employeeIds = users.map((user) => user._id);
    const profiles = await PmsEmployeeCareerProfile.find({
      employeeId: { $in: employeeIds },
    }).lean();
    const profileByEmployeeId = new Map(
      profiles.map((profile) => [profile.employeeId.toString(), profile]),
    );
    const managerIds = [
      ...new Set(
        users
          .map((user) => user.managerId?.toString?.() ?? String(user.managerId ?? ''))
          .filter(Boolean),
      ),
    ].filter((id) => Types.ObjectId.isValid(id));
    const managers = await User.find({ _id: { $in: managerIds } })
      .select('_id name')
      .lean();
    const managerById = new Map(
      managers.map((manager) => [manager._id.toString(), manager.name]),
    );
    const departmentLabels = new Map(
      (departmentLov?.values ?? []).map((item) => [
        this.normalizeKey(item.value),
        item.label,
      ]),
    );

    const items = users
      .map((user): PmsEmployeeCareerProfileListItem => {
        const profile = profileByEmployeeId.get(user._id.toString());
        const validationAttention = Boolean(
          profile && user.active === false,
        );
        const managerId =
          user.managerId?.toString?.() ?? String(user.managerId ?? '');
        return {
          employeeId: user._id.toString(),
          employeeCode: String(user.employeeCode ?? '').trim(),
          employeeName: String(user.name ?? '').trim(),
          designation: String(user.specificRole ?? user.role ?? '').trim(),
          department:
            departmentLabels.get(this.normalizeKey(user.departmentId)) ??
            String(user.departmentId ?? '').trim(),
          managerName:
            managerById.get(managerId) ??
            String(user.managerName ?? '').trim(),
          active: user.active !== false,
          currentGrade: profile?.currentGrade,
          asOfDate: profile?.asOfDate,
          profileVersion: profile?.profileVersion,
          profileStatus: !profile
            ? 'MISSING'
            : validationAttention
              ? 'VALIDATION_ATTENTION'
              : 'AVAILABLE',
          lastUpdatedSource: profile?.lastUpdatedSource,
          updatedAt: profile?.updatedAt,
        };
      })
      .filter((item) => {
        if (
          input.grade?.trim() &&
          this.normalizeKey(item.currentGrade) !==
            this.normalizeKey(input.grade)
        ) {
          return false;
        }
        if (
          input.profileStatus?.trim() &&
          this.normalizeKey(item.profileStatus) !==
            this.normalizeKey(input.profileStatus)
        ) {
          return false;
        }
        return true;
      });
    const total = items.length;

    return {
      items: items.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getCareerProfile(employeeId: string) {
    this.assertAdminActor();
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new Error('Invalid employee id');
    }
    const employee = await User.findById(employeeId)
      .select(
        '_id employeeCode name specificRole role departmentId managerId managerName active',
      )
      .lean();
    if (!employee) {
      throw new Error('Employee was not found');
    }

    const [profile, departmentLov, manager] = await Promise.all([
      PmsEmployeeCareerProfile.findOne({ employeeId }).lean(),
      LOV.findOne({ type: 'department' }).lean(),
      employee.managerId && Types.ObjectId.isValid(employee.managerId.toString())
        ? User.findById(employee.managerId).select('_id employeeCode name').lean()
        : Promise.resolve(null),
    ]);
    const department = (departmentLov?.values ?? []).find(
      (item) =>
        this.normalizeKey(item.value) ===
        this.normalizeKey(employee.departmentId),
    );

    return {
      employee: {
        employeeId: employee._id.toString(),
        employeeCode: String(employee.employeeCode ?? '').trim(),
        employeeName: String(employee.name ?? '').trim(),
        designation: String(employee.specificRole ?? employee.role ?? '').trim(),
        department:
          String(department?.label ?? employee.departmentId ?? '').trim(),
        managerCode: String(manager?.employeeCode ?? '').trim(),
        managerName: String(
          manager?.name ?? employee.managerName ?? '',
        ).trim(),
        active: employee.active !== false,
      },
      profile: profile
        ? {
            profileId: profile._id.toString(),
            currentGrade: profile.currentGrade,
            gradeEffectiveDate: profile.gradeEffectiveDate,
            yearsInGrade: profile.yearsInGrade,
            previousExperienceYears: profile.previousExperienceYears,
            qualification: profile.qualification,
            asOfDate: profile.asOfDate,
            careerProgressionPast: profile.careerProgressionPast,
            profileVersion: profile.profileVersion,
            lastUpdatedSource: profile.lastUpdatedSource,
            updatedAt: profile.updatedAt,
          }
        : null,
    };
  }

  async getVisibleCareerProfile(employeeId: string) {
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new Error('Invalid employee id');
    }

    await this.assertCareerProfileViewAccess(employeeId);

    const [profile, employee] = await Promise.all([
      PmsEmployeeCareerProfile.findOne({ employeeId }).lean(),
      User.findById(employeeId).select('joiningDate').lean(),
    ]);
    if (!employee) {
      throw new Error('Employee was not found');
    }
    if (!profile) {
      return {
        profile: null,
        yearsInCompany: this.yearsBetween(employee.joiningDate, new Date()),
      };
    }

    return {
      yearsInCompany: this.yearsBetween(
        employee.joiningDate,
        profile.asOfDate ?? new Date(),
      ),
      profile: {
        profileId: profile._id.toString(),
        currentGrade: profile.currentGrade,
        gradeEffectiveDate: profile.gradeEffectiveDate,
        yearsInGrade: profile.yearsInGrade,
        previousExperienceYears: profile.previousExperienceYears,
        qualification: profile.qualification,
        asOfDate: profile.asOfDate,
        careerProgressionPast: profile.careerProgressionPast,
        profileVersion: profile.profileVersion,
        lastUpdatedSource: profile.lastUpdatedSource,
        lastImportedAt: profile.lastImportedAt,
        updatedAt: profile.updatedAt,
      },
    };
  }

  async saveCareerProfile(
    employeeId: string,
    input: ManualEmployeeCareerProfileInput,
  ) {
    const actor = this.assertAdminActor();
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new Error('Invalid employee id');
    }
    const employee = await User.findById(employeeId)
      .select('_id employeeCode active')
      .lean();
    if (!employee) {
      throw new Error('Employee was not found');
    }
    const normalized = this.validateManualProfileInput(input);
    const requestedVersion = Number(input.profileVersion ?? 0);
    if (!Number.isInteger(requestedVersion) || requestedVersion < 0) {
      throw new Error('Profile version is invalid. Refresh the page and try again.');
    }

    const employeeObjectId = new Types.ObjectId(employeeId);
    const actorObjectId = new Types.ObjectId(actor.actorId);
    const session = await mongoose.startSession();
    let savedProfile: any;
    let action: 'CREATED' | 'UPDATED' = 'CREATED';

    try {
      await session.withTransaction(async () => {
        const existing = await PmsEmployeeCareerProfile.findOne({
          employeeId: employeeObjectId,
        }).session(session);
        if (existing && existing.profileVersion !== requestedVersion) {
          throw new Error(
            'This profile was changed by another administrator. Refresh the page before saving.',
          );
        }
        if (!existing && requestedVersion !== 0) {
          throw new Error(
            'This profile changed after the page was loaded. Refresh the page before saving.',
          );
        }

        const beforeValue = existing
          ? this.profileAuditSnapshot(existing.toObject())
          : undefined;
        const profile =
          existing ??
          new PmsEmployeeCareerProfile({
            employeeId: employeeObjectId,
            employeeCode: String(employee.employeeCode ?? '').trim(),
            profileVersion: 1,
            createdBy: actorObjectId,
          });
        action = existing ? 'UPDATED' : 'CREATED';
        profile.employeeCode = String(employee.employeeCode ?? '').trim();
        profile.currentGrade = normalized.currentGrade;
        profile.gradeEffectiveDate = normalized.gradeEffectiveDate;
        profile.yearsInGrade = normalized.yearsInGrade;
        profile.previousExperienceYears = normalized.previousExperienceYears;
        profile.qualification = normalized.qualification;
        profile.asOfDate = normalized.asOfDate;
        profile.careerProgressionPast = normalized.careerProgressionPast;
        profile.lastUpdatedSource =
          PmsEmployeeProfileUpdateSource.MANUAL_EDIT;
        profile.sourceImportId = undefined;
        profile.updatedBy = actorObjectId;
        if (existing) {
          profile.profileVersion += 1;
        }
        await profile.save({ session });

        const afterValue = this.profileAuditSnapshot(profile.toObject());
        await PmsEmployeeCareerProfileChange.create(
          [
            {
              employeeId: employeeObjectId,
              profileId: profile._id,
              action:
                action === 'CREATED'
                  ? PmsEmployeeCareerProfileChangeAction.CREATED
                  : PmsEmployeeCareerProfileChangeAction.UPDATED,
              reason: normalized.reasonForChange,
              previousVersion: existing ? requestedVersion : 0,
              newVersion: profile.profileVersion,
              beforeValue,
              afterValue,
              changedBy: actorObjectId,
              changedAt: new Date(),
            },
          ],
          { session },
        );
        savedProfile = profile.toObject();
      });
    } finally {
      await session.endSession();
    }

    if (!savedProfile) {
      throw new Error('Employee career profile save did not complete');
    }
    return {
      action,
      profile: {
        profileId: savedProfile._id.toString(),
        currentGrade: savedProfile.currentGrade,
        gradeEffectiveDate: savedProfile.gradeEffectiveDate,
        yearsInGrade: savedProfile.yearsInGrade,
        previousExperienceYears: savedProfile.previousExperienceYears,
        qualification: savedProfile.qualification,
        asOfDate: savedProfile.asOfDate,
        careerProgressionPast: savedProfile.careerProgressionPast,
        profileVersion: savedProfile.profileVersion,
        lastUpdatedSource: savedProfile.lastUpdatedSource,
        updatedAt: savedProfile.updatedAt,
      },
    };
  }

  async getCareerProfileHistory(employeeId: string) {
    this.assertAdminActor();
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new Error('Invalid employee id');
    }
    const employeeObjectId = new Types.ObjectId(employeeId);
    const employeeExists = await User.exists({ _id: employeeObjectId });
    if (!employeeExists) {
      throw new Error('Employee was not found');
    }

    const [manualChanges, imports] = await Promise.all([
      PmsEmployeeCareerProfileChange.find({ employeeId: employeeObjectId })
        .sort({ changedAt: -1 })
        .limit(100)
        .lean(),
      PmsEmployeeProfileImport.find({
        affectedEmployeeIds: employeeObjectId,
        status: PmsEmployeeProfileImportStatus.COMPLETED,
      })
        .select(
          '_id originalFileName uploadedBy completedAt confirmedAt createdAt counts',
        )
        .sort({ completedAt: -1 })
        .limit(100)
        .lean(),
    ]);
    const actorIds = [
      ...new Set([
        ...manualChanges.map((change) => change.changedBy.toString()),
        ...imports.map((item) => item.uploadedBy.toString()),
      ]),
    ].filter((id) => Types.ObjectId.isValid(id));
    const actors = await User.find({ _id: { $in: actorIds } })
      .select('_id name employeeCode')
      .lean();
    const actorById = new Map(
      actors.map((actor) => [
        actor._id.toString(),
        {
          employeeId: actor._id.toString(),
          name: String(actor.name ?? '').trim(),
          employeeCode: String(actor.employeeCode ?? '').trim(),
        },
      ]),
    );

    return [
      ...manualChanges.map((change) => ({
        id: change._id.toString(),
        source: 'MANUAL_EDIT' as const,
        action: change.action,
        reason: change.reason,
        previousVersion: change.previousVersion,
        newVersion: change.newVersion,
        changedAt: change.changedAt,
        changedBy: actorById.get(change.changedBy.toString()),
        beforeValue: change.beforeValue,
        afterValue: change.afterValue,
      })),
      ...imports.map((item) => ({
        id: item._id.toString(),
        source: 'EXCEL_IMPORT' as const,
        action: 'IMPORTED' as const,
        reason: `Imported from ${item.originalFileName}`,
        changedAt: item.completedAt ?? item.confirmedAt ?? item.createdAt,
        changedBy: actorById.get(item.uploadedBy.toString()),
        importReference: item._id.toString(),
      })),
    ].sort(
      (left, right) =>
        new Date(right.changedAt).getTime() -
        new Date(left.changedAt).getTime(),
    );
  }

  async generateValidationErrorReport(importReference: string): Promise<Buffer> {
    this.assertAdminActor();
    if (!Types.ObjectId.isValid(importReference)) {
      throw new Error('Invalid import reference');
    }

    const importAudit = await PmsEmployeeProfileImport.findById(importReference).lean();
    if (!importAudit) {
      throw new Error('Employee profile import audit was not found');
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RTE PMS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Validation Errors', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    sheet.columns = [
      { header: 'Severity', key: 'severity', width: 14 },
      { header: 'Sheet', key: 'sheet', width: 26 },
      { header: 'Row', key: 'rowNumber', width: 10 },
      { header: 'Employee Code', key: 'employeeCode', width: 20 },
      { header: 'Column', key: 'column', width: 30 },
      { header: 'Error Code', key: 'code', width: 28 },
      { header: 'Message', key: 'message', width: 80 },
    ];
    this.styleHeader(sheet.getRow(1));

    for (const issue of importAudit.validationIssues ?? []) {
      sheet.addRow({
        severity: issue.severity,
        sheet: issue.sheet,
        rowNumber: issue.rowNumber ?? '',
        employeeCode: issue.employeeCode ?? '',
        column: issue.column ?? '',
        code: issue.code,
        message: issue.message,
      });
    }
    sheet.getColumn('message').alignment = { wrapText: true, vertical: 'top' };
    sheet.autoFilter = 'A1:G1';

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async buildSingleSheetTemplateWorkbook(
    input: TemplateBuildInput,
  ): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RTE PMS';
    workbook.lastModifiedBy = input.generatedBy;
    workbook.created = input.generatedAt;
    workbook.modified = input.generatedAt;
    workbook.subject = 'PMS Employee Career Progression Import';
    workbook.title = 'PMS Employee Career Progression Import Template';
    workbook.company = 'RTE';

    const instructions = workbook.addWorksheet('Instructions', {
      views: [{ showGridLines: false }],
    });
    const sheet = workbook.addWorksheet('Career Progression', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    const employeeReference = workbook.addWorksheet('Employee Reference', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });
    const dataConfig = workbook.addWorksheet('Data Config', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    });

    instructions.columns = [
      { key: 'item', width: 30 },
      { key: 'value', width: 95 },
    ];
    instructions.addRow([
      'PMS Employee Career Progression Import',
      'Complete only the Career Progression tab.',
    ]);
    instructions.mergeCells('A1:B1');
    this.styleHeader(instructions.getRow(1));
    instructions.addRow(['Template version', SINGLE_SHEET_TEMPLATE_VERSION]);
    instructions.addRow(['Generated at', input.generatedAt]);
    instructions.getCell('B3').numFmt = 'dd/mm/yyyy hh:mm';
    instructions.addRow(['Generated by', input.generatedBy]);
    instructions.addRow([
      'Employee blocks',
      'Enter Emp Code on the first row of each employee. Blank continuation rows belong to the previous employee.',
    ]);
    instructions.addRow([
      'Editable sheet',
      'All workbook tabs are intentionally unprotected. Grouped or merged employee blocks can be pasted and edited. Keep the required Career Progression column headers so the upload can identify the data.',
    ]);
    instructions.addRow([
      'Year',
      'Enter month and year as Apr-25. The month is preserved for the effective date.',
    ]);
    instructions.addRow([
      'Current promoted title',
      'The latest non-empty Promoted as value becomes the current promoted title / designation. The same row month becomes its effective date.',
    ]);
    instructions.addRow([
      'Past progression',
      'All other movement rows are stored as Career Progression – Past. Progression and Promoted as are optional free text. A row where both are blank is ignored.',
    ]);
    instructions.addRow([
      'Employee name',
      'Emp Name is reference-only. PMS resolves the employee from Emp Code.',
    ]);
    instructions.addRow([
      'No Grade LOV',
      'Progression and Promoted as are not checked against a Grade LOV.',
    ]);
    instructions.getColumn(2).alignment = {
      wrapText: true,
      vertical: 'top',
    };

    sheet.columns = [
      { header: 'Emp Code', key: 'employeeCode', width: 18 },
      { header: 'Emp Name', key: 'employeeName', width: 34 },
      { header: 'Year', key: 'year', width: 16 },
      { header: 'Progression', key: 'progression', width: 28 },
      { header: 'Promoted as', key: 'promotedAs', width: 30 },
    ];
    this.styleHeader(sheet.getRow(1));
    sheet.autoFilter = 'A1:E1';
    sheet.getCell('A1').note =
      'Required on the first row of each employee block. Blank continuation rows use the previous employee code.';
    sheet.getCell('B1').note =
      'Reference only. Employee identity is resolved from Emp Code.';
    sheet.getCell('C1').note =
      'Required. Enter month and year, for example Apr-25.';
    sheet.getCell('D1').note =
      'Required free text, for example Promotion, Merit 100, or Promotion+Merit 50.';
    sheet.getCell('E1').note =
      'Optional for merit-only rows. The latest non-empty value becomes the current promoted title / designation and its month becomes the effective date.';

    for (let columnNumber = 1; columnNumber <= 5; columnNumber += 1) {
      sheet.getColumn(columnNumber).protection = { locked: false };
      sheet.getCell(1, columnNumber).protection = { locked: true };
    }

    const activeEmployees = input.employees.filter(
      (employee) => employee.active !== false,
    );
    this.populateEmployeeReferenceSheet(employeeReference, activeEmployees);
    const employeeReferenceEnd = Math.max(activeEmployees.length + 1, 2);
    workbook.definedNames.add(
      `'Employee Reference'!$A$2:$A$${employeeReferenceEnd}`,
      'PmsSingleSheetEmployeeCodes',
    );
    (sheet as any).dataValidations.add(
      `A2:A${PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS + 1}`,
      {
        type: 'list',
        allowBlank: true,
        formulae: ['PmsSingleSheetEmployeeCodes'],
        showErrorMessage: true,
        errorTitle: 'Invalid Employee Code',
        error: 'Select or enter an Employee Code from Employee Reference.',
      },
    );

    dataConfig.columns = [
      { header: 'Column', key: 'column', width: 24 },
      { header: 'Required', key: 'required', width: 14 },
      { header: 'Format / Rule', key: 'rule', width: 72 },
      { header: 'Example', key: 'example', width: 30 },
    ];
    this.styleHeader(dataConfig.getRow(1));
    [
      {
        column: 'Emp Code',
        required: 'Block start',
        rule:
          'Must exist in Employee Reference. Blank continuation rows use the previous code.',
        example: '8502',
      },
      {
        column: 'Emp Name',
        required: 'No',
        rule: 'Reference only; employee matching uses Emp Code.',
        example: 'SARAVANAN R',
      },
      {
        column: 'Year',
        required: 'Yes',
        rule: 'Month-year in MMM-YY or MMM-YYYY format.',
        example: 'Apr-25',
      },
      {
        column: 'Progression',
        required: 'No',
        rule:
          'Optional free text; maximum 150 characters. No LOV. If Progression and Promoted as are both blank, the row is ignored.',
        example: 'Promotion+Merit 50',
      },
      {
        column: 'Promoted as',
        required: 'Conditional',
        rule:
          'Free text; maximum 100 characters. Latest non-empty value becomes the current promoted title / designation.',
        example: 'Asst. Manager',
      },
    ].forEach((row) => dataConfig.addRow(row));
    dataConfig.autoFilter = 'A1:D6';
    dataConfig.getColumn(3).alignment = {
      wrapText: true,
      vertical: 'top',
    };

    return workbook;
  }

  async buildTemplateWorkbook(input: TemplateBuildInput): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RTE PMS';
    workbook.lastModifiedBy = input.generatedBy;
    workbook.created = input.generatedAt;
    workbook.modified = input.generatedAt;
    workbook.subject = 'PMS Employee Career Profile Import';
    workbook.title = 'PMS Employee Career Profile Import Template';
    workbook.company = 'RTE';

    const instructions = workbook.addWorksheet(PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS, {
      views: [{ showGridLines: false }],
    });
    const employeeProfile = workbook.addWorksheet(
      PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE,
      { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] },
    );
    const careerProgression = workbook.addWorksheet(
      PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION,
      { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] },
    );
    const employeeReference = workbook.addWorksheet(
      PmsEmployeeProfileWorkbookSheet.EMPLOYEE_REFERENCE,
      { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] },
    );
    const gradeReference = workbook.addWorksheet(
      PmsEmployeeProfileWorkbookSheet.GRADE_REFERENCE,
      { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] },
    );
    const activeEmployees = input.employees.filter(
      (employee) => employee.active !== false,
    );

    this.populateInstructionsSheet(instructions, input);
    this.populateProfileSheet(employeeProfile);
    this.populateCareerSheet(careerProgression);
    this.populateEmployeeReferenceSheet(employeeReference, activeEmployees);
    this.populateGradeReferenceSheet(gradeReference, input.grades);

    workbook.definedNames.add(
      `'${PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS}'!$B$2`,
      'PmsProfileTemplateVersion',
    );

    const employeeReferenceEnd = Math.max(activeEmployees.length + 1, 2);
    const gradeReferenceEnd = Math.max(input.grades.length + 1, 2);
    workbook.definedNames.add(
      `'${PmsEmployeeProfileWorkbookSheet.EMPLOYEE_REFERENCE}'!$A$2:$A$${employeeReferenceEnd}`,
      'PmsEmployeeCodes',
    );
    workbook.definedNames.add(
      `'${PmsEmployeeProfileWorkbookSheet.GRADE_REFERENCE}'!$A$2:$A$${gradeReferenceEnd}`,
      'PmsGradeCodes',
    );

    (employeeProfile as any).dataValidations.add(
      `A2:A${PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS + 1}`,
      {
        type: 'list',
        allowBlank: false,
        formulae: ['PmsEmployeeCodes'],
        showErrorMessage: true,
        errorTitle: 'Invalid Employee Code',
        error: 'Select or enter an Employee Code from Employee Reference.',
      },
    );
    (employeeProfile as any).dataValidations.add(
      `B2:B${PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS + 1}`,
      {
        type: 'list',
        allowBlank: false,
        formulae: ['PmsGradeCodes'],
        showErrorMessage: true,
        errorTitle: 'Invalid Grade',
        error: 'Select a Grade Code from Grade Reference.',
      },
    );
    (employeeProfile as any).dataValidations.add(
      `D2:E${PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS + 1}`,
      {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        formulae: [0, 80],
        showErrorMessage: true,
        errorTitle: 'Invalid Years',
        error: 'Enter a number between 0 and 80.',
      },
    );
    (careerProgression as any).dataValidations.add(
      `A2:A${PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS + 1}`,
      {
        type: 'list',
        allowBlank: false,
        formulae: ['PmsEmployeeCodes'],
        showErrorMessage: true,
        errorTitle: 'Invalid Employee Code',
        error: 'Select or enter an Employee Code from Employee Reference.',
      },
    );
    (careerProgression as any).dataValidations.add(
      `C2:C${PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS + 1}`,
      {
        type: 'list',
        allowBlank: true,
        formulae: ['PmsGradeCodes'],
        showErrorMessage: true,
        errorTitle: 'Invalid Grade',
        error: 'Select a Grade Code from Grade Reference.',
      },
    );
    (careerProgression as any).dataValidations.add(
      `B2:B${PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS + 1}`,
      {
        type: 'whole',
        operator: 'between',
        allowBlank: false,
        formulae: [1900, 2200],
        showErrorMessage: true,
        errorTitle: 'Invalid Year',
        error: 'Enter a four-digit year.',
      },
    );
    (careerProgression as any).dataValidations.add(
      `F2:F${PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS + 1}`,
      {
        type: 'whole',
        operator: 'greaterThanOrEqual',
        allowBlank: true,
        formulae: [1],
        showErrorMessage: true,
        errorTitle: 'Invalid Sequence',
        error: 'Enter a positive whole number.',
      },
    );

    for (const sheet of [instructions, employeeReference, gradeReference]) {
      await sheet.protect(TEMPLATE_PROTECTION_PASSWORD, {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        deleteRows: false,
      });
    }
    for (const sheet of [employeeProfile, careerProgression]) {
      await sheet.protect(TEMPLATE_PROTECTION_PASSWORD, {
        selectLockedCells: false,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        insertHyperlinks: false,
        deleteColumns: false,
        deleteRows: false,
        sort: true,
        autoFilter: true,
      });
    }

    return workbook;
  }

  async validateWorkbookBuffer(
    buffer: Buffer,
    referenceData: PmsEmployeeProfileReferenceData,
  ): Promise<PmsEmployeeProfileWorkbookValidation> {
    const issues: PmsEmployeeProfileValidationIssue[] = [];
    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.load(buffer as any, {
        // Import validation needs workbook names and cell values only. Skipping
        // presentation/protection metadata avoids expanding worksheet nodes
        // that are irrelevant to server-side validation.
        ignoreNodes: IMPORT_VALIDATION_IGNORED_WORKSHEET_NODES,
      });
    } catch {
      return this.emptyValidation([
        this.issue(
          'ERROR',
          'Workbook',
          'WORKBOOK_UNREADABLE',
          'The uploaded file is not a readable .xlsx workbook.',
        ),
      ]);
    }

    const singleSheetSource = this.findSingleSheetProgressionSource(workbook);
    if (singleSheetSource) {
      return this.validateSingleSheetProgressionSource(
        singleSheetSource,
        referenceData,
      );
    }

    const actualSheetNames = workbook.worksheets.map((sheet) => sheet.name);
    for (const sheetName of REQUIRED_SHEETS) {
      if (!actualSheetNames.includes(sheetName)) {
        issues.push(
          this.issue(
            'ERROR',
            sheetName,
            'SHEET_MISSING',
            `Required sheet "${sheetName}" is missing.`,
          ),
        );
      }
    }
    for (const sheetName of actualSheetNames) {
      if (!REQUIRED_SHEETS.includes(sheetName as (typeof REQUIRED_SHEETS)[number])) {
        issues.push(
          this.issue(
            'ERROR',
            sheetName,
            'UNSUPPORTED_SHEET',
            `Unexpected sheet "${sheetName}" is not part of the supported template.`,
          ),
        );
      }
    }

    const instructions = workbook.getWorksheet(PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS);
    const profileSheet = workbook.getWorksheet(PmsEmployeeProfileWorkbookSheet.EMPLOYEE_PROFILE);
    const careerSheet = workbook.getWorksheet(PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION);

    const definedVersionRanges = workbook.definedNames.getRanges('PmsProfileTemplateVersion');
    const hasVersionName = definedVersionRanges?.ranges?.some(
      (range) =>
        range.replace(/^'|'(?=!)/g, '') ===
        `${PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS}!$B$2`,
    );
    if (!hasVersionName) {
      issues.push(
        this.issue(
          'ERROR',
          PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS,
          'TEMPLATE_VERSION_NAME_MISSING',
          'Named range PmsProfileTemplateVersion is missing or points to the wrong cell.',
          2,
          undefined,
          'Template Version',
        ),
      );
    }

    const templateVersion = instructions
      ? this.cellText(instructions.getCell('B2'))
      : undefined;
    if (!templateVersion) {
      issues.push(
        this.issue(
          'ERROR',
          PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS,
          'TEMPLATE_VERSION_MISSING',
          'Template Version is missing.',
          2,
          undefined,
          'Template Version',
        ),
      );
    } else if (templateVersion !== PMS_EMPLOYEE_PROFILE_TEMPLATE_VERSION) {
      issues.push(
        this.issue(
          'ERROR',
          PmsEmployeeProfileWorkbookSheet.INSTRUCTIONS,
          'TEMPLATE_VERSION_UNSUPPORTED',
          `Template Version "${templateVersion}" is unsupported. Download version ${PMS_EMPLOYEE_PROFILE_TEMPLATE_VERSION}.`,
          2,
          undefined,
          'Template Version',
        ),
      );
    }

    if (profileSheet) {
      this.validateHeaders(profileSheet, PROFILE_HEADERS, issues);
    }
    if (careerSheet) {
      this.validateHeaders(careerSheet, CAREER_HEADERS, issues);
    }

    if (!profileSheet || !careerSheet) {
      return this.emptyValidation(issues, templateVersion);
    }

    const employeeMap = new Map(
      referenceData.employees.map((employee) => [
        this.normalizeKey(employee.employeeCode),
        employee,
      ]),
    );
    const gradeMap = new Map(
      referenceData.grades.map((grade) => [this.normalizeKey(grade.code), grade]),
    );

    const rawProfileRows = this.nonEmptyRows(profileSheet, PROFILE_HEADERS.length);
    const rawCareerRows = this.nonEmptyRows(careerSheet, CAREER_HEADERS.length);
    if (rawProfileRows.length > PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS) {
      issues.push(
        this.issue(
          'ERROR',
          profileSheet.name,
          'PROFILE_ROW_LIMIT_EXCEEDED',
          `Employee Profile contains ${rawProfileRows.length} rows; the maximum is ${PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS}.`,
        ),
      );
    }
    if (rawCareerRows.length > PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS) {
      issues.push(
        this.issue(
          'ERROR',
          careerSheet.name,
          'CAREER_ROW_LIMIT_EXCEEDED',
          `Career Progression Past contains ${rawCareerRows.length} rows; the maximum is ${PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS}.`,
        ),
      );
    }

    const profiles: ParsedEmployeeProfileRow[] = [];
    const profileByCode = new Map<string, ParsedEmployeeProfileRow>();
    const duplicateProfileCodes = new Set<string>();
    const profileAsOfDate = this.currentServerDate();

    for (const row of rawProfileRows.slice(0, PMS_EMPLOYEE_PROFILE_MAX_PROFILE_ROWS)) {
      const employeeCode = this.cellText(row.getCell(1));
      const normalizedCode = this.normalizeKey(employeeCode);
      const currentGradeInput = this.cellText(row.getCell(2));
      const normalizedGrade = this.normalizeKey(currentGradeInput);
      const rowIssues: PmsEmployeeProfileValidationIssue[] = [];
      const employee = employeeMap.get(normalizedCode);
      const grade = gradeMap.get(normalizedGrade);

      this.rejectFormulas(row, PROFILE_HEADERS, profileSheet.name, rowIssues);
      if (!employeeCode) {
        rowIssues.push(
          this.issue(
            'ERROR',
            profileSheet.name,
            'EMPLOYEE_CODE_REQUIRED',
            'Employee Code is required.',
            row.number,
            undefined,
            PROFILE_HEADERS[0],
          ),
        );
      } else if (!employee) {
        rowIssues.push(
          this.issue(
            'ERROR',
            profileSheet.name,
            'EMPLOYEE_NOT_FOUND',
            `Employee Code "${employeeCode}" was not found in the current employee master.`,
            row.number,
            employeeCode,
            PROFILE_HEADERS[0],
          ),
        );
      } else if (!employee.active) {
        rowIssues.push(
          this.issue(
            'ERROR',
            profileSheet.name,
            'EMPLOYEE_INACTIVE',
            'Employee is inactive and cannot be included in a PMS career-profile import.',
            row.number,
            employee.employeeCode,
            PROFILE_HEADERS[0],
          ),
        );
      }

      if (normalizedCode && profileByCode.has(normalizedCode)) {
        duplicateProfileCodes.add(normalizedCode);
        rowIssues.push(
          this.issue(
            'ERROR',
            profileSheet.name,
            'DUPLICATE_EMPLOYEE_CODE',
            `Employee Code "${employeeCode}" appears more than once in Employee Profile.`,
            row.number,
            employeeCode,
            PROFILE_HEADERS[0],
          ),
        );
      }

      if (!currentGradeInput) {
        rowIssues.push(
          this.issue(
            'ERROR',
            profileSheet.name,
            'CURRENT_GRADE_REQUIRED',
            'Current Grade is required.',
            row.number,
            employeeCode,
            PROFILE_HEADERS[1],
          ),
        );
      } else if (!grade) {
        rowIssues.push(
          this.issue(
            'ERROR',
            profileSheet.name,
            'GRADE_NOT_FOUND',
            `Current Grade "${currentGradeInput}" is not an active PMS Grade LOV code.`,
            row.number,
            employeeCode,
            PROFILE_HEADERS[1],
          ),
        );
      }

      const gradeEffectiveDate = this.parseDateCell(
        row.getCell(3),
        profileSheet.name,
        row.number,
        employeeCode,
        PROFILE_HEADERS[2],
        rowIssues,
      );
      const yearsInGrade = this.parseOptionalNumber(
        row.getCell(4),
        0,
        80,
        profileSheet.name,
        row.number,
        employeeCode,
        PROFILE_HEADERS[3],
        rowIssues,
      );
      const previousExperienceYears = this.parseOptionalNumber(
        row.getCell(5),
        0,
        80,
        profileSheet.name,
        row.number,
        employeeCode,
        PROFILE_HEADERS[4],
        rowIssues,
      );
      const qualification = this.cellText(row.getCell(6));
      if (qualification.length > 250) {
        rowIssues.push(
          this.issue(
            'ERROR',
            profileSheet.name,
            'QUALIFICATION_TOO_LONG',
            'Qualification cannot exceed 250 characters.',
            row.number,
            employeeCode,
            PROFILE_HEADERS[5],
          ),
        );
      }
      if (!gradeEffectiveDate && yearsInGrade === undefined) {
        rowIssues.push(
          this.issue(
            'ERROR',
            profileSheet.name,
            'GRADE_TENURE_SOURCE_REQUIRED',
            'Enter Grade Effective Date or Years in Grade.',
            row.number,
            employeeCode,
            PROFILE_HEADERS[2],
          ),
        );
      }
      if (
        gradeEffectiveDate &&
        gradeEffectiveDate.getTime() > profileAsOfDate.getTime()
      ) {
        rowIssues.push(
          this.issue(
            'ERROR',
            profileSheet.name,
            'GRADE_DATE_AFTER_AS_OF_DATE',
            'Grade Effective Date cannot be later than today.',
            row.number,
            employeeCode,
            PROFILE_HEADERS[2],
          ),
        );
      }

      issues.push(...rowIssues);
      const parsed: ParsedEmployeeProfileRow = {
        rowNumber: row.number,
        employeeId: employee?.employeeId,
        employeeCode: employee?.employeeCode || employeeCode,
        employeeName: employee?.name,
        designation: employee?.designation,
        department: employee?.department,
        managerCode: employee?.managerCode,
        managerName: employee?.managerName,
        employeeActive: employee?.active,
        currentGrade: grade?.code || currentGradeInput,
        gradeEffectiveDate,
        yearsInGrade,
        previousExperienceYears,
        qualification: qualification || undefined,
        asOfDate: profileAsOfDate,
        careerProgressionPast: [],
        valid: !rowIssues.some((issue) => issue.severity === 'ERROR'),
        errors: rowIssues
          .filter((issue) => issue.severity === 'ERROR')
          .map((issue) => issue.message),
        warnings: rowIssues
          .filter((issue) => issue.severity === 'WARNING')
          .map((issue) => issue.message),
      };
      profiles.push(parsed);
      if (normalizedCode && !profileByCode.has(normalizedCode)) {
        profileByCode.set(normalizedCode, parsed);
      }
    }

    if (duplicateProfileCodes.size > 0) {
      for (const profile of profiles) {
        if (duplicateProfileCodes.has(this.normalizeKey(profile.employeeCode))) {
          profile.valid = false;
          if (!profile.errors.some((message) => message.includes('appears more than once'))) {
            profile.errors.push('Employee Code appears more than once in Employee Profile.');
          }
        }
      }
    }

    const careerYearGradeKeys = new Set<string>();
    const derivedSequence = new Map<string, number>();
    for (const row of rawCareerRows.slice(0, PMS_EMPLOYEE_PROFILE_MAX_CAREER_ROWS)) {
      const employeeCodeInput = this.cellText(row.getCell(1));
      const normalizedCode = this.normalizeKey(employeeCodeInput);
      const employee = employeeMap.get(normalizedCode);
      const relatedProfile = profileByCode.get(normalizedCode);
      const rowIssues: PmsEmployeeProfileValidationIssue[] = [];

      this.rejectFormulas(row, CAREER_HEADERS, careerSheet.name, rowIssues);
      if (!employeeCodeInput) {
        rowIssues.push(
          this.issue(
            'ERROR',
            careerSheet.name,
            'EMPLOYEE_CODE_REQUIRED',
            'Employee Code is required.',
            row.number,
            undefined,
            CAREER_HEADERS[0],
          ),
        );
      } else if (!employee) {
        rowIssues.push(
          this.issue(
            'ERROR',
            careerSheet.name,
            'EMPLOYEE_NOT_FOUND',
            `Employee Code "${employeeCodeInput}" was not found in the current employee master.`,
            row.number,
            employeeCodeInput,
            CAREER_HEADERS[0],
          ),
        );
      }
      if (employee && !relatedProfile) {
        rowIssues.push(
          this.issue(
            'WARNING',
            careerSheet.name,
            'PROFILE_ROW_NOT_IN_WORKBOOK',
            'Career history is present without an Employee Profile row in this workbook.',
            row.number,
            employee.employeeCode,
            CAREER_HEADERS[0],
          ),
        );
      }

      const year = this.parseRequiredWholeNumber(
        row.getCell(2),
        1900,
        2200,
        careerSheet.name,
        row.number,
        employeeCodeInput,
        CAREER_HEADERS[1],
        rowIssues,
      );
      const gradeInput = this.cellText(row.getCell(3));
      const grade = gradeInput
        ? gradeMap.get(this.normalizeKey(gradeInput))
        : undefined;
      if (gradeInput && !grade) {
        rowIssues.push(
          this.issue(
            'ERROR',
            careerSheet.name,
            'GRADE_NOT_FOUND',
            `Grade "${gradeInput}" is not an active PMS Grade LOV code.`,
            row.number,
            employeeCodeInput,
            CAREER_HEADERS[2],
          ),
        );
      }
      const careerFunction = this.cellText(row.getCell(4));
      const unitOrDepartment = this.cellText(row.getCell(5));
      if (!gradeInput && !careerFunction && !unitOrDepartment) {
        rowIssues.push(
          this.issue(
            'ERROR',
            careerSheet.name,
            'CAREER_DETAIL_REQUIRED',
            'Enter Grade, Function, or Unit / Department.',
            row.number,
            employeeCodeInput,
            CAREER_HEADERS[2],
          ),
        );
      }

      const providedSequence = this.parseOptionalWholeNumber(
        row.getCell(6),
        1,
        Number.MAX_SAFE_INTEGER,
        careerSheet.name,
        row.number,
        employeeCodeInput,
        CAREER_HEADERS[5],
        rowIssues,
      );
      const sequenceGroup = `${normalizedCode}:${year ?? 'INVALID'}`;
      const nextSequence = (derivedSequence.get(sequenceGroup) ?? 0) + 1;
      const sequence = providedSequence ?? nextSequence;
      derivedSequence.set(sequenceGroup, Math.max(nextSequence, sequence));

      if (normalizedCode && year !== undefined) {
        const normalizedCareerGrade = this.normalizeKey(
          grade?.code || gradeInput || '',
        );
        const careerYearGradeKey =
          `${normalizedCode}:${year}:${normalizedCareerGrade || '<blank>'}`;
        if (careerYearGradeKeys.has(careerYearGradeKey)) {
          const gradeLabel = grade?.code || gradeInput || '(blank)';
          rowIssues.push(
            this.issue(
              'ERROR',
              careerSheet.name,
              'DUPLICATE_CAREER_YEAR_GRADE',
              `Employee Code "${employee?.employeeCode || employeeCodeInput}" already has Year ${year} and Grade ${gradeLabel} in another row. Each Employee + Year + Grade combination must be unique.`,
              row.number,
              employeeCodeInput,
              CAREER_HEADERS[2],
            ),
          );
        }
        careerYearGradeKeys.add(careerYearGradeKey);
      }

      const asOfYear =
        relatedProfile?.asOfDate?.getUTCFullYear() ?? new Date().getUTCFullYear();
      if (year !== undefined && year > asOfYear) {
        rowIssues.push(
          this.issue(
            'ERROR',
            careerSheet.name,
            'CAREER_YEAR_AFTER_AS_OF_DATE',
            `Career Year cannot be later than ${asOfYear}.`,
            row.number,
            employeeCodeInput,
            CAREER_HEADERS[1],
          ),
        );
      }

      issues.push(...rowIssues);
      const careerRow: ParsedCareerProgressionRow | undefined =
        year === undefined
          ? undefined
          : {
              rowNumber: row.number,
              employeeCode: employee?.employeeCode || employeeCodeInput,
              year,
              grade: grade?.code || gradeInput || undefined,
              function: careerFunction || undefined,
              unitOrDepartment: unitOrDepartment || undefined,
              sequence,
            };

      if (relatedProfile && careerRow) {
        relatedProfile.careerProgressionPast.push(careerRow);
        if (rowIssues.some((issue) => issue.severity === 'ERROR')) {
          relatedProfile.valid = false;
          relatedProfile.errors.push(
            ...rowIssues
              .filter((issue) => issue.severity === 'ERROR')
              .map((issue) => `Career row ${row.number}: ${issue.message}`),
          );
        }
        relatedProfile.warnings.push(
          ...rowIssues
            .filter((issue) => issue.severity === 'WARNING')
            .map((issue) => `Career row ${row.number}: ${issue.message}`),
        );
      }
    }

    for (const profile of profiles) {
      profile.careerProgressionPast.sort(
        (left, right) => left.year - right.year || left.sequence - right.sequence,
      );
    }

    if (rawProfileRows.length === 0) {
      issues.push(
        this.issue(
          'ERROR',
          profileSheet.name,
          'NO_PROFILE_ROWS',
          'Employee Profile does not contain any data rows.',
        ),
      );
    }

    const errorCount = issues.filter((issue) => issue.severity === 'ERROR').length;
    const warningCount = issues.filter((issue) => issue.severity === 'WARNING').length;
    const invalidCount = profiles.filter((profile) => !profile.valid).length;
    const validCount = profiles.length - invalidCount;

    return {
      templateVersion,
      profileRowCount: rawProfileRows.length,
      careerRowCount: rawCareerRows.length,
      validCount,
      invalidCount,
      warningCount,
      canImport: errorCount === 0 && validCount > 0,
      issues,
      profiles,
    };
  }

  private async loadReferenceData(): Promise<PmsEmployeeProfileReferenceData> {
    const [users, departmentLov] = await Promise.all([
      User.find({
        employeeCode: { $exists: true, $ne: '' },
        active: { $ne: false },
      })
        .select(
          '_id employeeCode name specificRole role departmentId managerId managerName active',
        )
        .sort({ employeeCode: 1 })
        .lean(),
      LOV.findOne({ type: 'department' }).lean(),
    ]);
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));
    const departmentMap = new Map(
      (departmentLov?.values ?? []).map((item) => [
        this.normalizeKey(item.value),
        item.label,
      ]),
    );
    const employees = users.map((user) => {
      const managerId = user.managerId?.toString?.() ?? String(user.managerId ?? '');
      const manager = managerId ? userMap.get(managerId) : undefined;
      return {
        employeeId: user._id.toString(),
        employeeCode: String(user.employeeCode ?? '').trim(),
        name: String(user.name ?? '').trim(),
        designation: String(user.specificRole ?? user.role ?? '').trim(),
        department:
          departmentMap.get(this.normalizeKey(user.departmentId)) ??
          String(user.departmentId ?? '').trim(),
        managerCode: String(manager?.employeeCode ?? '').trim(),
        managerName: String(manager?.name ?? user.managerName ?? '').trim(),
        active: user.active !== false,
      };
    });
    return { employees, grades: [] };
  }

  private populateInstructionsSheet(
    sheet: ExcelJS.Worksheet,
    input: TemplateBuildInput,
  ) {
    sheet.columns = [
      { key: 'label', width: 27 },
      { key: 'required', width: 18 },
      { key: 'guidance', width: 58 },
      { key: 'example', width: 34 },
    ];
    sheet.properties.tabColor = { argb: 'FF0F766E' };

    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = 'PMS Employee Career Profile Import — Start Here';
    sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF155E75' },
    };
    sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 34;

    sheet.getCell('A2').value = 'Template Version';
    sheet.getCell('B2').value = PMS_EMPLOYEE_PROFILE_TEMPLATE_VERSION;
    sheet.getCell('C2').value = 'Generated At';
    sheet.getCell('D2').value = input.generatedAt;
    sheet.getCell('D2').numFmt = 'dd/mm/yyyy hh:mm';
    sheet.getCell('A3').value = 'Generated By';
    sheet.mergeCells('B3:D3');
    sheet.getCell('B3').value = input.generatedBy;

    const section = (rowNumber: number, title: string) => {
      sheet.mergeCells(`A${rowNumber}:D${rowNumber}`);
      const cell = sheet.getCell(rowNumber, 1);
      cell.value = title;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0E7490' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      sheet.getRow(rowNumber).height = 25;
    };
    const guidance = (
      rowNumber: number,
      label: string,
      text: string,
      tone: 'normal' | 'success' | 'warning' | 'danger' = 'normal',
    ) => {
      sheet.getCell(rowNumber, 1).value = label;
      sheet.mergeCells(`B${rowNumber}:D${rowNumber}`);
      sheet.getCell(rowNumber, 2).value = text;
      const fills = {
        normal: 'FFFFFFFF',
        success: 'FFECFDF5',
        warning: 'FFFFF7ED',
        danger: 'FFFEF2F2',
      };
      const fontColors = {
        normal: 'FF0F172A',
        success: 'FF047857',
        warning: 'FFC2410C',
        danger: 'FFB91C1C',
      };
      for (let columnNumber = 1; columnNumber <= 4; columnNumber += 1) {
        const cell = sheet.getCell(rowNumber, columnNumber);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fills[tone] },
        };
        cell.font = {
          bold: columnNumber === 1 || tone === 'danger',
          color: { argb: fontColors[tone] },
        };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }
    };
    const fieldHeader = (rowNumber: number) => {
      const values = ['Field', 'Required?', 'What to enter', 'Example'];
      values.forEach((value, index) => {
        const cell = sheet.getCell(rowNumber, index + 1);
        cell.value = value;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF334155' },
        };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      sheet.getRow(rowNumber).height = 24;
    };
    const field = (
      rowNumber: number,
      name: string,
      required: string,
      description: string,
      example: string,
    ) => {
      const values = [name, required, description, example];
      values.forEach((value, index) => {
        const cell = sheet.getCell(rowNumber, index + 1);
        cell.value = value;
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if (index === 0) {
          cell.font = { bold: true, color: { argb: 'FF164E63' } };
        }
      });
    };

    section(5, 'START HERE — COMPLETE ONLY THE TWO BLUE TABS');
    guidance(
      6,
      'Required',
      'Employee Profile: enter one row for every employee you want to import. At least one completed row is required.',
      'success',
    );
    guidance(
      7,
      'Optional',
      'Career Progression Past: add rows only when you need to store past grade, function, or department movements. It may be left blank.',
      'success',
    );
    guidance(
      8,
      'Do not edit',
      'Instructions, Employee Reference, and Grade Reference are protected reference tabs. Use them to find valid employee and grade codes.',
      'warning',
    );
    guidance(
      9,
      'Required fields',
      'A star (*) in a column heading means that the field is required.',
    );

    section(11, 'COMPLETE THE FILE IN 5 SIMPLE STEPS');
    guidance(
      12,
      'Step 1',
      'Open Employee Profile and select an active Employee Code from the dropdown.',
    );
    guidance(
      13,
      'Step 2',
      'Complete one Employee Profile row per employee. Do not enter the same employee twice.',
    );
    guidance(
      14,
      'Step 3',
      'If needed, open Career Progression Past and add one row for each past movement. The same employee may have several history rows.',
    );
    guidance(
      15,
      'Step 4',
      'Save this same workbook as an .xlsx file. Keep all five tab names and all column headings unchanged.',
    );
    guidance(
      16,
      'Step 5',
      'Upload the workbook in PMS, review every reported issue, and confirm only after the validation result is correct.',
    );

    section(18, 'EMPLOYEE PROFILE — FIELD GUIDE');
    fieldHeader(19);
    field(
      20,
      'Employee Code *',
      'Yes',
      'Select the active employee from the dropdown. This code decides which employee will be updated.',
      'RTE0001',
    );
    field(
      21,
      'Current Grade *',
      'Yes',
      'Select the employee’s current active Grade Code from the dropdown.',
      'G5',
    );
    field(
      22,
      'Grade Effective Date',
      'Conditional',
      'Enter the date the current grade started. If this date is unavailable, enter Years in Grade instead.',
      '01/04/2024',
    );
    field(
      23,
      'Years in Grade',
      'Conditional',
      'Enter the completed or decimal years in the current grade only when Grade Effective Date is unavailable.',
      '2 or 2.50',
    );
    field(
      24,
      'Previous Experience (Years)',
      'No',
      'Enter total previous experience in years. Use no more than two decimal places.',
      '3.50',
    );
    field(
      25,
      'Qualification',
      'No',
      'Enter the employee’s qualification as plain text.',
      'B.E. Mechanical',
    );
    guidance(
      26,
      'Last verified date',
      'You do not need to enter this date. PMS records the current server date automatically after a successful import.',
      'success',
    );

    section(28, 'CAREER PROGRESSION PAST — OPTIONAL FIELD GUIDE');
    guidance(
      29,
      'How rows work',
      'Use one row for each past movement. Employee Code and Year are required, plus at least one detail. Do not repeat the same Employee Code + Year + Grade combination.',
    );
    fieldHeader(30);
    field(
      31,
      'Employee Code *',
      'Yes',
      'Select the same active Employee Code used in Employee Profile.',
      'RTE0001',
    );
    field(
      32,
      'Year *',
      'Yes',
      'Enter the four-digit year of the past movement.',
      '2022',
    );
    field(
      33,
      'Grade',
      'One detail required',
      'Select the Grade Code for that movement when known. For one employee, the same Year + Grade may appear only once.',
      'G4',
    );
    field(
      34,
      'Function',
      'One detail required',
      'Enter the function or role for that movement when known.',
      'Operations',
    );
    field(
      35,
      'Unit / Department',
      'One detail required',
      'Enter the unit or department for that movement when known.',
      'Plant 2',
    );
    field(
      36,
      'Sequence',
      'No',
      'Use 1, 2, 3 only when the same employee has movements with different grades in the same year. If blank, worksheet row order is used.',
      '1',
    );

    section(38, 'IMPORTANT — REVIEW BEFORE YOU UPLOAD');
    guidance(
      39,
      'Existing data',
      'Current profile fields are updated from this workbook. Career Progression Past is incremental: existing history is preserved, new Year + Grade rows are appended, and a blank career-history section leaves existing history unchanged. Use the Admin profile page with a reason to correct or remove stored history.',
      'warning',
    );
    guidance(
      40,
      'Validation',
      'Nothing is saved when the workbook has a blocking error. Correct every error shown in the validation results, then upload again.',
      'warning',
    );
    guidance(
      41,
      'Employee safety',
      'This import cannot create employees or change employee name, designation, department, manager, status, or reporting hierarchy.',
    );
    guidance(
      42,
      'Current references',
      'The reference tabs show active values available when this file was downloaded. The upload is checked again against the latest PMS data.',
    );
    guidance(
      43,
      'Do not change',
      `Keep these five tabs unchanged: ${REQUIRED_SHEETS.join(', ')}. Do not rename or reorder required columns, add formulas or macros, or merge data cells.`,
    );

    for (let rowNumber = 2; rowNumber <= 43; rowNumber += 1) {
      for (let columnNumber = 1; columnNumber <= 4; columnNumber += 1) {
        const cell = sheet.getCell(rowNumber, columnNumber);
        cell.alignment = {
          vertical: cell.alignment?.vertical ?? 'top',
          horizontal: cell.alignment?.horizontal,
          wrapText: true,
        };
      }
    }
    for (const rowNumber of [
      6, 7, 8, 9, 12, 13, 14, 15, 16, 20, 21, 22, 23, 24, 25, 26, 29, 31,
      32, 33, 34, 35, 36, 39, 40, 41, 42, 43,
    ]) {
      sheet.getRow(rowNumber).height =
        [39, 40, 43].includes(rowNumber) ? 48 : 36;
    }
    for (const cellAddress of ['A2', 'C2', 'A3']) {
      sheet.getCell(cellAddress).font = {
        bold: true,
        color: { argb: 'FF164E63' },
      };
    }
  }

  private populateProfileSheet(sheet: ExcelJS.Worksheet) {
    sheet.columns = [
      { header: PROFILE_HEADERS[0], key: 'employeeCode', width: 22 },
      { header: PROFILE_HEADERS[1], key: 'currentGrade', width: 20 },
      { header: PROFILE_HEADERS[2], key: 'gradeEffectiveDate', width: 24 },
      { header: PROFILE_HEADERS[3], key: 'yearsInGrade', width: 19 },
      { header: PROFILE_HEADERS[4], key: 'previousExperienceYears', width: 31 },
      { header: PROFILE_HEADERS[5], key: 'qualification', width: 36 },
    ];
    sheet.properties.tabColor = { argb: 'FF2563EB' };
    this.styleHeader(sheet.getRow(1));
    sheet.autoFilter = `A1:F1`;
    sheet.getColumn(3).numFmt = 'dd/mm/yyyy';
    sheet.getColumn(4).numFmt = '0.00';
    sheet.getColumn(5).numFmt = '0.00';
    for (let index = 1; index <= PROFILE_HEADERS.length; index += 1) {
      sheet.getColumn(index).protection = { locked: false };
      sheet.getCell(1, index).protection = { locked: true };
    }
    const notes = [
      'Required. Select an active Employee Code from the dropdown. Enter one profile row per employee.',
      'Required. Select an active Grade Code from the dropdown.',
      'Enter the date the current grade started. If unavailable, enter Years in Grade instead.',
      'Enter only when Grade Effective Date is unavailable. Use a number from 0 to 80 with up to two decimal places.',
      'Optional. Enter total previous experience in years, from 0 to 80, with up to two decimal places.',
      'Optional. Enter the employee qualification as plain text.',
    ];
    notes.forEach((note, index) => {
      sheet.getCell(1, index + 1).note = note;
    });
  }

  private populateCareerSheet(sheet: ExcelJS.Worksheet) {
    sheet.columns = [
      { header: CAREER_HEADERS[0], key: 'employeeCode', width: 22 },
      { header: CAREER_HEADERS[1], key: 'year', width: 14 },
      { header: CAREER_HEADERS[2], key: 'grade', width: 18 },
      { header: CAREER_HEADERS[3], key: 'function', width: 28 },
      { header: CAREER_HEADERS[4], key: 'unitOrDepartment', width: 32 },
      { header: CAREER_HEADERS[5], key: 'sequence', width: 14 },
    ];
    sheet.properties.tabColor = { argb: 'FF60A5FA' };
    this.styleHeader(sheet.getRow(1));
    sheet.autoFilter = 'A1:F1';
    sheet.getColumn(2).numFmt = '0';
    sheet.getColumn(6).numFmt = '0';
    for (let index = 1; index <= CAREER_HEADERS.length; index += 1) {
      sheet.getColumn(index).protection = { locked: false };
      sheet.getCell(1, index).protection = { locked: true };
    }
    const notes = [
      'Required for each history row. Select an active Employee Code from the dropdown.',
      'Required. Enter the four-digit year of the past movement.',
      'Optional. Select an active Grade Code. The same Employee Code + Year + Grade combination may appear only once.',
      'Optional. Enter the past function or role. At least one career detail is required.',
      'Optional. Enter the past unit or department. At least one career detail is required.',
      'Optional. Use 1, 2, 3 only for multiple movements in the same year. If blank, worksheet row order is used.',
    ];
    notes.forEach((note, index) => {
      sheet.getCell(1, index + 1).note = note;
    });
  }

  private populateEmployeeReferenceSheet(
    sheet: ExcelJS.Worksheet,
    employees: PmsEmployeeProfileTemplateEmployee[],
  ) {
    sheet.properties.tabColor = { argb: 'FF94A3B8' };
    sheet.columns = [
      { header: EMPLOYEE_REFERENCE_HEADERS[0], key: 'employeeCode', width: 20 },
      { header: EMPLOYEE_REFERENCE_HEADERS[1], key: 'name', width: 30 },
      { header: EMPLOYEE_REFERENCE_HEADERS[2], key: 'designation', width: 28 },
      { header: EMPLOYEE_REFERENCE_HEADERS[3], key: 'department', width: 28 },
      { header: EMPLOYEE_REFERENCE_HEADERS[4], key: 'managerCode', width: 20 },
      { header: EMPLOYEE_REFERENCE_HEADERS[5], key: 'managerName', width: 30 },
      { header: EMPLOYEE_REFERENCE_HEADERS[6], key: 'status', width: 18 },
    ];
    this.styleHeader(sheet.getRow(1));
    for (const employee of employees) {
      sheet.addRow({
        employeeCode: employee.employeeCode,
        name: employee.name,
        designation: employee.designation,
        department: employee.department,
        managerCode: employee.managerCode,
        managerName: employee.managerName,
        status: employee.active ? 'Active' : 'Inactive',
      });
    }
    sheet.autoFilter = `A1:G${Math.max(employees.length + 1, 1)}`;
  }

  private populateGradeReferenceSheet(
    sheet: ExcelJS.Worksheet,
    grades: PmsEmployeeProfileTemplateGrade[],
  ) {
    sheet.properties.tabColor = { argb: 'FF94A3B8' };
    sheet.columns = [
      { header: GRADE_REFERENCE_HEADERS[0], key: 'code', width: 20 },
      { header: GRADE_REFERENCE_HEADERS[1], key: 'label', width: 32 },
      { header: GRADE_REFERENCE_HEADERS[2], key: 'displayOrder', width: 18 },
    ];
    this.styleHeader(sheet.getRow(1));
    for (const grade of grades) {
      sheet.addRow({
        code: grade.code,
        label: grade.label,
        displayOrder: grade.displayOrder,
      });
    }
    sheet.autoFilter = `A1:C${Math.max(grades.length + 1, 1)}`;
  }

  private styleHeader(row: ExcelJS.Row) {
    row.height = 26;
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF155E75' },
    };
    row.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    row.border = {
      bottom: { style: 'medium', color: { argb: 'FF0E7490' } },
    };
  }

  private validateHeaders(
    sheet: ExcelJS.Worksheet,
    expected: readonly string[],
    issues: PmsEmployeeProfileValidationIssue[],
  ) {
    const actual = expected.map((_, index) => this.cellText(sheet.getRow(1).getCell(index + 1)));
    expected.forEach((header, index) => {
      if (actual[index] !== header) {
        issues.push(
          this.issue(
            'ERROR',
            sheet.name,
            'HEADER_MISMATCH',
            `Column ${index + 1} must be "${header}", but found "${actual[index] || '(blank)'}".`,
            1,
            undefined,
            header,
          ),
        );
      }
    });
  }

  private findSingleSheetProgressionSource(workbook: ExcelJS.Workbook):
    | {
        sheet: ExcelJS.Worksheet;
        headerRowNumber: number;
        columns: {
          employeeCode: number;
          employeeName: number;
          year: number;
          progression: number;
          promotedAs: number;
        };
      }
    | undefined {
    for (const sheet of workbook.worksheets) {
      const lastHeaderRow = Math.min(10, sheet.actualRowCount);
      for (let rowNumber = 1; rowNumber <= lastHeaderRow; rowNumber += 1) {
        const headerColumns = new Map<string, number>();
        const row = sheet.getRow(rowNumber);
        for (
          let columnNumber = 1;
          columnNumber <= Math.max(5, sheet.actualColumnCount);
          columnNumber += 1
        ) {
          const header = this.normalizeHeader(
            this.cellText(row.getCell(columnNumber)),
          );
          if (header) headerColumns.set(header, columnNumber);
        }

        const resolveColumn = (
          aliases: readonly string[],
        ): number | undefined =>
          aliases
            .map((alias) => headerColumns.get(this.normalizeHeader(alias)))
            .find((column): column is number => column !== undefined);

        const columns = {
          employeeCode: resolveColumn(
            SINGLE_SHEET_HEADER_ALIASES.employeeCode,
          ),
          employeeName: resolveColumn(
            SINGLE_SHEET_HEADER_ALIASES.employeeName,
          ),
          year: resolveColumn(SINGLE_SHEET_HEADER_ALIASES.year),
          progression: resolveColumn(
            SINGLE_SHEET_HEADER_ALIASES.progression,
          ),
          promotedAs: resolveColumn(
            SINGLE_SHEET_HEADER_ALIASES.promotedAs,
          ),
        };
        if (Object.values(columns).every((column) => column !== undefined)) {
          return {
            sheet,
            headerRowNumber: rowNumber,
            columns: columns as {
              employeeCode: number;
              employeeName: number;
              year: number;
              progression: number;
              promotedAs: number;
            },
          };
        }
      }
    }
    return undefined;
  }

  private validateSingleSheetProgressionSource(
    source: {
      sheet: ExcelJS.Worksheet;
      headerRowNumber: number;
      columns: {
        employeeCode: number;
        employeeName: number;
        year: number;
        progression: number;
        promotedAs: number;
      };
    },
    referenceData: PmsEmployeeProfileReferenceData,
  ): PmsEmployeeProfileWorkbookValidation {
    type SourceMovement = {
      rowNumber: number;
      year: number;
      effectiveDate: Date;
      progression?: string;
      promotedAs?: string;
    };
    type EmployeeGroup = {
      employeeCode: string;
      firstRowNumber: number;
      employee?: PmsEmployeeProfileTemplateEmployee;
      movements: SourceMovement[];
      issues: PmsEmployeeProfileValidationIssue[];
    };

    const issues: PmsEmployeeProfileValidationIssue[] = [];
    const employeeMap = new Map(
      referenceData.employees.map((employee) => [
        this.normalizeKey(employee.employeeCode),
        employee,
      ]),
    );
    const groups = new Map<string, EmployeeGroup>();
    let currentEmployeeCode = '';
    let sourceMovementCount = 0;
    const asOfDate = this.currentServerDate();

    for (
      let rowNumber = source.headerRowNumber + 1;
      rowNumber <= source.sheet.actualRowCount;
      rowNumber += 1
    ) {
      const row = source.sheet.getRow(rowNumber);
      const enteredEmployeeCode = this.cellText(
        row.getCell(source.columns.employeeCode),
      );
      const enteredEmployeeName = this.cellText(
        row.getCell(source.columns.employeeName),
      );
      const yearText = this.cellText(row.getCell(source.columns.year));
      const progression = this.cellText(
        row.getCell(source.columns.progression),
      );
      const promotedAs = this.cellText(row.getCell(source.columns.promotedAs));
      if (enteredEmployeeCode) currentEmployeeCode = enteredEmployeeCode;
      if (!yearText && !progression && !promotedAs) {
        continue;
      }
      if (yearText && !progression && !promotedAs) {
        continue;
      }
      if (!currentEmployeeCode) {
        issues.push(
          this.issue(
            'ERROR',
            source.sheet.name,
            'EMPLOYEE_CODE_CONTEXT_REQUIRED',
            'Employee Code is required on the first row of each employee block.',
            rowNumber,
            undefined,
            'Emp Code',
          ),
        );
        continue;
      }

      const normalizedCode = this.normalizeKey(currentEmployeeCode);
      let group = groups.get(normalizedCode);
      if (!group) {
        const employee = employeeMap.get(normalizedCode);
        group = {
          employeeCode: employee?.employeeCode || currentEmployeeCode,
          firstRowNumber: rowNumber,
          employee,
          movements: [],
          issues: [],
        };
        groups.set(normalizedCode, group);
        if (!employee) {
          group.issues.push(
            this.issue(
              'ERROR',
              source.sheet.name,
              'EMPLOYEE_NOT_FOUND',
              `Employee Code "${currentEmployeeCode}" was not found in the current employee master.`,
              rowNumber,
              currentEmployeeCode,
              'Emp Code',
            ),
          );
        } else if (!employee.active) {
          group.issues.push(
            this.issue(
              'ERROR',
              source.sheet.name,
              'EMPLOYEE_INACTIVE',
              'The employee is inactive and cannot be imported.',
              rowNumber,
              employee.employeeCode,
              'Emp Code',
            ),
          );
        }
      }
      if (
        enteredEmployeeName &&
        group.employee &&
        this.normalizeKey(enteredEmployeeName) !==
          this.normalizeKey(group.employee.name)
      ) {
        group.issues.push(
          this.issue(
            'WARNING',
            source.sheet.name,
            'EMPLOYEE_NAME_IGNORED',
            `Emp Name "${enteredEmployeeName}" does not match the employee master name "${group.employee.name}". Employee Code ${group.employeeCode} will be used.`,
            rowNumber,
            group.employeeCode,
            'Emp Name',
          ),
        );
      }

      const parsedPeriod = this.parseProgressionPeriod(
        row.getCell(source.columns.year),
      );
      if (!parsedPeriod) {
        group.issues.push(
          this.issue(
            'ERROR',
            source.sheet.name,
            'PROGRESSION_PERIOD_INVALID',
            'Year must use a supported month-year value such as Apr-25.',
            rowNumber,
            group.employeeCode,
            'Year',
          ),
        );
      } else if (parsedPeriod.effectiveDate.getTime() > asOfDate.getTime()) {
        group.issues.push(
          this.issue(
            'ERROR',
            source.sheet.name,
            'PROGRESSION_PERIOD_IN_FUTURE',
            'Career progression month cannot be later than today.',
            rowNumber,
            group.employeeCode,
            'Year',
          ),
        );
      }
      if (progression.length > 150) {
        group.issues.push(
          this.issue(
            'ERROR',
            source.sheet.name,
            'PROGRESSION_TOO_LONG',
            'Progression cannot exceed 150 characters.',
            rowNumber,
            group.employeeCode,
            'Progression',
          ),
        );
      }
      if (promotedAs.length > 100) {
        group.issues.push(
          this.issue(
            'ERROR',
            source.sheet.name,
            'PROMOTED_AS_TOO_LONG',
            'Promoted as cannot exceed 100 characters.',
            rowNumber,
            group.employeeCode,
            'Promoted as',
          ),
        );
      }

      sourceMovementCount += 1;
      if (parsedPeriod && (progression || promotedAs)) {
        group.movements.push({
          rowNumber,
          year: parsedPeriod.year,
          effectiveDate: parsedPeriod.effectiveDate,
          progression: progression || undefined,
          promotedAs: promotedAs || undefined,
        });
      }
    }

    const profiles: ParsedEmployeeProfileRow[] = [];
    for (const group of groups.values()) {
      const movements = group.movements
        .slice()
        .sort(
          (left, right) =>
            left.effectiveDate.getTime() - right.effectiveDate.getTime() ||
            left.rowNumber - right.rowNumber,
        );
      const movementKeys = new Set<string>();
      for (const movement of movements) {
        const key = this.careerHistoryKey({
          year: movement.year,
          grade: movement.promotedAs,
          progression: movement.progression,
        });
        if (movementKeys.has(key)) {
          group.issues.push(
            this.issue(
              'ERROR',
              source.sheet.name,
              'DUPLICATE_CAREER_MOVEMENT',
              `Year ${movement.year}, Promoted as ${movement.promotedAs || '(blank)'}, and Progression ${movement.progression || '(blank)'} are repeated for ${group.employeeCode}.`,
              movement.rowNumber,
              group.employeeCode,
              'Progression',
            ),
          );
        } else {
          movementKeys.add(key);
        }
      }
      const currentMovement = movements
        .slice()
        .reverse()
        .find((movement) => Boolean(movement.promotedAs));
      if (!currentMovement) {
        group.issues.push(
          this.issue(
            'ERROR',
            source.sheet.name,
            'CURRENT_GRADE_NOT_DERIVABLE',
            'At least one Promoted as value is required to derive the current promoted title / designation.',
            group.firstRowNumber,
            group.employeeCode,
            'Promoted as',
          ),
        );
      }

      const careerProgressionPast = movements
        .filter((movement) => movement !== currentMovement)
        .map(
          (movement, index): ParsedCareerProgressionRow => ({
            rowNumber: movement.rowNumber,
            employeeCode: group.employeeCode,
            year: movement.year,
            grade: movement.promotedAs,
            progression: movement.progression,
            sequence: index + 1,
          }),
        );
      const profileErrors = group.issues.filter(
        (issue) => issue.severity === 'ERROR',
      );
      const profileWarnings = group.issues.filter(
        (issue) => issue.severity === 'WARNING',
      );
      issues.push(...group.issues);
      profiles.push({
        rowNumber: group.firstRowNumber,
        employeeId: group.employee?.employeeId,
        employeeCode: group.employeeCode,
        employeeName: group.employee?.name,
        designation: group.employee?.designation,
        department: group.employee?.department,
        managerCode: group.employee?.managerCode,
        managerName: group.employee?.managerName,
        employeeActive: group.employee?.active,
        currentGrade: currentMovement?.promotedAs || '',
        gradeEffectiveDate: currentMovement?.effectiveDate,
        asOfDate,
        careerProgressionPast,
        valid: profileErrors.length === 0,
        errors: profileErrors.map((issue) => issue.message),
        warnings: profileWarnings.map((issue) => issue.message),
      });
    }

    if (profiles.length === 0) {
      issues.push(
        this.issue(
          'ERROR',
          source.sheet.name,
          'NO_PROGRESSION_ROWS',
          'The workbook does not contain any employee progression rows.',
        ),
      );
    }

    const invalidCount = profiles.filter((profile) => !profile.valid).length;
    const validCount = profiles.length - invalidCount;
    const errorCount = issues.filter((issue) => issue.severity === 'ERROR').length;
    const warningCount = issues.filter(
      (issue) => issue.severity === 'WARNING',
    ).length;
    return {
      templateVersion: SINGLE_SHEET_TEMPLATE_VERSION,
      profileRowCount: profiles.length,
      careerRowCount: sourceMovementCount,
      validCount,
      invalidCount,
      warningCount,
      canImport: errorCount === 0 && validCount > 0,
      issues,
      profiles,
    };
  }

  private normalizeHeader(value: string): string {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  }

  private parseProgressionPeriod(
    cell: ExcelJS.Cell,
  ): { year: number; effectiveDate: Date } | undefined {
    if (cell.value instanceof Date && !Number.isNaN(cell.value.getTime())) {
      const year = cell.value.getUTCFullYear();
      return {
        year,
        effectiveDate: new Date(
          Date.UTC(year, cell.value.getUTCMonth(), 1),
        ),
      };
    }
    const text = this.cellText(cell);
    const match = text.match(
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-\s](\d{2}|\d{4})$/i,
    );
    if (!match) return undefined;
    const months = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];
    const month = months.indexOf(match[1].toLocaleLowerCase());
    const rawYear = Number(match[2]);
    const year =
      match[2].length === 2
        ? rawYear >= 80
          ? 1900 + rawYear
          : 2000 + rawYear
        : rawYear;
    if (month < 0 || year < 1900 || year > 2200) return undefined;
    return {
      year,
      effectiveDate: new Date(Date.UTC(year, month, 1)),
    };
  }

  private nonEmptyRows(sheet: ExcelJS.Worksheet, columnCount: number): ExcelJS.Row[] {
    const rows: ExcelJS.Row[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const hasValue = Array.from({ length: columnCount }, (_, index) =>
        this.cellText(row.getCell(index + 1)),
      ).some(Boolean);
      if (hasValue) rows.push(row);
    }
    return rows;
  }

  private rejectFormulas(
    row: ExcelJS.Row,
    headers: readonly string[],
    sheetName: string,
    issues: PmsEmployeeProfileValidationIssue[],
  ) {
    headers.forEach((header, index) => {
      const value = row.getCell(index + 1).value as any;
      if (value && typeof value === 'object' && 'formula' in value) {
        issues.push(
          this.issue(
            'ERROR',
            sheetName,
            'FORMULA_NOT_ALLOWED',
            'Formulas are not allowed in import data cells.',
            row.number,
            this.cellText(row.getCell(1)),
            header,
          ),
        );
      }
    });
  }

  private parseDateCell(
    cell: ExcelJS.Cell,
    sheet: string,
    rowNumber: number,
    employeeCode: string,
    column: string,
    issues: PmsEmployeeProfileValidationIssue[],
    required = false,
  ): Date | undefined {
    const value = cell.value as any;
    if (value === null || value === undefined || this.cellText(cell) === '') {
      if (required) {
        issues.push(
          this.issue(
            'ERROR',
            sheet,
            'DATE_REQUIRED',
            `${column.replace(' *', '')} is required.`,
            rowNumber,
            employeeCode,
            column,
          ),
        );
      }
      return undefined;
    }

    let parsed: Date | undefined;
    if (value instanceof Date) {
      parsed = new Date(value.getTime());
    } else if (typeof value === 'number') {
      const excelEpoch = Date.UTC(1899, 11, 30);
      parsed = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    } else {
      const text = this.cellText(cell);
      const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      const yearFirst = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (dayFirst) {
        parsed = this.safeUtcDate(
          Number(dayFirst[3]),
          Number(dayFirst[2]),
          Number(dayFirst[1]),
        );
      } else if (yearFirst) {
        parsed = this.safeUtcDate(
          Number(yearFirst[1]),
          Number(yearFirst[2]),
          Number(yearFirst[3]),
        );
      }
    }

    if (!parsed || Number.isNaN(parsed.getTime())) {
      issues.push(
        this.issue(
          'ERROR',
          sheet,
          'DATE_INVALID',
          `${column.replace(' *', '')} must use DD/MM/YYYY.`,
          rowNumber,
          employeeCode,
          column,
        ),
      );
      return undefined;
    }
    return parsed;
  }

  private parseOptionalNumber(
    cell: ExcelJS.Cell,
    min: number,
    max: number,
    sheet: string,
    rowNumber: number,
    employeeCode: string,
    column: string,
    issues: PmsEmployeeProfileValidationIssue[],
  ): number | undefined {
    if (!this.cellText(cell)) return undefined;
    const parsed = Number(cell.value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      issues.push(
        this.issue(
          'ERROR',
          sheet,
          'NUMBER_OUT_OF_RANGE',
          `${column} must be a number between ${min} and ${max}.`,
          rowNumber,
          employeeCode,
          column,
        ),
      );
      return undefined;
    }
    return Math.round(parsed * 100) / 100;
  }

  private parseRequiredWholeNumber(
    cell: ExcelJS.Cell,
    min: number,
    max: number,
    sheet: string,
    rowNumber: number,
    employeeCode: string,
    column: string,
    issues: PmsEmployeeProfileValidationIssue[],
  ): number | undefined {
    const parsed = this.parseOptionalWholeNumber(
      cell,
      min,
      max,
      sheet,
      rowNumber,
      employeeCode,
      column,
      issues,
    );
    if (parsed === undefined && !this.cellText(cell)) {
      issues.push(
        this.issue(
          'ERROR',
          sheet,
          'WHOLE_NUMBER_REQUIRED',
          `${column.replace(' *', '')} is required.`,
          rowNumber,
          employeeCode,
          column,
        ),
      );
    }
    return parsed;
  }

  private parseOptionalWholeNumber(
    cell: ExcelJS.Cell,
    min: number,
    max: number,
    sheet: string,
    rowNumber: number,
    employeeCode: string,
    column: string,
    issues: PmsEmployeeProfileValidationIssue[],
  ): number | undefined {
    if (!this.cellText(cell)) return undefined;
    const parsed = Number(cell.value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      issues.push(
        this.issue(
          'ERROR',
          sheet,
          'WHOLE_NUMBER_OUT_OF_RANGE',
          `${column.replace(' *', '')} must be a whole number of at least ${min}.`,
          rowNumber,
          employeeCode,
          column,
        ),
      );
      return undefined;
    }
    return parsed;
  }

  private safeUtcDate(year: number, month: number, day: number): Date | undefined {
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return undefined;
    }
    return parsed;
  }

  private cellText(cell: ExcelJS.Cell): string {
    const value = cell.value as any;
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if (Array.isArray(value.richText)) {
        return value.richText.map((item: any) => item.text ?? '').join('').trim();
      }
      if ('result' in value) return String(value.result ?? '').trim();
      if ('text' in value) return String(value.text ?? '').trim();
    }
    return String(value).trim();
  }

  private issue(
    severity: 'ERROR' | 'WARNING',
    sheet: string,
    code: string,
    message: string,
    rowNumber?: number,
    employeeCode?: string,
    column?: string,
  ): PmsEmployeeProfileValidationIssue {
    return {
      severity,
      sheet,
      rowNumber,
      employeeCode,
      column,
      code,
      message,
    };
  }

  private emptyValidation(
    issues: PmsEmployeeProfileValidationIssue[],
    templateVersion?: string,
  ): PmsEmployeeProfileWorkbookValidation {
    return {
      templateVersion,
      profileRowCount: 0,
      careerRowCount: 0,
      validCount: 0,
      invalidCount: 0,
      warningCount: issues.filter((issue) => issue.severity === 'WARNING').length,
      canImport: false,
      issues,
      profiles: [],
    };
  }

  private validateManualProfileInput(
    input: ManualEmployeeCareerProfileInput,
  ) {
    const reasonForChange = this.cleanText(input.reasonForChange, 500);
    if (reasonForChange.length < 3) {
      throw new Error('Reason for change must contain at least 3 characters');
    }
    const requestedGrade = this.cleanText(input.currentGrade, 100);
    if (!requestedGrade) {
      throw new Error('Current promoted title / designation is required');
    }
    const currentGrade = requestedGrade;
    const asOfDate = this.currentServerDate();
    const gradeEffectiveDate = this.manualDate(
      input.gradeEffectiveDate,
      'Role Effective Date',
      false,
    );
    if (
      gradeEffectiveDate &&
      gradeEffectiveDate.getTime() > asOfDate.getTime()
    ) {
      throw new Error('Role Effective Date cannot be later than today');
    }
    if (
      !gradeEffectiveDate &&
      (input.yearsInGrade === undefined ||
        input.yearsInGrade === null ||
        input.yearsInGrade === ('' as any))
    ) {
      throw new Error(
        'Years in Current Role is required when Role Effective Date is unavailable',
      );
    }
    const yearsInGrade = gradeEffectiveDate
      ? undefined
      : this.manualNumber(input.yearsInGrade, 'Years in Current Role', true);
    const previousExperienceYears = this.manualNumber(
      input.previousExperienceYears,
      'Previous Experience',
      false,
    );
    const qualification =
      this.cleanText(input.qualification, 250) || undefined;
    const careerRows = input.careerProgressionPast ?? [];
    if (!Array.isArray(careerRows) || careerRows.length > 500) {
      throw new Error('Career Progression Past cannot contain more than 500 rows');
    }
    const meaningfulCareerRows = careerRows.filter(
      (row) =>
        Boolean(this.cleanText(row.grade, 100)) ||
        Boolean(this.cleanText(row.progression, 150)) ||
        Boolean(this.cleanText(row.function, 150)) ||
        Boolean(this.cleanText(row.unitOrDepartment, 150)),
    );
    const careerYearGradeKeys = new Set<string>();
    const careerProgressionPast = meaningfulCareerRows.map((row, index) => {
      const rowLabel = `Career row ${index + 1}`;
      const year = Number(row.year);
      if (
        !Number.isInteger(year) ||
        year < 1900 ||
        year > asOfDate.getUTCFullYear()
      ) {
        throw new Error(
          `${rowLabel} Year must be between 1900 and ${asOfDate.getUTCFullYear()}`,
        );
      }
      const sequence = Number(row.sequence);
      if (!Number.isInteger(sequence) || sequence < 1) {
        throw new Error(`${rowLabel} Sequence must be a positive whole number`);
      }
      const gradeInput = this.cleanText(row.grade, 100);
      const grade = gradeInput || undefined;
      const progression =
        this.cleanText(row.progression, 150) || undefined;
      const careerFunction =
        this.cleanText(row.function, 150) || undefined;
      const unitOrDepartment =
        this.cleanText(row.unitOrDepartment, 150) || undefined;
      const yearGradeKey = progression
        ? `${year}:${this.normalizeKey(grade || '') || '<blank>'}:${this.normalizeKey(progression)}`
        : `${year}:${this.normalizeKey(grade || '') || '<blank>'}`;
      if (careerYearGradeKeys.has(yearGradeKey)) {
        throw new Error(
          `${rowLabel} duplicates Year ${year} and Grade ${grade || '(blank)'}. Each Year + Grade combination can appear only once for an employee`,
        );
      }
      careerYearGradeKeys.add(yearGradeKey);
      return {
        year,
        grade,
        progression,
        function: careerFunction,
        unitOrDepartment,
        sequence: index + 1,
      };
    });

    return {
      reasonForChange,
      currentGrade,
      gradeEffectiveDate,
      yearsInGrade,
      previousExperienceYears,
      qualification,
      asOfDate,
      careerProgressionPast,
    };
  }

  private currentServerDate(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
  }

  private manualDate(
    value: string | Date | undefined,
    label: string,
    required: boolean,
  ): Date | undefined {
    if (value === undefined || value === null || value === '') {
      if (required) throw new Error(`${label} is required`);
      return undefined;
    }
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new Error(`${label} is invalid`);
      return new Date(
        Date.UTC(
          value.getUTCFullYear(),
          value.getUTCMonth(),
          value.getUTCDate(),
        ),
      );
    }
    const text = String(value).trim();
    const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dayFirst = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
    const parsed = dateOnly
      ? this.safeUtcDate(
          Number(dateOnly[1]),
          Number(dateOnly[2]),
          Number(dateOnly[3]),
        )
      : dayFirst
        ? this.safeUtcDate(
            Number(dayFirst[3]),
            Number(dayFirst[2]),
            Number(dayFirst[1]),
          )
        : undefined;
    if (!parsed) {
      throw new Error(`${label} must use YYYY-MM-DD or DD/MM/YYYY`);
    }
    return parsed;
  }

  private manualNumber(
    value: number | undefined,
    label: string,
    required: boolean,
  ): number | undefined {
    if (value === undefined || value === null || value === ('' as any)) {
      if (required) throw new Error(`${label} is required`);
      return undefined;
    }
    const parsed = Number(value);
    if (
      !Number.isFinite(parsed) ||
      parsed < 0 ||
      parsed > 80 ||
      Math.round(parsed * 100) !== parsed * 100
    ) {
      throw new Error(
        `${label} must be between 0 and 80 with up to two decimal places`,
      );
    }
    return parsed;
  }

  private profileAuditSnapshot(profile: Record<string, any>) {
    return {
      currentGrade: profile.currentGrade,
      gradeEffectiveDate: profile.gradeEffectiveDate,
      yearsInGrade: profile.yearsInGrade,
      previousExperienceYears: profile.previousExperienceYears,
      qualification: profile.qualification,
      asOfDate: profile.asOfDate,
      careerProgressionPast: (profile.careerProgressionPast ?? []).map(
        (entry: any) => ({
          year: entry.year,
          grade: entry.grade,
          progression: entry.progression,
          function: entry.function,
          unitOrDepartment: entry.unitOrDepartment,
          sequence: entry.sequence,
        }),
      ),
      profileVersion: profile.profileVersion,
      lastUpdatedSource: profile.lastUpdatedSource,
    };
  }

  private async mergeExistingCareerHistoryForImport(
    validation: PmsEmployeeProfileWorkbookValidation,
  ): Promise<void> {
    for (const profile of validation.profiles) {
      profile.submittedCareerProgressionPast =
        profile.careerProgressionPast.map((entry) => ({ ...entry }));
      profile.sourceProfileVersion = 0;
    }

    const employeeIds = validation.profiles
      .map((profile) => profile.employeeId)
      .filter(
        (employeeId): employeeId is string =>
          typeof employeeId === 'string' &&
          Types.ObjectId.isValid(employeeId),
      )
      .map((employeeId) => new Types.ObjectId(employeeId));
    if (employeeIds.length === 0) return;

    const existingProfiles = await PmsEmployeeCareerProfile.find({
      employeeId: { $in: employeeIds },
    })
      .select('employeeId profileVersion careerProgressionPast')
      .lean();
    const existingByEmployeeId = new Map(
      existingProfiles.map((profile) => [
        profile.employeeId.toString(),
        profile,
      ]),
    );

    for (const profile of validation.profiles) {
      if (!profile.employeeId) continue;
      const existing = existingByEmployeeId.get(profile.employeeId);
      if (!existing) continue;

      profile.sourceProfileVersion = existing.profileVersion;
      const merged: ParsedCareerProgressionRow[] = (
        existing.careerProgressionPast ?? []
      ).map((entry) => ({
        rowNumber: profile.rowNumber,
        employeeCode: profile.employeeCode,
        year: entry.year,
        grade: entry.grade,
        progression: entry.progression,
        function: entry.function,
        unitOrDepartment: entry.unitOrDepartment,
        sequence: entry.sequence,
      }));
      const existingByKey = new Map(
        merged.map((entry) => [this.careerHistoryKey(entry), entry]),
      );

      for (const incoming of profile.submittedCareerProgressionPast ?? []) {
        const key = this.careerHistoryKey(incoming);
        const stored = existingByKey.get(key);
        if (!stored) {
          const appended = { ...incoming };
          merged.push(appended);
          existingByKey.set(key, appended);
          continue;
        }

        if (this.careerHistoryDetailsEqual(stored, incoming)) {
          const warning = this.issue(
            'WARNING',
            PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION,
            'CAREER_HISTORY_ALREADY_EXISTS',
            `Year ${incoming.year}, Grade ${incoming.grade || '(blank)'}, and Progression ${incoming.progression || '(blank)'} already exist for ${profile.employeeCode}; the stored history row will be kept unchanged.`,
            incoming.rowNumber,
            profile.employeeCode,
            CAREER_HEADERS[2],
          );
          validation.issues.push(warning);
          profile.warnings.push(
            `Career row ${incoming.rowNumber}: ${warning.message}`,
          );
          continue;
        }

        const conflict = this.issue(
          'ERROR',
          PmsEmployeeProfileWorkbookSheet.CAREER_PROGRESSION,
          'CAREER_HISTORY_CONFLICT',
          `Year ${incoming.year}, Grade ${incoming.grade || '(blank)'}, and Progression ${incoming.progression || '(blank)'} already exist for ${profile.employeeCode} with different details. Correct the stored history from the Admin profile page, or remove this conflicting workbook row.`,
          incoming.rowNumber,
          profile.employeeCode,
          CAREER_HEADERS[2],
        );
        validation.issues.push(conflict);
        profile.valid = false;
        profile.errors.push(
          `Career row ${incoming.rowNumber}: ${conflict.message}`,
        );
      }

      profile.careerProgressionPast = merged.sort(
        (left, right) =>
          left.year - right.year ||
          left.sequence - right.sequence ||
          this.normalizeKey(left.grade).localeCompare(
            this.normalizeKey(right.grade),
          ),
      );
    }

    validation.validCount = validation.profiles.filter(
      (profile) => profile.valid,
    ).length;
    validation.invalidCount = validation.profiles.length - validation.validCount;
    validation.warningCount = validation.issues.filter(
      (issue) => issue.severity === 'WARNING',
    ).length;
    validation.canImport =
      validation.validCount > 0 &&
      !validation.issues.some((issue) => issue.severity === 'ERROR');
  }

  private careerHistoryKey(entry: {
    year: number;
    grade?: string;
    progression?: string;
  }): string {
    const base = `${Number(entry.year)}:${this.normalizeKey(entry.grade) || '<blank>'}`;
    return entry.progression
      ? `${base}:${this.normalizeKey(entry.progression)}`
      : base;
  }

  private careerHistoryDetailsEqual(
    left: {
      progression?: string;
      function?: string;
      unitOrDepartment?: string;
    },
    right: {
      progression?: string;
      function?: string;
      unitOrDepartment?: string;
    },
  ): boolean {
    return (
      this.normalizeKey(left.progression) ===
        this.normalizeKey(right.progression) &&
      this.normalizeKey(left.function) === this.normalizeKey(right.function) &&
      this.normalizeKey(left.unitOrDepartment) ===
        this.normalizeKey(right.unitOrDepartment)
    );
  }

  private normalizedProfileValues(row: {
    currentGrade: string;
    gradeEffectiveDate?: Date;
    yearsInGrade?: number;
    previousExperienceYears?: number;
    qualification?: string;
    asOfDate: Date;
    careerProgressionPast: Array<{
      year: number;
      grade?: string;
      progression?: string;
      function?: string;
      unitOrDepartment?: string;
      sequence: number;
    }>;
  }) {
    return {
      currentGrade: row.currentGrade,
      gradeEffectiveDate: row.gradeEffectiveDate,
      yearsInGrade: row.yearsInGrade,
      previousExperienceYears: row.previousExperienceYears,
      qualification: row.qualification,
      asOfDate: row.asOfDate,
      careerProgressionPast: row.careerProgressionPast.map((entry) => ({
        year: entry.year,
        grade: entry.grade,
        progression: entry.progression,
        function: entry.function,
        unitOrDepartment: entry.unitOrDepartment,
        sequence: entry.sequence,
      })),
    };
  }

  private profileValuesEqual(
    existing: {
      currentGrade: string;
      gradeEffectiveDate?: Date;
      yearsInGrade?: number;
      previousExperienceYears?: number;
      qualification?: string;
      asOfDate: Date;
      careerProgressionPast: Array<{
        year: number;
        grade?: string;
        progression?: string;
        function?: string;
        unitOrDepartment?: string;
        sequence: number;
      }>;
    },
    incoming: ReturnType<PmsEmployeeProfileImportService['normalizedProfileValues']>,
  ) {
    const normalizeDate = (value?: Date) =>
      value ? new Date(value).toISOString() : null;
    const normalizeOptionalText = (value?: string) => value?.trim() || null;
    const normalizeOptionalNumber = (value?: number) =>
      value === undefined || value === null ? null : Number(value);
    const normalizeCareer = (
      entries: Array<{
        year: number;
        grade?: string;
        progression?: string;
        function?: string;
        unitOrDepartment?: string;
        sequence: number;
      }>,
    ) =>
      entries.map((entry) => ({
        year: Number(entry.year),
        grade: normalizeOptionalText(entry.grade),
        progression: normalizeOptionalText(entry.progression),
        function: normalizeOptionalText(entry.function),
        unitOrDepartment: normalizeOptionalText(entry.unitOrDepartment),
        sequence: Number(entry.sequence),
      }));

    return (
      this.normalizeKey(existing.currentGrade) ===
        this.normalizeKey(incoming.currentGrade) &&
      normalizeDate(existing.gradeEffectiveDate) ===
        normalizeDate(incoming.gradeEffectiveDate) &&
      normalizeOptionalNumber(existing.yearsInGrade) ===
        normalizeOptionalNumber(incoming.yearsInGrade) &&
      normalizeOptionalNumber(existing.previousExperienceYears) ===
        normalizeOptionalNumber(incoming.previousExperienceYears) &&
      normalizeOptionalText(existing.qualification) ===
        normalizeOptionalText(incoming.qualification) &&
      normalizeDate(existing.asOfDate) === normalizeDate(incoming.asOfDate) &&
      JSON.stringify(normalizeCareer(existing.careerProgressionPast ?? [])) ===
        JSON.stringify(normalizeCareer(incoming.careerProgressionPast ?? []))
    );
  }

  private cleanText(value: unknown, maxLength: number): string {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  private normalizeKey(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private yearsBetween(startValue: unknown, endValue: unknown): number | undefined {
    const start = new Date(startValue as string | number | Date);
    const end = new Date(endValue as string | number | Date);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end.getTime() < start.getTime()
    ) {
      return undefined;
    }
    const years = (end.getTime() - start.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
    return Number(years.toFixed(1));
  }

  private isEmployeeProfileAdministrator(role: unknown) {
    const rawRole = String(role ?? '').trim().replace(/[ /-]/g, '_').toUpperCase();
    return (
      normalizePmsRole(rawRole) === PmsRole.ADMIN ||
      ['HR', 'HR_ADMIN', 'HRADMIN'].includes(rawRole)
    );
  }

  private assertAdminActor() {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }
    if (!this.isEmployeeProfileAdministrator(user.role)) {
      throw new Error('Access denied. Administrative role is required for employee profile imports.');
    }
    const actorId = user._id.toString();
    if (!Types.ObjectId.isValid(actorId)) {
      throw new Error('Authenticated user id is invalid');
    }
    return { actorId };
  }

  private async assertCareerProfileViewAccess(employeeId: string) {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const actorId = user._id.toString();
    if (!Types.ObjectId.isValid(actorId)) {
      throw new Error('Authenticated user id is invalid');
    }

    const role = normalizePmsRole(user.role);
    const hasGlobalManagementAccess =
      this.isEmployeeProfileAdministrator(user.role) ||
      role === PmsRole.MANAGEMENT ||
      user.scope === 'EXECUTIVE' ||
      user.scope === 'ALL';
    if (hasGlobalManagementAccess) {
      return;
    }

    if (role === PmsRole.MANAGER || role === PmsRole.DIRECTOR) {
      const subordinateIds = await getSubordinateUserIds(actorId);
      if (subordinateIds.some((id) => id.toString() === employeeId)) {
        return;
      }
    }

    throw new Error(
      'Access denied. Employee is not in your reporting hierarchy.',
    );
  }
}
