# UAE Leave Expiry - Frontend Implementation Guide

**For:** Frontend Developers (React/Angular/Vue)  
**Date:** October 14, 2025  
**Backend Version:** v2.0 (UAE Leave Expiry)

---

## 📋 Overview

The backend now supports **automatic leave expiry calculation** for UAE employees. When leave is allocated, the system automatically sets:
- **Allocation Date** = Today (or specified date)
- **Expiry Date** = Allocation Date + 1 year

This guide shows you how to integrate these changes in the frontend.

---

## 🆕 New Fields Added

### **LeaveSummary Interface Update**

```typescript
// Each leave category (annual, sick, compOff, etc.) now has:
interface LeaveCategoryDetail {
  alloted: number;
  availed: number;
  remaining: number;
  leaveRequests: string[];
  
  // 🆕 NEW FIELDS FOR UAE
  allocationDate?: string;      // ISO date string
  expiryDate?: string;           // ISO date string
  originalExpiryDate?: string;   // ISO date string (for audit)
  manuallyAdjusted?: boolean;    // Flag: was expiry manually changed?
}

interface LeaveSummary {
  userId: string;
  year: number;
  annual: LeaveCategoryDetail;
  sick: LeaveCategoryDetail;
  compOff: LeaveCategoryDetail;
  otherPaid: LeaveCategoryDetail;
  otherUnpaid: LeaveCategoryDetail;
  lossOfPay: LeaveCategoryDetail;
}
```

---

## 🔌 API Changes

### **1. Allocate Leave (POST /leave-summary/allotments)**

#### **Request - Old Format (Still Works)**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "year": 2025,
  "annual": 30,
  "sick": 15
}
```

#### **Request - New Format (With Allocation Dates)**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "year": 2025,
  "annual": 30,
  "sick": 15,
  
  // 🆕 OPTIONAL: Specify allocation dates
  "annualAllocationDate": "2025-10-14T00:00:00.000Z",
  "sickAllocationDate": "2025-10-14T00:00:00.000Z"
}
```

**New Optional Fields:**
- `annualAllocationDate` (string, ISO date)
- `sickAllocationDate` (string, ISO date)
- `compOffAllocationDate` (string, ISO date)
- `otherPaidAllocationDate` (string, ISO date)
- `otherUnpaidAllocationDate` (string, ISO date)

---

#### **Response - UAE Employee**
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "year": 2025,
    "annual": {
      "alloted": 30,
      "availed": 0,
      "remaining": 30,
      "leaveRequests": [],
      
      // 🆕 NEW FIELDS (UAE only)
      "allocationDate": "2025-10-14T00:00:00.000Z",
      "expiryDate": "2026-10-14T00:00:00.000Z",
      "originalExpiryDate": "2026-10-14T00:00:00.000Z",
      "manuallyAdjusted": false
    },
    "sick": {
      "alloted": 15,
      "availed": 0,
      "remaining": 15,
      "leaveRequests": [],
      
      // 🆕 NEW FIELDS (UAE only)
      "allocationDate": "2025-10-14T00:00:00.000Z",
      "expiryDate": "2026-10-14T00:00:00.000Z",
      "originalExpiryDate": "2026-10-14T00:00:00.000Z",
      "manuallyAdjusted": false
    }
  }
}
```

#### **Response - Indian/Other Country Employee**
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439012",
    "year": 2025,
    "annual": {
      "alloted": 30,
      "availed": 0,
      "remaining": 30,
      "leaveRequests": []
      // ⚠️ NO expiry fields (not UAE)
    }
  }
}
```

---

### **2. Get Leave Summary (GET /leave-summary/summary/:userId)**

#### **Request**
```
GET /leave-summary/summary/507f1f77bcf86cd799439011?year=2025
```

#### **Response - UAE Employee**
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "year": 2025,
    "annual": {
      "alloted": 30,
      "availed": 5,
      "remaining": 25,
      "leaveRequests": ["req1", "req2"],
      
      // 🆕 EXPIRY INFORMATION
      "allocationDate": "2025-01-01T00:00:00.000Z",
      "expiryDate": "2026-01-01T00:00:00.000Z",
      "originalExpiryDate": "2026-01-01T00:00:00.000Z",
      "manuallyAdjusted": false
    },
    "sick": {
      "alloted": 15,
      "availed": 2,
      "remaining": 13,
      "leaveRequests": ["req3"],
      
      // 🆕 EXPIRY INFORMATION
      "allocationDate": "2025-01-01T00:00:00.000Z",
      "expiryDate": "2026-01-01T00:00:00.000Z",
      "originalExpiryDate": "2026-01-01T00:00:00.000Z",
      "manuallyAdjusted": false
    }
  }
}
```

---

## 💻 Frontend Implementation Examples

### **Example 1: TypeScript Interface**

```typescript
// types/leave.types.ts
export interface LeaveCategoryDetail {
  alloted: number;
  availed: number;
  remaining: number;
  leaveRequests: string[];
  
  // UAE-specific fields (optional)
  allocationDate?: string;
  expiryDate?: string;
  originalExpiryDate?: string;
  manuallyAdjusted?: boolean;
}

export interface LeaveSummary {
  _id?: string;
  userId: string;
  year: number;
  annual: LeaveCategoryDetail;
  sick: LeaveCategoryDetail;
  compOff: LeaveCategoryDetail;
  otherPaid: LeaveCategoryDetail;
  otherUnpaid: LeaveCategoryDetail;
  lossOfPay: LeaveCategoryDetail;
  createdAt?: string;
  updatedAt?: string;
}

export interface AllocateLeaveRequest {
  userId: string;
  year: number;
  annual?: number;
  sick?: number;
  compOff?: number;
  otherPaid?: number;
  otherUnpaid?: number;
  
  // Optional allocation dates (for UAE)
  annualAllocationDate?: string;
  sickAllocationDate?: string;
  compOffAllocationDate?: string;
  otherPaidAllocationDate?: string;
  otherUnpaidAllocationDate?: string;
}
```

---

### **Example 2: React Component - Display Leave Summary**

```tsx
// components/LeaveSummary.tsx
import React from 'react';
import { format, differenceInDays, isAfter, isBefore } from 'date-fns';

interface Props {
  leaveSummary: LeaveSummary;
  userCountry: 'IN' | 'AE' | string;
}

export const LeaveSummaryCard: React.FC<Props> = ({ leaveSummary, userCountry }) => {
  const { annual } = leaveSummary;
  
  // Helper: Check if expiry is approaching (within 30 days)
  const isExpiryApproaching = (expiryDate: string) => {
    const daysUntilExpiry = differenceInDays(new Date(expiryDate), new Date());
    return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  };
  
  // Helper: Check if expired
  const isExpired = (expiryDate: string) => {
    return isBefore(new Date(expiryDate), new Date());
  };
  
  // Helper: Get status color
  const getExpiryStatusColor = (expiryDate: string) => {
    if (isExpired(expiryDate)) return 'red';
    if (isExpiryApproaching(expiryDate)) return 'orange';
    return 'green';
  };

  return (
    <div className="leave-summary-card">
      <h3>Annual Leave</h3>
      
      <div className="leave-stats">
        <div>Allocated: {annual.alloted}</div>
        <div>Availed: {annual.availed}</div>
        <div>Remaining: {annual.remaining}</div>
      </div>
      
      {/* 🆕 UAE-SPECIFIC: Show Expiry Information */}
      {userCountry === 'AE' && annual.expiryDate && (
        <div className="expiry-info">
          <div className="expiry-section">
            <label>Allocation Date:</label>
            <span>{format(new Date(annual.allocationDate!), 'dd MMM yyyy')}</span>
          </div>
          
          <div className="expiry-section">
            <label>Expiry Date:</label>
            <span style={{ color: getExpiryStatusColor(annual.expiryDate) }}>
              {format(new Date(annual.expiryDate), 'dd MMM yyyy')}
              
              {/* Show warning badges */}
              {isExpired(annual.expiryDate) && (
                <span className="badge badge-danger">Expired</span>
              )}
              {isExpiryApproaching(annual.expiryDate) && !isExpired(annual.expiryDate) && (
                <span className="badge badge-warning">Expiring Soon</span>
              )}
            </span>
          </div>
          
          <div className="expiry-section">
            <label>Days Until Expiry:</label>
            <span>
              {Math.max(0, differenceInDays(new Date(annual.expiryDate), new Date()))} days
            </span>
          </div>
          
          {/* Show if manually adjusted */}
          {annual.manuallyAdjusted && (
            <div className="manual-adjustment-info">
              <span className="badge badge-info">Manually Adjusted</span>
              <small>
                Original Expiry: {format(new Date(annual.originalExpiryDate!), 'dd MMM yyyy')}
              </small>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

---

### **Example 3: React Component - Allocate Leave Form**

```tsx
// components/AllocateLeaveForm.tsx
import React, { useState } from 'react';
import { format } from 'date-fns';

interface Props {
  userId: string;
  userCountry: 'IN' | 'AE' | string;
  onSubmit: (data: AllocateLeaveRequest) => Promise<void>;
}

export const AllocateLeaveForm: React.FC<Props> = ({ userId, userCountry, onSubmit }) => {
  const [annualLeave, setAnnualLeave] = useState<number>(0);
  const [sickLeave, setSickLeave] = useState<number>(0);
  
  // 🆕 NEW: Allocation dates (for UAE only)
  const [annualAllocationDate, setAnnualAllocationDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [sickAllocationDate, setSickAllocationDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload: AllocateLeaveRequest = {
      userId,
      year: new Date().getFullYear(),
      annual: annualLeave,
      sick: sickLeave,
    };
    
    // 🆕 UAE ONLY: Include allocation dates
    if (userCountry === 'AE') {
      if (annualLeave > 0) {
        payload.annualAllocationDate = new Date(annualAllocationDate).toISOString();
      }
      if (sickLeave > 0) {
        payload.sickAllocationDate = new Date(sickAllocationDate).toISOString();
      }
    }
    
    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3>Allocate Leave for {new Date().getFullYear()}</h3>
      
      {/* Annual Leave */}
      <div className="form-group">
        <label>Annual Leave (days)</label>
        <input
          type="number"
          min="0"
          value={annualLeave}
          onChange={(e) => setAnnualLeave(Number(e.target.value))}
        />
      </div>
      
      {/* 🆕 UAE ONLY: Allocation Date for Annual Leave */}
      {userCountry === 'AE' && annualLeave > 0 && (
        <div className="form-group">
          <label>Annual Leave Allocation Date</label>
          <input
            type="date"
            value={annualAllocationDate}
            onChange={(e) => setAnnualAllocationDate(e.target.value)}
          />
          <small className="form-text">
            Expiry will be automatically set to: {' '}
            {format(
              new Date(new Date(annualAllocationDate).setFullYear(
                new Date(annualAllocationDate).getFullYear() + 1
              )),
              'dd MMM yyyy'
            )}
          </small>
        </div>
      )}
      
      {/* Sick Leave */}
      <div className="form-group">
        <label>Sick Leave (days)</label>
        <input
          type="number"
          min="0"
          value={sickLeave}
          onChange={(e) => setSickLeave(Number(e.target.value))}
        />
      </div>
      
      {/* 🆕 UAE ONLY: Allocation Date for Sick Leave */}
      {userCountry === 'AE' && sickLeave > 0 && (
        <div className="form-group">
          <label>Sick Leave Allocation Date</label>
          <input
            type="date"
            value={sickAllocationDate}
            onChange={(e) => setSickAllocationDate(e.target.value)}
          />
          <small className="form-text">
            Expiry will be automatically set to: {' '}
            {format(
              new Date(new Date(sickAllocationDate).setFullYear(
                new Date(sickAllocationDate).getFullYear() + 1
              )),
              'dd MMM yyyy'
            )}
          </small>
        </div>
      )}
      
      <button type="submit" className="btn btn-primary">
        Allocate Leave
      </button>
    </form>
  );
};
```

---

### **Example 4: API Service Functions**

```typescript
// services/leaveService.ts
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5800';

export const leaveService = {
  /**
   * Get leave summary for a user
   */
  async getLeaveSummary(userId: string, year?: number): Promise<LeaveSummary> {
    const currentYear = year || new Date().getFullYear();
    const response = await axios.get(
      `${API_BASE_URL}/leave-summary/summary/${userId}?year=${currentYear}`,
      { withCredentials: true }
    );
    return response.data.data;
  },

  /**
   * Allocate leave to a user
   * 🆕 Now supports allocation dates for UAE employees
   */
  async allocateLeave(data: AllocateLeaveRequest): Promise<LeaveSummary> {
    const response = await axios.post(
      `${API_BASE_URL}/leave-summary/allotments`,
      data,
      { withCredentials: true }
    );
    return response.data.data;
  },

  /**
   * Get leave summaries for multiple users
   */
  async getMultipleUserSummaries(
    userIds: string[],
    year?: number
  ): Promise<LeaveSummary[]> {
    const currentYear = year || new Date().getFullYear();
    const response = await axios.get(
      `${API_BASE_URL}/leave-summary/leave-summaries?userIds=${userIds.join(',')}&year=${currentYear}`,
      { withCredentials: true }
    );
    return response.data;
  }
};
```

---

### **Example 5: Utility Functions**

```typescript
// utils/leaveExpiry.utils.ts
import { differenceInDays, addYears, format } from 'date-fns';

export const leaveExpiryUtils = {
  /**
   * Calculate expiry date (allocation + 1 year)
   */
  calculateExpiryDate(allocationDate: string | Date): Date {
    return addYears(new Date(allocationDate), 1);
  },

  /**
   * Check if leave has expired
   */
  isExpired(expiryDate: string | Date): boolean {
    return differenceInDays(new Date(expiryDate), new Date()) < 0;
  },

  /**
   * Check if expiry is approaching (within specified days)
   */
  isExpiryApproaching(expiryDate: string | Date, warningDays: number = 30): boolean {
    const days = differenceInDays(new Date(expiryDate), new Date());
    return days > 0 && days <= warningDays;
  },

  /**
   * Get days until expiry
   */
  getDaysUntilExpiry(expiryDate: string | Date): number {
    return Math.max(0, differenceInDays(new Date(expiryDate), new Date()));
  },

  /**
   * Format expiry status for display
   */
  getExpiryStatus(expiryDate: string | Date): {
    status: 'expired' | 'approaching' | 'valid';
    message: string;
    color: 'red' | 'orange' | 'green';
  } {
    if (this.isExpired(expiryDate)) {
      return {
        status: 'expired',
        message: 'Leave has expired',
        color: 'red'
      };
    }
    
    if (this.isExpiryApproaching(expiryDate)) {
      const days = this.getDaysUntilExpiry(expiryDate);
      return {
        status: 'approaching',
        message: `Expires in ${days} days`,
        color: 'orange'
      };
    }
    
    const days = this.getDaysUntilExpiry(expiryDate);
    return {
      status: 'valid',
      message: `${days} days remaining`,
      color: 'green'
    };
  },

  /**
   * Format date for display
   */
  formatDate(date: string | Date, formatStr: string = 'dd MMM yyyy'): string {
    return format(new Date(date), formatStr);
  }
};
```

---

## 🎨 UI/UX Recommendations

### **1. Leave Summary Display (UAE Employees)**

```
┌─────────────────────────────────────────┐
│ Annual Leave                            │
├─────────────────────────────────────────┤
│ Allocated: 30 days                      │
│ Availed: 5 days                         │
│ Remaining: 25 days                      │
│                                         │
│ 🆕 Allocation Date: 01 Jan 2025         │
│ 🆕 Expiry Date: 01 Jan 2026             │
│ 🆕 Days Until Expiry: 78 days           │
│                                         │
│ [⚠️ Expiring Soon] (if < 30 days)       │
│ [❌ Expired] (if past expiry)           │
│ [ℹ️ Manually Adjusted] (if adjusted)    │
└─────────────────────────────────────────┘
```

### **2. Expiry Status Colors**

| Status | Days Until Expiry | Color | Icon |
|--------|------------------|-------|------|
| Valid | > 30 days | 🟢 Green | ✅ |
| Approaching | 1-30 days | 🟠 Orange | ⚠️ |
| Expired | < 0 days | 🔴 Red | ❌ |

### **3. Admin Dashboard - Expiry Alerts**

```tsx
// Example: Dashboard Widget
export const LeaveExpiryAlerts: React.FC = () => {
  const [expiringLeaves, setExpiringLeaves] = useState([]);
  
  // Fetch leaves expiring in next 30 days
  useEffect(() => {
    // API call to get leaves with expiry < 30 days
  }, []);
  
  return (
    <div className="expiry-alerts-widget">
      <h3>⚠️ Leave Expiring Soon (UAE Employees)</h3>
      <ul>
        {expiringLeaves.map(item => (
          <li key={item.userId}>
            {item.userName} - {item.leaveType} expires in {item.daysRemaining} days
          </li>
        ))}
      </ul>
    </div>
  );
};
```

---

## 🧪 Testing Checklist

### **Frontend Testing**

- [ ] Display leave summary for UAE employee (shows expiry fields)
- [ ] Display leave summary for Indian employee (no expiry fields)
- [ ] Allocate leave form shows allocation date picker for UAE
- [ ] Allocate leave form hides allocation date picker for India
- [ ] Expiry date preview shown when allocation date changes
- [ ] Expired leaves show red badge
- [ ] Expiring leaves show orange warning
- [ ] Manually adjusted leaves show info badge
- [ ] API calls include allocation dates for UAE
- [ ] API calls exclude allocation dates for India

---

## 📊 Conditional Rendering Logic

```typescript
// When to show UAE-specific fields:
const shouldShowExpiryFields = (user: User, leaveCategory: LeaveCategoryDetail) => {
  return user.country === 'AE' && !!leaveCategory.expiryDate;
};

// Usage in component:
{shouldShowExpiryFields(user, leaveSummary.annual) && (
  <ExpiryInformation leaveCategory={leaveSummary.annual} />
)}
```

---

## 🚨 Error Handling

```typescript
// Handle API errors
try {
  const summary = await leaveService.allocateLeave(data);
  toast.success('Leave allocated successfully');
} catch (error: any) {
  if (error.response?.status === 400) {
    toast.error(error.response.data.error.message);
  } else {
    toast.error('Failed to allocate leave');
  }
}
```

---

## 📱 Mobile Responsive Design

```css
/* Expiry information should be responsive */
.expiry-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 4px;
  margin-top: 16px;
}

.expiry-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 8px;
}

.badge-danger {
  background: #dc3545;
  color: white;
}

.badge-warning {
  background: #ffc107;
  color: black;
}

.badge-info {
  background: #17a2b8;
  color: white;
}

@media (max-width: 768px) {
  .expiry-section {
    flex-direction: column;
    align-items: flex-start;
  }
}
```

---

## ✅ Implementation Checklist

- [ ] Update TypeScript interfaces with new fields
- [ ] Update API service to handle allocation dates
- [ ] Update leave summary display component
- [ ] Add expiry information section (UAE only)
- [ ] Update allocate leave form (add date pickers for UAE)
- [ ] Add expiry status badges (expired, approaching)
- [ ] Add utility functions for date calculations
- [ ] Add conditional rendering based on country
- [ ] Add expiry alerts/notifications (optional)
- [ ] Update unit tests
- [ ] Test with UAE employee data
- [ ] Test with Indian employee data
- [ ] Verify responsive design

---

## 🔗 Related Backend Documentation

- **Technical Implementation:** `UAE_LEAVE_EXPIRY_IMPLEMENTATION.md`
- **Quick Start Guide:** `UAE_LEAVE_EXPIRY_QUICK_GUIDE.md`
- **Changes Summary:** `UAE_LEAVE_EXPIRY_CHANGES_SUMMARY.md`

---

## 📞 Support

**Questions?** Contact Backend Team  
**API Documentation:** Swagger - `https://your-api-url/documentation`  
**Last Updated:** October 14, 2025

