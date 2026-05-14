# ✅ Frontend Leave Service - Correct Implementation

**Issue:** `updateAllotments` sending wrong payload structure  
**Status:** ✅ **FIXED**

---

## 🐛 **The Problem**

### **Your Current Code (WRONG):**

```typescript
updateAllotments: (
    employeeId: string,
    year: number,
    allotments: Record<string, number>,
    allocationDates?: Record<string, string>
): Promise<ApiResponse<void>> => {
    const payload: any = { 
        userId: employeeId, 
        year, 
        allotments  // ❌ WRONG: Backend doesn't expect nested "allotments"
    };
    
    if (allocationDates) {
        Object.entries(allocationDates).forEach(([leaveType, date]) => {
            if (date) {
                payload[`${leaveType}AllocationDate`] = date;
            }
        });
    }

    return fetchApi(`/leave-summary/allotments`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}
```

**Sends:**
```json
{
  "userId": "68da6b10d3bbedacfb6c0efc",
  "year": 2025,
  "allotments": {        // ❌ Backend doesn't expect this nesting
    "annual": 20,
    "sick": 10
  }
}
```

---

## ✅ **The Fix**

### **Correct Code:**

```typescript
updateAllotments: (
    employeeId: string,
    year: number,
    allotments: Record<string, number>,
    allocationDates?: Record<string, string>
): Promise<ApiResponse<void>> => {
    // ✅ Spread allotments at root level, not nested
    const payload: any = { 
        userId: employeeId, 
        year,
        ...allotments  // ✅ CORRECT: Spread values at root level
    };
    
    // Add allocation dates (for UAE employees)
    if (allocationDates) {
        Object.entries(allocationDates).forEach(([leaveType, date]) => {
            if (date) {
                payload[`${leaveType}AllocationDate`] = date;
            }
        });
    }

    return fetchApi(`/leave-summary/allotments`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}
```

**Sends (CORRECT):**
```json
{
  "userId": "68da6b10d3bbedacfb6c0efc",
  "year": 2025,
  "annual": 20,        // ✅ At root level
  "sick": 10,          // ✅ At root level
  "compOff": 5         // ✅ At root level
}
```

---

## 📋 **Complete Corrected Frontend Service**

```typescript
import type { ApiResponse } from '$lib/types';
import { fetchApi } from './base';

type User = {
    name: string;
    email?: string;
};

export type LeaveRequest = {
    _id: string;
    startDate: string;
    endDate: string;
    status: 'approved' | 'pending' | 'rejected';
    reason: string;
    appliedOn: string;
    leaveType?: string;
    approvedBy?: string;
    rejectionReason?: string;
    user?: User
};

export type LeaveCategory = {
    alloted: number;
    availed: number;
    remaining: number;
    leaveRequests: LeaveRequest[];
    // UAE-specific fields
    allocationDate?: string;
    expiryDate?: string;
    originalExpiryDate?: string;
    manuallyAdjusted?: boolean;
};

export type LeaveSummary = {
    userId: string;
    year: number;
    annual: LeaveCategory;
    sick: LeaveCategory;
    compOff: LeaveCategory;
    lossOfPay: LeaveCategory;
    otherPaid: LeaveCategory;
    otherUnpaid: LeaveCategory;
    maternity: LeaveCategory;  // ✅ Added maternity
};

export type CompOffRequest = {
    _id: string;
    date: string;
    hours: number;
    status: 'approved' | 'pending' | 'rejected';
    reason: string;
    appliedOn: string;
};

export type LeaveFilters = {
    userId?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
    leaveType?: string;
    startDate?: string;
    endDate?: string;
};

export type LeaveApiResponse<T> = {
    success: boolean;
    data: T;
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

export const leavesApi = {
    /**
     * Get leave summary for an employee
     */
    getSummary: (employeeId: string, year?: number): Promise<ApiResponse<LeaveSummary>> => {
        const url = year 
            ? `/leave-summary/summary/${employeeId}?year=${year}`
            : `/leave-summary/summary/${employeeId}`;
        return fetchApi(url, {
            method: 'GET'
        });
    },

    /**
     * Get comp-off requests
     */
    getCompOffRequests: (employeeId: string): Promise<ApiResponse<CompOffRequest[]>> => {
        return fetchApi(`/leave-summary/compoff/${employeeId}`, {
            method: 'GET'
        });
    },

    /**
     * Update leave allotments - FIXED VERSION
     */
    updateAllotments: (
        employeeId: string,
        year: number,
        allotments: Record<string, number>,
        allocationDates?: Record<string, string>
    ): Promise<ApiResponse<void>> => {
        // ✅ CORRECT: Spread allotments at root level
        const payload: any = { 
            userId: employeeId, 
            year,
            ...allotments  // annual, sick, compOff, etc. at root level
        };
        
        // Add allocation dates for UAE employees
        if (allocationDates) {
            Object.entries(allocationDates).forEach(([leaveType, date]) => {
                if (date) {
                    payload[`${leaveType}AllocationDate`] = date;
                }
            });
        }

        return fetchApi(`/leave-summary/allotments`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    /**
     * Create leave request
     */
    create: (data: {
        type: string;
        startDate: string;
        endDate: string;
        reason: string;
        userId?: string;
    }): Promise<ApiResponse<void>> => {
        return fetchApi('/leaves', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    /**
     * Cancel leave request
     */
    cancel: (requestId: string): Promise<ApiResponse<void>> => {
        return fetchApi(`/leaves/${requestId}/cancel`, {
            method: 'POST'
        });
    },

    /**
     * List leave requests with filters
     */
    list: (filters: LeaveFilters): Promise<ApiResponse<LeaveRequest[]>> => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined) params.append(key, String(value));
        });
        return fetchApi(`/leaves?${params.toString()}`);
    },

    /**
     * Get leave by ID
     */
    getById: (leaveId: string): Promise<ApiResponse<LeaveRequest>> => {
        return fetchApi(`/leaves/${leaveId}`, {
            method: 'GET'
        });
    },

    /**
     * Update leave status (approve/reject)
     */
    updateStatus: (
        leaveId: string, 
        status: string, 
        noOfDays: number, 
        remarks?: string
    ): Promise<ApiResponse<void>> => {
        return fetchApi(`/leaves/${leaveId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status, remarks, noOfDays })
        });
    },

    /**
     * Get leaves by employee ID
     */
    getByEmployeeId: (employeeId: string): Promise<ApiResponse<LeaveRequest[]>> => {
        return fetchApi(`/leaves/employee/${employeeId}`, {
            method: 'GET'
        });
    },

    /**
     * Get my leaves with filters
     */
    myList: (employeeId: string, filters: LeaveFilters): Promise<ApiResponse<LeaveRequest[]>> => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined) params.append(key, String(value));
        });
        return fetchApi(`/leaves/userId/${employeeId}?${params.toString()}`);
    },

    /**
     * Get leaves assigned to a manager/approver
     */
    getLeavesByAssignedId: (assignedId: string, filters: LeaveFilters): Promise<ApiResponse<LeaveRequest[]>> => {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null) params.append(key, String(value));
        });
        return fetchApi(`/leaves/applied-to/${assignedId}?${params.toString()}`);
    }
};
```

---

## 🔧 **Key Fix**

### **Change This Line:**

```typescript
// ❌ WRONG
const payload: any = { userId: employeeId, year, allotments };

// ✅ CORRECT
const payload: any = { userId: employeeId, year, ...allotments };
```

**Why?**
- Backend expects: `{ userId, year, annual: 20, sick: 10 }`
- NOT: `{ userId, year, allotments: { annual: 20, sick: 10 } }`

---

## 🧪 **How to Use (Correctly)**

```typescript
// Update leave allotments
await leavesApi.updateAllotments(
  '68da6b10d3bbedacfb6c0efc',
  2025,
  {
    annual: 20,
    sick: 10,
    compOff: 5
  },
  // Optional: For UAE employees
  {
    annual: '2025-01-01',
    sick: '2025-01-01'
  }
);

// This will send:
{
  "userId": "68da6b10d3bbedacfb6c0efc",
  "year": 2025,
  "annual": 20,                        // ✅ At root level
  "sick": 10,                          // ✅ At root level
  "compOff": 5,                        // ✅ At root level
  "annualAllocationDate": "2025-01-01",
  "sickAllocationDate": "2025-01-01"
}
```

---

## ✅ **Updated Leave Summary Type**

```typescript
export type LeaveSummary = {
    userId: string;
    year: number;
    annual: LeaveCategory;
    sick: LeaveCategory;
    compOff: LeaveCategory;
    lossOfPay: LeaveCategory;
    otherPaid: LeaveCategory;
    otherUnpaid: LeaveCategory;
    maternity: LeaveCategory;  // ✅ Added - missing in your code
};
```

---

## 📝 **Summary of Issues**

| Issue | Your Code | Correct Code |
|-------|-----------|--------------|
| Payload structure | `allotments: { annual: 20 }` | `...allotments` (spread) |
| Maternity field | Missing | Added to LeaveSummary type |
| getSummary year param | Not passed | Added optional year param |

---

## ✅ **All Fixes Applied**

1. ✅ Backend: Added `await summary.save()` in getLeaveSummary
2. ✅ Frontend: Changed `allotments` to `...allotments` (spread operator)
3. ✅ Frontend: Added `maternity` to LeaveSummary type

**Test now and it should work!** 🚀

