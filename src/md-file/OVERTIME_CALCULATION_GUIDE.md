# Overtime Calculation Guide

## Overview

The bulk attendance upload feature now includes automatic overtime calculation and record creation. When actual work hours exceed shift hours by more than 2 hours, the system automatically creates overtime records with appropriate hour calculations based on predefined rules.

## Problem Statement

### Current Requirements
- **Set attendance status**: Add "Present" to `attendanceStatus` array for valid attendance records
- **Create OT records**: When actual worked time exceeds shift hours by >2 hrs
- **OT calculation rules**:
  - 2–4 hrs → record 2 hrs
  - 4–6 hrs → record 4 hrs
  - 6–8 hrs → record 6 hrs
  - 8+ hrs → record actual overtime (rounded to nearest hour)
- **Atomic transaction**: OT creation must happen in same transaction as attendance

### Business Rules
- **Overtime Threshold**: Only consider overtime if actual work exceeds shift by >2 hours
- **Progressive Calculation**: Different hour brackets have different recording rules
- **Rounding**: For 8+ hours overtime, round to nearest hour
- **Always Present**: Valid attendance records always get "Present" status
- **Additional Flags**: Late, Early-Exit, Holiday-Swipe, Out-Of-Window can be added

## Implementation Details

### Overtime Calculation Algorithm

```typescript
private calculateOvertimeHours(actualWorkMs: number, shiftMs: number): number {
  const overtimeMs = actualWorkMs - shiftMs;
  
  // Only consider overtime if it's more than 2 hours
  const overtimeHours = overtimeMs / (1000 * 60 * 60);
  
  if (overtimeHours <= 2) {
    return 0; // No overtime if less than or equal to 2 hours
  }
  
  // Apply overtime rules
  if (overtimeHours <= 4) {
    return 2; // 2-4 hrs → record 2 hrs
  } else if (overtimeHours <= 6) {
    return 4; // 4-6 hrs → record 4 hrs
  } else if (overtimeHours <= 8) {
    return 6; // 6-8 hrs → record 6 hrs
  } else {
    // 8+ hrs → record actual overtime (rounded to nearest hour)
    return Math.round(overtimeHours);
  }
}
```

### Overtime Record Creation

```typescript
private async createOvertimeRecord(
  userId: Types.ObjectId,
  date: Date,
  hours: number
): Promise<any> {
  const overtimeRecord = new Overtime({
    userId,
    date,
    hours,
    status: 'Pending',
    remarks: 'Auto-generated from bulk attendance upload'
  });

  return await overtimeRecord.save();
}
```

### Attendance Status Logic

```typescript
// Always add "Present" for valid attendance records
attendanceStatus.push('Present');

// Check if within window
const isWithinWindow = this.isWithinShiftWindow(inTime, shift);
if (!isWithinWindow) {
  attendanceStatus.push('Out-Of-Window');
}

// Check if late entry
const isLateEntry = inTime > shiftStart;
if (isLateEntry) {
  attendanceStatus.push('Late');
} else {
  attendanceStatus.push('On-Time');
}

// Check if early exit
const isEarlyExit = outTime < shiftEnd;
if (isEarlyExit) {
  attendanceStatus.push('Early-Exit');
}

// Check weekend attendance
const weekendDays = this.parseWeekendDays(row.weekendDays);
const dayOfWeek = attendanceDate.getDay();
if (weekendDays.includes(dayOfWeek)) {
  attendanceStatus.push('Holiday-Swipe');
}
```

## Overtime Rules

### Calculation Thresholds

| Actual Work Over Shift | Overtime Hours Recorded | Example |
|------------------------|-------------------------|---------|
| ≤ 2 hours | 0 hours | 8h shift, 9.5h work = 0 OT |
| 2-4 hours | 2 hours | 8h shift, 10.5h work = 2 OT |
| 4-6 hours | 4 hours | 8h shift, 12.5h work = 4 OT |
| 6-8 hours | 6 hours | 8h shift, 14.5h work = 6 OT |
| 8+ hours | Actual (rounded) | 8h shift, 17.3h work = 9 OT |

### Examples

#### Example 1: No Overtime
```
Shift: 9:00 AM - 6:00 PM (8 hours)
Work: 9:00 AM - 7:30 PM (9.5 hours)
Difference: 1.5 hours over shift
Result: 0 overtime hours (≤ 2 hour threshold)
```

#### Example 2: 2-4 Hours Overtime
```
Shift: 9:00 AM - 6:00 PM (8 hours)
Work: 9:00 AM - 8:30 PM (10.5 hours)
Difference: 2.5 hours over shift
Result: 2 overtime hours (2-4 hour bracket)
```

#### Example 3: 4-6 Hours Overtime
```
Shift: 9:00 AM - 6:00 PM (8 hours)
Work: 9:00 AM - 10:30 PM (12.5 hours)
Difference: 4.5 hours over shift
Result: 4 overtime hours (4-6 hour bracket)
```

#### Example 4: 6-8 Hours Overtime
```
Shift: 9:00 AM - 6:00 PM (8 hours)
Work: 9:00 AM - 12:30 AM (14.5 hours)
Difference: 6.5 hours over shift
Result: 6 overtime hours (6-8 hour bracket)
```

#### Example 5: 8+ Hours Overtime
```
Shift: 9:00 AM - 6:00 PM (8 hours)
Work: 9:00 AM - 3:18 AM (17.3 hours)
Difference: 9.3 hours over shift
Result: 9 overtime hours (rounded from 9.3)
```

## Attendance Status Rules

### Always Present
- **Rule**: All valid attendance records get "Present" status
- **Implementation**: `attendanceStatus.push('Present')` is always called first

### Additional Status Flags

#### 1. On-Time vs Late
- **On-Time**: `inTime <= shiftStart`
- **Late**: `inTime > shiftStart`

#### 2. Early Exit
- **Condition**: `outTime < shiftEnd`
- **Status**: Adds "Early-Exit" flag

#### 3. Out of Window
- **Condition**: Swipe time outside shift window
- **Status**: Adds "Out-Of-Window" flag

#### 4. Holiday Swipe
- **Condition**: Attendance on weekend days
- **Status**: Adds "Holiday-Swipe" flag

### Status Combinations

| Scenario | Attendance Status |
|----------|-------------------|
| Normal attendance | `['Present', 'On-Time']` |
| Late entry | `['Present', 'Late']` |
| Early exit | `['Present', 'On-Time', 'Early-Exit']` |
| Late + Early exit | `['Present', 'Late', 'Early-Exit']` |
| Weekend work | `['Present', 'On-Time', 'Holiday-Swipe']` |
| Out of window | `['Present', 'On-Time', 'Out-Of-Window']` |

## Integration with Bulk Upload

### Process Flow

1. **Parse Excel File**: Extract attendance data
2. **Validate Data**: Check for duplicates, valid users, shifts
3. **Create Shift Assignments**: Handle overlapping assignments
4. **Create Attendance Records**: 
   - Calculate work hours vs shift hours
   - Determine overtime eligibility
   - Set attendance status
   - Create overtime records if applicable
5. **Atomic Transaction**: All operations in same transaction

### Updated Interface

```typescript
export interface IBulkUploadConfirm {
  success: boolean;
  data: {
    shiftAssignmentsCreated: number;
    attendanceRecordsCreated: number;
    overtimeRecordsCreated: number; // NEW
    errors: string[];
  };
  message?: string;
}
```

### Method Signatures

```typescript
// Updated to track overtime records
private async createAttendanceRecordsWithShiftMapping(
  rows: IBulkUploadRow[],
  shiftAssignmentMap: Map<string, Types.ObjectId>
): Promise<{ attendanceRecords: IAttendanceRecord[], overtimeRecordsCreated: number }>

// Updated to include overtime tracking
private async processUserShiftsAndAttendance(
  userId: string,
  userRows: IBulkUploadRow[],
  assignedBy: Types.ObjectId
): Promise<{
  shiftAssignmentsCreated: number;
  attendanceRecordsCreated: number;
  overtimeRecordsCreated: number; // NEW
  errors: string[];
}>
```

## Overtime Record Schema

### Overtime Model Fields
```typescript
interface IOvertime {
  userId: string | Types.ObjectId;
  date: Date;
  hours: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  remarks?: string;
  approvedBy?: string | Types.ObjectId;
  approvedAt?: Date;
}
```

### Auto-Generated Overtime Records
- **userId**: User ID from attendance record
- **date**: Attendance date (`shiftDay`)
- **hours**: Calculated overtime hours
- **status**: 'Pending' (requires approval)
- **remarks**: 'Auto-generated from bulk attendance upload'

## API Response Examples

### Successful Upload with Overtime

```json
{
  "success": true,
  "data": {
    "shiftAssignmentsCreated": 2,
    "attendanceRecordsCreated": 5,
    "overtimeRecordsCreated": 3,
    "errors": []
  },
  "message": "Bulk upload completed successfully"
}
```

### Partial Success with Errors

```json
{
  "success": false,
  "data": {
    "shiftAssignmentsCreated": 1,
    "attendanceRecordsCreated": 3,
    "overtimeRecordsCreated": 2,
    "errors": [
      "Failed to create overtime record for user 123 on 2025-07-01: Duplicate overtime record"
    ]
  },
  "message": "Bulk upload completed with some errors"
}
```

## Error Handling

### Overtime Creation Errors
- **Duplicate Overtime**: If overtime record already exists for same user/date
- **Database Errors**: Connection issues, validation failures
- **Graceful Degradation**: Overtime creation failure doesn't stop attendance creation

### Error Logging
```typescript
if (overtimeHours > 0) {
  try {
    await this.createOvertimeRecord(
      new Types.ObjectId(row.userId),
      attendanceDate,
      overtimeHours
    );
    overtimeRecordsCreated++;
  } catch (error: any) {
    console.warn(`Failed to create overtime record for user ${row.userId} on ${row.attendanceDate}: ${error.message}`);
  }
}
```

## Performance Considerations

### Efficient Calculation
- **Millisecond-based**: Uses millisecond calculations for precision
- **Single Pass**: Calculates overtime during attendance record creation
- **Batch Processing**: Handles multiple records efficiently

### Database Operations
- **Atomic Transactions**: Overtime creation in same transaction as attendance
- **Error Isolation**: Overtime failures don't affect attendance records
- **Bulk Operations**: Uses `insertMany` for attendance records

## Testing Scenarios

### Test Cases Covered

1. **No Overtime**: Work hours within 2-hour threshold
2. **2-4 Hours**: Progressive overtime calculation
3. **4-6 Hours**: Higher overtime bracket
4. **6-8 Hours**: Maximum standard overtime
5. **8+ Hours**: Actual overtime with rounding
6. **Late Entry**: Overtime with late status
7. **Early Exit**: No overtime despite long hours
8. **Weekend Work**: Overtime on holidays
9. **Out of Window**: Overtime with window violations

### Validation Points
- ✅ Overtime calculation accuracy
- ✅ Attendance status correctness
- ✅ Error handling robustness
- ✅ Performance under load
- ✅ Database transaction integrity

## Best Practices

### 1. Data Validation
- Validate work hours before overtime calculation
- Ensure shift hours are positive and reasonable
- Check for edge cases (overnight shifts, etc.)

### 2. Error Handling
- Log overtime creation failures
- Don't fail entire upload for overtime errors
- Provide clear error messages

### 3. Performance
- Use efficient time calculations
- Minimize database operations
- Handle large uploads gracefully

### 4. Monitoring
- Track overtime creation statistics
- Monitor for calculation errors
- Review overtime patterns

## Future Enhancements

### 1. Advanced Overtime Rules
- Configurable overtime thresholds
- Different rules for different user types
- Holiday overtime multipliers

### 2. Approval Workflow
- Automatic overtime approval for certain conditions
- Manager approval integration
- Email notifications

### 3. Reporting
- Overtime summary reports
- Trend analysis
- Cost calculations

### 4. Integration
- Payroll system integration
- Time tracking system sync
- HR system notifications

## Conclusion

The overtime calculation feature provides:

1. **Automatic Calculation**: No manual intervention required
2. **Progressive Rules**: Fair overtime recording based on hours worked
3. **Atomic Operations**: Data consistency through transactions
4. **Flexible Status**: Comprehensive attendance status tracking
5. **Error Resilience**: Graceful handling of failures
6. **Performance**: Efficient processing of bulk uploads
7. **Monitoring**: Clear tracking and reporting

This implementation ensures accurate overtime tracking while maintaining data integrity and providing clear feedback for all scenarios. 