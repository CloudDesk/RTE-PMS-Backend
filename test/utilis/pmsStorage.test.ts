jest.mock('../../src/utilis/gcpStorage', () => ({
  uploadFileToGCP: jest.fn(),
}));
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn(),
}));
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: jest.fn(),
}));

import { BlobServiceClient } from '@azure/storage-blob';
import { uploadFileToGCP } from '../../src/utilis/gcpStorage';
import {
  getPmsStorageProvider,
  isTrustedPmsFileUrl,
  uploadFileToPmsStorage,
} from '../../src/utilis/pmsStorage';

const ENV_KEYS = [
  'PMS_STORAGE_PROVIDER',
  'PMS_GCP_STORAGE_BUCKET',
  'GCP_STORAGE_BUCKET',
  'PMS_AZURE_STORAGE_ACCOUNT',
  'PMS_AZURE_STORAGE_CONTAINER',
  'PMS_AZURE_STORAGE_CONNECTION_STRING',
  'PMS_AZURE_STORAGE_ENDPOINT',
  'PMS_AZURE_MANAGED_IDENTITY_CLIENT_ID',
  'PMS_STORAGE_ALLOWED_HOSTS',
] as const;

describe('PMS storage provider selection', () => {
  const originalEnv = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('defaults safely to GCP', () => {
    expect(getPmsStorageProvider()).toBe('gcp');
  });

  it('rejects an unknown provider instead of silently uploading elsewhere', () => {
    process.env.PMS_STORAGE_PROVIDER = 'unknown';
    expect(() => getPmsStorageProvider()).toThrow(
      'PMS_STORAGE_PROVIDER must be either "gcp" or "azure"',
    );
  });

  it('uses the PMS-specific GCP bucket without changing the shared bucket', async () => {
    process.env.PMS_STORAGE_PROVIDER = 'gcp';
    process.env.PMS_GCP_STORAGE_BUCKET = 'pms-sample';
    process.env.GCP_STORAGE_BUCKET = 'shared-hrms-bucket';
    jest.mocked(uploadFileToGCP).mockResolvedValue({
      success: true,
      fileUrl: 'https://storage.googleapis.com/pms-sample/employee/PMS/file.pdf',
    });

    await uploadFileToPmsStorage({
      filePath: '/tmp/file.pdf',
      fileName: 'file.pdf',
      employeeId: 'employee',
      type: 'AdminUpload',
      contentType: 'application/pdf',
      public: true,
    });

    expect(uploadFileToGCP).toHaveBeenCalledWith(expect.objectContaining({
      bucketName: 'pms-sample',
      category: 'PMS',
    }));
  });

  it('fails before upload when Azure is selected without its required configuration', async () => {
    process.env.PMS_STORAGE_PROVIDER = 'azure';
    await expect(uploadFileToPmsStorage({
      filePath: '/tmp/file.pdf',
      fileName: 'file.pdf',
      employeeId: 'employee',
      type: 'AdminUpload',
    })).rejects.toThrow('PMS_AZURE_STORAGE_ACCOUNT is not configured');
    expect(uploadFileToGCP).not.toHaveBeenCalled();
  });

  it('uploads Azure PMS files to the configured container and preserves the URL contract', async () => {
    process.env.PMS_STORAGE_PROVIDER = 'azure';
    process.env.PMS_AZURE_STORAGE_ACCOUNT = 'rtepmsprod';
    process.env.PMS_AZURE_STORAGE_CONTAINER = 'pms-files';
    const uploadFile = jest.fn().mockResolvedValue(undefined);
    const getBlockBlobClient = jest.fn().mockReturnValue({
      uploadFile,
      url: 'https://rtepmsprod.blob.core.windows.net/pms-files/employee/PMS/file.pdf',
    });
    const getContainerClient = jest.fn().mockReturnValue({ getBlockBlobClient });
    jest.mocked(BlobServiceClient).mockImplementation(() => ({
      getContainerClient,
    }) as never);

    const result = await uploadFileToPmsStorage({
      filePath: '/tmp/file.pdf',
      fileName: 'file.pdf',
      employeeId: 'employee',
      type: 'AdminUpload',
      contentType: 'application/pdf',
    });

    expect(getContainerClient).toHaveBeenCalledWith('pms-files');
    expect(getBlockBlobClient).toHaveBeenCalledWith('employee/PMS/file.pdf');
    expect(uploadFile).toHaveBeenCalledWith('/tmp/file.pdf', {
      blobHTTPHeaders: { blobContentType: 'application/pdf' },
    });
    expect(result).toEqual({
      success: true,
      fileUrl: 'https://rtepmsprod.blob.core.windows.net/pms-files/employee/PMS/file.pdf',
    });
  });

  it('continues to trust historical GCP URLs and configured Azure Blob URLs', () => {
    process.env.PMS_AZURE_STORAGE_ACCOUNT = 'rtepmsprod';
    expect(isTrustedPmsFileUrl(
      'https://storage.googleapis.com/zuno-hr-sit/employee/PMS/file.pdf',
    )).toBe(true);
    expect(isTrustedPmsFileUrl(
      'https://rtepmsprod.blob.core.windows.net/pms-files/employee/PMS/file.pdf',
    )).toBe(true);
  });

  it('rejects non-HTTPS and unconfigured storage hosts', () => {
    process.env.PMS_AZURE_STORAGE_ACCOUNT = 'rtepmsprod';
    expect(isTrustedPmsFileUrl(
      'http://storage.googleapis.com/pms-sample/file.pdf',
    )).toBe(false);
    expect(isTrustedPmsFileUrl('https://example.com/file.pdf')).toBe(false);
    expect(isTrustedPmsFileUrl('not-a-url')).toBe(false);
  });
});
