Module 9 :: Visibility Governance

Implement PMS v2 Visibility Governance.

ADMIN, SUPER_ADMIN, and MANAGEMENT can enable visibility.
EMPLOYEE and MANAGER see only fields explicitly published to them.

Implement visibility flags:
employeeReviewVisible
employeeGradeVisible
employeeMeritVisible
managerGradeVisible
managerMeritVisible

Rules:
- final appraisal data hidden by default
- visibility requires ANNUAL_FINALIZED
- grade and merit visibility are independent
- employee and manager visibility are independent
- hidden fields must be removed/masked at API layer
- unauthorized hidden field write must be rejected
- visibility changes must be audited

Do not rely on frontend-only hiding.
Do not return confidential fields before visibility enablement.