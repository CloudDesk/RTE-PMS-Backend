# Deep Analysis: Users, Payroll, and Payslip Modules

## Table of Contents
1. [Users Module](#users-module)
2. [Payroll Module](#payroll-module)
3. [Payslip Module](#payslip-module)
4. [Inter-Module Relationships](#inter-module-relationships)
5. [Calculation Flow Diagrams](#calculation-flow-diagrams)

---

## 1. Users Module

### 1.1 Overview
The Users module manages employee information, authentication, hierarchy, and personal details. It supports both India (IN) and UAE (AE) employees with country-specific features.

### 1.2 Routes (`src/routes/user.routes.ts`)

#### **GET `/users/`** - Get Users (Unified Endpoint)
- **Service Used**: `userService.getUsers()`
- **Purpose**: Flexible user retrieval with filtering
- **Query Parameters**:
  - `page`, `limit`: Pagination
  - `my`: Get current user profile
  - `subordinates`: Get hierarchical subordinates
  - `search`: Search by name/email
  - `role`: Filter by role (admin, manager, staff, external)
  - `status`: Filter by status (active, inactive)
  - `departmentId`: Filter by department
  - `country`: Filter by country (IN, AE)
  - `licenseType`: Filter by license (employee, external)
  - `portalAccess`: Filter by portal access
  - `sort`, `sortOrder`: Sorting options
  - `select`: Field selection

#### **GET `/users/:id`** - Get User by ID
- **Service Used**: `userService.findById()`
- **Purpose**: Get detailed user information

#### **GET `/users/payroll`** - Get Users for Payroll
- **Service Used**: `userService.adminFindUsers()`
- **Purpose**: Special endpoint for payroll user selection
- **Query Parameters**:
  - `month`: Filter by joining date month (YYYY-MM)
  - `status`: Array of statuses (Active, On Hold, Resigned)
  - `country`: Filter by country

#### **POST `/users/`** - Create User
- **Service Used**: `userService.create()`
- **Purpose**: Create new employee
- **Validations**:
  - Employee code uniqueness
  - Email uniqueness (for active users only)
  - Biometric ID handling (null for UAE/India)
  - Visa details validation for UAE employees

#### **PUT `/users/:id`** - Update User
- **Service Used**: `userService.update()`
- **Purpose**: Update user information

#### **DELETE `/users/:id`** - Delete User (Soft Delete)
- **Service Used**: `userService.delete()`
- **Purpose**: Deactivate user (sets `active: false`)

#### **PATCH `/users/:id/fcm-token`** - Update FCM Token
- **Service Used**: `userService.updateFcmToken()`
- **Purpose**: Update Firebase Cloud Messaging token for push notifications

#### **GET `/users/export`** - Export Users to Excel
- **Service Used**: `userService.getUsers()`
- **Purpose**: Export user data as Excel file

### 1.3 Service (`src/services/user.service.ts`)

#### **Key Methods:**

1. **`getUsers(query, authenticatedUser)`**
   - Handles unified user retrieval
   - Supports role-based access control
   - Implements hierarchical subordinate fetching
   - Uses `getSubordinateUserIds()` utility for manager hierarchy

2. **`adminFindUsers(query)`**
   - Admin-only user search
   - Supports complex status filtering:
     - **Active**: `active: true`
     - **On Hold**: `active: true` + pending resignation
     - **Resigned**: Approved resignation exists
   - Month-based filtering on joining date

3. **`create(data)`**
   - Creates new user with validations
   - Handles country-specific logic (UAE/India)
   - Sends welcome email for active users
   - Sets default confirmation/probation dates

4. **`update(id, data)`**
   - Updates user with validation
   - Handles employee code/email uniqueness
   - Country-specific biometric ID handling

5. **`findById(id)`**
   - Retrieves single user by ID

6. **`getManagerTeamMembers(managerId, query)`**
   - Gets all hierarchical subordinates for a manager
   - Uses `getSubordinateUserIds()` for recursive hierarchy

7. **`applyResignation(userId, data)`**
   - Creates resignation request
   - Sends email notification to HR
   - Validates no existing pending resignation

8. **`approveResignation(userId, approverId, data)`**
   - Approves resignation with notice period
   - Sets approved last working day
   - Sends approval email

9. **`getUAEUsersWithExpiringVisas(daysAhead)`**
   - Finds UAE employees with visas expiring soon
   - Returns grouped data by visa type

10. **`sendNotification(userId, title, body, data)`**
    - Sends FCM push notification
    - Handles token validation and cleanup

### 1.4 Model (`src/models/user.model.ts`)

#### **Schema Structure:**

```typescript
{
  // Basic Information
  name: string (required, max 100)
  email: string (required, unique, lowercase)
  password: string (required, hashed with argon2)
  role: enum ['admin', 'manager', 'staff', 'external']
  specificRole: string (optional)
  isSuperAdmin: boolean (default: false)
  
  // Organizational
  departmentId: string (required, validated against LOV)
  managerId: ObjectId (ref: 'User')
  managerName: string (auto-populated)
  employeeCode: string (required, unique, max 50)
  
  // Identification
  checkinId: string (unique, sparse)
  biometricId: string (unique, sparse, optional for UAE/India)
  
  // Status
  active: boolean (default: true)
  
  // Dates
  joiningDate: Date (required)
  confirmationDate: Date (optional, defaults to joiningDate)
  probationDate: Date (optional, defaults to joiningDate)
  separationDate: Date (optional)
  dateOfBirth: Date (optional)
  
  // Personal Details
  location: string (max 100)
  phone: string (max 20)
  emergencyContact: string (max 20)
  address: string (max 200)
  bloodGroup: string (max 5)
  fatherName: string (max 100)
  maritalStatus: enum ['Single', 'Married', 'Divorced', 'Widowed']
  spouseName: string (max 100)
  noticePeriod: number (days)
  personalMailId: string (email format, max 100)
  
  // Shift Assignments
  currentShiftAssignmentData: {
    startDate: Date
    endDate: Date | null
    shiftCode: string
    shiftId: ObjectId
    shiftAssignmentId: ObjectId
  } | null
  
  upcomingShiftAssignmentData: {
    startDate: Date
    endDate: Date | null
    shiftCode: string
    shiftId: ObjectId
    shiftAssignmentId: ObjectId
  } | null
  
  // Bank Details (Array - Multiple Accounts)
  bankDetails: [{
    accountHolderName: string (required)
    accountNumber: string (required)
    bankName: string (required)
    ifscCode: string (required)
    isActive: boolean (default: false) // Main salary account
  }]
  
  // Government IDs
  governmentIds: {
    pan: { number?: string, documentUrl?: string }
    aadhaar: { number?: string, documentUrl?: string }
    passport: { number?: string, documentUrl?: string }
    voterId: { number?: string, documentUrl?: string }
    drivingLicense: { number?: string, documentUrl?: string }
    pf: { number?: string, uan?: string }
  }
  
  // Academic & Experience (commented out in current model)
  // academicDetails: Array
  // experienceDetails: Array
  
  // Country & License
  country: enum ['IN', 'AE'] (default: 'IN')
  currency: enum ['INR', 'AED'] (default: 'INR')
  licenseType: enum ['employee', 'external'] (default: 'employee')
  portalAccess: boolean (default: true)
  
  // UAE-Specific
  visaDetails: {
    visaType: enum ['Standard Employment Visa', 'Domestic Worker Visa', 'Green Visa']
    visaExpiryDate: Date (must be future date)
    isActive: boolean
  } (optional, required for UAE if provided)
  
  client: string (max 100) // For employee assignment
  
  // Calendar & Weekend
  holidayCalendarId: ObjectId (ref: 'holidaycalendar')
  weekendId: string
  
  // Resignations (Array)
  resignations: [{
    status: enum ['Pending', 'Approved', 'Rejected', 'Withdrawn']
    summary: string
    remarks: string
    submittedAt: Date
    approvedAt: Date
    rejectedAt: Date
    withdrawnAt: Date
    approvedBy: ObjectId (ref: 'User')
    noticePeriodDays: number
    preferredLastWorkingDay: Date
    approvedLastWorkingDay: Date
    finalSettlementDone: boolean
    isActive: boolean (default: true)
  }]
  
  // Notifications
  fcmToken: string (optional)
  
  // References
  certificateIds: [ObjectId] (ref: 'Document')
  
  // Timestamps
  createdAt: Date
  updatedAt: Date
}
```

#### **Pre-Save Hooks:**
1. **Password Hashing**: Uses argon2 to hash password before save
2. **Manager Name Population**: Auto-populates managerName from managerId
3. **SuperAdmin Validation**: Ensures SuperAdmin has admin role and no manager
4. **External User Handling**: Sets portalAccess=false for external users
5. **Employee Code Uniqueness**: Validates unique employee code
6. **UAE Visa Validation**: Validates visa details for UAE employees

#### **Indexes:**
- `email`: unique
- `employeeCode`: unique
- `checkinId`: unique, sparse
- `biometricId`: unique, sparse
- `managerId`
- `role`
- `active`
- `country`
- `licenseType`
- `portalAccess`
- `client`

### 1.5 Child Relationships

#### **1.5.1 Bank Details (Array)**
- **Type**: Array of bank account objects
- **Purpose**: Multiple bank accounts per user
- **Key Field**: `isActive` - marks primary salary account
- **Used In**: Payroll (for salary transfer), Payslip generation

#### **1.5.2 Government IDs (Object)**
- **Type**: Nested object with multiple ID types
- **Child Fields**:
  - `pan`: { number, documentUrl }
  - `aadhaar`: { number, documentUrl }
  - `passport`: { number, documentUrl }
  - `voterId`: { number, documentUrl }
  - `drivingLicense`: { number, documentUrl }
  - `pf`: { number, uan }
- **Used In**: Tax declarations, compliance reporting

#### **1.5.3 Resignations (Array)**
- **Type**: Array of resignation objects
- **Purpose**: Track resignation history
- **Child Fields**:
  - `status`: Current status
  - `summary`: Resignation reason
  - `remarks`: Additional notes
  - `submittedAt`: When submitted
  - `approvedAt`: When approved
  - `rejectedAt`: When rejected
  - `withdrawnAt`: When withdrawn
  - `approvedBy`: ObjectId reference to approver
  - `noticePeriodDays`: Notice period in days
  - `preferredLastWorkingDay`: Employee's preferred date
  - `approvedLastWorkingDay`: HR approved date
  - `finalSettlementDone`: Boolean flag
  - `isActive`: Boolean flag for current resignation
- **Used In**: Payroll status filtering (On Hold, Resigned)

#### **1.5.4 Shift Assignment Data (Objects)**
- **Type**: Two separate objects (current and upcoming)
- **Child Fields**:
  - `startDate`: Assignment start date
  - `endDate`: Assignment end date (nullable)
  - `shiftCode`: Shift identifier
  - `shiftId`: ObjectId reference to Shift
  - `shiftAssignmentId`: ObjectId reference to ShiftAssignment
- **Used In**: Attendance calculation, working days calculation

#### **1.5.5 Visa Details (Object - UAE Only)**
- **Type**: Nested object (optional, required for UAE)
- **Child Fields**:
  - `visaType`: Type of visa
  - `visaExpiryDate`: Expiry date (must be future)
  - `isActive`: Active status
- **Used In**: Visa expiry notifications, compliance

---

## 2. Payroll Module

### 2.1 Overview
The Payroll module handles salary calculation, processing, and management. It supports both India (IN) and UAE (AE) with country-specific deduction rules and calculation logic.

### 2.2 Routes (`src/routes/payroll.routes.ts`)

#### **POST `/payroll/generate`** - Generate Payroll
- **Service Used**: `payrollService.initiatePayroll()`
- **Purpose**: Generate payroll for employees
- **Request Body**:
  - `monthYear`: YYYY-MM format (required)
  - `userIds`: Array of user IDs (optional)
  - `filters`: Filter criteria (optional)
    - `departmentId`, `role`, `status[]`, `search`, `country`
- **Flow**:
  1. Validates monthYear format
  2. Gets user IDs from filters or provided list
  3. Calls `initiatePayroll()` service method
  4. Returns summary with totals

#### **GET `/payroll/summary`** - Get Payroll Summary
- **Service Used**: `payrollService.getPayrollSummary()`
- **Purpose**: Get aggregated payroll data for a month
- **Query Parameters**:
  - `month`: 1-12 (required)
  - `year`: YYYY (required)
  - `status`: Array of statuses (optional)
  - `country`: Filter by country (optional)
- **Returns**:
  - Total employees, gross salary, deductions, net salary
  - Present days, LOP days, payable days
  - Status breakdown
  - Exportable details with bank information

#### **POST `/payroll/by-users`** - Get Payroll Records for Users
- **Service Used**: `payrollService.getPayrollRecordsForUsers()`
- **Purpose**: Get payroll records for specific users
- **Request Body**:
  - `userIds`: Array of user IDs (required)
  - `month`: 1-12 (required)
  - `year`: YYYY (required)

#### **POST `/payroll/status-update`** - Update Payroll Status
- **Service Used**: `payrollService.updatePayrollStatus()`
- **Purpose**: Update status of payroll records
- **Request Body**:
  - `id`: Single record ID OR
  - `recordIds`: Array of record IDs
  - `status`: New status (required)
  - `failureReason`: Required for Failed status
  - `utrNumber`: Required for Completed status
- **Status Transitions**: Validated against state machine

#### **POST `/payroll/import-payments`** - Import Payment Status from Excel
- **Service Used**: `payrollService.importPayrollPayments()`
- **Purpose**: Bulk import payment status from Excel file
- **File Format**: Excel (.xlsx) with columns:
  - Payroll ID, Employee Name, Status, UTR Number, Failure Reason

#### **POST `/payroll/status-update-excel`** - Batch Status Update
- **Service Used**: `payrollService.batchUpdatePayrollStatus()`
- **Purpose**: Batch update status from Excel data
- **Request Body**:
  - `records`: Array of { id, status, utrNumber?, failureReason? }

#### **GET `/payroll/deduction-summary`** - Get Deduction Summary
- **Service Used**: `payrollService.getDeductions()`
- **Purpose**: Get tax deduction summary
- **Query Parameters**:
  - `month`: Month name (e.g., "Jul")
  - `financialYear`: FY format (e.g., "2025-2026")
  - `department`, `location`, `employeeId`: Filters
  - `exportFormat`: "csv" | "excel" | "json"
- **Returns**: Tax deductions with professional tax

#### **DELETE `/payroll/delete`** - Delete Payroll
- **Service Used**: `payrollService.deletePayroll()`
- **Purpose**: Delete payroll records for a month/year
- **Query Parameters**:
  - `month`: 1-12 (required)
  - `year`: YYYY (required)
  - `country`: Optional filter

### 2.3 Service (`src/services/payroll.service.ts`)

#### **Key Methods:**

1. **`initiatePayroll(month, year, userIds)`**
   - **Main Entry Point**: Generates payroll for employees
   - **Flow**:
     1. Validates and normalizes month
     2. Checks for existing payroll records
     3. Filters out users with existing payroll
     4. Fetches employees and salary assignments
     5. Validates employee-salary assignment consistency
     6. Processes payroll records in parallel
     7. Inserts records and calculates summary
   - **Returns**: Summary with totals and status

2. **`processPayrollRecords(employees, salaryMap, monthName, monthNumber, year)`**
   - **Purpose**: Process all employees in parallel
   - **For Each Employee**:
     - Gets monthly attendance
     - Fetches approved leaves
     - Gets overtime hours
     - Gets working days info
     - Calls `calculatePayrollRecord()`

3. **`calculatePayrollRecord(employee, salaryAssignment, attendance, approvedLeaves, overtimeHours, daysInMonth, workingDays, monthName, monthNumber, year)`**
   - **Core Calculation Method**: Calculates single payroll record
   - **Steps**:
     1. Determines employee country (IN/AE)
     2. Calculates LOP days
     3. Calculates payable days
     4. Calculates attendance-adjusted gross
     5. Calculates earnings (Basic, HRA, DA, etc.)
     6. Calculates deductions (country-specific)
     7. Calculates overtime pay
     8. Calculates net salary
     9. Calculates CTC
   - **Country-Specific Logic**:
     - **India (IN)**: Full statutory deductions (EPF, ESI, PT, IT)
     - **UAE (AE)**: No statutory deductions, only leave deductions

4. **`calculateDeductions(basic, da, grossSalary, salaryStructure, attendance, approvedLeaves, monthName, monthNumber, year, employeeId, payableDays, daysInMonth, monthlyGross, employeeCountry)`**
   - **Purpose**: Calculate all deductions
   - **Country Handling**:
     - **UAE**: Returns zero for all statutory deductions
     - **India**: Calculates EPF, ESI, Professional Tax, Income Tax
   - **Deductions Calculated**:
     - EPF Employee & Employer
     - ESI Employee & Employer (if applicable)
     - Professional Tax (based on slabs and term)
     - Income Tax (from tax declaration)
     - Leave Deductions (LOP days)

5. **`getMonthlyAttendance(employeeId, monthName, year)`**
   - **Purpose**: Get attendance summary for a month
   - **Uses**: `AttendanceRecord` aggregation
   - **Returns**:
     - `presentDays`: Days marked present
     - `absentDays`: Calculated absent days
     - `lateDays`: Days marked late
     - `leaveDays`: Days on leave
     - `weekendDays`: Weekend days
     - `holidayDays`: Holiday days
     - `totalWorkHours`: Total hours worked
     - `excessHours`: Overtime hours

6. **`fetchApprovedLeaves(employeeId, year, monthNumber)`**
   - **Purpose**: Get total approved leave days
   - **Important**: Sums `noOfDays` field (supports half-day leaves)
   - **Returns**: Total leave days (can be decimal like 2.5)

7. **`getWorkingDaysInMonth(employeeId, year, monthNumber)`**
   - **Purpose**: Calculate working days, weekends, holidays
   - **Logic**:
     - Gets user's holiday calendar
     - Counts mandatory holidays
     - Counts approved optional holidays
     - Gets shift assignments for weekend days
     - Calculates working days = total days - weekends - holidays
   - **Returns**: { workingDays, weekendDays, holidayDays }

8. **`calculateProfessionalTax(grossSalary, ptConfig, monthNumber)`**
   - **Purpose**: Calculate professional tax based on slabs
   - **Terms**: half_yearly, yearly, monthly
   - **Returns**: Tax amount based on salary slab

9. **`calculateIncomeTax(employeeId, monthName, monthNumber, year)`**
   - **Purpose**: Get income tax from tax declaration
   - **Flow**:
     1. Determines financial year
     2. Finds tax declaration for employee
     3. Gets monthly deduction for the month
     4. Marks deduction as processed
     5. Returns tax amount

10. **`getPayrollSummary(month, year, status?, country?)`**
    - **Purpose**: Get aggregated payroll summary
    - **Uses**: MongoDB aggregation pipeline
    - **Returns**: Totals, status breakdown, exportable details

11. **`updatePayrollStatus(params)`**
    - **Purpose**: Update payroll record status
    - **Validates**: State transitions, retry limits
    - **Updates**: Status history, payment confirmation, UTR number

12. **`getUserIdsByFilters(filters, monthYear, mode)`**
    - **Purpose**: Get user IDs based on filters
    - **Modes**:
      - `excludeBlocked`: Excludes users with existing payroll
      - `onlyCompleted`: Only users with completed payroll
    - **Returns**: Array of user IDs

### 2.4 Model (`src/models/payrolls.model.ts`)

#### **Schema Structure:**

```typescript
{
  // Employee Reference
  employeeId: ObjectId (ref: 'User', required)
  salaryAssignmentId: ObjectId (ref: 'SalaryAssignment', required)
  
  // Assigned Salary Components (Full Month)
  assigned: {
    basic: number (required)
    hra: number (required)
    da: number (required)
    otherAllowance: number (required)
    travelAllowance: number (required, default: 0)
    airTicketAllowance: number (required, default: 0) // UAE only, annual
    medicalAllowance: number (required, default: 0) // UAE only, annual
    reimbursementAllowance: number (required, default: 0)
  }
  
  // Income Components (Attendance Adjusted)
  monthlyGross: number (required, default: 0) // Full month gross
  attendanceAdjustGross: number (required, default: 0) // Pro-rated by attendance
  basic: number (required)
  hra: number (required)
  da: number (required)
  otherAllowance: number (required)
  travelAllowance: number (required, default: 0)
  airTicketAllowance: number (required, default: 0) // UAE only
  medicalAllowance: number (required, default: 0) // UAE only
  reimbursementAllowance: number (required, default: 0)
  
  // Deductions
  epfEmployee: number (required, default: 0)
  epfEmployer: number (required, default: 0)
  esiEmployee: number (required, default: 0)
  esiEmployer: number (required, default: 0)
  professionalTax: number (required, default: 0)
  incomeTax: number (required, default: 0)
  totalDeductions: number (required, default: 0)
  additionalDeduction: number (required, default: 0)
  leaveDeductions: number (default: 0)
  
  // Additional Pay Components
  overtimeHours: number (default: 0)
  overtimePay: number (default: 0)
  reimbursement: number (default: 0)
  bonus: number (default: 0)
  
  // Final Calculations
  netSalary: number (required)
  ctc: number (required)
  
  // Payroll Period
  monthYear: string (required) // YYYY-MM format
  month: number (required) // 1-12
  year: number (required)
  
  // Attendance Metrics
  totalDaysInMonth: number (required)
  presentDays: number (required)
  LOPDays: number (required) // Loss of Pay days
  payableDays: number (required)
  
  // Processing Info
  processedAt: Date (default: Date.now)
  status: enum ['Draft', 'PendingApproval', 'InPayment', 'Completed', 'Failed', 'RetryPending', 'Cancelled'] (default: 'Draft')
  
  // Approval & Payment
  approvedBy: ObjectId (ref: 'User', optional)
  approvalDate: Date (optional)
  paymentConfirmedAt: Date (optional)
  payslipReleaseDate: Date (optional)
  
  // Failure Handling
  failureReason: string (optional)
  retryCount: number (default: 0)
  
  // Status History
  statusHistory: [{
    status: string (required)
    timestamp: Date (required, default: Date.now)
    reason: string (optional)
    changedBy: ObjectId (ref: 'User', required)
  }]
  
  // Payment Confirmation
  utrNumber: string (optional) // UTR number for completed payments
  
  // Country
  country: enum ['AE', 'IN'] (required)
  
  // Timestamps
  createdAt: Date
  updatedAt: Date
}
```

#### **Pre-Save Hook:**
- Validates unique payroll for employee + month + year
- Rounds all monetary fields to integers
- Ensures integer fields have no decimals

#### **Indexes:**
- `{ employeeId: 1, monthYear: 1, month: 1, year: 1 }`: unique

### 2.5 Payroll Calculation Logic

#### **2.5.1 Attendance-Adjusted Gross Calculation**

```
Payable Days = Present Days + Weekend Days + Holiday Days + Approved Leave Days
LOP Days = Total Days in Month - Payable Days
Attendance Adjusted Gross = (Payable Days / Total Days in Month) × Monthly Gross
```

#### **2.5.2 Earnings Calculation (India)**

```
Basic = (basicPercentage / 100) × Attendance Adjusted Gross
HRA = (hraPercentage / 100) × Attendance Adjusted Gross
DA = (daPercentage / 100) × Basic
Other Allowance = (otherAllowancePercentage / 100) × Attendance Adjusted Gross
Travel Allowance = (travelAllowancePercentage / 100) × Attendance Adjusted Gross
Reimbursement Allowance = (reimbursementPercentage / 100) × Attendance Adjusted Gross

Gross Salary = Basic + HRA + DA + Other Allowance + Travel Allowance + Reimbursement Allowance
```

#### **2.5.3 Earnings Calculation (UAE)**

```
Basic = (basicPercentage / 100) × Attendance Adjusted Gross
HRA = (hraPercentage / 100) × Attendance Adjusted Gross
DA = (daPercentage / 100) × Basic
Travel Allowance = (Payable Days / Total Days) × Fixed Travel Allowance (from assignment)
Other Allowance = Attendance Adjusted Gross - (Basic + HRA + DA + Travel Allowance) [Auto-calculated]
Air Ticket Allowance = Fixed Annual Amount (NOT in monthly calculation)
Medical Allowance = Fixed Annual Amount (NOT in monthly calculation)

Gross Salary = Basic + HRA + DA + Other Allowance + Travel Allowance + Reimbursement Allowance
```

#### **2.5.4 Deductions Calculation (India)**

```
EPF Employee = min((employeeContribution% / 100) × (Basic + DA), maxLimit / 12)
EPF Employer = (employerContribution% / 100) × (Basic + DA)

ESI Employee = (if Gross <= Applicability Limit) ? (employeeContribution% / 100) × Gross : 0
ESI Employer = (if Gross <= Applicability Limit) ? (employerContribution% / 100) × Gross : 0

Professional Tax = Tax Amount from Slab (based on term: monthly/half_yearly/yearly)

Income Tax = Monthly Deduction from Tax Declaration (distributed annually)

Leave Deductions = (LOP Days / Total Days) × Monthly Gross

Total Deductions = EPF Employee + Professional Tax + Income Tax + Leave Deductions + Additional Deduction
```

#### **2.5.5 Deductions Calculation (UAE)**

```
EPF Employee = 0
EPF Employer = 0
ESI Employee = 0
ESI Employer = 0
Professional Tax = 0
Income Tax = 0

Leave Deductions = (LOP Days / Total Days) × Monthly Gross

Total Deductions = Leave Deductions
```

#### **2.5.6 Overtime Calculation**

```
Overtime Rate = Gross Salary / (Working Days × 8)
Overtime Pay = Overtime Hours × Overtime Rate
```

#### **2.5.7 Net Salary Calculation**

```
Net Salary = Attendance Adjusted Gross
           - EPF Employee
           - Professional Tax
           - Income Tax
           - Leave Deductions
           - Additional Deduction
           + Overtime Pay
```

#### **2.5.8 CTC Calculation**

**India:**
```
CTC = Attendance Adjusted Gross
    + EPF Employer
    + ESI Employer
    + Overtime Pay
```

**UAE:**
```
Monthly Components = Basic + HRA + DA + Other Allowance + Travel Allowance
CTC = (Monthly Components × 12)
    + Air Ticket Allowance (annual)
    + Medical Allowance (annual)
    + (Monthly Insurance × 12)
```

### 2.6 Child Relationships

#### **2.6.1 Assigned Salary Components (Object)**
- **Type**: Nested object
- **Purpose**: Stores full-month salary breakdown (before attendance adjustment)
- **Child Fields**:
  - `basic`, `hra`, `da`, `otherAllowance`
  - `travelAllowance`, `airTicketAllowance`, `medicalAllowance`
  - `reimbursementAllowance`
- **Used In**: Payslip generation (shows full vs actual)

#### **2.6.2 Status History (Array)**
- **Type**: Array of status change objects
- **Purpose**: Audit trail of status changes
- **Child Fields**:
  - `status`: New status
  - `timestamp`: When changed
  - `reason`: Reason for change
  - `changedBy`: ObjectId reference to user who made change
- **Used In**: Audit logging, status tracking

### 2.7 Service Dependencies

#### **Services Used:**
1. **`userService`**: Get employee details, bank information
2. **`attendanceService`**: Get attendance records (via `AttendanceRecord` model)
3. **`leaveService`**: Get approved leaves (via `Leave` model)
4. **`overtimeService`**: Get overtime hours (via `Overtime` model)
5. **`taxDeclarationService`**: Get income tax (via `TaxDeclaration` model)
6. **`salaryAssignmentService`**: Get salary assignments (via `SalaryAssignment` model)
7. **`holidayCalendarService`**: Get holidays (via `HolidayCalendar` model)
8. **`shiftService`**: Get shift assignments (via `ShiftAssignment` model)

#### **Models Used:**
- `User`: Employee information
- `Payroll`: Payroll records
- `SalaryAssignment`: Salary structure assignments
- `AttendanceRecord`: Attendance data
- `Leave`: Leave applications
- `Overtime`: Overtime records
- `TaxDeclaration`: Tax declarations
- `HolidayCalendar`: Holiday calendars
- `ShiftAssignment`: Shift assignments
- `OptionalHolidayRequest`: Optional holiday requests

---

## 3. Payslip Module

### 3.1 Overview
The Payslip module generates, stores, and distributes payslips to employees. It creates PDF documents from payroll data and sends them via email.

### 3.2 Routes (`src/routes/payslip.routes.ts`)

#### **POST `/payslip/bulk-generate`** - Bulk Generate Payslips
- **Service Used**: `payslipService.bulkGenerate()`
- **Purpose**: Generate payslips for multiple employees
- **Request Body**:
  - `monthYear`: YYYY-MM format (required)
  - `userIds`: Array of user IDs (optional)
  - `filters`: Filter criteria (optional)
- **Flow**:
  1. Validates monthYear
  2. Gets user IDs (filters or provided)
  3. Filters to only employees with Completed payroll
  4. Generates payslips in parallel
  5. Creates PDF documents
  6. Uploads to GCP Cloud Storage
  7. Saves payslip records

#### **POST `/payslip/send`** - Send Payslips via Email
- **Service Used**: `payslipService.sendPayslips()`
- **Purpose**: Send generated payslips to employees
- **Request Body**:
  - `monthYear`: YYYY-MM format (required)
  - `userIds`: Array of user IDs (optional)
  - `filters`: Filter criteria (optional)
- **Flow**:
  1. Gets user IDs
  2. Finds payslips for users
  3. Sends email with payslip PDF
  4. Updates payslip status to "Sent"
  5. Records email history

#### **GET `/payslip/me`** - Get Employee Payslips
- **Service Used**: `payslipService.getEmployeePayslipAndPayroll()`
- **Purpose**: Get payslips for logged-in employee
- **Query Parameters**:
  - `userId`: User ID (required)
  - `month`: Month filter (optional)
  - `year`: Year filter (optional)
- **Returns**: Array of payslips with payroll details

#### **POST `/payslip/by-users`** - Get Payslip Records for Users
- **Service Used**: `payslipService.getPayslipRecordsForUsers()`
- **Purpose**: Get payslip records for specific users
- **Request Body**:
  - `userIds`: Array of user IDs (required)
  - `month`: 1-12 (required)
  - `year`: YYYY (required)

#### **GET `/payslip/is-generated`** - Check Payslip Generation Status
- **Service Used**: `payslipService.checkPayslipGeneration()`
- **Purpose**: Check if payslips are generated for a month
- **Query Parameters**:
  - `month`: 1-12 (required)
  - `year`: YYYY (required)

#### **DELETE `/payslip/delete`** - Delete Payslips
- **Service Used**: `payslipService.deletePayroll()`
- **Purpose**: Delete payslip records for a month/year
- **Query Parameters**:
  - `month`: 1-12 (required)
  - `year`: YYYY (required)

### 3.3 Service (`src/services/payslip.service.ts`)

#### **Key Methods:**

1. **`bulkGenerate(month, year, userIds)`**
   - **Main Entry Point**: Generates payslips for multiple employees
   - **Flow**:
     1. Validates month/year
     2. Fetches employees
     3. Fetches completed payroll records
     4. For each employee:
        - Creates/updates payslip record
        - Generates PDF document
        - Uploads to GCP Cloud Storage
        - Saves payslip with URL
   - **Returns**: Array of generation results

2. **`generatePayslipPDF(employee, payroll, payslipId)`**
   - **Purpose**: Generate PDF payslip document
   - **Flow**:
     1. Prepares template data from payroll
     2. Loads DOCX template
     3. Replaces placeholders with data
     4. Converts DOCX to PDF using LibreOffice
     5. Uploads PDF to GCP Cloud Storage
     6. Cleans up temporary files
     7. Returns GCP file URL
   - **Template Data Includes**:
     - Employee details
     - Bank information
     - Earnings (actual and full month)
     - Deductions
     - Net pay in words
     - Attendance metrics

3. **`sendPayslips(data, userId)`**
   - **Purpose**: Send payslips via email
   - **Flow**:
     1. Gets payslips and user details
     2. For each recipient:
       - Validates user and payslip exist
       - Sends email with payslip PDF
       - Updates payslip status to "Sent"
       - Records email history
   - **Returns**: Success/failure counts and results

4. **`getEmployeePayslipAndPayroll(userId, month?, year?)`**
   - **Purpose**: Get payslips for an employee
   - **Filters**: Only exported payslips (isExport: true, status: Sent/Exported)
   - **Returns**: Formatted payslips with payroll details

5. **`getPayslipRecordsForUsers(userIds, month, year)`**
   - **Purpose**: Get payslip records for specific users
   - **Returns**: Array of payslip records

6. **`checkPayslipGeneration(month, year)`**
   - **Purpose**: Check generation status
   - **Returns**: Generation status, payslip details, summary

7. **`replacePlaceholdersInDocx(inputPath, outputPath, data)`**
   - **Purpose**: Replace template placeholders in DOCX
   - **Uses**: Docxtemplater library
   - **Process**: Reads template, renders data, writes output

8. **`convertDocxToPDF(docxPath, pdfPath)`**
   - **Purpose**: Convert DOCX to PDF
   - **Uses**: LibreOffice converter
   - **Process**: Reads DOCX, converts to PDF, writes file

9. **`numberToWords(num)`**
   - **Purpose**: Convert number to words (for net pay in words)
   - **Returns**: String representation (e.g., "fifty thousand")

10. **`getMonthName(monthNumber)`**
    - **Purpose**: Get month name from number
    - **Returns**: Month name (e.g., "January")

### 3.4 Model (`src/models/payslip.model.ts`)

#### **Schema Structure:**

```typescript
{
  // References
  userId: ObjectId (ref: 'User', required)
  payrollId: ObjectId (ref: 'Payroll', required)
  
  // Payroll Period
  monthYear: string (required, format: YYYY-MM, validated)
  month: number (required, 1-12)
  year: number (required)
  
  // Salary Summary
  netSalary: number (required)
  paySummary: {
    gross: number (required)
    net: number (required)
    deductions: number (required)
    bonus: number (required)
    reimbursement: number (required)
  }
  
  // Status & Export
  status: enum ['Generated', 'Sent', 'Exported'] (default: 'Generated')
  isExport: boolean (default: false)
  payslipUrl: string (optional) // GCP Cloud Storage URL
  
  // Email Tracking
  sentAt: Date (optional)
  sentBy: ObjectId (ref: 'User', optional)
  
  // Email History
  emailHistory: [{
    sentAt: Date (required)
    status: enum ['Sent', 'Failed'] (required)
    sentBy: ObjectId (ref: 'User', required)
    recipientEmail: string (optional)
    errorMessage: string (optional)
    messageId: string (optional)
  }]
  
  // Timestamps
  createdAt: Date
  updatedAt: Date
}
```

#### **Indexes:**
- `{ userId: 1, month: 1, year: 1 }`: unique

### 3.5 Payslip Generation Process

#### **3.5.1 Template Data Preparation**

The payslip template includes:

**Employee Information:**
- Name, Joining Date, Role, Department, Location, Employee Number

**Bank & ID Information:**
- Bank Name, Account Number, PAN, PF Number, PF UAN

**Payslip Period:**
- Month Name, Year

**Attendance Metrics:**
- Days Present, LOP Days, Effective Days, Total Month Days

**Earnings (Actual - Attendance Adjusted):**
- Basic, HRA, Other Allowance, Travel Allowance, Reimbursement
- Air Ticket Allowance (UAE), Medical Allowance (UAE)
- Total Earnings

**Earnings (Full Month - Assigned):**
- Basic, HRA, Other Allowance, Travel Allowance, Reimbursement
- Air Ticket Allowance (UAE, annual), Medical Allowance (UAE, annual)
- Total Earnings

**Deductions:**
- PF (EPF Employee), LOP, Professional Tax, Income Tax
- Total Deductions

**Net Pay:**
- Amount in numbers
- Amount in words (e.g., "Rupees Fifty Thousand only")

#### **3.5.2 PDF Generation Flow**

```
1. Load DOCX Template
   ↓
2. Prepare Template Data from Payroll
   ↓
3. Replace Placeholders using Docxtemplater
   ↓
4. Save Filled DOCX
   ↓
5. Convert DOCX to PDF using LibreOffice
   ↓
6. Upload PDF to GCP Cloud Storage
   ↓
7. Get Public URL
   ↓
8. Clean Up Temporary Files
   ↓
9. Save Payslip Record with URL
```

### 3.6 Child Relationships

#### **3.6.1 Pay Summary (Object)**
- **Type**: Nested object
- **Purpose**: Stores salary summary
- **Child Fields**:
  - `gross`: Gross salary
  - `net`: Net salary
  - `deductions`: Total deductions
  - `bonus`: Bonus amount
  - `reimbursement`: Reimbursement amount
- **Used In**: Quick reference, summary display

#### **3.6.2 Email History (Array)**
- **Type**: Array of email event objects
- **Purpose**: Track email sending history
- **Child Fields**:
  - `sentAt`: When email was sent
  - `status`: Sent or Failed
  - `sentBy`: ObjectId reference to user who sent
  - `recipientEmail`: Email address
  - `errorMessage`: Error if failed
  - `messageId`: Email service message ID
- **Used In**: Email tracking, audit trail

### 3.7 Service Dependencies

#### **Services Used:**
1. **`payrollService`**: Get payroll records, filter users
2. **`emailService`**: Send payslip emails
3. **`userService`**: Get employee details

#### **Models Used:**
- `Payslip`: Payslip records
- `Payroll`: Payroll data
- `User`: Employee information

#### **External Services:**
- **GCP Cloud Storage**: Store PDF files
- **LibreOffice**: Convert DOCX to PDF
- **Docxtemplater**: Template rendering
- **Email Service**: Send payslip emails

---

## 4. Inter-Module Relationships

### 4.1 Users → Payroll

**Relationship**: One-to-Many
- One User can have many Payroll records (one per month)
- Payroll references User via `employeeId`

**Data Flow:**
1. User creation → Salary Assignment created
2. Payroll generation → Fetches User details
3. Payroll calculation → Uses User's country, bank details, shift assignments
4. Payroll summary → Includes User's name, bank account

**Key Fields:**
- `Payroll.employeeId` → `User._id`
- `Payroll.country` → `User.country`
- Payroll uses `User.bankDetails` for salary transfer

### 4.2 Payroll → Payslip

**Relationship**: One-to-One
- One Payroll record generates one Payslip
- Payslip references Payroll via `payrollId`

**Data Flow:**
1. Payroll status → "Completed" triggers payslip generation eligibility
2. Payslip generation → Reads Payroll data
3. Payslip PDF → Uses Payroll calculations
4. Payslip email → Includes Payroll summary

**Key Fields:**
- `Payslip.payrollId` → `Payroll._id`
- Payslip uses all Payroll calculation fields

### 4.3 Users → Payslip

**Relationship**: One-to-Many
- One User can have many Payslips (one per month)
- Payslip references User via `userId`

**Data Flow:**
1. Payslip generation → Fetches User details
2. Payslip PDF → Includes User's personal info, bank details
3. Payslip email → Sends to User's email

**Key Fields:**
- `Payslip.userId` → `User._id`
- Payslip uses `User.email` for email delivery
- Payslip uses `User.bankDetails` for display

### 4.4 Supporting Modules

#### **Attendance → Payroll**
- `AttendanceRecord` provides present/absent days
- Used in `getMonthlyAttendance()` method
- Affects attendance-adjusted gross calculation

#### **Leave → Payroll**
- `Leave` provides approved leave days
- Used in `fetchApprovedLeaves()` method
- Included in payable days calculation

#### **Overtime → Payroll**
- `Overtime` provides overtime hours
- Used in overtime pay calculation
- Added to net salary

#### **Tax Declaration → Payroll**
- `TaxDeclaration` provides income tax
- Used in `calculateIncomeTax()` method
- Monthly deduction distributed annually

#### **Salary Assignment → Payroll**
- `SalaryAssignment` provides salary structure
- Used in payroll calculation
- Links employee to salary structure

#### **Holiday Calendar → Payroll**
- `HolidayCalendar` provides holidays
- Used in `getWorkingDaysInMonth()` method
- Affects payable days calculation

#### **Shift Assignment → Payroll**
- `ShiftAssignment` provides weekend days
- Used in `getWorkingDaysInMonth()` method
- Affects working days calculation

---

## 5. Calculation Flow Diagrams

### 5.1 Payroll Generation Flow

```
User Request (monthYear, userIds/filters)
    ↓
Validate monthYear format
    ↓
Get User IDs (from filters or provided)
    ↓
Check Existing Payroll (exclude blocked users)
    ↓
Fetch Employees & Salary Assignments
    ↓
Validate Employee-Salary Assignment Consistency
    ↓
For Each Employee (Parallel):
    ├─ Get Monthly Attendance
    ├─ Fetch Approved Leaves
    ├─ Get Overtime Hours
    ├─ Get Working Days Info
    └─ Calculate Payroll Record
        ├─ Calculate LOP Days
        ├─ Calculate Payable Days
        ├─ Calculate Attendance Adjusted Gross
        ├─ Calculate Earnings (Basic, HRA, DA, etc.)
        ├─ Calculate Deductions (Country-Specific)
        ├─ Calculate Overtime Pay
        ├─ Calculate Net Salary
        └─ Calculate CTC
    ↓
Insert Payroll Records (Batch)
    ↓
Calculate Summary (Totals)
    ↓
Return Summary with Status: Draft
```

### 5.2 Payslip Generation Flow

```
User Request (monthYear, userIds/filters)
    ↓
Validate monthYear format
    ↓
Get User IDs (only Completed payroll)
    ↓
Fetch Employees & Completed Payroll Records
    ↓
For Each Employee (Parallel):
    ├─ Create/Update Payslip Record
    ├─ Generate Payslip PDF
    │   ├─ Prepare Template Data
    │   ├─ Load DOCX Template
    │   ├─ Replace Placeholders
    │   ├─ Convert DOCX to PDF
    │   ├─ Upload to GCP Cloud Storage
    │   └─ Get Public URL
    ├─ Save Payslip with URL
    └─ Set Status: Generated
    ↓
Return Generation Results
```

### 5.3 Payslip Email Flow

```
User Request (monthYear, userIds/filters)
    ↓
Get User IDs (only Completed payroll)
    ↓
Fetch Payslips & User Details
    ↓
For Each Recipient (Parallel):
    ├─ Validate User & Payslip Exist
    ├─ Send Email with Payslip PDF
    ├─ Update Payslip Status: Sent
    ├─ Record Email History
    └─ Set isExport: true
    ↓
Return Success/Failure Counts
```

---

## 6. Key Service Notes

### 6.1 Services Used in Payroll Calculation

1. **`payrollService.initiatePayroll()`** - Main entry point
2. **`payrollService.processPayrollRecords()`** - Processes all employees
3. **`payrollService.calculatePayrollRecord()`** - Core calculation
4. **`payrollService.calculateDeductions()`** - Deduction calculations
5. **`payrollService.getMonthlyAttendance()`** - Attendance data
6. **`payrollService.fetchApprovedLeaves()`** - Leave data
7. **`payrollService.getWorkingDaysInMonth()`** - Working days calculation
8. **`payrollService.calculateProfessionalTax()`** - Professional tax
9. **`payrollService.calculateIncomeTax()`** - Income tax from declaration

### 6.2 Services Used in Payslip Generation

1. **`payslipService.bulkGenerate()`** - Main entry point
2. **`payslipService.generatePayslipPDF()`** - PDF generation
3. **`payslipService.replacePlaceholdersInDocx()`** - Template rendering
4. **`payslipService.convertDocxToPDF()`** - PDF conversion
5. **`payslipService.sendPayslips()`** - Email sending
6. **`emailService.sendPayslipEmails()`** - Email service integration

### 6.3 Country-Specific Logic

**India (IN):**
- Full statutory deductions (EPF, ESI, PT, IT)
- Percentage-based allowances
- Professional tax based on slabs
- Income tax from tax declaration

**UAE (AE):**
- No statutory deductions
- Fixed allowances (travel, air ticket, medical)
- Auto-calculated other allowance
- Only leave deductions
- Annual allowances (air ticket, medical) not in monthly calculation

---

## 7. Important Notes

### 7.1 Half-Day Leave Support
- `fetchApprovedLeaves()` sums `noOfDays` field (supports decimals)
- Previously used `countDocuments()` which counted records, not days
- Now correctly handles 0.5, 1.5, 2.5 days, etc.

### 7.2 Attendance Regularization
- Out-of-window attendance can be regularized
- Regularized attendance counts as present
- Status: "Out-Of-Window" + `regularization.isRegularized: true` + `regularization.status: 'Approved'`

### 7.3 Optional Holidays
- Optional holidays are tracked separately
- Only APPROVED optional holidays count as holidays
- Included in `getWorkingDaysInMonth()` calculation

### 7.4 Status Workflow
- **Draft** → Can move to PendingApproval or Cancelled
- **PendingApproval** → Can move to InPayment or Cancelled
- **InPayment** → Can move to Completed or Failed
- **Failed** → Can move to Completed or Failed (retry)
- **Completed** → Final status, cannot be modified
- **RetryPending** → Can move to InPayment or Cancelled
- **Cancelled** → Final status

### 7.5 Payslip Generation Prerequisites
- Payroll status must be "Completed"
- Payslip can be generated multiple times (updates existing)
- PDF is stored in GCP Cloud Storage
- Email can be sent multiple times (tracks history)

---

## 8. File References

### Routes
- `src/routes/user.routes.ts`
- `src/routes/payroll.routes.ts`
- `src/routes/payslip.routes.ts`

### Services
- `src/services/user.service.ts`
- `src/services/payroll.service.ts`
- `src/services/payslip.service.ts`
- `src/services/payroll/salary-calculator.service.ts`
- `src/services/payroll/payroll-salary-structure.service.ts`

### Models
- `src/models/user.model.ts`
- `src/models/payrolls.model.ts`
- `src/models/payslip.model.ts`

### Supporting Models
- `src/models/attendance-record.model.ts`
- `src/models/leave.model.ts`
- `src/models/overtime.model.ts`
- `src/models/tax-declaration.ts`
- `src/models/salary-assignments.model.ts`
- `src/models/holiday-calendar.model.ts`
- `src/models/shift.model.ts`
- `src/models/optional-holiday-request.model.ts`

---

**Document Generated**: Comprehensive analysis of Users, Payroll, and Payslip modules with all child relationships, calculation logic, and service dependencies.

