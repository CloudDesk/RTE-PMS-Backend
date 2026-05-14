# Intern Staff Implementation

This document outlines the implementation of the `isIntern` flag for managing intern employees with special payroll treatment.

## Overview

Intern employees have the following characteristics:
- **No PF (Provident Fund) Deduction**: Both employee and employer contributions are 0
- **No ESI Deduction**: Both employee and employer contributions are 0
- **No Professional Tax**: Professional tax is 0
- **No Income Tax**: Income tax is 0
- **No TDS**: TDS deduction is 0
- **No Tax Declaration**: Interns cannot create tax declarations

## Implementation Details

### 1. User Model (`src/models/user.model.ts`)

Added `isIntern` field to the User interface and schema:

```typescript
// Interface
isIntern?: boolean; // Flag for special payroll treatment (no PF, no tax, no professional tax)

// Schema
isIntern: {
  type: Boolean,
  default: false,
  description: 'Flag to identify intern employees (no PF, no tax, no professional tax)'
}

// Index
userSchema.index({ isIntern: 1 });
```

### 2. User Service (`src/services/user.service.ts`)

Added `isIntern` to user creation and update interfaces:

```typescript
interface IUserCreate {
  // ... other fields
  isIntern?: boolean; // Flag for intern employees (no PF, no tax, no professional tax)
}

interface IUserUpdate {
  // ... other fields
  isIntern?: boolean; // Flag for intern employees (no PF, no tax, no professional tax)
}
```

### 3. User Routes (`src/routes/user.routes.ts`)

Added `isIntern` to all user route schemas:

**Response Schema:**
```typescript
isIntern: { type: 'boolean' }
```

**POST / (Create User):**
```typescript
isIntern: {
  type: 'boolean',
  description: 'Flag for intern employees (no PF, no tax, no professional tax)'
}
```

**PUT /:id (Update User):**
```typescript
isIntern: {
  type: 'boolean',
  description: 'Flag for intern employees (no PF, no tax, no professional tax)'
}
```

### 4. Payroll Service (`src/services/payroll.service.ts`)

Updated `calculateDeductions` function to handle intern employees:

**Function Signature:**
```typescript
async calculateDeductions(
    salaryStructure: any,
    basic: number,
    da: number,
    grossSalary: number,
    attendance: any,
    approvedLeaves: number,
    monthName: string,
    monthNumber: number,
    year: number,
    employeeId: string,
    payableDays: number,
    daysInMonth: number,
    monthlyGross: number,
    employeeCountry: string = 'IN',
    isConsultancy: boolean = false,
    isIntern: boolean = false // New parameter
)
```

**Deduction Logic:**

**PF (Provident Fund):**
```typescript
if (!isConsultancy && !isIntern) {
    // Calculate PF normally
} else if (isConsultancy) {
    console.log('Consultancy staff - No PF deduction');
} else if (isIntern) {
    console.log('Intern - No PF deduction');
}
```

**ESI:**
```typescript
if (!isConsultancy && !isIntern) {
    // Calculate ESI normally
} else if (isConsultancy) {
    console.log('Consultancy staff - No ESI deduction');
} else if (isIntern) {
    console.log('Intern - No ESI deduction');
}
```

**Professional Tax:**
```typescript
if (!isConsultancy && !isIntern) {
    // Calculate Professional Tax normally
} else if (isConsultancy) {
    console.log('Consultancy staff - No Professional Tax');
} else if (isIntern) {
    console.log('Intern - No Professional Tax');
}
```

**Income Tax / TDS:**
```typescript
if (isConsultancy) {
    // 1% TDS for consultancy
    tdsDeduction = Math.round((1 / 100) * monthlyGross);
} else if (isIntern) {
    // No income tax, No TDS for interns
    console.log('Intern - No Income Tax, No TDS');
} else {
    // Regular income tax calculation
    incomeTax = Math.round(await this.calculateIncomeTax(...));
}
```

**Passing isIntern Flag:**
```typescript
const resolvedDeductions = await this.calculateDeductions(
    // ... other parameters
    employee.country || 'IN',
    employee.isConsultancy || false,
    employee.isIntern || false // Pass intern flag
);
```

### 5. Tax Declaration Service (`src/services/tax-declaration.service.ts`)

Added validation to prevent tax declaration creation for interns:

**Single Create:**
```typescript
const user: IUser = await User.findById(employeeId).select('name joiningDate isConsultancy isIntern');

// Prevent tax declaration creation for consultancy staff
if (user.isConsultancy) {
    throw new Error('Tax declaration cannot be created for consultancy staff...');
}

// Prevent tax declaration creation for interns
if (user.isIntern) {
    throw new Error('Tax declaration cannot be created for intern employees. Interns have no tax deductions.');
}
```

**Bulk Create:**
The bulk create method calls `this.create()` internally, so the validation is automatically applied for each employee.

## Comparison: Regular vs Consultancy vs Intern

| Deduction Type | Regular Staff | Consultancy Staff | Intern |
|---------------|---------------|-------------------|--------|
| **PF (Employee)** | ✅ Calculated | ❌ 0 | ❌ 0 |
| **PF (Employer)** | ✅ Calculated | ❌ 0 | ❌ 0 |
| **ESI (Employee)** | ✅ Calculated | ❌ 0 | ❌ 0 |
| **ESI (Employer)** | ✅ Calculated | ❌ 0 | ❌ 0 |
| **Professional Tax** | ✅ Calculated | ❌ 0 | ❌ 0 |
| **Income Tax** | ✅ Calculated | ❌ 0 | ❌ 0 |
| **TDS** | ❌ 0 | ✅ 1% of Gross | ❌ 0 |
| **Tax Declaration** | ✅ Allowed | ❌ Blocked | ❌ Blocked |

## Usage

### Creating an Intern User

```json
POST /api/v1/users
{
  "name": "John Doe",
  "email": "john.intern@example.com",
  "isIntern": true,
  // ... other required fields
}
```

### Updating User to Intern

```json
PUT /api/v1/users/:id
{
  "isIntern": true
}
```

### Payroll Processing

When processing payroll for an intern:
1. All statutory deductions (PF, ESI, Professional Tax, Income Tax, TDS) will be 0
2. Net Salary = Gross Salary (minus any LOP or additional deductions)
3. Tax declaration cannot be created

## Testing Checklist

- [ ] Create user with `isIntern: true`
- [ ] Update existing user to `isIntern: true`
- [ ] Process payroll for intern user
- [ ] Verify all deductions are 0
- [ ] Verify net salary equals gross salary (minus LOP if any)
- [ ] Attempt to create tax declaration for intern (should fail)
- [ ] Attempt bulk tax declaration creation including interns (should skip interns)
- [ ] Generate payslip for intern user
- [ ] Verify salary statement Excel includes intern with 0 deductions

## Notes

- The `isIntern` flag defaults to `false` for backward compatibility
- Existing users are not affected unless explicitly updated
- Interns can still have LOP (Loss of Pay) deductions based on attendance
- The flag can be toggled at any time, affecting future payroll calculations
- Similar to consultancy staff, interns are excluded from tax declaration workflows
