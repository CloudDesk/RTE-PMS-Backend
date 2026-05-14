# Module-wise Codex Implementation Prompts

## PMS v2 — Reusable Enterprise Prompts

Use these prompts in Codex for PMS v2 implementation. Each prompt must follow the **finalized FSD**, **Functional Scope Document**, **Approved Baseline**, **Alignment / Discussion Notes**, and **v2 Dynamic Access decisions**.

The PMS v2 baseline is the source of truth. It defines a manager-driven quarterly objective model, annual parent cycle with Q1–Q4 child quarters, confidential annual appraisal decisions, dynamic access control, visibility governance, communication dispatch, and immutable history/audit handling.

---

# Common Instruction for Every Codex Prompt

Before writing code, verify:

*   Do not invent business logic.
*   Do not add new workflow states.
*   Do not add employee self-review.
*   Do not add employee acceptance/sign-off.
*   Do not add dual ratings.
*   Do not add parallel approvals.
*   Do not bypass the Workflow Engine.
*   Do not expose hidden fields in APIs.
*   Do not allow finalized record edits through standard APIs.
*   Enforce permissions server-side.
*   Enforce assignment and hierarchy scope.
*   Preserve audit traceability.
*   Preserve immutable historical snapshots.
*   Preserve template version locking.
*   Use approved terminology only (e.g., Visibility Governance).
*   Ensure all modules support asynchronous processing and configurable batching where required for scalability.
*   Mark unclear items as `Pending Business Clarification`.
*   **Database Compatibility Constraint**: Implementation currently targets MongoDB but must remain compatible with future Azure Cosmos DB (MongoDB API) migration. Do not use unsupported MongoDB features without compatibility validation. Prefer repository abstraction and portable query/index patterns.

The PMS workflow must be implemented as a controlled parent-child state machine, where Annual Assignments and Quarter Assignments have approved states and only permitted transitions are allowed.

---

# 1. Template Management Module — Codex Prompt

## Goal

Implement the PMS v2 Template Management module.

## Scope

Build functionality for:

*   PMS template creation
*   Template versioning
*   Template activation/deactivation
*   Quarter-aware sections
*   Annual-level sections
*   Objective section configuration
*   Quarter review section configuration
*   Final appraisal decision section configuration
*   Field configuration
*   Field-level visibility configuration
*   Role-wise editability configuration
*   Letter template builder support
*   Conditional placeholder support
*   Template preview and test rendering

## Business Context

Templates define the structure of PMS forms, objective fields, manager review fields, annual decision fields, visibility-controlled sections, and appraisal communication templates.

Every Annual Assignment must lock the selected PMS Template Version so that future template changes do not alter historical or in-progress assignments.

Letter templates must also be version-locked when communication is generated or sent.

## Existing Dependencies

*   Cycle Management
*   Assignment Management
*   Dynamic Access Engine
*   Visibility Governance
*   Communication Dispatch
*   Audit & Compliance

## Functional Requirements

Implement:

*   Create PMS Template
*   Update PMS Template metadata
*   Create Template Version
*   Activate Template Version
*   Deactivate Template Version
*   Clone Template Version
*   Configure Sections
*   Configure Fields
*   Configure Quarter-aware sections
*   Configure annual-level sections
*   Configure field visibility rules
*   Configure field editability rules
*   Configure scoring participation
*   Configure template placeholders
*   Configure conditional content blocks
*   Preview PMS form template
*   Preview letter template

## Validation Rules

*   Template code must be unique.
*   Template version must be locked once assigned.
*   Structural changes must create a new Template Version.
*   Only active template versions can be selected for cycle assignment.
*   Quarter-level sections must support Q1, Q2, Q3, and Q4 repetition.
*   Required field rules must be configurable.
*   Field visibility must respect role, hierarchy, workflow state, quarter, and publish flag.
*   Letter placeholders must be validated before activation.
*   Conditional blocks must be syntactically valid before activation.
*   Hidden fields must not render in UI or API responses for unauthorized users.

## Permission Rules

*   HR/Admin can create, edit, clone, activate, deactivate, and configure templates.
*   Management can view final appraisal-related sections where permission allows.
*   Employees and Managers cannot modify templates.
*   Director access is read-only and scoped.
*   API must enforce template permissions server-side.

## API Expectations

Create APIs for:

*   Create Template
*   Update Template
*   Clone Template
*   Create Template Version
*   Activate Template Version
*   Deactivate Template Version
*   Get Template
*   Get Template Version
*   Configure Sections
*   Configure Fields
*   Configure Section Permissions
*   Configure Field Permissions
*   Preview Template
*   Create Letter Template
*   Preview Letter Template
*   Activate Letter Template

## Edge Cases

*   Activating a new template version while old assignments exist
*   Attempting to edit locked template versions
*   Duplicate template code
*   Invalid quarter-aware section configuration
*   Missing required placeholder in letter template
*   Invalid conditional block
*   Hidden field accidentally returned in API
*   Template used by active cycle

## Constraints

*   Do not alter historical assigned templates.
*   Do not apply new template structure to existing Annual Assignments or Quarter Assignments.
*   Do not hardcode template fields.
*   Do not hardcode visibility behavior.
*   Do not allow inactive templates in new cycle setup.
*   Do not allow historical communication templates to change after dispatch.

## Approval Restrictions

*   Template activation must be HR/Admin only.
*   Existing assigned Template Versions must remain unchanged.
*   Letter template activation must require valid placeholders and conditional blocks.

## Output Expectations

Generate:

*   Template entity/model
*   Template version entity/model
*   Section and field models
*   Letter template model
*   Service layer
*   API endpoints
*   DTOs/request schemas
*   Validation logic
*   Permission guards
*   Audit events
*   Unit tests
*   Edge case tests
*   Traceability comments mapping to PMS v2 Template requirements

---

# 2. Cycle Management Module — Codex Prompt

## Goal

Implement the PMS v2 Cycle Management module.

## Scope

Build functionality for:

*   Annual Parent Cycle creation
*   Q1–Q4 child quarter setup
*   Quarter date configuration
*   Objective setting window configuration
*   Objective approval window configuration
*   Manager review window configuration
*   Quarter finalization window configuration
*   Parent appraisal decision window configuration
*   Relative offset support
*   Cycle launch
*   Cycle status handling
*   SLA linkage
*   Communication rule linkage

## Business Context

PMS v2 is based on an Annual Parent Cycle containing four independent child quarters. Objective setting and manager review happen per quarter. Annual grade and merit decisions happen only at the annual parent level after all applicable quarters are finalized or formally closed.

## Existing Dependencies

*   Template Management
*   Assignment Management
*   Workflow Engine
*   SLA & Escalation Management
*   Communication Dispatch
*   Notification Management
*   Audit & Compliance

## Functional Requirements

Implement:

*   Create Annual Parent Cycle
*   Configure Q1, Q2, Q3, Q4
*   Configure objective setting windows
*   Configure objective approval windows
*   Configure manager review windows
*   Configure quarter closure rules
*   Configure parent appraisal window
*   Configure relative offset rules such as Q4 completion + N days
*   Link active PMS Template Version
*   Link communication template mapping
*   Launch cycle
*   Close cycle
*   Archive cycle
*   Cancel cycle where allowed

## Validation Rules

*   Cycle code must be unique.
*   Cycle start date must be before end date.
*   Annual Parent Cycle must contain Q1, Q2, Q3, and Q4.
*   Quarter dates must fall within annual cycle dates.
*   Quarter windows must follow approved sequence.
*   Objective and review windows must not conflict within the same quarter.
*   Only active template versions can be selected.
*   Parent appraisal window cannot open until applicable quarters are finalized or closed.
*   Relative offset rules must be valid and auditable.

## Permission Rules

*   HR/Admin can create, update, launch, close, archive, or cancel cycles.
*   Management can access appraisal window configuration where permitted.
*   Employees and Managers can only view assigned cycle and quarter information.
*   Director can view scoped hierarchy cycle status only.

## API Expectations

Create APIs for:

*   Create Annual Cycle
*   Update Annual Cycle
*   Configure Quarters
*   Configure Quarter Windows
*   Configure Parent Appraisal Window
*   Configure Communication Rules
*   Launch Cycle
*   Get Cycle
*   List Cycles
*   Close Cycle
*   Archive Cycle
*   Cancel Cycle

## Edge Cases

*   Missing Q1–Q4 configuration
*   Invalid quarter date range
*   Q4 review delayed
*   Parent appraisal window configured before quarter completion
*   Launching cycle without active template
*   Launching cycle without assignments
*   Updating windows after launch
*   Cancelling a cycle with active assignments

## Constraints

*   Do not create new annual or quarter statuses beyond approved values.
*   Do not allow annual decision before all applicable quarters are finalized or closed.
*   Do not hardcode SLA durations.
*   Do not hardcode parent appraisal offset values.
*   Default SLA durations require business confirmation unless already configured.

## Approval Restrictions

*   Cycle launch is HR/Admin only.
*   Parent appraisal window configuration is HR/Admin or Management only where permitted.
*   Cycle launch must create or activate assignments only through approved workflow logic.

## Output Expectations

Generate:

*   Annual cycle entity/model
*   Quarter cycle entity/model
*   Cycle service
*   Quarter window validator
*   Parent appraisal window validator
*   API endpoints
*   Audit log creation
*   Tests for quarter dependency
*   Tests for date/window validation
*   Traceability mapping to PMS v2 Cycle requirements

---

# 3. Assignment Management Module — Codex Prompt

## Goal

Implement PMS v2 Assignment Management.

## Scope

Build functionality for:

*   Annual Assignment creation
*   Quarter Assignment creation
*   Manual assignment
*   Bulk assignment
*   Manager assignment
*   Manager reassignment
*   Employee eligibility validation
*   Assignment exception queue
*   Template version locking
*   Assignment history tracking

## Business Context

Annual Assignment is the parent transactional unit for one employee in one Annual Parent Cycle. Each Annual Assignment must create or reference linked Quarter Assignments for applicable quarters.

Each Quarter Assignment tracks quarter-specific objective, review, and status data independently.

## Existing Dependencies

*   HRMS Master Data
*   Template Management
*   Cycle Management
*   Workflow Engine
*   Dynamic Access Engine
*   Audit & Compliance

## Functional Requirements

Implement:

*   Create Annual Assignment
*   Create linked Quarter Assignments
*   Bulk Annual Assignment
*   Validate employee eligibility
*   Validate manager mapping
*   Lock Template Version at assignment creation
*   Reassign Manager at annual or quarter level
*   Preserve historical manager attribution
*   Track assignment history
*   Move missing/incomplete records to exception queue

## Validation Rules

*   Prevent duplicate Annual Assignment for same employee and cycle.
*   Employee must be eligible.
*   Manager must be active and valid.
*   Missing manager must move employee to assignment exception queue.
*   Template Version must be locked at assignment creation.
*   Reassignment requires mandatory reason.
*   Prior completed quarter actions must remain attributed to original manager.
*   Quarter Assignment creation must follow applicable quarter rules.

## Permission Rules

*   HR/Admin can create, bulk assign, reassign, close, reopen, and monitor assignments.
*   Employee can view only own assignment.
*   Manager can view only assigned or hierarchy-authorized assignments.
*   Director can view scoped hierarchy assignment status.
*   Management can view assignment summaries for annual decision where permitted.

## API Expectations

Create APIs for:

*   Create Annual Assignment
*   Bulk Create Assignments
*   Create Quarter Assignments
*   Get Assignment
*   List Assignments
*   Reassign Manager
*   Get Assignment History
*   Get Assignment Exception Queue
*   Resolve Assignment Exception

## Edge Cases

*   Missing reporting manager
*   Inactive manager
*   Duplicate assignment
*   Employee joins mid-year
*   Employee exits before year end
*   Manager change between quarters
*   Multiple manager reassignments
*   Assignment with incomplete master data
*   Applicable quarters fewer than four

## Constraints

*   No multi-manager parallel approval.
*   No employee self-review assignment stage.
*   Reassignment affects future actions only.
*   Historical approvals and reviews must remain attributed to original actors.
*   Do not overwrite previous manager attribution.

## Approval Restrictions

*   Reassignment is HR/Admin-controlled.
*   Assignment exception resolution is HR/Admin-controlled.
*   Manager assignment must not grant access unless assignment or hierarchy scope is valid.

## Output Expectations

Generate:

*   Annual Assignment model
*   Quarter Assignment model
*   Assignment service
*   Bulk processing logic
*   Exception queue logic
*   Reassignment logic
*   Audit records
*   Partial failure reporting
*   Unit/integration tests
*   Traceability to PMS v2 Assignment requirements

---

# 4. Workflow Engine Module — Codex Prompt

## Goal

Implement the PMS v2 Workflow Engine.

## Scope

Build centralized workflow state transition enforcement for:

*   Annual Assignments
*   Quarter Assignments
*   Objective lifecycle
*   Manager review lifecycle
*   Annual appraisal decision lifecycle
*   Visibility and communication lifecycle
*   Reopen and correction lifecycle

## Business Context

The system must enforce strict approved state machines. Invalid transitions must be rejected by the API and service layer. Workflow rules must not be duplicated inside individual modules.

## Existing Dependencies

*   Assignment Management
*   Dynamic Access Engine
*   Notification Management
*   Audit & Compliance
*   SLA & Escalation Management

## Functional Requirements

Implement approved Quarter transitions only:

```text
NOT_STARTED → OBJECTIVE_SETTING_OPEN
OBJECTIVE_SETTING_OPEN → OBJECTIVE_DRAFT
OBJECTIVE_SETTING_OPEN → OBJECTIVE_APPROVED
OBJECTIVE_DRAFT → OBJECTIVE_SUBMITTED
OBJECTIVE_SUBMITTED → OBJECTIVE_APPROVED
OBJECTIVE_SUBMITTED → OBJECTIVE_REVISION_REQUIRED
OBJECTIVE_REVISION_REQUIRED → OBJECTIVE_SUBMITTED
OBJECTIVE_APPROVED → MANAGER_REVIEW_OPEN
MANAGER_REVIEW_OPEN → MANAGER_REVIEW_SUBMITTED
MANAGER_REVIEW_SUBMITTED → QUARTER_FINALIZED
QUARTER_FINALIZED → REOPENED_BY_ADMIN
REOPENED_BY_ADMIN → QUARTER_FINALIZED
Any active quarter state → CLOSED_BY_ADMIN
```

Implement approved Annual transitions only:

```text
DRAFT → SCHEDULED
SCHEDULED → ACTIVE
ACTIVE → IN_PROGRESS
IN_PROGRESS → ALL_QUARTERS_FINALIZED
ALL_QUARTERS_FINALIZED → APPRAISAL_WINDOW_OPEN
APPRAISAL_WINDOW_OPEN → MANAGEMENT_DECISION_DRAFT
MANAGEMENT_DECISION_DRAFT → MANAGEMENT_DECISION_SUBMITTED
MANAGEMENT_DECISION_SUBMITTED → ANNUAL_FINALIZED
ANNUAL_FINALIZED → VISIBILITY_ENABLED
VISIBILITY_ENABLED → COMMUNICATION_READY
COMMUNICATION_READY → COMMUNICATION_SENT
COMMUNICATION_SENT → CLOSED
CLOSED → ARCHIVED
ANNUAL_FINALIZED → APPRAISAL_WINDOW_OPEN
```

## Validation Rules

*   Reject non-permitted transitions.
*   Validate actor role for transition.
*   Validate assignment ownership.
*   Validate hierarchy scope.
*   Validate quarter window where applicable.
*   Validate annual dependency before appraisal window.
*   Create audit entry for every transition.
*   Prevent transition if finalized record protection applies.

## Permission Rules

*   Employee transitions: objective draft/save/submit/resubmit where allowed.
*   Manager transitions: approve objective, return objective, submit quarter review.
*   HR/Admin transitions: configure, finalize quarter, reopen quarter, close quarter, enable visibility, dispatch communication where allowed.
*   Management transitions: annual decision draft/submit/freeze where allowed.
*   System transitions: scheduled stage opening, roll-up where approved.

## API Expectations

Create APIs/services for:

*   Execute Workflow Action
*   Validate Transition
*   Get Allowed Actions
*   Get Annual Workflow History
*   Get Quarter Workflow History
*   Get Current Workflow State

## Edge Cases

*   Same transition submitted twice
*   Invalid transition request
*   Transition outside configured window
*   Quarter already finalized
*   Annual already finalized
*   Annual decision attempted before all quarters finalized/closed
*   Reopen attempted without reason
*   Communication attempted before visibility governance

## Constraints

*   Do not duplicate workflow logic in modules.
*   Do not hardcode transition checks outside Workflow Engine.
*   Do not add new states.
*   Do not add employee self-review or employee acceptance states.
*   Reopen must be correction-only.

## Approval Restrictions

*   Reopen is HR/Admin or authorized Management/Admin only as configured.
*   Close is HR/Admin only.
*   Freeze is Management/Admin/HR only as configured.
*   No concurrent approvals.
*   No parallel multi-manager workflow.

## Output Expectations

Generate:

*   Workflow constants/enums
*   Transition matrix
*   Workflow service
*   Guard validators
*   Allowed action resolver
*   Audit integration
*   Unit tests for approved transitions
*   Unit tests for rejected transitions
*   Traceability to PMS v2 Workflow requirements

---

# 5. Objective Management Module — Codex Prompt

## Goal

Implement PMS v2 Objective Management.

## Scope

Build quarterly objective creation, update, submission, manager approval, manager-created objective auto-approval, and revision flow.

## Business Context

Objectives are created per quarter. Employees may create and submit objectives during the active objective window. Managers may approve or return employee-created objectives. Manager-created objectives are auto-approved and do not require employee approval.

## Existing Dependencies

*   Quarter Assignment
*   Workflow Engine
*   Dynamic Access Engine
*   Template Management
*   Notification Management
*   Audit & Compliance

## Functional Requirements

Implement:

*   Create Objective
*   Update Objective Draft
*   Submit Objective
*   Approve Objective
*   Return Objective for Revision
*   Resubmit Revised Objective
*   Manager-created Objective Auto-Approval
*   Objective attachment handling
*   Objective comments
*   Objective weightage validation
*   Objective history

## Validation Rules

*   Objectives editable only during OBJECTIVE_SETTING_OPEN or OBJECTIVE_REVISION_REQUIRED.
*   Employee-created objectives must be submitted to assigned Manager.
*   Manager-created objectives must immediately transition to OBJECTIVE_APPROVED.
*   Manager return requires mandatory comment/reason.
*   Approved objectives become read-only.
*   Weightage must validate according to template rules.
*   Required objective fields must be completed before submission.
*   Attachments must preserve metadata, uploaded by, uploaded on, version, and visibility.

## Permission Rules

*   Employee can create/edit own objectives in allowed states.
*   Employee cannot edit manager-created objectives.
*   Manager can create objectives for assigned employees.
*   Manager can approve or return employee-created objectives for assigned/hierarchy-authorized employees.
*   HR/Admin can override only through configured exception process.
*   Director has read-only scoped access where configured.

## API Expectations

Create APIs for:

*   Create Objective
*   Save Objective Draft
*   Submit Objective
*   Approve Objective
*   Return Objective
*   Reopen Objective where approved
*   Get Objectives
*   Get Objective History
*   Upload Objective Attachment

## Edge Cases

*   Employee edits after submission
*   Employee edits manager-created objective
*   Manager returns without comment
*   Duplicate submission
*   Objective approval outside approval window
*   Manager-created objective clarification requested
*   Invalid objective weightage
*   Missing attachment metadata

## Constraints

*   Do not use Goal terminology.
*   Do not allow self-review after objective approval.
*   Do not allow direct transition from objective stage to annual finalization.
*   Do not overwrite previous objective audit history.
*   Do not create additional approval workflow for manager-created objectives.

## Approval Restrictions

*   Employee-created objectives require Manager approval.
*   Manager-created objectives are auto-approved.
*   Return for Revision must include mandatory manager comment.

## Output Expectations

Generate:

*   Objective model
*   Objective service
*   Objective validators
*   API endpoints
*   Workflow integration
*   Permission guards
*   Notification triggers
*   Attachment handling
*   Audit events
*   Unit tests
*   Edge case tests
*   Traceability to FR-OBJ requirements

---

# 6. Manager Quarterly Review Module — Codex Prompt

## Goal

Implement PMS v2 Manager Quarterly Review Management.

## Scope

Build manager review entry, comments, ratings, recommendations, attachments, submission, quarter score storage, and quarter finalization support.

## Business Context

Managers perform quarter-end evaluation directly against approved objectives. There is no employee self-rating or dual-rating model in PMS v2.

Manager review data must be stored independently for each quarter.

## Existing Dependencies

*   Objective Management
*   Quarter Assignment
*   Workflow Engine
*   Template Management
*   Dynamic Access Engine
*   Audit & Compliance
*   Notification Management

## Functional Requirements

Implement:

*   Get Quarter Review Form
*   Load approved objectives
*   Enter manager ratings
*   Enter manager comments
*   Enter quarter remarks
*   Enter recommendation fields
*   Upload manager review attachments
*   Save review draft where allowed
*   Submit Quarter Review
*   Store quarter score/rating/comments
*   Support HR/Admin quarter finalization after submission

## Validation Rules

*   Manager review allowed only in MANAGER_REVIEW_OPEN.
*   Review requires approved objectives unless exception closure applies.
*   Manager must belong to assignment or hierarchy-authorized scope.
*   Required manager review fields must be completed before submission.
*   Ratings/scores must match configured template rules.
*   Review attachments must preserve metadata and visibility.
*   Submission must transition to MANAGER_REVIEW_SUBMITTED.

## Permission Rules

*   Manager can review assigned/hierarchy-authorized employees only.
*   Employee cannot edit manager review fields.
*   HR/Admin can finalize/reopen where authorized.
*   Management can view quarter summaries during annual decision.
*   Director can view scoped hierarchy status/documents where configured.

## API Expectations

Create APIs for:

*   Get Quarter Review
*   Save Quarter Review Draft
*   Submit Quarter Review
*   Upload Review Attachment
*   Finalize Quarter Review
*   Reopen Quarter Review
*   Get Quarter Review History

## Edge Cases

*   Manager changed between quarters
*   Prior manager action attribution
*   Manager tries unrelated assignment
*   Missing approved objectives
*   Review submitted twice
*   Invalid score/rating
*   Q4 review delayed
*   Finalized quarter edit attempt

## Constraints

*   Do not implement employee self-review.
*   Do not store employee rating.
*   Do not overwrite manager-submitted review data after finalization.
*   Do not allow multiple manager parallel reviews.
*   Do not bypass assignment ownership validation.

## Approval Restrictions

*   Manager submission moves quarter to MANAGER_REVIEW_SUBMITTED.
*   Quarter finalization happens only after manager submission.
*   Reopen requires HR/Admin authorization and reason.

## Output Expectations

Generate:

*   Quarter Review model
*   Manager review service
*   Review validators
*   Attachment handling
*   Workflow integration
*   Scope enforcement
*   Audit entries
*   Tests for manager permission boundaries
*   Tests for submission/finalization
*   Traceability to FR-MQR requirements

---

# 7. Annual Appraisal Decision Module — Codex Prompt

## Goal

Implement PMS v2 Annual Appraisal Decision Management.

## Scope

Build annual summary, grade/merit decision capture, outcome derivation, decision draft, decision submission, freeze, annual finalization, and reopen handling.

## Business Context

Annual appraisal decision happens at the Annual Assignment level after all applicable Quarter Assignments are QUARTER_FINALIZED or CLOSED_BY_ADMIN.

Final grade and merit decisions are confidential and controlled by Management, HR, and Admin roles.

## Existing Dependencies

*   Annual Assignment
*   Quarter Assignment
*   Workflow Engine
*   Dynamic Access Engine
*   Visibility Governance
*   Communication Dispatch
*   Audit & Compliance
*   History Management

## Functional Requirements

Implement:

*   Get Annual Summary
*   Validate decision eligibility
*   Save appraisal decision draft
*   Capture isGradeApplied
*   Capture isMeritApplied
*   Derive appraisalOutcomeType
*   Capture grade details
*   Capture merit details
*   Capture NIL reason
*   Submit decision
*   Freeze decision
*   Reopen annual decision
*   Capture pre-reopen snapshot
*   Preserve correction history

## Validation Rules

*   Annual decision cannot start until all applicable quarters are finalized or closed.
*   isGradeApplied and isMeritApplied must be explicitly set.
*   appraisalOutcomeType must derive as BOTH, MERIT_ONLY, GRADE_ONLY, or NIL.
*   Grade fields required only when isGradeApplied = true.
*   Merit fields required only when isMeritApplied = true.
*   NIL reason or policy must be captured when both flags are false.
*   Frozen decisions must reject standard edits.
*   Reopen requires mandatory reason and snapshot preservation.

## Permission Rules

*   Management can create and submit annual appraisal decisions where authorized.
*   HR/Admin can assist and finalize where configured.
*   Employee cannot view grade/merit before visibility governance.
*   Manager cannot view grade/merit before manager visibility governance.
*   Director cannot modify annual decision.

## API Expectations

Create APIs for:

*   Get Annual Summary
*   Save Decision Draft
*   Submit Decision
*   Freeze Decision
*   Reopen Decision
*   Get Decision Audit
*   Get Decision Snapshot
*   Get Derived Outcome

## Edge Cases

*   Q4 review delayed
*   One applicable quarter closed by Admin
*   Employee joined mid-year
*   Employee exited before year-end
*   Both grade and merit applied
*   Only merit applied
*   Only grade applied
*   NIL outcome
*   Frozen decision modification attempt
*   Reopen attempted without reason

## Constraints

*   Do not force grade and merit to be mutually exclusive.
*   Do not manually override appraisalOutcomeType except approved correction permission.
*   Do not recalculate frozen decisions after template/scoring changes.
*   Do not expose confidential fields before visibility governance.

## Approval Restrictions

*   Annual decision must be Management/HR/Admin controlled.
*   Annual decision must be frozen before visibility publication.
*   Reopen must return annual decision to APPRAISAL_WINDOW_OPEN with audit preservation.

## Output Expectations

Generate:

*   Annual Appraisal Decision model
*   Decision service
*   Eligibility validator
*   Outcome derivation utility
*   Freeze/reopen logic
*   Snapshot logic
*   API endpoints
*   Permission guards
*   Audit events
*   Unit tests
*   Edge case tests
*   Traceability to FR-AFR and FR-DEC requirements

---

# 8. Visibility Governance Module — Codex Prompt

## Goal

Implement PMS v2 Visibility Governance.

## Scope

Build controlled visibility publishing for employee and manager access to review, grade, merit, and appraisal information.

## Business Context

Final appraisal information is confidential by default. Grade, merit, and review visibility must be explicitly enabled by HR/Admin or Management according to configured rules.

Hidden fields must be masked at the API layer, not only in UI.

## Existing Dependencies

*   Annual Appraisal Decision
*   Dynamic Access Engine
*   Communication Dispatch
*   History Management
*   Audit & Compliance

## Functional Requirements

Implement:

*   Enable employee review visibility
*   Enable employee grade visibility
*   Enable employee merit visibility
*   Enable manager grade visibility
*   Enable manager merit visibility
*   Disable visibility where permitted
*   Apply visibility rules to API responses
*   Audit visibility changes
*   Support field-level visibility configuration

## Validation Rules

*   Visibility publication requires annual finalization.
*   Communication dispatch must not occur before required visibility governance.
*   Grade visibility can be enabled independently from merit visibility.
*   Employee visibility and manager visibility are separate.
*   Hidden fields must not be returned in unauthorized API responses.
*   Unauthorized writes to hidden fields must be rejected.

## Permission Rules

*   HR/Admin can enable visibility.
*   Management can enable visibility where configured.
*   Employees can view only enabled fields.
*   Managers can view only enabled fields for authorized employees.
*   Director visibility is hierarchy-scoped and field-controlled.

## API Expectations

Create APIs for:

*   Enable Visibility
*   Disable Visibility
*   Get Visibility Settings
*   Evaluate Visibility
*   Filter Visible Fields
*   Get Visibility Audit

## Edge Cases

*   Employee grade visible but merit hidden
*   Manager grade hidden but employee grade visible
*   Visibility disabled after publish
*   API directly requests hidden fields
*   Communication attempted before visibility governance
*   Historical visibility differs from current visibility

## Constraints

*   Do not rely on frontend-only hiding.
*   Do not return hidden fields as null if that leaks existence where masking rules prohibit it.
*   Do not expose grade/merit before explicit visibility governance.
*   Do not allow visibility without finalized annual decision.

## Approval Restrictions

*   Visibility governance is HR/Admin or Management controlled.
*   Visibility changes must be audited.
*   Visibility must be evaluated on every relevant API response.

## Output Expectations

Generate:

*   Visibility configuration model
*   Visibility service
*   API field filtering utility
*   Permission guards
*   Visibility audit events
*   Tests for field masking
*   Tests for employee/manager visibility separation
*   Traceability to FR-VIS and FR-AC requirements

---

# 9. Communication Dispatch Module — Codex Prompt

## Goal

Implement PMS v2 Communication Dispatch and Dynamic Letter Generator.

## Scope

Build outcome-based communication template resolution, preview, dispatch, resend, generated document storage, and communication audit.

## Business Context

After annual appraisal finalization and visibility governance, HR/Admin can select employees and send communication based on appraisalOutcomeType.

Communication templates must be dynamic, configurable, placeholder-based, and version-locked after dispatch.

## Existing Dependencies

*   Annual Appraisal Decision
*   Visibility Governance
*   Template Management
*   Letter Template Management
*   Notification Management
*   Audit & Compliance
*   History Management

## Functional Requirements

Implement:

*   Resolve communication template by outcome
*   Support MERIT_ONLY template
*   Support GRADE_ONLY template
*   Support BOTH combined or separate templates
*   Support NIL no-mail or generic communication policy
*   Render placeholders
*   Render conditional blocks
*   Preview communication
*   Dispatch communication
*   Store generated document reference
*   Resend communication
*   Store dispatch audit
*   Preserve content snapshot hash

## Validation Rules

*   Communication requires annual finalization.
*   Communication requires visibility governance where policy requires it.
*   Template mapping must exist for applicable outcome.
*   Preview must be completed where required before dispatch.
*   Placeholder resolution must be complete before dispatch.
*   Letter template version must be locked after generation/sending.
*   Failed dispatch must be recorded.

## Permission Rules

*   HR/Admin can preview, dispatch, skip, override template where permitted, and resend.
*   Management can view decision context where permitted.
*   Employees can receive communication only after dispatch.
*   Managers cannot dispatch appraisal communication.
*   Director has scoped read-only communication status visibility where configured.

## API Expectations

Create APIs for:

*   Resolve Dispatch List
*   Preview Communication
*   Send Communication
*   Resend Communication
*   Get Dispatch History
*   Skip Communication with Reason
*   Get Generated Document
*   Get Communication Audit

## Edge Cases

*   Missing template mapping
*   NIL outcome with NO_MAIL policy
*   NIL outcome with GENERIC_MAIL policy
*   BOTH outcome with combined template
*   BOTH outcome with separate templates
*   Placeholder missing value
*   Template changed after dispatch
*   Communication sent with wrong template
*   Duplicate dispatch attempt
*   Email delivery failure

## Constraints

*   Do not hardcode a single mail template.
*   Do not send communication before required visibility stage.
*   Do not modify historical sent communication content.
*   Do not overwrite old communication on resend.
*   Do not expose confidential content to unauthorized roles.

## Approval Restrictions

*   Dispatch is HR/Admin controlled.
*   Manual template override must require permission and reason where configured.
*   Resend must preserve old communication history.

## Output Expectations

Generate:

*   Communication template resolver
*   Placeholder rendering service
*   Conditional block renderer
*   Preview service
*   Dispatch service
*   Resend service
*   Communication audit model
*   Generated document reference model
*   API endpoints
*   Tests for outcome-template mapping
*   Tests for immutability after dispatch
*   Traceability to FR-COM and FR-LTR requirements

---

# 10. Dynamic Access Engine Module — Codex Prompt

## Goal

Implement PMS v2 Dynamic Access Engine.

## Scope

Build centralized runtime access resolution using role permissions, assignment ownership, hierarchy scope, workflow state, section permissions, field visibility, and visibility rules.

## Business Context

PMS v2 requires configurable roles, permissions, hierarchy scopes, template section access, field-level visibility, workflow actions, and override rules without code changes.

A Manager role alone does not grant access to all employees. Manager access requires assignment ownership, delegation, reassignment, or configured hierarchy authorization.

## Existing Dependencies

*   Authentication System
*   Assignment Management
*   Template Management
*   Workflow Engine
*   Visibility Governance
*   Audit & Compliance

## Functional Requirements

Implement:

*   Create custom roles
*   Configure role permissions
*   Configure hierarchy scopes
*   Configure action permissions
*   Configure section-level permissions
*   Configure field-level permissions
*   Evaluate effective access
*   Simulate user access
*   Enforce deny-over-allow rules for confidential fields
*   Filter API responses by visibility
*   Validate update payload permissions

## Validation Rules

*   Role code must be unique.
*   Permission configuration must be valid before publish.
*   Deny rules override allow rules for confidential fields.
*   Manager actions require assignment-level authorization.
*   Hidden fields must not appear in responses.
*   Read-only fields cannot be updated.
*   Permission simulation must return allowed/denied with reason.

## Permission Rules

*   HR/Admin can configure dynamic roles and permissions.
*   Employees cannot configure access.
*   Managers cannot configure access.
*   Director access remains scoped and read-only unless explicitly configured.
*   System must enforce access at API and service layers.

## API Expectations

Create APIs for:

*   Create Role
*   Update Role
*   Map Permissions
*   Configure Hierarchy Scope
*   Configure Section Permissions
*   Configure Field Permissions
*   Simulate Access
*   Evaluate Access
*   Get Effective Permissions

## Edge Cases

*   Conflicting allow and deny rules
*   Manager tries unrelated employee assignment
*   Employee submits manager-only field
*   Hidden field requested directly by API
*   Custom role missing hierarchy scope
*   Invalid permission configuration
*   Permission change while assignment is active

## Constraints

*   Do not hardcode roles.
*   Do not scatter permission logic across modules.
*   Do not rely on UI-only permissions.
*   Do not return unauthorized fields.
*   Do not allow Manager role alone to grant global access.

## Approval Restrictions

*   Role and permission publishing is HR/Admin controlled.
*   Permission simulation must be available before publishing role changes.
*   Override permissions must preserve original values through correction layer.

## Output Expectations

Generate:

*   Role model
*   Permission model
*   Hierarchy scope model
*   Access evaluation service
*   Field filtering service
*   Payload permission validator
*   Simulation API
*   Permission guard middleware
*   Tests for access boundaries
*   Tests for deny-over-allow behavior
*   Traceability to FR-DRP and FR-AC requirements

---

# 11. History & Audit Compliance Module — Codex Prompt

## Goal

Implement PMS v2 History and Audit Compliance.

## Scope

Build immutable audit logging, historical appraisal snapshots, correction layer preservation, communication history, and template version traceability.

## Business Context

History is mandatory. The system must preserve previous appraisal outcomes, quarter reviews, final grades, merits, communication status, and audit references.

Administrative corrections must never overwrite original manager entries or finalized decisions. Corrections must be stored as separate correction layer records.

## Existing Dependencies

*   All PMS transactional modules
*   Workflow Engine
*   Annual Appraisal Decision
*   Communication Dispatch
*   Dynamic Access Engine
*   Authentication

## Functional Requirements

Audit:

*   Objective creation/update/submission
*   Objective approval/return
*   Quarter review submission
*   Quarter finalization
*   Annual decision draft/submit/freeze
*   Visibility governance
*   Communication generation/dispatch/resend
*   Reopen actions
*   Override actions
*   Reassignment actions
*   Permission changes
*   Bulk operations

Create history for:

*   Finalized annual appraisal
*   Quarter summaries
*   Final grade/merit decisions
*   Visibility state
*   Communication dispatch state
*   Template version references
*   Correction layers

## Validation Rules

Each Audit Log must capture:

*   actor
*   role
*   action
*   entity
*   previous value
*   new value
*   timestamp
*   reason where required
*   assignment reference
*   correlation ID where available

Historical snapshots must capture:

*   original PMS template version
*   original letter template version
*   frozen appraisal values
*   sent communication content/hash
*   correction references

## Permission Rules

*   HR/Admin can access full audit history.
*   Management can access decision audit where permitted.
*   Managers may access scoped history where manager visibility is enabled.
*   Employees may access only visible historical fields.
*   Director may access hierarchy-scoped history where allowed.
*   Audit logs cannot be modified through standard APIs.

## API Expectations

Create APIs for:

*   Get Employee History
*   Get Manager Team History
*   Get HR/Admin History
*   Get History Detail
*   Download Appraisal History
*   Get Assignment Audit History
*   Get Decision Audit
*   Get Communication Audit
*   Get Correction History

## Edge Cases

*   Reopen after annual finalization
*   Override after freeze
*   Communication resent after correction
*   Template changed after historical dispatch
*   Visibility disabled after publish
*   Manager reassignment after previous quarter
*   Bulk operation partial success
*   Audit transaction rollback scenario

## Constraints

*   Audit logs must not be editable.
*   Historical snapshots must not be overwritten.
*   Sent communication content must remain immutable.
*   Prior manager attribution must remain unchanged.
*   Correction layer must preserve previous and new values.

## Approval Restrictions

*   Reopen, Override, Reassign, and correction actions require mandatory reason.
*   Missing reason must reject action before audit/action completion.
*   Normal users cannot delete audit/history records.

## Output Expectations

Generate:

*   Audit service
*   History service
*   Immutable audit model
*   Historical snapshot model
*   Correction layer model
*   Audit helper utilities
*   API endpoints
*   Integration hooks
*   Tests for mandatory audit events
*   Tests for immutability
*   Traceability to FR-HIS and FR-AUD requirements

---

# 12. SLA & Notification Management Module — Codex Prompt

## Goal

Implement PMS v2 SLA, Reminder, Escalation, and Notification Management.

## Scope

Build configurable SLA rules, reminders, overdue detection, escalation notifications, and event notifications for PMS workflow actions.

## Business Context

PMS v2 supports SLA tracking for objective submission, objective approval, objective revision, manager review, annual appraisal decision, visibility publishing, and communication dispatch.

Escalation is notification-driven unless explicitly configured otherwise. SLA durations and escalation hierarchy rules may require business confirmation.

## Existing Dependencies

*   Cycle Management
*   Workflow Engine
*   Assignment Management
*   Notification Service
*   Audit & Compliance
*   Scheduler

## Functional Requirements

Implement:

*   Configure SLA Rule
*   Configure Reminder Rule
*   Calculate due dates
*   Support relative offsets
*   Detect overdue items
*   Trigger event notifications
*   Trigger pre-due reminders
*   Trigger due-date reminders
*   Trigger overdue reminders
*   Raise escalation notifications
*   Log notification failures

Notification triggers include:

*   Cycle launch
*   Objective window open
*   Objective submission pending
*   Objective approval pending
*   Objective returned
*   Quarter review pending
*   Quarter review overdue
*   Annual appraisal window open
*   Final decision frozen
*   Visibility enabled
*   Communication sent
*   Reopen initiated

## Validation Rules

*   SLA rule must map to approved workflow stage.
*   Due date must derive from configured rule.
*   Relative offset must be valid.
*   Escalation must preserve original ownership traceability.
*   Notification target must match actor responsibility.
*   Email failure must be logged.
*   Hidden confidential fields must not be included in notifications.

## Permission Rules

*   HR/Admin can configure SLA/reminder rules.
*   System executes reminders and escalation checks.
*   Employees receive employee-action notifications.
*   Managers receive assigned-team notifications.
*   Management receives annual decision notifications.
*   HR/Admin can view failures and escalation status.

## API Expectations

Create APIs for:

*   Configure SLA Rule
*   Configure Reminder Schedule
*   Get SLA Status
*   Get Escalations
*   Mark Escalation Reviewed
*   Create Notification
*   List My Notifications
*   Mark Notification Read
*   List Notification Failures
*   Get Notification Log

## Edge Cases

*   Missing SLA rule for workflow stage
*   Q4 review delayed
*   Parent appraisal offset not configured
*   Email delivery failure
*   Duplicate event trigger
*   Missing user email
*   Bulk reminder partial failures
*   Reopen after SLA breach

## Constraints

*   Do not hardcode SLA durations.
*   Do not hardcode escalation hierarchy rules.
*   Do not auto-transfer ownership unless explicitly approved.
*   Do not auto-progress workflow due to escalation.
*   Do not expose hidden grade/merit fields in notification content.
*   Notification retry is not implemented unless explicitly approved.

## Approval Restrictions

*   SLA configuration is HR/Admin controlled.
*   Escalation notifications do not grant permissions unless configured through Dynamic Access Engine.
*   SLA extension requires Management/HR/Admin permission and mandatory reason.

## Output Expectations

Generate:

*   SLA rule model
*   Reminder model
*   Notification model
*   Scheduler logic
*   Escalation service
*   Notification service
*   Email adapter
*   Failure logging
*   Audit integration
*   Tests for notification-only escalation
*   Tests for SLA offset calculation
*   Traceability to FR-SLA, FR-ESC, and FR-NOT requirements

---

# 13. Delegation & Reassignment Module — Codex Prompt

## Goal

Implement PMS v2 Delegation and Reassignment Management.

## Scope

Build temporary delegation, permanent reassignment, historical ownership preservation, and attribution tracking.

## Business Context

PMS supports temporary delegation for manager objective approval and manager quarter review actions within a defined validity period. Permanent reassignment affects future ownership while preserving historical action attribution.

## Existing Dependencies

*   Assignment Management
*   Workflow Engine
*   Dynamic Access Engine
*   Audit & Compliance
*   Notification Management

## Functional Requirements

Implement:

*   Create Delegation
*   Validate Delegation Period
*   Execute Delegated Action
*   Track Original Owner
*   Track Acting Delegate
*   Reassign Manager
*   Preserve Historical Attribution
*   View Delegation History
*   View Reassignment History

## Validation Rules

*   Delegation must have valid start and end dates.
*   Delegate must be active and authorized.
*   Delegated action must fall within validity period.
*   Reassignment requires mandatory reason.
*   Reassignment affects future actions only.
*   Historical actions remain attributed to original actors.

## Permission Rules

*   HR/Admin can configure delegation and reassignment.
*   Delegates can act only within configured validity and scope.
*   Employees cannot delegate or reassign managers.
*   Managers cannot reassign themselves unless explicitly configured.
*   Dynamic Access Engine must validate delegated access.

## API Expectations

Create APIs for:

*   Create Delegation
*   Update Delegation
*   Cancel Delegation
*   Get Delegation History
*   Reassign Manager
*   Get Reassignment History
*   Validate Delegated Action

## Edge Cases

*   Delegate period expired
*   Delegate inactive
*   Manager changes between quarters
*   Multiple reassignments
*   Delegated action after reassignment
*   Prior completed quarter with old manager
*   Reassignment during review window

## Constraints

*   Do not overwrite historical manager attribution.
*   Do not grant global manager access through delegation.
*   Do not allow delegation outside configured scope.
*   Do not use delegation to bypass workflow state rules.

## Approval Restrictions

*   Delegation and reassignment are HR/Admin controlled unless business explicitly configures otherwise.
*   Delegated actions must preserve original owner and acting delegate attribution.
*   Reassignment must preserve prior completed quarter actor history.

## Output Expectations

Generate:

*   Delegation model
*   Reassignment model
*   Delegation service
*   Reassignment service
*   Validity checks
*   Permission integration
*   Audit entries
*   Tests for delegation/reassignment edge cases
*   Traceability to FR-DEL and FR-RAS requirements

---

# 14. Dashboard & Reporting Module — Codex Prompt

## Goal

Implement PMS v2 Dashboard and Reporting.

## Scope

Build dashboards and reports for HR/Admin, Employee, Manager, Management, and Director using approved PMS v2 metrics and visibility rules.

## Business Context

Dashboards provide operational visibility into cycle progress, quarter completion, objective approval queues, manager review queues, annual appraisal readiness, grade/merit distribution, communication status, SLA breaches, and history availability.

Dashboard data must obey role, hierarchy, assignment, workflow, and visibility rules.

## Existing Dependencies

*   Assignment Management
*   Cycle Management
*   Workflow Engine
*   Dynamic Access Engine
*   Visibility Governance
*   SLA & Notification Management
*   Audit & Compliance
*   History Management

## Functional Requirements

Implement:

*   HR/Admin Dashboard
*   Employee Dashboard
*   Manager Dashboard
*   Management Dashboard
*   Director View
*   Cycle progress metrics
*   Quarter completion metrics
*   Pending objective approval metrics
*   Pending manager review metrics
*   Annual appraisal pending metrics
*   Grade applied count
*   Merit applied count
*   Both applied count
*   NIL count
*   Communication pending/sent/failed metrics
*   SLA breach metrics
*   Reopen tracking
*   Export support

## Validation Rules

*   Dashboard data must obey permission scope.
*   Employee sees own data only.
*   Manager sees assigned or hierarchy-authorized employee data only.
*   HR/Admin sees permitted organization-wide data.
*   Management sees annual decision and distribution data where permitted.
*   Director sees hierarchy-scoped data only.
*   Hidden grade/merit fields must not appear before visibility governance.

## Permission Rules

*   HR/Admin: cycle monitoring, assignment tracking, appraisal readiness, communication, SLA, reopen tracking.
*   Employee: active quarter, objective status, published decisions, visible history.
*   Manager: direct report queue, objective approvals, manager review queue, overdue items, visible outcomes.
*   Management: annual appraisal pending, decision draft, grade/merit distribution, NIL outcomes, communication readiness.
*   Director: scoped status, documents, template status, quarter completion, history where allowed.

## API Expectations

Create APIs for:

*   Get HR/Admin Dashboard
*   Get Employee Dashboard
*   Get Manager Dashboard
*   Get Management Dashboard
*   Get Director View
*   Get Dashboard Metrics
*   Export Report
*   Get Cycle Progress
*   Get Communication Metrics
*   Get SLA Metrics

## Edge Cases

*   No active cycle
*   No assigned employees
*   Employee with only remaining applicable quarters
*   Manager reassignment between quarters
*   Assignment closed by Admin
*   Visibility disabled for grade/merit
*   Communication failed
*   Archived cycle requested

## Constraints

*   Do not expose unauthorized records.
*   Do not expose hidden grade/merit fields.
*   Do not calculate finalized decision values using changed scoring/template rules.
*   Do not allow dashboard APIs to change workflow state.
*   Do not hardcode dashboard permission filters.

## Approval Restrictions

*   Dashboard actions must route to proper module APIs.
*   Dashboard must not directly mutate workflow state.
*   Exports must obey same visibility rules as UI/API.

## Output Expectations

Generate:

*   Dashboard query service
*   Role-scoped metric service
*   Dashboard DTOs
*   Export service
*   Permission-scoped filtering
*   API endpoints
*   Tests for role-specific visibility
*   Tests for confidential field exclusion
*   Traceability to FR-DSH requirements

---


---

# 15. Bulk Operations Module — Codex Prompt

## Goal

Implement PMS v2 Bulk Operations.

## Scope

Build HR/Admin bulk processing for assignments, reminders, communication dispatch, visibility updates, and administrative closures where approved.

## Business Context

PMS must support organization-wide cycles and large employee populations. Bulk operations must preserve validation, permission enforcement, auditability, and per-record failure reporting.

## Existing Dependencies

*   Assignment Management
*   Cycle Management
*   Visibility Governance
*   Communication Dispatch
*   Notification Management
*   Audit & Compliance
*   Dynamic Access Engine

## Functional Requirements

Implement:

*   Bulk Assignment Preview
*   Bulk Assignment Execution
*   Bulk Reminder Preview
*   Bulk Reminder Execution
*   Bulk Visibility Preview
*   Bulk Visibility Execution
*   Bulk Communication Preview
*   Bulk Communication Dispatch
*   Bulk Close where approved
*   Per-record validation
*   Per-record result reporting
*   Bulk operation audit summary

## Validation Rules

*   HR/Admin only.
*   Filters must be validated before execution.
*   Duplicate assignments must be skipped or rejected per record.
*   Missing managers must move to exception queue.
*   Bulk communication requires valid template mapping.
*   Bulk communication requires visibility/preconditions according to policy.
*   Partial failures must be reported.
*   Bulk close requires mandatory reason.

## Permission Rules

*   Only HR/Admin can execute bulk operations.
*   Management may view bulk decision readiness where permitted.
*   Employees and Managers cannot execute bulk operations.
*   Bulk operation output must obey confidential field rules.

## API Expectations

Create APIs for:

*   Preview Bulk Assignment
*   Execute Bulk Assignment
*   Preview Bulk Reminder
*   Execute Bulk Reminder
*   Preview Bulk Visibility Update
*   Execute Bulk Visibility Update
*   Preview Bulk Communication
*   Execute Bulk Communication
*   Preview Bulk Close
*   Execute Bulk Close
*   Get Bulk Operation Result

## Edge Cases

*   Some employees missing managers
*   Some employees already assigned
*   Some employees not eligible
*   Some communications missing template mapping
*   Some notifications fail
*   Some assignments already finalized
*   Some assignments not visibility-ready
*   Partial processing failure

## Constraints

*   Do not perform bulk close without reason.
*   Do not hide per-record failures.
*   Do not bypass assignment validation.
*   Do not bypass visibility rules.
*   Do not bypass communication preview requirements.
*   Do not bypass audit.
*   Do not expose confidential data in bulk output.

## Approval Restrictions

*   Bulk operations are HR/Admin controlled.
*   Bulk state changes must use Workflow Engine where applicable.
*   Bulk communication must preserve per-employee template version and audit history.

## Output Expectations

Generate:

*   Bulk operation service
*   Preview engine
*   Per-record validation model
*   Bulk result summary model
*   Per-record error model
*   Audit integration
*   API endpoints
*   Tests for partial failure handling
*   Tests for confidentiality in output
*   Traceability to PMS v2 bulk/scalability requirements

---

# Final Codex Guardrail

For every module implementation, Codex must output:

*   source code
*   validation logic
*   API layer
*   permission enforcement
*   workflow integration
*   audit integration
*   unit tests
*   edge case tests
*   traceability comments
*   no invented business logic

Any unclear requirement must be returned as:

`Pending Business Clarification: <question>`

Do not implement functionality outside the PMS v2 approved architecture.
