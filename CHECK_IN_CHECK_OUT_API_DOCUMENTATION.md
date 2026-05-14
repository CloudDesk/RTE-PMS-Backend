# Check-In and Check-Out API Documentation

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Data Models & Schemas](#data-models--schemas)
- [API Endpoints](#api-endpoints)
- [Service Layer](#service-layer)
- [Business Logic](#business-logic)
- [Request/Response Examples](#requestresponse-examples)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## Overview

The Check-In and Check-Out system is a comprehensive biometric attendance management solution that tracks employee attendance through swipe-based check-ins and check-outs. The system is designed to work with shift-based schedules, location tracking, and automatic validation against shift windows.

### Key Features

- **Biometric Swipe Processing**: Records attendance via biometric ID or user ObjectId
- **Shift-Based Validation**: Validates swipes against assigned shift windows
- **Location Tracking**: Supports GPS coordinates and address-based location data
- **Automatic Time Calculations**: Calculates work hours, breaks, overtime, and shortfall
- **Out-of-Window Detection**: Identifies and tracks swipes outside shift windows
- **Holiday Detection**: Automatically detects and handles holiday swipes
- **Regularization Support**: Flags attendance records that need regularization
- **Multiple Status Tracking**: Tracks detailed attendance status (Late, On-Time, Early-Exit, etc.)

### Technology Stack

- **Framework**: Fastify (Node.js)
- **Database**: MongoDB with Mongoose ODM
- **Time Zone**: UTC (all timestamps stored in UTC)
- **Authentication**: JWT-based authentication middleware

---

## Architecture

### System Components

```
┌─────────────────┐
│  Biometric      │
│  Device / App   │
└────────┬────────┘
         │
         │ POST /attendance/swipe
         │
         ▼
┌─────────────────────────────────────┐
│  Biometric Attendance Routes        │
│  - Input Validation                 │
│  - Request Parsing                  │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Biometric Attendance Service       │
│  - User Validation                  │
│  - Shift Assignment Lookup          │
│  - Window Validation                │
│  - Swipe Processing                 │
│  - Time Calculations                │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Database Models                    │
│  - AttendanceRecord                 │
│  - User                             │
│  - ShiftAssignment                  │
│  - HolidayCalendar                  │
└─────────────────────────────────────┘
```

### Data Flow

1. **Swipe Request** → Device/App sends biometric ID and timestamp
2. **Validation** → System validates user and active shift
3. **Window Check** → Validates if swipe is within shift window
4. **Record Creation/Update** → Creates or updates attendance record
5. **Status Calculation** → Calculates attendance status (Late, On-Time, etc.)
6. **Time Calculation** → Calculates work hours, breaks, overtime
7. **Response** → Returns detailed attendance status

---

## Data Models & Schemas

### AttendanceRecord Model

The primary model for storing attendance records.

```typescript
interface IAttendanceRecord {
  // Identification
  userId: Types.ObjectId;              // Reference to User
  shiftId: Types.ObjectId;             // Reference to Shift
  shiftCode: string;                   // e.g., "MORN", "NOON", "GEN"

  // Shift Timings (All in UTC)
  shiftDay: Date;                      // Normalized to start of day (UTC)
  shiftStart: Date;                    // Shift start time (UTC)
  shiftEnd: Date;                      // Shift end time (UTC)

  // Swipe Data
  swipes: {
    timestamp: Date;                   // Swipe time (UTC)
    direction: 'IN' | 'OUT';           // Check-in or Check-out
    deviceId: string;                  // Device identifier
    location?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: number;
      address: string;
    };
  }[];

  // Attendance Tracking
  firstIn: Date | null;                // First check-in of the day
  lastOut: Date | null;                // Last check-out of the day

  // Validation Flags
  isWithinWindow: boolean;             // Was swipe within shift window?
  isLateEntry: boolean;                // Did employee arrive late?
  isEarlyExit: boolean;                // Did employee leave early?
  needsRegularization: boolean;        // Does this need manager approval?

  // Time Calculations (HH:mm:ss format)
  totalWorkHours: string;              // Total time between first IN and last OUT
  breakHours: string;                  // Calculated break time
  actualWorkHours: string;             // Total work hours minus breaks
  shiftHours: string;                  // Expected shift duration
  shortfallHours: string;              // Hours short of shift duration
  excessHours: string;                 // Overtime hours
  overtimeStart?: Date;                // When overtime started
  overtimeEnd?: Date;                  // When overtime ended

  // Status
  status: 'incomplete' | 'complete' | 'duplicate_swipes' |
          'missing_checkout' | 'holiday_swipe' | 'leave_swipe' |
          'pending_regularization' | 'regularized' | 'overridden';

  attendanceStatus: Array<
    'Present' | 'Late' | 'On-Time' | 'Early-Exit' | 'Absent' |
    'On-Leave' | 'Out-Of-Window' | 'Holiday-Swipe' |
    'Pending-Regularization' | 'Regularized' | 'OT' | 'Override'
  >;

  // Out of Window Swipes
  outOfWindowSwipes: {
    timestamp: Date;
    direction: 'IN' | 'OUT';
    deviceId: string;
    location?: {...};
    reason: string;
  }[];

  // Regularization Info
  regularization?: {
    isRegularized: boolean;
    hasRegularizationRequest: boolean;
    regularizedAt?: Date;
    regularizedBy?: Types.ObjectId;
    regularizationType?: string[];
    remarks?: string;
    status: 'Pending' | 'Approved' | 'Rejected-Absent' | 'Rejected-Leave';
    regularizationId: Types.ObjectId;
  };

  // Override Info (Admin modifications)
  override?: {
    isOverridden: boolean;
    overriddenAt: Date;
    overriddenBy: Types.ObjectId;
    lastModifiedAt?: Date;
    lastModifiedBy?: Types.ObjectId;
    reason: string;
    remarks?: string;
    originalStatus?: string;
    originalAttendanceStatus?: string[];
    originalFirstIn?: Date | null;
    originalLastOut?: Date | null;
    originalTotalWorkHours?: string;
    originalActualWorkHours?: string;
    overrideHistory?: Array<{
      action: 'created' | 'modified' | 'removed';
      performedBy: Types.ObjectId;
      performedAt: Date;
      changes?: Array<{
        field: string;
        oldValue: any;
        newValue: any;
      }>;
      reason?: string;
    }>;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Schema Indexes

```typescript
// Unique constraint: One record per user per shift per day
{ userId: 1, shiftDay: 1, shiftCode: 1 }, { unique: true }

// Query optimization indexes
{ shiftDay: 1 }
{ shiftStart: 1 }
{ shiftEnd: 1 }
{ attendanceStatus: 1 }
{ 'override.isOverridden': 1 }
{ 'override.overriddenBy': 1 }
{ 'override.overriddenAt': 1 }
```

### Validation Rules

**Pre-save Hooks:**

1. Shift end time must be after shift start time
2. Swipes are automatically sorted by timestamp
3. Status is automatically updated based on swipe count:
   - 1 swipe: `missing_checkout`
   - 2 swipes: `complete`
   - \>2 swipes: `duplicate_swipes`

---

## API Endpoints

### Base URL

```
/attendance
```

### 1. Process Swipe (Check-In / Check-Out)

**Endpoint:** `POST /attendance/swipe`

**Description:** Process a biometric swipe to record attendance (check-in or check-out)

**Authentication:** None (Public endpoint for biometric devices)

**Request Body:**

```json
{
  "biometricId": "string", // Required: Biometric ID or User ObjectId
  "timestamp": "2025-12-15T10:30:00Z", // Optional: ISO 8601 UTC timestamp
  "location": {
    // Optional: GPS location
    "latitude": 12.9716,
    "longitude": 77.5946,
    "accuracy": 10,
    "altitude": 920,
    "address": "Bangalore, Karnataka"
  },
  "hasLocation": true, // Optional: Location availability flag
  "locationValid": true, // Optional: Location validity flag
  "locationAddress": "string" // Optional: Human-readable address
}
```

**Response (Success):**

```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "679235bfa892ecaccad0ccd5",
    "shiftCode": "MORN",
    "shiftDay": "2025-12-15T00:00:00.000Z",
    "swipeTime": "2025-12-15T10:30:00.000Z",
    "firstIn": "2025-12-15T10:30:00.000Z",
    "lastOut": null,
    "isWithinWindow": true,
    "isLateEntry": false,
    "isEarlyExit": false,
    "needsRegularization": false,
    "status": "incomplete",
    "attendanceStatus": ["On-Time"],
    "totalWorkHours": "00:00:00",
    "breakHours": "00:00:00",
    "actualWorkHours": "00:00:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "00:00:00",
    "excessHours": "00:00:00",
    "outOfWindowSwipes": []
  }
}
```

**Response (Out of Window):**

```json
{
  "success": true,
  "message": "Swipe recorded but outside window: Too early. Window starts at 09:00 AM IST. Regularization required.",
  "data": {
    "userId": "679235bfa892ecaccad0ccd5",
    "shiftCode": "MORN",
    "shiftDay": "2025-12-15T00:00:00.000Z",
    "swipeTime": "2025-12-15T08:00:00.000Z",
    "isWithinWindow": false,
    "needsRegularization": true,
    "status": "incomplete",
    "attendanceStatus": ["Out-Of-Window"],
    "outOfWindowSwipes": [
      {
        "timestamp": "2025-12-15T08:00:00.000Z",
        "direction": "IN",
        "deviceId": "biometric",
        "location": {
          "latitude": 12.9716,
          "longitude": 77.5946,
          "accuracy": 10,
          "altitude": 920,
          "address": "Bangalore, Karnataka"
        },
        "reason": "Too early. Window starts at 09:00 AM IST"
      }
    ]
  }
}
```

**Response (Error):**

```json
{
  "success": false,
  "error": {
    "message": "User not found or inactive"
  }
}
```

**Status Codes:**

- `200`: Swipe processed successfully
- `400`: Invalid request or business logic error

---

### 2. Get Attendance Status

**Endpoint:** `GET /attendance/status/:userId`

**Description:** Get attendance status for a specific user on a given date

**Authentication:** Required (JWT)

**URL Parameters:**

- `userId` (string): User ID to get status for

**Query Parameters:**

- `date` (string, required): Date in YYYY-MM-DD format (UTC)

**Example Request:**

```
GET /attendance/status/679235bfa892ecaccad0ccd5?date=2025-12-15
```

**Response (Success):**

```json
{
  "success": true,
  "data": [
    {
      "shiftCode": "MORN",
      "status": "complete",
      "excessHours": "00:30:00",
      "shortfallHours": "00:00:00",
      "firstSwipe": "2025-12-15T03:30:00.000Z",
      "lastSwipe": "2025-12-15T13:00:00.000Z"
    }
  ]
}
```

---

### 3. Get Attendance Records

**Endpoint:** `POST /attendance/records`

**Description:** Get attendance records for specified date range and users with pagination

**Authentication:** Required (JWT)

**Request Body:**

```json
{
  "startDate": "2025-12-01T00:00:00Z", // Required: Start date (UTC)
  "endDate": "2025-12-31T23:59:59Z", // Required: End date (UTC)
  "userIds": ["userId1", "userId2"], // Optional: Array of user IDs
  "page": 1, // Optional: Page number (default: 1)
  "limit": 10 // Optional: Records per page (default: 10, max: 100)
}
```

**Response (Success):**

```json
{
  "success": true,
  "data": [
    {
      "userId": "679235bfa892ecaccad0ccd5",
      "userName": "John Doe",
      "records": [
        {
          "_id": "record123",
          "shiftId": "shift123",
          "shiftDay": "2025-12-15T00:00:00.000Z",
          "shiftCode": "MORN",
          "shiftStart": "2025-12-15T03:30:00.000Z",
          "shiftEnd": "2025-12-15T12:30:00.000Z",
          "status": "complete",
          "swipes": [
            {
              "timestamp": "2025-12-15T03:30:00.000Z",
              "direction": "IN",
              "deviceId": "biometric",
              "location": {
                "latitude": 12.9716,
                "longitude": 77.5946,
                "accuracy": 10,
                "altitude": 920,
                "address": "Bangalore, Karnataka"
              }
            },
            {
              "timestamp": "2025-12-15T13:00:00.000Z",
              "direction": "OUT",
              "deviceId": "biometric",
              "location": {
                "latitude": 12.9716,
                "longitude": 77.5946,
                "accuracy": 10,
                "altitude": 920,
                "address": "Bangalore, Karnataka"
              }
            }
          ],
          "firstIn": "2025-12-15T03:30:00.000Z",
          "lastOut": "2025-12-15T13:00:00.000Z",
          "attendanceStatus": ["On-Time", "Present"],
          "isWithinWindow": true,
          "isLateEntry": false,
          "isEarlyExit": false,
          "needsRegularization": false,
          "excessHours": "00:30:00",
          "shortfallHours": "00:00:00",
          "totalWorkHours": "09:30:00",
          "breakHours": "00:30:00",
          "actualWorkHours": "09:00:00",
          "shiftHours": "09:00:00",
          "outOfWindowSwipes": []
        }
      ],
      "summary": {
        "totalDays": 31,
        "lateDays": 2,
        "presentDays": 28,
        "regularisedDays": 3,
        "leaveDays": 1
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  }
}
```

---

### 4. Get All Attendance Records

**Endpoint:** `POST /attendance/records/all`

**Description:** Get attendance records for ALL active users (no user filter)

**Authentication:** Required (JWT)

**Request Body:**

```json
{
  "startDate": "2025-12-01T00:00:00Z",
  "endDate": "2025-12-31T23:59:59Z",
  "page": 1,
  "limit": 10
}
```

**Response:** Same structure as `/attendance/records` but includes all active users

---

### 5. Get Shift Records for User

**Endpoint:** `POST /attendance/shift-records`

**Description:** Get attendance and shift assignment records for specific dates

**Authentication:** Required (JWT)

**Request Body:**

```json
{
  "userId": "679235bfa892ecaccad0ccd5",
  "dates": ["2025-12-15", "2025-12-16", "2025-12-17"]
}
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "attendanceRecords": [
      {
        "_id": "record123",
        "userId": "679235bfa892ecaccad0ccd5",
        "shiftDay": "2025-12-15T00:00:00.000Z",
        "shiftCode": "MORN",
        "swipes": [...],
        "attendanceStatus": ["On-Time"]
      }
    ],
    "shiftAssignments": [
      {
        "userId": "679235bfa892ecaccad0ccd5",
        "shiftId": {
          "_id": "shift123",
          "code": "MORN",
          "startTime": "09:00",
          "endTime": "18:00",
          "shiftWindowStart": "08:30",
          "shiftWindowEnd": "18:30"
        },
        "shiftCode": "MORN",
        "startDate": "2025-12-01T00:00:00.000Z",
        "endDate": null,
        "weekendDays": [0, 6]
      }
    ]
  }
}
```

---

### 6. Get User Attendance Records

**Endpoint:** `POST /attendance/user-records`

**Description:** Get attendance records for a specific user within date range

**Authentication:** Not required

**Request Body:**

```json
{
  "userId": "679235bfa892ecaccad0ccd5",
  "startDate": "2025-12-01",
  "endDate": "2025-12-31"
}
```

**Response:**

```json
{
  "success": true,
  "data": [
    // Array of attendance records
  ]
}
```

---

### 7. Bulk Insert Attendance Records

**Endpoint:** `POST /attendance/bulk-insert`

**Description:** Insert sample attendance records for testing (generates random data)

**Authentication:** None

**Request Body:**

```json
{
  "userId": ["userId1", "userId2"],
  "month": 12,
  "year": 2025
}
```

---

### 8. Delete Bulk Attendance Records

**Endpoint:** `DELETE /attendance/bulk-delete`

**Description:** Delete attendance records for a user within date range

**Authentication:** Not required

**Request Body:**

```json
{
  "userId": "679235bfa892ecaccad0ccd5",
  "startDate": "2025-12-01",
  "endDate": "2025-12-31"
}
```

**Response:**

```json
{
  "success": true,
  "message": "15 attendance records deleted successfully"
}
```

---

### 9. Generate Weekly Report

**Endpoint:** `GET /attendance/weekly-report`

**Description:** Generate Excel report with weekly attendance summary

**Authentication:** Required (JWT)

**Query Parameters:**

- `month` (string, required): Month in YYYY-MM format (e.g., "2025-12")

**Example:**

```
GET /attendance/weekly-report?month=2025-12
```

**Response:** Excel file download (binary)

- Filename: `Weekly_Report_December_2025.xlsx`
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Report Features:**

- Company header and address
- Date range information
- One row per employee
- Columns for each week in the month
- Color-coded hours:
  - **Red**: Below required hours for the week
  - **Black**: Met required hours
- Required hours vary based on:
  - Weekend configuration (5-day vs 6-day week)
  - Holidays in the week

---

### 10. Admin Attendance View

**Endpoint:** `GET /attendance/admin/view`

**Description:** Get simplified attendance view for all users (admin dashboard)

**Authentication:** Required (JWT)

**Query Parameters:**

- `startDate` (string, required): Start date in YYYY-MM-DD format
- `endDate` (string, required): End date in YYYY-MM-DD format

**Example:**

```
GET /attendance/admin/view?startDate=2025-12-01&endDate=2025-12-31
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "userId": "679235bfa892ecaccad0ccd5",
      "userName": "John Doe",
      "employeeCode": "EMP001",
      "role": "Employee",
      "active": true,
      "attendance": [
        {
          "attendanceId": "record123",
          "shiftDay": "2025-12-01",
          "status": "complete",
          "attendanceStatus": ["On-Time", "Present"]
        },
        {
          "attendanceId": null,
          "shiftDay": "2025-12-02",
          "status": "unknown",
          "attendanceStatus": [],
          "isWeekend": true
        },
        {
          "attendanceId": "record124",
          "shiftDay": "2025-12-03",
          "status": "complete",
          "attendanceStatus": ["Late", "Present"]
        }
      ]
    }
  ],
  "meta": {
    "startDate": "2025-12-01",
    "endDate": "2025-12-31",
    "totalUsers": 150,
    "dateRange": ["2025-12-01", "2025-12-02", ..., "2025-12-31"]
  }
}
```

---

## Service Layer

### BiometricAttendanceService

Main service class handling all attendance business logic.

#### Key Methods

##### 1. `processSwipe(swipeData: ISwipeData): Promise<ISwipeResponse>`

**Purpose:** Process a biometric swipe (check-in or check-out)

**Algorithm:**

```
1. Validate user by biometricId (can be ObjectId or biometric string)
2. Get current shift assignment for the user
3. Calculate shift window timings (convert IST to UTC)
4. Find or create attendance record for the shift day
5. Check if swipe is within shift window
   - If YES: Process as regular swipe
   - If NO: Add to outOfWindowSwipes array
6. Determine if this is first or second swipe
   - First swipe: Process as check-in
   - Second swipe: Process as check-out
7. Calculate attendance metrics
8. Update attendance status
9. Return response with complete details
```

**Special Cases:**

- **Holiday Detection**: If the swipe date is a holiday, mark as `holiday_swipe`
- **Maximum Swipes**: Limit of 2 swipes per day (IN and OUT)
- **Location Data**: Stores GPS coordinates and address if provided

##### 2. `getAttendanceStatus(userId, date): Promise<IAttendanceStatusResponse>`

**Purpose:** Get attendance status for a specific date

**Returns:** Array of attendance records for all shifts on that date

##### 3. `getAttendanceRecords(query): Promise<IAttendanceRecordsResponse>`

**Purpose:** Get paginated attendance records with summaries

**Features:**

- Pagination support
- User filtering
- Date range filtering
- Automatic summary calculation per user

##### 4. `getAttendanceAndShiftRecords(userId, dates): Promise<any>`

**Purpose:** Get both attendance records and shift assignments for specific dates

**Use Case:** Frontend calendar view showing both attendance and assigned shifts

##### 5. `generateWeeklyReportByMonth(month): Promise<Buffer>`

**Purpose:** Generate Excel report for monthly attendance

**Algorithm:**

```
1. Calculate all weeks in the month (ISO week numbers)
2. Fetch all active users
3. Fetch attendance records for date range
4. Fetch shift assignments (for weekend calculation)
5. Fetch holiday calendars
6. Calculate total hours per user per week
7. Apply color coding based on required hours:
   - 2-day weekend (Sat+Sun): 45 hours required
   - 1-day weekend (Sun): 54 hours required
   - Week with holiday: 36 hours required
8. Generate Excel workbook with formatting
9. Return as Buffer
```

##### 6. `getAdminAttendanceView(startDate, endDate): Promise<any>`

**Purpose:** Simplified attendance view for admin dashboard

**Features:**

- Shows all users (active + users with attendance)
- Shows all dates in range (even without attendance)
- Marks weekends and holidays
- Lightweight response (only essential fields)

---

## Business Logic

### Time Zone Handling

**All times are stored in UTC**

- User shift times are defined in IST (India Standard Time)
- System converts IST to UTC before storing
- Conversion formula: `UTC = IST - 5:30`

**Example:**

```
IST Shift: 09:00 - 18:00
UTC Shift: 03:30 - 12:30
```

### Shift Window Calculation

A shift window defines the acceptable time range for check-in and check-out.

**Components:**

- `shiftStart`: Official shift start time
- `shiftEnd`: Official shift end time
- `shiftWindowStart`: Earliest allowed check-in time (usually 30 min before shift start)
- `shiftWindowEnd`: Latest allowed check-out time (usually 30 min after shift end)

**Example:**

```
Shift: 09:00 - 18:00 IST
Window: 08:30 - 18:30 IST

In UTC:
Shift: 03:30 - 12:30
Window: 03:00 - 13:00
```

### Swipe Processing Logic

#### First Swipe (Check-In)

```typescript
1. Create IN swipe record
2. Set firstIn = timestamp
3. Check if late: timestamp > shiftStart
4. Set attendanceStatus:
   - If late: ['Late']
   - If on-time: ['On-Time']
5. Set needsRegularization = isLate
6. Initialize time fields to '00:00:00'
```

#### Second Swipe (Check-Out)

```typescript
1. Create OUT swipe record
2. Set lastOut = timestamp
3. Check if early exit: timestamp < shiftEnd
4. Calculate metrics:
   - totalWorkHours = lastOut - firstIn
   - breakHours = (totalWorkHours > 6 hours) ? 30 min : 0
   - actualWorkHours = totalWorkHours - breakHours
   - shiftHours = shiftEnd - shiftStart
   - difference = actualWorkHours - shiftHours
   - If difference < 0: shortfallHours = abs(difference)
   - If difference > 0: excessHours = difference
5. Update attendanceStatus:
   - Add 'Early-Exit' if applicable
   - Add 'Present'
6. Update needsRegularization:
   - True if: isLate OR isEarlyExit OR hasShortfall OR notWithinWindow
```

### Out-of-Window Swipes

When a swipe is outside the shift window:

1. Still record the swipe
2. Add to `outOfWindowSwipes` array
3. Set `needsRegularization = true`
4. Add `'Out-Of-Window'` to attendanceStatus
5. Include reason for being out of window:
   - "Too early. Window starts at HH:MM IST"
   - "Too late. Window ends at HH:MM IST"

### Holiday Swipes

When a swipe occurs on a holiday:

1. Mark record as `holiday_swipe` status
2. Set attendanceStatus to `['Holiday-Swipe']`
3. Auto-approve regularization
4. Record swipes normally
5. Don't flag as needing regularization

### Time Calculations

#### Total Work Hours

```
totalWorkHours = lastOut - firstIn
```

#### Break Hours

```
if totalWorkHours > 6 hours:
    breakHours = 30 minutes
else:
    breakHours = 0 minutes
```

#### Actual Work Hours

```
actualWorkHours = totalWorkHours - breakHours
```

#### Shortfall/Excess Calculation

```
difference = actualWorkHours - shiftHours

if difference < 0:
    shortfallHours = abs(difference)
    excessHours = '00:00:00'
else:
    shortfallHours = '00:00:00'
    excessHours = difference
```

### Status Determination

#### Record Status

- `incomplete`: Only check-in recorded (no check-out)
- `complete`: Both check-in and check-out recorded
- `duplicate_swipes`: More than 2 swipes recorded
- `missing_checkout`: Only check-in, waiting for check-out
- `holiday_swipe`: Swipe on a holiday
- `leave_swipe`: Swipe on a leave day
- `pending_regularization`: Needs manager approval
- `regularized`: Approved by manager
- `overridden`: Modified by admin

#### Attendance Status Array

Can contain multiple statuses:

- `Present`: Employee was present
- `Late`: Arrived after shift start
- `On-Time`: Arrived on or before shift start
- `Early-Exit`: Left before shift end
- `Absent`: No swipes recorded
- `On-Leave`: On approved leave
- `Out-Of-Window`: Swipe outside shift window
- `Holiday-Swipe`: Swipe on holiday
- `Pending-Regularization`: Needs approval
- `Regularized`: Approved by manager
- `OT`: Overtime recorded
- `Override`: Modified by admin

---

## Request/Response Examples

### Example 1: Normal Check-In (On-Time)

**Request:**

```bash
curl -X POST http://localhost:3000/attendance/swipe \
  -H "Content-Type: application/json" \
  -d '{
    "biometricId": "EMP001",
    "timestamp": "2025-12-15T03:30:00Z",
    "location": {
      "latitude": 12.9716,
      "longitude": 77.5946,
      "accuracy": 10,
      "altitude": 920,
      "address": "Bangalore, Karnataka"
    }
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "679235bfa892ecaccad0ccd5",
    "shiftCode": "MORN",
    "shiftDay": "2025-12-15T00:00:00.000Z",
    "swipeTime": "2025-12-15T03:30:00.000Z",
    "firstIn": "2025-12-15T03:30:00.000Z",
    "lastOut": null,
    "isWithinWindow": true,
    "isLateEntry": false,
    "isEarlyExit": false,
    "needsRegularization": false,
    "status": "incomplete",
    "attendanceStatus": ["On-Time"],
    "totalWorkHours": "00:00:00",
    "breakHours": "00:00:00",
    "actualWorkHours": "00:00:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "00:00:00",
    "excessHours": "00:00:00",
    "outOfWindowSwipes": []
  }
}
```

---

### Example 2: Late Check-In

**Request:**

```bash
curl -X POST http://localhost:3000/attendance/swipe \
  -H "Content-Type: application/json" \
  -d '{
    "biometricId": "EMP001",
    "timestamp": "2025-12-15T04:15:00Z"
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "679235bfa892ecaccad0ccd5",
    "shiftCode": "MORN",
    "shiftDay": "2025-12-15T00:00:00.000Z",
    "swipeTime": "2025-12-15T04:15:00.000Z",
    "firstIn": "2025-12-15T04:15:00.000Z",
    "lastOut": null,
    "isWithinWindow": true,
    "isLateEntry": true,
    "isEarlyExit": false,
    "needsRegularization": true,
    "status": "incomplete",
    "attendanceStatus": ["Late"],
    "totalWorkHours": "00:00:00",
    "breakHours": "00:00:00",
    "actualWorkHours": "00:00:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "00:00:00",
    "excessHours": "00:00:00",
    "outOfWindowSwipes": []
  }
}
```

---

### Example 3: Check-Out (With Overtime)

**Request:**

```bash
curl -X POST http://localhost:3000/attendance/swipe \
  -H "Content-Type: application/json" \
  -d '{
    "biometricId": "EMP001",
    "timestamp": "2025-12-15T13:30:00Z"
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "679235bfa892ecaccad0ccd5",
    "shiftCode": "MORN",
    "shiftDay": "2025-12-15T00:00:00.000Z",
    "swipeTime": "2025-12-15T13:30:00.000Z",
    "firstIn": "2025-12-15T03:30:00.000Z",
    "lastOut": "2025-12-15T13:30:00.000Z",
    "isWithinWindow": true,
    "isLateEntry": false,
    "isEarlyExit": false,
    "needsRegularization": false,
    "status": "complete",
    "attendanceStatus": ["On-Time", "Present"],
    "totalWorkHours": "10:00:00",
    "breakHours": "00:30:00",
    "actualWorkHours": "09:30:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "00:00:00",
    "excessHours": "00:30:00",
    "outOfWindowSwipes": []
  }
}
```

---

### Example 4: Out-of-Window Check-In (Too Early)

**Request:**

```bash
curl -X POST http://localhost:3000/attendance/swipe \
  -H "Content-Type: application/json" \
  -d '{
    "biometricId": "EMP001",
    "timestamp": "2025-12-15T02:00:00Z"
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Swipe recorded but outside window: Too early. Window starts at 08:30 AM IST. Regularization required.",
  "data": {
    "userId": "679235bfa892ecaccad0ccd5",
    "shiftCode": "MORN",
    "shiftDay": "2025-12-15T00:00:00.000Z",
    "swipeTime": "2025-12-15T02:00:00.000Z",
    "firstIn": null,
    "lastOut": null,
    "isWithinWindow": false,
    "isLateEntry": false,
    "isEarlyExit": false,
    "needsRegularization": true,
    "status": "incomplete",
    "attendanceStatus": ["Out-Of-Window"],
    "totalWorkHours": "00:00:00",
    "breakHours": "00:00:00",
    "actualWorkHours": "00:00:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "00:00:00",
    "excessHours": "00:00:00",
    "outOfWindowSwipes": [
      {
        "timestamp": "2025-12-15T02:00:00.000Z",
        "direction": "IN",
        "deviceId": "biometric",
        "location": {
          "latitude": 0,
          "longitude": 0,
          "accuracy": 0,
          "altitude": 0,
          "address": "unknown"
        },
        "reason": "Too early. Window starts at 08:30 AM IST"
      }
    ]
  }
}
```

---

### Example 5: Holiday Swipe

**Request:**

```bash
curl -X POST http://localhost:3000/attendance/swipe \
  -H "Content-Type: application/json" \
  -d '{
    "biometricId": "EMP001",
    "timestamp": "2025-12-25T04:00:00Z"
  }'
```

**Response:**

```json
{
  "success": true,
  "message": "Swipe recorded successfully for holiday",
  "data": {
    "userId": "679235bfa892ecaccad0ccd5",
    "shiftCode": "MORN",
    "shiftDay": "2025-12-25T00:00:00.000Z",
    "swipeTime": "2025-12-25T04:00:00.000Z",
    "status": "holiday_swipe",
    "attendanceStatus": ["Holiday-Swipe"],
    "isWithinWindow": true,
    "needsRegularization": false
  }
}
```

---

### Example 6: Using ObjectId as biometricId

**Request:**

```bash
curl -X POST http://localhost:3000/attendance/swipe \
  -H "Content-Type: application/json" \
  -d '{
    "biometricId": "679235bfa892ecaccad0ccd5",
    "timestamp": "2025-12-15T03:30:00Z"
  }'
```

**Response:** Same as normal check-in response

**Note:** The system auto-detects if biometricId is a MongoDB ObjectId (24 characters) and treats it as userId

---

## Error Handling

### Common Error Responses

#### 1. User Not Found

```json
{
  "success": false,
  "error": {
    "message": "User not found or inactive"
  }
}
```

**Causes:**

- Invalid biometricId
- User account is inactive
- User doesn't exist in the system

---

#### 2. No Active Shift Assignment

```json
{
  "success": false,
  "error": {
    "message": "No active shift assignment found"
  }
}
```

**Causes:**

- User doesn't have a shift assigned for the date
- Shift assignment has expired
- Shift assignment start date is in the future

---

#### 3. Maximum Swipes Reached

```json
{
  "success": false,
  "message": "Maximum swipes limit (2) reached for today"
}
```

**Causes:**

- User has already checked in and checked out (2 swipes)
- Attempting a third swipe on the same day

---

#### 4. Invalid Date Format

```json
{
  "success": false,
  "error": {
    "message": "Invalid date format. Please use YYYY-MM-DD format"
  }
}
```

**Causes:**

- Date parameter in wrong format
- Invalid date values

---

#### 5. Date Range Error

```json
{
  "success": false,
  "error": {
    "message": "startDate must be before or equal to endDate"
  }
}
```

**Causes:**

- Start date is after end date in query

---

## Best Practices

### For API Consumers

#### 1. Timestamp Handling

- **Always use UTC timestamps** in ISO 8601 format
- If timestamp is not provided, current UTC time is used
- Example: `2025-12-15T10:30:00Z`

#### 2. Location Data

- Provide location data whenever possible for audit trails
- Location can be:
  - Full GPS coordinates (preferred)
  - Address only
  - Can be omitted (will default to unknown)

```json
// Preferred - Full GPS
{
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946,
    "accuracy": 10,
    "altitude": 920,
    "address": "Bangalore, Karnataka"
  }
}

// Alternative - Address only
{
  "hasLocation": false,
  "locationValid": false,
  "locationAddress": "Office Premises"
}

// Minimal - No location
{
  // location fields omitted
}
```

#### 3. BiometricId Format

- Can be either:
  - Biometric ID string (e.g., "EMP001")
  - MongoDB ObjectId (e.g., "679235bfa892ecaccad0ccd5")
- System auto-detects the format
- 24-character strings are treated as ObjectIds

#### 4. Error Handling

```typescript
try {
  const response = await fetch("/attendance/swipe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(swipeData),
  });

  const result = await response.json();

  if (result.success) {
    // Handle success
    console.log("Swipe recorded:", result.data);
  } else {
    // Handle business logic error
    console.error("Error:", result.error?.message);
  }
} catch (error) {
  // Handle network/system error
  console.error("System error:", error);
}
```

#### 5. Pagination

- Always use pagination for large date ranges
- Default page size: 10
- Maximum page size: 100
- Calculate total pages: `Math.ceil(meta.total / meta.limit)`

---

### For System Administrators

#### 1. Database Indexes

Ensure these indexes exist for optimal performance:

```javascript
db.attendancerecords.createIndex(
  { userId: 1, shiftDay: 1, shiftCode: 1 },
  { unique: true }
);
db.attendancerecords.createIndex({ shiftDay: 1 });
db.attendancerecords.createIndex({ attendanceStatus: 1 });
db.attendancerecords.createIndex({ "override.isOverridden": 1 });
```

#### 2. Data Retention

- Attendance records should be retained for at least 3 years (legal compliance)
- Consider archiving old records (>3 years) to separate collection
- Maintain audit trail for all overrides

#### 3. Holiday Calendar Management

- Ensure holiday calendars are updated annually
- Assign holiday calendars to users/departments
- System checks both:
  - User's `holidayCalendarId` field
  - Holiday calendar's `assignedTo` array

#### 4. Shift Window Configuration

- Recommended window: ±30 minutes from shift time
- Too wide window: May allow time theft
- Too narrow window: May cause excessive regularizations

Example shift configuration:

```json
{
  "code": "MORN",
  "name": "Morning Shift",
  "startTime": "09:00",
  "endTime": "18:00",
  "shiftWindowStart": "08:30",
  "shiftWindowEnd": "18:30",
  "gracePeriod": 15
}
```

#### 5. Monitoring & Alerts

Monitor these metrics:

- Out-of-window swipes rate
- Regularization request rate
- Missing check-outs
- Duplicate swipes
- Holiday swipes

Set up alerts for:

- Sudden increase in out-of-window swipes
- Users with multiple duplicate swipes
- Biometric device failures (no swipes)

#### 6. Backup & Recovery

- Daily backups of attendance records
- Point-in-time recovery capability
- Test restore procedures regularly

---

### For Frontend Developers

#### 1. Display Time in Local Time Zone

```typescript
// Convert UTC to IST for display
const utcTime = "2025-12-15T03:30:00.000Z";
const istTime = new Date(utcTime).toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
// Output: "09:00 AM"
```

#### 2. Status Badge Colors

```typescript
const statusColors = {
  "On-Time": "green",
  Late: "red",
  "Early-Exit": "orange",
  "Out-Of-Window": "yellow",
  "Holiday-Swipe": "blue",
  Present: "green",
  Absent: "red",
  "Pending-Regularization": "yellow",
  Regularized: "blue",
  Override: "purple",
};
```

#### 3. Calculate Day Status

```typescript
function getDayStatus(attendance) {
  if (!attendance || attendance.status === "unknown") {
    return { label: "No Record", color: "gray" };
  }

  if (attendance.isWeekend) {
    return { label: "Weekend", color: "lightgray" };
  }

  if (attendance.isHoliday) {
    return { label: "Holiday", color: "blue" };
  }

  if (attendance.status === "complete") {
    const isLate = attendance.attendanceStatus.includes("Late");
    return {
      label: isLate ? "Present (Late)" : "Present",
      color: isLate ? "orange" : "green",
    };
  }

  if (attendance.status === "incomplete") {
    return { label: "Incomplete", color: "yellow" };
  }

  return { label: "Absent", color: "red" };
}
```

#### 4. Format Work Hours

```typescript
function formatWorkHours(hhmmss: string): string {
  const [hours, minutes] = hhmmss.split(":");
  return `${parseInt(hours)}h ${parseInt(minutes)}m`;
}

// "09:30:00" → "9h 30m"
```

#### 5. Handle Loading States

```typescript
const [isProcessing, setIsProcessing] = useState(false);

async function recordSwipe(biometricId: string) {
  setIsProcessing(true);
  try {
    const response = await api.post("/attendance/swipe", {
      biometricId,
      timestamp: new Date().toISOString(),
    });

    if (response.data.success) {
      showSuccessMessage(response.data.message);
      refreshAttendanceData();
    } else {
      showErrorMessage(response.data.error.message);
    }
  } catch (error) {
    showErrorMessage("Network error. Please try again.");
  } finally {
    setIsProcessing(false);
  }
}
```

---

## Constants & Configuration

### Attendance Constants

```typescript
// src/constants/attendance.ts

export const DEFAULT_SHIFT_EARLY_CHECK_IN_THRESHOLD = 120; // minutes
export const DEFAULT_DUPLICATE_SWIPE_THRESHOLD = 2; // minutes
export const DEFAULT_GRACE_PERIOD = 15; // minutes

export const ATTENDANCE_STATUS = {
  INCOMPLETE: "incomplete",
  COMPLETE: "complete",
  DUPLICATE_SWIPES: "duplicate_swipes",
  MISSING_CHECKOUT: "missing_checkout",
} as const;

export const SWIPE_TYPE = {
  CHECK_IN: "check-in",
  SWIPE: "swipe",
} as const;
```

### Break Time Rules

```typescript
// Automatic break calculation
function calculateBreakHours(totalMinutes: number): number {
  // If total work is more than 6 hours, deduct 30 minutes break
  return totalMinutes > 360 ? 30 : 0;
}
```

### Required Hours Per Week

```typescript
const REQUIRED_HOURS = {
  TWO_DAY_WEEKEND: 45, // 5 working days × 9 hours
  ONE_DAY_WEEKEND: 54, // 6 working days × 9 hours
  WEEK_WITH_HOLIDAY: 36, // 4 working days × 9 hours
};
```

---

## Testing Guide

### Unit Testing Examples

#### Test 1: Process On-Time Check-In

```typescript
describe("BiometricAttendanceService", () => {
  it("should process on-time check-in successfully", async () => {
    const swipeData = {
      biometricId: "EMP001",
      timestamp: new Date("2025-12-15T03:30:00Z"),
    };

    const result = await service.processSwipe(swipeData);

    expect(result.success).toBe(true);
    expect(result.data.isLateEntry).toBe(false);
    expect(result.data.attendanceStatus).toContain("On-Time");
    expect(result.data.status).toBe("incomplete");
  });
});
```

#### Test 2: Process Late Check-In

```typescript
it("should flag late check-in", async () => {
  const swipeData = {
    biometricId: "EMP001",
    timestamp: new Date("2025-12-15T04:15:00Z"), // 45 min late
  };

  const result = await service.processSwipe(swipeData);

  expect(result.data.isLateEntry).toBe(true);
  expect(result.data.attendanceStatus).toContain("Late");
  expect(result.data.needsRegularization).toBe(true);
});
```

#### Test 3: Process Check-Out with Overtime

```typescript
it("should calculate overtime correctly", async () => {
  // First swipe (check-in)
  await service.processSwipe({
    biometricId: "EMP001",
    timestamp: new Date("2025-12-15T03:30:00Z"),
  });

  // Second swipe (check-out with overtime)
  const result = await service.processSwipe({
    biometricId: "EMP001",
    timestamp: new Date("2025-12-15T13:30:00Z"), // 1 hour overtime
  });

  expect(result.data.status).toBe("complete");
  expect(result.data.totalWorkHours).toBe("10:00:00");
  expect(result.data.excessHours).toBe("00:30:00"); // After break deduction
});
```

#### Test 4: Out-of-Window Swipe

```typescript
it("should handle out-of-window swipe", async () => {
  const swipeData = {
    biometricId: "EMP001",
    timestamp: new Date("2025-12-15T02:00:00Z"), // Too early
  };

  const result = await service.processSwipe(swipeData);

  expect(result.data.isWithinWindow).toBe(false);
  expect(result.data.needsRegularization).toBe(true);
  expect(result.data.outOfWindowSwipes).toHaveLength(1);
  expect(result.message).toContain("outside window");
});
```

### Integration Testing

#### Test API Endpoint

```bash
# Test check-in
curl -X POST http://localhost:3000/attendance/swipe \
  -H "Content-Type: application/json" \
  -d '{
    "biometricId": "EMP001",
    "timestamp": "2025-12-15T03:30:00Z"
  }'

# Test check-out
curl -X POST http://localhost:3000/attendance/swipe \
  -H "Content-Type: application/json" \
  -d '{
    "biometricId": "EMP001",
    "timestamp": "2025-12-15T12:30:00Z"
  }'

# Get status
curl -X GET "http://localhost:3000/attendance/status/USER_ID?date=2025-12-15" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Swipe Not Recording

**Symptoms:** API returns success but attendance not showing in records

**Possible Causes:**

1. No active shift assignment for the date
2. User account is inactive
3. Database connection issue

**Solution:**

```sql
-- Check shift assignment
db.shiftassignments.find({
  userId: ObjectId("USER_ID"),
  isActive: true
})

-- Check user status
db.users.findOne({ _id: ObjectId("USER_ID") }, { active: 1, name: 1 })
```

#### Issue 2: All Swipes Marked as Out-of-Window

**Symptoms:** Every swipe shows out-of-window warning

**Possible Causes:**

1. Shift window timings incorrectly configured
2. Time zone mismatch (IST vs UTC)
3. Server time incorrect

**Solution:**

```javascript
// Check shift window configuration
db.shifts.findOne(
  { code: "MORN" },
  {
    startTime: 1,
    endTime: 1,
    shiftWindowStart: 1,
    shiftWindowEnd: 1,
  }
);

// Verify server time
console.log("Server UTC time:", new Date().toISOString());
```

#### Issue 3: Break Time Not Calculated

**Symptoms:** actualWorkHours same as totalWorkHours

**Possible Causes:**

1. Work duration less than 6 hours (break not applicable)
2. Logic issue in break calculation

**Solution:**

- Break is only applied if totalWorkHours > 6 hours
- Check `calculateAttendanceMetrics` method

#### Issue 4: Unable to Check Out

**Symptoms:** "Maximum swipes limit reached" error

**Possible Causes:**

1. User already checked out
2. Duplicate swipe attempt
3. Record has more than 2 swipes

**Solution:**

```javascript
// Check existing swipes for the day
db.attendancerecords.findOne(
  {
    userId: ObjectId("USER_ID"),
    shiftDay: ISODate("2025-12-15T00:00:00Z"),
  },
  {
    swipes: 1,
    status: 1,
  }
);

// If duplicate, delete and recreate
db.attendancerecords.deleteOne({
  userId: ObjectId("USER_ID"),
  shiftDay: ISODate("2025-12-15T00:00:00Z"),
});
```

---

## Appendix

### A. Time Format Reference

| Format       | Example              | Description            |
| ------------ | -------------------- | ---------------------- |
| UTC ISO 8601 | 2025-12-15T10:30:00Z | Standard API format    |
| Date Only    | 2025-12-15           | Query parameter format |
| Duration     | 09:30:00             | Hours:Minutes:Seconds  |
| Time (IST)   | 09:00                | HH:mm format           |
| Month        | 2025-12              | YYYY-MM format         |

### B. Status Values Reference

**Record Status:**

- `incomplete` - Only check-in recorded
- `complete` - Both IN and OUT recorded
- `duplicate_swipes` - More than 2 swipes
- `missing_checkout` - No check-out recorded
- `holiday_swipe` - Swipe on holiday
- `leave_swipe` - Swipe on leave day
- `pending_regularization` - Awaiting approval
- `regularized` - Approved by manager
- `overridden` - Modified by admin

**Attendance Status (Array):**

- `Present` - Employee was present
- `Late` - Arrived late
- `On-Time` - Arrived on time
- `Early-Exit` - Left early
- `Absent` - No attendance
- `On-Leave` - On approved leave
- `Out-Of-Window` - Outside shift window
- `Holiday-Swipe` - Holiday attendance
- `Pending-Regularization` - Needs approval
- `Regularized` - Approved
- `OT` - Overtime recorded
- `Override` - Admin modified

### C. Location Data Schema

```typescript
interface Location {
  latitude: number; // GPS latitude (-90 to 90)
  longitude: number; // GPS longitude (-180 to 180)
  accuracy: number; // GPS accuracy in meters
  altitude: number; // Altitude in meters
  address: string; // Human-readable address
}
```

### D. Shift Window Examples

**Example 1: Morning Shift**

```json
{
  "code": "MORN",
  "startTime": "09:00",
  "endTime": "18:00",
  "shiftWindowStart": "08:30",
  "shiftWindowEnd": "18:30"
}
```

**Example 2: Night Shift (crosses midnight)**

```json
{
  "code": "NIGHT",
  "startTime": "22:00",
  "endTime": "06:00",
  "shiftWindowStart": "21:30",
  "shiftWindowEnd": "06:30"
}
```

**Example 3: Noon Shift**

```json
{
  "code": "NOON",
  "startTime": "13:00",
  "endTime": "22:00",
  "shiftWindowStart": "12:30",
  "shiftWindowEnd": "22:30"
}
```

---

## Version History

| Version | Date       | Changes               |
| ------- | ---------- | --------------------- |
| 1.0     | 2025-12-15 | Initial documentation |

---

## Support & Contact

For technical support or questions about this API:

- **Technical Lead:** [Contact Information]
- **Documentation:** This file
- **API Swagger:** http://localhost:3000/documentation (when server is running)

---

**End of Documentation**
