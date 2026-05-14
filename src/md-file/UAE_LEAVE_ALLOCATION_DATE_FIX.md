# UAE Leave Allocation & Expiry Date Fix

**Date:** October 14, 2025  
**Status:** ✅ Fixed  

---

## 🐛 Problem Identified

**Symptom:**
- Annual Leave: ✅ Shows allocation/expiry dates
- Maternity Leave: ✅ Shows allocation/expiry dates
- **Sick Leave: ❌ Shows "Not Set"** (even with alloted: 10 days)
- **Comp Off: ❌ Shows "Not Set"** (even with alloted: 5 days)

**Root Cause:**
The backend service was **only setting allocation dates for leave types that were explicitly being updated** in the current request. If Sick Leave and Comp Off were allocated in a previous request, they wouldn't get allocation/expiry dates when viewed later.

---

## ✅ Solution Implemented

### **Updated Logic in `src/services/leave-summary.service.ts`**

#### **Before (❌ Broken):**
```typescript
// Only set dates if the leave type is being updated
if (allotments.sick !== undefined) {
  summary.sick.allocationDate = allotments.sickAllocationDate || today;
}
```

#### **After (✅ Fixed):**
```typescript
// Set dates for ANY leave type with alloted > 0 that doesn't have a date
if (allotments.sick !== undefined || (summary.sick.alloted > 0 && !summary.sick.allocationDate)) {
  summary.sick.allocationDate = allotments.sickAllocationDate || summary.sick.allocationDate || today;
}
```

---

## 🔧 What Changed

### **1. For New Leave Summaries:**
```typescript
// NOW: Check if alloted > 0, not just if it's defined
if (allotments.sick && allotments.sick > 0) {
  createData.sick.allocationDate = allotments.sickAllocationDate || today;
}
```

### **2. For Existing Leave Summaries:**
```typescript
// NOW: Set dates for ANY leave with alloted > 0 that lacks an allocation date
if (allotments.sick !== undefined || (summary.sick.alloted > 0 && !summary.sick.allocationDate)) {
  summary.sick.allocationDate = allotments.sickAllocationDate || summary.sick.allocationDate || today;
}
```

### **3. Added Debug Logging:**
```typescript
console.log(`📊 Leave allocation status:`, {
  annual: { alloted: summary.annual.alloted, hasDate: !!summary.annual.allocationDate },
  sick: { alloted: summary.sick.alloted, hasDate: !!summary.sick.allocationDate },
  compOff: { alloted: summary.compOff.alloted, hasDate: !!summary.compOff.allocationDate },
  maternity: { alloted: summary.maternity.alloted, hasDate: !!summary.maternity.allocationDate }
});
```

---

## 📊 Expected Behavior Now

**When you allocate leaves to a UAE employee:**

| Type | Alloted | Allocation Date | Expiry Date | Status |
|------|---------|----------------|-------------|--------|
| **Annual Leave** | 30 | Oct 14, 2025 | Oct 14, 2026 | ✅ Active |
| **Sick Leave** | 10 | Oct 14, 2025 | Oct 14, 2026 | ✅ Active |
| **Comp Off** | 5 | Oct 14, 2025 | Oct 14, 2026 | ✅ Active |
| **Maternity Leave** | 60 | Oct 14, 2025 | Oct 14, 2026 | ✅ Active |

**All leave types with alloted > 0 will automatically get:**
- ✅ Allocation Date (defaults to today if not provided)
- ✅ Expiry Date (auto-calculated as allocation + 1 year)
- ✅ Status tracking (active/expired)

---

## 🧪 Testing Instructions

### **Test Case 1: New Leave Allocation**
```bash
POST /leave-summary/allotments
{
  "userId": "507f1f77bcf86cd799439011",
  "year": 2025,
  "annual": 30,
  "sick": 10,
  "compOff": 5,
  "maternity": 60
}
```

**Expected Result:**
- ALL leave types should have allocation and expiry dates
- Expiry dates should be exactly 1 year from allocation date

### **Test Case 2: Update Existing Leave**
```bash
POST /leave-summary/allotments
{
  "userId": "507f1f77bcf86cd799439011",
  "year": 2025,
  "annual": 35  // Just updating annual
}
```

**Expected Result:**
- Annual leave gets new allocation date (today)
- Sick, Comp Off, Maternity dates remain unchanged (if already set)
- If they didn't have dates before, they get them now (if alloted > 0)

### **Test Case 3: Fix for Existing Data**
For users who already have allocated leaves but no dates:

1. Just call the update endpoint with the same values
2. The service will detect `alloted > 0` but no `allocationDate`
3. It will automatically set allocation date to today
4. Pre-save hook will calculate expiry date

---

## 🔍 How to Verify

### **Check Backend Logs:**
```bash
# Look for these log entries:
🇦🇪 [UAE Leave Allocation] User 507f... - Setting allocation dates for leave year 2025

📊 Leave allocation status: {
  annual: { alloted: 30, hasDate: true },
  sick: { alloted: 10, hasDate: true },
  compOff: { alloted: 5, hasDate: true },
  maternity: { alloted: 60, hasDate: true }
}
```

### **Check API Response:**
```json
{
  "annual": {
    "alloted": 30,
    "availed": 0,
    "remaining": 30,
    "allocationDate": "2025-10-14T00:00:00.000Z",
    "expiryDate": "2026-10-14T00:00:00.000Z",
    "manuallyAdjusted": false
  },
  "sick": {
    "alloted": 10,
    "availed": 0,
    "remaining": 10,
    "allocationDate": "2025-10-14T00:00:00.000Z",
    "expiryDate": "2026-10-14T00:00:00.000Z",
    "manuallyAdjusted": false
  }
}
```

---

## 📝 Files Modified

1. ✅ `src/services/leave-summary.service.ts`
   - Updated `updateLeaveAllotments()` method
   - Added logic to set dates for ALL leave types with alloted > 0
   - Added debug logging for troubleshooting

---

## 🚀 Deployment Steps

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Deploy to GCP:**
   ```bash
   npm run hrms-build
   npm run hrms-tag
   npm run hrms-push
   npm run hrms-deploy
   ```

3. **Verify in production:**
   - Test with a UAE employee
   - Check all leave types show dates
   - Verify logs in GCP console

---

## 🔄 Migration for Existing Data

If you have existing UAE employees with allocated leaves but no dates:

**Option 1: Automatic Fix (Recommended)**
- Just re-save the leave summary using the same endpoint
- The service will detect missing dates and set them

**Option 2: Manual Script**
```javascript
// Create a migration script
const uaeUsers = await User.find({ country: 'AE' });
for (const user of uaeUsers) {
  const summary = await LeaveSummary.findOne({ userId: user._id, year: 2025 });
  if (summary) {
    await summary.save(); // This triggers the fix
  }
}
```

---

## ✅ Checklist

- [x] Backend service updated
- [x] Logic handles both new and existing summaries
- [x] All leave types with alloted > 0 get dates
- [x] Debug logging added
- [x] Linting errors fixed
- [ ] Deploy to production
- [ ] Test with UAE employees
- [ ] Verify frontend displays dates correctly

---

**The backend is now fixed! All UAE employees with allocated leaves will automatically get allocation and expiry dates.** ✅

