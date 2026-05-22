# Overall Reality

| Area | BE Completion | FE Completion | Real Status |
|---|---:|---:|---|
| Template Builder | 75-80% | 65-70% | Mostly demo-ready, not fully production-clean |
| Letter Templates | 70-75% | 65-70% | Mostly done, but dispatch mapping gap exists |
| Cycle Management | 80-85% | 75-80% | Strong MVP |
| Assignment Management | 75-80% | 70-75% | Good MVP, needs edge-case proof |
| Objective Management | 75-80% | 70-75% | Good MVP |
| Quarter Review | 70-75% | 70% | Works, workflow governance needs confirmation |
| Annual Decision | 70-75% | 65-70% | Good foundation |
| Visibility Governance | 60-65% | 55-60% | Partial |
| Communication Dispatch | 55-60% | 55-60% | Not complete due mapping mismatch |
| Dynamic Access Engine | 35-40% | 40-45% | Foundation only |
| SLA / Escalation | 45-50% | 45-50% | Partial |
| Delegation | 55-60% | 50-55% | Partial |
| Audit / History | 65-70% | 55-60% | Good foundation |
| Dashboard / Reports | 45-50% | 50-55% | Partial |
| Build / QA Readiness | 55-60% | 35-40% | Not production-ready |

## Important Point

Team may say “100% done” because screens and APIs exist. But FSD completion means:

- Backend validation is complete
- FE is build/check clean
- End-to-end flow works without mock fallback
- Access is enforced server-side
- Confidential visibility is enforced at API layer
- Audit/history is immutable
- Edge cases are handled
- Role, hierarchy, delegation, visibility, workflow, and template-version rules are consistent

That is not 100% yet.

## 1. Template Builder

BE: 75-80% complete  
FE: 65-70% complete

### FSD Scope

Template Builder should support:

- Dynamic sections
- Dynamic fields
- Workflow-stage behavior
- Scoring rules
- Conditional rendering
- Field visibility/editability
- Role-aware rendering
- Quarter/annual rendering
- Validation rules
- Template preview
- Template version governance

### What Is Done

BE:

- Template create/update/list/delete
- Template version create/clone/activate/deactivate
- Section and field configuration
- Scoring validation exists
- Outcome mapping model exists
- Letter templates linked to PMS template version
- Audit events exist

FE:

- Template list UI
- Template designer UI
- Sections and fields UI
- Scoring rules UI
- Visibility UI
- Workflow UI
- Outcome mapping UI
- Version history UI
- Role simulator UI

### What Is Missing

BE:

- Activation does not clearly force all four outcome mappings:
  - BOTH
  - MERIT_ONLY
  - GRADE_ONLY
  - NIL
- Full dynamic role configuration is not implemented
- Runtime field behavior is not proven consistently across all PMS runtime modules
- More backend tests needed for template activation, field rules, visibility, and scoring

FE:

- PMS template API has TypeScript errors
- Role mapping tab is removed, so dynamic role configuration UI is not available
- Some configured field types may exist in builder but need proof in actual runtime forms
- FE check/build is not clean

### Real Example Gap

Backend validates outcome mappings if mappings exist, but does not strongly prove that all four required outcome types are mandatory before activation.

### Questions To Ask Team

BE questions:

- Can backend activate a template without all four outcome mappings?
- Does backend reject invalid field visibility/editability rules?
- Does backend validate section scoring and field scoring totals?
- Are old assignments always rendered from the locked template version?
- Are template versions immutable once used by cycle/assignment?

FE questions:

- Does template builder support all field types in actual runtime screens?
- Does Role Simulator use the same backend rules as real APIs?
- Does npm run check pass for PMS template files?
- Are users blocked from editing locked template versions?
- Can HR clearly identify active, inactive, and locked versions?

## 2. Letter Template Management

BE: 70-75% complete  
FE: 65-70% complete

### FSD Scope

Communication template builder should support:

- Placeholders
- Conditional blocks
- Outcome mapping
- Version-locked template snapshots
- Preview rendering
- Audit history

### What Is Done

BE:

- Letter template create
- Letter template version create
- Activate/deactivate
- Placeholder extraction
- Conditional block validation
- Preview endpoint
- Audit events

FE:

- Letter template list
- Create/edit UI
- Placeholder quick insert
- Conditional block helper
- Preview modal
- Activate/deactivate buttons
- Version display

### What Is Missing

BE:

- Dispatch mapping is not fully aligned with cycle outcome mapping
- Need stronger unsupported-placeholder validation
- Need stronger proof that dispatched versions cannot be altered historically

FE:

- Preview may not prove real annual assignment data in all paths
- UI should clearly show which template version is mapped to which outcome
- FE type/check issues still exist globally

### Real Example Gap

Cycle stores communication rule mainly as:

```text
ruleId
ruleName
templateVersionId
```

But dispatch resolution expects:

```text
combinedTemplateId
meritOnlyTemplateId
gradeOnlyTemplateId
genericTemplateId
```

So the selected mapped outcome letter may not always be used during actual dispatch.

### Questions To Ask Team

BE questions:

- If outcome is BOTH, which exact letter template version is selected?
- Is it selected from the cycle’s saved outcome mapping?
- Can sent letter content change after template edit?
- Is rendered subject/body saved permanently?
- Is content hash stored?
- Is resend audited with correction reason?

FE questions:

- Can HR preview the final rendered communication before send?
- Can HR see active/inactive/locked letter versions?
- Does UI prevent editing locked letter versions?
- Does UI show placeholder/conditional validation errors clearly?
- Does UI show which letter is mapped to BOTH, MERIT_ONLY, GRADE_ONLY, NIL?

## 3. Cycle Management

BE: 80-85% complete  
FE: 75-80% complete

### FSD Scope

Cycle management should support:

- Annual parent cycle
- Q1-Q4 child quarter cycles
- Objective/review/finalization windows
- Appraisal window
- Template version linkage
- Communication rule linkage
- Launch readiness

### What Is Done

BE:

- Annual cycle create/update/list/detail
- Quarter cycle creation
- Window validation
- Appraisal window config
- Launch cycle
- Communication rule listing
- Audit history

FE:

- Cycle wizard
- Cycle list
- Cycle details
- Quarter window UI
- Appraisal window UI
- Communication rule dropdown
- Launch modal with assignments

### What Is Missing

BE:

- Communication rule persistence mismatch with dispatch
- More launch edge-case tests needed
- Need stronger proof that launch blocks invalid setup

FE:

- Needs clean build/check
- Needs better visible readiness errors if communication rule mapping is incomplete
- Needs E2E proof

### Questions To Ask Team

BE questions:

- Can a cycle launch without valid template version?
- Can a cycle launch without communication mappings?
- Does launch lock the template version?
- Does backend validate Q1-Q4 chronology?
- Can cycle be cancelled/closed/archived with reason and audit?

FE questions:

- Does cycle wizard clearly show readiness failures?
- Does Save and Launch fail clearly if assignment is missing?
- Does communication dropdown show only valid active mapped template versions?
- Can user review all quarter windows before launch?
- Does UI prevent launch when validation fails?

## 4. Assignment Management

BE: 75-80% complete  
FE: 70-75% complete

### FSD Scope

Assignment management should support:

- Annual assignment
- Quarter assignments
- Manager assignment
- Assignment reason
- Eligibility handling
- Reassignment
- Exceptions
- Immutable assignment snapshots

### What Is Done

BE:

- Assign employee
- Bulk assignment
- Annual assignment creation
- Quarter assignment creation
- Missing manager exception
- Reassignment
- Close/reopen
- Employee/manager snapshots
- Audit

FE:

- Assignment page
- Bulk assignment panel
- Employee/manager selection
- Quarter selection
- Assignment reason
- Exception list
- Reassignment history

### What Is Missing

BE:

- More eligibility rules for mid-year joiners/exits need proof
- More exception types need proof
- Future-quarter-only reassignment needs confirmation
- More tests required

FE:

- UI may not expose all exception workflows fully
- Mid-year joiner/exited employee handling may not be clear
- Need better assignment validation messaging

### Questions To Ask Team

BE questions:

- What happens for mid-year joiner?
- What happens for exited employee?
- Can same employee be assigned twice in same cycle?
- Is manager snapshot preserved after manager changes?
- Are reassignment reasons mandatory and audited?
- Can reassignment apply only to selected quarters?

FE questions:

- Can HR assign only Q3/Q4 for mid-year joiner?
- Can HR see assignment exceptions clearly?
- Can HR resolve missing-manager exceptions from UI?
- Can HR reassign manager from UI with reason?
- Can HR see old manager and new manager history?

## 5. Objective Management

BE: 75-80% complete  
FE: 70-75% complete

### FSD Scope

Objective management should support:

- Employee objective creation/update
- Objective submission
- Manager approval
- Manager return for revision with comments
- Manager-created objective auto-approval
- Objective locking
- Objective evidence/attachments
- Quarter-state integration

### What Is Done

BE:

- Objective create/update
- Submit
- Approve
- Return
- Comments
- Attachments metadata
- Objective values
- Manager-created objective auto-approved
- Template objective mode support
- Predefined objective seeding

FE:

- Employee objective workspace
- Manager objective workspace
- Objective draft form
- Submit/approve/return actions
- Comments UI
- Dynamic custom fields rendering

### What Is Missing

BE:

- Total objective weightage validation needs stronger proof
- Dynamic-template field enforcement needs stronger proof
- Attachment upload integration needs proof
- Objective locking after approval/finalization needs more tests

FE:

- UX polish needed
- Attachment flow needs proof
- Runtime field rendering needs validation across field types
- Error handling needs improvement

### Questions To Ask Team

BE questions:

- If mode is DYNAMIC, can employee and manager both create objectives?
- If mode is PREDEFINED, does backend reject custom objectives?
- If mode is HYBRID, are predefined and custom both allowed?
- Can total objective weightage exceed 100?
- Can employee edit after manager approval?
- Are returned objectives editable only during revision state?

FE questions:

- Does employee see only assigned quarter objectives?
- Does manager see only assigned employees?
- Does UI block create/edit outside objective window?
- Does UI show manager return reason?
- Does UI clearly show approved, submitted, returned, draft statuses?

## 6. Quarter Review

BE: 70-75% complete  
FE: 70% complete

### FSD Scope

Quarter review should support:

- Manager evaluation
- Approved objective context
- Ratings/scores/comments
- Recommendations
- Submission
- Finalization state
- Visibility-controlled employee access

### What Is Done

BE:

- Review draft
- Review submit
- Review values
- Scoring resolution
- Quarter review snapshot
- Reopen support
- Employee visibility check exists in review listing

FE:

- Manager review UI
- Employee review visibility UI
- Admin review page
- Draft/submit/reopen actions
- Dynamic review fields

### What Is Missing

BE:

- Submit currently appears to move quarter to finalized immediately
- Need confirmation whether FSD/business expects separate admin finalization
- More scoring tests needed
- More visibility tests needed

FE:

- Need clear separation if submit and finalize are separate business actions
- Need better status guidance
- Need proof employee cannot see hidden review before publish

### Real Example Gap

Current backend appears to do:

```text
Manager submit -> MANAGER_REVIEW_SUBMITTED -> QUARTER_FINALIZED
```

If business expects separate HR/Admin finalization, this is incomplete. If business accepted auto-finalization, then this is okay but must be documented.

### Questions To Ask Team

BE questions:

- Should manager submit automatically finalize quarter?
- Is separate admin finalization required?
- Can manager edit after submission?
- Can admin reopen quarter with reason?
- Is employee review masked before visibility publish?

FE questions:

- Does manager see only approved objectives?
- Does UI prevent review submission without approved objectives?
- Does UI show finalized/read-only state?
- Can admin reopen from UI?
- Can employee see review only after visibility is enabled?

## 7. Annual Decision / Grade / Merit

BE: 70-75% complete  
FE: 65-70% complete

### FSD Scope

Annual decision should support:

- Annual summary
- Grade/merit decision
- Outcome derivation
- Draft/submit/freeze/reopen
- Visibility control
- Confidential governance

### What Is Done

BE:

- List annual assignments
- Summary
- Save draft
- Submit
- Freeze
- Reopen
- Grade/merit/nil outcome derivation
- Decision values
- Visibility update
- Correction snapshot

FE:

- Annual decision workspace
- Summary view
- Draft form
- Grade/merit/nil fields
- Submit/freeze/reopen
- Visibility controls

### What Is Missing

BE:

- Stronger management/director hierarchy validation
- Better communication integration
- More tests for freeze/reopen/visibility
- Full approval-chain rules need confirmation

FE:

- Needs clearer final decision state UX
- Needs better dynamic field validation
- Needs proof of hidden data handling by role

### Questions To Ask Team

BE questions:

- Can annual decision be created before applicable quarters are finalized?
- Can decision be edited after freeze?
- Is reopen reason mandatory?
- Does reopen create immutable pre-reopen snapshot?
- Is outcome derived correctly as BOTH, MERIT_ONLY, GRADE_ONLY, NIL?

FE questions:

- Does UI block decision if quarters are not finalized?
- Does UI show quarter completion status?
- Does UI prevent editing frozen decisions?
- Does UI require nil reason when grade/merit are not applied?
- Does UI show visibility flags clearly?

## 8. Visibility Governance

BE: 60-65% complete  
FE: 55-60% complete

### FSD Scope

Visibility governance should ensure:

- Confidential fields hidden until published
- Backend API masking
- Role-wise visibility
- Field/section visibility
- Audit-safe history masking

### What Is Done

BE:

- Visibility flags exist
- Visibility configuration collection
- Grade/merit masking service
- Annual decision masking
- Some audit/history masking

FE:

- Visibility controls in annual decision
- Publish flags in template builder
- Employee/manager visibility surfaces

### What Is Missing

BE:

- API masking across every PMS response not fully proven
- Template field visibility not consistently enforced in all runtime APIs
- Publish flag handling is basic
- Reports/dashboard masking needs proof

FE:

- UI hiding is not enough without backend proof
- Need clearer visibility preview
- Need before/after publish proof

### Questions To Ask Team

BE questions:

- Can employee see grade/merit by direct API before publish?
- Are hidden fields masked in backend, not only UI?
- Is visibleFrom respected?
- Are audit/history records masked for employee?
- Are manager and employee visibility flags separate?

FE questions:

- Does employee UI hide grade/merit before publish?
- Does manager UI follow manager-specific flags?
- Does visibility screen show current publish status?
- Can HR schedule future visibility using visibleFrom?
- Does UI warn before publishing confidential data?

## 9. Communication Dispatch

BE: 55-60% complete  
FE: 55-60% complete

### FSD Scope

Communication dispatch should support:

- Outcome-based template resolution
- Preview
- Send
- Resend
- Immutable sent content
- Template version snapshot
- Delivery status
- Audit history

### What Is Done

BE:

- Preview
- Send
- Resend
- Dispatch history
- Email send
- Content snapshot/hash
- Duplicate normal-send prevention
- Visibility-before-send validation

FE:

- Communication dispatch workspace
- Preview/send/resend API service
- History support

### What Is Missing

BE:

- Correct cycle outcome mapping integration
- Bulk communication flow needs more proof
- PDF/document channel support unclear
- Delivery retry lifecycle is limited
- Queue/retry handling missing or unclear

FE:

- Need clearer mapped-template proof
- Need better dispatch status UX
- Need bulk dispatch readiness proof

### Questions To Ask Team

BE questions:

- Does communication use exact mapped letter version from cycle?
- Can communication be sent before visibility is enabled?
- Can communication be sent twice?
- Is sent content immutable?
- Is failed email retry handled?
- Is dispatch audited?

FE questions:

- Can HR preview final rendered content before send?
- Does UI show selected/mapped letter version?
- Does UI show sent/failed/skipped delivery status?
- Can HR resend with correction reason?
- Can HR view old dispatch history?

## 10. Dynamic Access Engine

BE: 35-40% complete  
FE: 40-45% complete

### FSD Scope

Dynamic Access Engine should support:

```text
Role + Assignment + Hierarchy Scope + Workflow State + Section/Field Visibility
```

### What Is Done

BE:

- Basic role normalization
- Admin bypass
- Employee self-access
- Manager assigned-employee access
- Some delegation checks in module services

FE:

- Access simulator
- Role-aware navigation
- Visibility/editability controls in template builder

### What Is Missing

BE:

- Custom PMS role configuration
- Full hierarchy scope enforcement
- Department/business-unit/region/global scope
- Field-level permission enforcement across all APIs
- Unified access engine across all modules

FE:

- No full role mapping UI
- No permission matrix UI
- Access simulator does not prove all real APIs use same rules

### Questions To Ask Team

BE questions:

- Where are PMS roles configured?
- Can director access only configured scope?
- Does manager access depend on assignment ownership?
- Does backend enforce field-level permissions?
- Are hierarchy scopes evaluated from org data?
- Is delegation part of access calculation everywhere?

FE questions:

- Where can HR configure role permissions?
- Can HR test employee/manager/director visibility?
- Does simulator match backend API behavior?
- Does UI hide actions based on actual permission result?
- Can UI explain why access is denied?

## 11. Delegation

BE: 55-60% complete  
FE: 50-55% complete

### FSD Scope

Delegation should support:

- Temporary delegation
- Scope control
- Validity dates
- Delegated owner tracking
- Audit history

### What Is Done

BE:

- Delegation model/service/routes exist
- Objective/review services check delegation in some paths
- Acting delegate/original owner fields exist
- Audit foundation exists

FE:

- Delegation workspace exists
- Delegation route exists

### What Is Missing

BE:

- Delegation coverage across all PMS modules not proven
- Annual decision delegation unclear
- Communication/admin delegation unclear
- Expiry enforcement needs proof
- Dashboard/list scope under delegation needs proof

FE:

- UI depth unclear
- Need visibility into active/expired delegation
- Need delegated action indicators

### Questions To Ask Team

BE questions:

- Can manager delegate objective approval only?
- Can manager delegate quarter review only?
- Does delegation expire automatically?
- Are actions stamped with delegate and original owner?
- Is delegation respected in dashboards/lists?

FE questions:

- Can HR/manager create delegation from UI?
- Can UI show delegation validity period?
- Can UI show delegated scope?
- Can user see delegated tasks?
- Can UI show expired delegation separately?

## 12. SLA / Escalation

BE: 45-50% complete  
FE: 45-50% complete

### FSD Scope

SLA should support:

- SLA tracking
- Reminder generation
- Escalation handling
- Notification events
- Dashboard/reporting visibility

### What Is Done

BE:

- SLA models/routes/services exist
- Cycle windows can store SLA keys
- Notification-event foundation exists

FE:

- SLA workspace exists
- Reminder/escalation config UI exists
- Cycle wizard can store SLA rule keys

### What Is Missing

BE:

- Actual scheduler/reminder execution not fully proven
- SLA breach calculation needs proof
- Escalation notification lifecycle unclear
- Dashboard integration unclear

FE:

- Need live SLA status view
- Need overdue/pending action visibility
- Need escalation tracking UI proof

### Questions To Ask Team

BE questions:

- What job runs SLA evaluation?
- Are reminders sent automatically?
- Where are SLA breach events stored?
- Who receives escalation?
- Can SLA rules differ per quarter?

FE questions:

- Can admin see overdue objectives/reviews?
- Can manager see pending SLA items?
- Does UI show reminder status?
- Does UI show escalated items?
- Can HR configure reminder/escalation policy from UI?

## 13. Audit / History / Correction

BE: 65-70% complete  
FE: 55-60% complete

### FSD Scope

Audit/history should support:

- Immutable snapshots
- Correction layers
- Audit tracking
- Version history
- Visibility-aware audit access

### What Is Done

BE:

- Audit service
- Many PMS actions audited
- Performance history snapshots
- Correction layer
- Reopen snapshots
- Communication dispatch snapshot/hash

FE:

- Audit workspace
- Template audit history
- Assignment/reassignment history areas
- Communication history area

### What Is Missing

BE:

- Audit coverage for every FSD action needs proof
- Append-only immutability needs proof
- Audit masking by role needs full proof
- More tests needed

FE:

- Need complete audit visibility across modules
- Need better correction/snapshot comparison UI
- Need visibility-aware audit display proof

### Questions To Ask Team

BE questions:

- Is every state transition audited?
- Are old snapshots immutable?
- Can dispatched communication be modified?
- Are correction reasons mandatory?
- Are audit logs append-only?

FE questions:

- Can HR see full audit timeline?
- Can employee see only allowed audit entries?
- Can UI show before/after correction values?
- Can UI show communication dispatch history?
- Can UI show who performed delegated action?

## 14. Dashboard / Reporting

BE: 45-50% complete  
FE: 50-55% complete

### FSD Scope

Dashboard/reporting should support:

- Role-wise dashboards
- Cycle monitoring
- Assignment progress
- Review status
- Annual decision status
- Communication status
- Exports/reports
- Visibility-aware reporting

### What Is Done

BE:

- Dashboard service exists
- Dashboard routes exist
- Some PMS metrics available

FE:

- Admin dashboard route
- Manager dashboard route
- My PMS dashboard route
- Dashboard workspace component

### What Is Missing

BE:

- Full reporting/export coverage
- Visibility-aware reports need proof
- SLA metrics need proof
- Communication status reporting needs proof

FE:

- Full report filters/export UI unclear
- Need role-specific dashboard validation
- Need pending-action metrics

### Questions To Ask Team

BE questions:

- Can reports filter by cycle, manager, department, outcome?
- Are grade/merit masked in reports?
- Can HR export annual decisions?
- Are SLA and communication status included?
- Are dashboard counts role-scoped?

FE questions:

- Can HR see cycle completion percentage?
- Can manager see pending objective approvals?
- Can employee see their own PMS status?
- Can admin export reports?
- Are confidential fields hidden in dashboard/report UI?

## 15. Build / QA / Production Readiness

BE: 55-60% complete  
FE: 35-40% complete

### FSD Relationship

This is not a direct functional module in FSD, but it is required for real delivery.

### What Is Done

BE:

- Some tests exist
- Cycle validation test passes
- Core services exist

FE:

- Many PMS screens exist
- API services exist
- Demo flow can likely be shown with controlled data

### What Is Missing

BE:

- Limited PMS test coverage
- Need tests for objective, review, annual decision, visibility, communication
- Need integration tests

FE:

- npm run check fails
- Many TypeScript errors
- PMS-specific FE errors exist
- Need clean production build
- Need E2E test

### Questions To Ask Team

BE questions:

- Does npm test cover objective lifecycle?
- Does npm test cover quarter review lifecycle?
- Does npm test cover annual decision freeze/reopen?
- Does npm test cover communication mapping and dispatch?
- Is there an integration test for complete PMS lifecycle?

FE questions:

- Does npm run check pass?
- Does npm run build pass?
- Are PMS-specific TypeScript errors fixed?
- Are mock fallbacks disabled in production?
- Is there an E2E test for:

```text
Template → Letter Mapping → Cycle → Assignment → Objective → Review → Decision → Visibility → Communication
```

## Final Accurate Statement

Use this:

> The implementation is not 100% complete against PMS_FSD_v2. A strong MVP foundation exists, especially for template, cycle, assignment, objective, review, and annual decision flows. However, full FSD completion is still pending because dynamic access is foundation-level, communication outcome mapping is not fully aligned with dispatch, visibility governance needs full API-level proof, SLA/delegation/reporting are partial, FE check/build is not clean, and full end-to-end QA coverage is missing.


