# Final Settlement (F&F) Implementation V3.0

## 1. Overview
The **Final Settlement (F&F)** module is a comprehensive automated system designed to calculate, validate, and process the final payouts for resigning employees. Version 3.0 introduces robust backend-driven logic, atomic transactions, and strict calendar-day accuracy for notice period recovery.

### Key Features V3.0:
*   **Zero-Logic Frontend**: The frontend is a "dumb" view layer; all financial calculations are performed 100% by the backend.
*   **Strict Calendar-Day Recovery**: Notice period shortfalls are calculated using exact calendar days (e.g., Feb 28 vs Mar 31) to specific precision, resolving timezone drift.
*   **Atomic Confirmation**: The confirmation process is wrapped in a MongoDB Transaction to ensure data consistency across `FinalSettlement`, `Payroll`, `User`, and `TaxDeclaration` collections.
*   **Auto-Payroll Generation**: Automatically generates valid `Payroll` records for unpaid gaps upon confirmation, ensuring the F&F payment appears in statutory reports.
*   **Dynamic PDF Generation**: Generates F&F letters with dynamic earnings/deductions tables (no blank rows) and precise formatting.

---

## 2. Core Workflows & Logic

### 2.1 Initialization (`GET /initialize/:employeeId`)
This endpoint acts as the reasoning engine for the settlement.
1.  **Unpaid Gaps Detection**:
    *   Scans from `Last Paid Payroll Month + 1` up to `Last Working Date (LWD)`.
    *   **Hold Filter**: If a month is found in "Hold Payrolls", it is skipped here to prevent double-counting.
    *   **Attendance Check**: Fetches actual attendance, weekends, and holidays to determine `Payable Days`.
    *   **LOP Logic**: `LOSS OF PAY = Employment Days - Payable Days`.
2.  **Hold Payrolls**:
    *   Fetches all `Hold` status payrolls.
    *   Aggregates their `Net Salary` for the final payout.
3.  **Notice Period Analysis**:
    *   Calculates `Days Served = LWD - Resignation Date`.
    *   `Shortfall = Notice Period - Days Served`.

### 2.2 Save Draft (`POST /save`) - *Strict Recalculation*
The system employs a **Trust-But-Verify** approach.
*   If `mode` is `'automatic'` (default), the backend **ignores** the frontend's calculated values for Notice Recovery and Unpaid Gaps.
*   It **re-executes** the core logic (Unpaid Gaps & Notice Recovery) using the raw dates provided.
*   **Benefit**: Identifies tampering or stale state from the UI.
*   *Exception*: If `mode` is `'manual'`, the backend accepts the frontend/user overrides.

### 2.3 Confirmation (`POST /confirm`) - *The Atomic Transaction*
This is the critical commit phase.
1.  **PDF Generation (Pre-Transaction)**: Generates the PDF using the latest data.
2.  **Transaction Start**: Locks the database session.
3.  **Re-Validation**: Fetches the draft again within the lock to ensure no concurrent edits.
4.  **Auto-Generate Payrolls**:
    *   For every **Unpaid Month** in the settlement:
        *   Creates a `Payroll` record.
        *   Sets status to `Completed`.
        *   Sets flag `isFinalSettlement: true`.
    *   **Hold Salary Injection**: The total value of all Hold Payrolls is added as a special `holdSalary` component to the **Last Unpaid Month's** payroll record.
5.  **Release Hold Payrolls**: Updates original Hold payrolls to `Completed` status.
6.  **Update Tax**: Marks Income Tax as "Processed" for the affected months in `TaxDeclaration`.
7.  **Deactivate User**: Sets `active: false` and `finalSettlementDone: true`.
8.  **Commit**: Saves all changes atomically.

---

## 3. Detailed Calculation Rules

### 3.1 Notice Period Recovery (Strict Calendar Mode)
Unlike standard approximations (Gross / 30), V3.0 uses **Exact Calendar Day** logic to handle shortfalls spanning months with different lengths (e.g., Feb vs March).

**Algorithm:**
1.  Determine **Recovery Start Date**: `LWD + 1 Day` (using UTC to prevent timezone shifts).
2.  Loop `i` from 0 to `Shortfall Days`:
    *   Identify the specific `Month` of the current iteration date.
    *   Get `Total Days in Month` (e.g., 28, 30, or 31).
    *   `Daily Rate = Monthly Gross / Total Days in Month`.
    *   `Total Recovery += Daily Rate`.
    *   Increment Date by 1.

**Example**:
*   *Shortfall*: 15 Days (Feb 20 - Mar 6).
*   *Feb (8 days)*: Rate = Gross / 28.
*   *Mar (7 days)*: Rate = Gross / 31.
*   *Result*: `(Gross/28 * 8) + (Gross/31 * 7)`.

### 3.2 Unpaid Gaps & LOP
*   **Payable Days**: `Present + Weekends + Holidays + Approved Paid Leaves`.
*   **Employment Days**: Days from month start to LWD.
*   **LOP Days**: `Employment Days - Payable Days`.
*   **Proration**:
    *   `Component Value = (Full Component / Days in Month) * Payable Days`.

### 3.3 Leave Encashment
*   **Basis**: **Basic Salary** (Standard Configuration).
*   *Configurable*: Can include DA if updated in service.
*   **Rate**: `(Monthly Basic * 12) / 365` OR `Monthly Basic / Days in Leaving Month` (Current: Monthly/DaysInMonth).
*   **Formula**: `Balance * Rate per Day`.

---

## 4. Data Models

### 4.1 FinalSettlement (`final-settlement.model.ts`)
*   `employeeId`: Ref to User.
*   `unpaidMonths`: Array of calculated gaps with detailed component breakdowns.
*   `holdPayrolls`: Array of linked Hold Payroll IDs.
*   `finalCalculation`: Flattened summary (Net, Total Payable, Deductions).
*   `status`: 'Draft' | 'Confirmed'.
*   `pdfUrl`: Link to the generated F&F letter.

### 4.2 Payroll Integration (`payrolls.model.ts`)
*   `isFinalSettlement`: Boolean flag (New in V3).
*   `holdSalary`: Number (Stores the released hold amount).
*   `status`: Updates to 'Completed' upon F&F confirmation.

---

## 5. Frontend Integration
**File**: `Step7Summary.svelte`

*   **Philosophy**: **Zero Logic**.
*   **Responsibility**:
    *   Display `netAmount` directly from API.
    *   Render `earningsList` and `deductionsList` from API data.
    *   Do NOT perform `A - B` calculations.
    *   Format currencies and dates.

---

## 6. PDF Template Logic (`fnf-pdf.helper.ts`)
The system uses `docxtemplater` with **Conditional Rendering** loops.

*   `{#earningsList}`: Only includes components where `amount > 0`.
    *   *Result*: No "Basic: 0" or "HRA: 0" rows.
*   `{#deductionsList}`: Only includes active deductions.
    *   *Result*: "Notice Recovery" row only appears if there is a recovery.

---

## 7. Developer Notes & Troubleshooting

### UTC vs Local Time
*   The system uses `Date.UTC` methods for iterating calculation days.
*   **Why**: Prevents "Day 15" becoming "Day 14" due to US/Server timezone offsets, which causes ₹50-₹100 discrepancies in recovery amounts.

### Re-Running Calculations
*   To force a re-calculation of a Draft, call `POST /save` with `mode: 'automatic'`.
*   This discards frontend values and re-runs the backend engine.
