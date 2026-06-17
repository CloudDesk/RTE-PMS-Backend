import { randomUUID } from 'crypto';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import { MultipartFile } from '@fastify/multipart';
import { Types } from 'mongoose';
import { PmsDocument } from '../models/pms-document.model';
import { User } from '../models/user.model';
import { RequestContext } from '../types/context';
import { saveMultipartFile } from '../utilis/parseMultiPartForm';
import { uploadFileToGCP } from '../utilis/gcpStorage';
import { BaseService } from './base.service';

export interface UploadPmsDocumentInput {
  employeeId: string;
  documentType?: string;
  documentName: string;
  documentDate: Date;
  description?: string;
  cycleId?: string;
  annualAssignmentId?: string;
  quarterAssignmentId?: string;
  file: MultipartFile;
}

export class PmsDocumentService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async uploadDocument(input: UploadPmsDocumentInput) {
    const employee = await User.findById(input.employeeId).select('name').lean();
    if (!employee) {
      throw new Error('Employee not found');
    }

    const safeOriginalName = path.basename(input.file.filename).replace(/[^\w.\-() ]+/g, '_');
    const storedFileName = `${Date.now()}-${randomUUID()}-${safeOriginalName}`;
    const tempPath = path.join(os.tmpdir(), storedFileName);

    await saveMultipartFile(input.file as any, tempPath);

    try {
      const uploadResult = await uploadFileToGCP({
        filePath: tempPath,
        fileName: storedFileName,
        employeeId: input.employeeId,
        category: 'PMS',
        type: 'AdminUpload',
        public: true,
      });

      if (!uploadResult.success || !uploadResult.fileUrl) {
        throw new Error(uploadResult.error || 'Failed to upload file to GCP');
      }

      const uploadedBy = this.context.user?._id && Types.ObjectId.isValid(this.context.user._id)
        ? new Types.ObjectId(this.context.user._id)
        : undefined;

      const documentType = input.documentType || 'Other';
      const document = await PmsDocument.create({
        employeeId: new Types.ObjectId(input.employeeId),
        cycleId: input.cycleId && Types.ObjectId.isValid(input.cycleId)
          ? new Types.ObjectId(input.cycleId)
          : undefined,
        annualAssignmentId: input.annualAssignmentId && Types.ObjectId.isValid(input.annualAssignmentId)
          ? new Types.ObjectId(input.annualAssignmentId)
          : undefined,
        quarterAssignmentId: input.quarterAssignmentId && Types.ObjectId.isValid(input.quarterAssignmentId)
          ? new Types.ObjectId(input.quarterAssignmentId)
          : undefined,
        documentType,
        documentName: input.documentName,
        documentDate: input.documentDate,
        description: input.description,
        fileName: safeOriginalName,
        fileUrl: uploadResult.fileUrl,
        fileType: input.file.mimetype || undefined,
        fileSize: (await fsPromises.stat(tempPath)).size,
        uploadedBy,
        uploadedAt: new Date(),
      });

      return {
        documentId: document._id,
        documentName: input.documentName,
        fileName: safeOriginalName,
        fileUrl: document.fileUrl,
        employeeName: employee.name,
        documentType,
        documentDate: input.documentDate,
        uploadedAt: document.uploadedAt,
      };
    } finally {
      await fsPromises.unlink(tempPath).catch(() => undefined);
    }
  }
}
