# Implementation Task 2: Flexible Objective Filling, Actuals, and Scoring Governance

Source design: `PMS_Design_Change_Request_Flexible_Objectives_Probation_Review.md`

## Task Goal

Allow assigned objectives to be filled, reviewed, and optionally scored based on role, workflow state, assessment term, assignment source, permission policy, and locked template policy.

Objectives must remain context-only by default. Scoring is enabled only when the locked template version explicitly allows it and valid objective scoring configuration exists.

## References and Dependencies

### Source Design References

- Main design sections: 4.2, 7, 10.1, 10.2, 11.1, 12.1, 13.1, 14.1, 14.3, 14.6, 14.7, 15, 16, 18, 19.
- This task implements runtime filling, actuals, target interpretation, and scoring governance on top of assigned Employee Term Objectives.

### Required Cross-Task Inputs

- Depends on Task 1 Phase 1 for Employee Term Objective plan and frozen objective snapshot fields.
- Depends on Task 1 Phase 2 for active Objective Master Version behavior and immutable assigned snapshots.
- Depends on Task 1 Phase 3 for owner/assigner/reviewer separation and server-side permission enforcement.
- Depends on Task 1 Phase 4 for assignment rule references and selected assessment terms.
- Depends on Task 4 Phase 1 and Phase 5 when assignment-level windows decide whether objective setting, achievement, or review input is open for a mid-cycle employee.

### Existing Backend References

- Objective value and evidence dependencies:
  - `Server/src/models/pms-objective-value.model.ts`
  - `Server/src/models/pms-objective-evidence.model.ts`
  - `Server/src/models/pms-objective-attachment.model.ts`
  - `Server/src/services/objective.service.ts`
- Achievement and review dependencies:
  - `Server/src/models/pms-employee-achievement-submission.model.ts`
  - `Server/src/models/pms-term-review.model.ts`
  - `Server/src/models/pms-term-review-value.model.ts`
  - `Server/src/services/employeeAchievementSubmission.service.ts`
  - `Server/src/services/termReview.service.ts`
- Scoring and template dependencies:
  - `Server/src/services/pms-scoring.service.ts`
  - `Server/src/services/annual-term-rollup.service.ts`
  - `Server/src/models/pms-template-version.model.ts`
  - `Server/src/services/pms-template.service.ts`
- Workflow, audit, and access dependencies:
  - `Server/src/services/term-assignment-workflow.service.ts`
  - `Server/src/services/audit.service.ts`
  - `Server/src/services/access.service.ts`

### Existing Frontend References

- Employee/manager runtime screens:
  - `Client/src/lib/components/pms/achievements/EmployeeAchievementWorkspace.svelte`
  - `Client/src/lib/components/pms/reviews/TermReviewWorkspace.svelte`
  - `Client/src/lib/components/pms/performance/EmployeePerformanceWorkspace.svelte`
  - `Client/src/routes/my/achievements/+page.svelte`
  - `Client/src/routes/manager/reviews/+page.svelte`
- Template scoring configuration references:
  - `Client/src/lib/components/pms/templates/builder/tabs/ScoringTab.svelte`
  - `Client/src/lib/components/pms/templates/builder/ScoringSummaryPanel.svelte`
  - `Client/src/lib/components/pms/templates/builder/scoringActions.ts`
  - `Client/src/lib/components/pms/templates/builder/inspectors/ObjectiveSectionInspector.svelte`

### Cross-Task Output Used Later

- Task 4 uses this task's actual-column and review-term rules when mid-cycle employees have partial-year applicable terms.
- Dashboard and reporting work should reuse calculated score snapshots from this task instead of recalculating from current template settings.

## Global Implementation Rules

- Preserve existing PMS objective, achievement, review, and scoring behavior by default.
- Keep all new scoring behavior controlled by locked template version policy and assigned objective snapshots.
- Do not let managers override scoring mode, scoreable flag, target value, target direction, or objective weightage during review.
- Enforce permissions and scoring validation on the server. Frontend-only controls are not enough.
- Keep UI simple for non-technical users with clear states, tooltips, guided configuration, and friendly validation messages.
- Do not create very large components. Keep Svelte components around 1000-1500+ lines maximum, and split earlier when responsibility grows.
- Use child components for scoring configuration, objective table, actual value entry, achievement evidence, score entry, term grouping, and validation summary.
- Pass state through props/events and keep API calls in workspace or route-level components.
- Use plain labels for backend statuses and scoring modes.
- Add tests for every calculation and blocking rule.

## Phase 1: Objective Fillability Policy

### 1.1 Define fillable objective values

- Support objective value fields:
  - target value
  - target description/guidance
  - actual achievement value
  - achievement summary
  - evidence/attachments
  - employee comments
  - manager comments
  - manager rating/score when scoring is enabled
- Store actor, role, workflow status, term, and timestamp for value changes.

### 1.2 Resolve fill permissions at runtime

- Determine whether a field is viewable or editable using:
  - role
  - workflow state
  - assessment term
  - assignment source
  - permission policy
  - locked template rendering policy
- Reuse existing workflow states wherever possible:
  - `OBJECTIVE_SETTING_OPEN`
  - `OBJECTIVE_DRAFT`
  - `OBJECTIVE_SUBMITTED`
  - `OBJECTIVE_REVISION_REQUIRED`
  - `OBJECTIVE_APPROVED`

### 1.3 Backend validation

- Reject updates when actor cannot edit field, term, workflow state, or objective source.
- Reject score fields unless objective scoring is explicitly enabled.
- Reject changes to immutable objective snapshot fields after assignment unless using correction/amendment flow.

### 1.4 User-friendly objective entry UI

- Show assigned objectives grouped by assessment term.
- Make each row easy to understand:
  - objective title
  - source
  - guidance
  - target
  - actual
  - evidence
  - comments
  - status
- Show locked fields as read-only with short reason:
  - "Available after manager review opens"
  - "Locked after submission"
  - "Only manager can score this objective"

## Phase 2: Actual Columns by Cycle Term Type

### 2.1 Backend term column rules

- Generate actual columns only for the selected cycle term type:
  - Quarterly: Q1, Q2, Q3, Q4 actuals
  - Half-yearly: H1, H2 actuals
  - Yearly: Y1 actual
- Do not render or accept irrelevant actual columns.
- Validate that assignment terms match cycle term type.

### 2.2 Frontend actual display

- Build reusable actual value components that receive:
  - cycle term type
  - applicable terms
  - editable terms
  - values
  - validation errors
- Hide non-applicable columns completely instead of showing disabled irrelevant fields.
- Show friendly empty states:
  - "No actual value required for this term"
  - "This term is not applicable for this employee"

### 2.3 QA checks

- Half-yearly cycle never shows Q1-Q4 actual columns.
- Yearly cycle never shows Q/H actual columns.
- API rejects actual values for terms outside selected cycle type.

## Phase 3: Target Direction and Actual Validation

### 3.1 Add target direction support

- Support:
  - `HIGHER_IS_BETTER`
  - `LOWER_IS_BETTER`
  - `NOT_APPLICABLE`
- Require target direction only when numeric target-based interpretation or target-based score calculation is configured.
- Store target direction in objective snapshot.

### 3.2 Actual validation rules

- Validate actual value for format and completeness.
- Do not block submission only because the target was not achieved.
- Block only when:
  - required actual value is missing
  - actual value format is invalid
  - numeric value is required but non-numeric data is entered
  - configured hard limit is violated
  - target-based score calculation is enabled but target/actual/direction data is missing

### 3.3 Target interpretation

- For `HIGHER_IS_BETTER`, target is met when actual value is greater than or equal to target value.
- For `LOWER_IS_BETTER`, target is met when actual value is less than or equal to target value.
- For `NOT_APPLICABLE`, do not perform numeric interpretation.
- If target is not met, allow submission but show status and require comments only when configured.

### 3.4 User-friendly target UI

- Use plain-language display:
  - "Higher value is better"
  - "Lower value is better"
  - "No numeric target"
- Show target status as guidance, not as a hard failure unless validation requires it.
- Use inline validation beside actual fields, not only toast messages.

## Phase 4: Actual Aggregation Mode

### 4.1 Add aggregation mode configuration

- Support:
  - `LATEST_VALUE`
  - `SUM_OF_TERMS`
  - `AVERAGE_OF_TERMS`
  - `MAX_OF_TERMS`
  - `MIN_OF_TERMS`
- Default to `LATEST_VALUE`.
- Store mode in locked template scoring policy or assigned objective scoring snapshot when target-based auto scoring is enabled.

### 4.2 Apply aggregation before target-based score calculation

- Aggregate actual values across included terms before target-based auto calculation.
- Do not confuse actual aggregation mode with term aggregation policy:
  - actual aggregation combines raw actual values
  - term aggregation combines calculated term scores

### 4.3 User-friendly configuration UI

- Show simple descriptions:
  - "Use latest value"
  - "Add all term values"
  - "Average term values"
  - "Use highest value"
  - "Use lowest value"
- Show a preview example using selected terms when configuring.

## Phase 5: Context-Only Default and Scoring Modes

### 5.1 Default behavior

- Keep all objective sources context-only unless scoring is explicitly enabled:
  - Company Objectives
  - Department Objectives
  - Template-referenced Objectives
  - Manager-created Objectives
  - Employee-created Objectives
- Context-only objectives support planning, alignment, achievement, evidence, and manager comments.
- Context-only objectives must not contribute to marks, weighted score, term score, or final score.

### 5.2 Add objective scoring modes

- Support:
  - `CONTEXT_ONLY`
  - `WEIGHTED_OBJECTIVE_SCORE`
  - `OVERALL_OBJECTIVE_SCORE`
- Allow only one active objective scoring mode for the same objective section at a time.
- Store scoring mode in locked Template Version, not Objective Master.

### 5.3 Template scoring policy fields

- Store:
  - objective scoring mode
  - objective section template weight
  - objective scoring enabled flag
  - per-objective score entry allowed flag
  - overall score entry allowed flag
  - no-objective scoring policy
  - review timing policy
  - included assessment term grouping policy
  - term aggregation policy
  - scoring validation rules

These policies are owned at the Objective section level inside the locked Template Version. They are not configured separately for every objective by default.

Examples:

- Employee fills objective actuals in Q1, Q2, Q3, and Q4, while manager review/scoring happens only at yearly review.
- Employee fills objective actuals in H1 and H2, while manager review/scoring happens separately for each half-year term.
- Objectives remain context-only for all terms unless the Objective section scoring mode enables weighted or overall scoring.

Objective-specific data may still exist for title, KPI, target value, scoreable flag, approved weightage, and exceptions where explicitly allowed. However, fill terms, review timing, scoring mode, actual aggregation, term aggregation, and section weight are section-level template policy.

### 5.4 Scoring configuration UI

- Add a scoring configuration panel in template builder.
- Explain each mode in plain language:
  - "No score from objectives"
  - "Score each objective separately"
  - "Give one overall objective score"
- Show validation summary before template activation:
  - missing weightage
  - conflicting modes
  - invalid total
  - no-objective policy missing

## Phase 6: Weighted Objective Scoring

### 6.1 Calculation rules

- Apply only when mode is `WEIGHTED_OBJECTIVE_SCORE`.
- Include only scoreable objectives.
- Manager-entered score must be 0-100.
- Calculate:

```text
Objective Weighted Score = (Manager Score / 100) x Objective Weightage
Objective Section Score = Sum of Objective Weighted Scores
```

- If objective section has template weight:

```text
Objective Section Contribution = (Objective Section Score / 100) x Objective Section Template Weight
```

### 6.2 Validation rules

- Validate manager score range.
- Validate scoreable objective weightage.
- Validate total objective weightage.
- Validate section score does not exceed 100.
- Validate final term score does not exceed configured template scoring total.

### 6.3 No-objective scoring policy

- Support:
  - `NO_OBJECTIVES_NOT_APPLICABLE`
  - `REALLOCATE_OBJECTIVE_WEIGHT`
  - `BLOCK_REVIEW_SUBMISSION`
  - `ALLOW_MANUAL_OVERALL_SCORE`
- Default to `NO_OBJECTIVES_NOT_APPLICABLE`.
- Apply policy when no scoreable objectives exist for an employee and term.

### 6.4 Manager scoring UI

- Show only scoreable objectives in score-entry mode.
- Keep non-scoreable objectives visible as context.
- Show running weighted total and validation warnings.
- Use friendly messages:
  - "This objective is for reference only"
  - "Score must be between 0 and 100"
  - "Objective weights need correction before submission"

## Phase 7: Overall Objective Score

### 7.1 Calculation rules

- Apply only when mode is `OVERALL_OBJECTIVE_SCORE`.
- Manager enters one score from 0-100 for the objective section.
- Treat this as objective section score only, not final PMS score.
- If section has template weight:

```text
Objective Section Contribution = (Overall Objective Score / 100) x Objective Section Template Weight
```

### 7.2 Validation rules

- Prevent overall score when weighted objective mode is active.
- Prevent per-objective scores when overall mode is active.
- Ensure overall score cannot bypass template scoring totals.

### 7.3 UI behavior

- Show objectives as review context.
- Show one score input with the label "Overall objective score".
- Show contribution preview when section weight exists.
- Do not show per-objective score fields in this mode.

## Phase 8: Review Timing and Term Aggregation

### 8.1 Separate assignment term and review timing

- Keep objectives linked to assigned terms: Q1, Q2, Q3, Q4, H1, H2, Y1.
- Let review instance decide which terms are included for review/scoring.
- Support:
  - `TERM_WISE`
  - `GROUPED_TERMS`
  - `ANNUAL`
  - `CUSTOM_GROUPED`

### 8.2 Aggregation policies

- Support:
  - `EQUAL_TERM_AVERAGE`
  - `TERM_WEIGHTED_AVERAGE`
  - `MANUAL_GROUP_OVERALL_SCORE`
- Default to `EQUAL_TERM_AVERAGE`.
- Validate term weights total 100% when using weighted average.

### 8.3 Runtime display

- When review includes multiple terms, show objectives grouped by term.
- Show term objective score first.
- Then show group/annual aggregated score.
- Show non-scoreable objectives as context only.

### 8.4 Historical stability

- Finalized review scores must not recalculate when review timing, grouping, or aggregation policy changes later.
- Store calculated review score snapshot.

## Phase 9: Audit, Reporting, and Dashboard

### 9.1 Audit capture

- Capture:
  - objective fill value changes
  - achievement submission
  - attachment upload/delete/download
  - score input
  - calculated score snapshot
  - scoring participation changes
  - approval/return actions

### 9.2 Reporting mapping

- Expose:
  - target value
  - actual value
  - target direction
  - actual aggregation mode
  - scoreable flag
  - objective weightage
  - manager score
  - calculated weighted score
  - objective approval status
  - finalized status

### 9.3 Dashboard support

- Server should calculate:
  - pending achievement
  - pending manager review
  - returned for revision
  - submitted
  - finalized
  - overdue
  - blocked due to invalid scoring or missing mandatory fields

## Phase 10: QA and Acceptance

### 10.1 Calculation tests

- Weighted score formula works.
- Overall score contribution works.
- Target-based score calculation is capped at 100 unless overachievement is explicitly enabled.
- Actual aggregation mode applies before target-based score calculation.
- Term aggregation applies after term scores are calculated.

### 10.2 Validation tests

- Context-only objectives never affect score.
- Manager score above 100 is rejected.
- Conflicting weighted and overall scoring is rejected.
- Missing required target/actual/direction blocks target-based auto calculation.
- Target not met does not block submission by default.
- Scoring mode cannot be overridden during review.

### 10.3 UI acceptance checks

- Employee can enter permitted actuals and evidence only for applicable terms.
- Manager sees clear score inputs based on scoring mode.
- Non-technical user can understand target direction and target met/not-met status.
- Configuration screen explains scoring choices without exposing implementation details first.
- Components are split and reusable.

### 10.4 Regression checks

- Existing achievement submission continues to work.
- Existing manager review continues to work.
- Existing templates without new scoring config remain valid.
- Existing finalized scores are unchanged.

## Detailed Implementation Notes

Use this section as the detailed handoff checklist for developers before coding Task 2.

### Runtime Data Resolution

Runtime objective filling and scoring must resolve from these sources in this order:

```text
Locked Template Version policy
+ Employee Term Objective frozen snapshot
+ Runtime objective fill values / achievement values
+ Manager review score inputs
= Calculated review score snapshot
```

Do not read latest Objective Master Version for an already assigned Employee Term Objective. Runtime display, validation, review, audit, reporting, and historical rendering must use the frozen snapshot stored at assignment time.

### Field Categories To Handle

Task 2 must handle these objective value categories:

| Category | Typical Actor | Storage / Source |
|---|---|---|
| Target value | HR/Admin, Management, Department Head, Manager where permitted | Employee Term Objective snapshot or objective fill value where editable |
| Target description / guidance | HR/Admin, Management, Department Head, Manager where permitted | Snapshot or fill value |
| KPI / measurement guidance | Objective owner / assigner | Snapshot |
| Target direction | Objective owner / assigner | Snapshot |
| Actual achievement value | Employee or Manager where permitted | Objective value / achievement value |
| Achievement summary | Employee or Manager where permitted | Objective value / achievement value |
| Evidence / attachments | Employee or Manager where permitted | Existing objective evidence/attachment storage where possible |
| Employee comments | Employee | Objective value/comment storage |
| Manager comments | Manager | Review/objective value storage |
| Rating / score | Manager only when scoring is enabled | Manager review score input |
| Calculated score | System | Calculated review score snapshot |

### Actual Value Validation Detail

Actual values must be validated for data correctness, not for business success by default.

Block submission only when:

- required actual value is missing
- actual value format is invalid
- numeric value is required but non-numeric data is entered
- configured hard data limit is violated
- target-based auto score calculation is enabled but target value, actual value, or applicable target direction is missing
- actor does not have permission for the term, field, workflow state, or assignment window

Do not block submission only because the target was not achieved.

When target is not met:

- show "Target Not Met" or equivalent guidance
- require employee/manager comment only if configured
- allow manager to consider it during review
- use it in score calculation only when target-based scoring is explicitly enabled

### Target Direction Formula Detail

Target direction guides calculation only when the locked template scoring policy explicitly enables target-based auto score calculation.

Recommended formulas:

```text
HIGHER_IS_BETTER Score = min((Actual Value / Target Value) x 100, 100)
LOWER_IS_BETTER Score = min((Target Value / Actual Value) x 100, 100)
```

Rules:

- Default cap is 100.
- Overachievement above 100 is allowed only if locked template policy explicitly allows it.
- `NOT_APPLICABLE` means no numeric target comparison.
- If manager manually enters objective score, target direction is guidance only.
- Automatic score derivation from actual values is not default behavior.

### Actual Aggregation Detail

Actual aggregation mode applies before target-based auto score calculation.

Supported values:

| Mode | Behavior |
|---|---|
| `LATEST_VALUE` | Uses latest applicable term actual value |
| `SUM_OF_TERMS` | Adds actual values from included terms |
| `AVERAGE_OF_TERMS` | Uses average actual value across included terms |
| `MAX_OF_TERMS` | Uses highest actual value across included terms |
| `MIN_OF_TERMS` | Uses lowest actual value across included terms |

Default:

```text
LATEST_VALUE
```

Do not confuse actual aggregation with term aggregation:

- actual aggregation combines raw actual values before target-based score calculation
- term aggregation combines already calculated term objective scores for grouped/annual reviews

### Scoring Storage Ownership

Scoring mode and review timing are owned by the Objective section policy in the locked Template Version, not Objective Master and not individual objectives by default.

Locked Template Version should own:

- objective scoring enabled flag
- objective scoring mode
- objective section template weight
- per-objective score entry allowed flag
- overall objective score entry allowed flag
- no-objective scoring policy
- review timing policy
- included assessment term grouping policy
- term aggregation policy
- scoring validation rules
- actual fill term policy, such as Q1/Q2/Q3/Q4 actual entry with yearly manager review

Employee Term Objective snapshot may store:

- scoreable flag
- approved weightage
- target value
- target direction
- actual aggregation mode where applicable

Manager review stores:

- manager-entered score values
- calculated score snapshot
- calculation inputs used at finalization time

### Scoring Mode Boundary

Only one objective scoring mode can contribute to the same objective section.

| Mode | Runtime Input |
|---|---|
| `CONTEXT_ONLY` | No score input |
| `WEIGHTED_OBJECTIVE_SCORE` | Score per scoreable objective only |
| `OVERALL_OBJECTIVE_SCORE` | One overall objective section score only |

Rules:

- Managers cannot override scoring mode during review.
- Managers cannot convert non-scoreable objectives into scoreable objectives.
- Managers cannot change objective weightage during review.
- Managers cannot enter both per-objective weighted scores and overall objective score for the same objective section.
- Manual score entry is allowed only when locked template policy permits it.
- Any scoring change after assignment requires controlled correction/amendment flow with reason, actor, timestamp, and audit trail.

### Weighted Scoring Detail

Weighted objective scoring applies only when objective scoring mode is `WEIGHTED_OBJECTIVE_SCORE`.

Formula:

```text
Objective Weighted Score = (Manager Score / 100) x Objective Weightage
Objective Section Score = Sum of Objective Weighted Scores
```

If objective section has template weight:

```text
Objective Section Contribution = (Objective Section Score / 100) x Objective Section Template Weight
```

Validation:

- manager score must be between 0 and 100
- only scoreable objectives participate
- each scoreable objective must have valid weightage
- total objective weightage must not exceed configured objective scoring total
- objective section score must not exceed 100
- final term score must not exceed configured template scoring total

### Overall Objective Score Detail

Overall objective scoring applies only when objective scoring mode is `OVERALL_OBJECTIVE_SCORE`.

Formula:

```text
Objective Section Contribution = (Overall Objective Score / 100) x Objective Section Template Weight
```

Rules:

- overall objective score is objective section score only
- it is not final PMS score
- score must be between 0 and 100
- per-objective score inputs must not be accepted in this mode

### No-Objective Scoring Policy Detail

Supported policies:

| Policy | Behavior |
|---|---|
| `NO_OBJECTIVES_NOT_APPLICABLE` | Objective scoring is skipped for that employee and term |
| `REALLOCATE_OBJECTIVE_WEIGHT` | Objective section weight is reallocated according to configured template policy |
| `BLOCK_REVIEW_SUBMISSION` | Review submission is blocked until scoreable objectives are available or scoring config is corrected |
| `ALLOW_MANUAL_OVERALL_SCORE` | Manager may enter one overall objective score if template policy allows it |

Default:

```text
NO_OBJECTIVES_NOT_APPLICABLE
```

### Review Timing and Term Aggregation Detail

Objective assignment term and manager review timing are separate.

Objectives stay linked to assigned terms:

- Q1, Q2, Q3, Q4
- H1, H2
- Y1

Review instance decides included terms:

- `TERM_WISE`
- `GROUPED_TERMS`
- `ANNUAL`
- `CUSTOM_GROUPED`

Term aggregation policies:

| Policy | Behavior |
|---|---|
| `EQUAL_TERM_AVERAGE` | Average included term objective scores equally |
| `TERM_WEIGHTED_AVERAGE` | Apply configured term weights |
| `MANUAL_GROUP_OVERALL_SCORE` | Manager enters one group score where template permits |

Default:

```text
EQUAL_TERM_AVERAGE
```

Rules:

- term weights must total 100% for `TERM_WEIGHTED_AVERAGE`
- included term with no scoreable objectives uses no-objective scoring policy before aggregation
- non-scoreable objectives remain visible as context
- finalized historical scores must not recalculate when timing/grouping policy changes later

### Evidence and Attachment Detail

Evidence/attachments are part of objective achievement context.

Rules:

- Keep existing evidence/attachment behavior working.
- Do not create a separate attachment system unless existing storage cannot support the requirement.
- Enforce actor, workflow, term, assignment window, and template policy before upload/delete.
- Audit upload, delete, and download actions.
- Show attachment indicators in UI for objective rows.
- Do not let attachment changes alter finalized score snapshots.

### Dashboard and Reporting Detail

Dashboard/reporting must use locked snapshots and calculated score snapshots.

Expose:

- objective source
- objective master id
- objective version id
- objective title from Employee Term Objective snapshot
- assessment term
- target value
- actual value
- target direction
- actual aggregation mode
- scoreable flag
- objective weightage
- manager score
- calculated weighted score
- objective approval status
- finalized status
- blocked status and reason where validation prevents submission/finalization

Dashboard status must be server-calculated, not derived only from UI labels.

## Team Split for Parallel Work

Task 2 should start after Task 1 model and API contracts for Employee Term Objective snapshots are stable. Suresh and Vinith can still work in parallel if backend contracts are defined first and UI uses mocked/static data until live APIs are ready.

### Suresh Ownership

Suresh owns backend scoring, validation, runtime permission enforcement, and calculated snapshots.

Primary responsibilities:

- Confirm Task 1 dependency contracts:
  - Employee Term Objective snapshot shape
  - objectiveMasterId/objectiveVersionId references
  - assignment term references
  - scoreable flag and approved weightage source
  - target value and target direction source
- Implement objective fillability backend:
  - role-based field edit rules
  - workflow-state checks
  - assessment-term checks
  - assignment-window checks from Task 4 where applicable
- Implement actual column backend rules:
  - Quarterly: Q1-Q4 only
  - Half-yearly: H1-H2 only
  - Yearly: Y1 only
  - reject actual values for non-applicable term types
- Implement target direction validation:
  - `HIGHER_IS_BETTER`
  - `LOWER_IS_BETTER`
  - `NOT_APPLICABLE`
  - numeric format and mandatory actual validation
- Implement actual aggregation modes:
  - `LATEST_VALUE`
  - `SUM_OF_TERMS`
  - `AVERAGE_OF_TERMS`
  - `MAX_OF_TERMS`
  - `MIN_OF_TERMS`
- Implement scoring mode backend:
  - `CONTEXT_ONLY`
  - `WEIGHTED_OBJECTIVE_SCORE`
  - `OVERALL_OBJECTIVE_SCORE`
- Implement weighted objective formula and validation.
- Implement overall objective score contribution.
- Implement no-objective scoring policies.
- Implement review timing and term aggregation backend:
  - term-wise
  - grouped terms
  - annual
  - custom grouped
- Store calculated review score snapshots.
- Ensure finalized scores do not recalculate from later template/config changes.
- Add backend tests for:
  - fill permission rejection
  - actual column term-type validation
  - target direction validation
  - actual aggregation
  - weighted scoring
  - overall scoring
  - term aggregation
  - context-only behavior
  - finalized score immutability

### Vinith Ownership

Vinith owns Task 2 frontend runtime screens, scoring configuration UI, and user-friendly validation display based on Suresh's API contracts.

Primary responsibilities:

- Build objective fill/achievement UI components:
  - objective grouped by term
  - target value display
  - target direction display
  - actual value inputs
  - achievement summary
  - evidence/attachment controls
  - employee comments
  - manager comments
- Build actual-column UI behavior:
  - show Q fields only for quarterly cycles
  - show H fields only for half-yearly cycles
  - show Y field only for yearly cycles
  - hide non-applicable terms instead of showing confusing disabled fields
- Build target direction UI:
  - "Higher value is better"
  - "Lower value is better"
  - "No numeric target"
  - target met / target not met guidance
- Build scoring configuration UI in template builder:
  - context-only mode
  - weighted objective score mode
  - overall objective score mode
  - no-objective scoring policy
  - actual aggregation mode
  - term aggregation policy
- Build manager scoring UI:
  - per-objective score input for weighted mode
  - one overall objective score input for overall mode
  - no score input for context-only mode
  - running score/contribution preview
- Build validation summary components:
  - missing mandatory actuals
  - invalid numeric values
  - score above 100
  - invalid weightage total
  - missing target/actual/direction for auto-calculation
- Keep UI components split around `1000-1500+` lines maximum.
- Use child components and props/events for:
  - ObjectiveTermGroup
  - ObjectiveActualsGrid
  - ObjectiveTargetGuidance
  - ObjectiveEvidencePanel
  - ObjectiveScoreInput
  - ObjectiveScoringSummary
  - ObjectiveScoringConfigPanel
  - ObjectiveValidationSummary
- Execute Task 2 frontend acceptance and manual checklist items.

### Phase Split By Workstream

| Task 2 Phase | Suresh | Vinith | Dependency |
|---|---|---|---|
| Phase 1: Fillability Policy | Own backend authorization and validation | Build editable/read-only UI states | Task 1 snapshot and permission contract |
| Phase 2: Actual Columns | Own server term-type validation | Build cycle-type based actual field rendering | Cycle term type from assignment/cycle API |
| Phase 3: Target Direction | Own validation and interpretation rules | Build guidance labels and inline validation | Target fields from snapshot/API |
| Phase 4: Actual Aggregation | Own aggregation service/calculation | Build config selector and preview text | Scoring config contract |
| Phase 5: Scoring Modes | Own backend mode enforcement | Build scoring mode config UI | Template version scoring contract |
| Phase 6: Weighted Scoring | Own formula and validation | Build per-objective score UI | Scoreable/weightage fields |
| Phase 7: Overall Scoring | Own contribution calculation | Build single overall score UI | Objective section weight contract |
| Phase 8: Review Timing | Own term aggregation backend | Build grouped/annual term display | Review timing policy contract |
| Phase 9: Audit/Reporting/Dashboard | Own audit, reporting, dashboard data | Display status/summary where needed | Backend status contract |
| Phase 10: QA | Own backend tests | Own UI/manual checks | Integrated environment |

### Parallel Work Order

| Step | Owner | Output |
|---|---|---|
| 1 | Suresh | Confirm Task 1 snapshot fields and Task 2 API contracts |
| 2 | Vinith | Start UI components with mocked/static API data |
| 3 | Suresh | Implement fillability, actuals, target direction, and scoring services |
| 4 | Vinith | Build scoring configuration and runtime review UI states |
| 5 | Suresh | Implement calculated score snapshot, audit, reporting, dashboard outputs |
| 6 | Vinith | Connect UI to real APIs and replace mocked data |
| 7 | Suresh | Review integration for permission, scoring, aggregation, and finalization edge cases |
| 8 | Suresh and Vinith | Run Task 2 manual checklist and regression checks |

### Contract Handoff Checklist

Suresh should provide these before Vinith connects to live APIs:

| Contract Item | Status |
|---|---|
| Employee Term Objective runtime response | [ ] |
| Objective fill permission response | [ ] |
| Actual column metadata by cycle term type | [ ] |
| Target direction and target guidance fields | [ ] |
| Actual value save payload and validation error format | [ ] |
| Evidence/attachment payload and response format | [ ] |
| Scoring mode configuration payload | [ ] |
| Weighted score input payload and calculated response | [ ] |
| Overall score input payload and calculated response | [ ] |
| Actual aggregation mode config and preview response | [ ] |
| Term aggregation policy config and calculated response | [ ] |
| No-objective scoring policy response | [ ] |
| Runtime validation summary response | [ ] |
| Calculated review score snapshot response | [ ] |
| Dashboard/status response fields | [ ] |
| Friendly backend error codes/messages | [ ] |

### Integration Rules

- Task 2 must not create its own objective identity model; it must consume Task 1 Employee Term Objective snapshots.
- Vinith should not assume missing scoring or validation fields; mark the field as pending and confirm with Suresh.
- Suresh should keep response fields stable once Vinith starts live API integration.
- Backend remains the source of truth for edit permissions and scoring validation.
- UI must not show score inputs when backend returns `CONTEXT_ONLY`.
- UI must not allow per-objective and overall score entry at the same time.
- Existing achievement and manager review screens must remain compatible when new scoring modes are not enabled.
- Finalized score snapshots must be displayed from stored calculation results, not recalculated in UI.
