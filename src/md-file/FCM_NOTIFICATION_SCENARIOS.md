# FCM Push Notification Scenarios & Implementation Guide

## **Current Working Scenarios**

### 1. **Admin Login - Visa Expiry Notification** ✅
**When**: Admin logs in and FCM token is updated
**Trigger**: `/api/users/:id/fcm-token` route
**Condition**: User role is 'admin'
**Action**: Check for UAE visa expiry and send notification

```typescript
// In user.routes.ts - FCM token update route
if (user && user.role.toLowerCase() === 'admin') {
  const visaData = await request.container!.userService.getUAEUsersWithExpiringVisas(30);
  if (visaData.totalCount > 0) {
    const notificationData = await request.container!.userService.generateVisaExpiryNotification(30);
    await request.container!.userService.sendNotification(
      id,
      notificationData.title,
      notificationData.body,
      notificationData.data
    );
  }
}
```

## **Common FCM Notification Scenarios**

### 2. **Leave Application Notifications**
```typescript
// When employee applies for leave
async function notifyLeaveApplication(employeeId: string, managerId: string, leaveData: any) {
  // Notify manager about leave application
  await userService.sendNotification(
    managerId,
    'Leave Application Received',
    `${employeeData.name} has applied for ${leaveData.days} days leave`,
    {
      type: 'leave_application',
      employeeId: employeeId,
      leaveId: leaveData.id,
      action: 'approve_reject'
    }
  );
}

// When leave is approved/rejected
async function notifyLeaveStatus(employeeId: string, status: string, remarks?: string) {
  await userService.sendNotification(
    employeeId,
    `Leave ${status}`,
    `Your leave application has been ${status.toLowerCase()}`,
    {
      type: 'leave_status',
      status: status,
      remarks: remarks || '',
      action: 'view_details'
    }
  );
}
```

### 3. **Attendance Regularization Notifications**
```typescript
// When employee requests attendance regularization
async function notifyAttendanceRegularization(employeeId: string, managerId: string) {
  await userService.sendNotification(
    managerId,
    'Attendance Regularization Request',
    'An employee has requested attendance regularization',
    {
      type: 'attendance_regularization',
      employeeId: employeeId,
      action: 'review_request'
    }
  );
}
```

### 4. **Shift Assignment Notifications**
```typescript
// When shift is assigned to employee
async function notifyShiftAssignment(employeeId: string, shiftData: any) {
  await userService.sendNotification(
    employeeId,
    'New Shift Assignment',
    `You have been assigned to ${shiftData.shiftName} shift`,
    {
      type: 'shift_assignment',
      shiftId: shiftData.id,
      shiftName: shiftData.shiftName,
      startDate: shiftData.startDate,
      action: 'view_schedule'
    }
  );
}
```

### 5. **Overtime Approval Notifications**
```typescript
// When overtime is approved/rejected
async function notifyOvertimeStatus(employeeId: string, status: string, hours: number) {
  await userService.sendNotification(
    employeeId,
    `Overtime ${status}`,
    `Your ${hours} hours overtime has been ${status.toLowerCase()}`,
    {
      type: 'overtime_status',
      status: status,
      hours: hours.toString(),
      action: 'view_details'
    }
  );
}
```

### 6. **Payroll Notifications**
```typescript
// When payslip is generated
async function notifyPayslipGenerated(employeeId: string, month: string, year: string) {
  await userService.sendNotification(
    employeeId,
    'Payslip Generated',
    `Your payslip for ${month} ${year} is ready`,
    {
      type: 'payslip_generated',
      month: month,
      year: year,
      action: 'download_payslip'
    }
  );
}
```

### 7. **Document Expiry Notifications**
```typescript
// When documents are expiring soon
async function notifyDocumentExpiry(employeeId: string, documentType: string, expiryDate: Date) {
  await userService.sendNotification(
    employeeId,
    'Document Expiry Alert',
    `Your ${documentType} is expiring on ${expiryDate.toDateString()}`,
    {
      type: 'document_expiry',
      documentType: documentType,
      expiryDate: expiryDate.toISOString(),
      action: 'update_document'
    }
  );
}
```

### 8. **System Maintenance Notifications**
```typescript
// System-wide notifications
async function notifySystemMaintenance(adminIds: string[], maintenanceData: any) {
  for (const adminId of adminIds) {
    await userService.sendNotification(
      adminId,
      'System Maintenance',
      `Scheduled maintenance on ${maintenanceData.date} from ${maintenanceData.startTime} to ${maintenanceData.endTime}`,
      {
        type: 'system_maintenance',
        date: maintenanceData.date,
        startTime: maintenanceData.startTime,
        endTime: maintenanceData.endTime,
        action: 'view_details'
      }
    );
  }
}
```

### 9. **Emergency Notifications**
```typescript
// Emergency alerts to all users
async function sendEmergencyNotification(message: string, priority: 'high' | 'normal' = 'high') {
  const allUsers = await userService.getUsersWithFcmTokens();
  
  for (const user of allUsers) {
    await userService.sendNotification(
      user._id.toString(),
      'Emergency Alert',
      message,
      {
        type: 'emergency',
        priority: priority,
        timestamp: new Date().toISOString(),
        action: 'acknowledge'
      }
    );
  }
}
```

### 10. **Birthday/Anniversary Notifications**
```typescript
// Automated birthday/anniversary notifications
async function notifyBirthday(employeeId: string, employeeName: string) {
  await userService.sendNotification(
    employeeId,
    'Happy Birthday! 🎉',
    `Wishing you a wonderful birthday, ${employeeName}!`,
    {
      type: 'birthday',
      employeeName: employeeName,
      action: 'view_greetings'
    }
  );
}
```

## **Bulk Notification Scenarios**

### 11. **Department-wide Notifications**
```typescript
async function notifyDepartment(departmentId: string, title: string, body: string) {
  const users = await userService.findByRoleAndDepartment({ departmentId });
  const userIds = users.map(user => user._id.toString());
  
  await userService.sendBulkNotifications(
    userIds,
    title,
    body,
    {
      type: 'department_notification',
      departmentId: departmentId,
      action: 'view_details'
    }
  );
}
```

### 12. **Role-based Notifications**
```typescript
async function notifyByRole(role: string, title: string, body: string) {
  const users = await userService.findByRole(role);
  const userIds = users.map(user => user._id.toString());
  
  await userService.sendBulkNotifications(
    userIds,
    title,
    body,
    {
      type: 'role_notification',
      role: role,
      action: 'view_details'
    }
  );
}
```

## **Scheduled/Recurring Notifications**

### 13. **Daily Attendance Reminders**
```typescript
// Cron job to send attendance reminders
async function sendAttendanceReminders() {
  const activeUsers = await userService.find({ active: true });
  
  for (const user of activeUsers) {
    await userService.sendNotification(
      user._id.toString(),
      'Attendance Reminder',
      'Please mark your attendance for today',
      {
        type: 'attendance_reminder',
        date: new Date().toISOString().split('T')[0],
        action: 'mark_attendance'
      }
    );
  }
}
```

### 14. **Weekly Reports**
```typescript
async function sendWeeklyReports(managerIds: string[]) {
  for (const managerId of managerIds) {
    await userService.sendNotification(
      managerId,
      'Weekly Report Available',
      'Your team\'s weekly report is ready for review',
      {
        type: 'weekly_report',
        week: getCurrentWeek(),
        action: 'view_report'
      }
    );
  }
}
```

## **Testing & Debugging Routes**

### 15. **Test Notification Route**
```typescript
// GET /api/users/test-notify?userId=USER_ID&title=Test&body=Message
// Tests individual user notification
```

### 16. **Debug FCM Token Route**
```typescript
// GET /api/users/debug-fcm-token?userId=USER_ID
// Checks if user has valid FCM token
```

### 17. **Bulk Test Route**
```typescript
// POST /api/users/test-bulk-notify
// Test bulk notifications to multiple users
```

## **Best Practices**

### **Message Structure**
```typescript
const message = {
  notification: {
    title: 'Clear, concise title',
    body: 'Descriptive message body'
  },
  data: {
    type: 'notification_type',
    action: 'action_to_take',
    timestamp: Date.now().toString(),
    // Additional context data
  },
  token: userFcmToken,
  // Platform-specific configurations
  webpush: { /* web settings */ },
  android: { /* android settings */ },
  apns: { /* iOS settings */ }
};
```

### **Error Handling**
```typescript
try {
  await userService.sendNotification(userId, title, body, data);
} catch (error) {
  if (error.code === 'messaging/registration-token-not-registered') {
    // Clear invalid token
    await userService.updateFcmToken(userId, '');
  }
  // Log error and handle gracefully
}
```

### **Rate Limiting**
```typescript
// Implement rate limiting for bulk notifications
const BATCH_SIZE = 500; // Send in batches
const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay
```

## **Frontend Handling**

### **Foreground Messages**
```javascript
onMessage(messaging, (payload) => {
  console.log('Foreground message:', payload);
  showCustomNotification(payload);
});
```

### **Background Messages**
```javascript
// In service worker
messaging.onBackgroundMessage((payload) => {
  console.log('Background message:', payload);
  showSystemNotification(payload);
});
```

### **Click Actions**
```javascript
function handleNotificationClick(action, data) {
  switch (action) {
    case 'view_details':
      navigateToDetails(data);
      break;
    case 'approve_reject':
      navigateToApproval(data);
      break;
    case 'download_payslip':
      downloadPayslip(data);
      break;
    default:
      navigateToDefault();
  }
}
```

This comprehensive guide covers all the common scenarios for FCM notifications in your HRMS system. Each scenario includes proper error handling, data structure, and frontend integration. 