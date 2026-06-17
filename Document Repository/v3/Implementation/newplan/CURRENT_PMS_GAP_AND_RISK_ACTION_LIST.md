# Current PMS Gap and Risk Action List

Generated from `CURRENT_PMS_IMPLEMENTATION_TRUTH.md`, `CURRENT_PMS_IMPLEMENTATION_SUMMARY.md`, and cited current code evidence only. No planned PMS v2.1 requirements were used.

## 1. Executive Risk Summary

| Rank | Risk | Severity | Why it matters before new client corrections | Evidence |
|---|---|---|---|---|
| 1 | PMS authorization is inconsistent across routes/services. | Critical | New PMS changes can accidentally expose admin, management, employee, or manager workflows to authenticated users without correct role/ownership checks. | `CURRENT_PMS_IMPLEMENTATION_SUMMARY.md:57`, `Server/src/routes/pms-template.routes.ts:19-318`, `Server/src/services/access.service.ts:114-199` |
| 2 | Visibility masking is partial and field-name based. | Critical | Grade, merit, final rating, score, or confidential outcome values can leak when new fields use unrecognized names or nested shapes. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:1807`, `Server/src/services/visibilityMask.service.ts:6-37`, `Server/src/services/visibilityMask.service.ts:72-79` |
| 3 | Frontend mock/fallback behavior can hide backend failures. | High | Client corrections may appear to work while real APIs are failing, missing, or returning validation errors. | `CURRENT_PMS_IMPLEMENTATION_SUMMARY.md:66`, `Client/src/lib/services/api/pmsCycles.ts:374-386`, `Client/src/lib/services/api/pmsTemplates.ts:2001-2031` |
| 4 | Workflow/status definitions are duplicated and partially mismatched. | High | New workflow corrections can drift between FE display, backend state validation, review status, and quarter assignment status. | `CURRENT_PMS_IMPLEMENTATION_SUMMARY.md:58`, `Server/src/constants/pms.enums.ts:20-117`, `Client/src/lib/types/pms.ts:38-76` |
| 5 | Communication uses static backend templates while letter-template UI/client code remains stale. | High | Client corrections involving communication can target the wrong surface or assume customizable letters are active. | `CURRENT_PMS_IMPLEMENTATION_SUMMARY.md:25`, `Server/src/services/pmsCommunication.service.ts:294-339`, `Client/src/routes/admin/pms/letter-templates/+page.svelte:1-24` |
| 6 | Attachments are metadata-only in PMS. | High | New objective/review attachment features can store unverifiable URLs without upload, delete, type/size validation, or visibility enforcement. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:19`, `Client/src/lib/services/api/pmsObjectives.ts:102-109`, `Server/src/models/pms-objective-attachment.model.ts:22-50` |
| 7 | SLA/background processing is not proven scheduled. | Medium | New reminder/SLA expectations may depend on automation that currently only has service/manual trigger evidence. | `CURRENT_PMS_IMPLEMENTATION_SUMMARY.md:61`, `Server/src/services/sla.service.ts:92-205`, `Server/src/routes/pmsSla.routes.ts:130-137` |
| 8 | Admin UI has hidden and duplicate PMS entry points. | Medium | QA and client users may test different screens for the same action, producing inconsistent correction feedback. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:17.4`, `Client/src/lib/components/common/Sidebar.svelte:171-207`, `Client/src/routes/admin/pms/assignments/+page.svelte:1-221` |
| 9 | Current PMS tests do not cover the highest-risk areas. | Medium | Authorization, visibility leaks, frontend rendering, and communication integration can regress without test alarms. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:1744-1745`, `Server/test/pmsBulkOperations.test.ts:100-105` |
| 10 | PMS current-date override is global to shared API calls. | Medium | Demo/test date behavior can leak into unrelated API calls and confuse validation during client correction testing. | `CURRENT_PMS_IMPLEMENTATION_SUMMARY.md:64`, `Client/src/lib/services/api/base.ts:52-71`, `Server/src/middleware/auth.ts:36-46` |

## 2. Must Fix Before New PMS Changes

Only items that can break or mislead future implementation are listed here.

| Risk ID | Area | Current behavior | Impact | Severity | Recommended action | Owner | Blocks v2.1 change? | Evidence file paths |
|---|---|---|---|---|---|---|---|---|
| PMS-BLOCK-01 | Authorization | Many PMS routes are authenticated but do not visibly enforce `AccessService` at route level; service-level guards are uneven. | New workflows may inherit weak access control and expose sensitive PMS data/actions. | Critical | Create a route/service authorization matrix for all PMS APIs, then add/standardize ownership/admin/hierarchy checks before changing workflow behavior. | BE / Architect / QA | Yes | `Server/src/routes/pms-template.routes.ts:19-318`, `Server/src/routes/cycle.routes.ts:16-237`, `Server/src/routes/objective.routes.ts:16-138`, `Server/src/routes/annualDecision.routes.ts:16-145`, `Server/src/services/access.service.ts:114-199` |
| PMS-BLOCK-02 | Visibility | `visibilityMaskService` removes only known grade/merit/outcome field names and configured confidential fields. | New template fields or annual-decision fields can leak confidential values if names differ. | Critical | Define a required confidential-field contract for new fields and add QA cases for grade/merit/review masking across employee, manager, admin, management, reports, and dashboard paths. | BE / QA / Architect | Yes | `Server/src/services/visibilityMask.service.ts:6-37`, `Server/src/services/visibilityMask.service.ts:72-79`, `Server/src/services/annualDecision.service.ts:1751-2007`, `Server/src/services/reports.service.ts:268-310` |
| PMS-BLOCK-03 | Mock/fallback | PMS cycle/template clients fall back to mocks on network/CORS/404, and template client can fall back on 500. | FE changes can pass visually while backend integration is broken. | High | Disable mock fallback for client-correction QA builds, or gate it behind an explicit dev-only env flag with visible error mode. | FE / QA | Yes | `Client/src/lib/services/api/pmsCycles.ts:374-386`, `Client/src/lib/services/api/pmsCycles.ts:511-518`, `Client/src/lib/services/api/pmsTemplates.ts:40`, `Client/src/lib/services/api/pmsTemplates.ts:2001-2031` |
| PMS-BLOCK-04 | Workflow/status | FE and BE duplicate statuses; review `FINALIZED` and quarter `QUARTER_FINALIZED` are separate concepts; seeded predefined objectives may display as approved. | New status logic can be implemented against the wrong state or hidden by client normalization. | High | Freeze a current status mapping table before changes; update FE to consume backend status intentionally and remove misleading display normalization where it affects workflow decisions. | BE / FE / QA | Yes | `Server/src/constants/pms.enums.ts:20-117`, `Client/src/lib/types/pms.ts:38-76`, `Client/src/lib/services/api/pmsObjectives.ts:65-75` |
| PMS-BLOCK-05 | Communication source of truth | Backend dispatch uses static `STATIC_PMS_V1` templates; `/admin/pms/letter-templates` is a removal notice while builder/client methods still exist. | Teams may build new corrections on stale letter-template code instead of live communication service. | High | Mark current communication source of truth explicitly in implementation tasks; either ignore stale builder paths for v2.1 or remove/hide them from the correction scope. | BA / FE / BE / Architect | Yes, if v2.1 touches communications | `Server/src/services/pmsCommunication.service.ts:294-339`, `Client/src/routes/admin/pms/letter-templates/+page.svelte:1-24`, `Client/src/lib/services/api/pmsTemplates.ts:1864-1995` |
| PMS-BLOCK-06 | Attachments | PMS accepts attachment metadata but lacks proven PMS upload/delete/replace/validation/visibility APIs. | Any new attachment UI can create untrusted metadata without lifecycle control. | High | Decide before implementation whether attachments are in scope. If yes, define the backend upload/delete/validation/visibility contract first; if no, keep attachment UI out of v2.1 changes. | BA / BE / FE / QA | Yes, if v2.1 touches attachments | `Client/src/lib/services/api/pmsObjectives.ts:102-109`, `Client/src/lib/services/api/pmsQuarterReviews.ts:73-78`, `Server/src/models/pms-objective-attachment.model.ts:22-50` |
| PMS-BLOCK-07 | Tests | Existing PMS tests do not cover authorization, visibility leak prevention, frontend runtime rendering, notification delivery, or communication integration; bulk test mocks a non-current communication method. | New corrections can regress critical behavior without failing tests. | High | Add focused regression tests for auth/visibility/status transitions and fix the bulk communication test mock to match `PmsCommunicationService.sendCommunication()`. | QA / BE | Yes | `Server/test/pmsBulkOperations.test.ts:100-105`, `Server/src/services/pmsCommunication.service.ts:60-238`, `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:1744-1745` |

## 3. Can Fix During PMS v2.1 Change

These are important, but they can be handled as part of the client correction work if scoped explicitly.

| Risk ID | Area | Current behavior | Impact | Severity | Recommended action | Owner | Blocks v2.1 change? | Evidence file paths |
|---|---|---|---|---|---|---|---|---|
| PMS-DURING-01 | UI navigation | Admin PMS pages for decisions, communication, audit, SLA, delegation, and bulk are route-live but hidden from sidebar. | Users/QA can miss screens or use direct URLs inconsistently. | Medium | Decide the intended PMS admin navigation and either expose, redirect, or explicitly mark hidden pages. | FE / BA | No | `Client/src/lib/components/common/Sidebar.svelte:171-207` |
| PMS-DURING-02 | Duplicate assignment UI | Legacy `/admin/pms/assignments` overlaps with Assignment Workspace. | Fixes may be applied to one assignment surface while users access another. | Medium | Choose the canonical assignment UI; redirect or label the legacy page if it remains. | FE / BA / QA | No | `Client/src/routes/admin/pms/assignments/+page.svelte:1-221`, `Client/src/lib/components/common/Sidebar.svelte:145-207` |
| PMS-DURING-03 | Runtime form rendering | PMS forms render dynamic template fields in multiple workspaces rather than a centralized renderer. | Field behavior corrections may be duplicated or inconsistent. | Medium | When changing form behavior, patch all active renderers or extract only the repeated low-risk mapping helper needed. | FE | No | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:22.2`, `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`, `Client/src/lib/components/pms/reviews/QuarterReviewWorkspace.svelte`, `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte` |
| PMS-DURING-04 | Template builder validation | Client and backend both validate template structure/scoring with possible rule drift. | Client may allow saves backend rejects, or vice versa. | Medium | Use backend validation as final authority and align client error display while touching builder logic. | FE / BE / QA | No | `Client/src/lib/services/api/pmsTemplates.ts:664-752`, `Server/src/services/pms-template.service.ts:1470-2153` |
| PMS-DURING-05 | Current-date override | Shared `fetchApi()` injects `x-pms-current-date` for all endpoints when set. | Demo/test date can affect unrelated calls during correction QA. | Medium | Make override visibly scoped in UI and add a QA step to reset it before non-date-sensitive testing. | FE / QA | No | `Client/src/lib/services/api/base.ts:52-71`, `Server/src/middleware/auth.ts:36-46` |
| PMS-DURING-06 | Role-permission UI | PMS permission creation is embedded in generic setup config role flow, not a dedicated PMS permissions page. | Admins may not know how permission changes affect PMS access. | Medium | Document the current UI path and add a simple admin note or checklist if permission changes are part of v2.1 QA. | BA / FE / QA | No | `Client/src/lib/components/setup/ConfigManagement.svelte:115-143`, `Server/src/routes/pms-role-permission.routes.ts:27-70` |
| PMS-DURING-07 | Communication readiness | Workflow states include communication-ready behavior, but automatic transition after visibility is not fully proven. | Client corrections may assume a state transition that requires manual send/visibility flow. | Medium | Verify actual state changes in annual decision and communication flows before changing communication UI. | BE / QA | No | `Server/src/constants/workflow.config.ts:146-157`, `Server/src/services/pmsCommunication.service.ts:248-264` |

## 4. Can Defer

These are real gaps but not immediate blockers unless the upcoming corrections touch the same area.

| Risk ID | Area | Current behavior | Impact | Severity | Recommended action | Owner | Blocks v2.1 change? | Evidence file paths |
|---|---|---|---|---|---|---|---|---|
| PMS-DEFER-01 | SLA scheduler | SLA sync/process and manual trigger exist; scheduled PMS cron is not proven. | Reminders may not run automatically. | Medium | Add scheduler proof or implementation when SLA automation becomes a committed requirement. | BE / QA | No, unless SLA is in scope | `Server/src/services/sla.service.ts:92-205`, `Server/src/routes/pmsSla.routes.ts:130-137`, `Server/src/app.ts:14-15` |
| PMS-DEFER-02 | IN_APP notifications | Notification records are created and marked sent, but no delivery/read surface is proven. | In-app notifications may not be visible to users. | Medium | Treat `IN_APP` as audit/log only until a real delivery UI/channel is built. | BE / FE / BA | No, unless notifications are in scope | `Server/src/services/pms-notification.service.ts:170-209` |
| PMS-DEFER-03 | Bulk retry | `retryFailedBulkRecords()` exists in service but no route/client was found. | Failed bulk jobs cannot be retried from UI/API. | Low | Add route/client later if bulk operational retry is needed. | BE / FE | No | `Server/src/services/pmsBulkOperations.service.ts:1414`, `Server/src/routes/pmsBulkOperations.routes.ts:17-290` |
| PMS-DEFER-04 | Demo seed hardening | Demo script is idempotent for its seeded data but does not seed templates/reviews/decisions and should not be production tooling. | Demo environments may be incomplete. | Low | Keep it demo-only; create separate controlled fixtures if needed. | QA / BE | No | `Server/scripts/seed-pms-demo.ts:69-260` |
| PMS-DEFER-05 | Service container consistency | Some PMS helpers are singleton/direct imports rather than request-scoped services. | Harder to mock/test consistently, but currently functional. | Low | Refactor only when tests or dependency injection needs justify it. | Architect / BE | No | `Server/src/container/index.ts:107-116`, `Server/src/types/container.ts:87-96` |

## 5. Security / Permission Risks

| Risk ID | Finding | Severity | Practical action | Evidence |
|---|---|---|---|---|
| PMS-SEC-01 | `AccessService` exists but is not consistently visible at PMS route level. | Critical | Add route/service guard checklist before any endpoint behavior changes. | `Server/src/services/access.service.ts:114-199`, `Server/src/routes/pms-template.routes.ts:19-318`, `Server/src/routes/objective.routes.ts:16-138` |
| PMS-SEC-02 | Many PMS APIs rely on `{ onRequest: [authenticate] }` and local service checks, making protection uneven and harder to audit. | Critical | Standardize expected guard per endpoint: admin, owner, manager, hierarchy, or delegated. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:222-226` |
| PMS-SEC-03 | Bulk routes use a hardcoded `role.toLowerCase() === 'admin'` check. | High | Replace or intentionally document this policy; decide whether Director/Management should be excluded. | `Server/src/routes/pmsBulkOperations.routes.ts:9-15` |
| PMS-SEC-04 | Visibility masking can leak unknown field names or nested confidential data. | Critical | Add confidential-field metadata enforcement for new template fields and annual decision fields. | `Server/src/services/visibilityMask.service.ts:6-37`, `Server/src/services/visibilityMask.service.ts:72-79` |
| PMS-SEC-05 | Frontend role-based hiding cannot be treated as security. | High | Ensure every hidden action has backend authorization and state validation. | `Client/src/lib/components/common/Sidebar.svelte:171-207`, PMS routes under `Server/src/routes/*.routes.ts` |
| PMS-SEC-06 | Dashboard/report masking touches generic services outside obvious PMS routes. | High | Include dashboard and report endpoints in visibility QA. | `Server/src/services/pmsDashboard.service.ts:72-119`, `Server/src/services/reports.service.ts:268-310` |

## 6. Workflow / Status Risks

| Risk ID | Finding | Severity | Practical action | Evidence |
|---|---|---|---|---|
| PMS-WF-01 | FE and BE both define workflow statuses. | High | Maintain a single mapping table for current work; do not add new client assumptions without backend confirmation. | `Server/src/constants/pms.enums.ts:20-117`, `Client/src/lib/types/pms.ts:38-76` |
| PMS-WF-02 | `QuarterReviewStatus.FINALIZED` and `QuarterWorkflowState.QUARTER_FINALIZED` are different state concepts. | High | Keep review record status and quarter assignment state separate in UI copy, API payloads, and tests. | `Server/src/constants/pms.enums.ts:69-76`, `Server/src/constants/pms.enums.ts:20-35` |
| PMS-WF-03 | Quarter state transitions use helper `transitionQuarterAssignmentState()`, which writes workflow and audit records. | Medium | Use the helper for quarter-state changes; avoid direct quarter assignment status updates. | `Server/src/services/quarter-assignment-workflow.service.ts:23-72`, `Server/src/services/objective.service.ts:1774`, `Server/src/services/quarterReview.service.ts:685` |
| PMS-WF-04 | Automatic communication-ready transition after visibility update is uncertain. | Medium | Verify actual annual assignment state transitions before changing communication UI. | `Server/src/constants/workflow.config.ts:146-157`, `Server/src/services/pmsCommunication.service.ts:248-264` |
| PMS-WF-05 | Frontend may display seeded predefined objectives as approved regardless of backend status. | Medium | Remove or isolate display-only normalization from workflow decisions. | `Client/src/lib/services/api/pmsObjectives.ts:65-75` |

## 7. UI / Navigation Risks

| Risk ID | Finding | Severity | Practical action | Evidence |
|---|---|---|---|---|
| PMS-UI-01 | Several admin PMS pages are route-live but hidden from sidebar. | Medium | Decide if each hidden page is active, admin-only direct URL, or should redirect. | `Client/src/lib/components/common/Sidebar.svelte:171-207` |
| PMS-UI-02 | Legacy `/admin/pms/assignments` duplicates assignment workspace behavior. | Medium | Choose one canonical assignment surface for fixes and QA scripts. | `Client/src/routes/admin/pms/assignments/+page.svelte:1-221`, `Client/src/lib/components/common/Sidebar.svelte:145-207` |
| PMS-UI-03 | Multiple assignment entry points exist: cycle launch, assignment workspace, bulk operations, legacy page. | Medium | Test the same core assignment action from each retained entry point. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:17.4` |
| PMS-UI-04 | Some pages are functional but plain/operational, with inconsistent discoverability. | Low | Improve only where client correction scope directly touches the page. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:17.1-17.4` |

## 8. Communication / Notification Risks

| Risk ID | Finding | Severity | Practical action | Evidence |
|---|---|---|---|---|
| PMS-COMM-01 | Communication dispatch uses static `STATIC_PMS_V1` templates. | High | Treat static backend templates as the current source of truth. | `Server/src/services/pmsCommunication.service.ts:294-339` |
| PMS-COMM-02 | `/admin/pms/letter-templates` is a removal notice, but builder/client code remains. | High | Do not build new work on stale builder/client paths unless intentionally reactivated. | `Client/src/routes/admin/pms/letter-templates/+page.svelte:1-24`, `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:1-224` |
| PMS-COMM-03 | `IN_APP` notification delivery is partial. | Medium | Label as record-only until delivery/read UI exists. | `Server/src/services/pms-notification.service.ts:170-209` |
| PMS-COMM-04 | SLA scheduler is not proven. | Medium | Manual trigger is usable; scheduled behavior needs proof before client promise. | `Server/src/services/sla.service.ts:92-205`, `Server/src/routes/pmsSla.routes.ts:130-137`, `Server/src/app.ts:14-15` |
| PMS-COMM-05 | Email sends through services, but delivery assumptions need environment verification. | Medium | QA with configured email transport before accepting communication flows. | `Server/src/services/pmsCommunication.service.ts:125-190`, `Server/src/services/pms-notification.service.ts:185-197` |

## 9. File / Attachment Risks

| Risk ID | Finding | Severity | Practical action | Evidence |
|---|---|---|---|---|
| PMS-FILE-01 | Objective/review attachments are metadata payloads. | High | Do not treat PMS attachments as secure file storage without upload backend. | `Client/src/lib/services/api/pmsObjectives.ts:102-109`, `Client/src/lib/services/api/pmsQuarterReviews.ts:73-78` |
| PMS-FILE-02 | PMS upload/delete/replace APIs were not found. | High | Define file lifecycle first if attachments are in scope. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:19` |
| PMS-FILE-03 | PMS size/type validation was not found. | High | Add server validation before enabling real user uploads. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:19` |
| PMS-FILE-04 | Attachment visibility enforcement is missing from PMS evidence. | High | Reuse visibility rules or add explicit attachment visibility before exposing sensitive files. | `Server/src/models/pms-objective-attachment.model.ts:22-50` |

## 10. Mock / Demo / Test Risks

| Risk ID | Finding | Severity | Practical action | Evidence |
|---|---|---|---|---|
| PMS-MOCK-01 | Cycle/template clients can fall back to local mock data. | High | Disable fallback for integration QA and client correction sign-off. | `Client/src/lib/services/api/pmsCycles.ts:374-386`, `Client/src/lib/services/api/pmsTemplates.ts:2001-2031` |
| PMS-MOCK-02 | Template fallback includes HTTP 500. | High | Do not hide server errors during template builder testing. | `Client/src/lib/services/api/pmsTemplates.ts:2001-2017` |
| PMS-MOCK-03 | Seed script is demo-only and incomplete for full PMS flow. | Low | Use intentionally for local demo only; do not rely on it for full workflow QA. | `Server/scripts/seed-pms-demo.ts:69-260` |
| PMS-MOCK-04 | Tests do not cover authorization/visibility/frontend rendering sufficiently. | Medium | Add focused regression tests before broad workflow corrections. | `CURRENT_PMS_IMPLEMENTATION_TRUTH.md:1744-1745` |
| PMS-MOCK-05 | Bulk operations test mocks non-current communication method `dispatchAppraisalLetter`. | Medium | Update mock to current `sendCommunication()` flow. | `Server/test/pmsBulkOperations.test.ts:100-105`, `Server/src/services/pmsCommunication.service.ts:60-238` |

## 11. Recommended Execution Order

1. Freeze the current PMS baseline: statuses, roles, route inventory, active UI pages, and communication source of truth.
2. Fix or explicitly gate mock/fallback clients for QA so backend errors are visible.
3. Complete the PMS authorization matrix and patch blocking route/service guard gaps.
4. Define and test visibility/confidential-field rules for every current and upcoming data shape.
5. Confirm workflow/status mapping and remove misleading frontend-only status normalization from workflow-sensitive paths.
6. Decide communication scope: keep static backend templates for now, or intentionally reactivate letter-template work later.
7. Decide attachment scope: exclude from v2.1 or define upload/delete/validation/visibility before UI work.
8. Pick canonical admin navigation paths, especially assignment workspace versus legacy assignments page.
9. Add focused regression tests for authorization, visibility, status transitions, communication dispatch, and mock-disabled client flows.
10. Start PMS v2.1/client corrections only after the above blockers are either fixed or formally marked out of scope.

## 12. Final Recommendation

The current implementation can be used as the baseline for PMS v2.1 only if the team protects the existing workflow, authorization, visibility, and communication contracts first. It is broad enough to build on, but not clean enough to treat every visible UI/API path as equally authoritative.

Before changing client-facing PMS behavior, protect these four boundaries:

- Backend authorization must be the source of truth, not sidebar hiding or frontend role checks.
- Backend visibility masking must cover any new grade, merit, score, rating, outcome, or confidential fields.
- Backend workflow/status values must drive state transitions and action availability.
- Current communication dispatch is static backend content, not the stale letter-template builder.

Practical call: proceed with PMS v2.1 only after completing the `Must Fix Before New PMS Changes` list or explicitly excluding affected areas from the v2.1 scope.
