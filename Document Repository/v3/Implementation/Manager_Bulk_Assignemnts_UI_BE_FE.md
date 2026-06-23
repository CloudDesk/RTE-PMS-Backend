# Manager Bulk Assignment Components UI and Backend Implementation Report

## 1. Scope

This report documents the current implementation of the Manager Bulk Assignment flow for PMS objectives. It covers the frontend UI, frontend API contract, backend routes, backend services, persistence models, validation rules, and runtime behavior.

The feature allows a manager to:

- create manager-owned objectives and save them in a reusable objective library,
- open a bulk assignment modal,
- filter and select eligible employee term records,
- assign one or many manager-created objectives to many selected records,
- adjust manager objective weightage per employee/term record,
- update existing manager-created objective weightage during the same bulk operation,
- handle partial failures without losing successful assignments.

No code behavior is changed by this report.

## 2. Main User Flow

The manager bulk assignment flow starts from the manager objective workspace.

1. Manager opens the objective library modal.
2. Manager creates one or more manager objectives.
3. Objectives are saved into the manager objective library.
4. Manager clicks `Assign` for one objective or `Assign All Objectives` for all saved objectives.
5. Bulk assignment modal opens.
6. Manager searches and filters employees by user, cycle, term, and status.
7. UI separates all records from assignable records.
8. Manager selects eligible assignment records.
9. Manager reviews weightage capacity and fixes any over-100% conflicts.
10. Manager submits bulk assignment.
11. Backend validates each assignment independently.
12. Created objectives are saved as approved manager-created objectives.
13. Success, partial success, or failure is shown in the UI.

## 3. Frontend Entry Point

Primary file:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`

The manager bulk assignment implementation is inside the same workspace component used for employee/manager objective views. The key manager-specific state types are defined near:

- `ObjectiveWorkspace.svelte:117` - `ManagerObjectiveDraft`
- `ObjectiveWorkspace.svelte:122` - bulk weightage issue structures
- `ObjectiveWorkspace.svelte:151` - employee picker group model
- `ObjectiveWorkspace.svelte:176` - bulk objective detail modal model

The implementation is modal-driven:

- Manager Objective Builder modal: `ObjectiveWorkspace.svelte:7843`
- Manager Objective Preview modal: `ObjectiveWorkspace.svelte:7998`
- Bulk Assign modal: `ObjectiveWorkspace.svelte:8066`
- Bulk objective detail modal: `ObjectiveWorkspace.svelte:8920`

Manager entry points in the list view:

- `Objective Library ({managerObjectiveDrafts.length})`: `ObjectiveWorkspace.svelte:4648`
- `Create Manager Objective`: `ObjectiveWorkspace.svelte:4660`

The editor title and helper copy also change for manager-created objectives:

- title becomes `Create Manager Objective`,
- helper text says manager-created objectives become approved immediately.

Code reference:

- `ObjectiveWorkspace.svelte:5418-5438`

## 4. Frontend UI Components and Responsibilities

### 4.1 Manager Objective Builder Modal

Code reference:

- `ObjectiveWorkspace.svelte:7843-7996`

Purpose:

- Displays all saved manager-created objectives for the current manager.
- Lets the manager search saved objectives.
- Allows manager to view, remove, assign one, or assign all objectives.

Displayed columns:

- Objective title and description
- Weight
- KPI
- Due date
- Actions

Actions:

- `View`: opens preview modal.
- `Remove`: removes objective from manager library.
- `Assign`: opens bulk assignment modal for that objective.
- `Assign All Objectives`: opens bulk assignment modal for every saved manager objective.

Important behavior:

- If backend library fetch fails, UI can still show local cached data and displays a warning.
- Removing an objective persists the updated library to backend.

### 4.2 Objective Preview Modal

Code reference:

- `ObjectiveWorkspace.svelte:7998-8064`

Purpose:

- Lets manager inspect a saved objective before assignment.

Shown data:

- Objective title
- Weightage
- Due date
- Description
- KPI / measurement
- Target value
- Success criteria

Main action:

- `Assign objective to employees`

### 4.3 Bulk Assignment Modal

Code reference:

- `ObjectiveWorkspace.svelte:8066-8918`

Purpose:

- Main UI for selecting employee term records and assigning manager objectives in bulk.

Top message:

- `Manager-created objectives are approved immediately.`

Layout:

- Left/main section: filters, employee grouping, selectable assignment records, validation messages.
- Right sidebar: objectives being assigned, default weights, selected record capacity.
- Footer: cancel and submit.

### 4.4 Employee Search and Selection

Code references:

- `buildAssignmentPickerEmployeeOptions`: `ObjectiveWorkspace.svelte:2519`
- `matchesAssignmentPickerEmployeeSearch`: `ObjectiveWorkspace.svelte:2623`
- employee dropdown UI: `ObjectiveWorkspace.svelte:8100-8217`

Search supports:

- employee name,
- employee code,
- department,
- designation,
- manager name,
- initials,
- aggregate searchable text.

The dropdown highlights selected users using:

- selected checkbox icon,
- selected row background,
- `Selected` badge.

Selected employees also appear as removable chips above the dropdown input.

### 4.5 Filters

Code references:

- cycle filter data: `ObjectiveWorkspace.svelte:1824`
- term/quarter filter data: `ObjectiveWorkspace.svelte:1829`
- status filter data: `ObjectiveWorkspace.svelte:1834`
- UI controls: `ObjectiveWorkspace.svelte:8220-8245`

Available filters:

- Employee/user picker
- Cycle
- Quarter / assessment term
- Status

There are two tabs:

- `All`
- `Assignable`

Code reference:

- `ObjectiveWorkspace.svelte:8248-8273`

The `Assignable` tab only shows records that can currently receive manager-created objectives.

### 4.6 Assignment Grouping

Code references:

- `AssignmentPickerGroup`: `ObjectiveWorkspace.svelte:151`
- group toggle: `ObjectiveWorkspace.svelte:2993`
- grouped UI: `ObjectiveWorkspace.svelte:8376`

Records are grouped by employee. Each employee group can contain multiple assignment records because a user can have records across cycles and terms.

Each employee group displays:

- employee avatar initials,
- employee name,
- employee code,
- department,
- designation,
- number of cycle records,
- number of assignable records,
- selected / partial selected state.

### 4.7 Individual Assignment Record Row

Code reference:

- row UI starts around `ObjectiveWorkspace.svelte:8443`

Each assignment row shows:

- cycle name,
- term/quarter,
- workflow state,
- record number inside employee group,
- short assignment reference,
- availability label,
- available manager objective capacity,
- count of existing manager-created objectives,
- new objective status,
- assignment-specific weightage context.

Rows are selectable only when the record is assignable.

### 4.8 Bulk Objective Detail Modal

Code reference:

- `ObjectiveWorkspace.svelte:8920-9106`

Purpose:

- Provides detailed context for a new objective being assigned or an existing manager-created objective on a selected record.

Shown data:

- new/existing objective chip,
- cycle and term,
- assignment availability,
- employee and record state,
- objective weightage,
- existing manager weightage,
- available capacity,
- after-assignment weightage,
- over/remaining amount,
- objective name,
- description,
- KPI,
- target value,
- due date,
- assignment status,
- success criteria,
- record context.

This is important because bulk assignment can affect multiple employee records with different existing manager-created objective weights.

## 5. Frontend Eligibility Rules

Primary function:

- `isBulkManagerAssignmentEligible`: `ObjectiveWorkspace.svelte:1536`

A record is bulk-manager-assignable only when all of these are true:

- current workspace mode is manager,
- objective config is not `PREDEFINED`,
- template config allows manager-created objectives,
- term state is in the manager objective creation state set,
- objective-setting window is currently open.

The exact frontend state allow-list is:

```ts
const managerObjectiveCreateQuarterStates = new Set([
  "NOT_STARTED",
  "OBJECTIVE_SETTING_OPEN",
  "OBJECTIVE_DRAFT",
  "OBJECTIVE_REVISION_REQUIRED",
  "REOPENED_BY_ADMIN",
]);
```

Code reference:

- `managerObjectiveCreateQuarterStates`: `ObjectiveWorkspace.svelte:1366-1378`

Important interpretation:

- The state allow-list alone is not enough.
- The objective-setting window must also be active.
- This prevents a record from becoming assignable only because it is technically in a permissive state.

Additional duplicate prevention:

- `isBulkAssignmentSelectable`: `ObjectiveWorkspace.svelte:2938`
- `getAlreadyAssignedSelectedObjectives`: `ObjectiveWorkspace.svelte:2925`

The UI prevents selecting an assignment if one of the selected objectives already exists on that assignment record by normalized title.

Not-assignable reasons are centralized in:

- `getAssignmentNotAssignableReason`: `ObjectiveWorkspace.svelte:2734`

Reasons include:

- selected objective already exists on this record,
- record uses predefined-only objectives,
- template does not allow manager-created objectives,
- current workflow status is not objective setting,
- objective-setting window is not open.

The visible availability label is produced separately by:

- `getAssignmentAvailabilityLabel`: `ObjectiveWorkspace.svelte:3013-3028`

It maps records to:

- `Already assigned`
- `Assignable`
- `Predefined only`
- `Manager objective not allowed`
- `Not in objective setting`
- `Outside objective window`
- `Unavailable`

## 6. Frontend Weightage Management

The UI treats manager-created objectives as a separate manager-owned bucket with a maximum of 100%.

Key functions:

- `getExistingManagerObjectives`: `ObjectiveWorkspace.svelte:2916`
- `getExistingManagerObjectiveWeightage`: `ObjectiveWorkspace.svelte:3562`
- `getBulkAssignmentAvailableWeightage`: `ObjectiveWorkspace.svelte:3570`
- `getBulkAssignmentAssigningWeightage`: `ObjectiveWorkspace.svelte:3577`
- `getBulkAssignmentNextWeightage`: `ObjectiveWorkspace.svelte:3590`
- `getBulkAssignmentRemainingWeightage`: `ObjectiveWorkspace.svelte:3597`

Validation state:

- objective default weight must be between 0 and 100,
- existing manager objective weight override must be between 0 and 100,
- per-assignment new objective override must be between 0 and 100,
- existing manager-created objective weight + new assigning weight cannot exceed 100.

Submit button is enabled only when:

- at least one assignment is selected,
- at least one objective is selected,
- no default objective weightage issue exists,
- no existing objective weightage issue exists,
- no per-record new objective weightage issue exists,
- no selected record exceeds 100%.

Code reference:

- `canSubmitBulkAssignment`: `ObjectiveWorkspace.svelte:2050`

## 7. Frontend Submission Flow

Primary submit function:

- `handleBulkAssignManagerObjective`: `ObjectiveWorkspace.svelte:3957`

Before calling backend, it validates:

- at least one employee/assignment selected,
- at least one objective selected,
- no objective default weightage issues,
- no existing objective override issues,
- no per-assignment objective override issues,
- no total weightage over-cap issues.

Payload data is prepared by:

- `getBulkWeightageAdjustmentsForSubmission`: `ObjectiveWorkspace.svelte:3604`
- `getBulkObjectiveWeightageOverridesForSubmission`: `ObjectiveWorkspace.svelte:3639`

After backend response:

- success toast shows created and updated counts,
- failure toast shows first failure reason if nothing was created,
- partial failure keeps only failed assignment IDs selected,
- failed objective IDs remain in the assignment modal,
- successful assignments are refreshed from backend,
- modal closes only when no failures remain.

### 7.1 Frontend Validation and Error Source Details

The bulk assignment UI has two levels of frontend validation:

- immediate UI eligibility validation before a record can be selected,
- submit-time validation before the API call is sent.

The validation is intentionally defensive. A manager should usually understand why a record cannot be selected before clicking submit.

| Validation | Where It Happens | User-Facing Result | Why It Happens |
|---|---|---|---|
| No assignment selected | `handleBulkAssignManagerObjective`, `ObjectiveWorkspace.svelte:3957` | Toast: `Select at least one eligible employee.` | Submit button/action was triggered without any selected eligible records. |
| No objective selected | `handleBulkAssignManagerObjective`, `ObjectiveWorkspace.svelte:3967` | Toast: `Select at least one objective to assign.` | The assignment modal needs at least one saved manager objective. |
| Objective default weight invalid | `assigningObjectiveWeightageIssues`, `ObjectiveWorkspace.svelte:1974` | Validation panel + submit disabled | Objective default weightage must be numeric and between 0 and 100. |
| Existing manager objective weight invalid | `existingObjectiveWeightageIssues`, `ObjectiveWorkspace.svelte:1996` | Validation panel + submit disabled | Existing objective weightage edits must stay between 0 and 100. |
| Per-record new objective weight invalid | `assignmentObjectiveWeightageIssues`, `ObjectiveWorkspace.svelte:2014` | Validation panel + submit disabled | Per-assignment override weightage must stay between 0 and 100. |
| Manager objective total over 100 | `bulkAssignWeightageIssues`, `ObjectiveWorkspace.svelte:2032` | Validation panel + submit disabled | Existing manager-created objective total plus new objectives exceeds 100%. |
| Record already has selected objective | `getAlreadyAssignedSelectedObjectives`, `ObjectiveWorkspace.svelte:2925` | Record is not selectable and reason is shown | Prevents duplicate manager-created objective title on the same assignment record. |
| Template predefined-only | `getAssignmentNotAssignableReason`, `ObjectiveWorkspace.svelte:2751` | Record is not selectable | Template config does not allow adding manager objectives. |
| Manager-created disabled | `getAssignmentNotAssignableReason`, `ObjectiveWorkspace.svelte:2757` | Record is not selectable | Template config says `allowManagerCreated` is false. |
| Wrong workflow state | `getAssignmentNotAssignableReason`, `ObjectiveWorkspace.svelte:2763` | Record is not selectable | Manager objectives can only be added during objective-setting state. |
| Objective-setting window closed | `getAssignmentNotAssignableReason`, `ObjectiveWorkspace.svelte:2769` | Record is not selectable | Current date is not inside objective-setting window. |

Frontend submit-time code shape:

```ts
if (selectedAssignAssignments.length === 0) toast.error("Select at least one eligible employee.");
if (assigningObjectiveDrafts.length === 0) toast.error("Select at least one objective to assign.");
if (assigningObjectiveWeightageIssues.length > 0) toast.error("Fix objective weightage before assigning.");
if (existingObjectiveWeightageIssues.length > 0) toast.error("Fix existing objective weightage before assigning.");
if (assignmentObjectiveWeightageIssues.length > 0) toast.error("Fix record objective weightage before assigning.");
if (bulkAssignWeightageIssues.length > 0) toast.error("Selected objectives exceed available manager-objective weightage...");
```

Reference:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:3957-4005`

### 7.2 Frontend Partial Failure Behavior

When backend returns a partial failure, the frontend does not discard successful work.

Current behavior:

1. `createdItems`, `updatedItems`, and `failedItems` are read from backend response.
2. Success toast includes created count and updated weightage count.
3. If failures exist, `bulkAssignFailures` is populated and shown in the modal.
4. Only failed assignment IDs remain selected.
5. If backend returned `clientObjectiveId`, only failed objectives remain in `assigningObjectiveDrafts`.
6. If there are no failures, the modal closes.
7. Workspace data is refreshed.

Code shape:

```ts
const createdItems = response.data?.created || [];
const updatedItems = response.data?.updated || [];
const failedItems = response.data?.failed || [];

bulkAssignFailures = failedItems;
bulkAssignCreatedCount = createdItems.length;

selectedAssignAssignmentIds =
  failedCount > 0
    ? selectedAssignAssignments
        .filter((assignment) => failedIds.has(assignment.quarterAssignmentId))
        .map((assignment) => assignment.id)
    : [];

if (failedObjectiveIds.size > 0) {
  assigningObjectiveDrafts = assigningObjectiveDrafts.filter((objective) =>
    failedObjectiveIds.has(objective.localId),
  );
}

if (failedCount === 0) closeBulkModal();
await refreshWorkspace();
```

Reference:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:4045-4109`

## 8. Frontend API Layer

Primary file:

- `Client/src/lib/services/api/pmsObjectives.ts`

Important types:

- `ObjectiveDraftInput`: `pmsObjectives.ts:21`
- `ManagerObjectiveLibraryDraft`: `pmsObjectives.ts:37`
- `BulkManagerObjectiveResult`: `pmsObjectives.ts:44`
- `BulkManagerObjectiveWeightageAdjustment`: `pmsObjectives.ts:70`
- `BulkManagerObjectiveWeightageOverride`: `pmsObjectives.ts:76`

Bulk assignment API call:

- `bulkAssignManagerObjectives`: `pmsObjectives.ts:259`

Other API calls used by this feature:

- `listAssignments(mode)`: `pmsObjectives.ts:175`
- `listManagerObjectiveLibrary()`: `pmsObjectives.ts:179`
- `saveManagerObjectiveLibrary(objectives)`: `pmsObjectives.ts:185`

API method content:

```ts
listAssignments: async (mode: ObjectiveWorkspaceMode) => {
  return listAssignmentsFromBackend(mode);
}
```

```ts
listManagerObjectiveLibrary: async () => {
  return fetchApi<BackendResponse<ManagerObjectiveLibraryDraft[]>>(
    `${OBJECTIVE_ENDPOINT}/manager-library`,
  );
}
```

```ts
saveManagerObjectiveLibrary: async (objectives: ManagerObjectiveLibraryDraft[]) => {
  return fetchApi<BackendResponse<ManagerObjectiveLibraryDraft[]>>(
    `${OBJECTIVE_ENDPOINT}/manager-library`,
    {
      method: "PUT",
      body: JSON.stringify({ objectives }),
    },
  );
}
```

Request payload shape:

```json
{
  "quarterAssignmentIds": ["..."],
  "objectives": [
    {
      "clientObjectiveId": "...",
      "title": "...",
      "description": "...",
      "targetMetric": "...",
      "targetValue": "...",
      "targetDate": "...",
      "weightage": 20,
      "successCriteria": "...",
      "attachments": [],
      "objectiveValues": []
    }
  ],
  "weightageAdjustments": [
    {
      "quarterAssignmentId": "...",
      "objectiveId": "...",
      "weightage": 30
    }
  ],
  "objectiveWeightageOverrides": [
    {
      "quarterAssignmentId": "...",
      "clientObjectiveId": "...",
      "objectiveIndex": 0,
      "weightage": 25
    }
  ]
}
```

Notes:

- The frontend still uses `quarterAssignmentId` naming because the objective module uses that model field for term assignment records.
- `clientObjectiveId` is sent so backend failures can be mapped back to a specific unsaved library objective in the UI.
- The frontend removes single-objective `quarterAssignmentId` from each draft and sends assignment IDs only in the top-level `quarterAssignmentIds` array.

Assignment response sanitization:

- `sanitizeAssignment`: `pmsObjectives.ts:83-125`

This function normalizes backend assignment records before the UI uses them.

Important defaults applied by the frontend:

```ts
objectiveConfig: {
  mode: assignment.objectiveConfig?.mode ?? "DYNAMIC",
  allowEmployeeCreated: assignment.objectiveConfig?.allowEmployeeCreated !== false,
  allowManagerCreated: assignment.objectiveConfig?.allowManagerCreated !== false,
  predefinedObjectives: assignment.objectiveConfig?.predefinedObjectives ?? [],
}
```

Important objective normalization:

```ts
backendId: objective.backendId ?? objective.id,
assignmentId: objective.assignmentId ?? assignment.id,
quarterAssignmentId: objective.quarterAssignmentId ?? assignment.quarterAssignmentId,
employeeId: objective.employeeId ?? assignment.employeeId,
assignedManagerId: objective.assignedManagerId ?? assignment.managerId,
comments: objective.comments ?? [],
objectiveValues: objective.objectiveValues ?? [],
attachments: objective.attachments ?? [],
```

Seeded predefined objective records are normalized as already approved:

```ts
status: isSeeded ? "OBJECTIVE_APPROVED" : objective.status,
```

Code reference:

- `isSeededPredefinedObjective`: `pmsObjectives.ts:127-133`

Frontend draft to backend objective payload mapping:

- `toBackendObjectivePayload`: `pmsObjectives.ts:135-158`

Important mapping content:

```ts
title: draft.title.trim(),
description: draft.description.trim(),
targetMetric: draft.kpi?.trim(),
targetValue: draft.targetValue?.trim(),
targetDate: draft.dueDate || undefined,
successCriteria: draft.successCriteria?.trim(),
attachments: draft.attachments?.map(...),
objectiveValues: draft.objectiveValues ?? [],
```

This matters in another branch because UI names use `kpi` and `dueDate`, while backend objective fields use `targetMetric` and `targetDate`.

### 8.1 Frontend Local Cache and Sync Behavior

The manager objective library has local browser cache support. This avoids losing saved manager objective drafts if the server call fails temporarily.

State owned by `ObjectiveWorkspace.svelte`:

```ts
let managerObjectiveDrafts: ManagerObjectiveDraft[] = [];
let managerObjectiveLibraryUserId = "";
let managerObjectiveLibraryLoaded = false;
let managerObjectiveLibraryLoading = false;
let savingObjectiveLibrary = false;
let managerObjectiveLibraryError = "";
```

Reference:

- `ObjectiveWorkspace.svelte:300-312`

When the logged-in manager changes, the local library state is reset:

```ts
$: if (mode === "manager" && currentUserId !== managerObjectiveLibraryUserId) {
  managerObjectiveLibraryUserId = currentUserId;
  managerObjectiveLibraryLoaded = false;
  managerObjectiveLibraryLoading = false;
  managerObjectiveLibraryError = "";
  managerObjectiveDrafts = [];
}
```

Reference:

- `ObjectiveWorkspace.svelte:378-384`

The localStorage key is user-specific:

```ts
function managerObjectiveLibraryKey() {
  const userId = currentUser?._id;
  return `pms:manager-objective-library:${userId}`;
}
```

Reference:

- `ObjectiveWorkspace.svelte:2287-2292`

Load behavior:

1. Read local cache first.
2. Call `GET /pms/objectives/manager-library`.
3. If server has objectives, server wins and local cache is updated.
4. If server is empty but local cache has data, local data is shown and a background save is attempted.
5. If server call fails, local cache is used and `managerObjectiveLibraryError` is shown in the library modal.

Code references:

- read local cache: `ObjectiveWorkspace.svelte:2317-2343`
- load and sync library: `ObjectiveWorkspace.svelte:2346-2401`
- save and update local cache: `ObjectiveWorkspace.svelte:2404-2434`

This cache behavior is part of the feature because the Manager Objective Builder modal can show:

- `Library is using local cache. Server sync failed: <error>`

Code reference:

- `ObjectiveWorkspace.svelte:7889-7892`

## 9. Backend Routes

Primary file:

- `Server/src/routes/objective.routes.ts`

Relevant endpoints:

- `POST /pms/objectives/bulk-manager`: `objective.routes.ts:33`
- `GET /pms/objectives/manager-library`: `objective.routes.ts:48`
- `PUT /pms/objectives/manager-library`: `objective.routes.ts:61`
- `GET /pms/objectives/assignments?mode=manager`: `objective.routes.ts:76`

All routes use authentication middleware.

## 10. Backend Service Layer

Primary file:

- `Server/src/services/objective.service.ts`

### 10.1 Manager Objective Library

Read:

- `listManagerObjectiveLibrary`: `objective.service.ts:300`

Write:

- `saveManagerObjectiveLibrary`: `objective.service.ts:309`

Normalize item:

- `normalizeManagerObjectiveLibraryItem`: `objective.service.ts:2043`

Map item back to response:

- `mapManagerObjectiveLibraryItem`: `objective.service.ts:2081`

The backend stores one manager library document per manager. Saving the library replaces the manager’s entire objectives array.

### 10.2 Assignment Listing for Manager Mode

Function:

- `listAssignments`: `objective.service.ts:329`

Manager mode behavior:

- filters term assignment records by `assignedManagerId`,
- includes active delegation records for `PMS_OBJECTIVES`,
- loads annual assignments,
- loads term/cycle records,
- ensures predefined objectives are seeded where needed,
- loads objectives, comments, and objective values,
- builds objective config per assignment,
- returns enriched assignment records for UI.

Delegation logic:

- active delegations can include records where the current actor is acting for another manager,
- optional delegation cycle restriction is respected.

Returned manager assignment record shape:

- response mapper: `objective.service.ts:423-481`

Important response fields:

```ts
{
  id,
  annualAssignmentId,
  quarterAssignmentId,
  cycleId,
  cycleName,
  quarter,
  assessmentTermType,
  termCode,
  termLabel,
  quarterState,
  quarterWindows,
  employeeId,
  employeeName,
  employeeCode,
  employeeNo,
  designation,
  employeeDesignation,
  department,
  departmentId,
  managerId,
  managerName,
  objectiveWeightageCap: 100,
  backendConnected: true,
  templateVersionId,
  objectiveConfig,
  objectives,
}
```

The frontend bulk UI depends on this exact enriched shape for grouping, filtering, eligibility, objective display, and weightage validation.

### 10.3 Bulk Create Manager Objectives

Main function:

- `bulkCreateManagerObjectives`: `objective.service.ts:644`

High-level steps:

1. De-duplicate `quarterAssignmentIds`.
2. Resolve objective inputs.
3. Group existing objective weightage adjustments by assignment.
4. Group new objective weightage overrides by assignment.
5. Process each assignment independently.
6. Load term assignment and annual assignment.
7. Load objective configuration for the assignment.
8. Ensure selected source is `MANAGER_CREATED`.
9. Ensure matching objective bucket exists.
10. Ensure bucket owner is manager.
11. Validate actor is assigned manager, active delegate, or admin.
12. Check assignment access.
13. Check objective-setting window.
14. Validate template config allows manager-created objectives.
15. Move assignment from `NOT_STARTED` to `OBJECTIVE_SETTING_OPEN` if needed.
16. Apply delegation audit context if actor is delegate.
17. Prepare existing objective weightage adjustments.
18. Apply per-assignment new objective weightage overrides.
19. Validate total manager objective weightage does not exceed 100.
20. Save existing objective weight updates.
21. Create each new objective.
22. Persist attachments.
23. Persist objective custom values.
24. Audit created/updated records.
25. Update quarter/term state after approval if anything was created.
26. Return created, updated, and failed arrays.

New manager-created objectives are saved with:

- `source: MANAGER_CREATED`
- `status: OBJECTIVE_APPROVED`
- `approvedAt: new Date()`
- `approvedBy: actor`

Code reference:

- objective create payload: `objective.service.ts:773`

This means manager-created objectives do not wait for an employee submit/manager approve cycle. They become approved immediately once assigned.

Bulk result shape:

- `BulkCreateManagerObjectiveResult`: `objective.service.ts:268-292`

```ts
{
  created: Array<{
    quarterAssignmentId: string;
    objectiveId: string;
    employeeId: string;
    employeeName?: string;
    objectiveTitle: string;
    clientObjectiveId?: string;
  }>;
  updated: Array<{
    quarterAssignmentId: string;
    objectiveId: string;
    objectiveTitle: string;
    previousWeightage?: number;
    weightage?: number;
  }>;
  failed: Array<{
    quarterAssignmentId: string;
    employeeId?: string;
    employeeName?: string;
    objectiveTitle?: string;
    clientObjectiveId?: string;
    reason: string;
  }>;
}
```

Default objective config:

- `getDefaultObjectiveConfig`: `objective.service.ts:1445-1452`
- `defaultObjectiveBuckets`: `objective.service.ts:1455-1490`

When the template has no specific objective config, backend falls back to:

```ts
{
  mode: "DYNAMIC",
  allowEmployeeCreated: true,
  allowManagerCreated: true,
  predefinedObjectives: [],
  objectiveBuckets: defaultObjectiveBuckets(),
}
```

Default buckets:

- `template_predefined`: owner `SYSTEM`, weightage `20`, auto-approved.
- `employee_dynamic`: owner `EMPLOYEE`, weightage `50`, requires manager approval.
- `manager_dynamic`: owner `MANAGER`, weightage `30`, auto-approved.

Bulk manager assignment specifically resolves the `MANAGER_CREATED` source into the manager-owned bucket and rejects the request if the bucket is missing or owned by another role.

## 11. Backend Validation and Safety

### 11.1 Template Objective Config

Function:

- `validateCreateAgainstConfig`: `objective.service.ts:2028`

Rules:

- predefined-only config blocks manager-created objectives,
- employee-created objectives require `allowEmployeeCreated`,
- manager-created objectives require `allowManagerCreated`.

Bulk manager assignment also checks that the resolved bucket owner is `MANAGER`.

Code reference:

- bucket owner validation: `objective.service.ts:679-684`

### 11.2 Actor Authorization

Code reference:

- `objective.service.ts:686-695`

Allowed actors:

- assigned manager,
- active delegate for assigned manager,
- admin.

The flow also calls:

- `assertAssignmentAccess('objective.create', quarterAssignment)`

Code reference:

- `objective.service.ts:697`

### 11.3 Objective Window Guard

Code reference:

- `objective.service.ts:698`

The backend requires the objective-setting window to be active before creating manager objectives.

This mirrors the frontend eligibility check but is stronger because it cannot be bypassed by a crafted API call.

### 11.4 Weightage Guard

Existing objective adjustments:

- `prepareBulkManagerWeightageAdjustments`: `objective.service.ts:2190`

New objective overrides:

- `groupBulkObjectiveWeightageOverrides`: `objective.service.ts:2118`
- `applyBulkObjectiveWeightageOverrides`: `objective.service.ts:2137`

Total cap:

- `assertBulkManagerObjectiveWeightageTotal`: `objective.service.ts:2250`

Backend validates:

- changed existing objective belongs to the selected assignment,
- changed weightage is between 0 and 100,
- new objective override weightage is between 0 and 100,
- existing manager objective total plus new objective total does not exceed 100.

This duplicates the frontend check intentionally, because backend remains the source of truth.

### 11.5 Backend Validation and Error Source Details

Backend validation is the final source of truth. Even if the frontend is bypassed, backend prevents invalid objective creation.

| Backend Validation | Code Reference | Error Message / Failure Reason | Trigger |
|---|---|---|---|
| No assignment IDs | `objective.service.ts:647-650` | `At least one quarter assignment is required` | API payload has empty or missing `quarterAssignmentIds`. |
| No objectives | `objective.service.ts:652-655` | `At least one objective is required` | API payload has no `objectives` and no single objective body. |
| No matching bucket | `objective.service.ts:677-681` | `No matching objective bucket configuration found for source: MANAGER_CREATED` | Template objective config has no manager-created bucket. |
| Bucket not manager-owned | `objective.service.ts:682-684` | `Bulk assignment can create objectives only in manager-owned buckets` | Config maps manager-created source to a non-manager owner. |
| Actor not allowed | `objective.service.ts:686-695` | `Only the manager or their delegate can assign manager objectives` | Logged-in user is not assigned manager, active delegate, or admin. |
| Assignment access denied | `objective.service.ts:697` | Access-service-specific error | Role/policy does not allow `objective.create`. |
| Objective window not open | `objective.service.ts:698` | Window assertion error | Current date is outside objective-setting window. |
| Template predefined-only | `objective.service.ts:2030-2032` | `Only predefined objectives are allowed for this assignment` | Template mode is `PREDEFINED`. |
| Manager-created disabled | `objective.service.ts:2038-2040` | `Manager-created objectives are not allowed for this assignment` | Template config has `allowManagerCreated = false`. |
| Existing adjustment objective mismatch | `objective.service.ts:2220-2225` | `Weightage adjustment objective must belong to the selected assignment` | Payload tries to update an objective from another assignment. |
| Existing objective weight invalid | `objective.service.ts:2227-2230` | `Weightage for "<title>" must be between 0 and 100` | Existing objective override is outside 0-100 or not numeric. |
| New objective override invalid | `objective.service.ts:2146-2150` | `Objective assignment weightage must be between 0 and 100` | Per-assignment new objective override is outside 0-100 or not numeric. |
| Total manager objective weight over 100 | `objective.service.ts:2250-2265` | `Manager objective weightage for assignment <id> cannot exceed 100% (currently <value>%)` | Existing manager objective total plus new objective total exceeds 100. |
| Objective input invalid | `objective.service.ts:760-763` | Input-validation-specific error | Required objective data is missing or malformed. |
| Per-objective rule violation | `objective.service.ts:764-771` | Objective-rule-specific error | Assignment/template rules reject this objective or weightage. |

Important implementation detail:

- Assignment-level errors are captured in the outer `catch`.
- Objective-level errors are captured in the inner `catch`.
- This is why one objective can fail while another objective or assignment succeeds.

Backend error handling shape:

```ts
for (const quarterAssignmentId of quarterAssignmentIds) {
  try {
    // assignment-level validation
    // existing weightage adjustment validation

    for (const objectiveInput of objectiveInputsForAssignment) {
      try {
        // objective-level validation and create
      } catch (error) {
        failed.push({
          quarterAssignmentId,
          employeeId,
          employeeName,
          objectiveTitle: objectiveInput.title,
          clientObjectiveId: objectiveInput.clientObjectiveId,
          reason,
        });
      }
    }
  } catch (error) {
    failed.push({
      quarterAssignmentId,
      employeeId,
      employeeName,
      reason,
    });
  }
}
```

Reference:

- `Server/src/services/objective.service.ts:668-849`

### 11.6 Partial Failure Handling

Backend returns three arrays:

- `created`
- `updated`
- `failed`

Code reference:

- result object returned at `objective.service.ts:851`

An outer assignment-level failure records the assignment ID and reason.

An inner objective-level failure records:

- assignment ID,
- employee ID,
- employee name,
- objective title,
- client objective ID,
- failure reason.

The frontend uses `clientObjectiveId` to keep failed objectives visible for retry.

### 11.7 Backend Response Contract

Successful or partially successful bulk assignment returns:

```json
{
  "created": [
    {
      "quarterAssignmentId": "assignment id",
      "objectiveId": "created objective id",
      "employeeId": "employee id",
      "employeeName": "employee name",
      "objectiveTitle": "objective title",
      "clientObjectiveId": "frontend local objective id"
    }
  ],
  "updated": [
    {
      "quarterAssignmentId": "assignment id",
      "objectiveId": "existing objective id",
      "objectiveTitle": "objective title",
      "previousWeightage": 20,
      "weightage": 30
    }
  ],
  "failed": [
    {
      "quarterAssignmentId": "assignment id",
      "employeeId": "employee id when known",
      "employeeName": "employee name when known",
      "objectiveTitle": "objective title when objective-level failure",
      "clientObjectiveId": "frontend local objective id when known",
      "reason": "human-readable failure reason"
    }
  ]
}
```

Meaning:

- `created` means new manager-created objective rows were inserted into `objectives`.
- `updated` means existing manager-created objective weightage was changed.
- `failed` means assignment-level or objective-level validation failed.

The frontend uses this response to show:

- success count,
- weightage update count,
- failed record/objective details,
- retry state.

## 12. Persistence Models

### 12.1 Manager Objective Library Model

File:

- `Server/src/models/pms-manager-objective-library.model.ts`

Collection:

- `pms_manager_objective_libraries`

Model shape:

- `managerId`
- `objectives[]`

Objective library item fields:

- `localId`
- `source`
- `title`
- `description`
- `kpi`
- `targetValue`
- `dueDate`
- `weightage`
- `successCriteria`
- `attachments`
- `objectiveValues`
- `createdAt`
- `updatedAt`

Code references:

- interface: `pms-manager-objective-library.model.ts:4`
- item schema: `pms-manager-objective-library.model.ts:27`
- manager unique index: `pms-manager-objective-library.model.ts:52`
- collection name: `pms-manager-objective-library.model.ts:65`

### 12.2 Objective Model

File:

- `Server/src/models/pms-objective.model.ts`

Collection:

- `objectives`

Important fields for bulk assignment:

- `quarterAssignmentId`
- `annualAssignmentId`
- `cycleId`
- `templateVersionId`
- `quarterCode`
- `employeeId`
- `assignedManagerId`
- `objectiveNo`
- `source`
- `title`
- `description`
- `targetMetric`
- `targetValue`
- `targetDate`
- `weightage`
- `successCriteria`
- `status`
- `attachments`
- `createdByRole`
- `createdByUserId`
- `createdBy`
- `actingDelegateUserId`
- `originalOwnerUserId`
- `approvedAt`
- `approvedBy`

Code references:

- interface: `pms-objective.model.ts:17`
- schema begins: `pms-objective.model.ts:66`
- `quarterAssignmentId`: `pms-objective.model.ts:68`
- `source`: `pms-objective.model.ts:106`
- `weightage`: `pms-objective.model.ts:131`
- `status`: `pms-objective.model.ts:133`
- assignment index: `pms-objective.model.ts:177`

Terminology note:

- The objective service and model still use `quarterAssignmentId` and `quarterCode` naming.
- In the newer product language, these represent assessment term assignment and term code. The report keeps current code names for accuracy.

## 13. Audit Events

Bulk assignment emits audit events when data changes.

Existing objective weightage update:

- `PMS_MANAGER_OBJECTIVE_BULK_WEIGHTAGE_UPDATED`
- Code reference: `objective.service.ts:742`

New manager objective creation:

- `PMS_MANAGER_OBJECTIVE_BULK_CREATED_AND_APPROVED`
- Code reference: `objective.service.ts:808`

These events help trace manager bulk assignment changes after the fact.

## 14. Current UX Safeguards

The current UI includes these safeguards:

- clear empty library state,
- search inside saved manager objectives,
- selected employee chips,
- selectable and non-selectable assignment states,
- `All` vs `Assignable` tabs,
- “Select visible assignable records” control,
- visible assignable count,
- record capacity chip,
- duplicate objective prevention,
- weightage validation panel,
- partial failure panel,
- default assignment weightage editor,
- per-record weightage override support,
- existing manager objective weightage adjustment support,
- detail modal with exact not-assignable reason,
- submit button disabled until valid.

## 15. Current Backend Safeguards

The backend independently enforces:

- authenticated access,
- manager/delegate/admin authorization,
- assignment access policy,
- objective-setting window guard,
- objective config guard,
- manager-owned bucket guard,
- weightage value range,
- total manager-created objective weightage cap,
- object ownership for existing weightage adjustments,
- per-assignment partial failure isolation.

## 16. Known Design Choices

### 16.1 Manager-Created Objectives Auto-Approve

Manager-created objectives are created with `OBJECTIVE_APPROVED`.

Reason:

- the manager is the creator and approver,
- these are meant to be assigned directly into an employee’s approved objective set,
- the UI explicitly tells the manager this before submission.

### 16.2 Saved Objective Library Is Separate From Assigned Objectives

The library stores reusable drafts. Removing from the library does not remove objectives already assigned to employees.

Reason:

- assigned objectives are real employee assignment records,
- library objectives are reusable source templates for future assignment,
- deleting from the library should not mutate historical or active employee objectives.

### 16.3 Duplicate Prevention Uses Objective Title

Frontend checks selected objective titles against existing manager-created objectives.

Reason:

- saved library objectives are reusable drafts and do not have assigned objective IDs yet,
- title normalization provides a practical duplicate guard before backend creation.

Potential limitation:

- Two different objectives with the same title cannot be assigned to the same record through the bulk UI.

### 16.4 Weightage Is Manager Objective Bucket Level

The current flow treats existing manager-created objective weightage plus new manager-created objective weightage as a capped total.

This is separate from predefined/employee-created objective logic, because only manager-created objectives are relevant to this bulk operation.

## 17. End-to-End Data Sequence

### 17.1 Save Objective to Library

1. Manager creates objective draft in frontend.
2. Frontend validates draft.
3. Frontend appends draft to `managerObjectiveDrafts`.
4. Frontend calls `PUT /pms/objectives/manager-library`.
5. Backend normalizes each library item.
6. Backend upserts one library document for the manager.
7. Frontend receives normalized library list.

### 17.2 Open Bulk Assignment

1. Manager selects one or many saved objectives.
2. Frontend copies selected objectives into `assigningObjectiveDrafts`.
3. Frontend resets assignment filters and selected IDs.
4. Bulk assignment modal opens.
5. Existing assignment records already loaded by `GET /pms/objectives/assignments?mode=manager` are used for filtering and grouping.

### 17.3 Select Assignment Records

1. Manager filters by employee, cycle, term, or status.
2. UI calculates assignable records.
3. Manager selects individual records, whole employee groups, or visible assignable records.
4. UI calculates available manager-objective capacity per selected record.
5. UI blocks submit if any selected record exceeds weightage cap.

### 17.4 Submit Bulk Assignment

1. Frontend builds payload with assignment IDs and objective drafts.
2. Frontend includes existing objective weightage adjustments if any.
3. Frontend includes per-assignment new objective weightage overrides if any.
4. Backend validates each assignment.
5. Backend creates approved manager objectives.
6. Backend returns created, updated, and failed arrays.
7. Frontend shows success/partial failure result.
8. Frontend refreshes workspace data.

## 18. Testing Checklist

Recommended manual test cases:

1. Manager can create one manager objective and save to library.
2. Manager can create multiple manager objectives and assign all.
3. Manager can search library by title, KPI, target, description.
4. Remove from library does not remove already assigned objectives.
5. Bulk modal employee search works by name, code, department, designation, and manager.
6. Cycle filter limits records correctly.
7. Term filter limits records correctly.
8. Status filter limits records correctly.
9. `Assignable` tab hides non-eligible records.
10. Predefined-only assignment is visible in `All` but not selectable.
11. Assignment outside objective-setting window is not selectable.
12. Duplicate selected objective title prevents selection.
13. Existing manager objective weightage can be adjusted.
14. New objective default weightage changes apply to all selected records.
15. Per-record objective weightage override changes only that record.
16. Over-100% selected record blocks submit.
17. Backend rejects crafted over-100% request.
18. Backend rejects manager-created objective when template disallows it.
19. Backend rejects non-manager actor unless admin/delegate.
20. Partial failure keeps failed records/objectives in the modal.
21. Successful bulk assignment creates objectives with `OBJECTIVE_APPROVED`.
22. Audit events are created for bulk create and weightage update.

## 19. Important Code References Summary

Frontend:

- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:117` - manager objective draft type
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:1536` - bulk assignment eligibility
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:1814` - manager assignment reactive data
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:2050` - submit enablement
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:2519` - employee picker option builder
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:2734` - not-assignable reason
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:2938` - selectable assignment check
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:3070` - save manager objective library
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:3182` - open bulk assignment modal
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:3558` - bulk weightage helpers
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:3957` - submit bulk assignment
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:7843` - objective library modal
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:8066` - bulk assignment modal
- `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte:8920` - bulk detail modal
- `Client/src/lib/services/api/pmsObjectives.ts:259` - bulk assignment API call

Backend:

- `Server/src/routes/objective.routes.ts:33` - bulk manager assignment route
- `Server/src/routes/objective.routes.ts:48` - manager library fetch route
- `Server/src/routes/objective.routes.ts:61` - manager library save route
- `Server/src/routes/objective.routes.ts:76` - assignment list route
- `Server/src/services/objective.service.ts:300` - manager library fetch
- `Server/src/services/objective.service.ts:309` - manager library save
- `Server/src/services/objective.service.ts:329` - assignment list
- `Server/src/services/objective.service.ts:644` - bulk create manager objectives
- `Server/src/services/objective.service.ts:2028` - objective config validation
- `Server/src/services/objective.service.ts:2043` - normalize library item
- `Server/src/services/objective.service.ts:2118` - group new objective weightage overrides
- `Server/src/services/objective.service.ts:2190` - prepare existing objective weightage adjustments
- `Server/src/services/objective.service.ts:2250` - bulk total weightage guard
- `Server/src/models/pms-manager-objective-library.model.ts:1` - manager objective library model
- `Server/src/models/pms-objective.model.ts:1` - objective model

## 20. File-by-File Implementation Content

This section gives the actual responsibility of each referenced file and the important code content it owns. This is more useful than only listing file names.

### 20.1 `Client/src/lib/components/pms/objectives/ObjectiveWorkspace.svelte`

This is the main UI implementation file for the manager bulk assignment flow.

Important content:

- Owns modal and workflow state:

```ts
let showObjectiveBuilderModal = false;
let showObjectiveLibraryModal = false;
let showBulkModal = false;
let assigningBulk = false;
let managerObjectiveDrafts: ManagerObjectiveDraft[] = [];
let objectiveBuilderDrafts: ManagerObjectiveDraft[] = [];
let assigningObjectiveDrafts: ManagerObjectiveDraft[] = [];
let bulkAssignFailures: BulkManagerObjectiveResult["failed"] = [];
let selectedAssignAssignmentIds: string[] = [];
let existingObjectiveWeightageOverrides: Record<string, number> = {};
let assignmentObjectiveWeightageOverrides: Record<string, number> = {};
```

- Defines manager objective draft type:

```ts
type ManagerObjectiveDraft = ObjectiveDraftInput & {
  localId: string;
  source: "MANAGER_CREATED";
};
```

- Defines grouped employee picker state:

```ts
type AssignmentPickerGroup = {
  employeeKey: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  assignments: PmsObjectiveAssignment[];
  eligibleAssignments: PmsObjectiveAssignment[];
};
```

- Checks whether a record can receive manager objectives:

```ts
return (
  mode === "manager" &&
  assignment.objectiveConfig.mode !== "PREDEFINED" &&
  assignment.objectiveConfig.allowManagerCreated &&
  managerObjectiveCreateQuarterStates.has(assignment.quarterState) &&
  isObjectiveSettingWindowOpen(assignment)
);
```

- Creates a new empty manager objective draft:

```ts
function createManagerObjectiveDraftEntry(): ManagerObjectiveDraft {
  return {
    ...createEmptyDraft("MANAGER_CREATED"),
    localId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    source: "MANAGER_CREATED",
  };
}
```

Reference:

- `createManagerObjectiveDraftEntry`: `ObjectiveWorkspace.svelte:2272-2282`

- Validates manager objective drafts before saving to library:

```ts
const requiredFields = [
  ["Title", objective.title],
  ["Description", objective.description],
  ["KPI / Measurement", objective.kpi],
  ["Target Value", objective.targetValue],
  ["Due Date", objective.dueDate],
  ["Weightage", objective.weightage],
  ["Success Criteria", objective.successCriteria],
];
```

Validation rules:

- title is required,
- description is required,
- KPI / measurement is required,
- target value is required,
- due date is required,
- weightage is required,
- success criteria is required,
- weightage must be numeric and between 0 and 100.

Reference:

- `validateManagerObjectiveDrafts`: `ObjectiveWorkspace.svelte:2439-2487`

- Gives exact not-assignable reason:

```ts
if (alreadyAssignedObjectives.length > 0) return "Selected objective already exists...";
if (assignment.objectiveConfig.mode === "PREDEFINED") return "This record uses predefined objectives only...";
if (!assignment.objectiveConfig.allowManagerCreated) return "This template does not allow manager-created objectives...";
if (!managerObjectiveCreateQuarterStates.has(assignment.quarterState)) return `Current status is ...`;
if (!isObjectiveSettingWindowOpen(assignment)) return "The objective-setting window is not open...";
```

- Normalizes employee keys for grouped picker behavior:

```ts
const candidates = [
  assignment.employeeCode ? `code:${assignment.employeeCode}` : "",
  assignment.employeeNo ? `code:${assignment.employeeNo}` : "",
  assignment.employeeNumber ? `code:${assignment.employeeNumber}` : "",
  assignment.employeeId ? `id:${assignment.employeeId}` : "",
  assignment.employeeName ? `name:${assignment.employeeName}` : "",
];
```

Reference:

- `buildAssignmentEmployeeAliases`: `ObjectiveWorkspace.svelte:2490-2509`

Why this matters:

- The same employee can be identified by code, employee number, employee ID, or name depending on the API/data source.
- Grouping uses these aliases so the picker does not split the same person into multiple visual groups.

- Owns selected employee picker behavior:

```ts
getSelectedAssignmentPickerEmployees()
toggleAssignmentPickerEmployee(group)
removeAssignmentPickerEmployee(employeeKey)
clearAssignmentPickerEmployees()
```

Reference:

- `ObjectiveWorkspace.svelte:2650-2731`

- Builds grouped assignment picker rows:

```ts
function buildAssignmentPickerGroups(assignments: PmsObjectiveAssignment[]): AssignmentPickerGroup[] {
  ...
}
```

Reference:

- `buildAssignmentPickerGroups`: `ObjectiveWorkspace.svelte:2823-2876`

- Normalizes selected objective titles to prevent duplicate assignment:

```ts
function normalizeObjectiveTitle(value: string | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}
```

Reference:

- `normalizeObjectiveTitle`: `ObjectiveWorkspace.svelte:2898-2910`

- Saves manager objective library:

```ts
const nextObjectives = [
  ...managerObjectiveDrafts,
  ...objectiveBuilderDrafts.map((objective) => ({ ...objective })),
];
managerObjectiveDrafts = nextObjectives;
await saveManagerObjectiveLibrary(nextObjectives);
```

- Opens bulk modal:

```ts
assigningObjectiveDrafts = objectives.map((objective) => ({ ...objective }));
selectedAssignAssignmentIds = [];
assignmentPickerTab = "All";
assignmentPickerCycle = "All";
assignmentPickerQuarter = "All";
assignmentPickerStatus = "All";
showBulkModal = true;
```

- Opens/closes assignment detail modal:

```ts
openBulkNewObjectiveDetail(assignment, objective)
openBulkExistingObjectiveDetail(assignment, objective)
closeBulkObjectiveDetailModal()
```

Reference:

- `ObjectiveWorkspace.svelte:2788-2820`

- Builds submission payload data:

```ts
const weightageAdjustments = getBulkWeightageAdjustmentsForSubmission();
const objectiveWeightageOverrides = getBulkObjectiveWeightageOverridesForSubmission();
const response = await pmsObjectivesApi.bulkAssignManagerObjectives(
  selectedAssignAssignments,
  assigningObjectiveDrafts.map(...),
  weightageAdjustments,
  objectiveWeightageOverrides,
);
```

- Maps backend failures back to the correct objective:

```ts
function getBulkFailureReasonForObjective(objective: ManagerObjectiveDraft) {
  return bulkAssignFailures.find(
    (failure) => failure.clientObjectiveId && failure.clientObjectiveId === objective.localId,
  )?.reason ?? ...
}
```

Reference:

- `getBulkFailureReasonForObjective`: `ObjectiveWorkspace.svelte:3315-3328`

- Tracks weightage overrides with stable assignment/objective keys:

```ts
function getAssignmentObjectiveWeightageOverrideKey(
  assignment: PmsObjectiveAssignment,
  objective: ManagerObjectiveDraft,
) {
  return `${assignment.quarterAssignmentId || assignment.id}::${objective.localId}`;
}
```

Reference:

- existing objective override helpers: `ObjectiveWorkspace.svelte:3332-3375`
- assignment objective override helpers: `ObjectiveWorkspace.svelte:3398-3558`

Migration warning:

- `bulkObjectiveDetailModal` is rendered in two places in this branch:
  - one block around `ObjectiveWorkspace.svelte:7640`
  - one block around `ObjectiveWorkspace.svelte:8920`
- If implementing in another branch, prefer consolidating to one render block unless the current branch behavior intentionally depends on both locations.
- The later block is guarded by `showBulkModal && bulkObjectiveDetailModal` and is the one most directly tied to the bulk assignment modal.

UI content owned by this file:

- manager list-view entry button,
- manager objective editor state,
- objective library modal,
- objective preview modal,
- employee picker dropdown,
- cycle/term/status filters,
- all/assignable tabs,
- grouped employee assignment list,
- weightage validation panel,
- failure panel,
- right-side objective weightage panel,
- bulk detail modal.

### 20.2 `Client/src/lib/services/api/pmsObjectives.ts`

This file owns the frontend API contract for objective operations.

Important content:

- Assignment list API:

```ts
listAssignments: async (mode: ObjectiveWorkspaceMode) => {
  return listAssignmentsFromBackend(mode);
}
```

- Assignment sanitizer:

```ts
function sanitizeAssignment(assignment: PmsObjectiveAssignment): PmsObjectiveAssignment {
  const normalizedAssignment = {
    ...assignment,
    backendConnected: assignment.backendConnected ?? true,
    objectiveConfig: {
      mode: assignment.objectiveConfig?.mode ?? "DYNAMIC",
      allowEmployeeCreated: assignment.objectiveConfig?.allowEmployeeCreated !== false,
      allowManagerCreated: assignment.objectiveConfig?.allowManagerCreated !== false,
      predefinedObjectives: assignment.objectiveConfig?.predefinedObjectives ?? [],
    },
    objectives: (assignment.objectives ?? []).map(...),
  };
  return normalizedAssignment;
}
```

Reference:

- `sanitizeAssignment`: `pmsObjectives.ts:83-125`

Why this file matters for migration:

- It protects the UI from older backend responses that may not include `objectiveConfig`.
- It preserves manager-created enablement unless the backend explicitly sends `allowManagerCreated: false`.
- It normalizes objective IDs and defaults seeded predefined objectives to approved.

- Manager objective library APIs:

```ts
listManagerObjectiveLibrary: async () => {
  return fetchApi<BackendResponse<ManagerObjectiveLibraryDraft[]>>(
    `${OBJECTIVE_ENDPOINT}/manager-library`,
  );
}

saveManagerObjectiveLibrary: async (objectives: ManagerObjectiveLibraryDraft[]) => {
  return fetchApi<BackendResponse<ManagerObjectiveLibraryDraft[]>>(
    `${OBJECTIVE_ENDPOINT}/manager-library`,
    {
      method: "PUT",
      body: JSON.stringify({ objectives }),
    },
  );
}
```

- Bulk response type:

```ts
export type BulkManagerObjectiveResult = {
  created: Array<{ quarterAssignmentId; objectiveId; employeeId; employeeName; objectiveTitle; clientObjectiveId? }>;
  updated: Array<{ quarterAssignmentId; objectiveId; objectiveTitle; previousWeightage?; weightage? }>;
  failed: Array<{ quarterAssignmentId; employeeId?; employeeName?; objectiveTitle?; clientObjectiveId?; reason }>;
};
```

- Bulk request body builder:

```ts
const payload = {
  quarterAssignmentIds: assignments.map((assignment) => assignment.quarterAssignmentId),
  objectives,
  weightageAdjustments,
  objectiveWeightageOverrides,
};
```

- Objective draft conversion:

```ts
function toBackendObjectivePayload(draft: ObjectiveDraftInput) {
  return {
    clientObjectiveId: draft.clientObjectiveId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    targetMetric: draft.kpi?.trim(),
    targetValue: draft.targetValue?.trim(),
    targetDate: draft.dueDate || undefined,
    weightage: draft.weightage,
    successCriteria: draft.successCriteria?.trim(),
    attachments: draft.attachments?.map(...),
    objectiveValues: draft.objectiveValues ?? [],
  };
}
```

Reference:

- `toBackendObjectivePayload`: `pmsObjectives.ts:135-158`

- API call:

```ts
return fetchApi<BackendResponse<BulkManagerObjectiveResult>>(
  `${OBJECTIVE_ENDPOINT}/bulk-manager`,
  {
    method: "POST",
    body: JSON.stringify(payload),
  },
);
```

Why this file matters:

- It maps UI drafts into backend objective payloads.
- It sends top-level assignment IDs separately from objective drafts.
- It attaches `clientObjectiveId` for frontend failure mapping.

### 20.3 `Server/src/routes/objective.routes.ts`

This file exposes the backend endpoints used by the manager bulk assignment UI.

Important content:

```ts
fastify.post('/bulk-manager', { onRequest: [authenticate] }, async (request, reply) => {
  const result = await request.container!.objectiveService.bulkCreateManagerObjectives(
    request.body as BulkCreateManagerObjectiveInput,
  );
  return reply.status(201).send(successResponse('Manager objectives assigned successfully', result));
});
```

```ts
fastify.get('/manager-library', { onRequest: [authenticate] }, async (request, reply) => {
  const objectives = await request.container!.objectiveService.listManagerObjectiveLibrary();
  return reply.send(successResponse('Manager objective library fetched successfully', objectives));
});
```

```ts
fastify.put('/manager-library', { onRequest: [authenticate] }, async (request, reply) => {
  const objectives = await request.container!.objectiveService.saveManagerObjectiveLibrary(
    request.body as SaveManagerObjectiveLibraryInput,
  );
  return reply.send(successResponse('Manager objective library saved successfully', objectives));
});
```

```ts
fastify.get('/assignments', { onRequest: [authenticate] }, async (request, reply) => {
  const { mode = 'employee' } = request.query as { mode?: 'employee' | 'manager' };
  const assignments = await request.container!.objectiveService.listAssignments(mode);
  return reply.send(successResponse('Objective assignments fetched successfully', assignments));
});
```

Why this file matters:

- It connects frontend API calls to service methods.
- It ensures all manager bulk assignment endpoints are authenticated.
- It delegates business logic to `objective.service.ts`.

### 20.4 `Server/src/services/objective.service.ts`

This is the core backend implementation file.

Important input contracts:

```ts
type BulkCreateManagerObjectiveResult = {
  created: Array<{
    quarterAssignmentId: string;
    objectiveId: string;
    employeeId: string;
    employeeName?: string;
    objectiveTitle: string;
    clientObjectiveId?: string;
  }>;
  updated: Array<{
    quarterAssignmentId: string;
    objectiveId: string;
    objectiveTitle: string;
    previousWeightage?: number;
    weightage?: number;
  }>;
  failed: Array<{
    quarterAssignmentId: string;
    employeeId?: string;
    employeeName?: string;
    objectiveTitle?: string;
    clientObjectiveId?: string;
    reason: string;
  }>;
};
```

```ts
export interface BulkManagerObjectiveWeightageAdjustmentInput {
  quarterAssignmentId: string;
  objectiveId: string;
  weightage: number;
}
```

```ts
export interface BulkManagerObjectiveWeightageOverrideInput {
  quarterAssignmentId: string;
  clientObjectiveId?: string;
  objectiveIndex?: number;
  weightage: number;
}
```

```ts
export interface BulkCreateManagerObjectiveInput extends Partial<BulkManagerObjectiveDraftInput> {
  quarterAssignmentIds: string[];
  objectives?: BulkManagerObjectiveDraftInput[];
  weightageAdjustments?: BulkManagerObjectiveWeightageAdjustmentInput[];
  objectiveWeightageOverrides?: BulkManagerObjectiveWeightageOverrideInput[];
}
```

Manager library save logic:

```ts
const objectives = (input.objectives ?? []).map((objective, index) =>
  this.normalizeManagerObjectiveLibraryItem(objective, index),
);

const library = await ManagerObjectiveLibrary.findOneAndUpdate(
  { managerId },
  { $set: { objectives } },
  { upsert: true, new: true, setDefaultsOnInsert: true },
).lean();
```

Manager assignment list logic:

```ts
if (mode === 'manager') {
  const managerId = this.toObjectId(actor.actorId, 'actorId');
  const delegations = await new DelegationService(this.context).getActiveDelegationsForDelegate(
    actor.actorId,
    'PMS_OBJECTIVES',
  );
  const managerClauses = [{ assignedManagerId: managerId }];
  // delegation clauses are also added
  filter.$or = managerClauses;
}
```

Bulk create core logic:

```ts
const quarterAssignmentIds = Array.from(new Set(input.quarterAssignmentIds ?? []));
const objectiveInputs = this.resolveBulkManagerObjectiveInputs(input);
const adjustmentsByQuarterAssignmentId = this.groupBulkWeightageAdjustments(input.weightageAdjustments ?? []);
const objectiveWeightageOverridesByQuarterAssignmentId =
  this.groupBulkObjectiveWeightageOverrides(input.objectiveWeightageOverrides ?? []);
```

Assignment-level validations:

```ts
const objectiveConfig = await this.getObjectiveConfigForAssignment(annualAssignment, quarterAssignment);
const source = ObjectiveSource.MANAGER_CREATED;
const bucket = this.resolveObjectiveBucket(source, objectiveConfig);

if (!bucket) throw new Error(`No matching objective bucket configuration found for source: ${source}`);
if (bucket.owner !== 'MANAGER') throw new Error('Bulk assignment can create objectives only in manager-owned buckets');
```

Actor validation:

```ts
const isManager = actor.actorId === quarterAssignment.assignedManagerId.toString();
const isDelegate = await this.getObjectiveDelegation(...);

if (!isManager && !isDelegate && accessService.mapRole(actor.actorRole) !== PmsRole.ADMIN) {
  throw new Error('Only the manager or their delegate can assign manager objectives');
}
```

Window and config validation:

```ts
await this.assertAssignmentAccess('objective.create', quarterAssignment);
await this.assertObjectiveWindow(quarterAssignment, 'setting');
this.validateCreateAgainstConfig(source, objectiveConfig);
```

Weightage validation:

```ts
const preparedAdjustments = await this.prepareBulkManagerWeightageAdjustments(...);
const objectiveInputsForAssignment = this.applyBulkObjectiveWeightageOverrides(...);
this.assertBulkManagerObjectiveWeightageTotal(
  quarterAssignmentId,
  preparedAdjustments.existingWeightageAfterAdjustments,
  objectiveInputsForAssignment,
);
```

Objective creation:

```ts
const objective = await Objective.create({
  quarterAssignmentId: quarterAssignment._id,
  annualAssignmentId: quarterAssignment.annualAssignmentId,
  cycleId: quarterAssignment.cycleId,
  quarterCode: quarterAssignment.quarterCode,
  employeeId: quarterAssignment.employeeId,
  assignedManagerId: quarterAssignment.assignedManagerId,
  objectiveNo: await this.getNextObjectiveNo(quarterAssignment._id),
  source,
  title: objectiveInput.title.trim(),
  description: objectiveInput.description?.trim(),
  targetMetric: objectiveInput.targetMetric?.trim(),
  targetValue: objectiveInput.targetValue?.trim(),
  targetDate: objectiveInput.targetDate ? new Date(objectiveInput.targetDate) : undefined,
  weightage: objectiveInput.weightage,
  successCriteria: objectiveInput.successCriteria?.trim(),
  status: ObjectiveStatus.OBJECTIVE_APPROVED,
  attachments: this.normalizeAttachments(objectiveInput.attachments ?? []),
  createdByRole: actor.actorRole,
  createdByUserId: actorObjectId,
  createdBy: actorObjectId,
  approvedAt: new Date(),
  approvedBy: actorObjectId,
});
```

Why this file matters:

- It owns the real business rules.
- It creates the actual objective records.
- It enforces the same rules even if frontend validation is bypassed.
- It supports manager, delegate, and admin execution.
- It isolates partial failures per assignment/objective.

### 20.5 `Server/src/models/pms-manager-objective-library.model.ts`

This model stores reusable manager-created objective drafts.

Important content:

```ts
export interface IManagerObjectiveLibraryItem {
  localId: string;
  source: typeof ObjectiveSource.MANAGER_CREATED;
  title: string;
  description?: string;
  kpi?: string;
  targetValue?: string;
  dueDate?: string;
  weightage?: number;
  successCriteria?: string;
  attachments: any[];
  objectiveValues: any[];
  createdAt?: Date;
  updatedAt?: Date;
}
```

```ts
const managerObjectiveLibrarySchema = new Schema<IManagerObjectiveLibrary>(
  {
    managerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      unique: true,
      index: true,
    },
    objectives: {
      type: [managerObjectiveLibraryItemSchema],
      default: [],
    },
  },
  {
    collection: 'pms_manager_objective_libraries',
    timestamps: true,
  },
);
```

Why this file matters:

- A manager has one reusable objective library.
- `managerId` is unique, so saving replaces that manager’s library.
- Library items are not employee objectives until assigned.

### 20.6 `Server/src/models/pms-objective.model.ts`

This model stores actual assigned objectives.

Important content:

```ts
export interface IObjective extends Document {
  quarterAssignmentId: Types.ObjectId;
  annualAssignmentId?: Types.ObjectId;
  cycleId?: Types.ObjectId;
  templateVersionId?: Types.ObjectId;
  quarterCode?: AssessmentTermCodeType;
  employeeId: Types.ObjectId;
  assignedManagerId: Types.ObjectId;
  objectiveNo?: number;
  source: ObjectiveSourceType;
  title: string;
  description?: string;
  targetMetric?: string;
  targetValue?: string;
  targetDate?: Date;
  weightage?: number;
  successCriteria?: string;
  status: ObjectiveStatusType;
  attachments: IPmsAttachment[];
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
}
```

Important schema fields:

```ts
quarterAssignmentId: {
  type: Schema.Types.ObjectId,
  required: true,
  ref: 'QuarterAssignment',
}
```

```ts
source: {
  type: String,
  required: true,
  enum: Object.values(ObjectiveSource),
}
```

```ts
weightage: { type: Number, min: 0, max: 100 }
```

```ts
status: {
  type: String,
  required: true,
  enum: Object.values(ObjectiveStatus),
  default: ObjectiveStatus.OBJECTIVE_DRAFT,
  index: true,
}
```

Why this file matters:

- Bulk assignment creates real rows here.
- The assigned objective is tied to one term assignment through `quarterAssignmentId`.
- Manager-created objectives are distinguished using `source = MANAGER_CREATED`.
- Weightage is constrained at model level to 0-100.

## 21. Practical Debug Guide

Use this section when testing or debugging the manager bulk assignment feature.

### 21.1 Objective Not Showing in Manager Objective Builder

Check:

- `GET /pms/objectives/manager-library` response.
- `pms_manager_objective_libraries` document for the logged-in manager.
- `managerId` should match logged-in actor ID.

Relevant code:

- `listManagerObjectiveLibrary`, `objective.service.ts:300`
- `ManagerObjectiveLibrary.findOne({ managerId })`

### 21.2 Employee Record Visible but Not Selectable

Check the UI reason from:

- `getAssignmentNotAssignableReason`, `ObjectiveWorkspace.svelte:2734`

Likely reasons:

- template is predefined-only,
- manager-created disabled,
- status is not objective setting,
- objective-setting window is closed,
- selected objective already exists on the record.

Backend will also reject the same class of invalid request.

### 21.3 Submit Button Disabled

Check:

- selected assignment count,
- objective count,
- weightage validation panel,
- record capacity chip,
- existing manager objective overrides,
- per-record objective overrides.

Source:

- `canSubmitBulkAssignment`, `ObjectiveWorkspace.svelte:2050`

### 21.4 API Returns Partial Failure

Check response `failed[]`.

Each failed object should have:

- `quarterAssignmentId`,
- possibly `employeeName`,
- possibly `objectiveTitle`,
- possibly `clientObjectiveId`,
- `reason`.

If `clientObjectiveId` exists, frontend keeps only that failed objective for retry.

### 21.5 Backend Says Weightage Cannot Exceed 100

Check:

- existing manager-created objective total for the assignment,
- new objectives being assigned,
- per-assignment overrides,
- existing objective weightage adjustments.

Source:

- `assertBulkManagerObjectiveWeightageTotal`, `objective.service.ts:2250`

### 21.6 Backend Says Only Manager or Delegate Can Assign

Check:

- logged-in user ID,
- assignment `assignedManagerId`,
- active PMS objective delegation,
- actor role admin or not.

Source:

- actor validation, `objective.service.ts:686-695`

### 21.7 Backend Says Objective-Setting Window Is Not Open

Check:

- assignment term objective-setting window,
- current test date / server date behavior,
- workflow state.

Source:

- `assertObjectiveWindow(quarterAssignment, 'setting')`, `objective.service.ts:698`

### 21.8 Objective Created but Employee Did Not Approve It

This is expected.

Manager-created objectives are created as:

- `source = MANAGER_CREATED`
- `status = OBJECTIVE_APPROVED`
- `approvedAt = new Date()`
- `approvedBy = actorObjectId`

Source:

- objective creation payload, `objective.service.ts:773-798`

## 22. Summary

The manager bulk assignment implementation is a full FE/BE workflow, not just a UI modal. The frontend provides a guided assignment experience with filtering, grouping, duplicate prevention, weightage validation, and retry support. The backend provides the authoritative guards for permissions, template rules, workflow window timing, ownership, weightage, and audit.

The most important functional points are:

- manager objectives are saved first into a personal manager objective library,
- assigned manager objectives are created directly as approved objectives,
- assignments are eligible only during objective-setting and only when template configuration allows manager-created objectives,
- the system prevents manager objective weightage from exceeding 100% per assignment record,
- partial failures are intentionally supported so a bulk operation can succeed for valid records while reporting invalid ones.
