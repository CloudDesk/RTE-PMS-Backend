# Permission & WFH Frontend Implementation Guide

## 🚨 IMPORTANT: Recent Changes

### Role-Based Filtering is Now Automatic
**The backend now automatically filters requests based on user role. You should NOT pass `userId` in most cases:**

- ✅ **Admin/SuperAdmin**: Don't pass `userId` - backend returns ALL requests automatically
- ✅ **Manager**: Don't pass `userId` - backend returns requests assigned to them (`appliedTo._id` matches manager's ID)
- ✅ **Regular User**: Don't pass `userId` - backend returns only their own requests
- ✅ **Admin filtering specific user**: Pass `userId` parameter only when admin wants to filter for a specific user

### Response Format Updated
All GET endpoints now return a `meta` object with pagination info:
```typescript
{
  success: boolean;
  data: Permission[] | WFH[];
  total: number;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**See [Breaking Changes](#-breaking-changes-from-previous-implementation) section below for migration guide.**

---

## Overview

This guide explains how to implement the Permission and Work From Home (WFH) features in the frontend. Both systems follow similar patterns to the existing Leave system but with key differences:

- **Permission**: Hours-based, monthly tracking (e.g., 2 hours per month)
- **WFH**: Days-based, yearly tracking, can apply even if balance is 0

---

## Table of Contents

1. [API Endpoints](#api-endpoints)
2. [Permission Implementation](#permission-implementation)
3. [WFH Implementation](#wfh-implementation)
4. [Component Examples](#component-examples)
5. [Service Layer](#service-layer)
6. [State Management](#state-management)

---

## API Endpoints

### Permission Endpoints

#### Apply for Permission
```typescript
POST /permissions
Body: {
  permissionDate: string; // YYYY-MM-DD
  hours: number;         // 0.5, 1, 2, etc. (min: 0.5, max: 24)
  reason: string;
  remarks?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
}

Response: {
  success: boolean;
  data: {
    _id: string;
    userId: string;
    permissionDate: string;
    hours: number;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
    reason: string;
    remarks?: string;
    createdAt: string;
    updatedAt: string;
  };
}
```

#### Get Permission Requests
```typescript
GET /permissions?userId={userId}&status={status}&startDate={date}&endDate={date}&page={page}&limit={limit}

**IMPORTANT: Role-Based Filtering (Automatic)**
- **Admin/SuperAdmin**: Don't pass `userId` - backend returns ALL requests automatically
- **Manager**: Don't pass `userId` - backend returns requests where `appliedTo._id` matches manager's ID
- **Regular User**: Don't pass `userId` - backend returns only their own requests
- **To filter specific user (Admin only)**: Pass `userId` parameter

Response: {
  success: boolean;
  data: Permission[];
  total: number;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

#### Get Permission by ID
```typescript
GET /permissions/:id

Response: {
  success: boolean;
  data: Permission;
}
```

#### Approve/Reject Permission
```typescript
PUT /permissions/:id/status
Body: {
  status: 'Approved' | 'Rejected' | 'Cancelled';
  remarks?: string;
}

Response: {
  success: boolean;
  data: Permission;
}
```

#### Cancel Permission
```typescript
PUT /permissions/:id/cancel

Response: {
  success: boolean;
  message: string;
}
```

#### Get Permission Balance
```typescript
GET /permissions/balance/:year/:month

Response: {
  success: boolean;
  data: {
    alloted: number;
    availed: number;
    remaining: number;
  };
}
```

#### Permission Summary Endpoints
```typescript
// Get permission summary for a user
GET /permission-summary/summary/:userId?year={year}&month={month}

// Get permission balance
GET /permission-summary/balance/:userId?year={year}&month={month}

// Update permission allotment (Admin)
POST /permission-summary/allotments
Body: {
  userId: string;
  year: number;
  month: number; // 1-12
  alloted: number; // Hours per month
}

// Get multiple users summaries
GET /permission-summary/summaries?userIds={id1,id2}&year={year}&month={month}
```

---

### WFH Endpoints

#### Apply for WFH
```typescript
POST /wfh
Body: {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  remarks?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
}

Response: {
  success: boolean;
  data: {
    _id: string;
    userId: string;
    startDate: string;
    endDate: string;
    noOfDays: number;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
    reason: string;
    remarks?: string;
    createdAt: string;
    updatedAt: string;
  };
}
```

#### Get WFH Requests
```typescript
GET /wfh?userId={userId}&status={status}&startDate={date}&endDate={date}&page={page}&limit={limit}

**IMPORTANT: Role-Based Filtering (Automatic)**
- **Admin/SuperAdmin**: Don't pass `userId` - backend returns ALL requests automatically
- **Manager**: Don't pass `userId` - backend returns requests where `appliedTo._id` matches manager's ID
- **Regular User**: Don't pass `userId` - backend returns only their own requests
- **To filter specific user (Admin only)**: Pass `userId` parameter

Response: {
  success: boolean;
  data: WFH[];
  total: number;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

#### Get WFH by ID
```typescript
GET /wfh/:id

Response: {
  success: boolean;
  data: WFH;
}
```

#### Approve/Reject WFH
```typescript
PUT /wfh/:id/status
Body: {
  status: 'Approved' | 'Rejected' | 'Cancelled';
  remarks?: string;
}

Response: {
  success: boolean;
  data: WFH;
}
```

#### Cancel WFH
```typescript
PUT /wfh/:id/cancel

Response: {
  success: boolean;
  message: string;
}
```

#### Get WFH Balance
```typescript
GET /wfh/balance/:year

Response: {
  success: boolean;
  data: {
    alloted: number;
    availed: number;
    remaining: number;
  };
}
```

#### WFH Summary Endpoints
```typescript
// Get WFH summary for a user
GET /wfh-summary/summary/:userId?year={year}

// Get WFH balance
GET /wfh-summary/balance/:userId?year={year}

// Update WFH allotment (Admin)
POST /wfh-summary/allotments
Body: {
  userId: string;
  year: number;
  alloted: number; // Days per year
}

// Get multiple users summaries
GET /wfh-summary/summaries?userIds={id1,id2}&year={year}
```

---

## Service Layer

### TypeScript Service Implementation

```typescript
// services/permission.service.ts
import { fetchApi, ApiResponse } from './api';

export interface Permission {
  _id: string;
  userId: string;
  user?: {
    name: string;
    email: string;
  };
  permissionDate: string;
  hours: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  reason: string;
  remarks?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
  approvedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionBalance {
  alloted: number;
  availed: number;
  remaining: number;
}

export interface PermissionCreateRequest {
  permissionDate: string;
  hours: number;
  reason: string;
  remarks?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
}

export interface PermissionQuery {
  userId?: string;
  status?: 'Pending' | 'Approved' | 'Rejected';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const permissionApi = {
  /**
   * Apply for permission
   */
  apply: (data: PermissionCreateRequest): Promise<ApiResponse<Permission>> => {
    return fetchApi('/permissions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get permission requests
   * 
   * IMPORTANT: Role-based filtering is automatic on the backend:
   * - Admin/SuperAdmin: Sees all requests (don't pass userId)
   * - Manager: Sees requests assigned to them (don't pass userId)
   * - Regular User: Sees only their own (don't pass userId)
   * - To filter specific user (Admin only): Pass userId in query
   */
  getRequests: (query?: PermissionQuery): Promise<ApiResponse<{ data: Permission[]; total: number; meta: { page: number; limit: number; total: number; totalPages: number } }>> => {
    const params = new URLSearchParams();
    // Only pass userId if explicitly filtering for a specific user (Admin use case)
    if (query?.userId) params.append('userId', query.userId);
    if (query?.status) params.append('status', query.status);
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.page) params.append('page', query.page.toString());
    if (query?.limit) params.append('limit', query.limit.toString());

    return fetchApi(`/permissions?${params.toString()}`);
  },

  /**
   * Get permission by ID
   */
  getById: (id: string): Promise<ApiResponse<Permission>> => {
    return fetchApi(`/permissions/${id}`);
  },

  /**
   * Approve/Reject permission
   */
  updateStatus: (
    id: string,
    status: 'Approved' | 'Rejected' | 'Cancelled',
    remarks?: string
  ): Promise<ApiResponse<Permission>> => {
    return fetchApi(`/permissions/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, remarks }),
    });
  },

  /**
   * Cancel permission
   */
  cancel: (id: string): Promise<ApiResponse<{ message: string }>> => {
    return fetchApi(`/permissions/${id}/cancel`, {
      method: 'PUT',
    });
  },

  /**
   * Get permission balance for a month
   */
  getBalance: (year: number, month: number): Promise<ApiResponse<PermissionBalance>> => {
    return fetchApi(`/permissions/balance/${year}/${month}`);
  },

  /**
   * Get permission summary
   */
  getSummary: (userId: string, year: number, month: number): Promise<ApiResponse<any>> => {
    return fetchApi(`/permission-summary/summary/${userId}?year=${year}&month=${month}`);
  },

  /**
   * Update permission allotment (Admin)
   */
  updateAllotment: (
    userId: string,
    year: number,
    month: number,
    alloted: number
  ): Promise<ApiResponse<any>> => {
    return fetchApi('/permission-summary/allotments', {
      method: 'POST',
      body: JSON.stringify({ userId, year, month, alloted }),
    });
  },
};
```

```typescript
// services/wfh.service.ts
import { fetchApi, ApiResponse } from './api';

export interface WFH {
  _id: string;
  userId: string;
  user?: {
    name: string;
    email: string;
  };
  startDate: string;
  endDate: string;
  noOfDays: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  reason: string;
  remarks?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
  approvedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WFHBalance {
  alloted: number;
  availed: number;
  remaining: number;
}

export interface WFHCreateRequest {
  startDate: string;
  endDate: string;
  reason: string;
  remarks?: string;
  appliedTo?: {
    _id: string;
    name: string;
  };
}

export interface WFHQuery {
  userId?: string;
  status?: 'Pending' | 'Approved' | 'Rejected';
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const wfhApi = {
  /**
   * Apply for WFH
   */
  apply: (data: WFHCreateRequest): Promise<ApiResponse<WFH>> => {
    return fetchApi('/wfh', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get WFH requests
   * 
   * IMPORTANT: Role-based filtering is automatic on the backend:
   * - Admin/SuperAdmin: Sees all requests (don't pass userId)
   * - Manager: Sees requests assigned to them (don't pass userId)
   * - Regular User: Sees only their own (don't pass userId)
   * - To filter specific user (Admin only): Pass userId in query
   */
  getRequests: (query?: WFHQuery): Promise<ApiResponse<{ data: WFH[]; total: number; meta: { page: number; limit: number; total: number; totalPages: number } }>> => {
    const params = new URLSearchParams();
    // Only pass userId if explicitly filtering for a specific user (Admin use case)
    if (query?.userId) params.append('userId', query.userId);
    if (query?.status) params.append('status', query.status);
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.page) params.append('page', query.page.toString());
    if (query?.limit) params.append('limit', query.limit.toString());

    return fetchApi(`/wfh?${params.toString()}`);
  },

  /**
   * Get WFH by ID
   */
  getById: (id: string): Promise<ApiResponse<WFH>> => {
    return fetchApi(`/wfh/${id}`);
  },

  /**
   * Approve/Reject WFH
   */
  updateStatus: (
    id: string,
    status: 'Approved' | 'Rejected' | 'Cancelled',
    remarks?: string
  ): Promise<ApiResponse<WFH>> => {
    return fetchApi(`/wfh/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, remarks }),
    });
  },

  /**
   * Cancel WFH
   */
  cancel: (id: string): Promise<ApiResponse<{ message: string }>> => {
    return fetchApi(`/wfh/${id}/cancel`, {
      method: 'PUT',
    });
  },

  /**
   * Get WFH balance for a year
   */
  getBalance: (year: number): Promise<ApiResponse<WFHBalance>> => {
    return fetchApi(`/wfh/balance/${year}`);
  },

  /**
   * Get WFH summary
   */
  getSummary: (userId: string, year: number): Promise<ApiResponse<any>> => {
    return fetchApi(`/wfh-summary/summary/${userId}?year=${year}`);
  },

  /**
   * Update WFH allotment (Admin)
   */
  updateAllotment: (
    userId: string,
    year: number,
    alloted: number
  ): Promise<ApiResponse<any>> => {
    return fetchApi('/wfh-summary/allotments', {
      method: 'POST',
      body: JSON.stringify({ userId, year, alloted }),
    });
  },
};
```

---

## Component Examples

### Permission Apply Component

```typescript
// components/PermissionApplyForm.tsx
import { useState } from 'react';
import { permissionApi } from '../services/permission.service';
import { useAuth } from '../hooks/useAuth';

export const PermissionApplyForm = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    permissionDate: '',
    hours: 0.5,
    reason: '',
    remarks: '',
  });
  const [balance, setBalance] = useState<{ alloted: number; availed: number; remaining: number } | null>(null);

  // Load balance when date changes
  const handleDateChange = async (date: string) => {
    if (!date) return;
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1;

    try {
      const response = await permissionApi.getBalance(year, month);
      if (response.success) {
        setBalance(response.data);
      }
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await permissionApi.apply({
        permissionDate: formData.permissionDate,
        hours: formData.hours,
        reason: formData.reason,
        remarks: formData.remarks,
      });

      if (response.success) {
        alert('Permission request submitted successfully!');
        // Reset form
        setFormData({
          permissionDate: '',
          hours: 0.5,
          reason: '',
          remarks: '',
        });
        setBalance(null);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to submit permission request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label>Date</label>
        <input
          type="date"
          value={formData.permissionDate}
          onChange={(e) => {
            setFormData({ ...formData, permissionDate: e.target.value });
            handleDateChange(e.target.value);
          }}
          required
        />
      </div>

      {balance && (
        <div className="bg-blue-50 p-3 rounded">
          <p>Available Balance: {balance.remaining.toFixed(1)} hours</p>
          <p>Allotted: {balance.alloted} hours | Used: {balance.availed} hours</p>
        </div>
      )}

      <div>
        <label>Hours</label>
        <input
          type="number"
          min="0.5"
          max="24"
          step="0.5"
          value={formData.hours}
          onChange={(e) => setFormData({ ...formData, hours: parseFloat(e.target.value) })}
          required
        />
        <small>Minimum 0.5 hours, Maximum 24 hours</small>
      </div>

      <div>
        <label>Reason *</label>
        <textarea
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          required
          rows={3}
        />
      </div>

      <div>
        <label>Remarks</label>
        <textarea
          value={formData.remarks}
          onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          rows={2}
        />
      </div>

      {balance && formData.hours > balance.remaining && (
        <div className="bg-red-50 p-3 rounded text-red-700">
          Warning: Requested hours ({formData.hours}) exceed available balance ({balance.remaining.toFixed(1)})
        </div>
      )}

      <button type="submit" disabled={loading || (balance && formData.hours > balance.remaining)}>
        {loading ? 'Submitting...' : 'Submit Permission Request'}
      </button>
    </form>
  );
};
```

### WFH Apply Component

```typescript
// components/WFHApplyForm.tsx
import { useState } from 'react';
import { wfhApi } from '../services/wfh.service';
import { useAuth } from '../hooks/useAuth';

export const WFHApplyForm = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    reason: '',
    remarks: '',
  });
  const [balance, setBalance] = useState<{ alloted: number; availed: number; remaining: number } | null>(null);

  // Load balance when year changes
  const loadBalance = async () => {
    if (!formData.startDate) return;
    const year = new Date(formData.startDate).getFullYear();

    try {
      const response = await wfhApi.getBalance(year);
      if (response.success) {
        setBalance(response.data);
      }
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await wfhApi.apply({
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        remarks: formData.remarks,
      });

      if (response.success) {
        alert('WFH request submitted successfully!');
        // Reset form
        setFormData({
          startDate: '',
          endDate: '',
          reason: '',
          remarks: '',
        });
        setBalance(null);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to submit WFH request');
    } finally {
      setLoading(false);
    }
  };

  // Calculate days
  const calculateDays = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label>Start Date</label>
        <input
          type="date"
          value={formData.startDate}
          onChange={(e) => {
            setFormData({ ...formData, startDate: e.target.value });
            loadBalance();
          }}
          required
        />
      </div>

      <div>
        <label>End Date</label>
        <input
          type="date"
          value={formData.endDate}
          min={formData.startDate}
          onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
          required
        />
      </div>

      {formData.startDate && formData.endDate && (
        <div className="bg-gray-50 p-3 rounded">
          <p>Total Days: {calculateDays()}</p>
        </div>
      )}

      {balance && (
        <div className="bg-blue-50 p-3 rounded">
          <p>Allotted: {balance.alloted} days | Used: {balance.availed} days | Remaining: {balance.remaining} days</p>
          <p className="text-sm text-gray-600">Note: You can apply for WFH even if balance is 0</p>
        </div>
      )}

      <div>
        <label>Reason *</label>
        <textarea
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          required
          rows={3}
        />
      </div>

      <div>
        <label>Remarks</label>
        <textarea
          value={formData.remarks}
          onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          rows={2}
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Submit WFH Request'}
      </button>
    </form>
  );
};
```

### Permission List Component

```typescript
// components/PermissionList.tsx
import { useState, useEffect } from 'react';
import { permissionApi, Permission } from '../services/permission.service';
import { useAuth } from '../hooks/useAuth';

export const PermissionList = ({ userId }: { userId?: string }) => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    startDate: '',
    endDate: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  const loadPermissions = async () => {
    setLoading(true);
    try {
      // IMPORTANT: Role-based filtering is automatic on backend
      // - Admin: Sees all (don't pass userId unless filtering specific user)
      // - Manager: Sees requests assigned to them (don't pass userId)
      // - User: Sees only their own (don't pass userId)
      // Only pass userId if admin wants to filter for specific user
      const query: any = {
        ...filters,
        page: pagination.page,
        limit: pagination.limit,
      };
      
      // Only add userId if explicitly provided (for admin filtering specific user)
      if (userId && (user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'superadmin')) {
        query.userId = userId;
      }

      const response = await permissionApi.getRequests(query);

      if (response.success) {
        setPermissions(response.data.data);
        setPagination({ 
          ...pagination, 
          total: response.data.total,
          totalPages: response.data.meta?.totalPages || Math.ceil(response.data.total / pagination.limit)
        });
      }
    } catch (error) {
      console.error('Failed to load permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPermissions();
  }, [userId, filters, pagination.page]);

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this permission request?')) return;

    try {
      const response = await permissionApi.cancel(id);
      if (response.success) {
        loadPermissions();
      }
    } catch (error: any) {
      alert(error.message || 'Failed to cancel permission');
    }
  };

  return (
    <div>
      <div className="filters">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          placeholder="Start Date"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          placeholder="End Date"
        />
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Hours</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {permissions.map((permission) => (
              <tr key={permission._id}>
                <td>{new Date(permission.permissionDate).toLocaleDateString()}</td>
                <td>{permission.hours} hrs</td>
                <td>{permission.reason}</td>
                <td>
                  <span className={`status-${permission.status.toLowerCase()}`}>
                    {permission.status}
                  </span>
                </td>
                <td>
                  {permission.status === 'Pending' && (
                    <button onClick={() => handleCancel(permission._id)}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pagination">
        <button
          disabled={pagination.page === 1}
          onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
        >
          Previous
        </button>
        <span>
          Page {pagination.page} of {pagination.totalPages || Math.ceil(pagination.total / pagination.limit)}
        </span>
        <button
          disabled={pagination.page >= (pagination.totalPages || Math.ceil(pagination.total / pagination.limit))}
          onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
        >
          Next
        </button>
      </div>
    </div>
  );
};
```

### Manager Approval Component

```typescript
// components/PermissionApproval.tsx
import { useState } from 'react';
import { permissionApi, Permission } from '../services/permission.service';

export const PermissionApproval = ({ permission }: { permission: Permission }) => {
  const [status, setStatus] = useState<'Approved' | 'Rejected'>('Approved');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      const response = await permissionApi.updateStatus(permission._id, status, remarks);
      if (response.success) {
        alert(`Permission ${status.toLowerCase()} successfully!`);
        // Refresh list or navigate
      }
    } catch (error: any) {
      alert(error.message || 'Failed to update permission status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="approval-form">
      <h3>Permission Request Details</h3>
      <p><strong>Employee:</strong> {permission.user?.name}</p>
      <p><strong>Date:</strong> {new Date(permission.permissionDate).toLocaleDateString()}</p>
      <p><strong>Hours:</strong> {permission.hours}</p>
      <p><strong>Reason:</strong> {permission.reason}</p>

      <div>
        <label>Decision</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as 'Approved' | 'Rejected')}>
          <option value="Approved">Approve</option>
          <option value="Rejected">Reject</option>
        </select>
      </div>

      <div>
        <label>Remarks</label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
        />
      </div>

      <button onClick={handleApprove} disabled={loading}>
        {loading ? 'Processing...' : `${status} Permission`}
      </button>
    </div>
  );
};
```

---

## Admin Components

### Permission Allotment Management

```typescript
// components/admin/PermissionAllotmentForm.tsx
import { useState } from 'react';
import { permissionApi } from '../../services/permission.service';

export const PermissionAllotmentForm = ({ userId }: { userId: string }) => {
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    alloted: 2, // Default 2 hours per month
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await permissionApi.updateAllotment(
        userId,
        formData.year,
        formData.month,
        formData.alloted
      );

      if (response.success) {
        alert('Permission allotment updated successfully!');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to update allotment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label>Year</label>
        <input
          type="number"
          value={formData.year}
          onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
          required
        />
      </div>

      <div>
        <label>Month</label>
        <select
          value={formData.month}
          onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
          required
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <option key={month} value={month}>
              {new Date(2000, month - 1).toLocaleString('default', { month: 'long' })}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label>Hours Allotted</label>
        <input
          type="number"
          min="0"
          step="0.5"
          value={formData.alloted}
          onChange={(e) => setFormData({ ...formData, alloted: parseFloat(e.target.value) })}
          required
        />
        <small>e.g., 2 hours per month</small>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Updating...' : 'Update Allotment'}
      </button>
    </form>
  );
};
```

### WFH Allotment Management

```typescript
// components/admin/WFHAllotmentForm.tsx
import { useState } from 'react';
import { wfhApi } from '../../services/wfh.service';

export const WFHAllotmentForm = ({ userId }: { userId: string }) => {
  const [formData, setFormData] = useState({
    year: new Date().getFullYear(),
    alloted: 0,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await wfhApi.updateAllotment(
        userId,
        formData.year,
        formData.alloted
      );

      if (response.success) {
        alert('WFH allotment updated successfully!');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to update allotment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label>Year</label>
        <input
          type="number"
          value={formData.year}
          onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
          required
        />
      </div>

      <div>
        <label>Days Allotted</label>
        <input
          type="number"
          min="0"
          step="0.5"
          value={formData.alloted}
          onChange={(e) => setFormData({ ...formData, alloted: parseFloat(e.target.value) })}
          required
        />
        <small>Note: Users can apply for WFH even if balance is 0</small>
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Updating...' : 'Update Allotment'}
      </button>
    </form>
  );
};
```

---

## Key Differences from Leave System

### Permission System
1. **Hours-based** instead of days
2. **Monthly tracking** instead of yearly
3. **Balance check required** - cannot exceed monthly limit
4. **Hours can be split** - multiple applications per month (e.g., 0.5 + 1.5 = 2 hours)

### WFH System
1. **Days-based** like leave
2. **Yearly tracking** like leave
3. **No balance check required** - users can apply even if balance is 0
4. **Overlap prevention** - cannot have overlapping WFH requests

---

## State Management Example (Redux/Zustand)

```typescript
// stores/permissionStore.ts
import { create } from 'zustand';
import { permissionApi, Permission } from '../services/permission.service';

interface PermissionState {
  permissions: Permission[];
  balance: { alloted: number; availed: number; remaining: number } | null;
  loading: boolean;
  fetchPermissions: (query?: any) => Promise<void>;
  fetchBalance: (year: number, month: number) => Promise<void>;
  applyPermission: (data: any) => Promise<void>;
  cancelPermission: (id: string) => Promise<void>;
}

export const usePermissionStore = create<PermissionState>((set) => ({
  permissions: [],
  balance: null,
  loading: false,

  fetchPermissions: async (query) => {
    set({ loading: true });
    try {
      const response = await permissionApi.getRequests(query);
      if (response.success) {
        set({ permissions: response.data.data });
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
    } finally {
      set({ loading: false });
    }
  },

  fetchBalance: async (year, month) => {
    try {
      const response = await permissionApi.getBalance(year, month);
      if (response.success) {
        set({ balance: response.data });
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  },

  applyPermission: async (data) => {
    set({ loading: true });
    try {
      const response = await permissionApi.apply(data);
      if (response.success) {
        // Refresh list
        await usePermissionStore.getState().fetchPermissions();
      }
    } catch (error) {
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  cancelPermission: async (id) => {
    set({ loading: true });
    try {
      const response = await permissionApi.cancel(id);
      if (response.success) {
        // Refresh list
        await usePermissionStore.getState().fetchPermissions();
      }
    } catch (error) {
      throw error;
    } finally {
      set({ loading: false });
    }
  },
}));
```

---

## Error Handling

```typescript
// utils/errorHandler.ts
export const handleApiError = (error: any): string => {
  if (error.response?.data?.error?.message) {
    return error.response.data.error.message;
  }
  if (error.message) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

// Usage in components
try {
  await permissionApi.apply(data);
} catch (error) {
  const message = handleApiError(error);
  toast.error(message);
}
```

---

## Validation Rules

### Permission
- `hours`: Minimum 0.5, Maximum 24
- `permissionDate`: Required, must be valid date
- `reason`: Required, minimum length validation
- Balance check: Requested hours cannot exceed remaining balance

### WFH
- `startDate`: Required, must be valid date
- `endDate`: Required, must be after startDate
- `reason`: Required, minimum length validation
- Overlap check: Cannot overlap with existing WFH requests
- No balance check: Can apply even if balance is 0

---

## Testing Checklist

- [ ] Apply permission with valid data
- [ ] Apply permission exceeding balance (should fail)
- [ ] Apply permission with split hours (0.5 + 1.5 = 2)
- [ ] Cancel pending permission
- [ ] Manager approve/reject permission
- [ ] View permission balance
- [ ] Admin update permission allotment
- [ ] Apply WFH with valid date range
- [ ] Apply WFH with overlapping dates (should fail)
- [ ] Apply WFH with 0 balance (should succeed)
- [ ] Cancel pending WFH
- [ ] Manager approve/reject WFH
- [ ] View WFH balance
- [ ] Admin update WFH allotment

---

## Notes

1. **Permission hours** are tracked per month, so balance resets each month
2. **WFH balance** is tracked per year, similar to leave
3. **Email notifications** are sent automatically by the backend
4. **Manager lookup** is handled automatically if `appliedTo` is not provided
5. **Balance display** should show real-time data when user selects dates
6. **Role-based filtering** is automatic - don't pass `userId` unless admin filtering specific user
7. **Response includes `meta`** object with pagination details (`page`, `limit`, `total`, `totalPages`)

## 🔄 Breaking Changes from Previous Implementation

### 1. Role-Based Filtering is Now Automatic
- **Before**: Frontend had to pass `userId` to filter requests
- **After**: Backend automatically filters based on user role
- **Action Required**: Remove `userId` from query parameters unless admin filtering specific user

### 2. Response Format Updated
- **Before**: Response had `{ success, data, total }`
- **After**: Response now includes `meta` object: `{ success, data, total, meta: { page, limit, total, totalPages } }`
- **Action Required**: Update components to use `response.data.meta.totalPages` instead of calculating it

### 3. Manager View Behavior
- **Before**: Managers might not see requests assigned to them
- **After**: Managers automatically see requests where `appliedTo._id` matches their ID
- **Action Required**: No frontend changes needed, but verify manager views work correctly

---

## Support

For questions or issues, refer to:
- API Documentation: `/documentation` (Swagger UI)
- Backend Implementation: `src/services/permission.service.ts` and `src/services/wfh.service.ts`
- Models: `src/models/permission.model.ts` and `src/models/wfh.model.ts`

