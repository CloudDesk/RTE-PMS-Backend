# Optional Holiday Request - Frontend Implementation Guide

## 📋 Overview

This document provides complete frontend implementation details for the **Optional Holiday Request System**. Employees can request optional holidays from their holiday calendar, with a maximum limit of 2 approved optional holidays per year.

### Key Features:
- ✅ Request optional holidays (max 2 per year)
- ✅ Admin/Manager approval workflow
- ✅ Annual limit validation (2 per year)
- ✅ Calendar validation (date must be optional holiday)
- ✅ Usage summary and limit tracking
- ✅ Integration with payroll (only approved optional holidays count)

---

## 🔌 API Endpoints

**Base URL:** `/api/optional-holidays`

All endpoints require **JWT authentication** (cookie-based).

---

### **1. Create Optional Holiday Request**

**Endpoint:** `POST /api/optional-holidays`

**Authentication:** Required (JWT Cookie)

**Request Body:**
```json
{
  "holidayDate": "2025-01-15",
  "holidayName": "Pongal",
  "reason": "Personal celebration",
  "appliedTo": {
    "_id": "60f7b3c4e1234567890abcdf",
    "name": "Manager Name"
  }
}
```

**Request Body Fields:**
- `holidayDate` (string, **required**) - Date in YYYY-MM-DD format (must be an optional holiday in calendar)
- `holidayName` (string, **required**) - Name of the optional holiday
- `reason` (string, optional) - Reason for requesting optional holiday
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
    "holidayDate": "2025-01-15T00:00:00.000Z",
    "holidayName": "Pongal",
    "year": 2025,
    "status": "Pending",
    "reason": "Personal celebration",
    "appliedTo": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name"
    },
    "approvedById": null,
    "approvedBy": null,
    "approvedAt": null,
    "rejectedAt": null,
    "cancelledAt": null,
    "createdAt": "2025-11-28T12:00:00.000Z",
    "updatedAt": "2025-11-28T12:00:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "message": "Annual limit reached. You have already used 2 out of 2 optional holidays for 2025"
  }
}
```

**Other Possible Errors:**
- `"The selected date is not an optional holiday in your calendar"`
- `"You have already applied for this optional holiday"`
- `"User account is inactive"`
- `"User not found"`

---

### **2. Get Optional Holiday Requests**

**Endpoint:** `GET /api/optional-holidays`

**Authentication:** Required (JWT Cookie)

**Query Parameters:**
- `userId` (string, optional) - Filter by user ID (admin/manager only)
- `status` (string, optional) - Filter by status: `Pending`, `Approved`, `Rejected`, `Cancelled`
- `startDate` (string, optional) - Filter from date (YYYY-MM-DD)
- `endDate` (string, optional) - Filter to date (YYYY-MM-DD)
- `year` (number, optional) - Filter by year
- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 10, max: 100)

**Example Request:**
```
GET /api/optional-holidays?status=Pending&year=2025&page=1&limit=10
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "_id": "60f7b3c4e1234567890abce0",
        "userId": {
          "_id": "60f7b3c4e1234567890abcd1",
          "name": "Employee Name",
          "email": "employee@example.com",
          "employeeCode": "EMP001"
        },
        "holidayDate": "2025-01-15T00:00:00.000Z",
        "holidayName": "Pongal",
        "year": 2025,
        "status": "Pending",
        "reason": "Personal celebration",
        "appliedTo": {
          "_id": "60f7b3c4e1234567890abcdf",
          "name": "Manager Name"
        },
        "approvedBy": null,
        "createdAt": "2025-11-28T12:00:00.000Z",
        "updatedAt": "2025-11-28T12:00:00.000Z"
      }
    ],
    "total": 25,
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "totalPages": 3
    }
  }
}
```

**Note:** 
- Non-admin/manager users can only see their own requests
- Admin/manager users can see all requests or filter by userId

---

### **3. Get Single Optional Holiday Request**

**Endpoint:** `GET /api/optional-holidays/:id`

**Authentication:** Required (JWT Cookie)

**URL Parameters:**
- `id` (string, required) - Optional holiday request ID

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
    "holidayDate": "2025-01-15T00:00:00.000Z",
    "holidayName": "Pongal",
    "year": 2025,
    "status": "Approved",
    "reason": "Personal celebration",
    "remarks": "Approved for personal celebration",
    "appliedTo": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name"
    },
    "approvedById": "60f7b3c4e1234567890abcdf",
    "approvedBy": {
      "_id": "60f7b3c4e1234567890abcdf",
      "name": "Manager Name",
      "email": "manager@example.com"
    },
    "approvedAt": "2025-11-28T13:00:00.000Z",
    "createdAt": "2025-11-28T12:00:00.000Z",
    "updatedAt": "2025-11-28T13:00:00.000Z"
  }
}
```

---

### **4. Approve/Reject Optional Holiday Request**

**Endpoint:** `PUT /api/optional-holidays/:id/status`

**Authentication:** Required (JWT Cookie - Admin/Manager only)

**URL Parameters:**
- `id` (string, required) - Optional holiday request ID

**Request Body:**
```json
{
  "status": "Approved",
  "remarks": "Approved for personal celebration"
}
```

**Request Body Fields:**
- `status` (string, **required**) - Status: `Approved`, `Rejected`, or `Cancelled`
- `remarks` (string, optional) - Remarks/notes from approver

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
    "approvedAt": "2025-11-28T13:00:00.000Z",
    "remarks": "Approved for personal celebration",
    "updatedAt": "2025-11-28T13:00:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "message": "Cannot approve: Employee has already used 2 out of 2 optional holidays for 2025"
  }
}
```

**Other Possible Errors:**
- `"Optional holiday request not found"`
- `"Optional holiday request has already been processed"`

---

### **5. Cancel Optional Holiday Request**

**Endpoint:** `DELETE /api/optional-holidays/:id`

**Authentication:** Required (JWT Cookie)

**URL Parameters:**
- `id` (string, required) - Optional holiday request ID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "60f7b3c4e1234567890abce0",
    "status": "Cancelled",
    "cancelledAt": "2025-11-28T14:00:00.000Z",
    "updatedAt": "2025-11-28T14:00:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": {
    "message": "Only pending requests can be cancelled"
  }
}
```

**Other Possible Errors:**
- `"Optional holiday request not found"`
- `"You can only cancel your own optional holiday requests"`

---

### **6. Get Usage Summary**

**Endpoint:** `GET /api/optional-holidays/user/:userId/summary`

**Authentication:** Required (JWT Cookie)

**URL Parameters:**
- `userId` (string, required) - User ID

**Query Parameters:**
- `year` (number, optional) - Year to get summary for (default: current year)

**Example Request:**
```
GET /api/optional-holidays/user/60f7b3c4e1234567890abcd1/summary?year=2025
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 2,
    "used": 1,
    "remaining": 1,
    "requests": [
      {
        "_id": "60f7b3c4e1234567890abce0",
        "holidayDate": "2025-01-15T00:00:00.000Z",
        "holidayName": "Pongal",
        "status": "Approved",
        "approvedAt": "2025-11-28T13:00:00.000Z"
      },
      {
        "_id": "60f7b3c4e1234567890abce1",
        "holidayDate": "2025-11-14T00:00:00.000Z",
        "holidayName": "Children's Day",
        "status": "Pending",
        "approvedAt": null
      }
    ]
  }
}
```

---

### **7. Check Annual Limit**

**Endpoint:** `GET /api/optional-holidays/user/:userId/limit`

**Authentication:** Required (JWT Cookie)

**URL Parameters:**
- `userId` (string, required) - User ID

**Query Parameters:**
- `year` (number, optional) - Year to check limit for (default: current year)

**Example Request:**
```
GET /api/optional-holidays/user/60f7b3c4e1234567890abcd1/limit?year=2025
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "canRequest": true,
    "used": 1,
    "remaining": 1
  }
}
```

**Response when limit reached:**
```json
{
  "success": true,
  "data": {
    "canRequest": false,
    "used": 2,
    "remaining": 0
  }
}
```

---

## 🎨 Frontend Implementation Guide

### **Step 1: Create API Service**

Create a service file for optional holiday API calls:

```typescript
// services/optionalHoliday.service.ts or api/optionalHoliday.ts

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5800';

export interface OptionalHolidayRequest {
  _id: string;
  userId: string | {
    _id: string;
    name: string;
    email: string;
    employeeCode?: string;
  };
  user?: {
    name: string;
    email: string;
  };
  holidayDate: string | Date;
  holidayName: string;
  year: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  reason?: string;
  remarks?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
  approvedById?: string;
  approvedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  approvedAt?: string | Date;
  rejectedAt?: string | Date;
  cancelledAt?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateOptionalHolidayRequest {
  holidayDate: string; // YYYY-MM-DD
  holidayName: string;
  reason?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
}

export interface OptionalHolidayListResponse {
  requests: OptionalHolidayRequest[];
  total: number;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UsageSummary {
  total: number;
  used: number;
  remaining: number;
  requests: OptionalHolidayRequest[];
}

export interface AnnualLimit {
  canRequest: boolean;
  used: number;
  remaining: number;
}

class OptionalHolidayService {
  private baseURL = `${API_BASE_URL}/optional-holidays`;

  /**
   * Create optional holiday request
   */
  async createRequest(data: CreateOptionalHolidayRequest): Promise<{
    success: boolean;
    data?: OptionalHolidayRequest;
    error?: { message: string };
  }> {
    try {
      const response = await axios.post(`${this.baseURL}`, data, {
        withCredentials: true,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.response?.data?.error?.message || error.message || 'Failed to create optional holiday request',
        },
      };
    }
  }

  /**
   * Get optional holiday requests
   */
  async getRequests(params?: {
    userId?: string;
    status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
    startDate?: string;
    endDate?: string;
    year?: number;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data?: OptionalHolidayListResponse;
    error?: { message: string };
  }> {
    try {
      const response = await axios.get(`${this.baseURL}`, {
        params,
        withCredentials: true,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.response?.data?.error?.message || error.message || 'Failed to fetch optional holiday requests',
        },
      };
    }
  }

  /**
   * Get single optional holiday request
   */
  async getRequestById(id: string): Promise<{
    success: boolean;
    data?: OptionalHolidayRequest;
    error?: { message: string };
  }> {
    try {
      const response = await axios.get(`${this.baseURL}/${id}`, {
        withCredentials: true,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.response?.data?.error?.message || error.message || 'Failed to fetch optional holiday request',
        },
      };
    }
  }

  /**
   * Approve/Reject optional holiday request
   */
  async updateStatus(
    id: string,
    status: 'Approved' | 'Rejected' | 'Cancelled',
    remarks?: string
  ): Promise<{
    success: boolean;
    data?: OptionalHolidayRequest;
    error?: { message: string };
  }> {
    try {
      const response = await axios.put(
        `${this.baseURL}/${id}/status`,
        { status, remarks },
        { withCredentials: true }
      );
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.response?.data?.error?.message || error.message || 'Failed to update optional holiday request',
        },
      };
    }
  }

  /**
   * Cancel optional holiday request
   */
  async cancelRequest(id: string): Promise<{
    success: boolean;
    data?: OptionalHolidayRequest;
    error?: { message: string };
  }> {
    try {
      const response = await axios.delete(`${this.baseURL}/${id}`, {
        withCredentials: true,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.response?.data?.error?.message || error.message || 'Failed to cancel optional holiday request',
        },
      };
    }
  }

  /**
   * Get usage summary
   */
  async getUsageSummary(
    userId: string,
    year?: number
  ): Promise<{
    success: boolean;
    data?: UsageSummary;
    error?: { message: string };
  }> {
    try {
      const response = await axios.get(`${this.baseURL}/user/${userId}/summary`, {
        params: { year },
        withCredentials: true,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.response?.data?.error?.message || error.message || 'Failed to fetch usage summary',
        },
      };
    }
  }

  /**
   * Check annual limit
   */
  async checkAnnualLimit(
    userId: string,
    year?: number
  ): Promise<{
    success: boolean;
    data?: AnnualLimit;
    error?: { message: string };
  }> {
    try {
      const response = await axios.get(`${this.baseURL}/user/${userId}/limit`, {
        params: { year },
        withCredentials: true,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          message: error.response?.data?.error?.message || error.message || 'Failed to check annual limit',
        },
      };
    }
  }
}

export const optionalHolidayService = new OptionalHolidayService();
```

---

### **Step 2: Get Optional Holidays from Calendar**

You need to fetch optional holidays from the holiday calendar API:

```typescript
// services/holidayCalendar.service.ts

/**
 * Get optional holidays from user's holiday calendar
 */
async function getOptionalHolidays(userId: string, year: number): Promise<Array<{
  date: string; // YYYY-MM-DD
  name: string;
  type: 'optional';
}>> {
  try {
    // Get user's holiday calendar
    const calendarResponse = await axios.get(`${API_BASE_URL}/holiday-calendar/user/${userId}`, {
      withCredentials: true,
    });

    if (!calendarResponse.data.success || !calendarResponse.data.data) {
      return [];
    }

    const calendar = calendarResponse.data.data;
    
    // Filter optional holidays for the year
    const optionalHolidays = calendar.holidays
      .filter((h: any) => {
        const holidayDate = new Date(h.date);
        return h.type === 'optional' && holidayDate.getFullYear() === year;
      })
      .map((h: any) => ({
        date: new Date(h.date).toISOString().split('T')[0], // YYYY-MM-DD
        name: h.name,
        type: 'optional' as const,
      }));

    return optionalHolidays;
  } catch (error) {
    console.error('Error fetching optional holidays:', error);
    return [];
  }
}
```

---

### **Step 3: Create Request Form Component**

```typescript
// components/OptionalHolidayRequestForm.tsx

import React, { useState, useEffect } from 'react';
import { optionalHolidayService } from '../services/optionalHoliday.service';
import { getOptionalHolidays } from '../services/holidayCalendar.service';

interface OptionalHolidayRequestFormProps {
  userId: string;
  year?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const OptionalHolidayRequestForm: React.FC<OptionalHolidayRequestFormProps> = ({
  userId,
  year = new Date().getFullYear(),
  onSuccess,
  onCancel,
}) => {
  const [optionalHolidays, setOptionalHolidays] = useState<Array<{
    date: string;
    name: string;
  }>>([]);
  const [selectedHoliday, setSelectedHoliday] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<{ canRequest: boolean; used: number; remaining: number } | null>(null);

  useEffect(() => {
    loadData();
  }, [userId, year]);

  const loadData = async () => {
    try {
      // Load optional holidays from calendar
      const holidays = await getOptionalHolidays(userId, year);
      setOptionalHolidays(holidays);

      // Check annual limit
      const limitResponse = await optionalHolidayService.checkAnnualLimit(userId, year);
      if (limitResponse.success && limitResponse.data) {
        setLimit(limitResponse.data);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedHoliday) {
      setError('Please select an optional holiday');
      return;
    }

    const selected = optionalHolidays.find(h => h.date === selectedHoliday);
    if (!selected) {
      setError('Invalid holiday selected');
      return;
    }

    // Check limit before submitting
    if (limit && !limit.canRequest) {
      setError(`Annual limit reached. You have already used ${limit.used} out of 2 optional holidays for ${year}`);
      return;
    }

    setLoading(true);

    try {
      const response = await optionalHolidayService.createRequest({
        holidayDate: selectedHoliday,
        holidayName: selected.name,
        reason: reason.trim() || undefined,
      });

      if (response.success) {
        onSuccess?.();
        // Reset form
        setSelectedHoliday('');
        setReason('');
      } else {
        setError(response.error?.message || 'Failed to create request');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create request');
    } finally {
      setLoading(false);
    }
  };

  // Filter out past dates
  const availableHolidays = optionalHolidays.filter(h => {
    const holidayDate = new Date(h.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return holidayDate >= today;
  });

  return (
    <form onSubmit={handleSubmit} className="optional-holiday-form">
      <div className="form-header">
        <h3>Request Optional Holiday</h3>
        {limit && (
          <div className="limit-info">
            <span className={`limit-badge ${limit.canRequest ? 'available' : 'limit-reached'}`}>
              {limit.used} / {limit.total || 2} used
            </span>
            {limit.remaining > 0 && (
              <span className="remaining">({limit.remaining} remaining)</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="holidayDate">
          Select Optional Holiday <span className="required">*</span>
        </label>
        <select
          id="holidayDate"
          value={selectedHoliday}
          onChange={(e) => setSelectedHoliday(e.target.value)}
          required
          disabled={loading || (limit && !limit.canRequest)}
        >
          <option value="">-- Select Optional Holiday --</option>
          {availableHolidays.map((holiday) => (
            <option key={holiday.date} value={holiday.date}>
              {holiday.name} - {new Date(holiday.date).toLocaleDateString()}
            </option>
          ))}
        </select>
        {availableHolidays.length === 0 && (
          <p className="helper-text">No optional holidays available in your calendar</p>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="reason">Reason (Optional)</label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Enter reason for requesting this optional holiday..."
          disabled={loading}
        />
      </div>

      <div className="form-actions">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !selectedHoliday || (limit && !limit.canRequest)}
          className="btn-primary"
        >
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </div>

      {limit && !limit.canRequest && (
        <div className="limit-warning">
          <p>⚠️ You have reached the annual limit of 2 optional holidays for {year}.</p>
        </div>
      )}
    </form>
  );
};
```

---

### **Step 4: Create Request List Component**

```typescript
// components/OptionalHolidayRequestList.tsx

import React, { useState, useEffect } from 'react';
import { optionalHolidayService, OptionalHolidayRequest } from '../services/optionalHoliday.service';

interface OptionalHolidayRequestListProps {
  userId?: string;
  year?: number;
  status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  showActions?: boolean; // For admin/manager approval actions
}

export const OptionalHolidayRequestList: React.FC<OptionalHolidayRequestListProps> = ({
  userId,
  year = new Date().getFullYear(),
  status,
  showActions = false,
}) => {
  const [requests, setRequests] = useState<OptionalHolidayRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    loadRequests();
  }, [userId, year, status, pagination.page]);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await optionalHolidayService.getRequests({
        userId,
        year,
        status,
        page: pagination.page,
        limit: pagination.limit,
      });

      if (response.success && response.data) {
        setRequests(response.data.requests);
        setPagination(prev => ({
          ...prev,
          total: response.data!.meta.total,
          totalPages: response.data!.meta.totalPages,
        }));
      } else {
        setError(response.error?.message || 'Failed to load requests');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string, remarks?: string) => {
    try {
      const response = await optionalHolidayService.updateStatus(id, 'Approved', remarks);
      if (response.success) {
        loadRequests(); // Reload list
      } else {
        alert(response.error?.message || 'Failed to approve request');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to approve request');
    }
  };

  const handleReject = async (id: string, remarks?: string) => {
    try {
      const response = await optionalHolidayService.updateStatus(id, 'Rejected', remarks);
      if (response.success) {
        loadRequests(); // Reload list
      } else {
        alert(response.error?.message || 'Failed to reject request');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to reject request');
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this request?')) {
      return;
    }

    try {
      const response = await optionalHolidayService.cancelRequest(id);
      if (response.success) {
        loadRequests(); // Reload list
      } else {
        alert(response.error?.message || 'Failed to cancel request');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to cancel request');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      Pending: 'warning',
      Approved: 'success',
      Rejected: 'danger',
      Cancelled: 'secondary',
    };
    return statusColors[status] || 'secondary';
  };

  if (loading && requests.length === 0) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="optional-holiday-list">
      <table className="requests-table">
        <thead>
          <tr>
            <th>Holiday</th>
            <th>Date</th>
            <th>Employee</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Applied To</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => {
            const employeeName = typeof request.userId === 'object' 
              ? request.userId.name 
              : request.user?.name || 'N/A';
            
            return (
              <tr key={request._id}>
                <td>{request.holidayName}</td>
                <td>{new Date(request.holidayDate).toLocaleDateString()}</td>
                <td>{employeeName}</td>
                <td>{request.reason || '-'}</td>
                <td>
                  <span className={`status-badge ${getStatusBadge(request.status)}`}>
                    {request.status}
                  </span>
                </td>
                <td>{request.appliedTo?.name || '-'}</td>
                <td>
                  {request.status === 'Pending' && (
                    <>
                      {showActions && (
                        <>
                          <button
                            onClick={() => handleApprove(request._id)}
                            className="btn-approve"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(request._id)}
                            className="btn-reject"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {!showActions && (
                        <button
                          onClick={() => handleCancel(request._id)}
                          className="btn-cancel"
                        >
                          Cancel
                        </button>
                      )}
                    </>
                  )}
                  {request.status === 'Approved' && request.approvedBy && (
                    <div className="approved-info">
                      Approved by {request.approvedBy.name}
                      {request.approvedAt && (
                        <div className="approved-date">
                          {new Date(request.approvedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page === 1}
          >
            Previous
          </button>
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page === pagination.totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
```

---

### **Step 5: Create Usage Summary Component**

```typescript
// components/OptionalHolidayUsageSummary.tsx

import React, { useState, useEffect } from 'react';
import { optionalHolidayService, UsageSummary } from '../services/optionalHoliday.service';

interface OptionalHolidayUsageSummaryProps {
  userId: string;
  year?: number;
}

export const OptionalHolidayUsageSummary: React.FC<OptionalHolidayUsageSummaryProps> = ({
  userId,
  year = new Date().getFullYear(),
}) => {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSummary();
  }, [userId, year]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const response = await optionalHolidayService.getUsageSummary(userId, year);
      if (response.success && response.data) {
        setSummary(response.data);
      }
    } catch (error) {
      console.error('Error loading summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!summary) {
    return <div>No data available</div>;
  }

  const usagePercentage = (summary.used / summary.total) * 100;

  return (
    <div className="optional-holiday-summary">
      <h4>Optional Holiday Usage - {year}</h4>
      
      <div className="summary-stats">
        <div className="stat-card">
          <div className="stat-label">Total Allowed</div>
          <div className="stat-value">{summary.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Used</div>
          <div className="stat-value used">{summary.used}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Remaining</div>
          <div className="stat-value remaining">{summary.remaining}</div>
        </div>
      </div>

      <div className="usage-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${usagePercentage}%` }}
          />
        </div>
        <div className="progress-text">
          {summary.used} of {summary.total} used ({usagePercentage.toFixed(0)}%)
        </div>
      </div>

      {summary.requests.length > 0 && (
        <div className="requests-list">
          <h5>Your Requests</h5>
          <ul>
            {summary.requests.map((request) => (
              <li key={request._id}>
                <span className="holiday-name">{request.holidayName}</span>
                <span className="holiday-date">
                  {new Date(request.holidayDate).toLocaleDateString()}
                </span>
                <span className={`status-badge ${request.status.toLowerCase()}`}>
                  {request.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
```

---

### **Step 6: Integration with Holiday Calendar**

Update your holiday calendar component to show optional holidays with request status:

```typescript
// components/HolidayCalendar.tsx (example integration)

import React, { useState, useEffect } from 'react';
import { optionalHolidayService } from '../services/optionalHoliday.service';

// In your holiday calendar component
const [approvedOptionalHolidays, setApprovedOptionalHolidays] = useState<string[]>([]);

useEffect(() => {
  loadApprovedOptionalHolidays();
}, [userId, year]);

const loadApprovedOptionalHolidays = async () => {
  try {
    const response = await optionalHolidayService.getUsageSummary(userId, year);
    if (response.success && response.data) {
      // Get dates of approved optional holidays
      const approvedDates = response.data.requests
        .filter(r => r.status === 'Approved')
        .map(r => new Date(r.holidayDate).toISOString().split('T')[0]);
      setApprovedOptionalHolidays(approvedDates);
    }
  } catch (error) {
    console.error('Error loading approved optional holidays:', error);
  }
};

// When rendering holidays
const renderHoliday = (holiday: any) => {
  const holidayDate = new Date(holiday.date).toISOString().split('T')[0];
  const isApprovedOptional = holiday.type === 'optional' && 
                             approvedOptionalHolidays.includes(holidayDate);
  const isPendingOptional = holiday.type === 'optional' && 
                           !approvedOptionalHolidays.includes(holidayDate);

  return (
    <div 
      className={`holiday-item ${holiday.type} ${isApprovedOptional ? 'approved-optional' : ''}`}
    >
      <span className="holiday-name">{holiday.name}</span>
      <span className="holiday-date">{new Date(holiday.date).toLocaleDateString()}</span>
      {holiday.type === 'optional' && (
        <span className="optional-badge">
          {isApprovedOptional ? '✓ Approved' : 'Optional (Not Requested)'}
        </span>
      )}
      {holiday.type === 'optional' && !isApprovedOptional && (
        <button onClick={() => openRequestModal(holiday)}>
          Request
        </button>
      )}
    </div>
  );
};
```

---

## 🎯 Key Implementation Points

### **1. Annual Limit Validation**

Always check the limit before allowing request creation:

```typescript
// Before showing request form
const limitResponse = await optionalHolidayService.checkAnnualLimit(userId, year);
if (limitResponse.success && limitResponse.data) {
  if (!limitResponse.data.canRequest) {
    // Show message: "You have reached the annual limit"
    // Disable request button
  }
}
```

### **2. Calendar Validation**

Only show optional holidays from the user's calendar:

```typescript
// Fetch optional holidays from calendar
const optionalHolidays = await getOptionalHolidays(userId, year);

// Filter out past dates
const availableHolidays = optionalHolidays.filter(h => {
  const holidayDate = new Date(h.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return holidayDate >= today;
});
```

### **3. Status Management**

Handle different statuses appropriately:

- **Pending**: Show "Cancel" button for employee, "Approve/Reject" for manager
- **Approved**: Show as holiday in calendar, count in payroll
- **Rejected**: Show rejection reason, allow re-application
- **Cancelled**: Don't count towards limit

### **4. Error Handling**

Handle common errors:

```typescript
// Annual limit reached
if (error.message.includes('Annual limit reached')) {
  // Show limit reached message
  // Disable request form
}

// Date not optional holiday
if (error.message.includes('not an optional holiday')) {
  // Show error: "Selected date is not an optional holiday"
}

// Duplicate request
if (error.message.includes('already applied')) {
  // Show error: "You have already applied for this optional holiday"
}
```

---

## 📱 UI/UX Recommendations

### **1. Request Form**
- Show annual limit badge (e.g., "1/2 used")
- Disable form if limit reached
- Show only future optional holidays
- Display holiday name and date clearly
- Optional reason field

### **2. Request List**
- Filter by status (Pending, Approved, Rejected)
- Show employee name (for admin/manager)
- Show approval status and approver
- Color-coded status badges
- Pagination for large lists

### **3. Usage Summary**
- Progress bar showing usage
- List of all requests with status
- Clear indication of remaining balance
- Year selector for historical data

### **4. Holiday Calendar Integration**
- Mark optional holidays differently
- Show "Request" button on optional holidays
- Show "✓ Approved" badge on approved optional holidays
- Different styling for approved vs unapproved optional holidays

---

## 🔄 State Management (Redux/Zustand Example)

```typescript
// store/optionalHolidaySlice.ts (Redux Toolkit example)

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { optionalHolidayService } from '../services/optionalHoliday.service';

interface OptionalHolidayState {
  requests: OptionalHolidayRequest[];
  summary: UsageSummary | null;
  limit: AnnualLimit | null;
  loading: boolean;
  error: string | null;
}

const initialState: OptionalHolidayState = {
  requests: [],
  summary: null,
  limit: null,
  loading: false,
  error: null,
};

export const fetchOptionalHolidayRequests = createAsyncThunk(
  'optionalHoliday/fetchRequests',
  async (params?: { userId?: string; year?: number; status?: string }) => {
    const response = await optionalHolidayService.getRequests(params);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error?.message || 'Failed to fetch requests');
  }
);

export const fetchUsageSummary = createAsyncThunk(
  'optionalHoliday/fetchSummary',
  async ({ userId, year }: { userId: string; year?: number }) => {
    const response = await optionalHolidayService.getUsageSummary(userId, year);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error?.message || 'Failed to fetch summary');
  }
);

export const checkAnnualLimit = createAsyncThunk(
  'optionalHoliday/checkLimit',
  async ({ userId, year }: { userId: string; year?: number }) => {
    const response = await optionalHolidayService.checkAnnualLimit(userId, year);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error?.message || 'Failed to check limit');
  }
);

const optionalHolidaySlice = createSlice({
  name: 'optionalHoliday',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOptionalHolidayRequests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOptionalHolidayRequests.fulfilled, (state, action) => {
        state.loading = false;
        state.requests = action.payload.requests;
      })
      .addCase(fetchOptionalHolidayRequests.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch requests';
      })
      .addCase(fetchUsageSummary.fulfilled, (state, action) => {
        state.summary = action.payload;
      })
      .addCase(checkAnnualLimit.fulfilled, (state, action) => {
        state.limit = action.payload;
      });
  },
});

export const { clearError } = optionalHolidaySlice.actions;
export default optionalHolidaySlice.reducer;
```

---

## 🎨 CSS Styling Recommendations

```css
/* Optional Holiday Components Styling */

.optional-holiday-form {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.limit-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.limit-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.limit-badge.available {
  background-color: #e3f2fd;
  color: #1976d2;
}

.limit-badge.limit-reached {
  background-color: #ffebee;
  color: #c62828;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.status-badge.pending {
  background-color: #fff3cd;
  color: #856404;
}

.status-badge.approved {
  background-color: #d4edda;
  color: #155724;
}

.status-badge.rejected {
  background-color: #f8d7da;
  color: #721c24;
}

.status-badge.cancelled {
  background-color: #e2e3e5;
  color: #383d41;
}

.optional-holiday-summary {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 20px;
}

.stat-card {
  text-align: center;
  padding: 15px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.stat-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #333;
}

.stat-value.used {
  color: #f59e0b;
}

.stat-value.remaining {
  color: #10b981;
}

.usage-progress {
  margin-top: 20px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: #3b82f6;
  transition: width 0.3s ease;
}

.progress-text {
  margin-top: 8px;
  font-size: 14px;
  color: #666;
  text-align: center;
}

.limit-warning {
  margin-top: 15px;
  padding: 12px;
  background-color: #fff3cd;
  border-left: 4px solid #ffc107;
  border-radius: 4px;
}

.limit-warning p {
  margin: 0;
  color: #856404;
}
```

---

## ✅ Testing Checklist

### **Employee View:**
- [ ] Can view optional holidays from calendar
- [ ] Can create request for optional holiday
- [ ] Annual limit validation works (max 2)
- [ ] Cannot request past optional holidays
- [ ] Cannot request same optional holiday twice
- [ ] Can cancel pending requests
- [ ] Can view usage summary
- [ ] Can see approved optional holidays in calendar

### **Manager/Admin View:**
- [ ] Can view all employee requests
- [ ] Can filter by status, user, year
- [ ] Can approve requests (respects 2/year limit)
- [ ] Can reject requests with remarks
- [ ] Can see approval history
- [ ] Error handling for limit exceeded

### **Integration:**
- [ ] Approved optional holidays show in calendar
- [ ] Approved optional holidays count in payroll
- [ ] Unapproved optional holidays are working days
- [ ] Leave on unapproved optional holiday deducts leave balance

---

## 📝 Notes

1. **Annual Limit**: Maximum 2 approved optional holidays per year per employee
2. **Calendar Validation**: Date must be an optional holiday in employee's calendar
3. **Payroll Impact**: Only approved optional holidays count as holidays in payroll
4. **Working Days**: Unapproved optional holidays are treated as working days
5. **Leave Deduction**: Leave applied on unapproved optional holiday deducts from selected leave type (annual, sick, etc.)

---

## 🚀 Quick Start

1. **Create API Service**: Copy the `OptionalHolidayService` class
2. **Create Components**: Implement form, list, and summary components
3. **Integrate with Calendar**: Show optional holidays with request status
4. **Add Routes**: Create routes for optional holiday management
5. **Test**: Verify all scenarios work correctly

---

**Last Updated:** November 28, 2025

