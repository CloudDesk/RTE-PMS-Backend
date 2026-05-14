# Custom Salary Components Current End-to-End Flow

This document describes the **current implemented flow** for adding custom salary components and the standardized payroll calculation logic:

- Ad-hoc reimbursements
- Ad-hoc deductions
- Standardized Net Salary Formula

These components are stored against **draft payroll records** and are reflected in:

- Payroll review/update screens
- Payroll summary/export data
- Payslip data formatting
- Payslip PDF generation
- Salary statement export

This document reflects the **current code behavior** as finalized in the latest implementation.

---

## 1. Business Goal

Provide an option for HR/Admin to add custom salary adjustments on payroll records:

- `customReimbursements`: extra positive earnings
- `customDeductions`: extra negative deductions

The primary objective is to ensure that the **Monthly Gross (Assigned Salary)** is the anchor for the final calculation, ensuring transparency and consistency across the payroll cycle.

---

## 2. Scope of Current Implementation

The implementation handles both the **initial generation** and **manual adjustments** of payroll records.

Key Constraints:
- Custom components are applied **to draft payroll records**.
- The model uses the **Monthly Gross model**: Net Salary is calculated starting from the full assigned salary, with LOP (Loss of Pay) treated as a deduction row.
- Draft restriction is enforced in: [payroll.service.ts](file:///C:/Users/Dell/Documents/GitHub/Vinithcloud/Zuno%20Web%20India/Zuno-hr-India-Api/src/services/payroll.service.ts)

---

## 3. Data Model

The payroll model stores custom arrays and totals directly on each payroll record.

Defined in:
- [payrolls.model.ts](file:///C:/Users/Dell/Documents/GitHub/Vinithcloud/Zuno%20Web%20India/Zuno-hr-India-Api/src/models/payrolls.model.ts)

Current fields:
```ts
customReimbursements: Array<{ name: string; value: number }>
customDeductions: Array<{ name: string; value: number }>
totalCustomReimbursements: number
totalCustomDeductions: number
monthlyGross: number // The "Assigned Salary" anchor
attendanceAdjustGross: number // The pro-rated gross (used for display only)
```

---

## 4. Backend Calculation Logic

The system utilizes a unified formula for both initial creation and manual updates.

### 4.1 Base Anchor: Monthly Gross
Unlike previous versions that used pro-rated gross as the base, the current system uses the **full assigned Monthly Gross**. This ensures that deductions (including LOP/Loss of Pay) are explicit and the math balances against the employee's contract.

### 4.2 Initial Generation (`calculatePayrollRecord`)
When payroll is first initiated, the Net Salary is calculated as:
```ts
netSalary = monthlyGross - finalTotalDeductions + overtimePay
```
*Note: `finalTotalDeductions` includes statutory items AND leave deductions (LOP).*

### 4.3 Manual Components Update (`updateCustomComponents`)
When an Admin adds custom adjustments, the record is updated using:
```ts
payroll.netSalary = Math.round(
    (payroll.monthlyGross || 0) +
    (payroll.overtimePay || 0) +
    newReimbursementsSum -
    (payroll.totalDeductions || 0) -
    newDeductionsSum
);
```

Reference: [payroll.service.ts](file:///c:/Users/Dell/Documents/GitHub/Vinithcloud/Zuno%20Web%20India/zuno-hr-india-api/src/services/payroll.service.ts#L3139)

---

## 5. Payslip Presentation Flow

The payslip follows a specific "Display vs. Logic" model as requested.

### 5.1 Display Logic
- **Earnings Row**: Displays the **Actual (Pro-rated)** earnings based on attendance.
- **Deductions Row**: Displays statutory deductions and explicitly lists **Loss of Pay (LOP)**.

### 5.2 Mathematical Balance
Because the `netSalary` in the database is based on `Monthly Gross - (Statutory + LOP)`, and the payslip displays `Actual (Monthly Gross - LOP) - Statutory`, the final **Net Pay** Source of Truth from the database remains consistently accurate.

File: [payslip.service.ts](file:///C:/Users/Dell/Documents/GitHub/Vinithcloud/Zuno%20Web%20India/zuno-hr-india-api/src/services/payslip.service.ts)

---

## 6. Summary of Formula Components

| Component | Source | Treatment |
| :--- | :--- | :--- |
| **Monthly Gross** | Salary Assignment | Base Anchor (+) |
| **Overtime Pay** | Attendance/OT Logic | Addition (+) |
| **Custom Reimbursements** | Admin Input | Addition (+) |
| **Total Deductions** | Statutory Logic + LOP | Deduction (-) |
| **Custom Deductions** | Admin Input | Deduction (-) |
| **Net Salary** | Recalculated | Final Result (=) |

---

## 7. Main Files Involved

### Backend
- [payrolls.model.ts](file:///C:/Users/Dell/Documents/GitHub/Vinithcloud/Zuno%20Web%20India/Zuno-hr-India-Api/src/models/payrolls.model.ts) - Schema definition.
- [payroll.service.ts](file:///C:/Users/Dell/Documents/GitHub/Vinithcloud/Zuno%20Web%20India/Zuno-hr-India-Api/src/services/payroll.service.ts) - Core calculation logic (`calculatePayrollRecord` & `updateCustomComponents`).
- [payslip.service.ts](file:///C:/Users/Dell/Documents/GitHub/Vinithcloud/Zuno%20Web%20India/Zuno-hr-India-Api/src/services/payslip.service.ts) - Formatting logic for PDF and display.

### Frontend
- [payrollInitiate.svelte](file:///C:/Users/Dell/Documents/GitHub/Vinithcloud/Zuno%20Web%20India/Zuno-hr-India/src/lib/components/payroll/payrollInitiate.svelte) - UI for initial generation.
- [payrollSummaryTable.svelte](file:///C:/Users/Dell/Documents/GitHub/Vinithcloud/Zuno%20Web%20India/Zuno-hr-India/src/lib/components/payroll/payrollSummaryTable.svelte) - UI for component updates.

---

## 8. Final Summary
The current implementation ensures that:
1. All custom adjustments are captured accurately.
2. The **Monthly Gross** model provides maximum transparency for both Admin and Employee.
3. The Net Salary is saved as a persistent, mathematically sound value in the database.
