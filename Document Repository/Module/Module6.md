Module 6 :: Objective Management

Implement PMS v2 Objective Management.

EMPLOYEE can create/edit/submit own objectives only during allowed window/state.
MANAGER can create objectives for assigned employees.
MANAGER can approve or return employee-created objectives.
ADMIN and SUPER_ADMIN can override only through approved correction flow.

Objective handling must support:
- predefined objectives from template
- employee-created objectives
- manager-created objectives
- hybrid objective mode
- title
- description
- KPI/measurement
- target value
- due date
- weightage
- success criteria
- comments
- attachments

Employee-created flow:
OBJECTIVE_DRAFT -> OBJECTIVE_SUBMITTED -> OBJECTIVE_APPROVED
or
OBJECTIVE_SUBMITTED -> OBJECTIVE_REVISION_REQUIRED -> OBJECTIVE_SUBMITTED

Manager-created objective:
directly becomes OBJECTIVE_APPROVED.

Validation:
- manager return requires reason/comment
- approved objectives are read-only
- employee cannot edit manager-created objective
- weightage follows template rules
- required objective fields enforced on submit
- draft save can bypass required submit validations

Do not use Goal terminology.
Do not add self-review.