# 🏦 Professional Tax (PT) Calculation Logic

Here is how the system calculates Professional Tax in the Final Settlement.

## 1. The Core Variable: `Earned Salary`
We use the **Actual Earned Salary** for the specific month, not the fixed Monthly Gross.
*   **Formula**: `(Monthly Gross / Days in Month) * Payable Days`
*   *Why?*: To ensure fairness. If an employee resigns on the 2nd of the month, their earned salary is very low, and they might fall below the taxable slab.

## 2. The Process
1.  **Fetch Configuration**: The system checks the `SalaryStructure` assigned to the employee for `statutoryDeductions.professionalTax`.
2.  **Get Slabs**: Retrieves the state-specific slabs (e.g., for Maharashtra, Karnataka, etc.).
3.  **Compare**:
    *   It takes the `Earned Salary`.
    *   It loops through the slabs.
    *   If `Earned Salary` matches a range (e.g., `> 10,000` and `< 99,999`), it picks that tax amount (e.g., `₹200`).

## 3. Example Scenario
*   **Employee**: John Doe
*   **Gross Salary**: ₹30,000 / month
*   **Resignation Date**: 5th of March
*   **Payable Days**: 5
*   **Earned Salary**: `(30,000 / 31) * 5` = **₹4,838**
*   **PT Slab** (Example based on Maharashtra Rules stored in DB): 
    *   `0 - 7,500`: **₹0**
    *   `7,501 - 10,000`: **₹175** (Specific to Config)
    *   `10,001+`: **₹200**
*   **Result**: Since ₹4,838 < ₹7,500, PT Deducted is **₹0**.
    *   *(If we used Fixed Gross of ₹30k, he would have been unfairly charged ₹200).*

## 4. Code Reference
`src/services/final-settlement.service.ts`

```typescript
// Calculate salary
const monthlySalary = (monthlyGross / daysInMonth) * payableDays;

// Calculate Prorated Basic...

// Calculate Deductions
const ptAmount = calculatePT(monthlySalary, currentMonth); // Uses Earned Salary
```
