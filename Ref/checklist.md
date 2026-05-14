# PMS v2 - Complete Implementation Tracking Checklist

> Source priority: `PMS_FSD_v2.md` is the primary source of truth. The 3-day execution plan and module prompts are used only as supporting execution context.  
> Tracking rule: `Final Confirmation Done` must remain unchecked until API, UI, validation, integration, edge cases, QA review, audit/security review, and source traceability are complete for that feature.

---

# 1. PMS Foundation, Workflow Engine, Access Guard, and Audit Layer

## 1.1 Approved PMS Workflow Constants and State Machine

### Functional Description
Implements the FSD-approved annual and quarter workflow states, valid transitions, and blocked legacy workflow behavior. This foundation must be used by all PMS modules and must reject employee self-review, employee sign-off, dual-rating, parallel approval, and frozen-decision recalculation flows.

### Dependencies
FSD sections 5, 6, 9, 22, 26; all transactional PMS modules.

### API Checklist
| Task | Status |
|---|---|
| Quarter workflow states implemented exactly: NOT_STARTED, OBJECTIVE_SETTING_OPEN, OBJECTIVE_DRAFT, OBJECTIVE_SUBMITTED, OBJECTIVE_REVISION_REQUIRED, OBJECTIVE_APPROVED, MANAGER_REVIEW_OPEN, MANAGER_REVIEW_SUBMITTED, QUARTER_FINALIZED, REOPENED_BY_ADMIN, CLOSED_BY_ADMIN | [ ] |
| Annual workflow states implemented exactly: DRAFT, SCHEDULED, ACTIVE, IN_PROGRESS, ALL_QUARTERS_FINALIZED, APPRAISAL_WINDOW_OPEN, MANAGEMENT_DECISION_DRAFT, MANAGEMENT_DECISION_SUBMITTED, ANNUAL_FINALIZED, VISIBILITY_ENABLED, COMMUNICATION_READY, COMMUNICATION_SENT, CLOSED, ARCHIVED, CANCELLED | [ ] |
| Quarter transition validation implemented for the approved objective, review, finalization, reopen, and admin-close flow | [ ] |
| Annual transition validation implemented for the approved cycle, appraisal, visibility, communication, close, and archive flow | [ ] |
| Invalid, duplicate, unauthorized, out-of-window, finalized-record, and bypass transition attempts rejected server-side | [ ] |
| Employee self-review, employee acceptance/sign-off, disagreement routing, dual rating, and parallel multi-manager approval states excluded from code and data seed | [ ] |
| Workflow transition API/service responses include clear status code, error code, message, and current state | [ ] |
| Workflow transition audit event generated for every successful and failed controlled transition | [ ] |
| API Unit Testing Completed for all valid and invalid state transitions | [ ] |
| API Tested via Postman for quarter and annual transition scenarios | [ ] |
| API Error Responses Verified for invalid transition, unauthorized transition, finalized edit, and missing reason scenarios | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| State transition enforcement matches FSD FR-WF-01 through FR-WF-04 and FR-VAL-07 | [ ] |
| Annual appraisal finalization blocked until all applicable quarters are QUARTER_FINALIZED or CLOSED_BY_ADMIN | [ ] |
| Quarter finalization blocked until manager review submission rules are satisfied | [ ] |
| Reopen does not restart full lifecycle or erase historical values | [ ] |
| Frozen annual decisions do not recalculate after template/scoring changes | [ ] |
| Workflow constants reviewed for spelling, casing, and approved terminology | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Objective APIs call Workflow Engine for draft, submit, approve, return, and lock behavior | [ ] |
| Quarterly Review APIs call Workflow Engine for review submission, finalization, and reopen behavior | [ ] |
| Annual Appraisal APIs call Workflow Engine for draft, submit, freeze, finalize, and reopen behavior | [ ] |
| Visibility Governance APIs call Workflow Engine before visibility enablement and communication readiness | [ ] |
| Communication Dispatch APIs call Workflow Engine before send/resend | [ ] |
| Dashboard status widgets read workflow states from shared PMS constants only | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for invalid transition, closed quarter, reopened quarter, cancelled cycle, archived cycle, and frozen decision mutation | [ ] |
| QA Review Completed | [ ] |
| Architect Review Completed | [ ] |
| Source Traceability Verified Against FSD | [ ] |
| Final Confirmation Done | [ ] |

## 1.2 Dynamic Access Engine Foundation

### Functional Description
Evaluates PMS access using role, assignment, hierarchy scope, workflow state, section visibility, field visibility, and deny-over-allow rules. This must remain centralized and server-side.

### Dependencies
FSD sections 3, 13, 15, 24, 25; Role & Permission Screen; Permission Simulation Screen.

### API Checklist
| Task | Status |
|---|---|
| Runtime access evaluation implemented using Role + Assignment + Hierarchy Scope + Workflow State + Section/Field Visibility | [ ] |
| Seeded PMS actors supported: Employee, Manager, HR/Admin, Management, Director | [ ] |
| Custom role support implemented without code deployment dependency | [ ] |
| Hierarchy scopes supported: direct-report, department, business-unit, region, global | [ ] |
| Assignment authorization implemented for manager, delegated, reassigned, HR/Admin override, and scoped Director access | [ ] |
| DENY overrides ALLOW for confidential fields, restricted sections, and hidden appraisal data | [ ] |
| Section permission evaluation supports visible, hidden, editable, and read-only | [ ] |
| Field permission evaluation supports visibility, editability, mandatory rules, scoring inclusion, and workflow-stage editability | [ ] |
| API authorization middleware/guard applied to all PMS routes | [ ] |
| API Unit Testing Completed for each actor and action in the FSD permission matrix | [ ] |
| API Tested via Postman for authorized, unauthorized, restricted, delegated, reassigned, and scoped access | [ ] |
| API Error Responses Verified for unauthorized access, forbidden assignment, hidden field, and invalid permission configuration | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Employee can create objectives only within allowed assignment and state | [ ] |
| Manager can create objectives, approve objectives, return objectives, and submit quarterly reviews only within approved scope | [ ] |
| HR/Admin override actions enforce audit reason where required | [ ] |
| Management can access annual appraisal decision sections and confidential decision data | [ ] |
| Director access remains read-only unless explicitly configured | [ ] |
| Access Simulation is HR/Admin only | [ ] |
| Hidden fields are absent from API responses and not inferable through null placeholders or partial masking | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Objective Management integrated with accessService/canPerform logic | [ ] |
| Quarterly Review integrated with accessService/canPerform logic | [ ] |
| Annual Appraisal Decision integrated with accessService/canPerform logic | [ ] |
| Visibility Governance integrated with accessService/canPerform logic | [ ] |
| Communication Dispatch integrated with accessService/canPerform logic | [ ] |
| Dashboard and Reporting integrated with visibility-safe permission filtering | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Permission Handling Tested for every FSD role/action matrix row | [ ] |
| QA Review Completed | [ ] |
| Security Review Completed | [ ] |
| Source Traceability Verified Against FSD | [ ] |
| Final Confirmation Done | [ ] |

## 1.3 Audit, History, Snapshot, and Correction Governance

### Functional Description
Maintains complete audit trails, immutable finalized snapshots, correction layers, original value preservation, template version preservation, and communication version preservation.

### Dependencies
FSD sections 12, 17, 23, 25, 27, 30; all transactional modules.

### API Checklist
| Task | Status |
|---|---|
| Audit helper/service implemented for objective changes, manager reviews, annual decisions, visibility changes, communication dispatch, overrides, reopens, reassignment, permission changes, and visibility publication | [ ] |
| Audit fields captured: actor, timestamp, action, entity, previous state/value, updated state/value, reason where required, assignment context, workflow state | [ ] |
| Correction-layer model implemented without overwriting historical manager submissions | [ ] |
| Finalized quarter and annual snapshots made immutable through standard APIs | [ ] |
| Template version linkage preserved for historical assignment rendering | [ ] |
| Historical communication content, rendered output, and template versions preserved after dispatch | [ ] |
| Override actions require mandatory reason, actor, timestamp, original value, and updated value | [ ] |
| Reopen actions require mandatory reason and snapshot preservation | [ ] |
| API Unit Testing Completed for audit generation and immutable record protection | [ ] |
| API Tested via Postman for override, reopen, reassignment, visibility publish, communication send, and finalized edit rejection | [ ] |
| API Error Responses Verified for missing reason, finalized edit attempt, and direct mutation attempt | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Audit History Screen displays immutable audit and correction history | [ ] |
| Audit History Screen separates original record values from amendment/correction values | [ ] |
| Audit History Screen shows actor, timestamp, action, reason, original value, updated value, and workflow context | [ ] |
| Audit History Screen supports restricted employee/manager view, scoped Director view, and full HR/Admin/Management view | [ ] |
| Empty audit state shown when no audit entries exist for accessible record | [ ] |
| Loading, error, retry, and network failure states implemented for audit history | [ ] |
| Manual UI Testing Completed for audit filters and record visibility | [ ] |
| Responsive UI Verified | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Finalized record edits are blocked through standard edit APIs | [ ] |
| Correction workflow preserves original values permanently | [ ] |
| Reopened quarter preserves prior finalization snapshot | [ ] |
| Reopened annual decision preserves frozen decision snapshot | [ ] |
| Historical assigned templates render using original template version | [ ] |
| Historical communication does not change after resend | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Audit integration verified across Objective, Quarterly Review, Annual Decision, Visibility, Communication, Access, SLA, Delegation, and Reassignment modules | [ ] |
| Dashboard reopen tracking reads audit and correction data accurately | [ ] |
| Reporting export includes audit-safe fields only | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for reopened finalized quarter, frozen annual correction, duplicate dispatch, visibility disabled after publish, and manager reassignment | [ ] |
| QA Review Completed | [ ] |
| Audit/Compliance Review Completed | [ ] |
| Source Traceability Verified Against FSD | [ ] |
| Final Confirmation Done | [ ] |

---

# 2. Annual Cycle Setup Screen

## 2.1 Annual Parent Cycle Creation and Q1-Q4 Configuration

### Functional Description
Allows HR/Admin to create an annual parent cycle containing Q1, Q2, Q3, and Q4 child quarter records with independent quarter objectives, reviews, finalization dates, SLA tracking, and audit history.

### Dependencies
Template Management, Workflow Engine, SLA & Escalation, Communication Dispatch, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| POST `/pms/cycles` implemented for annual parent cycle creation | [ ] |
| API supports annual cycle code, name, start date, end date, status, active template version, quarter setup, visibility rules, and appraisal window configuration | [ ] |
| API creates exactly Q1, Q2, Q3, and Q4 child quarter records for the annual parent cycle | [ ] |
| Quarter records persist independent objective, review, evaluation, finalization, SLA, and audit containers | [ ] |
| Cycle code uniqueness validation implemented | [ ] |
| Cycle start date before end date validation implemented | [ ] |
| Quarter dates must fall within annual cycle dates validation implemented | [ ] |
| Only active PMS template versions selectable for new cycle setup | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for duplicate cycle code, invalid date range, missing quarter, inactive template, and unauthorized access | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Annual Cycle Setup Screen implemented for HR/Admin | [ ] |
| Cycle create form includes annual cycle details, Q1-Q4 dates, active template version selection, milestone windows, visibility rules, and appraisal windows | [ ] |
| Q1-Q4 configuration UI prevents missing or duplicated quarter records | [ ] |
| Active template version dropdown/list hides inactive template versions | [ ] |
| Save/update flow implemented | [ ] |
| Cancel/reset flow implemented without persisting partial cycle data | [ ] |
| Duplicate cycle code validation message displayed | [ ] |
| Required validation messages displayed for annual cycle and quarter fields | [ ] |
| Date range validation messages displayed for annual and quarter dates | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Annual Parent Cycle contains Q1, Q2, Q3, Q4 exactly | [ ] |
| Quarter independence verified for objective, review, evaluation, finalization, SLA, and audit data | [ ] |
| Annual finalization dependency validation prepared for all applicable quarters | [ ] |
| Form required, min/max date, duplicate, and invalid-template validations checked | [ ] |
| Permission handling verified for HR/Admin create/edit and non-HR/Admin restricted access | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Cycle creation integrates with active Template Version locking | [ ] |
| Cycle creation initializes Workflow Engine state as DRAFT/SCHEDULED according to configured launch flow | [ ] |
| Cycle creation integrates with Audit Governance | [ ] |
| Cycle creation integrates with SLA configuration records | [ ] |
| Cycle data available to Assignment, Dashboard, Reporting, Objective, Review, Annual Decision, Visibility, and Communication modules | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for duplicate cycle, missing quarter, invalid quarter outside annual range, inactive template, and cancelled cycle | [ ] |
| QA Review Completed | [ ] |
| PM Status Review Completed | [ ] |
| Source Traceability Verified Against FR-CYC-01 through FR-CYC-05 | [ ] |
| Final Confirmation Done | [ ] |

## 2.2 Milestone Windows, Appraisal Windows, and Cycle Launch

### Functional Description
Supports configurable objective setting, objective approval, manager review, quarter finalization, and annual appraisal windows using fixed dates, relative offsets, and quarter dependency logic.

### Dependencies
Workflow Engine, SLA & Escalation, Annual Cycle Setup, Dashboard.

### API Checklist
| Task | Status |
|---|---|
| Objective Setting window configuration implemented for each quarter | [ ] |
| Objective Approval window configuration implemented for each quarter | [ ] |
| Manager Review window configuration implemented for each quarter | [ ] |
| Quarter Finalization window configuration implemented for each quarter | [ ] |
| Parent annual appraisal window configuration implemented | [ ] |
| Fixed date appraisal window support implemented | [ ] |
| Relative offset rule support implemented, including quarter dependency logic | [ ] |
| Window sequence validation implemented to prevent conflicting objective/review/finalization windows | [ ] |
| Parent appraisal window blocked until applicable quarters are finalized or closed | [ ] |
| Cycle launch, close, archive, and cancel where allowed implemented through approved workflow states | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for window conflict, invalid offset, invalid state, unauthorized launch, and dependency failure | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Milestone window configuration UI implemented inside Annual Cycle Setup Screen | [ ] |
| Fixed date and relative offset entry controls implemented | [ ] |
| Window conflict warnings shown before save/launch | [ ] |
| Launch cycle action visible only to authorized HR/Admin users | [ ] |
| Close, archive, and cancel controls follow permission and workflow visibility | [ ] |
| Clear validation messages shown for sequence conflicts and dependency failures | [ ] |
| Loading, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed for save, update, launch, close, archive, cancel | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Objective and review windows do not conflict within same quarter | [ ] |
| Appraisal window cannot open before applicable quarter completion | [ ] |
| Relative offsets are stored and audited | [ ] |
| Invalid transition attempts from launch/close/archive/cancel are rejected | [ ] |
| SLA due dates derive consistently from milestone windows | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Dashboard receives cycle status and milestone progress | [ ] |
| SLA reminders and escalations derive from configured windows | [ ] |
| Notifications use Objective window open and Appraisal window open triggers | [ ] |
| Assignment creation uses launched/active cycle data | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for fixed dates, relative offsets, Q4 completion + N days, window overlap, cancelled cycle, archived cycle | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-CYC-04, FR-CYC-05, FR-SLA-01, FR-SLA-02 | [ ] |
| Final Confirmation Done | [ ] |

---

# 3. Template Management Screen

## 3.1 PMS Template, Versioning, Sections, and Fields

### Functional Description
Allows HR/Admin to create PMS templates, manage versions, configure quarter-aware and annual sections, configure objective/review/appraisal fields, and preserve historical template links once assigned.

### Dependencies
Annual Cycle Setup, Assignment Management, Dynamic Access Engine, Visibility Governance, Communication Dispatch, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| Create Template API implemented | [ ] |
| Update Template metadata API implemented | [ ] |
| Create Template Version API implemented | [ ] |
| Clone Template Version API implemented | [ ] |
| Activate Template Version API implemented | [ ] |
| Deactivate Template Version API implemented | [ ] |
| Get Template and Get Template Version APIs implemented | [ ] |
| Configure Sections API implemented for quarter-aware, annual-level, objective, quarter review, and final appraisal decision sections | [ ] |
| Configure Fields API implemented for field type, required rules, visibility rules, editability rules, mandatory rules, scoring participation, and workflow-stage editability | [ ] |
| Template code uniqueness validation implemented | [ ] |
| Assigned template versions locked from structural edits | [ ] |
| Structural changes require new Template Version | [ ] |
| Hidden fields excluded from unauthorized API responses | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for duplicate template code, editing locked version, invalid quarter-aware setup, inactive version selection, hidden field exposure | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Template Management Screen implemented for HR/Admin | [ ] |
| Template create/update form includes code, name, metadata, status, sections, fields, and version details | [ ] |
| Section builder supports Q1-Q4 quarter-aware repetition | [ ] |
| Section builder supports annual appraisal and communication-related sections | [ ] |
| Field builder supports required, field type, scoring, visibility, editability, mandatory, and workflow-stage settings | [ ] |
| Clone version action implemented | [ ] |
| Activate/deactivate controls implemented with permission handling | [ ] |
| Locked assigned template versions display read-only state | [ ] |
| Preview PMS form template implemented | [ ] |
| Required validation, duplicate prevention, save/update flow, cancel/reset flow, and success/error messages implemented | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Only HR/Admin can create, edit, clone, activate, deactivate, and configure templates | [ ] |
| Management can view final appraisal sections only where permission allows | [ ] |
| Employees and Managers cannot modify templates | [ ] |
| Director access is read-only and scoped | [ ] |
| Required field rules are configurable and enforced downstream | [ ] |
| Field visibility respects role, hierarchy, workflow state, quarter, and publish flag | [ ] |
| Historical assigned template versions remain unchanged after new version activation | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Annual Assignment locks selected PMS Template Version | [ ] |
| Objective Entry renders objective fields from locked template version | [ ] |
| Quarterly Review renders review fields from locked template version | [ ] |
| Annual Appraisal renders final decision fields from locked template version | [ ] |
| Visibility Governance respects template field/section rules | [ ] |
| Audit History renders historical records using original template version | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for active old assignments, inactive template, locked version edit, hidden field leak, and template used by active cycle | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-HR-01, FR-AUD-04, Template requirements in FSD and prompts | [ ] |
| Final Confirmation Done | [ ] |

## 3.2 Letter Template Builder and Template Preview

### Functional Description
Supports dynamic communication templates, outcome mapping, placeholders, conditional blocks, preview, activation, and immutable version locking for generated/sent communications.

### Dependencies
Annual Appraisal Decision, Communication Dispatch, Visibility Governance, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| Create Letter Template API implemented | [ ] |
| Preview Letter Template API implemented | [ ] |
| Activate Letter Template API implemented | [ ] |
| Outcome mapping implemented for BOTH, MERIT_ONLY, GRADE_ONLY, NIL | [ ] |
| Placeholder resolution implemented for employeeName, finalGrade, meritAmount, quarterSummary | [ ] |
| Conditional block syntax validation implemented | [ ] |
| Missing required placeholder validation implemented before activation | [ ] |
| Letter template version locked when communication is generated or sent | [ ] |
| Historical communication templates protected from changes after dispatch | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for missing mapping, invalid placeholder, invalid conditional block, unauthorized activation | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Letter Template Builder UI implemented | [ ] |
| Outcome mapping UI implemented for BOTH, MERIT_ONLY, GRADE_ONLY, NIL | [ ] |
| Placeholder insertion/validation support implemented | [ ] |
| Conditional block entry/validation support implemented | [ ] |
| Preview rendered communication before activation and dispatch | [ ] |
| Activate letter template action permission-gated to HR/Admin | [ ] |
| Success/error messages implemented for preview, activation, and validation failures | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Letter placeholders validated before activation | [ ] |
| Conditional blocks syntactically valid before activation | [ ] |
| Missing outcome template mapping prevents communication generation | [ ] |
| Historical communication output remains immutable after dispatch | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Communication Preview resolves correct template based on appraisalOutcomeType | [ ] |
| Communication Dispatch preserves template version, rendered output, actor, timestamp, and delivery status | [ ] |
| Resend uses preserved historical record without altering original content | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for NIL outcome, missing finalGrade, missing meritAmount, missing quarterSummary, invalid conditional block, duplicate dispatch | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-COM-01 through FR-COM-09 | [ ] |
| Final Confirmation Done | [ ] |

---

# 4. Quarter Assignment Screen

## 4.1 Employee Assignment, Bulk Assignment, and Quarter Assignment Creation

### Functional Description
Allows HR/Admin to assign employees and managers to annual and quarterly cycles, including bulk assignment. Assignment records provide the dependency for objectives, manager review, visibility, access, and annual appraisal.

### Dependencies
Annual Cycle Setup, Dynamic Access Engine, Workflow Engine, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| Assignment API implemented for assigning employees to annual cycle and Q1-Q4 quarter assignments | [ ] |
| Bulk assignment API implemented with configurable batching for large-volume assignment | [ ] |
| Assigned manager persisted for each annual/quarter assignment | [ ] |
| Due dates, objective status, quarter review status, and current workflow state initialized | [ ] |
| Mid-year onboarding supported by assigning remaining applicable quarters only | [ ] |
| Employee exit supported by closing future quarter assignments | [ ] |
| Assignment ownership and hierarchy authorization enforced server-side | [ ] |
| Assignment creation audit events generated | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for unauthorized assign, duplicate assignment, invalid cycle, invalid manager, invalid quarter, and batch partial failures | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Quarter Assignment Screen implemented for HR/Admin | [ ] |
| Individual employee assignment flow implemented | [ ] |
| Bulk assignment flow implemented with batch progress, success count, failure count, and downloadable/reviewable error results | [ ] |
| Manager selection and reassignment-ready assignment context displayed | [ ] |
| Annual cycle, quarter name, assigned manager, due dates, objective status, review status, and workflow state shown in assignment table | [ ] |
| Assignment table supports search, filters, sorting, pagination, row actions, empty state, and performance handling | [ ] |
| Export for assignment list implemented if used for reporting-ready tracking | [ ] |
| Required validations and duplicate prevention implemented | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Employees see only assigned quarterly performance assignments | [ ] |
| Managers only see employees within direct-report, configured hierarchy, delegated, or reassigned scope | [ ] |
| Bulk assignment validates every row without silently skipping failed rows | [ ] |
| Mid-year onboarding creates only applicable remaining quarter assignments | [ ] |
| Employee exit closes future quarter assignments without altering historical quarters | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Objective Entry depends on valid Quarter Assignment | [ ] |
| Quarterly Review depends on approved objectives within valid Quarter Assignment | [ ] |
| Annual Appraisal Summary aggregates assigned quarters | [ ] |
| Dashboard reads assignment status and completion progress | [ ] |
| Access Engine evaluates manager assignment ownership | [ ] |
| Audit History shows assignment and bulk assignment events | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for duplicate assignment, mid-year joiner, exit during cycle, partial batch failure, unauthorized manager, and large batch | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-HR-03, FR-EMP-01, FR-MGR-06, FR-CYC-02, FR-DSH-04 | [ ] |
| Final Confirmation Done | [ ] |

## 4.2 Reassignment, Delegation, Force Close, and Reopen Entry Points

### Functional Description
Supports HR/Admin reassignment, temporary delegation, force-close assignments, and reopen entry points while preserving historical ownership attribution and audit records.

### Dependencies
Dynamic Access Engine, Audit Governance, Workflow Engine, Delegation & Reassignment.

### API Checklist
| Task | Status |
|---|---|
| Temporary delegation API implemented | [ ] |
| Delegated action attribution persists original owner and acting delegate | [ ] |
| Permanent reassignment API implemented for future ownership only | [ ] |
| Prior approvals remain attributed to original actors after reassignment | [ ] |
| Force-close assignment API/action implemented according to workflow rules | [ ] |
| Reopen finalized quarter/annual entry points enforce mandatory reason and snapshot preservation | [ ] |
| Assignment, delegation, reassignment, force-close, and reopen audit events generated | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for missing reason, delegation conflict, invalid reassignment, historical mutation attempt, unauthorized force close | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Delegation UI implemented with original owner, delegate, effective period, and scope | [ ] |
| Reassignment UI implemented with future ownership warning and historical attribution display | [ ] |
| Force-close action implemented with confirmation and reason where required | [ ] |
| Reopen action implemented with mandatory reason capture | [ ] |
| Historical ownership attribution visible in assignment/review/audit views | [ ] |
| Validation messages shown for missing reason, invalid dates, and delegation conflicts | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Delegation conflict resolution marked Pending Business Clarification where business rule is not finalized | [ ] |
| Permanent reassignment affects only future ownership | [ ] |
| Prior approvals are never reassigned retroactively | [ ] |
| Force-close preserves audit and workflow traceability | [ ] |
| Reopen without mandatory reason is rejected | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Access Engine recognizes delegated scope | [ ] |
| Access Engine recognizes reassigned future scope | [ ] |
| Dashboard reopen tracking and SLA status reflect force-close/reopen events | [ ] |
| Notifications trigger Reopen initiated event to impacted stakeholders | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for manager reassignment, delegation overlap, historical attribution, future ownership, force close, and reopened finalized record | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-DEL-01, FR-DEL-02, FR-RAS-01, FR-RAS-02, FR-HR-03, FR-HR-07 | [ ] |
| Final Confirmation Done | [ ] |

---

# 5. Objective Entry Screen

## 5.1 Employee Objective Creation, Edit, Revision, and Submission

### Functional Description
Allows employees to create, edit, revise, and submit quarterly objectives during OBJECTIVE_SETTING_OPEN and OBJECTIVE_REVISION_REQUIRED. Objective fields include title, description, KPI/measurement, target value, due date, weightage, success criteria, and optional attachment references.

### Dependencies
Quarter Assignment, Template Management, Workflow Engine, Dynamic Access Engine, Audit Governance, SLA/Notifications.

### API Checklist
| Task | Status |
|---|---|
| POST `/pms/quarter-assignments/{id}/objectives` implemented | [ ] |
| PUT `/pms/objectives/{id}` implemented | [ ] |
| POST `/pms/objectives/{id}/submit` implemented | [ ] |
| Objective payload supports title, description, KPI/measurement, target value, due date, weightage, success criteria, optional attachment references | [ ] |
| Employee objective creation/edit allowed only during OBJECTIVE_SETTING_OPEN and OBJECTIVE_REVISION_REQUIRED | [ ] |
| Employee submission transitions objective/quarter state to OBJECTIVE_SUBMITTED | [ ] |
| Required field validation enforced on submission | [ ] |
| Weightage validates against configured scoring rules | [ ] |
| Objective changes audit logged | [ ] |
| Objective submitted notification generated for Managers | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for missing mandatory fields, invalid state, invalid weightage, unauthorized assignment, finalized edit, and invalid attachment reference | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Objective Entry Screen implemented for employees | [ ] |
| Assignment context displayed: annual cycle, quarter name, assigned manager, objective status, quarter review status, due dates, current workflow state | [ ] |
| Objective form includes title, description, KPI/measurement, target value, due date, weightage, success criteria, optional attachment references | [ ] |
| Add/edit/delete objective row or section behavior implemented according to template structure | [ ] |
| Submit objectives flow implemented with confirmation and success/error messages | [ ] |
| Revision flow displays manager return comments and allows edits only in OBJECTIVE_REVISION_REQUIRED | [ ] |
| Approved objectives render read-only unless reopened by HR/Admin | [ ] |
| Form required validation, date validation, min/max or configured scoring validation, duplicate prevention where applicable, save/update, cancel/reset implemented | [ ] |
| Attachment reference UI supports validation and displays Pending Business Clarification for file size/format limitations if upload is implemented | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Objectives cannot be created or edited outside OBJECTIVE_SETTING_OPEN or OBJECTIVE_REVISION_REQUIRED | [ ] |
| Required objective fields enforced before submission | [ ] |
| Weightage validates against configured scoring rules | [ ] |
| Objective due date validated against quarter/cycle rules where configured | [ ] |
| Optional attachment references validated and no unsupported upload rule invented beyond Pending Business Clarification | [ ] |
| Hidden template fields are not shown in UI and not returned in API | [ ] |
| Employee cannot access another employee assignment | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Objective Entry integrates with Quarter Assignment context | [ ] |
| Objective Entry integrates with Template field/section configuration | [ ] |
| Objective Entry integrates with Workflow Engine transition to OBJECTIVE_DRAFT and OBJECTIVE_SUBMITTED | [ ] |
| Objective Entry integrates with SLA reminders for objective submission | [ ] |
| Objective Entry integrates with Notifications for objective window open and objective submitted | [ ] |
| Objective Entry integrates with Audit History | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for empty objective list, missing required fields, invalid weightage, expired window, revision resubmit, network failure, unauthorized assignment | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-EMP-01 through FR-EMP-03, FR-OBJ-01 through FR-OBJ-07 | [ ] |
| Final Confirmation Done | [ ] |

## 5.2 Manager-Created Objective Auto Approval

### Functional Description
Allows managers to create objectives directly for assigned/scoped employees. Manager-created objectives automatically transition to OBJECTIVE_APPROVED, bypass employee submission and manager approval stages, and persist `source = MANAGER_CREATED`.

### Dependencies
Quarter Assignment, Dynamic Access Engine, Workflow Engine, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| Manager objective creation supported through objective API with manager-authorized assignment scope | [ ] |
| Manager-created objective persists `source = MANAGER_CREATED` | [ ] |
| Manager-created objective automatically transitions to OBJECTIVE_APPROVED | [ ] |
| Manager-created objective bypasses employee submission stage | [ ] |
| Manager-created objective bypasses manager approval stage | [ ] |
| Manager objective creation validates same objective fields and weightage rules | [ ] |
| Manager objective creation audit logs source and actor | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for unauthorized scope, invalid weightage, missing fields, invalid state | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Manager objective creation UI implemented in manager context | [ ] |
| Manager-created objective indicator/source shown where appropriate | [ ] |
| Auto-approved read-only state shown after successful manager creation | [ ] |
| Employee-facing view reflects approved objective subject to configured visibility | [ ] |
| Required validation, save/update flow, cancel/reset flow, success/error messages implemented | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Manager can create objectives only for assigned, hierarchy-authorized, delegated, or reassigned employees | [ ] |
| Auto approval does not require employee approval | [ ] |
| Auto approval does not create employee submission audit event | [ ] |
| Objective locking applies after auto approval | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Manager-created objectives available to Quarterly Review as approved objectives | [ ] |
| Audit History distinguishes MANAGER_CREATED objectives from employee-submitted objectives | [ ] |
| Dashboard counts manager-created objectives in objective completion metrics | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for manager scope violation, existing employee draft, weightage conflict, auto-approved lock, historical audit | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-MGR-07 | [ ] |
| Final Confirmation Done | [ ] |

---

# 6. Objective Approval Screen

## 6.1 Manager Objective Review, Approval, and Return for Revision

### Functional Description
Allows managers to review submitted objectives for assigned/scoped employees, approve them, or return them for revision with mandatory comments.

### Dependencies
Objective Entry, Quarter Assignment, Workflow Engine, Dynamic Access Engine, Audit Governance, Notifications.

### API Checklist
| Task | Status |
|---|---|
| POST `/pms/objectives/{id}/approve` implemented | [ ] |
| POST `/pms/objectives/{id}/return` implemented | [ ] |
| Manager access to submitted objectives and quarter context implemented | [ ] |
| Objective approval transitions OBJECTIVE_SUBMITTED to OBJECTIVE_APPROVED | [ ] |
| Objective return transitions OBJECTIVE_SUBMITTED to OBJECTIVE_REVISION_REQUIRED | [ ] |
| Return for revision requires mandatory manager comments | [ ] |
| Approved objectives become read-only unless reopened by HR/Admin | [ ] |
| Objective approved/returned audit events generated | [ ] |
| Objective returned notification generated for Employees | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for missing return comment, unauthorized manager, invalid state, duplicate approval, finalized edit | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Objective Approval Screen implemented for managers | [ ] |
| Submitted objective list/table displays employee, annual cycle, quarter, objective details, weightage, due dates, status, and current workflow state | [ ] |
| Table supports search, filter by cycle/quarter/status/employee, sorting, pagination, row actions, empty state, and performance handling | [ ] |
| Manager can view objective details and quarter context before approval/return | [ ] |
| Approve action implemented with confirmation and success/error message | [ ] |
| Return for revision modal implemented with mandatory comment field | [ ] |
| Returned comment visible to employee in Objective Entry Screen | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Manager cannot approve objectives outside authorized scope | [ ] |
| Manager cannot approve objectives outside OBJECTIVE_SUBMITTED state | [ ] |
| Return comment is mandatory and persisted | [ ] |
| Approved objectives are locked/read-only | [ ] |
| Revision-required objectives become editable only to employee during permitted state | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Approved objectives unlock manager quarterly evaluation context | [ ] |
| Returned objectives reappear in employee Objective Entry Screen with comments | [ ] |
| Manager Dashboard pending objective approvals count updates | [ ] |
| Notifications fire for objective returned | [ ] |
| Audit History shows approval/return details | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for no submitted objectives, duplicate approval, return without comment, unauthorized scope, network retry, and stale state | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-MGR-01 through FR-MGR-03, FR-OBJ-04 through FR-OBJ-06 | [ ] |
| Final Confirmation Done | [ ] |

---

# 7. Quarterly Review Screen

## 7.1 Manager Quarterly Evaluation Entry and Submission

### Functional Description
Allows managers to access approved objective evaluation context, historical quarter context, enter quarterly evaluation result, comments, achievements, development observations, recommendations, and submit the quarterly review.

### Dependencies
Approved Objectives, Quarter Assignment, Template Management, Workflow Engine, Dynamic Access Engine, Audit Governance, SLA/Notifications.

### API Checklist
| Task | Status |
|---|---|
| POST `/pms/quarter-reviews/{id}/submit` implemented | [ ] |
| Manager can access approved objectives and historical quarter context within authorized scope | [ ] |
| Review payload supports quarterly evaluation result, manager comments, achievements, development observations, and recommendations | [ ] |
| Submission requires all mandatory review fields | [ ] |
| Review submission transitions MANAGER_REVIEW_OPEN to MANAGER_REVIEW_SUBMITTED | [ ] |
| Quarterly review audit event generated | [ ] |
| Quarterly review pending and overdue notification/SLA hooks implemented | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for missing mandatory review fields, unauthorized manager, no approved objectives, invalid state, finalized record | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Quarterly Review Screen implemented for managers | [ ] |
| Approved objective evaluation context displayed | [ ] |
| Historical quarter context displayed where available and permitted | [ ] |
| Quarterly evaluation result entry implemented | [ ] |
| Manager comments entry implemented | [ ] |
| Achievements entry implemented | [ ] |
| Development observations entry implemented | [ ] |
| Recommendations entry implemented | [ ] |
| Submit review action implemented with confirmation and success/error message | [ ] |
| Review form respects template required fields and field visibility/editability | [ ] |
| Review list/table supports search, filters, sorting, pagination, row actions, empty state, and performance handling | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Review cannot start without approved objectives unless permitted by configured workflow rule | [ ] |
| Mandatory review fields enforced on submission | [ ] |
| Manager cannot review outside direct-report, hierarchy, delegated, or reassigned scope | [ ] |
| Review cannot be submitted outside MANAGER_REVIEW_OPEN | [ ] |
| Employee cannot enter quarterly review | [ ] |
| Director view is read-only unless explicitly configured | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Manager Dashboard pending quarterly reviews and overdue reviews update after submission | [ ] |
| Quarter finalization becomes available after successful manager review submission | [ ] |
| Employee finalized review visibility respects Visibility Governance | [ ] |
| Annual Summary receives submitted/finalized quarter review data | [ ] |
| SLA status updates when review is submitted | [ ] |
| Audit History shows manager review details and actor attribution | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for no approved objectives, missing review fields, overdue review, manager reassignment, delegated reviewer, network failure, stale workflow state | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-MGR-04, FR-MGR-05, FR-MQR-01 through FR-MQR-04 | [ ] |
| Final Confirmation Done | [ ] |

## 7.2 Quarter Finalization and Reopen

### Functional Description
Allows quarter finalization after manager review submission by system automation or authorized HR/Admin users. HR/Admin can reopen finalized quarter records with mandatory audit capture.

### Dependencies
Quarterly Review Submission, Workflow Engine, Audit Governance, Annual Appraisal Dependency.

### API Checklist
| Task | Status |
|---|---|
| POST `/pms/quarter-reviews/{id}/finalize` implemented | [ ] |
| POST `/pms/quarter-reviews/{id}/reopen` implemented | [ ] |
| Quarter finalization transitions MANAGER_REVIEW_SUBMITTED to QUARTER_FINALIZED according to workflow rules | [ ] |
| System automation finalization supported where configured | [ ] |
| Authorized HR/Admin finalization supported | [ ] |
| Quarter reopen restricted to HR/Admin users | [ ] |
| Quarter reopen requires mandatory reason and snapshot preservation | [ ] |
| CLOSED_BY_ADMIN handling implemented for applicable active quarter states | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for finalize before review submission, unauthorized reopen, missing reason, finalized mutation attempt | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Quarter finalization action displayed to authorized HR/Admin users where workflow allows | [ ] |
| Automation-finalized quarter status displayed clearly | [ ] |
| Reopen finalized quarter action implemented with mandatory reason modal | [ ] |
| Finalized quarter read-only state shown to all non-reopen flows | [ ] |
| Original values and correction layer available through Audit History | [ ] |
| Success/error messages implemented for finalize and reopen | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Quarter finalization only after successful review submission | [ ] |
| Finalized quarter standard edits blocked | [ ] |
| Reopen without reason rejected | [ ] |
| Reopened quarter preserves original finalized snapshot | [ ] |
| Annual dependency recalculates readiness without changing historical values | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Annual Appraisal Decision readiness updates after all applicable quarters are finalized or closed | [ ] |
| Dashboard quarter completion tracking updates | [ ] |
| HR/Admin notified on quarter finalized | [ ] |
| Reopen initiated notification sent to impacted stakeholders | [ ] |
| Audit History displays finalization and reopen events | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for finalizing without review, reopening finalized quarter, closed-by-admin quarter, annual readiness after reopen, correction preservation | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-MQR-05, FR-MQR-06, FR-CYC-03, FR-AUD-02, FR-AUD-03 | [ ] |
| Final Confirmation Done | [ ] |

---

# 8. Annual Appraisal Screen

## 8.1 Annual Summary and Appraisal Decision Draft

### Functional Description
Allows Management and authorized HR/Admin users to review quarterly summaries, annual rollups, and create annual appraisal decisions only after all applicable quarters are finalized or closed.

### Dependencies
Finalized/Closed Quarter Assignments, Workflow Engine, Dynamic Access Engine, Visibility Governance, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| GET `/pms/annual-assignments/{id}/summary` implemented | [ ] |
| PUT `/pms/annual-assignments/{id}/decision` implemented | [ ] |
| Annual summary includes quarterly summaries, annual rollups, quarter statuses, and appraisal readiness | [ ] |
| Appraisal decision draft allowed only after applicable quarters are QUARTER_FINALIZED or CLOSED_BY_ADMIN | [ ] |
| Decision fields support independent `isGradeApplied` and `isMeritApplied` flags | [ ] |
| Decision draft audit event generated | [ ] |
| Confidential appraisal fields restricted to Management/authorized HR/Admin before publication | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for incomplete quarters, unauthorized access, hidden confidential fields, invalid decision values | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Annual Appraisal Screen implemented for Management and authorized HR/Admin users | [ ] |
| Quarterly summaries displayed by Q1, Q2, Q3, Q4 with finalized/closed state | [ ] |
| Annual rollup section displayed | [ ] |
| Appraisal readiness indicator displayed | [ ] |
| Grade decision entry implemented | [ ] |
| Merit decision entry implemented | [ ] |
| Independent grade and merit applied flags implemented | [ ] |
| Confidential sections hidden from employees until publication | [ ] |
| Save draft flow implemented with success/error messages | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Annual decision draft blocked until all applicable quarters are finalized or closed | [ ] |
| Confidential annual appraisal data hidden by default | [ ] |
| HR/Admin and Management access verified | [ ] |
| Director has no final decision access unless future permission config explicitly allows read-only visibility | [ ] |
| Hidden fields are not returned in unauthorized API responses | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Annual Summary consumes Quarter Review and Quarter Finalization data | [ ] |
| Dashboard appraisal readiness uses same annual dependency validation | [ ] |
| Audit History displays annual decision draft events | [ ] |
| Visibility Governance depends on annual finalized/frozen decision | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for incomplete quarters, closed-by-admin quarter, reopened quarter, unauthorized employee access, nil decision draft | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-MGT-01, FR-MGT-02, FR-AFR-01, FR-CYC-03 | [ ] |
| Final Confirmation Done | [ ] |

## 8.2 Outcome Derivation, Decision Submission, Freeze, Finalization, and Reopen

### Functional Description
Derives `appraisalOutcomeType` from grade and merit flags, supports management decision submission, freezes annual decisions before visibility publication, finalizes immutable annual records, and supports controlled HR/Admin reopen with snapshot preservation.

### Dependencies
Annual Summary, Workflow Engine, Visibility Governance, Communication Dispatch, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| Annual decision submission implemented according to MANAGEMENT_DECISION_DRAFT to MANAGEMENT_DECISION_SUBMITTED flow | [ ] |
| POST `/pms/annual-assignments/{id}/freeze` implemented | [ ] |
| Outcome derivation implemented: BOTH when grade and merit applied, MERIT_ONLY when only merit applied, GRADE_ONLY when only grade applied, NIL when neither applied | [ ] |
| Annual decision freeze required before visibility publication | [ ] |
| Annual finalization makes decision immutable except controlled reopen | [ ] |
| HR/Admin annual reopen implemented with mandatory reason, snapshot preservation, and audit logging | [ ] |
| Frozen decision integrity prevents recalculation after template or scoring changes | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for invalid outcome, freeze before decision submission, visibility before freeze, reopen without reason, frozen mutation attempt | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Outcome derivation displayed from grade/merit flags | [ ] |
| Decision submit action implemented with confirmation | [ ] |
| Freeze decision action implemented with confirmation | [ ] |
| Annual finalized read-only state implemented | [ ] |
| Reopen annual decision action implemented for HR/Admin with mandatory reason | [ ] |
| Frozen decision integrity warning/display shown after freeze | [ ] |
| NIL outcome flow displayed without grade/merit publication requirements | [ ] |
| Success/error messages implemented for submit, freeze, finalize, and reopen | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| appraisalOutcomeType derives only from isGradeApplied and isMeritApplied | [ ] |
| Invalid appraisal outcome prevents finalization | [ ] |
| Frozen annual decisions cannot be modified through standard APIs | [ ] |
| Reopen requires mandatory reason and creates correction layer | [ ] |
| Automatic recalculation of frozen decisions is not implemented | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Visibility Governance can only publish after annual decision freeze/finalization | [ ] |
| Communication template selection uses appraisalOutcomeType | [ ] |
| Dashboard appraisal readiness and visibility status update after freeze/finalization | [ ] |
| Audit History shows draft, submit, freeze, finalization, and reopen events | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for BOTH, MERIT_ONLY, GRADE_ONLY, NIL, frozen mutation, reopen after finalization, scoring/template change after freeze | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-AFR-02 through FR-AFR-08, FR-VAL-04, FR-VAL-05 | [ ] |
| Final Confirmation Done | [ ] |

---

# 9. Visibility Governance Screen

## 9.1 Employee and Manager Visibility Publication

### Functional Description
Allows authorized HR/Admin and Management users to explicitly publish visibility for employee review, employee grade, employee merit, manager grade, and manager merit. Final appraisal data remains hidden by default until publication.

### Dependencies
Annual Appraisal Finalization/Freeze, Dynamic Access Engine, Communication Dispatch, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| POST `/pms/annual-assignments/{id}/visibility` implemented | [ ] |
| Visibility controls implemented: employeeGradeVisible, employeeMeritVisible, employeeReviewVisible, managerGradeVisible, managerMeritVisible | [ ] |
| Visibility publication requires explicit HR/Admin or Management action | [ ] |
| Visibility publication blocked before annual finalization/freeze according to workflow | [ ] |
| Final appraisal data hidden by default before publication | [ ] |
| API-level masking implemented so hidden confidential fields are not returned, partially masked, or inferable | [ ] |
| Visibility publication audit event generated | [ ] |
| Visibility enabled notification generated for Employees and Managers | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for unauthorized publish, missing annual finalization, hidden field access, invalid visibility configuration | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Visibility Governance Screen implemented | [ ] |
| Employee review visibility toggle/control implemented | [ ] |
| Employee grade visibility toggle/control implemented | [ ] |
| Employee merit visibility toggle/control implemented | [ ] |
| Manager grade visibility toggle/control implemented | [ ] |
| Manager merit visibility toggle/control implemented | [ ] |
| Publish visibility action implemented with confirmation | [ ] |
| Confidential-by-default state clearly reflected before publication | [ ] |
| Visibility status shown for each annual assignment or batch context | [ ] |
| Success/error messages implemented for visibility publish | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Employee grade hidden until employeeGradeVisible is true | [ ] |
| Employee merit hidden until employeeMeritVisible is true | [ ] |
| Employee review hidden until employeeReviewVisible is true | [ ] |
| Manager grade hidden until managerGradeVisible is true | [ ] |
| Manager merit hidden until managerMeritVisible is true | [ ] |
| Visibility disabled after publish blocks future visibility without altering historical audit | [ ] |
| Hidden values are absent from UI state, API payload, exports, and derived UI labels | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Employee Dashboard shows published annual decisions only according to visibility flags | [ ] |
| Manager Dashboard and views show grade/merit only according to manager visibility flags | [ ] |
| Communication Dispatch blocked until visibility enablement | [ ] |
| Audit History displays visibility publication actions | [ ] |
| Dashboard visibility status updates after publication | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for partial visibility, publish before finalization, visibility disabled after publish, employee API probing, manager hidden merit, NIL outcome | [ ] |
| QA Review Completed | [ ] |
| Security Review Completed | [ ] |
| Source Traceability Verified Against FR-HR-05, FR-VIS-01 through FR-VIS-05, FR-AFR-07 | [ ] |
| Final Confirmation Done | [ ] |

---

# 10. Communication Dispatch Screen

## 10.1 Communication Preview, Send, Resend, and History

### Functional Description
Supports dynamic appraisal communication preview, dispatch, resend, and communication history. Dispatch must occur only after visibility enablement and must preserve rendered content, template version, actor, timestamp, and delivery status.

### Dependencies
Annual Appraisal Decision, Visibility Governance, Letter Template Builder, Workflow Engine, Audit Governance, Notifications.

### API Checklist
| Task | Status |
|---|---|
| POST `/pms/communications/preview` implemented | [ ] |
| POST `/pms/communications/send` implemented | [ ] |
| POST `/pms/communications/resend` implemented | [ ] |
| GET `/pms/communications/history` implemented | [ ] |
| Preview resolves dynamic template based on appraisalOutcomeType | [ ] |
| Preview resolves placeholders employeeName, finalGrade, meritAmount, quarterSummary according to visibility and outcome rules | [ ] |
| Dispatch blocked before visibility enablement | [ ] |
| Dispatch blocked when outcome template mapping is missing | [ ] |
| Send transitions COMMUNICATION_READY to COMMUNICATION_SENT according to workflow | [ ] |
| Dispatch captures actor, timestamp, template version, rendered output, and delivery status | [ ] |
| Resend supported for authorized users without modifying historical records | [ ] |
| Communication dispatched notification generated for Employees | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for missing visibility publish, missing template mapping, unauthorized dispatch, duplicate dispatch, delivery failure | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Communication Dispatch Screen implemented for HR/Admin | [ ] |
| Communication preview UI implemented before dispatch | [ ] |
| Preview displays resolved letter content and locked template version metadata | [ ] |
| Send/dispatch action implemented with confirmation | [ ] |
| Resend action implemented without changing historical rendered communication | [ ] |
| Communication history table shows actor, timestamp, template version, delivery status, outcome type, and resend entries | [ ] |
| Communication history table supports search, filters, sorting, pagination, row actions, empty state, and performance handling | [ ] |
| Delivery failure/error status and retry/resend handling displayed | [ ] |
| Success/error messages implemented for preview, send, resend | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Communication cannot dispatch before visibility enablement | [ ] |
| Communication cannot generate without outcome template mapping | [ ] |
| Placeholder values follow visibility governance and do not leak hidden grade/merit data | [ ] |
| Duplicate dispatch attempt preserves previous dispatch audit | [ ] |
| Resend does not alter original rendered communication or template version | [ ] |
| Bulk communication retry policy marked Pending Business Clarification where needed | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Letter Template Builder provides active outcome mapping | [ ] |
| Annual Appraisal provides frozen appraisalOutcomeType and decision values | [ ] |
| Visibility Governance enables communication readiness | [ ] |
| Audit History records preview/send/resend where required | [ ] |
| Dashboard communication status updates after dispatch | [ ] |
| Notification system sends communication dispatched event | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for missing template mapping, NIL outcome, duplicate dispatch, resend, delivery failure, hidden grade/merit, network failure | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-HR-06, FR-COM-01 through FR-COM-09 | [ ] |
| Final Confirmation Done | [ ] |

---

# 11. Role & Permission Screen

## 11.1 Dynamic Role, Hierarchy Scope, Section, Field, Workflow, and Visibility Permissions

### Functional Description
Allows HR/Admin to configure custom roles, hierarchy scopes, field permissions, section permissions, workflow-state permissions, visibility rules, and role-action permissions.

### Dependencies
Dynamic Access Engine, Permission Simulation, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| POST `/pms/access/roles` implemented | [ ] |
| PUT `/pms/access/permissions` implemented | [ ] |
| Custom role creation implemented without code deployment | [ ] |
| Hierarchy scope configuration implemented for direct-report, department, business-unit, region, global | [ ] |
| Section permission configuration implemented for visible, hidden, editable, read-only | [ ] |
| Field permission configuration implemented for visibility, editability, mandatory rules, scoring inclusion, workflow-stage editability | [ ] |
| Workflow-state permission configuration implemented | [ ] |
| Visibility rule configuration implemented | [ ] |
| Role-action permission configuration implemented using FSD action matrix as baseline | [ ] |
| Deny-over-allow validation implemented for confidential/restricted/hidden appraisal data | [ ] |
| Permission publish validates invalid configuration before activation | [ ] |
| Permission changes audit logged | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for invalid permission config, unauthorized publish, duplicate role, deny/allow conflict | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Role & Permission Screen implemented for HR/Admin | [ ] |
| Custom role create/update form implemented | [ ] |
| Hierarchy scope selector implemented | [ ] |
| Section permission matrix implemented | [ ] |
| Field permission matrix implemented | [ ] |
| Workflow-state permission matrix implemented | [ ] |
| Visibility rule configuration UI implemented | [ ] |
| Role-action matrix UI implemented for Create Objective, Approve Objective, Quarterly Review, Final Decision, Visibility Publish, Communication Dispatch, Access Simulation, History View | [ ] |
| Permission publish action implemented with validation and confirmation | [ ] |
| Invalid configuration messages displayed clearly | [ ] |
| Loader, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| HR/Admin only can configure dynamic roles and permissions | [ ] |
| Permission configuration cannot publish invalid hidden/confidential field exposure | [ ] |
| Deny rules override allow rules | [ ] |
| Field mandatory rules and workflow editability are persisted and applied downstream | [ ] |
| Director remains scoped/read-only unless explicitly configured | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Access Engine reads published permission configuration | [ ] |
| Permission Simulation validates draft permission changes before publish | [ ] |
| Template Management field/section permissions align with access configuration | [ ] |
| Audit History records permission changes | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for duplicate custom role, invalid permission publish, confidential field allow+deny conflict, workflow-state editability, Director read-only override | [ ] |
| QA Review Completed | [ ] |
| Security Review Completed | [ ] |
| Source Traceability Verified Against FR-HR-04, FR-DRP-01 through FR-DRP-08, Permission Matrix | [ ] |
| Final Confirmation Done | [ ] |

## 11.2 Permission Simulation Screen

### Functional Description
Allows HR/Admin to simulate and validate effective permissions before publishing role and permission changes.

### Dependencies
Dynamic Access Engine, Role & Permission Screen, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| POST `/pms/access/simulate` implemented | [ ] |
| Simulation accepts role, user/actor context, assignment, hierarchy scope, workflow state, section, field, and action | [ ] |
| Simulation returns effective allow/deny result with reason trace | [ ] |
| Simulation applies DENY priority over ALLOW | [ ] |
| Simulation verifies confidential field and hidden appraisal data behavior | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for unauthorized simulation, invalid role, invalid assignment, invalid permission configuration | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Permission Simulation Screen implemented for HR/Admin | [ ] |
| Actor/role selector implemented | [ ] |
| Assignment and hierarchy scope selector implemented | [ ] |
| Workflow state selector implemented | [ ] |
| Section/field/action selector implemented | [ ] |
| Effective permission result displayed with allow/deny reason trace | [ ] |
| Simulation result identifies hidden/confidential fields | [ ] |
| Empty, loading, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Only HR/Admin can access simulation | [ ] |
| Simulation result matches runtime access engine | [ ] |
| Deny-over-allow result verified | [ ] |
| Hidden field simulation confirms no UI/API exposure | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Role & Permission publish flow can reference simulation results | [ ] |
| Access Engine uses same evaluator as simulation API | [ ] |
| Audit History records permission publish, not necessarily every simulation unless configured | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for partial hierarchy access, hidden field deny, conflicting permissions, workflow-state restriction, invalid assignment | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-DRP-07 and Permission Matrix | [ ] |
| Final Confirmation Done | [ ] |

---

# 12. Dashboard Screen

## 12.1 HR/Admin Administrative Dashboard

### Functional Description
Provides HR/Admin monitoring of cycle completion, quarter completion tracking, appraisal readiness, visibility status, communication status, SLA breaches, and reopen tracking.

### Dependencies
Cycle, Assignment, Objective, Review, Annual Decision, Visibility, Communication, SLA, Audit.

### API Checklist
| Task | Status |
|---|---|
| Dashboard API/service implemented for HR/Admin cycle monitoring | [ ] |
| Quarter completion tracking data returned | [ ] |
| Appraisal readiness data returned using annual dependency validation | [ ] |
| Visibility status data returned | [ ] |
| Communication status data returned | [ ] |
| SLA breach data returned | [ ] |
| Reopen tracking data returned | [ ] |
| Dashboard data permission-filtered server-side | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for unauthorized dashboard access and invalid filters | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| HR/Admin Dashboard implemented | [ ] |
| Cycle monitoring widget/table implemented | [ ] |
| Quarter completion tracking widget/table implemented | [ ] |
| Appraisal readiness widget/table implemented | [ ] |
| Visibility status widget/table implemented | [ ] |
| Communication status widget/table implemented | [ ] |
| SLA breaches widget/table implemented | [ ] |
| Reopen tracking widget/table implemented | [ ] |
| Dashboard filters for cycle, quarter, department/business unit/region where supported implemented | [ ] |
| Tables support search, sorting, pagination, filters, export where applicable, empty states, and performance handling | [ ] |
| Loading, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Dashboard metrics align with transactional workflow data | [ ] |
| Confidential annual appraisal data hidden unless role/visibility allows | [ ] |
| Reopened and closed-by-admin records counted correctly | [ ] |
| SLA overdue status reflects configured SLA rules | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Dashboard refreshes after cycle launch, assignment, objective submit/approve, review submit, quarter finalization, annual freeze, visibility publish, communication dispatch, reopen | [ ] |
| Dashboard export uses reporting-compatible structure | [ ] |
| Access Engine applied consistently to dashboard aggregations and detail drilldowns | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for no active cycle, large cycle, partial visibility, SLA overdue, reopened records, incomplete quarters | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-DSH-01, FR-DSH-04 | [ ] |
| Final Confirmation Done | [ ] |

## 12.2 Manager Dashboard

### Functional Description
Allows managers to view pending objective approvals, pending quarterly reviews, overdue reviews, and quarter completion for employees within authorized scope.

### Dependencies
Objective Approval, Quarterly Review, SLA, Access Engine.

### API Checklist
| Task | Status |
|---|---|
| Manager dashboard API/service implemented | [ ] |
| Pending objective approvals returned by manager scope | [ ] |
| Pending quarterly reviews returned by manager scope | [ ] |
| Overdue reviews returned using SLA rules | [ ] |
| Quarter completion returned by manager scope | [ ] |
| Delegated and reassigned scopes included where active | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for unauthorized access and out-of-scope employee access | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Manager Dashboard implemented | [ ] |
| Pending objective approvals widget/table implemented | [ ] |
| Pending quarterly reviews widget/table implemented | [ ] |
| Overdue reviews widget/table implemented | [ ] |
| Quarter completion widget/table implemented | [ ] |
| Quick actions route to Objective Approval and Quarterly Review screens | [ ] |
| Tables support search, filters, sorting, pagination, empty state, and performance handling | [ ] |
| Loading, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Manager sees only direct-report, configured hierarchy, delegated, or reassigned scope | [ ] |
| Overdue review status uses configured SLA rules | [ ] |
| Hidden annual grade/merit fields not exposed through manager dashboard unless manager visibility enabled | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Objective Approval counts update after approve/return | [ ] |
| Quarterly Review counts update after submit/finalize | [ ] |
| SLA overdue status updates from reminder/escalation engine | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for no pending items, delegated access, reassigned employee, overdue review, hidden merit/grade | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-DSH-02, FR-MGR-06 | [ ] |
| Final Confirmation Done | [ ] |

## 12.3 Employee Dashboard and Historical Records

### Functional Description
Allows employees to view active quarter objectives, quarter statuses, published annual decisions, and historical finalized quarterly/annual records according to configured visibility rules.

### Dependencies
Objective Entry, Quarterly Review Visibility, Visibility Governance, Audit/History, Access Engine.

### API Checklist
| Task | Status |
|---|---|
| Employee dashboard API/service implemented | [ ] |
| Active quarter objectives returned for assigned employee only | [ ] |
| Quarter statuses returned with objective and review status | [ ] |
| Published annual decisions returned according to visibility flags | [ ] |
| Historical finalized quarterly and annual records returned based on configured visibility rules | [ ] |
| Hidden confidential fields excluded from employee API responses | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for unauthorized record access and hidden field probing | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Employee Dashboard implemented | [ ] |
| Active quarter objectives displayed | [ ] |
| Quarter statuses displayed | [ ] |
| Published annual decision section implemented | [ ] |
| Historical finalized record view implemented | [ ] |
| Hidden grade/merit/review sections absent until visibility is enabled | [ ] |
| Empty state shown when no assignment or no published decision exists | [ ] |
| Loading, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Employee sees assigned quarterly performance assignments only | [ ] |
| Employee sees finalized quarterly manager reviews only when visibility allows | [ ] |
| Employee sees historical records only based on configured visibility rules | [ ] |
| Employee cannot infer hidden grade or merit through dashboard labels, counts, or exports | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Objective Entry quick link routes to current active quarter | [ ] |
| Published annual decision appears after Visibility Governance publish | [ ] |
| Historical view renders original template version and immutable snapshots | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for no active assignment, unpublished annual decision, partial visibility, historical record access, network failure | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-EMP-01, FR-EMP-04, FR-EMP-05, FR-DSH-03 | [ ] |
| Final Confirmation Done | [ ] |

---

# 13. SLA, Escalation, and Notification Management

## 13.1 SLA Rule Configuration and Reminder/Escalation Processing

### Functional Description
Supports configurable SLA rules for objective submission, objective approval, manager review, annual appraisal, visibility publishing, and communication dispatch. Escalation is notification-driven only and preserves original ownership traceability.

### Dependencies
Cycle Windows, Workflow Engine, Notification System, Dashboard, Audit Governance.

### API Checklist
| Task | Status |
|---|---|
| SLA rule configuration implemented for objective submission | [ ] |
| SLA rule configuration implemented for objective approval | [ ] |
| SLA rule configuration implemented for manager review | [ ] |
| SLA rule configuration implemented for annual appraisal | [ ] |
| SLA rule configuration implemented for visibility publishing | [ ] |
| SLA rule configuration implemented for communication dispatch | [ ] |
| Relative offset calculation implemented | [ ] |
| Pre-due reminder generation implemented | [ ] |
| Due-date reminder generation implemented | [ ] |
| Overdue reminder generation implemented | [ ] |
| Notification-driven escalation implemented without ownership mutation | [ ] |
| Original ownership traceability preserved for escalation | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman or scheduler/test harness where applicable | [ ] |
| API Error Responses Verified for invalid SLA config, invalid offset, unauthorized config | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| SLA rule configuration UI implemented if included in administration scope | [ ] |
| Reminder configuration UI supports pre-due, due-date, and overdue reminders | [ ] |
| Escalation hierarchy configuration marked Pending Business Clarification where final rules are not specified | [ ] |
| SLA breach indicators visible in dashboards | [ ] |
| Loading, empty, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Default SLA durations marked Pending Business Clarification unless formally configured | [ ] |
| Maximum appraisal window extension marked Pending Business Clarification | [ ] |
| Escalation remains notification-driven only | [ ] |
| Escalation does not reassign ownership | [ ] |
| Notification retry intervals marked Pending Business Clarification | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Objective submission SLA integrates with objective window and employee dashboard | [ ] |
| Objective approval SLA integrates with manager dashboard | [ ] |
| Manager review SLA integrates with manager dashboard and HR/Admin dashboard | [ ] |
| Annual appraisal SLA integrates with Management workflow and HR/Admin dashboard | [ ] |
| Visibility publishing SLA integrates with Visibility Governance | [ ] |
| Communication dispatch SLA integrates with Communication Dispatch | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for overdue objective, overdue approval, overdue review, relative offset, notification-only escalation, reopened assignment | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-SLA-01 through FR-SLA-05 | [ ] |
| Final Confirmation Done | [ ] |

## 13.2 Notification Triggers and Channels

### Functional Description
Sends email, in-app notifications, and system alerts for FSD-defined PMS events.

### Dependencies
Workflow Engine, SLA Engine, Objective, Review, Annual Decision, Visibility, Communication, Audit.

### API Checklist
| Task | Status |
|---|---|
| Objective window open notification to Employees implemented | [ ] |
| Objective submitted notification to Managers implemented | [ ] |
| Objective returned notification to Employees implemented | [ ] |
| Quarterly review pending notification to Managers implemented | [ ] |
| Quarter finalized notification to HR/Admin implemented | [ ] |
| Appraisal window open notification to Management implemented | [ ] |
| Visibility enabled notification to Employees and Managers implemented | [ ] |
| Communication dispatched notification to Employees implemented | [ ] |
| SLA overdue notification to configured escalation hierarchy implemented | [ ] |
| Reopen initiated notification to impacted stakeholders implemented | [ ] |
| Email channel supported | [ ] |
| In-app notification channel supported | [ ] |
| System alert channel supported | [ ] |
| Notification audit/logging implemented where applicable | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman or notification test harness | [ ] |
| API Error Responses Verified for invalid recipient, disabled channel, failed dispatch | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| In-app notification display implemented or integrated with existing HRMS notification UI | [ ] |
| System alert display implemented or integrated with existing HRMS alert UI | [ ] |
| Notification read/unread and link-to-action behavior verified where existing platform supports it | [ ] |
| Empty, loading, error, retry, and network failure states implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Each FSD event maps to correct notification target | [ ] |
| Notifications respect access and visibility restrictions | [ ] |
| Hidden grade/merit values are not included in unauthorized notifications | [ ] |
| Notification retry intervals marked Pending Business Clarification | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Workflow transitions trigger expected notifications | [ ] |
| SLA overdue engine triggers configured escalation hierarchy notifications | [ ] |
| Communication Dispatch triggers communication dispatched notification | [ ] |
| Reopen workflow triggers impacted stakeholder notification | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for hidden data notification, failed email, missing recipient, overdue escalation, reopen, duplicate notification prevention | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FSD Notification Triggers table | [ ] |
| Final Confirmation Done | [ ] |

---

# 14. Reporting and Export

## 14.1 Spreadsheet-Compatible Reporting Exports

### Functional Description
Supports spreadsheet-compatible exports for PMS reporting while respecting access, hierarchy scope, visibility masking, immutable history, and reporting-compatible structures.

### Dependencies
Dashboard, Access Engine, Visibility Governance, Audit Governance, Transactional PMS Data.

### API Checklist
| Task | Status |
|---|---|
| Reporting export API/service implemented for permitted dashboard/report datasets | [ ] |
| Export supports cycle monitoring data | [ ] |
| Export supports quarter completion data | [ ] |
| Export supports appraisal readiness data | [ ] |
| Export supports visibility status data | [ ] |
| Export supports communication status data | [ ] |
| Export supports SLA breach data | [ ] |
| Export supports assignment/objective/review summaries where configured | [ ] |
| Export applies server-side role, hierarchy, assignment, and visibility filtering | [ ] |
| Hidden confidential fields excluded from exports | [ ] |
| Historical export retention policy marked Pending Business Clarification | [ ] |
| API Unit Testing Completed | [ ] |
| API Tested via Postman | [ ] |
| API Error Responses Verified for unauthorized export, invalid filters, hidden field exposure, large export boundary | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| Export actions implemented on applicable tables/dashboards | [ ] |
| Export filters reflect current dashboard/table filters | [ ] |
| Export loading/progress state implemented for large datasets | [ ] |
| Export success/error messages implemented | [ ] |
| Empty export handling implemented | [ ] |
| Responsive UI Verified | [ ] |
| Manual UI Testing Completed | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Exports are spreadsheet-compatible | [ ] |
| Exported fields match visibility and permission rules | [ ] |
| Export does not leak hidden grade, merit, confidential decision, or restricted section data | [ ] |
| Large export behavior follows configurable batching where required | [ ] |
| Maximum batch processing limits marked Pending Business Clarification | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Dashboard tables export current filtered data | [ ] |
| Audit-safe historical data exported only to permitted roles | [ ] |
| Reporting structures remain compatible with future analytics/reporting needs | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for empty export, large export, partial visibility, unauthorized export, scoped Director export, hidden field probing | [ ] |
| QA Review Completed | [ ] |
| Source Traceability Verified Against FR-DSH-04 and Non-Functional Reporting Readiness | [ ] |
| Final Confirmation Done | [ ] |

---

# 15. Technical Infrastructure and Data Compatibility

## 15.1 MongoDB and Future Azure Cosmos DB Compatibility

### Functional Description
Ensures PMS persistence remains compatible with MongoDB now and future Azure Cosmos DB MongoDB API / Azure DocumentDB-compatible deployment.

### Dependencies
All persistence models, repositories, indexes, queries, batch jobs, reports.

### API Checklist
| Task | Status |
|---|---|
| Repository/data-access abstraction used for PMS persistence | [ ] |
| MongoDB-compatible query patterns used | [ ] |
| Unsupported aggregation/operator dependencies avoided or compatibility-validated | [ ] |
| Indexing strategy kept portable | [ ] |
| Infrastructure-coupled persistence logic avoided | [ ] |
| Large-volume assignment, review, and communication operations support asynchronous processing and configurable batching | [ ] |
| API Unit Testing Completed for repository behavior | [ ] |
| API/Error Testing Completed for persistence failures and batch failures | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| Data models support reporting-compatible structures | [ ] |
| Historical template/version preservation fields included | [ ] |
| Audit traceability fields included in transactional models | [ ] |
| Confidential fields are separable/maskable at repository/service level | [ ] |
| Batch processing limits marked Pending Business Clarification | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Objective, Review, Cycle, Assignment, Annual Decision, Audit, Communication, Access, SLA models use compatible persistence patterns | [ ] |
| Seed/demo data follows approved workflow and role terminology | [ ] |
| Performance tested or reviewed for organization-wide quarterly cycles | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Edge Cases Tested for large assignment batch, large communication batch, query pagination, export batch, audit volume | [ ] |
| Architect Review Completed | [ ] |
| Source Traceability Verified Against FSD Section 25 and Section 32 | [ ] |
| Final Confirmation Done | [ ] |

---

# 16. Cross-Module QA, Security, and Release Readiness

## 16.1 End-to-End PMS v2 Workflow

### Functional Description
Validates the approved high-level PMS v2 workflow from annual parent cycle setup through historical snapshot preservation.

### Dependencies
All modules.

### API Checklist
| Task | Status |
|---|---|
| End-to-end API flow tested: Annual Parent Cycle -> Q1-Q4 Objective Lifecycle -> Objective Approval -> Quarterly Manager Review -> Quarter Finalization -> All Quarters Finalized -> Annual Appraisal Decision -> Annual Finalization -> Visibility Enablement -> Communication Ready -> Communication Dispatch -> Historical Snapshot Preservation | [ ] |
| API auth, workflow, assignment, visibility, audit, immutable history, and error responses verified across the full flow | [ ] |
| Postman collection or equivalent API validation suite created for all FSD APIs | [ ] |
| Negative API tests completed for unauthorized access, invalid transition, missing mandatory fields, hidden field access, invalid outcome, finalized edit, missing visibility publish, missing template mapping | [ ] |

### UI Checklist
| Task | Status |
|---|---|
| End-to-end UI flow tested for HR/Admin, Employee, Manager, Management, and Director where applicable | [ ] |
| All screens verified for loading, empty, error, retry/reload, API failure, and network failure states | [ ] |
| Responsive UI verified across supported desktop/tablet/mobile breakpoints | [ ] |
| Accessibility checks completed where applicable for forms, tables, modals, buttons, labels, keyboard focus, and validation messages | [ ] |
| UX flow validation completed for create, save, submit, approve, return, review, finalize, reopen, freeze, publish, preview, dispatch, resend, export | [ ] |

### Validation Checklist
| Task | Status |
|---|---|
| No employee self-review implementation exists | [ ] |
| No employee acceptance/sign-off implementation exists | [ ] |
| No employee disagreement routing implementation exists | [ ] |
| No dual rating model implementation exists | [ ] |
| No parallel multi-manager approval implementation exists | [ ] |
| No automatic recalculation of frozen decisions exists | [ ] |
| All FSD workflows and states use approved terminology | [ ] |
| All pending business clarification items are explicitly tracked and not silently invented | [ ] |

### Integration Checklist
| Task | Status |
|---|---|
| Workflow Engine used by every state-changing module | [ ] |
| Dynamic Access Engine used by every protected PMS route and screen | [ ] |
| Visibility Governance applied at UI, API, dashboard, export, notification, and communication levels | [ ] |
| Audit Governance applied to all transactional modules | [ ] |
| Notifications and SLA hooks verified across lifecycle | [ ] |
| Historical snapshots verified after finalization, reopen, correction, communication dispatch, and resend | [ ] |

### Final Confirmation
| Task | Status |
|---|---|
| Full Regression Testing Completed | [ ] |
| Security Testing Completed | [ ] |
| QA Sign-off Completed | [ ] |
| PM Delivery Review Completed | [ ] |
| Architect Review Completed | [ ] |
| FSD Coverage Review Completed | [ ] |
| Final Confirmation Done | [ ] |

## 16.2 Pending Business Clarification Tracker

### Functional Description
Tracks FSD-approved clarification items that must not be invented during implementation.

### Dependencies
Product Owner / Business Owner confirmation.

### Final Confirmation
| Clarification Item | Status |
|---|---|
| Default SLA durations for each quarter stage confirmed | [ ] |
| Maximum appraisal window extension rules confirmed | [ ] |
| Escalation hierarchy configuration rules confirmed | [ ] |
| Attachment size and format limitations confirmed | [ ] |
| Historical archival retention duration confirmed | [ ] |
| Bulk communication retry policy confirmed | [ ] |
| Maximum batch processing limits confirmed | [ ] |
| Cross-region hierarchy evaluation rules confirmed | [ ] |
| Delegation conflict resolution priority confirmed | [ ] |
| Override approval governance hierarchy confirmed | [ ] |
| Notification retry intervals confirmed | [ ] |
| Historical export retention policy confirmed | [ ] |
| Implementation updated after clarification approval | [ ] |
| QA retested clarified behavior | [ ] |
| Final Confirmation Done | [ ] |

---

# 17. FSD Source Coverage Matrix

## 17.1 Requirement Traceability Index

### Functional Description
Provides a reviewer-friendly index to confirm every explicit FSD functional requirement has a checklist home. This matrix is not a replacement for the detailed screen checklists above; it is a source coverage control.

### Final Confirmation
| FSD Requirement | Checklist Coverage Section | Status |
|---|---|---|
| FR-EMP-01 Quarterly Assignment Visibility | 4.1, 12.3 | [ ] |
| FR-EMP-02 Objective Creation and Update | 5.1 | [ ] |
| FR-EMP-03 Objective Submission | 5.1 | [ ] |
| FR-EMP-04 Quarterly Review Visibility | 9.1, 12.3 | [ ] |
| FR-EMP-05 Historical Review Visibility | 1.3, 12.3 | [ ] |
| FR-MGR-01 Objective Review Access | 6.1 | [ ] |
| FR-MGR-02 Objective Approval | 6.1 | [ ] |
| FR-MGR-03 Objective Revision Request | 6.1 | [ ] |
| FR-MGR-04 Manager Quarterly Evaluation | 7.1 | [ ] |
| FR-MGR-05 Quarterly Review Submission | 7.1 | [ ] |
| FR-MGR-06 Scope Enforcement | 1.2, 4.1, 12.2 | [ ] |
| FR-MGR-07 Manager-Created Objective Auto Approval | 5.2 | [ ] |
| FR-HR-01 Template Management | 3.1 | [ ] |
| FR-HR-02 Annual Cycle Management | 2.1, 2.2 | [ ] |
| FR-HR-03 Assignment Management | 4.1, 4.2 | [ ] |
| FR-HR-04 Dynamic Role Configuration | 11.1 | [ ] |
| FR-HR-05 Visibility Governance | 9.1 | [ ] |
| FR-HR-06 Communication Governance | 10.1 | [ ] |
| FR-HR-07 Override and Correction Governance | 1.3, 4.2, 7.2, 8.2 | [ ] |
| FR-MGT-01 Annual Appraisal Decision Access | 8.1 | [ ] |
| FR-MGT-02 Confidential Decision Governance | 8.1, 9.1 | [ ] |
| FR-DIR-01 Hierarchy Monitoring Access | 1.2, 11.1, 12.1 | [ ] |
| FR-CYC-01 Annual Parent Cycle | 2.1 | [ ] |
| FR-CYC-02 Quarter Independence | 2.1, 4.1 | [ ] |
| FR-CYC-03 Annual Dependency Validation | 7.2, 8.1 | [ ] |
| FR-CYC-04 Quarter Window Configuration | 2.2 | [ ] |
| FR-CYC-05 Appraisal Window Configuration | 2.2 | [ ] |
| FR-WF-01 Quarter State Enforcement | 1.1 | [ ] |
| FR-WF-02 Supported Quarter States | 1.1 | [ ] |
| FR-WF-03 Supported Annual States | 1.1 | [ ] |
| FR-WF-04 Revised Workflow Model | 1.1, 16.1 | [ ] |
| FR-OBJ-01 Objective Entry | 5.1, 5.2 | [ ] |
| FR-OBJ-02 Objective Editability | 5.1 | [ ] |
| FR-OBJ-03 Objective Submission | 5.1 | [ ] |
| FR-OBJ-04 Objective Approval | 6.1 | [ ] |
| FR-OBJ-05 Objective Revision Comment | 6.1 | [ ] |
| FR-OBJ-06 Objective Locking | 5.1, 6.1 | [ ] |
| FR-OBJ-07 Objective Weightage Validation | 5.1 | [ ] |
| FR-MQR-01 Quarterly Evaluation Access | 7.1 | [ ] |
| FR-MQR-02 Quarterly Rating Entry | 7.1 | [ ] |
| FR-MQR-03 Manager Review Validation | 7.1 | [ ] |
| FR-MQR-04 Review Submission | 7.1 | [ ] |
| FR-MQR-05 Quarter Finalization | 7.2 | [ ] |
| FR-MQR-06 Quarter Reopen | 7.2 | [ ] |
| FR-AFR-01 Appraisal Decision Draft | 8.1 | [ ] |
| FR-AFR-02 Grade and Merit Governance | 8.2 | [ ] |
| FR-AFR-03 Outcome Derivation | 8.2 | [ ] |
| FR-AFR-04 Annual Decision Freeze | 8.2 | [ ] |
| FR-AFR-05 Annual Finalization | 8.2 | [ ] |
| FR-AFR-06 Annual Reopen | 8.2 | [ ] |
| FR-AFR-07 Visibility Dependency | 9.1, 10.1 | [ ] |
| FR-AFR-08 Frozen Decision Integrity | 8.2 | [ ] |
| FR-DRP-01 Dynamic Permission Resolution | 1.2, 11.1 | [ ] |
| FR-DRP-02 Custom Roles | 11.1 | [ ] |
| FR-DRP-03 Hierarchy Scope | 1.2, 11.1 | [ ] |
| FR-DRP-04 Assignment Authorization | 1.2, 4.1 | [ ] |
| FR-DRP-05 Section-Level Permissions | 1.2, 11.1 | [ ] |
| FR-DRP-06 Field-Level Permissions | 1.2, 11.1 | [ ] |
| FR-DRP-07 Permission Simulation | 11.2 | [ ] |
| FR-DRP-08 Deny Rule Priority | 1.2, 11.1, 11.2 | [ ] |
| FR-VIS-01 Employee Visibility Control | 9.1 | [ ] |
| FR-VIS-02 Manager Visibility Control | 9.1 | [ ] |
| FR-VIS-03 API-Level Masking | 1.2, 9.1 | [ ] |
| FR-VIS-04 Visibility Publish Workflow | 9.1 | [ ] |
| FR-VIS-05 Confidentiality by Default | 9.1, 16.1 | [ ] |
| FR-COM-01 Dynamic Letter Templates | 3.2, 10.1 | [ ] |
| FR-COM-02 Outcome Mapping | 3.2, 10.1 | [ ] |
| FR-COM-03 Placeholder Resolution | 3.2, 10.1 | [ ] |
| FR-COM-04 Conditional Blocks | 3.2 | [ ] |
| FR-COM-05 Preview Support | 3.2, 10.1 | [ ] |
| FR-COM-06 Dispatch Workflow | 10.1 | [ ] |
| FR-COM-07 Communication Audit | 1.3, 10.1 | [ ] |
| FR-COM-08 Template Version Lock | 3.2, 10.1 | [ ] |
| FR-COM-09 Resend Support | 10.1 | [ ] |
| FR-AUD-01 Complete Audit Trail | 1.3 | [ ] |
| FR-AUD-02 Correction Layer Preservation | 1.3 | [ ] |
| FR-AUD-03 Immutable Historical Records | 1.3 | [ ] |
| FR-AUD-04 Template Snapshot Integrity | 1.3, 3.1, 3.2 | [ ] |
| FR-AUD-05 Override Audit Requirements | 1.3, 4.2, 8.2 | [ ] |
| FR-SLA-01 Configurable SLA Rules | 13.1 | [ ] |
| FR-SLA-02 Relative Offset Calculation | 2.2, 13.1 | [ ] |
| FR-SLA-03 Reminder Configuration | 13.1 | [ ] |
| FR-SLA-04 Escalation Governance | 13.1 | [ ] |
| FR-SLA-05 Notification-Based Escalation | 13.1 | [ ] |
| FR-DEL-01 Temporary Delegation | 4.2 | [ ] |
| FR-DEL-02 Delegation Attribution | 4.2 | [ ] |
| FR-RAS-01 Permanent Reassignment | 4.2 | [ ] |
| FR-RAS-02 Historical Preservation | 4.2 | [ ] |
| FR-DSH-01 Administrative Dashboard | 12.1 | [ ] |
| FR-DSH-02 Manager Dashboard | 12.2 | [ ] |
| FR-DSH-03 Employee Dashboard | 12.3 | [ ] |
| FR-DSH-04 Reporting Export | 12.1, 14.1 | [ ] |
| FR-VAL-01 Required Field Validation | 5.1, 7.1, 16.1 | [ ] |
| FR-VAL-02 Weightage Validation | 5.1 | [ ] |
| FR-VAL-03 Quarter Dependency Validation | 7.2, 8.1 | [ ] |
| FR-VAL-04 Outcome Validation | 8.2 | [ ] |
| FR-VAL-05 Finalized Record Protection | 1.3, 7.2, 8.2 | [ ] |
| FR-VAL-06 Visibility Protection | 1.2, 9.1, 10.1, 14.1 | [ ] |
| FR-VAL-07 State Transition Enforcement | 1.1, 16.1 | [ ] |
| Final FSD coverage reviewed by QA Lead / Architect | 16.1, 17.1 | [ ] |
| Final Confirmation Done | 16.1, 17.1 | [ ] |
