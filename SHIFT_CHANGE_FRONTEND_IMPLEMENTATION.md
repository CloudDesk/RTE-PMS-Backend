# Shift Change Request - Frontend Implementation Guide

## 📋 Overview

This document provides complete frontend implementation details for the **Shift Change Request Approval System**. Use this as a reference for integrating the shift change request feature into your frontend application.

---

## 🔌 API Endpoints

Base URL: `/api/shift-changes`

All endpoints require **JWT authentication** (cookie-based).

---

### **1. Create Shift Change Request**

**Endpoint:** `POST /api/shift-changes`

**Authentication:** Required (JWT Cookie)

**Request Body:**
```json
{
  "requestedShiftId": "60f7b3c4e1234567890abcde",
  "effectiveDate": "2025-12-01",
  "reason": "Personal reasons - need morning shift for better work-life balance",
  "remarks": "Optional additional remarks",
  "appliedTo": {
    "_id": "60f7b3c4e1234567890abcdf",
    "name": "Manager Name"
  }
}
```

**Request Body Fields:**
- `requestedShiftId` (string, required) - ID of the shift to change to
- `effectiveDate` (string, required) - Date in YYYY-MM-DD format (must be today or future)
- `reason` (string, required) - Reason for shift change (minimum 10 characters)
- `remarks` (string, optional) - Additional remarks
- `appliedTo` (object, optional) - Manager/Admin to approve
  - `_id` (string) - Manager/Admin user ID
  - `name` (string) - Manager/Admin name
  - If not provided, system will use user's manager from profile

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "60f7b3c4e1234567890abce0",
    "userId": "60f7b3c4e1234567890abcd1",
    "user": {
      "name": "Employee Name",
      "email": "employee@example.com"
    },
    "currentShiftId": "60f7b3c4e1234567890abcd2",
    "currentShift": {
      "_id": "60f7b3c4e1234567890abcd3",
      "name": "Afternoon Shift",
      "code": "NOON",
      "startTime": "13:00",
      "endTime": "21:00"
    },
    "requestedShiftId": "60f7b3c4e1234567890abcde",
    "requestedShift": {
      "_id": "60f7b3c4e1234567890abcde",
      "name": "Morning Shift",
      "code": "MORN",
      "startTime": "09:00",
      "endTime": "17:00"
    },
    "effectiveDate": "2025-12-01T00:00:00.000Z",
    "reason": "Personal reasons - need morning shift for better work-life balance",
    "remarks": "Optional additional remarks",
    "status": "Pending",
    "appliedTo": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name"
    },
    "appliedToUser": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name",
      "email": "manager@example.com"
    },
    "approvedById": null,
    "approvedBy": null,
    "approvedAt": null,
    "rejectedAt": null,
    "createdAt": "2025-11-26T12:00:00.000Z",
    "updatedAt": "2025-11-26T12:00:00.000Z",
    "cancelledAt": null
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "message": "Effective date must be today or a future date"
  }
}
```

**Common Error Messages:**
- `"User does not have an active shift assignment"` - User needs an active shift
- `"Requested shift must be different from current shift"` - Cannot request same shift
- `"Effective date must be today or a future date"` - Invalid date
- `"Reason must be at least 10 characters"` - Reason too short
- `"A pending shift change request already exists for this effective date"` - Duplicate request
- `"Approver must have admin or manager role"` - Invalid approver

**Frontend Implementation Example:**
```typescript
interface ShiftChangeRequest {
  requestedShiftId: string;
  effectiveDate: string; // YYYY-MM-DD
  reason: string;
  remarks?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
}

async function createShiftChangeRequest(data: ShiftChangeRequest) {
  const response = await fetch('/api/shift-changes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Important for cookie-based auth
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create request');
  }

  return await response.json();
}
```

---

### **2. Get Shift Change Requests (List)**

**Endpoint:** `GET /api/shift-changes`

**Authentication:** Required (JWT Cookie)

**Query Parameters:**
- `userId` (string, optional) - Filter by user ID (admin only)
- `status` (string, optional) - Filter by status: `'Pending'`, `'Approved'`, `'Rejected'`, `'Cancelled'`
- `appliedTo` (string, optional) - Filter by manager ID (admin only)
- `startDate` (string, optional) - Filter from date (YYYY-MM-DD)
- `endDate` (string, optional) - Filter to date (YYYY-MM-DD)
- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 20)

**Role-Based Filtering (Automatic):**
- **Admin/SuperAdmin:** Sees ALL requests (unless `userId` query param filters for specific user)
- **Manager:** Sees only requests where `appliedTo._id` matches their user ID
- **Regular User:** Sees only their own requests

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "60f7b3c4e1234567890abce0",
      "userId": "60f7b3c4e1234567890abcd1",
      "user": {
        "name": "Employee Name",
        "email": "employee@example.com"
      },
      "currentShiftId": "60f7b3c4e1234567890abcd2",
      "currentShift": {
        "_id": "60f7b3c4e1234567890abcd3",
        "name": "Afternoon Shift",
        "code": "NOON",
        "startTime": "13:00",
        "endTime": "21:00"
      },
      "requestedShiftId": "60f7b3c4e1234567890abcde",
      "requestedShift": {
        "_id": "60f7b3c4e1234567890abcde",
        "name": "Morning Shift",
        "code": "MORN",
        "startTime": "09:00",
        "endTime": "17:00"
      },
      "effectiveDate": "2025-12-01T00:00:00.000Z",
      "reason": "Personal reasons - need morning shift",
      "remarks": "",
      "status": "Pending",
      "appliedTo": {
        "_id": "60f7b3c4e1234567890abcdf",
        "name": "Manager Name"
      },
      "appliedToUser": {
        "_id": "60f7b3c4e1234567890abcdf",
        "name": "Manager Name",
        "email": "manager@example.com"
      },
      "approvedById": null,
      "approvedBy": null,
      "approvedAt": null,
      "rejectedAt": null,
      "createdAt": "2025-11-26T12:00:00.000Z",
      "updatedAt": "2025-11-26T12:00:00.000Z",
      "cancelledAt": null
    }
  ],
  "total": 1,
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

**Frontend Implementation Example:**
```typescript
interface ShiftChangeQuery {
  userId?: string;
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  appliedTo?: string; // Manager ID (admin only)
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  page?: number;
  limit?: number;
}

async function getShiftChangeRequests(query?: ShiftChangeQuery) {
  const params = new URLSearchParams();
  
  if (query?.userId) params.append('userId', query.userId);
  if (query?.status) params.append('status', query.status);
  if (query?.appliedTo) params.append('appliedTo', query.appliedTo);
  if (query?.startDate) params.append('startDate', query.startDate);
  if (query?.endDate) params.append('endDate', query.endDate);
  if (query?.page) params.append('page', query.page.toString());
  if (query?.limit) params.append('limit', query.limit.toString());

  const response = await fetch(`/api/shift-changes?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch shift change requests');
  }

  return await response.json();
}
```

---

### **3. Get Shift Change Request by ID**

**Endpoint:** `GET /api/shift-changes/:id`

**Authentication:** Required (JWT Cookie)

**URL Parameters:**
- `id` (string, required) - Shift change request ID

**Authorization:**
- User can view their own requests
- Manager/Admin can view requests assigned to them or all requests (admin)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "60f7b3c4e1234567890abce0",
    "userId": "60f7b3c4e1234567890abcd1",
    "user": {
      "name": "Employee Name",
      "email": "employee@example.com"
    },
    "currentShiftId": "60f7b3c4e1234567890abcd2",
    "currentShift": {
      "_id": "60f7b3c4e1234567890abcd3",
      "name": "Afternoon Shift",
      "code": "NOON",
      "startTime": "13:00",
      "endTime": "21:00"
    },
    "requestedShiftId": "60f7b3c4e1234567890abcde",
    "requestedShift": {
      "_id": "60f7b3c4e1234567890abcde",
      "name": "Morning Shift",
      "code": "MORN",
      "startTime": "09:00",
      "endTime": "17:00"
    },
    "effectiveDate": "2025-12-01T00:00:00.000Z",
    "reason": "Personal reasons - need morning shift",
    "remarks": "",
    "status": "Pending",
    "appliedTo": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name"
    },
    "appliedToUser": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name",
      "email": "manager@example.com"
    },
    "approvedById": "60f7b3c4e1234567890abcdf",
    "approvedBy": null,
    "approvedAt": null,
    "rejectedAt": null,
    "createdAt": "2025-11-26T12:00:00.000Z",
    "updatedAt": "2025-11-26T12:00:00.000Z",
    "cancelledAt": null
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "message": "Shift change request not found"
  }
}
```

**Error Response (403):**
```json
{
  "success": false,
  "error": {
    "message": "Unauthorized to view this request"
  }
}
```

**Frontend Implementation Example:**
```typescript
async function getShiftChangeRequestById(id: string) {
  const response = await fetch(`/api/shift-changes/${id}`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Request not found');
    }
    if (response.status === 403) {
      throw new Error('Unauthorized to view this request');
    }
    throw new Error('Failed to fetch shift change request');
  }

  return await response.json();
}
```

---

### **4. Approve/Reject Shift Change Request**

**Endpoint:** `PUT /api/shift-changes/:id/status`

**Authentication:** Required (JWT Cookie)

**Authorization:** Only the assigned manager/admin (`appliedTo._id`) or any admin can approve/reject

**URL Parameters:**
- `id` (string, required) - Shift change request ID

**Request Body:**
```json
{
  "status": "Approved",
  "remarks": "Approved - shift change will take effect from effective date"
}
```

**Request Body Fields:**
- `status` (string, required) - Must be `"Approved"` or `"Rejected"`
- `remarks` (string, optional) - Remarks for approval/rejection

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "60f7b3c4e1234567890abce0",
    "status": "Approved",
    "approvedBy": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name",
      "email": "manager@example.com"
    },
    "approvedById": "60f7b3c4e1234567890abcdf",
    "approvedBy": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name",
      "email": "manager@example.com"
    },
    "approvedAt": "2025-11-26T14:30:00.000Z",
    "rejectedAt": null,
    "remarks": "Approved - shift change will take effect from effective date",
    "appliedToUser": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name",
      "email": "manager@example.com"
    },
    "cancelledAt": null
    // ... other fields
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "message": "Shift change request has already been processed"
  }
}
```

**Error Response (403):**
```json
{
  "success": false,
  "error": {
    "message": "Unauthorized to approve/reject this request"
  }
}
```

**Common Error Messages:**
- `"Invalid status. Use 'Approved' or 'Rejected'"` - Invalid status value
- `"Shift change request has already been processed"` - Request already processed (not pending)
- `"Unauthorized to approve/reject this request"` - Not authorized

**Frontend Implementation Example:**
```typescript
interface StatusUpdate {
  status: 'Approved' | 'Rejected';
  remarks?: string;
}

async function updateShiftChangeStatus(id: string, data: StatusUpdate) {
  const response = await fetch(`/api/shift-changes/${id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to update status');
  }

  return await response.json();
}
```

---

### **5. Cancel Shift Change Request**

**Endpoint:** `PUT /api/shift-changes/:id/cancel`

**Authentication:** Required (JWT Cookie)

**Authorization:** Only the user who created the request can cancel (if status is 'Pending')

**URL Parameters:**
- `id` (string, required) - Shift change request ID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Shift change request cancelled successfully"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "message": "Cannot cancel request with status: Approved"
  }
}
```

**Error Response (403):**
```json
{
  "success": false,
  "error": {
    "message": "Unauthorized to cancel this request"
  }
}
```

**Frontend Implementation Example:**
```typescript
async function cancelShiftChangeRequest(id: string) {
  const response = await fetch(`/api/shift-changes/${id}/cancel`, {
    method: 'PUT',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to cancel request');
  }

  return await response.json();
}
```

---

## 🎨 Frontend UI Components

### **1. Create Shift Change Request Form**

**Required Fields:**
- **Requested Shift** (Dropdown) - List of available shifts (exclude current shift)
- **Effective Date** (Date Picker) - Minimum date: today
- **Reason** (Textarea) - Minimum 10 characters
- **Remarks** (Textarea, optional)
- **Applied To** (Dropdown, optional) - List of managers/admins (defaults to user's manager)

**Validation Rules:**
```typescript
const validationRules = {
  requestedShiftId: {
    required: true,
    validate: (value: string, currentShiftId: string) => 
      value !== currentShiftId || 'Cannot select current shift'
  },
  effectiveDate: {
    required: true,
    validate: (value: Date) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return value >= today || 'Effective date must be today or future';
    }
  },
  reason: {
    required: true,
    minLength: 10,
    message: 'Reason must be at least 10 characters'
  }
};
```

**Example Form Component:**
```typescript
interface ShiftChangeFormData {
  requestedShiftId: string;
  effectiveDate: string;
  reason: string;
  remarks?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
}

function ShiftChangeRequestForm() {
  const [formData, setFormData] = useState<ShiftChangeFormData>({
    requestedShiftId: '',
    effectiveDate: '',
    reason: '',
    remarks: '',
  });
  const [shifts, setShifts] = useState([]);
  const [currentShift, setCurrentShift] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch available shifts and current shift
  useEffect(() => {
    // Fetch shifts from /api/shifts
    // Fetch current shift from user profile or /api/shifts/current/:userId
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await createShiftChangeRequest(formData);
      // Show success message
      // Redirect or refresh list
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

---

### **2. Shift Change Request List**

**Display Columns:**
- Employee Name
- Current Shift
- Requested Shift
- Effective Date
- Reason
- Status (with color coding)
- Applied To
- Created Date
- Actions (View, Approve/Reject, Cancel)

**Status Badge Colors:**
- `Pending` - Yellow/Orange
- `Approved` - Green
- `Rejected` - Red
- `Cancelled` - Gray

**Filters:**
- Status dropdown (Pending, Approved, Rejected, Cancelled)
- Date range picker (startDate, endDate)
- User filter (admin only)
- Manager filter (admin only) - Filter by `appliedTo` manager ID

**Pagination:**
- Page number
- Items per page selector
- Total count display

**Example List Component:**
```typescript
function ShiftChangeRequestList() {
  const [requests, setRequests] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    startDate: '',
    endDate: '',
    page: 1,
    limit: 20,
  });
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    loadRequests();
  }, [filters]);

  const loadRequests = async () => {
    try {
      const response = await getShiftChangeRequests(filters);
      setRequests(response.data);
      setPagination(response.meta);
    } catch (error) {
      console.error('Failed to load requests:', error);
    }
  };

  return (
    <div>
      {/* Filters */}
      <div className="filters">
        {/* Filter components */}
      </div>

      {/* Table */}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Current Shift</th>
            <th>Requested Shift</th>
            <th>Effective Date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request._id}>
              {/* Table cells */}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="pagination">
        {/* Pagination controls */}
      </div>
    </div>
  );
}
```

---

### **3. Shift Change Request Detail View**

**Display Information:**
- Employee Details (Name, Email)
- Current Shift (Name, Code, Start Time, End Time)
- Requested Shift (Name, Code, Start Time, End Time)
- Effective Date
- Reason
- Remarks
- Status
- Applied To (Manager name and ID)
- Applied To User (Manager full details with email)
- Approved By ID (if approved/rejected)
- Approved By (if approved/rejected)
- Approved At (if approved)
- Rejected At (if rejected)
- Cancelled At (if cancelled)
- Created At
- Updated At

**Actions (Based on Status and Role):**
- If `Pending` and user is creator: Show "Cancel" button
- If `Pending` and user is approver: Show "Approve" and "Reject" buttons
- If `Approved` or `Rejected`: Show status badge only

---

### **4. Approve/Reject Modal**

**Fields:**
- Status (Radio buttons: Approved, Rejected)
- Remarks (Textarea, optional)

**Example Modal:**
```typescript
function ApproveRejectModal({ requestId, onClose, onSuccess }) {
  const [status, setStatus] = useState<'Approved' | 'Rejected'>('Approved');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await updateShiftChangeStatus(requestId, { status, remarks });
      onSuccess();
      onClose();
    } catch (error) {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      {/* Modal content */}
    </Modal>
  );
}
```

---

## 🔐 Role-Based Access Control

### **User Roles and Permissions:**

1. **Admin/SuperAdmin:**
   - Can view ALL shift change requests
   - Can approve/reject any request
   - Can filter by userId

2. **Manager:**
   - Can view only requests assigned to them (`appliedTo._id` matches their ID)
   - Can approve/reject requests assigned to them
   - Cannot see other managers' requests

3. **Regular User:**
   - Can view only their own requests
   - Can create new requests
   - Can cancel their own pending requests
   - Cannot approve/reject requests

**Frontend Implementation:**
```typescript
// Get user role from auth context
const { user } = useAuth();

// Check permissions
const canViewAll = user.role === 'admin' || user.role === 'superadmin';
const canApprove = user.role === 'admin' || user.role === 'superadmin' || user.role === 'manager';
const canCancel = request.userId === user._id && request.status === 'Pending';
```

---

## 📝 Validation Rules Summary

### **Create Request:**
- ✅ `requestedShiftId` must exist and be different from current shift
- ✅ `effectiveDate` must be today or future date
- ✅ `reason` is required (minimum 10 characters)
- ✅ Cannot have duplicate pending request for same effective date
- ✅ User must have an active shift assignment

### **Approve/Reject:**
- ✅ Only assigned manager/admin can approve/reject
- ✅ Can only approve/reject if status is 'Pending'
- ✅ When approved, shift assignment is automatically updated

### **Cancel:**
- ✅ Only request creator can cancel
- ✅ Can only cancel if status is 'Pending'

---

## 🎯 Integration Points

### **1. Get Available Shifts**
Use existing endpoint: `GET /api/shifts` to get list of available shifts.

**Filter out current shift:**
```typescript
const availableShifts = shifts.filter(
  shift => shift._id !== currentShift.shiftId
);
```

### **2. Get Current Shift**
Use existing endpoint: `GET /api/shifts/current/:employeeId` or get from user profile.

### **3. Get Managers/Admins**
Use existing endpoint: `GET /api/users?role=manager` or `GET /api/users?role=admin` to get list of approvers.

---

## 🚨 Error Handling

### **Common Error Scenarios:**

1. **Network Errors:**
   ```typescript
   try {
     await createShiftChangeRequest(data);
   } catch (error) {
     if (error.message.includes('Network')) {
       // Show network error message
     }
   }
   ```

2. **Validation Errors:**
   ```typescript
   // Backend returns 400 with error message
   {
     "success": false,
     "error": {
       "message": "Effective date must be today or a future date"
     }
   }
   ```

3. **Authorization Errors:**
   ```typescript
   // Backend returns 403
   {
     "success": false,
     "error": {
       "message": "Unauthorized to approve/reject this request"
     }
   }
   ```

---

## 📱 TypeScript Interfaces

```typescript
// Shift Change Request Response Interface
interface ShiftChangeRequestResponse {
  _id: string;
  userId: string;
  user?: {
    _id?: string;
    name: string;
    email: string;
  };
  currentShiftId: string;
  currentShift?: {
    _id: string;
    name: string;
    code: string;
    startTime: string;
    endTime: string;
  } | null;
  requestedShiftId: string;
  requestedShift?: {
    _id: string;
    name: string;
    code: string;
    startTime: string;
    endTime: string;
  };
  effectiveDate: string; // ISO date string
  reason: string;
  remarks?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  appliedTo: {
    _id: string;
    name: string;
  };
  appliedToUser?: {
    _id: string;
    name: string;
    email: string;
  };
  approvedById?: string;
  approvedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  approvedAt?: string | null; // ISO date string
  rejectedAt?: string | null; // ISO date string
  cancelledAt?: string | null; // ISO date string
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}
```

## 📱 Example React Hook

```typescript
import { useState, useEffect } from 'react';

export function useShiftChangeRequests(filters = {}) {
  const [requests, setRequests] = useState<ShiftChangeRequestResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getShiftChangeRequests(filters);
      setRequests(response.data);
      setPagination(response.meta);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filters]);

  const createRequest = async (data: ShiftChangeFormData) => {
    setLoading(true);
    try {
      const response = await createShiftChangeRequest(data);
      await fetchRequests(); // Refresh list
      return response;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: 'Approved' | 'Rejected', remarks?: string) => {
    setLoading(true);
    try {
      const response = await updateShiftChangeStatus(id, { status, remarks });
      await fetchRequests(); // Refresh list
      return response;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const cancelRequest = async (id: string) => {
    setLoading(true);
    try {
      const response = await cancelShiftChangeRequest(id);
      await fetchRequests(); // Refresh list
      return response;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    requests,
    loading,
    error,
    pagination,
    createRequest,
    updateStatus,
    cancelRequest,
    refetch: fetchRequests,
  };
}
```

---

## 🎨 UI/UX Recommendations

1. **Status Indicators:**
   - Use color-coded badges for status
   - Show status change history if needed

2. **Date Formatting:**
   - Display dates in user-friendly format (e.g., "Dec 1, 2025")
   - Show relative time for recent requests (e.g., "2 hours ago")

3. **Shift Display:**
   - Show shift name and time range clearly
   - Highlight the difference between current and requested shift

4. **Notifications:**
   - Show success/error toasts after actions
   - Notify users when their request is approved/rejected

5. **Loading States:**
   - Show loading spinners during API calls
   - Disable buttons while processing

6. **Empty States:**
   - Show helpful message when no requests found
   - Provide "Create Request" button in empty state

---

## ✅ Testing Checklist

- [ ] Create shift change request with valid data
- [ ] Validate effective date must be today or future
- [ ] Validate cannot request same shift as current
- [ ] Validate duplicate pending requests are prevented
- [ ] Test role-based filtering (user sees own, manager sees assigned, admin sees all)
- [ ] Test approval by manager
- [ ] Test rejection by manager
- [ ] Test cancellation by user
- [ ] Test authorization (only assigned manager can approve)
- [ ] Test pagination
- [ ] Test filtering by status, date range
- [ ] Test error handling for invalid requests
- [ ] Test empty states
- [ ] Test loading states

---

## 📚 Related Endpoints

- **Shift Management:** `GET /api/shifts` - Get available shifts
- **Current Shift:** `GET /api/shifts/current/:employeeId` - Get user's current shift
- **User Management:** `GET /api/users` - Get managers/admins for approver selection

---

**Status:** Ready for Frontend Implementation  
**Last Updated:** 2025-11-26

## 🔄 Recent Backend Changes (2025-11-26)

The following updates have been made to the backend API:

1. **New Query Parameter**: `appliedTo` - Added to `GET /api/shift-changes` endpoint for admin filtering by manager ID
2. **New Response Field**: `appliedToUser` - Returns full manager details (including email) in addition to `appliedTo` field
3. **New Response Field**: `approvedById` - Added to track the approver's user ID (matches WFH pattern)
4. **New Response Field**: `rejectedAt` - Added to track when a request was rejected (separate from `approvedAt`, matches WFH pattern)
5. **New Response Field**: `cancelledAt` - Added to track when a request was cancelled (null if not cancelled)

**Important Notes:**
- `appliedTo` query parameter is only available for admin/superadmin users
- `appliedToUser` field is populated in all list and detail responses
- `approvedById` will be present when a request is approved or rejected
- `approvedAt` will be set when a request is approved, `rejectedAt` will be set when rejected
- `cancelledAt` will be `null` for non-cancelled requests, and contain a date string for cancelled requests

