# Admin Visa Expiry Notification Implementation

## Overview

This implementation provides automatic visa expiry notifications for admin users when they log in, helping them stay informed about UAE employees whose visas are expiring soon.

## Problem Statement

- Admin users need to be notified about UAE employee visas expiring in the next 30 days
- Manual checking is time-consuming and error-prone
- Need automated system to alert admins proactively

## Solution

### 1. Automatic Notification on Admin Login

When an admin user logs in and updates their FCM token, the system automatically:
- Checks for UAE employees with visas expiring in 30 days
- **Only sends notification if there are expiring visas (count > 0)**
- Generates a notification with detailed information
- Sends push notification to the admin

### 2. Manual Check Endpoint

Provides a dedicated endpoint for admins to manually check visa expiry status and receive notifications.
**Only sends notification if there are expiring visas (count > 0).**

## Technical Implementation

### New Service Methods (`src/services/user.service.ts`)

#### 1. `getUAEUsersWithExpiringVisas(daysAhead: number = 30)`

```typescript
async getUAEUsersWithExpiringVisas(daysAhead: number = 30) {
  // Finds UAE users with active visas expiring within specified days
  // Returns detailed breakdown by visa type and urgency
}
```

**Returns:**
```typescript
{
  totalCount: number,
  visaTypeBreakdown: Record<string, number>,
  expiringVisas: Array<{
    name: string,
    email: string,
    visaType: string,
    expiryDate: Date,
    daysUntilExpiry: number
  }>,
  checkDate: Date,
  expiryThreshold: Date
}
```

#### 2. `generateVisaExpiryNotification(daysAhead: number = 30)`

```typescript
async generateVisaExpiryNotification(daysAhead: number = 30) {
  // Generates formatted notification message with visa expiry data
  // Handles different scenarios (no expiring visas, urgent cases, errors)
}
```

**Returns:**
```typescript
{
  title: string,
  body: string,
  data: {
    type: 'visa_expiry',
    count: string,
    urgent_count: string,
    action: string,
    visa_types: string,
    error: string
  }
}
```

### Updated FCM Token Route (`src/routes/user.routes.ts`)

#### Enhanced `PATCH /users/:id/fcm-token`

**New Logic:**
1. Update FCM token as usual
2. Check if user is admin
3. If admin, automatically generate and send visa expiry notification
4. Return enhanced response with notification status

**Response Examples:**

**Admin User with Expiring Visas:**
```json
{
  "success": true,
  "data": {
    "message": "FCM token updated successfully",
    "adminNotification": {
      "sent": true,
      "title": "Visa Expiry Alert",
      "body": "5 UAE employee visa(s) expiring in 30 days: 3 Standard Employment Visa, 2 Green Visa (2 urgent - expiring within 7 days)",
      "visaCount": 5,
      "userNames": "John Doe, Jane Smith, Ahmed Al Mansouri, Sarah Johnson, Mohammed Hassan"
    }
  }
}
```

**Admin User with No Expiring Visas:**
```json
{
  "success": true,
  "data": {
    "message": "FCM token updated successfully",
    "adminNotification": {
      "sent": false,
      "reason": "no_expiring_visas",
      "visaCount": 0
    }
  }
}
```

**Non-Admin User:**
```json
{
  "success": true,
  "data": {
    "message": "FCM token updated successfully"
  }
}
```

### New Manual Check Route

#### `GET /users/check-visa-expiry`

**Parameters:**
- `adminUserId` (required): ID of admin user to send notification to
- `daysAhead` (optional): Number of days to check (default: 30)

**Example Usage:**
```
GET /users/check-visa-expiry?adminUserId=123&daysAhead=30
```

**Response with Expiring Visas:**
```json
{
  "success": true,
  "message": "Visa expiry check completed and notification sent",
  "data": {
    "visaData": {
      "totalCount": 5,
      "visaTypeBreakdown": {
        "Standard Employment Visa": 3,
        "Green Visa": 2
      },
      "expiringVisas": [...]
    },
    "notification": {
      "title": "Visa Expiry Alert",
      "body": "5 UAE employee visa(s) expiring in 30 days...",
      "data": {...}
    },
    "notificationResult": {...},
    "notificationSent": true
  }
}
```

**Response with No Expiring Visas:**
```json
{
  "success": true,
  "message": "Visa expiry check completed - no expiring visas found",
  "data": {
    "visaData": {
      "totalCount": 0,
      "visaTypeBreakdown": {},
      "expiringVisas": []
    },
    "notificationSent": false,
    "reason": "no_expiring_visas"
  }
}
```

## Notification Message Examples

### 1. No Expiring Visas
```
No notification sent when count = 0
```

### 2. Expiring Visas Found
```
Title: "Visa Expiry Alert"
Body: "5 UAE employee visa(s) expiring in 30 days: 3 Standard Employment Visa, 2 Green Visa (2 urgent - expiring within 7 days)"
```

### 3. Error Case
```
Title: "Visa Status Error"
Body: "Unable to check visa expiry status. Please review manually."
```

## Data Structure

### Visa Expiry Data
```typescript
interface VisaExpiryData {
  totalCount: number;
  visaTypeBreakdown: Record<string, number>;
  expiringVisas: Array<{
    name: string;
    email: string;
    visaType: string;
    expiryDate: Date;
    daysUntilExpiry: number;
  }>;
  checkDate: Date;
  expiryThreshold: Date;
}
```

### Notification Data
```typescript
interface NotificationData {
  title: string;
  body: string;
  data: {
    type: 'visa_expiry';
    count: string;
    urgent_count: string;
    action: string;
    visa_types: string;
    user_names: string;
    error: string;
  };
}
```

## Workflow

### 1. User Login Flow
```
User Logs In → UI Calls FCM Update → Check User Role → 
If Admin → Calculate Visa Expiry → Send Notification → Return Response
```

### 2. Manual Check Flow
```
Admin Request → Validate Admin Role → Calculate Visa Expiry → 
Generate Notification → Send to Admin → Return Detailed Data
```

## Error Handling

### 1. FCM Token Update
- If notification fails, FCM update still succeeds
- Error details included in response
- Graceful degradation

### 2. Visa Data Calculation
- Database errors are caught and logged
- Fallback error notification sent
- Detailed error messages for debugging

### 3. Admin Validation
- Verifies target user is actually an admin
- Returns appropriate error if not admin

## Usage Examples

### Frontend Integration

```javascript
// After user login, update FCM token
const updateFCMToken = async (userId, fcmToken) => {
  const response = await fetch(`/users/${userId}/fcm-token`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fcmToken })
  });
  
  const result = await response.json();
  
  // Check if admin notification was sent
  if (result.data.adminNotification) {
    console.log('Admin notification sent:', result.data.adminNotification);
    // Handle admin-specific UI updates
  }
};
```

### Manual Check
```javascript
// Admin manually checks visa expiry
const checkVisaExpiry = async (adminUserId, daysAhead = 30) => {
  const response = await fetch(`/users/check-visa-expiry?adminUserId=${adminUserId}&daysAhead=${daysAhead}`);
  const result = await response.json();
  
  if (result.success) {
    console.log('Visa data:', result.data.visaData);
    // Handle visa expiry data in UI
  }
};
```

## Benefits

1. **Proactive Monitoring**: Admins are automatically notified about expiring visas
2. **Detailed Information**: Breakdown by visa type and urgency levels
3. **Flexible Configuration**: Configurable days ahead for checking
4. **Error Resilience**: System continues to work even if notifications fail
5. **Manual Override**: Admins can manually check anytime
6. **Rich Data**: Detailed visa information for further processing

## Future Enhancements

1. **Scheduled Notifications**: Daily/weekly automated checks
2. **Escalation Rules**: Notify multiple admins based on urgency
3. **Email Integration**: Send email notifications in addition to push
4. **Dashboard Integration**: Display visa expiry data in admin dashboard
5. **Custom Thresholds**: Different notification thresholds for different visa types
6. **Historical Tracking**: Track notification history and admin responses

## Testing Scenarios

### 1. Admin Login with Expiring Visas
- Create UAE users with visas expiring in 30 days
- Login as admin and update FCM token
- Verify notification is sent with correct data

### 2. Admin Login with No Expiring Visas
- Ensure no UAE users have expiring visas
- Login as admin and update FCM token
- Verify **no notification is sent** (count = 0)

### 3. Non-Admin Login
- Login as non-admin user
- Update FCM token
- Verify no visa notification is sent

### 4. Manual Check Endpoint with Expiring Visas
- Call manual check endpoint with admin user
- Verify detailed visa data is returned
- Verify notification is sent to admin

### 5. Manual Check Endpoint with No Expiring Visas
- Call manual check endpoint when no visas are expiring
- Verify detailed visa data is returned (count = 0)
- Verify **no notification is sent** to admin

### 6. Error Scenarios
- Test with invalid admin user ID
- Test with database connection issues
- Verify graceful error handling

## Security Considerations

1. **Role Validation**: Only admins receive visa expiry notifications
2. **Data Privacy**: Only necessary visa information is included
3. **Error Handling**: Sensitive information not exposed in error messages
4. **Authentication**: All endpoints require proper authentication

## Performance Considerations

1. **Database Queries**: Optimized queries with proper indexing
2. **Caching**: Consider caching visa data for frequent checks
3. **Async Processing**: Non-blocking notification sending
4. **Rate Limiting**: Prevent abuse of manual check endpoint 