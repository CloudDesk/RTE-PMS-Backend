# PMS Template Objective Matrix Contract v1

This directory is the frozen Phase 0 contract for the template-linked objective
matrix. It is intentionally independent from production model implementation so
Phase 1 can implement and validate against an agreed input/output shape.

## Scope

- Applies only to objectives embedded in an assigned PMS template version.
- Preserves annual assignment, term assignment, objective status, workflow state,
  date window, audit, and optimistic-version authority.
- Covers quarterly, half-yearly, and yearly assignment cadences.
- Covers predefined, employee-created, and manager-created logical rows.
- Covers employee, manager, reviewer/director, admin, and management visibility.
- Covers safe formulas, calculated rows, annual-decision snapshot, and official PDF.

## Explicit exclusions

- Standalone Objective Library.
- Standalone Objective Master, Assignment Rule, Assignment Period, sharing,
  reporting, and Final Record flows.
- `/my/objectives` and `/manager/team-objectives`.
- User-supplied JavaScript, macros, external API calls, and database expressions.

## Files

- `contract.v1.json` - frozen enums, identity rules, compatibility rules, and API
  semantics.
- `quarterly.fixture.json` - Q1-Q4 logical row and repeating-column example.
- `half-yearly.fixture.json` - H1-H2 expansion example.
- `yearly.fixture.json` - Y1 and shared-annual-value example.
- `permission-truth-table.v1.json` - role, workflow, term-position, and window cases.
- `formula-fixtures.v1.json` - valid results and required rejection cases.
- `pdf-reference-layout.v1.json` - official/live PDF content and masking contract.

## Frozen decisions

1. `objectiveRowKey` is immutable logical-row identity; title is never identity.
2. A logical row may have one Objective sibling per covered term.
3. Each cell is authorized using its own term sibling, stage, window, actor, and
   current record version.
4. Dynamic rows default to current term only. Period selection is available only
   when explicitly enabled in the assigned template version.
5. Column labels are arbitrary; stable IDs and bindings are not.
6. Formula targets and calculated rows are server-calculated and read-only.
7. Formula expressions are validated allowlisted ASTs; no executable user code.
8. Group/table calculated rows are not Objective records and do not affect scoring
   unless an explicit future score mapping is separately approved.
9. Existing term scoring remains authoritative and never counts siblings from
   another term.
10. Official PDF is generated from a frozen, role-masked server snapshot.

## Phase 0 exit sign-off

Engineering verification is automated by
`test/contracts/templateObjectiveMatrixContract.test.ts`.

Product/engineering sign-off must confirm:

- [ ] Logical row identity and sibling rules.
- [ ] Dynamic row coverage defaults and optional period choice.
- [ ] Formula operations, empty handling, divide-by-zero handling, and no-code rule.
- [ ] Permission truth table and most-restrictive precedence.
- [ ] Official PDF content and role masking.
- [ ] Standalone subsystem exclusion.

Any change after sign-off requires a new contract version; do not silently mutate
v1 fixtures.
