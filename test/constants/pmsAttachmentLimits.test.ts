import {
  assertPmsAttachmentLimits,
  PMS_ATTACHMENT_MAX_TOTAL_BYTES,
} from '../../src/constants/pms-attachment-limits';

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
});
