# Final Settlement (FNF) - Frontend Implementation Plan

This document outlines the step-by-step implementation plan for the **Final Settlement (FNF)** frontend. The frontend will follow the **"Zero-Logic"** architectural pattern, meaning it will rely entirely on the backend for calculations and data processing. The frontend's primary role is to display data and capture user inputs.

---

## 🏗️ Architecture: Zero-Logic Frontend

*   **Principle**: The frontend **NEVER** calculates financial figures (e.g., Gratuity, Notice Recovery, Leave Encashment).
*   **Data Flow**:
    1.  Frontend fetches initialized data from `GET /final-settlement/initialize/:id`.
    2.  User edits fields (e.g., `leavingDate`).
    3.  Frontend sends **Partial Updates** to `POST /final-settlement/save/:id`.
    4.  Backend recalculates EVERYTHING and returns the updated `finalCalculation`.
    5.  Frontend purely renders the returned response.

---

## 📱 Page & Route Structure

| Route | Component | Purpose |
| :--- | :--- | :--- |
| `/final-settlement` | `FNFList.svelte` | List all settlements (Drafts & Confirmed). Search & Filter. |
| `/final-settlement/create` | `FNFWizard.svelte` | The main multi-step wizard for processing FNF. |
| `/final-settlement/view/:id` | `FNFView.svelte` | Read-only view for confirmed settlements (Download PDF). |

---

## 🛠️ Step-by-Step Implementation

### Phase 1: State Management (The "Brain")

We need a centralized store to hold the complex `settlement` object.

**Store Interface:**
```typescript
interface FNFStore {
    isLoading: boolean;
    isSaving: boolean;
    data: FinalSettlement | null; // The full backend response object
    errors: Record<string, string>;
}
```

**Actions:**
*   `initialize(employeeId)`: Calls `/initialize` API.
*   `updateField(path, value)`: Updates local store.
*   `saveDraft()`: Calls `/save` API and **replaces** local store `finalCalculation` with the response.

---

### Phase 2: The Wizard Components

The "Create/Edit" page should be a Stepper/Wizard.

#### **Step 1: Employee Selection**
*   **UI**: A searchable dropdown (Autocomplete) to select an employee.
*   **Logic**:
    *   On selection, checks if a Draft already exists via API.
    *   If Draft exists -> Load it.
    *   If New -> Call `/initialize/:employeeId`.

#### **Step 2: Resignation & Dates (CRITICAL)**
*   **Fields**:
    *   `resignationSubmittedOn` (Date Picker)
    *   `leavingDate` (Date Picker) - **Triggers Recalculation**
    *   `leavingReason` (Text/Dropdown)
*   **Behavior**:
    *   When `leavingDate` changes, show a "Recalculating..." spinner.
    *   **Auto-Save** immediately to get updated `noticePeriodRecovery`, `daysServed`, and `unpaidMonths`.

#### **Step 3: Notice Period Details**
*   **UI**: Read-Only Display (mostly).
*   **Fields**:
    *   `Notice Period (Days)`: Read-only.
    *   `Days Served`: Read-only (Backend calculated).
    *   `Shortfall (Days)`: Read-only.
    *   `Notice Recovery Amount`: **INPUT (Overrideable)** or Read-only (depending on policy). *Ideally Read-only, overridden by adding a field in "Other Deductions" if manual adjustment is needed.*

#### **Step 4: Work Days & Salary (Unpaid Months)**
*   **UI**: A Table showing the breakdown of unpaid months.
*   **Columns**: Month, Total Days, Working Days, LOP Days, Payable Salary.
*   **Interactivity**:
    *   This is generally Read-Only as it comes from Attendance.
    *   *Optional*: Allow editing `lopDays` if manual override is allowed (would require backend support). For now, keep as **View Only**.

#### **Step 5: Leave Encashment**
*   **UI**: Simple Card/Table.
*   **Fields**:
    *   `Leave Balance`: Read-only.
    *   `Encashment Rate (Per Day)`: Read-only.
    *   `Total Encashment`: Read-only.

#### **Step 6: Additions & Deductions (Manual Inputs)**
*   **UI**: Two dynamic lists (Arrays).
*   **Section A: Reimbursements / Additions**
    *   "Add Item" Button -> Row with `Name` and `Amount`.
    *   Auto-sum to `totalOtherAdditions`.
*   **Section B: Ad-hoc Deductions**
    *   "Add Item" Button -> Row with `Name` and `Amount` (e.g., "Asset Damage").
    *   Auto-sum to `totalOtherDeductions`.

#### **Step 7: Final Review**
*   **UI**: A comprehensive "Payslip-like" summary.
*   **Sections**:
    *   Earnings (Hold Salary + Unpaid Salary + Encashment + Gratuity).
    *   Deductions (Notice Recovery + PT/PF/IT + Other Deductions).
    *   **Net Payable**.
*   **Action**: "Confirm Settlement" Button.

---

### Phase 3: Integration Logic (The "Glue")

#### **The Auto-Save Loop**
To ensure the "Zero-Logic" promise, we must sync with the server frequently.

```javascript
// Example Logic in Svelte/React
async function handleDateChange(newDate) {
    store.update(s => { s.data.leavingDate = newDate; });
    
    // Trigger Server Recalc
    store.isSaving = true;
    const response = await api.post(`/final-settlement/save/${employeeId}`, store.data);
    
    // Update Store with Server's "Truth" (Calculated totals)
    store.update(s => { 
        s.data = response.data; // This updates Notice Recovery, Gratuity, etc. automatically
        s.isSaving = false;
    });
}
```

---

### Phase 4: Confirmation & View

#### **Confirmation Modal**
*   **Warning**: "This action is irreversible. It will generate the Final Settlement PDF and email the employee."
*   **Input**: "Confirmed By" (Auto-filled with logged-in Admin).
*   **Action**: Call `/confirm/:id`.

#### **View Page (PDF)**
*   Display status: "CONFIRMED".
*   Show "Download FNF Letter" button.
*   Show "Email Status" (Sent/Failed).

---

## ✅ Checklist for Frontend Developer

- [ ] **Setup Store**: Create the FNF store to handle the large nested object.
- [ ] **Component Shell**: Create the Stepper navigation UI.
- [ ] **API Wrapper**: Ensure `save` calls return the *updated* object and the frontend *replaces* its local state with it.
- [ ] **LWD Trigger**: Ensure changing `leavingDate` triggers a save/recalc interaction.
- [ ] **Format Currency**: Use a helper to format all numbers as Currency (`₹ 10,000.00`).
- [ ] **Validation**: Ensure negative values are handled/displayed in Red.
- [ ] **Error Handling**: Gracefully handle 400/500 errors from the backend.
