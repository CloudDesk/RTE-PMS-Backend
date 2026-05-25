import { User } from '../src/models/user.model';

describe('User Schema Tests', () => {
  it('should verify schema fields', () => {
    // Test 1: Create a user with default values (should work)
    const defaultUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      role: 'staff',
      departmentId: 'IT'
    });

    expect(defaultUser.country).toBe('IN');
    expect(defaultUser.currency).toBe('INR');
    expect(defaultUser.licenseType).toBe('employee');
    expect(defaultUser.portalAccess).toBe(true);

    // Test 2: Create a UAE user
    const uaeUser = new User({
      name: 'UAE User',
      email: 'uae@example.com',
      password: 'password123',
      role: 'staff',
      departmentId: 'IT',
      country: 'AE',
      currency: 'AED'
    });

    expect(uaeUser.country).toBe('AE');
    expect(uaeUser.currency).toBe('AED');
    expect(uaeUser.licenseType).toBe('employee');
    expect(uaeUser.portalAccess).toBe(true);

    // Test 3: Create an external user
    const externalUser = new User({
      name: 'External User',
      email: 'external@example.com',
      password: 'password123',
      role: 'external',
      departmentId: 'IT',
      licenseType: 'external'
    });

    expect(externalUser.country).toBe('IN');
    expect(externalUser.currency).toBe('INR');
    expect(externalUser.licenseType).toBe('external');
    expect(externalUser.portalAccess).toBe(true);
    expect(externalUser.role).toBe('external');

    // Test 4: Test validation for invalid values
    // Test invalid country
    expect(() => {
      const u = new User({
        name: 'Invalid Country User',
        email: 'invalid-country@example.com',
        password: 'password123',
        role: 'staff',
        departmentId: 'IT',
        country: 'US' // Invalid country
      });
      const err = u.validateSync();
      if (err) throw err;
    }).toThrow();

    // Test invalid currency
    expect(() => {
      const u = new User({
        name: 'Invalid Currency User',
        email: 'invalid-currency@example.com',
        password: 'password123',
        role: 'staff',
        departmentId: 'IT',
        currency: 'USD' // Invalid currency
      });
      const err = u.validateSync();
      if (err) throw err;
    }).toThrow();

    // Test invalid license type
    expect(() => {
      const u = new User({
        name: 'Invalid License User',
        email: 'invalid-license@example.com',
        password: 'password123',
        role: 'staff',
        departmentId: 'IT',
        licenseType: 'contractor' // Invalid license type
      });
      const err = u.validateSync();
      if (err) throw err;
    }).toThrow();
  });
});

// Export compatibility function
export function testUserSchema() {
  const defaultUser = new User({
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'staff',
    departmentId: 'IT'
  });
  if (defaultUser.country !== 'IN') throw new Error('Default country check failed');
}

if (require.main === module) {
  testUserSchema();
}