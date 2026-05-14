# FINAL SETTLEMENT - STEP 3 DATA FLOW ANALYSIS

**Date**: February 6, 2026  
**Time**: 18:56 IST  
**Focus**: How Step 3 (Notice Pay) values flow from Frontend → Backend → PDF

---

## 🔄 COMPLETE DATA FLOW FOR STEP 3

### **Step 3 Fields:**
1. Total Notice Period (`noticePeriodDays`)
2. Served Days (`daysServed`)
3. Excess/Shortfall (`excessInNotice`)
4. Recovery Amount (`noticePeriodRecovery`)

---

## 📱 FRONTEND - Step 3 Component

### **File**: `Step3NoticePay.svelte`

#### **1. User Input Fields:**

```svelte
<!-- Total Notice Period -->
<input
    type="number"
    id="noticePeriodDays"
    bind:value={data.noticePeriodDays}  <!-- USER ENTERS VALUE -->
    on:input={handleInput}
/>

<!-- Served Days -->
<input
    type="number"
    id="daysServed"
    bind:value={data.daysServed}  <!-- USER ENTERS VALUE -->
    on:input={handleInput}
/>
```

**User Actions**:
- User enters `noticePeriodDays` (e.g., 60)
- User enters `daysServed` (e.g., 62)

#### **2. Frontend Calculation:**

```typescript
// Lines 17-24
$: displayExcess =
    (Number(data.daysServed) || 0) - (Number(data.noticePeriodDays) || 0);

function syncCalculations() {
    data.excessInNotice = displayExcess;  // Sync calculated value
    dispatch("change");  // Notify parent component
}

function handleInput() {
    syncCalculations();  // Trigger on user input
}
```

**Calculation**: `excessInNotice = daysServed - noticePeriodDays`
- Example: `62 - 60 = 2` (excess of 2 days)

#### **3. Recovery Amount Field:**

```svelte
<!-- Recovery Amount (editable, backend-calculated) -->
<input
    type="number"
    id="noticePeriodRecovery"
    bind:value={data.noticePeriodRecovery}  <!-- BACKEND VALUE, USER CAN OVERRIDE -->
    on:change={() => dispatch("change")}
/>
```

**Note**: This field shows backend-calculated value but user can override

---

## 🔄 FRONTEND - Main Page Component

### **File**: `[employeeId]/+page.svelte`

#### **1. Initial State** (Lines 58-64):

```typescript
noticePay: {
    noticeRequired: true,
    noticePeriodDays: 0,
    daysServed: 0,
    excessInNotice: 0,
    noticePeriodRecovery: 0,
}
```

#### **2. Auto-calculation of Days Served** (Lines 80-107):

```typescript
function updateNoticePeriods() {
    if (
        calculationData.resignationDetails?.lwd &&
        calculationData.resignationDetails?.resignationSubmittedOn &&
        calculationData.noticePay
    ) {
        // Calculate days between resignation date and LWD
        const start = new Date(calculationData.resignationDetails.resignationSubmittedOn);
        const end = new Date(calculationData.resignationDetails.lwd);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
        
        calculationData.noticePay.daysServed = diffDays;  // AUTO-CALCULATED

        // Update excessInNotice
        if (calculationData.noticePay.noticeRequired) {
            calculationData.noticePay.excessInNotice =
                diffDays - (calculationData.noticePay.noticePeriodDays || 0);
        }
    }
}
```

**Auto-calculation**: When user enters resignation date and LWD in Step 2, `daysServed` is auto-calculated

---

## 📤 FRONTEND → BACKEND (API Call)

### **File**: `finalSettlement.ts` (API Service)

#### **1. Flatten Payload** (Lines 16-65):

```typescript
const flattenPayload = (payload: any) => {
    const { workDays, noticePay, resignationDetails, leaveEncashment, adjustments, ...rest } = payload;

    return {
        ...rest,
        // Flatten noticePay
        ...(noticePay ? {
            noticeRequired: noticePay.noticeRequired,
            noticePeriodDays: noticePay.noticePeriodDays,  // ← SENT TO BACKEND
            daysServed: noticePay.daysServed,              // ← SENT TO BACKEND
            excessInNotice: noticePay.excessInNotice,      // ← SENT TO BACKEND
            noticePeriodRecovery: noticePay.noticePeriodRecovery,  // ← SENT TO BACKEND
        } : {}),
        // ... other fields
    };
};
```

#### **2. Save API Call** (Lines 102-108):

```typescript
save: async (employeeId: string, payload: Partial<SettlementCalculation>) => {
    const flattened = flattenPayload(payload);  // Flatten nested structure
    return fetchApi(`/final-settlement/save/${employeeId}`, {
        method: 'POST',
        body: JSON.stringify(flattened)  // Send to backend
    });
}
```

**Payload Sent to Backend**:
```json
{
    "noticePeriodDays": 60,
    "daysServed": 62,
    "excessInNotice": 2,
    "noticePeriodRecovery": 0
}
```

---

## 🔧 BACKEND - Processing

### **File**: `final-settlement.service.ts`

#### **1. Receive Payload** (Lines 728-760):

```typescript
export async function saveFinalSettlement(request, reply) {
    const data = request.body as any;  // Receive flattened payload
    const { employeeId } = request.params;
    
    // Backend receives:
    // data.noticePeriodDays
    // data.daysServed
    // data.excessInNotice
    // data.noticePeriodRecovery
}
```

#### **2. Calculate Recovery (if needed)** (Lines 903-907):

```typescript
// Notice Recovery
let noticeRecovery = data.noticePay?.noticePeriodRecovery ?? data.noticePeriodRecovery;

// If frontend didn't provide recovery AND there's a shortfall, calculate it
if (noticeRecovery === undefined && data.excessInNotice < 0) {
    noticeRecovery = Math.round(Math.abs(data.excessInNotice) * monthlyGross / 30);
}
```

**Backend Logic**:
1. Use frontend-provided `noticePeriodRecovery` if available
2. If not provided AND `excessInNotice < 0` (shortfall), calculate: `Math.abs(excessInNotice) × (monthlyGross / 30)`

#### **3. Save to Database** (Lines 914-933):

```typescript
const enrichedData = {
    ...data,
    noticePeriodRecovery: noticeRecovery,
    // ... other fields
};

packSettlement(settlement, enrichedData);
await settlement.save();
```

**Saved to MongoDB**:
```json
{
    "noticePeriodDays": 60,
    "daysServed": 62,
    "excessInNotice": 2,
    "noticePeriodRecovery": 0
}
```

---

## 📄 BACKEND → PDF

### **File**: `fnf-pdf.helper.ts`

#### **PDF Template Data** (Lines 108-110):

```typescript
const templateData = {
    // ✅ FIX: Show 0 instead of null for numeric fields
    noticePeriod: settlement.noticePeriodDays || 0,
    noticeAdjustable: settlement.excessInNotice < 0 ? Math.abs(settlement.excessInNotice) : 0,
    // ... other fields
};
```

**PDF Generation Logic**:
1. `noticePeriod`: Direct value from `settlement.noticePeriodDays` (or 0 if falsy)
2. `noticeAdjustable`: If `excessInNotice` is negative (shortfall), show absolute value; else show 0

**PDF Output**:
```
Notice period as per application letter : 60
Notice period adjustable             : 0  (because excessInNotice = 2, not negative)
```

---

## 🔄 COMPLETE FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND - Step 3                            │
│                                                                 │
│  User Input:                                                    │
│  - noticePeriodDays: 60 (manual)                               │
│  - daysServed: 62 (auto-calculated from dates OR manual)       │
│                                                                 │
│  Frontend Calculation:                                          │
│  - excessInNotice = daysServed - noticePeriodDays = 2          │
│                                                                 │
│  Backend Value (displayed):                                     │
│  - noticePeriodRecovery: 0 (from backend, user can override)   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND - API Service                       │
│                                                                 │
│  flattenPayload():                                              │
│  {                                                              │
│    noticePeriodDays: 60,                                        │
│    daysServed: 62,                                              │
│    excessInNotice: 2,                                           │
│    noticePeriodRecovery: 0                                      │
│  }                                                              │
│                                                                 │
│  POST /final-settlement/save/:employeeId                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND - Service                            │
│                                                                 │
│  Receive payload:                                               │
│  - noticePeriodDays: 60                                         │
│  - daysServed: 62                                               │
│  - excessInNotice: 2                                            │
│  - noticePeriodRecovery: 0                                      │
│                                                                 │
│  Calculate recovery (if needed):                                │
│  - If excessInNotice < 0: recovery = |excess| × (gross / 30)   │
│  - Else: use frontend value                                     │
│                                                                 │
│  Save to MongoDB                                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND - PDF Generation                     │
│                                                                 │
│  Read from settlement:                                          │
│  - noticePeriodDays: 60                                         │
│  - excessInNotice: 2                                            │
│                                                                 │
│  PDF Template Data:                                             │
│  - noticePeriod: 60                                             │
│  - noticeAdjustable: excessInNotice < 0 ? |excess| : 0 = 0     │
│                                                                 │
│  Generate PDF                                                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PDF OUTPUT                                   │
│                                                                 │
│  Notice period as per application letter : 60                   │
│  Notice period adjustable             : 0                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 EXAMPLE SCENARIOS

### **Scenario 1: Excess Days (No Recovery)**

**Frontend Input**:
- `noticePeriodDays`: 60
- `daysServed`: 62

**Frontend Calculation**:
- `excessInNotice`: 62 - 60 = 2 (excess)

**Backend**:
- `noticePeriodRecovery`: 0 (no recovery for excess)

**PDF Output**:
- Notice period: `60`
- Notice adjustable: `0` (because excessInNotice = 2, not negative)

---

### **Scenario 2: Shortfall Days (Recovery Required)**

**Frontend Input**:
- `noticePeriodDays`: 60
- `daysServed`: 55

**Frontend Calculation**:
- `excessInNotice`: 55 - 60 = -5 (shortfall)

**Backend Calculation**:
- `monthlyGross`: 100,000
- `perDayRate`: 100,000 / 30 = 3,333
- `noticePeriodRecovery`: 5 × 3,333 = 16,665

**PDF Output**:
- Notice period: `60`
- Notice adjustable: `5` (|excessInNotice| = |-5| = 5)

---

### **Scenario 3: No Notice Period**

**Frontend Input**:
- `noticeRequired`: false
- `noticePeriodDays`: 0
- `daysServed`: 0

**Frontend Calculation**:
- `excessInNotice`: 0 - 0 = 0

**Backend**:
- `noticePeriodRecovery`: 0

**PDF Output**:
- Notice period: `0`
- Notice adjustable: `0`

---

## ✅ KEY TAKEAWAYS

### **1. Frontend Responsibilities**:
- ✅ Collect user input (`noticePeriodDays`, `daysServed`)
- ✅ Calculate `excessInNotice` (daysServed - noticePeriodDays)
- ✅ Display backend-calculated `noticePeriodRecovery`
- ✅ Send all values to backend

### **2. Backend Responsibilities**:
- ✅ Receive frontend values
- ✅ Calculate `noticePeriodRecovery` if not provided and shortfall exists
- ✅ Save to database
- ✅ Generate PDF with correct values

### **3. PDF Display Logic**:
- ✅ `noticePeriod`: Shows `noticePeriodDays` (or 0)
- ✅ `noticeAdjustable`: Shows `|excessInNotice|` if negative, else 0

---

## 🐛 COMMON ISSUES & FIXES

### **Issue 1: PDF showing `:` instead of `0`**
**Cause**: PDF helper returned `null` for 0 values  
**Fix**: Return `0` instead of `null`

```typescript
// ❌ BEFORE
noticePeriod: settlement.noticePeriodDays > 0 ? settlement.noticePeriodDays : null,

// ✅ AFTER
noticePeriod: settlement.noticePeriodDays || 0,
```

### **Issue 2: Recovery amount not calculated**
**Cause**: Backend only calculates if `noticePeriodRecovery` is `undefined` AND `excessInNotice < 0`  
**Fix**: Ensure frontend sends correct `excessInNotice` value

### **Issue 3: Days served not auto-updating**
**Cause**: `updateNoticePeriods()` not called when dates change  
**Fix**: Call on Step 2 date changes

---

**Analysis Completed By**: AI Assistant  
**Date**: February 6, 2026  
**Time**: 18:56 IST  
**Status**: ✅ **Complete Step 3 Data Flow Documented**
