# Payroll Generation - Complete Reference Documentation
## Single Source of Truth for Current Implementation

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoint](#api-endpoint)
3. [Complete Flow Diagram](#complete-flow-diagram)
4. [Data Sources & References](#data-sources--references)
5. [Calculation Details](#calculation-details)
6. [Detailed Scenarios & Examples](#detailed-scenarios--examples)
7. [Country-Specific Processing](#country-specific-processing)
8. [Impacted Entities](#impacted-entities)
9. [Status Workflow](#status-workflow)
10. [Error Handling](#error-handling)
11. [Key Considerations & Rules](#key-considerations--rules)
12. [Code References](#code-references)

---

## Overview

The Payroll Generation system (`POST /payroll/generate`) is responsible for creating monthly payroll records for employees. It calculates salaries, deductions, and net pay based on attendance, leaves, overtime, and statutory requirements.

**Key Features:**
- Bulk payroll generation for multiple employees
- Country-specific calculations (India & UAE)
- Attendance-based pro-rating
- Statutory deduction calculations (EPF, ESI, Professional Tax, Income Tax)
- Overtime pay calculations
- Leave deductions
- Automatic duplicate prevention
- Support for half-day leaves (decimal)
- Weekend attendance handling
- Restricted holiday processing

---

## API Endpoint

### `POST /payroll/generate`

**Location:** `src/routes/payroll.routes.ts` (Lines 60-164)

**Authentication:** Required (via `authenticate` middleware)

**Request Body Schema:**
```typescript
{
  monthYear: string;        // Required: Format "YYYY-MM" (e.g., "2024-03")
  userIds?: string[];        // Optional: Specific employee IDs
  filters?: {                 // Optional: Filter criteria
    departmentId?: string;
    role?: string;
    status?: string[];        // ['Active', 'On Hold', 'Resigned']
    search?: string;          // Name/email search
    country?: 'AE' | 'IN';    // Country filter
  }
}
```

**Validation Rules:**
- `monthYear` must match pattern: `^\\d{4}-\\d{2}$`
- Year must be between 2024-2100
- Either `userIds` OR `filters` must be provided (oneOf validation)
- If `filters` provided without `status`, defaults to `['Active']`

**Response:**
```typescript
{
  success: boolean;
  data: {
    totalRecords: number;
    totalActiveEmployees: number;
    totalEmployees: number;
    totalGrossSalary: number;
    totalNetSalary: number;
    totalDeductions: number;
    totalPresentDays: number;
    totalLOPDays: number;
    totalPayableDays: number;
    status: 'Draft';
  }
}
```

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. REQUEST VALIDATION                                           │
│    - Validate monthYear format (YYYY-MM)                       │
│    - Validate year range (2024-2100)                           │
│    - Validate month range (1-12)                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. USER ID RESOLUTION                                            │
│    IF userIds provided:                                          │
│      → Use provided userIds                                     │
│    ELSE IF filters provided:                                     │
│      → Call getUserIdsByFilters()                               │
│        - Query Users collection                                  │
│        - Apply filters (department, role, status, country)       │
│        - Filter by joiningDate <= monthEnd                       │
│        - Default status to ['Active'] if not provided           │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. INITIATE PAYROLL (payrollService.initiatePayroll)            │
│    a. Validate & Normalize Month                                │
│       - Convert month name to number                            │
│    b. Check Existing Payroll                                    │
│       - Query Payroll collection                                 │
│       - Filter: month, year, employeeId IN userIds              │
│       - Exclude status: 'Cancelled'                             │
│       - Remove users with existing payroll                       │
│    c. Fetch Employees & Salary Assignments                     │
│       - Query Users: _id IN filteredUserIds,                     │
│                     joiningDate < lastDayOfMonth                 │
│       - Query SalaryAssignment: employeeId IN filteredUserIds, │
│                                   effectiveFrom <= lastDay,      │
│                                   effectiveTo >= firstDay        │
│       - Populate salaryStructureId                               │
│    d. Validate Consistency                                      │
│       - Ensure all employees have salary assignments             │
│       - Throw error if any missing                               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. PROCESS PAYROLL RECORDS (Parallel Processing)                │
│    For Each Employee (Promise.all):                             │
│                                                                  │
│    a. FETCH DATA SOURCES (Parallel):                            │
│       ├─ getMonthlyAttendance()                                │
│       │   └─ AttendanceRecord collection                        │
│       ├─ fetchApprovedLeaves()                                  │
│       │   └─ Leave collection                                  │
│       ├─ Overtime.findOne()                                     │
│       │   └─ Overtime collection                               │
│       └─ getWorkingDaysInMonth()                                │
│           ├─ ShiftAssignment collection                          │
│           └─ HolidayCalendar collection                          │
│                                                                  │
│    b. CALCULATE PAYROLL RECORD                                   │
│       └─ calculatePayrollRecord()                               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. CALCULATE PAYROLL RECORD (calculatePayrollRecord)            │
│                                                                  │
│    a. ATTENDANCE CALCULATIONS                                    │
│       - LOP Days = daysInMonth - (presentDays + weekendDays +    │
│                                   holidayDays + approvedLeaves)  │
│       - Payable Days = presentDays + weekendDays +              │
│                        holidayDays + approvedLeaves              │
│       - Attendance Adjusted Gross =                              │
│         (payableDays / daysInMonth) × monthlyGross              │
│                                                                  │
│    b. EARNINGS CALCULATION                                      │
│       - Basic = (basicPercentage / 100) × attendanceAdjustedGross│
│       - HRA = (hraPercentage / 100) × attendanceAdjustedGross   │
│       - DA = (daPercentage / 100) × basic                       │
│       - Other Allowance (Country-specific)                       │
│       - Travel Allowance (Country-specific)                      │
│       - Reimbursement Allowance                                  │
│                                                                  │
│    c. DEDUCTIONS CALCULATION (calculateDeductions)             │
│       - EPF (India only)                                         │
│       - ESI (India only)                                         │
│       - Professional Tax (India only)                           │
│       - Income Tax (from TaxDeclaration)                        │
│       - Leave Deductions                                         │
│                                                                  │
│    d. ADDITIONAL PAY                                            │
│       - Overtime Pay = overtimeHours × (grossSalary /            │
│                                        (workingDays × 8))        │
│                                                                  │
│    e. NET SALARY CALCULATION                                     │
│       - Net Salary = attendanceAdjustedGross -                  │
│                      epfEmployee - incomeTax -                   │
│                      professionalTax - additionalDeduction +      │
│                      overtimePay                                 │
│                                                                  │
│    f. CTC CALCULATION (Country-specific)                        │
│       - India: Gross + Employer Contributions + Overtime        │
│       - UAE: (Monthly × 12) + Annual Allowances + Insurance      │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. BATCH INSERT & SUMMARY                                       │
│    - Insert all payroll records (Payroll.insertMany)            │
│    - Calculate summary totals (calculatePayrollSummary)          │
│    - Set status to 'Draft'                                       │
│    - Return summary with totals                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Sources & References

### 1. **Users Collection** (`users`)
**Purpose:** Employee master data

**Fields Accessed:**
- `_id` - Employee ID
- `name` - Employee name
- `departmentId` - Department reference
- `role` - Employee role
- `active` - Active status
- `country` - Country code ('IN' or 'AE')
- `joiningDate` - Date of joining
- `resignations` - Resignation records
- `holidayCalendarHistory` - Holiday calendar assignments
- `bankDetails` - Bank account information

**Queries:**
- Filter employees by department, role, status, country
- Filter by joining date (must join before payroll month)
- Get holiday calendar history for working days calculation

**Impact:** Determines which employees are eligible for payroll

---

### 2. **Payroll Collection** (`payrolls`)
**Purpose:** Store calculated payroll records

**Fields Accessed:**
- All payroll calculation fields (see Payroll Model)
- `employeeId`, `month`, `year` - For duplicate checking
- `status` - For filtering existing records

**Operations:**
- **READ:** Check for existing payroll records
- **WRITE:** Insert new payroll records (batch insert)

**Impact:** Prevents duplicate payroll generation for same month/year

---

### 3. **SalaryAssignment Collection** (`salaryassignments`)
**Purpose:** Active salary structure assignments

**Fields Accessed:**
- `employeeId` - Employee reference
- `monthlyGross` - Monthly gross salary
- `salaryStructureId` - Salary structure reference (populated)
- `effectiveFrom` - Assignment start date
- `effectiveTo` - Assignment end date
- `travelAllowance` - Fixed travel allowance (UAE)
- `airTicketAllowance` - Fixed air ticket allowance (UAE)
- `medicalAllowance` - Fixed medical allowance (UAE)
- `monthlyInsurance` - Monthly insurance (UAE)

**Query:**
```javascript
SalaryAssignment.find({
  employeeId: { $in: userIds },
  effectiveFrom: { $lte: lastDayOfMonth },
  effectiveTo: { $gte: firstDayOfMonth }
}).populate('salaryStructureId')
```

**Impact:** Provides salary structure for calculations

---

### 4. **SalaryStructure Collection** (`salarystructures`)
**Purpose:** Salary structure templates with percentages and deduction rules

**Fields Accessed (via SalaryAssignment.populate):**
- `fixedEarnings.basicPercentage` - Basic salary percentage
- `fixedEarnings.hraPercentage` - HRA percentage
- `fixedEarnings.daPercentage` - DA percentage
- `fixedEarnings.otherAllowancePercentage` - Other allowance percentage
- `fixedEarnings.travelAllowancePercentage` - Travel allowance percentage
- `fixedEarnings.reimbursementPercentage` - Reimbursement percentage
- `fixedEarnings.deductionPercentage` - Additional deduction percentage
- `statutoryDeductions.epf` - EPF rules (employee/employer %, max limit)
- `statutoryDeductions.esi` - ESI rules (employee/employer %, limit)
- `statutoryDeductions.professionalTax` - Professional tax slabs

**Impact:** Determines earnings percentages and statutory deduction rules

---

### 5. **AttendanceRecord Collection** (`attendancerecords`)
**Purpose:** Daily attendance tracking

**Fields Accessed:**
- `userId` - Employee reference
- `shiftDay` - Date of attendance
- `attendanceStatus` - Status array (Present, Late, Absent, On-Leave, etc.)
- `regularization.isRegularized` - Regularization status
- `regularization.status` - Regularization approval status
- `actualWorkHours` - Hours worked (HH:mm:ss format)
- `excessHours` - Overtime hours (HH:mm:ss format)

**Query:**
```javascript
AttendanceRecord.find({
  userId: employeeId,
  shiftDay: { $gte: firstDay, $lte: lastDay }
})
```

**Aggregation Pipeline:**
- Filters out weekend days from present days
- Counts present days (excluding weekends)
- Counts absent days
- Counts leave days
- Calculates total work hours
- Calculates excess hours

**Impact:** 
- Determines `presentDays` for attendance-adjusted gross calculation
- Used to calculate LOP (Loss of Pay) days
- **Weekend attendance excluded from present days count**

---

### 6. **Leave Collection** (`leaves`)
**Purpose:** Approved leave records

**Fields Accessed:**
- `userId` - Employee reference
- `startDate` - Leave start date
- `endDate` - Leave end date
- `status` - Leave status (must be 'Approved')
- `leaveType` - Type of leave ('annual', 'compOff')
- `noOfDays` - Number of leave days (supports decimals for half-day)

**Query:**
```javascript
Leave.find({
  userId: employeeId,
  status: 'Approved',
  leaveType: { $in: ['annual', 'compOff', 'restricted_holiday'] },
  $or: [
    // Condition 1: Leave starts within the month
    { startDate: { $gte: firstDay, $lte: lastDay } },
    // Condition 2: Leave ends within the month
    { endDate: { $gte: firstDay, $lte: lastDay } },
    // Condition 3: Leave spans entire month (starts before, ends after)
    {
      $and: [
        { startDate: { $lte: firstDay } },  // Starts before month
        { endDate: { $gte: lastDay } },      // Ends after month
      ],
    },
  ],
})
```

**Query Logic Explanation:**

The `$or` with three conditions finds **all leaves that overlap with the payroll month**:

1. **Condition 1**: Leave starts within the month
   - Example: Leave Jan 15-20, Month: January (firstDay=Jan 1, lastDay=Jan 31)
   - Checks: `startDate >= Jan 1 AND startDate <= Jan 31`
   - Result: Jan 15 is between Jan 1 and Jan 31 ✅ **MATCH**

2. **Condition 2**: Leave ends within the month
   - Example: Leave Dec 25, 2023 - Jan 10, 2024, Month: January
   - Checks: `endDate >= Jan 1 AND endDate <= Jan 31`
   - Result: Jan 10 is between Jan 1 and Jan 31 ✅ **MATCH**

3. **Condition 3**: Leave spans entire month (starts before, ends after)
   - Example: Leave Dec 20, 2023 - Feb 5, 2024, Month: January
   - Without Condition 3:
     - Condition 1: Dec 20 >= Jan 1? ❌ FALSE
     - Condition 2: Feb 5 <= Jan 31? ❌ FALSE
     - **Result**: Leave would be MISSED! ❌
   - With Condition 3:
     - Checks: `startDate <= Jan 1 AND endDate >= Jan 31`
     - Result: Dec 20 <= Jan 1 ✅ AND Feb 5 >= Jan 31 ✅ **MATCH**

**Why Condition 3 is Critical:**
- Without it, leaves that span the entire month would be **missed**
- This would cause incorrect payroll (missing leave days in calculation)
- Example: Employee takes leave Dec 20 - Feb 5, but January payroll doesn't count it → **WRONG!**

**Note:** Restricted holidays (`restricted_holiday`) are included in `approvedLeaves` when taken as leave

**Critical Fix - Multi-Month Leave Calculation:**

The query finds leaves that overlap with the month, but **does NOT use `noOfDays` directly**. Instead, it calculates the actual working days that fall within the payroll month.

**Example 1 - Multi-Month Full-Day Leave:**
- Leave: Jan 31 to Feb 2 (total `noOfDays = 3`)
- January Payroll: Calculates 1 day (Jan 31 only) ✅
- February Payroll: Calculates 2 days (Feb 1, Feb 2) ✅

**Example 2 - Half-Day Leave with Swipes (Your Scenario):**
- Jan 31: Employee swipes IN/OUT (first half) → Attendance record created with `['Present']`
- Jan 31: Half-day leave approved (second half) → Attendance record updated with `['On-Leave', 'Present']` and `halfType = 'Second Half'`
- January Payroll:
  - `presentDays`: 0.5 (from attendance record - employee worked first half) ✅
  - `approvedLeaves`: 0.5 (from leave calculation - employee took leave for second half) ✅
  - **Total: 1 day paid** (0.5 present + 0.5 leave = 1 full day) ✅

**How it works:**
1. For each leave, calculate the overlap with the month (start/end dates)
2. Count working days in the overlap (excluding weekends and mandatory holidays)
3. For half-day leaves: each working day counts as 0.5
4. Sum all leave days for the month

**Half-Day Leave Logic:**
- If employee has swipes (worked one half) + half-day leave (other half):
  - `attendanceStatus`: `['On-Leave', 'Present']`
  - `halfType`: `'First Half'` or `'Second Half'`
  - `presentDays`: 0.5 (counted in attendance aggregation)
  - `approvedLeaves`: 0.5 (counted in leave calculation)
  - **Result: 1 full day paid** ✅

**Impact:** 
- Included in `payableDays` calculation
- Reduces LOP days
- Supports decimal days (half-day leaves)
- **Correctly handles leaves spanning multiple months** (calculates partial days per month)

---

### 7. **Overtime Collection** (`overtimes`)
**Purpose:** Approved overtime hours

**Fields Accessed:**
- `userId` - Employee reference
- `month` - Month number (1-12)
- `year` - Year
- `hours` - Overtime hours (decimal)

**Query:**
```javascript
Overtime.findOne({
  userId: employeeId,
  month: monthNumber,
  year: year
}, 'hours')
```

**Impact:** 
- Used to calculate overtime pay
- Formula: `overtimeHours × (grossSalary / (workingDays × 8))`

---

### 8. **ShiftAssignment Collection** (`shiftassignments`)
**Purpose:** Employee shift schedules and weekend definitions

**Fields Accessed:**
- `userId` - Employee reference
- `startDate` - Shift start date
- `endDate` - Shift end date
- `weekendDays` - Array of weekend day numbers (0=Sunday, 6=Saturday)

**Query:**
```javascript
ShiftAssignment.find({
  userId: employeeId,
  $or: [
    { endDate: { $exists: false }, startDate: { $lte: lastDay } },
    { endDate: { $gte: firstDay }, startDate: { $lte: lastDay } }
  ]
}, 'weekendDays')
```

**Impact:** 
- Determines weekend days for the employee
- Used to exclude weekend attendance from present days
- Included in payable days calculation

---

### 9. **HolidayCalendar Collection** (`holidaycalendars`)
**Purpose:** Country-specific holiday calendars

**Fields Accessed:**
- `year` - Calendar year
- `country` - Country code
- `holidays[]` - Array of holidays
  - `date` - Holiday date
  - `type` - 'mandatory' or 'optional'
  - `name` - Holiday name

**Query:**
- Accessed via `User.holidayCalendarHistory` (year-specific calendar)
- Fetched by calendar ID from user's history

**Impact:** 
- **Holiday Assignment**: Holidays assigned per year via `User.holidayCalendarHistory` array
  - System finds active calendar for payroll year: `entry.year === year && entry.isActive === true`
  - Fetches `HolidayCalendar` by `calendarId` from history entry
- **Mandatory Holidays**: Counted in `holidayDays` ✅
  - Filtered by: `h.type === 'mandatory'` AND date falls in payroll month/year
- **Optional Holidays**: **NOT** counted in `holidayDays` ✅
  - If taken as leave: Applied as `restricted_holiday` leave type, counted in `approvedLeaves`
  - If not taken: Not counted (user works that day)
- **No Double-Counting**: Optional holidays either not counted or counted in `approvedLeaves` only

---

### 10. **TaxDeclaration Collection** (`taxdeclarations`)
**Purpose:** Employee tax declarations and monthly TDS calculations

**Fields Accessed:**
- `employeeId` - Employee reference
- `financialYear` - Financial year (e.g., "2024-2025")
- `monthlyDeductions[]` - Per-month TDS breakdown
  - `month` - Month name (e.g., "Jul")
  - `actualDeduction` - TDS amount for the month
  - `isProcessed` - Whether deduction is processed

**Query:**
```javascript
TaxDeclaration.findOne({
  employeeId: employeeId,
  financialYear: financialYear
})
```

**Impact:** 
- Provides monthly income tax (TDS) deduction
- Used in net salary calculation
- Only for India employees

---

### 11. **PayrollDeduction Collection** (`payroll_deductions`)
**Purpose:** Manual/additional deductions (if any)

**Note:** Currently not directly used in payroll generation, but available for future enhancements.

---

## Calculation Details

### 1. Attendance-Based Pro-Rating

**Key Metrics:**
- `totalDaysInMonth` - Total calendar days in the month
- `presentDays` - Days with attendance (excluding weekends, half-day leaves with swipes = 0.5)
- `weekendDays` - Weekend days in the month (always paid)
- `holidayDays` - **Mandatory holidays only** (from user's calendar for that year)
- `approvedLeaves` - Approved leave days (annual + compOff + restricted_holiday, supports decimals)
- `LOPDays` - Loss of Pay days (absent without leave)

**Formulas:**
```
payableDays = Math.min(daysInMonth, presentDays + weekendDays + holidayDays + approvedLeaves)
LOPDays = max(0, totalDaysInMonth - (presentDays + weekendDays + holidayDays + approvedLeaves))
attendanceAdjustedGross = (payableDays / totalDaysInMonth) × monthlyGross
```

**Important Notes:**
- ✅ **Payable Days Cap**: `payableDays` is capped at `daysInMonth` to prevent overpayment
- ✅ **Half-Day Leave Calculation**: Half-day leaves with swipes count as 0.5 in `presentDays`
- Weekend attendance is excluded from `presentDays` count
- Weekend days are still included in `payableDays` (paid)
- **Mandatory Holidays**: Counted in `holidayDays` (from user's calendar for that year)
- **Optional Holidays**: **NOT** counted in `holidayDays`
  - If taken as leave: Applied as `restricted_holiday`, counted in `approvedLeaves`
  - If not taken: Not counted (user works that day)
- Half-day leaves are supported (decimal `noOfDays`)
- `LOPDays` can be 0 even if calculation exceeds `daysInMonth` (due to cap)

---

### 2. Earnings Calculation

#### Basic Salary
```
basic = (basicPercentage / 100) × attendanceAdjustedGross
```

#### House Rent Allowance (HRA)
```
hra = (hraPercentage / 100) × attendanceAdjustedGross
```

#### Dearness Allowance (DA)
```
da = (daPercentage / 100) × basic
```

#### Other Allowance

**India:**
```
otherAllowance = (otherAllowancePercentage / 100) × attendanceAdjustedGross
```

**UAE:**
```
otherAllowance = attendanceAdjustedGross - (basic + hra + da + travelAllowance)
```
*Auto-calculated to ensure total equals monthly gross*

#### Travel Allowance

**India:**
```
travelAllowance = (travelAllowancePercentage / 100) × attendanceAdjustedGross
```

**UAE:**
```
travelAllowance = (payableDays / daysInMonth) × travelAllowanceFromAssignment
```
*Prorated by attendance*

#### Air Ticket Allowance (UAE Only)
```
airTicketAllowance = airTicketAllowanceFromAssignment
```
*Annual allowance, not included in monthly net salary*

#### Medical Allowance (UAE Only)
```
medicalAllowance = medicalAllowanceFromAssignment
```
*Annual allowance, not included in monthly net salary*

#### Reimbursement Allowance
```
reimbursementAllowance = (reimbursementPercentage / 100) × attendanceAdjustedGross
```

---

### 3. Deductions Calculation

#### EPF (Employee Provident Fund) - India Only

**Calculation:**
```
epfEmployee = (employeeContribution% / 100) × (basic + da)
epfEmployer = (employerContribution% / 100) × (basic + da)
```

**Capping:**
- If `basic >= maxLimit` (typically ₹15,000):
  ```
  epfEmployee = (employeeContribution% / 100) × maxLimit
  epfEmployer = (employerContribution% / 100) × maxLimit
  ```
- Example: If basic = ₹18,030 and maxLimit = ₹15,000:
  - Without cap: ₹2,163.60
  - With cap: ₹1,800 (12% of ₹15,000)

#### ESI (Employee State Insurance) - India Only

**Calculation:**
```
IF grossSalary <= applicabilityLimit:
  esiEmployee = (employeeContribution% / 100) × grossSalary
  esiEmployer = (employerContribution% / 100) × grossSalary
ELSE:
  esiEmployee = 0
  esiEmployer = 0
```

#### Professional Tax - India Only

**Calculation:**
- Based on state-specific slabs
- Monthly gross salary matched against slabs
- Returns corresponding tax amount

**Example Slabs:**
```javascript
{
  state: "Maharashtra",
  term: "Monthly",
  slabs: [
    { fromAmount: 0, toAmount: 5000, amount: 0 },
    { fromAmount: 5001, toAmount: 10000, amount: 150 },
    { fromAmount: 10001, toAmount: 15000, amount: 200 },
    // ...
  ]
}
```

#### Income Tax (TDS) - India Only

**Source:** TaxDeclaration collection

**Calculation:**
```
incomeTax = TaxDeclaration.monthlyDeductions[month].actualDeduction
```

**Note:** 
- Only applied if tax declaration exists for the financial year
- Monthly deduction distributed across the year
- Must be marked as `isProcessed: true`

#### Leave Deductions

**UAE:**
```
unpaidLeaveDays = daysInMonth - payableDays
unpaidLeaveRatio = unpaidLeaveDays / daysInMonth
leaveDeductionAmount = unpaidLeaveRatio × monthlyGross
```

**India:**
- Leave deductions handled via attendance-adjusted gross (already prorated)

#### Additional Deduction
```
additionalDeduction = (deductionPercentage / 100) × attendanceAdjustedGross
```

---

### 4. Overtime Pay Calculation

```
overtimePay = overtimeHours × (grossSalary / (workingDays × 8))
```

**Where:**
- `overtimeHours` - From Overtime collection
- `grossSalary` - Calculated gross (basic + hra + da + otherAllowance + travelAllowance + reimbursementAllowance)
- `workingDays` - Working days in the month (excluding weekends and holidays)

---

### 5. Net Salary Calculation

```
netSalary = attendanceAdjustedGross 
          - epfEmployee 
          - incomeTax 
          - professionalTax 
          - additionalDeduction 
          + overtimePay
```

**Note:** 
- UAE employees: No EPF, ESI, Professional Tax
- Leave deductions handled via attendance-adjusted gross

---

### 6. CTC (Cost to Company) Calculation

#### India
```
ctc = attendanceAdjustedGross 
    + epfEmployer 
    + esiEmployer 
    + overtimePay
```

#### UAE
```
monthlyComponents = assignedBasic + assignedHra + assignedDa 
                 + assignedOtherAllowance + travelAllowanceForAssigned

ctc = (monthlyComponents × 12) 
    + airTicketAllowanceFromAssignment 
    + medicalAllowanceFromAssignment 
    + (monthlyInsurance × 12)
```

**Note:** 
- UAE CTC includes annual allowances (air ticket, medical)
- India CTC includes employer contributions

---

## Detailed Scenarios & Examples

### Base Scenario Setup

**Given:**
- **Month:** 31 days
- **Weekends:** 10 days
- **Holidays:** 2 days (mandatory holidays)
- **Leaves Approved:** 4 days
  - Annual leave: Included
  - Restricted holiday: Included (counted as holiday, not leave)
  - Comp-off: Included

---

### Scenario 1: Standard Working Days Attendance

#### Description
**Attendance record:** User only signs in/signs out on working days only (when user comes to office, except leaves, weekends, and holidays).

#### Calculation Breakdown

**Step 1: Calculate Working Days**
```
Total Days in Month = 31
Weekends = 10 days
Mandatory Holidays = 2 days
Approved Restricted Holidays = X days (from Leave records with leaveType: 'restricted_holiday')

Working Days = 31 - 10 - 2 - approvedRestrictedHolidays
```

**Step 2: Calculate Approved Leaves**
```
Approved Leaves = Annual Leaves + Comp-off
                 = 4 days (excluding restricted holidays)
                 
Note: Restricted holidays are NOT included in approvedLeaves
      They are counted in holidayDays instead
```

**Step 3: Calculate Holiday Days**
```
Mandatory Holidays = 2 days
Approved Restricted Holidays = X days (from Leave records)
Total Holiday Days = 2 + X days
```

**Step 4: Calculate Present Days**
```
presentDays = Count of attendance records where:
  - attendanceStatus includes: 'Present', 'Late', 'On-Time', 'Early-Exit'
  - AND shiftDay is NOT a weekend day
  - AND shiftDay is NOT a holiday
  - AND attendanceStatus does NOT include 'On-Leave'
  - AND attendanceStatus does NOT include 'Absent'
  
Note: Weekend attendance is EXCLUDED from presentDays
```

**Step 5: Calculate Payable Days**
```
payableDays = presentDays 
            + weekendDays (10)
            + holidayDays (2 + approvedRestrictedHolidays)
            + approvedLeaves (4 days - restricted holidays)
```

**Step 6: Calculate LOP Days**
```
LOPDays = max(0, daysInMonth - payableDays)
        = max(0, 31 - (presentDays + 10 + holidayDays + approvedLeaves))
```

**Step 7: Calculate Attendance Adjusted Gross**
```
attendanceAdjustedGross = (payableDays / daysInMonth) × monthlyGross
                        = (payableDays / 31) × monthlyGross
```

#### Example Calculation

**Assumptions:**
- Employee worked 15 working days (presentDays = 15)
- Approved restricted holidays = 1 day
- Approved leaves (annual + comp-off) = 3 days (excluding restricted holiday)

**Calculation:**
```
Total Days = 31
Weekends = 10
Mandatory Holidays = 2
Approved Restricted Holidays = 1
Total Holiday Days = 2 + 1 = 3

Working Days = 31 - 10 - 3 = 18 days
Present Days = 15 (employee worked 15 working days)
Approved Leaves = 3 days (annual + comp-off, excluding restricted holiday)

Payable Days = 15 + 10 + 3 + 3 = 31 days
LOP Days = max(0, 31 - 31) = 0 days

Attendance Adjusted Gross = (31 / 31) × monthlyGross = 100% of monthlyGross
```

**Result:** ✅ Full salary (no LOP) because all days are accounted for.

---

### Scenario 2: Half-Day Leave

#### Description
**Attendance record:** User only signs in/signs out on working days only (when user comes to office, except leaves, weekends, and holidays). **One day has half-day leave approved.**

#### Key Difference: Decimal Leave Days
```
Half-day leave = 0.5 days (decimal supported)
```

#### Calculation Breakdown

**Step 1: Calculate Approved Leaves**
```
Approved Leaves = Annual Leaves + Comp-off + Half-day Leave
                 = (full days) + 0.5 days
                 
Example: 3 full days + 0.5 days = 3.5 days
```

**Step 2: Calculate Present Days**
```
presentDays = Count of full working days with attendance
            = Working days - full leave days - (half-day leave days × 0.5)
            
Note: Half-day leave means employee worked 0.5 days that day
      So that day contributes 0.5 to presentDays
```

**Step 3: Calculate Payable Days**
```
payableDays = presentDays 
            + weekendDays (10)
            + holidayDays (2 + approvedRestrictedHolidays)
            + approvedLeaves (includes 0.5 for half-day)
            
Example: 15.5 + 10 + 3 + 3.5 = 32 days
```

**Step 4: Calculate LOP Days**
```
LOPDays = max(0, daysInMonth - payableDays)
        = max(0, 31 - payableDays)
        
Note: LOPDays can be negative if payableDays > daysInMonth
      This happens when half-day leaves are counted
      System handles this with Math.max(0, LOPDays)
```

#### Example Calculation

**Assumptions:**
- Employee worked 15 full days + 1 half-day = 15.5 presentDays
- Approved leaves = 3 full days + 1 half-day = 3.5 days
- Approved restricted holidays = 1 day
- Total holiday days = 2 + 1 = 3

**Calculation:**
```
Present Days = 15.5 (15 full + 0.5 half-day)
Weekends = 10
Holiday Days = 3
Approved Leaves = 3.5 days

Payable Days = 15.5 + 10 + 3 + 3.5 = 32 days
LOP Days = max(0, 31 - 32) = 0 days (no negative LOP)

Attendance Adjusted Gross = (32 / 31) × monthlyGross = 103.23% of monthlyGross
```

**Result:** ✅ Employee gets slightly more than full salary due to half-day leave being counted as payable.

**Important Note:** 
- Half-day leave is counted as 0.5 days in both `presentDays` and `approvedLeaves`
- This can result in `payableDays > daysInMonth`
- System ensures `LOPDays >= 0` (no negative LOP)

---

### Scenario 3: Weekend Attendance (Swipes Recorded)

#### Description
**Attendance record:** User only signs in/signs out on working days only. **Weekends attendance are swipes so records are there.**

#### Key Point: Weekend Attendance Exclusion
```
Weekend attendance is EXCLUDED from presentDays count
BUT weekend days are STILL included in payableDays
```

#### Calculation Breakdown

**Step 1: Weekend Detection**
```
Weekend Days = Determined from ShiftAssignment.weekendDays
              Example: [0, 6] = Sunday, Saturday
              
Weekend Attendance = Attendance records on weekend days
```

**Step 2: Calculate Present Days**
```
presentDays = Count of attendance records where:
  - attendanceStatus includes: 'Present', 'Late', 'On-Time', 'Early-Exit'
  - AND shiftDay is NOT a weekend day  ← WEEKENDS EXCLUDED
  - AND shiftDay is NOT a holiday
  - AND attendanceStatus does NOT include 'On-Leave'
  
Note: Even if employee swipes on weekends, it's NOT counted in presentDays
```

**Step 3: Weekend Work Tracking**
```
weekendWorkDays = Count of weekend days with attendance
                 = Separate metric tracked but not in presentDays
```

**Step 4: Calculate Payable Days**
```
payableDays = presentDays 
            + weekendDays (10)  ← WEEKENDS INCLUDED (paid)
            + holidayDays (2 + approvedRestrictedHolidays)
            + approvedLeaves
            
Note: Weekend days are PAID even if employee doesn't swipe
      Weekend swipes are tracked separately but don't affect presentDays
```

#### Example Calculation

**Assumptions:**
- Employee worked 15 working days (presentDays = 15)
- Employee swiped on 5 weekend days (weekendWorkDays = 5)
- Total weekend days = 10
- Approved leaves = 3 days
- Approved restricted holidays = 1 day
- Total holiday days = 2 + 1 = 3

**Calculation:**
```
Present Days = 15 (weekend swipes NOT included)
Weekend Days = 10 (all weekends are paid, regardless of swipes)
Weekend Work Days = 5 (tracked separately, not in presentDays)
Holiday Days = 3
Approved Leaves = 3

Payable Days = 15 + 10 + 3 + 3 = 31 days
LOP Days = max(0, 31 - 31) = 0 days

Attendance Adjusted Gross = (31 / 31) × monthlyGross = 100% of monthlyGross
```

**Result:** ✅ 
- Weekend swipes are tracked but don't affect `presentDays`
- All weekend days are paid (included in `payableDays`)
- Employee gets full salary

**Important Notes:**
1. **Weekend attendance is excluded from `presentDays`** - This prevents double-counting
2. **Weekend days are always paid** - Included in `payableDays` regardless of swipes
3. **Weekend work is tracked separately** - `weekendWorkDays` metric for reporting
4. **Weekend swipes don't reduce LOP** - They're just recorded for attendance tracking

---

### Scenario 4: Combined Scenario (All Cases Together)

#### Description
**Complete scenario with all elements:**
- Month: 31 days
- Weekends: 10 days
- Holidays: 2 mandatory + 1 approved restricted holiday = 3 days
- Leaves: 3 full days + 1 half-day = 3.5 days (annual + comp-off)
- Working days attendance: 15 days
- Weekend swipes: 5 days

#### Complete Calculation

**Step 1: Breakdown of Days**
```
Total Days = 31
├─ Weekends = 10 days (paid, regardless of swipes)
├─ Mandatory Holidays = 2 days (paid)
├─ Approved Restricted Holidays = 1 day (paid, counted as holiday)
├─ Approved Leaves = 3.5 days (3 full + 0.5 half-day, paid)
└─ Working Days = 31 - 10 - 3 = 18 days
   ├─ Present Days = 15 days (employee worked)
   └─ Absent Days = 18 - 15 = 3 days (LOP)
```

**Step 2: Calculate Present Days**
```
presentDays = 15 days
             (Weekend swipes NOT included)
             (Half-day leave day contributes 0.5, but counted separately in leaves)
```

**Step 3: Calculate Payable Days**
```
payableDays = presentDays (15)
            + weekendDays (10)
            + holidayDays (3)
            + approvedLeaves (3.5)
            = 15 + 10 + 3 + 3.5
            = 31.5 days
```

**Step 4: Calculate LOP Days**
```
LOPDays = max(0, daysInMonth - payableDays)
        = max(0, 31 - 31.5)
        = max(0, -0.5)
        = 0 days
```

**Step 5: Calculate Attendance Adjusted Gross**
```
attendanceAdjustedGross = (payableDays / daysInMonth) × monthlyGross
                        = (31.5 / 31) × monthlyGross
                        = 101.61% × monthlyGross
```

#### Result Summary

| Metric | Value | Notes |
|--------|-------|-------|
| Total Days | 31 | Calendar days |
| Weekends | 10 | Paid, swipes tracked separately |
| Holidays | 3 | 2 mandatory + 1 restricted |
| Approved Leaves | 3.5 | 3 full + 0.5 half-day |
| Present Days | 15 | Working days with attendance |
| Weekend Work Days | 5 | Tracked separately |
| Payable Days | 31.5 | All paid days |
| LOP Days | 0 | No loss of pay |
| Attendance Adjusted Gross | 101.61% | Slightly more due to half-day |

---

## Country-Specific Processing

### India (IN)

**Statutory Deductions:**
- ✅ EPF (Employee + Employer)
- ✅ ESI (Employee + Employer)
- ✅ Professional Tax
- ✅ Income Tax (TDS)

**Allowances:**
- Percentage-based from salary structure
- Travel allowance from percentage
- No air ticket or medical allowance in monthly salary

**CTC:**
- Includes employer contributions (EPF, ESI)

---

### UAE (AE)

**Statutory Deductions:**
- ❌ No EPF
- ❌ No ESI
- ❌ No Professional Tax
- ❌ No Income Tax (unless manually configured)

**Allowances:**
- Fixed amounts from salary assignment
- Travel allowance (prorated by attendance)
- Air ticket allowance (annual, not in monthly)
- Medical allowance (annual, not in monthly)
- Other allowance auto-calculated

**CTC:**
- Annualized monthly components
- Includes annual allowances (air ticket, medical)
- Includes insurance (annualized)

**Leave Deductions:**
- Direct deduction for unpaid leave days
- Formula: `(unpaidDays / daysInMonth) × monthlyGross`

---

## Impacted Entities

### 1. **Payroll Collection**
**Operation:** INSERT (Batch)
**Impact:** New payroll records created with status 'Draft'

**Fields Set:**
- All calculation fields (earnings, deductions, net salary, CTC)
- Attendance metrics (presentDays, LOPDays, payableDays)
- Status: 'Draft'
- Timestamps: processedAt
- Country code

---

### 2. **Users Collection**
**Operation:** READ
**Impact:** No direct modification, but used for:
- Employee filtering
- Holiday calendar lookup
- Country determination

---

### 3. **SalaryAssignment Collection**
**Operation:** READ
**Impact:** No modification, but validates:
- Active assignments exist for all employees
- Effective date ranges cover payroll month

---

### 4. **AttendanceRecord Collection**
**Operation:** READ (Aggregation)
**Impact:** No modification, but used for:
- Present days calculation
- LOP days calculation
- Work hours tracking

---

### 5. **Leave Collection**
**Operation:** READ
**Impact:** No modification, but used for:
- Approved leave days count
- Payable days calculation

---

### 6. **Overtime Collection**
**Operation:** READ
**Impact:** No modification, but used for:
- Overtime pay calculation

---

### 7. **TaxDeclaration Collection**
**Operation:** READ
**Impact:** No modification, but used for:
- Income tax (TDS) deduction (India only)

---

## Status Workflow

### Payroll Statuses

1. **Draft** (Initial)
   - Payroll generated but not reviewed
   - Can be edited/deleted
   - Transitions to: `PendingApproval`, `Cancelled`

2. **PendingApproval**
   - Awaiting admin review
   - Transitions to: `InPayment`, `Cancelled`

3. **InPayment**
   - Exported to payment system
   - Transitions to: `Completed`, `Failed`

4. **Completed**
   - Payment successful
   - UTR number recorded
   - Final state (no transitions)

5. **Failed**
   - Payment failed
   - Failure reason recorded
   - Transitions to: `Completed`, `Failed` (retry)

6. **RetryPending**
   - Failed payment queued for retry
   - Transitions to: `InPayment`, `Cancelled`

7. **Cancelled**
   - Payroll cancelled
   - Final state (no transitions)

### Status Transition Rules

```typescript
{
  Draft: [PendingApproval, Cancelled],
  PendingApproval: [InPayment, Cancelled],
  InPayment: [Completed, Failed],
  Completed: [],
  Failed: [Completed, Failed],
  RetryPending: [InPayment, Cancelled],
  Cancelled: []
}
```

---

## Error Handling

### Common Errors

1. **Invalid monthYear format**
   - Error: "Invalid monthYear format or range."
   - Status: 400

2. **No employees found**
   - Error: "No employees found for processing payroll."
   - Status: 404

3. **Payroll already exists**
   - Error: "Payroll for {month} {year} already exists for all provided users"
   - Status: 400

4. **Missing salary assignments**
   - Error: "Missing active salary assignments for employees with IDs: ..."
   - Status: 400

5. **No eligible employees**
   - Error: "No eligible employees found for payroll processing"
   - Status: 400

6. **Invalid salary structure**
   - Error: "Invalid salary structure for employee {name}: Other Allowance would be negative"
   - Status: 400

### Validation Checks

1. ✅ Month/Year range validation
2. ✅ Employee existence check
3. ✅ Duplicate payroll prevention
4. ✅ Salary assignment validation
5. ✅ Salary structure validation (country-specific)
6. ✅ Negative allowance prevention

---

## Key Considerations & Rules

### 1. **Duplicate Prevention**
- System automatically skips employees with existing payroll for the month/year
- Only non-cancelled payrolls are considered duplicates
- Users with existing payroll are filtered out before processing

### 2. **Joining Date Filter**
- Only employees who joined before or during the payroll month are included
- Query: `joiningDate < lastDayOfMonth`

### 3. **Effective Date Range**
- Salary assignments must be effective during the payroll month
- Query: `effectiveFrom <= lastDay AND effectiveTo >= firstDay`

### 4. **Weekend Handling**
- **Weekend attendance is excluded from `presentDays`** - This prevents double-counting
- **Weekend days are always paid** - Included in `payableDays` regardless of swipes
- **Weekend work is tracked separately** - `weekendWorkDays` metric for reporting
- **Weekend swipes don't reduce LOP** - They're just recorded for attendance tracking

### 5. **Holiday Handling**
- **Holiday Assignment**: Holidays assigned per year via `User.holidayCalendarHistory` array
  - System finds active calendar for payroll year: `entry.year === year && entry.isActive === true`
  - Fetches `HolidayCalendar` by `calendarId` from history entry
- **Mandatory holidays:** Counted in `holidayDays` ✅ (from user's calendar for that year)
- **Optional holidays (restricted holidays):** **NOT** counted in `holidayDays` ✅
  - If taken as leave: Applied as `restricted_holiday` leave type, counted in `approvedLeaves`
  - If not taken: Not counted (user works that day)
- **No Double-Counting**: Optional holidays either not counted or counted in `approvedLeaves` only

### 6. **Leave Types Included**
- ✅ Annual leave (`annual`)
- ✅ Comp-off (`compOff`)
- ❌ Restricted holidays (handled separately in `holidayDays`)
- ❌ Other leave types (not included in payable days)

### 7. **Present Days Calculation Rules**
- ✅ Includes: Working days with attendance (Present, Late, On-Time, Early-Exit)
- ❌ Excludes: Weekend days (even if swiped)
- ❌ Excludes: Holiday days
- ❌ Excludes: Leave days
- ❌ Excludes: Absent days

### 8. **Payable Days Calculation**
```
payableDays = Math.min(daysInMonth, 
    presentDays 
    + weekendDays (always paid)
    + holidayDays (mandatory holidays only)
    + approvedLeaves (annual + compOff + restricted_holiday, supports decimals)
)
```
**Note**: 
- `holidayDays` = Mandatory holidays only (from user's calendar for that year)
- `approvedLeaves` = Annual + compOff + restricted_holiday (optional holidays taken as leave)
- Cap applied to prevent overpayment

### 9. **LOP Days Calculation**
```
LOPDays = max(0, daysInMonth - payableDays)
```
- Can be 0 if all days are accounted for
- Can be negative if half-day leaves cause payableDays > daysInMonth (handled with max(0, ...))

### 10. **Half-Day Leave Handling**
- Half-day leave = 0.5 days (decimal supported)
- Counted in both `presentDays` and `approvedLeaves`
- Can result in `payableDays > daysInMonth`
- System ensures `LOPDays >= 0` (no negative LOP)

### 11. **Holiday Assignment & Counting**

**Holiday Assignment (Per Year)**:
- Holidays assigned via `User.holidayCalendarHistory` array
- Each entry: `{ calendarId, year, isActive, assignedAt, assignedBy }`
- System finds active calendar: `entry.year === payrollYear && entry.isActive === true`
- Fetches `HolidayCalendar` by `calendarId` for that year

**Mandatory Holidays**:
- ✅ Counted in `holidayDays`
- Filtered by: `h.type === 'mandatory'` AND date falls in payroll month/year
- Always paid (included in `payableDays`)

**Optional Holidays (Restricted Holidays)**:
- ✅ **NOT** counted in `holidayDays`
- If taken as leave:
  - Applied as `restricted_holiday` leave type
  - If approved, counted in `approvedLeaves` (not in `holidayDays`)
- If not taken:
  - User works that day
  - Not counted anywhere (treated as normal working day)

**Formula**:
```
holidayDays = mandatoryHolidayCount (from calendar)
approvedLeaves = annual + compOff + restricted_holiday (optional holidays taken as leave)
```

**No Double-Counting**: Optional holidays are either not counted or counted in `approvedLeaves` only, never in `holidayDays`

### 12. **Country-Specific Validation**
- India: Requires full salary structure with statutory deductions
- UAE: Simplified structure (no statutory deductions required)

### 13. **Rounding**
- All monetary values rounded to nearest integer
- Day counts rounded down (Math.floor)

### 14. **Parallel Processing**
- Employee payroll records processed in parallel (Promise.all)
- Data fetching for each employee also parallelized

### 15. **Batch Insert**
- All payroll records inserted in single batch operation
- More efficient than individual inserts

### 16. **Attendance Regularization**
- Out-of-window attendance counted as present if regularized and approved
- Regularization status checked: `regularization.isRegularized === true && regularization.status === 'Approved'`

### 17. **Financial Year Mapping**
- Tax declarations use financial year format (e.g., "2024-2025")
- Month names in tax declarations (e.g., "Jul", "Aug")
- Payroll uses calendar year and month numbers

---

## Frequently Asked Questions

### Q1: Why are weekend swipes not counted in presentDays?
**A:** To prevent double-counting. Weekend days are already paid (included in `payableDays`), so weekend attendance shouldn't be counted again in `presentDays`.

### Q2: What happens if employee doesn't swipe on weekends?
**A:** Weekend days are still paid. All weekend days are included in `payableDays` regardless of swipes.

### Q3: How are half-day leaves handled?
**A:** Half-day leaves are counted as 0.5 days in `approvedLeaves`. The day contributes 0.5 to both `presentDays` and `approvedLeaves`, which can result in `payableDays > daysInMonth`.

### Q4: Are restricted holidays (optional holidays) counted as holidays or leaves?
**A:** 
- **NOT counted in `holidayDays`** ✅
- **Counted in `approvedLeaves`** if taken as leave (as `restricted_holiday` leave type) ✅
- **Not counted anywhere** if not taken (user works that day) ✅
- Only **mandatory holidays** are counted in `holidayDays`

### Q5: What if payableDays > daysInMonth?
**A:** The system ensures `LOPDays >= 0` using `Math.max(0, ...)`. This can happen with half-day leaves, and the employee gets slightly more than full salary.

### Q6: How are absent days calculated?
**A:** 
```
absentDays = max(0, daysInMonth - (presentDays + holidayDays + weekendDays))
```
Absent days are working days without attendance and without approved leave.

---

## Code References

### Route Handler
- **File:** `src/routes/payroll.routes.ts` (Lines 60-164)
- **Endpoint:** `POST /payroll/generate`

### Service Methods
- **File:** `src/services/payroll.service.ts`
  - `initiatePayroll()` - Main entry point (Lines 997-1101)
  - `processPayrollRecords()` - Process all employees (Lines 1188-1231)
  - `calculatePayrollRecord()` - Calculate single employee payroll (Lines 1233-1486)
  - `calculateDeductions()` - Calculate all deductions (Lines 1489-1700)
  - `getMonthlyAttendance()` - Get attendance summary (Lines 1770-2258)
  - `fetchApprovedLeaves()` - Get approved leaves (Lines 1747-1788)
    - Finds leaves that overlap with payroll month using 3 conditions in `$or`
    - Includes: annual, compOff, restricted_holiday
    - Handles leaves spanning entire month (starts before, ends after)
    - **Calculates partial days per month** (not using `noOfDays` directly)
    - Calls `calculateLeaveDaysInMonth()` to compute working days in month overlap
  - `calculateLeaveDaysInMonth()` - Calculate leave days in specific month (Lines 1791-1930)
    - Handles leaves spanning multiple months by calculating partial days
    - Excludes weekends and mandatory holidays
    - Supports half-day leaves (0.5 per working day)
    - **Correctly handles half-day leaves with swipes** (e.g., Jan 31: first half swipes + second half leave = 0.5 days leave in `approvedLeaves`)
    - Returns total working days for leaves in the month
    - Handles leaves spanning multiple months by calculating partial days
    - Excludes weekends and mandatory holidays
    - Supports half-day leaves (0.5 per working day)
    - Returns total working days for leaves in the month
    - Finds leaves that overlap with payroll month (3 conditions in $or)
    - Includes: annual, compOff, restricted_holiday
    - Handles leaves spanning entire month (starts before, ends after)
  - `getWorkingDaysInMonth()` - Get working days info (Lines 2301-2416)
  - `getUserIdsByFilters()` - Filter employees (Lines 422-600)

### Models
- **Payroll Model:** `src/models/payrolls.model.ts`
- **User Model:** `src/models/user.model.ts`
- **SalaryAssignment Model:** `src/models/salary-assignment.model.ts`
- **SalaryStructure Model:** `src/models/salary-structure.model.ts`
- **AttendanceRecord Model:** `src/models/attendance-record.model.ts`
- **Leave Model:** `src/models/leave.model.ts`
- **Overtime Model:** `src/models/overtime.model.ts`
- **ShiftAssignment Model:** `src/models/shift-assignment.model.ts`
- **HolidayCalendar Model:** `src/models/holiday-calendar.model.ts`
- **TaxDeclaration Model:** `src/models/tax-declaration.model.ts`

---

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   31 Days in Month                      │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   ┌─────────┐        ┌──────────┐      ┌──────────┐
   │Weekends │        │ Holidays │      │  Leaves  │
   │  10     │        │    3     │      │   3.5    │
   │ (Paid)  │        │  (Paid)  │      │  (Paid)  │
   └─────────┘        └──────────┘      └──────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Working Days   │
                   │      18         │
                   └─────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   ┌─────────┐        ┌──────────┐      ┌──────────┐
   │Present  │        │  Absent  │      │  Leave   │
   │   15    │        │    3     │      │   3.5    │
   │(Worked) │        │  (LOP)   │      │ (Approved)│
   └─────────┘        └──────────┘      └──────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  Payable Days   │
                   │     31.5        │
                   │ (15+10+3+3.5)   │
                   └─────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │  LOP Days       │
                   │      0          │
                   │ (max(0, 31-31.5))│
                   └─────────────────┘
```

---

**Last Updated:** Based on codebase analysis
**Version:** 1.0
**Status:** Single Source of Truth - Current Implementation
