
So now you have the full baseline chain:

1. **CURRENT_PMS_IMPLEMENTATION_TRUTH.md**
2. **CURRENT_PMS_IMPLEMENTATION_SUMMARY.md**
3. **CURRENT_PMS_GAP_AND_RISK_ACTION_LIST.md**

This is enough to start PMS v2.1 planning.

## My recommendation now

Before giving implementation prompts, first prepare one clear **PMS v2.1 Change Understanding / Addendum** based on client corrections.

Because your current baseline says **employee self-review is not implemented** and static communication is used now. The new client feedback changes the product direction, so we should not directly ask Codex to implement without a change addendum.

## What to do next

Now we should define PMS v2.1 like this:

### v2.1 Core Change Areas

1. **Assessment term configuration**

   * Current: annual cycle with Q1-Q4 quarter assignments.
   * New: support Quarterly / Half-Yearly / Yearly assessment terms.
   * Final appraisal decision still yearly only.

2. **Review mode configuration**

   * Mode 1: Manager Review Only.
   * Mode 2: Employee Self Review + Manager Review.
   * For Mode 2:

     * employee data and manager data must be stored separately.
     * manager cannot edit employee input.
     * manager rating mode can be overall-only or section-wise.

3. **Template permission/config changes**

   * Template should control who fills which section.
   * Employee self-review fields: rating, comments, attachments.
   * Manager review fields: rating, comments, attachments.
   * Manager scoring mode configurable at template level.

4. **Objective creation control**

   * Employee objective creation should be configurable.
   * Manager objective creation should be configurable.
   * Manager-created objectives remain auto-approved.

5. **Manager bulk objective assignment**

   * Manager can assign same objective to selected employees.
   * Manager cannot change employee-wise weightage during bulk assign.

6. **SLA email notification**

   * Existing SLA is partial.
   * Need decide whether to fix scheduler/email as part of v2.1 or keep manual trigger first.

7. **UI improvement**

   * Improve active screens only.
   * Do not work on hidden/stale screens unless required.

## Important warning

Do **not** start with self-review implementation first.

Start with architecture/design addendum first, because self-review touches:

* template builder
* assignment model
* review model
* workflow state
* permissions
* UI rendering
* manager review
* annual decision rollup
* visibility
* reports/dashboard

