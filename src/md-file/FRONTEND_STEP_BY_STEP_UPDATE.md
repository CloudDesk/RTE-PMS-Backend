# 🎨 Frontend Update Guide: Step-by-Step

This guide explains how to update your Final Settlement UI to reflect the robust backend logic, based on the current UI flow (Steps 1-7).

---

## 🛑 Critical Rule: Trust the API
The backend now handles complex logic (LOP adjustments, Statutory Math, Gratuity). **Do not perform calculations in the Frontend.** Always bind directly to the API response fields.

---

## 🗓️ Step 2: Dates & Resignation
**Backend Change**:
The system now auto-detects `Loss of Pay (LOP)` days *during* the notice period.
*   **Impact**: Even if the dates (`Resignation` to `LWD`) span 60 days, the API might return `daysServed: 50` if the employee took 10 LOPs.
*   **Frontend Action**: Ensure the "Served Days" input field is populated from `apiResponse.data.daysServed` and not just a date diff.

---

## ⚠️ Step 3: Notice Period Recovery
**Current UI**: Shows `(Monthly Gross / 30) * Shortfall`.
**Update**:
*   **Shortfall Days**: The backend calculates this based on `daysServed` (which removes LOPs).
*   **Frontend Action**: No calculation change needed, but be aware `Shortfall` might be non-zero even if dates look correct.

---

## 💸 Step 5: Leave Encashment
**Current UI Image**: Shows `RATE/DAY: ₹3,333` (for 100k Gross).
*   *This implies `100,000 / 30` calculation.*
**Backend Change (Compliance Fix)**:
*   The API now calculates `perDayRate` based on **(Basic + DA) / 30**.
*   **Example**: If Basic is 50k, rate will be `₹1,666`, not `₹3,333`.
*   **Frontend Action**:
    *   **STOP** calculating `Gross / 30` in the frontend.
    *   **BIND** `apiResponse.data.leaveBalance[0].perDayRate` to the `RATE/DAY` display.
    *   **BIND** `apiResponse.data.leaveBalance[0].encashAmount` to the `Total Payout`.

---

## 📊 Step 7: Final Calculation (Summary)
*This step (not shown in images) requires the most changes.*

### 1. New Earnings to Display
You must add a row for **Gratuity** if it's non-zero.
```javascript
{data.finalCalculation.gratuity > 0 && (
  <div className="row">
    <span>Gratuity (5+ Years Service)</span>
    <span>{formatCurrency(data.finalCalculation.gratuity)}</span>
  </div>
)}
```

### 2. New Deductions to Display
You must break down the **Statutory Deductions** for the unpaid period.
```javascript
// New Statutory Rows
<div className="row">
  <span>Provident Fund (Unpaid Period)</span>
  <span>{formatCurrency(data.finalCalculation.providentFund)}</span>
</div>

<div className="row">
  <span>ESI (Unpaid Period)</span>
  <span>{formatCurrency(data.finalCalculation.esi)}</span>
</div>

<div className="row">
  <span>Professional Tax</span>
  <span>{formatCurrency(data.finalCalculation.professionalTax)}</span>
</div>
```

---

## ⚡ API Response Mapping Checklist

| UI Field | API Field | Update Needed? |
| :--- | :--- | :--- |
| **Served Days** | `daysServed` | ✅ Check LOP Logic |
| **Notice Recovery** | `finalCalculation.noticePeriodRecovery` | ✅ Use API Value |
| **Leave Rate/Day** | `leaveBalance[0].perDayRate` | 🚨 **CRITICAL**: Do not calc locally |
| **Encash Amount** | `leaveBalance[0].encashAmount` | ✅ Use API Value |
| **Gratuity** | `finalCalculation.gratuity` | 🆕 Add to UI |
| **Provident Fund** | `finalCalculation.providentFund` | 🆕 Add to UI |
| **ESI** | `finalCalculation.esi` | 🆕 Add to UI |
| **Net Pay** | `finalCalculation.netAmount` | ✅ Check `isNegative` flag |

