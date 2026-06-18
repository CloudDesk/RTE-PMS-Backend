# PMS Term Flow Plan

## Purpose

This document defines the final PMS assessment term workflow for Quarterly, Half-Yearly, and Yearly cycles.

The business language should use **Term** everywhere in UI, documentation, user-facing messages, and workflow enum names. Existing backend collection and field names can remain unchanged for now to avoid a larger schema refactor.

## Naming Decision

The system is not live yet and old records are not a blocker. Therefore, use clean term-based workflow enum names now.

Rename internal workflow enums:

```txt
QUARTER_FINALIZED      -> TERM_FINALIZED
ALL_QUARTERS_FINALIZED -> ALL_TERMS_FINALIZED
```

Keep existing collection and field names for now:

```txt
quarter_assignments
quarter_reviews
quarterCode
quarterState
```

Reason:

- The business concept is assessment term, not only quarter.
- The same structure is used for `Q1/Q2/Q3/Q4`, `H1/H2`, and `Y1`.
- Renaming enums now improves long-term clarity.
- Renaming collections/field names is a bigger schema/API refactor and is not required for this phase.
- Since this is not live, enum cleanup is safer now than after production usage begins.

## Core Rule

Each applicable assessment term must reach finalized state before annual decision can begin.

Finalized internal states:

```txt
TERM_FINALIZED
CLOSED_BY_ADMIN
```

Business meaning:

```txt
Term Finalized
```

## Assessment Term Lifecycle

Every term follows the same workflow, regardless of cycle type:

```txt
OBJECTIVE_SETTING_OPEN
-> OBJECTIVE_APPROVED
-> EMPLOYEE_ACHIEVEMENT_OPEN
-> MANAGER_REVIEW_OPEN
-> MANAGER_REVIEW_SUBMITTED
-> TERM_FINALIZED
```

User-facing labels:

```txt
Objective Setting Open
Objective Approved
Achievement Open
Manager Review Open
Manager Review Submitted
Term Finalized
```

## Objective Phase

During `OBJECTIVE_SETTING_OPEN`:

- Employee can create objective drafts.
- Employee can submit objectives for manager approval.
- Manager can approve employee-created objectives.
- Manager-created objectives are approved immediately as per existing manager-created objective flow.
- Sync/state transition must not move to achievement phase until all required objectives are approved.

When objectives are complete:

```txt
OBJECTIVE_SETTING_OPEN
-> OBJECTIVE_APPROVED
```

Then the next workflow sync can move:

```txt
OBJECTIVE_APPROVED
-> EMPLOYEE_ACHIEVEMENT_OPEN
```

## Employee Achievement Phase

During `EMPLOYEE_ACHIEVEMENT_OPEN`:

- Employee submits achievement details for the term.
- Achievement submission stores the submitted items, attachments, submitted user, and submitted timestamp.
- Workflow should not move to manager review until required achievement submission is complete.

After valid employee submission and sync:

```txt
EMPLOYEE_ACHIEVEMENT_OPEN
-> MANAGER_REVIEW_OPEN
```

## Manager Review Submit

Manager review submit should finalize the term automatically after successful validation.

Normal flow:

```txt
MANAGER_REVIEW_OPEN
-> MANAGER_REVIEW_SUBMITTED
-> TERM_FINALIZED
```

Business meaning:

```txt
Manager submitted review
-> Term Finalized
```

Manager review submit must validate:

- Required manager review fields.
- Required template review values.
- Ratings and scoring inputs.
- Manager comments if required.
- Attachments if required by the configured template or workflow.

Audit expectation:

- Audit `MANAGER_REVIEW_SUBMITTED`.
- Audit `TERM_FINALIZED`.

Admin should not need to manually finalize after every manager review in the normal flow.

## Admin Role

Admin is an exception handler, not a mandatory reviewer for every term.

Admin can:

- View finalized term review.
- Run manual workflow sync.
- Manually finalize a stuck term.
- Reopen a finalized term for correction.
- Apply correction or override where allowed.
- Use UAT/testing state controls when required.

Admin should not be required in the normal manager review completion path.

## Cycle Type Rules

### Quarterly Cycle

Applicable terms:

```txt
Q1
Q2
Q3
Q4
```

Each term finalizes independently.

Annual decision unlock condition:

```txt
Q1 = TERM_FINALIZED or CLOSED_BY_ADMIN
Q2 = TERM_FINALIZED or CLOSED_BY_ADMIN
Q3 = TERM_FINALIZED or CLOSED_BY_ADMIN
Q4 = TERM_FINALIZED or CLOSED_BY_ADMIN
```

Then parent annual assignment can become:

```txt
ALL_TERMS_FINALIZED
```

UI label:

```txt
All Terms Finalized
```

### Half-Yearly Cycle

Applicable terms:

```txt
H1
H2
```

Annual decision unlock condition:

```txt
H1 = TERM_FINALIZED or CLOSED_BY_ADMIN
H2 = TERM_FINALIZED or CLOSED_BY_ADMIN
```

Then parent annual assignment can become:

```txt
ALL_TERMS_FINALIZED
```

UI label:

```txt
All Terms Finalized
```

### Yearly Cycle

Applicable term:

```txt
Y1
```

Annual decision unlock condition:

```txt
Y1 = TERM_FINALIZED or CLOSED_BY_ADMIN
```

Then parent annual assignment can become:

```txt
ALL_TERMS_FINALIZED
```

UI label:

```txt
All Terms Finalized
```

## Annual Assignment Rollup

After every term finalization, the system must check the parent annual assignment.

Rollup check:

```txt
Find all active quarter_assignments for annualAssignmentId
Filter by annualAssignment.applicableQuarters
Confirm every applicable term is TERM_FINALIZED or CLOSED_BY_ADMIN
```

If all applicable terms are finalized or closed:

```txt
annual_assignments.annualState = ALL_TERMS_FINALIZED
annual_assignments.finalDecisionStatus = DRAFT
```

Business label:

```txt
All Terms Finalized
```

This rollup should run from all term completion paths:

- Manager review submit auto-finalization.
- Admin manual finalization.
- Admin workflow sync when it moves a term to finalized state.
- Any future bulk finalization or correction path that results in a finalized term.

The rollup must not move an annual assignment backward.

## Annual Decision Gate

Admin final decision is editable only when all required gates pass.

Required gates:

```txt
annual_assignments.annualState = ALL_TERMS_FINALIZED
AND all applicable terms are TERM_FINALIZED or CLOSED_BY_ADMIN
AND appraisal window is open
AND finalDecisionStatus = DRAFT
```

The appraisal window can remain computed from:

```txt
appraisalWindowConfig + current date
```

Do not force `APPRAISAL_WINDOW_OPEN` as a stored annual assignment state unless an existing workflow path already uses it.

## Annual Decision Flow

Once annual decision is unlocked:

```txt
ALL_TERMS_FINALIZED
-> MANAGEMENT_DECISION_DRAFT
-> MANAGEMENT_DECISION_SUBMITTED
-> ANNUAL_FINALIZED
-> VISIBILITY_ENABLED
-> COMMUNICATION_READY
-> COMMUNICATION_SENT
```

Current code may use `FROZEN` as the annual decision status after finalization/freeze. That is acceptable.

Recommended business wording:

```txt
Annual Decision Draft
Annual Decision Submitted
Annual Finalized
Visibility Enabled
Communication Ready
Communication Sent
```

## Tracking Queries

### Check Term Records

```js
db.quarter_assignments.find({
  annualAssignmentId: ObjectId("..."),
  isDeleted: false
}).sort({ termCode: 1 })
```

Expected quarterly completion:

```txt
Q1 TERM_FINALIZED
Q2 TERM_FINALIZED
Q3 TERM_FINALIZED
Q4 TERM_FINALIZED
```

Expected half-yearly completion:

```txt
H1 TERM_FINALIZED
H2 TERM_FINALIZED
```

Expected yearly completion:

```txt
Y1 TERM_FINALIZED
```

### Check Annual Assignment Parent

```js
db.annual_assignments.findOne({
  _id: ObjectId("...")
})
```

Expected after all applicable terms are finalized:

```txt
annualState: ALL_TERMS_FINALIZED
finalDecisionStatus: DRAFT
```

### Check Manager Review

```js
db.quarter_reviews.find({
  annualAssignmentId: ObjectId("..."),
  quarterAssignmentId: ObjectId("..."),
  isDeleted: false
})
```

Expected after manager submit and auto-finalize:

```txt
reviewStatus: MANAGER_REVIEW_SUBMITTED or FINALIZED
submittedAt: present
score/overallScore: present
```

The related `quarter_assignments` record should be:

```txt
quarterState: TERM_FINALIZED
```

## UI Label Rules

Do not show old raw `QUARTER_FINALIZED` wording to users.

Use this mapping:

```txt
OBJECTIVE_SETTING_OPEN        -> Objective Setting Open
OBJECTIVE_APPROVED            -> Objective Approved
EMPLOYEE_ACHIEVEMENT_OPEN     -> Achievement Open
MANAGER_REVIEW_OPEN           -> Manager Review Open
MANAGER_REVIEW_SUBMITTED      -> Manager Review Submitted
TERM_FINALIZED                -> Term Finalized
CLOSED_BY_ADMIN               -> Closed By Admin
ALL_TERMS_FINALIZED           -> All Terms Finalized
MANAGEMENT_DECISION_DRAFT     -> Annual Decision Draft
MANAGEMENT_DECISION_SUBMITTED -> Annual Decision Submitted
ANNUAL_FINALIZED              -> Annual Finalized
VISIBILITY_ENABLED            -> Visibility Enabled
COMMUNICATION_READY           -> Communication Ready
COMMUNICATION_SENT            -> Communication Sent
```

Avoid showing “Quarter Finalized” because it is confusing for `H1/H2` and `Y1` cycles.

## Locked UI Messages

When annual decision is not editable, show a specific reason.

Examples:

```txt
Waiting for H2 manager review to be submitted.
Waiting for all terms to be finalized.
All terms are finalized. Appraisal window opens on 30/04/2027.
Annual decision is already submitted.
Annual decision is finalized and must be reopened before editing.
```

Avoid generic messages like:

```txt
Available actions: None
```

unless accompanied by a clear reason.

## Implementation Checklist

Backend:

- Rename workflow enums to term-based values while keeping existing collections and field names.
- Add or reuse a shared helper for finalized term states.
- After term finalization, run annual assignment rollup.
- Ensure manager review submit audits both review submission and term finalization.
- Ensure annual decision summary and list APIs expose:
  - term completion progress
  - appraisal window status
  - available actions
  - final decision status
- Ensure annual decision save/submit/freeze validates all gates.

Frontend:

- Display `TERM_FINALIZED` as `Term Finalized`.
- Display `ALL_TERMS_FINALIZED` as `All Terms Finalized`.
- Show Q/H/Y terms as assessment terms, not always quarters.
- Annual decision UI should unlock only when backend `availableActions` allows it and appraisal window is open.
- Locked annual decision UI should show exact reason.

Testing:

- Quarterly: finalize Q1 only, annual decision remains locked.
- Quarterly: finalize Q1-Q4, annual decision becomes ready when appraisal window opens.
- Half-yearly: finalize H1 only, annual decision remains locked.
- Half-yearly: finalize H1-H2, annual decision becomes ready when appraisal window opens.
- Yearly: finalize Y1, annual decision becomes ready when appraisal window opens.
- Manager review submit auto-finalizes term.
- Admin manual finalize still works for stuck terms.
- Reopen finalized term blocks annual decision again if not all terms remain finalized.
- Annual decision save/submit/freeze still follows existing permission and validation rules.

## Task Phases

### Phase 1: Enum and Shared Workflow Helpers

Goal: move workflow state naming to term-based enums without changing collection or field names.

Tasks:

- Update PMS workflow enums:
  - `QUARTER_FINALIZED` -> `TERM_FINALIZED`
  - `ALL_QUARTERS_FINALIZED` -> `ALL_TERMS_FINALIZED`
- Keep collection and field names unchanged:
  - `quarter_assignments`
  - `quarter_reviews`
  - `quarterCode`
  - `quarterState`
- Add or update shared helpers:
  - `isTermFinalized(state)`
  - `FINALIZED_TERM_STATES = [TERM_FINALIZED, CLOSED_BY_ADMIN]`
  - `isAllTermsFinalized(state)`
- Replace direct finalized-state checks with helpers wherever practical.
- Update workflow transition config to use `TERM_FINALIZED`.
- Update annual workflow config to use `ALL_TERMS_FINALIZED`.

Validation:

- Backend build passes.
- No remaining active logic depends on old finalized enum names except any intentional temporary compatibility handling.

### Phase 2: Manager Review Finalization and Annual Rollup

Goal: manager review submission should complete the term and roll up the parent annual assignment when all terms are complete.

Tasks:

- Ensure manager review submit validates all required review inputs.
- After successful submit, transition:

```txt
MANAGER_REVIEW_OPEN
-> MANAGER_REVIEW_SUBMITTED
-> TERM_FINALIZED
```

- Audit both:
  - `MANAGER_REVIEW_SUBMITTED`
  - `TERM_FINALIZED`
- Add or reuse one annual rollup helper:

```txt
rollupAnnualAssignmentIfAllTermsFinalized(annualAssignmentId)
```

- Rollup helper must:
  - load active term assignments for the annual assignment
  - filter by `annualAssignment.applicableQuarters`
  - confirm all applicable terms are `TERM_FINALIZED` or `CLOSED_BY_ADMIN`
  - set `annualState = ALL_TERMS_FINALIZED`
  - keep `finalDecisionStatus = DRAFT` unless already beyond draft
  - avoid moving annual assignment backward

- Call rollup helper from:
  - manager review submit auto-finalization
  - admin manual finalization
  - workflow sync finalization path
  - future bulk/correction finalization paths where applicable

Validation:

- Q1 finalized alone does not unlock annual decision.
- Q1-Q4 finalized rolls annual assignment to `ALL_TERMS_FINALIZED`.
- H1-H2 finalized rolls annual assignment to `ALL_TERMS_FINALIZED`.
- Y1 finalized rolls annual assignment to `ALL_TERMS_FINALIZED`.

### Phase 3: Annual Decision Gate and API Consistency

Goal: annual decision should unlock only when all term and appraisal-window gates pass, and APIs should expose clear readiness.

Tasks:

- Annual decision save/submit/freeze must validate:

```txt
annualState = ALL_TERMS_FINALIZED
AND all applicable terms are TERM_FINALIZED or CLOSED_BY_ADMIN
AND appraisal window is open
AND finalDecisionStatus allows the requested action
```

- Annual decision list and summary APIs should return:
  - term completion progress
  - appraisal window status
  - final decision status
  - available actions
  - locked/unavailable reason where possible
- Preserve computed appraisal window behavior:

```txt
appraisalWindowConfig + current date
```

- Do not require persisted `APPRAISAL_WINDOW_OPEN` unless an existing workflow path already uses it.

Validation:

- Annual decision remains locked before all terms finalize.
- Annual decision remains locked if appraisal window is closed.
- Annual decision unlocks when all terms finalize and appraisal window opens.
- Save draft, submit, freeze, visibility update still follow existing permissions.

### Phase 4: Frontend Labels, Readiness, and User Messaging

Goal: UI should use term language consistently and explain locked states clearly.

Tasks:

- Replace user-facing “Quarter Finalized” wording with “Term Finalized”.
- Replace user-facing “All Quarters Finalized” wording with “All Terms Finalized”.
- Show Q/H/Y as assessment terms, not always quarters.
- Update status display mappings:
  - `TERM_FINALIZED` -> `Term Finalized`
  - `ALL_TERMS_FINALIZED` -> `All Terms Finalized`
- Annual decision UI should use backend `availableActions` and appraisal window status.
- When annual decision is locked, show specific reason:
  - waiting for term finalization
  - waiting for appraisal window
  - decision already submitted/finalized
  - reopen required before editing
- Avoid showing only `Available actions: None` without explanation.

Validation:

- Quarterly, half-yearly, and yearly cycles all show term-based wording.
- Annual decision modal/list explains why actions are disabled.
- No UI screen shows old raw finalized enum wording.

### Phase 5: Regression, Data Cleanup, and UAT Verification

Goal: verify the full workflow end-to-end for all cycle types before moving further.

Tasks:

- Clean or reseed old non-live records if needed.
- Use the public UAT verification endpoints before manual DB cleanup.
- Run backend build.
- Run frontend targeted validation where possible.
- Test full Quarterly flow:
  - Q1 finalized only: annual decision locked
  - Q1-Q4 finalized: annual decision ready when appraisal window opens
- Test full Half-Yearly flow:
  - H1 finalized only: annual decision locked
  - H1-H2 finalized: annual decision ready when appraisal window opens
- Test full Yearly flow:
  - Y1 finalized: annual decision ready when appraisal window opens
- Test exception flows:
  - admin manual finalize
  - admin reopen finalized term
  - reopened term blocks annual decision if all terms are no longer finalized
  - workflow sync does not move invalid states
- Verify audit trails for:
  - manager review submitted
  - term finalized
  - annual assignment rolled to all terms finalized
  - annual decision draft/submitted/finalized

Implemented UAT routes:

```txt
GET  /public/pms/term-flow/verify
POST /public/pms/term-flow/verify
GET  /public/pms/term-flow/enum-cleanup
POST /public/pms/term-flow/enum-cleanup
```

Supported filters:

```json
{
  "cycleId": "...",
  "annualAssignmentId": "...",
  "quarterAssignmentId": "...",
  "templateId": "...",
  "limit": 200,
  "dryRun": true
}
```

`/term-flow/verify` checks:

- active annual assignments in the selected scope
- applicable term records for Q/H/Y cycles
- missing term assignment records
- non-finalized term records
- annual assignments marked ready when terms are not finalized
- finalized terms where the annual assignment did not roll up
- legacy enum values still present in core workflow collections

`/term-flow/enum-cleanup` replaces old non-live enum values:

```txt
QUARTER_FINALIZED      -> TERM_FINALIZED
ALL_QUARTERS_FINALIZED -> ALL_TERMS_FINALIZED
PMS_QUARTER_FINALIZED  -> PMS_TERM_FINALIZED
```

Cleanup is dry-run by default. To execute cleanup:

```json
{
  "dryRun": false
}
```

Use scoped filters whenever possible during UAT:

```json
{
  "templateId": "...",
  "dryRun": false
}
```

Exit criteria:

- Q/H/Y flows complete without manual admin finalization in the normal manager-review path.
- Annual decision unlocks only at the correct time.
- Admin remains exception handler, not a mandatory term reviewer.
- UI and API consistently use term-based workflow language.
