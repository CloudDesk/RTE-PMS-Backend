# Final Settlement – Professional Tax (PT) Analysis

## Where PT is used in final settlement

1. **Initialize (unpaid months)** – For each unpaid month we compute `professionalTax` per month and sum into `totalProfessionalTax` / `finalCalculation.professionalTax`.
2. **Calculate (POST /calculate)** – PT is taken from `finalCalculation.professionalTax` or summed from `unpaidMonths[].professionalTax`.
3. **Hold months** – PT is **not** recalculated; hold payrolls already have PT stored on the Payroll record (from when payroll was run). Final settlement only displays `netSalary` for hold months; PT is inside that net.

---

## PT calculation in final settlement (unpaid months)

- **Config source:** `salaryAssignment.salaryStructureId.statutoryDeductions.professionalTax`
- **Inputs:** 
  - Gross used for slab: **monthly salary** for that month (prorated: `(monthlyGross / daysInMonth) * payableDays`).
  - Month number (1–12) for **term** applicability.
- **Logic (aligned with payroll):**
  - **Term:** `half_yearly` → Feb & Aug; `yearly` → Apr; `monthly` → all 12 months.
  - If current month is **not** in the term’s applicable months → PT = 0.
  - Else find the **slab** where `gross >= slab.fromAmount` and (`slab.toAmount` is null or `gross <= slab.toAmount`), then return `slab.taxAmount`.
  - If no slab matches → 0.

---

## Payroll vs final settlement – base for PT

| Aspect | Payroll | Final settlement (before fix) |
|--------|--------|-------------------------------|
| Base for PT slab | **monthlyGross** (full month) | **monthlySalary** (prorated for unpaid month) |
| Term + slabs | Same (term, fromAmount, toAmount, taxAmount) | Same |

Payroll uses **monthlyGross** (full month gross) for PT slab in `calculateDeductions` → `calculateProfessionalTax(monthlyGross, ptConfig, monthNumber)`. So even for a partial month, payroll applies the slab on full month gross.

For **alignment with payroll**, final settlement should use **monthlyGross** (full month) for PT slab lookup in unpaid months, not prorated monthlySalary. That way the same slab and amount apply as would have if that month had been run in payroll.

---

## Change made

- In **initialize**, for each unpaid month we now pass **monthlyGross** (not `monthlySalary`) into `calculatePT` for slab lookup, so PT is computed the same way as in payroll.
- Comment added in code: PT slab is based on full month gross (same as payroll).

---

## Summary

- **Hold months:** No PT recalculation; PT is already part of the stored Payroll net salary.
- **Unpaid months:** PT is computed from salary structure (term + slabs); base for slab is **monthlyGross** so it matches payroll.
- **POST /calculate:** PT comes from request body (`finalCalculation.professionalTax` or sum of `unpaidMonths[].professionalTax`).
