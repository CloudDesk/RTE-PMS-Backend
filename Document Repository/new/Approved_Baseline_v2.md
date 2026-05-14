# PMS v2 — Approved Baseline Document

**Project:** Performance Management System (PMS)
**Status:** ✅ Finalized — Approved for v2 Architecture Implementation
**Date:** May 2026
**Source:** PMS FSD v2 | Dynamic Access Engine Plan | Team Alignment Session

> This document is the single approved reference for the revised PMS architecture. It moves from the legacy employee-driven v1 model to the **Manager-driven quarterly tracking and confidential management decision model (v2)**. All implementation must conform to this baseline.

---

# 1. Approved Business Decisions

All items below represent the migrated architecture rules for PMS v2.

| # | Decision Area | Approved Rule |
|---|---|---|
| 1.1 | **Workflow Philosophy** | Manager-driven quarterly tracking; employee self-review and acceptance stages are removed. |
| 1.2 | **Cycle Structure** | Annual Parent Cycle containing four independent child quarters (Q1, Q2, Q3, Q4). |
| 1.3 | **Objective Setting** | Objectives are set per quarter. Manager-created objectives are auto-approved. |
| 1.4 | **Evaluation Model** | Manager performs evaluation at quarter-end; no employee self-rating or dual-rating model. |
| 1.5 | **Appraisal Decisions** | Confidential annual decision on isGradeApplied and isMeritApplied; frozen before publish. |
| 1.6 | **Access Engine** | Dynamic and configurable roles, permissions, and hierarchy scope without code changes. |
| 1.7 | **Visibility Control** | Grade, Merit, and Review comments remain hidden until explicitly enabled by HR/Admin/Mgt. |
| 1.8 | **Letter Generator** | Outcome-based dynamic template resolution with placeholders and conditional blocks. |
| 1.9 | **Reopen Logic** | Quarter Reopen allows correction of finalized quarter records. Annual Decision Reopen returns the annual appraisal decision back to APPRAISAL_WINDOW_OPEN with mandatory audit and snapshot preservation. |
| 1.10 | **Data Integrity** | Corrections must preserve original manager entries and use a separate audit correction layer. |
| 1.11 | **SLA Handling** | Relative offsets supported (e.g., Q4 completion + 30 days) for parent appraisal decision. |
| 1.12 | **Milestone Integrity**| Standard finalization requires all applicable quarters to be finalized or formally closed. |
| 1.13 | **Communication Integrity** | Sent communication content and template versions remain immutable and historically traceable. |

---

# 2. Approved Workflow Model

## 2.1 Approved Quarter States

| State | Phase | Responsible Actor |
|---|---|---|
| `NOT_STARTED` | Pre-window | System |
| `OBJECTIVE_SETTING_OPEN`| Setting Window | Employee / Manager |
| `OBJECTIVE_DRAFT` | Draft | Employee |
| `OBJECTIVE_SUBMITTED` | Submission | Employee → Manager |
| `OBJECTIVE_REVISION_REQUIRED`| Revision | Employee |
| `OBJECTIVE_APPROVED` | Approval | Manager |
| `MANAGER_REVIEW_OPEN` | Evaluation | Manager |
| `MANAGER_REVIEW_SUBMITTED` | Evaluation | Manager |
| `QUARTER_FINALIZED` | Finalization | System / HR/Admin |
| `REOPENED_BY_ADMIN` | Correction | HR/Admin |
| `CLOSED_BY_ADMIN` | Exception | HR/Admin |

## 2.2 Approved Annual Parent States

| State | Phase | Responsible Actor |
|---|---|---|
| `DRAFT` | Setup | HR/Admin |
| `SCHEDULED` | Launching | System |
| `ACTIVE` | Launched | System |
| `IN_PROGRESS` | Quarterly Work | Employee / Manager |
| `ALL_QUARTERS_FINALIZED` | Roll-up | System |
| `APPRAISAL_WINDOW_OPEN` | Decision | Management / Admin |
| `MANAGEMENT_DECISION_DRAFT`| Decision | Management |
| `MANAGEMENT_DECISION_SUBMITTED`| Decision | Management |
| `ANNUAL_FINALIZED` | Finalized | System (Frozen) |
| `VISIBILITY_ENABLED` | Publishing | HR/Admin |
| `COMMUNICATION_READY` | Preparation | HR/Admin |
| `COMMUNICATION_SENT` | Dispatch | HR/Admin |
| `CLOSED` | Completed | System |
| `ARCHIVED` | History | System |
| `CANCELLED` | Exception | HR/Admin |

## 2.3 Approved High-Level Flow

```
[Annual Parent Cycle]
   ├── Q1: Obj Setting → Approval → Review → Finalized
   ├── Q2: Obj Setting → Approval → Review → Finalized
   ├── Q3: Obj Setting → Approval → Review → Finalized
   └── Q4: Obj Setting → Approval → Review → Finalized
        ↓
   [All Quarters Finalized]
        ↓
   Annual Appraisal Decision (Grade/Merit)
        ↓
   Decision Freeze & Finalization
        ↓
   Visibility Governance (Confidential Publish)
        ↓
   Dynamic Letter Dispatch → History Snapshot
```

---

# 3. Approved Naming Conventions

## 3.1 Approved Role Names (Seeded & Dynamic)

| Seeded Role | Description |
|---|---|
| Employee | Assigned employee. |
| Manager | Assigned manager or hierarchy-authorized reviewer. |
| HR/Admin | PMS operator / override authority. |
| Management | Final appraisal decision-maker. |
| Director | Hierarchy monitoring / viewer. |

## 3.2 Approved Module Names

*   Objective Management
*   Manager Quarterly Review Management
*   Annual Appraisal Decision
*   Communication Dispatch
*   Dynamic Access Engine (RBAC/Hierarchy)
*   Cycle & Template Management
*   History & Audit Compliance

## 3.3 Approved Action Names

*   Submit / Approve / Return for Revision
*   Finalize / Reopen / Freeze
*   Enable Visibility / Disable Visibility
*   Preview / Dispatch / Resend
*   Override / Correction / Reassign

## 3.4 Approved Entity Names

*   Annual Assignment (Parent)
*   Quarter Assignment (Child)
*   Objective
*   Quarter Review
*   Appraisal Decision (isGradeApplied, isMeritApplied)
*   Communication Dispatch Audit
*   Correction Layer Record

---

# 4. Approved Validations (v2)

| Validation | Rule | FR Reference |
|---|---|---|
| Required Field | Enforced on Objective/Review submission and Final Decision. | FR-VAL-01 |
| Quarter Dependency | Annual decision blocked until all child quarters are finalized/closed. | FR-VAL-03 |
| Flag Validation | Must set isGradeApplied/isMeritApplied before finalization. | FR-VAL-04 |
| Manager Auth | Manager actions require assignment or hierarchy-authorized scope. | FR-DRP-04 |
| Conflict Resolution | Deny rules override allow rules for confidential fields. | FR-RULE-03 |
| Snapshot Integrity | Historical records must lock original template version/content. | FR-HIS-07 |
| Correction Audit | MODIFY_ALL/OVERRIDE must preserve original and require reason. | FR-AUD-05 |
| Visibility Masking | Hidden fields must be masked at API layer until published. | FR-AC-04 |
| Outcome Validation | appraisalOutcomeType must derive correctly from isGradeApplied and isMeritApplied. | FR-DEC-02 |

---

# 5. Approved Assumptions

*   **Manager Ownership**: Managers are responsible for quarterly evaluations; no self-rating stage exists.
*   **Confidentiality by Default**: All final appraisal data remains hidden until explicit visibility publishing.
*   **Quarter Independence**: Quarter processing remains operationally independent; however, annual appraisal eligibility depends on all applicable quarters being finalized or formally closed.
*   **Dynamic Access**: The system must resolve access at runtime using the evaluation formula (Role + Scope + State).
*   **Assignment Core**: The Employee-Cycle assignment remains the primary transactional unit.

---

# 6. Approved FR Reference Index (v2)

| Area | Approved FR Range |
|---|---|
| Objective Management | FR-OBJ-01 to FR-OBJ-07 |
| Quarter Manager Review | FR-MQR-01 to FR-MQR-06 |
| Annual Finalization | FR-AFR-01 to FR-AFR-08 |
| Communication Dispatch | FR-COM-01 to FR-COM-09 |
| Dynamic Access Engine | FR-DRP-01 to FR-DRP-08 |
| Access Control | FR-AC-01 to FR-AC-07 |
| History | FR-HIS-01 to FR-HIS-07 |
| Validation | FR-VAL-01 to FR-VAL-09 |
| Roles | FR-EMP-01, FR-MGR-01, FR-HR-01, FR-MGT-01, FR-DIR-01 |

---

# 7. Items Explicitly Out of Scope

*   **Employee Self-Review**: Obsolete, not supported.
*   **Employee Acceptance/Sign-off**: Obsolete, not supported.
*   **Dual Rating System**: Obsolete, replaced by Manager Evaluation model.
*   **Multi-Manager Parallel Approvals**: Not supported.
*   **Recalculation of Frozen Decisions**: Not allowed; requires formal reopen.
*   **Employee Disagreement Workflow**: Obsolete, not supported.

---

# 8. Ready-to-Proceed Checklist (v2)

- [x] Migration from Goal → Objective terminology confirmed
- [x] Manager-driven quarterly workflow approved
- [x] Annual Parent + 4 Child Quarters architecture confirmed
- [x] isGradeApplied / isMeritApplied decision model approved
- [x] Confidential Visibility Publish model approved
- [x] Dynamic Access Engine architecture approved
- [x] Outcome-based Letter Generator logic approved
- [x] Correction Governance (Preserve Original) approved
- [x] Permission Simulation / Test Screen approved
- [x] Assignment-specific manager enforcement approved
- [x] All legacy v1 states/modules removed from baseline

---

*Document compiled from: PMS FSD v2 | pms_v2.js | v2 Plan pms_v2_P2.md | May 2026*
