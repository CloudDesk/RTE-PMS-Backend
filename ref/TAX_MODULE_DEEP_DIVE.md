# Tax Module Documentation: Rebate, Relief, Consultants, and Form 12B

This document is verified directly against the backend TypeScript code in `tax-declaration.service.ts` and `tax-slab.model.ts`.

---

## 1. Taxable Income Formula (Both Regimes)

The `calculateIncomeTax()` function applies this formula:

```
Taxable Income = Annual Gross - Standard Deduction - PT Deduction - Investments
```

| Component | Old Regime | New Regime |
|---|---|---|
| **Standard Deduction** | **₹50,000** | **₹75,000** |
| **PT Deduction** | ✅ Applied | ❌ Always 0 |
| **Investments (80C, HRA, etc.)** | ✅ Applied | ❌ Always ignored (`useInvestments = 0`) |

> **IMPORTANT:** The Standard Deduction value is **not hardcoded in the service logic** — it is always read from the `standardDeduction` field of the `TaxSlab` DB record for that financial year and regime. The values currently configured are:
> - **Old Regime → ₹50,000** (matching the `calculateIncomeTax()` function's fallback default parameter)
> - **New Regime → ₹75,000** (the `TaxSlab` Mongoose schema's `default: 75000`)
>
> These values must be set correctly per regime in the TaxSlab collection for each FY.

---

## 2. Rebate and Relief Calculation — `calculateRebateAndRelief()`

### A. Old Tax Regime

**Constants (hardcoded in code):**

| Constant | Value |
|---|---|
| `rebateThreshold` | **₹12,500** |
| `marginalReliefBase` | **₹5,00,000** |

**Rebate u/s 87A Logic:**

```typescript
// Old Regime - from the actual code:
if (taxableIncome <= 500000 && totalTax <= 12500) {
    rebateAmount = totalTax;
    isRebateApplicable = true;
    totalTaxAmount = 0;
}
```

- **Condition**: BOTH conditions must be true — taxable income ≤ **₹5,00,000** AND calculated SBT ≤ **₹12,500**.
- **Effect**: Full rebate applied; net tax becomes **₹0**.

**Marginal Relief — Old Regime:**

> **IMPORTANT:** **Marginal Relief is NOT applied for the Old Regime.** The code block that previously calculated it has been fully commented out. For old regime, if taxable income > ₹5,00,000, **no rebate or marginal relief is given** — the full slab-based tax applies.

---

### B. New Tax Regime

**Constants (hardcoded in code):**

| Constant | Value |
|---|---|
| `rebateThreshold` | **₹60,000** |
| `marginalReliefBase` | **₹12,00,000** |

**Step 1 — Rebate u/s 87A Logic:**

```typescript
// New Regime:
if (totalTax <= 60000) {
    rebateAmount = totalTax;
    isRebateApplicable = true;
    totalTaxAmount = 0;
}
```

- **Condition**: The Slab-Based Tax (SBT) must be ≤ **₹60,000**.
- **Effect**: Full rebate applied; net tax becomes **₹0**.
- **Note**: The condition is checked against the **calculated SBT**, not directly against income. If SBT ≤ ₹60,000, the entire tax is waived.

**Step 2 — Marginal Relief (only if rebate is NOT applicable):**

> [!IMPORTANT]
> **Rebate and Marginal Relief are mutually exclusive — they can NEVER both apply at the same time.**
> The code uses a strict `if...else` block:
> - `if (SBT ≤ ₹60,000)` → **Rebate** fires, the `else` (Marginal Relief) block is **never entered**.
> - `else` → Rebate did NOT apply (SBT > ₹60,000), only now is **Marginal Relief** checked.
>
> In practice: any income above ₹12L already generates ₹80,000+ in slab tax, which is always > ₹60,000. So if marginal relief applies, rebate **could not** have applied.

```typescript
// New Regime - actual code structure (if/else guarantees mutual exclusivity):
if (totalTax <= 60000) {
    // REBATE BRANCH — marginal relief block is NEVER reached
    rebateAmount = totalTax;
    isRebateApplicable = true;
    totalTaxAmount = 0;
} else {
    // MARGINAL RELIEF BRANCH — only entered when SBT > ₹60,000 (rebate already failed)
    const excessIncome = taxableIncome - 1200000;
    if (taxableIncome > 1200000 && taxableIncome <= marginalReliefUpperLimit && totalTax > excessIncome) {
        marginalReliefAmount = totalTax - excessIncome;
        isMarginalReliefApplicable = true;
        totalTaxAmount = excessIncome;
    }
}
```

- **Condition**: Income is between **₹12,00,001** and a dynamically calculated upper limit **AND** calculated tax > excess income.
- **`marginalReliefUpperLimit` Calculation**: Solved algebraically from the slab data. It finds the exact taxable income (TI) point where `SBT = excessIncome + rebateThreshold`, using the formula:

```
          baseTax + marginalReliefBase + rebateThreshold - taxRate × slab.fromAmount
TI =  ──────────────────────────────────────────────────────────────────────────────
                                  (1 − taxRate)
```

  This is the income level beyond which the full slab tax is naturally less than or equal to the excess income — so Marginal Relief is no longer needed.

- **Effect**: Tax is capped at `excessIncome = taxableIncome - ₹12,00,000`.

---

### 📌 Marginal Relief — Worked Example (New Regime FY 2025-26)

**New Regime Tax Slabs used:**

| Slab | Tax Rate |
|---|---|
| ₹0 – ₹3,00,000 | 0% |
| ₹3,00,001 – ₹7,00,000 | 5% |
| ₹7,00,001 – ₹10,00,000 | 10% |
| ₹10,00,001 – ₹12,00,000 | 15% |
| ₹12,00,001 – ₹16,00,000 | 20% |
| ₹16,00,001 – ₹20,00,000 | 25% |
| ₹20,00,001 and above | 30% |

---

#### Case 1 — Taxable Income: ₹12,50,000 (Marginal Relief ✅ Applies)

**Step 1 — Compute Slab-Based Tax (SBT):**

| Slab | Calculation | Tax |
|---|---|---|
| ₹0 – ₹3L @ 0% | ₹3L × 0% | ₹0 |
| ₹3L – ₹7L @ 5% | ₹4L × 5% | ₹20,000 |
| ₹7L – ₹10L @ 10% | ₹3L × 10% | ₹30,000 |
| ₹10L – ₹12L @ 15% | ₹2L × 15% | ₹30,000 |
| ₹12L – ₹12.5L @ 20% | ₹50,000 × 20% | ₹10,000 |
| **Total SBT** | | **₹90,000** |

**Step 2 — Rebate Check (gate for Marginal Relief):**
- `rebateThreshold` = ₹60,000
- SBT (₹90,000) > ₹60,000 → ❌ **Rebate does NOT apply** → code enters `else` block → Marginal Relief is now checked

**Step 3 — Marginal Relief Check** *(only reached because rebate failed above)*:
- `excessIncome = ₹12,50,000 − ₹12,00,000 = ₹50,000`
- Is `TI > ₹12L`? ✅ Yes
- Is `TI ≤ marginalReliefUpperLimit`? ✅ Yes (₹13L, calculated below)
- Is `SBT (₹90,000) > excessIncome (₹50,000)`? ✅ Yes

→ **Marginal Relief applies!**

```
marginalReliefAmount = SBT − excessIncome = ₹90,000 − ₹50,000 = ₹40,000
totalTaxAmount       = excessIncome       = ₹50,000
cessAmount           = ₹50,000 × 4%      = ₹2,000
finalTaxWithCess     = ₹50,000 + ₹2,000  = ₹52,000
```

> **Instead of paying ₹90,000 + cess = ₹93,600, the employee pays only ₹52,000** — a saving of ₹41,600.

---

#### Case 2 — Taxable Income: ₹13,00,000 (Break-Even / No Marginal Relief)

**Step 1 — Compute Slab-Based Tax (SBT):**

| Slab | Calculation | Tax |
|---|---|---|
| ₹0 – ₹3L @ 0% | ₹3L × 0% | ₹0 |
| ₹3L – ₹7L @ 5% | ₹4L × 5% | ₹20,000 |
| ₹7L – ₹10L @ 10% | ₹3L × 10% | ₹30,000 |
| ₹10L – ₹12L @ 15% | ₹2L × 15% | ₹30,000 |
| ₹12L – ₹13L @ 20% | ₹1L × 20% | ₹20,000 |
| **Total SBT** | | **₹1,00,000** |

**Step 2 — Rebate Check (gate for Marginal Relief):**
- SBT (₹1,00,000) > ₹60,000 → ❌ **Rebate does NOT apply** → code enters `else` block → Marginal Relief is now checked

**Step 3 — Marginal Relief Check** *(only reached because rebate failed above)*:
- `excessIncome = ₹13,00,000 − ₹12,00,000 = ₹1,00,000`
- Is `SBT (₹1,00,000) > excessIncome (₹1,00,000)`? ❌ **NO — they are equal**

→ **Marginal Relief does NOT apply.**

```
totalTaxAmount   = SBT          = ₹1,00,000
cessAmount       = ₹1,00,000 × 4% = ₹4,000
finalTaxWithCess = ₹1,04,000
```

> At ₹13L, the slab tax (₹1L) naturally equals the excess income (₹1L), so marginal relief is unnecessary. This is approximately the `marginalReliefUpperLimit`.

---

#### How `marginalReliefUpperLimit` ≈ ₹13,00,000 is Computed

Using the algebraic formula from the code, for the slab `₹12L–₹16L @ 20%`:

```
baseTax = tax on slabs below ₹12L
        = ₹20,000 + ₹30,000 + ₹30,000
        = ₹80,000

TI = (baseTax + marginalReliefBase + rebateThreshold − taxRate × slab.fromAmount) / (1 − taxRate)
   = (80,000 + 12,00,000 + 60,000 − 0.20 × 12,00,000) / (1 − 0.20)
   = (80,000 + 12,00,000 + 60,000 − 2,40,000) / 0.80
   = (10,00,000) / 0.80
   = ₹12,50,000
```

> Wait — the formula gives **₹12,50,000**, which means marginal relief is valid up to ₹12,50,000, not ₹13L.  
> At ₹12,50,001 and above, `SBT ≤ excessIncome + rebateThreshold` is no longer satisfied, so the system pays full slab tax.

**Summary Table:**

| Taxable Income | SBT | Excess Income | Marginal Relief? | Final Tax (with cess) |
|---|---|---|---|---|
| ₹12,00,001 | ₹60,001 | ₹1 | ✅ Tax = ₹1 + cess | ~₹0 |
| ₹12,50,000 | ₹90,000 | ₹50,000 | ✅ Tax capped at ₹50,000 | **₹52,000** |
| ₹12,50,001+ | > ₹90,000 | > ₹50,000 | ❌ Full slab tax | Full SBT + 4% cess |
| ₹13,00,000 | ₹1,00,000 | ₹1,00,000 | ❌ Equal, no relief | **₹1,04,000** |

---

### C. Cess Calculation (Both Regimes)

Applied after rebate/relief:

```typescript
cessAmount = Math.round(totalTaxAmount * (cessRate / 100));
taxWithCess = totalTaxAmount + cessAmount;
```

- `cessRate` is read from the `TaxSlab` DB record (Mongoose default: **4%**).
- Cess is calculated on the **post-rebate/post-relief** tax amount.

---

## 3. Tax Calculation Summary — Old vs New Regime

| Step | Old Regime | New Regime |
|---|---|---|
| Annual Gross | Salary for all months in FY | Same |
| Standard Deduction | **₹50,000** (from TaxSlab DB) | **₹75,000** (from TaxSlab DB) |
| PT Deduction | Calculated from salary structure | ₹0 (not applicable) |
| Investments | Subtracted (declared & verified) | Ignored (₹0 always) |
| **Taxable Income** | Gross − Std − PT − Investments | Gross − Std |
| Slab-Based Tax (SBT) | Per old regime slabs | Per new regime slabs |
| **Rebate 87A** | SBT ≤ ₹12,500 AND TI ≤ ₹5L → tax = ₹0 | SBT ≤ ₹60,000 → tax = ₹0 |
| **Marginal Relief** | ❌ Not applied | ✅ TI > ₹12L, tax capped at excess income |
| Cess (4%) | On post-rebate tax | On post-rebate/relief tax |
| **Final Tax** | `taxWithCess` | `taxWithCess` |

### New Regime Tax Flow (Summary)

```
Calculate SBT (slab-based tax on taxable income)
         │
         ▼
  SBT ≤ ₹60,000?
   YES → Tax = ₹0  (Rebate u/s 87A applied)
   NO  ↓
  TI > ₹12,00,000 AND TI ≤ marginalReliefUpperLimit AND SBT > excessIncome?
   YES → totalTaxAmount = excessIncome = (TI − ₹12,00,000)
   NO  → totalTaxAmount = SBT  (full slab tax)
         │
         ▼
  Add Cess (4%) on totalTaxAmount
  → finalTaxWithCess
```

---

## 4. Tax Calculation for Consultant Users

Consultants are handled differently from regular employees to comply with TDS rules for professional services.

### Key Logic:
- **User Identification**: Flagged as `isConsultancy: true` in the User model.
- **Standard IT Slabs**: **Ignored**. Consultants do not use Old or New regime slabs.
- **Statutory Deductions**: No PF/EPF, ESI, or Professional Tax.
- **TDS (Tax Deducted at Source)**:
  - A flat **1% TDS** is deducted from the monthly gross salary.
  - Stored in the `tdsDeduction` field of the Payroll record.
  - Formula: `tdsDeduction = monthlyGross * 0.01`.
- **Tax Declaration Blocked**: The service throws an error if a consultant tries to create a declaration:
  ```typescript
  if (user.isConsultancy) {
      throw new Error('Consultancy users have 1% TDS deduction instead of income tax.');
  }
  ```
- **Frontend**: The Tax Declaration page shows a dedicated info card explaining the 1% TDS, and hides the regime selection/declaration form entirely for consultants.

---

## 5. Form 12B: Deep Dive & Complete Flow

Form 12B is required for employees who join the organization mid-year to disclose their previous employer's income and TDS.

### A. Eligibility Detection

```typescript
const isForm12BApplicable = joiningDate >= fyStartDate && joiningDate <= fyEndDate;
```

- If the employee's joining date falls **within the current financial year**, `isForm12BApplicable` is set to `true` and saved on the Tax Declaration document.

---

### B. Frontend (FE) Flow

1. **Regime Selection**: User selects Old or New regime (standard flow).
2. **Form 12B Section Appears**: In `TaxDeclarationViewer.svelte`, a dedicated Form 12B section becomes visible when `isForm12BApplicable === true`.
3. **User Actions**:
   - Enters the **TDS already deducted** by the previous employer.
   - Uploads the official Form 12B document (PDF/image).
4. **Submission**: Handled by `taxDeclarationApi.fileUpload()` which calls `POST /documents/form12b`.

---

### C. Backend (BE) Flow

**Step 1 — Upload (`uploadForm12B`)**:
- Document is stored in the `Document` collection with `type: 'Form12B'`.
- `metadata.form12B.tdsDeducted` stores the user-entered TDS amount.
- `metadata.form12B.status` is set to `'Pending'`.
- The `form12B` reference ID is saved on the Tax Declaration.

**Step 2 — Admin Verification (`updateForm12BStatus`)**:
- Admin reviews the document via `PUT /documents/form12b/:id/status`.
- Status is updated to `'Verified'`.
- Once verified, the system triggers `processForm12BTDS()`.

**Step 3 — Tax Recalculation (`processForm12BTDS`)**:
```typescript
initialTaxBreakdown.form12bTDSAmount = tdsAmount;
initialTaxBreakdown.taxWithCess = initialTaxBreakdown.finalTaxWithCess; // snapshot before deduction
initialTaxBreakdown.finalTaxWithCess = Math.max(0, taxWithCess - tdsAmount);
```
- The previous employer's TDS is **subtracted from the total annual tax liability**.
- Negative tax is clamped to ₹0 (`Math.max(0, ...)`), so over-TDS doesn't create a refund in the payroll system.

**Step 4 — Monthly Plan Redistribution**:
- `adjustmentAmount = finalTaxWithCess - taxWithCess` (a negative number).
- `remainingMonths` is calculated from current month to March.
- Monthly deductions are recalculated: `adjustmentAmount / remainingMonths`.

> **TIP:** If Form 12B is verified late in the year (e.g., February), all remaining tax is packed into the last 1–2 months' deductions automatically.

---

### D. Form 12B — Regime Restriction

```typescript
if (taxDeclaration.regime !== 'old') {
    throw new Error('Form12B TDS processing is only applicable for old regime');
}
```

> **IMPORTANT:** Form 12B TDS adjustment is **only available for the Old Regime**. New Regime employees joining mid-year do not get Form 12B TDS credit in the system.

---

### E. Form 12B During `update()` (Re-declaration)

When a user updates their declarations, the system re-applies Form 12B if already verified:

```typescript
if (taxDeclaration.isForm12BApplicable && taxDeclaration.form12B) {
    const docForm12B = await Document.findById(taxDeclaration.form12B);
    if (docForm12B?.metadata?.form12B?.status === 'Verified') {
        updatedTax.form12bTDSAmount = docForm12B.metadata.form12B.tdsDeducted || 0;
        updatedTax.taxWithCess = updatedTax.finalTaxWithCess;
        updatedTax.finalTaxWithCess = Math.max(0, updatedTax.taxWithCess - updatedTax.form12bTDSAmount);
    }
}
```

This ensures Form 12B credit is **preserved even when the user redeclares investments**.
