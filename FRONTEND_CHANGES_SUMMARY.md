# Frontend Changes Summary - Permission & WFH

## 🚨 Critical Changes Required

### 1. Remove `userId` from API Calls (Most Cases)

**❌ OLD WAY (Don't do this):**
```typescript
// Passing userId for managers/users
const response = await permissionApi.getRequests({
  userId: currentUser._id, // ❌ Remove this
  status: 'Pending'
});
```

**✅ NEW WAY (Do this):**
```typescript
// Let backend handle role-based filtering automatically
const response = await permissionApi.getRequests({
  status: 'Pending'
  // No userId needed - backend handles it based on role
});
```

### 2. Update Response Type to Include `meta`

**❌ OLD:**
```typescript
{
  success: boolean;
  data: Permission[];
  total: number;
}
```

**✅ NEW:**
```typescript
{
  success: boolean;
  data: Permission[];
  total: number;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

### 3. Update Service Type Definitions

**Update your service files:**

```typescript
// services/permission.service.ts
getRequests: (query?: PermissionQuery): Promise<ApiResponse<{ 
  data: Permission[]; 
  total: number; 
  meta: { page: number; limit: number; total: number; totalPages: number } 
}>>
```

```typescript
// services/wfh.service.ts
getRequests: (query?: WFHQuery): Promise<ApiResponse<{ 
  data: WFH[]; 
  total: number; 
  meta: { page: number; limit: number; total: number; totalPages: number } 
}>>
```

### 4. Update Components Using Pagination

**❌ OLD:**
```typescript
const totalPages = Math.ceil(response.data.total / limit);
```

**✅ NEW:**
```typescript
const totalPages = response.data.meta?.totalPages || Math.ceil(response.data.total / limit);
```

## How Role-Based Filtering Works

### Automatic Backend Filtering

| User Role | Behavior | Frontend Action |
|-----------|----------|-----------------|
| **Admin/SuperAdmin** | Sees ALL requests | Don't pass `userId` |
| **Manager** | Sees requests assigned to them (`appliedTo._id` matches manager ID) | Don't pass `userId` |
| **Regular User** | Sees only their own requests | Don't pass `userId` |
| **Admin (filtering specific user)** | Sees requests for specific user | Pass `userId` parameter |

### Example Usage

```typescript
// ✅ Regular User - Sees own requests
const userRequests = await permissionApi.getRequests({ status: 'Pending' });

// ✅ Manager - Sees requests assigned to them
const managerRequests = await permissionApi.getRequests({ status: 'Pending' });

// ✅ Admin - Sees all requests
const allRequests = await permissionApi.getRequests({ status: 'Pending' });

// ✅ Admin - Filter for specific user
const userRequests = await permissionApi.getRequests({ 
  userId: 'specific-user-id',
  status: 'Pending' 
});
```

## Migration Checklist

- [ ] Remove `userId` from `getRequests()` calls (unless admin filtering specific user)
- [ ] Update TypeScript types to include `meta` object in response
- [ ] Update pagination logic to use `response.data.meta.totalPages`
- [ ] Test manager view - should see requests assigned to them
- [ ] Test admin view - should see all requests
- [ ] Test regular user view - should see only their own requests
- [ ] Update any components that calculate `totalPages` manually

## Files to Update

1. **Service Files:**
   - `services/permission.service.ts` - Update return types
   - `services/wfh.service.ts` - Update return types

2. **Component Files:**
   - Any component using `permissionApi.getRequests()`
   - Any component using `wfhApi.getRequests()`
   - Pagination components

3. **Store/State Management:**
   - Update state management (Redux/Zustand) if used
   - Update types/interfaces

## Testing

After making changes, verify:

1. ✅ Regular users see only their own requests
2. ✅ Managers see requests assigned to them (where `appliedTo._id` matches manager ID)
3. ✅ Admins see all requests
4. ✅ Admins can filter by specific `userId` when needed
5. ✅ Pagination works correctly with `meta.totalPages`
6. ✅ No console errors related to missing properties

## Need Help?

Refer to the full implementation guide: `PERMISSION_WFH_FRONTEND_IMPLEMENTATION.md`

