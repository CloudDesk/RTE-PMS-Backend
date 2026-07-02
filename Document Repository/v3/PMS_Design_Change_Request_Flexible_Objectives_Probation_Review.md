# PMS Design Change Request: Flexible Objective Model and Configurable Probation Review Flow

## 1. Purpose

This document captures new PMS enhancement requirements in a manager-approval format.

The current PMS design remains valid for the approved regular PMS use case. These changes are additional configuration and flexibility requirements for objective management and probation / trainee review handling.

This document covers:

* client request summary
* current PMS behavior
* current limitation / additional configuration required
* proposed dynamic solution
* data design impact
* workflow impact
* UI approach
* validation rules
* audit and reporting impact
* backward compatibility
* implementation impact
* approval points

This document is separate from the "Configurable Section Timing and Manager Review Timing" design change request.

---

## 2. Client Request Summary

The requested changes can be grouped into three main requirement areas.

| Requirement Area | Summary |
|---|---|
| Flexible Objective Master and Assignment Model | Objectives should live outside PMS templates as independent business objects and should be assignable through flexible mapping rules. |
| Flexible Objective Filling, Actuals, and Scoring Governance | Assigned objectives should be fillable by different actors based on role, workflow state, assessment term, and permission policy. Objectives remain context-only unless scoring is explicitly enabled. |
| Configurable Probation / Trainee Manager Review Flow | Probation review should support configurable reviewer responsibility, field-level security, data-grid permissions, sharing/delegation, detailed audit, and flexible approval rules without normal PMS cycle launch. |

---

## 3. Current PMS Behavior

### 3.1 Regular PMS Objective Behavior

The current PMS flow supports objective and review activity inside the PMS cycle / assignment structure.

The current approved behavior includes:

* annual PMS cycle launch
* assessment-term assignment
* objective creation and approval
* employee achievement submission where enabled
* manager review
* term finalization
* yearly Annual Decision after applicable term completion

Templates currently control form structure, sections, fields, permissions, scoring, and runtime rendering.

### 3.2 Probation / Trainee Review Behavior

The current probation / trainee review flow is separate from normal PMS cycle launch.

The current flow supports:

* admin-created probation review assignment
* employee selection
* probation end date
* calculated review open date
* Manager 1 / Reporting Manager
* Manager 2 / Approver
* locked Manager Review Only template version
* Manager 1 draft and submit
* Manager 2 approve or return
* finalization
* cancellation before finalization
* assignment-level audit trail

This current behavior remains valid as the default probation review flow.

---

## 4. Additional Configuration Required

The current design needs additional configuration to support the new flexibility requirements.

### 4.1 Objective Flexibility

Objectives should not be owned by PMS templates by default.

The system should support objective master data outside templates and allow flexible assignment to cycles, assessment terms, departments, teams, roles, employee groups, managers, and employees.

Templates should control how assigned objectives are rendered, validated, filled, reviewed, and scored. Templates should not be the primary owner of objective master data.

### 4.2 Objective Fillability and Actuals

Objective fields should be fillable by different actors depending on role, workflow state, assessment term, and permission policy.

Actual achievement columns should be generated only for the selected cycle term type.

### 4.3 Probation Review Configuration

Probation review should support configurable Manager 1 / Manager 2 responsibilities instead of only one fixed model.

The system should also support field-level and section-level security, data-grid row and column permissions, assignment sharing/delegation, detailed audit, and configurable submission / approval rules.

---

## 5. Proposed Dynamic Solution

The recommended solution is to add configuration layers without changing the approved default flow.

```text
Objective Master
↓
Objective Assignment Rules
↓
Resolved Employee Term Objective Plans
↓
Template Runtime Rendering and Validation
↓
Achievement / Review / Scoring Governance
```

For probation review:

```text
Manager Review Only Template
↓
Probation Review Configuration
↓
Probation Review Assignment
↓
Locked Template + Locked Configuration Snapshot
↓
Configured Reviewer Input / Approval Flow
↓
Finalized Review with Audit
```

---

## 6. Flexible Objective Master and Assignment Model

Objectives shall exist outside PMS templates as configurable business objects.

Supported objective sources:

| Objective Source | Ownership / Creation |
|---|---|
| Company Objectives | Authorized HR/Admin or Management users |
| Department Objectives | Authorized HR/Admin, Department Head, or delegated manager |
| Template-referenced Objectives / Template-linked Objective References | Existing template may reference assigned objectives for rendering, validation, review, or scoring policy without owning the objective master data |
| Manager-created Objectives | Manager creates objectives for assigned employees where permitted |
| Employee-created Objectives | Employee creates self objectives where permitted by workflow |

Objective assignment should support flexible mapping to:

* cycles
* assessment terms
* company
* business unit
* location
* departments
* teams
* roles
* designations
* grades
* employee groups
* reporting manager
* individual employees

Assignment rules should resolve into employee-level term objective plans when:

* PMS cycle is launched
* assessment term is opened
* assignment is refreshed
* authorized HR/Admin explicitly synchronizes objective assignments

The system should strictly apply objectives only to the selected assessment term type and selected term labels.

Supported term labels:

| Cycle Term Type | Supported Actual / Assignment Terms |
|---|---|
| Quarterly | Q1, Q2, Q3, Q4 |
| Half-yearly | H1, H2 |
| Yearly | Y1 |

Selecting Q1-Q4 should not automatically create H1, H2, or Y1 objective assignments.

---

## 7. Flexible Objective Filling, Actuals, and Scoring Governance

Assigned objectives should be fillable based on:

* role
* workflow state
* assessment term
* assignment source
* permission policy
* template rendering policy

Objective values may include:

| Objective Value | Typical Actor |
|---|---|
| Target value | HR/Admin, Management, Department Head, Manager where permitted |
| Target description / guidance | HR/Admin, Management, Department Head, Manager where permitted |
| Actual achievement value | Employee or Manager where permitted |
| Achievement summary | Employee or Manager where permitted |
| Evidence / attachments | Employee or Manager where permitted |
| Employee comments | Employee |
| Manager comments | Manager |
| Rating / score | Manager only when scoring is enabled |

### 7.1 Actual Columns by Cycle Term Type

Actual columns must follow the selected cycle term type only.

| Cycle Term Type | Actual Columns |
|---|---|
| Quarterly | Q1 Actuals, Q2 Actuals, Q3 Actuals, Q4 Actuals |
| Half-yearly | H1 Actuals, H2 Actuals |
| Yearly | Y1 Actual only |

The system should not generate irrelevant actual columns for unselected term types.

Examples:

* Half-yearly cycle should not render Q1-Q4 actual columns.
* Yearly cycle should not render Q/H actual columns.

### 7.2 Target Direction

Objectives should support target direction for measurement interpretation.

Supported values:

```text
HIGHER_IS_BETTER
LOWER_IS_BETTER
```

`HIGHER_IS_BETTER` applies where better performance means meeting or exceeding the target value.

`LOWER_IS_BETTER` applies where better performance means meeting or staying below the target value.

Target direction should guide review interpretation and score calculation only when objective scoring is explicitly enabled.

### 7.3 Default Scoring Behavior

All objective sources should remain context-only by default.

This applies to:

* Company Objectives
* Department Objectives
* Template-referenced Objectives / Template-linked Objective References
* Manager-created Objectives
* Employee-created Objectives

Objectives should become scoreable only when all conditions are met:

| Condition | Requirement |
|---|---|
| Template scoring policy | Objective scoring is explicitly enabled |
| Objective validity | Objective is valid or approved for the assessment term |
| Weightage | Valid weightage exists for the applicable term |
| Scoring total | Scoring totals remain valid |

If objective scoring is not enabled, objectives support planning, alignment, achievement capture, evidence, and manager review context only. They must not contribute to marks, weighted score, term score, or final score.

### 7.4 Workflow Status Reuse

The system should reuse existing objective workflow states wherever possible.

Existing states to reuse:

```text
OBJECTIVE_SETTING_OPEN
OBJECTIVE_DRAFT
OBJECTIVE_SUBMITTED
OBJECTIVE_REVISION_REQUIRED
OBJECTIVE_APPROVED
```

New objective workflow statuses should not be introduced unless absolutely required.

---

## 8. Configurable Probation / Trainee Manager Review Flow

The probation / trainee review flow should use the Manager Review Only template type.

The system should support admin-created Probation Review Assignments without normal PMS cycle launch.

Each assignment should store:

| Field | Description |
|---|---|
| Employee | Employee under probation / trainee review |
| Probation end date | Employee probation / trainee end date |
| Review open date | Calculated or authorized override date |
| Manager 1 / Reporting Manager | First reviewer / input owner |
| Manager 2 / Approver | Second reviewer / approver |
| Locked template version | Manager Review Only template version snapshot |
| Review status | Current assignment workflow status |

Default review open date rule:

```text
Review Open Date = Probation End Date - 30 days
```

### 8.1 Configurable Reviewer Responsibility

The system should support reviewer responsibility modes such as:

| Mode | Behavior |
|---|---|
| Manager 1 fills, Manager 2 approves | Current standard two-step model |
| Manager 1 fills and approves | Single Manager 1 completion where permitted |
| Manager 2 fills and approves | Manager 2 owns both input and approval where permitted |
| Manager 1 and Manager 2 both fill assigned sections, then Manager 2 approves | Split input with Manager 2 final approval |
| Manager 1 and Manager 2 both fill assigned sections, then configured final approver approves | Split input with configured final approver |

When the same user performs both responsibilities, the selected configuration must explicitly allow single-reviewer completion.

When separation of duties is required, Manager 1 and Manager 2 must be different users.

### 8.2 Field-Level and Section-Level Security

Probation review templates should support field-level and section-level security for each reviewer role.

Configuration should define:

* sections visible to Manager 1
* sections editable by Manager 1
* sections visible to Manager 2
* sections editable by Manager 2
* fields read-only for each reviewer
* fields mandatory for each reviewer
* fields hidden from each reviewer
* fields visible only after submission or finalization

Example:

```text
Rows / fields 1-4 are fillable by Manager 1.
Rows / fields 4-10 are fillable by Manager 2.
Shared row / field 4 may be editable by both or controlled by configured ownership rules.
```

These permissions must be enforced server-side. Frontend-only locking is not sufficient.

### 8.3 Data-Grid Row and Column Permissions

For data-grid fields, configuration should support:

* columns Manager 1 can enter
* columns Manager 2 can enter
* fixed/default columns
* mandatory columns
* row add permission per manager role
* row delete permission per manager role
* minimum and maximum row count
* row ownership when a reviewer adds a row

Row addition should store:

* row id
* added by
* added at
* reviewer role at time of addition
* reason or note where configured

Row deletion should be soft-audited and store:

* row id
* deleted by
* deleted at
* previous row values
* reason where configured

For fixed paper-style probation forms, add/delete row behavior may remain disabled.

### 8.4 Sharing and Delegation

Authorized users should be able to share or delegate a probation review assignment.

Sharing and delegation are part of the required probation review scope, not optional future scope.

Sharing/delegation should support:

| Access Type | Description |
|---|---|
| View-only | Shared user can view permitted content |
| Edit access | Shared user can edit selected sections or fields |
| Temporary access | Access has start and end date |
| Acting role | Acting Manager 1, acting Manager 2, reviewer, or observer |
| Revocation | Shared access can be revoked |

Original Manager 1 and Manager 2 ownership must be preserved.

Shared or delegated actions should store:

* original owner
* acting user
* access type
* shared by
* shared at
* expiry date where applicable
* revoked by and revoked at where applicable
* reason or note where configured

Shared access should not allow final approval unless the configuration explicitly permits it.

Even when an acting user completes work through delegation, the system must preserve the original Manager 1 / Manager 2 ownership and separately record the acting user for audit and reporting.

### 8.5 Configurable Submission and Approval Rules

Configuration should support:

* Manager 1 submission required or optional
* Manager 2 approval required or optional
* Manager 1 approval allowed
* Manager 2 fill before approval allowed
* return-to-Manager-1 allowed or disabled
* mandatory return reason
* mandatory approval comments
* auto-finalize after configured reviewer completion where allowed

The current default remains:

```text
SCHEDULED
→ REVIEW_OPEN
→ MANAGER_1_SUBMITTED
→ MANAGER_2_APPROVED
→ FINALIZED
```

With optional return:

```text
MANAGER_1_SUBMITTED
→ RETURNED_TO_MANAGER_1
→ MANAGER_1_SUBMITTED
```

---

## 9. Data Design Impact

### 9.1 Objective Data

Recommended objective data components:

| Component | Purpose |
|---|---|
| Objective Master | Stores company, department, and reusable objective definitions |
| Objective Assignment Rules | Stores mapping rules by cycle, term, department, role, group, manager, or employee |
| Employee Term Objective Plan | Stores resolved objectives for each employee and assessment term |
| Objective Fill Values | Stores target, actual, comments, evidence, and review values |
| Objective Scoring Policy | Stores scoring participation only where enabled by template policy |

### 9.2 Template Relationship

Templates should store rendering and policy references, not objective master ownership.

Templates may control:

* objective section visibility
* objective fields visible/editable by role
* mandatory behavior
* achievement requirements
* manager review fields
* scoring enabled or disabled
* scoring validation rules

### 9.3 Probation Review Data

Recommended probation review data components:

| Component | Purpose |
|---|---|
| Probation Review Assignment | Stores employee, dates, managers, status, locked template version |
| Locked Review Configuration Snapshot | Preserves reviewer responsibility mode, permissions, row/column rules, approval rules |
| Probation Review Values | Stores dynamic section, field, and grid values |
| Sharing / Delegation Records | Stores shared access and acting-user metadata |
| Audit Records | Stores assignment, field, section, row, workflow, sharing, and approval events |

Later template or configuration changes should not affect already-created probation review assignments unless controlled migration or correction is explicitly approved.

---

## 10. Workflow Impact

### 10.1 Regular PMS Objective Workflow

The regular PMS objective workflow should remain compatible with the current approved flow.

Flexible objective assignments should resolve into the employee term objective plan before or during the relevant objective setting / achievement window.

Where possible, existing objective workflow states should be reused:

```text
OBJECTIVE_SETTING_OPEN
→ OBJECTIVE_DRAFT
→ OBJECTIVE_SUBMITTED
→ OBJECTIVE_APPROVED
```

Alternative state:

```text
OBJECTIVE_REVISION_REQUIRED
```

Company and Department Objectives mapped to an employee term may become part of the objective plan using the configured approval / locking model.

### 10.2 Probation Review Workflow

The probation review flow remains independent from normal PMS cycle launch.

Default flow:

```text
DRAFT
→ SCHEDULED
→ REVIEW_OPEN
→ MANAGER_1_SUBMITTED
→ MANAGER_2_APPROVED
→ FINALIZED
```

Configured responsibility modes may simplify or extend this flow, but the selected status model must remain consistent across APIs, UI, audit logs, and reports.

---

## 11. UI Approach

### 11.1 Objective UI

Recommended screens / UI areas:

| UI Area | Purpose |
|---|---|
| Objective Master | Create and maintain Company / Department / reusable objectives |
| Objective Assignment Rules | Map objectives to cycles, terms, departments, roles, groups, managers, or employees |
| Assignment Preview | Show resolved employee objective plan before launch or synchronization |
| Objective Fill / Achievement Screen | Capture actuals, achievements, evidence, comments |
| Manager Review Screen | Review assigned objectives as context or scoreable items where enabled |
| Scoring Configuration | Enable objective scoring and validate weightage only where required |

### 11.2 Probation Review UI

Recommended screens / UI areas:

| UI Area | Purpose |
|---|---|
| Manager Review Only Template Builder | Configure review sections, fields, grids, permissions |
| Probation Review Configuration | Configure reviewer responsibility, field security, row/column rules, sharing, approval rules |
| Probation Review Assignment | Assign employee, dates, Manager 1, Manager 2, locked template version |
| Probation Review Workspace | Reviewer-specific form entry and approval actions |
| Sharing / Delegation Panel | Grant, revoke, and audit shared access |
| Audit View | Show assignment, field, section, row, sharing, and approval history |

---

## 12. Validation Rules

### 12.1 Objective Validation

The system should validate:

* objective source is valid
* assignment mapping references valid cycles, terms, employees, departments, roles, or groups
* selected terms match the selected cycle term type
* actual columns match only the selected cycle term type
* unauthorized roles cannot create or map Company / Department Objectives
* objective fill values are allowed for the actor, workflow state, and assessment term
* score fields are rejected unless objective scoring is explicitly enabled
* valid weightage exists before scoreable objectives participate in scoring
* scoring totals remain valid
* target direction is one of `HIGHER_IS_BETTER` or `LOWER_IS_BETTER`

### 12.2 Probation Review Validation

The system should validate:

* employee exists and is eligible for probation / trainee review
* probation end date is present
* review open date is calculated as probation end date minus 30 days unless authorized override exists
* Manager 1 and Manager 2 assignment rules are satisfied
* same actor can perform both roles only when configuration allows it
* locked template version exists and belongs to Manager Review Only template type
* actor can view or edit the requested section, field, row, or column
* actor can add or delete rows
* mandatory fields for the actor are complete before submission or approval
* return and approval comments are provided where mandatory
* shared users have active access before acting
* finalized reviews are immutable except through approved correction workflow

---

## 13. Audit and Reporting Impact

### 13.1 Objective Audit

Audit should capture:

* objective master create / update / deactivate
* assignment rule create / update / deactivate
* objective assignment synchronization
* employee term objective plan creation
* objective fill value entry / update
* achievement submission
* attachment upload / delete / download
* scoring participation change
* objective approval / return
* scoring calculation inputs where scoring is enabled

### 13.2 Probation Review Audit

Audit should capture:

* assignment creation
* review opening
* field value entry / update
* section completion
* Manager 1 submission
* Manager 2 return / approval
* finalization
* row add / delete
* sharing / delegation / revocation
* cancellation

Field and section audit logs should preserve:

* assignment id
* section key and label
* field key and label
* previous value
* new value
* actor
* actor role at time of change
* acting-on-behalf-of user where delegated
* timestamp
* workflow status at time of change
* source channel

### 13.3 Reporting

Reports may need fields for:

* objective source
* objective assignment level
* mapped cycle / term
* mapped department / group / employee
* actual column type
* target direction
* scoring participation
* objective approval status
* probation review status
* Manager 1 / Manager 2 / acting reviewer
* shared access status
* section completion status
* finalization date

---

## 14. Backward Compatibility

Existing PMS flow should not be affected.

The current PMS objective and review flow remains valid for the approved regular PMS use case.

Backward compatibility rules:

```text
1. Existing templates continue to work without objective master migration.
2. Existing template-defined objective behavior remains supported where already used.
3. Flexible external objective assignment applies only when enabled/configured.
4. Existing employee-created and manager-created objective behavior remains unchanged by default.
5. Existing probation review flow remains Manager 1 fill + Manager 2 approve unless a different configuration is selected.
6. Locked template versions and locked assignment snapshots preserve historical behavior.
```

No existing finalized records should be recalculated or reinterpreted because of these changes.

---

## 15. Implementation Impact

Implementation impact includes the following required scope:

```text
Objective master data model
Objective assignment rule model
Employee term objective plan generation
Objective value storage
Objective permission checks
Objective scoring validation
Actual column rendering
Template runtime rendering
Probation review configuration model
Probation review assignment model
Probation review permission enforcement
Data-grid row/column permission handling
Sharing/delegation model
Field-level and section-level audit
Row-level audit
Sharing/delegation/revocation audit
Approval/return/finalization audit
Dashboard and reporting
QA test cases
```

---

## 16. Items Not Included / Future Scope

The following items should be treated as future scope unless separately approved:

* automatic recalculation of finalized historical scores
* complex multi-level appraisal approval outside the configured probation review flow
* AI-based objective recommendation
* automated performance score derivation from actual values without explicit scoring policy
* cross-company objective inheritance rules beyond configured mappings
* bulk migration of old template-owned objectives into objective master data
* external HR analytics integration
* notification retry policy changes

---

## 17. Approval Required

Approval is requested to proceed with the following design enhancements:

```text
1. Create Objective Master outside PMS templates.
2. Support Company, Department, Template-referenced Objectives / Template-linked Objective References, Manager-created, and Employee-created objective sources.
3. Add flexible objective assignment rules for cycles, terms, organization structures, roles, groups, managers, and employees.
4. Keep templates responsible for rendering, validation, fillability, review behavior, and scoring policy only.
5. Generate actual columns only from the selected cycle term type: Q1-Q4, H1-H2, or Y1.
6. Add targetDirection values: HIGHER_IS_BETTER and LOWER_IS_BETTER.
7. Keep objectives context-only by default and make them scoreable only when template scoring policy explicitly enables scoring and valid weightage exists.
8. Reuse existing objective workflow states unless a new status is absolutely required.
9. Enhance Probation / Trainee Review using Manager Review Only templates without normal PMS cycle launch.
10. Add configurable reviewer responsibility modes for Manager 1, Manager 2, and final approver behavior.
11. Add server-side field-level, section-level, data-grid row, and data-grid column permissions for probation reviews.
12. Add sharing/delegation support with original Manager 1 / Manager 2 ownership preservation.
13. Track acting user separately from original Manager 1 / Manager 2 ownership for delegated actions.
14. Shared/delegated access must support view-only access.
15. Shared/delegated access must support edit access for selected sections/fields.
16. Shared/delegated access must support temporary access with start/end date.
17. Shared/delegated access must support acting Manager 1, acting Manager 2, reviewer, and observer roles.
18. Shared/delegated access must support revocation.
19. Shared access must not allow final approval unless the selected configuration explicitly permits it.
20. Add detailed audit logs for assignment, field, section, row, sharing, delegation, approval, return, revocation, cancellation, and finalization actions.
21. Preserve locked template version and locked review configuration snapshot at probation assignment creation.
22. Keep existing PMS and probation review flows unchanged by default.
```

---

## 18. Final Recommendation

Proceed with these as separate PMS design enhancements.

The recommended approach keeps the current approved PMS flow intact while adding flexible objective assignment and configurable probation review capability.

The key design principle is:

```text
Objective ownership and assignment should be flexible outside templates.
Templates should control rendering, validation, permissions, review behavior, and scoring policy.
Probation review should use locked template and configuration snapshots so historical assignments remain stable.
```

This approach gives the PMS module more flexibility without forcing changes into the existing approved regular PMS flow.
