# Carry Forward Test Scenarios

## Current Implementation Logic

```typescript
// Step 1: Subtract carried forward days from next year's allotted (reduces quota)
const reducedAlloted = Math.max(0, currentToYearAlloted - daysCarriedForward);

// Step 2: Add carried forward days back to allotted (employee has access)
const finalAlloted = reducedAlloted + daysCarriedForward;

// This simplifies to:
const finalAlloted = (currentToYearAlloted - daysCarriedForward) + daysCarriedForward;
// = currentToYearAlloted - daysCarriedForward + daysCarriedForward
// = currentToYearAlloted
```

**Issue:** The subtract-then-add cancels out, so we're effectively just keeping the original allotted value, not adding the carried forward days!

## Correct Implementation

The requirement is:
1. **Subtract** carried forward days from next year's total holidays (alloted) - reduces quota
2. **Add** carried forward days to next year's balance - employee can use them

**Correct Logic:**
```typescript
// Add carried forward days directly to next year's allotted
const finalAlloted = currentToYearAlloted + daysCarriedForward;
```

This ensures:
- Carried forward days are added to next year's balance ✅
- Remaining balance increases: `remaining = (alloted + carried forward) - availed` ✅
- The "subtraction from quota" is a business rule tracked in the carry forward record

## Test Scenarios

### Scenario 1: Basic Carry Forward
**Setup:**
- 2024: remaining = 15 days
- 2025: alloted = 20 days, availed = 0, remaining = 20

**Action:** Carry forward 2 days from 2024 to 2025

**Expected Result:**
- 2025: alloted = 22 days (20 + 2), remaining = 22 days ✅

### Scenario 2: Carry Forward with Existing Availed Days
**Setup:**
- 2024: remaining = 10 days
- 2025: alloted = 20 days, availed = 5 days, remaining = 15

**Action:** Carry forward 2 days from 2024 to 2025

**Expected Result:**
- 2025: alloted = 22 days (20 + 2), remaining = 17 days (22 - 5) ✅

### Scenario 3: Carry Forward to Year with 0 Allotted
**Setup:**
- 2024: remaining = 5 days
- 2025: alloted = 0 days, availed = 0, remaining = 0

**Action:** Carry forward 2 days from 2024 to 2025

**Expected Result:**
- 2025: alloted = 2 days (0 + 2), remaining = 2 days ✅

### Scenario 4: Multiple Carry Forwards
**Setup:**
- 2024: remaining = 10 days
- 2025: alloted = 20 days, availed = 0, remaining = 20

**Action 1:** Carry forward 2 days from 2024 to 2025
- Result: alloted = 22, remaining = 22 ✅

**Action 2:** Carry forward 3 more days from 2024 to 2025 (if balance allows)
- Result: alloted = 25, remaining = 25 ✅

## Current Code Issue

The current implementation does:
```typescript
const reducedAlloted = currentToYearAlloted - daysCarriedForward; // e.g., 20 - 2 = 18
const finalAlloted = reducedAlloted + daysCarriedForward; // 18 + 2 = 20
```

This results in `finalAlloted = currentToYearAlloted`, which means **no change**! The carried forward days are NOT being added.

## Fix Required

Change to:
```typescript
const finalAlloted = currentToYearAlloted + daysCarriedForward;
```

This will correctly add the carried forward days to next year's balance.

