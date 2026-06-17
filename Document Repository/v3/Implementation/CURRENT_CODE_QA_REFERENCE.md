# Current PMS Code Reference

Last updated: 16 Jun 2026, 8:30 PM IST

This document records the current PMS v3 implementation status only.

## Current Term Model

The current code still uses some historical names:

```text
quarter_assignments
quarterCode
level: "QUARTER"
```

In the current implementation, these names mean assessment-term-level behavior.

Supported assessment term types:

```text
Quarterly   -> Q1, Q2, Q3, Q4
Half-Yearly -> H1, H2
Yearly      -> Y1
```

Important current rule:

```text
level: "QUARTER" = assessment-term-level section
```

It is not limited to only Q1-Q4 in behavior.

## Cycle Launch And Assignments

Cycle launch creates assignment records based on the cycle assessment term type.

For each selected employee:

```text
1 annual_assignments record
N quarter_assignments records
```

Assignment count:

```text
Quarterly   -> 4 quarter_assignments
Half-Yearly -> 2 quarter_assignments
Yearly      -> 1 quarter_assignment
```

`annual_assignments` stores the employee/cycle/template mapping and links to all term assignments.

`quarter_assignments` stores the employee, manager, cycle, template version, term code, and workflow state. It does not store objective details inside the assignment row.

Objective relation:

```text
quarter_assignments._id
        |
        v
objectives.quarterAssignmentId
```

## Predefined Objectives

Predefined objectives are seeded from the active template version into the `objectives` table during assignment/launch.

They are scoring objectives.

Stored identity:

```text
source: PREDEFINED
isPredefined: true
status: OBJECTIVE_APPROVED
```

Predefined objectives may use scoring/template fields:

```text
targetMetric / kpi
targetValue
targetDate / dueDate
weightage
successCriteria
objectiveValues
templateObjectiveKey
```

Predefined/template objectives are still used for official manager review scoring.

## Employee-Created Objectives

Employee-created objectives are context/evidence only.

They are not scoring objectives.

Allowed create/update fields:

```text
title
description
priority
expectedOutcome
attachments optional
comments optional
```

Allowed priority values:

```text
low
medium
high
```

Workflow:

```text
create/save draft
submit
manager approve or manager return for revision
```

Status flow:

```text
OBJECTIVE_DRAFT
OBJECTIVE_SUBMITTED
OBJECTIVE_APPROVED or OBJECTIVE_REVISION_REQUIRED
```

## Manager-Created Objectives

Manager-created objectives are context/evidence only.

They are not scoring objectives.

Allowed create/update fields:

```text
title
description
priority
expectedOutcome
attachments optional
comments optional
```

Workflow:

```text
create
auto-approved immediately
```

Stored status:

```text
OBJECTIVE_APPROVED
```

Manager-created objectives cannot be submitted by the employee because they are already manager-owned and approved.

## Context Objective Scoring Restrictions

Employee-created and manager-created objectives must not collect, send, store, validate, calculate, or display scoring inputs.

Blocked fields for context objectives:

```text
weightage
rating
score
weightedScore
targetMetric
kpi
targetValue
targetDate
dueDate
successCriteria
scoringParticipation
```

Backend rejects scoring-style payloads for:

```text
EMPLOYEE_CREATED
MANAGER_CREATED
```

Frontend create/edit/bulk manager objective flows do not send scoring fields for context objectives.

Scoring fields remain valid only for:

```text
PREDEFINED objectives
template-configured scoring sections
manager review scoring fields
```

## Objective Comments

Objective comments are stored as comment history records, not as one plain text field on the objective.

Comment storage:

```text
objective_comments
```

Each comment records:

```text
commentText
actorUserId
actorRole
createdAt
commentType
```

Common comment types:

```text
OBJECTIVE_CREATION
OBJECTIVE_SUBMISSION
RETURN_FOR_REVISION
REVISION_RESPONSE
APPROVAL_COMMENT
MANAGER_NOTE
HR_ADMIN_OVERRIDE_NOTE
GENERAL
```

Rules:

```text
Objective creation comment is optional.
Manager return-for-revision comment/reason is mandatory.
```

## Achievement Submission

Employee Achievement Submission is enabled by template section/configuration.

Section key:

```text
employee_achievement_submission
```

When enabled, approved predefined objectives can move the term workflow to:

```text
EMPLOYEE_ACHIEVEMENT_OPEN
```

After achievement submission/lock, the workflow moves toward manager review.

If achievement submission is not enabled and direct manager review is allowed, the workflow can move to:

```text
MANAGER_REVIEW_OPEN
```

## Term Scope Compatibility

Current compatibility rule:

```text
If a template section is scoped to all Q1-Q4 terms,
then it also applies to H1, H2, and Y1.
```

This keeps existing templates working for Quarterly, Half-Yearly, and Yearly cycles without renaming existing stored data.

This compatibility is used in:

```text
predefined objective seeding / objective config resolution
employee achievement submission section lookup
objective approval next-state decision
assignment launch next-state decision
SLA achievement-submission checks
manager-review gating checks
```

Important fixed behavior:

```text
Quarterly   -> achievement form works
Half-Yearly -> achievement form works
Yearly      -> achievement form works
```

Current behavior treats all-term Q1-Q4 scope as applicable to H1/H2/Y1 also.

## Manager Review And Scoring

Official scoring remains template-driven.

Objective rating rows are only for:

```text
PREDEFINED objectives
```

Employee-created and manager-created objectives are shown only as context/evidence during review.

They are not directly rated and are not included in objective weightage calculations.

## High Importance: Do Not Rename `level: "QUARTER"` Casually

If we rename:

```text
level: "QUARTER"
```

to something like:

```text
level: "TERM"
level: "ASSESSMENT_TERM"
```

it becomes a bigger FE + BE change. It touches template creation, template validation, cycle launch, assignment seeding, objective display, achievement submission, manager review, scoring, and old data compatibility.

Places to change:

Constants/types:

```text
Server/src/constants/pms.enums.ts
Client/src/lib/types/pms.ts
Client/src/lib/types/pmsTemplate.ts
```

Template builder / template API:

```text
Client/src/lib/components/pms/templates/*
Client/src/lib/services/api/pmsTemplates.ts
Server/src/services/pms-template.service.ts
Server/src/models/pms-template-version.model.ts
```

Cycle launch / assignment:

```text
Server/src/services/assignment.service.ts
Server/src/services/cycle.service.ts
Any template section filtering during launch/predefined objective seeding
```

Objectives flow:

```text
Server/src/services/objective.service.ts
Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte
Client/src/lib/services/api/pmsObjectives.ts
```

Achievement submission:

```text
Server/src/services/employeeAchievementSubmission.service.ts
Server/src/services/sla.service.ts
Client/src/lib/components/pms/achievements/EmployeeAchievementWorkspace.svelte
```

Manager review/scoring:

```text
Server/src/services/quarterReview.service.ts
Server/src/services/pms-scoring.service.ts
Client/src/lib/components/pms/reviews/QuarterReviewWorkspace.svelte
```

Existing data compatibility:

```text
Existing DB template sections already have level: "QUARTER".
Need either migration or compatibility helper.
```

Example compatibility helper:

```ts
function isTermLevel(level: string) {
  return level === "QUARTER" || level === "TERM" || level === "ASSESSMENT_TERM";
}
```

Recommendation:

```text
Do not rename now unless it is planned as a cleanup/migration task.
```

Safer current approach:

```text
Keep stored level: "QUARTER" for backward compatibility.
Add helper naming in BE/FE: isAssessmentTermLevel(section.level).
Internally treat QUARTER as term-level.
Update labels/docs to say "Assessment Term" instead of "Quarter" where possible.
```

This gives correct behavior for Quarterly, Half-Yearly, and Yearly without breaking existing templates.

## Current Files Involved

Backend:

```text
Server/src/constants/pms.enums.ts
Server/src/models/pms-objective.model.ts
Server/src/models/pms-manager-objective-library.model.ts
Server/src/models/pms-template-version.model.ts
Server/src/services/assignment.service.ts
Server/src/services/cycle.service.ts
Server/src/services/employeeAchievementSubmission.service.ts
Server/src/services/objective.service.ts
Server/src/services/pms-scoring.service.ts
Server/src/services/pms-template.service.ts
Server/src/services/quarterReview.service.ts
Server/src/services/sla.service.ts
```

Frontend:

```text
Client/src/lib/components/pms/achievements/EmployeeAchievementWorkspace.svelte
Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte
Client/src/lib/components/pms/reviews/QuarterReviewWorkspace.svelte
Client/src/lib/components/pms/templates/*
Client/src/lib/services/api/pmsObjectives.ts
Client/src/lib/services/api/pmsTemplates.ts
Client/src/lib/types/pms.ts
Client/src/lib/types/pmsTemplate.ts
```

## Verification Status

Current verification notes:

```text
Server TypeScript build passed.
Related frontend filtered diagnostics were checked.
Only existing label accessibility warnings were seen in the related frontend check.
```


Important correction:

Manual Sync should be HR/Admin only, not Manager.

Final ownership:

Manager:
- Can create manager objectives during OBJECTIVE_SETTING_OPEN.
- Can approve/return employee-created objectives during OBJECTIVE_SETTING_OPEN.
- Can click Close Objective Setting for assigned employees.
- Can edit/submit manager review only in MANAGER_REVIEW_OPEN.

Employee:
- Can create/submit objectives during OBJECTIVE_SETTING_OPEN.
- Can revise returned objectives where allowed.
- Can submit achievement only in EMPLOYEE_ACHIEVEMENT_OPEN.

HR/Admin:
- Can trigger Manual Sync.
- Can override/close Objective Setting where allowed.
- Can monitor and manage assignments.
- Can manage exception/override actions with audit.

State movement ownership:

Launch:
- Backend sets quarterState = OBJECTIVE_SETTING_OPEN after predefined objectives are seeded as OBJECTIVE_APPROVED.

Close Objective Setting:
- Manager/Admin explicit action moves OBJECTIVE_SETTING_OPEN -> OBJECTIVE_APPROVED.
- Manual Sync must not perform this transition silently.

Manual Sync:
- HR/Admin action moves OBJECTIVE_APPROVED -> EMPLOYEE_ACHIEVEMENT_OPEN if achievement is enabled and eligible.
- HR/Admin action moves OBJECTIVE_APPROVED -> MANAGER_REVIEW_OPEN if achievement is disabled or manager-only flow is configured.
- HR/Admin action moves EMPLOYEE_ACHIEVEMENT_OPEN -> MANAGER_REVIEW_OPEN only if achievement is submitted/locked or valid bypass config exists.

Manager Review:
- Manager can act only after quarterState becomes MANAGER_REVIEW_OPEN.