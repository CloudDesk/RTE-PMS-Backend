# Final Settlement (FNF) Module - Full Implementation Guide

## 1. Overview
The Final Settlement (FNF) module handles the comprehensive exit process for employees. It automates the calculation of payable amounts, deductions, and statutory compliance upon an employee's resignation or termination. The system ensures accuracy by integrating attendance, leave, and payroll data, culminating in the generation of a formal settlement letter.

## 2. Technical Architecture

### 2.1 Core Components
*   **Model (`src/models/final-settlement.model.ts`)**: Defines the schema for the settlement lifecycle, storing resignation details, calculated financials, and status tracking.
*   **Service (`src/services/final-settlement.service.ts`)**: Contains the business logic for:
    *   Auto-discovering unpaid periods.
    *   Calculating notice period shortfalls.
    *   Computing leave encashment and statutory deductions.
    *   Generating the PDF and sending emails.
*   **Routes (`src/routes/final-settlement.routes.ts`)**: Exposes REST API endpoints for the frontend wizard.
*   **Middleware**: Standard JWT authentication (`authenticate`).

### 2.2 Data Flow
1.  **Initialization**: Frontend requests initialization -> Service fetches user/payroll data -> Returns auto-filled form.
2.  **Modification**: User edits data (e.g., changes LWD) -> Frontend calls `calculate` -> Service re-computes totals dynamically.
3.  **Confirmation**: User confirms -> Service locks record -> Generates PDF -> Updates User profile -> Sends Email.

## 3. Detailed Calculation Logic

The module uses the following precise formulas to compute settlement amounts.

### 3.1 Unpaid Salary (Pro-rata Calculation)
Calculated for each month between the Last Paid Month and the Last Working Day (LWD).

**A. Payable Days Calculation**
For any given month:
```math
TotalDays = Days in the specific month (e.g., 28, 30, 31)
PayableDays = Min(TotalDays, PresentDays + WeekendDays + HolidayDays + ApprovedLeaveDays)
LOPDays = Max(0, TotalDays - PayableDays)
```
*Note: `ApprovedLeaveDays` includes annual/casual leaves but excludes leaves marked as 'LOP' (Loss of Pay).*

**B. Gross Salary Proration**
```math
MonthlySalary = (MonthlyGross / TotalDays) * PayableDays
```

**C. Component Proration**
Each salary component (Basic, HRA, etc.) is prorated individually to ensure accurate tax handling:
```math
ProratedComponent = (FullComponentValue / TotalDays) * PayableDays
```

### 3.2 Notice Period Recovery
Determines if the employee owes the company for unserved notice period.

**A. Days Served Calculation**
```math
DaysServed = (LastWorkingDay - ResignationDate + 1) - LOPDaysDuringNoticePeriod
```
*Note: Any Loss of Pay (LOP) leaves taken during the notice period are deducted from the days served.*

**B. Recovery Amount**
```math
ShortfallDays = NoticePeriodDays - DaysServed

If ShortfallDays > 0:
    RecoveryAmount = (MonthlyGross / 30) * ShortfallDays
Else:
    RecoveryAmount = 0
```
*Note: The recovery is calculated using specific `MonthlyGross / 30`, regardless of the actual days in the current month.*

### 3.3 Leave Encashment
Calculates the value of unutilized earned/annual leaves.

**A. Rate Calculation**
The system prioritizes Basic + DA for the rate.
```math
If (SalaryStructure exists AND (Basic + DA) > 0):
    PerDayRate = (Basic + DA) / 30
Else:
    PerDayRate = MonthlyGross / 30
```

**B. Total Encashment**
```math
EncashmentAmount = PerDayRate * RemainingLeaveBalance
```

### 3.4 Statutory Deductions
Applied to the unpaid salary components.

**A. Provident Fund (PF)**
```math
PF_Wage = ProratedBasic + ProratedDA
PF_Rate = 12% (default)
Max_Limit = 15,000 (default)

If (ProratedBasic >= Max_Limit):
    PF_Amount = Max_Limit * PF_Rate
Else:
    PF_Amount = PF_Wage * PF_Rate
```

**B. Professional Tax (PT)**
Based on the `MonthlyGross` (not prorated) and the specific month (some states have different rates for specific months like Feb).
```math
Iterate through State_Slabs:
    If (MonthlyGross >= Slab.Min AND MonthlyGross <= Slab.Max):
        PT_Amount = Slab.TaxAmount
```

**C. Income Tax (TDS)**
```math
TDS = Sum of (PlannedMonthlyDeduction) for all UnpaidMonths
```
*Fetches the planned deduction value directly from the employee's `TaxDeclaration` for the relevant financial year/month.*

### 3.5 Gratuity
Currently disabled in the codebase (returns 0). The implemented formula for future enablement is:
```math
ServiceYears = (LeavingDate - JoiningDate) in years

If (ServiceYears >= 4.66): // 4 years 240 days
    Gratuity = (LastBasic / 26) * 15 * Round(ServiceYears)
```

## 4. Code Implementation Reference

The following TypeScript code snippets from `src/services/final-settlement.service.ts` serve as the source of truth for these calculations.

### 4.1 Leave Encashment
Performs encashment on `(Basic + DA) / 30`.
```typescript
// ✅ Step 5: Leave Encashment on (Basic + DA). Handles DA = 0 and DA > 0 cases.
const alBalance = leaveSummary?.annual?.remaining || 0;

let encashPerDay = 0;
const structure = salaryAssignment?.salaryStructureId;

if (structure) {
    const basicPerc = structure.fixedEarnings?.basicPercentage ?? 0;
    const daPerc = Number(structure.fixedEarnings?.daPercentage) || 0; 
    
    // Calculate full components from Monthly Gross
    const basic = monthlyGross * (basicPerc / 100);
    const da = daPerc === 0 ? 0 : basic * (daPerc / 100); 

    // Rate Formula
    encashPerDay = (basic + da) / 30;
} else {
    // Fallback if no structure found
    encashPerDay = monthlyGross / 30;
}

const encashAmount = Math.round(alBalance * encashPerDay);
```

### 4.2 Professional Tax (PT)
Iterates through tax slabs defined in the employee's salary structure.
```typescript
const calculatePT = (grossSalary: number, monthNumber: number) => {
    const ptConfig = salaryAssignment?.salaryStructureId?.statutoryDeductions?.professionalTax;
    if (!ptConfig?.slabs?.length) return 0;

    // Check month applicability (some states differ)
    const { term, slabs } = ptConfig;
    const applicableMonths: Record<string, number[]> = {
        half_yearly: [2, 8],
        yearly: [4],
        monthly: Array.from({ length: 12 }, (_, i) => i + 1),
    };
    if (!applicableMonths[term]?.includes(monthNumber)) return 0;

    // Find matching slab
    for (const slab of slabs) {
        if (grossSalary >= slab.fromAmount && 
           (!slab.toAmount || grossSalary <= slab.toAmount)) {
            return Number(slab.taxAmount) || 0;
        }
    }
    return 0;
};
```

### 4.3 Provident Fund (PF)
Standard 12% calculation with optional capping.
```typescript
const calculatePF = (basic: number, da: number) => {
    const epfConfig = salaryAssignment?.salaryStructureId?.statutoryDeductions?.epf;
    if (!epfConfig) return 0;

    const rate = epfConfig.employeeContribution ?? 12; // Default 12%
    const wage = basic + (da || 0);

    // Check if capped (usually at 15000)
    const maxEpfContribution = (rate / 100) * (epfConfig.maxLimit ?? 15000);
    const capped = (epfConfig.maxLimit != null) && basic >= epfConfig.maxLimit;

    return Math.round(capped ? maxEpfContribution : wage * (rate / 100));
};
```

### 4.4 Income Tax (TDS)
Fetches planned deductions from the `TaxDeclaration` module.
```typescript
const calculateIncomeTax = async (monthNumber: number, year: number) => {
    // Determine Financial Year string (e.g. "2024-2025")
    const financialYear = monthNumber <= 3 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
    const monthName = MONTH_NAMES[monthNumber - 1];
    
    // Fetch declaration
    const taxDeclaration = await TaxDeclaration.findOne({
        employeeId: new Types.ObjectId(employeeId),
        financialYear,
    }).lean();

    if (!taxDeclaration) return 0;

    // Find specific month's planned deduction
    const monthlyDeduction = taxDeclaration.monthlyDeductions?.find(
        (md) => md.month === MONTH_SHORT_NAMES[monthName] && 
                md.financialYear === financialYear && 
                !md.isProcessed
    );

    return monthlyDeduction?.plannedDeduction || 0;
};
```

## 5. API Specification

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/final-settlement/initialize/:employeeId` | Auto-calculates and returns initial settlement data. |
| `POST` | `/final-settlement/calculate` | Helper endpoint. Accepts draft data and returns recalculated totals (Net Pay, Deductions, etc.). |
| `POST` | `/final-settlement/save/:employeeId` | Saves the settlement as a **Draft**. Triggers recalculation if `leavingDate` changes. |
| `POST` | `/final-settlement/confirm/:employeeId` | Finalizes the settlement. Locks status to **Confirmed**, generates PDF, sends email. |
| `GET` | `/final-settlement/:employeeId` | Fetches the existing settlement record. |
| `DELETE` | `/final-settlement/:employeeId` | Deletes a **Draft** settlement. |

## 5. Security & Validation
*   **Status Locking**: Once a settlement is 'Confirmed', it cannot be edited or deleted.
*   **LWD Filtering**: The `calculate` endpoint enforces that no salary ranges extend beyond the Last Working Day.
*   **Duplicate Prevention**: Ensures only one active settlement exists per employee.

## 6. PDF Generation
*   **Templates**: Uses HTML templates populated with dynamic Handlebars data.
*   **Generation**: Puppeteer converts the HTML to PDF.
*   **Storage**: Files are stored in the server's public directory and linked in the response.

## 7. Future Enhancements (Roadmap)
*   **Enable Gratuity**: Uncomment the logic in `initialize` and `calculate` functions once the policy is active.
*   **Enable ESI**: Activate ESI calculation logic if required for the specific entity.
*   **Asset Recovery**: Integration with an Asset Management module to auto-deduct for unreturned assets.
