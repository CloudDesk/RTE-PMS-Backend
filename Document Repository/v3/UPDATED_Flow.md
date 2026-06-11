# PMS v3.1 Updated Flow

## 1. Core Flow Summary

PMS v3.1 keeps the current PMS baseline and adds configurable assessment terms and Employee Achievement Submission before Manager Review.

Employee Achievement Submission is not self-review.

Manager Review remains the official review.

Final grade/merit/appraisal decision remains yearly only.

## 2. Admin / HR Flow

```text
Admin creates template
↓
Admin configures template sections, fields, scoring, permissions
↓
Admin configures objective creation mode
↓
Admin configures review flow mode
↓
Admin configures employee achievement sections if needed
↓
Admin configures manager review sections
↓
Admin creates annual PMS cycle
↓
Admin selects assessment term type
↓
System creates assessment terms
↓
Admin configures windows and SLA
↓
Admin assigns employees and managers
↓
Cycle is launched
```

## 3. Template Configuration Flow

Template must support:

```text
Objective sections
Employee Achievement Submission sections
Manager Review sections
Annual Decision sections
Visibility sections
Communication-related configuration where currently supported
```

Template-level configuration:

```text
assessmentTermType = QUARTERLY | HALF_YEARLY | YEARLY
reviewFlowMode = MANAGER_ONLY | ACHIEVEMENT_THEN_MANAGER
managerScoringMode = OVERALL_ONLY | SECTION_WISE
objectiveCreator = EMPLOYEE | MANAGER | BOTH
```

Employee Achievement Submission configuration:

```text
employeeAchievementEnabled = true | false
achievementSubmissionRequired = true | false
allowManagerReviewWithoutAchievement = true | false
```

Field/section configuration:

```text
employeeCanView
employeeCanFillAchievement
employeeCanAttachAchievementProof
employeeCanUseConfiguredRatingField

managerCanViewEmployeeAchievement
managerCanFillReview
managerCanRate
managerCanComment
managerCanAttach
managerCanEditEmployeeAchievement = false
```

## 4. Assessment Term Setup Flow

Quarterly:

```text
Annual Cycle
↓
Q1
Q2
Q3
Q4
↓
Annual Decision
```

Half-Yearly:

```text
Annual Cycle
↓
H1
H2
↓
Annual Decision
```

Yearly:

```text
Annual Cycle
↓
Y1
↓
Annual Decision
```

Final appraisal decision always remains yearly.

## 5. Objective Flow

Objective creation depends on configuration.

If `objectiveCreator = EMPLOYEE`:

```text
Employee creates objective
↓
Employee submits objective
↓
Manager approves or returns
↓
Objective approved
```

If `objectiveCreator = MANAGER`:

```text
Manager creates objective
↓
System auto-approves objective
```

If `objectiveCreator = BOTH`:

```text
Employee can create objective
Manager can create objective
Employee-created objective requires approval if configured
Manager-created objective is auto-approved
```

## 6. Manager Bulk Objective Assignment Flow

```text
Manager opens team objective assignment
↓
Manager selects multiple team employees
↓
Manager enters same objective details
↓
Manager submits
↓
System creates the same objective for selected employees
↓
System marks objectives as manager-created
↓
System auto-approves those objectives
```

Rule:

```text
Manager cannot set different weightage per employee in this bulk flow.
```

## 7. Flow 1: Manager Review Only

Use this when employee achievement submission is not required.

```text
Assessment term opens
↓
Objective flow completed / objectives ready
↓
Manager review window opens
↓
Manager fills review form
↓
Manager submits review
↓
Assessment term review completed
↓
HR/Management uses data during yearly annual decision
```

Employee does not submit achievement form in this flow.

## 8. Flow 2: Employee Achievement Submission + Manager Review

Use this when employee achievement submission is required or enabled.

```text
Assessment term opens
↓
Objective flow completed / objectives ready
↓
Employee achievement window opens
↓
Employee fills achievement form
↓
Employee submits achievement form
↓
Employee achievement data is locked
↓
Manager review window opens
↓
Manager views employee achievement submission
↓
Manager reviews proof/details
↓
Manager fills separate manager review form
↓
Manager submits review
↓
Assessment term review completed
↓
HR/Management uses data during yearly annual decision
```

Important:

```text
Employee Achievement Submission is not Self Review.
Manager cannot edit employee achievement data.
No one can reopen employee achievement submission after final submit.
```

## 9. Employee Achievement Missed Window Flow

Behavior is configurable.

```text
Employee achievement window opens
↓
Employee does not submit before window closes
↓
System marks Employee Achievement Not Submitted
↓
SLA notification/escalation may trigger
↓
Manager review behavior follows configuration
```

If configured to allow manager review without achievement:

```text
Manager review window opens
↓
Manager sees Employee Achievement Not Submitted
↓
Manager proceeds with manager review
```

If configured to block manager review without achievement:

```text
Manager review blocked
↓
Admin/HR handles based on configured exception process
```

## 10. Manager Review Scoring Flow

Overall-only:

```text
Manager views employee achievement submission
↓
Manager gives overall rating/score/comments
↓
System stores manager review data
```

Section-wise:

```text
Manager views employee achievement submission
↓
Manager gives section-wise rating/comments/score
↓
System calculates final manager review score
↓
System stores manager review data
```

## 11. Data Storage Flow

Employee achievement submission data:

```text
employeeAchievementSubmissionData
```

Manager review data:

```text
managerReviewData
```

Final review score:

```text
finalReviewScore
```

Rule:

```text
Employee achievement data and manager review data must never overwrite each other.
```

## 12. Annual Decision Flow

```text
All required assessment term reviews completed
↓
Annual summary prepared
↓
HR/Management reviews yearly data
↓
Grade/merit/nil decision captured
↓
Decision submitted/frozen
↓
Visibility enabled
↓
Communication prepared/sent
↓
Annual cycle closed
```

Annual decision is yearly only.

No quarterly or half-yearly final appraisal decision.

## 13. SLA Flow

SLA can apply to:

```text
Employee objective submission
Manager objective approval
Employee achievement submission
Manager review submission
Overdue assessment actions
Escalation reminders
```

Important current baseline risk:

```text
SLA rules/manual trigger exist,
but scheduled PMS SLA automation must be verified/fixed before promising automatic email behavior.
```

## 14. UI Flow Priority

Active screens to improve:

```text
Admin dashboard
Template builder
Cycle setup
Assignment workspace
Manager objective workspace
Manager review workspace
Employee objective workspace
Employee achievement submission workspace
Annual decision workspace
```

UI must clearly separate:

```text
Employee Achievement Submission
Manager Review
Annual Decision
```

Do not label Employee Achievement Submission as Self Review.

## 15. Out of Scope

Do not implement:

```text
Self Review
Employee Self-Appraisal
Employee Acceptance
Employee Sign-off
Employee Disagreement
Manager editing employee achievement
Manager returning employee achievement
Admin reopening employee achievement after submit
Top-level approval after manager review submit
Quarterly final appraisal decision
Half-yearly final appraisal decision
```

## 16. Final PMS v3.1 Flow

```text
Admin configures template
↓
Admin configures assessment terms and windows
↓
Admin assigns employees and managers
↓
Objective creation happens as configured
↓
Employee Achievement Submission happens if configured
↓
Manager Review happens
↓
Assessment term review completes
↓
Annual decision happens yearly
↓
Visibility and communication happen
↓
Cycle closes
```
