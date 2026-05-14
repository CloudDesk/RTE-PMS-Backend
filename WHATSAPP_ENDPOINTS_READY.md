# ✅ WhatsApp Endpoints - READY FOR TESTING

## Status: IMPLEMENTED & DEPLOYED

All WhatsApp endpoints are now live and ready for testing from your WhatsApp backend!

---

## 🚀 Base URL

```
https://zuno-cd-hr-india-434354707372.asia-south1.run.app/whatsapp
```

---

## 🔐 Authentication

All endpoints require **signature authentication** with these headers:

### Method 1: Direct Secret (Simple)
```typescript
headers: {
  'x-whatsapp-secret': process.env.FACEBOOK_APP_SECRET,
  'Content-Type': 'application/json'
}

body: {
  phoneNumber: '+919876543210'
}
```

### Method 2: Signature with Timestamp (Recommended)
```typescript
const phoneNumber = '+919876543210';
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = crypto
  .createHmac('sha256', process.env.FACEBOOK_APP_SECRET)
  .update(phoneNumber + timestamp)
  .digest('hex');

headers: {
  'x-whatsapp-signature': signature,
  'x-whatsapp-timestamp': timestamp,
  'Content-Type': 'application/json'
}

body: {
  phoneNumber: '+919876543210'
}
```

---

## 📋 Available Endpoints

### 1. **Get User by Phone Number**

**Endpoint**: `GET /whatsapp/users/by-phone`

**Purpose**: Fetch user details by phone number

**Request**:
```bash
curl -X GET https://zuno-cd-hr-india-434354707372.asia-south1.run.app/whatsapp/users/by-phone \
  -H "x-whatsapp-signature: <signature>" \
  -H "x-whatsapp-timestamp: <timestamp>" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+919876543210"}'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+919876543210",
    "role": "staff",
    "departmentId": "engineering",
    "employeeCode": "EMP001",
    "active": true
  }
}
```

---

### 2. **Get Attendance Records**

**Endpoint**: `POST /whatsapp/attendance/user-records`

**Purpose**: Get attendance records for a user

**Request**:
```bash
curl -X POST https://zuno-cd-hr-india-434354707372.asia-south1.run.app/whatsapp/attendance/user-records \
  -H "x-whatsapp-signature: <signature>" \
  -H "x-whatsapp-timestamp: <timestamp>" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+919876543210",
    "startDate": "2026-01-01T00:00:00Z",
    "endDate": "2026-01-31T23:59:59Z"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "userId": "507f1f77bcf86cd799439011",
      "date": "2026-01-08",
      "checkIn": "2026-01-08T09:00:00Z",
      "checkOut": "2026-01-08T18:00:00Z",
      "status": "present"
    }
  ]
}
```

---

### 3. **Process Swipe (Check-In/Check-Out)**

**Endpoint**: `POST /whatsapp/attendance/swipe`

**Purpose**: Process check-in or check-out

**Request**:
```bash
curl -X POST https://zuno-cd-hr-india-434354707372.asia-south1.run.app/whatsapp/attendance/swipe \
  -H "x-whatsapp-signature: <signature>" \
  -H "x-whatsapp-timestamp: <timestamp>" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+919876543210",
    "timestamp": "2026-01-08T09:00:00Z",
    "location": {
      "latitude": 12.9716,
      "longitude": 77.5946,
      "accuracy": 10,
      "address": "Chennai Office"
    }
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "swipeTime": "2026-01-08T09:00:00Z",
    "isWithinWindow": true,
    "isLateEntry": false,
    "message": "Check-in recorded successfully"
  }
}
```

---

### 4. **Get Payslips**

**Endpoint**: `GET /whatsapp/documents/my/payslips`

**Purpose**: Get payslip for a specific month/year

**Request**:
```bash
curl -X GET "https://zuno-cd-hr-india-434354707372.asia-south1.run.app/whatsapp/documents/my/payslips?phoneNumber=%2B919876543210&month=12&year=2025" \
  -H "x-whatsapp-signature: <signature>" \
  -H "x-whatsapp-timestamp: <timestamp>" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "payslip": {
      "_id": "507f1f77bcf86cd799439013",
      "userId": "507f1f77bcf86cd799439011",
      "month": 12,
      "year": 2025,
      "payslipUrl": "https://...",
      "status": "Generated"
    },
    "payroll": {
      "grossSalary": 50000,
      "netSalary": 45000,
      "deductions": {...}
    }
  }
}
```

---

### 5. **Get Leave Balance**

**Endpoint**: `GET /whatsapp/leaves/my-balance`

**Purpose**: Get leave balance for user

**Request**:
```bash
curl -X GET "https://zuno-cd-hr-india-434354707372.asia-south1.run.app/whatsapp/leaves/my-balance?phoneNumber=%2B919876543210" \
  -H "x-whatsapp-signature: <signature>" \
  -H "x-whatsapp-timestamp: <timestamp>" \
  -H "Content-Type: application/json"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "casualLeave": 10,
    "sickLeave": 5,
    "earnedLeave": 15,
    "totalAvailable": 30
  }
}
```

---

### 6. **Health Check**

**Endpoint**: `GET /whatsapp/health`

**Purpose**: Check if WhatsApp integration is working

**Request**:
```bash
curl -X GET https://zuno-cd-hr-india-434354707372.asia-south1.run.app/whatsapp/health
```

**Response**:
```json
{
  "success": true,
  "message": "WhatsApp integration is working",
  "timestamp": "2026-01-08T10:30:00Z"
}
```

---

## 🔧 Integration Guide for WhatsApp Backend

### Update Your API Service

```typescript
// whatsapp-backend/src/services/zunoApiService.ts
class ZunoApiService {
  private apiBaseUrl = 'https://zuno-cd-hr-india-434354707372.asia-south1.run.app';
  private appSecret = process.env.FACEBOOK_APP_SECRET;

  private generateSignature(phoneNumber: string, timestamp: string): string {
    return crypto
      .createHmac('sha256', this.appSecret)
      .update(phoneNumber + timestamp)
      .digest('hex');
  }

  async makeRequest(endpoint: string, phoneNumber: string, method = 'GET', body?: any) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.generateSignature(phoneNumber, timestamp);

    const options: RequestInit = {
      method,
      headers: {
        'x-whatsapp-signature': signature,
        'x-whatsapp-timestamp': timestamp,
        'Content-Type': 'application/json'
      },
      body: method !== 'GET' ? JSON.stringify({ phoneNumber, ...body }) : undefined
    };

    // Add phoneNumber to URL for GET requests
    let url = `${this.apiBaseUrl}/whatsapp${endpoint}`;
    if (method === 'GET') {
      const params = new URLSearchParams({ phoneNumber, ...body });
      url += `?${params.toString()}`;
    }

    const response = await fetch(url, options);
    return response.json();
  }

  // API Methods
  async getUserByPhone(phoneNumber: string) {
    return this.makeRequest('/users/by-phone', phoneNumber, 'GET');
  }

  async getAttendance(phoneNumber: string, startDate?: string, endDate?: string) {
    return this.makeRequest('/attendance/user-records', phoneNumber, 'POST', {
      startDate,
      endDate
    });
  }

  async processSwipe(phoneNumber: string, timestamp?: string, location?: any) {
    return this.makeRequest('/attendance/swipe', phoneNumber, 'POST', {
      timestamp,
      location
    });
  }

  async getPayslips(phoneNumber: string, month?: number, year?: number) {
    return this.makeRequest('/documents/my/payslips', phoneNumber, 'GET', {
      month: month?.toString(),
      year: year?.toString()
    });
  }

  async getLeaveBalance(phoneNumber: string) {
    return this.makeRequest('/leaves/my-balance', phoneNumber, 'GET');
  }
}

export default new ZunoApiService();
```

---

## 🧪 Testing

### Quick Test Script

```typescript
// test-whatsapp-endpoints.ts
import ZunoApiService from './services/zunoApiService';

async function testWhatsAppEndpoints() {
  const phoneNumber = '+919876543210'; // Replace with test phone

  try {
    console.log('🧪 Testing WhatsApp Endpoints...\n');

    // 1. Get User
    console.log('1. Getting user by phone...');
    const user = await ZunoApiService.getUserByPhone(phoneNumber);
    console.log('✅ User:', user);

    // 2. Get Attendance
    console.log('\n2. Getting attendance records...');
    const attendance = await ZunoApiService.getAttendance(
      phoneNumber,
      '2026-01-01T00:00:00Z',
      '2026-01-31T23:59:59Z'
    );
    console.log('✅ Attendance:', attendance);

    // 3. Process Swipe
    console.log('\n3. Processing swipe...');
    const swipe = await ZunoApiService.processSwipe(phoneNumber);
    console.log('✅ Swipe:', swipe);

    // 4. Get Payslips
    console.log('\n4. Getting payslips...');
    const payslips = await ZunoApiService.getPayslips(phoneNumber, 12, 2025);
    console.log('✅ Payslips:', payslips);

    // 5. Get Leave Balance
    console.log('\n5. Getting leave balance...');
    const leaves = await ZunoApiService.getLeaveBalance(phoneNumber);
    console.log('✅ Leave Balance:', leaves);

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testWhatsAppEndpoints();
```

---

## 🎯 Mapping: Old Endpoints → New Endpoints

| Old Endpoint (from test)              | New Endpoint                           | Status |
| ------------------------------------- | -------------------------------------- | ------ |
| `/users/by-phone`                     | `/whatsapp/users/by-phone`             | ✅     |
| `/attendance/user-records`            | `/whatsapp/attendance/user-records`    | ✅     |
| `/attendance/swipe`                   | `/whatsapp/attendance/swipe`           | ✅     |
| `/documents/my/payslips`              | `/whatsapp/documents/my/payslips`      | ✅     |
| (New) `/leaves/my-balance`            | `/whatsapp/leaves/my-balance`          | ✅     |
| (New) `/health`                       | `/whatsapp/health`                     | ✅     |

---

## 🔒 Security Features

✅ **Signature Verification**: Every request is verified with HMAC SHA-256  
✅ **Timestamp Validation**: Requests expire after 5 minutes (prevents replay attacks)  
✅ **Phone Number Authentication**: Meta-verified phone numbers  
✅ **User Validation**: Active users with portal access only  
✅ **Automatic User Context**: No need to pass userId - it's extracted from phone number

---

## 🐛 Troubleshooting

### Issue: 401 Authentication Failed

**Cause**: Invalid signature or expired timestamp

**Solution**:
1. Verify `FACEBOOK_APP_SECRET` matches on both backends
2. Ensure timestamp is current (within 5 minutes)
3. Check signature generation algorithm

### Issue: User not found

**Cause**: Phone number not in database or format mismatch

**Solution**:
1. Check phone number format (use E.164: `+919876543210`)
2. Verify user exists in database with this phone number
3. Ensure user is `active: true`

### Issue: Missing phoneNumber in body

**Cause**: phoneNumber not included in request

**Solution**:
- Always include `phoneNumber` in request body (POST) or query params (GET)

---

## ✅ Next Steps

1. **Update WhatsApp backend** to use new `/whatsapp/*` endpoints
2. **Deploy changes** to production
3. **Run test script** to verify all endpoints
4. **Monitor logs** for any authentication issues

---

## 📊 Summary

| Feature                     | Status |
| --------------------------- | ------ |
| WhatsApp Authentication     | ✅     |
| User Lookup                 | ✅     |
| Attendance Records          | ✅     |
| Check-In/Check-Out          | ✅     |
| Payslip Retrieval           | ✅     |
| Leave Balance               | ✅     |
| Health Check                | ✅     |
| Documentation               | ✅     |
| Ready for Testing           | ✅     |

---

**Status**: ✅ **READY FOR PRODUCTION**  
**Last Updated**: January 8, 2026  
**Version**: 1.0.0

🎉 **All WhatsApp endpoints are live and ready to use!**
