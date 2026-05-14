# WhatsApp Authentication Implementation

## Overview

This document describes the WhatsApp authentication implementation for the Zuno HR India API. The implementation allows a separate WhatsApp backend to authenticate users via phone number without requiring JWT tokens, enabling seamless chatbot integration.

## Architecture

```
┌─────────────────┐
│  Meta/WhatsApp  │
└────────┬────────┘
         │ Webhook
         ▼
┌─────────────────────────┐
│ Node.js WhatsApp Backend│
│  - Verifies Meta signature
│  - Extracts phone number
└────────┬────────────────┘
         │ HTTP Request
         │ (phoneNumber + auth headers)
         ▼
┌─────────────────────────────────┐
│   Zuno HR India API Backend     │
│  - authenticateWhatsApp middleware
│  - Verifies FACEBOOK_APP_SECRET
│  - Fetches user by phone number
│  - Sets request.user context
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Existing HR Routes     │
│  (Payslip, Attendance,  │
│   Leave, etc.)          │
└─────────────────────────┘
```

## Implementation Details

### 1. Middleware: `authenticateWhatsApp`

**Location**: `src/middleware/auth.ts`

**Purpose**: Authenticates requests from the WhatsApp backend using phone number and signature verification.

**Authentication Methods**:

#### Method 1: Direct Secret Comparison (Simpler)

```typescript
Headers:
  x-whatsapp-secret: <FACEBOOK_APP_SECRET>

Body:
  phoneNumber: "+919876543210"
```

#### Method 2: Signature with Timestamp (More Secure)

```typescript
Headers:
  x-whatsapp-signature: <HMAC_SHA256_signature>
  x-whatsapp-timestamp: <unix_timestamp>

Body:
  phoneNumber: "+919876543210"
```

**Signature Calculation** (for Method 2):

```javascript
const signature = crypto
  .createHmac("sha256", FACEBOOK_APP_SECRET)
  .update(phoneNumber + timestamp)
  .digest("hex");
```

**Security Features**:

- Timestamp validation (5-minute expiry window)
- Active user check
- Portal access verification
- Phone number normalization

### 2. Database Changes

**User Model**: Added phone number index for faster lookups

```typescript
userSchema.index({ phone: 1 }, { sparse: true }); // For WhatsApp authentication
```

**Query**:

```typescript
const user = await User.findOne({
  phone: normalizedPhone,
  active: true,
});
```

### 3. Environment Variables

**Required**:

```bash
FACEBOOK_APP_SECRET=your_facebook_app_secret_here
```

**Where to find**:

1. Go to Meta Developer Console: https://developers.facebook.com
2. Select your WhatsApp app
3. Navigate to: **Settings → Basic**
4. Copy **"App Secret"** value

## Usage

### From WhatsApp Backend

**Example Request** (Method 1 - Simple):

```typescript
// Node.js WhatsApp Backend
const response = await fetch("https://your-api.com/api/v1/payslip/me", {
  method: "GET",
  headers: {
    "x-whatsapp-secret": process.env.FACEBOOK_APP_SECRET,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    phoneNumber: "+919876543210",
  }),
});
```

**Example Request** (Method 2 - Secure):

```typescript
// Node.js WhatsApp Backend
const phoneNumber = "+919876543210";
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = crypto
  .createHmac("sha256", process.env.FACEBOOK_APP_SECRET)
  .update(phoneNumber + timestamp)
  .digest("hex");

const response = await fetch("https://your-api.com/api/v1/payslip/me", {
  method: "GET",
  headers: {
    "x-whatsapp-signature": signature,
    "x-whatsapp-timestamp": timestamp,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    phoneNumber: phoneNumber,
  }),
});
```

### Applying Middleware to Routes

**Existing routes work automatically** - just replace `authenticate` with `authenticateWhatsApp`:

```typescript
// Example: payslip.routes.ts
import { authenticate, authenticateWhatsApp } from "../middleware/auth";

// For web/mobile app (JWT)
fastify.get("/payslip/me", { preHandler: authenticate }, getMyPayslip);

// For WhatsApp (phone number)
fastify.get(
  "/whatsapp/payslip/me",
  { preHandler: authenticateWhatsApp },
  getMyPayslip // Same controller!
);
```

## Security Considerations

### ✅ Implemented

1. **Meta Signature Verification**: WhatsApp backend verifies requests from Meta
2. **Shared Secret**: Both backends share `FACEBOOK_APP_SECRET`
3. **Timestamp Validation**: 5-minute expiry window prevents replay attacks
4. **User Validation**: Checks user active status and portal access
5. **Phone Normalization**: Removes spaces, dashes, parentheses

### 🔒 Recommended Best Practices

1. **HTTPS Only**: Always use HTTPS for backend-to-backend communication
2. **IP Whitelisting** (Optional): Whitelist WhatsApp backend IP addresses
3. **Rate Limiting**: Implement rate limiting per phone number
4. **Logging**: Log all WhatsApp authentication attempts
5. **Monitor**: Set up alerts for failed authentication attempts

### 📱 Phone Number Format

**Recommended**: E.164 format (international format with country code)

Examples:

- India: `+919876543210`
- UAE: `+971501234567`

**Normalization**: The middleware automatically removes:

- Spaces: `+91 98765 43210` → `+919876543210`
- Dashes: `+91-9876543210` → `+919876543210`
- Parentheses: `+91 (98765) 43210` → `+919876543210`

## Error Handling

**Error Responses**:

```json
{
  "success": false,
  "error": {
    "message": "Error description"
  }
}
```

**Common Errors**:

| Error Message                                 | Cause                       | Solution                            |
| --------------------------------------------- | --------------------------- | ----------------------------------- |
| `Phone number is required`                    | Missing phoneNumber in body | Include phoneNumber in request body |
| `FACEBOOK_APP_SECRET not configured`          | Missing env variable        | Add FACEBOOK_APP_SECRET to .env     |
| `Invalid WhatsApp authentication credentials` | Wrong secret or signature   | Verify FACEBOOK_APP_SECRET matches  |
| `Request timestamp expired`                   | Timestamp > 5 minutes old   | Generate fresh timestamp            |
| `User not found or inactive`                  | No user with phone number   | User doesn't exist or is inactive   |
| `User does not have portal access`            | portalAccess = false        | Enable portal access for user       |

## Testing

### Test with cURL (Method 1 - Simple)

```bash
curl -X GET https://your-api.com/api/v1/payslip/me \
  -H "x-whatsapp-secret: your_facebook_app_secret" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+919876543210"}'
```

### Test with cURL (Method 2 - Secure)

```bash
# Generate signature
PHONE="+919876543210"
TIMESTAMP=$(date +%s)
SECRET="your_facebook_app_secret"
SIGNATURE=$(echo -n "${PHONE}${TIMESTAMP}" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

# Make request
curl -X GET https://your-api.com/api/v1/payslip/me \
  -H "x-whatsapp-signature: $SIGNATURE" \
  -H "x-whatsapp-timestamp: $TIMESTAMP" \
  -H "Content-Type: application/json" \
  -d "{\"phoneNumber\": \"$PHONE\"}"
```

## Integration Checklist

### Setup

- [ ] Add `FACEBOOK_APP_SECRET` to environment variables
- [ ] Deploy updated code with `authenticateWhatsApp` middleware
- [ ] Verify phone number index is created in MongoDB
- [ ] Test authentication with sample phone number

### WhatsApp Backend Integration

- [ ] Store `FACEBOOK_APP_SECRET` in WhatsApp backend environment
- [ ] Implement signature generation (Method 2 recommended)
- [ ] Add phone number to request body
- [ ] Add authentication headers (x-whatsapp-secret or x-whatsapp-signature)
- [ ] Handle error responses

### User Data

- [ ] Ensure users have phone numbers in the database
- [ ] Verify phone numbers are in correct format (with country code)
- [ ] Test with different phone number formats
- [ ] Verify users have `active: true` and `portalAccess: true`

## Example WhatsApp Backend Implementation

```typescript
// whatsapp-backend/src/services/zunoApiService.ts
import crypto from "crypto";

class ZunoApiService {
  private apiBaseUrl: string;
  private appSecret: string;

  constructor() {
    this.apiBaseUrl = process.env.ZUNO_API_BASE_URL!;
    this.appSecret = process.env.FACEBOOK_APP_SECRET!;
  }

  /**
   * Generate secure signature for API request
   */
  private generateSignature(phoneNumber: string, timestamp: string): string {
    return crypto
      .createHmac("sha256", this.appSecret)
      .update(phoneNumber + timestamp)
      .digest("hex");
  }

  /**
   * Make authenticated request to Zuno HR API
   */
  async makeAuthenticatedRequest(
    endpoint: string,
    phoneNumber: string,
    method: string = "GET",
    body?: any
  ) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.generateSignature(phoneNumber, timestamp);

    const options: RequestInit = {
      method,
      headers: {
        "x-whatsapp-signature": signature,
        "x-whatsapp-timestamp": timestamp,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phoneNumber, ...body }),
    };

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "API request failed");
    }

    return response.json();
  }

  /**
   * Get user's latest payslip
   */
  async getPayslip(phoneNumber: string) {
    return this.makeAuthenticatedRequest("/api/v1/payslip/me", phoneNumber);
  }

  /**
   * Get user's attendance
   */
  async getAttendance(phoneNumber: string, month?: string, year?: string) {
    return this.makeAuthenticatedRequest(
      "/api/v1/attendance/my-attendance",
      phoneNumber,
      "GET",
      { month, year }
    );
  }

  /**
   * Get user's leave balance
   */
  async getLeaveBalance(phoneNumber: string) {
    return this.makeAuthenticatedRequest(
      "/api/v1/leaves/my-balance",
      phoneNumber
    );
  }
}

export default new ZunoApiService();
```

## Advantages of This Approach

✅ **No JWT Required**: WhatsApp users don't need to login or manage tokens
✅ **Seamless UX**: Users can directly ask chatbot for information
✅ **Secure**: Meta-verified phone numbers + signature verification
✅ **Reusable**: All existing routes work without modification
✅ **Scalable**: Can extend to other chat platforms (Telegram, Slack, etc.)
✅ **Simple**: Clean separation between authentication layers

## Troubleshooting

### Issue: User not found

**Possible Causes**:

1. Phone number not stored in database
2. Phone number format mismatch
3. User is inactive

**Solution**:

```bash
# Check user in MongoDB
db.users.findOne({ phone: "+919876543210" })

# Update phone number if needed
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { phone: "+919876543210" } }
)
```

### Issue: Authentication fails

**Possible Causes**:

1. Wrong FACEBOOK_APP_SECRET
2. Signature mismatch
3. Timestamp expired

**Solution**:

- Verify both backends have same FACEBOOK_APP_SECRET
- Check signature generation logic
- Ensure timestamp is current (within 5 minutes)

## Future Enhancements

- [ ] Support multiple phone numbers per user
- [ ] Add webhook endpoint for Meta verification
- [ ] Implement rate limiting per phone number
- [ ] Add analytics/metrics for WhatsApp usage
- [ ] Support for phone number verification/OTP
- [ ] Multi-factor authentication option

## Support

For issues or questions about WhatsApp authentication:

1. Check logs: `console.log` statements in `authenticateWhatsApp`
2. Verify phone number format in database
3. Test with cURL commands provided above
4. Check FACEBOOK_APP_SECRET configuration

---

**Last Updated**: January 8, 2026
**Version**: 1.0.0
