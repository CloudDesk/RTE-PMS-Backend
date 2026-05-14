# UAE Leave Expiry - API Examples

**For:** Frontend/QA Testing  
**Base URL:** `http://localhost:5800` (Development) or `https://your-api-url.com` (Production)

---

## 🔐 Authentication

All requests require authentication cookie:
```
Cookie: access_token=YOUR_JWT_TOKEN
```

---

## 📝 API Examples

### **1. Allocate Leave (Simple - Uses Today)**

**Request:**
```bash
curl -X POST "http://localhost:5800/leave-summary/allotments" \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "year": 2025,
    "annual": 30,
    "sick": 15
  }'
```

**Response (UAE Employee):**
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
      "leaveRequests": [],
      "allocationDate": "2025-10-14T00:00:00.000Z",
      "expiryDate": "2026-10-14T00:00:00.000Z",
      "originalExpiryDate": "2026-10-14T00:00:00.000Z",
      "manuallyAdjusted": false
    },
    "sick": {
      "alloted": 15,
      "availed": 0,
      "remaining": 15,
      "leaveRequests": [],
      "allocationDate": "2025-10-14T00:00:00.000Z",
      "expiryDate": "2026-10-14T00:00:00.000Z",
      "originalExpiryDate": "2026-10-14T00:00:00.000Z",
      "manuallyAdjusted": false
    }
  }
}
```

---

### **2. Allocate Leave (Custom Allocation Date)**

**Request:**
```bash
curl -X POST "http://localhost:5800/leave-summary/allotments" \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "year": 2025,
    "annual": 30,
    "sick": 15,
    "annualAllocationDate": "2025-01-01T00:00:00.000Z",
    "sickAllocationDate": "2025-01-01T00:00:00.000Z"
  }'
```

**Response (UAE Employee):**
```json
{
  "success": true,
  "data": {
    "annual": {
      "alloted": 30,
      "allocationDate": "2025-01-01T00:00:00.000Z",
      "expiryDate": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

---

### **3. Get Leave Summary**

**Request:**
```bash
curl -X GET "http://localhost:5800/leave-summary/summary/507f1f77bcf86cd799439011?year=2025" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "year": 2025,
    "annual": {
      "alloted": 30,
      "availed": 5,
      "remaining": 25,
      "leaveRequests": ["req1", "req2"],
      "allocationDate": "2025-01-01T00:00:00.000Z",
      "expiryDate": "2026-01-01T00:00:00.000Z",
      "originalExpiryDate": "2026-01-01T00:00:00.000Z",
      "manuallyAdjusted": false
    },
    "sick": {
      "alloted": 15,
      "availed": 2,
      "remaining": 13,
      "leaveRequests": ["req3"],
      "allocationDate": "2025-01-01T00:00:00.000Z",
      "expiryDate": "2026-01-01T00:00:00.000Z",
      "originalExpiryDate": "2026-01-01T00:00:00.000Z",
      "manuallyAdjusted": false
    }
  }
}
```

---

### **4. Get Multiple User Summaries**

**Request:**
```bash
curl -X GET "http://localhost:5800/leave-summary/leave-summaries?userIds=507f1f77bcf86cd799439011,507f1f77bcf86cd799439012&year=2025" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

**Response:**
```json
[
  {
    "userId": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Ahmed Ali",
      "email": "ahmed@example.com"
    },
    "year": 2025,
    "annual": {
      "alloted": 30,
      "availed": 5,
      "remaining": 25,
      "allocationDate": "2025-01-01T00:00:00.000Z",
      "expiryDate": "2026-01-01T00:00:00.000Z"
    }
  },
  {
    "userId": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Rajesh Kumar",
      "email": "rajesh@example.com"
    },
    "year": 2025,
    "annual": {
      "alloted": 30,
      "availed": 3,
      "remaining": 27
      // No expiry fields (Indian employee)
    }
  }
]
```

---

## 🧪 Test Scenarios

### **Scenario 1: UAE Employee - New Allocation**
```json
POST /leave-summary/allotments
{
  "userId": "UAE_USER_ID",
  "year": 2025,
  "annual": 30
}

Expected Result:
✅ allocationDate = today
✅ expiryDate = today + 1 year
✅ manuallyAdjusted = false
```

---

### **Scenario 2: UAE Employee - Custom Allocation Date**
```json
POST /leave-summary/allotments
{
  "userId": "UAE_USER_ID",
  "year": 2025,
  "annual": 30,
  "annualAllocationDate": "2025-06-01T00:00:00.000Z"
}

Expected Result:
✅ allocationDate = 2025-06-01
✅ expiryDate = 2026-06-01
✅ manuallyAdjusted = false
```

---

### **Scenario 3: Indian Employee - Should Not Get Expiry**
```json
POST /leave-summary/allotments
{
  "userId": "INDIAN_USER_ID",
  "year": 2025,
  "annual": 30
}

Expected Result:
✅ annual.alloted = 30
❌ NO allocationDate
❌ NO expiryDate
```

---

### **Scenario 4: View Expired Leave**
```json
GET /leave-summary/summary/USER_ID?year=2024

Expected Result (if expired):
✅ expiryDate = "2025-01-01T00:00:00.000Z" (in the past)
✅ Frontend should show "Expired" badge
```

---

### **Scenario 5: View Expiring Soon Leave**
```json
GET /leave-summary/summary/USER_ID?year=2025

Expected Result (if expiring in < 30 days):
✅ expiryDate = within 30 days from today
✅ Frontend should show "Expiring Soon" badge
```

---

## 🔍 Validation Rules

### **Allocation Date:**
- Optional field
- Must be valid ISO date string
- If not provided, system uses today's date (for UAE)

### **Expiry Date:**
- Automatically calculated (allocation + 1 year)
- Cannot be set via API
- Can be manually changed via database (tracked)

### **Country Check:**
- Expiry logic ONLY applies if `user.country === 'AE'`
- Other countries: fields remain undefined

---

## ⚠️ Error Cases

### **Error 1: Invalid User ID**
```json
{
  "success": false,
  "error": {
    "message": "User not found"
  }
}
```

### **Error 2: Invalid Date Format**
```json
{
  "success": false,
  "error": {
    "message": "Invalid allocation date format"
  }
}
```

### **Error 3: Unauthorized**
```json
{
  "success": false,
  "error": {
    "message": "Authentication failed"
  }
}
```

---

## 📦 Postman Collection

Import this JSON into Postman:

```json
{
  "info": {
    "name": "UAE Leave Expiry API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Allocate Leave (Simple)",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"userId\": \"{{userId}}\",\n  \"year\": 2025,\n  \"annual\": 30,\n  \"sick\": 15\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/leave-summary/allotments",
          "host": ["{{baseUrl}}"],
          "path": ["leave-summary", "allotments"]
        }
      }
    },
    {
      "name": "Allocate Leave (With Dates)",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"userId\": \"{{userId}}\",\n  \"year\": 2025,\n  \"annual\": 30,\n  \"annualAllocationDate\": \"2025-01-01T00:00:00.000Z\"\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/leave-summary/allotments",
          "host": ["{{baseUrl}}"],
          "path": ["leave-summary", "allotments"]
        }
      }
    },
    {
      "name": "Get Leave Summary",
      "request": {
        "method": "GET",
        "url": {
          "raw": "{{baseUrl}}/leave-summary/summary/{{userId}}?year=2025",
          "host": ["{{baseUrl}}"],
          "path": ["leave-summary", "summary", "{{userId}}"],
          "query": [
            {
              "key": "year",
              "value": "2025"
            }
          ]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:5800"
    },
    {
      "key": "userId",
      "value": "507f1f77bcf86cd799439011"
    }
  ]
}
```

---

## ✅ Testing Checklist

- [ ] Test UAE employee allocation (simple)
- [ ] Test UAE employee allocation (custom date)
- [ ] Test Indian employee allocation (no expiry)
- [ ] Test get leave summary (UAE with expiry)
- [ ] Test get leave summary (India without expiry)
- [ ] Test multiple user summaries
- [ ] Verify expiry = allocation + 1 year
- [ ] Verify manuallyAdjusted flag works
- [ ] Test error cases (invalid user, invalid date)

---

**Ready to test!** 🚀

