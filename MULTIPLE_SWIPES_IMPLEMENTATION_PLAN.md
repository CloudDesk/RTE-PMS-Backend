# Multiple Swipes Implementation Plan

## Executive Summary

This document provides a comprehensive analysis of the current attendance swipe implementation (limited to 2 swipes) and a robust plan for supporting multiple IN/OUT swipes in a single day.

---

## 1. Current Implementation Analysis

### 1.1 Current Swipe Processing Flow

**Location**: `src/services/biometric-attendance.service.ts:processSwipe()`

**Current Logic**:
1. **Swipe Limit**: Maximum 2 swipes per day (lines 711-716)
   ```typescript
   if (record.swipes.length >= 2) {
     return {
       success: false,
       message: 'Maximum swipes limit (2) reached for today'
     };
   }
   ```

2. **First Swipe (IN)** - `processFirstSwipe()`:
   - Sets `firstIn = timestamp`
   - Determines `isLateEntry` (if timestamp > shiftStart)
   - Sets `attendanceStatus` to `['Late']` or `['On-Time']`
   - Initializes all time fields to `'00:00:00'`
   - Sets `shiftHours` based on shift duration

3. **Second Swipe (OUT)** - `processSecondSwipe()`:
   - Sets `lastOut = timestamp`
   - Determines `isEarlyExit` (if timestamp < shiftEnd)
   - Calls `calculateAttendanceMetrics()` to compute:
     - `totalWorkHours`: Time between firstIn and lastOut
     - `breakHours`: 30 minutes if total > 6 hours, else 0
     - `actualWorkHours`: totalWorkHours - breakHours
     - `shortfallHours`: If actualWorkHours < shiftHours
     - `excessHours`: If actualWorkHours > shiftHours
   - Updates `attendanceStatus` with `'Early-Exit'` if applicable
   - Adds `'Present'` if there are any issues

### 1.2 Current Status Values

**`status` field** (single value):
- `'incomplete'`: Only one swipe recorded
- `'complete'`: Exactly 2 swipes (IN + OUT)
- `'duplicate_swipes'`: More than 2 swipes (currently blocked)
- `'missing_checkout'`: Only IN swipe, no OUT
- `'holiday_swipe'`: Swipe on holiday
- `'leave_swipe'`: Swipe during leave
- `'pending_regularization'`: Needs admin approval
- `'regularized'`: Regularization approved
- `'overridden'`: Admin override applied

**`attendanceStatus` field** (array):
- `'Present'`: Employee was present
- `'Late'`: Arrived after shift start
- `'On-Time'`: Arrived on time
- `'Early-Exit'`: Left before shift end
- `'Absent'`: No swipes
- `'On-Leave'`: On leave
- `'Out-Of-Window'`: Swipe outside allowed window
- `'Holiday-Swipe'`: Swipe on holiday
- `'Pending-Regularization'`: Awaiting approval
- `'Regularized'`: Regularization approved
- `'OT'`: Overtime worked
- `'Override'`: Admin override

### 1.3 Current Calculation Logic

**Location**: `calculateAttendanceMetrics()`

```typescript
// Current calculation (2 swipes only):
totalWorkHours = lastOut - firstIn
breakHours = (totalWorkHours > 6 hours) ? 30 minutes : 0
actualWorkHours = totalWorkHours - breakHours
shortfallHours = max(0, shiftHours - actualWorkHours)
excessHours = max(0, actualWorkHours - shiftHours)
```

**Limitations**:
- Only considers first IN and last OUT
- Break calculation is simplistic (30 min if > 6 hours)
- No handling of multiple break periods
- No detection of actual break times between swipes

### 1.4 Current Model Structure

**Key Fields**:
- `swipes[]`: Array of swipe objects (currently max 2)
- `firstIn`: First IN swipe timestamp
- `lastOut`: Last OUT swipe timestamp
- `totalWorkHours`: Time between firstIn and lastOut
- `breakHours`: Calculated break time
- `actualWorkHours`: totalWorkHours - breakHours

---

## 2. Requirements for Multiple Swipes

### 2.1 Use Cases

1. **Multiple Breaks**: Employee takes lunch break, tea break, etc.
   - Example: IN (9:00) → OUT (13:00) → IN (14:00) → OUT (18:00)
   - Should detect break from 13:00-14:00

2. **Errand Runs**: Employee leaves for external work
   - Example: IN (9:00) → OUT (11:00) → IN (12:00) → OUT (15:00) → IN (16:00) → OUT (18:00)

3. **Overtime with Breaks**: Employee works overtime with breaks
   - Example: IN (9:00) → OUT (13:00) → IN (14:00) → OUT (20:00)
   - Should calculate: Regular hours + Overtime hours

4. **Partial Day**: Employee comes late or leaves early
   - Example: IN (11:00) → OUT (13:00) → IN (14:00) → OUT (16:00)

### 2.2 Business Rules

1. **Swipe Validation**:
   - Must alternate between IN and OUT
   - Cannot have consecutive IN or OUT swipes
   - Minimum gap between swipes: 1 minute (to prevent accidental double swipes)

2. **Break Detection**:
   - Break = Gap between OUT and next IN
   - Minimum break duration: 15 minutes (shorter gaps are considered work time)
   - Maximum break duration: 4 hours (longer gaps may indicate half-day)

3. **Work Time Calculation**:
   - Sum of all IN-OUT pairs
   - Exclude break periods
   - Calculate overtime if total work > shift hours

4. **Status Determination**:
   - Must start with IN swipe
   - Must end with OUT swipe (or mark as incomplete)
   - Detect anomalies (e.g., too many swipes, irregular patterns)

---

## 3. Proposed Implementation Plan

### 3.1 Data Model Enhancements

**No schema changes required** - Current model already supports arrays. However, we need to add:

**New Fields (Optional - can be computed)**:
```typescript
interface IAttendanceRecord {
  // Existing fields...
  
  // New computed fields for multiple swipes
  swipePairs?: Array<{
    inTime: Date;
    outTime: Date;
    duration: string; // HH:mm:ss
    isBreak: boolean; // If this pair represents a break period
  }>;
  
  breakPeriods?: Array<{
    startTime: Date; // OUT swipe time
    endTime: Date;   // Next IN swipe time
    duration: string; // HH:mm:ss
    isLunchBreak: boolean; // If duration > 30 minutes
  }>;
  
  workSessions?: Array<{
    sessionNumber: number;
    startTime: Date;
    endTime: Date;
    duration: string;
    isOvertime: boolean; // If outside shift hours
  }>;
}
```

**Note**: These can be computed on-the-fly, no need to store in DB.

### 3.2 Swipe Processing Logic

#### 3.2.1 Swipe Direction Detection

**Algorithm**:
```typescript
function determineSwipeDirection(
  currentSwipes: Swipe[],
  timestamp: Date
): 'IN' | 'OUT' {
  if (currentSwipes.length === 0) {
    return 'IN'; // First swipe must be IN
  }
  
  const lastSwipe = currentSwipes[currentSwipes.length - 1];
  
  // Check minimum gap (1 minute)
  const timeDiff = timestamp.getTime() - lastSwipe.timestamp.getTime();
  if (timeDiff < 60000) { // Less than 1 minute
    throw new Error('Swipe too soon after previous swipe');
  }
  
  // Alternate: if last was IN, this should be OUT, and vice versa
  if (lastSwipe.direction === 'IN') {
    return 'OUT';
  } else {
    return 'IN';
  }
}
```

#### 3.2.2 Swipe Validation

```typescript
function validateSwipe(
  swipes: Swipe[],
  newSwipe: Swipe,
  shiftWindow: IShiftWindow
): ValidationResult {
  // 1. Check minimum gap
  if (swipes.length > 0) {
    const lastSwipe = swipes[swipes.length - 1];
    const gap = newSwipe.timestamp.getTime() - lastSwipe.timestamp.getTime();
    if (gap < 60000) { // 1 minute
      return { valid: false, reason: 'Swipe too soon after previous swipe' };
    }
  }
  
  // 2. Check direction alternation
  if (swipes.length > 0) {
    const lastDirection = swipes[swipes.length - 1].direction;
    if (lastDirection === newSwipe.direction) {
      return { valid: false, reason: 'Consecutive swipes must alternate IN/OUT' };
    }
  }
  
  // 3. First swipe must be IN
  if (swipes.length === 0 && newSwipe.direction !== 'IN') {
    return { valid: false, reason: 'First swipe must be IN' };
  }
  
  // 4. Check if within reasonable time window (24 hours from first swipe)
  if (swipes.length > 0) {
    const firstSwipe = swipes[0];
    const timeDiff = newSwipe.timestamp.getTime() - firstSwipe.timestamp.getTime();
    if (timeDiff > 24 * 60 * 60 * 1000) {
      return { valid: false, reason: 'Swipe outside 24-hour window' };
    }
  }
  
  return { valid: true };
}
```

### 3.3 Calculation Logic for Multiple Swipes

#### 3.3.1 Work Sessions Calculation

```typescript
interface WorkSession {
  startTime: Date;
  endTime: Date;
  duration: number; // minutes
  isOvertime: boolean;
}

function calculateWorkSessions(
  swipes: Swipe[],
  shiftStart: Date,
  shiftEnd: Date
): WorkSession[] {
  const sessions: WorkSession[] = [];
  
  // Group swipes into IN-OUT pairs
  for (let i = 0; i < swipes.length; i += 2) {
    if (i + 1 >= swipes.length) break; // Incomplete pair
    
    const inSwipe = swipes[i];
    const outSwipe = swipes[i + 1];
    
    if (inSwipe.direction !== 'IN' || outSwipe.direction !== 'OUT') {
      continue; // Skip invalid pairs
    }
    
    const startTime = inSwipe.timestamp;
    const endTime = outSwipe.timestamp;
    const duration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    
    // Determine if this session is overtime
    const isOvertime = endTime > shiftEnd || startTime < shiftStart;
    
    sessions.push({
      startTime,
      endTime,
      duration,
      isOvertime
    });
  }
  
  return sessions;
}
```

#### 3.3.2 Break Periods Calculation

```typescript
interface BreakPeriod {
  startTime: Date;
  endTime: Date;
  duration: number; // minutes
  isLunchBreak: boolean;
}

function calculateBreakPeriods(
  swipes: Swipe[]
): BreakPeriod[] {
  const breaks: BreakPeriod[] = [];
  
  // Find gaps between OUT and next IN
  for (let i = 1; i < swipes.length - 1; i++) {
    const currentSwipe = swipes[i];
    const nextSwipe = swipes[i + 1];
    
    if (currentSwipe.direction === 'OUT' && nextSwipe.direction === 'IN') {
      const gap = (nextSwipe.timestamp.getTime() - currentSwipe.timestamp.getTime()) / (1000 * 60);
      
      // Only consider gaps >= 15 minutes as breaks
      if (gap >= 15) {
        breaks.push({
          startTime: currentSwipe.timestamp,
          endTime: nextSwipe.timestamp,
          duration: gap,
          isLunchBreak: gap >= 30 // 30+ minutes considered lunch break
        });
      }
    }
  }
  
  return breaks;
}
```

#### 3.3.3 Total Work Hours Calculation

```typescript
function calculateTotalWorkHours(
  workSessions: WorkSession[]
): number {
  return workSessions.reduce((total, session) => {
    return total + session.duration;
  }, 0);
}
```

#### 3.3.4 Break Hours Calculation

```typescript
function calculateBreakHours(
  breakPeriods: BreakPeriod[]
): number {
  return breakPeriods.reduce((total, breakPeriod) => {
    return total + breakPeriod.duration;
  }, 0);
}
```

#### 3.3.5 Actual Work Hours Calculation

```typescript
function calculateActualWorkHours(
  totalWorkHours: number,
  breakHours: number
): number {
  // Actual work = Total time between first IN and last OUT
  // But we subtract breaks that occurred between work sessions
  return totalWorkHours; // Breaks are already excluded in work sessions
}
```

#### 3.3.6 Overtime Calculation

```typescript
function calculateOvertime(
  workSessions: WorkSession[],
  shiftStart: Date,
  shiftEnd: Date
): { overtimeMinutes: number; overtimeStart?: Date; overtimeEnd?: Date } {
  let overtimeMinutes = 0;
  let overtimeStart: Date | undefined;
  let overtimeEnd: Date | undefined;
  
  const shiftDuration = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60);
  let totalWorkMinutes = 0;
  
  for (const session of workSessions) {
    totalWorkMinutes += session.duration;
    
    // Check if session extends beyond shift end
    if (session.endTime > shiftEnd) {
      const overtimeStartTime = shiftEnd;
      const overtimeEndTime = session.endTime;
      const sessionOvertime = (overtimeEndTime.getTime() - overtimeStartTime.getTime()) / (1000 * 60);
      
      overtimeMinutes += sessionOvertime;
      
      if (!overtimeStart || overtimeStartTime < overtimeStart) {
        overtimeStart = overtimeStartTime;
      }
      if (!overtimeEnd || overtimeEndTime > overtimeEnd) {
        overtimeEnd = overtimeEndTime;
      }
    }
  }
  
  // Also check if total work exceeds shift duration
  if (totalWorkMinutes > shiftDuration) {
    const excessMinutes = totalWorkMinutes - shiftDuration;
    if (excessMinutes > overtimeMinutes) {
      // Overtime is the excess beyond shift duration
      overtimeMinutes = excessMinutes;
    }
  }
  
  return { overtimeMinutes, overtimeStart, overtimeEnd };
}
```

### 3.4 Status Determination Logic

#### 3.4.1 Record Status

```typescript
function determineRecordStatus(
  swipes: Swipe[]
): IAttendanceRecord['status'] {
  if (swipes.length === 0) {
    return 'incomplete';
  }
  
  const firstSwipe = swipes[0];
  const lastSwipe = swipes[swipes.length - 1];
  
  // Check if starts with IN
  if (firstSwipe.direction !== 'IN') {
    return 'incomplete'; // Invalid: must start with IN
  }
  
  // Check if ends with OUT
  if (lastSwipe.direction !== 'OUT') {
    return 'missing_checkout'; // Incomplete: missing final OUT
  }
  
  // Check for valid pairs
  let validPairs = 0;
  for (let i = 0; i < swipes.length; i += 2) {
    if (i + 1 < swipes.length) {
      if (swipes[i].direction === 'IN' && swipes[i + 1].direction === 'OUT') {
        validPairs++;
      }
    }
  }
  
  if (validPairs === 0) {
    return 'incomplete';
  } else if (swipes.length === 2) {
    return 'complete'; // Standard 2-swipe day
  } else if (swipes.length > 2 && swipes.length % 2 === 0) {
    return 'complete'; // Multiple valid pairs
  } else {
    return 'incomplete'; // Odd number of swipes or invalid pattern
  }
}
```

#### 3.4.2 Attendance Status Array

```typescript
function determineAttendanceStatus(
  swipes: Swipe[],
  shiftWindow: IShiftWindow,
  workSessions: WorkSession[],
  breakPeriods: BreakPeriod[],
  hasOvertime: boolean,
  isLateEntry: boolean,
  isEarlyExit: boolean,
  isWithinWindow: boolean
): string[] {
  const statuses: string[] = [];
  
  // Basic presence
  if (swipes.length >= 2) {
    statuses.push('Present');
  }
  
  // Entry status
  if (swipes.length > 0) {
    const firstIn = swipes[0].timestamp;
    if (firstIn > shiftWindow.shiftStart) {
      statuses.push('Late');
    } else {
      statuses.push('On-Time');
    }
  }
  
  // Exit status
  if (swipes.length > 1) {
    const lastOut = swipes[swipes.length - 1].timestamp;
    if (lastOut < shiftWindow.shiftEnd) {
      statuses.push('Early-Exit');
    }
  }
  
  // Window validation
  if (!isWithinWindow) {
    statuses.push('Out-Of-Window');
  }
  
  // Overtime
  if (hasOvertime) {
    statuses.push('OT');
  }
  
  // Multiple swipes indicator (optional)
  if (swipes.length > 2) {
    // Could add 'Multiple-Sessions' status if needed
  }
  
  return [...new Set(statuses)]; // Remove duplicates
}
```

### 3.5 Updated Process Swipe Flow

```typescript
async processSwipe(swipeData: ISwipeData): Promise<ISwipeResponse> {
  // 1. Get user and shift (existing)
  const user = await this.getUserByBiometricId(biometricId);
  const shiftAssignment = await this.getCurrentShiftAssignment(user._id, timestamp);
  const shiftWindow = this.getShiftTimings(shift, shiftDay);
  
  // 2. Get or create record (existing)
  const record = await this.findOrCreateAttendanceRecord(...);
  
  // 3. Determine swipe direction
  const direction = this.determineSwipeDirection(record.swipes, timestamp);
  
  // 4. Validate swipe
  const validation = this.validateSwipe(record.swipes, { timestamp, direction, ... }, shiftWindow);
  if (!validation.valid) {
    return { success: false, message: validation.reason };
  }
  
  // 5. Add swipe to record
  record.swipes.push({
    timestamp,
    direction,
    deviceId: 'biometric',
    location: locationData
  });
  
  // 6. Sort swipes by timestamp (important!)
  record.swipes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  // 7. Update firstIn and lastOut
  const inSwipes = record.swipes.filter(s => s.direction === 'IN');
  const outSwipes = record.swipes.filter(s => s.direction === 'OUT');
  
  record.firstIn = inSwipes.length > 0 ? inSwipes[0].timestamp : null;
  record.lastOut = outSwipes.length > 0 ? outSwipes[outSwipes.length - 1].timestamp : null;
  
  // 8. Calculate work sessions and breaks
  const workSessions = this.calculateWorkSessions(record.swipes, shiftWindow.shiftStart, shiftWindow.shiftEnd);
  const breakPeriods = this.calculateBreakPeriods(record.swipes);
  
  // 9. Calculate metrics
  const totalWorkMinutes = this.calculateTotalWorkHours(workSessions);
  const breakMinutes = this.calculateBreakHours(breakPeriods);
  const actualWorkMinutes = totalWorkMinutes; // Breaks already excluded
  
  const shiftMinutes = (shiftWindow.shiftEnd.getTime() - shiftWindow.shiftStart.getTime()) / (1000 * 60);
  const difference = actualWorkMinutes - shiftMinutes;
  
  // 10. Calculate overtime
  const overtime = this.calculateOvertime(workSessions, shiftWindow.shiftStart, shiftWindow.shiftEnd);
  
  // 11. Update record fields
  record.totalWorkHours = await this.formatDuration(totalWorkMinutes);
  record.breakHours = await this.formatDuration(breakMinutes);
  record.actualWorkHours = await this.formatDuration(actualWorkMinutes);
  record.shiftHours = await this.formatDuration(shiftMinutes);
  record.shortfallHours = difference < 0 ? await this.formatDuration(Math.abs(difference)) : '00:00:00';
  record.excessHours = difference > 0 ? await this.formatDuration(difference) : '00:00:00';
  
  if (overtime.overtimeStart) {
    record.overtimeStart = overtime.overtimeStart;
  }
  if (overtime.overtimeEnd) {
    record.overtimeEnd = overtime.overtimeEnd;
  }
  
  // 12. Determine statuses
  record.status = this.determineRecordStatus(record.swipes);
  record.attendanceStatus = this.determineAttendanceStatus(
    record.swipes,
    shiftWindow,
    workSessions,
    breakPeriods,
    overtime.overtimeMinutes > 0,
    record.isLateEntry,
    record.isEarlyExit,
    record.isWithinWindow
  );
  
  // 13. Update flags
  record.isLateEntry = record.firstIn ? record.firstIn > shiftWindow.shiftStart : false;
  record.isEarlyExit = record.lastOut ? record.lastOut < shiftWindow.shiftEnd : false;
  record.needsRegularization = record.isLateEntry || record.isEarlyExit || !record.isWithinWindow || difference < 0;
  
  // 14. Save and return
  await record.save();
  
  return {
    success: true,
    message: 'Swipe processed successfully',
    data: { ... }
  };
}
```

---

## 4. Status and AttendanceStatus Values

### 4.1 Record Status (`status` field)

| Status | Condition | Description |
|--------|-----------|-------------|
| `'incomplete'` | No swipes OR invalid pattern | Record not complete |
| `'complete'` | Valid IN-OUT pairs (2+ swipes, even number) | All swipes valid |
| `'missing_checkout'` | Ends with IN swipe (no final OUT) | Missing final checkout |
| `'duplicate_swipes'` | Consecutive same-direction swipes | Invalid pattern detected |
| `'holiday_swipe'` | Swipe on holiday | Holiday attendance |
| `'leave_swipe'` | Swipe during leave | Leave day swipe |
| `'pending_regularization'` | Needs approval | Awaiting admin action |
| `'regularized'` | Regularization approved | Approved by admin |
| `'overridden'` | Admin override applied | Manually overridden |

### 4.2 Attendance Status (`attendanceStatus` array)

| Status | Condition | When Added |
|--------|-----------|------------|
| `'Present'` | At least one valid IN-OUT pair | Always if swipes exist |
| `'On-Time'` | First IN <= shiftStart | Entry on time |
| `'Late'` | First IN > shiftStart | Late entry |
| `'Early-Exit'` | Last OUT < shiftEnd | Left early |
| `'OT'` | Overtime worked | If excessHours > 0 |
| `'Out-Of-Window'` | Swipe outside window | Window validation failed |
| `'Holiday-Swipe'` | Swipe on holiday | Holiday detected |
| `'Pending-Regularization'` | Needs approval | Regularization required |
| `'Regularized'` | Regularization approved | After approval |
| `'Override'` | Admin override | Override applied |
| `'Absent'` | No swipes | No attendance record |
| `'On-Leave'` | On leave | Leave day |

**Multiple Statuses Example**:
- `['Present', 'Late', 'OT']` - Present but late, worked overtime
- `['Present', 'On-Time', 'Early-Exit']` - On time but left early
- `['Present', 'Late', 'Early-Exit', 'Out-Of-Window']` - Multiple issues

---

## 5. Calculation Examples

### Example 1: Standard Day with Lunch Break

**Swipes**:
- IN: 09:00
- OUT: 13:00 (lunch)
- IN: 14:00
- OUT: 18:00

**Calculations**:
- Work Session 1: 09:00 - 13:00 = 4 hours
- Break: 13:00 - 14:00 = 1 hour (lunch break)
- Work Session 2: 14:00 - 18:00 = 4 hours
- **Total Work Hours**: 8 hours
- **Break Hours**: 1 hour
- **Actual Work Hours**: 8 hours
- **Shift Hours**: 9 hours (assumed)
- **Shortfall Hours**: 1 hour

**Status**: `'complete'`
**AttendanceStatus**: `['Present', 'On-Time', 'Early-Exit']`

### Example 2: Multiple Breaks

**Swipes**:
- IN: 09:00
- OUT: 11:00 (errand)
- IN: 12:00
- OUT: 13:00 (lunch)
- IN: 14:00
- OUT: 18:00

**Calculations**:
- Work Session 1: 09:00 - 11:00 = 2 hours
- Break 1: 11:00 - 12:00 = 1 hour
- Work Session 2: 12:00 - 13:00 = 1 hour
- Break 2: 13:00 - 14:00 = 1 hour (lunch)
- Work Session 3: 14:00 - 18:00 = 4 hours
- **Total Work Hours**: 7 hours
- **Break Hours**: 2 hours
- **Actual Work Hours**: 7 hours

**Status**: `'complete'`
**AttendanceStatus**: `['Present', 'On-Time']`

### Example 3: Overtime with Breaks

**Swipes**:
- IN: 09:00
- OUT: 13:00
- IN: 14:00
- OUT: 20:00

**Calculations**:
- Work Session 1: 09:00 - 13:00 = 4 hours (regular)
- Break: 13:00 - 14:00 = 1 hour
- Work Session 2: 14:00 - 18:00 = 4 hours (regular)
- Overtime: 18:00 - 20:00 = 2 hours
- **Total Work Hours**: 10 hours
- **Break Hours**: 1 hour
- **Actual Work Hours**: 10 hours
- **Shift Hours**: 9 hours
- **Excess Hours**: 1 hour (overtime)

**Status**: `'complete'`
**AttendanceStatus**: `['Present', 'On-Time', 'OT']`

### Example 4: Late Entry, Early Exit

**Swipes**:
- IN: 10:00 (late)
- OUT: 13:00
- IN: 14:00
- OUT: 16:00 (early)

**Calculations**:
- Work Session 1: 10:00 - 13:00 = 3 hours
- Break: 13:00 - 14:00 = 1 hour
- Work Session 2: 14:00 - 16:00 = 2 hours
- **Total Work Hours**: 5 hours
- **Break Hours**: 1 hour
- **Actual Work Hours**: 5 hours
- **Shift Hours**: 9 hours
- **Shortfall Hours**: 4 hours

**Status**: `'complete'`
**AttendanceStatus**: `['Present', 'Late', 'Early-Exit']`

---

## 6. Implementation Steps

### Phase 1: Core Logic (Week 1)
1. ✅ Remove 2-swipe limit check
2. ✅ Implement `determineSwipeDirection()`
3. ✅ Implement `validateSwipe()`
4. ✅ Update `processSwipe()` to handle multiple swipes

### Phase 2: Calculations (Week 1-2)
1. ✅ Implement `calculateWorkSessions()`
2. ✅ Implement `calculateBreakPeriods()`
3. ✅ Update `calculateAttendanceMetrics()` for multiple swipes
4. ✅ Implement `calculateOvertime()`

### Phase 3: Status Logic (Week 2)
1. ✅ Implement `determineRecordStatus()`
2. ✅ Implement `determineAttendanceStatus()`
3. ✅ Update status determination in `processSwipe()`

### Phase 4: Testing (Week 2-3)
1. ✅ Unit tests for calculation functions
2. ✅ Integration tests for swipe processing
3. ✅ Edge case testing (odd swipes, gaps, etc.)
4. ✅ Performance testing with large swipe arrays

### Phase 5: Migration (Week 3)
1. ✅ Data migration script (if needed)
2. ✅ Update existing records (if needed)
3. ✅ Documentation updates

---

## 7. Edge Cases and Validation

### 7.1 Invalid Swipe Patterns

1. **Consecutive Same Direction**:
   - IN → IN → OUT → OUT
   - **Action**: Reject second IN, mark as `'duplicate_swipes'`

2. **Starts with OUT**:
   - OUT → IN → OUT
   - **Action**: Reject first OUT, require IN first

3. **Odd Number of Swipes**:
   - IN → OUT → IN (missing final OUT)
   - **Action**: Mark as `'missing_checkout'`

4. **Too Many Swipes**:
   - More than 20 swipes in a day
   - **Action**: Log warning, but allow (may be valid for some roles)

5. **Swipe Too Soon**:
   - Swipe within 1 minute of previous
   - **Action**: Reject with error message

### 7.2 Break Detection Edge Cases

1. **Very Short Break** (< 15 minutes):
   - Treated as work time, not break
   - Example: OUT 13:00 → IN 13:10 = 10 min work gap

2. **Very Long Break** (> 4 hours):
   - May indicate half-day or multiple shifts
   - **Action**: Flag for review, but calculate normally

3. **Break Outside Shift Hours**:
   - OUT 18:00 → IN 09:00 (next day)
   - **Action**: Not considered a break for current day

### 7.3 Calculation Edge Cases

1. **Zero Work Time**:
   - IN → OUT (same minute)
   - **Action**: Mark as invalid, require regularization

2. **Negative Work Time**:
   - OUT timestamp < IN timestamp (shouldn't happen)
   - **Action**: Reject swipe, log error

3. **Overnight Swipes**:
   - IN 22:00 → OUT 02:00 (next day)
   - **Action**: Handle in shift calculation logic

---

## 8. Performance Considerations

1. **Swipe Array Size**:
   - Typical: 2-6 swipes per day
   - Maximum: 20 swipes (configurable)
   - Sorting: O(n log n) - acceptable for small arrays

2. **Calculation Complexity**:
   - Work sessions: O(n) where n = number of swipes
   - Break periods: O(n)
   - Overall: O(n log n) due to sorting

3. **Database Impact**:
   - Swipe array stored in single document
   - No additional queries needed
   - Index on `userId + shiftDay` remains efficient

---

## 9. Configuration Options

```typescript
interface SwipeConfiguration {
  maxSwipesPerDay: number; // Default: 20
  minSwipeGapMinutes: number; // Default: 1
  minBreakDurationMinutes: number; // Default: 15
  maxBreakDurationMinutes: number; // Default: 240 (4 hours)
  lunchBreakThresholdMinutes: number; // Default: 30
  defaultBreakMinutes: number; // Default: 30 (if > 6 hours work)
}
```

---

## 10. Testing Scenarios

### Test Case 1: Standard 2 Swipes
- Input: IN 09:00, OUT 18:00
- Expected: Same as current behavior

### Test Case 2: 4 Swipes with Lunch
- Input: IN 09:00, OUT 13:00, IN 14:00, OUT 18:00
- Expected: 8 hours work, 1 hour break

### Test Case 3: 6 Swipes Multiple Breaks
- Input: IN 09:00, OUT 11:00, IN 12:00, OUT 13:00, IN 14:00, OUT 18:00
- Expected: 7 hours work, 2 hours break

### Test Case 4: Overtime
- Input: IN 09:00, OUT 13:00, IN 14:00, OUT 20:00
- Expected: 10 hours work, 1 hour overtime

### Test Case 5: Invalid Pattern
- Input: IN 09:00, IN 10:00, OUT 18:00
- Expected: Reject second IN, mark as duplicate

### Test Case 6: Missing Checkout
- Input: IN 09:00, OUT 13:00, IN 14:00
- Expected: Status = 'missing_checkout'

---

## 11. Migration Strategy

### 11.1 Backward Compatibility

- Existing records with 2 swipes: **No changes needed**
- All calculations remain valid
- New logic handles 2 swipes as special case

### 11.2 Data Migration

**Not Required** - Current schema supports arrays already.

**Optional Enhancement**:
- Add computed fields for faster queries (if needed)
- Can be added later without breaking changes

---

## 12. API Changes

### 12.1 No Breaking Changes

- Same endpoint: `POST /attendance/swipe`
- Same request/response format
- Additional fields in response (optional)

### 12.2 Response Enhancement

```typescript
interface ISwipeResponse {
  success: boolean;
  message: string;
  data?: {
    // Existing fields...
    swipeCount: number; // New: Total swipes for the day
    workSessions?: Array<{ // New: Optional detailed breakdown
      startTime: Date;
      endTime: Date;
      duration: string;
    }>;
    breakPeriods?: Array<{ // New: Optional break details
      startTime: Date;
      endTime: Date;
      duration: string;
    }>;
  };
}
```

---

## 13. Frontend Considerations

1. **Display Multiple Swipes**:
   - Show all swipes in chronological order
   - Group into work sessions visually
   - Highlight break periods

2. **Status Indicators**:
   - Show all attendanceStatus values
   - Color code: Green (On-Time), Yellow (Late/Early), Red (Issues)

3. **Calculations Display**:
   - Show breakdown: Work Sessions + Breaks = Total
   - Display overtime separately if applicable

---

## 14. Rollout Plan

### Phase 1: Development (Week 1-2)
- Implement core logic
- Unit tests
- Code review

### Phase 2: Staging (Week 3)
- Deploy to staging
- Integration testing
- User acceptance testing

### Phase 3: Production (Week 4)
- Deploy to production
- Monitor for issues
- Gradual rollout (if needed)

### Phase 4: Monitoring (Week 5+)
- Monitor calculation accuracy
- Monitor performance
- Collect user feedback

---

## 15. Success Criteria

1. ✅ Supports unlimited swipes (within reason)
2. ✅ Accurately calculates work hours with breaks
3. ✅ Correctly identifies overtime
4. ✅ Proper status determination
5. ✅ Backward compatible with existing 2-swipe records
6. ✅ Performance acceptable (< 100ms per swipe)
7. ✅ No data loss or corruption

---

## Conclusion

This plan provides a comprehensive approach to implementing multiple swipes while maintaining backward compatibility and ensuring accurate calculations. The implementation is modular and can be rolled out incrementally.

**Key Benefits**:
- ✅ Flexible: Supports any number of swipes
- ✅ Accurate: Proper break and work time calculation
- ✅ Robust: Handles edge cases and invalid patterns
- ✅ Compatible: Works with existing 2-swipe records
- ✅ Performant: Efficient algorithms for real-time processing

**Next Steps**:
1. Review and approve this plan
2. Begin Phase 1 implementation
3. Set up testing environment
4. Prepare migration scripts (if needed)

