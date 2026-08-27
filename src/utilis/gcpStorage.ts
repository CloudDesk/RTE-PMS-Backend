import { Storage } from "@google-cloud/storage";
import * as fs from "fs";
import path from 'path';
import dotenv from 'dotenv'

dotenv.config()

function buildStorageClient(): Storage {
  const projectId = process.env.PROJECT_ID;
  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  const privateKey = process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const totalTimeoutSeconds = Number(process.env.GCP_RETRY_TOTAL_TIMEOUT_SEC ?? '120');
  const maxRetries = Number(process.env.GCP_RETRY_MAX_RETRIES ?? '2');

  if (serviceAccountJson) {
    const parsedCredentials = JSON.parse(serviceAccountJson);
    return new Storage({
      projectId,
      credentials: {
        client_email: parsedCredentials.client_email,
        private_key: parsedCredentials.private_key,
      },
      retryOptions: {
        autoRetry: true,
        maxRetries,
        totalTimeout: totalTimeoutSeconds,
      },
    });
  }

  if (clientEmail && privateKey) {
    return new Storage({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      retryOptions: {
        autoRetry: true,
        maxRetries,
        totalTimeout: totalTimeoutSeconds,
      },
    });
  }

  return new Storage({
    projectId,
    retryOptions: {
      autoRetry: true,
      maxRetries,
      totalTimeout: totalTimeoutSeconds,
    },
  });
}

const storage = buildStorageClient();
const bucketName = process.env.GCP_STORAGE_BUCKET;

export interface IGCPUploadParams {
  filePath: string;
  fileName: string;
  employeeId: string;
  category: string;
  type: string;
  public?: boolean;
  bucketName?: string;
}

export interface IGCPUploadResult {
  success: boolean;
  fileUrl?: string;
  error?: string;
}

/**
 * Upload file to GCP Cloud Storage with organized folder structure
 */
export async function uploadFileToGCP(params: IGCPUploadParams): Promise<IGCPUploadResult> {
  try {
    const {
      filePath,
      fileName,
      employeeId,
      category,
      type,
      public: makePublic,
      bucketName: bucketOverride,
    } = params;
    const targetBucketName = bucketOverride || bucketName;

    if (!targetBucketName) {
      return {
        success: false,
        error: 'GCP_STORAGE_BUCKET is not configured',
      };
    }

    // Determine folder name based on category and type
    const folderName = getFolderName(category, type);

    // Create the full path in GCP: employeeId/folderName/fileName
    const gcpFilePath = `${employeeId}/${folderName}/${fileName}`;

    // Upload file to GCP
    const bucket = storage.bucket(targetBucketName);
    const file = bucket.file(gcpFilePath);

    const uploadTimeoutMs = Number(process.env.GCP_UPLOAD_TIMEOUT_MS ?? '60000'); // default 60s
    const buffer = await fs.promises.readFile(filePath);

    // Upload the file (use simple upload for small supporting docs; avoids resumable overhead)
    await file.save(buffer, {
      metadata: {
        contentType: getContentType(fileName),
      },
      resumable: false,
      timeout: uploadTimeoutMs,
    });

    if (makePublic) {
      try {
        await file.makePublic();
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        const lowered = msg.toLowerCase();

        // Uniform bucket-level access disables object ACLs. In that case, public access must be granted at bucket IAM level.
        // Don't fail hard here because the bucket may already be public via IAM, in which case the URL works anyway.
        const uniformAccessHint =
          lowered.includes('uniform bucket-level access') ||
          lowered.includes('bucket-level access') ||
          lowered.includes('legacy acl');

        if (!uniformAccessHint) throw err;
      }
    }

    // Construct the public URL
    const fileUrl = `https://storage.googleapis.com/${targetBucketName}/${gcpFilePath}`;
    return {
      success: true,
      fileUrl,
    };

  } catch (error: any) {
    console.error('GCP Upload Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload file to GCP',
    };
  }
}

/**
 * Delete file from GCP Cloud Storage
 */
export async function deleteFileFromGCP(fileUrl: string): Promise<IGCPUploadResult> {
  try {
    // Extract file path from URL
    const urlParts = fileUrl.replace(`https://storage.googleapis.com/${bucketName}/`, '');

    const bucket = storage.bucket(bucketName || '');
    const file = bucket.file(urlParts);

    // Check if file exists before deleting
    const [exists] = await file.exists();
    if (!exists) {
      return {
        success: true, // File doesn't exist, consider deletion successful
        fileUrl: '',
      };
    }

    await file.delete();

    return {
      success: true,
      fileUrl: '',
    };

  } catch (error: any) {
    console.error('GCP Delete Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete file from GCP',
    };
  }
}

/**
 * Get folder name based on category and type
 */
function getFolderName(category: string, type: string): string {
  switch (category) {
    case 'Timesheet':
      return 'TimesheetFile';
    case 'Tax':
      switch (type) {
        case 'Form16':
          return 'Form16';
        case 'Form12B':
          return 'Form12B';
        case 'Form12BB':
          return 'Form12BB';
        case 'TaxProof':
          return 'TaxProof';
        default:
          return 'Tax';
      }
    case 'EmployeeLifecycle':
      switch (type) {
        case 'OfferLetter':
          return 'OfferLetter';
        case 'HikeLetter':
          return 'HikeLetter';
        default:
          return 'EmployeeLifecycle';
      }
    case 'Certification':
      // Handle Academic, Experience, and GovernmentId document types
      switch (type) {
        case 'Academic':
          return 'Academic';
        case 'Experience':
          return 'Experience';
        case 'GovernmentId':
          return 'GovernmentId';
        default:
          return 'Certificate';
      }
    case 'Payroll':
      return 'Payroll';
    case 'PMS':
      switch (type) {
        case 'EmployeeAchievement':
          return 'EmployeeAchievement';
        default:
          return 'PMS';
      }
    default:
      return category;
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();

  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.doc':
      return 'application/msword';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls':
      return 'application/vnd.ms-excel';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
} 
