# 🚀 FNF Frontend Implementation Guide (7-Step Wizard)

This guide provides the exact mapping and logic for implementing the Final Settlement wizard in the frontend.

---

## **📍 Step 1: Data Audit & Salary Verification**
*   **Purpose:** Initial scan of employee status and active salary structure.
*   **API Fields:**
    *   `salaryAssignment.monthlyGross`: The anchor for all pro-rata calculations.
    *   `lastPaidMonth`: Shows exactly when the payroll last stopped.
    *   `unpaidMonths.length`: Number of months requiring pro-rata salary.
    *   `leaveBalance`: Detects if Leave Policy is assigned.

---

## **📍 Step 2: Resignation Timeline**
*   **Purpose:** Sets the start and end dates for the financial period.
*   **API Fields:**
    *   `resignationSubmittedOn`: Used as the anchor for notice period calculation.
    *   `leavingDate`: The Last Working Day (LWD).
*   **Logic Note:** All calculations for "Worked Days" are anchored to the LWD. If LWD changes, you must re-initialize the settlement.

---

## **📍 Step 3: Notice Period Recovery**
*   **Purpose:** Calculates if the employee served their full notice or owes "Notice Pay".
*   **API Fields:**
    *   `noticePeriodDays`: Policy requirement (e.g., 60 days).
    *   `daysServed`: Calculated by backend as `LWD - Resignation Date + 1`.
    *   `excessInNotice`: If negative, this is the **Shortfall**.
    *   `noticePeriodRecovery`: The monetary value to deduct.
*   **Formula:** `(Gross Salary / 30) * Shortfall Days`.

---

## **📍 Step 4: Work Days & Unpaid Salary**
*   **Purpose:** Pays the employee for the "Gaps" (months worked but not yet paid).
*   **Frontend UI:** Loop through the `unpaidMonths` array.
*   **Data Mapping:**
    *   `monthYear`: Display as Header (e.g., "2026-01").
    *   `daysWorked`: Days the employee were active in that month.
    *   `salary`: The pro-rated Net Salary for that month.
*   **Component Breakdown (New):**
    *   The `components` object inside each month provides the pro-rated split for `basic`, `hra`, etc.
    *   **Logic:** `(Component / Days in Month) * Worked Days`.

---

## **📍 Step 5: Leave Encashment (Basic/30 Rule)**
*   **Purpose:** Payment for remaining Annual Leaves.
*   **Logic (Fixed in Backend):**
    *   **Rate per Day:** `(Basic Salary + DA) / 30`.
    *   **Amount:** `Balance Days * Rate per Day`.
*   **API Fields:**
    *   `leaveBalance[0].perDayRate`: The daily rate calculated on Basic/30.
    *   `leaveBalance[0].encashAmount`: The total payout.

---

## **📍 Step 6: Statutory Deductions**
*   **Purpose:** Taxes and PF for the unpaid period.
*   **Hide if Zero:** If these values are 0, hide the row in the UI to match the PDF.
*   **API Fields:**
    *   `finalCalculation.providentFund`: 12% of pro-rated Basic.
    *   `finalCalculation.professionalTax`: Based on monthly gross slabs.
    *   `finalCalculation.esi`: Hardcoded to 0 currently.

---

## **📍 Step 7: Final Summary (Reconciliation)**
*   **Purpose:** Final review of Total Earnings vs Total Deductions.
*   **API Fields:**
    *   `finalCalculation.totalPayable`: Sum of all earnings.
    *   `finalCalculation.totalDeductions`: Sum of PF + PT + Recovery.
    *   `finalCalculation.netAmount`: The final cheque amount.
    *   `isNegative`: **Flag** - If `true`, the UI should show a "Recovery Due" warning instead of "Payable".

---

## **🎨 UI Best Practices**
1.  **Zero-Value Hiding:** To keep the settlement clean, do not show rows for PF, PT, or LOP if the value is ₹0.
2.  **Date Format:** Localize dates to "DD MMM YYYY" for readability.
3.  **Currency:** Use the `IN` locale for formatting (e.g. ₹1,50,000.00).

**Reference Image Sync:** This guide is aligned with the 7-step wizard layout provided in the reference images.
