# Hold Salary vs Unpaid Salary - Complete Logic Explanation

## Overview

When calculating Final Settlement, the backend identifies two types of pending salaries:
1. **Hold Salaries**: Months that were processed in payroll but marked as "Hold" (not paid yet)
2. **Unpaid Salaries**: Months that were never processed in payroll at all

---

## 1. Hold Salary Logic

### Definition
**Hold Salary** = Payroll was **already processed** but payment was **withheld** (status = 'Hold')

### When Does This Happen?
- HR processed monthly payroll
- Payroll status was set to "Hold" instead of "Completed"
- Net salary was calculated but not paid to employee

### Backend Logic

**Location**: `src/services/final-settlement.service.ts` Lines 450-453

```typescript
// Step 1: Fetch all Hold Payrolls for this employee
const holdPayrolls = await Payroll.find({
    employeeId: new Types.ObjectId(employeeId),
    status: 'Hold'  // ← Key filter
}).sort({ year: 1, month: 1 });

// Step 2: Sum the net salaries
const totalHoldAmount = holdPayrolls.reduce((sum, p) => sum + p.netSalary, 0);
```

### Example Scenario

**Employee**: John Doe  
**Joining Date**: Jan 1, 2023  
**Resignation Date**: Jan 1, 2024  
**Last Working Day (LWD)**: Jan 31, 2024  

**Payroll History**:
| Month | Year | Status | Net Salary | Reason |
|-------|------|--------|------------|--------|
| Oct | 2023 | Completed | ₹45,000 | Paid ✅ |
| Nov | 2023 | **Hold** | ₹45,000 | Performance issue 🔒 |
| Dec | 2023 | **Hold** | ₹45,000 | Performance issue 🔒 |
| Jan | 2024 | (Not processed) | - | Employee left |

**Hold Salary Calculation**:
```
Hold Months: Nov 2023, Dec 2023
Total Hold Amount = ₹45,000 + ₹45,000 = ₹90,000
```

**Backend Response**:
```json
{
  "holdPayrolls": [
    {
      "payrollId": "abc123",
      "monthYear": "Nov 2023",
      "month": 11,
      "year": 2023,
      "netSalary": 45000,
      "status": "Hold"
    },
    {
      "payrollId": "def456",
      "monthYear": "Dec 2023",
      "month": 12,
      "year": 2023,
      "netSalary": 45000,
      "status": "Hold"
    }
  ],
  "totalHoldAmount": 90000,
  "finalCalculation": {
    "holdSalaries": 90000
  }
}
```

---

## 2. Unpaid Salary Logic

### Definition
**Unpaid Salary** = Payroll was **NEVER processed** for this month

### When Does This Happen?
- Employee left mid-month or before payroll processing
- Payroll was skipped for that month
- Month falls between "Last Paid Month" and "LWD"

### Backend Logic

**Location**: `src/services/final-settlement.service.ts` Lines 27-338

```typescript
// Step 1: Find Last Paid Payroll
const lastPaidPayroll = await Payroll.findOne({
    employeeId: new Types.ObjectId(employeeId),
    status: 'Completed'  // ← Only completed payrolls
}).sort({ year: -1, month: -1 });

// Step 2: Determine Start Month (Last Paid + 1)
let currentMonth = lastPaidPayroll.month + 1;
let currentYear = lastPaidPayroll.year;

// Step 3: Determine End Month (LWD month)
const lwdMonth = lwdDate.getMonth() + 1;
const lwdYear = lwdDate.getFullYear();

// Step 4: Create Hold Month Set (to skip)
const holdMonthSet = new Set(
    holdPayrolls.map(p => `${p.year}-${p.month}`)
);

// Step 5: Loop Through Months
const unpaidMonths = [];
while (currentYear < lwdYear || (currentYear === lwdYear && currentMonth <= lwdMonth)) {
    const monthKey = `${currentYear}-${currentMonth}`;
    
    // Skip if this month is in Hold Payrolls
    if (holdMonthSet.has(monthKey)) {
        currentMonth++;
        continue;
    }
    
    // Calculate salary for this unpaid month
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const isLWDMonth = (currentYear === lwdYear && currentMonth === lwdMonth);
    const maxDays = isLWDMonth ? lwdDate.getDate() : daysInMonth;
    
    // Fetch attendance, calculate payable days, prorate salary
    // ... (detailed calculation below)
    
    unpaidMonths.push({
        monthYear: `${currentYear}-${currentMonth}`,
        month: currentMonth,
        year: currentYear,
        salary: calculatedSalary
    });
    
    currentMonth++;
    if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
    }
}

// Step 6: Sum unpaid salaries
const totalUnpaidSalary = unpaidMonths.reduce((sum, m) => sum + m.salary, 0);
```

### Example Scenario

**Employee**: Jane Smith  
**Joining Date**: Jan 1, 2023  
**Resignation Date**: Jan 1, 2024  
**Last Working Day (LWD)**: Jan 31, 2024  

**Payroll History**:
| Month | Year | Status | Net Salary | Notes |
|-------|------|--------|------------|-------|
| Oct | 2023 | Completed | ₹45,000 | Last paid month ✅ |
| Nov | 2023 | (Not processed) | - | Unpaid ❌ |
| Dec | 2023 | (Not processed) | - | Unpaid ❌ |
| Jan | 2024 | (Not processed) | - | Unpaid (exit month) ❌ |

**Unpaid Salary Calculation**:

**Step 1**: Identify unpaid months
```
Last Paid Month: Oct 2023
LWD: Jan 31, 2024
Unpaid Months: Nov 2023, Dec 2023, Jan 2024
```

**Step 2**: Calculate each month's salary (with proration)

**November 2023** (Full month):
```
Days in Month: 30
Days Worked: 30
LOP Days: 0
Payable Days: 30

Monthly Gross: ₹50,000
Earned Gross = (50000 / 30) × 30 = ₹50,000

Deductions:
- PF: ₹1,800
- PT: ₹200
- TDS: ₹500

Net Salary = 50000 - 2500 = ₹47,500
```

**December 2023** (Full month):
```
Days in Month: 31
Days Worked: 31
LOP Days: 2
Payable Days: 29

Monthly Gross: ₹50,000
Earned Gross = (50000 / 31) × 29 = ₹46,774

Deductions:
- PF: ₹1,800
- PT: ₹200
- TDS: ₹500

Net Salary = 46774 - 2500 = ₹44,274
```

**January 2024** (Exit month - partial):
```
Days in Month: 31
Days Worked: 31 (LWD = 31st)
LOP Days: 5
Payable Days: 26

Monthly Gross: ₹50,000
Earned Gross = (50000 / 31) × 26 = ₹41,935

Deductions:
- PF: ₹1,800
- PT: ₹200
- TDS: ₹500

Net Salary = 41935 - 2500 = ₹39,435
```

**Total Unpaid Salary**:
```
Nov 2023: ₹47,500
Dec 2023: ₹44,274
Jan 2024: ₹39,435
Total: ₹131,209
```

**Backend Response**:
```json
{
  "unpaidMonths": [
    {
      "monthYear": "2023-11",
      "month": 11,
      "year": 2023,
      "totalDays": 30,
      "daysWorked": 30,
      "lopDays": 0,
      "payableDays": 30,
      "salary": 47500,
      "components": {
        "basic": 20000,
        "hra": 10000,
        "specialAllowance": 15000,
        "conveyance": 5000,
        "gross": 50000
      },
      "providentFund": 1800,
      "professionalTax": 200,
      "incomeTax": 500
    },
    {
      "monthYear": "2023-12",
      "month": 12,
      "year": 2023,
      "totalDays": 31,
      "daysWorked": 31,
      "lopDays": 2,
      "payableDays": 29,
      "salary": 44274,
      "components": {
        "basic": 18710,
        "hra": 9355,
        "specialAllowance": 14032,
        "conveyance": 4677,
        "gross": 46774
      },
      "providentFund": 1800,
      "professionalTax": 200,
      "incomeTax": 500
    },
    {
      "monthYear": "2024-01",
      "month": 1,
      "year": 2024,
      "totalDays": 31,
      "daysWorked": 31,
      "lopDays": 5,
      "payableDays": 26,
      "salary": 39435,
      "components": {
        "basic": 16774,
        "hra": 8387,
        "specialAllowance": 12581,
        "conveyance": 4193,
        "gross": 41935
      },
      "providentFund": 1800,
      "professionalTax": 200,
      "incomeTax": 500
    }
  ],
  "totalUnpaidSalary": 131209,
  "finalCalculation": {
    "unpaidSalaries": 131209
  }
}
```

---

## 3. Combined Example (Hold + Unpaid)

### Scenario
**Employee**: Mike Johnson  
**Joining Date**: Jan 1, 2023  
**Resignation Date**: Jan 1, 2024  
**Last Working Day (LWD)**: Feb 15, 2024  

**Payroll History**:
| Month | Year | Status | Net Salary | Type |
|-------|------|--------|------------|------|
| Oct | 2023 | Completed | ₹45,000 | Paid ✅ |
| Nov | 2023 | **Hold** | ₹45,000 | **Hold Salary** 🔒 |
| Dec | 2023 | **Hold** | ₹45,000 | **Hold Salary** 🔒 |
| Jan | 2024 | (Not processed) | - | **Unpaid Salary** ❌ |
| Feb | 2024 | (Not processed) | - | **Unpaid Salary** (partial) ❌ |

### Backend Calculation

**Step 1**: Identify Last Paid Month
```
Last Paid: Oct 2023
```

**Step 2**: Fetch Hold Payrolls
```sql
SELECT * FROM Payroll 
WHERE employeeId = 'mike123' 
AND status = 'Hold'
ORDER BY year, month;
```

**Result**:
```
Nov 2023: ₹45,000 (Hold)
Dec 2023: ₹45,000 (Hold)
Total Hold Amount: ₹90,000
```

**Step 3**: Calculate Unpaid Months
```
Loop from Nov 2023 to Feb 2024:
- Nov 2023: SKIP (in Hold Payrolls)
- Dec 2023: SKIP (in Hold Payrolls)
- Jan 2024: CALCULATE (not in Hold, not processed)
- Feb 2024: CALCULATE (not in Hold, not processed, LWD = 15th)
```

**Jan 2024 Calculation**:
```
Days in Month: 31
Days Worked: 31
LOP Days: 0
Payable Days: 31

Earned Gross = (50000 / 31) × 31 = ₹50,000
Net Salary = ₹47,500 (after deductions)
```

**Feb 2024 Calculation** (Exit month - LWD = 15th):
```
Days in Month: 29 (2024 is leap year)
Days Worked: 15 (LWD = 15th)
LOP Days: 2
Payable Days: 13

Earned Gross = (50000 / 29) × 13 = ₹22,414
Net Salary = ₹19,914 (after deductions)
```

**Final Totals**:
```
Hold Salaries:
- Nov 2023: ₹45,000
- Dec 2023: ₹45,000
Total Hold: ₹90,000

Unpaid Salaries:
- Jan 2024: ₹47,500
- Feb 2024: ₹19,914
Total Unpaid: ₹67,414

Grand Total Payable: ₹90,000 + ₹67,414 = ₹157,414
```

**Backend Response**:
```json
{
  "lastPaidMonth": "Oct 2023",
  "lastPaidMonthDate": "2023-10-01T00:00:00.000Z",
  
  "holdPayrolls": [
    {
      "payrollId": "abc123",
      "monthYear": "Nov 2023",
      "month": 11,
      "year": 2023,
      "netSalary": 45000,
      "status": "Hold"
    },
    {
      "payrollId": "def456",
      "monthYear": "Dec 2023",
      "month": 12,
      "year": 2023,
      "netSalary": 45000,
      "status": "Hold"
    }
  ],
  "totalHoldAmount": 90000,
  
  "unpaidMonths": [
    {
      "monthYear": "2024-01",
      "month": 1,
      "year": 2024,
      "salary": 47500
    },
    {
      "monthYear": "2024-02",
      "month": 2,
      "year": 2024,
      "totalDays": 29,
      "daysWorked": 15,
      "lopDays": 2,
      "payableDays": 13,
      "salary": 19914
    }
  ],
  "totalUnpaidSalary": 67414,
  
  "finalCalculation": {
    "holdSalaries": 90000,
    "unpaidSalaries": 67414,
    "totalPayable": 157414
  }
}
```

---

## 4. Key Differences Summary

| Aspect | Hold Salary | Unpaid Salary |
|--------|-------------|---------------|
| **Payroll Processed?** | ✅ Yes | ❌ No |
| **Salary Calculated?** | ✅ Yes (in payroll) | ❌ No (calculated in F&F) |
| **Deductions Applied?** | ✅ Yes (in payroll) | ✅ Yes (in F&F calculation) |
| **Database Record** | Exists in `Payroll` collection | Does NOT exist in `Payroll` |
| **Status** | `status: 'Hold'` | N/A (no record) |
| **Net Salary Source** | From `Payroll.netSalary` | Calculated fresh in F&F |
| **LOP Handling** | Already factored in payroll | Calculated from attendance |
| **Proration** | Already done in payroll | Done in F&F calculation |

---

## 5. Decision Tree

```
For each month between Last Paid and LWD:
    ↓
Does a Payroll record exist for this month?
    ↓
    YES → Check status
        ↓
        status = 'Hold' → Add to HOLD SALARIES
        status = 'Completed' → Skip (already paid)
        status = 'Draft' → Skip (not finalized)
    ↓
    NO → Add to UNPAID SALARIES
        ↓
        Calculate:
        - Fetch attendance
        - Calculate payable days
        - Prorate salary components
        - Calculate statutory deductions
        - Return net salary
```

---

## 6. Code Implementation

### Hold Salary Fetch
```typescript
// Location: Lines 450-453
const holdPayrolls = await Payroll.find({
    employeeId: new Types.ObjectId(employeeId),
    status: 'Hold'
}).sort({ year: 1, month: 1 });

const totalHoldAmount = holdPayrolls.reduce((sum, p) => sum + p.netSalary, 0);
```

### Unpaid Salary Calculation
```typescript
// Location: Lines 27-338
async function calculateUnpaidGaps(
    employeeId: string,
    leavingDate: Date,
    monthlyGross: number,
    salaryAssignment: any,
    holdPayrolls: any[]
) {
    // Step 1: Find last paid payroll
    const lastPaidPayroll = await Payroll.findOne({
        employeeId: new Types.ObjectId(employeeId),
        status: 'Completed'
    }).sort({ year: -1, month: -1 });
    
    // Step 2: Create hold month set
    const holdMonthSet = new Set(
        holdPayrolls.map(p => `${p.year}-${p.month}`)
    );
    
    // Step 3: Loop through months
    let currentMonth = lastPaidPayroll.month + 1;
    let currentYear = lastPaidPayroll.year;
    const lwdMonth = leavingDate.getMonth() + 1;
    const lwdYear = leavingDate.getFullYear();
    
    const unpaidMonths = [];
    
    while (currentYear < lwdYear || (currentYear === lwdYear && currentMonth <= lwdMonth)) {
        const monthKey = `${currentYear}-${currentMonth}`;
        
        // Skip if month is in hold payrolls
        if (holdMonthSet.has(monthKey)) {
            currentMonth++;
            if (currentMonth > 12) {
                currentMonth = 1;
                currentYear++;
            }
            continue;
        }
        
        // Calculate salary for this unpaid month
        const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
        const isLWDMonth = (currentYear === lwdYear && currentMonth === lwdMonth);
        const maxDays = isLWDMonth ? leavingDate.getDate() : daysInMonth;
        
        // Fetch attendance records
        const startDate = new Date(currentYear, currentMonth - 1, 1);
        const endDate = isLWDMonth ? leavingDate : new Date(currentYear, currentMonth - 1, daysInMonth);
        
        const attendanceRecords = await AttendanceRecord.find({
            userId: new Types.ObjectId(employeeId),
            shiftDay: { $gte: startDate, $lte: endDate }
        });
        
        // Calculate present days
        let presentDays = 0;
        for (const record of attendanceRecords) {
            if (record.attendanceStatus === 'Present') presentDays += 1;
            if (record.attendanceStatus === 'Half Day') presentDays += 0.5;
        }
        
        // Calculate payable days
        const payableDays = presentDays;
        const lopDays = maxDays - payableDays;
        
        // Prorate salary components
        const basic = (salaryAssignment.basic / daysInMonth) * payableDays;
        const hra = (salaryAssignment.hra / daysInMonth) * payableDays;
        const gross = basic + hra + /* other components */;
        
        // Calculate deductions
        const pf = Math.min(basic, 15000) * 0.12;
        const pt = calculatePT(gross, currentMonth);
        const tds = await calculateIncomeTax(currentMonth, currentYear);
        
        const netSalary = gross - pf - pt - tds;
        
        unpaidMonths.push({
            monthYear: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
            month: currentMonth,
            year: currentYear,
            totalDays: daysInMonth,
            daysWorked: maxDays,
            lopDays,
            payableDays,
            salary: Math.round(netSalary),
            components: {
                basic: Math.round(basic),
                hra: Math.round(hra),
                gross: Math.round(gross)
            },
            providentFund: Math.round(pf),
            professionalTax: Math.round(pt),
            incomeTax: Math.round(tds)
        });
        
        // Move to next month
        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
    }
    
    return unpaidMonths;
}
```

---

## 7. Frontend Display

### Hold Salaries Table
```svelte
<h3>Hold Salaries</h3>
<table>
  <thead>
    <tr>
      <th>Month</th>
      <th>Net Salary</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {#each holdPayrolls as payroll}
      <tr>
        <td>{payroll.monthYear}</td>
        <td>₹{payroll.netSalary.toLocaleString()}</td>
        <td><span class="badge-hold">Hold</span></td>
      </tr>
    {/each}
  </tbody>
  <tfoot>
    <tr>
      <td><strong>Total Hold Amount:</strong></td>
      <td><strong>₹{totalHoldAmount.toLocaleString()}</strong></td>
      <td></td>
    </tr>
  </tfoot>
</table>
```

### Unpaid Salaries Table
```svelte
<h3>Unpaid Salaries</h3>
<table>
  <thead>
    <tr>
      <th>Month</th>
      <th>Days Worked</th>
      <th>LOP Days</th>
      <th>Payable Days</th>
      <th>Gross Salary</th>
      <th>Deductions</th>
      <th>Net Salary</th>
    </tr>
  </thead>
  <tbody>
    {#each unpaidMonths as month}
      <tr>
        <td>{month.monthYear}</td>
        <td>{month.daysWorked}</td>
        <td>{month.lopDays}</td>
        <td>{month.payableDays}</td>
        <td>₹{month.components.gross.toLocaleString()}</td>
        <td>₹{(month.providentFund + month.professionalTax + month.incomeTax).toLocaleString()}</td>
        <td>₹{month.salary.toLocaleString()}</td>
      </tr>
    {/each}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="6"><strong>Total Unpaid Amount:</strong></td>
      <td><strong>₹{totalUnpaidSalary.toLocaleString()}</strong></td>
    </tr>
  </tfoot>
</table>
```

---

## 8. Testing Scenarios

### Test 1: Only Hold Salaries
```
Last Paid: Oct 2023
Hold: Nov 2023, Dec 2023
Unpaid: None
LWD: Dec 31, 2023

Expected:
- holdSalaries: ₹90,000
- unpaidSalaries: ₹0
```

### Test 2: Only Unpaid Salaries
```
Last Paid: Oct 2023
Hold: None
Unpaid: Nov 2023, Dec 2023, Jan 2024
LWD: Jan 31, 2024

Expected:
- holdSalaries: ₹0
- unpaidSalaries: ₹131,209
```

### Test 3: Mix of Hold and Unpaid
```
Last Paid: Oct 2023
Hold: Nov 2023, Dec 2023
Unpaid: Jan 2024, Feb 2024 (partial)
LWD: Feb 15, 2024

Expected:
- holdSalaries: ₹90,000
- unpaidSalaries: ₹67,414
- totalPayable: ₹157,414
```

---

## Summary

**Hold Salary**:
- Payroll exists with `status: 'Hold'`
- Net salary already calculated
- Just fetch and sum

**Unpaid Salary**:
- No payroll record exists
- Calculate from scratch using:
  - Attendance records
  - Salary structure
  - Proration logic
  - Statutory deductions

**Priority**: Hold Payrolls are checked first, unpaid months are calculated only for months NOT in hold.
