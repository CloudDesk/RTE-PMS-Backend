# PMS Team Knowledge Quiz & Discussion Notes

## Document Information

| Attribute | Value |
| :--- | :--- |
| Project | Performance Management System (PMS) |
| Activity | Team Knowledge Validation & Discussion |
| Based On | **PMS Functional Specification Document v2** |
| Date | May 2026 |
| Participants | Suresh, Deepika, Vinith, Fazil |

---

# Objective

The objective of this discussion and quiz session was to validate the team's understanding of the **revised Objective-Based Quarterly PMS**. This version removes legacy annual review terminology and employee-driven finalization stages in favor of a manager-driven performance tracking and confidential management decision model.

---

# 1. Core Architecture Shifts

The team discussed the fundamental shift in PMS philosophy from an employee-driven acceptance model to a manager-driven tracking and confidential governance model.

| Feature | Legacy PMS (v1.0) | Revised PMS (v2) |
| :--- | :--- | :--- |
| **Core Concept** | Goal-Based PMS | **Objective-Based PMS** |
| **Workflow** | Single annual workflow | **Annual parent cycle with Q1–Q4 child cycles** |
| **Review Flow** | Employee review-driven | **Manager quarterly review flow** |
| **Self Review** | Included | **Removed completely** |
| **Acceptance** | Final employee acceptance required | **Removed completely** |
| **Rating Model** | Dual employee/manager ratings | **Manager quarterly evaluation model** |
| **Access Model** | Static role model | **Dynamic configurable role engine** |
| **Visibility** | Immediate finalization visibility | **Confidential Management/HR publish control** |

---

# 2. Standardized Terminology

The team validated the transition to new approved terminology across the UI, API, and documentation.

| Old Term | New Approved Term |
| :--- | :--- |
| Goal / Goal Setting | **Objective / Objective Setting** |
| Goal Approval / Revision | **Objective Approval / Revision** |
| Self Review | **Removed** |
| Employee Acceptance | **Removed** |
| Reviewer | **Manager** |
| Review Cycle | **Quarterly Objective Cycle** |
| Annual Review | **Annual Appraisal Decision** |
| HR Escalation | **Exception / Reopen Handling** |

---

# 3. Updated Workflow Understanding

The team demonstrated a clear understanding of the revised lifecycle, moving away from employee-driven stages.

### Revised PMS Lifecycle:
`Objective Setting` → `Objective Approval` → `Quarterly Manager Review` → `Quarter Finalization` → `Annual Appraisal Decision` → `Visibility Enablement` → `Communication Dispatch`

### Workflow State Transitions:
*   **Quarter States**: `NOT_STARTED`, `OBJECTIVE_SETTING_OPEN`, `OBJECTIVE_DRAFT`, `OBJECTIVE_SUBMITTED`, `OBJECTIVE_REVISION_REQUIRED`, `OBJECTIVE_APPROVED`, `MANAGER_REVIEW_OPEN`, `MANAGER_REVIEW_SUBMITTED`, `QUARTER_FINALIZED`, `REOPENED_BY_ADMIN`, `CLOSED_BY_ADMIN`.
*   **Annual States**: `DRAFT`, `SCHEDULED`, `ACTIVE`, `IN_PROGRESS`, `ALL_QUARTERS_FINALIZED`, `APPRAISAL_WINDOW_OPEN`, `MANAGEMENT_DECISION_DRAFT`, `MANAGEMENT_DECISION_SUBMITTED`, `ANNUAL_FINALIZED`, `VISIBILITY_ENABLED`, `COMMUNICATION_SENT`, `CLOSED`, `ARCHIVED`, `CANCELLED`.

---

# 4. Mandatory Discussion & Assessment Areas

The session focused on several high-priority architectural areas newly introduced in v2.

### 4.1 Quarterly Architecture
*   Annual parent cycle containing four child records (Q1–Q4).
*   Each quarter maintains independent objectives, ratings, and completion dates.
*   Annual decision stage remains locked until all applicable quarters are finalized or closed.
*   Manager-created objectives are auto-approved and do not require employee approval.

### 4.2 Annual Decision Engine
*   Independent tracking of `isGradeApplied` and `isMeritApplied`.
*   Derived outcome types: `BOTH`, `MERIT_ONLY`, `GRADE_ONLY`, or `NIL`.
*   Final decisions remain confidential until visibility is explicitly enabled by HR/Admin/Management after annual finalization.

### 4.3 Visibility Governance
*   Employee and manager visibility can be enabled separately for grade and merit.
*   Confidential fields must be explicitly published by HR/Admin/Management.
*   Hidden fields must be masked at the API layer, not just hidden in the UI.

### 4.4 Dynamic Letter Generator
*   Resolution of email/PDF templates using outcome-to-template mapping.
*   Support for placeholders (e.g., `meritAmount`, `finalGrade`) and conditional content blocks.
*   Mandatory preview before final dispatch to ensure accuracy.

### 4.5 Dynamic Role and Access Engine
*   Access evaluation formula: `Role + Assignment + Hierarchy Scope + Workflow State + Section/Field Visibility`.
*   Support for custom roles (e.g., Department HR, Business Unit Head) via configuration.
*   Permission simulation to test effective access before publishing config changes.

---

# 5. Governance and Data Preservation

The team discussed the "Enterprise Correction Model" for handling post-finalization changes.

*   **Correction Governance**: Administrative modifications (MODIFY_ALL / OVERRIDE) must never overwrite the original historical entry.
*   **Original Value Preservation**: The system preserves the original manager rating/comments.
*   **Correction Layer**: Modifications are stored as an "Amendment" layer capturing the actor, reason, and previous values.
*   **Audit Immutability**: Historical communication content and template versions must remain immutable even after future template modifications.

---

# 6. Team Assessment Summary

| Updated Assessment Area | Understanding Level |
| :--- | :--- |
| **Quarterly Objective Workflow** | Strong |
| **Objective Approval Rules** | Strong |
| **Quarterly Manager Review** | Strong |
| **Annual Appraisal Decision** | Good |
| **Grade/Merit Tracking** | Strong |
| **Visibility Governance** | Good |
| **Dynamic Role Engine** | Good |
| **Letter Dispatch Logic** | Strong |
| **History Snapshot Integrity** | Strong |
| **Correction Layer Governance** | Strong |

---

# 7. Key Technical Learnings

*   **Hierarchy-Authorized Access**: A "Manager" role alone does not grant access; it requires specific assignment ownership or hierarchy scope.
*   **Version Isolation**: Template versions and letter templates must be locked per assignment to prevent historical corruption.
*   **SLA Awareness**: Relative offsets (e.g., Q4 completion + 30 days) are used for parent appraisal windows.

---

# 8. Conclusion

The team successfully transitioned their understanding from the legacy employee-driven PMS to the revised **Manager-driven tracking and confidential governance model**.

The team is fully aligned with the **PMS v2 Functional Specification** and is prepared to move into the implementation phase with a focus on data integrity, confidential publishing rules, and the dynamic access engine.