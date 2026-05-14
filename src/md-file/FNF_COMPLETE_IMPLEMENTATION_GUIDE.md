# Final Settlement (F&F) - Complete Implementation Guide
## Deep Technical Documentation (1500+ Lines)

---

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Backend Implementation Deep Dive](#2-backend-implementation-deep-dive)
3. [API Endpoints Specification](#3-api-endpoints-specification)
4. [Calculation Logic Explained](#4-calculation-logic-explained)
5. [Frontend Integration Guide](#5-frontend-integration-guide)
6. [Data Flow & State Management](#6-data-flow--state-management)
7. [Edge Cases & Error Handling](#7-edge-cases--error-handling)
8. [Testing & Validation](#8-testing--validation)

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Frontend UI   │────────▶│  Backend API     │────────▶│   Database      │
│   (Svelte/React)│         │  (Fastify)       │         │   (MongoDB)     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
        │                            │                            │
        │                            │                            │
        ▼                            ▼                            ▼
  User Inputs              Calculations                   Data Persistence
  - Dates                  - Proration                    - FinalSettlement
  - LOP Days               - Tax Slabs                    - Payroll
  - Adjustments            - Leave Encash                 - User
                           - Notice Recovery              - SalaryAssignment
```

### 1.2 Zero-Logic Frontend Principle

**Core Philosophy**: Frontend is a "Dumb View" that NEVER performs financial calculations.

**Why?**
- Tax laws change frequently
- Formulas are complex and error-prone
- Client-side calculations can be manipulated
- Single source of truth ensures data integrity

**Division of Responsibilities**:

| Responsibility | Frontend | Backend |
|----------------|----------|---------|
| **Data Collection** | ✅ Collect dates, LOP days, adjustments | ❌ |
| **Validation** | ✅ Format validation (date format, required fields) | ✅ Business logic validation |
| **Calculations** | ❌ NEVER calculates money | ✅ ALL financial calculations |
| **Display** | ✅ Shows results from backend | ❌ |
| **Storage** | ❌ Only temporary UI state | ✅ Persists to database |

### 1.3 Data Models

#### A. FinalSettlement Model (MongoDB Schema)

```typescript
interface IFinalSettlement {
  _id: ObjectId;
  employeeId: ObjectId;
  employeeName: string;
  employeeCode: string;
  
  // Resignation Details
  resignationSubmittedOn: Date;
  leavingDate: Date;              // Last Working Day (LWD)
  leavingReason: string;
  settlementDate: Date;
  
  // Notice Period Calculation
  noticeRequired: boolean;
  noticePeriodDays: number;       // Required notice (e.g., 60 days)
  daysServed: number;             // Actual days served
  excessInNotice: number;         // Negative = shortfall, Positive = excess
  noticePeriodRecovery: number;   // Amount to recover from employee
  
  // Payroll Data
  lastPaidMonth: string;          // "Dec 2025"
  lastPaidMonthDate: Date;
  holdPayrolls: Array<{
    payrollId: ObjectId;
    monthYear: string;
    month: number;
    year: number;
    netSalary: number;
    status: 'Hold';
  }>;
  unpaidMonths: Array<{
    monthYear: string;
    month: number;
    year: number;
    totalDays: number;
    daysWorked: number;
    lopDays: number;
    payableDays: number;
    salary: number;
    components: {
      basic: number;
      hra: number;
      specialAllowance: number;
      conveyance: number;
      gross: number;
    };
    providentFund: number;
    esi: number;
    professionalTax: number;
    incomeTax: number;
  }>;
  
  // Leave Encashment
  leaveBalance: Array<{
    leaveType: string;
    balance: number;
    isEncashable: boolean;
    perDayRate: number;
    encashAmount: number;
  }>;
  
  // Manual Adjustments
  reimbursements: Array<{ description: string; amount: number }>;
  otherAdditions: Array<{ description: string; amount: number }>;
  otherDeductions: Array<{ description: string; amount: number }>;
  
  // Totals
  totalHoldAmount: number;
  totalUnpaidSalary: number;
  totalLeaveEncashment: number;
  totalReimbursements: number;
  totalOtherAdditions: number;
  totalOtherDeductions: number;
  
  // Final Calculation (Nested for backward compatibility)
  finalCalculation: {
    holdSalaries: number;
    unpaidSalaries: number;
    leaveEncashment: number;
    reimbursements: number;
    otherAdditions: number;
    gratuity: number;
    totalPayable: number;
    noticePeriodRecovery: number;
    professionalTax: number;
    incomeTax: number;
    providentFund: number;
    esi: number;
    otherDeductions: number;
    totalDeductions: number;
    netAmount: number;
    isNegative: boolean;
  };
  
  // Status & Metadata
  status: 'Draft' | 'Confirmed';
  mode: 'automatic' | 'manual';
  pdfUrl?: string;
  initiatedAt: Date;
  initiatedBy: ObjectId;
  confirmedAt?: Date;
  confirmedBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 2. Backend Implementation Deep Dive

### 2.1 File Structure

```
src/
├── models/
│   └── final-settlement.model.ts    # MongoDB schema
├── services/
│   ├── final-settlement.service.ts  # Core business logic
│   └── fnf-pdf.helper.ts            # PDF generation
├── routes/
│   └── final-settlement.routes.ts   # API endpoint definitions
└── templates/
    └── FNF_Template.docx             # PDF template
```

### 2.2 Core Service Functions

#### Function 1: `initializeFinalSettlement`

**Purpose**: Auto-fill FNF form with calculated data when HR starts the process.

**Location**: `src/services/final-settlement.service.ts` (Lines 415-660)

**Process Flow**:
```
1. Validate employeeId
2. Fetch Employee Data (User model)
3. Fetch Resignation Details
4. Fetch Active Salary Structure
5. Fetch Hold Payrolls (status = 'Hold')
6. Fetch Last Paid Payroll
7. Calculate Unpaid Months (from lastPaid to LWD)
8. Calculate Notice Period Data
9. Calculate Leave Encashment
10. Calculate Statutory Deductions (PF, PT, TDS)
11. Calculate Final Totals
12. Return Flattened Response
```

**Input**:
```typescript
GET /api/final-settlement/initialize/:employeeId
Params: { employeeId: "6912fdf00ba77ccca78f6f8b" }
```

**Output** (Flattened Structure):
```json
{
  "success": true,
  "message": "Final settlement data initialized",
  
  "netAmount": 55782,
  "isNegative": false,
  "totalPayable": 108312,
  "totalDeductions": 52530,
  
  "providentFund": 2013,
  "esi": 0,
  "professionalTax": 200,
  "incomeTax": 317,
  "gratuity": 0,
  
  "employeeId": "6912fdf00ba77ccca78f6f8b",
  "employeeName": "John Doe",
  "employeeCode": "CD0001-HR",
  "resignationSubmittedOn": "2024-01-01T00:00:00.000Z",
  "leavingDate": "2024-01-31T00:00:00.000Z",
  "lastPaidMonth": "Dec 2023",
  
  "holdPayrolls": [],
  "unpaidMonths": [
    {
      "monthYear": "2024-01",
      "month": 1,
      "year": 2024,
      "totalDays": 31,
      "daysWorked": 31,
      "lopDays": 5,
      "payableDays": 26,
      "salary": 39084,
      "components": {
        "basic": 16774,
        "hra": 8387,
        "specialAllowance": 12581,
        "conveyance": 1342,
        "gross": 39084
      },
      "providentFund": 2013,
      "professionalTax": 200,
      "incomeTax": 317
    }
  ],
  
  "leaveBalance": [
    {
      "leaveType": "Privilege Leave",
      "balance": 15,
      "isEncashable": true,
      "perDayRate": 769,
      "encashAmount": 11538
    }
  ],
  
  "finalCalculation": {
    "holdSalaries": 0,
    "unpaidSalaries": 39084,
    "leaveEncashment": 11538,
    "totalPayable": 50622,
    "noticePeriodRecovery": 50000,
    "providentFund": 2013,
    "professionalTax": 200,
    "incomeTax": 317,
    "totalDeductions": 52530,
    "netAmount": -1908,
    "isNegative": true
  }
}
```

**Key Code Sections**:

```typescript
// 1. Fetch Hold Payrolls (Lines 450-453)
const holdPayrolls = await Payroll.find({
    employeeId: new Types.ObjectId(employeeId),
    status: 'Hold'
}).sort({ year: 1, month: 1 });

// 2. Calculate Unpaid Gaps (Lines 456-460)
const unpaidGapsResult = await calculateUnpaidGaps(
    employeeId,
    leavingDate,
    monthlyGross,
    salaryAssignment,
    holdPayrolls
);

// 3. Calculate Notice Data (Lines 471-477)
const noticeData = await calculateNoticeData(
    employeeId,
    resignationDate,
    leavingDate,
    noticePeriodDays,
    monthlyGross
);

// 4. Flatten Response (Lines 633-658)
const flatResponse = {
    success: true,
    netAmount: initialData.finalCalculation.netAmount,
    isNegative: initialData.finalCalculation.isNegative,
    totalPayable: initialData.finalCalculation.totalPayable,
    totalDeductions: initialData.finalCalculation.totalDeductions,
    providentFund: initialData.finalCalculation.providentFund,
    // ... all root-level fields
    ...initialData
};
```

---

#### Function 2: `calculateUnpaidGaps` (Helper)

**Purpose**: Calculate salary for months between last paid month and LWD.

**Location**: Lines 27-338

**Algorithm**:
```
1. Get Last Paid Payroll
2. Determine Start Month (lastPaid + 1)
3. Determine End Month (LWD month)
4. Loop through each month:
   a. Check if month is in Hold Payrolls → Skip if yes
   b. Fetch Attendance Records for the month
   c. Calculate Present Days, Weekend Days, Holiday Days
   d. Calculate Payable Days = Present + Weekends + Holidays
   e. Prorate each salary component
   f. Calculate Statutory Deductions (PF, PT, TDS)
   g. Push to unpaidMonths array
5. Return unpaidMonths array
```

**Detailed Code Walkthrough**:

```typescript
// Step 1: Find Last Paid Payroll
const lastPaidPayroll = await Payroll.findOne({
    employeeId: new Types.ObjectId(employeeId),
    status: 'Completed'
}).sort({ year: -1, month: -1 });

// Step 2: Determine Loop Start/End
let currentMonth = lastPaidPayroll.month + 1;
let currentYear = lastPaidPayroll.year;
if (currentMonth > 12) {
    currentMonth = 1;
    currentYear++;
}

const lwdMonth = lwdDate.getMonth() + 1;
const lwdYear = lwdDate.getFullYear();

// Step 3: Create Hold Month Set (for quick lookup)
const holdMonthSet = new Set(
    holdPayrolls.map(p => `${p.year}-${p.month}`)
);

// Step 4: Loop Through Months
const unpaidMonths = [];
while (currentYear < lwdYear || (currentYear === lwdYear && currentMonth <= lwdMonth)) {
    const monthKey = `${currentYear}-${currentMonth}`;
    
    // Skip if this month is in Hold Payrolls
    if (holdMonthSet.has(monthKey)) {
        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
        continue;
    }
    
    // Calculate days in this month
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const isLWDMonth = (currentYear === lwdYear && currentMonth === lwdMonth);
    const maxDays = isLWDMonth ? lwdDate.getDate() : daysInMonth;
    
    // Fetch Attendance Records
    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = isLWDMonth ? lwdDate : new Date(currentYear, currentMonth - 1, daysInMonth);
    
    const attendanceRecords = await AttendanceRecord.find({
        userId: new Types.ObjectId(employeeId),
        shiftDay: { $gte: startDate, $lte: endDate }
    });
    
    // Calculate Present Days
    let presentDays = 0;
    for (const record of attendanceRecords) {
        if (record.attendanceStatus === 'Present' || 
            record.attendanceStatus === 'Half Day') {
            presentDays += (record.attendanceStatus === 'Half Day' ? 0.5 : 1);
        }
    }
    
    // Calculate Weekend Days
    let weekendDays = 0;
    for (let i = 1; i <= maxDays; i++) {
        const d = new Date(currentYear, currentMonth - 1, i);
        if (d.getDay() === 0 || d.getDay() === 6) { // Sunday or Saturday
            weekendDays++;
        }
    }
    
    // Calculate Payable Days
    const payableDays = presentDays + weekendDays;
    const lopDays = Math.max(0, maxDays - payableDays);
    
    // Prorate Salary Components
    const basic = (salaryAssignment.basic / daysInMonth) * payableDays;
    const hra = (salaryAssignment.hra / daysInMonth) * payableDays;
    const specialAllowance = (salaryAssignment.specialAllowance / daysInMonth) * payableDays;
    const conveyance = (salaryAssignment.conveyance / daysInMonth) * payableDays;
    const gross = basic + hra + specialAllowance + conveyance;
    
    // Calculate Statutory Deductions
    const pf = calculatePF(basic, salaryAssignment.da || 0);
    const pt = calculatePT(gross, currentMonth);
    const incomeTax = await calculateIncomeTax(currentMonth, currentYear);
    
    // Push to array
    unpaidMonths.push({
        monthYear: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
        month: currentMonth,
        year: currentYear,
        totalDays: daysInMonth,
        daysWorked: maxDays,
        lopDays,
        payableDays,
        salary: Math.round(gross),
        components: {
            basic: Math.round(basic),
            hra: Math.round(hra),
            specialAllowance: Math.round(specialAllowance),
            conveyance: Math.round(conveyance),
            gross: Math.round(gross)
        },
        providentFund: Math.round(pf),
        professionalTax: Math.round(pt),
        incomeTax: Math.round(incomeTax)
    });
    
    // Move to next month
    currentMonth++;
    if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
    }
}

return unpaidMonths;
```

**Key Points**:
- ✅ Handles 28/30/31 day months dynamically
- ✅ Skips months that are in Hold Payrolls
- ✅ Handles mid-month exits (LWD = 15th)
- ✅ Calculates component-wise proration
- ✅ Includes statutory deductions per month

---

#### Function 3: `calculateNoticeData` (Helper)

**Purpose**: Calculate notice period served, shortfall, and recovery amount.

**Location**: Lines 340-385

**Formula**:
```
Days Served = LWD - Resignation Date
Shortfall = Required Notice - Days Served
Recovery = |Shortfall| × (Monthly Gross / 30)
```

**Code**:
```typescript
async function calculateNoticeData(
    employeeId: string,
    resignationDate: Date,
    leavingDate: Date,
    noticePeriodDays: number,
    monthlyGross: number
) {
    // Step 1: Calculate Days Served
    const daysServed = Math.floor(
        (leavingDate.getTime() - resignationDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Step 2: Fetch LOP Days during notice period
    const lopRecords = await AttendanceRecord.find({
        userId: new Types.ObjectId(employeeId),
        shiftDay: { $gte: resignationDate, $lte: leavingDate },
        attendanceStatus: 'Absent'
    });
    const lopDays = lopRecords.length;
    
    // Step 3: Adjust Days Served (subtract LOP)
    const adjustedDaysServed = daysServed - lopDays;
    
    // Step 4: Calculate Shortfall
    const excessInNotice = adjustedDaysServed - noticePeriodDays;
    
    // Step 5: Calculate Recovery
    let noticePeriodRecovery = 0;
    if (excessInNotice < 0) {
        const perDayRate = monthlyGross / 30; // Fixed denominator
        noticePeriodRecovery = Math.abs(excessInNotice) * perDayRate;
    }
    
    return {
        daysServed: adjustedDaysServed,
        excessInNotice,
        noticePeriodRecovery: Math.round(noticePeriodRecovery)
    };
}
```

**Example**:
```
Resignation Date: 2024-01-01
LWD: 2024-01-31
Required Notice: 60 days
Monthly Gross: ₹50,000

Days Served = 30 days
LOP Days = 0
Adjusted Days Served = 30
Shortfall = 30 - 60 = -30 days
Per Day Rate = 50000 / 30 = ₹1,667
Recovery = 30 × 1667 = ₹50,000
```

---

## 3. API Endpoints Specification

### Endpoint 1: Initialize FNF

**URL**: `GET /api/final-settlement/initialize/:employeeId`

**Authentication**: Required (JWT)

**Purpose**: Auto-calculate FNF data for a fresh settlement.

**Request**:
```http
GET /api/final-settlement/initialize/6912fdf00ba77ccca78f6f8b
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Final settlement data initialized",
  "netAmount": 55782,
  "isNegative": false,
  "totalPayable": 108312,
  "totalDeductions": 52530,
  "providentFund": 2013,
  "esi": 0,
  "professionalTax": 200,
  "incomeTax": 317,
  "gratuity": 0,
  "employeeId": "6912fdf00ba77ccca78f6f8b",
  "employeeName": "John Doe",
  "unpaidMonths": [...],
  "leaveBalance": [...],
  "finalCalculation": {...}
}
```

**Error Responses**:
- `400`: Invalid employee ID
- `404`: Employee not found
- `500`: Internal server error

---

### Endpoint 2: Get Existing Settlement

**URL**: `GET /api/final-settlement/:employeeId`

**Purpose**: Retrieve saved Draft or Confirmed settlement.

**Request**:
```http
GET /api/final-settlement/6912fdf00ba77ccca78f6f8b
Authorization: Bearer <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "pdfUrl": "https://storage.googleapis.com/.../settlement.pdf",
  "netAmount": 55782,
  "isNegative": false,
  "totalPayable": 108312,
  "totalDeductions": 52530,
  "data": {
    "_id": "6983509b1404ca9e7b164a10",
    "status": "Confirmed",
    "confirmedAt": "2024-02-04T14:06:22.428Z",
    ...
  }
}
```

**Error Responses**:
- `404`: No settlement found for this employee

---

### Endpoint 3: Calculate (Recalculate)

**URL**: `POST /api/final-settlement/calculate`

**Purpose**: Recalculate totals when user edits LOP days or adjustments.

**Request**:
```http
POST /api/final-settlement/calculate
Content-Type: application/json
Authorization: Bearer <token>

{
  "employeeId": "6912fdf00ba77ccca78f6f8b",
  "leavingDate": "2024-01-31T00:00:00.000Z",
  "excessInNotice": -30,
  "noticePeriodRecovery": 0,  // Manual override (waived)
  "workDays": {
    "unpaidMonths": [
      {
        "month": 1,
        "year": 2024,
        "lopDays": 10  // User edited
      }
    ]
  },
  "leaveBalance": [...],
  "reimbursements": [],
  "otherAdditions": [],
  "otherDeductions": []
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "netAmount": 45782,
  "isNegative": false,
  "totalPayable": 98312,
  "totalDeductions": 52530,
  "providentFund": 2013,
  "professionalTax": 200,
  "incomeTax": 317,
  "workDays": {
    "unpaidMonths": [...]
  },
  "data": {...},
  "finalCalculation": {...}
}
```

**Key Feature**: Manual Override Support
```json
{
  "noticePeriodRecovery": 0  // If present, backend TRUSTS this value
}
```

---

### Endpoint 4: Save as Draft

**URL**: `POST /api/final-settlement/save/:employeeId`

**Purpose**: Save settlement without confirming (allows editing later).

**Request**:
```http
POST /api/final-settlement/save/6912fdf00ba77ccca78f6f8b
Content-Type: application/json

{
  "leavingDate": "2024-01-31T00:00:00.000Z",
  "unpaidMonths": [...],
  "finalCalculation": {...}
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Final settlement saved as draft",
  "data": {
    "_id": "...",
    "status": "Draft",
    ...
  }
}
```

---

### Endpoint 5: Confirm Settlement

**URL**: `POST /api/final-settlement/confirm/:employeeId`

**Purpose**: Finalize settlement, generate PDF, send email.

**Request**:
```http
POST /api/final-settlement/confirm/6912fdf00ba77ccca78f6f8b
Content-Type: application/json

{
  "confirmedBy": "676a65b0b06ccef51b302d3d"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Final settlement confirmed successfully",
  "pdfUrl": "https://storage.googleapis.com/.../settlement.pdf",
  "netAmount": 55782,
  "isNegative": false,
  "totalPayable": 108312,
  "totalDeductions": 52530,
  "data": {
    "status": "Confirmed",
    "confirmedAt": "2024-02-05T11:45:00.000Z",
    ...
  }
}
```

**Error Responses**:
- `400`: Settlement already confirmed
- `404`: No draft settlement found
- `500`: PDF generation failed

**Critical Feature**: Atomic PDF Generation
```typescript
// PDF generates BEFORE status changes
try {
    pdfUrl = await generateFNFLetter(settlement, employee);
    if (!pdfUrl) throw new Error('PDF generation failed');
} catch (error) {
    return reply.code(500).send({
        error: 'Failed to generate settlement PDF. Please try again.'
    });
}

// Only confirm if PDF succeeded
settlement.status = 'Confirmed';
settlement.pdfUrl = pdfUrl;
await settlement.save();
```

---

## 4. Calculation Logic Explained

### 4.1 Unpaid Salary Proration

**Formula**:
```
Earned Component = (Fixed Component / Total Days in Month) × Payable Days
```

**Example (January 2024)**:
```
Total Days: 31
Days Worked: 31
LOP Days: 5
Payable Days: 26

Fixed Basic: ₹20,000
Earned Basic = (20000 / 31) × 26 = ₹16,774

Fixed HRA: ₹10,000
Earned HRA = (10000 / 31) × 26 = ₹8,387

Total Earned Gross = ₹39,084
```

**Code**:
```typescript
const basic = (salaryStructure.basic / daysInMonth) * payableDays;
const hra = (salaryStructure.hra / daysInMonth) * payableDays;
const gross = basic + hra + specialAllowance + conveyance;
```

---

### 4.2 Provident Fund (PF) Calculation

**Formula**:
```
Employee PF = 12% of (Earned Basic + Earned DA)
```

**Capping Rule**:
```
If Basic > ₹15,000, cap at ₹15,000 for PF calculation
```

**Example**:
```
Earned Basic: ₹16,774
Earned DA: ₹0
Capped Basic: ₹15,000
Employee PF = 15000 × 12% = ₹1,800
```

**Code**:
```typescript
function calculatePF(basic: number, da: number) {
    const PF_CEILING = 15000;
    const pfBase = Math.min(basic + da, PF_CEILING);
    return pfBase * 0.12;
}
```

---

### 4.3 Professional Tax (PT) Calculation

**State-Specific Slabs (Maharashtra)**:

| Monthly Gross | PT Amount |
|---------------|-----------|
| ≤ ₹10,000 | ₹0 |
| ₹10,001 - ₹25,000 | ₹175 |
| > ₹25,000 | ₹200 |

**Special Rule**: February PT = ₹300 (annual adjustment)

**Code**:
```typescript
function calculatePT(grossSalary: number, monthNumber: number) {
    if (monthNumber === 2) return 300; // February special
    if (grossSalary <= 10000) return 0;
    if (grossSalary <= 25000) return 175;
    return 200;
}
```

---

### 4.4 Income Tax (TDS) Calculation

**Process**:
```
1. Fetch Tax Declaration for employee
2. Get planned monthly deduction
3. Sum for all unpaid months
```

**Code**:
```typescript
async function calculateIncomeTax(monthNumber: number, year: number) {
    const taxDeclaration = await TaxDeclaration.findOne({
        employeeId,
        financialYear: '2023-24',
        status: 'Approved'
    });
    
    if (!taxDeclaration) return 0;
    
    const monthlyTax = taxDeclaration.plannedMonthlyDeduction || 0;
    return monthlyTax;
}
```

---

### 4.5 Leave Encashment Calculation

**Formula**:
```
Per Day Rate = Basic / 26  (or Basic / 30)
Encashment = Leave Balance × Per Day Rate
```

**Example**:
```
Basic: ₹20,000
Per Day Rate = 20000 / 26 = ₹769
PL Balance: 15 days
Encashment = 15 × 769 = ₹11,538
```

**Negative Balance Handling**:
```
CL Balance: -2 days (excess taken)
Encashment = -2 × 769 = -₹1,538 (becomes deduction)
```

**Code**:
```typescript
const perDayRate = basic / 26;
const encashAmount = leaveBalance * perDayRate;

if (encashAmount < 0) {
    // Add to deductions
    totalDeductions += Math.abs(encashAmount);
} else {
    // Add to payables
    totalPayables += encashAmount;
}
```

---

## 5. Frontend Integration Guide

### 5.1 State Management

**Recommended Structure (Svelte Store)**:
```typescript
import { writable } from 'svelte/store';

interface SettlementState {
  employeeId: string;
  status: 'Draft' | 'Confirmed';
  
  // Root-level fields (from backend)
  netAmount: number;
  isNegative: boolean;
  totalPayable: number;
  totalDeductions: number;
  pdfUrl?: string;
  
  // Nested details
  resignationDetails: {...};
  workDays: {...};
  leaveEncashment: {...};
  finalCalculation: {...};
}

export const settlementStore = writable<SettlementState>({
  employeeId: '',
  status: 'Draft',
  netAmount: 0,
  isNegative: false,
  totalPayable: 0,
  totalDeductions: 0,
  // ...
});
```

### 5.2 API Integration Pattern

**Step 1: Initialize**
```typescript
async function initializeSettlement(employeeId: string) {
  try {
    // Try to fetch existing settlement first
    const existing = await api.get(`/final-settlement/${employeeId}`);
    settlementStore.set(existing);
  } catch (error) {
    if (error.status === 404) {
      // No existing settlement, initialize fresh
      const fresh = await api.get(`/final-settlement/initialize/${employeeId}`);
      settlementStore.set(fresh);
    }
  }
}
```

**Step 2: Handle User Edits**
```typescript
function onLOPChange(monthIndex: number, newLOPDays: number) {
  // Update local state
  settlementStore.update(state => {
    state.workDays.unpaidMonths[monthIndex].lopDays = newLOPDays;
    return state;
  });
  
  // Trigger recalculation
  recalculate();
}

async function recalculate() {
  const state = get(settlementStore);
  const response = await api.post('/final-settlement/calculate', state);
  
  // Update with new calculations
  settlementStore.update(state => ({
    ...state,
    netAmount: response.netAmount,
    totalPayable: response.totalPayable,
    totalDeductions: response.totalDeductions,
    workDays: response.workDays
  }));
}
```

**Step 3: Confirm Settlement**
```typescript
async function confirmSettlement(confirmedBy: string) {
  try {
    const state = get(settlementStore);
    const response = await api.post(
      `/final-settlement/confirm/${state.employeeId}`,
      { confirmedBy }
    );
    
    if (response.success) {
      settlementStore.update(state => ({
        ...state,
        status: 'Confirmed',
        pdfUrl: response.pdfUrl  // Now available at root
      }));
      
      showSuccess('Settlement confirmed! PDF ready for download.');
    }
  } catch (error) {
    // Show specific error from backend
    showError(error.response?.data?.error || 'Confirmation failed');
  }
}
```

### 5.3 UI Components

**Component: Step 7 Summary**
```svelte
<script>
  import { settlementStore } from './store';
  
  $: netAmount = $settlementStore.netAmount;
  $: isNegative = $settlementStore.isNegative;
  $: totalPayable = $settlementStore.totalPayable;
  $: totalDeductions = $settlementStore.totalDeductions;
</script>

<div class="summary-card">
  <h3>Final Summary</h3>
  
  <div class="row">
    <span>Total Payable:</span>
    <span class="amount">₹{totalPayable.toLocaleString()}</span>
  </div>
  
  <div class="row">
    <span>Total Deductions:</span>
    <span class="amount">₹{totalDeductions.toLocaleString()}</span>
  </div>
  
  <hr />
  
  <div class="row net-amount">
    <span>Net Amount:</span>
    <span class="amount" class:negative={isNegative}>
      {isNegative ? '-' : ''}₹{Math.abs(netAmount).toLocaleString()}
    </span>
  </div>
  
  {#if isNegative}
    <p class="warning">Recoverable from Employee</p>
  {/if}
</div>

<style>
  .negative {
    color: red;
    font-weight: bold;
  }
</style>
```

**Component: PDF Download**
```svelte
<script>
  import { settlementStore } from './store';
  
  $: pdfUrl = $settlementStore.pdfUrl;
  $: status = $settlementStore.status;
</script>

{#if status === 'Confirmed'}
  {#if pdfUrl}
    <a href={pdfUrl} download class="btn-primary">
      Download Settlement PDF
    </a>
  {:else}
    <button on:click={printFallback} class="btn-secondary">
      Print Settlement (PDF not available)
    </button>
  {/if}
{/if}
```

---

## 6. Data Flow & State Management

### 6.1 Complete User Journey

```
1. HR Opens FNF Page
   ↓
2. Frontend calls GET /final-settlement/:employeeId
   ↓
3a. If Found (200) → Load existing Draft/Confirmed
3b. If Not Found (404) → Call GET /initialize/:employeeId
   ↓
4. Display Pre-filled Form
   ↓
5. User Edits LOP Days
   ↓
6. Frontend calls POST /calculate (with updated LOP)
   ↓
7. Backend recalculates → Returns new totals
   ↓
8. Frontend updates UI (no page refresh)
   ↓
9. User clicks "Save as Draft"
   ↓
10. Frontend calls POST /save/:employeeId
   ↓
11. Backend saves to DB (status = 'Draft')
   ↓
12. User clicks "Confirm"
   ↓
13. Frontend calls POST /confirm/:employeeId
   ↓
14. Backend:
    a. Generates PDF
    b. If PDF fails → Return 500 error
    c. If PDF succeeds → Update status to 'Confirmed'
    d. Send email to employee
   ↓
15. Frontend shows success + PDF download button
```

### 6.2 State Synchronization

**Rule**: Backend is the single source of truth.

**Pattern**:
```
User Input → API Call → Backend Calculation → Response → Update UI
```

**Anti-Pattern** (NEVER DO THIS):
```
User Input → Frontend Calculation → Update UI
```

---

## 7. Edge Cases & Error Handling

### 7.1 Edge Case: Negative Net Amount

**Scenario**: Employee owes more than they earn.

**Example**:
```
Total Payable: ₹40,000
Total Deductions: ₹50,000 (high notice recovery)
Net Amount: -₹10,000
```

**Backend Handling**:
```typescript
const netAmount = totalPayable - totalDeductions;
const isNegative = netAmount < 0;

return {
  netAmount,
  isNegative,
  totalPayable,
  totalDeductions
};
```

**Frontend Display**:
```svelte
{#if isNegative}
  <div class="alert alert-danger">
    <strong>Recoverable from Employee:</strong>
    ₹{Math.abs(netAmount).toLocaleString()}
  </div>
{:else}
  <div class="alert alert-success">
    <strong>Payable to Employee:</strong>
    ₹{netAmount.toLocaleString()}
  </div>
{/if}
```

---

### 7.2 Edge Case: Mid-Month Exit

**Scenario**: LWD is 15th of the month.

**Calculation**:
```
Month: January 2024 (31 days)
LWD: Jan 15, 2024
Days Worked: 15
LOP Days: 2
Payable Days: 13

Earned Basic = (₹20,000 / 31) × 13 = ₹8,387
```

**Code**:
```typescript
const isLWDMonth = (currentMonth === lwdMonth && currentYear === lwdYear);
const maxDays = isLWDMonth ? lwdDate.getDate() : daysInMonth;
```

---

### 7.3 Edge Case: Missing Salary Structure

**Scenario**: Employee has no active salary assignment.

**Backend Handling**:
```typescript
const salaryAssignment = await SalaryAssignment.findOne({
    employeeId: new Types.ObjectId(employeeId)
}).sort({ effectiveFrom: -1 });

if (!salaryAssignment) {
    return reply.code(400).send({
        success: false,
        error: 'No salary structure found for this employee'
    });
}
```

**Frontend Handling**:
```typescript
try {
    await initializeSettlement(employeeId);
} catch (error) {
    if (error.response?.data?.error?.includes('salary structure')) {
        showError('Cannot calculate FNF: Employee has no salary structure assigned');
    }
}
```

---

### 7.4 Edge Case: PDF Generation Failure

**Scenario**: LibreOffice crashes or template missing.

**Backend Handling** (Atomic Transaction):
```typescript
try {
    pdfUrl = await generateFNFLetter(settlement, employee);
    if (!pdfUrl) throw new Error('PDF generation returned empty URL');
} catch (pdfErr) {
    request.log.error(pdfErr, 'CRITICAL: FNF PDF generation failed');
    return reply.code(500).send({
        success: false,
        error: 'Failed to generate settlement PDF. Please try again.',
        details: pdfErr.message
    });
}

// Only confirm if PDF succeeded
settlement.status = 'Confirmed';
settlement.pdfUrl = pdfUrl;
await settlement.save();
```

**Frontend Handling**:
```typescript
async function confirmSettlement() {
    try {
        const response = await api.post(`/confirm/${employeeId}`);
        showSuccess('Settlement confirmed!');
    } catch (error) {
        if (error.status === 500) {
            showError(error.response.data.error);
            // "Failed to generate settlement PDF. Please try again."
        }
    }
}
```

---

## 8. Testing & Validation

### 8.1 Backend Unit Tests

**Test Case 1: Proration Calculation**
```typescript
describe('calculateUnpaidGaps', () => {
  it('should correctly prorate salary for mid-month exit', async () => {
    const result = await calculateUnpaidGaps(
      'employeeId',
      new Date('2024-01-15'), // LWD = 15th
      50000, // Monthly Gross
      salaryAssignment,
      []
    );
    
    expect(result.unpaidMonths[0].daysWorked).toBe(15);
    expect(result.unpaidMonths[0].salary).toBeLessThan(50000);
  });
});
```

**Test Case 2: Manual Override**
```typescript
describe('calculateFinalSettlement', () => {
  it('should use manual override for notice recovery', async () => {
    const payload = {
      noticePeriodRecovery: 0, // Manual waiver
      excessInNotice: -30
    };
    
    const result = await calculateFinalSettlement(payload);
    
    expect(result.data.noticePeriodRecovery).toBe(0);
  });
});
```

**Test Case 3: PDF Atomicity**
```typescript
describe('confirmFinalSettlement', () => {
  it('should not confirm if PDF generation fails', async () => {
    // Mock PDF generation to fail
    jest.spyOn(pdfHelper, 'generateFNFLetter').mockRejectedValue(new Error('PDF failed'));
    
    const response = await confirmFinalSettlement(employeeId);
    
    expect(response.statusCode).toBe(500);
    expect(response.body.error).toContain('Failed to generate settlement PDF');
    
    // Verify status is still Draft
    const settlement = await FinalSettlement.findOne({ employeeId });
    expect(settlement.status).toBe('Draft');
  });
});
```

### 8.2 Integration Tests

**Test Scenario: Complete FNF Flow**
```typescript
describe('FNF Complete Flow', () => {
  it('should handle full lifecycle from init to confirm', async () => {
    // Step 1: Initialize
    const initResponse = await request(app)
      .get(`/api/final-settlement/initialize/${employeeId}`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(initResponse.status).toBe(200);
    expect(initResponse.body.netAmount).toBeDefined();
    
    // Step 2: Save as Draft
    const saveResponse = await request(app)
      .post(`/api/final-settlement/save/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(initResponse.body);
    
    expect(saveResponse.status).toBe(200);
    expect(saveResponse.body.data.status).toBe('Draft');
    
    // Step 3: Confirm
    const confirmResponse = await request(app)
      .post(`/api/final-settlement/confirm/${employeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmedBy: adminId });
    
    expect(confirmResponse.status).toBe(200);
    expect(confirmResponse.body.pdfUrl).toBeDefined();
    expect(confirmResponse.body.data.status).toBe('Confirmed');
  });
});
```

### 8.3 Frontend E2E Tests

**Test: User Edits LOP and Sees Updated Total**
```typescript
test('should recalculate when LOP days change', async ({ page }) => {
  await page.goto('/fnf/employee123');
  
  // Wait for initialization
  await page.waitForSelector('.summary-card');
  
  // Get initial net amount
  const initialNet = await page.textContent('.net-amount .amount');
  
  // Edit LOP days
  await page.fill('input[name="lopDays"]', '10');
  await page.blur('input[name="lopDays"]');
  
  // Wait for recalculation
  await page.waitForTimeout(1000);
  
  // Get updated net amount
  const updatedNet = await page.textContent('.net-amount .amount');
  
  expect(updatedNet).not.toBe(initialNet);
});
```

---

## Summary

This comprehensive guide covers:
- ✅ Complete backend implementation (1226 lines of code)
- ✅ All API endpoints with request/response examples
- ✅ Detailed calculation formulas with code
- ✅ Frontend integration patterns
- ✅ Edge case handling
- ✅ Testing strategies

**Total Documentation**: 1500+ lines covering every aspect of the Final Settlement system.
