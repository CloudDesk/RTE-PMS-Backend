# HRMS – Performance Management System (PMS)

# Functional Specification Document (FSD)

## Version 3 • May 2026

**Confidential – For Client Use Only**

---

# 1. Document Overview

This Functional Specification Document (FSD) defines the revised functional specifications for the Performance Management System (PMS) module within the HRMS platform.

This version replaces the legacy employee-driven PMS workflow with a:

* Manager-driven quarterly performance tracking model
* Objective-based review architecture
* Dynamic role and permission engine
* Confidential annual appraisal governance model
* Quarterly child-cycle evaluation structure
* Controlled communication and visibility framework

The PMS module covers:

* Template and form configuration
* Quarterly objective lifecycle
* Quarterly manager review workflow
* Annual appraisal decision governance
* Grade and merit management
* Dynamic visibility publishing
* Communication dispatch
* Audit and correction governance
* Dynamic access control
* SLA and escalation handling
* Delegation and reassignment
* Dashboarding and reporting

---

# 2. Module-Wise Functional Breakdown

| Module | Functional Scope |
|---|---|
| Objective Management | Quarterly objective creation, submission, approval, revision, and locking |
| Quarterly Manager Review | Quarterly manager evaluation, comments, recommendations, and review submission |
| Annual Appraisal Decision | Grade/merit governance, appraisal outcome derivation, freeze and reopen |
| Communication Dispatch | Outcome-based backend-managed communication preparation, preview, dispatch, resend, and audit |
| Dynamic Access Engine | Runtime role resolution, hierarchy authorization, field/section permissions |
| Visibility Governance | Confidential appraisal visibility publishing and API masking |
| History & Audit Governance | Immutable snapshots, correction layers, audit tracking |
| SLA & Escalation | SLA tracking, reminder generation, escalation notification handling |
| Delegation & Reassignment | Temporary delegation and future ownership reassignment |
| Dashboard & Reporting | Dashboard visibility, monitoring, exports, and reporting |


# 2A. Template Builder and Runtime Rendering Architecture

## 2A.1 Template Builder Philosophy

### FR-TMP-01: Dynamic Template Builder

The system shall support a metadata-driven template builder framework for PMS configuration.

The Template Builder shall support:

* dynamic section configuration
* dynamic field configuration
* workflow-stage field behavior
* configurable scoring participation
* conditional rendering
* field-level visibility
* field-level editability
* role-aware rendering
* quarter-aware rendering
* annual-level rendering
* configurable validation rules
* form preview rendering
* outcome content mapping references
* template version governance

---

## 2A.2 Runtime Rendering Engine

### FR-TMP-02: Runtime Template Resolution

The system shall dynamically render PMS forms, sections, fields, validations, scoring rules, and visibility behavior using template metadata without requiring code changes.

Runtime rendering shall support:

* workflow-state evaluation
* role evaluation
* hierarchy-aware visibility
* field-level visibility
* field-level editability
* conditional rendering evaluation
* scoring rule evaluation
* visibility governance integration
* Dynamic Access Engine integration

---

## 2A.3 Template Version Governance

### FR-TMP-03: Template Version Locking

Annual Assignments and generated communication shall preserve locked template versions.

Changes to newer template versions shall not alter:

* historical assignments
* finalized records
* generated communication
* audit snapshots
* historical rendering

---

## 2A.4 Communication Rendering

### FR-TMP-04: Backend-Managed Communication Rendering

For the current PMS v2 scope, employee appraisal communication content shall be managed in the backend using static/hardcoded content rules selected by appraisal outcome type.

Communication rendering shall support:

* appraisal outcome mapping
* visibility-aware rendering
* backend-managed content versions or references
* immutable rendered snapshot preservation

---

## 2A.5 Template Builder Validation

### FR-TMP-05: Template Builder Validation

The system shall validate:

* scoring configuration
* required field configuration
* workflow-stage behavior configuration
* visibility configuration
* field permission configuration
* template activation integrity
* communication outcome mapping integrity

Invalid template configurations shall be rejected before activation.

---

## 2A.6 Runtime Governance

### FR-TMP-06: Runtime Governance Enforcement

Runtime template rendering shall enforce:

* Dynamic Access Engine
* Visibility Governance
* workflow-state validation
* immutable template version preservation
* confidential field masking
* audit traceability

Frontend-only enforcement shall not be permitted.

---

# 3. System Roles and Actors

## 3.1 Employee

### FR-EMP-01: Annual Assignment Quarter Content Visibility

The system shall allow employees to view assigned Annual Assignment quarter content, including:

* Annual cycle
* Quarter name
* Assigned manager
* Objective status
* Quarter review status
* Due dates
* Current workflow state

### FR-EMP-02: Objective Creation and Update

The system shall allow employees to create and edit objectives during:

* OBJECTIVE_SETTING_OPEN
* OBJECTIVE_REVISION_REQUIRED

Each objective shall support:

* Objective title
* Description
* KPI/measurement
* Target value
* Due date
* Weightage
* Success criteria
* Optional attachment references

### FR-EMP-03: Objective Submission

The system shall allow employees to submit objectives for manager review and approval. Attachments/evidence remain optional during objective submission.

### FR-EMP-04: Quarterly Review Visibility

The system shall allow employees to view finalized quarterly manager reviews subject to visibility configuration.

### FR-EMP-05: Historical Review Visibility

The system shall allow employees to access historical finalized quarterly and annual records based on configured visibility rules.

---

## 3.2 Manager

### FR-MGR-01: Objective Review Access

Managers shall access approved objectives and quarter context for evaluation purposes within their approved Annual Assignment or hierarchy scope.

### FR-MGR-02: Objective Approval

The system shall allow managers to approve submitted objectives.

### FR-MGR-03: Objective Revision Request

The system shall allow managers to return objectives for revision with mandatory comments.

### FR-MGR-04: Manager Quarterly Evaluation

The system shall allow managers to:

* access approved objective evaluation context
* quarterly evaluation result
* manager comments
* achievements
* development observations
* recommendations

### FR-MGR-05: Quarterly Review Submission

The system shall allow managers to submit quarterly reviews.

### FR-MGR-06: Scope Enforcement

Managers shall only access employees within:

* direct reporting scope
* configured hierarchy scope
* delegated scope
* reassigned scope

### FR-MGR-07: Manager-Created Objective Auto Approval

Objectives created directly by managers shall automatically transition to OBJECTIVE_APPROVED without requiring employee approval. Manager-created objectives bypass employee submission and approval workflow stages and shall persist source = MANAGER_CREATED.

---

## 3.3 HR / Admin

### FR-HR-01: Template Management

The system shall allow HR/Admin users to:

* Create templates
* Configure sections and fields
* Configure scoring logic
* Configure workflows
* Activate/deactivate templates
* Manage template versions

### FR-HR-02: Annual Cycle Management

The system shall allow HR/Admin users to:

* Create annual parent cycles
* Configure Q1–Q4 quarters
* Configure milestone windows
* Configure visibility rules
* Configure appraisal windows

### FR-HR-03: Assignment Management

The system shall allow HR/Admin users to:

* Create annual-level PMS assignments
* Bulk create annual-level PMS assignments
* Assign employees, managers, annual cycles, and locked template versions
* Reassign managers
* Force-close assignments
* Reopen finalized records

### FR-HR-04: Dynamic Role Configuration

The system shall allow HR/Admin users to configure:

* Custom roles
* Hierarchy scopes
* Field permissions
* Section permissions
* Workflow-state permissions
* Visibility rules

### FR-HR-05: Visibility Governance

The system shall allow HR/Admin users to:

* Enable employee visibility
* Enable manager visibility
* Publish merit visibility
* Publish grade visibility
* Hide confidential sections

### FR-HR-06: Communication Governance

The system shall allow HR/Admin users to:

* Preview communication
* Trigger dispatch
* Resend communication
* Audit communication history

### FR-HR-07: Override and Correction Governance

The system shall allow HR/Admin users to:

* Reopen finalized records
* Override decisions
* Modify frozen records under correction workflow
* Preserve original records
* Maintain amendment history

---

## 3.4 Management

### FR-MGT-01: Annual Appraisal Decision Access

The system shall allow Management users to:

* Review quarterly summaries
* Review annual rollups
* Create annual appraisal decisions
* Apply grade decisions
* Apply merit decisions
* Submit or freeze appraisal decisions

### FR-MGT-02: Confidential Decision Governance

Management users shall access confidential appraisal sections not visible to employees until publication.

## 3.5 Director

### FR-DIR-01: Hierarchy Monitoring Access

The system shall allow Director users to access hierarchy-level quarterly and annual performance visibility subject to configured hierarchy scope and visibility permissions.

Director access shall remain read-only unless explicitly configured through the Dynamic Access Engine.

### FR-DIR-02: Director Evidence Visibility

Director access to uploaded objective or review evidence shall be read-only and governed by hierarchy scope, field visibility, confidential masking, attachment access rules, and Annual Assignment permissions.

### FR-DIR-03: Director Annual History View

Director users shall be able to view employee PMS history, year-wise appraisal records, finalized quarter content, annual outcomes, merit or grade progress, and communication status based on configured hierarchy permissions.

### FR-DIR-04: Director Access Restriction

Director users shall not edit objectives, manager reviews, annual decisions, visibility settings, or communication records unless explicitly configured through the Dynamic Access Engine.

---

# 4. Annual and Quarterly Cycle Architecture

## 4.1 Parent-Child Cycle Model

### FR-CYC-01: Annual Parent Cycle

The system shall support an annual parent cycle containing:

* Q1
* Q2
* Q3
* Q4
  child quarter records.

### FR-CYC-02: Quarter Independence

Each quarter shall maintain independent:

* Objectives
* Reviews
* Evaluation results
* Finalization dates
* SLA tracking
* Audit history

### FR-CYC-03: Annual Dependency Validation

Annual appraisal finalization shall be blocked until all applicable quarter content sections inside the Annual Assignment are:

* QUARTER_FINALIZED
  or
* CLOSED_BY_ADMIN

### FR-CYC-04: Quarter Window Configuration

The system shall support configurable windows for:

* Objective Setting
* Objective Approval
* Manager Review
* Quarter Finalization

### FR-CYC-05: Appraisal Window Configuration

The system shall support configurable annual appraisal windows using:

* fixed dates
* relative offsets
* quarter dependency logic

## 4.2 Assignment Architecture

### FR-ASN-01: Annual Assignment Creation

The system shall create one Annual Assignment for each employee assigned to an annual PMS cycle.

Each Annual Assignment shall represent:

* one employee
* one annual cycle
* one locked template version
* one assigned manager
* Q1-Q4 quarter content
* final annual decision
* visibility status
* communication status
* audit history

### FR-ASN-02: Quarter Content Initialization

The system shall initialize Q1, Q2, Q3, and Q4 quarter content sections inside the Annual Assignment based on the annual cycle configuration and employee eligibility.

Each quarter content section shall contain:

* objectives
* objective approval or revision status
* manager review
* quarter workflow state
* attachments or evidence
* quarter finalization status
* audit trail

### FR-ASN-03: Assignment Template Lock

The Annual Assignment shall preserve the locked template version assigned during cycle assignment. All quarter content inside the Annual Assignment shall use the same locked template version unless a different versioning rule is explicitly configured.

### FR-ASN-04: Duplicate Annual Assignment Prevention

The system shall prevent duplicate Annual Assignments for the same employee and annual cycle.

### FR-ASN-05: Quarter Content Independence

Each quarter content section inside the Annual Assignment shall independently maintain objectives, manager review, quarter status, SLA status, finalization status, attachments, and audit history.

### FR-ASN-06: Quarter Content Applicability

The system shall support marking quarter content as applicable, not applicable, finalized, or closed based on employee eligibility, joining date, exit date, or HR/Admin closure rules.

---

# 5. Workflow Design

## 5.1 Quarter Workflow States

### FR-WF-01: Quarter State Enforcement

The system shall enforce valid quarter state transitions.

### FR-WF-02: Supported Quarter States

The system shall support:

* NOT_STARTED
* OBJECTIVE_SETTING_OPEN
* OBJECTIVE_DRAFT
* OBJECTIVE_SUBMITTED
* OBJECTIVE_REVISION_REQUIRED
* OBJECTIVE_APPROVED
* MANAGER_REVIEW_OPEN
* MANAGER_REVIEW_SUBMITTED
* QUARTER_FINALIZED
* REOPENED_BY_ADMIN
* CLOSED_BY_ADMIN

### FR-WF-QTR-01: Quarter Content Workflow Enforcement

Each quarter content section inside the Annual Assignment shall maintain its own workflow state.

### FR-WF-QTR-02: Quarter Content Transition Validation

The system shall enforce valid workflow transitions for each quarter content section and reject invalid transitions at API or service level.

---

## 5.2 Annual Workflow States

### FR-WF-03: Supported Annual States

The system shall support:

* DRAFT
* SCHEDULED
* ACTIVE
* IN_PROGRESS
* ALL_QUARTERS_FINALIZED
* APPRAISAL_WINDOW_OPEN
* MANAGEMENT_DECISION_DRAFT
* MANAGEMENT_DECISION_SUBMITTED
* ANNUAL_FINALIZED
* VISIBILITY_ENABLED
* COMMUNICATION_READY
* COMMUNICATION_SENT
* CLOSED
* ARCHIVED
* CANCELLED

### FR-WF-ANN-01: Annual Assignment Workflow Enforcement

The system shall enforce valid workflow transitions for the Annual Assignment.

### FR-WF-ANN-02: Annual Dependency Validation

The Annual Assignment shall not move to ALL_QUARTERS_FINALIZED until all applicable quarter content sections are QUARTER_FINALIZED or CLOSED_BY_ADMIN.

### FR-WF-ANN-03: Annual Finalization Protection

After ANNUAL_FINALIZED, annual decision values shall become immutable except through controlled HR/Admin reopen or correction workflow.

---

## 5.3 Workflow Philosophy

### FR-WF-04: Revised Workflow Model

The PMS shall operate using:

* quarterly manager-driven evaluation
* confidential annual decision governance
* controlled publication workflow
* visibility enablement → communication ready → communication dispatch lifecycle

Employee self-review and employee acceptance workflows shall not exist in v2.

---

# 6. Status Flows

## 6.1 Quarter Workflow Flow

```text
NOT_STARTED
→ OBJECTIVE_SETTING_OPEN
→ OBJECTIVE_DRAFT
→ OBJECTIVE_SUBMITTED
→ OBJECTIVE_APPROVED
→ MANAGER_REVIEW_OPEN
→ MANAGER_REVIEW_SUBMITTED
→ QUARTER_FINALIZED

```

Alternative states:

* OBJECTIVE_REVISION_REQUIRED
* REOPENED_BY_ADMIN
* CLOSED_BY_ADMIN

### 6.1A Quarter Content Workflow Transition Table

| From | To | Actor |
|---|---|---|
| NOT_STARTED | OBJECTIVE_SETTING_OPEN | System / HR/Admin |
| OBJECTIVE_SETTING_OPEN | OBJECTIVE_DRAFT | Employee / Manager |
| OBJECTIVE_DRAFT | OBJECTIVE_SUBMITTED | Employee |
| OBJECTIVE_SETTING_OPEN | OBJECTIVE_APPROVED | Manager-created auto approval |
| OBJECTIVE_SUBMITTED | OBJECTIVE_APPROVED | Manager |
| OBJECTIVE_SUBMITTED | OBJECTIVE_REVISION_REQUIRED | Manager |
| OBJECTIVE_REVISION_REQUIRED | OBJECTIVE_DRAFT | Employee |
| OBJECTIVE_APPROVED | MANAGER_REVIEW_OPEN | System / HR/Admin |
| MANAGER_REVIEW_OPEN | MANAGER_REVIEW_SUBMITTED | Manager |
| MANAGER_REVIEW_SUBMITTED | QUARTER_FINALIZED | System / HR/Admin |
| QUARTER_FINALIZED | REOPENED_BY_ADMIN | HR/Admin |
| REOPENED_BY_ADMIN | QUARTER_FINALIZED | HR/Admin |
| Any non-finalized quarter content state | CLOSED_BY_ADMIN | HR/Admin |

## 6.2 Annual Workflow Flow

```text
DRAFT
→ SCHEDULED
→ ACTIVE
→ IN_PROGRESS
→ ALL_QUARTERS_FINALIZED
→ APPRAISAL_WINDOW_OPEN
→ MANAGEMENT_DECISION_DRAFT
→ MANAGEMENT_DECISION_SUBMITTED
→ ANNUAL_FINALIZED
→ VISIBILITY_ENABLED
→ COMMUNICATION_READY
→ COMMUNICATION_SENT
→ CLOSED
→ ARCHIVED
```

### 6.2A Annual Assignment Workflow Transition Table

| From | To | Actor |
|---|---|---|
| DRAFT | SCHEDULED | HR/Admin |
| SCHEDULED | ACTIVE | HR/Admin / System |
| ACTIVE | IN_PROGRESS | System |
| IN_PROGRESS | ALL_QUARTERS_FINALIZED | System |
| ALL_QUARTERS_FINALIZED | APPRAISAL_WINDOW_OPEN | System / HR/Admin |
| APPRAISAL_WINDOW_OPEN | MANAGEMENT_DECISION_DRAFT | Management |
| MANAGEMENT_DECISION_DRAFT | MANAGEMENT_DECISION_SUBMITTED | Management |
| MANAGEMENT_DECISION_SUBMITTED | ANNUAL_FINALIZED | Management / HR/Admin |
| ANNUAL_FINALIZED | VISIBILITY_ENABLED | HR/Admin / Management |
| VISIBILITY_ENABLED | COMMUNICATION_READY | System |
| COMMUNICATION_READY | COMMUNICATION_SENT | HR/Admin |
| COMMUNICATION_SENT | CLOSED | HR/Admin / System |
| CLOSED | ARCHIVED | HR/Admin / System |

---

# 7. Screen-Level Behavior

| Screen | Primary Behavior |
|---|---|
| Annual Cycle Setup | Configure parent cycle, quarters, appraisal windows, visibility rules |
| Annual Assignment Screen | Create annual assignments and review quarter content mapping |
| Objective Entry Screen | Create, edit, submit, and revise objectives |
| Objective Approval Screen | Manager approval and revision handling |
| Quarterly Review Screen | Quarterly evaluation entry and submission |
| Annual Appraisal Screen | Grade/merit decision capture and freeze |
| Visibility Governance Screen | Publish employee/manager visibility |
| Communication Dispatch Screen | Preview, send, and resend backend-prepared appraisal communication |
| Role & Permission Screen | Configure dynamic roles, hierarchy scopes, and field permissions |
| Permission Simulation Screen | Validate effective permissions before publishing |
| Audit History Screen | View immutable audit and correction history |
| Dashboard Screen | Monitor cycle completion, SLA status, and appraisal readiness |

---

# 8. API Expectations

## 8.1 Objective APIs

* POST `/pms/annual-assignments/{id}/quarters/{quarterCode}/objectives`
* PUT `/pms/objectives/{id}`
* POST `/pms/objectives/{id}/submit`
* POST `/pms/objectives/{id}/approve`
* POST `/pms/objectives/{id}/return`

## 8.2 Quarterly Review APIs

* POST `/pms/annual-assignments/{id}/quarters/{quarterCode}/review/submit`
* POST `/pms/annual-assignments/{id}/quarters/{quarterCode}/finalize`
* POST `/pms/annual-assignments/{id}/quarters/{quarterCode}/reopen`

## 8.3 Annual Appraisal APIs

* GET `/pms/annual-assignments/{id}/summary`
* PUT `/pms/annual-assignments/{id}/decision`
* POST `/pms/annual-assignments/{id}/freeze`
* POST `/pms/annual-assignments/{id}/visibility`

## 8.4 Communication APIs

* POST `/pms/communications/preview`
* POST `/pms/communications/send`
* POST `/pms/communications/resend`
* GET `/pms/communications/history`

## 8.5 Access Control APIs

* POST `/pms/access/roles`
* PUT `/pms/access/permissions`
* POST `/pms/access/simulate`

All APIs shall enforce:

* workflow validation
* role authorization
* assignment authorization
* visibility masking
* audit logging
* immutable historical protection

---

# 9. Approval Flows

## 9.1 Objective Approval Flow

Employee Objective Submission
→ Manager Approval
OR
→ Return for Revision

## 9.2 Quarterly Review Flow

Manager Review Submission
→ Quarter Finalization

## 9.3 Annual Appraisal Flow

Management Decision Draft
→ Decision Submission
→ Freeze
→ Annual Finalization

## 9.4 Visibility Publish Flow

Annual Finalization
→ Visibility Enablement
→ Communication Ready

Visibility enablement may independently control:
- employee review visibility
- employee grade visibility
- employee merit visibility
- manager grade visibility
- manager merit visibility

## 9.5 Communication Dispatch Flow

Communication Preview
→ Dispatch
→ Audit Snapshot Preservation

---

# 10. Objective Management

## 10.1 Objective Lifecycle

### FR-OBJ-01: Objective Entry

Employees and managers shall create quarterly objectives.

### FR-OBJ-02: Objective Editability

Objectives may only be edited during:

* OBJECTIVE_SETTING_OPEN
* OBJECTIVE_REVISION_REQUIRED

### FR-OBJ-03: Objective Submission

Employee-submitted objectives shall transition to OBJECTIVE_SUBMITTED.

### FR-OBJ-04: Objective Approval

Managers may:

* approve objectives
* return objectives for revision

### FR-OBJ-05: Objective Revision Comment

Returning objectives requires mandatory manager comments.

### FR-OBJ-06: Objective Locking

Approved objectives become read-only unless reopened by HR/Admin.

### FR-OBJ-07: Objective Weightage Validation

Objective weightages shall validate against configured scoring rules.

### FR-OBJ-08: Template-Based Objective Rendering

The system shall render objective creation fields from the locked template version assigned to the Annual Assignment.

### FR-OBJ-09: Objective Field Governance

Objective fields, required rules, weightage rules, attachment controls, visibility, and editability shall be governed by the assigned template metadata.

### FR-OBJ-10: Quarter Content Objective Storage

Objectives shall be stored under the applicable quarter content section inside the Annual Assignment, identified by quarterCode such as Q1, Q2, Q3, or Q4.

### FR-OBJ-11: Manager-Created Objective Audit

Manager-created objectives shall store source = MANAGER_CREATED, createdBy, createdAt, approvalBy or autoApprovalPolicyReference, approvedAt, and audit reference.

### FR-OBJ-12: Manager-Created Objective Storage

Manager-created objectives shall be stored under the relevant quarter content section inside the Annual Assignment.

### FR-OBJ-13: Employee Visibility of Manager-Created Objectives

Employees shall be able to view manager-created approved objectives unless visibility configuration restricts access.

## 10.2 Attachment and Evidence Management

### FR-ATT-01: Objective Attachment Support

The system shall allow employees and managers to upload optional evidence against objectives, subject to configured file rules.

### FR-ATT-02: Supported Attachment Types

The system shall support attachment categories:

* PDF
* PPT/PPTX
* images

### FR-ATT-03: Attachment Limits

The system shall enforce the following attachment limits:

* maximum 5 files per objective submission or update
* maximum 5 MB per file

### FR-ATT-04: Attachment Audit

Attachment upload, deletion, replacement, and download or view access shall be audited.

### FR-ATT-05: Attachment Access Control

Attachment visibility shall follow the same role, Annual Assignment, hierarchy, quarter content, and visibility governance rules as the related objective or review.

### FR-ATT-06: Finalized Attachment Protection

Attachments linked to finalized quarter content or annual records shall become immutable unless corrected through HR/Admin reopen workflow.

### FR-ATT-07: Quarter Content Attachment Storage

Attachment references shall be stored against the related objective or review within the applicable quarter content section of the Annual Assignment.

---

# 11. Quarterly Manager Review

## 11.1 Review Entry

### FR-MQR-01: Quarterly Evaluation Access

Managers shall access evaluation context and historical quarter context.

### FR-MQR-02: Quarterly Rating Entry

Managers shall enter:

* quarterly evaluation result
* manager comments
* achievements
* development observations
* recommendations

### FR-MQR-03: Manager Review Validation

Submission requires all mandatory review fields.

### FR-MQR-04: Review Submission

Manager review submission transitions:
MANAGER_REVIEW_OPEN → MANAGER_REVIEW_SUBMITTED

### FR-MQR-05: Quarter Finalization

Quarter finalization may be performed by System automation or authorized HR/Admin users according to configured workflow rules following successful review submission.

### FR-MQR-06: Quarter Reopen

HR/Admin users may reopen finalized quarter records with mandatory audit capture.

---

# 12. Annual Appraisal Decision Engine

## 12.1 Annual Decision Model

### FR-AFR-01: Appraisal Decision Draft

Management users may create annual appraisal decisions after all applicable quarter content sections are finalized.

### FR-AFR-02: Grade and Merit Governance

The system shall support independent:

* isGradeApplied
* isMeritApplied
  flags.

### FR-AFR-03: Outcome Derivation

The system shall derive appraisalOutcomeType as:

* BOTH
* MERIT_ONLY
* GRADE_ONLY
* NIL

### FR-AFR-04: Annual Decision Freeze

Annual decisions must be frozen before visibility publication.

### FR-AFR-05: Annual Finalization

Finalized annual decisions become immutable except through controlled reopen.

### FR-AFR-06: Annual Reopen

HR/Admin users may reopen annual decisions with:

* mandatory reason
* snapshot preservation
* audit logging

### FR-AFR-07: Visibility Dependency

Communication dispatch shall not occur before visibility enablement.

### FR-AFR-08: Frozen Decision Integrity

Frozen annual decisions shall not recalculate after template or scoring changes.

## 12.2 Decision Ownership and Operations

### FR-DEC-01: Management Decision Ownership

Management users shall create and submit the annual appraisal decision after all applicable quarter content sections are finalized or closed.

### FR-DEC-02: HR/Admin Operational Ownership

HR/Admin users shall validate decision completeness, freeze the annual decision, enable visibility, trigger communication dispatch, and manage correction workflows.

### FR-DEC-03: Correction Governance

HR/Admin may correct finalized annual decisions only through reopen or override workflow with mandatory reason, snapshot preservation, and audit logging.

---

# 13. Dynamic Access Engine

## 13.1 Access Evaluation Model

### FR-DRP-01: Dynamic Permission Resolution

The system shall evaluate access using:
Role + Assignment + Hierarchy Scope + Workflow State + Section/Field Visibility.

### FR-DRP-02: Custom Roles

The system shall support dynamic custom roles without code deployment.

### FR-DRP-03: Hierarchy Scope

The system shall support:

* direct-report scope
* department scope
* business-unit scope
* region scope
* global scope

### FR-DRP-04: Assignment Authorization

Manager actions require assignment-level authorization.

### FR-DRP-05: Section-Level Permissions

Permissions shall support:

* visible
* hidden
* editable
* read-only
  per section.

### FR-DRP-06: Field-Level Permissions

Permissions shall support:

* field visibility
* field editability
* mandatory rules
* scoring inclusion
* workflow-stage editability

### FR-DRP-07: Permission Simulation

The system shall provide permission simulation/testing before publishing role changes.

### FR-DRP-08: Deny Rule Priority

Where conflicting permissions exist, DENY rules shall override ALLOW rules for confidential fields, restricted sections, and hidden appraisal data.

---

# 14. Visibility Governance

## 14.1 Visibility Controls

### FR-VIS-01: Employee Visibility Control

The system shall support:

* employeeGradeVisible
* employeeMeritVisible
* employeeReviewVisible

### FR-VIS-02: Manager Visibility Control

The system shall support:

* managerGradeVisible
* managerMeritVisible

### FR-VIS-03: API-Level Masking

Confidential fields hidden by visibility governance shall not be returned, partially masked, or inferable through API responses.

### FR-VIS-04: Visibility Publish Workflow

Visibility publication shall require explicit HR/Admin/Management action.

### FR-VIS-05: Confidentiality by Default

Final appraisal data shall remain hidden until published.

### FR-VIS-06: Visibility Revocation

If visibility is disabled after publication, future employee or manager access shall be restricted according to the updated rule, but historical publish audit and dispatched communication records shall remain unchanged.

### FR-VIS-07: Annual Assignment Visibility Status

Visibility status shall be stored at Annual Assignment level and may separately control review visibility, grade visibility, merit visibility, manager visibility, and employee visibility.

### FR-VIS-08: Quarter Content Visibility

Quarter content visibility shall follow configured visibility rules and may be shown or hidden independently from annual grade or merit visibility where required.

---

# 15. Permission Matrix

| Action                 | Employee   | Manager    | HR/Admin | Management | Director |
| ---------------------- | ---------- | ---------- | -------- | ---------- | -------- |
| Create Objective       | Yes        | Yes        | Override | No         | No       |
| Approve Objective      | No         | Yes        | Override | No         | No       |
| Quarterly Review       | No         | Yes        | Override | No         | View     |
| Final Decision         | No         | No         | Override | Yes        | No       |
| Visibility Publish     | No         | No         | Yes      | Yes        | No       |
| Communication Dispatch | No         | No         | Yes      | No         | No       |
| Access Simulation      | No         | No         | Yes      | No         | No       |
| History View           | Restricted | Restricted | Full     | Full       | Scoped read-only |

---

# 16. Communication Dispatch

## 16.1 Backend Communication Preparation

### FR-COM-01: Backend-Managed Communication Content

The system shall prepare employee appraisal communication using backend-managed static/hardcoded content rules.

### FR-COM-02: Outcome Mapping

Communication content shall resolve based on appraisalOutcomeType.

### FR-COM-03: Rendered Data Resolution

The system shall resolve communication content using annual decision and historical assignment data, including:

* employeeName
* finalGrade
* meritAmount
* quarterSummary

### FR-COM-04: Preview Support

Users shall preview generated communication before dispatch.

### FR-COM-05: Dispatch Workflow

The system shall support:

* COMMUNICATION_READY
* COMMUNICATION_SENT
  workflow stages.

### FR-COM-06: Communication Audit

All dispatch actions shall capture:

* actor
* timestamp
* communication content version/reference
* delivery status

### FR-COM-07: Immutable Dispatch Snapshot

Generated communication shall preserve the original rendered content and content version/reference used at dispatch time.

### FR-COM-08: Resend Support

Authorized users may resend communication without modifying historical records.

### FR-COM-09: Communication Resend Governance

Resend shall create a new delivery attempt record while preserving the original dispatched content snapshot, content version or reference, outcome type, and audit trail.

### FR-COM-10: Communication Failure Handling

Failed communication delivery shall be logged with failure reason. Automated retry shall remain out of scope unless separately configured.

### FR-COM-11: Annual Assignment Communication History

All communication preview, dispatch, failure, and resend records shall be stored under the Annual Assignment communication history.

---

# 17. History and Audit Governance

## 17.1 Audit Integrity

### FR-AUD-01: Complete Audit Trail

The system shall audit:

* objective changes
* manager reviews
* annual decisions
* visibility changes
* communication dispatch
* overrides
* reopens
* reassignment
* permission changes
* visibility publication actions

### FR-AUD-02: Correction Layer Preservation

Administrative overrides shall preserve original values and create separately traceable amendment records without overwriting historical manager submissions.

### FR-AUD-03: Immutable Historical Records

Historical finalized snapshots shall remain immutable.

### FR-AUD-04: Template Snapshot Integrity

Historical records shall render using original locked template versions for PMS forms and original rendered communication snapshots for dispatch history. Historical communication content and communication content references must remain immutable after dispatch.

### FR-AUD-05: Override Audit Requirements

Override actions require:

* mandatory reason
* actor
* timestamp
* original value
* updated value

---

# 18. SLA and Escalation Management

### FR-SLA-01: Configurable SLA Rules

The system shall support configurable SLA rules for:

* objective submission
* objective approval
* manager review
* annual appraisal
* visibility publishing
* communication dispatch

### FR-SLA-02: Relative Offset Calculation

The system shall support relative offset rules.

### FR-SLA-03: Reminder Configuration

The system shall support:

* pre-due reminders
* due-date reminders
* overdue reminders

### FR-SLA-04: Escalation Governance

Escalations shall preserve original ownership traceability.

### FR-SLA-05: Notification-Based Escalation

Escalation in v2 shall remain notification-driven only.

---

# 19. Notification Triggers

| Event | Notification Target |
|---|---|
| Objective window open | Employees |
| Objective submitted | Managers |
| Objective returned | Employees |
| Quarterly review pending | Managers |
| Quarter finalized | HR/Admin |
| Appraisal window open | Management |
| Visibility enabled | Employees and Managers |
| Communication dispatched | Employees |
| SLA overdue | Configured escalation hierarchy |
| Reopen initiated | Impacted stakeholders |

Supported channels:

* Email
* In-app notification
* System alerts

---

# 20. Delegation and Reassignment

### FR-DEL-01: Temporary Delegation

The system shall support temporary delegation.

### FR-DEL-02: Delegation Attribution

Delegated actions shall preserve:

* original owner
* acting delegate

### FR-RAS-01: Permanent Reassignment

The system shall support reassignment of future ownership only.

### FR-RAS-02: Historical Preservation

Prior approvals shall remain attributed to original actors.

---

# 21. Dashboard and Reporting

## 21.1 HR/Admin Dashboard

### FR-DSH-01: Administrative Dashboard

The system shall provide:

* cycle monitoring
* quarter completion tracking
* appraisal readiness
* visibility status
* communication status
* SLA breaches
* reopen tracking

## 21.2 Manager Dashboard

### FR-DSH-02: Manager Dashboard

Managers shall view:

* pending objective approvals
* pending quarterly reviews
* overdue reviews
* quarter completion

## 21.3 Employee Dashboard

### FR-DSH-03: Employee Dashboard

Employees shall view:

* active quarter objectives
* quarter content statuses
* published annual decisions
* historical finalized records

## 21.4 Export Support

### FR-DSH-04: Reporting Export

The system shall support spreadsheet-compatible exports.

## 21.5 Director Dashboard

### FR-DSH-05: Director Dashboard

Director users shall view hierarchy-scoped performance status, quarter content completion, annual appraisal readiness, finalized outcomes, uploaded evidence visibility, and communication status according to configured access permissions.

---

# 22. Validation Rules

### FR-VAL-01: Required Field Validation

Required fields shall be enforced on submission.

### FR-VAL-02: Weightage Validation

Configured scoring weightages shall validate correctly.

### FR-VAL-03: Quarter Dependency Validation

Annual decisions require all applicable quarter content completion.

### FR-VAL-04: Outcome Validation

appraisalOutcomeType must derive correctly from:

* isGradeApplied
* isMeritApplied

### FR-VAL-05: Finalized Record Protection

Standard edits shall be blocked on finalized records.

### FR-VAL-06: Visibility Protection

Hidden fields must remain inaccessible at UI and API levels.

### FR-VAL-07: State Transition Enforcement

Only valid workflow transitions shall be permitted.

---

# 23. Error Handling Expectations

| Scenario | Expected Behavior |
|---|---|
| Unauthorized access | Return authorization failure |
| Invalid state transition | Reject transaction |
| Missing mandatory fields | Prevent submission |
| Hidden confidential fields | Mask at API level |
| Invalid appraisal outcome | Prevent finalization |
| Finalized record edit attempt | Reject modification |
| Missing visibility publish | Block communication dispatch |
| Reopen without reason | Reject reopen request |
| Invalid permission configuration | Reject permission publish |
| Missing outcome content mapping | Prevent communication generation |

---

# 24. Dependency Mapping

| Module | Dependency |
|---|---|
| Objective Management | Annual Assignment quarter content |
| Quarterly Review | Approved Objectives |
| Annual Appraisal Decision | Finalized or Closed quarter content |
| Visibility Governance | Annual Finalization |
| Communication Dispatch | Visibility Enablement + Outcome Content Mapping |
| Dynamic Access Engine | Role Configuration |
| Audit Governance | All transactional modules |
| SLA Engine | Workflow milestones |
| Dashboard & Reporting | Transactional workflow data |

---

# 25. Non-Functional Requirements

| Quality Attribute   | Requirement                                                           |
| ------------------- | --------------------------------------------------------------------- |
| Security            | Dynamic role-based access enforced server-side                        |
| Auditability        | Complete tamper-evident audit trail                                   |
| Scalability         | Support organization-wide annual assignments with quarter content lifecycle tracking |
| Configurability     | Roles, workflows, visibility, and templates configurable without code |
| Data Integrity      | Historical template/version preservation mandatory                    |
| Traceability        | All workflow transitions traceable                                    |
| Reporting Readiness | Reporting-compatible structures mandatory                             |
| Confidentiality     | Final appraisal information hidden until explicit publication         |
| Performance         | The system shall support asynchronous processing and configurable batching for large-volume assignment, review, and communication operations. |

---

# 26. Out of Scope

The following features are explicitly out of scope for PMS v2:

* Employee Self Review
* Employee Acceptance Workflow
* Employee Disagreement Routing
* Legacy HR Escalation Workflow (replaced by Exception / Reopen Handling)
* Dual Rating Model
* Employee Sign-Off
* Parallel Multi-Manager Approval
* Automatic Recalculation of Frozen Decisions

---

# 27. Business Constraints

| Constraint             | Description                                        |
| ---------------------- | -------------------------------------------------- |
| Quarterly Independence | Q1–Q4 operate independently                        |
| Annual Dependency      | Final appraisal depends on all applicable quarter content sections |
| Confidentiality        | Grade and merit hidden until enabled               |
| Immutable History      | Historical snapshots cannot be altered             |
| Auto-Approval          | Manager-created objectives bypass approval         |
| Reopen Governance      | Mandatory reason required                          |
| Correction Governance  | Original values preserved permanently              |

---

# 28. Final Scope Summary

The PMS v2 architecture delivers:

* Objective-based quarterly PMS
* Quarterly manager review workflow
* Annual appraisal governance
* Dynamic role engine
* Confidential visibility publishing
* Backend-managed communication dispatch
* Correction-layer audit governance
* Parent-child quarter architecture
* Template version locking
* Enterprise-grade audit and compliance

---

# 29. Revised High-Level Workflow

```text
Annual Parent Cycle
    ↓
Q1/Q2/Q3/Q4 Objective Lifecycle
    ↓
Objective Approval
    ↓
Quarterly Manager Review
    ↓
Quarter Finalization
    ↓
All Quarters Finalized
    ↓
Annual Appraisal Decision
    ↓
Annual Finalization
    ↓
Visibility Enablement
    ↓
Communication Ready
    ↓
Communication Dispatch
    ↓
Historical Snapshot Preservation
```

---

# 30. Edge Cases

| Scenario | Expected Handling |
|---|---|
| Mid-year employee onboarding | Assign remaining applicable quarters only |
| Employee exit during cycle | Close future applicable quarter content |
| Manager reassignment | Preserve historical ownership attribution |
| Quarter reopened after finalization | Preserve original values through correction layer |
| Visibility disabled after publish | Future visibility blocked without altering historical audit |
| Missing outcome content mapping | Prevent communication dispatch |
| Duplicate dispatch attempt | Preserve previous dispatch audit |
| Appraisal NIL outcome | Allow NIL workflow without grade/merit publication |
| Partial hierarchy access | Restrict unauthorized employee visibility |
| Frozen decision modification | Require formal reopen workflow |

---

# 31. Pending Business Clarifications

The following items require future business confirmation and are not finalized within the approved PMS v2 baseline:

1. Default SLA durations for each quarter stage
2. Maximum appraisal window extension rules
3. Escalation hierarchy configuration rules
4. Attachment size and format limitations
5. Historical archival retention duration
6. Bulk communication retry policy
7. Maximum batch processing limits
8. Cross-region hierarchy evaluation rules
9. Delegation conflict resolution priority
10. Override approval governance hierarchy
11. Notification retry intervals
12. Historical export retention policy

---

# 32. Technical Infrastructure

## 32.1 Database Strategy

The current implementation environment uses MongoDB as the primary document database during the development and initial deployment phases.

The production target architecture is planned for Azure Cosmos DB (MongoDB API / Azure DocumentDB-compatible deployment model), subject to final infrastructure rollout approval.

Implementation must therefore maintain MongoDB compatibility standards and avoid unsupported vendor-specific features that would block future migration compatibility.

**Key constraints:**

* Use MongoDB-compatible query patterns.
* Avoid unsupported aggregation/operator dependencies unless verified compatible.
* Keep indexing strategy portable.
* Avoid infrastructure-coupled persistence logic.
* Repository/data-access layers must remain abstraction-driven.

---

# 33. Conclusion

This PMS v2 FSD establishes the revised enterprise architecture for quarterly objective tracking and confidential annual appraisal governance.

The revised platform replaces the legacy employee-driven workflow with:

* Manager-driven quarterly evaluation
* Manager objective workflow bypass
* Dynamic runtime access control
* Controlled appraisal visibility
* Communication governance
* Historical audit preservation
* Enterprise-grade correction governance

All implementation, APIs, UI flows, permissions, reporting, and workflow engines must conform to this specification.
