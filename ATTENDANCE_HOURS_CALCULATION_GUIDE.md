# Attendance Hours Calculation Guide

## Overview

This document explains how attendance hours are calculated in the biometric attendance system, including `totalWorkHours`, `breakHours`, `actualWorkHours`, `shortfallHours`, and `excessHours`.

---

## Table of Contents

1. [Calculation Formulas](#calculation-formulas)
2. [Step-by-Step Calculations](#step-by-step-calculations)
3. [Break Hours Rules](#break-hours-rules)
4. [Complete Scenarios](#complete-scenarios)
5. [Code Implementation](#code-implementation)

---

## Calculation Formulas

### 1. Total Work Hours (`totalWorkHours`)

**Formula:**
```typescript
totalWorkMinutes = sum of all work sessions (IN-OUT pairs)
totalWorkHours = formatDuration(totalWorkMinutes)
```

**Explanation:**
- Sum of all complete work sessions (time between IN and OUT swipes)
- Each session = OUT timestamp - IN timestamp

**Example:**
```
Session 1: 09:00:00 to 11:00:00 = 2 hours = 120 minutes
Session 2: 13:00:00 to 17:00:00 = 4 hours = 240 minutes

totalWorkMinutes = 120 + 240 = 360 minutes
totalWorkHours = "06:00:00"
```

---

### 2. Break Hours (`breakHours`)

**Formula:**
```typescript
breakMinutes = totalWorkMinutes > 360 ? 30 : 0
breakHours = formatDuration(breakMinutes)
```

**Rules:**
- **Work ≤ 6 hours (360 minutes)**: `breakHours = "00:00:00"`
- **Work > 6 hours (360 minutes)**: `breakHours = "00:30:00"` (30 minutes)

**Examples:**

| Total Work Hours | Minutes | Break Hours | Reason |
|------------------|---------|-------------|--------|
| `03:00:00` | 180 | `00:00:00` | ≤ 6 hours |
| `05:59:59` | 359.98 | `00:00:00` | ≤ 6 hours |
| `06:00:00` | 360 | `00:00:00` | Exactly 6 hours (not > 360) |
| `06:00:01` | 360.02 | `00:30:00` | > 6 hours |
| `08:00:00` | 480 | `00:30:00` | > 6 hours |
| `10:00:00` | 600 | `00:30:00` | > 6 hours |

---

### 3. Actual Work Hours (`actualWorkHours`)

**Formula:**
```typescript
actualWorkMinutes = totalWorkMinutes - breakMinutes
actualWorkHours = formatDuration(actualWorkMinutes)
```

**Explanation:**
- Represents productive work time after deducting break
- Used for shortfall/excess calculations

**Example:**
```
totalWorkMinutes = 480 minutes (8 hours)
breakMinutes = 30 minutes

actualWorkMinutes = 480 - 30 = 450 minutes
actualWorkHours = "07:30:00"
```

---

### 4. Shift Hours (`shiftHours`)

**Formula:**
```typescript
shiftMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60)
shiftHours = formatDuration(shiftMinutes)
```

**Explanation:**
- Standard shift duration for comparison
- Calculated from shift start and end times

**Example:**
```
Shift Start: 09:00:00
Shift End: 18:00:00

shiftMinutes = (18:00 - 09:00) = 540 minutes (9 hours)
shiftHours = "09:00:00"
```

---

### 5. Shortfall Hours (`shortfallHours`)

**Formula:**
```typescript
difference = actualWorkMinutes - shiftMinutes
shortfallHours = difference < 0 ? formatDuration(Math.abs(difference)) : '00:00:00'
```

**Explanation:**
- Hours worked less than required shift
- Only calculated when `actualWorkHours < shiftHours`
- Used for payroll deductions

**Example:**
```
actualWorkMinutes = 360 (6 hours)
shiftMinutes = 540 (9 hours)
difference = 360 - 540 = -180 (negative = shortfall)

shortfallHours = formatDuration(180) = "03:00:00"
```

---

### 6. Excess Hours (`excessHours`)

**Formula:**
```typescript
difference = actualWorkMinutes - shiftMinutes
excessHours = difference > 0 ? formatDuration(difference) : '00:00:00'
```

**Explanation:**
- Overtime hours worked beyond shift requirement
- Only calculated when `actualWorkHours > shiftHours`
- Used for overtime calculations

**Example:**
```
actualWorkMinutes = 600 (10 hours)
shiftMinutes = 540 (9 hours)
difference = 600 - 540 = 60 (positive = excess)

excessHours = formatDuration(60) = "01:00:00"
```

---

## Step-by-Step Calculations

### Example: Your Data

**Input:**
- Swipe 1: IN at `09:29:49`
- Swipe 2: OUT at `11:07:31` → Session 1: 1h 37m 42s
- Swipe 3: IN at `14:14:39`
- Swipe 4: OUT at `16:33:36` → Session 2: 2h 18m 57s
- Shift: `03:30:00` to `12:30:00` = 9 hours

**Step 1: Calculate Total Work Hours**
```
Session 1: 11:07:31 - 09:29:49 = 1h 37m 42s = 97.7 minutes
Session 2: 16:33:36 - 14:14:39 = 2h 18m 57s = 138.95 minutes

totalWorkMinutes = 97.7 + 138.95 = 236.65 minutes
totalWorkHours = formatDuration(236.65) = "03:56:39"
```

**Step 2: Calculate Break Hours**
```
totalWorkMinutes = 236.65 minutes
236.65 > 360? NO

breakMinutes = 0
breakHours = formatDuration(0) = "00:00:00"
```

**Step 3: Calculate Actual Work Hours**
```
actualWorkMinutes = 236.65 - 0 = 236.65 minutes
actualWorkHours = formatDuration(236.65) = "03:56:39"
```

**Step 4: Calculate Shift Hours**
```
Shift: 03:30:00 to 12:30:00
shiftMinutes = (12:30 - 03:30) = 540 minutes (9 hours)
shiftHours = "09:00:00"
```

**Step 5: Calculate Shortfall Hours**
```
difference = 236.65 - 540 = -303.35 minutes (negative)
shortfallHours = formatDuration(303.35) = "05:03:20"
```

**Step 6: Calculate Excess Hours**
```
difference = 236.65 - 540 = -303.35 (negative, not positive)
excessHours = "00:00:00"
```

**Final Results:**
| Field | Value |
|-------|-------|
| **totalWorkHours** | `"03:56:39"` |
| **breakHours** | `"00:00:00"` |
| **actualWorkHours** | `"03:56:39"` |
| **shiftHours** | `"09:00:00"` |
| **shortfallHours** | `"05:03:20"` |
| **excessHours** | `"00:00:00"` |

---

## Break Hours Rules

### Rule Summary

| Condition | Break Hours | Example |
|-----------|-------------|---------|
| Work ≤ 6 hours | `00:00:00` | 4 hours → 0 break |
| Work = 6 hours | `00:00:00` | 6:00:00 → 0 break |
| Work > 6 hours | `00:30:00` | 6:00:01 → 30 min break |
| Work > 6 hours | `00:30:00` | 10 hours → 30 min break |

**Important Notes:**
- Break is **fixed at 30 minutes** if work > 6 hours
- Break is **not calculated** from actual swipe gaps
- Break is **deducted** from total work to get actual work
- Break threshold is **exactly 360 minutes** (6 hours)

---

## Complete Scenarios

### Scenario 1: Work 4 hours, Shift 9 hours

**Input:**
- Work: `09:00:00` to `13:00:00` = 4 hours
- Shift: `09:00:00` to `18:00:00` = 9 hours

**Calculations:**
```
totalWorkMinutes = 240 minutes
breakMinutes = 240 > 360 ? 30 : 0 = 0
actualWorkMinutes = 240 - 0 = 240
shiftMinutes = 540 minutes
difference = 240 - 540 = -300
```

**Results:**
| Field | Value |
|-------|-------|
| totalWorkHours | `"04:00:00"` |
| breakHours | `"00:00:00"` |
| actualWorkHours | `"04:00:00"` |
| shiftHours | `"09:00:00"` |
| shortfallHours | `"05:00:00"` |
| excessHours | `"00:00:00"` |

---

### Scenario 2: Work 6.5 hours, Shift 9 hours

**Input:**
- Work: `09:00:00` to `15:30:00` = 6.5 hours
- Shift: `09:00:00` to `18:00:00` = 9 hours

**Calculations:**
```
totalWorkMinutes = 390 minutes
breakMinutes = 390 > 360 ? 30 : 0 = 30
actualWorkMinutes = 390 - 30 = 360
shiftMinutes = 540 minutes
difference = 360 - 540 = -180
```

**Results:**
| Field | Value |
|-------|-------|
| totalWorkHours | `"06:30:00"` |
| breakHours | `"00:30:00"` |
| actualWorkHours | `"06:00:00"` |
| shiftHours | `"09:00:00"` |
| shortfallHours | `"03:00:00"` |
| excessHours | `"00:00:00"` |

---

### Scenario 3: Work 9.5 hours, Shift 9 hours (Perfect Match)

**Input:**
- Work: `09:00:00` to `18:30:00` = 9.5 hours
- Shift: `09:00:00` to `18:00:00` = 9 hours

**Calculations:**
```
totalWorkMinutes = 570 minutes
breakMinutes = 570 > 360 ? 30 : 0 = 30
actualWorkMinutes = 570 - 30 = 540
shiftMinutes = 540 minutes
difference = 540 - 540 = 0
```

**Results:**
| Field | Value |
|-------|-------|
| totalWorkHours | `"09:30:00"` |
| breakHours | `"00:30:00"` |
| actualWorkHours | `"09:00:00"` |
| shiftHours | `"09:00:00"` |
| shortfallHours | `"00:00:00"` |
| excessHours | `"00:00:00"` |

---

### Scenario 4: Work 10 hours, Shift 9 hours (Overtime)

**Input:**
- Work: `09:00:00` to `19:00:00` = 10 hours
- Shift: `09:00:00` to `18:00:00` = 9 hours

**Calculations:**
```
totalWorkMinutes = 600 minutes
breakMinutes = 600 > 360 ? 30 : 0 = 30
actualWorkMinutes = 600 - 30 = 570
shiftMinutes = 540 minutes
difference = 570 - 540 = 30
```

**Results:**
| Field | Value |
|-------|-------|
| totalWorkHours | `"10:00:00"` |
| breakHours | `"00:30:00"` |
| actualWorkHours | `"09:30:00"` |
| shiftHours | `"09:00:00"` |
| shortfallHours | `"00:00:00"` |
| excessHours | `"00:30:00"` |

---

### Scenario 5: Work 12 hours, Shift 9 hours (Long Overtime)

**Input:**
- Work: `09:00:00` to `21:00:00` = 12 hours
- Shift: `09:00:00` to `18:00:00` = 9 hours

**Calculations:**
```
totalWorkMinutes = 720 minutes
breakMinutes = 720 > 360 ? 30 : 0 = 30
actualWorkMinutes = 720 - 30 = 690
shiftMinutes = 540 minutes
difference = 690 - 540 = 150
```

**Results:**
| Field | Value |
|-------|-------|
| totalWorkHours | `"12:00:00"` |
| breakHours | `"00:30:00"` |
| actualWorkHours | `"11:30:00"` |
| shiftHours | `"09:00:00"` |
| shortfallHours | `"00:00:00"` |
| excessHours | `"02:30:00"` |

---

### Scenario 6: Work exactly 6 hours, Shift 9 hours

**Input:**
- Work: `09:00:00` to `15:00:00` = 6 hours
- Shift: `09:00:00` to `18:00:00` = 9 hours

**Calculations:**
```
totalWorkMinutes = 360 minutes (exactly 6 hours)
breakMinutes = 360 > 360 ? 30 : 0 = 0 (not > 360)
actualWorkMinutes = 360 - 0 = 360
shiftMinutes = 540 minutes
difference = 360 - 540 = -180
```

**Results:**
| Field | Value |
|-------|-------|
| totalWorkHours | `"06:00:00"` |
| breakHours | `"00:00:00"` |
| actualWorkHours | `"06:00:00"` |
| shiftHours | `"09:00:00"` |
| shortfallHours | `"03:00:00"` |
| excessHours | `"00:00:00"` |

---

### Scenario 7: Work 6 hours 1 minute, Shift 9 hours

**Input:**
- Work: `09:00:00` to `15:00:01` = 6 hours 1 second
- Shift: `09:00:00` to `18:00:00` = 9 hours

**Calculations:**
```
totalWorkMinutes = 360.01 minutes
breakMinutes = 360.01 > 360 ? 30 : 0 = 30
actualWorkMinutes = 360.01 - 30 = 330.01
shiftMinutes = 540 minutes
difference = 330.01 - 540 = -209.99
```

**Results:**
| Field | Value |
|-------|-------|
| totalWorkHours | `"06:00:01"` |
| breakHours | `"00:30:00"` |
| actualWorkHours | `"05:30:01"` |
| shiftHours | `"09:00:00"` |
| shortfallHours | `"03:29:59"` |
| excessHours | `"00:00:00"` |

---

### Scenario 8: Work 2 hours, Shift 9 hours (Half Day)

**Input:**
- Work: `09:00:00` to `11:00:00` = 2 hours
- Shift: `09:00:00` to `18:00:00` = 9 hours

**Calculations:**
```
totalWorkMinutes = 120 minutes
breakMinutes = 120 > 360 ? 30 : 0 = 0
actualWorkMinutes = 120 - 0 = 120
shiftMinutes = 540 minutes
difference = 120 - 540 = -420
```

**Results:**
| Field | Value |
|-------|-------|
| totalWorkHours | `"02:00:00"` |
| breakHours | `"00:00:00"` |
| actualWorkHours | `"02:00:00"` |
| shiftHours | `"09:00:00"` |
| shortfallHours | `"07:00:00"` |
| excessHours | `"00:00:00"` |

---

## Summary Table

| Total Work | Break | Actual Work | Shift | Shortfall | Excess |
|------------|-------|-------------|-------|-----------|--------|
| 2 hours | 0 | 2 hours | 9 hours | 7 hours | 0 |
| 4 hours | 0 | 4 hours | 9 hours | 5 hours | 0 |
| 6 hours | 0 | 6 hours | 9 hours | 3 hours | 0 |
| 6h 1min | 30 min | 5h 31min | 9 hours | 3h 29min | 0 |
| 6.5 hours | 30 min | 6 hours | 9 hours | 3 hours | 0 |
| 9 hours | 30 min | 8.5 hours | 9 hours | 0.5 hours | 0 |
| 9.5 hours | 30 min | 9 hours | 9 hours | 0 | 0 |
| 10 hours | 30 min | 9.5 hours | 9 hours | 0 | 0.5 hours |
| 12 hours | 30 min | 11.5 hours | 9 hours | 0 | 2.5 hours |

---

## Code Implementation

### Location
`src/services/biometric-attendance.service.ts` - `calculateMultipleSwipeMetrics()` method

### Code
```typescript
private async calculateMultipleSwipeMetrics(
  swipes: Array<{ timestamp: Date; direction?: 'IN' | 'OUT' }>,
  shiftStart: Date,
  shiftEnd: Date
): Promise<IAttendanceMetrics> {
  // 1. Calculate work sessions
  const workSessions = this.calculateWorkSessions(swipes, shiftStart, shiftEnd);

  // 2. Calculate total work minutes (sum of all sessions)
  const totalWorkMinutes = workSessions.reduce(
    (sum, session) => sum + session.durationMinutes,
    0
  );

  // 3. Calculate break minutes based on total work hours
  // Simple rule: 30 minutes break if total work > 6 hours, otherwise 0
  const breakMinutes = totalWorkMinutes > 360 ? 30 : 0;

  // 4. Actual work = total work minus break
  const actualWorkMinutes = totalWorkMinutes - breakMinutes;

  // 5. Calculate shift duration
  const shiftMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60);

  // 6. Calculate shortfall/excess
  const difference = actualWorkMinutes - shiftMinutes;

  return {
    totalWorkHours: await this.formatDuration(totalWorkMinutes),
    breakHours: await this.formatDuration(breakMinutes),
    actualWorkHours: await this.formatDuration(actualWorkMinutes),
    shiftHours: await this.formatDuration(shiftMinutes),
    shortfallHours: difference < 0 ? await this.formatDuration(Math.abs(difference)) : '00:00:00',
    excessHours: difference > 0 ? await this.formatDuration(difference) : '00:00:00',
    hasShortfall: difference < 0,
    hasExcessHours: difference > 0
  };
}
```

### Format Duration Method
```typescript
private async formatDuration(minutes: number): Promise<string> {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor((minutes % 1) * 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
```

---

## Key Points

1. **Break Calculation**: Based on total work hours, not swipe gaps
2. **Break Threshold**: Exactly 6 hours (360 minutes) = no break; 360.01 minutes = 30 min break
3. **Actual Work**: Total work minus break (used for shortfall/excess)
4. **Shortfall**: When actual work < shift hours
5. **Excess**: When actual work > shift hours
6. **Consistency**: Same logic used in `AttendanceRegularizationService`

---

## Notes

- Break hours are **not** calculated from actual swipe gaps (OUT → IN)
- Break is **fixed** at 30 minutes if work > 6 hours
- All calculations are done in **minutes** then formatted to "HH:MM:SS"
- Shortfall and excess are **mutually exclusive** (only one can be > 0)

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-XX  
**Author**: System Analysis

