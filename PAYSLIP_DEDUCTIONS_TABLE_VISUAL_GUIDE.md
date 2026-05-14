# Payslip Deductions Table - Visual Guide

## 📋 How the Table Should Look

---

## 1️⃣ **TEMPLATE Structure (What You Type in Word)**

### In Microsoft Word Template (`CD_paySlip_new.docx`):

```
┌─────────────────────────────┬──────────────┐
│ Deductions                  │ Actual       │
├─────────────────────────────┼──────────────┤
│ {#deductions}{label}:{/deductions} │ {#deductions}{value}{/deductions} │
├─────────────────────────────┼──────────────┤
│ Total Deductions:           │ {deduction.total} │
└─────────────────────────────┴──────────────┘
```

### Cell-by-Cell Breakdown:

| Cell Location | What to Type | Alignment |
|---------------|--------------|-----------|
| **Header Row, Cell 1** | `Deductions` | Left |
| **Header Row, Cell 2** | `Actual` | Right |
| **Loop Row, Cell 1** | `{#deductions}{label}:{/deductions}` | Left |
| **Loop Row, Cell 2** | `{#deductions}{value}{/deductions}` | **Right** |
| **Total Row, Cell 1** | `Total Deductions:` | Left |
| **Total Row, Cell 2** | `{deduction.total}` | **Right** |

---

## 2️⃣ **FINAL OUTPUT (What Users See)**

### Example 1: Single Deduction (PF only)

```
┌─────────────────────────────┬──────────────┐
│ Deductions                  │ Actual       │
├─────────────────────────────┼──────────────┤
│ PF:                         │         756 │
├─────────────────────────────┼──────────────┤
│ Total Deductions:           │         756 │
└─────────────────────────────┴──────────────┘
```

### Example 2: Multiple Deductions (All 4 types)

```
┌─────────────────────────────┬──────────────┐
│ Deductions                  │ Actual       │
├─────────────────────────────┼──────────────┤
│ PF:                         │       1,800 │
│ LOP:                        │         500 │
│ Income Tax:                 │       1,000 │
│ Professional Tax:           │         200 │
├─────────────────────────────┼──────────────┤
│ Total Deductions:           │       3,500 │
└─────────────────────────────┴──────────────┘
```

### Example 3: Two Deductions (PF + Income Tax)

```
┌─────────────────────────────┬──────────────┐
│ Deductions                  │ Actual       │
├─────────────────────────────┼──────────────┤
│ PF:                         │       1,800 │
│ Income Tax:                 │       1,000 │
├─────────────────────────────┼──────────────┤
│ Total Deductions:           │       2,800 │
└─────────────────────────────┴──────────────┘
```

---

## 3️⃣ **DETAILED VISUAL COMPARISON**

### Template (What You Edit):

```
┌─────────────────────────────────────────────────────────────┐
│ Deductions                          │ Actual                │
├─────────────────────────────────────┼──────────────────────┤
│ {#deductions}{label}:{/deductions}  │ {#deductions}{value}{/deductions} │
├─────────────────────────────────────┼──────────────────────┤
│ Total Deductions:                    │ {deduction.total}    │
└─────────────────────────────────────┴──────────────────────┘
```

### Generated Payslip (What Users See):

```
┌─────────────────────────────────────────────────────────────┐
│ Deductions                          │ Actual                │
├─────────────────────────────────────┼──────────────────────┤
│ PF:                                 │                 756  │
│ LOP:                                │                 500  │
│ Income Tax:                         │               1,000  │
│ Professional Tax:                   │                 200  │
├─────────────────────────────────────┼──────────────────────┤
│ Total Deductions:                   │               2,456  │
└─────────────────────────────────────┴──────────────────────┘
```

**Notice:**
- ✅ Labels are **left-aligned**
- ✅ Values are **right-aligned**
- ✅ Only non-zero deductions appear
- ✅ Total row aligns with deduction rows

---

## 4️⃣ **STEP-BY-STEP TABLE CREATION IN WORD**

### Step 1: Create Table Structure

1. **Insert → Table → 2 columns, 2 rows**
2. **First row:** Headers
3. **Second row:** Loop row + Total row

### Step 2: Fill Header Row

| Cell | Content | Format |
|------|---------|--------|
| A1 | `Deductions` | Bold, Left-aligned |
| B1 | `Actual` | Bold, Right-aligned |

### Step 3: Fill Loop Row

| Cell | Content | Format |
|------|---------|--------|
| A2 | `{#deductions}{label}:{/deductions}` | Left-aligned, Normal text |
| B2 | `{#deductions}{value}{/deductions}` | **Right-aligned**, Normal text |

### Step 4: Add Total Row

| Cell | Content | Format |
|------|---------|--------|
| A3 | `Total Deductions:` | Left-aligned, Normal text |
| B3 | `{deduction.total}` | **Right-aligned**, Normal text |

---

## 5️⃣ **ALIGNMENT VISUAL GUIDE**

### Correct Alignment:

```
┌─────────────────────────────────────────────┐
│ Deductions        │        Actual          │  ← Headers
├───────────────────┼─────────────────────────┤
│ PF:               │                    756 │  ← Left | Right
│ LOP:              │                    500 │  ← Left | Right
│ Income Tax:       │                  1,000 │  ← Left | Right
│ Professional Tax: │                    200 │  ← Left | Right
├───────────────────┼─────────────────────────┤
│ Total Deductions: │                  2,456 │  ← Left | Right
└───────────────────┴─────────────────────────┘
```

### Wrong Alignment (What NOT to do):

```
┌─────────────────────────────────────────────┐
│ Deductions        │ Actual                  │  ← Headers
├───────────────────┼─────────────────────────┤
│ PF:               │ 756                     │  ← Left | Left ❌
│ LOP:              │ 500                     │  ← Left | Left ❌
│ Income Tax:       │ 1,000                    │  ← Left | Left ❌
│ Professional Tax: │ 200                      │  ← Left | Left ❌
├───────────────────┼─────────────────────────┤
│ Total Deductions: │ 2,456                    │  ← Left | Left ❌
└───────────────────┴─────────────────────────┘
```

**Problem:** Numbers are left-aligned, making them hard to compare.

---

## 6️⃣ **COMPLETE PAYSLIP TABLE EXAMPLE**

### Full Deductions Section in Context:

```
┌─────────────────────────────────────────────────────────────────┐
│ Earnings              │ Full      │ Actual    │ Deductions      │ Actual    │
├───────────────────────┼───────────┼───────────┼─────────────────┼───────────┤
│ BASIC                 │ 6,302     │ 6,302     │ PF:             │      756  │
│ HRA                   │ 3,151     │ 3,151     │ LOP:            │      500  │
│ OTHER ALLOWANCE       │ 6,303     │ 6,303     │ Income Tax:     │    1,000  │
│                       │           │           │ Professional Tax:│      200  │
│ Total Earnings:INR.   │ 15,756    │ 15,756    │ Total Deductions:│    2,456  │
└───────────────────────┴───────────┴───────────┴─────────────────┴───────────┘
```

---

## 7️⃣ **TEMPLATE CODE (Copy-Paste Ready)**

### For Word Template:

**Row 1 (Header):**
- Cell 1: `Deductions`
- Cell 2: `Actual`

**Row 2 (Loop):**
- Cell 1: `{#deductions}{label}:{/deductions}`
- Cell 2: `{#deductions}{value}{/deductions}`

**Row 3 (Total):**
- Cell 1: `Total Deductions:`
- Cell 2: `{deduction.total}`

---

## 8️⃣ **QUICK REFERENCE TABLE**

| What | Template Code | Output Example |
|------|---------------|----------------|
| **PF Label** | `{#deductions}{label}:{/deductions}` | `PF:` |
| **PF Value** | `{#deductions}{value}{/deductions}` | `756` |
| **LOP Label** | `{#deductions}{label}:{/deductions}` | `LOP:` |
| **LOP Value** | `{#deductions}{value}{/deductions}` | `500` |
| **Total Label** | `Total Deductions:` | `Total Deductions:` |
| **Total Value** | `{deduction.total}` | `2,456` |

---

## 9️⃣ **FINAL CHECKLIST**

Before saving your template, verify:

- [ ] Header row has "Deductions" and "Actual"
- [ ] Loop row Cell 1: `{#deductions}{label}:{/deductions}` (one line, no spaces)
- [ ] Loop row Cell 2: `{#deductions}{value}{/deductions}` (one line, no spaces)
- [ ] Loop row Cell 2 is **right-aligned**
- [ ] Total row Cell 1: `Total Deductions:`
- [ ] Total row Cell 2: `{deduction.total}` (no loop tags)
- [ ] Total row Cell 2 is **right-aligned**
- [ ] No line breaks inside tags
- [ ] Column widths are fixed (not auto)

---

## 🎯 Summary

**Template Structure:**
```
Deductions | Actual
{#deductions}{label}:{/deductions} | {#deductions}{value}{/deductions}
Total Deductions: | {deduction.total}
```

**Output Structure:**
```
Deductions        | Actual
PF:               |    756
LOP:              |    500
Income Tax:       |  1,000
Professional Tax: |    200
Total Deductions: |  2,456
```

**Key Points:**
- ✅ Labels: Left-aligned
- ✅ Values: Right-aligned
- ✅ Only non-zero deductions show
- ✅ Total aligns with deduction rows

This is how your table should look! 🎉
