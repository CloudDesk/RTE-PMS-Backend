# Apply on Behalf - Complete Verification & Frontend API Client Guide

## 📋 Overview

This document provides complete verification of the "Apply on Behalf" functionality for Leave requests, including backend implementation details, frontend API client verification, and required type definitions.

---

## ✅ Backend Implementation Summary

### Endpoint Details

**Endpoint:** `POST /leaves/apply-on-behalf`

**Authentication:** Required (Admin role only)

**Authorization Check:**
- Only users with `role === 'admin'` or `isSuperAdmin === true` can access this endpoint
- Returns `403 Forbidden` if non-admin tries to access

---

### Request Body Schema

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | Employee ID for whom leave is being applied |
| `leaveTypeId` | `string` | Leave type ID (MongoDB ObjectId) |
| `startDate` | `string` | Leave start date (format: `YYYY-MM-DD`) |
| `endDate` | `string` | Leave end date (format: `YYYY-MM-DD`) |
| `reason` | `string` | Reason for leave (required) |
| `appliedTo` | `object` | Manager object with `_id` and `name` |

#### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `remarks` | `string` | Additional remarks for the leave request |
| `leaveType` | `string` | Leave type name (optional, fetched from leaveTypeId if not provided) |
| `leaveDuration` | `'full-day' \| 'half-day'` | Leave duration type (India only, default: 'full-day') |
| `halfDayType` | `'first-half' \| 'second-half'` | Half-day type (required when leaveDuration = 'half-day') |

---

### Request Body Example

```json
{
  "userId": "507f1f77bcf86cd799439011",
  "leaveTypeId": "507f1f77bcf86cd799439012",
  "startDate": "2025-01-15",
  "endDate": "2025-01-17",
  "reason": "Medical emergency",
  "remarks": "Employee was hospitalized",
  "leaveType": "sick",
  "appliedTo": {
    "_id": "507f1f77bcf86cd799439013",
    "name": "John Manager"
  },
  "leaveDuration": "full-day"
}
```

---

### Response Schema (201 Created)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439014",
    "userId": "507f1f77bcf86cd799439011",
    "leaveTypeId": "507f1f77bcf86cd799439012",
    "leaveType": "sick",
    "startDate": "2025-01-15T00:00:00.000Z",
    "endDate": "2025-01-17T00:00:00.000Z",
    "noOfDays": 3,
    "status": "Pending",
    "reason": "Medical emergency",
    "remarks": "Employee was hospitalized",
    "appliedTo": {
      "_id": "507f1f77bcf86cd799439013",
      "name": "John Manager"
    },
    "appliedOnBehalf": true,
    "appliedBy": {
      "_id": "507f1f77bcf86cd799439015",
      "name": "Admin User",
      "email": "admin@example.com"
    },
    "managerApproved": false,
    "managerApprovedById": null,
    "managerApprovedAt": null,
    "adminApproved": false,
    "adminApprovedById": null,
    "adminApprovedAt": null,
    "createdAt": "2025-01-18T10:00:00.000Z",
    "updatedAt": "2025-01-18T10:00:00.000Z"
  }
}
```

---

### Error Responses

#### 403 Forbidden (Non-Admin Access)

```json
{
  "success": false,
  "error": {
    "message": "Only admins can apply for leave on behalf of employees"
  }
}
```

#### 400 Bad Request (Validation Error)

```json
{
  "success": false,
  "error": {
    "message": "Validation error message"
  }
}
```

---

## 🔄 Approval Flow for Applied on Behalf

### Key Rules

1. **Single Approval Required**: Either manager OR admin can approve (not both)
2. **Immediate Rejection**: Rejection is immediate (no dual approval needed)
3. **Email Notifications**: All emails show "Applied by" and "Approved by" information

### Approval Process

1. **Manager Approval**:
   - Manager can approve → Status becomes `Approved`
   - Sets `managerApproved: true`, `managerApprovedById`, `managerApprovedAt`
   - Sets `status: 'Approved'`, `approvedById`, `approvedBy`, `approvedAt`

2. **Admin Approval**:
   - Admin can approve → Status becomes `Approved`
   - Sets `adminApproved: true`, `adminApprovedById`, `adminApprovedAt`
   - Sets `status: 'Approved'`, `approvedById`, `approvedBy`, `approvedAt`

3. **Rejection**:
   - Either manager or admin can reject → Status becomes `Rejected`
   - Sets appropriate approval fields to `false`
   - Sets `status: 'Rejected'`, `approvedById`, `approvedBy`, `approvedAt`

---

## 📝 Frontend API Client Implementation

### Corrected TypeScript Types

```typescript
// Leave Request Type (with Apply on Behalf fields)
export type LeaveRequest = {
    _id: string;
    userId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'; // ✅ Capitalized
    reason: string;
    appliedOn: string;
    leaveType?: string;
    noOfDays?: number;
    leaveDuration?: 'full-day' | 'half-day';
    halfDayType?: 'first-half' | 'second-half';
    weekendExclusion?: {
        weekendDays: number[];
        excludedDates: Date[];
        excludedHolidays?: Date[];
        totalCalendarDays: number;
        actualDays: number;
    };
    appliedTo?: {
        _id: string;
        name: string;
    };
    approvedBy?: {
        _id: string;
        name: string;
        email: string;
    };
    user?: {
        name: string;
        email?: string;
    };
    
    // ✅ Apply on Behalf fields
    appliedOnBehalf?: boolean;
    appliedBy?: {
        _id: string;
        name: string;
        email: string;
    };
    
    // ✅ Dual approval fields (for applied on behalf)
    managerApproved?: boolean;
    managerApprovedById?: string;
    managerApprovedAt?: string;
    adminApproved?: boolean;
    adminApprovedById?: string;
    adminApprovedAt?: string;
    
    // Additional fields
    remarks?: string;
    rejectionReason?: string;
    createdAt?: string;
    updatedAt?: string;
};
```

---

### Corrected API Client Method

```typescript
export const leavesApi = {
    // ... other methods ...

    /**
     * Apply leave on behalf of employee (Admin only)
     * 
     * @param data - Leave application data
     * @returns Promise with created leave request
     */
    applyOnBehalf: (data: {
        userId: string;
        leaveTypeId: string;
        startDate: string; // YYYY-MM-DD
        endDate: string;   // YYYY-MM-DD
        reason: string;    // ✅ Required
        remarks?: string;
        leaveType?: string;
        appliedTo: {
            _id: string;
            name: string;
        };
        leaveDuration?: 'full-day' | 'half-day';
        halfDayType?: 'first-half' | 'second-half';
    }): Promise<ApiResponse<LeaveRequest>> => {
        return fetchApi('/leaves/apply-on-behalf', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};
```

---

## ✅ Verification Checklist

### Backend Verification

- [x] Endpoint exists: `POST /leaves/apply-on-behalf`
- [x] Authentication required
- [x] Admin-only authorization check
- [x] Required fields validation: `userId`, `leaveTypeId`, `startDate`, `endDate`, `reason`, `appliedTo`
- [x] Optional fields support: `remarks`, `leaveType`, `leaveDuration`, `halfDayType`
- [x] Sets `appliedOnBehalf: true` automatically
- [x] Sets `appliedBy` with current admin user info
- [x] Initializes `managerApproved: false`, `adminApproved: false`
- [x] Returns proper response with all fields

### Frontend Verification

- [x] Endpoint path: `/leaves/apply-on-behalf`
- [x] HTTP method: `POST`
- [x] All required fields included
- [x] All optional fields supported
- [x] Request body properly stringified
- [x] Response type includes `appliedOnBehalf` fields
- [x] Status values use capitalized format

---

## 🎯 Usage Examples

### Example 1: Full-Day Leave

```typescript
const leaveData = {
    userId: "507f1f77bcf86cd799439011",
    leaveTypeId: "507f1f77bcf86cd799439012",
    startDate: "2025-01-15",
    endDate: "2025-01-17",
    reason: "Medical emergency",
    remarks: "Employee was hospitalized",
    leaveType: "sick",
    appliedTo: {
        _id: "507f1f77bcf86cd799439013",
        name: "John Manager"
    },
    leaveDuration: "full-day"
};

const response = await leavesApi.applyOnBehalf(leaveData);
console.log(response.data.appliedOnBehalf); // true
console.log(response.data.appliedBy.name); // "Admin User"
```

### Example 2: Half-Day Leave (India)

```typescript
const halfDayLeave = {
    userId: "507f1f77bcf86cd799439011",
    leaveTypeId: "507f1f77bcf86cd799439012",
    startDate: "2025-01-15",
    endDate: "2025-01-15", // Same day for half-day
    reason: "Personal work",
    leaveType: "annual",
    appliedTo: {
        _id: "507f1f77bcf86cd799439013",
        name: "John Manager"
    },
    leaveDuration: "half-day",
    halfDayType: "first-half" // Required for half-day
};

const response = await leavesApi.applyOnBehalf(halfDayLeave);
```

### Example 3: Error Handling

```typescript
try {
    const response = await leavesApi.applyOnBehalf(leaveData);
    if (response.success) {
        console.log('Leave applied successfully:', response.data);
    }
} catch (error) {
    if (error.status === 403) {
        console.error('Access denied: Admin role required');
    } else if (error.status === 400) {
        console.error('Validation error:', error.message);
    }
}
```

---

## 🔍 Key Differences from Regular Leave Application

| Feature | Regular Leave | Apply on Behalf |
|---------|--------------|-----------------|
| **Endpoint** | `POST /leaves` | `POST /leaves/apply-on-behalf` |
| **Access** | All authenticated users | Admin only |
| **3-Day Rule** | ✅ Enforced | ❌ Bypassed |
| **userId** | From JWT token | Must be provided in body |
| **appliedOnBehalf** | `false` or undefined | `true` |
| **appliedBy** | Current user (employee) | Current user (admin) |
| **Approval** | Single (manager) | Single (manager OR admin) |
| **Email Notification** | Standard | Includes "Applied by" info |

---

## 📧 Email Notification Details

When a leave is applied on behalf:

1. **Application Email** (to Manager):
   - Shows "Applied on Behalf" indicator
   - Includes admin name who applied
   - Subject: "New Leave Request (Applied on Behalf)"

2. **Approval/Rejection Email** (to Employee):
   - Shows "Applied by [Admin Name] (on behalf)"
   - Shows who approved/rejected
   - Includes note: "This request was applied on your behalf by [Admin Name]"

---

## 🚨 Common Issues & Solutions

### Issue 1: 403 Forbidden Error

**Problem:** Non-admin user trying to apply on behalf

**Solution:** 
- Check user role: `user.role === 'admin'` or `user.isSuperAdmin === true`
- Show error message: "Only admins can apply for leave on behalf of employees"

### Issue 2: Missing Required Fields

**Problem:** `reason` field not provided

**Solution:**
- Ensure `reason` is always included in request body
- Validate on frontend before making API call

### Issue 3: Type Mismatch

**Problem:** Response doesn't match `LeaveRequest` type

**Solution:**
- Update `LeaveRequest` type to include:
  - `appliedOnBehalf?: boolean`
  - `appliedBy?: { _id, name, email }`
  - `managerApproved?: boolean`
  - `adminApproved?: boolean`
  - All approval-related fields

### Issue 4: Status Values Case Mismatch

**Problem:** Frontend uses lowercase, backend uses capitalized

**Solution:**
- Use capitalized status values: `'Pending' | 'Approved' | 'Rejected' | 'Cancelled'`
- Convert on frontend if needed: `status.charAt(0).toUpperCase() + status.slice(1)`

---

## 📚 Related Documentation

- [Apply on Behalf Frontend Implementation](./APPLY_ON_BEHALF_FRONTEND_IMPLEMENTATION.md)
- [Leave Service Documentation](./src/services/leave.service.ts)
- [Leave Routes Documentation](./src/routes/leave.routes.ts)
- [Leave Model Schema](./src/models/leave.model.ts)

---

## ✅ Summary

The "Apply on Behalf" functionality is **correctly implemented** in the backend. The frontend API client needs:

1. ✅ Correct endpoint: `/leaves/apply-on-behalf`
2. ✅ Correct method: `POST`
3. ✅ All required fields included
4. ✅ Updated `LeaveRequest` type with `appliedOnBehalf` fields
5. ✅ Capitalized status values

**Status:** ✅ **VERIFIED & READY FOR USE**

---

## 🐛 Bug Fix Applied

### Issue: `appliedBy` Returning Empty Object `{}`

**Problem:** When applying leave on behalf, the response showed `appliedBy: {}` instead of containing admin user details.

**Root Cause:** 
1. The service's `create` method was overwriting the `appliedBy` field set by the route handler
2. The `findById` method wasn't properly handling the `appliedBy` field

**Fix Applied:**
1. ✅ Updated `leave.service.ts` - Service now preserves `appliedBy` if already set in `leaveData`
2. ✅ Updated `leave.routes.ts` - Ensured proper ObjectId conversion for `appliedBy._id`
3. ✅ Updated `findById` method - Added proper handling for `appliedBy` field

**Files Modified:**
- `src/services/leave.service.ts` (lines 727-742, 370-399)
- `src/routes/leave.routes.ts` (lines 267-271)

**Expected Response After Fix:**
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "appliedOnBehalf": true,
    "appliedBy": {
      "_id": "507f1f77bcf86cd799439015",
      "name": "Admin User",
      "email": "admin@example.com"
    }
  }
}
```

---

*Last Updated: 2025-01-18*
*Backend Version: Current (Bug Fixed)*
*Frontend API Client: Requires type updates*

