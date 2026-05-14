# Final Settlement (FNF) - Frontend Implementation Guide

## 1. Zero-Logic Architecture Principle
The Frontend is a **"Dumb View"**. It must NOT perform financial math (e.g., calculating tax, leave encashment amounts, or notice recovery).
*   **Role**: Collect Input -> Send to Backend -> Display Result.
*   **Validation**: Only validates format (Required fields, Date validity).
*   **Calculation**: Triggered via `calculate` API whenever critical fields (LWD, Dates) change.

---

## 2. Global State Interface (Store)

Ideally, store this in a Svelte Store or React Context (`SettlementContext`).

```typescript
// The complete state object synchronized with backend
interface SettlementState {
  employeeId: string;
  
  // Step 2: Resignation
  resignationDetails: {
    resignationSubmittedOn: string; // ISO Date
    leavingDate: string;            // ISO Date (LWD)
    leavingReason: string;
    settlementDate: string;         // ISO Date
  };

  // Step 3: Notice Pay
  noticePay: {
    noticeRequired: boolean;
    noticePeriodDays: number;
    daysServed: number;             // Bound to API 'daysServed'
    excessInNotice: number;         // Bound to API 'excessInNotice'
    noticePeriodRecovery: number;   // Bound to API 'noticePeriodRecovery' 
  };

  // Step 4: Payables (Hold & Unpaid)
  workDays: {
    lastPaidMonth: string;
    holdPayrolls: Array<{
      payrollId: string;
      monthYear: string;
      netSalary: number;
      // ...other display fields
    }>;
    unpaidMonths: Array<{
      monthYear: string;
      daysWorked: number;          // USER EDITABLE
      lopDays: number;             // USER EDITABLE (Recalculates on Blur)
      salary: number;              // Display Only
      // ...statutory breakdown
    }>;
  };

  // Step 5: Leave Encashment
  leaveEncashment: {
    leaveBalance: Array<{
      leaveType: string;
      balance: number;
      perDayRate: number;         // Display Only (from Backend)
      encashAmount: number;       // Display Only (from Backend)
    }>;
  };

  // Step 6: Adjustments
  adjustments: {
    reimbursements: Array<{ description: string; amount: number }>;
    otherAdditions: Array<{ description: string; amount: number }>;
    otherDeductions: Array<{ description: string; amount: number }>;
  };

  // Step 7: Final Totals (Display Only)
  finalCalculation: {
    totalHoldAmount: number;
    totalUnpaidSalary: number;
    totalLeaveEncashment: number;
    gratuity: number;
    noticePeriodRecovery: number;
    totalDeductions: number;      // Includes PF, PT, Tax
    netAmount: number;
  };
}
```

---

## 3. Step-by-Step Implementation Views

### Step 1: Initialization (Loader)
*   **Logic (Crucial)**:
    1.  First, call `GET /final-settlement/:employeeId`.
    2.  **Case A (Found)**: If a record exists (Draft or Confirmed), **LOAD IT**. Do not call initialize.
        *   If `status === 'Confirmed'`, Show "View Only" mode with Download Button.
        *   If `status === 'Draft'`, Load data into state and allow editing.
    3.  **Case B (Not Found)**: If 404, call `GET /final-settlement/initialize/:employeeId` to start a fresh calculation.
*   **Response Handling**:
    *   Map the response `data` to your local `SettlementState`.

### Step 2: Resignation Details
*   **Inputs**:
    *   `leavingDate` (LWD): Date Picker.
    *   `settlementDate`: Date Picker.
*   **Logic**:
    *   **On Change (LWD)**: You MUST trigger the `calculate` API.
    *   *Why?* Changing LWD affects Notice Period, Unpaid Days, and Statutory calculations.

### Step 3: Notice Period
*   **Display**:
    *   READ-ONLY: `Notice Period Days` (from User Profile).
    *   READ-ONLY: `Days Served` (from Backend).
    *   READ-ONLY: `Shortfall / Excess` (from Backend).
    *   **Editable**: `Recovery Amount` (Allow admin to override manual waiver).
*   **Logic**:
    *   Display "Recovery Amount" in **Red** if positive.
    *   Display "Excess Pay" (if applicable) in **Green**.

### Step 4: Salary & Work Days
*   **List 1: Hold Payrolls**:
    *   Display Read-Only list of held months.
*   **List 2: Unpaid Months**:
    *   Render a table row for each month in `state.workDays.unpaidMonths`.
    *   **Editable Columns**: `Days Worked` logic is complex.
    *   **Best Practice**: Make `LOP Days` editable.
        *   User changes `LOP Days` -> Frontend updates state -> Calls `calculate` -> Backend returns new salary figures.

### Step 5: Leave Encashment
*   **Display**: Table of Leave Types (Annual, etc.).
*   **Columns**: Balance | Per Day Rate | Total Amount.
*   **Interaction**: None (Purely derived), unless you want to allow manual adjustment of "Balance".

### Step 6: Additions & Deductions
*   **UI**: Dynamic List (Add/Remove Row).
*   **Fields**: `Description` (Text), `Amount` (Number).
*   **Logic**:
    *   On any add/remove/change -> Update local state -> Call `calculate` to update specific "Total Payable" / "Total Deduction" sums.

### Step 7: Final Review & Confirmation
*   **Display**: Two card layout (Earnings vs Deductions).
*   **Earnings**: Unpaid Salary + Hold Salary + Leave Encashment + Reimbursements.
*   **Deductions**: Notice Recovery + PF + PT + TDS + Other Deductions.
*   **Net Pay**: Big bold number (Green if positive, Red if negative).
*   **Action**:
    *   Button: "Confirm & Generate Letter".
    *   **API Call**: `POST /final-settlement/confirm/:employeeId`.
    *   **On Success**: Show Success Modal with "Download PDF" link.

---

## 4. API Integration Guide

### A. The "Calculate" Loop
Whenever the user changes a date or a number (LOP days, adjustment amount), run this function (debounced):

```typescript
async function recalculate(currentState) {
  // Construct partial payload
  const payload = {
    employeeId: currentState.employeeId,
    leavingDate: currentState.resignationDetails.leavingDate,
    noticePeriodRecovery: currentState.noticePay.noticePeriodRecovery, // Send manual override if any
    unpaidMonths: currentState.workDays.unpaidMonths, // Contains updated LOP days
    otherAdditions: currentState.adjustments.otherAdditions,
    otherDeductions: currentState.adjustments.otherDeductions
  };

  const response = await api.post('/final-settlement/calculate', payload);

  // MERGE response back to state
  // ONLY update the financial fields, keep user focus
  updateState(draft => {
    draft.finalCalculation = response.data.data; // The 'calculation' object
    draft.workDays = response.data.workDays;     // Updated salary breakdowns
  });
}
```

### B. The "Confirm" Action
```typescript
async function confirmSettlement() {
  const payload = {
    ...fullState,
    confirmedBy: currentUser.id
  };
  
  await api.post(`/final-settlement/confirm/${employeeId}`, payload);
}
```

---

## 5. Variable Mapping Verification

| Frontend Label | API Field (Response) | Component |
| :--- | :--- | :--- |
| **Notice Recovery** | `noticePeriodRecovery` | Step 3 / Summary |
| **Shortfall Days** | `excessInNotice` (Negative Value) | Step 3 |
| **Days Served** | `daysServed` | Step 3 |
| **Hold Salary** | `holdPayrolls[].netSalary` | Step 4 |
| **Unpaid Salary** | `unpaidMonths[].salary` | Step 4 |
| **LOP Amount** | `unpaidMonths[].lopAmount` | Step 4 |
| **Leave Balance** | `leaveBalance[].balance` | Step 5 |
| **Encash Rate** | `leaveBalance[].perDayRate` | Step 5 |
| **Provident Fund** | `finalCalculation.providentFund` | Summary |
| **Income Tax** | `finalCalculation.incomeTax` | Summary |
| **Professional Tax** | `finalCalculation.professionalTax` | Summary |
| **Net Payable** | `finalCalculation.netAmount` | Summary |

---

## 6. PDF & Status
*   **Generation Engine**: Backend uses `LibreOffice` and `DocxTemplater` to generate a rigorous legal document from `Final_Settlement.docx`.
*   **Storage**: The final PDF is uploaded to **Google Cloud Platform (GCP)** Storage.
*   **Frontend**: The API returns a direct `pdfUrl` (GCP Link) in the confirm response. Use this to render the Download button.
*   **Status**: Once confirmed, the UI should lock (disable all inputs) and show a banner "Settlement Confirmed on [Date]".

---

## 7. Detailed Logic & Interaction Flow (The "Handshake")

This section explains exactly **WHO** (Frontend vs. Backend) does **WHAT** at each step of the Final Settlement process.

### The Golden Rule
*   **The Frontend's Job**: Collect Inputs (Dates, numbers) & Display Outputs.
*   **The Backend's Job**: Do ALL the Math (Tax, PF, PT, Net Pay).

### 🟢 Step 1: Page Load (Initialization)
1.  **User**: Opens the "Final Settlement" page for Employee X.
2.  **Frontend**: Calls `GET /final-settlement/initialize/EmployeeX`.
3.  **Backend Logic**:
    *   Looks at `Payroll` DB: Finds the last month the employee was paid (e.g., March).
    *   Looks at `Attendance` DB: Calculates days worked in April (Unpaid).
    *   Looks at `SalaryStructure`: Knows the Basic, HRA, etc.
    *   **Result**: Returns an "Initial State" object with everything pre-filled.
4.  **Frontend**: Saves this data to `state` and shows Step 1.

### 🟢 Step 2: Employee Resignation Details
1.  **User**: Changes the "Last Working Day" (LWD) from April 15th to April 20th.
2.  **Frontend**:
    *   **Logic**: "Oh, the date changed! I need new numbers."
    *   **Action**: Calls `POST /final-settlement/calculate` sending the new date.
3.  **Backend Logic**:
    *   Recalculates "Days Served".
    *   Recalculates "Unpaid Salary" for those extra 5 days (15th to 20th).
    *   Recalculates Taxes for the increased salary.
    *   **Result**: Returns updated `finalCalculation` totals.
4.  **Frontend**: Updates the "Net Pay" display with the new numbers.

### 🟢 Step 3: Notice Period Recovery
1.  **Scenario**: Employee didn't serve the full notice period.
    *   *Required*: 60 Days.
    *   *Served*: 50 Days.
    *   *Shortfall*: 10 Days.
2.  **Frontend**:
    *   Shows: "Shortfall: 10 Days".
    *   Shows: "Recovery Amount: ₹15,000" (Calculated by Backend).
3.  **User**: Decides to **waive** the recovery (manual override).
    *   User edits "Recovery Amount" input box to `0`.
4.  **Frontend**:
    *   sends `{ noticePeriodRecovery: 0 }` to `POST /final-settlement/calculate`.
5.  **Backend Logic**:
    *   Sees the manual override.
    *   Updates `TotalDeductions` (Total Deductions goes DOWN).
    *   Updates `NetPay` (Net Pay goes UP).
    *   **Result**: Returns new totals.

### 🟢 Step 4: Unpaid Salary (Work Days)
1.  **Frontend**: Displays a table of "Unpaid Months" (e.g., April).
    *   Shows: "Days Worked: 20".
2.  **Scenario**: HR realizes the employee took 2 unauthorized leave days (LOP).
3.  **User**: Edits the "LOP Days" column from `0` to `2`.
4.  **Frontend**:
    *   Updates local state (`unpaidMonths[0].lopDays = 2`).
    *   Calls `POST /final-settlement/calculate`.
5.  **Backend Logic**:
    *   Formula: `Payable Days = Total Days - LOP Days`.
    *   Proration: `Salary = (MonthlyGross / 30) * Payable Days`.
    *   Result: Salary decreases.
6.  **Frontend**: The UI updates to show the lower salary amount.

### 🟢 Step 5: Leave Encashment
1.  **Frontend**: Displays "Annual Leave Balance: 10".
2.  **User**: Sees the auto-calculated amount: `10 * Rate = ₹10,000`.
3.  **Backend Logic (happening behind the scenes)**:
    *   Formula: `Rate = (Basic + DA) / 30`.
    *   It does NOT just use Gross Salary. It specifically looks for Basic + DA components for legal compliance.
4.  **Frontend**: Just displays the final `encashAmount` sent by the backend.

### 🟢 Step 6: Adjustments (Add/Deduct)
1.  **User**: Adds a "Laptop Damage" deduction of ₹5,000.
2.  **Frontend**:
    *   Adds `{ description: "Laptop Damage", amount: 5000 }` to the deductions array.
    *   Calls `calculate` API.
3.  **Backend Logic**:
    *   Adds 5000 to `totalDeductions`.
    *   Subtracts 5000 from `netPay`.
    *   **Result**: Returns updated totals.

### 🟢 Step 7: Final Confirmation
1.  **Frontend**: Shows a "Summary Card".
    *   Earnings: ₹50,000
    *   Deductions: ₹5,000
    *   **Net Pay: ₹45,000**
2.  **User**: Clicks "Confirm & Terminate".
3.  **Frontend**: Calls `POST /final-settlement/confirm`.
4.  **Backend Logic**:
    *   **Locks the Data**: Sets status to `Confirmed`. No more edits allowed.
    *   **Generates PDF**: Fills an HTML template with the ₹45,000 details and converts to PDF.
    *   **Emails**: Sends the PDF to the employee.
5.  **Frontend**:
    *   Receives success response.
    *   Shows "Download PDF" button.
    *   Disables all input fields.

### Summary of Responsibilities

| Feature | Frontend | Backend |
| :--- | :--- | :--- |
| **Notice Calculation** | Input: LWD & Resignation Date | Logic: `(Gross/30) * Shortfall` |
| **Salary per Day** | Input: LOP Days | Logic: `(Gross/TotalDays) * WorkedDays` |
| **Tax (TDS)** | Display Only | Logic: Sum of planned monthly taxes |
| **PF / PT** | Display Only | Logic: Statutory % (12% of Basic, etc) |
| **Net Pay** | Display Only | Logic: `Payable - Deductions` |
