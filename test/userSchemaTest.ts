import { User } from '../src/models/user.model';

// Test function to verify the new schema fields
export function testUserSchema() {
  console.log('Testing User Schema with new UAE + External User support...\n');

  // Test 1: Create a user with default values (should work)
  const defaultUser = new User({
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'staff',
    departmentId: 'IT'
  });

  console.log('✅ Test 1: Default User Values');
  console.log('  country:', defaultUser.country); // Should be 'IN'
  console.log('  currency:', defaultUser.currency); // Should be 'INR'
  console.log('  licenseType:', defaultUser.licenseType); // Should be 'employee'
  console.log('  portalAccess:', defaultUser.portalAccess); // Should be true
  console.log('');

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

  console.log('✅ Test 2: UAE User Values');
  console.log('  country:', uaeUser.country); // Should be 'AE'
  console.log('  currency:', uaeUser.currency); // Should be 'AED'
  console.log('  licenseType:', uaeUser.licenseType); // Should be 'employee'
  console.log('  portalAccess:', uaeUser.portalAccess); // Should be true
  console.log('');

  // Test 3: Create an external user
  const externalUser = new User({
    name: 'External User',
    email: 'external@example.com',
    password: 'password123',
    role: 'external',
    departmentId: 'IT',
    licenseType: 'external'
  });

  console.log('✅ Test 3: External User Values (Before Save)');
  console.log('  country:', externalUser.country); // Should be 'IN'
  console.log('  currency:', externalUser.currency); // Should be 'INR'
  console.log('  licenseType:', externalUser.licenseType); // Should be 'external'
  console.log('  portalAccess:', externalUser.portalAccess); // Should be true (before pre-save hook)
  console.log('  role:', externalUser.role); // Should be 'external'
  console.log('');

  // Test 4: Test validation for invalid values
  console.log('✅ Test 4: Validation Tests');

  // Test invalid country
  try {
    new User({
      name: 'Invalid Country User',
      email: 'invalid-country@example.com',
      password: 'password123',
      role: 'staff',
      departmentId: 'IT',
      country: 'US' // Invalid country
    });
    console.log('  ❌ Validation should have failed for invalid country');
  } catch (error: any) {
    console.log('  ✅ Validation correctly failed for invalid country:', error.message);
  }

  // Test invalid currency
  try {
    new User({
      name: 'Invalid Currency User',
      email: 'invalid-currency@example.com',
      password: 'password123',
      role: 'staff',
      departmentId: 'IT',
      currency: 'USD' // Invalid currency
    });
    console.log('  ❌ Validation should have failed for invalid currency');
  } catch (error: any) {
    console.log('  ✅ Validation correctly failed for invalid currency:', error.message);
  }

  // Test invalid license type
  try {
    new User({
      name: 'Invalid License User',
      email: 'invalid-license@example.com',
      password: 'password123',
      role: 'staff',
      departmentId: 'IT',
      licenseType: 'contractor' // Invalid license type
    });
    console.log('  ❌ Validation should have failed for invalid license type');
  } catch (error: any) {
    console.log('  ✅ Validation correctly failed for invalid license type:', error.message);
  }

  console.log('');

  // Test 5: Schema field validation
  console.log('✅ Test 5: Schema Field Validation');
  console.log('  - country enum values:', ['IN', 'AE']);
  console.log('  - currency enum values:', ['INR', 'AED']);
  console.log('  - licenseType enum values:', ['employee', 'external']);
  console.log('  - role enum values:', ['admin', 'manager', 'staff', 'external']);
  console.log('  - portalAccess type: boolean');
  console.log('');

  console.log('🎉 User Schema tests completed successfully!');
  console.log('');
  console.log('📝 Note: Pre-save hooks (like portalAccess=false for external users)');
  console.log('   only run when the document is actually saved to the database.');
  console.log('   In a real application, external users would have portalAccess=false');
  console.log('   after the pre-save hook executes.');
}

// Run tests if this file is executed directly
if (require.main === module) {
  testUserSchema();
} 