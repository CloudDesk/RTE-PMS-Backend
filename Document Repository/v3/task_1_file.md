Yes, permission/fill control is needed. Without that, the sheet builder will allow the admin to design columns, but the system will not know **who should fill which field during review**.

For all 3 images, the correct order should be:

**1. Create Objective Master**
Admin chooses objective type:

```text
Objective Type:
- Simple Objective
- Sheet / Table Objective
```

For these 3 images, user selects:

```text
Sheet / Table Objective
```

Then basic fields:

```text
Objective name
Code
Source: Global / Department / Role-based
Department if applicable
Description
Effective date
```

For sheet objective:

```text
Scoring: Context only by default
Weightage: Not mandatory / hidden
Target direction: Optional at row level
```

**2. Configure Sheet Layout**
This is where image 1, image 2, and image 3 formats are created.

Admin should configure:

```text
Columns
Rows
Header groups
Merged headers
Merged row labels
Column width
Column order
Visible / hidden columns
```

Example for image 3:

```text
Columns:
1. Objective
2. UOM
3. BM
4. Target
5. Q1 Actual
6. Q2 Actual
7. Q3 Actual
8. Q4 Actual
9. Actual
10. Gap
11. Remarks
```

Example for image 1:

```text
Grouped headers:
- Cell Divisor T.Mfg
  - BM
  - Target
  - Actual
  - Gap

Other columns:
- Resulting area
- Annual objective reference
- Description
- Unit of Measurement
- Specific key reasons for non-achievement
```

Example for image 2:

```text
Columns:
- Segment
- Scope
- Objective
- Actual Current
- Target
```

So yes, add/remove columns must be possible.

**3. Configure Column Type**
Each column needs a data type.

```text
Text
Long text / remarks
Number
Percentage
Date
Dropdown
Formula / calculated
Read-only label
```

Example:

```text
Objective = Text
UOM = Dropdown
BM = Percentage
Target = Percentage
Q1 Actual = Percentage
Actual = Formula
Gap = Formula
Remarks = Long text
```

**4. Configure Row / Objective Line Rules**
This is important because one sheet can have different kinds of objectives.

Each row can define:

```text
Target direction:
- Increase is planned
- Decrease is planned
- Maintain exact value
- Context only

Actual calculation:
- Manual entry
- Sum of Q1 + Q2 + Q3 + Q4
- Average of Q1 + Q2 + Q3 + Q4
- Latest filled term
- Custom formula

Gap calculation:
- No gap
- Target - Actual
- Actual - Target
- BM - Actual
- Actual - BM
- Absolute difference
- Custom formula
```

Example:

```text
Hardware downtime
Direction: Decrease is planned
Actual: Sum / latest term based on configuration
Gap: Actual - Target
Display: 5% above target
```

For non-technical users, we should show friendly wording, not only formula.

**5. Configure Fill Permission**
Yes, this is required.

After sheet layout is ready, admin configures who can fill each column/cell.

Permission levels:

```text
View only
Can fill
Required
Hidden
Locked after submit
Editable until manager review
```

Actors:

```text
Employee
Manager
Reviewer
Admin
System calculated
```

Example for image 3:

| Field | Employee | Manager | Admin | System |
|---|---|---|---|---|
| Objective | View | View | Configure | - |
| UOM | View | View | Configure | - |
| BM | View | View | Configure | - |
| Target | View | View | Configure | - |
| Q1 Actual | Fill in Q1 | Review/Edit optional | View | - |
| Q2 Actual | Fill in Q2 | Review/Edit optional | View | - |
| Q3 Actual | Fill in Q3 | Review/Edit optional | View | - |
| Q4 Actual | Fill in Q4 | Review/Edit optional | View | - |
| Actual | View | View | View | Calculate |
| Gap | View | View | View | Calculate |
| Remarks | Fill | Fill | View | - |

This should be configured in a simple screen like:

```text
Column name | Who fills this? | Required? | Available in terms | Lock rule
```

**6. Configure Term Availability**
This is needed for Q1/Q2/Q3/Q4.

Example:

```text
Q1 Actual -> only visible/fillable in Q1
Q2 Actual -> only visible/fillable in Q2
Q3 Actual -> only visible/fillable in Q3
Q4 Actual -> only visible/fillable in Q4
Remarks -> visible/fillable in all terms
Actual -> visible in all terms, calculated
Gap -> visible in all terms, calculated
```

If the cycle is quarterly, show Q1/Q2/Q3/Q4 fields.

If the cycle is half-yearly, show H1/H2 fields.

If the cycle is yearly, show Y1 field.

So the sheet builder should support dynamic term columns.

**7. Preview Before Activation**
Before activate, admin should preview:

```text
Admin configuration view
Employee fill view
Manager review view
Reviewer view
```

This is very important because the customer is non-technical. They should see exactly how the sheet will look before assigning.

**8. Activate Version**
Once configured:

```text
Save draft
Preview
Activate version
```

After activation, the structure should be locked.

If changes are needed later:

```text
Clone active version
Edit draft version
Activate new version
```

Assigned old records should not break.

**9. Assignment**
When assigning this objective:

```text
Select cycle
Select assessment terms
Filter employees by department / role
Select employees or all matched employees
Assign objective sheet
```

At assignment time, system should snapshot:

```text
Objective version
Sheet layout
Columns
Rows
Permissions
Formula rules
Term rules
```

This is important. If master changes later, old assigned review should remain stable.

**10. Employee / Manager Fill Flow**
During review:

Employee sees only allowed fields.

Example Q1:

```text
Employee can fill:
- Q1 Actual
- Remarks

Employee cannot edit:
- Objective
- UOM
- BM
- Target
- Actual
- Gap
```

Manager sees:

```text
Employee filled value
Manager comments
Manager editable fields only if permission allows
Calculated actual/gap
```

**Final Requirement Decision**

Yes, Task 1 should include this.

The correct Task 1 flow should be:

```text
Phase 1: Objective type selection
Phase 2: Sheet layout builder
Phase 3: Column and row configuration
Phase 4: Header merge/group configuration
Phase 5: Formula configuration for Actual and Gap
Phase 6: Fill permission configuration
Phase 7: Term-wise field availability
Phase 8: Preview by role
Phase 9: Version activation
Phase 10: Assignment snapshot and runtime fill view
```

Main rule:

The admin configures **what the sheet looks like** first.

Then configures **who can fill what**.

Then previews **how employee/manager will use it**.

Then activates and assigns.

--

**Phase 5 Checklist**

1. Create/select a `Sheet / Table Objective`.

2. Go to `Table Layout`.

3. Confirm default columns include:
   - `Actual`
   - `Gap`

4. Select the `Actual` column.

5. Confirm:
   - Data type is `Calculated`
   - `Calculation setup` appears inside selected column settings.

6. For `Actual`, test rules:
   - `Sum selected term actuals`
   - `Average selected term actuals`
   - `Latest filled term actual`
   - `Custom formula`

7. For `Actual`, select/unselect source columns:
   - `Q1 Actual`
   - `Q2 Actual`
   - `Q3 Actual`
   - `Q4 Actual`

8. Confirm preview text updates, for example:
   - `Sum(Q1 Actual + Q2 Actual + Q3 Actual + Q4 Actual)`

9. Select the `Gap` column.

10. Confirm:
   - Data type is `Calculated`
   - `Calculation setup` appears.

11. For `Gap`, test rules:
   - `Target - Actual`
   - `Actual - Target`
   - `BM - Actual`
   - `Actual - BM`
   - `Absolute difference`
   - `Custom formula`

12. Confirm preview text updates for Gap, for example:
   - `Target - Actual`

13. Change a normal column type to `Calculated`.

14. Confirm calculation setup appears for that column.

15. Change a calculated column back to `Short text` or another non-calculated type.

16. Confirm calculation setup disappears.

17. Save/create the sheet objective.

18. Reopen/edit draft/version and confirm:
   - `Actual` formula remains
   - `Gap` formula remains
   - selected source columns remain
   - preview still shows formula text

19. Try invalid case:
   - Actual formula with no source columns selected.
   - Save should be blocked by validation.

20. Confirm backend save does not fail for valid formula configuration.

for the calculation field choose - Use these term actual columns we have the all data type filed its not valid right and we can consider number and percentege but if both mixxed how we handle (Actual and same for gap also )