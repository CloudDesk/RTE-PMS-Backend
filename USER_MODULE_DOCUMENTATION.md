# User Module - Complete Documentation

## Table of Contents

1. [Authentication APIs](#authentication-apis)
2. [User Schema](#user-schema)
3. [User Management APIs](#user-management-apis)
4. [User Profile APIs](#user-profile-apis)
5. [User Resignation APIs](#user-resignation-apis)
6. [Data Validations & Business Rules](#data-validations--business-rules)
7. [Common Response Codes](#common-response-codes)
8. [Best Practices](#best-practices)

---

## Authentication APIs

### Base URL

```
/api/auth
```

---

### 1. Login

**POST** `/api/auth/login`

Authenticate user with email and password.

#### Request Body Schema

```typescript
interface LoginRequest {
  email: string; // Required, email format
  password: string; // Required, min 6 chars
}
```

#### Request Body Example

```json
{
  "email": "john.doe@example.com",
  "password": "securePassword123"
}
```

#### Required Fields

- `email` (String, email format)
- `password` (String, min 6 chars)

#### Request Example

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "password": "securePassword123"
}
```

#### Response Schema

```typescript
interface LoginResponse {
  success: boolean;
  data: {
    token: string; // JWT token
    user: {
      _id: string;
      name: string;
      email: string;
      role: string;
      specificRole?: string;
      departmentId: string;
      biometricId?: string;
      managerId?: string;
      managerName?: string;
      joiningDate: Date;
      country: string;
      currency: string;
      licenseType: string;
      portalAccess: boolean;
    };
  };
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "staff",
      "specificRole": "Senior Developer",
      "departmentId": "engineering",
      "biometricId": "BIO001",
      "managerId": "507f1f77bcf86cd799439012",
      "managerName": "Jane Smith",
      "joiningDate": "2023-01-15T00:00:00.000Z",
      "country": "AE",
      "currency": "AED",
      "licenseType": "employee",
      "portalAccess": true
    }
  }
}
```

#### Error Responses

**401 Unauthorized**

```json
{
  "success": false,
  "error": {
    "message": "Invalid email or password"
  }
}
```

**401 Unauthorized** (Inactive user)

```json
{
  "success": false,
  "error": {
    "message": "User account is inactive"
  }
}
```

**401 Unauthorized** (No portal access)

```json
{
  "success": false,
  "error": {
    "message": "You do not have portal access"
  }
}
```

#### Response Headers

```
Set-Cookie: access_token=<jwt_token>; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=86400
```

#### JWT Token Payload

```typescript
interface JWTPayload {
  _id: string;
  email: string;
  name: string;
  role: string;
  specificRole?: string;
  departmentId: string;
  active: boolean;
  managerId?: string;
  managerName?: string;
  country: string;
  currency: string;
  licenseType: string;
  portalAccess: boolean;
}
```

#### JWT Token Example

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "email": "john.doe@example.com",
  "name": "John Doe",
  "role": "staff",
  "specificRole": "Senior Developer",
  "departmentId": "engineering",
  "active": true,
  "managerId": "507f1f77bcf86cd799439012",
  "managerName": "Jane Smith",
  "country": "AE",
  "currency": "AED",
  "licenseType": "employee",
  "portalAccess": true
}
```

#### Authentication Notes

- **JWT Token Validity**: 24 hours
- **Cookie Storage**: Token is set in HTTP-only cookie for web applications
- **API Usage**: Include token in Authorization header: `Authorization: Bearer <token>`
- **Password Verification**: Using argon2 hashing algorithm
- **External Users**: Users with `portalAccess: false` cannot login
- **Session Management**: Single token per user (new login invalidates previous tokens)

---

### 2. Forgot Password

**POST** `/api/auth/forgot-password`

Request password reset instructions via email.

#### Request Body Schema

```typescript
interface ForgotPasswordRequest {
  email: string; // Required, email format
}
```

#### Request Body Example

```json
{
  "email": "john.doe@example.com"
}
```

#### Required Fields

- `email` (String, email format)

#### Request Example

```bash
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "john.doe@example.com"
}
```

#### Response Schema

```typescript
interface ForgotPasswordResponse {
  success: boolean;
  data: {
    message: string;
  };
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "message": "Password reset instructions sent to email"
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "User not found with this email"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Failed to send reset email"
  }
}
```

#### Password Reset Process

1. **Token Generation**: Unique reset token generated (cryptographically secure)
2. **Token Storage**: Hashed token stored in `user.resetToken` field
3. **Token Expiry**: Set to 1 hour from generation time
4. **Email Notification**: Reset link sent to user's email with token
5. **Link Format**: `https://app.example.com/reset-password?token=<reset_token>`

#### Security Notes

- Reset token is hashed before storage using strong encryption
- Token expires after 1 hour for security
- If user doesn't exist, returns generic success message (prevents email enumeration)
- Rate limiting should be implemented to prevent abuse

---

### 3. Reset Password

**POST** `/api/auth/reset-password`

Reset user password using the token from email.

#### Request Body Schema

```typescript
interface ResetPasswordRequest {
  token: string; // Required, reset token from email
  password: string; // Required, min 6 chars, new password
}
```

#### Request Body Example

```json
{
  "token": "abc123def456ghi789jkl012",
  "password": "newSecurePassword456"
}
```

#### Required Fields

- `token` (String) - Password reset token from email
- `password` (String, min 6 chars) - New password

#### Request Example

```bash
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "abc123def456ghi789jkl012",
  "password": "newSecurePassword456"
}
```

#### Response Schema

```typescript
interface ResetPasswordResponse {
  success: boolean;
  data: {
    message: string;
  };
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "message": "Password reset successful"
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Invalid or expired reset token"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Password must be at least 6 characters long"
  }
}
```

#### Password Reset Notes

- **Token Validation**: Token is validated against stored hashed version
- **Expiry Check**: Token must not be expired (1 hour validity)
- **Password Hashing**: New password is automatically hashed using argon2
- **Token Cleanup**: Reset token and expiry are cleared after successful reset
- **Re-login Required**: User must login again with the new password
- **Email Notification**: Confirmation email sent after successful password reset

---

### Authentication Flow Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1. POST /auth/login
       │    { email, password }
       │
       ▼
┌─────────────────────────────────────┐
│         Backend API Server          │
│                                     │
│  2. Validate Credentials            │
│     - Check email exists            │
│     - Verify password (argon2)      │
│     - Check active status           │
│     - Check portal access           │
│                                     │
│  3. Generate JWT Token              │
│     - Create payload with user data │
│     - Sign with secret key          │
│     - Set 24h expiration            │
│                                     │
│  4. Set HTTP-Only Cookie            │
│     - Cookie: access_token          │
│     - Secure, SameSite              │
│                                     │
└──────┬──────────────────────────────┘
       │
       │ 5. Response: { token, user }
       │
       ▼
┌─────────────┐
│   Client    │
│             │
│  6. Store   │
│     token   │
│             │
└──────┬──────┘
       │
       │ 7. Subsequent Requests
       │    Authorization: Bearer <token>
       │
       ▼
┌─────────────────────────────────────┐
│         Protected Endpoints         │
│                                     │
│  8. Verify JWT Token                │
│     - Check signature               │
│     - Check expiration              │
│     - Extract user data             │
│                                     │
│  9. Process Request                 │
│                                     │
└─────────────────────────────────────┘
```

---

### Authentication Security Best Practices

#### For API Consumers

1. **Token Storage**

   - Store JWT token securely (HTTP-only cookies recommended)
   - Never expose tokens in client-side logs or console
   - Clear tokens on logout

2. **Password Handling**

   - Never log passwords
   - Use HTTPS for all authentication requests
   - Implement password strength requirements on client side

3. **Token Usage**

   - Include token in Authorization header for API requests
   - Handle token expiration gracefully (redirect to login)
   - Implement token refresh mechanism if needed

4. **Error Handling**
   - Don't expose sensitive information in error messages
   - Implement proper error handling for 401/403 responses
   - Log authentication failures for monitoring

#### For Backend Implementation

1. **Password Security**

   - Use argon2 for password hashing
   - Implement password complexity requirements
   - Store only hashed passwords, never plaintext

2. **Token Security**

   - Use strong secret key for JWT signing
   - Set appropriate token expiration (24 hours)
   - Consider implementing refresh tokens for longer sessions

3. **Rate Limiting**

   - Implement rate limiting on login endpoint
   - Limit password reset requests per IP/user
   - Track and block suspicious activity

4. **Account Security**
   - Lock accounts after multiple failed login attempts
   - Send email notifications for password changes
   - Log all authentication events for audit

---

## User Schema

### Main User Interface (IUser)

The User model is the core entity for managing employees, managers, admins, and external contractors in the HRMS system.

#### Core Fields

| Field          | Type     | Required | Description               | Constraints                                   |
| -------------- | -------- | -------- | ------------------------- | --------------------------------------------- |
| `_id`          | ObjectId | Auto     | Unique user identifier    | MongoDB generated                             |
| `name`         | String   | Yes      | Full name of the user     | Max 100 chars, trimmed                        |
| `email`        | String   | Yes      | Email address             | Unique, lowercase, max 100 chars              |
| `password`     | String   | Yes      | Hashed password           | Min 6 chars (argon2 hashed)                   |
| `role`         | String   | Yes      | User role                 | Enum: 'admin', 'manager', 'staff', 'external' |
| `specificRole` | String   | No       | Specific role designation | Optional designation title                    |
| `isSuperAdmin` | Boolean  | No       | Super admin flag          | Default: false                                |
| `departmentId` | String   | Yes      | Department identifier     | Validated against LOV collection              |
| `managerId`    | ObjectId | No       | Reference to manager      | Reference to User model                       |
| `managerName`  | String   | No       | Manager's name            | Max 100 chars, auto-populated                 |
| `costCenter`   | String   | Yes      | Cost center assignment    | Max 150 chars                                 |
| `employeeCode` | String   | Yes      | Employee code             | Unique, max 50 chars                          |
| `checkinId`    | String   | No       | Check-in system ID        | Unique (sparse), max 20 chars                 |
| `biometricId`  | String   | No       | Biometric device ID       | Unique (sparse), max 20 chars                 |
| `active`       | Boolean  | No       | Active status             | Default: true                                 |

#### Personal Information

| Field              | Type   | Required | Description                  | Constraints                                      |
| ------------------ | ------ | -------- | ---------------------------- | ------------------------------------------------ |
| `joiningDate`      | Date   | Yes      | Date when user joined        | Defaults to current date                         |
| `confirmationDate` | Date   | No       | Employment confirmation date | Optional, defaults to joiningDate                |
| `probationDate`    | String | Yes      | Probation period date        | Max 100 chars                                    |
| `dateOfBirth`      | Date   | No       | Date of birth                | Optional                                         |
| `gender`           | String | No       | Gender                       | Max 50 chars                                     |
| `nationality`      | String | No       | Nationality                  | Max 100 chars                                    |
| `location`         | String | No       | Work location                | Max 100 chars                                    |
| `phone`            | String | No       | Contact number               | Max 20 chars                                     |
| `address`          | String | No       | Residential address          | Max 200 chars                                    |
| `bloodGroup`       | String | No       | Blood group                  | Max 5 chars                                      |
| `fatherName`       | String | No       | Father's name                | Max 100 chars                                    |
| `maritalStatus`    | String | No       | Marital status               | Enum: 'Single', 'Married', 'Divorced', 'Widowed' |
| `spouseName`       | String | No       | Spouse's name                | Max 100 chars                                    |
| `personalMailId`   | String | No       | Personal email               | Email format, max 100 chars                      |

#### Emergency Contact (Nested Object)

```typescript
emergencyContact: {
  name?: string;          // Max 100 chars
  relationship?: string;  // Max 50 chars
  address?: string;       // Max 200 chars
  city?: string;          // Max 100 chars
  district?: string;      // Max 100 chars
  state?: string;         // Max 100 chars
  country?: string;       // Max 100 chars
  pincode?: number;
  mobileNo?: string;      // Max 20 chars
}
```

#### Employment Details

| Field              | Type   | Required | Description                   | Constraints   |
| ------------------ | ------ | -------- | ----------------------------- | ------------- |
| `employmentStatus` | String | Yes      | Employment status             | Max 100 chars |
| `noticePeriod`     | Number | Yes      | Notice period in days         | Min: 0        |
| `separationDate`   | Date   | No       | Separation/exit date          | Optional      |
| `uan`              | String | No       | Universal Account Number (PF) | Max 50 chars  |
| `pfNumber`         | String | No       | Provident Fund number         | Max 50 chars  |
| `pfJoinDate`       | Date   | No       | PF joining date               | Optional      |
| `familyPfNumber`   | String | No       | Family PF number              | Max 50 chars  |

#### Country & Currency Support

| Field          | Type    | Required | Description              | Constraints                                       |
| -------------- | ------- | -------- | ------------------------ | ------------------------------------------------- |
| `country`      | String  | No       | Country code             | Enum: 'IN', 'AE', Default: 'IN'                   |
| `currency`     | String  | Yes      | Currency code            | Enum: 'INR', 'AED', Default: 'INR'                |
| `licenseType`  | String  | No       | User license type        | Enum: 'employee', 'external', Default: 'employee' |
| `portalAccess` | Boolean | No       | Portal access permission | Default: true, false for external                 |
| `client`       | String  | No       | Client assignment        | Max 100 chars (for external users)                |

#### UAE-Specific Visa Details (Nested Object)

```typescript
visaDetails: {
  visaType?: 'Standard Employment Visa' | 'Domestic Worker Visa' | 'Green Visa';
  visaExpiryDate?: Date;    // Must be future date
  isActive?: boolean;
}
```

#### Shift Information

```typescript
// Current shift assignment data
currentShiftAssignmentData: {
  startDate: Date | string;
  endDate: Date | string | null;
  shiftCode: string;
  shiftId: ObjectId;
  shiftAssignmentId: ObjectId;
} | null;

// Upcoming shift assignment data
upcomingShiftAssignmentData: {
  startDate: Date | string;
  endDate: Date | string | null;
  shiftCode: string;
  shiftId: ObjectId;
  shiftAssignmentId: ObjectId;
} | null;
```

#### Bank Details (Array)

```typescript
bankDetails: Array<{
  accountHolderName: string; // Required
  accountNumber: string; // Required
  bankName: string; // Required
  ifscCode: string; // Required
  isActive: boolean; // Default: false (main account)
}>;
```

#### Government IDs (Nested Object)

```typescript
governmentIds: {
  pan?: {
    number?: string;
    documentUrl?: string;
    documentId?: string;
    verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
  };
  aadhaar?: {
    number?: string;
    documentUrl?: string;
    documentId?: string;
    verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
  };
  passport?: {
    number?: string;
    documentUrl?: string;
    documentId?: string;
    verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
  };
  voterId?: {
    number?: string;
    documentUrl?: string;
    documentId?: string;
    verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
  };
  drivingLicense?: {
    number?: string;
    documentUrl?: string;
    documentId?: string;
    verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
  };
  pf?: {
    number?: string;
    uan?: string;
  };
}
```

#### Academic Details (Array)

```typescript
academicDetails: Array<{
  instituteName?: string; // Max 200 chars
  grade?: string; // Max 50 chars
  yearOfPassing?: string; // Max 10 chars, format: YYYY
  documentUrl?: string; // Max 500 chars
  documentId?: string;
  verificationStatus?: "Pending" | "Verified" | "Rejected";
}>;
```

#### Experience Details (Array)

```typescript
experienceDetails: Array<{
  companyName?: string; // Max 200 chars
  period?: string; // Max 100 chars
  documentUrl?: string; // Max 500 chars
  documentId?: string;
  companyAddress?: string; // Max 300 chars
  lastDrawnSalary?: number; // Min: 0
  reasonForLeaving?: string; // Max 300 chars
  designation?: string; // Max 150 chars
  verificationStatus?: "Pending" | "Verified" | "Rejected";
}>;
```

#### Resignation History (Array)

```typescript
resignations: Array<{
  status: "Pending" | "Approved" | "Rejected" | "Withdrawn";
  summary: string;
  remarks?: string;
  submittedAt: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  withdrawnAt?: Date;
  approvedBy?: ObjectId; // Reference to User
  noticePeriodDays?: number;
  preferredLastWorkingDay?: Date;
  approvedLastWorkingDay?: Date;
  finalSettlementDone: boolean;
  isActive: boolean; // Only one active resignation allowed
}>;
```

#### Holiday Calendar

| Field                    | Type     | Required | Description                     |
| ------------------------ | -------- | -------- | ------------------------------- |
| `holidayCalendarId`      | ObjectId | No       | Reference to holiday calendar   |
| `holidayCalendarHistory` | Array    | No       | History of calendar assignments |

```typescript
holidayCalendarHistory: Array<{
  calendarId: ObjectId; // Required, ref: 'holidaycalendar'
  year: number; // Required
  isActive: boolean; // Default: false
  assignedAt: Date; // Default: now
  assignedBy?: ObjectId; // Reference to User
}>;
```

#### Other Fields

| Field              | Type       | Description                                           |
| ------------------ | ---------- | ----------------------------------------------------- |
| `certificateIds`   | ObjectId[] | References to Document collection                     |
| `fcmToken`         | String     | Firebase Cloud Messaging token for push notifications |
| `resetToken`       | String     | Password reset token (hidden in queries)              |
| `resetTokenExpiry` | Date       | Reset token expiration (hidden in queries)            |
| `createdAt`        | Date       | Auto-generated timestamp                              |
| `updatedAt`        | Date       | Auto-generated timestamp                              |

#### Virtual Fields

```typescript
// Calculated from joiningDate
currentCompanyExperience: {
  years: number; // Total years (decimal)
  months: number; // Remaining months (decimal)
  totalMonths: number; // Total months
}
```

#### Indexes

- `email` - Unique index
- `employeeCode` - Unique index
- `checkinId` - Unique sparse index
- `biometricId` - Unique sparse index
- `managerId` - Regular index
- `role` - Regular index
- `active` - Regular index
- `country` - Regular index
- `licenseType` - Regular index
- `portalAccess` - Regular index
- `client` - Regular index

#### Pre-Save Hooks

1. **Password Hashing**: Automatically hashes password using argon2 if modified
2. **Manager Name Population**: Auto-populates managerName from managerId
3. **SuperAdmin Validation**: Ensures SuperAdmin has role 'admin' and no manager
4. **External User Defaults**: Sets portalAccess to false for external users
5. **Employee Code Uniqueness**: Validates unique employeeCode
6. **Auto-Confirmation**: Sets status to "Confirmed" after 180 days from joining
7. **UAE Visa Validation**: Validates visa details for UAE employees

---

## User Management APIs

### Base URL

```
/api/users
```

All user management endpoints require authentication via JWT token.

---

### 1. Get Users (Unified Endpoint)

**GET** `/api/users`

Unified endpoint to retrieve users with flexible filtering options.

#### Query Parameters

| Parameter      | Type    | Required | Description                                             |
| -------------- | ------- | -------- | ------------------------------------------------------- |
| `page`         | Number  | No       | Page number (default: 1, min: 1)                        |
| `limit`        | Number  | No       | Records per page (default: 10, max: 100)                |
| `my`           | Boolean | No       | Get current user profile (overrides other filters)      |
| `subordinates` | Boolean | No       | Get subordinates of current user (manager/admin only)   |
| `search`       | String  | No       | Search by name, email, role, or department              |
| `role`         | String  | No       | Filter by role: 'admin', 'manager', 'staff', 'external' |
| `status`       | String  | No       | Filter by status: 'active', 'inactive'                  |
| `active`       | Boolean | No       | Filter by active status (true/false)                    |
| `departmentId` | String  | No       | Filter by department ID                                 |
| `country`      | String  | No       | Filter by country: 'IN', 'AE'                           |
| `licenseType`  | String  | No       | Filter by license type: 'employee', 'external'          |
| `portalAccess` | Boolean | No       | Filter by portal access                                 |
| `sort`         | String  | No       | Field to sort by (default: 'name')                      |
| `sortOrder`    | String  | No       | Sort order: 'asc', 'desc' (default: 'asc')              |
| `select`       | String  | No       | Comma-separated list of fields to include               |

#### Request Example

```bash
GET /api/users?page=1&limit=10&role=staff&active=true&country=AE
Authorization: Bearer <token>
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "staff",
      "specificRole": "Senior Developer",
      "departmentId": "engineering",
      "managerId": "507f1f77bcf86cd799439012",
      "managerName": "Jane Smith",
      "employeeCode": "EMP001",
      "biometricId": "BIO001",
      "active": true,
      "joiningDate": "2023-01-15T00:00:00.000Z",
      "location": "Dubai",
      "phone": "+971501234567",
      "country": "AE",
      "currency": "AED",
      "licenseType": "employee",
      "portalAccess": true,
      "visaDetails": {
        "visaType": "Standard Employment Visa",
        "visaExpiryDate": "2025-12-31T00:00:00.000Z",
        "isActive": true
      },
      "currentCompanyExperience": {
        "years": 1.8,
        "months": 0.96,
        "totalMonths": 23
      },
      "createdAt": "2023-01-15T10:30:00.000Z",
      "updatedAt": "2024-12-01T14:20:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

#### Error Responses

**403 Forbidden**

```json
{
  "success": false,
  "error": {
    "message": "Access denied: Only managers or admins can view subordinates"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Invalid query parameters"
  }
}
```

---

### 2. Get User by ID

**GET** `/api/users/:id`

Retrieve detailed information about a specific user by ID.

#### URL Parameters

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| `id`      | String | Yes      | User ID (MongoDB ObjectId) |

#### Request Example

```bash
GET /api/users/507f1f77bcf86cd799439011
Authorization: Bearer <token>
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "role": "staff",
    "specificRole": "Senior Developer",
    "departmentId": "engineering",
    "managerId": "507f1f77bcf86cd799439012",
    "managerName": "Jane Smith",
    "costCenter": "Dubai Office",
    "employeeCode": "EMP001",
    "biometricId": "BIO001",
    "active": true,
    "joiningDate": "2023-01-15T00:00:00.000Z",
    "confirmationDate": "2023-07-15T00:00:00.000Z",
    "probationDate": "2023-07-15",
    "location": "Dubai",
    "phone": "+971501234567",
    "emergencyContact": {
      "name": "Jane Doe",
      "relationship": "Spouse",
      "mobileNo": "+971509876543",
      "country": "AE"
    },
    "address": "123 Main St, Dubai",
    "bloodGroup": "O+",
    "dateOfBirth": "1990-05-20T00:00:00.000Z",
    "nationality": "Indian",
    "employmentStatus": "Confirmed",
    "noticePeriod": 60,
    "country": "AE",
    "currency": "AED",
    "licenseType": "employee",
    "portalAccess": true,
    "visaDetails": {
      "visaType": "Standard Employment Visa",
      "visaExpiryDate": "2025-12-31T00:00:00.000Z",
      "isActive": true
    },
    "bankDetails": [
      {
        "accountHolderName": "John Doe",
        "accountNumber": "1234567890",
        "bankName": "Emirates NBD",
        "ifscCode": "EBNB0000001",
        "isActive": true
      }
    ],
    "governmentIds": {
      "passport": {
        "number": "X1234567",
        "documentUrl": "https://storage.googleapis.com/...",
        "documentId": "doc123",
        "verificationStatus": "Verified"
      }
    },
    "academicDetails": [
      {
        "instituteName": "University of Example",
        "grade": "First Class",
        "yearOfPassing": "2012",
        "documentUrl": "https://storage.googleapis.com/...",
        "documentId": "doc456",
        "verificationStatus": "Verified"
      }
    ],
    "experienceDetails": [
      {
        "companyName": "Previous Company Ltd",
        "period": "Jan 2020 - Dec 2022",
        "designation": "Developer",
        "lastDrawnSalary": 15000,
        "documentUrl": "https://storage.googleapis.com/...",
        "documentId": "doc789",
        "verificationStatus": "Verified"
      }
    ],
    "currentCompanyExperience": {
      "years": 1.8,
      "months": 0.96,
      "totalMonths": 23
    },
    "createdAt": "2023-01-15T10:30:00.000Z",
    "updatedAt": "2024-12-01T14:20:00.000Z"
  }
}
```

#### Error Responses

**404 Not Found**

```json
{
  "success": false,
  "error": {
    "message": "User not found"
  }
}
```

---

### 3. Get Users for Payroll

**GET** `/api/users/payroll`

Get users list with filters specific to payroll processing.

#### Query Parameters

| Parameter      | Type    | Required | Description                                      |
| -------------- | ------- | -------- | ------------------------------------------------ |
| `page`         | Number  | No       | Page number (default: 1)                         |
| `limit`        | Number  | No       | Records per page (default: 10)                   |
| `month`        | String  | No       | Month filter in format 'YYYY-MM'                 |
| `departmentId` | String  | No       | Filter by department                             |
| `status`       | Array   | No       | Array of status: 'Active', 'On Hold', 'Resigned' |
| `active`       | Boolean | No       | Filter by active status                          |
| `role`         | String  | No       | Filter by role                                   |
| `search`       | String  | No       | Search by name or email                          |
| `country`      | String  | No       | Filter by country: 'AE', 'IN'                    |

#### Request Example

```bash
GET /api/users/payroll?month=2024-12&active=true&country=AE
Authorization: Bearer <token>
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "staff",
      "employeeCode": "EMP001",
      "active": true,
      "joiningDate": "2023-01-15T00:00:00.000Z",
      "country": "AE",
      "currency": "AED"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### 4. Create User

**POST** `/api/users`

Create a new user in the system.

#### Request Body

```json
{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "securePassword123",
  "role": "staff",
  "specificRole": "Senior Developer",
  "departmentId": "engineering",
  "managerId": "507f1f77bcf86cd799439012",
  "costCenter": "Dubai Office",
  "employeeCode": "EMP001",
  "biometricId": "BIO001",
  "active": true,
  "joiningDate": "2023-01-15",
  "confirmationDate": "2023-07-15",
  "probationDate": "2023-07-15",
  "dateOfBirth": "1990-05-20",
  "location": "Dubai",
  "phone": "+971501234567",
  "emergencyContact": {
    "name": "Jane Doe",
    "relationship": "Spouse",
    "mobileNo": "+971509876543",
    "country": "AE"
  },
  "address": "123 Main St, Dubai",
  "bloodGroup": "O+",
  "nationality": "Indian",
  "employmentStatus": "Probation",
  "noticePeriod": 60,
  "country": "AE",
  "currency": "AED",
  "licenseType": "employee",
  "portalAccess": true,
  "visaDetails": {
    "visaType": "Standard Employment Visa",
    "visaExpiryDate": "2025-12-31",
    "isActive": true
  },
  "client": null,
  "bankDetails": [
    {
      "accountHolderName": "John Doe",
      "accountNumber": "1234567890",
      "bankName": "Emirates NBD",
      "ifscCode": "EBNB0000001",
      "isActive": true
    }
  ],
  "governmentIds": {
    "passport": {
      "number": "X1234567"
    }
  },
  "academicDetails": [
    {
      "instituteName": "University of Example",
      "grade": "First Class",
      "yearOfPassing": "2012"
    }
  ],
  "experienceDetails": [
    {
      "companyName": "Previous Company Ltd",
      "period": "Jan 2020 - Dec 2022",
      "designation": "Developer",
      "lastDrawnSalary": 15000
    }
  ]
}
```

#### Required Fields

- `name` (String, 2-100 chars)
- `email` (Email format)
- `password` (Min 6 chars)
- `role` (Enum: admin/manager/staff/external)
- `departmentId` (Valid department from LOV)
- `costCenter` (Max 150 chars)
- `currency` (Enum: INR/AED)
- `employmentStatus` (Max 100 chars)
- `probationDate` (String/Date)
- `noticePeriod` (Number, min: 0)

#### Request Example

```bash
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john.doe@example.com",
  "password": "securePassword123",
  ...
}
```

#### Response Example (201 Created)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "role": "staff",
    ...
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Employee code \"EMP001\" already exists. Please use a unique employee code."
  }
}
```

**400 Bad Request** (Email exists)

```json
{
  "success": false,
  "error": {
    "message": "Email \"john.doe@example.com\" already exists for an active user."
  }
}
```

#### Notes

- Welcome email is automatically sent to the user upon creation (for active users only)
- If password is "123456" (default), it's included in the welcome email
- Manager name is auto-populated from managerId
- Password is automatically hashed using argon2
- For UAE users (country: 'AE'), biometricId is not required
- Confirmation date defaults to joining date if not provided

---

### 5. Update User

**PUT** `/api/users/:id`

Update an existing user's information.

#### URL Parameters

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| `id`      | String | Yes      | User ID (MongoDB ObjectId) |

#### Request Body

All fields are optional. Only provide fields you want to update.

```json
{
  "name": "John Doe Updated",
  "email": "john.new@example.com",
  "role": "manager",
  "specificRole": "Team Lead",
  "departmentId": "engineering",
  "managerId": "507f1f77bcf86cd799439013",
  "employeeCode": "EMP001A",
  "biometricId": "BIO002",
  "active": true,
  "joiningDate": "2023-01-15",
  "confirmationDate": "2023-07-15",
  "probationDate": "2023-07-15",
  "location": "Dubai",
  "phone": "+971501234567",
  "emergencyContact": {
    "name": "Jane Doe",
    "relationship": "Spouse",
    "mobileNo": "+971509876543"
  },
  "address": "New Address",
  "bloodGroup": "O+",
  "dateOfBirth": "1990-05-20",
  "nationality": "Indian",
  "employmentStatus": "Confirmed",
  "country": "AE",
  "currency": "AED",
  "licenseType": "employee",
  "portalAccess": true,
  "visaDetails": {
    "visaType": "Green Visa",
    "visaExpiryDate": "2026-12-31",
    "isActive": true
  },
  "client": null,
  "bankDetails": [
    {
      "accountHolderName": "John Doe",
      "accountNumber": "9876543210",
      "bankName": "ADCB",
      "ifscCode": "ADCB0000001",
      "isActive": true
    }
  ],
  "confirmationDate": "2023-07-15",
  "probationDate": "2023-07-15",
  "separationDate": null,
  "fatherName": "Robert Doe",
  "maritalStatus": "Married",
  "spouseName": "Jane Doe",
  "noticePeriod": 90,
  "personalMailId": "john.personal@gmail.com"
}
```

#### Request Example

```bash
PUT /api/users/507f1f77bcf86cd799439011
Authorization: Bearer <token>
Content-Type: application/json

{
  "active": false,
  "separationDate": "2024-12-31"
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe Updated",
    "email": "john.new@example.com",
    "active": false,
    "separationDate": "2024-12-31T00:00:00.000Z",
    ...
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "User not found"
  }
}
```

**400 Bad Request** (Restricted field edit)

```json
{
  "success": false,
  "error": {
    "message": "You cannot edit role on your own profile. Please contact an administrator."
  }
}
```

#### Notes

- Employees (staff/external) cannot edit sensitive fields on their own profile
- Restricted fields for self-edit: role, specificRole, departmentId, managerId, employeeCode, active, joiningDate, confirmationDate, probationDate, dateOfBirth, country, currency, licenseType, portalAccess, visaDetails, client
- Active status can be updated to true or false (soft delete)
- Email uniqueness is validated only for active users
- Manager name is auto-updated if managerId is changed

---

### 6. Delete User (Soft Delete)

**DELETE** `/api/users/:id`

Soft delete a user by setting their active status to false.

#### URL Parameters

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| `id`      | String | Yes      | User ID (MongoDB ObjectId) |

#### Request Example

```bash
DELETE /api/users/507f1f77bcf86cd799439011
Authorization: Bearer <token>
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "message": "User deactivated successfully"
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "User not found"
  }
}
```

---

### 7. Update FCM Token

**PATCH** `/api/users/:id/fcm-token`

Update the Firebase Cloud Messaging token for push notifications.

#### URL Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `id`      | String | Yes      | User ID     |

#### Request Body

```json
{
  "fcmToken": "eXaMpLe_FcM_ToKeN_StRiNg..."
}
```

#### Request Example

```bash
PATCH /api/users/507f1f77bcf86cd799439011/fcm-token
Authorization: Bearer <token>
Content-Type: application/json

{
  "fcmToken": "eXaMpLe_FcM_ToKeN_StRiNg..."
}
```

#### Response Example (200 OK)

**For Admin User (with visa expiry check)**

```json
{
  "success": true,
  "data": {
    "message": "FCM token updated successfully",
    "adminNotification": {
      "sent": true,
      "title": "Visa Expiry Alert",
      "body": "3 UAE employee visa(s) expiring in 30 days: 2 Standard Employment Visa, 1 Green Visa (1 urgent - expiring within 7 days)",
      "visaCount": 3,
      "userNames": "Ahmed Ali, Sarah Khan, Mohammed Hassan"
    }
  }
}
```

**For Regular User**

```json
{
  "success": true,
  "data": {
    "message": "FCM token updated successfully"
  }
}
```

**For Admin User (no expiring visas)**

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

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "User not found"
  }
}
```

#### Notes

- When admin logs in, the system automatically checks for UAE visas expiring in the next 30 days
- If expiring visas found, admin receives a push notification with details
- FCM token update succeeds even if visa notification fails

---

### 8. Export Users to Excel

**GET** `/api/users/export`

Download all active users data as an Excel file.

#### Authorization

Only admins and managers can export user data.

#### Request Example

```bash
GET /api/users/export
Authorization: Bearer <token>
```

#### Response

Binary Excel file (`.xlsx`) with the following columns:

- Name
- Email
- Employee Code
- Role
- Department ID
- Manager Name
- Biometric ID
- Active
- Joining Date
- Country
- Location
- Phone
- License Type
- Portal Access
- Visa Type
- Visa Expiry Date
- Visa Is Active
- Client

#### Response Headers

```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="users_export.xlsx"
```

#### Error Responses

**403 Forbidden**

```json
{
  "success": false,
  "error": {
    "message": "Access denied: Only admins and managers can export user data"
  }
}
```

---

### 9. Upload Government ID Files

**POST** `/api/users/:id/government-ids/files`

Upload government ID documents (PAN, Aadhaar, Passport, Voter ID, Driving License).

#### URL Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `id`      | String | Yes      | User ID     |

#### Request (Multipart Form Data)

```
Content-Type: multipart/form-data

pan_file: [File]
passport_file: [File]
aadhaar_file: [File]
voterId_file: [File]
drivingLicense_file: [File]
verificationStatus: "Verified" | "Pending" | "Rejected"
```

#### Field Names

- `pan_file` or `pan` - PAN Card document
- `passport_file` or `passport` - Passport document
- `aadhaar_file` or `aadhaar` - Aadhaar Card document
- `voterId_file` or `voterId` - Voter ID document
- `drivingLicense_file` or `drivingLicense` - Driving License document

#### Request Example

```bash
POST /api/users/507f1f77bcf86cd799439011/government-ids/files
Authorization: Bearer <token>
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="pan_file"; filename="pan_card.pdf"
Content-Type: application/pdf

[Binary file data]
--boundary
Content-Disposition: form-data; name="verificationStatus"

Verified
--boundary--
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "governmentIds": {
      "pan": {
        "number": "ABCDE1234F",
        "documentUrl": "https://storage.googleapis.com/.../GovernmentId_pan_John_Doe_2024-12-12T10-30-00.pdf",
        "documentId": "doc123",
        "verificationStatus": "Verified"
      }
    },
    ...
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "No files uploaded"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Failed to process PAN Card file: Upload error"
  }
}
```

#### Notes

- Files are uploaded to Google Cloud Storage
- Documents are automatically created in the Document collection
- Document URLs and IDs are stored in user's governmentIds
- Admin uploads are automatically marked as "Verified"
- Employee uploads are marked as "Pending" by default
- Files are cleaned up from local storage after upload

---

### 10. Upload Academic Detail Document

**POST** `/api/users/:id/academic-details/files?index={index}`

Upload academic certificate/document for a specific academic detail entry.

#### URL Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `id`      | String | Yes      | User ID     |

#### Query Parameters

| Parameter | Type   | Required | Description                              |
| --------- | ------ | -------- | ---------------------------------------- |
| `index`   | Number | Yes      | Index of academic detail entry (0-based) |

#### Request (Multipart Form Data)

```
Content-Type: multipart/form-data

file: [File]
instituteName: "University Name"
yearOfPassing: "2012"
verificationStatus: "Verified" | "Pending" | "Rejected"
```

#### Request Example

```bash
POST /api/users/507f1f77bcf86cd799439011/academic-details/files?index=0
Authorization: Bearer <token>
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="degree.pdf"
Content-Type: application/pdf

[Binary file data]
--boundary
Content-Disposition: form-data; name="instituteName"

University of Example
--boundary
Content-Disposition: form-data; name="yearOfPassing"

2012
--boundary
Content-Disposition: form-data; name="verificationStatus"

Verified
--boundary--
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "academicDetails": [
        {
          "instituteName": "University of Example",
          "grade": "First Class",
          "yearOfPassing": "2012",
          "documentUrl": "https://storage.googleapis.com/.../Academic_University_of_Example_John_Doe_2024-12-12T10-30-00.pdf",
          "documentId": "doc456",
          "verificationStatus": "Verified"
        }
      ]
    },
    "document": {
      "_id": "doc456",
      "fileName": "Academic_University_of_Example_John_Doe_2024-12-12T10-30-00.pdf",
      "filePath": "https://storage.googleapis.com/...",
      "type": "Academic",
      "category": "Certification"
    }
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "No file uploaded"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Invalid academic detail index"
  }
}
```

#### Notes

- If academic detail at the specified index doesn't exist, it will be created
- Metadata (instituteName, yearOfPassing) can be provided with the file upload
- Document is uploaded to GCP and stored in Document collection
- Admin uploads are automatically marked as "Verified"

---

### 11. Upload Experience Detail Document

**POST** `/api/users/:id/experience-details/files?index={index}`

Upload experience certificate/document for a specific experience detail entry.

#### URL Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `id`      | String | Yes      | User ID     |

#### Query Parameters

| Parameter | Type   | Required | Description                                |
| --------- | ------ | -------- | ------------------------------------------ |
| `index`   | Number | Yes      | Index of experience detail entry (0-based) |

#### Request (Multipart Form Data)

```
Content-Type: multipart/form-data

file: [File]
companyName: "Company Name"
period: "Jan 2020 - Dec 2022"
verificationStatus: "Verified" | "Pending" | "Rejected"
```

#### Request Example

```bash
POST /api/users/507f1f77bcf86cd799439011/experience-details/files?index=0
Authorization: Bearer <token>
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="experience_letter.pdf"
Content-Type: application/pdf

[Binary file data]
--boundary
Content-Disposition: form-data; name="companyName"

Previous Company Ltd
--boundary
Content-Disposition: form-data; name="period"

Jan 2020 - Dec 2022
--boundary
Content-Disposition: form-data; name="verificationStatus"

Verified
--boundary--
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "experienceDetails": [
        {
          "companyName": "Previous Company Ltd",
          "period": "Jan 2020 - Dec 2022",
          "designation": "Developer",
          "lastDrawnSalary": 15000,
          "documentUrl": "https://storage.googleapis.com/.../Experience_Previous_Company_Ltd_John_Doe_2024-12-12T10-30-00.pdf",
          "documentId": "doc789",
          "verificationStatus": "Verified"
        }
      ]
    },
    "document": {
      "_id": "doc789",
      "fileName": "Experience_Previous_Company_Ltd_John_Doe_2024-12-12T10-30-00.pdf",
      "filePath": "https://storage.googleapis.com/...",
      "type": "Experience",
      "category": "Certification"
    }
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "No file uploaded"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Invalid experience detail index"
  }
}
```

#### Notes

- If experience detail at the specified index doesn't exist, it will be created
- Metadata (companyName, period) can be provided with the file upload
- Document is uploaded to GCP and stored in Document collection
- Admin uploads are automatically marked as "Verified"

---

### 12. Notification APIs

#### 12.1 Test Notification (by User ID)

**GET** `/api/users/test-notify?userId={userId}&title={title}&body={body}`

Send a test notification to a specific user.

#### Query Parameters

| Parameter | Type   | Required | Description                                       |
| --------- | ------ | -------- | ------------------------------------------------- |
| `userId`  | String | Yes      | User ID                                           |
| `title`   | String | No       | Notification title (default: "Test Notification") |
| `body`    | String | No       | Notification body (default: "Hi from Backend!")   |

#### Request Example

```bash
GET /api/users/test-notify?userId=507f1f77bcf86cd799439011&title=Hello&body=Test%20message
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "message": "Notification sent successfully",
  "data": {
    "success": true,
    "messageId": "projects/myproject/messages/0:1234567890",
    "userId": "507f1f77bcf86cd799439011",
    "title": "Hello",
    "body": "Test message",
    "fcmToken": "eXaMpLe_FcM_ToKeN...",
    "userInfo": {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "fcmTokenExists": true
    }
  }
}
```

#### Error Responses

**404 Not Found**

```json
{
  "success": false,
  "error": {
    "message": "User not found"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "User does not have FCM token registered"
  }
}
```

---

#### 12.2 Test Notification (by FCM Token)

**POST** `/api/users/test-notify-token`

Send a test notification directly using FCM token.

#### Request Body

```json
{
  "fcmToken": "eXaMpLe_FcM_ToKeN_StRiNg...",
  "title": "BE Trigger Token Test",
  "body": "Testing with FCM token directly!",
  "data": {
    "custom_key": "custom_value"
  }
}
```

#### Request Example

```bash
POST /api/users/test-notify-token
Content-Type: application/json

{
  "fcmToken": "eXaMpLe_FcM_ToKeN_StRiNg...",
  "title": "Hello",
  "body": "Test message"
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "message": "Direct token notification sent successfully",
  "data": {
    "messageId": "projects/myproject/messages/0:1234567890",
    "fcmToken": "eXaMpLe_FcM_ToKeN...",
    "title": "Hello",
    "body": "Test message"
  }
}
```

---

#### 12.3 Debug FCM Token

**GET** `/api/users/debug-fcm-token?userId={userId}`

Get FCM token information for a user (for debugging).

#### Query Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `userId`  | String | Yes      | User ID     |

#### Request Example

```bash
GET /api/users/debug-fcm-token?userId=507f1f77bcf86cd799439011
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "fcmToken": "eXaMpLe_FcM_ToKeN_StRiNg_VeRy_LoNg...",
    "fcmTokenExists": true,
    "fcmTokenLength": 163,
    "fcmTokenPreview": "eXaMpLe_FcM_ToKeN_S..."
  }
}
```

---

#### 12.4 Test Bulk Notifications

**POST** `/api/users/test-bulk-notify`

Send test notifications to multiple users.

#### Request Body

```json
{
  "userIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ],
  "title": "Bulk Test Notification",
  "body": "This is a bulk test notification",
  "data": {
    "type": "test",
    "action": "view_details"
  }
}
```

#### Request Example

```bash
POST /api/users/test-bulk-notify
Authorization: Bearer <token>
Content-Type: application/json

{
  "userIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
  "title": "Hello",
  "body": "Bulk message"
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "message": "Bulk notifications sent successfully",
  "data": {
    "success": true,
    "successCount": 2,
    "failureCount": 0,
    "responses": [
      {
        "success": true,
        "messageId": "projects/myproject/messages/0:1234567890"
      },
      {
        "success": true,
        "messageId": "projects/myproject/messages/0:1234567891"
      }
    ]
  }
}
```

---

#### 12.5 Check Visa Expiry and Notify Admin

**GET** `/api/users/check-visa-expiry?adminUserId={adminUserId}&daysAhead={days}`

Check for UAE employees with visas expiring soon and send notification to admin.

#### Query Parameters

| Parameter     | Type   | Required | Description                        |
| ------------- | ------ | -------- | ---------------------------------- |
| `adminUserId` | String | Yes      | Admin user ID to send notification |
| `daysAhead`   | Number | No       | Days ahead to check (default: 30)  |

#### Request Example

```bash
GET /api/users/check-visa-expiry?adminUserId=507f1f77bcf86cd799439001&daysAhead=30
Authorization: Bearer <token>
```

#### Response Example (200 OK) - With Expiring Visas

```json
{
  "success": true,
  "message": "Visa expiry check completed and notification sent",
  "data": {
    "visaData": {
      "totalCount": 3,
      "visaTypeBreakdown": {
        "Standard Employment Visa": 2,
        "Green Visa": 1
      },
      "expiringVisas": [
        {
          "name": "Ahmed Ali",
          "email": "ahmed@example.com",
          "visaType": "Standard Employment Visa",
          "expiryDate": "2025-01-05T00:00:00.000Z",
          "daysUntilExpiry": 5
        },
        {
          "name": "Sarah Khan",
          "email": "sarah@example.com",
          "visaType": "Standard Employment Visa",
          "expiryDate": "2025-01-15T00:00:00.000Z",
          "daysUntilExpiry": 15
        },
        {
          "name": "Mohammed Hassan",
          "email": "mohammed@example.com",
          "visaType": "Green Visa",
          "expiryDate": "2025-02-01T00:00:00.000Z",
          "daysUntilExpiry": 32
        }
      ],
      "checkDate": "2024-12-12T10:30:00.000Z",
      "expiryThreshold": "2025-01-11T10:30:00.000Z"
    },
    "notification": {
      "title": "Visa Expiry Alert",
      "body": "3 UAE employee visa(s) expiring in 30 days: 2 Standard Employment Visa, 1 Green Visa (1 urgent - expiring within 7 days)",
      "data": {
        "type": "visa_expiry",
        "count": "3",
        "urgent_count": "1",
        "action": "review_required",
        "visa_types": "Standard Employment Visa,Green Visa",
        "user_names": "Ahmed Ali, Sarah Khan, Mohammed Hassan",
        "error": "false"
      }
    },
    "notificationResult": {
      "success": true,
      "messageId": "projects/myproject/messages/0:1234567890"
    },
    "notificationSent": true
  }
}
```

#### Response Example (200 OK) - No Expiring Visas

```json
{
  "success": true,
  "message": "Visa expiry check completed - no expiring visas found",
  "data": {
    "visaData": {
      "totalCount": 0,
      "visaTypeBreakdown": {},
      "expiringVisas": [],
      "checkDate": "2024-12-12T10:30:00.000Z",
      "expiryThreshold": "2025-01-11T10:30:00.000Z"
    },
    "notificationSent": false,
    "reason": "no_expiring_visas"
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Target user must be an admin"
  }
}
```

---

#### 12.6 Send Notification to Multiple Users

**POST** `/api/users/send-notification`

Send notification to multiple users (Admin only).

#### Request Body

```json
{
  "userIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
  "title": "Important Announcement",
  "body": "Please check your email for important updates",
  "data": {
    "type": "announcement",
    "action": "view_details"
  }
}
```

#### Request Example

```bash
POST /api/users/send-notification
Authorization: Bearer <token>
Content-Type: application/json

{
  "userIds": ["507f1f77bcf86cd799439011"],
  "title": "Hello",
  "body": "Important message"
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "message": "Bulk notifications sent",
  "data": {
    "success": true,
    "successCount": 1,
    "failureCount": 0,
    "responses": [
      {
        "success": true,
        "messageId": "projects/myproject/messages/0:1234567890"
      }
    ]
  }
}
```

#### Error Responses

**403 Forbidden**

```json
{
  "success": false,
  "error": {
    "message": "Forbidden: Only admins can send bulk notifications"
  }
}
```

---

## User Profile APIs

### Base URL

```
/api/user-profile
```

---

### 1. Get User Profile with Country-Specific Data

**GET** `/api/user-profile/profile`

Retrieve current user's profile with country-specific configuration.

#### Request Example

```bash
GET /api/user-profile/profile
Authorization: Bearer <token>
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "staff",
      "departmentId": "engineering",
      "country": "AE",
      "currency": "AED",
      "licenseType": "employee",
      "portalAccess": true,
      "joiningDate": "2023-01-15T10:30:00.000Z"
    },
    "countryConfig": {
      "timezone": "Asia/Dubai",
      "dateFormat": "DD/MM/YYYY",
      "taxSystem": "none",
      "workingDays": [0, 1, 2, 3, 4],
      "defaultWorkingHours": 8
    },
    "welcomeMessage": "مرحباً! Welcome to UAE operations.",
    "userType": "Employee"
  }
}
```

#### Error Responses

**401 Unauthorized**

```json
{
  "success": false,
  "error": {
    "message": "User not authenticated"
  }
}
```

---

### 2. Update User Country Preferences

**PUT** `/api/user-profile/profile/country`

Update user's country and currency preferences.

#### Request Body

```json
{
  "country": "AE",
  "currency": "AED"
}
```

#### Request Example

```bash
PUT /api/user-profile/profile/country
Authorization: Bearer <token>
Content-Type: application/json

{
  "country": "AE",
  "currency": "AED"
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "message": "Country preferences updated successfully",
    "updatedFields": {
      "country": "AE",
      "currency": "AED"
    }
  }
}
```

#### Error Responses

**401 Unauthorized**

```json
{
  "success": false,
  "error": {
    "message": "User not authenticated"
  }
}
```

---

## User Resignation APIs

### Base URL

```
/api/resignation
```

All resignation endpoints require authentication.

---

### 1. Submit Resignation

**POST** `/api/resignation/:userId/submit`

Submit a resignation request.

#### URL Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `userId`  | String | Yes      | User ID     |

#### Request Body

```json
{
  "summary": "Pursuing higher education opportunities",
  "remarks": "Thank you for the opportunity to work here",
  "preferredLastWorkingDay": "2025-02-28"
}
```

#### Required Fields

- `summary` (String) - Resignation reason

#### Optional Fields

- `remarks` (String) - Additional remarks
- `preferredLastWorkingDay` (Date) - Preferred last working day

#### Request Example

```bash
POST /api/resignation/507f1f77bcf86cd799439011/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "summary": "Pursuing higher education opportunities",
  "preferredLastWorkingDay": "2025-02-28"
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "resignation": {
      "status": "Pending",
      "summary": "Pursuing higher education opportunities",
      "remarks": "Thank you for the opportunity to work here",
      "submittedAt": "2024-12-12T10:30:00.000Z",
      "preferredLastWorkingDay": "2025-02-28T00:00:00.000Z",
      "finalSettlementDone": false,
      "isActive": true
    }
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Cannot apply: There is already a pending resignation."
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Cannot apply: There is already a Approved resignation."
  }
}
```

#### Notes

- Only one active resignation is allowed at a time
- Cannot submit new resignation if there's already a pending or approved resignation
- All previous resignations are marked as inactive when new resignation is submitted
- Email notification is sent to HR upon submission

---

### 2. Withdraw Resignation

**PUT** `/api/resignation/:userId/withdraw`

Withdraw a pending resignation request.

#### URL Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `userId`  | String | Yes      | User ID     |

#### Request Example

```bash
PUT /api/resignation/507f1f77bcf86cd799439011/withdraw
Authorization: Bearer <token>
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "resignation": [
      {
        "status": "Withdrawn",
        "summary": "Pursuing higher education opportunities",
        "submittedAt": "2024-12-12T10:30:00.000Z",
        "withdrawnAt": "2024-12-13T09:15:00.000Z",
        "isActive": false
      }
    ]
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "No active resignation to withdraw"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "User not found"
  }
}
```

#### Notes

- Can only withdraw resignations with status "Pending"
- Resignation is marked as inactive after withdrawal

---

### 3. Approve Resignation (Manager/Admin)

**PUT** `/api/resignation/:userId/approve`

Approve a pending resignation request.

#### URL Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `userId`  | String | Yes      | User ID     |

#### Request Body

```json
{
  "remarks": "Approved. Best wishes for your future endeavors.",
  "noticePeriodDays": 60,
  "approvedLastWorkingDay": "2025-02-15"
}
```

#### Required Fields

- `noticePeriodDays` (Number, min: 1) - Notice period in days
- `approvedLastWorkingDay` (Date) - Approved last working day

#### Optional Fields

- `remarks` (String) - Approval remarks

#### Request Example

```bash
PUT /api/resignation/507f1f77bcf86cd799439011/approve
Authorization: Bearer <token>
Content-Type: application/json

{
  "noticePeriodDays": 60,
  "approvedLastWorkingDay": "2025-02-15"
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "resignation": [
      {
        "status": "Approved",
        "summary": "Pursuing higher education opportunities",
        "remarks": "Approved. Best wishes for your future endeavors.",
        "submittedAt": "2024-12-12T10:30:00.000Z",
        "approvedAt": "2024-12-13T10:00:00.000Z",
        "approvedBy": "507f1f77bcf86cd799439012",
        "noticePeriodDays": 60,
        "preferredLastWorkingDay": "2025-02-28T00:00:00.000Z",
        "approvedLastWorkingDay": "2025-02-15T00:00:00.000Z",
        "finalSettlementDone": false,
        "isActive": true
      }
    ]
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "No active pending resignation to approve"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Notice period days are required"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Last working day must be a future date"
  }
}
```

#### Notes

- Can only approve resignations with status "Pending"
- Last working day must be in the future
- Email notification is sent to employee upon approval
- Resignation remains active after approval to track the approved resignation

---

### 4. Reject Resignation (Manager/Admin)

**PUT** `/api/resignation/:userId/reject`

Reject a pending resignation request.

#### URL Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `userId`  | String | Yes      | User ID     |

#### Request Body

```json
{
  "remarks": "We value your contribution. Let's discuss this further."
}
```

#### Optional Fields

- `remarks` (String) - Rejection remarks

#### Request Example

```bash
PUT /api/resignation/507f1f77bcf86cd799439011/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "remarks": "We value your contribution. Let's discuss this further."
}
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "resignation": [
      {
        "status": "Rejected",
        "summary": "Pursuing higher education opportunities",
        "remarks": "We value your contribution. Let's discuss this further.",
        "submittedAt": "2024-12-12T10:30:00.000Z",
        "rejectedAt": "2024-12-13T10:00:00.000Z",
        "approvedBy": "507f1f77bcf86cd799439012",
        "isActive": false
      }
    ]
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "No active pending resignation to reject"
  }
}
```

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "User not found"
  }
}
```

#### Notes

- Can only reject resignations with status "Pending"
- Email notification is sent to employee upon rejection
- Resignation is marked as inactive after rejection

---

### 5. Get Resignation Status

**GET** `/api/resignation/:userId/status`

Check resignation eligibility and get current resignation status.

#### URL Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| `userId`  | String | Yes      | User ID     |

#### Request Example

```bash
GET /api/resignation/507f1f77bcf86cd799439011/status
Authorization: Bearer <token>
```

#### Response Example (200 OK) - Can Apply

```json
{
  "success": true,
  "data": {
    "canApply": true,
    "canWithdraw": false,
    "lastResignation": {
      "status": "Rejected",
      "summary": "Personal reasons",
      "submittedAt": "2024-11-01T10:30:00.000Z",
      "rejectedAt": "2024-11-02T14:20:00.000Z",
      "isActive": false
    }
  }
}
```

#### Response Example (200 OK) - Pending Resignation

```json
{
  "success": true,
  "data": {
    "canApply": false,
    "canWithdraw": true,
    "activeResignation": {
      "status": "Pending",
      "summary": "Pursuing higher education opportunities",
      "submittedAt": "2024-12-12T10:30:00.000Z",
      "preferredLastWorkingDay": "2025-02-28T00:00:00.000Z",
      "isActive": true
    }
  }
}
```

#### Response Example (200 OK) - Approved Resignation

```json
{
  "success": true,
  "data": {
    "canApply": false,
    "canWithdraw": false,
    "activeResignation": {
      "status": "Approved",
      "summary": "Pursuing higher education opportunities",
      "submittedAt": "2024-12-12T10:30:00.000Z",
      "approvedAt": "2024-12-13T10:00:00.000Z",
      "approvedLastWorkingDay": "2025-02-15T00:00:00.000Z",
      "noticePeriodDays": 60,
      "isActive": true
    }
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "User not found"
  }
}
```

---

### 6. Get Resignations for Admin

**GET** `/api/resignation/admin/:userId`

Get all resignations for admin with filtering and pagination.

#### URL Parameters

| Parameter | Type   | Required | Description   |
| --------- | ------ | -------- | ------------- |
| `userId`  | String | Yes      | Admin user ID |

#### Query Parameters

| Parameter | Type   | Required | Description                                                      |
| --------- | ------ | -------- | ---------------------------------------------------------------- |
| `status`  | String | No       | Filter by status: 'Pending', 'Approved', 'Rejected', 'Withdrawn' |
| `page`    | Number | No       | Page number (default: 1, min: 1)                                 |
| `limit`   | Number | No       | Records per page (default: 10, max: 100)                         |

#### Request Example

```bash
GET /api/resignation/admin/507f1f77bcf86cd799439001?status=Pending&page=1&limit=10
Authorization: Bearer <token>
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "resignations": [
      {
        "employeeId": "507f1f77bcf86cd799439011",
        "employeeName": "John Doe",
        "email": "john.doe@example.com",
        "role": "staff",
        "joiningDate": "2023-01-15T00:00:00.000Z",
        "resignation": {
          "status": "Pending",
          "summary": "Pursuing higher education opportunities",
          "remarks": null,
          "submittedAt": "2024-12-12T10:30:00.000Z",
          "approvedAt": null,
          "rejectedAt": null,
          "withdrawnAt": null,
          "approvedBy": null,
          "noticePeriodDays": null,
          "preferredLastWorkingDay": "2025-02-28T00:00:00.000Z",
          "approvedLastWorkingDay": null,
          "finalSettlementDone": false,
          "isActive": true
        }
      },
      {
        "employeeId": "507f1f77bcf86cd799439012",
        "employeeName": "Jane Smith",
        "email": "jane.smith@example.com",
        "role": "staff",
        "joiningDate": "2022-06-10T00:00:00.000Z",
        "resignation": {
          "status": "Pending",
          "summary": "Relocating to another city",
          "remarks": null,
          "submittedAt": "2024-12-11T14:20:00.000Z",
          "approvedAt": null,
          "rejectedAt": null,
          "withdrawnAt": null,
          "approvedBy": null,
          "noticePeriodDays": null,
          "preferredLastWorkingDay": "2025-03-31T00:00:00.000Z",
          "approvedLastWorkingDay": null,
          "finalSettlementDone": false,
          "isActive": true
        }
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 2,
      "totalPages": 1
    }
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Unauthorized: Only admins can access this data"
  }
}
```

#### Notes

- Only users with role "ADMIN" can access this endpoint
- Results are sorted by submission date (most recent first)
- Returns resignations from all employees in the organization

---

### 7. Get Resignations for Manager

**GET** `/api/resignation/manager/:userId`

Get resignations for team members reporting to the manager.

#### URL Parameters

| Parameter | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `userId`  | String | Yes      | Manager user ID |

#### Query Parameters

| Parameter | Type   | Required | Description                                                      |
| --------- | ------ | -------- | ---------------------------------------------------------------- |
| `status`  | String | No       | Filter by status: 'Pending', 'Approved', 'Rejected', 'Withdrawn' |
| `page`    | Number | No       | Page number (default: 1, min: 1)                                 |
| `limit`   | Number | No       | Records per page (default: 10, max: 100)                         |

#### Request Example

```bash
GET /api/resignation/manager/507f1f77bcf86cd799439002?status=Pending&page=1&limit=10
Authorization: Bearer <token>
```

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "resignations": [
      {
        "employeeId": "507f1f77bcf86cd799439011",
        "employeeName": "John Doe",
        "email": "john.doe@example.com",
        "role": "staff",
        "joiningDate": "2023-01-15T00:00:00.000Z",
        "resignation": {
          "status": "Pending",
          "summary": "Pursuing higher education opportunities",
          "remarks": null,
          "submittedAt": "2024-12-12T10:30:00.000Z",
          "approvedAt": null,
          "rejectedAt": null,
          "withdrawnAt": null,
          "approvedBy": null,
          "noticePeriodDays": null,
          "preferredLastWorkingDay": "2025-02-28T00:00:00.000Z",
          "approvedLastWorkingDay": null,
          "finalSettlementDone": false,
          "isActive": true
        }
      }
    ],
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

#### Error Responses

**400 Bad Request**

```json
{
  "success": false,
  "error": {
    "message": "Unauthorized: Only managers can access this data"
  }
}
```

#### Notes

- Only users with role "MANAGER" or "ADMIN" can access this endpoint
- Returns resignations only from team members directly reporting to the manager
- Results are sorted by submission date (most recent first)

---

## Data Validations & Business Rules

### 1. Email Validation

- **Uniqueness**: Email must be unique among active users
- **Format**: Valid email format required
- **Inactive Users**: Duplicate emails allowed for inactive users (for rehiring scenarios)
- **Case**: Automatically converted to lowercase

### 2. Employee Code Validation

- **Uniqueness**: Must be unique across all users (active and inactive)
- **Required**: Mandatory for all user types
- **Max Length**: 50 characters

### 3. Password Requirements

- **Minimum Length**: 6 characters
- **Hashing**: Automatically hashed using argon2
- **Default Password**: "123456" can be used as default (sent in welcome email)

### 4. Biometric ID Rules

- **UAE Users**: Biometric ID is not required and should not be set
- **India Users**: Biometric ID is optional
- **Uniqueness**: Must be unique if provided (sparse index)

### 5. Manager Validation

- **SuperAdmin**: Cannot have a manager, must have role "admin"
- **Auto-Population**: Manager name is automatically populated from managerId
- **Cascade Updates**: Manager name updates when managerId changes

### 6. Employment Status Rules

- **Auto-Confirmation**: Status automatically changes to "Confirmed" after 180 days from joining date
- **Probation**: Can be manually set based on probation period

### 7. Department Validation

- **LOV Validation**: Department must exist in LOV (List of Values) collection
- **Active Check**: Department must be active in LOV
- **External Users**: Can have "external_contract" as department (special case)

### 8. Country-Specific Rules

#### UAE (AE) Rules:

- **Visa Details**: Optional, but if provided, must include visaType and visaExpiryDate
- **Visa Expiry**: Must be a future date
- **Currency**: Should be AED
- **Working Days**: Sunday to Thursday (0-4)

#### India (IN) Rules:

- **Currency**: Should be INR
- **Working Days**: Monday to Friday (1-5)
- **Government IDs**: PAN, Aadhaar validation

### 9. External User Rules

- **License Type**: Must be 'external'
- **Portal Access**: Automatically set to false
- **Role**: Automatically set to 'external'
- **Client Field**: Can be assigned to a client

### 10. Resignation Rules

- **Active Limit**: Only one active resignation allowed at a time
- **Status Progression**: Pending → Approved/Rejected/Withdrawn
- **Cannot Reapply**: If resignation is approved, user cannot apply again
- **Withdrawal**: Only pending resignations can be withdrawn
- **Approval**: Only pending resignations can be approved/rejected
- **Last Working Day**: Must be a future date for approval

### 11. Document Upload Rules

- **File Storage**: Files uploaded to Google Cloud Storage
- **Document Creation**: Automatic Document record creation
- **Verification Status**:
  - Admin uploads: "Verified" by default
  - Employee uploads: "Pending" by default
- **Supported Documents**:
  - Government IDs (PAN, Aadhaar, Passport, Voter ID, Driving License)
  - Academic certificates
  - Experience certificates

### 12. Bank Details Rules

- **Multiple Accounts**: User can have multiple bank accounts
- **Primary Account**: Only one account can be marked as active (isActive: true)
- **Required Fields**: accountHolderName, accountNumber, bankName, ifscCode

### 13. FCM Token Rules

- **Uniqueness**: One token per user
- **Update**: Token can be updated when user logs in from different device
- **Invalid Token**: Automatically cleared if Firebase reports invalid token

### 14. Notification Rules

- **Admin Notifications**: Admins receive visa expiry alerts on login
- **Urgency**: Visas expiring within 7 days marked as urgent
- **Bulk Notifications**: Only admins can send bulk notifications
- **Token Validation**: Notifications only sent to users with valid FCM tokens

---

## Common Response Codes

### Success Codes

- **200 OK**: Request successful
- **201 Created**: Resource created successfully

### Client Error Codes

- **400 Bad Request**: Invalid request data or validation error
- **401 Unauthorized**: Authentication required or failed
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found

### Server Error Codes

- **500 Internal Server Error**: Unexpected server error

---

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

Or via HTTP-only cookie:

```
Cookie: access_token=<jwt_token>
```

---

## Rate Limiting

Currently no rate limiting is implemented. Consider implementing rate limiting for production use.

---

## CORS Configuration

CORS is configured to allow requests from specified origins with credentials support.

---

## File Upload Specifications

### Supported File Types

- **Documents**: PDF, DOC, DOCX
- **Images**: JPG, JPEG, PNG
- **Spreadsheets**: XLS, XLSX

### File Size Limits

- Maximum file size per upload: 10MB (configurable)

### Upload Process

1. File uploaded via multipart/form-data
2. Temporarily stored on server
3. Uploaded to Google Cloud Storage
4. Document record created in database
5. Local file cleaned up

---

## Email Notifications

### Welcome Email

- Sent when user is created (active users only)
- Includes login credentials if default password is used
- Contains portal URL and user details

### Resignation Emails

1. **Application Submitted**: Sent to HR/Admin
2. **Approval**: Sent to employee
3. **Rejection**: Sent to employee

### Password Reset Email

- Sent when user requests password reset
- Contains reset link valid for 1 hour

---

## Best Practices

1. **Always authenticate requests** using JWT tokens
2. **Handle pagination** for large datasets
3. **Use filters** to reduce response size
4. **Check FCM token validity** before sending notifications
5. **Validate file types and sizes** before upload
6. **Store sensitive data securely** (passwords hashed, tokens encrypted)
7. **Implement proper error handling** in client applications
8. **Use HTTPS** in production for secure communication
9. **Keep JWT tokens secure** and don't expose in client-side logs
10. **Implement refresh token mechanism** for better security (recommended)

---

## Change Log

### Version 1.0 (Current)

- Initial user module implementation
- Support for India (IN) and UAE (AE) operations
- External user/contractor support
- Resignation workflow
- Document management
- FCM push notifications
- Visa expiry tracking for UAE employees

---

## Support

For API support or questions, contact the development team.

---

**Last Updated**: December 12, 2024  
**API Version**: 1.0  
**Base URL**: `https://api.example.com` (Replace with actual URL)
