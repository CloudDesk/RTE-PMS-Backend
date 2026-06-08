Note:
Letter Template Builder is removed from scope. Appraisal communication content is managed in the backend using static/hardcoded content rules based on the final appraisal outcome.

System / Master Setup Flow

1. Auth / Access Control
System authenticates users and enforces role-based access across PMS screens and actions.

2. Employee Management
HR/Admin creates employees, assigns roles, and maps managers before PMS cycle operations begin.

3. Template Builder
HR/Admin creates PMS templates containing objective sections, manager review sections, rating/scoring fields, visibility rules, permissions, and version governance.

4. Annual Cycle Setup
HR/Admin creates Annual Parent Cycle with Q1–Q4 child quarters.
System validates quarter dates, non-overlap rules, milestone windows, appraisal windows, and quarter-level window boundaries.

5. Employee Assignment
HR/Admin assigns employees, managers, annual cycle, and locked template version to the PMS cycle.
System creates:
- Annual Assignment
- Quarter Assignments

PMS Workflow Flow

6. Assignment Workspace
HR/Admin/Manager accesses a consolidated assignment workspace to view assignment details, history, delegation, progress, and related actions in one place.

7. Objective Creation
Employee or Manager creates quarterly objectives from the assigned template.
Manager-created objectives auto-approve.
Optional evidence/attachments may be uploaded against objectives.

8. Objective Approval
Employee submits objective for manager review.
Manager approves or returns objectives for revision with mandatory comments.
If returned, employee revises and resubmits.
Approved objectives become read-only unless reopened by HR/Admin.

9. Quarterly Manager Review
Manager submits quarterly evaluation.

10. Quarter Finalization
HR/Admin or System finalizes quarter.

11. Annual Appraisal Decision
After all applicable quarters finalized/closed:
Management creates annual decision.

12. Outcome Derivation
System derives:
- BOTH
- MERIT_ONLY
- GRADE_ONLY
- NIL

13. Decision Freeze & Annual Finalization
Decision frozen before publish.

14. Visibility Enablement
HR/Admin/Management enables visibility.

15. Communication Ready
System prepares communication dispatch.
(After annual appraisal finalization and visibility enablement, the system automatically prepares employee appraisal communication by selecting the correct backend-managed static content based on the final appraisal outcome (BOTH, MERIT_ONLY, GRADE_ONLY, or NIL) and generates a preview for HR/Admin review before sending.)

16. Communication Dispatch
HR/Admin previews and sends appraisal communication.
(HR/Admin reviews and sends the finalized appraisal communication to employees, and the system permanently stores the sent content, content version/reference, delivery status, timestamp, and audit history without allowing future modification of dispatched records.)

17. Director History View
Director can view hierarchy-scoped employee PMS history, evidence, audit trail, and finalized records according to read-only role-based visibility permissions.

18. History & Audit Preservation
All actions, snapshots, corrections, and communication content references remain immutable and auditable.
