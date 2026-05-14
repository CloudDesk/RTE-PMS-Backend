# Leave and Attendance Operations Deep Analysis

## Overview

This document provides a comprehensive analysis of what happens when leave requests, restricted/optional holidays, and attendance regularizations are created, approved, rejected, or cancelled in the Zuno HR India API system.

---

## 1. Leave Request Operations

### Routes
- **File**: [src/routes/leave.routes.ts](file:///Users/sureshkumar/Documents/GitHub/Zuno-hr-India-Api/src/routes/leave.routes.ts)
- **Service**: [src/services/leave.service.ts](file:///Users/sureshkumar/Documents/GitHub/Zuno-hr-India-Api/src/services/leave.service.ts)

### 1.1 When a Leave Request is Created

**API**: `POST /leaves`  
**Service Method**: `LeaveService.create()`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **leaves** | CREATE | All fields | New leave record created |
| **users** | READ | `country`, `name`, `email`, `holidayCalendarId` | Validate user, get user details |
| **lovs** | READ | `values[]` | Fetch leave type details if not provided |
| **salaryassignments** | READ | `userId`, `effectiveFrom`, `effectiveTo` | Get active salary assignment for validation |
| **shiftassignments** | READ | `userId`, `shiftId`, `weekendDays`, `effectiveFrom`, `effectiveTo` | Get shift details for weekend/working day calculation |
| **holidaycalendars** | READ | `year`, `country`, `holidays[]` | Get mandatory holidays for calculation |
| **leaves** (existing) | READ | Same user, overlapping dates | Check for duplicate/overlapping leave requests |
| **leavesummaries** | READ | `userId`, `year`, `leaveType` | Check available leave balance |
| **optionalholidayrequests** | READ | `userId`, `holidayDate` | Special: Validate optional holiday if `leaveType='restricted_holiday'` |

#### Changes to Same Object (**leaves**)

**New Record Created with**:
- `userId`: Employee ID
- `leaveType`: Type of leave (annual, sick, restricted_holiday, etc.)
- `startDate`: Leave start date
- `endDate`: Leave end date
- `noOfDays`: Calculated working days (excludes weekends and mandatory holidays)
- `weekendExclusion`: Lists weekend dates excluded
- `status`: **'Pending'**
- `appliedBy`: User who created the request
- `appliedTo`: Manager/approver
- `appliedOnBehalf`: Boolean (only if admin applies for employee)
- `reason`: Leave reason
- `documents[]`: Uploaded documents (if any)
- `halfDay`: Half-day flag and session (if applicable)

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **leavesummaries** | READ | Balance check only during creation, no update |
| Email sent to | **Manager** | Notification of new leave request |
| Email sent to | **All Admins** | Notification for tracking purposes |

#### Special Cases

1. **Restricted Holiday (Optional Holiday)**:
   - Validates that `startDate` equals `endDate` (single day only)
   - Validates holiday exists in holiday calendar as optional holiday
   - Checks annual limit for restricted holidays
   - Sets `noOfDays` = 1

2. **Half-Day Leave**:
   - Validates no full-day leave exists for same date
   - Validates no other half-day for same session
   - Sets `noOfDays` = 0.5

3. **Applied on Behalf**:
   - Requires dual approval (manager + admin)
   - Sets `appliedOnBehalf` = true
   - Records admin who applied in `appliedBy`

#### Business Rules Enforced

- ✅ 3-day rule: Employee cannot apply for leave >3 business days in the past (admin exempt)
- ✅ No overlapping leaves for same employee
- ✅ Leave balance must be sufficient
- ✅ Must have active salary assignment
- ✅ Start date must be ≤ end date

---

### 1.2 When a Leave Request is Approved

**API**: `PUT /leaves/:id/status`  
**Service Method**: `LeaveService.updateStatus()`  
**Status Change**: `Pending` → `Approved`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **leaves** | UPDATE | `status`, `approvedBy`, `approvedById`, `approvedAt` | Mark leave as approved |
| **leaves** | UPDATE | `managerApproved`, `managerApprovedById`, `managerApprovedAt` | For dual approval (applied on behalf) |
| **leaves** | UPDATE | `adminApproved`, `adminApprovedById`, `adminApprovedAt` | For dual approval (applied on behalf) |
| **leavesummaries** | UPDATE/CREATE | `availed`, `used`, `balance` | Increment availed count, reduce balance |
| **users** | READ | `name`, `email` | For email notification |

#### Changes to Same Object (**leaves**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending | **Approved** |
| `approvedBy` | undefined | {_id, name, email} of approver |
| `approvedById` | undefined | ObjectId of approver |
| `approvedAt` | undefined | Current timestamp |
| `managerApproved` | undefined / false | **true** (if applied on behalf) |
| `managerApprovedById` | undefined | Approver's ID (if manager) |
| `adminApproved` | undefined / false | **true** (if applied on behalf and admin approves) |
| `adminApprovedById` | undefined | Approver's ID (if admin) |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **leavesummaries** | UPDATE | `availed` += noOfDays, `balance` -= noOfDays, `used` += noOfDays |
|**leavesummaries** | UPDATE | For restricted_holiday: `availed` count incremented |
| Email sent to | **Employee** | Approved notification with leave details |
| Email sent to | **All Admins** | Notification of approval for tracking |

#### Special Cases

1. **Applied on Behalf**:
   - **Single approval** from either manager OR admin is sufficient
   - First approver (manager or admin) completes approval immediately
   - Sets both status = 'Approved' and relevant approval flags

2. **Restricted Holiday**:
   - Updates `leavesummaries.restricted_holiday.availed` count
   - Does NOT create attendance record (holiday, not working day)

---

### 1.3 When a Leave Request is Rejected

**API**: `PUT /leaves/:id/status`  
**Service Method**: `LeaveService.updateStatus()`  
**Status Change**: `Pending` → `Rejected`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **leaves** | UPDATE | `status`, `approvedBy`, `approvedById`, `approvedAt`, `remarks` | Mark leave as rejected |
| **users** | READ | `name`, `email` | For email notification |

#### Changes to Same Object (**leaves**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending | **Rejected** |
| `approvedBy` | undefined | {_id, name, email} of rejector |
| `approvedById` | undefined | ObjectId of rejector |
| `approvedAt` | undefined | Current timestamp |
| `remarks` | May be empty | Rejection reason (if provided) |
| `managerApproved` | undefined | **false** (if manager rejected and applied on behalf) |
| `adminApproved` | undefined | **false** (if admin rejected and applied on behalf) |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **leavesummaries** | NO CHANGE | Balance remains unchanged (leave not consumed) |
| Email sent to | **Employee** | Rejection notification with remarks |
| Email sent to | **All Admins** | Notification of rejection for tracking |

---

### 1.4 When a Leave Request is Cancelled

**API**: `PUT /leaves/:id/cancel`  
**Service Method**: `LeaveService.cancel()`  
**Status Change**: `Pending` / `Approved` → `Cancelled`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **leaves** | UPDATE | `status`, `cancelledAt` | Mark leave as cancelled |
| **leavesummaries** | UPDATE | `availed`, `balance` | Restore balance (if was approved) |
| **users** | READ | `name`, `email` | For email notification |

#### Changes to Same Object (**leaves**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending / Approved | **Cancelled** |
| `cancelledAt` | undefined | Current timestamp |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **leavesummaries** | UPDATE | If leave was approved: `availed` -= noOfDays, `balance` += noOfDays (restore balance) |
| **leavesummaries** | NO CHANGE | If leave was pending: No balance change |
| Email sent to | **Manager** | Cancellation notification |
| Email sent to | **Employee** | Cancellation confirmation |
| Email sent to | **All Admins** | Notification of cancellation |

---

## 2. Restricted Holiday (Optional Holiday) Operations

### Routes
- **File**: [src/routes/optional-holiday.routes.ts](file:///Users/sureshkumar/Documents/GitHub/Zuno-hr-India-Api/src/routes/optional-holiday.routes.ts)
- **Service**: [src/services/optional-holiday.service.ts](file:///Users/sureshkumar/Documents/GitHub/Zuno-hr-India-Api/src/services/optional-holiday.service.ts)

### 2.1 When an Optional Holiday Request is Created

**API**: `POST /optional-holidays`  
**Service Method**: `OptionalHolidayService.create()`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **optionalholidayrequests** | CREATE | All fields | New optional holiday request created |
| **users** | READ | `name`, `email`, `active`, `holidayCalendarId` | Validate user and get details |
| **holidaycalendars** | READ | `year`, `country`, `holidays[]` | Validate date is an optional holiday |
| **optionalholidayrequests** (existing) | READ | Same date, not Rejected/Cancelled | Check for duplicate request |
| **leavesummaries** | READ | `restricted_holiday.alloted`, `restricted_holiday.availed` | Check annual limit |

#### Changes to Same Object (**optionalholidayrequests**)

**New Record Created with**:
- `userId`: Employee ID
- `holidayDate`: Date of optional holiday
- `holidayName`: Name from calendar
- `year`: Year of holiday
- `status`: **'Pending'**
- `reason`: Employee's reason
- `appliedTo`: Manager/approver
- `user`: {name, email} of employee

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **leavesummaries** | READ ONLY | Checks available quota, no update on creation |
| Email sent to | **Manager** | Notification of new optional holiday request |
| Email sent to | **All Admins** | Notification for tracking |

#### Business Rules Enforced

- ✅ Holiday date must be an optional holiday in calendar
- ✅ No duplicate request for same date (excluding Rejected/Cancelled)
- ✅ Annual limit check (default: 2 per year)
- ✅ User must be active

---

### 2.2 When an Optional Holiday Request is Approved

**API**: `PUT /optional-holidays/:id/status`  
**Service Method**: `OptionalHolidayService.updateStatus()`  
**Status Change**: `Pending` → `Approved`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **optionalholidayrequests** | UPDATE | `status`, `approvedBy`, `approvedById`, `approvedAt` | Mark as approved |
| **leavesummaries** | UPDATE/CREATE | `restricted_holiday.availed` | Increment availed count |
| **attendancerecords** | UPDATE | `status`, `attendanceStatus`, `regularization` | **If swipes exist for that day** |
| **users** | READ | `name`, `email` | For email notification |

#### Changes to Same Object (**optionalholidayrequests**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending | **Approved** |
| `approvedBy` | undefined | {_id, name, email} of approver |
| `approvedById` | undefined | ObjectId of approver |
| `approvedAt` | undefined | Current timestamp |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **leavesummaries** | UPDATE/CREATE | `restricted_holiday.availed` incremented based on total approved count for the year |
| **attendancerecords** | UPDATE | **If attendance exists with swipes**: `status` = 'holiday_swipe', `attendanceStatus` += 'Holiday-Swipe', `regularization.isRegularized` = true, `regularization.status` = 'Approved', `regularization.regularizationType` += 'Holiday-Swipe' |
| Email sent to | **Employee** | Approval notification |
| Email sent to | **All Admins** | Notification of approval |

#### Special Retroactive Update

**If employee already swiped on that day**:
- Attendance record is retroactively marked as "Holiday-Swipe"
- Status becomes `holiday_swipe`
- Regularization is auto-approved
- Prevents LOP for working on optional holiday

---

### 2.3 When an Optional Holiday Request is Rejected

**API**: `PUT /optional-holidays/:id/status`  
**Service Method**: `OptionalHolidayService.updateStatus()`  
**Status Change**: `Pending` → `Rejected`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **optionalholidayrequests** | UPDATE | `status`, `approvedBy`, `approvedById`, `rejectedAt`, `remarks` | Mark as rejected |
| **leavesummaries** | UPDATE/CREATE | `restricted_holiday.availed` | Recalculate based on approved count |
| **users** | READ | `name`, `email` | For email notification |

#### Changes to Same Object (**optionalholidayrequests**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending | **Rejected** |
| `approvedBy` | undefined | {_id, name, email} of rejector |
| `approvedById` | undefined | ObjectId of rejector |
| `rejectedAt` | undefined | Current timestamp |
| `remarks` | May be empty | Rejection reason |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **leavesummaries** | UPDATE | Recalculates `restricted_holiday.availed` (should remain same if no other approved) |
| **attendancerecords** | NO CHANGE | No attendance impact |
| Email sent to | **Employee** | Rejection notification with remarks |
| Email sent to | **All Admins** | Notification of rejection |

---

### 2.4 When an Optional Holiday Request is Cancelled

**API**: `PUT /optional-holidays/:id/cancel`  
**Service Method**: `OptionalHolidayService.cancel()`  
**Status Change**: `Pending` / `Approved` → `Cancelled`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **optionalholidayrequests** | UPDATE | `status`, `cancelledAt` | Mark as cancelled |
| **leavesummaries** | UPDATE/CREATE | `restricted_holiday.availed` | Decrement if was approved |
| **users** | READ | `name`, `email` | For email notification |

#### Changes to Same Object (**optionalholidayrequests**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending / Approved | **Cancelled** |
| `cancelledAt` | undefined | Current timestamp |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **leavesummaries** | UPDATE | If was approved: `restricted_holiday.availed` decremented (quota restored) |
| **attendancerecords** | NO CHANGE | Attendance record NOT reverted (manual intervention needed) |
| Email sent to | **Manager** | Cancellation notification |
| Email sent to | **Employee** | Cancellation confirmation |

> **⚠️ WARNING**: If an approved optional holiday with attendance swipes is cancelled, the attendance record remains as "holiday_swipe". Manual correction may be needed.

---

## 3. Attendance Regularization Operations

### Routes
- **File**: [src/routes/attendance-regularization.routes.ts](file:///Users/sureshkumar/Documents/GitHub/Zuno-hr-India-Api/src/routes/attendance-regularization.routes.ts)
- **Service**: [src/services/attendance-regularization.service.ts](file:///Users/sureshkumar/Documents/GitHub/Zuno-hr-India-Api/src/services/attendance-regularization.service.ts)

### Scenario A: No Attendance Record Exists for That Day

---

### 3.1.A When Attendance Regularization is Created (No Existing Record)

**API**: `POST /attendance-regularization`  
**Service Method**: `AttendanceRegularizationService.createRegularization()`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **attendanceregularizations** | CREATE | All fields | New regularization request created |
| **attendancerecords** | NO RECORD | N/A | **No attendance record exists yet** |
| **users** | READ | `name`, `email`, `country` | Validate user and get details |

#### Changes to Same Object (**attendanceregularizations**)

**New Record Created with**:
- `userId`: Employee ID
- `shiftDay`: Date to be regularized
- `from`: Requested IN time
- `to`: Requested OUT time
- `reason`: Reason for regularization
- `status`: **'Pending'**
- `approver`: {id, name} of approver
- `attendanceId`: **null** (no attendance record exists)
- `shiftType`: Shift type

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **attendancerecords** | NO CHANGE | No record exists, so nothing to update |
| Email sent to | **Approver** | Notification of regularization request |
| Email sent to | **All Admins** | Notification for tracking |

---

### 3.2.A When Attendance Regularization is Approved (No Existing Record)

**API**: `PUT /attendance-regularization/:id/status`  
**Service Method**: `AttendanceRegularizationService.updateRegularizationStatus()`  
**Status Change**: `Pending` → `Approved`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **attendanceregularizations** | UPDATE | `status`, `approver`, `approvedDate`, `comments` | Mark as approved |
| **attendancerecords** | **CREATE** | All fields | **New attendance record created** |
| **users** | READ | `name`, `email`, `country` | For email notification |

#### Changes to Same Object (**attendanceregularizations**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending | **Approved** |
| `approver` | {id, name} | Updated with approver details |
| `approvedDate` | undefined | Current timestamp |
| `comments` | May be empty | Approver's comments |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **attendancerecords** | **CREATE** | New record created with: `userId`, `shiftDay`, `status` = 'regularized', `swipes` = [{timestamp: from, direction: 'IN'}, {timestamp: to, direction: 'OUT'}], `regularization.isRegularized` = true, `regularization.status` = 'Approved', `regularization.regularizationId` = regularization._id |
| Email sent to | **Employee** | Approval notification |
| Email sent to | **All Admins** | Notification of approval |

> **✅ KEY IMPACT**: A completely NEW attendance record is created when regularization is approved for a day with no prior attendance.

---

### 3.3.A When Attendance Regularization is Rejected (No Existing Record)

**API**: `PUT /attendance-regularization/:id/status`  
**Service Method**: `AttendanceRegularizationService.updateRegularizationStatus()`  
**Status Change**: `Pending` → `Rejected`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **attendanceregularizations** | UPDATE | `status`, `approver`, `approvedDate`, `comments` | Mark as rejected |
| **attendancerecords** | NO OPERATION | N/A | No record exists, nothing to update |
| **users** | READ | `name`, `email` | For email notification |

#### Changes to Same Object (**attendanceregularizations**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending | **Rejected** |
| `approver` | {id, name} | Updated with rejector details |
| `approvedDate` | undefined | Current timestamp |
| `comments` | May be empty | Rejection reason |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **attendancerecords** | NO CHANGE | No record exists or created |
| Email sent to | **Employee** | Rejection notification with reason |
| Email sent to | **All Admins** | Notification of rejection |

> **⚠️ NOTE**: Day remains as ABSENT or NO RECORD. May result in LOP (Loss of Pay) in payroll.

---

### 3.4.A When Attendance Regularization is Cancelled (No Existing Record)

**API**: `PUT /attendance-regularization/:id/withdraw`  
**Service Method**: `AttendanceRegularizationService.withdrawRegularization()`  
**Status Change**: `Pending` → `Withdrawn`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **attendanceregularizations** | UPDATE | `status` | Mark as withdrawn |
| **attendancerecords** | NO OPERATION | N/A | No record to update |

#### Changes to Same Object (**attendanceregularizations**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending | **Withdrawn** |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **attendancerecords** | NO CHANGE | No impact |
| Email sent | **None** | No email notification for withdrawal |

---

### Scenario B: Attendance Record Exists with Swipes (2 swipes or single swipe)

---

### 3.1.B When Attendance Regularization is Created (Existing Record with Swipes)

**API**: `POST /attendance-regularization`  
**Service Method**: `AttendanceRegularizationService.createRegularization()`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **attendanceregularizations** | CREATE | All fields | New regularization request created |
| **attendancerecords** | UPDATE | `regularization` field | Link regularization to attendance |
| **users** | READ | `name`, `email`, `country` | Validate user and get details |

#### Changes to Same Object (**attendanceregularizations**)

**New Record Created with**:
- `userId`: Employee ID
- `shiftDay`: Date to be regularized
- `from`: Requested corrected IN time
- `to`: Requested corrected OUT time
- `reason`: Reason for regularization
- `status`: **'Pending'**
- `approver`: {id, name} of approver
- `attendanceId`: **ObjectId** of existing attendance record
- `shiftType`: Shift type

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **attendancerecords** | UPDATE | `regularization.hasRegularizationRequest` = true, `regularization.isRegularized` = false, `regularization.status` = 'Pending', `regularization.regularizationId` = new regularization._id |
| Email sent to | **Approver** | Notification of regularization request |
| Email sent to | **All Admins** | Notification for tracking |

---

### 3.2.B When Attendance Regularization is Approved (Existing Record with Swipes)

**API**: `PUT /attendance-regularization/:id/status`  
**Service Method**: `AttendanceRegularizationService.updateRegularizationStatus()`  
**Status Change**: `Pending` → `Approved`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **attendanceregularizations** | UPDATE | `status`, `approver`, `approvedDate`, `comments` | Mark as approved |
| **attendancerecords** | UPDATE | `swipes`, `status`, `regularization`, `totalWorkHours`, `actualWorkHours`, etc. | **Replace swipes with regularized times** |
| **users** | READ | `name`, `email`, `country` | For email notification |

#### Changes to Same Object (**attendanceregularizations**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending | **Approved** |
| `approver` | {id, name} | Updated with approver details |
| `approvedDate` | undefined | Current timestamp |
| `comments` | May be empty | Approver's comments |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **attendancerecords** | UPDATE | **`swipes` array updated**: Old swipes removed, new swipes added with regularized times (IN at `from`, OUT at `to`), `status` updated based on new swipes, `regularization.isRegularized` = true, `regularization.status` = 'Approved', `regularization.regularizationType` = ['Time-Adjustment'], Work hours recalculated based on new swipes |
| Email sent to | **Employee** | Approval notification |
| Email sent to | **All Admins** | Notification of approval |

> **✅ KEY IMPACT**: The EXISTING attendance record's swipes are REPLACED with the regularized times. All work hour calculations are recalculated.

**Example**:
- **Before Approval**: Swipes = [IN: 10:30 AM, OUT: 6:00 PM]
- **After Approval**: Swipes = [IN: 9:00 AM (regularized), OUT: 7:00 PM (regularized)]
- Work hours, shortfall, excess hours all recalculated

---

### 3.3.B When Attendance Regularization is Rejected (Existing Record with Swipes)

**API**: `PUT /attendance-regularization/:id/status`  
**Service Method**: `AttendanceRegularizationService.updateRegularizationStatus()`  
**Status Change**: `Pending` → `Rejected`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **attendanceregularizations** | UPDATE | `status`, `approver`, `approvedDate`, `comments` | Mark as rejected |
| **attendancerecords** | UPDATE | `regularization` field | Update regularization status only |
| **users** | READ | `name`, `email` | For email notification |

#### Changes to Same Object (**attendanceregularizations**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending | **Rejected** |
| `approver` | {id, name} | Updated with rejector details |
| `approvedDate` | undefined | Current timestamp |
| `comments` | May be empty | Rejection reason |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **attendancerecords** | UPDATE | `regularization.isRegularized` = false, `regularization.status` = 'Rejected', `regularization.hasRegularizationRequest` = true, **Swipes remain unchanged** (original swipes preserved) |
| Email sent to | **Employee** | Rejection notification with reason |
| Email sent to | **All Admins** | Notification of rejection |

> **⚠️ KEY IMPACT**: Original swipes are PRESERVED. Employee's original attendance remains as-is, which may result in shortfall, LOP, or other issues in payroll.

---

### 3.4.B When Attendance Regularization is Cancelled (Existing Record with Swipes)

**API**: `PUT /attendance-regularization/:id/withdraw`  
**Service Method**: `AttendanceRegularizationService.withdrawRegularization()`  
**Status Change**: `Pending` / `Approved` → `Withdrawn`

#### Database Operations

| Object/Table | Operation | Fields Modified | Purpose |
|--------------|-----------|-----------------|---------|
| **attendanceregularizations** | UPDATE | `status` | Mark as withdrawn |
| **attendancerecords** | UPDATE | `regularization`, `swipes` (if was approved) | Restore original state if was approved |

#### Changes to Same Object (**attendanceregularizations**)

| Field | Before | After |
|-------|--------|-------|
| `status` | Pending / Approved | **Withdrawn** |

#### Changes to Other Objects

| Object | Change | Details |
|--------|--------|---------|
| **attendancerecords** | UPDATE | If regularization was **Pending**: Just update `regularization.hasRegularizationRequest` = false, `regularization.status` = 'Withdrawn' |
| **attendancerecords** | **RESTORE** | If regularization was **Approved**: Attempt to restore original swipes (if stored), set `regularization.isRegularized` = false, `regularization.status` = 'Withdrawn', recalculate work hours to original |
| Email sent | **None** | No automatic email for withdrawal |

> **⚠️ CRITICAL**: If approved regularization is withdrawn, original swipes may NOT be recoverable if not stored separately. Manual attendance correction may be needed.

---

## Summary Matrix

### Leave Requests

| Operation | Leave Object Status | LeaveSummary Impact | Attendance Impact | Email Notifications |
|-----------|---------------------|---------------------|-------------------|---------------------|
| **Create** | Pending | None | None | Manager, Admins |
| **Approve** | Approved | Balance decreased | None (holiday) | Employee, Admins |
| **Reject** | Rejected | None | None | Employee, Admins |
| **Cancel** | Cancelled | Balance restored (if was approved) | None | Manager, Employee, Admins |

### Optional Holidays

| Operation | OptionalHolidayRequest Status | LeaveSummary Impact | Attendance Impact | Email Notifications |
|-----------|-------------------------------|---------------------|-------------------|---------------------|
| **Create** | Pending | None | None | Manager, Admins |
| **Approve** | Approved | restricted_holiday.availed++ | **If swipes exist**: Set to holiday_swipe | Employee, Admins |
| **Reject** | Rejected | None | None | Employee, Admins |
| **Cancel** | Cancelled | restricted_holiday.availed-- (if was approved) | **No revert** | Manager, Employee |

### Attendance Regularization (No Existing Record)

| Operation | Regularization Status | Attendance Record Impact | Email Notifications |
|-----------|----------------------|--------------------------|---------------------|
| **Create** | Pending | None (no record) | Approver, Admins |
| **Approve** | Approved | **New record CREATED** with regularized swipes | Employee, Admins |
| **Reject** | Rejected | None (remains absent) | Employee, Admins |
| **Cancel** | Withdrawn | None | None |

### Attendance Regularization (Existing Record with Swipes)

| Operation | Regularization Status | Attendance Record Impact | Email Notifications |
|-----------|----------------------|--------------------------|---------------------|
| **Create** | Pending | regularization.hasRegularizationRequest = true | Approver, Admins |
| **Approve** | Approved | **Swipes REPLACED** with regularized times, work hours recalculated | Employee, Admins |
| **Reject** | Rejected | regularization.status = 'Rejected', **swipes unchanged** | Employee, Admins |
| **Cancel** | Withdrawn | Attempt to restore original (risky) | None |

---

## Key Insights

### Leave Management
1. **Approval updates balance**: Only when leave is approved, the leave balance decreases
2. **Cancellation restores balance**: If approved leave is cancelled, balance is restored
3. **Rejection has no impact**: Rejected leaves don't affect quotas
4. **Dual approval**: Applied-on-behalf leaves need only ONE approval (manager OR admin)

### Optional Holidays
1. **Retroactive attendance update**: If employee worked on optional holiday, approval marks it as "holiday_swipe"
2. **Quota tracking**: `leavesummaries.restricted_holiday.availed` tracks usage
3. **Annual limit**: Default 2 per year (configurable in leave summary)
4. **Cancellation caveat**: Cancelled approval doesn't revert attendance to normal

### Attendance Regularization
1. **Two scenarios**: With/without existing attendance record
2. **Creation vs Approval**: Creating request doesn't change attendance; approval does
3. **Swipe replacement**: Approved regularization REPLACES all swipes for that day
4. **No rollback safety**: Original swipes may not be recoverable after approval
5. **Rejection preserves data**: Rejected regularization keeps original swipes intact

---

## Conclusion

This analysis demonstrates the complex interdependencies between Leave, OptionalHoliday, AttendanceRecord, AttendanceRegularization, and LeaveSummary models. Each operation triggers cascading effects that must be carefully managed to maintain data integrity and ensure accurate payroll calculations.
