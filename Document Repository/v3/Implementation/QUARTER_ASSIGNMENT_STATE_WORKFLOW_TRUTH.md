# Quarter Assignment State Workflow Truth

Last updated: 17 June 2026

This document is the single implementation reference for PMS v3 `quarterAssignment.quarterState` behavior around predefined objectives, objective setting close, manual admin workflow sync, employee achievement submission, and manager review state movement.

## Final Confirmed Flow

Manual Sync must not close Objective Setting silently.

The confirmed flow is:

```text
Launch / Assignment
-> Quarter Assignment created
-> Predefined objectives seeded as OBJECTIVE_APPROVED
-> quarterState stays OBJECTIVE_SETTING_OPEN

Manager/Admin action
-> Close Objective Setting
-> quarterState becomes OBJECTIVE_APPROVED

Manual Sync
-> checks date/window/config
-> moves OBJECTIVE_APPROVED to EMPLOYEE_ACHIEVEMENT_OPEN if achievement is enabled

Employee action
-> Employee submits/locks achievement

Manual Sync
-> moves EMPLOYEE_ACHIEVEMENT_OPEN to MANAGER_REVIEW_OPEN when eligible

Manager action
-> Manager submits review

Existing flow
-> MANAGER_REVIEW_SUBMITTED to QUARTER_FINALIZED as per current finalization logic
```

If employee achievement is disabled:

```text
OBJECTIVE_SETTING_OPEN
-> Manager/Admin closes objective setting
-> OBJECTIVE_APPROVED
-> Manual Sync moves to MANAGER_REVIEW_OPEN
```

## Final Ownership Rules

Manual Sync is HR/Admin only, not Manager.

Manager ownership:

```text
Can create manager objectives during OBJECTIVE_SETTING_OPEN.
Can approve/return employee-created objectives during OBJECTIVE_SETTING_OPEN.
Can click Close Objective Setting for assigned employees.
Can edit/submit manager review only in MANAGER_REVIEW_OPEN.
```

Employee ownership:

```text
Can create/submit objectives during OBJECTIVE_SETTING_OPEN.
Can revise returned objectives where allowed.
Can submit achievement only in EMPLOYEE_ACHIEVEMENT_OPEN.
```

HR/Admin ownership:

```text
Can trigger Manual Sync.
Can override/close Objective Setting where allowed.
Can monitor and manage assignments.
Can manage exception/override actions with audit.
```

State movement ownership:

```text
Launch:
Backend sets quarterState = OBJECTIVE_SETTING_OPEN after predefined objectives are seeded as OBJECTIVE_APPROVED.

Close Objective Setting:
Manager/Admin explicit action moves OBJECTIVE_SETTING_OPEN -> OBJECTIVE_APPROVED.
Manual Sync must not perform this transition silently.

Manual Sync:
HR/Admin action moves OBJECTIVE_APPROVED -> EMPLOYEE_ACHIEVEMENT_OPEN if achievement is enabled and eligible.
HR/Admin action moves OBJECTIVE_APPROVED -> MANAGER_REVIEW_OPEN if achievement is disabled or manager-only flow is configured.
HR/Admin action moves EMPLOYEE_ACHIEVEMENT_OPEN -> MANAGER_REVIEW_OPEN only if achievement is submitted/locked or valid bypass config exists.

Manager Review:
Manager can act only after quarterState becomes MANAGER_REVIEW_OPEN.
```

## Assessment Term Creation

Cycle term type controls which term assignments are created.

```text
QUARTERLY    -> Q1, Q2, Q3, Q4
HALF_YEARLY  -> H1, H2
YEARLY       -> Y1
```

Source:

```text
Server/src/constants/pms.enums.ts
getAssessmentTerms(...)
```

During employee assignment, `assignment.service.ts` reads the cycle assessment term type, creates the applicable `quarter_assignments`, and initially sets each one to:

```text
NOT_STARTED
```

Source:

```text
Server/src/services/assignment.service.ts
buildQuarterAssignments(...)
```

## Predefined Objective Seeding During Assignment Launch

After `quarter_assignments` are created, assignment launch calls:

```text
seedPredefinedObjectives(...)
```

This function reads the active template version, finds the objective section for the current assessment term, and creates predefined objectives for each matching quarter/term assignment.

Predefined objective records are created with:

```text
source = PREDEFINED
isPredefined = true
status = OBJECTIVE_APPROVED
createdByRole = SYSTEM
```

After seeding predefined objectives, launch must keep/set:

```text
quarterState = OBJECTIVE_SETTING_OPEN
```

Predefined objectives are approved template/reference objectives, but they do not close objective setting.

Source:

```text
Server/src/services/assignment.service.ts
seedPredefinedObjectives(...)
openSeededQuarterAssignmentsForObjectiveSetting(...)
```

## Objective Setting Stage

When `quarterState` is:

```text
OBJECTIVE_SETTING_OPEN
```

the Objective Setting flow should:

```text
show predefined objectives as approved/template reference
allow employee-created objectives if configured
allow manager-created objectives if configured
keep employee-created submit -> manager approve/return flow
keep manager-created auto-approve flow
```

Employee-created objectives:

```text
create/save
-> OBJECTIVE_DRAFT
-> submit
-> OBJECTIVE_SUBMITTED
-> manager approve/return
```

Manager-created objectives:

```text
create
-> OBJECTIVE_APPROVED
```

Manager-created objectives still auto-approve, but they must not move the assignment forward by themselves.

## Close Objective Setting

The move out of objective setting must be explicit.

Required action:

```text
CLOSE_OBJECTIVE_SETTING
```

Recommended confirmation text:

```text
Predefined objectives are approved. No additional objectives will be accepted after moving forward.
```

Permissions:

```text
Manager can close objective setting for their employee.
Admin can override/close.
Employee should not close objective setting alone.
```

Close action state movement:

```text
OBJECTIVE_SETTING_OPEN
-> OBJECTIVE_APPROVED
```

Close should validate:

```text
confirmation accepted
actor is Manager/Admin
assignment ownership/permission
current state is objective-setting/objective-approved path
no pending employee/manager-created objectives are waiting for approval
```

Recommended tracked fields:

```text
objectiveSettingClosedBy
objectiveSettingClosedAt
objectiveSettingCloseReason
objectiveSettingCloseSource: MANAGER | ADMIN
```

Important:

```text
Close Objective Setting does not itself open Employee Achievement or Manager Review.
Manual Sync handles the next state after OBJECTIVE_APPROVED.
```

## Manual Admin Workflow Sync

Manual Sync is a HR/Admin-triggered backend action only.

Manager must not trigger Manual Sync.

It is not a cron job in the current phase.

Manual Sync must not close Objective Setting silently.

Admin flow:

```text
HR/Admin opens Cycle / Assignment screen
-> clicks "Sync Workflow States"
-> backend checks current date + configured windows
-> backend updates only eligible states
-> UI shows summary
```

Frontend only triggers the sync action and displays the result.

Frontend must not directly update:

```text
quarterState
```

All state changes must happen in the backend using the existing workflow transition service.

Manual Sync allowed forward movements:

```text
OBJECTIVE_APPROVED
-> EMPLOYEE_ACHIEVEMENT_OPEN
```

when employee achievement is enabled and the achievement window/config is eligible.

```text
OBJECTIVE_APPROVED
-> MANAGER_REVIEW_OPEN
```

when employee achievement is disabled or manager-only flow is configured.

```text
EMPLOYEE_ACHIEVEMENT_OPEN
-> MANAGER_REVIEW_OPEN
```

when employee achievement is submitted/locked or bypass is valid by config.

```text
MANAGER_REVIEW_SUBMITTED
-> QUARTER_FINALIZED
```

as per current finalization logic.

Manual Sync must not move:

```text
OBJECTIVE_SETTING_OPEN
-> OBJECTIVE_APPROVED
```

That movement belongs only to the Manager/Admin Close Objective Setting action.

Manual Sync must never move records backward.

Existing records already moved to:

```text
EMPLOYEE_ACHIEVEMENT_OPEN
MANAGER_REVIEW_OPEN
MANAGER_REVIEW_SUBMITTED
QUARTER_FINALIZED
```

must not be moved back automatically.

Recommended confirmation message:

```text
This will update eligible PMS assignment states based on the configured assessment term windows. Existing records will not be moved backward.
```

Recommended sync result summary:

```text
Total checked
Total updated
Skipped because not eligible
Skipped because already advanced
Skipped because objective setting is still open
Skipped because transition not allowed
Failed with reason
```

## Employee Achievement To Manager Review

Employee achievement editing is allowed only when:

```text
quarterState === EMPLOYEE_ACHIEVEMENT_OPEN
```

After employee submits/locks achievement, Manual Sync may move:

```text
EMPLOYEE_ACHIEVEMENT_OPEN
-> MANAGER_REVIEW_OPEN
```

when eligible.

Source:

```text
Server/src/services/employeeAchievementSubmission.service.ts
```

## Manager Review Editing

Manager review editing is allowed only when:

```text
quarterState === MANAGER_REVIEW_OPEN
```

Manager submits review:

```text
MANAGER_REVIEW_OPEN
-> MANAGER_REVIEW_SUBMITTED
```

Existing finalization logic handles:

```text
MANAGER_REVIEW_SUBMITTED
-> QUARTER_FINALIZED
```

Source:

```text
Client/src/lib/components/pms/reviews/QuarterReviewWorkspace.svelte
canEditReview(...)
```

## Term Scope Compatibility

The implementation still stores template section level as:

```text
level: "QUARTER"
```

But it is treated as assessment-term-level in code.

Scope matching supports all terms directly:

```text
Q1, Q2, Q3, Q4, H1, H2, Y1
```

Also, if a section is scoped to all quarterly terms:

```text
Q1, Q2, Q3, Q4
```

the backend compatibility helper also treats it as matching:

```text
H1, H2, Y1
```

Source:

```text
Server/src/services/assignment.service.ts
assessmentTermScopeMatches(...)
```

Recommendation:

```text
Do not rename stored level: "QUARTER" now.
Use helper naming/documentation to call it Assessment Term level.
```

## Existing Data Compatibility

Existing records already moved to:

```text
EMPLOYEE_ACHIEVEMENT_OPEN
MANAGER_REVIEW_OPEN
MANAGER_REVIEW_SUBMITTED
QUARTER_FINALIZED
```

should not be automatically moved backward unless a deliberate migration/rollback plan is created.

New launch/new workflow records should follow:

```text
Launch
-> OBJECTIVE_SETTING_OPEN
-> Close Objective Setting
-> OBJECTIVE_APPROVED
-> Manual Sync
-> EMPLOYEE_ACHIEVEMENT_OPEN or MANAGER_REVIEW_OPEN
```
