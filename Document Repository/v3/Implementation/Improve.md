# PMS Improvements Reference

## Design Thumb Rule

The PMS design goal must stay:

```txt
Robust inside.
Simple outside.
```

The system can have strong validation, workflow rules, scoring safety, audit trail, and permission protection internally. But HR/Admin, manager, and employee users should see a simple guided flow.

Target customer experience:

```txt
1. Select starter template
2. Check sections
3. Set simple weightage
4. Launch cycle
5. Employee submits achievement
6. Manager reviews
7. Management gives final decision
8. Employee receives communication
```

Avoid exposing these by default:

```txt
Too many flags
Too many permission controls
Complex formula/scoring options
Duplicate visible/editable settings
Technical workflow names
Weightage redistribution confusion
```

Default product behaviour:

```txt
Default = simple and guided
Advanced = hidden unless needed
System = validates and protects
```

This rule applies to all improvements below.

---

## Recommended Implementation Order

The improvement numbers below follow our discussion order. For actual development, use this implementation order:

```txt
Step 1: Improvement 3 - Starter Template Update Based on Manufacturer Appraisal Forms
Step 2: Improvement 2 - Configurable Objective Scoring and Weightage Policy
Step 3: Improvement 4 - Template Builder Permission Setup Simplification
Step 4: Improvement 1 - Objective-Linked Employee Achievement Submission
```

Reason:

```txt
First fix the starter template structure.
Then finalize scoring and weightage rules for those sections.
Then simplify permissions based on the final template sections and fields.
Then connect employee achievement submission against objectives.
```

So yes, Improvement 1 is not the first implementation step. It should be built after the template, scoring, and permission foundation is clear.

---

## Pre-Implementation Gap Check

The major business areas are covered in this document:

```txt
Starter template structure
Manufacturer form alignment
Scoreable vs non-scoreable sections
Objective weightage rules
Manager/employee-created objective rules
Objective-linked achievement submission
Additional contributions
Training and career follow-up sections
Permission simplification
Simple vs advanced setup
```

Before implementation, the following small decisions should be made clearly.

### 1. Final Default Score Split

The document mentions possible simple defaults:

```txt
Performance Objectives       40% or 50%
Traits and Competencies      40%
Attendance / Overall         10% to 20%
```

Before coding the starter template, choose one default.

Recommended default for manufacturing starter:

```txt
Performance Objectives       50%
Traits and Competencies      40%
Manager Overall Assessment   10%
```

Keep Attendance / Health as non-scoreable by default unless the customer explicitly wants it in score.

### 2. Starter Template Boundary

Final simplification decision:

```txt
Template = what users must fill for this cycle.
System context = existing employee/PMS history shown read-only outside the template.
```

Starter templates should stay simple:

```txt
Employee Information
Assessment Term Objectives
Employee Achievement Submission
Traits and Competencies
Manager Review
Annual Decision
Communication Governance
```

Do not add these as starter-template fields by default:

```txt
Previous year rating
Career history
Years in grade
Promotion history
Training history
Career progression
Employee response / acknowledgement
Special achievements / CFT
Attendance / health notes
```

If this data already exists in employee master, PMS history, attendance, or training modules, show it as a read-only context panel in Annual Decision or Manager Review instead of storing it as template input.

### 3. Permission Source of Truth

Implementation should avoid two competing permission systems.

Decision:

```txt
Field-level permission is the source of truth.
Section permission is only a bulk helper or read-only summary.
```

Preview, backend resolver, and runtime UI should follow the same permission interpretation.

### 4. Backward Compatibility

Existing templates and assignments should not break.

Implementation rule:

```txt
Existing generic achievement items remain supported.
Existing templates keep their current sections.
New starter template changes apply only when applying/regenerating starter templates.
Objective-linked achievement fields are optional during migration.
```

### 5. Advanced Settings Visibility

Do not remove advanced functionality, but hide it from the default path.

Default user path:

```txt
Starter template
Simple scoring
Standard permissions
Launch cycle
```

Advanced path:

```txt
Custom section editing
Custom permission overrides
Custom scoring rules
Objective scoring flags
```

### Final Gap Check Result

No major missing business area is found before implementation.

The main correction is to avoid overengineering the starter template. Business context can be displayed outside the template.

---

## Improvement 1: Objective-Linked Employee Achievement Submission

### Discussion Summary

Current question:

```txt
Achievement submission objective against irukkanuma?
Or separate/general achievement entry enough ah?
Example: no objective was set, but employee did useful work.
```

Decision recommendation:

```txt
Best design = objective-wise achievement submission + additional contributions section.
```

The achievement submission should primarily be connected to approved objectives so manager review can compare target vs actual. At the same time, the system should allow employee to record work done outside planned objectives through an `Additional Contributions` section.

This is a stronger PMS design than a purely general achievement list.

---

### Current Implementation

Current implementation is term-level/general achievement submission.

Files involved:

```txt
Server/src/models/pms-employee-achievement-submission.model.ts
Server/src/services/employeeAchievementSubmission.service.ts
Server/src/routes/employeeAchievementSubmission.routes.ts
Client/src/lib/components/pms/achievements/EmployeeAchievementWorkspace.svelte
Client/src/lib/services/api/pmsEmployeeAchievements.ts
Client/src/lib/types/pms.ts
```

Current model shape:

```txt
employee_achievement_submissions
  annualAssignmentId
  quarterAssignmentId
  cycleId
  employeeId
  managerId
  templateVersionId
  quarterCode
  achievementItems[]
    subject
    description
    attachments[]
  achievementValues[]
  status
```

Current UI behavior:

```txt
Employee Achievement Submission
  - Achievement Subject
  - Achievement Description
  - Optional supporting file
```

Current backend behavior:

- Submission is allowed only during `EMPLOYEE_ACHIEVEMENT_OPEN`.
- Employee can save draft.
- Employee can submit.
- Submitted achievement becomes locked.
- Manager can view it as reference during manager review.
- Achievement rows are not linked to objective records.
- `achievementItems` do not store `objectiveId`.
- Backend does not validate that each approved objective has achievement text.
- Backend does not distinguish objective-linked achievements from additional contributions.

Current flow:

```txt
Term
  -> generic achievement item 1
  -> generic achievement item 2
  -> attachments
```

Not current flow:

```txt
Objective A
  -> achievement against Objective A

Objective B
  -> achievement against Objective B

Additional Contributions
  -> work outside objectives
```

---

### Current Issue

The current design is usable but weak for structured PMS review.

Main issues:

- Manager cannot directly compare each objective target against employee achievement.
- Achievement submission is not clearly tied to approved objectives.
- If an employee writes one generic achievement paragraph, manager must manually map it to objectives.
- Manager review scoring becomes harder to justify because evidence is not objective-wise.
- Audit/history is weaker because final term score cannot easily be traced from objective -> achievement -> manager rating.
- Employee-created and manager-created objectives are currently context-only, so achievement submission does not clarify whether those context objectives were addressed.
- If no objectives were set, current generic submission works, but it does not make that situation explicit as an exception.

Important related finding:

```txt
Current objective scoring only applies to PREDEFINED/template objectives.
Employee-created and manager-created objectives are context-only.
They do not carry weightage and do not participate in manager review scoring.
```

Therefore, the current system has two separate limitations:

1. Achievement submission is not linked to objectives.
2. Employee/manager-created objectives are not weighted or scored.

These are related but separate design decisions.

---

### Best Approach

Use a hybrid achievement model:

```txt
Approved Objective Achievements
  - One achievement entry per approved objective
  - Employee enters actual achievement, evidence, comments, attachments

Additional Contributions
  - Employee can add extra work not covered by objectives
  - Visible to manager
  - Used as supporting evidence or discretionary input
```

Recommended business rule:

```txt
Objective-linked achievements are the primary evidence for manager review.
Additional contributions are secondary evidence.
```

---

### Recommended UX Design

During `EMPLOYEE_ACHIEVEMENT_OPEN`, show the employee all approved objectives for the selected assessment term.

For each approved objective:

```txt
Objective title
Description
KPI / target metric
Target value
Due date
Weightage, if applicable
Employee achievement text
Employee evidence / attachment
Employee remarks
```

Then provide an additional section:

```txt
Additional Contributions
  - Contribution subject
  - Contribution description
  - Impact / outcome
  - Attachment
```

Expected employee screen:

```txt
Q1 Achievement Submission

Objective 1: Reduce machine downtime
Target: Reduce downtime by 10%
Weightage: 40%
[Employee achievement text]
[Attachment]

Objective 2: Improve quality checks
Target: Reduce defects by 5%
Weightage: 30%
[Employee achievement text]
[Attachment]

Additional Contributions
[Add contribution]
```

---

### Recommended Backend Model Change

Extend achievement item structure.

Suggested model:

```ts
achievementItems: [
  {
    type: 'OBJECTIVE' | 'ADDITIONAL',
    objectiveId?: ObjectId,
    objectiveSnapshot?: {
      title: string,
      description?: string,
      targetMetric?: string,
      targetValue?: string,
      targetDate?: Date,
      weightage?: number,
      source?: string
    },
    subject: string,
    description: string,
    outcome?: string,
    attachments: []
  }
]
```

Reason for `objectiveSnapshot`:

- Objective title/target can change after reopen/correction.
- Achievement submission should preserve what employee responded to at submission time.
- Useful for audit and history.

Recommended indexes:

```txt
quarterAssignmentId
annualAssignmentId + quarterCode
employeeId + cycleId + quarterCode
achievementItems.objectiveId
```

---

### Recommended Validation Rules

For submit:

```txt
If achievementSubmissionRequired = true:
  at least one achievement entry is required.

If objectiveLinkedAchievementRequired = true:
  each approved scoring objective must have an achievement entry.

If objectiveLinkedAchievementRequired = false:
  employee can submit partial objective achievements plus additional contributions.
```

Recommended new template config:

```ts
employeeAchievementConfig: {
  employeeAchievementEnabled: true,
  achievementSubmissionRequired: true,
  objectiveLinkedAchievementRequired: true,
  additionalContributionsEnabled: true,
  allowManagerReviewWithoutAchievement: false,
  managerCanEditEmployeeAchievement: false
}
```

Validation examples:

```txt
Approved Objective A has no achievement text.
-> Block submit if objectiveLinkedAchievementRequired = true.

No objective exists, but employee added Additional Contribution.
-> Allow submit if additionalContributionsEnabled = true.

No objective exists and no additional contribution exists.
-> Block submit if achievementSubmissionRequired = true.
```

---

### Recommended Manager Review Behavior

Manager Review should show objective, employee achievement, and manager rating together.

Recommended layout:

```txt
Objective
Target / KPI
Employee Achievement
Employee Evidence
Manager Rating
Manager Comment
```

This improves review quality because manager can score with direct evidence.

Additional contributions should appear below objective review:

```txt
Additional Contributions
  - Visible to manager
  - Manager can mention in comments
  - Can influence discretionary remarks or final recommendation
```

By default, additional contributions should not automatically affect objective score unless the template explicitly includes a scoring section for it.

---

### Scoring Design

Current scoring behavior:

```txt
Only PREDEFINED/template objectives are rateable.
Employee-created and manager-created objectives are context-only.
```

This means objective-linked achievements can be implemented in two stages.

Stage 1:

```txt
Link achievement submission to all approved objectives.
Keep scoring only for predefined/template objectives.
Employee/manager-created objectives remain context-only.
```

Stage 2, optional future enhancement:

```txt
Allow employee-created and manager-created objectives to participate in scoring.
Add weightage or equal-distribution scoring rule.
```

Recommended Stage 1 behavior:

- Predefined objectives:
  - achievement required
  - manager rating required
  - contributes to term score

- Employee-created objectives:
  - achievement allowed
  - manager can comment
  - no score contribution unless future scoring config enables it

- Manager-created objectives:
  - achievement allowed
  - manager can comment
  - no score contribution unless future scoring config enables it

This avoids changing scoring rules immediately while improving evidence capture.

---

### Edge Cases

#### Case 1: Objectives Exist

Expected behavior:

```txt
Employee submits achievement against each objective.
Additional contributions optional.
Manager reviews objective-wise achievement and gives rating.
```

#### Case 2: No Objectives Were Set

Expected behavior:

```txt
Employee can submit Additional Contributions.
System should flag that no approved objectives exist.
Manager review should follow template exception rule.
```

Recommended UI message:

```txt
No approved objectives are available for this term. Add work completed under Additional Contributions.
```

Recommended backend behavior:

```txt
If no approved objectives and achievementSubmissionRequired = true:
  allow Additional Contributions only if additionalContributionsEnabled = true.
```

#### Case 3: Objective Reopened / Corrected

Expected behavior:

```txt
Existing submitted achievement remains locked.
If admin reopens the term, employee achievement may need correction policy.
Objective snapshot must preserve original submitted context.
```

#### Case 4: Manager Review Already Open

Expected behavior:

```txt
Employee cannot edit achievement submission.
Manager sees submitted achievement as read-only reference.
```

This is already aligned with current behavior.

---

### Migration Approach

Recommended incremental implementation:

1. Add optional `type`, `objectiveId`, and `objectiveSnapshot` fields to achievement item schema.
2. Keep existing `subject`, `description`, and `attachments` fields for backward compatibility.
3. Update `getSubmission` API to return approved objectives for the term.
4. Update employee achievement UI:
   - render objective-linked achievement rows first
   - render additional contributions below
5. Update save/submit payload to include objective-linked items.
6. Add validation flags in template metadata.
7. Update manager review UI to show objective achievement beside manager rating.
8. Keep existing generic achievement items as `type = ADDITIONAL` during migration.

Backward-compatible mapping:

```txt
Existing achievement item without objectiveId
-> treat as ADDITIONAL contribution
```

---

### Recommended Final Design

Final preferred model:

```txt
Objective Setting
  -> approved objectives

Employee Achievement Submission
  -> objective-wise achievements
  -> additional contributions

Manager Review
  -> objective target
  -> employee achievement
  -> manager rating/comment
  -> term score

Annual Decision
  -> uses finalized term score
  -> grade / merit / nil / remarks
```

This gives the cleanest line of evidence:

```txt
Objective
-> Employee Achievement
-> Manager Review Rating
-> Term Score
-> Annual Decision
```

---

### Final Recommendation

Current implementation can continue for a simple demo or MVP, but for a proper PMS workflow this should be improved.

Recommended priority:

```txt
High
```

Reason:

- It improves fairness.
- It improves auditability.
- It makes manager scoring easier to justify.
- It handles both planned objectives and unplanned work.
- It fits quarterly, half-yearly, and yearly terms.

Recommended implementation style:

```txt
Do not remove current generic achievement items immediately.
Extend them into objective-linked and additional-contribution item types.
```

## Improvement 2: Configurable Objective Scoring and Weightage Policy

### Discussion Summary

Current question:

```txt
How should predefined, manager-created, and employee-created objectives participate in scoring?
How should weightage be controlled so total scoreable objective weightage does not exceed 100%?
How can this be kept simple for non-IT manufacturing customers?
```

Confirmed business decisions:

```txt
1. Employee-created objectives can affect score only if manager approves and assigns weightage.
2. Manager-created objectives can affect score only if template flag allows it.
3. Scoreable objective weightage must be finalized before objective setting closes / before achievement opens.
4. If weightage is incomplete, block by default. Optionally allow user-confirmed Manager Overall Assessment for the remaining weightage.
5. Weight redistribution when manager adds new objectives is still open. Need simplest customer-friendly option.
6. Predefined objectives should not support Not Applicable in this phase.
7. Use one Performance Objectives bucket for now.
8. Additional contributions do not automatically affect score. Manager can review them and mention in comments/recommendation.
9. Once achievement submission starts, no one can change objective weightage except through future admin reopen/correction workflow.
10. UI should use simple customer wording, not technical scoring config names.
```

---

### Current Implementation

Current objective scoring behavior:

```txt
PREDEFINED/template objectives:
  - Can have weightage.
  - Can be rated in Manager Review.
  - Participate in objective scoring.

EMPLOYEE_CREATED objectives:
  - Context-only.
  - No weightage.
  - No score.
  - Manager approval is required, but approval does not assign score weightage today.

MANAGER_CREATED objectives:
  - Context-only.
  - Approved immediately.
  - No weightage.
  - No score.
```

Current code intentionally blocks scoring fields for employee-created and manager-created objectives:

```txt
weightage
rating
score
weightedScore
targetMetric
targetValue
targetDate
successCriteria
```

Current manager review only rates predefined/template objectives.

Current issue:

```txt
If business wants employee-created or manager-created objectives to be scored, current implementation does not support it.
```

---

### Target Design

Use a simple objective scoring policy controlled from template setup.

Recommended template-level setting:

```txt
Flexible Objective Scoring
  OFF:
    Only predefined objectives affect score.

  ON:
    Manager-created objectives can affect score if manager assigns weightage.
    Employee-created objectives can affect score only after manager approval and manager-assigned weightage.
```

Customer-facing wording:

```txt
Do new objectives affect score?
  - No, use new objectives as notes only.
  - Yes, manager assigns weightage.
```

Do not expose technical labels like:

```txt
participatesInScoring
sectionScoringConfig
aggregationMethod
fieldCategory
```

---

### Objective Types

#### Predefined Objectives

Default behavior:

```txt
Scoreable by default.
Weightage comes from template / objective setup.
Manager gives rating during Manager Review.
```

Rules:

```txt
Predefined objectives cannot be marked Not Applicable in this phase.
Predefined objective weightage participates in the Performance Objectives bucket.
```

#### Manager-Created Objectives

If template flag is OFF:

```txt
Manager-created objective is context-only.
No weightage.
No manager review rating.
Does not affect score.
```

If template flag is ON:

```txt
Manager can create objective with weightage.
System validates total scoreable objective weightage <= 100.
Objective is approved immediately.
Manager rates it during Manager Review.
```

Suggested UI:

```txt
Create Manager Objective

Title
Description
Priority
Expected Outcome

[ ] Include this objective in score
Weightage: [ 10 ] %

Used weightage: 80%
Available weightage: 20%
```

#### Employee-Created Objectives

Employee creation behavior:

```txt
Employee can create objective.
Employee cannot assign scoring weightage.
Employee cannot decide if it affects score.
```

Manager approval behavior:

```txt
Manager reviews employee-created objective.
Manager approves or rejects.
If template allows flexible scoring, manager can include it in scoring and assign weightage during approval.
```

Suggested UI:

```txt
Approve Employee Objective

Title: Improve tool changeover process
Priority: High
Expected Outcome: Reduce setup time

[ ] Include this objective in score
Weightage: [ 10 ] %

Used weightage: 80%
Available weightage: 20%
```

Rules:

```txt
Employee-created objective can affect score only after manager approval.
Manager must assign weightage if the objective is included in score.
System validates total scoreable objective weightage <= 100.
```

---

### Weightage Rules

Use one simple Performance Objectives bucket in this phase.

```txt
Performance Objectives bucket total = 100%
```

Inside the bucket:

```txt
Predefined objective A = 40%
Predefined objective B = 40%
Employee-created objective C = 20%
Total = 100%
```

Hard rules:

```txt
Total scoreable objective weightage cannot exceed 100 at any time.
Total scoreable objective weightage must equal 100 before objective setting closes / before achievement opens.
Once achievement opens, objective weightage cannot be changed.
```

If total is less than 100:

```txt
Block workflow by default.
```

Example:

```txt
Current scoreable objective weightage = 80%
Remaining = 20%

Cannot move to Employee Achievement Open.
Please adjust objective weightage to 100% or add Manager Overall Assessment for the remaining 20%.
```

Optional user-confirmed fallback:

```txt
Add Manager Overall Assessment for remaining weightage.
```

Example:

```txt
Predefined objectives = 80%
Manager Overall Assessment = 20%
Total = 100%
```

Important:

```txt
Do not silently auto-normalize 80% to 100%.
System should not change business importance without user confirmation.
```

---

### Open Decision: Simple Weight Redistribution

Question:

```txt
If predefined objectives already total 100%, and manager wants to add a scoreable objective, how should weightage be adjusted?
```

Possible options:

#### Option A: Block Until Admin/Manager Reduces Existing Weightage

Behavior:

```txt
Existing total = 100%
New objective = 10%
System blocks and asks user to reduce existing objectives by 10%.
```

Pros:

- Most accurate.
- No hidden system changes.
- Easy to audit.

Cons:

- More work for manager/admin.

#### Option B: Auto-Redistribute Existing Objectives

Behavior:

```txt
Existing objectives are automatically reduced proportionally.
New objective gets requested weightage.
```

Pros:

- Fast.

Cons:

- Risky for non-IT customers.
- System changes business importance automatically.
- Can surprise users.

#### Option C: Add as Context-Only When No Weightage Is Available

Behavior:

```txt
If total is already 100%, new objective is created as context-only.
Manager can still mention it in review.
It does not affect score.
```

Pros:

- Simple.
- Safe.
- No redistribution complexity.

Cons:

- Manager cannot score the new objective unless weightage is manually freed.

Recommended simple approach:

```txt
Use Option C by default.
If manager wants it to affect score, show a simple "Adjust Weightage" action.
```

Customer-facing message:

```txt
All score weightage is already used.
This objective will be saved as a note only.

To include it in score, reduce weightage from another objective.
```

This is the least confusing design for manufacturing customers.

---

### Manager Review Behavior

Manager Review should split objectives into two clear groups.

```txt
Scoring Objectives
  - predefined scoreable objectives
  - approved employee-created objectives included in score
  - manager-created objectives included in score
  - manager rating required

Context Objectives
  - employee-created objectives not included in score
  - manager-created objectives not included in score
  - visible for reference
  - no rating required
```

Manager review screen should show:

```txt
Objective title
Employee achievement
Weightage
Manager rating
Manager comment
```

Additional contributions:

```txt
Visible to manager as supporting evidence.
No automatic score impact.
Manager can mention in remarks/recommendation.
```

---

### Workflow Gate

Before moving from objective setting to achievement:

```txt
Check scoreable objective weightage.
If scoreable objective total = 100:
  allow transition to EMPLOYEE_ACHIEVEMENT_OPEN

If scoreable objective total < 100:
  block transition

If scoreable objective total > 100:
  block save/approval immediately
```

Required message:

```txt
Objective scoring is incomplete.
Used: 80%
Remaining: 20%

Complete objective weightage before opening achievement submission.
```

---

### Data Model Proposal

Minimal objective fields:

```ts
participatesInScoring?: boolean;
weightage?: number;
scoringAssignedBy?: ObjectId;
scoringAssignedAt?: Date;
scoringAssignmentReason?: string;
```

For predefined objectives:

```txt
participatesInScoring = true
weightage = template/admin value
```

For manager-created objectives:

```txt
participatesInScoring = template flag and manager choice
weightage = manager assigned value if scoreable
```

For employee-created objectives:

```txt
participatesInScoring = manager approval choice
weightage = manager assigned value if scoreable
```

---

### Template Setup UX

Use one simple area in template builder:

```txt
Performance Objectives

Predefined objectives affect score by default.

Do new objectives affect score?
  ( ) No, use them as notes only
  ( ) Yes, manager assigns weightage

When should weightage be complete?
  Before achievement submission opens
```

Show a live meter:

```txt
Used: 80%
Remaining: 20%
```

Show friendly warnings:

```txt
You still have 20% weightage remaining.
Add another objective, adjust weightage, or add Manager Overall Assessment.
```

---

### Starter Template Impact

Because the target design uses one `Performance Objectives` bucket, starter templates should be updated.

Recommended starter template objective setup:

```txt
Performance Objectives = one scoring bucket
Predefined objective rows total = 100%
Manager-created / employee-created objective scoring = OFF by default
```

For manufacturer default:

```txt
Performance Objectives       40%
Skills / Competency          25%
Discipline / Attendance      20%
Teamwork / Behaviour         15%
Manager Remarks              No score
```

Inside `Performance Objectives`, predefined objective row weights must total 100%.

Example:

```txt
Production Target            40%
Quality Improvement          30%
Safety / Process Compliance  30%
```

---

### Final Recommendation

Use this policy:

```txt
Predefined objectives are scoreable by default.
Manager-created objectives can be scoreable only if template allows.
Employee-created objectives can be scoreable only after manager approval and manager-assigned weightage.
Scoreable objective weightage cannot exceed 100.
Scoreable objective weightage must equal 100 before achievement opens.
If total is already 100, new objectives are context-only unless user adjusts weightage.
Additional contributions do not automatically affect score.
```

This gives a robust scoring system without over-engineering and keeps the customer experience simple.

---

## Improvement 3: Starter Template Update Based on Manufacturer Appraisal Forms

### Why This Improvement Is Needed

The sample manufacturer appraisal forms show a practical paper-based PMS pattern.

It is not only a score sheet. It combines:

```txt
Employee profile
Objectives set and achieved
Traits and competencies
Special achievements
Attendance / health
Training needs
Career progression
Promotion / job rotation recommendation
Employee response
Manager / department head / management approval
```

So our PMS template should not force every section into scoring. Some sections are for review, some are for HR action, and some are for management decision.

This improvement is mainly about updating the predefined/starter template structure.

Current starter template generation is code-driven here:

```txt
Client/src/lib/components/pms/templates/starterTemplates.ts
```

The production/manufacturing starter currently has predefined objective and competency sets. This file should be updated when we align the system starter template with the manufacturer paper forms.

---

### Latest Simplification Decision

Do not copy every paper-form section into the starter template.

The starter template must remain simple and department-specific.

Recommended starter-template sections:

```txt
Employee Information
Assessment Term Objectives
Employee Achievement Submission
Traits and Competencies
Manager Review
Annual Decision
Communication Governance
```

Department-specific starters should keep department-specific predefined objectives and traits/competencies.

Examples:

```txt
Production starter:
  Production, safety, quality, machine/process, housekeeping objectives
  Production-specific traits and competencies

Quality starter:
  Inspection, defect control, documentation, corrective action objectives
  Quality-specific traits and competencies

Stores starter:
  Stock accuracy, material issue, GRN/documentation, storage objectives
  Stores-specific traits and competencies
```

Do not add these as starter-template fields by default:

```txt
Previous year rating
Career progression
Career history
Years in grade
Promotion / job rotation recommendation
Training history
Training effectiveness
Employee response / acknowledgement
Special achievements / CFT
Attendance / health notes
```

These should be shown as read-only context outside the template if the data already exists in PMS, employee master, training, attendance, or HR history.

Final rule:

```txt
Template captures current-cycle appraisal inputs only.
System context panels show historical/reference data.
```

---

### What the Sample Forms Contain

#### 1. Employee Profile

Fields shown in the sample:

```txt
Name
Year
Age
Employee number
Designation
Qualification
Department
Years in company
Grade
Years in grade
Previous experience
```

Recommended handling:

```txt
System-filled / read-only
No score
Visible in appraisal view and annual decision view
```

These fields should not be manually configured by normal users for every cycle.

---

#### 2. Performance Objectives

The sample form has:

```txt
Objectives Set
Objectives Achieved
Performance Analysis
```

This matches our planned direction:

```txt
Objective-wise achievement submission
Manager review against each objective
Additional achievement section for work outside objectives
```

Recommended handling:

```txt
Scoreable section
Employee submits achievement against objective
Manager reviews achievement against objective
Manager can add performance analysis comment
```

This confirms Improvement 1 is correct.

---

#### 3. Traits and Competencies

The sample uses a simple 4-level tick-box rating for each trait.

Example traits:

```txt
Job Knowledge / Skills
Communication Skills
Interpersonal Skills
Planning / Execution
Meeting time targets
Quantity of work
Quality of work
Teamwork / Co-operation
Leadership
Decision Making ability
Cost conscious
Customer orientation
```

Each trait has:

```txt
Rating option
Explanatory comment
```

Recommended handling:

```txt
Scoreable section
Manager fills it
Use a fixed 4-level scale
Allow optional comment per trait
```

This should be simple for manufacturing customers. Avoid making every trait a complex configurable scoring rule in the first version.

---

#### 4. Special Achievements and Additional Contributions

The sample has:

```txt
Special achievement / accomplishments
Additional qualifications
Contribution to CFTs
Distinct improvements over previous years
Areas for improvement
```

Recommended handling:

```txt
Non-scoreable by default
Visible to manager during review
Manager can consider it while giving overall remarks
Not automatically added to objective score
```

This confirms our earlier decision:

```txt
Additional contributions should not automatically affect score.
```

They are evidence/context, not direct marks.

---

#### 5. Training Identification

The sample has a separate training identification page:

```txt
Gap from competency mapping
Proposed training in function / domain area
Proposed training in personality development / soft skills
Training imparted during review period
Evaluation of training effectiveness
```

Recommended handling:

```txt
Non-scoreable section
Filled after or during appraisal completion
Manager / appraiser proposes training
Employee and department head can acknowledge
HR/Admin receives it as training input
```

This is a gap in Improvement 2. Improvement 2 covers scoring and weightage, but it does not explicitly capture training needs as an HR follow-up output.

Simple product wording:

```txt
Training Needs
Skill gap
Recommended training
Training already attended
Training effectiveness
```

---

#### 6. Career Progression and Potential

The sample has:

```txt
Career progression - past
Current job level
Promotion potential
Job rotation recommended
Proposed functional areas
This year
Next 2-3 years
Previous year rating
Appraiser overall assessment
DIC / management assessment
```

Recommended handling:

```txt
Management / department head section
Annual-only
Non-scoreable by default
Used for annual decision, promotion, job rotation, and succession planning
```

This should not be mixed into normal employee achievement submission.

---

#### 7. Employee Response and Signatures

The sample includes:

```txt
Comments / response by the appraisee
Signature of appraisee
Signature of appraiser
Signature of unit / department head
Date
```

Recommended handling:

```txt
Acknowledgement workflow
Employee response after manager review
Manager submit
Department head / management approve
No score
Audit trail instead of physical signature
```

This maps well to our communication and annual decision flow.

---

### Role Ownership From the Sample

The form is split by responsibility.

Recommended role ownership:

```txt
Admin / HR:
  Creates template
  Launches cycle
  Owns employee profile data
  Receives training needs

Employee:
  Submits achievements against objectives
  Adds special achievements / CFT contribution
  Gives response after appraisal

Manager / Appraiser:
  Reviews objectives
  Rates traits and competencies
  Writes performance analysis
  Recommends training
  Recommends career movement

Department Head / Management:
  Reviews final rating
  Confirms promotion / rotation / career decision
  Adds management assessment
```

This is cleaner than exposing every section to every user.

---

### Scoreable vs Non-Scoreable Sections

Recommended default classification:

```txt
Scoreable:
  Performance Objectives
  Traits and Competencies
  Optional Attendance / Discipline / Overall Rating

Non-scoreable:
  Employee profile
  Special achievements
  CFT contribution
  Areas for improvement
  Training needs
  Training effectiveness
  Career progression
  Promotion / job rotation recommendation
  Employee response
  Signatures / acknowledgement
```

Special achievements can influence manager judgement, but the system should not auto-convert them into marks.

---

### Comparison With Improvement 2

Improvement 2 correctly captures:

```txt
Template scoring control
Performance Objectives bucket
Predefined objective weightage
Manager-created objective scoring flag
Employee-created objective approval and weightage
100% weightage validation
No automatic score for additional contributions
```

What Improvement 2 missed:

```txt
Training needs as a formal HR follow-up section
Career progression / potential section
Previous year rating and career history reference
Employee response / acknowledgement after appraisal
Clear role ownership for manager, department head, HR, and management
```

These missing items are not scoring problems. They are appraisal workflow and form-design sections.

---

### Overengineering Check

For this manufacturer customer, avoid showing a complex scoring engine first.

Do not make the default setup depend on:

```txt
Many scoring flags
Many calculation modes
Complex redistribution rules
Score formulas per field
Advanced objective scoring logic
```

Recommended simple default:

```txt
Performance Objectives       40%
Traits and Competencies      40%
Attendance / Discipline      10%
Manager Overall Assessment   10%
```

Alternative simpler version:

```txt
Performance Objectives       50%
Traits and Competencies      40%
Manager Overall Assessment   10%
```

Keep training, career, special achievements, employee response, and signatures outside score.

---

### Updated Starter Template Recommendation

For manufacturing customers, the starter template should look like this:

```txt
1. Employee Details
   Auto-filled, read-only, no score

2. Performance Objectives
   Objective set, achievement, manager review, performance analysis
   Scoreable

3. Traits and Competencies
   4-level rating grid with comments
   Scoreable

4. Special Achievements and CFT Contribution
   Employee / manager comments
   No score

5. Attendance, Discipline, and Health
   Manager/Admin reference
   Optional score depending on company policy

6. Training Needs
   Skill gap, proposed functional training, proposed soft-skill training
   No score

7. Career Progression and Potential
   Promotion, job rotation, functional area recommendation
   Management section
   No score

8. Final Rating and Annual Decision
   Manager rating, department head/management decision
   Uses score summary plus management judgement

9. Employee Response and Acknowledgement
   Employee comments and audit trail
   No score
```

---

### Final Design Decision

The clean solution is:

```txt
Keep scoring simple.
Keep objective achievement linked to objectives.
Keep traits and competencies as a simple manager rating grid.
Keep special achievements as context.
Keep training and career progression as HR/management follow-up.
Keep flexible objective scoring behind a template flag.
```

This matches the manufacturer paper forms and avoids overengineering for non-IT users.

---

## Improvement 4: Template Builder Permission Setup Simplification

### Why This Improvement Is Needed

The Template Builder currently has more than one permission control area.

This can feel redundant for HR/Admin users, especially for manufacturing customers who need a simple and safe setup.

Current permission-related areas:

```txt
1. Standard PMS Permissions tab
2. Advanced field permissions
3. Section Access Permissions inside the section builder
```

These are technically different, but from a customer point of view they look like they are asking the same question:

```txt
Who can see this?
Who can edit this?
```

---

### Current Behaviour

#### 1. Standard PMS Permissions

Current code area:

```txt
Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte
```

The simple Permission tab shows:

```txt
Standard PMS Permissions
Role vs Preset access table
Use preset button
Open Advanced Permissions button
Readiness checks
```

This table is good and user-friendly.

It explains the default access model:

```txt
Employee:
  Create objectives, submit achievements, view published results

Manager:
  Approve objectives, create manager objectives, submit review

HR/Admin:
  Manage template, assignments, visibility, communication, corrections

Management:
  Annual appraisal decision

Director:
  Read-only hierarchy view
```

When the user clicks `Use preset`, the system applies a permission baseline through:

```txt
applyStandardPermissionPreset()
```

That function updates field-level permission data:

```txt
field.visibility.roles
field.editableRoles
field.visibility.workflowStates
field.visibility.hierarchyScopes
field.visibility.publishFlags
field.behaviors
```

This is the correct main permission model.

---

#### 2. Advanced Field Permissions

Advanced permissions allow detailed control per field:

```txt
Role visibility
Role editability
Hierarchy scope
Workflow state visibility
Publish flag dependency
```

This is useful for technical/admin users, but should not be the default customer-facing path.

Recommended handling:

```txt
Keep it behind Advanced Permissions.
Do not expose it as the main setup flow for manufacturing customers.
```

---

#### 3. Section Access Permissions

Current code area:

```txt
Client/src/lib/components/pms/templates/SectionBuilder.svelte
```

This section-level control updates:

```txt
section.permissions
```

It lets the user mark a whole section as:

```txt
VISIBLE / HIDDEN
EDITABLE / READONLY
```

This looks useful, but it creates possible confusion because fields inside the section also have their own permission model.

Example mismatch:

```txt
Section permission:
  Employee = Hidden

Field permission:
  Employee = Visible
```

This can confuse users and can also create inconsistent behaviour between preview, builder, and runtime rendering if all areas do not resolve permissions the same way.

---

### What Is Redundant

The redundant-looking parts are:

```txt
Standard PMS Permissions table
Section Access Permissions
Advanced field permissions
```

But they are not equally valuable.

Recommended view:

```txt
Standard PMS Permissions table:
  Keep. This is the simple user-friendly entry point.

Advanced field permissions:
  Keep. This is needed for complex customers and edge cases.

Section Access Permissions:
  Do not keep as an independent permission source in simple flow.
```

---

### Recommended Simple Design

For manufacturing customers, permissions should work like this:

```txt
Step 1:
  User selects starter template.

Step 2:
  System applies Standard PMS Permissions automatically.

Step 3:
  User sees a simple role access table.

Step 4:
  If needed, user opens Advanced Permissions.
```

The simple permission table is enough for most customers.

---

### Recommended Product Behaviour

Use one main permission source:

```txt
Field-level permissions are the source of truth.
```

Section-level permissions should become one of these:

```txt
Option A - Hide in simple mode
Option B - Show as read-only summary derived from field permissions
Option C - Make it a bulk shortcut that updates all fields inside the section
```

Best recommendation:

```txt
Use Option C for advanced builder:
Section permission = bulk edit helper
Field permissions = saved source of truth
```

This means:

```txt
If user marks section Employee Hidden,
system should update all fields inside that section as Employee Hidden.

If user marks section Manager Editable,
system should update all editable-capable fields inside that section as Manager Editable.
```

Do not save section permission as a competing independent rule unless backend/runtime consistently enforces it everywhere.

---

### Final Recommendation

Keep the Permission tab simple:

```txt
Standard PMS Permissions table
Use preset button
Readiness checks
Advanced Permissions button
```

Improve the section permission area:

```txt
Do not show it as a separate independent permission system.
Convert it into a bulk field-permission helper or hide it in simple mode.
```

This avoids overengineering and makes permissions easier for non-IT HR/Admin users.
