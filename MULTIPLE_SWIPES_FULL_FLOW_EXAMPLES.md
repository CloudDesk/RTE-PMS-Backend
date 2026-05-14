# Multiple Swipes - Full Flow Examples
## Complete Step-by-Step Scenarios

**Date:** Generated after full implementation  
**Purpose:** Demonstrate complete flow of multiple swipes system

---

## Table of Contents
1. [Example 1: Simple 2-Swipe Day](#example-1-simple-2-swipe-day)
2. [Example 2: Multiple Swipes with Lunch Break](#example-2-multiple-swipes-with-lunch-break)
3. [Example 3: Multiple Swipes with Short Breaks](#example-3-multiple-swipes-with-short-breaks)
4. [Example 4: Late Entry with Multiple Swipes](#example-4-late-entry-with-multiple-swipes)
5. [Example 5: Overnight Shift with Multiple Swipes](#example-5-overnight-shift-with-multiple-swipes)
6. [Example 6: Incomplete Swipes (Missing Checkout)](#example-6-incomplete-swipes-missing-checkout)
7. [Example 7: Overtime with Multiple Swipes](#example-7-overtime-with-multiple-swipes)
8. [API Response Examples](#api-response-examples)

---

## Example 1: Simple 2-Swipe Day

### Scenario
**Employee:** John Doe  
**Shift:** 09:00 - 18:00 (9 hours)  
**Shift Window:** 08:00 - 19:00  
**Date:** 2024-01-15

### Swipe Flow

#### Swipe 1: IN at 09:00
```
Timestamp: 2024-01-15T09:00:00Z
Direction: IN (determined automatically - first swipe)
```

**Processing Steps:**
1. ✅ User validated: John Doe found
2. ✅ Shift assignment retrieved: Shift Code "DAY"
3. ✅ Attendance record created (new record)
4. ✅ Window validation: 09:00 is within 08:00-19:00 ✅
5. ✅ Direction determined: First swipe → 'IN'
6. ✅ Swipe validation: Passed (first swipe, no previous swipes)
7. ✅ Swipe added to record
8. ✅ Swipes sorted: [IN 09:00]
9. ✅ FirstIn updated: 09:00
10. ✅ LastOut: null (no OUT yet)
11. ✅ First swipe handling:
    - `isLateEntry = 09:00 > 09:00` → `false` ✅ (On-Time)
    - `attendanceStatus = ['On-Time']`
    - `needsRegularization = false`
    - `totalWorkHours = '00:00:00'` (no work yet)
    - `breakHours = '00:00:00'`
    - `actualWorkHours = '00:00:00'`
    - `shiftHours = '09:00:00'`
12. ✅ Status determined: `'incomplete'` (only IN, no OUT)
13. ✅ Record saved

**Record State After Swipe 1:**
```json
{
  "swipes": [
    {
      "timestamp": "2024-01-15T09:00:00Z",
      "direction": "IN",
      "deviceId": "biometric",
      "location": { "latitude": 12.9716, "longitude": 77.5946, "address": "Office" }
    }
  ],
  "firstIn": "2024-01-15T09:00:00Z",
  "lastOut": null,
  "status": "incomplete",
  "attendanceStatus": ["On-Time"],
  "isLateEntry": false,
  "isEarlyExit": false,
  "totalWorkHours": "00:00:00",
  "breakHours": "00:00:00",
  "actualWorkHours": "00:00:00",
  "shiftHours": "09:00:00",
  "needsRegularization": false
}
```

**API Response:**
```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "shiftCode": "DAY",
    "shiftDay": "2024-01-15T00:00:00Z",
    "swipeTime": "2024-01-15T09:00:00Z",
    "swipeDirection": "IN",
    "totalSwipes": 1,
    "isWithinWindow": true,
    "firstIn": "2024-01-15T09:00:00Z",
    "lastOut": null,
    "status": "incomplete",
    "attendanceStatus": ["On-Time"],
    "totalWorkHours": "00:00:00",
    "breakHours": "00:00:00",
    "actualWorkHours": "00:00:00"
  }
}
```

---

#### Swipe 2: OUT at 18:00
```
Timestamp: 2024-01-15T18:00:00Z
Direction: OUT (determined automatically - alternates from IN)
```

**Processing Steps:**
1. ✅ User validated: John Doe found
2. ✅ Shift assignment retrieved: Shift Code "DAY"
3. ✅ Attendance record retrieved (existing record)
4. ✅ Window validation: 18:00 is within 08:00-19:00 ✅
5. ✅ Direction determined: Last swipe was IN → 'OUT'
6. ✅ Swipe validation:
    - Minimum gap: 18:00 - 09:00 = 9 hours > 1 minute ✅
    - Direction alternation: IN → OUT ✅
    - Passed ✅
7. ✅ Swipe added to record
8. ✅ Swipes sorted: [IN 09:00, OUT 18:00]
9. ✅ FirstIn updated: 09:00 (unchanged)
10. ✅ LastOut updated: 18:00
11. ✅ Multiple swipes handling (length = 2):
    - Calculate work sessions:
      - Session 1: IN 09:00 → OUT 18:00
      - Duration: 9 hours = 540 minutes
      - Overtime: 18:00 > 18:00? No → `isOvertime: false`
    - Calculate break periods:
      - No OUT-IN gaps → 0 breaks
    - Calculate metrics:
      - `totalWorkMinutes = 540`
      - `totalBreakMinutes = 0`
      - `actualWorkMinutes = 540` (work - breaks)
      - `shiftMinutes = 540` (9 hours)
      - `difference = 540 - 540 = 0`
      - `shortfallHours = '00:00:00'`
      - `excessHours = '00:00:00'`
    - Update fields:
      - `totalWorkHours = '09:00:00'`
      - `breakHours = '00:00:00'`
      - `actualWorkHours = '09:00:00'`
      - `shortfallHours = '00:00:00'`
      - `excessHours = '00:00:00'`
    - Early exit check: `18:00 < 18:00` → `false` ✅ (On-Time)
    - Add Present status: Work sessions exist → `['On-Time', 'Present']`
12. ✅ Status determined: `'complete'` (starts with IN, ends with OUT, equal IN/OUT count)
13. ✅ Record saved

**Record State After Swipe 2:**
```json
{
  "swipes": [
    {
      "timestamp": "2024-01-15T09:00:00Z",
      "direction": "IN",
      "deviceId": "biometric",
      "location": { "latitude": 12.9716, "longitude": 77.5946, "address": "Office" }
    },
    {
      "timestamp": "2024-01-15T18:00:00Z",
      "direction": "OUT",
      "deviceId": "biometric",
      "location": { "latitude": 12.9716, "longitude": 77.5946, "address": "Office" }
    }
  ],
  "firstIn": "2024-01-15T09:00:00Z",
  "lastOut": "2024-01-15T18:00:00Z",
  "status": "complete",
  "attendanceStatus": ["On-Time", "Present"],
  "isLateEntry": false,
  "isEarlyExit": false,
  "totalWorkHours": "09:00:00",
  "breakHours": "00:00:00",
  "actualWorkHours": "09:00:00",
  "shiftHours": "09:00:00",
  "shortfallHours": "00:00:00",
  "excessHours": "00:00:00",
  "needsRegularization": false
}
```

**API Response:**
```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "shiftCode": "DAY",
    "shiftDay": "2024-01-15T00:00:00Z",
    "swipeTime": "2024-01-15T18:00:00Z",
    "swipeDirection": "OUT",
    "totalSwipes": 2,
    "isWithinWindow": true,
    "firstIn": "2024-01-15T09:00:00Z",
    "lastOut": "2024-01-15T18:00:00Z",
    "status": "complete",
    "attendanceStatus": ["On-Time", "Present"],
    "totalWorkHours": "09:00:00",
    "breakHours": "00:00:00",
    "actualWorkHours": "09:00:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "00:00:00",
    "excessHours": "00:00:00",
    "workSessions": [
      {
        "sessionNumber": 1,
        "inTime": "2024-01-15T09:00:00Z",
        "outTime": "2024-01-15T18:00:00Z",
        "durationMinutes": 540,
        "isOvertime": false
      }
    ],
    "breakPeriods": []
  }
}
```

---

## Example 2: Multiple Swipes with Lunch Break

### Scenario
**Employee:** Jane Smith  
**Shift:** 09:00 - 18:00 (9 hours)  
**Shift Window:** 08:00 - 19:00  
**Date:** 2024-01-15

**Swipes:**
- IN at 09:00 (check-in)
- OUT at 13:00 (lunch break start)
- IN at 14:00 (lunch break end)
- OUT at 18:00 (check-out)

### Complete Flow

#### Swipe 1: IN at 09:00
**Result:** Same as Example 1, Swipe 1

#### Swipe 2: OUT at 13:00
```
Timestamp: 2024-01-15T13:00:00Z
Direction: OUT
```

**Processing:**
- Swipes: [IN 09:00, OUT 13:00]
- Work Sessions: 1 (09:00-13:00 = 4 hours)
- Break Periods: 0 (no OUT-IN gap yet)
- Status: `'incomplete'` (ends with OUT but no matching IN after)
- `totalWorkHours = '04:00:00'`
- `actualWorkHours = '04:00:00'`

#### Swipe 3: IN at 14:00
```
Timestamp: 2024-01-15T14:00:00Z
Direction: IN (alternates from OUT)
```

**Processing:**
- Swipes: [IN 09:00, OUT 13:00, IN 14:00]
- Work Sessions: 1 (09:00-13:00 = 4 hours)
- Break Periods: 1 (OUT 13:00 → IN 14:00 = 1 hour)
  - Duration: 60 minutes >= 15 ✅
  - Duration: 60 minutes >= 30 ✅ → `isLunchBreak: true`
- Status: `'incomplete'` (ends with IN)
- `totalWorkHours = '04:00:00'`
- `breakHours = '01:00:00'`
- `actualWorkHours = '04:00:00'`

#### Swipe 4: OUT at 18:00
```
Timestamp: 2024-01-15T18:00:00Z
Direction: OUT (alternates from IN)
```

**Processing:**
- Swipes: [IN 09:00, OUT 13:00, IN 14:00, OUT 18:00]
- Work Sessions: 2
  - Session 1: IN 09:00 → OUT 13:00 = 4 hours (240 minutes)
  - Session 2: IN 14:00 → OUT 18:00 = 4 hours (240 minutes)
- Break Periods: 1
  - Break 1: OUT 13:00 → IN 14:00 = 1 hour (60 minutes, lunch break)
- Calculate Metrics:
  - `totalWorkMinutes = 240 + 240 = 480` (8 hours)
  - `totalBreakMinutes = 60` (1 hour)
  - `actualWorkMinutes = 480` (work time, breaks already excluded)
  - `shiftMinutes = 540` (9 hours)
  - `difference = 480 - 540 = -60` (shortfall)
  - `shortfallHours = '01:00:00'`
  - `excessHours = '00:00:00'`
- Status: `'complete'` (starts with IN, ends with OUT, equal IN/OUT count)
- `attendanceStatus = ['On-Time', 'Present']`

**Final Record State:**
```json
{
  "swipes": [
    { "timestamp": "2024-01-15T09:00:00Z", "direction": "IN" },
    { "timestamp": "2024-01-15T13:00:00Z", "direction": "OUT" },
    { "timestamp": "2024-01-15T14:00:00Z", "direction": "IN" },
    { "timestamp": "2024-01-15T18:00:00Z", "direction": "OUT" }
  ],
  "firstIn": "2024-01-15T09:00:00Z",
  "lastOut": "2024-01-15T18:00:00Z",
  "status": "complete",
  "attendanceStatus": ["On-Time", "Present"],
  "totalWorkHours": "08:00:00",
  "breakHours": "01:00:00",
  "actualWorkHours": "08:00:00",
  "shiftHours": "09:00:00",
  "shortfallHours": "01:00:00",
  "excessHours": "00:00:00"
}
```

**API Response:**
```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "swipeTime": "2024-01-15T18:00:00Z",
    "swipeDirection": "OUT",
    "totalSwipes": 4,
    "firstIn": "2024-01-15T09:00:00Z",
    "lastOut": "2024-01-15T18:00:00Z",
    "status": "complete",
    "attendanceStatus": ["On-Time", "Present"],
    "totalWorkHours": "08:00:00",
    "breakHours": "01:00:00",
    "actualWorkHours": "08:00:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "01:00:00",
    "excessHours": "00:00:00",
    "workSessions": [
      {
        "sessionNumber": 1,
        "inTime": "2024-01-15T09:00:00Z",
        "outTime": "2024-01-15T13:00:00Z",
        "durationMinutes": 240,
        "isOvertime": false
      },
      {
        "sessionNumber": 2,
        "inTime": "2024-01-15T14:00:00Z",
        "outTime": "2024-01-15T18:00:00Z",
        "durationMinutes": 240,
        "isOvertime": false
      }
    ],
    "breakPeriods": [
      {
        "breakNumber": 1,
        "startTime": "2024-01-15T13:00:00Z",
        "endTime": "2024-01-15T14:00:00Z",
        "durationMinutes": 60,
        "isLunchBreak": true
      }
    ]
  }
}
```

---

## Example 3: Multiple Swipes with Short Breaks

### Scenario
**Employee:** Bob Wilson  
**Shift:** 09:00 - 18:00  
**Swipes:**
- IN at 09:00
- OUT at 10:00 (quick break)
- IN at 10:05 (5-minute break - too short to count)
- OUT at 18:00

### Flow Summary

**After All Swipes:**
- Work Sessions: 2
  - Session 1: 09:00-10:00 = 1 hour
  - Session 2: 10:05-18:00 = 7 hours 55 minutes
- Break Periods: 0 (10:00-10:05 = 5 minutes < 15 min threshold)
- `totalWorkHours = '08:55:00'`
- `breakHours = '00:00:00'` (short break ignored)
- `actualWorkHours = '08:55:00'`
- `shortfallHours = '00:05:00'` (5 minutes short of 9 hours)

**Key Point:** Breaks < 15 minutes are NOT counted as breaks, but work time is still calculated correctly.

---

## Example 4: Late Entry with Multiple Swipes

### Scenario
**Employee:** Alice Brown  
**Shift:** 09:00 - 18:00  
**Swipes:**
- IN at 09:30 (30 minutes late)
- OUT at 13:00
- IN at 14:00
- OUT at 18:30 (30 minutes overtime)

### Flow Summary

**After Swipe 1 (IN 09:30):**
- `isLateEntry = 09:30 > 09:00` → `true`
- `attendanceStatus = ['Late']`
- `needsRegularization = true`

**After All Swipes:**
- Work Sessions: 2
  - Session 1: 09:30-13:00 = 3.5 hours
  - Session 2: 14:00-18:30 = 4.5 hours
- Break Periods: 1 (13:00-14:00 = 1 hour)
- `totalWorkHours = '08:00:00'`
- `breakHours = '01:00:00'`
- `actualWorkHours = '08:00:00'`
- `excessHours = '00:00:00'` (8 hours work, but 30 min late + 30 min OT = net 0)
- `attendanceStatus = ['Late', 'Present', 'OT']`
- `needsRegularization = true` (late entry)

---

## Example 5: Overnight Shift with Multiple Swipes

### Scenario
**Employee:** Charlie Davis  
**Shift:** 22:00 Day 1 - 06:00 Day 2 (overnight)  
**Shift Window:** 21:00 Day 1 - 07:00 Day 2  
**Date:** 2024-01-15 (shift day = Day 1)

**Swipes:**
- IN at 22:00 Day 1
- OUT at 02:00 Day 2 (break)
- IN at 03:00 Day 2
- OUT at 06:00 Day 2

### Flow Summary

**After All Swipes:**
- Work Sessions: 2
  - Session 1: 22:00 Day 1 → 02:00 Day 2 = 4 hours
  - Session 2: 03:00 Day 2 → 06:00 Day 2 = 3 hours
- Break Periods: 1 (02:00-03:00 = 1 hour)
- `totalWorkHours = '07:00:00'`
- `breakHours = '01:00:00'`
- `actualWorkHours = '07:00:00'`
- `shiftHours = '08:00:00'`
- `shortfallHours = '01:00:00'`
- Status: `'complete'`

**Key Point:** Overnight shifts are handled correctly with UTC date adjustments.

---

## Example 6: Incomplete Swipes (Missing Checkout)

### Scenario
**Employee:** David Lee  
**Shift:** 09:00 - 18:00  
**Swipes:**
- IN at 09:00
- OUT at 13:00
- IN at 14:00
- (Missing final OUT)

### Flow Summary

**After Swipe 3 (IN 14:00):**
- Work Sessions: 1 (09:00-13:00 = 4 hours)
  - Note: IN 14:00 has no matching OUT, so no session created
- Break Periods: 1 (13:00-14:00 = 1 hour)
- Status: `'missing_checkout'` (ends with IN, not OUT)
- `totalWorkHours = '04:00:00'`
- `breakHours = '01:00:00'`
- `attendanceStatus = ['On-Time', 'Present']` (has work sessions)
- `needsRegularization = true` (incomplete)

**Key Point:** System handles incomplete swipes gracefully, calculating what it can.

---

## Example 7: Overtime with Multiple Swipes

### Scenario
**Employee:** Emma White  
**Shift:** 09:00 - 18:00  
**Swipes:**
- IN at 09:00
- OUT at 13:00
- IN at 14:00
- OUT at 20:00 (2 hours overtime)

### Flow Summary

**After All Swipes:**
- Work Sessions: 2
  - Session 1: 09:00-13:00 = 4 hours
  - Session 2: 14:00-20:00 = 6 hours
    - `isOvertime = true` (20:00 > 18:00)
- Break Periods: 1 (13:00-14:00 = 1 hour)
- `totalWorkHours = '10:00:00'`
- `breakHours = '01:00:00'`
- `actualWorkHours = '10:00:00'`
- `shiftHours = '09:00:00'`
- `excessHours = '01:00:00'` (10 hours work - 9 hours shift = 1 hour OT)
- `attendanceStatus = ['On-Time', 'Present', 'OT']`
- `needsRegularization = false` (no issues, just OT)

---

## API Response Examples

### Complete Response Structure

```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "shiftCode": "DAY",
    "shiftDay": "2024-01-15T00:00:00Z",
    "swipeTime": "2024-01-15T18:00:00Z",
    "swipeDirection": "OUT",
    "totalSwipes": 4,
    "isWithinWindow": true,
    "firstIn": "2024-01-15T09:00:00Z",
    "lastOut": "2024-01-15T18:00:00Z",
    "totalWorkHours": "08:00:00",
    "breakHours": "01:00:00",
    "actualWorkHours": "08:00:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "01:00:00",
    "excessHours": "00:00:00",
    "isLateEntry": false,
    "isEarlyExit": false,
    "status": "complete",
    "attendanceStatus": ["On-Time", "Present"],
    "needsRegularization": false,
    "workSessions": [
      {
        "sessionNumber": 1,
        "inTime": "2024-01-15T09:00:00Z",
        "outTime": "2024-01-15T13:00:00Z",
        "durationMinutes": 240,
        "isOvertime": false
      },
      {
        "sessionNumber": 2,
        "inTime": "2024-01-15T14:00:00Z",
        "outTime": "2024-01-15T18:00:00Z",
        "durationMinutes": 240,
        "isOvertime": false
      }
    ],
    "breakPeriods": [
      {
        "breakNumber": 1,
        "startTime": "2024-01-15T13:00:00Z",
        "endTime": "2024-01-15T14:00:00Z",
        "durationMinutes": 60,
        "isLunchBreak": true
      }
    ],
    "outOfWindowSwipes": []
  }
}
```

### Error Response Example

```json
{
  "success": false,
  "message": "Minimum 1 minute gap required between swipes"
}
```

---

## Key Points Summary

### 1. **Direction Determination**
- First swipe: Always 'IN'
- Subsequent swipes: Alternates (IN → OUT → IN → OUT)
- Minimum gap: 1 minute between swipes

### 2. **Work Session Calculation**
- Pairs IN with next OUT
- Skips invalid pairs (OUT before IN)
- Calculates duration in minutes
- Marks overtime if OUT > shiftEnd

### 3. **Break Period Calculation**
- Finds gaps between OUT and next IN
- Only counts breaks >= 15 minutes
- Marks as lunch break if >= 30 minutes
- Skips invalid breaks (IN before OUT)

### 4. **Status Determination**
- `incomplete`: No swipes or doesn't start with IN
- `complete`: Starts with IN, ends with OUT, equal IN/OUT count
- `missing_checkout`: Ends with IN (no final OUT)
- `duplicate_swipes`: Consecutive same-direction swipes

### 5. **Metrics Calculation**
- `totalWorkHours`: Sum of all work sessions
- `breakHours`: Sum of all break periods (>= 15 min)
- `actualWorkHours`: Total work (breaks already excluded)
- `shortfallHours`: If actual < shift
- `excessHours`: If actual > shift

### 6. **Attendance Status**
- Multiple statuses can exist: `['Late', 'Present', 'OT']`
- Added automatically based on conditions
- Never duplicates (checks before adding)

---

## Flow Diagram

```
Swipe Received
    ↓
Validate User & Shift
    ↓
Get/Create Attendance Record
    ↓
Check Holiday Status
    ↓
Validate Shift Window
    ↓
Determine Swipe Direction (IN/OUT)
    ↓
Validate Swipe (gap, alternation, first must be IN)
    ↓
Add Swipe to Record
    ↓
Sort Swipes by Timestamp
    ↓
Update firstIn & lastOut
    ↓
Handle Out-of-Window (if applicable)
    ↓
If First Swipe:
    → Set initial values
    → Status: incomplete
Else:
    → Calculate Work Sessions
    → Calculate Break Periods
    → Calculate Metrics
    → Update Status
    ↓
Determine Final Status
    ↓
Save Record
    ↓
Return Response with Work Sessions & Breaks
```

---

**End of Examples**

