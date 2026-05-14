# Deep Analysis: Attendance Records Creation and Update with Status

## Executive Summary

This document provides a comprehensive analysis of all scenarios where `attendancerecords` are created and updated, including the specific `status` and `attendanceStatus` values assigned in each case.

---

## Table of Contents

1. [Status Field Values](#status-field-values)
2. [AttendanceStatus Field Values](#attendancestatus-field-values)
3. [Scenario 1: Swipes In/Out](#scenario-1-swipes-inout)
4. [Scenario 2: Leave Apply/Approve/Reject](#scenario-2-leave-applyapprovereject)
5. [Scenario 3: Attendance Regularization](#scenario-3-attendance-regularization)
6. [Scenario 4: Restricted Holiday Apply/Approve/Reject](#scenario-4-restricted-holiday-applyapprovereject)
7. [Scenario 5: WFH (Work From Home)](#scenario-5-wfh-work-from-home)
8. [Scenario 6: Attendance Override (Detailed)](#scenario-6-attendance-override-detailed)
9. [Additional Scenarios](#additional-scenarios)
10. [Status Transition Matrix](#status-transition-matrix)
11. [Pre-Save Hook Behavior](#pre-save-hook-behavior)

---

## Status Field Values

The `status` field can have the following values (as defined in the model):

```typescript
'incomplete' | 'complete' | 'duplicate_swipes' | 'missing_checkout' | 
'holiday_swipe' | 'leave_swipe' | 'pending_regularization' | 
'regularized' | 'overridden'
```

---

## AttendanceStatus Field Values

The `attendanceStatus` field is an array that can contain:

```typescript
('Present' | 'Late' | 'On-Time' | 'Early-Exit' | 'Absent' | 'On-Leave' | 
'Out-Of-Window' | 'Holiday-Swipe' | 'Pending-Regularization' | 
'Regularized' | 'OT' | 'Override')[]
```

---

## Scenario 1: Swipes In/Out

### Location
- **Service**: `src/services/biometric-attendance.service.ts`
- **Method**: `processSwipe()`, `findOrCreateAttendanceRecord()`, `processFirstSwipe()`, `processSecondSwipe()`, `processMultipleSwipes()`

### 1.1 Initial Record Creation (First Swipe)

**Trigger**: First biometric swipe (IN) of the day

**Code Location**: `findOrCreateAttendanceRecord()` (lines 340-440)

**Creation Logic**:
```typescript
record = await AttendanceRecord.create({
  userId,
  shiftId,
  shiftDay,
  shiftCode,
  shiftStart,
  shiftEnd,
  swipes: [],
  outOfWindowSwipes: [],
  needsRegularization: false,
  attendanceStatus: [],  // Empty initially
  isLateEntry: false,
  isEarlyExit: false,
  isWithinWindow: true,
  excessHours: '0:00:00',
  shortfallHours: '0:00:00',
  // status: NOT SET - relies on pre-save hook
});
```

**Holiday Detection** (if holiday found):
```typescript
if (holiday && isActuallyHoliday) {
  record.status = 'holiday_swipe';
  record.attendanceStatus = ['Holiday-Swipe'];
  record.regularization = {
    isRegularized: true,
    hasRegularizationRequest: false,
    regularizationType: ['Holiday-Swipe'],
    status: 'Approved',
    regularizationId: new Types.ObjectId(),
  };
}
```

**After First Swipe Processing** (`processFirstSwipe()` - lines 528-583):
```typescript
// Status set by pre-save hook: 'incomplete'
record.attendanceStatus = record.isLateEntry ? ['Late'] : ['On-Time'];
record.needsRegularization = true;  // Always true for incomplete
```

**Initial State After First Swipe**:
- `status`: `'incomplete'` (set by pre-save hook)
- `attendanceStatus`: `['Late']` or `['On-Time']`
- `swipes`: `[{timestamp, direction: 'IN', deviceId: 'biometric', location}]`
- `firstIn`: Set to swipe timestamp
- `needsRegularization`: `true`

### 1.2 Second Swipe (Complete Attendance)

**Trigger**: Second biometric swipe (OUT) of the day

**Code Location**: `processSecondSwipe()` (lines 585-658)

**Update Logic**:
```typescript
record.swipes.push(outSwipe);
record.lastOut = timestamp;
record.isEarlyExit = timestamp < earlyExitThreshold;

// Calculate metrics
const metrics = await this.calculateAttendanceMetrics(...);

// Update time fields
record.totalWorkHours = metrics.totalWorkHours;
record.breakHours = metrics.breakHours;
record.actualWorkHours = metrics.actualWorkHours;
record.shortfallHours = metrics.shortfallHours;
record.excessHours = metrics.excessHours;

// Update attendance status
if (record.isEarlyExit) {
  record.attendanceStatus.push('Early-Exit');
}
if (!record.attendanceStatus.includes('Present')) {
  record.attendanceStatus.push('Present');
}

// Update regularization flag
record.needsRegularization = 
  record.isLateEntry ||
  record.isEarlyExit ||
  metrics.hasShortfall ||
  !record.isWithinWindow;
```

**Status After Second Swipe** (Valid Working Days Only):
- `status`: `'complete'` (set by pre-save hook - exactly 2 swipes)
- `attendanceStatus`: 
  - Base: `['Present']` ✅ **Always added for valid working days**
  - If late: `['Late', 'Present']`
  - If early exit: `['Late', 'Present', 'Early-Exit']` or `['On-Time', 'Present', 'Early-Exit']`
  - If OT: `['Present', 'OT']` (added in metrics calculation)
- `swipes`: `[{IN}, {OUT}]`
- `needsRegularization`: Based on late/early/shortfall/window violations

**Note**: `'Present'` is **NOT** added for:
- Holiday swipes (status remains `['Holiday-Swipe']` only)
- Leave dates (status remains `['On-Leave']` only)

### 1.3 Multiple Swipes (3+ Swipes)

**Trigger**: Third or subsequent swipe

**Code Location**: `processMultipleSwipes()` (lines 660-754)

**Update Logic**:
```typescript
record.swipes.push(newSwipe);

// Recalculate firstIn and lastOut from all swipes
const sortedSwipes = [...validSwipes].sort(...);
record.firstIn = firstInSwipe.timestamp;
record.lastOut = lastOutSwipe.timestamp;

// Calculate metrics using multiple swipe logic
const metrics = await this.calculateMultipleSwipeMetrics(...);

// Update attendance status
if (record.isLateEntry && !record.attendanceStatus.includes('Late')) {
  record.attendanceStatus = record.attendanceStatus.filter(s => s !== 'On-Time');
  record.attendanceStatus.push('Late');
}
if (record.isEarlyExit && !record.attendanceStatus.includes('Early-Exit')) {
  record.attendanceStatus.push('Early-Exit');
}
if (!record.attendanceStatus.includes('Present')) {
  record.attendanceStatus.push('Present');
}
```

**Status After Multiple Swipes** (Valid Working Days Only):
- `status`: `'duplicate_swipes'` (set by pre-save hook - 3+ swipes)
- `attendanceStatus`: Similar to second swipe, but preserves multiple swipe history
  - Base: `['Present']` ✅ **Always added for valid working days**
  - Additional statuses: `['Late']`, `['Early-Exit']`, `['OT']` as applicable
- `swipes`: `[{IN}, {OUT}, {IN}, {OUT}, ...]` (all swipes preserved)
- `needsRegularization`: Based on late/early/shortfall/window violations

**Note**: `'Present'` is **NOT** added for holiday swipes or leave dates

### 1.4 Out-of-Window Swipes

**Trigger**: Swipe outside the shift window

**Code Location**: `processOutOfWindowSwipe()` (lines 801-839)

**Update Logic**:
```typescript
record.outOfWindowSwipes.push(outOfWindowSwipe);
record.needsRegularization = true;
if (!record.attendanceStatus.includes('Out-Of-Window')) {
  record.attendanceStatus.push('Out-Of-Window');
}
```

**Status**:
- `status`: Depends on total swipe count (pre-save hook)
- `attendanceStatus`: Includes `'Out-Of-Window'`
  - **Note**: `'Present'` is added when second swipe completes (via `processSecondSwipe` or `processMultipleSwipes`)
- `outOfWindowSwipes`: Contains the out-of-window swipe

---

## Scenario 2: Leave Apply/Approve/Reject

### Location
- **Service**: `src/services/leave.service.ts`
- **Method**: `updateStatus()` (lines 1325-1753)

### 2.1 Leave Approval

**Trigger**: Leave request status changed to `'Approved'`

**Code Location**: `leave.service.ts:1618-1685`

**Update Logic**:
```typescript
if (updateData.status === 'Approved') {
  const startDate = new Date(leave.startDate);
  const endDate = new Date(leave.endDate);
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const existingRecord = await AttendanceRecord.findOne({
      userId: leave.userId,
      shiftDay: currentDate,
    });

    const hasSwipes = existingRecord && existingRecord.swipes && existingRecord.swipes.length > 0;
    const isRestrictedHoliday = leave.leaveType === 'restricted_holiday';

    let updateFields: any = {
      updatedAt: new Date(),
      updatedBy: updateData.approvedById
    };

    if (isRestrictedHoliday && hasSwipes) {
      // Restricted Holiday WITH swipes
      updateFields.status = 'holiday_swipe';
      updateFields.attendanceStatus = ['Holiday-Swipe'];
      updateFields.regularization = {
        isRegularized: true,
        hasRegularizationRequest: false,
        regularizationType: ['Holiday-Swipe'],
        status: 'Approved',
        regularizationId: new Types.ObjectId(),
      };
    } else {
      // Regular leave OR Restricted Holiday WITHOUT swipes
      updateFields.attendanceStatus = ['On-Leave'];
      // Note: status is NOT explicitly set - may remain as existing value
    }

    await AttendanceRecord.findOneAndUpdate(
      { userId: leave.userId, shiftDay: currentDate },
      { $set: updateFields },
      { upsert: true, strict: false }
    );

    currentDate.setDate(currentDate.getDate() + 1);
  }
}
```

**Status Values**:

| Case | status | attendanceStatus | Notes |
|------|--------|------------------|-------|
| **Restricted Holiday + Has Swipes** | `'holiday_swipe'` | `['Holiday-Swipe']` | Swipes preserved, marked as holiday |
| **Restricted Holiday + No Swipes** | (unchanged) | `['On-Leave']` | No record may exist, created via upsert |
| **Regular Leave + Has Swipes** | (unchanged) | `['On-Leave']` | Existing swipes preserved |
| **Regular Leave + No Swipes** | (unchanged) | `['On-Leave']` | Record created via upsert |

**Important Notes**:
- If record doesn't exist, it's created via `upsert: true`
- Existing swipes are NOT deleted when leave is approved
- For restricted holiday with swipes, regularization is auto-approved

### 2.2 Leave Rejection/Cancellation

**Trigger**: Leave request status changed to `'Rejected'` or `'Cancelled'`

**Code Location**: `leave.service.ts:1687-1745`

**Update Logic**:
```typescript
if (updateData.status === 'Rejected' || updateData.status === 'Cancelled') {
  const startDate = new Date(leave.startDate);
  const endDate = new Date(leave.endDate);
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    await AttendanceRecord.findOneAndUpdate(
      {
        userId: leave.userId,
        shiftDay: currentDate,
        leaveRequestId: leave._id,  // Only update records linked to this leave
      },
      {
        $set: {
          attendanceStatus: ["Absent"],
          updatedAt: new Date(),
          updatedBy: updateData.rejectedById || updateData.approvedById,
        },
        $unset: {
          leaveRequestId: '',
        },
      },
      { strict: false }
    );

    currentDate.setDate(currentDate.getDate() + 1);
  }
}
```

**Status Values**:
- `status`: (unchanged)
- `attendanceStatus`: `['Absent']` (replaces previous values)
- `leaveRequestId`: Removed

**Important Notes**:
- Only updates records that have `leaveRequestId` matching the rejected leave
- If no record exists, no update occurs (no upsert)
- Previous attendance status is completely replaced with `['Absent']`

---

## Scenario 3: Attendance Regularization

### Location
- **Service**: `src/services/attendance-regularization.service.ts`
- **Methods**: `createRegularization()`, `createBulkRegularization()`, `updateRegularizationStatus()`, `handleApproval()`, `handleRejection()`, `withdrawRegularization()`

### 3.1 Regularization Request Creation

**Trigger**: Employee creates regularization request

**Code Location**: `createRegularization()` (lines 297-426), `createBulkRegularization()` (lines 429-691)

#### 3.1.1 Regularization for Existing Record

**Update Logic**:
```typescript
const attendance = await AttendanceRecord.findById(data.attendanceId);
if (attendance) {
  attendance.regularization = {
    hasRegularizationRequest: true,
    isRegularized: false,
    status: 'Pending',
    regularizationId: regularization._id,
  };
  await attendance.save();
}
```

**Status Values**:
- `status`: (unchanged - preserves existing status)
- `attendanceStatus`: (unchanged, but may have `'Pending-Regularization'` added in bulk)
- `regularization.hasRegularizationRequest`: `true`
- `regularization.isRegularized`: `false`
- `regularization.status`: `'Pending'`

#### 3.1.2 Regularization for Non-Existent Record (Bulk Only)

**Code Location**: `createBulkRegularization()` (lines 520-540)

**Creation Logic**:
```typescript
if (!attendance) {
  attendance = new AttendanceRecord({
    userId: new Types.ObjectId(userId),
    shiftId: shiftAssignment.shiftId,
    shiftCode: shiftAssignment.shiftCode,
    shiftDay,
    shiftStart: shiftWindow.shiftStart,
    shiftEnd: shiftWindow.shiftEnd,
    swipes: [],
    attendanceStatus: ['Pending-Regularization'],
    needsRegularization: true,
    isWithinWindow: true,
    totalWorkHours: '00:00:00',
    breakHours: '00:00:00',
    actualWorkHours: '00:00:00',
    shortfallHours: '00:00:00',
    excessHours: '00:00:00',
    status: 'incomplete',
  });
  await attendance.save();
} else {
  if (!attendance.attendanceStatus.includes('Pending-Regularization')) {
    attendance.attendanceStatus.push('Pending-Regularization');
  }
  attendance.needsRegularization = true;
}
```

**Status Values**:
- `status`: `'incomplete'` (new record) or (unchanged for existing)
- `attendanceStatus`: `['Pending-Regularization']` (new) or includes `'Pending-Regularization'` (existing)
- `needsRegularization`: `true`

### 3.2 Regularization Approval

**Trigger**: Manager/Admin approves regularization request

**Code Location**: `handleApproval()` (lines 974-1106)

**Update Logic**:
```typescript
// Remove 'Pending-Regularization' from attendanceStatus
attendanceRecord.attendanceStatus = attendanceRecord.attendanceStatus.filter(
  (status) => status !== 'Pending-Regularization'
);

// Handle existing swipes vs new regularization
const hasExistingBiometricSwipes = attendanceRecord.swipes &&
  attendanceRecord.swipes.length > 0 &&
  attendanceRecord.swipes.some(s => s.deviceId !== 'manual');

if (hasExistingBiometricSwipes && attendanceRecord.swipes.length > 2) {
  // Multiple swipes exist - preserve them
  attendanceRecord.firstIn = regularization.from;
  attendanceRecord.lastOut = regularization.to;
  // Recalculate metrics using multiple swipe logic
  metrics = await this.calculateMultipleSwipeMetrics(...);
} else {
  // Replace with regularization swipes
  attendanceRecord.firstIn = regularization.from;
  attendanceRecord.lastOut = regularization.to;
  attendanceRecord.swipes = [
    { timestamp: regularization.from, direction: 'IN', deviceId: 'manual', ... },
    { timestamp: regularization.to, direction: 'OUT', deviceId: 'manual', ... },
  ];
  metrics = await this.calculateAttendanceMetrics(...);
}

// Update all time-related fields
attendanceRecord.totalWorkHours = metrics.totalWorkHours;
attendanceRecord.breakHours = metrics.breakHours;
attendanceRecord.actualWorkHours = metrics.actualWorkHours;
attendanceRecord.shortfallHours = metrics.shortfallHours;
attendanceRecord.excessHours = metrics.excessHours;

// Update attendance status
if (!attendanceRecord.attendanceStatus.includes('Regularized')) {
  attendanceRecord.attendanceStatus.push('Regularized');
}
if (!attendanceRecord.attendanceStatus.includes('Present')) {
  attendanceRecord.attendanceStatus.push('Present');
}

attendanceRecord.status = 'complete';
attendanceRecord.needsRegularization = false;

// Update regularization status
attendanceRecord.regularization = {
  hasRegularizationRequest: true,
  isRegularized: true,
  status: 'Approved',
  regularizationId: regularization._id,
  regularizedAt: new Date(),
  regularizedBy: regularization.approver?.id ? new Types.ObjectId(regularization.approver.id) : undefined,
};
```

**Status Values**:
- `status`: `'complete'`
- `attendanceStatus`: 
  - Removed: `'Pending-Regularization'`
  - Added: `'Regularized'`, `'Present'`
  - Preserved: Other existing statuses (e.g., `'Late'`, `'Early-Exit'`, `'OT'`)
- `regularization.isRegularized`: `true`
- `regularization.status`: `'Approved'`
- `needsRegularization`: `false`

### 3.3 Regularization Rejection

**Trigger**: Manager/Admin rejects regularization request

**Code Location**: `handleRejection()` (lines 866-885), `processLeaveOrAbsent()` (lines 888-950)

**Update Logic**:
```typescript
// Remove 'Pending-Regularization' from attendanceStatus
attendanceRecord.attendanceStatus = attendanceRecord.attendanceStatus.filter(
  (status: string) => status !== 'Pending-Regularization'
);

// Check leave balance (currently disabled - always false)
const hasLeaveBalance = false;

if (hasLeaveBalance) {
  // Update leave balance and mark as on-leave
  attendanceRecord.attendanceStatus = ['On-Leave'];
} else {
  // Mark as Absent if no leave balance
  if (!attendanceRecord.attendanceStatus.includes('Absent')) {
    attendanceRecord.attendanceStatus.push('Absent');
  }
}

// Update regularization status
attendanceRecord.regularization = {
  hasRegularizationRequest: true,
  isRegularized: false,
  status: 'Rejected-Absent',  // or 'Rejected-Leave' if leave balance exists
  regularizationId: regularization._id,
  remarks: regularization.comments || "Rejected",
};

// Set all time-related fields to zero
attendanceRecord.totalWorkHours = '00:00:00';
attendanceRecord.breakHours = '00:00:00';
attendanceRecord.actualWorkHours = '00:00:00';
attendanceRecord.shortfallHours = '00:00:00';
attendanceRecord.excessHours = '00:00:00';
```

**Status Values**:
- `status`: (unchanged)
- `attendanceStatus`: 
  - Removed: `'Pending-Regularization'`
  - Added: `'Absent'` (or `'On-Leave'` if leave balance exists)
- `regularization.isRegularized`: `false`
- `regularization.status`: `'Rejected-Absent'` or `'Rejected-Leave'`
- All time fields: `'00:00:00'`

### 3.4 Regularization Withdrawal

**Trigger**: Employee withdraws pending regularization request

**Code Location**: `withdrawRegularization()` (lines 1108-1154)

**Update Logic**:
```typescript
// Remove Pending-Regularization from attendanceStatus
attendance.attendanceStatus = attendance.attendanceStatus.filter(
  (status: string) => status !== 'Pending-Regularization'
);

attendance.regularization = undefined;
attendance.needsRegularization = true;  // Allow new regularization requests
```

**Status Values**:
- `status`: (unchanged)
- `attendanceStatus`: `'Pending-Regularization'` removed
- `regularization`: `undefined`
- `needsRegularization`: `true`

---

## Scenario 4: Restricted Holiday Apply/Approve/Reject

### Location
- **Service**: `src/services/optional-holiday.service.ts`
- **Method**: `updateStatus()` (lines 554-777)

**Note**: Restricted holidays can be applied via:
1. **Optional Holiday Request** (`OptionalHolidayRequest` collection)
2. **Leave Request** with `leaveType: 'restricted_holiday'` (handled in Scenario 2)

### 4.1 Optional Holiday Approval

**Trigger**: Optional holiday request status changed to `'Approved'`

**Code Location**: `optional-holiday.service.ts:593-634`

**Update Logic**:
```typescript
if (updateData.status === 'Approved') {
  const existingRecord = await AttendanceRecord.findOne({
    userId: request.userId,
    shiftDay: request.holidayDate
  });

  if (existingRecord && existingRecord.swipes && existingRecord.swipes.length > 0) {
    // Retroactively update attendance record if swipes exist
    existingRecord.status = 'holiday_swipe';
    if (!existingRecord.attendanceStatus.includes('Holiday-Swipe')) {
      existingRecord.attendanceStatus.push('Holiday-Swipe');
    }

    // Initialize or update regularization for holiday swipe
    if (!existingRecord.regularization) {
      existingRecord.regularization = {
        isRegularized: true,
        hasRegularizationRequest: false,
        regularizationType: ['Holiday-Swipe'],
        status: 'Approved',
        regularizationId: new Types.ObjectId(),
      };
    } else {
      const reg = existingRecord.regularization;
      reg.isRegularized = true;
      reg.status = 'Approved';
      if (!reg.regularizationType) {
        reg.regularizationType = ['Holiday-Swipe'];
      } else if (!reg.regularizationType.includes('Holiday-Swipe')) {
        reg.regularizationType.push('Holiday-Swipe');
      }
      existingRecord.regularization = reg;
    }

    await existingRecord.save();
  }
}
```

**Status Values**:

| Case | status | attendanceStatus | Notes |
|------|--------|-----------------|-------|
| **Has Swipes** | `'holiday_swipe'` | Includes `'Holiday-Swipe'` | Swipes preserved, marked as holiday |
| **No Swipes** | (unchanged) | (unchanged) | No attendance record update |

**Important Notes**:
- Only updates if attendance record exists AND has swipes
- If no record exists or no swipes, no update occurs
- Swipes are preserved, not deleted
- Regularization is auto-approved

### 4.2 Optional Holiday Rejection

**Trigger**: Optional holiday request status changed to `'Rejected'`

**Code Location**: `optional-holiday.service.ts:554-777`

**Update Logic**:
- **No attendance record update** - only updates `OptionalHolidayRequest` status
- Attendance records remain unchanged

**Status Values**:
- `status`: (unchanged)
- `attendanceStatus`: (unchanged)

---

## Scenario 5: WFH (Work From Home)

### Location
- **Service**: `src/services/wfh.service.ts` (separate WFH service)
- **Service**: `src/services/leave.service.ts` (WFH as leave type)
- **Method**: `create()`, `updateStatus()` in both services

### Important Finding

**There are TWO ways WFH can be applied:**

#### 5.1 WFH as Separate Service (`wfh.service.ts`)

**WFH does NOT create or update attendance records.**

WFH is tracked separately in:
- `WFH` collection (separate from attendance)
- `LeaveSummary.workFromHome` category

**No attendance record operations occur** when:
- WFH is created
- WFH is approved
- WFH is rejected
- WFH is cancelled

**Rationale**: WFH is a permission/approval system, not an attendance tracking system. Employees on WFH may still need to swipe or may not be required to swipe depending on company policy.

#### 5.2 WFH as Leave Type (`leave.service.ts`)

**Code Location**: `leave.service.ts:1667-1678`

**When WFH is applied as a leave type** (`leaveType: 'wfh'` or `'work from home'`):

**Attendance Record**:

**Case A: Record EXISTS**
- **Record Updated**: ✅
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['Present']` ✅ (WFH counts as Present, not On-Leave)
- **isWFH**: `true`
- **halfType**: Set if half-day WFH

**Case B: Record Does NOT Exist**
- **Record Created**: ✅ (via `upsert: true`)
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['Present']` ✅
- **isWFH**: `true`
- **swipes**: `[]` (empty)

**Regularization Record**: ❌ **NOT CREATED**

**Note**: When WFH is applied as a leave type, it **DOES** create/update attendance records with `['Present']` status (not `['On-Leave']`), because WFH counts as present attendance.

---

## Scenario 6: Attendance Override (Detailed)

### Location
- **Service**: `src/services/attendance-override.service.ts`
- **Methods**: `createOverride()`, `updateOverride()`, `removeOverride()`, `handleOnLeaveOverride()`, `createAbsentOverride()`

### 6.1 Override Creation - Record Exists vs Doesn't Exist

**Code Location**: `attendance-override.service.ts:40-332`

#### 6.1.1 Record Does NOT Exist (New Record Creation)

**When**: No attendance record found for `userId` and `shiftDay`

**Process**:
1. Get shift assignment for the date (required)
2. Prepare record data based on override status
3. Create new attendance record with override data

**Status Values by Override Type**:

| Override Status | status (New) | status (Existing) | attendanceStatus | swipes | firstIn | lastOut | Work Hours | Notes |
|----------------|-------------|-------------------|------------------|--------|---------|---------|------------|-------|
| **Present** | `'overridden'` | `'overridden'` | `['Override', 'Present']` | `[{IN}, {OUT}]` | `shiftStart` | `shiftEnd` | Full shift | Uses exact shift times |
| **Absent** | `'incomplete'` | `'overridden'` | `['Override', 'Absent']` | `[]` | `null` | `null` | `'00:00:00'` | Shortfall = full shift |
| **Holiday-Swipe** | `'overridden'` | `'overridden'` | `['Override', 'Holiday-Swipe']` | `[]` | `null` | `null` | `'00:00:00'` | No shortfall |
| **On-Leave** | `'leave_swipe'` | `'leave_swipe'` | `['Override', 'On-Leave']` | `[]` | `null` | `null` | `'00:00:00'` | Creates/approves leave |

**Override Object** (New Record):
```typescript
override: {
  isOverridden: true,
  overriddenAt: new Date(),
  overriddenBy: adminId,
  originalStatus: undefined,  // No original for new record
  originalAttendanceStatus: [],
  originalFirstIn: null,
  originalLastOut: null,
  originalTotalWorkHours: '00:00:00',
  originalActualWorkHours: '00:00:00',
  overrideHistory: [{
    action: 'created',
    performedBy: adminId,
    performedAt: new Date(),
    changes: [],  // No changes for new record
    reason: reason
  }]
}
```

#### 6.1.2 Record EXISTS (Update Existing Record)

**When**: Attendance record found for `userId` and `shiftDay`

**Pre-Conditions**:
- ❌ Cannot override if `regularization.status === 'Pending'` (line 200-202)
- ✅ Original values stored BEFORE override

**Process**:
1. Store original values (status, attendanceStatus, firstIn, lastOut, work hours)
2. Prepare override data based on target status
3. Replace ALL fields with override values
4. Clear regularization object (override takes precedence)

**Status Values by Override Type** (Same as new record):

| Override Status | status (New) | status (Existing) | attendanceStatus | swipes | firstIn | lastOut | Work Hours |
|----------------|-------------|-------------------|------------------|--------|---------|---------|------------|
| **Present** | `'overridden'` | `'overridden'` | `['Override', 'Present']` | `[{IN}, {OUT}]` | `shiftStart` | `shiftEnd` | Full shift |
| **Absent** | `'incomplete'` | `'overridden'` | `['Override', 'Absent']` | `[]` | `null` | `null` | `'00:00:00'` |
| **Holiday-Swipe** | `'overridden'` | `'overridden'` | `['Override', 'Holiday-Swipe']` | `[]` | `null` | `null` | `'00:00:00'` |
| **On-Leave** | `'leave_swipe'` | `'leave_swipe'` | `['Override', 'On-Leave']` | `[]` | `null` | `null` | `'00:00:00'` |

**Override Object** (Existing Record):
```typescript
override: {
  isOverridden: true,
  overriddenAt: record.override?.overriddenAt || new Date(),  // Preserve original override time
  overriddenBy: adminId,
  originalStatus: originalStatus,  // From existing record
  originalAttendanceStatus: originalAttendanceStatus,  // From existing record
  originalFirstIn: originalFirstIn,
  originalLastOut: originalLastOut,
  originalTotalWorkHours: originalTotalWorkHours,
  originalActualWorkHours: originalActualWorkHours,
  overrideHistory: [
    ...(existing history),
    {
      action: 'modified',
      performedBy: adminId,
      performedAt: new Date(),
      changes: [/* calculated changes */],
      reason: reason
    }
  ]
}
```

**Critical Changes**:
- ✅ Original swipes are **NOT preserved** - replaced with override swipes (or empty)
- ✅ Regularization is **cleared** (line 278-280) - override takes precedence
- ✅ All time fields recalculated based on override status
- ✅ `needsRegularization` set to `false` (line 264)
- ✅ `isWithinWindow` set to `true` (line 265)

### 6.2 Override Status: Present

**Code Location**: `prepareOverrideRecordData()` (lines 1021-1055)

**Logic**:
```typescript
if (isPresent) {
  firstIn = shiftStart;  // Uses shift start time
  lastOut = shiftEnd;    // Uses shift end time
  
  // Calculate metrics using BiometricAttendanceService
  const metrics = await calculateAttendanceMetrics(firstIn, lastOut, shiftStart, shiftEnd);
  
  return {
    status: 'complete',  // Always complete for Present
    firstIn,
    lastOut,
    totalWorkHours: metrics.totalWorkHours,
    breakHours: metrics.breakHours,
    actualWorkHours: metrics.actualWorkHours,
    shortfallHours: metrics.shortfallHours,
    excessHours: metrics.excessHours,
    isLateEntry: false,  // Override uses exact shift times
    isEarlyExit: false,  // Override uses exact shift times
  };
}
```

**Final Record State**:
- `status`: `'overridden'` (set in createOverride, line 182/259)
- `attendanceStatus`: `['Override', 'Present']`
- `swipes`: `[{timestamp: shiftStart, direction: 'IN', deviceId: 'override'}, {timestamp: shiftEnd, direction: 'OUT', deviceId: 'override'}]`
- `firstIn`: `shiftStart`
- `lastOut`: `shiftEnd`
- `totalWorkHours`: Calculated from shift duration (includes break calculation)
- `isLateEntry`: `false` (override uses exact shift times)
- `isEarlyExit`: `false` (override uses exact shift times)

### 6.3 Override Status: Absent

**Code Location**: `prepareOverrideRecordData()` (lines 1056-1076), `createAbsentOverride()` (lines 845-945)

**Logic**:
```typescript
if (isAbsent) {
  return {
    status: 'incomplete',
    firstIn: null,
    lastOut: null,
    totalWorkHours: '00:00:00',
    breakHours: '00:00:00',
    actualWorkHours: '00:00:00',
    shiftHours: shiftHoursStr,
    shortfallHours: shiftHoursStr,  // Full shift is shortfall
    excessHours: '00:00:00',
    isLateEntry: false,
    isEarlyExit: false,
  };
}
```

**Final Record State**:
- `status`: 
  - **New Record**: `'incomplete'` (line 881 in `createAbsentOverride`)
  - **Existing Record**: `'overridden'` (line 259 in `createOverride`)
- `attendanceStatus`: `['Override', 'Absent']`
- `swipes`: `[]` (empty)
- `firstIn`: `null`
- `lastOut`: `null`
- `totalWorkHours`: `'00:00:00'`
- `shortfallHours`: Full shift hours (e.g., `'09:00:00'`)

**Note**: For new Absent override records, status is `'incomplete'` (not `'overridden'`). For existing records updated to Absent, status is `'overridden'`.

### 6.4 Override Status: Holiday-Swipe

**Code Location**: `prepareOverrideRecordData()` (lines 1077-1097)

**Logic**:
```typescript
if (isHoliday) {
  return {
    status: 'holiday_swipe',
    firstIn: null,
    lastOut: null,
    totalWorkHours: '00:00:00',
    breakHours: '00:00:00',
    actualWorkHours: '00:00:00',
    shiftHours: shiftHoursStr,
    shortfallHours: '00:00:00',  // No shortfall for holiday
    excessHours: '00:00:00',
    isLateEntry: false,
    isEarlyExit: false,
  };
}
```

**Final Record State**:
- `status`: `'overridden'` (set in createOverride, line 182/259 - overrides the `'holiday_swipe'` from prepareOverrideRecordData)
- `attendanceStatus`: `['Override', 'Holiday-Swipe']`
- `swipes`: `[]` (empty)
- `firstIn`: `null`
- `lastOut`: `null`
- `totalWorkHours`: `'00:00:00'`
- `shortfallHours`: `'00:00:00'` (no shortfall for holiday)

**Note**: The `status` field is set to `'overridden'` in `createOverride()` (line 182, 259), not `'holiday_swipe'`. The `prepareOverrideRecordData()` returns `'holiday_swipe'` but it's overridden to `'overridden'`.

### 6.5 Override Status: On-Leave (Special Handling)

**Code Location**: `handleOnLeaveOverride()` (lines 595-840)

**Special Process**: Integrates with leave system - creates/approves leave requests

**Step-by-Step Flow**:

**Step 1: Check Existing Leave** (lines 619-626)
```typescript
const existingLeave = await Leave.findOne({
  userId,
  startDate: { $lte: dayEnd },
  endDate: { $gte: dayStart },
  status: { $in: ['Pending', 'Approved'] },
});
```

**Step 2A: Leave Exists and Approved** (line 629)
- Use existing approved leave
- Attendance record already created by leave approval

**Step 2B: Leave Exists but Pending** (lines 631-653)
- Auto-approve the pending leave
- Leave approval creates attendance record with `['On-Leave']`

**Step 2C: No Leave Exists** (lines 654-742)
- Check leave balance
- If no balance → Return Absent override (line 689-695)
- If balance exists → Create and approve leave request
- Leave approval creates attendance record

**Step 3: Update Attendance Record** (lines 748-833)
```typescript
// Find record created by leave approval
let record = await AttendanceRecord.findOne({
  userId,
  shiftDay,
});

// Update to include Override
record.attendanceStatus = record.attendanceStatus.filter(s => s !== 'On-Leave');
record.attendanceStatus.push('Override', 'On-Leave');
record.status = 'leave_swipe';  // Note: NOT 'overridden'

// Clear work hours
record.firstIn = null;
record.lastOut = null;
record.totalWorkHours = '00:00:00';
// ... all time fields set to '00:00:00'
```

**Final Record State**:
- `status`: `'leave_swipe'` (NOT `'overridden'` - special case)
- `attendanceStatus`: `['Override', 'On-Leave']`
- `swipes`: `[]` (empty - from leave approval)
- `firstIn`: `null`
- `lastOut`: `null`
- `totalWorkHours`: `'00:00:00'`
- Leave request: Created/approved (linked via leave system)

**Fallback to Absent** (lines 689-695):
- If no leave balance available
- Calls `createAbsentOverride()` instead
- Returns `wasAbsent: true`

### 6.6 Override Update

**Code Location**: `updateOverride()` (lines 337-424)

**Trigger**: Admin modifies existing override

**Pre-Conditions**:
- Record must exist
- Record must already be overridden (`override.isOverridden === true`)

**Update Logic**:
```typescript
// Store current values for history
const currentStatus = record.status;
const currentAttendanceStatus = [...record.attendanceStatus];
const currentFirstIn = record.firstIn;
const currentLastOut = record.lastOut;

// Update fields (only if provided)
if (data.attendanceStatus) {
  if (!data.attendanceStatus.includes('Override')) {
    throw new Error('attendanceStatus must include "Override"');
  }
  record.attendanceStatus = data.attendanceStatus;
}

if (data.status) {
  record.status = data.status;
}

// Update other fields if provided
if (data.firstIn) record.firstIn = new Date(data.firstIn);
if (data.lastOut) record.lastOut = new Date(data.lastOut);
if (data.totalWorkHours) record.totalWorkHours = data.totalWorkHours;
if (data.actualWorkHours) record.actualWorkHours = data.actualWorkHours;

// Add to history
record.override.overrideHistory.push({
  action: 'modified',
  performedBy: adminId,
  performedAt: new Date(),
  changes: calculateChanges(...),
  reason: modificationReason,
});
```

**Status Values**:
- `status`: Updated if provided (must be valid enum value)
- `attendanceStatus`: Updated if provided (must include `'Override'`)
- Other fields: Updated only if provided in `data`

**Important Notes**:
- Original values (from first override) are preserved in `override.originalStatus`, etc.
- Each update adds a new history entry
- History tracks all changes across multiple updates

### 6.7 Override Removal

**Code Location**: `removeOverride()` (lines 429-488)

**Trigger**: Admin removes override from attendance record

**Process**:
```typescript
// Store original values from override object
const originalStatus = record.override.originalStatus;
const originalAttendanceStatus = record.override.originalAttendanceStatus || [];
const originalFirstIn = record.override.originalFirstIn;
const originalLastOut = record.override.originalLastOut;

// Restore original values if requested
if (restoreOriginal && originalStatus) {
  record.status = originalStatus;
}
if (restoreOriginal && originalAttendanceStatus.length > 0) {
  record.attendanceStatus = originalAttendanceStatus;
} else {
  // Remove 'Override' from attendanceStatus
  record.attendanceStatus = record.attendanceStatus.filter(s => s !== 'Override');
}

// Restore other original fields if requested
if (restoreOriginal && originalFirstIn !== undefined) {
  record.firstIn = originalFirstIn;
}
if (restoreOriginal && originalLastOut !== undefined) {
  record.lastOut = originalLastOut;
}

// Mark override as removed (but keep history)
record.override.isOverridden = false;
```

**Status Values**:

| restoreOriginal Flag | status | attendanceStatus | Notes |
|---------------------|--------|------------------|-------|
| `true` | Restored to `originalStatus` | Restored to `originalAttendanceStatus` | Full restoration to pre-override state |
| `false` | (unchanged) | `'Override'` removed, other statuses preserved | Partial restoration - only removes `'Override'` |

**Important Notes**:
- Override history is **preserved** (not deleted)
- `isOverridden` is set to `false` (line 482)
- Original values are only restored if `restoreOriginal === true`

---

## Additional Scenarios

### 7.1 Weekend Swipe

**Location**: `src/services/biometric-attendance.service.ts`

**Important Finding**: Weekend swipes are processed as **normal swipes** in real-time processing. Weekend detection with `'Holiday-Swipe'` status is **only** done in bulk upload service.

**Real-Time Weekend Swipe**:
- Processed as normal attendance
- `'Present'` is added when both swipes exist
- Status follows normal swipe logic (`'incomplete'`, `'complete'`, `'duplicate_swipes'`)
- **Does NOT** automatically get `'Holiday-Swipe'` status

**Bulk Upload Weekend Swipe**:
- **Code Location**: `bulk-attendance-upload.service.ts:1200-1205`
- Weekend detection adds `'Holiday-Swipe'` to `attendanceStatus`
- Status can be `'complete'` or `'duplicate_swipes'` (based on swipe count)

**Regularization Record**: ❌ **NOT CREATED**

---

### 7.2 Comp Off Apply

**Location**: `src/services/leave.service.ts`

**Comp Off is processed as a regular leave type** (`leaveType: 'compOff'`).

**Comp Off Apply (Pending)**:
- **Attendance Record**: ❌ **NO ACTION**

**Comp Off Approve**:
- **Attendance Record**: ✅ **CREATED/UPDATED**
  - **status**: `'leave_swipe'` ✅
  - **attendanceStatus**: `['On-Leave']`
  - Same behavior as regular leave approval

**Comp Off Reject**:
- **Attendance Record**: ✅ **UPDATED** (if exists with `leaveRequestId`)
  - **attendanceStatus**: `['Absent']`

**Regularization Record**: ❌ **NOT CREATED**

**Note**: Comp off creates/updates attendance records exactly like regular leave. It does **NOT** create regularization records.

---

### 7.3 Half Day Leave + Half Day Swipe

**Location**: `src/services/leave.service.ts` and `src/services/biometric-attendance.service.ts`

**Scenario**: Employee applies half-day leave and has swipes for the other half.

#### 7.3.1 Half-Day Leave Approval - With Swipes

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

**Case A: Swipes Exist BEFORE Leave Approval**
- **Record Updated**: ✅
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['On-Leave', 'Present']` ✅ (both statuses for payroll calculation)
- **halfType**: Set to `'First Half'` or `'Second Half'` ✅
- **swipes**: Preserved
- **firstIn/lastOut**: Preserved

**Case B: Swipes Added AFTER Leave Approval**

**Code Location**: `biometric-attendance.service.ts:processSecondSwipe()` (lines 650-665), `processMultipleSwipes()` (lines 758-773)

**Safeguard Logic**: Preserves `'On-Leave'` status when swipes are added after half-day leave approval

- **Record Updated**: ✅ (swipes added to existing record)
- **status**: May be `'complete'` or `'duplicate_swipes'` (but `'leave_swipe'` is preserved if set)
- **attendanceStatus**: 
  - `'On-Leave'` preserved ✅ (via safeguard)
  - `'Present'` added ✅ (for valid working days)
- **halfType**: Preserved from leave ✅

**Case C: No Swipes (Half-Day Leave Only)**
- **Record Created/Updated**: ✅ (via `upsert: true`)
- **status**: `'leave_swipe'` ✅
- **attendanceStatus**: `['On-Leave']` ✅
- **halfType**: Set to `'First Half'` or `'Second Half'` ✅
- **swipes**: `[]` (empty)

**Result**: 
- `attendanceStatus: ['On-Leave', 'Present']` (both statuses when swipes exist)
- `halfType: 'First Half'` or `'Second Half'` (indicates which half is leave)
- **Payroll Calculation**: 0.5 days leave + 0.5 days present (when swipes exist)

**Regularization Record**: ❌ **NOT CREATED**

#### 7.3.2 Half-Day Leave Rejection - With Swipes

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

**Case A: Swipes Exist + Half-Day Leave Rejected**
- **Record Updated**: ✅ (only if exists with `leaveRequestId`)
- **status**: (unchanged)
- **attendanceStatus**: `['Present', 'Absent']` ✅ (0.5 Present + 0.5 LOP)
- **halfType**: Cleared (set to `undefined`) ✅
- **swipes**: Preserved

**Case B: No Swipes + Half-Day Leave Rejected**
- **Record Updated**: ✅ (only if exists with `leaveRequestId`)
- **status**: (unchanged)
- **attendanceStatus**: `['Absent']` ✅ (0.5 LOP)
- **halfType**: Cleared ✅

**Payroll Calculation**: 0.5 days present + 0.5 days LOP (when swipes exist)

**Regularization Record**: ❌ **NOT CREATED**

#### 7.3.3 halfType Field - Important Rule

**`halfType` is ONLY set for half-day leaves, NOT for full-day leaves.**

- ✅ **Half-Day Leave Approved**: `halfType` is set to `'First Half'` or `'Second Half'` (regardless of swipes)
- ❌ **Full-Day Leave Approved**: `halfType` is NOT set (remains `undefined`/not included in update)

---

### 7.4 Bulk Attendance Upload

**Location**: `src/services/bulk-attendance-upload.service.ts`

**Trigger**: Admin uploads bulk attendance CSV/Excel file

**Creation Logic**:
```typescript
const attendanceRecord = new AttendanceRecord({
  userId: new Types.ObjectId(row.userId),
  shiftId: shiftAssignmentId,
  shiftCode: row.shiftCode,
  shiftDay,
  shiftStart: shiftStartUTC,
  shiftEnd: adjustedShiftEndUTC,
  swipes,  // Pre-populated from file
  firstIn: inTimeUTC,
  lastOut: adjustedOutTimeUTC,
  isWithinWindow: hasOvertime ? true : isWithinWindow,
  isLateEntry,
  isEarlyExit,
  needsRegularization: false,
  totalWorkHours,
  breakHours: '0:00:00',
  actualWorkHours: totalWorkHours,
  shiftHours,
  shortfallHours: '0:00:00',
  excessHours: hasOvertime ? formatOvertimeHours(overtimeHours) : '0:00:00',
  overtimeStart: hasOvertime ? adjustedShiftEndUTC : undefined,
  overtimeEnd: hasOvertime ? adjustedOutTimeUTC : undefined,
  status,  // 'complete' or 'duplicate_swipes'
  attendanceStatus,  // Array built from conditions
  outOfWindowSwipes: [],
  regularization: {
    isRegularized: false,
    hasRegularizationRequest: false,
    status: 'Pending'
  }
});
```

**Status Values**:
- `status`: `'complete'` (if 2 swipes) or `'duplicate_swipes'` (if 3+ swipes)
- `attendanceStatus`: Array built from:
  - `'Late'` (if `isLateEntry`)
  - `'Early-Exit'` (if `isEarlyExit`)
  - `'OT'` (if `hasOvertime`)
  - `'Present'` (always added)
  - `'Holiday-Swipe'` (if `isHoliday`)


**Location**: `src/services/attendance-override.service.ts`  
**Methods**: `createOverride()`, `updateOverride()`, `removeOverride()`, `handleOnLeaveOverride()`, `createAbsentOverride()`

**Trigger**: Admin manually overrides attendance record

#### 6.2.1 Override Creation - Record Exists vs Doesn't Exist

**Code Location**: `attendance-override.service.ts:40-332`

##### Case A: Record Does NOT Exist (New Record Creation)

**When**: No attendance record found for `userId` and `shiftDay`

**Process**:
1. Get shift assignment for the date
2. Prepare record data based on override status (Present/Absent/Holiday-Swipe)
3. Create new attendance record with override data

**Status Values by Override Type**:

| Override Status | status | attendanceStatus | swipes | firstIn | lastOut | Work Hours |
|----------------|--------|------------------|--------|---------|---------|------------|
| **Present** | `'overridden'` | `['Override', 'Present']` | `[{IN}, {OUT}]` (from shiftStart/shiftEnd) | `shiftStart` | `shiftEnd` | Calculated (full shift) |
| **Absent** | `'overridden'` | `['Override', 'Absent']` | `[]` (empty) | `null` | `null` | `'00:00:00'` |
| **Holiday-Swipe** | `'overridden'` | `['Override', 'Holiday-Swipe']` | `[]` (empty) | `null` | `null` | `'00:00:00'` |
| **On-Leave** | `'leave_swipe'` | `['Override', 'On-Leave']` | `[]` (empty) | `null` | `null` | `'00:00:00'` |

**Override Object** (New Record):
```typescript
override: {
  isOverridden: true,
  overriddenAt: new Date(),
  overriddenBy: adminId,
  originalStatus: undefined,  // No original status for new record
  originalAttendanceStatus: [],  // No original status for new record
  originalFirstIn: null,
  originalLastOut: null,
  originalTotalWorkHours: '00:00:00',
  originalActualWorkHours: '00:00:00',
  overrideHistory: [{
    action: 'created',
    performedBy: adminId,
    performedAt: new Date(),
    changes: [],  // No changes for new record
    reason: reason
  }]
}
```

##### Case B: Record EXISTS (Update Existing Record)

**When**: Attendance record found for `userId` and `shiftDay`

**Pre-Conditions**:
- Cannot override if `regularization.status === 'Pending'` (line 200-202)
- Original values are stored BEFORE override

**Process**:
1. Store original values (status, attendanceStatus, firstIn, lastOut, etc.)
2. Prepare override data based on target status
3. Replace all fields with override values
4. Clear regularization object (override takes precedence)

**Status Values by Override Type**:

| Override Status | status | attendanceStatus | swipes | firstIn | lastOut | Work Hours |
|----------------|--------|------------------|--------|---------|---------|------------|
| **Present** | `'overridden'` | `['Override', 'Present']` | `[{IN}, {OUT}]` (from shiftStart/shiftEnd) | `shiftStart` | `shiftEnd` | Calculated (full shift) |
| **Absent** | `'overridden'` | `['Override', 'Absent']` | `[]` (empty) | `null` | `null` | `'00:00:00'` |
| **Holiday-Swipe** | `'overridden'` | `['Override', 'Holiday-Swipe']` | `[]` (empty) | `null` | `null` | `'00:00:00'` |
| **On-Leave** | `'leave_swipe'` | `['Override', 'On-Leave']` | `[]` (empty) | `null` | `null` | `'00:00:00'` |

**Override Object** (Existing Record):
```typescript
override: {
  isOverridden: true,
  overriddenAt: record.override?.overriddenAt || new Date(),  // Preserve original override time
  overriddenBy: adminId,
  originalStatus: originalStatus,  // Stored from existing record
  originalAttendanceStatus: originalAttendanceStatus,  // Stored from existing record
  originalFirstIn: originalFirstIn,
  originalLastOut: originalLastOut,
  originalTotalWorkHours: originalTotalWorkHours,
  originalActualWorkHours: originalActualWorkHours,
  overrideHistory: [
    ...(existing history),
    {
      action: 'modified',
      performedBy: adminId,
      performedAt: new Date(),
      changes: [/* calculated changes */],
      reason: reason
    }
  ]
}
```

**Important Notes**:
- Original swipes are **NOT preserved** - replaced with override swipes (or empty)
- Regularization is **cleared** (line 278-280)
- All time fields are recalculated based on override status
- `needsRegularization` is set to `false` (line 264)

#### 6.2.2 Override Status: Present

**Code Location**: `prepareOverrideRecordData()` (lines 1021-1055)

**Logic**:
```typescript
if (isPresent) {
  firstIn = shiftStart;  // Uses shift start time
  lastOut = shiftEnd;    // Uses shift end time
  
  // Calculate metrics using BiometricAttendanceService
  const metrics = await calculateAttendanceMetrics(firstIn, lastOut, shiftStart, shiftEnd);
  
  return {
    status: 'complete',  // Always complete for Present
    firstIn,
    lastOut,
    totalWorkHours: metrics.totalWorkHours,
    breakHours: metrics.breakHours,
    actualWorkHours: metrics.actualWorkHours,
    shortfallHours: metrics.shortfallHours,
    excessHours: metrics.excessHours,
    isLateEntry: false,  // Override uses exact shift times
    isEarlyExit: false,  // Override uses exact shift times
  };
}
```

**Final Record State**:
- `status`: `'overridden'`
- `attendanceStatus`: `['Override', 'Present']`
- `swipes`: `[{timestamp: shiftStart, direction: 'IN'}, {timestamp: shiftEnd, direction: 'OUT'}]`
- `firstIn`: `shiftStart`
- `lastOut`: `shiftEnd`
- `totalWorkHours`: Calculated from shift duration
- `isLateEntry`: `false`
- `isEarlyExit`: `false`

#### 6.2.3 Override Status: Absent

**Code Location**: `prepareOverrideRecordData()` (lines 1056-1076), `createAbsentOverride()` (lines 845-945)

**Logic**:
```typescript
if (isAbsent) {
  return {
    status: 'incomplete',
    firstIn: null,
    lastOut: null,
    totalWorkHours: '00:00:00',
    breakHours: '00:00:00',
    actualWorkHours: '00:00:00',
    shiftHours: shiftHoursStr,
    shortfallHours: shiftHoursStr,  // Full shift is shortfall
    excessHours: '00:00:00',
    isLateEntry: false,
    isEarlyExit: false,
  };
}
```

**Final Record State**:
- `status`: `'overridden'` (or `'incomplete'` for new absent override)
- `attendanceStatus`: `['Override', 'Absent']`
- `swipes`: `[]` (empty)
- `firstIn`: `null`
- `lastOut`: `null`
- `totalWorkHours`: `'00:00:00'`
- `shortfallHours`: Full shift hours (e.g., `'09:00:00'`)

#### 6.2.4 Override Status: Holiday-Swipe

**Code Location**: `prepareOverrideRecordData()` (lines 1077-1097)

**Logic**:
```typescript
if (isHoliday) {
  return {
    status: 'holiday_swipe',
    firstIn: null,
    lastOut: null,
    totalWorkHours: '00:00:00',
    breakHours: '00:00:00',
    actualWorkHours: '00:00:00',
    shiftHours: shiftHoursStr,
    shortfallHours: '00:00:00',  // No shortfall for holiday
    excessHours: '00:00:00',
    isLateEntry: false,
    isEarlyExit: false,
  };
}
```

**Final Record State**:
- `status`: `'overridden'` (set in createOverride, but prepareOverrideRecordData returns `'holiday_swipe'`)
- `attendanceStatus`: `['Override', 'Holiday-Swipe']`
- `swipes`: `[]` (empty)
- `firstIn`: `null`
- `lastOut`: `null`
- `totalWorkHours`: `'00:00:00'`
- `shortfallHours`: `'00:00:00'` (no shortfall for holiday)

**Note**: The `status` field is set to `'overridden'` in `createOverride()` (line 182, 259), not `'holiday_swipe'`. The `prepareOverrideRecordData()` returns `'holiday_swipe'` but it's overridden to `'overridden'`.

#### 6.2.5 Override Status: On-Leave (Special Handling)

**Code Location**: `handleOnLeaveOverride()` (lines 595-840)

**Special Process**:
1. Checks if leave request exists for the date
2. If pending leave exists → Auto-approves it
3. If no leave exists → Creates and approves new leave request
4. If no leave balance → Falls back to Absent override
5. Updates attendance record created by leave approval

**Step-by-Step Flow**:

**Step 1: Check Existing Leave** (lines 619-626)
```typescript
const existingLeave = await Leave.findOne({
  userId,
  startDate: { $lte: dayEnd },
  endDate: { $gte: dayStart },
  status: { $in: ['Pending', 'Approved'] },
});
```

**Step 2A: Leave Exists and Approved** (line 629)
- Use existing approved leave
- Attendance record already created by leave approval

**Step 2B: Leave Exists but Pending** (lines 631-653)
- Auto-approve the pending leave
- Leave approval creates attendance record with `['On-Leave']`

**Step 2C: No Leave Exists** (lines 654-742)
- Check leave balance
- If no balance → Return Absent override (line 689-695)
- If balance exists → Create and approve leave request
- Leave approval creates attendance record

**Step 3: Update Attendance Record** (lines 748-833)
```typescript
// Find record created by leave approval
let record = await AttendanceRecord.findOne({
  userId,
  shiftDay,
});

// Update to include Override
record.attendanceStatus = record.attendanceStatus.filter(s => s !== 'On-Leave');
record.attendanceStatus.push('Override', 'On-Leave');
record.status = 'leave_swipe';  // Note: NOT 'overridden'

// Clear work hours
record.firstIn = null;
record.lastOut = null;
record.totalWorkHours = '00:00:00';
// ... all time fields set to '00:00:00'
```

**Final Record State**:
- `status`: `'leave_swipe'` (NOT `'overridden'` - special case)
- `attendanceStatus`: `['Override', 'On-Leave']`
- `swipes`: `[]` (empty - from leave approval)
- `firstIn`: `null`
- `lastOut`: `null`
- `totalWorkHours`: `'00:00:00'`
- Leave request: Created/approved (linked via leave system)

**Fallback to Absent** (lines 689-695):
- If no leave balance available
- Calls `createAbsentOverride()` instead
- Returns `wasAbsent: true`

#### 6.2.6 Override Update

**Code Location**: `updateOverride()` (lines 337-424)

**Trigger**: Admin modifies existing override

**Pre-Conditions**:
- Record must exist
- Record must already be overridden (`override.isOverridden === true`)

**Update Logic**:
```typescript
// Store current values for history
const currentStatus = record.status;
const currentAttendanceStatus = [...record.attendanceStatus];
const currentFirstIn = record.firstIn;
const currentLastOut = record.lastOut;

// Update fields (only if provided)
if (data.attendanceStatus) {
  if (!data.attendanceStatus.includes('Override')) {
    throw new Error('attendanceStatus must include "Override"');
  }
  record.attendanceStatus = data.attendanceStatus;
}

if (data.status) {
  record.status = data.status;
}

// Update other fields if provided
if (data.firstIn) record.firstIn = new Date(data.firstIn);
if (data.lastOut) record.lastOut = new Date(data.lastOut);
if (data.totalWorkHours) record.totalWorkHours = data.totalWorkHours;
if (data.actualWorkHours) record.actualWorkHours = data.actualWorkHours;

// Add to history
record.override.overrideHistory.push({
  action: 'modified',
  performedBy: adminId,
  performedAt: new Date(),
  changes: calculateChanges(...),
  reason: modificationReason,
});
```

**Status Values**:
- `status`: Updated if provided (must be valid enum value)
- `attendanceStatus`: Updated if provided (must include `'Override'`)
- Other fields: Updated only if provided in `data`

**Important Notes**:
- Original values (from first override) are preserved in `override.originalStatus`, etc.
- Each update adds a new history entry
- History tracks all changes across multiple updates

#### 6.2.7 Override Removal

**Code Location**: `removeOverride()` (lines 429-488)

**Trigger**: Admin removes override from attendance record

**Process**:
```typescript
// Store original values from override object
const originalStatus = record.override.originalStatus;
const originalAttendanceStatus = record.override.originalAttendanceStatus || [];
const originalFirstIn = record.override.originalFirstIn;
const originalLastOut = record.override.originalLastOut;

// Restore original values if requested
if (restoreOriginal && originalStatus) {
  record.status = originalStatus;
}
if (restoreOriginal && originalAttendanceStatus.length > 0) {
  record.attendanceStatus = originalAttendanceStatus;
} else {
  // Remove 'Override' from attendanceStatus
  record.attendanceStatus = record.attendanceStatus.filter(s => s !== 'Override');
}

// Restore other original fields if requested
if (restoreOriginal && originalFirstIn !== undefined) {
  record.firstIn = originalFirstIn;
}
if (restoreOriginal && originalLastOut !== undefined) {
  record.lastOut = originalLastOut;
}

// Mark override as removed (but keep history)
record.override.isOverridden = false;
```

**Status Values**:

| restoreOriginal Flag | status | attendanceStatus | Notes |
|---------------------|--------|------------------|-------|
| `true` | Restored to `originalStatus` | Restored to `originalAttendanceStatus` | Full restoration |
| `false` | (unchanged) | `'Override'` removed, other statuses preserved | Partial restoration |

**Important Notes**:
- Override history is **preserved** (not deleted)
- `isOverridden` is set to `false` (line 482)
- Original values are only restored if `restoreOriginal === true`

#### 6.2.8 Summary: Override Impact on Attendance Records

**When Record EXISTS**:
- Original values stored in `override` object
- All fields replaced with override values
- Regularization cleared
- Swipes replaced (or cleared)
- Status set to `'overridden'` (except On-Leave → `'leave_swipe'`)

**When Record Does NOT Exist**:
- New record created with override data
- No original values to store
- Status set to `'overridden'` (except On-Leave → `'leave_swipe'`)

**Status Values by Override Type**:

| Override Type | status | attendanceStatus | Swipes | Work Hours |
|--------------|--------|------------------|--------|------------|
| **Present** | `'overridden'` | `['Override', 'Present']` | 2 swipes (shiftStart/shiftEnd) | Full shift calculated |
| **Absent** | `'overridden'` | `['Override', 'Absent']` | Empty | `'00:00:00'` |
| **Holiday-Swipe** | `'overridden'` | `['Override', 'Holiday-Swipe']` | Empty | `'00:00:00'` |
| **On-Leave** | `'leave_swipe'` | `['Override', 'On-Leave']` | Empty | `'00:00:00'` |

**Important Rules**:
1. `'Override'` must always be included in `attendanceStatus`
2. Cannot override if regularization is pending
3. Original values are preserved for audit trail
4. Regularization is cleared when override is applied
5. On-Leave override integrates with leave system (creates/approves leave)
6. On-Leave override uses `'leave_swipe'` status, not `'overridden'`

### 7.5 Holiday Detection During Swipe

**Location**: `biometric-attendance.service.ts:375-437`

**Trigger**: Swipe occurs on a holiday date

**Update Logic** (within `findOrCreateAttendanceRecord()`):
```typescript
const holiday = await this.checkHolidayCalendar(userId, shiftDay);

if (holiday) {
  let isActuallyHoliday = true;

  // For optional holidays, check if user has approved request
  if (holiday.type === 'optional') {
    const approvedOptionalRequest = await OptionalHolidayRequest.findOne({...});
    const approvedLeaveRequest = await Leave.findOne({...});
    
    if (!approvedOptionalRequest && !approvedLeaveRequest) {
      isActuallyHoliday = false;  // Process as regular day
    }
  }

  if (isActuallyHoliday) {
    record.status = 'holiday_swipe';
    record.attendanceStatus = ['Holiday-Swipe'];
    record.regularization = {
      isRegularized: true,
      hasRegularizationRequest: false,
      regularizationType: ['Holiday-Swipe'],
      status: 'Approved',
      regularizationId: new Types.ObjectId(),
    };
    await record.save();
  }
}
```

**Status Values**:
- `status`: `'holiday_swipe'`
- `attendanceStatus`: `['Holiday-Swipe']` **ONLY** (does NOT include `'Present'`)
- `regularization.isRegularized`: `true`
- `regularization.status`: `'Approved'`

**Important**: For holiday swipes, even if user completes both IN and OUT swipes, `'Present'` is **NOT** added. The status remains `['Holiday-Swipe']` only, as holidays are not considered "present" working days.

---

## Status Transition Matrix

| From Status | To Status | Trigger | Notes |
|-------------|-----------|---------|-------|
| (none) | `'incomplete'` | First swipe | Pre-save hook |
| `'incomplete'` | `'complete'` | Second swipe (exactly 2) | Pre-save hook |
| `'incomplete'` | `'duplicate_swipes'` | Third+ swipe | Pre-save hook |
| `'complete'` | `'duplicate_swipes'` | Third+ swipe | Pre-save hook |
| Any | `'holiday_swipe'` | Holiday detected OR Restricted holiday approved with swipes | Manual set |
| Any | `'leave_swipe'` | Leave approved (restricted holiday without swipes) | Manual set |
| Any | `'pending_regularization'` | Regularization request created | Manual set |
| `'pending_regularization'` | `'regularized'` | Regularization approved | Manual set |
| Any | `'overridden'` | Admin override | Manual set |

---

## Pre-Save Hook Behavior

**Location**: `src/models/attendance-record.model.ts:358-388`

**Trigger**: Record is saved AND `swipes` field is modified

**Logic**:
```typescript
attendanceRecordSchema.pre('save', function (next) {
  // Only update status if swipes are modified
  if (!this.isModified('swipes')) {
    return next();
  }

  // Preserve special statuses
  const specialStatuses = ['holiday_swipe', 'leave_swipe', 'overridden', 'regularized', 'pending_regularization'];
  if (this.status && specialStatuses.includes(this.status)) {
    return next();  // Don't override special statuses
  }

  // Sort swipes by timestamp
  this.swipes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Filter valid swipes
  const validSwipes = this.swipes.filter(s => s.direction === 'IN' || s.direction === 'OUT');

  // Set status based on count
  if (validSwipes.length < 2) {
    this.status = 'incomplete';
  } else if (validSwipes.length === 2) {
    this.status = 'complete';
  } else {
    this.status = 'duplicate_swipes';
  }

  next();
});
```

**Important Notes**:
- Hook only runs if `swipes` field is modified
- Special statuses are preserved and NOT overridden by hook
- Status is based on count of valid swipes (with direction IN/OUT)

---

## Summary Table: All Scenarios

| Scenario | Creates Record? | Updates Record? | status Value | attendanceStatus Values | Key Conditions |
|----------|----------------|-----------------|-------------|------------------------|----------------|
| **First Swipe** | ✅ | ❌ | `'incomplete'` | `['Late']` or `['On-Time']` | Pre-save hook |
| **Second Swipe (Valid Days)** | ❌ | ✅ | `'complete'` | `['Present']` + optional `['Late']`, `['Early-Exit']`, `['OT']` | Pre-save hook - **'Present' always added** |
| **Second Swipe (Holiday)** | ❌ | ✅ | `'holiday_swipe'` | `['Holiday-Swipe']` **ONLY** | **'Present' NOT added** |
| **Multiple Swipes (Valid Days)** | ❌ | ✅ | `'duplicate_swipes'` | `['Present']` + optional statuses | Pre-save hook - **'Present' always added** |
| **Multiple Swipes (Holiday)** | ❌ | ✅ | `'holiday_swipe'` | `['Holiday-Swipe']` **ONLY** | **'Present' NOT added** |
| **Leave Approved (Regular Full Day)** | ✅ (upsert) | ✅ | `'leave_swipe'` | `['On-Leave']` | No swipes or has swipes |
| **Leave Approved (Regular Half Day + Swipes)** | ✅ (upsert) | ✅ | `'leave_swipe'` | `['On-Leave', 'Present']` | Has swipes, half-day leave |
| **Leave Approved (Regular Half Day + No Swipes)** | ✅ (upsert) | ✅ | `'leave_swipe'` | `['On-Leave']` | No swipes, half-day leave |
| **Leave Approved (Restricted + Swipes)** | ✅ (upsert) | ✅ | `'holiday_swipe'` | `['Holiday-Swipe']` | Has swipes |
| **Leave Approved (Restricted + No Swipes)** | ✅ (upsert) | ✅ | (unchanged) | `['On-Leave']` | No swipes |
| **Leave Rejected (Full Day)** | ❌ | ✅ | (unchanged) | `['Absent']` | Only if record exists with leaveRequestId |
| **Leave Rejected (Half Day + Swipes)** | ❌ | ✅ | (unchanged) | `['Present', 'Absent']` | Has swipes, half-day leave |
| **Leave Rejected (Half Day + No Swipes)** | ❌ | ✅ | (unchanged) | `['Absent']` | No swipes, half-day leave |
| **Regularization Created** | ✅ (bulk only) | ✅ | `'incomplete'` (new) or (unchanged) | Includes `'Pending-Regularization'` | Existing or new record |
| **Regularization Approved** | ❌ | ✅ | `'complete'` | `['Regularized', 'Present']` + preserved statuses | Replaces or preserves swipes |
| **Regularization Rejected** | ❌ | ✅ | (unchanged) | `['Absent']` or `['On-Leave']` | Time fields reset to zero |
| **Regularization Withdrawn** | ❌ | ✅ | (unchanged) | Removes `'Pending-Regularization'` | Regularization cleared |
| **Optional Holiday Approved + Swipes** | ❌ | ✅ | `'holiday_swipe'` | Includes `['Holiday-Swipe']` | Only if record exists with swipes |
| **Optional Holiday Approved + No Swipes** | ❌ | ❌ | (unchanged) | (unchanged) | No update if no record/swipes |
| **Optional Holiday Rejected** | ❌ | ❌ | (unchanged) | (unchanged) | No attendance update |
| **Holiday Detected (Swipe)** | ✅ | ✅ | `'holiday_swipe'` | `['Holiday-Swipe']` **ONLY** | During swipe processing - **'Present' NOT added even with 2 swipes** |
| **Bulk Upload** | ✅ | ❌ | `'complete'` or `'duplicate_swipes'` | Array from conditions | Pre-populated from file |
| **Override (Present)** | ✅ (if not exists) | ✅ | `'overridden'` | `['Override', 'Present']` | Admin override - creates or updates |
| **Override (Absent - New)** | ✅ (if not exists) | ✅ | `'incomplete'` | `['Override', 'Absent']` | Admin override - new record (line 881) |
| **Override (Absent - Existing)** | ❌ | ✅ | `'overridden'` | `['Override', 'Absent']` | Admin override - updates existing (line 259) |
| **Override (Holiday)** | ✅ (if not exists) | ✅ | `'overridden'` | `['Override', 'Holiday-Swipe']` | Admin override - creates or updates |
| **Override (On-Leave)** | ✅ (via leave) | ✅ | `'leave_swipe'` | `['Override', 'On-Leave']` | Admin override - creates/approves leave (line 773) |
| **Override Update** | ❌ | ✅ | (unchanged or updated) | Updated (must include `'Override'`) | Admin modifies existing override |
| **Override Remove** | ❌ | ✅ | Restored to original (if flag=true) | `'Override'` removed or restored | Admin removes override |
| **WFH** | ❌ | ❌ | N/A | N/A | No attendance record operations |

---

## Key Insights

1. **'Present' Status Rule**: `'Present'` is **ONLY** added to `attendanceStatus` for **valid working days** when attendance is complete (both IN and OUT swipes exist). It is **NOT** added for:
   - **Holiday Swipes**: Status remains `['Holiday-Swipe']` only, even with both swipes
   - **Leave Dates**: Status remains `['On-Leave']` only
   - **Absent Days**: Status remains `['Absent']` only
   
   This ensures that holidays and leaves are not counted as "present" working days in payroll and attendance calculations.

2. **Pre-Save Hook**: Automatically sets `status` based on swipe count, but preserves special statuses (`holiday_swipe`, `leave_swipe`, `overridden`, `regularized`, `pending_regularization`).

3. **Leave Approval**: Creates records via `upsert: true` if they don't exist. For restricted holidays with swipes, sets `status: 'holiday_swipe'`.

4. **Regularization**: Can create new records (bulk only) or update existing ones. Approval sets `status: 'complete'` and adds `'Regularized'` and `'Present'` to `attendanceStatus` (for valid working days only).

5. **Restricted Holiday**: Two paths:
   - Via Optional Holiday Request: Only updates if record exists with swipes
   - Via Leave Request: Handles both with/without swipes cases
   - **Note**: `'Present'` is NOT added for restricted holidays - only `['Holiday-Swipe']` or `['On-Leave']`

6. **WFH**: Does NOT interact with attendance records at all.

7. **Status Preservation**: Special statuses are preserved by pre-save hook, preventing accidental overwrites.

8. **Multiple Swipes**: All swipes are preserved, and metrics are recalculated using multiple swipe logic. `'Present'` is added for valid working days only.

9. **Holiday Swipe**: Auto-regularized with `status: 'Approved'` in regularization object. **Important**: `'Present'` is NOT added to `attendanceStatus` for holiday swipes, even when both IN and OUT swipes exist. Only `['Holiday-Swipe']` is maintained.

---

## Recommendations

1. **Consistency**: Consider explicitly setting `status` during leave approval for all cases, not just restricted holidays with swipes.

2. **WFH Integration**: If WFH should affect attendance, add logic to create/update attendance records on WFH approval.

3. **Leave Rejection**: Currently only updates records with `leaveRequestId`. Consider broader matching criteria.

4. **Regularization Rejection**: Currently always sets to `'Absent'` (leave balance check disabled). Re-enable leave balance check if needed.

5. **Documentation**: Add comments explaining why certain statuses are preserved vs. overwritten.

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Author**: AI Analysis  
**Review Status**: Pending
