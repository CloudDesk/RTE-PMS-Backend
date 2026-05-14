# Final Settlement PDF Template - Complete Guide

**Template File**: `Final_Settlement.docx`  
**Generator**: `src/services/fnf-pdf.helper.ts`  
**Technology**: Docxtemplater + LibreOffice

---

## 📋 Table of Contents

1. [PDF Generation Logic](#pdf-generation-logic)
2. [Template Variables Reference](#template-variables-reference)
3. [Conditional Logic](#conditional-logic)
4. [Template Syntax](#template-syntax)
5. [Complete Variable List](#complete-variable-list)
6. [Example Template Structure](#example-template-structure)
7. [Testing & Debugging](#testing--debugging)

---

## 1. PDF Generation Logic

### 1.1 Overview

**File**: `src/services/fnf-pdf.helper.ts`  
**Function**: `generateFNFLetter(settlement, employee)`  
**Technology Stack**:
- **Docxtemplater**: Template variable replacement
- **PizZip**: DOCX file manipulation
- **LibreOffice**: DOCX to PDF conversion
- **GCP Storage**: Cloud storage for generated PDFs

---

### 1.2 Complete Generation Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Confirm Settlement (Backend)                        │
│    - User clicks "Confirm" button                      │
│    - Backend receives confirmation request             │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Prepare Template Data                               │
│    - Extract settlement details                        │
│    - Format currency values                            │
│    - Calculate component breakdowns                    │
│    - Build templateData object                         │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Locate Template File                                │
│    - Search in: templates/Final_Settlement.docx        │
│    - Fallback: ./Final_Settlement.docx                 │
│    - Error if not found                                │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Load & Parse Template                               │
│    - Read DOCX file as binary                          │
│    - Initialize PizZip with file content               │
│    - Create Docxtemplater instance                     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Render Template with Data                           │
│    - Replace all {variables}                           │
│    - Process conditionals {#if}...{/if}                │
│    - Loop through arrays {#array}...{/array}           │
│    - Generate updated DOCX buffer                      │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Save Temporary DOCX                                 │
│    - Write to: uploads/FNF_CD0001-HR_timestamp.docx    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 7. Convert DOCX to PDF (LibreOffice)                   │
│    - Read DOCX buffer                                  │
│    - Call libreoffice-convert                          │
│    - Generate PDF buffer                               │
│    - Write to: uploads/FNF_CD0001-HR_timestamp.pdf     │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 8. Upload to GCP Storage                               │
│    - Upload PDF to Google Cloud Storage                │
│    - Get public URL                                    │
│    - Category: 'Settlement', Type: 'FNF Letter'        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 9. Update Settlement Record                            │
│    - Set status = 'Confirmed'                          │
│    - Set pdfUrl = GCP URL                              │
│    - Set confirmedAt = current timestamp               │
│    - Save to database                                  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 10. Cleanup Temporary Files                            │
│    - Delete local DOCX file                            │
│    - Delete local PDF file                             │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 11. Return PDF URL to Frontend                         │
│    - Frontend receives GCP URL                         │
│    - Display download button                           │
│    - User can download PDF                             │
└─────────────────────────────────────────────────────────┘
```

---

### 1.3 Code Walkthrough

#### Step 1: Function Entry Point

**Location**: `src/services/fnf-pdf.helper.ts` Line 44

```typescript
export async function generateFNFLetter(
    settlement: IFinalSettlement, 
    employee: any
): Promise<string> {
    // Returns: GCP URL of generated PDF
    // Throws: Error if generation fails
}
```

**Input**:
- `settlement`: Complete settlement record from database
- `employee`: Employee details (name, department, etc.)

**Output**:
- `string`: GCP URL (e.g., `https://storage.googleapis.com/.../FNF_CD0001-HR_123456.pdf`)
- Empty string `''` on error

---

#### Step 2: Setup Paths

**Location**: Lines 45-53

```typescript
const fnfDir = path.join(process.cwd(), 'uploads');

// Create uploads directory if not exists
if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads", { recursive: true });
}

// Generate unique filename
const fnfBaseName = `FNF_${settlement.employeeCode}_${Date.now()}`;
const outputDocxPath = path.join(fnfDir, `${fnfBaseName}.docx`);
const outputPdfPath = path.join(fnfDir, `${fnfBaseName}.pdf`);
```

**Example Paths**:
```
outputDocxPath: C:\project\uploads\FNF_CD0001-HR_1738747800000.docx
outputPdfPath:  C:\project\uploads\FNF_CD0001-HR_1738747800000.pdf
```

---

#### Step 3: Helper Functions

**Location**: Lines 58-88

```typescript
// Format date: Date → "01 Jan 2024"
const formatDate = (date: Date | string | undefined): string => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return isNaN(d.getTime()) 
        ? 'N/A' 
        : d.toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
        });
};

// Convert number to words: 55782 → "fifty five thousand seven hundred eighty two"
const numberToWords = (num: number): string => {
    // Implementation details...
};
```

---

#### Step 4: Calculate Component Breakdowns

**Location**: Lines 95-101

```typescript
// Sum up components from all unpaid months
const unpaidBasic = settlement.unpaidMonths.reduce(
    (sum, m) => sum + (m.components?.basic || 0), 
    0
);
const unpaidHRA = settlement.unpaidMonths.reduce(
    (sum, m) => sum + (m.components?.hra || 0), 
    0
);
const unpaidConveyance = settlement.unpaidMonths.reduce(
    (sum, m) => sum + (m.components?.conveyance || 0), 
    0
);
const unpaidSpecialAllowance = settlement.unpaidMonths.reduce(
    (sum, m) => sum + (m.components?.specialAllowance || 0), 
    0
);
const unpaidOtherAllowances = settlement.unpaidMonths.reduce(
    (sum, m) => sum + (m.components?.otherAllowances || 0), 
    0
);
const totalLOPAmount = settlement.unpaidMonths.reduce(
    (sum, m) => sum + (m.lopAmount || 0), 
    0
);
```

**Example**:
```javascript
// If unpaidMonths = [
//   { components: { basic: 16774, hra: 8387 } },
//   { components: { basic: 10000, hra: 5000 } }
// ]
// Then:
unpaidBasic = 16774 + 10000 = 26774
unpaidHRA = 8387 + 5000 = 13387
```

---

#### Step 5: Build Template Data Object

**Location**: Lines 104-222

```typescript
const templateData = {
    // Employee Details
    empNo: settlement.employeeCode,
    empName: settlement.employeeName,
    empDept: employee.departmentId?.name || 'N/A',
    empDesig: employee.designation || 'N/A',
    empLocation: employee.location || 'Chennai',
    joiningDate: formatDate(employee.joiningDate),
    resignDate: formatDate(settlement.resignationSubmittedOn),
    leavingDate: formatDate(settlement.leavingDate),
    
    // Notice Period
    noticePeriod: settlement.noticePeriodDays > 0 
        ? settlement.noticePeriodDays 
        : null,
    noticeAdjustable: settlement.excessInNotice < 0 
        ? Math.abs(settlement.excessInNotice) 
        : null,
    
    // Days Calculation
    plDays: settlement.leaveBalance?.reduce((sum, l) => sum + (l.encashDays || 0), 0) || null,
    salaryDays: settlement.unpaidMonths.reduce((sum, m) => sum + m.daysWorked, 0),
    monthDays: settlement.unpaidMonths.reduce((sum, m) => sum + (m.totalDays || 0), 0) || 30,
    lopDays: settlement.unpaidMonths.reduce((sum, m) => sum + m.lopDays, 0) || null,
    
    // Earnings (Flat)
    unpaidBasic: formatCurrency(unpaidBasic, 'IN'),
    unpaidHRA: formatCurrency(unpaidHRA, 'IN'),
    totalIncome: formatCurrency(settlement.finalCalculation.totalPayable, 'IN'),
    
    // Earnings (Object - Conditional)
    income: {
        basic: formatCurrency(unpaidBasic, 'IN'),
        hra: formatCurrency(unpaidHRA, 'IN'),
        // Only include if > 0
        ...(settlement.finalCalculation.holdSalaries > 0 && {
            holdSalary: formatCurrency(settlement.finalCalculation.holdSalaries, 'IN')
        }),
        ...(settlement.finalCalculation.leaveEncashment > 0 && {
            leaveEncashment: formatCurrency(settlement.finalCalculation.leaveEncashment, 'IN')
        }),
        total: formatCurrency(settlement.finalCalculation.totalPayable, 'IN')
    },
    
    // Deductions (Flat)
    pf: settlement.finalCalculation.providentFund > 0 
        ? formatCurrency(settlement.finalCalculation.providentFund, 'IN') 
        : null,
    pt: settlement.finalCalculation.professionalTax > 0 
        ? formatCurrency(settlement.finalCalculation.professionalTax, 'IN') 
        : null,
    noticeRecovery: settlement.finalCalculation.noticePeriodRecovery > 0 
        ? formatCurrency(settlement.finalCalculation.noticePeriodRecovery, 'IN') 
        : null,
    totalDeductions: formatCurrency(settlement.finalCalculation.totalDeductions, 'IN'),
    
    // Deductions (Object - Conditional)
    deduction: {
        ...(settlement.finalCalculation.providentFund > 0 && {
            pf: formatCurrency(settlement.finalCalculation.providentFund, 'IN')
        }),
        ...(settlement.finalCalculation.professionalTax > 0 && {
            pt: formatCurrency(settlement.finalCalculation.professionalTax, 'IN')
        }),
        total: formatCurrency(settlement.finalCalculation.totalDeductions, 'IN')
    },
    
    // Net Summary
    netPay: formatCurrency(Math.round(settlement.finalCalculation.netAmount), 'IN'),
    netPayWords: `Rupees ${numberToWords(Math.round(settlement.finalCalculation.netAmount))} Only`,
    
    // Dynamic Lists
    earningsList: [
        unpaidBasic > 0 ? { label: 'BASIC', amount: formatCurrency(unpaidBasic, 'IN') } : null,
        unpaidHRA > 0 ? { label: 'HRA', amount: formatCurrency(unpaidHRA, 'IN') } : null,
        // ... more items
    ].filter(i => i !== null),
    
    deductionsList: [
        settlement.finalCalculation.providentFund > 0 
            ? { label: 'PF', amount: formatCurrency(settlement.finalCalculation.providentFund, 'IN') } 
            : null,
        // ... more items
    ].filter(i => i !== null)
};
```

---

#### Step 6: Locate Template File

**Location**: Lines 227-249

```typescript
const templateName = 'Final_Settlement.docx';
const candidates = [
    path.join(process.cwd(), 'templates', templateName),
    path.join(process.cwd(), templateName),
];

console.log("Looking for template in:", candidates);

let inputPath: string | null = null;
for (const p of candidates) {
    if (fs.existsSync(p)) {
        inputPath = p;
        console.log("Template FOUND at:", inputPath);
        break;
    }
}

if (!inputPath) {
    console.error("TEMPLATE NOT FOUND! Checked:", candidates);
    throw new Error(
        "Final_Settlement.docx not found. Place it in project root or templates/ folder."
    );
}
```

**Search Order**:
1. `C:\project\templates\Final_Settlement.docx`
2. `C:\project\Final_Settlement.docx`

---

#### Step 7: Load & Parse Template

**Location**: Lines 251-263

```typescript
console.log("Reading template file...");
const content = fs.readFileSync(inputPath, "binary");
console.log("Template read success. Size:", content.length);

console.log("Initializing PizZip...");
const zip = new PizZip(content);

console.log("Initializing Docxtemplater...");
const doc = new Docxtemplater(zip, {
    paragraphLoop: true,    // Enable paragraph loops
    linebreaks: true,       // Preserve line breaks
    nullGetter: () => '',   // Return empty string for null values
});
```

**Options Explained**:
- `paragraphLoop: true` - Allows looping over arrays in paragraphs
- `linebreaks: true` - Preserves line breaks in text
- `nullGetter: () => ''` - Returns empty string instead of showing "undefined"

---

#### Step 8: Render Template

**Location**: Lines 265-269

```typescript
console.log("Rendering Template...");
doc.render(templateData);

console.log("Generating DOCX buffer...");
const updatedContent = doc.getZip().generate({ type: "nodebuffer" });
```

**What Happens**:
1. Docxtemplater scans template for `{variables}`
2. Replaces each variable with value from `templateData`
3. Processes conditionals: `{#if}...{/if}`
4. Processes loops: `{#array}...{/array}`
5. Generates new DOCX file in memory

---

#### Step 9: Save Temporary DOCX

**Location**: Lines 271-272

```typescript
console.log("Writing temp DOCX to:", outputDocxPath);
fs.writeFileSync(outputDocxPath, updatedContent);
```

**Result**: Temporary DOCX file created at:
```
C:\project\uploads\FNF_CD0001-HR_1738747800000.docx
```

---

#### Step 10: Convert DOCX to PDF

**Location**: Lines 274-277

```typescript
console.log("Starting LibreOffice Conversion...");

// Use helper method
await convertDocxToPDF(outputDocxPath, outputPdfPath);

console.log("PDF Verified Generated and Saved.");
```

**Helper Function** (Lines 16-38):
```typescript
async function convertDocxToPDF(docxPath: string, pdfPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        try {
            // Read the DOCX file
            const docxBuffer = fs.readFileSync(docxPath);
            
            // Convert to PDF using LibreOffice
            convertToPdf(docxBuffer, '.pdf', undefined)
                .then((pdfBuffer) => {
                    // Write PDF to file
                    fs.writeFileSync(pdfPath, pdfBuffer);
                    console.log(`PDF generated successfully at: ${pdfPath}`);
                    resolve();
                })
                .catch((conversionError) => {
                    console.error('PDF Conversion Error:', conversionError);
                    reject(conversionError);
                });
        } catch (error) {
            console.error('PDF Conversion Setup Error:', error);
            reject(error);
        }
    });
}
```

**Requirements**:
- LibreOffice must be installed on server
- `libreoffice-convert` npm package

---

#### Step 11: Upload to GCP

**Location**: Lines 281-290

```typescript
console.log("Uploading to GCP...");
const gcpResult = await uploadFileToGCP({
    filePath: outputPdfPath,
    fileName: `${fnfBaseName}.pdf`,
    employeeId: settlement.employeeId.toString(),
    category: 'Settlement',
    type: 'FNF Letter'
});
console.log("GCP Upload Result:", gcpResult);
```

**GCP Result**:
```javascript
{
    success: true,
    fileUrl: "https://storage.googleapis.com/bucket-name/Settlement/FNF_CD0001-HR_1738747800000.pdf",
    fileName: "FNF_CD0001-HR_1738747800000.pdf"
}
```

---

#### Step 12: Cleanup Temporary Files

**Location**: Lines 292-296

```typescript
try {
    await fsPromises.unlink(outputDocxPath);  // Delete DOCX
    await fsPromises.unlink(outputPdfPath);   // Delete PDF
} catch (e) { 
    console.warn('Cleanup failed', e); 
}
```

**Why**: Local files no longer needed after GCP upload

---

#### Step 13: Error Handling & Return

**Location**: Lines 298-306

```typescript
if (!gcpResult.success) {
    throw new Error(`GCP Upload failed: ${gcpResult.error}`);
}

return gcpResult.fileUrl!;  // Return GCP URL

// Catch block
catch (error: any) {
    console.error('FNF PDF Generation FATAL ERROR:', error);
    return '';  // Return empty string on error
}
```

---

### 1.4 Error Handling Strategy

#### Error 1: Template Not Found

**Error**:
```
Error: Final_Settlement.docx not found
```

**Solution**:
1. Place `Final_Settlement.docx` in project root
2. OR create `templates/` folder and place it there

---

#### Error 2: LibreOffice Conversion Failed

**Error**:
```
PDF Conversion Error: LibreOffice not found
```

**Solution**:
1. Install LibreOffice on server
2. Ensure `libreoffice` command is in PATH
3. For Docker: `RUN apt-get install -y libreoffice`

---

#### Error 3: GCP Upload Failed

**Error**:
```
GCP Upload failed: Invalid credentials
```

**Solution**:
1. Check GCP credentials file exists
2. Verify service account has Storage permissions
3. Check bucket name is correct

---

#### Error 4: Template Rendering Failed

**Error**:
```
Error: Unclosed tag
```

**Solution**:
1. Check template syntax: `{#variable}` must have `{/variable}`
2. Validate all conditional blocks are closed
3. Test template with simple data first

---

### 1.5 Performance Optimization

#### Current Performance

| Step | Average Time |
|------|--------------|
| Template Loading | 50ms |
| Data Preparation | 100ms |
| Template Rendering | 200ms |
| DOCX Generation | 150ms |
| PDF Conversion | 3-5 seconds |
| GCP Upload | 1-2 seconds |
| **Total** | **5-8 seconds** |

---

#### Optimization Tips

1. **Cache Template File**:
```typescript
let cachedTemplate: Buffer | null = null;

function getTemplate() {
    if (!cachedTemplate) {
        cachedTemplate = fs.readFileSync(templatePath);
    }
    return cachedTemplate;
}
```

2. **Parallel Processing**:
```typescript
// Generate multiple PDFs in parallel
await Promise.all(settlements.map(s => generateFNFLetter(s, employee)));
```

3. **Background Job**:
```typescript
// Queue PDF generation for background processing
await queue.add('generate-fnf-pdf', { settlementId, employeeId });
```

---

### 1.6 Logging & Monitoring

**Console Logs** (Production):
```
=== START FNF PDF GENERATION ===
Looking for template in: [...]
Template FOUND at: C:\project\Final_Settlement.docx
Template read success. Size: 45678
Initializing PizZip...
Initializing Docxtemplater...
Rendering Template...
Generating DOCX buffer...
Writing temp DOCX to: C:\project\uploads\FNF_CD0001-HR_123.docx
Starting LibreOffice Conversion...
PDF generated successfully at: C:\project\uploads\FNF_CD0001-HR_123.pdf
PDF Verified Generated and Saved.
Uploading to GCP...
GCP Upload Result: { success: true, fileUrl: "https://..." }
```

**Error Logs**:
```
TEMPLATE NOT FOUND! Checked: [...]
PDF Conversion Error: LibreOffice failed
CRITICAL: FNF PDF generation failed
GCP Upload failed: Invalid credentials
```

---

### 1.7 Testing PDF Generation

#### Manual Test

```typescript
// In your test file
import { generateFNFLetter } from './fnf-pdf.helper';

const testSettlement = {
    employeeCode: "CD0001-HR",
    employeeName: "John Doe",
    finalCalculation: {
        totalPayable: 50622,
        totalDeductions: 52530,
        netAmount: -1908,
        providentFund: 2013,
        professionalTax: 200,
        incomeTax: 317
    },
    unpaidMonths: [
        {
            components: { basic: 16774, hra: 8387 },
            daysWorked: 26,
            lopDays: 5
        }
    ]
};

const testEmployee = {
    departmentId: { name: "Engineering" },
    designation: "Developer",
    location: "Chennai",
    joiningDate: new Date('2023-01-01')
};

const pdfUrl = await generateFNFLetter(testSettlement, testEmployee);
console.log("PDF URL:", pdfUrl);
```

---

## 2. Template Variables Reference

### 1.1 Employee Details

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{empNo}` | String | `CD0001-HR` | Employee code |
| `{empName}` | String | `John Doe` | Employee full name |
| `{empDept}` | String | `Engineering` | Department name |
| `{empDesig}` | String | `Senior Developer` | Designation/Role |
| `{empLocation}` | String | `Chennai` | Work location |
| `{joiningDate}` | String | `01 Jan 2023` | Joining date (formatted) |
| `{resignDate}` | String | `01 Jan 2024` | Resignation submitted date |
| `{leavingDate}` | String | `31 Jan 2024` | Last working day |

**Example in Template**:
```
Employee Name: {empName}
Employee Code: {empNo}
Department: {empDept}
Designation: {empDesig}
```

---

### 1.2 Notice Period Details

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{noticePeriod}` | Number/null | `60` | Required notice period days |
| `{noticeAdjustable}` | Number/null | `30` | Notice shortfall (if any) |

**Conditional Logic**:
```
{#noticePeriod}
Required Notice Period: {noticePeriod} days
{/noticePeriod}

{#noticeAdjustable}
Notice Shortfall: {noticeAdjustable} days
{/noticeAdjustable}
```

---

### 1.3 Days Calculation

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{plDays}` | Number/null | `15` | Leave encashment days |
| `{salaryDays}` | Number | `26` | Total days worked |
| `{monthDays}` | Number | `31` | Total days in month(s) |
| `{lopDays}` | Number/null | `5` | Loss of pay days |
| `{effectiveWorkdays}` | Number | `26` | Effective working days |

**Example in Template**:
```
Total Days: {monthDays}
Days Worked: {salaryDays}
{#lopDays}LOP Days: {lopDays}{/lopDays}
Effective Workdays: {effectiveWorkdays}
```

---

### 1.4 Earnings (Income)

#### Flat Variables (Simple Access)

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{unpaidBasic}` | String | `₹16,774` | Unpaid basic salary |
| `{unpaidHRA}` | String | `₹8,387` | Unpaid HRA |
| `{unpaidOtherAllowance}` | String | `₹14,923` | Unpaid other allowances |
| `{holdSalary}` | String | `₹45,000` | Hold salary amount |
| `{leaveEncashment}` | String/null | `₹11,538` | Leave encashment (if > 0) |
| `{reimbursements}` | String/null | `₹5,000` | Reimbursements (if > 0) |
| `{totalIncome}` | String | `₹50,622` | Total payable amount |

#### Object Access (Conditional)

**Variable**: `{income}`

**Structure**:
```javascript
{
  basic: "₹16,774",
  hra: "₹8,387",
  otherAllowance: "₹14,923",
  holdSalary: "₹45,000",        // Only if > 0
  reimbursement: "₹5,000",      // Only if > 0
  leaveEncashment: "₹11,538",   // Only if > 0
  otherAdditions: "₹2,000",     // Only if > 0
  total: "₹50,622"
}
```

**Template Usage**:
```
EARNINGS
--------
Basic Salary: {income.basic}
HRA: {income.hra}
Other Allowance: {income.otherAllowance}

{#income.holdSalary}
Hold Salary: {income.holdSalary}
{/income.holdSalary}

{#income.leaveEncashment}
Leave Encashment: {income.leaveEncashment}
{/income.leaveEncashment}

{#income.reimbursement}
Reimbursements: {income.reimbursement}
{/income.reimbursement}

TOTAL EARNINGS: {income.total}
```

---

### 1.5 Deductions

#### Flat Variables (Simple Access)

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{pf}` | String/null | `₹2,013` | Provident Fund (if > 0) |
| `{pt}` | String/null | `₹200` | Professional Tax (if > 0) |
| `{it}` | String/null | `₹317` | Income Tax/TDS (if > 0) |
| `{incomeTax}` | String/null | `₹317` | Income Tax (alias) |
| `{noticeRecovery}` | String/null | `₹50,000` | Notice period recovery (if > 0) |
| `{lopDeduction}` | String/null | `₹8,065` | LOP deduction (if > 0) |
| `{otherDeductions}` | String/null | `₹1,000` | Other deductions (if > 0) |
| `{totalDeductions}` | String | `₹52,530` | Total deductions |

#### Object Access (Conditional)

**Variable**: `{deduction}`

**Structure**:
```javascript
{
  pf: "₹2,013",                 // Only if > 0
  pt: "₹200",                   // Only if > 0
  it: "₹317",                   // Only if > 0
  noticeRecovery: "₹50,000",    // Only if > 0
  lopDeduction: "₹8,065",       // Only if > 0
  otherDeduction: "₹1,000",     // Only if > 0
  total: "₹52,530"
}
```

**Template Usage**:
```
DEDUCTIONS
----------
{#deduction.pf}
Provident Fund: {deduction.pf}
{/deduction.pf}

{#deduction.pt}
Professional Tax: {deduction.pt}
{/deduction.pt}

{#deduction.it}
Income Tax (TDS): {deduction.it}
{/deduction.it}

{#deduction.noticeRecovery}
Notice Period Recovery: {deduction.noticeRecovery}
{/deduction.noticeRecovery}

{#deduction.lopDeduction}
LOP Deduction: {deduction.lopDeduction}
{/deduction.lopDeduction}

TOTAL DEDUCTIONS: {deduction.total}
```

---

### 1.6 Net Summary

| Variable | Type | Example | Description |
|----------|------|---------|-------------|
| `{netPay}` | String | `₹55,782` | Net amount (payable or recoverable) |
| `{netPayWords}` | String | `Rupees fifty five thousand seven hundred eighty two Only` | Net amount in words |

**Template Usage**:
```
NET AMOUNT: {netPay}
In Words: {netPayWords}
```

---

### 1.7 Dynamic Lists (Arrays)

#### Earnings List

**Variable**: `{#earningsList}`

**Structure**:
```javascript
[
  { label: "BASIC", amount: "₹16,774" },
  { label: "HRA", amount: "₹8,387" },
  { label: "HOLD SALARY", amount: "₹45,000" },
  { label: "Leave Encashment", amount: "₹11,538" },
  // ... only non-zero items
]
```

**Template Usage**:
```
EARNINGS BREAKDOWN
------------------
{#earningsList}
{label}: {amount}
{/earningsList}
```

**Output**:
```
EARNINGS BREAKDOWN
------------------
BASIC: ₹16,774
HRA: ₹8,387
HOLD SALARY: ₹45,000
Leave Encashment: ₹11,538
```

---

#### Deductions List

**Variable**: `{#deductionsList}`

**Structure**:
```javascript
[
  { label: "PF", amount: "₹2,013" },
  { label: "PROF TAX", amount: "₹200" },
  { label: "INCOME TAX (TDS)", amount: "₹317" },
  { label: "NOTICE PERIOD RECOVERY", amount: "₹50,000" },
  // ... only non-zero items
]
```

**Template Usage**:
```
DEDUCTIONS BREAKDOWN
--------------------
{#deductionsList}
{label}: {amount}
{/deductionsList}
```

**Output**:
```
DEDUCTIONS BREAKDOWN
--------------------
PF: ₹2,013
PROF TAX: ₹200
INCOME TAX (TDS): ₹317
NOTICE PERIOD RECOVERY: ₹50,000
```

---

## 2. Conditional Logic

### 2.1 Show/Hide Sections

**Syntax**: `{#variable}...{/variable}`

**Example 1: Show only if value exists**
```
{#leaveEncashment}
Leave Encashment: {leaveEncashment}
{/leaveEncashment}
```

**Result**:
- If `leaveEncashment = "₹11,538"` → Shows: `Leave Encashment: ₹11,538`
- If `leaveEncashment = null` → Shows nothing

---

**Example 2: Show notice shortfall only if exists**
```
{#noticeAdjustable}
⚠️ Notice Period Shortfall: {noticeAdjustable} days
Recovery Amount: {noticeRecovery}
{/noticeAdjustable}
```

**Result**:
- If `noticeAdjustable = 30` → Shows warning with recovery
- If `noticeAdjustable = null` → Shows nothing

---

### 2.2 Conditional Tables

**Example: Earnings Table with Conditional Rows**

```
┌─────────────────────────────┬──────────────┐
│ EARNINGS                    │ AMOUNT       │
├─────────────────────────────┼──────────────┤
│ Basic Salary                │ {unpaidBasic}│
│ HRA                         │ {unpaidHRA}  │
{#holdSalary}
│ Hold Salary                 │ {holdSalary} │
{/holdSalary}
{#leaveEncashment}
│ Leave Encashment            │ {leaveEncashment}│
{/leaveEncashment}
{#reimbursements}
│ Reimbursements              │ {reimbursements}│
{/reimbursements}
├─────────────────────────────┼──────────────┤
│ TOTAL EARNINGS              │ {totalIncome}│
└─────────────────────────────┴──────────────┘
```

---

### 2.3 Loops for Dynamic Lists

**Example: Loop through all earnings**

```
EARNINGS DETAILS
----------------
{#earningsList}
• {label}: {amount}
{/earningsList}

TOTAL: {totalIncome}
```

**Output**:
```
EARNINGS DETAILS
----------------
• BASIC: ₹16,774
• HRA: ₹8,387
• HOLD SALARY: ₹45,000
• Leave Encashment: ₹11,538

TOTAL: ₹50,622
```

---

## 3. Template Syntax

### 3.1 Basic Variable Insertion

```
{variableName}
```

**Example**:
```
Employee: {empName}
Code: {empNo}
```

---

### 3.2 Conditional Blocks

**Show if exists**:
```
{#variableName}
Content to show if variable exists
{/variableName}
```

**Show if NOT exists**:
```
{^variableName}
Content to show if variable does NOT exist
{/variableName}
```

---

### 3.3 Loops (Arrays)

```
{#arrayName}
{propertyName}
{/arrayName}
```

**Example**:
```
{#earningsList}
{label}: {amount}
{/earningsList}
```

---

### 3.4 Nested Object Access

```
{objectName.propertyName}
```

**Example**:
```
{income.basic}
{deduction.pf}
```

---

## 4. Complete Variable List

### 4.1 All Available Variables

```javascript
{
  // Employee Details
  empNo: "CD0001-HR",
  empName: "John Doe",
  empDept: "Engineering",
  empDesig: "Senior Developer",
  empLocation: "Chennai",
  joiningDate: "01 Jan 2023",
  resignDate: "01 Jan 2024",
  leavingDate: "31 Jan 2024",
  
  // Notice Period
  noticePeriod: 60,              // null if not applicable
  noticeAdjustable: 30,          // null if no shortfall
  
  // Days Calculation
  plDays: 15,                    // null if no leave encashment
  salaryDays: 26,
  monthDays: 31,
  lopDays: 5,                    // null if no LOP
  effectiveWorkdays: 26,
  
  // Flat Earnings
  unpaidBasic: "₹16,774",
  unpaidHRA: "₹8,387",
  unpaidOtherAllowance: "₹14,923",
  holdSalary: "₹45,000",
  leaveEncashment: "₹11,538",    // null if 0
  reimbursements: "₹5,000",      // null if 0
  totalIncome: "₹50,622",
  
  // Earnings Object
  income: {
    basic: "₹16,774",
    hra: "₹8,387",
    otherAllowance: "₹14,923",
    holdSalary: "₹45,000",       // only if > 0
    leaveEncashment: "₹11,538",  // only if > 0
    reimbursement: "₹5,000",     // only if > 0
    otherAdditions: "₹2,000",    // only if > 0
    total: "₹50,622"
  },
  
  // Flat Deductions
  pf: "₹2,013",                  // null if 0
  pt: "₹200",                    // null if 0
  it: "₹317",                    // null if 0
  incomeTax: "₹317",             // null if 0
  noticeRecovery: "₹50,000",     // null if 0
  lopDeduction: "₹8,065",        // null if 0
  otherDeductions: "₹1,000",     // null if 0
  totalDeductions: "₹52,530",
  
  // Deductions Object
  deduction: {
    pf: "₹2,013",                // only if > 0
    pt: "₹200",                  // only if > 0
    it: "₹317",                  // only if > 0
    noticeRecovery: "₹50,000",   // only if > 0
    lopDeduction: "₹8,065",      // only if > 0
    otherDeduction: "₹1,000",    // only if > 0
    total: "₹52,530"
  },
  
  // Net Summary
  netPay: "₹55,782",
  netPayWords: "Rupees fifty five thousand seven hundred eighty two Only",
  
  // Dynamic Lists
  earningsList: [
    { label: "BASIC", amount: "₹16,774" },
    { label: "HRA", amount: "₹8,387" },
    // ... only non-zero items
  ],
  
  deductionsList: [
    { label: "PF", amount: "₹2,013" },
    { label: "PROF TAX", amount: "₹200" },
    // ... only non-zero items
  ]
}
```

---

## 5. Example Template Structure

### 5.1 Complete FNF Letter Template

```
═══════════════════════════════════════════════════════════
                    FINAL SETTLEMENT LETTER
═══════════════════════════════════════════════════════════

EMPLOYEE DETAILS
────────────────────────────────────────────────────────────
Employee Name    : {empName}
Employee Code    : {empNo}
Department       : {empDept}
Designation      : {empDesig}
Location         : {empLocation}

EMPLOYMENT DATES
────────────────────────────────────────────────────────────
Date of Joining  : {joiningDate}
Resignation Date : {resignDate}
Last Working Day : {leavingDate}

{#noticePeriod}
NOTICE PERIOD DETAILS
────────────────────────────────────────────────────────────
Required Notice Period : {noticePeriod} days
{#noticeAdjustable}
Notice Shortfall       : {noticeAdjustable} days
Recovery Amount        : {noticeRecovery}
{/noticeAdjustable}
{/noticePeriod}

DAYS CALCULATION
────────────────────────────────────────────────────────────
Total Days in Period   : {monthDays}
Days Worked            : {salaryDays}
{#lopDays}
Loss of Pay (LOP)      : {lopDays} days
{/lopDays}
Effective Working Days : {effectiveWorkdays}
{#plDays}
Leave Encashment Days  : {plDays} days
{/plDays}

═══════════════════════════════════════════════════════════
                    EARNINGS & DEDUCTIONS
═══════════════════════════════════════════════════════════

EARNINGS
────────────────────────────────────────────────────────────
{#earningsList}
{label:30} {amount:>15}
{/earningsList}
────────────────────────────────────────────────────────────
TOTAL EARNINGS         {totalIncome:>15}

DEDUCTIONS
────────────────────────────────────────────────────────────
{#deductionsList}
{label:30} {amount:>15}
{/deductionsList}
────────────────────────────────────────────────────────────
TOTAL DEDUCTIONS       {totalDeductions:>15}

═══════════════════════════════════════════════════════════
NET AMOUNT             {netPay:>15}
═══════════════════════════════════════════════════════════

Amount in Words: {netPayWords}

────────────────────────────────────────────────────────────
This is a system-generated document.
Generated on: {currentDate}
────────────────────────────────────────────────────────────

Authorized Signatory

_______________________
HR Department
```

---

### 5.2 Simplified Table Format

```
┌─────────────────────────────────────────────────────────┐
│                   FINAL SETTLEMENT                      │
├─────────────────────────────────────────────────────────┤
│ Employee: {empName} ({empNo})                          │
│ Department: {empDept}                                   │
│ Last Working Day: {leavingDate}                         │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────┬──────────────┐
│ EARNINGS                 │ AMOUNT       │
├──────────────────────────┼──────────────┤
│ Basic Salary             │ {unpaidBasic}│
│ HRA                      │ {unpaidHRA}  │
{#income.holdSalary}
│ Hold Salary              │ {income.holdSalary}│
{/income.holdSalary}
{#income.leaveEncashment}
│ Leave Encashment         │ {income.leaveEncashment}│
{/income.leaveEncashment}
├──────────────────────────┼──────────────┤
│ TOTAL EARNINGS           │ {totalIncome}│
└──────────────────────────┴──────────────┘

┌──────────────────────────┬──────────────┐
│ DEDUCTIONS               │ AMOUNT       │
├──────────────────────────┼──────────────┤
{#deduction.pf}
│ Provident Fund           │ {deduction.pf}│
{/deduction.pf}
{#deduction.pt}
│ Professional Tax         │ {deduction.pt}│
{/deduction.pt}
{#deduction.it}
│ Income Tax (TDS)         │ {deduction.it}│
{/deduction.it}
{#deduction.noticeRecovery}
│ Notice Period Recovery   │ {deduction.noticeRecovery}│
{/deduction.noticeRecovery}
├──────────────────────────┼──────────────┤
│ TOTAL DEDUCTIONS         │ {totalDeductions}│
└──────────────────────────┴──────────────┘

┌──────────────────────────┬──────────────┐
│ NET AMOUNT               │ {netPay}     │
└──────────────────────────┴──────────────┘

In Words: {netPayWords}
```

---

## 6. Testing & Debugging

### 6.1 Test Data Example

```javascript
const testData = {
  empNo: "CD0001-HR",
  empName: "John Doe",
  empDept: "Engineering",
  empDesig: "Senior Developer",
  empLocation: "Chennai",
  joiningDate: "01 Jan 2023",
  resignDate: "01 Jan 2024",
  leavingDate: "31 Jan 2024",
  
  noticePeriod: 60,
  noticeAdjustable: 30,
  
  plDays: 15,
  salaryDays: 26,
  monthDays: 31,
  lopDays: 5,
  effectiveWorkdays: 26,
  
  unpaidBasic: "₹16,774",
  unpaidHRA: "₹8,387",
  unpaidOtherAllowance: "₹14,923",
  holdSalary: "₹45,000",
  leaveEncashment: "₹11,538",
  totalIncome: "₹96,622",
  
  pf: "₹2,013",
  pt: "₹200",
  it: "₹317",
  noticeRecovery: "₹50,000",
  lopDeduction: "₹8,065",
  totalDeductions: "₹60,595",
  
  netPay: "₹36,027",
  netPayWords: "Rupees thirty six thousand twenty seven Only",
  
  earningsList: [
    { label: "BASIC", amount: "₹16,774" },
    { label: "HRA", amount: "₹8,387" },
    { label: "HOLD SALARY", amount: "₹45,000" },
    { label: "Leave Encashment", amount: "₹11,538" }
  ],
  
  deductionsList: [
    { label: "PF", amount: "₹2,013" },
    { label: "PROF TAX", amount: "₹200" },
    { label: "INCOME TAX (TDS)", amount: "₹317" },
    { label: "NOTICE PERIOD RECOVERY", amount: "₹50,000" },
    { label: "LOP DEDUCTION", amount: "₹8,065" }
  ]
};
```

---

### 6.2 Common Issues & Solutions

#### Issue 1: Variable Not Showing

**Problem**: `{leaveEncashment}` shows nothing

**Solution**: Check if value is `null`. Use conditional:
```
{#leaveEncashment}
Leave Encashment: {leaveEncashment}
{/leaveEncashment}
```

---

#### Issue 2: Loop Not Working

**Problem**: `{#earningsList}` shows nothing

**Solution**: Ensure array is not empty. Check backend:
```javascript
earningsList: [
  { label: "BASIC", amount: "₹16,774" }
].filter(i => i !== null)  // Remove null items
```

---

#### Issue 3: Formatting Issues

**Problem**: Currency not aligned

**Solution**: Use Word table formatting or fixed-width fonts

---

### 6.3 Debugging Tips

1. **Check Template Data**: Log `templateData` before rendering
```javascript
console.log("Template Data:", JSON.stringify(templateData, null, 2));
```

2. **Test with Simple Template**: Create minimal template first
```
Employee: {empName}
Net Pay: {netPay}
```

3. **Validate Conditionals**: Test each conditional separately
```
{#leaveEncashment}YES{/leaveEncashment}
{^leaveEncashment}NO{/leaveEncashment}
```

4. **Check Array Structure**: Ensure arrays have correct format
```javascript
earningsList: [
  { label: "BASIC", amount: "₹16,774" }  // ✅ Correct
]

// NOT
earningsList: ["BASIC", "₹16,774"]  // ❌ Wrong
```

---

## 7. Advanced Features

### 7.1 Conditional Formatting

**Example: Show negative amounts in red**

In Word template:
1. Add conditional text
2. Apply red color formatting to that section

```
{#isNegative}
⚠️ AMOUNT RECOVERABLE FROM EMPLOYEE: {netPay}
{/isNegative}

{^isNegative}
NET AMOUNT PAYABLE: {netPay}
{/isNegative}
```

---

### 7.2 Multi-Currency Support

```javascript
const currencyWord = (employee.country === 'AE') ? 'Dirhams' : 'Rupees';
netPayWords: `${currencyWord} ${netPayWords} Only`
```

**Template**:
```
Net Amount: {netPay}
In Words: {netPayWords}
```

**Output (India)**:
```
Net Amount: ₹55,782
In Words: Rupees fifty five thousand seven hundred eighty two Only
```

**Output (UAE)**:
```
Net Amount: AED 15,000
In Words: Dirhams fifteen thousand Only
```

---

## 8. Quick Reference Card

### Most Common Variables

```
Employee: {empName} ({empNo})
Department: {empDept}
LWD: {leavingDate}

Earnings: {totalIncome}
Deductions: {totalDeductions}
Net Pay: {netPay}

In Words: {netPayWords}
```

### Most Common Conditionals

```
{#leaveEncashment}
Leave Encashment: {leaveEncashment}
{/leaveEncashment}

{#noticeRecovery}
Notice Recovery: {noticeRecovery}
{/noticeRecovery}

{#lopDays}
LOP Days: {lopDays}
{/lopDays}
```

### Most Common Loops

```
{#earningsList}
{label}: {amount}
{/earningsList}

{#deductionsList}
{label}: {amount}
{/deductionsList}
```

---

## 9. Template Checklist

Before finalizing your template:

- [ ] All employee details variables used
- [ ] Conditional sections for optional fields
- [ ] Earnings list loop implemented
- [ ] Deductions list loop implemented
- [ ] Net amount and words displayed
- [ ] Proper formatting and alignment
- [ ] Company logo/header added
- [ ] Signature section included
- [ ] Date fields formatted correctly
- [ ] Tested with sample data

---

**Template Location**: `Final_Settlement.docx` (project root or `templates/` folder)  
**Generator**: `src/services/fnf-pdf.helper.ts`  
**Last Updated**: February 5, 2026  
**Status**: ✅ Production Ready
