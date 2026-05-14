# WFH, Shift Changes & Optional Holidays - Applied-To Endpoint Implementation

## 📋 Overview

This document describes the implementation of the `/applied-to/:appliedTo` endpoint for three modules:
1. **Work From Home (WFH)**
2. **Shift Changes**
3. **Optional Holidays**

These endpoints allow managers/approvers to fetch requests assigned to them, following the same pattern as the existing `/leaves/applied-to/:appliedTo` and `/permissions/applied-to/:appliedTo` endpoints.

---

## ✅ Implementation Summary

All three modules now have the `/applied-to/:appliedTo` endpoint implemented and ready to use!

### **New Endpoints Added:**

1. `GET /api/wfh/applied-to/:appliedTo`
2. `GET /api/shift-changes/applied-to/:appliedTo`
3. `GET /api/optional-holidays/applied-to/:appliedTo`

---

## 🔧 Backend Changes

### 1. WFH Module

#### Service Changes (`src/services/wfh.service.ts`)
- ✅ Added `appliedTo?: string` to `IWFHQuery` interface
- ✅ Added `getWFHsByAppliedTo()` method

#### Route Changes (`src/routes/wfh.routes.ts`)
- ✅ Added `GET /applied-to/:appliedTo` route
- ✅ Imported `IWFHQuery` interface
- ✅ Route placed before `/:id` route to avoid conflicts

---

### 2. Shift Changes Module

#### Service Changes (`src/services/shift-change.service.ts`)
- ✅ Added `IShiftChangeQuery` interface (new)
- ✅ Added `getShiftChangesByAppliedTo()` method
- ✅ Supports aggregation-based search (similar to existing `findAll`)

#### Route Changes (`src/routes/shift-change.routes.ts`)
- ✅ Added `GET /applied-to/:appliedTo` route
- ✅ Imported `IShiftChangeQuery` interface
- ✅ Route placed before `/:id` route

---

### 3. Optional Holidays Module

#### Service Changes (`src/services/optional-holiday.service.ts`)
- ✅ Added `getOptionalHolidaysByAppliedTo()` method
- ✅ `IOptionalHolidayQuery` interface already had `appliedTo` field

#### Route Changes (`src/routes/optional-holiday.routes.ts`)
- ✅ Added `GET /applied-to/:appliedTo` route
- ✅ Imported `IOptionalHolidayQuery` interface
- ✅ Route placed before `/:id` route

---

## 🔌 API Endpoints

### 1. WFH Applied-To Endpoint

```
GET /api/wfh/applied-to/:appliedTo?page=1&limit=5&status=Pending&search=john
```

**URL Parameters:**
- `appliedTo` (required): Manager/Approver ID

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | Filter by specific user ID |
| `status` | string | Filter by status (Pending, Approved, Rejected, Cancelled) |
| `startDate` | string | Start date (YYYY-MM-DD) |
| `endDate` | string | End date (YYYY-MM-DD) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 5) |
| `search` | string | Search by employee name, reason, manager name, or status |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "startDate": "2025-01-15",
      "endDate": "2025-01-17",
      "noOfDays": 3,
      "status": "Pending",
      "reason": "Personal work",
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "appliedTo": {
        "_id": "676a65b0b06ccef51b302d3d",
        "name": "Manager Name"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 5,
    "total": 25,
    "totalPages": 5
  }
}
```

---

### 2. Shift Changes Applied-To Endpoint

```
GET /api/shift-changes/applied-to/:appliedTo?page=1&limit=5&status=Pending
```

**URL Parameters:**
- `appliedTo` (required): Manager/Approver ID

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | Filter by specific user ID |
| `status` | string | Filter by status (Pending, Approved, Rejected, Cancelled) |
| `startDate` | string | Start date (YYYY-MM-DD) |
| `endDate` | string | End date (YYYY-MM-DD) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 5) |
| `search` | string | Search by employee name, reason, manager name, status, or shift names |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "effectiveDate": "2025-02-01",
      "reason": "Need to change shift",
      "status": "Pending",
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "requestedShift": {
        "_id": "...",
        "name": "Night Shift",
        "code": "NS"
      },
      "currentShift": {
        "_id": "...",
        "name": "Day Shift",
        "code": "DS"
      },
      "appliedTo": {
        "_id": "676a65b0b06ccef51b302d3d",
        "name": "Manager Name"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 5,
    "total": 10,
    "totalPages": 2
  }
}
```

---

### 3. Optional Holidays Applied-To Endpoint

```
GET /api/optional-holidays/applied-to/:appliedTo?page=1&limit=5&status=Pending&year=2025
```

**URL Parameters:**
- `appliedTo` (required): Manager/Approver ID

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | Filter by specific user ID |
| `status` | string | Filter by status (Pending, Approved, Rejected, Cancelled) |
| `startDate` | string | Start date (YYYY-MM-DD) |
| `endDate` | string | End date (YYYY-MM-DD) |
| `year` | number | Filter by year |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 5) |
| `search` | string | Search by holiday name, reason, employee name, status, or manager name |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "holidayDate": "2025-01-26",
      "holidayName": "Republic Day",
      "status": "Pending",
      "reason": "Personal",
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "appliedTo": {
        "_id": "676a65b0b06ccef51b302d3d",
        "name": "Manager Name"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 5,
    "total": 15,
    "totalPages": 3
  }
}
```

---

## 💻 Frontend Implementation Required

### 1. WFH Service Updates

Add to your WFH service file:

```typescript
// services/wfh.service.ts

export interface WFHQuery {
  userId?: string;
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  search?: string;  // ✅ ADD THIS
}

export const wfhApi = {
  // ... existing methods ...

  /**
   * ✅ NEW: Get WFH requests assigned to a manager/approver by appliedTo
   */
  getByAppliedTo: (
    appliedToId: string, 
    filters?: WFHQuery
  ): Promise<ApiResponse<{ 
    data: WFH[]; 
    meta: { 
      page: number; 
      limit: number; 
      total: number; 
      totalPages: number 
    } 
  }>> => {
    const params = new URLSearchParams();
    
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.search) params.append('search', filters.search);
    
    return fetchApi(`/wfh/applied-to/${appliedToId}?${params.toString()}`);
  },
};
```

---

### 2. Shift Changes Service Updates

Add to your shift changes service file:

```typescript
// services/shiftChange.service.ts

export interface ShiftChangeQuery {
  userId?: string;
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  search?: string;  // ✅ ADD THIS
}

export const shiftChangeApi = {
  // ... existing methods ...

  /**
   * ✅ NEW: Get shift change requests assigned to a manager/approver by appliedTo
   */
  getByAppliedTo: (
    appliedToId: string, 
    filters?: ShiftChangeQuery
  ): Promise<ApiResponse<{ 
    data: ShiftChangeRequest[]; 
    meta: { 
      page: number; 
      limit: number; 
      total: number; 
      totalPages: number 
    } 
  }>> => {
    const params = new URLSearchParams();
    
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.search) params.append('search', filters.search);
    
    return fetchApi(`/shift-changes/applied-to/${appliedToId}?${params.toString()}`);
  },
};
```

---

### 3. Optional Holidays Service Updates

Add to your optional holidays service file:

```typescript
// services/optionalHoliday.service.ts

export interface OptionalHolidayQuery {
  userId?: string;
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  startDate?: string;
  endDate?: string;
  year?: number;
  page?: number;
  limit?: number;
  search?: string;  // ✅ ADD THIS (if not already present)
}

export const optionalHolidayApi = {
  // ... existing methods ...

  /**
   * ✅ NEW: Get optional holiday requests assigned to a manager/approver by appliedTo
   */
  getByAppliedTo: (
    appliedToId: string, 
    filters?: OptionalHolidayQuery
  ): Promise<ApiResponse<{ 
    data: OptionalHolidayRequest[]; 
    meta: { 
      page: number; 
      limit: number; 
      total: number; 
      totalPages: number 
    } 
  }>> => {
    const params = new URLSearchParams();
    
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.year) params.append('year', filters.year.toString());
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.search) params.append('search', filters.search);
    
    return fetchApi(`/optional-holidays/applied-to/${appliedToId}?${params.toString()}`);
  },
};
```

---

## 📝 Usage Examples

### Example 1: Get WFH Requests for Manager

```typescript
// Get pending WFH requests for a manager
const managerId = '676a65b0b06ccef51b302d3d';
const response = await wfhApi.getByAppliedTo(managerId, {
  status: 'Pending',
  page: 1,
  limit: 10
});

if (response.success) {
  const wfhs = response.data.data;
  const totalPages = response.data.meta.totalPages;
  console.log(`Found ${wfhs.length} WFH requests`);
}
```

---

### Example 2: Get Shift Change Requests for Manager

```typescript
// Get shift change requests for a manager
const managerId = '676a65b0b06ccef51b302d3d';
const response = await shiftChangeApi.getByAppliedTo(managerId, {
  status: 'Pending',
  page: 1,
  limit: 10,
  search: 'john' // Search by employee name or shift name
});

if (response.success) {
  const requests = response.data.data;
  requests.forEach(req => {
    console.log(`${req.user.name} wants to change from ${req.currentShift?.code} to ${req.requestedShift?.code}`);
  });
}
```

---

### Example 3: Get Optional Holiday Requests for Manager

```typescript
// Get optional holiday requests for a manager
const managerId = '676a65b0b06ccef51b302d3d';
const response = await optionalHolidayApi.getByAppliedTo(managerId, {
  status: 'Pending',
  year: 2025,
  page: 1,
  limit: 10
});

if (response.success) {
  const requests = response.data.data;
  requests.forEach(req => {
    console.log(`${req.user.name} requested ${req.holidayName} on ${req.holidayDate}`);
  });
}
```

---

## 🎯 Summary of All Endpoints

| Module | Endpoint | Service Method | Query Interface |
|--------|----------|---------------|-----------------|
| **Leaves** | `/leaves/applied-to/:appliedTo` | `getLeavesByAppliedTo()` | `ILeaveQuery` |
| **Permissions** | `/permissions/applied-to/:appliedTo` | `getPermissionsByAppliedTo()` | `IPermissionQuery` |
| **WFH** | `/wfh/applied-to/:appliedTo` | `getWFHsByAppliedTo()` | `IWFHQuery` |
| **Shift Changes** | `/shift-changes/applied-to/:appliedTo` | `getShiftChangesByAppliedTo()` | `IShiftChangeQuery` |
| **Optional Holidays** | `/optional-holidays/applied-to/:appliedTo` | `getOptionalHolidaysByAppliedTo()` | `IOptionalHolidayQuery` |

All endpoints follow the **same pattern** and support:
- ✅ Filtering by `appliedTo` (manager ID)
- ✅ Optional filters: `userId`, `status`, `startDate`, `endDate`
- ✅ Pagination: `page`, `limit`
- ✅ Search functionality
- ✅ Consistent response format with `data` and `meta`

---

## ✅ Implementation Checklist

### Backend ✅
- [x] WFH service method added
- [x] WFH route added
- [x] Shift Change service method added
- [x] Shift Change route added
- [x] Optional Holiday service method added
- [x] Optional Holiday route added
- [x] All query interfaces updated
- [x] All routes properly ordered (before `/:id`)
- [x] No linter errors

### Frontend (To Do)
- [ ] Add `search` field to WFH query interface
- [ ] Add `getByAppliedTo()` to WFH API service
- [ ] Add `search` field to Shift Change query interface
- [ ] Add `getByAppliedTo()` to Shift Change API service
- [ ] Add `search` field to Optional Holiday query interface (if missing)
- [ ] Add `getByAppliedTo()` to Optional Holiday API service
- [ ] Update components to use new endpoints
- [ ] Test all three endpoints

---

## 🚨 Important Notes

1. **Route Order**: All `/applied-to/:appliedTo` routes are placed **before** `/:id` routes to avoid route conflicts

2. **Consistent Pattern**: All endpoints follow the same pattern as leaves and permissions for consistency

3. **Search Functionality**: 
   - **WFH**: Searches employee name, reason, manager name, status
   - **Shift Changes**: Searches employee name, reason, manager name, status, **shift names/codes**
   - **Optional Holidays**: Searches holiday name, reason, employee name, status, manager name

4. **Date Filtering**:
   - **WFH**: Uses `startDate` and `endDate` (date range)
   - **Shift Changes**: Uses `effectiveDate` with startDate/endDate
   - **Optional Holidays**: Uses `holidayDate` with startDate/endDate

5. **Pagination**: All endpoints return `meta` object with pagination info

---

## 📚 Related Documentation

- [Permission Applied-To Implementation](./PERMISSION_APPLIED_TO_FRONTEND_IMPLEMENTATION.md)
- [Permission & WFH Frontend Guide](./PERMISSION_WFH_FRONTEND_IMPLEMENTATION.md)
- [Shift Change Implementation](./SHIFT_CHANGE_IMPLEMENTATION_COMPLETE.md)
- [Optional Holiday Implementation](./OPTIONAL_HOLIDAY_FRONTEND_IMPLEMENTATION.md)

---

## 🎉 Status: Backend Implementation Complete!

All three endpoints are fully implemented on the backend and ready for frontend integration.

**Endpoints are live and ready to use:**
- ✅ `GET /api/wfh/applied-to/:appliedTo`
- ✅ `GET /api/shift-changes/applied-to/:appliedTo`
- ✅ `GET /api/optional-holidays/applied-to/:appliedTo`

---

*Implementation Date: January 2025*  
*All endpoints follow the same pattern for consistency*

