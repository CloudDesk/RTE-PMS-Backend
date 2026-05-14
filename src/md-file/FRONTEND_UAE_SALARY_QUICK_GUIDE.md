# Frontend Implementation Guide - UAE Salary Structure

**Quick Reference for Frontend Developers**

---

## 📋 Summary of Changes

### **New Fields Added:**

1. **Air Ticket Allowance** (fixed amount, not percentage)
2. **Medical Allowance** (fixed amount, not percentage)
3. **Other Allowance** is now AUTO-CALCULATED (no input needed)

### **Fields Removed from UI:**

1. ~~Other Allowance Percentage~~ (in Edit Salary Structure)
2. ~~Monthly Gross~~ (in Employee Salary tab)
3. ~~Monthly Net~~ (in Employee Salary tab)

### **Field Renamed:**

- "Monthly Gross" → **"Total Salary"** (represents total monthly compensation)

---

## 🎨 UI Changes Required

### **1. Edit Salary Structure Section**

**Remove:**

- ❌ Other Allowance Percentage field

**Keep:**

- ✅ Basic Percentage
- ✅ HRA Percentage
- ✅ DA Percentage (for India)

**Note:** Other Allowance will be auto-calculated on the backend

---

### **2. Employee Salary Tab**

**Remove:**

- ❌ Monthly Gross input field
- ❌ Monthly Net input field

**Add:**

- ✅ **Total Salary** input field (replaces Monthly Gross)
- ✅ **Travel Allowance** input field (fixed amount)
- ✅ **Air Ticket Allowance** input field (fixed amount) - UAE only
- ✅ **Medical Allowance** input field (fixed amount) - UAE only

**Auto-Display (Read-only/Calculated):**

- ✅ Basic (calculated from Total Salary × Basic %)
- ✅ HRA (calculated from Total Salary × HRA %)
- ✅ DA (calculated from Basic × DA %) - for India
- ✅ **Other Allowance** (auto-calculated by backend)
- ✅ **Annual CTC** (sum of all components × 12)

---

## 📝 Form Structure

### **UAE Employee Salary Form**

```typescript
interface UAESalaryForm {
  // Input Fields (User enters these)
  totalSalary: number; // Renamed from "Monthly Gross"
  travelAllowance: number; // Fixed amount
  airTicketAllowance: number; // ✅ NEW - Fixed amount
  medicalAllowance: number; // ✅ NEW - Fixed amount
  reimbursement: number;
  monthlyInsurance: number;
  effectiveFrom: Date;
  effectiveTo: Date;
  isActive: boolean;

  // Calculated/Display Fields (Read-only, calculated on frontend)
  basic: number; // = totalSalary × basicPercentage
  hra: number; // = totalSalary × hraPercentage
  da: number; // = basic × daPercentage (usually 0 for UAE)
  otherAllowance: number; // ✅ CALCULATED: totalSalary - (basic + hra + da + travel + airTicket + medical)
  annualCTC: number; // ✅ = (totalSalary + travel + airTicket + medical + insurance) × 12
}
```

---

## 🧮 Frontend Calculations

### **1. Calculate Basic**

```typescript
const basic = (totalSalary * salaryStructure.basicPercentage) / 100;
// Example: 10000 × 40% = 4000
```

### **2. Calculate HRA**

```typescript
const hra = (totalSalary * salaryStructure.hraPercentage) / 100;
// Example: 10000 × 20% = 2000
```

### **3. Calculate DA** (for India, usually 0 for UAE)

```typescript
const da = (basic * salaryStructure.daPercentage) / 100;
// Example: 4000 × 4% = 160
```

### **4. Auto-Calculate Other Allowance** ✅ NEW

```typescript
const otherAllowance =
  totalSalary -
  (basic + hra + da + travelAllowance + airTicketAllowance + medicalAllowance);

// Validation: Other Allowance must be >= 0
if (otherAllowance < 0) {
  showError("Total of all allowances exceeds Total Salary. Please adjust.");
}
```

**Example:**

```
Total Salary:        10,000
Basic (40%):          4,000
HRA (20%):            2,000
DA (4% of Basic):       160
Travel Allowance:     1,000
Air Ticket:             500
Medical:                300
--------------------------------
Other Allowance:      2,040  (auto-calculated)
```

### **5. Calculate Annual CTC** ✅ UPDATED

```typescript
const annualCTC =
  (totalSalary +
    travelAllowance +
    airTicketAllowance +
    medicalAllowance +
    monthlyInsurance) *
  12;

// Example: (10000 + 1000 + 500 + 300 + 200) × 12 = 144,000
```

---

## 📡 API Integration

### **Create Salary Assignment - Request**

```typescript
POST /salary-assignment

{
  "employeeId": "507f1f77bcf86cd799439011",
  "salaryStructureId": "507f1f77bcf86cd799439012",
  "monthlyGross": 10000,                    // Send as "totalSalary" from form
  "travelAllowance": 1000,
  "airTicketAllowance": 500,                // ✅ NEW
  "medicalAllowance": 300,                  // ✅ NEW
  "reimbursement": 0,
  "monthlyInsurance": 200,
  "isActive": true,
  "effectiveFrom": "2025-01-01T00:00:00.000Z",
  "effectiveTo": "2025-12-31T23:59:59.999Z"
}
```

### **Get Salary Assignment - Response**

```typescript
GET /salary-assignment/user/:userId/active

{
  "success": true,
  "data": {
    "_id": "...",
    "employeeId": "...",
    "salaryStructureId": "...",
    "monthlyGross": 10000,                  // Display as "Total Salary"
    "travelAllowance": 1000,
    "airTicketAllowance": 500,              // ✅ NEW
    "medicalAllowance": 300,                // ✅ NEW
    "reimbursement": 0,
    "monthlyInsurance": 200,
    // ... other fields
  }
}
```

---

## ✅ Validation Rules

### **1. Total Salary**

- Must be > 0
- Required field

### **2. All Allowances**

- Must be >= 0 (cannot be negative)
- Optional (default to 0)

### **3. Other Allowance (Calculated)**

```typescript
// Validation before submitting
const otherAllowance =
  totalSalary -
  (basic + hra + da + travelAllowance + airTicketAllowance + medicalAllowance);

if (otherAllowance < 0) {
  throw new Error(
    `Invalid configuration: Other Allowance would be ${otherAllowance}. ` +
      `Total of Basic (${basic}) + HRA (${hra}) + DA (${da}) + ` +
      `Travel (${travelAllowance}) + Air Ticket (${airTicketAllowance}) + ` +
      `Medical (${medicalAllowance}) cannot exceed Total Salary (${totalSalary}).`
  );
}
```

### **4. Effective Dates**

- Effective From < Effective To
- No overlapping date ranges for same employee

---

## 🎨 UI Component Example (React)

```tsx
import React, { useState, useEffect } from "react";

interface SalaryFormProps {
  salaryStructure: {
    basicPercentage: number;
    hraPercentage: number;
    daPercentage: number;
  };
  employeeCountry: "IN" | "AE";
}

export const UAESalaryForm: React.FC<SalaryFormProps> = ({
  salaryStructure,
  employeeCountry,
}) => {
  const [totalSalary, setTotalSalary] = useState(0);
  const [travelAllowance, setTravelAllowance] = useState(0);
  const [airTicketAllowance, setAirTicketAllowance] = useState(0); // ✅ NEW
  const [medicalAllowance, setMedicalAllowance] = useState(0); // ✅ NEW
  const [monthlyInsurance, setMonthlyInsurance] = useState(0);

  // Calculated values
  const [basic, setBasic] = useState(0);
  const [hra, setHra] = useState(0);
  const [da, setDa] = useState(0);
  const [otherAllowance, setOtherAllowance] = useState(0);
  const [annualCTC, setAnnualCTC] = useState(0);

  useEffect(() => {
    // Calculate components
    const calculatedBasic =
      (totalSalary * salaryStructure.basicPercentage) / 100;
    const calculatedHra = (totalSalary * salaryStructure.hraPercentage) / 100;
    const calculatedDa = (calculatedBasic * salaryStructure.daPercentage) / 100;

    // ✅ AUTO-CALCULATE Other Allowance
    const calculatedOtherAllowance =
      totalSalary -
      (calculatedBasic +
        calculatedHra +
        calculatedDa +
        travelAllowance +
        airTicketAllowance +
        medicalAllowance);

    // ✅ CALCULATE Annual CTC
    const calculatedAnnualCTC =
      (totalSalary +
        travelAllowance +
        airTicketAllowance +
        medicalAllowance +
        monthlyInsurance) *
      12;

    setBasic(Math.round(calculatedBasic));
    setHra(Math.round(calculatedHra));
    setDa(Math.round(calculatedDa));
    setOtherAllowance(Math.round(calculatedOtherAllowance));
    setAnnualCTC(Math.round(calculatedAnnualCTC));
  }, [
    totalSalary,
    travelAllowance,
    airTicketAllowance,
    medicalAllowance,
    monthlyInsurance,
    salaryStructure,
  ]);

  return (
    <div className="salary-form">
      <h2>Employee Salary Assignment</h2>

      {/* Input Fields */}
      <div className="form-group">
        <label>Total Salary (Monthly) *</label>
        <input
          type="number"
          value={totalSalary}
          onChange={(e) => setTotalSalary(Number(e.target.value))}
          min="0"
          required
        />
      </div>

      <div className="form-group">
        <label>Travel Allowance</label>
        <input
          type="number"
          value={travelAllowance}
          onChange={(e) => setTravelAllowance(Number(e.target.value))}
          min="0"
        />
      </div>

      {/* ✅ NEW: Show only for UAE employees */}
      {employeeCountry === "AE" && (
        <>
          <div className="form-group">
            <label>Air Ticket Allowance</label>
            <input
              type="number"
              value={airTicketAllowance}
              onChange={(e) => setAirTicketAllowance(Number(e.target.value))}
              min="0"
            />
          </div>

          <div className="form-group">
            <label>Medical Allowance</label>
            <input
              type="number"
              value={medicalAllowance}
              onChange={(e) => setMedicalAllowance(Number(e.target.value))}
              min="0"
            />
          </div>
        </>
      )}

      <div className="form-group">
        <label>Monthly Insurance</label>
        <input
          type="number"
          value={monthlyInsurance}
          onChange={(e) => setMonthlyInsurance(Number(e.target.value))}
          min="0"
        />
      </div>

      {/* Calculated/Display Fields (Read-only) */}
      <div className="calculated-section">
        <h3>Calculated Components</h3>

        <div className="calculated-field">
          <label>Basic ({salaryStructure.basicPercentage}%)</label>
          <span>{basic.toLocaleString()}</span>
        </div>

        <div className="calculated-field">
          <label>HRA ({salaryStructure.hraPercentage}%)</label>
          <span>{hra.toLocaleString()}</span>
        </div>

        <div className="calculated-field">
          <label>DA ({salaryStructure.daPercentage}%)</label>
          <span>{da.toLocaleString()}</span>
        </div>

        {/* ✅ AUTO-CALCULATED */}
        <div className="calculated-field highlight">
          <label>Other Allowance (Auto-calculated)</label>
          <span className={otherAllowance < 0 ? "error" : ""}>
            {otherAllowance.toLocaleString()}
          </span>
        </div>

        {otherAllowance < 0 && (
          <div className="error-message">
            ⚠️ Other Allowance is negative. Please reduce fixed allowances or
            increase Total Salary.
          </div>
        )}

        {/* ✅ UPDATED CTC CALCULATION */}
        <div className="calculated-field highlight">
          <label>Annual CTC</label>
          <span>{annualCTC.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};
```

---

## 🧪 Testing Checklist

### **Frontend Tests**

- [ ] Total Salary field displays correctly
- [ ] Travel Allowance input works
- [ ] Air Ticket Allowance input works (UAE only)
- [ ] Medical Allowance input works (UAE only)
- [ ] Basic is calculated correctly
- [ ] HRA is calculated correctly
- [ ] DA is calculated correctly
- [ ] Other Allowance is auto-calculated correctly
- [ ] Other Allowance validation works (shows error when negative)
- [ ] Annual CTC is calculated correctly
- [ ] Form submission sends correct data to API
- [ ] API response displays correctly
- [ ] Fields are hidden for Indian employees (Air Ticket, Medical)

---

## 📞 Backend API Contact

If you encounter any issues with the API or calculations:

- Backend Team Lead
- API Documentation: `/documentation`

---

**Last Updated:** October 9, 2025  
**Version:** 2.0 (Annual-Only Air Ticket & Medical Allowances)  
**Status:** Ready for Frontend Implementation  
**Important:** Air Ticket & Medical are Annual amounts (not included in monthly salary display)
