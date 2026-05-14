# Master Project Context Prompt

## PMS v2 — AI-Assisted Implementation Context

Use this prompt for all PMS v2 related AI-assisted work by Developers, QA Engineers, Business Analysts, Architects, and Reviewers.

---

# MASTER CONTEXT PROMPT

You are working on the **Performance Management System (PMS) v2** project.

The PMS v2 system is a workflow-driven enterprise HRMS module used to manage the quarterly objective lifecycle, manager review process, annual appraisal decision process, visibility governance, communication dispatch, and historical appraisal tracking.

The approved baseline states that all implementation, database design, API planning, workflow design, access control, audit handling, and UI behavior must conform to the finalized PMS v2 business decisions.

Your work must strictly follow:

*   PMS Functional Scope Document v2
*   PMS Approved Baseline
*   PMS Workflow Decisions
*   PMS Discussion Notes
*   Approved architecture decisions

Do NOT:

*   invent business logic,
*   invent workflow stages,
*   invent statuses,
*   invent APIs,
*   invent permissions,
*   rename approved concepts,
*   introduce unsupported assumptions,
*   or deviate from the approved PMS v2 workflow.

---

# 1. Project Overview

PMS v2 manages the complete quarterly objective and annual appraisal lifecycle across the organization.

The system supports:

*   Annual Parent Cycle Management
*   Quarterly Objective Lifecycle
*   Employee Objective Submission
*   Manager Objective Approval
*   Quarterly Manager Review
*   Annual Appraisal Decision
*   Grade and Merit Governance
*   Visibility Governance
*   Dynamic Communication Dispatch
*   History Preservation
*   Audit Compliance
*   Dynamic Access Control
*   Role-Based Security
*   SLA and Escalation Handling

The core transactional objects are:

*   Annual Assignment
*   Quarter Assignment
*   Objective
*   Quarter Review
*   Annual Appraisal Decision
*   Communication Dispatch Record
*   Audit Record

One Annual Assignment represents:

*   one Employee
*   one Annual Parent Cycle
*   one assigned Manager
*   four linked Quarter Assignments
*   one locked Template Version
*   one annual workflow state
*   one audit-traceable appraisal lifecycle

Each Quarter Assignment represents:

*   one quarter (Q1/Q2/Q3/Q4)
*   objective lifecycle
*   manager review lifecycle
*   quarter workflow state
*   independent audit tracking

All workflow actions, approvals, comments, visibility changes, communication actions, reopen actions, corrections, and overrides must remain audit traceable.

---

# 2. Business Goals

All implementation must support these approved business goals:

*   Quarterly objective-driven performance management
*   Manager-driven review process
*   Confidential annual appraisal governance
*   Dynamic and configurable PMS templates
*   Dynamic role and hierarchy-based access control
*   Strict workflow governance
*   Immutable historical tracking
*   Secure visibility governance
*   Dynamic communication generation and dispatch
*   Audit-safe corrections and reopen handling
*   Reporting-ready structured data
*   Scalable organization-wide appraisal processing

The approved PMS v2 baseline removes legacy employee-driven appraisal stages.

Employee self-review, employee acceptance, employee sign-off, and dual-rating workflows are NOT part of PMS v2.

---

# 3. Approved Terminology

Use only the approved terminology below.

## Roles

| Approved Term | Do Not Use            |
| :------------ | :-------------------- |
| Employee      | Associate, User       |
| Manager       | Reviewer, Evaluator   |
| HR/Admin      | HR alone, Admin alone |
| Management    | Leadership Reviewer   |
| Director      | Skip-Level Reviewer   |
| Custom Role   | Hardcoded Role        |

## Modules

Use these exact module names:

*   Template Management
*   Cycle Management
*   Assignment Management
*   Objective Management
*   Manager Quarterly Review Management
*   Annual Appraisal Decision Management
*   Visibility Governance
*   Communication Dispatch Management
*   Dynamic Access Engine
*   Audit & Compliance
*   Notification & SLA Management
*   History Management

## Entities

Use these exact entity names:

*   Annual Assignment
*   Quarter Assignment
*   Objective
*   Quarter Review
*   Annual Appraisal Decision
*   PMS Template
*   Template Version
*   Letter Template
*   Audit Log
*   Visibility Governance Configuration
*   Communication Dispatch
*   Correction Layer

## Actions

Use these exact action names:

*   Submit
*   Approve
*   Return for Revision
*   Finalize
*   Freeze
*   Reopen
*   Override
*   Enable Visibility
*   Disable Visibility
*   Preview
*   Dispatch
*   Resend
*   Reassign
*   Delegate

## Approved Workflow States

### Quarter States:

*   NOT_STARTED
*   OBJECTIVE_SETTING_OPEN
*   OBJECTIVE_DRAFT
*   OBJECTIVE_SUBMITTED
*   OBJECTIVE_REVISION_REQUIRED
*   OBJECTIVE_APPROVED
*   MANAGER_REVIEW_OPEN
*   MANAGER_REVIEW_SUBMITTED
*   QUARTER_FINALIZED
*   REOPENED_BY_ADMIN
*   CLOSED_BY_ADMIN

### Annual States:

*   DRAFT
*   SCHEDULED
*   ACTIVE
*   IN_PROGRESS
*   ALL_QUARTERS_FINALIZED
*   APPRAISAL_WINDOW_OPEN
*   MANAGEMENT_DECISION_DRAFT
*   MANAGEMENT_DECISION_SUBMITTED
*   ANNUAL_FINALIZED
*   VISIBILITY_ENABLED
*   COMMUNICATION_READY
*   COMMUNICATION_SENT
*   CLOSED
*   ARCHIVED
*   CANCELLED

---

# 4. Architecture Standards

All implementation must follow these architectural standards:

*   PMS must be workflow-engine driven.
*   Workflow transitions must be centrally enforced.
*   UI must never be the only enforcement layer.
*   API and service layers must enforce:
    *   permissions,
    *   workflow rules,
    *   hierarchy scope,
    *   assignment ownership,
    *   field visibility,
    *   validation.
*   Annual Assignment and Quarter Assignment must remain separate transactional layers.
*   Q1–Q4 must remain operationally independent.
*   Template Version must be locked during assignment creation.
*   Historical records must never change after finalization.
*   Audit records must be immutable and tamper evident.
*   Finalized records must remain frozen.
*   Reopen and override must preserve historical values.
*   Corrections must create correction layers instead of overwriting historical data.
*   Grade and Merit must remain confidential until visibility governance.
*   Dynamic access configuration must not require code changes.

### Persistence Layer Standard

*   The current implementation uses MongoDB.
*   Future production deployment is expected to migrate to Azure Cosmos DB / Azure DocumentDB-compatible infrastructure.
*   All persistence implementation must remain MongoDB-compatible and migration-safe.
*   Avoid database-specific features that reduce portability unless explicitly approved.

---

# 5. Coding Constraints

When generating code:

*   Do not hardcode workflow statuses outside approved enums/constants.
*   Do not create new statuses.
*   Do not create new workflow stages.
*   Do not create unsupported approval paths.
*   Do not bypass workflow validation.
*   Do not bypass server-side authorization.
*   Do not expose hidden fields in API responses.
*   Do not allow finalized record mutation through standard APIs.
*   Do not overwrite finalized manager reviews.
*   Do not overwrite frozen appraisal decisions.
*   Do not overwrite historical communication content.
*   Do not expose confidential grade or merit fields before visibility governance.
*   Do not hardcode visibility logic.
*   Do not hardcode communication template selection.
*   Do not allow Manager access outside assignment or hierarchy scope.
*   Do not implement legacy employee self-review or sign-off stages.
*   Do not recalculate frozen appraisal outcomes.

---

# 6. Validation Principles

All final submissions must enforce:

*   Required field validation
*   Quarter window validation
*   Workflow transition validation
*   Assignment ownership validation
*   Field visibility validation
*   Objective weightage validation
*   Grade and merit flag validation
*   Appraisal eligibility validation
*   Communication mapping validation
*   Reopen reason validation
*   Override reason validation
*   Finalized record protection
*   Visibility governance validation
*   Template placeholder validation

### Validation rules:

*   `isGradeApplied` and `isMeritApplied` are mandatory during annual finalization.
*   `appraisalOutcomeType` must be derived from the decision flags.
*   Grade fields are required only when `isGradeApplied = true`.
*   Merit fields are required only when `isMeritApplied = true`.
*   NIL outcomes must follow approved communication rules.
*   Annual decision cannot start until all applicable quarters are finalized or closed.
*   Hidden fields must never appear in unauthorized responses.

Draft saves may bypass required field validation but must not trigger workflow transitions.

---

# 7. API Standards

All APIs must enforce authorization and business validation at the service layer.

### API behavior rules:

*   Every write API must validate actor role.
*   Every write API must validate workflow state.
*   Every write API must validate assignment ownership.
*   Every response must obey field-level visibility.
*   Hidden fields must not be returned.
*   Finalized records must reject standard edit APIs.
*   Reopen APIs must require mandatory reason.
*   Override APIs must require mandatory reason.
*   Visibility APIs must validate permissions.
*   Audit records must be created for critical write actions.
*   API naming must use approved terminology.

### Expected API groups:

*   Template APIs
*   Cycle APIs
*   Assignment APIs
*   Objective APIs
*   Quarter Review APIs
*   Annual Decision APIs
*   Visibility Governance APIs
*   Communication APIs
*   History APIs
*   Access Configuration APIs
*   Audit APIs
*   Dashboard APIs

---

# 8. Naming Conventions

Use consistent naming across database, backend code, APIs, UI labels, tests, logs, audit records, reports, and documentation.

### Core Entity Examples:

*   `AnnualAssignment`
*   `QuarterAssignment`
*   `Objective`
*   `QuarterReview`
*   `AnnualAppraisalDecision`
*   `CommunicationDispatch`
*   `VisibilityConfiguration`
*   `AuditLog`
*   `CorrectionLayer`
*   `WorkflowAction`

## 8.1 Shared Technical Naming Standards

### Backend (Node.js)

#### Classes / Models / DTOs / Services
*   **Case**: `PascalCase`
*   **Examples**: `AnnualAssignment`, `QuarterAssignment`, `ObjectiveService`, `WorkflowEngine`, `VisibilityConfiguration`, `AnnualAppraisalDecisionDto`, `CommunicationDispatchService`

#### Variables / Methods / Functions
*   **Case**: `camelCase`
*   **Examples**: `createAnnualAssignment()`, `submitQuarterReview()`, `validateWorkflowTransition()`, `isGradeApplied`, `assignedManagerId`

#### Constants
*   **Case**: `UPPER_SNAKE_CASE`
*   **Examples**: `MAX_OBJECTIVE_WEIGHTAGE`, `DEFAULT_PAGE_SIZE`, `APPRAISAL_OUTCOME_TYPES`

#### Enum Keys / Workflow States
*   **Case**: `UPPER_SNAKE_CASE`
*   **Examples**: `OBJECTIVE_SUBMITTED`, `QUARTER_FINALIZED`, `VISIBILITY_ENABLED`, `COMMUNICATION_SENT`

#### API Routes
*   **Case**: `kebab-case` (plural resource naming)
*   **Examples**: `/api/annual-assignments`, `/api/quarter-assignments`, `/api/objectives`, `/api/quarter-reviews`, `/api/annual-decisions`, `/api/communications`
*   **Avoid**: `/api/getAnnualAssignment`, `/api/ObjectiveAPI`, `/api/QuarterReviewData`

## 8.2 Database & Persistence Standard (MongoDB / Cosmos DB)

#### Collections
*   **Case**: `camelCase` (plural)
*   **Examples**: `annualAssignments`, `quarterAssignments`, `objectives`, `quarterReviews`, `annualAppraisalDecisions`, `communicationDispatches`, `auditLogs`, `visibilityConfigurations`

#### Document Fields
*   **Case**: `snake_case`
*   **Examples**: `employee_id`, `manager_id`, `workflow_state`, `is_grade_applied`, `is_merit_applied`, `created_at`, `updated_at`, `template_version_id`

#### Models / Schemas
*   **Case**: `PascalCase`
*   **Examples**: `AnnualAssignment`, `QuarterAssignment`, `Objective`, `QuarterReview`, `AnnualAppraisalDecision`

#### Mongo Index Names
*   **Case**: `snake_case`
*   **Examples**: `idx_employee_cycle`, `idx_manager_assignment`, `idx_workflow_state`

### Frontend (Svelte) Naming Standards

#### Svelte Components
*   **Case**: `PascalCase`
*   **Examples**: `AnnualAssignmentCard.svelte`, `ObjectiveForm.svelte`, `QuarterReviewTable.svelte`, `VisibilitySettingsModal.svelte`

#### Stores
*   **Case**: `camelCase` (+ `Store` suffix)
*   **Examples**: `workflowStore`, `assignmentStore`, `visibilityStore`, `authStore`

#### Utility Files
*   **Case**: `camelCase`
*   **Examples**: `workflowHelpers.js`, `permissionUtils.js`, `dateFormatter.js`, `visibilityResolver.js`

#### Service Files
*   **Case**: `camelCase` (+ `Service` suffix)
*   **Examples**: `assignmentService.js`, `objectiveService.js`, `communicationService.js`

#### FE Methods / Functions
*   **Case**: `camelCase`
*   **Examples**: `loadAssignments()`, `submitObjective()`, `finalizeQuarterReview()`, `canViewGrade()`

#### Component Props
*   **Case**: `camelCase`
*   **Examples**: `export let annualAssignment;`, `export let workflowState;`, `export let isEditable;`

### Shared Naming Rules

#### Audit Events
*   **Case**: `UPPER_SNAKE_CASE`
*   **Examples**: `OBJECTIVE_SUBMITTED`, `OBJECTIVE_APPROVED`, `QUARTER_FINALIZED`, `ANNUAL_DECISION_FROZEN`, `COMMUNICATION_DISPATCHED`

#### Permission Codes
*   **Case**: `dot.notation`
*   **Examples**: `objective.create`, `objective.submit`, `quarterReview.finalize`, `annualDecision.freeze`, `communication.dispatch`

#### Config Keys
*   **Case**: `dot.notation`
*   **Examples**: `pms.visibility.employee.grade`, `pms.communication.nil.policy`, `pms.workflow.reopen.enabled`



Do not rename approved workflow states. All status names must remain uppercase exactly as approved.

---

# 9. Traceability Enforcement Rules

Every requirement, API, validation, workflow action, UI behavior, test case, and database change must map back to:

**Requirement → Module → Workflow → Validation → Audit Event**

Implementation must preserve traceability for:

*   workflow transitions
*   approvals
*   returns for revision
*   reopen actions
*   visibility governance
*   communication dispatch
*   correction layers
*   grade and merit decisions
*   template versions
*   actor attribution
*   timestamps
*   previous values
*   new values
*   mandatory reasons

### Audit records must preserve:

*   actor
*   role
*   action
*   entity
*   timestamp
*   previous value
*   new value
*   reason
*   source reference where applicable

If traceability is missing, mark the item as: **Pending Business Clarification**

---

# 10. Approval Flow Rules

Use only the approved sequential workflow model.

### Quarter Objective Flow

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

### Objective Revision Flow

```text
OBJECTIVE_SUBMITTED
→ OBJECTIVE_REVISION_REQUIRED
→ OBJECTIVE_SUBMITTED
```

### Manager-Created Objective Flow

```text
Manager creates objective
→ OBJECTIVE_APPROVED
```

### Annual Appraisal Flow

```text
ALL_QUARTERS_FINALIZED
→ APPRAISAL_WINDOW_OPEN
→ MANAGEMENT_DECISION_DRAFT
→ MANAGEMENT_DECISION_SUBMITTED
→ ANNUAL_FINALIZED
```

### Visibility and Communication Flow

```text
ANNUAL_FINALIZED
→ VISIBILITY_ENABLED
→ COMMUNICATION_READY
→ COMMUNICATION_SENT
```

### Reopen Flow

```text
ANNUAL_FINALIZED
→ APPRAISAL_WINDOW_OPEN
→ correction/override
→ ANNUAL_FINALIZED
```

Reopen is correction-only.

Reopen must not restart the entire appraisal lifecycle.

---

# 11. Non-Functional Requirements

All implementation must support:

*   Security through role, hierarchy, workflow, and field-level access control
*   Server-side authorization
*   Configurability without code changes
*   Scalability for organization-wide cycles
*   Immutable auditability
*   Historical consistency
*   Data integrity
*   Reporting readiness
*   Communication traceability
*   Bulk operation support
*   Asynchronous processing support
*   Tamper-evident audit storage
*   Confidential appraisal governance

### The system must support configurable:

*   templates
*   permissions
*   hierarchy scopes
*   visibility rules
*   communication rules
*   SLA rules
*   escalation rules
*   quarter windows
*   appraisal windows

---

# 12. Assumption Restrictions

Do not assume or introduce:

*   employee self-review
*   employee sign-off
*   employee acceptance workflow
*   dual ratings
*   multi-manager parallel approval
*   skip-level appraisal editing
*   automatic recalculation of frozen decisions
*   unrestricted HR editing
*   hidden field exposure
*   unsupported escalation logic
*   unsupported SLA restart logic
*   unapproved approval stages
*   unsupported appraisal rollback
*   unsupported notification retry engine
*   unsupported archived dashboard behavior

If required behavior is missing, mark it as: **Pending Business Clarification**

Do not fill gaps using invented logic.

---

# 13. Reusability Standards

All implementation artifacts must be reusable and modular.

### Required standards:

*   Centralize workflow transitions.
*   Centralize authorization checks.
*   Centralize validation rules.
*   Centralize audit creation.
*   Use shared enums/constants.
*   Use reusable API response formats.
*   Use reusable audit helpers.
*   Use reusable workflow guards.
*   Use reusable visibility evaluation services.
*   Use reusable communication rendering services.
*   Avoid duplicated business logic.
*   Avoid hardcoded role or status checks.

---

# 14. Error Handling Expectations

All errors must be: **explicit, traceable, secure, and audit-safe.**

### Expected error categories:

| Scenario                          | Expected Handling                     |
| :-------------------------------- | :------------------------------------ |
| Invalid workflow transition       | Reject with workflow validation error |
| Submission outside quarter window | Reject submission                     |
| Missing required fields           | Return validation error list          |
| Invalid weightage                 | Reject submission                     |
| Invalid appraisal flags           | Reject finalization                   |
| Unauthorized access               | Return access denied                  |
| Hidden field access               | Do not expose field                   |
| Finalized record edit attempt     | Reject edit                           |
| Missing reopen reason             | Reject action                         |
| Missing override reason           | Reject action                         |
| Invalid visibility configuration  | Reject request                        |
| Missing communication template    | Reject dispatch                       |
| Invalid template placeholders     | Reject activation                     |
| Communication failure             | Record failure and preserve audit     |
| Bulk partial failure              | Report per-record failure             |
| Unauthorized hidden field write   | Reject with authorization error       |

Notification retry logic is not implemented unless explicitly approved in future scope.

---

# 15. Security Guidelines

Security rules are mandatory.

### The system must:

*   enforce all permissions server-side,
*   enforce role + hierarchy + assignment + workflow + field visibility together,
*   never rely only on frontend visibility,
*   never expose hidden fields in API responses,
*   keep grade and merit confidential by default,
*   keep generated letters confidential before visibility governance,
*   restrict Manager access to approved hierarchy scope,
*   preserve immutable audit history,
*   preserve immutable finalized decisions,
*   preserve original manager-submitted values,
*   preserve original communication snapshots,
*   preserve reopen and override history,
*   preserve reassignment attribution,
*   preserve correction layer history.

### Access evaluation must consider:

*   role permissions,
*   assignment ownership,
*   hierarchy scope,
*   workflow state,
*   section permissions,
*   field visibility,
*   visibility rules.

---

# 16. Approved Out-of-Scope Items

Do not implement these unless a new approved change request exists:

*   employee self-review workflow
*   employee sign-off workflow
*   employee acceptance workflow
*   dual-rating workflow
*   multi-approver workflow
*   parallel approval workflow
*   unrestricted skip-level editing
*   automatic notification retry engine
*   automatic appraisal recalculation
*   unsupported rollback behavior
*   unsupported archived cycle handling
*   unsupported matrix reporting hierarchy
*   unsupported assignment cancellation concepts

These are explicitly out of scope in the approved PMS v2 baseline.

---

# 17. Mandatory Response Rule for AI

Before producing any implementation output, verify that the output:

1.  uses approved terminology,
2.  follows approved workflow states,
3.  does not invent business logic,
4.  does not introduce unauthorized assumptions,
5.  preserves auditability,
6.  enforces server-side permissions,
7.  preserves immutable history,
8.  maintains traceability to PMS v2 requirements,
9.  preserves confidentiality rules,
10. clearly marks unresolved items as **Pending Business Clarification**.

**When unsure: Ask for clarification instead of assuming.**

---

# Final Instruction

Generate all PMS v2 implementation artifacts as if the **PMS v2 Approved Baseline** is the source of truth.

The Scope Document, FSD, workflow diagrams, discussion notes, and supporting documents may be used only to support or explain the approved baseline — not to override it.

Never introduce functionality outside the approved PMS v2 architecture.
