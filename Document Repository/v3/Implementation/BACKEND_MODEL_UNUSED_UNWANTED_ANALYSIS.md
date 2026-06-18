# Backend Unused / Unwanted Model List

Scope: `RTE-PMS-Backend/src/models`

Last checked: 18 Jun 2026

This file lists only backend model files that are unused, probably unused, or unwanted when the backend is treated as PMS-only.

Checked result:

- Direct unused models: 2
- PMS-only unwanted legacy models: 34
- Total delete-candidate models listed: 36

## Direct Unused Models

These models have no real usage found outside their own file.

| Model | Delete Option | Reason |
|---|---|---|
| `src/models/pms-objective-evidence.model.ts` | Yes | `ObjectiveEvidence` / `IObjectiveEvidence` are not imported or referenced by routes, services, scripts, or tests. |
| `src/models/data-unit.model.ts` | Yes, if old data-unit builder is removed | `DataUnitModel` is not used outside its own file. The matching `dataUnitRoutes` route registration is commented out. |

## PMS-Only Unwanted Models

These are legacy HRMS models, not active PMS core models. Delete these only if this backend is being cleaned down to PMS-only.

| Domain | Models |
|---|---|
| Attendance | `src/models/attendance.model.ts`, `src/models/attendance-record.model.ts`, `src/models/attendance-regularization.model.ts` |
| Leave | `src/models/leave.model.ts`, `src/models/leave-summary.model.ts`, `src/models/leave-release.model.ts`, `src/models/leave-carry-forward.model.ts` |
| WFH | `src/models/wfh.model.ts`, `src/models/wfh-summary.model.ts` |
| Payroll / payslip | `src/models/payrolls.model.ts`, `src/models/payroll-deduction.model.ts`, `src/models/payroll-salary-structure.model.ts`, `src/models/payslip.model.ts` |
| Salary | `src/models/salary-structure.model.ts`, `src/models/salary-assignments.model.ts` |
| Tax | `src/models/tax-declaration.ts`, `src/models/tax-slab.model.ts` |
| Shift | `src/models/shift.model.ts`, `src/models/shift-change-request.model.ts` |
| Training | `src/models/training.model.ts`, `src/models/training-attendance.model.ts` |
| Timesheet | `src/models/timesheet.model.ts`, `src/models/timesheet-file.model.ts` |
| Holiday / calendar | `src/models/holiday-calendar.model.ts`, `src/models/weekend-calendar.model.ts`, `src/models/optional-holiday-request.model.ts` |
| Permission legacy | `src/models/permission.model.ts`, `src/models/permission-summary.model.ts` |
| Organization / reports / admin legacy | `src/models/organization.model.ts`, `src/models/overtime.model.ts`, `src/models/final-settlement.model.ts`, `src/models/reports.model.ts`, `src/models/social-event.model.ts` |
| Legacy documents | `src/models/document.model.ts` |

## Cleanup Notes

After deleting any model:

1. Remove its export from the models barrel file.
2. Remove matching route/service imports if they still exist.
3. Run TypeScript build.
4. If deleting legacy HRMS groups, remove in this order: routes, services, models.
