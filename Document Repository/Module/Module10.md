Module 10 :: Communication Dispatch & Letter Generator

Implement PMS v2 Communication Dispatch.

ADMIN and SUPER_ADMIN can preview/send/resend appraisal communication.
MANAGEMENT can view where permitted.
EMPLOYEE receives communication only after dispatch.
MANAGER cannot dispatch.

Implement:
- outcome-based template resolution
- MERIT_ONLY template
- GRADE_ONLY template
- BOTH combined/separate template
- NIL no-mail or generic mail policy
- placeholder rendering
- conditional block rendering
- preview before dispatch
- send communication
- resend communication
- generated document reference
- dispatch audit
- content snapshot hash
- immutable sent content

Validation:
- annual decision must be finalized
- visibility must be enabled before communication if policy requires
- template mapping required for outcome
- preview required before send where configured
- placeholder values must resolve before send
- letter template version locked after generation/send
- failed dispatch logged

Do not hardcode one mail template.
Do not overwrite old communication on resend.