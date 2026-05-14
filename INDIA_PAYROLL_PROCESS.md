# India Payroll Process - Complete Guide

## Overview

The India Payroll System is designed to handle statutory deductions and payroll calculations specific to Indian labor laws. This document explains the complete payroll process from initiation to payslip generation.

---

## Table of Contents

1. [Payroll Initiation](#1-payroll-initiation)
2. [Gross Salary Calculations](#2-gross-salary-calculations)
3. [Attendance & Pro-Ration](#3-attendance--pro-ration)
4. [India-Specific Deductions](#4-india-specific-deductions)
5. [Net Salary Calculation](#5-net-salary-calculation)
6. [Status Workflow](#6-status-workflow)
7. [Payslip Generation](#7-payslip-generation)
8. [Complete Example](#8-complete-example)

---

## 1. Payroll Initiation

### When is Payroll Initiated?

Payroll is initiated monthly by administrators for the previous month's compensation processing.

### Prerequisites

- Employee must be active in the system
- Employee must have joined before or during the payroll month
- Employee must have an active salary assignment
- Salary structure with statutory deduction details must be configured

### Initiation Process

1. **Select Month & Year**: Administrator selects the payroll period
2. **Filter Employees**: System filters eligible employees based on:
   - Active status
   - Joining date (must be before payroll month)
   - Active salary assignments
3. **Data Collection**: System fetches:
   - Employee details
   - Salary structure
   - Attendance records
   - Approved leaves
   - Overtime records
   - Holiday/weekend calendars

### Payroll Status: **Draft**

At this stage, all calculations are complete but not approved yet.

---

## 2. Gross Salary Calculations

### Components

The gross salary consists of the following components (all calculated as percentages from the Monthly Gross Salary):

#### Basic Salary
- Calculated as a percentage of Monthly Gross (typically 40-50%)
- Formula: `Basic = (basicPercentage / 100) × Monthly Gross`

#### House Rent Allowance (HRA)
- Calculated as a percentage of Monthly Gross (typically 40-50%)
- Formula: `HRA = (hraPercentage / 100) × Monthly Gross`

#### Dearness Allowance (DA)
- Calculated as a percentage of Basic Salary
- Formula: `DA = (daPercentage / 100) × Basic`

#### Other Allowance
- Calculated as a percentage of Monthly Gross
- Formula: `Other Allowance = (otherAllowancePercentage / 100) × Monthly Gross`

#### Travel Allowance
- Calculated as a percentage of Monthly Gross
- Formula: `Travel Allowance = (travelAllowancePercentage / 100) × Monthly Gross`

#### Reimbursement Allowance
- Calculated as a percentage of Monthly Gross
- Formula: `Reimbursement = (reimbursementPercentage / 100) × Monthly Gross`

### Example

Monthly Gross Salary: ₹50,000

```
Basic: 40% = ₹20,000
HRA: 50% = ₹25,000
DA: 5% of Basic = ₹1,000
Other Allowance: 2% = ₹1,000
Travel Allowance: 1% = ₹500
Reimbursement: 2% = ₹1,000

Total Gross = ₹48,500
```

---

## 3. Attendance & Pro-Ration

### Key Metrics

1. **Present Days**: Days employee attended work
2. **Approved Leave Days**: Days with approved leave applications
3. **Holiday Days**: Official holidays in the calendar
4. **Weekend Days**: Non-working weekends
5. **Loss of Pay (LOP) Days**: Absent days without approved leave
6. **Total Days in Month**: Calendar days (28-31)

### Payable Days Calculation

```
Payable Days = Present Days + Weekend Days + Holiday Days + Approved Leave Days
```

### Attendance Adjusted Gross

The salary is pro-rated based on attendance:

```
Attendance Adjusted Gross = (Payable Days / Total Days in Month) × Monthly Gross
```

### Example

- Total Days in Month: 30
- Present Days: 22
- Weekend Days: 4
- Holiday Days: 1
- Approved Leaves: 2
- Payable Days: 22 + 4 + 1 + 2 = 29

```
Attendance Adjusted Gross = (29 / 30) × ₹50,000 = ₹48,333
```

### Loss of Pay (LOP)

```
LOP Days = Total Days in Month - Payable Days
LOP Deduction = (LOP Days / Total Days in Month) × Monthly Gross
```

In the above example:
```
LOP Days = 30 - 29 = 1 day
LOP Deduction = (1 / 30) × ₹50,000 = ₹1,667
```

---

## 4. India-Specific Deductions

India requires statutory deductions as per government regulations.

### 1. Employee Provident Fund (EPF)

**Calculation:**
```
EPF Employee = 12% of (Basic + DA)
EPF Employer = 12% of (Basic + DA)
```

**Maximum Limit:**
- Employee contribution capped at ₹1,500 per month
- If Basic + DA ≥ ₹15,000, then: `EPF Employee = Min(Actual, 1,500)`

**Example:**
```
Basic + DA = ₹20,000
EPF Employee = 12% × ₹20,000 = ₹2,400
EPF Employee (Capped) = ₹1,500
EPF Employer = ₹2,400
```

### 2. Employee State Insurance (ESI)

**Eligibility:** Only if Gross Salary ≤ ₹21,000

**Calculation:**
```
ESI Employee = 0.75% of Gross Salary
ESI Employer = 3.25% of Gross Salary
```

**Example:**
```
Gross Salary = ₹20,000
ESI Employee = 0.75% × ₹20,000 = ₹150
ESI Employer = 3.25% × ₹20,000 = ₹650
```

### 3. Professional Tax (PT)

Professional Tax is state-specific and has different slabs based on:
- **State**: Different states have different rules
- **Salary Slabs**: Based on gross salary
- **Term**: Monthly, Half-yearly, or Yearly

**Common States & Rates:**

**Maharashtra:**
- Gross ≤ ₹5,000: ₹0
- Gross > ₹5,000 and ≤ ₹10,000: ₹150
- Gross > ₹10,000: ₹200

**Term Application:**
- Monthly: Deducted every month
- Half-yearly: Deducted in February and August only
- Yearly: Deducted in April only

**Calculation:**
```
Professional Tax = Lookup Slab based on Gross Salary
```

### 4. Income Tax (TDS)

Income Tax is calculated based on:
- Employee's annual income tax declaration
- Financial year (April to March)
- Tax slabs as per Income Tax Act

**Process:**
1. Employee submits tax declaration annually
2. System calculates monthly deduction based on annual tax liability
3. Tax is distributed across 12 months
4. Monthly deduction is updated in tax declaration record

**Calculation:**
```
Monthly Tax = Annual Tax Liability / 12
```

**Example:**
```
Annual Tax Liability: ₹60,000
Monthly Tax Deduction: ₹60,000 / 12 = ₹5,000
```

### 5. Additional Deduction

Some organizations may have additional deductions (loans, advances, etc.):

```
Additional Deduction = (deductionPercentage / 100) × Attendance Adjusted Gross
```

---

## 5. Net Salary Calculation

### Total Deductions

```
Total Deductions = EPF Employee + Professional Tax + Income Tax + Leave Deductions + Additional Deduction
```

Note: ESI is calculated separately and not included in payroll for India.

### Overtime Pay (if applicable)

```
Overtime Hours = Extra hours worked beyond normal schedule
Overtime Rate = Gross Salary / (Working Days × 8)
Overtime Pay = Overtime Hours × Overtime Rate
```

### Net Salary Formula

```
Net Salary = Attendance Adjusted Gross
           - EPF Employee
           - Professional Tax
           - Income Tax
           - Leave Deductions
           - Additional Deduction
           + Overtime Pay
```

---

## 6. Status Workflow

The payroll status follows this workflow:

### Status Flow

```
Draft → Pending Approval → In Payment → Completed
   ↓                ↓            ↓
Cancelled       Cancelled    Failed → Retry Pending
```

### Status Details

1. **Draft** (Initial)
   - Calculations completed
   - Ready for review
   - Can be cancelled or moved to pending approval

2. **Pending Approval**
   - Waiting for admin approval
   - Can be cancelled or approved for payment
   - Admin reviews the summary before processing

3. **In Payment**
   - Payroll sent to external payment system
   - Bank/branch processing the transfers
   - Can succeed or fail

4. **Completed**
   - Payment successful
   - UTR number recorded
   - Final status, cannot be modified

5. **Failed**
   - Payment failed in external system
   - Failure reason recorded
   - Can be retried or cancelled

6. **Retry Pending**
   - Fixed issues (e.g., bank details updated)
   - Queued for retry
   - Max 3 retry attempts

7. **Cancelled**
   - Payroll explicitly cancelled
   - Cannot be processed further

### Status Transitions

| Current Status | Can Move To |
|----------------|-------------|
| Draft | Pending Approval, Cancelled |
| Pending Approval | In Payment, Cancelled |
| In Payment | Completed, Failed |
| Failed | Completed, Failed |
| Retry Pending | In Payment, Cancelled |
| Completed | (None - Final Status) |
| Cancelled | (None - Final Status) |

---

## 7. Payslip Generation

### Payslip Components

A payslip contains:

1. **Employee Information**
   - Name, Employee ID
   - Designation, Department
   - Location, Joining Date

2. **Pay Period**
   - Month, Year

3. **Attendance Summary**
   - Present Days, LOP Days
   - Effective Days, Total Month Days

4. **Earnings**
   - Basic, HRA, DA
   - Other Allowance, Travel Allowance
   - Reimbursement Allowance
   - **Total Earnings**

5. **Deductions**
   - PF (EPF), Professional Tax
   - Income Tax, LOP Deductions
   - **Total Deductions**

6. **Net Pay**
   - Net Salary (number)
   - Net Salary (in words)

7. **Additional Information**
   - Bank Account Details
   - PAN, PF Number, UAN

### Generation Process

1. **Trigger**: After payroll reaches "Completed" status
2. **Template**: Uses DOCX template (CD_payslip_Dubai Zuno.docx or CD_paySlip.docx)
3. **Data Mapping**: Maps payroll data to template placeholders
4. **PDF Conversion**: Converts DOCX to PDF using LibreOffice
5. **Upload**: Uploads to GCP Cloud Storage
6. **URL Generation**: Provides downloadable URL
7. **Email**: Can be sent to employees via email

---

## 8. Complete Example

### Employee Details

- **Name**: Rajesh Kumar
- **Employee ID**: EM001
- **Monthly Gross**: ₹50,000
- **Country**: IN (India)
- **Month**: March 2025
- **Days in Month**: 31

### Salary Structure

- Basic: 40% of Gross = ₹20,000
- HRA: 50% of Gross = ₹25,000
- DA: 5% of Basic = ₹1,000

### Attendance

- Present Days: 22
- Weekend Days: 6
- Holiday Days: 2
- Approved Leaves: 1
- **Total Payable Days: 31**
- **LOP Days: 0**

### Calculations

#### 1. Attendance Adjusted Gross
```
Payable Days = 31 (all days covered)
Attendance Adjusted Gross = (31 / 31) × ₹50,000 = ₹50,000
```

#### 2. Gross Salary Components

```
Basic = 40% × ₹50,000 = ₹20,000
HRA = 50% × ₹50,000 = ₹25,000
DA = 5% × ₹20,000 = ₹1,000
Travel Allowance = 1% × ₹50,000 = ₹500
Total Gross = ₹20,000 + ₹25,000 + ₹1,000 + ₹500 = ₹46,500
```

#### 3. Deductions

**EPF:**
```
EPF Employee = 12% × (₹20,000 + ₹1,000) = ₹2,520
(Capped at ₹1,500) = ₹1,500
```

**Professional Tax:**
```
Gross = ₹50,000
As per Maharashtra: ₹200 per month
Professional Tax = ₹200
```

**Income Tax:**
```
Annual Tax: ₹60,000
Monthly Tax: ₹60,000 / 12 = ₹5,000
Income Tax = ₹5,000
```

**Leave Deductions:**
```
LOP Days = 0
Leave Deductions = ₹0
```

**Total Deductions:**
```
Total Deductions = ₹1,500 + ₹200 + ₹5,000 = ₹6,700
```

#### 4. Net Salary

```
Net Salary = ₹50,000 - ₹6,700 = ₹43,300
```

#### 5. CTC Calculation

```
CTC = Gross + EPF Employer + ESI Employer + Overtime
CTC = ₹50,000 + ₹2,520 + ₹0 + ₹0 = ₹52,520
```

### Final Payslip

**EARNINGS:**
- Basic: ₹20,000
- HRA: ₹25,000
- DA: ₹1,000
- Travel Allowance: ₹500
- **Total Earnings: ₹46,500**

**DEDUCTIONS:**
- PF (EPF): ₹1,500
- Professional Tax: ₹200
- Income Tax: ₹5,000
- **Total Deductions: ₹6,700**

**NET PAY: ₹43,300**
**(In Words: Forty-Three Thousand Three Hundred Rupees Only)**

---

## Key Differences: India vs UAE

| Aspect | India (IN) | UAE (AE) |
|--------|-----------|----------|
| **Statutory Deductions** | Yes (EPF, ESI, PT, IT) | No |
| **Tax Deductions** | Yes | No |
| **Allowance Structure** | Percentage-based | Fixed amounts |
| **Visa Management** | Not required | Required |
| **Currency** | INR (₹) | AED |
| **CTC Components** | Gross + Employer Contributions | Annualized + Insurance |

---

## Important Notes

1. **Financial Year**: India uses April to March financial year
2. **Tax Declaration**: Must be submitted annually by employees
3. **Professional Tax**: Varies by state and salary slab
4. **ESI**: Only applicable for employees with gross ≤ ₹21,000
5. **EPF**: Capped at ₹1,500 per month for employee contribution
6. **Attendance Impact**: Salary is pro-rated based on actual attendance
7. **Leave Deductions**: Only unapproved absences lead to salary deduction

---

## System Configuration Required

### Salary Structure

Must include:
```json
{
  "fixedEarnings": {
    "basicPercentage": 40,
    "hraPercentage": 50,
    "daPercentage": 5,
    "otherAllowancePercentage": 2,
    "travelAllowancePercentage": 1,
    "reimbursementPercentage": 2
  },
  "statutoryDeductions": {
    "epf": {
      "employeeContribution": 12,
      "employerContribution": 12,
      "maxLimit": 15000
    },
    "esi": {
      "employeeContribution": 0.75,
      "employerContribution": 3.25,
      "applicabilityLimit": 21000
    },
    "professionalTax": {
      "state": "Maharashtra",
      "term": "monthly",
      "slabs": [...]
    }
  }
}
```

### Tax Declaration

Annual submission by employees with:
- Investment declarations
- Tax-saving deductions
- Monthly tax distribution

---

## Conclusion

The India Payroll System automates the complete payroll process ensuring:
- Accurate statutory deductions (EPF, ESI, PT, IT)
- Attendance-based pro-ration
- Compliance with Indian labor laws
- Audit trail and status tracking
- Automated payslip generation
- Email distribution to employees

This system ensures transparency, accuracy, and compliance for all Indian employees in the organization.

---

*Document Version: 1.0*
*Last Updated: January 2025*

