# Admin Attendance View - Complete Plan

## Overview

Create a new GET route that returns comprehensive attendance data for all users (active and inactive) within a date range, including shift assignments and attendance records. This will power an admin panel that shows all employees' attendance for any date range.

---

## Holiday Assignment System

**Critical**: The system uses **TWO methods** to assign holidays to users. Both must be checked:

### Method 1: Direct Reference (`holidayCalendarId`)
- **Location**: `User.holidayCalendarId` field
- **Usage**: Direct one-to-one relationship
- **Used by**: `PayrollService.getWorkingDaysInMonth()`
- **Query Pattern**:
  ```typescript
  const user = await User.findById(userId, 'holidayCalendarId');
  const calendar = await HolidayCalendar.findById(user.holidayCalendarId);
  ```

### Method 2: Assigned To Array (`assignedTo`)
- **Location**: `HolidayCalendar.assignedTo` array
- **Usage**: Many-to-many relationship (one calendar can be assigned to multiple users)
- **Used by**: `BiometricAttendanceService.checkHolidayCalendar()`
- **Query Pattern**:
  ```typescript
  const calendars = await HolidayCalendar.find({
    assignedTo: { $in: [userId] }
  });
  ```

### Implementation Requirement
The `getAdminAttendanceView()` method must:
1. Check both methods for each user
2. Combine holidays from both sources
3. Remove duplicates (same date + name)
4. Return `isHoliday: true` if date matches any holiday from either source

---

## Requirements Analysis

### Functional Requirements

1. **User Inclusion Logic**:
   - ✅ Include ALL users (active and inactive) who have attendance records in the date range
   - ✅ Include ALL active users even if they have NO attendance records (return empty records)
   - ❌ Exclude inactive users who have NO attendance records

2. **Data Requirements**:
   - User information (name, employeeCode, active status)
   - Shift assignments for the date range (may have multiple assignments)
   - Attendance records for each date in the range
   - Empty attendance records for dates with no records (for active users)

3. **Shift Assignment Handling**:
   - A user may have multiple shift assignments within the date range
   - Need to determine which shift assignment applies to each date
   - Handle overlapping assignments (use most recent/active)
   - Handle sequential assignments (different shifts on different dates)

4. **Response Structure**:
   - Organized by user
   - For each user: shift assignments array + attendance records per date
   - Clear indication of which shift assignment applies to each date

---

## Implementation Plan

### Route Design

**Endpoint**: `GET /attendance/admin/view`

**Query Parameters**:
- `startDate` (required): `YYYY-MM-DD` format
- `endDate` (required): `YYYY-MM-DD` format

**Example**:
```
GET /attendance/admin/view?startDate=2025-11-01&endDate=2025-11-30
```

### Response Structure (Simplified for UI)

```typescript
{
  success: boolean;
  data: Array<{
    userId: string;
    userName: string;
    employeeCode: string;
    active: boolean;
    // Simple attendance records - one per date
    attendance: Array<{
      attendanceId: string | null;  // null if no record exists
      shiftDay: string;             // YYYY-MM-DD format
      status: string;                // 'unknown' if no record, otherwise 'incomplete', 'complete', 'overridden', etc.
      attendanceStatus: string[];   // ['Present'], ['Absent'], ['Override', 'Present'], etc. (empty [] if no record)
      isWeekend?: boolean;          // true if date is a weekend (only included if true)
      isHoliday?: boolean;           // true if date is a holiday (only included if true)
    }>;
  }>;
  meta: {
    startDate: string;
    endDate: string;
    totalUsers: number;
    dateRange: string[];  // All dates in range (YYYY-MM-DD)
  };
}
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "userId": "676a65b0b06ccef51b302d3d",
      "userName": "John Doe",
      "employeeCode": "EMP001",
      "active": true,
      "attendance": [
        {
          "attendanceId": "69142f0afc88772548287702",
          "shiftDay": "2025-11-12",
          "status": "complete",
          "attendanceStatus": ["Present"]
        },
        {
          "attendanceId": null,
          "shiftDay": "2025-11-22",
          "status": "unknown",
          "attendanceStatus": [],
          "isWeekend": true
        },
        {
          "attendanceId": null,
          "shiftDay": "2025-11-23",
          "status": "unknown",
          "attendanceStatus": [],
          "isWeekend": true
        },
        {
          "attendanceId": null,
          "shiftDay": "2025-11-14",
          "status": "unknown",
          "attendanceStatus": [],
          "isHoliday": true
        }
      ]
    }
  ],
  "meta": {
    "startDate": "2025-11-01",
    "endDate": "2025-11-30",
    "totalUsers": 50,
    "dateRange": ["2025-11-01", "2025-11-02", ...]
  }
}
```

**Note**: 
- `isWeekend` is only included when `true` (weekend dates)
- `isHoliday` is only included when `true` (holiday dates)
- These keys are omitted for regular working days

**Note**: For detailed attendance information, use existing API with `attendanceId`:
- `GET /attendance/records/:attendanceId` (if exists)
- Or fetch full record by ID from attendance records endpoint

---

## Service Method Implementation

### Method: `getAdminAttendanceView()`

**Location**: `src/services/biometric-attendance.service.ts`

**Signature**:
```typescript
async getAdminAttendanceView(startDate: string, endDate: string): Promise<AdminAttendanceViewResponse>
```

**Algorithm** (Simplified):

1. **Normalize Dates**:
   ```typescript
   const start = new Date(startDate);
   start.setUTCHours(0, 0, 0, 0);
   const end = new Date(endDate);
   end.setUTCHours(23, 59, 59, 999);
   ```

2. **Generate Date Range**:
   ```typescript
   const dateRange: string[] = [];
   const currentDate = new Date(start);
   while (currentDate <= end) {
     dateRange.push(currentDate.toISOString().split('T')[0]); // YYYY-MM-DD
     currentDate.setUTCDate(currentDate.getUTCDate() + 1);
   }
   ```

3. **Get All Users** (with attendance OR active):
   ```typescript
   // Get user IDs with attendance in date range
   const usersWithAttendance = await AttendanceRecord.distinct('userId', {
     shiftDay: { $gte: start, $lte: end }
   });
   
   // Get all active users
   const activeUsers = await User.find({ active: true }).select('_id').lean();
   
   // Merge unique user IDs
   const allUserIds = new Set([
     ...usersWithAttendance.map(id => id.toString()),
     ...activeUsers.map(u => u._id.toString())
   ]);
   
   // Get full user details
   const allUsers = await User.find({
     _id: { $in: Array.from(allUserIds).map(id => new Types.ObjectId(id)) }
   }).select('_id name employeeCode active holidayCalendarId').lean();
   ```

4. **Batch Fetch Data**:
   - Attendance records (grouped by userId)
   - Shift assignments (grouped by userId)
   - Holiday calendars (for all users)

5. **For Each User & Each Date**:
   - Check if attendance record exists → get `attendanceId`, `status`, `attendanceStatus`
   - Check if date is weekend (from shift assignment) → include `weekendDays`
   - Check if date is holiday (from holiday calendar) → include `holiday` info
   - If no record and user is active → `attendanceId: null`, `status: null`, `attendanceStatus: []`

---

## Detailed Implementation Steps

### Step 1: Get Users

```typescript
// Get user IDs with attendance in date range
const attendanceUserIds = await AttendanceRecord.distinct('userId', {
  shiftDay: { $gte: start, $lte: end }
});

// Get all active users
const activeUsers = await User.find({ active: true }).select('_id').lean();

// Merge unique user IDs
const allUserIds = new Set([
  ...attendanceUserIds.map(id => id.toString()),
  ...activeUsers.map(u => u._id.toString())
]);

   // Get full user details (including holidayCalendarId for Method 1)
   const allUsers = await User.find({
     _id: { $in: Array.from(allUserIds).map(id => new Types.ObjectId(id)) }
   })
     .select('_id name employeeCode active holidayCalendarId')
     .lean();
```

### Step 2: Get Attendance Records (Batch Query)

```typescript
// Get all attendance records for all users in date range
const attendanceRecords = await AttendanceRecord.find({
  userId: { $in: Array.from(allUserIds).map(id => new Types.ObjectId(id)) },
  shiftDay: { $gte: start, $lte: end }
})
  .select('_id userId shiftDay status attendanceStatus')
  .lean();

// Create map: userId -> date -> record
const attendanceByUserAndDate = new Map<string, Map<string, any>>();
attendanceRecords.forEach(record => {
  const userId = record.userId.toString();
  const dateKey = record.shiftDay.toISOString().split('T')[0];
  
  if (!attendanceByUserAndDate.has(userId)) {
    attendanceByUserAndDate.set(userId, new Map());
  }
  attendanceByUserAndDate.get(userId)!.set(dateKey, record);
});
```

### Step 3: Get Shift Assignments (For Weekend Days Only)

```typescript
// Get shift assignments for all users in date range
const shiftAssignments = await ShiftAssignment.find({
  userId: { $in: Array.from(allUserIds).map(id => new Types.ObjectId(id)) },
  $or: [
    { startDate: { $gte: start, $lte: end } },
    { endDate: null, startDate: { $lte: end } },
    { startDate: { $lte: start }, endDate: { $gte: end } },
    { endDate: { $gte: start, $lte: end } }
  ]
})
  .select('userId startDate endDate weekendDays')
  .lean();

// Group by userId
const shiftAssignmentsByUser = new Map<string, any[]>();
shiftAssignments.forEach(sa => {
  const userId = sa.userId.toString();
  if (!shiftAssignmentsByUser.has(userId)) {
    shiftAssignmentsByUser.set(userId, []);
  }
  shiftAssignmentsByUser.get(userId)!.push(sa);
});
```

### Step 4: Get Holiday Calendars

**Important**: Holidays are assigned in TWO ways:
1. **Via `holidayCalendarId` in User model** - Direct reference to a calendar
2. **Via `assignedTo` array in HolidayCalendar** - User ID in calendar's `assignedTo` array

We need to check BOTH methods and combine holidays:

```typescript
// Get all user IDs
const allUserIdsArray = Array.from(allUserIds).map(id => new Types.ObjectId(id));

// Method 1: Get calendars via holidayCalendarId (from User model)
// Note: holidayCalendarId may be string (from .lean()) or ObjectId
const holidayCalendarIds = allUsers
  .map(u => u.holidayCalendarId)
  .filter(id => id !== null && id !== undefined)
  .map(id => new Types.ObjectId(id.toString())); // Convert to ObjectId for query

// Method 2: Get calendars via assignedTo array (user ID in calendar's assignedTo)
// This matches the approach used in checkHolidayCalendar() method

// Fetch all relevant calendars
const calendarsById = await HolidayCalendar.find({
  $or: [
    { _id: { $in: holidayCalendarIds } },  // Method 1: Direct reference
    { assignedTo: { $in: allUserIdsArray } }  // Method 2: User in assignedTo array
  ]
}).select('_id holidays assignedTo').lean();

// Create map: userId -> holidays (combining both methods)
const holidaysByUser = new Map<string, any[]>();

allUsers.forEach(user => {
  const userId = user._id.toString();
  const userHolidays: any[] = [];
  
  // Method 1: Check if user has holidayCalendarId
  if (user.holidayCalendarId) {
    const userCalendarId = user.holidayCalendarId.toString();
    const calendar = calendarsById.find(
      cal => cal._id.toString() === userCalendarId
    );
    if (calendar && calendar.holidays) {
      userHolidays.push(...calendar.holidays);
    }
  }
  
  // Method 2: Check if user is in any calendar's assignedTo array
  calendarsById.forEach(calendar => {
    if (calendar.assignedTo && calendar.assignedTo.length > 0) {
      const assignedUserIds = calendar.assignedTo.map(id => id.toString());
      if (assignedUserIds.includes(userId)) {
        if (calendar.holidays) {
          userHolidays.push(...calendar.holidays);
        }
      }
    }
  });
  
  // Remove duplicates (same date + name)
  const uniqueHolidays = Array.from(
    new Map(
      userHolidays.map(h => {
        const dateKey = new Date(h.date).toISOString().split('T')[0];
        return [`${dateKey}_${h.name}`, h];
      })
    ).values()
  );
  
  holidaysByUser.set(userId, uniqueHolidays);
});
```

### Step 5: Process Each User & Date

```typescript
const result = allUsers.map(user => {
  const userId = user._id.toString();
  const userAttendance = attendanceByUserAndDate.get(userId) || new Map();
  const userShiftAssignments = shiftAssignmentsByUser.get(userId) || [];
  const userHolidays = holidaysByUser.get(userId) || [];
  
  // Create map of holidays by date
  const holidaysByDate = new Map<string, any>();
  userHolidays.forEach(holiday => {
    const dateKey = new Date(holiday.date).toISOString().split('T')[0];
    holidaysByDate.set(dateKey, holiday);
  });
  
  // Process each date in range
  const attendance: any[] = [];
  
  dateRange.forEach(dateStr => {
    const record = userAttendance.get(dateStr);
    const holiday = holidaysByDate.get(dateStr);
    
    // Find shift assignment for this date (to get weekend days)
    const applicableAssignment = findShiftAssignmentForDate(
      new Date(dateStr),
      userShiftAssignments
    );
    
    // Check if this date is a weekend
    let isWeekend = false;
    if (applicableAssignment) {
      const dateObj = new Date(dateStr);
      const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday
      if (applicableAssignment.weekendDays.includes(dayOfWeek)) {
        isWeekend = true;
      }
    }
    
    // Build attendance entry
    const attendanceEntry: any = {
      attendanceId: record ? record._id.toString() : null,
      shiftDay: dateStr,
      status: record ? record.status : 'unknown',  // 'unknown' if no record
      attendanceStatus: record ? record.attendanceStatus : [],
    };
    
    // Add weekend flag only if it's a weekend
    if (isWeekend) {
      attendanceEntry.isWeekend = true;
    }
    
    // Add holiday flag if applicable
    if (holiday) {
      attendanceEntry.isHoliday = true;
    }
    
    // Only include if user is active OR has attendance record
    if (user.active || record) {
      attendance.push(attendanceEntry);
    }
  });
  
  return {
    userId: user._id.toString(),
    userName: user.name,
    employeeCode: user.employeeCode,
    active: user.active,
    attendance,
  };
});

// Filter out users with no attendance (inactive users only)
const filteredResult = result.filter(r => r.active || r.attendance.some(a => a.attendanceId !== null));
```

### Step 6: Helper Function - Find Shift Assignment for Date

```typescript
function findShiftAssignmentForDate(
  date: Date,
  shiftAssignments: any[]
): any | null {
  const dateStart = new Date(date);
  dateStart.setUTCHours(0, 0, 0, 0);
  
  const applicable = shiftAssignments.filter(sa => {
    const saStart = new Date(sa.startDate);
    saStart.setUTCHours(0, 0, 0, 0);
    const saEnd = sa.endDate ? new Date(sa.endDate) : null;
    if (saEnd) saEnd.setUTCHours(23, 59, 59, 999);
    
    return saStart <= dateStart && (saEnd === null || saEnd >= dateStart);
  });
  
  if (applicable.length === 0) return null;
  
  // Use most recent assignment (by startDate descending)
  applicable.sort((a, b) => 
    new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
  
  return applicable[0];
}
```

---

## Route Implementation

**File**: `src/routes/biometric-attendance.routes.ts`

```typescript
fastify.get(
  '/admin/view',
  {
    onRequest: [authenticate],
    schema: {
      tags: ['Biometric Attendance'],
      summary: 'Get admin attendance view for all users (simplified)',
      description: 'Returns simplified attendance data for all users within a date range. Includes userId, attendanceId, shiftDay, status, attendanceStatus, weekend info, and holiday info. For detailed data, use attendanceId with other endpoints.',
      querystring: {
        type: 'object',
        required: ['startDate', 'endDate'],
        properties: {
          startDate: {
            type: 'string',
            format: 'date',
            description: 'Start date in YYYY-MM-DD format'
          },
          endDate: {
            type: 'string',
            format: 'date',
            description: 'End date in YYYY-MM-DD format'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  userName: { type: 'string' },
                  employeeCode: { type: 'string' },
                  active: { type: 'boolean' },
                  attendance: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        attendanceId: { type: 'string', nullable: true },
                        shiftDay: { type: 'string' },
                        status: { type: 'string' },  // 'unknown' if no record, otherwise actual status
                        attendanceStatus: { type: 'array', items: { type: 'string' } },
                        isWeekend: { type: 'boolean' },  // Only included if true
                        isHoliday: { type: 'boolean' }   // Only included if true
                      }
                    }
                  }
                }
              }
            },
            meta: {
              type: 'object',
              properties: {
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                totalUsers: { type: 'number' },
                dateRange: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  },
  async (request, reply) => {
    try {
      const { startDate, endDate } = request.query as { startDate: string; endDate: string };
      
      const result = await request.container!.biometricAttendanceService.getAdminAttendanceView(
        startDate,
        endDate
      );
      
      return reply.send(result);
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { message: error.message }
      });
    }
  }
);
```

---

## Handling Multiple Shift Assignments

### Scenario 1: Sequential Assignments
**Example**: User has Shift A from Nov 1-15, Shift B from Nov 16-30

**Solution**: For each date, find the assignment where:
- `startDate <= date <= endDate` (or `endDate === null`)

### Scenario 2: Overlapping Assignments
**Example**: User has Shift A from Nov 1-20, Shift B from Nov 10-30 (overlaps Nov 10-20)

**Solution**: Use the **most recent assignment** (by `startDate` descending)
- Nov 1-9: Shift A
- Nov 10-30: Shift B (more recent)

### Scenario 3: No Assignment for Some Dates
**Example**: User has Shift A from Nov 1-10, no assignment Nov 11-30

**Solution**: 
- Nov 1-10: Use Shift A
- Nov 11-30: `appliedShiftAssignment: null` (no assignment)

---

## Performance Considerations

1. **Batch Queries**: Use `$in` to fetch all users, shift assignments, and attendance records in batch queries
2. **Indexes**: Ensure indexes exist on:
   - `AttendanceRecord`: `userId`, `shiftDay`
   - `ShiftAssignment`: `userId`, `startDate`, `endDate`
   - `User`: `active`
3. **Pagination**: Consider adding pagination if date range is very large
4. **Caching**: Consider caching for frequently accessed date ranges

---

## Testing Scenarios

1. **Active User with Attendance**: Should return user + records
2. **Active User without Attendance**: Should return user + emptyDates
3. **Inactive User with Attendance**: Should return user + records
4. **Inactive User without Attendance**: Should NOT return user
5. **Multiple Shift Assignments**: Should correctly map assignments to dates
6. **Overlapping Assignments**: Should use most recent
7. **No Assignment for Date**: Should return null for appliedShiftAssignment
8. **Date Range**: Should handle single day, week, month ranges

---

## Holiday Assignment Methods

**Important**: The system supports TWO ways to assign holidays to users:

1. **Method 1: Direct Reference (`holidayCalendarId` in User model)**
   - User has a direct reference to a holiday calendar
   - Used by: `PayrollService.getWorkingDaysInMonth()`
   - Query: `User.findById(userId, 'holidayCalendarId')` → `HolidayCalendar.findById(holidayCalendarId)`

2. **Method 2: Assigned To Array (`assignedTo` in HolidayCalendar model)**
   - Holiday calendar has an array of user IDs assigned to it
   - Used by: `BiometricAttendanceService.checkHolidayCalendar()`
   - Query: `HolidayCalendar.find({ assignedTo: { $in: [userId] } })`

**Implementation Note**: The `getAdminAttendanceView()` method must check BOTH methods and combine holidays from both sources, removing duplicates.

---

## Summary

### New Route
- **Method**: GET
- **Path**: `/attendance/admin/view`
- **Query Params**: `startDate`, `endDate` (YYYY-MM-DD)

### Key Features
- ✅ **Simple Response**: Only essential fields (userId, attendanceId, shiftDay, status, attendanceStatus)
- ✅ Returns all users with attendance records (active/inactive)
- ✅ Returns all active users (even without records - attendanceId: null)
- ✅ **Weekend Flag**: Includes `isWeekend: true` only for weekend dates (from shift assignment)
- ✅ **Holiday Flag**: Includes `isHoliday: true` only for holiday dates (checks BOTH assignment methods)
- ✅ **Lightweight**: Minimal data for UI display
- ✅ **Detailed Data**: Use `attendanceId` with existing endpoints for full details

### Response Fields Per Date
- `attendanceId`: Record ID (null if no record)
- `shiftDay`: Date in YYYY-MM-DD format
- `status`: Attendance status (`'unknown'` if no record, otherwise actual status like 'complete', 'incomplete', 'overridden', etc.)
- `attendanceStatus`: Array of statuses (empty array `[]` if no record)
- `isWeekend`: Boolean flag (only included if `true` - date is a weekend)
- `isHoliday`: Boolean flag (only included if `true` - date is a holiday)

### Files to Modify
1. `src/services/biometric-attendance.service.ts` - Add `getAdminAttendanceView()` method
2. `src/routes/biometric-attendance.routes.ts` - Add GET route

### Dependencies
- `User` model - For user info and `holidayCalendarId` (Method 1)
- `AttendanceRecord` model - For attendance data
- `ShiftAssignment` model - For weekend days
- `HolidayCalendar` model - For holiday info (both `holidayCalendarId` and `assignedTo` methods)

---

**Status**: 📋 **Ready for Implementation**

