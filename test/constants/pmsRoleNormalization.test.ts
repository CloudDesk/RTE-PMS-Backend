import { normalizePmsRole, PmsRole } from '../../src/constants/pms.enums';

describe('PMS role normalization for HR composition', () => {
  it('maps HR to manager behavior without mapping it to unrestricted admin', () => {
    expect(normalizePmsRole('HR')).toBe(PmsRole.MANAGER);
    expect(normalizePmsRole('HR')).not.toBe(PmsRole.ADMIN);
  });

  it('preserves the existing HR admin compatibility aliases', () => {
    expect(normalizePmsRole('HR_ADMIN')).toBe(PmsRole.ADMIN);
    expect(normalizePmsRole('hradmin')).toBe(PmsRole.ADMIN);
  });
});
