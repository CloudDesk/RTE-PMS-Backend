# Manager-Initiated / Confirmation Review UI Revamp Plan

## Objective

The goal of this UI revamp is to make the Manager-Initiated / Confirmation Review workflow simple enough for a first-line manager or technical diploma holder to use without PMS training.

The page must answer three questions clearly: who needs a review, what is pending, and what action should the manager take next.

---

# Phase 1: UI Language Cleanup Module

## Scope

This phase only changes visible labels, button text, tab names, helper text, and user-facing messages.

No backend logic, workflow logic, permission logic, or database change should be done in this phase.

## Current Problem

The current UI uses system-centric and technical PMS words like Templates, Active Reviews, Eligible Employees, Launch Review, review label, workflow state, and template version.

These words are correct internally but confusing for managers because they do not explain the actual task.

## Required Changes

Change Templates to Review Forms.

Change Active Reviews to In Progress.

Change Eligible Employees to Employees Ready for Review.

Change Launch Review to Start Review.

Change Review label to Review Name.

Change Manager Initiated Review to Confirmation Review.

Change template missing messages to review-form missing messages.

## Expected UI Behavior

The manager should see plain business language only.

The manager should not see technical words such as templateVersionId, assignment, workflow state, current version, eligibility rule, or visibility scope.

## Acceptance Criteria

All manager-facing screens must use simple review language.

No visible manager UI should say Template unless the manager is inside Review Forms configuration.

No visible manager UI should say Launch Review.

No visible manager UI should expose backend or workflow terminology.

---

# Phase 2: Manager Page Header and Page Purpose Module

## Scope

This phase updates the main page title, subtitle, and first impression of the Confirmation Reviews page.

## Current Problem

The current page feels like an admin screen because it exposes Employees, Templates, and Active Reviews before showing the manager what action is needed.

## Required UI Structure

Page title should be Confirmation Reviews.

Subtitle should be Start and track intern, fresher, trainee, probation, and junior employee reviews.

The page should immediately communicate that this is a manager work queue.

## Expected UI Behavior

When a manager opens the page, they should immediately understand that the page is for starting and tracking confirmation reviews.

The first visible content should not be template setup or configuration-heavy information.

## Acceptance Criteria

Page title is clear.

Subtitle explains the purpose.

Manager does not need to understand PMS configuration before taking action.

---

# Phase 3: Tab Structure Revamp Module

## Scope

This phase replaces the current data-category tabs with task-based tabs.

## Current Problem

Tabs like Employees, Templates, and Active Reviews are system categories.

A manager may not know whether to start from Employees or Active Reviews.

## Required Tabs

Pending

In Progress

Completed

Review Forms

## Default Tab

The default selected tab must be Pending.

## Tab Purpose

Pending should show employees who need review action.

In Progress should show reviews that have already started.

Completed should show submitted or completed review history.

Review Forms should contain review form configuration and should not be the manager’s daily starting point.

## Expected UI Behavior

The manager should open the page and land directly on Pending.

The manager should see work to do first, not setup configuration.

## Acceptance Criteria

Old tabs Employees, Templates, and Active Reviews are removed from the primary manager flow.

Templates are available only as Review Forms.

Pending is the first/default tab.

The tab structure feels like a work queue, not an admin console.

---

# Phase 4: Pending Reviews Module

## Scope

This phase redesigns the Pending tab.

## Purpose

The Pending tab should show employees who are ready for confirmation review or blocked from starting due to a clear reason.

## Required Columns

Employee

Department

Joining Date

Review Type

Status

Action

## Required Status Labels

Ready

Already Started

Missing Review Form

Not Eligible Yet

## Required Actions

Start Review for employees who are ready.

View Reason or disabled Start Review with reason for blocked employees.

Open Review for employees whose review is already started.

## Current Problem

The current UI may show employees, eligibility, template dependency, or disabled actions without explaining what the manager should do.

## Expected UI Behavior

The manager should scan the table and know exactly who needs review.

Each row must have only one primary action.

If the manager cannot start a review, the UI must explain why in plain language.

## Acceptance Criteria

Pending tab does not show internal workflow state.

Pending tab does not show template version or assignment details.

Every disabled action has a visible reason.

Ready employees have a clear Start Review button.

---

# Phase 5: In Progress Reviews Module

## Scope

This phase redesigns the In Progress tab.

## Purpose

The In Progress tab should show reviews that have already started but are not completed.

## Required Columns

Employee

Review Name

Started On

Due Date

Current Step

Action

## Required Current Step Labels

Manager Review Pending

Waiting for Submission

Review Submitted

Overdue

## Required Actions

Continue

View

Send Reminder, only if applicable

## Current Problem

The current Active Reviews concept is too technical and may not clearly show what the manager must continue.

## Expected UI Behavior

The manager should know which review is pending and what next action is required.

The primary action should usually be Continue.

Secondary actions should be hidden under a menu where possible.

## Acceptance Criteria

In Progress replaces Active Reviews.

The manager sees only active work.

No workflow enum should be displayed directly.

Every row has one clear primary action.

---

# Phase 6: Completed Reviews Module

## Scope

This phase introduces or cleans up the Completed tab.

## Purpose

The Completed tab should provide simple history and audit-friendly access.

## Required Columns

Employee

Review Name

Completed On

Result or Status

Action

## Required Actions

View Summary

Download, if available

## Expected UI Behavior

The manager should be able to find completed reviews without mixing them with pending work.

Completed reviews should be read-only unless permissions allow otherwise.

## Acceptance Criteria

Completed reviews are separated from active work.

Completed tab does not distract the manager during daily review actions.

View Summary opens a clear read-only review summary.

---

# Phase 7: Review Forms Module

## Scope

This phase moves template-related functionality into Review Forms.

## Purpose

Review Forms should be treated as configuration, not daily manager work.

## Required Label

Review Forms

## Helper Text

Review forms decide what questions managers answer during a confirmation review.

## Required Actions

Create Review Form

View

Edit

## Current Problem

Template management is too prominent and makes the manager feel setup is required before every review.

## Expected UI Behavior

Managers should not need to touch Review Forms for normal review starting.

The system should auto-select the default review form where possible.

Review Forms should be available only when setup or correction is needed.

## Acceptance Criteria

Templates tab is renamed to Review Forms.

Review Forms is not the default tab.

Start Review flow does not force the manager to manually select a form every time.

---

# Phase 8: Start Review Button Behavior Module

## Scope

This phase improves the Start Review button behavior.

## Current Problem

Start Review may be disabled without explaining why.

This causes confusion because the manager does not know what to fix.

## Required Behavior

If review can be started, show Start Review as active.

If review cannot be started, show the reason near the button or on hover/click.

If review form is missing, show A review form is required before you can start reviews.

If employee is not ready, show This employee is not ready for confirmation review yet.

If review already exists, show Open Review instead of Start Review.

## Expected UI Behavior

The manager should never see a disabled button without explanation.

## Acceptance Criteria

Every disabled Start Review action explains the reason.

No backend error text is shown to the user.

The action label changes correctly based on review status.

---

# Phase 9: Default Review Form Selection Module

## Scope

This phase adds default review form behavior in the frontend first.

## Current Problem

The manager is asked to choose a template/review form even for a standard confirmation review.

## Required Behavior

The system should auto-select the default active confirmation review form.

If only one review form exists, select it automatically.

If multiple forms exist, select the configured default form.

If no form exists, block start with a clear message.

## Expected UI Behavior

The manager should not need to understand review forms to start a standard review.

## Acceptance Criteria

Start Review modal opens with review form already selected.

Manager can start review without manually selecting a form.

Missing review form condition is clearly explained.

---

# Phase 10: Start Review Modal Simplification Module

## Scope

This phase redesigns the Start Review modal.

## Current Problem

The modal asks for too many fields: template, review label, start date, and end date.

For a simple confirmation review, this creates unnecessary decision load.

## Required Default Modal

Title: Start Confirmation Review?

Body: This will start a confirmation review for the selected employee using the default review form.

Visible fields:

Employee

Review Form

Due Date

Buttons:

Cancel

Start Review

## Advanced Section

Add a collapsed link named Change review form or dates.

Inside advanced section, show:

Review Form

Review Name

Start Date

Due Date

## Expected UI Behavior

Normal users should only confirm and start.

Advanced users can change form or dates only when needed.

## Acceptance Criteria

Default modal is short and simple.

Advanced fields are collapsed by default.

Review name and dates are auto-filled.

Start Review button is clear and primary.

---

# Phase 11: Auto Review Name Module

## Scope

This phase adds automatic review name generation.

## Current Problem

Managers may not know what to enter as Review Name.

## Required Behavior

System should auto-generate review name using employee name, review type, and month or cycle context.

Example: Ben Thomas - Probation Review - Jun 2026

## Expected UI Behavior

Review Name should not be a mandatory decision for the manager.

The generated name should be editable only inside Advanced options.

## Acceptance Criteria

Review name auto-generates.

Manager can start review without entering a name.

Review name is still meaningful in In Progress and Completed tabs.

---

# Phase 12: Due Date Auto-Suggestion Module

## Scope

This phase adds due date auto-fill behavior.

## Current Problem

Managers may not know what date to choose.

## Required Behavior

Due date should be auto-suggested based on review type, employee joining date, probation policy, or configured default rule.

If no backend rule exists, use the existing available date logic and show it clearly.

## Expected UI Behavior

Due date should appear as information, not as a required manual decision.

## Acceptance Criteria

Due date auto-populates.

Manager can start review without manually selecting due date.

Advanced section allows date change only where permission allows.

---

# Phase 13: Start Review Success Flow Module

## Scope

This phase improves post-start behavior.

## Current Problem

After starting a review, the user may not clearly know what happened or where to go next.

## Required Behavior

After successful start, show success message: Review started for Ben Thomas.

Move the row from Pending to In Progress.

Show Open Review action.

Optionally open the review immediately if that is the expected flow.

## Expected UI Behavior

The manager should get immediate confirmation and a clear next action.

## Acceptance Criteria

Success toast is clear.

Pending list updates.

In Progress list updates.

Open Review action is visible after start.

---

# Phase 14: Empty States Module

## Scope

This phase adds helpful empty states for each tab.

## Pending Empty State

No employees are waiting for confirmation review right now.

Secondary text: Employees will appear here when they become eligible.

## Review Forms Empty State

No review form is available.

Secondary text: Create a review form before starting confirmation reviews.

Button: Create Review Form

## In Progress Empty State

No reviews are currently in progress.

## Completed Empty State

No completed reviews are available yet.

## Expected UI Behavior

Empty screens should guide the manager instead of looking broken.

## Acceptance Criteria

Every tab has a clear empty state.

Empty state explains what will happen next.

Missing review form empty state has a clear Create Review Form action.

---

# Phase 15: Error Message Rewrite Module

## Scope

This phase replaces technical errors with user-safe messages.

## Current Problem

Errors like No templateVersionId found or Employee not eligible are not useful for non-technical users.

## Required Error Mapping

No templateVersionId found should become A review form is missing. Please create or select a review form before starting this review.

Employee not eligible should become This employee is not ready for confirmation review yet.

Something went wrong should become We could not start the review. Please check the review form and try again.

Unauthorized should become You do not have permission to perform this action.

## Expected UI Behavior

Every error should explain what happened and what the manager can do next.

## Acceptance Criteria

No raw backend error is shown.

No technical ID is shown.

Errors are short, clear, and action-oriented.

---

# Phase 16: Status Chip Module

## Scope

This phase standardizes status chips across Confirmation Reviews.

## Required Status Chips

Ready

In Progress

Submitted

Completed

Blocked

Missing Form

Not Eligible Yet

Overdue

## Visual Direction

Ready should look positive.

In Progress should look active.

Submitted and Completed should look successful.

Blocked and Missing Form should look attention-needed.

## Expected UI Behavior

Managers should understand status at a glance.

## Acceptance Criteria

Status colors are consistent.

Status text is plain English.

No enum values are shown directly in the UI.

---

# Phase 17: Table Layout Cleanup Module

## Scope

This phase cleans up the visual layout of Pending, In Progress, and Completed tables.

## Required Layout Rules

Use full-width table or list layout.

Keep employee name and primary action easy to scan.

Show only necessary columns.

Hide secondary actions under a menu.

Avoid multiple competing buttons in the same row.

## Expected UI Behavior

The page should feel like a queue of work, not a configuration dashboard.

## Acceptance Criteria

Each row has one primary action.

Secondary actions are visually secondary.

The manager can scan the table quickly.

---

# Phase 18: Search and Filter Module

## Scope

This phase adds simple search and filters only after the main flow is clear.

## Required Filters

Department

Review Type

Status

Due Date

## Required Search

Search by employee name or employee code.

## Expected UI Behavior

Search and filters should help the manager find employees quickly without complicating the default view.

## Acceptance Criteria

Default view remains simple.

Filters are optional.

Search does not hide important blocked states without clear reset option.

---

# Phase 19: Review Continue Flow Module

## Scope

This phase improves the Continue action from In Progress.

## Required Behavior

Clicking Continue should take the manager directly to the next required review step.

If review is incomplete, open editable review form.

If review is submitted, open read-only view.

If required fields are missing, show field-level messages.

## Expected UI Behavior

Manager should not need to know workflow state.

The system should take the manager to the correct screen.

## Acceptance Criteria

Continue opens the correct review screen.

View opens read-only mode where applicable.

Submitted reviews cannot be edited unless permission allows.

---

# Phase 20: Manager Review Form Simplification Module

## Scope

This phase improves the actual review form screen.

## Required Behavior

Show employee summary at top.

Show review form questions clearly.

Show manager comments and rating fields as configured.

Show attachments only where needed.

Show Save Draft and Submit Review clearly.

## Expected UI Behavior

Manager should complete the review without understanding templates or workflow states.

## Acceptance Criteria

Review form uses simple section titles.

Mandatory fields are clearly marked.

Submit Review validates required fields.

Draft save does not force all required fields.

---

# Phase 21: Review Submission Confirmation Module

## Scope

This phase adds confirmation before final submit.

## Required Modal

Title: Submit Review?

Body: Once submitted, this review will be sent for completion and may become read-only.

Fields:

Employee

Review Name

Due Date

Buttons:

Cancel

Submit Review

## Expected UI Behavior

Manager understands the consequence before submitting.

## Acceptance Criteria

Submit confirmation appears before final submission.

Final submission gives clear success message.

Submitted review moves to Completed or Submitted status based on existing workflow.

---

# Phase 22: Permission-Aware UI Module

## Scope

This phase ensures the UI reflects manager permissions correctly.

## Required Behavior

Managers should see only employees they are allowed to review.

Managers should not see review form setup actions if they do not have permission.

Managers should not see edit actions for submitted or completed reviews unless allowed.

## Expected UI Behavior

The UI should avoid showing actions the manager cannot perform.

When an action is blocked, the reason should be clear.

## Acceptance Criteria

Unauthorized actions are hidden or disabled with reason.

UI permission behavior matches backend permission behavior.

No confidential or admin-only configuration is exposed in normal manager flow.

---

# Phase 23: Backend-Friendly Queue API Preparation Module

## Scope

This phase is optional for later backend improvement.

## Current Problem

Frontend may be inferring Pending, In Progress, Completed, and Blocked states from multiple APIs.

This can make UI logic messy.

## Recommended Backend Improvement

Create one manager-friendly queue API that returns pending, inProgress, completed, and blocked records.

Each record should include plain UI status, primary action, blocked reason, review form availability, due date, and review id if already started.

## Expected UI Behavior

Frontend should not need to understand internal workflow deeply.

Backend should send manager-ready queue data.

## Acceptance Criteria

Frontend receives grouped queue data.

Frontend displays plain status directly.

Blocked reason is returned in user-safe language or mapped cleanly.

---

# Phase 24: QA and UX Validation Module

## Scope

This phase validates the completed revamp.

## Test User

A first-time manager with minimum PMS/process knowledge.

## Success Test

User opens Confirmation Reviews.

User finds a ready employee.

User clicks Start Review.

User confirms start.

User opens the review.

User understands what is pending.

## Success Criteria

A first-time manager can start a review in under 30 seconds.

The manager does not need to understand templates.

Every disabled action explains why.

The page clearly answers who needs review, what is pending, and what to do next.

Review form setup is visible only when needed.

## Acceptance Criteria

No major confusion in start flow.

No technical language in daily manager flow.

No hidden dependency blocks the manager without explanation.

---

# Recommended Implementation Order

Start with Phase 1 to Phase 5 first.

Then complete Phase 8 to Phase 15.

After that, improve the review form itself using Phase 19 to Phase 21.

Keep backend queue API improvement for later unless the current frontend logic becomes too complex.

---

# Final Direction

The final UI should follow this mental model:

Here are the people who need confirmation review.

Click Start Review.

The system will choose the correct review form unless you need to change it.

This keeps the workflow simple for managers without weakening PMS rules underneath.
