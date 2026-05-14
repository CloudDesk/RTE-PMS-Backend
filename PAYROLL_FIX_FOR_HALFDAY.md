# Payroll Fix for Half-Day Leaves

## 🔧 Issue Found

The `fetchApprovedLeaves()` method in `PayrollService` was using `countDocuments()` which only counts the number of leave **records**, not the actual leave **days**. This would cause incorrect payroll calculations for half-day leaves.

### Previous Code (Bug):
```typescript
const result = await Leave.countDocuments({
    employeeId,  // ❌ Wrong field name too
    status: 'Approved',
    // ...
});
return result; // Returns count of records, not days
```

### Problem:
- ❌ Half-day leave (0.5 days) would be counted as 1 day
- ❌ Multiple leaves in same month would be miscounted
- ❌ Wrong field name (`employeeId` vs `userId`)

## ✅ Fixed Code

```typescript
// Fetch approved leaves and sum up noOfDays to support half-day leaves (0.5 days)
const leaves = await Leave.find({
    userId: employeeId,  // ✅ Correct field name
    status: 'Approved',
    $or: [
        { startDate: { $gte: firstDay, $lte: lastDay } },
        { endDate: { $gte: firstDay, $lte: lastDay } },
    ],
}).select('noOfDays').lean();

// Sum all noOfDays to get total leave days (supports decimals for half-day leaves)
const totalLeaveDays = leaves.reduce((sum, leave) => sum + (leave.noOfDays || 0), 0);
return totalLeaveDays; // Returns actual days (supports 0.5, 1.5, etc.)
```

## ✅ Benefits

1. ✅ **Correct Calculation**: Now sums actual `noOfDays` instead of counting records
2. ✅ **Half-Day Support**: Correctly handles 0.5 days for half-day leaves
3. ✅ **Decimal Support**: Works with any decimal values (1.5, 2.5, etc.)
4. ✅ **Fixed Field Name**: Uses `userId` instead of `employeeId`

## 📊 Example

### Before (Bug):
- Employee has 2 full-day leaves + 1 half-day leave in March
- `countDocuments()` returns: **3** (wrong - counts records)
- Payroll calculates with 3 days (should be 2.5 days)

### After (Fixed):
- Employee has 2 full-day leaves (1 day each) + 1 half-day leave (0.5 days) in March
- `sum(noOfDays)` returns: **2.5** (correct - sums days)
- Payroll calculates with 2.5 days ✅

## ✅ Payroll Generation Status

**Now payroll will be correctly generated!** ✅

The fix ensures:
- Half-day leaves count as 0.5 days in payroll
- Full-day leaves count as 1.0 days
- Decimal leave values are properly handled
- Payable days calculation is accurate

---

*Fixed: January 2025*

