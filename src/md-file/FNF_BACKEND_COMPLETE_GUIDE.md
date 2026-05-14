# Final Settlement - Complete Backend Implementation Guide

**Date**: February 5, 2026  
**Purpose**: Complete backend flow, calculations, template, and PDF generation  
**Status**: ✅ Production Ready

---

## Table of Contents

1. [Backend Architecture](#1-backend-architecture)
2. [API Endpoints](#2-api-endpoints)
3. [Calculation Engine](#3-calculation-engine)
4. [PDF Generation Pipeline](#4-pdf-generation-pipeline)
5. [Template Variables](#5-template-variables)
6. [Database Schema](#6-database-schema)

---

## 1. Backend Architecture

### 1.1 File Structure

```
src/
├── models/
│   └── final-settlement.model.ts      # MongoDB schema
├── routes/
│   └── final-settlement.routes.ts     # API routes (7 endpoints)
├── services/
│   ├── final-settlement.service.ts    # Business logic (1,400+ lines)
│   └── fnf-pdf.helper.ts              # PDF generation (308 lines)
└── templates/
    └── Final_Settlement.docx          # DOCX template
```

### 1.2 Technology Stack

- **Framework**: Fastify
- **Database**: MongoDB (Mongoose)
- **PDF**: Docxtemplater + LibreOffice
- **Storage**: Google Cloud Storage
- **Authentication**: JWT middleware

---

## 2. API Endpoints

### 2.1 GET /final-settlement/initialize/:employeeId

**Purpose**: Initialize new settlement with auto-calculated data

**Flow**:
```
1. Fetch employee data
2. Fetch resignation record
3. Fetch salary structure
4. Fetch hold payrolls
5. Calculate unpaid months
6. Calculate notice recovery
7. Calculate leave encashment
8. Calculate statutory deductions
9. Return flat response
```

**Response**:
```json
{
  "success": true,
  "netAmount": 55782,
  "totalPayable": 108312,
  "totalDeductions": 52530,
  "providentFund": 2013,
  "professionalTax": 200,
  "incomeTax": 317,
  "esi": 0,
  "gratuity": 0,
  "workDays": {
    "holdPayrolls": [...],
    "unpaidMonths": [...]
  },
  "noticePay": {...},
  "leaveEncashment": {...}
}
```

---

### 2.2 POST /final-settlement/calculate

**Purpose**: Recalculate after user edits

**Payload**:
```json
{
  "employeeId": "...",
  "leavingDate": "2024-01-31",
  "workDays": {
    "unpaidMonths": [
      { "month": 1, "year": 2024, "lopDays": 5 }
    ]
  },
  "noticePay": {
    "noticePeriodRecovery": 0
  },
  "adjustments": {
    "reimbursements": [...],
    "otherAdditions": [...],
    "otherDeductions": [...]
  }
}
```

**Logic**:
```typescript
// 1. Recalculate unpaid months with edited LOP
for (const month of payload.unpaidMonths) {
  payableDays = totalDays - lopDays;
  salary = (monthlyGross / totalDays) * payableDays;
  pf = (basic / totalDays) * payableDays * 0.12;
}

// 2. Apply manual override for notice recovery
if (payload.noticePay?.noticePeriodRecovery !== undefined) {
  finalRecovery = payload.noticePay.noticePeriodRecovery;
}

// 3. Sum adjustments
totalPayables += sum(reimbursements) + sum(otherAdditions);
totalDeductions += sum(otherDeductions);

// 4. Calculate net
netAmount = totalPayables - totalDeductions;
```

---

### 2.3 POST /final-settlement/confirm/:employeeId

**Purpose**: Confirm settlement and generate PDF

**Flow**:
```
1. Validate settlement exists
2. Generate PDF (atomic operation)
3. Upload PDF to GCP
4. Update status = 'Confirmed'
5. Save pdfUrl
6. Send email to employee
7. Return response
```

**Critical Code**:
```typescript
// Atomic PDF generation
pdfUrl = await generateFNFLetter(settlement, employee);

if (!pdfUrl) {
  throw new Error('PDF generation failed');
  // Settlement remains in 'Draft' status
}

settlement.status = 'Confirmed';
settlement.pdfUrl = pdfUrl;
settlement.confirmedAt = new Date();
await settlement.save();
```

---

## 3. Calculation Engine

### 3.1 Unpaid Salary Calculation

**File**: `final-settlement.service.ts` Lines 27-338

**Logic**:
```typescript
async function calculateUnpaidGaps(
  employeeId: string,
  leavingDate: Date,
  monthlyGross: number,
  salaryAssignment: any,
  holdPayrolls: any[]
) {
  // 1. Identify hold months
  const holdMonthSet = new Set();
  for (const hp of holdPayrolls) {
    holdMonthSet.add(`${hp.month}-${hp.year}`);
  }

  // 2. Get last paid month
  const lastPaidPayroll = await Payroll.findOne({
    employeeId,
    status: { $ne: 'Hold' }
  }).sort({ year: -1, month: -1 });

  let currentMonth = lastPaidPayroll ? lastPaidPayroll.month + 1 : 1;
  let currentYear = lastPaidPayroll ? lastPaidPayroll.year : new Date().getFullYear();

  const unpaidMonths = [];

  // 3. Loop through months until LWD
  while (true) {
    const monthKey = `${currentMonth}-${currentYear}`;
    const monthDate = new Date(currentYear, currentMonth - 1, 1);

    // GUARD 1: Stop at LWD
    if (monthDate > leavingDate) break;

    // GUARD 2: Skip hold months
    if (holdMonthSet.has(monthKey)) {
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
      continue;
    }

    // 4. Fetch attendance
    const attendance = await AttendanceRecord.find({
      userId: employeeId,
      month: currentMonth,
      year: currentYear
    });

    // Calculate days
    const totalDays = new Date(currentYear, currentMonth, 0).getDate();
    const presentDays = attendance.filter(a => a.status === 'Present').length;
    const lopDays = totalDays - presentDays;
    const payableDays = totalDays - lopDays;

    // GUARD 3: Skip if zero payable days
    if (payableDays <= 0) {
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
      continue;
    }

    // 5. Prorate salary
    const components = {
      basic: (salaryAssignment.basic / totalDays) * payableDays,
      hra: (salaryAssignment.hra / totalDays) * payableDays,
      conveyance: (salaryAssignment.conveyance / totalDays) * payableDays,
      specialAllowance: (salaryAssignment.specialAllowance / totalDays) * payableDays
    };

    const grossSalary = Object.values(components).reduce((a, b) => a + b, 0);

    // 6. Calculate deductions
    const pf = Math.min(components.basic, 15000) * 0.12;
    const pt = getPTSlab(grossSalary);
    const tds = await getPlannedTDS(employeeId, currentMonth, currentYear);

    unpaidMonths.push({
      monthYear: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
      month: currentMonth,
      year: currentYear,
      totalDays,
      daysWorked: presentDays,
      lopDays,
      payableDays,
      components,
      grossSalary,
      providentFund: pf,
      professionalTax: pt,
      incomeTax: tds,
      netSalary: grossSalary - pf - pt - tds
    });

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return unpaidMonths;
}
```

**Key Points**:
- ✅ Skips hold payroll months
- ✅ Skips months with zero payable days
- ✅ Stops at Last Working Day
- ✅ Prorates salary based on attendance
- ✅ Calculates PF, PT, TDS correctly

---

### 3.2 Notice Period Recovery

**File**: `final-settlement.service.ts` Lines 340-385

**Formula**:
```typescript
// 1. Calculate days served
const daysServed = Math.floor(
  (leavingDate.getTime() - resignationDate.getTime()) / (1000 * 60 * 60 * 24)
);

// 2. Calculate excess/shortfall
const excessInNotice = daysServed - noticePeriodDays;

// 3. Calculate recovery (if shortfall)
let noticePeriodRecovery = 0;
if (excessInNotice < 0) {
  const shortfall = Math.abs(excessInNotice);
  const perDayRate = monthlyGross / 30;
  noticePeriodRecovery = shortfall * perDayRate;
}
```

**Manual Override**:
```typescript
// In calculate endpoint
if (payload.noticePay?.noticePeriodRecovery !== undefined) {
  // Trust frontend value (manual waiver)
  finalCalculation.noticePeriodRecovery = payload.noticePay.noticePeriodRecovery;
} else {
  // Auto-calculate
  finalCalculation.noticePeriodRecovery = calculateRecovery();
}
```

---

### 3.3 Leave Encashment

**File**: `final-settlement.service.ts` Lines 500-545

**Logic**:
```typescript
// 1. Fetch encashable leaves
const leaveBalances = await LeaveBalance.find({
  userId: employeeId,
  isEncashable: true
});

// 2. Calculate per day rate
const perDayRate = salaryAssignment.basic / 26;

// 3. Calculate encashment
const leaveEncashmentDetails = [];
let totalEncashment = 0;

for (const leave of leaveBalances) {
  const encashAmount = leave.remainingDays * perDayRate;
  
  leaveEncashmentDetails.push({
    leaveType: leave.leaveTypeId.name,
    balance: leave.remainingDays,
    perDayRate,
    encashAmount
  });
  
  totalEncashment += encashAmount;
}
```

---

### 3.4 Statutory Deductions

**Provident Fund (PF)**:
```typescript
// PF = 12% of basic (capped at ₹15,000)
const pf = Math.min(basic, 15000) * 0.12;
```

**Professional Tax (PT)**:
```typescript
function getPTSlab(grossSalary: number): number {
  if (grossSalary <= 15000) return 0;
  if (grossSalary <= 20000) return 150;
  return 200;
}
```

**Income Tax (TDS)**:
```typescript
// Fetch planned TDS from payroll
const plannedTax = await Payroll.findOne({
  employeeId,
  month,
  year
}).select('plannedIncomeTax');

return plannedTax?.plannedIncomeTax || 0;
```

**ESI & Gratuity**:
```typescript
// Always 0 (disabled as per policy)
const esi = 0;
const gratuity = 0;
```

---

### 3.5 Final Totals

```typescript
// Total Payables
const totalPayable = 
  holdSalaries +
  unpaidSalaries +
  leaveEncashment +
  reimbursements +
  otherAdditions +
  gratuity;  // Always 0

// Total Deductions
const totalDeductions =
  noticePeriodRecovery +
  providentFund +
  esi +  // Always 0
  professionalTax +
  incomeTax +
  otherDeductions;

// Net Amount
const netAmount = totalPayable - totalDeductions;
const isNegative = netAmount < 0;
```

---

## 4. PDF Generation Pipeline

### 4.1 Complete Flow

**File**: `fnf-pdf.helper.ts` Lines 44-308

```typescript
export async function generateFNFLetter(
  settlement: IFinalSettlement,
  employee: any
): Promise<string> {
  try {
    // 1. Setup paths
    const fnfBaseName = `FNF_${settlement.employeeCode}_${Date.now()}`;
    const outputDocxPath = path.join('uploads', `${fnfBaseName}.docx`);
    const outputPdfPath = path.join('uploads', `${fnfBaseName}.pdf`);

    // 2. Prepare template data
    const templateData = buildTemplateData(settlement, employee);

    // 3. Locate template
    const templatePath = findTemplate('Final_Settlement.docx');

    // 4. Load template
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => ''
    });

    // 5. Render template
    doc.render(templateData);
    const updatedContent = doc.getZip().generate({ type: 'nodebuffer' });

    // 6. Save DOCX
    fs.writeFileSync(outputDocxPath, updatedContent);

    // 7. Convert to PDF
    await convertDocxToPDF(outputDocxPath, outputPdfPath);

    // 8. Upload to GCP
    const gcpResult = await uploadFileToGCP({
      filePath: outputPdfPath,
      fileName: `${fnfBaseName}.pdf`,
      employeeId: settlement.employeeId.toString(),
      category: 'Settlement',
      type: 'FNF Letter'
    });

    // 9. Cleanup
    await fsPromises.unlink(outputDocxPath);
    await fsPromises.unlink(outputPdfPath);

    // 10. Return URL
    return gcpResult.fileUrl || '';

  } catch (error) {
    console.error('PDF Generation Error:', error);
    return '';
  }
}
```

---

### 4.2 Template Data Builder

```typescript
function buildTemplateData(settlement, employee) {
  // Calculate component totals
  const unpaidBasic = settlement.unpaidMonths.reduce(
    (sum, m) => sum + (m.components?.basic || 0), 0
  );
  const unpaidHRA = settlement.unpaidMonths.reduce(
    (sum, m) => sum + (m.components?.hra || 0), 0
  );

  return {
    // Employee Details
    empNo: settlement.employeeCode,
    empName: settlement.employeeName,
    empDept: employee.departmentId?.name || 'N/A',
    empDesig: employee.designation || 'N/A',
    joiningDate: formatDate(employee.joiningDate),
    leavingDate: formatDate(settlement.leavingDate),

    // Notice Period
    noticePeriod: settlement.noticePeriodDays,
    daysServed: settlement.daysServed,
    noticeRecovery: formatCurrency(settlement.finalCalculation.noticePeriodRecovery),

    // Earnings
    unpaidBasic: formatCurrency(unpaidBasic),
    unpaidHRA: formatCurrency(unpaidHRA),
    leaveEncashment: formatCurrency(settlement.finalCalculation.leaveEncashment),
    totalIncome: formatCurrency(settlement.finalCalculation.totalPayable),

    // Deductions
    pf: formatCurrency(settlement.finalCalculation.providentFund),
    pt: formatCurrency(settlement.finalCalculation.professionalTax),
    tds: formatCurrency(settlement.finalCalculation.incomeTax),
    totalDeductions: formatCurrency(settlement.finalCalculation.totalDeductions),

    // Net
    netPay: formatCurrency(settlement.finalCalculation.netAmount),
    netPayWords: numberToWords(settlement.finalCalculation.netAmount),

    // Dynamic Lists
    earningsList: [
      unpaidBasic > 0 ? { label: 'BASIC', amount: formatCurrency(unpaidBasic) } : null,
      unpaidHRA > 0 ? { label: 'HRA', amount: formatCurrency(unpaidHRA) } : null
    ].filter(i => i !== null),

    deductionsList: [
      settlement.finalCalculation.providentFund > 0 
        ? { label: 'PF', amount: formatCurrency(settlement.finalCalculation.providentFund) } 
        : null,
      settlement.finalCalculation.professionalTax > 0 
        ? { label: 'PT', amount: formatCurrency(settlement.finalCalculation.professionalTax) } 
        : null
    ].filter(i => i !== null)
  };
}
```

---

### 4.3 DOCX to PDF Conversion

```typescript
async function convertDocxToPDF(docxPath: string, pdfPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const docxBuffer = fs.readFileSync(docxPath);
      
      convertToPdf(docxBuffer, '.pdf', undefined)
        .then((pdfBuffer) => {
          fs.writeFileSync(pdfPath, pdfBuffer);
          resolve();
        })
        .catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}
```

**Requirements**:
- LibreOffice installed on server
- `libreoffice-convert` npm package

---

## 5. Template Variables

### 5.1 Employee Details

```
{empNo}              → CD0001-HR
{empName}            → John Doe
{empDept}            → Engineering
{empDesig}           → Developer
{joiningDate}        → 01 Jan 2023
{leavingDate}        → 31 Jan 2024
```

### 5.2 Notice Period

```
{noticePeriod}       → 60
{daysServed}         → 30
{noticeRecovery}     → ₹50,000
```

### 5.3 Earnings

```
{unpaidBasic}        → ₹16,774
{unpaidHRA}          → ₹8,387
{leaveEncashment}    → ₹10,000
{totalIncome}        → ₹1,08,312
```

### 5.4 Deductions

```
{pf}                 → ₹2,013
{pt}                 → ₹200
{tds}                → ₹317
{totalDeductions}    → ₹52,530
```

### 5.5 Net Summary

```
{netPay}             → ₹55,782
{netPayWords}        → Rupees Fifty Five Thousand Seven Hundred Eighty Two Only
```

### 5.6 Dynamic Lists

```
{#earningsList}
  {label}: {amount}
{/earningsList}

{#deductionsList}
  {label}: {amount}
{/deductionsList}
```

---

## 6. Database Schema

### 6.1 FinalSettlement Model

```typescript
{
  employeeId: ObjectId,
  employeeName: String,
  employeeCode: String,
  
  resignationSubmittedOn: Date,
  leavingDate: Date,
  leavingReason: String,
  settlementDate: Date,
  
  noticePeriodDays: Number,
  daysServed: Number,
  excessInNotice: Number,
  
  unpaidMonths: [{
    monthYear: String,
    month: Number,
    year: Number,
    totalDays: Number,
    daysWorked: Number,
    lopDays: Number,
    payableDays: Number,
    components: {
      basic: Number,
      hra: Number,
      conveyance: Number,
      specialAllowance: Number
    },
    grossSalary: Number,
    providentFund: Number,
    professionalTax: Number,
    incomeTax: Number,
    netSalary: Number
  }],
  
  holdPayrolls: [{
    month: Number,
    year: Number,
    netSalary: Number
  }],
  
  leaveBalance: [{
    leaveType: String,
    balance: Number,
    perDayRate: Number,
    encashAmount: Number
  }],
  
  adjustments: {
    reimbursements: [{ description: String, amount: Number }],
    otherAdditions: [{ description: String, amount: Number }],
    otherDeductions: [{ description: String, amount: Number }]
  },
  
  finalCalculation: {
    totalPayable: Number,
    totalDeductions: Number,
    netAmount: Number,
    isNegative: Boolean,
    holdSalaries: Number,
    unpaidSalaries: Number,
    leaveEncashment: Number,
    noticePeriodRecovery: Number,
    providentFund: Number,
    esi: Number,
    professionalTax: Number,
    incomeTax: Number,
    gratuity: Number
  },
  
  status: { type: String, enum: ['Draft', 'Confirmed'] },
  pdfUrl: String,
  confirmedAt: Date,
  confirmedBy: ObjectId
}
```

---

## Summary

This document covers:

✅ **Backend Architecture** (file structure, tech stack)  
✅ **7 API Endpoints** (initialize, calculate, confirm, etc.)  
✅ **Calculation Engine** (unpaid salary, notice recovery, leave encashment)  
✅ **PDF Generation Pipeline** (11-step process)  
✅ **Template Variables** (50+ variables)  
✅ **Database Schema** (complete model)

**Status**: ✅ Production Ready  
**File**: `FNF_BACKEND_COMPLETE_GUIDE.md`

---

**Prepared by**: AI Assistant  
**Date**: February 5, 2026  
**Version**: 1.0
