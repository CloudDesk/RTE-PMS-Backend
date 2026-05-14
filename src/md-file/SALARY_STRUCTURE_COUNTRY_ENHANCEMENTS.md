# Salary Structure Country Enhancements (Oct 2025)

_Last updated: 2025-10-15_

> **Breaking change:** `fixedEarnings.reinvestmentPercentage` has been renamed to `fixedEarnings.reimbursementPercentage`. Backfill scripts and integrations must write to the new field going forward.

## Migration Checklist
- **Backfill country flag**: Set `country: 'IN'` on existing documents that do not have a flag.
  ```javascript
  db.salarystructures.updateMany(
    { country: { $exists: false } },
    { $set: { country: 'IN' } }
  );
  ```
- **Mark UAE records explicitly**: For any existing UAE structure, update the record with `country: 'AE'` and populate the new fixed earning fields (`travelAllowancePercentage`, `comment` where available, etc.).
- **Rename legacy field**: For records that previously used `fixedEarnings.reInvestmentPercentage`, migrate the value to `fixedEarnings.reimbursementPercentage` so the API continues to serve the allowance.
- **Optional comments**: `fixedEarnings.comment` is now optional for UAE templates; leave it blank if you do not want to capture internal notes.
- **Seed UAE template**: Run `ts-node scripts/createUaeSalaryStructure.ts` (after setting `MONGODB_URI`) to insert the default UAE structure for administrators logging in from the UAE tenant.
- **Rebuild application**: Deploy the API after the schema change so Fastify routes and services expose the new fields.

## Payroll Notes
- UAE salary structures now contribute two new earning components (`travelAllowance`, `reimbursementAllowance`) and an `additionalDeduction` that are factored into payroll net/gross calculations.
- Statutory deductions for UAE documents remain zeroed server side; the additional deduction percentage is applied after attendance adjustments when calculating net pay.
- Existing Indian payroll logic remains unchanged.

## Validation Tips
- Verify that UAE admins only see UAE structures (default filter is driven by the logged-in admin’s country).
- Create a manual payroll run for a UAE employee and confirm the new components appear on the payroll record (`travelAllowance`, `reimbursementAllowance`, `additionalDeduction`).
- Ensure front-end forms capture the new fields before enabling AE structure management in production.
