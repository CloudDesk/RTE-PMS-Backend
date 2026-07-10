# Objective Master Assignment Period Simplified Plan

## 1. Purpose

This document defines the simplified implementation plan for assigning Objective Master versions directly to employees.

This plan is intentionally smaller than the broader `Objective_Assignment_Window_Template_Timing_Architecture_Report.md`.

The broader report remains valid for future PMS cycle, template timing, manager review, scoring, and assignment-window architecture. This document is for the current reduced Objective Master assignment scope only.

## 2. Current Scope

The current scope is:

```text
Objective Master Version
-> Objective Assignment Period
-> Employee Assignment
-> Employee fills objective sheet
-> Manager/Admin/Director view
-> Report
```

The current scope does not include:

```text
PMS template review workflow
Manager review window
Reviewer workflow
Scoring
Weightage
Annual decision
Term review approval
Freeze window
Separate achievement window
SLA window
```

## 3. Main Decision

Create a separate Objective Assignment Period for Objective Master assignment.

Do not merge this into the existing PMS Cycle.

Do not reuse the existing PMS Cycle by replacing `templateId` with `objectiveMasterVersionId`.

Reason:

```text
PMS Cycle is template-driven and review-workflow-driven.
Objective Assignment Period is objective-sheet-driven and fill-period-driven.
```

Keeping them separate avoids misleading UI, incorrect workflow assumptions, and future maintenance issues.

## 4. Relationship With Existing PMS Cycle

The Objective Assignment Period may optionally reference an existing PMS Cycle for reporting alignment.

Example:

```text
Objective Assignment Period: Production Objectives Q1 2026
Linked PMS Cycle: PMS 2026
```

This reference is optional.

If linked:

```text
Use PMS cycle only for year/period context and optional reporting filters.
Do not inherit PMS template workflow.
Do not inherit PMS manager review windows.
Do not create annual assignment or term review records automatically.
```

If not linked:

```text
The Objective Assignment Period works as a standalone objective assignment period.
```

## 5. User-Facing Naming

Use user-friendly naming in the UI.

Recommended user-facing label:

```text
Objective Assignment Period
```

Avoid exposing technical names such as:

```text
OM Cycle
Objective Master Cycle
Assignment Window Snapshot
Freeze Window
Template Timing
```

Internal backend/service names may use technical naming, but UI should stay simple.

## 6. Objective Assignment Period Data

Each Objective Assignment Period should store:

| Field | Required | Meaning |
|---|---:|---|
| name | Yes | User-friendly period name |
| objectiveMasterId | Yes | Parent Objective Master |
| objectiveMasterVersionId | Yes | Exact version assigned |
| periodStartDate | Yes | Overall period start |
| periodEndDate | Yes | Overall period end |
| termType | Yes | Quarterly, Half-yearly, Yearly, or Custom |
| terms | Yes | Selected terms such as Q1-Q4, H1-H2, or Y1 |
| fillStartDate | Yes | Date employee fill opens |
| fillEndDate | Yes | Date employee fill closes |
| linkedPmsCycleId | No | Optional PMS cycle reference for reporting/context |
| status | Yes | Draft, Active, or Closed |
| createdBy | Yes | Audit actor |
| createdAt | Yes | Audit timestamp |
| updatedBy | No | Last update actor |
| updatedAt | No | Last update timestamp |

Do not add separate freeze dates in this simplified scope.

The fill end date is enough to make the assignment read-only.

## 7. Period Status

Use only three Objective Assignment Period statuses.

```text
DRAFT
ACTIVE
CLOSED
```

| Status | User Meaning | System Behavior |
|---|---|---|
| Draft | Setup is being prepared | Not visible to employees |
| Active | Assignment is live | Employees can view; employees can fill only during fill period |
| Closed | Period is completed | Read-only for everyone except permitted admin reporting/audit actions |

Do not add `Frozen` status for now.

Do not add `Applied`, `Published`, or `Archived` unless a real workflow need appears later.

## 8. Employee Assignment Data

When employees are assigned, create employee assignment records.

Each record should store:

| Field | Required | Meaning |
|---|---:|---|
| objectiveAssignmentPeriodId | Yes | Assignment period reference |
| objectiveMasterId | Yes | Objective Master reference |
| objectiveMasterVersionId | Yes | Exact assigned version |
| employeeId | Yes | Assigned employee |
| selectedTerms | Yes | Terms assigned to the employee |
| frozenObjectiveSnapshot | Yes | Locked copy of version data/layout |
| status | Yes | Assigned, Submitted, or Closed |
| submittedAt | No | Employee submit timestamp |
| submittedBy | No | Employee user ID |
| closedAt | No | System/admin close timestamp |
| closedBy | No | Admin/system actor |
| createdBy | Yes | Assignment actor |
| createdAt | Yes | Assignment timestamp |

Snapshot must include:

```text
Title
Description
Objective type
Table columns
Rows
Column groups
Row groups
Formulas
Term availability
Default values
Display labels
```

Later Objective Master Version edits must not change already-assigned employee records.

## 9. Employee Assignment Status

Use only three employee assignment statuses.

```text
ASSIGNED
SUBMITTED
CLOSED
```

| Status | User Meaning | System Behavior |
|---|---|---|
| Assigned | Employee has work to fill | Editable only when period is Active and fill date is open |
| Submitted | Employee has completed entry | Read-only for employee |
| Closed | Fill period ended or admin closed | Read-only |

No manager-review status is required in the current scope.

## 10. Editability Rule

Employee can edit only when all conditions are true:

```text
Objective Assignment Period status = ACTIVE
Today >= fillStartDate
Today <= fillEndDate
Employee Assignment status = ASSIGNED
User is the assigned employee
```

Otherwise the sheet is read-only.

Manager/Admin/Director view rule:

```text
Manager/Admin/Director can view assigned sheets according to access rules.
They cannot edit employee-filled values in this simplified scope.
```

## 11. Submit Logic

Employee can submit during the fill period.

On submit:

```text
Validate required fields.
Store submitted values.
Set Employee Assignment status = SUBMITTED.
Set submittedAt and submittedBy.
Make employee sheet read-only.
```

If employee needs correction after submit, that is outside the current scope unless explicitly approved.

## 12. Auto Close Logic

After `fillEndDate`, the system should treat open assignments as read-only.

Recommended behavior:

```text
If today > fillEndDate:
  Employee cannot edit.
```

Optional scheduled job:

```text
Mark remaining ASSIGNED records as CLOSED after fillEndDate.
```

The UI should not require the user to understand a separate freeze step.

## 13. Term Handling

Objective Assignment Period must define the term structure.

Supported simple term types:

```text
Quarterly: Q1, Q2, Q3, Q4
Half-yearly: H1, H2
Yearly: Y1
Custom: user-defined labels if approved later
```

For the current scope, use fixed term labels unless custom term support is explicitly needed.

## 14. Objective Layout Compatibility

The selected Objective Master Version must be compatible with the selected terms.

Examples:

```text
Objective layout has Q1 Actual, Q2 Actual, Q3 Actual, Q4 Actual.
Assignment Period term type is Quarterly.
Result: valid.
```

```text
Objective layout has Q1-Q4 columns.
Assignment Period term type is Yearly.
Result: show warning or block depending on configuration.
```

Do not silently convert:

```text
Q1 + Q2 -> H1
Q1 + Q2 + Q3 + Q4 -> Y1
```

If yearly summary is required, create an explicit calculated column or formula in the Objective Master layout.

## 15. Formula Behavior

Formula columns must be stored in the assigned snapshot.

Formula columns are system-calculated/read-only.

Examples:

```text
Actual = Sum(Q1 Actual + Q2 Actual + Q3 Actual + Q4 Actual)
Gap = Target - Actual
```

Formula behavior must not depend on PMS template scoring.

This simplified scope is context/reporting only.

## 16. Scoring and Weightage

No scoring in this simplified Objective Master assignment scope.

Do not use:

```text
Objective weightage
Template section weight
Manager score
Overall score
Review score
Annual score
```

If scoring is needed later, it should follow the broader architecture report and Task 2 template scoring policy.

## 17. Roles and Access

Current simplified access:

| Role | Access |
|---|---|
| Assigned Employee | Fill during fill period; view after submit/close |
| Manager | View assigned employee sheet |
| Admin | View/manage assignment period and reports |
| Director/Management | View reports/assigned sheets where allowed |

Do not expose `Reviewer` as a user-facing role in this simplified scope.

Role options should come from Role LOV where UI selection is required.

## 18. Assignment UX

Use a simple wizard.

```text
1. Period
2. Employees
3. Preview
4. Assign
```

### 18.1 Period Step

Fields:

```text
Period name
Objective version
Period start date
Period end date
Term type
Terms
Fill start date
Fill end date
Optional linked PMS cycle
```

Friendly text:

```text
Employees can fill this objective only during the fill period.
After the fill period ends, the sheet becomes read-only.
```

### 18.2 Employees Step

Employee selection should support:

```text
Department filter
Role filter
Employee search
Select all matched
Individual employee selection
```

Always show:

```text
N selected from M matched employees.
```

### 18.3 Preview Step

Preview should show:

```text
Objective version
Period
Terms
Fill period
Selected employee count
Duplicate warnings
Blocked records
```

Employee-level preview columns:

```text
Employee
Department
Role
Terms
Status
Warning/Blocked reason
```

### 18.4 Assign Step

On assign:

```text
Create Objective Assignment Period if not already created.
Create Employee Assignment records.
Store objective snapshots.
Prevent exact duplicate employee assignment for same objective version/period/term.
Write audit log.
```

## 19. Duplicate Rules

Hard block exact duplicates:

```text
same objectiveAssignmentPeriodId
same objectiveMasterVersionId
same employeeId
same term
```

Allow similar objective titles if IDs are different.

Reason:

```text
Different Objective Masters may have similar business wording but represent different records.
```

## 20. Dashboard and Reporting

Dashboard should use simplified status:

```text
Assigned
Submitted
Closed
Overdue
```

Overdue logic:

```text
Period is Active
Today > fillEndDate
Employee Assignment status = ASSIGNED
```

Reports should show:

```text
Period name
Objective Master
Version
Employee
Department
Role
Terms
Submitted status
Submitted date
Filled values
Calculated values
```

Reports should use the frozen assignment snapshot, not latest Objective Master Version.

## 21. Audit

Audit should capture:

```text
Objective Assignment Period created
Objective Assignment Period activated
Objective Assignment Period closed
Employees assigned
Employee values saved
Employee submitted
System/admin closed assignment
Report export, if required
```

Audit should store:

```text
actor
action
target record
before/after where relevant
timestamp
```

## 22. Validation Rules

Hard block:

```text
Objective version is not Active
No period name
Invalid period dates
Invalid fill dates
Fill start date before period start date
Fill end date after period end date
Fill end date before fill start date
No terms selected
No employees selected
Exact duplicate assignment exists
Objective layout term columns conflict with selected terms
Unauthorized user tries to assign
```

Warning only:

```text
Linked PMS cycle dates differ from assignment period dates
Similar objective title already assigned
Some selected employees already have other objectives in same period
```

## 23. Backend Entity Summary

Recommended entities:

```text
ObjectiveAssignmentPeriod
ObjectiveEmployeeAssignment
ObjectiveEmployeeAssignmentValue
ObjectiveAssignmentAudit
```

Do not overload existing PMS Cycle, Annual Assignment, or Term Assignment models for this simplified scope.

## 24. Frontend Screen Summary

Recommended screens:

```text
Objective Assignment Period List
Objective Assignment Period Create/Edit
Assign Employees Wizard
Employee Objective Fill Screen
Manager/Admin/Director View Screen
Objective Assignment Report
```

If scope must be smaller initially, start with:

```text
Assign Employees Wizard
Employee Objective Fill Screen
Report/View Screen
```

## 25. Final Recommendation

Use a separate Objective Assignment Period.

Keep logic simple:

```text
One fill period.
Three period statuses: Draft, Active, Closed.
Three employee statuses: Assigned, Submitted, Closed.
No freeze window.
No manager review window.
No scoring.
No PMS template dependency.
Optional PMS cycle reference only for reporting/context.
```

This gives a clean, user-friendly, and flexible design for current Objective Master assignment without misleading users or mixing it with full PMS cycle/template workflow.

## 26. Implementation Phases

Use six phases for implementation.

### Phase 1: Foundation Models and Statuses

Scope:

```text
Add simple statuses.
Add Objective Assignment Period model.
Add Objective Employee Assignment model.
Export models.
Do not change existing PMS Cycle, Annual Assignment, or template workflow.
```

Expected output:

```text
Backend can store Objective Assignment Periods and Employee Assignments separately from PMS Cycle.
No UI behavior changes yet.
No existing assignment flow replacement yet.
```

Phase 1 test checklist:

| Area | Check | Expected Result |
|---|---|---|
| Build | Run server TypeScript build | Build passes with no TypeScript errors |
| Enum contract | Verify `ObjectiveAssignmentPeriodStatus` exists | Only `DRAFT`, `ACTIVE`, `CLOSED` are available |
| Enum contract | Verify `ObjectiveEmployeeAssignmentStatus` exists | Only `ASSIGNED`, `SUBMITTED`, `CLOSED` are available |
| Model export | Import models from `Server/src/models/index.ts` | `ObjectiveAssignmentPeriod` and `ObjectiveEmployeeAssignment` are exported |
| Period model | Validate required fields | Name, objective master, objective version, dates, term type, terms, fill dates, status, and createdBy are required |
| Period model | Check optional PMS cycle reference | `linkedPmsCycleId` is optional and does not replace PMS Cycle template logic |
| Period model | Check fill window fields | Only `fillStartDate` and `fillEndDate` exist; no freeze/review/SLA window added |
| Employee assignment model | Validate required fields | Period, objective master, version, employee, selected terms, frozen snapshot, status, and createdBy are required |
| Employee assignment model | Check snapshot storage | Frozen objective snapshot is stored on assignment |
| Duplicate protection | Check unique assignment index | Same period + version + employee cannot be inserted twice when `isDeleted=false` |
| UI | Validate UI impact | No UI change expected in Phase 1 |
| API | Validate API impact | No new API expected in Phase 1 |
| Service | Validate service impact | No service behavior expected in Phase 1 |
| Existing PMS flow | Smoke check existing PMS compile/runtime | Existing PMS Cycle/Template flow should not be affected |

### Phase 2: Backend Service and API

Scope:

```text
Create period CRUD APIs.
Create employee assignment preview API.
Create assign/apply API.
Create submit/save employee values API.
Create close period/assignment API.
Add validation for dates, active objective version, selected terms, and duplicates.
```

Phase 2 API checklist:

| API | Method | Purpose | Expected Result |
|---|---|---|---|
| `/pms/objectives/assignment-periods` | `POST` | Create Objective Assignment Period | Creates period in `DRAFT` or requested valid status |
| `/pms/objectives/assignment-periods` | `GET` | List periods | Returns paged period list |
| `/pms/objectives/assignment-periods/:periodId` | `GET` | View one period | Returns selected period |
| `/pms/objectives/assignment-periods/:periodId` | `PUT` | Update period | Updates draft/active period; blocks closed period update |
| `/pms/objectives/assignment-periods/:periodId/activate` | `POST` | Activate period | Sets period status to `ACTIVE` |
| `/pms/objectives/assignment-periods/:periodId/close` | `POST` | Close period | Sets period to `CLOSED` and closes open employee assignments |
| `/pms/objectives/assignment-periods/:periodId/preview` | `POST` | Preview employee assignment | Shows new/already assigned/blocked employees |
| `/pms/objectives/assignment-periods/:periodId/apply` | `POST` | Assign employees | Requires `confirm=true`; creates employee assignments |
| `/pms/objectives/employee-assignments/:assignmentId/values` | `PUT` | Save employee values | Assigned employee can save only during fill period |
| `/pms/objectives/employee-assignments/:assignmentId/submit` | `POST` | Submit employee values | Sets assignment to `SUBMITTED` |
| `/pms/objectives/employee-assignments/:assignmentId/close` | `POST` | Admin close assignment | Sets assignment to `CLOSED` |

Phase 2 validation checklist:

| Check | Expected Result |
|---|---|
| Create period with inactive/draft objective version | Blocked |
| Create period with fill end before fill start | Blocked |
| Create period with fill outside period dates | Blocked |
| Create period with invalid term for term type | Blocked |
| Preview inactive employee | Row marked `BLOCKED` |
| Apply without `confirm=true` | Blocked |
| Apply with duplicate employee in same period/version | Existing employee shown as `ALREADY_ASSIGNED`; duplicate not recreated |
| Employee save outside fill period | Blocked |
| Employee save after submit/close | Blocked |
| Non-assigned employee tries to save | Blocked |
| Close period | Remaining `ASSIGNED` employee records become `CLOSED` |

### Phase 3: Assignment Period UI

Scope:

```text
Create Objective Assignment Period setup screen.
Use simple labels: Period, Terms, Fill Period, Employees, Preview.
Allow optional PMS cycle reference only for reporting/context.
```

### Phase 4: Employee Assignment Wizard

Scope:

```text
Select employees by department, role, search, and selected list.
Show selected count.
Preview blocked/warning rows.
Apply assignment.
```

### Phase 5: Employee Fill and View Screens

Scope:

```text
Employee can fill only during active fill period.
Submitted/closed records become read-only.
Manager/Admin/Director can view.
No reviewer workflow.
No scoring.
```

### Phase 6: Reporting, Audit, and Close Handling

Scope:

```text
Add assignment period reports.
Add overdue/submitted/closed dashboard summary.
Add audit events.
Add optional scheduled close handling after fill end date.
```
