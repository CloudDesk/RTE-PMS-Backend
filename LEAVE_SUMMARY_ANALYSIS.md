# Leave Summary Database Analysis

## Current Leave Summary (2025)

### Document Structure:
```json
{
  "userId": "69267d9d8a6dbaccedb05aa8",
  "year": 2025,
  "annual": {
    "alloted": 12,
    "availed": 3,
    "remaining": 9,
    "leaveRequests": ["69267fd78a6dbaccedb05bd6"]
  },
  "sick": {
    "alloted": 1,
    "availed": 0,
    "remaining": 1,
    "leaveRequests": []
  },
  "compOff": {
    "alloted": 10,
    "availed": 0,
    "remaining": 10,
    "leaveRequests": []
  },
  "lossOfPay": { "alloted": 0, "availed": 0, "remaining": 0 },
  "otherPaid": { "alloted": 0, "availed": 0, "remaining": 0 },
  "otherUnpaid": { "alloted": 0, "availed": 0, "remaining": 0 },
  "maternity": { "alloted": 0, "availed": 0, "remaining": 0 }
}
```

## Data Validation ✅

### 1. Annual Leave:
- **alloted**: 12 days
- **availed**: 3 days
- **remaining**: 9 days
- **Calculation**: 12 - 3 = 9 ✅ **CORRECT**
- **Status**: Employee has 1 pending leave request

### 2. Sick Leave:
- **alloted**: 1 day
- **availed**: 0 days
- **remaining**: 1 day
- **Calculation**: 1 - 0 = 1 ✅ **CORRECT**
- **Status**: No leave requests

### 3. Comp Off:
- **alloted**: 10 days
- **availed**: 0 days
- **remaining**: 10 days
- **Calculation**: 10 - 0 = 10 ✅ **CORRECT**
- **Status**: No leave requests

### 4. Other Leave Types:
- All have 0 allotted, 0 availed, 0 remaining ✅ **CORRECT**

## Carry Forward Impact Analysis

### Scenario: Carry Forward 2 days from 2024 to 2025 (Annual Leave)

**Current State (2025 Annual):**
- alloted: 12
- availed: 3
- remaining: 9

**After Carry Forward (2 days from 2024):**

**Step 1: Subtract from quota**
- reducedAlloted = 12 - 2 = 10

**Step 2: Add carried forward back**
- finalAlloted = 10 + 2 = 14

**Final State:**
- alloted: 14 (12 + 2)
- availed: 3 (unchanged)
- remaining: 11 (14 - 3) ✅

**Result:**
- Employee's annual leave balance increases from 9 to 11 days
- The 2 carried forward days are added to the balance
- The subtraction from quota is tracked in the carry forward record

## Key Observations

### ✅ Correct Calculations:
1. All `remaining` values are correctly calculated: `remaining = alloted - availed`
2. The pre-save hook is working correctly
3. Leave requests are properly tracked in the `leaveRequests` array

### 📊 Current Balance Summary:
- **Total Annual Leave Available**: 9 days
- **Total Sick Leave Available**: 1 day
- **Total Comp Off Available**: 10 days
- **Total Available Leave**: 20 days

### 🔍 Data Integrity:
- All leave types have valid structure
- `manuallyAdjusted` flags are set to `false` (UAE-specific field)
- Timestamps are present (`createdAt`, `updatedAt`)
- Document version (`__v`) is tracked

## Potential Issues to Check:

1. **Carry Forward Records**: Check if there are any carry forward records for this user from 2024 to 2025
2. **Leave Requests**: Verify the leave request `69267fd78a6dbaccedb05bd6` exists and is properly linked
3. **Year Consistency**: Ensure all leave requests are for year 2025

## Recommendations:

1. ✅ Data structure is correct
2. ✅ Calculations are accurate
3. ✅ Ready for carry forward processing
4. ⚠️ If carry forward was already processed, verify the `alloted` value includes carried forward days

