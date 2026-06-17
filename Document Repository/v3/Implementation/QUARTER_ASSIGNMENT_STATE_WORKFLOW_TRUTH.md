# Quarter Assignment State Workflow Truth

Last updated: 17 June 2026

This document is the single implementation reference for current PMS v3 `quarterAssignment.quarterState` behavior around predefined objectives, employee achievement submission, and manager review state movement.

## Core Truth

The current implementation treats predefined template objectives as already approved seed data.

When an employee is assigned to a launched cycle:

```text
quarter_assignments are created
-> predefined objectives are seeded
-> predefined objectives are stored as OBJECTIVE_APPROVED
-> quarterState is moved to the next stage
```

Because of this, assignments with predefined objectives do not stay in `OBJECTIVE_SETTING_OPEN`.

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

Source:

```text
Server/src/services/assignment.service.ts
seedPredefinedObjectives(...)
```

## Why quarterState Becomes EMPLOYEE_ACHIEVEMENT_OPEN

After predefined objectives are seeded, assignment launch calls:

```text
openSeededQuarterAssignmentsForManagerReview(...)
```

Despite the method name, this does not always open manager review. It calculates the correct post-objective-approval state.

The target state is resolved by:

```text
resolvePostObjectiveApprovalState(...)
```

If the template has Employee Achievement Submission enabled, and the review flow mode is:

```text
ACHIEVEMENT_THEN_MANAGER
```

then the target state becomes:

```text
EMPLOYEE_ACHIEVEMENT_OPEN
```

If employee achievement is not enabled, or the flow is manager-only, the target state becomes:

```text
MANAGER_REVIEW_OPEN
```

Current launch flow with starter/predefined template:

```text
NOT_STARTED
-> predefined objectives seeded as OBJECTIVE_APPROVED
-> EMPLOYEE_ACHIEVEMENT_OPEN
```

This applies to all supported term types as long as the template section scope matches:

```text
Q1, Q2, Q3, Q4, H1, H2, Y1
```

## Term Scope Compatibility

The implementation still stores template section level as:

```text
level: "QUARTER"
```

But it is treated as assessment-term-level in code.

Scope matching supports all terms directly. Also, if a section is scoped to all quarterly terms:

```text
Q1, Q2, Q3, Q4
```

the BE compatibility helper also treats it as matching:

```text
H1, H2, Y1
```

Source:

```text
Server/src/services/assignment.service.ts
assessmentTermScopeMatches(...)
```

## MANAGER_REVIEW_OPEN State Change Points

`MANAGER_REVIEW_OPEN` is changed only in the backend. Frontend only displays and gates actions based on the state.

The common proper workflow transition writer is:

```text
Server/src/services/quarter-assignment-workflow.service.ts
transitionQuarterAssignmentState(...)
```

This updates:

```text
quarterAssignment.quarterState
previousQuarterState
lastTransitionAt
lastTransitionBy
lastTransitionRole
lastTransitionReason
```

and creates workflow/audit records.

### Main Paths To MANAGER_REVIEW_OPEN

1. Employee achievement submission is submitted/locked:

```text
EMPLOYEE_ACHIEVEMENT_OPEN
-> MANAGER_REVIEW_OPEN
```

Source:

```text
Server/src/services/employeeAchievementSubmission.service.ts
submit(...)
```

2. All objectives are approved and employee achievement is not enabled:

```text
OBJECTIVE_APPROVED
-> MANAGER_REVIEW_OPEN
```

Source:

```text
Server/src/services/objective.service.ts
updateQuarterStateAfterApproval(...)
resolvePostObjectiveApprovalState(...)
```

3. Predefined objectives are seeded during launch and employee achievement is not enabled:

```text
NOT_STARTED
-> MANAGER_REVIEW_OPEN
```

Source:

```text
Server/src/services/assignment.service.ts
openSeededQuarterAssignmentsForManagerReview(...)
```

4. Manager/admin review list or detail normalizes eligible old/current records:

```text
OBJECTIVE_APPROVED
-> EMPLOYEE_ACHIEVEMENT_OPEN or MANAGER_REVIEW_OPEN
```

and:

```text
EMPLOYEE_ACHIEVEMENT_OPEN
-> MANAGER_REVIEW_OPEN
```

when achievement submission is already locked/submitted or when achievement stage can be bypassed by template config.

Source:

```text
Server/src/services/quarterReview.service.ts
advanceQuarterAssignmentsToManagerReviewIfEligible(...)
```

## Frontend Behavior

Frontend does not change workflow state.

Manager review editing is allowed only when:

```text
quarterState === MANAGER_REVIEW_OPEN
```

Source:

```text
Client/src/lib/components/pms/reviews/QuarterReviewWorkspace.svelte
canEditReview(...)
```

Employee achievement editing is allowed only when:

```text
quarterState === EMPLOYEE_ACHIEVEMENT_OPEN
```

Source:

```text
Server/src/services/employeeAchievementSubmission.service.ts
assertEmployeeEditAccess(...)
```

So once a term reaches `MANAGER_REVIEW_OPEN`, employee achievement can no longer be created or edited.

## Current Issue

Current launch behavior skips `OBJECTIVE_SETTING_OPEN` when predefined objectives exist.

Current flow:

```text
Launch cycle
-> create quarter_assignments as NOT_STARTED
-> seed predefined objectives as OBJECTIVE_APPROVED
-> move directly to EMPLOYEE_ACHIEVEMENT_OPEN or MANAGER_REVIEW_OPEN
```

Problem:

```text
Predefined objectives exist
-> system auto-approves them
-> quarterState jumps forward
-> employee/manager cannot add objective-setting-stage objectives
```

This is acceptable only if predefined objectives are the complete final objective plan.

It is not ideal if predefined objectives are meant to be baseline/reference objectives and employee/manager-created objectives are also allowed for the same term.

## Recommended Target Flow

If the product should support predefined objectives plus employee/manager-created objectives, launch should not skip objective setting.

Recommended flow:

```text
Launch cycle
-> create quarter_assignments
-> seed predefined objectives as OBJECTIVE_APPROVED
-> set quarterState = OBJECTIVE_SETTING_OPEN
```

Objective Setting screen should then:

```text
show predefined objectives as approved/template reference
allow employee-created objectives
allow manager-created objectives
keep employee-created submit -> manager approve/return flow
keep manager-created auto-approve flow
```

Then manager/admin explicitly closes objective setting:

```text
OBJECTIVE_SETTING_OPEN
-> OBJECTIVE_APPROVED
-> EMPLOYEE_ACHIEVEMENT_OPEN
```

or, if employee achievement is not enabled:

```text
OBJECTIVE_SETTING_OPEN
-> OBJECTIVE_APPROVED
-> MANAGER_REVIEW_OPEN
```

## Required Confirmation And Audit

The move out of objective setting should be explicit.

Recommended action:

```text
CLOSE_OBJECTIVE_SETTING
```

Recommended confirmation text:

```text
Predefined objectives are approved. No additional objectives will be accepted after moving forward.
```

Recommended tracked fields:

```text
objectiveSettingClosedBy
objectiveSettingClosedAt
objectiveSettingCloseReason
objectiveSettingCloseSource: MANAGER | ADMIN | SYSTEM
```

Recommended workflow event:

```text
ACTION: CLOSE_OBJECTIVE_SETTING
FROM: OBJECTIVE_SETTING_OPEN
TO: EMPLOYEE_ACHIEVEMENT_OPEN / MANAGER_REVIEW_OPEN
```

Recommended permissions for moving to the next state:

```text
Manager can close objective setting for their employee.
Admin can override/close.
Employee should not close objective setting alone.
```

So if no employee-created or manager-created objectives are needed, the next-state action should still be confirmed by:

```text
MANAGER or ADMIN
```

The system should not silently skip forward from objective setting without a visible action/audit trail.

## Implementation Caution

Changing launch behavior is a real workflow change.

It affects:

```text
assignment launch
predefined objective seeding
objective workspace state gating
employee achievement availability
manager review availability
workflow events/audit
old data compatibility
```

Existing records that already jumped to `EMPLOYEE_ACHIEVEMENT_OPEN` or `MANAGER_REVIEW_OPEN` should not be automatically moved backward unless a deliberate migration/rollback plan is created.
