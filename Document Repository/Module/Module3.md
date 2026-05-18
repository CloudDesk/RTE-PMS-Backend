Module 3 :: Cycle Management

Implement PMS v2 Cycle Management.

ADMIN and SUPER_ADMIN can create/update/launch/close/archive/cancel cycles.
MANAGEMENT can view appraisal window information.
EMPLOYEE and MANAGER can only view assigned cycle/quarter data.

Cycle must support:
- annual parent cycle
- Q1, Q2, Q3, Q4 child quarters
- quarter start/end dates
- objective setting window
- objective approval window
- manager review window
- quarter finalization window
- annual appraisal window
- relative offset support, example Q4 finalized + 30 days
- linked active PMS template version
- communication rule mapping
- SLA configuration placeholders

Validation:
- cycle code unique
- annual cycle must contain Q1-Q4
- quarter dates inside annual date range
- window dates valid and non-conflicting
- only active template version selectable
- annual appraisal cannot open before applicable quarters finalized/closed

Do not hardcode SLA duration.
Do not create new states.