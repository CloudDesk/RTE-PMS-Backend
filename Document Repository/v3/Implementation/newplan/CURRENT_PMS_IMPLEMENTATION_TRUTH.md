# Current PMS Implementation Truth

Generated from the current project code only.

Rules used while preparing this document:

- No planned requirements were used.
- No PMS v2.1/self-review/assessment-term assumptions were added.
- Code is treated as the source of truth.
- `PARTIAL` means code exists but is incomplete, inconsistent, or not wired everywhere.
- `NOT IMPLEMENTED` means no implementation was found in current code.
- `NEEDS VERIFICATION` means the behavior may exist at runtime, but current code evidence is not enough to prove it.

## 1. Executive Summary

The current PMS implementation is broad and partially integrated. The backend exposes a PMS API surface under `/pms/*`; the frontend has admin, manager, employee, management, and super-admin PMS routes. The implemented core includes templates, template versions, builder metadata, cycle setup, assignments, objective workflow, manager review workflow, annual decisions, visibility, communications, SLA, delegations, dashboards, audit, role permissions, and bulk operations.

Important current truth:

- PMS is the primary visible product shell in this repo. Root/auth redirects route users to PMS dashboards by role. Evidence: `Client/src/routes/+layout.ts:58-63`, `Client/src/routes/login/controller.ts:36-53`.
- Backend PMS modules are registered centrally in `Server/src/routes/index.ts`. Evidence: `Server/src/routes/index.ts:92-107`.
- Template Builder is not just a UI mock. Template version documents persist sections, fields, objective configs, scoring configs, behavior rules, permissions, annual scoring config, rendering scope, metadata, lock state, and timestamps. Evidence: `Server/src/models/pms-template-version.model.ts:189-505`.
- Assignment creation creates employee-level annual assignment records and quarter assignment records; it can seed predefined objectives from the selected template version. Evidence: `Server/src/services/assignment.service.ts:243-345`, `Server/src/services/assignment.service.ts:921-1234`.
- Objective and review flows are template-aware and store dynamic value records separately from main objective/review records. Evidence: `Server/src/models/pms-objective-value.model.ts:29-95`, `Server/src/models/pms-quarter-review-value.model.ts:29-96`.
- Authorization is inconsistent. Most PMS routes use only authentication, while `AccessService` and PMS role permissions exist separately. Bulk operations use a hardcoded admin-only check. Evidence: `Server/src/routes/pms-template.routes.ts:19-318`, `Server/src/services/access.service.ts:114-199`, `Server/src/routes/pmsBulkOperations.routes.ts:9-15`.
- PMS scheduled background automation is not fully proven. SLA processing service exists and can be manually triggered, but app bootstrap only proves import of a non-PMS shift cron file. Evidence: `Server/src/services/sla.service.ts:92-205`, `Server/src/routes/pmsSla.routes.ts:130-137`, `Server/src/app.ts:14-15`.
- PMS file upload is metadata-oriented in current PMS flows. Objective/review attachment arrays are sent and persisted, but PMS-specific upload, delete, replace, size/type validation, and visibility enforcement were not found. Evidence: `Client/src/lib/services/api/pmsObjectives.ts:102-109`, `Client/src/lib/services/api/pmsQuarterReviews.ts:73-78`, `Server/src/models/pms-objective-attachment.model.ts:22-50`.

## 2. Project Entry Points

### 2.1 Backend Bootstrap

| Entry point | Current behavior | Evidence |
|---|---|---|
| `Server/src/app.ts` | Creates Fastify app, loads env, sets UTC timezone, starts DB connection, registers cookie/JWT/CORS/Swagger/static/multipart, decorates request with scoped container, registers routes. | `Server/src/app.ts:1-224` |
| `Server/src/index.ts` | Lambda handler initializes `createApp()` once and proxies events through `@fastify/aws-lambda`. | `Server/src/index.ts:1-20` |
| `Server/src/routes/index.ts` | Registers PMS routes under `/pms/*`. Many non-PMS modules are commented out. | `Server/src/routes/index.ts:1-107` |
| `Server/src/container/index.ts` | Creates per-request service instances used by route handlers. | `Server/src/app.ts:200-210`; container file should be treated as the service wiring source. |

PMS backend route registration:

| Prefix | Route module | Purpose |
|---|---|---|
| `/pms/permissions` | `pms-role-permission.routes.ts` | Role permission CRUD. |
| `/pms/templates` | `pms-template.routes.ts` | Template/version/builder/resolve APIs. |
| `/pms/access` | `pms-access.routes.ts` | Access checking/reload/cache APIs. |
| `/pms/cycles` | `cycle.routes.ts` | Annual cycle lifecycle. |
| `/pms/cycles` | `assignment.routes.ts` | Cycle-scoped assignments and reassignment. |
| `/pms/objectives` | `objective.routes.ts` | Objective workspace and workflow. |
| `/pms/quarter-reviews` | `quarterReview.routes.ts` | Manager quarter review workflow. |
| `/pms/quarter-assignments` | `quarterAssignment.routes.ts` | Quarter transition action route. |
| `/pms/annual-assignments` | `annualDecision.routes.ts` | Annual decisions, visibility, score override. |
| `/pms/communications` | `pmsCommunication.routes.ts` | Preview/send/resend/history. |
| `/pms/audit` | `pmsAudit.routes.ts` | Assignment history. |
| `/pms/sla` | `pmsSla.routes.ts` | SLA rules/reminders/events/history. |
| `/pms/delegations` | `delegation.routes.ts` | Scoped PMS delegation. |
| `/pms/dashboard` | `pmsDashboard.routes.ts` | Role dashboards. |
| `/pms/bulk` | `pmsBulkOperations.routes.ts` | Bulk assignment/reminder/visibility/communication/close/job APIs. |

Evidence: `Server/src/routes/index.ts:92-107`.

### 2.2 Frontend Bootstrap and Role Redirects

- SSR and prerender are disabled in the root layout loader. Evidence: `Client/src/routes/+layout.ts:10-11`.
- If unauthenticated and not `/login` or `/`, the frontend redirects to `/login`. Evidence: `Client/src/routes/+layout.ts:33-50`.
- If authenticated and on `/` or `/login`, redirect path is derived from role:
  - `ADMIN` -> `/admin/pms/dashboard`
  - `DIRECTOR` or `MANAGEMENT` -> `/management/pms/dashboard`
  - `MANAGER` -> `/manager/pms/dashboard`
  - everything else -> `/my/pms/dashboard`
  Evidence: `Client/src/routes/+layout.ts:58-63`.
- Login controller uses scope as well as role:
  - `scope === 'ALL'` or `role === 'ADMIN'` -> admin PMS dashboard
  - `scope === 'EXECUTIVE'` or `DIRECTOR`/`MANAGEMENT` -> management PMS dashboard
  - `MANAGER` -> manager PMS dashboard
  - default -> my PMS dashboard
  Evidence: `Client/src/routes/login/controller.ts:36-53`.
- Root layout renders the responsive sidebar for authenticated pages, mobile top nav, normal toast, and FCM toast. Evidence: `Client/src/routes/+layout.svelte:290-361`.

### 2.3 PMS Frontend Route Inventory

Admin PMS routes found:

| Route path | Page file | Current component/workspace |
|---|---|---|
| `/admin/pms/dashboard` | `Client/src/routes/admin/pms/dashboard/+page.svelte` | `PmsDashboardWorkspace`. |
| `/admin/pms/templates` | `Client/src/routes/admin/pms/templates/+page.svelte`, `+page.ts` | Template list/create page. |
| `/admin/pms/templates/[templateId]` | `Client/src/routes/admin/pms/templates/[templateId]/+page.svelte`, `+page.ts` | Template detail/version listing. |
| `/admin/pms/templates/[templateId]/versions/[versionId]` | `Client/src/routes/admin/pms/templates/[templateId]/versions/[versionId]/+page.svelte`, `+page.ts` | Template builder. |
| `/admin/pms/templates/[templateId]/versions/[versionId]/preview` | `.../preview/+page.svelte`, `+page.ts` | Template preview. |
| `/admin/pms/templates/[templateId]/versions/[versionId]/simulator` | `.../simulator/+page.svelte`, `+page.ts` | Permission/access simulator. |
| `/admin/pms/letter-templates` | `Client/src/routes/admin/pms/letter-templates/+page.svelte`, `+page.ts` | Letter template builder/list. |
| `/admin/pms/cycles` | `Client/src/routes/admin/pms/cycles/+page.svelte`, `+page.ts` | Cycle list. |
| `/admin/pms/cycles/new` | `Client/src/routes/admin/pms/cycles/new/+page.svelte` | Cycle wizard create. |
| `/admin/pms/cycles/[id]` | `Client/src/routes/admin/pms/cycles/[id]/+page.svelte`, `+page.ts` | Cycle detail tabs. |
| `/admin/pms/cycles/[id]/edit` | `Client/src/routes/admin/pms/cycles/[id]/edit/+page.svelte`, `+page.ts` | Cycle wizard edit. |
| `/admin/pms/assignment-workspace` | `Client/src/routes/admin/pms/assignment-workspace/+page.svelte` | `AssignmentWorkspace`. |
| `/admin/pms/assignment-workspace/[annualAssignmentId]` | `.../[annualAssignmentId]/+page.svelte`, `+page.ts` | `Assignment360Detail`. |
| `/admin/pms/assignments` | `Client/src/routes/admin/pms/assignments/+page.svelte` | Legacy/direct assignment page. |
| `/admin/pms/reviews` | `Client/src/routes/admin/pms/reviews/+page.svelte` | Admin quarter review workspace. |
| `/admin/pms/decisions` | `Client/src/routes/admin/pms/decisions/+page.svelte` | Annual decision workspace. |
| `/admin/pms/communications` | `Client/src/routes/admin/pms/communications/+page.svelte` | Communication dispatch workspace. |
| `/admin/pms/audit` | `Client/src/routes/admin/pms/audit/+page.svelte` | Audit history workspace. |
| `/admin/pms/sla` | `Client/src/routes/admin/pms/sla/+page.svelte` | SLA workspace. |
| `/admin/pms/delegation` | `Client/src/routes/admin/pms/delegation/+page.svelte` | Delegation workspace. |
| `/admin/pms/bulk` | `Client/src/routes/admin/pms/bulk/+page.svelte` | Bulk operations workspace. |

Manager/employee/management routes found:

| Route path | Page file | Current component/workspace |
|---|---|---|
| `/manager/pms/dashboard` | `Client/src/routes/manager/pms/dashboard/+page.svelte` | `PmsDashboardWorkspace`. |
| `/manager/objectives` | `Client/src/routes/manager/objectives/+page.svelte` | Manager objective workspace. |
| `/manager/reviews` | `Client/src/routes/manager/reviews/+page.svelte` | Manager quarter review workspace. |
| `/my/pms/dashboard` | `Client/src/routes/my/pms/dashboard/+page.svelte` | `PmsDashboardWorkspace`. |
| `/my/reviews` | `Client/src/routes/my/reviews/+page.svelte` | Employee review/read workflow. |
| `/management/pms/dashboard` | `Client/src/routes/management/pms/dashboard/+page.svelte` | `PmsDashboardWorkspace`. |
| `/management/pms/decisions` | `Client/src/routes/management/pms/decisions/+page.svelte` | Annual decision workspace, likely read-only/management view depending props. |
| `/management/pms/audit` | `Client/src/routes/management/pms/audit/+page.svelte` | Audit history workspace. |
| `/super-admin/pms/decisions` | `Client/src/routes/super-admin/pms/decisions/+page.svelte` | Annual decision workspace. |

### 2.4 Sidebar and URL-Only PMS Pages

Admin sidebar visible items:

- Dashboard -> `/admin/pms/dashboard`
- Employee -> `/admin/employees`
- Templates -> `/admin/pms/templates`
- Cycles -> `/admin/pms/cycles`
- Assignment Workspace -> `/admin/pms/assignment-workspace`

Evidence: `Client/src/lib/components/common/Sidebar.svelte:145-170`.

Admin PMS routes commented out of sidebar but still present by URL:

- Assignments
- Annual Decisions
- Communication Dispatch
- Audit & History
- SLA & Notifications
- Scoped Delegations
- Bulk Operations

Evidence: `Client/src/lib/components/common/Sidebar.svelte:171-207`.

Current truth: those pages are route-accessible if the user navigates directly, but not discoverable from the current admin sidebar.

## 3. Shared Constants, Types, and Status Sources

### 3.1 Backend PMS Constants

Backend constants live in `Server/src/constants/pms.enums.ts`.

| Constant | Values | Evidence |
|---|---|---|
| `PmsRole` | `EMPLOYEE`, `MANAGER`, `ADMIN`, `MANAGEMENT`, `DIRECTOR`; type is widened to `string`. | `Server/src/constants/pms.enums.ts:1-12` |
| `QuarterWorkflowState` | `NOT_STARTED`, `OBJECTIVE_SETTING_OPEN`, `OBJECTIVE_DRAFT`, `OBJECTIVE_SUBMITTED`, `OBJECTIVE_REVISION_REQUIRED`, `OBJECTIVE_APPROVED`, `MANAGER_REVIEW_OPEN`, `MANAGER_REVIEW_SUBMITTED`, `QUARTER_FINALIZED`, `REOPENED_BY_ADMIN`, `CLOSED_BY_ADMIN`. | `Server/src/constants/pms.enums.ts:20-35` |
| `AnnualWorkflowState` | `DRAFT`, `SCHEDULED`, `ACTIVE`, `IN_PROGRESS`, `ALL_QUARTERS_FINALIZED`, `APPRAISAL_WINDOW_OPEN`, `MANAGEMENT_DECISION_DRAFT`, `MANAGEMENT_DECISION_SUBMITTED`, `ANNUAL_FINALIZED`, `VISIBILITY_ENABLED`, `COMMUNICATION_READY`, `COMMUNICATION_SENT`, `CLOSED`, `ARCHIVED`, `CANCELLED`. | `Server/src/constants/pms.enums.ts:37-57` |
| `AnnualDecisionStatus` | `DRAFT`, `SUBMITTED`, `FROZEN`, `VISIBILITY_ENABLED`, `CLOSED`. | `Server/src/constants/pms.enums.ts:58-67` |
| `QuarterReviewStatus` | `MANAGER_REVIEW_OPEN`, `MANAGER_REVIEW_SUBMITTED`, `FINALIZED`. | `Server/src/constants/pms.enums.ts:69-76` |
| `ObjectiveStatus` | Alias set for objective workflow states: draft/submitted/revision/approved. | `Server/src/constants/pms.enums.ts:78-86` |
| `ObjectiveSource` | `PREDEFINED`, `EMPLOYEE_CREATED`, `MANAGER_CREATED`. | `Server/src/constants/pms.enums.ts:88-94` |
| `AppraisalOutcomeType` | `BOTH`, `MERIT_ONLY`, `GRADE_ONLY`, `NIL`. | `Server/src/constants/pms.enums.ts:96-104` |
| `PmsTemplateStatus` | `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED`. | `Server/src/constants/pms.enums.ts:106-114` |
| `PmsTemplateSectionLevel` | `ANNUAL`, `QUARTER`. | `Server/src/constants/pms.enums.ts:116-122` |
| `PmsTemplateSectionType` | `OBJECTIVES`, `COMPETENCIES`, `KPIS`, `BEHAVIOURAL_TRAITS`, `DEVELOPMENT_PLAN`, `QUARTER_REVIEW`, `ANNUAL_SUMMARY`, `FINAL_GRADE`, `MERIT`, `APPRAISAL_COMMUNICATION`, `OVERALL_FEEDBACK`, `VISIBILITY_GOVERNANCE`. | `Server/src/constants/pms.enums.ts:124-140` |
| `PmsTemplateFieldType` | `SHORT_TEXT`, `LONG_TEXT`, `STATIC_TEXT`, `SECTION_DIVIDER`, `NUMERIC_INPUT`, `DROPDOWN`, `RADIO`, `CHECKBOX`, `CHECKBOX_GROUP`, `MULTISELECT`, `DATE`, `DATE_RANGE`, `RATING_SCALE`, `WEIGHTED_SCORE`, `CURRENCY`, `PERCENTAGE`, `ATTACHMENT`, `RICH_TEXT`, `FORMULA`, `COMMENT_BOX`, `BOOLEAN`, `SIGNATURE`, `MATRIX`, `DATA_GRID`. | `Server/src/constants/pms.enums.ts:142-170` |
| `FieldCategory` | `NORMAL`, `SCORING`, `CALCULATED`, `SYSTEM`, `CONFIDENTIAL`, `HIDDEN`. | `Server/src/constants/pms.enums.ts:172-181` |
| `SemanticRole` | Objective/title/target/weightage/achievement, manager rating/score/comment, competency rating/comment, final grade, merit percentage, appraisal outcome. | `Server/src/constants/pms.enums.ts:183-199` |
| `WorkflowEntityType` | `QUARTER_ASSIGNMENT`, `ANNUAL_CYCLE`, `ANNUAL_ASSIGNMENT`. | `Server/src/constants/pms.enums.ts:201-209` |
| `WorkflowAction` | Objective, manager review, finalize, reopen, close actions. | `Server/src/constants/pms.enums.ts:210-223` |
| `PmsErrorCode` | PMS access/auth/workflow/validation error codes. | `Server/src/constants/pms.enums.ts:225-236` |
| `PmsAuditAction` | Template/cycle/assignment/objective/review/decision/visibility/communication audit action codes. | `Server/src/constants/pms.enums.ts:238-277` |

### 3.2 Frontend PMS Types

Frontend PMS workflow types live in `Client/src/lib/types/pms.ts`.

- Frontend repeats annual and quarter workflow state arrays. Evidence: `Client/src/lib/types/pms.ts:40-76`.
- Frontend normalizes user roles: `STAFF` -> `EMPLOYEE`, `HR_ADMIN` -> `ADMIN`, `SUPER_ADMIN` -> `DIRECTOR`. Evidence: `Client/src/lib/types/pms.ts:19-24`.
- Frontend types include cycle windows, template version options, assignment template suggestion rules, objective records, quarter review records, annual decision records, communication dispatch records. Evidence: `Client/src/lib/types/pms.ts:79-606`.

Frontend template builder types live in `Client/src/lib/types/pmsTemplate.ts`.

- Frontend builder template status strings are title-case: `Draft`, `Active`, `Inactive`. Evidence: `Client/src/lib/types/pmsTemplate.ts:5`.
- Frontend field types are lower-level UI strings such as `text`, `textarea`, `number`, `select`, `multiselect`, `radio`, `checkbox`, `checkbox_group`, `date`, `date_range`, `rating_scale`, `currency`, `percentage`, `attachment`, `rich_text`, `formula`, `comment_box`, `static_text`, `section_divider`, `signature`, `matrix`, `data_grid`. Evidence: `Client/src/lib/types/pmsTemplate.ts:30-52`.
- Frontend template API maps backend enum values to frontend field/module/status strings and back. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:933-1029`, `Client/src/lib/services/api/pmsTemplates.ts:1390-1439`.

### 3.3 Status Mismatches and Duplication

Current mismatches/risk:

- Backend template status uses uppercase; frontend builder uses title-case. Mapping exists in `pmsTemplates.ts`. Evidence: `Server/src/constants/pms.enums.ts:106-114`, `Client/src/lib/types/pmsTemplate.ts:5`, `Client/src/lib/services/api/pmsTemplates.ts:933-960`.
- Quarter review model status has `FINALIZED`, while quarter assignment workflow has `QUARTER_FINALIZED`. This is a real naming split. Evidence: `Server/src/constants/pms.enums.ts:69-76`, `Server/src/constants/pms.enums.ts:20-35`.
- Frontend objective assignment sanitizer forces seeded predefined objectives to display as `OBJECTIVE_APPROVED`. This can mask backend status. Evidence: `Client/src/lib/services/api/pmsObjectives.ts:65-75`.
- Backend `PmsRole` type is widened to `string` for dynamic roles, while frontend `PmsRole` is a union of five roles. Evidence: `Server/src/constants/pms.enums.ts:10`, `Client/src/lib/types/pms.ts:1-9`.

## 4. Authentication, Authorization, and Access Truth

### 4.1 Authentication

- `authenticate` reads JWT from `access_token` cookie, verifies it, validates `_id`, populates `request.user`, checks `active`, checks `portalAccess`, and recreates scoped services with user/request context. Evidence: `Server/src/middleware/auth.ts:182-244`.
- `authenticate` also supports WhatsApp signature/secret authentication using phone number lookup. Evidence: `Server/src/middleware/auth.ts:53-180`.
- The request context includes `pmsCurrentDate` from `x-pms-current-date`, enabling test-date behavior in PMS services. Evidence: `Server/src/middleware/auth.ts:36-46`, `Server/src/middleware/auth.ts:218-223`.
- Authentication failures return `{ success: false, error: { message } }` with HTTP 401. Evidence: `Server/src/middleware/auth.ts:244-250`.

### 4.2 Authorization Engine

- `AccessService` loads `PmsRolePermission` records into an in-memory cache with TTL. Evidence: `Server/src/services/access.service.ts:19-84`.
- If no DB permissions exist, it seeds defaults:
  - `ADMIN` -> all resources/actions, `ALL`
  - `EMPLOYEE` -> all resources/actions, `OWN`
  - `MANAGER` -> all resources/actions, `TEAM`
  - `MANAGEMENT` -> all resources/actions, `TEAM`
  - `DIRECTOR` -> all resources/actions, `HIERARCHY`
  Evidence: `Server/src/services/access.service.ts:90-103`.
- `canPerform()` supports explicit denies overriding allows. Evidence: `Server/src/services/access.service.ts:156-167`.
- Supported scopes include `OWN`, `TEAM`, `HIERARCHY`, `DELEGATED`, `DEPARTMENT`, `BUSINESS_UNIT`, `REGION`, `GLOBAL`, `ALL`. Evidence: `Server/src/services/access.service.ts:171-199`, `Server/src/models/pms-role-permission.model.ts:15-37`.
- PMS access routes expose access checking/cache/reload behavior. Evidence: `Server/src/routes/pms-access.routes.ts:12-59`.
- PMS role-permission routes expose CRUD for permissions and reload access cache after create/update. Evidence: `Server/src/routes/pms-role-permission.routes.ts:14-54`.

### 4.3 Authorization Gaps

- Most PMS route definitions only require `authenticate`; they do not visibly call `AccessService` at route level. Evidence: `Server/src/routes/pms-template.routes.ts:19-318`, `Server/src/routes/cycle.routes.ts:16-237`, `Server/src/routes/objective.routes.ts:16-138`, `Server/src/routes/annualDecision.routes.ts:16-145`.
- Bulk operations enforce only `request.user?.role?.toLowerCase() === 'admin'`. Evidence: `Server/src/routes/pmsBulkOperations.routes.ts:9-15`.
- Because `AccessService` exists but is not consistently visible in route definitions, authorization enforcement is `PARTIAL`. Some service methods may enforce actor ownership or admin checks internally; each method must be reviewed before claiming complete protection.

## 5. Data Model and Relationship Map

### 5.1 Core Relationship Diagram

Text map from current Mongoose models:

```text
PmsTemplate
  └── PmsTemplateVersion (templateId -> PmsTemplate)
        ├── sections[] / fields[] / objectiveConfig / objectiveBuckets / scoring
        ├── AnnualCycle.templateVersionId
        ├── AnnualAssignment.templateVersionId
        ├── QuarterAssignment.templateVersionId
        ├── Objective.templateVersionId
        └── PerformanceHistorySnapshot.templateVersionId

AnnualCycle
  ├── QuarterCycle[] (annualCycleId -> AnnualCycle)
  ├── AnnualAssignment[] (cycleId -> AnnualCycle)
  ├── QuarterAssignment[] (cycleId -> AnnualCycle)
  ├── Objective[] (cycleId -> AnnualCycle)
  ├── QuarterReview[] (cycleId -> AnnualCycle)
  ├── AnnualDecision[] (cycleId -> AnnualCycle)
  ├── CommunicationDispatch[] (cycleId -> AnnualCycle)
  ├── SlaEvent[] / SlaRule[] / Delegation[] / BulkOperationJob[]
  └── AuditLog / WorkflowEvent references through entity metadata

AnnualAssignment
  ├── employeeId -> User
  ├── assignedManagerId -> User
  ├── cycleId -> AnnualCycle
  ├── templateVersionId -> PmsTemplateVersion
  ├── quarterAssignmentIds[] -> QuarterAssignment
  ├── Objective[] (annualAssignmentId)
  ├── QuarterReview[] (annualAssignmentId)
  ├── AnnualDecision (annualAssignmentId)
  ├── AnnualDecisionValue[] (annualAssignmentId)
  ├── VisibilityConfiguration (annualAssignmentId)
  ├── CommunicationDispatch[] (annualAssignmentId)
  ├── PerformanceHistorySnapshot[] (annualAssignmentId)
  ├── Reassignment[] (annualAssignmentId)
  └── AuditLog.assignmentId

QuarterAssignment
  ├── annualAssignmentId -> AnnualAssignment
  ├── cycleId -> AnnualCycle
  ├── cycleQuarterId -> QuarterCycle
  ├── employeeId -> User
  ├── assignedManagerId -> User
  ├── templateVersionId -> PmsTemplateVersion
  ├── Objective[] (quarterAssignmentId)
  ├── ObjectiveValue[] / ObjectiveComment[] / ObjectiveEvidence[]
  ├── QuarterReview (quarterAssignmentId)
  └── QuarterReviewValue[] / WorkflowEvent[]
```

### 5.2 Model Inventory

| Model | Collection role | Key fields/relationships | Evidence |
|---|---|---|---|
| `PmsTemplate` | Template header/master. | `code`, `name`, `description`, `status`, `currentVersionId`, soft delete, audit fields. | `Server/src/models/pms-template.model.ts:20-58` |
| `PmsTemplateVersion` | Stored builder/runtime config. | `templateId`, `version`, `status`, `sections`, `themeConfig`, `scoringConfig`, `annualScoringConfig`, `isLocked`, soft delete/audit/timestamps. | `Server/src/models/pms-template-version.model.ts:468-505` |
| `AnnualCycle` | Annual PMS cycle. | `code`, `name`, `appraisalYear`, dates, `status`, `templateVersionId`, `quarterCycleIds`, appraisal/communication/template suggestion configs. | `Server/src/models/pms-annual-cycle.model.ts:51-107` |
| `QuarterCycle` | Cycle quarter and window setup. | `annualCycleId`, `quarterCode`, dates, objective/review/finalization windows, SLA config, closure rules, `status`. | `Server/src/models/pms-quarter-cycle.model.ts:38-81` |
| `AnnualAssignment` | Employee annual appraisal assignment. | `employeeId`, `assignedManagerId`, `cycleId`, `templateVersionId`, `quarterAssignmentIds`, `annualState`, `finalDecisionStatus`, `applicableQuarters`, snapshots, visibility, communicationStatus. | `Server/src/models/pms-annual-assignment.model.ts:57-131` |
| `QuarterAssignment` | Employee quarter workflow instance. | `annualAssignmentId`, `cycleId`, `cycleQuarterId`, employee/manager/template, `quarterCode`, `quarterState`, `previousQuarterState`, transition reason/by/at, summary. | `Server/src/models/pms-quarter-assignment.model.ts:30-108` |
| `Objective` | Objective row/work item. | Quarter/annual/cycle/template refs, quarterCode, employee/manager, source, predefined flags, fields, status, attachments, delegates, approvals. | `Server/src/models/pms-objective.model.ts:54-187` |
| `ObjectiveValue` | Dynamic template field values for objectives. | Objective/quarter/annual/cycle/employee refs, section/field/role/workflow keys, typed value columns. | `Server/src/models/pms-objective-value.model.ts:29-95` |
| `ObjectiveComment` | Objective comments and return reasons. | Objective/quarter/annual/cycle refs, quarter, actor, commentType/text. | `Server/src/models/pms-objective-comment.model.ts:22-77` |
| `ObjectiveEvidence` | Evidence wrapper for objectives. | Objective/quarter/annual/cycle refs, quarter, uploadedBy, attachmentIds. | `Server/src/models/pms-objective-evidence.model.ts:25-91` |
| `ObjectiveAttachment` | Separate attachment metadata model. | Objective ref, file metadata, uploadedBy, visibilityRules, versionNo. | `Server/src/models/pms-objective-attachment.model.ts:22-50` |
| `QuarterReview` | Manager review record. | Quarter/annual/cycle refs, manager/employee, reviewStatus, ratings, comments, score, overallRating, recommendation, attachments. | `Server/src/models/pms-quarter-review.model.ts:49-142` |
| `QuarterReviewValue` | Dynamic template field values for reviews. | Review/quarter/annual/cycle/employee refs, section/field/role/workflow keys, typed value columns. | `Server/src/models/pms-quarter-review-value.model.ts:29-96` |
| `AnnualDecision` | Final annual appraisal decision. | Annual/cycle/employee refs, finalScore, finalRating, grade/merit flags/details, outcome type, decisionStatus, decided/submitted/frozen users. | `Server/src/models/pms-annual-decision.model.ts:35-98` |
| `AnnualDecisionValue` | Dynamic annual decision template values. | AnnualDecision/AnnualAssignment refs, field/section/role, actor, typed value columns. | `Server/src/models/pms-annual-decision-value.model.ts:23-63` |
| `VisibilityConfiguration` | Appraisal visibility controls. | Annual assignment/cycle/employee refs, employee/manager grade/review/merit booleans, enabled/disabled metadata. | `Server/src/models/pms-visibility-configuration.model.ts:26-73` |
| `CommunicationDispatch` | Appraisal communication dispatch. | Annual assignment/cycle/employee refs, outcome, channel, dispatchStatus, content hash, deliveryStatus, resendOf. | `Server/src/models/pms-communication-dispatch.model.ts:31-84` |
| `SlaRule`, `ReminderRule`, `SlaEvent` | SLA and reminder engine. | Rule event/due config, reminder timing/channel, event owner/status/dueAt. | `Server/src/models/pms-sla-rule.model.ts:21-47`, `Server/src/models/pms-reminder-rule.model.ts:21-53`, `Server/src/models/pms-sla-event.model.ts:24-91` |
| `Delegation` | Manager/delegate PMS scope. | Delegator/delegate users, scopeType, cycleId, valid dates, status/revocation metadata. | `Server/src/models/pms-delegation.model.ts:23-82` |
| `Reassignment` | Manager reassignment history. | Annual/quarter assignment refs, employee/from/to manager, effectiveFrom, appliesTo, reason, approvedBy. | `Server/src/models/pms-reassignment.model.ts:22-86` |
| `AssignmentExceptionQueue` | Assignment exception tracking. | Cycle/employee, exceptionType, status, message, resolution, resolvedBy. | `Server/src/models/pms-assignment-exception-queue.model.ts:21-73` |
| `BulkOperationJob` | Bulk job history. | jobType, cycleId, requestedBy, status, counts, failureSummary, payload/result. | `Server/src/models/pms-bulk-operation-job.model.ts:30-88` |
| `AuditLog` | Audit/history events. | entityType/entityId/action/user/actor/role/previous/new/reason/metadata/correlation/assignment/timestamps. | `Server/src/models/audit-log.model.ts:23-78` |
| `WorkflowEvent` | Workflow event history. | entityType/entityId, annual/quarter/cycle refs, previous/current state, actor, metadata, createdAt. | `Server/src/models/pms-workflow-event.model.ts:20-56` |
| `PmsRolePermission` | Access policy rows. | role/resource/action/scope/conditions/isAllowed/priority. | `Server/src/models/pms-role-permission.model.ts:15-37` |

## 6. Admin Flow Truth

### 6.1 Admin Dashboard

- Route: `/admin/pms/dashboard`.
- Component: `PmsDashboardWorkspace`.
- Backend caller: `pmsDashboardApi.getAdminDashboard(cycleId?)`.
- Backend route: `GET /pms/dashboard/admin`.
- Backend service: `PmsDashboardService.getAdminDashboard(cycleId?)`.
- UI behavior:
  - Loads cycles for cycle filter. Evidence: `Client/src/lib/components/pms/dashboard/PmsDashboardWorkspace.svelte:95-144`.
  - Allows role-based tab selection via `getAllowedTabs(role)`. Evidence: `Client/src/lib/components/pms/dashboard/PmsDashboardWorkspace.svelte:42-55`.
  - Shows refresh button, loading state, dashboard stats, objective stats, communication/SLA sections, and empty messages. Evidence: `Client/src/lib/components/pms/dashboard/PmsDashboardWorkspace.svelte:223-256`, `Client/src/lib/components/pms/dashboard/PmsDashboardWorkspace.svelte:596-887`.
- Backend evidence: `Server/src/routes/pmsDashboard.routes.ts:83-115`, `Server/src/services/pmsDashboard.service.ts:249-407`.
- Current status: Implemented.

### 6.2 Admin Template Management

Routes:

- `/admin/pms/templates`
- `/admin/pms/templates/[templateId]`
- `/admin/pms/templates/[templateId]/versions/[versionId]`
- `/admin/pms/templates/[templateId]/versions/[versionId]/preview`
- `/admin/pms/templates/[templateId]/versions/[versionId]/simulator`

Main frontend files:

- `Client/src/routes/admin/pms/templates/+page.svelte`
- `Client/src/routes/admin/pms/templates/+page.ts`
- `Client/src/routes/admin/pms/templates/[templateId]/+page.svelte`
- `Client/src/routes/admin/pms/templates/[templateId]/+page.ts`
- `Client/src/routes/admin/pms/templates/[templateId]/versions/[versionId]/+page.svelte`
- `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte`
- `Client/src/lib/components/pms/templates/TemplatePreview.svelte`
- `Client/src/lib/components/pms/templates/TemplatePreviewSimulatorWorkspace.svelte`
- `Client/src/lib/components/pms/templates/StarterTemplateCatalog.svelte`
- `Client/src/lib/components/pms/templates/VersionControl.svelte`

Implemented actions:

- List/search/filter PMS templates. Evidence: `Client/src/routes/admin/pms/templates/+page.ts:1-42`, `Client/src/routes/admin/pms/templates/+page.svelte:56-106`.
- Create PMS template. Evidence: `Client/src/routes/admin/pms/templates/+page.svelte:225-263`, `Server/src/routes/pms-template.routes.ts:34-46`, `Server/src/services/pms-template.service.ts:180-214`.
- Update/delete/clone template. Evidence: `Server/src/routes/pms-template.routes.ts:49-92`, `Server/src/services/pms-template.service.ts:215-330`.
- Create/list/delete/get versions. Evidence: `Server/src/routes/pms-template.routes.ts:94-123`, `Server/src/routes/pms-template.routes.ts:167-193`, `Server/src/services/pms-template.service.ts:369-419`, `Server/src/services/pms-template.service.ts:521-567`.
- Activate/deactivate version. Evidence: `Server/src/routes/pms-template.routes.ts:139-165`, `Server/src/services/pms-template.service.ts:420-460`.
- Configure sections, fields, section permissions, field permissions. Evidence: `Server/src/routes/pms-template.routes.ts:195-268`, `Server/src/services/pms-template.service.ts:575-641`.
- Resolve template for runtime role/workflow state. Evidence: `Server/src/routes/pms-template.routes.ts:270-284`, `Server/src/services/pms-template.service.ts:673-770`.
- Preview template. Evidence: `Server/src/routes/pms-template.routes.ts:287-299`, `Server/src/services/pms-template.service.ts:669-672`.
- Get template audit history. Evidence: `Server/src/routes/pms-template.routes.ts:125-137`, `Server/src/services/pms-template.service.ts:490-520`.

Current status: Implemented, but authorization is only authenticated at route level unless service-level checks apply.

### 6.3 Admin Cycle Management

Routes:

- `/admin/pms/cycles`
- `/admin/pms/cycles/new`
- `/admin/pms/cycles/[id]`
- `/admin/pms/cycles/[id]/edit`

Main frontend files:

- `Client/src/lib/components/pms/cycles/CycleList.svelte`
- `Client/src/lib/components/pms/cycles/CycleWizard.svelte`
- `Client/src/lib/components/pms/cycles/CycleDetailTabs.svelte`
- `Client/src/lib/components/pms/cycles/CycleReadinessPanel.svelte`
- `Client/src/lib/components/pms/cycles/LaunchCycleAssignmentsModal.svelte`
- `Client/src/lib/components/pms/cycles/CycleStatusBadge.svelte`

Current UI behavior:

- Cycle list supports filters/search and remote navigation query building. Evidence: `Client/src/lib/components/pms/cycles/CycleList.svelte:41-122`.
- Cycle list shows primary action per cycle and handles schedule, launch, close, archive with modals/reasons. Evidence: `Client/src/lib/components/pms/cycles/CycleList.svelte:156-319`, `Client/src/lib/components/pms/cycles/CycleList.svelte:408-533`, `Client/src/lib/components/pms/cycles/CycleList.svelte:647-693`.
- Cycle wizard has step validation, template version loading, SLA config, quarterly date generation, draft save, and save-and-launch. Evidence: `Client/src/lib/components/pms/cycles/CycleWizard.svelte:53-145`, `Client/src/lib/components/pms/cycles/CycleWizard.svelte:186-256`, `Client/src/lib/components/pms/cycles/CycleWizard.svelte:315-438`, `Client/src/lib/components/pms/cycles/CycleWizard.svelte:804-827`.
- Cycle detail tabs load assignments/history, show missed employees, open assignment 360, launch modal, sync progression, schedule, cancel. Evidence: `Client/src/lib/components/pms/cycles/CycleDetailTabs.svelte:32-75`, `Client/src/lib/components/pms/cycles/CycleDetailTabs.svelte:184-324`, `Client/src/lib/components/pms/cycles/CycleDetailTabs.svelte:375-438`, `Client/src/lib/components/pms/cycles/CycleDetailTabs.svelte:703-763`.
- Launch assignment modal supports employee search, selecting employees, default manager resolution, manager override, applicable quarter selection, bulk manager/quarter/reason application, validation, assign-only, and launch-with-assignments. Evidence: `Client/src/lib/components/pms/cycles/LaunchCycleAssignmentsModal.svelte:28-121`, `Client/src/lib/components/pms/cycles/LaunchCycleAssignmentsModal.svelte:129-331`, `Client/src/lib/components/pms/cycles/LaunchCycleAssignmentsModal.svelte:346-536`.

Backend behavior:

- List/create/get/history/update cycle. Evidence: `Server/src/routes/cycle.routes.ts:16-89`, `Server/src/services/cycle.service.ts:128-327`.
- Update windows, communication, appraisal window. Evidence: `Server/src/routes/cycle.routes.ts:91-157`, `Server/src/services/cycle.service.ts:470-501`.
- Lifecycle actions:
  - schedule -> `CycleService.scheduleCycle()`
  - launch -> `CycleService.launchCycle()`
  - close -> `CycleService.closeCycle()`
  - archive -> `CycleService.archiveCycle()`
  - cancel -> `CycleService.cancelCycle()`
  - sync progression -> `CycleService.syncCycleProgression()`
  Evidence: `Server/src/routes/cycle.routes.ts:158-237`, `Server/src/services/cycle.service.ts:501-569`.
- Validation covers cycle input, date ranges, appraisal window, quarter window sequence, window-within-quarter checks, template version checks. Evidence: `Server/src/services/cycle.service.ts:856-1157`.
- Transitions are enforced through `transitionAnnualCycle()` and workflow config. Evidence: `Server/src/services/cycle.service.ts:1227-1453`, `Server/src/constants/workflow.config.ts:119-161`.

Current status: Implemented.

### 6.4 Admin Assignment Workspace and Assignment 360

Routes:

- `/admin/pms/assignment-workspace`
- `/admin/pms/assignment-workspace/[annualAssignmentId]`
- `/admin/pms/assignments` (route exists, sidebar hidden)

Main frontend files:

- `Client/src/lib/components/pms/assignment-workspace/AssignmentWorkspace.svelte`
- `Client/src/lib/components/pms/assignment-workspace/Assignment360Detail.svelte`

Assignment workspace current UI:

- Loads cycles, assignments, audit history, employees/managers, and supports filters. Evidence: `Client/src/lib/components/pms/assignment-workspace/AssignmentWorkspace.svelte:106-115`, import list at `Client/src/lib/components/pms/assignment-workspace/AssignmentWorkspace.svelte:18-26`.
- Computes progress buckets such as objective pending/review pending/annual decision pending. Evidence: `Client/src/lib/components/pms/assignment-workspace/AssignmentWorkspace.svelte:59-74`.
- Formats audit actions into human-readable timeline entries. Evidence: `Client/src/lib/components/pms/assignment-workspace/AssignmentWorkspace.svelte:207-246`.
- Supports reassignment, close/reopen, exception review, and navigation to 360 detail. Evidence: `Client/src/lib/components/pms/assignment-workspace/AssignmentWorkspace.svelte` functions discovered by scan; exact behavior should be reviewed before UI copy changes.

Assignment 360 current UI:

- Loads one annual assignment detail and combines assignment, quarter reviews, annual decision summary, cycles, templates, delegations, managers, visibility. Evidence: `Client/src/lib/components/pms/assignment-workspace/Assignment360Detail.svelte:40-142`.
- Shows employee/manager/org snapshots and quarter progress. Evidence: `Client/src/lib/components/pms/assignment-workspace/Assignment360Detail.svelte:144-372`.
- Resolves available annual decision actions from backend actions or local fallback. Evidence: `Client/src/lib/components/pms/assignment-workspace/Assignment360Detail.svelte:377-390`.
- Supports annual decision draft/submit/freeze/update visibility/reopen/score override from inside assignment detail. Evidence: `Client/src/lib/components/pms/assignment-workspace/Assignment360Detail.svelte:469-545`.
- Supports manager reassignment and scoped delegation relevance. Evidence: `Client/src/lib/components/pms/assignment-workspace/Assignment360Detail.svelte:75-142`.

Backend assignment behavior:

- Manual assignment endpoint: `POST /pms/cycles/:id/assign` -> `AssignmentService.assignEmployee()`. Evidence: `Server/src/routes/assignment.routes.ts:17-31`, `Server/src/services/assignment.service.ts:243-345`.
- List assignments endpoint: `GET /pms/cycles/:id/assignments` -> `AssignmentService.listAssignments()`. Evidence: `Server/src/routes/assignment.routes.ts:34-48`, `Server/src/services/assignment.service.ts:112-242`.
- Bulk assignment endpoint: `POST /pms/cycles/:id/assignments/bulk` -> `AssignmentService.bulkAssign()`. Evidence: `Server/src/routes/assignment.routes.ts:51-65`, `Server/src/services/assignment.service.ts:345-428`.
- Get assignment: `GET /pms/cycles/:cycleId/assignments/:assignmentId` -> `AssignmentService.getAssignment()`. Evidence: `Server/src/routes/assignment.routes.ts:103-115`, `Server/src/services/assignment.service.ts:429-450`.
- Reassign manager: `POST /pms/cycles/:cycleId/assignments/:assignmentId/reassign` -> `AssignmentService.reassignManager()`. Evidence: `Server/src/routes/assignment.routes.ts:117-132`, `Server/src/services/assignment.service.ts:498-601`.
- Close/reopen/admin-reopen assignment. Evidence: `Server/src/routes/assignment.routes.ts:134-183`, `Server/src/services/assignment.service.ts:602-881`.
- Exception list/resolve. Evidence: `Server/src/routes/assignment.routes.ts:68-84`, `Server/src/routes/assignment.routes.ts:185-203`, `Server/src/services/assignment.service.ts:882-920`.
- Quarter assignment creation and template objective seeding are private service flows. Evidence: `Server/src/services/assignment.service.ts:921-1234`.
- Input validation includes employee/manager/template/applicable quarter checks and eligibility. Evidence: `Server/src/services/assignment.service.ts:1234-1369`.

Current status: Implemented, but UI and route discoverability are inconsistent because some assignment-related pages are sidebar-hidden.

### 6.5 Admin Reviews

- Route: `/admin/pms/reviews`.
- Component: `QuarterReviewWorkspace` in admin mode.
- API caller: `pmsQuarterReviewsApi.listAssignments("admin")`, detail/draft/submit/finalize/reopen methods. Evidence: `Client/src/lib/services/api/pmsQuarterReviews.ts:94-167`.
- Backend service: `QuarterReviewService.listAssignments(mode)`, `getAssignment`, `saveQuarterReviewDraft`, `submitQuarterReview`, `finalizeQuarterAssignment`, `reopenQuarterAssignment`. Evidence: `Server/src/services/quarterReview.service.ts:242-742`.
- Current status: Implemented route/API, exact admin-mode button visibility should be treated as code-defined in `QuarterReviewWorkspace.svelte`.

### 6.6 Admin Annual Decisions

- Route: `/admin/pms/decisions`.
- Component: `AnnualDecisionWorkspace`.
- List mode loads annual decision assignments from `/pms/annual-assignments`. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:300-329`, `Client/src/lib/services/api/pmsAnnualDecisions.ts:46-74`.
- Detail mode loads summary and resolves annual decision template. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:360-403`.
- Saves draft, submits, freezes, reopens, overrides score, and updates visibility. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:966-1038`, `Client/src/lib/services/api/pmsAnnualDecisions.ts:76-151`.
- Backend service methods are `listAssignments`, `getSummary`, `saveDecisionDraft`, `submitDecision`, `freezeDecision`, `reopenDecision`, `overrideFinalScore`, `updateVisibility`. Evidence: `Server/src/services/annualDecision.service.ts:160-943`.
- Current status: Implemented.

### 6.7 Admin Communications

- Route: `/admin/pms/communications`.
- Component: `CommunicationDispatchWorkspace`.
- UI loads annual decision assignments, opens detail, loads history, previews communication, sends communication, resends with correction reason. Evidence: `Client/src/lib/components/pms/communications/CommunicationDispatchWorkspace.svelte:80-227`.
- Backend routes: preview, send, resend, history. Evidence: `Server/src/routes/pmsCommunication.routes.ts:13-61`.
- Backend service: `PmsCommunicationService.previewCommunication()`, `sendCommunication()`, `resendCommunication()`, `getHistory()`. Evidence: `Server/src/services/pmsCommunication.service.ts:60-231`.
- Sending requires preview first in UI. Evidence: `Client/src/lib/components/pms/communications/CommunicationDispatchWorkspace.svelte:176-187`.
- Current status: Implemented, static-template/content behavior is service-defined and should be verified before changing communication copy.

### 6.8 Admin Audit

- Route: `/admin/pms/audit`.
- Component: `AuditHistoryWorkspace`.
- UI loads annual decision assignment list, opens assignment history, toggles logs, shows timeline/details. Evidence: `Client/src/lib/components/pms/audit/AuditHistoryWorkspace.svelte:62-125`, `Client/src/lib/components/pms/audit/AuditHistoryWorkspace.svelte:408-558`.
- API: `GET /pms/audit/:annualAssignmentId`. Evidence: `Client/src/lib/services/api/pmsAudit.ts:21-28`, `Server/src/routes/pmsAudit.routes.ts:11-24`.
- Backend service: `AuditService.getHistory()`. Evidence: `Server/src/services/audit.service.ts:84-253`.
- Current status: Implemented.

### 6.9 Admin SLA

- Route: `/admin/pms/sla`.
- Component: `SlaWorkspace`.
- UI supports list/search/pagination of SLA rules, create/edit/delete rule, open detail, create/edit/delete reminders, manual SLA engine trigger, user notification history lookup. Evidence: `Client/src/lib/components/pms/sla/SlaWorkspace.svelte:47-130`, `Client/src/lib/components/pms/sla/SlaWorkspace.svelte:185-345`, `Client/src/lib/components/pms/sla/SlaWorkspace.svelte:356-921`.
- Backend routes: `/rules`, `/reminders/:slaRuleId`, `/reminders`, `/trigger-check`, `/events/:id/extend`, `/history/:userId`. Evidence: `Server/src/routes/pmsSla.routes.ts:25-161`.
- Backend service: `SlaService.calculateDueDate`, `createSlaEvent`, `syncSlaEvents`, `processSlas`, `extendSla`. Evidence: `Server/src/services/sla.service.ts:29-411`.
- Current status: PARTIAL. Manual trigger exists; scheduler wiring is not proven.

### 6.10 Admin Delegation

- Route: `/admin/pms/delegation`.
- Component: `DelegationWorkspace`.
- UI supports status filter, search, pagination, create delegation, employee manager lookup, cycle selection, revoke with reason. Evidence: `Client/src/lib/components/pms/delegation/DelegationWorkspace.svelte:16-100`, `Client/src/lib/components/pms/delegation/DelegationWorkspace.svelte:123-305`, `Client/src/lib/components/pms/delegation/DelegationWorkspace.svelte:396-816`.
- Backend routes: create, list, revoke. Evidence: `Server/src/routes/delegation.routes.ts:11-50`.
- Backend service: `createDelegation`, `listDelegations`, `revokeDelegation`, `getActiveDelegation`, `getActiveDelegationsForDelegate`. Evidence: `Server/src/services/delegation.service.ts:28-296`.
- Current status: Implemented.

### 6.11 Admin Bulk Operations

- Route: `/admin/pms/bulk`.
- Component: `BulkOperationsWorkspace`.
- API client: `Client/src/lib/services/api/pmsBulkOperations.ts`.
- Supported operation families:
  - assignment preview/execute
  - reminder preview/execute
  - visibility preview/execute
  - communication preview/execute
  - close preview/execute
  - jobs list/detail
  Evidence: `Client/src/lib/services/api/pmsBulkOperations.ts:43-132`, `Server/src/routes/pmsBulkOperations.routes.ts:17-290`.
- Backend service uses preview methods and async execute methods with `setImmediate` for job processing. Evidence: `Server/src/services/pmsBulkOperations.service.ts:95-1414`.
- Bulk routes require hardcoded admin role. Evidence: `Server/src/routes/pmsBulkOperations.routes.ts:9-15`.
- Current status: Implemented for admin only; no route for retry exists despite service method `retryFailedBulkRecords()`. Evidence: `Server/src/services/pmsBulkOperations.service.ts:1414`; route inventory ends at job detail in `Server/src/routes/pmsBulkOperations.routes.ts:275-290`.

## 7. Template Builder Deep Truth

### 7.1 Builder Tabs / Areas

`TemplateBuilderWorkspace.svelte` exposes internal workspace nav values:

- `sections` / Form Design
- `scoring`
- `permissions`
- `workflow`
- preview-related state
- starter template catalog
- metadata/history/version controls through surrounding page/components

Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:148-380`.

### 7.2 Section Configuration

Section add/edit/delete behavior:

- `addSection()` creates a new section with generated id/key/title, default module/level/layout/scoring config, and no fields. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:394-419`.
- Section delete uses confirmation state `sectionPendingDelete`, `requestDeleteSection()`, `confirmDeleteSection()`, `deleteSection()`. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:755-780`.
- Section label/key updates slugify keys when needed. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:883-896`.
- Section quarter scope uses `toggleSectionQuarter()` and sets `quarterScope`, `quarters`, and `quarterAware`. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:941-949`.
- Section scoring config includes participatesInScoring, weightage, aggregation method, maxSectionScore. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:896-938`; backend schema `Server/src/models/pms-template-version.model.ts:437-456`.
- Section objective config is created/normalized by `createDefaultObjectiveConfig()` and `ensureObjectiveConfig()`. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:425-489`.

Backend stored section fields:

- `key`, `title`, `description`, `sectionType`, `level`, `applicableQuarters`, `repeatable`, `displayOrder`, `layout`, `renderingScope`, `quarterScope`, `sectionScoringConfig`, `objectiveConfig`, `objectiveBuckets`, `metadata`, `fields`, `permissions`. Evidence: `Server/src/models/pms-template-version.model.ts:406-468`.

### 7.3 Field Configuration

Field add/edit/delete/reorder behavior:

- Drag/drop field reorder is implemented with `handleFieldDragStart()` and `handleFieldReorderDrop()`. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:102-147`.
- `addField()` creates new fields with id/key/label/type/order/visibility/editability defaults. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:653-722`.
- Rating scale fields receive default options; select/multiselect/radio/checkbox groups receive default options; matrix/data grid initialize specialized configs. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:693-710`, `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:1056-1057`.
- Field delete uses confirmation state `fieldPendingDelete`, `requestDeleteField()`, `confirmDeleteField()`, `deleteField()`. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:722-755`.
- Field label/key/type updates are handled by `updateFieldLabel()`, `updateFieldKey()`, `updateFieldType()`. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:982-1061`.
- Field metadata can store paper layout/system field details. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:1001-1036`.

Backend stored field fields:

- `key`, `label`, `type`, `fieldCategory`, `semanticRole`, `isRequired`, `displayOrder`, `placeholder`, `helpText`, `hideLabel`, `options`, `colSpan`, `behaviors`, `conditionalRendering`, `validationRules`, `scoringConfig`, `matrixConfig`, `gridConfig`, `metadata`, permissions. Evidence: `Server/src/models/pms-template-version.model.ts:250-379`.

### 7.4 Supported Field Types

Backend field enum:

- Short/long text, static text, section divider, numeric, dropdown, radio, checkbox, checkbox group, multiselect, date, date range, rating scale, weighted score, currency, percentage, attachment, rich text, formula, comment box, boolean, signature, matrix, data grid.
- Evidence: `Server/src/constants/pms.enums.ts:142-170`.

Frontend field type mapping:

- Backend -> frontend mapping: `mapFieldType()`. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:977-1017`.
- Frontend -> backend mapping: `mapFrontendFieldType()`. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:1407-1439`.

### 7.5 Objective Config in Templates

Template objectives support:

- objective mode: `PREDEFINED`, `DYNAMIC`, `HYBRID`
- `allowEmployeeCreated`
- `allowManagerCreated`
- predefined objectives with `objectiveKey`, title, description, KPI, target, dueDate, weightage, success criteria, attachmentAllowed, quarter scoping, editable, active flag
- objective buckets for template predefined, employee dynamic, manager dynamic

Evidence: backend schema `Server/src/models/pms-template-version.model.ts:164-198`, `Server/src/models/pms-template-version.model.ts:379-406`; frontend mapper `Client/src/lib/services/api/pmsTemplates.ts:424-584`; builder UI functions `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:489-653`.

Assignment service consumes this config when seeding predefined objectives. Evidence: `Server/src/services/assignment.service.ts:1125-1234`.

Objective service consumes this config when listing assignments and validating create/edit access. Evidence: `Server/src/services/objective.service.ts:1117-1266`, `Server/src/services/objective.service.ts:1679-1726`.

### 7.6 Scoring Configuration

Scoring support:

- Section scoring: participates, weightage, aggregation method (`WEIGHTED_AVERAGE`, `SIMPLE_AVERAGE`, `SUM`, `MAX_FIELD`), maxSectionScore. Evidence: `Server/src/models/pms-template-version.model.ts:437-456`.
- Field scoring: participatesInScoring, score type, max score, weight, option scores, formula, fixed score, scoring policy, conditional scoring. Evidence: frontend builder `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:1065-1099`; frontend API client `Client/src/lib/services/api/pmsTemplates.ts:644-664`; backend model `Server/src/models/pms-template-version.model.ts:328-379`.
- Backend review scoring is implemented in `QuarterReviewService.calculateSectionScores()` and `calculateOverallScore()`. Evidence: `Server/src/services/quarterReview.service.ts:1678-2001`.
- Shared scoring service also exists: `PmsScoringService.getOptionScore()`, `evaluateFormulaExpression()`, `calculateSectionScores()`, `calculateOverallScore()`, `calculateAnnualRollup()`. Evidence: `Server/src/services/pms-scoring.service.ts:58-561`.
- Annual scoring config is stored on template version and accepted by section config route. Evidence: `Server/src/routes/pms-template.routes.ts:195-208`, `Server/src/models/pms-template-version.model.ts:486-487`.

### 7.7 Permissions, Visibility, Editability, Workflow Rules

Template behavior rules:

- Field `behaviors` include role, workflow state, visibility (`VISIBLE`/`HIDDEN`), editability (`EDITABLE`/`READ_ONLY`), mandatory. Evidence: `Server/src/models/pms-template-version.model.ts:279-294`.
- Conditional rendering supports dependencies and operators/actions. Evidence: `Server/src/models/pms-template-version.model.ts:294-316`; frontend types `Client/src/lib/types/pmsTemplate.ts:14-24`.
- Resolver filters sections/fields by scope and rules. Evidence: `Server/src/services/pms-template.service.ts:673-770`, private helpers `isSectionInScope`, `isFieldVisible`, `resolveVisibleFieldKeys`, `isVisibleByRules`, `isFieldEditable`, `findBehavior`, `evaluateCondition` in `Server/src/services/pms-template.service.ts:1139-1363`.
- Frontend computes visibility issue count and workflow rule count in builder. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:329-345`.
- Section/field permission API endpoints exist separately. Evidence: `Server/src/routes/pms-template.routes.ts:233-268`, `Server/src/services/pms-template.service.ts:619-641`.

### 7.8 Preview, Runtime Resolve, Simulator

- Preview endpoint returns the version; resolver returns role/workflow filtered runtime sections/fields. Evidence: `Server/src/routes/pms-template.routes.ts:270-299`, `Server/src/services/pms-template.service.ts:669-770`.
- Simulator route validates requested role against `EMPLOYEE`, `MANAGER`, `ADMIN`, `MANAGEMENT`, `DIRECTOR`, loads template/version, and renders simulator workspace. Evidence: `Client/src/routes/admin/pms/templates/[templateId]/versions/[versionId]/simulator/+page.ts:8-59`.
- Objective and annual decision workspaces call `pmsTemplatesApi.resolveTemplateVersion()` to render dynamic fields for runtime. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:378-403`, `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:2106-2529`.

### 7.9 Autosave, Draft Save, Lock Behavior

- Template builder has local `autoSaveTimeout`; `touchSections()` saves after a timeout by calling `saveCurrentVersion(true)`. It skips if locked or if any section has zero fields. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:780-790`.
- Applying a starter template prompts before replacing sections, saves immediately, and reverts on failure. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:794-825`.
- Editing functions guard `isLocked` throughout builder. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:102-103`, `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:394-395`, `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:662-663`.
- Backend active versions are lock-aware via `isLocked` field. Evidence: `Server/src/models/pms-template-version.model.ts:490-494`.
- Frontend API validates version editable before mutating local mock/cache behavior. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:897-904`.

### 7.10 Activation Validation

Frontend validation before activation:

- `collectTemplateValidationErrors()` checks at least one section, objective config, scoring totals, section/field titles/keys, empty sections, quarter sections, scoring field config, behavior rules, conditional dependencies. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:664-752`.

Backend validation:

- `validateSections()` and helper methods validate sections, objective config, option score config, conditional cycles, unique keys, approved workflow states. Evidence: `Server/src/services/pms-template.service.ts:1470-2153`.

Current status: Implemented on both frontend client mapping layer and backend service layer.

## 8. Cycle Management Deep Truth

### 8.1 Cycle Data Stored

Annual cycle stores:

- `name`, `code`, `appraisalYear`, `startDate`, `endDate`, `status`, `templateVersionId`, `quarterCycleIds`, `appraisalWindowConfig`, `communicationRuleConfig`, `assignmentTemplateSuggestionConfig`, soft-delete/audit/version/timestamps. Evidence: `Server/src/models/pms-annual-cycle.model.ts:51-107`.

Quarter cycle stores:

- annualCycleId, quarterCode, dates, objectiveSetting/objectiveApproval/managerReview/quarterFinalization windows, SLA config, closureRules, status, soft-delete/audit/version/timestamps. Evidence: `Server/src/models/pms-quarter-cycle.model.ts:38-81`.

### 8.2 Cycle API Flow

| Action | UI/API caller | Backend endpoint | Service method | Status impact | Audit |
|---|---|---|---|---|---|
| List cycles | `pmsCyclesApi.listCycles()` | `GET /pms/cycles` | `CycleService.listCycles()` | None | No direct mutation |
| Create draft cycle | `CycleWizard.saveDraft()` -> `pmsCyclesApi.createCycle()` | `POST /pms/cycles` | `CycleService.createCycle()` | Creates `DRAFT` cycle unless input sets otherwise | Service audit expected; verify exact audit action in service |
| Get detail | route load/detail tabs | `GET /pms/cycles/:id` | `CycleService.getCycleDetail()` | None | None |
| Get history | `CycleDetailTabs.loadCycleHistory()` | `GET /pms/cycles/:id/history` | `CycleService.getCycleAuditHistory()` | None | Reads audit |
| Update cycle | edit wizard | `PUT /pms/cycles/:id` | `CycleService.updateCycle()` | Depends payload/status | Audit expected |
| Update windows | cycle detail/edit | `PATCH /pms/cycles/:id/windows` | `CycleService.updateWindows()` | Updates quarter windows | Audit expected |
| Update communication | cycle detail/edit | `PATCH /pms/cycles/:id/communication` | `CycleService.updateCommunication()` | Stores communication config | Audit expected |
| Update appraisal window | cycle detail/edit | `PATCH /pms/cycles/:id/appraisal-window` | `CycleService.updateAppraisalWindow()` | Stores annual appraisal window config | Audit expected |
| Schedule | cycle list/detail | `POST /pms/cycles/:id/schedule` | `CycleService.scheduleCycle()` | `DRAFT -> SCHEDULED` | Audit expected |
| Launch | cycle list/wizard/detail | `POST /pms/cycles/:id/launch` | `CycleService.launchCycle()` | `SCHEDULED -> ACTIVE` or valid service transition | Audit expected |
| Close | cycle list/detail | `POST /pms/cycles/:id/close` | `CycleService.closeCycle()` | To `CLOSED` when allowed | Audit expected |
| Archive | cycle list/detail | `POST /pms/cycles/:id/archive` | `CycleService.archiveCycle()` | `CLOSED -> ARCHIVED` | Audit expected |
| Cancel | cycle detail | `POST /pms/cycles/:id/cancel` | `CycleService.cancelCycle()` | To `CANCELLED` when allowed | Audit expected |
| Sync progression | cycle detail | `POST /pms/cycles/:id/sync-progression` | `CycleService.syncCycleProgression()` | May update annual state based on quarter completion/window | Audit/status event expected |

Endpoint evidence: `Server/src/routes/cycle.routes.ts:16-237`. Service evidence: `Server/src/services/cycle.service.ts:128-569`.

### 8.3 Cycle Validation

Backend validation includes:

- required dates and valid date ranges
- template version required/active
- quarter windows present and within quarter
- window sequencing
- appraisal window after quarter finalization
- appraisal window supports fixed range or relative offset

Evidence: `Server/src/services/cycle.service.ts:856-1157`.

Frontend validation includes:

- template linked
- all quarters present
- windows valid
- readiness items for launch

Evidence: `Client/src/lib/utils/pmsCycleValidation.ts:1-198`, `Client/src/lib/components/pms/cycles/CycleWizard.svelte:53-145`.

### 8.4 Cycle UI States

- List loading/empty states exist. Evidence: `Client/src/lib/components/pms/cycles/CycleList.svelte:460-473`.
- Detail assignment tab loading/empty states exist. Evidence: `Client/src/lib/components/pms/cycles/CycleDetailTabs.svelte:703-722`.
- Wizard setup load failure state exists. Evidence: `Client/src/lib/components/pms/cycles/CycleWizard.svelte:489-491`.
- Launch modal empty search state exists. Evidence: `Client/src/lib/components/pms/cycles/LaunchCycleAssignmentsModal.svelte:634-640`.

## 9. Assignment Management Deep Truth

### 9.1 Manual Assignment Inputs

Frontend assignment payload includes:

- `employeeId`
- optional `managerId`
- optional `templateVersionId`
- optional `applicableQuarters`
- optional `assignmentReason`

Evidence: `Client/src/lib/services/api/pmsAssignments.ts:84-90`, `Client/src/lib/services/api/pmsCycles.ts:81-87`.

Backend assignment input validation exists in `AssignmentService.validateAssignmentInput()`. Evidence: `Server/src/services/assignment.service.ts:1234-1296`.

### 9.2 Assignment Creation Output

Assignment service creates:

- `AnnualAssignment`
- one or more `QuarterAssignment` records based on applicable quarters
- template objective records for predefined objectives when template config has them
- exception records for failed/ineligible rows in bulk flows

Evidence: `Server/src/services/assignment.service.ts:243-345`, `Server/src/services/assignment.service.ts:921-1234`, `Server/src/services/assignment.service.ts:1369-1485`.

### 9.3 Employee-Manager Mapping

- Launch modal attempts default manager resolution from employee data and manager options. Evidence: `Client/src/lib/components/pms/cycles/LaunchCycleAssignmentsModal.svelte:227-289`.
- Manager selection can be overridden per row and bulk-applied. Evidence: `Client/src/lib/components/pms/cycles/LaunchCycleAssignmentsModal.svelte:388-453`.
- Assignment stores `assignedManagerId` and manager snapshot. Evidence: `Server/src/models/pms-annual-assignment.model.ts:68-110`, `Server/src/models/pms-quarter-assignment.model.ts:52-58`.

### 9.4 Applicable Quarters

- Frontend payload uses `Q1`-`Q4` array. Evidence: `Client/src/lib/services/api/pmsAssignments.ts:88`.
- Launch modal lets user toggle quarters per employee and apply bulk quarters. Evidence: `Client/src/lib/components/pms/cycles/LaunchCycleAssignmentsModal.svelte:415-431`.
- Backend normalizes applicable quarters and creates matching quarter assignments. Evidence: `Server/src/services/assignment.service.ts:1296-1369`, `Server/src/services/assignment.service.ts:921-1125`.
- `AnnualAssignment.applicableQuarters` defaults to all four quarters. Evidence: `Server/src/models/pms-annual-assignment.model.ts:103-105`.

### 9.5 Reassignment

- Reassignment endpoint: `POST /pms/cycles/:cycleId/assignments/:assignmentId/reassign`. Evidence: `Server/src/routes/assignment.routes.ts:117-132`.
- Service method: `AssignmentService.reassignManager()`. Evidence: `Server/src/services/assignment.service.ts:498-601`.
- Reassignment model stores from/to manager, effectiveFrom, appliesTo, reason, approvedBy/At. Evidence: `Server/src/models/pms-reassignment.model.ts:22-86`.
- Assignment 360 UI has reassignment modal state and manager candidates. Evidence: `Client/src/lib/components/pms/assignment-workspace/Assignment360Detail.svelte:75-142`.

### 9.6 Exception Queue

- Assignment exceptions are listed by cycle and status. Evidence: `Server/src/routes/assignment.routes.ts:68-84`, `Server/src/services/assignment.service.ts:882-896`.
- Exceptions can be resolved. Evidence: `Server/src/routes/assignment.routes.ts:185-203`, `Server/src/services/assignment.service.ts:897-920`.
- Exception model stores cycleId, employeeId, exceptionType, status, message, resolution, metadata. Evidence: `Server/src/models/pms-assignment-exception-queue.model.ts:21-73`.

## 10. Objective Management Deep Truth

### 10.1 Routes and Modes

Frontend modes:

- `employee`
- `manager`

Evidence: `Client/src/lib/services/api/pmsObjectives.ts:19`.

Backend route:

- `GET /pms/objectives/assignments?mode=employee|manager`

Evidence: `Server/src/routes/objective.routes.ts:31-43`.

Service:

- `ObjectiveService.listAssignments(mode)`.

Evidence: `Server/src/services/objective.service.ts:220-373`.

### 10.2 Objective Draft Save

Frontend:

- `pmsObjectivesApi.saveDraft(assignment, draft)` maps draft to backend payload.
- New objective -> `POST /pms/objectives`.
- Existing objective -> `PUT /pms/objectives/:id`.

Evidence: `Client/src/lib/services/api/pmsObjectives.ts:89-147`.

Backend:

- `ObjectiveService.createObjective()` and `updateObjective()`.

Evidence: `Server/src/services/objective.service.ts:401-630`.

Draft payload includes:

- `quarterAssignmentId`
- title, description, targetMetric, targetValue, targetDate, weightage, successCriteria
- attachments metadata
- objectiveValues

Evidence: `Client/src/lib/services/api/pmsObjectives.ts:89-111`.

### 10.3 Objective Submit / Approve / Return

| Action | Endpoint | Frontend caller | Backend service | Status impact |
|---|---|---|---|---|
| Submit objective | `POST /pms/objectives/:id/submit` | `pmsObjectivesApi.submitObjective()` | `ObjectiveService.submitObjective()` | Moves toward `OBJECTIVE_SUBMITTED`. |
| Approve objective | `POST /pms/objectives/:id/approve` | `pmsObjectivesApi.approveObjective()` | `ObjectiveService.approveObjective()` | Moves toward `OBJECTIVE_APPROVED`. |
| Return objective | `POST /pms/objectives/:id/return` | `pmsObjectivesApi.returnObjective()` | `ObjectiveService.returnObjective()` | Moves toward `OBJECTIVE_REVISION_REQUIRED`, requires reason. |
| Add comment | `POST /pms/objectives/:id/comments` | `pmsObjectivesApi.addComment()` | `ObjectiveService.addComment()` | Adds comment only. |
| Correction | `POST /pms/objectives/:id/correction` | API exists on backend; frontend caller not found in pmsObjectivesApi | `ObjectiveService.correctObjective()` | Corrects objective with correction layer/audit behavior. |

Evidence: `Client/src/lib/services/api/pmsObjectives.ts:149-196`, `Server/src/routes/objective.routes.ts:76-138`, `Server/src/services/objective.service.ts:631-829`.

### 10.4 Objective Validation

Frontend:

- Submit checks required custom template fields and profile/system fields. Evidence: `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:983-1009`.
- Return and comment require non-empty text at API client/UI layer. Evidence: `Client/src/lib/services/api/pmsObjectives.ts:169-185`, `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:1044-1082`.
- Draft save is flexible; UI text says full validation happens on submit. Evidence: `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:1546-1559`.

Backend:

- Validates objective input and submit readiness. Evidence: `Server/src/services/objective.service.ts:1468-1489`.
- Validates create against template objective config. Evidence: `Server/src/services/objective.service.ts:1679-1726`.
- Enforces regular objective edit access. Evidence: `Server/src/services/objective.service.ts:1726-1949`.

### 10.5 Attachments Metadata

- Draft form stores selected files as metadata with generated ids, names, sizes, URLs if present. Evidence: `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:1082-1113`.
- API sends `fileName`, `fileType`, `fileSize`, `fileUrl`, `uploadedAt`, `uploadedByRole`. Evidence: `Client/src/lib/services/api/pmsObjectives.ts:102-109`.
- Backend objective model embeds attachments and separate objective attachment model also exists. Evidence: `Server/src/models/pms-objective.model.ts:54-65`, `Server/src/models/pms-objective-attachment.model.ts:22-50`.
- `NOT IMPLEMENTED`: PMS-specific upload/delete/replace API not found.

### 10.6 Template-Driven Objective Fields

- Objective workspace renders resolved template sections/fields when available. Evidence: `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:2106-2529`.
- Supported runtime inputs include textarea/rich text, select, checkbox, radio, checkbox group/multiselect, signature, number/date/currency/percentage/rating/formula-style inputs, static text/divider. Evidence: `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:2263-2529`.
- Backend dynamic values are persisted in `ObjectiveValue`. Evidence: `Server/src/models/pms-objective-value.model.ts:29-95`.

## 11. Manager Review Deep Truth

### 11.1 Review Assignment List

- API: `GET /pms/quarter-reviews/assignments?mode=manager|employee|admin`.
- Frontend caller: `pmsQuarterReviewsApi.listAssignments(mode)`.
- Backend service: `QuarterReviewService.listAssignments(mode)`.

Evidence: `Client/src/lib/services/api/pmsQuarterReviews.ts:94-107`, `Server/src/routes/quarterReview.routes.ts:15-27`, `Server/src/services/quarterReview.service.ts:242-429`.

### 11.2 Review Form Data

Review draft payload includes:

- ratings array: objectiveId, rating, comments
- comments
- score
- overallRating
- recommendation
- achievements
- developmentObservations
- attachment metadata
- reviewValues dynamic template values

Evidence: `Client/src/lib/services/api/pmsQuarterReviews.ts:21-31`, `Client/src/lib/services/api/pmsQuarterReviews.ts:58-91`.

Backend models:

- `QuarterReview.ratings[]`, comments, score, overallRating, recommendation, achievements, development observations, attachments.
- `QuarterReviewValue[]` for dynamic fields.

Evidence: `Server/src/models/pms-quarter-review.model.ts:49-142`, `Server/src/models/pms-quarter-review-value.model.ts:29-96`.

### 11.3 Draft, Submit, Finalize, Reopen

| Action | Endpoint | Frontend caller | Backend service | Status |
|---|---|---|---|---|
| Save draft | `POST /pms/quarter-reviews/:id/draft` | `pmsQuarterReviewsApi.saveDraft()` | `saveQuarterReviewDraft()` | Review remains/open draft state. |
| Submit review | `POST /pms/quarter-reviews/:id/submit` | `pmsQuarterReviewsApi.submitReview()` | `submitQuarterReview()` | Review submitted; quarter assignment should move to manager submitted. |
| Finalize | `POST /pms/quarter-reviews/:id/finalize` | `pmsQuarterReviewsApi.finalizeReview()` | `finalizeQuarterAssignment()` | Quarter finalized; score snapshot/summary expected. |
| Reopen | `POST /pms/quarter-reviews/:id/reopen` | `pmsQuarterReviewsApi.reopenReview()` | `reopenQuarterAssignment()` | Reopens quarter; reason required by frontend API. |

Evidence: `Client/src/lib/services/api/pmsQuarterReviews.ts:124-167`, `Server/src/routes/quarterReview.routes.ts:43-107`, `Server/src/services/quarterReview.service.ts:437-742`.

### 11.4 Scoring and Validation

- Template review values are validated against template. Evidence: `Server/src/services/quarterReview.service.ts:1092-1136`.
- Draft and submit input validation are separate. Evidence: `Server/src/services/quarterReview.service.ts:1136-1194`.
- Objective ratings may be required depending review config. Evidence: `Server/src/services/quarterReview.service.ts:1194-1238`.
- Ratings are validated against objectives and template rating fields. Evidence: `Server/src/services/quarterReview.service.ts:1238-1315`.
- Formula expressions and computed values are supported. Evidence: `Server/src/services/quarterReview.service.ts:1451-1603`.
- Option, matrix, section, and overall score calculations exist. Evidence: `Server/src/services/quarterReview.service.ts:1603-2001`.

Current status: Implemented.

## 12. Annual Decision Deep Truth

### 12.1 Annual Decision UI

`AnnualDecisionWorkspace`:

- list mode loads assignments with search/cycle filters and pagination. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:117-244`, `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:300-329`.
- detail mode loads summary, resolves template, hydrates draft and visibility forms. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:360-467`.
- template fields are mapped into config and rendered with editable flags. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:487-517`.
- builds template resolve values from current draft to support dynamic visibility/conditions. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:521-591`.
- handles employee profile/system fields in annual decision form. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:594-644`.
- supports custom decision values including structured/date range/signature values. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:648-935`.

### 12.2 Annual Decision Backend

Routes:

- `GET /pms/annual-assignments`
- `GET /pms/annual-assignments/:id/summary`
- `PUT /pms/annual-assignments/:id/decision/draft`
- `POST /pms/annual-assignments/:id/decision/submit`
- `POST /pms/annual-assignments/:id/decision/final-score/override`
- `POST /pms/annual-assignments/:id/decision/freeze`
- `POST /pms/annual-assignments/:id/decision/reopen`
- `POST /pms/annual-assignments/:id/visibility`

Evidence: `Server/src/routes/annualDecision.routes.ts:16-145`.

Service methods:

- `listAssignments`
- `getSummary`
- `saveDecisionDraft`
- `submitDecision`
- `freezeDecision`
- `reopenDecision`
- `overrideFinalScore`
- `updateVisibility`

Evidence: `Server/src/services/annualDecision.service.ts:160-943`.

### 12.3 Draft/Submit/Freeze/Reopen/Override

- Draft payload includes final score/rating, grade/merit/nil details, management remarks, decision values. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:935-962`, `Client/src/lib/services/api/pmsAnnualDecisions.ts:76-96`.
- Submit and freeze require no unsaved final-score override in UI. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:988-1017`.
- Freeze endpoint moves decision to frozen state in service. Evidence: `Server/src/routes/annualDecision.routes.ts:93-105`, `Server/src/services/annualDecision.service.ts:528-576`.
- Reopen requires reason from UI/API. Evidence: `Client/src/lib/services/api/pmsAnnualDecisions.ts:119-127`, `Server/src/services/annualDecision.service.ts:577-755`.
- Score override requires overrideScore and reason. Evidence: `Client/src/lib/services/api/pmsAnnualDecisions.ts:129-141`, `Server/src/services/annualDecision.service.ts:756-835`.

### 12.4 Visibility and Masking

- Visibility update payload supports employeeReviewVisible, employeeGradeVisible, employeeMeritVisible, managerGradeVisible, managerMeritVisible, visibleFrom, reason. Evidence: `Client/src/lib/services/api/pmsAnnualDecisions.ts:24-32`.
- Backend updates visibility through `AnnualDecisionService.updateVisibility()`. Evidence: `Server/src/services/annualDecision.service.ts:836-943`.
- Masking helpers exist: `maskDecision`, `maskCorrectionHistory`, `getHistoryVisibilityPermissions`, `maskHistoryValue`, `getEffectiveVisibilityFlags`. Evidence: `Server/src/services/annualDecision.service.ts:1749-2077`.
- Visibility fields are also cached on `AnnualAssignment.visibility`. Evidence: `Server/src/models/pms-annual-assignment.model.ts:45-57`, `Server/src/models/pms-annual-assignment.model.ts:107`.

### 12.5 Communication Readiness

- Annual assignment has `communicationStatus`. Evidence: `Server/src/models/pms-annual-assignment.model.ts:111`.
- Workflow config moves annual state `VISIBILITY_ENABLED -> COMMUNICATION_READY -> COMMUNICATION_SENT -> CLOSED`. Evidence: `Server/src/constants/workflow.config.ts:146-157`.
- Communication dispatch service previews/sends based on annual assignment and visibility. Evidence: `Server/src/services/pmsCommunication.service.ts:60-206`.
- `NEEDS VERIFICATION`: exact automatic transition from visibility update to communication ready must be verified in `AnnualDecisionService.updateVisibility()`/communication service before claiming full automation.

## 13. Dashboard, Communication, SLA, Delegation, Audit Truth

### 13.1 Dashboard

Dashboard APIs:

- `GET /pms/dashboard/employee`
- `GET /pms/dashboard/manager`
- `GET /pms/dashboard/admin`
- `GET /pms/dashboard/management`

Evidence: `Server/src/routes/pmsDashboard.routes.ts:11-115`, frontend caller `Client/src/lib/services/api/pmsDashboard.ts:11-29`.

Services:

- `getEmployeeDashboard(employeeId, cycleId?)`
- `getManagerDashboard(managerId, cycleId?)`
- `getAdminDashboard(cycleId?)`
- `getManagementDashboard(cycleId?)`

Evidence: `Server/src/services/pmsDashboard.service.ts:24-407`.

### 13.2 Communication

Communication API inventory:

- `POST /pms/communications/preview`
- `POST /pms/communications/send`
- `POST /pms/communications/:id/resend`
- `GET /pms/communications/history/:annualAssignmentId`

Evidence: `Server/src/routes/pmsCommunication.routes.ts:13-61`, `Client/src/lib/services/api/pmsCommunication.ts:16-39`.

Service behavior:

- `previewCommunication()` renders subject/body/hash but does not send.
- `sendCommunication()` dispatches and persists dispatch record.
- `resendCommunication()` requires correction reason/current dispatch context.
- `getHistory()` reads previous dispatches.

Evidence: `Server/src/services/pmsCommunication.service.ts:60-231`.

### 13.3 SLA

SLA API inventory:

- rule CRUD: `/pms/sla/rules`
- reminder CRUD: `/pms/sla/reminders`
- manual processing: `/pms/sla/trigger-check`
- extend event: `/pms/sla/events/:id/extend`
- notification history: `/pms/sla/history/:userId`

Evidence: `Server/src/routes/pmsSla.routes.ts:25-161`, `Client/src/lib/services/api/pmsSla.ts:46-99`.

Service behavior:

- Calculates due dates.
- Creates SLA events.
- Syncs SLA events.
- Processes SLAs and notifications.
- Extends SLA events.

Evidence: `Server/src/services/sla.service.ts:29-477`.

Current status: PARTIAL because scheduler wiring is not proven.

### 13.4 Delegation

Delegation API inventory:

- `POST /pms/delegations`
- `GET /pms/delegations`
- `POST /pms/delegations/:id/revoke`

Evidence: `Server/src/routes/delegation.routes.ts:11-50`, `Client/src/lib/services/api/pmsDelegation.ts:41-72`.

Delegation service also supports active delegation lookup for a delegator/delegate scope. Evidence: `Server/src/services/delegation.service.ts:262-296`.

### 13.5 Audit

Audit APIs:

- `GET /pms/audit/:annualAssignmentId`
- template-specific audit: `GET /pms/templates/:id/audit`
- cycle-specific audit: `GET /pms/cycles/:id/history`

Evidence: `Server/src/routes/pmsAudit.routes.ts:11-24`, `Server/src/routes/pms-template.routes.ts:125-137`, `Server/src/routes/cycle.routes.ts:60-72`.

Audit service:

- `createAuditLog()`
- `getHistory()`
- `getEntityHistory()`

Evidence: `Server/src/services/audit.service.ts:32-269`.

## 14. Form Rendering Engine Truth

No single standalone PMS form-renderer service/component was found. Rendering is embedded in workspace components:

- Objective runtime form: `ObjectiveWorkspace.svelte`.
- Annual decision runtime form: `AnnualDecisionWorkspace.svelte`.
- Template preview/simulator workspaces.
- Quarter review workspace for manager review fields.

Implemented runtime rendering behavior:

- Template resolver filters fields before runtime rendering. Evidence: `Server/src/services/pms-template.service.ts:673-770`.
- Objective workspace renders resolved sections and fields and handles editability/read-only conditions. Evidence: `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:2106-2529`.
- Annual decision workspace resolves template and renders custom decision values. Evidence: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:378-935`.
- Quarter review API supports `reviewValues`, and backend validates those against template. Evidence: `Client/src/lib/services/api/pmsQuarterReviews.ts:79-90`, `Server/src/services/quarterReview.service.ts:1092-1136`.

Current status: Implemented but distributed, not centralized.

## 15. Status and Workflow Truth

### 15.1 Quarter Transitions

From `Server/src/constants/workflow.config.ts`:

| Current | Allowed next |
|---|---|
| `NOT_STARTED` | `OBJECTIVE_SETTING_OPEN` |
| `OBJECTIVE_SETTING_OPEN` | `OBJECTIVE_DRAFT`, `OBJECTIVE_SUBMITTED`, `OBJECTIVE_APPROVED`, admin close |
| `OBJECTIVE_DRAFT` | `OBJECTIVE_SUBMITTED`, admin close |
| `OBJECTIVE_SUBMITTED` | `OBJECTIVE_APPROVED`, `OBJECTIVE_REVISION_REQUIRED`, admin close |
| `OBJECTIVE_REVISION_REQUIRED` | `OBJECTIVE_SUBMITTED`, admin close |
| `OBJECTIVE_APPROVED` | `MANAGER_REVIEW_OPEN`, admin close |
| `MANAGER_REVIEW_OPEN` | `MANAGER_REVIEW_SUBMITTED`, admin close |
| `MANAGER_REVIEW_SUBMITTED` | `QUARTER_FINALIZED`, admin close |
| `QUARTER_FINALIZED` | `REOPENED_BY_ADMIN` |
| `REOPENED_BY_ADMIN` | `QUARTER_FINALIZED`, admin close |
| `CLOSED_BY_ADMIN` | none |

Evidence: `Server/src/constants/workflow.config.ts:1-117`.

### 15.2 Annual Transitions

From `Server/src/constants/workflow.config.ts`:

| Current | Allowed next |
|---|---|
| `DRAFT` | `SCHEDULED`, `CANCELLED` |
| `SCHEDULED` | `ACTIVE`, `CANCELLED` |
| `ACTIVE` | `IN_PROGRESS`, `CANCELLED` |
| `IN_PROGRESS` | `ALL_QUARTERS_FINALIZED`, `CANCELLED` |
| `ALL_QUARTERS_FINALIZED` | `APPRAISAL_WINDOW_OPEN` |
| `APPRAISAL_WINDOW_OPEN` | `MANAGEMENT_DECISION_DRAFT` |
| `MANAGEMENT_DECISION_DRAFT` | `MANAGEMENT_DECISION_SUBMITTED` |
| `MANAGEMENT_DECISION_SUBMITTED` | `ANNUAL_FINALIZED` |
| `ANNUAL_FINALIZED` | `VISIBILITY_ENABLED`, `APPRAISAL_WINDOW_OPEN` |
| `VISIBILITY_ENABLED` | `COMMUNICATION_READY` |
| `COMMUNICATION_READY` | `COMMUNICATION_SENT` |
| `COMMUNICATION_SENT` | `CLOSED` |
| `CLOSED` | `ARCHIVED` |
| `ARCHIVED` | none |
| `CANCELLED` | none |

Evidence: `Server/src/constants/workflow.config.ts:119-161`.

### 15.3 Workflow Service

- Validates entity type.
- Validates known current and next states.
- Requires reason for annual `CANCELLED` and `APPRAISAL_WINDOW_OPEN`, and quarter `REOPENED_BY_ADMIN`/`CLOSED_BY_ADMIN`.
- Rejects transitions not in transition map.

Evidence: `Server/src/services/workflow.service.ts:27-159`.

### 15.4 Status Usage Locations

| Status family | Defined in | Used in |
|---|---|---|
| Quarter workflow | backend constants, frontend type array | QuarterAssignment model, workflow service/config, objective/review services, UI badges. |
| Annual workflow | backend constants, frontend type array | AnnualCycle, AnnualAssignment, workflow service/config, cycle/decision services, dashboard. |
| Objective status | backend constants, frontend type | Objective model/service, objective workspace. |
| Review status | backend constants | QuarterReview model/service. |
| Annual decision status | backend constants, frontend type | AnnualAssignment.finalDecisionStatus, AnnualDecision model/service, decision UI. |
| Template status | backend constants, frontend title-case type | Template/template-version models, template API mapper, builder UI. |
| Bulk job status | model/service strings | Bulk operations service/UI. Needs exact enum verification from model/service. |
| Delegation status | model/client types | Delegation model/service/UI. |
| SLA event status | model/service strings | SLA service/UI. |

Evidence: constants and model files listed in Sections 3 and 5.

## 16. API Inventory

Legend:

- Permission check names what is visible at route level.
- Audit behavior is marked `Service/Audit expected` where a mutating PMS service commonly writes audit but exact line-by-line audit call was not fully enumerated in this document.

### 16.1 Template APIs

| Method | Endpoint | Frontend caller | Backend service | Payload | Response | Permission | Status change | Audit | Current status |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/pms/templates` | `pmsTemplatesApi` list methods | `listTemplates` | query | templates/meta | authenticate | none | none | Implemented |
| POST | `/pms/templates` | create template page | `createTemplate` | code/name/etc | template | authenticate | creates draft/template | expected | Implemented |
| PUT | `/pms/templates/:id` | template detail/edit | `updateTemplate` | template fields | template | authenticate | template fields | expected | Implemented |
| DELETE | `/pms/templates/:id` | template UI/API | `deleteTemplate` | none | id | authenticate | soft delete | expected | Implemented |
| POST | `/pms/templates/:id/clone` | clone action/API | `cloneTemplate` | none | cloned template | authenticate | creates draft clone | expected | Implemented |
| POST | `/pms/templates/:id/versions` | version control/API | `createTemplateVersion` | version payload | version | authenticate | draft version | expected | Implemented |
| GET | `/pms/templates/:id/versions` | version list | `listTemplateVersions` | none | versions | authenticate | none | none | Implemented |
| GET | `/pms/templates/:id/audit` | template detail | `getTemplateAuditHistory` | none | audit | authenticate | none | reads audit | Implemented |
| POST | `/pms/templates/versions/:versionId/activate` | builder activate | `activateTemplateVersion` | none | version | authenticate | active/locked/current | expected | Implemented |
| POST | `/pms/templates/versions/:versionId/deactivate` | builder/API | `deactivateTemplateVersion` | none | version | authenticate | inactive | expected | Implemented |
| DELETE | `/pms/templates/versions/:versionId` | version UI/API | `deleteTemplateVersion` | none | versionId | authenticate | soft delete | expected | Implemented |
| GET | `/pms/templates/versions/:versionId` | builder load | `getTemplateVersion` | none | version | authenticate | none | none | Implemented |
| PUT | `/pms/templates/versions/:versionId/sections` | builder save | `configureSections` | sections, annualScoringConfig | version | authenticate | updates version JSON | expected | Implemented |
| PUT | `/pms/templates/versions/:versionId/fields` | field save API | `configureFields` | sectionKey, fields | version | authenticate | updates fields | expected | Implemented |
| PUT | `/pms/templates/versions/:versionId/section-permissions` | permission UI/API | `configureSectionPermissions` | sectionKey, permissions | version | authenticate | updates permissions | expected | Implemented |
| PUT | `/pms/templates/versions/:versionId/field-permissions` | permission UI/API | `configureFieldPermissions` | sectionKey, fieldKey, permissions | version | authenticate | updates permissions | expected | Implemented |
| POST | `/pms/templates/versions/:versionId/resolve` | runtime forms/simulator | `resolveTemplateVersion` | actor/workflow/value context | resolved template | authenticate | none | none | Implemented |
| POST | `/pms/templates/versions/:versionId/preview` | preview page | `previewTemplate` | none | version | authenticate | none | none | Implemented |

Evidence: `Server/src/routes/pms-template.routes.ts:19-318`, `Server/src/services/pms-template.service.ts:146-770`.

### 16.2 Cycle and Assignment APIs

| Method | Endpoint | Frontend caller | Backend service | Payload | Response | Permission | Status change | Audit | Current status |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/pms/cycles` | `pmsCyclesApi.listCycles` | `listCycles` | query | cycles/meta | authenticate | none | none | Implemented |
| POST | `/pms/cycles` | `CycleWizard.saveDraft` | `createCycle` | cycle config | annualCycle + quarters | authenticate | creates draft | expected | Implemented |
| GET | `/pms/cycles/:id` | page loads/detail | `getCycleDetail` | none | cycle detail | authenticate | none | none | Implemented |
| GET | `/pms/cycles/:id/history` | detail history | `getCycleAuditHistory` | none | audit | authenticate | none | reads audit | Implemented |
| PUT | `/pms/cycles/:id` | edit wizard | `updateCycle` | cycle config | detail | authenticate | maybe state/config | expected | Implemented |
| PATCH | `/pms/cycles/:id/windows` | cycle edit/detail | `updateWindows` | quarters | detail | authenticate | windows/status may change | expected | Implemented |
| PATCH | `/pms/cycles/:id/communication` | cycle edit/detail | `updateCommunication` | config | cycle | authenticate | config | expected | Implemented |
| PATCH | `/pms/cycles/:id/appraisal-window` | cycle edit/detail | `updateAppraisalWindow` | config | cycle | authenticate | config | expected | Implemented |
| POST | `/pms/cycles/:id/schedule` | cycle list/detail | `scheduleCycle` | none | cycle | authenticate | scheduled | expected | Implemented |
| POST | `/pms/cycles/:id/launch` | cycle wizard/list/modal | `launchCycle` | none | cycle | authenticate | active | expected | Implemented |
| POST | `/pms/cycles/:id/close` | cycle list/detail | `closeCycle` | reason | cycle | authenticate | closed | expected | Implemented |
| POST | `/pms/cycles/:id/archive` | cycle list | `archiveCycle` | reason | cycle | authenticate | archived | expected | Implemented |
| POST | `/pms/cycles/:id/cancel` | cycle detail | `cancelCycle` | reason | cycle | authenticate | cancelled | expected | Implemented |
| POST | `/pms/cycles/:id/sync-progression` | cycle detail | `syncCycleProgression` | none | cycle | authenticate | may progress | expected | Implemented |
| POST | `/pms/cycles/:id/assign` | launch modal/API | `assignEmployee` | employee/manager/template/quarters/reason | annual + quarters | authenticate | assignment created | expected | Implemented |
| GET | `/pms/cycles/:id/assignments` | assignment/cycle UI | `listAssignments` | query | assignments/meta | authenticate | none | none | Implemented |
| POST | `/pms/cycles/:id/assignments/bulk` | assignment API | `bulkAssign` | assignments[] | results | authenticate | assignments/exceptions | expected | Implemented |
| GET | `/pms/cycles/:id/assignment-exceptions` | assignment workspace | `listExceptions` | status | exceptions | authenticate | none | none | Implemented |
| GET | `/pms/cycles/:id/reassignments` | assignment workspace | `listReassignments` | filters | history | authenticate | none | none | Implemented |
| GET | `/pms/cycles/:cycleId/assignments/:assignmentId` | Assignment360 | `getAssignment` | none | assignment detail | authenticate | none | none | Implemented |
| POST | `/pms/cycles/:cycleId/assignments/:assignmentId/reassign` | Assignment360 | `reassignManager` | manager/reason/quarters | assignment | authenticate | manager updated | expected | Implemented |
| POST | `/pms/cycles/:cycleId/assignments/:assignmentId/close` | Assignment360/workspace | `closeAssignment` | reason | assignment | authenticate | closed | expected | Implemented |
| POST | `/pms/cycles/:cycleId/assignments/:assignmentId/reopen` | Assignment360/workspace | `reopenAssignment` | reason | assignment | authenticate | reopened | expected | Implemented |
| POST | `/pms/cycles/:cycleId/assignments/:assignmentId/reopen-appraisal` | Assignment360/workspace | `adminReopenAnnual` | reason | assignment | authenticate | annual reopened | expected | Implemented |
| POST | `/pms/cycles/:cycleId/assignment-exceptions/:exceptionId/resolve` | assignment workspace | `resolveException` | resolution | exception | authenticate | resolved | expected | Implemented |

Evidence: `Server/src/routes/cycle.routes.ts:16-237`, `Server/src/routes/assignment.routes.ts:17-203`.

### 16.3 Objective, Review, Annual Decision APIs

| Method | Endpoint | Frontend caller | Backend service | Payload | Response | Permission | Status change | Audit | Current status |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/pms/objectives/assignments?mode=` | `pmsObjectivesApi.listAssignments` | `listAssignments` | mode | assignment list | authenticate | none | none | Implemented |
| POST | `/pms/objectives` | save draft new | `createObjective` | objective draft | objective | authenticate | draft/approved for manager-created depending service | expected | Implemented |
| GET | `/pms/objectives/:id` | detail API | `getObjectiveDetail` | none | objective | authenticate | none | none | Implemented |
| PUT | `/pms/objectives/:id` | save draft existing | `updateObjective` | objective draft | objective | authenticate | update | expected | Implemented |
| POST | `/pms/objectives/:id/submit` | submit button | `submitObjective` | none | objective | authenticate | submitted | expected | Implemented |
| POST | `/pms/objectives/:id/approve` | manager approve | `approveObjective` | none | objective | authenticate | approved | expected | Implemented |
| POST | `/pms/objectives/:id/return` | manager return | `returnObjective` | reason | objective | authenticate | revision required | expected | Implemented |
| POST | `/pms/objectives/:id/comments` | add comment | `addComment` | comment | comment | authenticate | none | expected | Implemented |
| POST | `/pms/objectives/:id/correction` | API exists; frontend caller not found | `correctObjective` | correction | objective | authenticate | corrected | expected | API exists/UI unclear |
| GET | `/pms/quarter-reviews/assignments?mode=` | `pmsQuarterReviewsApi.listAssignments` | `listAssignments` | mode | assignments | authenticate | none | none | Implemented |
| GET | `/pms/quarter-reviews/assignments/:id` | get review assignment | `getAssignment` | none | assignment | authenticate | none | none | Implemented |
| POST | `/pms/quarter-reviews/:id/draft` | save review draft | `saveQuarterReviewDraft` | review draft | review | authenticate | draft/open | expected | Implemented |
| POST | `/pms/quarter-reviews/:id/submit` | submit review | `submitQuarterReview` | review draft | review | authenticate | manager submitted | expected | Implemented |
| POST | `/pms/quarter-reviews/:id/finalize` | finalize review | `finalizeQuarterAssignment` | none | result | authenticate | quarter finalized | expected | Implemented |
| POST | `/pms/quarter-reviews/:id/reopen` | reopen review | `reopenQuarterAssignment` | reason | result | authenticate | reopened | expected | Implemented |
| GET | `/pms/annual-assignments` | decisions/audit/communications list | `listAssignments` | filters | assignments | authenticate | none | none | Implemented |
| GET | `/pms/annual-assignments/:id/summary` | decision detail | `getSummary` | none | summary | authenticate | none | none | Implemented |
| PUT | `/pms/annual-assignments/:id/decision/draft` | save decision | `saveDecisionDraft` | decision draft | decision | authenticate | draft | expected | Implemented |
| POST | `/pms/annual-assignments/:id/decision/submit` | submit decision | `submitDecision` | none | decision | authenticate | submitted | expected | Implemented |
| POST | `/pms/annual-assignments/:id/decision/final-score/override` | override score | `overrideFinalScore` | score/reason | decision | authenticate | override applied | expected | Implemented |
| POST | `/pms/annual-assignments/:id/decision/freeze` | freeze | `freezeDecision` | none | decision | authenticate | frozen | expected | Implemented |
| POST | `/pms/annual-assignments/:id/decision/reopen` | reopen | `reopenDecision` | reason | decision | authenticate | reopened | expected | Implemented |
| POST | `/pms/annual-assignments/:id/visibility` | visibility update | `updateVisibility` | flags/reason | assignment | authenticate | visibility flags/state | expected | Implemented |

Evidence: route/service files in Sections 10-12.

### 16.4 Supporting APIs

| Method | Endpoint | Purpose | Permission | Current status |
|---|---|---|---|---|
| POST | `/pms/communications/preview` | Generate appraisal communication preview. | authenticate | Implemented |
| POST | `/pms/communications/send` | Send appraisal communication. | authenticate | Implemented |
| POST | `/pms/communications/:id/resend` | Resend corrected communication. | authenticate | Implemented |
| GET | `/pms/communications/history/:annualAssignmentId` | Read communication history. | authenticate | Implemented |
| GET | `/pms/audit/:annualAssignmentId` | Read assignment audit history. | authenticate | Implemented |
| GET/POST/PUT/DELETE | `/pms/sla/rules...` | SLA rule CRUD. | authenticate | Implemented |
| GET/POST/PUT/DELETE | `/pms/sla/reminders...` | Reminder CRUD. | authenticate | Implemented |
| POST | `/pms/sla/trigger-check` | Manual SLA processing. | authenticate | Implemented |
| POST | `/pms/sla/events/:id/extend` | Extend SLA. | authenticate | Implemented |
| GET | `/pms/sla/history/:userId` | Notification history. | authenticate | Implemented |
| POST/GET/POST revoke | `/pms/delegations...` | Delegation create/list/revoke. | authenticate | Implemented |
| GET | `/pms/dashboard/employee|manager|admin|management` | Dashboard role stats. | authenticate | Implemented |
| POST | `/pms/bulk/*/preview|execute` | Bulk operations. | authenticate + hardcoded admin | Implemented |
| GET | `/pms/bulk/jobs`, `/pms/bulk/jobs/:id` | Bulk job history/detail. | authenticate + hardcoded admin | Implemented |
| POST | `/pms/access/check` | Access check. | authenticate | Implemented |
| POST | `/pms/access/reload` | Reload access cache. | authenticate | Implemented |
| GET | `/pms/access/cache-age` | Cache age. | authenticate | Implemented |
| GET/POST/PUT | `/pms/permissions` | Role permission CRUD. | authenticate | Implemented |

Evidence: route inventory in `Server/src/routes/*.routes.ts`.

## 17. UI/UX Current Truth

### 17.1 Layout and Navigation

- Authenticated pages show sidebar and content area; mobile shows a top bar with `RTE PMS` and hamburger/back button. Evidence: `Client/src/routes/+layout.svelte:290-361`.
- Sidebar collapse state is stored in localStorage and reflected into templates. Evidence: `Client/src/routes/+layout.svelte:215-284`, `Client/src/lib/components/templates/IndexPageTemplate.svelte:35-62`.
- Admin PMS sidebar is intentionally reduced; several route pages are hidden. Evidence: `Client/src/lib/components/common/Sidebar.svelte:145-207`.

### 17.2 Common UI Patterns

- PMS workspaces commonly use:
  - search inputs
  - status filters
  - list/detail split flow
  - modals for destructive or lifecycle actions
  - toast success/error messages
  - loading and empty states
  - pagination
- Evidence examples:
  - Annual decisions search/pagination: `Client/src/lib/components/pms/annual-decisions/AnnualDecisionWorkspace.svelte:117-244`.
  - Communication list/detail/preview: `Client/src/lib/components/pms/communications/CommunicationDispatchWorkspace.svelte:35-80`, `Client/src/lib/components/pms/communications/CommunicationDispatchWorkspace.svelte:294-650`.
  - Audit list/detail/timeline: `Client/src/lib/components/pms/audit/AuditHistoryWorkspace.svelte:28-125`, `Client/src/lib/components/pms/audit/AuditHistoryWorkspace.svelte:408-558`.
  - SLA list/detail/rule/reminder forms: `Client/src/lib/components/pms/sla/SlaWorkspace.svelte:47-130`, `Client/src/lib/components/pms/sla/SlaWorkspace.svelte:356-921`.
  - Delegation create/revoke forms: `Client/src/lib/components/pms/delegation/DelegationWorkspace.svelte:151-305`, `Client/src/lib/components/pms/delegation/DelegationWorkspace.svelte:619-816`.

### 17.3 Buttons and Actions by Area

Current visible action families:

- Templates: create template, choose/apply starter template, add/delete sections, add/delete/reorder fields, save version, activate/deactivate, preview, simulate permissions, clone/delete template/version. Evidence: `TemplateBuilderWorkspace.svelte`, `pms-template.routes.ts`.
- Cycles: create cycle, save draft, save and launch, schedule, launch, close, archive, cancel, sync progression, assign employees, assign all missed. Evidence: `CycleList.svelte`, `CycleWizard.svelte`, `CycleDetailTabs.svelte`, `LaunchCycleAssignmentsModal.svelte`.
- Assignments: open detail, reassign manager, close/reopen/reopen-appraisal, resolve exceptions, view audit, annual decision actions in 360. Evidence: `AssignmentWorkspace.svelte`, `Assignment360Detail.svelte`.
- Objectives: save draft, submit, approve, return, add comment, attach metadata, remove draft attachment. Evidence: `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:937-1113`, `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:1930-2020`.
- Reviews: save draft, submit, finalize, reopen. Evidence: `Client/src/lib/services/api/pmsQuarterReviews.ts:124-167`, `QuarterReviewWorkspace.svelte`.
- Annual decisions: save draft, submit, freeze, reopen, update visibility, override final score. Evidence: `AnnualDecisionWorkspace.svelte:966-1038`, `Assignment360Detail.svelte:469-545`.
- Communications: preview, send, resend, refresh history. Evidence: `CommunicationDispatchWorkspace.svelte:149-227`, `CommunicationDispatchWorkspace.svelte:487-650`.
- SLA: create/edit/delete rules, create/edit/delete reminders, trigger SLA check, load user history. Evidence: `SlaWorkspace.svelte:185-345`.
- Delegations: create, revoke. Evidence: `DelegationWorkspace.svelte:230-301`.
- Bulk: preview and execute selected operation, view jobs. Evidence: `Client/src/lib/services/api/pmsBulkOperations.ts:43-132`, `BulkOperationsWorkspace.svelte`.

### 17.4 Inconsistent / Confusing UI Areas

- Admin pages for decisions, communication, audit, SLA, delegation, and bulk exist but are hidden from sidebar. Evidence: `Client/src/lib/components/common/Sidebar.svelte:171-207`.
- Assignment flows exist in cycle launch modal, assignment workspace, bulk operations, and possibly legacy `/admin/pms/assignments`, creating multiple entry points. Evidence: routes and components listed above.
- Template builder has both client validation and backend validation, with potential differences in exact error wording/rules. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:664-752`, `Server/src/services/pms-template.service.ts:1470-2153`.
- Frontend mock fallback exists for cycles/templates. This can hide backend failures in some development modes. Evidence: `Client/src/lib/services/api/pmsCycles.ts:1-27`, `Client/src/lib/services/api/pmsTemplates.ts:37-40`.

## 18. Validation and Error Handling

Backend:

- PMS routes usually catch errors and return HTTP 400 with module-specific error code. Evidence:
  - templates: `Server/src/routes/pms-template.routes.ts:316-318`
  - assignments: `Server/src/routes/assignment.routes.ts:206-209`
  - objectives: `Server/src/routes/objective.routes.ts:141-144`
  - reviews: `Server/src/routes/quarterReview.routes.ts:109-112`
  - annual decisions: `Server/src/routes/annualDecision.routes.ts:142-145`
  - bulk: `Server/src/routes/pmsBulkOperations.routes.ts:292-295`
- Auth failures return HTTP 401 with `{ success: false, error: { message } }`. Evidence: `Server/src/middleware/auth.ts:244-250`.
- Global error handler exists but PMS routes often handle errors locally. Evidence: `Server/src/middleware/errorHandler.ts:3-20`.

Frontend:

- PMS workspaces use `toast.success()` and `toast.error()` for most save/submit/load flows. Evidence: examples in `ObjectiveWorkspace.svelte:953-1076`, `AnnualDecisionWorkspace.svelte:966-1038`, `SlaWorkspace.svelte:185-345`.
- PMS cycle errors are mapped by `pmsErrorMapper`. Evidence: `Client/src/lib/utils/pmsErrorMapper.ts`.
- Loading and empty states are present in major workspaces; coverage varies by page. Evidence examples listed in UI section.

## 19. Files, Uploads, and Attachments

Implemented:

- Objective draft accepts attachment metadata. Evidence: `Client/src/lib/services/api/pmsObjectives.ts:102-109`.
- Review draft accepts attachment metadata. Evidence: `Client/src/lib/services/api/pmsQuarterReviews.ts:73-78`.
- Objective has embedded attachment schema and separate attachment model. Evidence: `Server/src/models/pms-objective.model.ts:54-65`, `Server/src/models/pms-objective-attachment.model.ts:22-50`.
- Review has embedded attachment schema. Evidence: `Server/src/models/pms-quarter-review.model.ts:49-60`, `Server/src/models/pms-quarter-review.model.ts:119-124`.

Not implemented from PMS evidence:

- PMS-specific file upload route.
- PMS-specific file delete route.
- PMS-specific replace/version route.
- PMS-specific file size/type validation.
- PMS-specific attachment visibility enforcement.

## 20. Background and Automatic Behavior

Implemented/proven:

- Template builder autosave. Evidence: `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte:780-790`.
- Assignment creation seeds quarter assignments and can seed predefined objectives. Evidence: `Server/src/services/assignment.service.ts:921-1234`.
- Cycle progression sync method exists. Evidence: `Server/src/services/cycle.service.ts:569-674`.
- SLA sync/process methods exist. Evidence: `Server/src/services/sla.service.ts:92-205`.
- Manual SLA trigger endpoint exists. Evidence: `Server/src/routes/pmsSla.routes.ts:130-137`.
- Bulk execute jobs use async processing with `setImmediate`. Evidence: `Server/src/services/pmsBulkOperations.service.ts:426-440`, `Server/src/services/pmsBulkOperations.service.ts:651-669`, `Server/src/services/pmsBulkOperations.service.ts:853-869`, `Server/src/services/pmsBulkOperations.service.ts:1082-1096`.

Needs verification:

- PMS SLA scheduled cron. App imports `./utilis/corn`, but visible comment says shift status updates. Evidence: `Server/src/app.ts:14-15`.
- Automatic communication-ready transition after visibility update. Workflow states exist, but exact update path must be verified in service logic. Evidence: `Server/src/constants/workflow.config.ts:146-157`.
- Email delivery details for PMS communication/notification. Communication dispatch model/service exists, but actual transport behavior should be inspected before relying on it. Evidence: `Server/src/services/pmsCommunication.service.ts:60-231`, `Server/src/services/pms-notification.service.ts:10-217`.

## 21. Seed, Demo, and Mock Data

- PMS demo seed script exists: `Server/scripts/seed-pms-demo.ts`. Exact records are `NEEDS VERIFICATION` because the script was not executed and should be inspected/run only intentionally.
- Frontend cycle mocks exist in `Client/src/lib/mocks/pmsCycles.ts`.
- `pmsCyclesApi` imports and can fall back to mock cycles/template versions depending errors/mode. Evidence: `Client/src/lib/services/api/pmsCycles.ts:1-27`, `Client/src/lib/services/api/pmsCycles.ts:699-817`.
- Template mock env flag exists: `VITE_USE_PMS_TEMPLATE_MOCK`. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:37-40`, UI banner/conditional at `Client/src/routes/admin/pms/templates/+page.svelte:275`.

## 22. Gap Matrix

### 22.1 Fully Implemented

- Backend PMS route registration under `/pms/*`. Evidence: `Server/src/routes/index.ts:92-107`.
- Template CRUD/version CRUD/activation/deactivation/resolve/preview. Evidence: `Server/src/routes/pms-template.routes.ts:19-318`.
- Template version schema with sections/fields/scoring/permissions/objectives. Evidence: `Server/src/models/pms-template-version.model.ts:189-505`.
- Cycle create/update/lifecycle actions. Evidence: `Server/src/routes/cycle.routes.ts:16-237`, `Server/src/services/cycle.service.ts:128-569`.
- Assignment creation/list/reassignment/close/reopen/exceptions. Evidence: `Server/src/routes/assignment.routes.ts:17-203`, `Server/src/services/assignment.service.ts:112-920`.
- Objective draft/submit/approve/return/comment. Evidence: `Server/src/routes/objective.routes.ts:16-138`, `Server/src/services/objective.service.ts:401-829`.
- Quarter review draft/submit/finalize/reopen/scoring. Evidence: `Server/src/routes/quarterReview.routes.ts:15-107`, `Server/src/services/quarterReview.service.ts:437-2001`.
- Annual decision draft/submit/freeze/reopen/score override/visibility. Evidence: `Server/src/routes/annualDecision.routes.ts:16-145`, `Server/src/services/annualDecision.service.ts:382-943`.
- Audit model/service/history route. Evidence: `Server/src/models/audit-log.model.ts:23-78`, `Server/src/services/audit.service.ts:32-269`.
- Delegation CRUD/revoke/active lookup. Evidence: `Server/src/routes/delegation.routes.ts:11-50`, `Server/src/services/delegation.service.ts:28-296`.
- Bulk preview/execute/job history. Evidence: `Server/src/routes/pmsBulkOperations.routes.ts:17-290`, `Server/src/services/pmsBulkOperations.service.ts:95-1414`.

### 22.2 Partially Implemented

- Authorization: access service and role permissions exist, but most routes only authenticate. Evidence: `Server/src/services/access.service.ts:114-199`, PMS route definitions.
- SLA automation: processing exists, scheduler not proven. Evidence: `Server/src/services/sla.service.ts:92-205`, `Server/src/app.ts:14-15`.
- File attachments: metadata exists, upload/delete/validation not found. Evidence: Section 19.
- Runtime form renderer: implemented across workspaces, not centralized. Evidence: Section 14.
- Communication readiness automation: states and services exist, exact automatic progression needs verification. Evidence: Section 12.5.

### 22.3 Not Implemented From Code Evidence

- PMS-specific file upload endpoint.
- PMS-specific attachment delete/replace endpoint.
- PMS-specific attachment size/type validation.
- Employee self-review workflow.
- Employee sign-off/acceptance workflow.
- Centralized reusable PMS form-renderer component.
- Bulk job retry route, despite service method `retryFailedBulkRecords()`. Evidence: `Server/src/services/pmsBulkOperations.service.ts:1414`, no matching route in `Server/src/routes/pmsBulkOperations.routes.ts`.

### 22.4 Risky

- Hardcoded admin-only check for bulk operations excludes Director/Management even though PMS roles exist. Evidence: `Server/src/routes/pmsBulkOperations.routes.ts:9-15`.
- Route-level access checks are inconsistent. Evidence: PMS route files generally use only `authenticate`.
- Frontend may display seeded predefined objectives as approved regardless of backend status. Evidence: `Client/src/lib/services/api/pmsObjectives.ts:65-75`.
- Status duplication/mapping between frontend and backend can drift. Evidence: `Server/src/constants/pms.enums.ts`, `Client/src/lib/types/pms.ts`, `Client/src/lib/types/pmsTemplate.ts`.
- URL-only admin pages may be missed by users and testers. Evidence: `Client/src/lib/components/common/Sidebar.svelte:171-207`.
- Mock fallback can obscure backend integration errors in development. Evidence: `Client/src/lib/services/api/pmsCycles.ts:699-817`.

### 22.5 Frontend/Backend Mismatches

- Template status casing: backend uppercase, frontend title-case. Mapping exists. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:933-960`.
- Review final status naming split: `QuarterReviewStatus.FINALIZED` vs `QuarterWorkflowState.QUARTER_FINALIZED`. Evidence: `Server/src/constants/pms.enums.ts:69-76`.
- PMS role type: backend dynamic string, frontend fixed union. Evidence: `Server/src/constants/pms.enums.ts:10`, `Client/src/lib/types/pms.ts:1-9`.
- Bulk retry service exists without route/client. Evidence: `Server/src/services/pmsBulkOperations.service.ts:1414`.

### 22.6 UI Exists but API Missing / Unclear

- PMS-specific file upload UI metadata exists, but upload API is missing from PMS routes.
- Some UI may expose correction/reopen behavior through workspaces, but not every backend correction endpoint has an obvious frontend client method. Example: objective correction endpoint exists but `pmsObjectivesApi` does not expose `correctObjective()`. Evidence: `Server/src/routes/objective.routes.ts:121-138`, `Client/src/lib/services/api/pmsObjectives.ts:128-196`.

### 22.7 API Exists but UI Missing / Hidden

- Objective correction API exists; frontend caller not found in `pmsObjectivesApi`. Evidence above.
- Bulk retry service exists; route/client not found. Evidence: `Server/src/services/pmsBulkOperations.service.ts:1414`.
- PMS access check/reload/cache APIs exist; no obvious admin UI page found for them. Evidence: `Server/src/routes/pms-access.routes.ts:12-59`.
- PMS role-permission CRUD API exists; setup UI may exist through generic setup modal, but direct PMS admin route not found. Evidence: `Server/src/routes/pms-role-permission.routes.ts:14-54`, `Client/src/lib/services/api/pmsRolePermission.ts:14-27`.

### 22.8 Unused / Dead / Hidden Code

- Sidebar-hidden PMS admin pages are route-live but navigation-hidden. Evidence: `Client/src/lib/components/common/Sidebar.svelte:171-207`.
- Legacy `/admin/pms/assignments` exists while Assignment Workspace is the visible nav entry. Evidence: route inventory and sidebar comment.
- Client mock data and fallback branches remain in PMS cycle/template clients. Evidence: `Client/src/lib/mocks/pmsCycles.ts`, `Client/src/lib/services/api/pmsCycles.ts`.

## 23. Final Current-State Classification

| Module | Classification | Reason |
|---|---|---|
| Template Management | Implemented | Full route/service/model/UI support. |
| Template Builder | Implemented, complex | Sections/fields/scoring/permissions/preview/resolve/autosave/versioning present. |
| Cycle Management | Implemented | Create/update/lifecycle/validation/UI present. |
| Assignment Management | Implemented | Manual, bulk, quarter creation, exceptions, reassignment present. |
| Objective Management | Implemented | Employee/manager modes, draft/submit/approve/return/comments/dynamic values present. |
| Manager Review | Implemented | Assignment list, draft/submit/finalize/reopen/scoring/dynamic values present. |
| Annual Decision | Implemented | Summary/draft/submit/freeze/reopen/override/visibility/masking present. |
| Communication | Implemented | Preview/send/resend/history present. |
| SLA/Notifications | PARTIAL | Rule/reminder/manual processing present; scheduler not proven. |
| Delegation | Implemented | Create/list/revoke/active lookup present. |
| Audit/History | Implemented but not universal | Audit model/service/routes exist; coverage by every mutation needs verification. |
| Access/Permissions | PARTIAL | Engine/API/model exist; route enforcement inconsistent. |
| Attachments/Files | PARTIAL | Metadata exists; PMS upload/delete/validation missing. |
| UI Navigation | PARTIAL | Many pages exist, several admin pages hidden from sidebar. |

## 24. Final Addendum: Indirect Imports, Shared Services, and Hidden Dependencies

This addendum covers PMS behavior discovered through indirect imports, shared services, stale UI surfaces, fallback clients, bootstrap code, scripts, and tests. It updates the truth document without introducing planned PMS changes.

### 24.1 Quarter Assignment Workflow Helper

File: `Server/src/services/quarter-assignment-workflow.service.ts`.

Exported behavior:

| Method | Purpose | Evidence |
|---|---|---|
| `transitionQuarterAssignmentState(quarterAssignmentId, nextState, actorContext, reason?)` | Central helper for quarter-assignment state transitions. | `Server/src/services/quarter-assignment-workflow.service.ts:11-75` |

Exact behavior:

- It loads `QuarterAssignment` by id and throws `Quarter Assignment not found` when missing. Evidence: `transitionQuarterAssignmentState()`, `Server/src/services/quarter-assignment-workflow.service.ts:16-21`.
- It does not bypass workflow validation; it calls `workflowService.transition()` with entity type `QUARTER_ASSIGNMENT`, current state, requested next state, actor id, actor role, and reason. Evidence: `transitionQuarterAssignmentState()`, `Server/src/services/quarter-assignment-workflow.service.ts:23-31`.
- It updates `previousQuarterState`, `quarterState`, `lastTransitionAt`, `lastTransitionBy`, `lastTransitionRole`, and `lastTransitionReason`, then saves the quarter assignment. Evidence: `transitionQuarterAssignmentState()`, `Server/src/services/quarter-assignment-workflow.service.ts:33-40`.
- It writes a `WorkflowEvent` with entity/assignment/cycle references, from/to states, action name, actor, role, reason, metadata, and created timestamp. Evidence: `WorkflowEvent.create()`, `Server/src/services/quarter-assignment-workflow.service.ts:42-61`.
- It writes an audit log action `QUARTER_ASSIGNMENT_STATE_TRANSITIONED`. Evidence: `auditService.createAuditLog()`, `Server/src/services/quarter-assignment-workflow.service.ts:63-72`.
- It is called by both objective and quarter-review services. Evidence: imports in `Server/src/services/objective.service.ts:23`, `Server/src/services/quarterReview.service.ts:29`; calls in `Server/src/services/objective.service.ts:1774`, `Server/src/services/objective.service.ts:1821`, `Server/src/services/quarterReview.service.ts:685`, `Server/src/services/quarterReview.service.ts:762`, `Server/src/services/quarterReview.service.ts:2047`.

Relationship to major flows:

- Objective flow uses this helper when objective submission/approval-related logic moves the owning quarter assignment state. Evidence: `ObjectiveService`, `Server/src/services/objective.service.ts:1774`, `Server/src/services/objective.service.ts:1821`.
- Quarter review flow uses this helper for review submission/finalization/reopen-related transitions. Evidence: `QuarterReviewService.submitQuarterReview()`, `finalizeQuarterAssignment()`, correction/reopen path references in `Server/src/services/quarterReview.service.ts:685`, `Server/src/services/quarterReview.service.ts:762`, `Server/src/services/quarterReview.service.ts:2047`.
- The helper owns the persisted `WorkflowEvent` and audit trail for these quarter-state changes, not the caller. Evidence: `Server/src/services/quarter-assignment-workflow.service.ts:42-72`.

### 24.2 Visibility Mask Service

File: `Server/src/services/visibilityMask.service.ts`.

Imported/used by:

| Caller | Usage | Evidence |
|---|---|---|
| `AssignmentService` | Masks assignment list records using assignment visibility flags and admin override. | `Server/src/services/assignment.service.ts:35`, `Server/src/services/assignment.service.ts:204-229` |
| `AnnualDecisionService` | Masks grade/merit fields in annual-decision result/history helpers. | `Server/src/services/annualDecision.service.ts:25`, `Server/src/services/annualDecision.service.ts:1760` |
| `PmsDashboardService` | Masks annual outcome dashboard data and handles employee review redaction separately. | `Server/src/services/pmsDashboard.service.ts:16`, `Server/src/services/pmsDashboard.service.ts:72-119` |
| `ReportService` | Dynamically imports visibility config and mask service for PMS-report data masking. | `Server/src/services/reports.service.ts:268-310` |

Exact mask behavior:

- `mask(data, context)` recursively handles arrays, passes through non-object values, and returns a shallow copy when `hasVisibilityOverride` is true. Evidence: `VisibilityMaskService.mask()`, `Server/src/services/visibilityMask.service.ts:40-51`.
- If `visibleFrom` is in the future, it forces employee/manager grade and merit visibility flags to false. Evidence: `VisibilityMaskService.mask()`, `Server/src/services/visibilityMask.service.ts:53-61`.
- Grade fields removed when grade is not visible include `grade`, `gradeValue`, `gradeScale`, `gradeDetails`, `finalGrade`, and related approval fields. Evidence: `gradeFields`, `Server/src/services/visibilityMask.service.ts:6-17`.
- Merit fields removed when merit is not visible include `merit`, `meritAmount`, `meritPercentage`, `payrollEffectiveDate`, `meritDetails`, and related approval fields. Evidence: `meritFields`, `Server/src/services/visibilityMask.service.ts:19-31`.
- Outcome fields `appraisalOutcomeType`, `nilReason`, and `communicationPolicy` are removed when either grade or merit is not visible. Evidence: `outcomeFields`, `shouldHideOutcome`, `Server/src/services/visibilityMask.service.ts:33-37`, `Server/src/services/visibilityMask.service.ts:65-70`.
- Dynamic `confidentialFields` are removed unless the outcome is fully visible. Evidence: `VisibilityMaskService.mask()`, `Server/src/services/visibilityMask.service.ts:72-79`.
- Role handling is limited to normalized `employee` and `manager`; other roles return false unless `hasVisibilityOverride` is true. Evidence: `canViewGrade()`, `canViewMerit()`, `Server/src/services/visibilityMask.service.ts:90-109`.

Difference from annual-decision masking:

- `visibilityMaskService` is generic field-name masking for arbitrary records. Evidence: `VisibilityMaskService.mask()`, `Server/src/services/visibilityMask.service.ts:40-85`.
- `AnnualDecisionService` additionally has annual-decision-specific masking/history helpers and effective visibility calculations. Evidence: `Server/src/services/annualDecision.service.ts:1751-2007`.
- Risk: field-name masking only protects known exact keys and configured `confidentialFields`; nested or differently named grade/merit values may leak unless the caller adds those keys to `confidentialFields` or uses annual-decision-specific masking. Evidence: fixed field sets in `Server/src/services/visibilityMask.service.ts:6-37`.

### 24.3 PMS Notification Service

File: `Server/src/services/pms-notification.service.ts`.

Supported behavior:

- `triggerNotification(recipientUserId, eventType, channel, subject, body, entityType?, entityId?, cycleId?)` accepts arbitrary string `eventType`; there is no local enum of supported PMS event names in this service. Evidence: method signature, `Server/src/services/pms-notification.service.ts:10-19`.
- Channel support is `EMAIL`, `IN_APP`, or `BOTH`; `BOTH` expands to `EMAIL` and `IN_APP`. Evidence: method signature and `channelsToSend`, `Server/src/services/pms-notification.service.ts:13-14`, `Server/src/services/pms-notification.service.ts:170`.
- Recipient is resolved through `User.findById(recipientUserId)` and missing users are logged and skipped. Evidence: `Server/src/services/pms-notification.service.ts:21-27`.
- Non-admin/director/management recipients get visibility-aware sanitization based on an annual assignment resolved from `ANNUAL_ASSIGNMENT`, `QUARTER_ASSIGNMENT`, or cycle+recipient role. Evidence: `Server/src/services/pms-notification.service.ts:34-81`.
- Grade/rating/score/merit values are redacted from subject/body when not visible, using annual-decision lookup and regex cleanup. Evidence: `Server/src/services/pms-notification.service.ts:86-168`.
- It writes `NotificationEvent` records with `PENDING`, then marks them `SENT` or `FAILED`. Evidence: `NotificationEvent.create()`, `Server/src/services/pms-notification.service.ts:173-183`, status updates in `Server/src/services/pms-notification.service.ts:200-209`.
- Email is actually sent only for `EMAIL` channel through `emailService.sendEmail()`. Evidence: `Server/src/services/pms-notification.service.ts:185-197`.
- `IN_APP` currently means a notification record is created and marked `SENT`; no websocket/push/read-inbox delivery behavior was found in this service. Evidence: email-only branch in `Server/src/services/pms-notification.service.ts:185-197`. Current status: PARTIAL.

Known PMS callers:

- `SlaService` imports `pmsNotificationService` and calls `triggerNotification()` while processing SLA events. Evidence: `Server/src/services/sla.service.ts:4`, `Server/src/services/sla.service.ts:282`.
- Direct objective/review/communication notification calls were not proven in the inspected services. Current status: NEEDS VERIFICATION for non-SLA notification coverage.

### 24.4 PMS Communication Service

File: `Server/src/services/pmsCommunication.service.ts`.

Methods:

| Method | Guard | Main behavior | Evidence |
|---|---|---|---|
| `previewCommunication(input)` | `assertAdmin('pmsCommunication.preview')` | Renders subject/body/hash without dispatch. | `Server/src/services/pmsCommunication.service.ts:60-65` |
| `sendCommunication(input)` | `assertAdmin('pmsCommunication.send')` | Renders, creates dispatch, sends email unless skipped, updates assignment communication state. | `Server/src/services/pmsCommunication.service.ts:67-204` |
| `resendCommunication(dispatchId, correctionReason?)` | Calls `sendCommunication()` after validation | Requires valid dispatch id and correction reason, resends using existing content key. | `Server/src/services/pmsCommunication.service.ts:206-229` |
| `getHistory(annualAssignmentId)` | `assertAdmin('pmsCommunication.history')` | Returns dispatches sorted newest-first. | `Server/src/services/pmsCommunication.service.ts:231-238` |

Exact rules:

- `assertAdmin()` calls `accessService.canPerform()` with `requiresAdmin: true`. Evidence: `Server/src/services/pmsCommunication.service.ts:421-431`.
- Communication can render only when the annual decision status is `VISIBILITY_ENABLED`. Evidence: `renderCommunication()`, `Server/src/services/pmsCommunication.service.ts:248-257`.
- A `VisibilityConfiguration` must exist and at least one visibility flag must be true. Evidence: `renderCommunication()`, `Server/src/services/pmsCommunication.service.ts:259-264`; `hasAnyVisibility()`, `Server/src/services/pmsCommunication.service.ts:405-419`.
- If the decision outcome is `NIL` and the annual cycle has `communicationRuleConfig.skipNilOutcome === true`, it creates a `CommunicationDispatch` with `contentKey: 'NIL'`, `contentVersion: 'STATIC_PMS_V1'`, `channel: 'EMAIL'`, `dispatchStatus: 'SKIPPED'`, sets annual assignment `communicationStatus` to `SKIPPED`, sets `annualState` to `COMMUNICATION_SENT`, writes audit `PMS_COMMUNICATION_SKIPPED`, and returns. Evidence: `sendCommunication()`, `Server/src/services/pmsCommunication.service.ts:88-122`.
- For normal send, it creates a dispatch with `dispatchStatus: 'RENDERED'`, sends email via `emailService.sendEmail()` unless `skipEmail`, then marks dispatch `SENT` and annual assignment `communicationStatus: 'SENT'`, `annualState: COMMUNICATION_SENT`. Evidence: `Server/src/services/pmsCommunication.service.ts:125-190`.
- It writes audit action `PMS_COMMUNICATION_SENT` or `PMS_COMMUNICATION_RESENT`. Evidence: `Server/src/services/pmsCommunication.service.ts:192-201`.
- It uses static Handlebars content generated by `resolveStaticContentTemplate()` with content version `STATIC_PMS_V1`, not persisted letter-template records. Evidence: `renderCommunication()`, `resolveStaticContentTemplate()`, `Server/src/services/pmsCommunication.service.ts:266-292`, `Server/src/services/pmsCommunication.service.ts:294-339`.
- Supported static content keys are `BOTH`, `MERIT_ONLY`, `GRADE_ONLY`, and `NIL`. Evidence: `resolveStaticContentTemplate()`, `Server/src/services/pmsCommunication.service.ts:294-339`.

Current letter-template relationship:

- Current communication dispatch does not use `LetterTemplateBuilder.svelte`, `PmsLetterTemplate`, or backend template-version letter metadata. Evidence: no letter-template model/service lookup in `Server/src/services/pmsCommunication.service.ts:1-431`; static rendering in `Server/src/services/pmsCommunication.service.ts:294-339`.
- Bulk communication routes standard dispatch through `PmsCommunicationService`, so bulk dispatch also uses these static templates. Evidence: `Server/src/services/pmsBulkOperations.service.ts:1123-1132`.

### 24.5 Service-Level Authorization Checks

This table lists internal service guards discovered in the inspected PMS services. Route-level authentication still applies separately.

| Service | Methods / area | Internal guard/check | Ownership / hierarchy / visibility behavior | Missing or partial guard |
|---|---|---|---|---|
| `PmsTemplateService` | Mutating template/version/config methods | `assertAdmin()` with `accessService.canPerform({ requiresAdmin: true })`; access simulation uses `accessService.canPerform()`. Evidence: `Server/src/services/pms-template.service.ts:2336-2370`. | Template access simulation supports role/context checks. Evidence: `simulateTemplateAccess()`, `Server/src/services/pms-template.service.ts:770`. | List/get paths are not proven to require admin internally. |
| `CycleService` | Create/update/windows/communication/lifecycle | `assertAdmin()` with `requiresAdmin: true`. Evidence: method inventory and guard, `Server/src/services/cycle.service.ts:226-569`, `Server/src/services/cycle.service.ts:1559-1571`. | Cycle lifecycle validations are service-level; no ownership scope expected for admin cycle setup. | List/detail internal admin guard not proven. |
| `AssignmentService` | Assign/bulk/reassign/close/reopen/exceptions | Admin guard on major mutations and exception lists. Evidence: `Server/src/services/assignment.service.ts:247`, `346`, `459`, `507`, `606`, `651`, `700`, `883`, `898`, `1500-1504`. | Assignment list applies visibility masking and admin override check. Evidence: `Server/src/services/assignment.service.ts:204-229`. | `getAssignment()` and list access constraints beyond masking need verification. |
| `ObjectiveService` | Employee/manager list/detail/create/update/submit/approve/return/comment/correct | Uses ownership/access helpers and `accessService.canPerform()` in lower helpers; objective state transitions use `transitionQuarterAssignmentState()`. Evidence: `Server/src/services/objective.service.ts:1981`, `2019`, `2164-2168`, `1774`, `1821`. | Supports employee/manager mode semantics in service methods. Evidence: public methods `listAssignments(mode)`, `createObjective()`, `approveObjective()`, `returnObjective()`, `Server/src/services/objective.service.ts:220-829`. | Exact per-method access matrix requires code-level audit of helper branches. |
| `QuarterReviewService` | Review list/detail/draft/submit/finalize/reopen | Admin guard on finalize/reopen; other access uses `accessService.canPerform()` helpers; transitions use `transitionQuarterAssignmentState()`. Evidence: `Server/src/services/quarterReview.service.ts:711-762`, `2382`, `2429`, `2456-2460`. | Employee review visibility redaction is implemented for dashboard/list-style paths. Evidence: `Server/src/services/quarterReview.service.ts:362`, `928`. | Exact ownership enforcement for every read/write path needs verification. |
| `AnnualDecisionService` | List/summary/draft/submit/freeze/reopen/override/visibility | Uses access/visibility helpers and visibility masking; exact per-method guard must be read in each method. Evidence: method inventory `Server/src/services/annualDecision.service.ts:160-943`; masking `Server/src/services/annualDecision.service.ts:1751-2007`. | Visibility configuration and masking are central to annual-decision output. Evidence: `updateVisibility()`, `Server/src/services/annualDecision.service.ts:836-943`. | Full role/ownership guard matrix needs verification; not every method shown in route file proves admin-only. |
| `PmsCommunicationService` | Preview/send/resend/history | `assertAdmin()` with `requiresAdmin: true`. Evidence: `Server/src/services/pmsCommunication.service.ts:60-70`, `232`, `421-431`. | Requires `VISIBILITY_ENABLED` decision and at least one visibility flag before rendering. Evidence: `Server/src/services/pmsCommunication.service.ts:248-264`. | Uses static templates; no letter-template permission model. |
| `SlaService` | Calculate/create/sync/process/extend | Singleton service; no request-scoped actor guard shown in method inventory. Evidence: `Server/src/services/sla.service.ts:29-477`. | Sends notifications through `pmsNotificationService` during processing. Evidence: `Server/src/services/sla.service.ts:282`. | Route guards must be relied on; service-level admin/ownership guard not proven. |
| `DelegationService` | Create/list/revoke/active lookup | Service methods exist; detailed guard behavior needs verification. Evidence: `Server/src/services/delegation.service.ts:28-296`. | Delegation lookup supports delegate/delegator/cycle scope. Evidence: `getActiveDelegation()`, `getActiveDelegationsForDelegate()`, `Server/src/services/delegation.service.ts:262-296`. | Full create/list/revoke authorization matrix not proven from targeted pass. |
| `PmsDashboardService` | Employee/manager/admin/management dashboards | Uses visibility override checks for employee outcome masking. Evidence: `Server/src/services/pmsDashboard.service.ts:24-144`. | Employee dashboard masks annual outcome and review details based on visibility flags. Evidence: `Server/src/services/pmsDashboard.service.ts:72-119`. | Role/ownership validation of requested employee/manager id needs verification. |
| `PmsBulkOperationsService` | Bulk assignment/reminder/visibility/communication/close/jobs/retry | Route-level hardcoded admin middleware exists; service uses admin context in tests. Evidence: `Server/src/routes/pmsBulkOperations.routes.ts:9-15`, `Server/test/pmsBulkOperations.test.ts:111-123`. | Bulk communication routes through `PmsCommunicationService`. Evidence: `Server/src/services/pmsBulkOperations.service.ts:1123-1132`. | `retryFailedBulkRecords()` service method has no proven route/client. Evidence: `Server/src/services/pmsBulkOperations.service.ts:1414`. |

### 24.6 Shared API Base and PMS Current-Date Override

File: `Client/src/lib/services/api/base.ts`.

- Every client API request using shared `fetchApi()` reads `pmsCurrentDateOverride` from the Svelte store. Evidence: `fetchApi()`, `Client/src/lib/services/api/base.ts:56`.
- If the store has a value, `fetchApi()` adds header `x-pms-current-date`. Evidence: `Client/src/lib/services/api/base.ts:69-71`.
- This is global to `fetchApi()`, not limited to PMS endpoints. Evidence: `fetchApi(endpoint, options)`, `Client/src/lib/services/api/base.ts:52-90`.
- Backend auth parses only `YYYY-MM-DD`, converts it to noon UTC, and stores it as `pmsCurrentDate` in request context. Evidence: `getPmsCurrentDateOverride()`, `Server/src/middleware/auth.ts:36-46`; context update in `Server/src/middleware/auth.ts:218-223`.
- UI exposure was found in objective workspace date override controls. Evidence: `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:17`, `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:1164-1169`, `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:1264-1267`.

Risk:

- This is useful for PMS demos/testing, but because the header is injected into every `fetchApi()` request, a stale override can affect any backend path that reads request context. Evidence: global `fetchApi()` implementation in `Client/src/lib/services/api/base.ts:52-90`.

### 24.7 PMS Type Contracts

File: `Server/src/types/pms.types.ts`.

Workflow contracts:

- `WorkflowTransitionInput` contains entity type/id, current/next state, actor id/role, optional reason, and metadata. Evidence: `Server/src/types/pms.types.ts:18-28`.
- `WorkflowActorContext` is only `actorId` and `actorRole`. Evidence: `Server/src/types/pms.types.ts:30-33`.
- `WorkflowTransitionResult` includes previous/current quarter or annual state and transition timestamp. Evidence: `Server/src/types/pms.types.ts:40-50`.

Access contracts:

- `PmsMappedRole` is `PmsRole | 'UNKNOWN'`. Evidence: `Server/src/types/pms.types.ts:52`.
- `AccessActorContext` has `actorId` and `actorRole`. Evidence: `Server/src/types/pms.types.ts:54-57`.
- `AccessResourceContext` supports `employeeId`, `managerId`, `assignedManagerId`, `ownerId`, `allowedManagerIds`, `cycleId`, and `delegatorId`. Evidence: `Server/src/types/pms.types.ts:59-67`.
- `AccessCheckInput` supports `actor`, `action`, optional `resource`, and `requiresAdmin`. Evidence: `Server/src/types/pms.types.ts:69-74`.
- `VisibilityMaskContext` supports actor role, employee/manager grade/merit flags, `visibleFrom`, `confidentialFields`, and `hasVisibilityOverride`. Evidence: `Server/src/types/pms.types.ts:97-106`.

Gap/risk:

- The access resource type does not include department, business-unit, or region fields, even though broader PMS access requirements mention those scopes. Current relationship to `AccessService` department/business-unit/region behavior is NEEDS VERIFICATION. Evidence: `AccessResourceContext`, `Server/src/types/pms.types.ts:59-67`.

### 24.8 Request-Scoped Container Wiring

Files: `Server/src/container/index.ts`, `Server/src/types/container.ts`.

PMS services wired into request scope:

| Service | Container evidence | Type evidence |
|---|---|---|
| `pmsTemplateService` | `Server/src/container/index.ts:107` | `Server/src/types/container.ts:87` |
| `cycleService` | `Server/src/container/index.ts:108` | `Server/src/types/container.ts:88` |
| `assignmentService` | `Server/src/container/index.ts:109` | `Server/src/types/container.ts:89` |
| `objectiveService` | `Server/src/container/index.ts:110` | `Server/src/types/container.ts:90` |
| `quarterReviewService` | `Server/src/container/index.ts:111` | `Server/src/types/container.ts:91` |
| `annualDecisionService` | `Server/src/container/index.ts:112` | `Server/src/types/container.ts:92` |
| `pmsCommunicationService` | `Server/src/container/index.ts:113` | `Server/src/types/container.ts:93` |
| `delegationService` | `Server/src/container/index.ts:114` | `Server/src/types/container.ts:94` |
| `pmsDashboardService` | `Server/src/container/index.ts:115` | `Server/src/types/container.ts:95` |
| `pmsBulkOperationsService` | `Server/src/container/index.ts:116` | `Server/src/types/container.ts:96` |

Not request-scoped in the container:

- `SlaService`, `AuditService`, `AccessService`, `PmsNotificationService`, `PmsScoringService`, `VisibilityMaskService`, and `transitionQuarterAssignmentState()` are not listed in `ServiceContainer`. Evidence: imports/returned properties in `Server/src/container/index.ts:39-48`, `Server/src/container/index.ts:107-116`; type properties in `Server/src/types/container.ts:87-96`.
- These helpers/services are used as singletons/direct imports. Evidence: `visibilityMaskService` import in `Server/src/services/assignment.service.ts:35`; `pmsNotificationService` import in `Server/src/services/sla.service.ts:4`; `auditService` import in `Server/src/services/pmsCommunication.service.ts:17`.

### 24.9 Letter Template Builder Truth

Route:

- `/admin/pms/letter-templates` is not an active builder page. It renders a notice titled `Communication Templates Removed` and states backend static outcome-based content is now used. Evidence: `Client/src/routes/admin/pms/letter-templates/+page.svelte:1-24`.

Component still present:

- `LetterTemplateBuilder.svelte` still exists and accepts a `PmsTemplateVersion` plus callbacks for save/edit/activate/deactivate/new version/delete/preview. Evidence: props in `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:1-25`.
- It supports outcome types `BOTH`, `MERIT_ONLY`, `GRADE_ONLY`, and `NIL`. Evidence: `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:50-55`.
- It detects placeholders with `/{{ ... }}/` and conditionals with `/{{#if ...}}/`, and checks balanced `{{#if}}` / `{{/if}}` tags. Evidence: `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:60-77`, `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:86-90`.
- It supports quick insert placeholders (`employeeName`, `finalGrade`, `meritAmount`, `cycleName`, `managerName`) and conditional snippets. Evidence: `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:56-62`, `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:93-128`.
- It prevents save when conditional tags are unbalanced or no placeholder exists. Evidence: `handleSave()`, `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:152-176`.
- It enforces one active template per outcome type in the UI callback layer. Evidence: `handleActivate()`, `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:179-193`.
- It groups letter templates into version families by `letterTemplateId || id` and sorts active/newer versions first. Evidence: `buildLetterTemplateFamilies()`, `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:195-224`.

Frontend API/types:

- `PmsLetterTemplate`, `CreatePmsLetterTemplatePayload`, `UpdatePmsLetterTemplatePayload`, and `PmsLetterTemplatePreview` exist in client types. Evidence: `Client/src/lib/types/pmsTemplate.ts:268-304`, `Client/src/lib/types/pmsTemplate.ts:378-387`, `Client/src/lib/types/pmsTemplate.ts:491-502`.
- Client API includes local/mock-style methods `createLetterTemplate()`, `activateLetterTemplate()`, and `previewLetterTemplate()`, operating on `version.letterTemplates`. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:1864-1995`.
- Backend `PmsTemplateService` has letter-template-shaped input fields (`placeholders`, `conditionalBlocks`) and template-version schema has field placeholders/conditional rendering, but no proven backend route for standalone letter-template CRUD was found in `pms-template.routes.ts`. Evidence: `Server/src/services/pms-template.service.ts:137-138`; route span `Server/src/routes/pms-template.routes.ts:19-318`.

Current relationship to communication:

- PMS communication dispatch does not use this builder. It uses static `STATIC_PMS_V1` templates in `PmsCommunicationService`. Evidence: `Server/src/services/pmsCommunication.service.ts:294-339`.
- Current status: stale/inactive frontend component and client methods remain; live communication is backend-static.

### 24.10 Template Helper Components

| Component/file | Purpose | Current actions/config | Evidence | Gaps/risks |
|---|---|---|---|---|
| `FieldEditor.svelte` | Edits individual template fields. | Field type defaults, scoring config, option scores, behaviors, conditional rendering, role visibility/editability, quarters, workflow states, hierarchy scopes, options, signature/matrix/grid config. | `Client/src/lib/components/pms/templates/FieldEditor.svelte:36-466`, UI/action refs through `Client/src/lib/components/pms/templates/FieldEditor.svelte:666-1405`. | Large duplicated client-side rules can drift from backend validation. |
| `SectionBuilder.svelte` | Builds template sections and fields. | Add/delete sections, add/delete fields, drag/drop fields, section layout, quarters, section permissions, section scoring, rendering scope. | `Client/src/lib/components/pms/templates/SectionBuilder.svelte:21-286`, UI/action refs `Client/src/lib/components/pms/templates/SectionBuilder.svelte:301-695`. | Client scoring totals and permissions can diverge from backend model/validation. |
| `FieldToolbox.svelte` | Draggable/collapsible field palette. | Drag-start payload for field type and expanded/collapsed control. | `Client/src/lib/components/pms/templates/FieldToolbox.svelte:33-59`, `Client/src/lib/components/pms/templates/FieldToolbox.svelte:132`. | Needs verification whether all advertised field types are fully rendered in every runtime workspace. |
| `TemplateTable.svelte` | Template summary/list table. | Select template, active-version label, version count, pagination. | `Client/src/lib/components/pms/templates/TemplateTable.svelte:19-66`, `Client/src/lib/components/pms/templates/TemplateTable.svelte:120-205`. | Table is display-focused; actions beyond select are parent-owned. |
| `VersionControl.svelte` | Version selector/history display. | Shows current/all versions, status, locked badge, callback select. | `Client/src/lib/components/pms/templates/VersionControl.svelte:4-55`. | Minimal component; actual clone/activate/delete logic is elsewhere. |
| `TemplatePreviewSimulatorWorkspace.svelte` | Saved-template preview simulator. | Builds a `PmsTemplatePreview`, previews employee/manager/annual-decision views with role/state/quarter/visibility inputs. | `Client/src/lib/components/pms/templates/TemplatePreviewSimulatorWorkspace.svelte:11-60`, `Client/src/lib/components/pms/templates/TemplatePreviewSimulatorWorkspace.svelte:94-153`. | It previews saved metadata; runtime form behavior must still be verified in objective/review/decision workspaces. |
| `starterTemplates.ts` | Starter template catalog and generated sections. | Catalog, predefined objective section, competency matrix, manager review section, annual decision section, communication note section, field visibility/scoring metadata. | `Client/src/lib/components/pms/templates/starterTemplates.ts:75-120`, `Client/src/lib/components/pms/templates/starterTemplates.ts:255-901`. | Starter communication section is documentation/config note, not live letter dispatch wiring. |

### 24.11 PMS Role-Permission UI

Backend/API:

- `pmsRolePermissionApi` lists, creates, and updates `/pms/permissions`. Evidence: `Client/src/lib/services/api/pmsRolePermission.ts:14-31`.
- Backend list route is authenticated but not admin-only. Evidence: `Server/src/routes/pms-role-permission.routes.ts:14-24`.
- Backend create/update routes normalize role, require `PmsRole.ADMIN`, persist `PmsRolePermission`, and call `accessService.reloadPermissions()`. Evidence: `Server/src/routes/pms-role-permission.routes.ts:27-70`.

Visible UI path:

- Generic setup `ConfigManagement.svelte` imports `pmsRolePermissionApi` and `RolePermissionModal`. Evidence: `Client/src/lib/components/setup/ConfigManagement.svelte:7-9`.
- When editing an LOV of type `role`, it shows `Add Role & Permissions`; save writes a PMS role-permission row and then updates LOV role values. Evidence: `Client/src/lib/components/setup/ConfigManagement.svelte:115-143`, UI trigger `Client/src/lib/components/setup/ConfigManagement.svelte:262-268`.
- This is not a dedicated `/admin/pms/permissions` UI. Current status: integrated into generic setup/config role creation.

### 24.12 Hidden PMS Dependencies Outside PMS Folders

- Authentication/login uses `PmsRolePermission` to derive scope/priority. Evidence: `Server/src/routes/auth.routes.ts:5`, `Server/src/routes/auth.routes.ts:80-84`.
- User hierarchy logic reads `PmsRolePermission` for authority/priority comparisons. Evidence: `Server/src/services/user.service.ts:5`, `Server/src/services/user.service.ts:259-291`.
- PMS UI depends on `employeesApi` for managers/employees in assignment pages. Evidence: legacy assignments page imports `employeesApi`, `Client/src/routes/admin/pms/assignments/+page.svelte:15`; manager load/filter in `Client/src/routes/admin/pms/assignments/+page.svelte:83-104`.
- PMS setup depends on LOV APIs/stores for role configuration. Evidence: `Client/src/lib/components/setup/ConfigManagement.svelte:4-7`, `Client/src/lib/components/setup/ConfigManagement.svelte:115-143`.
- Dashboard redirects depend on global layout/login role logic, not only PMS routes. Evidence: `Client/src/routes/+layout.ts:58-63`, `Client/src/routes/login/controller.ts:36-53`.
- PMS reporting can be affected by generic `ReportService` visibility masking. Evidence: `Server/src/services/reports.service.ts:268-310`.

### 24.13 Database Bootstrap and Model Side Effects

File: `Server/src/config/database.ts`.

- DB connect runs a PMS-specific one-time correction `migrateTemplateStatusesIfNeeded()`. Evidence: function definition `Server/src/config/database.ts:75-99`; invocation `Server/src/config/database.ts:128-129`.
- The migration targets collection `pms_templates`, finds templates with `status: 'ACTIVE'` and missing/null `currentVersionId`, and sets them to `DRAFT`. Evidence: `Server/src/config/database.ts:78-93`.
- After DB connect, it initializes `accessService.initialize()`. Evidence: `Server/src/config/database.ts:131-134`.
- No other PMS-specific DB bootstrap was found in this file. Model indexes remain schema-defined in model files. Current status: PMS bootstrap exists for template status integrity and access permission loading.

### 24.14 Seed/Demo Script

File: `Server/scripts/seed-pms-demo.ts`.

- The script connects to DB and resolves existing active users by roles `admin`, `manager`, and `staff`, falling back to fixed ObjectIds if missing. Evidence: `resolveDemoUsers()`, `Server/scripts/seed-pms-demo.ts:69-95`.
- It creates or reuses annual cycle code `PMS_DEMO_2026` for year 2026, status `DRAFT`. Evidence: constants and `upsertAnnualCycle()`, `Server/scripts/seed-pms-demo.ts:19-20`, `Server/scripts/seed-pms-demo.ts:97-113`.
- It upserts Q1-Q4 quarter cycles with objective and manager review windows equal to quarter dates and status `NOT_STARTED`. Evidence: `upsertQuarterCycles()`, `Server/scripts/seed-pms-demo.ts:115-171`.
- It creates or reuses one annual assignment for the resolved staff employee and manager, annual state `DRAFT`, decision status `DRAFT`, applicable quarters Q1-Q4, reason `FULL_YEAR`. Evidence: `upsertAnnualAssignment()`, `Server/scripts/seed-pms-demo.ts:173-198`.
- It upserts Q1-Q4 quarter assignments in `NOT_STARTED`. Evidence: `upsertQuarterAssignments()`, `Server/scripts/seed-pms-demo.ts:200-230`.
- It seeds one Q1 objective titled `Demo Q1 Objective` with status `OBJECTIVE_DRAFT`, weightage 100, and source `EMPLOYEE_CREATED` if absent. Evidence: `upsertQ1Objective()`, `Server/scripts/seed-pms-demo.ts:232-260`.
- It is idempotent for cycle, quarters, annual assignment, quarter assignments, and objective title checks because it uses find/updateOne upsert or existing checks. Evidence: functions above.
- It does not seed templates, reviews, or annual decisions. Current status: demo-only local script; do not run against production without intent.

### 24.15 PMS Tests

Found PMS tests:

| Test file | Covered behavior | Evidence |
|---|---|---|
| `Server/test/cycle.service.test.ts` | Cycle input validation for Q1-Q4 completeness, quarter dates inside annual cycle, overlapping windows, annual appraisal window timing, relative offset values. | `Server/test/cycle.service.test.ts:1-107` |
| `Server/test/services/quarterReview.service.test.ts` | `PmsScoringService` option scoring, matrix row scoring, legacy option weights, objective bucket scoring, locked template scoring, conditional scoring, normalization/rounding, annual rollup, INCLUDE conditions, comma-separated `IN` values. | `Server/test/services/quarterReview.service.test.ts:1-330` |
| `Server/test/pmsBulkOperations.test.ts` | Bulk operation preview/execute for assignment, reminders, visibility, communication, and close using mocked models/services. | `Server/test/pmsBulkOperations.test.ts:1-321` |

Important gaps:

- Tests found are concentrated on validation/scoring/bulk orchestration. They do not prove full authorization, route integration, persistence, notification delivery, visibility leak prevention across all response shapes, letter-template staleness, or frontend runtime rendering.
- `pmsBulkOperations.test.ts` mocks `PmsCommunicationService` with `dispatchAppraisalLetter`, while current inspected service exposes `sendCommunication()` and not `dispatchAppraisalLetter()`. Evidence: mock in `Server/test/pmsBulkOperations.test.ts:100-105`; real service methods in `Server/src/services/pmsCommunication.service.ts:60-238`. Current status: FE/BE/test mismatch risk.

### 24.16 Legacy `/admin/pms/assignments`

File: `Client/src/routes/admin/pms/assignments/+page.svelte`.

Current behavior:

- Page imports `employeesApi`, `pmsAssignmentsApi`, and `pmsCyclesApi`. Evidence: `Client/src/routes/admin/pms/assignments/+page.svelte:15-17`.
- It has tabs `assignments`, `reassignments`, and `exceptions`. Evidence: `activeTab`, `Client/src/routes/admin/pms/assignments/+page.svelte:25`.
- It loads cycles and managers on mount; managers are users with role manager/admin/director variants. Evidence: `loadInitialData()`, `Client/src/routes/admin/pms/assignments/+page.svelte:83-106`.
- It loads assignment list, exceptions, and reassignment history in parallel for the selected cycle. Evidence: `loadAssignments()`, `Client/src/routes/admin/pms/assignments/+page.svelte:108-130`.
- It supports close, reopen, reassign, resolve exception, and reopen annual appraisal modal actions. Evidence: modal modes and `submitModal()`, `Client/src/routes/admin/pms/assignments/+page.svelte:41-52`, `Client/src/routes/admin/pms/assignments/+page.svelte:161-221`.
- It uses toasts for load/action failures and success. Evidence: `Client/src/routes/admin/pms/assignments/+page.svelte:100-104`, `Client/src/routes/admin/pms/assignments/+page.svelte:176-221`.

Relationship to Assignment Workspace:

- Sidebar exposes “Assignment Workspace” (`/admin/pms/assignment-workspace`) rather than this legacy route. Evidence: `Client/src/lib/components/common/Sidebar.svelte:145-207`.
- Current status: route-live legacy/direct admin page with overlapping functionality. It is a duplicate entry point that may still be usable by URL.

### 24.17 API Client Fallback and Mock Behavior

Cycle API:

- `pmsCyclesApi` imports `mockPmsCycles` and `mockPmsTemplateVersions`, keeps a mutable local `cycles` array, and has mock create/update/transition helpers. Evidence: `Client/src/lib/services/api/pmsCycles.ts:1-23`, `Client/src/lib/services/api/pmsCycles.ts:398-450`.
- `shouldFallbackToMock()` falls back for CORS, failed fetch, network error, and 404 messages. Evidence: `Client/src/lib/services/api/pmsCycles.ts:374-386`.
- Several API methods catch backend errors and return mock data on fallback. Evidence: `Client/src/lib/services/api/pmsCycles.ts:511-518`, `556-559`, `614-616`, `661-662`, `698-699`, `749-780`, `813-814`.
- Risk: backend outages, CORS problems, or missing routes can appear as working UI with local mock data.

Template API:

- `VITE_USE_PMS_TEMPLATE_MOCK === "true"` forces mock fallback. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:40`.
- `templateCache` stores mapped templates and is used to merge/repair version responses. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:317`, `Client/src/lib/services/api/pmsTemplates.ts:1344-1378`.
- `shouldFallbackToMock()` falls back for explicit mock env, CORS, failed fetch, network error, 404, and 500. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:2001-2017`.
- `requestOrFallback()` wraps many template operations. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:2022-2031`.
- Client-side letter-template methods are mock/local version mutations, not proven backend persistence. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:1864-1995`.
- Risk: mock fallback can hide backend validation and server errors, especially for template activation/configuration and letter-template UI remnants.

### 24.18 Gap Matrix Updates From Addendum

Fully implemented additions:

- Quarter assignment transition helper consistently uses `WorkflowService`, saves `WorkflowEvent`, and writes `AuditLog`. Evidence: `Server/src/services/quarter-assignment-workflow.service.ts:23-72`.
- PMS role-permission create/update reloads access permissions. Evidence: `Server/src/routes/pms-role-permission.routes.ts:27-70`.
- DB bootstrap corrects invalid active PMS templates missing `currentVersionId`. Evidence: `Server/src/config/database.ts:75-99`, `Server/src/config/database.ts:128-129`.

Partially implemented additions:

- PMS notifications support email and notification records, but `IN_APP` has no proven real delivery mechanism beyond creating and marking `NotificationEvent`. Evidence: `Server/src/services/pms-notification.service.ts:170-209`.
- PMS communications are implemented, but they use static backend templates rather than the still-present letter-template builder/client methods. Evidence: `Server/src/services/pmsCommunication.service.ts:294-339`; `Client/src/lib/components/pms/templates/LetterTemplateBuilder.svelte:1-224`.
- PMS role-permission management has a generic setup path, not a dedicated PMS permissions screen. Evidence: `Client/src/lib/components/setup/ConfigManagement.svelte:115-143`, `Client/src/lib/components/setup/ConfigManagement.svelte:262-268`.

Not implemented / stale additions:

- Active standalone PMS letter-template management route is not implemented; `/admin/pms/letter-templates` is a removal notice. Evidence: `Client/src/routes/admin/pms/letter-templates/+page.svelte:1-24`.
- Current communication dispatch does not use persisted/custom letter templates. Evidence: `Server/src/services/pmsCommunication.service.ts:294-339`.
- `IN_APP` PMS notification delivery/read UI is not proven. Evidence: `Server/src/services/pms-notification.service.ts:185-197`.

Risky additions:

- `x-pms-current-date` is injected by shared `fetchApi()` for every API request when the store is set, not PMS-only. Evidence: `Client/src/lib/services/api/base.ts:52-71`.
- Several PMS helper services are singleton/direct imports rather than request-scoped container services. Evidence: `Server/src/container/index.ts:107-116`, `Server/src/types/container.ts:87-96`.
- Visibility masking depends on exact field names and configured confidential fields; differently named nested grade/merit values need verification. Evidence: `Server/src/services/visibilityMask.service.ts:6-37`, `Server/src/services/visibilityMask.service.ts:72-79`.
- API mock/fallback behavior can hide backend failures, including 500s for templates. Evidence: `Client/src/lib/services/api/pmsTemplates.ts:2001-2031`; `Client/src/lib/services/api/pmsCycles.ts:374-386`.

Frontend/backend/test mismatch additions:

- `pmsBulkOperations.test.ts` mocks `dispatchAppraisalLetter`, but the real `PmsCommunicationService` exposes `previewCommunication()`, `sendCommunication()`, `resendCommunication()`, and `getHistory()`. Evidence: `Server/test/pmsBulkOperations.test.ts:100-105`; `Server/src/services/pmsCommunication.service.ts:60-238`.
- Letter-template client types/components/methods exist while the route says the flow is removed and backend communication uses static templates. Evidence: `Client/src/lib/types/pmsTemplate.ts:268-304`, `Client/src/routes/admin/pms/letter-templates/+page.svelte:1-24`, `Server/src/services/pmsCommunication.service.ts:294-339`.

API exists but UI missing / hidden additions:

- PMS role-permission API exists and reloads access engine on create/update, but visible management is embedded inside generic setup config role creation rather than a dedicated PMS permissions page. Evidence: `Server/src/routes/pms-role-permission.routes.ts:14-70`, `Client/src/lib/components/setup/ConfigManagement.svelte:115-143`.
- Legacy `/admin/pms/assignments` remains URL-live while sidebar points users to assignment workspace. Evidence: `Client/src/routes/admin/pms/assignments/+page.svelte:1-221`, `Client/src/lib/components/common/Sidebar.svelte:145-207`.
