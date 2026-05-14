# Leave Weekend & Holiday Exclusion Analysis

## Overview

This document explains how weekends and holidays are excluded from leave calculations in the leave application routes (`/` and `/apply-on-behalf`).

---

## Flow Diagram

```
POST /leave/ or POST /leave/apply-on-behalf
    ↓
Route Handler (leave.routes.ts)
    ↓
leaveService.create(leaveData)
    ↓
LeaveService.create() method
    ↓
[For full-day leaves only]
    ↓
1. Get Shift Assignment → weekendDays
2. Get Mandatory Holidays → mandatoryHolidays
3. Calculate Working Days → workingDays
4. Get Excluded Dates → excludedDates, excludedHolidays
5. Calculate Total Calendar Days → totalCalendarDays
6. Build weekendExclusion object
    ↓
Save Leave with weekendExclusion
```

---

## Step-by-Step Process

### Step 1: Route Handler (Lines 21-146, 148-384)

**Both routes:**
- Accept leave data from frontend
- Extract: `startDate`, `endDate`, `leaveDuration`, `halfDayType`, etc.
- Call `leaveService.create(leaveData)`

**Key Points:**
- `weekendExclusion` is **NOT** accepted from frontend (calculated by backend)
- `noOfDays` is optional (will be calculated/overridden by backend)

---

### Step 2: Leave Service - Create Method (Line 751)

**Location:** `src/services/leave.service.ts`

**Process:**
1. **Delete frontend weekendExclusion** (Line 754):
   ```typescript
   delete leaveData.weekendExclusion; // Ensures backend calculates it
   ```

2. **Skip calculation for:**
   - `restricted_holiday` leave type (already set to 1 day)
   - `half-day` leaves (already set to 0.5 days)

3. **For full-day leaves only** (Lines 1078-1149):
   - Calculate working days excluding weekends and holidays
   - Build `weekendExclusion` object

---

### Step 3: Get Shift Assignment (Lines 1083-1093)

**Method:** `getShiftAssignmentForDateRange()`

**Purpose:** Get the active shift assignment for the leave date range

**Query:**
```typescript
ShiftAssignment.findOne({
  userId,
  isActive: true,
  startDate: { $lte: endDate },
  $or: [
    { endDate: { $gte: startDate } },
    { endDate: null }, // Ongoing assignment
  ],
}).sort({ startDate: -1 }); // Most recent first
```

**Result:**
- `weekendDays`: Array of weekend day numbers (e.g., `[0, 6]` for Sunday & Saturday)
- **Default:** `[0, 6]` if no shift assignment found

**Example:**
- User has shift assignment with `weekendDays: [0, 6]`
- Result: `weekendDays = [0, 6]` (Sunday and Saturday)

---

### Step 4: Get All Holidays (Lines 1096-1100)

**Method:** `getMandatoryHolidays()` (Note: Despite the name, it now returns ALL holidays)

**Purpose:** Get ALL holidays (mandatory + optional) from user's holiday calendar within the date range

**✅ FIX:** Updated to include ALL holidays (not just mandatory) because:
- Optional holidays (restricted_holiday) are applied separately as leaves
- Attendance records may already be marked for optional holidays
- We need to exclude them to avoid conflicts

**Process:**
1. **Get user's holiday calendar** (Line 248):
   ```typescript
   const user = await User.findById(userId).select('holidayCalendarId');
   ```

2. **If no calendar assigned:**
   - Return empty array `[]` (no holidays excluded)

3. **If calendar exists:**
   - Fetch `HolidayCalendar` by `holidayCalendarId`
   - Filter holidays where:
     - `type === 'mandatory'` OR `type === 'optional'` ✅ **FIX: Includes both types**
     - Date falls within `startDate` to `endDate`

**Result:**
- `mandatoryHolidays`: Array of Date objects for ALL holidays (mandatory + optional)

**Example:**
- Leave: Dec 26-30, 2025
- Holiday calendar has:
  - Mandatory holiday on Dec 28, 2025
  - Optional holiday on Dec 29, 2025
- Result: `mandatoryHolidays = [Date('2025-12-28'), Date('2025-12-29')]` ✅ **Both included**

**⚠️ NOTE:** This method uses `holidayCalendarId` (legacy field). For year-based calendars, consider using `holidayCalendarHistory` (as done in payroll service).

---

### Step 5: Calculate Working Days (Lines 1103-1108)

**Method:** `calculateWorkingDaysExcludingWeekendsAndHolidays()`

**Purpose:** Count working days excluding weekends and ALL holidays (mandatory + optional)

**Algorithm:**
```typescript
1. Start from startDate
2. Loop through each day until endDate
3. For each day:
   - Check if dayOfWeek is in weekendDays → Skip
   - Check if date is in allHolidays (mandatory + optional) → Skip ✅ FIX: Includes optional
   - Otherwise → Count as working day
4. Return total working days
```

**Example:**
- Leave: Dec 26-30, 2025 (5 calendar days)
- Weekend days: `[0, 6]` (Sunday, Saturday)
- Dec 27 = Friday → Working day ✅
- Dec 28 = Saturday → Weekend ❌
- Dec 29 = Sunday → Weekend ❌
- Dec 30 = Monday → Working day ✅
- Mandatory holiday: Dec 28 → Holiday ❌
- Optional holiday: Dec 29 → Holiday ❌ ✅ **FIX: Also excluded**
- **Result:** `workingDays = 3` (Dec 26, Dec 27, Dec 30)

---

### Step 6: Get Excluded Dates (Lines 1122-1127)

**Method:** `getExcludedDatesWithHolidays()`

**Purpose:** Get arrays of excluded dates (weekends + holidays) and excluded holidays separately

**✅ FIX:** Updated to include ALL holidays (mandatory + optional)

**Process:**
```typescript
1. Loop through each day from startDate to endDate
2. For each day:
   - If weekend → Add to excludedDates
   - If holiday (mandatory OR optional) → Add to excludedDates AND excludedHolidays ✅ FIX
3. Return { excludedDates, excludedHolidays }
```

**Result:**
- `excludedDates`: All excluded dates (weekends + holidays)
- `excludedHolidays`: ALL holidays (mandatory + optional) ✅ **FIX: Includes optional**

**Example:**
- Leave: Dec 26-30, 2025
- `excludedDates = [Dec 28 (Saturday), Dec 29 (Sunday)]`
- `excludedHolidays = [Dec 28]` (if Dec 28 is a mandatory holiday)
- `excludedHolidays = [Dec 28, Dec 29]` (if Dec 28 is mandatory AND Dec 29 is optional) ✅ **Both included**

---

### Step 7: Calculate Total Calendar Days (Lines 1130-1133)

**Method:** `calculateTotalCalendarDays()`

**Purpose:** Calculate total calendar days (inclusive of start and end dates)

**Formula:**
```typescript
totalCalendarDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
```

**Example:**
- Start: Dec 26, 2025
- End: Dec 30, 2025
- **Result:** `totalCalendarDays = 5` (Dec 26, 27, 28, 29, 30)

---

### Step 8: Build weekendExclusion Object (Lines 1139-1145)

**Structure:**
```typescript
leaveData.weekendExclusion = {
  weekendDays: [0, 6],                    // Weekend day numbers
  excludedDates: [Date, Date, ...],        // All excluded dates
  excludedHolidays: [Date, ...],          // Only mandatory holidays
  totalCalendarDays: 5,                   // Total calendar days
  actualDays: 3                            // Working days (noOfDays)
};
```

**Example Output:**
```json
{
  "weekendExclusion": {
    "weekendDays": [0, 6],
    "excludedDates": [
      "2025-12-27T00:00:00.000Z",
      "2025-12-28T00:00:00.000Z"
    ],
    "excludedHolidays": [],
    "totalCalendarDays": 5,
    "actualDays": 3
  }
}
```

---

## Your Example Analysis

**Input:**
- `startDate`: `2025-12-26`
- `endDate`: `2025-12-30`
- `leaveType`: `annual`
- `leaveDuration`: `full-day`

**Calculation:**
1. **Calendar Days:** Dec 26, 27, 28, 29, 30 = **5 days**
2. **Weekend Days:** `[0, 6]` (Sunday, Saturday)
   - Dec 27 = Friday ✅
   - Dec 28 = Saturday ❌ (Weekend)
   - Dec 29 = Sunday ❌ (Weekend)
   - Dec 30 = Monday ✅
3. **Mandatory Holidays:** Checked from user's holiday calendar
   - If Dec 28 is a mandatory holiday → Excluded
   - If not → Only weekends excluded
4. **Working Days:** **3 days** (Dec 26, 27, 30)

**Result:**
```json
{
  "noOfDays": 3,
  "weekendExclusion": {
    "weekendDays": [0, 6],
    "excludedDates": [
      "2025-12-27T00:00:00.000Z",  // Saturday
      "2025-12-28T00:00:00.000Z"   // Sunday
    ],
    "excludedHolidays": [],
    "totalCalendarDays": 5,
    "actualDays": 3
  }
}
```

---

## Key Methods Reference

### 1. `getShiftAssignmentForDateRange()` (Lines 191-214)
- Finds active shift assignment for date range
- Returns `weekendDays` array
- Default: `[0, 6]` if no assignment

### 2. `getMandatoryHolidays()` (Lines 242-291)
- Gets ALL holidays (mandatory + optional) from user's holiday calendar ✅ **FIX: Includes optional**
- Filters by date range
- Returns array of Date objects for all holidays
- **Uses:** `user.holidayCalendarId` (legacy field)
- **Reason:** Optional holidays are applied separately as leaves, so we exclude them to avoid conflicts

### 3. `calculateWorkingDaysExcludingWeekendsAndHolidays()` (Lines 296-334)
- Counts working days excluding weekends and holidays
- Loops through each day
- Returns number of working days

### 4. `getExcludedDatesWithHolidays()` (Lines 344-390)
- Gets arrays of excluded dates
- Separates weekends and holidays
- Returns `{ excludedDates, excludedHolidays }`

### 5. `calculateTotalCalendarDays()` (Lines 222-233)
- Calculates total calendar days (inclusive)
- Formula: `(endDate - startDate) / (24 hours) + 1`

---

## Important Notes

### 1. Holiday Calendar Lookup
- **Current:** Uses `user.holidayCalendarId` (single calendar)
- **Payroll Service:** Uses `user.holidayCalendarHistory` (year-based calendars)
- **Recommendation:** Consider updating to use `holidayCalendarHistory` for consistency

### 2. Weekend Days Source
- From `ShiftAssignment.weekendDays`
- Default: `[0, 6]` (Sunday, Saturday) if no assignment
- User-specific based on their shift

### 3. Holiday Types
- **Mandatory holidays:** Excluded from leave days ✅
- **Optional holidays (restricted_holiday):** ✅ **FIX: NOW EXCLUDED** (applied separately as leaves, but excluded to avoid attendance record conflicts)

### 4. Half-Day Leaves
- **Skip calculation:** `noOfDays = 0.5` (fixed)
- **No weekend/holiday exclusion:** Applied as-is

### 5. Restricted Holiday Leaves
- **Skip calculation:** `noOfDays = 1` (fixed)
- **No weekend/holiday exclusion:** Applied as-is

---

## Validation

**Before saving leave:**
- **Check:** At least 1 working day required
- **Error:** "All days in the requested date range fall on weekends/holidays"

**Example:**
- Leave: Saturday to Sunday only
- Result: Error thrown (no working days)

---

## Summary

**Weekend & Holiday Exclusion Flow:**
1. ✅ Get shift assignment → `weekendDays`
2. ✅ Get ALL holidays (mandatory + optional) → `mandatoryHolidays` ✅ **FIX: Includes optional**
3. ✅ Calculate working days → `noOfDays`
4. ✅ Get excluded dates → `excludedDates`, `excludedHolidays`
5. ✅ Calculate total calendar days → `totalCalendarDays`
6. ✅ Build `weekendExclusion` object
7. ✅ Save leave with exclusion data

**Result:** Leave record includes `weekendExclusion` object showing:
- Which days were excluded
- Why they were excluded (weekend vs holiday)
- Total calendar days vs actual working days

**✅ FIX Applied:**
- **All holidays excluded:** Both mandatory and optional holidays are now excluded from leave calculations
- **Reason:** Optional holidays are applied separately as leaves, so excluding them prevents attendance record conflicts

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Status:** ✅ Complete Analysis
