# Leave Release & Carry-Forward List - Frontend Implementation Guide

## 📋 Overview

This document provides complete frontend implementation details for the Admin Leave Release and Carry-Forward list features. These endpoints allow admins to view all leave releases and carry-forwards across all employees with filtering and pagination.

---

## 🎯 Features

### 1. Leave Release List (Admin Only)
- View all leave releases across all employees
- Filter by employee, year, leave type, release type
- Pagination support
- Employee details included

### 2. Carry-Forward List (Admin Only)
- View all carry-forwards across all employees
- Filter by employee, from year, to year, leave type
- Pagination support
- Employee details included

---

## 🔌 API Endpoints

### 1. Get All Leave Releases

**Endpoint:** `GET /leave-summary/releases`

**Authentication:** Required (Admin only)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `employeeId` | string | No | Filter by specific employee ID |
| `year` | number | No | Filter by year (e.g., 2025) |
| `leaveType` | string | No | Filter by leave type: `annual`, `sick`, `compOff`, `lossOfPay`, `otherPaid`, `otherUnpaid` |
| `releaseType` | string | No | Filter by release type: `monthly`, `quarterly` |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 50, max: 100) |

**Response:**
```json
{
  "success": true,
  "data": {
    "releases": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
        "employeeId": {
          "_id": "65a1b2c3d4e5f6g7h8i9j0k2",
          "name": "John Doe",
          "email": "john.doe@example.com",
          "employeeCode": "EMP001",
          "country": "IN"
        },
        "releaseType": "quarterly",
        "period": {
          "quarter": 1,
          "year": 2025
        },
        "leaveType": "annual",
        "daysReleased": 4.5,
        "releasedAt": "2025-01-15T10:30:00.000Z",
        "releasedBy": {
          "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
          "name": "Admin User",
          "email": "admin@example.com"
        },
        "notes": "Q1 2025 quarterly release",
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 50,
    "totalPages": 3
  }
}
```

**Error Response (403 - Not Admin):**
```json
{
  "success": false,
  "error": {
    "message": "Access denied. Admin role required."
  }
}
```

---

### 2. Get All Carry-Forwards

**Endpoint:** `GET /leave-summary/carry-forwards`

**Authentication:** Required (Admin only)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `employeeId` | string | No | Filter by specific employee ID |
| `fromYear` | number | No | Filter by source year (e.g., 2024) |
| `toYear` | number | No | Filter by destination year (e.g., 2025) |
| `leaveType` | string | No | Filter by leave type: `annual`, `sick`, `compOff`, `lossOfPay`, `otherPaid`, `otherUnpaid` |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 50, max: 100) |

**Response:**
```json
{
  "success": true,
  "data": {
    "carryForwards": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k4",
        "employeeId": {
          "_id": "65a1b2c3d4e5f6g7h8i9j0k2",
          "name": "John Doe",
          "email": "john.doe@example.com",
          "employeeCode": "EMP001",
          "country": "IN"
        },
        "fromYear": 2024,
        "toYear": 2025,
        "leaveType": "annual",
        "balanceBefore": 15.5,
        "daysCarriedForward": 10,
        "daysForfeited": 5.5,
        "processedAt": "2024-12-31T23:59:59.000Z",
        "processedBy": {
          "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
          "name": "Admin User",
          "email": "admin@example.com"
        },
        "notes": "Year-end carry-forward",
        "createdAt": "2024-12-31T23:59:59.000Z",
        "updatedAt": "2024-12-31T23:59:59.000Z"
      }
    ],
    "total": 75,
    "page": 1,
    "limit": 50,
    "totalPages": 2
  }
}
```

**Error Response (403 - Not Admin):**
```json
{
  "success": false,
  "error": {
    "message": "Access denied. Admin role required."
  }
}
```

---

## 💻 Frontend Implementation Examples

### React/TypeScript Example

#### 1. API Service Functions

```typescript
// services/leaveReleaseService.ts
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5800';

export interface LeaveReleaseFilters {
  employeeId?: string;
  year?: number;
  leaveType?: 'annual' | 'sick' | 'compOff' | 'lossOfPay' | 'otherPaid' | 'otherUnpaid';
  releaseType?: 'monthly' | 'quarterly';
  page?: number;
  limit?: number;
}

export interface Employee {
  _id: string;
  name: string;
  email: string;
  employeeCode: string;
  country: string;
}

export interface LeaveRelease {
  _id: string;
  employeeId: Employee;
  releaseType: 'monthly' | 'quarterly';
  period: {
    month?: number;
    quarter?: number;
    year: number;
  };
  leaveType: string;
  daysReleased: number;
  releasedAt: string;
  releasedBy: {
    _id: string;
    name: string;
    email: string;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveReleaseResponse {
  success: boolean;
  data: {
    releases: LeaveRelease[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const getLeaveReleases = async (
  filters: LeaveReleaseFilters = {}
): Promise<LeaveReleaseResponse> => {
  const params = new URLSearchParams();
  
  if (filters.employeeId) params.append('employeeId', filters.employeeId);
  if (filters.year) params.append('year', filters.year.toString());
  if (filters.leaveType) params.append('leaveType', filters.leaveType);
  if (filters.releaseType) params.append('releaseType', filters.releaseType);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await axios.get<LeaveReleaseResponse>(
    `${API_BASE_URL}/leave-summary/releases?${params.toString()}`,
    {
      withCredentials: true, // For cookie-based auth
    }
  );

  return response.data;
};
```

```typescript
// services/leaveCarryForwardService.ts
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5800';

export interface CarryForwardFilters {
  employeeId?: string;
  fromYear?: number;
  toYear?: number;
  leaveType?: 'annual' | 'sick' | 'compOff' | 'lossOfPay' | 'otherPaid' | 'otherUnpaid';
  page?: number;
  limit?: number;
}

export interface Employee {
  _id: string;
  name: string;
  email: string;
  employeeCode: string;
  country: string;
}

export interface LeaveCarryForward {
  _id: string;
  employeeId: Employee;
  fromYear: number;
  toYear: number;
  leaveType: string;
  balanceBefore: number;
  daysCarriedForward: number;
  daysForfeited: number;
  processedAt: string;
  processedBy: {
    _id: string;
    name: string;
    email: string;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CarryForwardResponse {
  success: boolean;
  data: {
    carryForwards: LeaveCarryForward[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const getCarryForwards = async (
  filters: CarryForwardFilters = {}
): Promise<CarryForwardResponse> => {
  const params = new URLSearchParams();
  
  if (filters.employeeId) params.append('employeeId', filters.employeeId);
  if (filters.fromYear) params.append('fromYear', filters.fromYear.toString());
  if (filters.toYear) params.append('toYear', filters.toYear.toString());
  if (filters.leaveType) params.append('leaveType', filters.leaveType);
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());

  const response = await axios.get<CarryForwardResponse>(
    `${API_BASE_URL}/leave-summary/carry-forwards?${params.toString()}`,
    {
      withCredentials: true, // For cookie-based auth
    }
  );

  return response.data;
};
```

#### 2. React Component - Leave Release List

```typescript
// components/LeaveReleaseList.tsx
import React, { useState, useEffect } from 'react';
import { getLeaveReleases, LeaveReleaseFilters, LeaveRelease } from '../services/leaveReleaseService';
import { format } from 'date-fns';

const LeaveReleaseList: React.FC = () => {
  const [releases, setReleases] = useState<LeaveRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LeaveReleaseFilters>({
    page: 1,
    limit: 50,
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  });

  const fetchReleases = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getLeaveReleases(filters);
      if (response.success) {
        setReleases(response.data.releases);
        setPagination({
          total: response.data.total,
          page: response.data.page,
          limit: response.data.limit,
          totalPages: response.data.totalPages,
        });
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('Access denied. Admin role required.');
      } else {
        setError(err.response?.data?.error?.message || 'Failed to fetch leave releases');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReleases();
  }, [filters]);

  const handleFilterChange = (key: keyof LeaveReleaseFilters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page on filter change
    }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const formatPeriod = (period: LeaveRelease['period'], releaseType: string) => {
    if (releaseType === 'monthly' && period.month) {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return `${monthNames[period.month - 1]} ${period.year}`;
    } else if (releaseType === 'quarterly' && period.quarter) {
      return `Q${period.quarter} ${period.year}`;
    }
    return `${period.year}`;
  };

  return (
    <div className="leave-release-list">
      <h2>Leave Release List</h2>

      {/* Filters */}
      <div className="filters" style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Employee ID"
          value={filters.employeeId || ''}
          onChange={(e) => handleFilterChange('employeeId', e.target.value || undefined)}
        />
        <input
          type="number"
          placeholder="Year"
          value={filters.year || ''}
          onChange={(e) => handleFilterChange('year', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <select
          value={filters.leaveType || ''}
          onChange={(e) => handleFilterChange('leaveType', e.target.value || undefined)}
        >
          <option value="">All Leave Types</option>
          <option value="annual">Annual</option>
          <option value="sick">Sick</option>
          <option value="compOff">Comp Off</option>
          <option value="lossOfPay">Loss of Pay</option>
          <option value="otherPaid">Other Paid</option>
          <option value="otherUnpaid">Other Unpaid</option>
        </select>
        <select
          value={filters.releaseType || ''}
          onChange={(e) => handleFilterChange('releaseType', e.target.value || undefined)}
        >
          <option value="">All Release Types</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
        </select>
        <button onClick={() => setFilters({ page: 1, limit: 50 })}>Clear Filters</button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error" style={{ color: 'red', marginBottom: '10px' }}>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && <div>Loading...</div>}

      {/* Table */}
      {!loading && !error && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Employee Code</th>
                <th>Release Type</th>
                <th>Period</th>
                <th>Leave Type</th>
                <th>Days Released</th>
                <th>Released By</th>
                <th>Released At</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <tr key={release._id}>
                  <td>{release.employeeId.name}</td>
                  <td>{release.employeeId.employeeCode}</td>
                  <td>{release.releaseType}</td>
                  <td>{formatPeriod(release.period, release.releaseType)}</td>
                  <td>{release.leaveType}</td>
                  <td>{release.daysReleased}</td>
                  <td>{release.releasedBy.name}</td>
                  <td>{format(new Date(release.releasedAt), 'dd MMM yyyy HH:mm')}</td>
                  <td>{release.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="pagination" style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              disabled={pagination.page === 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages} (Total: {pagination.total})
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default LeaveReleaseList;
```

#### 3. React Component - Carry-Forward List

```typescript
// components/CarryForwardList.tsx
import React, { useState, useEffect } from 'react';
import { getCarryForwards, CarryForwardFilters, LeaveCarryForward } from '../services/leaveCarryForwardService';
import { format } from 'date-fns';

const CarryForwardList: React.FC = () => {
  const [carryForwards, setCarryForwards] = useState<LeaveCarryForward[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CarryForwardFilters>({
    page: 1,
    limit: 50,
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0,
  });

  const fetchCarryForwards = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getCarryForwards(filters);
      if (response.success) {
        setCarryForwards(response.data.carryForwards);
        setPagination({
          total: response.data.total,
          page: response.data.page,
          limit: response.data.limit,
          totalPages: response.data.totalPages,
        });
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError('Access denied. Admin role required.');
      } else {
        setError(err.response?.data?.error?.message || 'Failed to fetch carry-forwards');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCarryForwards();
  }, [filters]);

  const handleFilterChange = (key: keyof CarryForwardFilters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page on filter change
    }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  return (
    <div className="carry-forward-list">
      <h2>Leave Carry-Forward List</h2>

      {/* Filters */}
      <div className="filters" style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Employee ID"
          value={filters.employeeId || ''}
          onChange={(e) => handleFilterChange('employeeId', e.target.value || undefined)}
        />
        <input
          type="number"
          placeholder="From Year"
          value={filters.fromYear || ''}
          onChange={(e) => handleFilterChange('fromYear', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <input
          type="number"
          placeholder="To Year"
          value={filters.toYear || ''}
          onChange={(e) => handleFilterChange('toYear', e.target.value ? parseInt(e.target.value) : undefined)}
        />
        <select
          value={filters.leaveType || ''}
          onChange={(e) => handleFilterChange('leaveType', e.target.value || undefined)}
        >
          <option value="">All Leave Types</option>
          <option value="annual">Annual</option>
          <option value="sick">Sick</option>
          <option value="compOff">Comp Off</option>
          <option value="lossOfPay">Loss of Pay</option>
          <option value="otherPaid">Other Paid</option>
          <option value="otherUnpaid">Other Unpaid</option>
        </select>
        <button onClick={() => setFilters({ page: 1, limit: 50 })}>Clear Filters</button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error" style={{ color: 'red', marginBottom: '10px' }}>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && <div>Loading...</div>}

      {/* Table */}
      {!loading && !error && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Employee Code</th>
                <th>From Year</th>
                <th>To Year</th>
                <th>Leave Type</th>
                <th>Balance Before</th>
                <th>Days Carried Forward</th>
                <th>Days Forfeited</th>
                <th>Processed By</th>
                <th>Processed At</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {carryForwards.map((cf) => (
                <tr key={cf._id}>
                  <td>{cf.employeeId.name}</td>
                  <td>{cf.employeeId.employeeCode}</td>
                  <td>{cf.fromYear}</td>
                  <td>{cf.toYear}</td>
                  <td>{cf.leaveType}</td>
                  <td>{cf.balanceBefore}</td>
                  <td style={{ color: 'green', fontWeight: 'bold' }}>{cf.daysCarriedForward}</td>
                  <td style={{ color: 'red' }}>{cf.daysForfeited}</td>
                  <td>{cf.processedBy.name}</td>
                  <td>{format(new Date(cf.processedAt), 'dd MMM yyyy HH:mm')}</td>
                  <td>{cf.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="pagination" style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              disabled={pagination.page === 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages} (Total: {pagination.total})
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CarryForwardList;
```

---

## 🎨 UI/UX Recommendations

### 1. Table Design
- Use a responsive table with horizontal scroll on mobile
- Highlight important columns (days released, days carried forward)
- Use color coding:
  - Green for days carried forward
  - Red for days forfeited
  - Blue for employee information

### 2. Filter Section
- Use collapsible filter panel
- Show active filters as chips/badges
- Add "Clear All" button
- Auto-apply filters with debounce (optional)

### 3. Pagination
- Show page numbers (1, 2, 3, ...)
- Add "Go to page" input
- Display items per page selector
- Show total count

### 4. Loading States
- Skeleton loaders for table rows
- Spinner for initial load
- Disable filters during loading

### 5. Error Handling
- Show user-friendly error messages
- Retry button on error
- Handle 403 (not admin) gracefully
- Show empty state when no data

### 6. Export Functionality (Optional)
- Add "Export to CSV" button
- Export filtered results
- Include all columns in export

---

## 🔐 Authentication

Both endpoints require:
- Valid authentication cookie (`access_token`)
- Admin or SuperAdmin role

**Handle 403 errors:**
```typescript
if (error.response?.status === 403) {
  // Redirect to unauthorized page or show message
  // "You don't have permission to view this page"
}
```

---

## 📱 Responsive Design

### Mobile View
- Stack filters vertically
- Make table horizontally scrollable
- Use cards instead of table on very small screens
- Compact pagination controls

### Desktop View
- Side-by-side filters
- Full table with all columns
- Expanded pagination with page numbers

---

## 🧪 Testing Checklist

- [ ] Load list with default filters
- [ ] Apply each filter individually
- [ ] Apply multiple filters together
- [ ] Test pagination (next, previous, page numbers)
- [ ] Test with no results
- [ ] Test error handling (403, network error)
- [ ] Test loading states
- [ ] Test on mobile devices
- [ ] Test with large datasets (100+ records)

---

## 📝 Notes

1. **Employee Details**: Each record includes full employee information (name, email, employeeCode, country)

2. **Date Formatting**: Use `date-fns` or similar library for consistent date display

3. **Leave Type Labels**: Map enum values to user-friendly labels:
   - `annual` → "Annual Leave"
   - `sick` → "Sick Leave"
   - `compOff` → "Compensatory Off"
   - etc.

4. **Release Type Display**: 
   - Monthly: "January 2025"
   - Quarterly: "Q1 2025"

5. **Performance**: Consider implementing:
   - Virtual scrolling for large lists
   - Debounced filter inputs
   - Caching of filter results

---

## 🚀 Quick Start

1. Copy the service functions to your API service layer
2. Copy the React components to your components folder
3. Install dependencies: `axios`, `date-fns`
4. Update API_BASE_URL in service files
5. Add routes to your router
6. Test with admin user credentials

---

## 📞 Support

For issues or questions:
- Check API documentation at `/documentation`
- Verify admin role permissions
- Check network tab for API responses
- Review error messages in console

---

**Last Updated:** January 2025
**API Version:** 1.0.0

