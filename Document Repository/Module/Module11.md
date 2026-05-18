Module 11 :: Audit, History & Correction Layer

Implement PMS v2 Audit, History, and Correction Layer.

Audit must cover:
- objective create/update/submit
- objective approve/return
- quarter review submit
- quarter finalization
- annual decision draft/submit/freeze
- visibility enablement
- communication preview/send/resend
- reopen
- override
- reassignment
- bulk actions

Audit fields:
actorId
actorRole
action
entityType
entityId
previousValue
newValue
reason
timestamp
correlationId
assignmentId

History must preserve:
- finalized annual appraisal
- quarter summaries
- grade/merit outcome
- visibility state
- communication dispatch state
- template version references
- correction references

Correction rule:
Never overwrite original finalized value.
Store correction as separate correction layer.

ADMIN, SUPER_ADMIN, and authorized MANAGEMENT can view full audit where permitted.
EMPLOYEE and MANAGER see only visible historical fields.

Audit records must not be editable through normal APIs.