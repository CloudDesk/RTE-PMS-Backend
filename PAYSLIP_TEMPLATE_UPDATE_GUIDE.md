# Payslip Template Update Guide - TDS Deduction

## Overview
This guide explains how to update your payslip DOCX template (`CD_paySlip old.docx`) to display the TDS deduction for consultancy staff.

## Available Template Variables

### New Variable: TDS Deduction
- **Variable Name**: `{deduction.tds}`
- **Description**: Displays the 1% TDS deduction for consultancy staff
- **Format**: Currency formatted (e.g., "₹500" or "AED 500")
- **Conditional**: Only appears if TDS deduction > 0

### Updated Deductions Array
The `deductions` array now includes TDS entries:
```
{#deductions}
  {label}: {value}
{/deductions}
```

This will automatically display:
- PF (if applicable)
- LOP (if applicable)
- Income Tax (if applicable)
- Professional Tax (if applicable)
- **TDS (1%)** (if applicable - for consultancy staff)

## Template Update Options

### Option 1: Direct Variable (Recommended for Fixed Layout)
If you have a fixed deductions table in your template, add a new row:

```
Deductions:
-----------
PF:                 {deduction.pf}
Income Tax:         {deduction.it}
Professional Tax:   {deduction.pt}
TDS (1%):          {deduction.tds}
LOP:               {deduction.lop}
-----------
Total Deductions:   {deduction.total}
```

**Note**: Rows with empty values will show blank, so you may want to use conditional sections.

### Option 2: Conditional Display (Best Practice)
Use conditional sections to only show TDS when it exists:

```
{#deduction.tds}
TDS (1%):          {deduction.tds}
{/deduction.tds}
```

### Option 3: Dynamic Loop (Most Flexible)
Use the deductions array to automatically show all applicable deductions:

```
Deductions:
-----------
{#deductions}
{label}:           {value}
{/deductions}
-----------
Total Deductions:   {deduction.total}
```

This approach automatically:
- Shows only non-zero deductions
- Adapts to different employee types (regular vs consultancy)
- Requires no template changes for future deduction types

## Example Template Sections

### For Regular Employees
```
Deductions:
-----------
PF:                 ₹1,800
Income Tax:         ₹2,500
Professional Tax:   ₹200
-----------
Total Deductions:   ₹4,500
```

### For Consultancy Employees
```
Deductions:
-----------
TDS (1%):          ₹500
Professional Tax:   ₹200
-----------
Total Deductions:   ₹700
```

## Implementation Steps

1. **Open Template**: Open `CD_paySlip old.docx` in Microsoft Word
2. **Locate Deductions Section**: Find the deductions table/section
3. **Choose Approach**: Select one of the three options above
4. **Add TDS Row**: 
   - For Option 1: Add a new row with `{deduction.tds}`
   - For Option 2: Add conditional section `{#deduction.tds}...{/deduction.tds}`
   - For Option 3: Use the loop `{#deductions}{label}: {value}{/deductions}`
5. **Save Template**: Save the updated template
6. **Test**: Generate a payslip for a consultancy user to verify

## Testing Checklist

- [ ] Template opens without errors
- [ ] Regular employee payslip shows PF and Income Tax (no TDS)
- [ ] Consultancy employee payslip shows TDS (no PF, no Income Tax)
- [ ] Total deductions are calculated correctly
- [ ] Currency formatting is correct (₹ for India, AED for UAE)
- [ ] Empty deduction rows don't show or show appropriately

## Troubleshooting

### TDS not showing
- Verify the employee has `isConsultancy: true`
- Check that payroll was processed after the code update
- Ensure `tdsDeduction` field exists in the payroll record

### Template rendering errors
- Check for typos in variable names (case-sensitive)
- Ensure proper opening/closing tags for conditionals
- Verify the template file is not corrupted

### Formatting issues
- Use the exact variable names as documented
- Don't add extra spaces inside `{}`
- Test with both India and UAE employees

## Support

If you encounter issues:
1. Check the console logs during payslip generation
2. Verify the payroll record has the correct `tdsDeduction` value
3. Test with a simple template first before adding complex formatting
4. Refer to `CONSULTANCY_STAFF_IMPLEMENTATION.md` for complete implementation details
