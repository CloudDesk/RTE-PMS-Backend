# Template Objective — Current Implementation Flow and Status

**Status date:** 31 August 2026  
**Scope:** Template Objective table, predefined/blank rows, employee-created rows, manager-created rows, Matrix selection, row/column ordering, persistence, and review flow.  
**Code snapshot:** Server `fdbec896fae0fabd322bd07510eb475e0dd019f9`; Client `511cf812ee4388171c85f7eca7af4cf12b728c53`.

## 1. Current implementation status

| Area | Status | Current behaviour |
|---|---|---|
| Template Objective section | Implemented | Supports `PREDEFINED`, `DYNAMIC`, and `HYBRID` objective modes. |
| Blank objective table | Implemented | Starts with one required **Objective** column and one empty template row. |
| Recommended objective table | Implemented | Creates the standard Objective, Unit, Benchmark, Target, Q1–Q4 Actual, Supporting Documents, Actual, and Manager Comment columns. |
| System Serial Number (S.No) | Implemented | `system.serialNo` is a system display column (`SYSTEM_DISPLAY`, non-editable). Computed dynamically (`1...N`) by backend to guarantee zero gaps, overlaps, or duplicates across all views and PDF exports. Excluded from dynamic creation modals. |
| Single Canonical `matrixCode` | Implemented | Predefined, employee-created, and manager-created rows all use unified `matrixCode` / `matrixLabel` mapped to active `matrix` LOV values. |
| Canonical Metrics Sorting | Implemented | Backend sorts logical rows by optional row-group order $\rightarrow$ active `matrix` LOV canonical array rank $\rightarrow$ row order within metric $\rightarrow$ deterministic `objectiveRowKey` tie-breaker. |
| Empty-row state machine | Implemented | Blank placeholder rows remain unseeded; entered objective titles require a valid Metric selection before template activation or saving. |
| Empty predefined row authoring | Implemented | Admin can add empty rows in the template designer and fill them using the configured columns and Metric dropdown. |
| Predefined objective seeding | Implemented | Valid active template rows with non-empty titles are seeded into each applicable assignment term when an assignment is created/launched. |
| Employee-created objective | Implemented | Employee creates an objective as a draft and submits it for manager approval with mandatory Metric selection. |
| Manager-created objective | Implemented | Assigned manager creates an objective with mandatory Metric selection and it is approved immediately. |
| Term coverage | Implemented | A new dynamic row covers the current term and remaining terms by default. Optional term choice is controlled by the template. |
| Row grouping | Implemented, optional | Runtime table stays flat unless the admin explicitly enables row groups. |
| Column/row ordering | Implemented | Columns use `displayOrder`; rows use canonical Metric LOV sorting followed by continuous `serialNo` assignment. |
| Backend enforcement | Implemented | API checks actor identity, assignment relationship, row source, template permissions, workflow state, date window, required fields, and value types. |
| Idempotent row creation | Implemented | A client correlation ID produces a deterministic row key, preventing duplicate covered rows on retries. |
| Audit and optimistic concurrency | Implemented | Writes create audit entries; cell and delete flows check record versions. |

## 2. Important terminology

The current implementation uses three related but different concepts:

1. **Objective table layout** — the template-defined columns, term policies, permissions, formulas, and optional row groups.
2. **Template/predefined objective row** — a row authored by the admin in the template and later seeded into employee assignments.
3. **Matrix selection** — a classification selected from the active `matrix` LOV when an employee or manager creates a dynamic row. It is stored as `matrixCode` and `matrixLabel`; it is not the table layout itself.

## 3. End-to-end implementation flow

### 3.1 Admin configures the template

1. Admin opens an Objective section in the template builder.
2. The Objective section is configured as one of:
   - `PREDEFINED`: template rows only.
   - `DYNAMIC`: employee/manager-created rows only.
   - `HYBRID`: template rows plus enabled employee/manager-created rows.
3. Admin opens **Design objective table**.
4. Admin chooses a blank table, recommended table, or a copied layout.
5. Admin configures columns, column access, term availability, formulas, calculated rows, dynamic-row term policy, and optional row groups.
6. Admin adds and fills predefined template rows if the mode requires them.
7. Confirming the designer writes the layout into the Objective section and explicitly saves the current template version before closing.
8. The template must pass validation before it can be activated.

### 3.2 Blank objective table and empty row

The blank table layout contains:

| Property | Initial value |
|---|---|
| Columns | One `Objective` column |
| Binding | `objective.title` |
| Column order | `1` |
| Required | Yes |
| Fill owner | `ROW_CREATOR` |
| Workflow stage | `OBJECTIVE_SETTING` |
| Term policy | `SHARED_ANNUAL` |
| Row groups | None; flat table by default |
| Dynamic term choice | Disabled for employee and manager |

The initial blank predefined row contains key `table_row_1`, empty objective values, zero weightage, all quarterly terms, and an empty `columnValues` object.

Adding another empty template row creates a unique `table_row_N` key and sets its `rowOrder` to the current number of rows plus one. Direct bindings such as title, KPI, target, due date, weightage, and success criteria are stored on the predefined objective. Other configured columns are stored in `columnValues`.

An empty row is an authoring convenience only. A `PREDEFINED` or `HYBRID` template cannot be activated with a blank active title. The server also skips a row without a valid key or title during seeding.

### 3.3 Recommended objective table

The recommended layout currently orders columns as follows:

| Order | Column | Owner/stage | Term policy |
|---:|---|---|---|
| 1 | Objective | Row creator / Objective setting | Shared annual |
| 2 | Unit of Measure | Row creator / Objective setting | Shared annual |
| 3 | Benchmark | Row creator / Objective setting | Shared annual |
| 4 | Target | Row creator / Objective setting | Shared annual |
| 5 | Q1 Actual | Employee / Achievement | Q1 only |
| 6 | Q2 Actual | Employee / Achievement | Q2 only |
| 7 | Q3 Actual | Employee / Achievement | Q3 only |
| 8 | Q4 Actual | Employee / Achievement | Q4 only |
| 9 | Supporting Documents | Employee / Achievement | Every review period |
| 10 | Actual | Manager / Manager review | Shared annual |
| 11 | Manager Comment | Manager / Manager review | Every review period |

The Target through Actual columns are placed in the configured **Results** column group. Row groups are still disabled until the admin explicitly enables them.

### 3.4 Template validation and activation

Current validation includes:

- `PREDEFINED` and `HYBRID` modes require at least one predefined row.
- `DYNAMIC` and `HYBRID` require at least one enabled dynamic creator role.
- Every active predefined row requires a unique key and a non-empty title.
- Weightage must be between 0 and 100.
- An enabled layout requires columns.
- Column IDs and binding keys must be unique.
- Dropdowns require options.
- Formula/system columns must use system/calculated ownership and stages.
- Each column requires a valid term policy for activation.
- Row-group keys and assignments must be valid and unique.
- If grouping is enabled for dynamic rows, each enabled dynamic source needs a destination group.
- Formula references and cycles are validated.

### 3.5 Assignment creation and predefined row seeding

When an annual assignment is created or launched:

1. Term assignments are created according to the assessment cadence.
2. The assigned template version is loaded.
3. For every term, the service resolves the Objective configuration applicable to that term.
4. Inactive rows and rows not applicable to the term are skipped.
5. Each valid predefined row becomes an `Objective` record in every covered term.
6. The row uses one deterministic `objectiveRowKey` across its covered terms.
7. The template `rowGroupKey`, `rowOrder`, core values, and custom `columnValues` are copied.
8. Predefined rows are created as `OBJECTIVE_APPROVED`, source `PREDEFINED`, and creator role `SYSTEM`.
9. Custom configured values are stored as `ObjectiveValue` records.
10. Seeding uses unordered bulk upserts, so rerunning the process updates row identity and does not create duplicate logical rows.

## 4. Runtime employee flow

1. Employee opens the assigned objective workspace/table.
2. The client loads the annual matrix from the backend.
3. Predefined approved rows are displayed.
4. If `allowEmployeeCreated` is enabled, **Add objective** is available.
5. The employee must select an active Matrix LOV value and complete all configured required create-stage fields.
6. Coverage defaults to the current term plus remaining terms. The current term is mandatory. Past terms are rejected.
7. If `allowEmployeeTermChoice` is false, the API rejects coverage different from the default.
8. Saving creates linked `EMPLOYEE_CREATED` objectives with one shared row key and status `OBJECTIVE_DRAFT`.
9. Draft rows are private from non-employee matrix views.
10. The employee can edit, delete, or submit only when the current workflow state, template access, and objective-setting date window permit it.
11. On submission, the assigned manager can approve or return the employee-created objective.
12. A returned row enters revision flow and may be edited and resubmitted by the employee.

Only employee-created linked rows that are still drafts can be deleted. Predefined rows cannot be deleted through the runtime matrix row API.

## 5. Runtime manager flow

1. The assigned manager opens the employee's term review workspace.
2. The same annual matrix is loaded in manager mode.
3. Employee draft rows are hidden until submitted.
4. The manager may approve or return a submitted employee-created row during the approval window.
5. If `allowManagerCreated` is enabled, the manager may add an objective.
6. Matrix selection and all configured required create-stage fields are mandatory.
7. Coverage defaults to the current term plus remaining terms and follows the manager term-choice policy.
8. A manager-created row is saved as `MANAGER_CREATED` and immediately `OBJECTIVE_APPROVED`; `approvedBy` and `approvedAt` are recorded.
9. Manager review-stage cells are editable only when the relevant term state, date window, fill owner, and explicit column access allow the change.

A user who has a Manager account but is working on their own employee assignment is resolved as the employee for `EMPLOYEE_CREATED` rows. A Director can act as the manager creator only when that Director is the assignment's actual assigned manager.

## 6. Matrix selection flow

1. Employee and manager clients load active options from LOV type `matrix`.
2. The create dialog requires one selection.
3. The API reloads the LOV and accepts only an active matching value.
4. The selected code and current label are stored on every covered Objective sibling as `matrixCode` and `matrixLabel`.
5. In a flat table, dynamic rows display a `Matrix: <label>` badge.
6. Legacy P/Q/C/D/S/M group values have display fallbacks such as Productivity, Quality, Cost, Delivery, Safety, and Morale, but the active LOV label takes precedence.

## 7. Exact ordering rules

### 7.1 Assessment-term order

- Quarterly: `Q1`, `Q2`, `Q3`, `Q4`
- Half-yearly: `H1`, `H2`
- Yearly: `Y1`

Only terms present on the annual assignment are included. Row coverage and sibling records follow this canonical term order.

### 7.2 Column order

Columns are rendered in ascending `displayOrder`. When the admin drags a column, the designer rewrites every column's `displayOrder` as `index + 1`.

Column groups are also sorted by their `displayOrder`, and hidden columns are removed from a group before the group is returned to the client.

### 7.3 Predefined row order in the template designer

If row groups are enabled, rows are ordered by:

1. Row group's configured order.
2. The predefined objective's `rowOrder`.
3. Original array position as the fallback when `rowOrder` is absent.

If no valid group assignment exists, a predefined row uses the first `PREDEFINED` group; otherwise it is treated as ungrouped.

### 7.4 Runtime row order and dynamic serial numbering

The backend first builds one logical row by grouping term-specific Objective siblings using `objectiveRowKey`. It then sorts the logical rows by:

1. Row-group `displayOrder`, but only when row groups are explicitly enabled for presentation (`showRowGroups === true`).
2. Canonical Metric LOV rank (based on `row.matrixCode` mapped to the array index of active `matrix` LOV values: e.g. Productivity $\rightarrow$ Quality $\rightarrow$ Cost $\rightarrow$ Delivery $\rightarrow$ Safety $\rightarrow$ Morale).
3. `rowOrder` within the same Metric category.
4. `objectiveRowKey` as the deterministic tie-breaker.

After sorting, the backend assigns a gapless dynamic serial number (`serialNo = index + 1`, $1\dots N$) across all rows and attaches it to the `system.serialNo` system display column. This ensures:
- Zero gaps or skipped numbers.
- Zero duplicate serial numbers across concurrent edits or additions.
- Exact visual consistency across Employee, Manager, Admin, and PDF export views.

The client respects the backend-provided row sequence and serial numbers in both flat and grouped layouts.

## 8. Row groups versus flat table

Flat table is the default. Enabling row groups creates source-specific groups in this order when the related source is enabled:

1. Company Objectives — `PREDEFINED`
2. Employee Objectives — `EMPLOYEE_CREATED`
3. Manager Objectives — `MANAGER_CREATED`

The admin can change group labels and display order. Predefined rows receive explicit row assignments. A dynamic row is placed into the matching employee or manager destination group.

When grouping is disabled, row groups and assignments are cleared from the designed layout, and the runtime response does not expose group rows. Source identity and Matrix classification still remain on each objective.

## 9. Data stored

### Template version

- Objective mode and employee/manager creation flags.
- Predefined rows and their direct values.
- Custom row `columnValues`.
- Table columns, access, workflow stages, widths, and display orders.
- Column groups and their order.
- Term policies.
- Optional row groups and row assignments.
- Dynamic row policy.
- Formulas and calculated rows.

### Runtime Objective records

- Annual assignment, term assignment, employee, and assigned manager.
- Source: `PREDEFINED`, `EMPLOYEE_CREATED`, or `MANAGER_CREATED`.
- Core objective values and workflow status.
- `objectiveRowKey`, origin term, coverage, group key, and optional row order.
- Matrix code and label for dynamic rows.
- Template objective key for predefined rows.
- Approval, version, audit ownership, and deletion state.

### ObjectiveValue records

Custom table cells are stored separately with the objective, term, template field/column, binding key, workflow stage, actor role, typed value, and version.

## 10. Main API routes

All routes are authenticated. Permission enforcement occurs inside the objective matrix services using the authenticated actor and current assignment data.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/pms/objectives/annual-assignments/:annualAssignmentId/matrix` | Load the annual objective matrix. |
| `PUT` | `/pms/objectives/annual-assignments/:annualAssignmentId/matrix/cells` | Save permitted matrix cell changes. |
| `POST` | `/pms/objectives/annual-assignments/:annualAssignmentId/matrix/rows` | Create an employee- or manager-owned dynamic row. |
| `DELETE` | `/pms/objectives/annual-assignments/:annualAssignmentId/matrix/rows/:objectiveRowKey` | Delete permitted linked draft rows. |
| `GET` | `/pms/objectives/annual-assignments/:annualAssignmentId/matrix/pdf` | Generate the objective matrix PDF view. |

## 11. Backend controls

The server does not rely only on hidden UI actions. It verifies:

- authenticated actor;
- actor is the assignment employee or assigned manager for the requested source;
- template mode and employee/manager creation flags;
- current assignment and template version have not changed;
- current term and requested coverage;
- no past-term creation;
- active Matrix LOV selection;
- configured column visibility/editability/fill owner;
- workflow stage and date window;
- required create-stage fields;
- numeric/date/priority/weightage value types;
- deterministic correlation ID and row identity;
- expected versions during protected updates/deletes;
- predefined rows cannot be deleted;
- only draft linked rows can be deleted.

## 12. Implementation notes & design rules

1. **System Serial Number (S.No)**: `system.serialNo` is non-editable and computed at runtime ($1\dots N$) after sorting. It is automatically excluded from dynamic creation modals.
2. **Canonical `matrixCode`**: Predefined, employee-created, and manager-created objectives all share the unified `matrixCode` classification from the active `matrix` LOV.
3. **Empty-row state machine**: Completely empty placeholder rows are not seeded into assignments; active rows with an entered title require a Metric selection before template activation.
4. **Row groups**: Row groups are an optional presentation choice; runtime tables default to a flat canonical view unless explicitly enabled by the administrator.
5. **Manager-created rows**: Manager-created rows are immediately approved, so the draft-only delete path does not apply to them.

## 13. Implementation references

### Client

- `Client/src/lib/components/pms/templates/TemplateBuilderWorkspace.svelte` — template objective designer integration, add/update/delete predefined rows, blank/recommended rows, explicit save.
- `Client/src/lib/components/pms/templates/TemplateObjectiveTableDesigner.svelte` — table designer tabs, row rendering, grouping, row/column reorder UI.
- `Client/src/lib/components/pms/templates/builder/objectiveDefaults.ts` — blank and recommended predefined objective rows.
- `Client/src/lib/components/pms/templates/builder/objectiveTableDesigner.ts` — blank/recommended layouts, access defaults, term policies, row groups, assignments, layout reconciliation.
- `Client/src/lib/components/pms/performance/EmployeeObjectiveMatrix.svelte` — employee matrix UI, Matrix LOV, dynamic draft creation, term coverage, cell editing, submit/delete actions.
- `Client/src/lib/components/pms/reviews/ManagerObjectiveMatrix.svelte` — manager matrix UI, approval/return, manager-created approved rows, manager cell editing.
- `Client/src/lib/components/pms/performance/employeeObjectiveMatrix.ts` — display-column expansion, lifecycle actions, Matrix/group labels, grouped row ordering.
- `Client/src/lib/services/api/pmsObjectiveMatrix.ts` — matrix API client.

### Server

- `Server/src/models/pms-template-version.model.ts` — objective configuration and table-layout schema.
- `Server/src/models/pms-objective.model.ts` — runtime Objective row schema.
- `Server/src/models/pms-objective-value.model.ts` — typed custom cell values.
- `Server/src/services/pms-template-objective-table-layout.ts` — normalization and validation of table layout, columns, groups, term policies, and formulas.
- `Server/src/services/pms-template.service.ts` — template persistence and objective configuration validation.
- `Server/src/services/assignment.service.ts` — assignment creation and predefined objective seeding.
- `Server/src/services/objective-assignment-seeding.service.ts` — deterministic row keys, coverage normalization, and idempotent row upserts.
- `Server/src/services/objective-matrix.service.ts` — annual matrix read model, visibility, permissions, cell construction, and row/column ordering.
- `Server/src/services/objective-matrix-write.service.ts` — cell writes, employee/manager row creation, Matrix validation, coverage, delete enforcement, transactions, and audit.
- `Server/src/services/objective.service.ts` — public service delegation for matrix operations.
- `Server/src/routes/objective.routes.ts` — authenticated objective matrix API routes.
- `Server/src/constants/pms.enums.ts` — role, term, source, status, and workflow constants.

### Relevant automated tests

- `Client/src/lib/components/pms/templates/builder/objectiveTableDesigner.phase2.test.ts`
- `Client/src/lib/components/pms/performance/employeeObjectiveMatrix.phase7.test.ts`
- `Server/test/services/pmsTemplateObjectiveTableLayout.service.test.ts`
- `Server/test/services/objectiveAssignmentSeeding.service.test.ts`
- `Server/test/services/objectiveMatrixRead.service.test.ts`
- `Server/test/services/objectiveMatrixWrite.service.test.ts`
- `Server/test/services/objectiveRoleColumnAccess.test.ts`
- `Server/test/contracts/templateObjectiveMatrixContract.test.ts`

