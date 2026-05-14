# BA Implementation Review Validation Prompt — PMS v2

## PMS v2 — Business Analysis Review & Validation Prompt

Use this prompt to review PMS v2 implementation against the approved:

*   PMS Functional Scope Document v2
*   PMS Functional Specification Document
*   PMS Approved Baseline
*   Workflow Decisions
*   Dynamic Access & Visibility Decisions
*   Discussion Notes and Approved Clarifications

The PMS v2 Approved Baseline is the source of truth.

---

# Master BA Review Instruction

Review the implementation strictly against approved PMS v2 business rules.

Validate that the implementation:

*   follows approved quarterly objective-driven workflow,
*   follows approved annual appraisal decision workflow,
*   uses approved terminology only,
*   enforces approved workflow transitions,
*   enforces approved role and visibility rules,
*   preserves confidentiality,
*   preserves auditability,
*   preserves immutable history,
*   preserves correction-layer governance,
*   preserves template version locking,
*   preserves workflow-engine governance,
*   preserves dynamic access control,
*   does not introduce unsupported assumptions,
*   does not implement out-of-scope features.

Do NOT approve implementation if it introduces:

*   employee self-review,
*   employee acceptance/sign-off,
*   dual-rating workflow,
*   parallel approvals,
*   multiple managers per assignment,
*   skip-level review workflow,
*   recalculation after freeze,
*   unrestricted HR editing,
*   automatic notification retry engine,
*   workflow restart after reopen,
*   SLA restart after reopen,
*   hidden-field exposure,
*   UI-only permission enforcement,
*   unsupported archived-cycle behavior,
*   unsupported workflow statuses,
*   unsupported approval stages,
*   legacy Goal terminology,
*   legacy Self Review terminology.

---

# 1. Gap Analysis Format

Use this format for every BA review finding.

| Field                          | Details                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Gap ID                         | BA-GAP-001                                                                                                                          |
| Module                         | Template / Cycle / Assignment / Workflow / Objective / Review / Annual Decision / Visibility / Communication / Audit etc.           |
| Reviewed Area                  | Screen / API / Workflow / Validation / Permission / Audit / Visibility                                                              |
| Approved Requirement Reference | Scope/FSD/Baseline reference                                                                                                        |
| Expected Business Behavior     | Approved expected behavior                                                                                                          |
| Actual Implemented Behavior    | What implementation does                                                                                                            |
| Gap Type                       | Missing / Incorrect / Extra / Naming mismatch / Validation mismatch / Workflow mismatch / Permission mismatch / Assumption mismatch |
| Business Impact                | Critical / High / Medium / Low                                                                                                      |
| Approval Impact                | Blocks approval? Yes/No                                                                                                             |
| Required Correction            | Exact correction needed                                                                                                             |
| Clarification Needed?          | Yes/No                                                                                                                              |
| Owner                          | BA / Dev / QA / Architect                                                                                                           |
| Status                         | Open / In Review / Closed                                                                                                           |

---

# 2. Scope Alignment Review Prompt

Validate whether the implemented module aligns with approved PMS v2 scope.

Check:

*   Is the module part of approved PMS v2 scope?
*   Are all expected features implemented?
*   Are any unapproved features added?
*   Are deferred/out-of-scope items excluded?
*   Are APIs/screens mapped correctly?
*   Are implementation decisions traceable to Scope/FSD/Baseline?

Approved PMS v2 Modules:

*   Template Management
*   Cycle Management
*   Assignment Management
*   Workflow Engine
*   Objective Management
*   Manager Quarterly Review Management
*   Annual Appraisal Decision Management
*   Visibility Governance
*   Communication Dispatch Management
*   Dynamic Access Engine
*   History Management
*   Audit & Compliance
*   Notification & SLA Management
*   Delegation & Reassignment
*   Dashboard & Reporting
*   Bulk Operations

Flag as critical gap if implementation includes:

*   Self Review module
*   Employee Acceptance module
*   Dual Rating module
*   Parallel Approval module
*   Legacy Goal workflow

---

# 3. Business Flow Correctness Review Prompt

Validate implementation against approved PMS v2 flow.

---

## Approved Quarter Workflow

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

---

## Approved Revision Workflow

```text
OBJECTIVE_SUBMITTED
→ OBJECTIVE_REVISION_REQUIRED
→ OBJECTIVE_SUBMITTED
```

---

## Approved Reopen Workflow

```text
QUARTER_FINALIZED
→ REOPENED_BY_ADMIN
→ QUARTER_FINALIZED
```

Reopen is correction-only.

Reopen must NOT:

*   restart workflow,
*   reopen objective stage,
*   reopen manager review stage,
*   restart SLA,
*   trigger recalculation.

---

## Approved Annual Workflow

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

Validate:

*   no extra states,
*   no skipped approvals,
*   no invalid transitions,
*   no parallel approvals,
*   no workflow bypass.

---

# 4. Validation Review Prompt

Validate all approved PMS v2 validations.

Mandatory validations:

*   Required field validation
*   Objective weightage validation
*   Quarter window validation
*   Workflow transition validation
*   Assignment ownership validation
*   Hierarchy scope validation
*   Field visibility validation
*   Finalized record protection
*   Duplicate assignment prevention
*   Objective revision reason mandatory
*   Reopen reason mandatory
*   Override reason mandatory
*   Visibility validation
*   Communication template validation
*   Placeholder validation
*   Grade/Merit conditional validation
*   Hidden field masking
*   Template version locking
*   Immutable history validation

Validate:

*   draft-save bypass works correctly,
*   final submission enforces validation,
*   APIs enforce validation server-side,
*   hidden fields are not exposed,
*   finalized records reject edits.

---

# 5. Approval & Ownership Review Prompt

Validate approval and ownership rules.

Check:

*   Employee-created objectives require Manager approval.
*   Manager-created objectives auto-approve.
*   Manager review requires approved objectives.
*   Annual appraisal requires finalized/closed quarters.
*   Visibility requires annual finalization.
*   Communication requires visibility governance.
*   HR/Admin controls reopen.
*   HR/Admin/Management controls annual decisions.
*   Managers access only assigned/hierarchy-authorized employees.
*   Employees access only own records.
*   Directors remain scoped/read-only where configured.
*   No parallel approvals exist.
*   No multi-manager review exists.

Any missing approval gate is a business-critical gap.

---

# 6. Naming Consistency Review Prompt

Validate naming consistency across:

*   UI labels
*   APIs
*   DTOs
*   database entities
*   workflow enums
*   logs
*   audit events
*   dashboards
*   reports
*   documentation
*   QA test cases

---

## Approved Roles

*   Employee
*   Manager
*   HR/Admin
*   Management
*   Director
*   Custom Role

---

## Approved Entities

*   Annual Assignment
*   Quarter Assignment
*   Objective
*   Quarter Review
*   Annual Appraisal Decision
*   PMS Template
*   Template Version
*   Letter Template
*   Communication Dispatch
*   Visibility Configuration
*   Audit Log
*   Correction Layer
*   Workflow Action

---

## Approved Workflow Terms

*   OBJECTIVE_SUBMITTED
*   OBJECTIVE_APPROVED
*   MANAGER_REVIEW_SUBMITTED
*   QUARTER_FINALIZED
*   MANAGEMENT_DECISION_SUBMITTED
*   VISIBILITY_ENABLED
*   COMMUNICATION_SENT

---

Flag as inconsistency:

*   Goal instead of Objective
*   Self Review terminology
*   Visibility Governance terminology
*   Reviewer instead of Manager
*   User instead of Employee
*   Admin instead of HR/Admin
*   Evaluation instead of Annual Appraisal Decision where incorrect
*   Legacy v2 terms
*   Unsupported status names
*   camelCase statuses
*   lowercase statuses

---

Review implementation for invented assumptions.

Flag if implementation assumes:

*   multiple Managers per assignment,
*   employee self-review,
*   employee acceptance,
*   dual ratings,
*   skip-level review workflow,
*   automatic workflow progression from escalation,
*   automatic recalculation after freeze,
*   unrestricted HR editing,
*   reopen restarts workflow,
*   reopen restarts SLA,
*   archived-cycle dashboard logic,
*   hidden fields returned in APIs,
*   UI-only security,
*   unrestricted override behavior,
*   unsupported retry engine,
*   unsupported rollback behavior.

Any such behavior is an assumption mismatch.

---

# 8. Functional Completeness Review Prompt

Validate functional completeness module-wise.

---

## Template Management

Check:

*   PMS Template creation
*   Template Versioning
*   Quarter-aware sections
*   Annual sections
*   Field configuration
*   Visibility configuration
*   Editability configuration
*   Letter templates
*   Conditional placeholders
*   Version locking

---

## Cycle Management

Check:

*   Annual Parent Cycle
*   Q1–Q4 configuration
*   Quarter windows
*   Parent appraisal window
*   Relative offset support
*   Launch behavior
*   Status transitions

---

## Assignment Management

Check:

*   Annual Assignment
*   Quarter Assignment
*   Bulk assignment
*   Duplicate prevention
*   Exception queue
*   Template version locking
*   Reassignment
*   Delegation
*   Historical attribution

---

## Workflow Engine

Check:

*   Approved transition matrix only
*   Invalid transition rejection
*   Actor validation
*   Audit logging
*   Workflow dependency validation

---

## Objective Management

Check:

*   Create objective
*   Save draft
*   Submit objective
*   Approve objective
*   Return for revision
*   Manager-created auto-approval
*   Weightage validation
*   Read-only after approval
*   Attachment handling

---

## Manager Quarterly Review

Check:

*   Approved objectives loading
*   Ratings/comments
*   Attachments
*   Submission
*   Quarter finalization
*   Independent quarter data storage

---

## Annual Appraisal Decision

Check:

*   Annual summary
*   Grade/Merit capture
*   Outcome derivation
*   BOTH handling
*   MERIT_ONLY handling
*   GRADE_ONLY handling
*   NIL handling
*   Freeze
*   Reopen
*   Snapshot preservation

---

## Visibility Governance

Check:

*   Employee visibility
*   Manager visibility
*   Field masking
*   Confidentiality
*   Visibility audit

---

## Communication Dispatch

Check:

*   Outcome-based template selection
*   Preview
*   Dispatch
*   Resend
*   Immutable communication history
*   Dynamic placeholders
*   Conditional content rendering

---

## Audit & Compliance

Check:

*   Actor
*   Role
*   Timestamp
*   Previous value
*   New value
*   Mandatory reason
*   Immutable logs
*   Correction layers
*   Snapshot preservation

---

# 9. Security & Confidentiality Review Prompt

Validate PMS v2 confidentiality rules.

Check:

*   Grade/Merit hidden before visibility governance.
*   Hidden fields excluded from API responses.
*   Unauthorized writes rejected.
*   Permission enforced server-side.
*   Workflow actions validated server-side.
*   Assignment ownership enforced.
*   Hierarchy scope enforced.
*   Finalized records immutable.
*   Communication content protected before publish.
*   Dashboard/report visibility scoped correctly.

Flag as critical:

*   hidden field exposure,
*   UI-only permissions,
*   confidential data leakage,
*   unauthorized reopen,
*   unauthorized override,
*   direct DB updates bypassing audit/workflow.

---

# 10. Audit & History Preservation Review Prompt

Validate immutable history and audit behavior.

Check:

*   Workflow actions audited
*   Objective actions audited
*   Review actions audited
*   Annual decisions audited
*   Visibility actions audited
*   Communication actions audited
*   Reopen audited
*   Override audited
*   Historical snapshots preserved
*   Template versions locked
*   Communication content immutable
*   Previous values preserved
*   Correction layers created instead of overwrite

Flag if:

*   historical data overwritten,
*   audit incomplete,
*   correction overwrites original,
*   reopen loses prior snapshot.

---

# 11. Review Checklist

| Review Area      | BA Question                       | Pass/Fail |
| ---------------- | --------------------------------- | --------- |
| Scope            | Is feature approved in PMS v2?  |           |
| Workflow         | Does it follow approved workflow? |           |
| Status           | Are only approved statuses used?  |           |
| Approval         | Are approval gates enforced?      |           |
| Permission       | Are permissions server-side?      |           |
| Visibility       | Are hidden fields masked?         |           |
| Validation       | Are validations enforced?         |           |
| Confidentiality  | Are Grade/Merit protected?        |           |
| Audit            | Are all actions audited?          |           |
| Finalization     | Are finalized records immutable?  |           |
| Reopen           | Is reopen correction-only?        |           |
| History          | Are snapshots preserved?          |           |
| Template Locking | Are template versions locked?     |           |
| Communication    | Is communication immutable?       |           |
| Assumptions      | Any invented logic?               |           |
| Naming           | Approved terminology used?        |           |
| Out of Scope     | Any unsupported feature added?    |           |

---

# 12. Clarification Checklist

Raise clarification ONLY when approved documents do not define behavior.

Use this format:

| Clarification ID | Module      | Question | Why It Matters | Blocking? |
| ---------------- | ----------- | -------- | -------------- | --------- |
| BA-CLAR-001      | Module Name | Question | Impact         | Yes/No    |

Clarification triggers:

*   Requirement missing from Scope/FSD/Baseline
*   Conflicting implementation behavior
*   Missing validation rule
*   Missing permission rule
*   Ambiguous workflow behavior
*   Ambiguous API behavior
*   Ambiguous visibility behavior
*   Undefined reporting logic
*   Undefined escalation logic
*   Undefined hierarchy behavior

Do NOT resolve ambiguity using assumptions.

---

# 13. BA Final Sign-Off Prompt

Approve implementation ONLY if ALL are true:

*   matches approved PMS v2 scope,
*   follows approved workflow,
*   uses approved terminology,
*   preserves confidentiality,
*   preserves auditability,
*   preserves immutable history,
*   preserves correction layers,
*   preserves template version locking,
*   enforces permissions server-side,
*   enforces visibility rules,
*   enforces validations,
*   prevents unsupported assumptions,
*   excludes out-of-scope features,
*   preserves workflow-engine governance,
*   preserves dynamic access governance,
*   preserves communication immutability,
*   has QA traceability coverage.

If any answer is NO:

*   Do NOT approve.
*   Create BA Gap using Gap Analysis Format.
