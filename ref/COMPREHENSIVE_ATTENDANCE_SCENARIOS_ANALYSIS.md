# Comprehensive Attendance Scenarios Analysis

## Executive Summary

This document provides a deep and correct analysis of all attendance scenarios, verifying alignment with actual service implementations and documenting what happens to attendance records and regularization records in each case.

---

## Table of Contents

1. [Swipes In/Out - First, Second, Third Time](#1-swipes-inout---first-second-third-time)
2. [Leave Apply/Approve/Reject](#2-leave-applyapprovereject)
3. [Attendance Regularization](#3-attendance-regularization)
4. [Restricted Holiday / Optional Holiday](#4-restricted-holiday--optional-holiday)
5. [Holiday Swipe](#5-holiday-swipe)
6. [Weekend Swipe](#6-weekend-swipe)
7. [WFH (Work From Home)](#7-wfh-work-from-home)
8. [Attendance Override](#8-attendance-override)
9. [Comp Off Apply](#9-comp-off-apply)
10. [Half Day Leave + Half Day Swipe](#10-half-day-leave--half-day-swipe)

---

## 1. Swipes In/Out - First, Second, Third Time

### Location
- **Service**: `src/services/biometric-attendance.service.ts`
- **Methods**: `processSwipe()`, `findOrCreateAttendanceRecord()`, `processFirstSwipe()`, `processSecondSwipe()`, `processMultipleSwipes()`

### 1.1 First Swipe (IN)

**What Happens**:
1. System finds or creates attendance record
2. If record doesn't exist → Creates new record with empty swipes
3. Adds first swipe (IN) to swipes array
4. Sets `firstIn` timestamp
5. Pre-save hook sets `status: 'incomplete'` (1 swipe)
6. Sets `attendanceStatus: ['Late']` or `['On-Time']` based on entry time

**Attendance Record**:
- **Record Exists**: Updates existing record
- **Record Doesn't Exist**: Creates new record
- **status**: `'incomplete'` (pre-save hook)
- **attendanceStatus**: `['Late']` or `['On-Time']`
- **swipes**: `[{timestamp, direction: 'IN', deviceId: 'biometric', location}]`
- **firstIn**: Set to swipe timestamp
- **lastOut**: `null`
- **needsRegularization**: `true`

**Regularization Record**: ❌ **NOT CREATED** (only created when employee requests regularization)

---

### 1.2 Second Swipe (OUT)

**What Happens**:
1. Adds second swipe (OUT) to swipes array
2. Sets `lastOut` timestamp
3. Calculates attendance metrics (work hours, break hours, etc.)
4. Pre-save hook sets `status: 'complete'` (exactly 2 swipes)
5. Adds `'Present'` to `attendanceStatus` (if valid working day)
6. Adds `'Early-Exit'` if applicable

**Attendance Record**:
- **Record Exists**: Updates existing record ✅
- **status**: `'complete'` (pre-save hook)
- **attendanceStatus**: 
  - Base: `['Present']` ✅ (for valid working days)
  - If late: `['Late', 'Present']`
  - If early exit: `['Late', 'Present', 'Early-Exit']` or `['On-Time', 'Present', 'Early-Exit']`
  - If OT: `['Present', 'OT']`
- **swipes**: `[{IN}, {OUT}]`
- **firstIn**: First swipe timestamp
- **lastOut**: Second swipe timestamp
- **needsRegularization**: Based on late/early/shortfall/window violations

**Regularization Record**: ❌ **NOT CREATED** (only created when employee requests regularization)

**Note**: `'Present'` is **ONLY** added for valid working days. For holiday swipes, `'Present'` is **NOT** added.

---

### 1.3 Third Swipe and Beyond

**What Happens**:
1. Adds additional swipe to swipes array
2. Recalculates `firstIn` and `lastOut` from all swipes
3. Uses multiple swipe metrics calculation
4. Pre-save hook sets `status: 'duplicate_swipes'` (3+ swipes)
5. Adds `'Present'` to `attendanceStatus` if not already present

**Attendance Record**:
- **Record Exists**: Updates existing record ✅
- **status**: `'duplicate_swipes'` (pre-save hook)
- **attendanceStatus**: 
  - Base: `['Present']` ✅ (for valid working days)
  - Preserves existing statuses (`'Late'`, `'Early-Exit'`, etc.)
- **swipes**: `[{IN}, {OUT}, {IN}, {OUT}, ...]` (all swipes preserved)
- **firstIn**: Earliest IN swipe
- **lastOut**: Latest OUT swipe
- **needsRegularization**: Based on late/early/shortfall/window violations

**Regularization Record**: ❌ **NOT CREATED** (only created when employee requests regularization)

---

## 2. Leave Apply/Approve/Reject

### Location
- **Service**: `src/services/leave.service.ts`
- **Method**: `updateStatus()` (lines 1325-1753)

### 2.1 Leave Apply (Status: Pending)

**What Happens**:
- Leave request is created with status `'Pending'`
- **NO attendance record is created or updated** at this stage
- Attendance records are only created/updated when leave is **Approved**

**Attendance Record**: ❌ **NO ACTION**

**Regularization Record**: ❌ **NOT CREATED**

---

### 2.2 Leave Approve

**What Happens**:
1. System iterates through each day in leave date range
2. For each day:
   - Checks if attendance record exists
   - If record exists → Updates it
   - If record doesn't exist → Creates new record (via `upsert: true`)

**Attendance Record**:

#### Case A: Record EXISTS

**Regular Leave (or Restricted Holiday without swipes)**:
- **status**: Set to `'leave_swipe'` ✅ (line 1681)
- **attendanceStatus**: `['On-Leave']`
- **swipes**: Preserved (if exist)
- **firstIn/lastOut**: Preserved (if exist)
- **halfType**: Set if half-day leave (line 1685)

**Restricted Holiday WITH Swipes**:
- **status**: `'holiday_swipe'`
- **attendanceStatus**: `['Holiday-Swipe']`
- **swipes**: Preserved
- **regularization**: Auto-regularized (lines 1648-1666)

#### Case B: Record Does NOT Exist

**Regular Leave (or Restricted Holiday without swipes)**:
- **Record Created**: ✅ (via `upsert: true`)
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['On-Leave']`
- **swipes**: `[]` (empty)
- **firstIn/lastOut**: `null`
- **halfType**: Set if half-day leave

**Restricted Holiday WITH Swipes**:
- This case doesn't apply (if swipes exist, record must exist)

**Regularization Record**: ❌ **NOT CREATED** (regularization is only for attendance corrections, not for leaves)

**Note**: Leave approval **creates/updates attendance records** but does **NOT** create regularization records.

---

### 2.3 Leave Reject/Cancel

**What Happens**:
1. System finds attendance records linked to the leave (`leaveRequestId`)
2. Updates only records that have `leaveRequestId` matching rejected leave
3. If no record exists → No action (no upsert)

**Attendance Record**:

#### Case A: Record EXISTS with `leaveRequestId`

- **status**: (unchanged)
- **attendanceStatus**: `['Absent']` (replaces previous values)
- **leaveRequestId**: Removed (line 1719)

#### Case B: Record Does NOT Exist

- ❌ **NO ACTION** (no upsert on rejection)

**Regularization Record**: ❌ **NOT CREATED**

---

## 3. Attendance Regularization

### Location
- **Service**: `src/services/attendance-regularization.service.ts`
- **Methods**: `createRegularization()`, `createBulkRegularization()`, `updateRegularizationStatus()`

### 3.1 Regularization Request Creation

**What Happens**:
1. Employee creates regularization request
2. **AttendanceRegularization record is CREATED** ✅ (separate collection)
3. Attendance record is updated to link to regularization

**Attendance Record**:

#### Case A: Record EXISTS

**Code Location**: `createRegularization()` (lines 297-330)

- **Record Updated**: ✅
- **status**: Set to `'pending_regularization'` ✅ (if not special status)
- **attendanceStatus**: (unchanged, but may have `'Pending-Regularization'` added in bulk)
- **regularization.hasRegularizationRequest**: `true`
- **regularization.isRegularized**: `false`
- **regularization.status**: `'Pending'`
- **regularization.regularizationId**: Linked to `AttendanceRegularization` record

#### Case B: Record Does NOT Exist

**Code Location**: `createBulkRegularization()` (lines 520-540)

- **Record Created**: ✅ (only in bulk regularization)
- **status**: `'incomplete'` (new record)
- **attendanceStatus**: `['Pending-Regularization']`
- **swipes**: `[]` (empty)
- **regularization**: Linked to `AttendanceRegularization` record

**Regularization Record**: ✅ **CREATED**
- **Collection**: `AttendanceRegularization`
- **Fields**: `attendanceId`, `from`, `to`, `shiftDay`, `reason`, `status: 'Pending'`, `approver`, `userId`
- **Purpose**: Tracks the regularization request separately from attendance record

---

### 3.2 Regularization Approval

**What Happens**:
1. Manager/Admin approves regularization request
2. **AttendanceRegularization record is UPDATED** ✅ (`status: 'Approved'`)
3. Attendance record is updated with regularization times

**Attendance Record**:

- **Record Updated**: ✅ (must exist - linked via `attendanceId`)
- **status**: Set to `'complete'` ✅ (line 1091)
- **attendanceStatus**: 
  - Removed: `'Pending-Regularization'`
  - Added: `'Regularized'`, `'Present'` ✅
  - Preserved: Other existing statuses
- **swipes**: 
  - If existing biometric swipes → Preserved (if 3+ swipes)
  - Otherwise → Replaced with regularization swipes (from `regularization.from` and `regularization.to`)
- **firstIn**: Set to `regularization.from`
- **lastOut**: Set to `regularization.to`
- **regularization.isRegularized**: `true`
- **regularization.status**: `'Approved'`
- **needsRegularization**: `false`

**Regularization Record**: ✅ **UPDATED**
- **status**: `'Approved'`
- **approvedDate**: Set to current date

**Note**: Regularization approval **updates both** attendance record and regularization record.

---

### 3.3 Regularization Rejection

**What Happens**:
1. Manager/Admin rejects regularization request
2. **AttendanceRegularization record is UPDATED** ✅ (`status: 'Rejected-Absent'` or `'Rejected-Leave'`)
3. Attendance record is updated

**Attendance Record**:

- **Record Updated**: ✅ (must exist)
- **status**: (unchanged)
- **attendanceStatus**: 
  - Removed: `'Pending-Regularization'`
  - Added: `'Absent'` (or `'On-Leave'` if leave balance exists)
- **regularization.isRegularized**: `false`
- **regularization.status**: `'Rejected-Absent'` or `'Rejected-Leave'`
- **Time fields**: Reset to `'00:00:00'`

**Regularization Record**: ✅ **UPDATED**
- **status**: `'Rejected-Absent'` or `'Rejected-Leave'`
- **comments**: Rejection reason

---

### 3.4 Regularization Withdrawal

**What Happens**:
1. Employee withdraws pending regularization request
2. **AttendanceRegularization record is UPDATED** ✅ (`status: 'Withdrawn'`)
3. Attendance record is updated to remove regularization link

**Attendance Record**:

- **Record Updated**: ✅ (must exist)
- **status**: (unchanged)
- **attendanceStatus**: `'Pending-Regularization'` removed
- **regularization**: `undefined` (cleared)
- **needsRegularization**: `true`

**Regularization Record**: ✅ **UPDATED**
- **status**: `'Withdrawn'`

---

## 4. Restricted Holiday / Optional Holiday

### Location
- **Service**: `src/services/optional-holiday.service.ts` and `src/services/leave.service.ts`
- **Method**: `updateStatus()` in both services

### 4.1 Restricted Holiday Apply (Status: Pending)

**What Happens**:
- Optional holiday request is created with status `'Pending'`
- **NO attendance record is created or updated** at this stage

**Attendance Record**: ❌ **NO ACTION**

**Regularization Record**: ❌ **NOT CREATED**

---

### 4.2 Restricted Holiday Approve

**What Happens**:
1. System checks if attendance record exists for the date
2. If record exists AND has swipes → Updates record
3. If record exists but NO swipes → Updates record (via leave service)
4. If record doesn't exist → Creates record (via leave service with `upsert: true`)

**Attendance Record**:

#### Case A: Record EXISTS with Swipes

**Code Location**: `optional-holiday.service.ts:593-621`

- **Record Updated**: ✅
- **status**: `'holiday_swipe'` ✅
- **attendanceStatus**: Includes `'Holiday-Swipe'` ✅
- **swipes**: Preserved
- **regularization**: Auto-regularized (lines 600-618)
  - `isRegularized: true`
  - `hasRegularizationRequest: false`
  - `status: 'Approved'`
  - `regularizationType: ['Holiday-Swipe']`

#### Case B: Record EXISTS without Swipes

**Code Location**: `leave.service.ts:1680-1687` (handled as regular leave)

- **Record Updated**: ✅
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['On-Leave']`

#### Case C: Record Does NOT Exist

**Code Location**: `leave.service.ts:1689-1698` (via `upsert: true`)

- **Record Created**: ✅
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['On-Leave']`
- **swipes**: `[]` (empty)

**Regularization Record**: ❌ **NOT CREATED** (regularization object is set in attendance record, but no separate `AttendanceRegularization` record is created)

**Note**: For restricted holidays with swipes, the `regularization` object in attendance record is set, but this is **NOT** a separate `AttendanceRegularization` record. It's just metadata in the attendance record.

---

### 4.3 Restricted Holiday Reject

**What Happens**:
- Optional holiday request status changed to `'Rejected'`
- **NO attendance record update** (only `OptionalHolidayRequest` status updated)

**Attendance Record**: ❌ **NO ACTION**

**Regularization Record**: ❌ **NOT CREATED**

---

## 5. Holiday Swipe

### Location
- **Service**: `src/services/biometric-attendance.service.ts`
- **Method**: `findOrCreateAttendanceRecord()` (lines 375-437)

### 5.1 Holiday Swipe - First Swipe

**What Happens**:
1. System detects holiday during swipe processing
2. Checks if it's actually a holiday (for optional holidays, checks if approved)
3. If holiday → Sets holiday status immediately

**Attendance Record**:

#### Case A: Record EXISTS

- **Record Updated**: ✅
- **status**: `'holiday_swipe'` ✅
- **attendanceStatus**: `['Holiday-Swipe']` ✅ (does NOT include `'Present'`)
- **swipes**: First swipe added
- **regularization**: Auto-regularized (lines 407-415)
  - `isRegularized: true`
  - `hasRegularizationRequest: false`
  - `status: 'Approved'`
  - `regularizationType: ['Holiday-Swipe']`

#### Case B: Record Does NOT Exist

- **Record Created**: ✅ (with holiday status)
- **status**: `'holiday_swipe'` ✅
- **attendanceStatus**: `['Holiday-Swipe']` ✅
- **swipes**: First swipe added
- **regularization**: Auto-regularized

**Regularization Record**: ❌ **NOT CREATED** (regularization object is set in attendance record, but no separate `AttendanceRegularization` record)

**Note**: Even if employee completes both IN and OUT swipes on holiday, `'Present'` is **NOT** added. Status remains `['Holiday-Swipe']` only.

---

### 5.2 Holiday Swipe - Second Swipe

**What Happens**:
1. Second swipe is added to swipes array
2. `firstIn` and `lastOut` are updated
3. **`'Present'` is NOT added** (holiday swipes don't get `'Present'` status)

**Attendance Record**:

- **Record Updated**: ✅
- **status**: `'holiday_swipe'` (preserved - special status)
- **attendanceStatus**: `['Holiday-Swipe']` ✅ (does NOT include `'Present'`)
- **swipes**: `[{IN}, {OUT}]`
- **firstIn**: First swipe timestamp
- **lastOut**: Second swipe timestamp

**Regularization Record**: ❌ **NOT CREATED**

---

## 6. Weekend Swipe

### Location
- **Service**: `src/services/biometric-attendance.service.ts`
- **Method**: `processSwipe()`, `findOrCreateAttendanceRecord()`

### 6.1 Weekend Swipe - First Swipe

**What Happens**:
1. System processes swipe normally
2. Weekend detection happens in bulk upload, not in real-time swipe processing
3. For real-time swipes, weekend is not automatically detected as holiday

**Attendance Record**:

#### Case A: Record EXISTS

- **Record Updated**: ✅
- **status**: `'incomplete'` (pre-save hook)
- **attendanceStatus**: `['Late']` or `['On-Time']`
- **swipes**: First swipe added
- **isWeekend**: Not set automatically (only in bulk upload)

#### Case B: Record Does NOT Exist

- **Record Created**: ✅
- **status**: `'incomplete'` (pre-save hook)
- **attendanceStatus**: `['Late']` or `['On-Time']`
- **swipes**: First swipe added

**Regularization Record**: ❌ **NOT CREATED**

**Note**: Weekend swipes are processed as normal swipes. Weekend detection with `'Holiday-Swipe'` status is only done in bulk upload service (line 1200-1205).

---

### 6.2 Weekend Swipe - Second Swipe

**What Happens**:
1. Second swipe is added
2. Status set to `'complete'`
3. `'Present'` is added (weekend swipes are treated as normal attendance)

**Attendance Record**:

- **Record Updated**: ✅
- **status**: `'complete'` (pre-save hook)
- **attendanceStatus**: `['Present']` ✅ (weekend swipes get `'Present'` status)
- **swipes**: `[{IN}, {OUT}]`

**Regularization Record**: ❌ **NOT CREATED**

**Note**: Unlike holiday swipes, weekend swipes **DO** get `'Present'` status because weekends are not automatically treated as holidays in real-time processing.

---

## 7. WFH (Work From Home)

### Location
- **Service**: `src/services/wfh.service.ts` and `src/services/leave.service.ts`

### 7.1 WFH Apply/Approve/Reject

**What Happens**:
- WFH is tracked separately in `WFH` collection
- WFH can also be applied as a leave type (`leaveType: 'wfh'` or `'work from home'`)

**Attendance Record**:

#### Case A: WFH as Leave Type (via Leave Service)

**Code Location**: `leave.service.ts:1667-1678`

- **Record Created/Updated**: ✅ (via leave approval)
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['Present']` ✅ (WFH counts as Present, not On-Leave)
- **isWFH**: `true`
- **halfType**: Set if half-day WFH

#### Case B: WFH as Separate Service

- **NO attendance record operations** ❌
- WFH is tracked in `WFH` collection only
- Does not create or update attendance records

**Regularization Record**: ❌ **NOT CREATED**

**Note**: WFH only affects attendance records if applied as a leave type. The separate WFH service does not interact with attendance records.

---

## 8. Attendance Override

### Location
- **Service**: `src/services/attendance-override.service.ts`
- **Method**: `createOverride()`, `updateOverride()`, `removeOverride()`

### 8.1 Override Creation

**What Happens**:
1. Admin creates override for attendance
2. System finds or creates attendance record
3. Original values stored in `override` object
4. Record updated with override values

**Attendance Record**:

#### Case A: Record EXISTS

- **Record Updated**: ✅
- **status**: `'overridden'` (except On-Leave → `'leave_swipe'`)
- **attendanceStatus**: Must include `'Override'` + target status
- **swipes**: Replaced with override swipes (or empty for Absent/Holiday)
- **regularization**: Cleared (override takes precedence)
- **override**: Original values stored

#### Case B: Record Does NOT Exist

- **Record Created**: ✅
- **status**: `'overridden'` (except On-Leave → `'leave_swipe'`, Absent new → `'incomplete'`)
- **attendanceStatus**: Must include `'Override'` + target status
- **swipes**: Override swipes (or empty)
- **override**: Original values are `undefined`/empty (new record)

**Regularization Record**: ❌ **NOT CREATED** (override replaces regularization)

**Note**: Override **clears** regularization object. If override is removed, original values can be restored.

---

### 8.2 Override Update

**What Happens**:
1. Admin modifies existing override
2. Attendance record updated with new override values
3. History entry added

**Attendance Record**:

- **Record Updated**: ✅ (must exist and be overridden)
- **status**: Updated if provided
- **attendanceStatus**: Updated if provided (must include `'Override'`)
- **override.overrideHistory**: New entry added

**Regularization Record**: ❌ **NOT CREATED**

---

### 8.3 Override Removal

**What Happens**:
1. Admin removes override
2. Original values can be restored if `restoreOriginal === true`
3. `isOverridden` set to `false`

**Attendance Record**:

- **Record Updated**: ✅
- **status**: Restored to original if `restoreOriginal === true`
- **attendanceStatus**: Restored or `'Override'` removed
- **override.isOverridden**: `false`
- **override.overrideHistory**: Preserved

**Regularization Record**: ❌ **NOT CREATED**

---

## 9. Comp Off Apply

### Location
- **Service**: `src/services/leave.service.ts`
- **Method**: `create()`, `updateStatus()`

### 9.1 Comp Off Apply (Status: Pending)

**What Happens**:
- Comp off is applied as a leave type (`leaveType: 'compOff'`)
- Leave request is created with status `'Pending'`
- **NO attendance record is created or updated** at this stage

**Attendance Record**: ❌ **NO ACTION**

**Regularization Record**: ❌ **NOT CREATED**

---

### 9.2 Comp Off Approve

**What Happens**:
1. Comp off leave is approved
2. System processes it as a regular leave approval
3. Attendance records are created/updated for each day in the leave range

**Attendance Record**:

#### Case A: Record EXISTS

- **Record Updated**: ✅
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['On-Leave']`
- **swipes**: Preserved (if exist)

#### Case B: Record Does NOT Exist

- **Record Created**: ✅ (via `upsert: true`)
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['On-Leave']`
- **swipes**: `[]` (empty)

**Regularization Record**: ❌ **NOT CREATED**

**Note**: Comp off is processed exactly like regular leave. It creates/updates attendance records but does **NOT** create regularization records.

---

### 9.3 Comp Off Reject

**What Happens**:
- Comp off leave is rejected
- Attendance records linked to the leave are updated to `['Absent']`

**Attendance Record**:

- **Record Updated**: ✅ (only if exists with `leaveRequestId`)
- **attendanceStatus**: `['Absent']`
- **leaveRequestId**: Removed

**Regularization Record**: ❌ **NOT CREATED**

---

## 10. Half Day Leave + Half Day Swipe

### Location
- **Service**: `src/services/leave.service.ts` and `src/services/biometric-attendance.service.ts`
- **Methods**: `updateStatus()` (leave approval/rejection), `processSecondSwipe()`, `processMultipleSwipes()`

### 10.1 Half-Day Leave Approval - With Swipes

**What Happens**:
1. Employee swipes IN/OUT (works one half)
2. Employee applies half-day leave for the other half
3. Leave gets approved

**Code Location**: `leave.service.ts:1683-1707`

**Logic**:
```typescript
if (leave.leaveDuration === 'half-day' && leave.halfDayType) {
  // ✅ halfType is SET ONLY for half-day leaves
  updateFields.halfType = leave.halfDayType === 'first-half' ? 'First Half' : 'Second Half';
  
  if (hasSwipes && existingRecord) {
    // Employee worked one half and took leave for the other half
    const currentStatus = existingRecord.attendanceStatus || [];
    updateFields.attendanceStatus = [...currentStatus];
    
    // Add 'On-Leave' if not already present
    if (!updateFields.attendanceStatus.includes('On-Leave')) {
      updateFields.attendanceStatus.push('On-Leave');
    }
    
    // Add 'Present' if not already present (employee worked the other half)
    if (!updateFields.attendanceStatus.includes('Present')) {
      updateFields.attendanceStatus.push('Present');
    }
    
    // Preserve other statuses like 'Late', 'Early-Exit', etc.
  } else {
    // No swipes - full half-day leave only
    // ✅ halfType is still set (line 1684) even with no swipes
    updateFields.attendanceStatus = ['On-Leave'];
  }
}
```

**Attendance Record**:

#### Case A: Swipes Exist BEFORE Leave Approval

- **Record Updated**: ✅
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['On-Leave', 'Present']` ✅ (both statuses for payroll calculation)
- **halfType**: Set to `'First Half'` or `'Second Half'` ✅ (based on `leave.halfDayType`)
- **swipes**: Preserved
- **firstIn/lastOut**: Preserved

**Payroll Calculation**: 0.5 days leave + 0.5 days present ✅

#### Case B: Swipes Added AFTER Leave Approval

**Code Location**: `biometric-attendance.service.ts:processSecondSwipe()` (lines 650-665), `processMultipleSwipes()` (lines 758-773)

**Safeguard Logic**:
```typescript
// Always mark as Present if not already present (user has swiped in and out)
if (!record.attendanceStatus.includes('Present')) {
  record.attendanceStatus.push('Present');
}

// Check if this is a half-day leave day - preserve 'On-Leave' status if present
// This handles the case where swipes are added AFTER half-day leave approval
if (record.halfType && !record.attendanceStatus.includes('On-Leave')) {
  // Check if there's an approved half-day leave for this date
  const approvedHalfDayLeave = await Leave.findOne({
    userId: record.userId,
    shiftDay: record.shiftDay,
    status: 'Approved',
    leaveDuration: 'half-day',
  });
  
  if (approvedHalfDayLeave) {
    // Preserve 'On-Leave' status for half-day leave
    record.attendanceStatus.push('On-Leave');
  }
}
```

- **Record Updated**: ✅ (swipes added to existing record)
- **status**: 
  - If 1 swipe → `'incomplete'` (but `'leave_swipe'` is preserved if set)
  - If 2 swipes → `'complete'` (but `'leave_swipe'` is preserved if set)
- **attendanceStatus**: 
  - `'On-Leave'` preserved ✅ (via safeguard)
  - `'Present'` added ✅ (for valid working days)
- **halfType**: Preserved from leave ✅

**Payroll Calculation**: 0.5 days leave + 0.5 days present ✅

#### Case C: No Swipes (Half-Day Leave Only)

- **Record Created/Updated**: ✅ (via `upsert: true`)
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['On-Leave']` ✅
- **halfType**: Set to `'First Half'` or `'Second Half'` ✅
- **swipes**: `[]` (empty)

**Payroll Calculation**: 0.5 days leave ✅

**Regularization Record**: ❌ **NOT CREATED**

---

### 10.2 Half-Day Leave Rejection - With Swipes

**What Happens**:
1. Employee swipes IN/OUT (works one half)
2. Employee applies half-day leave for the other half
3. Leave gets rejected (no leave balance = 0.5 LOP)

**Code Location**: `leave.service.ts:1753-1790`

**Logic**:
```typescript
if (isHalfDayLeave && hasSwipes) {
  // Half-day leave rejected but employee has swipes (worked the other half)
  // If rejected and no balance, it's 0.5 days LOP (Absent)
  const currentStatus = existingRecord.attendanceStatus || [];
  attendanceStatusUpdate = [...currentStatus];
  
  // Remove 'On-Leave' if present
  attendanceStatusUpdate = attendanceStatusUpdate.filter(s => s !== 'On-Leave');
  
  // Add 'Absent' to indicate the rejected half-day (0.5 LOP)
  if (!attendanceStatusUpdate.includes('Absent')) {
    attendanceStatusUpdate.push('Absent');
  }
  
  // Keep 'Present' if it exists (employee worked the other half)
  // This allows payroll to calculate: 0.5 Present + 0.5 Absent (LOP)
} else {
  // Full-day leave rejected or half-day with no swipes
  attendanceStatusUpdate = ["Absent"];
}
```

**Attendance Record**:

#### Case A: Swipes Exist + Half-Day Leave Rejected

- **Record Updated**: ✅ (only if exists with `leaveRequestId`)
- **status**: (unchanged)
- **attendanceStatus**: `['Present', 'Absent']` ✅ (0.5 Present + 0.5 LOP)
- **halfType**: Cleared (set to `undefined`) ✅
- **swipes**: Preserved
- **firstIn/lastOut**: Preserved

**Payroll Calculation**: 0.5 days present + 0.5 days LOP ✅

#### Case B: No Swipes + Half-Day Leave Rejected

- **Record Updated**: ✅ (only if exists with `leaveRequestId`)
- **status**: (unchanged)
- **attendanceStatus**: `['Absent']` ✅ (0.5 LOP)
- **halfType**: Cleared ✅
- **swipes**: `[]` (empty)

**Payroll Calculation**: 0.5 days LOP ✅

**Regularization Record**: ❌ **NOT CREATED**

---

### 10.3 Full-Day Leave vs Half-Day Leave - halfType Field

**Important Rule**: `halfType` is **ONLY** set for half-day leaves, **NOT** for full-day leaves.

**Half-Day Leave Approved**:
- ✅ `halfType` is set to `'First Half'` or `'Second Half'` (line 1684)
- ✅ Set regardless of whether swipes exist or not

**Full-Day Leave Approved**:
- ✅ `halfType` is **NOT** set (remains `undefined`/not included in update)
- ✅ Only set inside the `if (leave.leaveDuration === 'half-day' && leave.halfDayType)` block

**Summary Table**:

| Leave Type | Swipes Exist? | `halfType` Set? | `attendanceStatus` |
|------------|---------------|-----------------|-------------------|
| Half-day | Yes | ✅ Yes (`'First Half'` or `'Second Half'`) | `['On-Leave', 'Present']` |
| Half-day | No | ✅ Yes (`'First Half'` or `'Second Half'`) | `['On-Leave']` |
| Full-day | Yes | ❌ No (not set) | `['On-Leave']` |
| Full-day | No | ❌ No (not set) | `['On-Leave']` |

---

## Summary: Regularization Records

### When Regularization Records ARE Created

1. ✅ **Employee Creates Regularization Request**
   - **Collection**: `AttendanceRegularization`
   - **Status**: `'Pending'`
   - **Purpose**: Tracks the regularization request separately

### When Regularization Records ARE Updated

1. ✅ **Regularization Approval**
   - **Status**: `'Approved'`
   - **approvedDate**: Set

2. ✅ **Regularization Rejection**
   - **Status**: `'Rejected-Absent'` or `'Rejected-Leave'`
   - **comments**: Rejection reason

3. ✅ **Regularization Withdrawal**
   - **Status**: `'Withdrawn'`

### When Regularization Records are NOT Created

1. ❌ **Swipes** (first, second, third, etc.)
2. ❌ **Leave Apply/Approve/Reject**
3. ❌ **Restricted Holiday / Optional Holiday**
4. ❌ **Holiday Swipe**
5. ❌ **Weekend Swipe**
6. ❌ **WFH**
7. ❌ **Attendance Override**
8. ❌ **Comp Off**

**Note**: The `regularization` object in `AttendanceRecord` is **NOT** the same as `AttendanceRegularization` collection. The object is metadata, while the collection is a separate record.

---

## Verification Checklist

- [x] All scenarios documented
- [x] Record exists vs doesn't exist cases covered
- [x] Regularization record creation/update documented
- [x] Status values verified against code
- [x] AttendanceStatus values verified against code
- [x] Half-day scenarios documented
- [x] Weekend swipe scenarios documented
- [x] Comp off scenarios documented
- [x] WFH scenarios documented

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Status**: Comprehensive Analysis Complete
