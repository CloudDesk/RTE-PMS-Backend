# Auto-Payroll Generation in Final Settlement V3.0

## 1. Overview
When a Final Settlement is **Confirmed**, the system automatically generates or updates official **Payroll Records** for every month included in the settlement period. This ensures that the Unpaid Days and Hold Salaries are properly properly recorded in the payroll ledger for statutory reporting (PF, PT, Tax), payslip generation, and accounting.

---

## 2. Trigger Point
**Endpoint**: `POST /final-settlement/confirm/:employeeId`
**Phase**: Inside the Atomic Transaction (Phase 2).

The generation happens **after** the PDF is generated but **before** the transaction is committed. This guarantees that if payroll generation fails, the entire settlement is rolled back.

---

## 3. The Logic Flow

### 3.1 Input Preparation
The system takes the calculated `unpaidMonths` array from the settlement draft.
*   It **sorts** these months chronologically (Oldest -> Newest).
*   It identifies the **Last Month** (The month containing the Last Working Day).
*   It calculates the **Total Net Hold Salary** from all released hold payrolls.

### 3.2 The Execution Loop
For each `month` in `unpaidMonths`:

#### A. Fetch Context
1.  **Salary Structure**: Fetches the active `SalaryAssignment` for the employee.
2.  **Tax Info**: Fetches `TaxDeclaration` for the relevant financial year.

#### B. Calculate Attendance & Gross
*   **Total Days**: Days in that specific calendar month (e.g., 28, 30, 31).
*   **Days Worked**: Payable days calculated during the F&F initialization (Present + Weekends + Holidays + Leaves).
*   **Formula**:
    ```typescript
    Attendance Adjusted Gross = Round((Days Worked / Total Days) * Monthly Gross)
    ```

#### C. Breakdown Components (Earnings)
The system applies the Salary Structure percentages to the `Attendance Adjusted Gross`.
*   **Basic**: `(Basic % / 100) * Adjusted Gross`
*   **HRA**: `(HRA % / 100) * Adjusted Gross`
*   **DA**: `(DA % / 100) * Basic`
*   **Travel/Conveyance**:
    *   *India*: `(Travel % / 100) * Adjusted Gross`
    *   *UAE*: Prorated fixed amount from assignment.
*   **Other Allowance**: Balancing figure.
    *   `Adjusted Gross - (Basic + HRA + DA + Travel)`

#### D. Calculate Deductions
These values are pulled directly from the F&F Calculation (which used the strict logic):
*   **PF**: 12% of Basic+DA (capped at 1800 if applicable).
*   **ESI**: 0.75% of Gross (if applicable).
*   **PT**: State-specific slab calculation.
*   **Income Tax**: Prorated tax for that specific month.
*   **LOP Amount**: `(Monthly Gross / Days in Month) * LOP Days`.

#### E. The "Hold Salary" Injection (Critical)
*   **The Rule**: We do not create separate payroll records for "Hold Release". Instead, we add the total released amount to the **Last Unpaid Month**.
*   **Logic**:
    ```typescript
    IF (Current Month == Last Month of Settlement) {
        Hold Salary Addition = Total Net Hold Amount;
    } ELSE {
        Hold Salary Addition = 0;
    }
    ```
*   **Benefit**: The employee receives one final consolidated payslip that includes their partial month pay + all released arrears.

#### F. Net Pay Calculation
```typescript
Net Salary = Adjusted Gross 
             - PF 
             - PT 
             - Income Tax 
             - ESI 
             + Reimbursements 
             + Hold Salary Addition  <-- The Injection
```

---

## 4. Database Actions (The "Upsert")

### 4.1 Payroll Record
The system searches for an existing `Payroll` record for `(Employee + Month + Year)`.

*   **Case 1: Record Exists (e.g., Draft or previous error)**
    *   Action: `UPDATE`
    *   Updates all financial fields with the new F&F values.
    *   Sets `status: 'Completed'`.
    *   Sets `isFinalSettlement: true`.
    *   Sets `holdSalary: Hold Salary Addition`.

*   **Case 2: No Record (New Month)**
    *   Action: `CREATE`
    *   Creates a new document with all calculated fields.
    *   Sets `status: 'Completed'`.
    *   Sets `isFinalSettlement: true`.

### 4.2 Release Original Hold Payrolls
The system finds the **Checklist of Hold Payrolls** (the previous months that were held).
*   Action: `UPDATE_MANY`
*   Query: `_id IN [Hold Payroll IDs]`
*   Update: `status: 'Completed'`, `isFinalSettlement: true`.
*   **Result**: These records now appear as "Paid" in history, but with 0 Net Pay transfer triggers because their value was moved to the F&F Payroll.

### 4.3 Tax Declaration
*   Action: `UPDATE`
*   Target: `TaxDeclaration` -> `monthlyDeductions` array.
*   Logic: Matches the specific month.
*   Update: `isProcessed: true`, `actualDeduction: Income Tax Amount`.
*   **Why**: Prevents the system from trying to deduct this tax again if a payroll re-run occurs.

---

## 5. End-to-End Logic Example

**Scenario**:
*   **Gross**: ₹30,000
*   **Hold Salary (Jan)**: ₹25,000 (Net)
*   **LWD**: Feb 15, 2026 (28 Days in Feb)
*   **Worked**: 15 Days

**Step 1: Unpaid Calculation (Feb)**
*   `Adjusted Gross`: (15 / 28) * 30,000 = **₹16,071**
*   `Basic (50%)`: ₹8,036
*   `HRA (40%)`: ₹6,428
*   `Other`: Balnace

**Step 2: Deductions (Feb)**
*   `PF`: ₹1,800 (Example)
*   `PT`: ₹200
*   `Tax`: ₹500

**Step 3: Hold Injection**
*   This is the last month (Feb).
*   `Hold Addition`: **₹25,000**

**Step 4: Net Pay (Feb Payroll Record)**
*   `Net` = 16,071 (Gross) - 2,500 (Deductions) + 25,000 (Hold)
*   **Final Net**: **₹38,571**

**Step 5: Record Creation**
*   Creates **Feb 2026 Payroll**.
*   Status: **Completed**.
*   IsFinalSettlement: **True**.
*   **Payslip** will show:
    *   Earnings: ₹16,071 (Breakdown)
    *   Arrears/Hold: ₹25,000
    *   Deductions: ₹2,500
    *   **Net Pay**: ₹38,571

---

## 6. Developer Summary
| Field | Value / Source |
| :--- | :--- |
| **Status** | `'Completed'` (Immediate Lock) |
| **isFinalSettlement** | `true` (Flags for UI/Reports) |
| **holdSalary** | Sum of all released Hold Payrolls (Only on LWD Month) |
| **payslipReleaseDate** | `new Date()` (Available immediately) |
| **processedAt** | `new Date()` |
