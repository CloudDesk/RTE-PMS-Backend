This flow is using MongoDB collections, not SQL tables. The main collections involved are:

- `annual_cycles`
- `quarter_cycles`
- `annual_assignments`
- `quarter_assignments`
- `objectives`
- `pms_template_versions`
- `audit_logs`

The behavior comes from [cycle.service.ts](/Users/sureshkumar/Documents/GitHub/RTE-PMS/Server/src/services/cycle.service.ts:226), [assignment.service.ts](/Users/sureshkumar/Documents/GitHub/RTE-PMS/Server/src/services/assignment.service.ts:243), and the model files for those collections.

**1. When you click New, enter data, and Save Draft, what record is added?**

If it is a brand-new cycle, `Save Draft` creates:

- `annual_cycles`: 1 record
- `quarter_cycles`: 4 records, one for `Q1` to `Q4`
- `audit_logs`: 1 record for cycle creation

What gets stored:

- In `annual_cycles`
  - cycle name
  - cycle code
  - start/end date
  - `status = DRAFT`
  - selected `templateVersionId`
  - appraisal window config
  - communication config
  - references to the 4 quarter cycle ids

- In `quarter_cycles`
  - one row/doc for `Q1`, `Q2`, `Q3`, `Q4`
  - each has its own dates and windows
  - each starts with quarter status like `NOT_STARTED`

Important:
- `Save Draft` does **not** create employee assignments.
- So at draft-save time, nothing goes into:
  - `annual_assignments`
  - `quarter_assignments`
  - `objectives`

If you click `Save Draft` again on an existing draft:
- it updates the same `annual_cycles` record
- it updates the same `quarter_cycles` records
- it adds another `audit_logs` entry for update

**2. If you launch, what happens? What happens to the cycle table/collection?**

Launch does **not** create a new cycle record.

It uses the existing `annual_cycles` record and changes its status.

Launch flow in your UI is actually 2 parts:

1. save the cycle first
2. assign employees in the launch modal
3. then call launch

When actual launch runs:

- `annual_cycles`
  - same existing record is updated
  - if status is `DRAFT`, it first moves to `SCHEDULED`
  - then it moves to `ACTIVE`
  - `launchedAt` is set

- `audit_logs`
  - one audit entry for `PMS_CYCLE_SCHEDULED` if it was draft
  - one audit entry for `PMS_CYCLE_LAUNCHED`

So if your cycle was draft before launch, usually you will see:

- `annual_cycles`: update existing row/doc
- `audit_logs`: 2 new rows/docs
  - scheduled
  - launched

Launch is blocked if there are no assignments. The backend explicitly checks that the cycle has at least one `annual_assignments` record and matching `quarter_assignments`.

So launch alone does not create assignments. Assignments must exist first.

**3. Launch assignment flow in detail**

Example:
- you selected one cycle
- that cycle has template version `T1`
- you assign Employee 1
- manager is User/Employee id `9`
- applicable quarters are default `Q1, Q2, Q3, Q4`

What happens:

**Step A: cycle already exists**
If this is the first save, these already exist:

- `annual_cycles`: 1 doc
- `quarter_cycles`: 4 docs

The cycle stores the selected template version at cycle level.

**Step B: in launch modal, when you add Employee 1 and manager 9**
The UI calls `/pms/cycles/:id/assign` once per employee.

That creates:

- `annual_assignments`: 1 doc
- `quarter_assignments`: 4 docs
- `objectives`: maybe many docs, depending on template predefined objectives
- `pms_template_versions`: updates the selected template version to locked
- `audit_logs`: 1 assignment audit entry

**Exactly what is inserted**

1. `annual_assignments`  
One record is created for Employee 1.

Key fields:
- `employeeId = Employee 1`
- `assignedManagerId = 9`
- `cycleId = selected cycle id`
- `templateVersionId = cycle.templateVersionId`
- `annualState = DRAFT`
- `finalDecisionStatus = DRAFT`
- `applicableQuarters = [Q1,Q2,Q3,Q4]`
- `assignmentReason = FULL_YEAR` unless you changed it
- employee snapshot
- manager snapshot
- org snapshot

So this is the parent assignment for that employee in that cycle.

2. `quarter_assignments`  
One record per applicable quarter is created.

For full year:
- 4 docs created:
  - Employee 1 + Q1
  - Employee 1 + Q2
  - Employee 1 + Q3
  - Employee 1 + Q4

Each contains:
- `annualAssignmentId`
- `cycleId`
- `cycleQuarterId`
- `employeeId`
- `assignedManagerId = 9`
- `templateVersionId`
- `quarterCode`
- `quarterState = NOT_STARTED`

3. `objectives`  
If the selected template version has predefined objectives, they are seeded here.

That means:
- for each quarter assignment
- predefined template objectives are inserted into `objectives`

So if template has:
- 3 predefined objectives for each quarter

Then for 4 quarter assignments:
- `objectives`: 12 docs created

If the template has no predefined objectives:
- `objectives`: 0 new docs

4. `pms_template_versions`
The selected template version is locked:

- `isLocked = true`
- `lockedAt = now`

So once assignments start using that template version, backend locks it.

5. `audit_logs`
One audit row/doc is added for:
- `PMS_EMPLOYEE_ASSIGNED`

**Then Step C: final Launch button**
After assignments are created, the UI calls `/pms/cycles/:id/launch`.

That does:

- `annual_cycles`
  - update same cycle record
  - `status: DRAFT -> SCHEDULED -> ACTIVE`
  - `launchedAt = now`

- `audit_logs`
  - add `PMS_CYCLE_SCHEDULED`
  - add `PMS_CYCLE_LAUNCHED`

No new `annual_assignments` or `quarter_assignments` are created during this final launch call itself. Those were already created in the assignment step.

**Collection-by-collection summary**

If you want to clear old data before testing this one employee flow, these are the collections touched:

For `Save Draft` on a new cycle:
- `annual_cycles`
- `quarter_cycles`
- `audit_logs`

For employee assignment in launch modal:
- `annual_assignments`
- `quarter_assignments`
- `objectives` (only if predefined objectives exist in template)
- `pms_template_versions` (`isLocked` change)
- `audit_logs`

For final launch:
- `annual_cycles` (status update only)
- `audit_logs`

**Very short answer**

1. `Save Draft` on a new cycle inserts into:
- `annual_cycles`
- `quarter_cycles`
- `audit_logs`

2. Launch does not create a new cycle row/doc. It updates the same `annual_cycles` record to active, and writes `audit_logs`.

3. Launch assignment for Employee 1, Manager 9:
- creates 1 `annual_assignments`
- creates 4 `quarter_assignments` if full year
- seeds `objectives` if template has predefined objectives
- locks the template in `pms_template_versions`
- then launch updates `annual_cycles`

If you want, I can give you a ready-made “delete order” for these collections so you can clear old PMS cycle test data safely without breaking references.