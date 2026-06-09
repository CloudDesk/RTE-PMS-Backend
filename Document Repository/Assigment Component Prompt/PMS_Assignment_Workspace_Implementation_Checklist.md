# PMS Assignment Workspace Implementation Checklist

## 1. Development Rules

Before implementation, every developer must follow these rules:

- Do not delete backend services.
- Do not delete APIs.
- Do not merge backend business logic into one service.
- Do not change employee runtime screens.
- Do not change manager runtime screens.
- Do not change cycle creation logic.
- Do not change launchCycle service behavior.
- Do not remove old routes until the new workspace is working.
- Do not show all admin actions on the first screen.
- Do not duplicate large old workspace logic manually if an existing component can be reused.

---

## 2. UX Goal Checklist

The final UX should achieve this:

| Goal | Done? |
|---|---|
| HR/Admin opens one Assignment Workspace after assignment creation | [ ] |
| Assignment list clearly shows current assignment status | [ ] |
| HR/Admin can open View 360 for one assignment | [ ] |
| Current Progress is the first detail section | [ ] |
| Quarter statuses are easy to understand | [ ] |
| Annual Decision is inside assignment detail | [ ] |
| Communication is inside assignment detail | [ ] |
| SLA/reminders are inside assignment detail | [ ] |
| Delegation/reassignment is inside assignment detail | [ ] |
| Audit/history is inside assignment detail | [ ] |
| Bulk Actions are inside Assignment Workspace | [ ] |
| Sidebar is simplified | [ ] |
| Old modules are not deleted prematurely | [ ] |

---

## 3. Sidebar Checklist

### Before

Existing top-level items may include:

- Assignments
- Annual Decisions
- Audit & History
- SLA & Notifications
- Scoped Delegations
- Bulk Operations

### After

Target top-level PMS sidebar:

| Sidebar Item | Status |
|---|---|
| Dashboard | Keep |
| Templates | Keep |
| Cycles | Keep |
| Assignment Workspace | Keep / Add |
| Reports / Settings | Keep if available |
| Assignments | Hide after workspace is ready |
| Annual Decisions | Hide after section is moved |
| Audit & History | Hide after section is moved |
| SLA & Notifications | Hide after section is moved/settings decided |
| Scoped Delegations | Hide after section/settings move |
| Bulk Operations | Hide after Bulk Actions is inside workspace |

Checklist:

| Task | Done? |
|---|---|
| Identify sidebar config file(s) | [ ] |
| Add Assignment Workspace item | [ ] |
| Keep old items until new workspace is ready | [ ] |
| Hide old items only after regression check | [ ] |
| Keep old routes accessible if deep links are needed | [ ] |

---

## 4. Assignment Workspace Shell Checklist

| Task | Done? |
|---|---|
| Create/upgrade Assignment Workspace route | [ ] |
| Add page title and subtitle | [ ] |
| Add summary cards | [ ] |
| Add Assignment List tab | [ ] |
| Add Bulk Actions tab placeholder | [ ] |
| Add Exceptions tab or filter | [ ] |
| Add History/Search placeholder if needed | [ ] |
| Load assignment list from existing API | [ ] |
| Add View 360 action | [ ] |
| Avoid too many row buttons | [ ] |

Summary cards:

| Card | Done? |
|---|---|
| Total Assignments | [ ] |
| Pending Objectives | [ ] |
| Pending Manager Reviews | [ ] |
| Annual Decision Pending | [ ] |
| Exceptions | [ ] |
| SLA Breaches | [ ] |

---

## 5. Assignment List Checklist

Columns required:

| Column | Done? |
|---|---|
| Employee | [ ] |
| Department | [ ] |
| Manager | [ ] |
| Cycle | [ ] |
| Template | [ ] |
| Applicable Quarters | [ ] |
| Current Progress | [ ] |
| Annual Decision Status | [ ] |
| Visibility Status | [ ] |
| Communication Status | [ ] |
| SLA/Breach Status | [ ] |
| View 360 action | [ ] |

Filters recommended:

| Filter | Done? |
|---|---|
| Cycle | [ ] |
| Department | [ ] |
| Manager | [ ] |
| Employee search | [ ] |
| Status | [ ] |
| SLA breach | [ ] |
| Annual decision status | [ ] |

---

## 6. Assignment 360 Header Checklist

The detail header must show:

| Field | Done? |
|---|---|
| Employee name | [ ] |
| Employee code | [ ] |
| Department | [ ] |
| Designation | [ ] |
| Manager | [ ] |
| Cycle | [ ] |
| Template | [ ] |
| Assignment status | [ ] |
| Annual status | [ ] |
| Visibility status | [ ] |
| Communication status | [ ] |
| SLA breach badge | [ ] |

---

## 7. Current Progress Checklist

Quarter progress should show:

| Field | Done? |
|---|---|
| Quarter code | [ ] |
| Objective status | [ ] |
| Manager review status | [ ] |
| Quarter finalization status | [ ] |
| SLA status | [ ] |
| Current owner/pending action | [ ] |

Status label mapping:

| Backend Status | Friendly Label | Done? |
|---|---|---|
| NOT_STARTED | Not Started | [ ] |
| OBJECTIVE_SETTING_OPEN | Objective Setting Open | [ ] |
| OBJECTIVE_DRAFT | Objective Draft | [ ] |
| OBJECTIVE_SUBMITTED | Waiting for Manager Approval | [ ] |
| OBJECTIVE_REVISION_REQUIRED | Revision Required | [ ] |
| OBJECTIVE_APPROVED | Objectives Approved | [ ] |
| MANAGER_REVIEW_OPEN | Manager Review Pending | [ ] |
| MANAGER_REVIEW_SUBMITTED | Review Submitted | [ ] |
| QUARTER_FINALIZED | Finalized | [ ] |
| CLOSED_BY_ADMIN | Closed by Admin | [ ] |
| REOPENED_BY_ADMIN | Reopened by Admin | [ ] |

---

## 8. Objectives Section Checklist

Show objectives quarter-wise.

| Field | Done? |
|---|---|
| Quarter | [ ] |
| Objective title | [ ] |
| Description summary | [ ] |
| Weightage | [ ] |
| Source | [ ] |
| Status | [ ] |
| Attachment indicator | [ ] |
| Template/predefined indicator | [ ] |

Source labels:

| Source | Friendly Label | Done? |
|---|---|---|
| PREDEFINED | Predefined | [ ] |
| EMPLOYEE_CREATED | Employee Created | [ ] |
| MANAGER_CREATED | Manager Created | [ ] |
| HR_ADMIN_CREATED | Admin Created | [ ] |

---

## 9. Manager Review Section Checklist

| Field | Done? |
|---|---|
| Quarter | [ ] |
| Review status | [ ] |
| Submitted by | [ ] |
| Submitted date | [ ] |
| Manager comments summary | [ ] |
| Quarter finalization status | [ ] |
| Rating/score if available | [ ] |

Rules:

| Rule | Done? |
|---|---|
| Section is read-only unless admin action is explicitly allowed | [ ] |
| No change to manager runtime workflow | [ ] |
| No change to review submission/finalization logic | [ ] |

---

## 10. Annual Decision Section Checklist

| Field/Action | Done? |
|---|---|
| Decision status | [ ] |
| Grade applied | [ ] |
| Merit applied | [ ] |
| Outcome type | [ ] |
| Freeze status | [ ] |
| Visibility status | [ ] |
| Save/update decision if allowed | [ ] |
| Submit decision if allowed | [ ] |
| Freeze if allowed | [ ] |
| Reopen if allowed | [ ] |
| Update visibility if allowed | [ ] |

Rules:

| Rule | Done? |
|---|---|
| Use existing annual decision APIs | [ ] |
| Do not duplicate complex decision logic manually | [ ] |
| Keep old route until new section is tested | [ ] |

---

## 11. Communication Section Checklist

| Field/Action | Done? |
|---|---|
| Communication status | [ ] |
| Outcome content reference | [ ] |
| Last sent date | [ ] |
| Delivery status | [ ] |
| Failure reason | [ ] |
| Preview communication | [ ] |
| Send communication | [ ] |
| Resend communication | [ ] |

Rules:

| Rule | Done? |
|---|---|
| No Letter Template Builder UI | [ ] |
| Backend-managed static content only | [ ] |
| Sent snapshot remains immutable | [ ] |

---

## 12. SLA & Reminders Checklist

| Field/Action | Done? |
|---|---|
| Due item | [ ] |
| Due date | [ ] |
| Breach status | [ ] |
| Reminder sent count/status | [ ] |
| Escalation target | [ ] |
| Last reminder date | [ ] |
| Send reminder if supported | [ ] |
| View reminder history | [ ] |

Rules:

| Rule | Done? |
|---|---|
| Show assignment-specific SLA only | [ ] |
| Do not show global SLA config inside 360 unless approved | [ ] |

---

## 13. Delegation / Reassignment Checklist

| Field/Action | Done? |
|---|---|
| Current manager | [ ] |
| Active delegation | [ ] |
| Delegation period | [ ] |
| Reassignment history | [ ] |
| Reassign manager | [ ] |
| Create delegation | [ ] |
| Revoke delegation | [ ] |

Rules:

| Rule | Done? |
|---|---|
| Preserve original actor history | [ ] |
| Do not overwrite previous manager/action attribution | [ ] |
| Use existing delegation/reassignment APIs | [ ] |

---

## 14. Audit & History Checklist

Timeline should include:

| Event | Done? |
|---|---|
| Assignment created | [ ] |
| Objective submitted | [ ] |
| Objective approved/returned | [ ] |
| Manager review submitted | [ ] |
| Quarter finalized | [ ] |
| Annual decision updated | [ ] |
| Visibility changed | [ ] |
| Communication sent | [ ] |
| Reopen/correction | [ ] |
| Delegation/reassignment | [ ] |

Rules:

| Rule | Done? |
|---|---|
| Audit is read-only | [ ] |
| No edit/delete actions in audit section | [ ] |
| Empty state is user-friendly | [ ] |

---

## 15. Bulk Actions Checklist

| Feature | Done? |
|---|---|
| Bulk Actions tab inside Assignment Workspace | [ ] |
| Reuse BulkOperationsWorkspace | [ ] |
| Bulk assignment launch still works | [ ] |
| Template suggestion still works | [ ] |
| Template override still works | [ ] |
| Preview/dry-run still works | [ ] |
| Execute still works | [ ] |
| Bulk reminders still works if supported | [ ] |
| Bulk visibility still works if supported | [ ] |
| Bulk communication still works if supported | [ ] |
| Bulk close still works if supported | [ ] |

---

## 16. Cleanup Checklist

| Cleanup Item | Done? |
|---|---|
| Remove old commented bulk assignment UI from Assignments page if unused | [ ] |
| Remove unused bulk assignment handler/state if unused | [ ] |
| Remove or restore commented refresh block in Bulk parent route | [ ] |
| Remove or restore commented refresh block in Delegation parent route | [ ] |
| Remove unused imports after sidebar cleanup | [ ] |
| Keep old routes if needed for backward compatibility | [ ] |

---

## 17. Regression Checklist

| Test | Expected Result | Done? |
|---|---|---|
| Assignment Workspace loads | Page opens without error | [ ] |
| Assignment list loads | Assignments visible | [ ] |
| View 360 opens | Detail view opens | [ ] |
| Current Progress loads | Quarter cards/table visible | [ ] |
| Objectives load | Quarter-wise objectives visible | [ ] |
| Manager Reviews load | Review summaries visible | [ ] |
| Annual Decision section loads | Decision data/actions visible per permission | [ ] |
| Communication section loads | Status/actions visible | [ ] |
| SLA section loads | Breach/reminder data visible | [ ] |
| Delegation section loads | Manager/delegation info visible | [ ] |
| Audit section loads | Read-only timeline visible | [ ] |
| Bulk Actions opens | Existing bulk workspace usable | [ ] |
| Cycle creation works | No regression | [ ] |
| Cycle launch works | No regression | [ ] |
| Bulk assignment execute works | No regression | [ ] |
| Employee objective workspace works | No regression | [ ] |
| Manager review workspace works | No regression | [ ] |
| Annual decision old route works if still accessible | No regression | [ ] |

---

## 18. Final Sign-Off Checklist

Before marking complete:

| Check | Done? |
|---|---|
| All old functionality reachable inside Assignment Workspace | [ ] |
| Sidebar simplified | [ ] |
| Old routes hidden or redirected safely | [ ] |
| No backend service deleted | [ ] |
| No runtime employee/manager break | [ ] |
| No cycle creation/launch break | [ ] |
| Manual browser test completed | [ ] |
| API smoke test completed | [ ] |
| Known limitations documented | [ ] |
| Team lead reviewed | [ ] |
