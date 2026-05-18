You are implementing PMS v2.

Important current implementation decision:
For Phase 1, do NOT implement dynamic role creation/configuration.
Use only fixed seeded roles:
EMPLOYEE, MANAGER, ADMIN, MANAGEMENT, SUPER_ADMIN.

Do not add custom role screens, role builder, permission builder, or permission simulation now.
Design code in a way that dynamic roles can be added later without rewriting core modules.

Follow only the approved PMS v2 business rules:
- annual parent cycle with Q1-Q4 child quarters
- objective-based quarterly workflow
- manager-driven quarterly review
- no employee self-review
- no employee acceptance/sign-off
- no dual rating
- no parallel approval
- confidential annual grade/merit decision
- visibility enabled only by authorized roles
- API-level field masking
- immutable audit/history
- correction layer for reopen/override
- template version locking
- workflow engine must control state transitions

Do not invent new workflow states, APIs, permissions, or business logic.
If unclear, mark as Pending Business Clarification.

After implementation, provide:
1. Files created/changed
2. APIs added
3. Models added
4. Validations added
5. Permissions enforced
6. Audit events added
7. Tests added
8. Pending clarification if any