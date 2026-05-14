# User Hierarchy Implementation for Bulk Attendance Upload

## Overview

This implementation adds hierarchical user access control to the bulk attendance upload module, ensuring users can only manage attendance for their subordinates based on the organizational hierarchy.

## Hierarchy Logic

### User Roles and Access Levels

1. **Admin** (`role: 'admin'`)
   - Can view and manage all external users
   - No hierarchy restrictions

2. **Manager** (`role: 'manager'`)
   - Can view and manage external users under their subordinates (recursive)
   - Includes external users under their staff subordinates

3. **Staff** (`role: 'staff'`)
   - Can view and manage only their direct external subordinates

### Example Hierarchy

```
Jey (Admin)
├─ Wajith (Manager)
│   ├─ Pravin (Staff) → Ex1, Ex2 (External)
│   └─ Hari (Staff)   → Ex3 (External)
```

**Access Results:**
- **Jey (Admin)**: Can manage [Ex1, Ex2, Ex3]
- **Wajith (Manager)**: Can manage [Ex1, Ex2, Ex3]
- **Pravin (Staff)**: Can manage [Ex1, Ex2]
- **Hari (Staff)**: Can manage [Ex3]

## Implementation Details

### 1. User Hierarchy Utility (`src/utilis/userHierarchy.ts`)

#### Core Functions

**`getSubordinateUserIds(userId)`**
- Recursively finds all subordinate user IDs under a given user
- Uses breadth-first search to avoid deep recursion
- Handles cycles in the hierarchy
- Returns array of ObjectIds

**`getManageableExternalUsers(userId, userRole)`**
- Returns external users that a user can manage based on their role
- Admins get all external users
- Managers/Staff get external users from their subordinate hierarchy

**`getManageableUsers(userId, userRole)`**
- Returns all users (including external) that a user can manage
- Used for broader access control scenarios

**`canManageUser(managerId, subordinateId)`**
- Checks if a user can manage another user based on hierarchy
- Returns boolean

### 2. Updated Bulk Attendance Upload Service

#### Modified Methods

**`generateExcelTemplate(currentUserId, currentUserRole)`**
- Now accepts current user information
- Filters external users based on hierarchy access
- Only includes manageable external users in the template

**`validateBulkUploadData(rows, currentUserId?, currentUserRole?)`**
- Optional hierarchy validation during data validation
- Filters user queries based on manageable users
- Prevents validation of unauthorized users

**`confirmBulkUpload(validRows, assignedBy, currentUserRole?)`**
- Validates hierarchy access before processing
- Rejects uploads containing unmanageable users
- Returns access denied error for unauthorized attempts

### 3. Updated Route Handlers

#### Template Download (`/template`)
- Extracts current user information from JWT
- Passes user ID and role to service method
- Ensures template only contains manageable users

#### Parse Validation (`/parse`)
- Passes current user information to validation
- Applies hierarchy filtering during validation
- Prevents unauthorized data processing

#### Confirm Upload (`/confirm`)
- Validates hierarchy access before confirmation
- Rejects uploads with unauthorized users
- Provides clear error messages for access violations

## Usage Examples

### 1. Template Generation

```typescript
// Route handler
const currentUser = request.user as any;
const templateBuffer = await bulkUploadService.generateExcelTemplate(
  currentUser._id,
  currentUser.role
);
```

### 2. Data Validation

```typescript
// Service method
const validationResult = await bulkUploadService.validateBulkUploadData(
  rows,
  currentUserId,
  currentUserRole
);
```

### 3. Upload Confirmation

```typescript
// Service method
const result = await bulkUploadService.confirmBulkUpload(
  validRows,
  assignedBy,
  currentUserRole
);
```

## Security Features

### 1. Multi-Level Validation
- **Template Level**: Only shows manageable users
- **Validation Level**: Filters user queries
- **Confirmation Level**: Final access check before database operations

### 2. Error Handling
- Clear error messages for access violations
- Graceful handling of missing user information
- Proper HTTP status codes for different error types

### 3. Audit Trail
- All operations include the requesting user's ID
- Failed access attempts are logged
- Database operations maintain user context

## Performance Considerations

### 1. Efficient Queries
- Uses batch queries to reduce database calls
- Implements breadth-first search to avoid deep recursion
- Caches manageable user IDs during validation

### 2. Memory Management
- Processes large datasets in chunks
- Uses Set data structures for efficient lookups
- Cleans up temporary data structures

### 3. Database Optimization
- Leverages existing indexes on `managerId` and `role`
- Uses lean queries for read-only operations
- Implements proper query filtering

## Testing

### Test Coverage
- Unit tests for hierarchy utility functions
- Integration tests for service methods
- End-to-end tests for route handlers

### Test Scenarios
- Admin access to all external users
- Manager access to subordinate external users
- Staff access to direct external subordinates
- Access denied scenarios
- Edge cases (cycles, missing users, etc.)

## Migration Guide

### For Existing Implementations

1. **Update Service Method Signatures**
   ```typescript
   // Old
   generateExcelTemplate(): Promise<Buffer>
   
   // New
   generateExcelTemplate(currentUserId, currentUserRole): Promise<Buffer>
   ```

2. **Update Route Handlers**
   ```typescript
   // Extract user information from request
   const currentUser = request.user as any;
   const currentUserId = currentUser?._id;
   const currentUserRole = currentUser?.role;
   ```

3. **Add Error Handling**
   ```typescript
   if (!currentUser || !currentUser._id || !currentUser.role) {
     return reply.status(401).send({
       success: false,
       error: { message: 'User not authenticated or missing required information' }
     });
   }
   ```

### Database Requirements

Ensure the following indexes exist:
```javascript
// User collection indexes
db.users.createIndex({ "managerId": 1 });
db.users.createIndex({ "role": 1 });
db.users.createIndex({ "active": 1 });
db.users.createIndex({ "managerId": 1, "active": 1 });
db.users.createIndex({ "role": 1, "active": 1 });
```

## Troubleshooting

### Common Issues

1. **"User not authenticated" Error**
   - Check JWT token validity
   - Ensure user object contains required fields
   - Verify authentication middleware is applied

2. **"Access denied" Error**
   - Verify user hierarchy relationships
   - Check user roles and permissions
   - Ensure external users are under correct managers

3. **Empty Template**
   - Check if user has any subordinates
   - Verify external users exist in hierarchy
   - Ensure users are active

### Debug Information

Enable debug logging to trace hierarchy queries:
```typescript
console.log('Manageable external users:', manageableExternalUserIds);
console.log('User query:', userQuery);
console.log('Validation result:', validationResult);
```

## Future Enhancements

### 1. Caching
- Cache hierarchy relationships for better performance
- Implement Redis-based caching for large organizations
- Add cache invalidation on user updates

### 2. Advanced Permissions
- Role-based permission matrix
- Department-based access control
- Time-based access restrictions

### 3. Audit Features
- Detailed audit logs for all operations
- User activity tracking
- Compliance reporting

### 4. Performance Optimization
- Database query optimization
- Pagination for large datasets
- Async processing for bulk operations 