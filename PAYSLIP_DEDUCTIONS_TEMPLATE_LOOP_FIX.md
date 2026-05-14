# Payslip Deductions – Fix “Non-Zero Values Not Showing”

## Problem
- **Total Deductions** shows (e.g. ₹68,267).
- **Individual deduction rows** (PF, LOP, Income Tax, Professional Tax) stay **blank**.
- Cause: Docxtemplater does not reliably render `{#deduction.pf}...{/deduction.pf}` when the opening and closing tags are in **different table cells**.

## Solution: Use the Deductions Array Loop

The backend already sends a **`deductions`** array with only **non-zero** items. Use a **single table row** that loops over this array so each deduction gets its own row.

---

## Step-by-Step: Update `CD_paySlip_new.docx`

### 1. Open the template
- Open **CD_paySlip_new.docx** in Microsoft Word.

### 2. Find the Deductions table
- Locate the table with columns **“Deductions”** and **“Actual”**.
- You should see 4 rows with conditionals (PF, LOP, Income Tax, Professional Tax) and 1 row for Total Deductions.

### 3. Replace the 4 deduction rows with ONE loop row

**Remove** these 4 rows (the ones with conditionals):
- `{#deduction.pf}PF: {/deduction.pf}` | `{#deduction.pf} {deduction.pf} {/deduction.pf}`
- `{#deduction.lop} LOP: {/deduction.lop}` | `{#deduction.lop} {deduction.lop} {/deduction.lop}`
- `{#deduction.it} Income Tax: {/deduction.it}` | `{#deduction.it} {deduction.it} {/deduction.it}`
- `{#deduction.pt} Professional Tax: {/deduction.pt}` | `{#deduction.pt} {deduction.pt} {/deduction.pt}`

**Add instead ONE row** with the loop:

| Deductions column (Cell 1) | Actual column (Cell 2) |
|----------------------------|------------------------|
| `{#deductions}{label}:{/deductions}` | `{#deductions}{value}{/deductions}` |

- **Deductions cell:** type exactly: `{#deductions}{label}:{/deductions}`
- **Actual cell:** type exactly: `{#deductions}{value}{/deductions}`

### 4. Keep the Total Deductions row as is

| Deductions column | Actual column |
|-------------------|---------------|
| `Total Deductions:` | `{deduction.total}` |

No change needed for this row.

---

## Final structure

| Deductions | Actual |
|------------|--------|
| `{#deductions}{label}:{/deductions}` | `{#deductions}{value}{/deductions}` |
| `Total Deductions:` | `{deduction.total}` |

- Docxtemplater will **repeat the first row** once per item in `deductions`.
- Only **non-zero** deductions are in `deductions`, so you get one row per PF, LOP, Income Tax, Professional Tax that has a value.
- **Total Deductions** always shows via `{deduction.total}`.

---

## Important

1. **Single row for the loop**  
   Use **one** row with `{#deductions}...{/deductions}` in **both** cells. Do not use one row per deduction type when using the loop.

2. **Spelling**  
   Use `deductions` (array) in the loop and `deduction` (object) for total:
   - Loop: `{#deductions}` … `{/deductions}` and `{label}`, `{value}`.
   - Total: `{deduction.total}`.

3. **Save**  
   Save `CD_paySlip_new.docx` after editing.

---

## Result

- PF &gt; 0 → row “PF:” and amount.
- LOP &gt; 0 → row “LOP:” and amount.
- Income Tax &gt; 0 → row “Income Tax:” and amount.
- Professional Tax &gt; 0 → row “Professional Tax:” and amount.
- Total Deductions row always shows with `{deduction.total}`.

After this change, regenerate the payslip; non-zero deduction values should appear correctly.
