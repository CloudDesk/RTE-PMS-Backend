# UAE Leave Expiry Date Implementation

**Last Updated:** October 14, 2025  
**Status:** ✅ Implemented

---

## 📋 Overview

This document describes the implementation of **automatic leave expiry date calculation** for UAE employees, in compliance with UAE labor law requirements that mandate leave must be taken within 12 months of allocation.

---

## 🎯 Business Requirement

### **For UAE Location Employees:**

1. **When leave is allocated** → System automatically sets:
   - `allocationDate` = Today (or specified date)
   - `expiryDate` = allocationDate + 1 year (automatic)

2. **If expiry date is manually changed** → System:
   - Tracks the manual change (`manuallyAdjusted` = true)
   - Preserves original expiry date for audit trail (`originalExpiryDate`)
   - Logs the change in console

3. **Purpose:**
   - ✅ UAE labor law compliance
   - ✅ Prevent leave liability buildup
   - ✅ Audit trail for manual adjustments
   - ✅ Automatic calculation reduces HR errors

---

## 🏗️ Technical Implementation

### **1. Database Schema Changes**

#### **Model: LeaveSummary**
Location: `src/models/leave-summary.model.ts`

```typescript
interface ILeaveCategoryDetail {
  alloted: number;
  availed: number;
  remaining: number;
  leaveRequests: Types.ObjectId[];
  
  // UAE-specific fields
  allocationDate?: Date;      // When leave was allocated
  expiryDate?: Date;           // When leave expires (auto: allocation + 1 year)
  originalExpiryDate?: Date;   // Original expiry before manual changes
  manuallyAdjusted?: boolean;  // Flag indicating manual change
}
```

**Applies to all leave categories:**
- `annual`
- `sick`
- `compOff`
- `otherPaid`
- `otherUnpaid`
- `lossOfPay`

---

### **2. Automatic Expiry Calculation Logic**

#### **Pre-save Hook (Model Level)**
Location: `src/models/leave-summary.model.ts`

```typescript
leaveSummarySchema.pre('save', async function() {
  // Only for UAE users (country === 'AE')
  
  // SCENARIO 1: New allocation date set
  if (isModified('annual.allocationDate')) {
    expiryDate = allocationDate + 1 year
    originalExpiryDate = expiryDate
    manuallyAdjusted = false
  }
  
  // SCENARIO 2: Expiry manually changed
  if (isModified('annual.expiryDate') && 
      expiryDate !== originalExpiryDate) {
    manuallyAdjusted = true
    // Log the change
  }
  
  // SCENARIO 3: Expiry set but no allocation
  if (expiryDate && !allocationDate) {
    allocationDate = expiryDate - 1 year
  }
});
```

---

### **3. Service Layer Updates**

#### **LeaveSummaryService**
Location: `src/services/leave-summary.service.ts`

**Method:** `updateLeaveAllotments()`

```typescript
async updateLeaveAllotments(
  userId: Types.ObjectId,
  year: number,
  allotments: {
    annual?: number;
    // ... other leave types
    
    // UAE-specific allocation dates
    annualAllocationDate?: Date;
    sickAllocationDate?: Date;
    // ... other allocation dates
  }
): Promise<ILeaveSummary>
```

**Behavior:**
- For UAE users (`country === 'AE'`):
  - Sets allocation dates when leave is allotted
  - If no date provided, uses today's date
  - Pre-save hook automatically calculates expiry

---

### **4. API Routes**

#### **POST /leave-summary/allotments**
Location: `src/routes/leave-summary.routes.ts`

**Request Body:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "year": 2025,
  "annual": 30,
  "sick": 15,
  
  // Optional: UAE allocation dates
  "annualAllocationDate": "2025-01-01T00:00:00.000Z",
  "sickAllocationDate": "2025-01-01T00:00:00.000Z"
}
```

**Response (UAE user):**
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "year": 2025,
    "annual": {
      "alloted": 30,
      "availed": 0,
      "remaining": 30,
      "allocationDate": "2025-01-01T00:00:00.000Z",
      "expiryDate": "2026-01-01T00:00:00.000Z",
      "originalExpiryDate": "2026-01-01T00:00:00.000Z",
      "manuallyAdjusted": false
    }
  }
}
```

---

## 📊 Usage Examples

### **Example 1: Allocate Leave to UAE Employee**

```bash
curl -X POST "https://api.yourcompany.com/leave-summary/allotments" \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "year": 2025,
    "annual": 30,
    "annualAllocationDate": "2025-10-14T00:00:00.000Z"
  }'
```

**Result:**
- Allocation Date: 2025-10-14
- **Expiry Date: 2026-10-14** (automatically calculated)

---

### **Example 2: Manual Expiry Adjustment**

**Step 1:** Fetch current leave summary
```javascript
const summary = await LeaveSummary.findOne({ userId, year: 2025 });
// annual.expiryDate = 2026-10-14
```

**Step 2:** Manually change expiry date
```javascript
summary.annual.expiryDate = new Date('2026-12-31');
await summary.save();
```

**Result:**
```javascript
{
  allocationDate: "2025-10-14",
  expiryDate: "2026-12-31",           // manually changed
  originalExpiryDate: "2026-10-14",  // preserved
  manuallyAdjusted: true              // flagged
}
```

**Console Log:**
```
⚠️ [UAE Leave Expiry] annual - Expiry manually changed from 2026-10-14 to 2026-12-31
📝 [UAE Leave Expiry] annual - Manual adjustment recorded. Original allocation: 2025-10-14
```

---

## 🛠️ Utility Functions

Location: `src/utilis/uae-leave-expiry.util.ts`

### **Available Functions:**

```typescript
// Calculate expiry from allocation
calculateUAELeaveExpiry(allocationDate: Date): Date

// Calculate allocation from expiry (backwards)
calculateAllocationFromExpiry(expiryDate: Date): Date

// Check if leave expired
isLeaveExpired(expiryDate: Date): boolean

// Days until expiry
getDaysUntilExpiry(expiryDate: Date): number

// Check if expiry approaching (within 30 days)
isExpiryApproaching(expiryDate: Date, warningDays = 30): boolean

// Get comprehensive expiry summary
getLeaveExpirySummary(allocation, expiry): UAELeaveExpirySummary
```

---

## 🔄 Workflow Diagram

```
┌──────────────────────────────────────────────────────┐
│  HR/Admin Allocates Leave to UAE Employee           │
│  (via API or Admin Portal)                           │
└─────────────────┬────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  Allocation Date    │
        │  2025-10-14         │
        └──────────┬──────────┘
                   │
                   │  Pre-save Hook (Mongoose)
                   ▼
        ┌─────────────────────┐
        │  Auto Calculate:    │
        │  Expiry = +1 Year   │
        │  = 2026-10-14       │
        └──────────┬──────────┘
                   │
                   ▼
        ┌─────────────────────────────┐
        │  Save to Database:          │
        │  - allocationDate           │
        │  - expiryDate               │
        │  - originalExpiryDate       │
        │  - manuallyAdjusted: false  │
        └─────────────────────────────┘

IF MANUAL CHANGE:
        ┌─────────────────────────┐
        │  Admin Updates Expiry   │
        │  to 2026-12-31          │
        └───────────┬─────────────┘
                    │
                    │  Pre-save Hook Detects Change
                    ▼
        ┌──────────────────────────────┐
        │  Update:                     │
        │  - expiryDate: 2026-12-31    │
        │  - originalExpiryDate:       │
        │    2026-10-14 (preserved)    │
        │  - manuallyAdjusted: true    │
        │  + Log to console            │
        └──────────────────────────────┘
```

---

## 🧪 Testing

### **Test Case 1: New UAE Employee Leave Allocation**
```typescript
// Given: UAE employee with no leave summary
const user = { country: 'AE' };

// When: Allocate annual leave
await leaveSummaryService.updateLeaveAllotments(userId, 2025, {
  annual: 30,
  annualAllocationDate: new Date('2025-10-14')
});

// Then:
// - allocationDate = 2025-10-14
// - expiryDate = 2026-10-14 (automatic)
// - manuallyAdjusted = false
```

### **Test Case 2: Manual Expiry Adjustment**
```typescript
// Given: Existing leave summary with expiry
const summary = await LeaveSummary.findOne({ userId, year: 2025 });

// When: Admin changes expiry date
summary.annual.expiryDate = new Date('2026-12-31');
await summary.save();

// Then:
// - expiryDate = 2026-12-31
// - originalExpiryDate = 2026-10-14 (preserved)
// - manuallyAdjusted = true
```

### **Test Case 3: Indian Employee (No Expiry Logic)**
```typescript
// Given: Indian employee
const user = { country: 'IN' };

// When: Allocate leave
await leaveSummaryService.updateLeaveAllotments(userId, 2025, {
  annual: 30
});

// Then: No allocation/expiry dates set (not UAE)
```

---

## 📈 Benefits

| Benefit | Description |
|---------|-------------|
| **Compliance** | Automatic enforcement of UAE labor law (12-month validity) |
| **Audit Trail** | Complete tracking of manual adjustments |
| **Automation** | Reduces manual calculation errors |
| **Transparency** | Clear visibility of leave expiry dates |
| **Flexibility** | Allows manual override when needed |
| **Notification Ready** | Can trigger alerts for approaching expiry |

---

## 🚀 Deployment

### **Required Steps:**

1. ✅ **Database Migration:** Not required - fields are optional
2. ✅ **Code Deployment:** Deploy updated code to GCP Cloud Run
3. ✅ **Testing:** Test with UAE employee accounts
4. ✅ **Documentation:** Update user manuals

### **Rollback Plan:**

- Fields are optional, so no data migration needed
- If issues occur, simply revert code deployment
- Existing leave summaries unaffected

---

## 🔍 Monitoring & Alerts

### **Console Logs:**
```
✅ [UAE Leave Expiry] annual - Allocation: 2025-10-14, Auto Expiry: 2026-10-14
⚠️ [UAE Leave Expiry] annual - Expiry manually changed from 2026-10-14 to 2026-12-31
📝 [UAE Leave Expiry] annual - Manual adjustment recorded
🔄 [UAE Leave Expiry] annual - Calculated allocation date from expiry
❌ [UAE Leave Expiry] Error in pre-save hook: [error details]
```

### **Future Enhancement: Email Alerts**
Could trigger notifications when:
- Leave expiry approaching (30 days)
- Leave expired but not taken
- Manual adjustment made

---

## 📝 Related Files

| File | Purpose |
|------|---------|
| `src/models/leave-summary.model.ts` | Schema + pre-save hooks |
| `src/services/leave-summary.service.ts` | Business logic |
| `src/routes/leave-summary.routes.ts` | API endpoints |
| `src/utilis/uae-leave-expiry.util.ts` | Utility functions |

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Expiry not calculated | Ensure user `country` field is 'AE' |
| Dates not saving | Check allocation date is provided |
| Manual flag not set | Verify expiry changed after initial save |
| Wrong expiry date | Check allocation date is correct |

---

## ✅ Checklist

- [x] Model updated with new fields
- [x] Pre-save hooks implemented
- [x] Service layer updated
- [x] API routes updated
- [x] Utility functions created
- [x] Documentation written
- [x] No linter errors
- [ ] Integration testing
- [ ] User acceptance testing
- [ ] Production deployment

---

**For Questions:** Contact Development Team  
**Last Reviewed:** October 14, 2025

