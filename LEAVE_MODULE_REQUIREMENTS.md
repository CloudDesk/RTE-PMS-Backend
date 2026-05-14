# Leave Module - Enhanced Features Requirements (India Only)

## Overview
This document outlines the requirements for enhancing the leave management module with half-day leave support, monthly/quarterly leave releases, and manual leave carry-forward functionality.

**Important:** These features are **ONLY for India (IN)** employees. UAE (AE) employees will continue to use the existing leave system.

---

## 1. Half-Day Leave Application (India Only)

### Requirement
**India employees only** should be able to apply for **half-day leaves** (0.5 days) in addition to full-day leaves.

### Country Restriction
- ✅ Enabled for: **India (IN)**
- ❌ Disabled for: **UAE (AE)** - UAE employees cannot apply for half-day leaves

### Implementation Details

#### A. Leave Model Enhancement
- Add `leaveDuration` field to `Leave` model:
  - Values: `'full-day'` | `'half-day'`
  - Default: `'full-day'`
- Add `halfDayType` field (optional):
  - Values: `'first-half'` | `'second-half'` | `null`
  - Required when `leaveDuration = 'half-day'`
- Update `noOfDays` calculation:
  - Full day = 1.0
  - Half day = 0.5

#### B. Validation Rules
- When `leaveDuration = 'half-day'`:
  - `startDate` must equal `endDate` (same day)
  - `halfDayType` must be specified
  - `noOfDays` must be exactly 0.5
- When `leaveDuration = 'full-day'`:
  - Can span multiple days
  - `halfDayType` must be `null`

#### C. Leave Balance Impact
- Half-day leave deducts **0.5** from leave balance
- System should support decimal values in leave balance calculations

---

## 2. Monthly/Quarterly Leave Release (India Only)

### Requirement
**For India employees only**, Admin should be able to **release leaves** to employees on a **monthly** or **quarterly** (3-month period) basis. This should **add** to the existing leave balance, not replace it.

### Country Restriction
- ✅ Enabled for: **India (IN)**
- ❌ Disabled for: **UAE (AE)** - UAE employees use annual allocation only

### Quarterly Periods (3 months each)
- **Q1:** January, February, March
- **Q2:** April, May, June
- **Q3:** July, August, September
- **Q4:** October, November, December

### Implementation Details

#### A. Leave Release Model (New)
Create a new model `LeaveRelease`:
```typescript
{
  employeeId: ObjectId,
  releaseType: 'monthly' | 'quarterly',
  period: {
    month?: number,      // 1-12 (required for monthly)
    quarter?: number,    // 1-4 (required for quarterly)
    year: number
  },
  leaveType: 'annual' | 'sick' | 'compOff' | etc,
  daysReleased: number,  // Can be decimal (e.g., 4.5)
  releasedAt: Date,
  releasedBy: ObjectId,  // Admin user
  notes?: string
}
```

#### B. Release Process
1. **Admin Interface:**
   - Select employee(s)
   - Choose release type: Monthly or Quarterly
   - Select period (month/quarter + year)
   - Select leave type
   - Enter days to release (manual input, supports decimals)
   - Click "Release" button

2. **Backend Processing:**
   - Validate input
   - Add days to employee's existing leave balance for the selected year
   - Create `LeaveRelease` record for audit
   - Send notification email to employee

#### C. API Endpoints
- `POST /leave-summary/release` - Release leaves to one or multiple employees
- `GET /leave-summary/release-history/:userId` - Get release history for an employee

---

## 3. Manual Leave Carry-Forward (India Only)

### Requirement
**For India employees only**, at year-end (December), instead of automatically carrying forward all remaining balance, admins should be able to **manually specify** how many days to carry forward from the previous year to the next year.

### Country Restriction
- ✅ Enabled for: **India (IN)**
- ❌ Disabled for: **UAE (AE)** - UAE employees have expiry-based leave system

### Business Scenario
**Example:**
- Employee has **15 days** balance at end of December 2024
- Admin enters **10** in carry-forward input field
- Only **10 days** are carried forward to 2025
- Remaining **5 days** are lost/forfeited

### Implementation Details

#### A. Carry-Forward Process
1. **Year-End Processing (Manual Trigger):**
   - Admin selects employees (or all employees)
   - System shows current year balance (e.g., December 2024)
   - Admin enters carry-forward days for each employee
   - System validates: carry-forward ≤ remaining balance
   - Click "Process Carry-Forward" button

2. **Backend Processing:**
   - Create/Update leave summary for next year
   - Add carry-forward days to next year's allotted balance
   - Create audit log record
   - Update previous year's summary (optional: mark as processed)

#### B. Carry-Forward Model (New)
```typescript
{
  employeeId: ObjectId,
  fromYear: number,
  toYear: number,
  leaveType: string,
  balanceBefore: number,      // Balance at end of fromYear
  daysCarriedForward: number, // Admin-specified amount
  daysForfeited: number,      // BalanceBefore - daysCarriedForward
  processedAt: Date,
  processedBy: ObjectId
}
```

#### C. API Endpoints
- `POST /leave-summary/carry-forward` - Process carry-forward for employees
- `GET /leave-summary/carry-forward/:userId?fromYear=2024&toYear=2025` - Get carry-forward details

---

## 4. Combined Example: Quarterly Release + Half-Day Leave

### Scenario
1. **Q1 2025:** Admin releases **4.5 days** to employee for annual leave
   - Employee's existing annual balance: 10 days
   - After release: 10 + 4.5 = **14.5 days**

2. **Employee applies for half-day leave:**
   - Select date: March 15, 2025
   - Duration: Half-day
   - Half-day type: First-half
   - Days deducted: 0.5
   - Remaining balance: 14.5 - 0.5 = **14 days**

---

## Technical Implementation Plan

### Phase 1: Half-Day Leave Support
1. ✅ Update `Leave` model schema
2. ✅ Update leave validation logic
3. ✅ Update leave balance calculation
4. ✅ Update leave routes and services
5. ✅ Update frontend form

### Phase 2: Leave Release Feature
1. ✅ Create `LeaveRelease` model
2. ✅ Create release service
3. ✅ Create release routes
4. ✅ Add release functionality to existing leave summary
5. ✅ Add audit logging

### Phase 3: Carry-Forward Feature
1. ✅ Create `LeaveCarryForward` model
2. ✅ Create carry-forward service
3. ✅ Create carry-forward routes
4. ✅ Add year-end processing interface
5. ✅ Add validation and error handling

---

## Database Schema Changes

### 1. Leave Model Updates
```typescript
{
  // ... existing fields ...
  leaveDuration: {
    type: String,
    enum: ['full-day', 'half-day'],
    default: 'full-day'
  },
  halfDayType: {
    type: String,
    enum: ['first-half', 'second-half'],
    required: function() { return this.leaveDuration === 'half-day'; }
  }
}
```

### 2. New LeaveRelease Model
```typescript
{
  employeeId: { type: ObjectId, ref: 'User', required: true },
  releaseType: { type: String, enum: ['monthly', 'quarterly'], required: true },
  period: {
    month: { type: Number, min: 1, max: 12 },
    quarter: { type: Number, min: 1, max: 4 },
    year: { type: Number, required: true }
  },
  leaveType: { type: String, required: true },
  daysReleased: { type: Number, required: true, min: 0 },
  releasedAt: { type: Date, default: Date.now },
  releasedBy: { type: ObjectId, ref: 'User', required: true },
  notes: String
}
```

### 3. New LeaveCarryForward Model
```typescript
{
  employeeId: { type: ObjectId, ref: 'User', required: true },
  fromYear: { type: Number, required: true },
  toYear: { type: Number, required: true },
  leaveType: { type: String, required: true },
  balanceBefore: { type: Number, required: true },
  daysCarriedForward: { type: Number, required: true, min: 0 },
  daysForfeited: { type: Number, required: true, min: 0 },
  processedAt: { type: Date, default: Date.now },
  processedBy: { type: ObjectId, ref: 'User', required: true },
  notes: String
}
```

---

## API Endpoints Summary

### Leave Routes
- `POST /leaves` - Apply for leave (updated to support half-day)
- `PUT /leaves/:id/status` - Approve/Reject (updated to handle half-day)

### Leave Summary Routes (New)
- `POST /leave-summary/release` - Release leaves monthly/quarterly
- `GET /leave-summary/release-history/:userId` - Get release history
- `POST /leave-summary/carry-forward` - Process year-end carry-forward
- `GET /leave-summary/carry-forward/:userId` - Get carry-forward details

---

## Validation Rules

### Half-Day Leave
1. ✅ `startDate === endDate` when `leaveDuration = 'half-day'`
2. ✅ `halfDayType` must be specified for half-day leaves
3. ✅ `noOfDays = 0.5` for half-day leaves
4. ✅ No overlapping half-day leaves on same date with same `halfDayType`

### Leave Release
1. ✅ `daysReleased > 0`
2. ✅ `daysReleased` can be decimal (supports 0.5, 4.5, etc.)
3. ✅ Valid period selection (month 1-12 or quarter 1-4)
4. ✅ Year must be valid

### Carry-Forward
1. ✅ `daysCarriedForward >= 0`
2. ✅ `daysCarriedForward <= balanceBefore`
3. ✅ `toYear = fromYear + 1`
4. ✅ Cannot carry-forward if already processed for the same period

---

## Testing Scenarios

### Scenario 1: Half-Day Leave Application
```
1. Employee has 10 days annual leave balance
2. Employee applies for half-day leave (first-half) on March 15
3. System deducts 0.5 days
4. Balance becomes 9.5 days
```

### Scenario 2: Monthly Leave Release
```
1. Employee has 5 days annual leave balance
2. Admin releases 1.5 days for March 2025
3. Balance becomes 6.5 days
4. Release record is created
```

### Scenario 3: Quarterly Leave Release
```
1. Employee has 10 days annual leave balance
2. Admin releases 4.5 days for Q1 2025
3. Balance becomes 14.5 days
4. Release record is created
```

### Scenario 4: Year-End Carry-Forward
```
1. Employee has 15 days remaining at end of December 2024
2. Admin enters 10 days in carry-forward field
3. System carries forward 10 days to 2025
4. Employee's 2025 annual balance starts with 10 days (plus any new allocation)
5. 5 days are forfeited
```

---

## Notes

1. **Decimal Support:** All leave calculations must support decimal values (0.5, 1.5, 4.5, etc.)

2. **Balance Tracking:** Leave summary should accurately track decimal balances

3. **Audit Trail:** All leave releases and carry-forwards must be logged for audit purposes

4. **Email Notifications:** Employees should receive email notifications for:
   - Leave releases
   - Carry-forward processed
   - Half-day leave approved/rejected

5. **Backward Compatibility:** Existing full-day leaves should continue to work without any changes

---

*Document Version: 1.0*  
*Last Updated: January 2025*

