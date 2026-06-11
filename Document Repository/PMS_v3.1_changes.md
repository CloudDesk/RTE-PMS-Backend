# PMS v3.1 Change Addendum

## 1. Purpose

This document defines the PMS v3.1 client correction changes based on the latest demo feedback.

This addendum is a planned change layer on top of the current PMS implementation baseline.

Current implementation baseline documents:

* `CURRENT_PMS_IMPLEMENTATION_TRUTH.md`
* `CURRENT_PMS_IMPLEMENTATION_SUMMARY.md`
* `CURRENT_PMS_GAP_AND_RISK_ACTION_LIST.md`

These three baseline documents describe current implementation only. They must not be modified with PMS v3.1 planned behavior.

Current code remains the source of truth for existing behavior. This document defines what needs to change next.

## 2. Change Type

This is not a small bug fix.

This is a product scope correction because it changes:

* assessment term structure
* template configuration
* employee achievement submission flow
* manager review flow
* assignment window configuration
* objective creation control
* manager bulk objective assignment
* SLA/email expectations
* UI usability expectations

The implementation should be handled as **PMS v3.1**.

## 3. Important Terminology Correction

Do not use the term **Self Review** for PMS v3.1.

Correct term:

```text
Employee Achievement Submission
```

Meaning:

Employee is not doing a full self-review, self-rating workflow, employee appraisal, employee sign-off, or acceptance workflow.

Employee only fills the configured achievement/input sections from the template during a configured window before manager review.

Employee achievement submission may include:

* topic
* description
* achievement notes
* proof/details
* attachments
* configured template fields

Employee rating fields may exist only if configured in the template, but they are not final appraisal ratings and not employee self-review scoring.

Manager review remains the official review.

## 4. Current Baseline Summary

Current PMS implementation supports:

* annual cycle with Q1-Q4 quarter assignments
* template builder with sections, fields, permissions, objective config, and scoring config
* employee/manager objective flow
* manager quarterly review
* annual decision
* visibility
* communication dispatch
* SLA rules/manual trigger
* audit/history
* dashboard and bulk operations

Current PMS implementation does not currently support:

* Employee Achievement Submission workflow
* assessment term types other than quarter-based Q1-Q4 structure
* employee achievement window before manager review
* separate employee achievement JSON and manager review JSON
* real PMS file upload lifecycle
* proven scheduled SLA mail automation
* active letter-template-based communication dispatch

## 5. PMS v3.1 Core Changes

PMS v3.1 introduces these confirmed changes:

1. Assessment term must be configurable.
2. Employee Achievement Submission must be configurable.
3. Employee achievement window must be configurable before manager review.
4. Manager Review Only flow must still be supported.
5. Employee achievement data and manager review data must be stored separately.
6. Manager cannot edit employee achievement submission data.
7. Manager rating mode must be configurable as overall-only or section-wise.
8. Final appraisal decision remains yearly only.
9. Employee objective creation must be configurable.
10. Manager must be able to assign the same objective to selected team employees.
11. SLA email notifications must be supported.
12. UI must be improved for usability and clarity.

## 6. Assessment Term Configuration

### 6.1 Current Behavior

Current implementation is based on annual cycle with Q1, Q2, Q3, and Q4 quarter assignments.

### 6.2 Required Behavior

PMS v3.1 must support different assessment term types:

* Quarterly
* Half-Yearly
* Yearly

### 6.3 Assessment Term Types

Supported term types:

```text
QUARTERLY
HALF_YEARLY
YEARLY
```

Supported term codes:

```text
Q1, Q2, Q3, Q4
H1, H2
Y1
```

### 6.4 Example Setup

Quarterly setup:

```text
Annual Cycle: PMS 2026
Assessment Terms: Q1, Q2, Q3, Q4
Final Appraisal Decision: Yearly
```

Half-Yearly setup:

```text
Annual Cycle: PMS 2026
Assessment Terms: H1, H2
Final Appraisal Decision: Yearly
```

Yearly setup:

```text
Annual Cycle: PMS 2026
Assessment Terms: Y1
Final Appraisal Decision: Yearly
```

### 6.5 Final Appraisal Rule

Even if assessment is quarterly, half-yearly, or yearly, final grade/merit/appraisal decision must happen yearly only.

Assessment terms collect performance and review data.

Annual decision uses completed assessment term reviews for final appraisal decision.

## 7. Review Flow Configuration

PMS v3.1 supports two main review flows.

## 7.1 Flow 1: Manager Review Only

This flow is used when employee achievement submission is not required.

Example use cases:

* trainees
* manager-only assessments
* cases where employee should not fill an achievement form

Flow:

```text
Assessment term opens
Manager review window opens
Manager fills review form
Manager submits review
Assessment term review is completed
HR/Management uses review data during yearly appraisal decision
```

Employee does not fill achievement form.

Manager can fill configured manager review fields such as:

* rating
* score
* comments
* observations
* recommendation
* attachments

## 7.2 Flow 2: Employee Achievement Submission + Manager Review

This flow is used when employee must submit achievement details before manager review.

Flow:

```text
Assessment term opens
Employee achievement window opens
Employee fills configured achievement form sections
Employee submits achievement form
Employee achievement data is locked
Manager review window opens
Manager views employee achievement submission
Manager fills separate manager review data
Manager submits review
Assessment term review is completed
HR/Management uses review data during yearly appraisal decision
```

Important rules:

* Employee achievement submission is not self-review.
* Employee achievement submission is not employee sign-off.
* Employee achievement submission is not final appraisal rating.
* Manager cannot edit employee achievement data.
* Manager review data must be stored separately.
* Manager review remains the official review.

## 8. Employee Achievement Submission

Employee Achievement Submission is a configured form submission by the employee.

It is used to collect employee-provided achievements, proof, and supporting details before manager review.

Supported employee achievement fields depend on template configuration.

Examples:

* achievement topic
* description
* achievement details
* project/work proof
* supporting notes
* attachments
* configured input fields
* rating field only if configured by template

Employee achievement submission may have draft save if allowed, but final submit locks the employee input.

## 9. Employee Achievement Window

Employee achievement submission must have a separate window before manager review.

Example flow:

```text
Objective approved / assessment term active
Employee achievement window open
Employee submits achievement form
Manager review window open
Manager submits review
Assessment term completed
```

Window support applies to all assessment term types:

```text
Q1, Q2, Q3, Q4
H1, H2
Y1
```

## 10. Employee Achievement Window Missed Case

If employee does not submit achievement form before the window closes, behavior must be configurable.

Supported configuration:

```text
achievementSubmissionRequired = true | false
allowManagerReviewWithoutAchievement = true | false
```

Default recommended behavior:

```text
If employee achievement is not submitted before window close,
manager review may still proceed if configured,
but system must clearly show:
Employee Achievement Not Submitted
```

SLA can be configured for:

* employee achievement pending
* employee achievement overdue
* escalation after missed achievement window

## 11. Employee Achievement Reopen Rule

Once employee submits achievement form, it is locked.

Confirmed rule:

```text
No one can reopen employee achievement submission after final submit.
```

This means:

* Manager cannot return it.
* Manager cannot edit it.
* Admin cannot reopen it.
* HR cannot reopen it.

Manager must review based on submitted values and proofs.

If wrong data is submitted, correction must not overwrite original submitted data unless a separately approved correction-layer requirement is added later.

## 12. Manager Review Form

Manager review form must support:

* viewing employee achievement submission
* viewing achievement attachments/proofs
* entering manager rating
* entering manager comments
* adding manager attachments
* overall-only scoring
* section-wise scoring
* final manager review submission

Manager review submission completes the assessment term review.

There is no separate “send to top level” action after manager review submit.

After manager review submission, HR/Management can use the data for annual decision.

## 13. Manager Scoring Mode

Manager scoring behavior must be configurable.

Supported manager scoring modes:

```text
OVERALL_ONLY
SECTION_WISE
```

## 13.1 Overall-Only Manager Rating

Manager reviews employee achievement submission and gives only final/overall rating or score.

Manager may enter:

* overall rating
* overall score
* overall comments
* attachments, if enabled

System stores manager overall review separately from employee achievement submission.

## 13.2 Section-Wise Manager Rating

Manager reviews employee achievement submission and gives rating/comments per configured section.

Manager may enter:

* section-wise rating
* section-wise comments
* section-wise score
* attachments, if enabled

System calculates final manager score based on configured scoring logic.

## 14. Data Separation Rule

Employee achievement data and manager review data must never overwrite each other.

Required storage concept:

```text
employeeAchievementSubmissionData
managerReviewData
finalReviewScore
```

Employee achievement submission data includes:

* configured achievement section responses
* topic
* description
* proof/details
* attachments
* configured rating value only if template allows it
* submittedBy
* submittedAt
* status
* locked snapshot/version

Manager review data includes:

* manager ratings
* manager comments
* manager attachments
* section-wise review responses
* overall rating/score
* final calculated score
* submittedBy
* submittedAt
* status

Manager can view employee achievement data but cannot edit employee achievement data.

If manager gives a different rating/comment, it must be stored only inside manager review data.

## 15. Template-Level Configuration

Template builder must control the review/achievement behavior.

Required template-level configuration:

```text
reviewFlowMode = MANAGER_ONLY | ACHIEVEMENT_THEN_MANAGER
managerScoringMode = OVERALL_ONLY | SECTION_WISE
```

Required achievement configuration:

```text
employeeAchievementEnabled = true | false
achievementSubmissionRequired = true | false
allowManagerReviewWithoutAchievement = true | false
```

Required section/field-level configuration:

```text
employeeCanView
employeeCanFillAchievement
employeeCanAddAchievementTopic
employeeCanAddAchievementDescription
employeeCanAttachAchievementProof
employeeCanUseConfiguredRatingField

managerCanViewEmployeeAchievement
managerCanFillReview
managerCanRate
managerCanComment
managerCanAttach
managerCanEditEmployeeAchievement = false
```

Fixed rule:

```text
managerCanEditEmployeeAchievement must always be false
```

## 16. Employee Achievement Form

Employee achievement form must support configured template fields.

Common fields:

* topic
* description
* achievement details
* attachments/proof
* configured rating field only if template allows it

The form should not be called:

* Self Review
* Self Rating
* Self Appraisal
* Employee Acceptance
* Employee Sign-off

Correct UI labels:

* Employee Achievement Submission
* Submit Achievement
* Achievement Form
* Achievement Window
* Achievement Submitted
* Achievement Not Submitted

## 17. HR / Management Annual Decision

After manager submits the review, HR/Management can view completed assessment data.

Final grade/merit/appraisal decision is taken yearly only.

HR/Management decision flow remains annual.

Assessment review completion does not mean final appraisal is completed.

Required yearly decision flow:

```text
Assessment terms completed
Annual summary prepared
HR/Management reviews yearly data
Grade/merit/nil decision captured
Visibility controlled
Communication dispatched
```

## 18. Objective Creation Configuration

Employee objective creation must be configurable.

Required configuration:

```text
objectiveCreator = EMPLOYEE | MANAGER | BOTH
```

Behavior:

* If `EMPLOYEE`, employee can create objectives.
* If `MANAGER`, only manager can create objectives.
* If `BOTH`, both employee and manager can create objectives.
* Manager-created objectives are auto-approved.
* Employee-created objectives require manager approval if configured.

This configuration can be applied during template/cycle/assignment configuration based on final implementation decision.

## 19. Manager Bulk Objective Assignment

Manager must be able to assign the same objective to selected employees from their team.

Flow:

```text
Manager opens team objective assignment
Manager selects multiple employees
Manager enters objective details
Manager submits
System creates the same objective for selected employees
Objectives are auto-approved as manager-created
```

Important rule:

Manager cannot give different weightage per employee in this bulk flow.

Same objective configuration is copied to selected employees.

## 20. SLA Email Notifications

PMS v3.1 requires SLA email notifications.

Notification areas:

* employee objective submission pending
* manager objective approval pending
* employee achievement submission pending
* employee achievement submission overdue
* manager review pending
* overdue assessment actions
* escalation reminders if configured

Current implementation has SLA rules and manual trigger, but scheduled background automation must be verified or fixed before promising automatic SLA mail behavior.

Required decision for implementation:

* Make SLA scheduler working as part of PMS v3.1, or
* Clearly mark SLA mail as manual-trigger/current limited behavior until scheduler is completed.

## 21. UI Improvement Scope

UI must be improved for active PMS screens only.

Priority screens:

* Admin dashboard
* Template builder
* Cycle setup
* Assignment workspace
* Manager objective workspace
* Manager review workspace
* Employee objective workspace
* Employee achievement submission workspace
* Annual decision workspace

UI improvement goals:

* clearer sections
* better status chips
* better action buttons
* better empty states
* better pending-action cards
* clearer achievement vs manager review comparison
* better proof/attachment display
* less plain layout
* fewer confusing hidden/duplicate paths

Do not improve stale or inactive pages unless they are part of the active flow.

## 22. Current Implementation Risks to Protect

Before implementation, protect these current baseline risks:

1. Authorization must be backend enforced.
2. Visibility masking must protect confidential fields.
3. Mock/fallback APIs must not hide backend errors during QA.
4. Workflow/status mapping must be clear.
5. Communication source of truth must be clear.
6. PMS attachments are metadata-only unless file lifecycle is added.
7. SLA scheduler is not proven.
8. Hidden/duplicate admin pages must not confuse implementation.

## 23. Suggested New/Updated Concepts

Suggested concepts for PMS v3.1:

```text
AssessmentTerm
AssessmentTermType
AssessmentTermCode
AssessmentAssignment
ReviewFlowMode
EmployeeAchievementSubmission
EmployeeAchievementSubmissionData
ManagerReview
ManagerScoringMode
ObjectiveCreationMode
AchievementWindow
ManagerReviewWindow
```

Suggested enum values:

```text
AssessmentTermType:
QUARTERLY
HALF_YEARLY
YEARLY

AssessmentTermCode:
Q1
Q2
Q3
Q4
H1
H2
Y1

ReviewFlowMode:
MANAGER_ONLY
ACHIEVEMENT_THEN_MANAGER

ManagerScoringMode:
OVERALL_ONLY
SECTION_WISE

ObjectiveCreationMode:
EMPLOYEE
MANAGER
BOTH

AchievementSubmissionStatus:
NOT_OPEN
OPEN
DRAFT
SUBMITTED
NOT_SUBMITTED
LOCKED
```

Do not use:

```text
SelfReview
SELF_REVIEW
SELF_REVIEW_THEN_MANAGER
employeeSelfReviewData
```

## 24. Migration / Refactor Guidance

Current implementation uses quarter-based naming such as quarter cycle, quarter assignment, and quarter review.

For PMS v3.1, the system must support quarterly, half-yearly, and yearly assessment terms.

Recommended approach:

* Do not blindly patch H1/Y1 into quarter-only naming.
* Create a clean assessment-term abstraction if code impact is manageable.
* If immediate refactor is risky, create a compatibility layer but keep new business terminology clear in UI and API contracts.

The final model should not confuse half-yearly/yearly reviews as “quarters”.

## 25. Out of Scope for This Addendum

This addendum does not include:

* employee self-review workflow
* employee self-appraisal workflow
* employee sign-off/acceptance workflow
* employee disagreement workflow
* multi-manager parallel approval
* manager editing employee achievement submission values
* manager returning employee achievement submission
* admin reopening employee achievement submission
* top-level approval after manager review submit
* final appraisal decision for every quarter/half-year
* reactivation of old letter-template builder unless separately approved
* full PMS file upload lifecycle unless attachments are confirmed in scope

## 26. Confirmed Decisions

Confirmed for PMS v3.1:

1. Naming must be **Employee Achievement Submission**, not self-review.
2. Employee can submit achievement topic, description, proof/details, attachments, and configured fields.
3. Employee rating field may exist only if template config allows, but it is not final appraisal rating.
4. Employee achievement window happens before manager review window.
5. If employee misses achievement submission window, behavior is configurable and SLA can be set.
6. Once employee submits achievement form, it is locked.
7. No one can reopen employee achievement submission after final submit.
8. Manager cannot edit employee achievement data.
9. Manager review data is stored separately.
10. Manager scoring can be overall-only or section-wise.
11. Assessment term logic applies to Q1/Q2/Q3/Q4, H1/H2, and Y1.
12. Final appraisal decision remains yearly only.
13. Current implementation truth/risk/summary docs remain current-code baseline and are not updated with v3.1 planned changes.

## 27. Remaining Open Decisions Before Implementation

Only these items still need business confirmation:

1. Should SLA email scheduler be completed in PMS v3.1 or kept as manual-trigger until later?
2. Should PMS attachments become real uploads in PMS v3.1, or remain metadata only?
3. Should old hidden admin pages be exposed, redirected, or left hidden?
4. Should old letter-template builder remain removed, or will communication templates come back later?
5. Should yearly assessment `Y1` directly feed annual decision without separate rollup, or should it still pass through a common annual rollup service?

## 28. Final Direction

PMS v3.1 should be implemented as a controlled change over the current PMS baseline.

The main product direction is:

```text
Assessment-term configurable PMS
+
Template-controlled Employee Achievement Submission
+
Manager Review as official review
+
Separate employee achievement data and manager review data
+
Yearly final appraisal decision
```

Do not start implementation until:

* current baseline is frozen
* blocking access/visibility/mock risks are handled or explicitly accepted
* remaining open decisions are answered or marked out of scope
* implementation prompts are split module-wise
