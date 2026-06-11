# PMS v2.1 Change Addendum

## 1. Purpose

This document defines the PMS v2.1 client correction changes based on the latest demo feedback.

This addendum must be treated as a change layer on top of the current PMS implementation baseline.

Current implementation baseline documents:

* `CURRENT_PMS_IMPLEMENTATION_TRUTH.md`
* `CURRENT_PMS_IMPLEMENTATION_SUMMARY.md`
* `CURRENT_PMS_GAP_AND_RISK_ACTION_LIST.md`

This document must not assume that missing features already exist. Current code remains the source of truth for existing behavior.

## 2. Change Type

This is not a small bug fix.

This is a product scope correction because it changes:

* review flow
* template configuration
* assignment term structure
* employee participation
* manager scoring behavior
* objective creation control
* SLA/email expectation
* UI usability expectation

The implementation should be handled as PMS v2.1.

## 3. Current Baseline Summary

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

* employee self-review workflow
* assessment term types other than quarter-based Q1-Q4 structure
* manager review based on employee self-review data
* separate employee review JSON and manager review JSON
* real PMS file upload lifecycle
* proven scheduled SLA mail automation
* active letter-template-based communication dispatch

## 4. PMS v2.1 Core Changes

PMS v2.1 introduces these confirmed changes:

1. Assessment term must be configurable.
2. Review mode must be configurable from template/cycle setup.
3. Employee self-review must be supported as an optional configured flow.
4. Employee review data and manager review data must be stored separately.
5. Manager cannot edit employee self-review input.
6. Manager rating mode must be configurable as overall-only or section-wise.
7. Final appraisal decision remains yearly only.
8. Employee objective creation must be configurable.
9. Manager must be able to assign same objective to selected team employees.
10. SLA email notifications must be supported.
11. UI must be improved for usability and clarity.

## 5. Assessment Term Configuration

### 5.1 Current Behavior

Current implementation is based on annual cycle with Q1, Q2, Q3, and Q4 quarter assignments.

### 5.2 Required Behavior

PMS v2.1 must support different assessment term types:

* Quarterly
* Half-Yearly
* Yearly

### 5.3 Assessment Term Types

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

### 5.4 Example Setup

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

### 5.5 Final Appraisal Rule

Even if assessment is quarterly, half-yearly, or yearly, final grade/merit/appraisal decision must happen yearly only.

Assessment terms collect performance review data.

Annual decision uses completed term reviews for final appraisal decision.

## 6. Review Mode Configuration

PMS v2.1 supports two main review modes.

## 6.1 Mode 1: Manager Review Only

This mode is used when employee self-review is not required.

Example use cases:

* trainees
* manager-only assessments
* cases where employee should not fill review form

Flow:

```text
Manager opens assigned employee review
Manager fills review form
Manager submits review
Assessment term review is completed
HR/Management uses review data during yearly appraisal decision
```

Employee does not fill self-review.

Manager can fill:

* rating
* comments
* attachments

## 6.2 Mode 2: Employee Self Review + Manager Review

This mode is used when employee must fill self-review before manager review.

Flow:

```text
Employee opens self-review form
Employee fills rating/comments/attachments
Employee submits self-review
Manager opens employee review
Manager views employee self-review data
Manager fills separate manager review data
Manager submits review
Assessment term review is completed
HR/Management uses review data during yearly appraisal decision
```

Important rule:

Manager must not edit employee self-review data.

Employee data and manager data must be stored separately.

## 7. Manager Scoring Mode

For Mode 2, manager scoring behavior must be configurable.

Supported manager scoring modes:

```text
OVERALL_ONLY
SECTION_WISE
```

## 7.1 Overall-Only Manager Rating

Manager reviews employee self-review data and gives only final/overall rating or score.

Manager may enter:

* overall rating
* overall score
* overall comments
* attachments, if enabled

System stores manager overall review separately from employee self-review.

## 7.2 Section-Wise Manager Rating

Manager reviews employee self-review data and gives rating/comments per section.

Manager may enter:

* section-wise rating
* section-wise comments
* section-wise score
* attachments, if enabled

System calculates final manager score based on configured section scoring logic.

## 8. Data Separation Rule

Employee self-review data and manager review data must never overwrite each other.

Required storage concept:

```text
employeeSelfReviewData
managerReviewData
finalReviewScore
```

Employee data includes:

* ratings
* comments
* attachments
* section responses
* submittedBy
* submittedAt
* status

Manager data includes:

* ratings
* comments
* attachments
* section responses
* overall rating/score
* submittedBy
* submittedAt
* status

Manager can view employee data but cannot edit employee data.

If manager gives different rating/comments, it must be stored as manager review data.

## 9. Template-Level Configuration

Template builder must control review behavior.

Required template-level configuration:

```text
reviewMode = MANAGER_ONLY | SELF_REVIEW_THEN_MANAGER
managerScoringMode = OVERALL_ONLY | SECTION_WISE
```

Required section/field-level configuration:

```text
employeeCanView
employeeCanFill
employeeCanRate
employeeCanComment
employeeCanAttach

managerCanViewEmployeeInput
managerCanFill
managerCanRate
managerCanComment
managerCanAttach

managerCanEditEmployeeInput = false
```

Important fixed rule:

```text
managerCanEditEmployeeInput must always be false
```

Manager data must be captured separately.

## 10. Employee Self-Review Form

Employee self-review form must support:

* rating
* comments
* attachments

Depending on template configuration, employee may fill:

* overall self-review
* section-wise self-review
* configured fields only

Employee self-review submit should lock employee input from further edit unless reopened/returned by allowed role.

## 11. Manager Review Form

Manager review form must support:

* viewing employee self-review data
* entering manager rating
* entering manager comments
* adding manager attachments
* overall-only scoring
* section-wise scoring
* final manager review submission

Manager review submission completes the assessment term review.

There is no separate “send to top level” action after manager review submit.

## 12. HR / Management Annual Decision

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

## 13. Objective Creation Configuration

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

This configuration should be available during template/cycle/assignment configuration as per current product design decision.

## 14. Manager Bulk Objective Assignment

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

The same objective configuration is copied to selected employees.

## 15. SLA Email Notifications

PMS v2.1 requires SLA email notifications.

Notification areas:

* employee objective submission pending
* manager objective approval pending
* employee self-review pending
* manager review pending
* overdue assessment actions
* escalation reminders if configured

Current implementation has SLA rules and manual trigger, but scheduled background automation must be verified/fixed before promising automatic SLA mail behavior.

Required decision:

* Either make SLA scheduler working as part of v2.1
* Or clearly mark SLA mail as manual-trigger/current limited behavior until scheduler is completed

## 16. UI Improvement Scope

UI must be improved for active PMS screens only.

Priority screens:

* Admin dashboard
* Template builder
* Cycle setup
* Assignment workspace
* Manager objective workspace
* Manager review workspace
* Employee objective workspace
* Employee self-review workspace
* Annual decision workspace

UI improvement goals:

* clearer sections
* better status chips
* better action buttons
* better empty states
* better pending-action cards
* clearer employee/manager review comparison
* less plain layout
* fewer confusing hidden/duplicate paths

Do not improve stale or inactive pages unless they are part of the active flow.

## 17. Current Implementation Risks to Protect

Before implementation, protect these current baseline risks:

1. Authorization must be backend enforced.
2. Visibility masking must protect confidential fields.
3. Mock/fallback APIs must not hide backend errors during QA.
4. Workflow/status mapping must be clear.
5. Communication source of truth must be clear.
6. PMS attachments are metadata-only unless file lifecycle is added.
7. SLA scheduler is not proven.
8. Hidden/duplicate admin pages must not confuse implementation.

## 18. Suggested New/Updated Concepts

Suggested concepts for PMS v2.1:

```text
AssessmentTerm
AssessmentTermType
AssessmentTermCode
AssessmentAssignment
ReviewMode
SelfReview
ManagerReview
ManagerScoringMode
ObjectiveCreationMode
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

ReviewMode:
MANAGER_ONLY
SELF_REVIEW_THEN_MANAGER

ManagerScoringMode:
OVERALL_ONLY
SECTION_WISE

ObjectiveCreationMode:
EMPLOYEE
MANAGER
BOTH
```

## 19. Migration / Refactor Guidance

Current implementation uses quarter-based naming such as quarter cycle, quarter assignment, and quarter review.

For PMS v2.1, the system must support quarterly, half-yearly, and yearly assessment terms.

Recommended approach:

* Do not blindly patch H1/Y1 into quarter-only naming.
* Create a clean assessment-term abstraction if code impact is manageable.
* If immediate refactor is risky, create a compatibility layer but keep new business terminology clear in UI and API contracts.

The final model should not confuse half-yearly/yearly reviews as “quarters”.

## 20. Out of Scope for This Addendum

This addendum does not include:

* employee sign-off/acceptance workflow
* employee disagreement workflow
* multi-manager parallel approval
* manager editing employee self-review values
* top-level approval after manager review submit
* final appraisal decision for every quarter/half-year
* reactivation of old letter-template builder unless separately approved
* full PMS file upload lifecycle unless attachments are confirmed in scope

## 21. Open Decisions Before Implementation

These must be confirmed before coding:

1. Should self-review submission be returnable to employee for correction, or locked after submit?
2. Should employee self-score be used in final score calculation, or only stored for reference?
3. Should yearly assessment with `Y1` skip separate annual rollup and directly support annual decision?
4. Should SLA email scheduler be completed in v2.1 or kept manual-trigger for now?
5. Should PMS attachments become real uploads in v2.1, or remain metadata only?
6. Should old hidden admin pages be exposed, redirected, or left hidden?
7. Should old letter-template builder remain removed, or will communication templates come back later?

## 22. Final Direction

PMS v2.1 should be implemented as a controlled change over the current PMS baseline.

The main product direction is:

```text
Assessment-term configurable PMS
+
Template-controlled review mode
+
Optional employee self-review
+
Separate employee and manager review data
+
Yearly final appraisal decision
```

Do not start implementation until:

* current baseline is frozen
* blocking access/visibility/mock risks are handled or explicitly accepted
* open decisions are answered
* implementation prompts are split module-wise
