# Backend Unused / Unwanted Model List

Scope: `RTE-PMS-Backend/src/models`

Last checked: 18 Jun 2026

This file lists only backend model files that are unused, probably unused, or unwanted when the backend is treated as PMS-only.

Checked result:

- Direct unused models: 2
- PMS-only unwanted legacy models: 35
- Total delete-candidate models listed: 37

Verification note:

- Active PMS runtime models are not listed in the legacy delete group.
- The only PMS-prefixed direct-unused candidate is `src/models/pms-objective-evidence.model.ts`. It has no route/service/script/test references. Treat it as unused PMS draft/old evidence design, not active PMS runtime.
- Shared current models that must be kept for PMS are not listed: `user.model.ts`, `lov.model.ts`, `audit-log.model.ts`, and `pms-document.model.ts`.

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
| Organization / reports / admin legacy | `src/models/organization.model.ts`, `src/models/overtime.model.ts`, `src/models/final-settlement.model.ts`, `src/models/reports.model.ts`, `src/models/social-event.model.ts`, `src/models/dashboard.model.ts` |
| Legacy documents | `src/models/document.model.ts` |

## Important Cleanup Blockers

The PMS-only unwanted models above are not all technically unused yet. Many are still imported by legacy services, route files, container bindings, or temporary/dev endpoints. If you delete only the model files or MongoDB collections without removing those references, the backend build/runtime can break.

Current route registration status:

- HRMS feature routes are already commented in `src/routes/index.ts` for attendance, leave, overtime, payroll, shift, training, organization, salary, tax, reports, timesheet, holiday/weekend, permissions, WFH, shift-change, optional holidays, final settlement, communication, and bulk attendance upload.
- Active PMS/auth/user/lov route registrations do not directly require the HRMS model list.
- Remaining active HRMS model reachability is through non-PMS leftovers in `src/routes/index.ts`, the active `/dashboard` route, and container service bindings.

Before deleting the legacy groups, remove or refactor these references:

1. `src/routes/index.ts`
   - `dashboardRoutes` is still registered at `/dashboard`.
   - `/dev/run-shift-cron` still imports `updateShiftAssignmentStatuses`, which uses `ShiftAssignment`.
   - `/cleanup-users` still imports/deletes `AttendanceRecord`, `Leave`, `Payroll`, `Payslip`, `SalaryAssignment`, `ShiftAssignment`, `TaxDeclaration`, `TimesheetFile`, and `Timesheet`.
2. `src/container/index.ts` and `src/types/container.ts`
   - Legacy services are still instantiated/typed, including attendance, leave, shift, training, timesheet, tax, salary, payroll, reports, dashboard, WFH, and shift-change services.
3. Legacy service files
   - Services under `src/services/*` still import these models. Remove the service and route together before deleting the model.
4. `src/models/index.ts`
   - Remove exports for deleted model files after routes/services are removed.

## Minimum Backend Cleanup Before Dropping HRMS Collections

For a PMS-only backend, clean the remaining HRMS references in this order:

1. Remove the active legacy `/dashboard` route registration from `src/routes/index.ts`.
   - Remove `import { dashboardRoutes } from "./dashboard.routes";`
   - Remove `fastify.register(dashboardRoutes, { prefix: "/dashboard" });`
   - Then remove `src/routes/dashboard.routes.ts`, `src/services/dashboard.service.ts`, and `src/models/dashboard.model.ts`.
2. Remove temporary/dev HRMS endpoints from `src/routes/index.ts`.
   - Remove `import { updateShiftAssignmentStatuses } from "../utilis/updateShiftAssignmentStatuses";`
   - Remove `/dev/run-shift-cron`.
   - Remove `/cleanup-users` or rewrite it to only use PMS/shared collections.
   - Remove related HRMS model imports from `../models`, `tax-declaration`, and `timesheet-file.model`.
3. Remove unused legacy service bindings from `src/container/index.ts` and `src/types/container.ts`.
   - This is required because services are imported/instantiated even when their routes are commented.
4. Remove unused legacy route files and service files after their registrations/bindings are gone.
5. Remove legacy model exports from `src/models/index.ts`.
6. Run backend TypeScript build.
7. Only then drop the corresponding MongoDB collections.

## DB Cleanup Guardrail

For database cleanup, do not drop PMS/shared collections. Keep collections behind these active models:

- `user.model.ts`
- `lov.model.ts`
- `audit-log.model.ts`
- all active `pms-*` models except `pms-objective-evidence.model.ts` if its collection is confirmed empty/unneeded
- `pms-document.model.ts`

Recommended pre-drop check for every candidate collection:

```js
db.<collectionName>.countDocuments()
```

Only drop a candidate collection after the matching route/service/model references have been removed and the TypeScript build passes.

## Cleanup Notes

After deleting any model:

1. Remove its export from the models barrel file.
2. Remove matching route/service imports if they still exist.
3. Run TypeScript build.
4. If deleting legacy HRMS groups, remove in this order: routes, services, models.
