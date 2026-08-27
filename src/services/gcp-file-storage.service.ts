import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { MultipartFile } from '@fastify/multipart';
import { saveMultipartFile } from '../utilis/parseMultiPartForm';
import { uploadFileToPmsStorage } from '../utilis/pmsStorage';

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

export class PmsFileStorageService {
  async uploadMultipartFile(params: UploadMultipartParams): Promise<StoredFileUpload> {
    const { type, employeeId, file, public: makePublic = true } = params;

    if (!file?.filename) {
      throw new Error('No file uploaded');
    }

    const safeName = path.basename(file.filename).replace(/[^\w.\-() ]+/g, '_');
    const storedFileName = `${Date.now()}-${randomUUID()}-${safeName}`;
    const tempPath = path.join(os.tmpdir(), storedFileName);

    try {
      await saveMultipartFile(file as any, tempPath);
      const fileStats = await fs.stat(tempPath);
      const uploadResult = await uploadFileToPmsStorage({
        filePath: tempPath,
        fileName: storedFileName,
        employeeId,
        type,
        contentType: file.mimetype || undefined,
        public: makePublic,
      });

      if (!uploadResult.success || !uploadResult.fileUrl) {
        throw new Error(uploadResult.error || 'Failed to upload PMS file');
      }

      return {
        fileName: safeName,
        fileUrl: uploadResult.fileUrl,
        fileType: file.mimetype || undefined,
        fileSize: fileStats.size,
        documentId: randomUUID(),
        uploadedAt: new Date().toISOString(),
      };
    } finally {
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }
}

export const pmsFileStorageService = new PmsFileStorageService();

// Backward-compatible exports for callers outside the PMS service tree.
export { PmsFileStorageService as GcpFileStorageService };
export const gcpFileStorageService = pmsFileStorageService;
