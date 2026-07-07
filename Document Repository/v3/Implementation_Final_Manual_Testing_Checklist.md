# PMS Flexible Objectives, Probation Review, and Mid-Cycle Windows: Final Manual Testing Checklist

Source design: `PMS_Design_Change_Request_Flexible_Objectives_Probation_Review.md`

Related task files:

- `Implementation_Task_1_Flexible_Objective_Master_Assignment.md`
- `Implementation_Task_2_Objective_Filling_Actuals_Scoring.md`
- `Implementation_Task_3_Configurable_Probation_Review_Flow.md`
- `Implementation_Task_4_Mid_Cycle_Assignment_Window_Timing.md`

## Purpose

Use this checklist at the end of implementation to confirm the new PMS enhancements work for HR/Admin, managers, employees, delegated users, and reporting users.

This checklist is written for manual validation. Automated unit/integration tests should still be completed separately.

## Global Test Rules

- Existing PMS cycle launch must still work.
- Existing template-owned objective behavior must still work.
- Existing employee-created and manager-created objective behavior must still work by default.
- Existing probation review flow must still work as Manager 1 fills and Manager 2 approves.
- Existing finalized records must not change, recalculate, reopen, or become editable.
- New features must be configurable add-ons, not forced default behavior.
- Backend must reject unauthorized actions even if UI controls are hidden or bypassed.
- UI must be understandable for non-technical HR/Admin users.
- Each large UI area must be split into child components and stay within the agreed component-size guideline of 1000-1500+ lines.

## Test Data Preparation

| Item | Status |
|---|---|
| Create HR/Admin user | [ ] |
| Create Management user | [ ] |
| Create Department Head user with configured department scope | [ ] |
| Create Manager 1 user | [ ] |
| Create Manager 2 user | [ ] |
| Create Final Approver user | [ ] |
| Create delegated/shared user | [ ] |
| Create employee in normal annual PMS scope | [ ] |
| Create employee joining mid-cycle | [ ] |
| Create probation / trainee employee | [ ] |
| Create quarterly PMS cycle | [ ] |
| Create half-yearly PMS cycle | [ ] |
| Create yearly PMS cycle | [ ] |
| Create template with objective section | [ ] |
| Create Manager Review Only template for probation review | [ ] |

## Task 1: Flexible Objective Master and Assignment Manual Checklist

### Objective Master and Versioning

| Test Step | Expected Result | Status |
|---|---|---|
| HR/Admin creates Company Objective in draft | Objective is saved as draft and is not assignable | [ ] |
| HR/Admin activates Company Objective version | Objective version becomes active and assignable | [ ] |
| HR/Admin edits active objective | New version is created; existing assigned snapshots do not change | [ ] |
| HR/Admin deactivates objective version | Version is no longer assignable | [ ] |
| Attempt to assign draft objective version | System blocks with friendly message | [ ] |
| View objective version history | User can see version timeline and active version | [ ] |

### Department Objective and Permissions

| Test Step | Expected Result | Status |
|---|---|---|
| Department Head creates objective for own department | Objective is created successfully | [ ] |
| Department Head assigns objective inside own department | Assignment preview is allowed | [ ] |
| Department Head assigns objective outside own department | Backend blocks action | [ ] |
| Department Head edits Company Objective without permission | Backend blocks action | [ ] |
| Reviewer tries to edit Objective Master | Backend blocks action | [ ] |

### Assignment Rules and Preview

| Test Step | Expected Result | Status |
|---|---|---|
| Create objective assignment rule for Q1 only | Preview shows Q1 impacted employees only | [ ] |
| Apply same objective through two rules to same employee and term | Only one Employee Term Objective is created; both rule references are stored | [ ] |
| Apply different objective with similar title | System allows it and shows warning only | [ ] |
| Apply objective after cycle launch | Preview is required before apply | [ ] |
| Apply objective to half-yearly cycle with Q terms | System blocks term mismatch | [ ] |

### Snapshot and Correction

| Test Step | Expected Result | Status |
|---|---|---|
| Assign active objective to employee term | Employee Term Objective stores objectiveMasterId, objectiveVersionId, assignment refs, and frozen snapshot | [ ] |
| Edit Objective Master after assignment | Assigned employee objective display remains unchanged | [ ] |
| Mark assigned objective as not applicable through correction | Old snapshot and reason are preserved in audit | [ ] |
| Replace assigned objective through correction | Old and new objective snapshots are visible in audit | [ ] |

## Task 2: Objective Filling, Actuals, and Scoring Manual Checklist

### Fillability and Workflow

| Test Step | Expected Result | Status |
|---|---|---|
| Employee opens objective entry screen during open window | Editable fields are available as configured | [ ] |
| Employee opens objective entry screen after submission | Submitted fields are locked or read-only | [ ] |
| Manager opens review screen | Manager can enter only permitted review/comment/score fields | [ ] |
| Unauthorized actor calls update API directly | Backend rejects action | [ ] |

### Actual Columns by Cycle Type

| Test Step | Expected Result | Status |
|---|---|---|
| Quarterly cycle objective screen opens | Q1, Q2, Q3, Q4 actual fields are available as applicable | [ ] |
| Half-yearly cycle objective screen opens | Only H1 and H2 actual fields are available | [ ] |
| Yearly cycle objective screen opens | Only Y1 actual field is available | [ ] |
| Submit Q actual for half-yearly cycle through API | Backend rejects action | [ ] |

### Target Direction and Actual Validation

| Test Step | Expected Result | Status |
|---|---|---|
| Objective uses HIGHER_IS_BETTER and actual is below target | Submission is allowed; target-not-met guidance is shown | [ ] |
| Objective uses LOWER_IS_BETTER and actual is above target | Submission is allowed; target-not-met guidance is shown | [ ] |
| Numeric objective receives text actual value | System blocks with friendly validation | [ ] |
| Mandatory actual value is missing | System blocks submission | [ ] |
| Target direction is NOT_APPLICABLE | Numeric target comparison is not applied | [ ] |

### Context-Only and Scoring Modes

| Test Step | Expected Result | Status |
|---|---|---|
| Template objective mode is CONTEXT_ONLY | No score input is shown and objective does not affect final score | [ ] |
| Template objective mode is WEIGHTED_OBJECTIVE_SCORE | Manager can score scoreable objectives only | [ ] |
| Manager enters score above 100 | Backend rejects action | [ ] |
| Non-scoreable objective is displayed | It remains context only and is excluded from scoring | [ ] |
| Template objective mode is OVERALL_OBJECTIVE_SCORE | One overall objective score input is shown | [ ] |
| Try to enter per-objective and overall score together | Backend rejects conflicting input | [ ] |

### Aggregation and Final Score

| Test Step | Expected Result | Status |
|---|---|---|
| Use LATEST_VALUE actual aggregation | Latest applicable actual is used for target-based calculation | [ ] |
| Use SUM_OF_TERMS actual aggregation | Actual values are added before target-based calculation | [ ] |
| Use EQUAL_TERM_AVERAGE term aggregation | Included term objective scores are averaged equally | [ ] |
| Use TERM_WEIGHTED_AVERAGE with invalid weights | System blocks until weights total 100% | [ ] |
| Finalize review, then change template scoring | Finalized score snapshot does not change | [ ] |

## Task 3: Configurable Probation / Trainee Review Manual Checklist

### Default Flow

| Test Step | Expected Result | Status |
|---|---|---|
| Create probation assignment with default config | Assignment follows Manager 1 submit, Manager 2 approve flow | [ ] |
| Review open date is calculated | Review open date equals probation end date minus 30 days | [ ] |
| Manager 1 submits review | Status moves to Manager 2 pending/Manager 1 submitted | [ ] |
| Manager 2 approves review | Review finalizes successfully | [ ] |
| Try to edit finalized review | Backend rejects action | [ ] |

### Configurable Reviewer Modes

| Test Step | Expected Result | Status |
|---|---|---|
| Configure Manager 1 fills and approves | Manager 1 can finalize only when config permits | [ ] |
| Configure Manager 2 fills and approves | Manager 2 can finalize only when config permits | [ ] |
| Configure split input | Manager 1 and Manager 2 can edit only assigned sections | [ ] |
| Configure final approver | Final approver action is required before finalization | [ ] |
| Same user is Manager 1 and Manager 2 without permission | System blocks assignment or action | [ ] |

### Field, Section, and Grid Permissions

| Test Step | Expected Result | Status |
|---|---|---|
| Manager 1 opens review | Only Manager 1 visible sections/fields are returned | [ ] |
| Manager 2 opens review | Manager 2 hidden fields are masked or omitted | [ ] |
| Manager 1 edits Manager 2-only field through API | Backend rejects action | [ ] |
| Grid allows Manager 1 to add row | Row stores added by, added at, and role | [ ] |
| Grid delete is disabled for fixed form | UI and backend both block delete | [ ] |
| LAST_WRITE_WINS conflict mode is enabled | Previous and new values are fully audited | [ ] |

### Sharing and Delegation

| Test Step | Expected Result | Status |
|---|---|---|
| Share review as view-only | Shared user can view permitted content only | [ ] |
| Share review with edit access to selected fields | Shared user can edit only selected fields | [ ] |
| Delegated user tries to approve without approval permission | Backend rejects action | [ ] |
| Temporary access expires | User can no longer access after expiry | [ ] |
| Access is revoked | User can no longer access after revocation | [ ] |
| Delegated action is saved | Audit stores original owner and acting user separately | [ ] |

### Audit and Reporting

| Test Step | Expected Result | Status |
|---|---|---|
| View HR/Admin audit | Full assignment, field, row, sharing, approval, and finalization audit is visible | [ ] |
| View Manager 1 audit | Only permitted audit history is visible | [ ] |
| View delegated user audit | Own delegated actions and permitted history are visible | [ ] |
| Export probation report | Export uses locked template and configuration snapshot | [ ] |

## Task 4: Mid-Cycle Assignment Window Timing Manual Checklist

### Assignment Creation

| Test Step | Expected Result | Status |
|---|---|---|
| Create mid-cycle assignment for Q2 joining employee | HR/Admin can select Q2, Q3, Q4 only | [ ] |
| Try to save without applicable terms | System blocks and asks to select at least one term | [ ] |
| Explicitly include past term | System requires valid custom windows | [ ] |
| Save assignment-level window snapshot | Snapshot stores selected terms and resolved dates | [ ] |
| Change global cycle window later | Assignment-level snapshot does not change | [ ] |

### Window Modes

| Test Step | Expected Result | Status |
|---|---|---|
| Use INHERIT_CYCLE_WINDOW | Assignment uses cycle-level dates | [ ] |
| Use FIXED_DATE_RANGE | HR/Admin-entered dates are saved and validated | [ ] |
| Use RELATIVE_TO_ASSIGNMENT_DATE | Resolved dates are calculated and stored | [ ] |
| Use RELATIVE_TO_JOINING_DATE | Resolved dates are calculated from joining date | [ ] |
| Use RELATIVE_TO_TERM_DATE | Resolved dates are calculated from term date | [ ] |
| Use MANUAL_OPEN_CLOSE | HR/Admin can open/close with audit reason | [ ] |

### Runtime Behavior

| Test Step | Expected Result | Status |
|---|---|---|
| Objective setting window is closed | Employee/manager cannot edit objectives | [ ] |
| Achievement window is open | Actual entry is allowed for applicable terms only | [ ] |
| Manager review window is open | Manager can review selected applicable terms only | [ ] |
| Annual review for Q2 joiner | Q1 is excluded; Q2-Q4 are included | [ ] |
| Non-applicable term reminder check | No reminders are sent for non-applicable terms | [ ] |

### Dashboard, SLA, and Reporting

| Test Step | Expected Result | Status |
|---|---|---|
| Assignment has custom windows | Dashboard shows custom assignment window source | [ ] |
| Assignment has no custom windows | Dashboard falls back to cycle window source | [ ] |
| Due date passes with pending action | Dashboard shows overdue based on assignment-level due date | [ ] |
| Export assignment report | Applicable terms and assignment-level windows are included | [ ] |
| View assignment window audit | Term selection, windows, actor, timestamp, and reason are visible | [ ] |

## Cross-Module Regression Checklist

| Test Step | Expected Result | Status |
|---|---|---|
| Launch normal annual PMS cycle | Existing flow works without enabling new objective model | [ ] |
| Existing assignment workspace opens | Existing assignment data still loads | [ ] |
| Existing employee performance page opens | Existing data still renders | [ ] |
| Existing manager review page opens | Existing review actions still work | [ ] |
| Existing annual decision flow works | Annual decision behavior is unchanged | [ ] |
| Existing audit page opens | Existing audit data still renders | [ ] |
| Existing dashboard opens | Existing dashboard cards still calculate | [ ] |
| Existing bulk operations flow opens | Existing bulk actions are not broken | [ ] |
| Existing SLA/reminder behavior works for normal assignments | No assignment-level override is required | [ ] |

## UI and Usability Checklist

| Test Step | Expected Result | Status |
|---|---|---|
| HR/Admin can understand objective status labels without backend enum knowledge | Labels are plain and action-oriented | [ ] |
| Assignment preview explains new, duplicate, warning, and blocked rows | No technical error-only messages | [ ] |
| Scoring configuration explains each mode clearly | User can choose mode without reading code/design doc | [ ] |
| Probation review workspace shows current pending owner | User knows who must act next | [ ] |
| Delegation panel clearly shows active/expired/revoked access | User understands access state | [ ] |
| Mid-cycle date preview shows included/excluded terms | User understands review impact before saving | [ ] |
| All validation errors are shown near the related field where possible | User can fix issue quickly | [ ] |
| Main UI components are split into focused child components | No oversized single workspace file; split around 1000-1500+ lines | [ ] |
| Child components receive data through props/events | No duplicated nested API logic | [ ] |

## Final Sign-Off

| Sign-Off Area | Owner | Status |
|---|---|---|
| Backend API and validation complete | Backend Lead | [ ] |
| Frontend UI and usability complete | Frontend Lead | [ ] |
| Automated tests complete | QA / Dev | [ ] |
| Manual checklist complete | QA | [ ] |
| HR/Admin user acceptance complete | Business Owner | [ ] |
| Regression testing complete | QA | [ ] |
| Production readiness approved | Tech Lead / Manager | [ ] |
