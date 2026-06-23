# Employee Work Update Implementation Plan

## 1. Purpose

Employee Work Update is a template-controlled, employee-filled information section inside the existing Employee Achievement Submission stage.

It is not Self Review, Self Rating, Self Evaluation, or scoring input.

The purpose is to let the employee share extra work context for the term, such as:

- delivery confidence
- challenges faced
- support needed
- additional work done outside objectives
- training or certification context
- process confirmations
- evidence or attachment references
- general remarks

This information is shown later to Manager, Admin, Management, or Annual Decision users only as read-only review context based on permissions.

Employee Work Update must never directly change objective score, term score, weightage, rating, or annual score.

## 2. PMS Business Shape

The PMS flow should have two employee input areas during Employee Achievement Submission.

### 2.1 Achievement Against Objectives

This is objective-linked and remains the primary flow.

For each approved objective, the employee can submit what was achieved.

Example:

```text
Objective: NodeJS
Achievement: Completed backend API migration and NodeJS certification.
Employee Self Rating: 4/5
Self-rating Comments: Delivered planned work with minor deployment delay.
Evidence: Certificate link / PR link / uploaded file
```

This belongs to the specific objective.

### 2.2 Employee Work Update

This is term-assignment-level context from the locked template version.

It is not tied to one objective unless a future phase explicitly adds objective-linking for these fields.

Example:

```text
Problem Solving: Good
Delivery Confidence: Medium
Challenges Faced: API dependency delay from another team
Support Needed: DevOps support for deployment automation
Additional Remarks: Helped another project with MongoDB query optimization
```

This is configured by Admin in the template and filled by the employee during achievement submission.

## 3. Final Business Rules

Employee Work Update is optional at template configuration level.

If enabled, Admin can define one or more questions inside the Employee Achievement Submission section.

Individual questions can be required for final submit.

Employees can save draft during `EMPLOYEE_ACHIEVEMENT_OPEN`.

Employees can submit once during `EMPLOYEE_ACHIEVEMENT_OPEN`.

After submit, the submission is locked.

Manager, Admin, Management, and Director can view submitted values only according to backend permissions.

Manager cannot edit Employee Work Update.

Admin cannot edit employee-submitted Employee Work Update in this phase.

If employee does not submit before Manager Review opens, the UI shows `Not submitted` as derived display state.

No fake submission record should be created for not-submitted cases.

No new workflow state should be added for not-submitted cases.

## 4. Explicit Non-Goals

Do not call this Self Review, Self Rating, or Self Evaluation.

Do not add new term workflow states.

Do not add backend statuses such as `MISSED`, `NOT_SUBMITTED`, `ACHIEVEMENT_DRAFT`, or `ACHIEVEMENT_SUBMITTED`.

Do not auto-submit on behalf of the employee.

Do not create fake submission data when the employee does nothing.

Do not include Employee Work Update fields in scoring.

Do not depend on section display label.

Do not use latest template version for assigned employees.

Do not allow frontend-only permission enforcement.

Do not allow correction/edit after final submit in this phase.

## 5. Existing Workflow States

Use existing term workflow states.

Relevant states:

```ts
EMPLOYEE_ACHIEVEMENT_OPEN
MANAGER_REVIEW_OPEN
MANAGER_REVIEW_SUBMITTED
TERM_FINALIZED
```

Employee Work Update is available only during:

```ts
EMPLOYEE_ACHIEVEMENT_OPEN
```

After this stage, values are read-only if submitted.

If not submitted, show derived `Not submitted`.

Recommended derived helper:

```ts
const hasSubmittedOrLockedEmployeeAchievementSubmission =
  ["SUBMITTED", "LOCKED"].includes(submission?.status);

const isEmployeeWorkUpdateNotSubmitted =
  ["MANAGER_REVIEW_OPEN", "MANAGER_REVIEW_SUBMITTED", "TERM_FINALIZED"].includes(termState)
  && !hasSubmittedOrLockedEmployeeAchievementSubmission;
```

Avoid string or enum order comparison such as:

```ts
termState >= MANAGER_REVIEW_OPEN
```

## 6. Existing Submission Statuses

Use existing Employee Achievement Submission statuses only.

```ts
DRAFT
SUBMITTED
LOCKED
```

Recommended behavior:

```ts
Save Draft => DRAFT
Final Submit => LOCKED
```

If the existing backend uses `SUBMITTED` before `LOCKED`, follow the current implementation pattern. Do not invent a new status.

## 7. Template Configuration

Admin configures Employee Work Update inside the Employee Achievement Submission section.

Friendly toggle label:

```text
Ask employee additional work update questions
```

Helper text:

```text
Use this to ask employees for extra work details during achievement submission. These answers are for information only and are not used for score.
```

Use stable metadata identity.

Section metadata:

```ts
section.metadata.purpose = "EMPLOYEE_ACHIEVEMENT_SUBMISSION"
```

Fallback section key:

```ts
sectionKey === "employee_achievement_submission"
```

Do not depend on display labels because Admin may rename the section.

Examples of allowed labels:

```text
Employee Work Update
Achievement Update
Work Progress Details
Employee Progress Details
```

## 8. Template Metadata

Recommended version or section metadata:

```ts
metadata: {
  employeeWorkUpdateEnabled: true,
  employeeWorkUpdateRequired: false,
  lockAfterSubmit: true,
  singleSubmitOnly: true,
  managerCanEditEmployeeWorkUpdate: false
}
```

Recommended separation:

```ts
employeeWorkUpdateEnabled
employeeWorkUpdateRequired
achievementDetailsRequired
lockAfterSubmit
singleSubmitOnly
managerCanEditEmployeeWorkUpdate
```

Do not mix section-level required configuration with field-level required configuration.

## 9. Field Configuration

Employee Work Update questions are normal template fields inside the Employee Achievement Submission section.

Each field must be marked with stable metadata:

```ts
field.metadata = {
  purpose: "EMPLOYEE_WORK_UPDATE",
  linkedToObjective: false,
  includeInScore: false,
  lockAfterSubmit: true
}
```

Field scoring must always be disabled:

```ts
field.scoringIncluded = false
field.metadata.includeInScore = false
field.fieldCategory !== "SCORING"
```

Allowed field types:

```text
Dropdown
Radio
Checkbox
Textarea
Short text
Date
Attachment
Data grid, only if genuinely needed
```

Example dropdown field:

```ts
{
  key: "problem_solving",
  label: "Problem Solving",
  type: "select",
  required: false,
  scoringIncluded: false,
  options: [
    { label: "Good", value: "GOOD" },
    { label: "Average", value: "AVERAGE" },
    { label: "Poor", value: "POOR" }
  ],
  metadata: {
    purpose: "EMPLOYEE_WORK_UPDATE",
    linkedToObjective: false,
    includeInScore: false,
    lockAfterSubmit: true
  }
}
```

Example textarea field:

```ts
{
  key: "support_needed",
  label: "Support Needed",
  type: "textarea",
  required: false,
  scoringIncluded: false,
  metadata: {
    purpose: "EMPLOYEE_WORK_UPDATE",
    linkedToObjective: false,
    includeInScore: false,
    lockAfterSubmit: true
  }
}
```

## 10. Backend Schema Requirement

The PMS template field model must persist field metadata.

Required backend model support:

```ts
ITemplateField.metadata?: Record<string, unknown>
```

Required schema support:

```ts
metadata: Schema.Types.Mixed
```

This is required because Employee Work Update depends on field-level stable identity.

Create, update, clone, activate, and resolve flows must preserve:

- section metadata
- field metadata
- scoring guardrail metadata
- field options
- field required settings
- visibility and editability rules

## 11. Template Validation

Before template activation, backend should validate:

- Employee Work Update fields are inside the Employee Achievement Submission section.
- Employee Work Update fields are not scoring fields.
- `scoringIncluded` is false.
- `metadata.includeInScore` is false.
- `fieldCategory` is not scoring.
- dropdown, radio, and checkbox fields have valid options.
- required fields are editable by Employee during `EMPLOYEE_ACHIEVEMENT_OPEN`.
- Manager, Admin, Management, and Director access is read-only unless explicitly permitted for view.
- section stable purpose exists even if display label changes.
- template clone and version APIs preserve metadata.

## 12. Assignment and Locked Version Rule

No separate questionnaire assignment is needed.

During cycle launch or employee assignment:

- Annual Assignment stores selected template version.
- Assigned template version is locked.
- Employee Work Update availability comes only from the locked assigned template version.
- Future template edits must not affect already assigned employees.
- Historical rendering must use the locked assigned template version, not the latest active template.

## 13. Employee Achievement Submission Page

When term reaches `EMPLOYEE_ACHIEVEMENT_OPEN`, Employee Achievement Submission page should show two clear areas.

```text
1. Achievements Against Objectives
2. Employee Work Update
```

### 13.1 Achievements Against Objectives

This contains existing objective-linked achievement rows.

Helper text:

```text
Update what you achieved against your approved objectives for this term.
```

Employee can submit:

- achievement against each objective
- self rating per objective, if enabled
- self-rating comments per objective, if enabled
- employee remarks or outcome
- evidence or attachment, if supported

### 13.2 Employee Work Update

This contains template-defined questions.

Helper text:

```text
Share extra work details, challenges, support needed, or evidence. This is for information only and is not used for score.
```

Employee can save draft while the term is `EMPLOYEE_ACHIEVEMENT_OPEN`.

Draft can be incomplete.

Employee can edit only own draft.

Manager cannot edit draft.

Admin cannot edit employee draft from standard flow.

## 14. Draft Save Rules

Draft save must validate only basic safety rules:

- employee owns the assignment
- term is `EMPLOYEE_ACHIEVEMENT_OPEN`
- submission is not locked
- submitted field keys belong to the locked assigned template version
- field values match field type where practical
- Employee Work Update fields are not scoring fields
- write permissions allow Employee to edit during this stage

Draft save must not:

- require all mandatory fields
- trigger workflow transition
- lock the submission
- calculate score

Store Employee Work Update draft answers in:

```ts
EmployeeAchievementSubmission.achievementValues
```

Example draft answer:

```ts
{
  fieldKey: "delivery_confidence",
  sectionKey: "employee_achievement_submission",
  roleCode: "EMPLOYEE",
  valueText: "MEDIUM",
  valueStatus: "DRAFT"
}
```

## 15. Submit Rules

Employee submit should lock the full Employee Achievement Submission for the term.

Recommended button text:

```text
Submit Achievement Update
```

Avoid button text that implies only the Work Update is submitted, because the existing design locks the whole achievement submission.

Backend validates:

- employee owns the assignment
- term is still `EMPLOYEE_ACHIEVEMENT_OPEN`
- submission is not already locked
- required objective achievement rows are present, if configured
- required Employee Work Update fields are answered
- dropdown, radio, and checkbox values match template options
- submitted fields belong to locked assigned template version
- submitted fields are not scoring fields
- field permissions allow Employee submit in this stage

On success:

```ts
status = "LOCKED"
submittedBy = employeeId
submittedAt = now
lockedAt = now
```

After submit:

- employee cannot edit
- manager cannot edit
- admin cannot edit through standard flow
- management and director cannot edit
- values are read-only

No correction flow is included in this phase.

## 16. Not Submitted Behavior

If Manager Review opens and the employee did not submit:

- do not auto-submit
- do not create fake values
- do not create `MISSED`
- do not create `NOT_SUBMITTED`
- do not create a new workflow state

UI derives and displays:

```text
Not submitted
```

Message:

```text
The employee did not submit a work update before Manager Review opened.
```

This is display/runtime logic only.

## 17. Manager Review View

When term reaches `MANAGER_REVIEW_OPEN`, Manager Review page should show Employee Work Update as read-only context.

Manager can see:

- achievement details against objectives, if submitted
- objective-wise employee self rating/comments, if enabled and submitted
- Employee Work Update answers, if submitted
- attachments/evidence, if submitted
- submitted timestamp
- `Not submitted` if no submitted or locked record exists

Manager cannot edit employee answers.

Manager fills separate Manager Review fields:

- manager rating
- manager comments
- objective assessment
- competency assessment
- development observations
- recommendations
- final term review fields

Scoring comes only from manager review/scoring fields configured in the template.

Employee Work Update remains information-only.

## 18. Annual Decision View

Annual Decision screen may show Employee Work Update as read-only reference.

Possible display items:

- work summary
- challenges faced
- support requested
- evidence attachments
- additional remarks
- not submitted indicator

Annual Decision users can view it only based on backend permission and visibility rules.

Annual score remains:

```ts
annualScore = rollup(termScores, annualScoringConfig)
```

Employee Work Update answers must not be stored as Annual Decision values.

Employee Work Update answers must not change annual score formula.

## 19. Objective Detail View

Objective detail pages should continue to show objective-specific information first.

For each objective, show:

- objective title
- KPI / measurement
- target value
- due date
- success criteria
- employee achievement against that objective
- employee self rating/comments for that objective, if enabled
- manager review for that objective, if configured

Employee Work Update is not objective-specific.

If useful, objective detail can show a separate term-level read-only card:

```text
Employee Work Update for this term
```

This card should be clearly separated from the current objective so users do not think it affects objective score.

## 20. Permissions and Visibility

Backend must enforce all permissions.

Frontend can improve UX, but cannot be the source of truth.

Rules:

- Employee can edit during `EMPLOYEE_ACHIEVEMENT_OPEN` before submit.
- Employee can view read-only after submit.
- Manager can view read-only during Manager Review.
- Management can view read-only during Annual Decision if permitted.
- Director can view read-only if hierarchy and visibility rules permit.
- Admin can configure template fields.
- Admin can view submitted employee data if permission allows.
- Admin cannot directly edit submitted employee data in this phase.
- Hidden fields must not be returned in unauthorized API responses.
- Read-only fields must reject write attempts.

## 21. Storage Design

Use existing collection/model:

```ts
EmployeeAchievementSubmission
```

Objective-linked achievement rows:

```ts
achievementItems
```

Employee Work Update answers:

```ts
achievementValues
```

Recommended value storage:

```ts
valueText    // text, textarea, dropdown, radio
valueNumber  // number or percentage, if supported
valueDate    // date fields
valueJson    // multiselect, attachment, grid, complex values
```

Example submitted answer:

```ts
{
  fieldKey: "support_needed",
  sectionKey: "employee_achievement_submission",
  roleCode: "EMPLOYEE",
  actorUserId: employeeId,
  workflowStage: "EMPLOYEE_ACHIEVEMENT_OPEN",
  valueText: "Need DevOps support for deployment automation",
  valueStatus: "ACTIVE",
  submittedAt: now
}
```

## 22. Scoring Guardrails

Employee Work Update must never be included in:

- objective score
- term score
- annual score
- weightage rollup
- rating calculation
- manager review score calculation

Scoring service must ignore fields where:

```ts
field.metadata.purpose === "EMPLOYEE_WORK_UPDATE"
```

or:

```ts
field.metadata.includeInScore === false
```

Backend should reject scoring configuration for Employee Work Update fields during template activation.

## 23. API and Backend Implementation Areas

Required backend work:

- persist template field metadata
- preserve metadata in create/update/clone/activate/resolve flows
- extend Employee Achievement Submission draft save API
- extend Employee Achievement Submission submit API
- validate fields against locked assigned template version
- validate required fields only on submit, not draft
- validate dropdown/radio/checkbox options
- enforce single submit and lock behavior
- prevent manager/admin/annual edits
- return Employee Work Update values to Employee, Manager Review, and Annual Decision screens based on permissions
- ensure scoring services ignore Employee Work Update fields
- ensure workflow sync does not auto-submit or create fake values
- implement derived not-submitted display logic in response or frontend helper
- add audit events for save, submit, lock, blocked edit, invalid value, and scoring guardrails

Important current-code note:

The existing achievement submission validation currently allows only the main achievement items field in `achievementValues`. It must be extended to also allow fields from the locked template version where:

```ts
field.metadata.purpose === "EMPLOYEE_WORK_UPDATE"
```

## 24. Frontend Implementation Areas

Required frontend work:

- Template Builder toggle and question builder
- hide or lock scoring controls for Employee Work Update fields
- Employee Achievement Submission dynamic field rendering
- draft save and submit support
- locked/read-only state after submit
- derived `Not submitted` state after Manager Review opens
- Manager Review read-only display
- Annual Decision read-only display
- friendly helper text and badges
- clear separation between employee update and manager scoring
- no technical metadata shown in UI

## 25. Audit Requirements

Audit these events:

- draft saved
- final submit
- submission locked
- blocked edit after submit
- blocked edit after term moved forward
- blocked invalid field value
- blocked unauthorized edit
- blocked scoring configuration for Employee Work Update fields
- template activation rejected due to invalid Employee Work Update configuration
- template metadata preserved during clone/versioning, if this is already audited elsewhere

Audit record should capture:

- actor
- role
- action
- assignment
- term
- previous value where applicable
- new value where applicable
- timestamp
- reason where applicable

Derived `Not submitted` display does not require a separate audit event unless the system already audits stage transition checks.

## 26. Testing Checklist

### 26.1 Template Builder

- Admin enables Employee Work Update.
- Admin adds dropdown, textarea, checkbox, date, and attachment fields.
- Activation fails if scoring is enabled for Employee Work Update.
- Activation fails if dropdown/radio has no options.
- Template clone preserves metadata.
- Template activation preserves metadata.
- Assigned employees use locked template version.

### 26.2 Employee Flow

- Employee saves incomplete draft.
- Employee edits draft during `EMPLOYEE_ACHIEVEMENT_OPEN`.
- Employee submits valid achievement and work update.
- Employee cannot edit after submit.
- Employee cannot submit after Manager Review opens.
- Employee cannot submit another employee assignment.
- Objective-wise achievement and Employee Work Update both save correctly.

### 26.3 Not Submitted

- No submission exists.
- Term moves to `MANAGER_REVIEW_OPEN`.
- UI shows `Not submitted`.
- No fake submission is created.
- No `MISSED` or `NOT_SUBMITTED` status is stored.

### 26.4 Manager Review

- Manager sees submitted answers read-only.
- Manager sees `Not submitted` if no submission exists.
- Manager cannot edit employee answers.
- Manager review scoring works separately.
- Employee Work Update does not affect score.

### 26.5 Annual Decision

- Annual user sees read-only Employee Work Summary if permitted.
- Annual user does not see hidden fields if not permitted.
- Annual score remains rollup of term scores only.

### 26.6 Security

- Hidden fields are not returned by API.
- Read-only fields reject write attempts.
- Unauthorized users cannot view or edit.
- Scoring payload rejects Employee Work Update field IDs.

### 26.7 Audit

- Draft saved audit.
- Submit audit.
- Lock audit.
- Blocked edit audit.
- Invalid value audit.
- Unauthorized edit audit.

## 27. Phase-Wise Implementation Plan

### Phase 1: Backend Foundation

Goal: make the data model capable of safely storing Employee Work Update configuration.

Work:

- Add `metadata` to PMS template field interface and schema.
- Confirm metadata is preserved in create/update/clone/activate/resolve APIs.
- Add backend helpers to identify Employee Achievement Submission section by stable purpose/key.
- Add backend helpers to identify Employee Work Update fields by metadata purpose.
- Add template activation validation for Employee Work Update guardrails.

Done when:

- template field metadata survives save, clone, activation, and resolution.
- scoring-enabled Employee Work Update fields are rejected.

### Phase 2: Template Builder UI

Goal: let Admin configure information-only Employee Work Update fields without exposing technical metadata.

Work:

- Add `Employee Achievement Submission` as a first-class Add Section option.
- Auto-create the stable achievement section key `employee_achievement_submission`.
- Auto-create the stable objective-linked achievement data grid field `achievement_items`.
- Add toggle: `Ask employee additional work update questions`.
- Add question builder under Employee Achievement Submission.
- Support field types: dropdown, radio, checkbox, textarea, short text, date, attachment.
- Hide or lock scoring controls for these fields.
- Store stable field metadata automatically.
- Show friendly helper text and scoring guardrail message.

Done when:

- Admin can configure Work Update questions.
- The saved template includes correct metadata.
- Admin cannot accidentally make these fields scoreable.

### Phase 3: Employee Draft and Submit Backend

Goal: allow employee values to be saved and submitted using existing Employee Achievement Submission storage.

Work:

- Extend draft save API to accept Employee Work Update fields in `achievementValues`.
- Extend submit API to validate required Work Update fields.
- Validate field keys against locked assigned template version.
- Validate dropdown/radio/checkbox values against options.
- Keep draft validation relaxed.
- Lock full submission on submit.
- Prevent edit after lock.
- Add audit events.

Done when:

- Employee can save incomplete draft.
- Employee can submit valid values.
- Invalid/unauthorized fields are rejected.
- Submitted record is locked.

### Phase 4: Employee Achievement Page UI

Goal: show a clear, user-friendly employee flow.

Work:

- Split page into:
  - Achievements Against Objectives
  - Employee Work Update
- Render dynamic Work Update fields from locked assigned template version.
- Add Save Draft support.
- Add Submit Achievement Update support.
- Show read-only state after submit.
- Show validation errors only on submit for required fields.

Done when:

- Employee can fill objective-wise achievements.
- Employee can fill template-level Work Update.
- Both are saved in the same submission flow.
- The UI clearly says Work Update is information-only.

### Phase 5: Manager Review Read-Only Display

Goal: give manager useful context without mixing it into manager scoring.

Work:

- Show Employee Work Update as read-only card in Manager Review.
- Show submitted timestamp if available.
- Show `Not submitted` if Manager Review opened and no submission exists.
- Keep Manager Review scoring fields visually separate.
- Ensure manager cannot edit employee values.

Done when:

- Manager sees employee context if submitted.
- Manager sees clear not-submitted state otherwise.
- Manager review scoring remains separate.

### Phase 6: Admin, Management, and Annual Decision Read-Only Display

Goal: expose submitted context to later-stage users only when permissions allow.

Work:

- Show Employee Work Summary in Annual Decision if permitted.
- Respect backend visibility and hierarchy rules.
- Keep values read-only.
- Ensure hidden fields are not returned by API.
- Ensure annual score ignores Work Update values.

Done when:

- Annual/management users see only allowed fields.
- Annual score remains unchanged by Employee Work Update.

### Phase 7: Objective Detail Context

Goal: make objective detail pages clear without confusing objective-linked data and term-level Work Update.

Work:

- Show objective-specific achievement against each objective.
- Show employee self rating/comments per objective if enabled.
- Optionally show separate term-level Employee Work Update summary card.
- Label the Work Update card clearly as term-level context.

Done when:

- Users can understand what belongs to the objective and what belongs to the term.

### Phase 8: Hardening and QA

Goal: make the feature safe for production.

Work:

- Add backend validation tests.
- Add frontend interaction checks.
- Test locked assigned template version behavior.
- Test no-submit behavior.
- Test permissions.
- Test scoring guardrails.
- Run backend build and targeted frontend checks.

Done when:

- No scoring path reads Employee Work Update fields.
- No unauthorized user can read or write hidden/read-only fields.
- No fake not-submitted records are created.
- Existing objective achievement flow still works.

Phase 8 implementation notes:

- Added scoring-layer guardrails so Employee Work Update fields and fields marked `metadata.includeInScore = false` are ignored even if a stale or malformed config includes them in `scoringFields`.
- Added audit logging for blocked draft/submit validation failures in Employee Achievement Submission.
- Added a focused scoring regression test for Employee Work Update scoring exclusion.
- Verified backend TypeScript build.
- Focused regression test passed. The broader existing scoring test file still has unrelated historical expectation failures in objective bucket scoring and annual rollup.
