## Issue 1:

Manager Objective Builder current logic is like this:

**Purpose**
This is a manager-side objective library. Manager first creates/saves objectives here, then assigns one or more saved objectives to employee assignment records later.

**Step 1: Create / Save Manager Objective**
In `Manager Objective Builder`, manager can create objective drafts and save them into a local manager objective library.

Saved objective contains normal manager-created objective data like:

- title
- description
- priority
- expected outcome
- objective values / fields
- source = `MANAGER_CREATED`

This is not directly assigned when saved. It is only stored for later assignment.

**Step 2: Assign Objective**
When manager clicks `Assign` or `Assign All Objectives`, the second modal opens: `Assign Objective to Employees`.

This modal shows employee cycle/term assignment records and checks which ones are eligible.

A record is assignable only if all are true:

- current page mode is `manager`
- template allows manager-created objectives: `objectiveConfig.allowManagerCreated`
- assignment term state is in manager objective creation state
- objective setting window is open
- same selected manager objective is not already assigned to that record

**Why your screenshot says `0 assignable`**
In the screenshot, employee Ben’s record is:

`DEV TEST Q · Q1 · Objective Approved`

That is not objective setting open. Code blocks manager objective assignment outside objective setting. So the UI correctly says:

- `Not in objective setting`
- `0 assignable`

Manager-created objectives can be assigned only during objective setting stage, not after objective approval.

**Duplicate Protection**
If the selected objective title already exists as a manager-created objective on that assignment, it blocks assignment and says already assigned. It compares normalized objective titles.

**Filters**
Assignment modal supports filtering by:

- employee search
- cycle
- term
- status
- All / Assignable tab

The `Assignable` tab shows only records passing the eligibility rules.

**Assign Submit**
When manager clicks `Assign Objective`, FE sends:

`selectedAssignAssignments + assigningObjectiveDrafts`

to:

`pmsObjectivesApi.bulkAssignManagerObjectives(...)`

Payload forces:

```ts
source: "MANAGER_CREATED"
priority: objective.priority || "MEDIUM"
```

After response:

- success count shown
- failed records kept selected
- failed objective drafts remain in modal
- workspace refreshes

**Business Meaning**
This is correct if the rule is:

Manager-created objectives must be added only during objective setting. Once objective setting is closed / approved, manager cannot add new manager objectives to that assignment.

So your test record showing `Objective Approved` will not allow assignment. To test assign button, pick a record where term state is `Objective Setting Open` and current date is inside objective setting window.


---

Current behavior should be:

`Remove` in **Manager Objective Builder** removes that objective only from the manager’s saved objective library/list.

It should **not delete objectives already assigned to employees**. Once assigned, it becomes a real employee term objective record, so we should keep it for audit/history and avoid breaking active employee objective flows.

Best UX naming:

- Change `Remove` to `Remove from library`
- Show confirmation:
  “This removes the saved objective from your library only. Already assigned employee objectives will remain.”
- After remove, that objective will not be available for future bulk assignment.

If we need to remove already assigned objectives, that should be a separate action like `Unassign from employees`, with rules:

- Only manager-created objectives
- Only while objective setting is still open
- Not after employee submitted / manager approved / achievement started
- Must write audit log


## Issue 2


Checked. Current behavior is **not ideal** for the workflow you described.

In backend, terms are first created as `NOT_STARTED`, but immediately after predefined objectives are seeded, every seeded term is moved to `OBJECTIVE_SETTING_OPEN` without checking current date/window:

- Created as `NOT_STARTED`: [assignment.service.ts](/Users/sureshkumar/Documents/GitHub/RTE-PMS/Server/src/services/assignment.service.ts:1191)
- All seeded terms forced to `OBJECTIVE_SETTING_OPEN`: [assignment.service.ts](/Users/sureshkumar/Documents/GitHub/RTE-PMS/Server/src/services/assignment.service.ts:1334)

So yes, that is why Q1, Q2, Q3, Q4 and H1, H2 all show `Objective Setting Open`.

Correct approach: only the term whose objective-setting window is active should be `Objective Setting Open`. Future terms should stay `NOT_STARTED`, but UI can label it as `Scheduled` or `Not started`. I would avoid calling it `Draft` because draft is already used for objective records.

Example:

- Quarterly cycle, current date in Q1 objective-setting window:
  - Q1: `Objective Setting Open`
  - Q2/Q3/Q4: `Scheduled`
- Half-yearly cycle, current date in H1 objective-setting window:
  - H1: `Objective Setting Open`
  - H2: `Scheduled`

Predefined objectives can still be seeded for all applicable terms, but term workflow state should not be opened for future terms. Then manager bulk assign and employee actions become clean because they depend on the real active term state, not every future term looking open.

No, we should **not allow objective setting for the whole term/window lifecycle**.

For each term, action should follow the configured workflow windows:

| Current date is in | Term state should become | What user can do |
|---|---|---|
| Before objective setting window | `NOT_STARTED` / UI `Scheduled` | View only |
| Objective setting window | `OBJECTIVE_SETTING_OPEN` | Employee/manager can create/edit objectives |
| Objective approval window | `OBJECTIVE_SETTING_OPEN` until manager closes/approves, then `OBJECTIVE_APPROVED` | Manager can approve/return/close |
| Achievement submission window | `EMPLOYEE_ACHIEVEMENT_OPEN` | Employee submits achievement |
| Manager review window | `MANAGER_REVIEW_OPEN` | Manager rates/reviews |
| Finalization window | `TERM_FINALIZED` after submit/finalize | Finalization/readonly |

So if current date is **after Q1 objective setting window**, we should not keep Q1 open for creating objectives. It should be in the next valid state depending on what has happened:

- If objectives are not approved yet and date is in approval window: manager can approve pending employee objectives, but employee/manager should not create new ones.
- If all objectives are approved and achievement window started: move to `EMPLOYEE_ACHIEVEMENT_OPEN`.
- If required approvals are missing: keep it blocked/pending approval, not silently open objective creation.

Best rule:

`Objective Setting Open` means only “objective creation/editing is allowed now”, not “this term exists”.

For future terms, keep `NOT_STARTED`. For past terms, move forward by workflow sync or explicit manager/admin close. This keeps Q1/Q2/Q3/Q4 clean and avoids everyone editing objectives outside the right dates.






## Issue 3


Yes, if the template is meant for the normal PMS appraisal flow, every custom template should have a **Manager Review** section by default.

Reason: the cycle workflow includes `MANAGER_REVIEW_OPEN`, and final score/review submission needs at least one manager-submittable field. Without it, the template can create objectives and achievements, but manager cannot complete the assessment-term review properly.

Best default for custom template:

- `Objectives` section
- `Employee Achievement` section
- `Manager Review` section
  - `Manager Rating`
  - `Manager Comments`
- Optional `Annual Decision` / visibility sections depending on template type

For UX, when user creates a blank custom template, we should auto-add a simple Manager Review section instead of letting them reach activation and fail. Keep it clean, but mandatory.

Yes, correct approach.

For **custom templates**:
- Auto-add a default `Manager Review` section.
- Do not allow deleting that section.
- Keep fields simple by default:
  - `Manager Rating`
  - `Manager Comments`
- User can edit labels/options if needed, but should not remove the whole manager-review capability.

For **starter/predefined templates**:
- Also hide/disable delete for the mandatory `Manager Review` section.
- Same reason: activation and actual review flow depend on manager-submittable fields in `MANAGER_REVIEW_OPEN`.

What can still be editable:
- Field labels
- Rating options
- Required/optional setting
- Section title maybe

What should be protected:
- Manager Review section deletion
- Removing all manager-editable fields from that section
- Removing `MANAGER_REVIEW_OPEN` manager edit permission from all fields



----

