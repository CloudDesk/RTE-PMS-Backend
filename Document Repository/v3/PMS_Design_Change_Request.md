# PMS Design Change Request: Configurable Section Timing and Manager Review Timing

## 1. Purpose

This document captures the latest PMS enhancement request and proposes a dynamic, backward-compatible design approach.

The enhancement is to support PMS templates where different sections can be completed at different frequencies, and Manager Review timing can be configured independently from employee input timing.

Manager Review should not be limited to only term-wise or only annual review. The system should support configurable review timing such as:

* manager reviews every assessment term
* manager reviews grouped terms, such as H1 reviewing Q1 + Q2 and H2 reviewing Q3 + Q4
* manager reviews once annually after all applicable employee inputs are complete
* future custom review groupings where required
* yearly Annual Decision opens only after all applicable input terms are finalized/closed and all required Manager Review instances are submitted/finalized.

This document covers:

* client request
* existing approved PMS flow
* existing system support
* additional configuration required
* proposed dynamic solution
* workflow impact
* template builder changes
* runtime rendering approach
* data design recommendation
* validation rules
* UI approach
* system impact
* backward compatibility
* approval points

---

## 2. Client Request

The client wants to configure PMS templates where employee input sections and manager review sections can follow different completion frequencies.

Example requirement:

```text
Employee input can be filled quarterly / term-wise.
Manager Review can be configured term-wise, half-yearly/grouped, or annual.
Annual Decision should remain yearly and should happen only after the configured Manager Review requirement is complete.
```

Example 1: Quarterly employee input with annual manager review

```text
Q1 - Employee fills term-level section
Q2 - Employee fills term-level section
Q3 - Employee fills term-level section
Q4 - Employee fills term-level section

After all applicable terms are completed:
Manager fills one Annual Manager Review covering Q1 + Q2 + Q3 + Q4

After Manager Review:
HR/Admin completes Annual Decision
```

Example 2: Quarterly employee input with half-yearly manager review

```text
Q1 - Employee fills term-level section
Q2 - Employee fills term-level section

H1 Manager Review opens and must show Q1 + Q2 employee-filled data.

Q3 - Employee fills term-level section
Q4 - Employee fills term-level section

H2 Manager Review opens and must show Q3 + Q4 employee-filled data.

After all configured Manager Reviews are complete:
HR/Admin completes Annual Decision
```

This means Manager Review is a configurable review layer over one or more employee input terms. It is not always required inside every assessment term.

Annual Decision remains the current yearly implementation for this phase. It is not proposed as a configurable timing layer in Phase 1.

---

## 3. Existing Approved PMS Flow

The current PMS flow was designed based on the previously confirmed requirement where Manager Review happens at each applicable assessment term.

The current approved flow is:

```text
Template Version
↓
Cycle / Assessment Terms
↓
Annual Assignment
↓
Term Assignment / Term Content
↓
Employee / Manager actions per term
↓
Term Finalization
↓
Annual Appraisal Decision
```

In this flow:

* Template Version controls form structure, sections, fields, permissions, scoring, visibility, and workflow-stage behavior.
* Cycle controls assessment term type, term dates, windows, and finalization periods.
* Annual Assignment controls employee, manager, cycle, locked template version, applicable terms, term workflow status, and final annual decision status.
* Term content controls term-wise objectives, employee input, achievement submission if enabled, manager review, status, attachments, and audit history.

Current regular term-wise review flow:

```text
Q1 Employee Input / Objective / Achievement
↓
Q1 Manager Review
↓
Q1 Finalization

Q2 Employee Input / Objective / Achievement
↓
Q2 Manager Review
↓
Q2 Finalization

Q3 Employee Input / Objective / Achievement
↓
Q3 Manager Review
↓
Q3 Finalization

Q4 Employee Input / Objective / Achievement
↓
Q4 Manager Review
↓
Q4 Finalization

After all applicable terms are finalized:
Annual Appraisal Decision
```

This existing flow is valid for the regular PMS use case and should continue to remain supported.

---

## 4. Existing System Support

The current PMS architecture already supports several required foundations for this enhancement.

Existing support includes:

* Template Builder
* Template Versioning
* Locked Template Version per assignment
* Dynamic sections and fields
* Role-wise visibility
* Role-wise editability
* Field-level permissions
* Section-level permissions
* Workflow-state based rendering
* Scoring configuration
* Runtime rendering from template metadata
* Assessment term support:
  * Quarterly: Q1, Q2, Q3, Q4
  * Half-yearly: H1, H2
  * Yearly: Y1
* Annual Assignment
* Term content / Term Assignment structure
* Annual Decision after all applicable terms are finalized or closed
* Visibility Governance
* Audit tracking

The foundation is available. The required change is to add a flexible Manager Review timing configuration and workflow gating around review completion.

---

## 5. Additional Configuration Required

The current implementation supports the approved term-wise Manager Review flow.

To support the newly discussed review patterns, Manager Review timing must become configurable.

This should be treated as a new enhancement, not as a correction to the existing PMS flow.

The system should support:

```text
1. Term-wise Manager Review
2. Grouped Manager Review
3. Annual Manager Review
4. Future custom review grouping
```

The existing flow should remain the default behavior.

```text
Default Review Timing = Term-wise Manager Review
```

Non-term-wise Manager Review should apply only when HR/Admin explicitly selects it in the template configuration.

---

## 6. Proposed Dynamic Solution

Introduce configurable review timing at the template flow-policy level and configurable section timing at the section level.

The design should not be hardcoded for one client template.

The recommended design is:

```text
Template flowPolicy controls Manager Review timing.
Section metadata controls section execution level.
Review grouping controls which employee input terms are visible in each Manager Review.
Runtime rendering controls what appears for each role and workflow state.
Workflow engine controls when term completion, grouped manager review, annual review, and annual decision can happen.
```

---

## 7. Template-Level Manager Review Timing

Add Manager Review timing under the existing template `flowPolicy`.

The configurable behavior must be protected by an explicit enable flag so current templates and current assignments continue to use the existing service behavior.

Recommended default:

```ts
flowPolicy.enableConfigurableReviewFlow = false;
flowPolicy.managerReviewTiming = "TERM_WISE";
```

When `enableConfigurableReviewFlow` is missing or false, the system should follow the current existing flow:

```text
Term Review
→ Term Finalization
→ All Terms Finalized
→ Annual Decision
```

When `enableConfigurableReviewFlow` is true, the system should use the configured review groups and section timing from the locked Annual Assignment `flowPolicy` snapshot.

Recommended values:

```ts
flowPolicy.managerReviewTiming =
  | "TERM_WISE"
  | "GROUPED_TERMS"
  | "ANNUAL"
  | "CUSTOM_GROUPED"
```

### 7.1 Term-Wise Manager Review

This is the existing PMS behavior.

```text
Q1 Employee Input + Q1 Manager Review
Q2 Employee Input + Q2 Manager Review
Q3 Employee Input + Q3 Manager Review
Q4 Employee Input + Q4 Manager Review
Annual Decision
```

This option should be the default for existing and newly created full PMS templates unless HR/Admin changes it.

### 7.2 Grouped-Term Manager Review

This supports a manager review covering multiple completed employee input terms.

Example: Quarterly employee input with half-yearly manager review.

```text
Q1 Employee Input
Q2 Employee Input
H1 Manager Review covers Q1 + Q2

Q3 Employee Input
Q4 Employee Input
H2 Manager Review covers Q3 + Q4

Annual Decision
```

In this mode, Manager Review is not required inside every input term. It opens after the terms included in that review group are completed or finalized.

### 7.3 Annual Manager Review

This supports one manager review covering all applicable employee input terms.

```text
Q1 Employee Input
Q2 Employee Input
Q3 Employee Input
Q4 Employee Input
Annual Manager Review covers Q1 + Q2 + Q3 + Q4
Annual Decision
```

In this mode, Manager Review is completed at Annual Assignment level after all applicable terms are completed or finalized.

### 7.4 Custom Grouped Manager Review

This supports future cases where HR/Admin explicitly maps input terms into custom review groups.

Example:

```text
Review Group A covers Q1
Review Group B covers Q2 + Q3
Review Group C covers Q4
```

This should be optional and can be implemented after the standard grouped-term and annual review modes if needed.

---

## 8. Review Group Configuration

Manager Review timing must define which employee input terms are visible and reviewable in each manager review instance.

Recommended structure:

```ts
flowPolicy.managerReviewGroups = [
  {
    reviewGroupKey: "H1",
    reviewGroupLabel: "H1 Manager Review",
    inputTerms: ["Q1", "Q2"],
    reviewLevel: "GROUPED",
    requiredForAnnualDecision: true
  },
  {
    reviewGroupKey: "H2",
    reviewGroupLabel: "H2 Manager Review",
    inputTerms: ["Q3", "Q4"],
    reviewLevel: "GROUPED",
    requiredForAnnualDecision: true
  }
]
```

Standard mappings:

| Employee Input Term Type | Manager Review Timing | Review Groups |
|---|---|---|
| Quarterly | TERM_WISE | Q1, Q2, Q3, Q4 |
| Quarterly | GROUPED_TERMS / Half-yearly | H1 = Q1 + Q2, H2 = Q3 + Q4 |
| Quarterly | ANNUAL | Annual = Q1 + Q2 + Q3 + Q4 |
| Half-yearly | TERM_WISE | H1, H2 |
| Half-yearly | ANNUAL | Annual = H1 + H2 |
| Yearly | TERM_WISE or ANNUAL | Y1/ANNUAL |

For grouped review, the manager review screen must display employee-filled data from all terms mapped to that review group.

Example:

```text
If H1 Manager Review covers Q1 + Q2:
  Manager must see Q1 employee input, Q1 achievements, Q2 employee input, and Q2 achievements.
```

---

## 9. Section-Level Timing Configuration

Each template section should support section timing through existing section metadata.

Business UI labels:

```text
Section Timing:
- Every Input Term
- Every Manager Review Group
- Once Annually
```

### 9.1 Every Input Term

The section repeats for each applicable employee input term.

For Quarterly cycle:

```text
Q1 - Section
Q2 - Section
Q3 - Section
Q4 - Section
```

For Half-yearly cycle:

```text
H1 - Section
H2 - Section
```

For Yearly cycle:

```text
Y1 - Section
```

### 9.2 Every Manager Review Group

The section repeats for each configured manager review group.

Example:

```text
H1 Manager Review - Section covers Q1 + Q2
H2 Manager Review - Section covers Q3 + Q4
```

### 9.3 Once Annually

The section appears only once at Annual Assignment level.

Example:

```text
Annual Summary
Annual Decision
```

---

## 10. Example Section Configuration

| Section | Timing | Filled By | Notes |
|---|---|---|---|
| Employee Information | Once Annually / Static | System / HR/Admin | Can be auto-filled from employee profile |
| Objectives | Every Input Term | Employee / Manager | Based on objective policy |
| Employee Achievement Submission | Every Input Term | Employee | If enabled in template |
| Work Update | Every Input Term | Employee | Term-level progress/input section |
| Manager Review | Every Manager Review Group | Manager | Can be term-wise, grouped, or annual depending on review timing |
| Traits & Competencies | Every Manager Review Group / Once Annually | Manager | Depends on template configuration |
| Annual Decision | Once Annually | HR/Admin | Opens after eligibility is met |

This gives HR/Admin flexibility to configure which sections repeat for input terms, which sections repeat for manager review groups, and which sections appear only once annually.

---

## 11. Runtime Rendering Plan

The runtime form should render sections based on:

```text
Template Version
+ Section Timing
+ Manager Review Timing
+ Review Group Mapping
+ Role
+ Workflow State
+ Visibility Rules
+ Editability Rules
+ Applicable Input Term
+ Applicable Review Group
+ Scoring Rules
```

### 11.1 Input-Term Rendering

If a section is configured as:

```text
Section Timing = Every Input Term
```

then it should appear separately for each applicable input term.

### 11.2 Manager Review Group Rendering

If a section is configured as:

```text
Section Timing = Every Manager Review Group
```

then it should appear for each configured manager review group.

For grouped manager review, the review screen must render the input data from all mapped terms.

Example:

```text
H1 Manager Review:
  Shows Q1 employee-filled sections
  Shows Q2 employee-filled sections
  Shows H1 manager review fields
```

### 11.3 Annual-Level Rendering

If a section is configured as:

```text
Section Timing = Once Annually
```

then it should appear only once at Annual Assignment level.

---

## 12. Workflow Plan

### 12.1 Existing Flow: Term-Wise Manager Review

For templates configured with `TERM_WISE` Manager Review:

```text
OBJECTIVE_SETTING_OPEN
↓
OBJECTIVE_APPROVED
↓
EMPLOYEE_ACHIEVEMENT_OPEN, if enabled
↓
MANAGER_REVIEW_OPEN
↓
MANAGER_REVIEW_SUBMITTED
↓
TERM_FINALIZED
↓
Annual Decision after all applicable terms are finalized/closed
```

This existing flow should remain unchanged.

### 12.2 New Flow: Grouped-Term Manager Review

For templates configured with grouped Manager Review:

```text
Input terms open
↓
Employee completes required input-term sections
↓
Input terms reach existing TERM_FINALIZED / internal QUARTER_FINALIZED or CLOSED_BY_ADMIN without term-level manager review
↓
When all input terms in a review group are finalized/closed:
  Manager Review Group opens
↓
Manager submits the review group
↓
After all required review groups are submitted/finalized:
  Annual Decision opens
```

Example:

```text
Q1 + Q2 complete
↓
H1 Manager Review opens and shows Q1 + Q2 data
↓
H1 Manager Review submitted

Q3 + Q4 complete
↓
H2 Manager Review opens and shows Q3 + Q4 data
↓
H2 Manager Review submitted
↓
Annual Decision opens
```

### 12.3 New Flow: Annual Manager Review

For templates configured with annual Manager Review:

```text
Input terms open
↓
Employee completes required input-term sections
↓
All applicable input terms are TERM_FINALIZED or CLOSED_BY_ADMIN
↓
Annual Manager Review opens and shows all mapped input-term data
↓
Manager submits Annual Manager Review
↓
Annual Decision opens
```

These new flows do not introduce a new `TERM_COMPLETED` state. Input terms should still end using existing finalized states: `TERM_FINALIZED` / internal `QUARTER_FINALIZED`, or `CLOSED_BY_ADMIN` where HR/Admin closes the term by exception.

### 12.4 Required Service Rule Change

The current backend term finalization rule is aligned to the existing Term-wise Manager Review flow. It requires the term to reach `MANAGER_REVIEW_SUBMITTED` and requires a submitted `TermReview` before finalization.

For non-term-wise Manager Review timing, this rule must be made conditional.

Recommended logic:

```text
If flowPolicy.managerReviewTiming = TERM_WISE:
  Term finalization requires MANAGER_REVIEW_SUBMITTED and submitted TermReview.

If flowPolicy.managerReviewTiming = GROUPED_TERMS, ANNUAL, or CUSTOM_GROUPED:
  Term finalization should validate required input-term sections only.
  Term finalization should not require MANAGER_REVIEW_SUBMITTED.
  Term finalization should not require submitted TermReview.
```

This keeps the existing flow unchanged while allowing grouped and annual manager review patterns.

---

## 13. Manager Review Instance Status

Manager Review should be tracked separately from the existing Term Assignment state and Annual Assignment workflow state when review timing is not term-wise.

This is a new manager review instance status model to be added. These values are not existing Annual Assignment workflow enum states.

Recommended storage:

```ts
managerReviewInstances: [
  {
    reviewGroupKey: "H1",
    reviewGroupLabel: "H1 Manager Review",
    inputTerms: ["Q1", "Q2"],
    status: "NOT_STARTED" | "OPEN" | "DRAFT" | "SUBMITTED" | "FINALIZED",
    submittedBy?: string,
    submittedAt?: Date,
    finalizedAt?: Date,
    scoreSummary?: number
  }
]
```

For annual review, there may be one review instance:

```text
reviewGroupKey = ANNUAL
inputTerms = all applicable terms
```

The existing Annual Assignment workflow can continue to use the approved annual states such as:

```text
ALL_TERMS_FINALIZED
APPRAISAL_WINDOW_OPEN
MANAGEMENT_DECISION_DRAFT
MANAGEMENT_DECISION_SUBMITTED
ANNUAL_FINALIZED
```

Annual Decision should open only when:

```text
All applicable input terms are finalized/closed
AND
all required managerReviewInstances are SUBMITTED or FINALIZED
```

This keeps Manager Review and Annual Decision as separate business actions without mixing manager review statuses into the existing annual workflow enum.

---

## 14. Required Annual Decision Eligibility Change

Current annual decision eligibility:

```text
Annual Decision opens after all applicable terms are finalized or formally closed.
```

Enhanced rule:

```text
Annual Decision opens after all applicable input terms are finalized or formally closed
AND
all required Manager Review instances are submitted/finalized.
```

For `TERM_WISE` Manager Review templates, the existing rule remains unchanged because each term already requires manager review before term finalization.

For grouped or annual Manager Review templates, annual decision eligibility must include the extra manager-review-completion gate.

This change should be enforced in the service layer and not only in the UI.

Annual Decision remains a single yearly action in Phase 1.

Example: quarterly input, half-yearly manager review, yearly Annual Decision.

```text
Q1 + Q2 input complete
→ H1 Manager Review complete
Q3 + Q4 input complete
→ H2 Manager Review complete
→ Annual Decision opens
```

---

## 15. Data Design Recommendation

No major collection rewrite is required.

The existing template and Annual Assignment structures can be extended.

### 15.1 Template / Flow Policy Metadata

Use the existing `flowPolicy` structure available on Template Version and Annual Assignment.

Recommended addition:

```ts
flowPolicy.enableConfigurableReviewFlow = boolean;

flowPolicy.managerReviewTiming =
  | "TERM_WISE"
  | "GROUPED_TERMS"
  | "ANNUAL"
  | "CUSTOM_GROUPED";

flowPolicy.managerReviewGroups = [
  {
    reviewGroupKey: string,
    reviewGroupLabel: string,
    inputTerms: string[],
    requiredForAnnualDecision: boolean
  }
];
```

This is preferred over adding a separate top-level `reviewTiming` field because it aligns with the current architecture and keeps review behavior inside flow policy configuration.

The default value for existing templates and assignments should be treated as:

```ts
flowPolicy.enableConfigurableReviewFlow = false;
flowPolicy.managerReviewTiming = "TERM_WISE";
```

Runtime services should read the `flowPolicy` snapshot stored on Annual Assignment after launch, not the latest mutable template version.

### 15.2 Section Metadata

Reuse and extend the existing section metadata fields instead of introducing a new field unnecessarily.

Current section metadata already supports fields such as:

```ts
level
renderingScope
termScope
repeatFor
```

Recommended approach:

```text
Use existing level / renderingScope / termScope / repeatFor to determine whether a section renders per input term, per manager review group, or annually.
Add a UI label called "Section Timing" if needed.
```

Suggested UI mapping:

```text
Section Timing = Every Input Term            -> existing term-level rendering metadata
Section Timing = Every Manager Review Group  -> review-group rendering metadata
Section Timing = Once Annually               -> existing annual-level rendering metadata
```

A new field should be added only if the current metadata cannot represent the required behavior cleanly.

### 15.3 Manager Review Value Storage

Add lightweight manager review instance summaries on Annual Assignment or in a dedicated manager review instance collection.

For dynamic form values, follow the current value-storage pattern used for term review and annual decision data.

Recommended approach:

```text
Annual Assignment stores review timing and summary/status.
Separate manager review instance records store review group status.
Separate manager review value records store dynamic section/field values.
Annual Assignment keeps the yearly Annual Decision status using the current implementation.
```

This avoids overloading Annual Assignment with large dynamic `formData` and keeps the design consistent with existing value-style collections.

---

## 16. Template Version Locking

The selected review timing, review grouping, and section timing must be locked with the Template Version used for the assignment.

Once an Annual Assignment is created, later changes to the template should not alter already-created assignments.

Rules:

```text
1. Existing assignments continue with their locked template version.
2. New template changes create or apply only to a new template version.
3. Review timing, review group mapping, and section timing are part of the locked template version snapshot.
4. Historical records should render using the original locked configuration.
```

---

## 17. Admin UI Plan

The Template Builder should provide a simple business-friendly configuration.

### 17.1 Manager Review Timing UI

Show this option in Template Builder:

```text
How should Manager Review happen?

○ Manager reviews every input term
  Example: Manager reviews Q1, Q2, Q3, Q4 separately.

○ Manager reviews grouped terms
  Example: H1 review covers Q1 + Q2, H2 review covers Q3 + Q4.

○ Manager reviews once annually
  Example: Employee fills term-wise updates, manager reviews once at year end.

○ Custom review grouping
  Example: Admin defines exactly which input terms each manager review covers.
```

### 17.2 Section Timing UI

For each section, show:

```text
When should this section be filled?

○ Every input term
○ Every manager review group
○ Once annually
```

This avoids exposing backend workflow logic to Admin users.

---

## 18. Validation Rules

The system should validate:

```text
1. Every active template should resolve to a configurable review flow mode.
   If enableConfigurableReviewFlow is missing or false, use existing current behavior.

2. Every active template must have a Manager Review Timing value when configurable review flow is enabled.

3. If Manager Review Timing is grouped or custom grouped, at least one review group must exist.

4. Each review group must reference valid input terms for the selected cycle term type.

5. Review groups must not reference irrelevant terms.
   Example: Half-yearly review over quarterly input may use Q1-Q4.
   Yearly input should not create Q/H review groups unless explicitly supported by the cycle.

6. Every applicable input term must be covered by at least one required manager review group when manager review is required for annual decision.

7. Every active section metadata must resolve to a Section Timing value. Existing metadata such as `level`, `renderingScope`, `termScope`, and `repeatFor` should resolve to Every Input Term, Every Manager Review Group, or Once Annually.

8. If Manager Review Timing = TERM_WISE:
   - Manager review sections should be available at term level where required by the template.
   - Existing term-wise workflow should continue.

9. If Manager Review Timing = GROUPED_TERMS / ANNUAL / CUSTOM_GROUPED:
   - Manager review section should be configured at manager-review-group or annual level.
   - Term finalization should not require term manager review.
   - Each Manager Review instance should open only after its mapped input terms are completed/finalized.
   - Annual Decision should not open before required Manager Review instances are submitted/finalized.

10. Annual Decision remains yearly and must open only after all applicable input terms are finalized/closed and all required Manager Review instances are submitted/finalized.

11. Existing templates should default to TERM_WISE Manager Review.

12. Locked template versions must preserve selected review timing, review grouping, and section timing.

13. Changes to newer template versions should not affect already-created assignments.

14. Runtime rendering must enforce role, workflow state, visibility, and editability rules at API/service level, not only in frontend.
```

---

## 19. Dashboard and Status Display Impact

Dashboard and assignment status screens should clearly show the review mode.

Possible labels:

```text
Review Mode: Term-wise Manager Review
Review Mode: Grouped Manager Review
Review Mode: Annual Manager Review
Review Mode: Custom Grouped Manager Review
```

For grouped review templates, status can show:

```text
Q1/Q2 Input Pending
H1 Manager Review Pending
H1 Manager Review Submitted
Q3/Q4 Input Pending
H2 Manager Review Pending
H2 Manager Review Submitted
Annual Decision Pending
Annual Finalized
```

This helps HR/Admin, Manager, and Management users understand why Annual Decision is not yet open.

---

## 20. Audit Impact

Audit should capture:

* Template review timing configuration
* Review group configuration
* Section timing configuration
* Template version activation
* Annual assignment creation with locked configuration
* Input term completion/finalization
* Manager Review instance open
* Manager Review draft save
* Manager Review submission
* Manager Review finalization, if applicable
* Annual Decision eligibility change
* Annual Decision submission/finalization

Audit records should preserve the actor, timestamp, previous value, new value, workflow status, review group, input terms, and assignment reference wherever applicable.

---

## 21. Reporting Impact

Reports may need additional fields:

```text
Review Timing
Review Group Key
Review Group Label
Mapped Input Terms
Section Timing
Manager Review Status
Manager Review Submitted By
Manager Review Submitted Date
Annual Decision Eligibility Status
```

This allows HR/Admin and Management to track all review models consistently.

---

## 22. System Impact

This is not only a UI change.

It impacts:

```text
Template metadata
Template activation validation
Runtime form rendering
Assignment rendering
Workflow gating
Term finalization logic
Manager review instance storage
Manager review value storage
Annual decision eligibility
Dashboard/status labels
Audit logging
Reports
FSD update
QA test cases
```

---

## 23. Backward Compatibility

Existing PMS flow should not be affected.

Default behavior:

```text
flowPolicy.enableConfigurableReviewFlow = false
flowPolicy.managerReviewTiming = TERM_WISE
```

So all existing templates, cycles, assignments, term-wise manager review flows, and yearly Annual Decision flows should continue as they are.

Grouped Manager Review or annual Manager Review should apply only when HR/Admin explicitly enables configurable review flow and selects the corresponding Manager Review Timing option.

Service behavior should branch as follows:

```ts
if (!flowPolicy.enableConfigurableReviewFlow) {
  // Current existing behavior:
  // Term Review -> Term Finalization -> All Terms Finalized -> Annual Decision
}

if (flowPolicy.enableConfigurableReviewFlow) {
  // New configurable behavior:
  // Input Terms -> Manager Review Groups -> Yearly Annual Decision -> Finalization
}
```

Existing records should not require data migration. If the flag is absent on an old template or assignment, the system should treat it as `false`.

Runtime should use the locked `flowPolicy` snapshot stored on Annual Assignment. It should not read the latest editable template version for in-progress or historical assignments.

---

## 24. Recommended Dynamic Approach

Do not hardcode this for one client template.

The better design is to make this configurable:

```text
Configurable Review Timing
+
Configurable Review Group Mapping
+
Configurable Section Timing
+
Runtime Template Rendering
+
Workflow Eligibility Control
```

This approach can support future cases such as:

```text
- Quarterly employee input + term-wise manager review
- Quarterly employee input + half-yearly/grouped manager review
- Quarterly employee input + annual manager review
- Half-yearly employee input + annual manager review
- Yearly employee input + annual manager review
- Annual-only review templates
- Custom review group templates
```

---

## 25. Items Not Included in This Approval Request

This approval request is only for configurable section timing and configurable manager review timing/grouping.

The following larger design items should be handled separately if required:

```text
1. Flexible Objective Master and Assignment Model
2. Company Objective and Department Objective mapping
3. Flexible objective actual columns and target direction
4. Configurable probation / trainee reviewer responsibility modes
5. Delegated sharing for probation review assignments
6. Field-level audit for each probation review field
7. Configurable Annual Decision Timing
8. Decision checkpoints after each or selected Manager Review group
9. Decision group mapping for interim appraisal decisions
```

These are valid future enhancements, but they should not be mixed with this approval request because they are larger module-level design changes.

---

## 26. Code Alignment Notes from Technical Review

Before implementation, the design should align with the current code structure:

```text
1. Store manager review timing under flowPolicy.managerReviewTiming.
2. Store review group mapping under flowPolicy.managerReviewGroups.
3. Add flowPolicy.enableConfigurableReviewFlow as a backward-compatible gate.
4. Reuse existing section metadata: level, renderingScope, termScope, repeatFor.
5. Treat non-term-wise Manager Review status as a new review-instance sub-status, not as an existing annual workflow enum.
6. Update term finalization service logic to allow finalization without submitted TermReview only when configurable review flow is enabled and managerReviewTiming is not TERM_WISE.
7. Update annual decision eligibility logic to require all required Manager Review instances to be submitted/finalized when configurable review flow is enabled.
8. Store manager review dynamic field values using the existing value-record pattern, with only status and summary on Annual Assignment or review-instance records.
9. At assignment launch, copy the locked Template Version flowPolicy into Annual Assignment flowPolicy and make runtime services read the assignment-level snapshot.
```

---

## 27. Approval Required

Approval is requested to proceed with the following design enhancement:

```text
1. Add Manager Review Timing under existing flowPolicy.
2. Add Review Group Mapping under existing flowPolicy where review timing is grouped or annual.
3. Add enableConfigurableReviewFlow as a backward-compatible feature gate.
4. Reuse or extend existing section metadata to support Section Timing: Every Input Term / Every Manager Review Group / Once Annually.
5. Allow term completion without term manager review only when configurable review flow is enabled and Manager Review Timing is not TERM_WISE.
6. Add Manager Review instances as a separate review layer before yearly Annual Decision.
7. Store Manager Review instance status separately, not as an existing annual workflow enum.
8. Keep existing Term-wise Manager Review and yearly Annual Decision flow unchanged by default.
9. Preserve review timing, review group mapping, and section timing in locked Template Version and Annual Assignment flowPolicy.
10. Update term finalization and annual decision eligibility service rules based on selected configuration.
11. Update runtime rendering, dashboard/status labels, audit, reporting, FSD, and QA test cases accordingly.
```

---

## 28. Final Recommendation

Proceed with this as a configurable PMS design enhancement.

This should not be implemented as a hardcoded client-specific condition.

The recommended design is:

```text
Configurable Review Timing
+
Configurable Review Group Mapping
+
Configurable Section Timing
+
Runtime Template Rendering
+
Workflow Eligibility Control
+
Backward-Compatible Default Behavior
```

This keeps PMS flexible, scalable, and easier to maintain for future client variations while preserving the existing approved term-wise Manager Review and yearly Annual Decision flow.
