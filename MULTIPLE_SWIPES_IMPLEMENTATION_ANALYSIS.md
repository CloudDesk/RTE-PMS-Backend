# Multiple Time Swipes - Full Analysis & Implementation

## Table of Contents
1. [Current Implementation Analysis](#current-implementation-analysis)
2. [Requirements for Multiple Swipes](#requirements-for-multiple-swipes)
3. [Proposed Solution Architecture](#proposed-solution-architecture)
4. [Implementation Details](#implementation-details)
5. [Calculation Logic](#calculation-logic)
6. [Edge Cases & Validation](#edge-cases--validation)
7. [Code Changes Required](#code-changes-required)
8. [Testing Scenarios](#testing-scenarios)

---

## Current Implementation Analysis

### Current Limitations

**Location**: `src/services/biometric-attendance.service.ts:711-716`

```typescript
// CURRENT CODE - BLOCKS MULTIPLE SWIPES
if (record.swipes.length >= 2) {
  return {
    success: false,
    message: 'Maximum swipes limit (2) reached for today'
  };
}
```

**Current Behavior**:
- ✅ Maximum 2 swipes per day (IN and OUT)
- ✅ First swipe = IN, Second swipe = OUT (automatic)
- ✅ Simple calculation: `totalWorkHours = lastOut - firstIn`
- ✅ Fixed break: 30 minutes if total > 6 hours
- ❌ Cannot handle multiple breaks
- ❌ Cannot handle multiple work sessions
- ❌ Status set to `'duplicate_swipes'` if > 2 swipes

### Current Calculation Flow

```
Check-In (First Swipe)
  ↓
Set firstIn = timestamp
Set isLateEntry = timestamp > shiftStart
Set attendanceStatus = ['Late'] or ['On-Time']
Initialize all hours to '00:00:00'
  ↓
Check-Out (Second Swipe)
  ↓
Set lastOut = timestamp
Set isEarlyExit = timestamp < shiftEnd
Calculate: totalWorkHours = lastOut - firstIn
Calculate: breakHours = (total > 6h) ? 30min : 0
Calculate: actualWorkHours = totalWorkHours - breakHours
Calculate: shortfall/excess vs shiftHours
```

### Current Status Logic

**Pre-Save Hook** (`src/models/attendance-record.model.ts:358-377`):
```typescript
if (this.swipes.length === 2) {
  this.status = 'complete';
} else if (this.swipes.length > 2) {
  this.status = 'duplicate_swipes'; // ❌ Blocks multiple swipes
} else {
  this.status = 'missing_checkout';
}
```

---

## Requirements for Multiple Swipes

### Use Cases

1. **Multiple Breaks (Lunch + Tea)**
   ```
   IN 09:00 → OUT 13:00 → IN 14:00 → OUT 15:30 → IN 16:00 → OUT 18:00
   Work: 4h + 1.5h + 2h = 7.5 hours
   Breaks: 1h (lunch) + 0.5h (tea) = 1.5 hours
   ```

2. **Errand Runs**
   ```
   IN 09:00 → OUT 11:00 → IN 12:00 → OUT 15:00 → IN 16:00 → OUT 18:00
   Work: 2h + 3h + 2h = 7 hours
   Breaks: 1h + 1h = 2 hours
   ```

3. **Overtime with Breaks**
   ```
   IN 09:00 → OUT 13:00 → IN 14:00 → OUT 20:00
   Work: 4h + 6h = 10 hours
   Break: 1 hour
   Overtime: 1 hour (10h - 9h shift)
   ```

4. **Partial Day**
   ```
   IN 11:00 → OUT 13:00 → IN 14:00 → OUT 16:00
   Work: 2h + 2h = 4 hours
   Break: 1 hour
   Shortfall: 5 hours
   ```

### Business Rules

1. **Swipe Direction Detection**:
   - Must alternate: IN → OUT → IN → OUT
   - First swipe must be IN
   - Cannot have consecutive same-direction swipes
   - Minimum gap: 1 minute (prevent accidental double swipes)

2. **Break Detection**:
   - Break = Gap between OUT and next IN
   - Minimum break: 15 minutes (shorter = work time)
   - Maximum break: 4 hours (longer = half-day or error)

3. **Work Time Calculation**:
   - Sum all IN-OUT pairs
   - Exclude break periods
   - Calculate overtime if total > shift hours

4. **Status Rules**:
   - Must start with IN
   - Should end with OUT (or mark incomplete)
   - Detect anomalies (too many swipes, irregular patterns)

---

## Proposed Solution Architecture

### High-Level Flow

```
Swipe Received
  ↓
Validate User & Shift
  ↓
Get/Create Attendance Record
  ↓
Determine Swipe Direction (Smart Detection)
  ↓
Validate Swipe (Min gap, Pattern)
  ↓
Add Swipe to Record
  ↓
Sort Swipes by Timestamp
  ↓
Calculate Work Sessions
  ↓
Calculate Break Periods
  ↓
Update Metrics (totalWorkHours, breakHours, etc.)
  ↓
Update Status
  ↓
Save Record
```

### Key Components

1. **Swipe Direction Detection** - Smart algorithm to determine IN/OUT
2. **Swipe Validation** - Check patterns, gaps, anomalies
3. **Work Session Calculator** - Group swipes into IN-OUT pairs
4. **Break Period Calculator** - Detect gaps between sessions
5. **Metrics Calculator** - Calculate all time fields
6. **Status Updater** - Update status based on swipe pattern

---

## Implementation Details

### 1. Swipe Direction Detection

**Algorithm**:
```typescript
private determineSwipeDirection(
  currentSwipes: Array<{ timestamp: Date; direction: 'IN' | 'OUT' }>,
  timestamp: Date
): 'IN' | 'OUT' {
  // First swipe must be IN
  if (currentSwipes.length === 0) {
    return 'IN';
  }
  
  // Get last swipe
  const lastSwipe = currentSwipes[currentSwipes.length - 1];
  
  // Check minimum gap (1 minute = 60,000 ms)
  const timeDiff = timestamp.getTime() - lastSwipe.timestamp.getTime();
  if (timeDiff < 60000) {
    throw new Error('Minimum 1 minute gap required between swipes');
  }
  
  // Alternate direction
  return lastSwipe.direction === 'IN' ? 'OUT' : 'IN';
}
```

**Logic**:
- First swipe → Always IN
- Subsequent swipes → Alternate (IN → OUT → IN → OUT)
- Enforces minimum 1-minute gap

---

### 2. Swipe Validation

**Validation Rules**:
```typescript
private validateSwipe(
  currentSwipes: Array<{ timestamp: Date; direction: 'IN' | 'OUT' }>,
  newSwipe: { timestamp: Date; direction: 'IN' | 'OUT' },
  shiftWindow: IShiftWindow
): { valid: boolean; reason?: string } {
  // 1. Check minimum gap
  if (currentSwipes.length > 0) {
    const lastSwipe = currentSwipes[currentSwipes.length - 1];
    const timeDiff = newSwipe.timestamp.getTime() - lastSwipe.timestamp.getTime();
    if (timeDiff < 60000) {
      return { valid: false, reason: 'Minimum 1 minute gap required' };
    }
  }
  
  // 2. Check direction alternation
  if (currentSwipes.length > 0) {
    const lastDirection = currentSwipes[currentSwipes.length - 1].direction;
    if (newSwipe.direction === lastDirection) {
      return { valid: false, reason: 'Swipe direction must alternate (IN/OUT)' };
    }
  }
  
  // 3. Check first swipe is IN
  if (currentSwipes.length === 0 && newSwipe.direction !== 'IN') {
    return { valid: false, reason: 'First swipe must be IN' };
  }
  
  // 4. Check reasonable time (not too far in past/future)
  const now = new Date();
  const timeDiff = Math.abs(now.getTime() - newSwipe.timestamp.getTime());
  if (timeDiff > 24 * 60 * 60 * 1000) {
    return { valid: false, reason: 'Swipe time is too far from current time' };
  }
  
  return { valid: true };
}
```

---

### 3. Work Session Calculator

**Algorithm**:
```typescript
interface IWorkSession {
  sessionNumber: number;
  inTime: Date;
  outTime: Date;
  durationMinutes: number;
  duration: string; // HH:mm:ss
  isOvertime: boolean;
}

private calculateWorkSessions(
  swipes: Array<{ timestamp: Date; direction: 'IN' | 'OUT' }>,
  shiftStart: Date,
  shiftEnd: Date
): IWorkSession[] {
  const sessions: IWorkSession[] = [];
  const sortedSwipes = [...swipes].sort((a, b) => 
    a.timestamp.getTime() - b.timestamp.getTime()
  );
  
  // Group into IN-OUT pairs
  for (let i = 0; i < sortedSwipes.length; i += 2) {
    const inSwipe = sortedSwipes[i];
    const outSwipe = sortedSwipes[i + 1];
    
    if (inSwipe.direction === 'IN' && outSwipe?.direction === 'OUT') {
      const durationMs = outSwipe.timestamp.getTime() - inSwipe.timestamp.getTime();
      const durationMinutes = durationMs / (1000 * 60);
      
      // Check if session extends into overtime
      const isOvertime = outSwipe.timestamp > shiftEnd;
      
      sessions.push({
        sessionNumber: sessions.length + 1,
        inTime: inSwipe.timestamp,
        outTime: outSwipe.timestamp,
        durationMinutes,
        duration: this.formatDuration(durationMinutes),
        isOvertime
      });
    }
  }
  
  return sessions;
}
```

**Example**:
```
Swipes: [IN 09:00, OUT 13:00, IN 14:00, OUT 18:00]
Sessions:
  - Session 1: 09:00-13:00 = 4 hours
  - Session 2: 14:00-18:00 = 4 hours
Total Work: 8 hours
```

---

### 4. Break Period Calculator

**Algorithm**:
```typescript
interface IBreakPeriod {
  breakNumber: number;
  startTime: Date; // OUT swipe time
  endTime: Date;   // Next IN swipe time
  durationMinutes: number;
  duration: string; // HH:mm:ss
  isLunchBreak: boolean; // > 30 minutes
}

private calculateBreakPeriods(
  swipes: Array<{ timestamp: Date; direction: 'IN' | 'OUT' }>
): IBreakPeriod[] {
  const breaks: IBreakPeriod[] = [];
  const sortedSwipes = [...swipes].sort((a, b) => 
    a.timestamp.getTime() - b.timestamp.getTime()
  );
  
  // Find gaps between OUT and next IN
  for (let i = 0; i < sortedSwipes.length - 1; i++) {
    const current = sortedSwipes[i];
    const next = sortedSwipes[i + 1];
    
    if (current.direction === 'OUT' && next.direction === 'IN') {
      const durationMs = next.timestamp.getTime() - current.timestamp.getTime();
      const durationMinutes = durationMs / (1000 * 60);
      
      // Only count breaks >= 15 minutes
      if (durationMinutes >= 15) {
        breaks.push({
          breakNumber: breaks.length + 1,
          startTime: current.timestamp,
          endTime: next.timestamp,
          durationMinutes,
          duration: this.formatDuration(durationMinutes),
          isLunchBreak: durationMinutes >= 30
        });
      }
    }
  }
  
  return breaks;
}
```

**Example**:
```
Swipes: [IN 09:00, OUT 13:00, IN 14:00, OUT 18:00]
Breaks:
  - Break 1: 13:00-14:00 = 1 hour (Lunch)
Total Breaks: 1 hour
```

---

### 5. Updated Metrics Calculator

**Algorithm**:
```typescript
private async calculateMultipleSwipeMetrics(
  swipes: Array<{ timestamp: Date; direction: 'IN' | 'OUT' }>,
  shiftStart: Date,
  shiftEnd: Date
): Promise<IAttendanceMetrics> {
  // 1. Calculate work sessions
  const workSessions = this.calculateWorkSessions(swipes, shiftStart, shiftEnd);
  
  // 2. Calculate break periods
  const breakPeriods = this.calculateBreakPeriods(swipes);
  
  // 3. Calculate total work minutes (sum of all sessions)
  const totalWorkMinutes = workSessions.reduce(
    (sum, session) => sum + session.durationMinutes,
    0
  );
  
  // 4. Calculate total break minutes (sum of all breaks)
  const totalBreakMinutes = breakPeriods.reduce(
    (sum, breakPeriod) => sum + breakPeriod.durationMinutes,
    0
  );
  
  // 5. Actual work = total work (breaks already excluded from sessions)
  const actualWorkMinutes = totalWorkMinutes;
  
  // 6. Calculate shift duration
  const shiftMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60);
  
  // 7. Calculate shortfall/excess
  const difference = actualWorkMinutes - shiftMinutes;
  
  return {
    totalWorkHours: await this.formatDuration(totalWorkMinutes),
    breakHours: await this.formatDuration(totalBreakMinutes),
    actualWorkHours: await this.formatDuration(actualWorkMinutes),
    shiftHours: await this.formatDuration(shiftMinutes),
    shortfallHours: difference < 0 ? await this.formatDuration(Math.abs(difference)) : '00:00:00',
    excessHours: difference > 0 ? await this.formatDuration(difference) : '00:00:00',
    hasShortfall: difference < 0,
    hasExcessHours: difference > 0
  };
}
```

---

### 6. Updated Status Logic

**Algorithm**:
```typescript
private determineStatus(
  swipes: Array<{ timestamp: Date; direction: 'IN' | 'OUT' }>
): IAttendanceRecord['status'] {
  if (swipes.length === 0) {
    return 'incomplete';
  }
  
  // Check if swipes form valid pairs
  const sortedSwipes = [...swipes].sort((a, b) => 
    a.timestamp.getTime() - b.timestamp.getTime()
  );
  
  // Must start with IN
  if (sortedSwipes[0].direction !== 'IN') {
    return 'incomplete';
  }
  
  // Check for consecutive same-direction swipes
  for (let i = 0; i < sortedSwipes.length - 1; i++) {
    if (sortedSwipes[i].direction === sortedSwipes[i + 1].direction) {
      return 'duplicate_swipes';
    }
  }
  
  // Check if ends with OUT
  const lastSwipe = sortedSwipes[sortedSwipes.length - 1];
  if (lastSwipe.direction !== 'OUT') {
    return 'missing_checkout';
  }
  
  // Check if has valid IN-OUT pairs
  const inCount = sortedSwipes.filter(s => s.direction === 'IN').length;
  const outCount = sortedSwipes.filter(s => s.direction === 'OUT').length;
  
  if (inCount === outCount && inCount > 0) {
    return 'complete';
  }
  
  return 'incomplete';
}
```

---

## Calculation Logic

### Formula Summary

```
1. Work Sessions = Group swipes into IN-OUT pairs
2. Total Work Hours = Sum of all session durations
3. Break Periods = Gaps between OUT and next IN (>= 15 min)
4. Break Hours = Sum of all break periods
5. Actual Work Hours = Total Work Hours (breaks already excluded)
6. Shortfall Hours = max(0, Shift Hours - Actual Work Hours)
7. Excess Hours = max(0, Actual Work Hours - Shift Hours)
```

### Example Calculation

**Scenario**: Employee with multiple breaks
```
Swipes:
  IN  09:00
  OUT 13:00  (4 hours work)
  IN  14:00  (1 hour break)
  OUT 15:30  (1.5 hours work)
  IN  16:00  (0.5 hour break)
  OUT 18:00  (2 hours work)

Work Sessions:
  Session 1: 09:00-13:00 = 4 hours
  Session 2: 14:00-15:30 = 1.5 hours
  Session 3: 16:00-18:00 = 2 hours

Break Periods:
  Break 1: 13:00-14:00 = 1 hour (Lunch)
  Break 2: 15:30-16:00 = 0.5 hours (Tea)

Calculations:
  totalWorkHours = 4 + 1.5 + 2 = 7.5 hours
  breakHours = 1 + 0.5 = 1.5 hours
  actualWorkHours = 7.5 hours
  shiftHours = 9 hours (09:00-18:00)
  shortfallHours = 9 - 7.5 = 1.5 hours
  excessHours = 0
```

---

## Edge Cases & Validation

### Edge Case 1: Consecutive Same-Direction Swipes

**Scenario**: Employee swipes IN twice accidentally
```
IN 09:00 → IN 09:01 (Error!)
```

**Handling**:
- Detect consecutive same-direction swipes
- Reject second swipe with error message
- Status: `'duplicate_swipes'`

---

### Edge Case 2: Missing Final OUT

**Scenario**: Employee forgets to swipe out
```
IN 09:00 → OUT 13:00 → IN 14:00 (No final OUT)
```

**Handling**:
- Status: `'missing_checkout'`
- Calculate work from completed sessions only
- Mark for regularization

---

### Edge Case 3: Very Short Gaps (< 1 minute)

**Scenario**: Accidental double swipe
```
IN 09:00 → OUT 09:00:30 (30 seconds gap)
```

**Handling**:
- Reject with error: "Minimum 1 minute gap required"
- Prevent accidental double swipes

---

### Edge Case 4: Very Long Breaks (> 4 hours)

**Scenario**: Employee takes very long break
```
IN 09:00 → OUT 10:00 → IN 15:00 (5 hour gap)
```

**Handling**:
- Still count as break (but flag for review)
- May indicate half-day or error
- Status remains `'complete'` if pattern is valid

---

### Edge Case 5: Overnight Swipes

**Scenario**: Shift spans midnight
```
IN 22:00 (Day 1) → OUT 06:00 (Day 2)
```

**Handling**:
- System already handles overnight shifts
- Use UTC timestamps
- Calculate correctly across day boundary

---

## Code Changes Required

### 1. Remove 2-Swipe Limit

**File**: `src/services/biometric-attendance.service.ts:711-716`

**Current**:
```typescript
if (record.swipes.length >= 2) {
  return {
    success: false,
    message: 'Maximum swipes limit (2) reached for today'
  };
}
```

**Change to**: Remove this block entirely

---

### 2. Add Swipe Direction Detection

**File**: `src/services/biometric-attendance.service.ts`

**Add Method**:
```typescript
private determineSwipeDirection(
  currentSwipes: Array<{ timestamp: Date; direction: 'IN' | 'OUT' }>,
  timestamp: Date
): 'IN' | 'OUT' {
  if (currentSwipes.length === 0) {
    return 'IN';
  }
  
  const lastSwipe = currentSwipes[currentSwipes.length - 1];
  const timeDiff = timestamp.getTime() - lastSwipe.timestamp.getTime();
  
  if (timeDiff < 60000) {
    throw new Error('Minimum 1 minute gap required between swipes');
  }
  
  return lastSwipe.direction === 'IN' ? 'OUT' : 'IN';
}
```

---

### 3. Add Swipe Validation

**File**: `src/services/biometric-attendance.service.ts`

**Add Method**:
```typescript
private validateSwipe(
  currentSwipes: Array<{ timestamp: Date; direction: 'IN' | 'OUT' }>,
  newSwipe: { timestamp: Date; direction: 'IN' | 'OUT' }
): { valid: boolean; reason?: string } {
  // Check minimum gap
  if (currentSwipes.length > 0) {
    const lastSwipe = currentSwipes[currentSwipes.length - 1];
    const timeDiff = newSwipe.timestamp.getTime() - lastSwipe.timestamp.getTime();
    if (timeDiff < 60000) {
      return { valid: false, reason: 'Minimum 1 minute gap required' };
    }
  }
  
  // Check direction alternation
  if (currentSwipes.length > 0) {
    const lastDirection = currentSwipes[currentSwipes.length - 1].direction;
    if (newSwipe.direction === lastDirection) {
      return { valid: false, reason: 'Swipe direction must alternate' };
    }
  }
  
  // Check first swipe is IN
  if (currentSwipes.length === 0 && newSwipe.direction !== 'IN') {
    return { valid: false, reason: 'First swipe must be IN' };
  }
  
  return { valid: true };
}
```

---

### 4. Update processSwipe Method

**File**: `src/services/biometric-attendance.service.ts:605-775`

**Key Changes**:
1. Remove 2-swipe limit check
2. Use `determineSwipeDirection()` instead of simple logic
3. Add validation before adding swipe
4. Update calculation to use multiple swipe logic
5. Update status determination

---

### 5. Update Calculation Methods

**File**: `src/services/biometric-attendance.service.ts`

**Add Methods**:
- `calculateWorkSessions()`
- `calculateBreakPeriods()`
- `calculateMultipleSwipeMetrics()`
- `determineStatus()`

**Update**: `processSecondSwipe()` → `processSwipe()` (handle any swipe, not just second)

---

### 6. Update Pre-Save Hook

**File**: `src/models/attendance-record.model.ts:358-377`

**Current**:
```typescript
if (this.swipes.length === 2) {
  this.status = 'complete';
} else if (this.swipes.length > 2) {
  this.status = 'duplicate_swipes';
} else {
  this.status = 'missing_checkout';
}
```

**Update to**: More sophisticated logic that checks:
- Valid IN-OUT pairs
- No consecutive same-direction swipes
- Ends with OUT

---

## Testing Scenarios

### Test Case 1: Normal Multiple Swipes

**Input**:
```
IN 09:00
OUT 13:00
IN 14:00
OUT 18:00
```

**Expected**:
- Status: `'complete'`
- totalWorkHours: `08:00:00`
- breakHours: `01:00:00`
- actualWorkHours: `08:00:00`
- shortfallHours: `01:00:00` (if shift is 9 hours)

---

### Test Case 2: Multiple Breaks

**Input**:
```
IN 09:00
OUT 13:00
IN 14:00
OUT 15:30
IN 16:00
OUT 18:00
```

**Expected**:
- Status: `'complete'`
- totalWorkHours: `07:30:00`
- breakHours: `01:30:00`
- Work Sessions: 3 sessions
- Break Periods: 2 breaks

---

### Test Case 3: Missing Final OUT

**Input**:
```
IN 09:00
OUT 13:00
IN 14:00
(No final OUT)
```

**Expected**:
- Status: `'missing_checkout'`
- totalWorkHours: `04:00:00` (only completed session)
- needsRegularization: `true`

---

### Test Case 4: Consecutive Same Direction

**Input**:
```
IN 09:00
IN 09:01 (Error!)
```

**Expected**:
- Reject second swipe
- Error: "Swipe direction must alternate"
- Status: `'incomplete'`

---

### Test Case 5: Overtime with Breaks

**Input**:
```
IN 09:00
OUT 13:00
IN 14:00
OUT 20:00
```

**Expected**:
- Status: `'complete'`
- totalWorkHours: `10:00:00`
- breakHours: `01:00:00`
- excessHours: `01:00:00` (if shift is 9 hours)
- attendanceStatus: Includes `'OT'`

---

## Implementation Checklist

- [ ] Remove 2-swipe limit check
- [ ] Add `determineSwipeDirection()` method
- [ ] Add `validateSwipe()` method
- [ ] Add `calculateWorkSessions()` method
- [ ] Add `calculateBreakPeriods()` method
- [ ] Add `calculateMultipleSwipeMetrics()` method
- [ ] Add `determineStatus()` method
- [ ] Update `processSwipe()` to use new logic
- [ ] Update pre-save hook status logic
- [ ] Update `processFirstSwipe()` → `processAnySwipe()`
- [ ] Remove `processSecondSwipe()` (merge into main flow)
- [ ] Add unit tests
- [ ] Update API documentation
- [ ] Test with real scenarios

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-XX  
**Status**: Ready for Implementation

