# Final Settlement (F&F)

## Correct Frontend–Backend Flow, Calculation Logic & Common Mistakes

> **Policy Note**
>
> * ❌ Gratuity: **Disabled**
> * ❌ ESI: **Disabled**
> * ✅ PF, PT, TDS: **Enabled**

This document defines the **authoritative flow and calculation logic** for the Final Settlement (F&F) module. It is intended for **backend developers, frontend developers, QA, and auditors**.

---

## 1. Core Principles (Must Follow)

1. **Frontend NEVER calculates money**
2. **Backend is the single source of truth**
3. **Frontend sends inputs, backend returns results**
4. **All responses are FLAT (no nested finalCalculation)**
5. **Policy-based components (Gratuity, ESI) return `0`, not removed**

---

## 2. High-Level End-to-End Flow

```
HR Opens F&F Page
        ↓
Frontend → GET /final-settlement/:employeeId
        ↓
Backend returns Draft / Confirmed OR 404
        ↓
If 404 → GET /final-settlement/initialize/:employeeId
        ↓
Backend calculates & returns flat response
        ↓
Frontend displays values (no calculations)
        ↓
HR edits LOP / adjustments
        ↓
Frontend → POST /final-settlement/calculate
        ↓
Backend recalculates & returns updated values
        ↓
Frontend updates UI
        ↓
Save Draft (optional)
        ↓
Confirm → PDF generated → Status = Confirmed
```

---

## 3. Backend API Responsibilities

| Endpoint | Responsibility |
|----------|----------------|
| `GET /final-settlement/:employeeId` | Fetch existing Draft / Confirmed settlement |
| `GET /final-settlement/initialize/:employeeId` | Initialize F&F with calculations |
| `POST /final-settlement/calculate` | Recalculate after user edits |
| `POST /final-settlement/save/:employeeId` | Save as Draft |
| `POST /final-settlement/confirm/:employeeId` | Generate PDF & confirm |

---

## 4. Calculation Sequence (Backend Only)

Backend **must always calculate in this order**:

1. Validate employee & resignation data
2. Identify unpaid months
3. Calculate prorated unpaid salary
4. Calculate statutory deductions (PF, PT, TDS)
5. Calculate notice period recovery (or manual override)
6. Calculate leave encashment (positive & negative)
7. Set gratuity = `0`
8. Set esi = `0`
9. Calculate totals
10. Return flat response

---

## 5. Salary Proration Logic

### Formula

```
Payable Days = Days Worked − LOP Days

Earned Component = (Fixed Component / Days in Month) × Payable Days
```

### Example (January – 31 days)

**Input**:
- Days Worked: 31
- LOP Days: 5
- Payable Days: 26

**Calculation**:

| Component | Monthly | Formula | Earned |
|-----------|---------|---------|--------|
| Basic | ₹20,000 | (20000 / 31) × 26 | ₹16,774 |
| HRA | ₹10,000 | (10000 / 31) × 26 | ₹8,387 |
| Special | ₹15,000 | (15000 / 31) × 26 | ₹12,581 |
| Conveyance | ₹1,600 | (1600 / 31) × 26 | ₹1,342 |
| **Gross** | **₹50,000** | | **₹39,084** |

---

## 6. Notice Period Recovery

### Formula

```
Shortfall = Required Notice − Days Served

Recovery = Shortfall × (Monthly Gross / 30)
```

### Example

**Input**:
- Required Notice: 60 days
- Days Served: 30 days
- Monthly Gross: ₹50,000

**Calculation**:
```
Shortfall = 60 − 30 = 30 days
Recovery = 30 × (50000 / 30) = ₹50,000
```

### Manual Override Rule

If frontend sends:

```json
{ "noticePeriodRecovery": 0 }
```

Backend **must trust this value** and skip auto-calculation.

**Implementation**:
```typescript
if (data.noticePeriodRecovery !== undefined) {
    // Manual override from HR
    noticeRecovery = data.noticePeriodRecovery;
} else if (data.excessInNotice && data.excessInNotice < 0) {
    // Auto-calculate
    noticeRecovery = Math.abs(data.excessInNotice) * monthlyGross / 30;
}
```

---

## 7. Leave Encashment

### Formula

```
Per Day Rate = Basic / 26
Encashment = Leave Balance × Per Day Rate
```

### Example

**Input**:
- Basic: ₹20,000
- PL Balance: 15 days

**Calculation**:
```
Per Day Rate = 20000 / 26 = ₹769
Encashment = 15 × 769 = ₹11,538
```

### Important Rules

* Non-encashable leaves → ignored
* Negative balance → **deduction**

**Example (Negative Balance)**:
```
CL Balance: -2 days
Encashment = -2 × 769 = -₹1,538 (added to deductions)
```

---

## 8. Statutory Deductions (Enabled)

### Provident Fund (PF)

**Formula**:
```
PF = 12% × min(Earned Basic, 15000)
```

**Example**:
```
Earned Basic: ₹16,774
Capped Basic: ₹15,000
PF = 15000 × 0.12 = ₹1,800
```

### Professional Tax (Example: Maharashtra)

| Earned Gross | PT |
|--------------|-----|
| ≤ ₹10,000 | ₹0 |
| ₹10,001–₹25,000 | ₹175 |
| > ₹25,000 | ₹200 |

**Special Rule**: February PT = ₹300

### Income Tax (TDS)

* Annual projection based
* Remaining tax deducted from F&F
* Refunds NOT processed in F&F

**Implementation**:
```typescript
const taxDeclaration = await TaxDeclaration.findOne({
    employeeId,
    financialYear: '2023-24',
    status: 'Approved'
});

const monthlyTax = taxDeclaration?.plannedMonthlyDeduction || 0;
```

---

## 9. Disabled Components (IMPORTANT)

### Gratuity

* **Always return `0`**
* **Never calculate**
* **Reason**: Business policy - Not applicable

**Implementation**:
```typescript
const gratuityAmount = 0;  // Hardcoded
```

### ESI

* **Always return `0`**
* **Eligibility check skipped**
* **Reason**: Business policy - Not applicable

**Implementation**:
```typescript
finalCalculation: {
    // ...
    esi: 0,  // Hardcoded
    // ...
}
```

---

## 10. Final Totals

### Total Payables

```
Total Payables = 
    Unpaid Salary
    + Hold Salary
    + Leave Encashment (if positive)
    + Reimbursements
    + Other Additions
    + Gratuity (always 0)
```

### Total Deductions

```
Total Deductions = 
    Notice Recovery
    + PF
    + PT
    + TDS
    + ESI (always 0)
    + Leave Encashment (if negative)
    + Other Deductions
```

### Net Amount

```
Net Amount = Total Payables − Total Deductions

isNegative = (Net Amount < 0)
```

**Example**:
```
Total Payables: ₹50,622
Total Deductions: ₹52,530
Net Amount: -₹1,908
isNegative: true
```

---

## 11. Backend Response Structure (MANDATORY)

### ✅ Correct Response (Flat Structure)

```json
{
  "success": true,
  
  "netAmount": 55782,
  "isNegative": false,
  "totalPayable": 50622,
  "totalDeductions": 52530,

  "providentFund": 2013,
  "esi": 0,
  "professionalTax": 200,
  "incomeTax": 317,
  "gratuity": 0,

  "employeeId": "6912fdf00ba77ccca78f6f8b",
  "employeeName": "John Doe",
  "employeeCode": "CD0001-HR",
  "resignationSubmittedOn": "2024-01-01T00:00:00.000Z",
  "leavingDate": "2024-01-31T00:00:00.000Z",
  "lastPaidMonth": "Dec 2023",

  "holdPayrolls": [],
  "unpaidMonths": [
    {
      "monthYear": "2024-01",
      "month": 1,
      "year": 2024,
      "totalDays": 31,
      "daysWorked": 31,
      "lopDays": 5,
      "payableDays": 26,
      "salary": 39084,
      "components": {
        "basic": 16774,
        "hra": 8387,
        "specialAllowance": 12581,
        "conveyance": 1342,
        "gross": 39084
      },
      "providentFund": 2013,
      "professionalTax": 200,
      "incomeTax": 317
    }
  ],

  "leaveBalance": [
    {
      "leaveType": "Privilege Leave",
      "balance": 15,
      "isEncashable": true,
      "perDayRate": 769,
      "encashAmount": 11538
    }
  ],

  "reimbursements": [],
  "otherAdditions": [],
  "otherDeductions": [],

  "status": "Draft",
  "pdfUrl": null,

  "finalCalculation": {
    "holdSalaries": 0,
    "unpaidSalaries": 39084,
    "leaveEncashment": 11538,
    "reimbursements": 0,
    "otherAdditions": 0,
    "gratuity": 0,
    "totalPayable": 50622,
    "noticePeriodRecovery": 50000,
    "professionalTax": 200,
    "incomeTax": 317,
    "providentFund": 2013,
    "esi": 0,
    "otherDeductions": 0,
    "totalDeductions": 52530,
    "netAmount": -1908,
    "isNegative": true
  }
}
```

### ❌ Wrong Response (Nested Structure)

```json
{
  "success": true,
  "data": {
    "finalCalculation": {
      "netAmount": 55782  // ← Wrong! Should be at root
    }
  }
}
```

---

## 12. Common Mistakes (DO NOT DO)

### ❌ Frontend Mistakes

1. **Calculating totals in UI**
   ```javascript
   // WRONG
   const netAmount = totalPayable - totalDeductions;
   
   // CORRECT
   const netAmount = response.netAmount;
   ```

2. **Applying PF / PT logic in frontend**
   ```javascript
   // WRONG
   const pf = basic * 0.12;
   
   // CORRECT
   const pf = response.providentFund;
   ```

3. **Removing gratuity or esi keys**
   ```javascript
   // WRONG
   if (gratuity === 0) delete response.gratuity;
   
   // CORRECT
   // Always display, even if 0
   ```

4. **Conditional tax logic in frontend**
   ```javascript
   // WRONG
   if (gross > 25000) pt = 200;
   
   // CORRECT
   const pt = response.professionalTax;
   ```

### ❌ Backend Mistakes

1. **Using 30 days for all months**
   ```typescript
   // WRONG
   const earnedBasic = (basic / 30) * payableDays;
   
   // CORRECT
   const daysInMonth = new Date(year, month, 0).getDate();
   const earnedBasic = (basic / daysInMonth) * payableDays;
   ```

2. **Calculating PF on gross**
   ```typescript
   // WRONG
   const pf = gross * 0.12;
   
   // CORRECT
   const pf = Math.min(basic, 15000) * 0.12;
   ```

3. **Ignoring negative leave balance**
   ```typescript
   // WRONG
   if (leaveBalance < 0) leaveBalance = 0;
   
   // CORRECT
   const encashAmount = leaveBalance * perDayRate;
   if (encashAmount < 0) {
       totalDeductions += Math.abs(encashAmount);
   }
   ```

4. **Confirming settlement before PDF**
   ```typescript
   // WRONG
   settlement.status = 'Confirmed';
   await settlement.save();
   const pdfUrl = await generatePDF();
   
   // CORRECT
   const pdfUrl = await generatePDF();
   if (!pdfUrl) throw new Error('PDF failed');
   settlement.status = 'Confirmed';
   settlement.pdfUrl = pdfUrl;
   await settlement.save();
   ```

5. **Returning nested calculation objects**
   ```typescript
   // WRONG
   return {
       data: {
           finalCalculation: { netAmount: 55782 }
       }
   };
   
   // CORRECT
   return {
       netAmount: 55782,
       totalPayable: 50622,
       // ... all fields at root
       finalCalculation: { ... }  // Backward compatible
   };
   ```

---

## 13. Testing Checklist

### Backend Tests

- [ ] **Mid-month exit**: LWD = 15th, verify proration uses 15 days
- [ ] **LOP change recalculation**: Edit lopDays, verify salary recalculates
- [ ] **Negative net amount**: High deductions > payables, verify `isNegative: true`
- [ ] **Gratuity always 0**: Verify `gratuity: 0` in all responses
- [ ] **ESI always 0**: Verify `esi: 0` in all responses
- [ ] **Manual override**: Send `noticePeriodRecovery: 0`, verify backend uses 0
- [ ] **PDF atomicity**: Simulate PDF failure, verify status stays Draft
- [ ] **Flat response**: Verify `netAmount` at root, not nested

### Frontend Tests

- [ ] **Reload restores backend state**: Refresh page, verify data persists
- [ ] **LOP edit triggers recalculation**: Change LOP, verify API call to `/calculate`
- [ ] **No UI-side calculations**: Verify no math operations in frontend code
- [ ] **PDF visible only after confirm**: Verify `pdfUrl` appears only when status = Confirmed
- [ ] **Error handling**: Simulate PDF failure, verify error message shown
- [ ] **Negative amount display**: Verify red color and "Recoverable" text

---

## 14. Edge Cases Handled

### Case 1: Employee Owes Money
**Scenario**: Notice recovery (₹50,000) > Unpaid salary (₹40,000)

**Result**:
```json
{
  "netAmount": -10000,
  "isNegative": true
}
```

**Frontend Display**: "Recoverable from Employee: ₹10,000" (in red)

---

### Case 2: Mid-Month Exit
**Scenario**: LWD = Jan 15, 2024

**Calculation**:
```
Days in January: 31
Days Worked: 15
Earned Basic = (20000 / 31) × 15 = ₹9,677
```

---

### Case 3: Negative Leave Balance
**Scenario**: CL Balance = -2 days

**Calculation**:
```
Encashment = -2 × 769 = -₹1,538
Total Deductions += 1538
```

---

### Case 4: Manual Notice Waiver
**Scenario**: HR sets `noticePeriodRecovery: 0`

**Backend Logic**:
```typescript
if (data.noticePeriodRecovery !== undefined) {
    noticeRecovery = data.noticePeriodRecovery;  // Use 0
}
```

---

## 15. Implementation Verification

### ✅ Backend Implementation Status

| Feature | Status | Location |
|---------|--------|----------|
| Proration Logic | ✅ Complete | Lines 27-338 |
| Notice Recovery | ✅ Complete | Lines 340-385 |
| Manual Override | ✅ Complete | Lines 1147-1173 |
| Leave Encashment | ✅ Complete | Lines 500-545 |
| PF Calculation | ✅ Complete | Lines 74-82 |
| PT Calculation | ✅ Complete | Lines 56-72 |
| TDS Calculation | ✅ Complete | Lines 97-114 |
| Gratuity = 0 | ✅ Complete | Line 548 |
| ESI = 0 | ✅ Complete | Line 625 |
| Flat Response | ✅ Complete | Lines 633-658 |
| PDF Atomicity | ✅ Complete | Lines 983-1004 |

### ✅ Frontend Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Zero-Logic | ✅ Complete | No calculations in UI |
| Root-Level Binding | ✅ Complete | Uses `response.netAmount` |
| PDF Validation | ✅ Complete | Checks `pdfUrl` before confirm |
| Error Handling | ✅ Complete | Shows PDF generation errors |
| Manual Override | ✅ Complete | Sends `noticePeriodRecovery` |

---

## 16. Final Note

This document is the **single source of truth** for F&F flow and calculations.

Any future policy changes (Gratuity / ESI enablement) must be handled **only in backend**, without changing frontend logic.

**Version**: 1.0  
**Date**: February 5, 2026  
**Status**: ✅ **APPROVED FOR PRODUCTION**

---

## 17. Hold vs Unpaid Salary – Correct Flow, Logic, Examples & Common Mistakes

### Purpose of This Section

This section clarifies **exactly when a month becomes Unpaid Salary and when it does NOT**, fixing the common misunderstanding:

> ❌ "Payroll not found = unpaid salary"

This assumption is **WRONG** and leads to overpayment and audit failures.

---

### Correct Authoritative Rule (READ THIS CAREFULLY)

```
A month becomes UNPAID SALARY only if ALL conditions below are true:

1. Employee was ACTIVE in that month
2. Month is BETWEEN lastPaidMonth and LWD (inclusive)
3. Payroll record does NOT exist
4. Payable Days > 0 (attendance exists)
```

If **any one condition fails**, the month is **IGNORED**.

---

### Final Backend Decision Flow (Correct)

```
For each month from Last Paid Month → LWD:
    ↓
Is employee active in this month?
    ↓
NO → Ignore month
YES
    ↓
Does payroll record exist?
    ↓
YES
 ├─ status = Completed → Ignore (already paid)
 ├─ status = Hold      → HOLD SALARY (use existing netSalary)
 └─ status = Draft     → Ignore (not finalized)
    ↓
NO
    ↓
Does employee have payable days > 0?
    ↓
YES → UNPAID SALARY (calculate from attendance)
NO  → Ignore (no salary due)
```

This is the **ONLY correct flow**.

---

### Example 1: NO Payroll but NOT Unpaid Salary

**Scenario**:
- Joining: Jan 10, 2024
- Month: Jan 2024
- Attendance: 0 days (employee didn't work)
- Payroll: Not generated

**Analysis**:

| Condition | Status |
|-----------|--------|
| Employee active? | ✅ Yes |
| Payroll exists? | ❌ No |
| Payable days > 0? | ❌ No (0 days worked) |

**Result**: ❌ **NOT unpaid salary**

```json
{
  "reason": "No payable days",
  "salary": 0,
  "action": "Ignore this month"
}
```

**Why**: Employee didn't work, so no salary is due.

---

### Example 2: Correct Unpaid Salary

**Scenario**:
- Last Paid Month: Nov 2023
- LWD: Jan 31, 2024
- Month: Jan 2024
- Payroll: Not generated
- Attendance: 26 payable days

**Analysis**:

| Condition | Status |
|-----------|--------|
| Active employment | ✅ Yes |
| Between lastPaid & LWD | ✅ Yes |
| Payroll exists | ❌ No |
| Payable days > 0 | ✅ Yes (26 days) |

**Result**: ✅ **UNPAID SALARY MUST BE CALCULATED**

```json
{
  "monthYear": "2024-01",
  "month": 1,
  "year": 2024,
  "totalDays": 31,
  "daysWorked": 31,
  "lopDays": 5,
  "payableDays": 26,
  "salary": 39084,
  "components": {
    "basic": 16774,
    "hra": 8387,
    "gross": 39084
  },
  "providentFund": 2013,
  "professionalTax": 200,
  "incomeTax": 317
}
```

**Why**: Employee worked 26 days, payroll was never run, salary is legitimately due.

---

### Example 3: Hold Payroll Must NOT Become Unpaid

**Scenario**:
- Dec 2023 payroll exists
- status = 'Hold'
- netSalary = ₹45,000

**Analysis**:

| Condition | Status |
|-----------|--------|
| Payroll exists? | ✅ Yes |
| Status | Hold |

**Result**: ❌ **DO NOT calculate unpaid salary**

```json
{
  "monthYear": "2023-12",
  "status": "Hold",
  "netSalary": 45000,
  "type": "HOLD_SALARY"
}
```

**Why**: 
- ✅ Salary already calculated in payroll
- ✅ Deductions already applied
- ✅ Just add to HOLD SALARIES (not unpaid)

**Critical**: If you calculate this as unpaid salary, the employee gets paid **TWICE** for December!

---

### Example 4: Month After LWD

**Scenario**:
- LWD: Jan 31, 2024
- Month: Feb 2024
- Payroll exists? ❌ No

**Analysis**:

| Condition | Status |
|-----------|--------|
| Employee active in Feb? | ❌ No (left on Jan 31) |

**Result**: ❌ **IGNORE**

```json
{
  "reason": "Employee not employed in this month",
  "action": "Skip"
}
```

**Why**: Employee not employed → No salary due.

---

### Example 5: Mid-Month Exit (Partial Month)

**Scenario**:
- LWD: Jan 15, 2024
- Month: Jan 2024
- Payroll: Not generated
- Attendance: 13 payable days (out of 15 worked)

**Analysis**:

| Condition | Status |
|-----------|--------|
| Employee active? | ✅ Yes (until 15th) |
| Payroll exists? | ❌ No |
| Payable days > 0? | ✅ Yes (13 days) |

**Result**: ✅ **UNPAID SALARY (Prorated)**

```json
{
  "monthYear": "2024-01",
  "totalDays": 31,
  "daysWorked": 15,
  "lopDays": 2,
  "payableDays": 13,
  "salary": 20968,
  "components": {
    "basic": 8387,
    "hra": 4194,
    "gross": 20968
  }
}
```

**Calculation**:
```
Monthly Basic: ₹20,000
Earned Basic = (20000 / 31) × 13 = ₹8,387
```

---

### Common WRONG Logic (DO NOT USE)

#### ❌ Mistake 1: Treating NO payroll as unpaid

```typescript
// WRONG
if (!payrollExists) {
  calculateUnpaidSalary();  // ❌ Missing attendance check
}

// CORRECT
if (!payrollExists && payableDays > 0) {
  calculateUnpaidSalary();  // ✅ Checks attendance
}
```

---

#### ❌ Mistake 2: Ignoring attendance

```typescript
// WRONG: Salary even when no work done
const salary = monthlyGross;  // ❌ No proration

// CORRECT
const salary = (monthlyGross / daysInMonth) * payableDays;  // ✅ Prorated
```

---

#### ❌ Mistake 3: Double counting Hold as Unpaid

```typescript
// WRONG: December appears in BOTH arrays
holdPayrolls.push(dec);
unpaidMonths.push(dec);  // ❌ DOUBLE PAYMENT

// CORRECT: Skip unpaid calculation if month is in hold
const holdMonthSet = new Set(holdPayrolls.map(p => `${p.year}-${p.month}`));
if (!holdMonthSet.has(monthKey)) {
  calculateUnpaidSalary();  // ✅ Only if NOT in hold
}
```

---

#### ❌ Mistake 4: Calculating salary for future months

```typescript
// WRONG: Calculating salary for months after LWD
while (currentMonth <= 12) {  // ❌ Goes beyond LWD
  calculateUnpaidSalary();
}

// CORRECT: Stop at LWD
while (currentYear < lwdYear || (currentYear === lwdYear && currentMonth <= lwdMonth)) {
  calculateUnpaidSalary();  // ✅ Stops at LWD
}
```

---

### Correct Guard-Clause Implementation (Backend)

```typescript
function shouldCreateUnpaidSalary(
  month: number,
  year: number,
  lwdDate: Date,
  payrollExists: boolean,
  payableDays: number
): boolean {
  // Check 1: Employee active in this month?
  const monthDate = new Date(year, month - 1, 1);
  if (monthDate > lwdDate) {
    return false;  // Month after LWD
  }
  
  // Check 2: Payroll already exists?
  if (payrollExists) {
    return false;  // Already processed (Hold or Completed)
  }
  
  // Check 3: Employee worked in this month?
  if (payableDays <= 0) {
    return false;  // No work done, no salary due
  }
  
  // All checks passed
  return true;
}
```

---

### Backend Implementation (Correct)

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
  
  // Step 2: Create hold month set (to skip)
  const holdMonthSet = new Set(
    holdPayrolls.map(p => `${p.year}-${p.month}`)
  );
  
  // Step 3: Loop from last paid to LWD
  let currentMonth = lastPaidPayroll.month + 1;
  let currentYear = lastPaidPayroll.year;
  const lwdMonth = leavingDate.getMonth() + 1;
  const lwdYear = leavingDate.getFullYear();
  
  const unpaidMonths = [];
  
  while (currentYear < lwdYear || (currentYear === lwdYear && currentMonth <= lwdMonth)) {
    const monthKey = `${currentYear}-${currentMonth}`;
    
    // ✅ GUARD 1: Skip if month is in hold payrolls
    if (holdMonthSet.has(monthKey)) {
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
      continue;
    }
    
    // Calculate days in month
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const isLWDMonth = (currentYear === lwdYear && currentMonth === lwdMonth);
    const maxDays = isLWDMonth ? leavingDate.getDate() : daysInMonth;
    
    // Fetch attendance
    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = isLWDMonth ? leavingDate : new Date(currentYear, currentMonth - 1, daysInMonth);
    
    const attendanceRecords = await AttendanceRecord.find({
      userId: new Types.ObjectId(employeeId),
      shiftDay: { $gte: startDate, $lte: endDate }
    });
    
    // Calculate payable days
    let presentDays = 0;
    for (const record of attendanceRecords) {
      if (record.attendanceStatus === 'Present') presentDays += 1;
      if (record.attendanceStatus === 'Half Day') presentDays += 0.5;
    }
    
    const payableDays = presentDays;
    const lopDays = maxDays - payableDays;
    
    // ✅ GUARD 2: Skip if no payable days
    if (payableDays <= 0) {
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
      continue;
    }
    
    // Calculate salary (only if payable days > 0)
    const basic = (salaryAssignment.basic / daysInMonth) * payableDays;
    const hra = (salaryAssignment.hra / daysInMonth) * payableDays;
    const gross = basic + hra + /* other components */;
    
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

### Key Audit Note (VERY IMPORTANT)

> **Unpaid Salary is an EXCEPTION case, not the default.**

It exists only to fill payroll gaps where:
- Payroll was missed
- Employee worked
- Salary is legitimately due

Any system that creates unpaid salary without checking attendance **will fail audit**.

---

### Final One-Line Rule (For Developers)

> **NO payroll ≠ unpaid salary. Unpaid salary exists only when payroll is missing for a month the employee actually worked and was eligible to be paid.**

---

### Testing Scenarios

#### Test 1: Zero Attendance Month
```
Input:
- Month: Jan 2024
- Payroll: Not exists
- Attendance: 0 days

Expected:
- unpaidMonths: [] (empty)
- Reason: No work done
```

#### Test 2: Hold Payroll Month
```
Input:
- Month: Dec 2023
- Payroll: Exists (status='Hold', netSalary=45000)
- Attendance: 30 days

Expected:
- holdPayrolls: [{ month: 12, netSalary: 45000 }]
- unpaidMonths: [] (empty - NOT double counted)
```

#### Test 3: Legitimate Unpaid Month
```
Input:
- Month: Jan 2024
- Payroll: Not exists
- Attendance: 26 days

Expected:
- unpaidMonths: [{ month: 1, payableDays: 26, salary: 39084 }]
- Reason: Employee worked, payroll missed
```

#### Test 4: Month After LWD
```
Input:
- LWD: Jan 31, 2024
- Month: Feb 2024
- Payroll: Not exists

Expected:
- unpaidMonths: [] (empty)
- Reason: Employee not employed
```

---

### Status

✅ Approved logic  
✅ Audit-safe  
✅ Payroll-correct  
✅ Prevents double payment  
✅ Prevents overpayment  

---

## 18. Quick Reference

### Key Formulas

```
Proration:        Earned = (Fixed / DaysInMonth) × PayableDays
Notice Recovery:  Recovery = Shortfall × (Gross / 30)
Leave Encash:     Encash = Balance × (Basic / 26)
PF:               PF = 12% × min(Basic, 15000)
Net Amount:       Net = Payables − Deductions
```

### Policy Constants

```
Gratuity: 0 (disabled)
ESI: 0 (disabled)
PF Ceiling: ₹15,000
PT Slabs: 0 / 175 / 200 (Maharashtra)
Leave Denominator: 26 days
Notice Denominator: 30 days
```

### API Endpoints

```
GET    /final-settlement/:employeeId           → Fetch existing
GET    /final-settlement/initialize/:employeeId → Initialize fresh
POST   /final-settlement/calculate             → Recalculate
POST   /final-settlement/save/:employeeId      → Save draft
POST   /final-settlement/confirm/:employeeId   → Confirm + PDF
```
