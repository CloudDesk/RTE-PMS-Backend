import mongoose, { Types } from 'mongoose';
import { Binary } from 'mongodb';
import { PmsEmployeeProfileImportFile } from '../../src/models/pms-employee-profile-import-file.model';
import { PmsEmployeeProfileImport } from '../../src/models/pms-employee-profile-import.model';
import { PmsEmployeeProfileImportRow } from '../../src/models/pms-employee-profile-import-row.model';
import {
  PmsEmployeeProfileImportService,
  type PmsEmployeeProfileImportOperation,
} from '../../src/services/pmsEmployeeProfileImport.service';
import type { RequestContext } from '../../src/types/context';

const adminId = new Types.ObjectId();

function context(): RequestContext {
  return {
    requestId: 'async-import-test',
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

function operation(
  importReference: string,
  status: PmsEmployeeProfileImportOperation['status'] = 'QUEUED',
): PmsEmployeeProfileImportOperation {
  return {
    importReference,
    status,
    processingStage: 'VALIDATION',
    progress: {
      processedRows: 0,
      totalRows: 0,
      percent: 0,
      message: 'Validation queued',
    },
    preview: { page: 1, limit: 100, total: 0, totalPages: 1 },
  };
}

describe('PMS employee profile in-process background import', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores the workbook and audit in Mongo, schedules validation, and returns immediately', async () => {
    const service = new PmsEmployeeProfileImportService(context());
    const withTransaction = jest.fn(async (callback) => callback());
    const endSession = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction,
      endSession,
    } as any);
    const create = jest
      .spyOn(PmsEmployeeProfileImport, 'create')
      .mockResolvedValue({} as any);
    const createFile = jest
      .spyOn(PmsEmployeeProfileImportFile, 'create')
      .mockResolvedValue({} as any);
    const schedule = jest
      .spyOn(service as any, 'scheduleBackgroundValidation')
      .mockImplementation(() => undefined);
    jest
      .spyOn(service, 'getImportOperation')
      .mockImplementation(async (reference) => operation(reference));

    const result = await service.queueImportWorkbook({
      buffer: Buffer.from('xlsx-content'),
      originalFileName: 'profiles.xlsx',
    });

    expect(result.status).toBe('QUEUED');
    expect(create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          status: 'QUEUED',
          processingStage: 'VALIDATION',
          uploadedBy: adminId,
        }),
      ],
      expect.objectContaining({ session: expect.anything() }),
    );
    expect(createFile).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          importId: expect.any(Types.ObjectId),
          workbook: Buffer.from('xlsx-content'),
          expiresAt: expect.any(Date),
        }),
      ],
      expect.objectContaining({ session: expect.anything() }),
    );
    expect(schedule).toHaveBeenCalledWith(result.importReference);
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it('claims a queued validation once, stages normalized rows, and removes the temporary workbook', async () => {
    const service = new PmsEmployeeProfileImportService(context());
    const importId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    jest.spyOn(PmsEmployeeProfileImport, 'findOneAndUpdate').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: importId,
        status: 'VALIDATING',
        fileChecksum: 'checksum',
      }),
    } as any);
    jest.spyOn(PmsEmployeeProfileImportFile, 'findOne').mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          workbook: new Binary(Buffer.from('xlsx-content')),
        }),
      }),
    } as any);
    jest.spyOn(service as any, 'loadReferenceData').mockResolvedValue({
      employees: [],
      grades: [],
    });
    const validateWorkbook = jest
      .spyOn(service, 'validateWorkbookBuffer')
      .mockResolvedValue({
        templateVersion: 'v1.1',
        profileRowCount: 1,
        careerRowCount: 0,
        validCount: 1,
        invalidCount: 0,
        warningCount: 0,
        canImport: true,
        issues: [],
        profiles: [
          {
            rowNumber: 2,
            employeeId: employeeId.toString(),
            employeeCode: 'RTE0001',
            employeeName: 'Employee One',
            currentGrade: 'G4',
            yearsInGrade: 2,
            asOfDate: new Date('2026-07-24T00:00:00.000Z'),
            careerProgressionPast: [],
            valid: true,
            errors: [],
            warnings: [],
          },
        ],
      });
    jest
      .spyOn(service as any, 'mergeExistingCareerHistoryForImport')
      .mockResolvedValue(undefined);
    jest.spyOn(PmsEmployeeProfileImport, 'findOne').mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      }),
    } as any);
    jest
      .spyOn(PmsEmployeeProfileImportRow, 'deleteMany')
      .mockResolvedValue({ deletedCount: 0 } as any);
    const insertMany = jest
      .spyOn(PmsEmployeeProfileImportRow, 'insertMany')
      .mockResolvedValue([] as any);
    const update = jest
      .spyOn(PmsEmployeeProfileImport, 'updateOne')
      .mockResolvedValue({ modifiedCount: 1 } as any);
    const removeFile = jest
      .spyOn(PmsEmployeeProfileImportFile, 'deleteOne')
      .mockResolvedValue({ deletedCount: 1 } as any);
    jest
      .spyOn(service, 'getImportOperation')
      .mockResolvedValue(operation(importId.toString(), 'VALIDATED'));

    const result = await service.processQueuedValidation(importId.toString());

    expect(result.status).toBe('VALIDATED');
    expect(validateWorkbook).toHaveBeenCalledWith(
      Buffer.from('xlsx-content'),
      { employees: [], grades: [] },
    );
    expect(insertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          importId,
          employeeId,
          employeeCode: 'RTE0001',
          employeeName: 'Employee One',
        }),
      ],
      { ordered: true },
    );
    expect(update).toHaveBeenCalledWith(
      { _id: importId, status: 'VALIDATING' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'VALIDATED',
          counts: expect.objectContaining({ validProfiles: 1 }),
        }),
      }),
    );
    expect(removeFile).toHaveBeenCalledWith({ importId });
  });
});
