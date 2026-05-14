# Custom Salary Components End-to-End

Date: 2026-04-09
Status: Finalized & Implemented

## Purpose

This document describes the end-to-end implementation of custom salary components for payroll, standardized under the **Monthly Gross** calculation model:

1. Ad-hoc reimbursements
2. Ad-hoc deductions

These components are managed at the draft payroll stage and reflect in:

1. Payroll review summary
2. Generated payslip PDF
3. Salary statement preview/download
4. Payroll review Excel export

## Core Requirement: The Monthly Gross Model

The primary logic change ensures that **Monthly Gross (Assigned Salary)** is the anchor for all payroll calculations. 

Unlike a pro-rated base model, this implementation:
1. Starts with the full assigned monthly salary.
2. Subtracts statutory deductions and **Loss of Pay (LOP)**.
3. Adds custom reimbursements and overtime.

This ensures that the final Net Pay is always transparent and balances against the employee's contractual earnings.

## Functional Scope

### Single Employee Flow
Row `ADD` in payroll summary updates that employee's draft payroll record using the standardized formula.

### Bulk Employee Flow
Bulk `Add Components` applies the same logic to multiple selected draft payroll records.

### Saved Data
Each payroll record stores:
1. `customReimbursements` (Array)
2. `customDeductions` (Array)
3. `totalCustomReimbursements` (Sum)
4. `totalCustomDeductions` (Sum)
5. `monthlyGross` (Assigned Anchor)

## End-to-End User Flow

### 1. Draft Payroll
User initiates or opens draft payroll for a month.

### 2. Save Custom Components
When the modal is saved, the backend normalization occurs:
1. Components are trimmed and unified.
2. Duplicate names are merged.
3. **Net Salary Recalculation**:
   ```ts
   payroll.netSalary = Math.round(
       monthlyGross + 
       overtimePay + 
       customReimbursementsSum - 
       totalDeductions (including LOP) - 
       customDeductionsSum
   );
   ```

### 3. Review Summary
Summary totals in the UI reflect the updated `monthlyGross` base and manual adjustments.

### 4. Payslip Generation
The payslip PDF provides a balanced view:
- **Earnings Row**: Shows pro-rated (actual) amounts for visual transparency.
- **Deductions Row**: Lists LOP and custom deductions.
- **Net Pay**: Sources the persistent `netSalary` from the database.

## Files Involved

### Backend
1. `src/models/payrolls.model.ts`
2. `src/services/payroll.service.ts` (Core Logic)
3. `src/services/payslip.service.ts` (Display Logic)
4. `src/services/salary-statement.service.ts`

### Frontend
1. `src/lib/components/payroll/payrollSummaryTable.svelte`
2. `src/lib/components/payroll/payrollReview.svelte`

## Backend Design: Logic Synchronization

The same Net Salary formula is used in both the initial generation and the manual update paths to ensure mathematical consistency across the system.

### Formula in `calculatePayrollRecord`:
```ts
netSalary = monthlyGross - finalTotalDeductions + overtimePay;
```

### Formula in `updateCustomComponents`:
```ts
payroll.netSalary = Math.round(monthlyGross + overtimePay + reimbursements - deductions);
```

## Logic Safety Summary

This implementation modifies only the mathematical interpretation of "Gross" for Net Salary calculation. It does not delete or change the pro-rated `attendanceAdjustGross` field, which remains available for reference and display.

1. **Safety**: No changes to tax/statutory deduction algorithms.
2. **Persistence**: `monthlyGross` is saved as the persistent anchor for the record.
3. **Rounding**: Uses standard `Math.round()` for manual financial adjustments.

## Final Summary

The custom salary components feature is fully implemented using the **Monthly Gross model**. This provides a robust, transparent, and balanced payroll experience for both Admins and Employees.
