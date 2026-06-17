# PMS Quarter Assignment State Fix - Implementation Phases

## Phase 1 - BE State Logic Fix

### Goal

Fix the backend quarter assignment state movement so predefined objectives do not silently skip the objective setting stage.

### Current Issue

Current launch flow:

```text
Launch cycle
-> create quarter_assignments as NOT_STARTED
-> seed predefined objectives as OBJECTIVE_APPROVED
-> move directly to EMPLOYEE_ACHIEVEMENT_OPEN or MANAGER_REVIEW_OPEN
```

This causes an issue when predefined objectives are only baseline/reference objectives and employee-created or manager-created objectives are still allowed.

### Required Backend Behavior

Update assignment launch behavior as follows:

```text
Launch cycle
-> create quarter_assignments
-> seed predefined objectives as OBJECTIVE_APPROVED
-> keep/set quarterState = OBJECTIVE_SETTING_OPEN
```

Predefined objectives shall remain approved, but the quarter assignment itself shall stay in objective setting stage when additional objectives are allowed.

### Backend Files To Review

```text
Server/src/services/assignment.service.ts
Server/src/services/objective.service.ts
Server/src/services/quarter-assignment-workflow.service.ts
Server/src/services/employeeAchievementSubmission.service.ts
Server/src/services/quarterReview.service.ts
Server/src/constants/pms.enums.ts
```

### Required Changes

1. Review `seedPredefinedObjectives(...)`.
2. Review `openSeededQuarterAssignmentsForObjectiveSetting(...)`.
3. Prevent launch from directly advancing to `EMPLOYEE_ACHIEVEMENT_OPEN` or `MANAGER_REVIEW_OPEN` when objective setting should remain open.
4. Keep predefined objectives as:

```text
source = PREDEFINED
isPredefined = true
status = OBJECTIVE_APPROVED
createdByRole = SYSTEM
```

5. Ensure quarter assignment state becomes:

```text
OBJECTIVE_SETTING_OPEN
```

when objective setting is active or employee/manager-created objectives are allowed.

6. Do not move existing old records backward automatically.

### Expected Result

After launch:

```text
Predefined objectives exist
-> predefined objectives are approved
-> employee/manager can still add allowed objectives
-> quarterState remains OBJECTIVE_SETTING_OPEN
```

---

## Phase 2 - FE State Logic / UI Gating Fix

### Goal

Update frontend behavior to correctly display the new state flow and allow the correct actions during `OBJECTIVE_SETTING_OPEN`.

### Important Rule

Frontend must not directly update `quarterState`.

Frontend shall only:

```text
display current state
show/hide allowed actions
call backend APIs
show validation/error messages
```

### Required Frontend Behavior

When quarterState is:

```text
OBJECTIVE_SETTING_OPEN
```

the Objective Setting screen should:

```text
show predefined objectives as approved template/reference objectives
allow employee-created objectives if configured
allow manager-created objectives if configured
allow employee submit -> manager approve/return flow
show manager-created objectives as auto-approved
```

When quarterState is:

```text
EMPLOYEE_ACHIEVEMENT_OPEN
```

employee achievement submission should be editable.

When quarterState is:

```text
MANAGER_REVIEW_OPEN
```

manager review should be editable, and employee achievement should no longer be editable.

### Frontend Files To Review

```text
Client/src/lib/components/pms/objectives/*
Client/src/lib/components/pms/reviews/QuarterReviewWorkspace.svelte
Client/src/lib/components/pms/achievements/*
Client/src/lib/types/pms.ts
Client/src/lib/services/pms/*
```

### Required Changes

1. Ensure predefined objectives display as approved/reference objectives.
2. Do not block employee-created or manager-created objectives just because predefined objectives exist.
3. Ensure manager review edit remains allowed only when:

```text
quarterState === MANAGER_REVIEW_OPEN
```

4. Ensure employee achievement edit remains allowed only when:

```text
quarterState === EMPLOYEE_ACHIEVEMENT_OPEN
```

5. Add clear UI labels so users understand:

```text
Predefined Objective
Employee Objective
Manager Objective
Approved
Pending Approval
Returned for Revision
```

### Expected Result

Objective Setting screen becomes usable even when predefined objectives exist.

---

## Phase 3 - BE Close Objective Setting Action

### Goal

Add an explicit backend action to move a quarter assignment out of objective setting.

This is needed because moving from objective setting to achievement/review should be visible and auditable.

### Required Action

```text
CLOSE_OBJECTIVE_SETTING
```

### Permission Rule

```text
Manager can close objective setting for their assigned employee.
HR/Admin can override/close.
Employee cannot close objective setting alone.
```

### Required Backend Flow

When Manager or HR/Admin closes objective setting:

```text
OBJECTIVE_SETTING_OPEN
-> OBJECTIVE_APPROVED
```

Close Objective Setting must not directly open employee achievement or manager review.

Manual Admin Workflow Sync owns the next move from `OBJECTIVE_APPROVED` to `EMPLOYEE_ACHIEVEMENT_OPEN` or `MANAGER_REVIEW_OPEN`.

### Confirmation Text

```text
Predefined objectives are approved. No additional objectives will be accepted after moving forward.
```

### Audit Fields

Add/update tracking fields:

```text
objectiveSettingClosedBy
objectiveSettingClosedAt
objectiveSettingCloseReason
objectiveSettingCloseSource: MANAGER | ADMIN
```

### Workflow Event

```text
ACTION: CLOSE_OBJECTIVE_SETTING
FROM: OBJECTIVE_SETTING_OPEN
TO: OBJECTIVE_APPROVED
```

### Required Backend Rules

1. Use existing workflow transition service.
2. Do not directly update `quarterState`.
3. Validate permission.
4. Validate assignment ownership.
5. Validate current state.
6. Validate no pending employee objectives are waiting for approval unless business rule allows forced close.
7. Create workflow/audit records.
8. Return updated quarter assignment state to frontend.

### Expected Result

Manager/Admin can explicitly close objective setting with audit, and the assignment waits in `OBJECTIVE_APPROVED` for Manual Sync.

---

## Phase 4 - FE Close Objective Setting Action

### Goal

Add UI action for Manager/Admin to close objective setting.

### UI Placement

Add button in Objective Setting screen or assignment detail screen:

```text
Close Objective Setting
```

Show only when:

```text
quarterState === OBJECTIVE_SETTING_OPEN
```

and logged-in user is:

```text
Manager or HR/Admin
```

### Confirmation Message

```text
Predefined objectives are approved. No additional objectives will be accepted after moving forward.
```

### UI Behavior

On click:

```text
show confirmation modal
-> user confirms
-> call backend CLOSE_OBJECTIVE_SETTING API
-> refresh assignment/objective state
-> show success message
```

### Success Message

```text
Objective setting closed successfully.
```

### Error Handling

Show backend validation messages clearly, for example:

```text
Objective setting cannot be closed because employee-created objectives are still pending approval.
```

or:

```text
You do not have permission to close objective setting for this assignment.
```

### Expected Result

Users get a clear visible action instead of silent state movement.

---

## Phase 5 - BE Admin Manual Workflow Sync

### Goal

Add backend service for HR/Admin manual workflow sync.

This is not a cron job in the current phase.

The sync shall be triggered manually from UI by HR/Admin.

### Required Action

```text
SYNC_WORKFLOW_STATES
```

### Required Backend Flow

```text
Admin clicks Sync Workflow States
-> backend reads current date/time
-> backend checks configured assessment term windows
-> backend finds eligible quarter assignments
-> backend skips assignments still in OBJECTIVE_SETTING_OPEN
-> backend validates allowed workflow transition
-> backend updates eligible records
-> backend writes workflow/audit records
-> backend returns sync result summary
```

### Date Rule

Do not use only:

```text
currentDate == windowEndDate
```

Use:

```text
currentDate >= windowEndDate
```

or proper window range check:

```text
windowStart <= currentDate <= windowEnd
```

### Sync Scope

Check windows for:

```text
Objective Setting Window
Objective Approval Window
Employee Achievement Submission Window, if enabled
Manager Review Window
Finalization Window
```

### Allowed Sync Behavior

The sync service shall move records forward only.

Example allowed movement:

```text
NOT_STARTED -> OBJECTIVE_SETTING_OPEN
```

when objective setting window is active.

Manual Sync must not close Objective Setting silently.

Do not move:

```text
OBJECTIVE_SETTING_OPEN -> OBJECTIVE_APPROVED
```

That transition belongs only to the Manager/Admin Close Objective Setting action.

```text
OBJECTIVE_APPROVED -> EMPLOYEE_ACHIEVEMENT_OPEN
```

when employee achievement is enabled.

```text
OBJECTIVE_APPROVED -> MANAGER_REVIEW_OPEN
```

when employee achievement is disabled or manager-only flow is configured.

```text
EMPLOYEE_ACHIEVEMENT_OPEN -> MANAGER_REVIEW_OPEN
```

only when achievement is submitted, locked, or bypassed by valid config.

```text
MANAGER_REVIEW_SUBMITTED -> QUARTER_FINALIZED
```

when finalization rule/window is eligible.

If employee achievement is disabled:

```text
OBJECTIVE_SETTING_OPEN
-> Manager/Admin closes objective setting
-> OBJECTIVE_APPROVED
-> Manual Sync moves to MANAGER_REVIEW_OPEN
```

### No Backward Movement

Sync must never move records backward.

Do not move:

```text
EMPLOYEE_ACHIEVEMENT_OPEN
MANAGER_REVIEW_OPEN
MANAGER_REVIEW_SUBMITTED
QUARTER_FINALIZED
```

back to:

```text
OBJECTIVE_SETTING_OPEN
OBJECTIVE_APPROVED
```

### Audit Fields

Every sync transition must update:

```text
quarterState
previousQuarterState
lastTransitionAt
lastTransitionBy
lastTransitionRole
lastTransitionReason
```

Every sync event must create audit/workflow record:

```text
action: ADMIN_WORKFLOW_SYNC
source: ADMIN_MANUAL_SYNC
fromState
toState
windowName
windowStart
windowEnd
actorId
actorRole
reason
createdAt
```

### API Needed

Add backend API for HR/Admin:

```text
POST /pms/workflow/sync
```

or module-consistent route:

```text
POST /pms/cycles/{cycleId}/workflow-sync
```

Payload:

```text
{
  cycleId,
  assessmentTermCode optional,
  dryRun optional,
  reason
}
```

Response:

```text
{
  totalChecked,
  totalUpdated,
  skippedNotEligible,
  skippedAlreadyAdvanced,
  skippedObjectiveSettingOpen,
  skippedTransitionNotAllowed,
  failed,
  results[]
}
```

### Expected Result

HR/Admin can trigger backend sync and update eligible states safely with audit.

---

## Phase 6 - FE Admin Manual Workflow Sync

### Goal

Add HR/Admin UI button to trigger workflow sync.

### UI Placement

Add button in Cycle detail / Assignment monitoring screen:

```text
Sync Workflow States
```

Show only for:

```text
HR/Admin
```

### Confirmation Message

```text
This will update eligible PMS assignment states based on the configured assessment term windows. Existing records will not be moved backward.
```

### UI Flow

```text
Admin clicks Sync Workflow States
-> confirmation modal opens
-> Admin confirms
-> frontend calls backend sync API
-> show loading state
-> show result summary
-> refresh cycle/assignment list
```

### Result Summary UI

Show:

```text
Total checked
Total updated
Skipped because not eligible
Skipped because already advanced
Skipped because transition not allowed
Failed with reason
```

### Error Handling

Show clear error messages:

```text
Workflow sync failed. Please check the failed records and try again.
```

For per-record failures, show:

```text
Employee
Assessment Term
Current State
Expected Action
Failure Reason
```

### Important Rule

Frontend must not calculate or update workflow states.

Frontend only triggers sync and displays backend response.

### Expected Result

HR/Admin gets one safe manual action to sync eligible workflow states from UI.

---

## Final Implementation Order

Recommended order:

```text
1. BE State Logic Fix
2. FE State Logic / UI Gating Fix
3. BE Close Objective Setting Action
4. FE Close Objective Setting Action
5. BE Admin Manual Workflow Sync
6. FE Admin Manual Workflow Sync
```

Do not implement cron/background job now.

Current phase:

```text
Admin Manual UI Sync only
```

Future phase:

```text
Optional cron/job reuse using same backend sync service
```
