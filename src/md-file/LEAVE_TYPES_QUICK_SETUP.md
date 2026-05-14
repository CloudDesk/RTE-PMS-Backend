# Country-Specific Leave Types - Quick Setup

**Quick Reference for Database Setup**

---

## 🗄️ **MongoDB Command (Copy & Run)**

### **Step 1: Insert Leave Types**

```javascript
db.lovs.insertOne({
  name: "Leave Types",
  type: "leaveType",
  values: [
    // 🇦🇪 UAE LEAVE TYPES
    {
      label: "Sick Leave",
      value: "sick",
      description: "Medical leave",
      isActive: true,
      countries: ["AE"]
    },
    {
      label: "Annual Leave",
      value: "annual",
      description: "Annual vacation leave",
      isActive: true,
      countries: ["AE"]
    },
    {
      label: "Comp Off",
      value: "compOff",
      description: "Compensatory off",
      isActive: true,
      countries: ["AE", "IN"]
    },
    {
      label: "Maternity Leave",
      value: "maternity",
      description: "Maternity leave for female employees",
      isActive: true,
      countries: ["AE", "IN"]
    },
    
    // 🇮🇳 INDIA LEAVE TYPES
    {
      label: "Casual Leave",
      value: "casual",
      description: "Short-term casual leave",
      isActive: true,
      countries: ["IN"]
    },
    {
      label: "Earned Leave",
      value: "earned",
      description: "Accumulated earned leave",
      isActive: true,
      countries: ["IN"]
    },
    {
      label: "Privilege Leave",
      value: "privilege",
      description: "Privilege leave",
      isActive: true,
      countries: ["IN"]
    },
    {
      label: "Paternity Leave",
      value: "paternity",
      description: "Paternity leave for male employees",
      isActive: true,
      countries: ["IN"]
    }
  ]
});
```

---

## 🔌 **API Endpoint**

### **New Endpoint:**
```
GET /lovs/active/:type?country={countryCode}
```

### **Examples:**

```bash
# UAE leave types
GET /lovs/active/leaveType?country=AE

# India leave types
GET /lovs/active/leaveType?country=IN
```

---

## 💻 **Frontend API Call**

```typescript
// Get leave types for user's country
const response = await fetchApi(
  `/lovs/active/leaveType?country=${user.country}`, 
  { method: 'GET' }
);

// Response for UAE:
{
  "success": true,
  "data": [
    { "label": "Sick Leave", "value": "sick" },
    { "label": "Annual Leave", "value": "annual" },
    { "label": "Comp Off", "value": "compOff" },
    { "label": "Maternity Leave", "value": "maternity" }
  ]
}

// Response for India:
{
  "success": true,
  "data": [
    { "label": "Casual Leave", "value": "casual" },
    { "label": "Earned Leave", "value": "earned" },
    { "label": "Privilege Leave", "value": "privilege" },
    { "label": "Comp Off", "value": "compOff" },
    { "label": "Maternity Leave", "value": "maternity" },
    { "label": "Paternity Leave", "value": "paternity" }
  ]
}
```

---

## 📊 **Leave Types Summary**

| Leave Type | UAE | India |
|------------|-----|-------|
| Sick Leave | ✅ | ❌ |
| Annual Leave | ✅ | ❌ |
| Casual Leave | ❌ | ✅ |
| Earned Leave | ❌ | ✅ |
| Privilege Leave | ❌ | ✅ |
| Comp Off | ✅ | ✅ |
| Maternity Leave | ✅ | ✅ |
| Paternity Leave | ❌ | ✅ |

---

## ✅ **Quick Test**

```bash
# 1. Insert data (run MongoDB command above)

# 2. Test UAE endpoint
curl "http://localhost:5800/lovs/active/leaveType?country=AE" \
  -H "Cookie: access_token=YOUR_TOKEN"

# Expected: Only Sick, Annual, Comp Off, Maternity

# 3. Test India endpoint
curl "http://localhost:5800/lovs/active/leaveType?country=IN" \
  -H "Cookie: access_token=YOUR_TOKEN"

# Expected: Casual, Earned, Privilege, Comp Off, Maternity, Paternity
```

---

**Full Documentation:** See `COUNTRY_SPECIFIC_LEAVE_TYPES_GUIDE.md`

