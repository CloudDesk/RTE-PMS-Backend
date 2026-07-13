**UI Revamp Report**
Objective: make the Manager-Initiated / Confirmation Review workflow usable by a Technical Diploma holder with minimal PMS/process knowledge.

**1. Problem Statement**
The current UI exposes the internal PMS architecture too directly. A manager is asked to think in terms of `employees`, `templates`, `active reviews`, `review labels`, date windows, and workflow states before understanding the simple task:

> “Which employee needs a review, and what action should I take?”

This makes the system feel complex even if the business workflow is reasonable. The UI should reduce decision load, hide configuration unless needed, and guide users through one clear action at a time.

**2. Target User**
Primary user:

- Technical Diploma holder
- First-line manager / team lead
- May not understand HR terminology deeply
- May not know PMS template/version concepts
- Wants to complete required reviews quickly
- Needs clear action labels, visible next steps, and simple confirmation messages

Design assumption:

> The user should not need training to start and complete a confirmation review.

**3. Current UI Issues**
**Issue A: Tabs Are System-Centric**

Current tabs:

- Employees
- Templates
- Active Reviews

These are data categories, not user tasks. A non-technical manager may wonder:

- “Do I start from Employees or Active Reviews?”
- “Why do I need Templates?”
- “What is the difference between starting and launching?”

Recommended replacement:

- `To Start`
- `In Progress`
- `Submitted`
- `Settings`

Or even simpler:

- `Pending Reviews`
- `Ongoing Reviews`
- `Completed Reviews`

**Issue B: Template Management Is Too Prominent**

Templates are important internally, but for a manager they should usually be invisible.

Current problem:

- `Start Review` is disabled if no template exists.
- User may not understand why.
- Templates appear as a main tab, making setup feel mandatory.

Recommended behavior:

- Auto-select the default confirmation review template.
- Move templates under `Settings` or `Review Formats`.
- Show template only in advanced options.
- If no template exists, show a clear message:
  > “A review form is required before you can start reviews.”
  Button: `Create Review Form`

**Issue C: “Launch Review” Is Technical Language**

“Launch” sounds like a system operation. For this user group, use plain operational language.

Replace:

- `Launch Review` → `Start Review`
- `Template` → `Review Form`
- `Review label` → `Review Name`
- `Active Reviews` → `In Progress`
- `Eligible Employees` → `Employees Ready for Review`

**Issue D: Too Many Inputs in Start Modal**

Current `Start Review` modal asks for:

- Template
- Review label
- Start date
- End date

For a simple confirmation review, this is too much.

Recommended default flow:

1. User clicks `Start Review`
2. Modal shows employee name and selected review form
3. User clicks `Confirm Start`

Advanced fields should be collapsed:

- Review form
- Review name
- Start/end dates

Default values should be auto-filled.

**4. Proposed New Information Architecture**
**Main Page: Confirmation Reviews**

Header:

> Confirmation Reviews  
> Start and track intern, fresher, trainee, probation, and junior employee reviews.

Primary tabs:

1. `Pending`
2. `In Progress`
3. `Completed`
4. `Review Forms`

Recommended default tab: `Pending`

**Pending Tab**

Purpose: show employees who need action.

Columns:

- Employee
- Department
- Joining Date
- Review Type
- Status
- Action

Example row:

| Employee | Department | Joining Date | Review Type | Status | Action |
|---|---|---|---|---|---|
| Ben Thomas | Engineering | 12 May 2026 | Probation Review | Ready | Start Review |

Status labels should be plain:

- `Ready`
- `Already Started`
- `Missing Review Form`
- `Not Eligible Yet`

Avoid PMS jargon like:

- workflow state
- version
- assignment
- currentVersion
- visibilityScope

**In Progress Tab**

Purpose: show reviews that have already started.

Columns:

- Employee
- Review Name
- Started On
- Due Date
- Current Step
- Action

Actions:

- `Continue`
- `View`
- `Send Reminder` if applicable

Current Step examples:

- `Manager Review Pending`
- `Waiting for Submission`
- `Review Submitted`

**Completed Tab**

Purpose: history and audit-friendly access.

Columns:

- Employee
- Review Name
- Completed On
- Result / Status
- Action

Actions:

- `View Summary`
- `Download` if available

**Review Forms Tab**

Purpose: configuration, not daily work.

Rename `Templates` to `Review Forms`.

Actions:

- `Create Review Form`
- `View`
- `Edit`

Add helper text:

> Review forms decide what questions managers answer during a confirmation review.

**5. Recommended User Flow**
**Happy Path: Start a Review**

1. Manager opens `Confirmation Reviews`
2. Lands on `Pending`
3. Sees employees ready for review
4. Clicks `Start Review`
5. Confirmation modal opens:

Title:

> Start Confirmation Review?

Body:

> This will start a confirmation review for Ben Thomas using the default review form.

Fields shown:

- Employee: Ben Thomas
- Review Form: Probation Confirmation Review
- Due Date: 30 Jun 2026

Buttons:

- `Cancel`
- `Start Review`

Advanced link:

> Change review form or dates

After start:

- Show success message:
  > Review started for Ben Thomas.
- Move row to `In Progress`
- Button: `Open Review`

**6. Empty States**
Empty states are important for low-training users.

**No Pending Employees**

> No employees are waiting for confirmation review right now.

Secondary text:

> Employees will appear here when they become eligible.

**No Review Forms**

> No review form is available.

Secondary text:

> Create a review form before starting confirmation reviews.

Button:

> Create Review Form

**No In Progress Reviews**

> No reviews are currently in progress.

**7. Copywriting Guidelines**
Use simple, direct language.

Avoid:

- launch
- assignment
- workflow
- template version
- current version
- visibility scope
- initiated
- eligibility rule
- active assignment

Use:

- start
- review
- review form
- ready
- in progress
- completed
- employee
- due date
- manager comments

Examples:

- `Eligible Employees` → `Employees Ready for Review`
- `Start Review` → keep, good
- `Launch review` → `Start Review`
- `Manager Initiated Review` → `Confirmation Review`
- `Template` → `Review Form`
- `Active Reviews` → `Reviews In Progress`

**8. Visual Design Recommendations**
The UI should feel like a work queue, not an admin console.

Recommended layout:

- Full-width table/list
- Clear status chips
- One primary action per row
- Secondary actions hidden under menu if needed
- Avoid showing configuration data in daily workflow
- Avoid multiple competing buttons

Status chip colors:

- `Ready`: blue or green
- `In Progress`: amber
- `Submitted`: green
- `Blocked`: red
- `Missing Form`: red/amber

**9. Permission and Error Handling**
Errors should explain what the user can do next.

Bad:

> No templateVersionId found.

Good:

> A review form is missing. Please create or select a review form before starting this review.

Bad:

> Employee not eligible.

Good:

> This employee is not ready for confirmation review yet.

Bad:

> Something went wrong.

Better:

> We could not start the review. Please check the review form and try again.

**10. Implementation Priorities**
**Phase 1: Quick UX Wins**

- Rename labels:
  - `Templates` → `Review Forms`
  - `Active Reviews` → `In Progress`
  - `Eligible Employees` → `Employees Ready for Review`
  - `Launch review` → `Start Review`
- Add clear message when no template/review form exists.
- Change disabled `Start Review` button behavior to show reason.
- Auto-select default review form.
- Hide advanced modal fields unless expanded.

**Phase 2: Workflow Restructure**

- Replace tabs with:
  - `Pending`
  - `In Progress`
  - `Completed`
  - `Review Forms`
- Move template management away from the first decision point.
- Add review status labels in plain English.
- Show only one primary action per employee.

**Phase 3: Guided Experience**

- Add default review form logic.
- Auto-generate review name.
- Auto-suggest due date.
- Add “Open Review” after successful start.
- Add better empty states and blocked-state messages.

**11. Success Criteria**
The revamp is successful if:

- A first-time manager can start a review in under 30 seconds.
- User does not need to understand templates to start a standard review.
- Every disabled action explains why.
- The page clearly answers:
  - Who needs review?
  - What is pending?
  - What should I do next?
- Template/review-form setup is visible only when needed.

**12. Recommended Final Direction**
The UI should be redesigned around this mental model:

> “Here are the people who need confirmation review. Click Start Review. The system will choose the correct form unless you need to change it.”

That one shift will make the workflow feel much simpler without weakening the actual PMS rules underneath.