# User Routes Migration Guide

## Overview

The user routes have been refactored to consolidate multiple GET endpoints into one unified, flexible route. This improves API consistency and reduces complexity.

## New Unified Route

**Endpoint:** `GET /users`

**Base URL:** `https://your-api-domain.com/users`

## Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `page` | number | Page number for pagination (default: 1) | `?page=2` |
| `limit` | number | Records per page (default: 10, max: 100) | `?limit=20` |
| `my` | boolean | Get current user profile (overrides other filters) | `?my=true` |
| `subordinates` | boolean | Get subordinates of current user (requires manager/admin role) | `?subordinates=true` |
| `search` | string | Search by name or email | `?search=john` |
| `role` | string | Filter by user role | `?role=manager` |
| `status` | string | Filter by user status | `?status=active` |
| `departmentId` | string | Filter by department ID | `?departmentId=IT` |
| `country` | string | Filter by country | `?country=AE` |
| `licenseType` | string | Filter by license type | `?licenseType=external` |
| `portalAccess` | boolean | Filter by portal access | `?portalAccess=true` |
| `sort` | string | Field to sort by (default: 'name') | `?sort=joiningDate` |
| `sortOrder` | string | Sort order: 'asc' or 'desc' (default: 'asc') | `?sortOrder=desc` |
| `select` | string | Comma-separated list of fields to include | `?select=name,email,role` |

## Route Migration Mapping

### Old Routes → New Routes

| Old Route | Old Method | New Route | New Method | Notes |
|-----------|------------|-----------|------------|-------|
| `GET /users` | Get all users | `GET /users` | Get all users | **Same route, enhanced** |
| `GET /users/me` | Get current user | `GET /users?my=true` | Get current user | **Changed** |
| `GET /users/my-subordinates` | Get subordinates | `GET /users?subordinates=true` | Get subordinates | **Changed** |
| `GET /users/role/:role` | Get by role | `GET /users?role=:role` | Get by role | **Changed** |
| `GET /users/filter` | Filter by role/dept | `GET /users?role=:role&departmentId=:dept` | Filter by role/dept | **Changed** |
| `GET /users/:id` | Get by ID | `GET /users/:id` | Get by ID | **Unchanged** |
| `GET /users/payroll` | Payroll users | `GET /users/payroll` | Payroll users | **Unchanged** |

### Detailed Migration Examples

#### 1. Get Current User Profile
```javascript
// OLD
GET /users/me

// NEW
GET /users?my=true
```

#### 2. Get Subordinates
```javascript
// OLD
GET /users/my-subordinates?page=1&limit=10

// NEW
GET /users?subordinates=true&page=1&limit=10
```

#### 3. Get Users by Role
```javascript
// OLD
GET /users/role/manager

// NEW
GET /users?role=manager
```

#### 4. Filter by Role and Department
```javascript
// OLD
GET /users/filter?role=staff&departmentId=IT

// NEW
GET /users?role=staff&departmentId=IT
```

#### 5. Search Users
```javascript
// OLD
GET /users?search=john

// NEW
GET /users?search=john
```

#### 6. Get All Users with Pagination
```javascript
// OLD
GET /users?page=2&limit=20

// NEW
GET /users?page=2&limit=20
```

## New Features

### 1. Enhanced Filtering
```javascript
// Filter by multiple criteria
GET /users?role=manager&status=active&country=AE&licenseType=employee

// Search with filters
GET /users?search=john&departmentId=IT&role=staff
```

### 2. Advanced Sorting
```javascript
// Sort by joining date, newest first
GET /users?sort=joiningDate&sortOrder=desc

// Sort by name, ascending
GET /users?sort=name&sortOrder=asc
```

### 3. Field Selection
```javascript
// Get only specific fields
GET /users?select=name,email,role,departmentId

// Get all fields (default)
GET /users
```

### 4. UAE + External User Support
```javascript
// Filter by country
GET /users?country=AE

// Filter by license type
GET /users?licenseType=external

// Filter by portal access
GET /users?portalAccess=false
```

## Response Format

### Single User (for `?my=true`)
```json
{
  "success": true,
  "data": [
    {
      "_id": "user_id",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "manager",
      "departmentId": "IT",
      "country": "IN",
      "currency": "INR",
      "licenseType": "employee",
      "portalAccess": true,
      // ... other fields
    }
  ],
  "meta": {
    "page": 1,
    "limit": 1,
    "total": 1,
    "totalPages": 1
  }
}
```

### Multiple Users (default)
```json
{
  "success": true,
  "data": [
    {
      "_id": "user_id_1",
      "name": "John Doe",
      "email": "john@example.com",
      // ... other fields
    },
    {
      "_id": "user_id_2",
      "name": "Jane Smith",
      "email": "jane@example.com",
      // ... other fields
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

## Error Responses

### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "message": "Access denied: Only managers or admins can view subordinates"
  }
}
```

### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "message": "Invalid query parameters"
  }
}
```

## Frontend Implementation Examples

### React/JavaScript Example
```javascript
// Get current user
const getCurrentUser = async () => {
  const response = await fetch('/users?my=true');
  const data = await response.json();
  return data.data[0]; // Return first (and only) user from array
};

// Get subordinates
const getSubordinates = async (page = 1, limit = 10) => {
  const response = await fetch(`/users?subordinates=true&page=${page}&limit=${limit}`);
  const data = await response.json();
  return data;
};

// Search users
const searchUsers = async (searchTerm, filters = {}) => {
  const params = new URLSearchParams({
    search: searchTerm,
    ...filters
  });
  const response = await fetch(`/users?${params}`);
  const data = await response.json();
  return data;
};

// Get users by role
const getUsersByRole = async (role, page = 1) => {
  const response = await fetch(`/users?role=${role}&page=${page}`);
  const data = await response.json();
  return data;
};
```

### Axios Example
```javascript
import axios from 'axios';

const userAPI = {
  // Get current user
  getCurrentUser: () => axios.get('/users?my=true').then(res => ({
    ...res,
    data: { ...res.data, data: res.data.data[0] } // Extract single user from array
  })),
  
  // Get subordinates
  getSubordinates: (page = 1, limit = 10) => 
    axios.get(`/users?subordinates=true&page=${page}&limit=${limit}`),
  
  // Search users
  searchUsers: (searchTerm, filters = {}) => 
    axios.get('/users', { params: { search: searchTerm, ...filters } }),
  
  // Get users by role
  getUsersByRole: (role, page = 1) => 
    axios.get('/users', { params: { role, page } }),
  
  // Get all users with filters
  getUsers: (params = {}) => axios.get('/users', { params })
};
```

## Migration Checklist

- [ ] Update all `GET /users/me` calls to `GET /users?my=true`
- [ ] Update all `GET /users/my-subordinates` calls to `GET /users?subordinates=true`
- [ ] Update all `GET /users/role/:role` calls to `GET /users?role=:role`
- [ ] Update all `GET /users/filter` calls to use appropriate query parameters
- [ ] Test all new query parameter combinations
- [ ] Update error handling for new response formats
- [ ] Update pagination logic if needed
- [ ] Test role-based access control

## Benefits

1. **Consistency**: Single endpoint for all user queries
2. **Flexibility**: Combine multiple filters easily
3. **Performance**: Optimized database queries
4. **Maintainability**: Less code duplication
5. **Extensibility**: Easy to add new filters
6. **Documentation**: Clear API schema with validation

## Support

For questions or issues with the migration, please contact the backend team. 