# Manager Bulk Assignment Update Implementation Plan

## 1. Purpose

This document defines the next implementation plan for the Manager Objective Builder and Bulk Assignment modal in `ObjectiveWorkspace.svelte`.

It is based on:

- the current code in `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`,
- the current FE API in `Client/src/lib/services/api/pmsObjectives.ts`,
- the current backend logic in `Server/src/services/objective.service.ts`,
- the existing reference report in `Server/Document Repository/v3/Implementation/Manager_Bulk_Assignemnts_UI_BE_FE.md`,
- the updated rule that manager objective weightage is allowed only when the template setting `Manager-added objectives can carry score weight` is enabled for that term assignment.

This is an implementation plan only. It does not change code by itself.

## 2. Current Implementation Truth

### 2.1 Current Manager Objective Builder

File:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`

State flag:

- `showObjectiveLibraryModal`

Current behavior:

- Displays saved manager-created objectives.
- Allows search.
- Allows `View`.
- Allows `Remove from library`.
- Allows `Assign` for one objective.
- Allows `Assign All Objectives` when more than one objective exists.

Important current limitation:

- The manager objective library is currently a reusable context-objective library.
- The library does not clearly separate context-only manager objectives from scoreable manager objectives.
- Weightage behavior is not obvious from the builder modal.

### 2.2 Current Bulk Assignment Modal

State flag:

- `showBulkModal`

Current behavior:

- Opens when manager clicks `Assign` or `Assign All Objectives`.
- Shows employee search.
- Shows cycle, term, and status filters.
- Shows `All` and `Assignable` tabs.
- Groups records by employee.
- Shows every term/cycle record under each employee.
- Lets manager select eligible records.
- Submits selected term assignments and selected objective drafts to backend.

Current modal issue:

- Assignment records are too expanded by default.
- The `Objectives to assign for this record` block is visible for every row, even when the row is not selected and not expanded.
- When there are `0 assignable` records, the modal still displays large non-actionable row content.
- This makes the modal feel like content is already open and visually heavy.

### 2.3 Current Eligibility Logic

Frontend:

- `isBulkManagerAssignmentEligible`
- `isManagerObjectiveAssignmentEligible`
- `getAssignmentNotAssignableReason`
- `getAssignmentAvailabilityLabel`

Current frontend rule:

```ts
managerObjectiveCreateQuarterStates.has(assignment.termState) &&
(assignment.termState === "OBJECTIVE_APPROVED" || isObjectiveSettingWindowOpen(assignment))
```

Current allowed states:

- `OBJECTIVE_SETTING_OPEN`, only when objective-setting window is open.
- `OBJECTIVE_APPROVED`, allowed even after objective-setting window.

Backend:

- `assertManagerCreatedObjectiveAssignmentAllowed`

Current backend rule:

```ts
const allowedStates = new Set([
  NOT_STARTED,
  OBJECTIVE_SETTING_OPEN,
  OBJECTIVE_APPROVED,
]);

if (termState === OBJECTIVE_APPROVED) return;
await assertObjectiveWindow(termAssignment, "setting");
```

Meaning:

- Manager-created objective assignment is allowed during active objective setting.
- Manager-created objective assignment is also allowed after objectives are approved.
- `NOT_STARTED` can be moved to objective setting by backend only if objective-setting window is open.

## 3. Correct Manager Weightage Rule

### 3.1 Template Setting Source

Template builder setting:

- `Manager-added objectives can carry score weight`

Stored field:

```ts
objectiveConfig.objectiveScoringPolicy.managerCreatedScoreable
```

Frontend template builder reference:

- `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte`
- `objectiveScoringPolicyFor(...)`
- `updateObjectiveScoringPolicy(...)`

Backend model reference:

- `Server/src/models/pms-template-version.model.ts`

Backend service reference:

- `Server/src/services/objective.service.ts`
- `defaultObjectiveScoringPolicy`
- `resolveTemplateObjectiveConfig`
- `objectiveSourceIsScoreable`

### 3.2 Correct Business Rule

For each selected term assignment record:

```ts
managerWeightageAllowed =
  assignment.objectiveConfig?.objectiveScoringPolicy?.managerCreatedScoreable === true;
```

If `managerWeightageAllowed` is `true`:

- manager-created objectives can carry score weight,
- UI can show weightage controls,
- weightage must be validated,
- payload may include `weightage`,
- backend stores weightage only if manager-created objectives are scoreable for that assignment,
- backend validates objective weightage against bucket and overall scoring rules.

If `managerWeightageAllowed` is `false`:

- manager-created objectives are context-only,
- UI should not ask for score weight,
- UI should show a clear `Context-only` label,
- payload should not require weightage,
- backend should store manager-created objective with `weightage: undefined`.

### 3.3 Important Mixed Selection Rule

Bulk assignment can select records from different cycles/templates/terms.

Therefore, scoreability must be evaluated per selected assignment, not globally.

Possible mixed case:

- Record A: manager-created objectives are scoreable.
- Record B: manager-created objectives are context-only.

Correct result:

- Record A receives manager objective with weightage.
- Record B receives same manager objective as context-only.

The UI must clearly show this difference before submit.

## 4. Current Gap Between Plan Doc and Code

The older reference doc mentions:

- existing manager objective weightage adjustment,
- per-assignment weightage override,
- `weightageAdjustments`,
- `objectiveWeightageOverrides`,
- 100% validation panel for bulk assignment.

Current backend truth:

```ts
if ((input.weightageAdjustments ?? []).length > 0 || (input.objectiveWeightageOverrides ?? []).length > 0) {
  throw new Error(
    "Bulk weightage adjustments are not supported; set weightage on each scoreable manager objective",
  );
}
```

So the corrected plan is:

- Do not implement existing-objective weightage adjustment in this modal yet.
- Do not implement per-assignment override arrays yet.
- Implement scoreable manager-created objective weightage only through the objective draft weightage field.
- Let backend validate scoreable manager objectives using current `validateQuarterObjectiveRules`.
- Add existing/per-record override support only in a later backend-aligned phase.

## 5. Target UX Update

### 5.1 Manager Objective Builder

Improve the saved objective list so the manager understands whether an objective is context-only or can carry score when assigned.

Recommended UI:

- Show objective title.
- Show priority.
- Show expected outcome.
- Show saved default weightage only when present.
- Show label:
  - `Score weight depends on selected assignment`
  - or `Context-only by default`

Reason:

- The saved library objective does not know which assignment it will be applied to.
- Scoreability is determined by the selected assignment template config.

### 5.2 Bulk Assignment Modal

Keep the bulk modal compact and decision-focused.

Default row view should show:

- employee,
- cycle,
- term,
- workflow status,
- availability label,
- existing manager objective count,
- selected/not selected state.

Do not show by default:

- full new objective cards,
- full existing objective cards,
- detailed objective descriptions,
- expanded record details.

Show detailed content only when:

- the row is expanded, or
- the row is selected.

### 5.3 Zero Assignable State

When visible records exist but `visibleAssignableRecordCount === 0`, show a clear panel:

```text
No assignable records in the current filter.
Most visible records are outside the objective-setting window, already contain this objective, or do not allow manager-created objectives.
Use the All tab to inspect records or adjust cycle/term/status filters.
```

If all visible blocked records share the same reason, show that reason prominently.

Example:

```text
All visible records are outside the objective-setting window.
```

### 5.4 Scoreability Summary in Bulk Modal

When selected assignments exist, show a summary:

- selected records,
- scoreable records,
- context-only records,
- selected objectives,
- any missing/invalid weightage issue.

Example:

```text
4 selected records
2 scoreable, 2 context-only
Manager weightage is required only for scoreable records.
```

## 6. Target Weightage Behavior

### 6.1 Context-Only Records

If selected assignment has:

```ts
managerCreatedScoreable !== true
```

Then:

- no weightage is required,
- no weightage input is shown for that record,
- objective is assigned and approved,
- objective does not contribute to score.

UI label:

```text
Context-only: this template does not allow manager-added objectives to carry score weight.
```

### 6.2 Scoreable Records

If selected assignment has:

```ts
managerCreatedScoreable === true
```

Then:

- manager objective weightage is allowed,
- each selected manager objective should have a weightage before submit,
- weightage must be numeric,
- weightage must be greater than 0,
- weightage must be at most 100,
- total scoreable objective weightage must not exceed current assignment scoring limits.

UI label:

```text
Scoreable: manager-added objectives can carry score weight for this assignment.
```

### 6.3 Default Weightage Source

Use the manager objective draft `weightage` as the default score weight.

For scoreable records:

- if `objective.weightage` is present, use it,
- if missing, block submit and ask manager to enter score weight,
- if invalid, block submit.

For context-only records:

- ignore weightage,
- do not require weightage.

### 6.4 Mixed Assignment Selection

If selected records include both scoreable and context-only records:

- show the selected objective weightage in the sidebar,
- show a note that it applies only to scoreable records,
- context-only records should clearly say no score weight will be applied.

## 7. Frontend Implementation Plan

### 7.1 Add Helper Functions

File:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`

Add helpers:

```ts
function managerObjectiveWeightageAllowedForAssignment(assignment: PmsObjectiveAssignment) {
  return assignment.objectiveConfig?.objectiveScoringPolicy?.managerCreatedScoreable === true;
}
```

```ts
function selectedScoreableAssignments() {
  return selectedAssignAssignments.filter(managerObjectiveWeightageAllowedForAssignment);
}
```

```ts
function selectedContextOnlyAssignments() {
  return selectedAssignAssignments.filter(
    (assignment) => !managerObjectiveWeightageAllowedForAssignment(assignment),
  );
}
```

```ts
function managerObjectiveWeightageIssue(objective: ManagerObjectiveDraft) {
  const hasScoreableSelection = selectedAssignAssignments.some(managerObjectiveWeightageAllowedForAssignment);
  if (!hasScoreableSelection) return "";

  const weightage = Number(objective.weightage);
  if (!Number.isFinite(weightage) || weightage <= 0) {
    return "Enter score weight for scoreable manager-created objectives.";
  }
  if (weightage > 100) {
    return "Score weight cannot exceed 100%.";
  }
  return "";
}
```

### 7.2 Fix Bulk API Payload Mapping

File:

- `Client/src/lib/services/api/pmsObjectives.ts`

Current issue:

- `bulkAssignManagerObjectives` uses the first selected assignment as `anchorAssignment`.
- `toBackendObjectivePayload(draft, anchorAssignment)` decides whether to include `weightage`.
- This is risky for mixed selections:
  - if the first assignment is context-only, weightage can be omitted even when later selected records are scoreable.

Plan:

- Add a separate bulk payload converter for manager-created objectives.
- Do not decide scoreability using only the first selected assignment.
- Include `weightage` in objective payload when the manager draft has one.
- Backend will decide per assignment whether manager-created objectives are scoreable.

Proposed shape:

```ts
function toBackendBulkManagerObjectivePayload(draft: ObjectiveDraftInput) {
  return {
    clientObjectiveId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    priority: draft.priority,
    expectedOutcome: (draft.expectedOutcome || "").trim(),
    weightage: draft.weightage,
    attachments: ...,
    objectiveValues: draft.objectiveValues ?? [],
  };
}
```

Payload remains:

```ts
{
  termAssignmentIds: assignments.map((assignment) => assignment.termAssignmentId),
  objectives,
}
```

Do not send:

- `weightageAdjustments`,
- `objectiveWeightageOverrides`.

Those are not supported by the current backend.

### 7.3 Compact Assignment Rows

File:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`

Change current row behavior:

- keep row compact by default,
- keep checkbox, cycle, term, state, availability label,
- show scoreability badge:
  - `Scoreable`
  - `Context-only`
- show existing manager objective count.

Move these blocks inside expanded/selected area:

- `Objectives to assign for this record`,
- existing manager objective cards,
- full objective descriptions,
- expected outcome details.

Display detail content only when:

```svelte
{#if expandedAssignmentDetailId === assignment.id || isAssignAssignmentSelected(assignment.id)}
```

### 7.4 Improve Empty and Blocked States

Add top-level conditional in modal body:

- if no visible records: show `No employees match filters`.
- if visible records exist and assignable count is 0: show blocked-state panel.
- if Assignable tab is selected and no records: show clear explanation.

### 7.5 Add Scoreability Summary Sidebar

Right sidebar should show:

- selected record count,
- scoreable selected count,
- context-only selected count,
- selected objective count,
- score weight issue if any.

For each objective:

- title,
- priority,
- expected outcome,
- weightage field only if at least one selected assignment is scoreable,
- note: `Applies only to scoreable selected records`.

If no selected scoreable assignments:

- hide/disable weightage input,
- show `All selected records are context-only`.

### 7.6 Submit Validation

Update `canSubmitBulkAssignment`.

Current:

```ts
selectedAssignAssignments.length > 0 &&
assigningObjectiveDrafts.length > 0
```

Target:

```ts
selectedAssignAssignments.length > 0 &&
assigningObjectiveDrafts.length > 0 &&
managerObjectiveWeightageIssues.length === 0
```

Submit should block when:

- no eligible assignment selected,
- no objective selected,
- any selected scoreable assignment exists and objective weightage is missing,
- any selected scoreable assignment exists and objective weightage is invalid.

Do not block context-only records for missing weightage.

## 8. Backend Implementation Plan

### 8.1 Keep Current Backend Bulk Contract

File:

- `Server/src/services/objective.service.ts`

Current contract:

```ts
termAssignmentIds: string[];
objectives?: BulkManagerObjectiveDraftInput[];
```

Keep this contract for the next update.

Do not implement yet:

- `weightageAdjustments`,
- `objectiveWeightageOverrides`,
- existing manager objective weightage update from bulk modal.

### 8.2 Confirm Current Backend Scoreable Behavior

Current backend already does the correct per-assignment scoreability check:

```ts
if (this.objectiveSourceIsScoreable(source, objectiveConfig)) {
  await this.validateQuarterObjectiveRules(...);
}
```

When creating:

```ts
weightage: this.objectiveSourceIsScoreable(source, objectiveConfig)
  ? objectiveInput.weightage
  : undefined
```

Meaning:

- if assignment template allows manager-created objectives to score, backend stores weightage,
- if not, backend stores no weightage.

### 8.3 Optional Backend Hardening

Add clearer validation error for scoreable manager objectives with missing weightage.

Current `validateQuarterObjectiveRules` returns early if `newWeightage === undefined`.

For scoreable manager-created objectives, we should explicitly reject missing weightage:

```ts
if (this.objectiveSourceIsScoreable(source, objectiveConfig)) {
  if (objectiveInput.weightage === undefined || objectiveInput.weightage === null) {
    throw new Error("Score weight is required for scoreable manager-created objectives");
  }
  await this.validateQuarterObjectiveRules(...);
}
```

This makes backend behavior match UI behavior.

## 9. Validation Matrix

| Case | Expected UI | Expected Backend |
|---|---|---|
| Manager-created scoreable OFF | Weightage hidden or disabled | Store `weightage: undefined` |
| Manager-created scoreable ON, weightage missing | Block submit | Reject if request bypasses UI |
| Manager-created scoreable ON, weightage 0 | Block submit | Reject if request bypasses UI |
| Manager-created scoreable ON, weightage over 100 | Block submit | Reject |
| Mixed selected records | Show scoreable/context-only counts | Store weightage only for scoreable assignments |
| Existing objective already has same title | Row not selectable | Backend may still reject per objective rule |
| Objective-setting window closed and state not approved | Row not selectable | Reject |
| State `OBJECTIVE_APPROVED` | Row can be assignable | Allow |
| No assignable visible records | Show blocked-state message | No request sent |

## 10. Implementation Phases Before Starting

Use these phases in order. Each phase should be implemented and checked before moving to the next one, because the UI changes and backend score-weight behavior are connected.

### Phase 1: Confirm Current Baseline

Goal:

- Confirm the current code behavior before editing.

Tasks:

- Re-check manager objective library modal opens from `showObjectiveLibraryModal`.
- Re-check bulk assignment modal opens from `showBulkModal`.
- Confirm current row expansion/noisy content behavior.
- Confirm current assignable count and blocked rows.
- Confirm current backend rejects unsupported bulk weightage arrays.
- Confirm current template setting path:
  - `objectiveConfig.objectiveScoringPolicy.managerCreatedScoreable`

Files to inspect:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`
- `Client/src/lib/services/api/pmsObjectives.ts`
- `Server/src/services/objective.service.ts`
- `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte`

Expected output:

- No code change.
- Clear understanding of current behavior before implementation.

Risk:

- Low.

Phase 1 baseline confirmation:

- Confirmed on `2026-06-24`.
- No behavior code was changed during this phase.
- `Client` repo had no code diff before this baseline update.
- `Server` repo changes are documentation-only.
- `showObjectiveLibraryModal` is the current Manager Objective Builder modal state flag.
- `showBulkModal` is the current Assign Objective to Employees modal state flag.
- `openAssignEmployeesModal(...)` resets filters, selection, expanded row state, failures, and opens `showBulkModal`.
- `handleBulkAssignManagerObjective(...)` submits selected assignments and manager objective drafts through `pmsObjectivesApi.bulkAssignManagerObjectives(...)`.
- Current submit enablement is still basic:

```ts
selectedAssignAssignments.length > 0 &&
assigningObjectiveDrafts.length > 0
```

- Current frontend eligibility allows manager objective assignment when:

```ts
assignment.objectiveConfig.allowManagerCreated &&
managerObjectiveCreateQuarterStates.has(assignment.termState) &&
(assignment.termState === "OBJECTIVE_APPROVED" || isObjectiveSettingWindowOpen(assignment))
```

- Current allowed frontend manager-create states are:
  - `OBJECTIVE_SETTING_OPEN`
  - `OBJECTIVE_APPROVED`
- Current bulk modal row content is still visually heavy:
  - every row shows `Objectives to assign for this record`,
  - every row shows existing manager objective details or empty state,
  - the detailed assignment panel is separately controlled by `expandedAssignmentDetailId`.
- Current frontend API sanitizes:

```ts
objectiveConfig.objectiveScoringPolicy.managerCreatedScoreable === true
```

- Current frontend bulk API uses the first selected assignment as the payload anchor:

```ts
const anchorAssignment = assignments[0];
toBackendObjectivePayload(draft, anchorAssignment);
```

- This confirms the mixed-selection payload gap described in this plan.
- Current template builder setting exists as:
  - `Manager-added objectives can carry score weight`
  - mapped to `objectiveScoringPolicy.managerCreatedScoreable`.
- Current backend bulk service rejects unsupported bulk weightage arrays:

```ts
weightageAdjustments
objectiveWeightageOverrides
```

- Current backend stores manager objective `weightage` only when:

```ts
this.objectiveSourceIsScoreable(source, objectiveConfig)
```

- Current backend default scoring policy has:

```ts
managerCreatedScoreable: false
```

- Current backend `validateQuarterObjectiveRules(...)` returns early when `newWeightage === undefined`, so the later backend hardening phase is still needed for explicit missing-weightage rejection on scoreable manager objectives.

### Phase 2: Bulk Modal UI Cleanup

Goal:

- Make the assignment modal easier to use without changing backend behavior.

Tasks:

- Keep assignment rows compact by default.
- Show only essential row data:
  - employee,
  - cycle,
  - term,
  - workflow state,
  - availability label,
  - existing manager objective count,
  - selected state.
- Move full objective detail blocks under expanded/selected state.
- Keep `Objectives to assign for this record` hidden until the record is selected or expanded.
- Add a clear blocked panel when visible records exist but `visibleAssignableRecordCount === 0`.
- Improve empty state when filters return no visible records.

Frontend file:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`

Backend files:

- None.

Validation:

- Bulk modal still opens.
- Existing filters still work.
- Selection still works.
- Submit behavior remains unchanged.
- No API contract changes.

Expected result:

- The modal becomes cleaner and less confusing.
- Users can still inspect blocked records, but large detail content is not always open.

Risk:

- Low to medium, because modal markup changes can affect layout.

Phase 2 implementation confirmation:

- Implemented on `2026-06-24`.
- Frontend-only change.
- Backend behavior was not changed.
- API payload behavior was not changed.
- Submit validation behavior was not changed.
- Manager objective library/remove behavior was not changed.
- Updated file:
  - `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`
- Added blocked-state panel when filtered records exist but none are assignable.
- Removed always-visible heavy row cards from the default assignment row.
- Kept default row focused on:
  - cycle,
  - term,
  - workflow state,
  - assignment reference,
  - availability label,
  - existing manager objective count,
  - selected/not selected state.
- Moved `Objectives to assign for this record` behind:

```svelte
expandedAssignmentDetailId === assignment.id || isAssignAssignmentSelected(assignment.id)
```

- Moved existing manager objective cards behind the same expanded/selected condition.
- Removed the extra two-column row summary cards for `New objective status` and `Existing manager objectives` because that information is already represented by compact chips.
- Verification:
  - `npm run check` was attempted.
  - Project-wide check still fails on existing unrelated issues, starting with `IndividualWorkHoursWidget.svelte` Tailwind `hover:bg-text-muted/30`.
  - Filtered diagnostics show no new `ObjectiveWorkspace.svelte` error from this Phase 2 change.
  - Existing `ObjectiveWorkspace.svelte` a11y warning remains around line `6773`, outside this bulk modal change.

### Phase 3: Scoreability Badges and Summary

Goal:

- Make it clear whether manager-created objectives will be scoreable or context-only for selected assignments.

Tasks:

- Add helper:

```ts
function managerObjectiveWeightageAllowedForAssignment(assignment: PmsObjectiveAssignment) {
  return assignment.objectiveConfig?.objectiveScoringPolicy?.managerCreatedScoreable === true;
}
```

- Show scoreability badge per assignment row:
  - `Scoreable`
  - `Context-only`
- Add selected summary in the modal/sidebar:
  - selected record count,
  - scoreable selected count,
  - context-only selected count,
  - selected objective count.
- Show explanatory text:
  - `Manager weightage applies only to scoreable selected records.`

Frontend file:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`

Backend files:

- None.

Validation:

- Scoreable badge appears only when `managerCreatedScoreable === true`.
- Context-only badge appears when not enabled.
- Mixed selection clearly shows both counts.

Expected result:

- End user understands why weightage may or may not apply.

Risk:

- Low.

Phase 3 implementation confirmation:

- Implemented on `2026-06-24`.
- Frontend-only change.
- Backend behavior was not changed.
- API payload behavior was not changed.
- Submit validation behavior was not changed.
- Updated file:
  - `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`
- Added display helper:

```ts
managerObjectiveWeightageAllowedForAssignment(...)
```

- Added row scoreability labels:
  - `Scoreable`
  - `Context-only`
- Added selected assignment summary in the bulk modal sidebar:
  - selected records,
  - objectives selected,
  - scoreable selected records,
  - context-only selected records.
- Added sidebar explanation that manager weightage applies only to selected records marked `Scoreable`.
- Verification:
  - Focused `svelte-check` diagnostics were run for `ObjectiveWorkspace.svelte`.
  - Project-wide preprocessing still fails on existing unrelated `IndividualWorkHoursWidget.svelte` Tailwind `hover:bg-text-muted/30`.
  - No new `ObjectiveWorkspace.svelte` error was reported from this Phase 3 change.
  - Existing `ObjectiveWorkspace.svelte` a11y label warning remains, now around line `6793`, outside this bulk modal change.

### Phase 4: Conditional Weightage UI and FE Validation

Goal:

- Require manager objective weightage only when at least one selected assignment is scoreable.

Tasks:

- Add selected scoreable/context-only helpers:

```ts
function selectedScoreableAssignments() {
  return selectedAssignAssignments.filter(managerObjectiveWeightageAllowedForAssignment);
}

function selectedContextOnlyAssignments() {
  return selectedAssignAssignments.filter(
    (assignment) => !managerObjectiveWeightageAllowedForAssignment(assignment),
  );
}
```

- Add manager objective weightage issue calculation:
  - if no selected scoreable assignment, no weightage issue,
  - if at least one scoreable assignment, weightage is required,
  - weightage must be numeric,
  - weightage must be greater than `0`,
  - weightage must be at most `100`.
- Update `canSubmitBulkAssignment` to include weightage validation.
- In the right sidebar/objective list:
  - show weightage input only when selected assignments include scoreable records,
  - show `All selected records are context-only` when none are scoreable,
  - show `Applies only to scoreable selected records` when mixed.

Frontend file:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`

Backend files:

- None in this phase.

Validation:

- Context-only selected records can submit without weightage.
- Scoreable selected records cannot submit with missing/invalid weightage.
- Mixed selected records require weightage because scoreable records exist.
- Submit button disables/enables correctly.

Risk:

- Medium.

Phase 4 implementation confirmation:

- Implemented on `2026-06-24`.
- Frontend-only change.
- Backend behavior was not changed.
- API payload behavior was not changed.
- Updated file:
  - `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`
- Added selected scoreability state:
  - `hasSelectedScoreableAssignments`
  - `managerObjectiveWeightageIssues`
- Updated submit enablement so scoreable selected records require valid manager objective weightage.
- Added submit-time toast guard for invalid/missing manager objective score weight.
- Added sidebar weightage input only when at least one selected record is `Scoreable`.
- For scoreable selected records:
  - weightage is required,
  - weightage must be numeric,
  - weightage must be greater than `0`,
  - weightage must be at most `100`.
- For context-only selected records:
  - no weightage input is shown,
  - no score weight is required,
  - UI clearly says the objective is context-only for selected records.
- For mixed selected records:
  - weightage input is shown,
  - copy explains it applies only to scoreable selected records,
  - context-only records ignore that weightage.
- Verification:
  - Focused `svelte-check` diagnostics were run for `ObjectiveWorkspace.svelte`.
  - Project-wide preprocessing still fails on existing unrelated `IndividualWorkHoursWidget.svelte` Tailwind `hover:bg-text-muted/30`.
  - No new `ObjectiveWorkspace.svelte` error was reported from this Phase 4 change.
  - Existing `ObjectiveWorkspace.svelte` a11y label warning remains, now around line `6842`, outside this bulk modal change.

### Phase 5: Bulk Payload Fix

Goal:

- Stop using the first selected assignment to decide whether weightage is sent.

Tasks:

- Add a bulk-specific manager objective payload converter.
- Include `weightage` when the manager objective draft has a weightage.
- Do not call the single-assignment payload mapper with only the first selected assignment.
- Continue sending:

```ts
{
  termAssignmentIds,
  objectives
}
```

- Do not send unsupported arrays:
  - `weightageAdjustments`,
  - `objectiveWeightageOverrides`.

Frontend file:

- `Client/src/lib/services/api/pmsObjectives.ts`

Backend files:

- None in this phase.

Validation:

- If first selected record is context-only and second is scoreable, payload still includes objective `weightage`.
- Backend stores weightage only for scoreable assignment.
- Backend stores no weightage for context-only assignment.

Risk:

- Medium, because API payload mapping changes.

Phase 5 implementation confirmation:

- Implemented on `2026-06-24`.
- Frontend API change only.
- Backend behavior was not changed.
- Updated file:
  - `Client/src/lib/services/api/pmsObjectives.ts`
- Added bulk-specific manager objective payload mapper:

```ts
toBackendBulkManagerObjectivePayload(...)
```

- Removed the use of `assignments[0]` as the bulk payload anchor.
- Bulk manager assignment now includes draft `weightage` when the manager draft has it.
- Backend remains responsible for per-assignment scoreability:
  - scoreable assignment stores weightage,
  - context-only assignment ignores weightage.
- Payload still sends only:

```ts
{
  termAssignmentIds,
  objectives
}
```

- Payload does not send unsupported arrays:
  - `weightageAdjustments`
  - `objectiveWeightageOverrides`
- Verification:
  - Focused `svelte-check` diagnostics were run for `pmsObjectives.ts` and `ObjectiveWorkspace.svelte`.
  - Project-wide preprocessing still fails on existing unrelated `IndividualWorkHoursWidget.svelte` Tailwind `hover:bg-text-muted/30`.
  - No `pmsObjectives.ts` error was reported from this Phase 5 change.
  - Existing `ObjectiveWorkspace.svelte` a11y label warning remains around line `6842`, outside this payload change.

### Phase 6: Backend Hardening for Scoreable Manager Objectives

Goal:

- Make backend validation explicit and protect against crafted requests.

Backend change needed:

- Yes.

Tasks:

- In `bulkCreateManagerObjectives`, before `validateQuarterObjectiveRules`, add an explicit missing-weightage guard when:

```ts
this.objectiveSourceIsScoreable(source, objectiveConfig)
```

- Reject missing or invalid score weight for scoreable manager-created objectives.
- Keep context-only behavior unchanged:

```ts
weightage: this.objectiveSourceIsScoreable(source, objectiveConfig)
  ? objectiveInput.weightage
  : undefined
```

- Keep current backend rejection for unsupported arrays:

```ts
weightageAdjustments
objectiveWeightageOverrides
```

Backend file:

- `Server/src/services/objective.service.ts`

Frontend files:

- None in this phase, unless backend error text needs UI copy alignment.

Validation:

- Crafted request with scoreable manager objective and no weightage fails.
- Crafted request with context-only manager objective and no weightage succeeds.
- Crafted request with `weightageAdjustments` still fails.
- Normal UI submission still succeeds.

Risk:

- Low to medium.

Phase 6 implementation confirmation:

- Implemented on `2026-06-24`.
- Backend change only.
- Frontend behavior was not changed in this phase.
- Updated file:
  - `Server/src/services/objective.service.ts`
- Added explicit score-weight guard inside `bulkCreateManagerObjectives(...)` for scoreable manager-created objectives.
- Guard applies only when:

```ts
this.objectiveSourceIsScoreable(source, objectiveConfig)
```

- New backend rule:
  - score weight is required,
  - score weight must be numeric,
  - score weight must be greater than `0`,
  - score weight must be at most `100`.
- Context-only manager-created objectives remain unchanged:
  - no weightage required,
  - stored with `weightage: undefined`.
- Existing unsupported bulk array rejection remains unchanged:
  - `weightageAdjustments`
  - `objectiveWeightageOverrides`
- Verification:
  - Ran `npm run build` in `Server`.
  - TypeScript build passed.
  - Postbuild template/public asset copy completed.

### Phase 7: End-to-End QA

Goal:

- Confirm FE and BE behavior together.

Test cases:

1. Context-only template assignment:
   - manager assigns objective,
   - no weightage required,
   - created objective has no score weight.
2. Scoreable template assignment:
   - manager assigns objective,
   - weightage is required,
   - created objective stores score weight.
3. Mixed selected assignments:
   - summary shows scoreable and context-only counts,
   - one submit creates correct records for both assignment types.
4. No assignable records:
   - blocked-state panel appears,
   - submit remains disabled.
5. Already-assigned objective:
   - row is not selectable,
   - reason is visible.
6. Outside objective window:
   - row is not selectable unless state behavior explicitly allows it.
7. Backend bypass:
   - scoreable request without weightage is rejected.

Files to verify:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`
- `Client/src/lib/services/api/pmsObjectives.ts`
- `Server/src/services/objective.service.ts`

Risk:

- Medium, because this phase validates real cross-layer behavior.

Phase 7 QA confirmation:

- Completed on `2026-06-24`.
- Code-level FE/BE contract review completed.
- Server build completed successfully:

```bash
npm run build
```

- Server build result:
  - TypeScript compile passed.
  - Postbuild template/public asset copy completed.
- Client focused diagnostics completed for touched files:

```bash
npx svelte-check --tsconfig ./tsconfig.json --output machine
```

- Client focused result:
  - no `pmsObjectives.ts` error reported,
  - no new `ObjectiveWorkspace.svelte` error reported from the manager bulk assignment changes,
  - existing `ObjectiveWorkspace.svelte` a11y label warning remains around line `6842`, outside this bulk modal change,
  - project-wide preprocessing remains blocked by existing unrelated `IndividualWorkHoursWidget.svelte` Tailwind `hover:bg-text-muted/30`.

QA matrix result:

| Case | Result |
|---|---|
| Context-only selected records | FE does not require score weight. Backend still stores manager-created objective with `weightage: undefined` because `objectiveSourceIsScoreable(...)` is false. |
| Scoreable selected records | FE requires valid score weight before submit. Backend rejects crafted missing/invalid score weight. |
| Mixed selected records | FE shows scoreable/context-only counts. Payload includes draft weightage. Backend applies weightage only to scoreable assignments. |
| No assignable visible records | FE shows blocked-state panel. Submit remains disabled because no selected assignments exist. |
| Existing selected objective already assigned | Existing row eligibility/reason logic remains unchanged. |
| Unsupported weightage arrays | Backend still rejects `weightageAdjustments` and `objectiveWeightageOverrides`. |
| Backend bypass missing score weight | Backend hardening rejects scoreable manager-created objective with missing/invalid weightage. |

Remaining manual browser checks:

- Open Manager Objective Builder.
- Assign one objective to only context-only records.
- Assign one objective to only scoreable records.
- Assign one objective to mixed selected records.
- Confirm row chips and sidebar counts match selected records.
- Confirm selected/expanded rows are the only rows showing full objective detail cards.
- Confirm created backend objective rows store score weight only for scoreable assignments.

### Phase 8: Later Enhancement, Not Now

Goal:

- Full per-assignment weightage override and existing manager objective weightage adjustment.

Do not implement this in the immediate update.

Requires:

- backend support for `weightageAdjustments`,
- backend support for `objectiveWeightageOverrides`,
- frontend override UI,
- total cap validation for changed existing + new objectives,
- updated API contract,
- updated test coverage.

Reason:

- Current backend explicitly rejects those arrays.
- Adding the UI without backend support will create confusing failures.

Phase 8 status confirmation:

- Reviewed on `2026-06-24`.
- Not implemented in this update by design.
- No code changes made for Phase 8.
- Current backend still rejects:
  - `weightageAdjustments`
  - `objectiveWeightageOverrides`
- This is correct for the current release scope.
- Implementing Phase 8 later should be treated as a separate FE/BE feature because it needs:
  - new backend contract support,
  - assignment-level override validation,
  - existing manager objective weightage update support,
  - stronger total cap calculation,
  - frontend editing UI,
  - migration/test coverage for mixed existing and new objective weights.
- Current completed implementation intentionally stops at objective-level score weight controlled by:

```ts
objectiveConfig.objectiveScoringPolicy.managerCreatedScoreable
```

## 11. Final Recommended Immediate Scope

Implemented in this update:

1. Compact bulk assignment modal rows.
2. Better zero-assignable state.
3. Scoreability badges.
4. Conditional weightage UI based on `managerCreatedScoreable`.
5. Fix bulk API payload so scoreable selected assignments can receive weightage.
6. Backend hardening for missing score weight when scoreable.
7. End-to-end QA for context-only, scoreable, and mixed assignment selections.

Deferred to a later enhancement:

- existing manager objective weightage edit from the bulk modal,
- per-assignment objective weightage override arrays,
- bulk weightage adjustment arrays.

Reason:

- Current backend explicitly rejects bulk weightage adjustment arrays.
- The safe and correct next step is objective-level score weight controlled by `managerCreatedScoreable`.
