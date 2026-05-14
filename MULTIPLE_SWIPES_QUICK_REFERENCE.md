# Multiple Swipes - Quick Reference Guide

## Current Implementation Summary

### Current Limitations
- ✅ **Max 2 swipes per day** (enforced in `processSwipe()` line 711-716)
- ✅ **Simple calculation**: Only uses first IN and last OUT
- ✅ **Basic break logic**: 30 min if total > 6 hours, else 0
- ✅ **Status**: `'duplicate_swipes'` if > 2 swipes (currently blocked)

### Current Calculation
```
totalWorkHours = lastOut - firstIn
breakHours = (totalWorkHours > 6h) ? 30min : 0
actualWorkHours = totalWorkHours - breakHours
```

---

## Proposed Multiple Swipes Solution

### Key Changes Required

1. **Remove 2-Swipe Limit** (Line 711-716 in `biometric-attendance.service.ts`)
2. **Add Swipe Direction Detection** (alternate IN/OUT)
3. **Add Swipe Validation** (min gap, pattern validation)
4. **Update Calculation Logic** (work sessions + breaks)
5. **Update Status Logic** (handle multiple swipes)

---

## Calculation Logic for Multiple Swipes

### Work Sessions
Group swipes into IN-OUT pairs:
```
IN 09:00 → OUT 13:00 = 4 hours (Session 1)
IN 14:00 → OUT 18:00 = 4 hours (Session 2)
Total Work = 8 hours
```

### Break Periods
Detect gaps between OUT and next IN:
```
OUT 13:00 → IN 14:00 = 1 hour break
Only count gaps >= 15 minutes as breaks
```

### Total Calculations
```
totalWorkHours = Sum of all work sessions
breakHours = Sum of all break periods
actualWorkHours = totalWorkHours (breaks already excluded)
shortfallHours = max(0, shiftHours - actualWorkHours)
excessHours = max(0, actualWorkHours - shiftHours)
```

---

## Status Values

### Record Status (`status`)
| Status | When |
|--------|------|
| `'complete'` | Valid IN-OUT pairs (even number of swipes) |
| `'incomplete'` | Invalid pattern or odd number of swipes |
| `'missing_checkout'` | Ends with IN (no final OUT) |
| `'duplicate_swipes'` | Consecutive same-direction swipes |

### Attendance Status (`attendanceStatus` array)
| Status | When Added |
|--------|------------|
| `'Present'` | At least one valid IN-OUT pair |
| `'On-Time'` | First IN <= shiftStart |
| `'Late'` | First IN > shiftStart |
| `'Early-Exit'` | Last OUT < shiftEnd |
| `'OT'` | excessHours > 0 |
| `'Out-Of-Window'` | Swipe outside allowed window |

**Multiple statuses can coexist**: `['Present', 'Late', 'OT']`

---

## Examples

### Example 1: Standard Day with Lunch
```
Swipes: IN 09:00 → OUT 13:00 → IN 14:00 → OUT 18:00
Work: 4h + 4h = 8 hours
Break: 1 hour (13:00-14:00)
Status: 'complete'
AttendanceStatus: ['Present', 'On-Time']
```

### Example 2: Multiple Breaks
```
Swipes: IN 09:00 → OUT 11:00 → IN 12:00 → OUT 13:00 → IN 14:00 → OUT 18:00
Work: 2h + 1h + 4h = 7 hours
Breaks: 1h (11:00-12:00) + 1h (13:00-14:00) = 2 hours
Status: 'complete'
AttendanceStatus: ['Present', 'On-Time']
```

### Example 3: Overtime
```
Swipes: IN 09:00 → OUT 13:00 → IN 14:00 → OUT 20:00
Work: 4h + 6h = 10 hours
Break: 1 hour
Regular: 9 hours
Overtime: 1 hour
Status: 'complete'
AttendanceStatus: ['Present', 'On-Time', 'OT']
```

---

## Validation Rules

1. **First swipe must be IN**
2. **Swipes must alternate** (IN → OUT → IN → OUT)
3. **Minimum gap**: 1 minute between swipes
4. **Maximum swipes**: 20 per day (configurable)
5. **Break detection**: Only gaps >= 15 minutes count as breaks

---

## Implementation Checklist

### Phase 1: Core Logic
- [ ] Remove 2-swipe limit check
- [ ] Implement `determineSwipeDirection()`
- [ ] Implement `validateSwipe()`
- [ ] Update `processSwipe()` flow

### Phase 2: Calculations
- [ ] Implement `calculateWorkSessions()`
- [ ] Implement `calculateBreakPeriods()`
- [ ] Update `calculateAttendanceMetrics()`
- [ ] Implement `calculateOvertime()`

### Phase 3: Status
- [ ] Implement `determineRecordStatus()`
- [ ] Implement `determineAttendanceStatus()`
- [ ] Update status logic in `processSwipe()`

### Phase 4: Testing
- [ ] Unit tests
- [ ] Integration tests
- [ ] Edge case testing

---

## Code Locations

### Files to Modify
1. `src/services/biometric-attendance.service.ts`
   - `processSwipe()` - Main handler
   - `processFirstSwipe()` - Update or remove
   - `processSecondSwipe()` - Update or remove
   - `calculateAttendanceMetrics()` - Update for multiple swipes

2. `src/models/attendance-record.model.ts`
   - No schema changes needed (already supports arrays)
   - Optional: Add computed fields

### New Functions to Add
- `determineSwipeDirection()`
- `validateSwipe()`
- `calculateWorkSessions()`
- `calculateBreakPeriods()`
- `determineRecordStatus()`
- `determineAttendanceStatus()`

---

## Edge Cases

| Case | Action |
|------|--------|
| Consecutive IN/OUT | Reject, mark as duplicate |
| Starts with OUT | Reject, require IN first |
| Odd number of swipes | Mark as 'missing_checkout' |
| Swipe < 1 min gap | Reject with error |
| Break < 15 min | Count as work time, not break |
| Break > 4 hours | Flag for review |

---

## Backward Compatibility

✅ **Fully Compatible**
- Existing 2-swipe records work without changes
- New logic handles 2 swipes as special case
- No data migration required
- Same API endpoints

---

## Performance

- **Time Complexity**: O(n log n) due to sorting
- **Typical Swipes**: 2-6 per day
- **Max Swipes**: 20 per day (configurable)
- **Expected Performance**: < 100ms per swipe

---

## Configuration

```typescript
{
  maxSwipesPerDay: 20,
  minSwipeGapMinutes: 1,
  minBreakDurationMinutes: 15,
  maxBreakDurationMinutes: 240,
  lunchBreakThresholdMinutes: 30
}
```

---

## Quick Start Implementation

1. **Remove limit check** (line 711-716):
```typescript
// REMOVE THIS:
if (record.swipes.length >= 2) {
  return { success: false, message: 'Maximum swipes limit (2) reached' };
}
```

2. **Add direction detection**:
```typescript
const direction = record.swipes.length === 0 
  ? 'IN' 
  : record.swipes[record.swipes.length - 1].direction === 'IN' 
    ? 'OUT' 
    : 'IN';
```

3. **Update calculations** to use work sessions instead of simple firstIn/lastOut

See full plan in `MULTIPLE_SWIPES_IMPLEMENTATION_PLAN.md` for complete implementation details.

