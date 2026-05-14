# PMS v2 Shared Backend Usage Guide

This guide explains how to use the Day 1 shared PMS backend foundation.

Use these shared services in all PMS modules so workflow, access, audit, visibility, and API responses stay consistent.

---

# 1. File Locations

Use the current project structure:

```text
Server/src/constants/pms.enums.ts
Server/src/constants/workflow.config.ts
Server/src/types/pms.types.ts
Server/src/services/workflow.service.ts
Server/src/services/quarter-assignment-workflow.service.ts
Server/src/services/access.service.ts
Server/src/services/audit.service.ts
Server/src/services/visibilityMask.service.ts
Server/src/utilis/apiResponse.ts
Server/src/models/pms-quarter-assignment.model.ts
```

Do not import from old paths like:

```text
Server/src/pms/...
```

---

# 2. Workflow State Changes

Use workflow services whenever a PMS workflow state changes.

Do not directly mutate:

```ts
quarterAssignment.workflowState = QuarterWorkflowState.OBJECTIVE_APPROVED;
```

Use:

```ts
import { QuarterWorkflowState } from '../constants/pms.enums';
import { transitionQuarterAssignmentState } from '../services/quarter-assignment-workflow.service';

await transitionQuarterAssignmentState(
  quarterAssignmentId,
  QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED,
  {
    actorId: user._id.toString(),
    actorRole: user.role,
  },
);
```

Use this helper for:

* objective submission state changes
* objective approval state changes
* return for revision state changes
* manager review open/submission state changes
* quarter finalization
* quarter reopen/close

For reopen and admin close transitions, pass a reason:

```ts
await transitionQuarterAssignmentState(
  quarterAssignmentId,
  QuarterWorkflowState.CLOSED_BY_ADMIN,
  {
    actorId: user._id.toString(),
    actorRole: user.role,
  },
  'Employee exited before quarter completion',
);
```

---

# 3. Access Checks

Use `accessService.canPerform()` before PMS actions.

Do not directly check:

```ts
if (user.role === 'manager') {
  // allow
}
```

Use:

```ts
import { accessService } from '../services/access.service';

const access = accessService.canPerform({
  actor: {
    actorId: user._id.toString(),
    actorRole: user.role,
  },
  action: 'objective.submit',
  resource: {
    employeeId: objective.employeeId.toString(),
  },
});

if (!access.allowed) {
  throw new Error(access.message);
}
```

Use access checks for:

* employee objective create/submit
* manager objective approve/return
* manager review submit
* HR/Admin quarter finalize
* annual decision draft/freeze
* visibility enable/disable

MVP role mapping:

```text
staff   -> Employee
manager -> Manager
admin   -> HR/Admin
```

For admin-only PMS actions:

```ts
const access = accessService.canPerform({
  actor: {
    actorId: user._id.toString(),
    actorRole: user.role,
  },
  action: 'quarterAssignment.finalize',
  requiresAdmin: true,
});
```

---

# 4. Audit Logs

Use `auditService.createAuditLog()` for important PMS writes.

```ts
import { auditService } from '../services/audit.service';

await auditService.createAuditLog({
  actorId: user._id.toString(),
  actorRole: user.role,
  action: 'OBJECTIVE_SUBMITTED',
  entityType: 'OBJECTIVE',
  entityId: objective._id.toString(),
  previousValue: {
    workflowState: 'OBJECTIVE_DRAFT',
  },
  newValue: {
    workflowState: 'OBJECTIVE_SUBMITTED',
  },
});
```

Use audit logs for:

* objective create/update/submit
* objective approve/return
* quarter review submit
* quarter assignment finalize/reopen/close
* annual decision draft/submit/freeze
* visibility changes
* manager reassignment
* admin override/correction

When a reason is mandatory, include it:

```ts
await auditService.createAuditLog({
  actorId: user._id.toString(),
  actorRole: user.role,
  action: 'QUARTER_ASSIGNMENT_CLOSED',
  entityType: 'QUARTER_ASSIGNMENT',
  entityId: quarterAssignmentId,
  previousValue: { workflowState: 'MANAGER_REVIEW_OPEN' },
  newValue: { workflowState: 'CLOSED_BY_ADMIN' },
  reason: 'Employee exited before quarter completion',
});
```

Note: `transitionQuarterAssignmentState()` already writes an audit entry for quarter assignment workflow transitions.

---

# 5. Visibility Masking

Use `visibilityMaskService.mask()` before returning annual decision data, history data, dashboard data, or any data containing grade/merit fields.

Do not directly return annual decision objects to Employee or Manager APIs.

```ts
import { visibilityMaskService } from '../services/visibilityMask.service';

const safeDecision = visibilityMaskService.mask(decision, {
  actorRole: user.role,
  employeeGradeVisible: decision.employeeGradeVisible,
  employeeMeritVisible: decision.employeeMeritVisible,
  managerGradeVisible: decision.managerGradeVisible,
  managerMeritVisible: decision.managerMeritVisible,
});
```

Use visibility masking for:

* annual decision detail API
* annual summary API
* employee history API
* manager team history API
* dashboard APIs
* communication preview/status APIs where confidential fields may appear

Before visibility is enabled, the service removes:

* grade fields
* merit fields
* `appraisalOutcomeType` when it could reveal confidential decision

Admin users can see full grade/merit fields.

---

# 6. API Response Helper

Use shared response helpers for new PMS routes.

```ts
import { successResponse, errorResponse } from '../utilis/apiResponse';

return reply.send(
  successResponse('Objective submitted successfully', objective),
);

return reply.status(403).send(
  errorResponse('ACCESS_DENIED', 'You do not have permission.'),
);
```

Success response shape:

```ts
{
  success: true,
  message: string,
  data: {}
}
```

Error response shape:

```ts
{
  success: false,
  errorCode: string,
  message: string
}
```

Use this helper for:

* PMS cycle APIs
* PMS assignment APIs
* objective APIs
* quarter review APIs
* annual decision APIs
* visibility APIs
* dashboard/history APIs

---

# 7. Recommended Route Flow Example

Example manager objective approval flow:

```ts
const access = accessService.canPerform({
  actor: {
    actorId: user._id.toString(),
    actorRole: user.role,
  },
  action: 'objective.approve',
  resource: {
    assignedManagerId: objective.managerId.toString(),
  },
});

if (!access.allowed) {
  return reply.status(403).send(
    errorResponse(access.errorCode ?? 'ACCESS_DENIED', access.message ?? 'Access denied'),
  );
}

const quarterAssignment = await transitionQuarterAssignmentState(
  objective.quarterAssignmentId.toString(),
  QuarterWorkflowState.OBJECTIVE_APPROVED,
  {
    actorId: user._id.toString(),
    actorRole: user.role,
  },
);

return reply.send(
  successResponse('Objective approved successfully', quarterAssignment),
);
```

---

# 8. Team Rules

Follow these rules in all PMS backend modules:

* Do not create new workflow states.
* Do not directly mutate `workflowState`.
* Do not directly check raw PMS roles inside module services.
* Do not return grade/merit fields without visibility masking.
* Do not skip audit for important PMS writes.
* Do not use old `Server/src/pms/...` imports.
* Mark unclear business behavior as `Pending Business Clarification`.

