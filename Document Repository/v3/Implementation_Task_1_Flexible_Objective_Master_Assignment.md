# Implementation Task 1: Flexible Objective Master and Assignment Model

Source design: `PMS_Design_Change_Request_Flexible_Objectives_Probation_Review.md`

## Task Goal


This task must keep the existing PMS objective behavior working by default. New behavior is enabled only when the flexible objective configuration is used.

## References and Dependencies

### Source Design References

- Main design sections: 1-6, 10.1, 10.2, 11.1, 12.1, 13.1, 14.1, 14.3, 14.6, 14.7, 15, 16, 18, 19.
- Related clarification document: `PMS_Objective_Model_Clarifications.md`.
- This task owns the base objective foundation used by Task 2 and Task 4.

### Existing Backend References

- Existing objective model/service/route:
  - `Server/src/models/pms-objective.model.ts`
  - `Server/src/models/pms-objective-value.model.ts`
  - `Server/src/models/pms-objective-comment.model.ts`
  - `Server/src/models/pms-objective-attachment.model.ts`
  - `Server/src/models/pms-manager-objective-library.model.ts`
  - `Server/src/services/objective.service.ts`
  - `Server/src/routes/objective.routes.ts`
- Existing assignment/cycle/template dependencies:
  - `Server/src/models/pms-annual-assignment.model.ts`
  - `Server/src/models/pms-term-assignment.model.ts`
  - `Server/src/models/pms-annual-cycle.model.ts`
  - `Server/src/models/pms-template-version.model.ts`
  - `Server/src/services/assignment.service.ts`
  - `Server/src/services/cycle.service.ts`
  - `Server/src/services/pms-template.service.ts`
- Existing audit/access dependencies:
  - `Server/src/services/audit.service.ts`
  - `Server/src/services/access.service.ts`
  - `Server/src/models/audit-log.model.ts`
  - `Server/src/models/pms-role-permission.model.ts`

### Existing Frontend References

- Existing objective workspace and API client:
  - `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`
  - `Client/src/lib/services/api/pmsObjectives.ts`
  - `Client/src/routes/manager/objectives/+page.svelte`
- Existing template and assignment screens that must stay compatible:
  - `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte`
  - `Client/src/lib/components/pms/templates/builder/objectiveActions.ts`
  - `Client/src/lib/components/pms/assignment-workspace/AssignmentWorkspace.svelte`
  - `Client/src/routes/admin/pms/assignment-workspace/+page.svelte`

### Cross-Task Dependencies

- Task 2 depends on Task 1 Phase 1, Phase 2, and Phase 4 for objective snapshots, active versions, assignment references, source type, and term-level objective plans.
- Task 4 depends on Task 1 Phase 4 because mid-cycle assignment must apply objective rules only to selected applicable terms.
- Task 3 is mostly independent, but shares audit, permission, template locking, and dashboard/reporting patterns with this task.
- Do Task 1 first before building Task 2 scoring or Task 4 mid-cycle objective application.

## Global Implementation Rules

- Follow existing PMS service, model, route, and API response patterns.
- Do not break existing cycle launch, template-owned objective, employee-created objective, manager-created objective, or finalized review behavior.
- Keep backend authorization as the source of truth. Frontend hiding is not enough.
- Keep every new UI friendly for HR/Admin and non-technical users: use clear labels, guided steps, previews, warnings, and plain-language error messages.
- Do not create very large components. Keep Svelte components around 1000-1500+ lines maximum, and split earlier when the component has multiple responsibilities.
- Use child components for tabs, forms, preview tables, filter panels, summary cards, confirmation dialogs, and history panels.
- Pass data through props and events instead of duplicating API calls inside deeply nested components.
- Avoid one screen with too many actions. Use progressive disclosure: list -> detail -> preview -> confirm.
- Store locked snapshots for historical accuracy. Do not recalculate finalized or already-assigned records from the latest master data.
- Add focused tests for data rules, permission rules, duplicate handling, and backward compatibility.

## Phase 1: Data Model and Compatibility Foundation

### 1.1 Add Objective Master model

- Create or extend backend models for Objective Master.
- Store objective identity separately from PMS templates.
- Include source type:
  - Company Objective
  - Department Objective
  - Template-referenced Objective
  - Manager-created Objective
  - Employee-created Objective
- Store ownership fields:
  - owner user
  - owner role
  - owner department or scope
  - created by
  - created at
  - updated by
  - updated at
- Add status support at master level if needed for active/inactive visibility.

### 1.2 Add Objective Master Version model

- Create version records for objective details.
- Every edit to objective details must create a new version instead of silently updating assigned objectives.
- Support version statuses:
  - `DRAFT`
  - `ACTIVE`
  - `INACTIVE`
  - `ARCHIVED`
- Store business details:
  - title
  - description
  - KPI or measurement guidance
  - target value
  - target description
  - target direction
  - priority
  - attachment policy
  - default scoreable reference where required
  - applicable term labels
  - owner and assigner metadata

### 1.3 Add Objective Assignment Rule model

- Create assignment rules that map active objective versions to PMS populations.
- Support mapping by:
  - cycle
  - assessment term type
  - term label
  - company
  - business unit
  - location
  - department
  - team
  - role
  - designation
  - grade
  - employee group
  - reporting manager
  - individual employee
- Store rule status, effective dates, created by, updated by, and audit metadata.
- Add a rule note or reason field so HR/Admin can understand why the assignment exists later.

### 1.4 Add Employee Term Objective plan/snapshot fields

- Ensure assigned objectives store:
  - objectiveMasterId
  - objectiveVersionId
  - objective snapshot
  - assignment rule references
  - annualAssignmentId
  - cycleId
  - employeeId
  - assessment term
  - sourceType
  - parentObjectiveId where applicable
- Store a frozen snapshot at assignment time.
- Make assigned Employee Term Objectives immutable after assignment except through a controlled correction/amendment flow.

### 1.5 Preserve existing behavior

- Existing templates must continue to work without Objective Master migration.
- Existing employee-created and manager-created objective behavior must remain unchanged unless the new model is explicitly enabled.
- Existing finalized records must not be recalculated or reinterpreted.

## Phase 2: Objective Versioning and Activation

### 2.1 Build objective create/edit service methods

- Add service methods for:
  - create Objective Master
  - create first Objective Master Version
  - create new version from existing version
  - update draft version
  - activate version
  - deactivate version
  - archive version
- Prevent direct update of an already assigned Employee Term Objective snapshot when Objective Master changes.

### 2.2 Enforce activation as approval

- Treat activation by an authorized Objective Owner as approval.
- Only `ACTIVE` objective versions can be assigned.
- Block assignment of `DRAFT`, `INACTIVE`, and `ARCHIVED` versions.
- Keep older assigned snapshots unchanged when a newer version becomes active.

### 2.3 Version history API

- Add API endpoint to list versions for an objective.
- Show which version is currently active.
- Show where older versions were used, without allowing direct mutation of those assigned snapshots.

### 2.4 User-friendly version UI

- Add Objective Master list with simple filters:
  - source
  - status
  - department
  - owner
  - search by title
- Add objective detail page with:
  - current version summary
  - activation status
  - version timeline
  - assigned usage summary
  - action buttons only when the user is allowed to act
- Use plain labels:
  - "Draft - Not assignable"
  - "Active - Can be assigned"
  - "Inactive - Temporarily disabled"
  - "Archived - History only"

## Phase 3: Owner, Assigner, Reviewer, and Department Head Permissions

### 3.1 Separate permission responsibilities

- Implement separate checks for:
  - Objective Owner
  - Objective Assigner
  - Objective Reviewer
- Do not assume one actor can create, assign, and review unless explicitly configured.

### 3.2 Enforce owner rules

- HR/Admin may own and assign Company Objectives where permitted.
- Management may own or activate Company Objectives where configured.
- Department Head may own Department Objectives only within configured department scope.
- Manager may create or assign Manager-created Objectives only within permitted report or hierarchy scope.
- Employee may create Employee-created Objectives only for own assessment term where workflow allows.

### 3.3 Add Department Head as configurable PMS scope

- Introduce Department Head role/scope where required.
- Do not infer Department Head from existing user role data unless mapping exists.
- Restrict Department Head assignment to employees, teams, or roles in the permitted department.
- Prevent Department Head from editing Company Objectives unless explicitly granted.
- Prevent Department Head from reviewing/scoring employees unless separately configured as reviewer.

### 3.4 Backend authorization tests

- Test unauthorized owner edits are blocked.
- Test unauthorized assignment outside department scope is blocked.
- Test reviewer cannot edit Objective Master or assignment rules unless separately authorized.
- Test frontend-hidden actions are also rejected by API.

## Phase 4: Assignment Preview and Application

### 4.1 Apply rules during cycle launch

- During cycle launch, apply matching active assignment rules into Annual Assignment term content.
- Apply only to selected cycle term type and selected term labels.
- Do not create Q objectives for half-yearly cycles or H objectives for yearly cycles.

### 4.2 Apply rules after launch

- If assignment rules are configured after launch, do not silently apply them.
- Build preview API that shows:
  - impacted employees
  - impacted terms
  - objective version to apply
  - duplicate status
  - possible similar-title warning
  - blocked assignments with reason
- Require authorized HR/Admin confirmation before applying.

### 4.3 Duplicate and conflict handling

- Prevent exact duplicate Employee Term Objective:
  - same objectiveMasterId
  - same employeeId
  - same assessmentTerm
- If multiple rules apply the same objective to the same employee and term:
  - create only one Employee Term Objective
  - preserve all source assignment rule references
- Allow different objective IDs with same or similar title.
- Show similar-title warning in preview, not a hard block.

### 4.4 User-friendly assignment UI

- Build an Objective Assignment Rules screen with a step-by-step flow:
  - Choose objective
  - Choose cycle and terms
  - Choose people or organization scope
  - Preview impacted employees
  - Confirm assignment
- Use readable warnings:
  - "Already assigned - will not be duplicated"
  - "Similar title found - please review"
  - "Not assignable because the objective version is not active"
  - "Term does not match the cycle type"
- Add filters and counts in preview:
  - total employees
  - new assignments
  - already assigned
  - warnings
  - blocked

## Phase 5: Correction and Amendment Flow

### 5.1 Protect assigned objectives

- After objective plan approval or finalization, prevent silent add/remove/change.
- Use explicit correction/amendment flow for assigned objectives that need changes.

### 5.2 Supported correction actions

- Mark Employee Term Objective as not applicable.
- Replace with another active objective version.
- Preserve old objective snapshot.
- Capture reason, actor, timestamp, and workflow status.
- Preserve audit history.

### 5.3 Correction UI

- Add a guarded correction action that explains impact before confirmation.
- Require a reason.
- Show before/after values.
- Show who approved or applied the correction.
- Keep finalized records protected unless a separately approved future process exists.

## Phase 6: Audit, Reporting, and Dashboard Readiness

### 6.1 Audit capture

- Capture:
  - objective master create/update/deactivate
  - objective version create/activate/deactivate/archive
  - assignment rule create/update/deactivate
  - preview confirmation
  - assignment application
  - Employee Term Objective creation
  - correction/amendment actions

### 6.2 Reporting fields

- Expose reporting data for:
  - objective source
  - objective master id
  - objective version id
  - objective title from snapshot
  - assignment level
  - assignment rule id
  - cycle
  - assessment term
  - employee
  - department/group/role
  - objective approval status

### 6.3 Dashboard support

- Provide server-calculated status inputs for assigned objectives:
  - not started
  - pending objective setup
  - submitted
  - approved
  - returned for revision
  - finalized
  - closed/not applicable
  - blocked

## Phase 7: QA and Acceptance

### 7.1 Backend acceptance checks

- Objective edits create new versions.
- Only active versions are assignable.
- Assigned snapshots do not change when master data changes.
- Duplicate assignment prevention works.
- Multiple matching rules preserve references.
- Department Head scope is enforced.
- Unauthorized reviewer cannot edit master/rules.
- Existing PMS behavior works when flexible objective model is unused.

### 7.2 Frontend acceptance checks

- HR/Admin can create objective, activate version, create assignment rule, preview, and apply.
- Preview clearly explains new, duplicate, warning, and blocked rows.
- Non-technical user can understand status without backend enum knowledge.
- Objective detail version history is readable.
- Large components are split into child components with props/events.

### 7.3 Regression checks

- Existing cycle launch still works.
- Existing template-defined objectives still render.
- Existing employee and manager objective screens still work.
- Existing finalized records remain unchanged.
