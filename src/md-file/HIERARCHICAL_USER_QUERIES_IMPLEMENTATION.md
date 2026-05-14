# Hierarchical User Queries Implementation

## Overview

This implementation provides hierarchical user query functionality where managers can view their subordinates (staff) and their subordinates' subordinates (external users) in a single query, using the existing `userHierarchy.ts` utility functions.

## Implementation Details

### 1. Enhanced `getUsers` Method

The `getUsers` method in `UserService` has been enhanced to support hierarchical queries:

**When `subordinates=true` and user role is 'manager':**
- Uses `getSubordinateUserIds` from `userHierarchy.ts` to get all subordinate IDs recursively
- Filters users by `_id: { $in: allSubordinateIds }`
- Returns staff + external users under the manager

**When `subordinates=true` and user role is not 'manager':**
- Falls back to original behavior (direct subordinates only)

```typescript
// Handle subordinates filter
else if (subordinates) {
  // Check if the authenticated user is a manager
  if (authenticatedUser.role.toLowerCase() === 'manager') {
    // Get all subordinate IDs recursively (staff + external users)
    const allSubordinateIds = await getSubordinateUserIds(authenticatedUser._id);
    
    if (allSubordinateIds.length > 0) {
      filter._id = { $in: allSubordinateIds };
    } else {
      // No subordinates found, return empty result
      filter._id = null;
    }
  } else {
    // For non-managers, get direct subordinates only
    filter.managerId = authenticatedUser._id;
  }
  filter.active = true;
}
```

### 2. New Method: `getManagerTeamMembers`

A dedicated method for managers to get their complete team with filtering capabilities:

```typescript
async getManagerTeamMembers(managerId: string, query: {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  departmentId?: string;
  sort?: string;
  sortOrder?: 'asc' | 'desc';
} = {}): Promise<any>
```

**Features:**
- Validates that the user is actually a manager
- Gets all hierarchical subordinates using `getSubordinateUserIds`
- Supports filtering, searching, and pagination
- Returns comprehensive user data

### 3. Enhanced `findByReportingToId` Method

Updated to support hierarchical queries with an optional parameter:

```typescript
async findByReportingToId(
  reportingToId: string, 
  page: number = 1, 
  limit: number = 10, 
  includeHierarchy: boolean = false
): Promise<any>
```

**When `includeHierarchy=true`:**
- Checks if the user is a manager
- Uses `getSubordinateUserIds` for hierarchical queries
- Falls back to direct subordinates for non-managers

**When `includeHierarchy=false`:**
- Original behavior (direct subordinates only)

### 4. New API Endpoint

**GET** `/users/team-members/:managerId`

**Features:**
- Dedicated endpoint for hierarchical team queries
- Access control (only manager or admin can access)
- Full filtering and search capabilities

**Query Parameters:**
- `page`, `limit` - Pagination
- `search` - Search by name or email
- `role` - Filter by role (admin, manager, staff, external)
- `status` - Filter by status (active, inactive)
- `departmentId` - Filter by department
- `sort`, `sortOrder` - Sorting options

## Usage Examples

### 1. Existing Endpoint (Enhanced)

**For Managers:**
```bash
# Get all subordinates (staff + external users)
GET /users?subordinates=true
```

**For Non-Managers:**
```bash
# Still works as before (direct subordinates only)
GET /users?subordinates=true
```

### 2. New Dedicated Endpoint

```bash
# Get all team members for a manager
GET /users/team-members/manager_id_123

# Filter by role
GET /users/team-members/manager_id_123?role=staff
GET /users/team-members/manager_id_123?role=external

# Search team members
GET /users/team-members/manager_id_123?search=alice

# Paginated results
GET /users/team-members/manager_id_123?page=2&limit=5
```

### 3. Backend Service Usage

```typescript
// In a service or controller
const userService = new UserService(context);

// Get all subordinates for a manager
const subordinates = await userService.getUsers(
  { subordinates: true },
  managerUser
);

// Get team members with specific filters
const teamMembers = await userService.getManagerTeamMembers(
  managerId,
  { 
    role: 'staff',
    search: 'john',
    page: 1,
    limit: 10
  }
);

// Get reporting structure with hierarchy
const reportingUsers = await userService.findByReportingToId(
  managerId,
  1,
  10,
  true // include hierarchy
);
```

## User Hierarchy Logic

The system supports the following hierarchy:
```
Admin
├── Manager
│   ├── Staff
│   │   └── External User
│   └── Staff
│       └── External User
└── Manager
    └── Staff
        └── External User
```

**Access Results:**
- **Manager**: Can see all staff + external users under them
- **Staff**: Can see only their direct external subordinates
- **Admin**: Can see all users

## Testing

A comprehensive test script is provided at `test/testHierarchicalUsers.ts` that:

1. Sets up test data with manager → staff → external user hierarchy
2. Tests all hierarchical query methods
3. Verifies filtering and search functionality
4. Validates pagination and sorting

**Run the test:**
```bash
npx ts-node test/testHierarchicalUsers.ts
```

## Performance Considerations

1. **Database Queries:** Uses the optimized `getSubordinateUserIds` function from `userHierarchy.ts`
2. **Breadth-First Search:** Avoids deep recursion and handles cycles
3. **Indexing:** Leverages existing indexes on `managerId` and `role` fields
4. **Pagination:** Always use pagination for large datasets

## Security

1. **Access Control:** Only managers can view their own team members
2. **Role Validation:** The system validates user roles before allowing hierarchical access
3. **Data Filtering:** Users can only see data they're authorized to access

## Migration Guide

### For Existing Code

If you're currently using the subordinates endpoint:

**Before:**
```javascript
// Old way - direct subordinates only
GET /users?subordinates=true
```

**After:**
```javascript
// New way - hierarchical subordinates for managers
GET /users?subordinates=true
```

### For New Implementations

Use the dedicated team members endpoint for better control:

```javascript
// Recommended for new implementations
GET /users/team-members/:managerId
```

## Error Handling

The system provides clear error messages for common scenarios:

- **403 Forbidden:** When non-managers try to access hierarchical data
- **400 Bad Request:** When invalid parameters are provided
- **404 Not Found:** When manager ID doesn't exist

## Dependencies

This implementation relies on:
- `src/utilis/userHierarchy.ts` - Core hierarchy utility functions
- `src/models/user.model.ts` - User model with proper indexes
- `src/types/context.ts` - Request context interface

## Future Enhancements

1. **Caching:** Redis-based caching for frequently accessed hierarchical data
2. **Deep Hierarchy:** Support for deeper organizational hierarchies
3. **Bulk Operations:** Support for bulk operations on hierarchical teams
4. **Analytics:** Hierarchical team analytics and reporting
5. **Real-time Updates:** WebSocket support for real-time team changes 