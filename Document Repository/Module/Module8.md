Module 8 :: Annual Appraisal Decision

Implement PMS v2 Annual Appraisal Decision.

MANAGEMENT, ADMIN, and SUPER_ADMIN can create/save/submit/freeze annual appraisal decision.
EMPLOYEE and MANAGER cannot access grade/merit before visibility is enabled.

Implement:
- annual summary from Q1-Q4
- decision eligibility check
- isGradeApplied
- isMeritApplied
- derived appraisalOutcomeType
- grade details
- merit details
- NIL reason
- decision draft
- decision submit
- freeze decision
- reopen decision with mandatory reason
- pre-reopen snapshot
- correction history

Outcome derivation:
isGradeApplied=true and isMeritApplied=true -> BOTH
isGradeApplied=false and isMeritApplied=true -> MERIT_ONLY
isGradeApplied=true and isMeritApplied=false -> GRADE_ONLY
isGradeApplied=false and isMeritApplied=false -> NIL

Validation:
- annual decision blocked until all applicable quarters are QUARTER_FINALIZED or CLOSED_BY_ADMIN
- grade fields required only when isGradeApplied=true
- merit fields required only when isMeritApplied=true
- frozen decision rejects normal edits
- no recalculation after freeze unless formal reopen

Do not make grade and merit mutually exclusive.