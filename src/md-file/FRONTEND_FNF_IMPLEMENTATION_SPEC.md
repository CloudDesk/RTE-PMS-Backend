# 📘 Final Settlement (FNF) - Frontend Implementation Spec

This document provides a comprehensive, deep-dive specification for updating the Final Settlement Frontend to support the new robust backend logic.

---

## 🏗️ Architecture Change
**Old Approach**: Frontend calculated many values (Notice Recovery, Leave Encashment) based on simple formulas.  
**New Approach**: **Zero-Logic Frontend**. The Frontend must purely **display** values returned by the Backend API. The Backend now handles complex statutory rules (PF, ESI, Gratuity, LOP Adjustments).

---

## 📡 API Response Schema (Reference)
The `finalCalculation` object from `GET /final-settlement/:id` is your single source of truth.

```typescript
interface FinalCalculation {
  // Earnings
  holdSalaries: number;
  unpaidSalaries: number;
  leaveEncashment: number;
  gratuity: number;           // 🆕 Check > 0 to display
  reimbursements: number;
  otherAdditions: number;
  totalPayable: number;       // (A) Total Earnings

  // Deductions
  noticePeriodRecovery: number;
  professionalTax: number;    // 🆕 Statutory
  providentFund: number;      // 🆕 Statutory
  esi: number;                // 🆕 Statutory
  otherDeductions: number;    // Manual
  totalDeductions: number;    // (B) Total Deductions

  // Final
  netAmount: number;          // (A - B)
  isNegative: boolean;        // 🆕 Warning Flag
}
```

---

## 🛠️ Step-by-Step Implementation Guide

### 1️⃣ Step 2: Resignation Details
*   **Context**: The user selects "Resignation Date" and "Last Working Day".
*   **Logic Update**:
    *   When these dates change, you likely call an API to recalculate/init.
    *   **Display 'Served Days'**: Previously, you might have done `DateDiff(LWD, ResignDate)`.
    *   **Now**: Display `response.daysServed` from the API.
    *   **Why?**: The API subtracts **Loss of Pay (LOP)** days taken during the notice period. The visual date difference might be 60 days, but `daysServed` might be 50.

### 2️⃣ Step 3: Notice Period Recovery
*   **Context**: Showing the recovery amount if they leave early.
*   **Logic Update**:
    *   **Shortfall Days**: Bind to `response.excessInNotice` (if negative).
    *   **Recovery Amount**: Bind directly to `response.finalCalculation.noticePeriodRecovery`.
    *   **Do NOT Calculate**: `(Gross / 30) * Shortfall`. The backend does this, and might have specific rounding or policy exclusions you don't know about.

### 3️⃣ Step 5: Leave Encashment (CRITICAL CHANGE 🚨)
*   **Context**: Converting Annual Leave balance to cash.
*   **Legacy Behavior**: Calculated as `(MonthlyGross / 30) * Balance`.
*   **New Behavior**: Calculated as `(Basic + DA) / 30 * Balance`.
    *   *This value is significantly lower than Gross in most cases.*
*   **Implementation Details**:
    *   **Rate/Day Field**: Bind to `response.leaveBalance[0].perDayRate`.
    *   **Total Payout Field**: Bind to `response.leaveBalance[0].encashAmount`.
    *   **Read-Only**: Ideally, make the "Rate/Day" field read-only or show a tooltip explaining "Based on Basic + DA".

### 4️⃣ Step 7: Final Summary (The Payslip View)
This view needs new rows to reflect the robust engine.

#### **Earnings Section**
Add a conditional row for Gratuity.

```jsx
{/* Existing Rows */}
<SummaryRow label="Hold Salary" value={data.holdSalaries} />
<SummaryRow label="Unpaid Salary" value={data.unpaidSalaries} />
<SummaryRow label="Leave Encashment" value={data.leaveEncashment} />

{/* 🆕 NEW ROW: Gratuity (Currently Disabled in Backend but supported in UI) */}
{data.gratuity > 0 && (
  <SummaryRow 
    label="Gratuity (5+ Years Service)" 
    value={data.gratuity} 
    tooltip="Statutory benefit for > 4 years 240 days service"
  />
)}
```

#### **Deductions Section**
Split the statutory deductions.

```jsx
{/* Existing Rows */}
<SummaryRow label="Notice Recovery" value={data.noticePeriodRecovery} />

{/* 🆕 NEW ROWS: Statutory Compliance */}
{data.providentFund > 0 && (
  <SummaryRow label="Provident Fund" value={data.providentFund} />
)}
{data.esi > 0 && (
  <SummaryRow label="ESI" value={data.esi} />
)}
{data.professionalTax > 0 && (
  <SummaryRow label="Professional Tax" value={data.professionalTax} />
)}

<SummaryRow label="Other Deductions" value={data.otherDeductions} />
```

#### **Footer: Net Pay**
Handle negative settlements.

```jsx
if (data.isNegative) {
  return (
    <div className="bg-red-50 border-red-200 text-red-700 p-4 rounded">
      <strong>⚠️ Recovery Needed:</strong> The employee owes the company 
      <strong> {formatCurrency(Math.abs(data.netAmount))}</strong>
    </div>
  );
} else {
  return <div className="text-xl font-bold text-green-700">Net Pay: {formatCurrency(data.netAmount)}</div>;
}
```

---

### 4️⃣ Save as Draft (Intermediate State)
*   **Action**: Calling `POST /final-settlement/save/:id`
*   **Usage**: Call this when the user clicks "Save & Continue" or navigates between steps.
*   **Status**: The status remains `'Draft'`.
*   **Behavior**: Saves current overrides (e.g., manual deductions, LWD changes) but does **NOT** release payrolls or generate the final PDF.

### 5️⃣ Final Submit Action
*   **Action**: Calling `POST /final-settlement/confirm/:id`
*   **Side Effect**: The Backend automatically updates all **'Hold'** payrolls to **'Completed'**.
*   **UI Feedback**: You can show a success message: "Settlement Confirmed & Hold Salaries Released".

## 🧪 Testing Checklist (Frontend Developer)

1.  **Check Encashment Rate**: Ensure "Rate/Day" is NOT `Gross/30`. It should be lower (approx 40-50% of Gross/30).
2.  **Verify Gratuity**: Test with an employee joined > 5 years ago. Ensure "Gratuity" row appears.
3.  **Verify Notice LOP**: Create a scenario where employee takes LOP during notice. Ensure "Served Days" < "Date Difference".
4.  **Verify Statutory**: Ensure PF/PT/ESI rows appear for the unpaid month calculation.

