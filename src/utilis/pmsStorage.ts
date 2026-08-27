import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import path from 'path';
import { uploadFileToGCP } from './gcpStorage';

export type PmsStorageProvider = 'gcp' | 'azure';

export interface PmsStorageUploadParams {
  filePath: string;
  fileName: string;
  employeeId: string;
  type: string;
  contentType?: string;
  public?: boolean;
}

export interface PmsStorageUploadResult {
  success: boolean;
  fileUrl?: string;
  error?: string;
}

export function getPmsStorageProvider(): PmsStorageProvider {
  const configured = String(process.env.PMS_STORAGE_PROVIDER || 'gcp')
    .trim()
    .toLowerCase();
  if (configured !== 'gcp' && configured !== 'azure') {
    throw new Error(
      `PMS_STORAGE_PROVIDER must be either "gcp" or "azure"; received "${configured}"`,
    );
  }
  return configured;
}

function requiredEnv(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function pmsFolderName(type: string): string {
  return type === 'EmployeeAchievement' ? 'EmployeeAchievement' : 'PMS';
}

function safeBlobPath(params: PmsStorageUploadParams): string {
  const safeEmployeeId = params.employeeId.replace(/[^\w-]+/g, '_');
  const safeFileName = path.basename(params.fileName).replace(/[^\w.\-() ]+/g, '_');
  return `${safeEmployeeId}/${pmsFolderName(params.type)}/${safeFileName}`;
}

async function uploadFileToAzure(
  params: PmsStorageUploadParams,
): Promise<PmsStorageUploadResult> {
  const accountName = requiredEnv('PMS_AZURE_STORAGE_ACCOUNT');
  const containerName = requiredEnv('PMS_AZURE_STORAGE_CONTAINER');
  const connectionString = String(
    process.env.PMS_AZURE_STORAGE_CONNECTION_STRING || '',
  ).trim();
  const endpoint = String(
    process.env.PMS_AZURE_STORAGE_ENDPOINT ||
      `https://${accountName}.blob.core.windows.net`,
  ).replace(/\/$/, '');

  const serviceClient = connectionString
    ? BlobServiceClient.fromConnectionString(connectionString)
    : new BlobServiceClient(
      endpoint,
      new DefaultAzureCredential({
        managedIdentityClientId:
          process.env.PMS_AZURE_MANAGED_IDENTITY_CLIENT_ID || undefined,
      }),
    );

  try {
    const blob = serviceClient
      .getContainerClient(containerName)
      .getBlockBlobClient(safeBlobPath(params));
    await blob.uploadFile(params.filePath, {
      blobHTTPHeaders: params.contentType
        ? { blobContentType: params.contentType }
        : undefined,
    });
    return { success: true, fileUrl: blob.url };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('PMS Azure Blob upload error:', message);
    return { success: false, error: message || 'Failed to upload PMS file to Azure Blob Storage' };
  }
}

export async function uploadFileToPmsStorage(
  params: PmsStorageUploadParams,
): Promise<PmsStorageUploadResult> {
  if (getPmsStorageProvider() === 'azure') {
    return uploadFileToAzure(params);
  }

  const pmsBucket = String(
    process.env.PMS_GCP_STORAGE_BUCKET || process.env.GCP_STORAGE_BUCKET || '',
  ).trim();
  if (!pmsBucket) {
    return { success: false, error: 'PMS_GCP_STORAGE_BUCKET is not configured' };
  }
  return uploadFileToGCP({
    ...params,
    category: 'PMS',
    bucketName: pmsBucket,
  });
}

export function isTrustedPmsFileUrl(fileUrl: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(fileUrl);
  } catch {
    return false;
  }
  if (parsedUrl.protocol !== 'https:') return false;
  if (parsedUrl.hostname === 'storage.googleapis.com') return true;

  const allowedHosts = new Set(
    String(process.env.PMS_STORAGE_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
  const azureEndpoint = String(process.env.PMS_AZURE_STORAGE_ENDPOINT || '').trim();
  if (azureEndpoint) {
    try {
      allowedHosts.add(new URL(azureEndpoint).hostname.toLowerCase());
    } catch {
      return false;
    }
  }
  const azureAccount = String(process.env.PMS_AZURE_STORAGE_ACCOUNT || '').trim();
  if (azureAccount) {
    allowedHosts.add(`${azureAccount}.blob.core.windows.net`.toLowerCase());
  }
  return allowedHosts.has(parsedUrl.hostname.toLowerCase());
}
