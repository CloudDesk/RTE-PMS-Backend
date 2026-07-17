# Objective Assignment Sharing - Phase 1 Foundation And Rules

## 1. Purpose

This phase defines the foundation rules for sharing an Objective Library employee assignment with another employee.

The feature must let the original assignee share selected assigned terms with another employee so that the shared employee can fill those terms on behalf of the original assignee.

This phase is a rules and UX foundation only. It does not introduce runtime code changes.

## 2. Scope

In scope:

- Share an existing Objective Employee Assignment from My Objectives.
- Share only selected assigned terms.
- Let the shared employee view and fill the shared terms.
- Keep the assignment owned by the original assignee.
- Keep reporting and final records under the original assignee.
- Preserve clear submitted-by audit attribution.

Out of scope for Phase 1:

- Backend schema changes.
- API changes.
- UI component implementation.
- Notification delivery.
- Same-term live collaboration.
- Multi-level re-sharing by the shared employee.

## 3. Core Decision

Use term-level controlled sharing.

Do not create a duplicate employee assignment for the shared employee.

Do not allow both the original assignee and the shared employee to edit the same term at the same time.

The system should maintain:

```text
One objective assignment
One original owner
Optional shared access per assigned term
One active filler per term
One final record under the original owner
```

## 4. Dynamic Term Rule

Terms must never be hardcoded in the sharing feature.

Shareable terms must come from the selected Objective Employee Assignment record:

```text
assignment.selectedTerms
```

If `selectedTerms` is not available, the UI and backend should resolve terms from the assignment period terms only as a fallback.

Examples:

| Assignment selected terms | Share modal terms |
|---|---|
| Q1, Q2, Q3, Q4 | Q1, Q2, Q3, Q4 |
| H1, H2 | H1, H2 |
| Y1 | Y1 |
| Custom labels | The same assigned custom labels |

The share UI must show only terms assigned to that employee assignment.

## 5. Minimum Term Selection Rule

At least one term must be selected before sharing.

The Share action must be disabled until:

```text
shared employee is selected
at least one eligible assigned term is selected
```

If the user attempts to submit without a term, show:

```text
Select at least one term to share.
```

## 6. Ownership Rule

The original assignee remains the owner of the objective assignment.

Sharing selected terms does not transfer the full assignment.

If an assignment has terms:

```text
Q1, Q2, Q3, Q4
```

and the original assignee shares:

```text
Q2, Q3
```

then ownership and fill responsibility are:

| Term | Active filler |
|---|---|
| Q1 | Original assignee |
| Q2 | Shared employee |
| Q3 | Shared employee |
| Q4 | Original assignee |

So yes, if only Q2 and Q3 are shared, Q4 remains with the original assignee.

The UI should make this clear with dynamic labels:

```text
Shared with Priya Raman for: Q2, Q3
Remaining terms stay with you: Q1, Q4
```

For non-quarterly terms:

```text
Shared with Priya Raman for: H1
Remaining terms stay with you: H2
```

## 7. Edit Responsibility Rule

For each term, only one actor can actively fill at a time.

| Term state | Original assignee | Shared employee |
|---|---:|---:|
| Not shared and open | Can edit | Cannot edit |
| Shared and open | Read-only for that term | Can edit |
| Submitted | Read-only | Read-only |
| Closed | Read-only | Read-only |
| Sharing revoked before submission | Can edit again if open | Cannot edit |

The original assignee can always view all terms.

The shared employee can view the shared assignment but can edit only active shared terms.

## 8. Share Eligibility Rules

A term can be shared only when all conditions are true:

```text
assignment status is ASSIGNED
assignment period status is ACTIVE
term belongs to assignment.selectedTerms
term status is OPEN or eligible for entry
term is not SUBMITTED
term is not CLOSED
term is not already actively shared with another employee
shared employee is not the original assignee
shared employee is active
```

Submitted and closed terms must appear disabled in the UI if displayed.

Do not hide disabled terms unless the term does not belong to the assignment.

## 9. Revoke Rules

The original assignee can revoke active shared access before the shared term is submitted.

Rules:

- Revoke is allowed only for active shared access.
- Revoke is blocked for submitted terms.
- Revoke is blocked for closed terms.
- If one shared access record contains multiple terms, revoke should affect only terms still eligible for revoke.
- Submitted term attribution must remain unchanged.

## 10. Shared Employee Restrictions

The shared employee must not be allowed to:

- Share the assignment with another employee.
- Revoke their own access.
- Edit terms not shared with them.
- Edit submitted or closed terms.
- Change the assignment owner.
- Close the assignment.
- Change assigned terms.

## 11. Reporting And Final Record Rules

Reports must continue to count the assignment under the original assignee.

The shared employee is a contributor, not a second assignee.

Final record should retain:

```text
assignment owner = original assignee
term submitted by = actual submitting user
on behalf of = original assignee when submitted by shared employee
```

Example:

| Term | Submitted by | Display note |
|---|---|---|
| Q1 | Arun Kumar | Arun Kumar |
| Q2 | Priya Raman | Priya Raman on behalf of Arun Kumar |
| Q3 | Priya Raman | Priya Raman on behalf of Arun Kumar |
| Q4 | Arun Kumar | Arun Kumar |

## 12. Audit Rules

Audit must preserve who performed each action.

Required audit events for later implementation:

| Event | Actor | Required details |
|---|---|---|
| Shared access created | Original assignee | Assignment, shared employee, terms, reason |
| Shared access revoked | Original assignee | Assignment, shared employee, terms, reason |
| Shared draft saved | Shared employee | Assignment, owner, term |
| Shared term submitted | Shared employee | Assignment, owner, term |

## 13. Minimal Clean UI Requirements

The UI should be minimal, clean, and employee-friendly.

Use simple labels:

- Share
- Shared with me
- Shared by
- Shared with
- Revoke access
- Remaining terms stay with you

Avoid technical words in employee-facing UI:

- delegation
- proxy
- actor
- assignment access record
- permission object

Use compact visual elements:

- Term chips for assigned terms.
- Status badges for Open, Shared, Submitted, Closed.
- Small ownership line in shared view.
- Short read-only reason near disabled actions.

## 14. Share Modal Checklist

The Share modal should contain:

- Employee search.
- Dynamic term list from `assignment.selectedTerms`.
- Optional note or reason.
- Cancel button.
- Share button.

Validation checklist:

- Employee is required.
- At least one term is required.
- Self-sharing is blocked.
- Inactive employees are blocked.
- Submitted terms are disabled.
- Closed terms are disabled.
- Already shared terms are disabled.
- Share button is disabled until the form is valid.

Recommended modal copy:

```text
Share objective

Choose who can fill selected terms on your behalf.
```

Recommended summary copy:

```text
Shared with Priya Raman for: Q2, Q3
Remaining terms stay with you: Q1, Q4
```

Both lines must be generated from the actual assigned terms and selected shared terms.

## 15. My Objectives UI Checklist

Original assignee view:

- Show Share button only for active editable assignments.
- Show shared access summary if sharing exists.
- Show who has access and which terms.
- Show remaining terms that stay with the original assignee.
- Show Revoke access only for revocable terms.

Shared employee view:

- Add Shared with me filter or tab.
- Show original assignee name.
- Show shared terms.
- Keep the same fill screen layout.
- Make non-shared terms read-only with a clear reason.

## 16. Acceptance Criteria For Phase 1

Phase 1 is complete when the product rules are documented and agreed:

- Terms are dynamic and sourced from the assignment.
- At least one term must be selected for sharing.
- Sharing selected terms does not transfer non-selected terms.
- Non-selected terms remain fillable by the original assignee.
- Same-term simultaneous editing is not allowed.
- The shared employee can fill only shared terms.
- Submitted and closed terms are read-only for everyone.
- The assignment remains reported under the original assignee.
- Audit and final record attribution must show the actual submitting user.
- UI labels stay simple, clean, and employee-friendly.

