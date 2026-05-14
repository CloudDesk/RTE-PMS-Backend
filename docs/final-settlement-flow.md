# Final Settlement (FNF) — Full Calculation Logic
> **Date:** 24 February 2026  
> **File:** `src/services/final-settlement.service.ts`  
> **Author:** Zuno HR India API Team

---

## 📋 Overview

The FNF calculates the **net amount to pay or recover** from an employee upon exit.  
It covers unpaid salaries, leave encashment, notice recovery, and all statutory deductions.

```
NET AMOUNT = TOTAL EARNINGS - TOTAL DEDUCTIONS
```

---

## 🔢 STEP 1 — Determine Gap Months (Unpaid Period)

### Purpose:
Find every month the employee worked but was NOT yet paid.

### Logic:
```
Last Paid Payroll (status = 'Completed') → find the most recent one, sorted by (year DESC, month DESC)

If last paid = September 2024:
  startDate = October 1, 2024  ← gap starts here

If no paid payroll exists:
  startDate = employee.joiningDate  ← very first month

Loop: from startDate → LWD month (inclusive)
  Skip month if:
    - month is in Hold Payrolls (processed separately)
```

### Result:
```
Gap Months = [October, November, December, January]  ← these are the "Unpaid Months"
```

---

## 🔢 STEP 2 — For Each Gap Month: Calculate Days

### 2a. Days In Month
```
daysInMonth = actual calendar days in that month
  e.g., January = 31, February = 28/29, etc.
```

### 2b. Max Days (LWD Cap)
```
If this month = LWD month:
  maxDays = LWD date  (e.g., Jan 16 → maxDays = 16)
Else:
  maxDays = daysInMonth  (full month worked)
```

### 2c. Weekend Days
```
Fetch ShiftAssignment → get weekendDays array (e.g., [0, 6] = Sun, Sat)
Count weekend days from Day 1 to maxDays, excluding mandatory holidays
weekendDays = total weekend days in employment period
```

### 2d. Mandatory Holidays
```
Fetch HolidayCalendar from employee's holidayCalendarHistory (for that year)
Count holidays of type = 'mandatory' that fall within Day 1 to maxDays
holidayDays = count of mandatory holidays
```

### 2e. Present Days
```
Fetch AttendanceRecord for the month (Day 1 to maxDays)
For each record:
  - Not a weekend day AND status is Present/Late/On-Time/Early-Exit → count as 1
  - If halfDay + On-Leave → count as 0.5
presentDays = total
```

### 2f. Leave Days
```
Fetch approved Leave records overlapping this month
For each leave:
  Clip to the month boundaries (Day 1 to maxDays)
  If leaveType = 'LOP' or 'Loss Of Pay' → add to lopDays
  Else → add to leaveDays
```

### 2g. Payable Days
```
payableDays = presentDays + weekendDays + holidayDays + leaveDays

Cap: if payableDays > employmentDays → set payableDays = employmentDays

where employmentDays = maxDays (LWD day or daysInMonth)
```

### 2h. LOP Days
```
lopDays = employmentDays - payableDays
lopDays = max(0, lopDays)  ← never negative
```

### 2i. Skip if Zero Days
```
If payableDays <= 0 → skip this month entirely
```

---

## 🔢 STEP 3 — Salary Proration Per Month

### 3a. Identify Correct Salary (Historical Hike Support)
```
Fetch ALL SalaryAssignments for employee → sorted by effectiveFrom ASC

getAssignmentForMonth(month, year):
  Find assignment where:
    effectiveFrom <= last day of month  AND
    effectiveTo   >= first day of month
  
  If none found → use latest assignment as fallback

currentMonthGross = assignment.monthlyGross for THAT specific month
```

**Example:**
```
Oct 2024 → Assignment 1 (₹18,000)  ← effectiveTo = Nov 30
Dec 2024 → Assignment 2 (₹25,000)  ← effectiveFrom = Dec 1
```

### 3b. Monthly Salary (Prorated)
```
monthlySalary = (currentMonthGross / daysInMonth) × payableDays

Example (January, 16 days, gross = ₹25,000, 31 days in Jan):
monthlySalary = (25,000 / 31) × 16 = ₹12,903
```

### 3c. Component Breakdown
```
fullBasic     = currentMonthGross × (basicPercentage / 100)
fullDA        = fullBasic × (daPercentage / 100)        ← 0 if daPercentage = 0
fullHRA       = currentMonthGross × (hraPercentage / 100)
fullConveyance = currentMonthGross × (conveyancePercentage / 100)
fullOtherAll  = currentMonthGross × (otherAllowancePercentage / 100)

proratedBasic     = (fullBasic / daysInMonth) × payableDays
proratedDA        = (fullDA / daysInMonth) × payableDays
proratedHRA       = (fullHRA / daysInMonth) × payableDays
proratedConveyance = (fullConveyance / daysInMonth) × payableDays
proratedOtherAll  = (fullOtherAllowances / daysInMonth) × payableDays
```

### 3d. LOP Amount
```
lopAmount = (currentMonthGross / daysInMonth) × lopDays
```

---

## 🔢 STEP 4 — Provident Fund (PF)

### Formula:
```
wage = proratedBasic + proratedDA
rate = epf.employeeContribution  (default 12%)

If basic >= epf.maxLimit (₹15,000):
  pfAmount = (rate / 100) × maxLimit  ← capped
Else:
  pfAmount = wage × (rate / 100)

pfAmount = round(pfAmount)
```

### Example:
```
proratedBasic = ₹6,000, proratedDA = ₹0
wage = ₹6,000
rate = 12%
6,000 < 15,000 → NOT capped
pfAmount = 6,000 × 12% = ₹720
```

---

## 🔢 STEP 5 — Income Tax (IT)

### Formula:
```
financialYear = if month <= 3: (year-1)-(year)  else: year-(year+1)

Fetch TaxDeclaration for employee + financialYear

Find monthlyDeduction where:
  month = short month name (e.g., 'Jan')
  financialYear matches
  isProcessed = false

itAmount = monthlyDeduction.plannedDeduction  (or 0 if not found)
```

---

## 🔢 STEP 6 — ESI

```
esiAmount = 0  ← currently disabled / returns 0
```

---

## 🔢 STEP 7 — Professional Tax (PT)

> **Fully cycle-aware + historically accurate (implemented 24 Feb 2026)**

### 7a. Identify PT Cycle (H1 or H2)
```
LWD month (Jan = 1, Feb = 2 ... Dec = 12)

isH1 = (lwdMonth >= 4 AND lwdMonth <= 9)   → April to September
isH2 = (lwdMonth >= 10 OR lwdMonth <= 3)   → October to March

H1 cycle period: April 1 → September 30
H2 cycle period: October 1 → March 31
```

### 7b. PT Cycle Start Year
```
If isH1:
  cycleStartYear = lwdYear

If isH2:
  If lwdMonth >= 10: cycleStartYear = lwdYear
  If lwdMonth <= 3:  cycleStartYear = lwdYear - 1

Example: LWD = January 2025
  dwdMonth = 1, isH1 = false, lwdMonth < 10
  cycleStartYear = 2025 - 1 = 2024
  H2 cycle = Oct 2024 → Mar 2025
```

### 7c. Pre-loop — Aggregate PAID months in the cycle
```
Fetch all Completed payrolls for the cycle period from DB

For each paid month in cycle BEFORE the gap starts:
  If payroll exists in DB:
    cycleAggregateGross += payroll.attendanceAdjustGross  ← actual amount paid
    cyclePaidPT += payroll.professionalTax                ← PT already deducted

  If no payroll (employee was active but no record):
    monthHistGross = getAssignmentForMonth(month, year).monthlyGross
    If employee was active that month (joined before it):
      cycleAggregateGross += monthHistGross
```

### 7d. Unpaid Gap months → add to aggregate
```
For each unpaid gap month:
  currentMonthIsH1 = (currentMonth >= 4 AND currentMonth <= 9)

  Only add to cycle aggregate if gap month belongs to same cycle as LWD:
    If currentMonthIsH1 == isH1:
      cycleAggregateGross += round(monthlySalary)   ← prorated if LWD month
```

### 7e. PT Deduction (Only in LWD month for half-yearly)
```
If ptTerm = 'half_yearly':
  If isLWDMonth:
    representativeMonth = isH1 ? 8 (August) : 2 (February)
    totalDueForCycle = calculatePT(cycleAggregateGross, representativeMonth, isLWD=true)
    ptAmount = max(0, totalDueForCycle - cyclePaidPT)   ← deduct what's already paid
  Else:
    ptAmount = 0  ← only deducted at exit

If ptTerm = 'monthly':
  ptAmount = calculatePT(currentMonthGross, currentMonth, isLWDMonth)
```

### 7f. PT Slab Lookup
```
For each slab in professionalTax.slabs:
  If cycleAggregateGross >= slab.fromAmount AND
     cycleAggregateGross <= slab.toAmount:
    ptAmount = slab.taxAmount
```

### Full PT Example (Hike Scenario):
```
Employee: ₹18,000 → hike to ₹25,000 in December
Last Paid: September, LWD: January 16

Cycle = H2 (Oct–Mar)

Pre-loop: Sept was H1 → not in H2 cycle → cyclePaidPT = 0, cycleAggregateGross = 0

Gap months:
  Oct  → ₹18,000 → cycleAggregateGross = 18,000
  Nov  → ₹18,000 → cycleAggregateGross = 36,000
  Dec  → ₹25,000 → cycleAggregateGross = 61,000  (hike applied!)
  Jan  → ₹12,903 → cycleAggregateGross = 73,903  (prorated 16 days)

PT Lookup: calculatePT(73,903, 2, true)
  Slab: ₹60,001–₹75,000 → ₹1,025

ptAmount = 1,025 - 0 = ₹1,025 ✅
```

---

## 🔢 STEP 8 — Notice Period Recovery

### 8a. Days Served
```
daysServed = floor((LWD - ResignationDate) / msPerDay) + 1  ← inclusive

Subtract LOP leaves approved during notice period:
  For each LOP leave overlapping notice period:
    Clip to notice period boundaries
    lopDuringNotice += clipped days

daysServed = max(0, daysServed - lopDuringNotice)
```

### 8b. Shortfall Check
```
excessInNotice = daysServed - noticePeriodDays

If excessInNotice >= 0 → no recovery (served enough or excess)
If excessInNotice < 0  → shortfall → calculate recovery
```

### 8c. Recovery Amount (Day-Wise, UTC Safe)
```
shortfallDays = abs(excessInNotice)

Start from: day AFTER LWD (UTC)
Loop for shortfallDays:
  recovery += monthlyGross / daysInThatMonth   ← actual days in that calendar month

noticePeriodRecovery = sum of all daily amounts
```

### Example:
```
LWD = Jan 15, Resignation = Jan 1, Notice Required = 30 days
daysServed = 15, shortfall = 15 days

Recovery loop (Jan 16 to Jan 30):
  Jan has 31 days
  15 × (30,000 / 31) = 15 × 967.74 = ₹14,516
```

---

## 🔢 STEP 9 — Leave Encashment

### Formula:
```
Fetch LeaveSummary for employee (year of LWD)
alBalance = leaveSummary.annual.remaining  ← unused Annual Leave days

daysInLeavingMonth = actual days in LWD month

Basic = monthlyGross × (basicPercentage / 100)
perDayRate = Basic / daysInLeavingMonth

leaveEncashment = round(alBalance × perDayRate)
```

### Example:
```
monthlyGross = ₹30,000, basicPercentage = 50%, LWD month = January (31 days)
Basic = 30,000 × 50% = ₹15,000
perDayRate = 15,000 / 31 = ₹483.87

AL balance = 5 days
leaveEncashment = 5 × 483.87 = ₹2,419
```

> ⚠️ DA is **not included** in leave encashment (per company requirement)

---

## 🔢 STEP 10 — Hold Salary

```
Fetch all payrolls with status = 'Hold' for this employee

totalHoldAmount = sum of netSalary from all Hold payrolls

These months are SKIPPED in gap calculation (not double-counted)
Hold salary is released as part of FNF total payable
```

---

## 🔢 STEP 11 — Final Net Calculation

```
EARNINGS (Total Payable):
  holdSalaries       = sum of Hold payroll net salaries
  unpaidSalaries     = sum of monthlySalary across all gap months
  leaveEncashment    = AL balance × perDayRate
  reimbursements     = manual entries (if any)
  otherAdditions     = manual additions (if any)
  gratuity           = 0  ← disabled

  TOTAL PAYABLE = holdSalaries + unpaidSalaries + leaveEncashment
                + reimbursements + otherAdditions + gratuity


DEDUCTIONS:
  noticePeriodRecovery = shortfall days × daily rate
  professionalTax      = cycle-aware slab (deducted in LWD month)
  providentFund        = sum of PF across gap months
  incomeTax            = sum of IT across gap months
  esi                  = 0 (disabled)
  lopAmount            = sum of LOP amounts across gap months
  otherDeductions      = manual deductions (if any)

  TOTAL DEDUCTIONS = noticePeriodRecovery + professionalTax
                   + providentFund + incomeTax + esi
                   + lopAmount + otherDeductions


NET AMOUNT = TOTAL PAYABLE - TOTAL DEDUCTIONS

isNegative = (NET AMOUNT < 0)   ← employee owes company money
```

---

## 🔢 STEP 12 — Confirm & Generate PDF

```
1. Validate draft exists
2. Re-validate hold payroll amounts from DB (security)
3. Re-enforce leave encashment per-day rate from DB
4. Generate FNF Letter PDF → upload to GCP Storage → get URL

MongoDB Transaction (Atomic):
  5. Delete previous FNF payslip records for this employee
  6. Re-lock draft (prevent concurrent confirms)
  7. Pack all final data into settlement document
  8. Set status = 'Confirmed', save pdfUrl

  For each unpaid gap month:
    9. Auto-create Payroll record with:
         - attendanceAdjustedGross (prorated)
         - Basic, HRA, DA, Travel, Other Allowances
         - PF, PT, ESI, IT deductions
         - type = 'FinalSettlement', isFinalSettlement = true

  10. Save settlement + payslips atomically
```

---

## 📊 Full Example — End to End

| Item | Calculation | Amount |
|---|---|---|
| October Salary | Full month @ ₹18,000 | ₹18,000 |
| November Salary | Full month @ ₹18,000 | ₹18,000 |
| December Salary | Full month @ ₹25,000 | ₹25,000 |
| January Salary | (25,000/31)×16 days | ₹12,903 |
| **Total Unpaid** | | **₹73,903** |
| Leave Encashment | 5 days × ₹403/day (basic) | ₹2,016 |
| **TOTAL EARNINGS** | | **₹75,919** |
| Notice Recovery | 15 days × ₹806/day | ₹12,097 |
| Professional Tax | Slab on ₹73,903 | ₹1,025 |
| Provident Fund | 12% of prorated basic (all months) | ₹X |
| LOP Amount | LOP days × daily rate | ₹X |
| **TOTAL DEDUCTIONS** | | **₹13,122+** |
| **NET AMOUNT** | Earnings − Deductions | **₹62,797+** |

---

## ✅ Implementation Checklist (24 Feb 2026)

| Component | Logic | Status |
|---|---|---|
| Gap month detection | Last paid → LWD | ✅ |
| Attendance calculation | Present + Weekend + Holiday + Leave | ✅ |
| LOP calculation | Employment days − Payable days | ✅ |
| Historical salary per month | `getAssignmentForMonth()` | ✅ |
| Salary proration | (gross / daysInMonth) × payableDays | ✅ |
| Component breakdown | Basic, HRA, DA, Conveyance, Other | ✅ |
| PF (with cap) | 12% of Basic+DA, capped at ₹15,000 | ✅ |
| IT from TaxDeclaration | Monthly planned deduction | ✅ |
| ESI | Returns 0 | ✅ |
| PT — Half-Yearly cycle | H1 (Apr–Sep) / H2 (Oct–Mar) | ✅ |
| PT — Historical salary | Per-month assignment lookup | ✅ |
| PT — Paid months from DB | Reads existing payroll records | ✅ |
| PT — Catch-up in LWD month | Aggregate − already paid | ✅ |
| Notice Recovery | Day-wise, UTC-safe, LOP-adjusted | ✅ |
| Leave Encashment | Basic only / daysInMonth × AL balance | ✅ |
| Hold Salary | Read from DB, skip in gap loop | ✅ |
| Net Amount calculation | Payable − Deductions | ✅ |
| PDF Generation | GCP upload, URL stored | ✅ |
| Atomic Confirm | MongoDB session transaction | ✅ |
| Auto payslip generation | Per unpaid month | ✅ |
| Unlock & re-edit | Blocks if payroll Completed | ✅ |
| Gratuity | Disabled | ⏸ |
