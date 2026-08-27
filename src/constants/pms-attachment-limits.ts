export const PMS_ATTACHMENT_MAX_FILES = 5;
export const PMS_ATTACHMENT_MAX_TOTAL_BYTES = 5 * 1024 * 1024;
export const PMS_ATTACHMENT_MAX_TOTAL_LABEL = '5 MB';

export function assertPmsAttachmentLimits(
  attachments: Array<{ fileSize?: number | null }>,
  label: string,
): void {
  if (attachments.length > PMS_ATTACHMENT_MAX_FILES) {
    throw new Error(`${label} allow a maximum of ${PMS_ATTACHMENT_MAX_FILES} files.`);
  }

  const totalBytes = attachments.reduce((total, attachment) => {
    const fileSize = Number(attachment.fileSize ?? 0);
    return total + (Number.isFinite(fileSize) && fileSize > 0 ? fileSize : 0);
  }, 0);
  if (totalBytes > PMS_ATTACHMENT_MAX_TOTAL_BYTES) {
    throw new Error(`${label} must not exceed ${PMS_ATTACHMENT_MAX_TOTAL_LABEL} in total.`);
  }
}
