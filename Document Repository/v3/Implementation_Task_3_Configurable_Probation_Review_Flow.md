# Implementation Task 3: Configurable Probation / Trainee Manager Review Flow

Source design: `PMS_Design_Change_Request_Flexible_Objectives_Probation_Review.md`

## Task Goal

Enhance probation / trainee reviews so HR/Admin can configure reviewer responsibility, field/section security, data-grid permissions, sharing/delegation, approval rules, audit, dashboard status, and reporting without launching a normal PMS cycle.

The existing default flow must remain:

```text
SCHEDULED -> REVIEW_OPEN -> MANAGER_1_SUBMITTED -> MANAGER_2_APPROVED -> FINALIZED
```

## References and Dependencies

### Source Design References

- Main design sections: 4.3, 8, 10.3, 11.2, 12.2, 13.2, 14.2, 14.4, 14.5, 14.6, 14.7, 15, 16, 18, 19.
- This task owns probation/trainee review configuration, permission enforcement, sharing/delegation, workflow transitions, audit, dashboard, and reporting.

### Existing Backend References

- Probation review dependencies:
  - `Server/src/models/pms-probation-review-assignment.model.ts`
  - `Server/src/services/probationReview.service.ts`
  - `Server/src/routes/probationReview.routes.ts`
  - `Client/src/lib/services/api/pmsProbationReviews.ts`
- Template dependencies:
  - `Server/src/models/pms-template-version.model.ts`
  - `Server/src/services/pms-template.service.ts`
  - `Server/src/routes/pms-template.routes.ts`
- Delegation, audit, and access dependencies:
  - `Server/src/models/pms-delegation.model.ts`
  - `Server/src/services/delegation.service.ts`
  - `Server/src/routes/delegation.routes.ts`
  - `Server/src/services/audit.service.ts`
  - `Server/src/services/access.service.ts`
  - `Server/src/models/audit-log.model.ts`
- Dashboard/reporting dependencies:
  - `Server/src/services/pmsDashboard.service.ts`
  - `Server/src/routes/pmsDashboard.routes.ts`

### Existing Frontend References

- Probation review pages:
  - `Client/src/routes/admin/pms/probation-reviews/+page.svelte`
  - `Client/src/routes/manager/probation-reviews/+page.svelte`
  - `Client/src/routes/manager/confirmation-reviews/+page.svelte`
- Template builder references for Manager Review Only templates:
  - `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte`
  - `Client/src/lib/components/pms/templates/builder/modals/GridSetupPanel.svelte`
  - `Client/src/lib/components/pms/templates/builder/inspectors/FieldInspector.svelte`
  - `Client/src/lib/components/pms/templates/builder/inspectors/SectionInspector.svelte`

### Cross-Task Dependencies

- This task can run in parallel with Task 1 because probation review does not require normal PMS cycle launch or Objective Master.
- Reuse common patterns from Task 1 and Task 2 for locked snapshots, server-side permission checks, audit masking, friendly status labels, dashboard status priority, and reporting source mapping.
- This task should not depend on Task 4, but dashboard/SLA implementation should follow the same rule: calculate status from locked assignment/configuration snapshots, not latest UI labels.

## Global Implementation Rules

- Keep probation review independent from normal PMS cycle launch.
- Keep Manager Review Only template version as the form structure source.
- Store reviewer responsibility and workflow behavior in Probation Review Configuration.
- Lock template version and configuration snapshot when assignment is created.
- Enforce all permissions and transitions on the server.
- Keep finalized probation reviews immutable in the standard flow.
- Keep UI friendly for HR/Admin, Manager 1, Manager 2, final approver, and delegated users.
- Use step-by-step screens, readable status labels, clear pending-action messages, and plain-language validation.
- Do not create very large components. Keep Svelte components around 1000-1500+ lines maximum, and split earlier when responsibility grows.
- Use child components for assignment form, review workspace, permission matrix, grid permission editor, sharing panel, audit timeline, and approval actions.
- Pass data through props/events and keep API calls in workspace or route-level components.
- Add tests for permission precedence, workflow transitions, delegation boundaries, audit masking, and backward compatibility.

## Phase 1: Probation Review Configuration Model

### 1.1 Create configuration model

- Add Probation Review Configuration to store:
  - reviewer responsibility mode
  - Manager 1 input requirement
  - Manager 2 input requirement
  - final approver role
  - whether Manager 1 can approve
  - whether Manager 2 can approve
  - whether same user can act as Manager 1 and Manager 2
  - separation-of-duties rule
  - return-to-Manager-1 rule
  - mandatory return reason
  - mandatory approval comment
  - auto-finalization rule
  - sharing/delegation permission rule

### 1.2 Supported reviewer modes

- Support:
  - Manager 1 fills, Manager 2 approves
  - Manager 1 fills and approves
  - Manager 2 fills and approves
  - Manager 1 and Manager 2 both fill assigned sections, then Manager 2 approves
  - Manager 1 and Manager 2 both fill assigned sections, then configured final approver approves

### 1.3 Lock configuration snapshot

- At assignment creation, preserve:
  - locked Manager Review Only Template Version
  - locked Probation Review Configuration snapshot
  - Manager 1
  - Manager 2
  - configured final approver where applicable
  - reviewer responsibility mode
  - field/section permission snapshot
  - data-grid permission snapshot
  - sharing/delegation policy snapshot
  - approval and return rule snapshot

### 1.4 Backward compatibility

- Existing probation review assignments must continue using current Manager 1 fill + Manager 2 approve behavior.
- If no custom configuration exists, use default behavior.

## Phase 2: Assignment Creation and Scheduling

### 2.1 Assignment fields

- Ensure assignment stores:
  - employee
  - probation end date
  - review open date
  - Manager 1 / Reporting Manager
  - Manager 2 / Approver
  - final approver where applicable
  - locked template version
  - locked configuration snapshot
  - review status

### 2.2 Review open date

- Default:

```text
Review Open Date = Probation End Date - 30 days
```

- Allow authorized override where existing behavior/configuration permits.
- Audit override reason.

### 2.3 User-friendly assignment UI

- Build HR/Admin assignment flow:
  - Select employee
  - Confirm probation end date
  - Review calculated open date
  - Select Manager 1 and Manager 2
  - Select template version
  - Select probation configuration
  - Preview reviewer responsibility
  - Confirm assignment
- Show simple explanations:
  - "Manager 1 will complete these sections"
  - "Manager 2 will approve after Manager 1 submits"
  - "This review will open 30 days before probation end date"

## Phase 3: Field-Level and Section-Level Security

### 3.1 Permission configuration

- Configure per reviewer role:
  - visible sections
  - editable sections
  - visible fields
  - editable fields
  - read-only fields
  - mandatory fields
  - hidden fields
  - fields visible only after submission or finalization

### 3.2 Permission precedence

- Implement most restrictive rule first:
  - finalized/locked record protection
  - confidential or hidden rule
  - assignment ownership / active delegation
  - workflow status permission
  - section permission
  - field permission
  - data-grid row/column/cell permission
  - mandatory rule

### 3.3 API masking

- Hidden or confidential fields must be masked or omitted server-side where required.
- Audit views must also apply role-based masking.

### 3.4 Permission UI

- Add a permission matrix that HR/Admin can understand:
  - rows are sections/fields
  - columns are Manager 1, Manager 2, Final Approver, Delegated User
  - controls are View, Edit, Mandatory, Hidden
- Show conflict warnings:
  - "Mandatory field is hidden for this reviewer"
  - "No reviewer can complete this required section"
  - "Both managers can edit the same field; choose a conflict rule"

## Phase 4: Data-Grid Row and Column Permissions

### 4.1 Grid permission rules

- Support:
  - columns Manager 1 can enter
  - columns Manager 2 can enter
  - fixed/default columns
  - mandatory columns
  - row add permission by manager role
  - row delete permission by manager role
  - minimum row count
  - maximum row count
  - row ownership when reviewer adds a row

### 4.2 Row audit metadata

- Row addition stores:
  - row id
  - added by
  - added at
  - reviewer role at time of addition
  - reason/note where configured
- Row deletion is soft-audited and stores:
  - row id
  - deleted by
  - deleted at
  - previous row values
  - reason where configured

### 4.3 Edit conflict modes

- Support:
  - `SINGLE_OWNER`
  - `SEPARATE_COLUMNS`
  - `LOCK_AFTER_SUBMIT`
  - `LAST_WRITE_WINS`
- Default to `SINGLE_OWNER`.
- If `LAST_WRITE_WINS` is enabled, audit previous value, new value, previous actor, new actor, timestamp, workflow status, acting role, and source channel.

### 4.4 Grid UI

- Make fixed paper-style forms keep add/delete disabled.
- Show who added a row and whether the current user can edit/delete it.
- Use clear disabled reasons:
  - "Only Manager 2 can edit this column"
  - "Rows cannot be deleted in this template"
  - "Locked after Manager 1 submission"

## Phase 5: Sharing and Delegation

### 5.1 Delegation model

- Add assignment-level sharing/delegation records with:
  - assignment id
  - original owner
  - acting user
  - acting role
  - access type
  - permitted sections and fields
  - valid from date
  - valid to date
  - shared by
  - shared at
  - revoked by
  - revoked at
  - status: `ACTIVE`, `EXPIRED`, `REVOKED`

### 5.2 Access types

- Support:
  - view-only
  - edit access
  - temporary access
  - acting Manager 1
  - acting Manager 2
  - reviewer
  - observer
  - revocation

### 5.3 Permission boundary

- Delegation does not transfer ownership.
- Original Manager 1 and Manager 2 remain unchanged.
- Delegated users cannot automatically:
  - get full Manager 1/Manager 2 permission
  - approve
  - view confidential fields
  - share/delegate to another user
  - revoke others
  - act after expiry/revocation
  - access unassigned sections/fields
- Delegated users may approve only when locked configuration explicitly allows approval by acting role.

### 5.4 Sharing UI

- Add Sharing / Delegation panel:
  - add shared user
  - choose access type
  - choose acting role
  - choose allowed sections/fields
  - set start/end date
  - revoke access
  - view active/expired/revoked status
- Use plain warnings:
  - "This user can view only"
  - "This user can edit selected fields"
  - "Approval is not allowed for this shared access"

## Phase 6: Submission, Approval, Return, and Finalization

### 6.1 Configurable rules

- Support:
  - Manager 1 submission required/optional
  - Manager 2 approval required/optional
  - Manager 1 approval allowed
  - Manager 2 fill before approval allowed
  - return-to-Manager-1 allowed/disabled
  - mandatory return reason
  - mandatory approval comments
  - auto-finalize after configured reviewer completion

### 6.2 Status transitions

- Default:

```text
DRAFT -> SCHEDULED -> REVIEW_OPEN -> MANAGER_1_SUBMITTED -> MANAGER_2_APPROVED -> FINALIZED
```

- Return:

```text
MANAGER_1_SUBMITTED -> RETURNED_TO_MANAGER_1 -> MANAGER_1_SUBMITTED
```

- Single-reviewer completion:
  - allow `REVIEW_OPEN -> FINALIZED` only when configuration permits it.
- Reject invalid transitions server-side.

### 6.3 Finalized protection

- Finalized reviews cannot be reopened, edited, returned, cancelled, or corrected through standard flow.
- If error exists after finalization, preserve finalized record and require new authorized assignment or separately approved future correction process.

### 6.4 Review workspace UI

- Show pending action at top:
  - "Manager 1 input pending"
  - "Waiting for Manager 2 approval"
  - "Returned to Manager 1"
  - "Ready to finalize"
- Only show actions the actor can perform.
- Use confirmation dialogs for submit, return, approve, finalize, and cancel.
- Show mandatory missing fields before submission.

## Phase 7: Audit and Audit Visibility

### 7.1 Audit capture

- Capture:
  - assignment creation
  - review opening
  - field value entry/update
  - section completion
  - Manager 1 submission
  - Manager 2 return/approval
  - final approver approval
  - finalization
  - row add/delete
  - sharing/delegation/revocation/expiry
  - cancellation before finalization

### 7.2 Field and section audit fields

- Store:
  - assignment id
  - section key and label
  - field key and label
  - previous value
  - new value
  - actor
  - actor role at time of change
  - acting-on-behalf-of user where delegated
  - timestamp
  - workflow status
  - source channel

### 7.3 Audit visibility rules

- HR/Admin sees full audit where permitted.
- Manager 1 sees own actions and permitted workflow history.
- Manager 2 sees own actions, Manager 1 submission summary, return/approval history, and permitted workflow history.
- Delegated user sees own delegated actions and permitted shared-access history.
- Employee sees no internal probation audit by default unless explicitly configured.
- Mask confidential or restricted values for unauthorized users.

### 7.4 Audit UI

- Add timeline view with filters:
  - workflow
  - field changes
  - sharing/delegation
  - approvals/returns
  - row changes
- Show masked values as "Restricted" instead of exposing data.

## Phase 8: Dashboard and Reporting

### 8.1 Dashboard statuses

- Calculate server-side:
  - Draft
  - Scheduled
  - Review Open
  - Pending Manager 1
  - Pending Manager 2
  - Returned
  - Pending Final Approver
  - Finalized
  - Cancelled
  - Overdue
  - Shared / Delegated
- Apply priority:

```text
Cancelled -> Finalized -> Overdue -> Returned -> Blocked -> Pending Approver -> Pending Reviewer -> Review Open -> Scheduled -> Draft
```

### 8.2 Reporting fields

- Expose:
  - assignment id
  - employee
  - probation end date
  - review open date
  - review status
  - Manager 1
  - Manager 2
  - final approver
  - reviewer responsibility mode
  - template name/version
  - section completion status
  - field values
  - grid row values
  - added/deleted rows
  - acting reviewer
  - shared access status
  - submitted/approved/returned/finalized timestamps
  - cancellation details
- Use locked snapshots for historical records.

### 8.3 Dashboard UI

- Show probation review cards/list with:
  - employee
  - due/open date
  - current status
  - pending owner
  - shared/delegated indicator
  - overdue indicator
- Keep action labels simple:
  - "Open review"
  - "Continue review"
  - "Approve"
  - "Return"
  - "View audit"

## Phase 9: QA and Acceptance

### 9.1 Backend acceptance checks

- Default two-step probation flow still works.
- Each reviewer mode follows allowed transitions only.
- Same-user Manager 1/Manager 2 is allowed only when configured.
- Field, section, row, column, and cell permissions are enforced server-side.
- Delegated user gets only explicitly granted access.
- Delegated approval is blocked unless explicitly allowed.
- Finalized review is immutable.
- Hidden/confidential fields are masked in API and audit.

### 9.2 Frontend acceptance checks

- HR/Admin can configure reviewer responsibility and permissions without reading backend enum names.
- Reviewer sees only sections/fields they can access.
- Data-grid controls are clear and do not allow confusing edits.
- Sharing/delegation panel clearly shows active, expired, and revoked access.
- Audit timeline is understandable for non-technical users.
- Components are split into focused child components.

### 9.3 Regression checks

- Existing probation assignments still load.
- Existing Manager 1 submit and Manager 2 approve flow still works.
- Existing cancellation before finalization still works.
- Normal PMS cycle launch is not required and is not affected.
