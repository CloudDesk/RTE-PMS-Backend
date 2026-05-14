# LEAVE ENCASHMENT INVESTIGATION

**Date**: February 7, 2026  
**Time**: 16:20 IST

---

## ✅ BACKEND CODE IS CORRECT!

After reviewing the code, I found that **BOTH endpoints use the SAME formula**:

### **`/initialize` Endpoint** (Lines 519-523):
```typescript
const basicPerc = structure.fixedEarnings?.basicPercentage ?? 0;
const daPerc = Number(structure.fixedEarnings?.daPercentage) || 0;
const basic = monthlyGross * (basicPerc / 100);
const da = daPerc === 0 ? 0 : basic * (daPerc / 100);
encashPerDay = (basic + da) / 30;  // ✅ CORRECT
```

### **`/save` Endpoint** (Lines 875-878):
```typescript
const basicPerc = structure.fixedEarnings?.basicPercentage ?? 0;
const daPerc = Number(structure.fixedEarnings?.daPercentage) || 0;
const basic = monthlyGross * (basicPerc / 100);
const da = daPerc === 0 ? 0 : basic * (daPerc / 100);
safePerDayRate = (basic + da) / 30;  // ✅ CORRECT
```

**Both use the EXACT SAME formula!** ✅

---

## 🔍 SO WHY THE DIFFERENCE?

If both endpoints use the same formula, why is `/initialize` returning ₹2,500 and `/save` returning ₹2,000?

### **Possible Reasons**:

1. **Different Salary Structure Data**
   - `/initialize` might be fetching a different salary assignment
   - `/save` might be using updated salary data

2. **Different Employee**
   - Testing with different employees
   - Different salary structures

3. **Caching Issue**
   - Frontend caching old response
   - Browser cache not cleared

4. **Different Basic Percentage**
   - `/initialize`: Basic% = 50% → Basic = ₹75,000 → Per day = ₹2,500
   - `/save`: Basic% = 40% → Basic = ₹60,000 → Per day = ₹2,000

---

## 🧪 VERIFICATION NEEDED

### **Test 1: Check Actual API Response**

Call `/initialize/:employeeId` and check:
```bash
curl http://localhost:5173/api/final-settlement/initialize/69735bcc77ea11ab2d790594
```

Expected response:
```json
{
  "leaveBalance": [{
    "leaveType": "AL",
    "balance": 7,
    "encashDays": 7,
    "perDayRate": ????,  // ← What is this value?
    "encashAmount": ????
  }]
}
```

### **Test 2: Check Salary Structure**

Verify the employee's salary structure:
- Monthly Gross: ?
- Basic %: ?
- DA %: ?
- Calculated Basic: ?
- Calculated DA: ?
- Per Day Rate: (Basic + DA) / 30 = ?

---

## 💡 HYPOTHESIS

The issue might be:

1. **Frontend is NOT calling `/initialize`**
   - Frontend might be calculating the initial value itself
   - Or using a cached value

2. **Different Salary Structures**
   - Employee has multiple salary assignments
   - `/initialize` picks one, `/save` picks another

3. **Leave Type Mismatch**
   - `/initialize` returns `leaveType: "AL"`
   - Frontend expects `leaveType: "Annual Leave"`
   - Frontend might be using a default rate for unknown leave types

---

## 🎯 NEXT STEPS

1. **Add Console Logging** to `/initialize` endpoint:
   ```typescript
   console.log("=== INITIALIZE LEAVE ENCASHMENT ===");
   console.log("Monthly Gross:", monthlyGross);
   console.log("Basic %:", basicPerc);
   console.log("DA %:", daPerc);
   console.log("Basic:", basic);
   console.log("DA:", da);
   console.log("Per Day Rate:", encashPerDay);
   console.log("===================================");
   ```

2. **Check Frontend Network Tab**
   - Verify `/initialize` is being called
   - Check the actual response values
   - Compare with `/save` response

3. **Check Browser Console**
   - Look for any frontend calculations
   - Check if values are being overridden

---

## 📊 COMPARISON TABLE

| Endpoint | Formula | Expected Result | Actual Result |
|----------|---------|-----------------|---------------|
| `/initialize` | `(basic + da) / 30` | ₹2,000 | ₹2,500 ❌ |
| `/save` | `(basic + da) / 30` | ₹2,000 | ₹2,000 ✅ |

**Both use the same formula, so the difference must be in the INPUT DATA, not the calculation logic!**

---

## ✅ CONCLUSION

The backend code is **ALREADY CORRECT**. The issue is likely:

1. Different salary structure data being used
2. Frontend not calling `/initialize` 
3. Frontend calculating its own initial value
4. Caching issue

**Recommendation**: Add console logging to both endpoints and compare the input data (monthlyGross, basicPerc, daPerc) to find where the difference comes from.

---

**Status**: ⚠️ **NEEDS INVESTIGATION**  
**Priority**: 🟡 **MEDIUM** (Backend code is correct, issue is in data flow)
