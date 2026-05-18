Module 7 :: Manager Quarterly Review

Implement PMS v2 Manager Quarterly Review.

MANAGER can review only assigned employees.
ADMIN and SUPER_ADMIN can finalize/reopen where allowed.
EMPLOYEE cannot edit manager review.
MANAGEMENT can view quarter summaries for annual appraisal.

Implement:
- quarter review model
- load approved objectives
- manager rating entry
- manager comments
- achievements
- development observations
- recommendations
- attachments
- save draft if allowed
- submit review
- store quarter score/rating/comments
- finalize quarter after manager submission

Validation:
- review allowed only in MANAGER_REVIEW_OPEN
- review requires approved objectives unless admin closure exception
- required review fields enforced on submit
- ratings/scores follow template configuration
- submit transitions to MANAGER_REVIEW_SUBMITTED
- finalize transitions to QUARTER_FINALIZED

Do not implement employee self-rating.
Do not implement dual rating.
Do not allow multiple manager parallel reviews.