# Attendance Record Creation & Update - Complete Analysis

## Table of Contents
1. [Overview](#overview)
2. [Attendance Record Model Structure](#attendance-record-model-structure)
3. [Creation Scenarios](#creation-scenarios)
4. [Update Scenarios](#update-scenarios)
5. [Pre-Save Hook (Auto Status Update)](#pre-save-hook-auto-status-update)
6. [Status Transition Summary](#status-transition-summary)
7. [Critical Issues Found](#critical-issues-found)
8. [Data Flow Diagrams](#data-flow-diagrams)
9. [Key Insights](#key-insights)

---

## Overview

This document provides a comprehensive analysis of when and how `AttendanceRecord` documents are created and updated throughout the Zuno HR India API system. The attendance system supports multiple entry methods including biometric swipes, bulk uploads, leave management, regularization, and admin overrides.

**Key Model**: `src/models/attendance-record.model.ts`  
**Primary Services**:
- `BiometricAttendanceService` - Real-time swipe processing
- `BulkAttendanceUploadService` - Excel/CSV bulk imports
- `AttendanceRegularizationService` - Regularization requests
- `AttendanceOverrideService` - Admin manual overrides
- `LeaveService` - Leave approval integration

---

## Attendance Record Model Structure

### Core Fields

```typescript
interface IAttendanceRecord {
  userId: Types.ObjectId;              // Employee reference
  shiftId: Types.ObjectId;             // Shift reference
  shiftCode: string;                    // Shift code (e.g., "SHIFT-A")
  shiftDay: Date;                      // Date normalized to UTC start of day
  shiftStart: Date;                    // Shift start time (UTC)
  shiftEnd: Date;                      // Shift end time (UTC)
  
  // Swipe Data
  swipes: Array<{
    timestamp: Date;
    direction: 'IN' | 'OUT';
    deviceId: string;
    location?: { latitude, longitude, accuracy, altitude, address };
  }>;
  firstIn: Date | null;                 // First IN swipe timestamp
  lastOut: Date | null;                 // Last OUT swipe timestamp
  
  // Status Flags
  isWithinWindow: boolean;              // Swipe within allowed window
  isLateEntry: boolean;                // Entry after shift start
  isEarlyExit: boolean;                // Exit before shift end
  needsRegularization: boolean;         // Requires regularization
  
  // Time Calculations
  totalWorkHours: string;               // Format: "HH:mm:ss"
  breakHours: string;
  actualWorkHours: string;
  shiftHours: string;
  shortfallHours: string;              // Hours less than required
  excessHours: string;                 // Overtime hours
  overtimeStart?: Date;
  overtimeEnd?: Date;
  
  // Status Fields
  status: 'incomplete' | 'complete' | 'duplicate_swipes' | 
         'missing_checkout' | 'holiday_swipe' | 'leave_swipe' | 
         'pending_regularization' | 'regularized' | 'overridden';
  
  attendanceStatus: Array<
    'Present' | 'Late' | 'On-Time' | 'Early-Exit' | 'Absent' | 
    'On-Leave' | 'Out-Of-Window' | 'Holiday-Swipe' | 
    'Pending-Regularization' | 'Regularized' | 'OT' | 'Override'
  >;
  
  // Out-of-Window Swipes
  outOfWindowSwipes: Array<{
    timestamp: Date;
    direction: 'IN' | 'OUT';
    deviceId: string;
    location?: {...};
    reason?: string;
  }>;
  
  // Regularization
  regularization?: {
    isRegularized: boolean;
    hasRegularizationRequest: boolean;
    regularizedAt?: Date;
    regularizedBy?: Types.ObjectId;
    regularizationType?: string[];
    remarks?: string;
    status: 'Pending' | 'Approved' | 'Rejected-Absent' | 'Rejected-Leave';
    regularizationId: Types.ObjectId;
  };
  
  // Override
  override?: {
    isOverridden: boolean;
    overriddenAt: Date;
    overriddenBy: Types.ObjectId;
    lastModifiedAt?: Date;
    lastModifiedBy?: Types.ObjectId;
    reason: string;
    remarks?: string;
    originalStatus?: string;
    originalAttendanceStatus?: string[];
    originalFirstIn?: Date | null;
    originalLastOut?: Date | null;
    originalTotalWorkHours?: string;
    originalActualWorkHours?: string;
    overrideHistory?: Array<{
      action: 'created' | 'modified' | 'removed';
      performedBy: Types.ObjectId;
      performedAt: Date;
      changes?: Array<{ field: string; oldValue: any; newValue: any }>;
      reason?: string;
    }>;
  };
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Database Indexes

```typescript
// Unique constraint: One record per user per day per shift
{ userId: 1, shiftDay: 1, shiftCode: 1 } - UNIQUE

// Query indexes
{ shiftDay: 1 }
{ shiftStart: 1 }
{ shiftEnd: 1 }
{ attendanceStatus: 1 }
{ 'override.isOverridden': 1 }
{ 'override.overriddenBy': 1 }
{ 'override.overriddenAt': 1 }
```

---

## Creation Scenarios

### A. Biometric Swipe (First Swipe of Day)

**Location**: `src/services/biometric-attendance.service.ts:238-302`  
**Route**: `POST /attendance/swipe`  
**Method**: `BiometricAttendanceService.findOrCreateAttendanceRecord()`

#### Flow

1. **User swipes biometric device**
   - Request contains: `biometricId`, `timestamp`, `location` (optional)

2. **System validates and gets shift assignment**
   ```typescript
   const user = await getUserByBiometricId(biometricId);
   const shiftAssignment = await getCurrentShiftAssignment(user._id, timestamp);
   const shift = shiftAssignment.shiftId;
   ```

3. **Calculate shift window timings**
   ```typescript
   const shiftDay = new Date(timestamp);
   shiftDay.setUTCHours(0, 0, 0, 0); // Normalize to UTC start of day
   const shiftWindow = getShiftTimings(shift, shiftDay);
   // Returns: { shiftStart, shiftEnd, windowStart, windowEnd }
   ```

4. **Find or create attendance record**
   ```typescript
   let record = await AttendanceRecord.findOne({
     userId,
     shiftDay,
     shiftCode,
   });
   
   if (!record) {
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
       attendanceStatus: [],
       isLateEntry: false,
       isEarlyExit: false,
       isWithinWindow: true,
       excessHours: '0:00:00',
       shortfallHours: '0:00:00',
       // status: 'incomplete' - NOT SET (relies on pre-save hook)
     });
   }
   ```

5. **Holiday detection** (if record found/created)
   ```typescript
   const holiday = await checkHolidayCalendar(userId, shiftDay);
   if (holiday) {
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
   ```

#### Initial State

- **swipes**: `[]` (empty)
- **status**: `'incomplete'` (set by pre-save hook if swipes modified)
- **attendanceStatus**: `[]` (empty) or `['Holiday-Swipe']` if holiday
- **firstIn**: `null`
- **lastOut**: `null`
- **All time fields**: `'0:00:00'`

#### Key Points

- ⚠️ **Status not explicitly set** during creation - relies on pre-save hook
- Holiday detection happens **after** record creation
- Record is created **before** first swipe is processed

---

### B. Bulk Attendance Upload

**Location**: `src/services/bulk-attendance-upload.service.ts:1207-1244`  
**Route**: `POST /bulk-upload/process`  
**Method**: `BulkAttendanceUploadService.createAttendanceRecordsWithShiftMapping()`

#### Flow

1. **Admin uploads Excel/CSV file**
   - File contains: `userId`, `date`, `inTime`, `outTime`, `shiftCode`, etc.

2. **System processes each row**
   ```typescript
   // Parse and validate row data
   const shiftDay = new Date(row.date);
   shiftDay.setUTCHours(0, 0, 0, 0);
   
   // Convert local times to UTC
   const inTimeUTC = convertToUTC(row.inTime, shiftDay, userCountry);
   const outTimeUTC = convertToUTC(row.outTime, shiftDay, userCountry);
   
   // Find shift assignment
   const shiftAssignmentId = findShiftAssignmentForDate(shiftDay, shiftAssignmentMap);
   
   // Calculate shift timings
   const { shiftStart, shiftEnd } = getShiftTimings(shift, shiftDay);
   
   // Build swipes array
   const swipes = [
     { timestamp: inTimeUTC, direction: 'IN', deviceId: 'bulk-upload', location: {...} },
     { timestamp: outTimeUTC, direction: 'OUT', deviceId: 'bulk-upload', location: {...} }
   ];
   
   // Calculate all metrics upfront
   const totalWorkHours = calculateDuration(inTimeUTC, outTimeUTC);
   const shiftHours = calculateDuration(shiftStart, shiftEnd);
   const actualWorkHours = totalWorkHours; // No break calculation in bulk
   const shortfallHours = calculateShortfall(...);
   const excessHours = calculateExcess(...);
   
   // Determine status
   let status: IAttendanceRecord['status'] = 'complete';
   if (swipes.length > 2) {
     status = 'duplicate_swipes';
   }
   
   // Build attendanceStatus array
   const attendanceStatus = [];
   if (isLateEntry) attendanceStatus.push('Late');
   if (isEarlyExit) attendanceStatus.push('Early-Exit');
   if (hasOvertime) attendanceStatus.push('OT');
   attendanceStatus.push('Present');
   if (isHoliday) attendanceStatus.push('Holiday-Swipe');
   ```

3. **Create attendance record**
   ```typescript
   const attendanceRecord = new AttendanceRecord({
     userId: new Types.ObjectId(row.userId),
     shiftId: shiftAssignmentId,
     shiftCode: row.shiftCode,
     shiftDay,
     shiftStart: shiftStartUTC,
     shiftEnd: adjustedShiftEndUTC,
     swipes,
     firstIn: inTimeUTC,
     lastOut: adjustedOutTimeUTC,
     isWithinWindow: hasOvertime ? true : isWithinWindow,
     isLateEntry,
     isEarlyExit,
     needsRegularization: false,
     totalWorkHours,
     breakHours: '0:00:00', // Default
     actualWorkHours: totalWorkHours,
     shiftHours,
     shortfallHours: '0:00:00',
     excessHours: hasOvertime ? formatOvertimeHours(overtimeHours) : '0:00:00',
     overtimeStart: hasOvertime ? adjustedShiftEndUTC : undefined,
     overtimeEnd: hasOvertime ? adjustedOutTimeUTC : undefined,
     status,
     attendanceStatus,
     outOfWindowSwipes: [],
     regularization: {
       isRegularized: false,
       hasRegularizationRequest: false,
       status: 'Pending'
     }
   });
   ```

4. **Bulk insert**
   ```typescript
   if (attendanceRecords.length > 0) {
     await AttendanceRecord.insertMany(attendanceRecords);
   }
   ```

#### Initial State

- **swipes**: Pre-populated with IN and OUT swipes
- **status**: `'complete'` or `'duplicate_swipes'` (set explicitly)
- **attendanceStatus**: Array with calculated statuses (`['Present', 'Late', 'OT']` etc.)
- **firstIn**: Set from file data
- **lastOut**: Set from file data
- **All time fields**: Calculated and populated

#### Key Points

- ✅ **Fully populated** on creation (unlike biometric swipe)
- Status is **explicitly set** (not relying on pre-save hook)
- All calculations done **before** database insert
- Uses `insertMany()` for performance

---

### C. Leave Approval

**Location**: `src/services/leave.service.ts:1129-1158`  
**Route**: `PUT /leaves/:id` (status update to 'Approved')  
**Method**: `LeaveService.updateStatus()`

#### Flow

1. **Leave request approved**
   ```typescript
   if (updateData.status === 'Approved') {
     const startDate = new Date(leave.startDate);
     const endDate = new Date(leave.endDate);
   ```

2. **Create/update attendance records for each day**
   ```typescript
   const currentDate = new Date(startDate);
   while (currentDate <= endDate) {
     await AttendanceRecord.findOneAndUpdate(
       {
         userId: leave.userId,
         shiftDay: currentDate,
       },
       {
         $set: {
           attendanceStatus: ['On-Leave'],
           updatedAt: new Date(),
           updatedBy: updateData.approvedById
         }
       },
       { upsert: true, strict: false }
     );
     currentDate.setDate(currentDate.getDate() + 1);
   }
   ```

#### Initial State (if created via upsert)

- **swipes**: `[]` (empty - no swipes for leave days)
- **status**: Not explicitly set (defaults to 'incomplete')
- **attendanceStatus**: `['On-Leave']`
- **firstIn**: `null`
- **lastOut**: `null`
- **All time fields**: Not set (defaults to '0:00:00')

#### Key Points

- Uses **upsert** - creates if doesn't exist, updates if exists
- **No swipes** recorded for leave days
- Only `attendanceStatus` is set
- Other fields remain at defaults

---

### D. Regularization Request (No Existing Record)

**Location**: `src/services/attendance-regularization.service.ts:522-540`  
**Route**: `POST /attendance-regularizations`  
**Method**: `AttendanceRegularizationService.createBulkRegularization()`

#### Flow

1. **User requests regularization for missing attendance**
   ```typescript
   // Input: userId, date, fromTime, toTime, reason
   const shiftDay = new Date(date);
   shiftDay.setUTCHours(0, 0, 0, 0);
   ```

2. **Check if attendance record exists**
   ```typescript
   let attendance;
   if (attendanceId) {
     attendance = await AttendanceRecord.findById(attendanceId);
   }
   ```

3. **Create new record if doesn't exist**
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
   }
   ```

4. **Link to regularization record**
   ```typescript
   const regularization = new AttendanceRegularization({
     attendanceId: attendance._id,
     userId: new Types.ObjectId(userId),
     from: requestedFrom,
     to: requestedTo,
     shiftDay,
     reason,
     status: 'Pending',
     approver
   });
   await regularization.save();
   
   attendance.regularization = {
     hasRegularizationRequest: true,
     isRegularized: false,
     status: 'Pending',
     regularizationId: regularization._id,
   };
   await attendance.save();
   ```

#### Initial State

- **swipes**: `[]` (empty)
- **status**: `'incomplete'` (explicitly set)
- **attendanceStatus**: `['Pending-Regularization']`
- **needsRegularization**: `true`
- **regularization**: Linked to `AttendanceRegularization` record

#### Key Points

- Created when user requests regularization for **missing attendance**
- Status explicitly set to `'incomplete'`
- Regularization object created and linked

---

### E. Admin Override (New Record)

**Location**: `src/services/attendance-override.service.ts:150-328`  
**Route**: `POST /attendance-overrides`  
**Method**: `AttendanceOverrideService.createOverride()`

#### Flow

1. **Admin creates override for absent/missing attendance**
   ```typescript
   // Input: userId, shiftDay, attendanceStatus, firstIn, lastOut, reason, remarks
   const shiftDay = new Date(data.shiftDay);
   shiftDay.setUTCHours(0, 0, 0, 0);
   ```

2. **Check if record exists**
   ```typescript
   let record = await AttendanceRecord.findOne({
     userId: new Types.ObjectId(data.userId),
     shiftDay,
   });
   const isNewRecord = !record;
   ```

3. **Create new record if doesn't exist**
   ```typescript
   if (!record) {
     // Get shift assignment
     const shiftAssignment = await getCurrentShiftAssignment(userId, shiftDay);
     
     // Prepare override data
     const overrideData = await prepareOverrideRecordData(
       data, shiftAssignment, shiftDay, targetStatus, ...
     );
     
     // Create swipes array (empty for Absent/Holiday, populated for Present)
     const swipes = [];
     if (overrideData.firstIn && overrideData.lastOut) {
       swipes.push({
         timestamp: overrideData.firstIn,
         direction: 'IN',
         deviceId: 'override',
         location: { latitude: 0, longitude: 0, ... }
       });
       swipes.push({
         timestamp: overrideData.lastOut,
         direction: 'OUT',
         deviceId: 'override',
         location: { latitude: 0, longitude: 0, ... }
       });
     }
     
     record = new AttendanceRecord({
       userId: new Types.ObjectId(data.userId),
       shiftId: shiftAssignment.shiftId,
       shiftCode: shiftAssignment.shiftCode,
       shiftDay,
       shiftStart: shiftAssignment.shiftStart,
       shiftEnd: shiftAssignment.shiftEnd,
       swipes,
       attendanceStatus: data.attendanceStatus, // ['Override', 'Present'] etc.
       status: 'overridden',
       // ... all fields from overrideData
     });
   }
   ```

4. **Set override object**
   ```typescript
   record.override = {
     isOverridden: true,
     overriddenAt: new Date(),
     overriddenBy: adminId,
     lastModifiedAt: new Date(),
     lastModifiedBy: adminId,
     reason: reason,
     remarks: data.remarks,
     originalStatus: undefined, // New record, no original
     originalAttendanceStatus: [],
     originalFirstIn: null,
     originalLastOut: null,
     originalTotalWorkHours: '00:00:00',
     originalActualWorkHours: '00:00:00',
     overrideHistory: [{
       action: 'created',
       performedBy: adminId,
       performedAt: new Date(),
       changes: [],
       reason: reason,
     }],
   };
   
   await record.save();
   ```

#### Initial State

- **swipes**: Empty for Absent/Holiday, populated for Present
- **status**: `'overridden'` (explicitly set)
- **attendanceStatus**: From input (e.g., `['Override', 'Present']`)
- **override**: Fully populated with history

#### Key Points

- Admin can create override for **any date** (past or future)
- Override history tracks all changes
- Original values are `undefined/null` for new records

---

## Update Scenarios

### A. First Swipe Processing

**Location**: `src/services/biometric-attendance.service.ts:390-441`  
**Method**: `BiometricAttendanceService.processFirstSwipe()`

#### Trigger

First biometric swipe of the day (IN swipe)

#### Updates

```typescript
// Create IN swipe
const inSwipe = {
  timestamp,
  direction: 'IN',
  deviceId: 'biometric',
  location: locationData || { latitude: 0, longitude: 0, ... }
};

// Update record
record.swipes = [inSwipe];
record.firstIn = timestamp;
record.isLateEntry = timestamp > shiftWindow.shiftStart;
record.attendanceStatus = record.isLateEntry ? ['Late'] : ['On-Time'];
record.needsRegularization = record.isLateEntry;

// Initialize time calculations
record.totalWorkHours = '00:00:00';
record.breakHours = '00:00:00';
record.shortfallHours = '00:00:00';
record.excessHours = '00:00:00';
record.actualWorkHours = "00:00:00";
record.shiftHours = workDuration || "09:00:00";

await record.save();
```

#### Status Changes

- **Pre-save hook**: Sets `status = 'missing_checkout'` (1 swipe)
- **attendanceStatus**: `['Late']` or `['On-Time']`
- **needsRegularization**: `true` if late entry

---

### B. Second Swipe Processing

**Location**: `src/services/biometric-attendance.service.ts:443-516`  
**Method**: `BiometricAttendanceService.processSecondSwipe()`

#### Trigger

Second biometric swipe of the day (OUT swipe)

#### Updates

```typescript
// Create OUT swipe
const outSwipe = {
  timestamp,
  direction: 'OUT',
  deviceId: 'biometric',
  location: locationData || { latitude: 0, longitude: 0, ... }
};

// Update record
record.swipes.push(outSwipe);
record.lastOut = timestamp;
record.isEarlyExit = timestamp < shiftWindow.shiftEnd;

// Calculate metrics
const metrics = await calculateAttendanceMetrics(
  record.firstIn!,
  timestamp,
  shiftWindow.shiftStart,
  shiftWindow.shiftEnd
);

// Update all time-related fields
record.totalWorkHours = metrics.totalWorkHours;
record.breakHours = metrics.breakHours;
record.actualWorkHours = metrics.actualWorkHours;
record.shortfallHours = metrics.shortfallHours;
record.excessHours = metrics.excessHours;

// Update attendance status
if (record.isEarlyExit) {
  record.attendanceStatus.push('Early-Exit');
}

// Update regularization flag
record.needsRegularization =
  record.isLateEntry ||
  record.isEarlyExit ||
  metrics.hasShortfall ||
  !record.isWithinWindow;

// Add Present status
const isPresent = record.isLateEntry ||
  record.isEarlyExit ||
  !record.isWithinWindow;
if (isPresent) {
  record.attendanceStatus.push('Present');
}

await record.save();
```

#### Status Changes

- **Pre-save hook**: Sets `status = 'complete'` (2 swipes)
- **attendanceStatus**: May include `'Early-Exit'` and `'Present'`
- **All time fields**: Calculated and updated

#### Metrics Calculation

```typescript
// Total duration in minutes
const totalMinutes = (lastOut.getTime() - firstIn.getTime()) / (1000 * 60);
const shiftMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60);

// Break calculation (30 min for > 6 hours)
const breakMinutes = totalMinutes > 360 ? 30 : 0;

// Actual work minutes
const actualWorkMinutes = totalMinutes - breakMinutes;

// Shortfall/excess
const difference = actualWorkMinutes - shiftMinutes;

return {
  totalWorkHours: formatDuration(totalMinutes),
  breakHours: formatDuration(breakMinutes),
  actualWorkHours: formatDuration(actualWorkMinutes),
  shiftHours: formatDuration(shiftMinutes),
  shortfallHours: difference < 0 ? formatDuration(Math.abs(difference)) : '00:00:00',
  excessHours: difference > 0 ? formatDuration(difference) : '00:00:00',
  hasShortfall: difference < 0,
  hasExcessHours: difference > 0
};
```

---

### C. Out-of-Window Swipe

**Location**: `src/services/biometric-attendance.service.ts:562-602`  
**Method**: `BiometricAttendanceService.processOutOfWindowSwipe()`

#### Trigger

Swipe outside allowed time window (before windowStart or after windowEnd)

#### Updates

```typescript
// Add to outOfWindowSwipes array
const outOfWindowSwipe = {
  timestamp,
  direction, // 'IN' or 'OUT'
  deviceId: 'biometric',
  location: locationData || { latitude: 0, longitude: 0, ... },
  reason
};

record.outOfWindowSwipes.push(outOfWindowSwipe);

// Mark for regularization
record.needsRegularization = true;

// Update attendance status
if (!record.attendanceStatus.includes('Out-Of-Window')) {
  record.attendanceStatus.push('Out-Of-Window');
}

await record.save();
```

#### Status Changes

- **attendanceStatus**: Adds `'Out-Of-Window'` if not already present
- **needsRegularization**: Set to `true`
- **outOfWindowSwipes**: New entry added

#### Key Points

- Out-of-window swipes are **logged separately** from regular swipes
- Still processed as IN/OUT swipe (added to `swipes` array)
- Requires regularization

---

### D. Regularization Request (Existing Record)

**Location**: `src/services/attendance-regularization.service.ts:542-580`  
**Method**: `AttendanceRegularizationService.createBulkRegularization()`

#### Trigger

User requests regularization for existing attendance record

#### Updates

```typescript
// Find existing attendance record
let attendance = await AttendanceRecord.findById(attendanceId);

if (attendance) {
  // Add Pending-Regularization status
  if (!attendance.attendanceStatus.includes('Pending-Regularization')) {
    attendance.attendanceStatus.push('Pending-Regularization');
  }
  attendance.needsRegularization = true;
}

// Create regularization record
const regularization = new AttendanceRegularization({
  attendanceId: attendance._id,
  userId: new Types.ObjectId(userId),
  from: requestedFrom,
  to: requestedTo,
  shiftDay,
  reason,
  status: 'Pending',
  approver
});
await regularization.save();

// Link to attendance record
attendance.regularization = {
  hasRegularizationRequest: true,
  isRegularized: false,
  status: 'Pending',
  regularizationId: regularization._id,
};

await attendance.save();
```

#### Status Changes

- **attendanceStatus**: Adds `'Pending-Regularization'` if not present
- **needsRegularization**: Set to `true`
- **regularization**: Linked to new `AttendanceRegularization` record

---

### E. Regularization Approval

**Location**: `src/services/attendance-regularization.service.ts:974-1050`  
**Method**: `AttendanceRegularizationService.handleApproval()`

#### Trigger

Manager/Admin approves regularization request

#### Updates

```typescript
const attendanceRecord = await AttendanceRecord.findById(regularization.attendanceId);

// Remove Pending-Regularization
attendanceRecord.attendanceStatus = attendanceRecord.attendanceStatus.filter(
  (status) => status !== 'Pending-Regularization'
);

// Update swipes with regularization times
attendanceRecord.swipes = [
  {
    timestamp: regularization.from,
    direction: 'IN',
    deviceId: 'regularization',
    location: { latitude: 0, longitude: 0, ... }
  },
  {
    timestamp: regularization.to,
    direction: 'OUT',
    deviceId: 'regularization',
    location: { latitude: 0, longitude: 0, ... }
  }
];

// Update timestamps
attendanceRecord.firstIn = regularization.from;
attendanceRecord.lastOut = regularization.to;

// Recalculate all metrics
const metrics = calculateAttendanceMetrics(
  regularization.from,
  regularization.to,
  shiftWindow.shiftStart,
  shiftWindow.shiftEnd
);

attendanceRecord.totalWorkHours = metrics.totalWorkHours;
attendanceRecord.actualWorkHours = metrics.actualWorkHours;
attendanceRecord.breakHours = metrics.breakHours;
attendanceRecord.shortfallHours = metrics.shortfallHours;
attendanceRecord.excessHours = metrics.excessHours;

// Update regularization status
attendanceRecord.regularization = {
  isRegularized: true,
  hasRegularizationRequest: true,
  regularizedAt: new Date(),
  regularizedBy: approver.id,
  regularizationType: ['Regularized'],
  status: 'Approved',
  regularizationId: regularization._id,
};

// Update attendance status
attendanceRecord.attendanceStatus.push('Regularized');
attendanceRecord.attendanceStatus.push('Present');
attendanceRecord.needsRegularization = false;

await attendanceRecord.save();
```

#### Status Changes

- **swipes**: Replaced with regularization times
- **firstIn/lastOut**: Updated to regularization times
- **status**: May change to `'complete'` (pre-save hook, 2 swipes)
- **attendanceStatus**: Adds `'Regularized'` and `'Present'`
- **regularization.isRegularized**: `true`
- **regularization.status**: `'Approved'`
- **All time fields**: Recalculated

---

### F. Regularization Rejection

**Location**: `src/services/attendance-regularization.service.ts:866-950`  
**Method**: `AttendanceRegularizationService.handleRejection()`

#### Trigger

Manager/Admin rejects regularization request

#### Updates

```typescript
const attendanceRecord = await AttendanceRecord.findById(regularization.attendanceId);

// Remove Pending-Regularization
attendanceRecord.attendanceStatus = attendanceRecord.attendanceStatus.filter(
  (status) => status !== 'Pending-Regularization'
);

// Check leave balance
const hasLeaveBalance = false; // Simplified - actual logic checks leave summary

if (hasLeaveBalance) {
  // Update leave balance
  await updateLeaveSummary(userId, year, 'annual');
  attendanceRecord.attendanceStatus = ['On-Leave'];
} else {
  // Mark as Absent
  if (!attendanceRecord.attendanceStatus.includes('Absent')) {
    attendanceRecord.attendanceStatus.push('Absent');
  }
}

// Update regularization status
attendanceRecord.regularization = {
  hasRegularizationRequest: true,
  isRegularized: false,
  status: 'Rejected-Absent', // or 'Rejected-Leave'
  regularizationId: regularization._id,
  remarks: regularization.comments || "Rejected",
};

// Reset all time fields
attendanceRecord.totalWorkHours = '00:00:00';
attendanceRecord.breakHours = '00:00:00';
attendanceRecord.actualWorkHours = '00:00:00';
attendanceRecord.shortfallHours = '00:00:00';
attendanceRecord.excessHours = '00:00:00';

await attendanceRecord.save();
```

#### Status Changes

- **attendanceStatus**: Becomes `['On-Leave']` or `['Absent']`
- **regularization.status**: `'Rejected-Absent'` or `'Rejected-Leave'`
- **All time fields**: Reset to `'00:00:00'`
- **swipes**: Not modified (keeps original if any)

---

### G. Leave Rejection/Cancellation

**Location**: `src/services/leave.service.ts:1160-1195`  
**Method**: `LeaveService.updateStatus()`

#### Trigger

Leave request rejected or cancelled

#### Updates

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
        leaveRequestId: leave._id,
      },
      {
        $set: {
          attendanceStatus: "Absent", // ⚠️ BUG: Should be ['Absent']
          updatedAt: new Date(),
          updatedBy: rejectedById || approvedById,
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

#### Status Changes

- **attendanceStatus**: Changed from `['On-Leave']` to `"Absent"` (string - **BUG!**)
- **leaveRequestId**: Removed (unset)

#### ⚠️ Critical Bug

**Line 1182**: Sets `attendanceStatus` as **string** instead of **array**:
```typescript
attendanceStatus: "Absent", // ❌ Should be ['Absent']
```

**Impact**: Schema violation - `attendanceStatus` is defined as `Array<string>` in the model.

**Fix Required**:
```typescript
attendanceStatus: ['Absent'], // ✅ Correct
```

---

### H. Admin Override (Existing Record)

**Location**: `src/services/attendance-override.service.ts:100-328`  
**Method**: `AttendanceOverrideService.createOverride()`

#### Trigger

Admin overrides existing attendance record

#### Updates

```typescript
// Store original values
const originalStatus = record.status;
const originalAttendanceStatus = [...record.attendanceStatus];
const originalFirstIn = record.firstIn;
const originalLastOut = record.lastOut;
const originalTotalWorkHours = record.totalWorkHours;
const originalActualWorkHours = record.actualWorkHours;

// Prepare override data
const overrideData = await prepareOverrideRecordData(
  data, shiftAssignment, shiftDay, targetStatus, ...
);

// Create/update swipes array
const swipes = [];
if (overrideData.firstIn && overrideData.lastOut) {
  swipes.push({
    timestamp: overrideData.firstIn,
    direction: 'IN',
    deviceId: 'override',
    location: { latitude: 0, longitude: 0, ... }
  });
  swipes.push({
    timestamp: overrideData.lastOut,
    direction: 'OUT',
    deviceId: 'override',
    location: { latitude: 0, longitude: 0, ... }
  });
}

// Update record
record.attendanceStatus = data.attendanceStatus; // ['Override', 'Present'] etc.
record.status = 'overridden';
record.swipes = swipes;
record.firstIn = overrideData.firstIn;
record.lastOut = overrideData.lastOut;
record.totalWorkHours = overrideData.totalWorkHours;
record.breakHours = overrideData.breakHours;
record.actualWorkHours = overrideData.actualWorkHours;
record.shiftHours = overrideData.shiftHours;
record.shortfallHours = overrideData.shortfallHours;
record.excessHours = overrideData.excessHours;
record.isLateEntry = overrideData.isLateEntry;
record.isEarlyExit = overrideData.isEarlyExit;
record.needsRegularization = false;
record.isWithinWindow = true;

// Clear regularization
if (record.regularization) {
  record.regularization = undefined;
}

// Set override object
const now = new Date();
record.override = {
  isOverridden: true,
  overriddenAt: record.override?.overriddenAt || now,
  overriddenBy: adminId,
  lastModifiedAt: now,
  lastModifiedBy: adminId,
  reason: reason,
  remarks: data.remarks,
  originalStatus: originalStatus,
  originalAttendanceStatus: originalAttendanceStatus,
  originalFirstIn: originalFirstIn,
  originalLastOut: originalLastOut,
  originalTotalWorkHours: originalTotalWorkHours,
  originalActualWorkHours: originalActualWorkHours,
  overrideHistory: [
    ...(record.override?.overrideHistory || []),
    {
      action: 'modified',
      performedBy: adminId,
      performedAt: now,
      changes: calculateChanges(...),
      reason: reason,
    },
  ],
};

await record.save();
```

#### Status Changes

- **status**: Changed to `'overridden'`
- **attendanceStatus**: Replaced with override values
- **swipes**: Replaced with override swipes (or empty for Absent)
- **All fields**: Updated from override data
- **override**: Original values stored, history entry added
- **regularization**: Cleared (override takes precedence)

---

### I. Override Update

**Location**: `src/services/attendance-override.service.ts:333-420`  
**Method**: `AttendanceOverrideService.updateOverride()`

#### Trigger

Admin modifies existing override

#### Updates

```typescript
// Store current values
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

if (data.reason) {
  record.override.reason = data.reason;
}

if (data.remarks !== undefined) {
  record.override.remarks = data.remarks;
}

if (data.firstIn) {
  record.firstIn = new Date(data.firstIn);
}

if (data.lastOut) {
  record.lastOut = new Date(data.lastOut);
}

if (data.totalWorkHours) {
  record.totalWorkHours = data.totalWorkHours;
}

if (data.actualWorkHours) {
  record.actualWorkHours = data.actualWorkHours;
}

// Update override metadata
const now = new Date();
record.override.lastModifiedAt = now;
record.override.lastModifiedBy = adminId;

// Add to history
if (!record.override.overrideHistory) {
  record.override.overrideHistory = [];
}
record.override.overrideHistory.push({
  action: 'modified',
  performedBy: adminId,
  performedAt: now,
  changes: calculateChanges(
    currentStatus,
    data.status || currentStatus,
    currentAttendanceStatus,
    data.attendanceStatus || currentAttendanceStatus,
    currentFirstIn,
    data.firstIn ? new Date(data.firstIn) : currentFirstIn,
    currentLastOut,
    data.lastOut ? new Date(data.lastOut) : currentLastOut
  ),
  reason: modificationReason,
});

await record.save();
```

#### Status Changes

- **Fields updated**: Only those provided in `data`
- **override.lastModifiedAt**: Updated
- **override.lastModifiedBy**: Updated
- **override.overrideHistory**: New entry added with changes

---

### J. Override Removal

**Location**: `src/services/attendance-override.service.ts:425-484`  
**Method**: `AttendanceOverrideService.removeOverride()`

#### Trigger

Admin removes override

#### Updates

```typescript
// Store original values
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

if (restoreOriginal && originalFirstIn !== undefined) {
  record.firstIn = originalFirstIn;
}

if (restoreOriginal && originalLastOut !== undefined) {
  record.lastOut = originalLastOut;
}

// Add to history
const now = new Date();
if (!record.override.overrideHistory) {
  record.override.overrideHistory = [];
}
record.override.overrideHistory.push({
  action: 'removed',
  performedBy: adminId,
  performedAt: now,
  changes: [],
  reason: reason || 'Override removed',
});

// Clear override flag (but keep history)
record.override.isOverridden = false;
record.override.lastModifiedAt = now;
record.override.lastModifiedBy = adminId;

await record.save();
```

#### Status Changes

- **status**: Restored to original (if `restoreOriginal = true`)
- **attendanceStatus**: Restored to original or `'Override'` removed
- **firstIn/lastOut**: Restored to original (if `restoreOriginal = true`)
- **override.isOverridden**: Set to `false`
- **override.overrideHistory**: New entry added

---

## Pre-Save Hook (Auto Status Update)

**Location**: `src/models/attendance-record.model.ts:358-377`

### Trigger

Before every `save()` operation, **only if `swipes` array is modified**

### Logic

```typescript
attendanceRecordSchema.pre('save', function (next) {
  if (!this.isModified('swipes')) {
    return next(); // Skip if swipes not modified
  }

  // Sort swipes by timestamp
  this.swipes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Update status based on swipe count
  if (this.swipes.length === 2) {
    this.status = 'complete';
  } else if (this.swipes.length > 2) {
    this.status = 'duplicate_swipes';
  } else {
    this.status = 'missing_checkout';
  }

  next();
});
```

### Auto Status Assignment

| Swipe Count | Status Assigned |
|------------|----------------|
| 0 swipes | `'incomplete'` (default) |
| 1 swipe | `'missing_checkout'` |
| 2 swipes | `'complete'` |
| >2 swipes | `'duplicate_swipes'` |

### Important Notes

- ⚠️ **Only runs if `swipes` is modified** - if you update other fields without touching swipes, status won't auto-update
- Swipes are **automatically sorted** by timestamp
- Status is **overridden** by this hook (even if explicitly set)
- This hook runs **after** your code sets status, so explicit status setting may be overridden

---

## Status Transition Summary

### Status Field Values

| Status | Description | When Set |
|--------|-------------|----------|
| `'incomplete'` | Initial state, no swipes | Default, or 0 swipes |
| `'missing_checkout'` | Only IN swipe recorded | Pre-save hook (1 swipe) |
| `'complete'` | Both IN and OUT swipes | Pre-save hook (2 swipes) |
| `'duplicate_swipes'` | More than 2 swipes | Pre-save hook (>2 swipes) |
| `'holiday_swipe'` | Swipe on holiday | Holiday detection |
| `'leave_swipe'` | Leave approved | Leave approval (not actively used) |
| `'pending_regularization'` | Regularization requested | Regularization request |
| `'regularized'` | Regularization approved | Regularization approval |
| `'overridden'` | Admin override applied | Admin override |

### AttendanceStatus Array Values

| Status | Description | When Added |
|--------|-------------|------------|
| `'Present'` | Employee present | Second swipe, regularization approval |
| `'Late'` | Late entry | First swipe after shift start |
| `'On-Time'` | On-time entry | First swipe before/at shift start |
| `'Early-Exit'` | Early departure | Second swipe before shift end |
| `'Absent'` | Absent | Leave rejection, regularization rejection |
| `'On-Leave'` | On approved leave | Leave approval |
| `'Out-Of-Window'` | Swipe outside window | Out-of-window swipe |
| `'Holiday-Swipe'` | Swipe on holiday | Holiday detection |
| `'Pending-Regularization'` | Regularization pending | Regularization request |
| `'Regularized'` | Regularization approved | Regularization approval |
| `'OT'` | Overtime | Bulk upload with overtime |
| `'Override'` | Admin override | Admin override |

### Status Transition Flow

```
[No Record]
    │
    ├─ Biometric Swipe ──→ [incomplete] ──→ [missing_checkout] ──→ [complete]
    │
    ├─ Bulk Upload ──→ [complete] or [duplicate_swipes]
    │
    ├─ Leave Approval ──→ [incomplete] (attendanceStatus: ['On-Leave'])
    │
    ├─ Regularization Request ──→ [incomplete] (attendanceStatus: ['Pending-Regularization'])
    │
    └─ Admin Override ──→ [overridden]

[Existing Record]
    │
    ├─ Regularization Approval ──→ [complete] (attendanceStatus: ['Regularized', 'Present'])
    │
    ├─ Regularization Rejection ──→ [incomplete] (attendanceStatus: ['Absent'] or ['On-Leave'])
    │
    ├─ Leave Rejection ──→ [incomplete] (attendanceStatus: ['Absent'])
    │
    └─ Admin Override ──→ [overridden]
```

---

## Critical Issues Found

### Issue 1: Leave Rejection - attendanceStatus Type Mismatch

**Location**: `src/services/leave.service.ts:1182`

**Problem**:
```typescript
$set: {
  attendanceStatus: "Absent", // ❌ String instead of array
}
```

**Expected**:
```typescript
$set: {
  attendanceStatus: ['Absent'], // ✅ Array
}
```

**Impact**: 
- Schema violation - `attendanceStatus` is defined as `Array<string>` in model
- May cause runtime errors or data inconsistency
- MongoDB will accept it but violates TypeScript interface

**Fix Required**: Change to array format

---

### Issue 2: Status Not Explicitly Set During Creation

**Location**: `src/services/biometric-attendance.service.ts:253-270`

**Problem**:
```typescript
record = await AttendanceRecord.create({
  // ... other fields
  // status: 'incomplete' - COMMENTED OUT!
});
```

**Impact**:
- Status relies on pre-save hook
- Pre-save hook only runs if `swipes` is modified
- If record is created without swipes and swipes are never added, status remains `undefined` or default
- Holiday detection sets status correctly, but initial creation doesn't

**Recommendation**: Explicitly set `status: 'incomplete'` during creation

---

### Issue 3: Pre-Save Hook May Override Explicit Status

**Location**: `src/models/attendance-record.model.ts:358-377`

**Problem**:
- Pre-save hook always sets status based on swipe count
- If you explicitly set `status = 'overridden'` or `'holiday_swipe'`, the hook may override it
- Hook runs after your code, so explicit status may be lost

**Impact**:
- Override status may be changed to 'complete' if swipes array has 2 entries
- Holiday swipe status may be changed if swipes are added later

**Recommendation**: 
- Check if status is already set to special values (`'overridden'`, `'holiday_swipe'`) before auto-setting
- Or set status after hook runs (post-save)

---

### Issue 4: Holiday Detection Timing

**Location**: `src/services/biometric-attendance.service.ts:273-299`

**Current Flow**:
1. Create/find record
2. Check holiday
3. Update record if holiday

**Problem**: 
- If record already exists with swipes, holiday check happens after swipes are processed
- Holiday status may be set after regular status is already set

**Recommendation**: Check holiday **before** processing swipes, or during record creation

---

## Data Flow Diagrams

### Biometric Swipe Flow

```
┌─────────────────┐
│ Biometric Swipe │
│ (POST /attendance/swipe)
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Validate User           │
│ - Get user by biometricId
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Get Shift Assignment    │
│ - Current shift for date
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Calculate Shift Window  │
│ - shiftStart, shiftEnd
│ - windowStart, windowEnd
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ findOrCreateRecord()    │
│ - Check if exists       │
│ - Create if not         │
│ - Check holiday         │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Validate Window         │
│ - Check if within window │
└────────┬────────────────┘
         │
         ├─ Within Window ──→ Process Normal Swipe
         │
         └─ Out of Window ──→ Process Out-of-Window Swipe
                                │
                                ▼
                         ┌──────────────────┐
                         │ Add to           │
                         │ outOfWindowSwipes│
                         │ Mark for         │
                         │ regularization   │
                         └──────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Process Swipe           │
│ - First: processFirst() │
│ - Second: processSecond()│
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Pre-Save Hook           │
│ - Sort swipes           │
│ - Auto-set status       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Save to Database        │
└─────────────────────────┘
```

### Regularization Flow

```
┌─────────────────────────┐
│ Regularization Request  │
│ (POST /attendance-regularizations)
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Check Attendance Record  │
│ - Find by ID or date     │
└────────┬────────────────┘
         │
         ├─ Exists ──→ Update Record
         │             - Add 'Pending-Regularization'
         │
         └─ Not Exists ──→ Create Record
                            - status: 'incomplete'
                            - attendanceStatus: ['Pending-Regularization']
         │
         ▼
┌─────────────────────────┐
│ Create Regularization   │
│ Record                  │
│ - status: 'Pending'     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Link to Attendance      │
│ - Set regularization    │
│   object                │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Send Email Notifications│
│ - To approver           │
│ - To admins             │
└─────────────────────────┘

[Approval/Rejection]

┌─────────────────────────┐
│ Update Regularization   │
│ Status                  │
└────────┬────────────────┘
         │
         ├─ Approved ──→ handleApproval()
         │                - Update swipes
         │                - Recalculate metrics
         │                - Set 'Regularized', 'Present'
         │
         └─ Rejected ──→ handleRejection()
                          - Check leave balance
                          - Set 'Absent' or 'On-Leave'
                          - Reset time fields
         │
         ▼
┌─────────────────────────┐
│ Update Attendance Record│
└─────────────────────────┘
```

### Override Flow

```
┌─────────────────────────┐
│ Admin Override          │
│ (POST /attendance-overrides)
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Check Attendance Record │
│ - Find by userId + date │
└────────┬────────────────┘
         │
         ├─ Exists ──→ Store Original Values
         │             - Update all fields
         │             - Set override object
         │             - Add to history
         │
         └─ Not Exists ──→ Create New Record
                            - Set all fields
                            - Set override object
                            - Original values = null
         │
         ▼
┌─────────────────────────┐
│ Prepare Override Data   │
│ - Calculate times       │
│ - Build swipes          │
│ - Determine status      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Update/Create Record    │
│ - status: 'overridden'  │
│ - attendanceStatus:     │
│   ['Override', ...]      │
│ - All fields updated    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Set Override Object     │
│ - Store original values │
│ - Add history entry     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Save to Database        │
└─────────────────────────┘
```

---

## Key Insights

### 1. Multiple Creation Paths

The system supports **5 different ways** to create attendance records:
- **Biometric swipe** - Real-time, incremental
- **Bulk upload** - Batch, fully populated
- **Leave approval** - Upsert, minimal data
- **Regularization request** - On-demand, pending state
- **Admin override** - Manual, complete control

### 2. Status Auto-Update Mechanism

- Pre-save hook **automatically sets status** based on swipe count
- This ensures consistency but may override explicit status values
- Hook only runs if `swipes` array is modified

### 3. Holiday Detection

- Holiday check happens **during record creation/finding**
- Holiday swipes are automatically marked and regularized
- Status set to `'holiday_swipe'` immediately

### 4. Regularization Workflow

- Can create **new records** for missing attendance
- Can update **existing records** with pending status
- Approval **replaces swipes** with regularization times
- Rejection **resets time fields** and marks as Absent/On-Leave

### 5. Override System

- **Preserves original values** in override object
- **Tracks complete history** of all changes
- **Clears regularization** (override takes precedence)
- Can **restore original** values when removed

### 6. Leave Integration

- Leave approval **creates records** via upsert
- Leave rejection **updates records** to Absent
- ⚠️ **Bug**: Rejection sets attendanceStatus as string instead of array

### 7. Time Calculations

- **Break calculation**: 30 minutes for > 6 hours work
- **Shortfall/excess**: Calculated against shift hours
- **Overtime**: Tracked separately with start/end times
- All times formatted as `"HH:mm:ss"` strings

### 8. Window Validation

- Swipes outside window are **logged separately** in `outOfWindowSwipes`
- Still processed as normal swipes (added to `swipes` array)
- Marked for regularization automatically

### 9. Data Consistency

- **Unique constraint**: One record per user per day per shift
- **Indexes**: Optimized for common queries
- **Validation**: Pre-save hook validates shift end > shift start

### 10. Status Array Management

- `attendanceStatus` is an **array** - can have multiple statuses
- Statuses are **added** (not replaced) in most cases
- Special statuses like `'Override'` must be included when setting

---

## Recommendations

### 1. Fix Leave Rejection Bug

**File**: `src/services/leave.service.ts:1182`

```typescript
// Current (BUG)
attendanceStatus: "Absent",

// Fixed
attendanceStatus: ['Absent'],
```

### 2. Explicitly Set Status During Creation

**File**: `src/services/biometric-attendance.service.ts:253-270`

```typescript
record = await AttendanceRecord.create({
  // ... other fields
  status: 'incomplete', // ✅ Explicitly set
});
```

### 3. Improve Pre-Save Hook

**File**: `src/models/attendance-record.model.ts:358-377`

```typescript
attendanceRecordSchema.pre('save', function (next) {
  if (!this.isModified('swipes')) {
    return next();
  }

  // Don't override special statuses
  const specialStatuses = ['overridden', 'holiday_swipe', 'regularized'];
  if (specialStatuses.includes(this.status)) {
    return next();
  }

  // Sort swipes
  this.swipes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Update status
  if (this.swipes.length === 2) {
    this.status = 'complete';
  } else if (this.swipes.length > 2) {
    this.status = 'duplicate_swipes';
  } else {
    this.status = 'missing_checkout';
  }

  next();
});
```

### 4. Check Holiday Before Processing Swipes

**File**: `src/services/biometric-attendance.service.ts`

Move holiday check to **before** swipe processing, or check during record creation.

### 5. Add Validation for attendanceStatus Array

Ensure all code paths set `attendanceStatus` as an array, not a string.

---

## Conclusion

The attendance record system is comprehensive and supports multiple entry methods and workflows. However, there are a few bugs and improvements needed:

1. **Critical Bug**: Leave rejection sets attendanceStatus as string
2. **Status Management**: Pre-save hook may override explicit statuses
3. **Holiday Detection**: Timing could be improved
4. **Type Safety**: Need better validation for array fields

Overall, the system is well-designed with proper separation of concerns, but these issues should be addressed for production reliability.

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-XX  
**Author**: System Analysis

