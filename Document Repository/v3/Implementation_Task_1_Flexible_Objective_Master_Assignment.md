# Implementation Task 1: Flexible Objective Master and Assignment Model

Source design: `PMS_Design_Change_Request_Flexible_Objectives_Probation_Review.md`

## Task Goal

Create a flexible objective model where objectives live outside PMS templates, can be versioned, activated, assigned by rules, previewed before application, and stored as immutable employee-term objective snapshots.

This task must keep the existing PMS objective behavior working by default. New behavior is enabled only when the flexible objective configuration is used.

## Implementation Status

Last updated: 2026-07-07

### Overall Status

- Suresh backend ownership: development complete for Phase 1 through Phase 6.
- Vinith frontend ownership: development complete for Task 1 frontend workflow.
- Phase 7 final acceptance: manual regression and UAT pending.

### Phase Status Checklist

| Phase | Scope | Status | Notes |
|---|---|---|---|
| Phase 1 | Data model and compatibility foundation | [x] Backend complete | Added Objective Master, Objective Master Version, Objective Assignment Rule, additive assigned-objective snapshot/amendment fields, and compatibility tests. |
| Phase 2 | Objective versioning and activation | [x] Backend complete | Added create/version/update-draft/activate/deactivate/archive/history and active-version assignability guard. |
| Phase 3 | Permissions | [x] Backend complete | Added owner, assigner, reviewer, explicit Department Head scope checks, and UI action-availability hints. |
| Phase 4 | Assignment preview and application | [x] Backend complete | Added rule create/update/deactivate, preview, confirmed apply, duplicate handling, warning/block output, assignment-rule refs, frozen snapshots, and cycle-launch application hook. |
| Phase 5 | Correction/amendment | [x] Backend complete | Added flexible objective amendment endpoint for not-applicable and replacement flows with correction layer, comments, audit, and finalized-term protection. |
| Phase 6 | Audit/reporting/dashboard readiness | [x] Backend complete | Added objective reporting and dashboard-status endpoints. Audit actions are captured through lifecycle/apply/amendment flows. |
| Phase 7 | QA and acceptance | [~] Development complete; manual QA pending | Focused backend tests and server/client builds pass. Full test suite has unrelated legacy failures. Manual regression and UAT are pending. |
| Frontend UI | Version UI, assignment wizard, correction UI, reporting readiness | [x] Development complete | Vinith Phase 1 added the Objective Master workspace, route, sidebar entry, list, form, status badge, and version timeline. Phase 2 connects Objective Master list/detail/create/update draft/create draft version/activate/deactivate to live APIs with mock fallback. Phase 3 adds the assignment wizard, preview table, and live create rule/preview/apply integration. Phase 4 adds the correction dialog for mark-not-applicable and replacement amendments on flexible assigned objectives. Phase 5 adds reporting/dashboard readiness UI using objective reporting and dashboard-status APIs. Final acceptance remains pending manual QA/UAT. |

### Verification Run

- `npm run build` passed in `Server`.
- Focused tests passed:
  - `test/models/flexibleObjectiveModels.test.ts`
  - `test/services/objectiveMasterVersioning.test.ts`
  - `test/services/objectiveAssignmentPreview.test.ts`
  - `test/services/objectiveAmendment.test.ts`
  - `test/services/objectiveReportingDashboard.test.ts`
- Full `npm test` was not clean before/alongside this work due to unrelated legacy failures in old cycle/quarter/scoring/bulk-operation tests. Do not use full-suite failure alone as Task 1 failure without separating those legacy test issues.
- `npm run build` passed in `Client` after Vinith Phase 2 live Objective Master API integration.
- `npm run build` passed in `Client` after Vinith Phase 3 assignment wizard, preview table, and apply integration.
- `npm run build` passed in `Server` and `Client` after Vinith Phase 4 correction/amendment UI integration.
- `npm run build` passed in `Server` and `Client` after Vinith Phase 5 reporting/dashboard readiness UI integration.
- `npm run build` passed in `Server` and `Client` after final Task 1 contract closure for assignment rule update/deactivate endpoints and Objective Master action-availability hints.
- `npm run check` in `Client` is still blocked by unrelated legacy diagnostics, but no diagnostics were reported for the new `objective-masters` frontend files when filtered.

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

## Objective Field Scope and Existing Compatibility

### Existing Objective Fields To Preserve

The current implementation already has an objective table/model. Do not remove, rename, or repurpose existing fields without a separate migration and regression approval.

Existing objective fields that must continue to work:

- assignment references:
  - `termAssignmentId`
  - `annualAssignmentId`
  - `cycleId`
  - `templateVersionId`
  - `assessmentTermCode`
- actor references:
  - `employeeId`
  - `assignedManagerId`
  - `createdByRole`
  - `createdByUserId`
  - `createdBy`
  - `updatedBy`
  - `actingDelegateUserId`
  - `originalOwnerUserId`
- objective identity/display:
  - `objectiveNo`
  - `source`
  - `templateObjectiveKey`
  - `isPredefined`
  - `title`
  - `description`
  - `priority`
  - `expectedOutcome`
  - `targetMetric`
  - `targetValue`
  - `targetDate`
  - `weightage`
  - `successCriteria`
- workflow/status:
  - `status`
  - `submittedAt`
  - `approvedAt`
  - `approvedBy`
  - `returnedReason`
  - `returnedAt`
- attachments and lifecycle:
  - `attachments`
  - `isDeleted`
  - `version`
  - `createdAt`
  - `updatedAt`

Existing objective value storage must also continue to work:

- `objectiveId`
- `termAssignmentId`
- `annualAssignmentId`
- `cycleId`
- `employeeId`
- `templateFieldId`
- `fieldKey`
- `sectionKey`
- `roleCode`
- `actorUserId`
- `workflowStage`
- `valueJson`
- `valueText`
- `valueNumber`
- `valueDate`
- `valueStatus`
- `submittedAt`
- `isDeleted`
- `version`

### New Objective Fields Required By The Reference Design

The new flexible objective model should add fields through new models or additive fields, not by breaking the existing objective table behavior.

Required new Objective Master / Objective Version fields:

- `objectiveMasterId`
- `objectiveVersionId`
- objective source type:
  - Company Objective
  - Department Objective
  - Template-referenced Objective
  - Manager-created Objective
  - Employee-created Objective
- owner metadata:
  - owner user
  - owner role
  - owner department/scope
  - assigner metadata where applicable
- version status:
  - `DRAFT`
  - `ACTIVE`
  - `INACTIVE`
  - `ARCHIVED`
- business fields:
  - objective title
  - objective description
  - KPI / measurement guidance
  - target value
  - target description
  - target direction
  - priority
  - attachment policy
  - scoreable flag where applicable
  - default scoring eligibility reference where applicable
  - approved weightage where applicable
  - applicable term labels

Required Employee Term Objective snapshot fields:

- `objectiveMasterId`
- `objectiveVersionId`
- `assignmentRuleRefs`
- `annualAssignmentId`
- `cycleId`
- `employeeId`
- `assessmentTerm`
- `sourceType`
- `parentObjectiveId` where applicable
- frozen objective snapshot:
  - title
  - description
  - source
  - KPI / measurement guidance
  - target value
  - target description
  - target direction
  - priority
  - attachment policy
  - scoreable flag where applicable
  - approved weightage where applicable
  - applicable term
  - owner / assigner metadata

### Field Handling Rules

- Do not touch old objective behavior unless needed for additive compatibility.
- Do not remove existing objective fields.
- Do not rename existing objective fields.
- Do not change old field meaning, especially `source`, `templateObjectiveKey`, `isPredefined`, `targetValue`, `weightage`, and `status`.
- Add new master/version/snapshot structures for the new flexible model.
- Existing template-owned objectives should continue using the old path unless flexible Objective Master is enabled.
- Existing employee-created and manager-created objectives should continue to work by default.
- If old objectives need to participate in the new model later, create a separate migration plan. Bulk migration is out of scope for this task.
- Assigned objective snapshots must be frozen. Later Objective Master edits must not update old assigned Employee Term Objectives.
- Scoring-related values such as scoreable flag, weightage, target value, target direction, and scoring mode must not be silently changed after assignment.

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

## Team Split for Parallel Work

This split allows Suresh and Vinith to work in parallel while keeping the core objective foundation consistent.

### Suresh Ownership

Suresh owns the backend foundation, contracts, and integration rules.

Primary responsibilities:

- Define Objective Master, Objective Master Version, Objective Assignment Rule, and Employee Term Objective snapshot model changes.
- Define enums, DTOs, API contracts, validation rules, and response shapes before UI integration starts.
- Implement objective versioning:
  - draft version
  - active version
  - inactive version
  - archived version
  - edit creates new version
- Implement activation rules:
  - only active versions are assignable
  - activation is approval
  - older assigned snapshots remain unchanged
- Implement owner, assigner, reviewer, and Department Head permission enforcement.
- Implement assignment preview backend:
  - impacted employees
  - impacted terms
  - duplicate status
  - similar-title warning
  - blocked assignment reason
- Implement assignment apply backend:
  - create Employee Term Objectives
  - prevent exact duplicates
  - preserve all matching assignment rule references
  - assign only selected term labels for the cycle term type
- Implement correction/amendment backend:
  - mark not applicable
  - replace objective version
  - preserve old snapshot
  - require reason
  - audit actor and timestamp
- Implement backend tests for:
  - versioning
  - activation
  - duplicate handling
  - permission checks
  - immutable snapshots
  - existing PMS compatibility

### Vinith Ownership

Vinith owns Task 1 frontend screens, user-friendly workflow, and UI validation based on Suresh's API contracts.

Primary responsibilities:

- Build Objective Master list UI.
- Build Objective Master create/edit draft UI.
- Build Objective detail and version history UI.
- Build activation/deactivation UI using permissions from API response.
- Build Objective Assignment Rule wizard:
  - choose objective
  - choose cycle and terms
  - choose organization/employee scope
  - preview impacted employees
  - confirm assignment
- Build Assignment Preview table:
  - new assignments
  - already assigned
  - similar-title warnings
  - blocked rows
  - filters and summary counts
- Build user-friendly status and warning labels.
- Build correction confirmation UI:
  - before/after values
  - reason required
  - confirmation before apply
- Keep UI components split around `1000-1500+` lines maximum.
- Use child components and props/events for:
  - ObjectiveMasterList
  - ObjectiveMasterForm
  - ObjectiveVersionTimeline
  - ObjectiveAssignmentWizard
  - ObjectiveAssignmentPreviewTable
  - ObjectiveStatusBadge
  - ObjectiveCorrectionDialog
- Execute Task 1 frontend acceptance and manual checklist items.

### Parallel Work Order

| Step | Owner | Output |
|---|---|---|
| 1 | Suresh | Confirm model shape, enums, DTOs, and API response contracts |
| 2 | Vinith | Start UI with mocked/static contract data and reusable child components |
| 3 | Suresh | Implement backend models, services, routes, permissions, preview, and apply logic |
| 4 | Vinith | Connect UI to real API clients and replace mocked data |
| 5 | Suresh | Review integration for snapshot, duplicate, permission, and correction edge cases |
| 6 | Vinith | Complete UI validation, friendly labels, and manual checklist execution |
| 7 | Suresh and Vinith | Run regression checks and close Task 1 acceptance items |

### Contract Handoff Checklist

Suresh should provide these before Vinith connects to live APIs:

| Contract Item | Status |
|---|---|
| Objective Master list response | [x] Implemented: `GET /pms/objectives/masters` |
| Objective Master detail response | [x] Implemented: `GET /pms/objectives/masters/:objectiveMasterId` |
| Objective Version history response | [x] Implemented: `GET /pms/objectives/masters/:objectiveMasterId/versions` |
| Create/update draft payload | [x] Implemented for create master, create version, and update draft version |
| Activate/deactivate payload | [x] Implemented for activate, deactivate, and archive version |
| Assignment Rule create/update payload | [x] Implemented: create, update, and deactivate assignment rule |
| Assignment Preview response with warning/block reason format | [x] Implemented: `POST /pms/objectives/assignment-rules/preview` |
| Assignment Apply response | [x] Implemented: `POST /pms/objectives/assignment-rules/apply` |
| Correction/amendment payload and response | [x] Implemented: `POST /pms/objectives/:id/amendment` |
| Permission/action availability fields for UI buttons | [x] Implemented: Objective Master responses include `actions` availability hints for UI buttons |
| Friendly backend error codes/messages | [~] Plain-language messages implemented; structured error codes are still generic route-level codes |

### Backend API Contract Summary

Implemented endpoints for Suresh backend handoff:

- `POST /pms/objectives/masters`
- `GET /pms/objectives/masters`
- `GET /pms/objectives/masters/:objectiveMasterId`
- `GET /pms/objectives/masters/:objectiveMasterId/versions`
- `POST /pms/objectives/masters/:objectiveMasterId/versions`
- `PUT /pms/objectives/master-versions/:objectiveVersionId`
- `POST /pms/objectives/master-versions/:objectiveVersionId/activate`
- `POST /pms/objectives/master-versions/:objectiveVersionId/deactivate`
- `POST /pms/objectives/master-versions/:objectiveVersionId/archive`
- `GET /pms/objectives/master-versions/:objectiveVersionId/assignable`
- `GET /pms/objectives/master-versions/:objectiveVersionId/reviewable`
- `POST /pms/objectives/assignment-rules`
- `PUT /pms/objectives/assignment-rules/:assignmentRuleId`
- `POST /pms/objectives/assignment-rules/:assignmentRuleId/deactivate`
- `POST /pms/objectives/assignment-rules/preview`
- `POST /pms/objectives/assignment-rules/apply`
- `POST /pms/objectives/:id/amendment`
- `GET /pms/objectives/reporting`
- `GET /pms/objectives/dashboard-statuses`

Known backend contract gaps before manual QA:

- No known blocking backend contract gaps for Task 1 manual QA.
- Structured per-condition backend error codes remain generic route-level codes, but plain-language messages are implemented for Task 1 user flows.

### Integration Rules

- Vinith should not create separate backend assumptions if an API contract is missing; mark the field as pending and confirm with Suresh.
- Suresh should keep response fields stable once Vinith starts API integration.
- Both should use the same friendly status label map for objective version, assignment preview, and Employee Term Objective status.
- Backend remains the source of truth for permissions; UI hiding is only for usability.
- Existing PMS objective screens must remain compatible until the new workflow is fully verified.
