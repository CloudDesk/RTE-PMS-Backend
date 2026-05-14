import { getSubordinateUserIds, getManageableExternalUsers } from '../src/utilis/userHierarchy';
import { User } from '../src/models/user.model';
import { Types } from 'mongoose';

/**
 * Test script to demonstrate user hierarchy functionality
 * This script shows how the hierarchy works with sample data
 */

async function testUserHierarchy() {
  console.log('🧪 Testing User Hierarchy Implementation\n');

  // Sample user IDs for testing
  const adminId = '507f1f77bcf86cd799439011';
  const managerId = '507f1f77bcf86cd799439012';
  const staffId = '507f1f77bcf86cd799439013';
  const external1Id = '507f1f77bcf86cd799439015';
  const external2Id = '507f1f77bcf86cd799439016';
  const external3Id = '507f1f77bcf86cd799439017';

  try {
    // Test 1: Get all subordinates for Admin
    console.log('📋 Test 1: Admin subordinates');
    const adminSubordinates = await getSubordinateUserIds(adminId);
    console.log(`Admin (${adminId}) can manage ${adminSubordinates.length} subordinates`);
    console.log('Subordinate IDs:', adminSubordinates.map(id => id.toString()));
    console.log('');

    // Test 2: Get all subordinates for Manager
    console.log('📋 Test 2: Manager subordinates');
    const managerSubordinates = await getSubordinateUserIds(managerId);
    console.log(`Manager (${managerId}) can manage ${managerSubordinates.length} subordinates`);
    console.log('Subordinate IDs:', managerSubordinates.map(id => id.toString()));
    console.log('');

    // Test 3: Get all subordinates for Staff
    console.log('📋 Test 3: Staff subordinates');
    const staffSubordinates = await getSubordinateUserIds(staffId);
    console.log(`Staff (${staffId}) can manage ${staffSubordinates.length} subordinates`);
    console.log('Subordinate IDs:', staffSubordinates.map(id => id.toString()));
    console.log('');

    // Test 4: Get manageable external users for Admin
    console.log('📋 Test 4: Admin manageable external users');
    const adminExternalUsers = await getManageableExternalUsers(adminId, 'admin');
    console.log(`Admin can manage ${adminExternalUsers.length} external users`);
    console.log('External User IDs:', adminExternalUsers.map(id => id.toString()));
    console.log('');

    // Test 5: Get manageable external users for Manager
    console.log('📋 Test 5: Manager manageable external users');
    const managerExternalUsers = await getManageableExternalUsers(managerId, 'manager');
    console.log(`Manager can manage ${managerExternalUsers.length} external users`);
    console.log('External User IDs:', managerExternalUsers.map(id => id.toString()));
    console.log('');

    // Test 6: Get manageable external users for Staff
    console.log('📋 Test 6: Staff manageable external users');
    const staffExternalUsers = await getManageableExternalUsers(staffId, 'staff');
    console.log(`Staff can manage ${staffExternalUsers.length} external users`);
    console.log('External User IDs:', staffExternalUsers.map(id => id.toString()));
    console.log('');

    // Test 7: Hierarchy validation for bulk upload
    console.log('📋 Test 7: Bulk upload hierarchy validation');
    const testRows = [
      { userId: external1Id, rowNumber: 1 },
      { userId: external2Id, rowNumber: 2 },
      { userId: external3Id, rowNumber: 3 }
    ];

    // Test with different user roles
    const testCases = [
      { userId: adminId, role: 'admin', name: 'Admin' },
      { userId: managerId, role: 'manager', name: 'Manager' },
      { userId: staffId, role: 'staff', name: 'Staff' }
    ];

    for (const testCase of testCases) {
      const manageableUsers = await getManageableExternalUsers(testCase.userId, testCase.role);
      const manageableUserIds = manageableUsers.map(id => id.toString());
      
      const canProcessAll = testRows.every(row => 
        manageableUserIds.includes(row.userId)
      );
      
      console.log(`${testCase.name} can process all rows: ${canProcessAll ? '✅ YES' : '❌ NO'}`);
      
      if (!canProcessAll) {
        const unmanageableUsers = testRows.filter(row => 
          !manageableUserIds.includes(row.userId)
        );
        console.log(`  Unmanageable users: ${unmanageableUsers.map(row => row.userId).join(', ')}`);
      }
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testUserHierarchy()
    .then(() => {
      console.log('\n🎉 Test script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test script failed:', error);
      process.exit(1);
    });
}

export { testUserHierarchy }; 