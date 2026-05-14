# UAE Leave Expiry - Frontend Quick Reference

**Last Updated:** October 14, 2025

---

## 🆕 New Fields (UAE Only)

```typescript
interface LeaveCategoryDetail {
  alloted: number;
  availed: number;
  remaining: number;
  
  // 🆕 NEW
  allocationDate?: string;      // When leave was allocated
  expiryDate?: string;           // When leave expires (allocation + 1 year)
  originalExpiryDate?: string;   // Original expiry (before manual changes)
  manuallyAdjusted?: boolean;    // Was expiry manually changed?
}
```

---

## 🔌 API Quick Reference

### **POST /leave-summary/allotments**

```json
{
  "userId": "USER_ID",
  "year": 2025,
  "annual": 30,
  
  // 🆕 Optional (UAE only)
  "annualAllocationDate": "2025-10-14T00:00:00.000Z"
}
```

**Response (UAE):**
```json
{
  "annual": {
    "alloted": 30,
    "allocationDate": "2025-10-14T00:00:00.000Z",
    "expiryDate": "2026-10-14T00:00:00.000Z"
  }
}
```

**Response (India):**
```json
{
  "annual": {
    "alloted": 30
    // No expiry fields
  }
}
```

---

## 💻 React Component Example

```tsx
{userCountry === 'AE' && annual.expiryDate && (
  <div className="expiry-info">
    <p>Allocation: {format(new Date(annual.allocationDate), 'dd MMM yyyy')}</p>
    <p>Expiry: {format(new Date(annual.expiryDate), 'dd MMM yyyy')}</p>
    <p>Days Left: {differenceInDays(new Date(annual.expiryDate), new Date())}</p>
    
    {annual.manuallyAdjusted && (
      <span className="badge">Manually Adjusted</span>
    )}
  </div>
)}
```

---

## 🎨 Status Colors

| Condition | Color | Badge |
|-----------|-------|-------|
| > 30 days | 🟢 Green | Valid |
| 1-30 days | 🟠 Orange | Expiring Soon |
| Expired | 🔴 Red | Expired |

---

## ✅ Quick Checklist

- [ ] Show expiry fields ONLY for UAE (`country === 'AE'`)
- [ ] Add date picker in allocate form (UAE only)
- [ ] Display expiry status badge
- [ ] Show "Manually Adjusted" badge if `manuallyAdjusted === true`
- [ ] Handle optional fields (check if exists before rendering)

---

## 📦 Required Packages

```bash
npm install date-fns
# or
yarn add date-fns
```

---

## 🔗 Full Documentation

See: `UAE_LEAVE_EXPIRY_FRONTEND_GUIDE.md`

