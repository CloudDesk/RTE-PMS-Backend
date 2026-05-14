# 📄 Final Settlement (FNF) - Master Feature Specification

## **1. Introduction & Executive Summary**
The Final Settlement (Full & Final - F&F) module is a critical component of the HRMS, designed to handle the complex exit formalities of an employee. This document details the **Zero-Logic Architecture**, ensuring that all financial calculations are centralized in the backend to prevent discrepancies between the UI, the Database, and the generated PDF Letter.

---

## **2. Employee Status Transition & Lifecycle**
The FNF process triggers a specific lifecycle for the User object:
1.  **Selection:** An active employee is selected for settlement.
2.  **Initialization:** The system performs a "Delta Audit" between the last paid payroll and the current date.
3.  **Drafting:** The settlement is saved in a `Draft` or `PendingApproval` state.
4.  **Confirmation:** Upon confirmation:
    *   The `Users.finalSettlementDone` flag is set to `true`.
    *   The employee status is moved to `Exited`.
    *   An FNF record is permanently archived for compliance audit.

---

## **3. The 7-Step Comprehensive Wizard**

### **📍 Step 1: Data Audit & Salary Verification**
*   **UI Features:**
    *   Audit Card: "Last Paid Month" (e.g., Dec 2025).
    *   Audit Card: "Hold Payrolls Detect" (e.g., Jan 2026).
    *   Audit Card: "Unpaid Gap Count" (e.g., 2 Months).
*   **Logic:**
    *   Scans the `Payroll` collection for the latest record where `status === 'Paid'`.
    *   Identifies any `Hold` or `Processing` payrolls to include them as earnings.
*   **Calculations:**
    *   Fetches the **Current Active Salary Assignment** to determine the per-day rate for various components.

### **📍 Step 2: Resignation & Exit Timeline**
*   **UI Features:**
    *   Dates: Resignation Submitted On, Approved Last Working Day (LWD), and Settlement Effective Date.
*   **Logic:**
    *   This is the "Financial Anchor". All pro-rata factors for the final month are derived from the LWD.
    *   Example: LWD Feb 16 means the factor for February is `16/28`.

### **📍 Step 3: Notice Period Compliance**
*   **UI Features:**
    *   Input: Policy Notice Days (defaulted from contract).
    *   Display: Days Served (calculated).
    *   Display: Shortfall/Excess (calculated).
*   **Mathematical Logic:**
    *   `Served Days = (LWD - Resignation Date) + 1`. The `+1` ensures inclusion of the start and end dates.
    *   `Shortfall = Policy Days - Served Days`.
*   **Recovery Formula:**
    *   `Recovery = (Monthly Gross / 30) * Shortfall`.

### **📍 Step 4: Multi-Month Pro-rata Salary**
*   **UI Features:**
    *   Row-based display for each unpaid month.
    *   Toggle for "Override Days" (manual correction).
*   **The Component Breakdown Logic:**
    *   Instead of pro-rating the "Total", we pro-rate **every sub-component**.
    *   `Basic = (Structure Basic / Calendar Days) * Worked Days`.
    *   `HRA = (Structure HRA / Calendar Days) * Worked Days`.
*   **Transparency:** This ensures that tax calculations (like PT) are applied correctly to the earned gross of that specific month.

### **📍 Step 5: Leave Encashment (Policy Aligned)**
*   **UI Features:**
    *   Leave Type: Annual Leave (AL).
    *   Input: Encashable Days (defaulted from balance).
*   **Logic (Basic/30):**
    *   **Per Day Rate:** `(Monthly Basic + DA) / 30`.
    *   **Total:** `Days * Per Day Rate`.
    *   Note: DA is included only if it exists in the employee's specific structure.

### **📍 Step 6: Statutory Deductions & Compliance**
*   **UI Features:**
    *   Deduction breakdown for PF, PT, and ESI.
*   **PF (Provident Fund):**
    *   Uses 12% of `(Prorated Basic + DA)`.
    *   Ceiling: If the wage exceeds ₹15,000, it uses ₹15k as the base (Result = ₹1,800).
*   **PT (Professional Tax):**
    *   Calculated dynamically based on the state slabs assigned to the employee's location.

### **📍 Step 7: Final Summary & Net Pay**
*   **UI Features:**
    *   Total Earnings vs Total Deductions.
    *   "Net Payable" or "Recovery Due" indicator.
*   **Words Calculation:**
    *   Numeric net pay is converted to the Indian numbering system (e.g., Lakhs).
    *   Result: "Rupees Twenty One Thousand Seven Hundred Sixty Only".
   ### **PDF Generation & Storage**
*   **Trigger:** The PDF is generated **only** when the HR clicks "Confirm" (Step 7).
*   **Storage:** The file is uploaded to the cloud storage bucket, and the public/signed URL is stored in the `pdfUrl` field of the Final Settlement record.
*   **Availability:**
    *   **Admin UI:** Once confirmed, the `GET /final-settlement/:employeeId` response will include a `pdfUrl`. The UI should display a **"Download PDF"** button.
    *   **Employee Email:** An automated email is sent to the employee with the direct download link.

---

## **4. Technical Calculation Formulas (Excel Proof)**

| Calculation | Logic / Formula | Notes |
| :--- | :--- | :--- |
| **Prorated Factor** | `Worked Days / Days in Month` | Calculated per month |
| **LOP Deduction** | `(Gross / Days in Month) * LOP Days` | Deducted from Gross |
| **Notice Recovery** | `(Gross / 30) * Shortfall Days` | Round to nearest INR |
| **Leave Rate**| `(Basic + DA) / 30` | Company Standard |
| **Gratuity (Future)**| `(Basic * 15 / 26) * Service Years` | Eligible > 4.66 Years |

---

## **5. PDF Generation & Template Standard**

The system uses **Single Curly Braces `{}`** syntax for the `.docx` template engine.

### **Core Template Variables:**
*   `{empNo}`: Employee ID.
*   `{resignDate}`: Date of resignation submission.
*   `{leavingDate}`: Last working day.
*   `{salaryDays}`: Actual days being paid for.
*   `{monthDays}`: The calendar base (e.g. 31 or 60 for two months).

### **Conditional Hiding Logic:**
To prevent the letter from showing "₹0" for items that don't apply, use **Section Tags**:
*   `{#pf} PF Amount: {pf} {/pf}`
*   `{#noticeRecovery} Notice Recovery: {noticeRecovery} {/noticeRecovery}`

---

## **6. Backend Architecture & API Specs**

### **Service: `FinalSettlementService`**
*   **`initialize()`**: The brain of the module. It aggregates data from `Users`, `Payroll`, `AttendanceRecord`, and `SalaryAssignment`.
*   **`calculate()`**: A partial calculation engine used by the frontend to show "Live" math updates when inputs (like LOP) change.

### **Model: `FinalSettlementModel`**
The database schema stores:
1.  **Audit Data**: Which months were gaps.
2.  **Breakdown**: Individual components of pro-rated months.
3.  **Audit Trail**: Who approved the settlement and when.

---

## **7. Edge Cases & Error Handling**

1.  **Negative Settlement:** If deductions > earnings, the system marks `isNegative: true`. The PDF will correctly display this as "Amount Recoverable" instead of "Amount Payable".
2.  **Missing Structure:** If an employee has no Salary Assignment, the system defaults to a `0` calculation and notifies the user to assign a structure first.
3.  **Leap Year Logic:** All calendar-based pro-rations use the JavaScript `new Date(year, month, 0).getDate()` to ensure February 29th is handled correctly.
4.  **Inclusive LWD:** If LWD is 31st Jan, the system must include the 31st as a worked day.

---

## **8. Frontend Implementation Checklist**
*   [ ] Use `GET /initialize/:employeeId` for Step 1.
*   [ ] Do NOT calculate `noticeRecovery` on the client.
*   [ ] Show/Hide ESI based on the `esi` value in `finalCalculation`.
*   [ ] Ensure the "Hold Salary" card correctly labels which month is being paid.

---

## **9. Conclusion**
The Final Settlement feature is mathematically robust, compliant with Indian Labor laws, and provides a transparent breakdown for the exiting employee. By centralizing logic in the backend service, we maintain a "Single Version of Truth" for every financial transaction.

---
*Documentation Version: 1.2.0*  
*Last Updated: February 2026*  
*Authorized by: Antigravity AI Engine*
