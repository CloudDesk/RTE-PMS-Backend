# Leave Summary API Documentation & Flow Guide

## Overview
Complete documentation of all leave summary API routes with parameters, payloads, purposes, and detailed flow confirmations.

---

## Table of Contents
1. [Core Rule: One User, One Year, One Leave Summary Record](#core-rule)
2. [Leave Summary Routes](#leave-summary-routes)
3. [Leave Allotment Routes](#leave-allotment-routes)
4. [Leave Release Routes](#leave-release-routes)
5. [Carry Forward Routes](#carry-forward-routes)
6. [Flow Confirmations](#flow-confirmations)
7. [Implementation Details](#implementation-details)

---

## Core Rule: One User, One Year, One Leave Summary Record

**Enforced by:** Unique compound index `{ userId: 1, year: 1 }` in `leave-summary.model.ts`

- One user has exactly one leave summary record per year
- All operations automatically create leave summary records if they don't exist
- All flows respect this rule and use `getLeaveSummary()` which guarantees record creation

---

## Leave Summary Routes

### 1. Get Leave Summary
- **Method:** `GET`
- **Route:** `/leave-summary/summary/:userId`
- **Path Parameters:**
  - `userId` (string, required): Employee ID
- **Query Parameters:**
  - `year` (number, optional): Year to get summary for (defaults to current year)
- **Purpose:** Get leave summary showing alloted, availed, and remaining days for all leave types
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "userId": "676a65b0b06ccef51b302d3d",
      "year": 2025,
      "annual": { 
        "alloted": 12, 
        "availed": 5, 
        "remaining": 7,
        "leaveRequests": ["693026f7c67f6d2827ebc42f"]
      },
      "sick": { 
        "alloted": 6, 
        "availed": 2, 
        "remaining": 4,
        "leaveRequests": []
      },
      "compOff": { 
        "alloted": 0, 
        "availed": 0, 
        "remaining": 0,
        "leaveRequests": []
      },
      "lossOfPay": { 
        "alloted": 0, 
        "availed": 0, 
        "remaining": 0,
        "leaveRequests": []
      },
      "otherPaid": { 
        "alloted": 0, 
        "availed": 0, 
        "remaining": 0,
        "leaveRequests": []
      },
      "otherUnpaid": { 
        "alloted": 0, 
        "availed": 0, 
        "remaining": 0,
        "leaveRequests": []
      },
      "maternity": { 
        "alloted": 0, 
        "availed": 0, 
        "remaining": 0,
        "leaveRequests": []
      },
      "workFromHome": { 
        "alloted": 0, 
        "availed": 0, 
        "remaining": 0,
        "leaveRequests": []
      }
    }
  }
  ```

### 2. Get Multiple Users Leave Summaries
- **Method:** `GET`
- **Route:** `/leave-summary/leave-summaries`
- **Query Parameters:**
  - `userIds` (string, required): Comma-separated list of user IDs
  - `year` (number, optional): Year to get summaries for (defaults to current year)
- **Purpose:** Get leave summaries for multiple users at once
- **Response:**
  ```json
  [
    {
      "userId": {
        "_id": "676a65b0b06ccef51b302d3d",
        "name": "Employee Name",
        "email": "employee@example.com"
      },
      "year": 2025,
      "annual": { "alloted": 12, "availed": 5, "remaining": 7 },
      "sick": { "alloted": 6, "availed": 2, "remaining": 4 },
      // ... other leave types
    }
  ]
  ```

---

## Leave Allotment Routes

### 3. Update Leave Allotments
- **Method:** `POST`
- **Route:** `/leave-summary/allotments`
- **Path Parameters:** None
- **Query Parameters:** None
- **Request Body:**
  ```json
  {
    "userId": "employeeId123",
    "year": 2025,
    "annual": 12,
    "sick": 6,
    "compOff": 0,
    "lossOfPay": 0,
    "otherPaid": 0,
    "otherUnpaid": 0,
    "maternity": 0,
    "workFromHome": 0
  }
  ```
- **Purpose:** Update leave allotments for an employee for a specific year. Creates leave summary record if it doesn't exist.
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "userId": "employeeId123",
      "year": 2025,
      "annual": { "alloted": 12, "availed": 0, "remaining": 12 },
      "sick": { "alloted": 6, "availed": 0, "remaining": 6 },
      "compOff": { "alloted": 0, "availed": 0, "remaining": 0 },
      "lossOfPay": { "alloted": 0, "availed": 0, "remaining": 0 },
      "otherPaid": { "alloted": 0, "availed": 0, "remaining": 0 },
      "otherUnpaid": { "alloted": 0, "availed": 0, "remaining": 0 },
      "maternity": { "alloted": 0, "availed": 0, "remaining": 0 },
      "workFromHome": { "alloted": 0, "availed": 0, "remaining": 0 }
    }
  }
  ```

#### Flow Steps (Allotment)
1. ✅ Calls `getLeaveSummary(userId, year)` 
   - **If record exists:** Returns existing record
   - **If record doesn't exist:** Creates new record with all zeros
2. ✅ Updates `alloted` for specified leave types
3. ✅ Pre-save hook calculates `remaining = alloted - availed`
4. ✅ Saves leave summary record
5. ✅ Sends email notification (unless `skipEmail: true`)

#### ✅ Confirmation
- **Creates leave summary if not exists:** ✅ YES (via `getLeaveSummary`)
- **Updates if exists:** ✅ YES
- **Year Source:** From request body `year` field
- **One user, one year, one record:** ✅ ENFORCED

---

## Leave Release Routes

### 4. Release Leaves
- **Method:** `POST`
- **Route:** `/leave-summary/release`
- **Path Parameters:** None
- **Query Parameters:** None
- **Request Body:**
  ```json
  {
    "employeeIds": ["employeeId1", "employeeId2", "employeeId3"],
    "releaseType": "monthly" | "quarterly",  // Note: "carryforward" is automatically created during carry-forward operations
    "period": {
      "year": 2025,
      "month": 1,        // Required if releaseType === "monthly" (1-12)
      "quarter": 1       // Required if releaseType === "quarterly" (1-4)
    },
    "leaveType": "annual" | "sick" | "compOff" | "lossOfPay" | "otherPaid" | "otherUnpaid",
    "daysReleased": 4.5,  // Decimal value supported (e.g., 0.5, 1.5, 4.5)
    "notes": "Optional notes string"  // Optional
  }
  ```
- **Purpose:** Release leaves to multiple employees for a specific period (monthly or quarterly). Only available for India employees. Adds to existing balance.
- **Note:** Carry-forward operations automatically create `LeaveRelease` records with `releaseType: "carryforward"` and `period.year: toYear` for tracking purposes.
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "success": 5,  // Number of successful releases
      "failed": [    // Array of failed releases (if any)
        {
          "employeeId": "emp123",
          "error": "Error message"
        }
      ],
      "releases": [
        {
          "_id": "releaseId",
          "employeeId": "employeeId1",
          "releaseType": "monthly",
          "period": { "year": 2025, "month": 1 },
          "leaveType": "annual",
          "daysReleased": 4.5,
          "releasedBy": "adminUserId",
          "releasedAt": "2025-01-15T10:30:00Z",
          "notes": "Optional notes"
        }
      ]
    }
  }
  ```

#### ✅ Year Field in Model
**Confirmed:** `period.year` exists in `leave-release.model.ts` (line 9)
```typescript
period: {
  month?: number;      // 1-12 (required for monthly)
  quarter?: number;    // 1-4 (required for quarterly)
  year: number;        // ✅ REQUIRED - Used for leave summary creation
  // For carryforward: year represents toYear (year the leaves are carried forward to)
}
```

**Schema:**
```typescript
period: {
  month: { type: Number, min: 1, max: 12, required: function() { return this.releaseType === 'monthly'; } },
  quarter: { type: Number, min: 1, max: 4, required: function() { return this.releaseType === 'quarterly'; } },
  year: { type: Number, required: true }  // ✅ REQUIRED, inside period object
  // For carryforward: month and quarter are not set, only year (toYear) is used
}
```

**Release Types:**
- `monthly`: Requires `period.month` (1-12)
- `quarterly`: Requires `period.quarter` (1-4)
- `carryforward`: Only requires `period.year` (represents toYear). Automatically created during carry-forward operations.

#### Flow Steps (Release)
1. ✅ Validates India country (`country === 'IN'`)
2. ✅ For each employee:
   - Calls `getLeaveSummary(employeeId, period.year)` 
     - **If record exists:** Returns existing record
     - **If record doesn't exist:** Creates new record with all zeros
   - Gets current `alloted` balance
   - Calculates `newAlloted = currentAlloted + daysReleased` (ADDS to existing)
   - Calls `updateLeaveAllotments(employeeId, period.year, { [leaveType]: newAlloted })`
   - Creates `LeaveRelease` record (with `period.year`)
   - Sends release-specific email

#### Flow Steps (Carry-Forward - Creates LeaveRelease Record)
When carry-forward is processed, it also creates a `LeaveRelease` record for tracking:
1. ✅ Creates `LeaveCarryForward` record (primary audit trail)
2. ✅ Creates `LeaveRelease` record with:
   - `releaseType: "carryforward"`
   - `period.year: toYear` (year the leaves are carried forward to)
   - `daysReleased: daysCarriedForward`
   - `leaveType: leaveType`
   - `notes: "Carried forward from {fromYear}"` (or custom notes)
3. ✅ This allows carry-forward to appear in release history alongside monthly/quarterly releases

#### ✅ Usage in Code
**Service Usage (lines 78-92 in `leave-release.service.ts`):**
```typescript
// Get current leave summary for the year
const currentSummary = await this.leaveSummaryService.getLeaveSummary(
  new Types.ObjectId(employeeId),
  period.year  // ✅ CORRECT: Using period.year
);

// Update leave summary
await this.leaveSummaryService.updateLeaveAllotments(
  new Types.ObjectId(employeeId),
  period.year,  // ✅ CORRECT: Using period.year
  {
    [leaveType]: newAlloted
  },
  { skipEmail: true }
);
```

**MongoDB Query (line 164-180 in `leave-release.service.ts`):**
```typescript
async getReleaseHistory(
  employeeId: string,
  year?: number,
  yearLessThan?: number
): Promise<ILeaveRelease[]> {
  const query: any = {
    employeeId: new Types.ObjectId(employeeId)
  };

  // If exact year is provided, use it (takes precedence)
  if (year) {
    query['period.year'] = year;  // ✅ CORRECT: MongoDB dot notation for nested field
  } else if (yearLessThan) {
    // If yearLessThan is provided, filter by period.year <= yearLessThan
    // $lte means "less than or equal to"
    // Example: yearLessThan=2020 returns 2020, 2019, 2018, 2017, and all earlier years
    query['period.year'] = { $lte: yearLessThan };  // ✅ Returns all years <= yearLessThan
  }

  return await LeaveRelease.find(query)
    .populate('releasedBy', 'name email')
    .sort({ releasedAt: -1 })
    .lean();
}
```

**MongoDB Index (line 73 in `leave-release.model.ts`):**
```typescript
leaveReleaseSchema.index({ employeeId: 1, 'period.year': -1 });
```

#### ✅ Confirmation
- **Year in model:** ✅ YES (`period.year` - line 9 in `leave-release.model.ts`)
- **Creates leave summary if not exists:** ✅ YES (via `getLeaveSummary(employeeId, period.year)`)
- **Uses `period.year` for leave summary:** ✅ YES (line 80 in `leave-release.service.ts`)
- **Updates if exists:** ✅ YES
- **Year Source:** From request body `period.year` field
- **One user, one year, one record:** ✅ ENFORCED

### 5. Get Leave Release History for Employee
- **Method:** `GET`
- **Route:** `/leave-summary/release-history/:userId`
- **Path Parameters:**
  - `userId` (string, required): Employee ID
- **Query Parameters:**
  - `year` (number, optional): Filter by exact year (e.g., `2025`). Takes precedence over `yearLessThan` if both are provided.
  - `yearLessThan` (number, optional): Filter by years less than or equal to this value. Uses MongoDB `$lte` operator (less than or equal to). Useful for viewing older year data.
- **Purpose:** Get leave release history for a specific employee. Can filter by exact year or by years less than/equal to a specified value.
- **Filter Behavior:**
  - If `year` is provided: Returns records for that exact year only
  - If `yearLessThan` is provided (and `year` is not): Returns all records where `period.year <= yearLessThan` (includes the specified year and all years before it)
  - If neither is provided: Returns all records for the employee
- **Examples:**
  - `?year=2025` - Returns only 2025 records
  - `?yearLessThan=2020` - Returns all records where `period.year <= 2020` (includes: 2020, 2019, 2018, 2017, and all earlier years)
  - `?yearLessThan=2020&year=2025` - Returns only 2025 records (exact year takes precedence)
- **Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "releaseId",
        "employeeId": "employeeId",
        "releaseType": "monthly",
        "period": {
          "year": 2025,
          "month": 1
        },
        "leaveType": "annual",
        "daysReleased": 4.5,
        "releasedBy": {
          "_id": "userId",
          "name": "Admin Name",
          "email": "admin@example.com"
        },
        "releasedAt": "2025-01-15T10:30:00Z",
        "notes": "Optional notes"
      }
    ]
  }
  ```

### 6. Get All Leave Releases (Admin Only)
- **Method:** `GET`
- **Route:** `/leave-summary/releases`
- **Path Parameters:** None
- **Query Parameters:**
  - `page` (number, optional): Page number (default: 1)
  - `limit` (number, optional): Items per page (default: 50, max: 100)
  - `search` (string, optional): Search query (searches employee name, email, employee code, leave type, release type, or notes)
  - `year` (number, optional): Filter by exact year. Takes precedence over `yearLessThan` if both are provided.
  - `yearLessThan` (number, optional): Filter by years less than or equal to this value (e.g., `2021` returns all records where `period.year <= 2021` - includes 2021, 2020, 2019, and all earlier years). Useful for viewing older year data.
  - `leaveType` (string, optional): Filter by leave type (`annual`, `sick`, `compOff`, `lossOfPay`, `otherPaid`, `otherUnpaid`)
  - `releaseType` (string, optional): Filter by release type (`monthly`, `quarterly`, `carryforward`)
  - `employeeId` (string, optional): Filter by employee ID
- **Filter Behavior:**
  - If `year` is provided: Returns records for that exact year only
  - If `yearLessThan` is provided (and `year` is not): Returns all records where `period.year <= yearLessThan`
  - If both `year` and `yearLessThan` are provided: `year` takes precedence (exact match)
- **Purpose:** Get paginated list of all leave releases with filtering and search capabilities. Admin only.
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "releases": [
        {
          "_id": "releaseId",
          "employeeId": {
            "_id": "employeeId",
            "name": "Employee Name",
            "email": "employee@example.com",
            "employeeCode": "EMP001",
            "country": "IN"
          },
          "releaseType": "monthly",
          "period": {
            "year": 2025,
            "month": 1
          },
          "leaveType": "annual",
          "daysReleased": 4.5,
          "releasedBy": {
            "_id": "userId",
            "name": "Admin Name",
            "email": "admin@example.com"
          },
          "releasedAt": "2025-01-15T10:30:00Z",
          "notes": "Optional notes"
        }
      ],
      "total": 100,
      "page": 1,
      "limit": 50,
      "totalPages": 2
    }
  }
  ```

---

## Carry Forward Routes

### 7. Get Carry-Forward Balance
- **Method:** `GET`
- **Route:** `/leave-summary/carry-forward-balance/:userId`
- **Path Parameters:**
  - `userId` (string, required): Employee ID
- **Query Parameters:**
  - `year` (number, required): Year to check balance for (e.g., `2024`)
- **Purpose:** Get available leave balance for carry-forward for a specific employee and year. Used for both single employee selection and batch validation. India only.
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "annual": 5.0,
      "sick": 2.5,
      "compOff": 0.0,
      "lossOfPay": 0.0,
      "otherPaid": 0.0,
      "otherUnpaid": 0.0
    }
  }
  ```

### 8. Single Employee Carry-Forward
- **Method:** `POST`
- **Route:** `/leave-summary/carry-forward`
- **Path Parameters:** None
- **Query Parameters:** None
- **Request Body:**
  ```json
  {
    "employeeId": "employeeId123",
    "fromYear": 2024,
    "toYear": 2025,
    "leaveType": "annual" | "sick" | "compOff" | "lossOfPay" | "otherPaid" | "otherUnpaid",
    "daysCarriedForward": 3.0,  // Decimal value supported
    "notes": "Optional notes string"  // Optional
  }
  ```
- **Purpose:** Carry forward leave balance from one year to the next for a single employee. Only available for India employees.
- **Validation:**
  - `toYear` must equal `fromYear + 1`
  - `daysCarriedForward` must be > 0
  - Employee must have balance > 0
  - `daysCarriedForward` cannot exceed available balance
  - Cannot carry forward if already processed for same leave type and years
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "_id": "carryForwardId",
      "employeeId": "employeeId123",
      "fromYear": 2024,
      "toYear": 2025,
      "leaveType": "annual",
      "balanceBefore": 10.0,
      "daysCarriedForward": 3.0,
      "daysForfeited": 7.0,
      "processedBy": "adminUserId",
      "processedAt": "2025-01-15T10:30:00Z",
      "notes": "Optional notes"
    }
  }
  ```

#### Flow Steps (Carry-Forward)

##### FROM YEAR (2024)
1. ✅ Calls `getLeaveSummary(employeeId, fromYear)`
   - **If record exists:** Returns existing record
   - **If record doesn't exist:** Creates new record with all zeros
2. ✅ Validates balance > 0
3. ✅ Validates `daysCarriedForward <= balanceBefore`
4. ✅ Creates `LeaveCarryForward` record (primary audit trail)
5. ✅ Reduces `remaining` balance (keeps `alloted` unchanged)
6. ✅ Updates `LeaveSummary` for fromYear

##### TO YEAR (2025)
1. ✅ Calls `getLeaveSummary(employeeId, toYear)`
   - **If record exists:** Returns existing record
   - **If record doesn't exist:** Creates new record with all zeros
2. ✅ Increases `alloted` by `daysCarriedForward`
3. ✅ Calls `updateLeaveAllotments(employeeId, toYear, { [leaveType]: increasedAlloted })`
4. ✅ Creates `LeaveRelease` record with:
   - `releaseType: "carryforward"`
   - `period.year: toYear` (2025 in this example)
   - `daysReleased: daysCarriedForward`
   - This allows carry-forward to appear in release history

#### ✅ Confirmation
- **FROM YEAR: Creates if not exists:** ✅ YES (line 65-68 in `leave-carry-forward.service.ts`)
- **TO YEAR: Creates if not exists:** ✅ YES (line 181-184 in `leave-carry-forward.service.ts`)
- **FROM YEAR: Updates if exists:** ✅ YES
- **TO YEAR: Updates if exists:** ✅ YES
- **Year Source:** From request body `fromYear` and `toYear` fields
- **One user, one year, one record:** ✅ ENFORCED (for both years)
- **LeaveRelease Record Created:** ✅ YES (for toYear with `releaseType: "carryforward"`)
  - Allows carry-forward to appear in release history
  - `period.year` is set to `toYear` (the year the leaves are carried forward to)

### 9. Batch Carry-Forward
- **Method:** `POST`
- **Route:** `/leave-summary/carry-forward/batch`
- **Path Parameters:** None
- **Query Parameters:** None
- **Request Body:**
  ```json
  {
    "employees": [
      {
        "employeeId": "employeeId1",
        "leaveType": "annual",
        "daysCarriedForward": 3.0
      },
      {
        "employeeId": "employeeId2",
        "leaveType": "annual",
        "daysCarriedForward": 3.0
      }
      // ... more employees
    ],
    "fromYear": 2024,
    "toYear": 2025,
    "notes": "Optional notes string"  // Optional
  }
  ```
- **Purpose:** Carry forward leave balance for multiple employees at once with the same settings. Only available for India employees.
- **Validation:**
  - `toYear` must equal `fromYear + 1`
  - `daysCarriedForward` must be > 0 for each employee
  - All employees must have balance > 0
  - All employees must have balance >= `daysCarriedForward`
  - Balance validation is performed before submission
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "success": 5,  // Number of successful carry-forwards
      "failed": [    // Array of failed carry-forwards (if any)
        {
          "employeeId": "emp123",
          "leaveType": "annual",
          "error": "Error message"
        }
      ],
      "carryForwards": [
        {
          "_id": "carryForwardId",
          "employeeId": "employeeId1",
          "fromYear": 2024,
          "toYear": 2025,
          "leaveType": "annual",
          "balanceBefore": 10.0,
          "daysCarriedForward": 3.0,
          "daysForfeited": 7.0
        }
      ]
    }
  }
  ```

### 10. Get Carry-Forward Details for Employee
- **Method:** `GET`
- **Route:** `/leave-summary/carry-forward/:userId`
- **Path Parameters:**
  - `userId` (string, required): Employee ID
- **Query Parameters:**
  - `fromYear` (number, optional): Filter by from year
  - `toYear` (number, optional): Filter by to year
- **Purpose:** Get carry-forward details for a specific employee. Can filter by years. India only.
- **Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "_id": "carryForwardId",
        "employeeId": "employeeId",
        "fromYear": 2024,
        "toYear": 2025,
        "leaveType": "annual",
        "balanceBefore": 10.0,
        "daysCarriedForward": 3.0,
        "daysForfeited": 7.0,
        "processedBy": {
          "_id": "userId",
          "name": "Admin Name",
          "email": "admin@example.com"
        },
        "processedAt": "2025-01-15T10:30:00Z",
        "notes": "Optional notes"
      }
    ]
  }
  ```

### 11. Get All Carry-Forwards (Admin Only)
- **Method:** `GET`
- **Route:** `/leave-summary/carry-forwards`
- **Path Parameters:** None
- **Query Parameters:**
  - `page` (number, optional): Page number (default: 1)
  - `limit` (number, optional): Items per page (default: 50, max: 100)
  - `search` (string, optional): Search query (searches employee name, email, employee code, leave type, notes, or year)
  - `fromYear` (number, optional): Filter by exact from year. Takes precedence over `yearLessThan` if both are provided.
  - `toYear` (number, optional): Filter by to year
  - `yearLessThan` (number, optional): Filter by from years less than or equal to this value (e.g., `2021` returns all carry-forwards where `fromYear <= 2021` - includes 2021, 2020, 2019, and all earlier years). Useful for viewing older year data.
  - `leaveType` (string, optional): Filter by leave type (`annual`, `sick`, `compOff`, `lossOfPay`, `otherPaid`, `otherUnpaid`)
  - `employeeId` (string, optional): Filter by employee ID
- **Filter Behavior:**
  - If `fromYear` is provided: Returns carry-forwards for that exact from year only
  - If `yearLessThan` is provided (and `fromYear` is not): Returns all carry-forwards where `fromYear <= yearLessThan`
  - If both `fromYear` and `yearLessThan` are provided: `fromYear` takes precedence (exact match)
- **Examples:**
  - `?fromYear=2024` - Returns only carry-forwards from 2024
  - `?yearLessThan=2021` - Returns all carry-forwards where `fromYear <= 2021` (2021, 2020, 2019, etc.)
  - `?yearLessThan=2021&fromYear=2024` - Returns only carry-forwards from 2024 (exact year takes precedence)
- **Purpose:** Get paginated list of all carry-forwards with filtering and search capabilities. Admin only.
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "carryForwards": [
        {
          "_id": "carryForwardId",
          "employeeId": {
            "_id": "employeeId",
            "name": "Employee Name",
            "email": "employee@example.com",
            "employeeCode": "EMP001",
            "country": "IN"
          },
          "fromYear": 2024,
          "toYear": 2025,
          "leaveType": "annual",
          "balanceBefore": 5.0,
          "daysCarriedForward": 3.0,
          "daysForfeited": 2.0,
          "processedBy": {
            "_id": "userId",
            "name": "Admin Name",
            "email": "admin@example.com"
          },
          "processedAt": "2025-01-15T10:30:00Z",
          "notes": "Optional notes"
        }
      ],
      "total": 50,
      "page": 1,
      "limit": 50,
      "totalPages": 1
    }
  }
  ```

---

## Flow Confirmations

### Summary: All Flows Verified ✅

#### ✅ Flow 1: Leave Allotment
- **Route:** `POST /leave-summary/allotments`
- **Creates/Updates:** ✅ YES (via `getLeaveSummary`)
- **Year Source:** From request body `year` field
- **One user, one year, one record:** ✅ ENFORCED

#### ✅ Flow 2: Leave Release
- **Route:** `POST /leave-summary/release`
- **Creates/Updates:** ✅ YES (via `getLeaveSummary`)
- **Year Source:** From request body `period.year` field
- **Year in Model:** ✅ YES (`period.year` in `leave-release.model.ts` line 9)
- **One user, one year, one record:** ✅ ENFORCED

#### ✅ Flow 3: Leave Carry-Forward
- **Route:** `POST /leave-summary/carry-forward`
- **FROM YEAR: Creates/Updates:** ✅ YES (via `getLeaveSummary`)
- **TO YEAR: Creates/Updates:** ✅ YES (via `getLeaveSummary`)
- **Year Source:** From request body `fromYear` and `toYear` fields
- **One user, one year, one record:** ✅ ENFORCED (for both years)

---

## Implementation Details

### `getLeaveSummary()` Method
**Location:** `src/services/leave-summary.service.ts` (lines 144-173)

**Behavior:**
```typescript
async getLeaveSummary(userId: Types.ObjectId, year: number): Promise<ILeaveSummary> {
  let summary = await LeaveSummary.findOne({ userId, year });
  if (!summary) {
    // ✅ CREATES record if not exists
    summary = await LeaveSummary.create({
      userId,
      year,
      annual: { alloted: 0, availed: 0, remaining: 0, leaveRequests: [] },
      // ... all other leave types with zeros
    });
  }
  return summary; // ✅ ALWAYS returns a record (never null)
}
```

**Guarantee:** Always returns a leave summary record (creates if not exists)

### `updateLeaveAllotments()` Method
**Location:** `src/services/leave-summary.service.ts` (lines 231-330)

**Behavior:**
1. Calls `getLeaveSummary()` first (ensures record exists)
2. Updates only specified leave types
3. Pre-save hook calculates `remaining`
4. Saves record

**Guarantee:** Record always exists before update

### Data Integrity Guarantees

#### ✅ One User, One Year, One Record
- **Enforced by:** Unique index `{ userId: 1, year: 1 }`
- **Verified in:** All three flows call `getLeaveSummary()` which creates if not exists

#### ✅ Record Creation
- **Allotment:** Creates via `getLeaveSummary(userId, year)` ✅
- **Release:** Creates via `getLeaveSummary(employeeId, period.year)` ✅
- **Carry-Forward FROM:** Creates via `getLeaveSummary(employeeId, fromYear)` ✅
- **Carry-Forward TO:** Creates via `getLeaveSummary(employeeId, toYear)` ✅

#### ✅ Year Source Verification
- **Allotment:** `year` from request body ✅
- **Release:** `period.year` from request body ✅ (stored in model)
- **Carry-Forward FROM:** `fromYear` from request body ✅
- **Carry-Forward TO:** `toYear` from request body ✅

---

## Summary Table

| # | Method | Route | Purpose | Country Restriction |
|---|--------|-------|---------|---------------------|
| 1 | GET | `/leave-summary/summary/:userId?year={year}` | Get leave summary | None |
| 2 | GET | `/leave-summary/leave-summaries?userIds={ids}&year={year}` | Get multiple users summaries | None |
| 3 | POST | `/leave-summary/allotments` | Update leave allotments | None |
| 4 | POST | `/leave-summary/release` | Release leaves to employees | India only |
| 5 | GET | `/leave-summary/release-history/:userId?year={year}&yearLessThan={year}` | Get release history for employee | India only |
| 6 | GET | `/leave-summary/releases?{filters}` | Get all leave releases | Admin only |
| 7 | GET | `/leave-summary/carry-forward-balance/:userId?year={year}` | Get carry-forward balance | India only |
| 8 | POST | `/leave-summary/carry-forward` | Single employee carry-forward | India only |
| 9 | POST | `/leave-summary/carry-forward/batch` | Batch carry-forward | India only |
| 10 | GET | `/leave-summary/carry-forward/:userId?fromYear={year}&toYear={year}` | Get carry-forward details | India only |
| 11 | GET | `/leave-summary/carry-forwards?{filters}` | Get all carry-forwards | Admin only |

---

## Notes

1. **Country Restrictions:**
   - Leave release and carry-forward operations are only available for India employees (`country === 'IN'`)
   - Leave allotments work for all countries

2. **Decimal Support:**
   - `daysReleased` and `daysCarriedForward` support decimal values (e.g., 0.5, 1.5, 4.5)

3. **Admin Routes:**
   - Routes 6 and 11 (Get All Releases/Carry-Forwards) require admin role

4. **Validation:**
   - Carry-forward operations require `toYear === fromYear + 1`
   - Balance validation is performed before batch carry-forward operations

5. **Pagination:**
   - List routes (6 and 11) support pagination with `page` and `limit` query parameters

6. **Search:**
   - List routes support search functionality that searches employee name, email, employee code, and other relevant fields

7. **Year Filtering:**
   - Leave summary: Use `?year=2025` query parameter (defaults to current year)
   - Release history: 
     - Use `?year=2025` for exact year filtering (optional, returns all if not provided)
     - Use `?yearLessThan=2020` to get all records where `period.year <= 2020` (includes 2020, 2019, 2018, and all earlier years - useful for viewing older year data)
     - If both `year` and `yearLessThan` are provided, `year` takes precedence

8. **Record Creation:**
   - All operations automatically create leave summary records if they don't exist for the specified user and year
   - One user has one leave summary record per year (enforced by unique index)

9. **Leave Release Year Field:**
   - `year` is nested inside `period` object: `period.year`
   - Used correctly in all service methods and MongoDB queries
   - MongoDB queries use dot notation: `query['period.year']`
   - Index uses dot notation: `{ employeeId: 1, 'period.year': -1 }`

---

## Changes from Previous Version

### ✅ Removed:
- **UAE-specific fields:** All allocation date and expiry date fields have been removed
  - Removed: `annualAllocationDate`, `sickAllocationDate`, `compOffAllocationDate`, `maternityAllocationDate`, `workFromHomeAllocationDate`
  - Removed: `annualExpiryDate`, `sickExpiryDate`, `compOffExpiryDate`, `maternityExpiryDate`, `workFromHomeExpiryDate`
  - Removed: `originalExpiryDate`, `manuallyAdjusted` fields from response

### ✅ Added/Updated:
- **Leave Summary Response:** Now includes `leaveRequests` array in each leave type category
- **Year Filtering:** Both leave summary and release history support year filtering via query parameter
- **Multiple Users Summary:** Route for getting summaries for multiple users at once

### ✅ Improved:
- **Record Creation:** All operations now automatically create leave summary records if they don't exist
- **Data Integrity:** One user, one year, one record rule is strictly enforced
- **Response Format:** Consistent response format across all endpoints

---

## Conclusion

### ✅ All Flows Are Correctly Implemented

1. **Leave Allotment:** Creates/updates leave summary for user/year ✅
2. **Leave Release:** Creates/updates leave summary using `period.year` ✅
3. **Leave Carry-Forward:** Creates/updates leave summary for both `fromYear` and `toYear` ✅

### ✅ Year Field Confirmation
- **Leave Release Model:** `period.year` exists and is required ✅
- **All flows use year correctly:** ✅

### ✅ One User, One Year, One Record
- **Enforced by unique index:** ✅
- **All flows respect this rule:** ✅

**All implementations are correct and production-ready!** ✅
