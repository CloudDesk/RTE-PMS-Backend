# PMS Assignment Workspace Consolidation - Codex Prompts

## How To Use This File

Use these prompts one by one in Codex.

Do not ask Codex to implement everything at once.

After each prompt, review the response and confirm before moving to the next prompt.

Important instruction for every prompt:

```text
Do not change backend business logic unless explicitly requested.
Do not change employee/manager runtime screens.
Do not change cycle creation or launch behavior.
```

---

# Prompt 1 - Review Current Admin PMS Navigation and Workspace Plan

```text
Review the current Admin PMS routes and propose a single Assignment Workspace UX.

Goal:
Reduce sidebar complexity. Move assignment-related screens into one Assignment Workspace with 360 assignment detail.

Do not code yet.

Important:
- Do not change backend services.
- Do not delete APIs.
- Do not change employee/manager runtime screens.
- Do not change cycle creation/launch behavior.
- This task is analysis and plan only.

Current routes to review:
- /admin/pms/assignments
- /admin/pms/decisions
- /admin/pms/audit
- /admin/pms/sla
- /admin/pms/delegation
- /admin/pms/bulk

Target sidebar:
- Dashboard
- Templates
- Cycles
- Assignment Workspace
- Reports / Settings, if already available

Assignment Workspace should include:
- Assignment List
- Assignment 360 Detail
- Bulk Actions
- Exceptions
- Assignment History / Audit

Assignment 360 detail should show:
- Header summary
- Current Progress
- Objectives
- Manager Reviews
- Annual Decision
- Visibility & Communication
- SLA & Reminders
- Delegation / Reassignment
- Audit & History

Return:
1. Current route/sidebar map
2. Proposed route/sidebar map
3. Existing components that can be reused
4. Components that need scoped/detail mode
5. APIs needed for 360 view
6. UI risk areas
7. Step-by-step implementation plan
8. What should not be changed
```

---

# Prompt 2 - Create Assignment Workspace Shell

```text
Implement the Assignment Workspace shell.

Scope:
- Create or upgrade the main Admin PMS Assignment Workspace route.
- Do not hide old routes yet.
- Do not move all modules yet.
- Do not change backend services.

Required UI:
1. Page title: Assignment Workspace
2. Short subtitle: View assignment progress, decisions, communication, reminders, and history in one place.
3. Summary cards:
   - Total Assignments
   - Pending Objectives
   - Pending Manager Reviews
   - Annual Decision Pending
   - Exceptions
   - SLA Breaches
4. Main tabs or segmented navigation:
   - All Assignments
   - Bulk Actions
   - Exceptions
   - History Search, optional
5. All Assignments tab should show assignment list.

Assignment list columns:
- Employee
- Department
- Manager
- Cycle
- Template
- Applicable Quarters
- Current Progress
- Annual Decision Status
- Visibility Status
- Communication Status
- SLA
- Action: View 360

Rules:
- Keep the list clean.
- Avoid too many row buttons.
- Do not delete the old Assignments page yet.
- Reuse existing assignment list APIs where possible.

Return:
1. Files changed
2. New route/component names
3. Data loaded for summary cards
4. Assignment list data source
5. Any placeholders added
6. Known limitations
```

---

# Prompt 3 - Add Assignment 360 Detail View

```text
Add Assignment 360 Detail View.

Scope:
- When HR/Admin clicks View 360 from Assignment Workspace list, show a detail view for that Annual Assignment.
- This can be a detail route or an in-page detail panel.
- Do not remove old Annual Decisions/Audit/Bulk routes yet.

Required header:
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

Required sections/tabs inside 360 view:
1. Overview
2. Current Progress
3. Objectives
4. Manager Reviews
5. Annual Decision
6. Communication
7. SLA & Reminders
8. Delegation / Reassignment
9. Audit & History

For this prompt, implement:
- Header summary
- Overview tab
- Current Progress tab
- Placeholder cards for the other tabs if data wiring is not ready

Rules:
- Do not change backend APIs unless a small missing data fetch is required.
- Do not copy entire old workspaces yet.
- Keep the UI readable and simple.

Return:
1. Files changed
2. How View 360 is opened
3. Detail data source
4. Sections added
5. Placeholder sections, if any
6. Manual test notes
```

---

# Prompt 4 - Implement Current Progress and Quarter Summary

```text
Implement the Current Progress section inside Assignment 360.

Goal:
HR/Admin should immediately understand the employee's PMS progress quarter by quarter.

Show Q1/Q2/Q3/Q4 cards or table with:
- Quarter code
- Objective status
- Manager review status
- Quarter finalization status
- SLA status
- Current pending action / current owner

Rules:
- Use existing AnnualAssignment and QuarterAssignment data if available.
- Do not change workflow states.
- Do not invent new statuses if backend already has states.
- Display friendly labels for existing states.

Examples:
- NOT_STARTED -> Not Started
- OBJECTIVE_SETTING_OPEN -> Objective Setting Open
- OBJECTIVE_SUBMITTED -> Waiting for Manager Approval
- OBJECTIVE_APPROVED -> Objectives Approved
- MANAGER_REVIEW_OPEN -> Manager Review Pending
- MANAGER_REVIEW_SUBMITTED -> Review Submitted
- QUARTER_FINALIZED -> Finalized

Return:
1. Files changed
2. Quarter status mapping
3. How current owner/action is derived
4. Empty/missing data behavior
5. Manual test notes
```

---

# Prompt 5 - Add Objectives and Manager Reviews Sections

```text
Add Objectives and Manager Reviews sections inside Assignment 360.

Objectives section:
Show quarter-wise objectives with:
- Objective title
- Weightage
- Source: predefined / employee / manager
- Status
- Quarter
- Attachments indicator if available

Manager Reviews section:
Show quarter-wise manager review summary with:
- Review status
- Submitted by
- Submitted date
- Manager comments summary
- Quarter finalization status

Rules:
- Reuse existing objective/review APIs where possible.
- Do not change employee objective workflow.
- Do not change manager review workflow.
- Admin view should be read-only unless existing admin actions already allow changes.

Return:
1. Files changed
2. APIs used
3. Objective fields displayed
4. Review fields displayed
5. Permission/action behavior
6. Manual test notes
```

---

# Prompt 6 - Add Annual Decision Section in 360 View

```text
Add Annual Decision section inside Assignment 360.

Goal:
HR/Admin should not need a separate top-level Annual Decisions route for daily work.

Required display:
- Decision status
- Grade applied
- Merit applied
- Outcome type: BOTH / MERIT_ONLY / GRADE_ONLY / NIL
- Freeze status
- Visibility status
- Last updated information if available

Actions, only where permitted by existing rules:
- Save/update decision
- Submit decision
- Freeze
- Reopen
- Update visibility

Implementation guidance:
- Reuse existing AnnualDecisionWorkspace logic where practical.
- If existing component is too page-level, create a smaller scoped component for one annualAssignmentId.
- Do not duplicate complex decision logic manually in multiple places.
- Do not remove old Annual Decisions route yet.

Return:
1. Files changed
2. Reused component or new scoped component
3. APIs used
4. Actions supported
5. Permission/status gating
6. Manual test notes
```

---

# Prompt 7 - Add Communication and Visibility Section

```text
Add Communication and Visibility section inside Assignment 360.

Required display:
- Visibility status
- Employee review visibility
- Employee grade visibility
- Employee merit visibility
- Manager grade/merit visibility, if available
- Communication status
- Outcome content used/reference, if available
- Last sent date
- Delivery status
- Failure reason if any

Actions, only where permitted:
- Preview communication
- Send communication
- Resend communication
- Update visibility

Rules:
- No Letter Template Builder UI.
- Communication content remains backend-managed.
- Do not change communication backend logic.
- Use existing communication APIs/components where practical.

Return:
1. Files changed
2. APIs/components reused
3. Fields displayed
4. Actions supported
5. Error/empty-state behavior
6. Manual test notes
```

---

# Prompt 8 - Add SLA, Reminders, Delegation, and Reassignment Sections

```text
Add SLA & Reminders and Delegation / Reassignment sections inside Assignment 360.

SLA & Reminders section should show assignment-specific information:
- Due item
- Due date
- Breach status
- Reminder count/status
- Escalation target
- Last reminder date

Actions only if existing API supports them:
- Send reminder
- View reminder history

Delegation / Reassignment section should show:
- Current manager
- Active delegation if any
- Delegation period
- Reassignment history

Actions only if allowed:
- Reassign manager
- Create delegation
- Revoke delegation

Rules:
- Do not show global SLA rule configuration here.
- Global SLA configuration can move to Settings later.
- Do not remove Delegation route yet.
- Reuse existing APIs/components where practical.

Return:
1. Files changed
2. APIs used
3. SLA fields shown
4. Delegation/reassignment fields shown
5. Actions supported
6. Missing API/data gaps
7. Manual test notes
```

---

# Prompt 9 - Add Audit & History Section

```text
Add Audit & History section inside Assignment 360.

Goal:
Show a read-only timeline for the selected Annual Assignment.

Timeline should include, where data exists:
- Assignment created
- Objectives submitted/approved/returned
- Manager review submitted
- Quarter finalized
- Annual decision changes
- Visibility changes
- Communication events
- Reopen/correction events
- Delegation/reassignment events

Rules:
- Audit section must be read-only.
- Do not add create/edit actions here.
- Reuse AuditHistoryWorkspace logic if possible.
- If existing component is too page-level, create a scoped audit component accepting annualAssignmentId.
- Do not remove old Audit route yet.

Return:
1. Files changed
2. APIs used
3. Timeline fields shown
4. Empty state behavior
5. Manual test notes
```

---

# Prompt 10 - Move Bulk Actions Into Assignment Workspace

```text
Move Bulk Operations UI access into Assignment Workspace.

Goal:
Bulk Operations should no longer be a separate top-level PMS sidebar item, but the functionality should remain available inside Assignment Workspace.

Required behavior:
- Add Bulk Actions tab/section in Assignment Workspace.
- Reuse existing BulkOperationsWorkspace where possible.
- Keep existing bulk preview/dry-run/execute/history behavior.
- Keep assignment template override behavior.
- Keep bulk communication/visibility/reminder/close actions if currently supported.

Rules:
- Do not delete backend bulk operation services.
- Do not break current bulk operation APIs.
- Do not remove old /bulk route until sidebar cleanup phase.

Return:
1. Files changed
2. How BulkOperationsWorkspace is reused
3. Any props/configuration added
4. Confirm existing bulk assignment flow still works
5. Manual test notes
```

---

# Prompt 11 - Sidebar Cleanup and Route Visibility

```text
Clean up Admin PMS sidebar after Assignment Workspace is ready.

Goal:
Keep PMS sidebar simple.

Top-level PMS sidebar should show:
- Dashboard
- Templates
- Cycles
- Assignment Workspace
- Reports / Settings, if available

Hide these as separate top-level PMS sidebar items:
- Assignments
- Annual Decisions
- Audit & History
- SLA & Notifications
- Scoped Delegations
- Bulk Operations

Rules:
- Do not delete old route files yet unless confirmed safe.
- If old routes are still needed for backward compatibility, keep route access but remove from sidebar.
- Optional: redirect old routes to the relevant Assignment Workspace tab if simple and safe.
- Do not break deep links if the project uses them.

Return:
1. Files changed
2. Sidebar items before/after
3. Routes hidden
4. Redirects added, if any
5. Backward compatibility notes
```

---

# Prompt 12 - Cleanup Dead/Commented UI

```text
Clean dead/commented Admin PMS UI code after workspace consolidation.

Cleanup candidates:
1. Old bulk assignment UI and handler in Assignments page if unused.
2. Commented refresh blocks in Bulk parent route if no longer used.
3. Commented refresh blocks in Delegation parent route if no longer used.
4. Unused imports/state/handlers caused by route/sidebar consolidation.

Rules:
- Do not remove valid assignment maintenance actions.
- Do not remove backend APIs.
- Do not remove working components that are now reused inside Assignment Workspace.
- Keep cleanup small and safe.

Return:
1. Files changed
2. Removed code list
3. Confirm no referenced handlers were removed incorrectly
4. Any remaining cleanup TODOs
```

---

# Prompt 13 - Final Assignment Workspace Regression Check

```text
Run final Assignment Workspace regression review.

Check:
1. Sidebar shows simplified PMS navigation.
2. Assignment Workspace route loads.
3. Summary cards load.
4. Assignment list loads.
5. View 360 opens for one assignment.
6. Current Progress shows quarter statuses.
7. Objectives section shows quarter-wise objectives.
8. Manager Reviews section shows review status.
9. Annual Decision section is reachable and works according to permissions/status.
10. Communication section is reachable.
11. SLA & Reminders section is reachable.
12. Delegation / Reassignment section is reachable.
13. Audit & History section is read-only and reachable.
14. Bulk Actions are reachable inside Assignment Workspace.
15. Old top-level sidebar items are hidden.
16. Employee runtime screen still works.
17. Manager runtime screen still works.
18. Cycle creation still works.
19. Cycle launch still works.
20. Bulk assignment preview/execute still works inside the workspace.

Return:
- PASS/FAIL by item
- Files changed to fix issues
- Remaining limitations
- Manual/browser/API test status
- Final recommendation
```
