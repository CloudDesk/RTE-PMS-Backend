import {
  assertPmsAttachmentLimits,
  PMS_ATTACHMENT_MAX_TOTAL_BYTES,
} from '../../src/constants/pms-attachment-limits';
import { TermReviewService } from '../../src/services/termReview.service';
import { ManagerReviewPeriodService } from '../../src/services/managerReviewPeriod.service';

describe('PMS attachment limits', () => {
  it('accepts five files totaling exactly 5 MB', () => {
    expect(() => assertPmsAttachmentLimits(
      Array.from({ length: 5 }, () => ({ fileSize: 1024 * 1024 })),
      'Attachments',
    )).not.toThrow();
  });

  it('rejects more than five files', () => {
    expect(() => assertPmsAttachmentLimits(
      Array.from({ length: 6 }, () => ({ fileSize: 1 })),
      'Attachments',
    )).toThrow('maximum of 5 files');
  });

  it('rejects a combined size above 5 MB', () => {
    expect(() => assertPmsAttachmentLimits(
      [{ fileSize: PMS_ATTACHMENT_MAX_TOTAL_BYTES }, { fileSize: 1 }],
      'Attachments',
    )).toThrow('must not exceed 5 MB in total');
  });

  it.each([
    ['term review', new TermReviewService({} as any)],
    ['grouped manager review', new ManagerReviewPeriodService({} as any)],
  ])('enforces the limit in the %s persistence path', (_label, service) => {
    expect(() => (service as any).normalizeAttachments(
      Array.from({ length: 6 }, (_, index) => ({
        fileName: `file-${index}.pdf`,
        fileSize: 1,
      })),
    )).toThrow('maximum of 5 files');
  });
});
