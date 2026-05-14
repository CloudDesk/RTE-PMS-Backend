# QA Validation Prompts — PMS v2

## PMS v2 — Reusable Enterprise QA Validation Prompts

Use these QA prompts for PMS v2 module-wise test design.

All validation must follow:

*   PMS v2 Approved Baseline
*   Functional Scope Document
*   Functional Specification Document
*   Alignment & Discussion Decisions
*   v2 Dynamic Access decisions

The PMS v2 baseline is the source of truth for:

*   workflow
*   access control
*   visibility governance
*   communication dispatch
*   confidentiality
*   annual appraisal handling
*   historical preservation
*   correction handling
*   and out-of-scope restrictions

---

# Common QA Guardrail Prompt

Validate the PMS v2 module using only approved business logic.

Do not create test cases for:

*   employee self-review
*   employee acceptance/sign-off
*   dual-rating workflow
*   multi-manager review
*   parallel approvals
*   automatic recalculation of frozen decisions
*   archived cycle dashboard behavior
*   automated notification retry engine
*   unsupported rollback behavior
*   unsupported assignment cancellation entity
*   unrestricted HR editing
*   automatic workflow progression from escalation
*   unsupported matrix hierarchy behavior

Every test case must include:

| Field                | Required  |
| -------------------- | --------- |
| Test Case ID         | Yes       |
| Module               | Yes       |
| Scope / FR Reference | Yes       |
| Preconditions        | Yes       |
| Test Steps           | Yes       |
| Expected Result      | Yes       |
| Actual Result        | Yes       |
| Status               | Yes       |
| Defect Reference     | If Failed |

All QA outputs must preserve traceability:

Requirement → Module → Workflow → Validation → Audit/Event

---

# 1. Template Management — QA Prompt

## Goal

Validate PMS Template creation, versioning, quarter-aware sections, annual sections, visibility configuration, field permissions, and letter template rendering.

## Positive Scenarios

*   HR/Admin creates valid PMS Template.
*   HR/Admin creates Template Version.
*   HR/Admin activates Template Version.
*   HR/Admin configures quarter-aware sections.
*   HR/Admin configures annual appraisal sections.
*   HR/Admin configures field visibility.
*   HR/Admin configures section permissions.
*   HR/Admin configures scoring participation.
*   HR/Admin configures letter placeholders.
*   HR/Admin previews valid letter template.
*   Existing assignments remain locked to old Template Version after template update.
*   New assignments use active Template Version only.

## Negative Scenarios

*   Duplicate template code.
*   Activating multiple active Template Versions.
*   Editing locked Template Version.
*   Invalid quarter-aware configuration.
*   Invalid conditional block syntax.
*   Missing required placeholder.
*   Invalid scoring weightage.
*   Employee attempts template update.
*   Manager attempts template activation.
*   Hidden field appears in unauthorized API response.

## Permission Validation

*   HR/Admin can create/update/activate/deactivate Templates.
*   Employees cannot access Template configuration APIs.
*   Managers cannot modify Templates.
*   Directors have read-only scoped access only.
*   API enforces field-level permissions server-side.

## Boundary Testing

*   Minimum one section.
*   Multiple sections.
*   Quarter sections repeated across Q1–Q4.
*   Required fields.
*   Optional fields.
*   Hidden fields.
*   Read-only fields.
*   Weightage exactly equals expected total.
*   Maximum placeholder count where applicable.

## State Transition Testing

*   DRAFT → ACTIVE Template Version.
*   ACTIVE → DEACTIVATED.
*   Historical Template Version remains immutable.

## API Validation

*   Create Template API.
*   Create Template Version API.
*   Activate Template Version API.
*   Configure Sections API.
*   Configure Field Visibility API.
*   Preview Letter Template API.
*   Get Template API excludes unauthorized fields.

## Concurrent Operation Scenarios

*   Two HR/Admin users activate different Template Versions simultaneously.
*   Template update while assignments are being created.
*   Letter template edited while preview is generated.

Expected:

*   Only one active Template Version allowed.
*   Historical assignment/template linkage preserved.
*   No partial template corruption.

## Error Handling Validation

*   Duplicate template code error.
*   Invalid placeholder validation error.
*   Invalid weightage error.
*   Unauthorized update rejected.
*   Hidden field request masked or rejected.

Traceability:

Template versioning, section configuration, field visibility, and immutable historical linkage are defined in PMS v2 Scope/FSD/Baseline.

---

# 2. Cycle Management — QA Prompt

## Goal

Validate Annual Parent Cycle setup, quarter configuration, appraisal windows, launch flow, and cycle status behavior.

## Positive Scenarios

*   HR/Admin creates valid Annual Parent Cycle.
*   HR/Admin configures Q1–Q4.
*   HR/Admin configures quarter objective windows.
*   HR/Admin configures manager review windows.
*   HR/Admin configures annual appraisal window.
*   HR/Admin configures relative offset rule.
*   HR/Admin links active Template Version.
*   HR/Admin launches scheduled cycle.
*   Annual cycle transitions to ACTIVE.

## Negative Scenarios

*   Missing Q1–Q4.
*   Overlapping quarter windows.
*   Invalid quarter date sequence.
*   Appraisal window before quarter completion.
*   Launch without active Template Version.
*   Employee attempts cycle launch.
*   Invalid relative offset.
*   Duplicate cycle code.

## Permission Validation

*   HR/Admin can create/update/launch/archive cycles.
*   Employees can only view assigned cycle information.
*   Managers can only view relevant cycle information.
*   Directors have read-only scoped access.

## Boundary Testing

*   Quarter start date = annual cycle start date.
*   Quarter end date = annual cycle end date.
*   Adjacent non-overlapping windows.
*   Invalid zero-day windows.
*   Q4 completion + offset appraisal opening.

## State Transition Testing

*   DRAFT → SCHEDULED.
*   SCHEDULED → ACTIVE.
*   ACTIVE → IN_PROGRESS.
*   IN_PROGRESS → ALL_QUARTERS_FINALIZED.
*   CLOSED → ARCHIVED.

## API Validation

*   Create Annual Cycle API validates dates.
*   Configure Quarter API validates sequence.
*   Launch Cycle API validates active Template Version.
*   Get Cycle API respects permissions.

## Concurrent Operation Scenarios

*   Two HR/Admin users update quarter windows simultaneously.
*   Cycle launch triggered twice.
*   Quarter closure while annual roll-up job executes.

Expected:

*   Single valid launch.
*   No overlapping windows.
*   Parent-child consistency preserved.

## Error Handling Validation

*   Invalid quarter configuration rejected.
*   Duplicate cycle code rejected.
*   Unauthorized launch rejected.
*   Invalid appraisal dependency rejected.

Traceability:

Annual Parent Cycle with Q1–Q4 child quarters and dependency-driven annual appraisal flow are approved PMS v2 architecture decisions.

---

# 3. Assignment Management — QA Prompt

## Goal

Validate Annual Assignment, Quarter Assignment, bulk assignment, manager mapping, reassignment, and exception handling.

## Positive Scenarios

*   HR/Admin creates Annual Assignment.
*   Linked Quarter Assignments created successfully.
*   Valid manager assigned.
*   Template Version locked during assignment creation.
*   Bulk assignment creates valid records.
*   Reassignment preserves historical attribution.
*   Assignment exception queue stores invalid records.

## Negative Scenarios

*   Duplicate Annual Assignment.
*   Missing manager.
*   Inactive manager.
*   Invalid employee eligibility.
*   Reassignment without reason.
*   Invalid quarter assignment creation.
*   Unauthorized assignment access.

## Permission Validation

*   HR/Admin can assign/reassign.
*   Employee can view own assignments only.
*   Manager can view assigned/hierarchy-authorized employees only.
*   Directors have scoped visibility only.

## Boundary Testing

*   Employee joins mid-year.
*   Employee exits before Q4.
*   One-quarter-only assignment.
*   Bulk assignment with mixed valid/invalid employees.
*   Multiple manager reassignments.

## State Transition Testing

*   Assignment creation triggers initial workflow states.
*   Reassignment affects future actions only.

## API Validation

*   Create Assignment API prevents duplicates.
*   Bulk Assignment API reports per-record failures.
*   Reassign API requires mandatory reason.
*   Exception Queue API shows unresolved records.

## Concurrent Operation Scenarios

*   Duplicate assignment creation from two users.
*   Simultaneous reassignment requests.
*   Assignment creation during cycle closure.

Expected:

*   Duplicate prevention enforced.
*   Historical attribution preserved.
*   Partial failures safely reported.

## Error Handling Validation

*   Duplicate assignment error.
*   Missing manager exception handling.
*   Invalid eligibility rejection.
*   Unauthorized assignment access denied.

Traceability:

Annual Assignment and Quarter Assignment structure, manager mapping, reassignment governance, and template version locking are defined in PMS v2 baseline.

---

# 4. Workflow Engine — QA Prompt

## Goal

Validate approved quarter and annual workflow transitions and rejection of invalid transitions.

## Positive State Transition Scenarios

Validate approved Quarter transitions:

```text
NOT_STARTED → OBJECTIVE_SETTING_OPEN
OBJECTIVE_SETTING_OPEN → OBJECTIVE_DRAFT
OBJECTIVE_DRAFT → OBJECTIVE_SUBMITTED
OBJECTIVE_SUBMITTED → OBJECTIVE_APPROVED
OBJECTIVE_SUBMITTED → OBJECTIVE_REVISION_REQUIRED
OBJECTIVE_REVISION_REQUIRED → OBJECTIVE_SUBMITTED
OBJECTIVE_APPROVED → MANAGER_REVIEW_OPEN
MANAGER_REVIEW_OPEN → MANAGER_REVIEW_SUBMITTED
MANAGER_REVIEW_SUBMITTED → QUARTER_FINALIZED
QUARTER_FINALIZED → REOPENED_BY_ADMIN
REOPENED_BY_ADMIN → QUARTER_FINALIZED
```

Validate approved Annual transitions:

```text
DRAFT → SCHEDULED
SCHEDULED → ACTIVE
ACTIVE → IN_PROGRESS
IN_PROGRESS → ALL_QUARTERS_FINALIZED
ALL_QUARTERS_FINALIZED → APPRAISAL_WINDOW_OPEN
APPRAISAL_WINDOW_OPEN → MANAGEMENT_DECISION_DRAFT
MANAGEMENT_DECISION_DRAFT → MANAGEMENT_DECISION_SUBMITTED
MANAGEMENT_DECISION_SUBMITTED → ANNUAL_FINALIZED
ANNUAL_FINALIZED → VISIBILITY_ENABLED
VISIBILITY_ENABLED → COMMUNICATION_READY
COMMUNICATION_READY → COMMUNICATION_SENT
```

## Negative State Transition Scenarios

*   OBJECTIVE_SETTING_OPEN → ANNUAL_FINALIZED.
*   MANAGER_REVIEW_OPEN → OBJECTIVE_SETTING_OPEN.
*   QUARTER_FINALIZED → OBJECTIVE_DRAFT.
*   ANNUAL_FINALIZED → MANAGEMENT_DECISION_DRAFT without reopen.
*   VISIBILITY_ENABLED → OBJECTIVE_APPROVED.
*   COMMUNICATION_SENT → APPRAISAL_WINDOW_OPEN without reopen.

## Permission Validation

*   Employee transitions restricted to objective actions.
*   Manager transitions restricted to approval/review.
*   HR/Admin controls reopen/close/visibility.
*   Management controls annual decisions where configured.
*   System auto-actions restricted to approved transitions.

## Approval Flow Validation

*   Employee-created objectives require Manager approval.
*   Annual appraisal blocked until all applicable quarters finalized/closed.
*   Visibility requires annual finalization.
*   Communication requires visibility governance.
*   Reopen is correction-only.

## Boundary Testing

*   Quarter finalized exactly at window end.
*   Appraisal window opens at configured offset.
*   Reopen immediately after finalization.

## API Validation

*   Execute Workflow Action API validates state.
*   Allowed Actions API returns role-specific actions.
*   Workflow History API shows complete transition chain.

## Concurrent Operation Scenarios

*   Same workflow action submitted twice.
*   Quarter finalized while reopen requested.
*   Visibility enabled while annual reopen initiated.
*   Communication dispatch while visibility disabled.

Expected:

*   Only valid transition succeeds.
*   Duplicate actions safely rejected.
*   Workflow integrity preserved.

## Error Handling Validation

*   Invalid transition rejected.
*   Unauthorized transition rejected.
*   Duplicate transition handled safely.
*   Finalized state mutation rejected.

Traceability:

Quarter and Annual workflow states and transition rules are governed by PMS v2 Approved Baseline.

---

# 5. Objective Management — QA Prompt

## Goal

Validate quarterly Objective creation, submission, approval, revision, manager-created objectives, and objective immutability.

## Positive Scenarios

*   Employee creates objective during active objective window.
*   Employee edits objective draft.
*   Employee submits objective.
*   Manager approves employee-created objective.
*   Manager returns objective with revision comment.
*   Employee resubmits revised objective.
*   Manager creates objective.
*   Manager-created objective auto-approves.
*   Objective attachments upload successfully.

## Negative Scenarios

*   Employee edits objective after approval.
*   Employee edits manager-created objective.
*   Manager approves unrelated employee objective.
*   Manager returns without comment.
*   Invalid objective weightage.
*   Objective submission outside configured window.

## Permission Validation

*   Employee manages own objectives only.
*   Manager approves assigned/hierarchy-authorized employees only.
*   HR/Admin override follows approved permissions.
*   Directors have read-only scoped access.

## Boundary Testing

*   Minimum one objective.
*   Multiple objectives.
*   Weightage exactly valid.
*   Weightage invalid.
*   Attachment at maximum configured size.
*   Objective target date at quarter boundary.

## State Transition Testing

*   OBJECTIVE_DRAFT → OBJECTIVE_SUBMITTED.
*   OBJECTIVE_SUBMITTED → OBJECTIVE_APPROVED.
*   OBJECTIVE_SUBMITTED → OBJECTIVE_REVISION_REQUIRED.
*   OBJECTIVE_REVISION_REQUIRED → OBJECTIVE_SUBMITTED.
*   Manager-created objective directly enters OBJECTIVE_APPROVED.

## API Validation

*   Create Objective API.
*   Submit Objective API.
*   Approve Objective API.
*   Return Objective API.
*   Objective History API.
*   Attachment Upload API.

## Concurrent Operation Scenarios

*   Employee submits objective while Manager edits same objective.
*   Two managers attempt approval.
*   Employee uploads attachment during submission.

Expected:

*   Single valid approval.
*   Objective history preserved.
*   No lost updates.

## Error Handling Validation

*   Missing required field error.
*   Invalid weightage rejection.
*   Unauthorized approval rejection.
*   Invalid attachment handling.

Traceability:

Quarterly objective lifecycle and manager-created auto-approved objectives are approved PMS v2 decisions.

---

# 6. Manager Quarterly Review — QA Prompt

## Goal

Validate Manager quarterly review entry, ratings, comments, attachments, submission, and quarter finalization.

## Positive Scenarios

*   Manager loads approved objectives.
*   Manager enters ratings/comments.
*   Manager uploads review attachment.
*   Manager submits quarter review.
*   Quarter transitions to MANAGER_REVIEW_SUBMITTED.
*   HR/Admin finalizes quarter.

## Negative Scenarios

*   Manager reviews unrelated employee.
*   Review without approved objectives.
*   Missing required review fields.
*   Invalid rating values.
*   Finalized quarter edited.
*   Employee edits manager review.

## Permission Validation

*   Manager can review assigned/hierarchy-authorized employees only.
*   HR/Admin can finalize/reopen.
*   Employee cannot edit manager review.
*   Director access is read-only scoped.

## Boundary Testing

*   Minimum rating.
*   Maximum rating.
*   Long manager comments.
*   Multiple review sections.
*   Attachment boundary validations.

## State Transition Testing

*   OBJECTIVE_APPROVED → MANAGER_REVIEW_OPEN.
*   MANAGER_REVIEW_OPEN → MANAGER_REVIEW_SUBMITTED.
*   MANAGER_REVIEW_SUBMITTED → QUARTER_FINALIZED.

## API Validation

*   Get Quarter Review API.
*   Save Review Draft API.
*   Submit Review API.
*   Finalize Quarter API.
*   Review History API.

## Concurrent Operation Scenarios

*   Manager submits review twice.
*   Quarter finalized during active manager edit.
*   Manager reassigned during review window.

Expected:

*   One valid submission.
*   Historical manager attribution preserved.
*   Finalized review remains immutable.

## Error Handling Validation

*   Unauthorized assignment access denied.
*   Invalid rating rejected.
*   Missing required fields rejected.
*   Finalized edit rejected.

Traceability:

Manager-driven quarterly review model without employee self-review is a core PMS v2 architecture rule.

---

# 7. Annual Appraisal Decision — QA Prompt

## Goal

Validate annual summary, grade/merit decisions, outcome derivation, freeze, reopen, and confidentiality handling.

## Positive Scenarios

*   Annual summary loads finalized quarter data.
*   Management saves decision draft.
*   isGradeApplied = true.
*   isMeritApplied = true.
*   appraisalOutcomeType derives correctly.
*   Decision submitted successfully.
*   Decision frozen successfully.
*   Reopen captures snapshot.
*   Re-finalization preserves audit chain.

## Negative Scenarios

*   Annual decision before all applicable quarters finalized/closed.
*   Missing decision flags.
*   Invalid outcome derivation.
*   Grade fields missing while grade enabled.
*   Merit fields missing while merit enabled.
*   Employee accesses confidential grade before visibility governance.
*   Frozen decision edited through standard API.

## Permission Validation

*   Management can create/submit decisions where authorized.
*   HR/Admin can finalize/reopen where configured.
*   Employees cannot view confidential fields before publish.
*   Directors cannot edit annual decision.

## Boundary Testing

*   BOTH outcome.
*   MERIT_ONLY outcome.
*   GRADE_ONLY outcome.
*   NIL outcome.
*   Employee with only one applicable quarter.
*   Employee exited before year-end.

## State Transition Testing

*   ALL_QUARTERS_FINALIZED → APPRAISAL_WINDOW_OPEN.
*   MANAGEMENT_DECISION_DRAFT → MANAGEMENT_DECISION_SUBMITTED.
*   MANAGEMENT_DECISION_SUBMITTED → ANNUAL_FINALIZED.
*   ANNUAL_FINALIZED → APPRAISAL_WINDOW_OPEN on reopen.

## API Validation

*   Get Annual Summary API.
*   Save Decision Draft API.
*   Submit Decision API.
*   Freeze Decision API.
*   Reopen Decision API.
*   Decision Audit API.

## Concurrent Operation Scenarios

*   Two Management users edit same decision.
*   Freeze and reopen requested simultaneously.
*   Visibility governance while decision reopen starts.

Expected:

*   Single valid final state.
*   Snapshot preservation.
*   Confidentiality maintained.

## Error Handling Validation

*   Invalid appraisal dependency rejection.
*   Missing decision flag rejection.
*   Unauthorized confidential access denied.
*   Frozen edit rejection.

Traceability:

Annual appraisal decision architecture, confidentiality, and outcome derivation are approved PMS v2 business rules.

---

# 8. Visibility Governance — QA Prompt

## Goal

Validate controlled visibility governance, field masking, and confidential data protection.

## Positive Scenarios

*   Employee review visibility enabled.
*   Employee grade visibility enabled.
*   Manager merit visibility disabled.
*   API returns only visible fields.
*   Visibility audit created.

## Negative Scenarios

*   Grade visible before annual finalization.
*   Merit visible without publish.
*   Hidden field accessible through API.
*   Unauthorized visibility change.
*   Communication dispatched before visibility governance.

## Permission Validation

*   HR/Admin can enable visibility.
*   Management can enable visibility where configured.
*   Employees see only published fields.
*   Managers see only permitted hierarchy-scoped fields.

## Boundary Testing

*   Employee grade visible but merit hidden.
*   Manager visibility different from employee visibility.
*   Visibility toggled after communication dispatch.

## State Transition Testing

*   ANNUAL_FINALIZED → VISIBILITY_ENABLED.
*   Visibility disable after publish follows approved rules only.

## API Validation

*   Enable Visibility API.
*   Disable Visibility API.
*   Filter Visible Fields API.
*   Visibility Audit API.

## Concurrent Operation Scenarios

*   Multiple visibility updates simultaneously.
*   Visibility disabled while communication generation running.
*   API request attempts direct hidden-field access.

Expected:

*   Hidden fields masked.
*   Permission evaluation consistent.
*   Communication visibility integrity preserved.

## Error Handling Validation

*   Unauthorized visibility update rejected.
*   Hidden field access denied.
*   Invalid publish dependency rejected.

Traceability:

Visibility Governance and confidential field masking are explicit PMS v2 security requirements.

---

# 9. Communication Dispatch — QA Prompt

## Goal

Validate outcome-based communication template resolution, preview, dispatch, resend, and immutable communication history.

## Positive Scenarios

*   Template resolved for BOTH outcome.
*   Template resolved for MERIT_ONLY outcome.
*   Template resolved for GRADE_ONLY outcome.
*   NIL outcome follows configured policy.
*   Preview generated successfully.
*   Communication dispatched successfully.
*   Resend preserves old communication history.
*   Generated document stored.

## Negative Scenarios

*   Missing template mapping.
*   Communication before visibility governance.
*   Missing placeholder value.
*   Template changed after dispatch alters historical mail.
*   Duplicate dispatch.
*   Unauthorized dispatch attempt.

## Permission Validation

*   HR/Admin can preview/send/resend.
*   Management has read-only visibility where configured.
*   Employees cannot dispatch.
*   Managers cannot dispatch.

## Boundary Testing

*   Large communication batch.
*   Long placeholder values.
*   Multiple conditional blocks.
*   Combined vs separate templates for BOTH outcome.

## State Transition Testing

*   VISIBILITY_ENABLED → COMMUNICATION_READY.
*   COMMUNICATION_READY → COMMUNICATION_SENT.

## API Validation

*   Preview Communication API.
*   Send Communication API.
*   Resend Communication API.
*   Get Dispatch History API.
*   Generated Document API.

## Concurrent Operation Scenarios

*   Two HR/Admin users dispatch same employee communication.
*   Resend initiated during original send processing.
*   Template edited while dispatch executing.

Expected:

*   Duplicate communication prevention.
*   Immutable sent content.
*   Correct template resolution.

## Error Handling Validation

*   Missing template error.
*   Placeholder resolution failure.
*   Unauthorized dispatch rejection.
*   Email delivery failure logged.

Traceability:

Outcome-driven dynamic communication generation and immutable communication history are approved PMS v2 requirements.

---

# 10. Dynamic Access Engine — QA Prompt

## Goal

Validate centralized runtime access control, hierarchy scope, field-level visibility, deny-over-allow rules, and permission simulation.

## Positive Scenarios

*   Employee accesses own assignment.
*   Manager accesses assigned employee.
*   Director accesses configured hierarchy scope.
*   HR/Admin configures role permissions.
*   Permission simulation returns allowed access.
*   Hidden fields excluded correctly.

## Negative Scenarios

*   Employee accesses another employee.
*   Manager accesses unrelated employee.
*   Unauthorized field update.
*   Deny rule overridden incorrectly.
*   Invalid permission configuration published.
*   Hidden field returned in API.

## Permission Validation

Validate all dimensions together:

*   role
*   assignment relationship
*   hierarchy scope
*   workflow state
*   field-level permission
*   visibility rule

## Boundary Testing

*   Same user with multiple roles.
*   Hidden field direct request.
*   Read-only field update attempt.
*   Delegate validity boundary.
*   Deny-over-allow conflict.

## API Validation

*   Evaluate Access API.
*   Simulate Access API.
*   Filter Visible Fields API.
*   Payload Permission Validation API.

## Concurrent Operation Scenarios

*   Permission change during active review.
*   Access simulation while permission publish executes.
*   Multiple role updates simultaneously.

Expected:

*   Consistent runtime access.
*   Hidden field protection preserved.
*   No stale permission leakage.

## Error Handling Validation

*   Unauthorized access denied.
*   Invalid permission config rejected.
*   Hidden field masked.
*   Invalid hierarchy scope rejected.

Traceability:

Dynamic Access Engine and deny-over-allow confidentiality rules are approved v2 architecture decisions.

---

# 11. History & Audit Compliance — QA Prompt

## Goal

Validate immutable audit logging, historical snapshots, correction layers, communication history, and traceability.

## Positive Scenarios

Audit created for:

*   Objective create/update.
*   Objective approval/return.
*   Quarter review submission.
*   Quarter finalization.
*   Annual decision freeze.
*   Visibility governance.
*   Communication dispatch.
*   Reopen.
*   Override.
*   Reassignment.
*   Bulk operations.

Historical snapshot preserves:

*   Template Version.
*   Letter Template Version.
*   Frozen appraisal values.
*   Sent communication content.
*   Correction references.

## Negative Scenarios

*   Action completed without audit.
*   Audit missing actor.
*   Audit missing timestamp.
*   Historical snapshot overwritten.
*   Correction overwrites original data.
*   Normal user edits audit log.

## Permission Validation

*   HR/Admin can access full audit.
*   Management scoped audit access.
*   Employees restricted to visible history only.
*   Directors scoped read-only history.

## Boundary Testing

*   Multiple reopen chains.
*   Multiple corrections.
*   Large audit history.
*   Historical export.
*   Snapshot before/after correction.

## API Validation

*   Get Audit History API.
*   Get Historical Snapshot API.
*   Get Correction History API.
*   Audit creation internal service.

## Concurrent Operation Scenarios

*   Reopen during audit export.
*   Multiple overrides.
*   Communication resend during snapshot retrieval.

Expected:

*   Immutable history.
*   Correct correction chain.
*   Audit integrity preserved.

## Error Handling Validation

*   Missing reason rejection.
*   Unauthorized audit access denied.
*   Snapshot missing before override rejected.

Traceability:

Immutable auditability, correction layers, and historical preservation are mandatory PMS v2 governance rules.

---

# 12. SLA & Notification Management — QA Prompt

## Goal

Validate SLA rules, reminders, escalation notifications, notification delivery, and failure handling.

## Positive Scenarios

*   SLA rule configured successfully.
*   Reminder generated before due date.
*   Due-date reminder triggered.
*   Overdue escalation generated.
*   Event notification triggered.
*   Communication sent notification generated.
*   Failure logged successfully.

## Negative Scenarios

*   Invalid SLA workflow mapping.
*   Escalation auto-progresses workflow.
*   Hidden field appears in notification.
*   Retry queue auto-created.
*   Unauthorized SLA update.

## Permission Validation

*   HR/Admin configures SLA rules.
*   Employees receive only own notifications.
*   Managers receive assigned-team notifications.
*   HR/Admin accesses escalation/failure logs.

## Boundary Testing

*   Reminder exactly before due date.
*   Due date boundary.
*   Post-due escalation boundary.
*   Large notification batch.
*   Missing email address.

## State Transition Testing

*   SLA breach does not auto-change workflow state.
*   Escalation notification does not grant permissions.

## API Validation

*   Configure SLA API.
*   Get Escalation API.
*   Notification Log API.
*   Failure Log API.

## Concurrent Operation Scenarios

*   Reminder scheduler runs twice.
*   User action completed during escalation job.
*   Bulk reminders and event notifications overlap.

Expected:

*   No duplicate escalation.
*   Correct workflow state preserved.
*   Failure logging consistent.

## Error Handling Validation

*   Invalid SLA rule rejected.
*   Email failure logged.
*   Unauthorized SLA access denied.
*   Hidden confidential content excluded.

Traceability:

Notification-based escalation and failure logging without retry engine are approved PMS v2 rules.

---

# 13. Dashboard & Reporting — QA Prompt

## Goal

Validate dashboard visibility, reporting metrics, scoped filtering, and confidential field protection.

## Positive Scenarios

*   HR/Admin dashboard shows organization-wide metrics.
*   Manager dashboard shows assigned team metrics.
*   Employee dashboard shows own data.
*   Management dashboard shows annual decision readiness.
*   Export generates valid report.
*   SLA metrics displayed correctly.

## Negative Scenarios

*   Employee sees unrelated data.
*   Hidden grade/merit visible before publish.
*   Archived cycle appears in active dashboard.
*   Unauthorized export.
*   Dashboard recalculates frozen values.

## Permission Validation

*   HR/Admin organization-wide visibility.
*   Manager hierarchy-scoped visibility.
*   Employee own-data visibility only.
*   Director scoped visibility only.

## Boundary Testing

*   No active cycle.
*   No assignments.
*   All quarters finalized.
*   Large data set export.
*   Empty filter result.

## API Validation

*   Get Dashboard APIs.
*   Export API.
*   Metric APIs.
*   Scoped filtering validation.

## Concurrent Operation Scenarios

*   Dashboard refresh during cycle closure.
*   Export generated during visibility update.
*   Communication dispatch while metrics refresh.

Expected:

*   Scoped metrics only.
*   Confidentiality preserved.
*   Stable reporting outputs.

## Error Handling Validation

*   Unauthorized dashboard access denied.
*   Invalid filter rejected.
*   Export failure handled safely.

Traceability:

Dashboard/reporting metrics and scoped visibility rules are defined in PMS v2 FSD and baseline.

---

*   Confidential fields protected in result output.

## Boundary Testing

*   Empty filter result.
*   One-record batch.
*   Very large batch.
*   Mixed valid/invalid records.
*   Partial failures.

## API Validation

*   Preview Bulk APIs.
*   Execute Bulk APIs.
*   Bulk Result APIs.
*   Partial failure reporting.

## Concurrent Operation Scenarios

*   Two bulk assignments simultaneously.
*   Bulk communication while visibility changes.
*   Bulk close while manager submits review.

Expected:

*   No duplicate assignments.
*   No invalid workflow transitions.
*   Per-record failure integrity preserved.

## Error Handling Validation

*   Missing reason rejected.
*   Duplicate assignment rejected per record.
*   Unauthorized bulk action denied.
*   Invalid visibility dependency rejected.

Traceability:

Bulk scalability, preview support, auditability, and partial-failure handling are approved PMS v2 operational requirements.

---

# Final QA Output Expectation

For every module, generate:

*   functional test cases
*   API test cases
*   permission test cases
*   approval-flow validation test cases
*   state transition test cases
*   negative test cases
*   boundary test cases
*   concurrent operation test cases
*   error handling validation test cases
*   audit validation test cases
*   traceability mapping to PMS v2 Scope/FSD/Baseline

Do not introduce unsupported business behavior.

Any unclear behavior must be marked as:

`Pending Business Clarification: <question>`
