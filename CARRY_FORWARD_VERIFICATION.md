# Carry Forward Implementation Verification

## Current Implementation Analysis

### Logic Flow:
1. **Get next year's summary** - Retrieves existing leave summary for the target year
2. **Add carried forward days** - Adds `daysCarriedForward` to next year's `alloted`
3. **Pre-save hook calculates remaining** - `remaining = alloted - availed`

### Example Scenario:
**Initial State (2025):**
- alloted: 20 days
- availed: 0 days
- remaining: 20 days

**Carry Forward (2 days from 2024 to 2025):**
- alloted: 20 + 2 = 22 days ✅
- availed: 0 days
- remaining: 22 - 0 = 22 days ✅

**Result:** Employee has 22 days available (20 original + 2 carried forward)

## Requirements Check:

### ✅ Requirement 1: "2 is carry format next year, sub in total holidays"
**Status:** Currently NOT implemented
- **Expected:** Subtract 2 from next year's total holidays (alloted)
- **Current:** Just adds 2 to allotted
- **Issue:** Need to subtract first, then add back

### ✅ Requirement 2: "correctly add to next year when years that is carry forward"
**Status:** ✅ IMPLEMENTED
- Carried forward days are added to next year's allotted
- Remaining balance is automatically recalculated via pre-save hook
- Employee has access to carried forward days

## Recommended Fix:

The requirement says to **subtract from total holidays**, which means:
- Next year's allotted should be: `original - carried forward`
- But employee should still have access to carried forward days
- So: `alloted = (original - carried forward) + carried forward = original`
- But we track that the subtraction happened

**Current Implementation:**
```typescript
const finalAlloted = currentToYearAlloted + daysCarriedForward;
// This just adds, doesn't subtract from quota
```

**Should Be:**
```typescript
// Subtract from quota, then add back
const reducedAlloted = currentToYearAlloted - daysCarriedForward;
const finalAlloted = reducedAlloted + daysCarriedForward;
// Net: same, but we've accounted for the subtraction
```

## Testing Checklist:

- [ ] Test carry forward with 0 allotted next year
- [ ] Test carry forward with existing allotted next year
- [ ] Test carry forward with existing availed days
- [ ] Verify remaining balance is correct after carry forward
- [ ] Verify carry forward record is created
- [ ] Verify email notification is sent
- [ ] Test duplicate carry forward prevention
- [ ] Test validation (cannot carry forward more than balance)

## Potential Issues:

1. **If next year has 0 allotted:**
   - Current: `0 + 2 = 2` ✅ Works
   - With subtract: `0 - 2 = -2` (would need Math.max(0, ...))

2. **If next year already has availed days:**
   - Current: `alloted = 20 + 2 = 22`, `remaining = 22 - 5 = 17` ✅
   - With subtract: `alloted = (20 - 2) + 2 = 20`, `remaining = 20 - 5 = 15` ❌ Wrong!

**The issue:** If we subtract and add back, and there are already availed days, the remaining will be wrong.

## Correct Solution:

The requirement "sub in total holidays" might mean:
- Track that carried forward days came from previous year (not new quota)
- But still add them to next year's balance
- The "subtraction" is a business rule, not a technical subtraction

**Recommended Approach:**
1. Add carried forward days directly to next year's allotted ✅ (Current)
2. Track in carry forward record that these days were "subtracted from quota" (Business rule)
3. Employee gets access to the days ✅

This way:
- Employee has access to carried forward days ✅
- System tracks that they came from previous year ✅
- Remaining balance is correct ✅

