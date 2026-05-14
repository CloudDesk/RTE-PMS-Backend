# Dashboard API Implementation Guide

## 📋 Overview

This guide provides comprehensive documentation for implementing and using the Dashboard API endpoints in the Tendly HRMS system. The dashboard provides role-based access to key metrics and analytics for both admin and manager users.

## 🚀 API Endpoints

### Base URL
```
/dashboard
```

### Available Endpoints

| Method | Endpoint | Description | Access Level |
|--------|----------|-------------|--------------|
| GET | `/dashboard/admin` | Admin dashboard metrics | Admin only |
| GET | `/dashboard/manager` | Manager dashboard data | Manager/Admin |
| GET | `/dashboard/` | Role-based dashboard | Manager/Admin |

### 🎯 Quick Start Examples

```bash
# Test with curl (replace YOUR_TOKEN with actual JWT token)

# Admin Dashboard
curl -X GET "http://localhost:5800/dashboard/admin" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Manager Dashboard  
curl -X GET "http://localhost:5800/dashboard/manager" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Role-based Dashboard
curl -X GET "http://localhost:5800/dashboard/" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

## 🔐 Authentication

All dashboard endpoints require authentication. Include the JWT token in the request:

```javascript
// Frontend example
const token = localStorage.getItem('access_token');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

---

## 📊 API Endpoints Details

### 1. Admin Dashboard (`GET /dashboard/admin`)

**Purpose:** Retrieve comprehensive organization-wide metrics for admin users.

**Access:** Admin role required

**Response Structure:**
```typescript
interface AdminDashboardResponse {
  success: boolean;
  data: {
    totalEmployees: number;
    pendingApprovals: {
      leaves: number;
      regularizations: number;
      overtime: number;
      total: number;
      byDepartment: Array<{
        departmentId: string;
        count: number;
      }>;
      byType: Array<{
        leaveType: string;
        count: number;
      }>;
    };
    leaveBalances: {
      annual: { alloted: number; availed: number; remaining: number };
      sick: { alloted: number; availed: number; remaining: number };
      compOff: { alloted: number; availed: number; remaining: number };
      lossOfPay: { alloted: number; availed: number; remaining: number };
      otherPaid: { alloted: number; availed: number; remaining: number };
      otherUnpaid: { alloted: number; availed: number; remaining: number };
    };
    payrollProcessed: {
      amount: number;
      count: number;
      totalCTC: number;
      totalDeductions: number;
      totalOvertimePay: number;
      totalBonus: number;
      totalReimbursement: number;
      byStatus: Array<{
        status: string;
        count: number;
        totalAmount: number;
      }>;
    };
    departmentWiseEmployees: Array<{
      departmentId: string;
      departmentName: string;
      count: number;
      employees: Array<{
        name: string;
        email: string;
        role: string;
      }>;
    }>;
    todayAttendance: {
      present: number;
      leave: number;
      absent: number;
      totalActive: number;
    };
    upcomingHolidays: Array<{
      date: string;
      name: string;
      description?: string;
    }>;
    resignationStatus: Array<{
      month: string;
      pending: number;
      approved: number;
    }>;
  };
}
```

**Example Request:**
```javascript
const response = await fetch('/dashboard/admin', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log('Admin Dashboard Data:', data);
```

---

### 2. Manager Dashboard (`GET /dashboard/manager`)

**Purpose:** Retrieve team-specific metrics for manager users.

**Access:** Manager or Admin role required

**Response Structure:**
```typescript
interface ManagerDashboardResponse {
  success: boolean;
  data: {
    teamOverview: {
      totalEmployees: number;
      employeesOnLeaveToday: number;
      pendingApprovals: number;
    };
    attendanceSummary: {
      present: number;
      onLeave: number;
      absent: number;
      unknown: number;
      total: number;
    };
    attendanceStatus: {
      onTime: number;
      late: number;
      earlyExit: number;
    };
    pendingApprovals: {
      leaves: number;
      regularizations: number;
      overtime: number;
      resignations: number;
    };
    employees: Array<{
      _id: string;
      name: string;
      email: string;
      role: string;
      departmentId: string;
      attendanceStatus: 'present' | 'onLeave' | 'absent' | 'unknown';
      attendanceType: 'onTime' | 'late' | 'earlyExit' | 'unknown';
      checkInTime: string | null;
      checkOutTime: string | null;
      isOnLeave: boolean;
      leaveType: string | null;
      shiftCode: string | null;
    }>;
  };
}
```

**Example Request:**
```javascript
const response = await fetch('/dashboard/manager', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log('Manager Dashboard Data:', data);
```

---

### 3. Role-Based Dashboard (`GET /dashboard/`)

**Purpose:** Automatically return appropriate dashboard based on user role.

**Access:** Manager or Admin role required

**Response Structure:**
```typescript
interface RoleBasedDashboardResponse {
  success: boolean;
  data: AdminDashboardResponse['data'] | ManagerDashboardResponse['data'];
  userRole: 'admin' | 'manager';
}
```

**Example Request:**
```javascript
const response = await fetch('/dashboard/', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log('Role-based Dashboard Data:', data);
```

---

## 🎯 Frontend Implementation Examples

### React/TypeScript Implementation

```typescript
// dashboardApi.ts
import { fetchApi } from './base';
import type { ApiResponse } from '$lib/types/api';

// Type definitions
interface AdminDashboardData {
  totalEmployees: number;
  pendingApprovals: {
    leaves: number;
    regularizations: number;
    overtime: number;
    total: number;
    byDepartment: Array<{
      departmentId: string;
      count: number;
    }>;
    byType: Array<{
      leaveType: string;
      count: number;
    }>;
  };
  leaveBalances: {
    annual: { alloted: number; availed: number; remaining: number };
    sick: { alloted: number; availed: number; remaining: number };
    compOff: { alloted: number; availed: number; remaining: number };
    lossOfPay: { alloted: number; availed: number; remaining: number };
    otherPaid: { alloted: number; availed: number; remaining: number };
    otherUnpaid: { alloted: number; availed: number; remaining: number };
  };
  payrollProcessed: {
    amount: number;
    count: number;
    totalCTC: number;
    totalDeductions: number;
    totalOvertimePay: number;
    totalBonus: number;
    totalReimbursement: number;
    byStatus: Array<{
      status: string;
      count: number;
      totalAmount: number;
    }>;
  };
  departmentWiseEmployees: Array<{
    departmentId: string;
    departmentName: string;
    count: number;
    employees: Array<{
      name: string;
      email: string;
      role: string;
    }>;
  }>;
  todayAttendance: {
    present: number;
    leave: number;
    absent: number;
    totalActive: number;
  };
  upcomingHolidays: Array<{
    date: string;
    name: string;
    description?: string;
  }>;
  resignationStatus: Array<{
    month: string;
    pending: number;
    approved: number;
  }>;
}

interface ManagerDashboardData {
  teamOverview: {
    totalEmployees: number;
    employeesOnLeaveToday: number;
    pendingApprovals: number;
  };
  attendanceSummary: {
    present: number;
    onLeave: number;
    absent: number;
    unknown: number;
    total: number;
  };
  attendanceStatus: {
    onTime: number;
    late: number;
    earlyExit: number;
  };
  pendingApprovals: {
    leaves: number;
    regularizations: number;
    overtime: number;
    resignations: number;
  };
  employees: Array<{
    _id: string;
    name: string;
    email: string;
    role: string;
    departmentId: string;
    attendanceStatus: 'present' | 'onLeave' | 'absent' | 'unknown';
    attendanceType: 'onTime' | 'late' | 'earlyExit' | 'unknown';
    checkInTime: string | null;
    checkOutTime: string | null;
    isOnLeave: boolean;
    leaveType: string | null;
    shiftCode: string | null;
  }>;
}

export const dashboardApi = {
  // Get admin dashboard metrics
  getAdminDashboard: async (): Promise<ApiResponse<AdminDashboardData>> => {
    console.log('📊 Fetching Admin Dashboard Data');
    
    return await fetchApi<AdminDashboardData>('/dashboard/admin', {
      method: 'GET'
    });
  },

  // Get manager dashboard data
  getManagerDashboard: async (): Promise<ApiResponse<ManagerDashboardData>> => {
    console.log('👥 Fetching Manager Dashboard Data');
    
    return await fetchApi<ManagerDashboardData>('/dashboard/manager', {
      method: 'GET'
    });
  },

  // Get role-based dashboard (automatically determines admin or manager)
  getDashboard: async (): Promise<ApiResponse<AdminDashboardData | ManagerDashboardData>> => {
    console.log('🎯 Fetching Role-based Dashboard Data');
    
    return await fetchApi<AdminDashboardData | ManagerDashboardData>('/dashboard/', {
      method: 'GET'
    });
  },

  // Utility function to check user role and fetch appropriate dashboard
  getDashboardByRole: async (userRole: 'admin' | 'manager'): Promise<ApiResponse<AdminDashboardData | ManagerDashboardData>> => {
    console.log(`🎭 Fetching Dashboard for Role: ${userRole}`);
    
    if (userRole === 'admin') {
      return await dashboardApi.getAdminDashboard();
    } else if (userRole === 'manager') {
      return await dashboardApi.getManagerDashboard();
    } else {
      throw new Error('Invalid user role. Must be admin or manager.');
    }
  }
};
```

### React Component Usage

```typescript
// DashboardComponent.tsx
import React, { useState, useEffect } from 'react';
import { dashboardApi } from './dashboardApi';

interface DashboardProps {
  userRole: 'admin' | 'manager';
}

export const DashboardComponent: React.FC<DashboardProps> = ({ userRole }) => {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await dashboardApi.getDashboardByRole(userRole);
        
        if (response.success) {
          setDashboardData(response.data);
          console.log('📊 Dashboard Data Loaded:', response.data);
        } else {
          setError('Failed to load dashboard data');
        }
      } catch (err: any) {
        console.error('❌ Dashboard Error:', err);
        setError(err.message || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [userRole]);

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!dashboardData) {
    return <div className="no-data">No dashboard data available</div>;
  }

  return (
    <div className="dashboard">
      {userRole === 'admin' ? (
        <AdminDashboardView data={dashboardData} />
      ) : (
        <ManagerDashboardView data={dashboardData} />
      )}
    </div>
  );
};

// Admin Dashboard View Component
const AdminDashboardView: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className="admin-dashboard">
      <h1>Admin Dashboard</h1>
      
      {/* Employee Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Employees</h3>
          <p className="stat-number">{data.totalEmployees}</p>
        </div>
        
        <div className="stat-card">
          <h3>Pending Approvals</h3>
          <p className="stat-number">{data.pendingApprovals.total}</p>
        </div>
        
        <div className="stat-card">
          <h3>Today's Attendance</h3>
          <p className="stat-number">{data.todayAttendance.present}</p>
        </div>
      </div>

      {/* Department Breakdown */}
      <div className="department-section">
        <h2>Department Overview</h2>
        <div className="department-list">
          {data.departmentWiseEmployees.map((dept: any) => (
            <div key={dept.departmentId} className="department-card">
              <h4>{dept.departmentName}</h4>
              <p>Employees: {dept.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Holidays */}
      <div className="holidays-section">
        <h2>Upcoming Holidays</h2>
        <div className="holidays-list">
          {data.upcomingHolidays.map((holiday: any, index: number) => (
            <div key={index} className="holiday-card">
              <h4>{holiday.name}</h4>
              <p>{new Date(holiday.date).toLocaleDateString()}</p>
              {holiday.description && <p>{holiday.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Manager Dashboard View Component
const ManagerDashboardView: React.FC<{ data: any }> = ({ data }) => {
  return (
    <div className="manager-dashboard">
      <h1>Manager Dashboard</h1>
      
      {/* Team Overview */}
      <div className="team-overview">
        <h2>Team Overview</h2>
        <div className="overview-stats">
          <div className="stat-card">
            <h3>Total Team Members</h3>
            <p className="stat-number">{data.teamOverview.totalEmployees}</p>
          </div>
          
          <div className="stat-card">
            <h3>On Leave Today</h3>
            <p className="stat-number">{data.teamOverview.employeesOnLeaveToday}</p>
          </div>
          
          <div className="stat-card">
            <h3>Pending Approvals</h3>
            <p className="stat-number">{data.teamOverview.pendingApprovals}</p>
          </div>
        </div>
      </div>

      {/* Attendance Summary */}
      <div className="attendance-summary">
        <h2>Today's Attendance</h2>
        <div className="attendance-stats">
          <div className="stat-card present">
            <h3>Present</h3>
            <p className="stat-number">{data.attendanceSummary.present}</p>
          </div>
          
          <div className="stat-card leave">
            <h3>On Leave</h3>
            <p className="stat-number">{data.attendanceSummary.onLeave}</p>
          </div>
          
          <div className="stat-card absent">
            <h3>Absent</h3>
            <p className="stat-number">{data.attendanceSummary.absent}</p>
          </div>
        </div>
      </div>

      {/* Team Members List */}
      <div className="team-members">
        <h2>Team Members</h2>
        <div className="members-list">
          {data.employees.map((employee: any) => (
            <div key={employee._id} className="member-card">
              <div className="member-info">
                <h4>{employee.name}</h4>
                <p>{employee.email}</p>
                <p>Role: {employee.role}</p>
              </div>
              
              <div className="member-status">
                <span className={`status ${employee.attendanceStatus}`}>
                  {employee.attendanceStatus}
                </span>
                
                {employee.checkInTime && (
                  <p>Check-in: {new Date(employee.checkInTime).toLocaleTimeString()}</p>
                )}
                
                {employee.checkOutTime && (
                  <p>Check-out: {new Date(employee.checkOutTime).toLocaleTimeString()}</p>
                )}
                
                {employee.isOnLeave && (
                  <p>Leave Type: {employee.leaveType}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

---

## 🔧 Backend Implementation

### ✅ Dashboard Routes Already Implemented

The dashboard routes are already created and registered:

**Files Created:**
- `src/routes/dashboard.routes.ts` - Dashboard API endpoints
- `src/services/dashboard.service.ts` - Business logic (already existed)
- `src/models/dashboard.model.ts` - Type definitions (already existed)

**Routes Registration:**
```typescript
// src/routes/index.ts
import { dashboardRoutes } from './dashboard.routes';

export async function routes(fastify: FastifyInstance) {
  // ... existing routes
  fastify.register(dashboardRoutes, { prefix: '/dashboard' });
  // ... rest of routes
}
```

### Dashboard Service Integration

The dashboard service is already integrated in the container:

```typescript
// src/container/index.ts
import { DashboardService } from '../services/dashboard.service';

export class Container {
  createScope(requestId: string, context: RequestContext): ServiceContainer {
    return {
      // ... other services
      dashboardService: new DashboardService(context),
      // ... rest of services
    };
  }
}
```

### 🚀 Server Status

**✅ Ready to Use!** The dashboard API is fully implemented and ready for testing:

```bash
# Start the server
npm run dev

# Server should start without errors and dashboard endpoints will be available at:
# - http://localhost:5800/dashboard/admin
# - http://localhost:5800/dashboard/manager  
# - http://localhost:5800/dashboard/
```

---

## 🚨 Error Handling

### Common Error Responses

```typescript
// 401 Unauthorized
{
  "success": false,
  "error": {
    "message": "Authentication failed"
  }
}

// 403 Forbidden
{
  "success": false,
  "error": {
    "message": "Access denied. Admin role required."
  }
}

// 500 Internal Server Error
{
  "success": false,
  "error": {
    "message": "Internal server error"
  }
}
```

### Frontend Error Handling

```typescript
const handleDashboardError = (error: any) => {
  console.error('Dashboard API Error:', error);
  
  if (error.status === 401) {
    // Redirect to login
    window.location.href = '/login';
  } else if (error.status === 403) {
    // Show access denied message
    alert('You do not have permission to access this dashboard');
  } else {
    // Show generic error message
    alert('Failed to load dashboard data. Please try again.');
  }
};
```

---

## 📈 Performance Considerations

### Caching Strategy

```typescript
// Frontend caching example
const dashboardCache = new Map();

export const dashboardApi = {
  getAdminDashboard: async (): Promise<ApiResponse<AdminDashboardData>> => {
    const cacheKey = 'admin-dashboard';
    const cachedData = dashboardCache.get(cacheKey);
    
    // Return cached data if less than 5 minutes old
    if (cachedData && Date.now() - cachedData.timestamp < 5 * 60 * 1000) {
      console.log('📦 Returning cached admin dashboard data');
      return cachedData.data;
    }
    
    const response = await fetchApi<AdminDashboardData>('/dashboard/admin', {
      method: 'GET'
    });
    
    // Cache the response
    dashboardCache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });
    
    return response;
  }
};
```

### Backend Optimization

The dashboard service uses MongoDB aggregation pipelines for optimal performance:

- **Parallel queries** using `Promise.all()`
- **Efficient aggregation** with proper indexing
- **Minimal data transfer** by selecting only required fields

---

## 🧪 Testing

### API Testing Examples

```typescript
// Jest test example
describe('Dashboard API', () => {
  test('should return admin dashboard data', async () => {
    const response = await request(app)
      .get('/dashboard/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('totalEmployees');
    expect(response.body.data).toHaveProperty('pendingApprovals');
  });
  
  test('should return manager dashboard data', async () => {
    const response = await request(app)
      .get('/dashboard/manager')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('teamOverview');
    expect(response.body.data).toHaveProperty('employees');
  });
  
  test('should deny access for non-admin users', async () => {
    const response = await request(app)
      .get('/dashboard/admin')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
    
    expect(response.body.success).toBe(false);
    expect(response.body.error.message).toContain('Admin role required');
  });
});
```

---

## 📚 Additional Resources

- **Swagger Documentation:** Available at `/documentation` when running the server
- **Dashboard Service:** `src/services/dashboard.service.ts`
- **Dashboard Model:** `src/models/dashboard.model.ts`
- **Authentication Middleware:** `src/middleware/auth.ts`

---

## 🔄 Updates and Maintenance

### Adding New Metrics

To add new metrics to the dashboard:

1. **Update the service** (`src/services/dashboard.service.ts`)
2. **Update the model** (`src/models/dashboard.model.ts`)
3. **Update the API types** in frontend
4. **Update the documentation**

### Performance Monitoring

Monitor dashboard performance by:

- **Response times** for each endpoint
- **Database query performance**
- **Memory usage** during aggregation
- **Cache hit rates** (if implementing caching)

---

## 📝 Implementation Checklist

### ✅ Backend (Completed)
- [x] Dashboard service created (`src/services/dashboard.service.ts`)
- [x] Dashboard model defined (`src/models/dashboard.model.ts`)
- [x] Dashboard routes implemented (`src/routes/dashboard.routes.ts`)
- [x] Routes registered in main router (`src/routes/index.ts`)
- [x] Service integrated in container (`src/container/index.ts`)
- [x] Authentication middleware applied
- [x] Role-based access control implemented
- [x] Error handling implemented

### 🎯 Frontend (Ready to Implement)
- [ ] Create dashboard API client (use examples in this guide)
- [ ] Implement dashboard components (Admin/Manager views)
- [ ] Add error handling and loading states
- [ ] Implement caching strategy
- [ ] Add real-time updates (optional)

### 🧪 Testing (Ready to Implement)
- [ ] Test API endpoints with curl/Postman
- [ ] Write unit tests for dashboard service
- [ ] Write integration tests for API endpoints
- [ ] Test role-based access control
- [ ] Performance testing for large datasets

---

## 🎉 Summary

This guide provides everything needed to implement and use the Dashboard API effectively in your Tendly HRMS system. The backend is fully implemented and ready to use. Follow the frontend examples to create your dashboard interface!
