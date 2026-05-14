# Payslip Template - CORRECT Format for Deductions

## ❌ Issues Found in Current Template

1. **Broken closing tag** - `}` is on a new line instead of being part of `{/deductions}`
2. **Wrong alignment** - "Actual" column values are left-aligned (should be right-aligned)
3. **Extra spaces** - Tags have unnecessary spaces

---

## ✅ CORRECT Template Format

### Deductions Table Structure:

```
| Deductions Header | Actual Header |
|-------------------|---------------|
| {#deductions}{label}:{/deductions} | {#deductions}{value}{/deductions} |
| Total Deductions: | {deduction.total} |
```

### Exact Text for Each Cell:

#### **Row 1 (Loop Row):**
- **Cell 1 (Deductions column):** 
  ```
  {#deductions}{label}:{/deductions}
  ```
  - **NO spaces** between `{#deductions}` and `{label}`
  - **NO spaces** between `{label}` and `:`
  - **NO spaces** between `:` and `{/deductions}`
  - **ALL on ONE line** - no line breaks!

- **Cell 2 (Actual column):**
  ```
  {#deductions}{value}{/deductions}
  ```
  - **NO spaces** between tags
  - **ALL on ONE line**
  - **Right-align this cell** (for numbers)

#### **Row 2 (Total Row):**
- **Cell 1 (Deductions column):**
  ```
  Total Deductions:
  ```
  - Plain text, left-aligned

- **Cell 2 (Actual column):**
  ```
  {deduction.total}
  ```
  - **NO loop tags** (just the placeholder)
  - **Right-align this cell**

---

## 🔧 How to Fix in Word

### Step 1: Fix the Loop Row Tags

1. **Select Cell 1 (Deductions column)**
2. **Delete all content**
3. **Type exactly (no spaces):**
   ```
   {#deductions}{label}:{/deductions}
   ```
4. **Press Enter** to confirm it's all on one line

5. **Select Cell 2 (Actual column)**
6. **Delete all content**
7. **Type exactly (no spaces):**
   ```
   {#deductions}{value}{/deductions}
   ```
8. **Press Enter** to confirm it's all on one line

### Step 2: Fix Alignment

1. **Select Cell 2 (Actual column) in the loop row**
2. **Right-click → Cell Alignment**
3. **Choose: "Align Right" or "Align Right Vertically Center"**
4. **Click OK**

5. **Select Cell 2 (Actual column) in the Total row**
6. **Right-click → Cell Alignment**
7. **Choose: "Align Right" or "Align Right Vertically Center"**
8. **Click OK**

### Step 3: Verify No Line Breaks

1. **Click inside Cell 1 (loop row)**
2. **Press Ctrl+Shift+8** (or View → Show Paragraph Marks)
3. **Check that there are NO line breaks** (¶ symbols) in the middle of the tag
4. **The entire tag should be on one line:**
   ```
   {#deductions}{label}:{/deductions}¶
   ```
   (Only one ¶ at the end)

5. **Repeat for Cell 2**

---

## ✅ Correct Format Checklist

- [ ] Cell 1: `{#deductions}{label}:{/deductions}` (no spaces, one line)
- [ ] Cell 2: `{#deductions}{value}{/deductions}` (no spaces, one line)
- [ ] Cell 2 is **right-aligned** (for numbers)
- [ ] Total row Cell 1: `Total Deductions:` (plain text)
- [ ] Total row Cell 2: `{deduction.total}` (no loop tags)
- [ ] Total row Cell 2 is **right-aligned**
- [ ] No line breaks inside the tags
- [ ] No extra spaces in tags

---

## 📊 Expected Output

After fixing, your payslip will show:

```
| Deductions        | Actual |
|-------------------|--------|
| PF:               |    756 |
| Total Deductions: |    756 |
```

Or with multiple deductions:

```
| Deductions        | Actual |
|-------------------|--------|
| PF:               |  1,800 |
| LOP:              |    500 |
| Income Tax:       |  1,000 |
| Professional Tax: |    200 |
| Total Deductions: |  3,500 |
```

**Notice:**
- Labels are **left-aligned** ✅
- Values are **right-aligned** ✅
- All values align vertically in the same column ✅

---

## ⚠️ Common Mistakes to Avoid

1. **❌ DON'T add spaces:**
   - `{#deductions} {label}: {/deductions}` ❌
   - `{#deductions}{label}:{/deductions}` ✅

2. **❌ DON'T break tags across lines:**
   - `{#deductions}{label}:`
   - `{/deductions}` ❌
   - `{#deductions}{label}:{/deductions}` ✅

3. **❌ DON'T use loop tags for total:**
   - `{#deduction}{total}{/deduction}` ❌
   - `{deduction.total}` ✅

4. **❌ DON'T left-align number values:**
   - Left-aligned "756" ❌
   - Right-aligned "756" ✅

---

## 🎯 Summary

**Current Issues:**
1. Closing brace `}` is on a new line → Fix: Put `{/deductions}` all on one line
2. Actual column is left-aligned → Fix: Right-align the "Actual" column cells
3. Extra spaces in tags → Fix: Remove all spaces inside tags

**After Fix:**
- Tags will be on single lines ✅
- Numbers will be right-aligned ✅
- Alignment will match your desired format ✅

Fix these three issues and your template will be perfect! 🎉
