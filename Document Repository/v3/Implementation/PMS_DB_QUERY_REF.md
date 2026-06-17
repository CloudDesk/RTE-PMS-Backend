# PMS MongoDB Query Reference

Use this document to verify PMS data across template creation, cycle launch, assignment, objective setting, achievement submission, manager review, admin workflow override, and final annual decision.

Set these variables first in Mongo shell or Compass playground:

```js
const templateId = ObjectId("TEMPLATE_ID");
const templateVersionId = ObjectId("TEMPLATE_VERSION_ID");
const cycleId = ObjectId("CYCLE_ID");
const annualAssignmentId = ObjectId("ANNUAL_ASSIGNMENT_ID");
const quarterAssignmentId = ObjectId("QUARTER_ASSIGNMENT_ID");
const employeeId = ObjectId("EMPLOYEE_ID");
const managerId = ObjectId("MANAGER_ID");
const termCode = "Y1"; // Q1, Q2, Q3, Q4, H1, H2, or Y1
```

## 1. Template, Cycle, Assignment

```js
db.pms_templates.find({ _id: templateId });

db.pms_template_versions.find({
  _id: templateVersionId,
  templateId
});

db.annual_cycles.find({
  _id: cycleId,
  isDeleted: false
});

db.quarter_cycles.find({
  cycleId,
  isDeleted: false
}).sort({ quarterCode: 1 });

db.annual_assignments.find({
  cycleId,
  isDeleted: false
}).sort({ createdAt: 1 });

db.quarter_assignments.find({
  cycleId,
  isDeleted: false
}).sort({ employeeId: 1, quarterCode: 1 });
```

Expected:

- Template and template version are `ACTIVE`.
- Template version has `isLocked: true` after activation or assignment.
- Cycle status is `ACTIVE` after launch.
- One `annual_assignments` record exists per assigned employee.
- `quarter_assignments` records exist for each applicable term.

## 2. Employee / Manager Objectives

```js
db.quarter_assignments.find({
  _id: quarterAssignmentId,
  annualAssignmentId,
  quarterCode: termCode,
  isDeleted: false
});

db.objectives.find({
  annualAssignmentId,
  quarterAssignmentId,
  isDeleted: false
}).sort({ objectiveNo: 1, createdAt: 1 });

db.objective_values.find({
  annualAssignmentId,
  quarterAssignmentId,
  isDeleted: false
});

db.objective_comments.find({
  annualAssignmentId,
  quarterAssignmentId,
  isDeleted: false
}).sort({ createdAt: 1 });
```

Expected:

- Employee-created objective: `source: "EMPLOYEE_CREATED"`.
- After employee submits: `status: "OBJECTIVE_SUBMITTED"`.
- After manager approves: `status: "OBJECTIVE_APPROVED"`.
- Manager-created objective: `source: "MANAGER_CREATED"` and `status: "OBJECTIVE_APPROVED"`.

After admin workflow sync override from objective approved:

```js
db.quarter_assignments.find({
  _id: quarterAssignmentId
});
```

Expected:

```js
quarterState: "EMPLOYEE_ACHIEVEMENT_OPEN"
```

Check workflow and audit trail:

```js
db.workflow_events.find({
  quarterAssignmentId
}).sort({ createdAt: 1 });

db.audit_logs.find({
  assignmentId: annualAssignmentId.toString()
}).sort({ timestamp: 1 });
```

## 3. Employee Achievement Submission

```js
db.employee_achievement_submissions.find({
  annualAssignmentId,
  quarterAssignmentId,
  isDeleted: false
});
```

Expected after employee submits:

```js
status: "SUBMITTED" // or "LOCKED"
submittedAt: { $exists: true }
achievementItems: { $ne: [] }
```

After admin workflow sync override:

```js
db.quarter_assignments.find({
  _id: quarterAssignmentId
});
```

Expected:

```js
quarterState: "MANAGER_REVIEW_OPEN"
```

## 4. Manager Review

```js
db.quarter_reviews.find({
  annualAssignmentId,
  quarterAssignmentId,
  isDeleted: false
});

db.quarter_review_values.find({
  annualAssignmentId,
  quarterAssignmentId,
  isDeleted: false
});
```

Expected:

```js
reviewStatus: "MANAGER_REVIEW_OPEN"
// then after submit:
reviewStatus: "MANAGER_REVIEW_SUBMITTED"
```

After admin workflow sync override/finalization:

```js
db.quarter_assignments.find({
  _id: quarterAssignmentId
});
```

Expected:

```js
quarterState: "QUARTER_FINALIZED"
```

## 5. Final Annual Decision

```js
db.annual_assignments.find({
  _id: annualAssignmentId,
  isDeleted: false
});

db.annual_decisions.find({
  annualAssignmentId,
  isDeleted: false
});

db.annual_decision_values.find({
  annualAssignmentId,
  isDeleted: false
});
```

Expected:

- `annual_assignments.annualState` moves through annual decision states.
- `annual_decisions.decisionStatus` starts as `DRAFT`.
- After submit/freeze, check `submittedAt`, `submittedBy`, `frozenAt`, and `frozenBy`.
- Dynamic decision values are stored in `annual_decision_values`.

## Full Assignment Trace

Use this group when checking one employee assignment end to end:

```js
db.annual_assignments.find({ _id: annualAssignmentId });

db.quarter_assignments.find({
  annualAssignmentId
}).sort({ quarterCode: 1 });

db.objectives.find({
  annualAssignmentId,
  isDeleted: false
}).sort({ quarterCode: 1, objectiveNo: 1 });

db.objective_values.find({
  annualAssignmentId,
  isDeleted: false
});

db.employee_achievement_submissions.find({
  annualAssignmentId,
  isDeleted: false
});

db.quarter_reviews.find({
  annualAssignmentId,
  isDeleted: false
});

db.quarter_review_values.find({
  annualAssignmentId,
  isDeleted: false
});

db.annual_decisions.find({
  annualAssignmentId,
  isDeleted: false
});

db.annual_decision_values.find({
  annualAssignmentId,
  isDeleted: false
});

db.workflow_events.find({
  annualAssignmentId
}).sort({ createdAt: 1 });

db.audit_logs.find({
  assignmentId: annualAssignmentId.toString()
}).sort({ timestamp: 1 });
```

## Reference Chain

```txt
pms_templates
  -> pms_template_versions
  -> annual_cycles
  -> quarter_cycles
  -> annual_assignments
  -> quarter_assignments
  -> objectives
  -> employee_achievement_submissions
  -> quarter_reviews
  -> annual_decisions
```

