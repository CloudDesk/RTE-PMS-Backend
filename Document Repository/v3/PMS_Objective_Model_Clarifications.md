# PMS Objective Model Clarifications

## Purpose

This document captures clarifications for the PMS objective model without changing the baseline PMS FSD.

The objective model shall be treated as a flexible objective assignment and fulfillment framework. Objectives are not owned by the template by default. Templates may reference, render, validate, or score objectives only according to explicit review and scoring policy.

---

## Manager Summary: Main Requirement Groups

The requested changes can be grouped into three main requirement areas:

1. Flexible Objective Master and Assignment Model

   Objectives shall live outside PMS templates as independent business objects. Company, Department, Template-referenced, Manager-created, and Employee-created objectives shall be assignable to cycles, terms, groups, departments, managers, or employees through flexible mapping rules.

2. Flexible Objective Filling, Actuals, and Scoring Governance

   Assigned objectives shall be fillable based on role, workflow state, assessment term, and permission policy. Actual columns shall follow the selected cycle term type only: Q1-Q4 for quarterly, H1-H2 for half-yearly, and Y1 for yearly. All objective types remain context-only by default and become scoreable only when the template scoring policy explicitly enables objective scoring.

3. Configurable Probation / Trainee Manager Review Flow

   The probation review flow shall support configurable Manager 1 / Manager 2 responsibilities, field-level and section-level security, data-grid row and column permissions, record sharing or delegation to another manager, detailed section/field audit logs, and flexible approval modes where Manager 1, Manager 2, or both may fill and approve according to configuration.

---

## 1. Objective Ownership Model

Objectives shall exist outside the PMS template as configurable business objects.

Objective master data shall be maintained independently from PMS form templates. The template shall not be the primary place where business objectives are created.

The system shall support the following objective sources:

* Company Objectives
* Department Objectives
* Template-referenced Objectives
* Employee-created Objectives
* Manager-created Objectives

Templates shall not be the only source of objectives. A template may define how objectives appear in forms, whether objective scoring is enabled, and which objective attributes are required during review, but objective creation, assignment, mapping, and fulfillment shall remain flexible outside the template.

---

## 2. Company and Department Objective Permissions

### Company Objectives

Company Objectives shall be created and maintained by authorized HR/Admin or Management users.

Company Objectives may be mapped to:

* the whole organization
* business units
* locations
* departments
* employee groups
* specific annual cycles
* selected assessment terms

Managers and employees shall not create Company Objectives unless explicitly granted permission through the Dynamic Access Engine.

### Department Objectives

Department Objectives shall be created and maintained by authorized HR/Admin users, Department Heads, or delegated managers according to configured permission policy.

Department Objectives may be mapped to:

* one department
* multiple departments
* teams
* roles/designations
* employee groups
* selected annual cycles
* selected assessment terms

Managers may map Department Objectives to assigned employees only where their hierarchy scope and permission policy allow it.

---

## 3. Flexible Objective Assignment

Objectives may be assigned at different levels:

* company to cycle
* company to department
* department to team
* department to employee group
* manager to employee
* employee self-created objective to own term plan

Objectives may also be assigned using flexible filters or mappings such as:

* department
* designation
* grade
* location
* business unit
* reporting manager
* employee category
* employee group
* individually selected employees

Objective assignment shall support applicable assessment terms:

* Quarterly: Q1, Q2, Q3, Q4
* Half-yearly: H1, H2
* Yearly: Y1

The system shall strictly apply objectives only to the selected term type and selected term labels. Selecting Q1-Q4 shall not automatically create H1, H2, or Y1 objective assignments.

Assignment rules shall be resolved into employee-level term objective plans when the PMS cycle or assessment term is launched, refreshed, or explicitly synchronized by an authorized user.

---

## 4. Flexible Objective Fillability

Objective fillability shall be controlled by assignment, role, workflow state, assessment term, and permission policy.

The system shall support flexible filling of objective-related values such as:

* target value
* target description or guidance
* actual achievement value
* achievement summary
* evidence or proof attachments
* manager comments
* employee comments
* review rating where scoring is enabled

Different objective attributes may be filled by different actors according to policy:

* HR/Admin may configure objective master data and assignment rules.
* Management or Department Heads may define company or department targets where permitted.
* Managers may assign, adjust, or fill manager-owned values for assigned employees where permitted.
* Employees may fill achievements and evidence against assigned objectives during allowed windows.

Fillability shall not require objectives to be embedded inside a template. The runtime form shall render the objectives assigned to the employee or assessment term, then apply template, workflow, and permission rules to decide which fields are visible, editable, required, or read-only.

For example:

* HR/Admin may define a Company Objective outside the template.
* A Department Head may map it to a department for Q1 and Q2.
* A manager may review it for each assigned employee.
* An employee may fill actual achievements and attach proof during the achievement window.
* The template may decide whether those objective values are only contextual or participate in scoring.

---

## 5. Workflow Status Reuse

The system shall not introduce new workflow statuses for the flexible objective model unless a new status is absolutely required.

Annual objective-plan level behavior should reuse the existing objective workflow states wherever possible:

* OBJECTIVE_SETTING_OPEN
* OBJECTIVE_DRAFT
* OBJECTIVE_SUBMITTED
* OBJECTIVE_REVISION_REQUIRED
* OBJECTIVE_APPROVED

Company and Department Objectives mapped into an employee assessment term may become part of the employee objective plan using the same approval and locking model as applicable to that assignment.

---

## 6. Actual Columns by Cycle Term Type

Actual achievement columns shall be generated only from the selected cycle assessment term type.

The system shall generate:

* Quarterly cycle: Q1 Actuals, Q2 Actuals, Q3 Actuals, Q4 Actuals
* Half-yearly cycle: H1 Actuals, H2 Actuals
* Yearly cycle: Y1 Actual only

The system shall not generate irrelevant actual columns for unselected term types. For example, a half-yearly cycle shall not render Q1-Q4 Actuals, and a yearly cycle shall not render Q/H actual columns.

---

## 7. Target Direction

Objectives shall support target direction for measurement interpretation.

Supported values:

* HIGHER_IS_BETTER
* LOWER_IS_BETTER

HIGHER_IS_BETTER shall be used where better performance means meeting or exceeding the target value.

LOWER_IS_BETTER shall be used where better performance means meeting or staying below the target value.

Target direction shall guide review interpretation and score calculation only when objective scoring is explicitly enabled.

---

## 8. Default Scoring Behavior

All objective sources shall be context-only by default.

This applies to:

* Company Objectives
* Department Objectives
* Template-referenced Objectives
* Employee-created Objectives
* Manager-created Objectives

Objectives shall become scoreable only when:

* the selected template scoring policy explicitly enables objective scoring
* the objective is approved or otherwise valid for the assessment term
* valid weightage exists for the applicable term
* scoring totals remain valid according to the configured template scoring policy

If objective scoring is not enabled, objectives shall support planning, alignment, achievement capture, evidence, and manager review context only. They shall not contribute to marks, weighted score, term score, or final score.

---

## 9. Template Relationship

Templates shall control form rendering, permissions, mandatory behavior, review fields, and scoring policy.

Objectives shall remain independently configurable and assignable. A template may:

* display assigned objectives
* require achievements against assigned objectives
* allow manager review against assigned objectives
* define which objective fields are visible, editable, required, or read-only at each workflow stage
* enable or disable objective scoring
* define scoring validation rules

A template shall not be required to own the objective master data.

The preferred implementation model is:

* objective master data exists outside templates
* objective assignment maps objectives to cycles, terms, groups, and employees
* employee term objective plans store the resolved objectives for execution
* templates render and govern the form behavior for those resolved objectives
* scoring applies only when enabled by template scoring policy

---

## 10. Probation / Trainee Manager Review Flow Clarifications

This section extends the FSD "Probation / Trainee Manager Review Flow" with configuration and audit requirements.

The current implementation already supports:

* admin-created probation review assignment
* employee, probation end date, review open date, Manager 1, Manager 2, template, and locked template version
* scheduled review opening based on review open date
* Manager 1 draft save and submission
* Manager 2 approval or return
* finalization after approval
* cancellation before finalization
* assignment-level audit trail

The next configuration layer shall make the flow more flexible without requiring a normal PMS cycle launch.

### 10.1 Configurable Reviewer Responsibility

The system shall not hardcode all probation review behavior to a fixed Manager 1 fill and Manager 2 approve model.

The configuration shall support reviewer responsibility modes such as:

* Manager 1 fills, Manager 2 approves
* Manager 1 fills and approves
* Manager 2 fills and approves
* Manager 1 and Manager 2 both fill assigned sections, then Manager 2 approves
* Manager 1 and Manager 2 both fill assigned sections, then the configured final approver approves

When the same person is configured to perform both Manager 1 and Manager 2 responsibilities, the assignment validation shall allow the same actor only if the selected review configuration explicitly permits single-reviewer completion.

When the configuration requires separation of duties, Manager 1 and Manager 2 shall remain different users.

### 10.2 Field-Level and Section-Level Security

Probation review templates shall support field-level and section-level security for each reviewer role.

Configuration shall allow HR/Admin to define:

* which sections Manager 1 can view
* which sections Manager 1 can edit
* which sections Manager 2 can view
* which sections Manager 2 can edit
* which fields are read-only for each reviewer
* which fields are mandatory for each reviewer
* which fields are hidden from each reviewer
* which fields are visible only after submission or finalization

Example configuration:

* fields or rows 1-4 are fillable by Manager 1
* fields or rows 4-10 are fillable by Manager 2
* shared field or row 4 may be fillable by both, read-only for one actor, or controlled by last-writer policy according to configuration

The runtime form shall enforce these permissions server-side. Frontend-only field locking shall not be sufficient.

### 10.3 Data Grid Column and Row Permissions

For data grid fields, the system shall support per-column and per-row edit control.

Configuration shall allow HR/Admin to define:

* which columns Manager 1 can enter
* which columns Manager 2 can enter
* which columns are fixed/default and read-only
* which columns are mandatory
* which rows are fixed/default rows
* whether Manager 1 may add rows
* whether Manager 2 may add rows
* whether Manager 1 may delete rows
* whether Manager 2 may delete rows
* minimum and maximum row count
* row ownership when a reviewer adds a row

When additional row creation is enabled, each added row shall store:

* row id
* added by
* added at
* reviewer role at time of addition
* reason or note where configured

When row deletion is enabled, deletion shall be soft-audited and shall store:

* row id
* deleted by
* deleted at
* previous row values
* reason where configured

For fixed paper-style probation forms, add/delete row behavior may remain disabled. For flexible review forms, row behavior shall be controlled by the selected template and review configuration.

### 10.4 Assignment Sharing and Delegated Access

After a probation review assignment is created, authorized users shall be able to share the review record with another manager or delegate.

Sharing shall support:

* view-only access
* edit access for selected sections or fields
* temporary access with start and end date
* role-specific access such as acting Manager 1, acting Manager 2, reviewer, or observer
* revocation of shared access

The system shall preserve original Manager 1 and Manager 2 ownership while recording the shared actor as an acting user.

Shared or delegated actions shall store:

* original owner
* acting user
* access type
* shared by
* shared at
* expiry date where applicable
* revoked by and revoked at where applicable
* reason or note where configured

Shared access shall not allow final approval unless the configuration explicitly permits the shared actor to approve.

### 10.5 Section, Field, and Actor Audit Logs

The probation review audit trail shall track more than assignment-level status changes.

The system shall audit:

* assignment creation
* review opening
* field value entry
* field value update
* section completion
* Manager 1 submission
* Manager 2 return
* Manager 2 approval
* finalization
* row addition
* row deletion
* record sharing
* delegated access usage
* shared access revocation
* cancellation

Field and section audit logs shall capture:

* assignment id
* section key
* section label where available
* field key
* field label where available
* previous value
* new value
* actor
* actor role at time of change
* acting-on-behalf-of user where delegated
* timestamp
* workflow status at time of change
* source channel such as admin screen, manager screen, or API

The final review view shall be able to show who entered each section or field where audit visibility is permitted.

### 10.6 Configurable Submission and Approval Rules

The probation review flow shall support configurable submission and approval rules.

Configuration shall allow:

* Manager 1 submission required or optional
* Manager 2 approval required or optional
* Manager 1 approval allowed
* Manager 2 fill before approval allowed
* return-to-Manager-1 allowed or disabled
* mandatory return reason
* mandatory approval comments
* auto-finalize after Manager 1 submission where configured
* auto-finalize after Manager 2 completion where configured

The standard default shall remain:

```text
SCHEDULED
→ REVIEW_OPEN
→ MANAGER_1_SUBMITTED
→ FINALIZED
```

With optional return:

```text
MANAGER_1_SUBMITTED
→ RETURNED_TO_MANAGER_1
→ MANAGER_1_SUBMITTED
```

The implementation may store the final approval as a `FINALIZED` status with a `MANAGER_2_APPROVED` audit action, or as a separate `MANAGER_2_APPROVED` status followed by `FINALIZED`, depending on the final workflow design. The selected design shall be consistent across APIs, UI, audit logs, and reports.

### 10.7 Configuration Storage Expectations

Each probation review assignment shall preserve the locked template version and the review configuration used at assignment creation.

The locked configuration snapshot should include:

* reviewer responsibility mode
* Manager 1 permissions
* Manager 2 permissions
* field-level security rules
* data grid row and column permissions
* sharing/delegation policy
* submission rules
* approval rules
* audit visibility rules

Later changes to the template or review configuration shall not alter already-created assignments unless an authorized admin explicitly applies a controlled correction or migration.

### 10.8 Validation Expectations

The system shall validate:

* Manager 1 and Manager 2 assignment rules
* whether the same actor may perform both roles
* whether the actor can view or edit the requested field
* whether the actor can add or delete rows
* whether mandatory fields for that actor are complete before submission
* whether approval is allowed by the configured approval mode
* whether shared actors have active access
* whether finalized reviews are immutable except through approved correction workflow

Invalid field edits, row edits, submissions, approvals, sharing actions, or finalization attempts shall be rejected at API/service level and audited where required.
