# UAE Leave Expiry - Quick Start Guide

**For:** Admin/HR Users  
**Date:** October 14, 2025

---

## 🚀 Quick Start (5 Minutes)

### **What's New?**
For **UAE employees**, when you allocate leave, the system now automatically:
- Sets **allocation date** = today (or your specified date)
- Sets **expiry date** = allocation date + 1 year
- Tracks if you manually change the expiry date

---

## 📝 How to Use

### **Option 1: Allocate Leave (Simple - Uses Today's Date)**

```bash
POST /leave-summary/allotments
Content-Type: application/json

{
  "userId": "USER_ID_HERE",
  "year": 2025,
  "annual": 30,
  "sick": 15
}
```

✅ **Result for UAE Employee:**
- Allocation Date: Today
- Expiry Date: Today + 1 year (automatic!)

---

### **Option 2: Allocate Leave (Custom Allocation Date)**

```bash
POST /leave-summary/allotments
Content-Type: application/json

{
  "userId": "USER_ID_HERE",
  "year": 2025,
  "annual": 30,
  "annualAllocationDate": "2025-01-01T00:00:00.000Z"
}
```

✅ **Result:**
- Allocation Date: 2025-01-01
- Expiry Date: 2026-01-01 (automatic!)

---

### **Option 3: View Leave Summary with Expiry Dates**

```bash
GET /leave-summary/summary/USER_ID?year=2025
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "USER_ID",
    "year": 2025,
    "annual": {
      "alloted": 30,
      "availed": 0,
      "remaining": 30,
      "allocationDate": "2025-10-14T00:00:00.000Z",
      "expiryDate": "2026-10-14T00:00:00.000Z",
      "originalExpiryDate": "2026-10-14T00:00:00.000Z",
      "manuallyAdjusted": false
    }
  }
}
```

---

## 🔧 Manual Expiry Adjustment

### **If you need to extend/change expiry date:**

1. **Fetch the leave summary**
```javascript
const summary = await LeaveSummary.findOne({ 
  userId: "USER_ID", 
  year: 2025 
});
```

2. **Change the expiry date**
```javascript
summary.annual.expiryDate = new Date('2026-12-31');
await summary.save();
```

3. **What happens:**
```javascript
{
  allocationDate: "2025-10-14",
  expiryDate: "2026-12-31",          // your new date
  originalExpiryDate: "2026-10-14", // preserved for audit
  manuallyAdjusted: true             // flagged
}
```

---

## 📊 Real-World Examples

### **Example 1: New Employee Joins in October**
```
Employee: Ahmed (UAE)
Joining: 2025-10-14
Annual Leave: 30 days

API Call:
{
  "userId": "ahmed_id",
  "year": 2025,
  "annual": 30,
  "annualAllocationDate": "2025-10-14"
}

Result:
✅ Allocation: 2025-10-14
✅ Expiry: 2026-10-14 (automatic)
✅ Ahmed must use leave before Oct 14, 2026
```

---

### **Example 2: Mid-Year Leave Adjustment**
```
Employee: Fatima (UAE)
Original Allocation: 2025-01-01 → Expiry: 2026-01-01
Business Need: Extend to end of year

Steps:
1. Fetch summary
2. Change expiryDate to 2026-12-31
3. Save

Result:
✅ Expiry: 2026-12-31 (extended)
✅ Original: 2026-01-01 (preserved)
✅ Flag: manuallyAdjusted = true
✅ Audit trail maintained
```

---

## ❓ FAQ

**Q: Does this affect Indian employees?**  
A: No, only UAE employees (country = 'AE') get automatic expiry dates.

**Q: What if I don't provide allocation date?**  
A: System uses today's date automatically.

**Q: Can I override the expiry date?**  
A: Yes, just update it. System tracks it's manually adjusted.

**Q: Does this affect existing leave data?**  
A: No, only new allocations after deployment get these fields.

**Q: How do I see the original expiry after manual change?**  
A: Check the `originalExpiryDate` field in the leave summary.

---

## 🎯 Key Benefits

| Feature | Benefit |
|---------|---------|
| **Automatic Calculation** | No manual date calculation needed |
| **UAE Compliance** | Enforces 12-month validity rule |
| **Audit Trail** | Tracks all manual changes |
| **Flexibility** | Can override when needed |
| **No Data Loss** | Preserves original dates |

---

## 🔍 Console Logs (What You'll See)

```
✅ [UAE Leave Expiry] annual - Allocation: 2025-10-14, Auto Expiry: 2026-10-14
⚠️ [UAE Leave Expiry] annual - Expiry manually changed from 2026-10-14 to 2026-12-31
```

---

## 🆘 Need Help?

**Issue:** Expiry not calculated  
**Solution:** Check user's country field is 'AE'

**Issue:** Wrong expiry date  
**Solution:** Verify allocation date is correct

**Issue:** Can't see date fields  
**Solution:** API response includes them automatically

---

## ✅ Quick Checklist

- [ ] Understand allocation date = when leave granted
- [ ] Understand expiry = allocation + 1 year (UAE only)
- [ ] Know how to view expiry dates via API
- [ ] Know how to manually adjust if needed
- [ ] Understand audit trail is maintained

---

**Ready to Use!** 🎉

For detailed technical information, see: `UAE_LEAVE_EXPIRY_IMPLEMENTATION.md`

