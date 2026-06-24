# PMS Objectives + Achievement UI Enhancement Plan

## Purpose

Redesign the PMS employee and manager objective/achievement experience into a cleaner term-based workspace, using `pms_objectives_tabs_v4.html` as the visual direction.

This is a UI/UX enhancement only. The existing backend APIs, workflow states, validations, permissions, data model, and business rules must remain unchanged.

## Frontend-Only Confirmation

This plan is frontend-only.

Allowed change areas:

- Svelte UI components.
- Existing frontend route/page wiring if needed.
- New shared PMS frontend child components.
- Styling and layout improvements.
- Binding existing frontend handlers into new child components.

Backend areas must remain untouched:

- No server service changes.
- No model/schema changes.
- No API endpoint changes.
- No workflow/state rule changes.
- No payload format changes.
- No database changes.

Backend changes are out of scope unless a separate bug is discovered, documented, and explicitly approved before implementation.

## Primary Scope Confirmation

The first implementation scope is mainly the employee/user PMS module.

Primary focus:

- Employee/user objective screen.
- Employee/user achievement submission screen.
- A unified employee/user term workspace experience.
- New employee/user sidebar entry for the redesigned workspace.

Secondary/later focus:

- Manager objective and review UI alignment can be handled after the employee/user module is stable.
- Manager screens should not be changed in the first pass unless a shared component requires a harmless visual-only update.
- Admin/backend workflow screens are out of scope for this UI pass.

## Sidebar Rollout Plan

Do not disturb the current sidebar entries during the first implementation.

Current entries should remain working:

- `Objectives`
- `Achievement Submission`

Add one new sidebar entry for the redesigned employee/user workspace.

Recommended user-friendly sidebar name:

- `My Performance`

Other acceptable options if product naming needs adjustment:

- `Performance Workspace`
- `My PMS Workspace`
- `My Goals & Achievements`

Initial behavior:

- New sidebar item opens the unified employee/user PMS workspace.
- Existing `Objectives` and `Achievement Submission` sidebar items stay visible and functional.
- Existing routes remain unchanged for now.
- The new route can default to the `Objectives` tab.
- A direct achievement route or query state can open the `Achievement Submission` tab.

Later cleanup:

- After the new workspace is verified, old separate sidebar entries can be hidden.
- Do not delete old routes immediately.
- Keep `/my/assignments` and `/my/achievements` working for backward compatibility.
- Only hide old sidebar items after user acceptance testing confirms the new workspace covers all actions.

## Current Understanding

The current employee module has two separate menu entries:

- `Objectives` renders `ObjectiveWorkspace` in employee mode.
- `Achievement Submission` renders `EmployeeAchievementWorkspace`.

Both screens are based on the same term assignment record, identified by `termAssignmentId`. Achievement submission loads approved objectives for that same term assignment and captures achievement details against those objectives.

The manager side already combines related concepts more closely:

- Manager objectives are handled through `ObjectiveWorkspace` in manager mode.
- Manager reviews are handled through `TermReviewWorkspace`.
- `TermReviewWorkspace` already has tabs for manager review, approved objectives, and employee achievement reference.

The redesign should make the employee experience feel like one continuous term workflow:

1. Select/open a term assignment.
2. View and manage objectives.
3. Submit achievements against approved objectives.
4. View workflow windows, status, rules, and next actions in one place.

For manager, the redesign should improve the same pattern without changing permissions:

1. Select/open an employee term assignment.
2. View/approve/return objectives where applicable.
3. View employee achievements against objectives.
4. Complete manager review/rating actions in the existing manager review flow.

## Source UI Direction

Reference file:

`Server/Document Repository/v3/Implementation/UI_Manager/pms_objectives_tabs_v4.html`

Key UI ideas to adopt:

- Term-level header/hero with employee, manager, cycle, term, status, objective counts, approved count, and weightage summary.
- Top-level tabs for `Objectives` and `Achievement Submission`.
- Objective list cards with status badges, source badges, due date, attachment count, and weightage ring.
- Objective detail panel with KPI/measurement, target value, due date, success criteria, and linked achievement summary.
- Right-side summary cards for assignment summary, workflow windows, objective rules, and weightage progress.
- Achievement submission cards grouped by objective.
- Clear open/submitted/closed notice bar for achievement submission window.
- Read-only manager/reference view of submitted achievements.
- Shared visual language for status pills, cards, sidebars, progress, and actions.

Important adaptation:

- The mock has an `Employee view / Manager view` segmented toggle inside the achievement tab. In implementation this should not expose manager controls to employees. Treat this as a shared design pattern only. Employee and manager screens must continue to render role-appropriate controls based on the existing routes, modes, and permissions.

## Non-Negotiable Scope Rules

- Do not change backend endpoints.
- Do not change workflow state names or transition rules.
- Do not remove existing validation.
- Do not remove existing permission checks.
- Do not remove existing list filters, search, pagination, date override behavior, or loading/error states.
- Do not change payload formats for objective, achievement, or review APIs.
- Do not merge employee and manager permissions into one runtime view.
- Do not make achievement submission available before the existing rules allow it.
- Do not make approved/read-only objectives editable.
- Do not rewrite existing add, edit, delete, upload, preview, submit, approve, return, finalize, reopen, or bulk assignment logic unless a bug is found and separately approved.
- Prefer moving existing handlers into the new UI unchanged over recreating action logic from the HTML mock.
- The HTML mock is visual reference only. Its demo JavaScript must not replace production Svelte logic.

## Core Logic Preservation Rules

The redesign must preserve current action logic exactly. The UI can be rearranged, but the existing handlers, API calls, payload builders, guards, and state transitions are the source of truth.

### Objective Logic To Preserve

Keep the existing objective logic from `ObjectiveWorkspace.svelte`:

- `refreshWorkspace`
- `openDetail`
- `openCreateObjective`
- `handleSaveDraft`
- `handleSubmitObjective`
- `handleDeleteDraftObjective`
- `handleApproveObjective`
- `handleReturnObjective`
- `handleAddComment`
- `removeDraftAttachment`
- `openApprovalObjectiveModal`
- `handleConfirmApprovalObjective`
- `openCloseObjectiveSettingModal`
- `handleCloseObjectiveSetting`
- `canEmployeeWorkOnObjectives`
- `canManagerWorkOnObjectives`
- `canManagerApproveObjectives`
- `canManagerCreateObjectives`
- `canCloseObjectiveSetting`
- `canEditObjective`
- `canSubmitObjective`
- `canDeleteObjective`
- `canApproveObjective`
- `canReturnObjective`
- `isObjectiveSettingWindowOpen`
- `isObjectiveApprovalWindowOpen`
- `isReadyForAchievementSubmission`

Keep objective API usage unchanged:

- `pmsObjectivesApi.listAssignments`
- `pmsObjectivesApi.saveDraft`
- `pmsObjectivesApi.submitObjective`
- `pmsObjectivesApi.deleteObjective`
- `pmsObjectivesApi.approveObjective`
- `pmsObjectivesApi.returnObjective`
- `pmsObjectivesApi.addComment`
- `pmsObjectivesApi.uploadAttachment`
- `pmsObjectivesApi.closeObjectiveSetting`

The new UI must call these same functions or thin wrappers around them. It must not introduce a parallel objective state machine.

### Manager Objective Library And Bulk Logic To Preserve

Keep existing manager objective library and bulk assignment logic:

- `loadManagerObjectiveLibrary`
- `saveManagerObjectiveLibrary`
- `createManagerObjectiveLibraryItem`
- `deleteManagerObjectiveLibraryItem`
- `openObjectiveBuilderModal`
- `saveObjectiveBuilderDrafts`
- `openObjectiveLibraryModal`
- `openObjectivePreview`
- `openAssignEmployeesModal`
- `handleBulkAssignManagerObjective`
- `isBulkManagerAssignmentEligible`
- `isManagerObjectiveAssignmentEligible`
- `isBulkAssignmentSelectable`
- employee picker selection logic
- assignment group selection logic
- existing/new manager objective detail modals
- bulk result handling for created, updated, and failed records

Do not simplify or remove these flows while changing card layout.

### Achievement Logic To Preserve

Keep the existing achievement submission logic from `EmployeeAchievementWorkspace.svelte`:

- `loadAssignments`
- `loadSubmissionDetail`
- `populateDraftItems`
- `addAchievementItem`
- `removeAchievementItem`
- `handleAttachmentFileChange`
- `openAttachmentPreview`
- `handleSaveDraft`
- `handleSubmit`
- `refreshWorkspace`
- `openAchievementAssignmentFromList`
- `canOpenAchievementAssignment`
- work update field helpers
- required-field validation
- self-rating validation
- attachment metadata handling
- submitted/locked/read-only handling
- scoreable objective handling
- additional contribution enablement handling

Keep achievement API usage unchanged:

- `pmsEmployeeAchievementsApi.getSubmission`
- `pmsEmployeeAchievementsApi.saveDraft`
- `pmsEmployeeAchievementsApi.submitAchievement`
- `pmsEmployeeAchievementsApi.uploadAttachment`

The integrated achievement tab must use the same draft payload shape:

- `achievementItems`
- `achievementValues`
- objective-linked item `type`
- `objectiveId`
- `objectiveSnapshot`
- `subject`
- `description`
- `employeeSelfRating`
- `employeeSelfRatingComments`
- `outcome`
- `attachments`

### Manager Review Logic To Preserve

Keep the existing manager review logic from `TermReviewWorkspace.svelte`:

- `refreshWorkspace`
- `openDetail`
- `loadTemplate`
- `loadAchievementReference`
- `createDraftFromAssignment`
- `handleSaveDraft`
- `handleSubmitReview`
- `handleFinalizeReview`
- `handleReopenReview`
- `onAttachmentSelect`
- `removeAttachment`
- `openReviewAttachment`
- `openAchievementAttachment`
- `handleExportCsv`
- objective rating validation
- dynamic template value handling
- review submit blocking logic
- achievement required/missing warning logic
- approved objective required logic

Keep manager review API usage unchanged:

- `pmsTermReviewsApi.listAssignments`
- `pmsTermReviewsApi.getAssignment`
- `pmsTermReviewsApi.saveDraft`
- `pmsTermReviewsApi.submitReview`
- `pmsTermReviewsApi.finalizeReview`
- `pmsTermReviewsApi.reopenReview`
- `pmsEmployeeAchievementsApi.getSubmission` for achievement reference
- `documentsApi` usage for review attachment upload

The new manager review UI must not change rating calculation, objective scoring, review section rendering, or finalization/reopen behavior.

### Upload And Attachment Rules

All upload flows must keep existing behavior:

- Existing file size limits.
- Existing accepted file handling.
- Existing upload API methods.
- Existing uploaded metadata shape.
- Existing preview behavior for image and non-image attachments.
- Existing remove behavior.
- Existing attachment display in read-only states.
- Existing error toast/message handling.

The visual upload zone can change, but it must call the same upload handlers.

### Action Button Rules

All action buttons in the redesigned UI must bind to existing capability checks:

- If current logic disables an action, the new UI must disable or hide it the same way.
- If current logic requires a confirmation modal, the new UI must keep that confirmation.
- If current logic shows validation before submit, the new UI must keep that validation.
- If current logic blocks by workflow window, the new UI must keep that block.
- If current logic refreshes assignment/detail after action, the new UI must keep that refresh behavior.

No action should be implemented as display-only unless the current screen already treats it as display-only.

## Phase-Wise Safe Implementation Approach

Use a safe child-component migration strategy. The existing large workspace components should remain the accurate working reference while the new UI is built and verified.

Core approach:

- Do not directly remove or rewrite existing detail sections first.
- Create new child components for redesigned detail panels.
- Pass existing data, state, flags, handlers, and API-backed actions into the new child components as props/callbacks.
- Keep existing parent components responsible for workflow logic, permissions, API calls, validation, and refresh behavior.
- Replace old markup only after the new child component proves feature parity.
- Keep old code nearby during the phase where it is still needed for accurate behavior reference.

### Phase A: Preserve Parent Logic, Add Child UI Shells

Goal:

Create new child components that only render UI. They should not own business rules.

New child components can be created for:

- Employee objective detail shell.
- Employee achievement tab/detail shell.
- Manager objective detail shell.
- Manager review approved-objective shell.
- Manager employee-achievement reference shell.
- Shared term hero.
- Shared assignment summary sidebar.
- Shared workflow windows sidebar.
- Shared objective rules sidebar.
- Shared objective/achievement cards.

Rules:

- Parent keeps selected assignment state.
- Parent keeps selected objective state.
- Parent keeps draft state unless safely extracted later.
- Parent keeps existing handler functions.
- Child receives handlers such as `onSaveDraft`, `onSubmit`, `onUpload`, `onDelete`, `onApprove`, `onReturn`, `onFinalize`, `onReopen`.
- Child receives capability booleans such as `canEdit`, `canSubmit`, `canUpload`, `canApprove`, `canReturn`, `isLocked`, `windowStatus`.
- Child must not duplicate API calls.

Acceptance:

- New child components can render from existing objects without mutating workflow behavior.
- Existing screens still work if the new child components are disabled or rolled back.

### Phase B: Employee Objectives New Detail Component

Goal:

Create a child component for the redesigned employee objective detail view while keeping `ObjectiveWorkspace.svelte` as the source of logic.

Suggested component:

- `Client/src/lib/components/pms/objectives/EmployeeObjectiveTermDetail.svelte`

Bind from parent:

- `selectedAssignment`
- `displayObjectiveBuckets`
- `objectiveDraft`
- `resolvedTemplate`
- loading states
- validation state
- selected objective/editor state as needed
- existing objective handlers
- existing attachment handlers
- existing comment handlers

Must preserve:

- Add employee objective.
- Edit draft objective.
- Save draft.
- Submit objective.
- Delete draft objective.
- Attachment upload/remove.
- Runtime template fields.
- Comments.
- Objective bucket display.
- Achievement-ready navigation.

Acceptance:

- The old employee objective detail behavior and the new visual detail behavior produce the same API actions and payloads.

### Phase C: Employee Achievement New Tab Component

Goal:

Create a child component for the redesigned achievement tab/card UI while keeping `EmployeeAchievementWorkspace.svelte` logic or extracted parent logic as the source of truth.

Suggested component:

- `Client/src/lib/components/pms/achievements/EmployeeAchievementTermTab.svelte`

Bind from parent:

- `submissionDetail`
- `selectedAssignment`
- `draftItems`
- `workUpdateValues`
- `validationErrorsByIndex`
- `workUpdateValidationErrors`
- `canEditAchievementForm`
- `windowStatus`
- `submitValidationMessage`
- `savingDraft`
- `submitting`
- upload state
- existing add/remove/save/submit/upload/preview handlers

Must preserve:

- Objective-linked achievements.
- Additional achievements.
- Add/remove additional achievement.
- Self rating.
- Employee comments.
- Outcome.
- Work update dynamic fields.
- Attachment upload/preview.
- Save draft.
- Submit.
- Locked/read-only states.
- Window blocking.

Acceptance:

- The new achievement tab uses the same `achievementItems` and `achievementValues` payload structure.
- Upload and submit behavior remains exactly the same.

### Phase D: Manager Objectives New Detail Component

Goal:

Create a child component for redesigned manager objective detail and approval UI while keeping manager logic in `ObjectiveWorkspace.svelte`.

Suggested component:

- `Client/src/lib/components/pms/objectives/ManagerObjectiveTermDetail.svelte`

Bind from parent:

- `selectedAssignment`
- objective buckets
- manager library state
- bulk assignment state
- modals state
- approval/return comment state
- weightage adjustment state
- existing approve/return/create/library/bulk/close handlers

Must preserve:

- Approve objective.
- Return objective.
- Create manager objective.
- Manager objective library.
- Bulk assign manager objectives.
- Weightage adjustment.
- Close objective setting.
- All existing modal flows.

Acceptance:

- New manager objective UI calls the same handlers and keeps all manager actions available.

### Phase E: Manager Review New Detail Components

Goal:

Create child components for the redesigned manager review tabs while keeping `TermReviewWorkspace.svelte` logic intact.

Suggested components:

- `Client/src/lib/components/pms/reviews/ManagerReviewDetailTab.svelte`
- `Client/src/lib/components/pms/reviews/ManagerApprovedObjectivesTab.svelte`
- `Client/src/lib/components/pms/reviews/ManagerAchievementReferenceTab.svelte`

Bind from parent:

- `selectedAssignment`
- `draft`
- `resolvedTemplate`
- `achievementReferenceDetail`
- `achievementReferenceItems`
- objective rating rules
- allowed scores
- loading/error states
- existing review handlers
- existing attachment handlers
- existing achievement attachment preview handlers

Must preserve:

- Manager review draft.
- Dynamic template review fields.
- Objective ratings.
- Objective rating validation.
- Review attachments.
- Save draft.
- Submit review.
- Finalize.
- Reopen.
- Export CSV.
- Achievement required/missing warnings.

Acceptance:

- Manager review behavior is unchanged while the visual layout improves.

### Phase F: Route Wiring And Tab Deep Links

Goal:

Wire the redesigned child components into the existing routes without breaking current URLs.

Rules:

- `/my/assignments` remains valid.
- `/my/achievements` remains valid.
- `/manager/objectives` remains valid.
- `/manager/reviews` remains valid.
- If `/my/achievements` opens the unified workspace, it should default to the `Achievement Submission` tab.
- If `/my/assignments` opens the unified workspace, it should default to the `Objectives` tab.

Acceptance:

- Existing sidebar/menu links still work.
- Browser refresh preserves a valid route.
- Direct bookmarked URLs do not break.

### Phase G: Controlled Replacement And Cleanup

Goal:

Only after feature parity is verified, remove duplicated old markup that is fully replaced by child components.

Rules:

- Remove old markup only after testing the matching action flow.
- Do not remove existing helper functions unless no current or new child component uses them.
- Do not remove existing modals until the new component uses the same modal/action path.
- Keep comments in code brief and only where needed to explain preservation of existing logic.

Acceptance:

- No dead UI remains for replaced sections.
- No live action is lost.
- The component tree is easier to maintain than before.

## Existing Features That Must Be Preserved

### Employee Objectives

Preserve all current `ObjectiveWorkspace mode="employee"` behavior:

- Assignment list view.
- Search.
- Quarter/term filter.
- Cycle filter.
- Pagination.
- PMS date override testing control.
- Loading skeletons and error states.
- Openable assignment detail.
- Breadcrumb navigation.
- Objective buckets and source grouping.
- Predefined objective display.
- Employee-created objective creation when allowed.
- Draft objective editing when allowed.
- Objective save draft.
- Objective submit.
- Objective delete where allowed.
- Objective attachments and attachment removal.
- Runtime template form rendering through `AssignmentFormRuntime`.
- Custom objective values.
- Comments display/add where supported.
- Status badges and workflow labels.
- Objective setting window checks.
- Objective approval window checks.
- Read-only behavior for approved/predefined/manager-created objectives.
- Achievement submission call-to-action when the term is ready.
- Weightage cap, assigned weightage, remaining weightage, and scoreability messaging.
- Empty states for no assignments and no objectives.

### Manager Objectives

Preserve all current `ObjectiveWorkspace mode="manager"` behavior:

- Assignment list view with search/filter/pagination.
- Manager assignment detail view.
- Employee objective review.
- Approve objective.
- Return objective with comment.
- Manager-created objective creation where allowed.
- Manager-created objective auto-approved behavior.
- Manager objective library.
- Create manager objective library item.
- Delete manager objective library item.
- Objective preview.
- Bulk assign manager objectives to employees.
- Employee/assignment picker.
- Bulk assignment eligibility rules.
- Weightage adjustment/override behavior.
- Existing manager objective assignment result display.
- Close objective setting action where allowed.
- Confirmation modal behavior.
- All current modals and guardrails.

### Employee Achievement Submission

Preserve all current `EmployeeAchievementWorkspace` behavior:

- Achievement assignment list view.
- Search.
- Quarter/term filter.
- Cycle filter.
- Pagination.
- PMS date override testing control.
- Openable assignment detail.
- Breadcrumb navigation.
- Achievement submission window validation.
- Open/not open/closed/unconfigured window messaging.
- Loading skeletons and error states.
- Load submission detail by `termAssignmentId`.
- Auto-build one achievement item per approved objective.
- Existing submitted/draft achievement values populated back into the form.
- Achievement against objective.
- Additional achievements when enabled.
- Add/remove additional achievement rows.
- Employee self rating when enabled.
- Employee self rating required validation when configured.
- Employee comments per objective when enabled.
- Outcome/remarks field.
- Attachment upload.
- Attachment preview.
- Attachment remove/replace behavior where supported.
- Attachment file metadata display.
- Work update dynamic fields from template section.
- Work update validation.
- Required achievement validation.
- Save draft.
- Submit achievement.
- Submitted/locked/read-only state.
- No approved objectives fallback with additional contributions guidance.
- Correct handling of scoreable and non-scoreable objectives.

### Manager Review / Achievement Reference

Preserve all current `TermReviewWorkspace mode="manager"` behavior:

- Manager review assignment list.
- Search.
- Quarter/term filter.
- Cycle filter.
- Pagination.
- PMS date override testing control.
- Openable detail view.
- Breadcrumb navigation.
- Existing detail tabs: manager review, approved objectives, employee achievement.
- Approved objective reference list.
- Employee achievement reference loading from achievement submission API.
- Objective-level achievement display.
- Additional achievement display.
- Achievement attachments and preview/download behavior.
- Missing achievement warning when achievement submission is required.
- Manager review draft fields.
- Dynamic review template rendering through `AssignmentFormRuntime`.
- Objective rating when configured.
- Allowed score options and min/max score validation.
- Objective review comments.
- Overall score/rating/recommendation fields.
- Achievements and development observation fields.
- Review attachment upload.
- Review attachment preview.
- Review attachment removal.
- Save draft.
- Submit review.
- Finalize review.
- Reopen review with reason.
- Export CSV.
- Read-only handling for non-editable states.
- Submit blocking when approved objectives or required achievement submission are missing.

### Admin / Employee Review Modes

Preserve current `TermReviewWorkspace` modes and behavior:

- `mode="employee"` review visibility where used.
- `mode="admin"` review visibility where used.
- Existing template section visibility rules.
- Existing role normalization and permission behavior.

## Proposed Information Architecture

### Employee Module

Create a unified employee PMS term workspace UI while preserving current route compatibility.

Recommended route strategy:

- Keep `/my/assignments` and `/my/achievements` working.
- Use `/my/assignments` as the preferred unified screen.
- `/my/achievements` can either remain as a direct route into the achievement tab or continue rendering the existing component until migration is complete.
- The sidebar label can later be simplified after UI validation, but this plan focuses on screen implementation first.

Employee detail layout:

- Header: breadcrumb, current term badge.
- Hero: employee/manager, cycle, term, status, objective count, approved count, weightage summary.
- Tabs:
  - `Objectives`
  - `Achievement Submission`
- Main area:
  - Objective list/detail or achievement cards.
- Side area:
  - Assignment summary.
  - Workflow windows.
  - Objective rules.
  - Weightage progress.

### Manager Module

Use the same visual structure where it improves clarity, but keep manager actions separated by existing component responsibilities.

Recommended route strategy:

- Keep `/manager/objectives` for objective setup/approval/manager-created objectives.
- Keep `/manager/reviews` for manager review/rating/finalization.
- Apply the new term header, cards, status pills, side summary, and objective/achievement reference layout consistently across both.
- Do not put review finalization controls into the objective setup screen unless the current route/component already supports them.

Manager review detail layout:

- Header/hero with employee, manager, cycle, term, status, review readiness.
- Tabs:
  - `Manager Review`
  - `Approved Objectives`
  - `Employee Achievement`
- Approved objective cards should show linked employee achievement inline.
- Manager review tab should retain all existing review fields and action buttons.

## Component Design Plan

### Shared UI Components To Extract

Create small reusable components only where they reduce duplication:

- `PmsTermHero.svelte`
  - Displays employee, manager, cycle, term, status, objective counts, approved counts, and weightage.
- `PmsWorkflowWindowsCard.svelte`
  - Displays objective setting, objective approval, achievement submission, review/finalization windows where available.
- `PmsAssignmentSummaryCard.svelte`
  - Displays employee-manager relationship, cycle, term, status, and assignment metadata.
- `PmsObjectiveRulesCard.svelte`
  - Displays objective mode, employee-created allowed, manager-created allowed, approved objective editability, scoring policy.
- `PmsWeightageProgressCard.svelte`
  - Displays cap, assigned weightage, remaining weightage.
- `PmsObjectiveCard.svelte`
  - Compact objective card with source/status badges, due date, attachments, weightage ring.
- `PmsObjectiveDetailPanel.svelte`
  - Objective detail display with KPI, target, due date, success criteria, description, expected outcome, comments/attachments as applicable.
- `PmsAchievementObjectiveCard.svelte`
  - Achievement form/read-only card for one objective.
- `PmsStatusPill.svelte`
  - Shared status/source pill styling.

Do not over-extract during the first pass. If a component becomes too coupled to one workspace, keep it local.

### Styling Guidelines

- Use existing app theme tokens/classes where possible.
- Match the mock’s clean card-and-tab structure, but stay consistent with the existing Svelte/Tailwind style.
- Use lucide icons already used in the app instead of adding a new icon dependency.
- Keep cards at modest radius.
- Avoid nested cards where possible.
- Ensure dense enterprise UI, not a marketing layout.
- Ensure mobile layout stacks the side panel below the main content.
- Keep all text responsive and non-overlapping.
- Keep keyboard focus states and ARIA tab semantics.

## Implementation Phases

### Phase 1: Document and Map Existing Feature Surface

Deliverables:

- Confirm current employee objective, achievement, and manager review behavior.
- Map each current action to its destination in the new UI.
- Identify any duplicated helper logic that can be shared.

Acceptance:

- No feature from the current workspaces is unaccounted for in this plan.
- No backend/API change is required.

### Phase 2: Shared Visual Components

Deliverables:

- Build shared term header/hero and sidebar summary components.
- Build shared status pill and workflow window display.
- Build objective card/detail UI component or local equivalents.

Acceptance:

- Components accept existing assignment/objective objects without requiring API changes.
- Components render correctly for employee and manager assignment shapes.
- Empty/missing fields render graceful fallbacks.

### Phase 3: Employee Objectives Tab Enhancement

Deliverables:

- Update employee objective detail view to use the new term header, tabs, objective cards, and sidebar summary.
- Keep existing objective creation/edit/submit/delete/comment/attachment/runtime-template actions.
- Replace the separate “Go to Achievement Submission” block with an in-workspace `Achievement Submission` tab when possible.

Acceptance:

- Employee can do everything currently possible in `ObjectiveWorkspace mode="employee"`.
- Objective list, detail, buckets, statuses, and actions still behave correctly.
- Achievement tab is visible only as a navigation/view improvement, not a permission bypass.

### Phase 4: Employee Achievement Tab Integration

Deliverables:

- Reuse `EmployeeAchievementWorkspace` logic or extract its detail form into an embeddable tab panel.
- Render approved objectives as achievement cards.
- Preserve additional achievements, self-rating, comments, outcome, attachments, work-update fields, draft, submit, locked/read-only states, and validation.
- Support deep entry from `/my/achievements` into the achievement tab.

Acceptance:

- Employee can save draft and submit achievements exactly as before.
- Window state blocks/permits actions exactly as before.
- Existing achievement API payloads are unchanged.
- Additional contribution behavior remains controlled by config.

### Phase 5: Manager Objectives UI Enhancement

Deliverables:

- Apply the new header/card/sidebar layout to manager objective workspace.
- Preserve objective approval, return, manager-created objective creation, manager objective library, bulk assignment, weightage adjustments, and close objective setting.
- Improve objective detail cards to show employee achievement reference where available, without changing workflow rules.

Acceptance:

- Manager can perform all current objective actions.
- Bulk manager objective flow remains fully available.
- All existing modals remain reachable.
- Eligibility and permission rules remain unchanged.

### Phase 6: Manager Review UI Enhancement

Deliverables:

- Align `TermReviewWorkspace` detail tabs with the new visual language.
- Improve approved objective cards with linked employee achievement details.
- Improve employee achievement tab read-only presentation.
- Keep manager review form and actions intact.

Acceptance:

- Manager can save draft, submit, finalize, reopen, upload/remove review attachments, rate objectives, and export CSV exactly as before.
- Required achievement and approved objective blockers still work.
- Objective rating validation remains unchanged.

### Phase 7: Route and Sidebar Cleanup

Deliverables:

- Decide whether to keep both employee sidebar entries or collapse into one.
- If collapsing later, ensure `/my/achievements` redirects or opens the unified workspace on the achievement tab.
- Keep backward compatibility for existing links/bookmarks.

Acceptance:

- No broken routes.
- Existing direct navigation still works.
- User lands on the expected tab based on the route.

### Phase 8: QA and Regression Checklist

Run UI and workflow checks for:

- Employee with no assignments.
- Employee with not-started term.
- Employee during objective setting window.
- Employee after objective setting closed.
- Employee with predefined objectives only.
- Employee with dynamic employee-created objectives allowed.
- Employee with manager-created objectives.
- Employee with approved objectives ready for achievement submission.
- Employee before achievement submission window.
- Employee during achievement submission window.
- Employee after achievement submission window.
- Employee with required achievement submission.
- Employee with optional achievement submission.
- Employee with additional contributions disabled.
- Employee with self-rating enabled/required.
- Employee with attachment upload.
- Employee with locked/submitted achievement.
- Manager with pending employee objectives.
- Manager approving objectives.
- Manager returning objectives.
- Manager creating manager objectives.
- Manager bulk assigning objectives.
- Manager close objective setting.
- Manager review with no approved objectives.
- Manager review with required achievement missing.
- Manager review with achievement submitted.
- Manager objective rating enabled.
- Manager objective rating disabled.
- Manager review save draft/submit/finalize/reopen.
- Admin/employee review read-only visibility.
- Mobile viewport.
- Desktop viewport.
- Loading, empty, and API error states.

## Files Expected To Change

Likely files:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`
- `Client/src/lib/components/pms/achievements/EmployeeAchievementWorkspace.svelte`
- `Client/src/lib/components/pms/reviews/TermReviewWorkspace.svelte`
- New shared components under `Client/src/lib/components/pms/common/` or similar.
- Possibly `Client/src/routes/my/assignments/+page.svelte`
- Possibly `Client/src/routes/my/achievements/+page.svelte`
- Possibly sidebar/navigation config only after the unified screen is stable.

Files that should not need backend behavior changes:

- `Server/src/services/*`
- `Server/src/models/*`
- API route handlers
- Workflow configuration

## Risk Areas

- Accidentally hiding manager objective library or bulk assignment features while simplifying the UI.
- Accidentally bypassing achievement window validation by embedding achievement submission in the objective screen.
- Mixing employee and manager views from the HTML mock too literally.
- Losing dynamic template runtime fields while redesigning static cards.
- Losing attachment preview/upload behavior.
- Breaking route-level deep links.
- Creating duplicate state between objective assignment selection and achievement assignment selection.

Mitigation:

- Reuse existing state/actions wherever practical.
- Move UI presentation in small steps.
- Keep old routes working until the new unified route is verified.
- Test every action listed in the regression checklist.

## Final Success Criteria

- Employee sees one coherent term workspace instead of feeling forced through two redundant screens.
- Objectives and achievements are connected visually by term assignment and objective.
- Manager sees objectives, submitted achievements, and review actions with clearer context.
- All existing features remain available.
- No backend/API/workflow rule is changed.
- Existing routes remain functional.
