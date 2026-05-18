Module 15 :: Bulk Operations

Implement PMS v2 Bulk Operations.

ADMIN and SUPER_ADMIN only.

Implement:
- bulk assignment preview
- bulk assignment execute
- bulk reminder preview
- bulk reminder execute
- bulk visibility preview
- bulk visibility execute
- bulk communication preview
- bulk communication dispatch
- bulk close with mandatory reason
- per-record validation
- per-record success/failure result
- bulk audit summary

Rules:
- do not bypass normal validation
- do not bypass workflow engine
- do not bypass visibility governance
- do not hide per-record failures
- missing manager goes to exception queue
- duplicate assignment skipped/rejected per record
- communication requires template mapping and preview