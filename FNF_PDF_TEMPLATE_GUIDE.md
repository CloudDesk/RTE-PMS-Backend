# Final Settlement (FNF) PDF Template Guide

This document defines the variable structure and conditional logic used in the Final Settlement Word Template (`Final_Settlement.docx`). This setup allows rows to automatically hide if their value is 0.

## � Employee & Header Details
These variables are always available at the root level.

| Variable | Description | Example |
| :--- | :--- | :--- |
| `{empNo}` | Employee Code | EMP-101 |
| `{empName}` | Full Name | John Doe |
| `{empDept}` | Department | Engineering |
| `{empDesig}` | Designation | Senior Developer |
| `{empLocation}` | Location | Chennai |
| `{joiningDate}` | Date of Joining | 01-Jan-2022 |
| `{resignDate}` | Resignation Submitted On | 15-Dec-2024 |
| `{leavingDate}` | Last Working Day | 15-Jan-2025 |

## 📅 Days & Notice Calculation

| Variable | Description |
| :--- | :--- |
| `{noticePeriod}` | Required notice period (days) |
| `{noticeAdjustable}` | Shortfall in notice served (days) |
| `{plDays}` | Paid Leave Balance (Encashable days) |
| `{salaryDays}` | Days worked in exit month |
| `{monthDays}` | Total days in exit month |
| `{lopDays}` | Loss of Pay days in exit month |
| `{effectiveWorkdays}` | Total payable days |

## 💰 Income Table (Left Column)
All income fields are wrapped in the `{#income}` scope. The nested tags (e.g., `{#unpaidBasic}`) check if the value exists (>0). If 0, the row hides.

| Row Label | Label Cell Syntax | Value Cell Syntax |
| :--- | :--- | :--- |
| **BASIC** | `{#income}{#unpaidBasic}BASIC{/}{/income}` | `{#income}{unpaidBasic}{/income}` |
| **HRA** | `{#income}{#unpaidHRA}HRA{/}{/income}` | `{#income}{unpaidHRA}{/income}` |
| **HOLD SALARY** | `{#income}{#holdSalary}HOLD SALARY{/}{/income}` | `{#income}{holdSalary}{/income}` |
| **OTHER ALLOWANCE** | `{#income}{#unpaidOtherAllowance}OTHER ALLOWANCE{/}{/income}` | `{#income}{unpaidOtherAllowance}{/income}` |
| **REIMBURSEMENTS** | `{#income}{#reimbursement}REIMBURSEMENTS{/}{/income}` | `{#income}{reimbursement}{/income}` |
| **LEAVE ENCASHMENT** | `{#income}{#leaveEncashment}LEAVE ENCASHMENT{/}{/income}` | `{#income}{leaveEncashment}{/income}` |
| **OTHER ADDITIONS** | `{#income}{#otherAdditions}OTHER ADDITIONS{/}{/income}` | `{#income}{otherAdditions}{/income}` |

## 💸 Deduction Table (Right Column)
All deduction fields are wrapped in the `{#deduction}` scope.

| Row Label | Label Cell Syntax | Value Cell Syntax |
| :--- | :--- | :--- |
| **PROVIDENT FUND** | `{#deduction}{#pf}PF{/}{/deduction}` | `{#deduction}{pf}{/deduction}` |
| **PROF TAX** | `{#deduction}{#pt}PROF TAX{/}{/deduction}` | `{#deduction}{pt}{/deduction}` |
| **LOP** | `{#deduction}{#lopDeduction}LOP{/}{/deduction}` | `{#deduction}{lopDeduction}{/deduction}` |
| **NOTICE PERIOD** | `{#deduction}{#noticeRecovery}NOTICE PERIOD{/}{/deduction}` | `{#deduction}{noticeRecovery}{/deduction}` |
| **OTHER DEDUCTIONS** | `{#deduction}{#otherDeduction}OTHER DEDUCTIONS{/}{/deduction}` | `{#deduction}{otherDeduction}{/deduction}` |
| **INCOME TAX (TDS)** | `{#deduction}{#it}Income Tax{/}{/deduction}` | `{#deduction}{it}{/deduction}` |

## 📊 Footer Totals (Always Visible)
These fields exist at the document root.

| Field | Variable | Format |
| :--- | :--- | :--- |
| **Total Income** | `{totalIncome}` | ₹ 12,345 |
| **Total Deductions** | `{totalDeductions}` | ₹ 1,200 |
| **Net Pay (Figures)** | `{netPay}` | ₹ 11,145 |
| **Net Pay (Words)** | `{netPayWords}` | Rupees Eleven Thousand ... Only |

---

## 🛠 Backend Logic Reference (`fnf-pdf.helper.ts`)

The backend ensures that any value equal to `0` is returned as `null`. 
*   **Value**: `₹ 10,000` (String) -> interpreted as `true` by template engine.
*   **Value**: `0` (Number) -> converted to `null` -> interpreted as `false` -> Row Hides.
