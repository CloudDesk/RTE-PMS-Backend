import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { MultipartFile } from '@fastify/multipart';
import { saveMultipartFile } from '../utilis/parseMultiPartForm';
import { uploadFileToGCP } from '../utilis/gcpStorage';

export type StoredFileUpload = {
  fileName: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: number;
  documentId: string;
  uploadedAt: string;
};

type UploadMultipartParams = {
  category: string;
  type: string;
  employeeId: string;
  file: MultipartFile;
  public?: boolean;
};

export class GcpFileStorageService {
  async uploadMultipartFile(params: UploadMultipartParams): Promise<StoredFileUpload> {
    const { category, type, employeeId, file, public: makePublic = true } = params;

    if (!file?.filename) {
      throw new Error('No file uploaded');
    }

    const safeName = path.basename(file.filename).replace(/[^\w.\-() ]+/g, '_');
    const storedFileName = `${Date.now()}-${randomUUID()}-${safeName}`;
    const tempPath = path.join(os.tmpdir(), storedFileName);

    try {
      await saveMultipartFile(file as any, tempPath);
      const fileBuffer = await file.toBuffer();
      const uploadResult = await uploadFileToGCP({
        filePath: tempPath,
        fileName: storedFileName,
        employeeId,
        category,
        type,
        public: makePublic,
      });

      if (!uploadResult.success || !uploadResult.fileUrl) {
        throw new Error(uploadResult.error || 'Failed to upload file to GCP');
      }

      return {
        fileName: safeName,
        fileUrl: uploadResult.fileUrl,
        fileType: file.mimetype || undefined,
        fileSize: fileBuffer.length,
        documentId: randomUUID(),
        uploadedAt: new Date().toISOString(),
      };
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}

export const gcpFileStorageService = new GcpFileStorageService();
