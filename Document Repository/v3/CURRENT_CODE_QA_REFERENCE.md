# Current Code Q&A Reference

This note stores previous chat answers that describe mostly current PMS code behavior.

## Question 1: Cycle Launch Table Records

When you select users in `LaunchCycleAssignmentsModal` and click Launch, this happens:

1. For each selected employee, frontend calls:
   `POST /pms/cycles/:id/assign`

2. Backend creates one `annual_assignments` record per selected employee.

   Key fields:
   - `employeeId`
   - `assignedManagerId`
   - `cycleId`
   - `templateVersionId`
   - `annualState: DRAFT`
   - `finalDecisionStatus: DRAFT`
   - `applicableQuarters` / terms
   - employee, manager, org snapshots

3. Backend creates `quarter_assignments` records for that employee.

   Count depends on term type:
   - Quarterly: 4 records
   - Half-Yearly: 2 records
   - Yearly: 1 record

   Key fields:
   - `annualAssignmentId`
   - `cycleId`
   - `cycleQuarterId`
   - `employeeId`
   - `assignedManagerId`
   - `quarterCode` / term code
   - `quarterState: NOT_STARTED`

4. `annual_assignments.quarterAssignmentIds` is updated with the created term assignment IDs.

5. If the template has predefined objectives, the system may also create `objectives` records for quarter assignments.

6. Audit logs are created:
   - `PMS_EMPLOYEE_ASSIGNED`
   - `PMS_QUARTER_ASSIGNMENT_SEEDED_REVIEW_OPEN`, if seeded objectives advance workflow

7. After all assignments are created, frontend calls:
   `POST /pms/cycles/:id/launch`

8. Backend updates the `annual_cycles` record:
   - `DRAFT -> SCHEDULED`
   - `SCHEDULED -> ACTIVE`
   - sets `launchedAt`

9. Audit logs are created for cycle transition:
   - `PMS_CYCLE_SCHEDULED`
   - `PMS_CYCLE_LAUNCHED`

Crisp summary: launch creates `annual_assignments`, `quarter_assignments`, optionally `objectives`, audit logs, and updates the existing `annual_cycles` status to `ACTIVE`.

## Question 2: Objective Creation Flow After Cycle Launch

After launch, `quarter_assignments` already exist per employee per term.

Example:
- Quarterly: 4 `quarter_assignments`
- Half-Yearly: 2 `quarter_assignments`
- Yearly: 1 `quarter_assignment`

Each has:
- `cycleId`
- `cycleQuarterId`
- `annualAssignmentId`
- `employeeId`
- `assignedManagerId`
- `templateVersionId`
- `quarterCode` / `termCode`
- `quarterState`

### Employee Login Flow

Employee sees assignments from:

```text
GET /pms/objectives/assignments?mode=employee
```

Backend filters:

```text
quarter_assignments.employeeId = logged in user
```

When employee creates an objective:

```text
POST /pms/objectives
```

Creates record in:

```text
objectives
```

Captured fields:
- `quarterAssignmentId`
- `annualAssignmentId`
- `cycleId`
- `quarterCode`
- `employeeId`
- `assignedManagerId`
- `source: EMPLOYEE_CREATED`
- `title`
- `description`
- `targetMetric`
- `targetValue`
- `targetDate`
- `weightage`
- `successCriteria`
- `status: OBJECTIVE_DRAFT`
- `createdByRole`
- `createdByUserId`

Also may create:
- `objective_values`
- `objective_attachments`

Quarter assignment update:
- If `quarterState = NOT_STARTED`, it becomes `OBJECTIVE_SETTING_OPEN`
- Then employee-created objective creation can move it to `OBJECTIVE_DRAFT`
- On submit, quarter assignment moves to `OBJECTIVE_SUBMITTED`

### Manager Login Flow

Manager sees assignments from:

```text
GET /pms/objectives/assignments?mode=manager
```

Backend filters:

```text
quarter_assignments.assignedManagerId = logged in manager
```

Manager can create objectives and assign them to selected employee quarter assignments via:

```text
POST /pms/objectives/bulk-manager
```

This creates one `objectives` record for each selected `quarterAssignmentId`.

For manager-created objectives:
- `source: MANAGER_CREATED`
- `status: OBJECTIVE_APPROVED`
- `approvedAt` set immediately
- `approvedBy` set to manager/admin/delegate user

Captured fields are the same main objective fields:
- `quarterAssignmentId`
- `annualAssignmentId`
- `cycleId`
- `quarterCode`
- `employeeId`
- `assignedManagerId`
- `title`
- `description`
- `targetMetric`
- `targetValue`
- `targetDate`
- `weightage`
- `successCriteria`
- attachments / values if any

### Do We Update `quarter_assignments`?

Yes, but only workflow/status fields. We do not store objective IDs inside `quarter_assignments`.

Updated fields can include:
- `quarterState`
- `previousQuarterState`
- `lastTransitionAt`
- `lastTransitionBy`
- `lastTransitionRole`
- `lastTransitionReason`
- `updatedBy`
- `version`

The relationship is:

```text
objectives.quarterAssignmentId -> quarter_assignments._id
```

Other tables created or updated:
- `objectives`: main objective records
- `objective_values`: custom/template field values
- `objective_attachments`: uploaded attachment metadata
- `objective_comments`: comments/return reasons
- `workflow_events`: quarter assignment state transitions
- `audit_logs`: objective and workflow audit trail
- `pms_manager_objective_libraries`: if manager saves reusable objective library drafts

Crisp summary: objective creation creates `objectives`, optionally `objective_values` and `objective_attachments`; manager bulk assignment creates objectives against selected `quarter_assignments`; `quarter_assignments` is updated only for workflow state, not to store objective data.

## Question 3: Predefined Objectives And Quarter Assignments

No. We do not create a new `quarter_assignments` record for each objective.

The structure is:

```text
annual_assignments
  1 per employee per cycle

quarter_assignments
  1 per employee per assessment term
  Example:
    Quarterly = 4 records
    Half-Yearly = 2 records
    Yearly = 1 record

objectives
  many objectives can belong to the same quarter_assignment
```

Relationship:

```text
quarter_assignments._id
        |
        v
objectives.quarterAssignmentId
```

So if one employee has a Q1 `quarter_assignment`, and the template has 3 predefined objectives for Q1, then:

```text
quarter_assignments
  Q1 assignment = 1 record

objectives
  predefined objective 1 = 1 record
  predefined objective 2 = 1 record
  predefined objective 3 = 1 record
```

All 3 objectives point to the same `quarterAssignmentId`.

Answer:
- `quarter_assignments` are created during employee assignment to cycle.
- `objectives` are created under existing `quarter_assignments`.
- Predefined objectives do not create more `quarter_assignments`.
- Multiple objectives can map to one `quarter_assignment`.

## Question 4: Does `quarter_assignments` Store Predefined Objective Details?

During assignment/launch, the system creates:

```text
annual_assignments
  1 record per employee per cycle
```

and based on term type:

```text
quarter_assignments
  Quarterly   = 4 records
  Half-Yearly = 2 records
  Yearly      = 1 record
```

Each `quarter_assignments` record stores assignment-level mapping fields like:

```text
annualAssignmentId
cycleId
cycleQuarterId
employeeId
assignedManagerId
templateVersionId
quarterCode / termCode
quarterState
```

So yes: `quarter_assignments` stores the `templateVersionId`, but it does not store predefined objective details inside itself.

Predefined objectives are stored separately in the `objectives` table.

If the selected template version contains predefined objectives, then after creating the `quarter_assignments`, backend reads the template version and creates objective records like:

```text
objectives
  quarterAssignmentId
  annualAssignmentId
  cycleId
  templateVersionId
  employeeId
  assignedManagerId
  source: PREDEFINED
  isPredefined: true
  templateObjectiveKey
  title
  description
  targetMetric
  targetValue
  weightage
  successCriteria
  status: OBJECTIVE_APPROVED
```

Relationship:

```text
quarter_assignments._id
        |
        v
objectives.quarterAssignmentId
```

Example:

If employee has a Q1 assignment and the template has 3 predefined objectives for Q1:

```text
quarter_assignments
  Q1 = 1 record

objectives
  Objective 1 = 1 record, points to Q1 quarterAssignmentId
  Objective 2 = 1 record, points to Q1 quarterAssignmentId
  Objective 3 = 1 record, points to Q1 quarterAssignmentId
```

Final answer:

`quarter_assignments` stores `templateVersionId` and assignment/workflow info only. Predefined objective actual data is stored in `objectives`, linked back by `quarterAssignmentId`.

## Question 5: How Do We Show Respective Employee Objectives?

We show the respective employee objectives by using `quarterAssignmentId` as the main link.

Flow:

```text
Login user
  |
  v
GET /pms/objectives/assignments?mode=employee or manager
  |
  v
Backend finds matching quarter_assignments
  |
  v
Backend finds objectives where:
objectives.quarterAssignmentId IN matching quarter_assignment ids
  |
  v
Frontend shows those objectives inside that employee/quarter card
```

For employee login:

```text
quarter_assignments.employeeId = logged in employee id
```

So employee only gets their own quarter assignments. Then objectives are loaded for those assignment IDs.

For manager login:

```text
quarter_assignments.assignedManagerId = logged in manager id
```

So manager gets employees assigned to that manager. Then objectives are loaded for those employees' quarter assignments.

All objective types come from the same table:

```text
objectives
```

They are differentiated by `source`:

```text
PREDEFINED        = from template
EMPLOYEE_CREATED  = created by employee
MANAGER_CREATED   = created by manager
```

Important point:

Predefined objectives are not shown directly from the template at UI time. They are first created/seeded as rows in `objectives`, linked to the employee's `quarterAssignmentId`.

Example:

```text
Employee A
  Q1 quarter_assignment id = QA001

objectives table:
  Obj 1 -> quarterAssignmentId QA001, source PREDEFINED
  Obj 2 -> quarterAssignmentId QA001, source MANAGER_CREATED
  Obj 3 -> quarterAssignmentId QA001, source EMPLOYEE_CREATED
```

Frontend receives:

```text
assignment QA001
  objectives: [Obj 1, Obj 2, Obj 3]
```

Then UI labels them as:

```text
PREDEFINED        -> Predefined / Template Seed
EMPLOYEE_CREATED  -> Employee Created
MANAGER_CREATED   -> Manager Created
```

Crisp summary: respective employee objectives are shown by filtering `quarter_assignments` for the logged-in employee/manager, then fetching all `objectives` linked to those `quarterAssignmentId`s. Predefined, manager-created, and employee-created objectives all come from `objectives.source`.
