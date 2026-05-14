# PMS v2 - 3 Day Team Execution Plan

**Project:** Performance Management System (PMS) v2  
**Team:** Suresh, Vinith, Fazil  
**Purpose:** Short-term execution guide for a 2-3 day AI/Codex-assisted build sprint  
**Status:** Planning Guide Only  
**Date:** May 14, 2026  

---

# 1. Purpose of This Document

This document is a practical team guide for completing a working PMS v2 foundation in 2-3 days with help from AI/Codex on individual developer systems.

This is **not** a replacement for the approved documents.

Implementation must continue to follow:

* `PMS_FSD_v2.md`
* `Master_Prompt_v2.md`
* `Module_Prompt_v2.md`
* Approved Baseline and Discussion Notes

If this plan conflicts with the FSD or approved prompts, the FSD and approved prompts win.

---

# 2. Realistic 3-Day Goal

The realistic goal for 3 days is to complete a **working PMS v2 MVP/foundation flow**, not the full enterprise-grade final system.

The 3-day target should prove the core lifecycle:

```text
Annual Cycle Setup
-> Employee Assignment
-> Q1-Q4 Quarter Assignments
-> Objective Creation and Submission
-> Manager Objective Approval / Return
-> Manager Quarterly Review
-> Quarter Finalization
-> Annual Appraisal Decision
-> Grade/Merit Outcome
-> Visibility Control
-> Basic Audit Trail
```

The team should avoid spending the sprint on lower-priority advanced configuration screens before the core flow works.

---

# 3. Important Scope Decision

## Dynamic Roles Configuration

Full Dynamic Roles Configuration should be **deferred after the 3-day sprint**.

For the 3-day sprint, implement only a **basic Dynamic Access Engine foundation** using current HRMS roles:

| Current HRMS Role | PMS Meaning |
|---|---|
| `staff` | Employee |
| `manager` | Manager |
| `admin` | HR/Admin |

This keeps the system aligned with the FSD because access is still enforced server-side, while avoiding the time cost of building the full role configuration UI immediately.

The foundation must be designed so that later it can support:

* custom PMS roles
* permission mapping
* hierarchy scope configuration
* section-level permissions
* field-level permissions
* permission simulation

Do not hardcode business behavior inside individual modules. Keep access checks centralized so the future dynamic version can replace the temporary role mapping.

---

# 4. Recommended Team Ownership

## Suresh - Foundation, Workflow, Access, Audit

Suresh should own the shared PMS foundation because every other module depends on it.

Responsibilities:

* PMS constants and approved enums
* Quarter and annual workflow states
* Workflow transition matrix
* Basic Workflow Engine service
* Basic Dynamic Access Engine foundation
* Server-side role/assignment/hierarchy guard approach
* Audit helper/service pattern
* Common PMS validation approach
* Integration review for Vinith and Fazil's modules

Main documents to use:

* `Master_Prompt_v2.md`
* `Module_Prompt_v2.md` - Workflow Engine
* `Module_Prompt_v2.md` - Dynamic Access Engine
* `Module_Prompt_v2.md` - History & Audit Compliance

Expected result:

Suresh provides the common engine and rules that all PMS modules call instead of each module inventing its own checks.

---

## Vinith - Template, Objective, Manager Quarterly Review

Vinith should own the UI screens closest to forms and quarter-level performance entry during the 3-day sprint. Backend objective/review APIs are owned by Suresh for Day 1 so the backend foundation stays consistent.

Responsibilities:

* Employee Objective Create/Submit UI
* Manager Objective Approval/Return UI
* Manager Quarter Review Submit UI
* Mock JSON for objective/review screens
* Frontend API service function placeholders
* Day 2 integration with real backend objective/review APIs

Main documents to use:

* `Module_Prompt_v2.md` - Template Management
* `Module_Prompt_v2.md` - Objective Management
* `Module_Prompt_v2.md` - Manager Quarterly Review Management

Expected result:

Vinith completes the quarter-level UI flow from objective creation to manager review submission using mock data on Day 1, then integrates with backend APIs on Day 2.

---

## Fazil - Cycle, Assignment, Annual Decision

Fazil should own the UI screens for annual structure and assignment flow during the 3-day sprint. Backend cycle/assignment/annual decision APIs are owned by Suresh for Day 1 so the backend foundation stays consistent.

Responsibilities:

* Admin Cycle Setup UI
* Assignment UI
* Annual Summary UI
* Annual Decision Draft/Freeze UI
* Basic Visibility UI
* Mock JSON for cycle/assignment/annual decision screens
* Frontend API service function placeholders
* Day 2 integration with real backend cycle/assignment APIs

Main documents to use:

* `Module_Prompt_v2.md` - Cycle Management
* `Module_Prompt_v2.md` - Assignment Management
* `Module_Prompt_v2.md` - Annual Appraisal Decision Management

Expected result:

Fazil completes the annual lifecycle UI flow using mock data on Day 1, then integrates with backend APIs on Day 2.

---

# 5. Detailed 3-Day Execution Plan

All new PMS APIs should use the `/pms` route prefix.

Examples:

```text
POST /pms/objectives
POST /pms/cycles
POST /pms/annual-assignments/:id/decision/freeze
```

---

## Day 1 - Foundation and Data Structure

Goal: Suresh builds the backend foundation and base APIs. Vinith and Fazil build UI screens using mock/static data so Day 2 can become integration day.

### Suresh - Backend Owner

Build all core PMS backend foundations and base APIs.

Foundation:

* `pms.enums.ts`
* `pms.types.ts`
* `workflow.service.ts`
* `access.service.ts`
* `audit.service.ts`
* `visibilityMask.service.ts`
* `scripts/seed-pms-demo.ts`

Deliver:

* approved quarter states
* approved annual states
* transition matrix
* `validateTransition()`
* basic role check: `staff` / `manager` / `admin`
* assignment ownership check
* `createAuditLog()`
* `maskGradeMeritFields()`
* shared API response JSON contracts before UI work starts
* demo seed script for basic local testing

Suresh should define these shared method contracts early so every backend module uses the same workflow, access, audit, and visibility rules:

```ts
workflowService.transition(...)
workflowService.validateTransition(...)
accessService.canPerform(...)
auditService.createAuditLog(...)
visibilityMaskService.mask(...)
```

Models:

* Objective model
* QuarterReview model
* AnnualCycle model
* QuarterCycle model
* AnnualAssignment model
* QuarterAssignment model
* AnnualDecision model
* AuditLog model

Routes/services:

* `objective.routes.ts`
* `quarterReview.routes.ts`
* `cycle.routes.ts`
* `assignment.routes.ts`
* `annualDecision.routes.ts`
* `objective.service.ts`
* `quarterReview.service.ts`
* `cycle.service.ts`
* `assignment.service.ts`
* `annualDecision.service.ts`

Base APIs:

```text
POST /pms/cycles
POST /pms/cycles/:id/assign
POST /pms/objectives
POST /pms/objectives/:id/submit
POST /pms/objectives/:id/approve
POST /pms/objectives/:id/return
POST /pms/quarter-reviews/:id/submit
POST /pms/quarter-assignments/:id/finalize
GET /pms/annual-assignments/:id/summary
PUT /pms/annual-assignments/:id/decision/draft
POST /pms/annual-assignments/:id/decision/freeze
POST /pms/annual-assignments/:id/visibility
```

Important Day 1 scope note:

Do not try to complete annual decision business validation and freeze rules fully on Day 1. Build the model and draft/freeze API skeletons. Full eligibility validation, outcome derivation, freeze protection, and visibility behavior can be completed on Day 3.

The annual decision freeze API may remain a skeleton on Day 1. It should compile and follow the route/service pattern, but final validation can be completed on Day 3.

Seed script responsibility:

`scripts/seed-pms-demo.ts` should seed enough data for local demo/testing:

* admin
* manager
* employee
* one annual cycle
* Q1-Q4 quarters
* one AnnualAssignment
* linked QuarterAssignments

Shared API response wrapper:

Success responses should use:

```ts
{
  success: true,
  message: string,
  data: {}
}
```

Error responses should use:

```ts
{
  success: false,
  errorCode: string,
  message: string
}
```

Required Mongo indexes:

```text
annualAssignment(employeeId, cycleId)
quarterAssignment(annualAssignmentId, quarter)
objective(quarterAssignmentId)
quarterReview(quarterAssignmentId)
```

The `annualAssignment(employeeId, cycleId)` index should prevent duplicate assignment for the same employee and annual cycle.

### Vinith - UI Only: Objective and Review Screens

Vinith should build Svelte screens using mock/static data first.

Before starting UI wiring, Vinith should use the sample response JSON contracts shared by Suresh.

Screens:

* Employee Objective Create/Submit screen
* Manager Objective Approval/Return screen
* Manager Quarter Review Submit screen

Prepare frontend API service functions:

* `createObjective()`
* `submitObjective()`
* `approveObjective()`
* `returnObjective()`
* `submitQuarterReview()`

Vinith should not wait for backend completion. Use mock JSON matching the expected backend response shape shared by Suresh.

### Fazil - UI Only: Cycle, Assignment, Annual Decision Screens

Fazil should build Svelte screens using mock/static data first.

Before starting UI wiring, Fazil should use the sample response JSON contracts shared by Suresh.

Screens:

* Admin Cycle Setup screen
* Assignment screen
* Annual Summary screen
* Annual Decision Draft/Freeze screen
* Basic Visibility screen

Prepare frontend API service functions:

* `createCycle()`
* `assignEmployee()`
* `getAnnualSummary()`
* `saveDecisionDraft()`
* `freezeDecision()`
* `enableVisibility()`
* `finalizeQuarterAssignment()`

Fazil should not wait for backend completion. Use mock JSON matching the expected backend response shape shared by Suresh.

### Day 1 Integration

By end of Day 1:

1. Admin creates cycle through backend API.
2. System creates Q1-Q4 quarters.
3. Admin assigns employee and manager through backend API.
4. System creates AnnualAssignment.
5. System creates QuarterAssignments.
6. Employee objective can be created using `quarterAssignmentId`.

Checkpoint:

* Suresh: backend APIs compile and basic Postman/API flow works.
* Vinith: objective/review UI screens are ready with mock data.
* Fazil: cycle/assignment/annual decision UI screens are ready with mock data.
* Day 2 can replace mock API calls with real backend endpoints.

Suresh should share sample JSON early for:

* AnnualAssignment response
* QuarterAssignment response
* Objective response
* QuarterReview response
* AnnualDecision response

---

## Day 2 - Core Quarter Workflow

Goal: Replace Day 1 mock UI calls with real backend endpoints and make one quarter work end to end.

### Suresh

Strengthen shared rules:

* Employee can submit only own objective.
* Manager can approve only assigned employee.
* Admin can finalize quarter.
* All workflow transitions are validated.
* Audit is created for every important action.

Required transitions:

```text
OBJECTIVE_DRAFT -> OBJECTIVE_SUBMITTED
OBJECTIVE_SUBMITTED -> OBJECTIVE_APPROVED
OBJECTIVE_SUBMITTED -> OBJECTIVE_REVISION_REQUIRED
OBJECTIVE_REVISION_REQUIRED -> OBJECTIVE_SUBMITTED
OBJECTIVE_APPROVED -> MANAGER_REVIEW_OPEN
MANAGER_REVIEW_OPEN -> MANAGER_REVIEW_SUBMITTED
MANAGER_REVIEW_SUBMITTED -> QUARTER_FINALIZED
```

Important note:

`OBJECTIVE_APPROVED -> MANAGER_REVIEW_OPEN` should happen only when the configured manager review window is active. For the 3-day demo, this may be treated as a controlled MVP shortcut, but production behavior must follow configured review windows from the FSD.

### Vinith

Integrate and complete quarter UI flow:

* Employee creates objective.
* Employee submits objective.
* Manager approves objective.
* Manager returns objective with mandatory reason.
* Employee resubmits revised objective.
* Manager-created objective auto-approves.
* Manager submits quarter review.
* Replace mock API calls with real `/pms/objectives` and `/pms/quarter-reviews` endpoints.

### Fazil

Integrate assignment and annual screens:

* When objective is approved and review window is active, quarter moves to `MANAGER_REVIEW_OPEN`.
* When review is submitted, quarter moves to `MANAGER_REVIEW_SUBMITTED`.
* Admin finalizes Quarter Assignment through `POST /pms/quarter-assignments/:id/finalize`.
* Annual eligibility checks finalized/closed quarters.
* Replace mock API calls with real `/pms/cycles` and `/pms/annual-assignments` endpoints.

### Day 2 Integration

Flow to test together:

```text
Admin creates assignment
-> Employee submits objective
-> Manager approves objective
-> Manager submits quarter review
-> Admin finalizes quarter assignment
-> Audit log visible for all actions
```

Checkpoint:

* employee objective submit works
* manager approval/return works
* manager-created auto-approval works
* manager review submit works
* HR/Admin quarter assignment finalize works
* annual eligibility check works

---

## Day 3 - Annual Decision, Visibility, Demo Readiness

Goal: Demo-ready PMS happy path.

### Suresh

Finalize security:

* Mask grade/merit before visibility.
* Review all APIs for permission checks.
* Review all APIs for workflow checks.
* Ensure audit exists.
* Complete `POST /pms/annual-assignments/:id/visibility`.
* Prepare demo checklist.

### Vinith

Polish quarter APIs/UI where time permits:

* Employee objective page
* Manager approval page
* Manager quarter review page
* API response cleanup
* integration bug fixes

Backend stability remains higher priority than UI polish.

No UI polish should happen before integration works. First make the real API flow work, then improve spacing, labels, states, and visual details.

### Fazil

Complete annual decision:

* Annual summary API
* decision draft
* `isGradeApplied`
* `isMeritApplied`
* `appraisalOutcomeType` derivation
* freeze decision
* visibility flags

Outcome rule:

| isGradeApplied | isMeritApplied | appraisalOutcomeType |
|---|---|---|
| true | true | BOTH |
| true | false | GRADE_ONLY |
| false | true | MERIT_ONLY |
| false | false | NIL |

Annual decision draft/freeze must be blocked until all applicable Quarter Assignments are either:

* `QUARTER_FINALIZED`
* `CLOSED_BY_ADMIN`

### Day 3 Integration

Final demo flow:

1. Admin creates annual cycle.
2. System creates Q1-Q4.
3. Admin assigns employee and manager.
4. Employee creates/submits objective.
5. Manager approves objective.
6. Manager submits quarter review.
7. Admin finalizes quarter.
8. Repeat or seed remaining quarters as finalized for demo only.
9. Management/Admin records grade/merit.
10. System derives `appraisalOutcomeType`.
11. Decision is frozen.
12. Grade/merit hidden before visibility.
13. Admin enables visibility.
14. Employee/manager can view allowed fields.
15. Audit logs show major actions.

Demo shortcut note:

Seeding remaining quarters as finalized is acceptable only for demo/testing. Production flow must finalize each applicable quarter through the approved quarter workflow.

---

# 6. Features to Defer After 3 Days

These are important, but should not block the 3-day MVP:

* Full Dynamic Role Configuration UI
* Permission Simulation screen
* Advanced field-level permission configuration UI
* Full dynamic template/form builder UI
* Full letter template builder
* Communication dispatch with final PDF/email templates
* Bulk operations
* SLA scheduler and retry handling
* Delegation UI
* Advanced dashboard and reporting
* Full correction layer screens
* Historical export/download
* Advanced async batch processing
* Complex notification retry engine

The code should still be structured so these can be added later without rewriting the core PMS flow.

---

# 7. Minimum MVP Acceptance Criteria

By the end of the 3-day sprint, the team should be able to demonstrate:

1. HR/Admin creates or seeds an annual PMS cycle.
2. System creates Q1-Q4 quarter records.
3. HR/Admin assigns an employee and manager from existing HRMS user data.
4. System creates one Annual Assignment and linked Quarter Assignments.
5. Employee creates and submits objectives.
6. Manager approves or returns objectives.
7. Manager-created objective becomes auto-approved.
8. Manager submits quarterly review.
9. HR/Admin finalizes Quarter Assignment.
10. Annual decision is blocked until applicable quarters are finalized or closed.
11. Management/HR/Admin records grade/merit decision.
12. System derives:

```text
isGradeApplied + isMeritApplied -> appraisalOutcomeType
```

13. Annual decision can be frozen.
14. Grade/merit fields are hidden until visibility is enabled.
15. Major actions write audit records.

---

# 8. Daily Working Method With Codex

Each developer should use Codex with the relevant module prompt.

Recommended process:

1. Open the FSD section for the module.
2. Open the matching Module Prompt section.
3. Ask Codex to inspect existing project structure before coding.
4. Ask Codex to implement only the assigned module scope.
5. Ask Codex to reuse shared workflow/access/audit utilities from Suresh's foundation.
6. Run local tests or at least TypeScript/build checks.
7. Share changed files and API behavior with the team.
8. Merge only after confirming:
   * approved states are used
   * server-side access is enforced
   * no hidden fields are leaked
   * audit is present for critical writes

Avoid asking Codex to "build PMS completely" in one prompt. Use module-specific prompts and small checkpoints.

## Definition of Done Before Merge

Before any PMS branch is merged:

- [ ] TypeScript/build check passes.
- [ ] API is tested in Postman or equivalent API client where applicable.
- [ ] Code uses `workflowService` for workflow state transitions.
- [ ] Code uses `accessService` for permission checks.
- [ ] Code uses `auditService` for critical write actions.
- [ ] Code does not directly mutate workflow status fields.
- [ ] Code does not directly check raw roles for PMS authorization decisions.
- [ ] Code does not leak hidden grade/merit fields.
- [ ] API response follows the shared success/error wrapper.
- [ ] Any unclear business behavior is marked as `Pending Business Clarification`.

---

# 9. Team Integration Rules

To avoid conflicts:

* Each developer should work on a separate branch.
* Suresh should merge foundation changes first.
* Vinith and Fazil should rebase/pull foundation changes before connecting their modules.
* Shared constants should not be duplicated in feature modules.
* Workflow state changes must go through the shared Workflow Engine.
* Permission checks must go through the shared Access Engine foundation.
* Audit records must go through the shared Audit helper/service.
* UI polish must wait until the real API integration works.
* Any unclear business behavior must be marked as `Pending Business Clarification`.

Recommended branches:

```text
pms/foundation-workflow-access-audit
pms/template-objective-review
pms/cycle-assignment-annual-decision
```

## Required Integration Order

Use this order during the 3-day sprint:

1. Suresh backend foundation and base APIs first.
2. Vinith and Fazil build UI with mock JSON in parallel on Day 1.
3. Suresh shares response shapes for AnnualAssignment, QuarterAssignment, Objective, QuarterReview, and AnnualDecision.
4. Fazil UI integrates cycle and assignment APIs.
5. Vinith UI integrates objective/review APIs using `quarterAssignmentId`.
6. Fazil annual decision UI depends on finalized `quarterAssignment`.
7. Suresh visibility/audit wraps all APIs.
8. UI polish happens only after real API integration works.

This keeps the dependency chain clean:

```text
Foundation
-> Cycle
-> Assignment
-> Objective
-> Quarter Review
-> Annual Decision
-> Visibility
-> Audit
```

## Simple Team Rules

No one should directly change workflow state like this:

```ts
assignment.status = "OBJECTIVE_APPROVED";
```

Everyone must call:

```ts
workflowService.transition(...);
```

No one should directly check roles like this:

```ts
if (user.role === "manager") {
  // allow action
}
```

Everyone must call:

```ts
accessService.canPerform(...);
```

No one should return grade or merit fields directly from PMS APIs.

Everyone must call:

```ts
visibilityMaskService.mask(...);
```

No one should create one-off audit objects inside module services.

Everyone must call:

```ts
auditService.createAuditLog(...);
```

These rules are mandatory for the sprint because they prevent the three code streams from creating different workflow, permission, visibility, and audit behavior.

---

# 10. Risk Areas

High-risk areas for the 3-day sprint:

* Trying to build full dynamic role configuration too early
* Building UI before backend workflow is stable
* Duplicating workflow checks inside each module
* Returning confidential grade/merit fields from APIs too early
* Not preserving audit logs for workflow transitions
* Overbuilding letter templates and dashboards before the core flow works
* Confusion between HRMS user roles and PMS dynamic roles

Mitigation:

* Use current HRMS roles for the first sprint.
* Keep Dynamic Access Engine as a centralized foundation.
* Build happy path first.
* Add edge cases only after core flow works.
* Keep all unknowns as `Pending Business Clarification`.

---

# 11. Final Recommendation

The 3-day target is possible only as a focused MVP/foundation build.

Recommended priority:

```text
Foundation
-> Cycle
-> Assignment
-> Objective
-> Manager Review
-> Annual Decision
-> Visibility Masking
-> Audit
-> Demo
```

Do not spend the first sprint building the full Dynamic Roles Configuration module. Build the access engine foundation now using existing HRMS roles, then add dynamic configuration after the core PMS flow is working.

The main success condition is simple:

**One complete PMS appraisal journey should work correctly, securely, and traceably according to the FSD.**
