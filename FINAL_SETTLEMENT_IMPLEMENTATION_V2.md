# Final Settlement (F&F) Implementation V2.0

## 1. Overview
The Final Settlement (Full and Final / F&F) module automates the calculation of payable amounts for resigning employees. It covers:
- **Unpaid Salary Gaps**: Salary for months worked but not yet paid (from Last Paid Month to Last Working Date).
- **Hold Payrolls**: Release of previously processed but "Held" salaries.
- **Notice Period Recovery**: Deduction if the employee leaves early.
- **Leave Encashment**: Payment for unused earned leaves.
- **Statutory Deductions**: PF, PT, Income Tax, ESI for the unpaid duration.

---

## 2. Core Calculation Logic (`final-settlement.service.ts`)

### 2.1 Initialization Flow
**Endpoint**: `GET /final-settlement/initialize/:employeeId`

1.  **Validation**: Checks if the employee exists and has an **active Salary Assignment**.
2.  **Last Paid Payroll**: identifes the last month for which payroll was explicitly "Completed".
3.  **Hold Payrolls**: Fetches any payrolls with status "Hold".
    *   *Rule*: If the LWD month itself was processed and held, it is treated as a "Hold Payroll" release, NOT an "Unpaid Gap".
4.  **Resignation Details**: Fetches `approvedLastWorkingDay` (LWD) and `noticePeriod` from the user profile.

### 2.2 Unpaid Gaps Calculation (`calculateUnpaidGaps`)
This is the core engine that iterates month-by-month from `Last Paid Month + 1` up to `Last Working Date (LWD)`.

#### Logic per Month:
1.  **Skip Hold Months**: If a month exists in the `Hold Payrolls` list, it is skipped (handled separately).
2.  **Determine Period**:
    *   *Start*: 1st of the month.
    *   *End*: Last day of month OR `LWD` (if it's the exit month).
3.  **Days Calculation**:
    *   **Employment Days**: Total days from 1st to End Date (e.g., if LWD is 15th, Employment Days = 15).
    *   **Present Days**: Fetched from `AttendanceRecord` (Present, Late, On-Time, Early-Exit, Override).
    *   **Weekends**: Based on `ShiftAssignment` (default Sat/Sun if undefined).
    *   **Holidays**: Based on `HolidayCalendar` (mandatory holidays).
    *   **Leaves**: Approved leaves (excluding LOP).
    *   **Payable Days**: `Present + Weekends + Holidays + Paid Leaves`.
4.  **LOP (Loss of Pay) Logic**:
    *   `LOP Days = Employment Days - Payable Days`.
    *   *Constraint*: `PayableDays` cannot exceed `Employment Days`.
    *   Days *after* LWD are ignored (neither Payable nor LOP).

#### Financial Proration Logic (Full vs Actual):
The system calculates the prorated values for each salary component based on the `Payable Days`.

1.  **Full Monthly Values** (Based on Salary Structure):
    ```typescript
    Full Basic = Monthly Gross * (Basic Percentage / 100)
    Full DA = Basic * (DA Percentage / 100)
    Full HRA = Monthly Gross * (HRA Percentage / 100)
    Full Conveyance = Monthly Gross * (Conveyance Percentage / 100)
    Full Other Allowance = Monthly Gross * (Other Allowance Percentage / 100)
    ```

2.  **Actual Prorated Values** (Used in Settlement):
    ```typescript
    Rate Per Day = Full Component Value / Days In Month
    Actual Component Value = Rate Per Day * Payable Days
    ```

3.  **Period Gross (Prorated Gross)**:
    This represents the total salary earned for the specific period worked, comprising the sum of all actual prorated components.
    ```typescript
    Period Gross = Sum(Actual Basic + Actual DA + Actual HRA + Actual Conveyance + ...)
    ```

4.  **Example**:
    *   Monthly Gross: 30,000
    *   Month: June (30 Days)
    *   Payable Days: 15
    *   Full Basic (50%): 15,000
    *   **Actual Basic**: `(15,000 / 30) * 15 = 7,500`
    *   **Period Gross**: 15,000 (Sum of all prorated components)

5.  **Deductions**:
    *   **PF**: 12% of (Basic + DA) capped at ₹15,000 limit (if applicable).
    *   **PT**: Based on State Slabs (Standard deduction months + Catch-up logic for half-yearly states if leaving mid-term).

### 2.3 Leave Encashment
*   **Basis**: **Basic Salary** only (DA excluded per current config).
*   **Rate Per Day**: `Monthly Basic / Days in Leaving Month`.
*   **Formula**: `Leave Balance * Rate Per Day`.

### 2.4 Notice Period Recovery
*   **Goal**: Recover salary if `Days Served < Notice Period`.
*   **Shortfall**: `Notice Period - Days Served`.
*   **Recovery Calculation**:
    *   Iterates day-by-day starting from `LWD + 1`.
    *   **Daily Rate**: `Monthly Gross / Days In That Specific Month`.
    *   *Reasoning*: Ensures accuracy when recovery spans across months with different day counts (e.g., Feb vs Mar).

---

## 3. Data Structure & Response

The API returns a **flattened** JSON structure for easy frontend binding.

```json
{
  "success": "true",
  "employeeId": "...",
  "employeeName": "...",
  "leavingDate": "YYYY-MM-DD",
  "netAmount": 12345,
  "totalPayable": 15000,
  "totalDeductions": 2655,
  "finalCalculation": {
    "holdSalaries": 0,
    "unpaidSalaries": 10000,
    "leaveEncashment": 5000,
    "noticePeriodRecovery": 0,
    "professionalTax": 200,
    "providentFund": 1800,
    "lopAmount": 500,
    "netAmount": 12345
  },
  "unpaidMonths": [
    {
      "month": 2,
      "year": 2024,
      "daysWorked": 20,
      "lopDays": 1,
      "components": { "basic": 5000, "hra": 2500, ... }
    }
  ],
  "holdPayrolls": []
}
```

---

## 4. PDF Generation Logic (`fnf-pdf.helper.ts`)

The PDF is generated using a **DOCX Template** (`Final_Settlement.docx`) processed by `docxtemplater` and converted to PDF via LibreOffice.

### 4.1 Field Mapping
| PDF Field | Source Logic |
|-----------|--------------|
| `netPay` | `finalCalculation.netAmount` |
| `salaryDays` | Sum of `daysWorked` (Unpaid Months + Hold Months) |
| `plDays` | Leave Encashment Days |
| `lopDays` | Sum of `lopDays` (Unpaid Months + Hold Months) |
| `effectiveWorkdays` | Sum of `presentDays` (actual attendance) |

### 4.2 Dynamic Tables (Earnings & Deductions)
To avoid blank rows in the PDF:
1.  **Earnings List**: Checks each component (Basic, HRA, Conveyance, Hold Salary, Leave Encashment).
    *   *Condition*: Added ONLY if `value > 0`.
2.  **Deductions List**: Checks PF, PT, IT, ESI, Notice Recovery, LOP.
    *   *Condition*: Added ONLY if `value > 0`.

### 4.3 Template Placeholders
*   `{#earningsList}` ... `{label} {amount}` ... `{/earningsList}`
*   `{#deductionsList}` ... `{label} {amount}` ... `{/deductionsList}`
*   Simple fields: `{empName}`, `{joiningDate}`, `{netPayWords}`.

---

## 5. API Endpoints

1.  **Analyze & Preview**: `GET /final-settlement/initialize/:employeeId`
    *   Triggers the auto-calculation engine.
2.  **Save/Update Draft**: `POST /final-settlement/save`
    *   Allows manual overrides (e.g., adjusting generic deduction amounts).
3.  **Confirm & Lock**: `POST /final-settlement/confirm/:employeeId`
    *   Freezes the settlement.
    *   Generates the PDF.
    *   **Auto-Generates Payroll Records**:
        *   Automatically creates or updates `Payroll` records for all **Unpaid Months** included in the settlement.
        *   **Hold Salary Handling**: The total Net Salary of all *Hold Months* is added as a specific `holdSalary` component to the **Last Unpaid Month's** payroll record.
        *   Marks these payrolls as `Completed` and flags them with `isFinalSettlement: true`.
        *   Ensures tax declarations and other statutory reports reflect these final payments.
    *   Uploads PDF to GCP.
    *   Updates employee status to `Resigned` / Inactive.
