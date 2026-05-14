# Overtime Month/Year Enhancement Implementation

## Overview
Enhanced the overtime model to include `month` and `year` fields for efficient payroll calculations and queries.

## Problem Statement
- **Current Issue**: Payroll service queries overtime records using `month` and `year` fields that don't exist in the overtime model
- **Query Error**: `Overtime.findOne({ employeeId: emp._id, month: monthName, year }, 'hours')` fails because these fields are missing
- **Manual Creation**: Overtime records are created manually and through bulk attendance upload, but only have a `date` field
- **Need**: Add `month` and `year` fields to overtime model for efficient payroll queries

## Solution: Enhanced Overtime Model

### **Why This Approach?**
✅ **Efficient Queries**: Direct month/year queries for payroll calculations  
✅ **Automatic Population**: Pre-save middleware auto-populates fields from date  
✅ **Backward Compatible**: Existing records can be migrated  
✅ **Bulk Operations**: Supports both manual and bulk creation  
✅ **Indexed**: Optimized database queries with proper indexes  

## Implementation Details

### 1. Enhanced Overtime Model Schema

#### **New Fields Added**
```typescript
export interface IOvertime extends Document {
  userId: string | Types.ObjectId;
  date: Date;
  month: number; // 1-12 (not index)
  year: number;
  hours: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  remarks?: string;
  approvedBy?: string | Types.ObjectId;
  approvedAt?: Date;
}
```

#### **Schema Validation**
```typescript
month: { 
  type: Number, 
  required: true, 
  min: 1, 
  max: 12,
  validate: {
    validator: Number.isInteger,
    message: 'Month must be a whole number between 1-12',
  }
},
year: { 
  type: Number, 
  required: true,
  min: 2000,
  max: 2100,
  validate: {
    validator: Number.isInteger,
    message: 'Year must be a whole number',
  }
}
```

### 2. Automatic Field Population

#### **Pre-Save Middleware**
```typescript
overtimeSchema.pre('save', function(next) {
  if (this.date && (!this.month || !this.year)) {
    this.month = this.date.getMonth() + 1; // getMonth() returns 0-11, so add 1
    this.year = this.date.getFullYear();
  }
  next();
});
```

#### **Pre-InsertMany Middleware**
```typescript
overtimeSchema.pre('insertMany', function(next, docs) {
  if (Array.isArray(docs)) {
    docs.forEach(doc => {
      if (doc.date && (!doc.month || !doc.year)) {
        const date = new Date(doc.date);
        doc.month = date.getMonth() + 1;
        doc.year = date.getFullYear();
      }
    });
  }
  next();
});
```

### 3. Database Indexes

#### **New Index for Payroll Queries**
```typescript
overtimeSchema.index({ userId: 1, month: 1, year: 1 }); // For payroll queries
```

#### **Existing Indexes Maintained**
```typescript
overtimeSchema.index({ userId: 1, date: -1 });
overtimeSchema.index({ status: 1 });
```

### 4. Updated Payroll Service Query

#### **Before (Broken)**
```typescript
Overtime.findOne({ employeeId: emp._id, month: monthName, year }, 'hours').lean()
```

#### **After (Fixed)**
```typescript
Overtime.findOne({ userId: emp._id, month: monthNumber, year }, 'hours').lean()
```

**Key Changes:**
- `employeeId` → `userId` (correct field name)
- `month: monthName` → `month: monthNumber` (numeric month 1-12)

## Migration Strategy

### 1. Migration Script
Created `scripts/migrate-overtime-month-year.ts` to update existing records:

```typescript
// Find records missing month/year fields
const overtimeRecords = await Overtime.find({
  $or: [
    { month: { $exists: false } },
    { year: { $exists: false } }
  ]
});

// Update each record
for (const record of overtimeRecords) {
  const date = new Date(record.date);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  
  await Overtime.updateOne(
    { _id: record._id },
    { $set: { month: month, year: year } }
  );
}
```

### 2. Migration Steps
1. **Deploy Schema Changes**: Update overtime model with new fields
2. **Run Migration Script**: Execute `migrate-overtime-month-year.ts`
3. **Verify Migration**: Check that all records have month/year fields
4. **Update Payroll Service**: Deploy corrected payroll queries

## Overtime Creation Scenarios

### 1. Manual Overtime Creation
```typescript
// OvertimeService.create() - No changes needed
const overtime = new Overtime({
  userId: overtimeData.userId,
  date: overtimeData.date, // month/year auto-populated
  hours: overtimeData.hours,
  status: 'Pending'
});
```

### 2. Bulk Attendance Upload
```typescript
// BulkAttendanceUploadService.createOvertimeRecord() - No changes needed
const overtimeRecord = new Overtime({
  userId,
  date, // month/year auto-populated
  hours,
  status: 'Pending',
  remarks: 'Auto-generated from bulk attendance upload'
});
```

### 3. Direct Database Insert
```typescript
// For direct inserts, provide month/year or let middleware handle it
const overtime = new Overtime({
  userId: 'user123',
  date: new Date('2025-01-15'),
  month: 1, // Optional - will be auto-populated if missing
  year: 2025, // Optional - will be auto-populated if missing
  hours: 2
});
```

## Payroll Integration

### **Monthly Overtime Calculation**
```typescript
// PayrollService.processPayrollRecords()
const ot = await Overtime.findOne(
  { userId: emp._id, month: monthNumber, year }, 
  'hours'
).lean();

const overtimeHours = ot?.hours || 0;
```

### **Overtime Pay Calculation**
```typescript
const overtimePay = Math.round(overtimeHours * (grossSalary / (workingDays * 8)));
```

## Benefits Achieved

✅ **Fixed Payroll Queries**: Overtime records now properly queried by month/year  
✅ **Efficient Indexing**: Optimized database queries for payroll calculations  
✅ **Automatic Population**: No manual month/year calculation needed  
✅ **Backward Compatible**: Existing records can be migrated  
✅ **Bulk Operations**: Supports both manual and automated creation  
✅ **Data Integrity**: Proper validation and constraints  
✅ **Performance**: Indexed queries for fast payroll processing  

## Testing Scenarios

### Test Case 1: Manual Overtime Creation
```typescript
// Input
const overtimeData = {
  userId: 'user123',
  date: new Date('2025-01-15'),
  hours: 2
};

// Expected Output
{
  userId: 'user123',
  date: '2025-01-15T00:00:00.000Z',
  month: 1,
  year: 2025,
  hours: 2,
  status: 'Pending'
}
```

### Test Case 2: Bulk Attendance Upload
```typescript
// Input - Bulk upload creates overtime
const date = new Date('2025-03-20');
const hours = 3;

// Expected Output - Auto-populated month/year
{
  userId: 'user456',
  date: '2025-03-20T00:00:00.000Z',
  month: 3,
  year: 2025,
  hours: 3,
  status: 'Pending'
}
```

### Test Case 3: Payroll Query
```typescript
// Input
const monthNumber = 3;
const year = 2025;
const userId = 'user456';

// Query
const ot = await Overtime.findOne({ userId, month: monthNumber, year }, 'hours');

// Expected Output
{ hours: 3 }
```

## Migration Commands

### **Run Migration Script**
```bash
# Set MongoDB connection string
export MONGODB_URI="mongodb://localhost:27017/tendly-api-uae"

# Run migration
npx ts-node scripts/migrate-overtime-month-year.ts
```

### **Verify Migration**
```bash
# Check migration results
# Script will output:
# - Total records processed
# - Successfully updated count
# - Error count
# - Verification status
```

## Error Handling

### **Validation Errors**
- **Invalid Month**: Must be 1-12 (whole number)
- **Invalid Year**: Must be 2000-2100 (whole number)
- **Missing Date**: Required for auto-population

### **Migration Errors**
- **Connection Issues**: MongoDB connection failures
- **Data Corruption**: Invalid date values in existing records
- **Duplicate Updates**: Safe to run multiple times

## Future Enhancements

### 1. Overtime Analytics
```typescript
// Monthly overtime summary
const monthlyOvertime = await Overtime.aggregate([
  { $match: { userId: userId, month: month, year: year } },
  { $group: { _id: null, totalHours: { $sum: '$hours' } } }
]);
```

### 2. Overtime Reports
```typescript
// Department-wise overtime
const deptOvertime = await Overtime.aggregate([
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
  { $group: { _id: '$user.departmentId', totalHours: { $sum: '$hours' } } }
]);
```

### 3. Overtime Policies
```typescript
// Configurable overtime rules
const overtimeRules = {
  maxDailyHours: 8,
  overtimeThreshold: 2,
  weekendMultiplier: 1.5
};
```

## Monitoring and Debugging

### **Key Metrics**
- **Migration Success Rate**: Percentage of records successfully updated
- **Query Performance**: Payroll overtime query execution time
- **Data Integrity**: Records with missing month/year fields

### **Debug Commands**
```typescript
// Check overtime records for a user
const userOvertime = await Overtime.find({ userId: 'user123' });

// Verify month/year population
const recordsWithoutMonthYear = await Overtime.find({
  $or: [{ month: { $exists: false } }, { year: { $exists: false } }]
});

// Test payroll query
const payrollOvertime = await Overtime.findOne(
  { userId: 'user123', month: 3, year: 2025 }, 
  'hours'
);
```

## Conclusion

The overtime month/year enhancement successfully addresses the payroll query issues by:

- **Adding Required Fields**: `month` and `year` fields to overtime model
- **Automatic Population**: Pre-save middleware handles field population
- **Efficient Queries**: Indexed queries for fast payroll calculations
- **Backward Compatibility**: Migration script for existing records
- **Data Integrity**: Proper validation and constraints

This implementation provides a robust foundation for overtime management and payroll integration while maintaining system reliability and performance. 