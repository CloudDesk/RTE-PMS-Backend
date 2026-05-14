# FCM Testing Guide

## **How to Test FCM Notifications**

### **1. Test by User ID (Recommended)**

**URL:** `GET /api/users/test-notify?userId=USER_ID&title=Test&body=Message`

**Example:**
```bash
curl "http://localhost:3000/api/users/test-notify?userId=676a65b0b06ccef51b302d3d&title=Test%20Notification&body=Hello%20from%20Backend"
```

**Frontend JavaScript:**
```javascript
async function testNotificationByUserId(userId) {
  try {
    const response = await fetch(`/api/users/test-notify?userId=${userId}&title=${encodeURIComponent('Test Notification')}&body=${encodeURIComponent('Hello from Backend')}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });

    const result = await response.json();
    console.log('Test result:', result);
    
    if (result.success) {
      alert('Notification sent successfully!');
    } else {
      alert('Failed: ' + result.error.message);
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
  }
}
```

### **2. Test by Direct FCM Token**

**URL:** `POST /api/users/test-notify-token`

**Example:**
```bash
curl -X POST "http://localhost:3000/api/users/test-notify-token" \
  -H "Content-Type: application/json" \
  -d '{
    "fcmToken": "YOUR_FCM_TOKEN_HERE",
    "title": "Direct Test",
    "body": "Testing with token directly",
    "data": {
      "type": "test",
      "action": "view"
    }
  }'
```

**Frontend JavaScript:**
```javascript
async function testNotificationByToken(fcmToken) {
  try {
    const response = await fetch('/api/users/test-notify-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fcmToken: fcmToken,
        title: 'Direct Test',
        body: 'Testing with token directly',
        data: {
          type: 'test',
          action: 'view'
        }
      })
    });

    const result = await response.json();
    console.log('Direct token test result:', result);
    
    if (result.success) {
      alert('Direct token notification sent successfully!');
    } else {
      alert('Failed: ' + result.error.message);
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
  }
}
```

### **3. Debug FCM Token**

**URL:** `GET /api/users/debug-fcm-token?userId=USER_ID`

**Example:**
```bash
curl "http://localhost:3000/api/users/debug-fcm-token?userId=676a65b0b06ccef51b302d3d"
```

**Frontend JavaScript:**
```javascript
async function debugFCMToken(userId) {
  try {
    const response = await fetch(`/api/users/debug-fcm-token?userId=${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });

    const result = await response.json();
    console.log('FCM Token Debug:', result);
    
    if (result.success) {
      alert(`FCM Token Debug:\nExists: ${result.data.fcmTokenExists}\nLength: ${result.data.fcmTokenLength}\nPreview: ${result.data.fcmTokenPreview}`);
    } else {
      alert('Debug failed: ' + result.error.message);
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
  }
}
```

## **Step-by-Step Testing Process**

### **Step 1: Get Your FCM Token**
1. Open your browser console
2. Run this code to get your FCM token:
```javascript
// Get FCM token from your existing setup
const token = await getFCMToken();
console.log('Your FCM Token:', token);
```

### **Step 2: Update Token in Backend**
1. Make sure your FCM token is saved in the backend
2. Use your existing FCM token update API:
```javascript
await employeesApi.fcmToken(userId, token);
```

### **Step 3: Test Notifications**
1. **Test by User ID:**
   ```javascript
   testNotificationByUserId('YOUR_USER_ID');
   ```

2. **Test by Direct Token:**
   ```javascript
   testNotificationByToken('YOUR_FCM_TOKEN');
   ```

3. **Debug Token:**
   ```javascript
   debugFCMToken('YOUR_USER_ID');
   ```

## **Expected Results**

### **Success Response:**
```json
{
  "success": true,
  "message": "Notification sent successfully",
  "data": {
    "success": true,
    "messageId": "projects/tendly-uae/messages/abc123...",
    "userId": "676a65b0b06ccef51b302d3d",
    "title": "Test Notification",
    "body": "Hello from Backend",
    "fcmToken": "dy243TG1pf1Tfuupmz_pyD:APA91bF5dqf6jMZ23jgmS9rguELDJQhZ9A1ZwmAZoe9jf-WkGo1JcZMTSvkP261Zck5-fk03myPEcWTLtyi8H9eEWbyK7o09HJGt0w0RsGsAeTsSIURVE8s",
    "userInfo": {
      "name": "Admin User",
      "email": "admin@example.com",
      "fcmTokenExists": true
    }
  }
}
```

### **Error Response:**
```json
{
  "success": false,
  "error": {
    "message": "User does not have FCM token registered",
    "code": "TOKEN_NOT_FOUND"
  }
}
```

## **Frontend Message Handling**

### **Foreground Messages (App Open):**
```javascript
// In your existing onMessageListener function
onMessageListener((payload) => {
  console.log('FCM Foreground Message:', payload);
  
  // Show custom notification
  showCustomNotification(payload);
  
  // Or trigger your existing FCM toast
  const event = new CustomEvent('adminNotification', {
    detail: {
      title: payload.notification?.title,
      body: payload.notification?.body,
      type: 'info',
      duration: 5000
    }
  });
  window.dispatchEvent(event);
});
```

### **Background Messages (App Closed/Minimized):**
```javascript
// In your service worker (firebase-messaging-sw.js)
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);
  
  const notificationTitle = payload.notification?.title || 'New Message';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message',
    icon: '/icon-192x192.png',
    tag: 'fcm-notification'
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});
```

## **Troubleshooting**

### **Common Issues:**

1. **"User not found"**
   - Check if the user ID is correct
   - Verify the user exists in the database

2. **"User does not have FCM token registered"**
   - Make sure the user has logged in and FCM token was saved
   - Check the debug endpoint to verify token status

3. **"FCM token is invalid"**
   - Token may have expired
   - User needs to refresh the app to get a new token

4. **No notification received**
   - Check browser console for errors
   - Verify notification permissions are granted
   - Check if service worker is registered

### **Debug Steps:**

1. **Check Token Status:**
   ```javascript
   debugFCMToken('YOUR_USER_ID');
   ```

2. **Check Browser Console:**
   - Look for FCM-related errors
   - Check if `onMessageListener` is working

3. **Check Network Tab:**
   - Verify API calls are successful
   - Check for CORS errors

4. **Check Service Worker:**
   ```javascript
   navigator.serviceWorker.getRegistrations().then(registrations => {
     console.log('Service Workers:', registrations);
   });
   ```

## **Quick Test Commands**

### **Using cURL:**
```bash
# Test by User ID
curl "http://localhost:3000/api/users/test-notify?userId=676a65b0b06ccef51b302d3d&title=Test&body=Hello"

# Debug Token
curl "http://localhost:3000/api/users/debug-fcm-token?userId=676a65b0b06ccef51b302d3d"

# Test by Direct Token
curl -X POST "http://localhost:3000/api/users/test-notify-token" \
  -H "Content-Type: application/json" \
  -d '{"fcmToken":"YOUR_TOKEN","title":"Test","body":"Hello"}'
```

### **Using Browser Console:**
```javascript
// Test functions (paste in browser console)
async function quickTest() {
  const userId = '676a65b0b06ccef51b302d3d'; // Replace with your user ID
  
  // Debug first
  await debugFCMToken(userId);
  
  // Then test
  await testNotificationByUserId(userId);
}

// Run the test
quickTest();
```

This guide should help you test FCM notifications from your backend and verify they're working correctly with your frontend setup. 