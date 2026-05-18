# Module 1 :: Dynamic Role & Access Management

System supports fully dynamic roles and permissions. Roles are not hardcoded. HR/Admin can configure Employee, Manager, HR/Admin, Management, Director, and custom business roles. Access is controlled using role + assignment + hierarchy scope + workflow state + section/field visibility.

Manager access is not automatic. Manager must have assignment ownership, delegated access, reassigned access, or hierarchy authorization. System supports section-level permissions, field-level visibility, editable/read-only controls, deny-over-allow security, permission simulation, and API-level masking. Hidden fields must never be exposed through APIs or frontend responses.

---

# Module 2 :: PMS Template Management

HR/Admin creates PMS templates with versioning support. Templates define the PMS structure including objective sections, manager review sections, annual appraisal sections, scoring rules, workflow rules, visibility rules, communication templates, placeholders, and conditional rendering logic.

Templates support predefined objectives, dynamic objectives, or hybrid objective models. Template can contain fixed objectives while also allowing employee/manager-created objectives based on configuration. Objective structure, validations, weightage rules, editable roles, mandatory fields, scoring participation, and quarter-aware repeated sections are configurable.

Templates only store structure and configuration, not transactional employee data. Once a template version becomes active and assigned, it becomes locked and immutable. Any structural change requires a new version. At any time only one template version remains active for new assignments while old assignments continue using their original locked version permanently.

---

# Module 3 :: Annual Cycle & Quarter Management

HR/Admin creates Annual Parent Cycle such as PMS 2026. Each annual cycle contains four independent child quarters: Q1, Q2, Q3, and Q4. Every quarter maintains its own objective lifecycle, manager review lifecycle, SLA tracking, audit history, and workflow state independently.

Cycle configuration includes objective setting windows, objective approval windows, manager review windows, quarter finalization windows, appraisal windows, visibility windows, communication stages, SLA rules, reminder rules, escalation configuration, and relative offset support such as “Q4 completion + 30 days”.

Annual appraisal process cannot begin until all applicable quarter assignments are either QUARTER_FINALIZED or CLOSED_BY_ADMIN.

---

# Module 4 :: Assignment Management

HR/Admin assigns employees, managers, annual cycles, and template versions. System creates one Annual Assignment and linked Quarter Assignments for Q1–Q4. Annual Assignment acts as the parent transactional entity while Quarter Assignments track quarter-specific operations independently.

Assignments preserve manager ownership, workflow state, audit tracking, template version locking, and quarter lifecycle independently. Manager reassignment only affects future actions and never overwrites historical approvals or reviews. System supports bulk assignment, exception handling, missing manager queue, employee eligibility validation, delegation support, and permanent future reassignment handling while preserving historical attribution.

---

# Module 5 :: Objective Management

During objective setting window, employee or manager can create objectives depending on template configuration and permissions. Templates may already contain predefined objectives, while additional dynamic objectives can also be created if allowed.

Employee-created objectives follow workflow:
Draft → Submit → Manager Approval OR Return for Revision → Resubmit → Approve.

Manager-created objectives bypass employee approval and auto-transition directly into OBJECTIVE_APPROVED state.

Objectives support KPI definitions, targets, descriptions, success criteria, due dates, attachments, weightage, comments, and configurable scoring logic. Approved objectives become locked and read-only unless reopened through authorized correction workflow. Objective editing is allowed only during configured objective windows or revision-required stages.

---

# Module 6 :: Quarterly Manager Review Management

After objectives are approved and review window opens, managers perform quarter-end evaluation against approved objectives. PMS v2 follows manager-driven evaluation model only. Employee self-review, employee acceptance, and dual-rating workflows do not exist.

Managers provide ratings, achievements, development observations, comments, recommendations, attachments, and quarter review summaries. Submission transitions quarter into MANAGER_REVIEW_SUBMITTED state. HR/Admin or system automation finalizes the quarter into QUARTER_FINALIZED state according to workflow rules.

Each quarter review remains independent with separate audit history, SLA tracking, comments, scores, and review data.

---

# Module 7 :: Annual Appraisal Decision Management

Once all applicable quarters are finalized or formally closed, annual appraisal window opens for Management/HR/Admin. Management reviews quarterly summaries, annual rollups, manager reviews, ratings, and performance history before applying final appraisal decisions.

Annual decisions independently support:
isGradeApplied and isMeritApplied.

System derives appraisalOutcomeType automatically as:
BOTH, MERIT_ONLY, GRADE_ONLY, or NIL.

Grade and merit are not mutually exclusive. System supports grade-only, merit-only, both combined, or nil outcomes. Annual decisions must be frozen before publication. Frozen decisions become immutable and cannot recalculate automatically after template or scoring changes.

---

# Module 8 :: Visibility Governance

All final appraisal information remains confidential by default. Employee and manager visibility is separately controlled by HR/Admin/Management. Visibility configuration supports independent publishing of employee review visibility, employee grade visibility, employee merit visibility, manager grade visibility, and manager merit visibility.

Hidden data must be protected at API level and not only through frontend hiding. Unauthorized users must never infer confidential fields through partial masking, payload leaks, or hidden metadata. Visibility publication requires explicit authorized action after annual finalization.

---

# Module 9 :: Communication Dispatch & Letter Generator

After visibility enablement, HR/Admin prepares appraisal communication using dynamic template engine. Communication templates support placeholders, conditional blocks, outcome-based resolution, preview generation, template mapping, and immutable version locking.

System supports:
MERIT_ONLY letters, GRADE_ONLY letters, BOTH combined letters, NIL generic communication, or NO_MAIL policies.

Templates dynamically resolve values such as employee name, final grade, merit amount, and quarter summary. Preview occurs before dispatch. Sent communication, rendered content, and template version remain permanently immutable for historical audit purposes. Resend support preserves original communication history without overwriting prior records.

---

# Module 10 :: Workflow Engine

Entire PMS operates through centralized workflow engine. No module directly changes workflow state outside approved transition rules. Quarter workflow supports:

NOT_STARTED → OBJECTIVE_SETTING_OPEN → OBJECTIVE_DRAFT → OBJECTIVE_SUBMITTED → OBJECTIVE_APPROVED → MANAGER_REVIEW_OPEN → MANAGER_REVIEW_SUBMITTED → QUARTER_FINALIZED.

Alternative states include OBJECTIVE_REVISION_REQUIRED, REOPENED_BY_ADMIN, and CLOSED_BY_ADMIN.

Annual workflow supports:
DRAFT → SCHEDULED → ACTIVE → IN_PROGRESS → ALL_QUARTERS_FINALIZED → APPRAISAL_WINDOW_OPEN → MANAGEMENT_DECISION_DRAFT → MANAGEMENT_DECISION_SUBMITTED → ANNUAL_FINALIZED → VISIBILITY_ENABLED → COMMUNICATION_READY → COMMUNICATION_SENT → CLOSED → ARCHIVED.

Workflow engine validates actor permissions, assignment ownership, workflow dependency, hierarchy scope, milestone windows, and finalized record protection before allowing transitions.

---

# Module 11 :: Reopen, Override & Correction Governance

Reopen is correction-only and does not restart entire workflow lifecycle. HR/Admin can reopen finalized quarter or annual decisions with mandatory reason capture and audit preservation.

Reopen must not:
restart SLA, restart objective stage, restart manager review stage, recalculate frozen decisions, or overwrite historical records.

All corrections preserve original manager reviews, original appraisal decisions, original grades, original merits, original template versions, and original communication content. Corrections are stored using separate correction/amendment layers with complete traceability.

---

# Module 12 :: History & Audit Governance

Every important action in PMS is audit tracked. Audit includes objective creation, submission, approval, revision, quarter review submission, annual decisions, visibility changes, dispatch actions, reopen operations, overrides, reassignment, delegation, permission changes, and workflow transitions.

Audit records preserve actor, role, timestamp, previous value, updated value, assignment reference, reason, workflow state, and correction linkage. Historical finalized records remain immutable and tamper-resistant. Historical communication content and template versions remain permanently locked.

---

# Module 13 :: SLA, Notification & Escalation Management

System supports configurable SLA handling for objective submission, approvals, manager reviews, annual appraisal decisions, visibility publication, and communication dispatch. SLA rules support fixed dates and relative offset calculations.

Notifications support email, in-app notifications, reminders, overdue alerts, escalation notifications, and workflow-triggered communication. Escalations remain notification-driven only and do not automatically progress workflow stages.

---

# Module 14 :: Dashboard & Reporting

Employee dashboard shows assigned quarters, objective status, visible manager reviews, and workflow progress. Manager dashboard shows pending approvals, pending reviews, overdue reviews, and quarter completion status.

HR/Admin dashboard provides cycle monitoring, SLA tracking, appraisal readiness, visibility status, communication tracking, reopen tracking, and operational monitoring. Management and Director dashboards provide hierarchy-scoped annual summaries, performance visibility, appraisal analytics, and reporting visibility according to configured permissions and hierarchy rules.
