# Objective Assignment, Assignment Windows, and Template Review Timing Architecture Report

## 1. Purpose

This document records the agreed architecture for flexible Objective Master assignment, assignment-level windows, and Task 2 template timing behavior.

The goal is to keep the existing PMS cycle design stable while supporting flexible objective assignment, quarterly/half-yearly/yearly fill behavior, yearly manager review behavior, and assignment-specific timing overrides.

This document is based on:

- `PMS_Design_Change_Request_Flexible_Objectives_Probation_Review.md`
- `Implementation_Task_1_Flexible_Objective_Master_Assignment.md`
- `Implementation_Task_2_Objective_Filling_Actuals_Scoring.md`
- current Objective Master UI and assignment implementation discussions

---

## 2. Final Architecture Decision

Keep these layers separate:

```text
Cycle
↓
Template
↓
Objective Master
↓
Objective Assignment Rule
↓
Assignment Window Snapshot
↓
Employee Term Objective Snapshot
↓
Runtime Fill / Review / Reporting
```

Do not move objective assignment timing, template review timing, or per-employee exceptions into Cycle creation.

Cycle should remain the base PMS calendar and term structure. Flexible assignment behavior should be handled through Objective Assignment Rules and optional Assignment Window Snapshots.

---

## 3. Layer Responsibilities

### 3.1 Cycle Layer

Cycle owns the base PMS structure.

Cycle should store:

- cycle name / year
- cycle start date and end date
- assessment term type
  - Quarterly
  - Half-yearly
  - Yearly
- available term labels
  - Quarterly: `Q1`, `Q2`, `Q3`, `Q4`
  - Half-yearly: `H1`, `H2`
  - Yearly: `Y1`
- default cycle-level objective / achievement / review windows where already supported
- annual assignment generation rules

Cycle should not store:

- Objective Master layout
- Objective Assignment Rules
- per-objective assignment timing overrides
- per-employee assignment timing overrides
- template section fill timing
- manager review timing policy
- scoring policy

Cycle creation should remain mostly unchanged. If needed, only term metadata and default window metadata should be made clearer.

### 3.2 Template Layer

Template controls runtime review behavior.

Template should store:

- sections
- fields
- section-level permissions
- field-level permissions
- section fill actor
- section fill timing
- manager/admin review timing
- objective rendering policy
- scoring policy, if enabled
- term aggregation policy

Template can define scenarios such as:

```text
Employee fills objective actuals quarterly.
Manager reviews yearly.
Yearly manager review shows Q1-Q4 actuals as context.
```

Template should not own Objective Master data and should not decide which employee receives which objective.

### 3.3 Objective Master Layer

Objective Master stores reusable objective content and layout.

Objective Master should store:

- objective type
  - Single Objective
  - Objective Table
- source
  - Global
  - Department
- title
- description
- version history
- table columns
- rows
- header groups
- row groups
- formulas
- fill permissions
- term availability

Objective Master should not store scoring contribution.

Scoring behavior belongs to Template/review policy. Objective Master should remain context-first and reusable.

### 3.4 Objective Assignment Rule Layer

Objective Assignment Rule maps an active objective version to cycle, terms, and employees.

Assignment Rule should store:

- objectiveMasterId
- objectiveVersionId
- cycleId
- selected objective fill terms
- assignment criteria
  - department
  - role
  - employee list
  - employee group later
  - manager scope later
- assignment rule status
  - Draft
  - Active
  - Applied
  - Inactive
- createdBy
- createdAt
- appliedBy
- appliedAt

This layer answers:

```text
Who gets this objective, in which cycle, and for which fill terms?
```

### 3.5 Assignment Window Layer

Assignment windows are optional and separate from Cycle.

Default behavior:

```text
Use cycle-level windows.
```

Optional behavior:

```text
Use custom assignment-level windows.
```

Assignment Window should store:

- assignmentRuleId or assignmentBatchId
- cycleId
- selected term labels
- objective setting open date
- objective setting close date
- achievement open date
- achievement close date
- manager review open date
- manager review close date
- due date / SLA date
- window source
  - `CYCLE_DEFAULT`
  - `CUSTOM_ASSIGNMENT`
- locked snapshot flag
- createdBy
- createdAt

This layer answers:

```text
When should this specific assignment be filled and reviewed?
```

### 3.6 Employee Term Objective Snapshot Layer

When assignment is applied, create locked employee-term objective snapshots.

Each snapshot should store:

- objectiveMasterId
- objectiveVersionId
- assignmentRuleId
- annualAssignmentId
- termAssignmentId
- cycleId
- employeeId
- assessmentTerm
- frozen objective title
- frozen objective description
- frozen objective source
- frozen sheet layout
- frozen columns
- frozen rows
- frozen header groups
- frozen row groups
- frozen formulas
- frozen fill permissions
- frozen term availability
- frozen assignment window, if custom or resolved
- createdBy
- createdAt

Later Objective Master changes must not update already assigned Employee Term Objectives automatically.

---

## 4. Term Concepts Must Stay Separate

Do not treat review term and fill term as the same thing.

### 4.1 Fill Terms

Fill terms define when employees/managers enter actual objective values.

Examples:

```text
Q1, Q2, Q3, Q4
H1, H2
Y1
```

### 4.2 Review Terms

Review terms define when manager/admin review or scoring happens.

Examples:

```text
Quarterly manager review
Half-yearly manager review
Yearly manager review
```

### 4.3 Valid Mixed Timing Example

This is valid:

```text
Cycle term type: Quarterly
Objective fill terms: Q1, Q2, Q3, Q4
Template manager review timing: Yearly
Manager review term: Y1 / annual review stage
```

Runtime behavior:

```text
Employee fills Q1-Q4 actuals during quarterly windows.
Manager reviews yearly using Q1-Q4 actuals and calculated Actual / Gap.
```

This should not be blocked.

---

## 5. Task 2 Consideration: Configurable Template Timing

Task 2 includes configurable objective filling, actuals, and scoring governance.

The important Task 2 scenario is:

```text
Some template sections are filled by Employee quarterly.
Manager/Admin review happens yearly.
```

This means:

- employee fill timing can be quarterly
- manager review timing can be yearly
- manager yearly review can display quarterly values
- scoring/aggregation, if enabled, should follow template scoring policy
- Objective Master assignment should not force review timing into the cycle

### 5.1 Template Should Control Section Timing

Template section configuration should support:

- section actor
  - Employee
  - Manager
  - Admin
  - Reviewer
- fill/review timing
  - term-wise
  - quarterly
  - half-yearly
  - yearly
  - custom grouped terms
- visibility timing
- editability timing
- scoring/aggregation policy

Example:

| Section | Actor | Fill Timing | Review Timing |
|---|---|---|---|
| Objective Actuals | Employee | Quarterly | Not applicable |
| Achievement Remarks | Employee | Quarterly | Not applicable |
| Manager Objective Review | Manager | Not applicable | Yearly |
| Admin Final Review | Admin | Not applicable | Yearly |

### 5.2 Objective Assignment Should Respect Template Timing

Objective Assignment should select objective fill terms.

Template should decide how those filled values appear in review.

Example:

```text
Assignment selected terms: Q1, Q2, Q3, Q4
Template review timing: Yearly
Runtime: yearly manager review shows Q1-Q4 columns as read-only/context plus manager review fields.
```

### 5.3 Cycle Creation Impact

Cycle creation does not need a major redesign.

Cycle only needs to clearly expose:

- term type
- term labels
- default term windows
- default review windows where already supported

Do not add template section timing or objective assignment window logic directly into cycle creation.

---

## 6. Objective Assignment UX Plan

Use a stepper for a non-technical user-friendly experience.

```text
Cycle & Terms
↓
Employees
↓
Windows
↓
Preview
↓
Apply
```

### 6.1 Step 1: Cycle & Terms

User selects:

- cycle
- objective fill terms

System displays:

- cycle term type
- available terms
- selected fill terms
- active objective version
- compatibility message
- template review timing summary, if available

Example UI text:

```text
This cycle is Quarterly.
Employees will fill this objective in Q1, Q2, Q3, and Q4.
Manager review is configured as Yearly in the template.
Quarterly actuals will be shown during yearly review.
```

### 6.2 Step 2: Employees

User selects employee scope:

- department
- role
- employee search
- individual employees
- all matched employees

The UI should always show the final selected count.

Example:

```text
3 employees selected from 8 matched.
```

### 6.3 Step 3: Windows

User selects window mode:

```text
Use cycle windows
Set custom assignment windows
```

Default should be:

```text
Use cycle windows
```

If custom is selected, user configures windows for selected terms:

- objective setting open/close
- achievement open/close
- manager review open/close
- due date / SLA date

### 6.4 Step 4: Preview

Preview should show employee x term rows.

Each row should show:

- employee
- department
- role
- selected term
- objective version
- status
  - New
  - Already assigned
  - Warning
  - Blocked
- window source
  - Cycle default
  - Custom assignment window
- warnings
- blocked reason

### 6.5 Step 5: Apply

Apply should:

- create Employee Term Objective snapshots
- preserve source assignment rule references
- prevent exact duplicates
- store assignment window snapshots
- record audit

---

## 7. Compatibility Rules

### 7.1 Hard Block

Hard block when:

- objective version is not Active
- no cycle is selected
- no fill term is selected
- selected fill terms do not exist in the selected cycle
- objective required fields/formulas depend on terms that are not available
- selected term is finalized/closed and no correction flow is allowed
- same objectiveMasterId already exists for the same employee and same assessment term
- user does not have assigner permission

### 7.2 Warning Only

Show warning, not block, when:

- review timing differs from fill timing
- manager yearly review will use quarterly actuals
- custom assignment window overrides cycle window
- similar objective title already exists
- some fields are view-only for selected role

### 7.3 No Silent Term Conversion

Do not automatically convert:

```text
Q1 + Q2 -> H1
Q3 + Q4 -> H2
Q1 + Q2 + Q3 + Q4 -> Y1
```

If such aggregation is needed, it must be configured through template/review aggregation policy, not hidden assignment behavior.

---

## 8. Runtime Resolver Plan

Runtime should resolve these sources in order:

```text
Cycle term structure
↓
Objective Assignment selected fill terms
↓
Assignment window source
↓
Template section timing and review policy
↓
Objective snapshot permissions and term availability
↓
Workflow status
```

### 8.1 Window Resolution

Use:

```text
Custom assignment window if available
else cycle default window
```

### 8.2 Field Visibility / Editability Resolution

Use:

```text
Objective snapshot fill permission
AND template section permission
AND workflow state
AND selected term
AND actor role
```

### 8.3 Review Rendering Resolution

For yearly review using quarterly fills:

```text
Show Q1-Q4 actuals as configured context/read-only fields.
Show calculated Actual / Gap.
Show manager review fields based on template policy.
```

---

## 9. Status Plan

Reuse existing PMS statuses where possible.

Add only missing statuses needed for Objective Assignment.

### 9.1 Assignment Rule Status

```text
DRAFT
ACTIVE
APPLIED
INACTIVE
```

### 9.2 Employee Term Objective Status

Recommended statuses:

```text
ASSIGNED
OBJECTIVE_DRAFT
SUBMITTED
APPROVED
ACHIEVEMENT_OPEN
ACHIEVEMENT_SUBMITTED
REVIEWED
FINALIZED
NOT_APPLICABLE
```

If existing objective/review statuses already cover these states, reuse the existing statuses.

---

## 10. Example Scenario

### Scenario

Template configuration:

```text
Employee objective actuals: Quarterly
Manager objective review: Yearly
```

Cycle:

```text
Cycle type: Quarterly
Terms: Q1, Q2, Q3, Q4
```

Objective Assignment:

```text
Objective version: V1 Active
Fill terms: Q1, Q2, Q3, Q4
Employees: selected by department/role
Window mode: Use cycle windows
```

Runtime:

```text
Q1: Employee fills Q1 Actual.
Q2: Employee fills Q2 Actual.
Q3: Employee fills Q3 Actual.
Q4: Employee fills Q4 Actual.
Yearly review: Manager sees Q1-Q4 actuals, calculated Actual, Gap, and manager review fields.
```

This is valid and should not require changing cycle creation logic.

---

## 11. Implementation Notes

### 11.1 Objective Master Assignment UI

Current assignment screen should evolve into the stepper:

```text
Cycle & Terms
Employees
Windows
Preview
Apply
```

### 11.2 Backend

Backend should support:

- assignment rule creation
- assignment preview
- duplicate prevention
- employee term objective snapshot creation
- assignment window snapshot creation
- audit logging
- server-side permission enforcement

### 11.3 Data Model Additions

Recommended additions:

- `objectiveAssignmentRules`
- `objectiveAssignmentWindowSnapshots`
- `employeeTermObjectiveSnapshots` or equivalent extension to existing Objective records
- audit entries for assignment create/preview/apply/window override

---

## 12. Final Decision

Keep Cycle, Template, Objective Master, Objective Assignment, Assignment Windows, and Employee Term Objective snapshots separate.

Cycle remains the stable base.

Template controls review timing and scoring policy.

Objective Master controls reusable objective content and layout.

Objective Assignment controls who gets the objective and which fill terms apply.

Assignment Windows control timing overrides only when needed.

Employee Term Objective Snapshot preserves historical runtime behavior.

This supports quarterly employee fill with yearly manager review without changing the Cycle creation flow.
