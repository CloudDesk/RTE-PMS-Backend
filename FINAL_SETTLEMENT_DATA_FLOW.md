# FINAL SETTLEMENT - COMPLETE DATA FLOW ANALYSIS

**Date**: February 6, 2026  
**Time**: 18:45 IST  
**Purpose**: Trace every PDF field from Frontend Input → Backend Processing → PDF Display

---

## 📊 FIELD-BY-FIELD DATA FLOW

### **1. Notice Period as per Application Letter** (`noticePeriod`)

#### **Frontend - Step 3: Notice Pay** 
**File**: `Step3NoticePay.svelte` Lines 102-108

```svelte
<input
    type="number"
    id="noticePeriodDays"
    bind:value={data.noticePeriodDays}  <!-- USER INPUT -->
    on:input={handleInput}
/>
```

**User Action**: User manually enters notice period days (e.g., 30, 60, 90)

**Initial Value** (from backend initialization):
**File**: `[employeeId]/+page.svelte` Lines 363-366

```typescript
calculationData.noticePay.noticePeriodDays =
    initData?.noticePeriodDays ||
    initData?.resignation?.noticePeriodDays ||
    0;
```

**Source Priority**:
1. Existing draft (`initData.noticePeriodDays`)
2. Resignation record (`initData.resignation.noticePeriodDays`)
3. Default: `0`

#### **Backend - Save**
**File**: `final-settlement.service.ts` Line 904

```typescript
// Backend receives from frontend payload
const noticePeriodDays = data.noticePeriodDays || 0;

// Saved to settlement model
settlement.noticePeriodDays = noticePeriodDays;
```

**Backend does NOT calculate this** - it's a user input field

#### **PDF Generation**
**File**: `fnf-pdf.helper.ts` Line 109

```typescript
noticePeriod: settlement.noticePeriodDays || 0,
```

**Flow**: 
```
User Input (Step 3) → Frontend State → API Payload → Backend Save → PDF Display
```

**Expected Value**: Whatever user entered (0, 30, 60, etc.)

---

### **2. Notice Period Adjustable** (`noticeAdjustable`)

#### **Frontend - Step 3: Notice Pay**
**File**: `Step3NoticePay.svelte` Lines 17-24

```typescript
// Calculated from user inputs
$: displayExcess =
    (Number(data.daysServed) || 0) - (Number(data.noticePeriodDays) || 0);

function syncCalculations() {
    data.excessInNotice = displayExcess;  // Sync to parent
    dispatch("change");
}
```

**User Inputs**:
- `noticePeriodDays`: User enters (e.g., 30)
- `daysServed`: User enters (e.g., 25)

**Calculation**: `excessInNotice = daysServed - noticePeriodDays`
- Example: `25 - 30 = -5` (shortfall of 5 days)

#### **Backend - Save**
**File**: `final-settlement.service.ts` Lines 905-907

```typescript
// Backend receives excessInNotice from frontend
settlement.excessInNotice = data.excessInNotice || 0;

// If shortfall exists, calculate recovery
if (data.excessInNotice < 0) {
    noticeRecovery = Math.round(Math.abs(data.excessInNotice) * monthlyGross / 30);
}
```

**Backend uses frontend-calculated `excessInNotice`** to determine recovery

#### **PDF Generation**
**File**: `fnf-pdf.helper.ts` Line 110

```typescript
noticeAdjustable: settlement.excessInNotice < 0 ? Math.abs(settlement.excessInNotice) : 0,
```

**Logic**: If shortfall (negative), show absolute value; otherwise show 0

**Flow**:
```
User Input (Days Served - Notice Days) → Frontend Calculation → API Payload → Backend Save → PDF Display
```

**Expected Value**: 
- If `excessInNotice = -5` → PDF shows `5`
- If `excessInNotice = 0` → PDF shows `0`
- If `excessInNotice = 5` (excess) → PDF shows `0`

---

### **3. PL Days Payable** (`plDays`)

#### **Frontend - Step 5: Leave Encashment**
**File**: `[employeeId]/+page.svelte` (initialized from backend)

```typescript
calculationData.leaveBalance = initData?.leaveBalance || [];
```

**Backend Initialization**:
**File**: `final-settlement.service.ts` (initialization logic)

```typescript
const leaveSummary = await LeaveSummary.find({
    userId: employeeId,
    year: currentYear
});

const leaveBalance = leaveSummary
    .filter(l => l.leaveType === 'Annual Leave')
    .map(l => ({
        leaveType: l.leaveType,
        balance: l.balance,
        encashDays: l.balance,  // All balance is encashable
        perDayRate: Math.round((basic + da) / 30),
        encashAmount: Math.round(l.balance * perDayRate)
    }));
```

**Source**: Database `LeaveSummary` collection

#### **PDF Generation**
**File**: `fnf-pdf.helper.ts` Line 113

```typescript
plDays: settlement.leaveBalance?.reduce((sum: number, l: any) => sum + (l.encashDays || 0), 0) || 0,
```

**Flow**:
```
Database (LeaveSummary) → Backend Initialization → Frontend Display → Backend Save → PDF Display
```

**Expected Value**: Sum of all encashable leave days (e.g., 10 days of Annual Leave)

---

### **4. Number of Days Salary Payable** (`salaryDays`)

#### **Frontend - Step 4: Work Days**
**File**: `Step4WorkDays.svelte`

```svelte
<!-- For each unpaid month -->
<input
    type="number"
    bind:value={month.daysWorked}
    on:change={() => dispatch("change")}
/>
```

**User Action**: User edits days worked for each unpaid month

**Initial Value**: Auto-calculated from attendance/LOP

#### **Backend - Save**
**File**: `final-settlement.service.ts` Lines 824-866

```typescript
for (const m of unpaidMonths) {
    const payableDays = m.daysWorked || 0;
    // ... prorate salary components based on daysWorked
}
```

#### **PDF Generation**
**File**: `fnf-pdf.helper.ts` Lines 116-119

```typescript
salaryDays: settlement.unpaidMonths.length > 0
    ? settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.daysWorked || 0), 0)
    : settlement.holdPayrolls?.reduce((sum: number, h: any) => sum + (h.daysWorked || 0), 0) || 0,
```

**Logic**:
- If `unpaidMonths` exists → Sum of `daysWorked` from unpaidMonths
- If `unpaidMonths` is empty → Sum of `daysWorked` from holdPayrolls

**Flow**:
```
Backend Calculation (Attendance/LOP) → Frontend Display → User Edit → Backend Save → PDF Display
```

**Expected Value**: 
- With unpaidMonths: Sum of days worked (e.g., 20 + 25 = 45)
- With holdPayrolls only: Sum from holdPayrolls (e.g., 30)

---

### **5. Number of Days in the Month** (`monthDays`)

#### **Frontend - Step 4: Work Days**
**File**: `Step4WorkDays.svelte`

```svelte
<!-- Display only, not editable -->
<div>Total Days: {month.totalDays}</div>
```

**Source**: Calendar days in month (28, 29, 30, or 31)

#### **Backend - Calculation**
**File**: `final-settlement.service.ts` (unpaid gaps calculation)

```typescript
const totalDays = new Date(year, month, 0).getDate();  // Days in month
month.totalDays = totalDays;
```

#### **PDF Generation**
**File**: `fnf-pdf.helper.ts` Lines 120-123

```typescript
monthDays: settlement.unpaidMonths.length > 0
    ? settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.totalDays || 0), 0)
    : settlement.holdPayrolls?.reduce((sum: number, h: any) => sum + (h.totalDays || 0), 0) || 30,
```

**Logic**:
- If `unpaidMonths` exists → Sum of `totalDays` from unpaidMonths
- If `unpaidMonths` is empty → Sum of `totalDays` from holdPayrolls
- Default: 30

**Flow**:
```
Calendar Calculation → Backend Calculation → Frontend Display → Backend Save → PDF Display
```

**Expected Value**:
- With unpaidMonths: Sum of total days (e.g., 31 + 30 = 61)
- With holdPayrolls only: Total days from holdPayrolls (e.g., 31)

---

### **6. LOP Days** (`lopDays`)

#### **Frontend - Step 4: Work Days**
**File**: `Step4WorkDays.svelte`

```typescript
// Calculated from user input
$: month.lopDays = month.totalDays - month.daysWorked;
```

**Calculation**: `lopDays = totalDays - daysWorked`
- Example: `31 - 30 = 1` LOP day

#### **Backend - Save**
**File**: `final-settlement.service.ts` Lines 824-866

```typescript
for (const m of unpaidMonths) {
    const lopDays = m.totalDays - m.daysWorked;
    m.lopDays = lopDays;
    m.lopAmount = Math.round((monthlyGross / m.totalDays) * lopDays);
}
```

#### **PDF Generation**
**File**: `fnf-pdf.helper.ts` Lines 124-127

```typescript
lopDays: settlement.unpaidMonths.length > 0
    ? settlement.unpaidMonths.reduce((sum: number, m: any) => sum + (m.lopDays || 0), 0)
    : settlement.holdPayrolls?.reduce((sum: number, h: any) => sum + (h.lopDays || 0), 0) || 0,
```

**Logic**:
- If `unpaidMonths` exists → Sum of `lopDays` from unpaidMonths
- If `unpaidMonths` is empty → Sum of `lopDays` from holdPayrolls

**Flow**:
```
User Input (Days Worked) → Frontend Calculation (Total - Worked) → Backend Save → PDF Display
```

**Expected Value**:
- With unpaidMonths: Sum of LOP days (e.g., 1 + 2 = 3)
- With holdPayrolls only: LOP days from holdPayrolls (e.g., 1)

---

### **7. Effective Workdays** (`effectiveWorkdays`)

#### **Frontend - Calculation**
**File**: `[employeeId]/+page.svelte`

```typescript
calculationData.totalDaysWorked = 
    unpaidMonths.reduce((sum, m) => sum + m.daysWorked, 0);
```

**Source**: Sum of all `daysWorked` from unpaid months

#### **Backend - Save**
**File**: `final-settlement.service.ts`

```typescript
settlement.totalDaysWorked = unpaidMonths.reduce((sum, m) => sum + m.daysWorked, 0);
```

#### **PDF Generation**
**File**: `fnf-pdf.helper.ts` Line 128

```typescript
effectiveWorkdays: settlement.totalDaysWorked || 0,
```

**Flow**:
```
Backend Calculation (Sum of Days Worked) → Frontend Display → Backend Save → PDF Display
```

**Expected Value**: Sum of all days worked in unpaid months (e.g., 45)

---

### **8. Department** (`empDept`)

#### **Frontend - Display Only**
**File**: `[employeeId]/+page.svelte`

```typescript
// Displayed from initialization data
employeeName: initData?.employeeName
```

**Source**: Employee record from database

#### **Backend - Fetch**
**File**: `final-settlement.service.ts`

```typescript
const employee = await User.findById(employeeId);
```

#### **PDF Generation**
**File**: `fnf-pdf.helper.ts` Lines 101

```typescript
empDept: (employee as any).department || (employee as any).departmentId?.name || '',
```

**Logic**:
1. Check `employee.department` (string field)
2. If not found, check `employee.departmentId.name` (populated object)
3. If still not found, return empty string

**Flow**:
```
Database (User.department) → Backend Fetch → PDF Display
```

**Expected Value**: Department name (e.g., "Engineering", "HR") or empty if not set

---

## 🔄 COMPLETE DATA FLOW SUMMARY

### **User Input Fields** (Frontend → Backend → PDF)
1. **Notice Period Days**: User enters in Step 3
2. **Days Served**: User enters in Step 3
3. **Days Worked**: User edits in Step 4 for each month

### **Calculated Fields** (Frontend Calculation → Backend Save → PDF)
1. **Excess/Shortfall**: `daysServed - noticePeriodDays`
2. **LOP Days**: `totalDays - daysWorked`
3. **Effective Workdays**: Sum of all `daysWorked`

### **Backend-Fetched Fields** (Database → Backend → PDF)
1. **PL Days**: From `LeaveSummary` table
2. **Total Days**: Calendar calculation
3. **Department**: From `User` table

### **Hybrid Fields** (Backend Calculation + Frontend Override → PDF)
1. **Salary Days**: Backend calculates, user can override in Step 4
2. **Month Days**: Backend calculates from calendar
3. **Notice Recovery**: Backend calculates, user can override in Step 3

---

## 🐛 WHY FIELDS WERE SHOWING EMPTY

### **Root Cause**:
The PDF helper was returning `null` for fields when:
1. Value was `0`
2. Condition wasn't met (e.g., `value > 0 ? value : null`)

### **Example**:
```typescript
// ❌ BEFORE (returned null for 0 values)
noticePeriod: settlement.noticePeriodDays > 0 ? settlement.noticePeriodDays : null,

// ✅ AFTER (returns 0 for 0 values)
noticePeriod: settlement.noticePeriodDays || 0,
```

### **Impact**:
When template received `null`, it displayed the placeholder `{noticePeriod}` instead of `0`

---

## ✅ FIXES APPLIED

### **1. Show 0 Instead of Null**
All numeric fields now return `0` instead of `null` when value is 0

### **2. Use holdPayrolls When unpaidMonths is Empty**
Fields like `salaryDays`, `monthDays`, `lopDays` now check:
- If `unpaidMonths.length > 0` → Use unpaidMonths data
- Else → Use holdPayrolls data

### **3. Fix Department Mapping**
Check `employee.department` string field before `employee.departmentId.name`

---

## 📊 DATA SOURCES SUMMARY

| Field | Source | Type |
|-------|--------|------|
| **Notice Period** | User Input (Step 3) | Manual |
| **Notice Adjustable** | Frontend Calculation | Auto |
| **PL Days** | Database (LeaveSummary) | Auto |
| **Salary Days** | Backend Calc + User Edit | Hybrid |
| **Month Days** | Calendar Calculation | Auto |
| **LOP Days** | Frontend Calculation | Auto |
| **Effective Workdays** | Backend Calculation | Auto |
| **Department** | Database (User) | Auto |

---

## 🎯 TESTING CHECKLIST

### **Scenario 1: Employee with Notice Period**
- [ ] User enters `noticePeriodDays = 30`
- [ ] User enters `daysServed = 25`
- [ ] PDF shows `noticePeriod = 30`
- [ ] PDF shows `noticeAdjustable = 5` (shortfall)

### **Scenario 2: Employee with No Notice Period**
- [ ] User enters `noticePeriodDays = 0`
- [ ] User enters `daysServed = 0`
- [ ] PDF shows `noticePeriod = 0`
- [ ] PDF shows `noticeAdjustable = 0`

### **Scenario 3: Employee with Hold Payrolls Only**
- [ ] `unpaidMonths = []` (empty)
- [ ] `holdPayrolls = [{ daysWorked: 30, totalDays: 31, lopDays: 1 }]`
- [ ] PDF shows `salaryDays = 30`
- [ ] PDF shows `monthDays = 31`
- [ ] PDF shows `lopDays = 1`

### **Scenario 4: Employee with Unpaid Months**
- [ ] `unpaidMonths = [{ daysWorked: 20, totalDays: 30, lopDays: 10 }]`
- [ ] PDF shows `salaryDays = 20`
- [ ] PDF shows `monthDays = 30`
- [ ] PDF shows `lopDays = 10`

### **Scenario 5: Employee with Leave Encashment**
- [ ] `leaveBalance = [{ encashDays: 10 }]`
- [ ] PDF shows `plDays = 10`

---

**Analysis Completed By**: AI Assistant  
**Date**: February 6, 2026  
**Time**: 18:45 IST  
**Status**: ✅ **Complete Data Flow Documented**
