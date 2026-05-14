# Consultancy Staff Implementation

## Overview
This document describes the implementation of consultancy staff support in the HR system. Consultancy staff have different tax and PF treatment compared to regular employees.

## Changes Made

### 1. User Model (`src/models/user.model.ts`)

#### Added Field:
- **`isConsultancy`** (Boolean, default: false)
  - Identifies consultancy staff members
  - Used to apply special tax and PF rules

#### Schema Changes:
```typescript
isConsultancy: {
  type: Boolean,
  default: false,
  description: 'Flag to identify consultancy staff (no PF, 1% TDS deduction)'
}
```

#### Index Added:
```typescript
userSchema.index({ isConsultancy: 1 });
```

### 2. User Service (`src/services/user.service.ts`)

#### Interface Updates:
Added `isConsultancy` to both create and update interfaces:

**IUserCreate Interface:**
```typescript
interface IUserCreate {
  // ... other fields
  client?: string;
  isConsultancy?: boolean; // Flag for consultancy staff (no PF, 1% TDS)
  // ... other fields
}
```

**IUserUpdate Interface:**
```typescript
interface IUserUpdate {
  // ... other fields
  client?: string;
  isConsultancy?: boolean; // Flag for consultancy staff (no PF, 1% TDS)
  // ... other fields
}
```

#### API Usage:
Admins can now set/update the `isConsultancy` flag when creating or updating users:

**Create User:**
```json
POST /api/users
{
  "name": "John Doe",
  "email": "john@example.com",
  "isConsultancy": true,
  // ... other required fields
}
```

**Update User:**
```json
PATCH /api/users/:id
{
  "isConsultancy": true
}
```

### 3. User Routes (`src/routes/user.routes.ts`)

#### Schema Updates:
Updated Fastify schemas to validate `isConsultancy` field:

- **`POST /` Body Schema**: Added `isConsultancy` (boolean)
- **`PUT /:id` Body Schema**: Added `isConsultancy` (boolean)
- **Response Schema**: Added `isConsultancy` to user response object

### 4. Payroll Model (`src/models/payrolls.model.ts`)

#### Added Field:
- **`tdsDeduction`** (Number, required, default: 0)
  - Stores the 1% TDS deduction for consultancy staff
  - Added to deductions section

#### Schema Changes:
```typescript
tdsDeduction: { type: Number, required: true, default: 0 }
```

#### Monetary Fields Update:
- Added `tdsDeduction` to the monetaryFields array for proper rounding in pre-save hook

### 5. Payroll Service (`src/services/payroll.service.ts`)

#### PayrollRecord Interface:
```typescript
interface PayrollRecord {
  // ... existing fields
  tdsDeduction: number; // 1% TDS for consultancy staff
  // ... other fields
}
```

#### calculateDeductions Function:
Updated to accept `isConsultancy` parameter and implement consultancy-specific logic:

**For Consultancy Staff (`isConsultancy = true`):**
- ✅ **No PF Deduction**: `epfEmployee = 0`, `epfEmployer = 0`
- ✅ **No ESI Deduction**: `esiEmployee = 0`, `esiEmployer = 0`
- ✅ **No Professional Tax**: `professionalTax = 0`
- ✅ **No Income Tax**: `incomeTax = 0`
- ✅ **1% TDS Deduction**: `tdsDeduction = 1% of monthlyGross`
- ✅ Total deductions include TDS instead of income tax

**For Regular Staff (`isConsultancy = false`):**
- ✅ Normal PF calculation (with ₹15,000 ceiling)
- ✅ Normal ESI calculation
- ✅ Normal Professional Tax calculation
- ✅ Normal Income Tax calculation
- ✅ `tdsDeduction = 0`

#### Implementation Details:
```typescript
// EPF - Consultancy staff: No PF deduction
let finalEpfEmployee = 0;
let finalEpfEmployer = 0;

if (!isConsultancy) {
    // Normal PF calculation for regular employees
    // ... existing EPF logic
} else {
    console.log('Consultancy staff - No PF deduction');
}

// Income Tax / TDS Deduction
let incomeTax = 0;
let tdsDeduction = 0;

if (isConsultancy) {
    // 1% TDS on monthly gross for consultancy staff
    tdsDeduction = Math.round((1 / 100) * monthlyGross);
} else {
    // Regular income tax for non-consultancy staff
    incomeTax = Math.round(await this.calculateIncomeTax(...));
}

// Total deductions include TDS for consultancy staff
const totalDeductions = Math.round(
    finalEpfEmployee + professionalTax + incomeTax + tdsDeduction + leaveDeductionAmount
);
```

### 6. Tax Declaration Service (`src/services/tax-declaration.service.ts`)

#### Validation Added:
Prevents tax declaration creation for consultancy staff in the `create` method:

```typescript
const user: IUser = await User.findById(employeeId).select('name joiningDate isConsultancy');

// Prevent tax declaration creation for consultancy staff
if (user.isConsultancy) {
    throw new Error('Tax declaration cannot be created for consultancy staff. Consultancy users have 1% TDS deduction instead of income tax.');
}
```

#### Impact:
- **Manual Creation**: Users cannot create tax declarations for consultancy staff
- **Admin Creation**: Admins cannot create tax declarations via bulk create
- **Bulk Create**: The validation in `create()` is automatically applied, so consultancy users will be in the "failed" list with an appropriate error message

### 7. Payslip Service (`src/services/payslip.service.ts`)

#### Template Data Updates:
Added `tdsDeduction` to the payslip template data for proper display in generated payslips:

**Deduction Object:**
```typescript
const tdsVal = Number(payroll.tdsDeduction ?? 0);

if (tdsVal > 0) {
  deductionObj.tds = formatCurrency(tdsVal, payroll.country);
}
```

**Deductions Array (for template looping):**
```typescript
if (tdsVal > 0) {
  deductionsArray.push({
    label: 'TDS (1%)',
    value: formatCurrency(tdsVal, payroll.country)
  });
}
```

#### Template Variables Available:
- **`deduction.tds`**: Formatted TDS deduction amount (only if > 0)
- **`deductions[]`**: Array includes TDS entry with label "TDS (1%)" (only if > 0)

#### DOCX Template Usage:
In your `CD_paySlip old.docx` template, you can now use:
- `{deduction.tds}` - To display TDS amount directly
- Loop through `{#deductions}` array to automatically show all deductions including TDS

## Business Rules

### Consultancy Staff (`isConsultancy = true`)
1. **No PF Deduction**: Consultancy staff do not contribute to Provident Fund
2. **No Income Tax**: No income tax calculation or deduction
3. **1% TDS**: Flat 1% TDS deduction on monthly gross salary
4. **No Tax Declaration**: Cannot create or have tax declaration records
5. **Professional Tax**: Still applicable (if configured)
6. **ESI**: Still applicable (if salary is within ESI limit)

### Regular Staff (`isConsultancy = false`)
1. **Normal PF**: Standard PF calculation with ₹15,000 ceiling
2. **Income Tax**: Based on tax declaration and tax slabs
3. **No TDS**: tdsDeduction = 0
4. **Tax Declaration**: Can create and manage tax declarations
5. **All other deductions**: As per existing logic

## Database Migration

### For Existing Users:
- The `isConsultancy` field defaults to `false`
- Existing users will be treated as regular staff
- No migration script needed as the default value handles backward compatibility

### For New Consultancy Users:
- Set `isConsultancy: true` when creating the user
- The system will automatically apply consultancy-specific rules

## Testing Checklist

### User Creation:
- [ ] Create regular user with `isConsultancy: false` (default)
- [ ] Create consultancy user with `isConsultancy: true`

### Payroll Processing:
- [ ] Verify regular user has PF deduction
- [ ] Verify regular user has income tax deduction
- [ ] Verify regular user has `tdsDeduction = 0`
- [ ] Verify consultancy user has `epfEmployee = 0` and `epfEmployer = 0`
- [ ] Verify consultancy user has `incomeTax = 0`
- [ ] Verify consultancy user has `tdsDeduction = 1% of monthlyGross`
- [ ] Verify total deductions are calculated correctly for both types

### Tax Declaration:
- [ ] Verify regular user can create tax declaration
- [ ] Verify consultancy user cannot create tax declaration (manual)
- [ ] Verify admin cannot bulk create tax declaration for consultancy user
- [ ] Verify error message is clear and informative

### Edge Cases:
- [ ] Test with zero salary
- [ ] Test with very high salary
- [ ] Test switching user from regular to consultancy (and vice versa)
- [ ] Test payroll summary calculations include both types correctly

## API Changes

### No Breaking Changes:
- All existing API endpoints work as before
- New field `isConsultancy` is optional in user creation/update
- Payroll response includes new `tdsDeduction` field (defaults to 0 for existing records)

### New Behavior:
- Tax declaration creation will fail with error for consultancy users
- Payroll calculations automatically adjust based on `isConsultancy` flag

## Notes

1. **Backward Compatibility**: All existing users default to `isConsultancy: false`, maintaining current behavior
2. **Automatic Calculation**: No manual intervention needed - payroll service automatically detects and applies rules
3. **Clear Error Messages**: Users and admins get clear feedback when trying to create tax declarations for consultancy staff
4. **Audit Trail**: The `isConsultancy` flag is indexed for efficient queries and reporting
5. **Future Enhancement**: Can add reports to list all consultancy staff and their TDS deductions

## Example Calculations

### Regular Employee (Monthly Gross: ₹50,000)
- Basic: ₹25,000
- HRA: ₹12,500
- Other: ₹12,500
- **EPF Employee**: ₹1,800 (capped at 12% of ₹15,000)
- **Income Tax**: ₹2,500 (based on tax declaration)
- **TDS Deduction**: ₹0
- **Total Deductions**: ₹4,300

### Consultancy Employee (Monthly Gross: ₹50,000)
- Basic: ₹25,000
- HRA: ₹12,500
- Other: ₹12,500
- **EPF Employee**: ₹0 (consultancy staff)
- **Income Tax**: ₹0 (consultancy staff)
- **TDS Deduction**: ₹500 (1% of ₹50,000)
- **Total Deductions**: ₹500

## Summary

This implementation provides a clean, maintainable solution for handling consultancy staff with different tax and PF treatment. The changes are minimal, backward-compatible, and follow the existing code patterns in the application.
