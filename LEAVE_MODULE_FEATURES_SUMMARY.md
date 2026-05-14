# Leave Module Features Summary (India Only)

## ✅ All Features Implemented!

This document provides a complete overview of the newly implemented leave management features for **India employees only**.

---

## 1. Half-Day Leave Application

### Feature Description
Employees can now apply for **half-day leaves** (0.5 days) in addition to full-day leaves.

### How It Works
- **Leave Duration Options**: 
  - `full-day` (default) - Traditional multi-day leaves
  - `half-day` - 0.5 day leave on a single day
  
- **Half-Day Types**:
  - `first-half` - Morning half (before 12 PM)
  - `second-half` - Afternoon half (after 12 PM)

### API Usage
```http
POST /leaves
{
  "leaveTypeId": "...",
  "startDate": "2025-03-15",
  "endDate": "2025-03-15",  // Must be same day
  "leaveDuration": "half-day",
  "halfDayType": "first-half",  // or "second-half"
  "noOfDays": 0.5,
  "reason": "Personal work"
}
```

### Rules
- ✅ Only available for **India (IN)** employees
- ✅ `startDate` must equal `endDate` (same day)
- ✅ `halfDayType` required for half-day leaves
- ✅ `noOfDays` automatically set to 0.5
- ✅ Can't have overlapping half-days on same date with same type

---

## 2. Monthly/Quarterly Leave Release

### Feature Description
Admins can **release leaves** to employees on a **monthly** or **quarterly** (3 months) basis. This **adds** to the existing leave balance.

### How It Works

#### Monthly Release (1 month)
- Release leaves for a specific month (e.g., March 2025)
- Adds to existing balance

#### Quarterly Release (3 months)
- **Q1**: January, February, March
- **Q2**: April, May, June
- **Q3**: July, August, September
- **Q4**: October, November, December

### API Usage
```http
POST /leave-summary/release
{
  "employeeIds": ["emp1", "emp2"],
  "releaseType": "quarterly",  // or "monthly"
  "period": {
    "quarter": 1,  // 1-4 (required for quarterly)
    "year": 2025
  },
  "leaveType": "annual",
  "daysReleased": 4.5,  // Can be decimal!
  "notes": "Q1 2025 release"
}
```

### Example Scenario
1. Employee has **10 days** annual leave balance
2. Admin releases **4.5 days** for Q1 2025
3. New balance: **10 + 4.5 = 14.5 days**

### Rules
- ✅ Only for **India (IN)** employees
- ✅ Adds to existing balance (doesn't replace)
- ✅ Supports decimal values (0.5, 4.5, etc.)
- ✅ Creates audit trail
- ✅ Sends email notification to employee

### Get Release History
```http
GET /leave-summary/release-history/:userId?year=2025
```

---

## 3. Year-End Leave Carry-Forward

### Feature Description
At year-end (December), admins can **manually specify** how many days to carry forward from the previous year to the next year. Not all balance is automatically carried forward.

### How It Works
1. Admin views employee's remaining balance at end of year (e.g., 15 days in December 2024)
2. Admin enters how many days to carry forward (e.g., 10 days)
3. System carries forward only the specified amount
4. Remaining days are forfeited (e.g., 5 days lost)

### API Usage - Single Employee
```http
POST /leave-summary/carry-forward
{
  "employeeId": "emp123",
  "fromYear": 2024,
  "toYear": 2025,
  "leaveType": "annual",
  "daysCarriedForward": 10,  // Can be decimal
  "notes": "Year-end carry-forward"
}
```

### API Usage - Batch (Multiple Employees)
```http
POST /leave-summary/carry-forward/batch
{
  "employees": [
    {
      "employeeId": "emp1",
      "leaveType": "annual",
      "daysCarriedForward": 10
    },
    {
      "employeeId": "emp2",
      "leaveType": "annual",
      "daysCarriedForward": 5.5
    }
  ],
  "fromYear": 2024,
  "toYear": 2025,
  "notes": "Batch carry-forward"
}
```

### Get Available Balance for Carry-Forward
```http
GET /leave-summary/carry-forward-balance/:userId?year=2024
```
Returns remaining balance for all leave types at end of year.

### Get Carry-Forward History
```http
GET /leave-summary/carry-forward/:userId?fromYear=2024&toYear=2025
```

### Rules
- ✅ Only for **India (IN)** employees
- ✅ `toYear` must be `fromYear + 1`
- ✅ `daysCarriedForward` cannot exceed remaining balance
- ✅ Prevents duplicate processing
- ✅ Adds to next year's balance (doesn't replace)
- ✅ Tracks forfeited days
- ✅ Sends email notification

---

## Complete Example: All Features Together

### Scenario: Quarterly Release + Half-Day Leave + Carry-Forward

#### Step 1: Quarterly Release (Q1 2025)
```json
POST /leave-summary/release
{
  "employeeIds": ["emp1"],
  "releaseType": "quarterly",
  "period": { "quarter": 1, "year": 2025 },
  "leaveType": "annual",
  "daysReleased": 4.5
}
```
**Result**: Employee's annual balance becomes **10 + 4.5 = 14.5 days**

#### Step 2: Employee Applies Half-Day Leave
```json
POST /leaves
{
  "leaveTypeId": "...",
  "startDate": "2025-03-15",
  "endDate": "2025-03-15",
  "leaveDuration": "half-day",
  "halfDayType": "first-half",
  "noOfDays": 0.5
}
```
**Result**: Balance becomes **14.5 - 0.5 = 14 days**

#### Step 3: Year-End Carry-Forward (December 2025)
Employee has **15 days** remaining at end of December 2025.
```json
POST /leave-summary/carry-forward
{
  "employeeId": "emp1",
  "fromYear": 2025,
  "toYear": 2026,
  "leaveType": "annual",
  "daysCarriedForward": 10
}
```
**Result**: 
- **10 days** carried forward to 2026
- **5 days** forfeited
- 2026 annual balance starts with 10 days (plus any new allocation)

---

## Important Notes

### Country Restrictions
- ✅ **India (IN)**: All features available
- ❌ **UAE (AE)**: None of these features available

### Decimal Support
All features support decimal values:
- Half-day: 0.5 days
- Quarterly release: 4.5 days
- Carry-forward: 10.5 days

### Balance Management
- Leave releases **ADD** to existing balance
- Carry-forward **ADDS** to next year's balance
- Half-day leaves **DEDUCT** 0.5 from balance

### Audit Trail
All operations are logged:
- Leave releases are recorded in `LeaveRelease` collection
- Carry-forwards are recorded in `LeaveCarryForward` collection
- Half-day leaves are recorded in `Leave` collection with `leaveDuration` field

### Email Notifications
Employees receive email notifications for:
- Leave releases
- Carry-forward processed
- Half-day leave approved/rejected

---

## Database Collections

1. **LeaveRelease**: Stores monthly/quarterly leave releases
2. **LeaveCarryForward**: Stores year-end carry-forward records
3. **Leave**: Enhanced with `leaveDuration` and `halfDayType` fields
4. **LeaveSummary**: Handles decimal balances for all operations

---

## Testing Checklist

- [ ] Test half-day leave application (India employee)
- [ ] Test half-day leave rejection (UAE employee)
- [ ] Test monthly leave release
- [ ] Test quarterly leave release (4.5 days)
- [ ] Test carry-forward single employee
- [ ] Test carry-forward batch processing
- [ ] Test decimal balance calculations
- [ ] Test email notifications

---

*Document Version: 1.0*  
*Last Updated: January 2025*  
*Features: India (IN) employees only*

