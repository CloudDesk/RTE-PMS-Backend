# Implementation Task 4: Configurable Assignment Window Timing for Mid-Cycle Employees

Source design: `PMS_Design_Change_Request_Flexible_Objectives_Probation_Review.md`

## Task Goal

Support employees who join, become eligible, transfer into scope, or are added to PMS after annual cycle launch by creating assignment-level window snapshots for selected applicable terms.

Existing cycle-level windows remain unchanged for existing employees. Assignment-level windows apply only to the selected Annual Assignment or assignment batch.

## References and Dependencies

### Source Design References

- Main design sections: 4.4, 9, 10.4, 11.3, 12.3, 13.3, 14.1, 14.3, 14.6, 14.7, 15, 16, 18, 19.
- This task owns assignment-level window policy, applicable term selection, locked window snapshots, mid-cycle assignment creation, dashboard/SLA date source, and audit/reporting for assignment windows.

### Required Cross-Task Inputs

- Depends on Task 1 Phase 4 for objective assignment rule application into selected Employee Term Objective plans.
- Depends on Task 1 Phase 5 for correction/amendment behavior when assigned objectives need changes after approval/finalization.
- Depends on Task 2 Phase 2 for actual columns by cycle term type.
- Depends on Task 2 Phase 8 for grouped/annual review scoring when only partial-year terms are applicable.
- Does not depend on Task 3, but should reuse the same locked snapshot, audit, dashboard status, and reporting-source discipline.

### Existing Backend References

- Assignment and cycle dependencies:
  - `Server/src/models/pms-annual-assignment.model.ts`
  - `Server/src/models/pms-term-assignment.model.ts`
  - `Server/src/models/pms-annual-cycle.model.ts`
  - `Server/src/models/pms-term-cycle.model.ts`
  - `Server/src/services/assignment.service.ts`
  - `Server/src/services/cycle.service.ts`
  - `Server/src/routes/assignment.routes.ts`
  - `Server/src/routes/cycle.routes.ts`
- Workflow, SLA, and dashboard dependencies:
  - `Server/src/services/term-assignment-workflow.service.ts`
  - `Server/src/services/sla.service.ts`
  - `Server/src/models/pms-sla-rule.model.ts`
  - `Server/src/models/pms-sla-event.model.ts`
  - `Server/src/services/pmsDashboard.service.ts`
- Objective integration dependencies:
  - `Server/src/services/objective.service.ts`
  - `Server/src/routes/objective.routes.ts`
- Audit dependencies:
  - `Server/src/services/audit.service.ts`
  - `Server/src/models/audit-log.model.ts`

### Existing Frontend References

- Assignment workspace and cycle pages:
  - `Client/src/lib/components/pms/assignment-workspace/AssignmentWorkspace.svelte`
  - `Client/src/lib/components/pms/assignment-workspace/Assignment360Detail.svelte`
  - `Client/src/routes/admin/pms/assignment-workspace/+page.svelte`
  - `Client/src/routes/admin/pms/assignments/+page.svelte`
  - `Client/src/routes/admin/pms/cycles/+page.svelte`
  - `Client/src/routes/admin/pms/cycles/[id]/+page.svelte`
- API clients:
  - `Client/src/lib/services/api/pmsAssignments.ts`
  - `Client/src/lib/services/api/pmsCycles.ts`
  - `Client/src/lib/services/api/pmsSla.ts`

### Cross-Task Output Used Later

- Task 2 runtime screens must check this task's assignment-level windows before allowing actual entry, achievement submission, or manager review.
- Dashboard/reporting must use assignment-level windows from this task when present; otherwise they must fall back to cycle-level windows.

## Global Implementation Rules

- Keep existing annual cycle window behavior as the default.
- Do not change global cycle windows when configuring a mid-cycle employee.
- Store assignment-level windows as locked snapshots for historical accuracy.
- Use assignment-level windows for dashboard, SLA, reminders, objective activity, achievement activity, and review timing when present.
- Fall back to cycle-level windows when no assignment-level policy exists.
- Keep UI friendly for HR/Admin and non-technical users with guided term selection, date previews, and warnings.
- Do not create very large components. Keep Svelte components around 1000-1500+ lines maximum, and split earlier when responsibility grows.
- Use child components for term selection, window policy form, date preview, exception warnings, SLA preview, and audit timeline.
- Pass data through props/events and keep API calls in workspace or route-level components.
- Enforce all window validation on the server.
- Add tests for term selection, date calculations, snapshot locking, dashboard due dates, and backward compatibility.

## Phase 1: Assignment-Level Window Policy Model

### 1.1 Add assignment window policy support

- Create data structure for assignment-level window policy.
- Supported window types:
  - Objective Setting Window
  - Objective Approval Window
  - Achievement Submission Window
  - Manager Review Window
  - Finalization Due Date
  - SLA / Reminder Dates

### 1.2 Supported timing modes

- Support:
  - `INHERIT_CYCLE_WINDOW`
  - `FIXED_DATE_RANGE`
  - `RELATIVE_TO_ASSIGNMENT_DATE`
  - `RELATIVE_TO_JOINING_DATE`
  - `RELATIVE_TO_TERM_DATE`
  - `MANUAL_OPEN_CLOSE`
- Default to `INHERIT_CYCLE_WINDOW` for existing assignments.

### 1.3 Assignment window snapshot

- Store locked snapshot on Annual Assignment:
  - window policy mode
  - selected applicable terms
  - objective setting window per term
  - objective approval window per term where required
  - achievement submission window per term where enabled
  - manager review window or review group window
  - finalization due date
  - SLA/reminder dates
  - created by
  - created at
  - reason/note where configured

### 1.4 Backward compatibility

- Existing assignments without assignment-level snapshot continue using cycle-level windows.
- Later cycle window changes do not update locked assignment snapshots unless authorized correction/migration is performed.

## Phase 2: Applicable Term Selection

### 2.1 Term selection rules

- HR/Admin must select applicable assessment terms when creating mid-cycle assignment.
- At least one applicable term must be selected.
- Selected terms must match cycle term type:
  - Quarterly: Q1, Q2, Q3, Q4
  - Half-yearly: H1, H2
  - Yearly: Y1
- Past terms must not be silently included.
- HR/Admin must explicitly select current or past term and configure valid windows if late activity is allowed.

### 2.2 Recommended term handling

- If employee joins before Q1 closes, Q1 may be included if HR/Admin configures a window.
- If employee joins after Q1 closes, Q1 should be not applicable or closed for that employee.
- If employee joins during Q2, Q2, Q3, and Q4 may be assigned based on policy.
- Half-yearly cycle mid-entry depends on H1/H2 date and policy.
- Yearly cycle may use Y1 with assignment-level windows.

### 2.3 User-friendly term selection UI

- Show available terms as selectable cards or checkboxes.
- Show term status:
  - "Recommended"
  - "Already closed"
  - "Can be included with special window"
  - "Not applicable"
- Explain impact in simple language:
  - "Q1 will not be part of this employee's review"
  - "Q2 objectives can be opened with a custom date"
  - "Annual review will include only selected terms"

## Phase 3: Window Date Calculation

### 3.1 Fixed date range

- HR/Admin enters explicit start and end dates.
- Validate start date is not after end date.
- Validate windows do not conflict with finalized/closed term status.

### 3.2 Relative to assignment date

- Calculate open/close dates from Annual Assignment creation date.
- Store resolved dates in snapshot, not only relative formula.

### 3.3 Relative to joining date

- Calculate dates from employee joining/eligibility date.
- Validate employee joining/eligibility date exists.
- Store resolved dates in snapshot.

### 3.4 Relative to term date

- Calculate dates from selected assessment term date.
- Ensure term exists for selected cycle type.
- Store resolved dates in snapshot.

### 3.5 Manual open/close

- Allow authorized HR/Admin to manually open or close assignment windows.
- Audit every manual open/close action with reason.
- Dashboard must use manual state and due dates consistently.

### 3.6 Date preview UI

- Before saving, show a clear preview:
  - objective setting open/close
  - objective approval open/close
  - achievement open/close
  - manager review open/close
  - finalization due date
  - reminder/SLA dates
- Highlight conflicts:
  - "End date is before start date"
  - "Q1 is already finalized"
  - "Review date is before achievement window closes"

## Phase 4: Annual Assignment Creation After Launch

### 4.1 Create mid-cycle Annual Assignment

- Allow HR/Admin to create Annual Assignment after cycle launch for eligible employee.
- Apply selected applicable terms only.
- Apply assignment-level window snapshot.
- Do not modify annual cycle default windows.

### 4.2 Apply objective assignment rules

- Evaluate flexible objective assignment rules only for selected applicable terms.
- Create Employee Term Objectives only for applicable terms.
- Preserve objective snapshots at assignment time.
- Prevent objectives from being silently added to non-applicable terms.

### 4.3 Review timing interaction

- If review timing is annual or grouped, include only applicable terms for the employee.
- Example:

```text
Employee joins in Q2
Applicable terms = Q2 + Q3 + Q4
Annual review objective scoring includes Q2 + Q3 + Q4 only
Q1 is not applicable for that employee
```

### 4.4 User-friendly creation flow

- Add a guided mid-cycle assignment flow:
  - Select employee
  - Confirm eligibility/joining context
  - Select applicable terms
  - Choose timing mode
  - Configure or inherit windows
  - Preview objectives/reviews/due dates
  - Confirm assignment
- Show summary before confirmation:
  - included terms
  - excluded terms
  - custom windows
  - inherited windows
  - expected pending actions

## Phase 5: Runtime Window Enforcement

### 5.1 Objective setting window

- Allow objective creation/assignment only during applicable employee assignment window.
- If window is closed, show clear reason and current status.

### 5.2 Objective approval window

- Allow manager approval/return only when objective approval window is open or policy permits action.
- Use assignment-level snapshot when present.

### 5.3 Achievement submission window

- Allow actual value and achievement submission only during configured achievement window where enabled.
- Actual columns must follow selected cycle term type only.

### 5.4 Manager review window

- Allow manager review input only during configured review window.
- Grouped or annual review includes only selected applicable terms.

### 5.5 Finalization and SLA

- Use assignment-level finalization due date and SLA/reminder dates when present.
- Existing cycle due dates apply only when assignment-level dates do not exist.

## Phase 6: Dashboard, SLA, and Reminder Integration

### 6.1 Dashboard date source

- Dashboard status must use:
  - assignment-level window snapshot when present
  - cycle-level window when assignment snapshot is absent
- Do not base dashboard status only on UI labels.

### 6.2 Dashboard statuses

- Calculate:
  - Not Started
  - Pending Objective Setup
  - Pending Achievement
  - Pending Manager Review
  - Returned for Revision
  - Submitted
  - Finalized
  - Closed / Not Applicable
  - Overdue
  - Blocked

### 6.3 SLA/reminder behavior

- Use assignment-specific due dates for reminders.
- Show overdue based on selected applicable terms and snapshot dates.
- Do not send reminders for non-applicable terms.

### 6.4 Dashboard UI

- Show assignment-level date source:
  - "Using custom assignment window"
  - "Using cycle window"
- Show not-applicable terms clearly:
  - "Q1 not applicable for this employee"
- Keep status plain and action-oriented:
  - "Objectives due on 12 Jul"
  - "Achievement window opens on 01 Aug"
  - "Manager review is overdue"

## Phase 7: Audit and Reporting

### 7.1 Audit capture

- Capture:
  - mid-cycle assignment creation
  - applicable term selection
  - window policy mode
  - resolved window dates
  - manual open/close
  - correction/migration actions
  - reason/note
  - actor and timestamp

### 7.2 Reporting fields

- Expose:
  - applicable terms
  - assignment window policy mode
  - objective setting window
  - achievement submission window
  - manager review window
  - finalization due date
  - assignment SLA/reminder dates
  - created by/created at
  - reason/note where configured

### 7.3 Audit UI

- Add assignment window audit view:
  - created snapshot
  - term selection changes before lock
  - manual open/close
  - corrections
  - who changed what and why
- Use readable event labels:
  - "Custom window created"
  - "Q1 marked not applicable"
  - "Manager review window manually opened"

## Phase 8: Correction and Migration Controls

### 8.1 Correction rules

- Later cycle window changes must not update locked assignment snapshots.
- Snapshot correction requires authorization and reason.
- Do not allow correction that conflicts with finalized/closed term status.

### 8.2 Migration controls

- Bulk retroactive recalculation of assignment windows is not in this approval.
- If migration is later needed, it must be separately approved.

### 8.3 UI safeguards

- Show confirmation before changing snapshot:
  - impacted terms
  - old dates
  - new dates
  - reason required
- Keep finalized terms protected.

## Phase 9: QA and Acceptance

### 9.1 Backend acceptance checks

- Existing assignments inherit cycle windows.
- Mid-cycle assignment can select applicable terms.
- At least one term is required.
- Selected terms must match cycle term type.
- Past terms are included only when explicitly selected.
- Snapshot stores resolved dates.
- Later cycle window update does not change assignment snapshot.
- Objective rules apply only to selected applicable terms.
- Dashboard and SLA use assignment-level dates when present.

### 9.2 Frontend acceptance checks

- HR/Admin can create mid-cycle assignment through guided flow.
- Date preview is understandable without technical knowledge.
- Excluded terms are clearly shown as not applicable.
- Validation messages explain what to fix.
- Dashboard shows whether dates come from custom assignment window or cycle window.
- Components are split into focused child components.

### 9.3 Regression checks

- Existing cycle launch is unchanged.
- Existing annual assignments without custom windows behave as before.
- Existing dashboard still works for normal assignments.
- Existing SLA/reminder behavior remains for assignments without assignment-level windows.
- Existing finalized records are not recalculated.
