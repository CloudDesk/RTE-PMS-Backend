# HRMS Project Notes (With Detailed Models)

## Core Features:
1. **User Authentication**
2. **User Management**
3. **Roles and Access Control**
4. **Attendance Management**
5. **Leave Management**
6. **Overtime and Comp-Offs**
7. **Payslip Generation**
8. **Shift Management**
9. **Dropdown/LoV Management**

## 1. Infrastructure

### Cloud Architecture
- Platform: GCP (asia-south1)
- Compute: GCP Cloud Functions
- Storage: GCP Cloud Storage (Standard)
- Database: MongoDB Atlas (M0)
- Cache: RedisCloud (30MB)
- Load Balancer: GCP HTTP(S)
- Web Portal : Firebase Hosting with ReactJS

### Performance Requirements
- Users: 1,000 total, 200-300 concurrent
- Response Time: Max 5s
- Session Duration: 60m


---
## 2. Data Models

### User Collection
```javascript
{
  _id: ObjectId,
  name: { type: string, required: true, maxLength: 100 },
  email: { type: string, required: true, maxLength: 100, unique: true },
  password: { type: string, required: true, maxLength: 60 },  // argon2 hash
  role: { type: ObjectId, required: true, ref: 'Lov' },
  departmentId: { type: ObjectId, required: true, ref: 'Lov' },
  biometricId: { type: string, maxLength: 20 },
  active: { type: boolean, default: true },
  resetToken: { type: string, select: false },
  resetTokenExpiry: { type: Date, select: false },
  createdAt: { type: date, default: Date.now },
  updatedAt: { type: date, default: Date.now }
}
```

### Shift Collection
```javascript
{
  _id: ObjectId,
  name: { type: string, required: true, maxLength: 100 },
  code: { type: string, required: true, unique: true, maxLength: 20 },
  startTime: { type: string, required: true, format: "HH:mm" },
  endTime: { type: string, required: true, format: "HH:mm" },
  applicableForRoles: [{ type: ObjectId, ref: 'Lov' }],
  validFrom: { type: date, required: true },
  validTill: { type: date },
  isActive: { type: boolean, default: true },
  description: string,
  graceTimeInMinutes: { type: number, min: 0, max: 60, default: 15 },
  workingHours: { type: number, required: true, min: 0, max: 24 },
  createdAt: { type: date, default: Date.now },
  updatedAt: { type: date, default: Date.now }
}
```

### Shift Assignment Collection
```javascript
{
  _id: ObjectId,
  userId: { type: ObjectId, required: true, ref: 'User' },
  shiftId: { type: ObjectId, required: true, ref: 'Shift' },
  startDate: { type: date, required: true },
  endDate: { type: date },
  isActive: { type: boolean, default: true },
  assignedBy: { type: ObjectId, required: true, ref: 'User' },
  assignedAt: { type: date, required: true },
  modifiedBy: { type: ObjectId, ref: 'User' },
  modifiedAt: { type: date },
  createdAt: { type: date, default: Date.now },
  updatedAt: { type: date, default: Date.now }
}
```

### Attendance Collection
```javascript
{
  _id: ObjectId,
  userId: { type: ObjectId, required: true, ref: 'User' },
  checkIn: { type: date, required: true },
  checkOut: { type: date },
  status: { type: string, enum: ["Late", "On-Time", "Early-Exit", "Absent"], required: true },
  source: { type: string, enum: ["Biometric", "Web", "Manual"], required: true },
  date: { type: date, required: true },
  location: { type: string, maxLength: 50 },
  remarks: string
}
```

### Leave Collection
```javascript
{
  _id: ObjectId,
  userId: { type: ObjectId, required: true, ref: 'User' },
  user: {
    name: string,
    email: string,
    _id: false
  },
  leaveTypeId: { type: ObjectId, required: true, ref: 'Lov' },
  leaveType: {
    value: string,
    description: string,
    _id: false
  },
  startDate: { type: date, required: true },
  endDate: { type: date, required: true },
  status: { type: string, enum: ["Pending", "Approved", "Rejected"], required: true },
  remarks: string,
  approvedById: { type: ObjectId, ref: 'User' },
  approvedBy: {
    name: string,
    email: string,
    _id: false
  },
  approvedAt: date,
  createdAt: { type: date, default: Date.now },
  updatedAt: { type: date, default: Date.now }
}
```

### Overtime Collection
```javascript
{
  _id: ObjectId,
  userId: { type: ObjectId, required: true, ref: 'User' },
  date: { type: date, required: true },
  hours: { type: number, required: true, min: 0, max: 24 },
  status: { type: string, enum: ["Pending", "Approved", "Rejected"], required: true },
  remarks: string,
  approvedBy: { type: ObjectId, ref: 'User' },
  approvedAt: date,
  createdAt: { type: date, default: Date.now },
  updatedAt: { type: date, default: Date.now }
}
```

### Payslip Collection
```javascript
{
  _id: ObjectId,
  userId: { type: ObjectId, required: true, ref: 'User' },
  month: { type: string, required: true, pattern: "^\\d{4}-\\d{2}$" },
  year: { type: number, required: true },
  presentDays: { type: number, default: 0, min: 0 },
  lateDays: { type: number, default: 0, min: 0 },
  overtimeHours: { type: number, default: 0, min: 0 },
  absentDays: { type: number, default: 0, min: 0 },
  totalLeaves: { type: number, default: 0, min: 0 },
  approvedLeaves: { type: number, default: 0, min: 0 },
  rejectedLeaves: { type: number, default: 0, min: 0 },
  sickLeaveBalance: { type: number, default: 0, min: 0 },
  casualLeaveBalance: { type: number, default: 0, min: 0 },
  earnedLeaveBalance: { type: number, default: 0, min: 0 },
  exportStatus: { type: string, enum: ["Pending", "Completed", "Failed"], default: "Pending" },
  generatedAt: { type: date, required: true },
  exportedAt: date,
  createdAt: { type: date, default: Date.now },
  updatedAt: { type: date, default: Date.now }
}
```

### List of Values Collection
```javascript
{
  _id: ObjectId,
  type: { type: string, required: true, maxLength: 50 },
  value: { type: string, required: true, maxLength: 100 },
  description: string,
  isActive: { type: boolean, default: true },
  createdAt: { type: date, default: Date.now },
  updatedAt: { type: date, default: Date.now }
}
```

### Audit Log Collection
```javascript
{
  _id: ObjectId,
  entityType: { type: string, required: true, maxLength: 50 },
  entityId: { type: ObjectId, required: true },
  action: { type: string, enum: ["Created", "Updated", "Deleted"], required: true },
  fieldName: { type: string, required: true, maxLength: 50 },
  oldValue: string,
  newValue: string,
  userId: { type: ObjectId, required: true, ref: 'User' },
  ipAddress: { type: string, maxLength: 45 },
  timestamp: { type: date, default: Date.now }
}
```


### 1. User
```json
{
  "id": "UUID or ObjectId",
  "name": "string",
  "email": "string",
  "password": "hashed string",
  "role": "reference to LoV (Role)",
  "department": "reference to LoV (Department)",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### 2. Attendance
```json
{
  "id": "UUID or ObjectId",
  "user_id": "reference to User",
  "check_in": "timestamp",
  "check_out": "timestamp",
  "status": "string (e.g., Late, On-Time)",
  "date": "date (YYYY-MM-DD)"
}
```

### 3. Leave
```json
{
  "id": "UUID or ObjectId",
  "user_id": "reference to User",
  "leave_type": "reference to LoV (Leave Type)",
  "start_date": "date",
  "end_date": "date",
  "status": "string (e.g., Pending, Approved, Rejected)",
  "created_at": "timestamp"
}
```

### 4. Overtime
```json
{
  "id": "UUID or ObjectId",
  "user_id": "reference to User",
  "hours": "number",
  "status": "string (e.g., Pending, Approved)",
  "created_at": "timestamp"
}
```

### 5. Payslip
```json
{
  "id": "UUID or ObjectId",
  "user_id": "reference to User",
  "month": "YYYY-MM",
  "attendance_summary": {
    "present_days": "number",
    "late_days": "number",
    "overtime_hours": "number"
  },
  "leave_summary": {
    "total_leaves": "number",
    "approved_leaves": "number",
    "rejected_leaves": "number"
  },
  "generated_at": "timestamp"
}
```

### 6. List of Values (LoVs)
```json
{
  "id": "UUID or ObjectId",
  "type": "string (e.g., Role, Department, Leave Type)",
  "value": "string (e.g., Admin, IT, Sick Leave)",
  "description": "string (optional)",
  "is_active": "boolean (default: true)"
}
```

---

## Modules and Endpoints:

### 1. Authentication:
- **POST /auth/login**
  
  **Description:** Login with email and password.
  
  **Request:**
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePassword123"
  }
  ```
  
  **Response:**
  ```json
  {
    "status": 200,
    "message": "Login successful",
    "token": "jwt-token-string",
    "user": {
      "id": "UUID",
      "name": "John Doe",
      "role": "Admin"
    }
  }
  ```

- **Error Response:**
  ```json
  {
    "status": 401,
    "error": "Unauthorized",
    "message": "Invalid email or password",
    "timestamp": "2023-10-05T14:48:00.000Z"
  }
  ```

### 2. User Management:
- **GET /users**: Fetch all users.
- **POST /users**: Add a new user.
- **PUT /users/:id**: Update user details.
- **DELETE /users/:id**: Soft delete a user.

### 3. Roles and Access Control:
- **GET /roles**: Fetch all roles from LoVs.
- **POST /roles**: Add a new role.

### 4. Attendance:
- **POST /attendance/check-in**: Record check-in.
- **POST /attendance/check-out**: Record check-out.

### 5. Leave Management:
- **POST /leaves**: Apply for leave.
- **GET /leaves**: Fetch all leave requests.

### 6. Overtime and Comp-Offs:
- **POST /overtime**: Log overtime.
- **GET /overtime**: View overtime logs.

### 7. Payslip Management:
- **POST /payslips/generate**: Generate a payslip for a user.

### 8. LoV Management:
- **GET /lovs**: Fetch all active LoVs.
- **POST /lovs**: Add a new LoV.

### 9. Shift Management:
- **GET /shifts**: Get all shifts.
- **GET /shifts/:id**: Get shift details.
- **POST /shifts**: Create a new shift.
- **PUT /shifts/:id**: Update a shift.
- **DELETE /shifts/:id**: Delete a shift.
- **GET /shifts/current**: Get current shift for logged-in user.

---

## Additional Features:
1. **Audit Logs**: Maintain a log of changes.
2. **Dashboard Metrics**: Real-time KPIs for admins.
3. **Localization Support**: Extend LoVs to include translations for dropdown values.
4. **Notifications**: Add email/SMS notifications for key events.

## 5. Integration Specifications

### Biometric Integration
- Source: On-premise MS SQL Server
- Sync: Every minute
- Direction: Biometric → HRMS
- Fields:
  - Employee ID
  - Check-in/out times
  - Device ID
  - Location

### Export Formats
- Excel (.xlsx)
- CSV
- Types:
  - Payroll
  - Attendance
  - Leave balance
- Generation: On-demand/scheduled

## 6. Security

- **Authentication:**
  - Session-based authentication with JWT tokens.
  - Tokens expire after 60 minutes of inactivity.
  
- **Password Management:**
  - Passwords are hashed using bcrypt with a salt factor of 12.
  - Password policies enforce a minimum length and complexity.
  
- **Data Protection:**
  - Sensitive data encrypted at rest using AES-256.
  - All data transmitted over SSL/TLS.
  
- **Role-Based Access Control (RBAC):**
  - Roles defined in LoVs with specific permissions.
  - Middleware enforces access control on API endpoints.
  
- **Audit Logging:**
  - Comprehensive audit logs for all critical actions.
  - Logs are retained for 90 days and stored securely.
  
- **Vulnerability Management:**
  - Regular security scans and penetration testing.
  - Prompt patching of identified vulnerabilities.

## 7. Error Handling

```javascript
{
  status: number,
  error: string,
  message: string,
  details?: object,
  timestamp: string
}
```

Standard HTTP codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Server Error



# 🕘 HRMS Attendance Status & attendanceStatus Update Logic

This document defines the logic for updating the `attendanceStatus` (`[]string`) and `status` (`string`) fields on the `Attendance` record in the HRMS system.

---

## 1. 🕒 On Check-In (Swipe In)

**Trigger:** First swipe of the day

**Update Logic:**
- `status`: (auto-updated by DB trigger)
- `attendanceStatus`:
  - If `isLateEntry` → add `"Late"`
  - Else → add `"On-Time"`
  - If swipe is outside valid time window → add `"Out-Of-Window"`
- `needsRegularization`:
  - `true` if `isLateEntry`
  - `null` otherwise

---

## 2. 🕔 On Check-Out (Swipe Out)

**Trigger:** Second swipe of the day

**Update Logic:**
- `status`: (auto-updated by DB trigger)
- `attendanceStatus`:
  - If `isEarlyExit` → add `"Early-Exit"`
  - Always add `"Present"` (on second swipe)
- `needsRegularization`:
  - `true` if any of the following:
    - `isLateEntry`
    - `isEarlyExit`
    - `metrics.hasShortfall`
    - `!record.isWithinWindow`

---

## 3. 🌴 On Leave Approval

**Trigger:** Leave approved for user on the given date

**Update Logic:**
- `attendanceStatus` = `["On-Leave"]`

---

## 4. ❌ On Leave Rejection

**Trigger:** Previously approved leave is rejected

**Update Logic:**
- `attendanceStatus` = `["Absent"]`

> ⚠️ Note: Implement this logic in the leave rejection service.

---

## 5. 📝 On Regularization Applied

**Trigger:** User applies for regularization

**Update Logic:**
- `attendanceStatus` = `["Pending-Regularization"]`

---

## 6. ❌ On Regularization Rejected

**Trigger:** Admin rejects regularization request

**Update Logic:**
- If leave balance exists → `attendanceStatus` = `["On-Leave"]`
- Else → `attendanceStatus` = `["Absent"]`

---

## 7. ✅ On Regularization Approved

**Trigger:** Admin approves regularization request

**Update Logic:**
- `attendanceStatus` = `["Regularized", "Present"]`

---

## ⚙️ DB Trigger: Auto Status Assignment (Before Save)

```ts
if (this.swipes.length === 2) {
  this.status = 'complete';
} else if (this.swipes.length > 2) {
  this.status = 'duplicate_swipes';
} else {
  this.status = 'missing_checkout';
}
