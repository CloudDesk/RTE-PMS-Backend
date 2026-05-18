Module 2 :: Template Management

Implement PMS v2 Template Management.

For now permissions:
ADMIN and SUPER_ADMIN can create/update/activate/deactivate templates.
MANAGEMENT can view annual appraisal-related template sections if needed.
EMPLOYEE and MANAGER cannot modify templates.

Template must support:
- PMS template creation
- template versioning
- active/inactive status
- only one active version at a time
- locked template version once assigned
- objective sections
- predefined objectives
- dynamic objective configuration
- hybrid objective model
- manager review sections
- annual appraisal decision sections
- field configs
- required fields
- field type
- help text
- weightage
- scoring rules
- visibility by fixed roles
- editability by fixed roles
- quarter-aware repeated sections
- letter template configuration
- placeholders
- conditional blocks

Template stores structure only.
Do not store employee transactional values in template.

If template is already used by assignment, do not edit that version.
Create new version instead.

Add models, services, APIs, validation, audit logs, and tests.