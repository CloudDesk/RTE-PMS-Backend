import { connect, disconnect } from 'mongoose';
import { User } from '../src/models/user.model';
import { UserService } from '../src/services/user.service';
import { RequestContext } from '../src/types/context';

// Test data setup
const testUsers = [
  {
    name: 'Manager John',
    email: 'manager.john@test.com',
    password: 'password123',
    role: 'manager',
    departmentId: 'IT',
    active: true,
    country: 'IN',
    currency: 'INR',
    licenseType: 'employee',
    portalAccess: true
  },
  {
    name: 'Staff Alice',
    email: 'staff.alice@test.com',
    password: 'password123',
    role: 'staff',
    departmentId: 'IT',
    active: true,
    country: 'IN',
    currency: 'INR',
    licenseType: 'employee',
    portalAccess: true
  },
  {
    name: 'Staff Bob',
    email: 'staff.bob@test.com',
    password: 'password123',
    role: 'staff',
    departmentId: 'IT',
    active: true,
    country: 'IN',
    currency: 'INR',
    licenseType: 'employee',
    portalAccess: true
  },
  {
    name: 'External User Charlie',
    email: 'external.charlie@test.com',
    password: 'password123',
    role: 'external',
    departmentId: 'IT',
    active: true,
    country: 'IN',
    currency: 'INR',
    licenseType: 'external',
    portalAccess: false
  },
  {
    name: 'External User Diana',
    email: 'external.diana@test.com',
    password: 'password123',
    role: 'external',
    departmentId: 'IT',
    active: true,
    country: 'IN',
    currency: 'INR',
    licenseType: 'external',
    portalAccess: false
  }
];

async function setupTestData() {
  console.log('Setting up test data...');
  
  // Clear existing test users
  await User.deleteMany({ email: { $in: testUsers.map(u => u.email) } });
  
  // Create users
  const createdUsers = await User.create(testUsers);
  
  // Set up hierarchy: Manager -> Staff -> External Users
  const manager = createdUsers.find(u => u.role === 'manager')!;
  const staffUsers = createdUsers.filter(u => u.role === 'staff');
  const externalUsers = createdUsers.filter(u => u.role === 'external');
  
  // Assign staff to manager
  for (const staff of staffUsers) {
    staff.managerId = manager._id;
    await staff.save();
  }
  
  // Assign external users to first staff member
  const firstStaff = staffUsers[0];
  for (const external of externalUsers) {
    external.managerId = firstStaff._id;
    await external.save();
  }
  
  console.log('Test data setup complete!');
  console.log('Manager:', manager.name, manager._id);
  console.log('Staff users:', staffUsers.map(u => ({ name: u.name, id: u._id })));
  console.log('External users:', externalUsers.map(u => ({ name: u.name, id: u._id })));
  
  return { manager, staffUsers, externalUsers };
}

async function testHierarchicalQueries() {
  try {
    await connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test');
    console.log('Connected to MongoDB');
    
    const { manager, staffUsers, externalUsers } = await setupTestData();
    
    // Create a mock context for UserService
    const mockContext: RequestContext = {
      reqRole: 'MANAGER',
      requestId: 'test-request-id',
      user: manager
    };
    
    const userService = new UserService(mockContext);
    
    console.log('\n=== Testing Hierarchical User Queries ===\n');
    
    // Test 1: Get all subordinates for manager (should include staff + external users)
    console.log('Test 1: Getting all subordinates for manager...');
    const subordinatesResult = await userService.getUsers(
      { subordinates: true },
      manager
    );
    
    console.log('Subordinates found:', subordinatesResult.users.length);
    console.log('Subordinates:', subordinatesResult.users.map(u => ({ name: u.name, role: u.role, managerId: u.managerId })));
    
    // Test 2: Get team members using new method
    console.log('\nTest 2: Getting team members using getManagerTeamMembers...');
    const teamResult = await userService.getManagerTeamMembers(manager._id.toString());
    
    console.log('Team members found:', teamResult.users.length);
    console.log('Team members:', teamResult.users.map(u => ({ name: u.name, role: u.role, managerId: u.managerId })));
    
    // Test 3: Filter by role
    console.log('\nTest 3: Filtering team members by role (staff only)...');
    const staffOnlyResult = await userService.getManagerTeamMembers(manager._id.toString(), { role: 'staff' });
    
    console.log('Staff members found:', staffOnlyResult.users.length);
    console.log('Staff members:', staffOnlyResult.users.map(u => ({ name: u.name, role: u.role })));
    
    // Test 4: Filter by role (external only)
    console.log('\nTest 4: Filtering team members by role (external only)...');
    const externalOnlyResult = await userService.getManagerTeamMembers(manager._id.toString(), { role: 'external' });
    
    console.log('External users found:', externalOnlyResult.users.length);
    console.log('External users:', externalOnlyResult.users.map(u => ({ name: u.name, role: u.role })));
    
    // Test 5: Search functionality
    console.log('\nTest 5: Searching team members...');
    const searchResult = await userService.getManagerTeamMembers(manager._id.toString(), { search: 'Alice' });
    
    console.log('Search results found:', searchResult.users.length);
    console.log('Search results:', searchResult.users.map(u => ({ name: u.name, role: u.role })));
    
    // Test 6: Test findByReportingToId with hierarchy
    console.log('\nTest 6: Testing findByReportingToId with hierarchy...');
    const reportingResult = await userService.findByReportingToId(manager._id.toString(), 1, 10, true);
    
    console.log('Reporting results found:', reportingResult.users.length);
    console.log('Reporting results:', reportingResult.users.map(u => ({ name: u.name, role: u.role, managerId: u.managerId })));
    
    console.log('\n=== All tests completed successfully! ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testHierarchicalQueries();
} 