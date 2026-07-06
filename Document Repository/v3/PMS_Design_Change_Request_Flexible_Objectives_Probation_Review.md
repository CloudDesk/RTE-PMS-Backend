# PMS Design Change Request: Flexible Objective Model, Mid-Cycle Assignment Windows, and Configurable Probation Review Flow

## 1. Purpose

This document captures new PMS enhancement requirements in a manager-approval format.

The current PMS design remains valid for the approved regular PMS use case. These changes are additional configuration and flexibility requirements for objective management and probation / trainee review handling.

The approved baseline PMS flow shall remain unchanged by default. The enhancements in this document shall be implemented only as additional configurable capabilities and shall not replace the existing PMS objective, review, annual decision, or probation review behavior.

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

The requested changes can be grouped into four main requirement areas.

| Requirement Area | Summary |
|---|---|
| Flexible Objective Master and Assignment Model | Objectives should live outside PMS templates as independent business objects and should be assignable through flexible mapping rules. |
| Flexible Objective Filling, Actuals, and Scoring Governance | Assigned objectives should be fillable by different actors based on role, workflow state, assessment term, and permission policy. Objectives remain context-only unless scoring is explicitly enabled. |
| Configurable Probation / Trainee Manager Review Flow | Probation review should support configurable reviewer responsibility, field-level security, data-grid permissions, sharing/delegation, detailed audit, and flexible approval rules without normal PMS cycle launch. |
| Configurable Assignment Window Timing for Mid-Cycle Employees | Employees added after cycle launch should support assignment-level objective, achievement, review, and due-date windows without changing the baseline cycle windows. |

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

### 4.4 Mid-Cycle Assignment Window Timing

When an employee joins after the PMS cycle has already been launched, the system should support assignment-level window timing for that employee.

This should allow HR/Admin to assign the employee to applicable remaining assessment terms and configure objective setting, achievement submission, manager review, and due-date windows without changing the global annual cycle configuration for other employees.

---

## 5. Proposed Dynamic Solution

The recommended solution is to add configuration layers without changing the approved default flow.

```text
Objective Master
↓
Objective Assignment Rules
↓
Employee Term Objective Plans
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

For mid-cycle employee assignment windows:

```text
Annual Cycle Already Launched
↓
Employee Added / Becomes Eligible
↓
Annual Assignment Created for Applicable Terms
↓
Assignment Window Policy Applied
↓
Term Window Snapshot Locked
↓
Objective / Achievement / Review Flow Runs for That Employee
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

Assignment rules should be applied into Employee Term Objective plans when:

* PMS cycle is launched
* assessment term is opened
* assignment is refreshed
* authorized HR/Admin explicitly applies objective assignments

The system should strictly apply objectives only to the selected assessment term type and selected term labels.

Supported term labels:

| Cycle Term Type | Supported Actual / Assignment Terms |
|---|---|
| Quarterly | Q1, Q2, Q3, Q4 |
| Half-yearly | H1, H2 |
| Yearly | Y1 |

Selecting Q1-Q4 should not automatically create H1, H2, or Y1 objective assignments.

### 6.1 Objective Master Versioning

Objective Master shall be versioned.

Any edit to Objective Master shall create a new objective version.

Already assigned Employee Term Objectives shall not be updated automatically when Objective Master is edited.

Employee Term Objective shall store:

* objectiveMasterId
* objectiveVersionId
* objective snapshot
* assignment rule references
* annualAssignmentId
* assessment term

Future objective assignments shall use the latest active objective version.

### 6.2 Objective Assignment Duplicate and Conflict Handling

The system shall prevent exact duplicate Employee Term Objectives.

Exact duplicate rule:

```text
same objectiveMasterId + employeeId + assessmentTerm = one Employee Term Objective only
```

If the same objective reaches the same employee and assessment term through multiple assignment rules, the system shall merge it into one Employee Term Objective and preserve all source assignment references.

Different objective IDs with the same or similar title for the same employee and assessment term shall be allowed, because Company, Department, Manager-created, and Employee-created objectives may use similar business wording while representing different records.

The assignment preview should show a possible duplicate warning for similar titles.

Department or Manager objectives may optionally reference `parentObjectiveId` to show alignment with a Company Objective.

Employee Term Objective should store:

* objectiveMasterId
* objectiveVersionId
* sourceType
* assignmentRuleRefs
* parentObjectiveId where applicable
* annualAssignmentId
* employeeId
* assessment term

### 6.3 Objective Assignment Application

Objective assignment rules shall be applied to Annual Assignment assessment-term content.

If objective assignment rules are configured before cycle launch, the system shall apply matching rules during cycle launch when Annual Assignments and term assignments are created.

If objective assignment rules are configured after cycle launch, the system shall show an assignment preview and authorized HR/Admin shall explicitly apply the objective assignment to matching existing Annual Assignments and assessment terms.

Applied objectives shall be stored as Employee Term Objectives under the applicable employee Annual Assignment and assessment term.

After an objective plan is approved or finalized, objectives shall not be silently added, removed, or changed. Any change after approval or finalization shall require authorized reopen, correction, or amendment flow.

### 6.4 Objective Assignment Version and Snapshot Behavior

When an objective is assigned to an employee assessment term, the system shall create an Employee Term Objective using the active Objective Master Version at the time of assignment.

The Employee Term Objective shall store both references and a frozen objective snapshot.

References:

* objectiveMasterId
* objectiveVersionId
* assignmentRuleId
* annualAssignmentId
* employeeId
* assessmentTerm
* cycleId

Frozen objective snapshot:

* objective title
* objective description
* objective source
* KPI / measurement guidance
* target value where applicable
* target description where applicable
* target direction
* priority where applicable
* attachment policy where applicable
* scoreable flag where applicable
* approved weightage where applicable
* applicable term
* owner / assigner metadata

The frozen snapshot shall be used for runtime display, review, audit, reporting, and historical rendering.

Later changes to Objective Master or Objective Master Version shall not update existing Employee Term Objectives automatically.

Future assignments shall use the latest active Objective Master Version.

### 6.5 Employee Term Objective Immutability and Correction

Employee Term Objectives shall be immutable after assignment.

Objective Master edits shall create new versions and shall apply only to future assignments.

If an already assigned Employee Term Objective must be changed, the system shall use a controlled correction / amendment flow.

Correction may support:

* mark Employee Term Objective as not applicable
* replace with another objective version
* preserve old objective snapshot
* capture reason
* capture actor and timestamp
* preserve audit history

Scoring-related changes such as weightage, scoring mode, target value, or target direction shall not be silently changed after assignment.

### 6.6 Objective Owner, Assigner, and Reviewer Permissions

Objective ownership, assignment, and review shall be treated as separate permission responsibilities.

The system shall not assume that the same user can create, assign, and review an objective unless explicitly allowed by role and scope configuration.

| Responsibility | Meaning | Typical Allowed Actions |
|---|---|---|
| Objective Owner | User or role responsible for creating and maintaining Objective Master and Objective Master Versions | Create Objective Master, create new objective version, deactivate objective, maintain title, description, target guidance, KPI guidance, target direction, and scoring-related configuration where permitted |
| Objective Assigner | User or role responsible for applying an objective to cycle, assessment term, department, team, group, manager, or employee scope | Select cycle, select assessment term, select eligible target population, preview impacted employees, apply objective assignment |
| Objective Reviewer | User or role responsible for evaluating assigned Employee Term Objectives during review | View assigned objectives, view achievement/evidence, enter comments, enter rating/score only when scoring is enabled, submit review |

Recommended permission rules:

* HR/Admin may own and assign Company Objectives and may override objective assignments according to permission policy.
* Management may own or activate Company Objectives where configured.
* Department Head may own Department Objectives and assign them only within permitted department scope.
* Manager may create or assign Manager-created Objectives only within direct-report, delegated, or configured hierarchy scope.
* Employee may create Employee-created Objectives only for own assessment term where workflow allows.
* Reviewer may review, comment, rate, or score assigned Employee Term Objectives according to template scoring policy.
* Reviewer shall not edit Objective Master, Objective Master Version, or assignment rules unless separately granted owner or assigner permission.
* Assigner shall not edit Objective Master unless separately granted owner permission.
* Owner shall not automatically assign objectives outside permitted scope unless separately granted assigner permission.

Department Head rule:

* Department Head shall be introduced as a configurable PMS role / scope where required.
* Department Head role shall not be assumed from existing user role data unless role mapping is configured.
* Department Head role shall be treated as department-scoped by default.
* Department Head may create and maintain Department Objectives for own department where allowed.
* Department Head may assign Department Objectives only to employees, teams, or roles within permitted department scope.
* Department Head shall not edit Company Objectives unless explicitly granted permission.
* Department Head shall not review or score employees unless also configured as Manager / Reviewer for those employees.
* If Department Head role mapping is not configured, Department Objective ownership and assignment shall remain with HR/Admin or authorized managers only.

Server-side authorization shall enforce all owner, assigner, and reviewer permissions. Frontend-only role hiding shall not be sufficient.

### 6.7 Company and Department Objective Activation

Company Objectives and Department Objectives shall not require a separate submit/approve workflow in the baseline design.

Objective versions created by authorized Objective Owners shall remain in `DRAFT` status until activated.

Activation by an authorized Objective Owner shall be treated as approval.

Only `ACTIVE` objective versions may be assigned to employees, cycles, assessment terms, departments, teams, roles, or groups.

Supported Objective Version statuses:

| Status | Meaning |
|---|---|
| DRAFT | Objective version is created but not assignable |
| ACTIVE | Objective version is approved and assignable |
| INACTIVE | Objective version is temporarily disabled and not assignable |
| ARCHIVED | Objective version is retained for history only |

Activation rules:

* HR/Admin or Management may activate Company Objective versions where permitted.
* HR/Admin, Department Head, or delegated manager may activate Department Objective versions within configured scope.
* Department Head activation shall be restricted to permitted department scope.
* Inactive or archived objective versions shall not be assignable.
* Existing Employee Term Objectives linked to older active versions shall remain unchanged when a new objective version is activated.

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
NOT_APPLICABLE
```

`HIGHER_IS_BETTER` applies where better performance means meeting or exceeding the target value.

`LOWER_IS_BETTER` applies where better performance means meeting or staying below the target value.

`NOT_APPLICABLE` applies where the objective is descriptive, context-only, manually reviewed, or does not require numeric target interpretation.

Target direction should be required only when the objective uses numeric target-based interpretation or target-based score calculation.

Target direction should guide review interpretation and score calculation only when objective scoring is explicitly enabled.

### 7.2.1 Target Direction Impact on Scoring

Target direction shall guide scoring interpretation when objective score is calculated from target value and actual achievement value.

Target direction shall not automatically calculate score unless the locked template scoring policy explicitly enables target-based score calculation.

When manager manually enters objective score, target direction shall be displayed as measurement guidance only.

If target-based score calculation is enabled, recommended formulas are:

```text
HIGHER_IS_BETTER Score = min((Actual Value / Target Value) x 100, 100)
LOWER_IS_BETTER Score = min((Target Value / Actual Value) x 100, 100)
```

The calculated score shall be capped at 100 unless the template explicitly allows overachievement scoring.

If target-based score calculation is enabled and actual value, target value, or applicable target direction is missing, the system shall not auto-calculate objective score and shall follow the configured fallback rule.

In the current design approval, automatic score derivation from actual values is not enabled by default. It may be configured only when explicitly supported by the locked template scoring policy.

### 7.2.2 Achievement Actual Value Validation by Target Direction

Actual achievement value shall be validated for data format and completeness, not for performance success by default.

Target direction shall be used to interpret whether actual performance met the target, but it shall not block actual value entry only because the target was not achieved.

| Area | Gap | Proposed Rule / Entry |
|---|---|---|
| Actual value format | Not defined | Validate numeric value when measurement type is numeric |
| Mandatory actual value | Not defined | Require actual value only when configured as mandatory |
| Target direction usage | Not defined | Use target direction for interpretation, not default blocking |
| HIGHER_IS_BETTER interpretation | Not defined | Target met when Actual Value >= Target Value |
| LOWER_IS_BETTER interpretation | Not defined | Target met when Actual Value <= Target Value |
| Target not met behavior | Not defined | Allow submission, show Target Not Met, require comment only if configured |
| Auto score calculation | Not default scope | Apply only when template explicitly enables target-based score calculation |
| Non-numeric objectives | -- | Do not apply numeric target comparison |
| Context-only objectives | -- | Actual value may be captured as evidence/context only |
| Missing target value | Not defined | Do not auto-calculate score; follow configured fallback |

Validation shall ensure:

* actual value is numeric where the objective measurement type is numeric
* actual value is present where configured as mandatory
* actual value uses the configured unit or measurement type where applicable
* actual value is within configured hard data limits where defined
* target direction is available when target-based interpretation or auto-calculation is enabled
* target direction may be `NOT_APPLICABLE` when the objective does not use numeric target interpretation

If the actual value does not meet the target, the system shall allow submission but may:

* show status as Target Not Met
* require employee/manager comment where configured
* allow manager to consider it during review
* use it for score calculation only when target-based scoring is explicitly enabled

The system shall block actual value only when:

* required actual value is missing
* actual value format is invalid
* numeric value is required but non-numeric data is entered
* configured hard limit is violated
* target-based score calculation is enabled but required target/actual/applicable direction data is missing

### 7.2.3 Actual Aggregation Mode for Multi-Term Objectives

When the same measurable objective has actual values across multiple assessment terms, the system shall use a configured actual aggregation mode before target-based auto score calculation.

Actual aggregation mode determines which actual value is used for the objective score calculation. It is different from term aggregation policy, which combines already-calculated term scores for grouped or annual reviews.

Supported actual aggregation modes:

| Mode | Behavior |
|---|---|
| LATEST_VALUE | Uses the latest applicable term actual value |
| SUM_OF_TERMS | Adds actual values from included terms |
| AVERAGE_OF_TERMS | Uses the average actual value across included terms |
| MAX_OF_TERMS | Uses the highest actual value across included terms |
| MIN_OF_TERMS | Uses the lowest actual value across included terms |

Default actual aggregation mode shall be `LATEST_VALUE`.

Example for `HIGHER_IS_BETTER` with `LATEST_VALUE`:

```text
Target = 100
Q1 Actual = 10
Q2 Actual = 30
Q3 Actual = 60
Q4 Actual = 85
Aggregated Actual = 85
Score = min((85 / 100) x 100, 100) = 85
```

Example for `LOWER_IS_BETTER` with `LATEST_VALUE`:

```text
Target = 5
Q1 Actual = 20
Q2 Actual = 12
Q3 Actual = 8
Q4 Actual = 4
Aggregated Actual = 4
Score = min((5 / 4) x 100, 100) = 100
```

The selected actual aggregation mode shall be stored in the locked template scoring policy or assigned objective scoring snapshot where target-based auto score calculation is enabled.

If target-based auto score calculation is not enabled, actual aggregation mode may still be stored for reporting or comparison, but it shall not affect score calculation.

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

### 7.4 Objective Scoring Modes

When objective scoring is explicitly enabled by template scoring policy, the system should support configurable objective scoring modes.

Recommended scoring modes:

| Objective Scoring Mode | Behavior |
|---|---|
| CONTEXT_ONLY | Default behavior. Objectives are visible for planning, achievement, evidence, and manager review context only. No objective score is captured or calculated. |
| WEIGHTED_OBJECTIVE_SCORE | Manager enters a score for each scoreable objective. Each objective score must be capped at 100, objective weightage must be valid, and weighted objective totals must follow the configured scoring policy. |
| OVERALL_OBJECTIVE_SCORE | Manager reviews all assigned objectives together and enters one overall objective score for the objective section. The overall score must be capped at 100. |

The template scoring policy should allow only one active objective scoring mode for the same objective section at a time.

Per-objective weighted scoring and one overall objective score shall not both contribute to the same objective score total. This prevents duplicate counting and conflicting scoring outcomes.

Manager-entered objective scores must not exceed 100. Weighted calculations must not cause the configured objective scoring total or final term score to exceed the configured template scoring total.

### 7.4.1 Objective Weighted Scoring Formula

Weighted objective scoring shall apply only when objective scoring mode is `WEIGHTED_OBJECTIVE_SCORE`.

Only scoreable objectives shall participate in weighted objective scoring. Non-scoreable objectives shall remain planning, achievement, evidence, and review context only.

Each scoreable objective shall have valid weightage for the applicable assessment term.

Manager-entered score shall be captured from 0 to 100.

Weighted score shall be calculated as:

```text
Objective Weighted Score = (Manager Score / 100) x Objective Weightage
```

Objective section score shall be calculated as:

```text
Objective Section Score = Sum of Objective Weighted Scores
```

Example:

| Objective | Weightage | Manager Score | Weighted Score |
|---|---:|---:|---:|
| Improve Quality | 40 | 80 | 32 |
| Reduce Rework | 30 | 90 | 27 |
| Timely Delivery | 30 | 70 | 21 |

```text
Objective Section Score = 32 + 27 + 21 = 80
```

If the objective section itself has a configured template weight, the objective section contribution to term score shall be calculated as:

```text
Objective Section Contribution = (Objective Section Score / 100) x Objective Section Template Weight
```

If no scoreable objectives exist for the employee and assessment term, the system shall follow the configured no-objective scoring policy.

Supported no-objective scoring policies:

| Policy | Behavior |
|---|---|
| NO_OBJECTIVES_NOT_APPLICABLE | Objective scoring is skipped for that employee and term |
| REALLOCATE_OBJECTIVE_WEIGHT | Objective section weight is reallocated according to configured template policy |
| BLOCK_REVIEW_SUBMISSION | Review submission is blocked until scoreable objectives are available or scoring configuration is corrected |
| ALLOW_MANUAL_OVERALL_SCORE | Manager may enter one overall objective score if template policy allows it |

Default policy shall be `NO_OBJECTIVES_NOT_APPLICABLE`.

Weighted scoring validation shall ensure:

* manager score is between 0 and 100
* only scoreable objectives are included
* objective weightage is valid for the applicable term
* total objective weightage does not exceed the configured objective scoring total
* calculated objective section score does not exceed 100
* final term score does not exceed the configured template scoring total

### 7.4.2 Overall Objective Score Contribution

Overall objective scoring shall apply only when objective scoring mode is `OVERALL_OBJECTIVE_SCORE`.

In this mode, the manager shall review all applicable objectives together and enter one overall objective score for the objective section.

The overall objective score shall be captured from 0 to 100.

The overall objective score is not the final PMS score. It represents only the objective section score.

If the objective section has a configured template weight, the objective section contribution to the term score shall be calculated as:

```text
Objective Section Contribution = (Overall Objective Score / 100) x Objective Section Template Weight
```

Example:

| Template Section | Section Weight |
|---|---:|
| Objectives | 40 |
| Competencies | 30 |
| Manager Assessment | 30 |

If the manager enters:

```text
Overall Objective Score = 80
Objective Section Contribution = (80 / 100) x 40 = 32
```

The final term score shall include the objective section contribution along with other configured scoring section contributions.

```text
Final Term Score =
Objective Section Contribution
+ Competency Section Contribution
+ Manager Assessment Section Contribution
```

### 7.4.3 Score Override Rule

Score override is not part of this design approval.

Objective scoring shall be controlled only by the locked template scoring policy and the assigned objective scoring configuration.

Managers shall not override objective scoring mode during review.

Managers shall not convert a non-scoreable objective into a scoreable objective during review.

Managers shall not change objective weightage during review.

Managers shall not enter both per-objective weighted scores and overall objective score for the same objective section.

The applicable scoring input shall depend on the configured objective scoring mode:

| Objective Scoring Mode | Manager Scoring Input |
|---|---|
| CONTEXT_ONLY | No objective score input |
| WEIGHTED_OBJECTIVE_SCORE | Score per scoreable objective only |
| OVERALL_OBJECTIVE_SCORE | One overall objective section score only |

Manual objective score entry is allowed only when the locked template scoring policy permits it.

Any scoring change after assignment, such as scoreable flag, objective weightage, scoring mode, target value, or target direction, shall require controlled correction/amendment flow with reason, actor, timestamp, and audit trail.

No ad hoc score override shall be allowed from the manager review screen.

### 7.4.4 Objective Scoring Mode Storage

Objective scoring mode shall be stored in the locked Template Version, not directly in Objective Master.

The Template Version shall define how assigned objectives are used during review.

The locked Template Version should store:

* objective scoring mode
* objective section template weight
* whether objective scoring is enabled
* whether per-objective score entry is allowed
* whether overall objective score entry is allowed
* no-objective scoring policy
* review timing policy
* included assessment term grouping policy
* term aggregation policy
* scoring validation rules

Objective Master Version may store objective business attributes such as title, description, KPI guidance, target value, target direction, and default scoring eligibility reference where required, but it shall not be the primary owner of the review scoring mode.

Employee Term Objective shall store the assigned objective snapshot and scoring-related assignment values where applicable, such as scoreable flag and approved weightage.

Manager Review shall store manager-entered score values and calculated scoring snapshot.

At runtime, the system shall resolve scoring as:

```text
Locked Template Version
+ Employee Term Objective Snapshot
+ Manager Review Score Inputs
= Calculated Review Score Snapshot
```

### 7.4.5 Objective Scoring Across Configurable Review Timing

Objective assignment term and manager review timing shall be treated as separate configuration concepts.

Objectives shall remain linked to their assigned assessment terms such as Q1, Q2, Q3, Q4, H1, H2, or Y1.

The manager review instance shall define which assessment terms are included for review and scoring.

Examples:

| Review Timing | Included Objective Terms |
|---|---|
| TERM_WISE | Current assessment term only, such as Q1 only |
| GROUPED_TERMS | Configured group of terms, such as Q1 + Q2 |
| ANNUAL | All applicable terms for the annual cycle, such as Q1 + Q2 + Q3 + Q4 |
| CUSTOM_GROUPED | Configured custom term group |

When a review instance includes multiple assessment terms, the manager review screen shall display included objectives grouped by assessment term.

Objective score shall first be calculated at the included assessment-term level.

For `WEIGHTED_OBJECTIVE_SCORE`:

```text
Term Objective Score = Sum of Objective Weighted Scores for that included term
```

For `OVERALL_OBJECTIVE_SCORE`:

```text
Term Objective Score = Manager-entered overall objective score for that included term or review group, according to locked template policy
```

If a review instance includes multiple terms, the objective section score shall be aggregated using the configured term aggregation policy.

Supported term aggregation policies:

| Policy | Behavior |
|---|---|
| EQUAL_TERM_AVERAGE | Average all included term objective scores equally |
| TERM_WEIGHTED_AVERAGE | Apply configured term weights to included term objective scores |
| MANUAL_GROUP_OVERALL_SCORE | Manager enters one overall objective score for the full review group where template policy permits |

Default policy shall be `EQUAL_TERM_AVERAGE`.

Example for annual review with equal term average:

```text
Included terms = Q1 + Q2 + Q3 + Q4
Q1 Objective Score = 80
Q2 Objective Score = 70
Q3 Objective Score = 90
Q4 Objective Score = 85

Objective Section Score = (80 + 70 + 90 + 85) / 4 = 81.25
```

Example for annual review with configured term weights:

```text
Objective Section Score =
(Q1 Objective Score x Q1 Term Weight)
+ (Q2 Objective Score x Q2 Term Weight)
+ (Q3 Objective Score x Q3 Term Weight)
+ (Q4 Objective Score x Q4 Term Weight)
```

Term weights must total 100% for the included review group when `TERM_WEIGHTED_AVERAGE` is used.

Non-scoreable objectives from included terms shall remain visible as planning, achievement, evidence, and review context only.

If an included term has no scoreable objectives, the configured no-objective scoring policy shall apply for that term before review group aggregation.

The calculated objective section score from a grouped or annual review shall then contribute to final term/review score using the objective section template weight.

```text
Objective Section Contribution = (Objective Section Score / 100) x Objective Section Template Weight
```

Later changes to review timing, term grouping, or term aggregation policy shall not recalculate finalized historical review scores.

### 7.5 Workflow Status Reuse

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

Sharing and delegation rules shall be controlled by the locked Probation Review Configuration.

Actual sharing and delegation records shall be stored against the Probation Review Assignment.

The configuration shall define:

* whether sharing/delegation is allowed
* who can grant shared access
* who can revoke shared access
* allowed access type: view-only or edit
* allowed acting role: acting Manager 1, acting Manager 2, reviewer, or observer
* allowed sections and fields
* temporary access start and end date
* whether shared users can approve

Each sharing/delegation record shall store:

* assignment id
* original owner
* acting user
* acting role
* access type
* permitted sections and fields
* valid from date
* valid to date
* shared by
* shared at
* revoked by
* revoked at
* status: ACTIVE, EXPIRED, REVOKED

Revocation rule:

* HR/Admin may revoke shared access where permitted.
* The user who granted access may revoke that access where permitted.
* The system shall automatically expire temporary access after the valid-to date.

All share, revoke, expire, and delegated usage actions shall be audited.

### 8.4.1 Delegated User Permission Boundary

Delegated or shared users shall receive only the access explicitly granted in the sharing/delegation record.

Delegation shall not transfer full ownership of the probation review assignment.

Original Manager 1 and Manager 2 ownership shall remain unchanged.

Delegated access shall be limited by:

* locked Probation Review Configuration
* sharing/delegation record
* acting role
* permitted sections
* permitted fields
* access type
* valid from and valid to dates
* workflow status
* confidential field rules

Delegated users shall not automatically receive:

* full Manager 1 or Manager 2 permissions
* final approval rights
* access to hidden or confidential fields
* right to share/delegate to another user
* right to revoke other users' access
* access after expiry or revocation
* access outside the assigned sections or fields

Delegated users may approve only when the locked configuration explicitly permits approval by the acting role.

Every delegated action shall store:

* original owner
* acting user
* acting role
* action performed
* section / field affected
* timestamp
* workflow status
* source channel

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

### 8.6 Data-Grid Edit Conflict Handling

Data-grid row and field edit ownership shall be controlled by locked Probation Review Configuration.

By default, the same editable field or cell shall have only one editable owner for a given workflow state.

If both Manager 1 and Manager 2 need to provide input for the same review item, the recommended configuration is to use separate columns or fields.

Supported conflict handling modes:

| Mode | Behavior |
|---|---|
| SINGLE_OWNER | Only the configured owner can edit the cell or field. This is the default mode. |
| SEPARATE_COLUMNS | Manager 1 and Manager 2 enter values in separate configured columns or fields. |
| LOCK_AFTER_SUBMIT | Manager 1 can edit before submission; Manager 2 can edit only after Manager 1 submission where configured. |
| LAST_WRITE_WINS | Latest permitted edit becomes the current value, with full audit history. Use only when explicitly configured. |

When `LAST_WRITE_WINS` is enabled, the system shall audit:

* previous value
* new value
* previous actor
* new actor
* timestamp
* workflow status
* acting role
* source channel

The system shall reject edits where the actor is not allowed to edit the cell, field, row, section, or workflow state.

Frontend-only edit restriction shall not be sufficient. Server-side validation is mandatory.

### 8.7 Probation Reviewer Responsibility Configuration Storage

Probation reviewer responsibility rules shall be stored in Probation Review Configuration.

The Manager Review Only Template Version shall store form structure such as sections, fields, grid definitions, and template-level rendering rules.

The Probation Review Configuration shall store workflow and reviewer responsibility behavior such as:

* reviewer responsibility mode
* Manager 1 input requirement
* Manager 2 input requirement
* final approver role
* whether Manager 1 can approve
* whether Manager 2 can approve
* whether same user can act as Manager 1 and Manager 2
* separation-of-duties rule
* return-to-Manager-1 rule
* mandatory return reason
* mandatory approval comment
* auto-finalization rule
* sharing/delegation permission rule

When a Probation Review Assignment is created, the system shall preserve:

* locked Manager Review Only Template Version
* locked Probation Review Configuration snapshot
* Manager 1
* Manager 2
* configured final approver where applicable
* reviewer responsibility mode
* field/section permission snapshot
* data-grid permission snapshot
* sharing/delegation policy snapshot
* approval and return rule snapshot

Later changes to Probation Review Configuration or Template Version shall not alter already-created assignments unless an authorized correction or migration is performed.

Runtime probation review behavior shall be resolved from:

```text
Locked Template Version
+ Locked Probation Review Configuration Snapshot
+ Probation Review Assignment Actors
= Allowed reviewer actions
```

### 8.8 Probation Status Transitions for Configured Reviewer Modes

Probation review status transitions shall be controlled by the locked Probation Review Configuration.

The default two-step flow shall remain:

```text
DRAFT
→ SCHEDULED
→ REVIEW_OPEN
→ MANAGER_1_SUBMITTED
→ MANAGER_2_APPROVED
→ FINALIZED
```

For single-reviewer or alternate reviewer modes, the configuration may allow simplified transitions.

Supported transition patterns:

| Reviewer Mode | Allowed Transition |
|---|---|
| Manager 1 fills, Manager 2 approves | REVIEW_OPEN → MANAGER_1_SUBMITTED → MANAGER_2_APPROVED → FINALIZED |
| Manager 1 fills and approves | REVIEW_OPEN → FINALIZED |
| Manager 2 fills and approves | REVIEW_OPEN → FINALIZED |
| Manager 1 and Manager 2 both fill, Manager 2 approves | REVIEW_OPEN → MANAGER_1_SUBMITTED → MANAGER_2_APPROVED → FINALIZED |
| Manager 1 and Manager 2 both fill, configured final approver approves | REVIEW_OPEN → MANAGER_1_SUBMITTED → MANAGER_2_APPROVED / FINAL_APPROVER_APPROVED → FINALIZED |

Where the implementation does not store a separate approval status, the system may store:

```text
status = FINALIZED
auditAction = MANAGER_1_APPROVED / MANAGER_2_APPROVED / FINAL_APPROVER_APPROVED
```

The selected status handling shall remain consistent across APIs, UI, audit logs, and reports.

For single-reviewer completion:

* configured reviewer must complete all mandatory fields assigned to that role
* approval permission must be enabled in locked configuration
* finalization shall create approval and finalization audit entries
* same-user Manager 1 / Manager 2 completion shall be allowed only when configuration permits single-reviewer completion

Return flow shall apply only when the selected reviewer mode includes a return step.

Invalid transitions shall be rejected server-side.

### 8.8.1 Finalized Probation Review Protection

Finalized probation reviews shall not be reopened, edited, returned, cancelled, or corrected through the standard flow in this design approval.

Correction and cancellation shall be allowed only before finalization.

If a finalized probation review contains an error, the current approved behavior shall preserve the finalized record as historical audit and require a new authorized review assignment or a separately approved future correction process.

Finalized review values, approval actions, locked template version, locked configuration snapshot, and audit history shall remain immutable.

### 8.9 Field and Section Permission Precedence

Permission evaluation shall follow the most restrictive rule.

When multiple permission rules apply to the same section, field, row, column, or cell, deny / hidden / read-only rules shall override allow / visible / editable rules.

Permission precedence shall be evaluated in this order:

| Priority | Rule Type | Behavior |
|---|---|---|
| 1 | Finalized / locked record protection | Blocks standard edits |
| 2 | Confidential or hidden rule | Hides data and prevents API return where configured |
| 3 | Assignment ownership / active delegation | Actor must be owner or active delegated/shared user |
| 4 | Workflow status permission | Actor can act only in allowed workflow status |
| 5 | Section permission | Controls section visibility and editability |
| 6 | Field permission | Controls field visibility, editability, and mandatory behavior |
| 7 | Data-grid row / column / cell permission | Controls row, column, and cell-level edit behavior |
| 8 | Mandatory rule | Enforced only for visible and applicable fields |

Permission rules:

* Hidden section shall hide all fields inside the section.
* Read-only section shall make fields read-only unless explicit field-level override is allowed by configuration.
* Hidden field shall not be returned in API responses where confidentiality requires masking.
* Field-level hidden/read-only rule shall override section-level editable rule.
* Data-grid cell edit shall be allowed only when section, field, row, column, workflow status, and actor permission all allow edit.
* Delegated users shall receive only the permissions explicitly granted and shall still be restricted by confidential, workflow, section, field, row, and column rules.
* Frontend-only permission enforcement shall not be sufficient. Server-side enforcement is mandatory.

---

## 9. Configurable Assignment Window Timing for Mid-Cycle Employees

This enhancement supports employees who join, become eligible, transfer into scope, or are added to PMS after the annual cycle has already been launched.

The approved baseline cycle windows shall remain unchanged for existing employees. Mid-cycle window timing shall apply only to the affected employee assignment where configured.

### 9.1 Assignment-Level Window Policy

The system shall support assignment-level window policy for Annual Assignments created after cycle launch.

Assignment-level windows may override cycle-level default windows only for the selected employee assignment and selected assessment terms.

Supported assignment window types:

| Window Type | Purpose |
|---|---|
| Objective Setting Window | Allows objective creation / assignment for the employee's applicable term |
| Objective Approval Window | Allows manager approval / return for employee objectives where required |
| Achievement Submission Window | Allows employee or manager achievement / actual value entry where enabled |
| Manager Review Window | Allows manager review input for the configured review timing |
| Finalization Due Date | Defines due date for term or review finalization tracking |
| SLA / Reminder Dates | Defines assignment-specific due dates for dashboard and reminder calculation |

### 9.2 Window Timing Modes

Assignment-level windows shall support configurable timing modes.

Supported timing modes:

| Timing Mode | Behavior |
|---|---|
| INHERIT_CYCLE_WINDOW | Use existing cycle-level window timing |
| FIXED_DATE_RANGE | HR/Admin enters explicit start and end dates |
| RELATIVE_TO_ASSIGNMENT_DATE | Window opens/closes based on assignment creation date |
| RELATIVE_TO_JOINING_DATE | Window opens/closes based on employee joining date |
| RELATIVE_TO_TERM_DATE | Window opens/closes based on selected assessment term date |
| MANUAL_OPEN_CLOSE | Authorized HR/Admin manually opens or closes the assignment window |

Default behavior shall be `INHERIT_CYCLE_WINDOW` for existing assignments.

For mid-cycle assignments, HR/Admin may select another timing mode without changing the annual cycle windows for other employees.

### 9.3 Applicable Term Selection for Mid-Cycle Employees

When an employee is added after cycle launch, HR/Admin shall select applicable assessment terms for that employee assignment.

Examples:

| Employee Join / Eligibility Scenario | Recommended Term Handling |
|---|---|
| Employee joins before Q1 closes | Q1 may be included if HR/Admin configures an assignment window |
| Employee joins after Q1 closes | Q1 should be marked not applicable or closed for that employee |
| Employee joins during Q2 | Q2, Q3, Q4 may be assigned based on policy |
| Half-yearly cycle mid-entry | H1 or H2 assignment depends on join/eligibility date and HR/Admin selection |
| Yearly cycle mid-entry | Y1 may be assigned with assignment-level windows |

At least one applicable term must remain selected when creating a mid-cycle Annual Assignment.

Past terms shall not be silently included. HR/Admin must explicitly include a current or past term and configure valid assignment-level windows if late objective, achievement, or review activity is allowed.

### 9.4 Assignment Window Snapshot

Each mid-cycle Annual Assignment shall preserve the window configuration used at assignment creation.

The assignment window snapshot shall store:

* window policy mode
* selected applicable terms
* objective setting window per applicable term
* objective approval window per applicable term where required
* achievement submission window per applicable term where enabled
* manager review window or review group window
* finalization due date
* SLA / reminder dates where configured
* created by
* created at
* reason or note where configured

Later changes to annual cycle default windows shall not alter already-created assignment window snapshots unless an authorized correction or migration is explicitly performed.

### 9.5 Interaction with Objective Assignment and Review Timing

Mid-cycle assignment windows shall work with the flexible objective assignment model.

When an assignment is created after cycle launch:

* objective assignment rules shall be evaluated only for the employee's selected applicable terms
* Employee Term Objectives shall be created only for applicable terms
* objective snapshots shall be preserved at assignment time
* achievement and actual value columns shall follow the selected cycle term type
* manager review timing shall include only configured applicable terms
* annual or grouped review scoring shall aggregate only included applicable terms

If review timing is annual or grouped and the employee has only partial-year applicable terms, the review instance shall include only those applicable terms.

Example:

```text
Employee joins in Q2
Applicable terms = Q2 + Q3 + Q4
Annual review objective scoring includes Q2 + Q3 + Q4 only
Q1 is not applicable for that employee
```

### 9.6 Backward Compatibility

Existing cycle-level window behavior shall remain unchanged.

Assignment-level window timing shall apply only when explicitly configured for a specific Annual Assignment or assignment batch.

If no assignment-level window policy exists, the system shall continue using the existing cycle-level windows.

## 10. Data Design Impact

### 10.1 Objective Data

Recommended objective data components:

| Component | Purpose |
|---|---|
| Objective Master | Stores company, department, and reusable objective identity / ownership |
| Objective Master Version | Stores versioned objective details such as title, description, target, target direction, actual aggregation guidance, and scoring policy references |
| Objective Assignment Rules | Stores mapping rules by cycle, term, department, role, group, manager, or employee |
| Employee Term Objective Plan | Stores objectives assigned to each employee and assessment term |
| Employee Term Objective Snapshot | Stores the objective version snapshot used at assignment time |
| Objective Fill Values | Stores target, actual, comments, evidence, and review values |
| Objective Scoring Policy | Stores scoring participation only where enabled by template policy |
| Actual Aggregation Mode | Stores how multi-term actual values are combined before target-based auto score calculation |
| Manager Review Score Inputs | Stores manager-entered objective scores where scoring is enabled |
| Calculated Review Score Snapshot | Stores calculated score results used for review history and reporting |
| Review Timing / Term Grouping Policy | Stores included assessment terms and aggregation policy for grouped or annual reviews |

### 10.2 Template Relationship

Templates should store rendering and policy references, not objective master ownership.

Templates may control:

* objective section visibility
* objective fields visible/editable by role
* mandatory behavior
* achievement requirements
* manager review fields
* scoring enabled or disabled
* objective scoring mode
* objective section template weight
* no-objective scoring policy
* actual aggregation mode for target-based auto scoring where configured
* review timing and term aggregation policy where objective scoring is enabled
* scoring validation rules

### 10.3 Probation Review Data

Recommended probation review data components:

| Component | Purpose |
|---|---|
| Probation Review Assignment | Stores employee, dates, managers, status, locked template version |
| Probation Review Configuration | Stores reviewer responsibility, workflow, sharing, delegation, and approval rules |
| Locked Review Configuration Snapshot | Preserves reviewer responsibility mode, permissions, row/column rules, sharing/delegation policy, and approval rules |
| Probation Review Values | Stores dynamic section, field, and grid values |
| Sharing / Delegation Records | Stores shared access and acting-user metadata |
| Audit Records | Stores assignment, field, section, row, workflow, sharing, and approval events |

Later template or configuration changes should not affect already-created probation review assignments unless controlled migration or correction is explicitly approved.

### 10.4 Assignment Window Timing Data

Recommended assignment window timing data components:

| Component | Purpose |
|---|---|
| Assignment Window Policy | Stores timing mode and default assignment-level window behavior |
| Assignment Window Snapshot | Stores locked windows for the selected Annual Assignment and applicable terms |
| Applicable Term Selection | Stores selected Q/H/Y terms for the employee assignment |
| Assignment SLA / Reminder Dates | Stores assignment-specific due dates for dashboard and reminders |
| Assignment Window Audit | Stores create/update/correction actions for assignment-level windows |

---

## 11. Workflow Impact

### 11.1 Regular PMS Objective Workflow

The regular PMS objective workflow should remain compatible with the current approved flow.

Flexible objective assignments should be applied into the Employee Term Objective plan before or during the relevant objective setting / achievement window.

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

### 11.2 Probation Review Workflow

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

### 11.3 Mid-Cycle Assignment Workflow

Mid-cycle assignment workflow shall remain part of the regular PMS Annual Assignment flow.

Recommended flow:

```text
Employee joins / becomes eligible
→ HR/Admin creates Annual Assignment
→ HR/Admin selects applicable assessment terms
→ Assignment window policy is applied
→ Assignment window snapshot is locked
→ Objective assignment rules apply to selected terms
→ Objective / achievement / manager review flow continues for applicable terms
```

If no assignment-level window policy is configured, the existing cycle-level windows shall apply.

---

## 12. UI Approach

### 12.1 Objective UI

Recommended screens / UI areas:

| UI Area | Purpose |
|---|---|
| Objective Master | Create and maintain Company / Department / reusable objectives |
| Objective Version History | View historical versions of Objective Master records |
| Objective Assignment Rules | Map objectives to cycles, terms, departments, roles, groups, managers, or employees |
| Assignment Preview | Show Employee Term Objective plan before launch or assignment application |
| Objective Fill / Achievement Screen | Capture actuals, achievements, evidence, comments |
| Manager Review Screen | Review assigned objectives as context or scoreable items where enabled |
| Scoring Configuration | Enable objective scoring and validate weightage only where required |

### 12.2 Probation Review UI

Recommended screens / UI areas:

| UI Area | Purpose |
|---|---|
| Manager Review Only Template Builder | Configure review sections, fields, grids, permissions |
| Probation Review Configuration | Configure reviewer responsibility, field security, row/column rules, sharing, approval rules |
| Probation Review Assignment | Assign employee, dates, Manager 1, Manager 2, locked template version |
| Probation Review Workspace | Reviewer-specific form entry and approval actions |
| Sharing / Delegation Panel | Grant, revoke, and audit shared access |
| Audit View | Show assignment, field, section, row, sharing, and approval history |

### 12.3 Mid-Cycle Assignment Window UI

Recommended screens / UI areas:

| UI Area | Purpose |
|---|---|
| Annual Assignment Create / Edit | Select applicable terms for mid-cycle employees |
| Assignment Window Policy Panel | Configure assignment-level windows and timing mode |
| Assignment Window Preview | Show objective, achievement, review, due-date, and SLA windows before assignment confirmation |
| Assignment Window Audit View | Show who configured or changed assignment-level windows |

---

## 13. Validation Rules

### 13.1 Objective Validation

The system should validate:

* objective source is valid
* assignment mapping references valid cycles, terms, employees, departments, roles, or groups
* selected terms match the selected cycle term type
* actual columns match only the selected cycle term type
* Employee Term Objective duplicate key prevents same objectiveMasterId + employee + assessment term from creating duplicate rows
* Employee Term Objectives cannot be directly edited after assignment
* Objective Master edits create new objective versions and do not update already assigned Employee Term Objectives
* Employee Term Objective must store objectiveMasterId and objectiveVersionId
* Employee Term Objective must preserve frozen objective snapshot at assignment time
* later Objective Master Version changes must not update existing Employee Term Objectives
* future assignments use the latest ACTIVE Objective Master Version
* only ACTIVE objective versions can be assigned
* activation by authorized Objective Owner is treated as approval
* DRAFT, INACTIVE, and ARCHIVED objective versions cannot be assigned
* Department Head activation is restricted to permitted department scope
* owner, assigner, and reviewer permissions are evaluated separately
* assigner can apply objectives only within configured scope
* reviewer cannot edit Objective Master, Objective Master Version, or assignment rules unless separately authorized
* Department Head assignment is restricted to permitted department scope unless explicit override exists
* unauthorized roles cannot create or map Company / Department Objectives
* objective fill values are allowed for the actor, workflow state, and assessment term
* score fields are rejected unless objective scoring is explicitly enabled
* objective scoring mode is one of `CONTEXT_ONLY`, `WEIGHTED_OBJECTIVE_SCORE`, or `OVERALL_OBJECTIVE_SCORE`
* only one objective scoring mode contributes to the same objective section total
* manager-entered objective scores do not exceed 100
* weighted objective score is calculated as `(managerScore / 100) x objectiveWeightage`
* non-scoreable objectives are excluded from objective score calculation
* no-objective scoring policy is applied when no scoreable objectives exist
* objective section contribution is calculated using template section weight where configured
* overall objective score is treated as objective section score only, not final PMS score
* objective section contribution is calculated as `(overallObjectiveScore / 100) x objectiveSectionTemplateWeight`
* overall objective score cannot bypass configured template scoring totals
* review instance includes only configured assessment terms for objective scoring
* grouped or annual review objective score is aggregated using configured term aggregation policy
* term weights total 100% when `TERM_WEIGHTED_AVERAGE` is used
* no-objective scoring policy is applied per included term before grouped or annual aggregation
* manager cannot override objective scoring mode during review
* manager cannot make non-scoreable objectives scoreable during review
* manager cannot change objective weightage during review
* score override is not allowed in this design approval
* scoring input must match the locked template objective scoring mode
* valid weightage exists before scoreable objectives participate in scoring
* scoring totals remain valid
* target direction is one of `HIGHER_IS_BETTER`, `LOWER_IS_BETTER`, or `NOT_APPLICABLE`
* target direction is mandatory only when numeric target-based interpretation or target-based score calculation is configured
* target direction affects scoring only when target-based score calculation is explicitly enabled
* manual manager score entry does not require target-based auto-calculation
* actual aggregation mode is one of `LATEST_VALUE`, `SUM_OF_TERMS`, `AVERAGE_OF_TERMS`, `MAX_OF_TERMS`, or `MIN_OF_TERMS`
* actual aggregation mode defaults to `LATEST_VALUE` where target-based auto scoring uses multiple term actual values
* actual aggregation mode is applied before target-based score calculation
* actual aggregation mode shall not be confused with term aggregation policy, which combines review term scores
* target-based calculated score is capped at 100 unless overachievement scoring is explicitly enabled
* missing target value, actual value, or applicable target direction prevents target-based auto-calculation
* actual value is validated for format and completeness, not blocked for target failure by default

### 13.2 Probation Review Validation

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
* delegated users receive only explicitly granted access
* delegated users cannot approve unless the locked configuration permits approval by acting role
* data-grid cell edits follow section, field, row, column, workflow, and actor permission rules
* data-grid edit conflict mode is evaluated before accepting updates
* permission precedence applies most restrictive rule first
* hidden/confidential fields are masked server-side
* single-reviewer finalization is allowed only when locked configuration permits it
* invalid probation status transitions are rejected server-side
* finalized probation reviews cannot be reopened, edited, returned, cancelled, or corrected through the standard flow

### 13.3 Assignment Window Timing Validation

The system should validate:

* assignment-level windows apply only to the selected Annual Assignment or assignment batch
* at least one applicable assessment term is selected
* selected applicable terms match the cycle term type
* assignment window start date is not after assignment window end date
* objective, achievement, and manager review windows do not conflict with finalized or closed term status
* past terms are included only when HR/Admin explicitly selects them and provides valid windows
* assignment-level window snapshot is preserved at assignment creation
* later cycle window changes do not update locked assignment window snapshots
* dashboard and SLA dates use assignment-level windows when present
* existing cycle-level windows are used when assignment-level windows are not configured

---

## 14. Audit and Reporting Impact

### 14.1 Objective Audit

Audit should capture:

* objective master create / update / deactivate
* assignment rule create / update / deactivate
* objective assignment application
* employee term objective plan creation
* objective fill value entry / update
* achievement submission
* attachment upload / delete / download
* scoring participation change
* objective approval / return
* scoring calculation inputs where scoring is enabled
* assignment-level window creation / update / correction

### 14.2 Probation Review Audit

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

### 14.3 Reporting

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
* assignment window policy mode
* assignment-level objective / achievement / review window dates
* applicable terms for mid-cycle assignment

### 14.4 Audit Visibility Rules

The system shall capture complete audit logs for probation review actions.

Audit capture shall not mean all users can view all audit details.

Audit visibility shall be controlled by role, assignment ownership, delegation access, workflow status, and confidential field rules.

Recommended audit visibility:

| Actor | Audit Visibility |
|---|---|
| HR/Admin | Full assignment, field, section, row, sharing, delegation, approval, return, revocation, cancellation, and finalization audit |
| Manager 1 | Own actions and permitted assignment workflow history |
| Manager 2 | Own actions, Manager 1 submission summary, return/approval history, and permitted workflow history |
| Delegated / shared user | Own delegated actions and permitted shared-access history |
| Final approver | Approval-relevant audit and permitted workflow history |
| Employee | No internal probation audit by default unless explicitly configured |
| Director / Management | Read-only audit summary where configured |

Confidential or restricted field values shall be masked in audit views for unauthorized users.

Audit visibility rules shall control:

* whether previous value is visible
* whether new value is visible
* whether actor identity is visible
* whether delegated acting user is visible
* whether section / field labels are visible
* whether sharing/delegation details are visible

Full audit data shall remain available for authorized HR/Admin and system compliance use.

Frontend-only audit hiding shall not be sufficient. API-level audit masking is mandatory.

### 14.5 Audit Retention Position

Audit retention duration is not defined in this design approval.

Until a formal retention policy is separately approved, PMS and probation review audit records shall be preserved and shall not be deleted through standard user operations.

Audit preservation shall apply to:

* objective master audit
* objective assignment audit
* Employee Term Objective audit
* achievement audit
* manager review audit
* probation assignment audit
* field and section audit
* row-level audit
* sharing/delegation/revocation audit
* approval, return, cancellation, and finalization audit

Audit records linked to finalized reviews shall remain immutable.

Audit deletion, archival, purge, or retention-duration automation is not included in this approval.

### 14.6 Dashboard Status Calculation Rules

Dashboard status shall be calculated from workflow status, due dates, assignment applicability, submission state, approval/finalization state, and active sharing/delegation where applicable.

Dashboard status shall not be based only on UI labels.

When assignment-level windows exist, dashboard due dates and overdue status shall use the assignment-level window snapshot instead of the cycle-level default window.

Objective / Employee Term Objective dashboard:

| Dashboard Status | Calculation Rule |
|---|---|
| Not Started | Assignment exists but objective/achievement activity has not started |
| Pending Objective Setup | Objective setting window is open and required objectives are not submitted/approved |
| Pending Achievement | Achievement window is open and required achievement input is not submitted |
| Pending Manager Review | Manager review is open and review is not submitted |
| Returned for Revision | Objective or review is returned for correction |
| Submitted | Required employee/manager submission is completed but not finalized |
| Finalized | Applicable term/review is finalized |
| Closed / Not Applicable | Term or objective is closed by admin or marked not applicable |
| Overdue | Required action is pending after configured due date |
| Blocked | Submission/finalization is blocked due to missing configuration, invalid scoring, missing mandatory fields, or permission issue |

Probation review dashboard:

| Dashboard Status | Calculation Rule |
|---|---|
| Draft | Assignment created but not scheduled |
| Scheduled | Assignment scheduled and review open date is in future |
| Review Open | Review open date reached or manually opened |
| Pending Manager 1 | Manager 1 input is required and not submitted/completed |
| Pending Manager 2 | Manager 2 approval/input is required and not completed |
| Returned | Review returned to Manager 1 for correction |
| Pending Final Approver | Final approver action is required where configured |
| Finalized | Review finalized |
| Cancelled | Assignment cancelled before finalization |
| Overdue | Required reviewer action is pending after configured due date |
| Shared / Delegated | Active sharing/delegation exists for the assignment |

Dashboard calculation shall use locked assignment/configuration snapshot so later template or configuration changes do not alter historical status meaning.

Where multiple statuses apply, priority shall be:

```text
Cancelled
Finalized
Overdue
Returned
Blocked
Pending Approver
Pending Reviewer
Review Open
Scheduled
Draft
```

Dashboard status shall be calculated server-side and exposed through reporting APIs.

### 14.7 Reporting Export Source Mapping

Reporting export columns shall be mapped to source records so exports remain consistent across dashboard, audit, and operational reports.

Objective reporting source mapping:

| Export Column | Source Record |
|---|---|
| Objective Source | Objective Master Version / Employee Term Objective Snapshot |
| Objective Master ID | Objective Master |
| Objective Version ID | Objective Master Version |
| Objective Title | Employee Term Objective Snapshot |
| Assignment Level | Objective Assignment Rule |
| Assignment Rule ID | Objective Assignment Rule |
| Cycle | Annual Cycle / Annual Assignment |
| Assessment Term | Employee Term Objective |
| Employee | Annual Assignment / Employee |
| Applicable Terms | Annual Assignment / Assignment Window Snapshot |
| Assignment Window Policy Mode | Assignment Window Snapshot |
| Objective Setting Window | Assignment Window Snapshot |
| Achievement Submission Window | Assignment Window Snapshot |
| Manager Review Window | Assignment Window Snapshot |
| Assignment Due / SLA Dates | Assignment Window Snapshot |
| Department / Group / Role | Objective Assignment Rule / Employee Profile |
| Target Value | Employee Term Objective Snapshot |
| Actual Value | Objective Fill Values / Achievement Submission |
| Target Direction | Employee Term Objective Snapshot |
| Actual Aggregation Mode | Employee Term Objective Snapshot / Locked Template Version Policy |
| Scoreable Flag | Employee Term Objective Snapshot / Locked Template Version Policy |
| Objective Weightage | Employee Term Objective Snapshot / Scoring Policy |
| Manager Score | Manager Review Score Inputs |
| Calculated Weighted Score | Manager Review Calculated Score Snapshot |
| Objective Approval Status | Employee Term Objective / Objective Workflow State |
| Finalized Status | Annual Assignment Term Content / Manager Review |

Probation review reporting source mapping:

| Export Column | Source Record |
|---|---|
| Probation Review Assignment ID | Probation Review Assignment |
| Employee | Probation Review Assignment / Employee |
| Probation End Date | Probation Review Assignment |
| Review Open Date | Probation Review Assignment |
| Review Status | Probation Review Assignment |
| Manager 1 | Probation Review Assignment |
| Manager 2 | Probation Review Assignment |
| Final Approver | Probation Review Assignment / Locked Configuration Snapshot |
| Reviewer Responsibility Mode | Locked Probation Review Configuration Snapshot |
| Template Name / Version | Locked Template Version |
| Section Completion Status | Probation Review Values / Section Completion Records |
| Field Values | Probation Review Values |
| Data-grid Row Values | Probation Review Values |
| Added Rows | Probation Review Values / Row Audit |
| Deleted Rows | Row Audit |
| Acting Reviewer | Sharing / Delegation Record / Audit |
| Shared Access Status | Sharing / Delegation Record |
| Shared By / Shared At | Sharing / Delegation Record |
| Revoked By / Revoked At | Sharing / Delegation Record |
| Submitted By / Submitted At | Workflow Audit |
| Approved By / Approved At | Workflow Audit |
| Returned By / Returned At | Workflow Audit |
| Finalized By / Finalized At | Workflow Audit |
| Cancellation Details | Probation Review Assignment / Workflow Audit |

Exported reports shall use locked assignment snapshots and locked configuration snapshots for historical records.

Reports shall not recalculate historical field labels, scoring rules, reviewer responsibility, or permission behavior from the latest template/configuration.

---

## 15. Backward Compatibility

Existing PMS flow should not be affected.

The current PMS objective and review flow remains valid for the approved regular PMS use case.

The new objective model, scoring options, probation review configuration, sharing/delegation, and audit enhancements shall be treated as add-on configurable capabilities. If the new configuration is not enabled or not present, the system shall continue using the existing approved PMS and probation review behavior.

Backward compatibility rules:

```text
1. Existing templates continue to work without objective master migration.
2. Existing template-defined objective behavior remains supported where already used.
3. Flexible external objective assignment applies only when enabled/configured.
4. Existing employee-created and manager-created objective behavior remains unchanged by default.
5. Existing probation review flow remains Manager 1 fill + Manager 2 approve unless a different configuration is selected.
6. Locked template versions and locked assignment snapshots preserve historical behavior.
7. Existing cycle-level windows remain the default unless assignment-level windows are explicitly configured.
```

No existing finalized records should be recalculated or reinterpreted because of these changes.

---

## 16. Implementation Impact

Implementation impact includes the following required scope:

```text
Objective master data model
Objective master version model
Objective assignment rule model
Objective assignment duplicate/conflict handling
Employee term objective plan generation
Employee term objective snapshot storage
Objective value storage
Objective permission checks
Objective owner/assigner/reviewer authorization
Objective scoring validation
Objective scoring mode configuration
Objective weighted scoring formula
Objective overall score contribution calculation
Objective no-objective scoring policy handling
Objective grouped/yearly review score aggregation
Review timing and term aggregation policy handling
Mid-cycle Annual Assignment creation support
Assignment-level window policy model
Assignment window snapshot storage
Applicable term selection for mid-cycle employees
Assignment-level SLA / dashboard due-date calculation
Target direction interpretation and validation
Actual aggregation mode configuration and validation
Actual column rendering
Template runtime rendering
Probation review configuration model
Probation review assignment model
Probation review permission enforcement
Data-grid row/column permission handling
Data-grid edit conflict handling
Sharing/delegation model
Delegated user permission boundary enforcement
Field-level and section-level audit
Row-level audit
Sharing/delegation/revocation audit
Approval/return/finalization audit
Audit visibility masking
Dashboard status calculation
Reporting export source mapping
Dashboard and reporting
QA test cases
```

---

## 17. Items Not Included / Future Scope

The following items should be treated as future scope unless separately approved:

* automatic recalculation of finalized historical scores
* complex multi-level appraisal approval outside the configured probation review flow
* probation review reopen/correction after finalization
* audit retention duration, archival automation, or purge policy
* automatic retroactive recalculation of assignment windows for existing assignments
* AI-based objective recommendation
* automated performance score derivation from actual values without explicit scoring policy
* cross-company objective inheritance rules beyond configured mappings
* bulk migration of old template-owned objectives into objective master data
* external HR analytics integration
* notification retry policy changes

---

## 18. Approval Required

Approval is requested to proceed with the following design enhancements:

```text
1. Create Objective Master outside PMS templates.
2. Maintain Objective Master versions and create a new version whenever Objective Master is edited.
3. Store Employee Term Objective snapshots with objectiveMasterId, objectiveVersionId, assignment references, annualAssignmentId, and assessment term.
4. Prevent direct edits to Employee Term Objectives after assignment; use correction / amendment flow where required.
5. Prevent exact duplicate Employee Term Objectives while allowing different objective IDs with similar titles.
6. Preserve all source assignment references when multiple assignment rules apply the same objective.
7. Separate Objective Owner, Objective Assigner, and Objective Reviewer permissions.
8. Introduce Department Head as a configurable PMS role / scope where required and enforce department-scoped objective permissions.
9. Treat Company and Department Objective activation by authorized Objective Owner as approval, without separate submit/approve workflow.
10. Support Company, Department, Template-referenced Objectives / Template-linked Objective References, Manager-created, and Employee-created objective sources.
11. Add flexible objective assignment rules for cycles, terms, organization structures, roles, groups, managers, and employees.
12. Keep templates responsible for rendering, validation, fillability, review behavior, and scoring policy only.
13. Generate actual columns only from the selected cycle term type: Q1-Q4, H1-H2, or Y1.
14. Add targetDirection values: HIGHER_IS_BETTER, LOWER_IS_BETTER, and NOT_APPLICABLE.
15. Require targetDirection only for numeric target-based interpretation or target-based score calculation.
16. Add actualAggregationMode values: LATEST_VALUE, SUM_OF_TERMS, AVERAGE_OF_TERMS, MAX_OF_TERMS, and MIN_OF_TERMS.
17. Use `LATEST_VALUE` as the default actual aggregation mode for target-based auto scoring across multiple term actual values.
18. Keep objectives context-only by default and make them scoreable only when template scoring policy explicitly enables scoring and valid weightage exists.
19. Support objective scoring modes: CONTEXT_ONLY, WEIGHTED_OBJECTIVE_SCORE, and OVERALL_OBJECTIVE_SCORE.
20. Define weighted objective score as `(managerScore / 100) x objectiveWeightage`.
21. Define overall objective score contribution using objective section template weight.
22. Keep score override out of this design approval; managers cannot override scoring mode, scoreable flag, or objective weightage during review.
23. Store objective scoring mode in the locked Template Version.
24. Support objective score aggregation across configurable review timing where review instances include term-wise, grouped, annual, or custom grouped assessment terms.
25. Apply configured term aggregation policy for grouped or annual objective scoring.
26. Add assignment-level window timing for employees added after cycle launch.
27. Allow HR/Admin to select applicable assessment terms for mid-cycle Annual Assignments.
28. Preserve assignment-level objective, achievement, manager review, due-date, and SLA window snapshots.
29. Use assignment-level windows for dashboard and overdue calculation when present.
30. Keep cycle-level windows unchanged for existing employees and assignments by default.
31. Reuse existing objective workflow states unless a new status is absolutely required.
32. Enhance Probation / Trainee Review using Manager Review Only templates without normal PMS cycle launch.
33. Add configurable reviewer responsibility modes for Manager 1, Manager 2, and final approver behavior.
34. Store probation reviewer responsibility rules in Probation Review Configuration and preserve a locked configuration snapshot at assignment creation.
35. Add server-side field-level, section-level, data-grid row, and data-grid column permissions for probation reviews.
36. Define field/section permission precedence using most restrictive rule first.
37. Define data-grid edit conflict handling with SINGLE_OWNER as default.
38. Add sharing/delegation support with original Manager 1 / Manager 2 ownership preservation.
39. Track acting user separately from original Manager 1 / Manager 2 ownership for delegated actions.
40. Shared/delegated access must support view-only access.
41. Shared/delegated access must support edit access for selected sections/fields.
42. Shared/delegated access must support temporary access with start/end date.
43. Shared/delegated access must support acting Manager 1, acting Manager 2, reviewer, and observer roles.
44. Shared/delegated access must support revocation and automatic expiry.
45. Shared access must not allow final approval unless the selected configuration explicitly permits it.
46. Add detailed audit logs for assignment, field, section, row, sharing, delegation, approval, return, revocation, cancellation, and finalization actions.
47. Add audit visibility rules and API-level masking for restricted audit details.
48. Keep finalized probation reviews locked with no standard reopen, edit, return, cancellation, or correction flow.
49. Keep audit retention duration, archival automation, and purge policy outside this approval.
50. Add dashboard status calculation rules and reporting export source mapping.
51. Preserve locked template version and locked review configuration snapshot at probation assignment creation.
52. Keep existing PMS and probation review flows unchanged by default.
53. Treat all new objective, mid-cycle assignment, and probation review capabilities as additional configurable enhancements, not replacements for the approved baseline PMS flow.
```

---

## 19. Final Recommendation

Proceed with these as separate PMS design enhancements.

The recommended approach keeps the current approved PMS flow intact while adding flexible objective assignment, mid-cycle assignment window timing, and configurable probation review capability.

The key design principle is:

```text
Objective ownership and assignment should be flexible outside templates.
Templates should control rendering, validation, permissions, review behavior, and scoring policy.
Mid-cycle assignment windows should be assignment-level configurable snapshots without changing baseline cycle windows.
Probation review should use locked template and configuration snapshots so historical assignments remain stable.
```

This approach gives the PMS module more flexibility without forcing changes into the existing approved regular PMS flow.
