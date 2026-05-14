# PMS v2 Database Design Model

> Purpose: Production-ready database design for PMS v2, aligned with the approved FSD, Scope, Baseline, and implementation direction.  
> Storage direction: Current implementation targets MongoDB and must remain compatible with future Azure Cosmos DB MongoDB API migration.

---

# 1. Design Principle

Use **separate transactional collections** for workflow-critical data and use **dynamic JSON only where the business truly needs template flexibility**.

Do **not** store the full PMS record as one giant JSON document. That becomes difficult to query, report, audit, secure, and evolve.

Best model:

```text
Template Definition Layer
  pms_templates
  pms_template_versions

Cycle Configuration Layer
  annual_cycles
  quarter_cycles

Assignment Layer
  annual_assignments
  quarter_assignments

Objective Layer
  objectives
  objective_attachments
  objective_comments
  objective_evidence

Quarter Review Layer
  quarter_reviews
  quarter_review_values

Annual Decision Layer
  annual_decisions
  annual_decision_values

Governance Layer
  visibility_configurations
  communication_dispatches
  audit_logs
  correction_layers
  performance_history_snapshots
  workflow_events
  delegations
  reassignments
  assignment_exception_queue
  letter_templates
  letter_template_versions
  bulk_operation_jobs
  notification_events
  sla_events
```

This matches PMS v2:

```text
Annual Parent Cycle
-> Q1/Q2/Q3/Q4 Quarter Assignments
-> Objective Setting
-> Manager Objective Approval / Return
-> Manager Quarterly Review
-> Quarter Finalization
-> Annual Appraisal Decision
-> Visibility Governance
-> Communication Dispatch
-> Immutable History and Audit
```

Important PMS v2 rule:

Employee self-review, employee sign-off, dual rating, and parallel approval are **not** part of PMS v2.

If employee-entered quarterly text is required, store it as:

```text
employee objective progress note
employee evidence
employee comment
```

Do **not** model it as official employee self-review or employee rating.

---

# 2. Why This Model Is Best

This model is better than one large nested document because it gives:

| Benefit | Why It Matters |
|---|---|
| Fast UI rendering | Dashboards load summary collections without parsing huge records |
| Clean workflow control | Annual and quarter states are stored separately |
| Easy reporting | Reports can query by cycle, employee, manager, quarter, status, grade, merit, and outcome |
| Template flexibility | Template versions are locked per assignment |
| Historical safety | Old records render using original template versions |
| Role-wise values | Same field key can store different values by role/stage without overwrite |
| Confidentiality | Grade/merit can be hidden until visibility publish |
| Audit integrity | Corrections preserve original values instead of overwriting |
| Scalability | Objectives, reviews, values, communications, and audit logs can grow independently |

---

# 3. MongoDB / Cosmos-Compatible Collection Model

Although a relational SQL-style design is useful for thinking, the current PMS implementation should use MongoDB-compatible collections.

Recommended collections:

```text
pms_templates
pms_template_versions
annual_cycles
quarter_cycles
annual_assignments
quarter_assignments
objectives
objective_attachments
objective_comments
objective_evidence
quarter_reviews
quarter_review_values
annual_decisions
annual_decision_values
visibility_configurations
communication_dispatches
audit_logs
correction_layers
performance_history_snapshots
bulk_operation_jobs
workflow_events
delegations
reassignments
assignment_exception_queue
letter_templates
letter_template_versions
notification_events
sla_events
```

Use normal indexed fields for workflow/reporting-critical data:

```text
employeeId
managerId
cycleId
quarter
workflowState
status
isGradeApplied
isMeritApplied
appraisalOutcomeType
visibility flags
submittedAt
finalizedAt
frozenAt
```

Use dynamic JSON for flexible configuration/value areas:

```text
template sections
template fields
validation rules
visibility rules
editability rules
scoring config
letter placeholders
conditional blocks
dynamic field values
snapshots
```

## 3.1 Standard Document Fields

Every mutable collection should carry the same operational metadata unless there is a strong reason not to.

```json
{
  "isDeleted": false,
  "createdBy": "user_id",
  "updatedBy": "user_id",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "version": 1
}
```

Exception: append-only collections such as `audit_logs` and `workflow_events` must use create-only metadata (`createdBy`, `createdAt`) and must not carry update/delete/version fields.

Use `version` as an optimistic-lock field on workflow-heavy collections:

```text
annual_assignments
quarter_assignments
objectives
quarter_reviews
annual_decisions
```

All submit, approve, return, finalize, freeze, reopen, visibility, and correction updates should filter by `_id` and current `version`, then increment `version` in the same update. This prevents double-submit, double-approve, and concurrent freeze/reopen overwrite issues.

---

# 4. Workflow State Ownership Rule

The PMS workflow statuses are already approved in the PMS v2 source documents. This schema does not introduce new workflow stages.

## 4.1 Annual Assignment State

`annual_assignments.annualState` is the source of truth for the employee's annual PMS lifecycle.

Allowed values:

```text
DRAFT
SCHEDULED
ACTIVE
IN_PROGRESS
ALL_QUARTERS_FINALIZED
APPRAISAL_WINDOW_OPEN
MANAGEMENT_DECISION_DRAFT
MANAGEMENT_DECISION_SUBMITTED
ANNUAL_FINALIZED
VISIBILITY_ENABLED
COMMUNICATION_READY
COMMUNICATION_SENT
CLOSED
ARCHIVED
CANCELLED
```

## 4.2 Annual Decision Status

`annual_decisions.decisionStatus` tracks only the management decision lifecycle.

Allowed values:

```text
DRAFT
SUBMITTED
FROZEN
VISIBILITY_ENABLED
CLOSED
```

Do not merge `annualState` and `decisionStatus`.

## 4.3 Quarter Assignment State

`quarter_assignments.quarterState` is the source of truth for quarter workflow.

Allowed values:

```text
NOT_STARTED
OBJECTIVE_SETTING_OPEN
OBJECTIVE_DRAFT
OBJECTIVE_SUBMITTED
OBJECTIVE_REVISION_REQUIRED
OBJECTIVE_APPROVED
MANAGER_REVIEW_OPEN
MANAGER_REVIEW_SUBMITTED
QUARTER_FINALIZED
REOPENED_BY_ADMIN
CLOSED_BY_ADMIN
```

## 4.4 Quarter Review Status

`quarter_reviews.reviewStatus` is not a separate workflow engine. It is a derived/lightweight review status based on `quarter_assignments.quarterState`.

Allowed values:

```text
MANAGER_REVIEW_OPEN
MANAGER_REVIEW_SUBMITTED
FINALIZED
```

## 4.5 Objective Status

`objectives.status` must use PMS workflow state names:

```text
OBJECTIVE_DRAFT
OBJECTIVE_SUBMITTED
OBJECTIVE_REVISION_REQUIRED
OBJECTIVE_APPROVED
```

Do not use shortened values like `DRAFT`, `SUBMITTED`, or `APPROVED`.

## 4.6 Transition Governance

All state transitions must be validated through `workflow.service.ts`.

Do not hardcode workflow transitions inside controllers, models, or individual modules.

## 4.7 Reopen Rule

Reopen is correction-only. Do not physically revert or overwrite historical records.

Use:

```text
workflow_events
audit_logs
correction_layers
```

---

# 5. Template Design

## 5.1 `pms_templates`

Stores template identity only.

```json
{
  "_id": "tpl_001",
  "code": "PMS_STD_2026",
  "name": "Standard PMS Template",
  "description": "Standard PMS v2 template",
  "status": "ACTIVE",
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "version": 1
}
```

Recommended indexes:

```js
{ code: 1 } unique
{ status: 1 }
```

## 5.2 `pms_template_versions`

Every cycle or assignment must lock a template version. Future template edits must not alter in-progress or historical assignments.

For MongoDB, keep sections and fields embedded inside the template version. This is faster for UI rendering because the form can be loaded in one read.

```json
{
  "_id": "tplv_001",
  "templateId": "tpl_001",
  "versionNo": 1,
  "status": "ACTIVE",
  "isLocked": true,
  "effectiveFrom": "2026-01-01",
  "effectiveTo": null,
  "themeConfig": {},
  "scoringConfig": {
    "objectiveWeightageTotal": 100
  },
  "sections": [
    {
      "sectionKey": "objectives",
      "sectionLabel": "Quarter Objectives",
      "sectionType": "OBJECTIVES",
      "level": "QUARTER",
      "repeatFor": ["Q1", "Q2", "Q3", "Q4"],
      "displayOrder": 1,
      "visibilityRules": {
        "visibleTo": ["EMPLOYEE", "MANAGER", "HR_ADMIN"]
      },
      "editabilityRules": {
        "editableBy": ["EMPLOYEE", "MANAGER"],
        "editableStates": ["OBJECTIVE_SETTING_OPEN", "OBJECTIVE_REVISION_REQUIRED"]
      },
      "fields": [
        {
          "fieldKey": "title",
          "fieldLabel": "Objective Title",
          "fieldType": "SHORT_TEXT",
          "isRequired": true,
          "displayOrder": 1,
          "validationRules": {
            "maxLength": 200
          },
          "visibilityRules": {
            "visibleTo": ["EMPLOYEE", "MANAGER", "HR_ADMIN"]
          },
          "editabilityRules": {
            "editableBy": ["EMPLOYEE", "MANAGER"]
          }
        },
        {
          "fieldKey": "weightage",
          "fieldLabel": "Weightage",
          "fieldType": "PERCENTAGE",
          "isRequired": true,
          "displayOrder": 2,
          "validationRules": {
            "min": 0,
            "max": 100
          },
          "scoringConfig": {
            "participatesInScoring": true
          }
        }
      ]
    },
    {
      "sectionKey": "manager_quarter_review",
      "sectionLabel": "Manager Quarterly Review",
      "sectionType": "QUARTER_REVIEW",
      "level": "QUARTER",
      "repeatFor": ["Q1", "Q2", "Q3", "Q4"],
      "displayOrder": 2,
      "fields": [
        {
          "fieldKey": "manager_rating",
          "fieldLabel": "Manager Rating",
          "fieldType": "RATING_SCALE",
          "isRequired": true,
          "validationRules": {
            "required": true,
            "min": 1,
            "max": 5
          },
          "visibilityRules": {
            "visibleTo": ["MANAGER", "HR_ADMIN", "MANAGEMENT"]
          },
          "editabilityRules": {
            "editableBy": ["MANAGER"],
            "editableStates": ["MANAGER_REVIEW_OPEN"]
          }
        },
        {
          "fieldKey": "manager_comments",
          "fieldLabel": "Manager Comments",
          "fieldType": "LONG_TEXT",
          "isRequired": true,
          "validationRules": {
            "required": true,
            "maxLength": 4000
          },
          "visibilityRules": {
            "visibleTo": ["MANAGER", "HR_ADMIN", "MANAGEMENT"]
          },
          "editabilityRules": {
            "editableBy": ["MANAGER"],
            "editableStates": ["MANAGER_REVIEW_OPEN"]
          }
        }
      ]
    },
    {
      "sectionKey": "final_decision",
      "sectionLabel": "Annual Appraisal Decision",
      "sectionType": "FINAL_GRADE",
      "level": "ANNUAL",
      "displayOrder": 3,
      "fields": [
        {
          "fieldKey": "isGradeApplied",
          "fieldLabel": "Grade Applied",
          "fieldType": "BOOLEAN",
          "isRequired": true,
          "validationRules": {
            "required": true
          },
          "visibilityRules": {
            "visibleTo": ["MANAGEMENT", "HR_ADMIN"]
          },
          "editabilityRules": {
            "editableBy": ["MANAGEMENT", "HR_ADMIN"],
            "editableStates": ["APPRAISAL_WINDOW_OPEN", "MANAGEMENT_DECISION_DRAFT"]
          }
        },
        {
          "fieldKey": "isMeritApplied",
          "fieldLabel": "Merit Applied",
          "fieldType": "BOOLEAN",
          "isRequired": true,
          "validationRules": {
            "required": true
          },
          "visibilityRules": {
            "visibleTo": ["MANAGEMENT", "HR_ADMIN"]
          },
          "editabilityRules": {
            "editableBy": ["MANAGEMENT", "HR_ADMIN"],
            "editableStates": ["APPRAISAL_WINDOW_OPEN", "MANAGEMENT_DECISION_DRAFT"]
          }
        }
      ]
    }
  ],
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-05T00:00:00.000Z",
  "version": 1,
  "lockedAt": "2026-01-05T00:00:00.000Z"
}
```

Supported section types:

```text
OBJECTIVES
COMPETENCIES
KPIS
BEHAVIOURAL_TRAITS
DEVELOPMENT_PLAN
QUARTER_REVIEW
ANNUAL_SUMMARY
FINAL_GRADE
MERIT
APPRAISAL_COMMUNICATION
OVERALL_FEEDBACK
```

Supported field types:

```text
SHORT_TEXT
LONG_TEXT
NUMERIC_INPUT
DROPDOWN
RADIO
CHECKBOX
DATE
RATING_SCALE
WEIGHTED_SCORE
CURRENCY
PERCENTAGE
ATTACHMENT
RICH_TEXT
FORMULA
COMMENT_BOX
BOOLEAN
```

Template rule standard:

```text
validationRules = all required, min/max, regex, format, and custom validation rules
visibilityRules = all role, stage, field, and condition-based visibility rules
editabilityRules = all role, stage, field, and condition-based edit permissions
```

Do not place `editableBy`, `visibleTo`, `required`, `min`, `max`, or similar rule keys directly at random field-root levels except for stable display metadata like `isRequired`. Keep executable behavior under the three rule objects so the runtime renderer and API validator evaluate the same structure.

Recommended indexes:

```js
{ templateId: 1, versionNo: 1 } unique
{ status: 1 }
{ isLocked: 1 }
```

---

# 6. Cycle Design

## 6.1 `annual_cycles`

Annual parent cycle.

```json
{
  "_id": "cycle_2026",
  "code": "PMS_2026",
  "name": "Performance Cycle 2026",
  "appraisalYear": 2026,
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "templateVersionId": "tplv_001",
  "status": "ACTIVE",
  "appraisalWindowConfig": {
    "type": "RELATIVE_OFFSET",
    "base": "Q4_FINALIZATION",
    "offsetDays": 30
  },
  "communicationRuleConfig": {
    "bothMode": "COMBINED",
    "meritOnlyTemplateId": "ltr_merit_001",
    "gradeOnlyTemplateId": "ltr_grade_001",
    "combinedTemplateId": "ltr_both_001",
    "nilPolicy": "GENERIC_MAIL",
    "genericTemplateId": "ltr_generic_001"
  },
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T09:00:00.000Z",
  "version": 1,
  "launchedAt": "2026-01-01T09:00:00.000Z",
  "closedAt": null
}
```

Approved annual statuses:

```text
DRAFT
SCHEDULED
ACTIVE
IN_PROGRESS
ALL_QUARTERS_FINALIZED
APPRAISAL_WINDOW_OPEN
MANAGEMENT_DECISION_DRAFT
MANAGEMENT_DECISION_SUBMITTED
ANNUAL_FINALIZED
VISIBILITY_ENABLED
COMMUNICATION_READY
COMMUNICATION_SENT
CLOSED
ARCHIVED
CANCELLED
```

Recommended indexes:

```js
{ code: 1 } unique
{ appraisalYear: 1 }
{ status: 1 }
{ templateVersionId: 1 }
```

## 6.2 `quarter_cycles`

One quarter definition per annual cycle.

```json
{
  "_id": "cycle_2026_q1",
  "cycleId": "cycle_2026",
  "quarterCode": "Q1",
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "objectiveSettingWindow": {
    "startDate": "2026-01-01",
    "endDate": "2026-01-05"
  },
  "objectiveApprovalWindow": {
    "startDate": "2026-01-06",
    "endDate": "2026-01-10"
  },
  "managerReviewWindow": {
    "startDate": "2026-03-25",
    "endDate": "2026-03-31"
  },
  "slaConfig": {
    "objectiveSubmissionDueDays": 5,
    "managerReviewDueDays": 7
  },
  "closureRules": {
    "allowAdminClose": true
  },
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "version": 1
}
```

Recommended indexes:

```js
{ cycleId: 1, quarterCode: 1 } unique
{ startDate: 1, endDate: 1 }
```

---

# 7. Employee Yearly Performance Record

## `annual_assignments`

This is the main yearly employee performance record. There must be one annual assignment per employee per cycle.

```json
{
  "_id": "aa_1001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_501",
  "assignedManagerId": "mgr_101",
  "templateVersionId": "tplv_001",
  "annualState": "IN_PROGRESS",
  "applicableQuarters": ["Q1", "Q2", "Q3", "Q4"],
  "assignmentReason": "FULL_YEAR",
  "finalDecisionStatus": "DRAFT",
  "isGradeApplied": null,
  "isMeritApplied": null,
  "appraisalOutcomeType": null,
  "visibility": {
    "cacheSource": "visibility_configurations",
    "employeeReviewVisible": false,
    "employeeGradeVisible": false,
    "employeeMeritVisible": false,
    "managerGradeVisible": false,
    "managerMeritVisible": false
  },
  "communicationStatus": "NOT_REQUIRED",
  "employeeSnapshot": {
    "employeeCode": "E501",
    "name": "Suresh Kumar",
    "designation": "Senior Engineer",
    "department": "Engineering",
    "location": "India"
  },
  "managerSnapshot": {
    "managerId": "mgr_101",
    "name": "Manager Name"
  },
  "orgSnapshot": {
    "businessUnit": "Technology",
    "region": "APAC"
  },
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "version": 1
}
```

Annual assignment eligibility fields:

```text
applicableQuarters = quarters that count for this employee's annual PMS eligibility and decision
assignmentReason = why the employee has this quarter coverage
```

Annual decision readiness and final score/summary logic must consider only `applicableQuarters`, not blindly require Q1-Q4 for every employee.

Full-year employee:

```json
{
  "_id": "aa_1001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_501",
  "assignedManagerId": "mgr_101",
  "templateVersionId": "tplv_001",
  "annualState": "IN_PROGRESS",
  "applicableQuarters": ["Q1", "Q2", "Q3", "Q4"],
  "assignmentReason": "FULL_YEAR"
}
```

Mid-year joiner:

```json
{
  "_id": "aa_1002",
  "cycleId": "cycle_2026",
  "employeeId": "emp_777",
  "assignedManagerId": "mgr_101",
  "templateVersionId": "tplv_001",
  "annualState": "IN_PROGRESS",
  "applicableQuarters": ["Q3", "Q4"],
  "assignmentReason": "MID_YEAR_JOINER"
}
```

Exit before year-end:

```json
{
  "_id": "aa_1003",
  "cycleId": "cycle_2026",
  "employeeId": "emp_888",
  "assignedManagerId": "mgr_101",
  "templateVersionId": "tplv_001",
  "annualState": "IN_PROGRESS",
  "applicableQuarters": ["Q1", "Q2"],
  "assignmentReason": "EXITED_MID_YEAR"
}
```

Visibility note:

```text
visibility_configurations = source of truth
annual_assignments.visibility = denormalized dashboard cache only
```

The application must update visibility through the Visibility Governance service only. That service updates `visibility_configurations`, refreshes the annual assignment cache, and writes audit logs together as one governed operation.

Why store snapshots?

Employee department, designation, manager, grade, region, and business unit may change later. The PMS record must preserve the context at assignment time.

Recommended indexes:

```js
{ cycleId: 1, employeeId: 1 } unique
{ employeeId: 1 }
{ assignedManagerId: 1 }
{ cycleId: 1, annualState: 1 }
{ cycleId: 1, appraisalOutcomeType: 1 }
```

---

# 8. Quarter Assignment Design

## `quarter_assignments`

One document per employee per quarter.

```json
{
  "_id": "qa_1001_q1",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "cycleQuarterId": "cycle_2026_q1",
  "quarterCode": "Q1",
  "employeeId": "emp_501",
  "assignedManagerId": "mgr_101",
  "quarterState": "OBJECTIVE_APPROVED",
  "objectiveSubmittedAt": "2026-01-05T10:00:00.000Z",
  "objectiveApprovedAt": "2026-01-07T10:00:00.000Z",
  "managerReviewSubmittedAt": null,
  "finalizedAt": null,
  "closedAt": null,
  "quarterScore": null,
  "quarterRating": null,
  "quarterSummary": {},
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "mgr_101",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-07T10:00:00.000Z",
  "version": 3
}
```

Approved quarter statuses:

```text
NOT_STARTED
OBJECTIVE_SETTING_OPEN
OBJECTIVE_DRAFT
OBJECTIVE_SUBMITTED
OBJECTIVE_REVISION_REQUIRED
OBJECTIVE_APPROVED
MANAGER_REVIEW_OPEN
MANAGER_REVIEW_SUBMITTED
QUARTER_FINALIZED
REOPENED_BY_ADMIN
CLOSED_BY_ADMIN
```

Recommended indexes:

```js
{ annualAssignmentId: 1, quarterCode: 1 } unique
{ cycleQuarterId: 1, quarterState: 1 }
{ assignedManagerId: 1, quarterState: 1 }
{ employeeId: 1, cycleId: 1, quarterCode: 1 }
```

---

# 9. Objective Design

## 9.1 `objectives`

Objectives are separate documents because each quarter can have multiple objectives.

```json
{
  "_id": "obj_001",
  "quarterAssignmentId": "qa_1001_q1",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "quarterCode": "Q1",
  "employeeId": "emp_501",
  "assignedManagerId": "mgr_101",
  "objectiveNo": 1,
  "title": "Improve customer onboarding completion rate",
  "description": "Increase onboarding completion from 72% to 85%",
  "targetMetric": "Completion Rate",
  "targetValue": "85%",
  "targetDate": "2026-03-31",
  "weightage": 40,
  "successCriteria": "Completion rate >= 85%",
  "source": "EMPLOYEE_CREATED",
  "status": "OBJECTIVE_APPROVED",
  "createdByRole": "EMPLOYEE",
  "createdByUserId": "emp_501",
  "approvedBy": "mgr_101",
  "approvedAt": "2026-01-07T10:00:00.000Z",
  "returnedReason": null,
  "isDeleted": false,
  "createdBy": "emp_501",
  "updatedBy": "mgr_101",
  "createdAt": "2026-01-02T10:00:00.000Z",
  "updatedAt": "2026-01-07T10:00:00.000Z",
  "version": 4
}
```

Manager-created objective:

```json
{
  "_id": "obj_002",
  "quarterAssignmentId": "qa_1001_q1",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "quarterCode": "Q1",
  "employeeId": "emp_501",
  "assignedManagerId": "mgr_101",
  "objectiveNo": 2,
  "title": "Reduce support escalations",
  "description": "Reduce L2 escalations by improving documentation",
  "targetMetric": "Escalation Count",
  "targetValue": "< 20/month",
  "weightage": 60,
  "source": "MANAGER_CREATED",
  "status": "OBJECTIVE_APPROVED",
  "createdByRole": "MANAGER",
  "createdByUserId": "mgr_101",
  "approvedBy": "mgr_101",
  "approvedAt": "2026-01-02T10:00:00.000Z",
  "isDeleted": false,
  "createdBy": "mgr_101",
  "updatedBy": "mgr_101",
  "createdAt": "2026-01-02T10:00:00.000Z",
  "updatedAt": "2026-01-02T10:00:00.000Z",
  "version": 1
}
```

Manager-created objectives are auto-approved and do not require employee approval.

Objective status must use PMS workflow state names only:

```text
OBJECTIVE_DRAFT
OBJECTIVE_SUBMITTED
OBJECTIVE_REVISION_REQUIRED
OBJECTIVE_APPROVED
```

Do not use shortened objective statuses such as `DRAFT`, `SUBMITTED`, `APPROVED`, or `REVISION_REQUIRED` in persisted data.

Recommended indexes:

```js
{ quarterAssignmentId: 1 }
{ annualAssignmentId: 1, quarterCode: 1 }
{ employeeId: 1, cycleId: 1 }
{ assignedManagerId: 1, status: 1 }
{ status: 1 }
```

## 9.2 `objective_attachments`

```json
{
  "_id": "att_001",
  "objectiveId": "obj_001",
  "fileName": "q1-proof.pdf",
  "fileUrl": "https://storage.example.com/q1-proof.pdf",
  "fileType": "application/pdf",
  "fileSize": 120003,
  "uploadedBy": "emp_501",
  "uploadedByRole": "EMPLOYEE",
  "visibilityRules": {
    "visibleTo": ["EMPLOYEE", "MANAGER", "HR_ADMIN"]
  },
  "versionNo": 1,
  "uploadedAt": "2026-03-20T10:00:00.000Z",
  "isDeleted": false,
  "createdBy": "emp_501",
  "updatedBy": "emp_501",
  "createdAt": "2026-03-20T10:00:00.000Z",
  "updatedAt": "2026-03-20T10:00:00.000Z",
  "version": 1
}
```

## 9.3 `objective_comments`

```json
{
  "_id": "objc_001",
  "objectiveId": "obj_001",
  "quarterAssignmentId": "qa_1001_q1",
  "commentType": "EMPLOYEE_PROGRESS_NOTE",
  "commentText": "Completed rollout for onboarding improvements.",
  "actorUserId": "emp_501",
  "actorRole": "EMPLOYEE",
  "isDeleted": false,
  "createdBy": "emp_501",
  "updatedBy": "emp_501",
  "createdAt": "2026-03-20T10:00:00.000Z",
  "updatedAt": "2026-03-20T10:00:00.000Z",
  "version": 1
}
```

This supports employee-entered evidence/comments without introducing employee self-review.

## 9.4 `objective_evidence`

Use this collection when employee or manager uploads proof/progress evidence that is not tied to a threaded comment.

```json
{
  "_id": "obje_001",
  "objectiveId": "obj_001",
  "quarterAssignmentId": "qa_1001_q1",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "quarterCode": "Q1",
  "employeeId": "emp_501",
  "evidenceType": "PROGRESS_EVIDENCE",
  "title": "Onboarding rollout proof",
  "description": "Evidence for completion-rate improvement work.",
  "attachmentIds": ["att_001"],
  "submittedByRole": "EMPLOYEE",
  "submittedBy": "emp_501",
  "submittedAt": "2026-03-20T10:00:00.000Z",
  "isDeleted": false,
  "createdBy": "emp_501",
  "updatedBy": "emp_501",
  "createdAt": "2026-03-20T10:00:00.000Z",
  "updatedAt": "2026-03-20T10:00:00.000Z",
  "version": 1
}
```

Employee evidence must not carry employee rating fields. It is supporting material for the manager-driven quarterly review.

---

# 10. Quarter Review Design

## 10.1 `quarter_reviews`

One summary document per quarter assignment.

```json
{
  "_id": "qr_1001_q1",
  "quarterAssignmentId": "qa_1001_q1",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_501",
  "managerId": "mgr_101",
  "reviewStatus": "MANAGER_REVIEW_SUBMITTED",
  "overallScore": 4.2,
  "overallRating": "EXCEEDS_EXPECTATIONS",
  "finalQuarterRemarks": "Strong delivery across Q1 objectives.",
  "recommendation": "Continue high-impact API optimization work.",
  "submittedAt": "2026-03-31T10:00:00.000Z",
  "finalizedAt": null,
  "isDeleted": false,
  "createdBy": "mgr_101",
  "updatedBy": "mgr_101",
  "createdAt": "2026-03-31T10:00:00.000Z",
  "updatedAt": "2026-03-31T10:00:00.000Z",
  "version": 2
}
```

Quarter review status is derived from the quarter assignment workflow and must not become a separate workflow engine:

```text
MANAGER_REVIEW_OPEN
MANAGER_REVIEW_SUBMITTED
FINALIZED
```

Recommended indexes:

```js
{ quarterAssignmentId: 1 } unique
{ managerId: 1, reviewStatus: 1 }
{ cycleId: 1, reviewStatus: 1 }
```

## 10.2 `quarter_review_values`

This stores role-wise and field-wise dynamic values.

For the same `fieldKey`, multiple values can be stored by different roles, actors, and stages without overwriting each other.

```json
{
  "_id": "qrv_001",
  "quarterReviewId": "qr_1001_q1",
  "quarterAssignmentId": "qa_1001_q1",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_501",
  "templateFieldId": "field_manager_comments",
  "fieldKey": "manager_comments",
  "sectionKey": "manager_quarter_review",
  "roleCode": "MANAGER",
  "actorUserId": "mgr_101",
  "workflowStage": "MANAGER_REVIEW",
  "valueJson": null,
  "valueText": "Employee achieved the target and improved onboarding quality.",
  "valueNumber": null,
  "valueDate": null,
  "valueStatus": "ACTIVE",
  "submittedAt": "2026-03-31T10:00:00.000Z",
  "isDeleted": false,
  "createdBy": "mgr_101",
  "updatedBy": "mgr_101",
  "createdAt": "2026-03-31T10:00:00.000Z",
  "updatedAt": "2026-03-31T10:00:00.000Z",
  "version": 1
}
```

Employee evidence/comment example:

```json
{
  "_id": "qrv_002",
  "quarterReviewId": "qr_1001_q1",
  "quarterAssignmentId": "qa_1001_q1",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_501",
  "fieldKey": "achievement_evidence",
  "sectionKey": "objective_evidence",
  "roleCode": "EMPLOYEE",
  "actorUserId": "emp_501",
  "workflowStage": "OBJECTIVE_PROGRESS",
  "valueText": "Completed rollout for onboarding improvements.",
  "valueStatus": "ACTIVE",
  "submittedAt": "2026-03-28T10:30:00.000Z",
  "isDeleted": false,
  "createdBy": "emp_501",
  "updatedBy": "emp_501",
  "createdAt": "2026-03-28T10:30:00.000Z",
  "updatedAt": "2026-03-28T10:30:00.000Z",
  "version": 1
}
```

This is **not** employee self-review. It is employee evidence/progress data.

Recommended indexes:

```js
{ quarterReviewId: 1, fieldKey: 1, roleCode: 1, actorUserId: 1 }
{ quarterAssignmentId: 1, sectionKey: 1 }
{ cycleId: 1, employeeId: 1 }
{ fieldKey: 1, roleCode: 1 }
```

---

# 11. Annual Final Management Review

## 11.1 `annual_decisions`

```json
{
  "_id": "ad_1001",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_501",
  "decisionStatus": "FROZEN",
  "isGradeApplied": true,
  "isMeritApplied": true,
  "appraisalOutcomeType": "BOTH",
  "finalScore": 4.25,
  "finalRating": "EXCEEDS_EXPECTATIONS",
  "gradeDetails": {
    "gradeValue": "A",
    "gradeScale": "Company Grade Scale 2026",
    "gradeEffectiveDate": "2026-04-01",
    "gradeRemarks": "Consistently exceeded expectations."
  },
  "meritDetails": {
    "meritType": "PERCENTAGE",
    "meritPercentage": 12,
    "meritAmount": null,
    "currency": "INR",
    "meritEffectiveDate": "2026-04-01",
    "payrollEffectiveDate": "2026-04-30",
    "meritRemarks": "Approved based on performance and budget."
  },
  "nilReason": null,
  "managementRemarks": "Consistent delivery across all quarters.",
  "decidedBy": "mgt_001",
  "submittedBy": "mgt_001",
  "frozenBy": "mgt_001",
  "submittedAt": "2026-04-20T10:00:00.000Z",
  "frozenAt": "2026-04-20T12:00:00.000Z",
  "isDeleted": false,
  "createdBy": "mgt_001",
  "updatedBy": "mgt_001",
  "createdAt": "2026-04-20T10:00:00.000Z",
  "updatedAt": "2026-04-20T12:00:00.000Z",
  "version": 3
}
```

The system must store:

```text
isGradeApplied
isMeritApplied
appraisalOutcomeType
```

Decision status and annual assignment state are separate. Use the ownership rule in section 4 as the source of truth:

| Field | Allowed State Set | Purpose |
|---|---|---|
| `annual_decisions.decisionStatus` | `DRAFT`, `SUBMITTED`, `FROZEN`, `VISIBILITY_ENABLED`, `CLOSED` | Tracks only the final management decision lifecycle |
| `annual_assignments.annualState` | Approved annual workflow states such as `ANNUAL_FINALIZED`, `VISIBILITY_ENABLED`, `COMMUNICATION_READY`, `COMMUNICATION_SENT`, `CLOSED` | Tracks the employee-year assignment workflow lifecycle |

`FROZEN` is valid for `annual_decisions.decisionStatus`. Do not store `FROZEN` in `annual_assignments.annualState`; once the annual decision is finalized/frozen, the assignment should move through the approved annual workflow states.

Outcome derivation:

| isGradeApplied | isMeritApplied | appraisalOutcomeType |
|---|---|---|
| true | true | BOTH |
| false | true | MERIT_ONLY |
| true | false | GRADE_ONLY |
| false | false | NIL |

Recommended indexes:

```js
{ annualAssignmentId: 1 } unique
{ employeeId: 1, cycleId: 1 }
{ cycleId: 1, appraisalOutcomeType: 1 }
{ decisionStatus: 1 }
```

## 11.2 `annual_decision_values`

For additional dynamic final appraisal fields.

```json
{
  "_id": "adv_001",
  "annualDecisionId": "ad_1001",
  "annualAssignmentId": "aa_1001",
  "templateFieldId": "field_final_comment",
  "fieldKey": "management_final_comment",
  "sectionKey": "final_decision",
  "roleCode": "MANAGEMENT",
  "actorUserId": "mgt_001",
  "valueText": "Approved for grade and merit increase.",
  "valueNumber": null,
  "valueDate": null,
  "valueJson": null,
  "isDeleted": false,
  "createdBy": "mgt_001",
  "updatedBy": "mgt_001",
  "createdAt": "2026-04-20T10:00:00.000Z",
  "updatedAt": "2026-04-20T10:00:00.000Z",
  "version": 1
}
```

Recommended indexes:

```js
{ annualDecisionId: 1 }
{ annualAssignmentId: 1, fieldKey: 1, roleCode: 1 }
```

---

# 12. Visibility Governance

## `visibility_configurations`

```json
{
  "_id": "vis_1001",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_501",
  "employeeReviewVisible": false,
  "employeeGradeVisible": false,
  "employeeMeritVisible": false,
  "managerGradeVisible": false,
  "managerMeritVisible": false,
  "visibleFrom": null,
  "enabledBy": null,
  "enabledAt": null,
  "disabledBy": null,
  "disabledAt": null,
  "reason": null,
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-04-20T12:00:00.000Z",
  "updatedAt": "2026-04-20T12:00:00.000Z",
  "version": 1
}
```

Grade, merit, review, and final appraisal data remain hidden until HR/Admin or Management explicitly enables visibility.

Source-of-truth rule:

| Storage | Purpose |
|---|---|
| `visibility_configurations` | Source of truth for all enable/disable actions and visibility history |
| `annual_assignments.visibility` | Denormalized cache for fast dashboard and list rendering |

All visibility changes must go through the Visibility Governance service. Direct updates to `annual_assignments.visibility` are not allowed because that would bypass masking, audit, and communication readiness checks.

Recommended indexes:

```js
{ annualAssignmentId: 1 } unique
{ cycleId: 1 }
{ employeeId: 1 }
```

---

# 13. Communication Dispatch

## `communication_dispatches`

```json
{
  "_id": "com_1001",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_501",
  "appraisalOutcomeType": "BOTH",
  "templateId": "ltr_both_001",
  "templateVersionId": "ltrv_both_001",
  "channel": "EMAIL",
  "dispatchStatus": "SENT",
  "renderedSubject": "Your 2026 Appraisal Outcome",
  "renderedBodySnapshot": "Dear Suresh...",
  "contentHash": "sha256_hash_here",
  "renderedAt": "2026-04-21T10:00:00.000Z",
  "deliveryStatus": {
    "email": "SENT"
  },
  "sentBy": "admin_001",
  "sentAt": "2026-04-21T10:00:00.000Z",
  "resendOf": null,
  "correctionReason": null,
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-04-21T10:00:00.000Z",
  "updatedAt": "2026-04-21T10:00:00.000Z",
  "version": 1
}
```

Historical sent communication must not change after template edits.

`contentHash` must be calculated from the rendered subject/body snapshot and immutable template version. This gives reviewers a tamper-evident way to confirm that a sent communication still matches the exact content rendered at `renderedAt`.

Recommended indexes:

```js
{ annualAssignmentId: 1 }
{ cycleId: 1, dispatchStatus: 1 }
{ employeeId: 1 }
```

---

# 14. Operational Governance Collections

## 14.1 `workflow_events`

Append-only workflow event log for state transitions. This is separate from `audit_logs` so workflow timelines can be queried quickly.

```json
{
  "_id": "wfe_001",
  "entityType": "OBJECTIVE",
  "entityId": "obj_001",
  "annualAssignmentId": "aa_1001",
  "quarterAssignmentId": "qa_1001_q1",
  "cycleId": "cycle_2026",
  "fromState": "OBJECTIVE_DRAFT",
  "toState": "OBJECTIVE_SUBMITTED",
  "action": "SUBMIT_OBJECTIVE",
  "actorUserId": "emp_501",
  "actorRole": "EMPLOYEE",
  "reason": null,
  "metadata": {},
  "createdBy": "emp_501",
  "createdAt": "2026-01-05T10:00:00.000Z"
}
```

Workflow events are append-only. Do not store `updatedBy`, `updatedAt`, `version`, or `isDeleted` on `workflow_events`, because state transition history must be immutable and tamper-evident.

Recommended indexes:

```js
{ entityType: 1, entityId: 1, createdAt: -1 }
{ annualAssignmentId: 1, createdAt: -1 }
{ quarterAssignmentId: 1, createdAt: -1 }
```

## 14.2 `delegations`

Temporary acting authority without changing historical ownership.

```json
{
  "_id": "dlg_001",
  "delegatorUserId": "mgr_101",
  "delegateUserId": "mgr_202",
  "scopeType": "DIRECT_REPORTS",
  "cycleId": "cycle_2026",
  "validFrom": "2026-03-20",
  "validTo": "2026-03-31",
  "status": "ACTIVE",
  "reason": "Manager leave coverage",
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-03-19T10:00:00.000Z",
  "updatedAt": "2026-03-19T10:00:00.000Z",
  "version": 1
}
```

## 14.3 `reassignments`

Permanent manager reassignment record. Reassignment affects future actions only and must preserve old attribution.

```json
{
  "_id": "reasg_001",
  "annualAssignmentId": "aa_1001",
  "quarterAssignmentId": "qa_1001_q2",
  "employeeId": "emp_501",
  "fromManagerId": "mgr_101",
  "toManagerId": "mgr_202",
  "effectiveFrom": "2026-04-01",
  "appliesTo": "FUTURE_ACTIONS_ONLY",
  "reason": "Reporting manager changed",
  "approvedBy": "admin_001",
  "approvedAt": "2026-04-01T09:00:00.000Z",
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-04-01T09:00:00.000Z",
  "updatedAt": "2026-04-01T09:00:00.000Z",
  "version": 1
}
```

## 14.4 `assignment_exception_queue`

Queue records for employees who cannot be assigned automatically.

```json
{
  "_id": "exq_001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_777",
  "exceptionType": "MISSING_MANAGER",
  "status": "OPEN",
  "message": "Employee has no active reporting manager for cycle assignment.",
  "resolution": null,
  "resolvedBy": null,
  "resolvedAt": null,
  "isDeleted": false,
  "createdBy": "system",
  "updatedBy": "system",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "version": 1
}
```

## 14.5 `letter_templates` and `letter_template_versions`

Letter templates are versioned separately from PMS form templates because communication copy may change independently.

```json
{
  "_id": "ltr_both_001",
  "code": "APPRAISAL_BOTH",
  "name": "Grade and Merit Letter",
  "outcomeType": "BOTH",
  "status": "ACTIVE",
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "version": 1
}
```

```json
{
  "_id": "ltrv_both_001",
  "letterTemplateId": "ltr_both_001",
  "versionNo": 1,
  "status": "LOCKED",
  "subjectTemplate": "Your {{appraisalYear}} Appraisal Outcome",
  "bodyTemplate": "Dear {{employeeName}}, your final grade is {{finalGrade}} and merit is {{meritAmount}}.",
  "placeholderRules": {
    "required": ["employeeName", "appraisalYear"],
    "conditional": ["finalGrade", "meritAmount", "quarterSummary"]
  },
  "conditionalBlocks": [
    {
      "blockKey": "show_merit",
      "condition": "isMeritApplied == true"
    }
  ],
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "admin_001",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "version": 1
}
```

## 14.6 `bulk_operation_jobs`

Tracks bulk assignment, launch, visibility, and communication jobs.

```json
{
  "_id": "bulk_001",
  "jobType": "BULK_ASSIGN_CYCLE",
  "cycleId": "cycle_2026",
  "status": "COMPLETED_WITH_ERRORS",
  "requestedBy": "admin_001",
  "totalCount": 200,
  "successCount": 198,
  "failureCount": 2,
  "failureSummary": [
    {
      "employeeId": "emp_777",
      "reason": "MISSING_MANAGER"
    }
  ],
  "startedAt": "2026-01-01T09:00:00.000Z",
  "completedAt": "2026-01-01T09:05:00.000Z",
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "system",
  "createdAt": "2026-01-01T09:00:00.000Z",
  "updatedAt": "2026-01-01T09:05:00.000Z",
  "version": 1
}
```

## 14.7 `notification_events`

Stores notification intent and delivery result for email, in-app, or system alerts.

```json
{
  "_id": "noti_001",
  "eventType": "OBJECTIVE_SUBMITTED",
  "recipientUserId": "mgr_101",
  "channel": "IN_APP",
  "deliveryStatus": "SENT",
  "entityType": "OBJECTIVE",
  "entityId": "obj_001",
  "cycleId": "cycle_2026",
  "sentAt": "2026-01-05T10:01:00.000Z",
  "isDeleted": false,
  "createdBy": "system",
  "updatedBy": "system",
  "createdAt": "2026-01-05T10:01:00.000Z",
  "updatedAt": "2026-01-05T10:01:00.000Z",
  "version": 1
}
```

## 14.8 `sla_events`

Stores SLA due, reminder, overdue, and escalation events without changing assignment ownership.

```json
{
  "_id": "sla_001",
  "slaType": "OBJECTIVE_APPROVAL",
  "entityType": "QUARTER_ASSIGNMENT",
  "entityId": "qa_1001_q1",
  "cycleId": "cycle_2026",
  "quarterCode": "Q1",
  "ownerUserId": "mgr_101",
  "dueAt": "2026-01-10T18:00:00.000Z",
  "status": "OPEN",
  "lastReminderAt": null,
  "escalatedAt": null,
  "isDeleted": false,
  "createdBy": "system",
  "updatedBy": "system",
  "createdAt": "2026-01-06T00:00:00.000Z",
  "updatedAt": "2026-01-06T00:00:00.000Z",
  "version": 1
}
```

---

# 15. Audit, Correction, and History

## 15.1 `audit_logs`

```json
{
  "_id": "aud_001",
  "entityType": "OBJECTIVE",
  "entityId": "obj_001",
  "action": "OBJECTIVE_SUBMITTED",
  "actorUserId": "emp_501",
  "actorRole": "EMPLOYEE",
  "previousValue": {
    "status": "OBJECTIVE_DRAFT"
  },
  "newValue": {
    "status": "OBJECTIVE_SUBMITTED"
  },
  "reason": null,
  "correlationId": "req_abc_001",
  "ipAddress": "127.0.0.1",
  "createdBy": "emp_501",
  "createdAt": "2026-01-05T10:00:00.000Z"
}
```

Audit logs are create-only and append-only. Do not store `updatedBy`, `updatedAt`, `version`, or `isDeleted` on `audit_logs`. Corrections should create new correction/audit records instead of modifying old audit entries.

Recommended indexes:

```js
{ entityType: 1, entityId: 1 }
{ actorUserId: 1, createdAt: -1 }
{ createdAt: -1 }
```

## 15.2 `correction_layers`

```json
{
  "_id": "corr_001",
  "entityType": "ANNUAL_DECISION",
  "entityId": "ad_1001",
  "fieldKey": "gradeDetails.gradeValue",
  "originalValue": "B",
  "correctedValue": "A",
  "correctionReason": "Approved correction after management review.",
  "correctedBy": "admin_001",
  "correctedAt": "2026-04-25T10:00:00.000Z",
  "approvedBy": "mgt_001",
  "approvedAt": "2026-04-25T11:00:00.000Z",
  "isDeleted": false,
  "createdBy": "admin_001",
  "updatedBy": "mgt_001",
  "createdAt": "2026-04-25T10:00:00.000Z",
  "updatedAt": "2026-04-25T11:00:00.000Z",
  "version": 1
}
```

Corrections must preserve original values and store amendments separately.

## 15.3 `performance_history_snapshots`

```json
{
  "_id": "hist_1001",
  "annualAssignmentId": "aa_1001",
  "cycleId": "cycle_2026",
  "employeeId": "emp_501",
  "templateVersionId": "tplv_001",
  "annualSnapshot": {},
  "quarterSnapshots": {
    "Q1": {},
    "Q2": {},
    "Q3": {},
    "Q4": {}
  },
  "finalDecisionSnapshot": {},
  "visibilitySnapshot": {},
  "communicationSnapshot": {},
  "snapshotHash": "sha256_hash_here",
  "isDeleted": false,
  "createdBy": "system",
  "updatedBy": "system",
  "createdAt": "2026-04-21T10:00:00.000Z",
  "updatedAt": "2026-04-21T10:00:00.000Z",
  "version": 1
}
```

Historical records must render using the original template version and preserve finalized values.

---

# 16. UI Rendering Strategy

For fast UI rendering:

## Annual / Dashboard View

Load:

```text
annual_assignments
quarter_assignments
annual_decisions summary fields
visibility flags
communication status
```

## Quarter Objective Screen

Load:

```text
annual_assignment
quarter_assignment
locked template_version
objectives for selected quarter
objective_comments / attachments
```

## Quarter Review Screen

Load:

```text
quarter_assignment
quarter_reviews
quarter_review_values
locked template_version section definitions
```

Group review values by:

```text
sectionKey + fieldKey + roleCode + workflowStage
```

## Annual Decision Screen

Load:

```text
annual_assignment
Q1-Q4 quarter summaries
applicableQuarters from annual_assignment
annual_decision
annual_decision_values
visibility_configurations
```

## History Screen

Load:

```text
performance_history_snapshots
audit_logs
correction_layers
communication_dispatches
```

---

# 17. Indexing Strategy

Recommended MongoDB indexes:

```js
// Annual dashboard and assignment lookup
db.annual_assignments.createIndex({ cycleId: 1, employeeId: 1 }, { unique: true });
db.annual_assignments.createIndex({ assignedManagerId: 1, annualState: 1 });
db.annual_assignments.createIndex({ cycleId: 1, assignedManagerId: 1, annualState: 1 });
db.annual_assignments.createIndex({ cycleId: 1, appraisalOutcomeType: 1 });
db.annual_assignments.createIndex({ cycleId: 1, "employeeSnapshot.department": 1 });
db.annual_assignments.createIndex({ cycleId: 1, "orgSnapshot.businessUnit": 1 });

// Quarter queues
db.quarter_assignments.createIndex({ annualAssignmentId: 1, quarterCode: 1 }, { unique: true });
db.quarter_assignments.createIndex({ cycleQuarterId: 1, quarterState: 1 });
db.quarter_assignments.createIndex({ assignedManagerId: 1, quarterState: 1 });

// Objectives
db.objectives.createIndex({ quarterAssignmentId: 1 });
db.objectives.createIndex({ annualAssignmentId: 1, quarterCode: 1 });
db.objectives.createIndex({ employeeId: 1, cycleId: 1 });
db.objectives.createIndex({ assignedManagerId: 1, status: 1 });
db.objective_evidence.createIndex({ objectiveId: 1 });
db.objective_evidence.createIndex({ quarterAssignmentId: 1, createdAt: -1 });

// Reviews
db.quarter_reviews.createIndex({ quarterAssignmentId: 1 }, { unique: true });
db.quarter_reviews.createIndex({ managerId: 1, reviewStatus: 1 });
db.quarter_review_values.createIndex({ quarterReviewId: 1, fieldKey: 1, roleCode: 1, actorUserId: 1 });
db.quarter_review_values.createIndex({ quarterAssignmentId: 1, sectionKey: 1 });

// Annual decisions
db.annual_decisions.createIndex({ annualAssignmentId: 1 }, { unique: true });
db.annual_decisions.createIndex({ employeeId: 1, cycleId: 1 });
db.annual_decisions.createIndex({ cycleId: 1, appraisalOutcomeType: 1 });

// Governance and operations
db.visibility_configurations.createIndex({ annualAssignmentId: 1 }, { unique: true });
db.communication_dispatches.createIndex({ annualAssignmentId: 1 });
db.communication_dispatches.createIndex({ cycleId: 1, dispatchStatus: 1 });
db.workflow_events.createIndex({ entityType: 1, entityId: 1, createdAt: -1 });
db.delegations.createIndex({ delegateUserId: 1, status: 1, validFrom: 1, validTo: 1 });
db.reassignments.createIndex({ annualAssignmentId: 1, effectiveFrom: -1 });
db.assignment_exception_queue.createIndex({ cycleId: 1, status: 1 });
db.letter_templates.createIndex({ code: 1 }, { unique: true });
db.letter_template_versions.createIndex({ letterTemplateId: 1, versionNo: 1 }, { unique: true });
db.bulk_operation_jobs.createIndex({ cycleId: 1, jobType: 1, createdAt: -1 });
db.notification_events.createIndex({ recipientUserId: 1, createdAt: -1 });
db.sla_events.createIndex({ ownerUserId: 1, status: 1, dueAt: 1 });

// Audit
db.audit_logs.createIndex({ entityType: 1, entityId: 1 });
db.audit_logs.createIndex({ actorUserId: 1, createdAt: -1 });
db.audit_logs.createIndex({ createdAt: -1 });
```

Keep indexes portable for Cosmos DB Mongo API compatibility. Avoid depending on unsupported operators or vendor-specific aggregation behavior unless compatibility is verified.

---

# 18. Implementation Notes for Current Codebase

Current Day 1 implementation already has:

```text
pms.enums.ts
pms.types.ts
workflow.service.ts
access.service.ts
audit.service.ts
visibilityMask.service.ts
AnnualCycle model
QuarterCycle model
AnnualAssignment model
QuarterAssignment model
Objective model
QuarterReview model
AnnualDecision model
AuditLog model
seed-pms-demo.ts
```

Recommended next schema improvements:

| Area | Recommendation |
|---|---|
| Template versions | Keep sections and fields embedded inside `PmsTemplateVersion` |
| Annual assignments | Add employee/manager/org snapshots |
| Quarter assignments | Add `cycleId`, `cycleQuarterId`, timestamps, score/rating/summary fields |
| Objectives | Add `annualAssignmentId`, `cycleId`, `objectiveNo`, status consistency |
| Quarter reviews | Add review values collection for dynamic field values |
| Annual decisions | Add annual decision values collection for dynamic final fields |
| Visibility | Keep `visibility_configurations` as source of truth and `annual_assignments.visibility` as dashboard cache |
| Audit | Keep centralized and immutable |
| Corrections | Add correction layer instead of overwriting finalized values |
| History | Add performance snapshots after annual finalization/communication dispatch |
| Workflow events | Add append-only workflow event records for timeline and transition debugging |
| Delegation/reassignment | Add separate collections so temporary authority and permanent manager changes do not overwrite historical ownership |
| Exception queue | Add assignment exception queue for missing manager, ineligible employee, duplicate assignment, and partial bulk failures |
| Letter templates | Add versioned letter templates with placeholder validation and immutable dispatched snapshots |
| Notifications/SLA | Add notification and SLA event collections for reminders, escalation, and delivery tracking |

---

# 19. Final Recommendation

Use the same strong entity separation from the relational model, but implement it as MongoDB/Cosmos-compatible collections.

Final recommended architecture:

```text
Template Version
  defines form structure and dynamic fields

Annual Cycle
  defines performance year and parent workflow

Quarter Cycle
  defines Q1-Q4 windows and SLA rules

Annual Assignment
  one employee + one annual cycle

Quarter Assignment
  one employee + one quarter

Objectives
  quarterly employee/manager-created objectives

Quarter Review
  manager official review summary

Quarter Review Values
  dynamic role/stage/field values

Annual Decision
  final grade/merit/nil decision

Annual Decision Values
  dynamic final appraisal fields

Visibility Configuration
  controlled confidential publish state

Communication Dispatch
  immutable sent communication records

Letter Templates
  versioned communication templates and placeholder rules

Workflow Events
  append-only workflow transition timeline

Delegation / Reassignment / Exception Queue
  authority changes and assignment issue tracking

Notification / SLA Events
  reminder, escalation, and delivery tracking

Bulk Operation Jobs
  bulk assignment, launch, visibility, and communication execution tracking

Audit / Correction / History
  immutable governance layer
```

This model is robust, scalable, FSD-aligned, UI-friendly, reporting-ready, and safe for future template changes.
