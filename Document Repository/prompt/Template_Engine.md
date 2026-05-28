# PMS v2 Template Builder, Objective Ownership, and Scoring Implementation Spec

## 1. Purpose

This document defines the implementation approach for the PMS v2 template builder scoring engine, objective ownership model, competency matrix model, dynamic objective repeaters, option-based marks, and validation rules.

This spec must remain aligned with:

- PMS v2 FSD
- Module Prompt v2
- Approved Baseline v2
- Discussion Notes v2

The PMS v2 baseline is:

- Quarterly objective tracking
- Manager-driven quarterly review
- No employee self-review
- No employee rating
- No employee acceptance/sign-off
- Manager-created objectives auto-approved
- Confidential annual decision fields hidden until visibility governance
- Template version locking for historical integrity

## 2. Core Design Rule

Do not treat all fields as scoring fields.

Use three separate concepts:

```ts
sectionType = PMS behavior
fieldType = input/display control
fieldCategory = business/scoring meaning
```

Example:

```text
TEXT + NORMAL = descriptive value, no marks
RADIO + SCORING = option-based marks
NUMBER + SCORING = manager-entered score
CALCULATED + CALCULATED = system-calculated score
PERCENTAGE + SYSTEM + semanticRole OBJECTIVE_WEIGHTAGE = objective weightage
MATRIX + SCORING = competency scoring
DATA_GRID + semanticRole OBJECTIVE_REPEATER = dynamic objectives
```

## 3. Section Model

The template section must define the business behavior of a section.

Recommended section model:

```ts
interface TemplateSection {
  sectionKey: string;
  sectionLabel: string;

  sectionType:
    | "STATIC"
    | "COMPETENCY"
    | "OBJECTIVE_DYNAMIC"
    | "REVIEW"
    | "DECISION";

  level: "QUARTER" | "ANNUAL";
  renderingScope: "QUARTER_ONLY" | "ANNUAL_ONLY" | "BOTH";
  quarterScope?: Array<"Q1" | "Q2" | "Q3" | "Q4">;

  scoringEnabled: boolean;
  sectionWeightage: number;
  scoringMethod: "AVERAGE" | "WEIGHTED" | "MANUAL";

  objectiveBuckets?: ObjectiveBucket[];

  fields: TemplateField[];
  metadata?: Record<string, unknown>;
}
```

Existing implementation note:

- Backend already has `sectionType`, `sectionScoringConfig`, `objectiveConfig`, `matrixConfig`, and `gridConfig`.
- The new builder UI may expose clearer business labels while mapping internally to existing structures.
- Do not break existing template versions. Add migration/backward-compatible normalization.

## 4. Field Model

Field type controls how the user enters or sees data.

Recommended field types:

```ts
type FieldType =
  | "TEXT"
  | "TEXTAREA"
  | "NUMBER"
  | "DATE"
  | "DROPDOWN"
  | "RADIO"
  | "CHECKBOX"
  | "CHECKBOX_GROUP"
  | "RATING_SCALE"
  | "PERCENTAGE"
  | "CURRENCY"
  | "ATTACHMENT"
  | "RICH_TEXT"
  | "STATIC_TEXT"
  | "MATRIX"
  | "DATA_GRID"
  | "CALCULATED";
```

UI aliases may be used:

```text
OBJECTIVE_REPEATER = DATA_GRID with semanticRole OBJECTIVE_REPEATER
COMPETENCY_MATRIX = MATRIX with semanticRole COMPETENCY_MATRIX
```

Field category controls what the value means.

```ts
type FieldCategory =
  | "NORMAL"
  | "SCORING"
  | "CALCULATED"
  | "SYSTEM"
  | "CONFIDENTIAL"
  | "HIDDEN";
```

Recommended field model:

```ts
interface TemplateField {
  fieldKey: string;
  fieldLabel: string;
  fieldType: FieldType;
  fieldCategory: FieldCategory;

  semanticRole?:
    | "OBJECTIVE_TITLE"
    | "OBJECTIVE_KPI"
    | "OBJECTIVE_TARGET"
    | "OBJECTIVE_WEIGHTAGE"
    | "OBJECTIVE_ACHIEVEMENT"
    | "MANAGER_RATING"
    | "MANAGER_SCORE"
    | "MANAGER_COMMENT"
    | "COMPETENCY_RATING"
    | "COMPETENCY_COMMENT"
    | "FINAL_GRADE"
    | "MERIT_PERCENTAGE"
    | "APPRAISAL_OUTCOME";

  isRequired?: boolean;
  displayOrder?: number;
  placeholder?: string;
  helpText?: string;

  options?: TemplateOption[];
  scoringConfig?: ScoringConfig;
  validationRules?: Record<string, unknown>;
  visibilityRules?: Record<string, unknown>;
  editabilityRules?: Record<string, unknown>;
  behaviors?: BehaviorRule[];
  matrixConfig?: MatrixConfig;
  gridConfig?: GridConfig;
  metadata?: Record<string, unknown>;
}
```

## 5. Option-Based Marks

Option scores must be stored on the option itself.

This is the source of truth:

```ts
interface TemplateOption {
  label: string;
  value: string;
  score?: number;
  weight?: number;
}
```

Example:

```ts
options: [
  { label: "Below", value: "BELOW", score: 3 },
  { label: "Average", value: "AVERAGE", score: 6 },
  { label: "Good", value: "GOOD", score: 8 },
  { label: "Excellent", value: "EXCELLENT", score: 10 }
],
scoringConfig: {
  scoreType: "OPTION_BASED",
  maxScore: 10,
  weight: 20
}
```

Do not keep a second independent `optionScores` source unless it is derived at runtime from `options`.

Calculation:

```text
Raw option score -> normalized score -> weighted contribution
```

Example:

```text
Selected option = Average
Raw score = 6
Max score = 10
Field weight = 20

Contribution = (6 / 10) * 20 = 12
```

The field contributes 12 out of 20.

## 6. Scoring Config

Recommended scoring config:

```ts
interface ScoringConfig {
  scoreType:
    | "OPTION_BASED"
    | "RATING_SCALE"
    | "NUMERIC"
    | "BOOLEAN"
    | "PERCENTAGE"
    | "FORMULA"
    | "MANUAL";

  maxScore: number;
  weight?: number;

  checkedScore?: number;
  uncheckedScore?: number;
  minScore?: number;
  allowDecimal?: boolean;
  formula?: string;
}
```

Rules:

- `TEXT`, `TEXTAREA`, `DATE`, `ATTACHMENT`, and `STATIC_TEXT` do not produce marks unless `fieldCategory = "SCORING"` and valid `scoringConfig` exists.
- `DROPDOWN`, `RADIO`, and `CHECKBOX_GROUP` produce marks only when option scores are configured.
- `CHECKBOX` produces marks only when `scoreType = "BOOLEAN"`.
- `NUMBER` produces marks only when `fieldCategory = "SCORING"`.
- `CALCULATED` values are system-generated and should not be manually edited.
- Formula engine should be Phase 3, not Phase 1.

## 7. Objective Ownership Model

Dynamic objectives must be controlled through objective buckets.

```ts
interface ObjectiveBucket {
  bucketKey: string;
  label: string;

  source:
    | "TEMPLATE_PREDEFINED"
    | "EMPLOYEE_DYNAMIC"
    | "MANAGER_DYNAMIC";

  owner:
    | "SYSTEM"
    | "EMPLOYEE"
    | "MANAGER";

  bucketWeightage: number;

  rowWeightMode:
    | "FIXED_BY_TEMPLATE"
    | "OWNER_ENTERED"
    | "EQUAL_DISTRIBUTION";

  editableBy: Array<"ADMIN" | "EMPLOYEE" | "MANAGER">;
  requiresManagerApproval: boolean;
  autoApprove: boolean;
}
```

Recommended default objective buckets:

```ts
objectiveBuckets: [
  {
    bucketKey: "template_predefined",
    label: "Template Predefined Objectives",
    source: "TEMPLATE_PREDEFINED",
    owner: "SYSTEM",
    bucketWeightage: 20,
    rowWeightMode: "FIXED_BY_TEMPLATE",
    editableBy: ["ADMIN"],
    requiresManagerApproval: false,
    autoApprove: true
  },
  {
    bucketKey: "employee_dynamic",
    label: "Employee Objectives",
    source: "EMPLOYEE_DYNAMIC",
    owner: "EMPLOYEE",
    bucketWeightage: 50,
    rowWeightMode: "OWNER_ENTERED",
    editableBy: ["EMPLOYEE"],
    requiresManagerApproval: true,
    autoApprove: false
  },
  {
    bucketKey: "manager_dynamic",
    label: "Manager Objectives",
    source: "MANAGER_DYNAMIC",
    owner: "MANAGER",
    bucketWeightage: 30,
    rowWeightMode: "OWNER_ENTERED",
    editableBy: ["MANAGER"],
    requiresManagerApproval: false,
    autoApprove: true
  }
]
```

FSD-aligned ownership rules:

- Template predefined objectives are configured by HR/Admin in the template.
- Employee dynamic objectives are created by employee and require manager approval.
- Manager dynamic objectives are created by manager and automatically become approved.
- Employee cannot edit manager-created objectives.
- Approved objectives become read-only unless reopened by authorized HR/Admin process.
- Manager performs the final quarter rating.
- Employee does not self-rate.
- Employee acceptance/sign-off does not exist.

## 8. Objective Repeater Structure

Dynamic objectives should be shown in UI as `OBJECTIVE_REPEATER`.

Internal mapping:

```ts
fieldType: "DATA_GRID",
fieldCategory: "NORMAL",
semanticRole: "OBJECTIVE_REPEATER",
metadata: {
  repeaterKind: "OBJECTIVE_REPEATER",
  objectiveBucketKey: "employee_dynamic"
}
```

Objective repeater must separate entry columns from review columns.

Employee/Manager objective entry columns:

```text
Objective Title: TEXT, NORMAL
KPI: TEXTAREA, NORMAL
Target: TEXT, NORMAL
Weightage: PERCENTAGE, SYSTEM, semanticRole OBJECTIVE_WEIGHTAGE
Due Date: DATE, NORMAL
Success Criteria: TEXTAREA, NORMAL
```

Manager review columns:

```text
Achievement: TEXTAREA, NORMAL
Manager Rating: RADIO or DROPDOWN, SCORING
Manager Score: CALCULATED, CALCULATED
Manager Comment: TEXTAREA, NORMAL
```

Only manager review columns create marks.

Descriptive objective fields do not create marks:

- Objective title
- KPI
- Target
- Due date
- Success criteria
- Achievement text
- Attachments

## 9. Objective Weightage Validation

Objective section validation has two levels.

Bucket validation:

```text
All active objective bucket weights inside the objective section must total 100.
```

Example:

```text
Template Predefined = 20%
Employee Dynamic = 50%
Manager Dynamic = 30%
Total = 100%
```

Row validation:

```text
Objective row weights inside each active bucket must total 100.
```

Example:

```text
Employee Dynamic Bucket = 50% of objective section

Objective A = 40%
Objective B = 30%
Objective C = 30%
Row total = 100%
```

Do not ask employees to distribute against the full appraisal total. They should distribute only within their own bucket.

## 10. Objective Score Calculation

Quarter score has four levels:

```text
Quarter Score
 └── Section Score
      └── Bucket Score
           └── Row / Field Score
```

Formula:

```text
Final contribution =
sectionWeightage
* bucketWeightageRatio
* rowWeightageRatio
* normalizedRatingScore
```

Example:

```text
Objective Section = 60%
Employee Bucket = 50%
Objective A Row = 40%
Manager selected Average = 6/10

Contribution = 60 * 0.50 * 0.40 * 0.60
Contribution = 7.2 points out of 100
```

Simple objective-only example:

```text
Objective A weightage 30, rating Good 8/10 = 24
Objective B weightage 40, rating Average 6/10 = 24
Objective C weightage 30, rating Excellent 10/10 = 30

Total objective bucket score = 78 / 100
```

## 11. Competency Matrix

The uploaded appraisal image should be modeled as a competency matrix, not as objectives.

Section:

```ts
sectionType: "COMPETENCY",
sectionWeightage: 40,
scoringEnabled: true,
scoringMethod: "WEIGHTED"
```

Field:

```ts
fieldType: "MATRIX",
fieldCategory: "SCORING",
semanticRole: "COMPETENCY_RATING"
```

Matrix config:

```ts
matrixConfig: {
  rows: [
    { key: "job_knowledge", label: "Job Knowledge / Skills", weightage: 10 },
    { key: "communication", label: "Communication Skills", weightage: 10 },
    { key: "leadership", label: "Leadership", weightage: 10 }
  ],
  options: [
    { label: "Inadequate", value: "INADEQUATE", score: 3 },
    { label: "Needs guidance", value: "NEEDS_GUIDANCE", score: 6 },
    { label: "Can work independently", value: "INDEPENDENT", score: 8 },
    { label: "Excellent", value: "EXCELLENT", score: 10 }
  ],
  commentEnabled: true
}
```

If every competency row has different wording, support row-level option overrides:

```ts
rowOptionOverrides: {
  communication: [
    { label: "Needs to improve", value: "NEEDS_IMPROVEMENT", score: 3 },
    { label: "Good communicator", value: "GOOD_COMMUNICATOR", score: 8 },
    { label: "Exceeds expectations", value: "EXCEEDS_EXPECTATIONS", score: 10 }
  ]
}
```

Competency calculation:

```text
Competency Section = 40%
Leadership Row Weight = 10%
Selected Excellent = 10/10

Contribution = 40 * 0.10 * 1.00
Contribution = 4 points out of 100
```

## 12. Runtime Rules

Employee objective screen:

- Employee sees predefined objectives if the template provides them.
- Employee can add rows only in employee-owned objective buckets.
- Employee can edit only in `OBJECTIVE_SETTING_OPEN` or `OBJECTIVE_REVISION_REQUIRED`.
- Employee cannot edit manager-created objectives.
- Employee cannot enter ratings or scores.

Manager objective screen:

- Manager can approve or return employee-created objectives for assigned/hierarchy-authorized employees.
- Manager return requires mandatory comment.
- Manager can add manager-owned objectives.
- Manager-created objectives immediately transition to approved.
- Manager-created objectives do not require employee approval.

Manager review screen:

- Loads approved objectives only.
- Review allowed only in `MANAGER_REVIEW_OPEN`.
- Manager enters ratings/scores using locked template scoring rules.
- Option score is calculated server-side.
- Quarter score is stored after submission/finalization.
- Employee cannot edit manager review fields.

Annual decision screen:

- Management/HR/Admin can enter confidential annual decisions where permitted.
- Final grade/merit fields are confidential by default.
- Annual decisions must be frozen before visibility publication.
- Frozen annual decisions must not recalculate from newer templates or scoring rules.

## 13. Template Activation Validation

Before template activation:

- Section scoring weights must total 100, unless a configured policy allows partial scoring.
- Objective bucket weights must total 100 inside each objective section.
- Objective row weights for predefined objectives must satisfy the configured row weight mode.
- Dynamic objective sections must define allowed owner buckets.
- Scoring fields must have `scoringConfig`.
- Option-based scoring fields must have numeric `score` on every scoring option.
- Option score cannot exceed `maxScore`.
- Weighted fields must have weightage.
- Competency matrix rows must have either equal weight or configured row weights.
- Required field rules must be configured.
- Workflow behavior rules must be valid.
- Visibility rules must be valid.
- Confidential decision fields must have visibility rules.
- Invalid template configurations must be rejected before activation.

## 14. Objective Submission Validation

Before objective submission:

- Required objective entry columns must be filled.
- Employee can submit only employee-owned objectives.
- Employee cannot submit manager-owned objective rows.
- Employee dynamic objective row weights must total 100 within the employee bucket.
- Submitted employee objectives must transition to `OBJECTIVE_SUBMITTED`.
- Manager-created objectives must immediately transition to `OBJECTIVE_APPROVED`.
- Manager-created objectives must not require employee approval.

## 15. Manager Review Submission Validation

Before review submission:

- Assignment must be in `MANAGER_REVIEW_OPEN`.
- Manager must be assigned or hierarchy-authorized.
- Approved objectives must exist unless exception closure applies.
- Every required manager rating must be selected.
- Selected option must exist in the locked template version snapshot.
- Score must be calculated from locked template scoring config.
- Review score snapshot must be stored.
- Submission must transition to `MANAGER_REVIEW_SUBMITTED`.

## 16. Snapshot and Historical Integrity

All scoring must use locked template version data.

Required snapshot points:

- Annual assignment locks PMS template version.
- Quarter assignment uses the locked PMS template version.
- Manager review score calculation stores a calculation snapshot.
- Annual decision/finalization stores historical scoring output.
- Communication generation locks letter template version.

Do not recalculate finalized decisions using changed template/scoring rules.

Historical records must render using the original template version and stored snapshots.

## 17. Builder UI Updates

Section configuration panel:

```text
Section Type
[Static / Competency / Dynamic Objectives / Review / Decision]

Section Weightage
[ 40 ]

Scoring Enabled
[Yes / No]

Scoring Method
[Weighted / Average / Manual]
```

Objective section panel:

```text
Objective Buckets

Template Predefined: 20%
Employee Dynamic: 50%
Manager Dynamic: 30%

Total: 100%
```

Objective repeater panel:

```text
Entry Columns
- Objective Title
- KPI
- Target
- Weightage
- Due Date
- Success Criteria

Manager Review Columns
- Achievement
- Rating
- Score
- Manager Comment
```

Option scoring UI:

```text
Options

Label          Value       Score
Below          BELOW       3
Average        AVERAGE     6
Good           GOOD        8
Excellent      EXCELLENT   10

Max Score: 10
```

Validation bar:

```text
Template scoring total: 100%
Objective bucket total: 100%
Employee objective row total: 85% - 15% remaining
```

Runtime preview:

```text
Preview As:
- Employee
- Manager
- HR/Admin
- Management
- Director
```

Preview must show:

- Hidden fields excluded
- Read-only fields disabled
- Editable fields enabled
- Scoring fields marked
- Calculated scores previewed
- Confidential fields masked unless visible for selected role/context

## 18. Backend Implementation Order

Phase 1: scoring correctness and builder clarity

1. Add/normalize `fieldCategory`.
2. Add/normalize `semanticRole`.
3. Standardize `options.score` as option scoring source of truth.
4. Add/normalize section type aliases for PMS UI.
5. Add objective bucket metadata.
6. Add template activation validation.
7. Add server-side scoring utility for option, numeric, boolean, percentage, matrix, and objective repeater scoring.
8. Store calculation snapshot on quarter review submission.
9. Add unit tests for option scoring, bucket weightage, row weightage, and locked template scoring.

Phase 2: runtime and UX

1. Update template builder section panel.
2. Add objective bucket UI.
3. Show Objective Repeater as business field type.
4. Show Competency Matrix as business field type.
5. Add option score editor.
6. Add global and per-section validation bars.
7. Update role-based preview.
8. Update objective workspace to respect buckets and ownership.
9. Update manager review workspace to calculate and display server-calculated score.

Phase 3: advanced scoring

1. Formula engine.
2. Conditional scoring.
3. Advanced calculated fields.
4. Score normalization policies.
5. Score rounding policies.
6. Weighted annual rollup policies.

## 19. API/Service Expectations

Template service:

- Save field category and semantic role.
- Save option scores.
- Validate scoring config before activation.
- Validate objective buckets before activation.
- Resolve template using role, workflow state, hierarchy, quarter, and visibility.

Objective service:

- Create employee-owned objectives only in allowed state.
- Create manager-owned objectives with auto-approval.
- Validate row weights inside bucket.
- Preserve objective source and owner.
- Lock approved objectives.

Quarter review service:

- Load approved objectives.
- Accept manager ratings only.
- Reject invalid option values.
- Calculate score server-side.
- Store score snapshot.
- Prevent finalized review edits.

Visibility service:

- Exclude confidential fields from unauthorized API responses.
- Apply employee/manager visibility independently.
- Keep final grade/merit hidden until explicit publish.

Audit service:

- Audit template changes.
- Audit objective changes.
- Audit manager review submission.
- Audit scoring snapshot.
- Audit visibility changes.

## 20. Test Coverage Required

Template tests:

- Invalid option score rejected.
- Score above maxScore rejected.
- Objective bucket total not 100 rejected.
- Section scoring total not 100 rejected.
- Confidential decision field without visibility rejected.
- Locked template version cannot be structurally edited.

Objective tests:

- Employee can create employee-owned objective in objective window.
- Employee cannot edit manager-created objective.
- Employee objective requires manager approval.
- Manager-created objective auto-approved.
- Invalid row weightage rejected.
- Approved objective read-only.

Review tests:

- Employee cannot submit rating.
- Manager can rate assigned employee only.
- Invalid option value rejected.
- Score calculated from locked template version.
- Review submission stores snapshot.
- Finalized review cannot be edited.

Visibility tests:

- Grade hidden before publish.
- Merit hidden before publish.
- Employee and manager visibility separated.
- Director read-only scoped access.
- Hidden confidential fields excluded from API response.

## 21. Final Target Structure

```text
Template Version
 └── Sections
      ├── Static Employee Details
      ├── Competency Matrix
      │    └── Rows + option scores + comments
      ├── Objective Section
      │    ├── Template Predefined Objective Bucket
      │    ├── Employee Dynamic Objective Bucket
      │    └── Manager Dynamic Objective Bucket
      ├── Manager Review
      └── Annual Decision
```

This design keeps the builder Director-friendly while staying aligned to PMS v2:

- Quarterly objectives
- Manager-driven review
- No employee self-rating
- No employee acceptance
- Configurable option scores
- Configurable section/bucket/row weightage
- Server-side score calculation
- Locked template version scoring
- Confidential visibility governance
- Immutable historical snapshots
