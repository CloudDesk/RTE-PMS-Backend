# Payslip Template - Fix Checklist (Current Issues)

## ❌ Issues Found in Your Template

| # | Current (Wrong) | Correct | Why |
|---|-----------------|---------|-----|
| 1 | `{#deduction}` | `{#deductions}` | Backend sends **deductions** (plural array). Loop must use **plural**. |
| 2 | `{/deduction}` | `{/deductions}` | Closing tag must match: **deductions** (plural). |
| 3 | `{#deduction} {label} : {/deduction}` | `{#deductions}{label}:{/deductions}` | Remove spaces. Use **deductions** (plural). |
| 4 | `{#deduction} {value} {/deduction}` | `{#deductions}{value}{/deductions}` | Remove spaces. Use **deductions** (plural). |
| 5 | `{#deduction} {total} {/deduction}` | `{deduction.total}` | Total is **one value**, not a loop. Use **deduction.total** (no loop tags). |
| 6 | "Actual" column content left-aligned | Right-aligned | Numbers should be right-aligned. |
| 7 | Two empty rows between loop and Total | Remove them | Empty rows create blank lines in output. |

---

## ✅ Step-by-Step Fixes

### Fix 1: Loop Row – Deductions Column (Cell 1)

**Current:** `{#deduction} {label} : {/deduction}`  

**Do this:**
1. Select the cell.
2. Delete all content.
3. Type exactly (no spaces, **deductions** with **s**):
   ```
   {#deductions}{label}:{/deductions}
   ```
4. Ensure it is all on **one line** (no line break).

---

### Fix 2: Loop Row – Actual Column (Cell 2)

**Current:** `{#deduction} {value} {/deduction}`  

**Do this:**
1. Select the cell.
2. Delete all content.
3. Type exactly (no spaces, **deductions** with **s**):
   ```
   {#deductions}{value}{/deductions}
   ```
4. Right-click cell → **Cell Alignment** → **Align Right** (so numbers are right-aligned).

---

### Fix 3: Total Row – Actual Column (Cell 2)

**Current:** `{#deduction} {total} {/deduction}`  

**Do this:**
1. Select the cell.
2. Delete all content.
3. Type exactly (no loop, just the total placeholder):
   ```
   {deduction.total}
   ```
4. Right-click cell → **Cell Alignment** → **Align Right**.

---

### Fix 4: Remove Empty Rows

**Current:** Two empty rows between the loop row and "Total Deductions:"  

**Do this:**
1. Click in the first empty row.
2. Right-click → **Delete Row** (or Table Tools → Layout → Delete → Delete Rows).
3. Repeat for the second empty row.  
You should have: **one loop row** → **one Total Deductions row** (no rows in between).

---

### Fix 5: Alignment Summary

| Cell | Alignment |
|------|-----------|
| Deductions header | Left |
| Actual header | Right |
| Loop row – Deductions cell | Left |
| Loop row – Actual cell | **Right** |
| Total row – "Total Deductions:" | Left |
| Total row – value cell | **Right** |

---

## ✅ Correct Final Structure

### What the table should look like in Word:

```
┌─────────────────────────────┬──────────────┐
│ Deductions                  │ Actual        │  ← Headers (Actual = Right)
├─────────────────────────────┼──────────────┤
│ {#deductions}{label}:{/deductions} │ {#deductions}{value}{/deductions} │  ← One row only (Actual = Right)
├─────────────────────────────┼──────────────┤
│ Total Deductions:           │ {deduction.total} │  ← No loop (Actual = Right)
└─────────────────────────────┴──────────────┘
```

### Tag reference:

| Location | Correct tag |
|----------|-------------|
| Loop, Deductions cell | `{#deductions}{label}:{/deductions}` |
| Loop, Actual cell | `{#deductions}{value}{/deductions}` |
| Total, Actual cell | `{deduction.total}` |

---

## 🔑 Key Points

1. **Loop = plural:** `{#deductions}` and `{/deductions}` (with **s**).  
   Backend sends an array named `deductions`.

2. **Total = no loop:** Use `{deduction.total}` only.  
   Backend sends an object `deduction` with a `total` property.

3. **No spaces** inside the tags.

4. **One line** per tag (no line break in the middle).

5. **Actual column** = right-aligned for numbers.

6. **No empty rows** between loop row and Total row.

---

## ✅ Verification Checklist

After editing, confirm:

- [ ] Loop row Cell 1: `{#deductions}{label}:{/deductions}` (plural, no spaces, one line)
- [ ] Loop row Cell 2: `{#deductions}{value}{/deductions}` (plural, no spaces, one line)
- [ ] Loop row Cell 2: **Right-aligned**
- [ ] Total row Cell 1: `Total Deductions:`
- [ ] Total row Cell 2: `{deduction.total}` (no `{#deduction}` or `{/deduction}`)
- [ ] Total row Cell 2: **Right-aligned**
- [ ] **No empty rows** between loop and Total
- [ ] No line breaks inside any tag

When all are done, the template is correct.
