# Latest Changes - Optional Holiday Feature Implementation

**Date:** January 2025  
**Version:** 1.0.0

---

## 📋 Overview

This document outlines all the latest changes implemented in the HRMS system, with a primary focus on the **Optional Holiday Request System** and its integration with data migration, payroll, and role-based access control.

---

## 🎯 Major Features Added

### 1. Optional Holiday Request System

A complete optional holiday management system that allows employees to request optional holidays from their holiday calendar, with approval workflow and annual limit enforcement.

#### Key Features:
- ✅ Request optional holidays (max 2 approved per year)
- ✅ Admin/Manager approval workflow
- ✅ Annual limit validation (2 per year)
- ✅ Calendar validation (date must be optional holiday)
- ✅ Usage summary and limit tracking
- ✅ Integration with payroll (only approved optional holidays count)
- ✅ Email notifications for requests and status updates
- ✅ Duplicate request prevention
- ✅ Role-based access control

---

## 📁 New Files Created

### Models
- **`src/models/optional-holiday-request.model.ts`**
  - Mongoose model for optional holiday requests
  - Tracks user, holiday details, status, approval information
  - Includes migration tracking fields

### Services
- **`src/services/optional-holiday.service.ts`**
  - Business logic for optional holiday requests
  - Annual limit checking
  - Calendar validation
  - Email notification handling

### Routes
- **`src/routes/optional-holiday.routes.ts`**
  - RESTful API endpoints for optional holiday management
  - Role-based access control
  - Request, approval, and cancellation endpoints

### Email Templates
- **`src/emails/templates/optionalHolidayRequest.hbs`**
  - Email template for new optional holiday requests (sent to manager/admin)

- **`src/emails/templates/optionalHolidayStatus.hbs`**
  - Email template for status updates (approved/rejected/cancelled)

### Migration Scripts
- **`scripts/migrations/migrate-past-optional-holidays.ts`**
  - Migration script for historical optional holiday data
  - Handles past leaves and attendance records
  - Auto-approves up to annual limit

---

## 🔧 Modified Files

### Core Services

#### 1. `src/services/data-migration.service.ts`
**Changes:**
- Added `'optional-holiday'` to `ExportableObject` type
- Implemented `createOptionalHolidayTemplate()` - Excel template generation
- Implemented `exportOptionalHolidays()` - Export optional holidays to Excel
- Implemented `parseOptionalHolidayRow()` - Parse imported Excel rows
- Implemented `validateOptionalHolidays()` - Validate imported data
- Implemented `insertOptionalHolidays()` - Insert with annual limit tracking
- **Enhanced annual limit tracking:** Now tracks both existing DB records and newly imported requests during the import process

**Key Improvement:**
- Annual limit enforcement during import: 1 applied = 1 used, 2 applied = 0 remaining
- If 3rd approved request is imported, automatically changes to "Pending" with error message

#### 2. `src/services/payroll.service.ts`
**Changes:**
- Modified `getWorkingDaysInMonth()` method
- Now distinguishes between mandatory and approved optional holidays
- Only approved optional holidays count in payroll calculations
- Queries `OptionalHolidayRequest` model for approved requests

**Before:**
```typescript
// Only counted mandatory holidays
holidayDays = mandatoryHolidays.length;
```

**After:**
```typescript
// Counts mandatory + approved optional holidays
const approvedOptionalHolidays = await OptionalHolidayRequest.find({
  userId: employeeId,
  year: year,
  status: 'Approved',
  holidayDate: { $gte: firstDay, $lte: lastDay }
});
holidayDays = mandatoryHolidayCount + approvedOptionalHolidayCount;
```

#### 3. `src/services/holiday-calendar.service.ts`
**Changes:**
- Updated `getCalendarsByUserId()` method
- Now checks both assignment methods:
  1. Direct `holidayCalendarId` reference on User
  2. `assignedTo` array in HolidayCalendar
- Ensures correct calendar retrieval for all users

#### 4. `src/services/user.service.ts`
**Changes:**
- Modified `sendWelcomeEmail()` to accept `plainPassword` parameter
- Updated welcome email template to show temporary password for imported users
- Added security warning for password change

#### 5. `src/services/auth.service.ts`
**Changes:**
- Reverted `forgotPassword()` to original implementation
- Reset token expiry: 2 minutes
- Removed active/portalAccess validation checks

### Routes

#### 1. `src/routes/data-migration.routes.ts`
**Changes:**
- Added `'optional-holiday'` to all `validObjectTypes` arrays (4 locations)
- Updated error messages to include `'optional-holiday'` in valid types list

#### 2. `src/routes/index.ts`
**Changes:**
- Registered optional holiday routes: `fastify.register(optionalHolidayRoutes, { prefix: '/optional-holidays' })`

### Models

#### 1. `src/models/index.ts`
**Changes:**
- Added export: `export * from './optional-holiday-request.model';`

### Container & Types

#### 1. `src/container/index.ts`
**Changes:**
- Added `optionalHolidayService: new OptionalHolidayService(context)` to `createScope()`

#### 2. `src/types/container.ts`
**Changes:**
- Added `optionalHolidayService: OptionalHolidayService;` to `ServiceContainer` interface

### Email Templates

#### 1. `src/emails/templates/index.ts`
**Changes:**
- Registered Handlebars `eq` helper for template comparisons
- Fixes "Missing helper: 'eq'" error

#### 2. `src/emails/templates/welcomeEmail.hbs`
**Changes:**
- Added conditional password display for imported users
- Added security warning message

---

## 🔌 API Endpoints

### Base URL: `/api/optional-holidays`

All endpoints require **JWT authentication** (cookie-based).

### 1. Create Optional Holiday Request
```
POST /api/optional-holidays
```
- Submit a new optional holiday request
- Validates calendar, annual limit, and duplicate requests
- Sends email notification to manager/admin

### 2. Get Optional Holiday Requests
```
GET /api/optional-holidays
```
- Paginated list of requests
- Role-based filtering (admin/manager see all, staff see own)
- Supports filters: `userId`, `status`, `startDate`, `endDate`, `year`

### 3. Get Single Request
```
GET /api/optional-holidays/:id
```
- Retrieve specific optional holiday request by ID

### 4. Update Status (Approve/Reject)
```
PUT /api/optional-holidays/:id/status
```
- Approve, reject, or cancel a request
- Updates approval information
- Sends email notification to employee

### 5. Cancel Request
```
DELETE /api/optional-holidays/:id
```
- Cancel own request (only by request owner)

### 6. Get Usage Summary
```
GET /api/optional-holidays/user/:userId/summary
```
- Get usage summary for a user
- Shows used, remaining, and total requests

### 7. Check Annual Limit
```
GET /api/optional-holidays/user/:userId/limit
```
- Check if user can request more optional holidays
- Returns `canRequest`, `used`, `remaining`, `limit`

---

## 📊 Database Schema

### OptionalHolidayRequest Model

```typescript
{
  userId: ObjectId (required, ref: 'User'),
  user: {
    name: String,
    email: String
  },
  holidayDate: Date (required),
  holidayName: String (required),
  year: Number (required),
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled' (default: 'Pending'),
  reason: String (optional),
  remarks: String (optional),
  appliedTo: {
    _id: String,
    name: String
  },
  approvedById: ObjectId (ref: 'User'),
  approvedBy: {
    _id: ObjectId,
    name: String,
    email: String
  },
  approvedAt: Date,
  rejectedAt: Date,
  cancelledAt: Date,
  migratedFrom: {
    source: 'leave' | 'attendance' | 'manual',
    leaveId: ObjectId,
    attendanceRecordId: ObjectId
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `{ userId: 1, year: 1, status: 1 }`
- `{ holidayDate: 1 }`
- `{ userId: 1, holidayDate: 1 }`
- `{ status: 1, year: 1 }`

---

## 🔐 Role-Based Access Control

### Request Listing (`GET /api/optional-holidays`)
- **Admin/Manager:** Can see all requests (can filter by `userId`)
- **Staff:** Can only see their own requests

### Status Updates (`PUT /api/optional-holidays/:id/status`)
- **Admin/Manager:** Can approve/reject any request
- **Staff:** Cannot update status (only cancel own requests)

### Usage Summary (`GET /api/optional-holidays/user/:userId/summary`)
- **Admin/Manager:** Can check any user's summary
- **Staff:** Can only check own summary

---

## 📧 Email Notifications

### 1. Request Notification
**Trigger:** When employee creates optional holiday request  
**Recipient:** Manager/Admin (from `appliedTo` or user's manager)  
**Template:** `optionalHolidayRequest.hbs`  
**Content:**
- Employee name
- Holiday name and date
- Reason for request
- Link to review request

### 2. Status Update Notification
**Trigger:** When request status is updated (Approved/Rejected/Cancelled)  
**Recipient:** Employee (request owner)  
**Template:** `optionalHolidayStatus.hbs`  
**Content:**
- Status (Approved/Rejected/Cancelled)
- Holiday name and date
- Remarks (if provided)
- Payroll impact information

---

## 💰 Payroll Integration

### How Optional Holidays Affect Payroll

**Key Rule:** Only **approved** optional holidays count in payroll calculations.

#### Calculation Logic:
1. **Mandatory Holidays:** Always counted (from holiday calendar)
2. **Approved Optional Holidays:** Counted (from `OptionalHolidayRequest` with `status: 'Approved'`)
3. **Pending/Rejected/Cancelled Optional Holidays:** **NOT counted**

#### Example Scenarios:

**Scenario 1: Employee has 2 approved optional holidays**
- Mandatory holidays: 10
- Approved optional holidays: 2
- **Total holiday days: 12**
- Working days = Total days - Weekends - 12 holidays

**Scenario 2: Employee has 1 approved, 1 pending**
- Mandatory holidays: 10
- Approved optional holidays: 1
- Pending optional holidays: 1 (not counted)
- **Total holiday days: 11**

**Scenario 3: Employee has 2 approved, 1 rejected**
- Mandatory holidays: 10
- Approved optional holidays: 2
- Rejected optional holidays: 1 (not counted)
- **Total holiday days: 12**

---

## 📥 Data Migration Integration

### Exportable Object Type
Added `'optional-holiday'` to `ExportableObject` type.

### Template Generation
**Endpoint:** `GET /data-migration/template?objects=optional-holiday`

**Excel Template Columns:**
1. User ID (Required)
2. Holiday Date (Required) - Format: YYYY-MM-DD
3. Holiday Name (Required)
4. Year (Required)
5. Status (Optional - Default: Pending)
6. Reason (Optional)
7. Remarks (Optional)
8. Applied To ID (Optional)
9. Applied To Name (Optional)
10. Approved By ID (Optional)
11. Approved At (Optional)

### Export
**Endpoint:** `GET /data-migration/export?objects=optional-holiday&status=Approved&year=2025`

**Filters:**
- `status` - Filter by status (Pending, Approved, Rejected, Cancelled)
- `userId` - Filter by user ID
- `year` - Filter by year

### Import
**Endpoint:** `POST /data-migration/import/preview` and `POST /data-migration/import/confirm`

**Annual Limit Enforcement:**
- System tracks existing approved optional holidays from database
- During import, tracks newly imported approved requests
- If importing multiple approved requests for same user/year:
  - 1st approved → Count = 1, Remaining = 1 ✅
  - 2nd approved → Count = 2, Remaining = 0 ✅
  - 3rd approved → Automatically changed to "Pending" ⚠️

**Error Messages:**
- `"Row X: Cannot approve - user already has 2 approved optional holidays for YYYY. Maximum is 2 per year. Changing status to Pending."`
- `"Row X: Optional holiday request already exists for this date"`
- `"Row X: The selected date is not an optional holiday in your calendar"`

---

## 🔄 Migration Script

### `migrate-past-optional-holidays.ts`

**Purpose:** Migrate historical data for optional holidays from past leaves and attendance records.

**Logic:**
1. Finds all active users
2. Gets user's holiday calendar (checks both `holidayCalendarId` and `assignedTo`)
3. Finds past optional holidays from calendar
4. For each past optional holiday:
   - Checks if request already exists
   - Checks if user took leave on that date
   - Checks if user was absent on that date
   - Auto-approves if leave was taken and annual limit not exceeded
   - Sets to Pending if limit exceeded or if absent
   - Creates `OptionalHolidayRequest` record

**Usage:**
```bash
npm run migrate:optional-holidays
```

---

## 🐛 Bug Fixes

### 1. Cast to ObjectId Failed Error
**Issue:** Empty string passed as `appliedTo._id` when no manager found  
**Fix:** Leave `appliedTo` as `undefined` instead of setting empty string  
**Files:** `src/routes/optional-holiday.routes.ts`, `src/services/optional-holiday.service.ts`

### 2. Missing Handlebars Helper
**Issue:** `Missing helper: "eq"` error in email templates  
**Fix:** Registered `eq` helper in `src/emails/templates/index.ts`

### 3. Holiday Calendar Retrieval
**Issue:** `GET /api/holiday-calendar/user/:userId` returning empty data  
**Fix:** Updated `getCalendarsByUserId()` to check both `holidayCalendarId` and `assignedTo` array  
**File:** `src/services/holiday-calendar.service.ts`

### 4. Shift Change Future Date Bug
**Issue:** Future shift changes incorrectly setting old assignment to inactive  
**Fix:** Keep old assignment active until `endDate` passes  
**File:** `src/services/shift-change.service.ts`

### 5. Imported User Password
**Issue:** Imported users couldn't log in (random password not communicated)  
**Fix:** Set default password "123456" for imported users and include in welcome email  
**Files:** `src/services/data-migration.service.ts`, `src/services/user.service.ts`, `src/emails/templates/welcomeEmail.hbs`

### 6. Annual Limit Tracking in Import
**Issue:** Import didn't track approved count during import process  
**Fix:** Pre-populate with existing counts and track during import  
**File:** `src/services/data-migration.service.ts`

---

## 📝 Frontend Changes Required

### 1. Update Object Type Definitions
```typescript
type ObjectType = 'user' | 'shift' | 'leave' | 'salary-assignment' | 'salary-structure' | 'attendance-record' | 'optional-holiday';
```

### 2. Add to Object Selection UI
```typescript
const allObjectTypes: ObjectType[] = [
  'user',
  'shift',
  'leave',
  'salary-assignment',
  'salary-structure',
  'attendance-record',
  'optional-holiday' // NEW
];
```

### 3. Handle Annual Limit Errors
When importing optional holidays, display warnings if requests are changed from "Approved" to "Pending" due to annual limit.

### 4. Export Filters
Support `status`, `userId`, and `year` filters for optional holiday exports.

### 5. Optional Holiday UI Components
See `OPTIONAL_HOLIDAY_FRONTEND_IMPLEMENTATION.md` for complete frontend implementation guide.

---

## ✅ Validation Rules

### Request Creation
1. ✅ User must exist and be active
2. ✅ Date must be an optional holiday in user's calendar
3. ✅ No duplicate request for same date (excluding Rejected/Cancelled)
4. ✅ Annual limit: Max 2 approved optional holidays per year
5. ✅ Year must match holiday date year

### Status Updates
1. ✅ Only Admin/Manager can approve/reject
2. ✅ Cannot approve if annual limit exceeded
3. ✅ Cannot update status of Cancelled request
4. ✅ Employee can only cancel own Pending requests

### Data Migration Import
1. ✅ User ID must be valid ObjectId
2. ✅ Holiday date must be valid date format (YYYY-MM-DD)
3. ✅ Holiday date must be optional holiday in user's calendar
4. ✅ Year must match holiday date year
5. ✅ Status must be valid enum value
6. ✅ Annual limit: Max 2 approved per user per year
7. ✅ No duplicate requests for same user and date

---

## 📚 Documentation Files

1. **`OPTIONAL_HOLIDAY_FRONTEND_IMPLEMENTATION.md`**
   - Complete frontend implementation guide
   - API endpoints with examples
   - React component examples
   - Redux integration examples

2. **`FRONTEND_IMPLEMENTATION_GUIDE.md`**
   - Updated with optional holiday data migration section
   - Import/export examples
   - Annual limit enforcement notes

3. **`LATEST_CHANGES.md`** (this file)
   - Summary of all latest changes
   - Bug fixes
   - API changes
   - Database schema updates

---

## 🚀 Deployment Checklist

- [x] All new models exported in `src/models/index.ts`
- [x] All new services registered in `src/container/index.ts`
- [x] All new routes registered in `src/routes/index.ts`
- [x] Email templates created and helpers registered
- [x] Data migration routes updated with `'optional-holiday'`
- [x] Payroll service updated to include approved optional holidays
- [x] Holiday calendar service updated for correct retrieval
- [x] TypeScript types updated in `src/types/container.ts`
- [x] All linter errors resolved
- [x] Migration script created for historical data
- [x] Frontend documentation updated

---

## 📊 Statistics

- **New Files:** 5
- **Modified Files:** 12
- **New API Endpoints:** 7
- **New Database Model:** 1
- **New Email Templates:** 2
- **Migration Scripts:** 1

---

## 🔗 Related Documentation

- [Optional Holiday Frontend Implementation](./OPTIONAL_HOLIDAY_FRONTEND_IMPLEMENTATION.md)
- [Frontend Implementation Guide](./FRONTEND_IMPLEMENTATION_GUIDE.md)
- [Data Migration Service](./src/services/data-migration.service.ts)
- [Optional Holiday Service](./src/services/optional-holiday.service.ts)

---

**Last Updated:** January 2025  
**Version:** 1.0.0

