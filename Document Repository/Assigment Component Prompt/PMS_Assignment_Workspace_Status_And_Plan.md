# PMS Assignment Workspace Consolidation - Status and Plan

## 1. Purpose

This document explains where the PMS implementation stands now and what the next UI consolidation plan is.

The goal is to guide the team, especially junior developers using Codex, to implement the next phase without deviating from the approved PMS direction.

This document focuses on the Admin PMS area after cycle creation and assignment creation.

---

## 2. Current Approved Direction

The PMS system is moving toward a simpler Admin experience.

Instead of making HR/Admin users move between many sidebar pages, we will create one main **Assignment Workspace**.

The Assignment Workspace should act like a 360-degree control room for an employee's PMS assignment.

The user should be able to:

- Search assignments
- View current progress
- Open one assignment's full 360 view
- Review quarter progress
- View objectives and manager reviews
- Manage annual decision
- View visibility and communication status
- Handle delegation/reassignment
- View SLA/reminder breaches
- View audit/history
- Access bulk actions from the same workspace

Backend services should remain separate. Only the Admin UI navigation and workspace experience should be consolidated.

---

## 3. Important Business Rules

### 3.1 Assignment Model

The final assignment model is:

```text
Annual Cycle
  -> Annual Assignment per employee per annual cycle
      -> Quarter Assignment records for applicable quarters
          -> Objective records
          -> Quarter Review records
```

### 3.2 Template Selection

- The cycle keeps a default template version as fallback.
- During assignment, HR/Admin can use suggested template or override template per employee.
- Annual Assignment stores the final selected `templateVersionId`.
- Quarter Assignment also stores and returns `templateVersionId`.
- Predefined objectives are seeded using the selected locked template version.
- Template quarter applicability controls which objectives are seeded into which Quarter Assignments.

### 3.3 Cycle Creation and Launch

Cycle creation and launch should not be redesigned.

Current approved behavior:

```text
Admin creates cycle
-> Backend creates annual cycle and Q1-Q4 quarter cycles
-> Admin assigns employees before launch
-> Backend creates Annual Assignment and Quarter Assignments
-> Backend seeds predefined objectives
-> Admin launches cycle
-> launchCycle only changes cycle state
```

Do not move assignment creation into `createCycle()`.
Do not make `launchCycle()` create assignments by itself.

---

## 4. Completed Implementation Status

### 4.1 Template Builder Phase - Completed

The Template Builder now supports:

- Starter template catalog
- Starter templates for broad manufacturing/company categories
- Simple setup mode
- Advanced setup mode
- Default Employee Information section
- Default Quarterly Objectives section
- Quarter applicability for sections/objectives
- Predefined objective banks
- Starter-specific competency defaults
- Simple scoring setup
- Permission presets
- Advanced field permission path
- Communication tab aligned with backend-managed static communication
- Version activation checklist
- Backward compatibility with old templates

Starter templates currently planned/supported:

1. Production / Manufacturing Appraisal
2. Quality Appraisal
3. Tool Room / Maintenance Appraisal
4. Stores / Warehouse Appraisal
5. Office / Admin Appraisal
6. Management / HOD Appraisal
7. Custom Template

Important rule:

```text
Starter templates are presets only. HR/Admin can edit them.
```

### 4.2 Template Builder UX Fixes - Completed

Recent UX fixes include:

- Starter template selector moved into modal.
- Starter template buttons use title case: `Use This Template`.
- Form Design right-side configuration panel made sticky/usable for long forms.
- Advanced Permissions entry point added from Simple Permissions.

### 4.3 Assignment + Template Selection Phase - Completed by Code-Path Verification

Confirmed behavior:

- Cycle keeps default `templateVersionId` as fallback.
- Assignment preview returns suggested and selected templates.
- HR/Admin can override template before executing assignment.
- Bulk execute passes selected `templateVersionId`.
- Annual Assignment stores selected `templateVersionId`.
- Quarter Assignment stores and returns selected `templateVersionId`.
- Predefined objectives seed from selected assignment template.
- Quarter applicability is respected.
- Employee/Manager/Annual Decision runtime screens remain compatible.

Known non-blocking risk:

```text
Predefined objective duplicate prevention is service-level only.
No DB unique constraint yet for quarterAssignmentId + templateObjectiveKey + isDeleted.
```

---

## 5. Current Admin PMS UI Problem

The Admin PMS sidebar currently has too many separate areas:

```text
Assignments
Annual Decisions
Audit & History
SLA & Notifications
Scoped Delegations
Bulk Operations
```

This creates confusion for HR/Admin users.

Typical questions a user may face:

- Where do I check this employee's PMS status?
- Where do I see quarter progress?
- Where do I handle manager reassignment?
- Where do I check communication status?
- Where do I check SLA breach?
- Where do I see history?
- Where do I handle bulk assignment?

The current functionality is valid, but the UI is fragmented.

---

## 6. New Target UX

Create one main route:

```text
Assignment Workspace
```

The workspace should provide:

```text
Assignment Workspace
  -> Assignment List
  -> View 360
  -> Bulk Actions
  -> Exceptions
  -> Audit/Search if needed
```

The main concept is:

```text
One Assignment Workspace after assignment creation.
One 360 assignment view for each employee assignment.
```

---

## 7. Proposed Sidebar

### 7.1 Keep as Top-Level PMS Sidebar Items

Recommended simplified PMS sidebar:

```text
Dashboard
Templates
Cycles
Assignment Workspace
Reports / Settings
```

### 7.2 Hide or Remove as Separate Top-Level Items

These should no longer appear as separate top-level PMS sidebar items:

```text
Assignments
Annual Decisions
Audit & History
SLA & Notifications
Scoped Delegations
Bulk Operations
```

Their functionality should be reachable inside Assignment Workspace.

Important:

```text
Do not delete routes/services immediately if they are reused or needed for backward compatibility.
Hide from sidebar first.
```

---

## 8. Assignment Workspace Structure

### 8.1 Assignment List

The Assignment Workspace landing page should show a clean assignment list.

Suggested columns:

| Column | Purpose |
|---|---|
| Employee | Who the assignment belongs to |
| Department | Helps HR/Admin filter staff |
| Manager | Assigned reviewing manager |
| Cycle | PMS cycle/year |
| Template | Locked template version |
| Applicable Quarters | Q1-Q4 or partial quarters |
| Current Progress | Current workflow summary |
| Annual Decision Status | Pending/draft/submitted/frozen |
| Visibility Status | Published/hidden |
| Communication Status | Ready/sent/failed |
| SLA | On time/breached |
| Action | View 360 |

Avoid too many row buttons. Use one main action:

```text
View 360
```

### 8.2 Assignment 360 View

When HR/Admin clicks `View 360`, show the selected assignment's full detail.

Recommended route:

```text
/admin/pms/assignment-workspace/{annualAssignmentId}
```

or use an internal detail panel if routing is difficult.

The 360 view should include:

1. Header Summary
2. Current Progress
3. Objectives
4. Manager Reviews
5. Annual Decision
6. Visibility & Communication
7. Delegation / Reassignment
8. SLA & Reminders
9. Audit & History

---

## 9. Assignment 360 Details

### 9.1 Header Summary

Show:

- Employee name/code
- Department/designation
- Manager
- Cycle
- Template
- Assignment status
- Annual status
- Visibility status
- Communication status
- SLA breach badge if any

### 9.2 Current Progress Section

This should be the first section because HR/Admin needs fast status clarity.

Show quarter cards or table:

| Quarter | Objective Status | Review Status | Finalization | SLA | Current Pending Action |
|---|---|---|---|---|---|
| Q1 | Approved | Submitted | Finalized | On Time | None |
| Q2 | Approved | Pending | Open | Breached | Manager Review |
| Q3 | Not Started | Not Started | Open | Upcoming | Employee Objective |
| Q4 | Not Started | Not Started | Open | Upcoming | Not Open |

### 9.3 Objectives Section

Show objectives quarter-wise:

- Objective title
- Weightage
- Source: predefined / employee / manager
- Status
- Attachments
- Quarter

Do not expose too many editing actions here. Show admin actions only when allowed.

### 9.4 Manager Reviews Section

Show:

- Quarter review status
- Submitted by
- Submitted date
- Manager comments summary
- Finalization status

### 9.5 Annual Decision Section

Bring annual decision inside assignment detail.

Show:

- Decision status
- Grade applied
- Merit applied
- Outcome type: BOTH / MERIT_ONLY / GRADE_ONLY / NIL
- Freeze status
- Visibility status

Actions only if allowed:

- Save/update decision
- Submit decision
- Freeze
- Reopen
- Update visibility

### 9.6 Communication Section

Show:

- Communication status
- Outcome content used
- Last sent date
- Delivery status
- Failure reason if any

Actions only if allowed:

- Preview communication
- Send communication
- Resend communication

### 9.7 Delegation / Reassignment Section

Show:

- Current manager
- Active delegation
- Delegation period
- Reassignment history

Actions only if allowed:

- Reassign manager
- Create delegation
- Revoke delegation

### 9.8 SLA & Reminders Section

Show assignment-specific SLA/reminder information:

- Due item
- Due date
- Breach status
- Reminder count/status
- Escalation target
- Last reminder date

Actions only if supported:

- Send reminder
- View reminder history

Global SLA rule configuration can remain in Settings later, but assignment-specific SLA status should be visible here.

### 9.9 Audit & History Section

Read-only timeline:

- Assignment created
- Objective submitted
- Objective returned/approved
- Manager review submitted
- Quarter finalized
- Annual decision updated
- Visibility enabled
- Communication sent
- Reopen/correction events
- Delegation/reassignment events

---

## 10. Bulk Actions Inside Assignment Workspace

Bulk Operations should no longer be a top-level sidebar route.

Inside Assignment Workspace, provide a section:

```text
Bulk Actions
```

This should reuse the current BulkOperationsWorkspace where possible.

Bulk Actions should include:

- Bulk assignment launch
- Bulk reminders
- Bulk visibility updates
- Bulk communication dispatch
- Bulk close

Keep preview/dry-run/execute behavior.

Do not remove backend bulk operation services.

---

## 11. What Should Be Reused

Reuse existing components where possible:

| Existing Area | New Usage |
|---|---|
| Assignments page/list logic | Assignment List / maintenance tab |
| BulkOperationsWorkspace | Bulk Actions inside Assignment Workspace |
| AnnualDecisionWorkspace | Annual Decision section in 360 view |
| AuditHistoryWorkspace | Audit & History section in 360 view |
| SlaWorkspace | SLA section or Settings area |
| DelegationWorkspace | Delegation section or Access/Settings area |

If existing components are too page-level, create scoped/detail versions instead of copying huge logic.

Example:

```text
AnnualDecisionWorkspace -> can accept annualAssignmentId optional prop later
AuditHistoryWorkspace -> can accept annualAssignmentId optional prop later
```

---

## 12. What Should Not Be Done

Do not:

- Delete backend services.
- Delete APIs.
- Merge unrelated backend business logic.
- Change employee runtime screens.
- Change manager runtime screens.
- Change cycle creation logic.
- Change launchCycle service behavior.
- Show all actions at once in the first screen.
- Put dangerous actions directly in the assignment list row.
- Duplicate entire old modules manually inside new workspace.

---

## 13. Recommended Implementation Phases

### Phase 1 - Analysis and Route Plan

Create route/sidebar consolidation plan.

Output required:

- Current route map
- Proposed route map
- Components to reuse
- Components needing scoped mode
- API needs
- Risks

No code changes.

### Phase 2 - Assignment Workspace Shell

Create/upgrade Assignment Workspace route.

Add:

- Summary cards
- Assignment list
- Filters
- View 360 action

No old route removal yet.

### Phase 3 - Assignment 360 Overview

Add:

- Header summary
- Current progress section
- Quarter cards/table
- Basic assignment details

### Phase 4 - Objectives and Manager Review Sections

Add:

- Quarter-wise objective summary
- Manager review summary
- Status and source labels

### Phase 5 - Annual Decision Section

Embed or reuse annual decision logic scoped to selected assignment.

Do not remove old Annual Decisions route yet.

### Phase 6 - Communication and Visibility Section

Add:

- Visibility status
- Communication status
- Preview/send/resend actions if available

### Phase 7 - SLA and Delegation Sections

Add:

- Assignment-specific SLA breach/reminder info
- Delegation/reassignment info
- Reassignment/delegation actions if allowed

### Phase 8 - Audit & History Section

Add read-only assignment audit timeline.

### Phase 9 - Bulk Actions Section

Move/reuse BulkOperationsWorkspace inside Assignment Workspace.

### Phase 10 - Sidebar Cleanup

Hide old sidebar entries:

- Assignments
- Annual Decisions
- Audit & History
- SLA & Notifications
- Scoped Delegations
- Bulk Operations

Keep routes accessible if needed for backward compatibility.

### Phase 11 - Cleanup Old Code

Clean:

- Old commented bulk assignment code from Assignments page
- Commented refresh blocks
- Unused handlers
- Repeated launch assignment modal later if needed

---

## 14. Acceptance Criteria

The implementation is successful when:

- HR/Admin can open Assignment Workspace from sidebar.
- Assignment list shows all key assignment status information.
- HR/Admin can click View 360 for one assignment.
- 360 view shows current progress first.
- Quarter statuses are clear.
- Objectives and manager review summaries are visible.
- Annual decision is reachable inside assignment detail.
- Communication status/actions are reachable inside assignment detail.
- SLA/reminder breach information is visible inside assignment detail.
- Delegation/reassignment information is reachable inside assignment detail.
- Audit/history is reachable inside assignment detail.
- Bulk Actions are reachable inside Assignment Workspace.
- Old separate sidebar items are hidden after replacement is ready.
- Existing backend APIs continue working.
- Employee and manager runtime screens are not broken.
- Cycle creation and launch are not changed.

---

## 15. Final Team Instruction

The next phase is not a backend rewrite.

It is an Admin PMS UX consolidation.

The business goal is:

```text
After assignment is created, HR/Admin should not jump across many sidebar pages.
They should open Assignment Workspace and get a full 360 view of the assignment.
```
