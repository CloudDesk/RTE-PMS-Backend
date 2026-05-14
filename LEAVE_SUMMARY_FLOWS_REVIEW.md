# Leave Summary Flows - Comprehensive Review

## Overview
This document reviews all three leave summary operations: Allotment, Release, and Carry Forward.

---

## 1. Leave Allotment Flow

### Route
- **Endpoint:** `POST /leave-summary/allotments`
- **File:** `src/routes/leave-summary.routes.ts` (lines 444-453)

### Flow
1. **Route Handler** receives request with `userId`, `year`, and leave type allotments
2. **Calls:** `leaveSummaryService.updateLeaveAllotments()`
3. **Service Method:** `updateLeaveAllotments()` (lines 231-330)
   - ✅ Calls `getLeaveSummary()` - **ensures record exists** (creates if not found)
   - ✅ Updates `alloted` for specified leave types only
   - ✅ Pre-save hook automatically calculates `remaining = alloted - availed`
   - ✅ Sends email notification (unless `skipEmail: true`)

### Data Integrity
- ✅ **One user, one year, one record:** Enforced by unique index `{ userId: 1, year: 1 }`
- ✅ **Record creation:** `getLeaveSummary()` creates record with all zeros if not exists
- ✅ **Remaining calculation:** Pre-save hook ensures `remaining = alloted - availed`

### Issues Found
- ⚠️ **Minor:** `isNew` check (line 250) only checks 3 categories (annual, sick, compOff). If other types have values, `isNew` might be inaccurate, but this only affects email text, not functionality.

### Status: ✅ **WORKING CORRECTLY**

---

## 2. Leave Release Flow (India Only)

### Route
- **Endpoint:** `POST /leave-summary/release`
- **File:** `src/routes/leave-summary.routes.ts` (lines 455-520)

### Flow
1. **Route Handler** receives request with `employeeIds[]`, `releaseType`, `period`, `leaveType`, `daysReleased`
2. **Calls:** `LeaveReleaseService.releaseLeaves()`
3. **Service Method:** `releaseLeaves()` (lines 35-151)
   - ✅ Validates India country (`country === 'IN'`)
   - ✅ For each employee:
     - ✅ Calls `getLeaveSummary()` - **ensures record exists** (creates if not found)
     - ✅ Gets current `alloted` balance
     - ✅ Calculates `newAlloted = currentAlloted + daysReleased` (ADDS to existing)
     - ✅ Calls `updateLeaveAllotments()` with new alloted (skips email)
     - ✅ Creates `LeaveRelease` record
     - ✅ Sends release-specific email

### Data Integrity
- ✅ **Record creation:** `getLeaveSummary()` ensures record exists before update
- ✅ **Balance addition:** Correctly adds `daysReleased` to existing `alloted`
- ✅ **Remaining calculation:** Pre-save hook recalculates `remaining` after `alloted` update
- ✅ **Audit trail:** `LeaveRelease` record created for tracking

### Example
```
Before: alloted = 10, availed = 2, remaining = 8
Release: daysReleased = 4.5
After:  alloted = 14.5, availed = 2, remaining = 12.5
```

### Status: ✅ **WORKING CORRECTLY**

---

## 3. Carry Forward Flow (India Only)

### Route
- **Endpoint:** `POST /leave-summary/carry-forward`
- **File:** `src/routes/leave-summary.routes.ts` (lines 700-749)

### Flow
1. **Route Handler** receives request with `employeeId`, `fromYear`, `toYear`, `leaveType`, `daysCarriedForward`
2. **Calls:** `LeaveCarryForwardService.processCarryForward()`
3. **Service Method:** `processCarryForward()` (lines 41-267)
   - ✅ Validates `toYear === fromYear + 1`
   - ✅ Validates India country (`country === 'IN'`)
   - ✅ Validates balance > 0
   - ✅ Validates `daysCarriedForward > 0` and `<= balanceBefore`
   - ✅ Checks for duplicate carry-forward
   - ✅ Creates `LeaveCarryForward` record
   - ✅ **FROM YEAR:**
     - ✅ Gets `fromYearSummary` (creates if not exists)
     - ✅ Reduces `alloted` by `daysCarriedForward`
     - ✅ Calls `updateLeaveAllotments()` (skips email)
   - ✅ **TO YEAR:**
     - ✅ Gets `toYearSummary` (creates if not exists)
     - ✅ Increases `alloted` by `daysCarriedForward`
     - ✅ Calls `updateLeaveAllotments()` (skips email)
   - ✅ Verifies updates were successful
   - ✅ Sends carry-forward email

### Data Integrity
- ✅ **Both years:** `getLeaveSummary()` ensures both `fromYear` and `toYear` records exist
- ✅ **FROM YEAR:** Reduces `alloted`, `remaining` recalculated automatically
- ✅ **TO YEAR:** Increases `alloted`, `remaining` recalculated automatically
- ✅ **Audit trail:** `LeaveCarryForward` record created with `balanceBefore`, `daysCarriedForward`, `daysForfeited`
- ✅ **Verification:** Code verifies updates were successful

### Example
```
FROM YEAR (2024):
Before: alloted = 20, availed = 10, remaining = 10
Carry Forward: 5 days
After:  alloted = 15, availed = 10, remaining = 5

TO YEAR (2025):
Before: alloted = 20, availed = 0, remaining = 20
Carry Forward: 5 days
After:  alloted = 25, availed = 0, remaining = 25
```

### Status: ✅ **WORKING CORRECTLY**

---

## Common Components

### `getLeaveSummary()` Method
- **Purpose:** Get or create leave summary record
- **Location:** `src/services/leave-summary.service.ts` (lines 144-173)
- **Behavior:**
  - ✅ Finds existing record OR creates new one with all zeros
  - ✅ Initializes `workFromHome` if missing (backward compatibility)
  - ✅ **Always returns a record** (never null)

### `updateLeaveAllotments()` Method
- **Purpose:** Update leave allotments for a user/year
- **Location:** `src/services/leave-summary.service.ts` (lines 231-330)
- **Behavior:**
  - ✅ Calls `getLeaveSummary()` first (ensures record exists)
  - ✅ Updates only specified leave types (doesn't overwrite others with 0)
  - ✅ Pre-save hook calculates `remaining = alloted - availed`
  - ✅ Sends email unless `skipEmail: true`

### Pre-Save Hook
- **Location:** `src/models/leave-summary.model.ts` (lines 53-66)
- **Behavior:**
  - ✅ Automatically calculates `remaining = max(0, alloted - availed)` for all categories
  - ✅ Runs on every save operation
  - ✅ Ensures `remaining` is always accurate

---

## Data Integrity Guarantees

### ✅ One User, One Year, One Record
- **Enforced by:** Unique compound index `{ userId: 1, year: 1 }`
- **Verified in:** All three flows call `getLeaveSummary()` which creates record if not exists

### ✅ Record Creation
- **Allotment:** Creates record if not exists via `getLeaveSummary()`
- **Release:** Creates record if not exists via `getLeaveSummary()`
- **Carry Forward:** Creates records for both years if not exist via `getLeaveSummary()`

### ✅ Balance Calculations
- **Allotment:** Sets `alloted`, hook calculates `remaining`
- **Release:** Adds to `alloted`, hook recalculates `remaining`
- **Carry Forward:** Adjusts `alloted` in both years, hook recalculates `remaining`

---

## Summary

### ✅ All Flows Working Correctly

1. **Leave Allotment:**
   - ✅ Creates/updates leave summary record
   - ✅ Updates `alloted` correctly
   - ✅ `remaining` calculated automatically
   - ✅ Email notifications work

2. **Leave Release:**
   - ✅ Creates record if not exists
   - ✅ Adds to existing balance correctly
   - ✅ Creates audit trail (`LeaveRelease`)
   - ✅ Email notifications work

3. **Carry Forward:**
   - ✅ Creates records for both years if not exist
   - ✅ Reduces FROM year `alloted` correctly
   - ✅ Increases TO year `alloted` correctly
   - ✅ Creates audit trail (`LeaveCarryForward`)
   - ✅ Email notifications work
   - ✅ Verification logic ensures correctness

### Recommendations

1. **Minor Improvement:** Consider improving `isNew` check in `updateLeaveAllotments()` to check all leave types, but this is cosmetic only (affects email text).

2. **All flows are production-ready** ✅

---

## Test Scenarios

### Scenario 1: New Employee, First Allotment
- Employee has no leave summary for 2025
- Admin creates allotment: `annual: 12`
- ✅ Record created with `annual.alloted = 12`
- ✅ `remaining = 12` (availed = 0)

### Scenario 2: Leave Release
- Employee has `annual.alloted = 10` for 2025
- Admin releases 4.5 days for January 2025
- ✅ `annual.alloted = 14.5`
- ✅ `remaining = 14.5 - availed`
- ✅ `LeaveRelease` record created

### Scenario 3: Carry Forward
- Employee has `annual.remaining = 10` at end of 2024
- Admin carries forward 5 days to 2025
- ✅ 2024: `annual.alloted` reduced by 5, `remaining = 5`
- ✅ 2025: `annual.alloted` increased by 5
- ✅ `LeaveCarryForward` record created

---

## Conclusion

**All three flows are correctly implemented and maintain data integrity.**

- ✅ Records are created when needed
- ✅ One user, one year, one record rule is enforced
- ✅ Balance calculations are correct
- ✅ Audit trails are maintained
- ✅ Email notifications work appropriately

