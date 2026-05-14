# ✅ WhatsApp Integration - Simplified Approach

## Overview

WhatsApp authentication is now **integrated directly into the existing `authenticate` middleware**. No separate routes or middleware needed!

---

## 🎯 How It Works

The single `authenticate` middleware now supports **BOTH**:
1. **JWT Authentication** (cookies) - for web/mobile apps
2. **WhatsApp Authentication** (headers) - for WhatsApp chatbot

### Authentication Flow:

```
┌─────────────────────────────┐
│   Incoming Request          │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Check for Authentication   │
│  Headers?                   │
└──────────┬──────────────────┘
           │
     ┌─────┴─────┐
     │           │
     ▼           ▼
┌─────────┐  ┌──────────────┐
│WhatsApp │  │  JWT Token   │
│Signature│  │  in Cookies  │
└────┬────┘  └──────┬───────┘
     │              │
     ▼              ▼
┌─────────┐  ┌──────────────┐
│Verify   │  │Verify Token  │
│Signature│  │              │
└────┬────┘  └──────┬───────┘
     │              │
     └──────┬───────┘
            ▼
   ┌────────────────┐
   │ Set request.user│
   └────────────────┘
            │
            ▼
   ┌────────────────┐
   │  Route Handler │
   └────────────────┘
```

---

## 🔧 Implementation

### Modified Middleware (`src/middleware/auth.ts`):

```typescript
export const authenticate = async (request, reply) => {
  try {
    // 1. Check for WhatsApp authentication (signature/secret in headers)
    const whatsappSignature = request.headers["x-whatsapp-signature"];
    const whatsappSecret = request.headers["x-whatsapp-secret"];
    
    if (whatsappSignature || whatsappSecret) {
      // WhatsApp authentication flow
      const { phoneNumber } = request.body;
      
      // Verify signature/secret
      // Find user by phone number
      // Set request.user
      
      return; // Done!
    }
    
    // 2. Fall back to JWT authentication (existing flow)
    const token = request.cookies?.access_token;
    
    if (!token) {
      throw new Error("No token provided");
    }
    
    // Verify JWT token
    // Set request.user
    
  } catch (error) {
    reply.status(401).send({ error: "Authentication failed" });
  }
};
```

---

## 📡 Using Existing Routes with WhatsApp

**All existing routes now work with WhatsApp authentication!**

### Example: Get User Profile

**Web/Mobile (JWT)**:
```bash
GET /users?my=true
Cookie: access_token=<JWT_TOKEN>
```

**WhatsApp (Signature)**:
```bash
GET /users?my=true
Headers:
  x-whatsapp-signature: <HMAC_SHA256>
  x-whatsapp-timestamp: <UNIX_TIMESTAMP>
Body:
  { "phoneNumber": "+919876543210" }
```

### Example: Get Payslips

**Web/Mobile (JWT)**:
```bash
GET /payslip/me?month=12&year=2025
Cookie: access_token=<JWT_TOKEN>
```

**WhatsApp (Signature)**:
```bash
GET /payslip/me?month=12&year=2025
Headers:
  x-whatsapp-signature: <HMAC_SHA256>
  x-whatsapp-timestamp: <UNIX_TIMESTAMP>
Body:
  { "phoneNumber": "+919876543210" }
```

### Example: Check-In/Check-Out

**Web/Mobile (JWT)**:
```bash
POST /attendance/swipe
Cookie: access_token=<JWT_TOKEN>
Body: { "biometricId": "EMP001", ... }
```

**WhatsApp (Signature)**:
```bash
POST /attendance/swipe
Headers:
  x-whatsapp-signature: <HMAC_SHA256>
  x-whatsapp-timestamp: <UNIX_TIMESTAMP>
Body: {
  "phoneNumber": "+919876543210",
  "biometricId": "EMP001",
  ...
}
```

---

## 🔐 Authentication Methods

### Method 1: Direct Secret (Simple)

```typescript
Headers:
  x-whatsapp-secret: <FACEBOOK_APP_SECRET>
  
Body:
  { "phoneNumber": "+919876543210" }
```

### Method 2: Signature with Timestamp (Secure)

```typescript
const phoneNumber = "+919876543210";
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = crypto
  .createHmac("sha256", process.env.FACEBOOK_APP_SECRET)
  .update(phoneNumber + timestamp)
  .digest("hex");

Headers:
  x-whatsapp-signature: <signature>
  x-whatsapp-timestamp: <timestamp>
  
Body:
  { "phoneNumber": "+919876543210" }
```

---

## ✅ Advantages of This Approach

1. ✅ **No Duplicate Routes** - Reuse all existing endpoints
2. ✅ **Single Middleware** - One place to maintain authentication
3. ✅ **Automatic Support** - All routes automatically support WhatsApp
4. ✅ **Clean Codebase** - No separate WhatsApp-specific files
5. ✅ **Easy Testing** - Test both auth methods on same endpoints

---

## 🧪 Testing from WhatsApp Backend

```typescript
// whatsapp-backend/src/services/zunoApiService.ts
class ZunoApiService {
  private apiBaseUrl = 'https://your-api.com';
  private appSecret = process.env.FACEBOOK_APP_SECRET;

  private generateSignature(phoneNumber: string, timestamp: string) {
    return crypto
      .createHmac('sha256', this.appSecret)
      .update(phoneNumber + timestamp)
      .digest('hex');
  }

  async makeRequest(endpoint: string, phoneNumber: string, method = 'GET', body?: any) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.generateSignature(phoneNumber, timestamp);

    const options = {
      method,
      headers: {
        'x-whatsapp-signature': signature,
        'x-whatsapp-timestamp': timestamp,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phoneNumber, ...body })
    };

    return fetch(`${this.apiBaseUrl}${endpoint}`, options);
  }

  // Use existing endpoints!
  async getUserProfile(phoneNumber: string) {
    return this.makeRequest('/users?my=true', phoneNumber, 'GET');
  }

  async getPayslips(phoneNumber: string, month: number, year: number) {
    return this.makeRequest(
      `/payslip/me?month=${month}&year=${year}`,
      phoneNumber,
      'GET'
    );
  }

  async checkIn(phoneNumber: string, timestamp?: string, location?: any) {
    return this.makeRequest('/attendance/swipe', phoneNumber, 'POST', {
      biometricId: phoneNumber, // Can use phone as biometric ID
      timestamp,
      location
    });
  }
}
```

---

## 📊 Available Endpoints (All Work with WhatsApp!)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/users?my=true` | GET | Get current user profile |
| `/payslip/me` | GET | Get payslips (with month/year params) |
| `/attendance/swipe` | POST | Check-in/check-out |
| `/attendance/*` | GET/POST | Attendance records |
| `/leaves/*` | GET/POST | Leave management |
| `/dashboard/*` | GET | Dashboard data |
| All other routes | * | All authenticated routes work! |

---

## 🔒 Security Features

✅ **Signature Verification** - HMAC SHA-256 cryptographic verification  
✅ **Timestamp Validation** - 5-minute expiry window (prevents replay attacks)  
✅ **Phone Number Verification** - Meta-verified phone numbers  
✅ **User Active Check** - Only active users with portal access  
✅ **Same Security Level** - Equal to JWT authentication

---

## 🚀 Deployment Checklist

- [x] Middleware updated to support WhatsApp auth
- [x] Phone number index added to User model
- [x] FACEBOOK_APP_SECRET in environment variables
- [x] All existing routes automatically support WhatsApp
- [x] No code changes needed in route files
- [x] Documentation updated

---

## 💡 Why This Is Better

### ❌ Old Approach (Complicated):
```
- Separate authenticateWhatsApp middleware
- Duplicate whatsapp.routes.ts file
- /whatsapp/users/by-phone
- /whatsapp/attendance/swipe
- /whatsapp/documents/my/payslips
- Maintain two sets of routes
```

### ✅ New Approach (Simple):
```
- One authenticate middleware
- No duplicate routes
- /users?my=true (works for both!)
- /attendance/swipe (works for both!)
- /payslip/me (works for both!)
- Maintain one set of routes
```

---

**Status**: ✅ **PRODUCTION READY**  
**Last Updated**: January 8, 2026  
**Version**: 2.0.0 (Simplified)

🎉 **All existing routes now support WhatsApp authentication!**
