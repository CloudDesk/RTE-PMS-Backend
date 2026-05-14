# Timezone Fixes Summary

## Issues Fixed

### 1. **Primary Issue: `shiftDay` Mutation Bug** ✅ FIXED
**Problem**: The `getShiftTimings` method was mutating the original `shiftDay` Date object, causing it to change from the correct local date (Dec 15) to the previous UTC date (Dec 14).

**Root Cause**: 
- `convertISTtoUTC` was calling `shiftDay.setUTCDate()` directly on the original object
- This mutated the `shiftDay` passed to `getShiftTimings`

**Fix**:
- Created a copy of `shiftDay` (`baseShiftDay`) at the start of `getShiftTimings`
- Modified `convertISTtoUTC` to return a `dateAdjustment` value instead of mutating
- Applied date adjustments only to new Date objects created from `baseShiftDay`

**Location**: `src/services/biometric-attendance.service.ts` - `getShiftTimings` method

---

### 2. **Query Methods: Date String to shiftDay Conversion** ✅ FIXED
**Problem**: Query methods (`getAttendanceStatus`, `getAttendanceRecords`, `getAttendanceAndShiftRecords`) were not properly converting date strings from the frontend to the correct `shiftDay` format.

**Root Cause**:
- Frontend sends date strings like "2025-12-15" (meaning Dec 15 in user's local timezone)
- Backend was using `setUTCHours(0, 0, 0, 0)` directly without considering user's timezone
- This could cause mismatches when querying records

**Fix**:
- Created `convertDateStringToShiftDay` helper method
- Updated `getAttendanceStatus` to fetch user and use timezone-aware conversion
- Updated `getAttendanceRecords` to properly handle date ranges (using `$lt` for end date)
- Updated `getAttendanceAndShiftRecords` to use timezone-aware conversion

**Location**: `src/services/biometric-attendance.service.ts`
- `convertDateStringToShiftDay` method (new)
- `getAttendanceStatus` method
- `getAttendanceRecords` method  
- `getAttendanceAndShiftRecords` method

---

## Test Scenarios

### Scenario 1: IST Early Morning Swipe ✅
**Test Case**: User swipes at 04:25 AM IST on Dec 15, 2025
- **Frontend sends**: `timestamp: "2025-12-14T22:55:19.050Z"` (UTC)
- **Backend calculates**: `shiftDay: 2025-12-15T00:00:00.000Z` ✅
- **Database stores**: `shiftDay: 2025-12-15T00:00:00.000Z` ✅
- **Query with**: `date=2025-12-15` → Finds record ✅

### Scenario 2: IST Late Night Swipe ✅
**Test Case**: User swipes at 11:30 PM IST on Dec 15, 2025
- **Frontend sends**: `timestamp: "2025-12-15T18:00:00.000Z"` (UTC)
- **Backend calculates**: `shiftDay: 2025-12-15T00:00:00.000Z` ✅
- **Database stores**: `shiftDay: 2025-12-15T00:00:00.000Z` ✅
- **Query with**: `date=2025-12-15` → Finds record ✅

### Scenario 3: IST Midnight Boundary ✅
**Test Case**: User swipes at 12:00 AM IST on Dec 15, 2025
- **Frontend sends**: `timestamp: "2025-12-14T18:30:00.000Z"` (UTC)
- **Backend calculates**: `shiftDay: 2025-12-15T00:00:00.000Z` ✅
- **Database stores**: `shiftDay: 2025-12-15T00:00:00.000Z` ✅
- **Query with**: `date=2025-12-15` → Finds record ✅

### Scenario 4: UAE Timezone ✅
**Test Case**: User in UAE (UTC+4) swipes at 09:00 AM UAE on Dec 15, 2025
- **Frontend sends**: `timestamp: "2025-12-15T05:00:00.000Z"` (UTC)
- **Backend calculates**: `shiftDay: 2025-12-15T00:00:00.000Z` ✅
- **Database stores**: `shiftDay: 2025-12-15T00:00:00.000Z` ✅
- **Query with**: `date=2025-12-15` → Finds record ✅

### Scenario 5: Date Range Query ✅
**Test Case**: Query records from Dec 13 to Dec 15, 2025
- **Frontend sends**: `startDate: "2025-12-13"`, `endDate: "2025-12-15"`
- **Backend queries**: 
  - `shiftDay >= 2025-12-13T00:00:00.000Z`
  - `shiftDay < 2025-12-16T00:00:00.000Z` ✅
- **Finds records**: All records with shiftDay on Dec 13, 14, or 15 ✅

---

## Key Methods

### `getLocalShiftDay(timestamp: Date, country?: string): Date`
Converts a UTC timestamp to the local date based on user's timezone.
- **Input**: UTC timestamp (e.g., `2025-12-14T22:55:19.050Z`)
- **Output**: shiftDay in UTC format (e.g., `2025-12-15T00:00:00.000Z` for Dec 15 IST)

### `convertDateStringToShiftDay(date: Date | string, country?: string): Date`
Converts a date string from frontend to shiftDay format.
- **Input**: Date string (e.g., `"2025-12-15"`) or Date object
- **Output**: shiftDay in UTC format (e.g., `2025-12-15T00:00:00.000Z`)

### `getShiftTimings(shift: IShift & Document, shiftDay: Date): IShiftWindow`
Calculates shift timings without mutating the original `shiftDay`.
- **Key Fix**: Creates a copy of `shiftDay` to prevent mutation
- **Returns**: Shift window times in UTC

---

## Database Schema

### `shiftDay` Field
- **Type**: Date (stored as UTC)
- **Format**: `YYYY-MM-DDTHH:mm:ss.sssZ` (always midnight UTC)
- **Meaning**: Represents the start of the local calendar day
- **Example**: `2025-12-15T00:00:00.000Z` = Dec 15 in user's local timezone

### `createdAt` and `updatedAt` Fields
- **Type**: Date (stored as UTC)
- **Format**: Full UTC timestamp
- **Note**: These are technical timestamps and correctly show UTC time
- **Example**: `2025-12-14T22:55:19.294Z` = Dec 14 22:55 UTC = Dec 15 04:25 IST

---

## Important Notes

1. **Frontend sends UTC timestamps**: The frontend correctly converts local time to UTC before sending to backend.

2. **Backend stores local dates**: The `shiftDay` field stores the local calendar day, not the UTC day.

3. **Query methods are timezone-aware**: All query methods now properly convert date strings to shiftDay format using the user's timezone.

4. **No mutation of shiftDay**: The `getShiftTimings` method no longer mutates the original `shiftDay` object.

5. **Date range queries**: Use `$lt` (less than) for end date to properly include the entire last day.

---

## Testing Checklist

- [x] IST early morning swipe (04:25 AM)
- [x] IST late night swipe (11:30 PM)
- [x] IST midnight boundary (12:00 AM)
- [x] UAE timezone swipe
- [x] Date range queries
- [x] Single date queries
- [x] Multiple swipes on same day
- [x] Swipes across day boundaries

---

## Files Modified

1. `src/services/biometric-attendance.service.ts`
   - Fixed `getShiftTimings` method (no mutation)
   - Added `convertDateStringToShiftDay` helper method
   - Fixed `getAttendanceStatus` method
   - Fixed `getAttendanceRecords` method
   - Fixed `getAttendanceAndShiftRecords` method

---

## Status: ✅ ALL FIXES COMPLETE

All timezone-related issues have been identified and fixed. The system now correctly:
- Stores `shiftDay` based on user's local timezone
- Queries records using timezone-aware date conversion
- Prevents mutation of `shiftDay` during shift timing calculations

