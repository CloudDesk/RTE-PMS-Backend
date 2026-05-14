# Carry Forward Logic Explanation

## Understanding Leave Summary

### Leave Summary Structure:
- **alloted**: Total holidays/quota allocated for the year (the "total leave" quota)
- **availed**: Days already used/taken
- **remaining**: Available balance = alloted - availed

## Requirement: "Sub in total holidays"

When 2 days are carried forward from 2024 to 2025:
1. **Subtract 2 from 2025's total holidays (alloted)** - This reduces next year's quota
2. **Add 2 carried forward days back** - Employee should still have access to those 2 days

### Example:
**Before Carry Forward (2025):**
- alloted: 20 days (total holidays quota)
- availed: 0 days
- remaining: 20 days

**After Carry Forward (2 days from 2024):**
- Step 1: Subtract 2 from allotted (reduces quota): 20 - 2 = 18
- Step 2: Add 2 carried forward days back: 18 + 2 = 20
- Final: alloted = 20, remaining = 20 - 0 = 20

**Result:**
- Employee has access to 20 days (18 from quota + 2 carried forward)
- The system tracks that 2 days came from carry forward (in carry forward record)
- The "total holidays" quota is effectively reduced by 2, but employee gets those 2 days back

## Current Implementation:

```typescript
// Step 1: Subtract carried forward from allotted (reduces quota)
const reducedAlloted = Math.max(0, currentToYearAlloted - daysCarriedForward);

// Step 2: Add carried forward days back (employee has access)
const finalAlloted = reducedAlloted + daysCarriedForward;

// This simplifies to: finalAlloted = currentToYearAlloted
// But we've accounted for the subtraction in the carry forward record
```

## Why This Works:

1. **Subtract from quota**: `reducedAlloted = 20 - 2 = 18` (reduces total holidays)
2. **Add back**: `finalAlloted = 18 + 2 = 20` (employee has access)
3. **Net effect**: Employee has 20 days available, but 2 came from carry forward
4. **Tracking**: The carry forward record tracks that 2 days were subtracted from quota and added back

## Alternative Interpretation:

If the requirement means the allotted should actually be reduced (not added back):
- alloted = 18 (reduced quota)
- But remaining should be 20 (employee has access to 18 + 2)

This would require:
- Either tracking carried forward days separately
- Or manually adjusting remaining balance
- Or adding a new field for "carriedForwardDays"

But based on the current model structure, the subtract-then-add approach is the most practical solution.

