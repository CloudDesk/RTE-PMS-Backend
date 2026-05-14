# PMS v2 Consistency Audit Prompt

## For Validating All Generated Implementations

Use this prompt to audit all PMS v2 implementation artifacts against the:

*   PMS v2 Approved Baseline
*   Functional Scope Document
*   Functional Specification Document
*   Alignment & Discussion Decisions
*   v2 Dynamic Access decisions

The PMS v2 Approved Baseline is the source of truth for:

*   workflow
*   naming
*   approvals
*   validations
*   access control
*   visibility governance
*   communication dispatch
*   historical preservation
*   correction handling
*   confidentiality
*   and out-of-scope restrictions

All audit outputs must:

*   prevent assumption approval
*   identify architecture deviations
*   identify workflow inconsistencies
*   identify naming conflicts
*   identify permission mismatches
*   identify validation inconsistencies
*   identify API inconsistencies
*   identify security gaps
*   identify missing dependencies
*   preserve traceability to PMS v2 scope/FSD/baseline

---

# Master Audit Instruction

Review all generated implementation artifacts for consistency across:

*   modules
*   APIs
*   services
*   DTOs
*   database models
*   enums
*   workflow transitions
*   permissions
*   validations
*   error handling
*   audit events
*   visibility rules
*   dashboards
*   reports
*   tests
*   and documentation

Do NOT approve implementation if it:

*   invents business logic
*   introduces unapproved statuses
*   changes approved terminology
*   bypasses Workflow Engine
*   bypasses Dynamic Access Engine
*   exposes hidden fields
*   bypasses Visibility Governance
*   bypasses audit logging
*   implements employee self-review
*   implements employee acceptance/sign-off
*   implements dual-rating
*   implements parallel approvals
*   recalculates frozen decisions
*   modifies immutable historical snapshots
*   allows unrestricted HR editing
*   relies only on UI permissions
*   restarts full workflow on reopen
*   restarts SLA automatically after reopen
*   introduces unsupported retry engine
*   implements unsupported archived-cycle logic

---

# 1. Naming Standards Audit

Validate consistent use of approved PMS v2 terminology.

## Approved Roles

*   Employee
*   Manager
*   HR/Admin
*   Management
*   Director
*   Custom Role

## Approved Modules

*   Template Management
*   Cycle Management
*   Assignment Management
*   Workflow Engine
*   Objective Management
*   Manager Quarterly Review Management
*   Annual Appraisal Decision Management
*   Visibility Governance
*   Communication Dispatch
*   Dynamic Access Engine
*   History & Audit Compliance
*   SLA & Notification Management
*   Delegation & Reassignment
*   Dashboard & Reporting
*   Bulk Operations

## Approved Entities

*   Annual Assignment
*   Quarter Assignment
*   Objective
*   Quarter Review
*   Annual Appraisal Decision
*   PMS Template
*   Template Version
*   Communication Dispatch
*   Visibility Configuration
*   Audit Log
*   Correction Layer
*   Workflow Action
*   Delegation
*   Reassignment

## Audit Checks

Validate:

*   No Goal terminology.
*   No Self Review terminology.
*   No Acceptance terminology.
*   No alternate role names.
*   No duplicate entity names.
*   No inconsistent API naming.
*   No inconsistent database entity names.
*   No mixed UI labels.
*   No module aliases.
*   No legacy v2 terminology.

Flag terms such as:

*   Goal instead of Objective
*   Reviewer instead of Manager
*   User instead of Employee
*   Admin instead of HR/Admin
*   Evaluation instead of Annual Appraisal Decision where incorrect
*   Acceptance instead of Visibility Governance

---

# 2. API Structure Consistency Audit

Validate all APIs follow consistent PMS v2 standards.

## API Audit Checks

Validate:

*   APIs use approved entity/action naming.
*   APIs follow consistent URL structure.
*   APIs use consistent response format.
*   APIs use consistent error structure.
*   APIs validate workflow state.
*   APIs validate actor role.
*   APIs validate assignment relationship.
*   APIs validate hierarchy scope.
*   APIs validate field-level permissions.
*   APIs validate visibility rules.
*   APIs validate required reason fields.
*   APIs create audit events for critical actions.
*   APIs use Workflow Engine for transitions.
*   APIs use Dynamic Access Engine for permission evaluation.
*   APIs use Visibility Governance for field filtering.
*   APIs reject finalized record edits.
*   APIs do not expose hidden fields.

## Required API Behavior

Every write API must validate:

*   actor role
*   Assignment ownership enforced.
*   hierarchy scope
*   workflow state
*   milestone window where applicable
*   field-level visibility
*   hidden/confidential field restrictions
*   mandatory reason where required
*   finalized record protection

## Audit API-Specific Rules

Validate:

*   Reopen APIs preserve snapshots.
*   Freeze APIs reject recalculation.
*   Communication APIs preserve immutable sent content.
*   Validate PMS v2 confidentiality rules.
*   Bulk APIs provide per-record results.
*   Dashboard APIs obey visibility scope.

---

# 3. Status Naming Consistency Audit

Validate quarter and annual workflow status consistency.

## Approved Quarter Statuses

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

## Approved Annual Statuses

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

## Audit Checks

Validate:

*   No lowercase status values.
*   No camelCase status values.
*   No display labels stored as status values.
*   No extra statuses.
*   No missing statuses.
*   No legacy v2 statuses.
*   Workflow transitions match approved transition matrix.
*   Reopen flow remains correction-only.

Flag if implementation introduces:

*   SELF_REVIEW_OPEN
*   EMPLOYEE_ACCEPTANCE_PENDING
*   GOAL_APPROVED
*   HR_ESCALATED
*   FINALIZED without approved annual context
*   Parallel approval statuses

---

# 4. Validation Consistency Audit

Validate all modules enforce approved PMS v2 validation behavior.

## Required Validations

*   Required field validation on final submission
*   Draft-save bypass support
*   Objective weightage validation
*   Quarter dependency validation
*   State transition validation
*   Workflow dependency validation
*   Finalized record protection
*   Duplicate assignment prevention
*   Reassignment reason mandatory
*   Objective revision comment mandatory
*   Reopen reason mandatory
*   Override reason mandatory
*   Hidden-field masking
*   Visibility dependency validation
*   Communication template validation
*   Placeholder validation
*   Template Version locking
*   Immutable history protection
*   Audit reason validation
*   Permission simulation validation
*   Deny-over-allow enforcement

## Annual Appraisal Validations

Validate:

*   isGradeApplied mandatory
*   isMeritApplied mandatory
*   appraisalOutcomeType derivation
*   BOTH outcome handling
*   GRADE_ONLY handling
*   MERIT_ONLY handling
*   NIL handling
*   Grade fields required conditionally
*   Merit fields required conditionally

## Validation Audit Checks

Validate:

*   Same validation behavior across UI and API.
*   Server-side validation exists for every frontend validation.
*   Validation messages are consistent.
*   Validation utilities are reusable.
*   Final submit differs correctly from draft save.
*   No module bypasses validation rules.
*   No hidden fields bypass filtering.

---

# 5. Permission Consistency Audit

Validate centralized permission enforcement.

## Permission Dimensions

Every access decision must evaluate:

*   role
*   assignment relationship
*   hierarchy scope
*   workflow state
*   field-level permissions
*   visibility rules
*   delegated access validity
*   reassignment attribution

## Permission Audit Checks

Validate:

*   Employee accesses only own Annual Assignments.
*   Manager accesses only assigned/hierarchy-authorized employees.
*   HR/Admin accesses configuration, override, audit, visibility, communication, bulk operations.
*   Management accesses annual decisions where configured.
*   Director remains scoped and read-only unless configured otherwise.
*   Delegation acts only within approved validity.
*   Hidden fields are never returned.
*   Read-only fields are not writable.
*   Finalized records reject edits.
*   Reopen/Override/Visibility/Dispatch follow approved permissions.
*   APIs enforce permissions server-side.
*   UI-only permissions are not relied upon.

## Dynamic Access Audit

Validate:

*   Deny-over-allow logic.
*   Field-level visibility filtering.
*   API payload permission validation.
*   Permission simulation consistency.
*   Role publishing validation.
*   No hardcoded roles.

---

# 6. Error Handling Consistency Audit

Validate consistent error handling across modules.

## Required Error Categories

*   Validation Error
*   Permission Error
*   Workflow Transition Error
*   State Conflict Error
*   Duplicate Assignment Error
*   Quarter Dependency Error
*   Finalized Record Edit Error
*   Hidden Field Access Error
*   Missing Reason Error
*   Communication Template Error
*   Visibility Dependency Error
*   Notification Delivery Failure
*   Bulk Partial Failure
*   Permission Configuration Error

## Error Handling Audit Checks

Validate:

*   Same error format across APIs.
*   Same error-code naming pattern.
*   Errors are user-safe.
*   Errors do not expose sensitive data.
*   Errors identify failed field/action clearly.
*   Hidden fields are not leaked in errors.
*   Bulk APIs provide per-record failures.
*   Notification failures are logged.
*   Communication failures preserve audit.
*   Finalized edit attempts are rejected consistently.

## Error Security Checks

Validate:

*   Unauthorized hidden field requests are masked/rejected.
*   Error responses do not leak confidential grade/merit.
*   API stack traces are not exposed.
*   Audit failures do not expose sensitive values.

---

# 7. Reusability Standards Audit

Validate implementation avoids duplicated business logic.

## Required Reusable Components

*   Workflow Engine
*   Dynamic Access Engine
*   Permission Service
*   Validation Service
*   Visibility Filtering Utility
*   Audit Service
*   Communication Rendering Service
*   Notification Service
*   Workflow Guard Utility
*   Status Constants
*   Role Constants
*   Error Response Helpers
*   Field Visibility Utilities
*   Snapshot Utilities
*   Bulk Processing Utilities

## Reusability Audit Checks

Validate:

*   No duplicated workflow transition matrix.
*   No duplicated permission logic.
*   No duplicated validation rules.
*   No duplicated audit logic.
*   No hardcoded roles/statuses.
*   Shared enums/constants reused consistently.
*   Field filtering centralized.
*   Snapshot logic centralized.
*   Visibility logic reusable.
*   Communication rendering reusable.
*   Workflow transitions centralized.

Flag:

*   duplicate transition logic
*   scattered permission checks
*   repeated validation code
*   direct DB updates bypassing reusable services

---

# 8. Architecture Compliance Audit

Validate enterprise architecture compliance.

## Required Architecture Rules

*   Workflow Engine owns state transitions.
*   Dynamic Access Engine owns permission evaluation.
*   Visibility Governance owns field filtering.
*   Audit & Compliance owns audit logging.
*   Communication Dispatch owns communication generation/sending.
*   Notification Management owns reminders/escalations.
*   Template Version is locked to Annual Assignment.
*   Finalized records are immutable.
*   Reopen is correction-only.
*   Corrections preserve snapshots.
*   APIs enforce business rules server-side.
*   Bulk operations preserve per-record integrity.
*   Dashboard queries obey scoped filtering.

## Architecture Audit Checks

Validate:

*   Controllers do not directly modify workflow states.
*   Modules use Workflow Engine for transitions.
*   Modules use Permission Service for access checks.
*   Modules use Audit Service for audit.
*   Modules use Visibility filtering before API response.
*   Modules preserve immutable history.
*   Modules preserve correction layers.
*   Modules preserve historical manager attribution.
*   Communication history remains immutable.
*   No architecture shortcut bypasses approved governance.

## Confidentiality Architecture Checks

Validate:

*   Grade/Merit hidden before visibility governance.
*   API masking occurs server-side.
*   Communication content protected before publish.
*   Dashboard/reporting obey visibility scope.

---

# 9. Conflict Report Format

Use this format for every inconsistency found.

| Field                | Details                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Conflict ID          | CONS-CONF-001                                                                                                  |
| Area                 | Naming / API / Status / Validation / Permission / Error / Workflow / Architecture / Visibility / Communication |
| Module(s) Affected   | Module names                                                                                                   |
| Artifact(s) Reviewed | File/API/service/test/screen name                                                                              |
| Approved Standard    | Expected rule from PMS v2 baseline/FSD                                                                       |
| Found Conflict       | Actual inconsistency found                                                                                     |
| Conflict Type        | Missing / Duplicate / Wrong Name / Wrong Flow / Unauthorized Logic / Security Gap / Architecture Deviation     |
| Severity             | Critical / High / Medium / Low                                                                                 |
| Business Impact      | Impact on workflow/security/compliance                                                                         |
| Required Fix         | Exact required correction                                                                                      |
| Owner                | Dev / QA / BA / Architect                                                                                      |
| Status               | Open / Fixed / Deferred                                                                                        |
| Retest Needed        | Yes/No                                                                                                         |

All conflicts must preserve traceability.

---

# 10. Missing Dependency Report

Use this format when implementation depends on a missing/incomplete dependency.

| Field                        | Details                                  |
| ---------------------------- | ---------------------------------------- |
| Dependency ID                | CONS-DEP-001                             |
| Module                       | Affected module                          |
| Missing Dependency           | Service/API/entity/configuration missing |
| Required By                  | Feature/API/workflow requiring it        |
| Expected Dependency Behavior | Expected behavior                        |
| Current Gap                  | Missing/incomplete behavior              |
| Impact                       | High / Medium / Low                      |
| Blocks Implementation?       | Yes/No                                   |
| Required Action              | Build/add/integrate dependency           |
| Owner                        | Dev / Architect                          |
| Status                       | Open / Closed                            |

## Dependency Examples to Check

*   Workflow Engine missing transition matrix
*   Annual Decision missing snapshot utility
*   Communication missing placeholder renderer
*   Visibility Governance missing field filtering utility
*   Dashboard missing scoped query service
*   Notification Management missing scheduler
*   APIs missing Dynamic Access integration
*   APIs missing Visibility Governance integration
*   Modules missing Audit integration
*   Bulk Operations missing partial-failure handler

---

# 11. Traceability Mismatch Report

Validate when implementation cannot be traced to approved PMS v2 scope.

| Field                 | Details                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Traceability ID       | CONS-TRACE-001                                                                             |
| Artifact Reviewed     | API/service/screen/test/database object                                                    |
| Claimed Requirement   | Requirement/module claimed                                                                 |
| Approved Reference    | Scope/FSD/Baseline/Alignment reference                                                     |
| Expected Behavior     | Approved behavior                                                                          |
| Implemented Behavior  | Actual behavior                                                                            |
| Mismatch Type         | Missing Trace / Wrong Requirement / Extra Logic / Conflicting Logic / Assumption Invention |
| Severity              | Critical / High / Medium / Low                                                             |
| Required Correction   | Update implementation or raise clarification                                               |
| Clarification Needed? | Yes/No                                                                                     |
| Status                | Open / Closed                                                                              |

## Traceability Checks

Validate:

*   Every API maps to approved module/requirement.
*   Every workflow transition maps to approved state transition.
*   Every validation maps to approved rule.
*   Every permission maps to approved Dynamic Access rule.
*   Every visibility filter maps to approved confidentiality rule.
*   Every audit event maps to approved audit requirement.
*   Every communication behavior maps to approved communication policy.
*   Every test case maps to approved requirement.

Flag any untraceable logic as:

Assumption Invention

---

# 12. Final Audit Decision Checklist

Before approving implementation, confirm:

| Check                                         | Pass/Fail |
| --------------------------------------------- | --------- |
| Approved naming used consistently             |           |
| Approved statuses only                        |           |
| Approved workflow transitions only            |           |
| No invented business logic                    |           |
| No unsupported legacy logic                    |           |
| API structure consistent                      |           |
| Validation rules consistent                   |           |
| Permissions enforced server-side              |           |
| Dynamic Access rules followed                 |           |
| Visibility Governance enforced                |           |
| Hidden fields excluded from APIs              |           |
| Finalized records immutable                   |           |
| Reopen correction-only                        |           |
| Frozen decisions immutable                    |           |
| Communication history immutable               |           |
| Audit logs complete and immutable             |           |
| Reusable services/constants used              |           |
| Architecture governance preserved             |           |
| All artifacts traceable to scope/FSD/baseline |           |

If any item fails:

*   Create Conflict Report, OR
*   Create Missing Dependency Report, OR
*   Create Traceability Mismatch Report

and do not approve until resolved.

---

# Final Audit Rule

All implementation consistency decisions must follow:

Approved Baseline → FSD → Scope → Alignment Decisions

in that order of precedence.

The PMS v2 Approved Baseline is the final authority.

Do not approve any implementation that conflicts with approved PMS v2 architecture, Dynamic Access governance, Visibility Governance, Communication Governance, or Immutable History rules.
