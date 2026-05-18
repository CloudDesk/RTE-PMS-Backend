Module 4 :: Assignment Management

Implement PMS v2 Assignment Management.

ADMIN and SUPER_ADMIN can assign employees, bulk assign, reassign managers, close/reopen assignments.
EMPLOYEE can view own assignment.
MANAGER can view assigned employee assignments.
MANAGEMENT can view annual decision summary records.

Implement:
- Annual Assignment model
- Quarter Assignment model
- one annual assignment per employee per cycle
- linked Q1-Q4 quarter assignments
- locked template version during assignment creation
- assigned manager mapping
- bulk assignment
- duplicate prevention
- employee eligibility validation
- missing manager exception queue
- manager reassignment with mandatory reason
- preserve old manager attribution for completed quarters
- assignment history

Do not implement multi-manager parallel approval.
Do not overwrite historical manager actions.