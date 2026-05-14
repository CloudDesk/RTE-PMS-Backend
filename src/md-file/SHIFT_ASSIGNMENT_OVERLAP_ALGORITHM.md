# Shift Assignment Overlap Handling Algorithm

## Overview

The enhanced bulk attendance upload feature now handles overlapping shift assignments intelligently, ensuring no date conflicts and proper attendance mapping. This document explains the algorithm and implementation details.

## Problem Statement

### Current Issues with Overlapping Shifts

1. **Date Range Overlaps**: Multiple shift assignments for the same user and shift code with overlapping date ranges
2. **Incorrect Attendance Mapping**: Attendance records not properly linked to the correct shift assignment for their date
3. **Data Integrity**: Potential for duplicate or conflicting shift assignments
4. **Multiple Users**: Processing multiple users in the same upload with different shift schedules

### Example Scenarios

#### Scenario 1: Complete Overlap
```
Existing: 1-Jan-2025 → 31-Dec-2025 (Morning Shift)
New Upload: 1-Jul-2025 → 31-Jul-2025 (Morning Shift)
Result: 
- Update existing to: 1-Jan-2025 → 30-Jun-2025 (status: past)
- Create new: 1-Jul-2025 → 31-Jul-2025 (status: current)
- Create new: 1-Aug-2025 → 31-Dec-2025 (status: current)
```

#### Scenario 2: Partial Overlap
```
Existing: 1-Jan-2025 → 31-Dec-2025 (Morning Shift)
New Upload: 1-Mar-2025 → 31-May-2025 (Morning Shift)
Result:
- Update existing to: 1-Jan-2025 → 28-Feb-2025 (status: current)
- Create new: 1-Mar-2025 → 31-May-2025 (status: current)
- Create new: 1-Jun-2025 → 31-Dec-2025 (status: current)
```

#### Scenario 3: Multiple Shifts in Same Month
```
User uploads:
- 1-10: Morning Shift
- 11-20: Noon Shift  
- 21-31: General Shift
Result: Three separate shift assignments with no overlaps
```

## Algorithm Implementation

### 1. User-Level Processing

```typescript
// Group rows by user for independent processing
const userGroups = this.groupRowsByUser(validRows);

for (const [userId, userRows] of userGroups) {
  const userResult = await this.processUserShiftsAndAttendance(
    userId,
    userRows,
    assignedBy
  );
}
```

**Benefits:**
- Each user's shifts are processed independently
- No interference between different users
- Parallel processing capability
- Clear error isolation per user

### 2. Shift Grouping by Date Range

```typescript
// Group rows by shift code and date range
const shiftGroups = this.groupRowsByShiftAndDateRange(userRows);
```

**Key**: `shiftKey = "${shiftCode}|${startDate}|${endDate || 'no-end'}"`

**Benefits:**
- Groups identical shift assignments together
- Handles multiple shifts within same month
- Prevents duplicate shift assignments
- Efficient processing of similar data

### 3. Overlap Detection and Resolution

The algorithm handles four main overlap scenarios:

#### Case 1: Complete Coverage
```
New assignment completely covers existing assignment
Action: Mark existing as 'past', create new assignment
```

#### Case 2: Start Overlap
```
New assignment overlaps with start of existing
Action: Split existing, create new, create remaining
```

#### Case 3: End Overlap
```
New assignment overlaps with end of existing
Action: Update existing end, create new assignment
```

#### Case 4: Internal Overlap
```
New assignment is completely within existing
Action: Split existing into three parts
```

### 4. Shift Assignment Mapping

```typescript
const shiftAssignmentMap = new Map<string, Types.ObjectId>();
// Key format: "startDate_endDate"
// Value: shiftAssignmentId
```

**Purpose:**
- Maps date ranges to specific shift assignment IDs
- Enables correct attendance record linking
- Handles multiple assignments per user
- Supports date-based lookup

### 5. Attendance Record Creation with Mapping

```typescript
const shiftAssignmentId = this.findShiftAssignmentForDate(
  attendanceDate,
  shiftAssignmentMap
);
```

**Algorithm:**
1. For each attendance record, find the correct shift assignment
2. Check if attendance date falls within any shift assignment range
3. Link attendance to the appropriate shift assignment ID
4. Handle edge cases (no end date, exact date matches)

## Implementation Details

### Core Methods

#### `processUserShiftsAndAttendance()`
- Processes all shifts and attendance for a single user
- Groups by shift and date range
- Handles errors per user
- Returns aggregated results

#### `handleOverlappingShiftAssignments()`
- Detects overlapping shift assignments
- Splits/updates existing assignments
- Creates new assignments as needed
- Returns mapping of date ranges to assignment IDs

#### `createAttendanceRecordsWithShiftMapping()`
- Creates attendance records with correct shift assignment mapping
- Uses date-based lookup to find correct assignment
- Handles bulk insertion for performance
- Maintains data integrity

#### `findShiftAssignmentForDate()`
- Finds the correct shift assignment for a given attendance date
- Handles date range comparisons
- Supports assignments with no end date
- Returns null if no assignment found

### Data Structures

#### Shift Assignment Map
```typescript
Map<string, Types.ObjectId>
// Key: "2025-01-01_2025-01-31" or "2025-01-01_no-end"
// Value: shiftAssignmentId
```

#### User Groups
```typescript
Map<string, IBulkUploadRow[]>
// Key: userId
// Value: array of rows for that user
```

#### Shift Groups
```typescript
Map<string, IBulkUploadRow[]>
// Key: "shiftCode|startDate|endDate"
// Value: array of rows for that shift/date combination
```

## Error Handling

### Duplicate Attendance Records
```typescript
if (error.code === 11000) {
  // Handle MongoDB duplicate key error
  // Check for userId + shiftDay + shiftCode combination
}
```

### Missing Shift Assignments
```typescript
if (!shiftAssignmentId) {
  console.warn(`No shift assignment found for attendance date ${row.attendanceDate}`);
  continue; // Skip this attendance record
}
```

### Invalid Date Ranges
```typescript
if (!parsedStartDate) {
  throw new Error('Invalid start date');
}
```

## Performance Optimizations

### 1. Batch Processing
- Process users independently
- Group similar operations together
- Use bulk database operations

### 2. Efficient Queries
- Single query to find overlapping assignments
- Sort by start date for efficient processing
- Use indexes on userId, shiftCode, startDate, endDate

### 3. Memory Management
- Process one user at a time
- Clear temporary data structures
- Use Map for O(1) lookups

### 4. Database Operations
- Bulk insert attendance records
- Minimize individual save operations
- Use transactions for data consistency

## Usage Examples

### Example 1: Single User, Multiple Shifts

```typescript
// Input rows for user "user123"
[
  { userId: "user123", shiftCode: "MORNING", startDate: "2025-01-01", endDate: "2025-01-10", attendanceDate: "2025-01-05" },
  { userId: "user123", shiftCode: "NOON", startDate: "2025-01-11", endDate: "2025-01-20", attendanceDate: "2025-01-15" },
  { userId: "user123", shiftCode: "GENERAL", startDate: "2025-01-21", endDate: "2025-01-31", attendanceDate: "2025-01-25" }
]

// Result: 3 separate shift assignments, 3 attendance records
```

### Example 2: Overlapping Shift Assignment

```typescript
// Existing: 1-Jan-2025 → 31-Dec-2025 (MORNING)
// New upload: 1-Jul-2025 → 31-Jul-2025 (MORNING)

// Result:
// 1. Update existing: 1-Jan-2025 → 30-Jun-2025 (status: past)
// 2. Create new: 1-Jul-2025 → 31-Jul-2025 (status: current)
// 3. Create new: 1-Aug-2025 → 31-Dec-2025 (status: current)
```

### Example 3: Multiple Users

```typescript
// Input rows for multiple users
[
  { userId: "user1", shiftCode: "MORNING", startDate: "2025-01-01", endDate: "2025-01-31" },
  { userId: "user2", shiftCode: "NOON", startDate: "2025-01-01", endDate: "2025-01-31" },
  { userId: "user1", shiftCode: "MORNING", startDate: "2025-02-01", endDate: "2025-02-28" }
]

// Result: Each user processed independently
// user1: 2 shift assignments
// user2: 1 shift assignment
```

## Testing Scenarios

### 1. No Overlaps
- Upload new shift assignments with no existing overlaps
- Verify new assignments created correctly
- Check attendance mapping

### 2. Complete Overlap
- Upload assignment that completely covers existing
- Verify existing marked as 'past'
- Check new assignment created with 'current' status

### 3. Partial Overlap
- Upload assignment that partially overlaps existing
- Verify existing assignment split correctly
- Check all date ranges are covered

### 4. Multiple Users
- Upload data for multiple users simultaneously
- Verify each user processed independently
- Check no cross-user interference

### 5. Edge Cases
- Upload with no end date
- Upload with exact date matches
- Upload with invalid date ranges
- Upload with missing shift codes

## Monitoring and Logging

### Key Metrics to Track
1. **Processing Time**: Time per user, total processing time
2. **Shift Assignments Created**: Number of new assignments
3. **Shift Assignments Updated**: Number of existing assignments modified
4. **Attendance Records Created**: Number of attendance records
5. **Errors**: Error count and types per user

### Logging Strategy
```typescript
console.log(`Processing user ${userId} with ${userRows.length} rows`);
console.log(`Found ${overlappingAssignments.length} overlapping assignments`);
console.log(`Created ${shiftAssignmentsCreated} new shift assignments`);
console.log(`Created ${attendanceRecordsCreated} attendance records`);
```

## Future Enhancements

### 1. Parallel Processing
- Process multiple users in parallel
- Use worker threads for large datasets
- Implement queue-based processing

### 2. Advanced Overlap Detection
- Handle complex overlap scenarios
- Support for shift changes within same day
- Handle time-based overlaps

### 3. Validation Enhancements
- Pre-upload overlap detection
- Conflict resolution suggestions
- Interactive conflict resolution

### 4. Performance Improvements
- Database connection pooling
- Caching of shift assignments
- Optimized queries for large datasets

## Conclusion

The enhanced shift assignment overlap handling algorithm provides:

1. **Data Integrity**: No overlapping shift assignments
2. **Correct Mapping**: Attendance records linked to correct assignments
3. **Scalability**: Handles multiple users and complex scenarios
4. **Performance**: Efficient processing with minimal database operations
5. **Maintainability**: Clear separation of concerns and error handling

This implementation ensures that bulk attendance uploads maintain data consistency while supporting complex organizational scenarios with multiple shift changes and overlapping date ranges. 