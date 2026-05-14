# ✅ UAE Manual Expiry Date Update - Implementation Complete

**Date:** October 14, 2025  
**Feature:** Admin can manually update expiry dates for UAE employees  
**Status:** ✅ **BACKEND READY - NO CHANGES NEEDED**

---

## 🎯 **Feature Overview**

Admin can manually set/override expiry dates for UAE employee leave balances directly from the frontend.

### **How It Works:**
1. ✅ Admin updates leave allotment with custom expiry date
2. ✅ Backend saves the manual expiry date
3. ✅ Pre-save hook automatically sets `manuallyAdjusted: true`
4. ✅ Original expiry date preserved for audit trail

---

## 📤 **Frontend API Call**

### **Update with Manual Expiry Date:**

```typescript
await leavesApi.updateAllotments(
  '68da6b10d3bbedacfb6c0efc',  // userId
  2025,                          // year
  {
    annual: 20,                  // Allot 20 days
    sick: 10                     // Allot 10 days
  },
  {
    // Auto-calculated: allocation + 1 year
    annual: '2025-01-15T00:00:00.000Z'  // Allocation date
  },
  {
    // MANUAL OVERRIDE (optional)
    annual: '2026-06-15T00:00:00.000Z'  // Custom expiry (instead of 2026-01-15)
  }
);
```

---

## 🔧 **Updated Frontend Service**

```typescript
export const leavesApi = {
  /**
   * Update leave allotments with optional manual expiry dates
   */
  updateAllotments: (
    employeeId: string,
    year: number,
    allotments: Record<string, number>,
    allocationDates?: Record<string, string>,
    expiryDates?: Record<string, string>  // ✅ NEW: Manual expiry dates
  ): Promise<ApiResponse<void>> => {
    const payload: any = { 
      userId: employeeId, 
      year,
      ...allotments  // annual, sick, compOff, etc.
    };
    
    // Add allocation dates (for UAE)
    if (allocationDates) {
      Object.entries(allocationDates).forEach(([leaveType, date]) => {
        if (date) {
          payload[`${leaveType}AllocationDate`] = date;
        }
      });
    }

    // ✅ NEW: Add manual expiry dates (for UAE)
    if (expiryDates) {
      Object.entries(expiryDates).forEach(([leaveType, date]) => {
        if (date) {
          payload[`${leaveType}ExpiryDate`] = date;
        }
      });
    }

    return fetchApi(`/leave-summary/allotments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};
```

---

## 📋 **Request Examples**

### **Example 1: Auto Expiry (Default Behavior)**

```json
{
  "userId": "68da6b10d3bbedacfb6c0efc",
  "year": 2025,
  "annual": 20,
  "annualAllocationDate": "2025-01-15T00:00:00.000Z"
}
```

**Result:**
- Alloted: 20 days
- Allocation Date: 2025-01-15
- Expiry Date: **2026-01-15** (auto: allocation + 1 year)
- manuallyAdjusted: false

---

### **Example 2: Manual Expiry Override**

```json
{
  "userId": "68da6b10d3bbedacfb6c0efc",
  "year": 2025,
  "annual": 20,
  "annualAllocationDate": "2025-01-15T00:00:00.000Z",
  "annualExpiryDate": "2026-06-15T00:00:00.000Z"
}
```

**Result:**
- Alloted: 20 days
- Allocation Date: 2025-01-15
- Expiry Date: **2026-06-15** (manual override)
- Original Expiry: 2026-01-15 (audit trail)
- manuallyAdjusted: **true**

---

### **Example 3: Update Multiple Leaves with Mixed Expiry**

```json
{
  "userId": "68da6b10d3bbedacfb6c0efc",
  "year": 2025,
  "annual": 20,
  "sick": 10,
  "compOff": 5,
  "annualAllocationDate": "2025-01-15T00:00:00.000Z",
  "sickAllocationDate": "2025-01-15T00:00:00.000Z",
  "annualExpiryDate": "2026-06-15T00:00:00.000Z",  // Manual
  // sick uses auto-expiry (allocation + 1 year)
}
```

**Result:**
- Annual: Manual expiry (2026-06-15), manuallyAdjusted: true
- Sick: Auto expiry (2026-01-15), manuallyAdjusted: false
- CompOff: Auto expiry, manuallyAdjusted: false

---

## 🎨 **Frontend UI Example**

### **React Component:**

```tsx
const LeaveAllotmentForm = ({ employeeId, country }) => {
  const [formData, setFormData] = useState({
    annual: 0,
    sick: 0,
    annualAllocationDate: new Date().toISOString().split('T')[0],
    sickAllocationDate: new Date().toISOString().split('T')[0],
    // Manual expiry (optional)
    annualExpiryDate: '',
    sickExpiryDate: ''
  });

  const handleSubmit = async () => {
    const allotments = {
      annual: formData.annual,
      sick: formData.sick
    };

    const allocationDates = {
      annual: formData.annualAllocationDate,
      sick: formData.sickAllocationDate
    };

    // Only send expiry dates if manually entered
    const expiryDates: Record<string, string> = {};
    if (formData.annualExpiryDate) {
      expiryDates.annual = formData.annualExpiryDate;
    }
    if (formData.sickExpiryDate) {
      expiryDates.sick = formData.sickExpiryDate;
    }

    await leavesApi.updateAllotments(
      employeeId,
      2025,
      allotments,
      allocationDates,
      Object.keys(expiryDates).length > 0 ? expiryDates : undefined
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Annual Leave */}
      <div>
        <label>Annual Leave Days</label>
        <input 
          type="number" 
          value={formData.annual}
          onChange={(e) => setFormData({...formData, annual: +e.target.value})}
        />
      </div>

      {country === 'AE' && (
        <>
          <div>
            <label>Allocation Date</label>
            <input 
              type="date" 
              value={formData.annualAllocationDate}
              onChange={(e) => setFormData({...formData, annualAllocationDate: e.target.value})}
            />
            <small>Auto expiry: {calculateExpiry(formData.annualAllocationDate)}</small>
          </div>

          <div>
            <label>Manual Expiry Date (Optional)</label>
            <input 
              type="date" 
              value={formData.annualExpiryDate}
              onChange={(e) => setFormData({...formData, annualExpiryDate: e.target.value})}
            />
            <small>Leave blank for auto-calculation (allocation + 1 year)</small>
          </div>
        </>
      )}

      <button type="submit">Update Allotments</button>
    </form>
  );
};

// Helper function
const calculateExpiry = (allocationDate: string) => {
  const date = new Date(allocationDate);
  date.setFullYear(date.getFullYear() + 1);
  return date.toLocaleDateString();
};
```

---

## 📥 **Response**

```json
{
  "success": true,
  "data": {
    "userId": "68da6b10d3bbedacfb6c0efc",
    "year": 2025,
    "annual": {
      "alloted": 20,
      "availed": 0,
      "remaining": 20,
      "allocationDate": "2025-01-15T00:00:00.000Z",
      "expiryDate": "2026-06-15T00:00:00.000Z",        // Manual
      "originalExpiryDate": "2026-01-15T00:00:00.000Z", // Auto
      "manuallyAdjusted": true                          // Flag set
    },
    "sick": {
      "alloted": 10,
      "availed": 0,
      "remaining": 10,
      "allocationDate": "2025-01-15T00:00:00.000Z",
      "expiryDate": "2026-01-15T00:00:00.000Z",         // Auto
      "originalExpiryDate": "2026-01-15T00:00:00.000Z",
      "manuallyAdjusted": false                          // Not adjusted
    }
  }
}
```

---

## ✅ **Available Expiry Date Fields**

For UAE employees, you can manually set expiry dates for:

| Leave Type | Field Name | Example |
|------------|------------|---------|
| Annual | `annualExpiryDate` | "2026-06-15T00:00:00.000Z" |
| Sick | `sickExpiryDate` | "2026-03-01T00:00:00.000Z" |
| Other Paid | `otherPaidExpiryDate` | "2026-12-31T00:00:00.000Z" |
| Other Unpaid | `otherUnpaidExpiryDate` | "2026-12-31T00:00:00.000Z" |
| Comp Off | `compOffExpiryDate` | "2026-12-31T00:00:00.000Z" |
| Maternity | `maternityExpiryDate` | "2026-12-31T00:00:00.000Z" |

---

## 🔄 **How Backend Handles It**

### **Pre-Save Hook (Automatic):**

1. **If allocation date changes:**
   - Auto-calculates expiry = allocation + 1 year
   - Sets originalExpiryDate = auto-calculated date
   - Sets manuallyAdjusted = false

2. **If expiry date manually set:**
   - Uses the manual expiry date
   - Keeps originalExpiryDate (for comparison)
   - Sets manuallyAdjusted = true

3. **Audit Trail:**
   - originalExpiryDate shows what it should have been
   - expiryDate shows actual (manual or auto)
   - manuallyAdjusted flag indicates if changed

---

## 📊 **Display in Frontend**

```tsx
{summary.annual.expiryDate && (
  <div>
    <span>Expiry: {new Date(summary.annual.expiryDate).toLocaleDateString()}</span>
    {summary.annual.manuallyAdjusted && (
      <span className="badge">Manually Adjusted</span>
    )}
    {summary.annual.originalExpiryDate && summary.annual.manuallyAdjusted && (
      <small>Original: {new Date(summary.annual.originalExpiryDate).toLocaleDateString()}</small>
    )}
  </div>
)}
```

---

## ✅ **Backend Implementation Status**

| Component | Status | Notes |
|-----------|--------|-------|
| Schema | ✅ Complete | Added 6 expiry date fields |
| Route Handler | ✅ Complete | Extracts expiry dates from request |
| Service Method | ✅ Complete | Sets manual expiry dates |
| Pre-Save Hook | ✅ Existing | Auto-sets manuallyAdjusted flag |
| Validation | ✅ Complete | All fields optional |

---

## 🧪 **Test Manual Expiry**

```bash
curl -X POST "http://localhost:5800/leave-summary/allotments" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "68da6b10d3bbedacfb6c0efc",
    "year": 2025,
    "annual": 20,
    "annualAllocationDate": "2025-01-15T00:00:00.000Z",
    "annualExpiryDate": "2026-06-15T00:00:00.000Z"
  }'

# Expected: 200 OK with manuallyAdjusted: true
```

---

## ✅ **Summary**

✅ **Backend is 100% ready** - No changes needed  
✅ **API accepts manual expiry dates** - All 6 leave types  
✅ **Pre-save hook handles it automatically** - Sets manuallyAdjusted flag  
✅ **Audit trail maintained** - Original expiry preserved  
✅ **Frontend can update directly** - Just add expiry date fields to payload  

---

## 🎨 **Frontend Implementation**

Just update your `updateAllotments` call to include expiry dates:

```typescript
// Add third parameter for expiry dates
await leavesApi.updateAllotments(
  employeeId,
  year,
  { annual: 20, sick: 10 },           // Allotments
  { annual: '2025-01-15' },           // Allocation dates
  { annual: '2026-06-15' }            // ✅ Manual expiry dates
);
```

**That's it! Backend handles everything automatically!** 🚀

---

**Status:** ✅ Complete - Frontend can update expiry dates directly!

