Module 14 :: Dashboard & Reporting

Implement PMS v2 Dashboard and Reporting.

Build role-based dashboards for:
EMPLOYEE
MANAGER
ADMIN
MANAGEMENT
SUPER_ADMIN

Employee dashboard:
own cycle, own quarter status, objectives, visible reviews, visible final outcomes.

Manager dashboard:
assigned employee objective approvals, quarter review queue, overdue items, finalized quarters.

Admin/Super Admin dashboard:
cycle progress, quarter completion, assignment exceptions, SLA breaches, appraisal readiness, communication status, reopen tracking.

Management dashboard:
annual appraisal pending, decision drafts, grade/merit distribution, NIL outcomes, communication readiness.

Rules:
- dashboard APIs must not mutate workflow state
- dashboard results must obey visibility rules
- hidden grade/merit must not appear before visibility
- exports must follow same API masking rules